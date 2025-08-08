import chalk from 'chalk';

export class InputBox {
  /**
   * Create a boxed input prompt using ANSI escape codes
   */
  static showInputArea(width: number = 60): void {
    const topBorder = chalk.gray('┌' + '─'.repeat(width) + '┐');
    const emptyLine = chalk.gray('│') + ' '.repeat(width) + chalk.gray('│');

    console.log(topBorder);
    console.log(emptyLine);
    // The cursor will be positioned here for input
    process.stdout.write(chalk.gray('│ '));
  }

  /**
   * Close the input box after user enters text
   */
  static closeInputArea(inputLength: number, width: number = 60): void {
    // Move to end of line and draw the right border
    const padding = width - inputLength - 1;
    if (padding > 0) {
      process.stdout.write(' '.repeat(padding));
    }
    console.log(chalk.gray('│'));

    // Draw bottom border
    const bottomBorder = chalk.gray('└' + '─'.repeat(width) + '┘');
    console.log(bottomBorder);
  }

  /**
   * Create a simple visual divider
   */
  static divider(width: number = 60): string {
    return chalk.gray('─'.repeat(width));
  }

  /**
   * Format the input prompt with a box-like appearance
   */
  static formatPrompt(showBox: boolean = true): string {
    if (showBox) {
      return chalk.gray('│ ') + chalk.cyan('› ');
    }
    return chalk.bold.green('You> ');
  }

  /**
   * Draw a complete input box with rounded corners
   */
  static showLightInput(): void {
    const width = 60;
    console.log(chalk.gray('╭' + '─'.repeat(width) + '╮'));
    console.log(chalk.gray('│') + ' '.repeat(width) + chalk.gray('│'));
    console.log(chalk.gray('╰' + '─'.repeat(width) + '╯'));
    // Move cursor up to input position
    process.stdout.write('\x1B[2A'); // Move up 2 lines
    process.stdout.write('\x1B[2C'); // Move right 2 positions for prompt
  }

  static closeLightInput(): void {
    // Move cursor to after the box
    process.stdout.write('\x1B[2B'); // Move down 2 lines
    process.stdout.write('\r'); // Return to start of line
  }
}
