/**
 * Prompt Cache - Caching for prompt results
 */

import type {
  PromptCacheConfig,
  PromptCacheEntry,
  PromptExecutionResult,
} from '../types/prompts.types';
import crypto from 'crypto';

export class PromptCache {
  private cache: Map<string, PromptCacheEntry> = new Map();
  private config: PromptCacheConfig;

  constructor(config: PromptCacheConfig = {}) {
    this.config = {
      maxEntries: 500,
      defaultTTL: 3600,
      strategy: 'lru',
      ...config,
    };
  }

  /**
   * Get cached prompt result
   */
  async get(key: string): Promise<PromptCacheEntry | undefined> {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check expiry
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      this.cache.delete(key);
      return undefined;
    }

    // Update access stats
    entry.accessCount++;
    entry.lastAccessedAt = new Date();

    return entry;
  }

  /**
   * Set cached prompt result
   */
  async set(key: string, result: PromptExecutionResult, ttl?: number): Promise<void> {
    // Evict if at capacity
    if (this.cache.size >= (this.config.maxEntries || 500)) {
      this.evict();
    }

    const entry: PromptCacheEntry = {
      key,
      promptName: result.promptName,
      parametersHash: this.hashParameters(result.parameters || {}),
      result,
      cachedAt: new Date(),
      expiresAt: ttl ? new Date(Date.now() + ttl * 1000) : undefined,
      accessCount: 0,
      lastAccessedAt: new Date(),
    };

    this.cache.set(key, entry);
  }

  /**
   * Generate cache key
   */
  generateKey(name: string, parameters: Record<string, unknown>): string {
    if (this.config.keyGenerator) {
      return this.config.keyGenerator(name, parameters);
    }
    return `${name}:${this.hashParameters(parameters)}`;
  }

  /**
   * Hash parameters for cache key
   */
  private hashParameters(params: Record<string, unknown>): string {
    const sorted = JSON.stringify(params, Object.keys(params).sort());
    return crypto.createHash('md5').update(sorted).digest('hex');
  }

  /**
   * Evict based on strategy
   */
  private evict(): void {
    if (this.cache.size === 0) return;

    if (this.config.strategy === 'lru') {
      // Find least recently used
      let lruKey: string | undefined;
      let lruTime = new Date();

      for (const [key, entry] of this.cache.entries()) {
        if (entry.lastAccessedAt < lruTime) {
          lruTime = entry.lastAccessedAt;
          lruKey = key;
        }
      }

      if (lruKey) {
        this.cache.delete(lruKey);
      }
    } else if (this.config.strategy === 'lfu') {
      // Find least frequently used
      let lfuKey: string | undefined;
      let lfuCount = Infinity;

      for (const [key, entry] of this.cache.entries()) {
        if (entry.accessCount < lfuCount) {
          lfuCount = entry.accessCount;
          lfuKey = key;
        }
      }

      if (lfuKey) {
        this.cache.delete(lfuKey);
      }
    } else {
      // TTL or FIFO - remove oldest
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    this.clear();
  }
}
