import React, { useState, useEffect } from 'react';

interface GlobalWithInkComponents {
  InkBox?: React.ComponentType<Record<string, unknown>>;
  InkText?: React.ComponentType<Record<string, unknown>>;
  InkSpinner?: React.ComponentType<Record<string, unknown>>;
}

type GlobalThis = GlobalWithInkComponents;

declare const globalThis: GlobalThis;

interface SpinnerProps {
  type?: 'dots' | 'line' | 'arc' | 'bouncingBar';
  label?: string;
  showTimer?: boolean;
  showProgress?: boolean;
  progress?: number;
  color?: string;
}

const Spinner: React.FC<SpinnerProps> = ({
  type = 'dots',
  label = 'Loading',
  showTimer = false,
  showProgress = false,
  progress = 0,
  color = 'cyan',
}) => {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [startTime] = useState(Date.now());

  // Dynamic imports will be handled at runtime
  const Box = globalThis.InkBox || 'div';
  const Text = globalThis.InkText || 'span';
  const InkSpinner = globalThis.InkSpinner || 'span';

  useEffect((): (() => void) | undefined => {
    if (showTimer) {
      const interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

      return () => clearInterval(interval);
    }
    return undefined;
  }, [showTimer, startTime]);

  // Format elapsed time
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  // Create progress bar
  const createProgressBar = (value: number): string => {
    const width = 20;
    const filled = Math.round((value / 100) * width);
    const empty = width - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
  };

  return React.createElement(
    Box,
    { flexDirection: 'row', alignItems: 'center' },
    // Spinner icon
    React.createElement(Text, { color }, React.createElement(InkSpinner, { type })),
    // Label
    React.createElement(Text, { marginLeft: 0.5 }, label),
    // Timer
    showTimer &&
      React.createElement(
        Text,
        { dimColor: true, marginLeft: 0.5 },
        `(${formatTime(elapsedTime)})`
      ),
    // Progress bar
    showProgress &&
      React.createElement(
        Box,
        { marginLeft: 0.5 },
        React.createElement(
          Text,
          { color: progress >= 100 ? 'green' : 'yellow' },
          createProgressBar(progress)
        ),
        React.createElement(Text, { marginLeft: 0.5, dimColor: true }, `${Math.round(progress)}%`)
      )
  );
};

// Enhanced spinner with multiple states
interface EnhancedSpinnerProps extends SpinnerProps {
  state?: 'loading' | 'success' | 'error' | 'warning';
  message?: string;
}

export const EnhancedSpinner: React.FC<EnhancedSpinnerProps> = ({
  state = 'loading',
  message,
  ...spinnerProps
}) => {
  const Box = globalThis.InkBox || 'div';
  const Text = globalThis.InkText || 'span';

  const stateConfig = {
    loading: {
      symbol: '⠋',
      color: 'cyan',
      label: spinnerProps.label || 'Loading',
    },
    success: {
      symbol: '✓',
      color: 'green',
      label: message || 'Success',
    },
    error: {
      symbol: '✗',
      color: 'red',
      label: message || 'Error',
    },
    warning: {
      symbol: '⚠',
      color: 'yellow',
      label: message || 'Warning',
    },
  };

  const config = stateConfig[state];

  if (state === 'loading') {
    return React.createElement(Spinner, {
      ...spinnerProps,
      color: config.color,
      label: config.label,
    });
  }

  // For non-loading states, show static symbol
  return React.createElement(
    Box,
    { flexDirection: 'row', alignItems: 'center' },
    React.createElement(Text, { color: config.color, bold: true }, config.symbol),
    React.createElement(Text, { marginLeft: 0.5 }, config.label)
  );
};

export default Spinner;

// Export a loader function that handles dynamic imports
export const loadSpinner = async (): Promise<{
  Spinner: React.FC<SpinnerProps>;
  EnhancedSpinner: React.FC<EnhancedSpinnerProps>;
}> => {
  const ink = await import('ink');
  const spinner = await import('ink-spinner');

  globalThis.InkBox = ink.Box;
  globalThis.InkText = ink.Text;
  globalThis.InkSpinner = spinner.default as unknown as React.ComponentType<
    Record<string, unknown>
  >;

  return { Spinner, EnhancedSpinner };
};
