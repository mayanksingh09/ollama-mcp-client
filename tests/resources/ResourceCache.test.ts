/**
 * ResourceCache unit tests
 */

import { ResourceCache } from '../../src/resources/ResourceCache';
import type { MCPResourceContent } from '../../src/types/mcp.types';

describe('ResourceCache', () => {
  let cache: ResourceCache;

  beforeEach(() => {
    cache = new ResourceCache({
      maxSize: 1024 * 1024, // 1MB
      defaultTTL: 300, // 5 minutes
      evictionStrategy: 'LRU',
    });
  });

  afterEach(() => {
    cache.clear();
  });

  describe('get and set', () => {
    it('should store and retrieve resources', () => {
      const resource: MCPResourceContent = {
        uri: 'file:///test.txt',
        text: 'Test content',
        mimeType: 'text/plain',
      };

      cache.set('file:///test.txt', resource);
      const retrieved = cache.get('file:///test.txt');

      expect(retrieved).toBeDefined();
      expect(retrieved?.text).toBe('Test content');
      expect(retrieved?.uri).toBe('file:///test.txt');
    });

    it('should return undefined for non-existent resources', () => {
      const result = cache.get('file:///nonexistent.txt');
      expect(result).toBeUndefined();
    });

    it('should update existing resources', () => {
      const resource1: MCPResourceContent = {
        uri: 'file:///test.txt',
        text: 'Original content',
      };

      const resource2: MCPResourceContent = {
        uri: 'file:///test.txt',
        text: 'Updated content',
      };

      cache.set('file:///test.txt', resource1);
      cache.set('file:///test.txt', resource2);

      const retrieved = cache.get('file:///test.txt');
      expect(retrieved?.text).toBe('Updated content');
    });

    it('should expire entries after TTL', async () => {
      const shortCache = new ResourceCache({
        maxSize: 1024,
        defaultTTL: 0.1, // 100ms
        evictionStrategy: 'LRU',
      });

      const resource: MCPResourceContent = {
        uri: 'file:///test.txt',
        text: 'Temporary content',
      };

      shortCache.set('file:///test.txt', resource);
      expect(shortCache.get('file:///test.txt')).toBeDefined();

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(shortCache.get('file:///test.txt')).toBeUndefined();
      shortCache.clear();
    });

    it('should use custom TTL when provided', async () => {
      const resource: MCPResourceContent = {
        uri: 'file:///test.txt',
        text: 'Custom TTL content',
      };

      // Set with very short TTL
      cache.set('file:///test.txt', resource, 0.05); // 50ms

      expect(cache.get('file:///test.txt')).toBeDefined();

      // Wait for custom TTL expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(cache.get('file:///test.txt')).toBeUndefined();
    });
  });

  describe('has', () => {
    it('should check if resource exists', () => {
      const resource: MCPResourceContent = {
        uri: 'file:///test.txt',
        text: 'Test content',
      };

      expect(cache.has('file:///test.txt')).toBe(false);

      cache.set('file:///test.txt', resource);
      expect(cache.has('file:///test.txt')).toBe(true);
    });

    it('should return false for expired resources', async () => {
      const shortCache = new ResourceCache({
        maxSize: 1024,
        defaultTTL: 0.1, // 100ms
        evictionStrategy: 'LRU',
      });

      const resource: MCPResourceContent = {
        uri: 'file:///test.txt',
        text: 'Temporary',
      };

      shortCache.set('file:///test.txt', resource);
      expect(shortCache.has('file:///test.txt')).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(shortCache.has('file:///test.txt')).toBe(false);
      shortCache.clear();
    });
  });

  describe('delete', () => {
    it('should delete resources', () => {
      const resource: MCPResourceContent = {
        uri: 'file:///test.txt',
        text: 'Test content',
      };

      cache.set('file:///test.txt', resource);
      expect(cache.has('file:///test.txt')).toBe(true);

      cache.delete('file:///test.txt');
      expect(cache.has('file:///test.txt')).toBe(false);
    });

    it('should handle deleting non-existent resources', () => {
      expect(() => cache.delete('file:///nonexistent.txt')).not.toThrow();
    });
  });

  describe('clear', () => {
    it('should clear all resources', () => {
      const resources: MCPResourceContent[] = [
        { uri: 'file:///1.txt', text: 'Content 1' },
        { uri: 'file:///2.txt', text: 'Content 2' },
        { uri: 'file:///3.txt', text: 'Content 3' },
      ];

      resources.forEach((r) => cache.set(r.uri, r));
      expect(cache.getSize()).toBe(3);

      cache.clear();

      expect(cache.getSize()).toBe(0);
      resources.forEach((r) => {
        expect(cache.has(r.uri)).toBe(false);
      });
    });
  });

  describe('size management', () => {
    it('should respect max size limit with LRU eviction', () => {
      const smallCache = new ResourceCache({
        maxSize: 100, // Very small cache
        defaultTTL: 300,
        evictionStrategy: 'LRU',
      });

      // Each resource is about 40 bytes, so max 2 can fit
      const resource1: MCPResourceContent = {
        uri: 'file:///1.txt',
        text: 'Content 1 with some padding text',
      };

      const resource2: MCPResourceContent = {
        uri: 'file:///2.txt',
        text: 'Content 2 with some padding text',
      };

      const resource3: MCPResourceContent = {
        uri: 'file:///3.txt',
        text: 'Content 3 with some padding text',
      };

      smallCache.set('file:///1.txt', resource1);
      smallCache.set('file:///2.txt', resource2);
      smallCache.set('file:///3.txt', resource3);

      // First resource should be evicted (LRU)
      expect(smallCache.has('file:///1.txt')).toBe(false);
      expect(smallCache.has('file:///2.txt')).toBe(true);
      expect(smallCache.has('file:///3.txt')).toBe(true);

      smallCache.clear();
    });

    it('should implement LFU eviction strategy', () => {
      const lfuCache = new ResourceCache({
        maxSize: 100,
        defaultTTL: 300,
        evictionStrategy: 'LFU',
      });

      const resource1: MCPResourceContent = {
        uri: 'file:///1.txt',
        text: 'Content 1 with padding',
      };

      const resource2: MCPResourceContent = {
        uri: 'file:///2.txt',
        text: 'Content 2 with padding',
      };

      const resource3: MCPResourceContent = {
        uri: 'file:///3.txt',
        text: 'Content 3 with padding',
      };

      // Set resources
      lfuCache.set('file:///1.txt', resource1);
      lfuCache.set('file:///2.txt', resource2);

      // Access resource 1 multiple times to increase frequency
      lfuCache.get('file:///1.txt');
      lfuCache.get('file:///1.txt');

      // Add third resource, should evict least frequently used (resource2)
      lfuCache.set('file:///3.txt', resource3);

      expect(lfuCache.has('file:///1.txt')).toBe(true); // Most frequently used
      expect(lfuCache.has('file:///2.txt')).toBe(false); // Least frequently used, evicted
      expect(lfuCache.has('file:///3.txt')).toBe(true);

      lfuCache.clear();
    });

    it('should implement FIFO eviction strategy', () => {
      const fifoCache = new ResourceCache({
        maxSize: 100,
        defaultTTL: 300,
        evictionStrategy: 'FIFO',
      });

      const resource1: MCPResourceContent = {
        uri: 'file:///1.txt',
        text: 'Content 1 with padding',
      };

      const resource2: MCPResourceContent = {
        uri: 'file:///2.txt',
        text: 'Content 2 with padding',
      };

      const resource3: MCPResourceContent = {
        uri: 'file:///3.txt',
        text: 'Content 3 with padding',
      };

      fifoCache.set('file:///1.txt', resource1);
      fifoCache.set('file:///2.txt', resource2);
      fifoCache.set('file:///3.txt', resource3);

      // First in should be first out
      expect(fifoCache.has('file:///1.txt')).toBe(false);
      expect(fifoCache.has('file:///2.txt')).toBe(true);
      expect(fifoCache.has('file:///3.txt')).toBe(true);

      fifoCache.clear();
    });
  });

  describe('getSize', () => {
    it('should return current cache size', () => {
      expect(cache.getSize()).toBe(0);

      const resource1: MCPResourceContent = {
        uri: 'file:///1.txt',
        text: 'Content 1',
      };

      const resource2: MCPResourceContent = {
        uri: 'file:///2.txt',
        text: 'Content 2',
      };

      cache.set('file:///1.txt', resource1);
      expect(cache.getSize()).toBe(1);

      cache.set('file:///2.txt', resource2);
      expect(cache.getSize()).toBe(2);

      cache.delete('file:///1.txt');
      expect(cache.getSize()).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      const resource: MCPResourceContent = {
        uri: 'file:///test.txt',
        text: 'Test content',
      };

      // Initial stats
      let stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(0);
      expect(stats.hitRate).toBe(0);

      // Miss
      cache.get('file:///test.txt');
      stats = cache.getStats();
      expect(stats.misses).toBe(1);

      // Set and hit
      cache.set('file:///test.txt', resource);
      cache.get('file:///test.txt');
      stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.size).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });

    it('should track evictions', () => {
      const smallCache = new ResourceCache({
        maxSize: 50,
        defaultTTL: 300,
        evictionStrategy: 'LRU',
      });

      const resource1: MCPResourceContent = {
        uri: 'file:///1.txt',
        text: 'Large content that takes space',
      };

      const resource2: MCPResourceContent = {
        uri: 'file:///2.txt',
        text: 'Another large content piece',
      };

      smallCache.set('file:///1.txt', resource1);
      smallCache.set('file:///2.txt', resource2);

      const stats = smallCache.getStats();
      expect(stats.evictions).toBeGreaterThan(0);

      smallCache.clear();
    });
  });

  describe('pruneExpired', () => {
    it('should remove expired entries', async () => {
      const shortCache = new ResourceCache({
        maxSize: 1024,
        defaultTTL: 0.1, // 100ms
        evictionStrategy: 'LRU',
      });

      const resource1: MCPResourceContent = {
        uri: 'file:///1.txt',
        text: 'Content 1',
      };

      const resource2: MCPResourceContent = {
        uri: 'file:///2.txt',
        text: 'Content 2',
      };

      shortCache.set('file:///1.txt', resource1);

      // Wait and add second resource
      await new Promise((resolve) => setTimeout(resolve, 50));
      shortCache.set('file:///2.txt', resource2);

      // Wait for first to expire
      await new Promise((resolve) => setTimeout(resolve, 60));

      shortCache.pruneExpired();

      expect(shortCache.has('file:///1.txt')).toBe(false);
      expect(shortCache.has('file:///2.txt')).toBe(true);

      shortCache.clear();
    });
  });

  describe('resource metadata', () => {
    it('should store and retrieve resources with metadata', () => {
      const resource: MCPResourceContent = {
        uri: 'file:///test.txt',
        text: 'Test content',
        mimeType: 'text/plain',
        blob: 'base64encodeddata',
      };

      cache.set('file:///test.txt', resource);
      const retrieved = cache.get('file:///test.txt');

      expect(retrieved?.mimeType).toBe('text/plain');
      expect(retrieved?.blob).toBe('base64encodeddata');
    });
  });

  describe('getBytesUsed', () => {
    it('should calculate total bytes used', () => {
      expect(cache.getBytesUsed()).toBe(0);

      const resource1: MCPResourceContent = {
        uri: 'file:///1.txt',
        text: 'Short',
      };

      const resource2: MCPResourceContent = {
        uri: 'file:///2.txt',
        text: 'Much longer content with more bytes',
      };

      cache.set('file:///1.txt', resource1);
      const bytes1 = cache.getBytesUsed();
      expect(bytes1).toBeGreaterThan(0);

      cache.set('file:///2.txt', resource2);
      const bytes2 = cache.getBytesUsed();
      expect(bytes2).toBeGreaterThan(bytes1);
    });
  });

  describe('getOldestEntry and getNewestEntry', () => {
    it('should track oldest and newest entries', async () => {
      const resource1: MCPResourceContent = {
        uri: 'file:///old.txt',
        text: 'Old content',
      };

      const resource2: MCPResourceContent = {
        uri: 'file:///new.txt',
        text: 'New content',
      };

      cache.set('file:///old.txt', resource1);

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      cache.set('file:///new.txt', resource2);

      const oldest = cache.getOldestEntry();
      const newest = cache.getNewestEntry();

      expect(oldest?.uri).toBe('file:///old.txt');
      expect(newest?.uri).toBe('file:///new.txt');
    });
  });
});
