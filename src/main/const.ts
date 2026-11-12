/* eslint-disable import-x/no-named-as-default-member */
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';
import { KangarooConfig } from './types';

const RESOURCES_DIRECTORY = app.isPackaged
  ? path.join(app.getAppPath(), '../app.asar.unpacked/resources')
  : path.join(app.getAppPath(), './resources');

const kangarooConfigString = fs.readFileSync(
  path.join(RESOURCES_DIRECTORY, 'kangaroo.config.json'),
  'utf-8',
);
export const KANGAROO_CONFIG: KangarooConfig = JSON.parse(kangarooConfigString);
const conductorConfigTemplateString = fs.readFileSync(
  path.join(RESOURCES_DIRECTORY, 'conductor-config.yaml'),
  'utf-8',
);
export const CONDUCTOR_CONFIG_TEMPLATE = yaml.load(conductorConfigTemplateString);

/**
 * The releases page of the repository the updater itself queries — where a
 * participant is sent when the automatic install could not be completed.
 *
 * READ OUT OF THE SAME FILE `electron-updater` READS, rather than written down
 * a second time. `app-update.yml` is generated at build time from
 * `package.json`'s `repository` field and is what the updater resolves its
 * `owner`/`repo` from, so this link cannot drift from the release the update
 * was offered out of. A hardcoded URL that pointed somewhere else would be
 * worse than offering no link at all, since the one thing the person reading it
 * cannot do is check.
 *
 * It lives beside the asar in Electron's own resources directory, which is NOT
 * `RESOURCES_DIRECTORY` above — that one points inside `app.asar.unpacked`.
 * `undefined` when the file is absent, which is the unpackaged case.
 */
export const RELEASES_URL: string | undefined = (() => {
  try {
    const updateConfig = yaml.load(
      fs.readFileSync(path.join(process.resourcesPath, 'app-update.yml'), 'utf-8'),
    ) as { owner?: string; repo?: string } | undefined;
    if (updateConfig?.owner && updateConfig?.repo) {
      return `https://github.com/${updateConfig.owner}/${updateConfig.repo}/releases/latest`;
    }
  } catch (e) {
    // Not packaged, or no publish target configured. Callers fall back to
    // saying nothing rather than guessing a URL.
  }
  return undefined;
})();

const binariesAppendix = KANGAROO_CONFIG.appId.slice(0, 10).replace(' ', '-');

const BINARIES_DIRECTORY = path.join(RESOURCES_DIRECTORY, 'bins');

/** Where the inference runtime's FOLDER lives — a directory rather than a
 * single file, which is the one way this differs from the holochain and lair
 * binaries. `llama-server` resolves `libllama.so`, `libggml-vulkan.so` and
 * the per-microarchitecture CPU backends through `RUNPATH: [$ORIGIN]`, so
 * the folder must stay intact and needs no `LD_LIBRARY_PATH`. */
export const RUNTIME_DIRECTORY = path.join(RESOURCES_DIRECTORY, 'runtime');

export const INFERENCE_SERVER_BINARY = path.join(
  RUNTIME_DIRECTORY,
  `llama-server${process.platform === 'win32' ? '.exe' : ''}`,
);

export const HOLOCHAIN_BINARY = path.join(
  BINARIES_DIRECTORY,
  `holochain-v${KANGAROO_CONFIG.bins.holochainVersion}-${binariesAppendix}${
    process.platform === 'win32' ? '.exe' : ''
  }`,
);

export const LAIR_BINARY = path.join(
  BINARIES_DIRECTORY,
  `lair-keystore-${binariesAppendix}${process.platform === 'win32' ? '.exe' : ''}`,
);

export const HAPP_PATH = path.join(RESOURCES_DIRECTORY, 'kangaroo.happ');
export const HAPP_APP_ID = 'kangaroo.happ';

export const UI_DIRECTORY = path.join(RESOURCES_DIRECTORY, 'ui');

export const ICON_PATH = path.join(RESOURCES_DIRECTORY, 'ui', 'icon.png');

export const SYSTRAY_ICON_PATH = path.join(RESOURCES_DIRECTORY, 'icons', '32x32@2x.png');
export const NOTIFICATIONS_ICON_PATH = path.join(RESOURCES_DIRECTORY, 'icons', '128x128.png');

export const isMac = process.platform === 'darwin';
export const isWindows = process.platform === 'win32';
export const isLinux = process.platform === 'linux';
