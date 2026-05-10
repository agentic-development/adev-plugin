#!/usr/bin/env bash
# adev PostToolUse hook: Sync Trigger
# Fires on: Edit of any file (after successful tool use)
# - Constitution edits: triggers /adev:sync suggestion
# - Source-manifest-tracked files: stamps drift flag on affected specs
# Non-blocking: failures are warnings only. Always exits 0.

set -uo pipefail

# Read stdin and populate CLAUDE_TOOL_INPUT_* env vars
source "$(dirname "$0")/_parse-stdin.sh"

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

# Walk up from a directory to find the nearest adev-workspace.yaml
is_workspace_root() {
  local dir="$1"
  while true; do
    if [ -f "$dir/adev-workspace.yaml" ]; then
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

FILE_PATH="${CLAUDE_TOOL_INPUT_file_path:-}"

# --- Constitution.md sync trigger (existing behavior) ---
if [[ "$FILE_PATH" == *".context-index/constitution.md" ]]; then
  # If we're at a workspace root, skip sync suggestion
  if is_workspace_root "$(pwd)" > /dev/null 2>&1; then
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
    "additionalContext": "[adev] Constitution was updated. Run /adev:sync to propagate changes to CLAUDE.md and other agent files, or it will be done automatically on next session start."
  }
}
JSONEOF

  exit 0
fi

# --- Drift detection for all other file edits ---

# Skip if no .context-index (non-adev project)
if [ ! -d ".context-index" ]; then
  exit 0
fi

# Skip if file path is empty
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Run drift detection via Node.js (ESM)
# Always exits 0 — drift detection is advisory only
node --input-type=module <<DRIFT_EOF 2>/dev/null || true
import { resolve, relative } from 'node:path';
import { realpathSync } from 'node:fs';
import { scanForDrift, stampDrift } from '${PLUGIN_ROOT}/lib/spec-drift.mjs';

const filePath = process.env.CLAUDE_TOOL_INPUT_file_path || '';
let projectRoot;
try { projectRoot = realpathSync(process.cwd()); } catch { process.exit(0); }

// Validate file is within project root
let absFile;
try { absFile = realpathSync(resolve(filePath)); } catch { process.exit(0); }
const rel = relative(projectRoot, absFile);
if (rel.startsWith('..') || !rel) {
  process.exit(0);
}

try {
  const matches = await scanForDrift(rel, projectRoot);
  for (const match of matches) {
    await stampDrift(resolve(projectRoot, match.specPath), rel);
    const warning = {
      type: 'warning',
      message: 'Spec drift: ' + rel + ' is tracked by spec "' + match.specName + '". Consider updating the spec if behavior changed, or run /adev:hygiene to review.'
    };
    console.log(JSON.stringify(warning));
  }
} catch {
  // Never block — swallow errors
}
DRIFT_EOF

exit 0
