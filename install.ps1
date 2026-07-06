# pipethis installer (Windows / PowerShell).
# Installs deps, registers the MCP server with Claude Code (user scope), and
# installs the `pipethis` skill. Re-runnable. Then restart Claude Code.
#   Run:  powershell -ExecutionPolicy Bypass -File .\install.ps1
$ErrorActionPreference = 'Stop'

$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SkillsDir = Join-Path $env:USERPROFILE '.claude\skills'

function Say  ($m) { Write-Host "> $m" -ForegroundColor Cyan }
function Warn ($m) { Write-Host "! $m" -ForegroundColor Yellow }

# 1. Prerequisites -----------------------------------------------------------
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Warn 'node not found — install Node.js >=18 first (https://nodejs.org).'; exit 1
}
Say "node $(node -v)"

$Pm = if (Get-Command pnpm -ErrorAction SilentlyContinue) { 'pnpm' } else { 'npm' }
Say "package manager: $Pm"

# 2. Install dependencies ----------------------------------------------------
Say 'installing dependencies...'
Push-Location $Dir
try {
  if ($Pm -eq 'pnpm' -and (Test-Path (Join-Path $Dir 'pnpm-lock.yaml'))) {
    pnpm install --frozen-lockfile
  } else {
    & $Pm install
  }
} finally { Pop-Location }

# 3. Register the MCP server (idempotent) ------------------------------------
$Server = Join-Path $Dir 'server.mjs'
if (Get-Command claude -ErrorAction SilentlyContinue) {
  Say "registering MCP server 'pipethis' (user scope)..."
  claude mcp remove --scope user pipethis   2>$null | Out-Null
  claude mcp remove --scope user px-pipe-mcp 2>$null | Out-Null   # supersede old name
  claude mcp add --scope user pipethis -- node "$Server"
} else {
  Warn 'claude CLI not found — add the MCP manually:'
  Warn "  claude mcp add --scope user pipethis -- node `"$Server`""
}

# 4. Install the skill -------------------------------------------------------
Say "installing 'pipethis' skill -> $SkillsDir\pipethis"
$SkillOut = Join-Path $SkillsDir 'pipethis'
New-Item -ItemType Directory -Force -Path $SkillOut | Out-Null
(Get-Content (Join-Path $Dir 'skill\pipethis\SKILL.md') -Raw).Replace('__PIPETHIS_DIR__', $Dir) |
  Set-Content -Path (Join-Path $SkillOut 'SKILL.md') -NoNewline
if (Test-Path (Join-Path $SkillsDir 'paste-as-image')) {
  Warn "an older 'paste-as-image' skill exists; 'pipethis' supersedes it — remove it if you like."
}

Write-Host "`n[OK] pipethis installed. Restart Claude Code, then type:  pipethis: <your large paste>" -ForegroundColor Green
