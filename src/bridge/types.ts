import type { Message } from '../ollama/types';
import type { MCPTool, MCPToolResult } from '../types/mcp.types';

export interface ConversationEntry {
  id: string;
  timestamp: Date;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCallRecord[];
  metadata?: Record<string, unknown>;
  tokenCount?: number;
}

export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  timestamp?: number;
  toolCalls?: ToolCallRecord[];
  metadata?: Record<string, unknown>;
}

export interface ToolCallRecord {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
  result?: MCPToolResult;
  error?: string;
  timestamp: Date;
  duration?: number;
}

export interface ConversationContext {
  id: string;
  entries: ConversationEntry[];
  totalTokens: number;
  maxTokens: number;
  metadata?: Record<string, unknown>;
}

export interface ConversationOptions {
  maxTokens?: number;
  maxEntries?: number;
  summarizationThreshold?: number;
  persistSession?: boolean;
  sessionId?: string;
}

export interface ParsedToolCall {
  toolName: string;
  arguments: Record<string, unknown>;
  confidence: number;
  rawMatch?: string;
}

export interface ParsingStrategy {
  name: string;
  parse(content: string, tools: MCPTool[]): ParsedToolCall[];
  canParse(content: string): boolean;
}

export interface ToolDecision {
  shouldInvoke: boolean;
  toolCalls: ParsedToolCall[];
  reasoning?: string;
  confidence: number;
}

export interface ToolSelectionOptions {
  threshold?: number;
  maxTools?: number;
  allowChaining?: boolean;
  requireExplicit?: boolean;
}

export interface FormattedToolCall {
  name: string;
  arguments: Record<string, unknown>;
  validated: boolean;
  errors?: string[];
}

export interface InjectionOptions {
  format?: 'text' | 'json' | 'xml';
  includeMetadata?: boolean;
  truncateLength?: number;
  preserveStructure?: boolean;
}

export interface ContextWindow {
  messages: Message[];
  tokenCount: number;
  maxTokens: number;
  modelName: string;
}

export interface ContextManagementStrategy {
  name: string;
  truncate(window: ContextWindow): Message[];
  summarize(messages: Message[]): Message;
}

export interface FunctionCallingTemplate {
  system: string;
  user: string;
  assistant: string;
  toolResult: string;
  examples?: Array<{
    input: string;
    output: string;
  }>;
}

export interface SimulatorOptions {
  template?: FunctionCallingTemplate;
  fewShotExamples?: boolean;
  chainOfThought?: boolean;
  maxRetries?: number;
}

export interface BridgeConfig {
  conversation?: ConversationOptions;
  parsing?: {
    strategies?: string[];
    fallbackStrategy?: string;
  };
  toolSelection?: ToolSelectionOptions;
  injection?: InjectionOptions;
  contextManagement?: {
    strategy?: string;
    maxTokens?: number;
  };
  functionCalling?: SimulatorOptions;
}

export interface TokenEstimator {
  estimate(text: string): number;
  estimateMessages(messages: Message[]): number;
}

export class BridgeError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'BridgeError';
  }
}

export class ParsingError extends BridgeError {
  constructor(message: string, details?: unknown) {
    super(message, 'PARSING_ERROR', details);
    this.name = 'ParsingError';
  }
}

export class ToolSelectionError extends BridgeError {
  constructor(message: string, details?: unknown) {
    super(message, 'TOOL_SELECTION_ERROR', details);
    this.name = 'ToolSelectionError';
  }
}

export class ContextOverflowError extends BridgeError {
  constructor(message: string, details?: unknown) {
    super(message, 'CONTEXT_OVERFLOW', details);
    this.name = 'ContextOverflowError';
  }
}
