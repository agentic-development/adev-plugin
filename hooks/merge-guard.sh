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

# Find manifest.yaml scoped to the current git repo root.
# Does NOT walk up past the git repo boundary, so a parent repo's
# manifest never applies to a child repo (e.g., submodules).
find_manifest() {
  local repo_root
  repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || repo_root=""

  if [ -n "$repo_root" ]; then
    # Inside a git repo — only check this repo's root
    if [ -f "$repo_root/.context-index/manifest.yaml" ]; then
      echo "$repo_root/.context-index/manifest.yaml"
      return 0
    fi
    return 1
  fi

  # Not inside a git repo — fall back to walk-up from cwd
  local dir
  dir=$(pwd)
  while true; do
    if [ -f "$dir/.context-index/manifest.yaml" ]; then
      echo "$dir/.context-index/manifest.yaml"
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

MANIFEST=$(find_manifest) || MANIFEST=""

# Default values
MERGE_POLICY="pr"
PROTECTED_BRANCHES=("main" "master")
# Whether an agent may complete a PR via `gh pr merge`. Default false preserves
# the long-standing behaviour: merging is where review is enforced.
ALLOW_AGENT_PR_MERGE="false"

if [ -n "$MANIFEST" ]; then
  # Extract merge_policy (simple grep, no yq dependency)
  POLICY_LINE=$(grep -E '^\s*merge_policy:' "$MANIFEST" 2>/dev/null || true)
  if [ -n "$POLICY_LINE" ]; then
    EXTRACTED=$(echo "$POLICY_LINE" | sed 's/.*merge_policy:[[:space:]]*//' | sed 's/[[:space:]]*#.*//' | tr -d '"' | tr -d "'")
    if [ -n "$EXTRACTED" ]; then
      MERGE_POLICY="$EXTRACTED"
    fi
  fi

  # Extract allow_agent_pr_merge (same grep-not-yq discipline as merge_policy).
  # Only the exact literal `true` opts in; anything else stays blocked.
  ALLOW_LINE=$(grep -E '^\s*allow_agent_pr_merge:' "$MANIFEST" 2>/dev/null || true)
  if [ -n "$ALLOW_LINE" ]; then
    ALLOW_EXTRACTED=$(echo "$ALLOW_LINE" | sed 's/.*allow_agent_pr_merge:[[:space:]]*//' | sed 's/[[:space:]]*#.*//' | tr -d '"' | tr -d "'" | tr '[:upper:]' '[:lower:]')
    if [ "$ALLOW_EXTRACTED" = "true" ]; then
      ALLOW_AGENT_PR_MERGE="true"
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

  # git merge while on a protected branch — block regardless of merge argument
  # (the merge advances the current branch; if current is protected, the merge
  # writes to a protected branch). Merging FROM a protected ref INTO a feature
  # branch (e.g. `git merge origin/main` from `feat/x`) is the routine
  # "keep-current" workflow and must be allowed.
  #
  # `\b` after "merge" is NOT sufficient: `-` is a word boundary, so it also
  # matched `git merge-base`, `git merge-tree`, and `git merge-file` — all
  # read-only plumbing that writes nothing. Blocking a query is pure friction
  # and teaches operators that the guard cries wolf. Require a space or
  # end-of-string so only the porcelain `git merge` is caught.
  if echo "$cmd" | grep -qE "git\s+merge([[:space:]]|$)"; then
    local on_protected_merge
    on_protected_merge=$(is_on_protected_branch) || true
    if [ -n "$on_protected_merge" ]; then
      echo "$on_protected_merge"
      return 0
    fi
  fi

  for branch in "${PROTECTED_BRANCHES[@]}"; do
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
  done

  # gh pr merge — completing the PR workflow the policy mandates.
  #
  # This clause used to live inside the loop above and ignored `$branch`
  # entirely, so ANY `gh pr merge` was blocked and attributed to whichever
  # protected branch happened to be first. Two consequences, both observed:
  # a PR targeting a NON-protected base (a stacked PR onto another feature
  # branch) was refused, and the error named a branch the PR did not target.
  # The advice it printed — "open a pull request instead" — is also incoherent
  # when the thing being run IS a pull-request merge.
  #
  # Default stays BLOCK, because merging is the step where review is enforced
  # and an agent should not land work unattended. But it is now a named,
  # opt-in-able policy rather than an accident of loop placement:
  # `completion.allow_agent_pr_merge: true` in manifest.yaml permits it.
  if echo "$cmd" | grep -qE "gh\s+pr\s+merge([[:space:]]|$)"; then
    if [ "$ALLOW_AGENT_PR_MERGE" = "true" ]; then
      return 1
    fi
    # Report the base the command actually names, when it names one.
    local explicit_base
    explicit_base=$(echo "$cmd" | grep -oE "\-\-base[= ]+[A-Za-z0-9._/-]+" | head -1 | sed 's/.*[= ]//') || true
    if [ -n "$explicit_base" ]; then
      echo "$explicit_base"
    else
      echo "${PROTECTED_BRANCHES[0]}"
    fi
    return 0
  fi

  return 1
}

TARGET=$(targets_protected_branch "$COMMAND") || true

if [ -z "$TARGET" ]; then
  # Command does not target a protected branch
  exit 0
fi

# --- Enforce policy ---

# `gh pr merge` needs its own message: telling someone to "open a pull request
# instead" when they are merging a pull request is advice they cannot act on,
# and it hides the actual knob.
IS_PR_MERGE=false
if echo "$COMMAND" | grep -qE "gh\s+pr\s+merge([[:space:]]|$)"; then
  IS_PR_MERGE=true
fi

case "$MERGE_POLICY" in
  pr)
    if $IS_PR_MERGE; then
      echo "Blocked: agent-initiated PR merges are off by default (merge_policy: 'pr'). Target: ${TARGET}. The PR itself is fine — completing it is the gated step, because merging is where review is enforced." >&2
      echo "  • A human can run the same command." >&2
      echo "  • To let agents merge in this project, set completion.allow_agent_pr_merge: true in .context-index/manifest.yaml." >&2
      exit 2
    fi
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
