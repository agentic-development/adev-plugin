#!/usr/bin/env bash
# adev PreToolUse hook: Plan-Body Write Guard
# Fires on: Write, Edit
#
# Refuses any tool call that introduces inline `**Routing:**`, `**Scores:**`,
# or `**Rationale:**` blocks into a `*.plan.md` file. These belong in the
# sibling `<plan-stem>.routing.json` sidecar written by `adev route
# emit-sidecar` — see plan-routing-sidecar.spec.md Behaviors 6-7 and the
# `lib/plan-immutability.mjs::checkInlineRoutingWithoutSidecar` detector.
#
# Exit codes:
#   0  allow
#   2  block (introduced forbidden inline annotations)

set -uo pipefail

# Read stdin and populate CLAUDE_TOOL_INPUT_* env vars
source "$(dirname "$0")/_parse-stdin.sh"

FILE_PATH="${CLAUDE_TOOL_INPUT_file_path:-}"

# Only fire on `.plan.md` writes/edits. Match by suffix (path may be absolute).
case "$FILE_PATH" in
  *.plan.md) ;;
  *) exit 0 ;;
esac

# What is being introduced?
#   Write tool → content
#   Edit tool  → new_string
NEW_CONTENT="${CLAUDE_TOOL_INPUT_content:-${CLAUDE_TOOL_INPUT_new_string:-}}"
if [ -z "$NEW_CONTENT" ]; then
  exit 0
fi

# Match the same regex as lib/plan-immutability.mjs:248.
if printf '%s' "$NEW_CONTENT" | grep -qE '\*\*Routing:\*\*|\*\*Scores:\*\*|\*\*Rationale:\*\*'; then
  cat <<'MSG' >&2
BLOCKED: refusing to write inline `**Routing:** / **Scores:** / **Rationale:**` blocks to a plan body.

Plan markdown is read-only after `/adev:plan` authored it (CON-8 in plan-task-events.spec.md). Routing decisions live in the sibling `<plan-stem>.routing.json` sidecar.

Run `adev route emit-sidecar --plan <plan-path>` with the routing entries as JSON on stdin instead. See `skills/route/SKILL.md` Step 4 for the canonical invocation.
MSG
  exit 2
fi

exit 0
