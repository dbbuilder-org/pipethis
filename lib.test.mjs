// Unit tests for the render core (renderBlob). Run: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBlob } from './lib.mjs';

const big = 'The quick brown fox jumps over the lazy dog. '.repeat(200);   // ~9000 chars
const huge = 'The quick brown fox jumps over the lazy dog. '.repeat(6000); // ~270k chars

test('big gist text renders with pages, tokens, and positive savings', async () => {
  const r = await renderBlob(big);
  assert.equal(r.ok, true);
  assert.ok(r.pages.length >= 1);
  assert.ok(r.pages[0].png instanceof Uint8Array, 'page png should be bytes');
  assert.ok(r.pages[0].width > 0 && r.pages[0].height > 0);
  assert.ok(r.textTokens > 0);
  assert.ok(r.imageTokens > 0);
  assert.ok(r.imageTokens < r.textTokens, 'image tokens should beat text tokens');
  assert.equal(r.savedPct, Math.round((1 - r.imageTokens / r.textTokens) * 100));
  assert.ok(r.savedPct > 0);
});

test('huge text paginates into multiple pages', async () => {
  const r = await renderBlob(huge);
  assert.equal(r.ok, true);
  assert.ok(r.pages.length > 1, `expected multiple pages, got ${r.pages.length}`);
});

test('empty / whitespace input -> no_input', async () => {
  for (const t of ['', '   \n\t  ']) {
    const r = await renderBlob(t);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'no_input');
  }
});

test('below-threshold input -> below_min_chars, echoes chars + minChars', async () => {
  const r = await renderBlob('short note', { minChars: 2000 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'below_min_chars');
  assert.equal(r.chars, 'short note'.length);
  assert.equal(r.minChars, 2000);
});

test('minChars is honored as a boundary', async () => {
  const s = 'a'.repeat(50);
  assert.equal((await renderBlob(s, { minChars: 100 })).reason, 'below_min_chars');
  assert.equal((await renderBlob(s, { minChars: 10 })).ok, true);
});

test('exact:true refuses to image', async () => {
  const r = await renderBlob(big, { exact: true });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'exact_requested');
});

test('code/hash content renders but warns about exact data', async () => {
  const code = ("const commit = 'deadbeefcafebabefeedface00112233';\n" +
    'function f(x){ return x.map((y) => y*2); }\n').repeat(60);
  const r = await renderBlob(code);
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => /code|exact/i.test(w)), JSON.stringify(r.warnings));
});

test('plain prose has no code warning', async () => {
  const prose = 'the meeting covered quarterly revenue and hiring plans in detail '.repeat(200);
  const r = await renderBlob(prose);
  assert.equal(r.ok, true);
  assert.equal(r.warnings.length, 0, JSON.stringify(r.warnings));
});
