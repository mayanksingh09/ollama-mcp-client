# Contributing to Ollama MCP Client

First off, thank you for considering contributing to Ollama MCP Client! It's people like you that make this project such a great tool for the local-first AI community.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Style Guidelines](#style-guidelines)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing Guidelines](#testing-guidelines)
- [Documentation](#documentation)
- [Community](#community)

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code. Please be respectful and constructive in your interactions with other contributors.

## Getting Started

1. **Fork the Repository**: Click the "Fork" button at the top of the repository page
2. **Clone Your Fork**: 
   ```bash
   git clone https://github.com/your-username/ollama-mcp-client.git
   cd ollama-mcp-client
   ```
3. **Add Upstream Remote**:
   ```bash
   git remote add upstream https://github.com/mayanksingh09/ollama-mcp-client.git
   ```

## How Can I Contribute?

### 🐛 Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, please include:

- **Clear and descriptive title**
- **Steps to reproduce** the issue
- **Expected behavior** vs **actual behavior**
- **System information** (OS, Node.js version, Ollama version)
- **Relevant logs** or error messages
- **Code samples** if applicable

### 💡 Suggesting Enhancements

Enhancement suggestions are welcome! Please provide:

- **Use case** for the enhancement
- **Detailed description** of the proposed functionality
- **Possible implementation** approach (if you have ideas)
- **Alternative solutions** you've considered

### 🔧 Pull Requests

1. **Small, focused changes** are preferred over large PRs
2. **One feature/fix per PR** makes review easier
3. **Include tests** for new functionality
4. **Update documentation** as needed
5. **Follow the style guidelines** below

## Development Setup

### Prerequisites

- Node.js 18+ installed
- Ollama installed and running
- Git configured with your GitHub account
- TypeScript knowledge helpful

### Setup Steps

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Build the Project**:
   ```bash
   npm run build
   ```

3. **Run Tests**:
   ```bash
   npm test
   ```

4. **Start Development Mode**:
   ```bash
   npm run dev
   ```

### Useful Scripts

```bash
npm run build         # Build the project
npm run dev          # Watch mode for development
npm test             # Run all tests
npm run test:watch   # Run tests in watch mode
npm run lint         # Check linting
npm run lint:fix     # Fix linting issues
npm run format       # Format code with Prettier
npm run type-check   # Check TypeScript types
npm run docs         # Generate API documentation
```

## Style Guidelines

### TypeScript/JavaScript

- Use **TypeScript** for all new code
- Follow the existing code style (enforced by ESLint)
- Use **meaningful variable and function names**
- Add **JSDoc comments** for public APIs
- Avoid `any` and `unknown` types where possible
- Prefer `interface` over `type` for object shapes
- Use `async/await` over callbacks or raw promises

### Code Organization

```typescript
// Good: Clear, focused functions
async function connectToServer(options: ServerOptions): Promise<Connection> {
  validateOptions(options);
  const connection = await createConnection(options);
  await connection.initialize();
  return connection;
}

// Bad: Doing too much in one function
async function doEverything(options: any) {
  // 100+ lines of mixed concerns...
}
```

### Error Handling

```typescript
// Good: Specific error types with context
class OllamaConnectionError extends Error {
  constructor(
    message: string,
    public readonly host: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'OllamaConnectionError';
  }
}

// Bad: Generic errors
throw new Error('Connection failed');
```

## Commit Guidelines

We follow a simplified version of [Conventional Commits](https://www.conventionalcommits.org/):

### Format

```
<type>: <description>

[optional body]

[optional footer]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `test`: Test additions or changes
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `chore`: Maintenance tasks
- `style`: Code style changes (formatting, etc.)

### Examples

```bash
feat: add support for SSE transport

Implemented Server-Sent Events transport for real-time
communication with MCP servers.

Closes #123
```

```bash
fix: handle timeout errors in Ollama client

Added proper timeout handling with configurable retry logic
to improve reliability of Ollama API calls.
```

## Pull Request Process

1. **Update Your Fork**:
   ```bash
   git fetch upstream
   git checkout main
   git merge upstream/main
   ```

2. **Create a Feature Branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make Your Changes**:
   - Write code
   - Add/update tests
   - Update documentation
   - Run tests locally

4. **Commit Your Changes**:
   ```bash
   git add .
   git commit -m "feat: your feature description"
   ```

5. **Push to Your Fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create Pull Request**:
   - Go to your fork on GitHub
   - Click "New Pull Request"
   - Provide clear description of changes
   - Link related issues

7. **Code Review**:
   - Address reviewer feedback
   - Push additional commits as needed
   - Discuss any concerns

8. **Merge**:
   - Once approved, a maintainer will merge your PR
   - Delete your feature branch after merge

## Testing Guidelines

### Test Structure

```typescript
describe('ComponentName', () => {
  describe('methodName', () => {
    it('should handle normal case', async () => {
      // Arrange
      const input = createTestInput();
      
      // Act
      const result = await component.method(input);
      
      // Assert
      expect(result).toMatchExpectedOutput();
    });

    it('should handle error case', async () => {
      // Test error scenarios
    });
  });
});
```

### Test Coverage

- Aim for **80%+ code coverage**
- Test both **happy paths** and **error cases**
- Include **integration tests** for complex flows
- Add **e2e tests** for critical user journeys

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# Coverage report
npm run test:coverage

# Watch mode
npm run test:watch
```

## Documentation

### Code Documentation

- Add **JSDoc comments** to all public APIs
- Include **examples** in JSDoc when helpful
- Document **complex algorithms** inline
- Keep comments **up-to-date** with code changes

```typescript
/**
 * Connects to an MCP server using the specified transport
 * 
 * @param options - Transport configuration options
 * @returns Promise resolving to server ID
 * @throws {TransportError} If connection fails
 * 
 * @example
 * ```typescript
 * const serverId = await client.connectToServer({
 *   type: 'stdio',
 *   command: 'mcp-server',
 *   args: ['--config', 'server.json']
 * });
 * ```
 */
async function connectToServer(options: TransportOptions): Promise<string> {
  // Implementation
}
```

### User Documentation

- Update **README.md** for user-facing changes
- Add **tutorials** for new features
- Update **CLI documentation** for command changes
- Include **migration guides** for breaking changes

## Community

### Getting Help

- 💬 [GitHub Discussions](https://github.com/mayanksingh09/ollama-mcp-client/discussions) - Ask questions and share ideas
- 🐛 [Issue Tracker](https://github.com/mayanksingh09/ollama-mcp-client/issues) - Report bugs and request features
- 📖 [Documentation](./docs/) - Read the docs

### Recognition

Contributors will be recognized in:
- The project README
- Release notes for their contributions
- Special thanks in major version releases

## Questions?

If you have questions about contributing, feel free to:
1. Open a [discussion](https://github.com/mayanksingh09/ollama-mcp-client/discussions)
2. Ask in an existing related issue
3. Reach out to maintainers

Thank you for contributing to Ollama MCP Client! 🎉