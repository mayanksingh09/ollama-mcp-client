export class OllamaError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'OllamaError';
    Object.setPrototypeOf(this, OllamaError.prototype);
  }
}

export class OllamaConnectionError extends OllamaError {
  constructor(
    message: string,
    public cause?: Error
  ) {
    super(message, 'CONNECTION_ERROR');
    this.name = 'OllamaConnectionError';
    Object.setPrototypeOf(this, OllamaConnectionError.prototype);
  }
}

export class OllamaAPIError extends OllamaError {
  constructor(
    message: string,
    public statusCode: number,
    public responseBody?: unknown
  ) {
    super(message, 'API_ERROR', statusCode);
    this.name = 'OllamaAPIError';
    Object.setPrototypeOf(this, OllamaAPIError.prototype);
  }
}

export class OllamaTimeoutError extends OllamaError {
  constructor(
    message: string,
    public timeout: number
  ) {
    super(message, 'TIMEOUT_ERROR');
    this.name = 'OllamaTimeoutError';
    Object.setPrototypeOf(this, OllamaTimeoutError.prototype);
  }
}

export class OllamaModelNotFoundError extends OllamaError {
  constructor(public model: string) {
    super(`Model '${model}' not found`, 'MODEL_NOT_FOUND', 404);
    this.name = 'OllamaModelNotFoundError';
    Object.setPrototypeOf(this, OllamaModelNotFoundError.prototype);
  }
}

export class OllamaStreamError extends OllamaError {
  constructor(
    message: string,
    public chunk?: string
  ) {
    super(message, 'STREAM_ERROR');
    this.name = 'OllamaStreamError';
    Object.setPrototypeOf(this, OllamaStreamError.prototype);
  }
}

export class OllamaValidationError extends OllamaError {
  constructor(
    message: string,
    public field?: string
  ) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'OllamaValidationError';
    Object.setPrototypeOf(this, OllamaValidationError.prototype);
  }
}

export interface RetryOptions {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
}

export class RetryStrategy {
  private attempts = 0;

  constructor(private options: RetryOptions) {}

  reset(): void {
    this.attempts = 0;
  }

  shouldRetry(error: Error): boolean {
    if (this.attempts >= this.options.maxAttempts) {
      return false;
    }

    if (error instanceof OllamaConnectionError) {
      return true;
    }

    if (error instanceof OllamaAPIError) {
      return error.statusCode >= 500 || error.statusCode === 429;
    }

    if (error instanceof OllamaTimeoutError) {
      return true;
    }

    return false;
  }

  getNextDelay(): number {
    const baseDelay = Math.min(
      this.options.initialDelay * Math.pow(this.options.backoffMultiplier, this.attempts),
      this.options.maxDelay
    );

    this.attempts++;

    if (this.options.jitter) {
      return baseDelay * (0.5 + Math.random() * 0.5);
    }

    return baseDelay;
  }

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    onRetry?: (attempt: number, delay: number, error: Error) => void
  ): Promise<T> {
    this.reset();

    while (true) {
      try {
        return await operation();
      } catch (error) {
        const err = error as Error;

        if (!this.shouldRetry(err)) {
          throw err;
        }

        const delay = this.getNextDelay();

        if (onRetry) {
          onRetry(this.attempts, delay, err);
        }

        await new Promise((resolve) => globalThis.setTimeout(resolve, delay));
      }
    }
  }
}

export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private failureThreshold: number,
    private resetTimeout: number
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new OllamaConnectionError('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();

      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failures = 0;
      }

      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  reset(): void {
    this.failures = 0;
    this.state = 'CLOSED';
    this.lastFailureTime = 0;
  }

  getState(): string {
    return this.state;
  }
}
