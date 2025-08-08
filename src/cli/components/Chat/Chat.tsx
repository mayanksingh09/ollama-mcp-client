import React, { useEffect, useRef } from 'react';
import { useChat } from '../../hooks/useChat';
import { useKeyboard } from '../../hooks/useKeyboard';
import type { OllamaMCPClient } from '../../../client/OllamaMCPClient';

interface GlobalWithInkComponents {
  InkBox?: React.ComponentType<Record<string, unknown>>;
  InkText?: React.ComponentType<Record<string, unknown>>;
  MessageBox?: React.ComponentType<{
    key?: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: Date;
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
    isStreaming?: boolean;
  }>;
  InputBox?: React.ComponentType<{
    onSubmit: (value: string) => void;
    placeholder?: string;
    isDisabled?: boolean;
    showHistory?: boolean;
  }>;
  Spinner?: React.ComponentType<{
    type?: 'dots' | 'line' | 'arc' | 'bouncingBar';
    label?: string;
    showTimer?: boolean;
    color?: string;
  }>;
}

type GlobalThis = GlobalWithInkComponents;

declare const globalThis: GlobalThis;

interface ChatProps {
  client: OllamaMCPClient;
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

const Chat: React.FC<ChatProps> = ({
  client,
  model,
  temperature = 0.7,
  maxTokens,
  systemPrompt,
}) => {
  // Dynamic imports will be handled at runtime
  const Box = globalThis.InkBox || 'div';
  const Text = globalThis.InkText || 'span';

  // Import components dynamically
  const MessageBox = globalThis.MessageBox;
  const InputBox = globalThis.InputBox;
  const Spinner = globalThis.Spinner;

  // Use chat hook
  const { messages, isLoading, streamContent, error, sendMessage, clearMessages, cancelRequest } =
    useChat(client, {
      model,
      temperature,
      maxTokens,
      systemPrompt,
      includeHistory: true,
    });

  // Keyboard shortcuts
  useKeyboard({
    shortcuts: {
      'ctrl+l': clearMessages,
      'ctrl+c': () => process.exit(0),
      escape: cancelRequest,
    },
  });

  // Auto-scroll to bottom ref
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll logic would go here if we had a scrollable container
  }, [messages]);

  return React.createElement(
    Box,
    { flexDirection: 'column', padding: 1 },
    // Header
    React.createElement(
      Box,
      {
        marginBottom: 0.5,
        borderStyle: 'round',
        borderColor: 'cyanBright',
        paddingX: 1,
        paddingY: 0.5,
      },
      React.createElement(
        Box,
        { flexDirection: 'column' },
        React.createElement(Text, { bold: true, color: 'cyanBright' }, 'Ollama MCP Chat'),
        React.createElement(Text, { dimColor: true }, `Model: ${model}`),
        React.createElement(
          Text,
          { dimColor: true, italic: true },
          'Ctrl+L: Clear • Ctrl+C: Exit • ESC: Cancel'
        )
      )
    ),
    // Messages area
    React.createElement(
      Box,
      {
        flexDirection: 'column',
        minHeight: 10,
        marginBottom: 0.5,
      },
      messages.length === 0
        ? React.createElement(
            Box,
            { justifyContent: 'center', alignItems: 'center', height: '100%' },
            React.createElement(
              Text,
              { dimColor: true, italic: true },
              'No messages yet. Start typing to begin the conversation.'
            )
          )
        : messages.map(
            (msg) =>
              MessageBox &&
              React.createElement(MessageBox, {
                key: msg.id,
                role: msg.role,
                content: msg.content,
                timestamp: msg.timestamp,
                toolCalls: msg.toolCalls,
                tokens: msg.tokens,
                isStreaming: false,
              })
          ),
      // Show streaming content if loading
      isLoading &&
        streamContent &&
        MessageBox &&
        React.createElement(MessageBox, {
          key: 'streaming',
          role: 'assistant',
          content: streamContent,
          isStreaming: true,
        }),
      // Messages end ref for scrolling
      React.createElement('div', { ref: messagesEndRef })
    ),
    // Loading indicator
    isLoading &&
      !streamContent &&
      React.createElement(
        Box,
        { marginBottom: 0.5 },
        Spinner &&
          React.createElement(Spinner, {
            type: 'dots',
            label: 'Thinking',
            showTimer: true,
            color: 'cyan',
          })
      ),
    // Error display
    error &&
      React.createElement(
        Box,
        {
          marginBottom: 0.5,
          borderStyle: 'round',
          borderColor: 'red',
          padding: 0.25,
        },
        React.createElement(Text, { color: 'red' }, `⚠ ${error}`)
      ),
    // Input area
    InputBox &&
      React.createElement(InputBox, {
        onSubmit: sendMessage,
        placeholder: 'Type your message...',
        isDisabled: isLoading,
        showHistory: true,
      })
  );
};

export default Chat;

// Export a loader function that handles dynamic imports
export const loadChat = async (): Promise<React.FC<ChatProps>> => {
  const ink = await import('ink');

  // Load components
  const { loadMessageBox } = await import('../Display/MessageBox');
  const { loadInputBox } = await import('../Input/InputBox');
  const { loadSpinner } = await import('../Display/Spinner');

  const MessageBox = await loadMessageBox();
  const InputBox = await loadInputBox();
  const { Spinner } = await loadSpinner();

  // Store in global for component access
  globalThis.InkBox = ink.Box;
  globalThis.InkText = ink.Text;
  globalThis.MessageBox = MessageBox;
  globalThis.InputBox = InputBox;
  globalThis.Spinner = Spinner;

  return Chat;
};
