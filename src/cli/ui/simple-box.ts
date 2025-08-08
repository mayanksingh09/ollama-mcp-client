import chalk from 'chalk';

export interface BoxOptions {
  padding?: number;
  borderStyle?: 'single' | 'double' | 'rounded' | 'bold';
  borderColor?: string;
  title?: string;
  width?: number;
}

export class SimpleBox {
  private static borderChars = {
    single: {
      topLeft: '┌',
      topRight: '┐',
      bottomLeft: '└',
      bottomRight: '┘',
      horizontal: '─',
      vertical: '│',
    },
    double: {
      topLeft: '╔',
      topRight: '╗',
      bottomLeft: '╚',
      bottomRight: '╝',
      horizontal: '═',
      vertical: '║',
    },
    rounded: {
      topLeft: '╭',
      topRight: '╮',
      bottomLeft: '╰',
      bottomRight: '╯',
      horizontal: '─',
      vertical: '│',
    },
    bold: {
      topLeft: '┏',
      topRight: '┓',
      bottomLeft: '┗',
      bottomRight: '┛',
      horizontal: '━',
      vertical: '┃',
    },
  };

  static render(content: string, options: BoxOptions = {}): string {
    const { padding = 1, borderStyle = 'single', borderColor = 'cyan', title, width } = options;

    const chars = this.borderChars[borderStyle];
    const lines = content.split('\n');

    // Calculate box width
    const contentWidth = width || Math.max(...lines.map((l) => l.length));
    const boxWidth = contentWidth + padding * 2;

    // Apply color to border characters
    const colorFn =
      borderColor === 'gray'
        ? chalk.gray
        : (chalk as unknown as Record<string, (text: string) => string>)[borderColor] ||
          chalk.white;

    const result: string[] = [];

    // Top border
    let topBorder =
      colorFn(chars.topLeft) + colorFn(chars.horizontal.repeat(boxWidth)) + colorFn(chars.topRight);
    if (title) {
      const titleStr = ` ${title} `;
      const startPos = Math.floor((boxWidth - titleStr.length) / 2);
      topBorder =
        colorFn(chars.topLeft) +
        colorFn(chars.horizontal.repeat(startPos)) +
        chalk.bold(titleStr) +
        colorFn(chars.horizontal.repeat(boxWidth - startPos - titleStr.length)) +
        colorFn(chars.topRight);
    }
    result.push(topBorder);

    // Padding top
    for (let i = 0; i < padding; i++) {
      result.push(colorFn(chars.vertical) + ' '.repeat(boxWidth) + colorFn(chars.vertical));
    }

    // Content lines
    for (const line of lines) {
      const paddedLine = ' '.repeat(padding) + line.padEnd(contentWidth) + ' '.repeat(padding);
      result.push(colorFn(chars.vertical) + paddedLine + colorFn(chars.vertical));
    }

    // Padding bottom
    for (let i = 0; i < padding; i++) {
      result.push(colorFn(chars.vertical) + ' '.repeat(boxWidth) + colorFn(chars.vertical));
    }

    // Bottom border
    result.push(
      colorFn(chars.bottomLeft) +
        colorFn(chars.horizontal.repeat(boxWidth)) +
        colorFn(chars.bottomRight)
    );

    return result.join('\n');
  }

  static inputBox(prompt: string = '', options: BoxOptions = {}): string {
    const inputIndicator = '› ';
    const content = prompt ? `${prompt}\n\n${inputIndicator}` : inputIndicator;

    return this.render(content, {
      ...options,
      borderColor: options.borderColor || 'green',
      borderStyle: options.borderStyle || 'rounded',
      title: options.title || 'Input',
      padding: options.padding ?? 1,
    });
  }

  static messageBox(role: 'user' | 'assistant', message: string, options: BoxOptions = {}): string {
    const roleColors = {
      user: 'green',
      assistant: 'blue',
    };

    const roleTitles = {
      user: 'You',
      assistant: 'Assistant',
    };

    return this.render(message, {
      ...options,
      borderColor: options.borderColor || roleColors[role],
      borderStyle: options.borderStyle || 'single',
      title: options.title || roleTitles[role],
      padding: options.padding ?? 1,
    });
  }

  static divider(width: number = 80, style: 'single' | 'double' | 'dotted' = 'single'): string {
    const chars = {
      single: '─',
      double: '═',
      dotted: '·',
    };

    return chalk.dim(chars[style].repeat(width));
  }
}
