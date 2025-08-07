import { Command } from 'commander';
import chalk from 'chalk';
import * as readline from 'readline';
import { OllamaMCPClient } from '../../client/OllamaMCPClient';
import { ConfigManager } from '../config/ConfigManager';
import { withSpinner } from '../utils/spinners';
import { formatError, formatInfo, formatToolResult } from '../utils/formatters';
import { validateModel } from '../utils/validators';

const chatCommand = new Command('chat')
  .description('Start an interactive chat session with Ollama and MCP tools')
  .option('-m, --model <model>', 'Ollama model to use')
  .option('-s, --system <prompt>', 'system prompt')
  .option('-t, --temperature <temp>', 'temperature (0.0-1.0)', parseFloat)
  .option('--max-tokens <tokens>', 'maximum tokens to generate', parseInt)
  .option('--no-tools', 'disable MCP tool usage')
  .option('--no-history', 'disable conversation history')
  .option('--stream', 'enable streaming responses')
  .action(async (options, command) => {
    const configManager: ConfigManager = command.parent.configManager;
    const config = configManager.get();
    const colors = config.output?.colors !== false;

    try {
      // Check if we have a connected client
      let client = (global as Record<string, unknown>).mcpClient as OllamaMCPClient | undefined;

      if (!client) {
        // Create a new client
        client = new OllamaMCPClient(config);

        // Auto-connect to servers with autoConnect flag
        const servers = configManager.listServers().filter((s) => s.autoConnect);
        if (servers.length > 0) {
          console.log(formatInfo(`Auto-connecting to ${servers.length} server(s)...`, { colors }));
          for (const server of servers) {
            try {
              const { serverConfigToConnectionOptions } = await import('../config/ConfigSchema');
              await client.connectToServer(serverConfigToConnectionOptions(server));
              console.log(chalk.green(`✓ Connected to ${server.name}`));
            } catch (error) {
              console.log(
                chalk.yellow(`⚠ Failed to connect to ${server.name}: ${(error as Error).message}`)
              );
            }
          }
        }
      }

      // Validate model if provided
      if (options.model && !validateModel(options.model)) {
        throw new Error('Invalid model name');
      }

      const model = options.model || config.ollama?.model || 'llama2';
      const temperature = options.temperature ?? 0.7;
      const maxTokens = options.maxTokens;
      const useTools = options.tools !== false;
      const useHistory = options.history !== false;
      const stream = options.stream || false;

      console.log(chalk.bold.cyan('🤖 Ollama MCP Chat'));
      console.log(
        chalk.dim(
          `Model: ${model} | Temperature: ${temperature} | Tools: ${useTools ? 'enabled' : 'disabled'}`
        )
      );

      if (useTools) {
        const tools = await client.listTools();
        if (tools.length > 0) {
          console.log(chalk.dim(`Available tools: ${tools.length}`));
        } else {
          console.log(
            chalk.yellow(
              'No MCP tools available. Connect to a server first with "ollama-mcp connect"'
            )
          );
        }
      }

      console.log();
      console.log(
        chalk.dim(
          'Type your message and press Enter. Type "exit" to quit, "clear" to clear history.'
        )
      );
      console.log();

      // Create readline interface
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: chalk.bold.green('You> '),
      });

      // Handle multi-line input
      let multilineMode = false;
      let multilineBuffer: string[] = [];

      rl.on('line', async (input) => {
        // Handle special commands
        if (input.trim() === 'exit') {
          console.log(chalk.dim('Goodbye!'));
          rl.close();
          process.exit(0);
        }

        if (input.trim() === 'clear') {
          console.clear();
          console.log(chalk.dim('History cleared'));
          rl.prompt();
          return;
        }

        if (input.trim() === '"""') {
          if (!multilineMode) {
            multilineMode = true;
            multilineBuffer = [];
            rl.setPrompt(chalk.dim('... '));
            rl.prompt();
            return;
          } else {
            multilineMode = false;
            input = multilineBuffer.join('\n');
            rl.setPrompt(chalk.bold.green('You> '));
          }
        }

        if (multilineMode) {
          multilineBuffer.push(input);
          rl.prompt();
          return;
        }

        if (!input.trim()) {
          rl.prompt();
          return;
        }

        // Pause readline while processing
        rl.pause();

        try {
          console.log();

          if (stream) {
            // Streaming response (TODO: implement streaming)
            console.log(chalk.bold.blue('Assistant> '));
            const response = await client.chat(input, {
              model,
              temperature,
              maxTokens,
              includeHistory: useHistory,
              systemPrompt: options.system,
            });
            console.log(response.message);
          } else {
            // Non-streaming response with spinner
            const response = await withSpinner(
              'Thinking...',
              () =>
                client.chat(input, {
                  model,
                  temperature,
                  maxTokens,
                  includeHistory: useHistory,
                  systemPrompt: options.system,
                }),
              {
                successText: '',
              }
            );

            console.log(chalk.bold.blue('Assistant> '));
            console.log(response.message);

            // Show tool usage if any
            if (response.toolCalls && response.toolCalls.length > 0) {
              console.log();
              console.log(chalk.dim('Tools used:'));
              for (const toolCall of response.toolCalls) {
                console.log(chalk.dim(`  • ${toolCall.toolName}`));
                if (
                  config.output?.format === 'pretty' &&
                  toolCall.result &&
                  toolCall.result !== null &&
                  typeof toolCall.result === 'object' &&
                  'content' in toolCall.result
                ) {
                  const formatted = formatToolResult(
                    toolCall.result as import('../../types/mcp.types').MCPToolResult,
                    {
                      colors,
                      truncate: true,
                      maxLength: 200,
                    }
                  );
                  if (formatted) {
                    console.log(chalk.dim(`    ${formatted}`));
                  }
                }
              }
            }

            // Show token usage if available
            if (response.usage) {
              console.log();
              console.log(
                chalk.dim(
                  `Tokens: ${response.usage.totalTokens} (prompt: ${response.usage.promptTokens}, completion: ${response.usage.completionTokens})`
                )
              );
            }
          }

          console.log();
        } catch (error) {
          console.error(formatError(error as Error, { colors }));
          console.log();
        }

        // Resume readline
        rl.resume();
        rl.prompt();
      });

      rl.on('close', () => {
        console.log(chalk.dim('\nChat session ended'));
        process.exit(0);
      });

      // Start the prompt
      rl.prompt();
    } catch (error) {
      console.error(formatError(error as Error, { colors }));
      process.exit(1);
    }
  });

export default chatCommand;
