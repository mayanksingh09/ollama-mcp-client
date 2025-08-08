# Ollama MCP Client - Bug Fixes and UI Improvements Plan

## Overview
This document outlines the plan to fix Zod validation issues and enhance the visual experience of the Ollama MCP Client chat interface.

## Issues Identified

### 1. Zod Validation Errors with Tool Parameters
**Error Message:** `Parameter page: expected number, got integer`

**Root Cause:** 
- The `getActualType()` method in `ToolInvocationFormatter.ts` differentiates between "integer" and "number" types
- When a JavaScript number is an integer (e.g., 1, 25), it returns "integer"
- MCP tool schemas expect "number" type, causing validation to fail

**Location:** `src/bridge/ToolInvocationFormatter.ts:202-212`

### 2. Basic UI Experience
- Current spinner only shows "Thinking..." without progress information
- No visibility into model's processing stream
- Simple readline interface without visual enhancements

## Proposed Solutions

### 1. Fix Type Validation Issue

#### File: `src/bridge/ToolInvocationFormatter.ts`

**Current problematic code (lines 202-212):**
```typescript
private getActualType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';

  const type = typeof value;
  if (type === 'number') {
    return Number.isInteger(value) ? 'integer' : 'number';
  }

  return type;
}
```

**Solution:**
```typescript
private getActualType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  
  const type = typeof value;
  // Don't differentiate between integer and number for validation
  // The schema will specify if it needs integer specifically
  return type;
}
```

**Alternative approach:** Update the validation logic to accept "integer" when schema expects "number":
```typescript
private validateValue(
  propName: string,
  value: unknown,
  schema: { type: string; ... },
  errors: string[]
): unknown {
  const actualType = this.getActualType(value);
  
  // Accept integer as valid for number type
  if (schema.type === 'number' && actualType === 'integer') {
    // Value is valid, no coercion needed
    return value;
  }
  
  if (actualType !== schema.type && schema.type !== 'any') {
    const coerced = this.coerceType(value, schema.type);
    if (coerced === undefined) {
      errors.push(`Parameter ${propName}: expected ${schema.type}, got ${actualType}`);
      return undefined;
    }
    value = coerced;
  }
  // ... rest of validation
}
```

### 2. Enhanced Thinking Animation with Progress

#### New File: `src/cli/ui/enhanced-spinner.ts`

```typescript
import ora, { Ora } from 'ora';
import chalk from 'chalk';
import readline from 'readline';

export class EnhancedSpinner {
  private spinner: Ora;
  private startTime: number;
  private streamText: string = '';
  private fullStreamMode: boolean = false;
  private intervalId?: NodeJS.Timeout;
  
  constructor() {
    this.spinner = ora();
    this.startTime = Date.now();
    this.setupKeyboardListener();
  }
  
  start(text: string = 'Thinking') {
    this.startTime = Date.now();
    this.streamText = '';
    
    // Update spinner with elapsed time
    this.intervalId = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      const streamPreview = this.getStreamPreview();
      
      this.spinner.text = `${text} (${elapsed}s)${streamPreview}`;
    }, 100);
    
    this.spinner.start();
  }
  
  updateStream(text: string) {
    this.streamText += text;
  }
  
  private getStreamPreview(): string {
    if (!this.streamText) return '';
    
    if (this.fullStreamMode) {
      return `\n${chalk.dim(this.streamText)}`;
    }
    
    // Show truncated single line
    const preview = this.streamText.slice(-50).replace(/\n/g, ' ');
    return `\n${chalk.dim(preview)}${this.streamText.length > 50 ? '...' : ''}\n${chalk.dim('(Ctrl+R to toggle full view)')}`;
  }
  
  private setupKeyboardListener() {
    process.stdin.on('keypress', (str, key) => {
      if (key && key.ctrl && key.name === 'r') {
        this.fullStreamMode = !this.fullStreamMode;
      }
    });
  }
  
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    this.spinner.stop();
  }
}
```

### 3. Boxed Chat Interface

#### New File: `src/cli/ui/chat-interface.ts`

```typescript
import blessed from 'blessed';
import chalk from 'chalk';

export class ChatInterface {
  private screen: any;
  private chatBox: any;
  private inputBox: any;
  private messagesBox: any;
  
  constructor() {
    this.initializeScreen();
  }
  
  private initializeScreen() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Ollama MCP Chat'
    });
    
    // Messages display area
    this.messagesBox = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: '80%',
      content: '',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        border: {
          fg: '#00ff00'
        }
      },
      scrollable: true,
      alwaysScroll: true,
      mouse: true
    });
    
    // Input area with box
    this.inputBox = blessed.textarea({
      bottom: 0,
      left: 0,
      width: '100%',
      height: '20%',
      inputOnFocus: true,
      padding: 1,
      border: {
        type: 'line'
      },
      style: {
        border: {
          fg: '#0088ff'
        },
        focus: {
          border: {
            fg: '#00ff00'
          }
        }
      },
      label: ' Type your message (Enter to send, Ctrl+C to exit) '
    });
    
    this.screen.append(this.messagesBox);
    this.screen.append(this.inputBox);
    
    // Handle input
    this.inputBox.on('submit', (text: string) => {
      this.onMessage(text);
      this.inputBox.clearValue();
      this.inputBox.focus();
      this.screen.render();
    });
    
    // Exit handling
    this.screen.key(['C-c'], () => {
      process.exit(0);
    });
    
    this.inputBox.focus();
    this.screen.render();
  }
  
  addMessage(role: 'user' | 'assistant', content: string) {
    const roleColor = role === 'user' ? '{green-fg}' : '{blue-fg}';
    const roleLabel = role === 'user' ? 'You' : 'Assistant';
    
    const formattedMessage = `${roleColor}${roleLabel}:{/} ${content}\n\n`;
    this.messagesBox.pushLine(formattedMessage);
    this.messagesBox.setScrollPerc(100);
    this.screen.render();
  }
  
  onMessage(callback: (text: string) => void) {
    this.inputBox.on('submit', callback);
  }
  
  destroy() {
    this.screen.destroy();
  }
}
```

### 4. Integration in Chat Command

#### Update: `src/cli/commands/chat.ts`

```typescript
// Import new UI components
import { EnhancedSpinner } from '../ui/enhanced-spinner';
import { ChatInterface } from '../ui/chat-interface';

// In the chat command action
const useEnhancedUI = options.enhancedUI !== false;

if (useEnhancedUI) {
  const chatUI = new ChatInterface();
  
  chatUI.onMessage(async (input: string) => {
    if (input.trim() === 'exit') {
      chatUI.destroy();
      process.exit(0);
    }
    
    const spinner = new EnhancedSpinner();
    spinner.start('Thinking');
    
    try {
      // If streaming is available, update spinner with stream
      const response = await client.chat(input, {
        model,
        temperature,
        maxTokens,
        includeHistory: useHistory,
        systemPrompt: options.system,
        onStream: (chunk) => {
          spinner.updateStream(chunk);
        }
      });
      
      spinner.stop();
      chatUI.addMessage('assistant', response.message);
      
      // Show tool usage
      if (response.toolCalls && response.toolCalls.length > 0) {
        const toolInfo = response.toolCalls
          .map(tc => `Tool: ${tc.toolName}`)
          .join(', ');
        chatUI.addMessage('assistant', `[${toolInfo}]`);
      }
    } catch (error) {
      spinner.stop();
      chatUI.addMessage('assistant', `Error: ${error.message}`);
    }
  });
} else {
  // Keep existing readline interface as fallback
  // ... existing code
}
```

## Implementation Steps

1. **Fix Type Validation (Priority: HIGH)**
   - Update `ToolInvocationFormatter.ts` to handle integer/number type correctly
   - Test with Apollo.io and Supabase MCP servers
   - Ensure backward compatibility

2. **Add Enhanced Spinner (Priority: MEDIUM)**
   - Create `EnhancedSpinner` class
   - Add elapsed time tracking
   - Implement stream preview with toggle
   - Add keyboard listener for Ctrl+R

3. **Implement Boxed Chat UI (Priority: MEDIUM)**
   - Install `blessed` or `ink` dependency
   - Create `ChatInterface` class
   - Implement message display area
   - Add boxed input area
   - Handle scrolling and formatting

4. **Integration and Testing (Priority: HIGH)**
   - Update chat command to use new components
   - Add feature flag for enhanced UI
   - Test with various models and MCP servers
   - Ensure graceful fallback for unsupported terminals

## Dependencies to Add

```json
{
  "dependencies": {
    "blessed": "^0.1.81",
    "blessed-contrib": "^4.11.0"
  }
}
```

## Testing Plan

1. **Unit Tests**
   - Test type validation with various number inputs
   - Test enhanced spinner timer functionality
   - Test UI component rendering

2. **Integration Tests**
   - Test with Apollo.io server (people_search, organization_search)
   - Test with Supabase server
   - Test streaming response handling
   - Test keyboard shortcuts

3. **Manual Testing**
   - Test in different terminal emulators
   - Test with various screen sizes
   - Test Ctrl+R toggle functionality
   - Test multi-line input handling

## Rollback Plan

If issues arise:
1. Type validation can be reverted to original logic
2. Enhanced UI can be disabled via feature flag
3. Fallback to basic readline interface

## Success Metrics

- Zero validation errors with integer parameters
- Thinking animation shows elapsed time
- Stream preview visible during processing
- Chat interface has clear visual separation
- Keyboard shortcuts work reliably

## Timeline

- Phase 1 (Immediate): Fix type validation issue (1 hour)
- Phase 2 (Day 1): Implement enhanced spinner (2 hours)
- Phase 3 (Day 2): Implement boxed chat UI (3 hours)
- Phase 4 (Day 2-3): Integration and testing (2 hours)

Total estimated time: 8 hours