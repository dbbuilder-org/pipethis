# pipethis

[![CI](https://github.com/dbbuilder-org/pipethis/actions/workflows/ci.yml/badge.svg)](https://github.com/dbbuilder-org/pipethis/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Turn a large paste, file, or clipboard into a **dense PNG image** that Claude
reads by vision (~3× cheaper than text tokens) — with a **verbatim appendix** of
any byte-exact tokens so nothing lossy has to be trusted from pixels.

Type `pipethis: <big blob>` in Claude Code and it renders → stores → loads the
image in one step, zero interaction. Built on
[pxpipe](https://github.com/teamchong/pxpipe) (the `pxpipe-proxy` npm package —
no fork, just a pinned dependency).

Ships three ways to use the same engine: an **MCP server** (primary), a **CLI**
(`render.mjs`, the fallback), and a **Claude Code skill** (the `pipethis:`
trigger).

---

## Quick start (one clone)

```bash
git clone https://github.com/dbbuilder-org/pipethis.git
cd pipethis

# macOS / Linux
./install.sh

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Then **restart Claude Code** and type:

```
pipethis: <paste a large log / doc / transcript here>
```

The installer: installs deps (pnpm or npm), registers the MCP server with Claude
Code at user scope, and installs the `pipethis` skill. It's re-runnable.

**Prerequisites:** Node.js ≥ 18 and the `claude` CLI. `pnpm` is used if present,
otherwise `npm`. Linux clipboard needs one of `wl-paste` / `xclip` / `xsel`.

### Manual install (what the installer does)

Prefer to wire it up yourself:

```bash
cd pipethis
pnpm install                                            # or: npm install
claude mcp add --scope user pipethis -- node "$PWD/server.mjs"
mkdir -p ~/.claude/skills/pipethis
sed "s#__PIPETHIS_DIR__#$PWD#g" skill/pipethis/SKILL.md > ~/.claude/skills/pipethis/SKILL.md
# then restart Claude Code
```

---

## What it does

```
big content (paste / file / clipboard)
  → pxpipe renderTextToImages()            dense PNG page(s)
  → returned as image block(s)             model reads by vision
  + byte-exact tokens appended verbatim    URLs, IDs, env keys, hashes
```

Text priced at ~1 char/token becomes an image priced by pixels (~3.1 chars/image
token), so a big blob typically drops 75–90% of its input tokens. Recent-turn
content stays text; only the pasted blob is imaged.

## Example

You type:

```
pipethis: # Billboard SSO setup
Redirect URI (exact): https://billboard-api-8692.onrender.com/api/auth/sso/callback
Set Entra__ClientId / Entra__ClientSecret on the API. Tenant 11111111-2222-3333-4444-555555555555.
… (a few thousand more chars) …
```

Claude renders it in one step and replies from the image, e.g.:

```
Rendered 2987 chars to 1 image page(s): 739 text tokens -> 184 image tokens (~75% saved).
Stored at: ~/.pxpipe/pastes/1783381685645/page-1.png
Exact values (verbatim — trust these over the image):
  code_block.1: https://billboard-api-8692.onrender.com/api/auth/sso/callback
  env.1: Entra__ClientId
  env.2: Entra__ClientSecret
  guid.1: 11111111-2222-3333-4444-555555555555
```

The gist comes from the cheap image; the must-be-exact strings come through the
appendix verbatim — so a redirect URI or ID is never trusted from pixels.

## MCP tools

| Tool | Args | Use |
|---|---|---|
| `render_text_as_image` | `text`, gate* | Text (what `pipethis:` calls). |
| `paste_clipboard_as_image` | gate* | Whatever is on the clipboard. |
| `render_file_as_image` | `path`, gate* | A file's contents. |

*gate = `minChars?` (default 2000), `exact?` (true = keep as text), `extractExact?`
(default true = append the verbatim byte-exact list). Each result is a savings
summary + the stored path + image block(s) + the Exact-values appendix.

## CLI (fallback)

```bash
node render.mjs --file /abs/blob.log        # or --stdin, or clipboard (default)
node render.mjs --stdin --min-chars 1       # force-image piped input
node render.mjs --file x --exact            # refuse to image, keep text
```
Prints JSON: `pages[]` (PNG paths to Read), `savedPct`, `warnings`, `exactValues`.

## Safety (mixed content)

- **Size gate** — content under `minChars` isn't imaged (imaging tiny blobs loses money).
- **`exact: true`** — skips imaging entirely; keep content as text.
- **Fidelity warning** — a heuristic flags likely code/exact data even when it renders.
- **Exact-values appendix** (`extractExact`, default on) — best of both: the image
  carries the gist cheaply, and byte-exact tokens are appended below it as verbatim
  `<type>.<n>: <value>` text. Extracts code-block contents, env keys (`Foo__Bar`),
  URLs, GUIDs, emails, hashes, and inline-code spans — deduped, with fragments of an
  already-captured value suppressed.

Refusals return a plain-text block naming the `reason` (`no_input`,
`below_min_chars`, `exact_requested`, `render_error`) — a decision, not an error.

## Troubleshooting

- **`pipethis:` does nothing / tools missing** — restart Claude Code after
  installing; MCP tools load at session start. Check with `claude mcp list`
  (should show `pipethis … ✔ Connected`) or `/mcp` inside Claude Code.
- **"claude CLI not found"** — install Claude Code, then re-run the installer (or
  do the `claude mcp add` from *Manual install*).
- **Clipboard tool returns nothing on Linux** — install `wl-clipboard`, `xclip`,
  or `xsel`. On headless boxes, use `render_file_as_image` / `--file` instead.
- **Everything gets refused as `below_min_chars`** — the content is under 2000
  chars; pass `minChars: 1` (the `pipethis:` path already does).
- **An exact value looks wrong in the image** — that's expected; read it from the
  **Exact values** appendix, not the pixels. For fully verbatim content use
  `exact: true` to keep it as text.

## Uninstall

```bash
./uninstall.sh            # macOS / Linux  (removes MCP registration + skill)
```
Windows: `claude mcp remove --scope user pipethis` and delete
`%USERPROFILE%\.claude\skills\pipethis`.

## Develop

```bash
node --test               # unit (lib) + CLI + stdio MCP integration
```

Everything shares one core (`lib.mjs`): `renderBlob` (gate + render + savings) and
`extractExactValues` (the appendix). `server.mjs` is the MCP wrapper, `render.mjs`
the CLI wrapper — no duplicated logic.
