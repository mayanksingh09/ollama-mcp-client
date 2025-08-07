import type { AxiosInstance, AxiosError } from 'axios';
import axios from 'axios';
import type { Readable } from 'stream';
import type {
  OllamaConfig,
  ChatCompletionRequest,
  ChatCompletionResponse,
  GenerateRequest,
  GenerateResponse,
  ListModelsResponse,
  ShowModelRequest,
  ShowModelResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  StreamHandlers,
} from './types';
import type { RetryOptions } from './errors';
import {
  OllamaError,
  OllamaConnectionError,
  OllamaAPIError,
  OllamaTimeoutError,
  OllamaModelNotFoundError,
  RetryStrategy,
  CircuitBreaker,
} from './errors';
import { StreamProcessor } from './streaming';
import { ConfigManager } from './config';

export class OllamaClient {
  private axios: AxiosInstance;
  private configManager: ConfigManager;
  private retryStrategy: RetryStrategy;
  private circuitBreaker: CircuitBreaker;
  private streamProcessor: StreamProcessor;

  constructor(config?: OllamaConfig) {
    this.configManager = ConfigManager.getInstance();

    if (config) {
      this.configManager.updateConfig(config);
    }
    this.axios = this.createAxiosInstance();
    this.retryStrategy = this.createRetryStrategy();
    this.circuitBreaker = new CircuitBreaker(5, 60000);
    this.streamProcessor = new StreamProcessor();
  }

  private createAxiosInstance(): AxiosInstance {
    const baseURL = this.configManager.getBaseUrl();
    const timeout = this.configManager.getTimeout();
    const headers = this.configManager.getHeaders();

    const instance = axios.create({
      baseURL,
      timeout,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      validateStatus: (status) => status < 500,
    });

    instance.interceptors.request.use(
      (config) => {
        // Debug logging: [Ollama] METHOD URL
        return config;
      },
      (error) => {
        // Error logging: [Ollama] Request error
        return Promise.reject(error);
      }
    );

    instance.interceptors.response.use(
      (response) => {
        // Debug logging: [Ollama] Response STATUS from URL
        return response;
      },
      (error: AxiosError) => {
        return Promise.reject(this.handleAxiosError(error));
      }
    );

    return instance;
  }

  private createRetryStrategy(): RetryStrategy {
    const { attempts, delay } = this.configManager.getRetryOptions();

    const retryOptions: RetryOptions = {
      maxAttempts: attempts,
      initialDelay: delay,
      maxDelay: delay * 10,
      backoffMultiplier: 2,
      jitter: true,
    };

    return new RetryStrategy(retryOptions);
  }

  private handleAxiosError(error: AxiosError): OllamaError {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return new OllamaConnectionError(
        `Cannot connect to Ollama at ${this.configManager.getBaseUrl()}`,
        error
      );
    }

    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return new OllamaTimeoutError('Request timed out', this.configManager.getTimeout());
    }

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as { error?: string };

      if (status === 404 && error.config?.url?.includes('/api/chat')) {
        const model = (error.config.data as { model?: string })?.model;
        if (model) {
          return new OllamaModelNotFoundError(model);
        }
      }

      return new OllamaAPIError(data.error || `API error: ${status}`, status, data);
    }

    return new OllamaError(error.message || 'Unknown error');
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.axios.get('/api/tags');
      return response.status === 200;
    } catch {
      return false;
    }
  }

  async chat(
    request: ChatCompletionRequest,
    handlers?: StreamHandlers
  ): Promise<ChatCompletionResponse | void> {
    const operation = async () => {
      if (request.stream && handlers) {
        return this.chatStream(request, handlers);
      }

      const response = await this.axios.post<ChatCompletionResponse>('/api/chat', {
        ...request,
        stream: false,
      });

      if (response.status !== 200) {
        throw new OllamaAPIError(`Chat completion failed`, response.status, response.data);
      }

      return response.data;
    };

    return this.circuitBreaker.execute(() => this.retryStrategy.executeWithRetry(operation));
  }

  private async chatStream(
    request: ChatCompletionRequest,
    handlers: StreamHandlers
  ): Promise<void> {
    const response = await this.axios.post(
      '/api/chat',
      { ...request, stream: true },
      { responseType: 'stream' }
    );

    if (response.status !== 200) {
      throw new OllamaAPIError(`Chat stream failed`, response.status);
    }

    const stream = response.data as Readable;
    this.streamProcessor.processStream(stream, handlers);
  }

  async generate(
    request: GenerateRequest,
    handlers?: StreamHandlers
  ): Promise<GenerateResponse | void> {
    const operation = async () => {
      if (request.stream && handlers) {
        return this.generateStream(request, handlers);
      }

      const response = await this.axios.post<GenerateResponse>('/api/generate', {
        ...request,
        stream: false,
      });

      if (response.status !== 200) {
        throw new OllamaAPIError(`Generate failed`, response.status, response.data);
      }

      return response.data;
    };

    return this.circuitBreaker.execute(() => this.retryStrategy.executeWithRetry(operation));
  }

  private async generateStream(request: GenerateRequest, handlers: StreamHandlers): Promise<void> {
    const response = await this.axios.post(
      '/api/generate',
      { ...request, stream: true },
      { responseType: 'stream' }
    );

    if (response.status !== 200) {
      throw new OllamaAPIError(`Generate stream failed`, response.status);
    }

    const stream = response.data as Readable;
    this.streamProcessor.processStream(stream, handlers);
  }

  async listModels(): Promise<ListModelsResponse> {
    const operation = async () => {
      const response = await this.axios.get<ListModelsResponse>('/api/tags');

      if (response.status !== 200) {
        throw new OllamaAPIError(`List models failed`, response.status, response.data);
      }

      return response.data;
    };

    return this.circuitBreaker.execute(() => this.retryStrategy.executeWithRetry(operation));
  }

  async showModel(request: ShowModelRequest): Promise<ShowModelResponse> {
    const operation = async () => {
      const response = await this.axios.post<ShowModelResponse>('/api/show', request);

      if (response.status === 404) {
        throw new OllamaModelNotFoundError(request.model);
      }

      if (response.status !== 200) {
        throw new OllamaAPIError(`Show model failed`, response.status, response.data);
      }

      return response.data;
    };

    return this.circuitBreaker.execute(() => this.retryStrategy.executeWithRetry(operation));
  }

  async embeddings(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const operation = async () => {
      const response = await this.axios.post<EmbeddingResponse>('/api/embed', request);

      if (response.status !== 200) {
        throw new OllamaAPIError(`Embeddings failed`, response.status, response.data);
      }

      return response.data;
    };

    return this.circuitBreaker.execute(() => this.retryStrategy.executeWithRetry(operation));
  }

  async pullModel(
    model: string,
    onProgress?: (status: string, progress?: number) => void
  ): Promise<void> {
    const response = await this.axios.post(
      '/api/pull',
      { model, stream: true },
      { responseType: 'stream' }
    );

    if (response.status !== 200) {
      throw new OllamaAPIError(`Pull model failed`, response.status);
    }

    const stream = response.data as Readable;

    return new Promise((resolve, reject) => {
      this.streamProcessor.processStream(stream, {
        onChunk: (chunk) => {
          if ('status' in chunk) {
            const status = (
              chunk as unknown as { status: string; completed?: number; total?: number }
            ).status;
            const completed = (chunk as unknown as { completed?: number }).completed;
            const total = (chunk as unknown as { total?: number }).total;

            if (completed && total) {
              const progress = (completed / total) * 100;
              onProgress?.(status, progress);
            } else {
              onProgress?.(status);
            }
          }
        },
        onError: reject,
        onComplete: resolve,
      });
    });
  }

  async deleteModel(model: string): Promise<void> {
    const response = await this.axios.delete('/api/delete', {
      data: { model },
    });

    if (response.status !== 200) {
      throw new OllamaAPIError(`Delete model failed`, response.status, response.data);
    }
  }

  updateConfig(config: Partial<OllamaConfig>): void {
    this.configManager.updateConfig(config);
    this.axios = this.createAxiosInstance();
  }

  getConfig(): OllamaConfig {
    return this.configManager.getConfig();
  }

  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }
}
