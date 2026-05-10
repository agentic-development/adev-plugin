# Validation Report: Recover Extraction

> **Date:** 2026-04-09
> **Spec:** `.context-index/specs/features/heuristics/recover-extraction.md`
> **Plan:** `.context-index/specs/features/heuristics/recover-extraction.plan.md`
> **Overall Status:** PASS

---

## Check 1: Quality Gates — PASS
- Tests: PASS — 643 pass, 0 fail, 0 skipped (`npm test`)
- Lint / Typecheck: N/A (none configured)

## Check 1.5: Source Manifest — PASS
- Declared sha: `58d6cd8`
- Files: `skills/recover/SKILL.md`, `skills/recover/evals/extract-heuristic-harness.mjs`, `skills/recover/evals/extract-heuristic.test.mjs`, `tests/skills/recover-extraction.test.mjs`

## Check 2: Spec Compliance — PASS
All 16 acceptance criteria satisfied:
- Step 7 section at `skills/recover/SKILL.md:304-404`, placed between Step 6 (Enrich) and "## Patterns Across Multiple Recoveries"
- All 6 category templates with distillation warning
- Scope Derivation Rule, Title Derivation Rule, ID Derivation Rule, projectRoot Resolution all documented
- Inline Node invocation pattern with try/catch degradation
- Eval test exercises all 6 categories (`extract-heuristic.test.mjs`)
- Integration tests cover end-to-end (T10), recurrence auto-promotion (T11: low→medium→high at 2nd/3rd distinct paths), and distillation discipline (T12: DISTILLATION_GUARD_VIOLATION)
- `confidence: low` initial for all extractions
- Evidence `{source: 'recovery', path, date}` shape enforced
- Active distillation guard in harness rejects credential-like strings before `writeHeuristic`

## Check 3: Charter Consistency — PASS
Implementation stays within "Recover Extraction" capability. Only consumes `lib/heuristics.mjs` (does not modify it). No scope creep into other capabilities.

## Check 4: Constitution Compliance — PASS
- Principle 1 (deps): Zero external deps, `node:` prefix throughout
- Principle 2 (skills markdown): Step 7 is documented markdown; companion harness lives under `skills/recover/evals/` (test-only) and is not required for the skill to function — the inline Node invocation in SKILL.md directly imports `lib/heuristics.mjs`
- Principle 3 (pure ESM): All new files `.mjs`, named exports/imports
- camelCase functions, kebab-case files

## Check 5: ADR Compliance — N/A
Neither ADR is relevant (web-tree-sitter, typescript devDep).

## Check 6: Cross-Cutting Spec Compliance — PASS
`model-routing.md` not applicable — no AI/model dispatch in recover-extraction.

## Check 7: Specialist Review — N/A
`specialists: []` in manifest.

## Check 8: Boundary Compliance — N/A
No `.context-index/governance/` directory.

## Check 9: Transition Gates — N/A
No `governance/gates.yaml`.

## Check 10: Platform Drift — PASS
All new files match declared platform (ESM, node:test).

## Check 11: Visual Verification — N/A
No UI files touched.

---

## Overall Status: **PASS**

All 11 checks green (6 PASS, 5 N/A). Ready for PR.
