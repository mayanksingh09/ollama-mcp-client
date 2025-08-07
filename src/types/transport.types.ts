/**
 * Transport layer type definitions
 */

import type { Readable, Writable } from 'stream';
import type { EventEmitter } from 'events';

/**
 * Transport connection options
 */
export interface TransportOptions {
  /** Transport type identifier */
  type: 'stdio' | 'http' | 'sse';
  /** Connection timeout in milliseconds */
  timeout?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Stdio transport specific options
 */
export interface StdioTransportOptions extends TransportOptions {
  type: 'stdio';
  /** Command to execute */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Working directory */
  cwd?: string;
}

/**
 * HTTP transport specific options
 */
export interface HttpTransportOptions extends TransportOptions {
  type: 'http';
  /** Server URL */
  url: string;
  /** HTTP headers */
  headers?: Record<string, string>;
  /** Authentication token */
  authToken?: string;
  /** Enable SSL verification */
  sslVerify?: boolean;
}

/**
 * SSE transport specific options
 */
export interface SSETransportOptions extends TransportOptions {
  type: 'sse';
  /** Server URL */
  url: string;
  /** HTTP headers */
  headers?: Record<string, string>;
  /** Reconnection delay in milliseconds */
  reconnectDelay?: number;
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
}

/**
 * Transport connection state
 */
export enum TransportState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTING = 'disconnecting',
  ERROR = 'error',
}

/**
 * Transport error
 */
export class TransportError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'TransportError';
  }
}

/**
 * Transport interface for MCP communication
 */
export interface ITransport extends EventEmitter {
  /** Current connection state */
  readonly state: TransportState;

  /** Connect to the transport */
  connect(): Promise<void>;

  /** Disconnect from the transport */
  disconnect(): Promise<void>;

  /** Send data through the transport */
  send(data: string | Buffer): Promise<void>;

  /** Check if transport is connected */
  isConnected(): boolean;

  /** Get transport type */
  getType(): string;

  /** Cleanup resources */
  destroy(): void;
}

/**
 * Stream-based transport interface
 */
export interface IStreamTransport extends ITransport {
  /** Input stream for reading data */
  readonly input: Readable;

  /** Output stream for writing data */
  readonly output: Writable;
}

/**
 * Transport factory function type
 */
export type TransportFactory = (
  options: StdioTransportOptions | HttpTransportOptions | SSETransportOptions
) => ITransport;

/**
 * Transport event types
 */
export interface TransportEvents {
  connect: () => void;
  disconnect: (reason?: string) => void;
  data: (data: string | Buffer) => void;
  error: (error: TransportError) => void;
  stateChange: (state: TransportState) => void;
}
