# px-pipe-mcp

Local MCP server that renders large text blobs to **dense PNG pages** via
[pxpipe](https://github.com/teamchong/pxpipe) and returns them as **image
blocks**. The model reads them by vision (~3× denser than text tokens), so big
gist-tolerant content costs a fraction of the input tokens — in one step, with no
separate Read.

## Tools

| Tool | Args | Use |
|---|---|---|
| `paste_clipboard_as_image` | `minChars?`, `exact?` | Image whatever is on the clipboard. |
| `render_file_as_image` | `path`, `minChars?`, `exact?` | Image a file's contents. |
| `render_text_as_image` | `text`, `minChars?`, `exact?` | Image text from another tool result. |

Each returns a text summary (`N text tokens -> M image tokens (~X% saved)`, plus
any fidelity warnings) followed by one image block per page.

## Safety (mixed content)

- **Size gate** — content under `minChars` (default 2000) is refused; imaging
  tiny blobs loses money.
- **`exact: true`** — refuses to image and tells the caller to keep the content as
  text. Use for anything that must survive byte-exact (IDs, hashes, code you'll
  edit) — pxpipe is lossy on dense exact strings.
- A heuristic flags likely code/exact data and warns even when it renders.
- **Exact-values appendix** (`extractExact`, default **true**) — best of both:
  the image carries the gist cheaply, and byte-exact tokens are appended below it
  as verbatim text so nothing lossy has to be trusted from pixels. Extracts
  code-block contents, env keys (`Foo__Bar`), URLs, GUIDs, emails, hashes, and
  inline-code spans, deduped and typed as `<type>.<n>: <value>` (fragments of an
  already-captured value are suppressed). Set `extractExact: false` to omit it.

Refusals come back as a plain-text `content` block naming the `reason`
(`no_input`, `below_min_chars`, `exact_requested`, `render_error`) — a decision,
not an error.

## Setup

```bash
cd ~/dev2/px-pipe-mcp && pnpm install
claude mcp add --scope user px-pipe-mcp -- node ~/dev2/px-pipe-mcp/server.mjs
```

## Test

```bash
node --test   # spawns the server over stdio and exercises every tool
```

## Relationship to the skill

Shares the same render core as the `paste-as-image` skill. The skill writes PNGs
to disk and has Claude `Read` them (two steps, Claude-Code-only); this MCP returns
image blocks inline (one step, any MCP client).
