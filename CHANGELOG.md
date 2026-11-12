## \[0.3.5\] - 2026-11-13

### Added
- **A reply goes under the critique it answers, and each critique gets its own
  section** (epistemic-happ open-work 6.19). The pilot's first publisher
  described that shape unprompted — *"the reply comes under a critique, in
  where others agreeing or disagreeing with that particular critique to the
  claim can reply. A new critique gets its own section."* — which closed a
  decision this project had held open on the grounds that indenting a reply is
  a client deciding a thread's shape for readers who never asked for it. A
  reader asked. **This also makes reachable a defence we had told that
  participant was available**: the protocol has always allowed a critique to
  target another critique, and the app only ever targeted a Claim.
- **A long critique list folds after four, and says what it is hiding** —
  replies included, *"Show 2 more critiques and 1 reply"* (6.22). Asked for in
  the same message, and bounded by the sentence that followed it: *"As long as
  anyone looking can see some information without having to click too much."*
  A short list is never folded, and a reply is never folded away from the
  critique it answers.
- **A critique by someone who already objected says so** — *"same author as an
  earlier critique"* (6.23). This is the half of their first report that the
  0.3.4 byline did not answer: *"still unclear if it is one person or the
  same."* A byline that is DISTINCT is not a byline that is DISTINGUISHABLE,
  and twelve base64 characters are not something a person compares. It says
  "an earlier one" rather than "the one above", because the repeat is usually
  not adjacent.

### Fixed
- **The update prompt says what went wrong instead of appearing to do
  nothing** (6.21). Reported as *"Clicking this - does nothing. No update
  happens."* Three defects at once: the updater logged only to a stdout no
  packaged app has, nothing was shown after you accepted, and a failed
  download could leave the app not starting at all. A failure now names
  itself, offers the download page, and says that installing by hand keeps
  your data, your key and the network you are on. The offer says the size and
  that the app restarts itself.
- **Opening a critique panel re-reads it** (6.24). The panel was a snapshot
  taken the first time it was opened: your own critique appeared, because
  publishing one re-read the list, and nobody else's did until the app was
  restarted. Closing and re-opening — the thing a reader would try — did
  nothing. Nobody reported this; a test harness found it. If the re-read
  fails, the panel keeps what it had and **says so** rather than looking
  current.
- A note whose id ends in `-` **could not be cited** in the notes room, about
  1.6% of the time, because a word-boundary match truncated it by one
  character.

### Changed
- The bundled webhapp is repacked from the app repo at `04e7b94`
  (sha256 `07be8e43…`, 2,021,662 bytes).

### Note
- THIS IS A PATCH, AND THE DNA HASH IS THE PROOF RATHER THAN THE INTENTION.
  The artifact was unpacked, the `.happ` inside it unpacked again, and the DNA
  hashed: `uhC0kb-i4w7LvWd-pzqG3Wmm76P0U4pFZ3yGXhWzp-aRCpinsVDdh`,
  byte-identical to 0.3.0 through 0.3.4, with `protocol_version: 11`
  unchanged. Same network, same cell, same data directory, same agent key.
- **EVERYTHING HERE IS UI, so an upgrade in place gets all of it.** The
  coordinator did not move at all in this release, which is the first time
  that has been true.
- **AND THE ONE THING THAT CANNOT BE DELIVERED BY THE THING IT FIXES.** The
  updater repair travels IN this build, so every install already on 0.3.4 must
  take this release **by hand**: nobody can be auto-updated onto the repair of
  auto-update. Download it from the releases page and install over the top —
  nothing is reset by updating that way. Automatic updates work again from
  this version onward.

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