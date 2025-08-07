/**
 * Client configuration and type definitions
 */

import type { OllamaConfig } from '../ollama/types';
import type { MCPClientOptions, MCPSessionState } from './mcp.types';

/**
 * Ollama MCP Client configuration
 */
export interface OllamaMCPClientConfig {
  /** Ollama configuration */
  ollama?: OllamaConfig;
  /** MCP client options */
  mcp?: MCPClientOptions;
  /** Logging configuration */
  logging?: LoggingConfig;
  /** Session configuration */
  session?: SessionConfig;
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
  /** Log level */
  level?: 'error' | 'warn' | 'info' | 'debug' | 'verbose';
  /** Log file path */
  file?: string;
  /** Enable console output */
  console?: boolean;
  /** Log format */
  format?: 'json' | 'simple' | 'pretty';
}

/**
 * Session configuration
 */
export interface SessionConfig {
  /** Session persistence */
  persist?: boolean;
  /** Session storage path */
  storagePath?: string;
  /** Session timeout in milliseconds */
  timeout?: number;
  /** Maximum session history size */
  maxHistorySize?: number;
}

/**
 * Server connection options
 */
export type ServerConnectionOptions =
  | StdioServerConnection
  | HttpServerConnection
  | SSEServerConnection;

/**
 * Stdio server connection
 */
export interface StdioServerConnection {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

/**
 * HTTP server connection
 */
export interface HttpServerConnection {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
  authToken?: string;
}

/**
 * SSE server connection
 */
export interface SSEServerConnection {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
  reconnectDelay?: number;
}

/**
 * Connection state
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error',
}

/**
 * Connection info
 */
export interface ConnectionInfo {
  serverId: string;
  serverName: string;
  connectionType: 'stdio' | 'http' | 'sse';
  state: ConnectionState;
  connectedAt?: Date;
  lastError?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Client session
 */
export interface ClientSession {
  id: string;
  connections: Map<string, ConnectionInfo>;
  mcpState: MCPSessionState;
  conversationHistory: ConversationEntry[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Conversation entry
 */
export interface ConversationEntry {
  id: string;
  timestamp: Date;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCallEntry[];
  metadata?: Record<string, unknown>;
}

/**
 * Tool call entry
 */
export interface ToolCallEntry {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  error?: string;
  duration?: number;
}

/**
 * Client event types
 */
export interface ClientEvents {
  // Connection events
  serverConnected: (serverId: string, info: ConnectionInfo) => void;
  serverDisconnected: (serverId: string, reason?: string) => void;
  connectionError: (serverId: string, error: Error) => void;

  // MCP events
  toolsUpdated: (serverId: string, tools: string[]) => void;
  resourcesUpdated: (serverId: string, resources: string[]) => void;
  promptsUpdated: (serverId: string, prompts: string[]) => void;

  // Session events
  sessionCreated: (session: ClientSession) => void;
  sessionRestored: (session: ClientSession) => void;
  sessionDestroyed: (sessionId: string) => void;

  // Conversation events
  messageReceived: (entry: ConversationEntry) => void;
  toolCallStarted: (toolCall: ToolCallEntry) => void;
  toolCallCompleted: (toolCall: ToolCallEntry) => void;
  toolCallFailed: (toolCall: ToolCallEntry, error: Error) => void;
}

/**
 * Chat options
 */
export interface ChatOptions {
  /** Target server ID (if multiple connections) */
  serverId?: string;
  /** Ollama model to use */
  model?: string;
  /** Temperature for generation */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** System prompt */
  systemPrompt?: string;
  /** Include conversation history */
  includeHistory?: boolean;
  /** Stream the response */
  stream?: boolean;
}

/**
 * Chat response
 */
export interface ChatResponse {
  message: string;
  toolCalls?: ToolCallEntry[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Client statistics
 */
export interface ClientStats {
  sessionsCreated: number;
  messagesProcessed: number;
  toolCallsExecuted: number;
  errors: number;
  averageResponseTime: number;
  uptime: number;
}
