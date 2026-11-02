import fs from 'fs';
import path from 'path';

/**
 * REMEMBERING WHERE THE NETWORK LIVES — open-work item 7.14, the `[M]` half.
 *
 * WHY THIS EXISTS. Peer discovery for every installed copy runs on
 * `dev-test-bootstrap2.holochain.org`, which is Holochain's own development
 * and testing infrastructure: not run by this project, and nobody has
 * promised to keep it running. The fix has two halves, and the other one is
 * ops. This is the half that makes the first one usable at all.
 *
 * `--bootstrap-url` and `--relay-url` already existed, and both were
 * documented as **not persisted across restarts**. That is fine for four
 * invited people, who can be told to relaunch with a flag. It is a hard
 * blocker for anyone arriving from a link: you cannot tell a crowd to pass a
 * flag, and the symptom of not passing it — peers never finding each other —
 * is indistinguishable from the app being broken. So moving the network
 * meant rebuilding and redistributing the bundle, for a value that is
 * configuration rather than code.
 *
 * WHAT IS STORED, AND WHERE. A single small JSON file in the profile's data
 * directory, beside the conductor and the keystore. It is therefore scoped to
 * the breaking version AND the profile, exactly like every other piece of
 * state this app keeps. A minor bump does not inherit it — which is correct
 * rather than a limitation: a minor is a different network, and the installer
 * that carries it also carries fresh defaults in `kangaroo.config.ts`.
 *
 * WHAT IS NOT STORED. `--signal-url` and `--ice-urls` were declared on the
 * CLI and read by nothing — they are tx5-era options that Holochain 0.7's
 * iroh networking has no equivalent for, and the conductor config this app
 * writes has only `bootstrap_url` and `relay_url`. They were accepted and
 * silently discarded, which is worse than not persisting; they are gone.
 */

export interface NetworkOverride {
  bootstrapUrl?: string;
  relayUrl?: string;
}

/** Where the override lives, given a profile's data directory. */
export function networkOverridePath(profileDataDir: string): string {
  return path.join(profileDataDir, 'network-override.json');
}

/**
 * Read the stored override. Returns `{}` for every failure — absent file,
 * unparseable JSON, wrong shape, a value that is not a valid URL.
 *
 * DELIBERATELY NOT FATAL. A corrupt override is a reason to fall back to the
 * built-in defaults and say so, not a reason to refuse to start: the whole
 * point of this file is to be reachable when the network has moved, and an
 * app that will not launch cannot be pointed anywhere. Anything rejected here
 * is reported by the caller rather than swallowed.
 */
export function readNetworkOverride(profileDataDir: string): {
  override: NetworkOverride;
  problems: string[];
} {
  const file = networkOverridePath(profileDataDir);
  const problems: string[] = [];

  if (!fs.existsSync(file)) return { override: {}, problems };

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    problems.push(`${file} is not valid JSON (${e}); ignoring it and using the built-in defaults.`);
    return { override: {}, problems };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    problems.push(`${file} does not contain a JSON object; ignoring it.`);
    return { override: {}, problems };
  }

  const raw = parsed as Record<string, unknown>;
  const override: NetworkOverride = {};

  for (const key of ['bootstrapUrl', 'relayUrl'] as const) {
    const value = raw[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string') {
      problems.push(`${key} in ${file} is not a string; ignoring that field.`);
      continue;
    }
    if (!isValidUrl(value)) {
      problems.push(`${key} in ${file} is not a valid URL ('${value}'); ignoring that field.`);
      continue;
    }
    override[key] = value;
  }

  return { override, problems };
}

/** Merge new values into the stored override and write it back. */
export function writeNetworkOverride(
  profileDataDir: string,
  update: NetworkOverride
): NetworkOverride {
  const { override } = readNetworkOverride(profileDataDir);
  const merged: NetworkOverride = { ...override };

  if (update.bootstrapUrl !== undefined) merged.bootstrapUrl = update.bootstrapUrl;
  if (update.relayUrl !== undefined) merged.relayUrl = update.relayUrl;

  fs.writeFileSync(networkOverridePath(profileDataDir), `${JSON.stringify(merged, null, 2)}\n`);
  return merged;
}

/**
 * Delete the stored override, returning whether there was one.
 *
 * THIS IS THE ESCAPE HATCH AND IT IS NOT OPTIONAL. Persisting a bad URL is
 * the one way this feature can make things worse than the flag-only
 * behaviour it replaces: a wrong value would otherwise survive every restart
 * with no way out short of finding and deleting a file whose location nobody
 * has been told. `--reset-network-config` is that way out.
 */
export function clearNetworkOverride(profileDataDir: string): boolean {
  const file = networkOverridePath(profileDataDir);
  if (!fs.existsSync(file)) return false;
  fs.rmSync(file);
  return true;
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Work out which URL actually gets used, and say where it came from.
 *
 * Precedence is flag, then stored, then the value compiled into the bundle.
 * The source is returned rather than inferred because "which bootstrap server
 * is this install actually on?" is the first question when peers cannot find
 * each other, and it should be answerable from the log rather than by
 * reading three files.
 */
export function resolveNetworkUrl(
  flag: string | undefined,
  stored: string | undefined,
  builtIn: string
): { url: string; source: 'flag' | 'stored' | 'built-in' } {
  if (flag) return { url: flag, source: 'flag' };
  if (stored) return { url: stored, source: 'stored' };
  return { url: builtIn, source: 'built-in' };
}
