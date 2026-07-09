/**
 * A ~60-line levelled logger. The only module in `src/` allowed to touch the console — ESLint
 * enforces that. Structured JSON in production so a log drain can parse it; readable lines in
 * development so a human can.
 */

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export type LogMeta = Record<string, unknown>;

export interface Logger {
  debug(message: string, meta?: LogMeta): void;
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, meta?: LogMeta): void;
  /** Returns a logger that stamps every line with `bindings`, e.g. `{ importId }`. */
  child(bindings: LogMeta): Logger;
}

export interface LoggerOptions {
  level: LogLevel;
  pretty: boolean;
}

const CONSOLE_METHOD: Record<Exclude<LogLevel, 'silent'>, 'debug' | 'info' | 'warn' | 'error'> = {
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
};

function write(
  options: LoggerOptions,
  bindings: LogMeta,
  level: Exclude<LogLevel, 'silent'>,
  message: string,
  meta?: LogMeta,
): void {
  if (SEVERITY[level] < SEVERITY[options.level]) return;

  const fields: LogMeta = { ...bindings, ...meta };
  const method = CONSOLE_METHOD[level];

  if (options.pretty) {
    const suffix = Object.keys(fields).length > 0 ? ` ${JSON.stringify(fields)}` : '';
    console[method](`${level.toUpperCase().padEnd(5)} ${message}${suffix}`);
    return;
  }

  console[method](JSON.stringify({ level, time: new Date().toISOString(), message, ...fields }));
}

export function createLogger(options: LoggerOptions, bindings: LogMeta = {}): Logger {
  return {
    debug: (message, meta) => write(options, bindings, 'debug', message, meta),
    info: (message, meta) => write(options, bindings, 'info', message, meta),
    warn: (message, meta) => write(options, bindings, 'warn', message, meta),
    error: (message, meta) => write(options, bindings, 'error', message, meta),
    child: (extra) => createLogger(options, { ...bindings, ...extra }),
  };
}

/** A logger that swallows everything. Handy in tests. */
export const silentLogger: Logger = createLogger({ level: 'silent', pretty: false });
