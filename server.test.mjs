// Integration tests: spawn server.mjs over stdio via the MCP client and exercise
// every tool end-to-end, including the image content blocks. Run: node --test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = dirname(fileURLToPath(import.meta.url));
const big = 'The quick brown fox jumps over the lazy dog. '.repeat(200); // ~9000 chars

let client;
const call = (name, args = {}) => client.callTool({ name, arguments: args });
const kinds = (res) => res.content.map((c) => c.type);
const textOf = (res) => res.content.find((c) => c.type === 'text')?.text ?? '';
const imageOf = (res) => res.content.find((c) => c.type === 'image');

// Optional macOS clipboard helpers (skip clipboard test where unavailable).
function clipboardAvailable() {
  try { execFileSync('pbcopy', { input: '' }); execFileSync('pbpaste'); return true; }
  catch { return false; }
}
function readClip() { try { return execFileSync('pbpaste', { encoding: 'utf8' }); } catch { return ''; } }
function writeClip(s) { execFileSync('pbcopy', { input: s }); }

before(async () => {
  client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [join(here, 'server.mjs')],
  }));
});
after(async () => { await client?.close(); });

test('lists exactly the three tools with input schemas', async () => {
  const { tools } = await client.listTools();
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
  assert.deepEqual(Object.keys(byName).sort(),
    ['paste_clipboard_as_image', 'render_file_as_image', 'render_text_as_image']);
  assert.ok(byName.render_file_as_image.inputSchema.properties.path);
  assert.ok(byName.render_text_as_image.inputSchema.properties.text);
  for (const t of Object.values(byName)) {
    assert.ok(t.inputSchema.properties.minChars);
    assert.ok(t.inputSchema.properties.exact);
    assert.ok((t.description || '').length > 20, `${t.name} needs a real description`);
  }
});

test('render_text_as_image: image block + savings summary', async () => {
  const res = await call('render_text_as_image', { text: big });
  assert.ok(kinds(res).includes('image'));
  assert.match(textOf(res), /saved/i);
  const img = imageOf(res);
  assert.equal(img.mimeType, 'image/png');
  // base64 decodes to a real PNG (magic bytes \x89PNG).
  const bytes = Buffer.from(img.data, 'base64');
  assert.deepEqual([...bytes.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
});

test('render_text_as_image: stores the page to disk and reports the path', async () => {
  const res = await call('render_text_as_image', { text: big });
  const summary = textOf(res);
  const m = summary.match(/(\/[^\s]+\/page-1\.png)/);
  assert.ok(m, `expected a stored page path in summary, got: ${summary}`);
  assert.ok(existsSync(m[1]), `stored page should exist on disk: ${m[1]}`);
});

test('render_text_as_image: tiny input refused, no image', async () => {
  const res = await call('render_text_as_image', { text: 'hi' });
  assert.ok(!kinds(res).includes('image'));
  assert.match(textOf(res), /below_min_chars/);
});

test('render_text_as_image: exact:true keeps text, no image', async () => {
  const res = await call('render_text_as_image', { text: big, exact: true });
  assert.ok(!kinds(res).includes('image'));
  assert.match(textOf(res), /exact_requested/);
});

test('render_text_as_image: custom minChars can force imaging of shorter text', async () => {
  const res = await call('render_text_as_image', { text: 'a'.repeat(300), minChars: 100 });
  assert.ok(kinds(res).includes('image'));
});

test('render_file_as_image: reads a real file and images it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pxmcp-'));
  const file = join(dir, 'blob.txt');
  writeFileSync(file, big);
  try {
    const res = await call('render_file_as_image', { path: file });
    assert.ok(kinds(res).includes('image'));
    assert.match(textOf(res), /saved/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('render_file_as_image: missing file returns an isError result', async () => {
  const res = await call('render_file_as_image', { path: '/no/such/file/here.txt' });
  assert.equal(res.isError, true);
  assert.match(textOf(res), /cannot read file/i);
});

test('paste_clipboard_as_image: images clipboard contents (clipboard restored)', { skip: !clipboardAvailable() }, async () => {
  const saved = readClip();
  try {
    writeClip(big);
    const res = await call('paste_clipboard_as_image', {});
    assert.ok(kinds(res).includes('image'));
    assert.match(textOf(res), /saved/i);
  } finally {
    writeClip(saved); // restore whatever the user had
  }
});
