import { ConversationManager } from '../../src/bridge/ConversationManager';
import type { ConversationMessage, ConversationContext } from '../../src/bridge/types';

describe('ConversationManager', () => {
  let manager: ConversationManager;

  beforeEach(() => {
    manager = new ConversationManager({
      maxMessages: 100,
      maxTokens: 4000,
    });
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const manager = new ConversationManager();
      expect(manager).toBeInstanceOf(ConversationManager);
    });

    it('should initialize with custom options', () => {
      const manager = new ConversationManager({
        maxMessages: 50,
        maxTokens: 2000,
      });
      expect(manager).toBeInstanceOf(ConversationManager);
    });
  });

  describe('addMessage', () => {
    it('should add user message', () => {
      const message: ConversationMessage = {
        role: 'user',
        content: 'Hello, how are you?',
        timestamp: Date.now(),
      };

      manager.addMessage(message);
      const messages = manager.getMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(message);
    });

    it('should add assistant message', () => {
      const message: ConversationMessage = {
        role: 'assistant',
        content: 'I am doing well, thank you!',
        timestamp: Date.now(),
      };

      manager.addMessage(message);
      const messages = manager.getMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(message);
    });

    it('should add system message', () => {
      const message: ConversationMessage = {
        role: 'system',
        content: 'You are a helpful assistant',
        timestamp: Date.now(),
      };

      manager.addMessage(message);
      const messages = manager.getMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(message);
    });

    it('should add message with tool calls', () => {
      const message: ConversationMessage = {
        role: 'assistant',
        content: 'Let me calculate that for you',
        timestamp: Date.now(),
        toolCalls: [
          {
            id: 'call-123',
            name: 'calculator',
            arguments: { operation: 'add', a: 5, b: 3 },
          },
        ],
      };

      manager.addMessage(message);
      const messages = manager.getMessages();

      expect(messages[0].toolCalls).toHaveLength(1);
      expect(messages[0].toolCalls?.[0].name).toBe('calculator');
    });

    it('should add message with tool results', () => {
      const message: ConversationMessage = {
        role: 'tool',
        content: 'Result: 8',
        timestamp: Date.now(),
        toolCallId: 'call-123',
      };

      manager.addMessage(message);
      const messages = manager.getMessages();

      expect(messages[0].role).toBe('tool');
      expect(messages[0].toolCallId).toBe('call-123');
    });

    it('should enforce message limit', () => {
      const manager = new ConversationManager({ maxMessages: 3 });

      for (let i = 0; i < 5; i++) {
        manager.addMessage({
          role: 'user',
          content: `Message ${i}`,
          timestamp: Date.now(),
        });
      }

      const messages = manager.getMessages();
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe('Message 2');
      expect(messages[2].content).toBe('Message 4');
    });
  });

  describe('getMessages', () => {
    it('should return all messages', () => {
      manager.addMessage({ role: 'user', content: 'Message 1', timestamp: Date.now() });
      manager.addMessage({ role: 'assistant', content: 'Message 2', timestamp: Date.now() });

      const messages = manager.getMessages();
      expect(messages).toHaveLength(2);
    });

    it('should return limited messages', () => {
      for (let i = 0; i < 5; i++) {
        manager.addMessage({
          role: 'user',
          content: `Message ${i}`,
          timestamp: Date.now(),
        });
      }

      const messages = manager.getMessages(3);
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe('Message 2');
    });

    it('should return empty array when no messages', () => {
      const messages = manager.getMessages();
      expect(messages).toEqual([]);
    });
  });

  describe('getContext', () => {
    it('should return conversation context', () => {
      manager.addMessage({ role: 'user', content: 'Hello', timestamp: Date.now() });
      manager.addMessage({ role: 'assistant', content: 'Hi there!', timestamp: Date.now() });

      const context = manager.getContext();

      expect(context.messageCount).toBe(2);
      expect(context.totalTokens).toBeGreaterThan(0);
      expect(context.userMessageCount).toBe(1);
      expect(context.assistantMessageCount).toBe(1);
      expect(context.systemMessageCount).toBe(0);
      expect(context.toolCallCount).toBe(0);
    });

    it('should count tool calls in context', () => {
      manager.addMessage({
        role: 'assistant',
        content: 'Using tool',
        timestamp: Date.now(),
        toolCalls: [
          { id: '1', name: 'tool1', arguments: {} },
          { id: '2', name: 'tool2', arguments: {} },
        ],
      });

      const context = manager.getContext();
      expect(context.toolCallCount).toBe(2);
    });

    it('should track conversation start time', () => {
      const startTime = Date.now();
      manager.addMessage({ role: 'user', content: 'Hello', timestamp: startTime });

      const context = manager.getContext();
      expect(context.startTime).toBe(startTime);
    });

    it('should track last message time', () => {
      const time1 = Date.now();
      const time2 = time1 + 1000;

      manager.addMessage({ role: 'user', content: 'Hello', timestamp: time1 });
      manager.addMessage({ role: 'assistant', content: 'Hi', timestamp: time2 });

      const context = manager.getContext();
      expect(context.lastMessageTime).toBe(time2);
    });
  });

  describe('clear', () => {
    it('should clear all messages', () => {
      manager.addMessage({ role: 'user', content: 'Message 1', timestamp: Date.now() });
      manager.addMessage({ role: 'assistant', content: 'Message 2', timestamp: Date.now() });

      manager.clear();
      const messages = manager.getMessages();

      expect(messages).toHaveLength(0);
    });

    it('should reset context after clear', () => {
      manager.addMessage({ role: 'user', content: 'Message', timestamp: Date.now() });
      manager.clear();

      const context = manager.getContext();
      expect(context.messageCount).toBe(0);
      expect(context.totalTokens).toBe(0);
    });
  });

  describe('truncateToTokenLimit', () => {
    it('should truncate messages to fit token limit', () => {
      const manager = new ConversationManager({ maxTokens: 100 });

      for (let i = 0; i < 20; i++) {
        manager.addMessage({
          role: 'user',
          content: 'This is a relatively long message that takes up some tokens',
          timestamp: Date.now(),
        });
      }

      manager.truncateToTokenLimit();
      const context = manager.getContext();

      expect(context.totalTokens).toBeLessThanOrEqual(100);
    });

    it('should preserve system messages when truncating', () => {
      const manager = new ConversationManager({ maxTokens: 50 });

      manager.addMessage({
        role: 'system',
        content: 'System prompt',
        timestamp: Date.now(),
      });

      for (let i = 0; i < 10; i++) {
        manager.addMessage({
          role: 'user',
          content: 'User message',
          timestamp: Date.now(),
        });
      }

      manager.truncateToTokenLimit();
      const messages = manager.getMessages();

      expect(messages[0].role).toBe('system');
    });
  });

  describe('getSummary', () => {
    it('should generate conversation summary', () => {
      manager.addMessage({ role: 'user', content: 'What is 2+2?', timestamp: Date.now() });
      manager.addMessage({ role: 'assistant', content: 'The answer is 4', timestamp: Date.now() });
      manager.addMessage({ role: 'user', content: 'And 3+3?', timestamp: Date.now() });
      manager.addMessage({ role: 'assistant', content: 'That equals 6', timestamp: Date.now() });

      const summary = manager.getSummary();

      expect(summary).toContain('2 user messages');
      expect(summary).toContain('2 assistant messages');
      expect(summary).toMatch(/\d+ tokens/);
    });

    it('should include tool call summary', () => {
      manager.addMessage({
        role: 'assistant',
        content: 'Calculating',
        timestamp: Date.now(),
        toolCalls: [{ id: '1', name: 'calculator', arguments: {} }],
      });

      const summary = manager.getSummary();
      expect(summary).toContain('1 tool call');
    });
  });

  describe('findMessageById', () => {
    it('should find message by ID', () => {
      manager.addMessage({
        id: 'msg-123',
        role: 'user',
        content: 'Test message',
        timestamp: Date.now(),
      });

      const message = manager.findMessageById('msg-123');
      expect(message?.content).toBe('Test message');
    });

    it('should return undefined for non-existent ID', () => {
      const message = manager.findMessageById('non-existent');
      expect(message).toBeUndefined();
    });
  });

  describe('updateMessage', () => {
    it('should update existing message', () => {
      manager.addMessage({
        id: 'msg-123',
        role: 'user',
        content: 'Original content',
        timestamp: Date.now(),
      });

      manager.updateMessage('msg-123', {
        content: 'Updated content',
      });

      const message = manager.findMessageById('msg-123');
      expect(message?.content).toBe('Updated content');
    });

    it('should not update non-existent message', () => {
      const result = manager.updateMessage('non-existent', {
        content: 'New content',
      });

      expect(result).toBe(false);
    });
  });

  describe('getMessagesByRole', () => {
    it('should filter messages by role', () => {
      manager.addMessage({ role: 'user', content: 'User 1', timestamp: Date.now() });
      manager.addMessage({ role: 'assistant', content: 'Assistant 1', timestamp: Date.now() });
      manager.addMessage({ role: 'user', content: 'User 2', timestamp: Date.now() });
      manager.addMessage({ role: 'system', content: 'System', timestamp: Date.now() });

      const userMessages = manager.getMessagesByRole('user');
      expect(userMessages).toHaveLength(2);
      expect(userMessages[0].content).toBe('User 1');
      expect(userMessages[1].content).toBe('User 2');

      const assistantMessages = manager.getMessagesByRole('assistant');
      expect(assistantMessages).toHaveLength(1);

      const systemMessages = manager.getMessagesByRole('system');
      expect(systemMessages).toHaveLength(1);
    });
  });

  describe('token estimation', () => {
    it('should estimate tokens for messages', () => {
      manager.addMessage({
        role: 'user',
        content: 'This is a test message with several words',
        timestamp: Date.now(),
      });

      const context = manager.getContext();
      expect(context.totalTokens).toBeGreaterThan(0);
      expect(context.totalTokens).toBeLessThan(50);
    });

    it('should estimate tokens accurately for long messages', () => {
      const longMessage = 'word '.repeat(100);
      manager.addMessage({
        role: 'user',
        content: longMessage,
        timestamp: Date.now(),
      });

      const context = manager.getContext();
      expect(context.totalTokens).toBeGreaterThan(100);
    });
  });
});
