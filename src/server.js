#!/usr/bin/env node
/**
 * Starts the Pipefetch MCP server on standard input and output, which is how Claude Desktop, Claude
 * Code, Cursor and other MCP clients run it:  npx -y pipefetch-mcp
 * The API key comes from the PIPEFETCH_API_KEY environment variable.
 */
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { buildServer } from './tools.js';

const server = buildServer();
await server.connect(new StdioServerTransport());
// Standard output belongs to the protocol; anything for a human goes to standard error.
console.error('Pipefetch MCP server is running.');
