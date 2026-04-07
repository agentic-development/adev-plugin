#!/usr/bin/env bash
# adev PostToolUse hook: Issue Reminder
# Surfaces active issues every N tool calls and after git commits.
# When no in-progress issues exist, shows an idle nudge.
# Fires on: any tool use (broad matcher)

set -uo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
STDIN_JSON=$(cat)

printf '%s' "$STDIN_JSON" | node "$PLUGIN_ROOT/hooks/issue-reminder.mjs" 2>/dev/null || echo '{}'
