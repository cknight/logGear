import { LogFileInitStrategy, Periods } from "./types.ts";
import { LogFileRetentionPolicy, of } from "./retentionPolicy.ts";

export interface RotationStrategy {
  initLogs(filename: string, initStrategy: LogFileInitStrategy): void;
  shouldRotate(logMessage: unknown): boolean;
  rotate(filename: string, logMessage: unknown): void;
  withLogFileRetentionPolicy(
    logFileRetentionPolicy: LogFileRetentionPolicy,
  ): this;
}

export function every(quantity: number): OngoingRotationStrategy {
  return new OngoingRotationStrategy(quantity);
}

class ByteRotationStrategy implements RotationStrategy {
  #maxBytes: number;
  #logFileRetentionPolicy: LogFileRetentionPolicy = of(7).files();
  #currentFileSize = 0;

  constructor(maxBytes: number) {
    if (maxBytes < 1) {
      throw new Error("Max bytes cannot be less than 1");
    }
    this.#maxBytes = maxBytes;
  }

  get maxBytes(): number {
    return this.#maxBytes;
  }

  get currentFileSize(): number {
    return this.#currentFileSize;
  }

  initLogs(filename: string, initStrategy: LogFileInitStrategy): void {
    if (initStrategy === "append") {
      const fi = fileInfo(filename);
      this.#currentFileSize = fi ? fi.size : 0;
    } /* overwrite or mustNotExist */ else {
      if (this.#logFileRetentionPolicy.type === "files") {
        for (let i = 1; i <= this.#logFileRetentionPolicy.quantity; i++) {
          // e.g. check (mustNotExist) or remove (overwrite) log.txt.1, log.txt.2
          // ... up to log.txt.#maxArchivesStrategy.quantity
          if (exists(filename + "." + i)) {
            if (initStrategy === "mustNotExist") {
              throw new Error(
                "Found existing log file which must not exist: " + filename +
                  "." + i,
              );
            } else {
              Deno.removeSync(filename + "." + i);
            }
          }
        }
      } /* dateTime strategy */ else {
        // get list of all files in directory
        const logFiles = getLogFilesInDir(
          filename,
          this.#logFileRetentionPolicy.type === "days"
            ? matchesDatePattern
            : matchesDateTimePattern,
        );
        // Now remove log.txt.1, log.txt.2 ... up to max age (in days or hours)
        for (let logFile in logFiles) {
          const maxTimeAgo = this.#logFileRetentionPolicy.maxPeriodDate();
          const fileInfo = Deno.statSync(logFile).birthtime;
          if (fileInfo && fileInfo.getTime() >= maxTimeAgo.getTime()) {
            if (initStrategy === "mustNotExist") {
              throw new Error(
                "Found log file within defined maximum archive constraints which must not exist: " +
                  logFile,
              );
            } else {
              Deno.removeSync(logFile);
            }
          }
        }
      }
    }
  }

  shouldRotate(encodedMessage: unknown): boolean {
    const msg: Uint8Array = encodedMessage as Uint8Array;
    const msgByteLength = msg.byteLength;
    return (this.#currentFileSize + msgByteLength) > this.#maxBytes;
  }

  rotate(filename: string, logMessage: unknown): void {
    let maxFiles = this.#logFileRetentionPolicy.quantity;

    if (this.#logFileRetentionPolicy.type !== "files") {
      const logFiles = getLogFilesInDir(
        filename,
        this.#logFileRetentionPolicy.type === "days"
          ? matchesDatePattern
          : matchesDateTimePattern,
      );
      maxFiles = 0;
      for (let logFile in logFiles) {
        const matched = logFile.match(/.*\.([\d]+)/);
        if (matched && matched[1]) {
          maxFiles = +matched[1] > maxFiles ? +matched[1] : maxFiles;
        }
      }
    }

    for (let i = maxFiles - 1; i >= 0; i--) {
      const source = filename + (i === 0 ? "" : "." + i);
      const dest = filename + "." + (i + 1);

      if (exists(source)) {
        Deno.renameSync(source, dest);
      }
    }

    this.#currentFileSize = (logMessage as Uint8Array).byteLength;
  }

  withLogFileRetentionPolicy(
    logFileRetentionPolicy: LogFileRetentionPolicy,
  ): this {
    this.#logFileRetentionPolicy = logFileRetentionPolicy;
    return this;
  }
}

class DateTimeRotationStrategy implements RotationStrategy {
  #interval: number;
  #period: Periods;
  #useUTCTime = false;
  #logFileRetentionPolicy: LogFileRetentionPolicy = of(7).files();

  constructor(interval: number, period: Periods) {
    if (interval < 1) {
      throw new Error("DateTime rotation interval cannot be less than 1");
    }
    this.#interval = interval;
    this.#period = period;
  }

  initLogs(filename: string, initStrategy: LogFileInitStrategy): void {}
  shouldRotate(formattedMessage: unknown): boolean {
    return false;
  }
  rotate(filename: string): void {}

  withUTCTime(): this {
    this.#useUTCTime = true;
    return this;
  }

  withLocalTime(): this {
    this.#useUTCTime = false;
    return this;
  }

  withLogFileRetentionPolicy(
    logFileRetentionPolicy: LogFileRetentionPolicy,
  ): this {
    this.#logFileRetentionPolicy = logFileRetentionPolicy;
    return this;
  }
}

class OngoingRotationStrategy {
  constructor(private quantity: number) {}
  bytes(): ByteRotationStrategy {
    return new ByteRotationStrategy(this.quantity);
  }
  minutes(): DateTimeRotationStrategy {
    return new DateTimeRotationStrategy(this.quantity, "minutes");
  }
  hours(): DateTimeRotationStrategy {
    return new DateTimeRotationStrategy(this.quantity, "hours");
  }
  days(): DateTimeRotationStrategy {
    return new DateTimeRotationStrategy(this.quantity, "days");
  }
}

function exists(file: string): boolean {
  return fileInfo(file) !== undefined;
}

function fileInfo(filePath: string): Deno.FileInfo | undefined {
  try {
    return Deno.statSync(filePath);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return undefined;
    }
    throw err;
  }
}

function getLogFilesInDir(
  filename: string,
  patternMatcher: (dirEntryName: string, regExSafeFilename: string) => boolean,
): string[] {
  const matches: string[] = [];

  const dirAndFile = filename.match(/(.*)[\/\\](.*)/);
  const dir: string = dirAndFile == null ? "." : dirAndFile[1];
  const file: string = dirAndFile == null ? filename : dirAndFile[2];
  const regExSafeFilename = escapeForRegExp(file);

  try {
    for (const dirEntry of Deno.readDirSync(dir)) {
      if (
        !dirEntry.isDirectory &&
        patternMatcher(dirEntry.name, regExSafeFilename)
      ) {
        matches.push(join(dir, file));
      }
    }
  } catch (err) {
    // TODO
  }
  return matches;
}

function matchesFilePattern(
  dirEntryName: string,
  regExSafeFilename: string,
): boolean {
  return dirEntryName.match(new RegExp(regExSafeFilename + "_\\d+$")) != null;
}

function matchesDatePattern(
  dirEntryName: string,
  regExSafeFilename: string,
): boolean {
  return dirEntryName.match(
    new RegExp(regExSafeFilename + "_\\d{4}\.\\d{2}\.\\d{2}$"),
  ) != null;
}

function matchesDateTimePattern(
  dirEntryName: string,
  regExSafeFilename: string,
): boolean {
  return dirEntryName.match(
    new RegExp(regExSafeFilename + "_\\d{4}\.\\d{2}\.\\d{2}_\\d{2}\.\\d{2}$"),
  ) != null;
}

function escapeForRegExp(filename: string): string {
  return filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function join(dir: string, file: string) {
  if (Deno.build.os == "windows") {
    return dir + "\\" + file;
  }
  return dir + "/" + file;
}
