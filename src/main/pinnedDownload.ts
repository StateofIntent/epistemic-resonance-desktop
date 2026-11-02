// ============================================================================
// src/main/pinnedDownload.ts — fetch a large pinned file, resumably, and
// verify it against its hash before it is allowed to exist under its real
// name.
//
// SEPARATED FROM `modelManager.ts` SO THAT IT CAN BE TESTED. Everything here
// is plain Node with no `electron` import, which is the whole reason the file
// exists: the resume, hash-mismatch and cancel paths are where a download
// manager goes wrong, and behind an Electron import none of them can be
// exercised without launching an app. `scripts/verify-pinned-download.mjs`
// drives this module directly against a local server.
//
// WHY NOT `scripts/download.js`, which already downloads and verifies: it
// shells out to `curl` and then `readFileSync`s the result to hash it. That
// is fine for a 30MB binary and hopeless for 2.1GB, and it is a build script
// with no cancel, no resume and no progress.
// ============================================================================

import crypto from 'crypto';
import fs from 'fs';

export interface PinnedFile {
  url: string;
  /** Where the completed, verified file belongs. */
  finalPath: string;
  /** Where bytes accumulate. Distinct from `finalPath` ON PURPOSE: a file at
   * the final name has passed its hash, and a `.part` is resumable. Nothing
   * ever reads a partial as if it were complete. */
  partPath: string;
  sha256: string;
  /** Known from the pin, so a progress bar can say what it is out of before
   * the first byte arrives rather than waiting on a `content-length`. */
  totalBytes: number;
}

export interface DownloadProgress {
  bytes: number;
  totalBytes: number;
  /** True once the bytes are in and the hash pass is running. A 2.1GB verify
   * is a sequential read and is long enough to need its own state, or the bar
   * sits at 100% looking stuck. */
  verifying: boolean;
}

export class HashMismatch extends Error {
  constructor(readonly expected: string, readonly actual: string) {
    super(
      `the downloaded file does not match the pinned sha256 (got ${actual.slice(0, 16)}…, `
      + `expected ${expected.slice(0, 16)}…). It has been discarded rather than kept `
      + 'for a resume.');
    this.name = 'HashMismatch';
  }
}

export class DownloadCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'DownloadCancelled';
  }
}

/** Bytes already on disk for this pin, complete or partial. */
export function bytesOnDisk(file: PinnedFile): number {
  for (const p of [file.finalPath, file.partPath]) {
    try { return fs.statSync(p).size; } catch { /* not there */ }
  }
  return 0;
}

export async function downloadPinned(
  file: PinnedFile,
  signal: AbortSignal,
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  if (fs.existsSync(file.finalPath)) return;

  let from = 0;
  try { from = fs.statSync(file.partPath).size; } catch { /* no partial */ }

  const headers: Record<string, string> = {};
  // RESUME IS REQUESTED, NEVER ASSUMED. A server that ignores `Range`
  // answers 200 with the whole body, and appending THAT to a partial file
  // produces a corrupt file of plausible length. The response status decides
  // whether to append or start over, so an ignoring server costs a restart
  // rather than a silent corruption.
  if (from > 0) headers.range = `bytes=${from}-`;

  const response = await fetch(file.url, { headers, signal });
  if (!response.ok && response.status !== 206) {
    throw new Error(`the download server answered ${response.status}`);
  }
  const resuming = response.status === 206 && from > 0;
  if (!resuming && from > 0) {
    fs.rmSync(file.partPath, { force: true });
    from = 0;
  }
  if (!response.body) throw new Error('the download server sent no body');

  const sink = fs.createWriteStream(file.partPath, { flags: resuming ? 'a' : 'w' });
  let written = from;
  try {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // BACKPRESSURE IS HONOURED. `write` returning false means the buffer is
      // full, and ignoring it on a multi-gigabyte stream grows the heap until
      // the process dies — which looks like a crash rather than a download.
      if (!sink.write(value)) {
        await new Promise<void>((resolve) => sink.once('drain', resolve));
      }
      written += value.byteLength;
      onProgress?.({ bytes: written, totalBytes: file.totalBytes, verifying: false });
      if (signal.aborted) throw new DownloadCancelled();
    }
  } finally {
    await new Promise<void>((resolve) => sink.end(() => resolve()));
  }

  if (signal.aborted) throw new DownloadCancelled();

  onProgress?.({ bytes: written, totalBytes: file.totalBytes, verifying: true });
  // HASHED OVER THE WHOLE FILE, NOT OVER THE STREAM, and resume is what
  // forces that: a resumed download has bytes this process never saw, so an
  // incremental hash would be of the wrong thing. The cost is one extra
  // sequential read and the benefit is that the answer is about the FILE.
  const actual = await sha256OfFile(file.partPath);
  if (actual !== file.sha256) {
    // DESTROYED RATHER THAN KEPT. A resumable download whose existing bytes
    // are known to be wrong is worse than none: every retry appends to
    // corruption and the hash never passes.
    fs.rmSync(file.partPath, { force: true });
    throw new HashMismatch(file.sha256, actual);
  }
  fs.renameSync(file.partPath, file.finalPath);
}

export function sha256OfFile(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hasher = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', (chunk) => hasher.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hasher.digest('hex')));
  });
}
