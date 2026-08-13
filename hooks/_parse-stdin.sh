#!/usr/bin/env bash
# Shared helper: read hook stdin JSON and export CLAUDE_TOOL_INPUT_* env vars.
# Also hosts find_context_index(), shared by every consumer hook that needs
# to walk up from cwd to the nearest .context-index/ directory.
#
# Claude Code passes tool input via CLAUDE_TOOL_INPUT_* env vars when hooks run
# inside a plugin, but via stdin JSON when hooks run from settings.json.
# This helper bridges the gap: if the env vars are already set, it drains stdin
# and returns. Otherwise it parses stdin and exports the tool_input fields.
#
# Usage (source from a hook script):
#   source "$(dirname "$0")/_parse-stdin.sh"
#
# After sourcing, CLAUDE_TOOL_INPUT_file_path, CLAUDE_TOOL_INPUT_command, etc.
# will be set from whichever source provided them, and find_context_index is
# available as a function.

# Walk up from cwd to find the nearest directory containing .context-index/
# Defined BEFORE the stdin read below so it is available to every consumer
# regardless of which branch (env-var early-return vs stdin-parse) executes.
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

# Read stdin into a variable (must happen before any other stdin read)
_HOOK_STDIN=$(cat)

# If the env vars are already populated (plugin mode), nothing to do
if [ -n "${CLAUDE_TOOL_INPUT_file_path:-}${CLAUDE_TOOL_INPUT_command:-}" ]; then
  return 0 2>/dev/null || true
fi

# Parse tool_input keys from stdin JSON using node (already a project dependency)
if [ -n "$_HOOK_STDIN" ]; then
  eval "$(echo "$_HOOK_STDIN" | node -e "
    let d = '';
    process.stdin.on('data', c => d += c);
    process.stdin.on('end', () => {
      try {
        const obj = JSON.parse(d);
        const ti = obj.tool_input || {};
        for (const [k, v] of Object.entries(ti)) {
          if (typeof v !== 'string') continue;
          // Allowlist key names before they are interpolated into an
          // 'export NAME=...' line that gets eval'd — a key containing
          // shell metacharacters would otherwise be a command-injection
          // vector (pre-existing key-injection surface, closed here).
          const validStart = /^[A-Za-z_]/.test(k);
          const validRest = !/[^A-Za-z0-9_]/.test(k);
          if (!validStart || !validRest) continue;
          // Escape single quotes for safe shell export
          const escaped = v.replace(/'/g, \"'\\\\''\" );
          console.log('export CLAUDE_TOOL_INPUT_' + k + \"='\" + escaped + \"'\");
        }
      } catch {}
    });
  " 2>/dev/null)" 2>/dev/null || true
fi
