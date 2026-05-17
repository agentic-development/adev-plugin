#!/usr/bin/env bash
# adev Stop hook: Post-Validate Heuristic Extraction
#
# Spec: .context-index/specs/features/validation/check-set-restructure.spec.md
#       (ADDED section — migrated from validate.check-12-heuristic-extraction)
#
# Runs after /adev:validate completes (Stop event). Extracts success heuristics
# from structured verdict metadata. The hook is strictly non-blocking — any
# failure logs to stderr and exits 0 so validate's verdict is unaffected.
#
# Input scoping (SEC-1): the hook receives only structured verdict metadata
# (check IDs, outcomes, timing, counts) from stdin JSON. It must NOT read or
# re-emit quality-gate subprocess stdout/stderr.
#
# Hook protocol: writes '{}' to stdout, exit 0.

set -uo pipefail

# Read the hook protocol stdin JSON.
STDIN_JSON=$(cat)

# Resolve plugin root — required to import lib/heuristics.mjs from the helper.
# Falls back to the script's own directory if CLAUDE_PLUGIN_ROOT is unset
# (e.g., when the hook is invoked outside the standard plugin loader).
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# Dispatch the structured verdict metadata to the mjs helper. Any helper
# failure is caught by the trailing `|| true` so the Stop event is never
# blocked. The helper writes audit trail to stderr (SEC-2); we redirect
# stderr through to the host so the user sees non-blocking warnings.
# Run as a .mjs file (ESM is auto-detected from the extension); do NOT
# combine --input-type with a file path — node forbids that combination.
printf '%s' "$STDIN_JSON" | \
  CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" \
  node "$PLUGIN_ROOT/hooks/post-validate-extract-heuristics.mjs" \
  || true

# Hook protocol: '{}' on stdout, exit 0 (always non-blocking).
echo '{}'
exit 0
