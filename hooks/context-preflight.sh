#!/usr/bin/env bash
# adev PreToolUse hook: Context Preflight
# Fires on: Edit
# Warns when source code is edited without prior context reading.
# Uses a flag file (.context-index/.context-preflight-ok) set by context-read-tracker.sh.
# Exit code 0 = allow (always). Advisory warning via additionalContext when no context read.

set -uo pipefail

# Read stdin (hook protocol)
cat > /dev/null

FILE_PATH="${CLAUDE_TOOL_INPUT_file_path:-}"

# No file path — nothing to check
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Fast-path: skip check for non-source files
case "$FILE_PATH" in
  # Context index files (editing context itself)
  *.context-index/*|*/.context-index/*)
    exit 0
    ;;
  # Test files
  *.test.*|*.spec.*|*__tests__/*)
    exit 0
    ;;
  # Config files
  package.json|package-lock.json|tsconfig*|*.config.*|.eslintrc*|.prettierrc*|.gitignore)
    exit 0
    ;;
  # Markdown files
  *.md)
    exit 0
    ;;
  # Node modules, git internals
  node_modules/*|.git/*)
    exit 0
    ;;
  # Plugin metadata
  *.claude-plugin/*|*/.claude-plugin/*)
    exit 0
    ;;
esac

# Check if context was read this session
if [ -f ".context-index/.context-preflight-ok" ]; then
  exit 0
fi

# No context read — emit advisory warning
WARNING="Context-First Reminder: You are editing source code without having read project context (.context-index/).
Before proceeding: invoke /adev:debug (bug fix) or /adev:implement (feature work).
For quick fixes, at minimum read the relevant spec at .context-index/specs/features/.
If this is a trivial change (typo, formatting), you may proceed."

# Escape for JSON
WARNING_JSON=$(printf '%s' "$WARNING" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf '"%s"' "$WARNING")
# Remove surrounding quotes
WARNING_JSON="${WARNING_JSON:1:${#WARNING_JSON}-2}"

cat <<JSONEOF
{
  "hookSpecificOutput": {
    "additionalContext": "${WARNING_JSON}"
  }
}
JSONEOF

exit 0
