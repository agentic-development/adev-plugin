#!/usr/bin/env bash
# adev PostToolUse hook: Sync Trigger
# Fires on: Edit of .context-index/constitution.md (after successful lint)
# Triggers /adev-sync to update agent files.
# Non-blocking: failures are warnings only.

set -uo pipefail

# Only trigger on constitution.md edits
FILE_PATH="${CLAUDE_TOOL_INPUT_file_path:-}"
if [[ "$FILE_PATH" != *".context-index/constitution.md" ]]; then
  exit 0
fi

# Check if manifest exists
if [ ! -f ".context-index/manifest.yaml" ]; then
  exit 0
fi

# Notify the agent that sync is needed
cat <<JSONEOF
{
  "hookSpecificOutput": {
    "additionalContext": "[adev] Constitution was updated. Run /adev-sync to propagate changes to CLAUDE.md and other agent files, or it will be done automatically on next session start."
  }
}
JSONEOF

exit 0
