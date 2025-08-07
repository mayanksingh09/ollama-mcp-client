/**
 * Resource Cache - LRU caching for resources
 */

import type { ResourceCacheConfig, ResourceCacheEntry } from '../types/resources.types';
import type { MCPResourceContent } from '../types/mcp.types';
import type { Logger } from 'winston';
import winston from 'winston';

export class ResourceCache {
  private cache: Map<string, ResourceCacheEntry> = new Map();
  private accessOrder: string[] = [];
  private config: ResourceCacheConfig;
  private logger: Logger;
  private currentSize: number = 0;

  constructor(config: ResourceCacheConfig = {}) {
    this.config = {
      maxSize: 100 * 1024 * 1024, // 100MB default
      maxEntries: 1000,
      defaultTTL: 3600, // 1 hour
      strategy: 'lru',
      ...config,
    };

    this.logger = winston.createLogger({
      level: 'debug',
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
      defaultMeta: { service: 'ResourceCache' },
      transports: [
        new winston.transports.Console({
          format: winston.format.simple(),
        }),
      ],
    });
  }

  /**
   * Get a cached resource
   */
  async get(key: string): Promise<ResourceCacheEntry | undefined> {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      return undefined;
    }

    // Update access tracking
    entry.accessCount++;
    entry.lastAccessedAt = new Date();
    this.updateAccessOrder(key);

    return entry;
  }

  /**
   * Set a cached resource
   */
  async set(key: string, content: MCPResourceContent, ttl?: number): Promise<void> {
    const size = this.calculateSize(content);

    // Check size limits
    if (size > (this.config.maxSize || Infinity)) {
      this.logger.warn(`Resource too large to cache: ${size} bytes`);
      return;
    }

    // Evict if necessary
    while (
      this.cache.size >= (this.config.maxEntries || Infinity) ||
      this.currentSize + size > (this.config.maxSize || Infinity)
    ) {
      this.evict();
    }

    const entry: ResourceCacheEntry = {
      uri: content.uri,
      serverId: 'default',
      content,
      cachedAt: new Date(),
      expiresAt: ttl ? new Date(Date.now() + ttl * 1000) : undefined,
      accessCount: 0,
      lastAccessedAt: new Date(),
      size,
    };

    this.cache.set(key, entry);
    this.accessOrder.push(key);
    this.currentSize += size;
  }

  /**
   * Generate cache key
   */
  generateKey(uri: string, serverId: string): string {
    if (this.config.keyGenerator) {
      return this.config.keyGenerator(uri, serverId);
    }
    return `${serverId}:${uri}`;
  }

  /**
   * Calculate content size
   */
  private calculateSize(content: MCPResourceContent): number {
    const text = content.text || '';
    const blob = content.blob || '';
    return Buffer.byteLength(text) + Buffer.byteLength(blob);
  }

  /**
   * Evict based on strategy
   */
  private evict(): void {
    if (this.config.strategy === 'lru') {
      this.evictLRU();
    } else if (this.config.strategy === 'lfu') {
      this.evictLFU();
    } else if (this.config.strategy === 'fifo') {
      this.evictFIFO();
    }
  }

  /**
   * Evict least recently used
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;

    const key = this.accessOrder.shift();
    if (key) {
      const entry = this.cache.get(key);
      if (entry) {
        this.currentSize -= entry.size;
      }
      this.cache.delete(key);
    }
  }

  /**
   * Evict least frequently used
   */
  private evictLFU(): void {
    let minAccess = Infinity;
    let evictKey: string | undefined;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessCount < minAccess) {
        minAccess = entry.accessCount;
        evictKey = key;
      }
    }

    if (evictKey) {
      const entry = this.cache.get(evictKey);
      if (entry) {
        this.currentSize -= entry.size;
      }
      this.cache.delete(evictKey);
      this.removeFromAccessOrder(evictKey);
    }
  }

  /**
   * Evict first in first out
   */
  private evictFIFO(): void {
    const firstKey = this.cache.keys().next().value;
    if (firstKey) {
      const entry = this.cache.get(firstKey);
      if (entry) {
        this.currentSize -= entry.size;
      }
      this.cache.delete(firstKey);
      this.removeFromAccessOrder(firstKey);
    }
  }

  /**
   * Update access order for LRU
   */
  private updateAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  /**
   * Remove from access order
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.currentSize = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    entries: number;
    size: number;
    maxSize: number;
    hitRate: number;
  } {
    return {
      entries: this.cache.size,
      size: this.currentSize,
      maxSize: this.config.maxSize || 0,
      hitRate: 0, // Would need to track hits/misses
    };
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    this.clear();
    this.logger.info('ResourceCache cleaned up');
  }
}
