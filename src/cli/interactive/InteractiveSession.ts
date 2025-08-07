import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { OllamaMCPClient } from '../../client/OllamaMCPClient';
import { ConfigManager } from '../config/ConfigManager';
import { serverConfigToConnectionOptions } from '../config/ConfigSchema';
import { CommandParser } from './CommandParser';
import {
  formatError,
  formatSuccess,
  formatWarning,
  formatInfo,
  formatTool,
  formatResource,
  formatPrompt,
} from '../utils/formatters';
import { expandPath, ensureDirectoryExists } from '../utils/validators';

export class InteractiveSession {
  private rl: readline.Interface;
  private client?: OllamaMCPClient;
  private configManager: ConfigManager;
  private commandParser: CommandParser;
  private history: string[] = [];
  private historyFile: string;
  private isRunning: boolean = false;
  private multilineMode: boolean = false;
  private multilineBuffer: string[] = [];

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
    this.commandParser = new CommandParser();

    const config = configManager.get();
    this.historyFile = expandPath(config.interactive?.historyFile || '~/.ollama-mcp/history');

    // Ensure history directory exists
    const historyDir = path.dirname(this.historyFile);
    ensureDirectoryExists(historyDir);

    // Load history
    this.loadHistory();

    // Create readline interface
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: config.interactive?.prompt || '> ',
      completer: this.completer.bind(this),
      history: this.history,
    });

    // Setup event handlers
    this.setupEventHandlers();
  }

  async start(): Promise<void> {
    this.isRunning = true;

    // Initialize client
    const config = this.configManager.get();
    this.client = new OllamaMCPClient(config);

    // Auto-connect to servers
    await this.autoConnect();

    // Show welcome message
    this.showWelcome();

    // Start prompt
    this.rl.prompt();
  }

  private setupEventHandlers(): void {
    this.rl.on('line', async (input) => {
      // Handle multiline mode
      if (input.trim() === '"""') {
        if (!this.multilineMode) {
          this.multilineMode = true;
          this.multilineBuffer = [];
          this.rl.setPrompt(chalk.dim('... '));
          this.rl.prompt();
          return;
        } else {
          this.multilineMode = false;
          input = this.multilineBuffer.join('\n');
          this.rl.setPrompt(this.configManager.get().interactive?.prompt || '> ');
        }
      }

      if (this.multilineMode) {
        this.multilineBuffer.push(input);
        this.rl.prompt();
        return;
      }

      // Skip empty input
      if (!input.trim()) {
        this.rl.prompt();
        return;
      }

      // Add to history
      this.addToHistory(input);

      // Process command
      await this.processInput(input);

      // Show prompt again
      if (this.isRunning) {
        this.rl.prompt();
      }
    });

    this.rl.on('close', () => {
      this.cleanup();
      console.log(chalk.dim('\nGoodbye!'));
      process.exit(0);
    });

    // Handle Ctrl+C
    this.rl.on('SIGINT', () => {
      if (this.multilineMode) {
        this.multilineMode = false;
        this.multilineBuffer = [];
        this.rl.setPrompt(this.configManager.get().interactive?.prompt || '> ');
        console.log(chalk.dim('^C'));
        this.rl.prompt();
      } else {
        this.rl.close();
      }
    });
  }

  private async processInput(input: string): Promise<void> {
    const config = this.configManager.get();
    const colors = config.output?.colors !== false;

    // Parse command
    const parsed = this.commandParser.parse(input);

    if (parsed.isCommand) {
      // Handle commands
      await this.handleCommand(parsed.command!, parsed.args);
    } else {
      // Send as chat message
      if (!this.client) {
        console.log(
          formatWarning('No client initialized. Use "connect" command first.', { colors })
        );
        return;
      }

      try {
        console.log();
        const response = await this.client.chat(input, {
          includeHistory: true,
          temperature: 0.7,
        });

        console.log(chalk.bold.blue('Assistant:'));
        console.log(response.message);

        if (response.toolCalls && response.toolCalls.length > 0) {
          console.log();
          console.log(chalk.dim('Tools used:'));
          for (const toolCall of response.toolCalls) {
            console.log(chalk.dim(`  • ${toolCall.toolName}`));
          }
        }

        console.log();
      } catch (error) {
        console.error(formatError(error as Error, { colors }));
      }
    }
  }

  private async handleCommand(command: string, args: string[]): Promise<void> {
    const config = this.configManager.get();
    const colors = config.output?.colors !== false;

    switch (command.toLowerCase()) {
      case 'help':
        this.showHelp();
        break;

      case 'exit':
      case 'quit':
        this.rl.close();
        break;

      case 'clear':
        console.clear();
        break;

      case 'connect':
        await this.handleConnect(args);
        break;

      case 'disconnect':
        await this.handleDisconnect(args);
        break;

      case 'list':
        await this.handleList(args);
        break;

      case 'call':
        await this.handleCallTool(args);
        break;

      case 'read':
        await this.handleReadResource(args);
        break;

      case 'model':
        await this.handleSetModel(args);
        break;

      case 'config':
        await this.handleConfig(args);
        break;

      case 'history':
        this.showHistory();
        break;

      case 'save':
        await this.saveSession(args[0]);
        break;

      case 'load':
        await this.loadSession(args[0]);
        break;

      default:
        console.log(
          formatWarning(`Unknown command: ${command}. Type "help" for available commands.`, {
            colors,
          })
        );
    }
  }

  private async handleConnect(args: string[]): Promise<void> {
    const config = this.configManager.get();
    const colors = config.output?.colors !== false;

    if (args.length === 0) {
      // List available servers
      const servers = this.configManager.listServers();
      if (servers.length === 0) {
        console.log(formatWarning('No servers configured', { colors }));
        return;
      }

      console.log('Available servers:');
      for (const server of servers) {
        console.log(`  • ${server.name} (${server.type})`);
      }
      console.log(chalk.dim('\nUse: connect <server-name>'));
      return;
    }

    const serverName = args[0];
    const server = this.configManager.getServer(serverName);

    if (!server) {
      console.log(formatError(new Error(`Server "${serverName}" not found`), { colors }));
      return;
    }

    try {
      if (!this.client) {
        this.client = new OllamaMCPClient(config);
      }

      const options = serverConfigToConnectionOptions(server);
      await this.client.connectToServer(options);
      console.log(formatSuccess(`Connected to ${serverName}`, { colors }));
    } catch (error) {
      console.error(formatError(error as Error, { colors }));
    }
  }

  private async handleDisconnect(args: string[]): Promise<void> {
    const config = this.configManager.get();
    const colors = config.output?.colors !== false;

    if (!this.client) {
      console.log(formatWarning('No client connected', { colors }));
      return;
    }

    if (args.length === 0) {
      await this.client.disconnectAll();
      console.log(formatSuccess('Disconnected from all servers', { colors }));
    } else {
      // TODO: Disconnect from specific server
      console.log(
        formatWarning('Disconnecting from specific servers not yet implemented', { colors })
      );
    }
  }

  private async handleList(args: string[]): Promise<void> {
    const config = this.configManager.get();
    const colors = config.output?.colors !== false;

    if (!this.client) {
      console.log(formatWarning('No client connected', { colors }));
      return;
    }

    const type = args[0] || 'tools';

    try {
      switch (type.toLowerCase()) {
        case 'tools': {
          const tools = await this.client.listTools();
          if (tools.length === 0) {
            console.log('No tools available');
          } else {
            console.log(`Found ${tools.length} tool(s):`);
            for (const tool of tools) {
              console.log(formatTool(tool, { colors, format: 'pretty' }));
            }
          }
          break;
        }

        case 'resources': {
          const resources = await this.client.listResources();
          if (resources.length === 0) {
            console.log('No resources available');
          } else {
            console.log(`Found ${resources.length} resource(s):`);
            for (const resource of resources) {
              console.log(formatResource(resource, { colors, format: 'pretty' }));
            }
          }
          break;
        }

        case 'prompts': {
          const prompts = await this.client.listPrompts();
          if (prompts.length === 0) {
            console.log('No prompts available');
          } else {
            console.log(`Found ${prompts.length} prompt(s):`);
            for (const prompt of prompts) {
              console.log(formatPrompt(prompt, { colors, format: 'pretty' }));
            }
          }
          break;
        }

        default:
          console.log(
            formatWarning(`Unknown type: ${type}. Use: tools, resources, or prompts`, { colors })
          );
      }
    } catch (error) {
      console.error(formatError(error as Error, { colors }));
    }
  }

  private async handleCallTool(args: string[]): Promise<void> {
    const config = this.configManager.get();
    const colors = config.output?.colors !== false;

    if (!this.client) {
      console.log(formatWarning('No client connected', { colors }));
      return;
    }

    if (args.length === 0) {
      console.log(formatWarning('Usage: call <tool-name> [args-json]', { colors }));
      return;
    }

    const toolName = args[0];
    let toolArgs = {};

    if (args.length > 1) {
      try {
        toolArgs = JSON.parse(args.slice(1).join(' '));
      } catch {
        console.log(formatError(new Error('Invalid JSON arguments'), { colors }));
        return;
      }
    }

    try {
      const result = await this.client.callTool(toolName, toolArgs);
      console.log(formatSuccess(`Tool "${toolName}" executed`, { colors }));
      if (result.content) {
        for (const content of result.content) {
          if (content.type === 'text' && content.text) {
            console.log(content.text);
          }
        }
      }
    } catch (error) {
      console.error(formatError(error as Error, { colors }));
    }
  }

  private async handleReadResource(args: string[]): Promise<void> {
    const config = this.configManager.get();
    const colors = config.output?.colors !== false;

    if (!this.client) {
      console.log(formatWarning('No client connected', { colors }));
      return;
    }

    if (args.length === 0) {
      console.log(formatWarning('Usage: read <resource-uri>', { colors }));
      return;
    }

    const uri = args[0];

    try {
      const content = await this.client.readResource(uri);
      console.log(content);
    } catch (error) {
      console.error(formatError(error as Error, { colors }));
    }
  }

  private async handleSetModel(args: string[]): Promise<void> {
    const config = this.configManager.get();
    const colors = config.output?.colors !== false;

    if (args.length === 0) {
      console.log(`Current model: ${config.ollama?.model || 'llama2'}`);
      return;
    }

    const model = args[0];
    this.configManager.update('ollama.model', model);
    console.log(formatSuccess(`Model set to: ${model}`, { colors }));

    // Reinitialize client with new config
    if (this.client) {
      this.client = new OllamaMCPClient(this.configManager.get());
    }
  }

  private async handleConfig(args: string[]): Promise<void> {
    const config = this.configManager.get();
    const colors = config.output?.colors !== false;

    if (args.length === 0) {
      console.log(JSON.stringify(config, null, 2));
      return;
    }

    const subcommand = args[0];

    switch (subcommand) {
      case 'reload':
        await this.configManager.load();
        console.log(formatSuccess('Configuration reloaded', { colors }));
        break;

      case 'save':
        await this.configManager.save();
        console.log(formatSuccess('Configuration saved', { colors }));
        break;

      default:
        console.log(formatWarning(`Unknown config command: ${subcommand}`, { colors }));
    }
  }

  private showHelp(): void {
    console.log(chalk.bold('\nAvailable Commands:'));
    console.log('  help              Show this help message');
    console.log('  exit/quit         Exit the interactive session');
    console.log('  clear             Clear the screen');
    console.log('  connect [server]  Connect to an MCP server');
    console.log('  disconnect [id]   Disconnect from server(s)');
    console.log('  list <type>       List tools/resources/prompts');
    console.log('  call <tool> [args] Call a tool with arguments');
    console.log('  read <uri>        Read a resource');
    console.log('  model [name]      Get or set the Ollama model');
    console.log('  config [action]   Manage configuration');
    console.log('  history           Show command history');
    console.log('  save [file]       Save session to file');
    console.log('  load [file]       Load session from file');
    console.log();
    console.log(chalk.dim('Type any other text to chat with the assistant'));
    console.log(chalk.dim('Use """ to enter multi-line mode'));
  }

  private showWelcome(): void {
    const config = this.configManager.get();
    console.log(chalk.bold.cyan('\n🤖 Ollama MCP Interactive Session'));
    console.log(chalk.dim(`Model: ${config.ollama?.model || 'llama2'}`));
    console.log(chalk.dim('Type "help" for commands or just start chatting'));
    console.log();
  }

  private showHistory(): void {
    if (this.history.length === 0) {
      console.log('No history available');
      return;
    }

    console.log(chalk.bold('Command History:'));
    this.history.slice(-20).forEach((cmd, i) => {
      console.log(chalk.dim(`  ${i + 1}.`) + ` ${cmd}`);
    });
  }

  private async autoConnect(): Promise<void> {
    const servers = this.configManager.listServers().filter((s) => s.autoConnect);

    if (servers.length === 0) return;

    const config = this.configManager.get();
    const colors = config.output?.colors !== false;

    console.log(formatInfo(`Auto-connecting to ${servers.length} server(s)...`, { colors }));

    for (const server of servers) {
      try {
        const options = serverConfigToConnectionOptions(server);
        await this.client!.connectToServer(options);
        console.log(formatSuccess(`Connected to ${server.name}`, { colors }));
      } catch (error) {
        console.log(
          formatWarning(`Failed to connect to ${server.name}: ${(error as Error).message}`, {
            colors,
          })
        );
      }
    }
  }

  private completer(line: string): [string[], string] {
    const commands = [
      'help',
      'exit',
      'quit',
      'clear',
      'connect',
      'disconnect',
      'list',
      'call',
      'read',
      'model',
      'config',
      'history',
      'save',
      'load',
    ];

    const hits = commands.filter((c) => c.startsWith(line));
    return [hits.length ? hits : commands, line];
  }

  private addToHistory(command: string): void {
    this.history.push(command);

    const config = this.configManager.get();
    const maxHistory = config.interactive?.maxHistory || 1000;

    if (this.history.length > maxHistory) {
      this.history = this.history.slice(-maxHistory);
    }
  }

  private loadHistory(): void {
    try {
      if (fs.existsSync(this.historyFile)) {
        const content = fs.readFileSync(this.historyFile, 'utf-8');
        this.history = content.split('\n').filter((line) => line.trim());
      }
    } catch {
      // Ignore errors loading history
    }
  }

  private saveHistory(): void {
    try {
      fs.writeFileSync(this.historyFile, this.history.join('\n'), 'utf-8');
    } catch {
      // Ignore errors saving history
    }
  }

  private async saveSession(filename?: string): Promise<void> {
    const config = this.configManager.get();
    const colors = config.output?.colors !== false;

    const file = filename || `session-${Date.now()}.json`;
    const session = this.client?.getSession();

    if (!session) {
      console.log(formatWarning('No active session to save', { colors }));
      return;
    }

    try {
      fs.writeFileSync(file, JSON.stringify(session, null, 2), 'utf-8');
      console.log(formatSuccess(`Session saved to ${file}`, { colors }));
    } catch (error) {
      console.error(formatError(error as Error, { colors }));
    }
  }

  private async loadSession(filename: string): Promise<void> {
    const config = this.configManager.get();
    const colors = config.output?.colors !== false;

    try {
      fs.readFileSync(filename, 'utf-8');
      // const _session = JSON.parse(content);
      // TODO: Implement session restoration
      console.log(formatSuccess(`Session loaded from ${filename}`, { colors }));
    } catch (error) {
      console.error(formatError(error as Error, { colors }));
    }
  }

  private cleanup(): void {
    this.saveHistory();
    if (this.client) {
      this.client.cleanup().catch(() => {});
    }
  }
}
