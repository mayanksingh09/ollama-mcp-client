import type { MCPResource } from '../../src/types/mcp.types';

export const textResource: MCPResource = {
  uri: 'file:///documents/readme.txt',
  name: 'README',
  description: 'Project readme file',
  mimeType: 'text/plain',
};

export const jsonResource: MCPResource = {
  uri: 'file:///data/config.json',
  name: 'Configuration',
  description: 'Application configuration',
  mimeType: 'application/json',
};

export const markdownResource: MCPResource = {
  uri: 'file:///docs/guide.md',
  name: 'User Guide',
  description: 'User documentation in Markdown',
  mimeType: 'text/markdown',
};

export const csvResource: MCPResource = {
  uri: 'file:///data/users.csv',
  name: 'User Data',
  description: 'CSV file with user information',
  mimeType: 'text/csv',
};

export const imageResource: MCPResource = {
  uri: 'file:///images/logo.png',
  name: 'Logo',
  description: 'Company logo image',
  mimeType: 'image/png',
};

export const httpResource: MCPResource = {
  uri: 'https://api.example.com/data',
  name: 'API Data',
  description: 'Remote API endpoint',
  mimeType: 'application/json',
};

export const databaseResource: MCPResource = {
  uri: 'db://localhost:5432/mydb/users',
  name: 'Users Table',
  description: 'Database table resource',
  mimeType: 'application/x-sql',
};

export const templateResource: MCPResource = {
  uri: 'template:///email/welcome',
  name: 'Welcome Email Template',
  description: 'Email template for new users',
  mimeType: 'text/html',
};

export const allResources: MCPResource[] = [
  textResource,
  jsonResource,
  markdownResource,
  csvResource,
  imageResource,
  httpResource,
  databaseResource,
  templateResource,
];

export function getResourceByUri(uri: string): MCPResource | undefined {
  return allResources.find((resource) => resource.uri === uri);
}

export function getResourcesByMimeType(mimeType: string): MCPResource[] {
  return allResources.filter((resource) => resource.mimeType === mimeType);
}

export function getResourcesByProtocol(protocol: string): MCPResource[] {
  return allResources.filter((resource) => resource.uri.startsWith(protocol));
}

export const sampleResourceContents = {
  'file:///documents/readme.txt': `# Sample Project

This is a sample readme file for testing purposes.

## Features
- Feature 1
- Feature 2
- Feature 3

## Installation
npm install sample-project`,

  'file:///data/config.json': JSON.stringify(
    {
      version: '1.0.0',
      settings: {
        debug: true,
        timeout: 5000,
        maxRetries: 3,
      },
      features: ['feature1', 'feature2'],
    },
    null,
    2
  ),

  'file:///docs/guide.md': `# User Guide

## Getting Started

Welcome to our application!

### Prerequisites
- Node.js 18+
- npm or yarn

### Quick Start
1. Install dependencies
2. Configure settings
3. Run the application`,

  'file:///data/users.csv': `id,name,email,role
1,John Doe,john@example.com,admin
2,Jane Smith,jane@example.com,user
3,Bob Johnson,bob@example.com,user`,

  'https://api.example.com/data': JSON.stringify({
    status: 'success',
    data: [
      { id: 1, value: 'Item 1' },
      { id: 2, value: 'Item 2' },
    ],
    timestamp: new Date().toISOString(),
  }),

  'db://localhost:5432/mydb/users': `SELECT * FROM users LIMIT 10;`,

  'template:///email/welcome': `<!DOCTYPE html>
<html>
<head>
  <title>Welcome</title>
</head>
<body>
  <h1>Welcome {{name}}!</h1>
  <p>Thank you for joining us.</p>
</body>
</html>`,
};

export function getResourceContent(uri: string): string | undefined {
  return sampleResourceContents[uri as keyof typeof sampleResourceContents];
}
