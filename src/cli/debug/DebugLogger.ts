import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { EventEmitter } from 'events';

export interface DebugLogEntry {
  timestamp: Date;
  level: 'error' | 'warn' | 'info' | 'debug' | 'verbose';
  category: string;
  message: string;
  data?: unknown;
  error?: Error;
}

export class DebugLogger extends EventEmitter {
  private static instance: DebugLogger;
  private logLevel: 'error' | 'warn' | 'info' | 'debug' | 'verbose' = 'info';
  // private _logFile?: string;
  private logStream?: fs.WriteStream;
  private categories: Set<string> = new Set();
  private enabledCategories: Set<string> = new Set();
  private logHistory: DebugLogEntry[] = [];
  private maxHistory: number = 1000;
  private useColors: boolean = true;

  private constructor() {
    super();
  }

  static getInstance(): DebugLogger {
    if (!DebugLogger.instance) {
      DebugLogger.instance = new DebugLogger();
    }
    return DebugLogger.instance;
  }

  configure(options: {
    level?: 'error' | 'warn' | 'info' | 'debug' | 'verbose';
    file?: string;
    categories?: string[];
    colors?: boolean;
    maxHistory?: number;
  }): void {
    if (options.level) {
      this.logLevel = options.level;
    }

    if (options.file) {
      this.setupFileLogging(options.file);
    }

    if (options.categories) {
      this.enabledCategories = new Set(options.categories);
    }

    if (options.colors !== undefined) {
      this.useColors = options.colors;
    }

    if (options.maxHistory) {
      this.maxHistory = options.maxHistory;
    }
  }

  private setupFileLogging(logFile: string): void {
    try {
      const dir = path.dirname(logFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (this.logStream) {
        this.logStream.end();
      }

      // this._logFile = logFile;
      this.logStream = fs.createWriteStream(logFile, { flags: 'a' });
    } catch (error) {
      console.error('Failed to setup file logging:', error);
    }
  }

  setLevel(level: 'error' | 'warn' | 'info' | 'debug' | 'verbose'): void {
    this.logLevel = level;
  }

  enableCategory(category: string): void {
    this.enabledCategories.add(category);
    this.categories.add(category);
  }

  disableCategory(category: string): void {
    this.enabledCategories.delete(category);
  }

  enableAllCategories(): void {
    this.enabledCategories = new Set(this.categories);
  }

  disableAllCategories(): void {
    this.enabledCategories.clear();
  }

  log(level: DebugLogEntry['level'], category: string, message: string, data?: unknown): void {
    // Check if we should log this level
    if (!this.shouldLog(level)) {
      return;
    }

    // Check if category is enabled (if categories are being used)
    if (this.enabledCategories.size > 0 && !this.enabledCategories.has(category)) {
      return;
    }

    this.categories.add(category);

    const entry: DebugLogEntry = {
      timestamp: new Date(),
      level,
      category,
      message,
      data,
    };

    // Add to history
    this.addToHistory(entry);

    // Emit event
    this.emit('log', entry);

    // Console output
    this.consoleOutput(entry);

    // File output
    this.fileOutput(entry);
  }

  error(category: string, message: string, error?: Error | unknown): void {
    const entry: DebugLogEntry = {
      timestamp: new Date(),
      level: 'error',
      category,
      message,
      error: error instanceof Error ? error : undefined,
      data: error instanceof Error ? undefined : error,
    };

    this.addToHistory(entry);
    this.emit('error', entry);
    this.consoleOutput(entry);
    this.fileOutput(entry);
  }

  warn(category: string, message: string, data?: unknown): void {
    this.log('warn', category, message, data);
  }

  info(category: string, message: string, data?: unknown): void {
    this.log('info', category, message, data);
  }

  debug(category: string, message: string, data?: unknown): void {
    this.log('debug', category, message, data);
  }

  verbose(category: string, message: string, data?: unknown): void {
    this.log('verbose', category, message, data);
  }

  private shouldLog(level: DebugLogEntry['level']): boolean {
    const levels = ['error', 'warn', 'info', 'debug', 'verbose'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex <= currentLevelIndex;
  }

  private addToHistory(entry: DebugLogEntry): void {
    this.logHistory.push(entry);
    if (this.logHistory.length > this.maxHistory) {
      this.logHistory = this.logHistory.slice(-this.maxHistory);
    }
  }

  private consoleOutput(entry: DebugLogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const level = entry.level.toUpperCase().padEnd(7);
    const category = `[${entry.category}]`.padEnd(20);

    let output = '';

    if (this.useColors) {
      const levelColor = this.getLevelColor(entry.level);
      output = `${chalk.dim(timestamp)} ${levelColor(level)} ${chalk.cyan(category)} ${entry.message}`;
    } else {
      output = `${timestamp} ${level} ${category} ${entry.message}`;
    }

    // Add data if present
    if (entry.data !== undefined) {
      const dataStr =
        typeof entry.data === 'object' ? JSON.stringify(entry.data, null, 2) : String(entry.data);
      output += '\n' + chalk.dim(dataStr);
    }

    // Add error stack if present
    if (entry.error) {
      output += '\n' + chalk.red(entry.error.stack || entry.error.message);
    }

    // Output to appropriate console method
    switch (entry.level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }

  private fileOutput(entry: DebugLogEntry): void {
    if (!this.logStream) {
      return;
    }

    const logLine = {
      timestamp: entry.timestamp.toISOString(),
      level: entry.level,
      category: entry.category,
      message: entry.message,
      data: entry.data,
      error: entry.error
        ? {
            message: entry.error.message,
            stack: entry.error.stack,
          }
        : undefined,
    };

    this.logStream.write(JSON.stringify(logLine) + '\n');
  }

  private getLevelColor(level: DebugLogEntry['level']): (text: string) => string {
    switch (level) {
      case 'error':
        return chalk.red;
      case 'warn':
        return chalk.yellow;
      case 'info':
        return chalk.blue;
      case 'debug':
        return chalk.magenta;
      case 'verbose':
        return chalk.gray;
      default:
        return (text) => text;
    }
  }

  getHistory(filter?: {
    level?: DebugLogEntry['level'];
    category?: string;
    since?: Date;
  }): DebugLogEntry[] {
    let history = [...this.logHistory];

    if (filter) {
      if (filter.level) {
        history = history.filter((e) => e.level === filter.level);
      }
      if (filter.category) {
        history = history.filter((e) => e.category === filter.category);
      }
      if (filter.since) {
        history = history.filter((e) => e.timestamp >= filter.since!);
      }
    }

    return history;
  }

  clearHistory(): void {
    this.logHistory = [];
  }

  getCategories(): string[] {
    return Array.from(this.categories);
  }

  getEnabledCategories(): string[] {
    return Array.from(this.enabledCategories);
  }

  exportLogs(format: 'json' | 'text' = 'json'): string {
    if (format === 'json') {
      return JSON.stringify(this.logHistory, null, 2);
    }

    return this.logHistory
      .map((entry) => {
        const timestamp = entry.timestamp.toISOString();
        const level = entry.level.toUpperCase().padEnd(7);
        const category = `[${entry.category}]`.padEnd(20);
        let line = `${timestamp} ${level} ${category} ${entry.message}`;

        if (entry.data) {
          line += '\n  Data: ' + JSON.stringify(entry.data);
        }

        if (entry.error) {
          line += '\n  Error: ' + entry.error.message;
          if (entry.error.stack) {
            line +=
              '\n' +
              entry.error.stack
                .split('\n')
                .map((l) => '    ' + l)
                .join('\n');
          }
        }

        return line;
      })
      .join('\n');
  }

  close(): void {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = undefined;
    }
  }
}

export const debugLogger = DebugLogger.getInstance();
