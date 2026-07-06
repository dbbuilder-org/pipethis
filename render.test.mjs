// CLI tests: drive render.mjs as a subprocess. Run: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, 'render.mjs');
const big = 'The quick brown fox jumps over the lazy dog. '.repeat(200);

// Run render.mjs with stdin input; returns { code, json }.
function run(args, input = '') {
  let out = '';
  let code = 0;
  try {
    out = execFileSync('node', [script, ...args], { input, encoding: 'utf8' });
  } catch (err) {
    out = err.stdout || '';
    code = err.status ?? 1;
  }
  return { code, json: JSON.parse(out) };
}

test('renders stdin to a stored PNG with savings + exact values', () => {
  const input = big + ' see https://example.com/x and Foo__Bar';
  const { code, json } = run(['--stdin', '--min-chars', '1'], input);
  assert.equal(code, 0);
  assert.equal(json.ok, true);
  assert.ok(json.pages.length >= 1 && existsSync(json.pages[0]));
  assert.ok(json.savedPct > 0);
  assert.ok(json.exactValues.some((v) => v.value === 'https://example.com/x'));
  assert.ok(json.exactValues.some((v) => v.value === 'Foo__Bar'));
});

test('tiny stdin refused with below_min_chars', () => {
  const { code, json } = run(['--stdin'], 'hi');
  assert.equal(code, 3);
  assert.equal(json.reason, 'below_min_chars');
});

test('--exact keeps text (exit 4)', () => {
  const { code, json } = run(['--stdin', '--exact'], big);
  assert.equal(code, 4);
  assert.equal(json.reason, 'exact_requested');
});

test('--no-extract omits the exact-values list', () => {
  const { code, json } = run(['--stdin', '--min-chars', '1', '--no-extract'], big + ' https://example.com/z');
  assert.equal(code, 0);
  assert.equal(json.exactValues.length, 0);
});
