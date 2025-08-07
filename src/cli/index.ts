#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'path';
import { promises as fs } from 'fs';
import { ConfigManager } from './config/ConfigManager';
import { SpinnerManager } from './utils/spinners';
import { formatError, formatInfo } from './utils/formatters';
import connectCommand from './commands/connect';
import chatCommand from './commands/chat';
import listCommand from './commands/list';
import discoverCommand from './commands/discover';
import configCommand from './commands/config';

// Read package.json for version
async function getVersion(): Promise<string> {
  try {
    const packagePath = path.join(__dirname, '../../package.json');
    const packageContent = await fs.readFile(packagePath, 'utf-8');
    const packageJson = JSON.parse(packageContent);
    return packageJson.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

async function main() {
  const program = new Command();
  const configManager = new ConfigManager();
  const spinner = SpinnerManager.getInstance();

  // Set version
  const version = await getVersion();

  program
    .name('ollama-mcp')
    .description(chalk.bold('Ollama MCP Client - Local AI-powered Model Context Protocol client'))
    .version(version)
    .option('-c, --config <path>', 'path to configuration file')
    .option('-d, --debug', 'enable debug mode with verbose logging')
    .option('-j, --json', 'output in JSON format')
    .option('-y, --yaml', 'output in YAML format')
    .option('--no-colors', 'disable colored output')
    .hook('preAction', async (thisCommand) => {
      // Load configuration before any command
      const options = thisCommand.opts();

      // Set verbose mode for spinner
      if (options.debug) {
        spinner.setVerbose(true);
      }

      try {
        await configManager.load(options.config);

        // Apply global options to config
        if (options.debug) {
          configManager.update('logging.level', 'debug');
        }
        if (options.json) {
          configManager.update('output.format', 'json');
        }
        if (options.yaml) {
          configManager.update('output.format', 'yaml');
        }
        if (options.colors === false) {
          configManager.update('output.colors', false);
        }

        // Store config in command context
        (thisCommand as Command & { configManager?: ConfigManager }).configManager = configManager;
      } catch (error) {
        if (options.debug) {
          console.error(formatError(error as Error, { colors: options.colors !== false }));
        }
        // Continue with default config if loading fails
        (thisCommand as Command & { configManager?: ConfigManager }).configManager = configManager;
      }
    });

  // Add commands
  program.addCommand(connectCommand);
  program.addCommand(chatCommand);
  program.addCommand(listCommand);
  program.addCommand(discoverCommand);
  program.addCommand(configCommand);

  // Interactive mode (default when no command is provided)
  program.action(async () => {
    const options = program.opts();
    console.log(chalk.bold.cyan('🤖 Ollama MCP Client'));
    console.log(chalk.dim(`Version ${version}`));
    console.log();

    // Check if Ollama is running
    try {
      const { OllamaClient } = await import('../ollama/OllamaClient');
      const ollamaConfig = configManager.get().ollama;
      const client = new OllamaClient(ollamaConfig);

      spinner.start('Checking Ollama connection...');
      const modelsResponse = await client.listModels();
      const models = modelsResponse.models || [];
      spinner.succeed(`Connected to Ollama (${models.length} models available)`);
    } catch {
      spinner.fail('Could not connect to Ollama');
      console.log(
        formatInfo('Make sure Ollama is running: ollama serve', {
          colors: options.colors !== false,
        })
      );
    }

    console.log();
    console.log('Starting interactive mode...');
    console.log(chalk.dim('Type "help" for available commands or "exit" to quit'));
    console.log();

    // Start interactive session
    const { InteractiveSession } = await import('./interactive/InteractiveSession');
    const session = new InteractiveSession(configManager);
    await session.start();
  });

  // Error handling
  program.exitOverride();

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    const err = error as Error & { exitCode?: number };
    if (err.exitCode === 0) {
      // Normal exit (help, version, etc.)
      process.exit(0);
    } else {
      console.error(formatError(err, { colors: process.stdout.isTTY }));
      process.exit(1);
    }
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (reason) => {
  console.error(chalk.red('Unhandled error:'), reason);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n' + chalk.dim('Interrupted by user'));
  process.exit(0);
});

// Run the CLI
main().catch((error) => {
  console.error(formatError(error, { colors: process.stdout.isTTY }));
  process.exit(1);
});

// Export for testing
export { main };
