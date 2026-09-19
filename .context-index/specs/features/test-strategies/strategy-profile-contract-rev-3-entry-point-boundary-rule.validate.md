---
spec: .context-index/specs/features/test-strategies/strategy-profile-contract-rev-3-entry-point-boundary-rule.spec.md
plan: .context-index/specs/features/test-strategies/strategy-profile-contract-rev-3-entry-point-boundary-rule.plan.md
kind: validate
date: 2026-09-11
overall-status: PASS
rigor-tier: quick
---

# Validation Report: Amendment: Spec: Strategy Profile Contract (targeting rev 3)

> **Date:** 2026-09-11
> **Spec:** .context-index/specs/features/test-strategies/strategy-profile-contract-rev-3-entry-point-boundary-rule.spec.md
> **Plan:** .context-index/specs/features/test-strategies/strategy-profile-contract-rev-3-entry-point-boundary-rule.plan.md
> **Rigor Tier:** quick (explicit `--tier quick`)
> **Overall Status:** PASS

---

## Retry Note

This is a retry of a prior FAILED run (see git history for the previous
`.validate.md`). The prior FAIL was caused by `tests/skills/plan-task-immutability.test.mjs`
flagging this spec's own `.plan.md` as mutated after its `plan_task` pending
events — the plan file was untracked in git with a copy-refreshed mtime, a
false positive. That was fixed by commit `53c7d526` (spec/plan/review/routing.json/
lifecycle-jsonl artifacts committed to git in this worktree). Verified independently
in this run: `node --test tests/skills/plan-task-immutability.test.mjs` → 10/10 pass,
and the "real repo has no violations" case specifically passes.

## Check 1: Quality Gates — PASS

Resolved fast-tier gates (from `adev domain load-gates`, software domain, project-materialized
`governance/gates.yaml`): `test` (npm test), `quality-gate` (npm test) — both `severity: error`.
Integration tier: `integration-test` (npm run test:evals, `severity: warning`).

- `test` (npm test): **PASS**. 8052 tests, 8050 pass, 0 fail, 2 todo (pre-existing, unrelated).
  Duration 35.5s.
- `quality-gate` (npm test): **PASS**. Same command, re-run independently for its own gate
  attestation — 8052 tests, 8050 pass, 0 fail. Duration 36.9s.
- Integration tier (`integration-test`, npm run test:evals): **FAIL (severity: warning — non-blocking)**.
  402 tests, 390 pass, 12 fail. All 12 failures are pre-existing environmental issues unrelated
  to this spec's changes: PostgreSQL is not running on port 5433 in this worktree
  (`tests/evals/integration-sandbox/reality-check.test.mjs` and related fixture-setup tests
  fail with "PostgreSQL IS running on port 5433" / connection-error assertions). Since this
  gate's severity is `warning`, it does not block Check 1's overall PASS or the fail-fast chain.

**Gate outcomes recorded** via `adev report --type validator --gate-outcomes`: `test: pass`,
`quality-gate: pass`, `integration-test: fail` (tier: integration, severity: warning).

No error-severity gate failed, so Checks 2 and 4 (synthesized) proceeded.

## Check 1.5: Source Manifest Verification — SKIP

Skipped — quick rigor tier. (For reference: `adev source-manifest verify` independently
confirms `SKIP — no source manifest found` — this spec's frontmatter carries no
`source-manifest` block; it has not yet been stamped by `/adev:implement`.)

## Check 1.6: Code-Side Drift Warning — SKIP

Skipped — quick rigor tier.

## Synthesized Check (Check 2 + Check 4) — PASS

Quick tier runs a single synthesized subagent pass covering spec compliance (Check 2)
and constitution compliance (Check 4) against the changed files (commits `a3447d6d`,
`0758ef0f`).

### Spec Compliance

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | `unit.md`'s `assertion_rules` states entry-point boundary rule (BEH-1) alongside mocking-boundary rule | PASS | `lib/test-strategies/profiles/unit.md:15` — single string containing "Mock only at external boundaries..." and "Entry-point boundary: whenever a public entry point exists for the behavior under test — a CLI subcommand invoked as a subprocess, a hook's stdin/stdout + exit-code contract, or a function whose doc-comment... MUST invoke it through that entry point." |
| 2 | `docs/test-strategies.md` documents the rule under `unit`'s assertion-rules discussion (BEH-4) | PASS | `docs/test-strategies.md:287-288` — "**Mocking boundary:**..." and "**Entry-point boundary:**..." bullets added directly under the `unit` task discussion (line 285). |
| 3 | Scope (BEH-2/BEH-3) stated clearly enough that supplementing internal-function tests aren't mistaken for violations | PASS | `unit.md:15` / `lib/test-strategies/profiles.mjs:26`: "Internal-function-level tests remain permitted only as a supplement... never as a replacement..." (BEH-2); "When no public entry point exists for a behavior, this rule does not apply..." (BEH-3). Mirrored in `docs/test-strategies.md:288`. |
| 4 | No changes to `schema-strategy-profile.spec.md`, `contract-strategy-profile.spec.md`, or the other 6 non-`unit` profile specs | PASS | `git show --stat a3447d6d` touches only `lib/test-strategies/profiles.mjs`, `lib/test-strategies/profiles/unit.md`, `tests/evals/test-strategies/test-strategies.test.mjs`; `git show --stat 0758ef0f` touches only `docs/test-strategies.md`, `tests/docs/test-strategies-docs.test.mjs`. No other profile spec file was touched by either commit. |
| 5 | All quality gates pass | PASS | See Check 1 above — fast-tier gates (`test`, `quality-gate`) both PASS. |
| 6 | No constitutional violations introduced | PASS | See Constitution Compliance below. |

Test quality: `tests/evals/test-strategies/test-strategies.test.mjs`'s new
`describe('Profile content: unit', ...)` block asserts on real substrings of the actual
`assertion_rules` string (entry-point categories, "supplement"/"replacement" language,
scoping language) and includes a fallback-drift test guarding `profiles.mjs` and `unit.md`
stay in sync. `tests/docs/test-strategies-docs.test.mjs` uses regex matches against real
file content. No `.skip`, no try/catch swallowing, no tautological assertions found.

**Scope-expansion sub-finding:** The spec's frontmatter has no `source-manifest.files`
block. INFO: "scope verification unavailable — spec has no source-manifest.files." No
scope-expansion finding emitted, per protocol for the absent-manifest case.

### Constitution Compliance

| Area | Verdict | Evidence / Rationale |
|---|---|---|
| Architecture Boundaries | PASS | `git show --stat` for both commits shows only edits to a `.md` profile file, a `.mjs` string constant, docs, and two test files — no `package.json` / `.claude-plugin/plugin.json` touched, no new imports. Nothing crosses a boundary requiring human approval. |
| "Skills are primarily markdown" / no executable logic in SKILL.md | PASS (N/A) | Neither commit touches any `skills/**/SKILL.md` file. |
| No CommonJS introduced | PASS | `git show 0758ef0f -- tests/docs/test-strategies-docs.test.mjs` shows `import { test } from "node:test"; import assert from "node:assert/strict"; import { readFileSync } from "node:fs";` — pure ESM. |
| No comment provenance/narration violations | PASS | Full diffs of both commits reviewed: the only non-code comment added is a pre-existing-style section divider (`// Profile content: unit`) in the test file, consistent with dividers already used for other profile sections in that file. No "Spec:"/"Plan-task:"/"extracted from"/"used to be" narration in either diff body; provenance lives only in commit-message trailers as required. |
| Coding Standards — naming conventions | PASS | All touched files use kebab-case filenames and camelCase identifiers (pre-existing, unmodified names); no new non-conforming files introduced. |

No `UNCITED_FINDING` issues — every finding above carries a direct file:line or
command-output citation.

## Check 8: Boundary Compliance — SKIPPED

Skipped — quick rigor tier.

## Check 9: Transition Gates — SKIPPED

Skipped — quick rigor tier.

## Check 11: Visual Verification — SKIP

No UI files in the implementation diff. Files changed: `lib/test-strategies/profiles.mjs`,
`lib/test-strategies/profiles/unit.md`, `docs/test-strategies.md`,
`tests/evals/test-strategies/test-strategies.test.mjs`, `tests/docs/test-strategies-docs.test.mjs`.
None match UI file patterns. "No UI files in implementation diff — visual verification not
applicable."

---

**Summary:** 3 passed (Check 1, synthesized Check 2, synthesized Check 4), 0 failed,
5 skipped checks (1.5, 1.6, 8, 9 — quick rigor tier; 11 — no UI files). Integration-tier
gate `integration-test` failed on a pre-existing, unrelated environment issue (Postgres
unavailable) but is `severity: warning` and does not affect the overall verdict.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI
> files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance
>   (formerly Check 6), specialist review (formerly Check 7), and charter consistency
>   (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with
>   `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly
>   Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
>
> Historic `.validate.md` reports continue to use the pre-restructure numbering; the gaps
> in the surviving inventory (Checks 1, 1.5, 1.6, 2, 4, optionally 8 and 9) are intentional
> to preserve report readability.
