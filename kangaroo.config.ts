import { defineConfig } from './src/main/defineConfig';

export default defineConfig({
  // Reverse-DNS on the GitHub org that owns the app, not on holochain.org
  // — this is a different app from the template it was made from, and the
  // appId is what the conductor and the OS use to keep its data separate.
  appId: 'org.stateofintent.epistemic-resonance',
  productName: 'Epistemic Resonance',
  // Kangaroo ties data compatibility to semver: 0.1.x releases share a
  // conductor and its databases, and a bump to 0.2.0 starts fresh. That
  // is the lever to pull for a Holochain version bump, which is never
  // data-compatible — see Versioning in README.md. This app is on
  // Holochain 0.7.
  //
  // It is also the lever for a DNA change, for a less obvious reason:
  // holochainManager.ts installs the hApp only if HAPP_APP_ID is absent
  // from the conductor, so a patch release onto a shared 0.1.x data
  // directory ships the new UI against the ALREADY-INSTALLED cell. A
  // patch bump is therefore only correct when the change is UI-only.
  // 0.2.0 is a DNA change, so it is a minor bump for exactly that reason:
  // the packaged webhapp moves from the 0.1.1 bundle packed 2026-09-04 to
  // one packed from the app repo's `protocol_version: 9` (DNA hash
  // uhC0kUHSiD5aAt7BH6XJ3j7XGfdaxLL3oFUj6f-2OPU29caU0ZkxF). The integrity
  // zome forked six times between those two packings and the DNA hash is
  // computed over it, so each fork is a separate network: a patch release
  // here would have put the new UI in front of the old cell and joined
  // none of the network this app now describes.
  //
  // Auto-update will not offer this to anyone running 0.1.x, because
  // electron-updater only offers semver-compatible releases. That is the
  // intended cost — everyone already installed downloads it by hand.
  //
  // 0.3.0 IS THE SAME DECISION AGAIN, for `protocol_version: 11`. The
  // packaged webhapp moves from the protocol 9 bundle above to one packed
  // 2026-10-25 (DNA hash
  // uhC0kb-i4w7LvWd-pzqG3Wmm76P0U4pFZ3yGXhWzp-aRCpinsVDdh). Between those
  // two packings the integrity zome took protocol_version 10 and 11 plus
  // all five autopoiesis stages, so 0.2.x and 0.3.x are separate networks
  // and a patch bump would again have shipped the new UI in front of the
  // old cell. Same cost accepted again: auto-update will not offer this to
  // anyone on 0.2.x.
  //
  // Verified as the artifact rather than as the tree it came from: the
  // bundle was unpacked, its own dna.yaml declares protocol_version 11,
  // its .happ is byte-identical to the one the app repo built
  // (sha256 7ef913d7...), and all 101 checks of attachment-links.mjs pass
  // against a conductor running it.
  // 0.3.1 IS A PATCH, AND THAT IS THE OPPOSITE DECISION FROM 0.2.0 AND 0.3.0
  // ABOVE — ON PURPOSE, BECAUSE THE INTEGRITY ZOME DID NOT MOVE. The bundle
  // is repacked from the app repo at 2026-10-27 02:17 and carries item 6.7's
  // promise surface (a standalone "Your promises" section on the Domains tab,
  // and the founding form's own-promise field widened to a textarea) plus
  // item 1.18's coordinator fix (get_agent_constitution now tie-breaks on the
  // host-stamped ACTION timestamp, because published_at is SECONDS and two
  // constitutions published inside one second compared EQUAL).
  //
  // VERIFIED ON THE TWO ARTIFACTS RATHER THAN INFERRED FROM THE DIFF. Both
  // webhapps were unpacked and their DNAs hashed with `hc dna hash`:
  //
  //   released 0.3.0 bundle  uhC0kb-i4w7LvWd-pzqG3Wmm76P0U4pFZ3yGXhWzp-aRCpinsVDdh
  //   this 0.3.1 bundle      uhC0kb-i4w7LvWd-pzqG3Wmm76P0U4pFZ3yGXhWzp-aRCpinsVDdh
  //
  // Identical, so this is the same network and the same cell. `breakingVersion`
  // in src/main/filesystem.ts maps EVERY 0.3.x patch to the literal string
  // `0.3.x`, and that string is both the network seed suffix and the data
  // directory name — so an upgrade in place keeps the conductor, the keystore
  // and the agent key. A MINOR HERE WOULD HAVE FORKED THE NETWORK AND
  // ABANDONED THE DATA ON BOTH MACHINES THAT RAN 0.3.0. The reasoning recorded
  // for 0.2.0 and 0.3.0 does not carry over for one reason only: those
  // packings had a forked integrity zome and this one does not.
  //
  // WHAT A PATCH DOES NOT DO, AND IT IS NOT NOTHING: 1.18 WILL NOT REACH AN
  // INSTALL THAT ALREADY HAS THE CELL. `installHappIfNecessary` returns early
  // when HAPP_APP_ID is already present, so an upgraded 0.3.0 install runs the
  // NEW UI against the ALREADY-INSTALLED coordinator. Accepted rather than
  // overlooked: the new surface calls `publish_constitution`, which the 0.3.0
  // coordinator already has, so 6.7 works everywhere, and 1.18 only bites when
  // a constitution is republished inside the SAME SECOND. Every invitee
  // installs fresh and gets both. The two existing installs keep the
  // stale-read-after-instant-republish behaviour until they are factory-reset,
  // and that is the price of not forking the network the pilot is founded on.
  //
  // 0.3.2 IS A PATCH FOR THE SAME REASON, AND CARRIES THE COMPOSE-TIME
  // ADVERSARY — epistemic-happ open-work 6.10. The bundle is repacked from
  // the app repo at `323a530` and brings the whole of 2026-11-02: the past
  // cone's detection half on both sides (6.1, 1.22, 6.11), the render
  // invariant's focus fix (1.23), and the compose form's "Before you sign"
  // section, which reads a draft claim through a model on this machine and
  // says what it will be asked.
  //
  // VERIFIED AS THE ARTIFACT, which is this file's own test and is the only
  // thing that makes "patch" a fact rather than an intention. Both webhapps
  // were unpacked and the DNA inside each hashed with `hc dna hash`:
  //
  //   shipped 0.3.1 bundle   uhC0kb-i4w7LvWd-pzqG3Wmm76P0U4pFZ3yGXhWzp-aRCpinsVDdh
  //   this 0.3.2 bundle      uhC0kb-i4w7LvWd-pzqG3Wmm76P0U4pFZ3yGXhWzp-aRCpinsVDdh
  //
  // Identical — so the same network and the same cell, the conductor,
  // keystore and agent key all survive the upgrade. `breakingVersion` maps
  // both to `0.3.x`, checked rather than recalled.
  //
  // THE COORDINATOR DID MOVE AND THE HASH DID NOT, which is the thing to
  // understand before reading the hash as "nothing changed". 6.11 added
  // `critiques_unseen_by_assessment`, but the DNA hash covers the INTEGRITY
  // zome and the modifiers, so a coordinator-only addition forks nothing.
  //
  // WHICH MEANS 1.18's LESSON REPEATS, AND IS ACCEPTED AGAIN:
  // `installHappIfNecessary` early-returns when the cell is already there,
  // so an UPGRADED install runs the new UI against the OLD coordinator and
  // will not have that extern. `loadAssessmentUnseen` fails soft per
  // assessment for exactly this reason — the position renders with its cone
  // line and no denominator, which is what the screen looked like yesterday.
  // Fresh installs get everything. The compose-time adversary is entirely
  // app-side and reaches everyone.
  //
  // THE RUNTIME IS NEW IN THIS RELEASE AND THE WEIGHTS ARE NOT IN IT.
  // llama.cpp ships bundled (11-36MB per target); the ~2.1GB model is pulled
  // on first use, so this installer is the same size as 0.3.1 plus the
  // runtime. An install that never opens the compose form downloads nothing.
  // 0.3.3 IS A PATCH, AND THE DNA HASH IS WHAT MAKES THAT A FACT. The bundle
  // is repacked from the app repo at `866f1f1` and carries open-work 1.25's
  // fix: `get_foresight_record` now prefers the author's own INDEX when it
  // strictly contains what the chain authority served, reported as a third
  // `counted_from` value, `"index-superset"`.
  //
  // WHY THAT FIX EXISTS, because it is the kind of thing a release note
  // usually hides. 1.24 made the denominator an enumeration of the author's
  // source chain, which a writer cannot skip. On a real multi-member DHT that
  // chain is served by a REMOTE activity authority, and the authority lags a
  // recent write by about five seconds — so the count was SMALLER than the
  // local index at the one moment anyone reads it: just after committing.
  // Measured on a three-member network, not reasoned about. The UI no longer
  // calls that case a FLOOR, because a reader told to discount it would be
  // discounting the commitment they had just made.
  //
  // VERIFIED ON THE ARTIFACT RATHER THAN THE TREE: `resources/kangaroo.happ`
  // was unpacked, its `dna.yaml` declares `protocol_version: 11`, and
  // `hc dna hash` on the DNA inside it returns
  // uhC0kb-i4w7LvWd-pzqG3Wmm76P0U4pFZ3yGXhWzp-aRCpinsVDdh — byte-identical to
  // the hash shipped in 0.3.0, 0.3.1 and 0.3.2. The integrity zome did not
  // move, so `breakingVersion` stays on 0.3.x: same network, same cell, same
  // data directory, and auto-update offers this to everyone already on 0.3.x.
  //
  // THE CHANGE IS COORDINATOR-AND-UI ONLY, which carries the asymmetry item
  // 1.18 recorded: a coordinator fix reaches an existing install only when
  // that install takes this update, because the coordinator wasm travels in
  // the bundle rather than in the cell.
  //
  // 0.3.4 IS A PATCH, AND IT IS THE FIRST RELEASE HERE CUT BECAUSE A
  // PARTICIPANT ASKED FOR IT. The bundle is repacked from the app repo at
  // `7ee7f01` and carries what the pilot's first publisher reported on
  // 2026-11-11, in four parts: the Worldline window now OPENS its records
  // instead of counting them (6.17); a critique says WHO WROTE IT, and
  // whether that is the claim's own author answering (6.18); a published
  // entry's line breaks survive to the screen on every surface that renders
  // somebody's own words (6.20); and the box you compose a permanent entry
  // in grows to fit what is in it, capped so the button that signs it stays
  // reachable (6.20).
  //
  // VERIFIED ON THE ARTIFACT, which is this file's own standing test and the
  // only thing that makes "patch" a fact rather than an intention. The packed
  // webhapp was unpacked, the `.happ` inside it unpacked again, and the DNA
  // hashed with `hc dna hash`:
  //
  //   shipped 0.3.3 bundle   uhC0kb-i4w7LvWd-pzqG3Wmm76P0U4pFZ3yGXhWzp-aRCpinsVDdh
  //   this 0.3.4 bundle      uhC0kb-i4w7LvWd-pzqG3Wmm76P0U4pFZ3yGXhWzp-aRCpinsVDdh
  //
  // Identical, and `dna.yaml` inside the artifact still declares
  // `protocol_version: 11` — so this is the same network and the same cell,
  // and the conductor, keystore and agent key all survive the upgrade.
  // `breakingVersion` maps every 0.3.x to the literal `0.3.x`, which is both
  // the network seed suffix and the data directory name. A MINOR WOULD HAVE
  // FORKED THE NETWORK THE PILOT IS RUNNING ON and stranded the always-on
  // node, whose seed carries this app's MINOR version.
  //
  // THE INTEGRITY ZOME DID MOVE IN THE TREE AND NOT IN THE ARTIFACT, which
  // is worth stating because the diff looks alarming: twelve added lines in
  // `dna/integrity/src/lib.rs` since the 0.3.3 packing are ALL COMMENT, and
  // the hash above is the proof rather than the reading.
  //
  // AND THE COORDINATOR DID MOVE FUNCTIONALLY, so 1.18's asymmetry applies
  // again and is not hidden here: `count_attestations_pure` no longer counts
  // an agent attesting themselves, even from inside the root set. That wasm
  // travels in the bundle rather than in the cell, so a FRESH install gets
  // it and an UPGRADED install keeps the old counting until it is factory
  // reset. **Everything a participant reported is UI, so all four of those
  // fixes reach an upgrade in place** — which is the first time that has
  // been true of a release here, and the reason this one is worth taking.
  //
  // THE UI WAS READ OUT OF THE BUNDLE, not trusted from the build log: the
  // zipped `dist` inside the webhapp carries `critique-author`,
  // `critique-content`, the relation marker's own words and `pre-wrap` in
  // the stylesheet. A packed bundle wrapping a stale `dist/` is the failure
  // `scripts/pack-webhapp.sh` exists to prevent and it is cheap to confirm.
  version: '0.3.4',
  macOSCodeSigning: false,
  windowsEVCodeSigning: false,
  fallbackToIndexHtml: true,
  autoUpdates: true,
  systray: true,
  passwordMode: 'password-optional',
  // INHERITED FROM THE TEMPLATE, AND WORTH A DECISION BEFORE A REAL
  // RELEASE. These are Holochain's own dev/test services. They are what
  // the template ships and they work, but they are not infrastructure
  // this project controls or that anyone promises to keep running, and
  // every installed copy of this app depends on them to find peers.
  // Running our own is the alternative; `kitsune2-bootstrap-srv` is the
  // same binary scripts/network.sh uses locally in the main repo.
  bootstrapUrl: 'https://dev-test-bootstrap2.holochain.org/',
  // RELAY URL CORRECTED: IT WAS POINTED AT THE BOOTSTRAP SERVER.
  //
  // Both fields read `dev-test-bootstrap2.holochain.org` until now, and the
  // README described them together as "the template's defaults". They are
  // the template's, and the relay one is NOT Holochain 0.7's. Read out of
  // the dependency this app pins:
  //
  //   holochain_conductor_api-0.7.0/src/config/conductor.rs:394
  //     relay_url: Url2::parse("https://use1-1.relay.n0.iroh-canary.iroh.link./")
  //
  // `holochainManager.ts` writes this value to `network.relay_url`, so every
  // installed copy was telling iroh that its relay is a bootstrap server.
  //
  // WHY THIS IS THE WORST PLACE FOR SUCH A MISTAKE. A relay is what carries
  // traffic between two peers that cannot reach each other directly — which
  // is the ordinary case for two home connections behind consumer NAT, and
  // the exact case the app repo's §9 records as never having been measured.
  // Peers on one LAN, or with a cooperative NAT, connect directly and never
  // need the relay, so this would look fine in every easy test and fail only
  // in the case mass adoption consists of.
  //
  // AND THE PROJECT'S OWN CROSS-INTERNET TEST USES THE CORRECT RELAY.
  // `scripts/cross-internet-node.sh` in the app repo passes 0.7's iroh
  // default, so a successful run there would NOT have validated this
  // configuration. The one test of cross-internet connectivity and the
  // shipped app were pointed at different relays.
  //
  // NOT PROVEN AT RUNTIME. Nobody has watched iroh reject this value or seen
  // a connection fail because of it; the evidence is the pinned dependency's
  // own default and what the field is for. The two-consumer-network
  // measurement the app repo calls the highest-value outstanding item should
  // be run against a build carrying this fix, since a run against the old
  // value would be measuring the bug rather than the protocol.
  relayUrl: 'https://use1-1.relay.n0.iroh-canary.iroh.link./',
  // THE INFERENCE SERVER THAT RUNS THOSE WEIGHTS. llama.cpp, MIT, pinned.
  //
  // PICKED AGAINST THE REAL RELEASE ASSETS, not from memory: every non-Mac
  // target this app builds has a VULKAN archive, and macOS needs no variant
  // because Metal is in the standard build. 11-36MB per target against a
  // 113-150MB installer, which is the whole reason the RUNTIME is bundled
  // while the WEIGHTS are pulled.
  //
  // THE VULKAN ARCHIVES CARRY THE CPU BACKENDS TOO — `libggml-cpu-zen4.so`,
  // `-skylakex`, `-alderlake` and the rest sit beside `libggml-vulkan.so` —
  // so a machine with no Vulkan driver falls back to CPU rather than failing
  // to start. CUDA and ROCm were rejected for assuming a toolkit is present;
  // the plain CPU builds for making a 3B painfully slow.
  //
  // IT IS A DIRECTORY, NOT A BINARY, which is where this departs from the
  // holochain and lair pins: 62 files, and `llama-server` finds its
  // libraries by `RUNPATH: [$ORIGIN]` — verified with `readelf` — so the
  // folder must stay together and needs no LD_LIBRARY_PATH.
  //
  // VERIFIED END TO END ON THIS MACHINE at b12034: the vulkan-x64 build
  // served `qwen2.5-3b-instruct-q4_k_m.gguf` and answered the adversary's
  // exact constrained request, returning parseable JSON. The sha256 below
  // for that target was computed from the downloaded file and MATCHES the
  // digest GitHub reports, so the other four digests are trustworthy by the
  // same mechanism.
  //
  // NO STABLE RELEASE LINE EXISTS UPSTREAM — llama.cpp tags rolling `b#####`
  // builds, several a day — so this pin will go stale silently.
  runtime: {
    build: 'b12034',
    assets: {
      'x86_64-unknown-linux-gnu': {
        name: 'llama-b12034-bin-ubuntu-vulkan-x64.tar.gz',
        sha256: '18e0524d245fbf4395421a73ed9fc7c911b2c081aaf1a24a708512fcc49e6144',
      },
      'aarch64-unknown-linux-gnu': {
        name: 'llama-b12034-bin-ubuntu-vulkan-arm64.tar.gz',
        sha256: '8cd30402acc619d5d5aa1ac03f3af2157c4744a7e5346a0ea09c064de69d24a1',
      },
      'x86_64-pc-windows-msvc.exe': {
        name: 'llama-b12034-bin-win-vulkan-x64.zip',
        sha256: 'df6ab37942d02aeb8ab3de5984711ea866826a94d50f7a9c5960a0d18a9d4269',
      },
      'aarch64-apple-darwin': {
        name: 'llama-b12034-bin-macos-arm64.tar.gz',
        sha256: 'ce1893ad52bd5db86227624d1777ccc0f2b211d1621cfcd393a886dbd2ac1d9b',
      },
      'x86_64-apple-darwin': {
        name: 'llama-b12034-bin-macos-x64.tar.gz',
        sha256: '79f1e86d763d2670a683aff0aa28d2547023f84d63d50cac21c3084f14d15c79',
      },
    },
  },

  // THE COMPOSE-TIME ADVERSARY'S WEIGHTS — epistemic-happ open-work 6.10.
  //
  // Qwen2.5-3B-Instruct Q4_K_M, which is the model the spike actually
  // measured: four runs across two models and two serving paths established
  // that the objection TEXT is consistently worth having at this size, and
  // that what a small model gets wrong is the MODE LABEL — which this feature
  // does not use. So the quality objection to a 3B lands on the half being
  // discarded.
  //
  // THE SHA256 AND THE LENGTH ARE FROM THE FILE THE SPIKE RAN AGAINST, read
  // off disk rather than copied from a page:
  //
  //   sha256  626b4a6678b86442240e33df819e00132d3ba7dddfe1cdc4fbb18e0a9615c62d
  //   bytes   2104932768
  //
  // PINNED THE WAY THE HOLOCHAIN AND LAIR BINARIES ARE, and for the same
  // reason: weights are trustworthy by hash or not at all, and a URL that
  // quietly starts serving something else is a supply-chain problem rather
  // than a download problem. `modelManager.ts` discards a partial that fails
  // this hash instead of keeping it for a resume.
  //
  // PORT 11434 MATCHES `adversary.ts`'s `DEFAULT_ADVERSARY_ORIGIN` in the happ
  // repository. If one moves, both move — there is no discovery here, and a
  // mismatch presents as "no model is answering" with nothing to debug.
  model: {
    filename: 'qwen2.5-3b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
    sha256: '626b4a6678b86442240e33df819e00132d3ba7dddfe1cdc4fbb18e0a9615c62d',
    bytes: 2104932768,
    port: 11434,
  },

  bins: {
    holochainVersion: '0.7.0',
    compatibleDeps: {
      '0.7': {
        '@holochain/client': '0.21',
        '@holochain/hc-spin-rust-utils': '0.700',
      },
    },
    holochain: {
      sha256: {
        'x86_64-unknown-linux-gnu':
          'ffa40a0c6fab5ce062c4af76328dfe2de143256ddf791a504d72bca698a9ba20',
        'aarch64-unknown-linux-gnu':
          'a01a6b0be4a6fa52276fb0aca94559a05457bbad495bdd01802208d3f3649e51',
        'x86_64-pc-windows-msvc.exe':
          '5d9bd8cf28c45645158d56198cfec38d04ac4cf620ba89ca37db2f7c46d7b3d2',
        'x86_64-apple-darwin': '53d48d0f92fdfb2d70cd302a3782df142ab324c023943319d2c33226a79dea0c',
        'aarch64-apple-darwin': 'fa44e56402294221cad34933bfe12e079460aa22acf98723f5b4e68e3e33cc3b',
      },
    },
    lair: {
      sha256: {
        'x86_64-unknown-linux-gnu':
          '7a77822ab5e0020d0f3c358030d4ccfa8c6c144407a5c075d302c7b0fcf670c1',
        'aarch64-unknown-linux-gnu':
          'efb5894d76ee8d58845445e1b6a3ff18d721345943e545457331825fb799b08c',
        'x86_64-pc-windows-msvc.exe':
          '2c1fded6eb7c6ec4b3d033c6a310d7c2cc916d6e0ac10c2f71047ebb6b623f6b',
        'x86_64-apple-darwin': 'afcaefac4f93828e59566f185d7398b7d5d7afaa43ef4b95bd9c42f0b967d7b8',
        'aarch64-apple-darwin': 'e8fcdf26c0b1a51e5ab93a82333b5db92f0a8a6effb8494fdbb0dc000856ded8',
      },
    },
  },
});
