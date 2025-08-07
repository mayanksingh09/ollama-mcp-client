import { Readable } from 'stream';
import { StreamProcessor, StreamCollector, StreamMonitor } from '../../src/ollama/streaming';
import { StreamChunk, StreamHandlers } from '../../src/ollama/types';

describe('StreamProcessor', () => {
  let processor: StreamProcessor;

  beforeEach(() => {
    processor = new StreamProcessor();
  });

  describe('processStream', () => {
    it('should process Node.js stream with JSON chunks', (done) => {
      const stream = new Readable();
      const chunks: StreamChunk[] = [];

      const handlers: StreamHandlers = {
        onChunk: (chunk) => chunks.push(chunk),
        onComplete: () => {
          expect(chunks).toHaveLength(2);
          expect(chunks[0].response).toBe('Hello');
          expect(chunks[1].response).toBe(' World');
          expect(chunks[1].done).toBe(true);
          done();
        },
        onError: (error) => done(error),
      };

      processor.processStream(stream, handlers);

      stream.push(
        JSON.stringify({
          model: 'test',
          created_at: '2024-01-01',
          response: 'Hello',
          done: false,
        }) + '\n'
      );

      stream.push(
        JSON.stringify({
          model: 'test',
          created_at: '2024-01-01',
          response: ' World',
          done: true,
        }) + '\n'
      );

      stream.push(null);
    });

    it('should handle multiline JSON chunks', (done) => {
      const stream = new Readable();
      const chunks: StreamChunk[] = [];

      const handlers: StreamHandlers = {
        onChunk: (chunk) => chunks.push(chunk),
        onComplete: () => {
          expect(chunks).toHaveLength(3);
          done();
        },
        onError: (error) => done(error),
      };

      processor.processStream(stream, handlers);

      const multilineData = [
        JSON.stringify({ model: 'test', response: '1', done: false }),
        JSON.stringify({ model: 'test', response: '2', done: false }),
        JSON.stringify({ model: 'test', response: '3', done: true }),
      ].join('\n');

      stream.push(multilineData + '\n');
      stream.push(null);
    });

    it('should handle partial chunks', (done) => {
      const stream = new Readable();
      const chunks: StreamChunk[] = [];

      const handlers: StreamHandlers = {
        onChunk: (chunk) => chunks.push(chunk),
        onComplete: () => {
          expect(chunks).toHaveLength(2);
          done();
        },
        onError: (error) => done(error),
      };

      processor.processStream(stream, handlers);

      const chunk1 = JSON.stringify({ model: 'test', response: '1', done: false });
      const chunk2 = JSON.stringify({ model: 'test', response: '2', done: true });

      stream.push(chunk1.substring(0, 10));
      stream.push(chunk1.substring(10) + '\n');
      stream.push(chunk2 + '\n');
      stream.push(null);
    });

    it('should handle invalid JSON gracefully', (done) => {
      const stream = new Readable();
      const errors: Error[] = [];

      const handlers: StreamHandlers = {
        onChunk: jest.fn(),
        onError: (error) => errors.push(error),
        onComplete: () => {
          expect(errors).toHaveLength(1);
          expect(errors[0].message).toContain('Failed to parse JSON');
          done();
        },
      };

      processor.processStream(stream, handlers);

      stream.push('invalid json\n');
      stream.push(JSON.stringify({ model: 'test', response: 'valid', done: true }) + '\n');
      stream.push(null);
    });

    it('should handle empty lines', (done) => {
      const stream = new Readable();
      const chunks: StreamChunk[] = [];

      const handlers: StreamHandlers = {
        onChunk: (chunk) => chunks.push(chunk),
        onComplete: () => {
          expect(chunks).toHaveLength(2);
          done();
        },
        onError: (error) => done(error),
      };

      processor.processStream(stream, handlers);

      stream.push('\n\n');
      stream.push(JSON.stringify({ model: 'test', response: '1', done: false }) + '\n');
      stream.push('\n');
      stream.push(JSON.stringify({ model: 'test', response: '2', done: true }) + '\n');
      stream.push('\n\n');
      stream.push(null);
    });
  });

  describe('reset', () => {
    it('should clear internal buffer', () => {
      processor.reset();
      expect(() => processor.reset()).not.toThrow();
    });
  });
});

describe('StreamCollector', () => {
  let collector: StreamCollector;

  beforeEach(() => {
    collector = new StreamCollector();
  });

  describe('collect', () => {
    it('should collect response text', () => {
      const chunk1: StreamChunk = {
        model: 'test',
        created_at: '2024-01-01',
        response: 'Hello',
        done: false,
      };

      const chunk2: StreamChunk = {
        model: 'test',
        created_at: '2024-01-01',
        response: ' World',
        done: true,
      };

      collector.collect(chunk1);
      collector.collect(chunk2);

      expect(collector.getResponse()).toBe('Hello World');
      expect(collector.getChunks()).toHaveLength(2);
    });

    it('should collect context', () => {
      const chunk1: StreamChunk = {
        model: 'test',
        created_at: '2024-01-01',
        response: 'Test',
        done: false,
      };

      const chunk2: StreamChunk = {
        model: 'test',
        created_at: '2024-01-01',
        response: '',
        context: [1, 2, 3, 4, 5],
        done: true,
      };

      collector.collect(chunk1);
      collector.collect(chunk2);

      expect(collector.getContext()).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('reset', () => {
    it('should clear collected data', () => {
      const chunk: StreamChunk = {
        model: 'test',
        created_at: '2024-01-01',
        response: 'Test',
        context: [1, 2, 3],
        done: true,
      };

      collector.collect(chunk);
      collector.reset();

      expect(collector.getResponse()).toBe('');
      expect(collector.getContext()).toBeUndefined();
      expect(collector.getChunks()).toHaveLength(0);
    });
  });
});

describe('StreamMonitor', () => {
  let monitor: StreamMonitor;

  beforeEach(() => {
    monitor = new StreamMonitor();
  });

  describe('update', () => {
    it('should track token generation progress', () => {
      jest.useFakeTimers();
      monitor.start();

      const chunk1: StreamChunk = {
        model: 'test',
        created_at: '2024-01-01',
        response: 'Test',
        eval_count: 5,
        done: false,
      };

      jest.advanceTimersByTime(1000);
      const progress1 = monitor.update(chunk1);

      expect(progress1.tokensGenerated).toBe(5);
      expect(progress1.timeElapsed).toBeGreaterThanOrEqual(1000);
      expect(progress1.tokensPerSecond).toBeCloseTo(5, 1);

      const chunk2: StreamChunk = {
        model: 'test',
        created_at: '2024-01-01',
        response: 'More',
        eval_count: 3,
        done: false,
      };

      jest.advanceTimersByTime(1000);
      const progress2 = monitor.update(chunk2);

      expect(progress2.tokensGenerated).toBe(8);
      expect(progress2.timeElapsed).toBeGreaterThanOrEqual(2000);
      expect(progress2.tokensPerSecond).toBeCloseTo(4, 1);

      jest.useRealTimers();
    });

    it('should handle chunks without eval_count', () => {
      monitor.start();

      const chunk: StreamChunk = {
        model: 'test',
        created_at: '2024-01-01',
        response: 'Test',
        done: false,
      };

      const progress = monitor.update(chunk);
      expect(progress.tokensGenerated).toBe(0);
    });
  });

  describe('reset', () => {
    it('should reset tracking state', () => {
      const chunk: StreamChunk = {
        model: 'test',
        created_at: '2024-01-01',
        response: 'Test',
        eval_count: 5,
        done: false,
      };

      monitor.update(chunk);
      monitor.reset();

      const progress = monitor.update(chunk);
      expect(progress.tokensGenerated).toBe(5);
    });
  });
});
