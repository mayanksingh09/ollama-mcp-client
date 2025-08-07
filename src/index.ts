/**
 * Ollama MCP Client
 * Main entry point for the MCP client powered by Ollama
 */

// Core client
export { OllamaMCPClient } from './client/OllamaMCPClient';

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

// Utilities
export * from './utils';
