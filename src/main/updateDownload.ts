// ============================================================================
// src/main/updateDownload.ts — what the update dialog is allowed to say about
// the size of the download it is asking consent for.
//
// WHY THIS FILE EXISTS. On 2026-11-20 the Linux AppImage auto-update was
// measured end to end for the first time, and the updater's own log said:
//
//   Full: 189,168.97 KB, To download: 2,688.79 KB (1%)
//
// The consent dialog had said "This downloads about 194MB ... It can take
// several minutes", because it quoted `updateInfo.files[0].size` — the whole
// artifact — while electron-updater fetches a block-level delta against the
// copy already on disk. The one string whose job is to price the action
// overstated it by about seventy times, and the number had never been
// measured. The comment above that dialog said "saying what the button is
// about to do is half the bug fix".
//
// TWO SEPARATE DEFECTS, AND THE SECOND WAS FOUND WHILE FIXING THE FIRST:
//
//   1. `files[0]` IS NOT NECESSARILY THE FILE THE UPDATER FETCHES. Measured
//      against the published v0.3.7 feeds: `latest-mac.yml` lists the x64 zip
//      first, so an arm64 Mac quoted 162MB for the 165MB file it would
//      actually download. On Linux `files[0]` is the AppImage only because of
//      the order electron-builder happens to write the list in. The functions
//      below mirror what the shipped updater really does
//      (`AppImageUpdater`/`NsisUpdater`/`MacUpdater` → `Provider.findFile`),
//      so the figure names the artifact that will be fetched.
//
//   2. THE REAL TRANSFER IS NOT KNOWN UNTIL AFTER CONSENT. The delta is
//      resolved inside `DifferentialDownloader` once the download starts, so
//      no honest pre-consent figure exists. What the artifact size honestly
//      is, is a CEILING — and a ceiling stated as the expected cost is the
//      bug being fixed here.
//
// SO THE DIALOG GIVES TWO OUTCOMES AND NO SINGLE FIGURE TO LIFT OUT. This is
// the other lesson of the same day: a correction that supplied a figure and a
// caveat was read back as the figure. A caveat is not a defence against a
// number. "A small fraction, or the whole 194MB" has no expected value in it
// to be remembered as one, and "about 2.7MB" — true of exactly one version
// pair, on one machine — would become every reader's figure.
//
// NO ELECTRON IMPORT, deliberately, so `scripts/verify-update-download.mjs`
// can drive it against the real published feeds without launching an app.
// Same reason as `pinnedDownload.ts`.
// ============================================================================

/** One entry of a `latest*.yml` `files:` list, as `UpdateInfo` carries it. */
export interface UpdateFileEntry {
  url: string;
  size?: number;
}

export interface ResolvedUpdateArtifact {
  /** The file name the updater will fetch. */
  url: string;
  /** Its full size, when the feed states one. */
  bytes?: number;
}

/** `new URL(...).pathname` without needing a base: the feed carries bare file
 * names, and electron-updater compares extensions against the pathname, so a
 * query string must not be part of the comparison. */
const pathnameOf = (url: string): string => url.split('#')[0].split('?')[0].toLowerCase();

/** `Provider.findFile` (providers/Provider.js) — the first file with the
 * wanted extension; failing that, the first that is not one of `not`; failing
 * that, `files[0]`. Reproduced rather than imported because it is not part of
 * electron-updater's public surface. */
const findFile = (
  files: UpdateFileEntry[],
  extension: string,
  not?: string[],
): UpdateFileEntry | undefined => {
  if (files.length === 0) return undefined;
  const wanted = files.find((it) => pathnameOf(it.url).endsWith(`.${extension.toLowerCase()}`));
  if (wanted) return wanted;
  if (!not) return files[0];
  return files.find((it) => !not.some((ext) => pathnameOf(it.url).endsWith(`.${ext}`)));
};

const isArm64File = (file: UpdateFileEntry): boolean => pathnameOf(file.url).includes('arm64');

/**
 * The artifact the shipped updater will actually download, for the platform
 * asking. Mirrors, in order:
 *
 *  - `AppImageUpdater.doDownloadUpdate` → `findFile(files, "AppImage", ["rpm", "deb"])`
 *  - `NsisUpdater.doDownloadUpdate`     → `findFile(files, "exe")`
 *  - `MacUpdater.doDownloadUpdate`      → arm64 filter, then `findFile(files, "zip", ["pkg", "dmg"])`
 *
 * `isArm64Mac` is only consulted on darwin. The updater decides it from
 * `uname -a`, `process.arch` and Rosetta detection; the caller passes its own
 * reading, and on the other platforms it is ignored.
 */
export function resolveUpdateArtifact(
  files: UpdateFileEntry[] | undefined,
  platform: string,
  isArm64Mac = false,
): ResolvedUpdateArtifact | undefined {
  if (!files || files.length === 0) return undefined;

  let candidate: UpdateFileEntry | undefined;
  if (platform === 'darwin') {
    // The same two branches as MacUpdater: prefer arm64 builds on an arm64
    // Mac when the feed has any, and never offer an arm64 build to an x64 one.
    const arch =
      isArm64Mac && files.some(isArm64File)
        ? files.filter(isArm64File)
        : files.filter((f) => !isArm64File(f));
    candidate = findFile(arch, 'zip', ['pkg', 'dmg']);
  } else if (platform === 'win32') {
    candidate = findFile(files, 'exe');
  } else {
    candidate = findFile(files, 'appimage', ['rpm', 'deb']);
  }

  if (!candidate) return undefined;
  return {
    url: candidate.url,
    bytes: typeof candidate.size === 'number' && candidate.size > 0 ? candidate.size : undefined,
  };
}

/** Megabytes the way the rest of this file counts them: decimal, as the
 * updater's own progress log does (`transferred / 1_000_000`). */
export const megabytes = (bytes: number): number => Math.round(bytes / 1_000_000);

/**
 * The `detail` of the consent dialog. A CEILING AND TWO OUTCOMES: the
 * fraction that a block-level delta usually comes to, or the whole file when
 * the comparison cannot be made (no local copy to diff against, a changed
 * compression method, or the differential path erroring and falling back).
 * Which of the two it will be is not known until the transfer starts, and
 * this says so rather than picking one.
 */
export function updateConsentDetail(artifactBytes?: number): string {
  // THE CEILING COMES FIRST AND IS NAMED ONCE, so that what follows has
  // something to be a fraction OF. The earlier version led with the figure as
  // the download itself, which is the sentence that was wrong.
  const ceiling =
    artifactBytes === undefined
      ? 'a few hundred megabytes'
      : `${megabytes(artifactBytes)}MB`;

  return [
    'This downloads the new version and then restarts the app by itself. Nothing else needs doing in the meantime.',
    '',
    `The whole file is ${ceiling}, and the updater fetches only the parts of it that changed: the transfer may be a small fraction of that, or all of it if the parts cannot be compared — several minutes on a domestic connection. Which of the two it is only becomes known once it starts.`,
    '',
    'Your data, your key and the network you are on all carry over.',
  ].join('\n');
}

/** The notification shown once the download has been agreed to. Same ceiling,
 * same refusal to name an expected size. */
export function updateNotificationBody(artifactBytes?: number): string {
  const ceiling =
    artifactBytes === undefined
      ? 'Downloading only the parts that changed.'
      : `Downloading only the parts that changed — ${megabytes(artifactBytes)}MB at most.`;
  return `${ceiling} The app restarts itself when it is ready.`;
}

/**
 * What the updater resolved, once it is known. This is the figure the dialog
 * could not have: `progress.total` is the delta's grand total during a
 * differential download (`ProgressDifferentialDownloadCallbackTransform`) and
 * the whole file during a full one, so the same line reports either, against
 * the ceiling that was quoted.
 *
 * Log only. It arrives after consent, where there is nothing left to decide.
 */
export function resolvedTransferLine(
  version: string,
  resolvedTotalBytes: number,
  artifactBytes?: number,
): string {
  const resolved = `${(resolvedTotalBytes / 1_000_000).toFixed(1)}MB`;
  if (artifactBytes === undefined || artifactBytes <= 0) {
    return `Resolved transfer for ${version}: ${resolved} (no artifact size in the feed to compare against).`;
  }
  const percent = Math.round((resolvedTotalBytes / artifactBytes) * 100);
  const full = `${(artifactBytes / 1_000_000).toFixed(1)}MB`;
  return `Resolved transfer for ${version}: ${resolved} of a ${full} artifact (${percent}%).`;
}
