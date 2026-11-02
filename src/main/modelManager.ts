// ============================================================================
// src/main/modelManager.ts — the weights half of epistemic-happ's open-work
// 6.10, which is the half the app repository cannot do.
//
// WHAT THIS IS FOR. The compose-time adversary reads a draft claim before it
// is published and says what it will be asked. It runs on a model that this
// app CARRIES rather than one the person already has: routing through
// somebody's own Your Own AI was the right shape and lost on availability
// (`X-Your-Own-AI-Memory: off` is honoured in agent mode only, agent mode
// needs an agentic model that fits, and that excludes a 4GB card), and a
// hosted API was refused outright because the text of drafts the author never
// publishes must not leave the machine.
//
// PULLED ON FIRST USE, NOT BUNDLED, and the numbers are the whole argument:
// the installers are 113-150MB and the model is ~2.1GB, so bundling would
// make each of six platform artifacts about fifteen times larger.
//
// AND IT SHIPS AS A PATCH. `breakingVersion` maps `0.<minor>.<patch>` to
// `0.<minor>.x`, and that string is the network-seed suffix, a path segment
// for `userData`, AND the auto-update compatibility gate. A minor here is a
// network migration event: new seed, new keystore, new agent key, and
// electron-updater refusing to offer the update at all so existing installs
// are stranded rather than moved. Adding a model is app-side and does not
// touch the DNA hash, so a patch is accurate rather than a loophole — see
// `kangaroo.config.ts`, which proves that for `v0.3.1` by hashing both
// webhapps.
//
// ============================================================================
// THE RUNTIME IS NOT PINNED YET, AND THAT IS A DECISION RATHER THAN AN
// OMISSION. Everything below works on the weights; serving them needs an
// inference server binary, and WHICH ONE is unresolved for reasons that are
// not technical:
//
//   - llama.cpp is MIT and publishes per-platform releases, but in several
//     accelerated variants (CPU, Vulkan, CUDA, Metal, HIP). Shipping the
//     CPU build makes a 3B painfully slow; shipping an accelerated one
//     either assumes a toolkit is present or multiplies the matrix.
//   - the known-good binary on the author's own machine came from Your Own
//     AI's build tree, not from a release — and Your Own AI is AGPL, so
//     redistributing its output inside this app is a licensing question
//     before it is an engineering one.
//
// ONE THING THE ROW DID NOT NOTICE, in favour of carrying the runtime: a
// hand-run `llama-server -ngl 20` fits a 3B on the 4GB GTX 970 by splitting
// layers across GPU and CPU, which is exactly what Your Own AI refuses to do
// and exactly why that route was unavailable. So carrying the runtime is the
// only route measured to work on the hardware this project actually has.
//
// Until it is pinned, `serverCommand()` returns null, `start()` refuses, and
// the app serves nothing — which the UI already reports honestly as "no model
// is answering … may still be downloading" rather than as a draft with no
// objections. That is the correct behaviour for an absent runtime and is why
// this file can land before the decision.
// ============================================================================

import * as childProcess from 'child_process';
import fs from 'fs';
import path from 'path';
import { KangarooFileSystem } from './filesystem';
import { KANGAROO_CONFIG } from './const';
import {
  bytesOnDisk, downloadPinned, DownloadCancelled, type PinnedFile,
} from './pinnedDownload';

export type ModelState =
  | 'runtime-missing'
  | 'absent'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'serving'
  | 'failed';

export interface ModelStatus {
  state: ModelState;
  /** Bytes on disk for a download in flight or complete. */
  bytes: number;
  /** Total expected, from the pinned config — known BEFORE the request, so a
   * progress bar never has to wait for a `content-length`. */
  totalBytes: number;
  /** Set when `state` is `failed`, and never a bare "download failed": the
   * screen distinguishes a refused download from a cancelled one from a
   * corrupt one. */
  error: string | null;
  /** Where the port is, once serving. Null otherwise. */
  endpoint: string | null;
}

const MODEL = KANGAROO_CONFIG.model;

export class ModelManager {
  private inFlight: AbortController | null = null;
  private serverHandle: childProcess.ChildProcessWithoutNullStreams | null = null;
  private state: ModelState = 'absent';
  private error: string | null = null;

  /** The pinned file's path. One name, from the config, so a half-written
   * file from an older pin is never mistaken for this one. */
  modelPath(): string {
    return path.join(KangarooFileSystem.modelsDir(), MODEL.filename);
  }


  /** The runtime binary and its arguments, or null while the runtime is
   * unpinned. See the header: this is a licensing and build-variant decision
   * rather than a missing line of code. */
  private serverCommand(): { binary: string; args: string[] } | null {
    return null;
  }

  status(): ModelStatus {
    const present = fs.existsSync(this.modelPath());
    let state = this.state;
    if (state === 'absent' && present) state = 'ready';
    if (this.serverCommand() === null && (state === 'absent' || state === 'ready')) {
      // SAID AS ITS OWN STATE rather than reported as a missing model. An
      // author whose weights downloaded fine should not be told to download
      // them again because nothing can serve them.
      state = 'runtime-missing';
    }
    return {
      state,
      bytes: bytesOnDisk(this.pin()),
      totalBytes: MODEL.bytes,
      error: this.error,
      endpoint: state === 'serving' ? `http://127.0.0.1:${MODEL.port}/v1` : null,
    };
  }

  /** Download the pinned weights, resuming a partial file if one is there.
   *
   * THE LOGIC LIVES IN `pinnedDownload.ts` so that it can be tested: resume,
   * hash mismatch and cancel are where a download manager goes wrong, and
   * behind this file's `electron` import none of them could be exercised
   * without launching an app. This method is the Electron-facing shell —
   * state, paths from config, and progress translated into a `ModelStatus`
   * the renderer already understands. */
  async download(onProgress?: (status: ModelStatus) => void): Promise<void> {
    if (this.inFlight) throw new Error('a download is already in flight');
    if (fs.existsSync(this.modelPath())) { this.state = 'ready'; return; }

    const controller = new AbortController();
    this.inFlight = controller;
    this.state = 'downloading';
    this.error = null;

    try {
      await downloadPinned(this.pin(), controller.signal, (p) => {
        this.state = p.verifying ? 'verifying' : 'downloading';
        onProgress?.({
          state: this.state, bytes: p.bytes, totalBytes: p.totalBytes,
          error: null, endpoint: null,
        });
      });
      this.state = 'ready';
    } catch (err) {
      const cancelled = err instanceof DownloadCancelled || controller.signal.aborted;
      // CANCELLED AND FAILED ARE DIFFERENT STATES, and a cancelled download
      // leaves its partial in place so the next attempt resumes rather than
      // restarting a multi-gigabyte transfer.
      this.state = cancelled ? 'absent' : 'failed';
      this.error = cancelled ? null : (err instanceof Error ? err.message : String(err));
      if (!cancelled) throw err;
    } finally {
      this.inFlight = null;
      onProgress?.(this.status());
    }
  }

  private pin(): PinnedFile {
    return {
      url: MODEL.url,
      finalPath: this.modelPath(),
      partPath: `${this.modelPath()}.part`,
      sha256: MODEL.sha256,
      totalBytes: MODEL.bytes,
    };
  }

  /** Stop a download in flight. The partial stays on disk. */
  cancel(): void {
    this.inFlight?.abort();
  }

  /** Serve the weights, if there is anything to serve them with. */
  start(): ModelStatus {
    if (this.serverHandle) return this.status();
    const command = this.serverCommand();
    if (command === null) {
      this.state = 'runtime-missing';
      return this.status();
    }
    if (!fs.existsSync(this.modelPath())) {
      this.state = 'absent';
      return this.status();
    }
    const handle = childProcess.spawn(command.binary, command.args, {});
    handle.stdout.on('data', (d) => console.log('[model]', d.toString().trim()));
    handle.stderr.on('data', (d) => console.log('[model]', d.toString().trim()));
    handle.on('exit', (code) => {
      console.log('[model] server exited with', code);
      this.serverHandle = null;
      // AN EXIT IS NOT A SUCCESS. The server leaving is reported as a failure
      // state rather than falling silently back to `ready`, because `ready`
      // on a dead server is what makes a draft look un-objected-to.
      if (this.state === 'serving') {
        this.state = 'failed';
        this.error = `the inference server exited (${code}).`;
      }
    });
    this.serverHandle = handle;
    this.state = 'serving';
    return this.status();
  }

  /** Called from `before-quit` alongside lair and the conductor. */
  stop(): void {
    this.inFlight?.abort();
    if (this.serverHandle) {
      this.serverHandle.kill();
      this.serverHandle = null;
    }
    if (this.state === 'serving') this.state = 'ready';
  }
}

