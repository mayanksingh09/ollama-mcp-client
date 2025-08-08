#!/usr/bin/env node

// ESM entry point for Ink UI
// This file uses .mts extension to force ESM module resolution

import { render } from 'ink';
import React from 'react';

// Use createRequire to import CommonJS modules
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import CommonJS modules
const { OllamaMCPClient } = require('../client/OllamaMCPClient');
const { ConfigManager } = require('./config/ConfigManager');
const { OllamaClient } = require('../ollama/OllamaClient');

// Import Ink components
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import { Box, Text } from 'ink';

// Store components globally for dynamic access
(globalThis as any).InkBox = Box;
(globalThis as any).InkText = Text;
(globalThis as any).InkGradient = Gradient;
(globalThis as any).InkBigText = BigText;
(globalThis as any).InkSpinner = Spinner;
(globalThis as any).InkTextInput = TextInput;

// Import our components using require
const MessageBox = require('./components/Display/MessageBox').default;
const InputBox = require('./components/Input/InputBox').default;
const CustomSpinner = require('./components/Display/Spinner').default;
const Chat = require('./components/Chat/Chat').default;

// Store our components
(globalThis as any).MessageBox = MessageBox;
(globalThis as any).InputBox = InputBox;
(globalThis as any).Spinner = CustomSpinner;
(globalThis as any).Chat = Chat;

// Get command line arguments passed from wrapper
const args = process.argv.slice(2);
const options: any = {};

// Parse arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const nextArg = args[i + 1];
    if (nextArg && !nextArg.startsWith('--')) {
      options[key] = nextArg;
      i++;
    } else {
      options[key] = true;
    }
  }
}

async function main() {
  try {
    // Initialize config manager
    const configManager = new ConfigManager();
    await configManager.load(options.config);
    const config = configManager.get();

    // Create client
    const client = new OllamaMCPClient(config);

    // Auto-connect to servers with autoConnect flag
    const servers = configManager.listServers().filter((s: any) => s.autoConnect);
    if (servers.length > 0) {
      console.log(`Auto-connecting to ${servers.length} server(s)...`);
      for (const server of servers) {
        try {
          const { serverConfigToConnectionOptions } = require('./config/ConfigSchema');
          await client.connectToServer(serverConfigToConnectionOptions(server));
          console.log(`✓ Connected to ${server.name}`);
        } catch (error: any) {
          console.log(`⚠ Failed to connect to ${server.name}: ${error.message}`);
        }
      }
    }

    // Get model
    let model = options.model || config.ollama?.model;

    // If no model specified, get from Ollama
    if (!model) {
      const ollamaClient = new OllamaClient(config.ollama);
      const modelsResponse = await ollamaClient.listModels();
      const models = modelsResponse.models || [];
      
      if (models.length === 0) {
        console.error('No Ollama models found. Please install a model first.');
        process.exit(1);
      }
      
      model = models[0].name;
    }

    // Create the Chat component
    const ChatApp = () => {
      return React.createElement(Chat, {
        client,
        model,
        temperature: parseFloat(options.temperature || '0.7'),
        maxTokens: options.maxTokens ? parseInt(options.maxTokens) : undefined,
        systemPrompt: options.system,
      });
    };

    // Render the app
    const { unmount, waitUntilExit } = render(React.createElement(ChatApp));

    // Handle cleanup
    process.on('SIGINT', () => {
      unmount();
      console.log('\nChat session ended.');
      process.exit(0);
    });

    // Wait for exit
    await waitUntilExit();
  } catch (error) {
    console.error('Error starting Ink UI:', error);
    process.exit(1);
  }
}

// Run the app
main();