import { EventEmitter } from 'events';

export interface RateLimiterConfig {
  maxTokens: number;
  refillRate: number;
  refillInterval?: number;
  burst?: boolean;
  waitTimeout?: number;
}

export interface RateLimiterStats {
  availableTokens: number;
  totalRequests: number;
  acceptedRequests: number;
  rejectedRequests: number;
  queuedRequests: number;
  averageWaitTime: number;
}

export class TokenBucketRateLimiter extends EventEmitter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number;
  private refillInterval: number;
  private lastRefill: number;
  private refillTimer?: NodeJS.Timeout;
  private waitQueue: Array<{
    resolve: (value: boolean) => void;
    reject: (reason?: Error) => void;
    timestamp: number;
    tokensRequired: number;
  }> = [];

  private stats: RateLimiterStats = {
    availableTokens: 0,
    totalRequests: 0,
    acceptedRequests: 0,
    rejectedRequests: 0,
    queuedRequests: 0,
    averageWaitTime: 0,
  };

  private waitTimes: number[] = [];
  private readonly maxWaitTimeSamples = 100;

  constructor(config: RateLimiterConfig) {
    super();
    this.maxTokens = config.maxTokens;
    this.tokens = config.burst ? config.maxTokens : 0;
    this.refillRate = config.refillRate;
    this.refillInterval = config.refillInterval || 1000;
    this.lastRefill = Date.now();

    this.startRefillTimer();
    this.stats.availableTokens = this.tokens;
  }

  async acquire(tokensRequired = 1, timeout?: number): Promise<boolean> {
    this.stats.totalRequests++;

    this.refillTokens();

    if (this.tokens >= tokensRequired) {
      this.tokens -= tokensRequired;
      this.stats.availableTokens = this.tokens;
      this.stats.acceptedRequests++;
      this.emit('tokenAcquired', { tokensRequired, remaining: this.tokens });
      return true;
    }

    const waitTimeout = timeout ?? 5000;

    if (waitTimeout <= 0) {
      this.stats.rejectedRequests++;
      this.emit('tokenRejected', { tokensRequired, available: this.tokens });
      return false;
    }

    return this.waitForTokens(tokensRequired, waitTimeout);
  }

  tryAcquire(tokensRequired = 1): boolean {
    this.stats.totalRequests++;

    this.refillTokens();

    if (this.tokens >= tokensRequired) {
      this.tokens -= tokensRequired;
      this.stats.availableTokens = this.tokens;
      this.stats.acceptedRequests++;
      this.emit('tokenAcquired', { tokensRequired, remaining: this.tokens });
      return true;
    }

    this.stats.rejectedRequests++;
    this.emit('tokenRejected', { tokensRequired, available: this.tokens });
    return false;
  }

  private async waitForTokens(tokensRequired: number, timeout: number): Promise<boolean> {
    const startTime = Date.now();

    return new Promise<boolean>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        const index = this.waitQueue.findIndex((item) => item.resolve === resolve);
        if (index !== -1) {
          this.waitQueue.splice(index, 1);
          this.stats.queuedRequests = this.waitQueue.length;
          this.stats.rejectedRequests++;
          this.emit('tokenTimeout', { tokensRequired, waitTime: Date.now() - startTime });
          resolve(false);
        }
      }, timeout);

      const queueItem = {
        resolve: (value: boolean) => {
          clearTimeout(timeoutHandle);
          const waitTime = Date.now() - startTime;
          this.recordWaitTime(waitTime);
          resolve(value);
        },
        reject,
        timestamp: startTime,
        tokensRequired,
      };

      this.waitQueue.push(queueItem);
      this.stats.queuedRequests = this.waitQueue.length;
      this.emit('tokenQueued', { tokensRequired, queueLength: this.waitQueue.length });

      this.processWaitQueue();
    });
  }

  private refillTokens(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = Math.floor((timePassed / this.refillInterval) * this.refillRate);

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
      this.stats.availableTokens = this.tokens;
      this.emit('tokensRefilled', { added: tokensToAdd, total: this.tokens });

      this.processWaitQueue();
    }
  }

  private processWaitQueue(): void {
    while (this.waitQueue.length > 0) {
      const item = this.waitQueue[0];

      if (this.tokens >= item.tokensRequired) {
        this.tokens -= item.tokensRequired;
        this.stats.availableTokens = this.tokens;
        this.stats.acceptedRequests++;
        this.waitQueue.shift();
        this.stats.queuedRequests = this.waitQueue.length;

        item.resolve(true);
        this.emit('tokenAcquired', {
          tokensRequired: item.tokensRequired,
          remaining: this.tokens,
          waitTime: Date.now() - item.timestamp,
        });
      } else {
        break;
      }
    }
  }

  private startRefillTimer(): void {
    this.refillTimer = setInterval(() => {
      this.refillTokens();
    }, this.refillInterval);
  }

  private recordWaitTime(waitTime: number): void {
    this.waitTimes.push(waitTime);

    if (this.waitTimes.length > this.maxWaitTimeSamples) {
      this.waitTimes.shift();
    }

    if (this.waitTimes.length > 0) {
      const sum = this.waitTimes.reduce((a, b) => a + b, 0);
      this.stats.averageWaitTime = sum / this.waitTimes.length;
    }
  }

  getStats(): RateLimiterStats {
    return { ...this.stats };
  }

  getAvailableTokens(): number {
    this.refillTokens();
    return this.tokens;
  }

  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    this.waitQueue.forEach((item) => item.resolve(false));
    this.waitQueue = [];

    this.stats = {
      availableTokens: this.tokens,
      totalRequests: 0,
      acceptedRequests: 0,
      rejectedRequests: 0,
      queuedRequests: 0,
      averageWaitTime: 0,
    };

    this.waitTimes = [];
    this.emit('rateLimiterReset');
  }

  updateConfig(config: Partial<RateLimiterConfig>): void {
    if (config.maxTokens !== undefined) {
      this.maxTokens = config.maxTokens;
      this.tokens = Math.min(this.tokens, this.maxTokens);
    }

    if (config.refillRate !== undefined) {
      this.refillRate = config.refillRate;
    }

    if (config.refillInterval !== undefined) {
      this.refillInterval = config.refillInterval;
      if (this.refillTimer) {
        clearInterval(this.refillTimer);
        this.startRefillTimer();
      }
    }

    this.emit('configUpdated', config);
  }

  destroy(): void {
    if (this.refillTimer) {
      clearInterval(this.refillTimer);
      this.refillTimer = undefined;
    }

    this.waitQueue.forEach((item) => item.reject(new Error('RateLimiter destroyed')));
    this.waitQueue = [];

    this.removeAllListeners();
  }
}

export class CompoundRateLimiter extends EventEmitter {
  private limiters: Map<string, TokenBucketRateLimiter> = new Map();

  addLimiter(name: string, config: RateLimiterConfig): void {
    if (this.limiters.has(name)) {
      throw new Error(`Limiter ${name} already exists`);
    }

    const limiter = new TokenBucketRateLimiter(config);
    this.limiters.set(name, limiter);

    limiter.on('tokenAcquired', (data) => {
      this.emit('tokenAcquired', { limiter: name, ...data });
    });

    limiter.on('tokenRejected', (data) => {
      this.emit('tokenRejected', { limiter: name, ...data });
    });
  }

  async acquire(tokensRequired = 1, timeout?: number): Promise<boolean> {
    const promises = Array.from(this.limiters.entries()).map(([name, limiter]) =>
      limiter.acquire(tokensRequired, timeout).then((result) => ({ name, result }))
    );

    const results = await Promise.all(promises);

    const allAcquired = results.every((r) => r.result);

    if (!allAcquired) {
      for (const { name, result } of results) {
        if (result) {
          const limiter = this.limiters.get(name);
          if (!limiter) continue;
          limiter.reset();
        }
      }
    }

    return allAcquired;
  }

  tryAcquire(tokensRequired = 1): boolean {
    for (const [, limiter] of this.limiters) {
      if (!limiter.tryAcquire(tokensRequired)) {
        return false;
      }
    }
    return true;
  }

  getStats(): Record<string, RateLimiterStats> {
    const stats: Record<string, RateLimiterStats> = {};

    for (const [name, limiter] of this.limiters) {
      stats[name] = limiter.getStats();
    }

    return stats;
  }

  destroy(): void {
    for (const limiter of this.limiters.values()) {
      limiter.destroy();
    }

    this.limiters.clear();
    this.removeAllListeners();
  }
}

export class RateLimiter {
  private limiter: TokenBucketRateLimiter;

  constructor(config?: { maxRequests?: number; windowMs?: number; maxBurst?: number }) {
    const rateLimiterConfig: RateLimiterConfig = {
      maxTokens: config?.maxRequests ?? 100,
      refillRate: config?.maxRequests ?? 100,
      refillInterval: config?.windowMs ?? 60000,
      burst: config?.maxBurst !== undefined,
      waitTimeout: 5000,
    };

    this.limiter = new TokenBucketRateLimiter(rateLimiterConfig);
  }

  async acquire(weight = 1): Promise<void> {
    await this.limiter.acquire(weight);
  }

  tryAcquire(weight = 1): boolean {
    return this.limiter.tryAcquire(weight);
  }

  reset(): void {
    this.limiter.reset();
  }

  getAvailableTokens(): number {
    return this.limiter.getAvailableTokens();
  }

  getNextResetTime(): number {
    // Access private property for compatibility
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return Date.now() + (this.limiter as any).refillInterval;
  }

  getStatistics(): {
    totalRequests: number;
    allowedRequests: number;
    rejectedRequests: number;
  } {
    const stats = this.limiter.getStats();
    return {
      totalRequests: stats.totalRequests,
      allowedRequests: stats.acceptedRequests,
      rejectedRequests: stats.rejectedRequests,
    };
  }

  resetStatistics(): void {
    this.limiter.reset();
  }
}
