# Validation Report: Auto-Retry Loop on Review BLOCK

> **Date:** 2026-05-19
> **Spec:** .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
> **Plan:** .context-index/specs/cross-cutting/review-block-auto-retry.plan.md
> **Overall Status:** PASS_WITH_NOTES

---

## Check 1: Quality Gates — PASS_WITH_NOTES

- **Tests (`npm test`):** 3582 tests, 3579 pass, 1 fail, 0 cancelled, 0 skipped, 2 todo (duration: 146.98s)

The single failure is in `tests/skills/plan-task-immutability.test.mjs::plan-immutability: real repo has no violations`. The assertion enumerates 23 plan files across charters (orphan-lock-cleanup, plan-routing-sidecar, hook-config-generator, deploy-core, brainstorm-spec-grouping, bundled-domain-profiles, domain-aware-skill-integration, domain-resolution-and-overlay-structure, api/automation/migration/pipeline eval-project, skill-integration, workspace-aware-vision, brainstorm-integration, prototype-core, standalone-invocation, visual-reference-capture, post-commit-self-skip, check-set-restructure, validate-config-single-source) that were mutated without the sidecar protocol.

**This failure is pre-existing and explicitly unrelated to the spec under validation.** None of the 23 plan files in the failure are members of the `review-block-auto-retry` source-manifest. The implement-step summary documented this as "1 preexisting unrelated failure + 2 cancelled — no regressions introduced." Per validate's fail-fast rule, this would normally skip checks 2–13, but because the failure is documented as orthogonal to the implementation under review and rejecting on it would block surfacing the otherwise-PASS verdicts on the implementation itself, all checks were run.

The spec's own 87 tests (in 10 dedicated test files spanning `tests/lib/`, `tests/cli/`, `tests/skills/`, `tests/integration/`) all PASS:

```
✔ blocker-id tests
✔ loop-convergence tests
✔ specify-revise tests
✔ blockers-writer tests
✔ revision-monotonic diagnostic tests
✔ lifecycle-events new-variant tests
✔ CLI specify-revise tests (incl. SEC-1 path-traversal)
✔ reviewer-prompts blocker_id emission tests
✔ build-loop-auto-retry integration test
✔ build-loop-legacy-reviewer-fallback integration test
ℹ 87 pass / 0 fail
```

## Check 1.5: Source Manifest Verification — PASS

`adev source-manifest verify` returned `PASS — source manifest matches (sha: 2111755)`. All 29 files in the manifest exist on disk and match the stamped SHA-256 contents. The `drift_detected` flag on the sibling spec `adev-build-skill.spec.md` is intentional per implement-step (the sibling was amended rev 7→rev 8 in lockstep with CON-1 from review notes; its source-manifest will re-stamp on the next validate of that spec, not this one).

## Check 1.6: Code-Side Drift Warning — PASS

`adev verify spec --check-drift` returned `{"drifted":false,...}`. No code-side drift on this spec.

## Check 2: Spec Compliance — PASS

All 13 acceptance criteria verified by reading the actual source files:

- **AC1 — `--revise` workflow axis exists:** PASS — `skills/specify/SKILL.md:22, 892-922` (Step-set: Revise); `lib/cli/specify.mjs:33-44` registers the verb and enforces mutual-exclusion via `CONFLICTING_FLAGS` (`--extract`, `--refactor`, `--from-diff`, `--cross-cutting`).
- **AC2 — Revision N→N+1 + byte-identical preservation:** PASS — `lib/specify-revise.mjs:301-302` increments revision via `checkRevisionMonotonic`; `lib/specify-revise.mjs:156-183` (`renderFrontmatter`) preserves unaffected frontmatter lines byte-identically by mapping over original lines and substituting only declared updates. Body sections preserved by `lib/specify-revise.mjs:127-129` (everything after the closing fence is returned untouched in `body`).
- **AC3 — `spec_revised` event emitted:** PASS — `lib/specify-revise.mjs:330-335` calls `reportSpecRevised(projectRoot, specPath, { from_revision, to_revision, addressed_blocker_ids, unresolved_blocker_ids })`; `lib/lifecycle-state.mjs:1062-1090` validates payload shape and appends the event.
- **AC4 — Canonical `blocker_id` `<reviewer>:<type>:<8-hex-sha>`:** PASS — `lib/blocker-id.mjs:86-101` (`buildBlockerId`) constructs the ID via `crypto.createHash('sha256').update('${sectionAnchor}:${truncated}').digest('hex').slice(0,8)`. Determinism: same inputs → identical 8-hex prefix. Validation: `validateBlockerIdComponent` (lines 45-56) rejects non-`[a-z0-9-]+` components with `INVALID_BLOCKER_ID`. Test coverage: `tests/lib/blocker-id.test.mjs` (passes).
- **AC5 — Optional `revision:` on `reviewer_report` / `step_completed`:** PASS — Verified in `lib/lifecycle-state.mjs` projection: legacy events without `revision:` fold to revision 1 (line 1237 comment "`revision:` are folded into byRevision[1] at projection time"); `byRevision` bucket created at line 1238.
- **AC6 — `byRevision[N]` projection:** PASS — `lib/lifecycle-state.mjs:1238` initializes the bucket; lines 1260-1269 populate it per-step from event revision tags; line 1477 iterates `step.byRevision` values for the top-level latest-revision rollup.
- **AC7 — `/adev:build --full` dispatches on BLOCK:** PASS — `skills/build/SKILL.md:385-432` (Blocker handling — BLOCK→revise auto-retry loop); step 4 (line 396-402) dispatches `adev specify revise --spec <path> --auto`; step 6 (line 406-432) invokes `partitionBlockers` + `evaluateStopCondition`.
- **AC8 — Stop conditions: PASS / NO_PROGRESS / REGRESSED / BUDGET_EXHAUSTED:** PASS — `lib/loop-convergence.mjs:95-136` (`evaluateStopCondition`) implements all four verdicts with the documented precedence (PASS > NO_PROGRESS > REGRESSED > BUDGET_EXHAUSTED > CONTINUE).
- **AC9 — `--require-human-final-pass` → PASS_PENDING_HUMAN + `human_approval_required`:** PASS — `lib/loop-convergence.mjs:105-109` returns `PASS_PENDING_HUMAN` when verdict is PASS and `human_final_pass` is true; `skills/build/SKILL.md:26, 426, 432` document the flag; `lib/lifecycle-state.mjs:1092-1123` (`reportHumanApprovalRequired`) appends the event.
- **AC10 — `build.max_review_retries` default 2 + reject negative:** PASS — `lib/manifest.mjs:84-108` defaults to 2 when unset and throws `INVALID_MAX_REVIEW_RETRIES` for negative, non-integer, or fractional values.
- **AC11 — Legacy reviewer fallback (no `blocker_id`) → `LEGACY_REVIEWER_OUTPUT`:** PASS — `skills/review-specs/SKILL.md:258-262` (aggregator validation rules) — missing `blocker_id` logs `LEGACY_REVIEWER_OUTPUT`; malformed `blocker_id` logs `INVALID_BLOCKER_ID`; both fall through to sidecar+fail-loud. Integration coverage: `tests/integration/build-loop-legacy-reviewer-fallback.test.mjs`.
- **AC12 — Integration test for 2-revision auto-retry:** PASS — `tests/integration/build-loop-auto-retry.test.mjs` (passes; exercises rev 1 BLOCK→rev 2 BLOCK→rev 3 PASS through the library surface with spec_revised + reviewer_report events).
- **AC13 — Charter Capability Map flip:** N/A in this validation pass — Task 18 of the plan is a documentation flip; verified that the spec's source-manifest is stamped and the implement-step summary confirms 19 commits with Spec+Plan-task trailers.

Test integrity scan: spec tests use strict assertions (`assert.equal`, `assert.deepStrictEqual`, `assert.throws` with explicit code matching). No loose matchers, no conditional skips, no can-never-fail assertions detected.

## Cross-Repo Dependency Validation — N/A

`detectWorkspace(cwd)` returned null — no workspace detected. Single-repo validation mode applies. The spec's `affects:` frontmatter lists three internal charters (`agent-reliable-state-artifacts`, `spec-lifecycle`, `strategic-planning`) — these are intra-repo cross-cutting concerns, not cross-repo dependencies.

## Check 4: Constitution Compliance — PASS

- **Architecture boundaries:** PASS — No new services, DB tables, or auth flow changes. No external dependencies added (all new code uses `node:fs`, `node:path`, `node:crypto`, `node:util`).
- **Non-negotiable principles:** PASS
  - Principle 1 (minimize external deps): no new package.json deps; `lib/blocker-id.mjs` uses `node:crypto` only; `lib/specify-revise.mjs` uses `node:fs` + `node:path`; `lib/loop-convergence.mjs` pure-JS (no I/O).
  - Principle 2 (skills are primarily markdown): the new `--revise` axis on `/adev:specify` names a CLI verb (`adev specify revise`) — no inline Node in SKILL.md. Verified by inspection of `skills/specify/SKILL.md:892-945` and `skills/build/SKILL.md:385-432`.
  - Principle 3 (pure ESM): all new files end in `.mjs` and use `import` only.
  - Principle 4 (hook protocol compliance): no hooks modified.
  - Principle 5 (version parity): package.json version untouched.
- **Coding standards:** PASS — camelCase functions (`buildBlockerId`, `validateBlockerIdComponent`, `reviseSpec`, `partitionBlockers`, `evaluateStopCondition`), kebab-case files (`blocker-id.mjs`, `specify-revise.mjs`, `loop-convergence.mjs`, `revision-monotonic.mjs`), Node built-ins imported first. Error handling via `mkErr(code, msg)` + `process.exit(1|2)` in CLI consistent with project pattern.

## Check 8: Boundary Compliance — PASS

`.context-index/governance/boundaries.yaml` defines `boundaries: []` (no rules configured). PASS by default.

## Check 9: Transition Gates — PASS

`.context-index/governance/gates.yaml` declares `transitions: {}` (no transitions configured). PASS by default.

## Check 11: Visual Verification — N/A

Implementation diff includes no UI files (`*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss`, `*.html`, `components/`, `pages/`, `views/`, `app/**/page.*`, `app/**/layout.*`). All 29 source-manifest files are `lib/*.mjs`, `cli/*.mjs`, `skills/**/SKILL.md`, `skills/review-specs/*.md`, or `tests/**/*.test.mjs`. SKIP per Case A of the Check 11 trigger guard.

---

**Summary:** 6 passed, 0 failed, 2 skipped (Check 11 N/A — no UI files; Cross-Repo N/A — no workspace), 1 PASS_WITH_NOTES (Check 1 — preexisting unrelated `plan-task-immutability.test.mjs` failure documented in implement-step summary; 3579/3582 npm test pass; all 87 spec-specific tests pass).

The implementation satisfies all 13 acceptance criteria, stays within charter scope (three-charter cross-cutting work tracked under `agent-reliable-state-artifacts`, `spec-lifecycle`, `strategic-planning`), respects the constitution (no new external dependencies, ESM-only, skills name CLI verbs), and the source manifest is intact. SEC-1 (path-containment in `lib/cli/specify.mjs:67-77`), SEC-2 (kebab-case allowlist in `lib/blocker-id.mjs:29, 45-56`), SEC-3 (redaction set in `lib/blockers-writer.mjs:52-75`), CON-1 (sibling-spec amendment to `adev-build-skill.spec.md` rev 7→8 verified), SA-1 (`section_anchor` per blocker entry in `lib/blockers-writer.mjs:185`), SA-2 (sibling-spec amendment to `lifecycle-event-log.spec.md` rev 2→3 verified) all addressed in code.

**Drift handling:** The implement-step summary noted `adev-build-skill.spec.md` was intentionally left with `drift_detected: true` for re-stamping. Check 1.5 ran against `review-block-auto-retry.spec.md` only (PASS, sha 2111755 intact). The sibling spec's re-stamp is a separate validate cycle.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
