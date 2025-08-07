import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { OllamaMCPClient } from '../../client/OllamaMCPClient';
import { ConfigManager } from '../config/ConfigManager';
import { serverConfigToConnectionOptions, ServerConfig } from '../config/ConfigSchema';
import { withSpinner } from '../utils/spinners';
import { formatSuccess, formatError, formatInfo } from '../utils/formatters';
import { validateUrl, validateCommand, parseArguments, parseKeyValue } from '../utils/validators';

const connectCommand = new Command('connect')
  .description('Connect to an MCP server')
  .argument('[server]', 'server name from config or "new" to add a new server')
  .option('-t, --type <type>', 'server type (stdio, http, sse)', 'stdio')
  .option('-c, --command <cmd>', 'command for stdio server')
  .option('-a, --args <args>', 'arguments for stdio server (comma-separated or JSON array)')
  .option('-u, --url <url>', 'URL for http/sse server')
  .option('-H, --headers <headers>', 'headers for http/sse server (key=value,key2=value2)')
  .option('--auth <token>', 'authentication token for http/sse server')
  .option('--save', 'save server configuration')
  .option('--auto-connect', 'automatically connect to this server on startup')
  .action(async (serverName, options, command) => {
    const configManager: ConfigManager = command.parent.configManager;
    const config = configManager.get();
    const colors = config.output?.colors !== false;

    try {
      let serverConfig: ServerConfig | undefined;

      if (!serverName || serverName === 'new') {
        // Interactive mode to create new server
        serverConfig = await promptForServerConfig(colors);

        if (options.save || serverConfig.autoConnect) {
          configManager.addServer(serverConfig);
          await configManager.save();
          console.log(
            formatSuccess(`Server "${serverConfig.name}" saved to configuration`, { colors })
          );
        }
      } else {
        // Try to get server from config
        serverConfig = configManager.getServer(serverName);

        if (!serverConfig) {
          // Create server config from command line options
          if (options.type === 'stdio' && !options.command) {
            throw new Error('Command is required for stdio server');
          }
          if ((options.type === 'http' || options.type === 'sse') && !options.url) {
            throw new Error('URL is required for http/sse server');
          }

          serverConfig = createServerConfigFromOptions(serverName, options);

          if (options.save) {
            configManager.addServer(serverConfig);
            await configManager.save();
            console.log(
              formatSuccess(`Server "${serverConfig.name}" saved to configuration`, { colors })
            );
          }
        }
      }

      // Connect to the server
      console.log(formatInfo(`Connecting to ${serverConfig.name}...`, { colors }));

      const client = new OllamaMCPClient(config);
      const connectionOptions = serverConfigToConnectionOptions(serverConfig);

      const serverId = await withSpinner(
        `Connecting to ${serverConfig.name}...`,
        () => client.connectToServer(connectionOptions),
        {
          successText: `Connected to ${serverConfig.name}`,
          failText: (error) => `Failed to connect: ${error.message}`,
        }
      );

      // List available capabilities
      const [tools, resources, prompts] = await Promise.all([
        client.listTools(serverId),
        client.listResources(serverId),
        client.listPrompts(serverId),
      ]);

      console.log();
      console.log(chalk.bold('Server Capabilities:'));
      console.log(`  Tools: ${chalk.cyan(tools.length)}`);
      console.log(`  Resources: ${chalk.green(resources.length)}`);
      console.log(`  Prompts: ${chalk.magenta(prompts.length)}`);
      console.log();
      console.log(formatSuccess(`Successfully connected to ${serverConfig.name}`, { colors }));

      // Store client globally for other commands
      (global as Record<string, unknown>).mcpClient = client;
      (global as Record<string, unknown>).currentServerId = serverId;
    } catch (error) {
      console.error(formatError(error as Error, { colors }));
      process.exit(1);
    }
  });

async function promptForServerConfig(_colors: boolean): Promise<ServerConfig> {
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
      choices: [
        { name: 'Stdio (local process)', value: 'stdio' },
        { name: 'HTTP (remote server)', value: 'http' },
        { name: 'SSE (server-sent events)', value: 'sse' },
      ],
    },
    {
      type: 'input',
      name: 'command',
      message: 'Command to run:',
      when: (answers) => answers.type === 'stdio',
      validate: (input) => validateCommand(input) || 'Invalid command',
    },
    {
      type: 'input',
      name: 'args',
      message: 'Command arguments (optional, space-separated):',
      when: (answers) => answers.type === 'stdio',
      filter: (input) => parseArguments(input) || [],
    },
    {
      type: 'input',
      name: 'url',
      message: 'Server URL:',
      when: (answers) => answers.type === 'http' || answers.type === 'sse',
      validate: (input) => validateUrl(input) || 'Invalid URL',
    },
    {
      type: 'input',
      name: 'authToken',
      message: 'Authentication token (optional):',
      when: (answers) => answers.type === 'http' || answers.type === 'sse',
    },
    {
      type: 'confirm',
      name: 'autoConnect',
      message: 'Auto-connect on startup?',
      default: false,
    },
  ]);

  const config: ServerConfig = {
    name: answers.name,
    type: answers.type,
    autoConnect: answers.autoConnect,
  };

  if (answers.type === 'stdio') {
    config.stdio = {
      command: answers.command,
      args: answers.args,
    };
  } else if (answers.type === 'http') {
    config.http = {
      url: answers.url,
      authToken: answers.authToken,
    };
  } else if (answers.type === 'sse') {
    config.sse = {
      url: answers.url,
    };
  }

  return config;
}

function createServerConfigFromOptions(
  name: string,
  options: Record<string, unknown>
): ServerConfig {
  const config: ServerConfig = {
    name,
    type: options.type as 'stdio' | 'http' | 'sse',
    autoConnect: (options.autoConnect as boolean) || false,
  };

  if (options.type === 'stdio') {
    const args = options.args ? parseArguments(options.args as string) : undefined;
    config.stdio = {
      command: options.command as string,
      args: args || undefined,
    };
  } else if (options.type === 'http') {
    const headers = options.headers ? parseKeyValue(options.headers as string) : undefined;
    config.http = {
      url: options.url as string,
      headers: headers || undefined,
      authToken: options.auth as string | undefined,
    };
  } else if (options.type === 'sse') {
    const headers = options.headers ? parseKeyValue(options.headers as string) : undefined;
    config.sse = {
      url: options.url as string,
      headers: headers || undefined,
    };
  }

  return config;
}

export default connectCommand;
