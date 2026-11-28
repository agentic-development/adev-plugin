#!/usr/bin/env bash
set -euo pipefail

# The case drives `adev implement check-flags`, which only a rigor-ladder
# build of the CLI has. Fail the scaffold instead of grading a run against an
# older `adev` (put a shim to this checkout's cli/index.mjs first on PATH).
if ! adev implement --help 2>/dev/null | grep -q 'check-flags'; then
  echo "fixture: the adev on PATH has no 'implement check-flags'; put this plugin checkout's CLI first on PATH" >&2
  exit 1
fi

git init -q -b feat/greeting/shout
git config user.name "adev-eval"
git config user.email "adev-eval@localhost"

mkdir -p .context-index/specs/features/greeting .context-index/governance .context-index/lifecycle-state src tests

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
3. **Every behavior is tested** — `node:test` tests under `tests/`.

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

cat > .context-index/specs/features/greeting/shout.spec.md <<'EOF'
---
partial_schema: spec@1
charter: greeting
kind: library
status: review-passed
risk_level: low
revision: 1
created: 2026-11-26
updated: 2026-11-26
---

# Library Spec: Shout

## Behaviors

- **BEH-1** — `shout(name)` returns `"HELLO, <NAME>!"`, with `name` upper-cased.

## Acceptance Criteria

- [ ] BEH-1 has a passing `node:test` test under `tests/`.
- [ ] `npm test` passes.
EOF

cat > .context-index/specs/features/greeting/shout.plan.md <<'EOF'
<!-- partial_schema: plan@1 -->

# Implementation Plan: Shout

> **Methodology:** adev
> **Spec:** .context-index/specs/features/greeting/shout.spec.md (revision 1)
> **Platform:** Node.js (ESM, `.mjs`), `node:test`
> **Implementation mode:** tdd

## Task Summary

| Task | Title | Behavior |
|---|---|---|
| 1 | shout() | BEH-1 |

### Task 1: shout() [specialist: none]

**Strategy:** unit (source: detected, confidence: high)
**Files:**
- Create: `src/shout.mjs`
- Test: `tests/shout.test.mjs`

**Tests:** `tests/shout.test.mjs` — create.

Implement `shout(name)` per BEH-1.
EOF

cat > .context-index/specs/features/greeting/shout.routing.json <<'EOF'
{
  "version": 1,
  "_generated_by": "/adev:route — do not hand-edit; re-run instead.",
  "entries": [
    {
      "task_id": "1",
      "selected_agent": "auto-agent",
      "scores": { "spec_completeness": 0.9, "pattern_coverage": 0.9, "blast_radius": 0.9, "novelty": 0.9 },
      "rationale": "One new leaf function, fully specified."
    }
  ]
}
EOF

cat > .context-index/lifecycle-state/shout.jsonl <<'EOF'
{"event":"lifecycle_step","step":"plan","status":"started","ts":"2026-11-26T00:00:00.000Z"}
{"event":"step_completed","step":"plan","verdict":"PASS","ts":"2026-11-26T00:01:00.000Z"}
EOF

git add -A
git commit -q -m "seed fixture: reviewed spec, one-task plan, lite-eligible routing, no lite authorization"
