export interface InkUIOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  system?: string;
  config?: string;
}

export function launchInkUI(options: InkUIOptions): void;
