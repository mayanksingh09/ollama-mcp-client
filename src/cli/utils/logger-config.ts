import winston from 'winston';

// Store original console methods
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug,
};

/**
 * Configure the global Winston log level for all loggers
 */
export function configureGlobalLogLevel(level: string): void {
  // Set environment variable FIRST - this is what components should read
  process.env.LOG_LEVEL = level;

  // Suppress Node.js warnings when log level is error or below
  if (level === 'silent' || level === 'error') {
    process.env.NODE_NO_WARNINGS = '1';
  }

  // Configure Winston defaults
  winston.configure({
    level: level,
    transports: [
      new winston.transports.Console({
        level: level,
        format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
        silent: level === 'silent',
      }),
    ],
  });

  // Also set for the default logger
  winston.level = level;

  // Override console methods to suppress Winston output when needed
  if (level === 'silent' || level === 'error') {
    const shouldSuppress = (args: unknown[]): boolean => {
      // Check if this is a log we want to suppress
      const message = args[0]?.toString() || '';
      return (
        message.includes('info:') ||
        message.includes('debug:') ||
        message.includes('verbose:') ||
        message.includes('{"service":') ||
        message.includes('initialized') ||
        message.includes('Discovered') ||
        message.includes('Registered') ||
        message.includes('Session created') ||
        message.includes('[INFO]') ||
        message.includes('[DEBUG]') ||
        message.includes('[VERBOSE]') ||
        message.includes('Starting') ||
        message.includes('is running') ||
        message.includes('server')
      );
    };

    console.log = (...args: unknown[]) => {
      if (!shouldSuppress(args)) {
        originalConsole.log(...args);
      }
    };

    console.info = (...args: unknown[]) => {
      if (!shouldSuppress(args)) {
        originalConsole.info(...args);
      }
    };

    if (level === 'silent') {
      console.error = () => {};
      console.warn = () => {};
      console.debug = () => {};
    }
  }
}

/**
 * Map user-friendly log levels to Winston levels
 */
export function mapLogLevel(userLevel: string): string {
  const levelMap: Record<string, string> = {
    none: 'silent',
    error: 'error',
    warning: 'warn',
    info: 'info',
    debug: 'debug',
    all: 'silly',
  };

  return levelMap[userLevel] || 'error';
}
