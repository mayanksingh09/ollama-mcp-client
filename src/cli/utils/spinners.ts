import ora, { Ora } from 'ora';
import chalk from 'chalk';

export class SpinnerManager {
  private static instance: SpinnerManager;
  private currentSpinner?: Ora;
  private isVerbose: boolean = false;

  private constructor() {}

  static getInstance(): SpinnerManager {
    if (!SpinnerManager.instance) {
      SpinnerManager.instance = new SpinnerManager();
    }
    return SpinnerManager.instance;
  }

  setVerbose(verbose: boolean): void {
    this.isVerbose = verbose;
  }

  start(text: string): Ora | undefined {
    if (this.isVerbose) {
      console.log(chalk.dim(`[START] ${text}`));
      return undefined;
    }

    this.stop();
    this.currentSpinner = ora({
      text,
      spinner: 'dots',
    }).start();
    return this.currentSpinner;
  }

  update(text: string): void {
    if (this.isVerbose) {
      console.log(chalk.dim(`[UPDATE] ${text}`));
      return;
    }

    if (this.currentSpinner) {
      this.currentSpinner.text = text;
    }
  }

  succeed(text?: string): void {
    if (this.isVerbose) {
      console.log(chalk.green(`[SUCCESS] ${text || 'Done'}`));
      return;
    }

    if (this.currentSpinner) {
      this.currentSpinner.succeed(text);
      this.currentSpinner = undefined;
    }
  }

  fail(text?: string): void {
    if (this.isVerbose) {
      console.log(chalk.red(`[FAIL] ${text || 'Failed'}`));
      return;
    }

    if (this.currentSpinner) {
      this.currentSpinner.fail(text);
      this.currentSpinner = undefined;
    }
  }

  warn(text?: string): void {
    if (this.isVerbose) {
      console.log(chalk.yellow(`[WARN] ${text || 'Warning'}`));
      return;
    }

    if (this.currentSpinner) {
      this.currentSpinner.warn(text);
      this.currentSpinner = undefined;
    }
  }

  info(text?: string): void {
    if (this.isVerbose) {
      console.log(chalk.blue(`[INFO] ${text || 'Info'}`));
      return;
    }

    if (this.currentSpinner) {
      this.currentSpinner.info(text);
      this.currentSpinner = undefined;
    }
  }

  stop(): void {
    if (this.currentSpinner) {
      this.currentSpinner.stop();
      this.currentSpinner = undefined;
    }
  }

  clear(): void {
    if (this.currentSpinner) {
      this.currentSpinner.clear();
    }
  }

  isSpinning(): boolean {
    return this.currentSpinner?.isSpinning || false;
  }
}

export const spinner = SpinnerManager.getInstance();

export function withSpinner<T>(
  text: string,
  fn: () => Promise<T>,
  options: {
    successText?: string | ((result: T) => string);
    failText?: string | ((error: Error) => string);
  } = {}
): Promise<T> {
  const spinnerManager = SpinnerManager.getInstance();
  spinnerManager.start(text);

  return fn()
    .then((result) => {
      const successText =
        typeof options.successText === 'function'
          ? options.successText(result)
          : options.successText;
      spinnerManager.succeed(successText);
      return result;
    })
    .catch((error) => {
      const failText =
        typeof options.failText === 'function'
          ? options.failText(error)
          : options.failText || error.message;
      spinnerManager.fail(failText);
      throw error;
    });
}
