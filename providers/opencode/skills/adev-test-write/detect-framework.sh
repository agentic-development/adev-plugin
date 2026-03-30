#!/usr/bin/env bash
# detect-framework.sh — Detect the test framework for a project.
# Usage: detect-framework.sh [project-root]
# Output: JSON to stdout: {"framework":"...","command":"...","filePattern":"..."}
# Exit 1 if no framework detected.

set -euo pipefail

PROJECT_ROOT="${1:-.}"

# --- Pass 1: package.json dependency scan ---
PKG_FILE="$PROJECT_ROOT/package.json"
if [ -f "$PKG_FILE" ] && command -v jq &>/dev/null; then
  ALL_DEPS=$(jq -r '(.dependencies // {}) + (.devDependencies // {}) | keys[]' "$PKG_FILE" 2>/dev/null || true)

  for fw in vitest jest mocha jasmine; do
    if echo "$ALL_DEPS" | grep -qx "$fw"; then
      case "$fw" in
        vitest)  echo '{"framework":"vitest","command":"npx vitest run","filePattern":"*.test.ts, *.spec.ts"}' ;;
        jest)    echo '{"framework":"jest","command":"npx jest","filePattern":"*.test.js, *.spec.js"}' ;;
        mocha)   echo '{"framework":"mocha","command":"npx mocha","filePattern":"*.test.js, test/*.js"}' ;;
        jasmine) echo '{"framework":"jasmine","command":"npx jasmine","filePattern":"*spec.js, *Spec.js"}' ;;
      esac
      exit 0
    fi
  done

  # node:test fallback: Node >= 18 and package.json has dependencies or devDependencies key
  HAS_DEP_KEYS=$(jq 'has("dependencies") or has("devDependencies")' "$PKG_FILE" 2>/dev/null || echo "false")
  if [ "$HAS_DEP_KEYS" = "true" ] && command -v node &>/dev/null; then
    NODE_MAJOR=$(node --version | sed 's/^v//' | cut -d. -f1)
    if [ "$NODE_MAJOR" -ge 18 ] 2>/dev/null; then
      echo '{"framework":"node:test","command":"node --test","filePattern":"*.test.mjs, *.test.js"}'
      exit 0
    fi
  fi
fi

# --- Pass 2: Language marker files ---
if [ -f "$PROJECT_ROOT/go.mod" ]; then
  echo '{"framework":"go test","command":"go test ./...","filePattern":"*_test.go"}'
  exit 0
fi
if [ -f "$PROJECT_ROOT/Cargo.toml" ]; then
  echo '{"framework":"cargo test","command":"cargo test","filePattern":"*_test.rs, tests/*.rs"}'
  exit 0
fi
if [ -f "$PROJECT_ROOT/pyproject.toml" ] || [ -f "$PROJECT_ROOT/setup.py" ]; then
  echo '{"framework":"pytest","command":"pytest","filePattern":"test_*.py, *_test.py"}'
  exit 0
fi

# --- Pass 3: Test file content scan ---
TEST_FILES=$(find "$PROJECT_ROOT" -maxdepth 6 \
  \( -name 'node_modules' -o -name '.*' \) -prune -o \
  \( -name '*.test.*' -o -name '*.spec.*' -o -name '*_test.*' -o -name 'test_*.py' \) \
  -type f -print 2>/dev/null | head -50)

if [ -n "$TEST_FILES" ]; then
  while IFS= read -r tf; do
    HEADER=$(head -c 4096 "$tf" 2>/dev/null || true)

    if echo "$HEADER" | grep -qE "['\"](vitest)['\"]"; then
      echo '{"framework":"vitest","command":"npx vitest run","filePattern":"*.test.ts, *.spec.ts"}'
      exit 0
    fi
    if echo "$HEADER" | grep -qE "['\"](jest|@jest/globals)['\"]|require\(['\"]jest['\"]\)"; then
      echo '{"framework":"jest","command":"npx jest","filePattern":"*.test.js, *.spec.js"}'
      exit 0
    fi
    if echo "$HEADER" | grep -qE "['\"]mocha['\"]"; then
      echo '{"framework":"mocha","command":"npx mocha","filePattern":"*.test.js, test/*.js"}'
      exit 0
    fi
    if echo "$HEADER" | grep -qE "['\"]jasmine['\"]"; then
      echo '{"framework":"jasmine","command":"npx jasmine","filePattern":"*spec.js, *Spec.js"}'
      exit 0
    fi
  done <<< "$TEST_FILES"
fi

echo "FRAMEWORK_NOT_DETECTED" >&2
exit 1
