#!/usr/bin/env bash
# adev SessionEnd hook
# Gate-check: bail before spawning Node when integrations.session_capture.capture
# is not "hook" (SEC-6). Captures are observational; exit 0 always.
#
# Spec: .context-index/specs/features/session-awareness/hook-driven-capture.spec.md

set -uo pipefail

# Resolve project dir: prefer CLAUDE_PROJECT_DIR, fall back to PWD.
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
MANIFEST="$PROJECT_DIR/.context-index/manifest.yaml"

# Manifest absent → capture treated as off (fail-safe).
[ -f "$MANIFEST" ] || exit 0

# Read the `capture:` value from the integrations.session_capture block. We
# search for a `capture:` line that appears AFTER the `session_capture:` key.
# Comment lines (`#`) are filtered to avoid matching documentation examples.
CAPTURE=$(awk '
  /^[[:space:]]*session_capture:[[:space:]]*$/ { in_block=1; next }
  in_block && /^[a-zA-Z]/ { in_block=0 }
  in_block && /^[[:space:]]*capture:[[:space:]]*/ && $0 !~ /^[[:space:]]*#/ {
    sub(/^[[:space:]]*capture:[[:space:]]*/, "")
    sub(/[[:space:]]+#.*$/, "")
    gsub(/[[:space:]]/, "")
    print
    exit
  }
' "$MANIFEST" 2>/dev/null)

# Gate: only proceed when capture is exactly "hook".
[ "$CAPTURE" = "hook" ] || exit 0

# Resolve the helper script path. CLAUDE_PLUGIN_ROOT points at the installed
# plugin; in dev/test we fall back to the script's own parent dir.
HELPER="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}/lib/session-capture.mjs"

# Spawn the Node helper; pass stdin through verbatim. Discard stdout (hook
# protocol — no JSON output expected for SessionEnd). Stderr is passed through
# for diagnostics. Always exit 0 regardless of node's exit status.
node "$HELPER" --event session-end >/dev/null || true
exit 0
