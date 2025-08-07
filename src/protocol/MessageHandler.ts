/**
 * MCP Protocol message handler
 */

import { EventEmitter } from 'events';
import type {
  MCPMessage,
  MCPRequest,
  MCPResponse,
  MCPNotification,
  MCPError,
} from '../types/mcp.types';
import type { Logger } from 'winston';
import winston from 'winston';

export interface MessageHandlerOptions {
  debug?: boolean;
  requestTimeout?: number;
}

export class MessageHandler extends EventEmitter {
  private pendingRequests: Map<
    string | number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
      method: string;
    }
  > = new Map();

  private logger: Logger;
  private requestIdCounter: number = 1;
  private options: MessageHandlerOptions;

  constructor(options: MessageHandlerOptions = {}) {
    super();
    this.options = {
      debug: false,
      requestTimeout: 30000,
      ...options,
    };

    this.logger = winston.createLogger({
      level: this.options.debug ? 'debug' : 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'MessageHandler' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
        }),
      ],
    });
  }

  /**
   * Process incoming message
   */
  processMessage(data: string | Buffer): void {
    try {
      const message = this.parseMessage(data);

      if (!message) {
        return;
      }

      if ('method' in message && !('id' in message)) {
        // Notification
        this.handleNotification(message as MCPNotification);
      } else if ('id' in message) {
        if ('method' in message) {
          // Request
          this.handleRequest(message as MCPRequest);
        } else {
          // Response
          this.handleResponse(message as MCPResponse);
        }
      } else {
        this.logger.warn('Invalid message format', { message });
      }
    } catch (error) {
      this.logger.error('Error processing message', { error, data: data.toString() });
    }
  }

  /**
   * Parse message from data
   */
  private parseMessage(data: string | Buffer): MCPMessage | null {
    const text = typeof data === 'string' ? data : data.toString();

    try {
      const message = JSON.parse(text);

      if (message.jsonrpc !== '2.0') {
        this.logger.warn('Invalid JSON-RPC version', { version: message.jsonrpc });
        return null;
      }

      return message;
    } catch (error) {
      this.logger.error('Failed to parse message', { error, text });
      return null;
    }
  }

  /**
   * Handle incoming request
   */
  private handleRequest(request: MCPRequest): void {
    this.logger.debug('Request received', {
      id: request.id,
      method: request.method,
    });

    this.emit('request', request);

    // Emit specific events for known methods
    switch (request.method) {
      case 'initialize':
        this.emit('initialize', request);
        break;
      case 'tools/list':
        this.emit('tools.list', request);
        break;
      case 'tools/call':
        this.emit('tools.call', request);
        break;
      case 'resources/list':
        this.emit('resources.list', request);
        break;
      case 'resources/read':
        this.emit('resources.read', request);
        break;
      case 'prompts/list':
        this.emit('prompts.list', request);
        break;
      case 'prompts/get':
        this.emit('prompts.get', request);
        break;
      default:
        this.logger.debug('Unknown request method', { method: request.method });
    }
  }

  /**
   * Handle incoming response
   */
  private handleResponse(response: MCPResponse): void {
    this.logger.debug('Response received', { id: response.id });

    const pending = this.pendingRequests.get(response.id!);
    if (!pending) {
      this.logger.warn('Unexpected response', { id: response.id });
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(response.id!);

    if (response.error) {
      const error = new Error(response.error.message);
      const errorWithCode = error as Error & { code: number; data: unknown };
      errorWithCode.code = response.error.code;
      errorWithCode.data = response.error.data;
      pending.reject(error);
    } else {
      pending.resolve(response.result);
    }

    this.emit('response', response);
  }

  /**
   * Handle incoming notification
   */
  private handleNotification(notification: MCPNotification): void {
    this.logger.debug('Notification received', { method: notification.method });

    this.emit('notification', notification);

    // Emit specific events for known notifications
    switch (notification.method) {
      case 'notifications/resources/updated':
        this.emit('resources.updated', notification.params);
        break;
      case 'notifications/tools/updated':
        this.emit('tools.updated', notification.params);
        break;
      case 'notifications/prompts/updated':
        this.emit('prompts.updated', notification.params);
        break;
      case 'notifications/progress':
        this.emit('progress', notification.params);
        break;
      case 'notifications/message':
        this.emit('log.message', notification.params);
        break;
      default:
        this.logger.debug('Unknown notification method', { method: notification.method });
    }
  }

  /**
   * Create a request message
   */
  createRequest(method: string, params?: unknown): MCPRequest {
    const id = this.requestIdCounter++;

    return {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };
  }

  /**
   * Create a response message
   */
  createResponse(id: string | number, result?: unknown, error?: MCPError): MCPResponse {
    const response: MCPResponse = {
      jsonrpc: '2.0',
      id,
    };

    if (error) {
      response.error = error;
    } else {
      response.result = result;
    }

    return response;
  }

  /**
   * Create a notification message
   */
  createNotification(method: string, params?: unknown): MCPNotification {
    return {
      jsonrpc: '2.0',
      method,
      params,
    };
  }

  /**
   * Send request and wait for response
   */
  sendRequest(
    method: string,
    params?: unknown,
    sendFn?: (message: string) => Promise<void>
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const request = this.createRequest(method, params);

      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.id!);
        reject(new Error(`Request timeout: ${method}`));
      }, this.options.requestTimeout!);

      // Store pending request
      this.pendingRequests.set(request.id!, {
        resolve,
        reject,
        timeout,
        method,
      });

      // Send request
      const message = JSON.stringify(request);

      if (sendFn) {
        sendFn(message).catch((error) => {
          clearTimeout(timeout);
          this.pendingRequests.delete(request.id!);
          reject(error);
        });
      } else {
        // Emit for transport to handle
        this.emit('send', message);
      }

      this.logger.debug('Request sent', {
        id: request.id,
        method,
      });
    });
  }

  /**
   * Send response
   */
  sendResponse(
    _id: string | number,
    result?: unknown,
    error?: MCPError,
    sendFn?: (message: string) => Promise<void>
  ): void {
    const response = this.createResponse(_id, result, error);
    const message = JSON.stringify(response);

    if (sendFn) {
      sendFn(message).catch((err) => {
        this.logger.error('Failed to send response', { id: _id, error: err });
      });
    } else {
      this.emit('send', message);
    }

    this.logger.debug('Response sent', { id: _id });
  }

  /**
   * Send notification
   */
  sendNotification(
    method: string,
    params?: unknown,
    sendFn?: (message: string) => Promise<void>
  ): void {
    const notification = this.createNotification(method, params);
    const message = JSON.stringify(notification);

    if (sendFn) {
      sendFn(message).catch((err) => {
        this.logger.error('Failed to send notification', { method, error: err });
      });
    } else {
      this.emit('send', message);
    }

    this.logger.debug('Notification sent', { method });
  }

  /**
   * Clear all pending requests
   */
  clearPendingRequests(error?: Error): void {
    const defaultError = error || new Error('Connection closed');

    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(defaultError);
    }

    this.pendingRequests.clear();
    this.logger.debug('Pending requests cleared');
  }

  /**
   * Get pending request count
   */
  getPendingRequestCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    this.clearPendingRequests();
    this.removeAllListeners();
  }
}
