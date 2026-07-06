#!/usr/bin/env node
// px-pipe CLI — the fallback engine for the paste-as-image skill when the MCP
// tools aren't loaded. Renders clipboard/file/stdin text to dense PNG page(s)
// via pxpipe, stores them, and prints one JSON object. Shares lib.mjs with the
// MCP server so the logic is identical.
//
// Usage: node render.mjs [--file <path>] [--stdin] [--exact] [--no-extract]
//                        [--min-chars <n>] [--cols <n>]
// Source precedence: --file → --stdin → clipboard.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { renderBlob, readClipboard } from './lib.mjs';

function parseArgs(argv) {
  const o = { file: null, stdin: false, exact: false, extractExact: true, minChars: 2000, cols: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') o.file = argv[++i];
    else if (a === '--stdin') o.stdin = true;
    else if (a === '--exact') o.exact = true;
    else if (a === '--no-extract') o.extractExact = false;
    else if (a === '--min-chars') o.minChars = Number(argv[++i]);
    else if (a === '--cols') o.cols = Number(argv[++i]);
  }
  return o;
}

function emit(obj, code) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
  process.exit(code);
}

function readSource(o) {
  if (o.file) return readFileSync(o.file, 'utf8');
  if (o.stdin) {
    try { return readFileSync(0, 'utf8'); } catch { return ''; }
  }
  const clip = readClipboard();
  if (clip) return clip;
  try {
    if (!process.stdin.isTTY) return readFileSync(0, 'utf8');
  } catch { /* no stdin */ }
  return '';
}

const REASON_EXIT = { no_input: 2, below_min_chars: 3, exact_requested: 4, render_error: 5 };

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const text = readSource(o);

  const r = await renderBlob(text, {
    exact: o.exact, minChars: o.minChars, cols: o.cols, extractExact: o.extractExact,
  });
  if (!r.ok) emit(r, REASON_EXIT[r.reason] ?? 1);

  const dir = join(homedir(), '.pxpipe', 'pastes', String(Date.now()));
  mkdirSync(dir, { recursive: true });
  const pages = r.pages.map((p, i) => {
    const path = join(dir, `page-${i + 1}.png`);
    writeFileSync(path, p.png);
    return path;
  });

  emit({
    ok: true,
    pages,                        // absolute PNG paths to Read
    chars: r.chars,
    textTokens: r.textTokens,
    imageTokens: r.imageTokens,
    savedPct: r.savedPct,
    droppedChars: r.droppedChars,
    warnings: r.warnings,
    exactValues: r.exactValues,   // [{ type, key, value }] verbatim tokens
  }, 0);
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({ ok: false, reason: 'fatal', detail: String(err) }) + '\n');
  process.exit(1);
});
