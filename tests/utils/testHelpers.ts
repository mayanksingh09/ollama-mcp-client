import { EventEmitter } from 'events';
import type { MCPTool, MCPResource, MCPPrompt } from '../../src/types/mcp.types';
import type { ChatCompletionRequest } from '../../src/ollama/types';

export class TestEventCollector {
  private events: Array<{ event: string; data: any; timestamp: number }> = [];
  private emitter: EventEmitter;

  constructor(emitter: EventEmitter) {
    this.emitter = emitter;
  }

  public collectAll(): void {
    const originalEmit = this.emitter.emit.bind(this.emitter);
    this.emitter.emit = (event: string, ...args: any[]): boolean => {
      this.events.push({
        event,
        data: args,
        timestamp: Date.now(),
      });
      return originalEmit(event, ...args);
    };
  }

  public collectEvent(eventName: string): void {
    this.emitter.on(eventName, (...args) => {
      this.events.push({
        event: eventName,
        data: args,
        timestamp: Date.now(),
      });
    });
  }

  public getEvents(eventName?: string): any[] {
    if (eventName) {
      return this.events.filter((e) => e.event === eventName);
    }
    return [...this.events];
  }

  public clear(): void {
    this.events = [];
  }

  public waitForEvent(eventName: string, timeout = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${eventName}`));
      }, timeout);

      const handler = (...args: any[]) => {
        clearTimeout(timer);
        this.emitter.off(eventName, handler);
        resolve(args);
      };

      this.emitter.once(eventName, handler);
    });
  }
}

export function createMockTool(overrides: Partial<MCPTool> = {}): MCPTool {
  return {
    name: 'test-tool',
    description: 'A test tool',
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'string' },
      },
      required: ['input'],
    },
    ...overrides,
  };
}

export function createMockResource(overrides: Partial<MCPResource> = {}): MCPResource {
  return {
    uri: 'file:///test/resource.txt',
    name: 'Test Resource',
    description: 'A test resource',
    mimeType: 'text/plain',
    ...overrides,
  };
}

export function createMockPrompt(overrides: Partial<MCPPrompt> = {}): MCPPrompt {
  return {
    name: 'test-prompt',
    description: 'A test prompt',
    arguments: [
      {
        name: 'input',
        description: 'Test input',
        required: true,
      },
    ],
    ...overrides,
  };
}

export function createChatRequest(
  overrides: Partial<ChatCompletionRequest> = {}
): ChatCompletionRequest {
  return {
    model: 'test-model',
    messages: [
      {
        role: 'user',
        content: 'Test message',
      },
    ],
    stream: false,
    ...overrides,
  };
}

export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Timeout waiting for condition');
}

export function mockAsyncIterator<T>(items: T[]): AsyncIterableIterator<T> {
  let index = 0;

  return {
    async next() {
      if (index < items.length) {
        return { value: items[index++], done: false };
      }
      return { value: undefined as any, done: true };
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

export class MockTransport extends EventEmitter {
  private connected = false;
  private messages: any[] = [];

  public async connect(): Promise<void> {
    this.connected = true;
    this.emit('connect');
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
    this.emit('disconnect');
  }

  public async send(message: any): Promise<void> {
    if (!this.connected) {
      throw new Error('Transport not connected');
    }
    this.messages.push(message);
    this.emit('message', message);
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public getMessages(): any[] {
    return [...this.messages];
  }

  public clearMessages(): void {
    this.messages = [];
  }

  public simulateMessage(message: any): void {
    this.emit('message', message);
  }

  public simulateError(error: Error): void {
    this.emit('error', error);
  }
}

export function generateTestData(type: 'tool' | 'resource' | 'prompt', count: number): any[] {
  const results = [];

  for (let i = 0; i < count; i++) {
    switch (type) {
      case 'tool':
        results.push(
          createMockTool({
            name: `tool-${i}`,
            description: `Test tool ${i}`,
          })
        );
        break;
      case 'resource':
        results.push(
          createMockResource({
            uri: `file:///test/resource-${i}.txt`,
            name: `Resource ${i}`,
          })
        );
        break;
      case 'prompt':
        results.push(
          createMockPrompt({
            name: `prompt-${i}`,
            description: `Test prompt ${i}`,
          })
        );
        break;
    }
  }

  return results;
}

export function expectToThrowAsync(
  fn: () => Promise<any>,
  errorMessage?: string | RegExp
): Promise<void> {
  return fn().then(
    () => {
      throw new Error('Expected function to throw');
    },
    (error) => {
      if (errorMessage) {
        if (typeof errorMessage === 'string') {
          expect(error.message).toBe(errorMessage);
        } else {
          expect(error.message).toMatch(errorMessage);
        }
      }
    }
  );
}

export class TestScheduler {
  private tasks: Array<{ fn: () => Promise<any>; delay: number }> = [];

  public schedule(fn: () => Promise<any>, delay: number): void {
    this.tasks.push({ fn, delay });
  }

  public async runAll(): Promise<any[]> {
    const results = await Promise.all(
      this.tasks.map(async ({ fn, delay }) => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return fn();
      })
    );
    this.tasks = [];
    return results;
  }

  public clear(): void {
    this.tasks = [];
  }
}
