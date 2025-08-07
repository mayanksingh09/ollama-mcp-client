/**
 * PromptCache unit tests
 */

import { PromptCache } from '../../src/prompts/PromptCache';
import type { PromptExecutionResult } from '../../src/types/prompts.types';

describe('PromptCache', () => {
  let cache: PromptCache;

  beforeEach(() => {
    cache = new PromptCache({
      enabled: true,
      maxSize: 10,
      ttl: 300, // 5 minutes
    });
  });

  afterEach(() => {
    cache.clear();
  });

  describe('get and set', () => {
    it('should store and retrieve prompt results', () => {
      const result: PromptExecutionResult = {
        promptName: 'test-prompt',
        messages: [
          {
            role: 'assistant',
            content: 'Test response',
          },
        ],
        serverId: 'test-server',
        executionTime: 100,
      };

      const key = cache.generateKey('test-prompt', { param1: 'value1' });
      cache.set(key, result);

      const retrieved = cache.get(key);
      expect(retrieved).toBeDefined();
      expect(retrieved?.promptName).toBe('test-prompt');
      expect(retrieved?.messages[0].content).toBe('Test response');
    });

    it('should return undefined for non-existent keys', () => {
      const key = cache.generateKey('non-existent', {});
      const result = cache.get(key);
      expect(result).toBeUndefined();
    });

    it('should expire entries after TTL', async () => {
      const shortCache = new PromptCache({
        enabled: true,
        maxSize: 10,
        ttl: 0.1, // 100ms
      });

      const result: PromptExecutionResult = {
        promptName: 'test-prompt',
        messages: [{ role: 'assistant', content: 'Test' }],
        serverId: 'test-server',
        executionTime: 50,
      };

      const key = shortCache.generateKey('test-prompt', {});
      shortCache.set(key, result);

      // Should exist immediately
      expect(shortCache.get(key)).toBeDefined();

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be expired
      expect(shortCache.get(key)).toBeUndefined();
      shortCache.clear();
    });
  });

  describe('generateKey', () => {
    it('should generate consistent keys for same inputs', () => {
      const params = { param1: 'value1', param2: 'value2' };
      const key1 = cache.generateKey('prompt-name', params);
      const key2 = cache.generateKey('prompt-name', params);

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different prompt names', () => {
      const params = { param1: 'value1' };
      const key1 = cache.generateKey('prompt1', params);
      const key2 = cache.generateKey('prompt2', params);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different parameters', () => {
      const key1 = cache.generateKey('prompt', { param1: 'value1' });
      const key2 = cache.generateKey('prompt', { param1: 'value2' });

      expect(key1).not.toBe(key2);
    });

    it('should handle undefined parameters', () => {
      const key1 = cache.generateKey('prompt', undefined);
      const key2 = cache.generateKey('prompt', {});

      expect(key1).toBeDefined();
      expect(key2).toBeDefined();
      // Empty object and undefined should generate different keys
      expect(key1).not.toBe(key2);
    });

    it('should handle parameter order consistently', () => {
      const key1 = cache.generateKey('prompt', { b: '2', a: '1' });
      const key2 = cache.generateKey('prompt', { a: '1', b: '2' });

      expect(key1).toBe(key2);
    });
  });

  describe('has', () => {
    it('should check if key exists', () => {
      const result: PromptExecutionResult = {
        promptName: 'test',
        messages: [],
        serverId: 'server',
        executionTime: 10,
      };

      const key = cache.generateKey('test', {});
      expect(cache.has(key)).toBe(false);

      cache.set(key, result);
      expect(cache.has(key)).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete entries', () => {
      const result: PromptExecutionResult = {
        promptName: 'test',
        messages: [],
        serverId: 'server',
        executionTime: 10,
      };

      const key = cache.generateKey('test', {});
      cache.set(key, result);
      expect(cache.has(key)).toBe(true);

      cache.delete(key);
      expect(cache.has(key)).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all entries', () => {
      const result1: PromptExecutionResult = {
        promptName: 'prompt1',
        messages: [],
        serverId: 'server',
        executionTime: 10,
      };

      const result2: PromptExecutionResult = {
        promptName: 'prompt2',
        messages: [],
        serverId: 'server',
        executionTime: 20,
      };

      const key1 = cache.generateKey('prompt1', {});
      const key2 = cache.generateKey('prompt2', {});

      cache.set(key1, result1);
      cache.set(key2, result2);

      expect(cache.getSize()).toBe(2);

      cache.clear();

      expect(cache.getSize()).toBe(0);
      expect(cache.has(key1)).toBe(false);
      expect(cache.has(key2)).toBe(false);
    });
  });

  describe('size limits', () => {
    it('should respect max size limit', () => {
      const smallCache = new PromptCache({
        enabled: true,
        maxSize: 3,
        ttl: 300,
      });

      // Add 4 items to a cache with max size 3
      for (let i = 0; i < 4; i++) {
        const result: PromptExecutionResult = {
          promptName: `prompt${i}`,
          messages: [],
          serverId: 'server',
          executionTime: 10,
        };
        const key = smallCache.generateKey(`prompt${i}`, {});
        smallCache.set(key, result);
      }

      // Should only have 3 items (LRU eviction)
      expect(smallCache.getSize()).toBe(3);

      // First item should be evicted
      const firstKey = smallCache.generateKey('prompt0', {});
      expect(smallCache.has(firstKey)).toBe(false);

      // Last 3 items should still be there
      for (let i = 1; i < 4; i++) {
        const key = smallCache.generateKey(`prompt${i}`, {});
        expect(smallCache.has(key)).toBe(true);
      }

      smallCache.clear();
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      const result: PromptExecutionResult = {
        promptName: 'test',
        messages: [],
        serverId: 'server',
        executionTime: 10,
      };

      const key = cache.generateKey('test', {});

      // Initial stats
      let stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(0);
      expect(stats.hitRate).toBe(0);

      // Miss
      cache.get(key);
      stats = cache.getStats();
      expect(stats.misses).toBe(1);

      // Set and hit
      cache.set(key, result);
      cache.get(key);
      stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.size).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });
  });

  describe('pruneExpired', () => {
    it('should remove expired entries', async () => {
      const shortCache = new PromptCache({
        enabled: true,
        maxSize: 10,
        ttl: 0.1, // 100ms
      });

      const result1: PromptExecutionResult = {
        promptName: 'prompt1',
        messages: [],
        serverId: 'server',
        executionTime: 10,
      };

      const result2: PromptExecutionResult = {
        promptName: 'prompt2',
        messages: [],
        serverId: 'server',
        executionTime: 20,
      };

      const key1 = shortCache.generateKey('prompt1', {});
      const key2 = shortCache.generateKey('prompt2', {});

      shortCache.set(key1, result1);

      // Wait 50ms then add second item
      await new Promise((resolve) => setTimeout(resolve, 50));
      shortCache.set(key2, result2);

      // Wait another 60ms (total 110ms for first, 60ms for second)
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Prune expired entries
      shortCache.pruneExpired();

      // First should be expired, second should still be valid
      expect(shortCache.has(key1)).toBe(false);
      expect(shortCache.has(key2)).toBe(true);

      shortCache.clear();
    });
  });

  describe('disabled cache', () => {
    it('should not store when disabled', () => {
      const disabledCache = new PromptCache({
        enabled: false,
        maxSize: 10,
        ttl: 300,
      });

      const result: PromptExecutionResult = {
        promptName: 'test',
        messages: [],
        serverId: 'server',
        executionTime: 10,
      };

      const key = disabledCache.generateKey('test', {});
      disabledCache.set(key, result);

      expect(disabledCache.get(key)).toBeUndefined();
      expect(disabledCache.getSize()).toBe(0);
    });
  });
});
