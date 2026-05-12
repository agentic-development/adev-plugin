#!/usr/bin/env bash
# adev SessionStart hook
# Injects adev awareness into every Claude Code session.
# When execution state is active/blocked, appends a resume block.
# Fires on: startup, resume, clear, compact

set -euo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
SKILL_FILE="${PLUGIN_ROOT}/skills/using-adev/SKILL.md"

# Walk up from cwd to find the nearest directory containing .context-index/
find_context_index() {
  local dir
  dir=$(pwd)
  while true; do
    if [ -d "$dir/.context-index" ]; then
      echo "$dir"
      return 0
    fi
    local parent
    parent=$(dirname "$dir")
    if [ "$parent" = "$dir" ]; then
      return 1
    fi
    dir="$parent"
  done
}

CONTEXT_ROOT=$(find_context_index 2>/dev/null || true)

# Clear context-preflight flag so each session starts fresh
if [ -n "$CONTEXT_ROOT" ]; then
  rm -f "$CONTEXT_ROOT/.context-index/.context-preflight-ok"
else
  rm -f .context-index/.context-preflight-ok
fi

if [ ! -f "$SKILL_FILE" ]; then
  exit 0
fi

# Read the skill content
SKILL_CONTENT=$(cat "$SKILL_FILE")

# Build resume block from execution state (if available).
# Delegates parsing + formatting to hooks/_execution-state.mjs (resume-block mode).
# Stderr is discarded per spec CON-4 SEC-4 — helper stack traces must not flow
# into hookSpecificOutput.additionalContext.
RESUME_BLOCK=""
RESUME_BLOCK=$(ADEV_CONTEXT_ROOT="${CONTEXT_ROOT:-}" ADEV_EXECUTION_STATE_MODE=resume-block node "$PLUGIN_ROOT/hooks/_execution-state.mjs" 2>/dev/null || true)

# Resolve persona and load directive
PERSONA_BLOCK=""
PERSONA_BLOCK=$(ADEV_PLUGIN_ROOT="$PLUGIN_ROOT" ADEV_CONTEXT_ROOT="${CONTEXT_ROOT:-}" node -e '
  const fs = require("fs");
  const path = require("path");

  try {
    const pluginRoot = process.env.ADEV_PLUGIN_ROOT || ".";
    const contextRoot = process.env.ADEV_CONTEXT_ROOT || process.cwd();
    const templatesDir = path.join(pluginRoot, "templates", "personas");

    function parseConfig(filePath) {
      try {
        const lines = fs.readFileSync(filePath, "utf-8").split("\n");
        const config = {};
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const idx = trimmed.indexOf("=");
          if (idx === -1) continue;
          config[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
        }
        return config;
      } catch { return {}; }
    }

    const localConfig = parseConfig(path.join(contextRoot, ".context-index", "user-config"));
    const globalConfig = parseConfig(path.join(pluginRoot, "user-config"));

    let persona = localConfig.persona || globalConfig.persona || "developer";

    // Validate: reject path separators
    if (/[\/\\]|\.\./.test(persona)) persona = "developer";

    // Validate: check against actual templates
    if (!fs.existsSync(templatesDir)) process.exit(0);
    const available = fs.readdirSync(templatesDir)
      .filter(f => f.endsWith(".md"))
      .map(f => f.slice(0, -3));
    if (!available.includes(persona)) persona = "developer";

    // Load directive
    const directivePath = path.join(templatesDir, persona + ".md");
    if (!fs.existsSync(directivePath)) process.exit(0);
    const directive = fs.readFileSync(directivePath, "utf-8");
    console.log(directive);
  } catch { process.exit(0); }
' 2>/dev/null || true)

# Check for adev version updates
UPDATE_BLOCK=""
UPDATE_BLOCK=$(ADEV_PLUGIN_ROOT="$PLUGIN_ROOT" ADEV_CONTEXT_ROOT="${CONTEXT_ROOT:-}" node -e '
  const fs = require("fs");
  const path = require("path");

  try {
    // Read installed plugin version
    const pluginRoot = process.env.ADEV_PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT || ".";
    const pkgPath = path.join(pluginRoot, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const pluginVersion = pkg.version;

    // Read project adev_version from manifest (use walk-up context root if available)
    const ctxRoot = process.env.ADEV_CONTEXT_ROOT || process.cwd();
    const manifestPath = path.join(ctxRoot, ".context-index", "manifest.yaml");
    const manifest = fs.readFileSync(manifestPath, "utf8");
    const vm = manifest.match(/adev_version:\s*["\x27]?([^"\x27\s]+)/);
    const projectVersion = vm ? vm[1] : null;

    if (!projectVersion) {
      // No version stamp — pre-versioning install
      console.log("**adev update available:** This project has no adev version stamp. Run `npx @adev-org/adev-cli upgrade` to upgrade to v" + pluginVersion + " (adds provenance tracking, commit-msg enforcement, and new hygiene passes).");
    } else if (projectVersion !== pluginVersion) {
      // Version mismatch
      const [pMaj, pMin] = projectVersion.split(".").map(Number);
      const [iMaj, iMin] = pluginVersion.split(".").map(Number);
      if (iMaj > pMaj || (iMaj === pMaj && iMin > pMin)) {
        console.log("**adev update available:** v" + projectVersion + " installed, v" + pluginVersion + " available. Run `npx @adev-org/adev-cli upgrade` to upgrade.");
      }
    }
  } catch {
    // No manifest or no package.json — skip silently
  }
' 2>/dev/null || true)

# Combine all blocks
BLOCKS=("$SKILL_CONTENT")
[ -n "$PERSONA_BLOCK" ] && BLOCKS+=("$PERSONA_BLOCK")
[ -n "$RESUME_BLOCK" ] && BLOCKS+=("$RESUME_BLOCK")
[ -n "$UPDATE_BLOCK" ] && BLOCKS+=("$UPDATE_BLOCK")

COMBINED=""
for block in "${BLOCKS[@]}"; do
  if [ -n "$COMBINED" ]; then
    COMBINED="${COMBINED}

${block}"
  else
    COMBINED="$block"
  fi
done

# Escape for JSON using python3
COMBINED=$(printf '%s' "$COMBINED" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')
# Remove surrounding quotes from json.dumps output
COMBINED="${COMBINED:1:${#COMBINED}-2}"

cat <<JSONEOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "${COMBINED}"
  }
}
JSONEOF
