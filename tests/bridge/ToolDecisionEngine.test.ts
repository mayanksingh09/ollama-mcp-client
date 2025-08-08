import { ToolDecisionEngine } from '../../src/bridge/ToolDecisionEngine';
import { ResponseParser } from '../../src/bridge/ResponseParser';
import { calculatorTool, searchTool, weatherTool, emailTool } from '../fixtures/toolDefinitions';
import type { MCPTool } from '../../src/types/mcp.types';

jest.mock('../../src/bridge/ResponseParser');

describe('ToolDecisionEngine', () => {
  let engine: ToolDecisionEngine;
  let mockResponseParser: jest.Mocked<ResponseParser>;

  beforeEach(() => {
    mockResponseParser = new ResponseParser() as jest.Mocked<ResponseParser>;
    engine = new ToolDecisionEngine({
      threshold: 0.6,
      maxTools: 3,
      allowChaining: true,
      requireExplicit: false,
    });
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const engine = new ToolDecisionEngine();
      expect(engine).toBeInstanceOf(ToolDecisionEngine);
    });

    it('should initialize with custom options', () => {
      const engine = new ToolDecisionEngine({
        threshold: 0.8,
        maxTools: 5,
        allowChaining: false,
        requireExplicit: true,
      });
      expect(engine).toBeInstanceOf(ToolDecisionEngine);
    });
  });

  describe('analyzeIntent', () => {
    it('should analyze user intent for tool usage', async () => {
      const tools = [calculatorTool, searchTool, weatherTool];
      const message = 'What is the weather in New York?';

      const decision = await engine.analyzeIntent(message, tools);

      expect(decision).toBeDefined();
      expect(decision.shouldUseTool).toBe(true);
      expect(decision.confidence).toBeGreaterThan(0);
      expect(decision.suggestedTools).toContain(weatherTool);
    });

    it('should identify calculator intent', async () => {
      const tools = [calculatorTool, searchTool];
      const message = 'Calculate 5 + 3';

      const decision = await engine.analyzeIntent(message, tools);

      expect(decision.shouldUseTool).toBe(true);
      expect(decision.suggestedTools[0].name).toBe('calculator');
    });

    it('should identify search intent', async () => {
      const tools = [calculatorTool, searchTool];
      const message = 'Search for information about quantum computing';

      const decision = await engine.analyzeIntent(message, tools);

      expect(decision.shouldUseTool).toBe(true);
      expect(decision.suggestedTools[0].name).toBe('search');
    });

    it('should return no tools for general conversation', async () => {
      const tools = [calculatorTool, searchTool];
      const message = 'Hello, how are you?';

      const decision = await engine.analyzeIntent(message, tools);

      expect(decision.shouldUseTool).toBe(false);
      expect(decision.suggestedTools).toHaveLength(0);
    });

    it('should respect maxTools limit', async () => {
      const engine = new ToolDecisionEngine({ maxTools: 2 });
      const tools = [calculatorTool, searchTool, weatherTool, emailTool];
      const message =
        'I need to calculate something, search for data, check weather, and send an email';

      const decision = await engine.analyzeIntent(message, tools);

      expect(decision.suggestedTools.length).toBeLessThanOrEqual(2);
    });

    it('should require explicit tool mention when requireExplicit is true', async () => {
      const engine = new ToolDecisionEngine({ requireExplicit: true });
      const tools = [calculatorTool];

      const implicitMessage = 'What is 5 plus 3?';
      const implicitDecision = await engine.analyzeIntent(implicitMessage, tools);
      expect(implicitDecision.shouldUseTool).toBe(false);

      const explicitMessage = 'Use the calculator to add 5 and 3';
      const explicitDecision = await engine.analyzeIntent(explicitMessage, tools);
      expect(explicitDecision.shouldUseTool).toBe(true);
    });
  });

  describe('scoreToolRelevance', () => {
    it('should score tool relevance based on message content', () => {
      const score = engine.scoreToolRelevance('Calculate the sum of numbers', calculatorTool);

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should give high score for exact tool name match', () => {
      const score = engine.scoreToolRelevance('Use the calculator tool', calculatorTool);

      expect(score).toBeGreaterThan(0.8);
    });

    it('should give low score for unrelated content', () => {
      const score = engine.scoreToolRelevance('Tell me a joke', calculatorTool);

      expect(score).toBeLessThan(0.3);
    });

    it('should consider tool description in scoring', () => {
      const score = engine.scoreToolRelevance('Perform arithmetic calculations', calculatorTool);

      expect(score).toBeGreaterThan(0.5);
    });
  });

  describe('extractToolParameters', () => {
    it('should extract parameters from user message', () => {
      const params = engine.extractToolParameters('Add 5 and 3', calculatorTool);

      expect(params).toHaveProperty('operation');
      expect(params).toHaveProperty('a');
      expect(params).toHaveProperty('b');
    });

    it('should extract search parameters', () => {
      const params = engine.extractToolParameters(
        'Search for "machine learning" with limit 5',
        searchTool
      );

      expect(params.query).toContain('machine learning');
      expect(params.limit).toBe(5);
    });

    it('should extract weather parameters', () => {
      const params = engine.extractToolParameters(
        'Get weather for New York in fahrenheit',
        weatherTool
      );

      expect(params.location).toContain('New York');
      expect(params.units).toBe('fahrenheit');
    });

    it('should handle missing optional parameters', () => {
      const params = engine.extractToolParameters('Get weather for London', weatherTool);

      expect(params.location).toContain('London');
      expect(params.units).toBeUndefined();
    });

    it('should validate required parameters', () => {
      const params = engine.extractToolParameters('Send an email', emailTool);

      expect(params).toBeDefined();
    });
  });

  describe('rankTools', () => {
    it('should rank tools by relevance', () => {
      const tools = [calculatorTool, searchTool, weatherTool];
      const message = 'What is the weather like?';

      const ranked = engine.rankTools(message, tools);

      expect(ranked[0].name).toBe('get_weather');
      expect(ranked.length).toBe(tools.length);
    });

    it('should filter tools below threshold', () => {
      const engine = new ToolDecisionEngine({ threshold: 0.7 });
      const tools = [calculatorTool, searchTool, weatherTool];
      const message = 'Tell me a story';

      const ranked = engine.rankTools(message, tools);

      expect(ranked.length).toBe(0);
    });
  });

  describe('tool usage history', () => {
    it('should track tool usage', () => {
      engine.recordToolUsage('calculator', true);
      engine.recordToolUsage('calculator', true);
      engine.recordToolUsage('calculator', false);

      const stats = engine.getToolUsageStats('calculator');
      expect(stats.totalCalls).toBe(3);
      expect(stats.successfulCalls).toBe(2);
      expect(stats.successRate).toBeCloseTo(0.67, 1);
    });

    it('should return zero stats for unused tools', () => {
      const stats = engine.getToolUsageStats('unknown-tool');
      expect(stats.totalCalls).toBe(0);
      expect(stats.successfulCalls).toBe(0);
      expect(stats.successRate).toBe(0);
    });

    it('should clear usage history', () => {
      engine.recordToolUsage('calculator', true);
      engine.clearUsageHistory();

      const stats = engine.getToolUsageStats('calculator');
      expect(stats.totalCalls).toBe(0);
    });
  });

  describe('chain detection', () => {
    it('should detect tool chaining opportunities', async () => {
      const tools = [calculatorTool, emailTool];
      const message = 'Calculate 5 + 3 and then email the result to john@example.com';

      const decision = await engine.analyzeIntent(message, tools);

      expect(decision.shouldUseTool).toBe(true);
      expect(decision.suggestedTools.length).toBe(2);
      expect(decision.chainable).toBe(true);
    });

    it('should not suggest chaining when disabled', async () => {
      const engine = new ToolDecisionEngine({ allowChaining: false });
      const tools = [calculatorTool, emailTool];
      const message = 'Calculate 5 + 3 and then email the result';

      const decision = await engine.analyzeIntent(message, tools);

      expect(decision.suggestedTools.length).toBe(1);
      expect(decision.chainable).toBe(false);
    });
  });

  describe('confidence calculation', () => {
    it('should calculate high confidence for clear intent', async () => {
      const tools = [calculatorTool];
      const message = 'Use the calculator to add 5 and 3';

      const decision = await engine.analyzeIntent(message, tools);

      expect(decision.confidence).toBeGreaterThan(0.8);
    });

    it('should calculate low confidence for ambiguous intent', async () => {
      const tools = [calculatorTool, searchTool];
      const message = 'Help me with something';

      const decision = await engine.analyzeIntent(message, tools);

      expect(decision.confidence).toBeLessThan(0.5);
    });

    it('should adjust confidence based on tool match quality', async () => {
      const tools = [weatherTool];

      const goodMatch = 'What is the weather in Paris?';
      const goodDecision = await engine.analyzeIntent(goodMatch, tools);

      const poorMatch = 'Is it nice outside?';
      const poorDecision = await engine.analyzeIntent(poorMatch, tools);

      expect(goodDecision.confidence).toBeGreaterThan(poorDecision.confidence);
    });
  });

  describe('pattern matching', () => {
    it('should match search patterns', () => {
      const patterns = [
        'find information about',
        'search for',
        'look up',
        'what is',
        'tell me about',
      ];

      patterns.forEach((pattern) => {
        const decision = engine.analyzeIntent(`${pattern} quantum computing`, [searchTool]);
        expect(decision).toBeDefined();
      });
    });

    it('should match creation patterns', () => {
      const patterns = ['create a new', 'make a', 'generate', 'build', 'setup'];

      patterns.forEach((pattern) => {
        const score = engine.scoreToolRelevance(`${pattern} document`, {
          name: 'create_document',
          description: 'Create a new document',
        } as MCPTool);
        expect(score).toBeGreaterThan(0.5);
      });
    });

    it('should match update patterns', () => {
      const patterns = ['update the', 'modify', 'change', 'edit', 'revise'];

      patterns.forEach((pattern) => {
        const score = engine.scoreToolRelevance(`${pattern} configuration`, {
          name: 'update_config',
          description: 'Update configuration',
        } as MCPTool);
        expect(score).toBeGreaterThan(0.5);
      });
    });
  });
});
