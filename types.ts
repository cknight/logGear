import { Level } from "./levels.ts";

export interface Stream {
  logHeader?(meta: LogMeta): void;
  logFooter?(meta: LogMeta): void;
  setup?(): void;
  destroy?(): void;
  handle(logRecord: LogRecord): void;
}

export interface Formatter<T> {
  format(logRecord: LogRecord): T;
}

export type TriggerFn = (logRecord: LogRecord) => void;

export interface Trigger {
  check: TriggerFn;
}

export type FilterFn = (stream: Stream, logRecord: LogRecord) => boolean;

export interface Filter {
  shouldFilterOut: FilterFn;
}

export type ObfuscatorFn = (stream: Stream, logRecord: LogRecord) => LogRecord;

export interface Obfuscator {
  obfuscate: ObfuscatorFn;
}

export interface LogRecord {
  readonly msg: unknown;
  readonly metadata: unknown[];
  readonly dateTime: Date;
  readonly level: Level;
}

export interface LogMeta {
  readonly logCount: Map<Level, number>;
  readonly hostname: string;
  minLogLevel: Level;
  minLogLevelFrom: string;
  unableToReadEnvVar: boolean;
}
