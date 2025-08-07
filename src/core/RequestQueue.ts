import PQueue from 'p-queue';
import { EventEmitter } from 'events';
import type { TokenBucketRateLimiter } from './RateLimiter';

export interface RequestQueueConfig {
  concurrency?: number;
  intervalCap?: number;
  interval?: number;
  carryoverConcurrencyCount?: boolean;
  autoStart?: boolean;
  timeout?: number;
  throwOnTimeout?: boolean;
  rateLimiter?: TokenBucketRateLimiter;
}

export interface QueuedRequest<T = unknown> {
  id: string;
  priority: number;
  fn: () => Promise<T>;
  timestamp: number;
  retryCount?: number;
  maxRetries?: number;
  metadata?: Record<string, unknown>;
}

export interface RequestQueueStats {
  size: number;
  pending: number;
  isPaused: boolean;
  totalProcessed: number;
  totalFailed: number;
  averageProcessingTime: number;
  currentConcurrency: number;
}

export class RequestQueue extends EventEmitter {
  private queue: PQueue;
  private rateLimiter?: TokenBucketRateLimiter;
  private requestMap: Map<string, QueuedRequest> = new Map();
  private stats = {
    totalProcessed: 0,
    totalFailed: 0,
    processingTimes: [] as number[],
  };
  private readonly maxProcessingTimeSamples = 100;

  constructor(config: RequestQueueConfig = {}) {
    super();

    this.queue = new PQueue({
      concurrency: config.concurrency ?? 10,
      intervalCap: config.intervalCap,
      interval: config.interval,
      carryoverConcurrencyCount: config.carryoverConcurrencyCount ?? true,
      autoStart: config.autoStart ?? true,
      timeout: config.timeout,
      throwOnTimeout: config.throwOnTimeout ?? false,
    });

    this.rateLimiter = config.rateLimiter;

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.queue.on('active', () => {
      this.emit('active', { size: this.queue.size, pending: this.queue.pending });
    });

    this.queue.on('idle', () => {
      this.emit('idle');
    });

    this.queue.on('error', (error) => {
      this.emit('error', error);
    });
  }

  async add<T>(
    fn: () => Promise<T>,
    options: {
      id?: string;
      priority?: number;
      metadata?: Record<string, unknown>;
      maxRetries?: number;
      retryDelay?: number;
    } = {}
  ): Promise<T> {
    const request: QueuedRequest<T> = {
      id: options.id || this.generateRequestId(),
      priority: options.priority ?? 0,
      fn,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: options.maxRetries ?? 3,
      metadata: options.metadata,
    };

    this.requestMap.set(request.id, request);
    this.emit('requestQueued', { id: request.id, priority: request.priority });

    const wrappedFn = async () => {
      const startTime = Date.now();

      try {
        if (this.rateLimiter) {
          const acquired = await this.rateLimiter.acquire(1, 5000);
          if (!acquired) {
            throw new Error('Rate limit exceeded');
          }
        }

        this.emit('requestStarted', { id: request.id });
        const result = await this.executeWithRetry(request, options.retryDelay);

        const processingTime = Date.now() - startTime;
        this.recordProcessingTime(processingTime);
        this.stats.totalProcessed++;

        this.emit('requestCompleted', {
          id: request.id,
          processingTime,
          result,
        });

        this.requestMap.delete(request.id);
        return result;
      } catch (error) {
        this.stats.totalFailed++;

        this.emit('requestFailed', {
          id: request.id,
          error,
          processingTime: Date.now() - startTime,
        });

        this.requestMap.delete(request.id);
        throw error;
      }
    };

    return this.queue.add(wrappedFn, { priority: request.priority }) as Promise<T>;
  }

  private async executeWithRetry<T>(request: QueuedRequest<T>, retryDelay = 1000): Promise<T> {
    let lastError: Error | undefined;

    while (request.retryCount! <= request.maxRetries!) {
      try {
        return await request.fn();
      } catch (error) {
        lastError = error as Error;
        request.retryCount!++;

        if (request.retryCount! <= request.maxRetries!) {
          this.emit('requestRetrying', {
            id: request.id,
            retryCount: request.retryCount,
            maxRetries: request.maxRetries,
            error,
          });

          await this.delay(retryDelay * request.retryCount!);
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  async addAll<T>(
    functions: Array<() => Promise<T>>,
    options?: {
      priority?: number;
      metadata?: Record<string, unknown>;
      maxRetries?: number;
    }
  ): Promise<T[]> {
    const promises = functions.map((fn) => this.add(fn, options));
    return Promise.all(promises);
  }

  async runAll<T>(
    functions: Array<() => Promise<T>>,
    options?: {
      stopOnError?: boolean;
      concurrency?: number;
    }
  ): Promise<Array<{ status: 'fulfilled' | 'rejected'; value?: T; reason?: Error }>> {
    const results: Array<{ status: 'fulfilled' | 'rejected'; value?: T; reason?: Error }> = [];

    const originalConcurrency = this.queue.concurrency;
    if (options?.concurrency) {
      this.queue.concurrency = options.concurrency;
    }

    for (const fn of functions) {
      try {
        const value = await this.add(fn);
        results.push({ status: 'fulfilled', value });
      } catch (error) {
        results.push({ status: 'rejected', reason: error as Error });

        if (options?.stopOnError) {
          break;
        }
      }
    }

    this.queue.concurrency = originalConcurrency;
    return results;
  }

  pause(): void {
    this.queue.pause();
    this.emit('paused');
  }

  start(): void {
    this.queue.start();
    this.emit('resumed');
  }

  clear(): void {
    this.queue.clear();
    this.requestMap.clear();
    this.emit('cleared');
  }

  async onEmpty(): Promise<void> {
    await this.queue.onEmpty();
  }

  async onIdle(): Promise<void> {
    await this.queue.onIdle();
  }

  async onSizeLessThan(size: number): Promise<void> {
    await this.queue.onSizeLessThan(size);
  }

  getStats(): RequestQueueStats {
    const avgProcessingTime =
      this.stats.processingTimes.length > 0
        ? this.stats.processingTimes.reduce((a, b) => a + b, 0) / this.stats.processingTimes.length
        : 0;

    return {
      size: this.queue.size,
      pending: this.queue.pending,
      isPaused: this.queue.isPaused,
      totalProcessed: this.stats.totalProcessed,
      totalFailed: this.stats.totalFailed,
      averageProcessingTime: avgProcessingTime,
      currentConcurrency: this.queue.concurrency,
    };
  }

  getRequest(id: string): QueuedRequest | undefined {
    return this.requestMap.get(id);
  }

  getPendingRequests(): QueuedRequest[] {
    return Array.from(this.requestMap.values());
  }

  updateConcurrency(concurrency: number): void {
    this.queue.concurrency = concurrency;
    this.emit('concurrencyUpdated', concurrency);
  }

  setRateLimiter(rateLimiter: TokenBucketRateLimiter | undefined): void {
    this.rateLimiter = rateLimiter;
    this.emit('rateLimiterUpdated', rateLimiter !== undefined);
  }

  private recordProcessingTime(time: number): void {
    this.stats.processingTimes.push(time);

    if (this.stats.processingTimes.length > this.maxProcessingTimeSamples) {
      this.stats.processingTimes.shift();
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  destroy(): void {
    this.clear();
    this.removeAllListeners();
  }
}

export class PriorityRequestQueue extends RequestQueue {
  private priorityQueues: Map<number, RequestQueue> = new Map();

  constructor(config: RequestQueueConfig = {}) {
    super(config);
    this.setupPriorityQueues();
  }

  private setupPriorityQueues(): void {
    const priorities = [0, 1, 2, 3, 4];

    for (const priority of priorities) {
      const queue = new RequestQueue({
        ...this.getConfig(),
        concurrency: Math.max(1, Math.floor((5 - priority) * 2)),
      });

      this.priorityQueues.set(priority, queue);

      queue.on('idle', () => {
        this.processNextPriority();
      });
    }
  }

  private getConfig(): RequestQueueConfig {
    return {
      concurrency: 10,
      autoStart: true,
    };
  }

  override async add<T>(
    fn: () => Promise<T>,
    options: {
      id?: string;
      priority?: number;
      metadata?: Record<string, unknown>;
      maxRetries?: number;
      retryDelay?: number;
    } = {}
  ): Promise<T> {
    const priority = Math.min(4, Math.max(0, options.priority ?? 2));
    const queue = this.priorityQueues.get(priority);

    if (!queue) {
      throw new Error(`Invalid priority: ${priority}`);
    }

    return queue.add(fn, options);
  }

  private async processNextPriority(): Promise<void> {
    for (const [, queue] of Array.from(this.priorityQueues.entries()).sort((a, b) => a[0] - b[0])) {
      const stats = queue.getStats();
      if (stats.size > 0 || stats.pending > 0) {
        return;
      }
    }

    this.emit('allQueuesIdle');
  }

  override getStats(): RequestQueueStats & { priorityStats: Record<number, RequestQueueStats> } {
    const baseStats = super.getStats();
    const priorityStats: Record<number, RequestQueueStats> = {};

    for (const [priority, queue] of this.priorityQueues) {
      priorityStats[priority] = queue.getStats();
    }

    return {
      ...baseStats,
      priorityStats,
    };
  }

  override destroy(): void {
    for (const queue of this.priorityQueues.values()) {
      queue.destroy();
    }

    this.priorityQueues.clear();
    super.destroy();
  }
}
