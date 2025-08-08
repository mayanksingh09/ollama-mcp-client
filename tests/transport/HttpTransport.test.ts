import { HttpTransport } from '../../src/transport/HttpTransport';
import axios from 'axios';
import EventSource from 'eventsource';
import { TestEventCollector, waitFor } from '../utils/testHelpers';

jest.mock('axios');
jest.mock('eventsource');

describe('HttpTransport', () => {
  let transport: HttpTransport;
  let mockAxios: jest.Mocked<typeof axios>;
  let mockEventSource: jest.Mocked<EventSource>;
  let eventCollector: TestEventCollector;

  beforeEach(() => {
    mockAxios = axios as jest.Mocked<typeof axios>;
    mockAxios.create.mockReturnValue({
      post: jest.fn(),
      get: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    } as any);

    mockEventSource = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      close: jest.fn(),
      readyState: EventSource.OPEN,
    } as any;

    (EventSource as jest.MockedClass<typeof EventSource>).mockImplementation(() => mockEventSource);

    transport = new HttpTransport({
      url: 'http://localhost:3000',
      headers: {
        Authorization: 'Bearer token123',
      },
    });

    eventCollector = new TestEventCollector(transport);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('connect', () => {
    it('should establish SSE connection', async () => {
      eventCollector.collectEvent('connect');

      await transport.connect();

      expect(EventSource).toHaveBeenCalledWith('http://localhost:3000/events', {
        headers: {
          Authorization: 'Bearer token123',
        },
      });

      const onOpenHandler = mockEventSource.addEventListener.mock.calls.find(
        (call) => call[0] === 'open'
      )?.[1];

      if (onOpenHandler) {
        onOpenHandler({} as any);
      }

      const events = eventCollector.getEvents('connect');
      expect(events).toHaveLength(1);
    });

    it('should handle connection errors', async () => {
      eventCollector.collectEvent('error');

      await transport.connect();

      const onErrorHandler = mockEventSource.addEventListener.mock.calls.find(
        (call) => call[0] === 'error'
      )?.[1];

      const error = new Error('Connection failed');
      if (onErrorHandler) {
        onErrorHandler({ error } as any);
      }

      const events = eventCollector.getEvents('error');
      expect(events).toHaveLength(1);
    });

    it('should reject connection if already connected', async () => {
      await transport.connect();
      await expect(transport.connect()).rejects.toThrow('Transport already connected');
    });

    it('should append /events to URL for SSE', async () => {
      transport = new HttpTransport({
        url: 'http://localhost:3000/api',
      });

      await transport.connect();

      expect(EventSource).toHaveBeenCalledWith(
        'http://localhost:3000/api/events',
        expect.any(Object)
      );
    });
  });

  describe('disconnect', () => {
    it('should close EventSource connection', async () => {
      await transport.connect();
      await transport.disconnect();

      expect(mockEventSource.close).toHaveBeenCalled();
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
  });

  describe('send', () => {
    it('should send message via HTTP POST', async () => {
      const axiosInstance = mockAxios.create();
      (axiosInstance.post as jest.Mock).mockResolvedValue({
        status: 200,
        data: { success: true },
      });

      await transport.connect();

      const message = { type: 'request', id: '123', method: 'test' };
      await transport.send(message);

      expect(axiosInstance.post).toHaveBeenCalledWith('/', message);
    });

    it('should reject send when not connected', async () => {
      const message = { type: 'request', id: '123', method: 'test' };
      await expect(transport.send(message)).rejects.toThrow('Transport not connected');
    });

    it('should handle HTTP errors', async () => {
      const axiosInstance = mockAxios.create();
      (axiosInstance.post as jest.Mock).mockRejectedValue(new Error('Network error'));

      await transport.connect();

      const message = { type: 'request', id: '123', method: 'test' };
      await expect(transport.send(message)).rejects.toThrow('Network error');
    });

    it('should handle non-200 status codes', async () => {
      const axiosInstance = mockAxios.create();
      (axiosInstance.post as jest.Mock).mockResolvedValue({
        status: 500,
        statusText: 'Internal Server Error',
      });

      await transport.connect();

      const message = { type: 'request', id: '123', method: 'test' };
      await expect(transport.send(message)).rejects.toThrow('HTTP request failed with status 500');
    });
  });

  describe('message handling', () => {
    it('should handle SSE messages', async () => {
      eventCollector.collectEvent('message');

      await transport.connect();

      const onMessageHandler = mockEventSource.addEventListener.mock.calls.find(
        (call) => call[0] === 'message'
      )?.[1];

      const messageData = { type: 'response', id: '123', result: 'success' };
      if (onMessageHandler) {
        onMessageHandler({
          data: JSON.stringify(messageData),
        } as any);
      }

      const events = eventCollector.getEvents('message');
      expect(events).toHaveLength(1);
      expect(events[0].data[0]).toEqual(messageData);
    });

    it('should handle custom SSE event types', async () => {
      eventCollector.collectEvent('message');

      await transport.connect();

      const onCustomHandler = mockEventSource.addEventListener.mock.calls.find(
        (call) => call[0] === 'custom-event'
      )?.[1];

      const customData = { type: 'custom', data: 'test' };
      if (onCustomHandler) {
        onCustomHandler({
          data: JSON.stringify(customData),
        } as any);
      }

      const events = eventCollector.getEvents('message');
      expect(events).toHaveLength(1);
      expect(events[0].data[0]).toEqual(customData);
    });

    it('should handle invalid JSON in SSE messages', async () => {
      eventCollector.collectEvent('error');

      await transport.connect();

      const onMessageHandler = mockEventSource.addEventListener.mock.calls.find(
        (call) => call[0] === 'message'
      )?.[1];

      if (onMessageHandler) {
        onMessageHandler({
          data: 'invalid json',
        } as any);
      }

      const events = eventCollector.getEvents('error');
      expect(events).toHaveLength(1);
      expect(events[0].data[0]).toBeInstanceOf(Error);
    });
  });

  describe('reconnection', () => {
    it('should handle SSE reconnection', async () => {
      eventCollector.collectEvent('connect');
      eventCollector.collectEvent('disconnect');

      await transport.connect();

      const onOpenHandler = mockEventSource.addEventListener.mock.calls.find(
        (call) => call[0] === 'open'
      )?.[1];

      const onErrorHandler = mockEventSource.addEventListener.mock.calls.find(
        (call) => call[0] === 'error'
      )?.[1];

      if (onErrorHandler) {
        mockEventSource.readyState = EventSource.CONNECTING;
        onErrorHandler({ error: new Error('Connection lost') } as any);
      }

      if (onOpenHandler) {
        mockEventSource.readyState = EventSource.OPEN;
        onOpenHandler({} as any);
      }

      const connectEvents = eventCollector.getEvents('connect');
      expect(connectEvents.length).toBeGreaterThanOrEqual(1);
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

    it('should reflect SSE readyState', async () => {
      await transport.connect();

      mockEventSource.readyState = EventSource.OPEN;
      expect(transport.isConnected()).toBe(true);

      mockEventSource.readyState = EventSource.CLOSED;
      expect(transport.isConnected()).toBe(false);

      mockEventSource.readyState = EventSource.CONNECTING;
      expect(transport.isConnected()).toBe(false);
    });
  });

  describe('authentication', () => {
    it('should include auth headers in requests', async () => {
      transport = new HttpTransport({
        url: 'http://localhost:3000',
        headers: {
          Authorization: 'Bearer secret-token',
          'X-Custom-Header': 'custom-value',
        },
      });

      await transport.connect();

      expect(EventSource).toHaveBeenCalledWith(expect.any(String), {
        headers: {
          Authorization: 'Bearer secret-token',
          'X-Custom-Header': 'custom-value',
        },
      });
    });

    it('should include auth headers in HTTP requests', async () => {
      const axiosInstance = mockAxios.create();

      transport = new HttpTransport({
        url: 'http://localhost:3000',
        headers: {
          Authorization: 'Bearer secret-token',
        },
      });

      expect(mockAxios.create).toHaveBeenCalledWith({
        baseURL: 'http://localhost:3000',
        headers: {
          Authorization: 'Bearer secret-token',
          'Content-Type': 'application/json',
        },
      });
    });
  });

  describe('timeout handling', () => {
    it('should apply timeout to HTTP requests', async () => {
      transport = new HttpTransport({
        url: 'http://localhost:3000',
        timeout: 5000,
      });

      expect(mockAxios.create).toHaveBeenCalledWith({
        baseURL: 'http://localhost:3000',
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      });
    });
  });

  describe('URL handling', () => {
    it('should handle URLs with trailing slash', async () => {
      transport = new HttpTransport({
        url: 'http://localhost:3000/',
      });

      await transport.connect();

      expect(EventSource).toHaveBeenCalledWith('http://localhost:3000/events', expect.any(Object));
    });

    it('should handle URLs with path', async () => {
      transport = new HttpTransport({
        url: 'http://localhost:3000/api/v1',
      });

      await transport.connect();

      expect(EventSource).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/events',
        expect.any(Object)
      );
    });
  });
});
