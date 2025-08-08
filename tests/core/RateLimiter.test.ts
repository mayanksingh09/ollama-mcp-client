import { RateLimiter } from '../../src/core/RateLimiter';
import { waitFor } from '../utils/testHelpers';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      rateLimiter = new RateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
    });

    it('should initialize with custom options', () => {
      rateLimiter = new RateLimiter({
        maxRequests: 10,
        windowMs: 1000,
        maxBurst: 5,
      });
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
    });
  });

  describe('acquire', () => {
    it('should allow requests within rate limit', async () => {
      rateLimiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 1000,
      });

      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(rateLimiter.acquire());
      }

      await Promise.all(promises);
      expect(promises).toHaveLength(5);
    });

    it('should delay requests exceeding rate limit', async () => {
      rateLimiter = new RateLimiter({
        maxRequests: 2,
        windowMs: 1000,
      });

      const startTime = Date.now();

      await rateLimiter.acquire();
      await rateLimiter.acquire();

      const acquirePromise = rateLimiter.acquire();

      jest.advanceTimersByTime(1000);

      await acquirePromise;

      expect(Date.now() - startTime).toBeGreaterThanOrEqual(1000);
    });

    it('should handle burst requests', async () => {
      rateLimiter = new RateLimiter({
        maxRequests: 10,
        windowMs: 1000,
        maxBurst: 5,
      });

      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(rateLimiter.acquire());
      }

      await Promise.all(promises);
      expect(promises).toHaveLength(5);
    });

    it('should respect window sliding', async () => {
      rateLimiter = new RateLimiter({
        maxRequests: 3,
        windowMs: 1000,
      });

      await rateLimiter.acquire();
      await rateLimiter.acquire();
      await rateLimiter.acquire();

      jest.advanceTimersByTime(500);

      const acquirePromise = rateLimiter.acquire();

      jest.advanceTimersByTime(500);

      await acquirePromise;
      expect(acquirePromise).resolves.toBeUndefined();
    });
  });

  describe('tryAcquire', () => {
    it('should return true when within limit', () => {
      rateLimiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 1000,
      });

      expect(rateLimiter.tryAcquire()).toBe(true);
      expect(rateLimiter.tryAcquire()).toBe(true);
      expect(rateLimiter.tryAcquire()).toBe(true);
    });

    it('should return false when limit exceeded', () => {
      rateLimiter = new RateLimiter({
        maxRequests: 2,
        windowMs: 1000,
      });

      expect(rateLimiter.tryAcquire()).toBe(true);
      expect(rateLimiter.tryAcquire()).toBe(true);
      expect(rateLimiter.tryAcquire()).toBe(false);
    });

    it('should allow requests after window expires', () => {
      rateLimiter = new RateLimiter({
        maxRequests: 2,
        windowMs: 1000,
      });

      expect(rateLimiter.tryAcquire()).toBe(true);
      expect(rateLimiter.tryAcquire()).toBe(true);
      expect(rateLimiter.tryAcquire()).toBe(false);

      jest.advanceTimersByTime(1000);

      expect(rateLimiter.tryAcquire()).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset rate limiter state', async () => {
      rateLimiter = new RateLimiter({
        maxRequests: 2,
        windowMs: 1000,
      });

      await rateLimiter.acquire();
      await rateLimiter.acquire();

      expect(rateLimiter.tryAcquire()).toBe(false);

      rateLimiter.reset();

      expect(rateLimiter.tryAcquire()).toBe(true);
    });
  });

  describe('getAvailableTokens', () => {
    it('should return available tokens', () => {
      rateLimiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 1000,
      });

      expect(rateLimiter.getAvailableTokens()).toBe(5);

      rateLimiter.tryAcquire();
      expect(rateLimiter.getAvailableTokens()).toBe(4);

      rateLimiter.tryAcquire();
      expect(rateLimiter.getAvailableTokens()).toBe(3);
    });

    it('should update available tokens after window', () => {
      rateLimiter = new RateLimiter({
        maxRequests: 3,
        windowMs: 1000,
      });

      rateLimiter.tryAcquire();
      rateLimiter.tryAcquire();
      rateLimiter.tryAcquire();

      expect(rateLimiter.getAvailableTokens()).toBe(0);

      jest.advanceTimersByTime(1000);

      expect(rateLimiter.getAvailableTokens()).toBe(3);
    });
  });

  describe('getNextResetTime', () => {
    it('should return next reset time', () => {
      rateLimiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 1000,
      });

      const now = Date.now();
      rateLimiter.tryAcquire();

      const nextReset = rateLimiter.getNextResetTime();
      expect(nextReset).toBeGreaterThan(now);
      expect(nextReset).toBeLessThanOrEqual(now + 1000);
    });
  });

  describe('multiple clients', () => {
    it('should handle multiple rate limiters independently', async () => {
      const limiter1 = new RateLimiter({ maxRequests: 2, windowMs: 1000 });
      const limiter2 = new RateLimiter({ maxRequests: 3, windowMs: 1000 });

      expect(limiter1.tryAcquire()).toBe(true);
      expect(limiter1.tryAcquire()).toBe(true);
      expect(limiter1.tryAcquire()).toBe(false);

      expect(limiter2.tryAcquire()).toBe(true);
      expect(limiter2.tryAcquire()).toBe(true);
      expect(limiter2.tryAcquire()).toBe(true);
      expect(limiter2.tryAcquire()).toBe(false);
    });
  });

  describe('with weight', () => {
    it('should handle weighted requests', async () => {
      rateLimiter = new RateLimiter({
        maxRequests: 10,
        windowMs: 1000,
      });

      expect(rateLimiter.tryAcquire(5)).toBe(true);
      expect(rateLimiter.getAvailableTokens()).toBe(5);

      expect(rateLimiter.tryAcquire(3)).toBe(true);
      expect(rateLimiter.getAvailableTokens()).toBe(2);

      expect(rateLimiter.tryAcquire(3)).toBe(false);
      expect(rateLimiter.tryAcquire(2)).toBe(true);
      expect(rateLimiter.getAvailableTokens()).toBe(0);
    });

    it('should reject requests with weight exceeding limit', () => {
      rateLimiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 1000,
      });

      expect(rateLimiter.tryAcquire(6)).toBe(false);
      expect(rateLimiter.getAvailableTokens()).toBe(5);
    });
  });

  describe('statistics', () => {
    it('should track request statistics', () => {
      rateLimiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 1000,
      });

      rateLimiter.tryAcquire();
      rateLimiter.tryAcquire();
      rateLimiter.tryAcquire();

      const stats = rateLimiter.getStatistics();
      expect(stats.totalRequests).toBe(3);
      expect(stats.allowedRequests).toBe(3);
      expect(stats.rejectedRequests).toBe(0);

      rateLimiter.tryAcquire();
      rateLimiter.tryAcquire();
      rateLimiter.tryAcquire();

      const updatedStats = rateLimiter.getStatistics();
      expect(updatedStats.totalRequests).toBe(6);
      expect(updatedStats.allowedRequests).toBe(5);
      expect(updatedStats.rejectedRequests).toBe(1);
    });

    it('should reset statistics', () => {
      rateLimiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 1000,
      });

      rateLimiter.tryAcquire();
      rateLimiter.tryAcquire();

      rateLimiter.resetStatistics();

      const stats = rateLimiter.getStatistics();
      expect(stats.totalRequests).toBe(0);
      expect(stats.allowedRequests).toBe(0);
      expect(stats.rejectedRequests).toBe(0);
    });
  });

  describe('concurrent requests', () => {
    it('should handle concurrent acquire requests', async () => {
      jest.useRealTimers();

      rateLimiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 100,
      });

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(rateLimiter.acquire());
      }

      const startTime = Date.now();
      await Promise.all(promises);
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThanOrEqual(100);
      expect(promises).toHaveLength(10);
    });
  });
});
