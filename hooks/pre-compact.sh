#!/usr/bin/env bash
# adev PreCompact hook
# Same gate pattern as session-end.sh (SEC-6). The SA-2 skip-if-session-end
# branch lives inside the Node helper. Always exits 0.
#
# Spec: .context-index/specs/features/session-awareness/hook-driven-capture.spec.md

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
MANIFEST="$PROJECT_DIR/.context-index/manifest.yaml"

[ -f "$MANIFEST" ] || exit 0

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

[ "$CAPTURE" = "hook" ] || exit 0

HELPER="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}/lib/session-capture.mjs"

node "$HELPER" --event pre-compact >/dev/null || true
exit 0
