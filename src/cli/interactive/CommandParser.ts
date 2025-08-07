export interface ParsedInput {
  isCommand: boolean;
  command?: string;
  args: string[];
  raw: string;
}

export class CommandParser {
  private commandPrefixes = ['/', '.', '!'];

  parse(input: string): ParsedInput {
    const trimmed = input.trim();

    // Check if it's a command (starts with prefix or is a known command)
    const isCommand = this.isCommand(trimmed);

    if (isCommand) {
      // Remove prefix if present
      let commandText = trimmed;
      for (const prefix of this.commandPrefixes) {
        if (trimmed.startsWith(prefix)) {
          commandText = trimmed.substring(1);
          break;
        }
      }

      // Parse command and arguments
      const parts = this.parseArguments(commandText);
      const command = parts[0];
      const args = parts.slice(1);

      return {
        isCommand: true,
        command,
        args,
        raw: input,
      };
    }

    return {
      isCommand: false,
      args: [],
      raw: input,
    };
  }

  private isCommand(input: string): boolean {
    // Check for prefix
    for (const prefix of this.commandPrefixes) {
      if (input.startsWith(prefix)) {
        return true;
      }
    }

    // Check for known commands without prefix
    const knownCommands = [
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

    const firstWord = input.split(/\s+/)[0].toLowerCase();
    return knownCommands.includes(firstWord);
  }

  private parseArguments(text: string): string[] {
    const args: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    let escaped = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (!inQuotes && (char === '"' || char === "'")) {
        inQuotes = true;
        quoteChar = char;
        continue;
      }

      if (inQuotes && char === quoteChar) {
        inQuotes = false;
        quoteChar = '';
        continue;
      }

      if (!inQuotes && /\s/.test(char)) {
        if (current.length > 0) {
          args.push(current);
          current = '';
        }
        continue;
      }

      current += char;
    }

    if (current.length > 0) {
      args.push(current);
    }

    return args;
  }

  formatCommand(command: string, args: string[]): string {
    const quotedArgs = args.map((arg) => {
      if (arg.includes(' ') || arg.includes('"') || arg.includes("'")) {
        return `"${arg.replace(/"/g, '\\"')}"`;
      }
      return arg;
    });

    return [command, ...quotedArgs].join(' ');
  }
}
