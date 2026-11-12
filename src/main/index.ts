import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  IpcMainInvokeEvent,
  Menu,
  nativeImage,
  protocol,
  Tray,
  Notification,
  shell,
  Event,
} from 'electron';
import childProcess from 'child_process';
import { ZomeCallSigner } from '@holochain/hc-spin-rust-utils';
import contextMenu from 'electron-context-menu';
import { encode } from '@msgpack/msgpack';
import { sha512 } from 'js-sha512';
import {
  CallZomeRequest,
  CallZomeRequestSigned,
  getNonceExpiration,
  randomNonce,
} from '@holochain/client';
import { Command } from 'commander';
import semver from 'semver';

import { breakingVersion, KangarooFileSystem } from './filesystem';
import { ModelManager } from './modelManager';
import { KangarooEmitter } from './eventEmitter';
import { createUpdaterLogger, setupLogs } from './logs';
import { HolochainManager } from './holochainManager';
import { createSplashWindow } from './windows';
import { KANGAROO_CONFIG, NOTIFICATIONS_ICON_PATH, RELEASES_URL, SYSTRAY_ICON_PATH } from './const';
import { kangarooMenu } from './menu';
import { validateArgs } from './cli';
import { autoUpdater, UpdateCheckResult } from '@matthme/electron-updater';
import { launch } from './launch';
import { PasswordType, SplashScreenType } from './types';

// Read CLI options

const kangarooCli = new Command();

kangarooCli
  .name(KANGAROO_CONFIG.productName)
  .description(`Run ${KANGAROO_CONFIG.productName} via the command line`)
  .version(KANGAROO_CONFIG.version)
  .option(
    '-p, --profile <string>',
    `Runs ${KANGAROO_CONFIG.productName} with a custom profile with its own dedicated data store.`,
  )
  .option(
    '-n, --network-seed <string>',
    'If this is the first time running kangaroo with the given profile, this installs the happ with the provided network seed.',
  )
  .option(
    '--holochain-path <path>',
    `Runs ${KANGAROO_CONFIG.productName} with the holochain binary at the provided path. Use with caution since this may potentially corrupt your databases if the binary you use is not compatible with existing databases.`,
  )
  .option(
    '--lair-path <path>',
    `Runs the ${KANGAROO_CONFIG.productName} with the lair binary at the provided path. Use with caution since this may potentially corrupt your databases if the binary you use is not compatible with existing databases.`,
  )
  .option('--holochain-rust-log <string>', 'RUST_LOG value to pass to the holochain binary')
  .option('--holochain-wasm-log <string>', 'WASM_LOG value to pass to the holochain binary')
  .option('--lair-rust-log <string>', 'RUST_LOG value to pass to the lair keystore binary')
  // ITEM 7.14: THESE NOW PERSIST, AND THE TWO THAT DID NOTHING ARE GONE.
  //
  // `--bootstrap-url` and `--relay-url` used to apply for one launch only, so
  // moving the network meant either telling every user to pass a flag every
  // time or rebuilding the bundle. Passing one now WRITES it to
  // `network-override.json` in the profile's data directory and later launches
  // reuse it; `--reset-network-config` is the way back to the built-in values.
  //
  // `-s, --signal-url` and `--ice-urls` were removed rather than persisted.
  // They were declared here and read by NOTHING — leftovers from the tx5
  // networking this template predates. Holochain 0.7 uses iroh, and the
  // conductor config written by `holochainManager` has only `bootstrap_url`
  // and `relay_url`. Accepting a flag and silently discarding it is worse
  // than not having it, because it looks like it worked.
  .option(
    '-b, --bootstrap-url <url>',
    'URL of the bootstrap server to use. Persisted for this profile; use --reset-network-config to go back to the built-in default.',
  )
  .option(
    '--relay-url <url>',
    'URL of the relay server to use. Persisted for this profile; use --reset-network-config to go back to the built-in default.',
  )
  .option(
    '--reset-network-config',
    'Forget any stored --bootstrap-url and --relay-url for this profile and use the values built into this build.',
  )
  .option(
    '--print-holochain-logs',
    'Print holochain logs directly to the terminal (they will be still written to the logfile as well)',
  );

// electron-builder's AppImage launcher injects --no-sandbox as a fallback when it can't
// verify unprivileged user namespaces are available; Chromium already consumes it natively,
// so strip it here before Commander sees an option it doesn't own.
//
// Commander only auto-detects the Electron argv convention (packaged apps have no separate
// script path arg, so only 1 leading element instead of node's 2) when parse() is called with
// no arguments at all. Passing our filtered array opts us out of that detection, so we have to
// tell it explicitly via `from: 'electron'` - otherwise it slices off 2 leading elements instead
// of 1 and eats the first real CLI argument along with the executable path.
kangarooCli.parse(
  process.argv.filter((arg) => arg !== '--no-sandbox'),
  { from: 'electron' },
);

const RUN_OPTIONS = validateArgs(kangarooCli.opts());

// Read and validate the config file to check that the content does not contain
// default values

// Check whether lair is initialized or not and if not, decide based on the config
// file whether or not to show the splashscreen or use a default password

if (!app.isPackaged) {
  app.setName(KANGAROO_CONFIG.appId + '-dev');
}

contextMenu({
  showSaveImageAs: true,
  showSearchWithGoogle: false,
  showInspectElement: true,
  append: (_defaultActions, _parameters, browserWindow) => [
    {
      label: 'Reload',
      click: () => (browserWindow as BrowserWindow).reload(),
    },
  ],
});

const KANGAROO_FILESYSTEM = KangarooFileSystem.connect(app, RUN_OPTIONS.profile);

const KANGAROO_EMITTER = new KangarooEmitter();

setupLogs(KANGAROO_EMITTER, KANGAROO_FILESYSTEM, RUN_OPTIONS.printHolochainLogs);

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'webhapp',
    privileges: { standard: true, secure: true, stream: true },
  },
]);

const handleSignZomeCall = async (
  _e: IpcMainInvokeEvent,
  request: CallZomeRequest,
): Promise<CallZomeRequestSigned> => {
  if (!ZOME_CALL_SIGNER) throw new Error('Zome call signer undefined.');
  if (!request.provenance)
    return Promise.reject(
      'Call zome request has provenance field not set. This should be set by the js-client.',
    );

  const zomeCallToSign: CallZomeRequest = {
    cell_id: request.cell_id,
    zome_name: request.zome_name,
    fn_name: request.fn_name,
    payload: encode(request.payload),
    provenance: request.provenance,
    nonce: await randomNonce(),
    expires_at: getNonceExpiration(),
  };

  const zomeCallBytes = encode(zomeCallToSign);
  const bytesHash = sha512.array(zomeCallBytes);

  const signature: number[] = await ZOME_CALL_SIGNER.signZomeCall(
    bytesHash,
    Array.from(request.provenance),
  );

  const signedZomeCall: CallZomeRequestSigned = {
    bytes: zomeCallBytes,
    signature: Uint8Array.from(signature),
  };

  return signedZomeCall;
};

let ZOME_CALL_SIGNER: ZomeCallSigner | undefined;
let HOLOCHAIN_MANAGER: HolochainManager | undefined;
let LAIR_HANDLE: childProcess.ChildProcessWithoutNullStreams | undefined;
/** The compose-time adversary's weights — epistemic-happ open-work 6.10.
 *
 * Constructed eagerly and cheaply: it touches no disk until asked, so an
 * install that never opens the compose form pays nothing for it. */
const MODEL_MANAGER = new ModelManager();
let MAIN_WINDOW: BrowserWindow | undefined | null;
let SPLASH_SCREEN_WINDOW: BrowserWindow | undefined;
let IS_APP_QUITTING = false;

Menu.setApplicationMenu(kangarooMenu(KANGAROO_FILESYSTEM));

app.whenReady().then(async () => {
  /**
   * Figure out which splashscreen to show and whether to start holochain immediately.
   */
  let splashScreenType: SplashScreenType;
  let startImmediately = false;

  if (KANGAROO_CONFIG.passwordMode === 'no-password') {
    splashScreenType = SplashScreenType.LoadingOnly;
    startImmediately = true;
  } else if (KANGAROO_CONFIG.passwordMode === 'password-required') {
    if (KANGAROO_FILESYSTEM.keystoreInitialized()) {
      splashScreenType = SplashScreenType.EnterPassword;
    } else {
      splashScreenType = SplashScreenType.PasswordSetup;
    }
  } else if (KANGAROO_CONFIG.passwordMode === 'password-optional') {
    const keystoreInitialized = KANGAROO_FILESYSTEM.keystoreInitialized();
    const randomPwExists = KANGAROO_FILESYSTEM.randomPasswordExists();
    if (keystoreInitialized && randomPwExists) {
      splashScreenType = SplashScreenType.LoadingOnly;
      startImmediately = true;
    } else if (keystoreInitialized && !randomPwExists) {
      splashScreenType = SplashScreenType.EnterPassword;
    } else {
      splashScreenType = SplashScreenType.PasswordSetupOtional;
    }
  } else {
    throw new Error(
      `Unexpected setup state.\nKeystore initialized: ${KANGAROO_FILESYSTEM.keystoreInitialized()}.\nPassword mode: ${
        KANGAROO_CONFIG.passwordMode
      }\nRandom pw exists: ${KANGAROO_FILESYSTEM.randomPasswordExists()}`,
    );
  }

  /**
   * IPC handlers
   *
   * Note that any IPC handlers that the splashscreen might be using should be registered
   * before the splashscreen window is created in order to ensure that they are getting
   * registered in time.
   */
  // ------------------------------------------------------------------------------------
  ipcMain.handle('sign-zome-call', handleSignZomeCall);
  ipcMain.handle('exit', () => {
    app.exit(0);
  });
  ipcMain.handle('get-name-and-version', () => ({
    productName: KANGAROO_CONFIG.productName,
    version: KANGAROO_CONFIG.version,
  }));
  // Will be called by the splashscreen UI in the "password-optional"
  // or "user-provided" password modes
  ipcMain.handle('launch', async (_e, passwordInput: PasswordType): Promise<void> => {
    const { lairHandle, holochainManager, mainWindow, zomeCallSigner } = await launch(
      KANGAROO_FILESYSTEM,
      KANGAROO_EMITTER,
      SPLASH_SCREEN_WINDOW,
      passwordInput,
      RUN_OPTIONS,
    );

    LAIR_HANDLE = lairHandle;
    HOLOCHAIN_MANAGER = holochainManager;
    MAIN_WINDOW = mainWindow;
    ZOME_CALL_SIGNER = zomeCallSigner;

    if (KANGAROO_CONFIG.systray) {
      MAIN_WINDOW.on('close', mainWindowCloseHandler);
    }
  });
  // --- The compose-time adversary's model (epistemic-happ 6.10) ------
  //
  // THE DOWNLOAD IS USER-TRIGGERED AND THAT IS NOT A DETAIL. The weights are
  // ~2.1GB; pulling them unasked on first launch would be a large unannounced
  // transfer on somebody's connection, and the whole reason this feature runs
  // locally is that the author's drafts are theirs. So nothing here starts on
  // its own: the renderer asks.
  ipcMain.handle('model-status', () => MODEL_MANAGER.status());
  ipcMain.handle('model-download', async (event) => {
    // Progress is PUSHED rather than polled, so a progress bar is smooth
    // without the renderer waking up to ask. The sender is used rather than a
    // stored window handle: if the window has gone, so has the thing that
    // wanted the bar, and `send` on a destroyed sender is a no-op.
    await MODEL_MANAGER.download((status) => {
      if (!event.sender.isDestroyed()) event.sender.send('model-progress', status);
    });
    return MODEL_MANAGER.status();
  });
  ipcMain.handle('model-cancel', () => {
    MODEL_MANAGER.cancel();
    return MODEL_MANAGER.status();
  });
  // SERVING IS ALSO EXPLICIT. `start` refuses with `runtime-missing` while the
  // inference runtime is unpinned — see modelManager.ts's header — and the
  // happ's UI already renders that honestly as "no model is answering"
  // rather than as a draft nothing objected to.
  ipcMain.handle('model-serve', () => MODEL_MANAGER.start());

  ipcMain.handle('open-logs', async () => KANGAROO_FILESYSTEM.openLogs());
  ipcMain.handle('export-logs', async () => KANGAROO_FILESYSTEM.exportLogs());
  (ipcMain.handle('factory-reset', async () => {
    const userDecision = await dialog.showMessageBox({
      title: 'Factory Reset',
      type: 'warning',
      buttons: ['Cancel', 'Confirm'],
      defaultId: 0,
      cancelId: 0,
      message: `Are you sure you want to factory reset ${KANGAROO_CONFIG.productName}? This will delete all ${KANGAROO_CONFIG.productName} data related to the current profile (${KANGAROO_FILESYSTEM.profile}). This cannot be undone.`,
    });
    if (userDecision.response === 1) {
      // Close all windows
      if (MAIN_WINDOW) MAIN_WINDOW.close();
      if (SPLASH_SCREEN_WINDOW) SPLASH_SCREEN_WINDOW.close();
      // Kill holochain and lair
      if (LAIR_HANDLE) LAIR_HANDLE.kill();
      if (HOLOCHAIN_MANAGER) HOLOCHAIN_MANAGER.processHandle.kill();
      // The server and any download, but NOT the weights: `modelsDir` sits
      // outside the `breakingVersion` scope `factoryReset` clears, on purpose
      // — a model is not network state and re-downloading gigabytes is not
      // part of resetting a conductor. The space is therefore NOT reclaimed by
      // a factory reset, which `KangarooFileSystem.modelsDir` records as the
      // honest cost of that choice.
      MODEL_MANAGER.stop();
      // Remove all data
      await KANGAROO_FILESYSTEM.factoryReset();
      // restart App
      const options: Electron.RelaunchOptions = {
        args: process.argv,
      };
      // https://github.com/electron-userland/electron-builder/issues/1727#issuecomment-769896927
      if (process.env.APPIMAGE) {
        console.log('process.execPath: ', process.execPath);
        options.args!.unshift('--appimage-extract-and-run');
        options.execPath = process.env.APPIMAGE;
      }
      app.relaunch(options);
      app.quit();
    }
  }),
    // ------------------------------------------------------------------------------------

    (SPLASH_SCREEN_WINDOW = createSplashWindow(splashScreenType)));
  SPLASH_SCREEN_WINDOW.on('closed', () => {
    // We need to drop the variable here to be able to distinguish
    // in other places whether the splah screen window is still open
    // or not.
    SPLASH_SCREEN_WINDOW = undefined;
  });

  if (KANGAROO_CONFIG.systray) {
    const systray = new Tray(SYSTRAY_ICON_PATH);
    systray.setToolTip(KANGAROO_CONFIG.productName);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open',
        type: 'normal',
        click() {
          if (SPLASH_SCREEN_WINDOW) {
            SPLASH_SCREEN_WINDOW.show();
          } else if (MAIN_WINDOW) {
            MAIN_WINDOW.show();
          }
        },
      },
      {
        label: 'Restart',
        type: 'normal',
        click() {
          const options: Electron.RelaunchOptions = {
            args: process.argv,
          };
          // https://github.com/electron-userland/electron-builder/issues/1727#issuecomment-769896927
          if (process.env.APPIMAGE) {
            console.log('process.execPath: ', process.execPath);
            options.args?.unshift('--appimage-extract-and-run');
            options.execPath = process.env.APPIMAGE;
          }
          app.relaunch(options);
          app.quit();
        },
      },
      {
        label: 'Quit',
        type: 'normal',
        click() {
          app.quit();
        },
      },
    ]);

    systray.setContextMenu(contextMenu);
  }

  /**
   * Checking for app updates
   */
  if (app.isPackaged && KANGAROO_CONFIG.autoUpdates) {
    // WRAPPED SO THAT NO UPDATE FAILURE CAN STOP THE APP FROM STARTING.
    //
    // Every statement below used to sit directly in this `whenReady` callback,
    // with `await autoUpdater.downloadUpdate()` unguarded. A rejection there
    // does not merely skip the update: it abandons the rest of this callback,
    // and the `launch()` call that starts the conductor comes AFTER it. So the
    // one case where a participant most needs the app — they accepted an update
    // that then failed — was also the case where it would not start. An update
    // is an optional improvement to a working app and is now treated as one.
    try {
      await offerUpdateIfAvailable();
    } catch (e) {
      console.error('Update flow failed, continuing to launch the app: ', e);
    }
  }

  /**
   * If the conditions are fulfilled we can immediately start holochain here,
   * otherwise we start holochain when the corresponding splashscreen UI invokes
   * the 'launch' IPC command
   */
  if (startImmediately) {
    const { lairHandle, holochainManager, mainWindow, zomeCallSigner } = await launch(
      KANGAROO_FILESYSTEM,
      KANGAROO_EMITTER,
      SPLASH_SCREEN_WINDOW,
      { type: 'random' },
      RUN_OPTIONS,
    );

    LAIR_HANDLE = lairHandle;
    HOLOCHAIN_MANAGER = holochainManager;
    MAIN_WINDOW = mainWindow;
    ZOME_CALL_SIGNER = zomeCallSigner;

    if (KANGAROO_CONFIG.systray) {
      MAIN_WINDOW.on('close', mainWindowCloseHandler);
    }
  }
});

/**
 * Offer the latest semver-compatible release, and account for it either way.
 *
 * WHY THIS IS A FUNCTION WITH THIS MUCH COMMENT ON IT. A pilot participant
 * reported, in these words: *"App shows a window stating new version available.
 * Install and restart. Clicking this - does nothing. No update happens."* Every
 * part of that is a thing this code did:
 *
 *  1. `electron-updater`'s logger defaults to `console`, and the one `error`
 *     listener it registers for itself only calls that logger. In a packaged
 *     app nobody is reading stdout, and the profile log file that "Export logs"
 *     ships had no updater line in it at all — so a failed update left no trace
 *     on the participant's machine OR here. It now logs to that file.
 *  2. Nothing was ever shown to the user after they accepted. A rejected
 *     download was indistinguishable from a successful one that had not
 *     finished, and both were indistinguishable from a button that did nothing.
 *     A failure now says so, and says where to get the version by hand.
 *  3. The download is 140–200MB depending on platform, with no indication that
 *     anything was happening. "Does nothing" was the honest reading of a
 *     working download, too. The offer now says what it is about to do, and the
 *     progress goes on the taskbar/dock item and into the log.
 *
 * WHAT IS STILL NOT KNOWN, and is not pretended away here: which of the install
 * paths actually failed for that participant. Linux/AppImage was driven end to
 * end on 2026-11-12 and updates correctly, so the failure is on macOS or
 * Windows. macOS is the suspect — `macOSCodeSigning: false`, and Squirrel.Mac
 * will not swap an unsigned bundle — but suspecting is not measuring, and the
 * point of (1) is that the next report arrives with the answer attached.
 */
async function offerUpdateIfAvailable(): Promise<void> {
  const updaterLogger = createUpdaterLogger(KANGAROO_FILESYSTEM);
  autoUpdater.logger = updaterLogger;
  autoUpdater.allowPrerelease = true;
  autoUpdater.autoDownload = false;

  let updateCheckResult: UpdateCheckResult | null | undefined;

  try {
    // Note that the official electron-updater in the checkForUpdates() step by default only
    // fetches the latest release on github, regardless of whether it is semver compatible.
    // As a consequence, app versions belonging to an older semver line would stop receiving updates
    // here since we deliberately reject semver incompatible updates below (see the "Versioning" section
    // in the README). Therefore, we're using a fork of electron-builder (at the time of writing
    // https://github.com/holochain/electron-builder/) such that checkForUpdates() still gives
    // us latest semver compatible release, even if that release is not the highest version overall.
    updateCheckResult = await autoUpdater.checkForUpdates();
  } catch (e) {
    // DELIBERATELY SILENT TO THE USER, AND LOUD IN THE LOG. A check that cannot
    // reach GitHub is the ordinary offline start, and this app is meant to work
    // offline — a dialog about it would be noise on every flight. The dialogs
    // below are only for a failure that follows somebody actually asking for
    // the update.
    updaterLogger.warn(`Failed to check for updates: ${e}`);
    return;
  }

  updaterLogger.info(
    `Update check result: ${JSON.stringify(updateCheckResult?.updateInfo ?? null)}`,
  );

  // Double-check that the release we got (if any) is semver compatible, as we only install semver compatible updates.
  const appVersion = app.getVersion();
  if (
    !updateCheckResult ||
    breakingVersion(updateCheckResult.updateInfo.version) !== breakingVersion(appVersion) ||
    !semver.gt(updateCheckResult.updateInfo.version, appVersion)
  ) {
    return;
  }

  const newVersion = updateCheckResult.updateInfo.version;
  const downloadBytes = updateCheckResult.updateInfo.files?.[0]?.size;
  const downloadSize =
    typeof downloadBytes === 'number' && downloadBytes > 0
      ? `about ${Math.round(downloadBytes / 1_000_000)}MB`
      : 'a few hundred megabytes';

  const userDecision = await dialog.showMessageBox({
    title: 'Update Available',
    type: 'question',
    buttons: ['Deny', 'Install and Restart'],
    defaultId: 0,
    cancelId: 0,
    message: `A new compatible version of ${KANGAROO_CONFIG.productName} is available (${newVersion}). Do you want to install it?`,
    // SAYING WHAT THE BUTTON IS ABOUT TO DO IS HALF THE BUG FIX. A download of
    // this size over a domestic connection is minutes, and the previous dialog
    // promised a restart without saying anything had to be fetched first.
    detail: `This downloads ${downloadSize} and then restarts the app by itself. It can take several minutes, and nothing else needs doing in the meantime.\n\nYour data, your key and the network you are on all carry over.`,
  });

  if (userDecision.response !== 1) {
    updaterLogger.info(`User declined the update to ${newVersion}.`);
    return;
  }

  let reportedFailure = false;
  const reportFailure = (summary: string, cause: unknown): void => {
    const detail = cause instanceof Error ? (cause.stack ?? cause.message) : String(cause);
    updaterLogger.error(`${summary} ${detail}`);

    // ONE REPORT PER START. The same failure can arrive twice — once as a
    // rejected `downloadUpdate()` and once through the updater's `error` event —
    // and two identical dialogs would read as two separate faults.
    if (reportedFailure) return;
    reportedFailure = true;

    if (SPLASH_SCREEN_WINDOW && !SPLASH_SCREEN_WINDOW.isDestroyed()) {
      SPLASH_SCREEN_WINDOW.setProgressBar(-1);
    }

    const buttons = RELEASES_URL ? ['Continue', 'Open the download page'] : ['Continue'];
    const choice = dialog.showMessageBoxSync({
      title: 'The update could not be installed',
      type: 'warning',
      buttons,
      defaultId: buttons.length - 1,
      cancelId: 0,
      message: `${KANGAROO_CONFIG.productName} ${appVersion} could not install the update to ${newVersion} automatically.`,
      detail: [
        summary,
        '',
        detail,
        '',
        RELEASES_URL
          ? 'You can install the new version by hand from the download page. Installing it over the top of this one keeps your data, your key and the network you are on — nothing is reset by updating that way.'
          : 'This version keeps working, and the new one can be installed by hand from the project’s releases page.',
        '',
        'If you report this, "Export logs" in the system tray menu now includes the updater’s own account of what went wrong.',
      ].join('\n'),
    });

    if (RELEASES_URL && choice === 1) {
      shell.openExternal(RELEASES_URL).catch((e) => updaterLogger.warn(`openExternal: ${e}`));
    }
  };

  // REGISTERED ONLY NOW, AFTER THE USER HAS ASKED FOR THE UPDATE. The updater
  // emits `error` for a failed check too (`AppUpdater.js:230`), and that is the
  // offline case this function returns quietly on above — a listener registered
  // any earlier would turn every start without a network into a dialog.
  autoUpdater.on('error', (e) => reportFailure('The updater reported an error.', e));

  autoUpdater.on('download-progress', (progress) => {
    // BEST EFFORT, AND IT IS THE ONLY VISIBLE SIGN DURING THE DOWNLOAD: the
    // taskbar item on Windows, the dock icon on macOS, and on Linux only under
    // a launcher that implements the Unity API. The log line below is the part
    // that works everywhere.
    if (SPLASH_SCREEN_WINDOW && !SPLASH_SCREEN_WINDOW.isDestroyed()) {
      SPLASH_SCREEN_WINDOW.setProgressBar(progress.percent / 100);
    }
    updaterLogger.info(
      `Downloading ${newVersion}: ${Math.round(progress.percent)}% (${Math.round(
        progress.transferred / 1_000_000,
      )}MB of ${Math.round(progress.total / 1_000_000)}MB)`,
    );
  });

  if (Notification.isSupported()) {
    new Notification({
      title: `Downloading ${KANGAROO_CONFIG.productName} ${newVersion}`,
      body: `${downloadSize}. The app restarts itself when it is ready.`,
    }).show();
  }

  try {
    // Downloading means that with the next start of the application it's automatically going to be installed
    autoUpdater.on('update-downloaded', () => autoUpdater.quitAndInstall());
    await autoUpdater.downloadUpdate();
  } catch (e) {
    reportFailure('The new version could not be downloaded and installed.', e);
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  app.quit();
  // if (process.platform !== 'darwin') {
  //   app.quit()
  // }
});

// This is here to distinguish in the 'close' listener of the main window,
// for the case that a systray icon is used, whether the main window should
// indeed be closed (if the app is attempted to be quit via the systray menu)
// or only hidden
app.on('before-quit', () => {
  IS_APP_QUITTING = true;
});

app.on('quit', () => {
  if (LAIR_HANDLE) {
    LAIR_HANDLE.kill();
  }
  if (HOLOCHAIN_MANAGER) {
    HOLOCHAIN_MANAGER.processHandle.kill();
  }
  // The inference server and any download in flight, alongside the other two
  // children. A 2.1GB transfer left running after the window has gone is the
  // kind of thing a user discovers from their data bill.
  MODEL_MANAGER.stop();
});

/**
 * This handler will make sure that the main window only gets hidden instead of
 * closed (to maintain the javascript state) if the systray icon option is
 * used.
 *
 * @param e Window close event
 */
const mainWindowCloseHandler = (e: Event) => {
  if (!IS_APP_QUITTING && MAIN_WINDOW) {
    e.preventDefault();
    MAIN_WINDOW.hide();

    const notificationIcon = nativeImage.createFromPath(NOTIFICATIONS_ICON_PATH);
    new Notification({
      title: `${KANGAROO_CONFIG.productName} keeps running in the background`,
      body: `To close ${KANGAROO_CONFIG.productName} and stop synching with peers, quit from the icon in the system tray.`,
      icon: notificationIcon,
    })
      .on('click', async () => {
        if (MAIN_WINDOW) {
          MAIN_WINDOW.show();
          const response = await dialog.showMessageBox(MAIN_WINDOW, {
            type: 'info',
            message: `${KANGAROO_CONFIG.productName} keeps running in the background if you close the Window.\n\nThis is to keep synchronizing data with peers.\n\nDo you want to quit ${KANGAROO_CONFIG.productName} fully?`,
            buttons: ['Keep Running', 'Quit'],
            defaultId: 0,
            cancelId: 1,
          });
          if (response.response === 1) {
            app.quit();
          }
        }
      })
      .show();
  }
  console.log('Is main window still defined?', MAIN_WINDOW);
};
