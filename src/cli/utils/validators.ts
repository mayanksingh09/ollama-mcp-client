import { URL } from 'url';
import * as fs from 'fs';
import * as path from 'path';

export function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function validatePort(port: string | number): boolean {
  const portNum = typeof port === 'string' ? parseInt(port, 10) : port;
  return !isNaN(portNum) && portNum > 0 && portNum <= 65535;
}

export function validateFilePath(filePath: string, checkExists: boolean = false): boolean {
  if (!filePath || filePath.length === 0) {
    return false;
  }

  // Check for invalid characters (basic check)
  // eslint-disable-next-line no-control-regex
  const invalidChars = /[<>:"|?*\x00-\x1F]/;
  if (invalidChars.test(filePath)) {
    return false;
  }

  if (checkExists) {
    try {
      fs.accessSync(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  return true;
}

export function validateCommand(command: string): boolean {
  if (!command || command.length === 0) {
    return false;
  }

  // Check if command exists in PATH or is an absolute path
  if (path.isAbsolute(command)) {
    return validateFilePath(command, true);
  }

  // For relative paths or commands in PATH, just do a basic check
  return !command.includes('\0');
}

export function validateModel(model: string): boolean {
  // Basic validation for model names
  const validPattern = /^[a-zA-Z0-9][a-zA-Z0-9-_:.]*$/;
  return validPattern.test(model);
}

export function validateLogLevel(
  level: string
): level is 'error' | 'warn' | 'info' | 'debug' | 'verbose' {
  return ['error', 'warn', 'info', 'debug', 'verbose'].includes(level);
}

export function validateJSON(jsonString: string): boolean {
  try {
    JSON.parse(jsonString);
    return true;
  } catch {
    return false;
  }
}

export function validateEnvironmentVariable(varName: string): boolean {
  // Environment variable names should follow common conventions
  const validPattern = /^[A-Z][A-Z0-9_]*$/;
  return validPattern.test(varName);
}

export function validateServerName(name: string): boolean {
  // Server names should be alphanumeric with hyphens and underscores
  const validPattern = /^[a-zA-Z][a-zA-Z0-9-_]*$/;
  return validPattern.test(name) && name.length <= 50;
}

export function parseKeyValue(input: string): Record<string, string> | null {
  const result: Record<string, string> = {};
  const pairs = input.split(',');

  for (const pair of pairs) {
    const [key, ...valueParts] = pair.trim().split('=');
    if (!key || valueParts.length === 0) {
      return null;
    }
    result[key.trim()] = valueParts.join('=').trim();
  }

  return result;
}

export function parseArguments(args: string): string[] | null {
  try {
    // First try to parse as JSON array
    if (args.startsWith('[')) {
      const parsed = JSON.parse(args);
      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
    }

    // Otherwise, split by spaces (respecting quotes)
    const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
    const matches: string[] = [];
    let match;

    while ((match = regex.exec(args)) !== null) {
      matches.push(match[1] || match[2] || match[0]);
    }

    return matches;
  } catch {
    return null;
  }
}

export function validateTimeout(timeout: string | number): boolean {
  const timeoutNum = typeof timeout === 'string' ? parseInt(timeout, 10) : timeout;
  return !isNaN(timeoutNum) && timeoutNum > 0 && timeoutNum <= 600000; // Max 10 minutes
}

export function expandPath(filePath: string): string {
  if (filePath.startsWith('~')) {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(home, filePath.slice(1));
  }
  return filePath;
}

export function ensureDirectoryExists(dirPath: string): boolean {
  try {
    const expanded = expandPath(dirPath);
    if (!fs.existsSync(expanded)) {
      fs.mkdirSync(expanded, { recursive: true });
    }
    return true;
  } catch {
    return false;
  }
}
