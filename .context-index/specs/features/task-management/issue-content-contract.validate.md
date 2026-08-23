---
rigor-tier: quick
aggregate-verdict: PASS_WITH_NOTES
---

# Validation Report: Issue Content Contract

> **Date:** 2026-08-22
> **Spec:** .context-index/specs/features/task-management/issue-content-contract.spec.md
> **Plan:** .context-index/specs/features/task-management/issue-content-contract.plan.md
> **Overall Status:** PASS

**Rigor tier:** `quick` — resolved from `risk_level: low` via `.context-index/governance/risk-policies.yaml` (`policies.low.validate_mode: quick`). Per the graduated-rigor-tiers contract, Check 1 (Quality Gates) ran in full; Checks 2 and 4 ran as one synthesized compliance check; Checks 1.5, 1.6, 8, and 9 were skipped (quick tier). Check 11 evaluated its trigger guard independently.

---

## Check 1: Quality Gates — PASS_WITH_NOTES

- **Check 1a (fast tier):** `npm test` — PASS (7712/7714 pass, 2 pre-existing unrelated `todo`, 0 fail, 44.9s)
- **Check 1b (integration tier):** `npm run test:evals` — WARN (382/394 pass, 12 fail, 21.4s). Gate is `severity: warning`, `required: false` in `governance/gates.yaml` (documented pre-existing flake: Postgres-backed fixtures with no live Postgres in this environment, and `reality-check`/context-pack nonce-fencing eval-sandbox tests). None of the 12 failures touch `skills/issues/`, `skills/plan/`, or any file this feature changed — verified by name (`Phase 1: fixture setup (Postgres online)`, `PostgreSQL IS running on port 5433`, `reality-check: integration-sandbox fixture`, etc.). Non-blocking per gate config.
- **Check 1c (e2e tier):** SKIP — no gates configured for this tier.

Gate outcomes attested: `test` (pass), `quality-gate` (pass), `integration-test` (fail, warning-severity). Manifest SHA: `c5203b3`.

## Check 1.5: Source Manifest Verification — SKIP (quick tier)

## Check 1.6: Code-Side Drift Warning — SKIP (quick tier)

## Check 2 + Check 4 (synthesized, quick tier): PASS

### Check 2 — Spec Compliance: PASS (9/9 acceptance criteria)

| # | Criterion | Verdict | Citation |
|---|-----------|---------|----------|
| 1 | BEH-1: feature/bug create prompts trimmed template | PASS | `skills/issues/SKILL.md:81-88`; `tests/skills/issue-content-contract-template.test.mjs:21-27` |
| 2 | BEH-2: task type accepts one-line notes, no forced template | PASS | `skills/issues/SKILL.md:88`; `issue-content-contract-template.test.mjs:29-33` |
| 3 | BEH-3: `--spec-ref` populates `spec_ref` | PASS | `skills/issues/SKILL.md:15,94`; `issue-content-contract-spec-ref.test.mjs:11-28` |
| 4 | BEH-4: empty-notes soft warning, never blocks | PASS | `skills/issues/SKILL.md:90-92`; `issue-content-contract-empty-notes-warning.test.mjs:20-22` |
| 5 | BEH-5: plan epic notes = goal summary | PASS | `skills/plan/SKILL.md:828`; `issue-content-contract-epic-notes.test.mjs:23-26` |
| 6 | Feature/release-mode `Charter:`/`Release:` tags unchanged | PASS | `skills/plan/feature-mode.md:38`, `skills/plan/release-mode.md:65`; `issue-content-contract-epic-notes.test.mjs:28-34` |
| 7 | BEH-6: next_action default lookup | PASS | `skills/issues/SKILL.md:96`; `skills/plan/epic-mode.md:26-28`; `issue-content-contract-next-action-default.test.mjs:14-29` |
| 8 | Quality gates pass | PASS | 10/10 feature tests pass |
| 9 | No constitutional violations | PASS | see Check 4 below |

Test integrity: targeted regex/substring assertions scoped to the correct SKILL.md subsection, no loose matchers, no conditional skips, no vacuous assertions — appropriate for a pure-prose feature.

### Check 4 — Constitution Compliance: PASS

- **Architecture Boundaries:** PASS — no new services, deps, or auth changes; nothing on the "Requires Human Approval" list.
- **Non-Negotiable Principles:** PASS — pure ESM in all 5 new test files (zero `require`/`module.exports`); "Skills are primarily markdown" respected (prose only, no executable logic added); no new external dependencies.
- **Coding Standards:** PASS — kebab-case test filenames; zero matches for `node -e`, `node --input-type=module -e`, `Run inline Node` in `skills/issues/SKILL.md` / `skills/plan/SKILL.md`.

## Check 8: Boundary Compliance — SKIP (quick tier)

## Check 9: Transition Gates — SKIP (quick tier)

## Check 11: Visual Verification — SKIP

No UI files in the implementation diff (`git diff 969dfdd3..HEAD --stat`: `skills/issues/SKILL.md`, `skills/plan/SKILL.md`, 2 provider mirrors ×2 files, 5 new `.test.mjs` files, spec/charter/lifecycle-state artifacts — none match `*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss`, `*.html`, `components/`, `pages/`, `views/`, `public/`, `app/**/page.*`, `app/**/layout.*`). Visual verification not applicable.

---

**Summary:** 7 checks dispatched or evaluated (1 full, 2 synthesized-into-1, 4 skipped by rigor tier, 1 skipped by trigger guard). 0 failed at blocker severity. 1 warning (integration-tier eval flake, pre-existing, unrelated, non-required).

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See `/adev:review-specs`, `/adev:hygiene` Audit Pass 20, `/adev:reconcile`, and `hooks/post-validate-extract-heuristics.{sh,mjs}` respectively.
