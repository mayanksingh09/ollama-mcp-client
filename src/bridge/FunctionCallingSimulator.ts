import type { MCPTool } from '../types/mcp.types';
import type { Message } from '../ollama/types';
import type { FunctionCallingTemplate, SimulatorOptions } from './types';

export class FunctionCallingSimulator {
  private options: Required<SimulatorOptions>;
  private template: FunctionCallingTemplate;

  constructor(options: SimulatorOptions = {}) {
    this.options = {
      template: options.template || this.getDefaultTemplate(),
      fewShotExamples: options.fewShotExamples !== false,
      chainOfThought: options.chainOfThought !== false,
      maxRetries: options.maxRetries || 2,
    };
    this.template = this.options.template || this.getDefaultTemplate();
  }

  private getDefaultTemplate(): FunctionCallingTemplate {
    return {
      system: `You are a helpful assistant with access to the following tools. When you need to use a tool, format your response exactly as shown in the examples.

Available tools:
{{tools}}

To use a tool, you must format your response exactly like this:
TOOL_CALL: tool_name
ARGUMENTS: {"param1": "value1", "param2": "value2"}

After using a tool, wait for the result before continuing.`,

      user: `{{message}}`,

      assistant: `{{response}}`,

      toolResult: `Tool result for {{toolName}}:
{{result}}

Based on this result, {{continuation}}`,

      examples: [
        {
          input: 'What is the weather in San Francisco?',
          output: `I'll check the weather in San Francisco for you.

TOOL_CALL: get_weather
ARGUMENTS: {"location": "San Francisco", "units": "fahrenheit"}`,
        },
        {
          input: 'Search for information about quantum computing and then summarize it.',
          output: `I'll search for information about quantum computing and provide you with a summary.

TOOL_CALL: search
ARGUMENTS: {"query": "quantum computing", "limit": 5}`,
        },
      ],
    };
  }

  preparePrompt(message: string, tools: MCPTool[], conversationHistory?: Message[]): Message[] {
    const messages: Message[] = [];

    const systemPrompt = this.buildSystemPrompt(tools);
    messages.push({ role: 'system', content: systemPrompt });

    if (this.options.fewShotExamples && this.template.examples) {
      for (const example of this.template.examples.slice(0, 2)) {
        messages.push({ role: 'user', content: example.input });
        messages.push({ role: 'assistant', content: example.output });
      }
    }

    if (conversationHistory) {
      messages.push(...conversationHistory);
    }

    if (this.options.chainOfThought) {
      const cotPrompt = this.addChainOfThought(message);
      messages.push({ role: 'user', content: cotPrompt });
    } else {
      messages.push({ role: 'user', content: message });
    }

    return messages;
  }

  private buildSystemPrompt(tools: MCPTool[]): string {
    const toolDescriptions = tools
      .map((tool) => {
        const params = this.extractParameters(tool);
        const paramStr = params.length > 0 ? ` (${params.join(', ')})` : '';
        return `- ${tool.name}${paramStr}: ${tool.description || 'No description'}`;
      })
      .join('\n');

    return this.template.system.replace('{{tools}}', toolDescriptions);
  }

  private extractParameters(tool: MCPTool): string[] {
    if (!tool.inputSchema?.properties) {
      return [];
    }

    const properties = tool.inputSchema.properties as Record<
      string,
      {
        type: string;
        description?: string;
      }
    >;
    const required = (tool.inputSchema.required || []) as string[];

    return Object.entries(properties).map(([name, schema]) => {
      const isRequired = required.includes(name);
      const typeStr = schema.type;
      const requiredStr = isRequired ? '' : '?';
      return `${name}${requiredStr}: ${typeStr}`;
    });
  }

  private addChainOfThought(message: string): string {
    return `${message}

Let's think step by step:
1. First, identify what information or action is needed
2. Determine which tool(s) would be most appropriate
3. Prepare the correct arguments for the tool(s)
4. Execute the tool call(s)

Please proceed with your analysis and tool usage.`;
  }

  enhanceResponse(response: string, tools: MCPTool[]): string {
    if (this.looksLikeFunctionCall(response)) {
      return response;
    }

    const enhancedResponse = this.detectImplicitToolUsage(response, tools);

    if (enhancedResponse !== response) {
      return enhancedResponse;
    }

    const suggestedTools = this.suggestTools(response, tools);
    if (suggestedTools.length > 0) {
      return this.addToolSuggestions(response, suggestedTools);
    }

    return response;
  }

  private looksLikeFunctionCall(response: string): boolean {
    return (
      response.includes('TOOL_CALL:') ||
      response.includes('```json') ||
      response.includes('"tool_name"') ||
      response.includes('<tool_call>')
    );
  }

  private detectImplicitToolUsage(response: string, tools: MCPTool[]): string {
    const patterns = [
      /I(?:'ll| will) (\w+) (?:the |that |this )?(.+)/i,
      /Let me (\w+) (?:the |that |this )?(.+)/i,
      /(?:I need to|I should) (\w+) (?:the |that |this )?(.+)/i,
    ];

    for (const pattern of patterns) {
      const match = response.match(pattern);
      if (match) {
        const action = match[1].toLowerCase();
        const target = match[2];

        for (const tool of tools) {
          if (this.matchesToolAction(tool.name, action)) {
            return this.reformatAsToolCall(response, tool, target);
          }
        }
      }
    }

    return response;
  }

  private matchesToolAction(toolName: string, action: string): boolean {
    const toolNameLower = toolName.toLowerCase();
    const actionVariants = this.getActionVariants(action);

    for (const variant of actionVariants) {
      if (toolNameLower.includes(variant) || variant.includes(toolNameLower)) {
        return true;
      }
    }

    return false;
  }

  private getActionVariants(action: string): string[] {
    const variants = [action];

    const synonyms: Record<string, string[]> = {
      search: ['find', 'look', 'query', 'seek'],
      get: ['fetch', 'retrieve', 'obtain', 'read'],
      create: ['make', 'generate', 'build', 'add'],
      update: ['modify', 'change', 'edit', 'patch'],
      delete: ['remove', 'destroy', 'clear', 'purge'],
      run: ['execute', 'perform', 'invoke', 'call'],
    };

    for (const [key, values] of Object.entries(synonyms)) {
      if (values.includes(action) || key === action) {
        variants.push(key, ...values);
      }
    }

    return [...new Set(variants)];
  }

  private reformatAsToolCall(response: string, tool: MCPTool, target: string): string {
    const args = this.inferArgumentsFromContext(tool, target);

    const toolCall = `
TOOL_CALL: ${tool.name}
ARGUMENTS: ${JSON.stringify(args)}`;

    const insertIndex = response.indexOf('\n\n');
    if (insertIndex > 0) {
      return response.slice(0, insertIndex) + toolCall + response.slice(insertIndex);
    }

    return response + '\n' + toolCall;
  }

  private inferArgumentsFromContext(tool: MCPTool, context: string): Record<string, unknown> {
    const args: Record<string, unknown> = {};

    if (!tool.inputSchema?.properties) {
      return { input: context };
    }

    const properties = tool.inputSchema.properties as Record<
      string,
      {
        type: string;
        description?: string;
      }
    >;

    for (const [propName, propSchema] of Object.entries(properties)) {
      if (
        propSchema.description?.toLowerCase().includes('query') ||
        propSchema.description?.toLowerCase().includes('search') ||
        propName.toLowerCase().includes('query') ||
        propName.toLowerCase().includes('search')
      ) {
        args[propName] = context;
      } else if (
        propName.toLowerCase().includes('input') ||
        propName.toLowerCase().includes('text') ||
        propName.toLowerCase().includes('content')
      ) {
        args[propName] = context;
      }
    }

    if (Object.keys(args).length === 0) {
      const firstProp = Object.keys(properties)[0];
      if (firstProp) {
        args[firstProp] = context;
      }
    }

    return args;
  }

  private suggestTools(response: string, tools: MCPTool[]): MCPTool[] {
    const suggestions: MCPTool[] = [];
    const responseLower = response.toLowerCase();

    const keywords = [
      'i need',
      'how can i',
      'i want to',
      'please help',
      'can you',
      'would you',
      'could you',
    ];

    const hasRequest = keywords.some((kw) => responseLower.includes(kw));
    if (!hasRequest) {
      return suggestions;
    }

    for (const tool of tools) {
      const relevance = this.calculateRelevance(response, tool);
      if (relevance > 0.3) {
        suggestions.push(tool);
      }
    }

    return suggestions.slice(0, 3);
  }

  private calculateRelevance(text: string, tool: MCPTool): number {
    const textLower = text.toLowerCase();
    const toolNameLower = tool.name.toLowerCase();
    const toolDescLower = (tool.description || '').toLowerCase();

    let score = 0;

    if (textLower.includes(toolNameLower)) {
      score += 0.5;
    }

    const toolWords = toolNameLower.split(/[_-]/).filter((w) => w.length > 2);
    for (const word of toolWords) {
      if (textLower.includes(word)) {
        score += 0.1;
      }
    }

    if (tool.description) {
      const descWords = toolDescLower.split(/\s+/).filter((w) => w.length > 3);
      const matchCount = descWords.filter((w) => textLower.includes(w)).length;
      score += Math.min(0.3, matchCount * 0.05);
    }

    return Math.min(1, score);
  }

  private addToolSuggestions(response: string, tools: MCPTool[]): string {
    const suggestions = tools
      .map((tool) => {
        const params = this.extractParameters(tool);
        return `- ${tool.name}${params.length > 0 ? ` (${params.join(', ')})` : ''}`;
      })
      .join('\n');

    return `${response}

[Note: You might want to use one of these tools:
${suggestions}

To use a tool, format your next message as:
TOOL_CALL: tool_name
ARGUMENTS: {"param": "value"}]`;
  }

  validateToolCall(
    response: string,
    tools: MCPTool[]
  ): {
    isValid: boolean;
    errors?: string[];
    suggestions?: string[];
  } {
    const errors: string[] = [];
    const suggestions: string[] = [];

    const toolCallMatch = response.match(/TOOL_CALL:\s*([\w-]+)/);
    if (!toolCallMatch) {
      errors.push('No tool call found in response');
      suggestions.push('Add "TOOL_CALL: tool_name" to specify which tool to use');
      return { isValid: false, errors, suggestions };
    }

    const toolName = toolCallMatch[1];
    const tool = tools.find((t) => t.name === toolName);

    if (!tool) {
      errors.push(`Unknown tool: ${toolName}`);
      const similar = this.findSimilarTools(toolName, tools);
      if (similar.length > 0) {
        suggestions.push(`Did you mean: ${similar.map((t) => t.name).join(', ')}?`);
      }
      return { isValid: false, errors, suggestions };
    }

    const argsMatch = response.match(/ARGUMENTS:\s*({[^}]+})/);
    if (!argsMatch) {
      errors.push('No arguments found for tool call');
      suggestions.push('Add "ARGUMENTS: {}" after the tool call');
      return { isValid: false, errors, suggestions };
    }

    try {
      JSON.parse(argsMatch[1]);
    } catch {
      errors.push('Invalid JSON in arguments');
      suggestions.push('Ensure arguments are valid JSON format');
      return { isValid: false, errors, suggestions };
    }

    return { isValid: errors.length === 0, errors, suggestions };
  }

  private findSimilarTools(name: string, tools: MCPTool[]): MCPTool[] {
    const nameLower = name.toLowerCase();
    return tools
      .filter((tool) => {
        const toolNameLower = tool.name.toLowerCase();
        return (
          toolNameLower.includes(nameLower) ||
          nameLower.includes(toolNameLower) ||
          this.levenshteinDistance(nameLower, toolNameLower) < 3
        );
      })
      .slice(0, 3);
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }
}
