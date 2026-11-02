const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const downloadFile = require('./download');

require('tsx/cjs');

const kangarooConfig = require(path.join(process.cwd(), 'kangaroo.config.ts')).default;

const binariesDir = path.join('resources', 'bins');
fs.mkdirSync(binariesDir, { recursive: true });

let targetEnding;
switch (process.platform) {
  case 'linux':
    switch (process.arch) {
      case 'arm64':
        targetEnding = 'aarch64-unknown-linux-gnu';
        break;
      case 'x64':
        targetEnding = 'x86_64-unknown-linux-gnu';
        break;
    }
    break;
  case 'win32':
    targetEnding = 'x86_64-pc-windows-msvc.exe';
    break;
  case 'darwin':
    switch (process.arch) {
      case 'arm64':
        targetEnding = 'aarch64-apple-darwin';
        break;
      case 'x64':
        targetEnding = 'x86_64-apple-darwin';
        break;
      default:
        throw new Error(`Got unexpected macOS architecture: ${process.arch}`);
    }
    break;
  default:
    throw new Error(`Got unexpected OS platform: ${process.platform}`);
}

const binariesAppendix = kangarooConfig.appId.slice(0, 10).replace(' ', '-');

const holochainBinaryFilename = `holochain-v${
  kangarooConfig.bins.holochainVersion
}-${binariesAppendix}${process.platform === 'win32' ? '.exe' : ''}`;

const lairBinaryFilename = `lair-keystore-${binariesAppendix}${
  process.platform === 'win32' ? '.exe' : ''
}`;

function downloadHolochainBinary() {
  const holochainBinaryRemoteFilename = `holochain-${kangarooConfig.bins.holochainFeature ? `${kangarooConfig.bins.holochainFeature}-` : ''}${targetEnding}`;
  const holochainBinaryUrl = `https://github.com/holochain/holochain/releases/download/holochain-${kangarooConfig.bins.holochainVersion}/${holochainBinaryRemoteFilename}`;

  const destinationPath = path.join(binariesDir, holochainBinaryFilename);
  downloadFile(
    holochainBinaryUrl,
    destinationPath,
    kangarooConfig.bins.holochain.sha256[targetEnding],
    true
  );
}

function downloadLairBinary() {
  const lairBinaryUrl = `https://github.com/holochain/holochain/releases/download/holochain-${kangarooConfig.bins.holochainVersion}/lair-keystore-${targetEnding}`;
  const destinationPath = path.join(binariesDir, lairBinaryFilename);
  downloadFile(lairBinaryUrl, destinationPath, kangarooConfig.bins.lair.sha256[targetEnding], true);
}

/** The inference runtime — epistemic-happ open-work 6.10.
 *
 * AN ARCHIVE AND A DIRECTORY, which is the one way this differs from the two
 * binaries above. llama.cpp ships `llama-server` plus `libllama.so`,
 * `libggml-vulkan.so` and a set of per-microarchitecture CPU backends — 62
 * files — and the binary resolves them through `RUNPATH: [$ORIGIN]`, so the
 * folder must land intact and needs no `LD_LIBRARY_PATH`.
 *
 * FLATTENED OUT OF ITS VERSIONED TOP-LEVEL DIRECTORY. The archive unpacks to
 * `llama-<build>/`, and leaving that in the path would bake the pinned build
 * number into `const.ts` — so every bump would be a code change rather than a
 * config change. `resources/runtime/` is the stable name.
 *
 * SKIPPED IF ALREADY PRESENT, because this is a 35MB download on every
 * `npm run setup` otherwise, and the hash is checked on the archive before
 * anything is extracted.
 */
function downloadInferenceRuntime() {
  const asset = kangarooConfig.runtime.assets[targetEnding];
  if (!asset) {
    throw new Error(
      `No inference runtime pinned for target ${targetEnding}. See kangaroo.config.ts.`
    );
  }
  const runtimeDir = path.join('resources', 'runtime');
  const serverName = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
  if (fs.existsSync(path.join(runtimeDir, serverName))) {
    console.log('Inference runtime already present, skipping.');
    return;
  }

  const url = `https://github.com/ggml-org/llama.cpp/releases/download/${kangarooConfig.runtime.build}/${asset.name}`;
  const archivePath = path.join('resources', asset.name);
  // SYNCHRONOUS, unlike `downloadFile` above, because the extract has to
  // happen after the hash passes and `downloadFile` is callback-shaped with
  // no completion to wait on. Verifying then extracting in one place is
  // clearer than threading a callback through.
  console.log('Downloading inference runtime from', url);
  childProcess.execSync(`curl -f -L --output "${archivePath}" "${url}"`, { stdio: 'inherit' });
  const actual = crypto.createHash('sha256').update(fs.readFileSync(archivePath)).digest('hex');
  if (actual !== asset.sha256) {
    fs.rmSync(archivePath, { force: true });
    throw new Error(
      `Inference runtime sha256 mismatch: got ${actual}, expected ${asset.sha256}`
    );
  }

  fs.rmSync(runtimeDir, { recursive: true, force: true });
  fs.mkdirSync(runtimeDir, { recursive: true });
  const staging = path.join('resources', '.runtime-staging');
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  if (asset.name.endsWith('.zip')) {
    const AdmZip = require('adm-zip');
    new AdmZip(archivePath).extractAllTo(staging, true);
  } else {
    childProcess.execSync(`tar xzf "${archivePath}" -C "${staging}"`, { stdio: 'inherit' });
  }
  // The archive's single top-level directory is `llama-<build>/`; move its
  // CONTENTS up so the path in const.ts never names a build number.
  const entries = fs.readdirSync(staging);
  const root = entries.length === 1 && fs.statSync(path.join(staging, entries[0])).isDirectory()
    ? path.join(staging, entries[0])
    : staging;
  for (const entry of fs.readdirSync(root)) {
    fs.renameSync(path.join(root, entry), path.join(runtimeDir, entry));
  }
  fs.rmSync(staging, { recursive: true, force: true });
  fs.rmSync(archivePath, { force: true });

  const serverPath = path.join(runtimeDir, serverName);
  if (!fs.existsSync(serverPath)) {
    throw new Error(`Extracted runtime has no ${serverName} at ${serverPath}`);
  }
  if (process.platform !== 'win32') fs.chmodSync(serverPath, 0o755);
  console.log('Inference runtime ready at', runtimeDir);
}

// THE RUNTIME GOES FIRST, AND THE ORDER IS LOAD-BEARING — do not tidy it.
//
// `downloadFile` above is fire-and-forget: `childProcess.exec` with the
// default 1MB `maxBuffer`, collecting curl's continuous progress meter from
// stderr. `downloadInferenceRuntime` uses `execSync`, which blocks Node's
// event loop — so running it AFTER the other two means ~15 seconds during
// which their pipes fill and are never drained, the buffer overruns, and both
// fail with a bare "Failed to fetch resource."
//
// Observed exactly that way: the holochain fetch went from exit 0 to failing
// the moment the runtime step was appended, and git stash was what attributed
// it. Running the blocking step first leaves the loop free while the async
// ones are in flight.
downloadInferenceRuntime();
downloadHolochainBinary();
downloadLairBinary();
