---
name: pipethis
description: Render a large paste, clipboard, or file into a dense PNG image via pxpipe and load it into context as an image, so bulky content costs vision tokens (~3x denser) instead of text tokens — with a verbatim appendix of any byte-exact tokens. Use when a message starts with "pipethis:", or the user says "paste as image", "pxpipe this", or "load this file/clipboard as an image".
---

# pipethis

Turn a large blob into a dense PNG that the model reads by vision (~3× cheaper
than text tokens), and append any byte-exact tokens (URLs, IDs, env keys, hashes)
as verbatim text so nothing lossy has to be trusted from pixels.

## `pipethis:` — one step, zero interaction (do this immediately)

When a user message starts with **`pipethis:`**, treat everything after the
prefix as the payload and, **without asking any questions or confirming**:

1. Call the MCP tool **`render_text_as_image`** with
   `{ text: "<payload>", minChars: 1 }` (minChars 1 forces imaging regardless of
   size — the user explicitly opted in).
2. The tool stores the PNG, returns the image block(s), a savings summary, and an
   **Exact values** appendix. Keep/read the image, then reply with ONE line: what
   it is and `~X% saved`. If byte-exact values matter (IDs, URLs, secrets), quote
   them from the appendix — **never from the pixels**.

That is the whole flow — store, render, load, done. Don't narrate steps.

## Other triggers

- "paste as image" / "pxpipe this" on copied content → `paste_clipboard_as_image`
- "load <file> as an image" → `render_file_as_image { path }`
- content from another tool result → `render_text_as_image { text }`

Every tool takes optional `minChars` (default 2000), `exact` (true = keep as
text, don't image), and `extractExact` (default true = append the verbatim
byte-exact list).

## When NOT to image the whole thing

Images are lossy on dense byte-exact strings. The tools handle this two ways:
the **Exact values** appendix preserves the critical tokens verbatim, and
`exact: true` skips imaging entirely for content that must stay 100% text. Trust
the appendix (or re-request `exact: true`) for anything that must be verbatim.

## Fallback (MCP tools not loaded this session)

If `render_text_as_image` isn't available, use the bundled CLI, then Read the
emitted `pages[]`:

```bash
printf '%s' '<payload>' | node __PIPETHIS_DIR__/render.mjs --stdin --min-chars 1
```

Its JSON includes `pages[]` (PNG paths to Read), `savedPct`, `warnings`, and
`exactValues` (the same verbatim `<type>.<n>: <value>` list).
