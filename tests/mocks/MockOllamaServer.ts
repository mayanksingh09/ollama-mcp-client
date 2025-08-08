import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  GenerateRequest,
  GenerateResponse,
  ModelInfo,
  ShowModelResponse,
} from '../../src/ollama/types';

export interface MockOllamaOptions {
  defaultModel?: string;
  models?: ModelInfo[];
  responseDelay?: number;
  streamChunkDelay?: number;
  errorRate?: number;
  simulateToolCalls?: boolean;
}

export class MockOllamaServer {
  private options: Required<MockOllamaOptions>;
  private requestHistory: any[] = [];
  private customResponses: Map<string, any> = new Map();

  constructor(options: MockOllamaOptions = {}) {
    this.options = {
      defaultModel: options.defaultModel || 'llama3.2',
      models: options.models || this.getDefaultModels(),
      responseDelay: options.responseDelay || 0,
      streamChunkDelay: options.streamChunkDelay || 10,
      errorRate: options.errorRate || 0,
      simulateToolCalls: options.simulateToolCalls || false,
    };
  }

  private getDefaultModels(): ModelInfo[] {
    return [
      {
        name: 'llama3.2:latest',
        model: 'llama3.2:latest',
        modified_at: new Date().toISOString(),
        size: 4000000000,
        digest: 'sha256:abc123',
        details: {
          format: 'gguf',
          family: 'llama',
          parameter_size: '8B',
          quantization_level: 'Q4_0',
        },
      },
      {
        name: 'mistral:latest',
        model: 'mistral:latest',
        modified_at: new Date().toISOString(),
        size: 3800000000,
        digest: 'sha256:def456',
        details: {
          format: 'gguf',
          family: 'mistral',
          parameter_size: '7B',
          quantization_level: 'Q4_0',
        },
      },
    ];
  }

  public async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    this.recordRequest('chat', request);
    await this.simulateDelay();
    this.maybeThrowError();

    const customResponse = this.customResponses.get('chat');
    if (customResponse) {
      return customResponse;
    }

    const lastMessage = request.messages[request.messages.length - 1];
    let responseContent = `Mock response to: ${lastMessage.content}`;

    if (this.options.simulateToolCalls && lastMessage.content.toLowerCase().includes('tool')) {
      responseContent = this.generateToolCallResponse();
    }

    return {
      model: request.model,
      created_at: new Date().toISOString(),
      message: {
        role: 'assistant',
        content: responseContent,
      },
      done: true,
      total_duration: 1000000,
      load_duration: 100000,
      prompt_eval_count: 10,
      prompt_eval_duration: 100000,
      eval_count: 20,
      eval_duration: 800000,
    };
  }

  public async *chatStream(request: ChatCompletionRequest): AsyncGenerator<ChatCompletionResponse> {
    this.recordRequest('chatStream', request);
    await this.simulateDelay();
    this.maybeThrowError();

    const chunks = ['Mock', ' streaming', ' response', ' to:', ' your', ' query'];

    for (const chunk of chunks) {
      await this.simulateStreamDelay();
      yield {
        model: request.model,
        created_at: new Date().toISOString(),
        message: {
          role: 'assistant',
          content: chunk,
        },
        done: false,
      } as ChatCompletionResponse;
    }

    yield {
      model: request.model,
      created_at: new Date().toISOString(),
      message: {
        role: 'assistant',
        content: '',
      },
      done: true,
      total_duration: 1000000,
      load_duration: 100000,
      prompt_eval_count: 10,
      prompt_eval_duration: 100000,
      eval_count: chunks.length,
      eval_duration: 800000,
    } as ChatCompletionResponse;
  }

  public async generate(request: GenerateRequest): Promise<GenerateResponse> {
    this.recordRequest('generate', request);
    await this.simulateDelay();
    this.maybeThrowError();

    const customResponse = this.customResponses.get('generate');
    if (customResponse) {
      return customResponse;
    }

    return {
      model: request.model,
      created_at: new Date().toISOString(),
      response: `Generated response for prompt: ${request.prompt.substring(0, 50)}...`,
      done: true,
      context: [1, 2, 3, 4, 5],
      total_duration: 1000000,
      load_duration: 100000,
      prompt_eval_count: 10,
      prompt_eval_duration: 100000,
      eval_count: 20,
      eval_duration: 800000,
    };
  }

  public async *generateStream(request: GenerateRequest): AsyncGenerator<GenerateResponse> {
    this.recordRequest('generateStream', request);
    await this.simulateDelay();
    this.maybeThrowError();

    const chunks = ['Generated', ' streaming', ' response'];

    for (const chunk of chunks) {
      await this.simulateStreamDelay();
      yield {
        model: request.model,
        created_at: new Date().toISOString(),
        response: chunk,
        done: false,
      } as GenerateResponse;
    }

    yield {
      model: request.model,
      created_at: new Date().toISOString(),
      response: '',
      done: true,
      context: [1, 2, 3, 4, 5],
      total_duration: 1000000,
      load_duration: 100000,
      prompt_eval_count: 10,
      prompt_eval_duration: 100000,
      eval_count: chunks.length,
      eval_duration: 800000,
    } as GenerateResponse;
  }

  public async listModels(): Promise<{ models: ModelInfo[] }> {
    this.recordRequest('listModels', {});
    await this.simulateDelay();
    this.maybeThrowError();

    return { models: this.options.models };
  }

  public async showModel(request: { model: string }): Promise<ShowModelResponse> {
    this.recordRequest('showModel', request);
    await this.simulateDelay();
    this.maybeThrowError();

    const model = this.options.models.find(
      (m) => m.name === request.model || m.model === request.model
    );

    if (!model) {
      throw new Error(`Model ${request.model} not found`);
    }

    return {
      modelfile: `FROM ${request.model}`,
      parameters: 'temperature 0.7\ntop_p 0.9',
      template: '{{ .System }}\n{{ .Prompt }}',
      details: model.details,
    };
  }

  public async checkHealth(): Promise<boolean> {
    await this.simulateDelay();
    return !this.maybeThrowError(true);
  }

  private generateToolCallResponse(): string {
    return JSON.stringify({
      tool_calls: [
        {
          name: 'calculator',
          arguments: {
            operation: 'add',
            a: 5,
            b: 3,
          },
        },
      ],
    });
  }

  private async simulateDelay(): Promise<void> {
    if (this.options.responseDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.options.responseDelay));
    }
  }

  private async simulateStreamDelay(): Promise<void> {
    if (this.options.streamChunkDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.options.streamChunkDelay));
    }
  }

  private maybeThrowError(returnBool = false): boolean {
    if (this.options.errorRate > 0 && Math.random() < this.options.errorRate) {
      if (returnBool) return true;
      throw new Error('Simulated Ollama server error');
    }
    return false;
  }

  private recordRequest(method: string, params: any): void {
    this.requestHistory.push({
      method,
      params,
      timestamp: new Date().toISOString(),
    });
  }

  public setCustomResponse(method: string, response: any): void {
    this.customResponses.set(method, response);
  }

  public clearCustomResponses(): void {
    this.customResponses.clear();
  }

  public getRequestHistory(): any[] {
    return [...this.requestHistory];
  }

  public clearRequestHistory(): void {
    this.requestHistory = [];
  }

  public setErrorRate(rate: number): void {
    this.options.errorRate = rate;
  }

  public setResponseDelay(delay: number): void {
    this.options.responseDelay = delay;
  }
}
