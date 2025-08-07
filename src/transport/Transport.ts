/**
 * Abstract base class for MCP transports
 */

import { EventEmitter } from 'events';
import type { ITransport, TransportOptions, TransportError } from '../types/transport.types';
import { TransportState } from '../types/transport.types';
import type { Logger } from 'winston';
import winston from 'winston';

export abstract class Transport extends EventEmitter implements ITransport {
  protected _state: TransportState;
  protected logger: Logger;
  protected options: TransportOptions;

  constructor(options: TransportOptions) {
    super();
    this.options = options;
    this._state = TransportState.DISCONNECTED;

    // Initialize logger
    this.logger = winston.createLogger({
      level: options.debug ? 'debug' : 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { transport: this.getType() },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
        }),
      ],
    });
  }

  get state(): TransportState {
    return this._state;
  }

  protected setState(state: TransportState): void {
    const previousState = this._state;
    this._state = state;

    if (previousState !== state) {
      this.logger.debug(`Transport state changed: ${previousState} -> ${state}`);
      this.emit('stateChange', state);

      // Emit specific events based on state
      switch (state) {
        case TransportState.CONNECTED:
          this.emit('connect');
          break;
        case TransportState.DISCONNECTED:
          this.emit('disconnect');
          break;
        case TransportState.ERROR:
          // Error event should be emitted separately with error details
          break;
      }
    }
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract send(data: string | Buffer): Promise<void>;
  abstract getType(): string;

  isConnected(): boolean {
    return this._state === TransportState.CONNECTED;
  }

  protected handleData(data: string | Buffer): void {
    this.logger.debug('Data received', { size: data.length });
    this.emit('data', data);
  }

  protected handleError(error: Error): void {
    this.logger.error('Transport error', error);
    this.setState(TransportState.ERROR);

    const transportError: TransportError = error as TransportError;
    this.emit('error', transportError);
  }

  /**
   * Ensure the transport is connected before performing an operation
   */
  protected async ensureConnected(): Promise<void> {
    if (!this.isConnected()) {
      throw new Error(`Transport is not connected. Current state: ${this._state}`);
    }
  }

  /**
   * Cleanup resources when destroying the transport
   */
  destroy(): void {
    this.removeAllListeners();
    if (this.isConnected()) {
      this.disconnect().catch((err) => {
        this.logger.error('Error during transport cleanup', err);
      });
    }
  }
}
