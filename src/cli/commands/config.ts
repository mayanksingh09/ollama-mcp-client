import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { ConfigManager } from '../config/ConfigManager';
import { formatSuccess, formatError, formatWarning } from '../utils/formatters';
import { expandPath } from '../utils/validators';

const configCommand = new Command('config')
  .description('Manage CLI configuration')
  .addCommand(
    new Command('show')
      .description('Show current configuration')
      .option('-p, --path', 'show configuration file path')
      .action(async (options, command) => {
        const configManager: ConfigManager = command.parent.parent.configManager;
        const config = configManager.get();
        const colors = config.output?.colors !== false;

        if (options.path) {
          const configPath = (configManager as { configPath?: string } & ConfigManager).configPath;
          if (configPath) {
            console.log(chalk.bold('Configuration file:'));
            console.log(configPath);
          } else {
            console.log(formatWarning('No configuration file loaded (using defaults)', { colors }));
          }
        } else {
          const output = await configManager.exportConfig(
            config.output?.format === 'json' ? 'json' : 'yaml'
          );
          console.log(output);
        }
      })
  )
  .addCommand(
    new Command('set')
      .description('Set a configuration value')
      .argument('<key>', 'configuration key (e.g., ollama.model)')
      .argument('<value>', 'configuration value')
      .action(async (key, value, _options, command) => {
        const configManager: ConfigManager = command.parent.parent.configManager;
        const config = configManager.get();
        const colors = config.output?.colors !== false;

        try {
          // Parse value if it looks like JSON
          let parsedValue: unknown = value;
          if (value === 'true') parsedValue = true;
          else if (value === 'false') parsedValue = false;
          else if (!isNaN(Number(value))) parsedValue = Number(value);
          else if (value.startsWith('[') || value.startsWith('{')) {
            try {
              parsedValue = JSON.parse(value);
            } catch {
              parsedValue = value;
            }
          }

          configManager.update(key, parsedValue);
          await configManager.save();
          console.log(formatSuccess(`Set ${key} = ${JSON.stringify(parsedValue)}`, { colors }));
        } catch (error) {
          console.error(formatError(error as Error, { colors }));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('get')
      .description('Get a configuration value')
      .argument('<key>', 'configuration key (e.g., ollama.model)')
      .action(async (key, _options, command) => {
        const configManager: ConfigManager = command.parent.parent.configManager;
        const config = configManager.get();
        const colors = config.output?.colors !== false;

        const keys = key.split('.');
        let value: unknown = config;

        for (const k of keys) {
          if (value && typeof value === 'object' && k in value) {
            value = (value as Record<string, unknown>)[k];
          } else {
            console.log(formatWarning(`Key not found: ${key}`, { colors }));
            return;
          }
        }

        console.log(JSON.stringify(value, null, 2));
      })
  )
  .addCommand(
    new Command('init')
      .description('Initialize a new configuration file')
      .option('-i, --interactive', 'interactive configuration')
      .action(async (options, command) => {
        const configManager: ConfigManager = command.parent.parent.configManager;
        const config = configManager.get();
        const colors = config.output?.colors !== false;

        try {
          let newConfig: Record<string, unknown> = {};

          if (options.interactive) {
            // Interactive configuration
            const answers = await inquirer.prompt([
              {
                type: 'input',
                name: 'ollama.host',
                message: 'Ollama host:',
                default: 'http://localhost:11434',
              },
              {
                type: 'input',
                name: 'ollama.model',
                message: 'Default Ollama model:',
                default: undefined,
              },
              {
                type: 'list',
                name: 'logging.level',
                message: 'Logging level:',
                choices: ['error', 'warn', 'info', 'debug', 'verbose'],
                default: 'info',
              },
              {
                type: 'confirm',
                name: 'session.persist',
                message: 'Persist sessions?',
                default: true,
              },
              {
                type: 'input',
                name: 'session.storagePath',
                message: 'Session storage path:',
                default: '~/.ollama-mcp/sessions',
                filter: expandPath,
              },
              {
                type: 'list',
                name: 'output.format',
                message: 'Default output format:',
                choices: ['pretty', 'json', 'yaml'],
                default: 'pretty',
              },
              {
                type: 'confirm',
                name: 'output.colors',
                message: 'Enable colored output?',
                default: true,
              },
            ]);

            // Convert flat answers to nested config
            for (const [key, value] of Object.entries(answers)) {
              const keys = key.split('.');
              let current = newConfig;

              for (let i = 0; i < keys.length - 1; i++) {
                if (!current[keys[i]]) {
                  current[keys[i]] = {};
                }
                current = current[keys[i]] as Record<string, unknown>;
              }

              current[keys[keys.length - 1]] = value;
            }
          } else {
            // Use default config
            newConfig = {
              ollama: {
                host: 'http://localhost:11434',
                model: undefined,
              },
              logging: {
                level: 'info',
              },
              session: {
                persist: true,
                storagePath: expandPath('~/.ollama-mcp/sessions'),
              },
              output: {
                format: 'pretty',
                colors: true,
              },
            };
          }

          // Save configuration
          const configPath = path.join(process.cwd(), 'ollama-mcp.config.yaml');
          const configContent = yaml.stringify(newConfig);
          await fs.promises.writeFile(configPath, configContent, 'utf-8');

          console.log(formatSuccess(`Configuration file created: ${configPath}`, { colors }));
          console.log(chalk.dim('\nYou can now add MCP servers to the configuration.'));
          console.log(chalk.dim('Use: ollama-mcp config add-server'));
        } catch (error) {
          console.error(formatError(error as Error, { colors }));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('add-server')
      .description('Add a server to configuration')
      .action(async (_options, command) => {
        const configManager: ConfigManager = command.parent.parent.configManager;
        const config = configManager.get();
        const colors = config.output?.colors !== false;

        try {
          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'name',
              message: 'Server name:',
              validate: (input) => input.length > 0 || 'Server name is required',
            },
            {
              type: 'list',
              name: 'type',
              message: 'Server type:',
              choices: ['stdio', 'http', 'sse'],
            },
            {
              type: 'input',
              name: 'command',
              message: 'Command:',
              when: (answers) => answers.type === 'stdio',
              validate: (input) => input.length > 0 || 'Command is required',
            },
            {
              type: 'input',
              name: 'args',
              message: 'Arguments (space-separated, optional):',
              when: (answers) => answers.type === 'stdio',
              filter: (input) => (input ? input.split(' ') : []),
            },
            {
              type: 'input',
              name: 'url',
              message: 'Server URL:',
              when: (answers) => answers.type === 'http' || answers.type === 'sse',
              validate: (input) => input.startsWith('http') || 'URL must start with http or https',
            },
            {
              type: 'confirm',
              name: 'autoConnect',
              message: 'Auto-connect on startup?',
              default: false,
            },
          ]);

          const serverConfig: Record<string, unknown> = {
            name: answers.name,
            type: answers.type,
            autoConnect: answers.autoConnect,
          };

          if (answers.type === 'stdio') {
            serverConfig.stdio = {
              command: answers.command,
              args: answers.args || [],
            };
          } else if (answers.type === 'http') {
            serverConfig.http = {
              url: answers.url,
            };
          } else if (answers.type === 'sse') {
            serverConfig.sse = {
              url: answers.url,
            };
          }

          configManager.addServer(
            serverConfig as unknown as import('../config/ConfigSchema').ServerConfig
          );
          await configManager.save();
          console.log(formatSuccess(`Server "${answers.name}" added to configuration`, { colors }));
        } catch (error) {
          console.error(formatError(error as Error, { colors }));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('remove-server')
      .description('Remove a server from configuration')
      .argument('<name>', 'server name')
      .action(async (name, _options, command) => {
        const configManager: ConfigManager = command.parent.parent.configManager;
        const config = configManager.get();
        const colors = config.output?.colors !== false;

        if (configManager.removeServer(name)) {
          await configManager.save();
          console.log(formatSuccess(`Server "${name}" removed from configuration`, { colors }));
        } else {
          console.log(formatWarning(`Server "${name}" not found`, { colors }));
        }
      })
  );

export default configCommand;
