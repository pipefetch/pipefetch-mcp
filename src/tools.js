/**
 * The Pipefetch MCP server for AI tools that start a local program (Claude Desktop and others).
 *
 * It keeps no list of tools of its own. It asks the hosted server at pipefetch.com/mcp which tools
 * exist and passes every call on to it with your key, so an endpoint added to Pipefetch is available
 * here the day it goes live, without a new version of this package.
 */
import { Server } from '@modelcontextprotocol/server';

export const VERSION = '0.4.0';
const DEFAULT_BASE_URL = 'https://pipefetch.com';
/** Pipefetch answers within about 90 seconds or not at all. */
const TIMEOUT_MS = 120_000;

const failed = (text) => ({ content: [{ type: 'text', text }], isError: true });

/**
 * @param {Record<string, string | undefined>} [env] Where PIPEFETCH_API_KEY (and, for tests, PIPEFETCH_BASE_URL) are read from.
 * @param {typeof fetch} [fetchImpl]
 */
export function buildServer(env = process.env, fetchImpl = fetch) {
  const endpoint = `${(env.PIPEFETCH_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')}/mcp`;
  const server = new Server({ name: 'pipefetch', version: VERSION }, { capabilities: { tools: {} } });
  let nextId = 0;

  /** One request to the hosted server, answered with its result. */
  async function remote(method, params) {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'user-agent': `pipefetch-mcp/${VERSION}`,
        ...(env.PIPEFETCH_API_KEY ? { 'x-api-key': env.PIPEFETCH_API_KEY } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++nextId, method, params }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await response.json().catch(() => null);
    if (!body || body.error || body.result === undefined) {
      throw new Error(body?.error?.message ?? `Pipefetch answered with status ${response.status}.`);
    }
    return body.result;
  }

  // The tool list needs no key, so a tool shows what it offers before the key is set.
  server.setRequestHandler('tools/list', () => remote('tools/list', {}));

  server.setRequestHandler('tools/call', async (request) => {
    if (!env.PIPEFETCH_API_KEY) {
      return failed('No Pipefetch API key is set. Add PIPEFETCH_API_KEY to this MCP server\'s configuration. A key with 100 free credits is at https://pipefetch.com/dashboard');
    }
    try {
      return await remote('tools/call', request.params);
    } catch (error) {
      return failed(`Pipefetch could not answer: ${error?.message ?? error}`);
    }
  });

  return server;
}
