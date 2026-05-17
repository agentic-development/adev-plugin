---
date: 2026-05-17T00:00:00Z
module_filter: all
check_filter: targeted-candidates
total_findings: 0
summary:
  high: 0
  medium: 0
  low: 0
---

# Code Health Report — Targeted Candidate Verification

This report verifies three candidate findings from an earlier hygiene audit
that flagged zero inbound module imports in the regenerated repository map.
Each candidate is classified as **A) truly dead**, **B) invoked indirectly**,
or **C) public API for external consumers**.

## Verdicts

### Candidate 1: `lib/test-strategies/` module — **B (invoked indirectly)**

The 26 exported symbols have **no production `.mjs` import** from
`cli/`, `lib/cli/`, `hooks/`, or `scripts/`, but the module is **invoked
indirectly** by skill markdown that Claude executes. Evidence:

- `skills/plan/SKILL.md:437,441` — references
  `lib/test-strategies/assignment.mjs` and `lib/test-strategies/detection.mjs`
  as the priority-chain resolver Claude must call during planning.
- `skills/write-test/SKILL.md:141,154` — instructs Claude to call
  `getStrategyProfile(strategyId, profilesDir)` from
  `lib/test-strategies/profiles.mjs` and check `INTEGRATION_PATTERNS` from
  `lib/test-strategies/gaming.mjs`.
- Mirrored in `providers/codex/skills/{plan,write-test}/SKILL.md` and
  `providers/opencode/skills/{plan,write-test}/SKILL.md`.
- 8+ test files import these modules under `tests/lib/test-strategies/`,
  `tests/evals/test-strategies/`, and `tests/test-strategies/`, confirming
  live runtime contracts (not legacy code).

Per CLAUDE.md non-negotiable principle #2 ("Skills are primarily markdown"),
SKILL.md invocations are real consumers — they are how the framework wires
library code into the agent loop. Repomap's static `.mjs`-only edge analysis
cannot see this dispatch path.

### Candidate 2: `lib/governance/` module — **B (invoked indirectly)**

Same pattern as Candidate 1. The 15 exported symbols have **no production
`.mjs` import** outside tests but are invoked indirectly via SKILL.md
instructions. Evidence:

- `skills/validate/SKILL.md:114,140` — instructs Claude to call
  `loadValidateConfig(repoRoot)` from `lib/governance/validate-config.mjs`
  and `runQualityGate(check, { env, redactor, cwd })` from
  `lib/governance/quality-gate.mjs`.
- `skills/review-specs/SKILL.md:122,169,234` — instructs Claude to call
  `loadReviewConfig`, `applySeverityCap`, and `computeVerdict` from
  `lib/governance/review-config.mjs`.
- `skills/validate/checks/validate.check-4-constitution.md:7` — references
  `lib/governance/validate-config.mjs` as authoritative source.
- `docs/extensions.md:101` — documents `lib/governance/validate-config.mjs`
  as the loader the validate skill consumes.
- Mirrored in `providers/codex/skills/{validate,review-specs}/SKILL.md` and
  `providers/opencode/skills/{validate,review-specs}/SKILL.md`.
- 10+ test files import these modules under `tests/governance/`,
  `tests/integration/`, and `tests/evals/configurable-governance/`.

### Candidate 3: `cli/index.mjs` re-exports — **C (public API)**

The line `export { VERB_REGISTRY, dispatch, printVerbRegistry, stripAnsi };`
at `cli/index.mjs:1426` has **no internal consumer** (the three symbols are
used within the same file but never imported elsewhere in the repo).
However, this file is the declared **public package entry point**:

- `package.json` line 11: `"exports": { ".": "./cli/index.mjs" }`
- `package.json` line 7-8: registered as the `adev` and `adev-cli` bin.

The package is published as `@adev-org/adev-cli`, so anything in `export
{ ... }` at the entry point is part of the npm public surface. The three
symbols are **kept for external consumers** of the published library.
They could benefit from a clearer `@public` JSDoc comment, but they are not
dead.

## Summary

| Candidate | Verdict | Action |
|-----------|---------|--------|
| `lib/test-strategies/` (26 exports) | B — invoked via SKILL.md | Keep. Repomap blind spot. |
| `lib/governance/` (15 exports) | B — invoked via SKILL.md | Keep. Repomap blind spot. |
| `cli/index.mjs` re-exports (3 symbols) | C — public npm API | Keep. Consider `@public` JSDoc. |

**No truly dead code (verdict A) found among the candidates.** The 0-inbound
counts reflect a structural limitation of the static `.mjs`-only dependency
graph: it does not crawl markdown skill files or treat the package's
declared `exports` entry as a sink. Future repomap passes should consider
parsing `skills/**/SKILL.md` for `lib/**` mentions and treating
`package.json` `exports` entries as graph roots.
