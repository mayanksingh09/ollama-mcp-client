import { OllamaClient } from '../../src/ollama/OllamaClient';
import { OllamaModelNotFoundError } from '../../src/ollama/errors';
import { ChatCompletionRequest, GenerateRequest } from '../../src/ollama/types';
import axios from 'axios';
import { Readable } from 'stream';

jest.mock('axios');

describe('OllamaClient', () => {
  let client: OllamaClient;
  let mockedAxios: jest.Mocked<typeof axios>;

  beforeEach(() => {
    mockedAxios = axios as jest.Mocked<typeof axios>;
    mockedAxios.create.mockReturnValue({
      get: jest.fn(),
      post: jest.fn(),
      delete: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    } as any);

    client = new OllamaClient({
      host: 'localhost',
      port: 11434,
      model: 'llama3.2',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkHealth', () => {
    it('should return true when Ollama is accessible', async () => {
      const axiosInstance = mockedAxios.create();
      (axiosInstance.get as jest.Mock).mockResolvedValue({
        status: 200,
        data: { models: [] },
      });

      const result = await client.checkHealth();
      expect(result).toBe(true);
      expect(axiosInstance.get).toHaveBeenCalledWith('/api/tags');
    });

    it('should return false when Ollama is not accessible', async () => {
      const axiosInstance = mockedAxios.create();
      (axiosInstance.get as jest.Mock).mockRejectedValue(new Error('Connection refused'));

      const result = await client.checkHealth();
      expect(result).toBe(false);
    });
  });

  describe('chat', () => {
    it('should send chat completion request', async () => {
      const request: ChatCompletionRequest = {
        model: 'llama3.2',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false,
      };

      const response = {
        model: 'llama3.2',
        created_at: '2024-01-01T00:00:00Z',
        message: { role: 'assistant', content: 'Hi there!' },
        done: true,
      };

      const axiosInstance = mockedAxios.create();
      (axiosInstance.post as jest.Mock).mockResolvedValue({
        status: 200,
        data: response,
      });

      const result = await client.chat(request);
      expect(result).toEqual(response);
      expect(axiosInstance.post).toHaveBeenCalledWith('/api/chat', {
        ...request,
        stream: false,
      });
    });

    it('should handle streaming chat responses', async () => {
      const request: ChatCompletionRequest = {
        model: 'llama3.2',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
      };

      const stream = new Readable();

      const axiosInstance = mockedAxios.create();
      (axiosInstance.post as jest.Mock).mockResolvedValue({
        status: 200,
        data: stream,
      });

      const chunks: any[] = [];
      client.chat(request, {
        onChunk: (chunk) => chunks.push(chunk),
      });

      stream.push(
        JSON.stringify({
          model: 'llama3.2',
          created_at: '2024-01-01T00:00:00Z',
          message: { role: 'assistant', content: 'Hi' },
          done: false,
        }) + '\n'
      );
      stream.push(
        JSON.stringify({
          model: 'llama3.2',
          created_at: '2024-01-01T00:00:00Z',
          message: { role: 'assistant', content: ' there!' },
          done: true,
        }) + '\n'
      );
      stream.push(null);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(chunks).toHaveLength(2);
      expect(axiosInstance.post).toHaveBeenCalledWith(
        '/api/chat',
        { ...request, stream: true },
        { responseType: 'stream' }
      );
    });
  });

  describe('generate', () => {
    it('should send generate request', async () => {
      const request: GenerateRequest = {
        model: 'llama3.2',
        prompt: 'Tell me a joke',
        stream: false,
      };

      const response = {
        model: 'llama3.2',
        created_at: '2024-01-01T00:00:00Z',
        response: 'Why did the chicken cross the road?',
        done: true,
      };

      const axiosInstance = mockedAxios.create();
      (axiosInstance.post as jest.Mock).mockResolvedValue({
        status: 200,
        data: response,
      });

      const result = await client.generate(request);
      expect(result).toEqual(response);
      expect(axiosInstance.post).toHaveBeenCalledWith('/api/generate', {
        ...request,
        stream: false,
      });
    });
  });

  describe('listModels', () => {
    it('should list available models', async () => {
      const response = {
        models: [
          {
            name: 'llama3.2:latest',
            model: 'llama3.2:latest',
            modified_at: '2024-01-01T00:00:00Z',
            size: 1000000,
            digest: 'abc123',
            details: {
              format: 'gguf',
              family: 'llama',
              parameter_size: '8B',
              quantization_level: 'Q4_0',
            },
          },
        ],
      };

      const axiosInstance = mockedAxios.create();
      (axiosInstance.get as jest.Mock).mockResolvedValue({
        status: 200,
        data: response,
      });

      const result = await client.listModels();
      expect(result).toEqual(response);
      expect(axiosInstance.get).toHaveBeenCalledWith('/api/tags');
    });
  });

  describe('showModel', () => {
    it('should show model details', async () => {
      const request = { model: 'llama3.2' };
      const response = {
        modelfile: 'FROM llama3.2',
        parameters: 'temperature 0.7',
        template: '{{ .Prompt }}',
      };

      const axiosInstance = mockedAxios.create();
      (axiosInstance.post as jest.Mock).mockResolvedValue({
        status: 200,
        data: response,
      });

      const result = await client.showModel(request);
      expect(result).toEqual(response);
      expect(axiosInstance.post).toHaveBeenCalledWith('/api/show', request);
    });

    it('should handle model not found error', async () => {
      const request = { model: 'nonexistent' };

      const axiosInstance = mockedAxios.create();
      (axiosInstance.post as jest.Mock).mockResolvedValue({
        status: 404,
        data: { error: 'model not found' },
      });

      await expect(client.showModel(request)).rejects.toThrow(OllamaModelNotFoundError);
    });
  });

  describe('deleteModel', () => {
    it('should delete a model', async () => {
      const model = 'llama3.2';

      const axiosInstance = mockedAxios.create();
      (axiosInstance.delete as jest.Mock).mockResolvedValue({
        status: 200,
        data: {},
      });

      await client.deleteModel(model);
      expect(axiosInstance.delete).toHaveBeenCalledWith('/api/delete', {
        data: { model },
      });
    });
  });

  describe('config management', () => {
    it('should update configuration', () => {
      const newConfig = {
        host: 'remote-host',
        port: 8080,
      };

      client.updateConfig(newConfig);
      const config = client.getConfig();

      expect(config.host).toBe('remote-host');
      expect(config.port).toBe(8080);
    });

    it('should reset circuit breaker', () => {
      expect(() => client.resetCircuitBreaker()).not.toThrow();
    });
  });
});
