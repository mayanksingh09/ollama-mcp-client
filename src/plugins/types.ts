import type { EventEmitter } from 'events';
import type { OllamaMCPClientEnhanced } from '../client/OllamaMCPClientEnhanced';
import type { MCPToolResult } from '../types/mcp.types';

export interface PluginMetadata {
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  dependencies?: string[];
  tags?: string[];
}

export interface PluginContext {
  client: OllamaMCPClientEnhanced;
  config: Record<string, unknown>;
  logger: PluginLogger;
  storage: PluginStorage;
  eventBus: EventEmitter;
}

export interface PluginLogger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, error?: Error | unknown): void;
}

export interface PluginStorage {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}

export interface PluginHooks {
  beforeConnect?: (options: unknown) => Promise<unknown | void>;
  afterConnect?: (serverId: string, connectionInfo: unknown) => Promise<void>;
  beforeDisconnect?: (serverId: string) => Promise<void>;
  afterDisconnect?: (serverId: string) => Promise<void>;

  beforeChat?: (
    message: string,
    options?: unknown
  ) => Promise<{ message: string; options?: unknown } | void>;
  afterChat?: (response: unknown) => Promise<unknown | void>;

  beforeToolExecution?: (
    toolName: string,
    args?: Record<string, unknown>
  ) => Promise<{ args?: Record<string, unknown> } | void>;
  afterToolExecution?: (toolName: string, result: MCPToolResult) => Promise<MCPToolResult | void>;

  beforeResourceRead?: (uri: string) => Promise<{ uri: string } | void>;
  afterResourceRead?: (uri: string, content: string) => Promise<string | void>;

  beforePromptExecution?: (
    name: string,
    args?: Record<string, string>
  ) => Promise<{ args?: Record<string, string> } | void>;
  afterPromptExecution?: (name: string, messages: unknown[]) => Promise<unknown[] | void>;

  onError?: (error: Error, context: { operation: string; details?: unknown }) => Promise<void>;
  onShutdown?: () => Promise<void>;
}

export interface Plugin {
  metadata: PluginMetadata;

  initialize(context: PluginContext): Promise<void>;

  activate(): Promise<void>;

  deactivate(): Promise<void>;

  getHooks?(): PluginHooks;

  registerCommands?(): PluginCommand[];

  registerTools?(): PluginTool[];

  registerTransformers?(): unknown[];

  getStatus(): PluginStatus;

  destroy(): Promise<void>;
}

export interface PluginCommand {
  name: string;
  description?: string;
  execute(args: string[]): Promise<void>;
}

export interface PluginTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  execute(args?: Record<string, unknown>): Promise<MCPToolResult>;
}

export interface PluginStatus {
  active: boolean;
  healthy: boolean;
  lastError?: string;
  stats?: Record<string, unknown>;
}

export interface PluginConfig {
  enabled?: boolean;
  priority?: number;
  config?: Record<string, unknown>;
  autoLoad?: boolean;
}

export interface PluginManifest {
  metadata: PluginMetadata;
  main: string;
  config?: PluginConfig;
  permissions?: string[];
}
