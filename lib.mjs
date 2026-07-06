// Shared render core for the pxpipe-image MCP server.
// Turns text into dense PNG pages via pxpipe, with a mixed-content safety gate.
import { execFileSync } from 'node:child_process';
import { renderTextToImages } from 'pxpipe-proxy/transform';
import { encode } from 'gpt-tokenizer';

export function readClipboard() {
  try {
    return execFileSync('pbpaste', { encoding: 'utf8' }) ?? '';
  } catch {
    return ''; // no pbpaste (non-mac) or empty
  }
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

/**
 * Render `text` to PNG pages, or refuse with a machine-readable reason.
 * Returns { ok:false, reason, ... } or
 *         { ok:true, pages:[{png:Uint8Array,width,height}], chars, textTokens,
 *           imageTokens, savedPct, droppedChars, warnings }.
 */
export async function renderBlob(text, { exact = false, minChars = 2000, cols } = {}) {
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
  };
}
