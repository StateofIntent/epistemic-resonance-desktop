import { KANGAROO_CONFIG } from './const';
import { breakingAppVersion } from './filesystem';
import { app } from 'electron';

export interface CliOpts {
  profile?: string;
  networkSeed?: string;
  holochainPath?: string;
  lairPath?: string;
  holochainRustLog?: string;
  holochainWasmLog?: string;
  lairRustLog?: string;
  bootstrapUrl?: string;
  relayUrl?: string;
  resetNetworkConfig?: boolean;
  printHolochainLogs?: boolean;
}

export interface RunOptions {
  profile: string | undefined;
  networkSeed: string;
  bootstrapUrl: URL | undefined;
  relayUrl: URL | undefined;
  resetNetworkConfig: boolean;
  holochainPath: string | undefined;
  lairPath: string | undefined;
  holochainRustLog: string | undefined;
  holochainWasmLog: string | undefined;
  lairRustLog: string | undefined;
  printHolochainLogs: boolean;
}

export function validateArgs(args: CliOpts): RunOptions {
  // validate --profile argument
  const allowedProfilePattern = /^[0-9a-zA-Z-]+$/;
  if (args.profile && !allowedProfilePattern.test(args.profile)) {
    throw new Error(
      `The --profile argument may only contain digits (0-9), letters (a-z,A-Z) and dashes (-) but got '${args.profile}'`
    );
  }
  if (args.networkSeed && typeof args.networkSeed !== 'string') {
    throw new Error('The --network-seed argument must be of type string.');
  }
  if (args.bootstrapUrl && typeof args.bootstrapUrl !== 'string') {
    throw new Error('The --bootstrap-url argument must be of type string.');
  }
  if (args.relayUrl && typeof args.relayUrl !== 'string') {
    throw new Error('The --relay-url argument must be of type string.');
  }
  // Fail LOUDLY on a URL that will not parse, rather than at the point where
  // peers mysteriously cannot find each other. `new URL()` below would throw
  // anyway; this says which flag was wrong (item 7.14).
  for (const [flag, value] of [
    ['--bootstrap-url', args.bootstrapUrl],
    ['--relay-url', args.relayUrl],
  ] as const) {
    if (!value) continue;
    try {
      new URL(value);
    } catch {
      throw new Error(`The ${flag} argument is not a valid URL: '${value}'`);
    }
  }
  if (args.holochainPath && typeof args.holochainPath !== 'string') {
    throw new Error('The --holochain-path argument must be of type string.');
  }
  if (args.lairPath && typeof args.lairPath !== 'string') {
    throw new Error('The --lair-path argument must be of type string.');
  }
  if (args.holochainRustLog && typeof args.holochainRustLog !== 'string') {
    throw new Error('The --holochain-rust-log argument must be of type string.');
  }
  if (args.holochainWasmLog && typeof args.holochainWasmLog !== 'string') {
    throw new Error('The --holochain-wasm-log argument must be of type string.');
  }
  if (args.lairRustLog && typeof args.lairRustLog !== 'string') {
    throw new Error('The --lair-rust-log argument must be of type string.');
  }

  const profile = args.profile ? args.profile : undefined;
  // If provided take the one provided, otherwise check whether it's applet dev mode
  const networkSeed = args.networkSeed ? args.networkSeed : defaultAppNetworkSeed();

  const bootstrapUrl = args.bootstrapUrl ? new URL(args.bootstrapUrl) : undefined;
  const relayUrl = args.relayUrl ? new URL(args.relayUrl) : undefined;

  return {
    profile,
    networkSeed,
    bootstrapUrl,
    relayUrl,
    resetNetworkConfig: !!args.resetNetworkConfig,
    holochainPath: args.holochainPath ? args.holochainPath : undefined,
    lairPath: args.lairPath ? args.lairPath : undefined,
    holochainRustLog: args.holochainRustLog ? args.holochainRustLog : undefined,
    holochainWasmLog: args.holochainWasmLog ? args.holochainWasmLog : undefined,
    lairRustLog: args.lairRustLog ? args.lairRustLog : undefined,
    printHolochainLogs: !!args.printHolochainLogs,
  };
}

function defaultAppNetworkSeed() {
  let networkSeed = `${KANGAROO_CONFIG.productName}-${breakingAppVersion()}`;
  if (!app.isPackaged) {
    networkSeed += '-dev';
  }
  return networkSeed;
}
