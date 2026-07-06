#!/usr/bin/env bash
# pipethis installer (macOS / Linux).
# Installs deps, registers the MCP server with Claude Code (user scope), and
# installs the `pipethis` skill. Re-runnable. Then restart Claude Code.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="${HOME}/.claude/skills"

say() { printf '\033[1;36m▸ %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m!  %s\033[0m\n' "$1"; }

# 1. Prerequisites -----------------------------------------------------------
command -v node >/dev/null 2>&1 || { warn "node not found — install Node.js >=18 first (https://nodejs.org)."; exit 1; }
say "node $(node -v)"

if command -v pnpm >/dev/null 2>&1; then PM=pnpm; else PM=npm; fi
say "package manager: ${PM}"

# 2. Install dependencies ----------------------------------------------------
say "installing dependencies…"
if [ "$PM" = "pnpm" ] && [ -f "$DIR/pnpm-lock.yaml" ]; then
  ( cd "$DIR" && pnpm install --frozen-lockfile )
else
  ( cd "$DIR" && "$PM" install )
fi

# 3. Register the MCP server (idempotent) ------------------------------------
if command -v claude >/dev/null 2>&1; then
  say "registering MCP server 'pipethis' (user scope)…"
  claude mcp remove --scope user pipethis  >/dev/null 2>&1 || true
  claude mcp remove --scope user px-pipe-mcp >/dev/null 2>&1 || true   # supersede old name
  claude mcp add --scope user pipethis -- node "$DIR/server.mjs"
else
  warn "claude CLI not found — add the MCP manually:"
  warn "  claude mcp add --scope user pipethis -- node \"$DIR/server.mjs\""
fi

# 4. Install the skill -------------------------------------------------------
say "installing 'pipethis' skill → ${SKILLS_DIR}/pipethis"
mkdir -p "${SKILLS_DIR}/pipethis"
sed "s#__PIPETHIS_DIR__#${DIR}#g" "$DIR/skill/pipethis/SKILL.md" > "${SKILLS_DIR}/pipethis/SKILL.md"
[ -d "${SKILLS_DIR}/paste-as-image" ] && warn "an older 'paste-as-image' skill exists; 'pipethis' supersedes it — remove it if you like."

printf '\n\033[1;32m✓ pipethis installed.\033[0m Restart Claude Code, then type:  pipethis: <your large paste>\n'
