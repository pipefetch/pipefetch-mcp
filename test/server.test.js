import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const serverFile = fileURLToPath(new URL('../src/server.js', import.meta.url));

/** The tools the stand-in hosted server offers. The second one is not known to this package in any way. */
const REMOTE_TOOLS = [
  {
    name: 'youtube_transcript',
    title: 'YouTube transcript',
    description: 'Get the transcript of a video. Costs 1 Pipefetch credit.',
    inputSchema: { type: 'object', properties: { video: { type: 'string' } }, required: ['video'], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'brand_new_source_lookup',
    title: 'Added yesterday',
    description: 'A tool that went live after this package was published. Costs 2 Pipefetch credits.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 5 } }, required: ['id'], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
];

/** A stand-in for the hosted server at pipefetch.com/mcp that records what it was asked. */
async function fakeHosted() {
  const asked = [];
  const http = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      const message = JSON.parse(raw);
      asked.push({ path: req.url, method: message.method, params: message.params, key: req.headers['x-api-key'], agent: req.headers['user-agent'] });
      const answer = (body) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, ...body }));
      };
      if (message.method === 'tools/list') return answer({ result: { tools: REMOTE_TOOLS } });
      if (message.method === 'tools/call' && message.params.name === 'no_such_tool') return answer({ error: { code: -32602, message: 'Unknown tool: no_such_tool' } });
      if (message.method === 'tools/call' && message.params.arguments.video === 'nocaptions00') {
        return answer({ result: { content: [{ type: 'text', text: 'This video has no captions. Nothing was charged. (no_transcript)' }], isError: true } });
      }
      if (message.method === 'tools/call') return answer({ result: { content: [{ type: 'text', text: `${message.params.name} answered for ${JSON.stringify(message.params.arguments)}` }] } });
      return answer({ error: { code: -32601, message: 'Method not found' } });
    });
  });
  await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve));
  return { asked, url: `http://127.0.0.1:${http.address().port}`, close: () => new Promise((resolve) => http.close(resolve)) };
}

/** Start the server as an MCP client would, and talk to it in newline-delimited JSON-RPC. */
function startServer(env) {
  const child = spawn(process.execPath, [serverFile], { env: { ...process.env, PIPEFETCH_API_KEY: '', PIPEFETCH_BASE_URL: '', ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const waiting = new Map();
  let buffer = '';
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      if (message.id !== undefined && waiting.has(message.id)) {
        waiting.get(message.id)(message);
        waiting.delete(message.id);
      }
    }
  });
  let nextId = 1;
  const send = (message) => child.stdin.write(JSON.stringify(message) + '\n');
  const request = (method, params) => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`No answer to ${method}. Server said: ${stderr}`)), 10_000);
      waiting.set(id, (message) => {
        clearTimeout(timer);
        resolve(message);
      });
      send({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });
    });
  };
  return {
    request,
    async handshake() {
      const hello = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      return hello;
    },
    stop: () => child.kill(),
  };
}

test('it lists whatever tools Pipefetch has today, also without an API key', async () => {
  const hosted = await fakeHosted();
  const server = startServer({ PIPEFETCH_BASE_URL: hosted.url });
  try {
    const hello = await server.handshake();
    assert.equal(hello.result.serverInfo.name, 'pipefetch');
    assert.ok(hello.result.capabilities.tools, 'it says it has tools');
    const { result } = await server.request('tools/list');
    // The whole list, unchanged: a tool this package has never heard of is offered like any other.
    assert.deepEqual(result.tools, REMOTE_TOOLS);
    assert.deepEqual(hosted.asked.map((a) => [a.path, a.method, a.key]), [['/mcp', 'tools/list', undefined]]);
    assert.match(hosted.asked[0].agent, /^pipefetch-mcp\/\d+\.\d+\.\d+$/);

    // Without a key a call explains what to do, as an error result, and nothing is sent.
    const call = await server.request('tools/call', { name: 'youtube_transcript', arguments: { video: 'jNQXAC9IVRw' } });
    assert.equal(call.result.isError, true);
    assert.match(call.result.content[0].text, /PIPEFETCH_API_KEY/);
    assert.equal(hosted.asked.length, 1);
  } finally {
    server.stop();
    await hosted.close();
  }
});

test('a call goes to Pipefetch with the key, and its answer comes back as it is', async () => {
  const hosted = await fakeHosted();
  const server = startServer({ PIPEFETCH_API_KEY: 'pf_test', PIPEFETCH_BASE_URL: `${hosted.url}/` });
  try {
    await server.handshake();
    const fresh = await server.request('tools/call', { name: 'brand_new_source_lookup', arguments: { id: 'abc', limit: 3 } });
    assert.notEqual(fresh.result.isError, true);
    assert.equal(fresh.result.content[0].text, 'brand_new_source_lookup answered for {"id":"abc","limit":3}');
    assert.deepEqual(hosted.asked.at(-1), { path: '/mcp', method: 'tools/call', params: { name: 'brand_new_source_lookup', arguments: { id: 'abc', limit: 3 } }, key: 'pf_test', agent: hosted.asked.at(-1).agent });

    // An error Pipefetch reports for a call is the tool's answer: the assistant reads it, nothing crashes.
    const missing = await server.request('tools/call', { name: 'youtube_transcript', arguments: { video: 'nocaptions00' } });
    assert.equal(missing.result.isError, true);
    assert.match(missing.result.content[0].text, /no captions.*no_transcript/);

    // A refusal at the protocol level (an unknown tool) is readable too.
    const unknown = await server.request('tools/call', { name: 'no_such_tool', arguments: {} });
    assert.equal(unknown.result.isError, true);
    assert.match(unknown.result.content[0].text, /Unknown tool: no_such_tool/);
  } finally {
    server.stop();
    await hosted.close();
  }
});

test('when Pipefetch cannot be reached, a call says so instead of hanging or crashing', async () => {
  const hosted = await fakeHosted();
  const dead = hosted.url;
  await hosted.close();
  const server = startServer({ PIPEFETCH_API_KEY: 'pf_test', PIPEFETCH_BASE_URL: dead });
  try {
    await server.handshake();
    const call = await server.request('tools/call', { name: 'youtube_transcript', arguments: { video: 'jNQXAC9IVRw' } });
    assert.equal(call.result.isError, true);
    assert.match(call.result.content[0].text, /Pipefetch could not answer/);
    const list = await server.request('tools/list');
    assert.ok(list.error, 'the tool list reports the failure as an error');
  } finally {
    server.stop();
  }
});
