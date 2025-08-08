import { Command } from 'commander';
import chalk from 'chalk';
import * as readline from 'readline';
import inquirer from 'inquirer';
import { OllamaMCPClient } from '../../client/OllamaMCPClient';
import { ConfigManager } from '../config/ConfigManager';
import { withSpinner } from '../utils/spinners';
import { withEnhancedSpinner } from '../ui/enhanced-spinner';
import { InputBox } from '../ui/input-box';
import { formatError, formatInfo, formatToolResult } from '../utils/formatters';
import { validateModel } from '../utils/validators';
import { configureGlobalLogLevel, mapLogLevel } from '../utils/logger-config';
import { OllamaClient } from '../../ollama/OllamaClient';

const chatCommand = new Command('chat')
  .description('Start an interactive chat session with Ollama and MCP tools')
  .option('-m, --model <model>', 'Ollama model to use')
  .option('-s, --system <prompt>', 'system prompt')
  .option('-t, --temperature <temp>', 'temperature (0.0-1.0)', parseFloat)
  .option('--max-tokens <tokens>', 'maximum tokens to generate', parseInt)
  .option('--no-tools', 'disable MCP tool usage')
  .option('--no-history', 'disable conversation history')
  .option('--stream', 'enable streaming responses')
  .option('--simple-cli', 'use simple CLI without enhanced UI or boxed input')
  .option('--log-level <level>', 'set log level (none, error, warning, info, debug, all)', 'error')
  .action(async (options, command) => {
    // Configure log level IMMEDIATELY before anything else
    const logLevel = options.logLevel || 'error';
    const winstonLevel = mapLogLevel(logLevel);
    configureGlobalLogLevel(winstonLevel);

    const configManager: ConfigManager = command.parent.configManager;
    const config = configManager.get();
    const colors = config.output?.colors !== false;

    try {
      // Check if we have a connected client
      let client = (global as Record<string, unknown>).mcpClient as OllamaMCPClient | undefined;

      if (!client) {
        // Create a new client with configured log level
        const clientConfig = {
          ...config,
          logging: {
            ...config.logging,
            level: winstonLevel as 'error' | 'warn' | 'info' | 'debug' | 'verbose',
          },
        };
        client = new OllamaMCPClient(clientConfig);

        // Auto-connect to servers with autoConnect flag
        const servers = configManager.listServers().filter((s) => s.autoConnect);
        if (servers.length > 0) {
          if (logLevel !== 'error' && logLevel !== 'none') {
            console.log(
              formatInfo(`Auto-connecting to ${servers.length} server(s)...`, { colors })
            );
          }
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

      let model = options.model || config.ollama?.model;

      // If no model is specified, show interactive model selector
      if (!model) {
        const ollamaClient = new OllamaClient(config.ollama);

        try {
          const modelsResponse = await withSpinner(
            'Fetching available Ollama models...',
            () => ollamaClient.listModels(),
            { successText: '' }
          );

          const models = modelsResponse.models || [];

          if (models.length === 0) {
            console.log(chalk.yellow('No Ollama models found. Please install a model first:'));
            console.log(chalk.dim('  ollama pull llama3.2'));
            console.log(chalk.dim('  ollama pull mistral'));
            console.log(chalk.dim('  ollama pull codellama'));
            process.exit(1);
          }

          // Format model choices for inquirer
          const modelChoices = models.map((m) => ({
            name: `${m.name} ${chalk.dim(`(${formatSize(m.size)})`)}`,
            value: m.name,
            short: m.name,
          }));

          const answer = await inquirer.prompt([
            {
              type: 'list',
              name: 'model',
              message: 'Select an Ollama model to use:',
              choices: modelChoices,
              pageSize: 10,
            },
          ]);

          model = answer.model;
          console.log();
        } catch {
          console.log(chalk.red('Error: Could not fetch models from Ollama.'));
          console.log(
            chalk.yellow('Please ensure Ollama is running and has at least one model installed:')
          );
          console.log(chalk.dim('  ollama pull llama3.2'));
          console.log(chalk.dim('  ollama pull mistral'));
          console.log(chalk.dim('  ollama pull codellama'));
          process.exit(1);
        }
      }
      const temperature = options.temperature ?? 0.7;
      const maxTokens = options.maxTokens;
      const useTools = options.tools !== false;
      const useHistory = options.history !== false;
      const stream = options.stream || false;
      const useSimpleCli = options.simpleCli || false;
      const useEnhancedUI = !useSimpleCli;
      const useBoxed = !useSimpleCli;

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

      // Show initial input indicator if using boxed mode
      if (useBoxed) {
        InputBox.showLightInput();
      }

      // Create readline interface
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: useBoxed ? chalk.cyan('  › ') : chalk.green('> '),
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
          // Close input box if using boxed mode
          if (useBoxed) {
            // Clear the input box area
            process.stdout.write('\x1B[3A\x1B[2K'); // Move up 3 lines and clear
            process.stdout.write('\x1B[1B\x1B[2K'); // Move down 1 and clear
            process.stdout.write('\x1B[1B\x1B[2K'); // Move down 1 and clear
            process.stdout.write('\r'); // Return to start
            console.log(chalk.green('>') + ' ' + input);
          } else {
            console.log();
          }
          console.log();

          if (stream) {
            // Streaming response (TODO: implement streaming)
            console.log(chalk.blue('•') + ' ');
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
            const spinnerFn = useEnhancedUI ? withEnhancedSpinner : withSpinner;
            const spinnerOptions = useEnhancedUI
              ? {
                  successText: '',
                  showStream: true,
                  showTimer: true,
                }
              : {
                  successText: '',
                };

            const response = await spinnerFn(
              'Thinking',
              () =>
                client.chat(input, {
                  model,
                  temperature,
                  maxTokens,
                  includeHistory: useHistory,
                  systemPrompt: options.system,
                }),
              spinnerOptions
            );

            process.stdout.write(chalk.blue('•') + ' ');
            console.log(response.message);

            // Show tool usage if any
            if (response.toolCalls && response.toolCalls.length > 0) {
              console.log();
              console.log(chalk.dim('Tool calls:'));
              for (const toolCall of response.toolCalls) {
                const argsSummary =
                  Object.keys(toolCall.arguments || {}).length > 0
                    ? chalk.dim(` with ${Object.keys(toolCall.arguments).length} args`)
                    : '';
                console.log(chalk.dim(`  › ${toolCall.toolName}${argsSummary}`));
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
                      maxLength: 100,
                    }
                  );
                  if (formatted) {
                    const lines = formatted.split('\n');
                    const preview =
                      lines[0].length > 80 ? lines[0].substring(0, 77) + '...' : lines[0];
                    console.log(chalk.dim(`    result: ${preview}`));
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

        // Show input box again if using boxed mode
        if (useBoxed) {
          console.log();
          InputBox.showLightInput();
        }

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

function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export default chatCommand;
