import winston from 'winston';

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

  // Don't override console methods anymore - this breaks spinners and prompts
  // Winston loggers will respect LOG_LEVEL environment variable directly
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
