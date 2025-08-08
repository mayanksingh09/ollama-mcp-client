import React from 'react';
import type { OllamaMCPClient } from '../../client/OllamaMCPClient';
import type { CLIConfig } from '../config/ConfigSchema';

interface AppProps {
  client: OllamaMCPClient;
  config: CLIConfig;
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

const App: React.FC<AppProps> = ({
  client,
  config: _config,
  model,
  temperature,
  maxTokens,
  systemPrompt,
}) => {
  // Dynamic component loading
  interface GlobalWithComponents {
    Chat?: React.ComponentType<{
      client: OllamaMCPClient;
      model: string;
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string;
    }>;
    InkBox?: React.ComponentType<{ padding?: number; children?: React.ReactNode }>;
    InkText?: React.ComponentType<{ color?: string; children?: React.ReactNode }>;
  }
  const globalWithComponents = globalThis as Record<
    string,
    unknown
  > as unknown as GlobalWithComponents;
  const Chat = globalWithComponents.Chat;

  if (!Chat) {
    const Box = globalWithComponents.InkBox || 'div';
    const Text = globalWithComponents.InkText || 'span';

    return React.createElement(
      Box,
      { padding: 1 },
      React.createElement(Text, { color: 'red' }, 'Error: Chat component not loaded')
    );
  }

  return React.createElement(Chat, {
    client,
    model,
    temperature,
    maxTokens,
    systemPrompt,
  });
};

export default App;

// Main render function for the chat interface
export const renderChat = async (options: {
  client: OllamaMCPClient;
  config: CLIConfig;
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}): Promise<void> => {
  // Dynamic imports with proper typing
  const inkModule = await import('ink');
  const { render } = inkModule;
  const gradientModule = await import('ink-gradient');

  // Load Chat component and its dependencies
  const { loadChat } = await import('./Chat/Chat');
  const Chat = await loadChat();

  // Store components globally
  interface GlobalWithComponents {
    InkBox?: typeof inkModule.Box;
    InkText?: typeof inkModule.Text;
    InkGradient?: typeof gradientModule.default;
    Chat?: typeof Chat;
  }
  const globalWithComponents = globalThis as Record<
    string,
    unknown
  > as unknown as GlobalWithComponents;
  globalWithComponents.InkBox = inkModule.Box;
  globalWithComponents.InkText = inkModule.Text;
  globalWithComponents.InkGradient = gradientModule.default;
  globalWithComponents.Chat = Chat;

  // Create the app
  const app = React.createElement(App, options);

  // Render with Ink
  const { unmount, waitUntilExit } = render(app);

  // Handle cleanup
  process.on('SIGINT', () => {
    unmount();
    process.exit(0);
  });

  // Wait for the app to exit
  try {
    await waitUntilExit();
  } catch (error) {
    console.error('Error in Ink app:', error);
    unmount();
    process.exit(1);
  }
};

// Alternative entry point for testing
export const testInkChat = async (): Promise<void> => {
  // Create a mock client for testing
  const mockClient = {
    chat: async (message: string) => {
      // Simulate delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      return {
        message: `Echo: ${message}`,
        usage: {
          promptTokens: 10,
          completionTokens: 15,
          totalTokens: 25,
        },
      };
    },
    listTools: async () => [],
  } as unknown as OllamaMCPClient;

  const mockConfig = {
    ollama: {
      host: 'http://localhost:11434',
      model: 'test-model',
    },
    output: {
      format: 'pretty',
      colors: true,
    },
  } as CLIConfig;

  await renderChat({
    client: mockClient,
    config: mockConfig,
    model: 'test-model',
    temperature: 0.7,
  });
};
