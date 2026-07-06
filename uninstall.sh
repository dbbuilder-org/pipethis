#!/usr/bin/env bash
# Remove the pipethis MCP registration and skill (leaves the clone in place).
set -euo pipefail
SKILLS_DIR="${HOME}/.claude/skills"
command -v claude >/dev/null 2>&1 && claude mcp remove --scope user pipethis >/dev/null 2>&1 || true
rm -rf "${SKILLS_DIR}/pipethis"
printf '\033[1;32m✓ pipethis uninstalled.\033[0m Restart Claude Code to drop the tools.\n'
