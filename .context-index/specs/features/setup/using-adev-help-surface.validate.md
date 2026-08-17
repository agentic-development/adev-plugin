---
spec: .context-index/specs/features/setup/using-adev-help-surface.spec.md
plan: .context-index/specs/features/setup/using-adev-help-surface.plan.md
tier: quick
date: 2026-08-17
overall-status: PASS
---

# Validation Report: `using-adev` Interactive Help Surface

> **Date:** 2026-08-17
> **Spec:** .context-index/specs/features/setup/using-adev-help-surface.spec.md
> **Plan:** .context-index/specs/features/setup/using-adev-help-surface.plan.md
> **Rigor tier:** quick
> **Overall Status:** PASS

---

## Check 1: Quality Gates — PASS
- Check 1a (fast): `npm test` (gate `test`) — PASS (7046 tests, 7044 pass, 0 fail, 2 todo, 56.2s)
- Check 1a (fast): `npm test` (gate `quality-gate`) — PASS (same run, deduplicated command)
- Check 1b (integration): `npm run test:evals` (gate `integration-test`, severity: warning) — WARN (403 tests, 380 pass, 23 fail). Failures are in `tests/evals/work-tracking/work-tracking.test.mjs` (dashboard/widgets/auth fixture reverse-index assertions), unrelated to this spec's scope (`skills/using-adev/SKILL.md` + 3 new test files). Non-blocking per severity: warning.
- Check 1c (e2e): no gates configured — skipped.

Gate outcomes attested: `test` (fast, pass), `quality-gate` (fast, pass), `integration-test` (integration, fail — severity warning, non-blocking).

## Check 1.5: Source Manifest Verification — PASS
- `adev source-manifest verify` — PASS: source manifest matches (sha: 9863f02)
- Git-tracked check: all 4 manifest files verified committed —
  `skills/using-adev/SKILL.md` (b3aa002a), `tests/skills/using-adev-how-does-x-work.test.mjs` (2a8b9826),
  `tests/skills/using-adev-trigger-broadening.test.mjs` (5b19779b), `tests/skills/using-adev-what-should-i-do.test.mjs` (14bb2371)

## Check 1.6: Code-Side Drift Warning — SKIP
- Skipped — quick rigor tier.

## Check 2: Spec Compliance — PASS
- Description frontmatter broadened for "what should I do" / "how does X work" triggers: PASS — `skills/using-adev/SKILL.md:3`. Verified by `tests/skills/using-adev-trigger-broadening.test.mjs:17-30` (3 tests pass).
- "What should I do?" path stays conceptual, defers to `/adev:work`: PASS — `skills/using-adev/SKILL.md:74-83` ("Never perform the routing decision yourself... Always end by pointing the user to `/adev:work`"). Verified by `tests/skills/using-adev-what-should-i-do.test.mjs:11-29` (3 tests pass).
- "How does X work?" checks `docs/*.md` first, falls back to `skills/<name>/SKILL.md`: PASS — `skills/using-adev/SKILL.md:85-97`. Verified by `tests/skills/using-adev-how-does-x-work.test.mjs:22-27`.
- No new skill added to `.claude-plugin/plugin.json`/lifecycle order: PASS — `git diff main -- .claude-plugin/plugin.json` empty; no `using-adev` entry changes.
- No new code/CLI verb/dependency introduced: PASS — `git diff main -- package.json` empty; feature commits (5b19779b, 14bb2371, 2a8b9826, b3aa002a) confined to `skills/using-adev/SKILL.md` and the three new test files.
- Constitution Principle 2 ("skills are primarily markdown") honored: PASS — no companion `.mjs` logic added under `lib/` or `cli/`.
- Failure Modes table (skill-not-found suggestions, docs-insufficient fallback, ambiguity disambiguation, no-concrete-routing guard): PASS — all four present in `SKILL.md` (lines 79, 83, 95-97).
- Test integrity: PASS — all three test files use scoped `assert.match`/`assert.ok`/`assert.notEqual`, no loose matchers, no conditional skips, no vacuous assertions. 10/10 tests pass.
- **Observation (non-blocking):** `providers/codex/skills/using-adev/SKILL.md` and `providers/opencode/skills/using-adev/SKILL.md` also changed (+27 each) as provider-mirror syncs. Provider mirrors are explicitly out of scope for the inline-node hook per CLAUDE.md; not treated as a scope violation.

## Check 4: Constitution Compliance — PASS
- Architecture boundaries: PASS — no new skill in lifecycle order; change is "Editing skill markdown content" (Autonomous, constitution.md:86); `.claude-plugin/plugin.json` untouched.
- Non-negotiable principles: PASS — Principle 2 satisfied; no CommonJS, no new dependencies.
- Coding standards: PASS — feature commits carry required `Spec:`/`Plan-task:` trailers; no hardcoded `~/.claude/` paths introduced.

## Check 8: Boundary Compliance — SKIP
- Skipped — quick rigor tier.

## Check 9: Transition Gates — SKIP
- Skipped — quick rigor tier.

## Check 11: Visual Verification — N/A
- No UI files in implementation diff (skill markdown + test files only) — visual verification not applicable.

---

**Summary:** 4 passed (1, 1.5, 2, 4), 1 passed-with-warning (Check 1 integration tier — pre-existing, unrelated eval failures), 4 skipped per quick rigor tier (1.6, 8, 9) or N/A (11). No spec, constitution, or quality-gate blocking failures.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
>
> Historic `.validate.md` reports continue to use the pre-restructure numbering; the gaps in the surviving inventory (Checks 1, 1.5, 1.6, 2, 4, optionally 8 and 9) are intentional to preserve report readability.
