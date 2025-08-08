import { OllamaMCPClient } from '../../src/client/OllamaMCPClient';
import { OllamaClient } from '../../src/ollama/OllamaClient';
import { MockMCPServer } from '../mocks/MockMCPServer';
import { MockOllamaServer } from '../mocks/MockOllamaServer';
import { calculatorTool, searchTool, weatherTool } from '../fixtures/toolDefinitions';
import { TestEventCollector, waitFor } from '../utils/testHelpers';
import type { MCPToolResult } from '../../src/types/mcp.types';

describe('Tool Execution Integration', () => {
  let client: OllamaMCPClient;
  let mockMCPServer: MockMCPServer;
  let mockOllamaServer: MockOllamaServer;
  let eventCollector: TestEventCollector;

  beforeEach(async () => {
    mockMCPServer = new MockMCPServer({
      name: 'test-server',
      tools: [calculatorTool, searchTool, weatherTool],
      delay: 10,
    });

    mockOllamaServer = new MockOllamaServer({
      defaultModel: 'test-model',
      responseDelay: 10,
      simulateToolCalls: true,
    });

    client = new OllamaMCPClient({
      ollama: {
        host: 'localhost',
        port: 11434,
        model: 'test-model',
      },
    });

    eventCollector = new TestEventCollector(client);
  });

  afterEach(async () => {
    await client.destroy();
    await mockMCPServer.stop();
  });

  describe('Single Tool Execution', () => {
    it('should execute calculator tool successfully', async () => {
      await client.connectToServer('test-server', {
        transport: 'stdio',
        command: 'mock-server',
      });

      const result = await client.callTool('calculator', {
        operation: 'add',
        a: 5,
        b: 3,
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(mockMCPServer.getCallCount('calculator')).toBe(1);
    });

    it('should execute search tool with complex parameters', async () => {
      await client.connectToServer('test-server', {
        transport: 'stdio',
        command: 'mock-server',
      });

      const result = await client.callTool('search', {
        query: 'quantum computing',
        limit: 10,
        filters: {
          category: 'science',
          dateFrom: '2023-01-01',
          dateTo: '2024-01-01',
        },
      });

      expect(result).toBeDefined();
      expect(mockMCPServer.getCallCount('search')).toBe(1);
    });

    it('should handle tool execution errors gracefully', async () => {
      mockMCPServer = new MockMCPServer({
        tools: [calculatorTool],
        errorRate: 1.0,
      });

      await client.connectToServer('test-server', {
        transport: 'stdio',
        command: 'mock-server',
      });

      await expect(
        client.callTool('calculator', {
          operation: 'divide',
          a: 5,
          b: 0,
        })
      ).rejects.toThrow('Simulated server error');
    });

    it('should handle missing tool parameters', async () => {
      await client.connectToServer('test-server', {
        transport: 'stdio',
        command: 'mock-server',
      });

      await expect(
        client.callTool('calculator', {
          operation: 'add',
        })
      ).rejects.toThrow();
    });
  });

  describe('Tool Chaining', () => {
    it('should execute multiple tools in sequence', async () => {
      await client.connectToServer('test-server', {
        transport: 'stdio',
        command: 'mock-server',
      });

      const calcResult = await client.callTool('calculator', {
        operation: 'multiply',
        a: 4,
        b: 5,
      });

      const searchResult = await client.callTool('search', {
        query: 'result: 20',
        limit: 5,
      });

      expect(mockMCPServer.getCallCount('calculator')).toBe(1);
      expect(mockMCPServer.getCallCount('search')).toBe(1);
    });

    it('should use tool results in subsequent calls', async () => {
      await client.connectToServer('test-server', {
        transport: 'stdio',
        command: 'mock-server',
      });

      const weatherResult = await client.callTool('get_weather', {
        location: 'New York',
        units: 'celsius',
      });

      const searchResult = await client.callTool('search', {
        query: `Weather data: ${JSON.stringify(weatherResult)}`,
      });

      expect(searchResult).toBeDefined();
    });
  });

  describe('Concurrent Tool Execution', () => {
    it('should handle concurrent tool calls', async () => {
      await client.connectToServer('test-server', {
        transport: 'stdio',
        command: 'mock-server',
      });

      const promises = [
        client.callTool('calculator', { operation: 'add', a: 1, b: 2 }),
        client.callTool('search', { query: 'test' }),
        client.callTool('get_weather', { location: 'London' }),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(mockMCPServer.getCallCount('calculator')).toBe(1);
      expect(mockMCPServer.getCallCount('search')).toBe(1);
      expect(mockMCPServer.getCallCount('get_weather')).toBe(1);
    });

    it('should handle rate limiting for concurrent calls', async () => {
      const rateLimitedClient = new OllamaMCPClient({
        ollama: {
          host: 'localhost',
          port: 11434,
          model: 'test-model',
        },
        rateLimiting: {
          enabled: true,
          maxRequestsPerSecond: 2,
        },
      });

      await rateLimitedClient.connectToServer('test-server', {
        transport: 'stdio',
        command: 'mock-server',
      });

      const startTime = Date.now();

      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          rateLimitedClient.callTool('calculator', {
            operation: 'add',
            a: i,
            b: i + 1,
          })
        );
      }

      await Promise.all(promises);
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThanOrEqual(2000);
      await rateLimitedClient.destroy();
    });
  });

  describe('Multi-Server Tool Execution', () => {
    let mockMCPServer2: MockMCPServer;

    beforeEach(async () => {
      mockMCPServer2 = new MockMCPServer({
        name: 'test-server-2',
        tools: [
          {
            name: 'custom_tool',
            description: 'A custom tool',
            inputSchema: {
              type: 'object',
              properties: {
                input: { type: 'string' },
              },
              required: ['input'],
            },
          },
        ],
      });
    });

    afterEach(async () => {
      await mockMCPServer2.stop();
    });

    it('should execute tools from different servers', async () => {
      await client.connectToServer('server1', {
        transport: 'stdio',
        command: 'mock-server',
      });

      await client.connectToServer('server2', {
        transport: 'stdio',
        command: 'mock-server-2',
      });

      const result1 = await client.callTool(
        'calculator',
        { operation: 'add', a: 2, b: 3 },
        'server1'
      );

      const result2 = await client.callTool('custom_tool', { input: 'test input' }, 'server2');

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(mockMCPServer.getCallCount('calculator')).toBe(1);
      expect(mockMCPServer2.getCallCount('custom_tool')).toBe(1);
    });

    it('should route tools to correct server automatically', async () => {
      await client.connectToServer('server1', {
        transport: 'stdio',
        command: 'mock-server',
      });

      await client.connectToServer('server2', {
        transport: 'stdio',
        command: 'mock-server-2',
      });

      const tools = await client.listTools();

      expect(tools.some((t) => t.name === 'calculator')).toBe(true);
      expect(tools.some((t) => t.name === 'custom_tool')).toBe(true);
    });
  });

  describe('Tool Execution with Ollama Integration', () => {
    it('should process Ollama response and execute suggested tools', async () => {
      mockOllamaServer.setCustomResponse('chat', {
        model: 'test-model',
        created_at: new Date().toISOString(),
        message: {
          role: 'assistant',
          content: JSON.stringify({
            tool_calls: [
              {
                name: 'calculator',
                arguments: {
                  operation: 'multiply',
                  a: 7,
                  b: 8,
                },
              },
            ],
          }),
        },
        done: true,
      });

      await client.connectToServer('test-server', {
        transport: 'stdio',
        command: 'mock-server',
      });

      const chatResponse = await client.chat('Calculate 7 times 8', {
        autoExecuteTools: true,
      });

      expect(chatResponse.toolsUsed).toContain('calculator');
      expect(mockMCPServer.getCallCount('calculator')).toBe(1);
    });

    it('should handle multiple tool suggestions from Ollama', async () => {
      mockOllamaServer.setCustomResponse('chat', {
        model: 'test-model',
        created_at: new Date().toISOString(),
        message: {
          role: 'assistant',
          content: JSON.stringify({
            tool_calls: [
              {
                name: 'get_weather',
                arguments: {
                  location: 'Paris',
                },
              },
              {
                name: 'search',
                arguments: {
                  query: 'Paris attractions',
                },
              },
            ],
          }),
        },
        done: true,
      });

      await client.connectToServer('test-server', {
        transport: 'stdio',
        command: 'mock-server',
      });

      const chatResponse = await client.chat(
        'What is the weather in Paris and what are the main attractions?',
        {
          autoExecuteTools: true,
        }
      );

      expect(chatResponse.toolsUsed).toContain('get_weather');
      expect(chatResponse.toolsUsed).toContain('search');
      expect(mockMCPServer.getCallCount('get_weather')).toBe(1);
      expect(mockMCPServer.getCallCount('search')).toBe(1);
    });
  });

  describe('Error Recovery', () => {
    it('should retry failed tool executions', async () => {
      let callCount = 0;
      mockMCPServer = new MockMCPServer({
        tools: [calculatorTool],
        errorRate: 0.5,
      });

      await client.connectToServer('test-server', {
        transport: 'stdio',
        command: 'mock-server',
      });

      const result = await client.callTool(
        'calculator',
        { operation: 'add', a: 1, b: 1 },
        undefined,
        { retries: 3 }
      );

      expect(result).toBeDefined();
    });

    it('should handle server disconnection during tool execution', async () => {
      await client.connectToServer('test-server', {
        transport: 'stdio',
        command: 'mock-server',
      });

      const toolPromise = client.callTool('calculator', {
        operation: 'add',
        a: 1,
        b: 2,
      });

      await mockMCPServer.stop();

      await expect(toolPromise).rejects.toThrow();
    });
  });

  describe('Tool Events', () => {
    it('should emit events for tool lifecycle', async () => {
      eventCollector.collectEvent('tool:start');
      eventCollector.collectEvent('tool:complete');
      eventCollector.collectEvent('tool:error');

      await client.connectToServer('test-server', {
        transport: 'stdio',
        command: 'mock-server',
      });

      await client.callTool('calculator', {
        operation: 'add',
        a: 5,
        b: 3,
      });

      const startEvents = eventCollector.getEvents('tool:start');
      const completeEvents = eventCollector.getEvents('tool:complete');

      expect(startEvents).toHaveLength(1);
      expect(completeEvents).toHaveLength(1);
      expect(startEvents[0].data[0].tool).toBe('calculator');
      expect(completeEvents[0].data[0].tool).toBe('calculator');
    });

    it('should emit error events for failed tool executions', async () => {
      eventCollector.collectEvent('tool:error');

      mockMCPServer = new MockMCPServer({
        tools: [calculatorTool],
        errorRate: 1.0,
      });

      await client.connectToServer('test-server', {
        transport: 'stdio',
        command: 'mock-server',
      });

      try {
        await client.callTool('calculator', {
          operation: 'add',
          a: 1,
          b: 2,
        });
      } catch (error) {
        const errorEvents = eventCollector.getEvents('tool:error');
        expect(errorEvents).toHaveLength(1);
        expect(errorEvents[0].data[0].tool).toBe('calculator');
      }
    });
  });
});
