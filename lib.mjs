// Shared render core for the pxpipe-image MCP server.
// Turns text into dense PNG pages via pxpipe, with a mixed-content safety gate.
import { execFileSync } from 'node:child_process';
import { platform } from 'node:os';
import { renderTextToImages } from 'pxpipe-proxy/transform';
import { encode } from 'gpt-tokenizer';

// Per-OS clipboard read commands, tried in order until one yields text.
const CLIPBOARD_READERS = {
  darwin: [['pbpaste', []]],
  win32: [['powershell', ['-NoProfile', '-Command', 'Get-Clipboard']]],
  linux: [
    ['wl-paste', ['--no-newline']],
    ['xclip', ['-selection', 'clipboard', '-o']],
    ['xsel', ['-b']],
  ],
};

export function readClipboard() {
  for (const [cmd, args] of CLIPBOARD_READERS[platform()] || []) {
    try {
      const out = execFileSync(cmd, args, { encoding: 'utf8' });
      if (out && out.trim().length > 0) return out;
    } catch {
      // reader missing or clipboard empty — try the next one
    }
  }
  return '';
}

function fidelityWarnings(text, droppedChars) {
  const warnings = [];
  const hasLongHex = /[0-9a-f]{12,}/i.test(text);
  const symbols = (text.match(/[^\w\s]/g) || []).length;
  const symbolDensity = text.length ? symbols / text.length : 0;
  const codeMarkers = /(\bfunction\b|\bconst\b|\bdef\b|\bimport\b|=>|;\s|\{|\})/.test(text);
  if (hasLongHex || symbolDensity > 0.15 || codeMarkers) {
    warnings.push(
      'looks like code / exact data — images are lossy on byte-exact strings ' +
      '(IDs, hashes, hex); verify identifiers, or set exact:true to keep it as text.',
    );
  }
  if (droppedChars > 0) {
    warnings.push(
      `${droppedChars} char(s) not in the glyph atlas were rendered blank — check for non-ASCII content.`,
    );
  }
  return warnings;
}

// Anthropic vision token approximation: tokens ≈ (width × height) / 750.
function imageTokens(pages) {
  return pages.reduce((sum, p) => sum + Math.ceil((p.width * p.height) / 750), 0);
}

// Byte-exact token extractors, highest signal first. Each returns candidate
// strings from the source; the first type to claim a value wins (global dedup),
// so a redirect URI inside a code block is reported once, as `code_block`.
function matchAll(text, re, group = 0) {
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[group]);
  return out;
}

const EXACT_EXTRACTORS = [
  ['code_block', (t) => {
    const out = [];
    for (const inner of matchAll(t, /```[\w-]*\r?\n([\s\S]*?)```/g, 1)) {
      for (const line of inner.split(/\r?\n/)) if (line.trim()) out.push(line.trim());
    }
    return out;
  }],
  ['env', (t) => matchAll(t, /\b[A-Za-z][A-Za-z0-9]*(?:__[A-Za-z0-9]+)+\b/g)],
  ['url', (t) => matchAll(t, /\bhttps?:\/\/[^\s`)<>\]]+/g)],
  ['guid', (t) => matchAll(t, /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi)],
  ['email', (t) => matchAll(t, /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g)],
  ['hex', (t) => matchAll(t, /\b[0-9a-f]{12,}\b/gi)],
  ['inline', (t) => matchAll(t, /`([^`\n]+)`/g, 1)],
];

/**
 * Pull byte-exact-risk tokens out of `text` so they can be appended as verbatim
 * text alongside the (lossy) image. Returns [{ type, key, value }] deduped by
 * value, numbered per type (e.g. env.1, url.2). Capped at `limit`.
 */
export function extractExactValues(text, limit = 60) {
  const accepted = [];
  const found = [];
  const perType = {};
  for (const [type, fn] of EXACT_EXTRACTORS) {
    for (const raw of fn(text)) {
      const value = String(raw).trim();
      if (!value) continue;
      // Skip exact dupes and fragments of an already-captured, higher-signal value
      // (e.g. a GUID tail matched as loose hex, or `ClientId` inside `Entra__ClientId`).
      if (accepted.some((a) => a === value || a.includes(value))) continue;
      accepted.push(value);
      perType[type] = (perType[type] || 0) + 1;
      found.push({ type, key: `${type}.${perType[type]}`, value });
      if (found.length >= limit) return found;
    }
  }
  return found;
}

/**
 * Render `text` to PNG pages, or refuse with a machine-readable reason.
 * Returns { ok:false, reason, ... } or
 *         { ok:true, pages:[{png:Uint8Array,width,height}], chars, textTokens,
 *           imageTokens, savedPct, droppedChars, warnings, exactValues }.
 */
export async function renderBlob(text, { exact = false, minChars = 2000, cols, extractExact = true } = {}) {
  if (!text || text.trim().length === 0) {
    return { ok: false, reason: 'no_input', detail: 'source was empty' };
  }
  if (text.length < minChars) {
    return {
      ok: false, reason: 'below_min_chars', chars: text.length, minChars,
      detail: 'too small to be worth imaging — use as plain text',
    };
  }
  if (exact) {
    return {
      ok: false, reason: 'exact_requested', chars: text.length,
      detail: 'exact fidelity requested — keep as plain text (imaging is lossy on exact strings)',
    };
  }

  let result;
  try {
    result = await renderTextToImages(text, {
      reflow: true,
      ...(Number.isFinite(cols) ? { cols } : {}),
    });
  } catch (err) {
    return { ok: false, reason: 'render_error', detail: String((err && err.message) || err) };
  }

  const textTokens = encode(text).length;
  const imgTokens = imageTokens(result.pages);
  const savedPct = textTokens > 0 ? Math.round((1 - imgTokens / textTokens) * 100) : 0;
  return {
    ok: true,
    pages: result.pages.map((p) => ({ png: p.png, width: p.width, height: p.height })),
    chars: text.length,
    textTokens,
    imageTokens: imgTokens,
    savedPct,
    droppedChars: result.droppedChars,
    warnings: fidelityWarnings(text, result.droppedChars),
    exactValues: extractExact ? extractExactValues(text) : [],
  };
}
