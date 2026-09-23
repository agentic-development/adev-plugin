---
spec: .context-index/specs/cross-cutting/review-block-auto-retry-rev-2-targeted-author-verify-loop.spec.md
plan: .context-index/specs/cross-cutting/review-block-auto-retry-rev-2-targeted-author-verify-loop.plan.md
date: 2026-09-23
overall_status: FAIL
rigor_tier: full
---

# Validation Report: Amendment: Live Spec: Auto-Retry Loop on Review BLOCK (targeting rev 2)

> **Date:** 2026-09-23 (second run)
> **Spec:** .context-index/specs/cross-cutting/review-block-auto-retry-rev-2-targeted-author-verify-loop.spec.md
> **Plan:** .context-index/specs/cross-cutting/review-block-auto-retry-rev-2-targeted-author-verify-loop.plan.md
> **Overall Status:** FAIL. The only blocker is #11, the A/B convergence eval, which has had no new run.

**Rigor tier:** `full`. It resolves from `risk_level: high` → `validate_mode: full`.

**Context:** This re-validates PR #364 after the remediation of this morning's FAIL run. That run's findings #1, #3, #6, #7, #10, #12 and both Check 4 findings are fixed. This run's Check 2 reviewer found one new defect: step 5c omitted `reviewer`. It was fixed and re-tested within this run (see Check 2, #6).

---

## Check 1: Quality Gates — PASS_WITH_NOTES

- **1a (fast):** `npm test` — PASS (8,689 tests: 8,687 pass, 0 fail) [gates `test`, `quality-gate`].
- **1b (integration, severity warning):** `npm run test:evals` — 349/364 pass, 15 fail. This is the same set as the earlier run: no Postgres on :5433 (`build-with-db`, `build-without-db`, `reality-check`), plus `tier2-dispatch-shape` and `token-budget-eval`, which also fail on clean `main`. Non-blocking.
- **1c (e2e):** none configured.

The attested `validator_report` was emitted with `--manifest-sha 50c8547`.

## Check 1.5: Source Manifest Verification — PASS

The manifest was re-stamped to `50c8547` over 57 files, and `adev source-manifest verify` returns PASS. The re-stamp:

- replaces the two relocated companion paths with their new `references/` locations;
- adds the post-merge `references/` prose files, `lib/cli/blockers.mjs`, and the eight reviewer prompts;
- adds `tests/skills/review-specs-finding-class-prompts.test.mjs` and `tests/cli/blockers-write.test.mjs`.

`drift_detected` was cleared.

## Check 1.6: Code-Side Drift Warning — PASS

`adev verify spec --check-drift` → `drifted: false`.

## Check 2: Spec Compliance — FAIL

| # | Criterion (short) | Verdict | Evidence / note |
|---|---|---|---|
| 1 | `finding_class` in the BLOCK schema and `.blockers.md` | PASS (note) | Every reviewer prompt, including quick-synthesized and the mirrors, declares `finding_class`/`remedy_ref`; `tests/skills/review-specs-finding-class-prompts.test.mjs` walks the registry. `refuseUnsafeScalar` rejects type-coercing `remedy_ref` scalars (`lib/blockers-writer.mjs`). Note: the prompts spell the type field `finding-type`, as it is on `main`, and the step-6 aggregator maps it to `finding_type`. |
| 2 | `decision` → `DECISION_REQUIRED`, never authored | PASS | `lib/cli/specify.mjs` group-blockers `decision_blocker_ids`. The integration test drives `blockers write` → `group-blockers` through the CLI. |
| 3 | `external` excluded; `remedy_ref` via the named renderer | PASS | `renderRemedyRef` has production callers: `adev blockers write --json` `externalRemedies` and `group-blockers` `external_blockers`. A CLI test asserts both channels are byte-identical. |
| 4 | One authoring subagent per anchor | PASS (note) | Fan-out is prose (`references/revise-mode-authoring-dispatch.md`). Grouping and the multi-anchor splice are tested. |
| 5 | Real-diff addressed/unresolved; BEH-5a refusal | PASS | `lib/specify-revise.mjs`; tests (a)–(e3). |
| 6 | `check-mechanisms` gate; unresolved → blockers; inner retry | PASS (fixed in-run) | Covered by `revise --same-revision` (no bump, no `spec_revised`; `SPEC_NOT_PENDING` guard), `section_anchor` + `extracted` in the check output, and an end-to-end CLI test of the documented 5a→5c→5b sequence. **Found in this run:** step 5c omitted `reviewer`, so every mechanism-existence finding was dropped while `blockers write` still exited 0 and the retry then died on `NO_REVIEW_SIDECARS`. Fixed three ways: 5c now specifies `reviewer: build-loop`; `blockers write` exits 2 `NO_USABLE_FINDINGS` when a non-empty input yields an empty sidecar; 5b now aborts on any other non-zero exit. The test now follows the prose form (no `--auto`). |
| 7 | Diff-scoped re-review; full context first | PASS (note) | `no-content-changed` → `scoped: false` (CLI test added). The baseline is `HEAD:<spec>`, so an uncommitted loop scopes against a superset. That is safe but not minimal. |
| 8 | `NOT_CONVERGING` | PASS | `lib/loop-convergence.mjs`. |
| 9 | `max_review_retries` default 2 | PASS | `lib/manifest.mjs:148` (the spec cites :147). |
| 10 | Deterministic tests for every listed path | PASS (note) | The tautological inner-cap, decision-grouping and two-channel tests were replaced with CLI-driven ones, and the ANSI "two-channel" tautology was removed (the renderer keeps its own unit tests). The NO_PROGRESS/REGRESSED/BUDGET tests remain library-level. |
| 11 | Real `--baseline-ref` A/B eval reaches PASS or a correct DECISION/EXTERNAL exit, cheaper | **FAIL** | No new run. The earlier results stand: 08-24 had every trial BLOCK, and 08-28 produced no data. Before this remediation the treatment arm could not emit `decision`/`external` at all (#1), so the old runs say nothing about the fixed loop. |
| 12 | Reviewer set named as whatever the registry resolves | PASS | `skills/review-specs/SKILL.md:17` is corrected. |
| 13 | Quality gates pass | PASS | Check 1. |
| 14 | No constitutional violations | PASS | Check 4. |
| 15 | `…q6q0` / `…j7pq.1` closed with the spec path | PARTIAL | Not verifiable from the worktree (`beads.db` is missing there). Close them after merge. |

**Scope expansion (warning, minor):**
- `providers/{codex,opencode}/**` mirrors, which are generated.
- `skill-body-progressive-disclosure.spec.md`: byte and pointer figures only, which its own `spec-figures-current` test requires after the companion moves.
- The untracked nested worktree `.eval-worktree-convergence-baseline/` is **not** part of the change and must not be committed.

## Check 4: Constitution Compliance — PASS

- **Architecture boundaries:** PASS. No new dependencies, no version bump (0.27.9 in both manifests), and nothing changed under `hooks/`, `cli/` or `.claude-plugin/`.
- **Non-negotiable principles:** PASS.
  - Pure ESM.
  - No inline Node in skills.
  - The one added fenced JS block (`step-6-events-and-report.md`) is reference-only.
  - All 45 `<ADEV_ROOT>` pointers in touched files resolve, and both companions now live under `references/`.
  - The size and parity tests pass. The two back-references the move turned into pointer cycles were de-linked.
- **Coding standards:** PASS. All branch-authored narration and provenance comments are gone. The reviewer's one advisory, a plan-task citation at `lib/blockers-writer.mjs:47`, was rewritten in-run to name the consuming modules. The remaining "Task N" comments (`lib/cli/governance.mjs:159,166`, `lib/blockers-writer.mjs:4`, `lib/loop-convergence.mjs:4`, `lib/manifest.mjs:4`) predate this branch.

## Check 8: Boundary Compliance — PASS

No violations in 69 changed files against 3 rules. `no-manual-version-bump` is disabled, with its stated reason.

## Check 9: Transition Gates — PASS

`implement-to-validate`: `test` recorded-pass, attested, and fresh against `50c8547`.

## Check 11: Visual Verification — N/A

No UI files.

## Check 14: Gate Executability — PASS_WITH_NOTES

0 errors and 4 warnings: `runner-unknown` ×3, and `integration-test` is not invoked in CI.

---

## Remaining remediation

1. **(#11)** Run `tests/evals/convergence/run-convergence-eval.mjs --baseline-ref eec2d6e1` to completion against the fixed loop. It is paid (about $80) and takes a few hours. The alternative is to formally descope the criterion through a spec amendment. This is the only open blocker.
2. **(#15)** After merge, close `j7pq.1` and annotate `q6q0` with the spec path.

---

**Summary:** 7 passed (1, 1.5, 1.6, 4, 8, 9, 14; 1 and 14 with notes), 1 failed (2, on #11 only), 1 skipped (11).

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
>
> Historic `.validate.md` reports continue to use the pre-restructure numbering; the gaps in the surviving inventory (Checks 1, 1.5, 1.6, 2, 4, optionally 8 and 9) are intentional to preserve report readability.
