/**
 * Transport manager for creating and managing MCP transports
 */

import { StdioTransport } from './StdioTransport';
import { HttpTransport } from './HttpTransport';
import type {
  ITransport,
  StdioTransportOptions,
  HttpTransportOptions,
  SSETransportOptions,
  TransportFactory,
} from '../types/transport.types';
import type { ServerConnectionOptions } from '../types/client.types';
import type { Logger } from 'winston';
import winston from 'winston';

export class TransportManager {
  private static instance: TransportManager;
  private transports: Map<string, ITransport> = new Map();
  private logger: Logger;

  private constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'TransportManager' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
        }),
      ],
    });
  }

  /**
   * Get singleton instance
   */
  static getInstance(): TransportManager {
    if (!TransportManager.instance) {
      TransportManager.instance = new TransportManager();
    }
    return TransportManager.instance;
  }

  /**
   * Create a transport based on connection options
   */
  createTransport(options: ServerConnectionOptions, debug: boolean = false): ITransport {
    let transport: ITransport;

    switch (options.type) {
      case 'stdio':
        transport = this.createStdioTransport(options, debug);
        break;
      case 'http':
        transport = this.createHttpTransport(options, debug);
        break;
      case 'sse':
        transport = this.createSSETransport(options, debug);
        break;
      default:
        throw new Error(
          `Unsupported transport type: ${(options as unknown as { type: string }).type}`
        );
    }

    // Generate a unique ID for this transport
    const transportId = this.generateTransportId(options);
    this.transports.set(transportId, transport);

    this.logger.info('Transport created', {
      id: transportId,
      type: options.type,
    });

    return transport;
  }

  /**
   * Create stdio transport
   */
  private createStdioTransport(options: ServerConnectionOptions, debug: boolean): StdioTransport {
    if (options.type !== 'stdio') {
      throw new Error('Invalid options for stdio transport');
    }

    const transportOptions: StdioTransportOptions = {
      type: 'stdio',
      command: options.command,
      args: options.args,
      env: options.env,
      cwd: options.cwd,
      debug,
    };

    return new StdioTransport(transportOptions);
  }

  /**
   * Create HTTP transport
   */
  private createHttpTransport(options: ServerConnectionOptions, debug: boolean): HttpTransport {
    if (options.type !== 'http') {
      throw new Error('Invalid options for HTTP transport');
    }

    const transportOptions: HttpTransportOptions = {
      type: 'http',
      url: options.url,
      headers: options.headers,
      authToken: options.authToken,
      debug,
    };

    return new HttpTransport(transportOptions);
  }

  /**
   * Create SSE transport
   */
  private createSSETransport(options: ServerConnectionOptions, debug: boolean): HttpTransport {
    if (options.type !== 'sse') {
      throw new Error('Invalid options for SSE transport');
    }

    const transportOptions: SSETransportOptions = {
      type: 'sse',
      url: options.url,
      headers: options.headers,
      reconnectDelay: options.reconnectDelay || 5000,
      maxReconnectAttempts: 5,
      debug,
    };

    return new HttpTransport(transportOptions);
  }

  /**
   * Generate unique transport ID
   */
  private generateTransportId(options: ServerConnectionOptions): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);

    if (options.type === 'stdio') {
      return `stdio_${options.command}_${timestamp}_${random}`;
    } else if (options.type === 'http' || options.type === 'sse') {
      const url = new URL(options.url);
      return `${options.type}_${url.hostname}_${timestamp}_${random}`;
    }

    return `transport_${timestamp}_${random}`;
  }

  /**
   * Get a transport by ID
   */
  getTransport(transportId: string): ITransport | undefined {
    return this.transports.get(transportId);
  }

  /**
   * Get all active transports
   */
  getAllTransports(): Map<string, ITransport> {
    return new Map(this.transports);
  }

  /**
   * Remove a transport
   */
  async removeTransport(transportId: string): Promise<void> {
    const transport = this.transports.get(transportId);

    if (transport) {
      if (transport.isConnected()) {
        await transport.disconnect();
      }

      transport.destroy();
      this.transports.delete(transportId);

      this.logger.info('Transport removed', { id: transportId });
    }
  }

  /**
   * Disconnect and remove all transports
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up all transports', {
      count: this.transports.size,
    });

    const disconnectPromises: Promise<void>[] = [];

    for (const [id, transport] of this.transports) {
      disconnectPromises.push(
        transport
          .disconnect()
          .catch((err) => {
            this.logger.error('Error disconnecting transport', {
              id,
              error: err,
            });
          })
          .finally(() => {
            transport.destroy();
          })
      );
    }

    await Promise.all(disconnectPromises);
    this.transports.clear();

    this.logger.info('All transports cleaned up');
  }

  /**
   * Create a custom transport factory
   */
  static createFactory(): TransportFactory {
    return (options) => {
      const manager = TransportManager.getInstance();
      return manager.createTransport(options as ServerConnectionOptions);
    };
  }

  /**
   * Get transport statistics
   */
  getStats(): {
    total: number;
    connected: number;
    byType: Record<string, number>;
  } {
    const stats = {
      total: this.transports.size,
      connected: 0,
      byType: {} as Record<string, number>,
    };

    for (const transport of this.transports.values()) {
      const type = transport.getType();

      if (transport.isConnected()) {
        stats.connected++;
      }

      stats.byType[type] = (stats.byType[type] || 0) + 1;
    }

    return stats;
  }
}
