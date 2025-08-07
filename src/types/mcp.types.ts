/**
 * MCP (Model Context Protocol) type definitions
 */

/**
 * MCP protocol version
 */
export const MCP_VERSION = '2024-11-05';

/**
 * MCP message types
 */
export enum MessageType {
  REQUEST = 'request',
  RESPONSE = 'response',
  NOTIFICATION = 'notification',
  ERROR = 'error',
}

/**
 * MCP capabilities
 */
export interface MCPCapabilities {
  tools?: {
    listTools?: boolean;
    callTool?: boolean;
  };
  resources?: {
    listResources?: boolean;
    readResource?: boolean;
    subscribeResource?: boolean;
  };
  prompts?: {
    listPrompts?: boolean;
    getPrompt?: boolean;
  };
  logging?: {
    setLevel?: boolean;
  };
  experimental?: Record<string, unknown>;
}

/**
 * MCP server information
 */
export interface MCPServerInfo {
  name: string;
  version: string;
  protocolVersion: string;
  capabilities: MCPCapabilities;
  metadata?: Record<string, unknown>;
}

/**
 * MCP tool definition
 */
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

/**
 * MCP resource definition
 */
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}

/**
 * MCP prompt definition
 */
export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

/**
 * MCP tool call request
 */
export interface MCPToolCall {
  name: string;
  arguments?: Record<string, unknown>;
}

/**
 * MCP tool call result content item
 */
export type MCPToolResultContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType?: string }
  | { type: 'resource'; resource: { uri: string; text?: string; mimeType?: string } };

/**
 * MCP tool call result
 */
export interface MCPToolResult {
  content: MCPToolResultContent[];
  isError?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * MCP resource content
 */
export interface MCPResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
  metadata?: Record<string, unknown>;
}

/**
 * MCP message base interface
 */
export interface MCPMessage {
  jsonrpc: '2.0';
  id?: string | number;
}

/**
 * MCP request message
 */
export interface MCPRequest extends MCPMessage {
  method: string;
  params?: unknown;
}

/**
 * MCP response message
 */
export interface MCPResponse extends MCPMessage {
  result?: unknown;
  error?: MCPError;
}

/**
 * MCP notification message
 */
export interface MCPNotification extends Omit<MCPMessage, 'id'> {
  method: string;
  params?: unknown;
}

/**
 * MCP error object
 */
export interface MCPError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * MCP error codes
 */
export enum MCPErrorCode {
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,
  SERVER_ERROR = -32000,
  RESOURCE_NOT_FOUND = -32001,
  TOOL_NOT_FOUND = -32002,
  PROMPT_NOT_FOUND = -32003,
  UNAUTHORIZED = -32004,
  RATE_LIMIT_EXCEEDED = -32005,
}

/**
 * MCP session state
 */
export interface MCPSessionState {
  serverInfo?: MCPServerInfo;
  availableTools: MCPTool[];
  availableResources: MCPResource[];
  availablePrompts: MCPPrompt[];
  isConnected: boolean;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * MCP client options
 */
export interface MCPClientOptions {
  /** Client name */
  name?: string;
  /** Client version */
  version?: string;
  /** Protocol version */
  protocolVersion?: string;
  /** Client capabilities */
  capabilities?: MCPCapabilities;
  /** Request timeout in milliseconds */
  requestTimeout?: number;
  /** Enable debug mode */
  debug?: boolean;
}

/**
 * MCP initialization parameters
 */
export interface MCPInitializeParams {
  protocolVersion: string;
  capabilities: MCPCapabilities;
  clientInfo: {
    name: string;
    version: string;
  };
}

/**
 * MCP initialization result
 */
export interface MCPInitializeResult {
  protocolVersion: string;
  capabilities: MCPCapabilities;
  serverInfo: {
    name: string;
    version: string;
  };
}

/**
 * MCP methods
 */
export enum MCPMethod {
  // Lifecycle
  INITIALIZE = 'initialize',
  INITIALIZED = 'initialized',
  SHUTDOWN = 'shutdown',

  // Tools
  TOOLS_LIST = 'tools/list',
  TOOLS_CALL = 'tools/call',

  // Resources
  RESOURCES_LIST = 'resources/list',
  RESOURCES_READ = 'resources/read',
  RESOURCES_SUBSCRIBE = 'resources/subscribe',
  RESOURCES_UNSUBSCRIBE = 'resources/unsubscribe',

  // Prompts
  PROMPTS_LIST = 'prompts/list',
  PROMPTS_GET = 'prompts/get',

  // Logging
  LOGGING_SET_LEVEL = 'logging/setLevel',

  // Notifications
  RESOURCES_UPDATED = 'notifications/resources/updated',
  TOOLS_UPDATED = 'notifications/tools/updated',
  PROMPTS_UPDATED = 'notifications/prompts/updated',
  PROGRESS = 'notifications/progress',
  LOG_MESSAGE = 'notifications/message',
}
