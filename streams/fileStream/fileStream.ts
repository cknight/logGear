import { BaseStream } from "../baseStream.ts";
import { LogMeta, LogRecord } from "../../types.ts";
import { TokenReplacer } from "../../formatters/tokenReplacer.ts";
import { Level } from "../../logger/levels.ts";
import { LogFileInitStrategy, RotationStrategy } from "./types.ts";
import { BufWriterSync } from "./deps.ts";

/**
 * A stream for log messages to go to a file.  You may also configure the following:
 * * Max buffer size (default 8192 bytes)
 * * Log file rotation strategy (default none)
 * * Log file retention policy (default none)
 * * Log file initialization strategy (default "append")
 */
export class FileStream extends BaseStream {
  #filename: string;
  #rotationStrategy: RotationStrategy | undefined = undefined;
  #logFileInitStrategy: LogFileInitStrategy = "append";
  #maxBufferSize: number = 8192;
  #buffer!: BufWriterSync;
  #logFile!: Deno.File;
  #deferredLogQueue: LogRecord[] = [];
  #encoder = new TextEncoder();

  constructor(filename: string) {
    super(new TokenReplacer());
    this.#filename = filename;
  }

  setup(): void {
    super.setup();

    if (this.#rotationStrategy !== undefined) {
      this.#rotationStrategy.initLogs(
        this.#filename,
        this.#logFileInitStrategy,
      );
    }

    const openOptions = {
      createNew: this.#logFileInitStrategy === "mustNotExist",
      create: this.#logFileInitStrategy !== "mustNotExist",
      append: this.#logFileInitStrategy === "append",
      truncate: this.#logFileInitStrategy !== "append",
      write: true,
    };
    this.#logFile = Deno.openSync(this.#filename, openOptions);
    this.#buffer = new BufWriterSync(this.#logFile, this.#maxBufferSize);
  }

  destroy(): void {
    super.destroy();
    this.flush();
    this.#logFile.close();
  }

  logHeader(meta: LogMeta): void {
    if (!this.outputHeader) return;
    super.logHeader(meta);
  }

  logFooter(meta: LogMeta): void {
    if (!this.outputFooter) return;
    super.logFooter(meta);
  }

  handle(logRecord: LogRecord): void {
    if (this.minLogLevel > logRecord.level) return;

    if (logRecord.level > Level.ERROR) {
      this.#deferredLogQueue.push(logRecord);
      this.processDeferredQueue();
      this.flush();
    } else {
      if (this.#deferredLogQueue.length === 0) {
        queueMicrotask(() => {
          this.processDeferredQueue();
        });
      }
      this.#deferredLogQueue.push(logRecord);
    }
  }

  private processDeferredQueue() {
    for (let i = 0; i < this.#deferredLogQueue.length; i++) {
      const msg = this.format(this.#deferredLogQueue[i]);
      this.log(msg);
    }
    this.#deferredLogQueue = [];
  }

  log(msg: string): void {
    const encodedMsg = this.#encoder.encode(msg + "\n");
    if (
      this.#maxBufferSize > 0 &&
      this.#rotationStrategy?.shouldRotate(encodedMsg)
    ) {
      this.flush();
      Deno.close(this.#logFile.rid);
      this.#rotationStrategy.rotate(this.#filename, encodedMsg);
      this.#logFile = Deno.openSync(
        this.#filename,
        { createNew: true, write: true },
      );
      this.#buffer = new BufWriterSync(this.#logFile, this.#maxBufferSize);
    }
    this.#buffer.writeSync(encodedMsg);
  }

  /** Force a flush of the log buffer */
  flush(): void {
    if (this.#deferredLogQueue.length > 0) {
      this.processDeferredQueue();
    }
    if (this.#buffer?.buffered() > 0) {
      this.#buffer.flush();
    }
  }

  /** The strategy to use for rotating log files. Examples:
   * ```typescript
   * every(20000).bytes()
   * every(7).days()
   * every(12).hours()
   * every(90).minutes()
   * ```
   */
  withLogFileRotation(strategy: RotationStrategy): this {
    this.#rotationStrategy = strategy;
    return this;
  }

  /** The maximum size in bytes of the buffer storage before it is flushed. */
  withBufferSize(bytes: number): this {
    if (bytes < 0) {
      throw new Error("Buffer size cannot be negative");
    }
    this.#maxBufferSize = bytes;
    return this;
  }

  /** The strategy to take when initializing logs:
   * * `"append"` - Reuse log file if it exists, create otherwise
   * * `"overwrite"` - Always start with an empty log file, overwriting any existing one
   * * `"mustNotExist"` - Always start with an empty log file, but throw an error if it
   * already exists
   */
  withLogFileInitMode(mode: LogFileInitStrategy): this {
    this.#logFileInitStrategy = mode;
    return this;
  }
}