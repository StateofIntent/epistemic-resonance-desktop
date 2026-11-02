import * as childProcess from 'child_process';
import { BrowserWindow } from 'electron';
import { KangarooEmitter } from './eventEmitter';
import { KangarooFileSystem } from './filesystem';
import { PasswordType } from './types';
import { RunOptions } from './cli';
import { initializeLairKeystore, launchLairKeystore } from './lairKeystore';
import {
  HAPP_APP_ID,
  HOLOCHAIN_BINARY,
  KANGAROO_CONFIG,
  LAIR_BINARY,
  UI_DIRECTORY,
} from './const';
import { createHappWindow } from './windows';
import { ZomeCallSigner } from '@holochain/hc-spin-rust-utils';
import { HolochainManager } from './holochainManager';
import {
  clearNetworkOverride,
  readNetworkOverride,
  resolveNetworkUrl,
  writeNetworkOverride,
} from './networkConfig';

export async function launch(
  kangarooFs: KangarooFileSystem,
  kangarooEmitter: KangarooEmitter,
  splashscreenWindow: BrowserWindow | undefined,
  passwordInput: PasswordType,
  runOptions: RunOptions
): Promise<{
  lairHandle: childProcess.ChildProcessWithoutNullStreams;
  holochainManager: HolochainManager;
  mainWindow: BrowserWindow;
  zomeCallSigner: ZomeCallSigner;
}> {
  let password: string;
  switch (passwordInput.type) {
    case 'random': {
      password = kangarooFs.readOrCreatePassword();
      break;
    }
    case 'user-provided': {
      password = passwordInput.password;
      break;
    }
  }

  if (!kangarooFs.keystoreInitialized()) {
    if (splashscreenWindow)
      splashscreenWindow.webContents.send(
        'loading-progress-update',
        'Initializing lair keystore...'
      );

    console.log('initializing lair keystore...');
    await initializeLairKeystore(
      runOptions.lairPath ? runOptions.lairPath : LAIR_BINARY,
      kangarooFs.keystoreDir,
      kangarooEmitter,
      password
    );
    console.log('lair keystore initialized.');
  }
  if (splashscreenWindow)
    splashscreenWindow.webContents.send('loading-progress-update', 'Starting lair keystore...');

  const [lairHandle, lairUrl] = await launchLairKeystore(
    runOptions.lairPath ? runOptions.lairPath : LAIR_BINARY,
    kangarooFs.keystoreDir,
    kangarooEmitter,
    password
  );

  const zomeCallSigner = await ZomeCallSigner.connect(lairUrl, password);

  if (splashscreenWindow)
    splashscreenWindow.webContents.send('loading-progress-update', 'Starting Holochain...');

  // WHICH NETWORK THIS INSTALL IS ON, AND WHY — item 7.14.
  //
  // Precedence is flag, then stored, then the value built into this bundle.
  // A flag is also WRITTEN, so pointing somebody at new infrastructure is a
  // one-time instruction rather than one they have to repeat on every
  // launch. `--reset-network-config` is handled first so that
  // `--reset-network-config --bootstrap-url X` means "forget the old one and
  // store X" rather than deadlocking on order.
  if (runOptions.resetNetworkConfig) {
    const had = clearNetworkOverride(kangarooFs.profileDataDir);
    console.log(
      had
        ? 'Network override cleared; using the URLs built into this build.'
        : 'No network override was stored; already using the URLs built into this build.'
    );
  }

  const { override: storedNetwork, problems: networkProblems } = readNetworkOverride(
    kangarooFs.profileDataDir
  );
  // Reported rather than swallowed: a rejected override silently falling back
  // to the defaults is exactly the "it just stopped finding peers" symptom
  // this item exists to prevent.
  for (const problem of networkProblems) console.warn(`[network-override] ${problem}`);

  const bootstrap = resolveNetworkUrl(
    runOptions.bootstrapUrl?.toString(),
    storedNetwork.bootstrapUrl,
    KANGAROO_CONFIG.bootstrapUrl
  );
  const relay = resolveNetworkUrl(
    runOptions.relayUrl?.toString(),
    storedNetwork.relayUrl,
    KANGAROO_CONFIG.relayUrl
  );

  if (runOptions.bootstrapUrl || runOptions.relayUrl) {
    writeNetworkOverride(kangarooFs.profileDataDir, {
      bootstrapUrl: runOptions.bootstrapUrl?.toString(),
      relayUrl: runOptions.relayUrl?.toString(),
    });
    console.log('Stored the network override for this profile.');
  }

  console.log(`bootstrap_url: ${bootstrap.url} (${bootstrap.source})`);
  console.log(`relay_url:     ${relay.url} (${relay.source})`);

  const holochainManager = await HolochainManager.launch(
    kangarooEmitter,
    kangarooFs,
    runOptions.holochainPath ? runOptions.holochainPath : HOLOCHAIN_BINARY,
    password,
    KANGAROO_CONFIG.bins.holochainVersion,
    kangarooFs.conductorDir,
    kangarooFs.conductorConfigPath,
    lairUrl,
    bootstrap.url,
    relay.url,
    runOptions.holochainRustLog,
    runOptions.holochainWasmLog
  );

  // Install happ if necessary
  await holochainManager.installHappIfNecessary(runOptions.networkSeed);

  console.log('Happ installed.');

  const appToken = await holochainManager.getAppToken();

  console.log('Starting main window...');

  if (splashscreenWindow) splashscreenWindow.close();

  const mainWindow = await createHappWindow(
    {
      type: 'path',
      path: UI_DIRECTORY,
    },
    HAPP_APP_ID,
    holochainManager.appPort,
    appToken,
    false
  );

  return {
    lairHandle,
    holochainManager,
    mainWindow,
    zomeCallSigner,
  };
}
