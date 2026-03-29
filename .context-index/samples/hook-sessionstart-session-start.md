# Golden Sample: Session Start Hook

> **Pattern:** hook-sessionstart
> **Source:** hooks/session-start.sh
> **Quality Score:** 100/100
> **Extracted:** 2026-03-28
> **Constitution Principles:** hook-protocol-compliance, minimize-external-dependencies, skills-are-markdown

## Why This Is a Golden Sample

This hook demonstrates the SessionStart hook protocol -- a distinct pattern from PreToolUse hooks. While PreToolUse hooks decide to allow or block, SessionStart hooks inject context into the session via JSON output on stdout. This is the simplest complete hook in the project and serves as the minimal reference for the hook JSON output contract.

1. **Hook protocol compliance** (Non-Negotiable Principle #4): Outputs structured JSON to stdout with the `hookSpecificOutput` shape required by Claude Code's SessionStart event. This is the canonical output format.
2. **Skills are primarily markdown** (Non-Negotiable Principle #2): The hook reads a SKILL.md file and injects its content as `additionalContext`. It does not execute the skill content -- it passes it verbatim to Claude.
3. **Minimize external dependencies** (Non-Negotiable Principle #1): Uses `python3 -c` (available on all supported platforms) for JSON escaping rather than installing a dependency.
4. **Graceful degradation**: If the skill file is missing, the hook exits 0 silently rather than failing.

## The Code

```bash
#!/usr/bin/env bash
# adev SessionStart hook
# Injects adev awareness into every Claude Code session.
# Fires on: startup, resume, clear, compact
#
# PRINCIPLE: Hook header documents the event type and trigger conditions.

set -euo pipefail

# PRINCIPLE: No hardcoded paths to ~/.claude/ — resolve from CLAUDE_PLUGIN_ROOT
# env var, falling back to relative path resolution from the hook's location.
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
SKILL_FILE="${PLUGIN_ROOT}/skills/using-adev/SKILL.md"

# PATTERN: Graceful degradation. If the skill file does not exist,
# exit 0 with no output. The session starts normally without adev context.
if [ ! -f "$SKILL_FILE" ]; then
  exit 0
fi

# Read the skill content
SKILL_CONTENT=$(cat "$SKILL_FILE")

# PRINCIPLE: Minimize external dependencies — use python3 (universally
# available) for JSON string escaping instead of adding jq as a dependency.
SKILL_CONTENT=$(printf '%s' "$SKILL_CONTENT" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')
# Remove surrounding quotes from json.dumps output
SKILL_CONTENT="${SKILL_CONTENT:1:${#SKILL_CONTENT}-2}"

# PRINCIPLE: Hook protocol — SessionStart hooks output JSON to stdout.
# The shape is: { hookSpecificOutput: { hookEventName, additionalContext } }
cat <<JSONEOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "${SKILL_CONTENT}"
  }
}
JSONEOF
```

## Test Coverage

The test file `tests/hooks/session-start.test.mjs` verifies two behavioral contracts:

```javascript
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createTempDir, cleanupTempDir, writeFixture, runHook, PLUGIN_ROOT } from "../helpers.mjs";

describe("session-start hook", () => {
  it("outputs valid JSON with skill content", () => {
    const { exitCode, stdout } = runHook("session-start.sh", {
      env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
    });
    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.hookSpecificOutput.hookEventName, "SessionStart");
    assert.ok(parsed.hookSpecificOutput.additionalContext.length > 0);
  });

  it("exits 0 with no output when skill file is missing", () => {
    const tempDir = createTempDir();
    try {
      const { exitCode, stdout } = runHook("session-start.sh", {
        env: { CLAUDE_PLUGIN_ROOT: tempDir },
      });
      assert.equal(exitCode, 0);
      assert.equal(stdout.trim(), "");
    } finally {
      cleanupTempDir(tempDir);
    }
  });
});
```

Key testing patterns:
- Passes `CLAUDE_PLUGIN_ROOT` via env to control which skill file is loaded
- Verifies the JSON output parses correctly and has the expected shape
- Tests the degradation path (missing file) to ensure it does not crash

## Usage Guide

Reference this sample when:
- **Writing a new SessionStart hook** that injects context at session start
- **Outputting JSON from a hook** -- this shows the exact `hookSpecificOutput` shape
- **Reading skill content** from the plugin's skills directory

What to adapt:
- The specific skill file or content to inject
- The `hookEventName` value if using a different event

What to keep exactly:
- The `hookSpecificOutput` JSON shape with `hookEventName` and `additionalContext`
- The `CLAUDE_PLUGIN_ROOT` env var pattern for resolving plugin paths
- The graceful exit when expected files are missing
- The JSON escaping approach using python3
