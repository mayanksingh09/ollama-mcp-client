import { useCallback } from 'react';

// Type definitions for Ink's useInput hook
interface Key {
  ctrl?: boolean;
  shift?: boolean;
  tab?: boolean;
  backspace?: boolean;
  delete?: boolean;
  escape?: boolean;
  return?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
  pageUp?: boolean;
  pageDown?: boolean;
}

interface GlobalWithInkModule {
  InkModule?: {
    useInput: (handler: (input: string, key: Key) => void) => void;
  };
}

type GlobalThis = GlobalWithInkModule;

declare const globalThis: GlobalThis;

// Try to get useInput from Ink if available
let useInput: ((handler: (input: string, key: Key) => void) => void) | undefined;
try {
  // This will only work in environments where Ink is loaded
  const ink = globalThis.InkModule;
  if (ink && ink.useInput) {
    useInput = ink.useInput;
  }
} catch {
  // Ink not available
}

interface KeyboardShortcuts {
  'ctrl+c'?: () => void;
  'ctrl+l'?: () => void;
  'ctrl+r'?: () => void;
  'ctrl+s'?: () => void;
  'ctrl+d'?: () => void;
  escape?: () => void;
  tab?: () => void;
  'shift+tab'?: () => void;
  up?: () => void;
  down?: () => void;
  left?: () => void;
  right?: () => void;
  pageup?: () => void;
  pagedown?: () => void;
  home?: () => void;
  end?: () => void;
  return?: () => void;
  delete?: () => void;
  backspace?: () => void;
}

interface UseKeyboardOptions {
  isActive?: boolean;
  shortcuts?: KeyboardShortcuts;
  onAnyKey?: (input: string, key: Key) => void;
}

export const useKeyboard = (options: UseKeyboardOptions = {}): { isActive: boolean } => {
  const { isActive = true, shortcuts = {}, onAnyKey } = options;

  const handleInput = useCallback(
    (input: string, key: Key) => {
      if (!isActive) return;

      // Check for specific shortcuts
      if (key.ctrl && input === 'c' && shortcuts['ctrl+c']) {
        shortcuts['ctrl+c']();
        return;
      }

      if (key.ctrl && input === 'l' && shortcuts['ctrl+l']) {
        shortcuts['ctrl+l']();
        return;
      }

      if (key.ctrl && input === 'r' && shortcuts['ctrl+r']) {
        shortcuts['ctrl+r']();
        return;
      }

      if (key.ctrl && input === 's' && shortcuts['ctrl+s']) {
        shortcuts['ctrl+s']();
        return;
      }

      if (key.ctrl && input === 'd' && shortcuts['ctrl+d']) {
        shortcuts['ctrl+d']();
        return;
      }

      if (key.escape && shortcuts['escape']) {
        shortcuts['escape']();
        return;
      }

      if (key.tab && !key.shift && shortcuts['tab']) {
        shortcuts['tab']();
        return;
      }

      if (key.tab && key.shift && shortcuts['shift+tab']) {
        shortcuts['shift+tab']();
        return;
      }

      if (key.upArrow && shortcuts['up']) {
        shortcuts['up']();
        return;
      }

      if (key.downArrow && shortcuts['down']) {
        shortcuts['down']();
        return;
      }

      if (key.leftArrow && shortcuts['left']) {
        shortcuts['left']();
        return;
      }

      if (key.rightArrow && shortcuts['right']) {
        shortcuts['right']();
        return;
      }

      if (key.pageUp && shortcuts['pageup']) {
        shortcuts['pageup']();
        return;
      }

      if (key.pageDown && shortcuts['pagedown']) {
        shortcuts['pagedown']();
        return;
      }

      if (key.return && shortcuts['return']) {
        shortcuts['return']();
        return;
      }

      if (key.delete && shortcuts['delete']) {
        shortcuts['delete']();
        return;
      }

      if (key.backspace && shortcuts['backspace']) {
        shortcuts['backspace']();
        return;
      }

      // Call the general handler if provided
      if (onAnyKey) {
        onAnyKey(input, key);
      }
    },
    [isActive, shortcuts, onAnyKey]
  );

  // Use Ink's useInput hook when available and stdin supports raw mode
  if (
    typeof useInput === 'function' &&
    process.stdin.isTTY &&
    typeof process.stdin.setRawMode === 'function'
  ) {
    useInput(handleInput);
  }

  return {
    isActive,
  };
};

// Utility hook for common shortcuts
export const useCommonShortcuts = (callbacks: {
  onExit?: () => void;
  onClear?: () => void;
  onRefresh?: () => void;
  onSave?: () => void;
}): { isActive: boolean } => {
  const shortcuts: KeyboardShortcuts = {
    'ctrl+c': callbacks.onExit || (() => process.exit(0)),
    'ctrl+l': callbacks.onClear,
    'ctrl+r': callbacks.onRefresh,
    'ctrl+s': callbacks.onSave,
  };

  return useKeyboard({ shortcuts });
};
