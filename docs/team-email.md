**Subject:** Cut your Claude Code token bill on big pastes — install `pipethis` (5 min)

Team,

We shipped a small tool called **pipethis** that makes large pastes in Claude Code
*a lot* cheaper. Instead of a big log/doc/transcript costing full text tokens, it
renders the content into a dense image that Claude reads by vision — typically
**75–90% fewer input tokens** — and appends any byte-exact bits (URLs, IDs, env
keys, hashes) as verbatim text so nothing important is lost.

Repo: https://github.com/dbbuilder-org/pipethis

---

## What you get

Type `pipethis:` followed by a big blob in Claude Code, e.g.:

```
pipethis: <paste a large log / doc / transcript>
```

Claude renders → stores → loads it as an image in one step (no extra clicks), and
replies with the gist plus a "trust these over the image" list of the exact values.

---

## Install (one time, ~5 minutes)

**Prerequisites:** Node.js ≥ 18 and the `claude` CLI already installed.
(Linux clipboard support also needs one of `wl-clipboard`, `xclip`, or `xsel`.)

### macOS / Linux

```bash
git clone https://github.com/dbbuilder-org/pipethis.git
cd pipethis
./install.sh
```

### Windows (PowerShell)

```powershell
git clone https://github.com/dbbuilder-org/pipethis.git
cd pipethis
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

The installer installs dependencies, registers the MCP server with Claude Code
(user scope, so it works in every project), and installs the `pipethis` skill.

### Then — important

**Restart Claude Code.** The tools only load at session start.

Verify it worked:

```bash
claude mcp list        # should show:  pipethis … ✔ Connected
```

---

## Use it — step by step

1. Copy or open the big content (a log dump, a spec, a long transcript, API output…).
2. In Claude Code, start a message with **`pipethis:`** and paste the content after it.
3. Send. Claude renders it to an image and answers from that image — you'll see a
   line like `~82% saved` and a stored path.
4. If the content has must-be-exact values (redirect URIs, GUIDs, secrets), read
   them from the **Exact values** appendix in Claude's reply — not from the image.

Other ways to trigger it:
- "**paste as image**" / "**pxpipe this**" → images your clipboard
- "**load /path/to/file.log as an image**" → images a file

---

## When to use it (and when not)

- ✅ **Great for:** large logs, docs, transcripts, dumps — anything where you need
  the *gist* and a few exact values.
- ⚠️ **Not for:** content that must be reproduced 100% byte-exact everywhere (e.g.
  code you'll edit line-by-line). The exact-values appendix covers scattered
  identifiers, but for fully-verbatim content just paste it as normal text, or add
  `exact: true` and it'll keep it as text.

---

## Troubleshooting

- **`pipethis:` does nothing / no tools** → you didn't restart Claude Code. Restart,
  then `claude mcp list`.
- **"claude CLI not found"** during install → install Claude Code first, re-run the
  installer.
- **Clipboard option returns nothing on Linux** → `sudo apt install wl-clipboard`
  (or `xclip`/`xsel`), or just use the file/paste path.

Questions or issues → reply here, or open an issue at
https://github.com/dbbuilder-org/pipethis/issues.

Thanks,
Chris
