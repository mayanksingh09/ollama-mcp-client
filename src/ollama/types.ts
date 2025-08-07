export interface OllamaConfig {
  host?: string;
  port?: number;
  model?: string;
  timeout?: number;
  headers?: Record<string, string>;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  images?: string[];
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface ChatCompletionRequest {
  model: string;
  messages: Message[];
  tools?: Tool[];
  format?: 'json' | string;
  options?: ModelOptions;
  stream?: boolean;
  keep_alive?: string | number;
}

export interface ChatCompletionResponse {
  model: string;
  created_at: string;
  message: Message;
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface GenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  template?: string;
  context?: number[];
  stream?: boolean;
  raw?: boolean;
  format?: 'json' | string;
  options?: ModelOptions;
  keep_alive?: string | number;
  images?: string[];
}

export interface GenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  done_reason?: string;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface ModelOptions {
  num_keep?: number;
  seed?: number;
  num_predict?: number;
  top_k?: number;
  top_p?: number;
  min_p?: number;
  tfs_z?: number;
  typical_p?: number;
  repeat_last_n?: number;
  temperature?: number;
  repeat_penalty?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  mirostat?: number;
  mirostat_tau?: number;
  mirostat_eta?: number;
  penalize_newline?: boolean;
  stop?: string[];
  numa?: boolean;
  num_ctx?: number;
  num_batch?: number;
  num_gpu?: number;
  main_gpu?: number;
  low_vram?: boolean;
  f16_kv?: boolean;
  vocab_only?: boolean;
  use_mmap?: boolean;
  use_mlock?: boolean;
  num_thread?: number;
}

export interface Model {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: ModelDetails;
}

export interface ModelDetails {
  parent_model?: string;
  format: string;
  family: string;
  families?: string[];
  parameter_size: string;
  quantization_level: string;
}

export interface ListModelsResponse {
  models: Model[];
}

export interface ShowModelRequest {
  model: string;
  verbose?: boolean;
}

export interface ShowModelResponse {
  modelfile: string;
  parameters?: string;
  template?: string;
  details?: ModelDetails;
  modelinfo?: Record<string, unknown>;
}

export interface PullModelRequest {
  model: string;
  insecure?: boolean;
  stream?: boolean;
}

export interface PullModelResponse {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}

export interface EmbeddingRequest {
  model: string;
  input: string | string[];
  truncate?: boolean;
  options?: ModelOptions;
  keep_alive?: string | number;
}

export interface EmbeddingResponse {
  model: string;
  embeddings: number[][];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
}

export interface StreamChunk {
  model: string;
  created_at: string;
  response?: string;
  message?: Message;
  done: boolean;
  done_reason?: string;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaError {
  error: string;
  code?: string;
  status?: number;
}

export interface ConnectionOptions {
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  keepAlive?: boolean;
  keepAliveMsecs?: number;
}

export type StreamCallback = (chunk: StreamChunk) => void;
export type ErrorCallback = (error: Error) => void;
export type CompleteCallback = () => void;

export interface StreamHandlers {
  onChunk?: StreamCallback;
  onError?: ErrorCallback;
  onComplete?: CompleteCallback;
}
