export interface CacheStrategy<T = unknown> {
  shouldEvict(entry: CacheEntry<T>): boolean;
  selectEvictionCandidate(entries: CacheEntry<T>[]): CacheEntry<T> | undefined;
  onAccess(entry: CacheEntry<T>): void;
  onSet(entry: CacheEntry<T>): void;
  onDelete(entry: CacheEntry<T>): void;
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

export class LRUStrategy<T = unknown> implements CacheStrategy<T> {
  shouldEvict(entry: CacheEntry<T>): boolean {
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      return true;
    }
    return false;
  }

  selectEvictionCandidate(entries: CacheEntry<T>[]): CacheEntry<T> | undefined {
    if (entries.length === 0) return undefined;

    return entries.reduce((oldest, entry) => {
      return entry.lastAccessed < oldest.lastAccessed ? entry : oldest;
    });
  }

  onAccess(entry: CacheEntry<T>): void {
    entry.lastAccessed = Date.now();
    entry.accessCount++;
  }

  onSet(entry: CacheEntry<T>): void {
    entry.lastAccessed = Date.now();
  }

  onDelete(_entry: CacheEntry<T>): void {}
}

export class LFUStrategy<T = unknown> implements CacheStrategy<T> {
  shouldEvict(entry: CacheEntry<T>): boolean {
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      return true;
    }
    return false;
  }

  selectEvictionCandidate(entries: CacheEntry<T>[]): CacheEntry<T> | undefined {
    if (entries.length === 0) return undefined;

    return entries.reduce((leastFrequent, entry) => {
      if (entry.accessCount < leastFrequent.accessCount) {
        return entry;
      } else if (entry.accessCount === leastFrequent.accessCount) {
        return entry.lastAccessed < leastFrequent.lastAccessed ? entry : leastFrequent;
      }
      return leastFrequent;
    });
  }

  onAccess(entry: CacheEntry<T>): void {
    entry.lastAccessed = Date.now();
    entry.accessCount++;
  }

  onSet(entry: CacheEntry<T>): void {
    entry.lastAccessed = Date.now();
    if (entry.accessCount === 0) {
      entry.accessCount = 1;
    }
  }

  onDelete(_entry: CacheEntry<T>): void {}
}

export class FIFOStrategy<T = unknown> implements CacheStrategy<T> {
  shouldEvict(entry: CacheEntry<T>): boolean {
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      return true;
    }
    return false;
  }

  selectEvictionCandidate(entries: CacheEntry<T>[]): CacheEntry<T> | undefined {
    if (entries.length === 0) return undefined;

    return entries.reduce((oldest, entry) => {
      return entry.createdAt < oldest.createdAt ? entry : oldest;
    });
  }

  onAccess(entry: CacheEntry<T>): void {
    entry.lastAccessed = Date.now();
    entry.accessCount++;
  }

  onSet(_entry: CacheEntry<T>): void {}

  onDelete(_entry: CacheEntry<T>): void {}
}

export class TTLStrategy<T = unknown> implements CacheStrategy<T> {
  shouldEvict(entry: CacheEntry<T>): boolean {
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      return true;
    }
    return false;
  }

  selectEvictionCandidate(entries: CacheEntry<T>[]): CacheEntry<T> | undefined {
    if (entries.length === 0) return undefined;

    const withExpiry = entries.filter((e) => e.expiresAt);
    if (withExpiry.length === 0) {
      return new LRUStrategy<T>().selectEvictionCandidate(entries);
    }

    return withExpiry.reduce((soonest, entry) => {
      return entry.expiresAt! < soonest.expiresAt! ? entry : soonest;
    });
  }

  onAccess(entry: CacheEntry<T>): void {
    entry.lastAccessed = Date.now();
    entry.accessCount++;
  }

  onSet(_entry: CacheEntry<T>): void {}

  onDelete(_entry: CacheEntry<T>): void {}
}

export class AdaptiveStrategy<T = unknown> implements CacheStrategy<T> {
  private lru = new LRUStrategy<T>();
  private lfu = new LFUStrategy<T>();
  private adaptiveThreshold = 0.5;
  private hitRate = 0;
  private hits = 0;
  private misses = 0;

  shouldEvict(entry: CacheEntry<T>): boolean {
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      return true;
    }
    return false;
  }

  selectEvictionCandidate(entries: CacheEntry<T>[]): CacheEntry<T> | undefined {
    this.updateHitRate();

    if (this.hitRate < this.adaptiveThreshold) {
      return this.lfu.selectEvictionCandidate(entries);
    } else {
      return this.lru.selectEvictionCandidate(entries);
    }
  }

  onAccess(entry: CacheEntry<T>): void {
    this.hits++;
    entry.lastAccessed = Date.now();
    entry.accessCount++;
  }

  onSet(entry: CacheEntry<T>): void {
    entry.lastAccessed = Date.now();
  }

  onDelete(_entry: CacheEntry<T>): void {}

  onMiss(): void {
    this.misses++;
  }

  private updateHitRate(): void {
    const total = this.hits + this.misses;
    if (total > 0) {
      this.hitRate = this.hits / total;
    }

    if (total > 10000) {
      this.hits = Math.floor(this.hits * 0.9);
      this.misses = Math.floor(this.misses * 0.9);
    }
  }

  setAdaptiveThreshold(threshold: number): void {
    this.adaptiveThreshold = Math.max(0, Math.min(1, threshold));
  }
}
