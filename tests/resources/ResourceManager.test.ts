/**
 * ResourceManager unit tests
 */

import { ResourceManager } from '../../src/resources/ResourceManager';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

jest.mock('@modelcontextprotocol/sdk/client/index.js');

describe('ResourceManager', () => {
  let resourceManager: ResourceManager;
  let mockClient: jest.Mocked<Client>;

  beforeEach(() => {
    resourceManager = new ResourceManager({
      enableSubscriptions: true,
      cache: {
        maxSize: 1024 * 1024, // 1MB
        defaultTTL: 300, // 5 minutes
      },
    });

    mockClient = {
      listResources: jest.fn(),
      readResource: jest.fn(),
      close: jest.fn(),
    } as unknown as jest.Mocked<Client>;
  });

  afterEach(async () => {
    await resourceManager.cleanup();
  });

  describe('discoverResources', () => {
    it('should discover resources from registered clients', async () => {
      const mockResources = [
        {
          uri: 'file:///test.txt',
          name: 'test.txt',
          description: 'Test file',
          mimeType: 'text/plain',
        },
        {
          uri: 'file:///data.json',
          name: 'data.json',
          description: 'JSON data',
          mimeType: 'application/json',
        },
      ];

      mockClient.listResources.mockResolvedValue({ resources: mockResources });

      resourceManager.registerClient('test-server', mockClient);
      const resources = await resourceManager.discoverResources('test-server');

      expect(resources).toHaveLength(2);
      expect(resources[0].uri).toBe('file:///test.txt');
      expect(resources[0].serverId).toBe('test-server');
      expect(resources[1].uri).toBe('file:///data.json');
    });
  });

  describe('readResource', () => {
    beforeEach(() => {
      resourceManager.registerClient('test-server', mockClient);
    });

    it('should read a resource successfully', async () => {
      const mockContent = {
        contents: [
          {
            text: 'Hello, world!',
            mimeType: 'text/plain',
          },
        ],
      };

      mockClient.readResource.mockResolvedValue(mockContent);

      const result = await resourceManager.readResource('file:///test.txt', 'test-server');

      expect(result.text).toBe('Hello, world!');
      expect(result.uri).toBe('file:///test.txt');
      expect(mockClient.readResource).toHaveBeenCalledWith({
        uri: 'file:///test.txt',
      });
    });

    it('should cache resources when configured', async () => {
      const mockContent = {
        contents: [
          {
            text: 'Cached content',
            mimeType: 'text/plain',
          },
        ],
      };

      mockClient.readResource.mockResolvedValue(mockContent);

      // First read - should call the client
      const result1 = await resourceManager.readResource('file:///cached.txt', 'test-server', {
        useCache: true,
      });

      expect(result1.text).toBe('Cached content');
      expect(mockClient.readResource).toHaveBeenCalledTimes(1);

      // Second read - should use cache
      const result2 = await resourceManager.readResource('file:///cached.txt', 'test-server', {
        useCache: true,
      });

      expect(result2.text).toBe('Cached content');
      expect(mockClient.readResource).toHaveBeenCalledTimes(1); // Still 1
    });

    it('should force refresh when requested', async () => {
      const mockContent1 = {
        contents: [{ text: 'Original content' }],
      };
      const mockContent2 = {
        contents: [{ text: 'Updated content' }],
      };

      mockClient.readResource
        .mockResolvedValueOnce(mockContent1)
        .mockResolvedValueOnce(mockContent2);

      // First read
      await resourceManager.readResource('file:///refresh.txt', 'test-server', {
        useCache: true,
      });

      // Force refresh
      const result = await resourceManager.readResource('file:///refresh.txt', 'test-server', {
        forceRefresh: true,
      });

      expect(result.text).toBe('Updated content');
      expect(mockClient.readResource).toHaveBeenCalledTimes(2);
    });
  });

  describe('listResources', () => {
    it('should list resources with pagination', async () => {
      const mockResources = Array.from({ length: 20 }, (_, i) => ({
        uri: `file:///file${i}.txt`,
        name: `file${i}.txt`,
        serverId: 'test-server',
        isAvailable: true,
      }));

      // Mock the internal resources map
      resourceManager['resources'] = new Map(
        mockResources.map((r) => [`${r.uri}:${r.serverId}`, r as any])
      );

      const result = await resourceManager.listResources({
        offset: 5,
        limit: 10,
      });

      expect(result.resources).toHaveLength(10);
      expect(result.total).toBe(20);
      expect(result.offset).toBe(5);
      expect(result.hasMore).toBe(true);
      expect(result.resources[0].uri).toBe('file:///file5.txt');
    });

    it('should filter resources by criteria', async () => {
      const mockResources = [
        {
          uri: 'file:///doc.txt',
          name: 'doc.txt',
          mimeType: 'text/plain',
          serverId: 'server1',
          isAvailable: true,
        },
        {
          uri: 'file:///data.json',
          name: 'data.json',
          mimeType: 'application/json',
          serverId: 'server1',
          isAvailable: true,
        },
        {
          uri: 'file:///image.png',
          name: 'image.png',
          mimeType: 'image/png',
          serverId: 'server2',
          isAvailable: true,
        },
      ];

      resourceManager['resources'] = new Map(
        mockResources.map((r) => [`${r.uri}:${r.serverId}`, r as any])
      );

      const result = await resourceManager.listResources({
        filter: {
          serverId: 'server1',
          mimeType: 'text/plain',
        },
      });

      expect(result.resources).toHaveLength(1);
      expect(result.resources[0].uri).toBe('file:///doc.txt');
    });
  });

  describe('executeBatch', () => {
    it('should execute batch resource requests', async () => {
      mockClient.readResource.mockResolvedValue({
        contents: [{ text: 'content' }],
      });

      resourceManager.registerClient('test-server', mockClient);

      const batchRequest = {
        id: 'batch-1',
        resources: [
          { uri: 'file:///file1.txt', serverId: 'test-server' },
          { uri: 'file:///file2.txt', serverId: 'test-server' },
        ],
        mode: 'parallel' as const,
      };

      const result = await resourceManager.executeBatch(batchRequest);

      expect(result.batchId).toBe('batch-1');
      expect(result.results).toHaveLength(2);
      expect(result.summary.succeeded).toBe(2);
      expect(result.summary.failed).toBe(0);
    });

    it('should stop on error when configured', async () => {
      mockClient.readResource.mockRejectedValueOnce(new Error('Read failed')).mockResolvedValue({
        contents: [{ text: 'content' }],
      });

      resourceManager.registerClient('test-server', mockClient);

      const batchRequest = {
        id: 'batch-2',
        resources: [
          { uri: 'file:///fail.txt', serverId: 'test-server' },
          { uri: 'file:///ok.txt', serverId: 'test-server' },
        ],
        mode: 'sequential' as const,
        stopOnError: true,
      };

      const result = await resourceManager.executeBatch(batchRequest);

      expect(result.summary.failed).toBe(1);
      expect(result.summary.succeeded).toBe(0);
      expect(result.results[0].error).toBeDefined();
    });
  });

  describe('cleanup', () => {
    it('should clean up resources and cache', async () => {
      resourceManager.registerClient('test-server', mockClient);

      await resourceManager.cleanup();

      const result = await resourceManager.listResources();
      expect(result.resources).toHaveLength(0);
    });
  });
});
