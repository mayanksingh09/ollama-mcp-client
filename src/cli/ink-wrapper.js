#!/usr/bin/env node

/**
 * CommonJS wrapper for launching the ESM Ink UI
 * This avoids ESM/CommonJS compatibility issues
 */

const { spawn } = require('child_process');
const path = require('path');

function launchInkUI(options = {}) {
  // Build command line arguments
  const args = [];
  
  // Add the entry file - use src directory
  const entryFile = path.join(__dirname, '../../src/cli/ink-entry.mts');
  args.push(entryFile);
  
  // Pass through options
  if (options.model) args.push('--model', options.model);
  if (options.temperature) args.push('--temperature', String(options.temperature));
  if (options.maxTokens) args.push('--max-tokens', String(options.maxTokens));
  if (options.system) args.push('--system', options.system);
  if (options.config) args.push('--config', options.config);
  
  // Use tsx to run TypeScript ESM file directly
  // Important: Use 'inherit' for stdio to properly handle TTY
  const child = spawn('npx', ['tsx', ...args], {
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' },
    shell: process.platform === 'win32'
  });

  child.on('error', (error) => {
    console.error('Failed to start Ink UI:', error);
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });

  // Pass through signals
  process.on('SIGINT', () => {
    child.kill('SIGINT');
  });
  
  process.on('SIGTERM', () => {
    child.kill('SIGTERM');
  });
}

// Export for use in other modules
module.exports = { launchInkUI };

// Run directly if called as script
if (require.main === module) {
  const options = {};
  const args = process.argv.slice(2);
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--model' && args[i + 1]) {
      options.model = args[++i];
    } else if (arg === '--temperature' && args[i + 1]) {
      options.temperature = args[++i];
    } else if (arg === '--max-tokens' && args[i + 1]) {
      options.maxTokens = args[++i];
    } else if (arg === '--system' && args[i + 1]) {
      options.system = args[++i];
    } else if (arg === '--config' && args[i + 1]) {
      options.config = args[++i];
    }
  }
  
  launchInkUI(options);
}