import { StdioTransport } from '../../src/transport/StdioTransport';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { TestEventCollector, waitFor } from '../utils/testHelpers';

jest.mock('child_process');

describe('StdioTransport', () => {
  let transport: StdioTransport;
  let mockProcess: any;
  let eventCollector: TestEventCollector;

  beforeEach(() => {
    mockProcess = new EventEmitter() as any;
    mockProcess.stdin = new EventEmitter() as any;
    mockProcess.stdout = new EventEmitter() as any;
    mockProcess.stderr = new EventEmitter() as any;
    mockProcess.kill = jest.fn();
    mockProcess.pid = 12345;

    mockProcess.stdin.write = jest.fn((data, callback) => {
      if (callback) callback();
      return true;
    });
    mockProcess.stdin.end = jest.fn();

    (spawn as jest.Mock).mockReturnValue(mockProcess);

    transport = new StdioTransport({
      command: 'test-command',
      args: ['--arg1', '--arg2'],
      env: { TEST_ENV: 'value' },
    });

    eventCollector = new TestEventCollector(transport);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('connect', () => {
    it('should spawn a process with correct command and args', async () => {
      await transport.connect();

      expect(spawn).toHaveBeenCalledWith('test-command', ['--arg1', '--arg2'], {
        env: expect.objectContaining({ TEST_ENV: 'value' }),
        stdio: 'pipe',
      });
    });

    it('should emit connect event when process is spawned', async () => {
      eventCollector.collectEvent('connect');

      await transport.connect();
      mockProcess.emit('spawn');

      const events = eventCollector.getEvents('connect');
      expect(events).toHaveLength(1);
    });

    it('should handle process spawn errors', async () => {
      eventCollector.collectEvent('error');

      await transport.connect();
      const error = new Error('Spawn failed');
      mockProcess.emit('error', error);

      const events = eventCollector.getEvents('error');
      expect(events).toHaveLength(1);
      expect(events[0].data[0]).toBe(error);
    });

    it('should reject connection if already connected', async () => {
      await transport.connect();
      await expect(transport.connect()).rejects.toThrow('Transport already connected');
    });
  });

  describe('disconnect', () => {
    it('should kill the process on disconnect', async () => {
      await transport.connect();
      await transport.disconnect();

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should emit disconnect event', async () => {
      eventCollector.collectEvent('disconnect');

      await transport.connect();
      await transport.disconnect();

      const events = eventCollector.getEvents('disconnect');
      expect(events).toHaveLength(1);
    });

    it('should handle disconnect when not connected', async () => {
      await expect(transport.disconnect()).resolves.not.toThrow();
    });

    it('should force kill process after timeout', async () => {
      jest.useFakeTimers();

      await transport.connect();
      const disconnectPromise = transport.disconnect();

      jest.advanceTimersByTime(5000);

      await disconnectPromise;
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');

      jest.useRealTimers();
    });
  });

  describe('send', () => {
    it('should send message through stdin', async () => {
      await transport.connect();

      const message = { type: 'request', id: '123', method: 'test' };
      await transport.send(message);

      expect(mockProcess.stdin.write).toHaveBeenCalledWith(
        JSON.stringify(message) + '\n',
        expect.any(Function)
      );
    });

    it('should reject send when not connected', async () => {
      const message = { type: 'request', id: '123', method: 'test' };
      await expect(transport.send(message)).rejects.toThrow('Transport not connected');
    });

    it('should handle write errors', async () => {
      await transport.connect();

      mockProcess.stdin.write = jest.fn((data, callback) => {
        if (callback) callback(new Error('Write failed'));
        return false;
      });

      const message = { type: 'request', id: '123', method: 'test' };
      await expect(transport.send(message)).rejects.toThrow('Write failed');
    });
  });

  describe('message handling', () => {
    it('should parse and emit messages from stdout', async () => {
      eventCollector.collectEvent('message');

      await transport.connect();

      const message = { type: 'response', id: '123', result: 'success' };
      mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(message) + '\n'));

      const events = eventCollector.getEvents('message');
      expect(events).toHaveLength(1);
      expect(events[0].data[0]).toEqual(message);
    });

    it('should handle partial messages', async () => {
      eventCollector.collectEvent('message');

      await transport.connect();

      const message = { type: 'response', id: '123', result: 'success' };
      const jsonString = JSON.stringify(message);

      mockProcess.stdout.emit('data', Buffer.from(jsonString.substring(0, 10)));
      mockProcess.stdout.emit('data', Buffer.from(jsonString.substring(10) + '\n'));

      const events = eventCollector.getEvents('message');
      expect(events).toHaveLength(1);
      expect(events[0].data[0]).toEqual(message);
    });

    it('should handle multiple messages in one chunk', async () => {
      eventCollector.collectEvent('message');

      await transport.connect();

      const message1 = { type: 'response', id: '123', result: 'success' };
      const message2 = { type: 'response', id: '456', result: 'also success' };

      mockProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(message1) + '\n' + JSON.stringify(message2) + '\n')
      );

      const events = eventCollector.getEvents('message');
      expect(events).toHaveLength(2);
      expect(events[0].data[0]).toEqual(message1);
      expect(events[1].data[0]).toEqual(message2);
    });

    it('should handle invalid JSON gracefully', async () => {
      eventCollector.collectEvent('error');

      await transport.connect();

      mockProcess.stdout.emit('data', Buffer.from('invalid json\n'));

      const events = eventCollector.getEvents('error');
      expect(events).toHaveLength(1);
      expect(events[0].data[0]).toBeInstanceOf(Error);
    });
  });

  describe('stderr handling', () => {
    it('should emit stderr data as debug events', async () => {
      eventCollector.collectEvent('debug');

      await transport.connect();

      mockProcess.stderr.emit('data', Buffer.from('Debug message\n'));

      const events = eventCollector.getEvents('debug');
      expect(events).toHaveLength(1);
      expect(events[0].data[0]).toBe('Debug message\n');
    });
  });

  describe('process lifecycle', () => {
    it('should handle process exit with code 0', async () => {
      eventCollector.collectEvent('disconnect');

      await transport.connect();
      mockProcess.emit('exit', 0, null);

      const events = eventCollector.getEvents('disconnect');
      expect(events).toHaveLength(1);
    });

    it('should emit error on non-zero exit code', async () => {
      eventCollector.collectEvent('error');

      await transport.connect();
      mockProcess.emit('exit', 1, null);

      const events = eventCollector.getEvents('error');
      expect(events).toHaveLength(1);
      expect(events[0].data[0].message).toContain('exited with code 1');
    });

    it('should handle process termination by signal', async () => {
      eventCollector.collectEvent('error');

      await transport.connect();
      mockProcess.emit('exit', null, 'SIGKILL');

      const events = eventCollector.getEvents('error');
      expect(events).toHaveLength(1);
      expect(events[0].data[0].message).toContain('terminated by signal SIGKILL');
    });

    it('should handle process close event', async () => {
      eventCollector.collectEvent('disconnect');

      await transport.connect();
      mockProcess.emit('close', 0, null);

      const events = eventCollector.getEvents('disconnect');
      expect(events).toHaveLength(1);
    });
  });

  describe('isConnected', () => {
    it('should return false when not connected', () => {
      expect(transport.isConnected()).toBe(false);
    });

    it('should return true when connected', async () => {
      await transport.connect();
      expect(transport.isConnected()).toBe(true);
    });

    it('should return false after disconnect', async () => {
      await transport.connect();
      await transport.disconnect();
      expect(transport.isConnected()).toBe(false);
    });
  });

  describe('environment variables', () => {
    it('should merge custom env with process env', async () => {
      const originalEnv = process.env;
      process.env = { NODE_ENV: 'test', PATH: '/usr/bin' };

      transport = new StdioTransport({
        command: 'test-command',
        env: { CUSTOM_VAR: 'custom_value' },
      });

      await transport.connect();

      expect(spawn).toHaveBeenCalledWith('test-command', [], {
        env: expect.objectContaining({
          NODE_ENV: 'test',
          PATH: '/usr/bin',
          CUSTOM_VAR: 'custom_value',
        }),
        stdio: 'pipe',
      });

      process.env = originalEnv;
    });
  });

  describe('working directory', () => {
    it('should set working directory if provided', async () => {
      transport = new StdioTransport({
        command: 'test-command',
        cwd: '/custom/working/dir',
      });

      await transport.connect();

      expect(spawn).toHaveBeenCalledWith('test-command', [], {
        env: expect.any(Object),
        stdio: 'pipe',
        cwd: '/custom/working/dir',
      });
    });
  });
});
