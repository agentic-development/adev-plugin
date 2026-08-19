---
spec: .context-index/specs/features/reviewer-domain-fit/reviewer-panel-retarget.spec.md
kind: validate
generated: 2026-08-19
---

# Validation Report: Reviewer Panel Retarget

> **Date:** 2026-08-19
> **Spec:** .context-index/specs/features/reviewer-domain-fit/reviewer-panel-retarget.spec.md
> **Plan:** .context-index/specs/features/reviewer-domain-fit/reviewer-panel-retarget.plan.md
> **Rigor Tier:** full (risk_level defaulted to medium → validate_mode: full)
> **Overall Status:** PASS_WITH_NOTES

---

## Check 1: Quality Gates — PASS_WITH_NOTES

- Fast tier (`npm test`): PASS — 6949/6949 tests pass, 0 fail (2 pre-existing `todo`).
- Fast tier (`quality-gate`, same command as `test`, shared `command_sha`): PASS.
- Integration tier (`npm run test:evals`, severity: warning): WARN — 379/391 pass, 12 fail. All 12 failures are pre-existing sandbox-infra gaps unrelated to this spec (missing `pg` npm package in `tests/evals/integration-sandbox/lib/db.mjs`, and `reality-check.test.mjs` evidence-detection gaps in the sandbox harness). Non-blocking per declared `severity: warning`.
- E2E tier: no gates configured — skipped.

Gate outcomes attested: `test` (fast, pass), `quality-gate` (fast, pass), `integration-test` (integration, fail/warning).

## Check 1.5: Source Manifest Verification — PASS_WITH_NOTES

- Spec frontmatter now carries a `source-manifest` block (`sha: d21ff38`, 15 files, `computed-at`) — previously-flagged missing-stamp finding is **resolved**.
- `adev source-manifest verify`: WARN — drifted (expected `d21ff38`, actual `6aed946`). Expected: fix commit `82432c9e` touched already-stamped files (the three reviewer-prompt prose corrections) after the manifest was computed.
- All 15 manifest files independently confirmed git-tracked (`git log --oneline -1 -- <file>` returns a commit for each) — no missing/uncommitted files.

## Check 1.6: Code-Side Drift Warning — PASS_WITH_NOTES (non-blocking)

- `drift_detected=true`; source: `skills/review-specs/wiring-reviewer-prompt.md` modified 2026-08-19T12:30:13Z after the manifest stamp — consistent with, and explained by, the Check 1.5 finding above.

## Check 2: Spec Compliance — PASS_WITH_NOTES

- All 16 Acceptance Criteria: PASS (verified via direct file reads of `templates/domains/software/reviewers.yaml`, all 5 new/rewritten prompt files, `extensions/web-service/domain/reviewers.yaml`, `extensions/web-service/adev-extension.yaml`, `templates/review-specs/defaults.yaml`, `templates/extensions-catalog.json`, `charter.md`, and a live `adev governance materialize --registry review` run).
- All 8 Behaviors (BEH-1 through BEH-8): PASS.
- **Scope Expansion Sub-Finding — WARNING:** two classes of files outside the 15-entry `source-manifest.files` boundary:
  1. `.context-index/specs/features/domain-profiles/domain-resolution-and-overlay-structure.spec.md` — a different spec (different charter directory), amended to fix the `project.domain` vs. top-level `domain:` documentation drift. Real, deliberate, and directly tied to this spec's Step 4/5 dependency on `resolveDomain()`, but not declared in this spec's own manifest.
  2. `providers/{codex,opencode}/skills/review-specs/*` mirrors (10 files) — spec-mandated per the spec's own Dependencies section (`scripts/sync-provider-skills.mjs` re-sync requirement), verified byte-identical to their canonical counterparts, but not implied by any `skills/review-specs/*.md` manifest entry's directory.
  This is a **non-blocking** finding (raises the check from PASS to PASS_WITH_NOTES per the Scope Expansion Sub-Finding severity rule) — not a behavioral defect.

## Check 4: Constitution Compliance — PASS

- Architecture boundaries: PASS — no new skill added to the lifecycle order, no hook-protocol change, no CLI-path change, no plugin-registration change, no new dependency (`git diff main -- package.json .claude-plugin/plugin.json cli/index.mjs` all empty for this spec's commit range).
- Non-negotiable principles: PASS — all 5 verified (dependencies unchanged; prompts are markdown with zero fenced-JS; `.mjs` files touched are ESM-only, `require`/`module.exports` grep empty; no hook touched; `package.json`/`.claude-plugin/plugin.json` versions both `0.27.8`, unchanged by this spec's commits).
- Coding standards: PASS — kebab-case file/dir naming, correct file structure (prompts under existing `skills/review-specs/`, new extension under `extensions/web-service/` mirroring `extensions/data-engineering/`), Node-builtins-first import ordering in touched `.mjs` files.
- Anti-patterns: PASS — no CommonJS, no inline-Node directives, no executable fenced JS, and every hash/SHA-256-related string in the 5 active prompts is a *prohibition* ("you must not do this"), never an instruction.
- **Previously-FAILed finding, independently re-verified: RESOLVED.** `.context-index/specs/features/domain-profiles/domain-resolution-and-overlay-structure.spec.md` frontmatter now shows `revision: 7` with no `drift_detected` key (was `revision: 6` / `drift_detected: true` before commit `82432c9e`). Its prose now documents a **top-level** `domain:` key (not nested `project.domain`), matching `lib/domains/resolve.mjs:41-50`'s actual `resolveDomain()` implementation, which reads `manifest.domain` directly.

## Check 8: Boundary Compliance — PASS

- `adev boundaries check --json`: verdict PASS — 0 violations across 16 changed files against 3 rules.
- Disabled: `no-manual-version-bump` — "the boundary evaluator matches file content, not diffs; a version field is not a version bump, so this rule would fire on package.json forever. Needs a diff-aware evaluator."
- Registry warnings: none.

## Check 9: Transition Gates — PASS

- Transition: `implement-to-validate`.
- `test`: pass — reason `recorded-pass`, `command_attested: true`.

## Check 11: Visual Verification — N/A (SKIP)

- No UI files (`*.tsx`/`*.jsx`/`*.vue`/`*.svelte`/`*.css`/`*.scss`/`*.html`, or `components/`/`pages/`/`views/`/`public/` directories) present in the implementation diff — the change is entirely markdown prompts, YAML registries, and one JSON catalog. Case A of the trigger-guard matrix: SKIP, not applicable.

## Check 14: Gate Executability and Test Collection — PASS_WITH_NOTES

- `adev gate doctor --json`: 4 warnings, 0 errors.
  - `gate-doctor/runner-unknown` ×3 (`test`, `quality-gate`, `integration-test` — none of the three's `npm ...` commands map to a runner the doctor recognizes for collection verification).
  - `gate-doctor/ci-gate-not-invoked` — `integration-test` (`npm run test:evals`) does not appear in any CI workflow.
- All warnings pre-existing, not introduced by this spec's changes.

---

## Prior-FAIL Reconciliation

A prior validate run on this spec (recorded under the same spec revision, timestamped ~2026-08-19T12:06–12:20) FAILed on three findings. This fresh, independent run re-verified all three from source rather than trusting the fix commit's message:

1. **Check 4 — stale `project.domain` manifest contract in the governing spec.** RESOLVED — see Check 4 above (`domain-resolution-and-overlay-structure.spec.md` revision 7, `drift_detected` cleared, prose and code agree on the top-level `domain:` key).
2. **Check 1.5/9 — missing source-manifest frontmatter stamp.** RESOLVED — the spec's frontmatter now carries a complete `source-manifest` block; Check 1.5 no longer records SKIP (it now records PASS_WITH_NOTES for a later, expected drift instead — see above). Check 9 no longer records SKIP for `no-manifest-stamp`; it now records PASS with an attested `test` gate outcome.
3. **Non-blocking prose bug — three reviewer prompts claiming `reviewer-reasoning` in their "On blocker_id" section.** RESOLVED — `wiring-reviewer-prompt.md` and `boundary-reviewer-prompt.md` now state `reviewer-capable`; `termination-reviewer-prompt.md` now states `reviewer-fast`; all three match their actual registry-assigned profile in `templates/domains/software/reviewers.yaml` and `extensions/web-service/domain/reviewers.yaml`. Provider mirrors under `providers/{codex,opencode}/skills/review-specs/` were re-synced and are byte-identical to the canonical files.

## New Issues Surfaced By This Run

None blocking. One new non-blocking observation surfaced independently (not part of the original three FAILed findings): Check 2's Scope Expansion Sub-Finding flags that the `domain-resolution-and-overlay-structure.spec.md` fix (item 1 above) and the `providers/*` mirror regeneration both fall outside this spec's own 15-entry `source-manifest.files` declaration. The mirror regeneration is spec-mandated (Dependencies section) and benign; the cross-spec edit is real, correct, and necessary, but was made without extending this spec's declared scope to cover it.

---

**Summary:** 8 checks dispatched (1, 1.5, 2, 4, 8, 9, 11, 14) plus one non-registry observational check (1.6). 0 FAIL. 5 PASS_WITH_NOTES (1, 1.5, 1.6, 2, 14). 3 PASS (4, 8, 9). 1 N/A/SKIP (11, no UI files). All three previously-flagged findings independently confirmed resolved.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
