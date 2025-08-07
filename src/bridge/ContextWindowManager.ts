import type { Message } from '../ollama/types';
import type { ContextWindow, ContextManagementStrategy, TokenEstimator } from './types';

export class ContextWindowManager {
  private strategies: Map<string, ContextManagementStrategy> = new Map();
  private activeStrategy: string = 'sliding';
  private tokenEstimator: TokenEstimator;
  private modelLimits: Map<string, number> = new Map([
    ['llama2', 4096],
    ['llama3', 8192],
    ['mixtral', 32768],
    ['qwen', 32768],
    ['gemma', 8192],
    ['phi', 2048],
    ['mistral', 8192],
    ['codellama', 16384],
    ['deepseek-coder', 16384],
    ['default', 4096],
  ]);

  constructor(tokenEstimator?: TokenEstimator) {
    this.tokenEstimator = tokenEstimator || new SimpleTokenEstimator();
    this.initializeStrategies();
  }

  private initializeStrategies(): void {
    this.strategies.set('sliding', new SlidingWindowStrategy(this.tokenEstimator));
    this.strategies.set('summarization', new SummarizationStrategy(this.tokenEstimator));
    this.strategies.set('importance', new ImportanceBasedStrategy(this.tokenEstimator));
    this.strategies.set('hybrid', new HybridStrategy(this.tokenEstimator));
  }

  setStrategy(strategyName: string): void {
    if (!this.strategies.has(strategyName)) {
      throw new Error(`Unknown strategy: ${strategyName}`);
    }
    this.activeStrategy = strategyName;
  }

  addStrategy(name: string, strategy: ContextManagementStrategy): void {
    this.strategies.set(name, strategy);
  }

  getModelLimit(modelName: string): number {
    const normalizedName = modelName.toLowerCase();

    for (const [key, limit] of this.modelLimits.entries()) {
      if (normalizedName.includes(key)) {
        return limit;
      }
    }

    return this.modelLimits.get('default') || 4096;
  }

  setModelLimit(modelName: string, limit: number): void {
    this.modelLimits.set(modelName.toLowerCase(), limit);
  }

  manageWindow(messages: Message[], modelName: string, reservedTokens = 0): ContextWindow {
    const maxTokens = this.getModelLimit(modelName) - reservedTokens;
    const currentTokens = this.tokenEstimator.estimateMessages(messages);

    const window: ContextWindow = {
      messages,
      tokenCount: currentTokens,
      maxTokens,
      modelName,
    };

    if (currentTokens <= maxTokens) {
      return window;
    }

    const strategy = this.strategies.get(this.activeStrategy);
    if (!strategy) {
      throw new Error(`Strategy not found: ${this.activeStrategy}`);
    }

    const truncatedMessages = strategy.truncate(window);
    const newTokenCount = this.tokenEstimator.estimateMessages(truncatedMessages);

    return {
      messages: truncatedMessages,
      tokenCount: newTokenCount,
      maxTokens,
      modelName,
    };
  }

  estimateTokens(messages: Message[]): number {
    return this.tokenEstimator.estimateMessages(messages);
  }

  calculateAvailableTokens(modelName: string, usedTokens: number): number {
    const limit = this.getModelLimit(modelName);
    return Math.max(0, limit - usedTokens);
  }

  canFitMessage(message: Message, currentWindow: ContextWindow): boolean {
    const messageTokens = this.tokenEstimator.estimate(message.content);
    return currentWindow.tokenCount + messageTokens <= currentWindow.maxTokens;
  }

  splitMessage(message: Message, maxTokens: number): Message[] {
    const content = message.content;
    const totalTokens = this.tokenEstimator.estimate(content);

    if (totalTokens <= maxTokens) {
      return [message];
    }

    const parts: Message[] = [];
    const charsPerToken = content.length / totalTokens;
    const maxChars = Math.floor(maxTokens * charsPerToken);

    let currentIndex = 0;
    let partIndex = 0;

    while (currentIndex < content.length) {
      const endIndex = Math.min(currentIndex + maxChars, content.length);
      const partContent = content.substring(currentIndex, endIndex);

      parts.push({
        ...message,
        content: partIndex === 0 ? partContent : `[continued] ${partContent}`,
      });

      currentIndex = endIndex;
      partIndex++;
    }

    return parts;
  }

  getStatistics(window: ContextWindow): {
    utilization: number;
    messageCount: number;
    averageTokensPerMessage: number;
    remainingTokens: number;
  } {
    const utilization = (window.tokenCount / window.maxTokens) * 100;
    const messageCount = window.messages.length;
    const averageTokensPerMessage = messageCount > 0 ? window.tokenCount / messageCount : 0;
    const remainingTokens = window.maxTokens - window.tokenCount;

    return {
      utilization,
      messageCount,
      averageTokensPerMessage,
      remainingTokens,
    };
  }
}

class SlidingWindowStrategy implements ContextManagementStrategy {
  name = 'sliding';

  constructor(private tokenEstimator: TokenEstimator) {}

  truncate(window: ContextWindow): Message[] {
    const messages = [...window.messages];
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    const systemTokens = this.tokenEstimator.estimateMessages(systemMessages);
    const availableTokens = window.maxTokens - systemTokens;

    const truncatedMessages: Message[] = [];
    let currentTokens = 0;

    for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
      const message = nonSystemMessages[i];
      const messageTokens = this.tokenEstimator.estimate(message.content);

      if (currentTokens + messageTokens > availableTokens) {
        break;
      }

      truncatedMessages.unshift(message);
      currentTokens += messageTokens;
    }

    return [...systemMessages, ...truncatedMessages];
  }

  summarize(messages: Message[]): Message {
    const userMessages = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content.substring(0, 100))
      .join('; ');

    return {
      role: 'system',
      content: `Previous conversation summary: ${userMessages}`,
    };
  }
}

class SummarizationStrategy implements ContextManagementStrategy {
  name = 'summarization';

  constructor(_tokenEstimator: TokenEstimator) {}

  truncate(window: ContextWindow): Message[] {
    const messages = [...window.messages];
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    if (nonSystemMessages.length <= 4) {
      return messages;
    }

    const recentCount = Math.floor(nonSystemMessages.length * 0.3);
    const oldMessages = nonSystemMessages.slice(0, -recentCount);
    const recentMessages = nonSystemMessages.slice(-recentCount);

    const summary = this.summarize(oldMessages);

    return [...systemMessages, summary, ...recentMessages];
  }

  summarize(messages: Message[]): Message {
    const topics = new Set<string>();
    const actions = new Set<string>();

    for (const message of messages) {
      if (message.role === 'user') {
        const words = message.content.split(' ').slice(0, 10);
        topics.add(words.join(' '));
      } else if (message.role === 'assistant') {
        if (message.tool_calls && message.tool_calls.length > 0) {
          for (const call of message.tool_calls) {
            actions.add(call.function.name);
          }
        }
      }
    }

    const topicsSummary = Array.from(topics).slice(0, 3).join('; ');
    const actionsSummary = Array.from(actions).slice(0, 5).join(', ');

    return {
      role: 'system',
      content: `Conversation history (${messages.length} messages): Topics discussed: ${topicsSummary}. Tools used: ${actionsSummary || 'none'}.`,
    };
  }
}

class ImportanceBasedStrategy implements ContextManagementStrategy {
  name = 'importance';

  constructor(private tokenEstimator: TokenEstimator) {}

  truncate(window: ContextWindow): Message[] {
    const messages = [...window.messages];
    const scoredMessages = messages.map((msg, index) => ({
      message: msg,
      score: this.calculateImportance(msg, index, messages.length),
      index,
    }));

    scoredMessages.sort((a, b) => b.score - a.score);

    const selectedMessages: typeof scoredMessages = [];
    let currentTokens = 0;

    for (const item of scoredMessages) {
      const messageTokens = this.tokenEstimator.estimate(item.message.content);
      if (currentTokens + messageTokens <= window.maxTokens) {
        selectedMessages.push(item);
        currentTokens += messageTokens;
      }
    }

    selectedMessages.sort((a, b) => a.index - b.index);
    return selectedMessages.map((item) => item.message);
  }

  private calculateImportance(message: Message, index: number, totalMessages: number): number {
    let score = 0;

    if (message.role === 'system') {
      score += 100;
    }

    const recencyScore = (index / totalMessages) * 50;
    score += recencyScore;

    if (message.tool_calls && message.tool_calls.length > 0) {
      score += 30;
    }

    if (message.content.includes('error') || message.content.includes('Error')) {
      score += 20;
    }

    if (message.content.includes('important') || message.content.includes('critical')) {
      score += 25;
    }

    if (message.content.length > 500) {
      score += 10;
    }

    return score;
  }

  summarize(messages: Message[]): Message {
    return {
      role: 'system',
      content: `[${messages.length} messages summarized based on importance]`,
    };
  }
}

class HybridStrategy implements ContextManagementStrategy {
  name = 'hybrid';
  private slidingStrategy: SlidingWindowStrategy;
  private importanceStrategy: ImportanceBasedStrategy;

  constructor(tokenEstimator: TokenEstimator) {
    this.slidingStrategy = new SlidingWindowStrategy(tokenEstimator);
    this.importanceStrategy = new ImportanceBasedStrategy(tokenEstimator);
  }

  truncate(window: ContextWindow): Message[] {
    const halfTokens = Math.floor(window.maxTokens / 2);

    const slidingWindow: ContextWindow = {
      ...window,
      maxTokens: halfTokens,
    };
    const slidingMessages = this.slidingStrategy.truncate(slidingWindow);

    const importanceWindow: ContextWindow = {
      messages: window.messages.filter((msg) => !slidingMessages.includes(msg)),
      tokenCount: 0,
      maxTokens: halfTokens,
      modelName: window.modelName,
    };
    const importantMessages = this.importanceStrategy.truncate(importanceWindow);

    const combined = [...importantMessages, ...slidingMessages];
    const uniqueMessages = Array.from(new Set(combined));

    return uniqueMessages.sort((a, b) => {
      const indexA = window.messages.indexOf(a);
      const indexB = window.messages.indexOf(b);
      return indexA - indexB;
    });
  }

  summarize(messages: Message[]): Message {
    return this.slidingStrategy.summarize(messages);
  }
}

class SimpleTokenEstimator implements TokenEstimator {
  estimate(text: string): number {
    return Math.ceil(text.length / 4);
  }

  estimateMessages(messages: Message[]): number {
    return messages.reduce((sum, msg) => {
      let tokens = this.estimate(msg.content);

      if (msg.tool_calls) {
        for (const call of msg.tool_calls) {
          tokens += this.estimate(JSON.stringify(call));
        }
      }

      return sum + tokens;
    }, 0);
  }
}
