import { EventEmitter } from 'events';
import * as path from 'path';
import type {
  Plugin,
  PluginContext,
  PluginHooks,
  PluginMetadata,
  PluginConfig,
  PluginCommand,
  PluginTool,
  PluginLogger,
  PluginStorage,
} from './types';
import type { OllamaMCPClientEnhanced } from '../client/OllamaMCPClientEnhanced';
import type { MCPToolResult } from '../types/mcp.types';

export interface PluginManagerConfig {
  pluginsPath?: string;
  autoLoad?: boolean;
  enableHotReload?: boolean;
  sandboxed?: boolean;
  maxPlugins?: number;
}

export class PluginManager extends EventEmitter {
  private plugins: Map<string, Plugin> = new Map();
  private hooks: Map<
    keyof PluginHooks,
    Array<{ plugin: string; hook: (...args: unknown[]) => unknown }>
  > = new Map();
  private commands: Map<string, { plugin: string; command: PluginCommand }> = new Map();
  private tools: Map<string, { plugin: string; tool: PluginTool }> = new Map();
  private config: Required<PluginManagerConfig>;
  private client?: OllamaMCPClientEnhanced;
  private storages: Map<string, PluginStorage> = new Map();

  constructor(config: PluginManagerConfig = {}) {
    super();
    this.config = {
      pluginsPath: config.pluginsPath || './plugins',
      autoLoad: config.autoLoad ?? true,
      enableHotReload: config.enableHotReload ?? false,
      sandboxed: config.sandboxed ?? true,
      maxPlugins: config.maxPlugins ?? 50,
    };
  }

  async initialize(client: OllamaMCPClientEnhanced): Promise<void> {
    this.client = client;

    if (this.config.autoLoad) {
      await this.loadAllPlugins();
    }

    this.emit('initialized');
  }

  async loadPlugin(pluginPath: string, config?: PluginConfig): Promise<void> {
    if (this.plugins.size >= this.config.maxPlugins) {
      throw new Error(`Maximum number of plugins (${this.config.maxPlugins}) reached`);
    }

    try {
      const PluginClass = await this.loadPluginModule(pluginPath);
      const plugin = new PluginClass() as Plugin;

      const metadata = plugin.metadata;

      if (this.plugins.has(metadata.name)) {
        throw new Error(`Plugin ${metadata.name} is already loaded`);
      }

      await this.checkDependencies(metadata);

      const context = this.createPluginContext(metadata.name, config?.config);
      await plugin.initialize(context);

      if (config?.enabled !== false) {
        await plugin.activate();
      }

      this.plugins.set(metadata.name, plugin);

      this.registerPluginHooks(metadata.name, plugin);
      this.registerPluginCommands(metadata.name, plugin);
      this.registerPluginTools(metadata.name, plugin);

      this.emit('pluginLoaded', metadata);
    } catch (error) {
      this.emit('pluginLoadError', { path: pluginPath, error });
      throw error;
    }
  }

  async unloadPlugin(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin ${pluginName} not found`);
    }

    try {
      await plugin.deactivate();
      await plugin.destroy();

      this.unregisterPluginHooks(pluginName);
      this.unregisterPluginCommands(pluginName);
      this.unregisterPluginTools(pluginName);

      this.plugins.delete(pluginName);

      const storage = this.storages.get(pluginName);
      if (storage) {
        await storage.clear();
        this.storages.delete(pluginName);
      }

      this.emit('pluginUnloaded', pluginName);
    } catch (error) {
      this.emit('pluginUnloadError', { name: pluginName, error });
      throw error;
    }
  }

  async reloadPlugin(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin ${pluginName} not found`);
    }

    await this.unloadPlugin(pluginName);
  }

  async enablePlugin(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin ${pluginName} not found`);
    }

    await plugin.activate();
    this.emit('pluginEnabled', pluginName);
  }

  async disablePlugin(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin ${pluginName} not found`);
    }

    await plugin.deactivate();
    this.emit('pluginDisabled', pluginName);
  }

  async executeHook<T extends keyof PluginHooks>(
    hookName: T,
    ...args: Parameters<NonNullable<PluginHooks[T]>>
  ): Promise<unknown> {
    const hooks = this.hooks.get(hookName) || [];
    let result = args[0];

    for (const { plugin, hook } of hooks) {
      try {
        const hookResult = await hook(...args);
        if (hookResult !== undefined) {
          result = hookResult;
          args[0] = result as Parameters<NonNullable<PluginHooks[T]>>[0];
        }
      } catch (error) {
        this.emit('hookError', { plugin, hook: hookName, error });
      }
    }

    return result;
  }

  async executeCommand(commandName: string, args: string[]): Promise<void> {
    const command = this.commands.get(commandName);
    if (!command) {
      throw new Error(`Command ${commandName} not found`);
    }

    await command.command.execute(args);
  }

  async executeTool(toolName: string, args?: Record<string, unknown>): Promise<MCPToolResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }

    return tool.tool.execute(args);
  }

  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  getPluginMetadata(name: string): PluginMetadata | undefined {
    return this.plugins.get(name)?.metadata;
  }

  getAllMetadata(): PluginMetadata[] {
    return Array.from(this.plugins.values()).map((p) => p.metadata);
  }

  getCommands(): string[] {
    return Array.from(this.commands.keys());
  }

  getTools(): string[] {
    return Array.from(this.tools.keys());
  }

  private createPluginContext(pluginName: string, config?: Record<string, unknown>): PluginContext {
    const logger = this.createPluginLogger(pluginName);
    const storage = this.createPluginStorage(pluginName);

    return {
      client: this.client!,
      config: config || {},
      logger,
      storage,
      eventBus: this,
    };
  }

  private createPluginLogger(pluginName: string): PluginLogger {
    return {
      debug: (message: string, data?: unknown) => {
        this.emit('pluginLog', { level: 'debug', plugin: pluginName, message, data });
      },
      info: (message: string, data?: unknown) => {
        this.emit('pluginLog', { level: 'info', plugin: pluginName, message, data });
      },
      warn: (message: string, data?: unknown) => {
        this.emit('pluginLog', { level: 'warn', plugin: pluginName, message, data });
      },
      error: (message: string, error?: Error | unknown) => {
        this.emit('pluginLog', { level: 'error', plugin: pluginName, message, error });
      },
    };
  }

  private createPluginStorage(pluginName: string): PluginStorage {
    const storage = new Map<string, unknown>();

    const pluginStorage: PluginStorage = {
      async get<T>(key: string): Promise<T | undefined> {
        return storage.get(key) as T | undefined;
      },
      async set<T>(key: string, value: T): Promise<void> {
        storage.set(key, value);
      },
      async delete(key: string): Promise<boolean> {
        return storage.delete(key);
      },
      async has(key: string): Promise<boolean> {
        return storage.has(key);
      },
      async clear(): Promise<void> {
        storage.clear();
      },
      async keys(): Promise<string[]> {
        return Array.from(storage.keys());
      },
    };

    this.storages.set(pluginName, pluginStorage);
    return pluginStorage;
  }

  private registerPluginHooks(pluginName: string, plugin: Plugin): void {
    const hooks = plugin.getHooks?.();
    if (!hooks) return;

    for (const [hookName, hook] of Object.entries(hooks) as Array<
      [keyof PluginHooks, (...args: unknown[]) => unknown]
    >) {
      if (!hook) continue;

      if (!this.hooks.has(hookName)) {
        this.hooks.set(hookName, []);
      }

      this.hooks.get(hookName)!.push({ plugin: pluginName, hook });
    }
  }

  private unregisterPluginHooks(pluginName: string): void {
    for (const [hookName, hooks] of this.hooks.entries()) {
      const filtered = hooks.filter((h) => h.plugin !== pluginName);
      if (filtered.length === 0) {
        this.hooks.delete(hookName);
      } else {
        this.hooks.set(hookName, filtered);
      }
    }
  }

  private registerPluginCommands(pluginName: string, plugin: Plugin): void {
    const commands = plugin.registerCommands?.();
    if (!commands) return;

    for (const command of commands) {
      if (this.commands.has(command.name)) {
        throw new Error(`Command ${command.name} already registered`);
      }

      this.commands.set(command.name, { plugin: pluginName, command });
    }
  }

  private unregisterPluginCommands(pluginName: string): void {
    for (const [name, { plugin }] of this.commands.entries()) {
      if (plugin === pluginName) {
        this.commands.delete(name);
      }
    }
  }

  private registerPluginTools(pluginName: string, plugin: Plugin): void {
    const tools = plugin.registerTools?.();
    if (!tools) return;

    for (const tool of tools) {
      if (this.tools.has(tool.name)) {
        throw new Error(`Tool ${tool.name} already registered`);
      }

      this.tools.set(tool.name, { plugin: pluginName, tool });
    }
  }

  private unregisterPluginTools(pluginName: string): void {
    for (const [name, { plugin }] of this.tools.entries()) {
      if (plugin === pluginName) {
        this.tools.delete(name);
      }
    }
  }

  private async loadPluginModule(pluginPath: string): Promise<new () => Plugin> {
    const absolutePath = path.isAbsolute(pluginPath)
      ? pluginPath
      : path.join(this.config.pluginsPath, pluginPath);

    const module = await import(absolutePath);

    if (module.default) {
      return module.default;
    }

    const exportedClass = Object.values(module).find(
      (exp) => typeof exp === 'function' && exp.prototype
    );

    if (!exportedClass) {
      throw new Error(`No plugin class found in ${pluginPath}`);
    }

    return exportedClass as new () => Plugin;
  }

  private async checkDependencies(metadata: PluginMetadata): Promise<void> {
    if (!metadata.dependencies) return;

    for (const dep of metadata.dependencies) {
      if (!this.plugins.has(dep)) {
        throw new Error(`Missing dependency: ${dep}`);
      }
    }
  }

  private async loadAllPlugins(): Promise<void> {}

  async destroy(): Promise<void> {
    for (const [name, plugin] of this.plugins.entries()) {
      try {
        await plugin.deactivate();
        await plugin.destroy();
      } catch (error) {
        this.emit('pluginDestroyError', { name, error });
      }
    }

    this.plugins.clear();
    this.hooks.clear();
    this.commands.clear();
    this.tools.clear();
    this.storages.clear();

    this.removeAllListeners();
  }
}
