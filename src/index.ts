/**
 * Ollama MCP Client
 * Main entry point for the MCP client powered by Ollama
 */

// Core client
export { OllamaMCPClient } from './client/OllamaMCPClient';
export { OllamaMCPClientEnhanced } from './client/OllamaMCPClientEnhanced';

// Ollama integration
export { OllamaClient } from './ollama/OllamaClient';
export * from './ollama/types';
export {
  OllamaConnectionError,
  OllamaAPIError,
  OllamaTimeoutError,
  OllamaModelNotFoundError,
  RetryStrategy,
  CircuitBreaker,
} from './ollama/errors';

// Transport layer
export * from './transport';

// Session management
export * from './session';

// Protocol handlers
export * from './protocol';

// Type definitions
export * from './types';

// Bridge components (selective export to avoid conflicts)
export {
  ConversationManager,
  ContextWindowManager,
  ResponseParser,
  ToolDecisionEngine,
  ToolInvocationFormatter,
  ResultInjector,
  StreamingResultInjector,
  FunctionCallingSimulator,
  BridgeError,
  ParsingError,
  ToolSelectionError,
  ContextOverflowError,
} from './bridge';

// Bridge types (export as namespace to avoid conflicts)
export type {
  ConversationEntry as BridgeConversationEntry,
  ToolCallRecord,
  ConversationContext,
  ConversationOptions,
  ParsedToolCall,
  ParsingStrategy,
  ToolDecision,
  ToolSelectionOptions,
  FormattedToolCall,
  InjectionOptions,
  ContextWindow,
  ContextManagementStrategy,
  FunctionCallingTemplate,
  SimulatorOptions,
  BridgeConfig,
  TokenEstimator,
} from './bridge';

// Utilities
export * from './utils';
