#!/usr/bin/env bash
# adev PostToolUse hook: Session Capture
# Appends a JSONL tracking line to .context-index/.session-tracking.jsonl
# when the manifest provider is "native".
# Fires on: any tool use (broad matcher)

set -uo pipefail

# Read stdin JSON (hook protocol)
STDIN_JSON=$(cat)

# Determine provider: check stdin JSON first, then fall back to manifest.yaml
PROVIDER=""
if [ -n "$STDIN_JSON" ]; then
  # Try to extract provider from stdin JSON using node (no external deps)
  PROVIDER=$(printf '%s' "$STDIN_JSON" | node -e '
    let d = "";
    process.stdin.on("data", c => d += c);
    process.stdin.on("end", () => {
      try {
        const j = JSON.parse(d);
        console.log(j.provider || "");
      } catch { console.log(""); }
    });
  ' 2>/dev/null || echo "")
fi

if [ -z "$PROVIDER" ] && [ -f ".context-index/manifest.yaml" ]; then
  # Simple grep for provider line in manifest
  PROVIDER=$(grep -m1 'provider:' .context-index/manifest.yaml 2>/dev/null | sed 's/^.*provider:[[:space:]]*//' | tr -d '[:space:]' || echo "")
fi

# Only track when provider is native
if [ "$PROVIDER" != "native" ]; then
  echo '{}'
  exit 0
fi

# Extract tool name from env vars
TOOL_NAME="${CLAUDE_TOOL_USE_NAME:-unknown}"

# Extract file path from env var (if available)
FILE_PATH="${CLAUDE_TOOL_INPUT_file_path:-}"

# Build files array
if [ -n "$FILE_PATH" ]; then
  FILES_JSON=$(printf '%s' "$FILE_PATH" | node -e '
    let d = "";
    process.stdin.on("data", c => d += c);
    process.stdin.on("end", () => console.log(JSON.stringify([d.trim()])));
  ' 2>/dev/null || echo '[]')
else
  FILES_JSON="[]"
fi

# ISO timestamp
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Build JSONL line
JSONL_LINE=$(node -e "
  console.log(JSON.stringify({
    tool: $(printf '%s' "$TOOL_NAME" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>console.log(JSON.stringify(d.trim())))'),
    files: ${FILES_JSON},
    specs: [],
    timestamp: \"${TIMESTAMP}\"
  }));
" 2>/dev/null)

if [ -z "$JSONL_LINE" ]; then
  echo '{}'
  exit 0
fi

# Ensure directory exists
mkdir -p .context-index

# Append to tracking file
echo "$JSONL_LINE" >> .context-index/.session-tracking.jsonl

# Output empty JSON (hook protocol)
echo '{}'
exit 0
