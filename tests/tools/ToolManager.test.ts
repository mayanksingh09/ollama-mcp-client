/**
 * ToolManager unit tests
 */

import { ToolManager } from '../../src/tools/ToolManager';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ExtendedTool } from '../../src/types/tools.types';

// Mock the Client
jest.mock('@modelcontextprotocol/sdk/client/index.js');

describe('ToolManager', () => {
  let toolManager: ToolManager;
  let mockClient: jest.Mocked<Client>;

  beforeEach(() => {
    toolManager = new ToolManager({
      enableCaching: true,
      maxParallelExecutions: 3,
    });

    mockClient = {
      listTools: jest.fn(),
      callTool: jest.fn(),
      close: jest.fn(),
    } as unknown as jest.Mocked<Client>;
  });

  afterEach(async () => {
    await toolManager.cleanup();
  });

  describe('registerClient', () => {
    it('should register a client and discover tools', async () => {
      const mockTools = [
        {
          name: 'test-tool',
          description: 'A test tool',
          inputSchema: {
            type: 'object',
            properties: {
              param1: { type: 'string' },
            },
          },
        },
      ];

      mockClient.listTools.mockResolvedValue({ tools: mockTools });

      toolManager.registerClient('test-server', mockClient);

      // Wait for discovery to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      const tools = await toolManager.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('test-tool');
      expect(tools[0].serverId).toBe('test-server');
    });
  });

  describe('executeTool', () => {
    beforeEach(() => {
      toolManager.registerClient('test-server', mockClient);
    });

    it('should execute a tool successfully', async () => {
      const mockTools = [
        {
          name: 'calculator',
          description: 'A calculator tool',
          inputSchema: {
            type: 'object',
            properties: {
              operation: { type: 'string' },
              a: { type: 'number' },
              b: { type: 'number' },
            },
            required: ['operation', 'a', 'b'],
          },
        },
      ];

      const mockResult = {
        content: [
          {
            type: 'text',
            text: '5',
          },
        ],
      };

      mockClient.listTools.mockResolvedValue({ tools: mockTools });
      mockClient.callTool.mockResolvedValue(mockResult);

      // Wait for discovery
      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = await toolManager.executeTool('calculator', {
        operation: 'add',
        a: 2,
        b: 3,
      });

      expect(result.content).toEqual(mockResult.content);
      expect(result.toolName).toBe('calculator');
      expect(result.serverId).toBe('test-server');
      expect(mockClient.callTool).toHaveBeenCalledWith({
        name: 'calculator',
        arguments: {
          operation: 'add',
          a: 2,
          b: 3,
        },
      });
    });

    it('should validate parameters before execution', async () => {
      const mockTools = [
        {
          name: 'strict-tool',
          inputSchema: {
            type: 'object',
            properties: {
              required_param: { type: 'string' },
            },
            required: ['required_param'],
          },
        },
      ];

      mockClient.listTools.mockResolvedValue({ tools: mockTools });

      // Wait for discovery
      await new Promise((resolve) => setTimeout(resolve, 100));

      await expect(
        toolManager.executeTool('strict-tool', {
          // Missing required_param
        })
      ).rejects.toThrow('Parameter validation failed');
    });
  });

  describe('executeBatch', () => {
    it('should execute multiple tools in parallel', async () => {
      const mockTools = [
        { name: 'tool1', inputSchema: { type: 'object', properties: {} } },
        { name: 'tool2', inputSchema: { type: 'object', properties: {} } },
      ];

      mockClient.listTools.mockResolvedValue({ tools: mockTools });
      mockClient.callTool.mockResolvedValue({
        content: [{ type: 'text', text: 'result' }],
      });

      toolManager.registerClient('test-server', mockClient);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const batchRequest = {
        id: 'batch-1',
        tools: [
          { name: 'tool1', parameters: {} },
          { name: 'tool2', parameters: {} },
        ],
        mode: 'parallel' as const,
      };

      const result = await toolManager.executeBatch(batchRequest);

      expect(result.batchId).toBe('batch-1');
      expect(result.summary.total).toBe(2);
      expect(result.summary.succeeded).toBe(2);
      expect(result.summary.failed).toBe(0);
    });

    it('should stop on error when configured', async () => {
      const mockTools = [
        { name: 'tool1', inputSchema: { type: 'object', properties: {} } },
        { name: 'tool2', inputSchema: { type: 'object', properties: {} } },
      ];

      mockClient.listTools.mockResolvedValue({ tools: mockTools });
      mockClient.callTool.mockRejectedValueOnce(new Error('Tool 1 failed')).mockResolvedValue({
        content: [{ type: 'text', text: 'result' }],
      });

      toolManager.registerClient('test-server', mockClient);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const batchRequest = {
        id: 'batch-2',
        tools: [
          { name: 'tool1', parameters: {} },
          { name: 'tool2', parameters: {} },
        ],
        mode: 'sequential' as const,
        stopOnError: true,
      };

      const result = await toolManager.executeBatch(batchRequest);

      expect(result.summary.failed).toBe(1);
      expect(result.summary.skipped).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('tool statistics', () => {
    it('should track tool execution statistics', async () => {
      const mockTools = [{ name: 'tracked-tool', inputSchema: { type: 'object', properties: {} } }];

      mockClient.listTools.mockResolvedValue({ tools: mockTools });
      mockClient.callTool.mockResolvedValue({
        content: [{ type: 'text', text: 'result' }],
      });

      toolManager.registerClient('test-server', mockClient);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Execute tool multiple times
      await toolManager.executeTool('tracked-tool', {});
      await toolManager.executeTool('tracked-tool', {});

      const stats = toolManager.getToolStats('tracked-tool', 'test-server');
      expect(stats).toBeDefined();
      // Stats tracking implementation would be tested here
    });
  });

  describe('tool chaining', () => {
    it('should execute a tool chain', async () => {
      const mockTools = [
        { name: 'step1', inputSchema: { type: 'object', properties: {} } },
        { name: 'step2', inputSchema: { type: 'object', properties: {} } },
      ];

      mockClient.listTools.mockResolvedValue({ tools: mockTools });
      mockClient.callTool
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'result1' }],
        })
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'result2' }],
        });

      toolManager.registerClient('test-server', mockClient);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const chain = {
        id: 'test-chain',
        name: 'Test Chain',
        tools: [
          { id: 'step1', toolName: 'step1', parameters: {} },
          { id: 'step2', toolName: 'step2', parameters: {} },
        ],
      };

      toolManager.registerChain(chain);
      const results = await toolManager.executeChain('test-chain');

      expect(results.size).toBe(2);
      expect(results.has('step1')).toBe(true);
      expect(results.has('step2')).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should clean up resources properly', async () => {
      toolManager.registerClient('test-server', mockClient);

      await toolManager.cleanup();

      const tools = await toolManager.listTools();
      expect(tools).toHaveLength(0);
    });
  });
});
