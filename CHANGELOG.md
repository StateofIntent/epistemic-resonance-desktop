## \[0.3.6\] - 2026-11-15

### Added
- **You are told when somebody critiques your work** (epistemic-happ open-work
  6.15). The question the pilot's first publisher asked on 2026-11-09, hours
  after writing the first critique in this protocol's history: how does the
  author find out? 0.3.4 shipped the half where an author can ASK — their own
  claims, each carrying how many critiques came back — and **nothing told them
  until now.** A critique arriving while you have the app open puts a line on
  screen naming the person who wrote it.
  **There is no badge, no count, no dot and no ordering**, which is deliberate
  and is the same reasoning the pull half was built on: an attention ordering
  is not a merit ordering, but it is easily mistaken for one, and a
  notification arriving as a number reintroduces exactly what that half
  refused. **And it is opt-in by a gesture** — you open the channel, and
  nothing is delivered to an agent who has not. That overturns a position this
  project had written down in favour of opening it at startup; true while doing
  so had no consequence, and it now has one.
- **Every node in a critique tree says who wrote it** (6.18). The flat list got
  bylines in 0.3.4; the tree beneath it still labelled its nodes by mode alone,
  so a reply three levels down was an unattributed box. Each node now carries
  its author, and a node whose parent was written by the same person says so —
  **a relation the flat list cannot express at all**, because it only ever
  reaches one level deep.

### Changed
- **The app now says that founding a domain is what makes it findable, at the
  moment you are choosing not to** (6.12). This is a design decision taken in
  the open and worth stating plainly, because a participant's own words forced
  it both ways. Asked whether founding should be the price of being found, they
  answered that it *"seems fair, as long as it's simple and the app explains
  why"* — and then published that very claim **into somebody else's domain**,
  because that was the one place guaranteed to be read.
  **We kept founding as the price. What changed is that the app has to say so.**
  The second act looked like a verdict on the cost, and it was not a priced
  choice at all: nothing in this app had ever connected founding to
  findability, and the *"one more click away"* in that claim was this app's own
  Domains screen saying founding *"costs nothing"*. Nobody was ever really
  offered the trade. So:
  - The Domains tab says it lists the domains somebody **founded** — not every
    domain in use, which is what being called "Domains" had implied.
  - Typing a domain on the New Claim form tells you, there and then, whether it
    is founded and therefore findable by someone who was never told its name —
    and tells a domain that differs only in capitals apart from a match, because
    those are two different domains that cannot see each other.
  - Founding is reachable from that sentence, carrying the name you typed.
  - And the Domains screen no longer says founding costs nothing. There is no
    fee; the price is four fields and a promise published permanently under
    your key.

### Fixed
- **A failed check no longer reads as an answer.** If the app cannot reach the
  conductor to find out whether a domain is founded, it says it could not
  check — rather than telling you your claim is unfindable, which would be a
  false statement about your own work produced by a read that never happened.

### Notes
- **An upgrade in place gets all of it.** The packaged DNA hash is unchanged
  (`uhC0kb-i4w7LvWd-pzqG3Wmm76P0U4pFZ3yGXhWzp-aRCpinsVDdh`, identical to 0.3.0
  through 0.3.5), so this is the same network and the same cell: your data,
  your key and your peers survive.
- **This is the first release that can be taken as an automatic update since
  0.3.5 repaired the updater.** 0.3.5 could not deliver its own fix — the
  repair travelled in the build you had to install by hand — so if the update
  prompt offers you this one and installs it, that closes the last open part of
  a report from the pilot (6.21).

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