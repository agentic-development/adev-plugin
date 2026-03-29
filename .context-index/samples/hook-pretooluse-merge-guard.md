# Golden Sample: Merge Guard Hook

> **Pattern:** hook-pretooluse
> **Source:** hooks/merge-guard.sh
> **Quality Score:** 100/100
> **Extracted:** 2026-03-28
> **Constitution Principles:** hook-protocol-compliance, minimize-external-dependencies, architecture-boundaries

## Why This Is a Golden Sample

This is the most comprehensive hook in the project and demonstrates every aspect of the hook protocol defined in the constitution:

1. **Hook protocol compliance** (Non-Negotiable Principle #4): Reads JSON from stdin, uses exit codes 0 (allow) and 2 (block), and outputs diagnostic messages to stderr. This is the canonical pattern for how hooks communicate with Claude Code.
2. **Minimize external dependencies** (Non-Negotiable Principle #1): Parses JSON and YAML using only bash built-ins and standard POSIX tools (grep, sed). No `jq`, no `yq`. This is intentional -- the project avoids runtime dependencies.
3. **Architecture boundaries**: Enforces the `merge_policy` and `protected_branches` settings from `manifest.yaml`, demonstrating how hooks read project configuration without hardcoding values.
4. **Defensive design**: Fast-path exit for non-matching commands, graceful handling of missing config files, and fallback defaults when configuration is absent.

## The Code

```bash
#!/usr/bin/env bash
# merge-guard.sh — PreToolUse hook for Bash commands.
# Blocks git merge/push to protected branches when merge_policy is "pr".
# Exit codes: 0 = allow, 2 = block.
#
# PRINCIPLE: Hook protocol compliance — the header comment documents the
# contract (which event, what it does, what exit codes mean). Every hook
# in this project follows this documentation pattern.

set -euo pipefail

# PRINCIPLE: Hook protocol — read JSON from stdin. This is the standard
# way Claude Code passes tool input to PreToolUse hooks.
INPUT=$(cat)

# PRINCIPLE: Minimize external dependencies — extract JSON fields with
# grep+sed instead of requiring jq. This keeps the plugin zero-dependency.
COMMAND=$(echo "$INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/"command"[[:space:]]*:[[:space:]]*"//;s/"$//')

# PATTERN: Early exit for irrelevant inputs. If the command field is empty
# or does not contain git-related keywords, exit 0 immediately. This keeps
# the hook fast for the common case (most commands are not git operations).
if [ -z "$COMMAND" ]; then
  exit 0
fi

if ! echo "$COMMAND" | grep -qiE '(git\s+(merge|push|checkout)|gh\s+pr\s+merge)'; then
  exit 0
fi

# --- Load configuration from manifest.yaml ---
# PRINCIPLE: No hardcoded paths to ~/.claude/ — the hook reads project-local
# configuration from .context-index/manifest.yaml.

MANIFEST=""
for candidate in ".context-index/manifest.yaml" "../.context-index/manifest.yaml"; do
  if [ -f "$candidate" ]; then
    MANIFEST="$candidate"
    break
  fi
done

# PATTERN: Sensible defaults. If no manifest exists, use the project's
# default policy (pr) and default protected branches (main, master).
MERGE_POLICY="pr"
PROTECTED_BRANCHES=("main" "master")

if [ -n "$MANIFEST" ]; then
  # PRINCIPLE: Minimize external dependencies — parse YAML with sed/grep.
  POLICY_LINE=$(grep -E '^\s*merge_policy:' "$MANIFEST" 2>/dev/null || true)
  if [ -n "$POLICY_LINE" ]; then
    EXTRACTED=$(echo "$POLICY_LINE" | sed 's/.*merge_policy:[[:space:]]*//' | sed 's/[[:space:]]*#.*//' | tr -d '"' | tr -d "'")
    if [ -n "$EXTRACTED" ]; then
      MERGE_POLICY="$EXTRACTED"
    fi
  fi

  # Parse the YAML list of protected_branches line by line.
  IN_PROTECTED=false
  CUSTOM_BRANCHES=()
  while IFS= read -r line; do
    if echo "$line" | grep -qE '^\s*protected_branches:'; then
      IN_PROTECTED=true
      continue
    fi
    if $IN_PROTECTED; then
      if echo "$line" | grep -qE '^\s*-\s+'; then
        BRANCH=$(echo "$line" | sed 's/.*-[[:space:]]*//' | tr -d '"' | tr -d "'" | sed 's/[[:space:]]*#.*//')
        if [ -n "$BRANCH" ]; then
          CUSTOM_BRANCHES+=("$BRANCH")
        fi
      else
        IN_PROTECTED=false
      fi
    fi
  done < "$MANIFEST"

  if [ ${#CUSTOM_BRANCHES[@]} -gt 0 ]; then
    PROTECTED_BRANCHES=("${CUSTOM_BRANCHES[@]}")
  fi
fi

# --- Check if command targets a protected branch ---

targets_protected_branch() {
  local cmd="$1"
  for branch in "${PROTECTED_BRANCHES[@]}"; do
    if echo "$cmd" | grep -qE "git\s+merge\s+.*\b${branch}\b"; then
      echo "$branch"
      return 0
    fi
    if echo "$cmd" | grep -qE "git\s+push\s+.*\b${branch}\b"; then
      echo "$branch"
      return 0
    fi
    if echo "$cmd" | grep -qE "git\s+checkout\s+${branch}\b.*&&.*git\s+merge"; then
      echo "$branch"
      return 0
    fi
    if echo "$cmd" | grep -qE "gh\s+pr\s+merge"; then
      echo "$branch"
      return 0
    fi
  done
  return 1
}

TARGET=$(targets_protected_branch "$COMMAND") || true

if [ -z "$TARGET" ]; then
  exit 0  # Not targeting a protected branch — allow
fi

# --- Enforce policy ---
# PRINCIPLE: Hook protocol — exit 2 to block, exit 0 to allow.
# Diagnostic messages go to stderr (not stdout).

case "$MERGE_POLICY" in
  pr)
    echo "Blocked: merge_policy is 'pr'. Open a pull request instead of merging directly to ${TARGET}." >&2
    exit 2
    ;;
  merge)
    echo "Blocked: ${TARGET} is a protected branch. Open a PR even with merge_policy: merge." >&2
    exit 2
    ;;
  ask)
    echo "Advisory: merge_policy is 'ask'. Please confirm with the user before merging to ${TARGET}." >&2
    exit 0
    ;;
  *)
    echo "Blocked: unknown merge_policy '${MERGE_POLICY}'. Defaulting to 'pr'. Open a pull request." >&2
    exit 2
    ;;
esac
```

## Test Coverage

The test file `tests/hooks/merge-guard.test.mjs` contains 8 test cases that verify behavioral contracts rather than implementation details:

```javascript
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createTempDir, cleanupTempDir, writeFixture, runHook } from "../helpers.mjs";

describe("merge-guard hook", () => {
  let tempDir;
  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => { cleanupTempDir(tempDir); });

  function commandInput(cmd) {
    return JSON.stringify({ command: cmd });
  }

  // Tests verify the hook's BEHAVIOR not its implementation:
  // - Non-git commands are allowed (exit 0)
  // - git merge/push to main are blocked (exit 2)
  // - gh pr merge is blocked
  // - Feature branch merges are allowed
  // - "ask" policy allows with advisory
  // - "merge" policy still blocks protected branches
  // - Custom protected_branches from manifest are respected
  // - Compound commands (checkout && merge) are caught

  it("blocks git merge to main (default policy)", () => {
    const { exitCode, stderr } = runHook("merge-guard.sh", {
      cwd: tempDir,
      stdin: commandInput("git merge main"),
    });
    assert.equal(exitCode, 2);
    assert.ok(stderr.includes("main"));
  });

  it("respects custom protected_branches", () => {
    writeFixture(tempDir, ".context-index/manifest.yaml",
      "merge_policy: pr\nprotected_branches:\n  - production\n  - staging\n"
    );
    const blockResult = runHook("merge-guard.sh", {
      cwd: tempDir,
      stdin: commandInput("git push origin production"),
    });
    assert.equal(blockResult.exitCode, 2);

    const allowResult = runHook("merge-guard.sh", {
      cwd: tempDir,
      stdin: commandInput("git push origin main"),
    });
    assert.equal(allowResult.exitCode, 0);
  });
});
```

Key testing patterns demonstrated:
- Uses `node:test` built-in runner (no external test framework)
- Uses `runHook()` from `tests/helpers.mjs` to execute hooks in isolation
- Creates temp directories per test for filesystem isolation
- Tests use `writeFixture()` to set up configuration files
- Assertions check exit codes (the hook protocol contract) and stderr messages

## Usage Guide

Reference this sample when:
- **Writing a new PreToolUse hook** that needs to inspect tool input and conditionally block operations
- **Parsing JSON from stdin** in a bash hook without external dependencies
- **Reading manifest.yaml configuration** from a hook script
- **Implementing exit code logic** (0 = allow, 2 = block) per the hook protocol

What to adapt:
- The specific command patterns to match (git merge/push vs. whatever your hook targets)
- The configuration keys read from manifest.yaml
- The policy enforcement logic

What to keep exactly:
- The `INPUT=$(cat)` + grep/sed JSON extraction pattern
- The `set -euo pipefail` header
- The exit code contract (0 and 2 only)
- The fast-path early exits for irrelevant inputs
- The diagnostic messages going to stderr (`>&2`), not stdout
