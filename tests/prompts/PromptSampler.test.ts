/**
 * PromptSampler unit tests
 */

import { PromptSampler } from '../../src/prompts/PromptSampler';
import type { PromptExecutionResult } from '../../src/types/prompts.types';

describe('PromptSampler', () => {
  let sampler: PromptSampler;

  beforeEach(() => {
    sampler = new PromptSampler({
      enabled: true,
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      maxRetries: 3,
      timeout: 5000,
    });
  });

  describe('sample', () => {
    it('should apply temperature sampling', async () => {
      const result: PromptExecutionResult = {
        promptName: 'test',
        messages: [
          {
            role: 'assistant',
            content: 'Original response with some variations possible',
          },
        ],
        serverId: 'server',
        executionTime: 100,
      };

      const sampled = await sampler.sample(result, {
        temperature: 1.0, // High temperature for more variation
      });

      expect(sampled).toBeDefined();
      expect(sampled.promptName).toBe('test');
      expect(sampled.messages).toHaveLength(1);
      expect(sampled.messages[0].role).toBe('assistant');
      // Content might be modified based on sampling
      expect(sampled.messages[0].content).toBeDefined();
      expect(sampled.metadata?.sampling).toBeDefined();
      expect(sampled.metadata?.sampling.temperature).toBe(1.0);
    });

    it('should apply topP sampling', async () => {
      const result: PromptExecutionResult = {
        promptName: 'test',
        messages: [
          {
            role: 'assistant',
            content: 'Test response for topP sampling',
          },
        ],
        serverId: 'server',
        executionTime: 50,
      };

      const sampled = await sampler.sample(result, {
        topP: 0.5, // More restrictive topP
      });

      expect(sampled).toBeDefined();
      expect(sampled.metadata?.sampling.topP).toBe(0.5);
    });

    it('should apply topK sampling', async () => {
      const result: PromptExecutionResult = {
        promptName: 'test',
        messages: [
          {
            role: 'assistant',
            content: 'Test response for topK sampling',
          },
        ],
        serverId: 'server',
        executionTime: 50,
      };

      const sampled = await sampler.sample(result, {
        topK: 10, // Limit to top 10 tokens
      });

      expect(sampled).toBeDefined();
      expect(sampled.metadata?.sampling.topK).toBe(10);
    });

    it('should handle disabled sampling', async () => {
      const disabledSampler = new PromptSampler({
        enabled: false,
      });

      const result: PromptExecutionResult = {
        promptName: 'test',
        messages: [
          {
            role: 'assistant',
            content: 'Original content should not change',
          },
        ],
        serverId: 'server',
        executionTime: 100,
      };

      const sampled = await disabledSampler.sample(result);

      // Should return original result unchanged
      expect(sampled).toEqual(result);
    });

    it('should preserve non-assistant messages', async () => {
      const result: PromptExecutionResult = {
        promptName: 'test',
        messages: [
          {
            role: 'user',
            content: 'User message should not be sampled',
          },
          {
            role: 'assistant',
            content: 'Assistant message may be sampled',
          },
          {
            role: 'system',
            content: 'System message should not be sampled',
          },
        ],
        serverId: 'server',
        executionTime: 100,
      };

      const sampled = await sampler.sample(result);

      expect(sampled.messages).toHaveLength(3);
      expect(sampled.messages[0].content).toBe('User message should not be sampled');
      expect(sampled.messages[2].content).toBe('System message should not be sampled');
    });
  });

  describe('sampleMultiple', () => {
    it('should generate multiple samples', async () => {
      const result: PromptExecutionResult = {
        promptName: 'test',
        messages: [
          {
            role: 'assistant',
            content: 'Base response for multiple sampling',
          },
        ],
        serverId: 'server',
        executionTime: 100,
      };

      const samples = await sampler.sampleMultiple(result, 3, {
        temperature: 0.8,
      });

      expect(samples).toHaveLength(3);
      samples.forEach((sample, index) => {
        expect(sample.promptName).toBe('test');
        expect(sample.metadata?.sampling.sampleIndex).toBe(index);
        expect(sample.metadata?.sampling.totalSamples).toBe(3);
      });
    });

    it('should handle sampling errors gracefully', async () => {
      const result: PromptExecutionResult = {
        promptName: 'test',
        messages: [],
        serverId: 'server',
        executionTime: 100,
      };

      const samples = await sampler.sampleMultiple(result, 2);

      // Should return original result when no messages to sample
      expect(samples).toHaveLength(2);
      samples.forEach((sample) => {
        expect(sample.messages).toHaveLength(0);
      });
    });
  });

  describe('rankSamples', () => {
    it('should rank samples by quality score', () => {
      const samples: PromptExecutionResult[] = [
        {
          promptName: 'test',
          messages: [{ role: 'assistant', content: 'Short' }],
          serverId: 'server',
          executionTime: 50,
          metadata: { quality: 0.5 },
        },
        {
          promptName: 'test',
          messages: [{ role: 'assistant', content: 'This is a longer response' }],
          serverId: 'server',
          executionTime: 50,
          metadata: { quality: 0.8 },
        },
        {
          promptName: 'test',
          messages: [{ role: 'assistant', content: 'Medium length' }],
          serverId: 'server',
          executionTime: 50,
          metadata: { quality: 0.6 },
        },
      ];

      const ranked = sampler.rankSamples(samples);

      expect(ranked).toHaveLength(3);
      // Should be sorted by quality score (or content length as proxy)
      expect(ranked[0].messages[0].content.length).toBeGreaterThanOrEqual(
        ranked[1].messages[0].content.length
      );
    });

    it('should handle empty samples array', () => {
      const ranked = sampler.rankSamples([]);
      expect(ranked).toEqual([]);
    });
  });

  describe('selectBest', () => {
    it('should select the best sample from multiple', async () => {
      const result: PromptExecutionResult = {
        promptName: 'test',
        messages: [
          {
            role: 'assistant',
            content: 'Base response',
          },
        ],
        serverId: 'server',
        executionTime: 100,
      };

      const best = await sampler.selectBest(result, 5, {
        temperature: 0.9,
      });

      expect(best).toBeDefined();
      expect(best.promptName).toBe('test');
      expect(best.metadata?.sampling.selected).toBe(true);
      expect(best.metadata?.sampling.totalCandidates).toBe(5);
    });

    it('should return original if only 1 sample requested', async () => {
      const result: PromptExecutionResult = {
        promptName: 'test',
        messages: [
          {
            role: 'assistant',
            content: 'Single response',
          },
        ],
        serverId: 'server',
        executionTime: 100,
      };

      const best = await sampler.selectBest(result, 1);

      expect(best.messages[0].content).toBe('Single response');
      expect(best.metadata?.sampling.totalCandidates).toBe(1);
    });
  });

  describe('applyConstraints', () => {
    it('should apply length constraints', () => {
      const result: PromptExecutionResult = {
        promptName: 'test',
        messages: [
          {
            role: 'assistant',
            content:
              'This is a very long response that exceeds the maximum length constraint and should be truncated',
          },
        ],
        serverId: 'server',
        executionTime: 100,
      };

      const constrained = sampler.applyConstraints(result, {
        maxLength: 20,
      });

      expect(constrained.messages[0].content.length).toBeLessThanOrEqual(23); // 20 + '...'
    });

    it('should apply minimum length constraints', () => {
      const result: PromptExecutionResult = {
        promptName: 'test',
        messages: [
          {
            role: 'assistant',
            content: 'Short',
          },
        ],
        serverId: 'server',
        executionTime: 100,
      };

      const constrained = sampler.applyConstraints(result, {
        minLength: 10,
      });

      // Should pad or indicate constraint wasn't met
      expect(constrained.metadata?.constraints?.minLength).toBe(10);
    });

    it('should apply format constraints', () => {
      const result: PromptExecutionResult = {
        promptName: 'test',
        messages: [
          {
            role: 'assistant',
            content: '  Whitespace  around  text  ',
          },
        ],
        serverId: 'server',
        executionTime: 100,
      };

      const constrained = sampler.applyConstraints(result, {
        format: 'trim',
      });

      expect(constrained.messages[0].content).toBe('Whitespace  around  text');
    });

    it('should handle multiple constraints', () => {
      const result: PromptExecutionResult = {
        promptName: 'test',
        messages: [
          {
            role: 'assistant',
            content: '  This is a response with multiple constraints applied  ',
          },
        ],
        serverId: 'server',
        executionTime: 100,
      };

      const constrained = sampler.applyConstraints(result, {
        format: 'trim',
        maxLength: 30,
        minLength: 10,
      });

      const content = constrained.messages[0].content;
      expect(content.startsWith(' ')).toBe(false);
      expect(content.endsWith(' ')).toBe(false);
      expect(content.length).toBeLessThanOrEqual(33); // 30 + potential '...'
    });
  });

  describe('getStats', () => {
    it('should track sampling statistics', async () => {
      const result: PromptExecutionResult = {
        promptName: 'test',
        messages: [
          {
            role: 'assistant',
            content: 'Test',
          },
        ],
        serverId: 'server',
        executionTime: 100,
      };

      // Initial stats
      let stats = sampler.getStats();
      expect(stats.totalSamples).toBe(0);
      expect(stats.averageSampleTime).toBe(0);

      // Perform some sampling
      await sampler.sample(result);
      await sampler.sampleMultiple(result, 3);

      stats = sampler.getStats();
      expect(stats.totalSamples).toBe(4); // 1 + 3
      expect(stats.averageSampleTime).toBeGreaterThan(0);
      expect(stats.samplingMethods).toBeDefined();
    });
  });

  describe('reset', () => {
    it('should reset sampler state and statistics', async () => {
      const result: PromptExecutionResult = {
        promptName: 'test',
        messages: [
          {
            role: 'assistant',
            content: 'Test',
          },
        ],
        serverId: 'server',
        executionTime: 100,
      };

      // Perform sampling
      await sampler.sample(result);

      // Reset
      sampler.reset();

      const stats = sampler.getStats();
      expect(stats.totalSamples).toBe(0);
      expect(stats.averageSampleTime).toBe(0);
    });
  });
});
