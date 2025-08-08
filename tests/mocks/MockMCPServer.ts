import { EventEmitter } from 'events';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { MCPTool, MCPResource, MCPPrompt } from '../../src/types/mcp.types';

export interface MockServerOptions {
  name?: string;
  version?: string;
  tools?: MCPTool[];
  resources?: MCPResource[];
  prompts?: MCPPrompt[];
  delay?: number;
  errorRate?: number;
}

export class MockMCPServer extends EventEmitter {
  private server: Server;
  private tools: MCPTool[];
  private resources: MCPResource[];
  private prompts: MCPPrompt[];
  private options: Required<MockServerOptions>;
  private callCount: Map<string, number> = new Map();

  constructor(options: MockServerOptions = {}) {
    super();
    this.options = {
      name: options.name || 'mock-mcp-server',
      version: options.version || '1.0.0',
      tools: options.tools || this.getDefaultTools(),
      resources: options.resources || this.getDefaultResources(),
      prompts: options.prompts || this.getDefaultPrompts(),
      delay: options.delay || 0,
      errorRate: options.errorRate || 0,
    };

    this.tools = this.options.tools;
    this.resources = this.options.resources;
    this.prompts = this.options.prompts;

    this.server = new Server(
      {
        name: this.options.name,
        version: this.options.version,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler('tools/list', async () => {
      await this.simulateDelay();
      this.maybeThrowError();
      return { tools: this.tools };
    });

    this.server.setRequestHandler('tools/call', async (request) => {
      await this.simulateDelay();
      this.maybeThrowError();

      const { name, arguments: args } = request.params as any;
      this.incrementCallCount(name);

      const tool = this.tools.find((t) => t.name === name);
      if (!tool) {
        throw new Error(`Tool ${name} not found`);
      }

      return {
        content: [
          {
            type: 'text',
            text: `Mock result for ${name} with args: ${JSON.stringify(args)}`,
          },
        ],
      };
    });

    this.server.setRequestHandler('resources/list', async () => {
      await this.simulateDelay();
      this.maybeThrowError();
      return { resources: this.resources };
    });

    this.server.setRequestHandler('resources/read', async (request) => {
      await this.simulateDelay();
      this.maybeThrowError();

      const { uri } = request.params as any;
      const resource = this.resources.find((r) => r.uri === uri);

      if (!resource) {
        throw new Error(`Resource ${uri} not found`);
      }

      return {
        contents: [
          {
            uri,
            mimeType: resource.mimeType || 'text/plain',
            text: `Mock content for resource: ${uri}`,
          },
        ],
      };
    });

    this.server.setRequestHandler('prompts/list', async () => {
      await this.simulateDelay();
      this.maybeThrowError();
      return { prompts: this.prompts };
    });

    this.server.setRequestHandler('prompts/get', async (request) => {
      await this.simulateDelay();
      this.maybeThrowError();

      const { name } = request.params as any;
      const prompt = this.prompts.find((p) => p.name === name);

      if (!prompt) {
        throw new Error(`Prompt ${name} not found`);
      }

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Mock prompt content for: ${name}`,
            },
          },
        ],
      };
    });
  }

  private async simulateDelay(): Promise<void> {
    if (this.options.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.options.delay));
    }
  }

  private maybeThrowError(): void {
    if (this.options.errorRate > 0 && Math.random() < this.options.errorRate) {
      throw new Error('Simulated server error');
    }
  }

  private incrementCallCount(toolName: string): void {
    const count = this.callCount.get(toolName) || 0;
    this.callCount.set(toolName, count + 1);
    this.emit('toolCalled', { name: toolName, count: count + 1 });
  }

  private getDefaultTools(): MCPTool[] {
    return [
      {
        name: 'calculator',
        description: 'Perform basic arithmetic operations',
        inputSchema: {
          type: 'object',
          properties: {
            operation: {
              type: 'string',
              enum: ['add', 'subtract', 'multiply', 'divide'],
            },
            a: { type: 'number' },
            b: { type: 'number' },
          },
          required: ['operation', 'a', 'b'],
        },
      },
      {
        name: 'echo',
        description: 'Echo back the input',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
          required: ['message'],
        },
      },
      {
        name: 'get_weather',
        description: 'Get weather for a location',
        inputSchema: {
          type: 'object',
          properties: {
            location: { type: 'string' },
            units: {
              type: 'string',
              enum: ['celsius', 'fahrenheit'],
              default: 'celsius',
            },
          },
          required: ['location'],
        },
      },
    ];
  }

  private getDefaultResources(): MCPResource[] {
    return [
      {
        uri: 'file:///test/document.txt',
        name: 'Test Document',
        description: 'A test document',
        mimeType: 'text/plain',
      },
      {
        uri: 'file:///test/data.json',
        name: 'Test Data',
        description: 'Test JSON data',
        mimeType: 'application/json',
      },
    ];
  }

  private getDefaultPrompts(): MCPPrompt[] {
    return [
      {
        name: 'summarize',
        description: 'Summarize content',
        arguments: [
          {
            name: 'content',
            description: 'Content to summarize',
            required: true,
          },
        ],
      },
      {
        name: 'translate',
        description: 'Translate text',
        arguments: [
          {
            name: 'text',
            description: 'Text to translate',
            required: true,
          },
          {
            name: 'targetLanguage',
            description: 'Target language',
            required: true,
          },
        ],
      },
    ];
  }

  public getCallCount(toolName: string): number {
    return this.callCount.get(toolName) || 0;
  }

  public resetCallCounts(): void {
    this.callCount.clear();
  }

  public setTools(tools: MCPTool[]): void {
    this.tools = tools;
  }

  public setResources(resources: MCPResource[]): void {
    this.resources = resources;
  }

  public setPrompts(prompts: MCPPrompt[]): void {
    this.prompts = prompts;
  }

  public getServer(): Server {
    return this.server;
  }

  public async start(transport?: any): Promise<void> {
    const t = transport || new StdioServerTransport();
    await this.server.connect(t);
    this.emit('started');
  }

  public async stop(): Promise<void> {
    await this.server.close();
    this.emit('stopped');
  }
}
