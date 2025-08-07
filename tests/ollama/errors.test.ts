import {
  OllamaError,
  OllamaConnectionError,
  OllamaAPIError,
  OllamaTimeoutError,
  OllamaModelNotFoundError,
  OllamaStreamError,
  OllamaValidationError,
  RetryStrategy,
  CircuitBreaker,
} from '../../src/ollama/errors';

describe('OllamaError classes', () => {
  describe('OllamaError', () => {
    it('should create error with message and code', () => {
      const error = new OllamaError('Test error', 'TEST_CODE', 500);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.status).toBe(500);
      expect(error.name).toBe('OllamaError');
    });
  });

  describe('OllamaConnectionError', () => {
    it('should create connection error with cause', () => {
      const cause = new Error('Network error');
      const error = new OllamaConnectionError('Connection failed', cause);
      expect(error.message).toBe('Connection failed');
      expect(error.code).toBe('CONNECTION_ERROR');
      expect(error.cause).toBe(cause);
      expect(error.name).toBe('OllamaConnectionError');
    });
  });

  describe('OllamaAPIError', () => {
    it('should create API error with status code', () => {
      const error = new OllamaAPIError('API failed', 404, { error: 'Not found' });
      expect(error.message).toBe('API failed');
      expect(error.statusCode).toBe(404);
      expect(error.responseBody).toEqual({ error: 'Not found' });
      expect(error.name).toBe('OllamaAPIError');
    });
  });

  describe('OllamaTimeoutError', () => {
    it('should create timeout error', () => {
      const error = new OllamaTimeoutError('Request timed out', 5000);
      expect(error.message).toBe('Request timed out');
      expect(error.timeout).toBe(5000);
      expect(error.code).toBe('TIMEOUT_ERROR');
      expect(error.name).toBe('OllamaTimeoutError');
    });
  });

  describe('OllamaModelNotFoundError', () => {
    it('should create model not found error', () => {
      const error = new OllamaModelNotFoundError('llama3.2');
      expect(error.message).toBe("Model 'llama3.2' not found");
      expect(error.model).toBe('llama3.2');
      expect(error.status).toBe(404);
      expect(error.name).toBe('OllamaModelNotFoundError');
    });
  });

  describe('OllamaStreamError', () => {
    it('should create stream error with chunk', () => {
      const error = new OllamaStreamError('Stream parse error', 'invalid json');
      expect(error.message).toBe('Stream parse error');
      expect(error.chunk).toBe('invalid json');
      expect(error.code).toBe('STREAM_ERROR');
      expect(error.name).toBe('OllamaStreamError');
    });
  });

  describe('OllamaValidationError', () => {
    it('should create validation error with field', () => {
      const error = new OllamaValidationError('Invalid port', 'port');
      expect(error.message).toBe('Invalid port');
      expect(error.field).toBe('port');
      expect(error.status).toBe(400);
      expect(error.name).toBe('OllamaValidationError');
    });
  });
});

describe('RetryStrategy', () => {
  let strategy: RetryStrategy;

  beforeEach(() => {
    strategy = new RetryStrategy({
      maxAttempts: 3,
      initialDelay: 100,
      maxDelay: 1000,
      backoffMultiplier: 2,
      jitter: false,
    });
  });

  describe('shouldRetry', () => {
    it('should retry on connection errors', () => {
      const error = new OllamaConnectionError('Connection failed');
      expect(strategy.shouldRetry(error)).toBe(true);
    });

    it('should retry on timeout errors', () => {
      const error = new OllamaTimeoutError('Timeout', 5000);
      expect(strategy.shouldRetry(error)).toBe(true);
    });

    it('should retry on 5xx API errors', () => {
      const error = new OllamaAPIError('Server error', 500);
      expect(strategy.shouldRetry(error)).toBe(true);
    });

    it('should retry on 429 rate limit errors', () => {
      const error = new OllamaAPIError('Rate limited', 429);
      expect(strategy.shouldRetry(error)).toBe(true);
    });

    it('should not retry on 4xx errors except 429', () => {
      const error = new OllamaAPIError('Bad request', 400);
      expect(strategy.shouldRetry(error)).toBe(false);
    });

    it('should not retry on validation errors', () => {
      const error = new OllamaValidationError('Invalid input');
      expect(strategy.shouldRetry(error)).toBe(false);
    });

    it('should not retry after max attempts', () => {
      const error = new OllamaConnectionError('Connection failed');

      expect(strategy.shouldRetry(error)).toBe(true);
      strategy.getNextDelay();

      expect(strategy.shouldRetry(error)).toBe(true);
      strategy.getNextDelay();

      expect(strategy.shouldRetry(error)).toBe(true);
      strategy.getNextDelay();

      expect(strategy.shouldRetry(error)).toBe(false);
    });
  });

  describe('getNextDelay', () => {
    it('should calculate exponential backoff', () => {
      expect(strategy.getNextDelay()).toBe(100);
      expect(strategy.getNextDelay()).toBe(200);
      expect(strategy.getNextDelay()).toBe(400);
    });

    it('should respect max delay', () => {
      strategy = new RetryStrategy({
        maxAttempts: 10,
        initialDelay: 100,
        maxDelay: 500,
        backoffMultiplier: 2,
        jitter: false,
      });

      expect(strategy.getNextDelay()).toBe(100);
      expect(strategy.getNextDelay()).toBe(200);
      expect(strategy.getNextDelay()).toBe(400);
      expect(strategy.getNextDelay()).toBe(500);
      expect(strategy.getNextDelay()).toBe(500);
    });

    it('should apply jitter when enabled', () => {
      strategy = new RetryStrategy({
        maxAttempts: 3,
        initialDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 2,
        jitter: true,
      });

      const delay = strategy.getNextDelay();
      expect(delay).toBeGreaterThanOrEqual(50);
      expect(delay).toBeLessThanOrEqual(100);
    });
  });

  describe('executeWithRetry', () => {
    it('should execute successfully on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const result = await strategy.executeWithRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new OllamaConnectionError('Failed'))
        .mockRejectedValueOnce(new OllamaConnectionError('Failed'))
        .mockResolvedValue('success');

      const onRetry = jest.fn();
      const result = await strategy.executeWithRetry(operation, onRetry);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
      expect(onRetry).toHaveBeenCalledTimes(2);
    });

    it('should throw on non-retryable errors', async () => {
      const error = new OllamaValidationError('Invalid input');
      const operation = jest.fn().mockRejectedValue(error);

      await expect(strategy.executeWithRetry(operation)).rejects.toThrow(error);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should throw after max attempts', async () => {
      const error = new OllamaConnectionError('Failed');
      const operation = jest.fn().mockRejectedValue(error);

      await expect(strategy.executeWithRetry(operation)).rejects.toThrow(error);
      expect(operation).toHaveBeenCalledTimes(4);
    });
  });

  describe('reset', () => {
    it('should reset attempt counter', () => {
      const error = new OllamaConnectionError('Failed');

      strategy.shouldRetry(error);
      strategy.getNextDelay();
      strategy.shouldRetry(error);
      strategy.getNextDelay();

      strategy.reset();

      expect(strategy.shouldRetry(error)).toBe(true);
      expect(strategy.getNextDelay()).toBe(100);
    });
  });
});

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker(3, 1000);
  });

  describe('execute', () => {
    it('should execute operation when closed', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const result = await breaker.execute(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should open after failure threshold', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Failed'));

      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(operation);
        } catch {}
      }

      expect(breaker.getState()).toBe('OPEN');

      await expect(breaker.execute(operation)).rejects.toThrow('Circuit breaker is OPEN');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should transition to half-open after timeout', async () => {
      jest.useFakeTimers();

      const failingOp = jest.fn().mockRejectedValue(new Error('Failed'));
      const successOp = jest.fn().mockResolvedValue('success');

      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingOp);
        } catch {}
      }

      expect(breaker.getState()).toBe('OPEN');

      jest.advanceTimersByTime(1001);

      const result = await breaker.execute(successOp);
      expect(result).toBe('success');
      expect(breaker.getState()).toBe('CLOSED');

      jest.useRealTimers();
    });

    it('should close on successful half-open request', async () => {
      jest.useFakeTimers();

      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockRejectedValueOnce(new Error('Failed'))
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValue('success');

      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(operation);
        } catch {}
      }

      jest.advanceTimersByTime(1001);

      await breaker.execute(operation);
      expect(breaker.getState()).toBe('CLOSED');

      jest.useRealTimers();
    });
  });

  describe('reset', () => {
    it('should reset to closed state', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Failed'));

      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(operation);
        } catch {}
      }

      expect(breaker.getState()).toBe('OPEN');

      breaker.reset();

      expect(breaker.getState()).toBe('CLOSED');
    });
  });
});
