#!/usr/bin/env bash
# detect-gaming.sh — Specification gaming violation scanner.
# Usage: detect-gaming.sh <test-file1> [test-file2 ...]
# Output: JSON array of violations to stdout.
# Exit 0 always (caller reads JSON). Exit 1 on internal error.

set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Usage: detect-gaming.sh <test-file1> [test-file2 ...]" >&2
  exit 1
fi

# Start JSON array
VIOLATIONS="["
FIRST=true

add_violation() {
  local type="$1" severity="$2" file="$3" line="$4" matched="$5"
  # Truncate matched to 80 chars and escape quotes
  matched=$(echo "$matched" | head -c 80 | tr '\n' ' ' | sed 's/"/\\"/g')
  if [ "$FIRST" = true ]; then
    FIRST=false
  else
    VIOLATIONS="$VIOLATIONS,"
  fi
  VIOLATIONS="$VIOLATIONS{\"type\":\"$type\",\"severity\":\"$severity\",\"file\":\"$file\",\"line\":$line,\"matched\":\"$matched\"}"
}

# Line-by-line patterns: type|severity|regex|sole(true/false)|description
LINE_PATTERNS=(
  'vacuous-matcher|blocking|\.toBeTruthy\(\)|true|toBeTruthy() as sole assertion'
  'vacuous-matcher|blocking|\.toBeDefined\(\)|true|toBeDefined() as sole assertion'
  'vacuous-matcher|blocking|\.toBeFalsy\(\)|true|toBeFalsy() as sole assertion'
  'vacuous-matcher|blocking|\.toBeUndefined\(\)|true|toBeUndefined() as sole assertion'
  'vacuous-matcher|blocking|\.toBeNull\(\)|true|toBeNull() as sole assertion'
  'vacuous-matcher|blocking|\.toBeGreaterThanOrEqual\(\s*0\s*\)|false|toBeGreaterThanOrEqual(0)'
  'vacuous-matcher|blocking|\.toBeGreaterThan\(\s*-1\s*\)|false|toBeGreaterThan(-1)'
  'conditional-skip|blocking|\.skip\(|false|.skip( skip pattern'
  'conditional-skip|blocking|\bxit\s*\(|false|xit( disabled test'
  'conditional-skip|blocking|\bxdescribe\s*\(|false|xdescribe( disabled suite'
  'conditional-skip|blocking|\.todo\s*\(|false|.todo( marked as todo'
  'vacuous-matcher|blocking|\.not\.toThrow\(\)|true|not.toThrow() as sole assertion'
  'weak-equality|advisory|\.toMatchObject\(|false|toMatchObject used where toStrictEqual may be appropriate'
)

for FILE in "$@"; do
  if [ ! -f "$FILE" ]; then
    continue
  fi

  # Count expect( occurrences in file
  EXPECT_COUNT=$(grep -c 'expect(' "$FILE" 2>/dev/null || echo "0")

  # Line-by-line patterns
  for PATTERN_DEF in "${LINE_PATTERNS[@]}"; do
    IFS='|' read -r P_TYPE P_SEVERITY P_REGEX P_SOLE P_DESC <<< "$PATTERN_DEF"

    # Skip sole-assertion patterns when expect count != 1
    if [ "$P_SOLE" = "true" ] && [ "$EXPECT_COUNT" != "1" ]; then
      continue
    fi

    # Run grep and collect matches
    MATCHES=$(grep -n -E "$P_REGEX" "$FILE" 2>/dev/null || true)
    if [ -n "$MATCHES" ]; then
      while IFS= read -r MATCH_LINE; do
        LINE_NUM=$(echo "$MATCH_LINE" | cut -d: -f1)
        MATCHED_TEXT=$(echo "$MATCH_LINE" | cut -d: -f2-)
        add_violation "$P_TYPE" "$P_SEVERITY" "$FILE" "$LINE_NUM" "$MATCHED_TEXT"
      done <<< "$MATCHES"
    fi
  done

  # Multiline patterns — try pcregrep first, fall back to grep -Pzo
  CONTENT=$(cat "$FILE" 2>/dev/null || true)
  if [ -z "$CONTENT" ]; then
    continue
  fi

  # Pattern 1: try { expect } without rethrow in catch
  ML_MATCH=""
  if command -v pcregrep &>/dev/null; then
    ML_MATCH=$(pcregrep -Mn 'try\s*\{[^}]*expect[^}]*\}\s*catch\s*[^{]*\{[^}]*\}' "$FILE" 2>/dev/null || true)
  elif grep -Pzo '' /dev/null &>/dev/null 2>&1; then
    ML_MATCH=$(grep -Pzon 'try\s*\{[^}]*expect[^}]*\}\s*catch\s*[^{]*\{[^}]*\}' "$FILE" 2>/dev/null || true)
  fi
  if [ -n "$ML_MATCH" ]; then
    ML_LINE=$(echo "$ML_MATCH" | head -1 | cut -d: -f1)
    [ -z "$ML_LINE" ] && ML_LINE=1
    add_violation "conditional-skip" "blocking" "$FILE" "$ML_LINE" "try { expect } without rethrow in catch"
  fi

  # Pattern 2: if (x) { expect } without else
  ML_MATCH=""
  if command -v pcregrep &>/dev/null; then
    ML_MATCH=$(pcregrep -Mn 'if\s*\([^)]+\)\s*\{[^}]*expect[^}]*\}(?!\s*else)' "$FILE" 2>/dev/null || true)
  elif grep -Pzo '' /dev/null &>/dev/null 2>&1; then
    ML_MATCH=$(grep -Pzon 'if\s*\([^)]+\)\s*\{[^}]*expect[^}]*\}(?!\s*else)' "$FILE" 2>/dev/null || true)
  fi
  if [ -n "$ML_MATCH" ]; then
    ML_LINE=$(echo "$ML_MATCH" | head -1 | cut -d: -f1)
    [ -z "$ML_LINE" ] && ML_LINE=1
    add_violation "conditional-skip" "blocking" "$FILE" "$ML_LINE" "if (x) { expect } without else branch"
  fi
done

VIOLATIONS="$VIOLATIONS]"
echo "$VIOLATIONS"
exit 0
