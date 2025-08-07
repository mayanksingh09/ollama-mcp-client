/**
 * ToolRegistry unit tests
 */

import { ToolRegistry } from '../../src/tools/ToolRegistry';
import type { ExtendedTool, ToolChain } from '../../src/types/tools.types';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('registerTool', () => {
    it('should register a tool successfully', () => {
      const tool: ExtendedTool = {
        name: 'test-tool',
        description: 'A test tool',
        serverId: 'server1',
        inputSchema: {
          type: 'object',
          properties: {
            param1: { type: 'string' },
          },
        },
        isAvailable: true,
        lastUsed: new Date(),
        useCount: 0,
      };

      registry.registerTool(tool);

      const retrieved = registry.getTool('test-tool', 'server1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('test-tool');
      expect(retrieved?.serverId).toBe('server1');
    });

    it('should update existing tool when re-registering', () => {
      const tool1: ExtendedTool = {
        name: 'test-tool',
        description: 'Original description',
        serverId: 'server1',
        isAvailable: true,
        lastUsed: new Date(),
        useCount: 5,
      };

      const tool2: ExtendedTool = {
        name: 'test-tool',
        description: 'Updated description',
        serverId: 'server1',
        isAvailable: true,
        lastUsed: new Date(),
        useCount: 10,
      };

      registry.registerTool(tool1);
      registry.registerTool(tool2);

      const retrieved = registry.getTool('test-tool', 'server1');
      expect(retrieved?.description).toBe('Updated description');
      expect(retrieved?.useCount).toBe(10);
    });

    it('should handle tools from different servers', () => {
      const tool1: ExtendedTool = {
        name: 'shared-tool',
        serverId: 'server1',
        isAvailable: true,
        lastUsed: new Date(),
        useCount: 0,
      };

      const tool2: ExtendedTool = {
        name: 'shared-tool',
        serverId: 'server2',
        isAvailable: true,
        lastUsed: new Date(),
        useCount: 0,
      };

      registry.registerTool(tool1);
      registry.registerTool(tool2);

      const fromServer1 = registry.getTool('shared-tool', 'server1');
      const fromServer2 = registry.getTool('shared-tool', 'server2');

      expect(fromServer1?.serverId).toBe('server1');
      expect(fromServer2?.serverId).toBe('server2');
    });
  });

  describe('unregisterTool', () => {
    it('should unregister a tool', () => {
      const tool: ExtendedTool = {
        name: 'test-tool',
        serverId: 'server1',
        isAvailable: true,
        lastUsed: new Date(),
        useCount: 0,
      };

      registry.registerTool(tool);
      expect(registry.getTool('test-tool', 'server1')).toBeDefined();

      registry.unregisterTool('test-tool', 'server1');
      expect(registry.getTool('test-tool', 'server1')).toBeUndefined();
    });

    it('should not affect tools from other servers', () => {
      const tool1: ExtendedTool = {
        name: 'shared-tool',
        serverId: 'server1',
        isAvailable: true,
        lastUsed: new Date(),
        useCount: 0,
      };

      const tool2: ExtendedTool = {
        name: 'shared-tool',
        serverId: 'server2',
        isAvailable: true,
        lastUsed: new Date(),
        useCount: 0,
      };

      registry.registerTool(tool1);
      registry.registerTool(tool2);

      registry.unregisterTool('shared-tool', 'server1');

      expect(registry.getTool('shared-tool', 'server1')).toBeUndefined();
      expect(registry.getTool('shared-tool', 'server2')).toBeDefined();
    });
  });

  describe('getTool', () => {
    it('should return undefined for non-existent tool', () => {
      const tool = registry.getTool('non-existent', 'server1');
      expect(tool).toBeUndefined();
    });

    it('should find tool by name when server not specified', () => {
      const tool: ExtendedTool = {
        name: 'unique-tool',
        serverId: 'server1',
        isAvailable: true,
        lastUsed: new Date(),
        useCount: 0,
      };

      registry.registerTool(tool);

      const found = registry.getTool('unique-tool');
      expect(found).toBeDefined();
      expect(found?.name).toBe('unique-tool');
    });

    it('should return first available tool when multiple servers have it', () => {
      const tool1: ExtendedTool = {
        name: 'shared-tool',
        serverId: 'server1',
        isAvailable: false,
        lastUsed: new Date(),
        useCount: 0,
      };

      const tool2: ExtendedTool = {
        name: 'shared-tool',
        serverId: 'server2',
        isAvailable: true,
        lastUsed: new Date(),
        useCount: 0,
      };

      registry.registerTool(tool1);
      registry.registerTool(tool2);

      const found = registry.getTool('shared-tool');
      expect(found?.serverId).toBe('server2'); // Should prefer available tool
    });
  });

  describe('listTools', () => {
    beforeEach(() => {
      const tools: ExtendedTool[] = [
        {
          name: 'tool1',
          serverId: 'server1',
          isAvailable: true,
          lastUsed: new Date(),
          useCount: 10,
        },
        {
          name: 'tool2',
          serverId: 'server1',
          isAvailable: true,
          lastUsed: new Date(),
          useCount: 5,
        },
        {
          name: 'tool3',
          serverId: 'server2',
          isAvailable: false,
          lastUsed: new Date(),
          useCount: 15,
        },
      ];

      tools.forEach((tool) => registry.registerTool(tool));
    });

    it('should list all tools', () => {
      const tools = registry.listTools();
      expect(tools).toHaveLength(3);
    });

    it('should filter by server', () => {
      const tools = registry.listTools({ serverId: 'server1' });
      expect(tools).toHaveLength(2);
      expect(tools.every((t) => t.serverId === 'server1')).toBe(true);
    });

    it('should filter by availability', () => {
      const tools = registry.listTools({ onlyAvailable: true });
      expect(tools).toHaveLength(2);
      expect(tools.every((t) => t.isAvailable)).toBe(true);
    });

    it('should sort by use count', () => {
      const tools = registry.listTools({ sortBy: 'useCount' });
      expect(tools[0].useCount).toBe(15);
      expect(tools[1].useCount).toBe(10);
      expect(tools[2].useCount).toBe(5);
    });

    it('should sort by name', () => {
      const tools = registry.listTools({ sortBy: 'name' });
      expect(tools[0].name).toBe('tool1');
      expect(tools[1].name).toBe('tool2');
      expect(tools[2].name).toBe('tool3');
    });
  });

  describe('updateToolStats', () => {
    it('should update tool usage statistics', () => {
      const tool: ExtendedTool = {
        name: 'test-tool',
        serverId: 'server1',
        isAvailable: true,
        lastUsed: new Date('2024-01-01'),
        useCount: 5,
      };

      registry.registerTool(tool);

      const now = new Date();
      registry.updateToolStats('test-tool', 'server1', {
        incrementUseCount: true,
        updateLastUsed: true,
      });

      const updated = registry.getTool('test-tool', 'server1');
      expect(updated?.useCount).toBe(6);
      expect(updated?.lastUsed.getTime()).toBeGreaterThanOrEqual(now.getTime());
    });

    it('should update availability status', () => {
      const tool: ExtendedTool = {
        name: 'test-tool',
        serverId: 'server1',
        isAvailable: true,
        lastUsed: new Date(),
        useCount: 0,
      };

      registry.registerTool(tool);

      registry.updateToolStats('test-tool', 'server1', {
        isAvailable: false,
      });

      const updated = registry.getTool('test-tool', 'server1');
      expect(updated?.isAvailable).toBe(false);
    });
  });

  describe('registerChain', () => {
    it('should register a tool chain', () => {
      const chain: ToolChain = {
        id: 'test-chain',
        name: 'Test Chain',
        description: 'A test tool chain',
        tools: [
          { id: 'step1', toolName: 'tool1', parameters: {} },
          { id: 'step2', toolName: 'tool2', parameters: {} },
        ],
      };

      registry.registerChain(chain);

      const retrieved = registry.getChain('test-chain');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Test Chain');
      expect(retrieved?.tools).toHaveLength(2);
    });

    it('should update existing chain', () => {
      const chain1: ToolChain = {
        id: 'test-chain',
        name: 'Original',
        tools: [{ id: 'step1', toolName: 'tool1', parameters: {} }],
      };

      const chain2: ToolChain = {
        id: 'test-chain',
        name: 'Updated',
        tools: [
          { id: 'step1', toolName: 'tool1', parameters: {} },
          { id: 'step2', toolName: 'tool2', parameters: {} },
        ],
      };

      registry.registerChain(chain1);
      registry.registerChain(chain2);

      const retrieved = registry.getChain('test-chain');
      expect(retrieved?.name).toBe('Updated');
      expect(retrieved?.tools).toHaveLength(2);
    });
  });

  describe('unregisterChain', () => {
    it('should unregister a chain', () => {
      const chain: ToolChain = {
        id: 'test-chain',
        name: 'Test Chain',
        tools: [],
      };

      registry.registerChain(chain);
      expect(registry.getChain('test-chain')).toBeDefined();

      registry.unregisterChain('test-chain');
      expect(registry.getChain('test-chain')).toBeUndefined();
    });
  });

  describe('listChains', () => {
    it('should list all registered chains', () => {
      const chains: ToolChain[] = [
        {
          id: 'chain1',
          name: 'Chain 1',
          tools: [],
        },
        {
          id: 'chain2',
          name: 'Chain 2',
          tools: [],
        },
      ];

      chains.forEach((chain) => registry.registerChain(chain));

      const listed = registry.listChains();
      expect(listed).toHaveLength(2);
      expect(listed.map((c) => c.id)).toEqual(['chain1', 'chain2']);
    });
  });

  describe('searchTools', () => {
    beforeEach(() => {
      const tools: ExtendedTool[] = [
        {
          name: 'calculator',
          description: 'Performs mathematical calculations',
          serverId: 'server1',
          isAvailable: true,
          lastUsed: new Date(),
          useCount: 0,
          tags: ['math', 'calculation'],
        },
        {
          name: 'translator',
          description: 'Translates text between languages',
          serverId: 'server1',
          isAvailable: true,
          lastUsed: new Date(),
          useCount: 0,
          tags: ['language', 'translation'],
        },
        {
          name: 'weather',
          description: 'Gets weather information',
          serverId: 'server2',
          isAvailable: true,
          lastUsed: new Date(),
          useCount: 0,
          tags: ['weather', 'forecast'],
        },
      ];

      tools.forEach((tool) => registry.registerTool(tool));
    });

    it('should search by name', () => {
      const results = registry.searchTools('calc');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('calculator');
    });

    it('should search by description', () => {
      const results = registry.searchTools('mathematical');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('calculator');
    });

    it('should search by tags', () => {
      const results = registry.searchTools('language');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('translator');
    });

    it('should return empty array for no matches', () => {
      const results = registry.searchTools('nonexistent');
      expect(results).toHaveLength(0);
    });

    it('should be case insensitive', () => {
      const results = registry.searchTools('CALCULATOR');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('calculator');
    });
  });

  describe('clear', () => {
    it('should clear all tools and chains', () => {
      const tool: ExtendedTool = {
        name: 'test-tool',
        serverId: 'server1',
        isAvailable: true,
        lastUsed: new Date(),
        useCount: 0,
      };

      const chain: ToolChain = {
        id: 'test-chain',
        name: 'Test Chain',
        tools: [],
      };

      registry.registerTool(tool);
      registry.registerChain(chain);

      registry.clear();

      expect(registry.listTools()).toHaveLength(0);
      expect(registry.listChains()).toHaveLength(0);
    });
  });

  describe('getStats', () => {
    it('should return registry statistics', () => {
      const tools: ExtendedTool[] = [
        {
          name: 'tool1',
          serverId: 'server1',
          isAvailable: true,
          lastUsed: new Date(),
          useCount: 10,
        },
        {
          name: 'tool2',
          serverId: 'server1',
          isAvailable: false,
          lastUsed: new Date(),
          useCount: 5,
        },
        {
          name: 'tool3',
          serverId: 'server2',
          isAvailable: true,
          lastUsed: new Date(),
          useCount: 15,
        },
      ];

      tools.forEach((tool) => registry.registerTool(tool));

      const chain: ToolChain = {
        id: 'chain1',
        name: 'Chain 1',
        tools: [],
      };

      registry.registerChain(chain);

      const stats = registry.getStats();

      expect(stats.totalTools).toBe(3);
      expect(stats.availableTools).toBe(2);
      expect(stats.totalChains).toBe(1);
      expect(stats.serverCount).toBe(2);
      expect(stats.totalUsageCount).toBe(30);
    });
  });
});
