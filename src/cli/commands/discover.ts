import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { ConfigManager } from '../config/ConfigManager';
import { ServerConfig } from '../config/ConfigSchema';
import { withSpinner } from '../utils/spinners';
import { formatSuccess, formatWarning, formatError, formatTable } from '../utils/formatters';

const discoverCommand = new Command('discover')
  .description('Discover available MCP servers')
  .option('--scan-npm', 'scan for MCP servers in npm packages')
  .option('--scan-path <path>', 'scan a specific directory for MCP servers')
  .option('--registry <file>', 'path to server registry file')
  .option('--save', 'save discovered servers to configuration')
  .action(async (options, command) => {
    const configManager: ConfigManager = command.parent.configManager;
    const config = configManager.get();
    const colors = config.output?.colors !== false;

    try {
      const discovered: ServerConfig[] = [];

      // Scan npm packages
      if (options.scanNpm) {
        const npmServers = await scanNpmPackages();
        discovered.push(...npmServers);
      }

      // Scan specific path
      if (options.scanPath) {
        const pathServers = await scanDirectory(options.scanPath);
        discovered.push(...pathServers);
      }

      // Load from registry
      const registryPath = options.registry || config.discovery?.registryFile;
      if (registryPath) {
        const registryServers = await loadRegistry(registryPath);
        discovered.push(...registryServers);
      }

      // Default: scan common locations
      if (!options.scanNpm && !options.scanPath && !registryPath) {
        const defaultServers = await discoverDefaultServers();
        discovered.push(...defaultServers);
      }

      if (discovered.length === 0) {
        console.log(formatWarning('No MCP servers discovered', { colors }));
        console.log(chalk.dim('\nTry installing an MCP server:'));
        console.log(chalk.dim('  npm install -g @modelcontextprotocol/server-filesystem'));
        console.log(chalk.dim('  npm install -g @modelcontextprotocol/server-github'));
        return;
      }

      // Remove duplicates
      const unique = discovered.filter(
        (server, index, self) => index === self.findIndex((s) => s.name === server.name)
      );

      console.log(chalk.bold(`Discovered ${unique.length} MCP server(s):\n`));

      const headers = ['Name', 'Type', 'Command/URL'];
      const rows = unique.map((s) => [
        s.name,
        s.type.toUpperCase(),
        s.type === 'stdio' ? s.stdio?.command || '-' : s.http?.url || s.sse?.url || '-',
      ]);
      console.log(formatTable(headers, rows, { colors }));

      if (options.save) {
        console.log();
        for (const server of unique) {
          const existing = configManager.getServer(server.name);
          if (!existing) {
            configManager.addServer(server);
            console.log(formatSuccess(`Added ${server.name} to configuration`, { colors }));
          } else {
            console.log(chalk.dim(`${server.name} already exists in configuration`));
          }
        }
        await configManager.save();
        console.log(formatSuccess('Configuration saved', { colors }));
      } else {
        console.log(chalk.dim('\nUse --save to add these servers to your configuration'));
      }
    } catch (error) {
      console.error(formatError(error as Error, { colors }));
      process.exit(1);
    }
  });

async function scanNpmPackages(): Promise<ServerConfig[]> {
  const servers: ServerConfig[] = [];

  try {
    // Get global npm packages
    const globalPackages = await withSpinner(
      'Scanning global npm packages...',
      async () => {
        try {
          const result = execSync('npm list -g --depth=0 --json', { encoding: 'utf-8' });
          return JSON.parse(result);
        } catch {
          return { dependencies: {} };
        }
      },
      { successText: 'Scanned npm packages' }
    );

    // Look for MCP server packages
    const mcpPackages = Object.keys(globalPackages.dependencies || {}).filter(
      (pkg) => pkg.includes('mcp') || pkg.includes('model-context-protocol')
    );

    for (const pkg of mcpPackages) {
      // Try to get package info
      try {
        const pkgPath = execSync(`npm root -g`, { encoding: 'utf-8' }).trim();
        const packageJsonPath = path.join(pkgPath, pkg, 'package.json');

        if (fs.existsSync(packageJsonPath)) {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

          if (packageJson.bin) {
            // Package has executable
            const binName =
              typeof packageJson.bin === 'string' ? pkg : Object.keys(packageJson.bin)[0];

            servers.push({
              name: pkg.replace('@', '').replace('/', '-'),
              type: 'stdio',
              stdio: {
                command: binName,
                args: [],
              },
            });
          }
        }
      } catch {
        // Ignore errors for individual packages
      }
    }
  } catch {
    // npm not available or other error
  }

  return servers;
}

async function scanDirectory(dirPath: string): Promise<ServerConfig[]> {
  const servers: ServerConfig[] = [];

  try {
    const files = await withSpinner(`Scanning ${dirPath}...`, async () => fs.readdirSync(dirPath), {
      successText: `Scanned ${dirPath}`,
    });

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);

      if (stat.isFile()) {
        // Check if it's an MCP server
        if (file.includes('mcp') || file.includes('server')) {
          // Check if executable
          try {
            fs.accessSync(filePath, fs.constants.X_OK);
            servers.push({
              name: path.basename(file, path.extname(file)),
              type: 'stdio',
              stdio: {
                command: filePath,
                args: [],
              },
            });
          } catch {
            // Not executable, might be a Node.js script
            if (file.endsWith('.js') || file.endsWith('.mjs')) {
              servers.push({
                name: path.basename(file, path.extname(file)),
                type: 'stdio',
                stdio: {
                  command: 'node',
                  args: [filePath],
                },
              });
            }
          }
        }
      }
    }
  } catch {
    // Directory doesn't exist or not readable
  }

  return servers;
}

async function loadRegistry(registryPath: string): Promise<ServerConfig[]> {
  try {
    const content = await fs.promises.readFile(registryPath, 'utf-8');
    const registry = JSON.parse(content);

    if (Array.isArray(registry)) {
      return registry.filter((s) => s.name && s.type);
    }

    return [];
  } catch {
    return [];
  }
}

async function discoverDefaultServers(): Promise<ServerConfig[]> {
  const servers: ServerConfig[] = [];

  // Check for common MCP servers
  const commonServers = [
    {
      name: 'mcp-server-filesystem',
      command: 'mcp-server-filesystem',
      description: 'Filesystem MCP server',
    },
    {
      name: 'mcp-server-github',
      command: 'mcp-server-github',
      description: 'GitHub MCP server',
    },
    {
      name: 'mcp-server-git',
      command: 'mcp-server-git',
      description: 'Git MCP server',
    },
    {
      name: 'mcp-server-slack',
      command: 'mcp-server-slack',
      description: 'Slack MCP server',
    },
    {
      name: 'mcp-server-postgres',
      command: 'mcp-server-postgres',
      description: 'PostgreSQL MCP server',
    },
  ];

  for (const server of commonServers) {
    // Check if command exists
    try {
      execSync(`which ${server.command}`, { stdio: 'ignore' });
      servers.push({
        name: server.name,
        type: 'stdio',
        stdio: {
          command: server.command,
          args: [],
        },
      });
    } catch {
      // Command not found
    }
  }

  // Check for local example server
  const exampleServerPath = path.join(process.cwd(), 'examples', 'example-mcp-server.js');
  if (fs.existsSync(exampleServerPath)) {
    servers.push({
      name: 'example-mcp-server',
      type: 'stdio',
      stdio: {
        command: 'node',
        args: [exampleServerPath],
      },
    });
  }

  return servers;
}

export default discoverCommand;
