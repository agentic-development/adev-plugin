#!/usr/bin/env bash
# destructive-git-guard.sh — PreToolUse hook for Bash commands.
# Blocks git commands that discard the ENTIRE uncommitted working tree:
# `git reset --hard` (any form), `git clean` with a force flag (any form),
# and `git checkout`/`git restore` invocations whose final pathspec is the
# whole tree (`.`) rather than a named file.
#
# Regression this closes: a pipeline subagent reached for
# `git checkout HEAD -- .` mid-diagnosis and reverted 8 rounds of
# uncommitted review history along with the matching lifecycle-log events.
# None of these commands has a legitimate use inside an implement step, so
# this is a hard block rather than advisory prose in a SKILL.md.
# Exit codes: 0 = allow, 2 = block.

set -euo pipefail

INPUT=$(cat)

COMMAND=$(echo "$INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/"command"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)

if [ -z "$COMMAND" ]; then
  exit 0
fi

# Fast path: skip unless one of the four destructive verbs is present at all.
if ! echo "$COMMAND" | grep -qE 'git\s+(reset|clean|checkout|restore)\b'; then
  exit 0
fi

# --- Load completion.allow_destructive_git from manifest.yaml (default: false) ---
# Same repo-scoped lookup as merge-guard.sh: never let a parent repo's
# manifest leak into a child repo/submodule.
find_manifest() {
  local repo_root
  repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || repo_root=""

  if [ -n "$repo_root" ]; then
    if [ -f "$repo_root/.context-index/manifest.yaml" ]; then
      echo "$repo_root/.context-index/manifest.yaml"
      return 0
    fi
    return 1
  fi

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
ALLOW_DESTRUCTIVE="false"

if [ -n "$MANIFEST" ]; then
  ALLOW_LINE=$(grep -E '^\s*allow_destructive_git:' "$MANIFEST" 2>/dev/null || true)
  if [ -n "$ALLOW_LINE" ]; then
    EXTRACTED=$(echo "$ALLOW_LINE" | sed 's/.*allow_destructive_git:[[:space:]]*//' | sed 's/[[:space:]]*#.*//' | tr -d '"' | tr -d "'" | tr '[:upper:]' '[:lower:]')
    if [ "$EXTRACTED" = "true" ]; then
      ALLOW_DESTRUCTIVE="true"
    fi
  fi
fi

if [ "$ALLOW_DESTRUCTIVE" = "true" ]; then
  exit 0
fi

# --- Detection helpers ---

# `-n`/`--dry-run` always wins over a force flag: git prints what it *would*
# delete and touches nothing, so a dry-run-annotated force clean must pass.
is_forced_clean() {
  local segment="$1"
  if echo "$segment" | grep -qE '(^|[[:space:]])(-n|--dry-run)([[:space:]]|$)'; then
    return 1
  fi
  echo "$segment" | grep -qE '(^|[[:space:]])(--force|-[a-zA-Z]*f[a-zA-Z]*)([[:space:]]|$)'
}

# Distinguishes `git checkout -- path/to/file.txt` (fine) from
# `git checkout -- .` / `git checkout HEAD -- .` / `git checkout .`
# (discards everything) by looking at the final pathspec token rather than
# enumerating every ref/flag spelling that can precede it.
targets_whole_tree() {
  local segment="$1"
  local last_token
  last_token=$(echo "$segment" | awk '{print $NF}')
  [ "$last_token" = "." ]
}

# `git restore --staged .` only unstages — the working tree is untouched —
# so it is not the "discard the working tree" case this guard exists for.
# Adding `--worktree`/`-W` back in (even alongside `--staged`) does touch
# the working tree, so that combination still blocks.
is_staged_only_restore() {
  local segment="$1"
  if echo "$segment" | grep -qE '(^|[[:space:]])(--staged|-S)([[:space:]]|$)'; then
    if ! echo "$segment" | grep -qE '(^|[[:space:]])(--worktree|-W)([[:space:]]|$)'; then
      return 0
    fi
  fi
  return 1
}

REASON=""

# git reset --hard (any form) always discards the whole tree; unlike
# checkout/restore it needs no pathspec to be total.
if echo "$COMMAND" | grep -qE 'git\s+reset\s+(.*[[:space:]])?--hard([[:space:]]|$)'; then
  REASON="git reset --hard discards every uncommitted change in the working tree"
fi

if [ -z "$REASON" ]; then
  while IFS= read -r segment; do
    [ -z "$segment" ] && continue
    if is_forced_clean "$segment"; then
      REASON="git clean with a force flag deletes untracked files"
      break
    fi
  done < <(echo "$COMMAND" | grep -oE 'git\s+clean[^&;|]*' || true)
fi

if [ -z "$REASON" ]; then
  while IFS= read -r segment; do
    [ -z "$segment" ] && continue
    if targets_whole_tree "$segment"; then
      REASON="this checkout targets the whole working tree ('.'), discarding uncommitted changes"
      break
    fi
  done < <(echo "$COMMAND" | grep -oE 'git\s+checkout[^&;|]*' || true)
fi

if [ -z "$REASON" ]; then
  while IFS= read -r segment; do
    [ -z "$segment" ] && continue
    if targets_whole_tree "$segment" && ! is_staged_only_restore "$segment"; then
      REASON="this restore targets the entire working tree ('.'), discarding uncommitted changes"
      break
    fi
  done < <(echo "$COMMAND" | grep -oE 'git\s+restore[^&;|]*' || true)
fi

if [ -z "$REASON" ]; then
  exit 0
fi

echo "Blocked: ${REASON}. This can destroy uncommitted work from earlier pipeline steps (lifecycle logs, review history, in-progress edits) with no way to recover it." >&2
echo "  • Run \`git status\` first to see what is actually at stake." >&2
echo "  • Stash it instead: \`git stash push -u\` (or commit it), then retry." >&2
echo "  • If you need to discard just one file, target that path directly instead of the whole tree." >&2
exit 2
