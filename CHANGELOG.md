## \[0.3.4\] - 2026-11-11

### Fixed
- The Worldline tab's "Show what is in this window" button **opens the records**
  instead of printing a count and discarding them (epistemic-happ open-work
  6.17). Reported by a pilot participant whose reading of the button was
  correct while the code's was not.
- A critique **says who wrote it**, routing into that agent's other claims the
  way a claim's byline already did, and says when the writer is the claim's own
  author answering (6.18). The entry had carried `author` all along and the
  assessment panel beside it had shown one for weeks.
- A published entry's **line breaks reach the screen** — on the claim, the
  critique, a retraction, a flag and an assessment's rationale, not only the two
  surfaces that were reported (6.20). Nine `white-space` declarations existed in
  the stylesheet and none was on a surface rendering somebody's own words.
- The box you **compose a permanent entry in grows to fit the draft**, capped so
  that the button which signs it stays on screen (6.20). It was three lines
  tall, which is where a five-paragraph critique was being read back.
- `count_attestations_pure` no longer counts an agent attesting **themselves**,
  even from inside the root set.

### Changed
- The bundled webhapp is repacked from the app repo at `7ee7f01`
  (sha256 `9268aa10…`, 2,020,535 bytes).

### Note
- THIS IS A PATCH, AND THE DNA HASH IS THE PROOF RATHER THAN THE INTENTION.
  The artifact was unpacked and the DNA inside it hashed:
  `uhC0kb-i4w7LvWd-pzqG3Wmm76P0U4pFZ3yGXhWzp-aRCpinsVDdh`, byte-identical to
  0.3.0 through 0.3.3, with `protocol_version: 11` unchanged. Same network,
  same cell, same data directory, same agent key — and a minor would have
  forked the network this pilot is running on.
- **EVERY PARTICIPANT-REPORTED FIX IN THIS RELEASE IS UI, so an upgrade in
  place gets all four of them.** That is new: 0.3.1 through 0.3.3 each carried
  a coordinator fix that only a fresh install could take, because
  `installHappIfNecessary` early-returns when the cell already exists. The one
  coordinator change here — self-attestation — follows that old rule and
  reaches fresh installs only.

## \[0.3.3\] - 2026-11-08

*Released without a changelog entry at the time; recorded here from the release
and the commit it was cut from (`748d502`).*

### Fixed
- The foresight denominator stopped under-counting a commitment made seconds
  earlier (epistemic-happ open-work 1.25): `get_foresight_record` prefers the
  author's own index when it strictly contains what the chain authority served,
  reported as a third `counted_from` value, `index-superset`. Measured on a
  three-member DHT, where a remote activity authority lags a recent write by
  about five seconds.

### Note
- A patch on the same DNA hash as 0.3.0-0.3.2. The fix lives in the
  COORDINATOR, so only a fresh install repaired the count; an upgrade got the
  corrected wording and the old number.

## \[0.3.2\] - 2026-11-02

### Added
- The compose-time adversary (epistemic-happ open-work 6.10): a model on this
  machine reads a draft claim before it is published and says what it will be
  asked. It writes nothing, is recorded nowhere, and never appears beside a
  real critique — the objections exist only while the draft does.
- `llama.cpp` bundled as the inference runtime (MIT, Vulkan where it exists,
  standard build on macOS). 11-36MB per target.
- The model itself is PULLED ON FIRST USE, not bundled: ~2.1GB against a
  113-150MB installer. Resumable, hash-verified, cancellable, and stored
  outside the `breakingVersion` scope so a migration does not re-download it.
- `npm run verify:download` — the first test in this repository, 25 checks.

### Changed
- The bundled webhapp is repacked from the app repo at `323a530`, bringing the
  past cone's detection half and the render-invariant focus fix.

### Note
- THIS IS A PATCH ON PURPOSE. Both the 0.3.1 and 0.3.2 bundles contain a DNA
  hashing to `uhC0kb-i4w7LvWd-pzqG3Wmm76P0U4pFZ3yGXhWzp-aRCpinsVDdh`, verified
  by unpacking both artifacts — so the network, conductor, keystore and agent
  key all survive the upgrade. A minor would have forked all four.
- An UPGRADED install runs the new UI against its existing coordinator, so
  `critiques_unseen_by_assessment` is absent there and an assessment's cone
  renders without its denominator. Fails soft by design. Fresh installs get
  everything.

## \[Unreleased\]

### Added
### Fixed
### Changed
- Updated to holochain 0.5.0-rc.1
### Removed