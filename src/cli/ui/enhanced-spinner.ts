import ora, { Ora } from 'ora';
import chalk from 'chalk';
import readline from 'readline';

export interface EnhancedSpinnerOptions {
  showStream?: boolean;
  streamMaxLength?: number;
  showTimer?: boolean;
  showHint?: boolean;
}

export class EnhancedSpinner {
  private spinner: Ora;
  private startTime: number = 0;
  private streamText: string = '';
  private fullStreamMode: boolean = false;
  private intervalId?: NodeJS.Timeout;
  private options: Required<EnhancedSpinnerOptions>;
  private isActive: boolean = false;
  private keyListener?: (str: string, key: readline.Key) => void;

  constructor(options: EnhancedSpinnerOptions = {}) {
    this.spinner = ora({
      spinner: 'dots',
      color: 'cyan',
    });

    this.options = {
      showStream: options.showStream !== false,
      streamMaxLength: options.streamMaxLength || 50,
      showTimer: options.showTimer !== false,
      showHint: options.showHint !== false,
    };

    if (this.options.showStream) {
      this.setupKeyboardListener();
    }
  }

  start(text: string = 'Thinking'): void {
    this.startTime = Date.now();
    this.streamText = '';
    this.isActive = true;

    if (this.options.showTimer) {
      // Update spinner with elapsed time
      this.intervalId = setInterval(() => {
        if (!this.isActive) {
          return;
        }

        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        const baseText = `${text} (${elapsed}s)`;
        const streamPreview = this.getStreamPreview();

        this.spinner.text = baseText + streamPreview;
      }, 100);
    } else {
      this.spinner.text = text;
    }

    this.spinner.start();
  }

  updateStream(text: string): void {
    if (!this.options.showStream) {
      return;
    }

    this.streamText += text;

    // Trigger immediate update if timer is not running
    if (!this.options.showTimer) {
      const streamPreview = this.getStreamPreview();
      this.spinner.text = this.spinner.text.split('\n')[0] + streamPreview;
    }
  }

  private getStreamPreview(): string {
    if (!this.options.showStream || !this.streamText) {
      return '';
    }

    let preview = '';

    if (this.fullStreamMode) {
      // Show full stream with word wrap
      const lines = this.streamText.split('\n');
      const maxLines = 10; // Limit to 10 lines to prevent screen overflow
      const displayLines = lines.slice(-maxLines);
      preview = `\n${chalk.dim('Stream output:')}\n${chalk.gray(displayLines.join('\n'))}`;
    } else {
      // Show truncated single line
      const cleanText = this.streamText.replace(/\n/g, ' ').trim();
      const displayText =
        cleanText.length > this.options.streamMaxLength
          ? '...' + cleanText.slice(-this.options.streamMaxLength)
          : cleanText;

      if (displayText) {
        preview = `\n${chalk.gray(displayText)}`;
      }
    }

    // Add hint only if there's stream content and hint is enabled
    if (this.options.showHint && this.streamText && !this.fullStreamMode) {
      preview += `\n${chalk.dim('(Press Ctrl+R to toggle full stream view)')}`;
    }

    return preview;
  }

  private setupKeyboardListener(): void {
    if (!process.stdin.isTTY) {
      return;
    }

    // Store the original raw mode state
    const wasRaw = process.stdin.isRaw;

    // Enable raw mode to capture keypress
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }

    this.keyListener = (_str: string, key: readline.Key) => {
      if (key && key.ctrl && key.name === 'r') {
        this.fullStreamMode = !this.fullStreamMode;
        // Force update display
        if (this.isActive) {
          const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
          const baseText = this.spinner.text.split('\n')[0].split('(')[0].trim();
          const text = this.options.showTimer ? `${baseText} (${elapsed}s)` : baseText;
          const streamPreview = this.getStreamPreview();
          this.spinner.text = text + streamPreview;
        }
      }
    };

    process.stdin.on('keypress', this.keyListener);

    // Store cleanup function
    this.cleanupKeyboard = () => {
      if (this.keyListener) {
        process.stdin.removeListener('keypress', this.keyListener);
      }
      if (process.stdin.setRawMode && !wasRaw) {
        process.stdin.setRawMode(false);
      }
    };
  }

  private cleanupKeyboard?: () => void;

  succeed(text?: string): void {
    this.stop();
    this.spinner.succeed(text);
  }

  fail(text?: string): void {
    this.stop();
    this.spinner.fail(text);
  }

  warn(text?: string): void {
    this.stop();
    this.spinner.warn(text);
  }

  info(text?: string): void {
    this.stop();
    this.spinner.info(text);
  }

  stop(): void {
    this.isActive = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    if (this.cleanupKeyboard) {
      this.cleanupKeyboard();
      this.cleanupKeyboard = undefined;
    }

    this.spinner.stop();
  }

  clear(): void {
    this.spinner.clear();
  }

  isSpinning(): boolean {
    return this.spinner.isSpinning || false;
  }

  getElapsedTime(): number {
    return Date.now() - this.startTime;
  }

  getStreamContent(): string {
    return this.streamText;
  }

  reset(): void {
    this.stop();
    this.startTime = 0;
    this.streamText = '';
    this.fullStreamMode = false;
  }
}

// Helper function for backward compatibility
export function withEnhancedSpinner<T>(
  text: string,
  fn: () => Promise<T>,
  options: {
    successText?: string | ((result: T) => string);
    failText?: string | ((error: Error) => string);
    showStream?: boolean;
    showTimer?: boolean;
    onStream?: (chunk: string) => void;
  } = {}
): Promise<T> {
  const spinner = new EnhancedSpinner({
    showStream: options.showStream,
    showTimer: options.showTimer,
  });

  spinner.start(text);

  // If onStream callback is provided, it should be called during execution
  if (options.onStream) {
    // This would need to be implemented in the actual async function
    // For now, we'll just note it's available
  }

  return fn()
    .then((result) => {
      const successText =
        typeof options.successText === 'function'
          ? options.successText(result)
          : options.successText;

      if (successText === '') {
        spinner.stop();
      } else {
        spinner.succeed(successText);
      }

      return result;
    })
    .catch((error) => {
      const failText =
        typeof options.failText === 'function'
          ? options.failText(error)
          : options.failText || error.message;

      spinner.fail(failText);
      throw error;
    });
}
