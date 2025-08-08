import { OllamaMCPClient } from '../../src/client/OllamaMCPClient';
import { OllamaClient } from '../../src/ollama/OllamaClient';
import { TransportManager } from '../../src/transport/TransportManager';
import { SessionManager } from '../../src/session/SessionManager';
import { ToolManager } from '../../src/tools/ToolManager';
import { ResourceManager } from '../../src/resources/ResourceManager';
import { PromptManager } from '../../src/prompts/PromptManager';
import { ConnectionState } from '../../src/types/client.types';
import { MockOllamaServer } from '../mocks/MockOllamaServer';
import { MockMCPServer } from '../mocks/MockMCPServer';
import { MockTransport, TestEventCollector, waitFor } from '../utils/testHelpers';
import { calculatorTool, searchTool } from '../fixtures/toolDefinitions';
import { textResource, jsonResource } from '../fixtures/resourceDefinitions';
import { summarizePrompt } from '../fixtures/promptDefinitions';

jest.mock('../../src/ollama/OllamaClient');
jest.mock('../../src/transport/TransportManager');
jest.mock('../../src/session/SessionManager');
jest.mock('../../src/tools/ToolManager');
jest.mock('../../src/resources/ResourceManager');
jest.mock('../../src/prompts/PromptManager');
jest.mock('@modelcontextprotocol/sdk/client/index.js');
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    printf: jest.fn(),
    json: jest.fn(),
  },
  transports: {
    Console: jest.fn(),
  },
}));

describe('OllamaMCPClient', () => {
  let client: OllamaMCPClient;
  let mockOllamaClient: jest.Mocked<OllamaClient>;
  let mockTransportManager: jest.Mocked<TransportManager>;
  let mockSessionManager: jest.Mocked<SessionManager>;
  let mockToolManager: jest.Mocked<ToolManager>;
  let mockResourceManager: jest.Mocked<ResourceManager>;
  let mockPromptManager: jest.Mocked<PromptManager>;
  let eventCollector: TestEventCollector;

  beforeEach(() => {
    mockOllamaClient = new OllamaClient() as jest.Mocked<OllamaClient>;
    mockTransportManager = new TransportManager() as jest.Mocked<TransportManager>;
    mockSessionManager = new SessionManager() as jest.Mocked<SessionManager>;
    mockToolManager = new ToolManager() as jest.Mocked<ToolManager>;
    mockResourceManager = new ResourceManager() as jest.Mocked<ResourceManager>;
    mockPromptManager = new PromptManager() as jest.Mocked<PromptManager>;

    client = new OllamaMCPClient({
      ollama: {
        host: 'localhost',
        port: 11434,
        model: 'test-model',
      },
    });

    eventCollector = new TestEventCollector(client);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const client = new OllamaMCPClient();
      expect(client).toBeInstanceOf(OllamaMCPClient);
    });

    it('should initialize with custom config', () => {
      const config = {
        ollama: {
          host: 'custom-host',
          port: 8080,
          model: 'custom-model',
        },
        logging: {
          level: 'debug' as const,
        },
      };

      const client = new OllamaMCPClient(config);
      expect(client).toBeInstanceOf(OllamaMCPClient);
    });
  });

  describe('connectToServer', () => {
    it('should connect to a server successfully', async () => {
      const mockTransport = new MockTransport();
      const connectionInfo = await client.connectToServer('test-server', {
        transport: 'stdio',
        command: 'test-command',
      });

      expect(connectionInfo.serverId).toBe('test-server');
      expect(connectionInfo.state).toBe(ConnectionState.CONNECTING);
    });

    it('should handle connection errors', async () => {
      const mockTransport = new MockTransport();
      mockTransport.connect = jest.fn().mockRejectedValue(new Error('Connection failed'));

      await expect(
        client.connectToServer('test-server', {
          transport: 'stdio',
          command: 'test-command',
        })
      ).rejects.toThrow('Connection failed');
    });

    it('should emit connection events', async () => {
      eventCollector.collectEvent('server:connected');
      eventCollector.collectEvent('server:disconnected');
      eventCollector.collectEvent('server:error');

      const mockTransport = new MockTransport();
      await client.connectToServer('test-server', {
        transport: 'stdio',
        command: 'test-command',
      });

      client.emit('server:connected', { serverId: 'test-server' });

      const events = eventCollector.getEvents('server:connected');
      expect(events).toHaveLength(1);
      expect(events[0].data[0]).toEqual({ serverId: 'test-server' });
    });
  });

  describe('disconnectFromServer', () => {
    it('should disconnect from a connected server', async () => {
      await client.connectToServer('test-server', {
        transport: 'stdio',
        command: 'test-command',
      });

      await client.disconnectFromServer('test-server');
      const connections = await client.listConnections();
      expect(connections).toHaveLength(0);
    });

    it('should handle disconnection of non-existent server', async () => {
      await expect(client.disconnectFromServer('non-existent')).rejects.toThrow();
    });
  });

  describe('listConnections', () => {
    it('should return empty array when no connections', async () => {
      const connections = await client.listConnections();
      expect(connections).toEqual([]);
    });

    it('should return list of active connections', async () => {
      await client.connectToServer('server1', {
        transport: 'stdio',
        command: 'test1',
      });
      await client.connectToServer('server2', {
        transport: 'http',
        url: 'http://localhost:3000',
      });

      const connections = await client.listConnections();
      expect(connections).toHaveLength(2);
      expect(connections.map((c) => c.serverId)).toContain('server1');
      expect(connections.map((c) => c.serverId)).toContain('server2');
    });
  });

  describe('listTools', () => {
    it('should list tools from all connected servers', async () => {
      mockToolManager.getAllTools.mockResolvedValue([calculatorTool, searchTool]);

      const tools = await client.listTools();
      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('calculator');
      expect(tools[1].name).toBe('search');
    });

    it('should filter tools by server ID', async () => {
      mockToolManager.getToolsByServer.mockResolvedValue([calculatorTool]);

      const tools = await client.listTools('server1');
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('calculator');
    });

    it('should handle empty tool list', async () => {
      mockToolManager.getAllTools.mockResolvedValue([]);

      const tools = await client.listTools();
      expect(tools).toEqual([]);
    });
  });

  describe('callTool', () => {
    it('should call a tool successfully', async () => {
      const toolResult = {
        content: [
          {
            type: 'text' as const,
            text: 'Result: 8',
          },
        ],
      };

      mockToolManager.callTool.mockResolvedValue(toolResult);

      const result = await client.callTool('calculator', {
        operation: 'add',
        a: 5,
        b: 3,
      });

      expect(result).toEqual(toolResult);
      expect(mockToolManager.callTool).toHaveBeenCalledWith(
        'calculator',
        { operation: 'add', a: 5, b: 3 },
        undefined
      );
    });

    it('should call tool on specific server', async () => {
      const toolResult = {
        content: [
          {
            type: 'text' as const,
            text: 'Server-specific result',
          },
        ],
      };

      mockToolManager.callTool.mockResolvedValue(toolResult);

      const result = await client.callTool(
        'calculator',
        { operation: 'multiply', a: 4, b: 5 },
        'server1'
      );

      expect(result).toEqual(toolResult);
      expect(mockToolManager.callTool).toHaveBeenCalledWith(
        'calculator',
        { operation: 'multiply', a: 4, b: 5 },
        'server1'
      );
    });

    it('should handle tool execution errors', async () => {
      mockToolManager.callTool.mockRejectedValue(new Error('Tool execution failed'));

      await expect(
        client.callTool('calculator', { operation: 'divide', a: 5, b: 0 })
      ).rejects.toThrow('Tool execution failed');
    });
  });

  describe('listResources', () => {
    it('should list resources from all servers', async () => {
      mockResourceManager.getAllResources.mockResolvedValue([textResource, jsonResource]);

      const resources = await client.listResources();
      expect(resources).toHaveLength(2);
      expect(resources[0].uri).toBe('file:///documents/readme.txt');
      expect(resources[1].uri).toBe('file:///data/config.json');
    });

    it('should filter resources by server ID', async () => {
      mockResourceManager.getResourcesByServer.mockResolvedValue([textResource]);

      const resources = await client.listResources('server1');
      expect(resources).toHaveLength(1);
      expect(resources[0].uri).toBe('file:///documents/readme.txt');
    });
  });

  describe('readResource', () => {
    it('should read a resource successfully', async () => {
      const resourceContent = {
        contents: [
          {
            uri: 'file:///documents/readme.txt',
            mimeType: 'text/plain',
            text: 'Sample content',
          },
        ],
      };

      mockResourceManager.readResource.mockResolvedValue(resourceContent);

      const result = await client.readResource('file:///documents/readme.txt');
      expect(result).toEqual(resourceContent);
    });

    it('should handle resource read errors', async () => {
      mockResourceManager.readResource.mockRejectedValue(new Error('Resource not found'));

      await expect(client.readResource('file:///nonexistent.txt')).rejects.toThrow(
        'Resource not found'
      );
    });
  });

  describe('listPrompts', () => {
    it('should list prompts from all servers', async () => {
      mockPromptManager.getAllPrompts.mockResolvedValue([summarizePrompt]);

      const prompts = await client.listPrompts();
      expect(prompts).toHaveLength(1);
      expect(prompts[0].name).toBe('summarize');
    });
  });

  describe('getPrompt', () => {
    it('should get a prompt by name', async () => {
      const promptMessages = {
        messages: [
          {
            role: 'system' as const,
            content: {
              type: 'text' as const,
              text: 'Summarize the following content',
            },
          },
        ],
      };

      mockPromptManager.getPrompt.mockResolvedValue(promptMessages);

      const result = await client.getPrompt('summarize', {
        content: 'Long text to summarize',
      });

      expect(result).toEqual(promptMessages);
    });
  });

  describe('chat', () => {
    it('should send chat message and receive response', async () => {
      const chatResponse = {
        model: 'test-model',
        created_at: new Date().toISOString(),
        message: {
          role: 'assistant' as const,
          content: 'Hello! How can I help you?',
        },
        done: true,
        total_duration: 1000000,
        load_duration: 100000,
        prompt_eval_count: 10,
        prompt_eval_duration: 100000,
        eval_count: 20,
        eval_duration: 800000,
      };

      mockOllamaClient.chat.mockResolvedValue(chatResponse);

      const result = await client.chat('Hello', {
        model: 'test-model',
      });

      expect(result.response).toBe('Hello! How can I help you?');
      expect(result.model).toBe('test-model');
    });

    it('should handle streaming chat responses', async () => {
      const chunks: string[] = [];
      const onChunk = jest.fn((chunk: string) => {
        chunks.push(chunk);
      });

      mockOllamaClient.chat.mockImplementation(async (request, handlers) => {
        if (handlers?.onChunk) {
          handlers.onChunk({
            message: { content: 'Hello' },
            done: false,
          } as any);
          handlers.onChunk({
            message: { content: ' there!' },
            done: false,
          } as any);
        }
        return {
          model: 'test-model',
          created_at: new Date().toISOString(),
          message: {
            role: 'assistant' as const,
            content: 'Hello there!',
          },
          done: true,
        } as any;
      });

      const result = await client.chat('Hi', {
        stream: true,
        onChunk,
      });

      expect(onChunk).toHaveBeenCalledTimes(2);
      expect(chunks).toEqual(['Hello', ' there!']);
      expect(result.response).toBe('Hello there!');
    });
  });

  describe('error handling', () => {
    it('should emit error events', () => {
      eventCollector.collectEvent('error');

      const error = new Error('Test error');
      client.emit('error', error);

      const events = eventCollector.getEvents('error');
      expect(events).toHaveLength(1);
      expect(events[0].data[0]).toBe(error);
    });

    it('should handle initialization errors gracefully', () => {
      expect(() => {
        new OllamaMCPClient({
          ollama: {
            host: '',
            port: -1,
            model: '',
          },
        });
      }).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should disconnect all servers on destroy', async () => {
      await client.connectToServer('server1', {
        transport: 'stdio',
        command: 'test1',
      });
      await client.connectToServer('server2', {
        transport: 'http',
        url: 'http://localhost:3000',
      });

      await client.destroy();

      const connections = await client.listConnections();
      expect(connections).toHaveLength(0);
    });
  });
});
