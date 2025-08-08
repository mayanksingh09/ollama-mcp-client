import React, { useState, useCallback } from 'react';

interface GlobalWithInkComponents {
  InkBox?: React.ComponentType<Record<string, unknown>>;
  InkText?: React.ComponentType<Record<string, unknown>>;
  InkTextInput?: React.ComponentType<Record<string, unknown>>;
}

type GlobalThis = GlobalWithInkComponents;

declare const globalThis: GlobalThis;

interface InputBoxProps {
  onSubmit: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  showHistory?: boolean;
  suggestions?: string[];
  isDisabled?: boolean;
}

const InputBox: React.FC<InputBoxProps> = ({
  onSubmit,
  placeholder = 'Type your message...',
  multiline = false,
  showHistory = true,
  suggestions = [],
  isDisabled = false,
}) => {
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  // Note: History navigation would be implemented with keyboard handling
  // Currently not used but kept for future implementation
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Dynamic imports will be handled at runtime
  const Box = globalThis.InkBox || 'div';
  const Text = globalThis.InkText || 'span';
  const TextInput = globalThis.InkTextInput || 'input';

  const handleSubmit = useCallback(
    (inputValue: string) => {
      const trimmedValue = inputValue.trim();
      if (trimmedValue && !isDisabled) {
        // Add to history
        if (showHistory) {
          setHistory((prev) => [...prev, trimmedValue]);
        }
        // Reset state
        setValue('');
        setShowSuggestions(false);
        // Call parent handler
        onSubmit(trimmedValue);
      }
    },
    [onSubmit, showHistory, isDisabled]
  );

  const handleChange = useCallback(
    (newValue: string) => {
      setValue(newValue);
      // Show suggestions if typing and matches exist
      if (newValue && suggestions.length > 0) {
        const hasMatch = suggestions.some((s) =>
          s.toLowerCase().startsWith(newValue.toLowerCase())
        );
        setShowSuggestions(hasMatch);
      } else {
        setShowSuggestions(false);
      }
    },
    [suggestions]
  );

  // Navigate history with up/down arrows
  // Note: This would be used with Ink's useInput hook for keyboard navigation
  // Currently handled by ink-text-input component internally
  /*
  const handleKeyPress = useCallback(
    (key: string) => {
      if (!showHistory || history.length === 0) return;

      if (key === 'up') {
        const newIndex = historyIndex < history.length - 1 
          ? historyIndex + 1 
          : history.length - 1;
        setHistoryIndex(newIndex);
        setValue(history[history.length - 1 - newIndex]);
      } else if (key === 'down') {
        if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          setValue(history[history.length - 1 - newIndex]);
        } else if (historyIndex === 0) {
          setHistoryIndex(-1);
          setValue('');
        }
      }
    },
    [history, historyIndex, showHistory]
  );
  */

  // Filter suggestions based on current input
  const filteredSuggestions = suggestions.filter((s) =>
    s.toLowerCase().startsWith(value.toLowerCase())
  );

  return React.createElement(
    Box,
    { flexDirection: 'column' },
    // Input container
    React.createElement(
      Box,
      {
        borderStyle: 'round',
        borderColor: isDisabled ? 'gray' : 'greenBright',
        padding: 1,
        width: '100%',
      },
      React.createElement(
        Box,
        { flexDirection: 'row' },
        // Input label
        React.createElement(Text, { color: isDisabled ? 'gray' : 'green', bold: true }, '> '),
        // Text input
        TextInput &&
          React.createElement(TextInput, {
            value,
            onChange: handleChange,
            onSubmit: handleSubmit,
            placeholder: isDisabled ? 'Input disabled' : placeholder,
            focus: !isDisabled,
          })
      )
    ),
    // Suggestions box
    showSuggestions &&
      filteredSuggestions.length > 0 &&
      React.createElement(
        Box,
        {
          flexDirection: 'column',
          marginTop: 1,
          borderStyle: 'single',
          borderColor: 'cyan',
          padding: 0.5,
        },
        React.createElement(Text, { dimColor: true, italic: true }, 'Suggestions:'),
        ...filteredSuggestions
          .slice(0, 3)
          .map((suggestion, index) =>
            React.createElement(
              Box,
              { key: index, marginLeft: 1 },
              React.createElement(Text, { color: 'cyan' }, `• ${suggestion}`)
            )
          )
      ),
    // Help text
    React.createElement(
      Box,
      { marginTop: 0.5 },
      React.createElement(
        Text,
        { dimColor: true, italic: true },
        multiline ? 'Press Shift+Enter for new line, Enter to submit' : 'Press Enter to submit',
        showHistory && history.length > 0 && ', ↑/↓ for history'
      )
    )
  );
};

export default InputBox;

// Export a loader function that handles dynamic imports
export const loadInputBox = async (): Promise<React.FC<InputBoxProps>> => {
  const ink = await import('ink');
  const textInput = await import('ink-text-input');

  globalThis.InkBox = ink.Box;
  globalThis.InkText = ink.Text;
  globalThis.InkTextInput = textInput.default as unknown as React.ComponentType<
    Record<string, unknown>
  >;

  return InputBox;
};
