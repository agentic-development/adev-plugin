#!/usr/bin/env bash
# adev PreToolUse hook: Artifact Frontmatter Guard
# Fires on: Write, Edit targeting a FINAL `*.review.md` / `*.validate.md` path
#
# adev-plugin-nkz: `adev artifact commit` already enforces "first non-blank
# line must be `---`" (lib/cli/artifact.mjs::hasLeadingFrontmatter), but two
# independent bypasses reach the final path without ever going through it —
# skills/review-specs/SKILL.md writes `.review.md` directly with no
# `.tmp`+commit step, and `.validate.md` gets bypassed in practice when an
# agent hits the verb's own ARTIFACT_FRONTMATTER_NOT_FIRST error and writes
# the final path directly instead of fixing the `.tmp` and re-running. A
# PreToolUse guard on the FINAL path is the only mechanism that makes the
# bad shape unproducible regardless of which writer runs.
#
# Does NOT match `*.tmp` staging paths — those are free-form scratch space
# for the tmp+commit idiom; only the committed/final artifact shape matters.
#
# See: .context-index/specs (adev-plugin-nkz) and hooks/gaming-gate.sh for
# the sibling PreToolUse-simulate-the-edit pattern this one follows.
#
# Exit codes: 0 = allow, 2 = block.

set -uo pipefail

# Read stdin and populate CLAUDE_TOOL_INPUT_* env vars
source "$(dirname "$0")/_parse-stdin.sh"

FILE_PATH="${CLAUDE_TOOL_INPUT_file_path:-}"

# Only fire on final `.review.md` / `.validate.md` paths (never `.tmp`).
case "$FILE_PATH" in
  *.review.md|*.validate.md) ;;
  *) exit 0 ;;
esac

# See gaming-gate.sh: large field values (a whole report body) must cross to
# the spawned node process via temp files, never via its inherited env —
# execve() rejects any single argv/envp string over MAX_ARG_STRLEN.
export -n CLAUDE_TOOL_INPUT_content CLAUDE_TOOL_INPUT_old_string CLAUDE_TOOL_INPUT_new_string 2>/dev/null || true

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

# This repo's hook protocol never exposes a tool-name env var — infer
# Write vs Edit from which fields are actually SET (bash `${VAR+x}`
# presence test, true even for an empty string).
if [ -n "${CLAUDE_TOOL_INPUT_old_string+x}" ] || [ -n "${CLAUDE_TOOL_INPUT_new_string+x}" ]; then
  TOOL_KIND="Edit"
elif [ -n "${CLAUDE_TOOL_INPUT_content+x}" ]; then
  TOOL_KIND="Write"
else
  TOOL_KIND="unknown"
fi

GATE_TMPDIR=$(mktemp -d "${TMPDIR:-/tmp}/adev-frontmatter-guard.XXXXXX")
trap 'rm -rf "$GATE_TMPDIR"' EXIT

CONTENT_FILE=""
OLD_STRING_FILE=""
NEW_STRING_FILE=""

if [ -n "${CLAUDE_TOOL_INPUT_content+x}" ]; then
  CONTENT_FILE="$GATE_TMPDIR/content"
  printf '%s' "${CLAUDE_TOOL_INPUT_content:-}" > "$CONTENT_FILE"
fi
if [ -n "${CLAUDE_TOOL_INPUT_old_string+x}" ]; then
  OLD_STRING_FILE="$GATE_TMPDIR/old_string"
  printf '%s' "${CLAUDE_TOOL_INPUT_old_string:-}" > "$OLD_STRING_FILE"
fi
if [ -n "${CLAUDE_TOOL_INPUT_new_string+x}" ]; then
  NEW_STRING_FILE="$GATE_TMPDIR/new_string"
  printf '%s' "${CLAUDE_TOOL_INPUT_new_string:-}" > "$NEW_STRING_FILE"
fi

RESULT=$(ADEV_FILE_PATH="$FILE_PATH" \
  ADEV_TOOL_KIND="$TOOL_KIND" \
  ADEV_CONTENT_FILE="$CONTENT_FILE" \
  ADEV_OLD_STRING_FILE="$OLD_STRING_FILE" \
  ADEV_NEW_STRING_FILE="$NEW_STRING_FILE" \
  node "${PLUGIN_ROOT}/hooks/_artifact-frontmatter-guard-check.mjs" 2>/dev/null || echo '{"blocked":false}')

BLOCKED=$(printf '%s' "$RESULT" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(s);console.log(j.blocked?"1":"0");}catch{console.log("0");}})' 2>/dev/null || echo "0")

if [ "$BLOCKED" = "1" ]; then
  cat <<MSG >&2
BLOCKED: this write/edit would leave "$FILE_PATH" with a markdown body (heading, HTML comment, etc.) before its YAML frontmatter.

The first non-blank line of a .review.md / .validate.md artifact MUST be the '---' frontmatter delimiter. \`adev/frontmatter-present\` (severity: error) rejects anything else, and lib/specify-revise.mjs cannot parse an artifact that opens with a heading.

Write the frontmatter block first, then the heading, then the body. If you already have a correct .tmp file staged, commit it instead of writing the final path directly:
  adev artifact commit --spec <spec-path> --kind <review|validate>
MSG
  exit 2
fi

exit 0
