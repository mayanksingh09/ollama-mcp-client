import type { MCPTool } from '../types/mcp.types';
import type { ParsedToolCall, ToolDecision, ToolSelectionOptions } from './types';
import { ResponseParser } from './ResponseParser';

export class ToolDecisionEngine {
  private responseParser: ResponseParser;
  private options: Required<ToolSelectionOptions>;
  private toolUsageHistory: Map<string, number> = new Map();
  private contextualPatterns: Map<string, string[]> = new Map();

  constructor(options: ToolSelectionOptions = {}) {
    this.responseParser = new ResponseParser();
    this.options = {
      threshold: options.threshold || 0.5,
      maxTools: options.maxTools || 5,
      allowChaining: options.allowChaining !== false,
      requireExplicit: options.requireExplicit || false,
    };
    this.initializePatterns();
  }

  private initializePatterns(): void {
    this.contextualPatterns.set('search', [
      'find',
      'search',
      'look for',
      'locate',
      'query',
      'get information',
      'what is',
      'tell me about',
      'show me',
      'i need to know',
    ]);

    this.contextualPatterns.set('create', [
      'create',
      'make',
      'generate',
      'build',
      'construct',
      'add',
      'new',
      'initialize',
      'setup',
      'establish',
    ]);

    this.contextualPatterns.set('update', [
      'update',
      'modify',
      'change',
      'edit',
      'alter',
      'revise',
      'adjust',
      'configure',
      'set',
      'patch',
    ]);

    this.contextualPatterns.set('delete', [
      'delete',
      'remove',
      'destroy',
      'eliminate',
      'clear',
      'purge',
      'uninstall',
      'drop',
      'discard',
    ]);

    this.contextualPatterns.set('analyze', [
      'analyze',
      'examine',
      'inspect',
      'evaluate',
      'assess',
      'review',
      'investigate',
      'diagnose',
      'check',
    ]);

    this.contextualPatterns.set('execute', [
      'run',
      'execute',
      'perform',
      'invoke',
      'call',
      'trigger',
      'start',
      'launch',
      'initiate',
      'process',
    ]);
  }

  async analyzeResponse(
    content: string,
    tools: MCPTool[],
    context?: string
  ): Promise<ToolDecision> {
    const parsedCalls = this.responseParser.parse(content, tools);

    if (this.options.requireExplicit && parsedCalls.length === 0) {
      return {
        shouldInvoke: false,
        toolCalls: [],
        reasoning: 'No explicit tool calls found',
        confidence: 0,
      };
    }

    const implicitCalls = this.detectImplicitToolCalls(content, tools, context);

    const allCalls = [...parsedCalls, ...implicitCalls];

    const filteredCalls = this.filterAndRankCalls(allCalls);

    const shouldInvoke =
      filteredCalls.length > 0 && filteredCalls[0].confidence >= this.options.threshold;

    const finalCalls =
      this.options.maxTools > 0 ? filteredCalls.slice(0, this.options.maxTools) : filteredCalls;

    if (this.options.allowChaining) {
      this.detectChainedCalls(content, tools, finalCalls);
    }

    const reasoning = this.generateReasoning(finalCalls, content);
    const avgConfidence =
      finalCalls.length > 0
        ? finalCalls.reduce((sum, call) => sum + call.confidence, 0) / finalCalls.length
        : 0;

    for (const call of finalCalls) {
      this.updateUsageHistory(call.toolName);
    }

    return {
      shouldInvoke,
      toolCalls: finalCalls,
      reasoning,
      confidence: avgConfidence,
    };
  }

  private detectImplicitToolCalls(
    content: string,
    tools: MCPTool[],
    context?: string
  ): ParsedToolCall[] {
    const implicitCalls: ParsedToolCall[] = [];
    const contentLower = content.toLowerCase();
    const contextLower = context?.toLowerCase() || '';

    for (const tool of tools) {
      const score = this.calculateToolRelevance(tool, contentLower, contextLower);

      if (score > 0.3) {
        const args = this.inferArguments(tool, content, context);

        implicitCalls.push({
          toolName: tool.name,
          arguments: args,
          confidence: score,
          rawMatch: 'implicit',
        });
      }
    }

    return implicitCalls;
  }

  private calculateToolRelevance(
    tool: MCPTool,
    contentLower: string,
    contextLower: string
  ): number {
    let score = 0;
    const toolNameLower = tool.name.toLowerCase();
    const toolDescLower = (tool.description || '').toLowerCase();

    if (contentLower.includes(toolNameLower)) {
      score += 0.5;
    }

    const nameWords = toolNameLower.split(/[_-]/).filter((w) => w.length > 2);
    for (const word of nameWords) {
      if (contentLower.includes(word)) {
        score += 0.1;
      }
    }

    for (const [category, patterns] of this.contextualPatterns) {
      const categoryInTool = toolNameLower.includes(category) || toolDescLower.includes(category);

      if (categoryInTool) {
        for (const pattern of patterns) {
          if (contentLower.includes(pattern)) {
            score += 0.15;
          }
        }
      }
    }

    const usageCount = this.toolUsageHistory.get(tool.name) || 0;
    if (usageCount > 0 && contextLower) {
      score += Math.min(0.2, usageCount * 0.02);
    }

    if (tool.description) {
      const descWords = tool.description.toLowerCase().split(/\s+/);
      const matchingWords = descWords.filter(
        (word) => word.length > 3 && contentLower.includes(word)
      );
      score += Math.min(0.3, matchingWords.length * 0.05);
    }

    return Math.min(1, score);
  }

  private inferArguments(
    tool: MCPTool,
    content: string,
    context?: string
  ): Record<string, unknown> {
    const args: Record<string, unknown> = {};

    if (!tool.inputSchema?.properties) {
      return args;
    }

    const properties = tool.inputSchema.properties as Record<
      string,
      {
        type: string;
        description?: string;
        default?: unknown;
        enum?: unknown[];
      }
    >;

    const required = (tool.inputSchema.required || []) as string[];

    for (const [propName, propSchema] of Object.entries(properties)) {
      let value = this.extractValue(propName, propSchema, content);

      if (value === undefined && context) {
        value = this.extractValue(propName, propSchema, context);
      }

      if (value === undefined && propSchema.default !== undefined) {
        value = propSchema.default;
      }

      if (value === undefined && required.includes(propName)) {
        value = this.generateDefaultValue(propSchema.type);
      }

      if (value !== undefined) {
        args[propName] = value;
      }
    }

    return args;
  }

  private extractValue(
    propName: string,
    propSchema: { type: string; enum?: unknown[] },
    text: string
  ): unknown {
    const patterns = [
      new RegExp(`${propName}[:\\s]+([^,\\n]+)`, 'i'),
      new RegExp(`"${propName}"[:\\s]*"([^"]+)"`, 'i'),
      new RegExp(`${propName}\\s*=\\s*([^,\\n]+)`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const rawValue = match[1].trim();
        return this.parseValue(rawValue, propSchema.type);
      }
    }

    if (propSchema.enum) {
      for (const enumValue of propSchema.enum) {
        if (text.toLowerCase().includes(String(enumValue).toLowerCase())) {
          return enumValue;
        }
      }
    }

    return undefined;
  }

  private parseValue(value: string, type: string): unknown {
    switch (type) {
      case 'number':
        return parseFloat(value);
      case 'integer':
        return parseInt(value, 10);
      case 'boolean':
        return value.toLowerCase() === 'true' || value === '1';
      case 'array':
        try {
          return JSON.parse(value);
        } catch {
          return value.split(',').map((s) => s.trim());
        }
      case 'object':
        try {
          return JSON.parse(value);
        } catch {
          return { value };
        }
      default:
        return value;
    }
  }

  private generateDefaultValue(type: string): unknown {
    switch (type) {
      case 'string':
        return '';
      case 'number':
      case 'integer':
        return 0;
      case 'boolean':
        return false;
      case 'array':
        return [];
      case 'object':
        return {};
      default:
        return null;
    }
  }

  private filterAndRankCalls(calls: ParsedToolCall[]): ParsedToolCall[] {
    const uniqueCalls = new Map<string, ParsedToolCall>();

    for (const call of calls) {
      const key = `${call.toolName}:${JSON.stringify(call.arguments)}`;
      const existing = uniqueCalls.get(key);

      if (!existing || call.confidence > existing.confidence) {
        uniqueCalls.set(key, call);
      }
    }

    const filtered = Array.from(uniqueCalls.values());

    filtered.sort((a, b) => {
      const confidenceDiff = b.confidence - a.confidence;
      if (Math.abs(confidenceDiff) > 0.1) {
        return confidenceDiff;
      }

      const aUsage = this.toolUsageHistory.get(a.toolName) || 0;
      const bUsage = this.toolUsageHistory.get(b.toolName) || 0;
      return bUsage - aUsage;
    });

    return filtered;
  }

  private detectChainedCalls(
    content: string,
    tools: MCPTool[],
    currentCalls: ParsedToolCall[]
  ): void {
    const chainIndicators = [
      'then',
      'after that',
      'next',
      'followed by',
      'and then',
      'subsequently',
      'afterwards',
      'finally',
    ];

    const contentLower = content.toLowerCase();
    let hasChainIndicator = false;

    for (const indicator of chainIndicators) {
      if (contentLower.includes(indicator)) {
        hasChainIndicator = true;
        break;
      }
    }

    if (!hasChainIndicator || currentCalls.length === 0) {
      return;
    }

    const segments = content.split(/(?:then|after that|next|followed by|and then)/i);

    if (segments.length <= 1) {
      return;
    }

    for (let i = 1; i < segments.length; i++) {
      const segment = segments[i];
      const segmentCalls = this.responseParser.parse(segment, tools);

      for (const call of segmentCalls) {
        if (!currentCalls.some((c) => c.toolName === call.toolName)) {
          call.confidence *= 0.8;
          currentCalls.push(call);
        }
      }
    }
  }

  private generateReasoning(calls: ParsedToolCall[], _content: string): string {
    if (calls.length === 0) {
      return 'No tool invocation needed';
    }

    const reasons: string[] = [];

    for (const call of calls) {
      if (call.confidence >= 0.8) {
        reasons.push(`High confidence match for ${call.toolName}`);
      } else if (call.confidence >= 0.5) {
        reasons.push(`Moderate confidence match for ${call.toolName}`);
      } else {
        reasons.push(`Possible match for ${call.toolName}`);
      }
    }

    if (calls.length > 1 && this.options.allowChaining) {
      reasons.push('Multiple tools detected for chained execution');
    }

    const explicitCount = calls.filter((c) => c.rawMatch !== 'implicit').length;
    if (explicitCount > 0) {
      reasons.push(`${explicitCount} explicit tool call(s) found`);
    }

    return reasons.join('; ');
  }

  private updateUsageHistory(toolName: string): void {
    const current = this.toolUsageHistory.get(toolName) || 0;
    this.toolUsageHistory.set(toolName, current + 1);

    if (this.toolUsageHistory.size > 100) {
      const entries = Array.from(this.toolUsageHistory.entries());
      entries.sort((a, b) => a[1] - b[1]);

      for (let i = 0; i < 20; i++) {
        this.toolUsageHistory.delete(entries[i][0]);
      }
    }
  }

  resetHistory(): void {
    this.toolUsageHistory.clear();
  }

  setOptions(options: Partial<ToolSelectionOptions>): void {
    this.options = {
      ...this.options,
      ...options,
    };
  }

  addContextualPattern(category: string, patterns: string[]): void {
    const existing = this.contextualPatterns.get(category) || [];
    this.contextualPatterns.set(category, [...existing, ...patterns]);
  }

  // Adapter methods for test compatibility
  async analyzeIntent(
    message: string,
    tools: MCPTool[]
  ): Promise<{
    shouldUseTool: boolean;
    confidence: number;
    suggestedTools: MCPTool[];
    reasoning?: string;
  }> {
    const decision = await this.analyzeResponse(message, tools);

    const suggestedTools = decision.toolCalls
      .map((call) => {
        const tool = tools.find((t) => t.name === call.toolName);
        return tool;
      })
      .filter((tool): tool is MCPTool => tool !== undefined);

    return {
      shouldUseTool: decision.shouldInvoke,
      confidence: decision.confidence,
      suggestedTools,
      reasoning: decision.reasoning,
    };
  }

  scoreToolRelevance(tool: MCPTool, message: string): number {
    return this.calculateToolRelevance(tool, message.toLowerCase(), '');
  }

  extractToolParameters(tool: MCPTool, message: string): Record<string, unknown> {
    return this.inferArguments(tool, message);
  }

  rankTools(tools: MCPTool[], message: string): MCPTool[] {
    const scores = tools.map((tool) => ({
      tool,
      score: this.calculateToolRelevance(tool, message.toLowerCase(), ''),
    }));

    scores.sort((a, b) => b.score - a.score);
    return scores.map((s) => s.tool);
  }

  detectChainedTools(message: string, tools: MCPTool[]): MCPTool[] {
    const calls: ParsedToolCall[] = [];
    this.detectChainedCalls(message, tools, calls);

    const chainedTools = calls
      .map((call) => {
        const tool = tools.find((t) => t.name === call.toolName);
        return tool;
      })
      .filter((tool): tool is MCPTool => tool !== undefined);

    return chainedTools;
  }

  validateToolCall(
    tool: MCPTool,
    args: Record<string, unknown>
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!tool.inputSchema?.properties) {
      return { valid: true, errors: [] };
    }

    const required = (tool.inputSchema.required || []) as string[];
    const properties = tool.inputSchema.properties as Record<string, unknown>;

    for (const reqField of required) {
      if (!(reqField in args)) {
        errors.push(`Missing required field: ${reqField}`);
      }
    }

    for (const [key] of Object.entries(args)) {
      if (!(key in properties)) {
        errors.push(`Unknown field: ${key}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  parseToolCall(message: string, tools: MCPTool[]): ParsedToolCall | null {
    const calls = this.responseParser.parse(message, tools);
    return calls.length > 0 ? calls[0] : null;
  }

  updateOptions(options: Partial<ToolSelectionOptions>): void {
    this.setOptions(options);
  }

  getUsageStats(): Record<string, number> {
    return Object.fromEntries(this.toolUsageHistory);
  }

  clearUsageHistory(): void {
    this.resetHistory();
  }
}
