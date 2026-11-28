#!/usr/bin/env bash
set -euo pipefail

# Step 8c drives `adev init prompt implement-rigor`, which only a rigor-ladder
# build of the CLI has (the same build that added `implement check-flags`).
# Fail the scaffold instead of grading a run against an older `adev` (put a
# shim to this checkout's cli/index.mjs first on PATH).
if ! adev implement --help 2>/dev/null | grep -q 'check-flags'; then
  echo "fixture: the adev on PATH has no 'implement check-flags'; put this plugin checkout's CLI first on PATH" >&2
  exit 1
fi

git init -q -b main
git config user.name "adev-eval"
git config user.email "adev-eval@localhost"

mkdir -p .context-index/governance src

cat > package.json <<'EOF'
{
  "name": "greeting-fixture",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
EOF

cat > .context-index/manifest.yaml <<'EOF'
project:
  name: greeting-fixture
  type: library

risk_tier: standard

sync:
  - CLAUDE.md

implementation_mode: tdd

lifecycle:
  gate_mode: strict
EOF

cat > .context-index/constitution.md <<'EOF'
# Constitution

## Project Identity

- **Name**: greeting-fixture
- **Type**: Node.js library

## Non-Negotiable Principles

1. **Pure ESM** — all `.mjs` files, `"type": "module"` in package.json.
2. **Node.js built-ins only** — no dependencies.

## Quality Gates

```bash
npm test
```
EOF

cat > .context-index/governance/risk-policies.yaml <<'EOF'
policies:
  high:
    require_review: true
    require_hitl_approval: true
    review_mode: full
    validate_mode: full
    implement_mode: quick
    test_depth: thorough
    additional_gates: []
  medium:
    require_review: true
    require_hitl_approval: false
    review_mode: full
    validate_mode: full
    implement_mode: quick
    test_depth: standard
    additional_gates: []
  low:
    require_review: true
    require_hitl_approval: false
    review_mode: quick
    validate_mode: quick
    implement_mode: quick
    test_depth: minimal
    additional_gates: []
EOF

cat > src/greet.mjs <<'EOF'
export function greet(name) {
  return "Hello, " + name;
}
EOF

git add -A
git commit -q -m "seed fixture: initialized adev project, standard preset, implement_mode quick"
