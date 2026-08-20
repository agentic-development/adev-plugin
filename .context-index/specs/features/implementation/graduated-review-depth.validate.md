---
spec: .context-index/specs/features/implementation/graduated-review-depth.spec.md
plan: .context-index/specs/features/implementation/graduated-review-depth.plan.md
kind: validate
---

# Validation Report: Graduated Review Depth in /adev:implement

> **Date:** 2026-08-19
> **Spec:** .context-index/specs/features/implementation/graduated-review-depth.spec.md
> **Plan:** .context-index/specs/features/implementation/graduated-review-depth.plan.md
> **Overall Status:** PASS (with notes)

---

## Check 1: Quality Gates — PASS (with notes)

Tiered execution against the project's materialized `governance/gates.yaml` (domain: software):

- **Check 1a (fast tier):** `npm test` (gate `test`) and `quality-gate` (same command) — PASS. 7238 tests, 7236 pass, 0 fail, 2 todo (pre-existing, unrelated to this spec). Duration 43.4s.
- **Check 1b (integration tier):** `npm run test:evals` (severity: warning) — WARN. 393 tests, 381 pass, 12 fail. All 12 failures are in `tests/evals/integration-sandbox/reality-check.test.mjs` (sandbox/git reality-check harness), a file not in this spec's source-manifest and not touched by this implementation. Severity is `warning`, so this does not block per Check 1's severity rules; non-blocking WARN recorded.
- **Check 1c (e2e tier):** no gates configured — skipped.

Per-gate outcomes recorded via `adev report --type validator --gate-outcomes`: `test: pass`, `quality-gate: pass`, `integration-test: fail` (tier: integration, severity: warning). Manifest sha `2a12564` (matches spec's `source-manifest.sha`).

## Check 1.5: Source Manifest Verification — PASS

`adev source-manifest verify --spec <path>` → `Check 1.5: PASS — source manifest matches (sha: 2a12564)`. All 41 files listed in the spec's `source-manifest` block were additionally confirmed to have git history (`git log --oneline -1 -- <file>` non-empty for every file) — none are uncommitted/staged-only.

## Check 1.6: Code-Side Drift Warning — PASS (non-blocking)

`adev verify spec --check-drift` → `{"drifted":false,"drift_source":null,"drift_at":null}`. No drift detected.

## Check 2: Spec Compliance — PASS (with notes)

Dispatched a fresh subagent to walk all ~30 acceptance criteria plus Output Contract sections A–K against actual source reads (not plan checkboxes). Result: 33/35 criteria PASS with direct file:line citations (`lib/implement/review-depth.mjs`, `lib/governance/rigor-mode.mjs`, `lib/cli/implement.mjs`, `lib/lifecycle-events.mjs`, `lib/diagnostics/event-schemas.mjs`, `lib/lifecycle-state.mjs`, `lib/manifest.mjs`, `skills/implement/SKILL.md`, `skills/build/SKILL.md`, and the corresponding test files). Two PARTIALs, both test-coverage gaps on already-correct code, no FAIL:
- AC3: no behavioral test isolates a spec-compliance-lens finding id surviving cycles under the synthesized reviewer (only doc-contract assertions exist for the requirement).
- AC16: deletion (`D` status) outside the declared-additive set is tested; a symlink/type-change (`T` status) case is not, though the code (`scopeMismatchLeg`) treats `T` identically to `D`.

Cross-repo dependency validation: N/A — no cross-repo `depends-on` references (both `depends-on` entries are same-repo specs), and no workspace-aware mode was triggered.

## Check 4: Constitution Compliance — PASS

- **Architecture boundaries:** PASS. No new dependencies (`package.json`/`.claude-plugin/plugin.json`/`.cursor-plugin/plugin.json` diffs vs `main` are empty), no manifest.yaml skill-order change, no hook files touched.
- **Non-negotiable principles:** PASS on all five (dependency minimization, skills-as-markdown with logic in `lib/implement/review-depth.mjs`, pure ESM confirmed via `require(`/`module.exports` grep returning zero hits, hook protocol N/A, version parity — no version bump attempted).
- **Coding standards:** PASS. camelCase functions/vars, kebab-case files, Node-builtins-first import ordering confirmed in `lib/cli/implement.mjs` and `lib/implement/review-depth.mjs`.
- Anti-patterns checked and clear: no inline-Node/`node -e` patterns in `skills/implement/SKILL.md` or `skills/build/SKILL.md`; no SKILL.md H3 section mixes inline-Node and `adev <verb>`; no fenced-JS control-flow blocks in the new companion `.md` files; no new `skills/<name>/` directory added (so the Load-Skill-Extensions requirement does not apply).
- Cross-spec amendments (`graduated-rigor-tiers.spec.md` revision 2→3, `lifecycle-event-log.spec.md` revision 5→6) confirmed landed on disk, not merely described.

## Check 8: Boundary Compliance — PASS

`adev boundaries check --json` → verdict `PASS`, reason "no boundary violations in 48 changed file(s) against 3 rule(s)". One rule (`no-manual-version-bump`) is disabled with a stated reason (evaluator matches content, not diffs — a known, pre-existing limitation, unrelated to this spec).

## Check 9: Transition Gates — PASS

`adev gate transitions --transition implement-to-validate --json` → verdict `PASS`, reason "every required gate has a fresh, attested, passing outcome". Gate `test`: `pass`, `command_attested: true`.

## Check 11: Visual Verification — N/A (SKIP)

No UI files (`*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss`, `*.html`, `components/`, `pages/`, `views/`, `public/`, `app/**/page.*`, `app/**/layout.*`) appear in the implementation diff (`git diff main --name-only` against the UI-pattern set: zero matches). This is a CLI/library/skill-markdown feature with no UI surface. Per Check 11's trigger-guard matrix (Case A/D), recorded SKIP — "No UI files in implementation diff — visual verification not applicable."

---

**Summary:** 6 passed (1.5, 1.6, 4, 8, 9, and Check 1's fast tier), 2 passed-with-notes (Check 1 overall — integration-tier WARN on a pre-existing, unrelated sandbox test; Check 2 — two non-blocking test-coverage PARTIALs), 0 failed, 1 skipped (Check 11, no UI files present).

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
>
> Historic `.validate.md` reports continue to use the pre-restructure numbering; the gaps in the surviving inventory (Checks 1, 1.5, 1.6, 2, 4, optionally 8 and 9) are intentional to preserve report readability.
