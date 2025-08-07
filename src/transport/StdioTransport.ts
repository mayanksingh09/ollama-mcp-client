/**
 * Stdio transport implementation for local MCP servers
 */

import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import type { Readable, Writable } from 'stream';
import { Transport } from './Transport';
import type { IStreamTransport, StdioTransportOptions } from '../types/transport.types';
import { TransportState } from '../types/transport.types';

export class StdioTransport extends Transport implements IStreamTransport {
  private process?: ChildProcess;
  private _input?: Readable;
  private _output?: Writable;
  private readonly stdioOptions: StdioTransportOptions;
  private dataBuffer: string = '';

  constructor(options: StdioTransportOptions) {
    super(options);
    this.stdioOptions = options;
  }

  get input(): Readable {
    if (!this._input) {
      throw new Error('Transport not connected: input stream unavailable');
    }
    return this._input;
  }

  get output(): Writable {
    if (!this._output) {
      throw new Error('Transport not connected: output stream unavailable');
    }
    return this._output;
  }

  async connect(): Promise<void> {
    if (this.isConnected()) {
      this.logger.warn('Transport already connected');
      return;
    }

    this.setState(TransportState.CONNECTING);

    try {
      await this.spawnProcess();
      this.setupStreamHandlers();
      this.setState(TransportState.CONNECTED);
      this.logger.info('Stdio transport connected', {
        command: this.stdioOptions.command,
        args: this.stdioOptions.args,
      });
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  private async spawnProcess(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { command, args = [], env, cwd } = this.stdioOptions;

      this.logger.debug('Spawning process', { command, args, cwd });

      this.process = spawn(command, args, {
        cwd,
        env: env ? { ...process.env, ...env } : process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (!this.process.stdin || !this.process.stdout) {
        reject(new Error('Failed to create process streams'));
        return;
      }

      this._input = this.process.stdout;
      this._output = this.process.stdin;

      // Handle process spawn errors
      this.process.once('error', (error) => {
        this.logger.error('Process spawn error', error);
        reject(new Error(`Failed to spawn process: ${error.message}`));
      });

      // Handle stderr
      if (this.process.stderr) {
        this.process.stderr.on('data', (data) => {
          this.logger.debug('Process stderr', { data: data.toString() });
        });
      }

      // Give the process a moment to start
      setTimeout(() => {
        if (this.process?.pid) {
          resolve();
        } else {
          reject(new Error('Process failed to start'));
        }
      }, 100);
    });
  }

  private setupStreamHandlers(): void {
    if (!this._input || !this.process) {
      return;
    }

    // Handle incoming data from the process
    this._input.on('data', (chunk: Buffer) => {
      this.dataBuffer += chunk.toString();

      // Try to parse complete JSON-RPC messages
      const lines = this.dataBuffer.split('\n');
      this.dataBuffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            // Validate it's JSON before emitting
            JSON.parse(line);
            this.handleData(line);
          } catch {
            // If not valid JSON, might be partial message
            this.dataBuffer = line + '\n' + this.dataBuffer;
          }
        }
      }
    });

    // Handle process exit
    this.process.on('exit', (code, signal) => {
      this.logger.info('Process exited', { code, signal });
      this.setState(TransportState.DISCONNECTED);

      if (code !== 0 && code !== null) {
        this.handleError(new Error(`Process exited with code ${code}`));
      }
    });

    // Handle process close
    this.process.on('close', () => {
      this.logger.debug('Process closed');
      this.cleanup();
    });
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected()) {
      this.logger.warn('Transport not connected');
      return;
    }

    this.setState(TransportState.DISCONNECTING);

    try {
      await this.terminateProcess();
      this.cleanup();
      this.setState(TransportState.DISCONNECTED);
      this.logger.info('Stdio transport disconnected');
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  private async terminateProcess(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.process) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        this.logger.warn('Process termination timeout, forcing kill');
        this.process?.kill('SIGKILL');
        resolve();
      }, 5000);

      this.process.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      // Try graceful shutdown first
      this.process.kill('SIGTERM');
    });
  }

  private cleanup(): void {
    this._input?.removeAllListeners();
    this._output?.removeAllListeners();
    this.process?.removeAllListeners();

    this._input = undefined;
    this._output = undefined;
    this.process = undefined;
    this.dataBuffer = '';
  }

  async send(data: string | Buffer): Promise<void> {
    await this.ensureConnected();

    return new Promise((resolve, reject) => {
      if (!this._output) {
        reject(new Error('Output stream not available'));
        return;
      }

      const message = typeof data === 'string' ? data : data.toString();

      // Ensure message ends with newline for JSON-RPC
      const formattedMessage = message.endsWith('\n') ? message : message + '\n';

      this._output.write(formattedMessage, (error) => {
        if (error) {
          this.logger.error('Failed to send data', error);
          reject(error);
        } else {
          this.logger.debug('Data sent', { size: formattedMessage.length });
          resolve();
        }
      });
    });
  }

  getType(): string {
    return 'stdio';
  }

  /**
   * Get process information
   */
  getProcessInfo(): { pid?: number; connected: boolean } {
    return {
      pid: this.process?.pid,
      connected: this.isConnected(),
    };
  }
}
