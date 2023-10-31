import { Duplex } from 'stream';
import { EventEmitter } from 'events';

export interface WireReadUntilOptions {
  /**
   * If the maximum length is exceeded, an error will be thrown.
   */
  maxLength?: number;
}

export interface WireOptions {
  /**
   * Line ending for use with writeLine and readLine functions.
   * Default: \r\n
   */
  ending: string;

  /**
   * If true, will return to flowing state ('readable' events being emitted)
   * after the read promises are resolved.
   * Default: true
   */
  autoResume: boolean;

  /**
   * Timeout after which read functions will throw. (ms)
   * Default: 5000
   */
  timeout: number;
}

export type WireReadableEventListener = (this: Wire) => void;
export type WireErrorEventListener = (this: Wire, error: Error) => void;

export declare interface Wire {
  /**
   * Adds a listener for an readable event.
   * @param event Event type. (readable)
   * @param listener Listener function.
   */
  on(event: 'readable', listener: WireReadableEventListener): this;

  /**
   * Adds a listener for an error event.
   * @param event Event type. (error)
   * @param listener Listener function.
   */
  on(event: 'error', listener: WireErrorEventListener): this;

  /**
   * Adds a listener for an close event.
   * @param event Event type. (close)
   * @param listener Listener function.
   */
  on(event: 'close', listener: () => void): this;

  on(event: string, listener: Function): this;

  /**
   * Removes a listener for an readable event.
   * @param event Event type. (readable)
   * @param listener Listener function.
   */
  off(event: 'readable', listener: WireReadableEventListener): this;

  /**
   * Removes a listener for an error event.
   * @param event Event type. (error)
   * @param listener Listener function.
   */
  off(event: 'error', listener: WireErrorEventListener): this;

  /**
   * Removes a listener for an close event.
   * @param event Event type. (close)
   * @param listener Listener function.
   */
  off(event: 'close', listener: () => void): this;

  off(event: string, listener: Function): this;

  once(event: 'readable', listener: WireReadableEventListener): this;
  once(event: 'error', listener: WireErrorEventListener): this;
  once(event: 'close', listener: () => void): this;

  once(event: string, listener: Function): this;
}

type BufferGenerator = Generator<void, string, void>;
interface BufferGeneratorInfo {
  generator: BufferGenerator;
  resolve: (value: string) => void;
  reject: (error?: any) => void;
  timeout?: any;
}

export class Wire extends EventEmitter {
  private _buffer = '';
  private _bufferGenerators: BufferGeneratorInfo[] = [];
  private _flowing = true;
  private options: WireOptions = {
    ending: '\r\n',
    autoResume: true,
    timeout: 5000,
  };
  private stream?: Duplex = undefined;

  /**
   *
   * @param stream
   * @param options
   */
  constructor(stream: Duplex, options?: Partial<WireOptions>) {
    super();

    this.on('newListener', (event: string, listener: Function) => {
      if (event === 'readable') {
        if (
          !this._bufferGenerators[0] &&
          this._buffer.length > 0 &&
          this._flowing
        ) {
          listener();
        }
      }
    });

    this.handleClose = this.handleClose.bind(this);
    this.handleData = this.handleData.bind(this);
    this.handleError = this.handleError.bind(this);

    this.options = {
      ...this.options,
      ...options,
    };

    stream.setEncoding('utf8');
    this.setStream(stream);
  }

  /**
   * `true` if the stream is readable.
   */
  get readable(): boolean {
    return this.stream?.readable || false;
  }

  /**
   * Destroys the current stream.
   */
  close(): void {
    this.stream?.destroy();
  }

  /**
   * Writes data to the stream.
   * @param data UTF-8 encoded string or buffer.
   */
  write(data: string | Buffer): void {
    const stream = this.assertStream();
    stream.write(data);
  }

  /**
   * Writes a line to the stream, terminated by ending specified in options.
   * @see {WireOptions.ending}
   * @param line UTF-8 encoded string.
   */
  writeLine(line: string): void {
    this.write(`${line}${this.options.ending}`);
  }

  /**
   * Writes multiple lines, one by one.
   * @see {writeLine}
   * @param lines Array of UTF-8 encoded strings.
   */
  writeLines(lines: string[]): void {
    for (const line of lines) {
      this.writeLine(line);
    }
  }

  /**
   * Allows 'readable' event to be emitted (if there are no currently active generators).
   * @see {pause}
   * @see {WireOptions.autoResume}
   */
  resume(): void {
    this._flowing = true;
    this.runGenerator();
  }

  /**
   * Prevents 'readable' event from being emitted.
   * @see {resume}
   * @see {WireOptions.autoResume}
   */
  pause(): void {
    this._flowing = false;
  }

  /**
   * Reads a line from the stream/buffer, terminated by ending (@see {WireOptions.ending}).
   * Pauses (@see {pause}) the current Wire instance, if autoResume (@see {WireOptions.autoResume})
   * is enabled, the instance will be automatically unpaused, otherwise resume (@see {resume})
   * needs to be called.
   * @see {readUntil}
   * @param options
   * @returns String containing the line, excluding the ending.
   */
  readLine(options: WireReadUntilOptions = {}): Promise<string> {
    return this.readUntil(this.options.ending, options);
  }

  /**
   * Reads data from the stream/buffer, terminated by specified sequence (or one of specified sequences).
   * Pauses (@see {pause}) the current Wire instance, if autoResume (@see {WireOptions.autoResume})
   * is enabled, the instance will be automatically unpaused, otherwise resume (@see {resume})
   * needs to be called.
   * @see {readLine}
   * @param sequence The sequence to terminate data by, if an array is specified, the data will be retrieved until one of the sequences in the array is included.
   * @param options
   * @returns String excluding the sequence.
   */
  readUntil(
    sequence: string | string[],
    options: WireReadUntilOptions = {}
  ): Promise<string> {
    return this.generatorPromise(this.readUntilGenerator, sequence, options);
  }

  /**
   * Reads data from the stream/buffer, until it reaches specified length.
   * Pauses (@see {pause}) the current Wire instance, if autoResume (@see {WireOptions.autoResume})
   * is enabled, the instance will be automatically unpaused, otherwise resume (@see {resume})
   * needs to be called.
   * @see {readLine}
   * @param count
   * @returns String excluding the sequence.
   */
  read(count: number): Promise<string> {
    return this.generatorPromise(this.readGenerator, count);
  }

  /**
   * Waits for the predicate to return `true`. The data is not removed from the buffer, unlike in read* functions.
   * Pauses (@see {pause}) the current Wire instance, if autoResume (@see {WireOptions.autoResume})
   * is enabled, the instance will be automatically unpaused, otherwise resume (@see {resume})
   * needs to be called.
   * @see {readLine}
   * @param predicate
   * @returns String excluding the sequence.
   */
  waitFor(predicate: (buffer: string) => boolean): Promise<string> {
    return this.generatorPromise(this.waitForGenerator, predicate);
  }

  private assertStream(): Duplex {
    if (!this.stream?.readable) {
      throw new Error('Stream is not available.');
    }

    return this.stream;
  }

  private *readUntilGenerator(
    sequence: string | string[],
    options: WireReadUntilOptions = {}
  ) {
    const sequences = typeof sequence === 'string' ? [sequence] : sequence;

    while (true) {
      if (options.maxLength && this._buffer.length > options.maxLength) {
        throw new Error('Maximum length exceeded');
      }

      for (const sequence of sequences) {
        if (this._buffer.includes(sequence)) {
          const split = this._buffer.split(sequence);
          const first = split.shift();

          if (first) {
            this._buffer = split.join(sequence);
            return first;
          }
        }
      }

      yield;
    }
  }

  private *readGenerator(count: number) {
    while (true) {
      if (this._buffer.length >= count) {
        try {
          return this._buffer.substring(0, count);
        } finally {
          this._buffer = this._buffer.substring(count);
        }
      }

      yield;
    }
  }

  private *waitForGenerator(predicate: (buffer: string) => boolean) {
    while (true) {
      if (predicate(this._buffer)) {
        return this._buffer;
      }

      yield;
    }
  }

  private streamHandlers(mode: 'on' | 'off') {
    if (!this.stream) {
      return;
    }

    // This ensures we don't end up with duplicate handlers,
    // since @typemail/starttls reattaches the old handlers.
    if (
      mode === 'on' &&
      this.stream.listeners('data').includes(this.handleData)
    ) {
      return;
    }

    this.stream[mode]('error', this.handleError);
    this.stream[mode]('data', this.handleData);
    this.stream[mode]('close', this.handleClose);
    this.stream[mode]('end', this.handleClose);
  }

  setStream(stream: Duplex) {
    if (this.stream) {
      this.streamHandlers('off');
    }

    stream.setEncoding('utf8');
    this.stream = stream;
    if (this.stream.readable) {
      this.handleData(this.stream.read());
    }
    this.streamHandlers('on');
  }

  private handleError(err: any) {
    this.emit('error', err);
  }

  private handleData(data: Buffer) {
    if (!data) {
      return;
    }

    this._buffer += data.toString('utf-8');
    this.runGenerator();
  }

  private handleClose() {
    for (const { reject } of this._bufferGenerators) {
      reject(new Error('Stream closed'));
    }
    this._bufferGenerators = [];
    this.emit('close');
  }

  private async generatorPromise<A extends any[]>(
    generatorFn: (...args: A) => BufferGenerator,
    ...args: A
  ): Promise<string> {
    this.pause();
    const generator = generatorFn.call(this, ...args);

    try {
      // Don't run the new generator if other generators are being waited for.
      const state = !this._bufferGenerators[0] ? generator.next() : undefined;
      if (state?.done) {
        return await Promise.resolve(state.value);
      } else {
        return await new Promise<string>((resolve, reject) => {
          const info: BufferGeneratorInfo = {
            generator,
            resolve,
            reject,
          };

          if (this.options.timeout) {
            info.timeout = setTimeout(() => {
              if (!this._bufferGenerators.includes(info)) {
                return;
              }

              this._bufferGenerators = this._bufferGenerators.filter(
                item => item !== info
              );

              reject(new Error('Read timeout'));
            }, this.options.timeout);
          }
          this._bufferGenerators.push(info);
        });
      }
    } catch (error) {
      return await Promise.reject(error);
    } finally {
      if (this.options.autoResume && !this._bufferGenerators[0]) {
        this.resume();
      }
    }
  }

  private runGenerator() {
    while (this._bufferGenerators[0]) {
      const { generator, resolve, reject, timeout } = this._bufferGenerators[0];

      try {
        const state = generator.next();

        if (state.done) {
          resolve(state.value);
        } else {
          return;
        }
      } catch (error) {
        reject(error);
      }

      clearTimeout(timeout);
      this._bufferGenerators.shift();
    }

    if (this._buffer.length > 0 && this._flowing) {
      this.emit('readable');
    }
  }
}
