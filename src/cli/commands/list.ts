import { Command } from 'commander';
import chalk from 'chalk';
import * as yaml from 'yaml';
import { OllamaMCPClient } from '../../client/OllamaMCPClient';
import { ConfigManager } from '../config/ConfigManager';
import { withSpinner } from '../utils/spinners';
import {
  formatTool,
  formatResource,
  formatPrompt,
  formatTable,
  formatError,
  formatWarning,
} from '../utils/formatters';

const listCommand = new Command('list')
  .description('List available tools, resources, or prompts from connected MCP servers')
  .argument('<type>', 'what to list (tools, resources, prompts, servers, models)')
  .option('-s, --server <id>', 'filter by server ID')
  .option('-f, --format <format>', 'output format (pretty, json, yaml, table)', 'pretty')
  .option('--detailed', 'show detailed information')
  .action(async (type, options, command) => {
    const configManager: ConfigManager = command.parent.configManager;
    const config = configManager.get();
    const colors = config.output?.colors !== false;
    const format = options.format || config.output?.format || 'pretty';

    try {
      switch (type.toLowerCase()) {
        case 'tools':
          await listTools(options, config as Record<string, unknown>, colors, format);
          break;
        case 'resources':
          await listResources(options, config as Record<string, unknown>, colors, format);
          break;
        case 'prompts':
          await listPrompts(options, config as Record<string, unknown>, colors, format);
          break;
        case 'servers':
          await listServers(configManager, colors, format);
          break;
        case 'models':
          await listModels(config as Record<string, unknown>, colors, format);
          break;
        default:
          throw new Error(
            `Unknown type: ${type}. Valid types are: tools, resources, prompts, servers, models`
          );
      }
    } catch (error) {
      console.error(formatError(error as Error, { colors }));
      process.exit(1);
    }
  });

async function listTools(
  options: Record<string, unknown>,
  _config: Record<string, unknown>,
  colors: boolean,
  format: string
) {
  const client = (global as Record<string, unknown>).mcpClient as OllamaMCPClient | undefined;

  if (!client) {
    console.log(
      formatWarning('No MCP client connected. Use "ollama-mcp connect" first.', { colors })
    );
    return;
  }

  const tools = await withSpinner(
    'Fetching tools...',
    () => client.listTools(options.server as string | undefined),
    { successText: '' }
  );

  if (tools.length === 0) {
    console.log(formatWarning('No tools available', { colors }));
    return;
  }

  if (format === 'json') {
    console.log(JSON.stringify(tools, null, 2));
  } else if (format === 'yaml') {
    console.log(yaml.stringify(tools));
  } else if (format === 'table') {
    const headers = ['Name', 'Description'];
    const rows = tools.map((t) => [t.name, t.description || 'No description']);
    console.log(formatTable(headers, rows, { colors }));
  } else {
    console.log(chalk.bold(`Found ${tools.length} tool(s):\n`));
    for (const tool of tools) {
      console.log(
        formatTool(tool, {
          colors,
          format: 'pretty',
          truncate: !options.detailed,
        })
      );
      console.log();
    }
  }
}

async function listResources(
  options: Record<string, unknown>,
  _config: Record<string, unknown>,
  colors: boolean,
  format: string
) {
  const client = (global as Record<string, unknown>).mcpClient as OllamaMCPClient | undefined;

  if (!client) {
    console.log(
      formatWarning('No MCP client connected. Use "ollama-mcp connect" first.', { colors })
    );
    return;
  }

  const resources = await withSpinner(
    'Fetching resources...',
    () => client.listResources(options.server as string | undefined),
    { successText: '' }
  );

  if (resources.length === 0) {
    console.log(formatWarning('No resources available', { colors }));
    return;
  }

  if (format === 'json') {
    console.log(JSON.stringify(resources, null, 2));
  } else if (format === 'yaml') {
    console.log(yaml.stringify(resources));
  } else if (format === 'table') {
    const headers = ['URI', 'Name', 'Type'];
    const rows = resources.map((r) => [r.uri, r.name || '-', r.mimeType || '-']);
    console.log(formatTable(headers, rows, { colors }));
  } else {
    console.log(chalk.bold(`Found ${resources.length} resource(s):\n`));
    for (const resource of resources) {
      console.log(
        formatResource(resource, {
          colors,
          format: 'pretty',
          truncate: !options.detailed,
        })
      );
      console.log();
    }
  }
}

async function listPrompts(
  options: Record<string, unknown>,
  _config: Record<string, unknown>,
  colors: boolean,
  format: string
) {
  const client = (global as Record<string, unknown>).mcpClient as OllamaMCPClient | undefined;

  if (!client) {
    console.log(
      formatWarning('No MCP client connected. Use "ollama-mcp connect" first.', { colors })
    );
    return;
  }

  const prompts = await withSpinner(
    'Fetching prompts...',
    () => client.listPrompts(options.server as string | undefined),
    { successText: '' }
  );

  if (prompts.length === 0) {
    console.log(formatWarning('No prompts available', { colors }));
    return;
  }

  if (format === 'json') {
    console.log(JSON.stringify(prompts, null, 2));
  } else if (format === 'yaml') {
    console.log(yaml.stringify(prompts));
  } else if (format === 'table') {
    const headers = ['Name', 'Description', 'Arguments'];
    const rows = prompts.map((p) => [
      p.name,
      p.description || '-',
      p.arguments?.length ? `${p.arguments.length} arg(s)` : 'None',
    ]);
    console.log(formatTable(headers, rows, { colors }));
  } else {
    console.log(chalk.bold(`Found ${prompts.length} prompt(s):\n`));
    for (const prompt of prompts) {
      console.log(
        formatPrompt(prompt, {
          colors,
          format: 'pretty',
          truncate: !options.detailed,
        })
      );
      console.log();
    }
  }
}

async function listServers(configManager: ConfigManager, colors: boolean, format: string) {
  const servers = configManager.listServers();
  const client = (global as Record<string, unknown>).mcpClient as OllamaMCPClient | undefined;
  const connectedServers = client ? client.getConnectedServers() : [];

  if (servers.length === 0) {
    console.log(formatWarning('No servers configured', { colors }));
    return;
  }

  if (format === 'json') {
    console.log(JSON.stringify(servers, null, 2));
  } else if (format === 'yaml') {
    console.log(yaml.stringify(servers));
  } else if (format === 'table') {
    const headers = ['Name', 'Type', 'Auto-Connect', 'Status'];
    const rows = servers.map((s) => {
      const isConnected = connectedServers.some(
        (cs) =>
          cs.serverName === s.name ||
          (s.type === 'stdio' && cs.serverName === s.stdio?.command) ||
          ((s.type === 'http' || s.type === 'sse') &&
            (cs.serverName === s.http?.url || cs.serverName === s.sse?.url))
      );
      return [
        s.name,
        s.type.toUpperCase(),
        s.autoConnect ? 'Yes' : 'No',
        isConnected ? chalk.green('Connected') : chalk.gray('Disconnected'),
      ];
    });
    console.log(formatTable(headers, rows, { colors }));
  } else {
    console.log(chalk.bold(`Found ${servers.length} server(s):\n`));
    for (const server of servers) {
      const isConnected = connectedServers.some(
        (cs) =>
          cs.serverName === server.name ||
          (server.type === 'stdio' && cs.serverName === server.stdio?.command) ||
          ((server.type === 'http' || server.type === 'sse') &&
            (cs.serverName === server.http?.url || cs.serverName === server.sse?.url))
      );

      const status = isConnected ? chalk.green('● Connected') : chalk.gray('○ Disconnected');
      console.log(`${status} ${chalk.bold(server.name)} (${server.type})`);

      if (server.type === 'stdio') {
        console.log(`  Command: ${server.stdio?.command}`);
        if (server.stdio?.args) {
          console.log(`  Args: ${server.stdio.args.join(' ')}`);
        }
      } else if (server.type === 'http' || server.type === 'sse') {
        const url = server.http?.url || server.sse?.url;
        console.log(`  URL: ${url}`);
      }

      if (server.autoConnect) {
        console.log(`  ${chalk.dim('Auto-connect enabled')}`);
      }
      console.log();
    }
  }
}

async function listModels(config: Record<string, unknown>, colors: boolean, format: string) {
  const { OllamaClient } = await import('../../ollama/OllamaClient');
  const ollamaConfig = config.ollama as Record<string, unknown> | undefined;
  const client = new OllamaClient(ollamaConfig);

  const modelsResponse = await withSpinner('Fetching Ollama models...', () => client.listModels(), {
    successText: '',
  });

  const models = modelsResponse.models || [];

  if (models.length === 0) {
    console.log(
      formatWarning('No models available. Pull a model with: ollama pull <model>', { colors })
    );
    return;
  }

  if (format === 'json') {
    console.log(JSON.stringify(models, null, 2));
  } else if (format === 'yaml') {
    console.log(yaml.stringify(models));
  } else if (format === 'table') {
    const headers = ['Name', 'Size', 'Modified'];
    const rows = models.map((m) => [
      m.name,
      formatSize(m.size),
      new Date(m.modified_at).toLocaleDateString(),
    ]);
    console.log(formatTable(headers, rows, { colors }));
  } else {
    console.log(chalk.bold(`Found ${models.length} model(s):\n`));
    for (const model of models) {
      console.log(`${chalk.bold.cyan(model.name)}`);
      console.log(`  Size: ${formatSize(model.size)}`);
      console.log(`  Modified: ${new Date(model.modified_at).toLocaleString()}`);
      if (model.details?.family) {
        console.log(`  Family: ${model.details.family}`);
      }
      if (model.details?.parameter_size) {
        console.log(`  Parameters: ${model.details.parameter_size}`);
      }
      console.log();
    }
  }
}

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

export default listCommand;
