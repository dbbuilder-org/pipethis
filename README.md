# pipethis

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
