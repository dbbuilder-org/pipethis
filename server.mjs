#!/usr/bin/env node
// pxpipe-image MCP server.
// Tools that render clipboard/file/text to dense PNG pages via pxpipe and return
// them as image blocks — the model reads them by vision (~3x cheaper than text).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { renderBlob, readClipboard } from './lib.mjs';

// Map a renderBlob result to an MCP tool result (text summary + image blocks).
function toContent(result) {
  if (!result.ok) {
    // A refusal is a decision, not an error — tell the caller to use plain text.
    return {
      content: [{
        type: 'text',
        text: `Not imaged (reason: ${result.reason}). ${result.detail || ''}\n` +
              'Use the content as plain text instead.',
      }],
    };
  }
  const summary =
    `Rendered ${result.chars} chars to ${result.pages.length} image page(s): ` +
    `${result.textTokens} text tokens -> ${result.imageTokens} image tokens ` +
    `(~${result.savedPct}% saved).` +
    (result.warnings.length ? `\nWarnings:\n- ${result.warnings.join('\n- ')}` : '');
  const images = result.pages.map((p) => ({
    type: 'image',
    data: Buffer.from(p.png).toString('base64'),
    mimeType: 'image/png',
  }));
  return { content: [{ type: 'text', text: summary }, ...images] };
}

const gate = {
  minChars: z.number().int().positive().optional()
    .describe('minimum source chars before imaging is worthwhile (default 2000)'),
  exact: z.boolean().optional()
    .describe('true = do not image, keep as text (content must survive byte-exact)'),
};

const server = new McpServer({ name: 'px-pipe-mcp', version: '0.1.0' });

server.registerTool('paste_clipboard_as_image', {
  description:
    'Read the clipboard and render it to dense PNG page(s) via pxpipe, returned as ' +
    'image blocks (~3x cheaper than text tokens). For large gist-tolerant logs/docs/' +
    'transcripts. Refuses tiny content or exact-fidelity content (IDs/hashes/code).',
  inputSchema: gate,
}, async ({ minChars, exact }) => toContent(await renderBlob(readClipboard(), { minChars, exact })));

server.registerTool('render_file_as_image', {
  description:
    'Read a file and render it to dense PNG page(s) via pxpipe, returned as image ' +
    'blocks. Refuses tiny or exact-fidelity content.',
  inputSchema: { path: z.string().describe('absolute path to the file'), ...gate },
}, async ({ path, minChars, exact }) => {
  let text = '';
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    return { content: [{ type: 'text', text: `Cannot read file: ${e.message}` }], isError: true };
  }
  return toContent(await renderBlob(text, { minChars, exact }));
});

server.registerTool('render_text_as_image', {
  description:
    'Render provided text to dense PNG page(s) via pxpipe, returned as image blocks. ' +
    'Note: text passed here is already tokenized in the call — most useful when the ' +
    'text came from another tool result. Refuses tiny or exact-fidelity content.',
  inputSchema: { text: z.string().describe('the text to render'), ...gate },
}, async ({ text, minChars, exact }) => toContent(await renderBlob(text, { minChars, exact })));

const transport = new StdioServerTransport();
await server.connect(transport);
