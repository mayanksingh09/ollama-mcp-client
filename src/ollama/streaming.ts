import type { Readable } from 'stream';
import type { StreamChunk, StreamHandlers } from './types';
import { OllamaStreamError } from './errors';

export class StreamProcessor {
  private buffer = '';
  private decoder = new globalThis.TextDecoder();

  processStream(
    stream: globalThis.ReadableStream<Uint8Array> | Readable,
    handlers: StreamHandlers
  ): void {
    if (stream instanceof globalThis.ReadableStream) {
      this.processWebStream(stream, handlers);
    } else {
      this.processNodeStream(stream, handlers);
    }
  }

  private async processWebStream(
    stream: globalThis.ReadableStream<Uint8Array>,
    handlers: StreamHandlers
  ): Promise<void> {
    const reader = stream.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          this.processRemainingBuffer(handlers);
          handlers.onComplete?.();
          break;
        }

        if (value) {
          this.processChunk(value, handlers);
        }
      }
    } catch (error) {
      handlers.onError?.(error as Error);
    } finally {
      reader.releaseLock();
    }
  }

  private processNodeStream(stream: Readable, handlers: StreamHandlers): void {
    stream.on('data', (chunk: Buffer | string) => {
      const data = chunk instanceof Buffer ? chunk : Buffer.from(chunk);
      this.processChunk(data, handlers);
    });

    stream.on('end', () => {
      this.processRemainingBuffer(handlers);
      handlers.onComplete?.();
    });

    stream.on('error', (error: Error) => {
      handlers.onError?.(error);
    });
  }

  private processChunk(chunk: Uint8Array | Buffer, handlers: StreamHandlers): void {
    const text = this.decoder.decode(chunk, { stream: true });
    this.buffer += text;

    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const parsed = JSON.parse(line) as StreamChunk;
          handlers.onChunk?.(parsed);
        } catch (error) {
          const streamError = new OllamaStreamError(
            `Failed to parse JSON: ${(error as Error).message}`,
            line
          );
          handlers.onError?.(streamError);
        }
      }
    }
  }

  private processRemainingBuffer(handlers: StreamHandlers): void {
    if (this.buffer.trim()) {
      try {
        const parsed = JSON.parse(this.buffer) as StreamChunk;
        handlers.onChunk?.(parsed);
      } catch (error) {
        const streamError = new OllamaStreamError(
          `Failed to parse remaining buffer: ${(error as Error).message}`,
          this.buffer
        );
        handlers.onError?.(streamError);
      }
    }
    this.buffer = '';
  }

  reset(): void {
    this.buffer = '';
  }
}

export class StreamCollector {
  private chunks: StreamChunk[] = [];
  private responseText = '';
  private context: number[] | undefined;

  collect(chunk: StreamChunk): void {
    this.chunks.push(chunk);

    if (chunk.response) {
      this.responseText += chunk.response;
    }

    if (chunk.context) {
      this.context = chunk.context;
    }
  }

  getResponse(): string {
    return this.responseText;
  }

  getContext(): number[] | undefined {
    return this.context;
  }

  getChunks(): StreamChunk[] {
    return this.chunks;
  }

  reset(): void {
    this.chunks = [];
    this.responseText = '';
    this.context = undefined;
  }
}

export interface StreamOptions {
  signal?: globalThis.AbortSignal;
  onProgress?: (progress: StreamProgress) => void;
}

export interface StreamProgress {
  tokensGenerated: number;
  timeElapsed: number;
  tokensPerSecond: number;
}

export class StreamMonitor {
  private startTime = Date.now();
  private tokensGenerated = 0;

  start(): void {
    this.startTime = Date.now();
    this.tokensGenerated = 0;
  }

  update(chunk: StreamChunk): StreamProgress {
    if (chunk.eval_count) {
      this.tokensGenerated += chunk.eval_count;
    }

    const timeElapsed = Date.now() - this.startTime;
    const tokensPerSecond = this.tokensGenerated / (timeElapsed / 1000);

    return {
      tokensGenerated: this.tokensGenerated,
      timeElapsed,
      tokensPerSecond,
    };
  }

  reset(): void {
    this.startTime = Date.now();
    this.tokensGenerated = 0;
  }
}
