#!/usr/bin/env node
// ============================================================================
// scripts/verify-pinned-download.mjs — drives `src/main/pinnedDownload.ts`
// against a local server, because resume, hash-mismatch and cancel are where
// a download manager goes wrong and none of them are exercised by shipping.
//
// THIS IS THE FIRST TEST IN THIS REPOSITORY, which is worth saying out loud:
// everything else here is verified by building and running the app. That is
// adequate for wiring and useless for a 2.1GB transfer that may be
// interrupted, resumed against a server that ignores `Range`, or completed
// with the wrong bytes. Those three paths cannot be reached by launching the
// app and looking at it.
//
// NO ELECTRON. `pinnedDownload.ts` imports nothing from electron for exactly
// this reason; `modelManager.ts` keeps the Electron-facing shell and is
// verified by the build.
//
// WATCHED FAILING TWICE, because a check that has only ever been green has
// not been shown to test anything.
//
//   Injection 1: the partial is KEPT on a hash mismatch instead of deleted.
//   Result: ONE red, §5 — and only that one, which is the point: nothing
//   else in the file can see the difference between a corrupt file that was
//   discarded and one that was left for the next retry to append to.
//
//   Injection 2: `resuming` set from `from > 0` alone, so the body is
//   appended regardless of whether the server honoured `Range`.
//   Result, FIRST TIME: a CRASH. §4's `await` was unguarded, the download
//   threw HashMismatch — correctly, the corruption was caught — and the run
//   died before reporting anything. A harness fragile at exactly the point
//   of the defect it exists to detect reports less than it knows.
//   Result, AFTER GUARDING: THREE red in §4 and the run completes.
//
// Usage: npm run verify:download
//        (node --import tsx scripts/verify-pinned-download.mjs)
// ============================================================================

import { createServer } from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// TypeScript is loaded via tsx's --import hook, set by the npm script.
// `register('tsx/esm')` was the first attempt and tsx refuses it: "must be
// loaded with --import instead of --loader".
const { downloadPinned, HashMismatch, DownloadCancelled, bytesOnDisk, sha256OfFile } =
  await import('../src/main/pinnedDownload.ts');

let failures = 0;
const check = (label, cond) => {
  if (cond) console.log(`  PASS: ${label}`);
  else { console.log(`  FAIL: ${label}`); failures++; }
};

// A payload big enough to arrive in several chunks, so the reader loop, the
// backpressure branch and a mid-stream cancel are all reachable.
const PAYLOAD = crypto.randomBytes(3 * 1024 * 1024);
const GOOD_SHA = crypto.createHash('sha256').update(PAYLOAD).digest('hex');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pinned-'));
const pin = (over = {}) => ({
  url: `http://127.0.0.1:${PORT}/payload`,
  finalPath: path.join(dir, 'file.bin'),
  partPath: path.join(dir, 'file.bin.part'),
  sha256: GOOD_SHA,
  totalBytes: PAYLOAD.length,
  ...over,
});
const reset = () => {
  for (const f of ['file.bin', 'file.bin.part']) {
    fs.rmSync(path.join(dir, f), { force: true });
  }
};

// `honourRange` is flipped per case: a server that ignores Range is a real
// server, not a hypothetical one.
let honourRange = true;
let requests = [];
const server = createServer((req, res) => {
  requests.push(req.headers.range ?? null);
  const range = honourRange ? req.headers.range : undefined;
  if (range) {
    const from = Number(/bytes=(\d+)-/.exec(range)?.[1] ?? 0);
    res.writeHead(206, {
      'content-range': `bytes ${from}-${PAYLOAD.length - 1}/${PAYLOAD.length}`,
      'content-length': String(PAYLOAD.length - from),
    });
    res.end(PAYLOAD.subarray(from));
    return;
  }
  res.writeHead(200, { 'content-length': String(PAYLOAD.length) });
  res.end(PAYLOAD);
});
const PORT = await new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});
console.log(`local server on ${PORT}, payload ${PAYLOAD.length} bytes\n`);

try {
  console.log('=== 1. A clean download lands under its real name ===');
  reset(); requests = [];
  let last = null;
  await downloadPinned(pin(), new AbortController().signal, (p) => { last = p; });
  check('the file exists at the final path', fs.existsSync(path.join(dir, 'file.bin')));
  check('the partial is gone, not left beside it',
    !fs.existsSync(path.join(dir, 'file.bin.part')));
  check('its bytes are exactly the payload',
    fs.readFileSync(path.join(dir, 'file.bin')).equals(PAYLOAD));
  check('progress reached the full length', last?.bytes === PAYLOAD.length);
  // THE VERIFY PASS GETS ITS OWN STATE, or a 2.1GB hash read looks like a
  // progress bar stuck at 100%.
  check('and reported a verifying phase, not just bytes', last?.verifying === true);
  check('CONTROL: no Range was sent, since there was nothing to resume',
    requests.length === 1 && requests[0] === null);

  console.log('\n=== 2. A SECOND call is a no-op, not a re-download ===');
  requests = [];
  await downloadPinned(pin(), new AbortController().signal);
  check('nothing was requested, because the file is already there',
    requests.length === 0);

  console.log('\n=== 3. RESUME: a partial is continued, not restarted ===');
  reset(); requests = [];
  const half = Math.floor(PAYLOAD.length / 2);
  fs.writeFileSync(path.join(dir, 'file.bin.part'), PAYLOAD.subarray(0, half));
  check('CONTROL: the partial is genuinely partial',
    bytesOnDisk(pin()) === half && half < PAYLOAD.length);
  await downloadPinned(pin(), new AbortController().signal);
  check('a Range was sent naming the bytes already held',
    requests[0] === `bytes=${half}-`);
  check('the completed file is byte-identical to the payload',
    fs.readFileSync(path.join(dir, 'file.bin')).equals(PAYLOAD));
  // THE POINT OF THE CASE: a resume that appended the WHOLE body to a half
  // file would produce a file of plausible size and wrong content, and only
  // the hash would notice.
  check('and its hash matches, so nothing was double-appended',
    await sha256OfFile(path.join(dir, 'file.bin')) === GOOD_SHA);

  console.log('\n=== 4. A SERVER THAT IGNORES Range costs a restart, not a corruption ===');
  reset(); requests = [];
  honourRange = false;
  fs.writeFileSync(path.join(dir, 'file.bin.part'), PAYLOAD.subarray(0, half));
  // GUARDED, because the defect this case exists for makes the download
  // THROW. An unguarded await turns the section into a crash and reports
  // nothing — and the crash is indistinguishable from a harness bug. Found
  // by injecting "append regardless of response status", which is exactly
  // the corruption §4 is about: the hash caught it and the run died before
  // saying so.
  let ignoredRangeError = null;
  try {
    await downloadPinned(pin(), new AbortController().signal);
  } catch (err) { ignoredRangeError = err; }
  honourRange = true;
  check('the Range was still asked for', requests[0] === `bytes=${half}-`);
  check('and the download SUCCEEDED rather than failing its hash',
    ignoredRangeError === null);
  const landed = fs.existsSync(path.join(dir, 'file.bin'));
  check('the file is correct despite the server ignoring it',
    landed && fs.readFileSync(path.join(dir, 'file.bin')).equals(PAYLOAD));
  check('and the length is right, so the partial was discarded not appended to',
    landed && fs.statSync(path.join(dir, 'file.bin')).size === PAYLOAD.length);

  console.log('\n=== 5. WRONG BYTES ARE DESTROYED, not kept for a resume ===');
  reset(); requests = [];
  let mismatch = null;
  try {
    await downloadPinned(pin({ sha256: 'f'.repeat(64) }), new AbortController().signal);
  } catch (err) { mismatch = err; }
  check('the download throws HashMismatch', mismatch instanceof HashMismatch);
  check('the message names what was expected and what arrived',
    /does not match the pinned sha256/.test(mismatch?.message ?? ''));
  // THE LOAD-BEARING ONE. A resumable file whose bytes are known to be wrong
  // is worse than none: every retry appends to corruption and the hash never
  // passes.
  check('the partial is DELETED, so a retry cannot append to corruption',
    !fs.existsSync(path.join(dir, 'file.bin.part')));
  check('CONTROL: and nothing was left at the final path either',
    !fs.existsSync(path.join(dir, 'file.bin')));

  console.log('\n=== 6. CANCEL keeps the partial, so the retry resumes ===');
  reset(); requests = [];
  const controller = new AbortController();
  let cancelled = null;
  try {
    await downloadPinned(pin(), controller.signal, (p) => {
      if (p.bytes > 0) controller.abort();
    });
  } catch (err) { cancelled = err; }
  check('the download rejects rather than resolving quietly',
    cancelled !== null);
  check('and it is distinguishable as a cancellation',
    cancelled instanceof DownloadCancelled || cancelled?.name === 'AbortError');
  check('CONTROL: no completed file was produced',
    !fs.existsSync(path.join(dir, 'file.bin')));
  // KEPT ON PURPOSE: a cancelled 2.1GB transfer that threw its bytes away
  // would make cancelling cost as much as finishing.
  const partAfter = fs.existsSync(path.join(dir, 'file.bin.part'))
    ? fs.statSync(path.join(dir, 'file.bin.part')).size : 0;
  console.log(`    partial left on disk: ${partAfter} bytes`);
  check('the partial is kept, so the next attempt resumes', partAfter > 0);
  requests = [];
  await downloadPinned(pin(), new AbortController().signal);
  check('and the retry DOES resume from it', requests[0]?.startsWith('bytes=') === true);
  check('ending in a correct file',
    fs.readFileSync(path.join(dir, 'file.bin')).equals(PAYLOAD));
} finally {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('');
if (failures === 0) {
  console.log('ALL CHECKS PASSED — a clean download lands under its real name only');
  console.log('after its hash passes; a partial is resumed with a Range; a server');
  console.log('that ignores Range costs a restart rather than a corrupt file; wrong');
  console.log('bytes are destroyed rather than kept for a retry to append to; and a');
  console.log('cancellation keeps its partial so cancelling does not cost as much as');
  console.log('finishing.');
} else {
  console.log(`${failures} CHECK(S) FAILED.`);
}
process.exit(failures === 0 ? 0 : 1);
