# Epistemic Resonance — Desktop

Packages the [Epistemic Resonance Protocol](https://github.com/StateofIntent/epistemic-happ)
as a standalone desktop application with a Holochain conductor built in, so
that running it does not require Rust, Node, or a terminal.

Built from [holochain/kangaroo-electron](https://github.com/holochain/kangaroo-electron).
Its own documentation is kept verbatim as [KANGAROO-TEMPLATE.md](KANGAROO-TEMPLATE.md);
read that for the template's mechanics. This file covers only what is
specific to this app.

## Why this repo exists

The Holochain Launcher used to be the answer: one desktop app that installed
many hApps from a `.webhapp` file. It has had no release since v0.400.0 in
March 2025, and that release bundles **Holochain 0.4.1**. This app is on
**0.7**, and the app manifest format changed at 0.6, so a 0.7 `.webhapp`
cannot be installed into any released Launcher — it fails with a manifest
parse error rather than a version mismatch.

Kangaroo is what replaced that model: one packaged app per hApp, each
carrying its own conductor.

## Versions, and which move together

| | |
|---|---|
| Holochain | 0.7.0 |
| `@holochain/client` | 0.21 |
| `@holochain/hc-spin-rust-utils` | 0.700 |
| app version | 0.2.0 |

`yarn check:config` verifies the first three agree with each other and with
the real Holochain release. Run it after changing any of them.

**App version is not cosmetic.** Kangaroo ties data compatibility to semver:
0.1.x releases share a conductor and its databases, and 0.2.0 starts fresh.
A Holochain version bump is never data-compatible, so it needs a minor bump.
See Versioning in the template docs.

## Updating the packaged hApp

```bash
# in the epistemic-happ checkout
scripts/pack-webhapp.sh
cp epistemic-resonance-happ.webhapp ../epistemic-resonance-desktop/pouch/
```

The `.webhapp` is **committed to this repo** rather than gitignored, which is
a departure from the template. CI needs it to build, and Kangaroo accepts it
either as a committed file or as a URL plus sha256 in `kangaroo.config.ts`.
The URL form needs somewhere to host it. The app repo **does** publish
releases — `v0.1.0` and `v0.1.1` both carry the `.happ` and `.webhapp` — so
there is something to point at; this said otherwise and was simply out of
date. Switching would mean the URL has to outlive the release it names. It costs ~1.7MB per version;
switching to the URL form later is a config change, not a rework.

**Which version bump the change needs.** A UI-only change is a patch bump
(`0.1.0` → `0.1.1`) and reaches installed copies through auto-update, because
the UI ships extracted at `resources/ui` and every installer carries its own.
A DNA or zome change needs a **minor** bump. `installHappIfNecessary` in
`src/main/holochainManager.ts` returns early when `HAPP_APP_ID` is already
present in the conductor, and all of `0.1.x` shares one data directory — so a
patch release onto an existing install would put the new UI in front of the
old cell, silently. The minor bump gives it a fresh conductor. Note that
auto-update only offers semver-compatible releases, so a minor bump is a
manual download for everyone already running the app.

The template requires an `icon.png` of at least 256×256 at the root of the
webhapp's UI assets. `epistemic-happ` ships one at `mobile-ui/public/`, and
`yarn create:icons` derives the `.ico`, `.icns`, systray and notification
icons from it.

## Releasing

**Create the GitHub release first — CI will not create one.** Every upload
step in `.github/workflows/release.yaml` is a `gh release upload --clobber`
against a tag that must already exist. Push to `release` without it and the
builds run and then fail at the upload with nothing to upload to.

1. Create a release on GitHub tagged `v<version>`, matching the `version`
   field in `kangaroo.config.ts` exactly, prefixed with `v` — `v0.1.0` for
   version `0.1.0`. Leave it as a **draft** unless you intend to distribute
   it the moment the builds finish; the draft holds the artifacts privately
   and you publish when you are ready.
2. Merge `main` into `release` and push:

```bash
git checkout release && git merge main && git push
# first time only:
#   git checkout -b release && git push -u origin release
```

CI then builds on `windows-2022`, `macos-15-intel`, `macos-latest` and
`ubuntu-22.04` and attaches the artifacts to that release.

Auto-updates read `repository` in `package.json` to find those artifacts, so
that field must name **this** repo. Pointing it at the app repo instead was
tried and does not work: installed copies look for `latest-linux.yml` under
the wrong tags and get a 404.

### What a successful run produces

Verified on the v0.1.0 draft — all four platform jobs succeeded:

| platform | artifacts |
|---|---|
| Linux | `.AppImage` (150MB), `.deb` (113MB), `latest-linux.yml` |
| Windows | `-setup.exe` (115MB), `latest.yml` |
| macOS Intel | `-x64.dmg` (142MB), `-mac.zip` (142MB) |
| macOS Apple Silicon | `-arm64.dmg` (140MB), `-arm64-mac.zip` (141MB) |
| both macOS | `latest-mac.yml` |

The `.zip` files are not duplicates of the `.dmg`s — electron-updater needs
them to apply updates. The `.blockmap` files alongside each artifact are
what make those updates differential rather than full re-downloads.

This also settles the `.deb` question noted below: it builds fine on the
Ubuntu runner.

### Re-releasing an existing tag leaves most assets stale

**A push to `release` that does not change `version` does not re-release the
app.** It rebuilds everything and then replaces almost none of it, because the
four jobs upload by two different mechanisms:

- **Linux** uploads explicitly, with `gh release upload --clobber` — and only
  for `latest-linux.yml` and the `.deb`. **The AppImage is never in that
  list.** It reaches the release only via electron-builder's own publisher.
- **macOS and Windows** (unsigned, which is this app's configuration) upload
  only through electron-builder's publisher. The Windows `gh release upload`
  block is inside `if WINDOWS_CODE_SIGNING == true`, so it never runs here.

electron-builder's publisher does not replace an asset that is already on the
release, so on a re-run of an existing tag the mac and Windows artifacts and
the AppImage all stay as they were, while `latest-linux.yml` and the `.deb` are
overwritten with the new build.

**Observed, on this repo's published `v0.1.1`.** Run `38130535367` (the merge
of PR #3, the relay fix, into `release` on 2026-10-11) succeeded on all four
platforms against the already-released `v0.1.1`. The result:

| asset | state after the run |
|---|---|
| `latest-linux.yml` | **replaced** — regenerated 2026-10-11, describes the new AppImage |
| `..._0.1.1_amd64.deb` | **replaced** — new build, carries the relay fix |
| `...-0.1.1.AppImage` | **stale** — still the 2026-09-06 build |
| all macOS, all Windows | **stale** — still 2026-09-06 |

So `latest-linux.yml` now names an AppImage of 157541505 bytes while the
AppImage actually published is 157541572. **Linux AppImage auto-update is
broken on `v0.1.1` as a result** — electron-updater fetches the AppImage,
checks it against the sha512 in that manifest, and cannot match it. The run
reported success throughout; nothing anywhere failed.

**The rule this implies.** A release is a *new version*, or it is not a
release. Bump `version` so the tag is new and every asset is uploaded for the
first time — which is how `v0.1.0` and `v0.1.1` got complete asset sets, and
why the `0.2.0` run is not affected by any of this. Re-running an existing tag
needs the stale assets deleted from the release first, by hand.

## Three decisions worth revisiting

**Peer discovery runs on Holochain's dev/test servers.** `bootstrapUrl` is
the template's default, `dev-test-bootstrap2.holochain.org`. It works, and it
is not infrastructure this project controls or that anyone promises to keep
running — every installed copy depends on it to find peers. Running our own is
the alternative; `kitsune2-bootstrap-srv` is the same binary
`scripts/network.sh` uses locally in the app repo.

**And `relayUrl` was pointed at that same bootstrap server, which is a
different kind of problem.** This paragraph used to say both fields were "the
template's defaults" — they are the template's, and the relay one is not
Holochain 0.7's. The version this app pins defaults it to an **iroh relay**
(`holochain_conductor_api-0.7.0/src/config/conductor.rs:394`:
`relay_url: "https://use1-1.relay.n0.iroh-canary.iroh.link./"`), and
`holochainManager.ts` writes the configured value straight to
`network.relay_url`. So every installed copy was telling iroh its relay is a
bootstrap server.

A relay is what carries traffic between two peers that cannot reach each other
directly — the ordinary case for two home connections behind consumer NAT, and
exactly the case the app repo's §9 records as never measured. **Peers on one
LAN connect directly and never touch the relay, so this looks fine in every
easy test and fails only in the case mass adoption consists of.** Worse, the
app repo's own `scripts/cross-internet-node.sh` passes 0.7's correct iroh
relay, so a successful cross-internet run there would never have validated the
shipped configuration: the one test and the shipped app pointed at different
relays.

Corrected in `kangaroo.config.ts`. **Not proven at runtime** — nobody has
watched iroh reject the old value — so the two-consumer-network measurement
should be run against a build carrying the fix, since a run against the old
value measures the bug rather than the protocol.

**Nothing is code signed.** `macOSCodeSigning` and `windowsEVCodeSigning` are
both false, so releases are unsigned. On macOS 15 that means the app is
quarantined with no UI to allow it — users need `xattr -r -d
com.apple.quarantine` from a terminal, which most will not do. Certificates
are the fix; the template documents the secrets each platform needs.

**The licence is the template's, not the app's.** `package.json` still says
`CAL-1.0`, which is what Kangaroo's own code is licensed under and what this
repo inherits by deriving from it. The hApp inside is MIT OR Apache-2.0. That
combination has not been reviewed by anyone qualified to say what the
packaged whole may be distributed under, and it was deliberately left alone
rather than quietly changed to match the app.

## Verified locally

On Holochain 0.7.0, an AppImage built from this configuration starts
lair-keystore, brings up a conductor (`Conductor ready.`), compiles the
zomes into its WASM cache and creates the DHT database for the installed
DNA. The `.deb` target additionally needs `libcrypt.so.1`, which Arch
replaced with libxcrypt — it builds on the Ubuntu runner CI uses, confirmed
by the v0.1.0 run.
