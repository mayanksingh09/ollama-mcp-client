import React from 'react';

interface GlobalWithInkComponents {
  InkBox?: React.ComponentType<Record<string, unknown>>;
  InkText?: React.ComponentType<Record<string, unknown>>;
  InkSpinner?: React.ComponentType<Record<string, unknown>>;
}

type GlobalThis = GlobalWithInkComponents;

declare const globalThis: GlobalThis;

interface MessageBoxProps {
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
}

const MessageBox: React.FC<MessageBoxProps> = ({
  role,
  content,
  toolCalls,
  tokens,
  isStreaming = false,
}) => {
  // Dynamic imports will be handled at runtime
  const Box = globalThis.InkBox || 'div';
  const Text = globalThis.InkText || 'span';
  const Spinner = globalThis.InkSpinner || 'span';

  // Role-based styling
  const roleConfig = {
    user: {
      borderColor: 'green',
      symbol: '>',
      symbolColor: 'green',
    },
    assistant: {
      borderColor: 'blue',
      symbol: '*',
      symbolColor: 'blue',
    },
    system: {
      borderColor: 'yellow',
      symbol: '#',
      symbolColor: 'yellow',
    },
  };

  const config = roleConfig[role];

  return React.createElement(
    Box,
    {
      flexDirection: 'column',
      marginBottom: 0.5,
      borderStyle: 'round',
      borderColor: config.borderColor,
      paddingX: 1,
      paddingY: 0.5,
    },
    // Message content with symbol inline
    React.createElement(
      Box,
      { flexDirection: 'row' },
      React.createElement(Text, { bold: true, color: config.symbolColor }, config.symbol + ' '),
      React.createElement(
        Text,
        { wrap: 'wrap' },
        content,
        isStreaming &&
          React.createElement(
            Text,
            { color: 'cyan' },
            ' ',
            React.createElement(Spinner, { type: 'dots' })
          )
      )
    ),
    // Tool calls display
    toolCalls &&
      toolCalls.length > 0 &&
      React.createElement(
        Box,
        { flexDirection: 'column', marginTop: 0.5 },
        React.createElement(Text, { dimColor: true, italic: true }, '🔧 Tool Calls:'),
        ...toolCalls.map((toolCall, index) =>
          React.createElement(
            Box,
            { key: index, marginLeft: 1, marginTop: 0.5 },
            React.createElement(
              Text,
              { color: 'yellow' },
              `• ${toolCall.toolName}`,
              toolCall.arguments &&
                Object.keys(toolCall.arguments).length > 0 &&
                React.createElement(
                  Text,
                  { dimColor: true },
                  ` (${Object.keys(toolCall.arguments).length} args)`
                )
            )
          )
        )
      ),
    // Token usage display
    tokens &&
      React.createElement(
        Box,
        { marginTop: 0.5 },
        React.createElement(
          Text,
          { dimColor: true, italic: true },
          `Tokens: ${tokens.total} (prompt: ${tokens.prompt}, completion: ${tokens.completion})`
        )
      )
  );
};

export default MessageBox;

// Export a loader function that handles dynamic imports
export const loadMessageBox = async (): Promise<React.FC<MessageBoxProps>> => {
  const ink = await import('ink');
  const spinner = await import('ink-spinner');

  globalThis.InkBox = ink.Box;
  globalThis.InkText = ink.Text;
  globalThis.InkSpinner = spinner.default as unknown as React.ComponentType<
    Record<string, unknown>
  >;

  return MessageBox;
};
