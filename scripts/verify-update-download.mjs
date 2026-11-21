#!/usr/bin/env node
// ============================================================================
// scripts/verify-update-download.mjs — drives `src/main/updateDownload.ts`
// against the REAL PUBLISHED v0.3.7 update feeds.
//
// WHY A CHECK AND NOT JUST THE FIX. The defect being fixed was a number in a
// consent dialog that had never been measured: the dialog quoted
// `files[0].size`, the whole artifact, while the updater fetched a 2.7MB delta
// of a 189MB file — measured 2026-11-20, the first time a Linux AppImage
// update was run end to end. Fixing it needs the dialog to name the artifact
// the updater will really fetch, and THAT is a claim about three published
// YAML files and three platform code paths. It cannot be checked by launching
// the app: two of the three platforms are not this machine, and the figure is
// only wrong on a release that happens to list its files in a particular
// order.
//
// SO THE FIXTURES ARE THE PUBLISHED FILES, NOT A TRANSCRIPTION OF THEM.
// `scripts/fixtures/update-feeds-0.3.7/` holds `latest-linux.yml`,
// `latest-mac.yml` and `latest.yml` exactly as downloaded from the v0.3.7
// release, parsed here with the same `js-yaml` the updater parses them with.
// Restating the sizes inline would agree with a wrong resolver as happily as
// a right one. `--live` re-fetches the three feeds of the newest release and
// says whether the fixtures still describe what is published; a network
// failure there reports CANNOT VERIFY and exits non-zero, never silent green.
//
// WATCHED FAILING, because a check that has only ever been green has not been
// shown to test anything:
//
//   Injection 1: `resolveUpdateArtifact` returns `files[0]` on darwin —
//   i.e. the defect itself. Result: FIVE red, four in §2 and one in §5. §3
//   STAYS GREEN, which is the whole point: on an x64 Mac the first entry IS
//   the file that gets fetched, so the old code was right on one of the two
//   Macs and wrong on the other, and no measurement taken on x64 could have
//   shown it.
//
//   Injection 2: the Linux branch drops its `['rpm', 'deb']` exclusion.
//   Result: ONE red, §5 — a feed carrying only a `.deb` resolves to the deb,
//   and the dialog would price a download the AppImage updater is never
//   going to make. §1 stays green, because the published feed lists the
//   AppImage first and the exclusion only matters on a feed that lacks one.
//
//   Injection 3: the resolved percentage inverted (`artifact / resolved`).
//   Result: ONE red, §7's measured round-trip — AND THE FULL-DOWNLOAD CASE
//   DID NOT MOVE, because at 100% the inversion is the identity. A case
//   where the two quantities are equal cannot see which way the division
//   goes; it is the 2.7MB-of-189MB line that carries that.
//
// Usage: yarn check:update-download   (node --import tsx this file)
//        yarn check:update-download --live
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

import {
  megabytes,
  resolveUpdateArtifact,
  resolvedTransferLine,
  updateConsentDetail,
  updateNotificationBody,
} from '../src/main/updateDownload.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, 'fixtures', 'update-feeds-0.3.7');
const RELEASE_BASE =
  'https://github.com/StateofIntent/epistemic-resonance-desktop/releases/download/v0.3.7';
const LATEST_BASE =
  'https://github.com/StateofIntent/epistemic-resonance-desktop/releases/latest/download';
const FEEDS = ['latest-linux.yml', 'latest-mac.yml', 'latest.yml'];

let failures = 0;
let checks = 0;

const section = (title) => console.log(`\n── ${title}`);

const ok = (label, got) => {
  checks += 1;
  console.log(`  PASS  ${label}${got === undefined ? '' : `  [${got}]`}`);
};

const red = (label, expected, got) => {
  checks += 1;
  failures += 1;
  console.log(`  FAIL  ${label}\n          expected: ${expected}\n          got:      ${got}`);
};

const eq = (label, got, expected) =>
  got === expected ? ok(label, got) : red(label, expected, got);

const contains = (label, haystack, needle) =>
  haystack.includes(needle) ? ok(label) : red(label, `text containing ${needle}`, haystack);

const lacks = (label, haystack, needle) =>
  haystack.includes(needle) ? red(label, `text WITHOUT ${needle}`, haystack) : ok(label);

const feed = (name) => load(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));

// ---------------------------------------------------------------------------
// §1 LINUX. `files[0]` is the AppImage here, so the OLD code was right on
// this feed — which is exactly why this defect survived: the platform it was
// measured on is the one it was correct on.
// ---------------------------------------------------------------------------
section('§1 linux → the AppImage, not the deb');
{
  const files = feed('latest-linux.yml').files;
  const got = resolveUpdateArtifact(files, 'linux');
  eq('resolves the AppImage', got?.url, 'org.stateofintent.epistemic-resonance-0.3.7.AppImage');
  eq('quotes its full size', got?.bytes, 193709027);
  eq('that is 194MB as the dialog rounds it', megabytes(got.bytes), 194);
  eq('and is NOT the deb', got?.url.endsWith('.deb'), false);
}

// ---------------------------------------------------------------------------
// §2 ARM64 MAC — THE DEFECT FOUND WHILE FIXING THE FIRST ONE. This release's
// `latest-mac.yml` merges both mac runners' feeds, x64 first, so `files[0]`
// is the x64 zip on every Mac. An arm64 Mac was being quoted 162MB for a
// 165MB download.
// ---------------------------------------------------------------------------
section('§2 darwin arm64 → the arm64 zip, which is not files[0]');
{
  const files = feed('latest-mac.yml').files;
  const got = resolveUpdateArtifact(files, 'darwin', true);
  eq('resolves the arm64 zip', got?.url, 'Epistemic-Resonance-0.3.7-arm64-mac.zip');
  eq('quotes its full size', got?.bytes, 164745626);
  eq('files[0] is a DIFFERENT file', files[0].url !== got?.url, true);
  eq('and the old code would have quoted this instead', megabytes(files[0].size), 162);
  eq('where the honest ceiling is', megabytes(got.bytes), 165);
  eq('never a dmg', got?.url.endsWith('.dmg'), false);
}

section('§3 darwin x64 → the plain zip, never an arm64 build');
{
  const files = feed('latest-mac.yml').files;
  const got = resolveUpdateArtifact(files, 'darwin', false);
  eq('resolves the x64 zip', got?.url, 'Epistemic-Resonance-0.3.7-mac.zip');
  eq('quotes its full size', got?.bytes, 162466432);
  eq('contains no arm64 in the name', got?.url.includes('arm64'), false);
}

section('§4 win32 → the installer');
{
  const files = feed('latest.yml').files;
  const got = resolveUpdateArtifact(files, 'win32');
  eq('resolves the setup exe', got?.url, 'org.stateofintent.epistemic-resonance-0.3.7-setup.exe');
  eq('quotes its full size', got?.bytes, 144492651);
}

// ---------------------------------------------------------------------------
// §5 FEEDS THAT DO NOT CARRY WHAT THIS PLATFORM NEEDS. The updater's
// `findFile` excludes `rpm`/`deb` on Linux and `pkg`/`dmg` on mac rather than
// falling back to `files[0]`, and a dialog that quoted an excluded file would
// be naming a download that is never going to happen.
// ---------------------------------------------------------------------------
section('§5 a feed with nothing fetchable resolves to nothing');
{
  const debOnly = [
    { url: 'org.stateofintent.epistemic-resonance_0.3.7_amd64.deb', size: 139053184 },
  ];
  eq('linux, deb only', resolveUpdateArtifact(debOnly, 'linux'), undefined);

  const dmgOnly = [{ url: 'org.stateofintent.epistemic-resonance-0.3.7-x64.dmg', size: 162277797 }];
  eq('darwin, dmg only', resolveUpdateArtifact(dmgOnly, 'darwin', false), undefined);

  eq('no files at all', resolveUpdateArtifact([], 'linux'), undefined);
  eq('no files key', resolveUpdateArtifact(undefined, 'linux'), undefined);

  const noSize = [{ url: 'org.stateofintent.epistemic-resonance-0.3.7.AppImage' }];
  eq('a file with no size resolves, with no figure', resolveUpdateArtifact(noSize, 'linux')?.bytes, undefined);
  eq('a size of zero is not a figure', resolveUpdateArtifact([{ url: 'x.AppImage', size: 0 }], 'linux')?.bytes, undefined);
}

// ---------------------------------------------------------------------------
// §6 WHAT THE CONSENT DIALOG IS ALLOWED TO SAY. The fixed string must carry
// the figure as a CEILING with both outcomes, and must not reproduce the
// shape that was wrong: a single expected size, stated as what the button
// does.
// ---------------------------------------------------------------------------
section('§6 the consent text is a ceiling and two outcomes');
{
  const detail = updateConsentDetail(193709027);
  contains('names the ceiling', detail, 'The whole file is 194MB');
  contains('names the small outcome', detail, 'a small fraction of that');
  contains('names the large outcome', detail, 'or all of it');
  contains('says which is unknown until it starts', detail, 'only becomes known once it starts');
  contains('still says the data carries over', detail, 'Your data, your key');
  lacks('does not state the artifact as the download', detail, 'This downloads about');
  lacks('does not promise several minutes unconditionally', detail, 'It can take several minutes');
  eq('the figure appears exactly once', detail.split('194MB').length - 1, 1);

  const blind = updateConsentDetail(undefined);
  eq('with no size in the feed it quotes no digits at all', /\d/.test(blind), false);
  contains('and still describes the ceiling in words', blind, 'The whole file is a few hundred megabytes');

  const body = updateNotificationBody(193709027);
  contains('the notification says at most', body, '194MB at most');
  eq('and no digits when the feed has no size', /\d/.test(updateNotificationBody(undefined)), false);
}

// ---------------------------------------------------------------------------
// §7 THE FIGURE THE DIALOG COULD NOT HAVE, ROUND-TRIPPED AGAINST THE ONE
// MEASUREMENT THERE IS. The updater logged, on 2026-11-20, for 0.3.6 → 0.3.7:
//
//   Full: 189,168.97 KB, To download: 2,688.79 KB (1%)
//
// Those are KiB (193,709,027 / 1024 = 189,168.97), so the delta was
// 2,753,320 bytes — 2.8MB as this line counts megabytes decimally, the same
// way the progress log already does.
// ---------------------------------------------------------------------------
section('§7 the resolved transfer line, against the measured delta');
{
  const DELTA = Math.round(2688.79 * 1024);
  const FULL = 193709027;
  eq('the measured fixture is the published size', Math.round((FULL / 1024) * 100) / 100, 189168.97);
  eq(
    'differential download',
    resolvedTransferLine('0.3.7', DELTA, FULL),
    'Resolved transfer for 0.3.7: 2.8MB of a 193.7MB artifact (1%).',
  );
  eq(
    'full download reports 100%, not an error',
    resolvedTransferLine('0.3.7', FULL, FULL),
    'Resolved transfer for 0.3.7: 193.7MB of a 193.7MB artifact (100%).',
  );
  eq(
    'no artifact size, no percentage invented',
    resolvedTransferLine('0.3.7', DELTA, undefined),
    'Resolved transfer for 0.3.7: 2.8MB (no artifact size in the feed to compare against).',
  );
}

// ---------------------------------------------------------------------------
// §8 OPTIONAL LIVE READ. The fixtures are a snapshot; this says whether they
// still describe what is published. Not in CI: a GitHub rate limit is
// indistinguishable from a real mismatch, and a muted check is worse than no
// check.
// ---------------------------------------------------------------------------
if (process.argv.includes('--live')) {
  section('§8 --live: the fixtures against what is published now');
  for (const name of FEEDS) {
    let text;
    try {
      const res = await fetch(`${RELEASE_BASE}/${name}`, { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
    } catch (e) {
      failures += 1;
      checks += 1;
      console.log(`  CANNOT VERIFY  ${name}: ${e.message}`);
      continue;
    }
    const same = text === fs.readFileSync(path.join(FIXTURES, name), 'utf8');
    same
      ? ok(`${name} is byte-identical to the fixture`)
      : red(`${name} has changed on the release`, 'the committed fixture', 'different bytes');
  }

  for (const name of FEEDS) {
    try {
      const res = await fetch(`${LATEST_BASE}/${name}`, { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const live = load(await res.text());
      const platform = name === 'latest.yml' ? 'win32' : name.includes('mac') ? 'darwin' : 'linux';
      const got = resolveUpdateArtifact(live.files, platform, platform === 'darwin');
      got?.bytes
        ? ok(`/latest ${live.version} ${platform} → ${got.url}`, `${megabytes(got.bytes)}MB`)
        : red(`/latest ${name} resolves an artifact with a size`, 'a file and a size', JSON.stringify(got));
    } catch (e) {
      failures += 1;
      checks += 1;
      console.log(`  CANNOT VERIFY  /latest ${name}: ${e.message}`);
    }
  }
}

console.log(
  `\n${failures === 0 ? 'ALL GREEN' : `${failures} RED`} — ${checks} checks, ${
    process.argv.includes('--live') ? 'with' : 'without'
  } the live read.`,
);
process.exit(failures === 0 ? 0 : 1);
