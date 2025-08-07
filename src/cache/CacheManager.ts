import { EventEmitter } from 'events';
import type { CacheStrategy } from './strategies/CacheStrategy';

export interface CacheConfig {
  maxSize?: number;
  maxItems?: number;
  ttl?: number;
  strategy?: 'lru' | 'lfu' | 'fifo' | 'ttl';
  autoCleanup?: boolean;
  cleanupInterval?: number;
  serializeValues?: boolean;
}

export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  size: number;
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  hitRate: number;
  size: number;
  itemCount: number;
}

export abstract class CacheManager<T = unknown> extends EventEmitter {
  protected config: Required<CacheConfig>;
  protected stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    evictions: 0,
    hitRate: 0,
    size: 0,
    itemCount: 0,
  };
  protected cleanupTimer?: NodeJS.Timeout;
  protected strategy?: CacheStrategy<T>;

  constructor(config: CacheConfig = {}) {
    super();
    this.config = {
      maxSize: config.maxSize ?? 100 * 1024 * 1024, // 100MB
      maxItems: config.maxItems ?? 10000,
      ttl: config.ttl ?? 3600000, // 1 hour
      strategy: config.strategy ?? 'lru',
      autoCleanup: config.autoCleanup ?? true,
      cleanupInterval: config.cleanupInterval ?? 60000, // 1 minute
      serializeValues: config.serializeValues ?? false,
    };

    if (this.config.autoCleanup) {
      this.startCleanup();
    }
  }

  abstract get(key: string): T | undefined;
  abstract set(key: string, value: T, ttl?: number): void;
  abstract has(key: string): boolean;
  abstract delete(key: string): boolean;
  abstract clear(): void;
  abstract keys(): string[];
  abstract values(): T[];
  abstract entries(): Array<[string, T]>;
  abstract size(): number;

  mget(keys: string[]): Map<string, T | undefined> {
    const results = new Map<string, T | undefined>();
    for (const key of keys) {
      results.set(key, this.get(key));
    }
    return results;
  }

  mset(entries: Array<[string, T]>, ttl?: number): void {
    for (const [key, value] of entries) {
      this.set(key, value, ttl);
    }
  }

  mdelete(keys: string[]): number {
    let deleted = 0;
    for (const key of keys) {
      if (this.delete(key)) {
        deleted++;
      }
    }
    return deleted;
  }

  async getOrSet(key: string, factory: () => T | Promise<T>, ttl?: number): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await factory();
    this.set(key, value, ttl);
    return value;
  }

  wrap<R>(
    fn: (...args: unknown[]) => R | Promise<R>,
    keyGenerator: (...args: unknown[]) => string,
    ttl?: number
  ): (...args: unknown[]) => Promise<R> {
    return async (...args: unknown[]): Promise<R> => {
      const key = keyGenerator(...args);
      const cached = this.get(key);

      if (cached !== undefined) {
        return cached as R;
      }

      const result = await fn(...args);
      this.set(key, result as T, ttl);
      return result;
    };
  }

  touch(key: string): boolean {
    const value = this.get(key);
    if (value !== undefined) {
      this.set(key, value);
      return true;
    }
    return false;
  }

  ttl(_key: string): number | undefined {
    return undefined;
  }

  expire(key: string, ttl: number): boolean {
    const value = this.get(key);
    if (value !== undefined) {
      this.set(key, value, ttl);
      return true;
    }
    return false;
  }

  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
    this.stats.itemCount = this.size();
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      hitRate: 0,
      size: this.stats.size,
      itemCount: this.stats.itemCount,
    };
  }

  protected startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  protected stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  protected abstract cleanup(): void;

  protected calculateSize(value: T): number {
    if (typeof value === 'string') {
      return value.length * 2;
    } else if (typeof value === 'number') {
      return 8;
    } else if (typeof value === 'boolean') {
      return 4;
    } else if (value === null || value === undefined) {
      return 0;
    } else if (this.config.serializeValues) {
      return JSON.stringify(value).length * 2;
    } else {
      return 100;
    }
  }

  destroy(): void {
    this.stopCleanup();
    this.clear();
    this.removeAllListeners();
  }
}

export class MemoryCacheManager<T = unknown> extends CacheManager<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private keysByAccess: string[] = [];
  private keysByFrequency: Map<string, number> = new Map();

  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.emit('miss', key);
      return undefined;
    }

    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.delete(key);
      this.stats.misses++;
      this.emit('miss', key);
      return undefined;
    }

    entry.lastAccessed = Date.now();
    entry.accessCount++;

    this.updateAccessOrder(key);
    this.keysByFrequency.set(key, entry.accessCount);

    this.stats.hits++;
    this.emit('hit', key);

    return entry.value;
  }

  set(key: string, value: T, ttl?: number): void {
    const size = this.calculateSize(value);
    const now = Date.now();

    const existing = this.cache.get(key);
    if (existing) {
      this.stats.size -= existing.size;
    }

    while (
      (this.cache.size >= this.config.maxItems || this.stats.size + size > this.config.maxSize) &&
      this.cache.size > 0
    ) {
      this.evictOne();
    }

    const entry: CacheEntry<T> = {
      key,
      value,
      size,
      createdAt: existing?.createdAt ?? now,
      lastAccessed: now,
      accessCount: existing?.accessCount ?? 0,
      expiresAt: ttl ? now + ttl : this.config.ttl ? now + this.config.ttl : undefined,
    };

    this.cache.set(key, entry);
    this.stats.size += size;
    this.stats.sets++;

    this.updateAccessOrder(key);
    this.keysByFrequency.set(key, entry.accessCount);

    this.emit('set', key, value);
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.cache.delete(key);
    this.stats.size -= entry.size;
    this.stats.deletes++;

    this.removeFromAccessOrder(key);
    this.keysByFrequency.delete(key);

    this.emit('delete', key);
    return true;
  }

  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.keysByAccess = [];
    this.keysByFrequency.clear();
    this.stats.size = 0;
    this.stats.deletes += size;
    this.emit('clear');
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  values(): T[] {
    return Array.from(this.cache.values()).map((entry) => entry.value);
  }

  entries(): Array<[string, T]> {
    return Array.from(this.cache.entries()).map(([key, entry]) => [key, entry.value]);
  }

  size(): number {
    return this.cache.size;
  }

  override ttl(key: string): number | undefined {
    const entry = this.cache.get(key);
    if (!entry || !entry.expiresAt) return undefined;

    const remaining = entry.expiresAt - Date.now();
    return remaining > 0 ? remaining : undefined;
  }

  protected cleanup(): void {
    const now = Date.now();
    let evicted = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.delete(key);
        evicted++;
      }
    }

    if (evicted > 0) {
      this.emit('cleanup', evicted);
    }
  }

  private evictOne(): void {
    let keyToEvict: string | undefined;

    switch (this.config.strategy) {
      case 'lru': {
        keyToEvict = this.keysByAccess[0];
        break;
      }

      case 'lfu': {
        let minFreq = Infinity;
        for (const [key, freq] of this.keysByFrequency.entries()) {
          if (freq < minFreq) {
            minFreq = freq;
            keyToEvict = key;
          }
        }
        break;
      }

      case 'fifo': {
        let oldest: CacheEntry<T> | undefined;
        for (const entry of this.cache.values()) {
          if (!oldest || entry.createdAt < oldest.createdAt) {
            oldest = entry;
          }
        }
        keyToEvict = oldest?.key;
        break;
      }

      case 'ttl': {
        let soonestExpiry: CacheEntry<T> | undefined;
        for (const entry of this.cache.values()) {
          if (
            entry.expiresAt &&
            (!soonestExpiry || entry.expiresAt < (soonestExpiry.expiresAt || 0))
          ) {
            soonestExpiry = entry;
          }
        }
        keyToEvict = soonestExpiry?.key || this.keysByAccess[0];
        break;
      }
    }

    if (keyToEvict) {
      this.delete(keyToEvict);
      this.stats.evictions++;
      this.emit('evict', keyToEvict);
    }
  }

  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.keysByAccess.push(key);
  }

  private removeFromAccessOrder(key: string): void {
    const index = this.keysByAccess.indexOf(key);
    if (index !== -1) {
      this.keysByAccess.splice(index, 1);
    }
  }
}
