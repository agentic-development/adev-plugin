#!/usr/bin/env bash
# adev PostToolUse hook: Session Capture
# Appends a JSONL tracking line to .context-index/.session-tracking.jsonl
# when the manifest provider is "native".
# Fires on: any tool use (broad matcher)

set -uo pipefail

# Read stdin JSON (hook protocol — contains tool_name, tool_input, session_id)
STDIN_JSON=$(cat)

# Single node call: parse stdin, resolve provider, build JSONL line, append to file.
# Exits with code 0 always (non-blocking). Outputs '{}' to stdout (hook protocol).
printf '%s' "$STDIN_JSON" | node -e '
  const fs = require("fs");
  const path = require("path");

  let d = "";
  process.stdin.on("data", c => d += c);
  process.stdin.on("end", () => {
    let input = {};
    try { input = JSON.parse(d); } catch {}

    // Resolve provider: prefer stdin, fall back to manifest.yaml
    let provider = input.provider || "";
    if (!provider) {
      try {
        const manifest = fs.readFileSync(".context-index/manifest.yaml", "utf8");
        const m = manifest.match(/provider:\s*(\S+)/);
        if (m) provider = m[1];
      } catch {}
    }

    if (provider !== "native") {
      process.stdout.write("{}\n");
      return;
    }

    // Extract fields from stdin JSON (PostToolUse protocol)
    const toolName = input.tool_name || "";
    if (!toolName) {
      process.stdout.write("{}\n");
      return;
    }
    const filePath = (input.tool_input && input.tool_input.file_path) || "";
    const sessionId = input.session_id || "";

    const entry = {
      tool: toolName,
      files: filePath ? [filePath] : [],
      timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
    };
    if (sessionId) entry.session_id = sessionId;

    // Ensure directory and append
    const dir = ".context-index";
    const file = path.join(dir, ".session-tracking.jsonl");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(file, JSON.stringify(entry) + "\n");

    process.stdout.write("{}\n");
  });
' 2>/dev/null || echo '{}'
