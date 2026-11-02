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