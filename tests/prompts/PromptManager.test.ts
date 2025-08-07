/**
 * PromptManager unit tests
 */

import { PromptManager } from '../../src/prompts/PromptManager';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

jest.mock('@modelcontextprotocol/sdk/client/index.js');

describe('PromptManager', () => {
  let promptManager: PromptManager;
  let mockClient: jest.Mocked<Client>;

  beforeEach(() => {
    promptManager = new PromptManager({
      cache: {
        enabled: true,
        maxSize: 100,
        ttl: 300,
      },
      sampling: {
        enabled: true,
        temperature: 0.7,
        topP: 0.9,
      },
    });

    mockClient = {
      listPrompts: jest.fn(),
      getPrompt: jest.fn(),
      close: jest.fn(),
    } as unknown as jest.Mocked<Client>;
  });

  afterEach(async () => {
    await promptManager.cleanup();
  });

  describe('discoverPrompts', () => {
    it('should discover prompts from registered clients', async () => {
      const mockPrompts = [
        {
          name: 'greeting',
          description: 'Generate a greeting',
          arguments: [
            {
              name: 'name',
              description: 'Person to greet',
              required: true,
            },
          ],
        },
        {
          name: 'summarize',
          description: 'Summarize text',
          arguments: [
            {
              name: 'text',
              description: 'Text to summarize',
              required: true,
            },
            {
              name: 'length',
              description: 'Summary length',
              required: false,
            },
          ],
        },
      ];

      mockClient.listPrompts.mockResolvedValue({ prompts: mockPrompts });

      promptManager.registerClient('test-server', mockClient);
      const prompts = await promptManager.discoverPrompts('test-server');

      expect(prompts).toHaveLength(2);
      expect(prompts[0].name).toBe('greeting');
      expect(prompts[0].serverId).toBe('test-server');
      expect(prompts[1].name).toBe('summarize');
      expect(prompts[1].arguments).toHaveLength(2);
    });
  });

  describe('executePrompt', () => {
    beforeEach(() => {
      promptManager.registerClient('test-server', mockClient);
    });

    it('should execute a prompt successfully', async () => {
      const mockPromptList = [
        {
          name: 'greeting',
          description: 'Generate a greeting',
          arguments: [
            {
              name: 'name',
              description: 'Person to greet',
              required: true,
            },
          ],
        },
      ];

      const mockPromptResult = {
        messages: [
          {
            role: 'assistant',
            content: 'Hello, John! How are you today?',
          },
        ],
      };

      mockClient.listPrompts.mockResolvedValue({ prompts: mockPromptList });
      mockClient.getPrompt.mockResolvedValue(mockPromptResult);

      // Wait for discovery
      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = await promptManager.executePrompt(
        'greeting',
        { name: 'John' },
        undefined,
        'test-server'
      );

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toContain('Hello, John');
      expect(result.promptName).toBe('greeting');
      expect(result.serverId).toBe('test-server');
      expect(mockClient.getPrompt).toHaveBeenCalledWith({
        name: 'greeting',
        arguments: { name: 'John' },
      });
    });

    it('should use cached prompt results when enabled', async () => {
      const mockPromptList = [
        {
          name: 'cached-prompt',
          description: 'A cached prompt',
          arguments: [],
        },
      ];

      const mockResult = {
        messages: [
          {
            role: 'assistant',
            content: 'Cached response',
          },
        ],
      };

      mockClient.listPrompts.mockResolvedValue({ prompts: mockPromptList });
      mockClient.getPrompt.mockResolvedValue(mockResult);

      // Wait for discovery
      await new Promise((resolve) => setTimeout(resolve, 100));

      // First execution - should call the client
      const result1 = await promptManager.executePrompt(
        'cached-prompt',
        {},
        { useCache: true },
        'test-server'
      );

      expect(result1.messages[0].content).toBe('Cached response');
      expect(mockClient.getPrompt).toHaveBeenCalledTimes(1);

      // Second execution - should use cache
      const result2 = await promptManager.executePrompt(
        'cached-prompt',
        {},
        { useCache: true },
        'test-server'
      );

      expect(result2.messages[0].content).toBe('Cached response');
      expect(result2.fromCache).toBe(true);
      expect(mockClient.getPrompt).toHaveBeenCalledTimes(1); // Still 1
    });

    it('should validate required arguments', async () => {
      const mockPromptList = [
        {
          name: 'strict-prompt',
          description: 'Prompt with required args',
          arguments: [
            {
              name: 'required_arg',
              description: 'Required argument',
              required: true,
            },
          ],
        },
      ];

      mockClient.listPrompts.mockResolvedValue({ prompts: mockPromptList });

      // Wait for discovery
      await new Promise((resolve) => setTimeout(resolve, 100));

      await expect(
        promptManager.executePrompt(
          'strict-prompt',
          {}, // Missing required_arg
          undefined,
          'test-server'
        )
      ).rejects.toThrow('Missing required argument: required_arg');
    });
  });

  describe('composePrompt', () => {
    it('should compose multiple prompts into one', async () => {
      const mockPrompts = [
        {
          name: 'intro',
          description: 'Introduction',
          arguments: [],
        },
        {
          name: 'body',
          description: 'Body content',
          arguments: [{ name: 'topic', required: true }],
        },
        {
          name: 'conclusion',
          description: 'Conclusion',
          arguments: [],
        },
      ];

      mockClient.listPrompts.mockResolvedValue({ prompts: mockPrompts });
      mockClient.getPrompt
        .mockResolvedValueOnce({
          messages: [{ role: 'assistant', content: 'Welcome!' }],
        })
        .mockResolvedValueOnce({
          messages: [{ role: 'assistant', content: 'This is about AI.' }],
        })
        .mockResolvedValueOnce({
          messages: [{ role: 'assistant', content: 'Thank you!' }],
        });

      promptManager.registerClient('test-server', mockClient);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const composition = {
        id: 'full-doc',
        name: 'Full Document',
        prompts: [
          { promptName: 'intro', parameters: {} },
          { promptName: 'body', parameters: { topic: 'AI' } },
          { promptName: 'conclusion', parameters: {} },
        ],
        serverId: 'test-server',
      };

      const result = await promptManager.composePrompt(composition);

      expect(result.messages).toHaveLength(3);
      expect(result.messages[0].content).toBe('Welcome!');
      expect(result.messages[1].content).toBe('This is about AI.');
      expect(result.messages[2].content).toBe('Thank you!');
      expect(result.compositionId).toBe('full-doc');
    });
  });

  describe('batch execution', () => {
    it('should execute batch prompt requests', async () => {
      const mockPrompts = [
        { name: 'prompt1', arguments: [] },
        { name: 'prompt2', arguments: [] },
      ];

      mockClient.listPrompts.mockResolvedValue({ prompts: mockPrompts });
      mockClient.getPrompt.mockResolvedValue({
        messages: [{ role: 'assistant', content: 'Response' }],
      });

      promptManager.registerClient('test-server', mockClient);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const batchRequest = {
        id: 'batch-1',
        prompts: [
          { name: 'prompt1', parameters: {}, serverId: 'test-server' },
          { name: 'prompt2', parameters: {}, serverId: 'test-server' },
        ],
        mode: 'parallel' as const,
      };

      const result = await promptManager.executeBatch(batchRequest);

      expect(result.batchId).toBe('batch-1');
      expect(result.results).toHaveLength(2);
      expect(result.summary.succeeded).toBe(2);
      expect(result.summary.failed).toBe(0);
    });

    it('should stop on error when configured', async () => {
      const mockPrompts = [
        { name: 'prompt1', arguments: [] },
        { name: 'prompt2', arguments: [] },
      ];

      mockClient.listPrompts.mockResolvedValue({ prompts: mockPrompts });
      mockClient.getPrompt.mockRejectedValueOnce(new Error('Prompt failed')).mockResolvedValue({
        messages: [{ role: 'assistant', content: 'Response' }],
      });

      promptManager.registerClient('test-server', mockClient);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const batchRequest = {
        id: 'batch-2',
        prompts: [
          { name: 'prompt1', parameters: {}, serverId: 'test-server' },
          { name: 'prompt2', parameters: {}, serverId: 'test-server' },
        ],
        mode: 'sequential' as const,
        stopOnError: true,
      };

      const result = await promptManager.executeBatch(batchRequest);

      expect(result.summary.failed).toBe(1);
      expect(result.summary.succeeded).toBe(0);
      expect(result.results[0].error).toBeDefined();
    });
  });

  describe('listPrompts', () => {
    it('should list prompts with pagination', async () => {
      const mockPrompts = Array.from({ length: 20 }, (_, i) => ({
        name: `prompt${i}`,
        description: `Prompt ${i}`,
        serverId: 'test-server',
        isAvailable: true,
        arguments: [],
      }));

      // Mock the internal prompts map
      promptManager['prompts'] = new Map(
        mockPrompts.map((p) => [`${p.name}:${p.serverId}`, p as any])
      );

      const result = await promptManager.listPrompts({
        offset: 5,
        limit: 10,
      });

      expect(result).toHaveLength(10);
      expect(result[0].name).toBe('prompt5');
      expect(result[9].name).toBe('prompt14');
    });

    it('should filter prompts by criteria', async () => {
      const mockPrompts = [
        {
          name: 'greeting',
          description: 'Greeting prompt',
          serverId: 'server1',
          isAvailable: true,
          arguments: [],
          tags: ['social'],
        },
        {
          name: 'code-review',
          description: 'Code review prompt',
          serverId: 'server1',
          isAvailable: true,
          arguments: [],
          tags: ['development'],
        },
        {
          name: 'summary',
          description: 'Summary prompt',
          serverId: 'server2',
          isAvailable: true,
          arguments: [],
          tags: ['text'],
        },
      ];

      promptManager['prompts'] = new Map(
        mockPrompts.map((p) => [`${p.name}:${p.serverId}`, p as any])
      );

      const result = await promptManager.listPrompts({
        serverId: 'server1',
      });

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('greeting');
      expect(result[1].name).toBe('code-review');
    });
  });

  describe('prompt templates', () => {
    it('should register and use prompt templates', async () => {
      const template = {
        id: 'email-template',
        name: 'Email Template',
        template: 'Dear {{recipient}}, {{content}} Best regards, {{sender}}',
        variables: ['recipient', 'content', 'sender'],
      };

      promptManager.registerTemplate(template);

      const expanded = promptManager.expandTemplate('email-template', {
        recipient: 'John',
        content: 'Thank you for your help.',
        sender: 'Alice',
      });

      expect(expanded).toBe('Dear John, Thank you for your help. Best regards, Alice');
    });

    it('should handle missing template variables', () => {
      const template = {
        id: 'incomplete',
        name: 'Incomplete Template',
        template: 'Hello {{name}}, welcome to {{place}}!',
        variables: ['name', 'place'],
      };

      promptManager.registerTemplate(template);

      const expanded = promptManager.expandTemplate('incomplete', {
        name: 'John',
        // Missing 'place'
      });

      expect(expanded).toBe('Hello John, welcome to {{place}}!');
    });
  });

  describe('cleanup', () => {
    it('should clean up resources and cache', async () => {
      promptManager.registerClient('test-server', mockClient);

      await promptManager.cleanup();

      const prompts = await promptManager.listPrompts();
      expect(prompts).toHaveLength(0);
    });
  });
});
