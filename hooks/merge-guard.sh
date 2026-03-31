#!/usr/bin/env bash
# merge-guard.sh — PreToolUse hook for Bash commands.
# Blocks git commit/merge/push to protected branches when merge_policy is "pr".
# Exit codes: 0 = allow, 2 = block.

set -euo pipefail

# Read tool input from stdin (Claude Code hook protocol)
INPUT=$(cat)

# Extract the command field from the JSON input
COMMAND=$(echo "$INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/"command"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)

# If we cannot extract a command, allow (not a Bash invocation we care about)
if [ -z "$COMMAND" ]; then
  exit 0
fi

# Fast path: skip if the command does not contain git-related commit/merge/push keywords
if ! echo "$COMMAND" | grep -qiE '(git\s+(commit|merge|push|checkout)|gh\s+pr\s+merge)'; then
  exit 0
fi

# --- Load configuration from manifest.yaml ---

MANIFEST=""
# Look for manifest in common locations
for candidate in ".context-index/manifest.yaml" "../.context-index/manifest.yaml"; do
  if [ -f "$candidate" ]; then
    MANIFEST="$candidate"
    break
  fi
done

# Default values
MERGE_POLICY="pr"
PROTECTED_BRANCHES=("main" "master")

if [ -n "$MANIFEST" ]; then
  # Extract merge_policy (simple grep, no yq dependency)
  POLICY_LINE=$(grep -E '^\s*merge_policy:' "$MANIFEST" 2>/dev/null || true)
  if [ -n "$POLICY_LINE" ]; then
    EXTRACTED=$(echo "$POLICY_LINE" | sed 's/.*merge_policy:[[:space:]]*//' | sed 's/[[:space:]]*#.*//' | tr -d '"' | tr -d "'")
    if [ -n "$EXTRACTED" ]; then
      MERGE_POLICY="$EXTRACTED"
    fi
  fi

  # Extract protected_branches (simple line-by-line parse)
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
        # No longer in the list
        IN_PROTECTED=false
      fi
    fi
  done < "$MANIFEST"

  if [ ${#CUSTOM_BRANCHES[@]} -gt 0 ]; then
    PROTECTED_BRANCHES=("${CUSTOM_BRANCHES[@]}")
  fi
fi

# --- Check if command targets a protected branch ---

# --- Detect current branch (for commit guard) ---

CURRENT_BRANCH=""
if command -v git &>/dev/null; then
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)
fi

is_on_protected_branch() {
  if [ -z "$CURRENT_BRANCH" ]; then
    return 1
  fi
  for branch in "${PROTECTED_BRANCHES[@]}"; do
    if [ "$CURRENT_BRANCH" = "$branch" ]; then
      echo "$branch"
      return 0
    fi
  done
  return 1
}

targets_protected_branch() {
  local cmd="$1"

  # git commit while on a protected branch
  if echo "$cmd" | grep -qE "git\s+commit"; then
    local on_protected
    on_protected=$(is_on_protected_branch) || true
    if [ -n "$on_protected" ]; then
      echo "$on_protected"
      return 0
    fi
  fi

  for branch in "${PROTECTED_BRANCHES[@]}"; do
    # git merge <branch> or git merge ... <branch>
    if echo "$cmd" | grep -qE "git\s+merge\s+.*\b${branch}\b"; then
      echo "$branch"
      return 0
    fi
    # git push (to protected branch): origin main, origin master, etc.
    if echo "$cmd" | grep -qE "git\s+push\s+.*\b${branch}\b"; then
      echo "$branch"
      return 0
    fi
    # git checkout <branch> && git merge (switching to protected then merging)
    if echo "$cmd" | grep -qE "git\s+checkout\s+${branch}\b.*&&.*git\s+merge"; then
      echo "$branch"
      return 0
    fi
    # gh pr merge (merging a PR via CLI)
    if echo "$cmd" | grep -qE "gh\s+pr\s+merge"; then
      echo "$branch"
      return 0
    fi
  done
  return 1
}

TARGET=$(targets_protected_branch "$COMMAND") || true

if [ -z "$TARGET" ]; then
  # Command does not target a protected branch
  exit 0
fi

# --- Enforce policy ---

case "$MERGE_POLICY" in
  pr)
    echo "Blocked: merge_policy is 'pr'. Create a feature branch and open a pull request instead of committing/merging directly to ${TARGET}." >&2
    exit 2
    ;;
  merge)
    # Even with merge policy, protected branches require a PR
    echo "Blocked: ${TARGET} is a protected branch. Create a feature branch and open a PR even with merge_policy: merge." >&2
    exit 2
    ;;
  ask)
    echo "Advisory: merge_policy is 'ask'. Please confirm with the user before committing/merging to ${TARGET}." >&2
    exit 0
    ;;
  *)
    # Unknown policy, default to blocking
    echo "Blocked: unknown merge_policy '${MERGE_POLICY}'. Defaulting to 'pr'. Open a pull request." >&2
    exit 2
    ;;
esac
