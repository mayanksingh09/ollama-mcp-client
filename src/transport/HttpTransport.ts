/**
 * HTTP/SSE transport implementation for remote MCP servers
 */

import type { AxiosInstance, AxiosError } from 'axios';
import axios from 'axios';
import { EventSource } from 'eventsource';
import { Transport } from './Transport';
import type { HttpTransportOptions, SSETransportOptions } from '../types/transport.types';
import { TransportState } from '../types/transport.types';

export class HttpTransport extends Transport {
  private axios: AxiosInstance;
  private eventSource?: EventSource;
  private readonly httpOptions: HttpTransportOptions | SSETransportOptions;
  private reconnectAttempts: number = 0;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(options: HttpTransportOptions | SSETransportOptions) {
    super(options);
    this.httpOptions = options;

    // Initialize axios instance
    this.axios = axios.create({
      baseURL: options.url,
      timeout: options.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    // Add auth token if provided
    if ('authToken' in options && options.authToken) {
      this.axios.defaults.headers.common['Authorization'] = `Bearer ${options.authToken}`;
    }

    // Setup axios interceptors
    this.setupAxiosInterceptors();
  }

  private setupAxiosInterceptors(): void {
    // Request interceptor
    this.axios.interceptors.request.use(
      (config) => {
        this.logger.debug('HTTP request', {
          method: config.method,
          url: config.url,
        });
        return config;
      },
      (error) => {
        this.logger.error('HTTP request error', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.axios.interceptors.response.use(
      (response) => {
        this.logger.debug('HTTP response', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error: AxiosError) => {
        this.logger.error('HTTP response error', {
          status: error.response?.status,
          message: error.message,
        });
        return Promise.reject(this.transformAxiosError(error));
      }
    );
  }

  private transformAxiosError(error: AxiosError): Error {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return new Error(`Cannot connect to server at ${this.httpOptions.url}: ${error.message}`);
    }

    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return new Error(`Request timeout: ${error.message}`);
    }

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as { error?: string };
      return new Error(`HTTP ${status}: ${data.error || error.message}`);
    }

    return new Error(error.message || 'Unknown HTTP error');
  }

  async connect(): Promise<void> {
    if (this.isConnected()) {
      this.logger.warn('Transport already connected');
      return;
    }

    this.setState(TransportState.CONNECTING);

    try {
      if (this.httpOptions.type === 'sse') {
        await this.connectSSE();
      } else {
        await this.connectHTTP();
      }

      this.setState(TransportState.CONNECTED);
      this.logger.info('HTTP transport connected', { url: this.httpOptions.url });
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  private async connectHTTP(): Promise<void> {
    // Test connection with a health check or initialization request
    try {
      const response = await this.axios.post('/rpc', {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'ollama-mcp-client',
            version: '1.0.0',
          },
        },
        id: 1,
      });

      if (response.status !== 200) {
        throw new Error(`Server returned status ${response.status}`);
      }

      this.logger.debug('HTTP connection established', response.data);
    } catch (error) {
      throw new Error(`Failed to connect to HTTP server: ${(error as Error).message}`);
    }
  }

  private async connectSSE(): Promise<void> {
    return new Promise((resolve, reject) => {
      const sseOptions = this.httpOptions as SSETransportOptions;

      this.eventSource = new EventSource(this.httpOptions.url, {
        headers: sseOptions.headers,
        withCredentials: false,
      });

      this.eventSource.onopen = (): void => {
        this.logger.debug('SSE connection opened');
        this.reconnectAttempts = 0;
        resolve();
      };

      this.eventSource.onmessage = (event): void => {
        this.logger.debug('SSE message received', { data: event.data });
        this.handleData(event.data);
      };

      this.eventSource.onerror = (error): void => {
        this.logger.error('SSE error', error);

        if (this.eventSource?.readyState === EventSource.CLOSED) {
          this.handleReconnection();
        } else {
          reject(new Error(`SSE connection failed: ${error}`));
        }
      };

      // Set a timeout for initial connection
      setTimeout(() => {
        if (this.eventSource?.readyState !== EventSource.OPEN) {
          this.eventSource?.close();
          reject(new Error('SSE connection timeout'));
        }
      }, this.httpOptions.timeout || 30000);
    });
  }

  private handleReconnection(): void {
    const sseOptions = this.httpOptions as SSETransportOptions;
    const maxAttempts = sseOptions.maxReconnectAttempts || 5;
    const reconnectDelay = sseOptions.reconnectDelay || 5000;

    if (this.reconnectAttempts >= maxAttempts) {
      this.logger.error('Maximum reconnection attempts reached');
      this.setState(TransportState.ERROR);
      this.handleError(new Error('Connection lost: maximum reconnection attempts exceeded'));
      return;
    }

    this.reconnectAttempts++;
    this.setState(TransportState.CONNECTING);

    this.logger.info(`Attempting reconnection (${this.reconnectAttempts}/${maxAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        this.logger.error('Reconnection failed', error);
        this.handleReconnection();
      });
    }, reconnectDelay * this.reconnectAttempts);
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected() && this.state !== TransportState.CONNECTING) {
      this.logger.warn('Transport not connected');
      return;
    }

    this.setState(TransportState.DISCONNECTING);

    try {
      // Clear reconnection timer
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
      }

      // Close SSE connection if active
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = undefined;
      }

      // Send shutdown request for HTTP connections
      if (this.httpOptions.type === 'http') {
        try {
          await this.axios.post('/rpc', {
            jsonrpc: '2.0',
            method: 'shutdown',
            id: 'shutdown',
          });
        } catch (error) {
          this.logger.debug('Shutdown request failed', error);
        }
      }

      this.setState(TransportState.DISCONNECTED);
      this.logger.info('HTTP transport disconnected');
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  async send(data: string | Buffer): Promise<void> {
    await this.ensureConnected();

    const message = typeof data === 'string' ? data : data.toString();

    try {
      let jsonMessage;
      try {
        jsonMessage = JSON.parse(message);
      } catch {
        throw new Error('Invalid JSON message');
      }

      if (this.httpOptions.type === 'http') {
        // Send via HTTP POST
        const response = await this.axios.post('/rpc', jsonMessage);

        // Handle response
        if (response.data) {
          this.handleData(JSON.stringify(response.data));
        }
      } else {
        // For SSE, we need a separate HTTP endpoint for sending messages
        // This assumes the server provides a companion HTTP endpoint
        const baseUrl = this.httpOptions.url.replace(/\/events$/, '');
        const response = await this.axios.post(`${baseUrl}/rpc`, jsonMessage);

        if (response.data) {
          this.handleData(JSON.stringify(response.data));
        }
      }

      this.logger.debug('Data sent', { size: message.length });
    } catch (error) {
      this.logger.error('Failed to send data', error);
      throw error;
    }
  }

  getType(): string {
    return this.httpOptions.type;
  }

  /**
   * Get connection information
   */
  getConnectionInfo(): {
    url: string;
    connected: boolean;
    reconnectAttempts: number;
    type: string;
  } {
    return {
      url: this.httpOptions.url,
      connected: this.isConnected(),
      reconnectAttempts: this.reconnectAttempts,
      type: this.httpOptions.type,
    };
  }
}
