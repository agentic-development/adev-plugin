#!/usr/bin/env bash
# adev PreToolUse hook: Constitution Linter
# Fires on: Edit of .context-index/constitution.md
# Validates structure, size, and pointer integrity.
# Exit code 2 = block the edit. Exit code 0 = allow.

set -uo pipefail

# Only trigger on constitution.md edits
FILE_PATH="${CLAUDE_TOOL_INPUT_file_path:-}"
if [[ "$FILE_PATH" != *".context-index/constitution.md" ]]; then
  exit 0
fi

CONSTITUTION="$FILE_PATH"
ERRORS=()

# Check if file exists (it might be a new file being created)
if [ ! -f "$CONSTITUTION" ]; then
  exit 0
fi

# 1. Check line count
MAX_LINES=200
if [ -f ".context-index/manifest.yaml" ]; then
  MANIFEST_MAX=$(grep -oP 'max_constitution_lines:\s*\K\d+' .context-index/manifest.yaml 2>/dev/null || echo "")
  if [ -n "$MANIFEST_MAX" ]; then
    MAX_LINES="$MANIFEST_MAX"
  fi
fi

LINE_COUNT=$(wc -l < "$CONSTITUTION" | tr -d ' ')
if [ "$LINE_COUNT" -gt "$MAX_LINES" ]; then
  ERRORS+=("Constitution is ${LINE_COUNT} lines (max: ${MAX_LINES}). Move detailed content to specs/cross-cutting/ or orientation/.")
fi

# 2. Check required sections
REQUIRED_SECTIONS=("## Identity" "## Non-Negotiable Principles" "## Coding Standards" "## Architecture Boundaries" "## Context Routing" "## Quality Gates")
for SECTION in "${REQUIRED_SECTIONS[@]}"; do
  if ! grep -q "^${SECTION}" "$CONSTITUTION" 2>/dev/null; then
    ERRORS+=("Missing required section: ${SECTION}")
  fi
done

# 3. Check context routing pointers resolve to real files
if grep -q "## Context Routing" "$CONSTITUTION" 2>/dev/null; then
  # Extract file paths from backticks in the Context Routing section
  ROUTING_SECTION=$(sed -n '/^## Context Routing/,/^## /p' "$CONSTITUTION" | head -n -1)
  PATHS=$(echo "$ROUTING_SECTION" | grep -oP '`([^`]+\.(md|yaml|yml))`' | tr -d '`' || true)
  for P in $PATHS; do
    if [ ! -f "$P" ] && [ ! -d "$P" ]; then
      ERRORS+=("Context routing references '${P}' but it does not exist.")
    fi
  done
fi

# Report errors
if [ ${#ERRORS[@]} -gt 0 ]; then
  echo "BLOCKED: Constitution validation failed:" >&2
  for ERR in "${ERRORS[@]}"; do
    echo "  - ${ERR}" >&2
  done
  echo "" >&2
  echo "Fix these issues and retry the edit." >&2
  exit 2
fi

exit 0
