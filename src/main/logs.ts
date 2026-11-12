import winston, { createLogger, transports, format } from 'winston';
import path from 'path';
import fs from 'fs';
import { KangarooFileSystem } from './filesystem';
import {
  HOLOCHAIN_ERROR,
  HOLOCHAIN_LOG,
  HolochainData,
  HolochainVersion,
  LAIR_ERROR,
  LAIR_LOG,
  WASM_LOG,
  KANGAROO_ERROR,
  KANGAROO_LOG,
  KangarooEmitter,
} from './eventEmitter';
import { KANGAROO_CONFIG } from './const';

const { combine, timestamp } = format;

const HOLOCHAIN_LOGGERS: Record<HolochainVersion, winston.Logger> = {};

// TODO define class LauncherLogger that can log all lair, holochain and launcher-specific stuff
// with methods logLair, logHolochain, logLauncher, logHapp, ...

let LOG_FILE_TRANSPORT: winston.transports.FileTransportInstance | undefined;

/**
 * The one rotating file transport every logger in this file shares.
 *
 * HOISTED OUT OF `setupLogs` SO THE AUTO-UPDATER CAN WRITE INTO THE SAME FILE
 * THE "EXPORT LOGS" BUTTON SHIPS. `electron-updater`'s logger defaults to
 * `console` (`AppUpdater.js:142`), and its constructor registers its own
 * `on("error")` handler whose entire body is `this._logger.error(...)`. In a
 * packaged app that stdout belongs to no terminal, so every way an update can
 * fail failed leaving no trace anywhere a participant or this repository could
 * look — which is how a pilot participant came to report an update button that
 * "does nothing" with nothing for us to read afterwards. The profile log file
 * is the only durable surface this app has, so the updater gets a transport
 * onto it rather than a logger of its own.
 */
function sharedLogFileTransport(
  kangarooFs: KangarooFileSystem,
): winston.transports.FileTransportInstance {
  if (LOG_FILE_TRANSPORT) return LOG_FILE_TRANSPORT;

  const logFilePath = path.join(
    kangarooFs.profileLogsDir,
    `${KANGAROO_CONFIG.productName.replace(' ', '_')}.log`,
  );
  if (fs.existsSync(logFilePath)) {
    const stats = fs.statSync(logFilePath);
    // If existing logfile is larger than 1GB, delete it
    if (stats.size > 1e9) {
      console.log("Found a log file that's larger than 1GB. Deleting it.");
      fs.rmSync(logFilePath);
    }
  }

  // Use log file rotation with max size of a single file of 50MB and max 5 total files
  LOG_FILE_TRANSPORT = new transports.File({
    filename: logFilePath,
    maxsize: 50_000_000,
    maxFiles: 5,
  });
  return LOG_FILE_TRANSPORT;
}

/**
 * A logger for `electron-updater`, shaped to the `{ info, warn, error, debug }`
 * interface `autoUpdater.logger` accepts.
 *
 * Every line still goes to `console`, which is what the updater did on its own
 * and is worth keeping when the app is run from a terminal. What is new is the
 * second destination: the profile's log file, so an update that failed is
 * answerable after the fact by exporting logs instead of being unrecoverable.
 */
export function createUpdaterLogger(kangarooFs: KangarooFileSystem): {
  info: (message?: unknown) => void;
  warn: (message?: unknown) => void;
  error: (message?: unknown) => void;
  debug: (message?: unknown) => void;
} {
  const logger = createUpdaterFileLogger(sharedLogFileTransport(kangarooFs));

  const write =
    (level: 'info' | 'warn' | 'error') =>
    (message?: unknown): void => {
      const text = message instanceof Error ? (message.stack ?? message.message) : String(message);
      const logLine = `[UPDATER] ${level === 'info' ? '' : `${level.toUpperCase()}: `}${text}`;
      if (level === 'error') {
        console.error(logLine);
      } else {
        console.log(logLine);
      }
      logger.log(level, text);
    };

  return {
    info: write('info'),
    warn: write('warn'),
    error: write('error'),
    // winston's default level is `info`, which would drop `debug` entirely. The
    // updater's debug lines are its most useful ones when a platform's install
    // step is what failed, so they are kept at `info` rather than discarded.
    debug: write('info'),
  };
}

export function setupLogs(
  kangarooEmitter: KangarooEmitter,
  kangarooFs: KangarooFileSystem,
  holochainLogsToTerminal: boolean,
) {
  const logFileTransport = sharedLogFileTransport(kangarooFs);

  const lairLogger = createLairLogger(logFileTransport);

  kangarooEmitter.on(LAIR_LOG, (log) => {
    const logLine = `[LAIR] ${log}`;
    console.log(logLine);
    lairLogger.log('info', logLine);
  });
  kangarooEmitter.on(LAIR_ERROR, (log) => {
    const logLine = `[LAIR] ERROR: ${log}`;
    console.error(logLine);
    lairLogger.log('info', logLine);
  });
  kangarooEmitter.on(KANGAROO_ERROR, (log) => {
    const logLine = `[${KANGAROO_CONFIG.productName}] ERROR: ${log}`;
    console.error(logLine);
    lairLogger.log('info', logLine);
  });
  kangarooEmitter.on(KANGAROO_LOG, (log) => {
    const logLine = `[${KANGAROO_CONFIG.productName}] ${log}`;
    console.log(logLine);
    lairLogger.log('info', logLine);
  });
  kangarooEmitter.on(HOLOCHAIN_LOG, (holochainData) => {
    logHolochain(holochainData as HolochainData, logFileTransport, holochainLogsToTerminal);
  });
  kangarooEmitter.on(HOLOCHAIN_ERROR, (holochainData) => {
    logHolochain(holochainData as HolochainData, logFileTransport, holochainLogsToTerminal);
  });
  kangarooEmitter.on(WASM_LOG, (holochainData) => {
    logHolochain(holochainData as HolochainData, logFileTransport, holochainLogsToTerminal);
  });
}

function logHolochain(
  holochainData: HolochainData,
  logFileTransport: winston.transports.FileTransportInstance,
  printToTerminal: boolean,
) {
  const holochainVersion = (holochainData as HolochainData).version;
  const line = (holochainData as HolochainData).data;
  if (printToTerminal) {
    const logLine = `[HOLOCHAIN ${holochainVersion}]: ${line}`;
    console.log(logLine);
  }
  let logger = HOLOCHAIN_LOGGERS[holochainVersion];
  if (logger) {
    logger.log('info', line);
  } else {
    logger = createHolochainLogger(holochainVersion, logFileTransport);
    HOLOCHAIN_LOGGERS[holochainVersion] = logger;
    logger.log('info', line);
  }
}

function createHolochainLogger(
  holochainVersion: HolochainVersion,
  logFileTransport: winston.transports.FileTransportInstance,
): winston.Logger {
  return createLogger({
    transports: [logFileTransport],
    format: combine(
      timestamp(),
      format.printf(({ level, message, timestamp }) => {
        return JSON.stringify({
          timestamp,
          label: `HOLOCHAIN ${holochainVersion}`,
          level,
          message,
        });
      }),
    ),
  });
}

function createUpdaterFileLogger(
  logFileTransport: winston.transports.FileTransportInstance,
): winston.Logger {
  return createLogger({
    transports: [logFileTransport],
    format: combine(
      timestamp(),
      format.printf(({ level, message, timestamp }) => {
        return JSON.stringify({
          timestamp,
          label: 'UPDATER',
          level,
          message,
        });
      }),
    ),
  });
}

function createLairLogger(
  logFileTransport: winston.transports.FileTransportInstance,
): winston.Logger {
  return createLogger({
    transports: [logFileTransport],
    format: combine(
      timestamp(),
      format.printf(({ level, message, timestamp }) => {
        return JSON.stringify({
          timestamp,
          label: 'LAIR',
          level,
          message,
        });
      }),
    ),
  });
}
