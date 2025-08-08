import { useState, useCallback, useRef } from 'react';
import type { OllamaMCPClient } from '../../client/OllamaMCPClient';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolCalls?: Array<{
    toolName: string;
    arguments?: Record<string, unknown>;
    result?: unknown;
  }>;
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

interface UseChatOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  includeHistory?: boolean;
}

export const useChat = (client: OllamaMCPClient, options: UseChatOptions) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      // Clear any previous errors
      setError(null);

      // Add user message
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setStreamContent('');

      try {
        // Create abort controller for cancellation
        abortControllerRef.current = new AbortController();

        // Call the client
        const response = await client.chat(content, {
          model: options.model,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          systemPrompt: options.systemPrompt,
          includeHistory: options.includeHistory ?? true,
        });

        // Add assistant message
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response.message,
          timestamp: new Date(),
          toolCalls: response.toolCalls,
          tokens: response.usage
            ? {
                prompt: response.usage.promptTokens,
                completion: response.usage.completionTokens,
                total: response.usage.totalTokens,
              }
            : undefined,
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);

        // Add error message to chat
        const errorMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'system',
          content: `Error: ${errorMessage}`,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsLoading(false);
        setStreamContent('');
        abortControllerRef.current = null;
      }
    },
    [client, options]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    setStreamContent('');
  }, []);

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
      setStreamContent('');
    }
  }, []);

  const updateStreamContent = useCallback((content: string) => {
    setStreamContent(content);
  }, []);

  return {
    messages,
    isLoading,
    streamContent,
    error,
    sendMessage,
    clearMessages,
    cancelRequest,
    updateStreamContent,
  };
};
