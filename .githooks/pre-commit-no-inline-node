#!/usr/bin/env bash
# pre-commit-no-inline-node.sh — Git pre-commit hook.
#
# Rejects:
#   (1) NEW inline-Node patterns added in staged skills/**/SKILL.md diffs
#       (Run inline Node.js: headings, node --input-type=module -e heredocs,
#        node -e in fenced code blocks). Diff-based per spec Behavior 3 +
#        Error Cases: hook checks only `+` lines, not pre-existing content.
#   (2) Per-H3-section "both-forms" violations — a single SKILL.md H3 section
#       in the staged blob containing BOTH an inline-Node block AND an
#       `adev <verb>` invocation. Blob-based per spec Behavior 4 (state
#       invariant on the post-commit file, not the diff).
#
# Out of scope: providers/*/skills/*/SKILL.md (provider mirrors are handled by
# a separate future charter); non-SKILL.md markdown; inline backtick prose.
#
# Exit codes:
#   0 = allow (no violations OR nothing staged we care about)
#   1 = hook crashed (NOT policy violation — distinguishable for callers)
#   2 = policy violation (commit blocked)
#
# Portable bash 3+: no mapfile, no associative arrays (macOS default is bash 3).
#
# Spec: .context-index/specs/features/cli-driver-surface/regression-prevention.spec.md

set -uo pipefail

VIOLATION_FOUND=0

# Enumerate staged .md files (filter to skills/**/SKILL.md below).
ALL_STAGED=$(git diff --cached --name-only -- '*.md' 2>/dev/null || true)

if [ -z "$ALL_STAGED" ]; then
  exit 0
fi

# Filter: skills/**/SKILL.md, excluding providers/*/skills/**.
STAGED_FILES=""
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    providers/*) continue ;;
    skills/*/SKILL.md|skills/*/*/SKILL.md|skills/*/*/*/SKILL.md)
      STAGED_FILES="$STAGED_FILES
$f"
      ;;
  esac
done <<EOF
$ALL_STAGED
EOF

# Trim leading newline.
STAGED_FILES=$(printf '%s' "$STAGED_FILES" | sed '/^$/d')

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

# ---------- Helpers ----------

# Strip inline-backtick spans so prose like "do not use `node -e`" doesn't
# false-positive. Intentionally simple: removes every `...` span on the line.
strip_backticks() {
  echo "$1" | sed 's/`[^`]*`//g'
}

# True iff `s` already contains `needle` as a newline-delimited entry.
contains_line() {
  local haystack="$1"
  local needle="$2"
  printf '%s\n' "$haystack" | grep -Fxq "$needle"
}

# ---------- Per-file scan ----------

while IFS= read -r file; do
  [ -z "$file" ] && continue

  file_violations=""
  section_violations=""

  # === Pass 1 (Behavior 3): diff-based pattern check on ADDED lines only. ===
  # -U0 strips context; we only inspect lines beginning with '+' that are not
  # the '+++ b/path' header.
  diff_output=$(git diff --cached -U0 -- "$file" 2>/dev/null || true)

  diff_in_fence=0
  while IFS= read -r line; do
    # Track fences inside the diff (added lines only, but fences themselves
    # may appear as '+```...' — strip the leading '+' for fence detection).
    case "$line" in
      '+++'*) continue ;;
      '+'*) ;;
      *) continue ;;
    esac
    content="${line#+}"

    # Fence toggle on the added line's content.
    case "$content" in
      '```'*)
        if [ "$diff_in_fence" -eq 0 ]; then
          diff_in_fence=1
        else
          diff_in_fence=0
        fi
        continue
        ;;
    esac

    stripped=$(strip_backticks "$content")

    # "Run inline Node.js:" heading (prose or H4+). Only when not inside a fence.
    if [ "$diff_in_fence" -eq 0 ] && echo "$content" | grep -qE '^(#{1,6}[[:space:]]+)?Run inline Node\.js:'; then
      v="Run inline Node.js: directive"
      if ! contains_line "$file_violations" "$v"; then
        file_violations="$file_violations
$v"
      fi
    fi

    # `node --input-type=module -e` heredoc shape — anywhere outside backticks.
    if echo "$stripped" | grep -qE 'node[[:space:]]+--input-type=module[[:space:]]+-e'; then
      v="node --input-type=module -e heredoc"
      if ! contains_line "$file_violations" "$v"; then
        file_violations="$file_violations
$v"
      fi
    fi

    # Bare `node -e` only flagged inside fenced code blocks.
    if [ "$diff_in_fence" -eq 1 ] && echo "$stripped" | grep -qE '(^|[[:space:]])node[[:space:]]+-e([[:space:]]|$)'; then
      v="node -e in fenced code block"
      if ! contains_line "$file_violations" "$v"; then
        file_violations="$file_violations
$v"
      fi
    fi
  done <<EOF
$diff_output
EOF

  # Emit pattern violations (Behavior 3).
  if [ -n "$file_violations" ]; then
    while IFS= read -r pattern; do
      [ -z "$pattern" ] && continue
      echo "[pre-commit-no-inline-node] Inline Node forbidden in SKILL.md per constitution Anti-Patterns. File: $file. Match: $pattern" >&2
      VIOLATION_FOUND=1
    done <<EOF
$file_violations
EOF
  fi

  # === Pass 2 (Behavior 4): blob-based per-H3 both-forms invariant. ===
  # Retrieve the staged blob.
  if ! blob=$(git show ":$file" 2>/dev/null); then
    echo "[pre-commit-no-inline-node] could not read staged blob: $file" >&2
    continue
  fi

  current_section=""
  section_inline=0
  section_adev=0
  in_fence=0

  while IFS= read -r line; do
    # Fence toggle.
    case "$line" in
      '```'*)
        if [ "$in_fence" -eq 0 ]; then
          in_fence=1
        else
          in_fence=0
        fi
        continue
        ;;
    esac

    if [ "$in_fence" -eq 0 ]; then
      # H3 boundary — finalize prior section, start new.
      case "$line" in
        '### '*|'###	'*)
          if [ -n "$current_section" ] && [ "$section_inline" -eq 1 ] && [ "$section_adev" -eq 1 ]; then
            if ! contains_line "$section_violations" "$current_section"; then
              section_violations="$section_violations
$current_section"
            fi
          fi
          current_section=$(echo "$line" | sed -E 's/^###[[:space:]]+//')
          section_inline=0
          section_adev=0
          continue
          ;;
      esac

      # H2 (or above) boundary — close current H3.
      case "$line" in
        '## '*|'## 	'*|'# '*)
          if [ -n "$current_section" ] && [ "$section_inline" -eq 1 ] && [ "$section_adev" -eq 1 ]; then
            if ! contains_line "$section_violations" "$current_section"; then
              section_violations="$section_violations
$current_section"
            fi
          fi
          current_section=""
          section_inline=0
          section_adev=0
          continue
          ;;
      esac

      # "Run inline Node.js:" heading (prose or H4+).
      if echo "$line" | grep -qE '^(#{1,6}[[:space:]]+)?Run inline Node\.js:'; then
        section_inline=1
      fi
    fi

    # Strip backticks for content scans.
    stripped=$(strip_backticks "$line")

    # `node --input-type=module -e` heredoc shape — anywhere outside backticks.
    if echo "$stripped" | grep -qE 'node[[:space:]]+--input-type=module[[:space:]]+-e'; then
      section_inline=1
    fi

    # Bare `node -e` only flagged inside fenced code blocks.
    if [ "$in_fence" -eq 1 ] && echo "$stripped" | grep -qE '(^|[[:space:]])node[[:space:]]+-e([[:space:]]|$)'; then
      section_inline=1
    fi

    # `adev <verb>` — track per-section. Only match inside fenced code blocks
    # (real CLI invocations), not prose mentions like "the adev plugin".
    if [ "$in_fence" -eq 1 ] && [ -n "$current_section" ] && echo "$stripped" | grep -qE '(^|[[:space:]])adev[[:space:]]+[a-z][a-z-]*'; then
      section_adev=1
    fi
  done <<EOF
$blob
EOF

  # Finalize trailing H3 section.
  if [ -n "$current_section" ] && [ "$section_inline" -eq 1 ] && [ "$section_adev" -eq 1 ]; then
    if ! contains_line "$section_violations" "$current_section"; then
      section_violations="$section_violations
$current_section"
    fi
  fi

  if [ -n "$section_violations" ]; then
    while IFS= read -r section; do
      [ -z "$section" ] && continue
      echo "[pre-commit-no-inline-node] Per-skill atomic invariant violated. File: $file. H3 section: $section. Same section has both inline-Node and adev <verb> call." >&2
      VIOLATION_FOUND=1
    done <<EOF
$section_violations
EOF
  fi
done <<EOF
$STAGED_FILES
EOF

if [ "$VIOLATION_FOUND" -eq 1 ]; then
  exit 2
fi
exit 0
