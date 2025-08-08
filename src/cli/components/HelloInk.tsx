import React from 'react';

interface GlobalWithInkComponents {
  InkBox?: React.ComponentType<Record<string, unknown>>;
  InkText?: React.ComponentType<Record<string, unknown>>;
  InkSpinner?: React.ComponentType<Record<string, unknown>>;
  InkGradient?: React.ComponentType<Record<string, unknown>>;
  InkBigText?: React.ComponentType<Record<string, unknown>>;
}

type GlobalThis = GlobalWithInkComponents;

declare const globalThis: GlobalThis;

interface HelloInkProps {
  name?: string;
}

const HelloInk: React.FC<HelloInkProps> = ({ name = 'Ink' }) => {
  const [counter, setCounter] = React.useState(0);

  React.useEffect((): (() => void) => {
    const timer = setInterval(() => {
      setCounter((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Dynamic imports will be handled at runtime
  const Box = globalThis.InkBox || 'div';
  const Text = globalThis.InkText || 'span';
  const Spinner = globalThis.InkSpinner || 'span';
  const Gradient = globalThis.InkGradient || 'span';
  const BigText = globalThis.InkBigText || 'h1';

  return React.createElement(
    Box,
    { flexDirection: 'column', padding: 1 },
    React.createElement(
      Gradient,
      { name: 'rainbow' },
      React.createElement(BigText, { text: 'Ollama MCP', font: 'chrome' })
    ),
    React.createElement(
      Box,
      { marginTop: 1, marginBottom: 1 },
      React.createElement(Text, { color: 'cyan' }, '✨ Welcome to ', name, '! ✨')
    ),
    React.createElement(
      Box,
      null,
      React.createElement(
        Text,
        { color: 'green' },
        React.createElement(Spinner, { type: 'dots' }),
        ' Testing Ink integration...'
      )
    ),
    React.createElement(
      Box,
      { marginTop: 1 },
      React.createElement(Text, { dimColor: true }, 'Time elapsed: ', counter, ' seconds')
    ),
    React.createElement(
      Box,
      { marginTop: 1, borderStyle: 'round', borderColor: 'cyan', padding: 1 },
      React.createElement(
        Text,
        null,
        '🎉 If you can see this animated display with colors and borders,',
        '\n',
        'Ink is working correctly!'
      )
    ),
    React.createElement(
      Box,
      { marginTop: 1 },
      React.createElement(Text, { dimColor: true, italic: true }, 'Press Ctrl+C to exit')
    )
  );
};

export const testInk = async (): Promise<void> => {
  // Dynamic import to avoid CommonJS/ESM issues
  const ink = await import('ink');
  const gradient = await import('ink-gradient');
  const bigText = await import('ink-big-text');
  const spinner = await import('ink-spinner');

  // Store components globally for use in component
  globalThis.InkBox = ink.Box;
  globalThis.InkText = ink.Text;
  globalThis.InkSpinner = spinner.default as unknown as React.ComponentType<
    Record<string, unknown>
  >;
  globalThis.InkGradient = gradient.default as unknown as React.ComponentType<
    Record<string, unknown>
  >;
  globalThis.InkBigText = bigText.default as unknown as React.ComponentType<
    Record<string, unknown>
  >;

  const { unmount } = ink.render(React.createElement(HelloInk));

  process.on('SIGINT', () => {
    unmount();
    process.exit(0);
  });
};

export default HelloInk;
