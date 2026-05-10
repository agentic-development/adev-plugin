#!/usr/bin/env bash
# Shared helper: read hook stdin JSON and export CLAUDE_TOOL_INPUT_* env vars.
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
# will be set from whichever source provided them.

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
          if (typeof v === 'string') {
            // Escape single quotes for safe shell export
            const escaped = v.replace(/'/g, \"'\\\\''\" );
            console.log('export CLAUDE_TOOL_INPUT_' + k + \"='\" + escaped + \"'\");
          }
        }
      } catch {}
    });
  " 2>/dev/null)" 2>/dev/null || true
fi
