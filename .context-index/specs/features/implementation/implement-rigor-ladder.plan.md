<!-- partial_schema: plan@1 -->

# Implementation Plan: Implement Rigor Ladder (lite / quick / full)

> **Methodology:** adev
> **Charter:** .context-index/specs/features/implementation/charter.md
> **Spec:** .context-index/specs/features/implementation/implement-rigor-ladder.spec.md (revision 4; Tasks 23–25 apply revision 4's changes)
> **Review:** PASS_WITH_NOTES (2026-11-26) — full tier, 5 reviewers, 0 blockers, 11 warnings, 7 suggestions
> **Platform:** Node.js (ESM, `.mjs`), zero new dependencies, `node:test`
> **Implementation mode:** tdd

**Goal:** Replace `/adev:implement`'s two-level review depth (`full | quick`) with a per-task three-level ladder in which `quick` is the reachable default, `full` is reached only through a floor leg or an explicit choice, and a new operator-authorized `lite` level runs route-eligible tasks inline with no per-task reviewer, guarded by a post-task tripwire.

**Architecture:** Every runtime decision lives in `lib/` and `adev implement` verbs, never in skill prose. `lib/governance/rigor-mode.mjs` gains the `lite` value, the implement `quick` fallback and strict policy validation. `lib/implement/review-depth.mjs` drops the quick-grant predicate, reshapes the floor legs, and gains `liteEligible`, `liteGrant`, `isTripwireExempt` and the final-pass tripwire. Its touched-file computation is extended to carry git modes and, for the tripwire's sensitive-path and boundary legs only, gitignored paths written since dispatch. A new `lib/implement/run-base.mjs` validates commit ids and reads the four governance inputs from the run-base commit. `lib/cli/implement.mjs` gains `check-flags` and `lite-report` and new flags on `resolve-depth` and `batches`. The implement skill keeps its body small (arguments, first-action `check-flags`, no-self-selection rule) and moves inline execution to a new `references/lite-mode.md` behind a `<ADEV_ROOT>` pointer. ADR 0020 records the decision.

**Charter note:** `.context-index/specs/features/implementation/charter.md` has no Capability Map table (also recorded in the review). Tasks trace to the charter's Key Behaviors (the per-task review the ladder thins) and Key Files (`skills/implement/SKILL.md`). Step 7 has no `Status` column to flip.

**Human-approval note (constitution, Architecture Boundaries):** This lowers the default review rigor for every adev project. The spec's System Constitution Reference routes that decision to ADR 0020 (status **Proposed**), which the operator approves. Tasks 15 (default preset values) and 19 (ADR acceptance) are marked **[REQUIRES HUMAN APPROVAL]**. The other tasks implement the proposed decision on this branch and must not merge before ADR 0020 is accepted.

**Sensitive paths touched (floor visibility):** `lib/governance/rigor-mode.mjs` (configured `lib/governance/**`), `lib/lifecycle-events.mjs` (configured, comment-only change in Task 3), and `.context-index/governance/risk-policies.yaml` (built-in `.context-index/governance/**`). Those tasks resolve `full` review depth under both today's resolver and the new one.

### Review-note coverage

The review passed with notes. Four warnings would become defects if the plan did not handle them, so each is pinned to a task and to a test:

| Note | Where handled | Test that pins it |
|---|---|---|
| **WR-8** — Stage 1's cap "escalates to the user" in `step-2-per-task-loop.md:322`; BEH-15 requires the Step 2g halt | Task 12 changes 2f so Stage 1's cap routes to the same halt (plan_task `blocked`, execution state `blocked`, no later task, no wait for input). Task 21 adds a Stage 1 non-convergence case to the BEH-15 fixture | `tests/skills/implement-rigor-ladder.test.mjs` (Stage 1 text), BEH-15 fixture in Task 21 |
| **RI-8** — `excludeOwnLifecycleLogTouch` must still apply before the BEH-7 exemption check | Task 5: the tripwire runs `excludeOwnLifecycleLogTouch` first, then exemption, then legs | `tests/lib/implement/review-depth-tripwire.test.mjs` "own lifecycle-log M touch does not trip" |
| **RI-7** — `computeTouchedFiles` returns only `{path, status}` | Task 5 switches it to `diff-tree --raw -z` and returns `{ path, status, mode, src_mode }` | `tests/lib/implement/review-depth-task-snapshot.test.mjs` symlink mode case |
| **BD-11** — gitignored sensitive writes bypass the tripwire | Task 5: the tripwire's sensitive-path and boundary legs (only those) also see gitignored untracked paths whose mtime is at or after the task's latest `plan_task` `in_progress` event | tripwire test "gitignored `.env` written by the task escalates to full" |

The other notes are handled as follows:

- **RI-6:** Task 6 validates commit ids with a hex regex (`^[0-9a-f]{40}$|^[0-9a-f]{64}$`, which also rules out a leading `-`) plus `git rev-parse --verify --end-of-options`. It emits `INVALID_COMMIT_ID` and does **not** reuse `assertSafeArgvToken`. The spec's Output Contract sentence naming that guard is corrected in Task 19's ADR/spec note.
- **RI-10:** `adev implement batches` gets `--lite` and `--run-base` only. No `--tier` flag is added (Task 9).
- **CON-4:** `templates/risk-tiers/prototype/risk-policies.yaml` is already `quick` at all three levels. Task 15 asserts it and does not modify it.
- **CON-1 / RI-9:** "`SKILL.md` unchanged" means only the do-not-double-emit rule text at `skills/implement/SKILL.md:73` (and `references/failure-path-exit-event.md:22`). Task 11 edits the body elsewhere, and its test asserts that paragraph is byte-identical.
- **CON-3:** the spec does not say which `source` an explicit `--tier quick` records. The plan records `policy-baseline` (the flag acts as the run's baseline) and lists the choice in Task 19's spec-amendment notes.
- **WR-6:** Task 18 adds a skill-text test asserting `skills/validate/SKILL.md` calls `adev implement lite-report`.
- **WR-7:** Task 12's test asserts `lite-mode.md` relays the `lite authorized via` line, the `lite_denied` summary and the `LITE_TRIPWIRE_ESCALATED` echo.
- **BD-13:** Task 6 validates that paths read at the run-base commit are repo-relative (no `..`, no leading `-`, not absolute). A routing sidecar that is not committed at `run_base` fails condition (b) for every task (`lite_denied: routing-scores`) and adds a `ROUTING_SIDECAR_MISSING` warning naming the run base. Quick/full resolution still reads the working-tree sidecar, so non-lite runs do not regress.
- **TR-6 / TR-7 / BD-12:** wording only. They are recorded in Task 19's notes for spec revision 4, and no code change is planned.

**Interpretation note (BEH-9 vs BEH-14):** `lite` tasks still run the 2h `post-task` governance gates, because BEH-14 says no hard gate is relaxed. BEH-9 adds a guaranteed whole-run constitution quality-gate run at Step 2-post whenever any task resolved `lite`, even when `gates.yaml` declares no `post-implement` gate. EV-1 measures the wall-clock cost.

---

## File Structure

**Create:**
- `lib/implement/run-base.mjs` — `validateCommitId(flag, value, { projectRoot, kinds })` (`INVALID_COMMIT_ID`), `assertRepoRelative(relPath)`, and `readAtCommit(projectRoot, sha, relPath)`, which returns the file text or `null` when the file is absent at that commit (`git cat-file -p <sha>:<path>` through argv, never a shell).
- `lib/cli/init-prompt-implement-rigor.mjs` — `adev init prompt implement-rigor [--mode lite|quick|full] [--preset prototype|standard|strict]`, modeled on `init-prompt-implementation-mode.mjs`.
- `skills/implement/references/lite-mode.md` — inline execution, `run_base` hand-off, tripwire, end-of-run gates, BEH-15 halt for an escalated task, the hard-gate list (BEH-14).
- `tests/lib/implement/review-depth-lite-grant.test.mjs` — the `liteEligible` and `liteGrant` truth tables (BEH-5).
- `tests/lib/implement/lite-eligible-parity.test.mjs` — the EV-4 parity table against route's documented "easy" rule.
- `tests/lib/implement/review-depth-tripwire.test.mjs` — `isTripwireExempt` rules and final-pass tripwire legs against temp git repos (BEH-7).
- `tests/lib/implement/run-base.test.mjs` — commit-id validation and `readAtCommit`.
- `tests/cli/implement-check-flags.test.mjs` — BEH-16 exits and output.
- `tests/cli/implement-lite-report.test.mjs` — BEH-10 counting window.
- `tests/cli/init-prompt-implement-rigor.test.mjs` — BEH-12 verb tests, including `cli/index.mjs` dispatch.
- `tests/skills/implement-rigor-ladder.test.mjs` — implement skill-text assertions (BEH-6, 8, 9, 13, 14, 15, 16; WR-7, WR-8, CON-1).
- `tests/skills/route-lite-eligible.test.mjs` — route summary line and `liteEligible` citation (BEH-13).
- `tests/skills/rigor-ladder-forwarding.test.mjs` — build/work/review-specs/validate forwarding and the validate `lite-report` call (BEH-10, BEH-11, WR-6).
- `tests/skills/init-implement-rigor-step.test.mjs` — the init reference step names the verb (BEH-12).
- `tests/risk-tiers/implement-mode-presets.test.mjs` — preset `implement_mode` values (standard → quick at every level, prototype unchanged, strict unchanged).
- `tests/specs/implement-rigor-ladder-amendments.test.mjs` — the four amendment files exist and carry the required clauses (BEH-4, BEH-6, BEH-14).
- `tests/docs/implement-rigor-ladder-docs.test.mjs` — doc coverage of the new verbs, flags and config.
- `tests/evals/implement-rigor-ladder/run-ab-eval.mjs` — EV-1 three-arm harness (`--arm full|quick|lite`, `--ref <git-ref>`, `--dry-run`).
- `tests/evals/implement-rigor-ladder/fixture/` — 6–8 task plan, spec, routing sidecar, seed source tree with four seeded-defect traps, one sensitive-path task, one tripwire-target task.
- `tests/evals/implement-rigor-ladder/fixture-nonconvergent/` — BEH-15 fixture: one escalated `lite` task whose review never converges, plus a Stage 1 (spec-compliance) non-convergence variant (WR-8).
- `tests/evals/implement-rigor-ladder/replay-distribution.mjs` — EV-5 deterministic replay over the repository's routing sidecars.
- `tests/evals/implement-rigor-ladder/replay-distribution.test.mjs` — replay determinism plus trip computation (runs under `npm run test:evals`).
- `tests/evals/implement-rigor-ladder/results/` — baseline and arm results, `distribution.json`.
- `tests/lib/evals/implement-rigor-ladder-smoke.test.mjs` — EV-1 `--dry-run` smoke test. It lives **outside** `tests/evals/` because `scripts/run-tests.mjs` routes everything under `tests/evals/` to `npm run test:evals`, and EV-4 requires the smoke test to run under `npm test`.
- `tests/lib/evals/plugin-eval-cases-rigor-ladder.test.mjs` — layout check for the three EV-3 case directories (runs under `npm test`).
- `evals/implement-no-self-selected-lite/`, `evals/implement-lite-refused-high-risk/`, `evals/init-offers-implement-rigor/` — EV-3 `claude plugin eval` cases (`case.yaml`, `prompt.md`, `fixture.sh`, `graders/`), following `evals/lifecycle-gate-respected/`.
- Four co-located amendments scaffolded by `adev specify amend` (`<N>` is the target revision the verb computes): `.context-index/specs/features/implementation/review-provenance-rev-<N>-lite-exemption.spec.md`, `batched-task-dispatch-rev-<N>-resolved-depth.spec.md`, `graduated-review-depth-rev-<N>-rigor-ladder.spec.md`, and `.context-index/specs/cross-cutting/graduated-rigor-tiers-rev-<N>-lite-tier.spec.md`.

**Modify:**
- `lib/governance/rigor-mode.mjs` — `RIGOR_MODES` gains `lite`. `resolveRigorMode` maps `lite` → `quick` for non-implement skills and falls back to `quick` for `implement`. `loadRigorPolicies` validates `review_mode`, `validate_mode` and `implement_mode` and throws on parse failure. It gains an exported `parseRigorPolicies(text, label)` so the run-base reader can reuse the validation.
- `lib/lifecycle-state.mjs:1461` — `REVIEW_DEPTHS` gains `lite`. The JSDoc at `:1476` and `:1491` is reworded off `predicate-grant`.
- `lib/lifecycle-events.mjs:90` — the comment naming "chain -> predicate-grant -> floor" is reworded (comment only).
- `lib/implement/review-depth.mjs` — grant inversion, floor-leg changes, `liteEligible`, `liteGrant`, `isTripwireExempt`, tripwire, `computeTouchedFiles` modes, ignored-path enumeration. The header comment is rewritten to describe the ladder.
- `lib/cli/test-policy.mjs:152-188` — `boundaryCrossingFor` and `loadConfiguredSensitivePaths` accept an optional `{ text }` override, so the run-base reader can pass committed text through the same parsing and degradation.
- `lib/cli/implement.mjs` — `check-flags` and `lite-report` subverbs. `resolve-depth` gains `--lite`, `--tier lite`, `--parallel` and `--run-base` (required on both passes), and accepts and ignores `--in-batch`. `batches` gains `--lite` and `--run-base`. Also `INVALID_COMMIT_ID`, and usage banners and `help()` listing `full|quick|lite`.
- `lib/implement/batching.mjs:64-195` — `resolveBatches` accepts `liteGranted: Set<taskId>`. Granted tasks never join a batch and are reported in `solo` with `reason: "lite"`.
- `lib/cli/governance.mjs:321-351, 779-791` — `dispatch --tier lite` dispatches `quick` and prints one mapping line. Usage banner updated.
- `lib/cli/route.mjs:110-116` — `emit-sidecar` output gains `lite_eligible: { count, total }`.
- `cli/index.mjs:2111-2115` — dispatch entry for `init prompt implement-rigor` beside `implementation-mode`.
- `skills/implement/SKILL.md` — Arguments (`--lite`, `--tier full|quick|lite`), a new Prerequisite 0 (`adev implement check-flags` before `adev gate require`), the no-self-selection rule, the Step 2 summary line pointing at `lite-mode.md`, and the Red Flags rewording. The do-not-double-emit paragraph (`:73`) is untouched.
- `skills/implement/references/steps/step-2-per-task-loop.md`:
  - `:5`: `batches --run-base [--lite]`.
  - `:68`: drop `--in-batch`; add `--run-base`, `--parallel` and `--lite`.
  - The mixed-plan ordering and the `lite-mode.md` pointer.
  - `:301-306`: the final pass gains `--run-base` and echoes `LITE_TRIPWIRE_ESCALATED`.
  - `:322`: Stage 1's cap routes to the Step 2g halt (WR-8).
- `skills/implement/graduated-review-depth.md` — rewritten for the ladder (baseline `quick`, floor legs, `lite` grant, tripwire, `source` values).
- `skills/implement/references/batched-mode.md` — a batched task is reviewed at its own resolved depth; `lite` tasks never batch.
- `skills/implement/references/integration-gate.md` — BEH-9 whole-run quality gates after any `lite` task, `QUALITY_GATES_FAILED`.
- `skills/implement/references/steps/step-3-final-review.md` — skipped only when every task resolved `lite`.
- `skills/implement/references/failure-path-exit-event.md` — adds the `QUALITY_GATES_FAILED` row to the enumerated abort table. Line 22 (the do-not-double-emit rule) is unchanged.
- `skills/route/SKILL.md:118` — replace the prose "easy" rule with a citation of `liteEligible`; print `lite-eligible: <count> of <total>` from `emit-sidecar` output.
- `skills/build/step4-tier-propagation.md`, `skills/build/SKILL.md` (Arguments) — forward `--lite`/`--tier lite` to implement as `--lite`, and `--tier lite` to review-specs/validate.
- `skills/work/SKILL.md:93-94` — the same forwarding, operator-typed only.
- `skills/review-specs/SKILL.md:38, 117` — accept `--tier lite` as `quick` with one printed line.
- `skills/validate/SKILL.md:35` and the Report Format section — `--tier lite` as `quick`; `adev implement lite-report` advisory.
- `skills/init/references/behavior-by-project-state.md` (after the implementation-mode step, `:746-748`) — a new implement-rigor step driven by the verb.
- `templates/risk-policies-template.yaml:20, 28` — `high` and `medium` `implement_mode: full` → `quick` (`low` is already `quick`).
- `.context-index/governance/risk-policies.yaml:20` — `high.implement_mode: full` → `quick` (`medium`/`low` are already `quick`), matching the standard template.
- Existing tests extended:
  - `tests/governance/rigor-mode.test.mjs`, `tests/governance/risk-policies-implement-mode.test.mjs`
  - `tests/lifecycle/review-depth-resolved-event.test.mjs`
  - `tests/cli/test-policy.test.mjs`, `tests/cli/implement-resolve-depth.test.mjs`, `tests/cli/implement-batches.test.mjs`, `tests/cli/governance-dispatch.test.mjs`, `tests/cli/route-emit-sidecar.test.mjs`
  - `tests/lib/implement/review-depth.test.mjs`, `tests/lib/implement/review-depth-task-snapshot.test.mjs`, `tests/lib/implement/batching.test.mjs`
  - `tests/skills/implement-graduated-review-depth.test.mjs`, `tests/skills/build-tier-propagation.test.mjs`
  - `tests/docs/implement-resolve-depth-docs.test.mjs`

  Assertions that encode retired behavior (`predicate-grant`, the `batched-task` leg, the `full` fallback, `--in-batch` in skill text) are rewritten to the new contract, not deleted.
- `tests/evals/comparison/run-comparison.mjs` — `adev-quick` and `adev-lite` arms; time per arm in the summary.
- `.context-index/adrs/0020-implement-rigor-ladder.md` — Status Proposed → Accepted (Task 19, human approval).
- `docs/skill-reference.md`, `docs/cli-reference.md`, `docs/configuration.md`, `docs/concepts.md`.
- `providers/codex/skills/**` — regenerated by `node scripts/sync-provider-skills.mjs` (never hand-edited).

**Reference (read, do not modify):**
- `lib/implement/review-depth.mjs:36-51` (`validateScores`) — reused by `liteEligible`; do not duplicate the range check.
- `lib/implement/review-depth.mjs:180-207` (`excludeOwnLifecycleLogTouch`) — kept verbatim and called before the exemption check (RI-8).
- `lib/loop-convergence.mjs` — `evaluateStopCondition`. The Stage 1 cap in Task 12 reuses the 2g verdict table and does not invent a new loop.
- `lib/plan-routing-sidecar.mjs` — `readRoutingSidecar`, `lookupRoutingEntry`, `sidecarPathFor`. Task 6 adds a text-based entry parse through the same validation, without changing the sidecar schema.
- `lib/cli/init-prompt-implementation-mode.mjs` — the readline async-iterator pattern, splice-preserving write, enum-constant write (BEH-12 model).
- `tests/evals/batched-task-dispatch/run-ab-eval.mjs`, `lib/parallel/eval/divergence.mjs`, `lib/parallel/eval/report.mjs` — EV-1 reuse, never reimplement.
- `evals/lifecycle-gate-respected/` — EV-3 case layout.
- `.context-index/governance/sensitive-paths.yaml`, `.context-index/governance/boundaries.yaml` — live governance inputs. Note that `boundaryCrossingFor` matches rule `pattern` regexes against **path strings**.
- `.context-index/adrs/0020-implement-rigor-ladder.md` — decision and accepted-risk residual (BD-12).

## Context Packets

Every packet also includes the spec's Invocation Modes, Arguments and Naming paragraphs, the constitution's Non-Negotiable Principles and Anti-Patterns, and the four heuristics listed below. The spec has no `source-manifest`, so primary files come from the File Structure above.

### Task 1 Context
- Spec: EV-1 and EV-4 (smoke test); Actionable Task Map T0.
- Source: `tests/evals/batched-task-dispatch/run-ab-eval.mjs` (full read: arm plan, `--dry-run`, judge/report adapter), `tests/evals/batched-task-dispatch/fixture/` (layout), `scripts/run-tests.mjs:89-170` (the eval/live-infra split that forces the smoke test's location).
- Heuristic: "Use session JSONL for token measurement, not file-size estimates".

### Task 2 Context
- Spec: BEH-1, BEH-2, BEH-16 (policy validation); Output Contract `rigor-mode.mjs`, "Affected callers"; Failure Modes rows 2–3.
- Source: `lib/governance/rigor-mode.mjs` (full); `lib/lifecycle-state.mjs:1455-1540` (`REVIEW_DEPTHS`, `reportReviewDepthResolved`); `lib/cli/test-policy.mjs:270-290` (the `loadRigorPolicies` caller); `tests/governance/rigor-mode.test.mjs` (signatures).
- Cross-cutting: `.context-index/specs/cross-cutting/graduated-rigor-tiers.spec.md` (precedence chain).

### Task 3 Context
- Spec: BEH-2, BEH-3, BEH-4; AC BEH-3/BEH-4.
- Source: `lib/implement/review-depth.mjs` (full); `tests/lib/implement/review-depth.test.mjs` (signatures plus the cases encoding `predicate-grant`, `batched-task` and the `full` fallback, which are rewritten); `lib/cli/test-policy.mjs:140-188`.
- ADR: `0020-implement-rigor-ladder.md` (decision, calibration).

### Task 4 Context
- Spec: BEH-5 (a)–(d), `lite_denied`/`lite_source`; BEH-13 (`liteEligible` as single definition); AC BEH-5, EV-4 parity.
- Source: `lib/implement/review-depth.mjs:30-75`; `skills/route/SKILL.md:105-120` (scoring scale and "easy" rule — the parity table's oracle).

### Task 5 Context
- Spec: BEH-7 (complete), Failure Modes rows "lite task touches…"; AC BEH-7.
- Review: RI-7, RI-8, BD-11 (`implement-rigor-ladder.review.md`).
- Source: `lib/implement/review-depth.mjs:76-260` (`snapshotWorkingTree`, `computeTouchedFiles`, `excludeOwnLifecycleLogTouch`, `resolveFloor`); `tests/lib/implement/review-depth-task-snapshot.test.mjs`; `lib/test-strategies/sensitive-paths.mjs` (`effectiveSensitivePaths`); `lib/lifecycle-state.mjs:2831` (`filterEvents`).

### Task 6 Context
- Spec: Arguments "Commit-id arguments", BEH-5 last paragraph (run-base reads); AC BEH-16 bullet 3.
- Review: RI-6, BD-13.
- Source: `lib/cli/test-policy.mjs:140-188`; `lib/plan-routing-sidecar.mjs` (parse/validate path); `lib/governance/rigor-mode.mjs` (after Task 2).

### Task 7 Context
- Spec: BEH-16 (complete), BEH-5 (`lite authorized via` line), BEH-8 (`LITE_SUPPRESSED_PARALLEL`); AC BEH-16.
- Source: `lib/cli/implement.mjs:1-90` (header, `run` switch, USAGE); `lib/amendment-graph.mjs` (`parseFrontmatterFields`); `lib/implement/run-base.mjs` (Task 6).

### Task 8 Context
- Spec: Arguments table rows `--lite`, `--tier lite`, `--run-base`, `--base-sha`, `--parallel`, `--in-batch`; BEH-5, BEH-7 (verb output); Output Contract `lib/cli/implement.mjs`; AC BEH-5 CLI bullets, BEH-7, BEH-16 bullet 3.
- Source: `lib/cli/implement.mjs:382-560` (`cmdResolveDepth`); `tests/cli/implement-resolve-depth.test.mjs` (fixtures, temp-git helpers).

### Task 9 Context
- Spec: BEH-8; AC BEH-8; review RI-10.
- Source: `lib/cli/implement.mjs:168-325` (`cmdBatches`); `lib/implement/batching.mjs` (full); `tests/lib/implement/batching.test.mjs`, `tests/cli/implement-batches.test.mjs` (signatures).

### Task 10 Context
- Spec: BEH-10; AC BEH-10.
- Source: `lib/lifecycle-state.mjs:870-900` (`lifecycle_step` event shape), `:2021` (`readEvents`), `:2831` (`filterEvents`).

### Task 11 Context
- Spec: Output Contract "Skill and template changes / skills/implement/" (body bullets), BEH-13, BEH-16 (first action); review CON-1.
- Source: `skills/implement/SKILL.md` (full); `tests/skills/implement-step-pointers.test.mjs` and `tests/skills/skill-size-cap.test.mjs` (constraints the body must keep passing); `tests/skills-extension-coverage.test.mjs`.

### Task 12 Context
- Spec: BEH-6, BEH-7 (orchestrator side), BEH-8, BEH-14, BEH-15; AC BEH-6, BEH-14, BEH-15.
- Review: WR-7, WR-8.
- Source: `skills/implement/references/steps/step-2-per-task-loop.md` (full), `agent-default-mandate.md`, `test-integrity.md`; `tests/skills/implement-graduated-review-depth.test.mjs`.

### Task 13 Context
- Spec: BEH-4 (batched tasks at their resolved depth), BEH-9, BEH-13; AC BEH-9; review CON-1.
- Source: `skills/implement/graduated-review-depth.md`, `skills/implement/references/batched-mode.md`, `integration-gate.md`, `steps/step-3-final-review.md`, `failure-path-exit-event.md`.

### Task 14 Context
- Spec: BEH-12 (complete); AC BEH-12; Failure Modes rows for `init prompt implement-rigor`.
- Source: `lib/cli/init-prompt-implementation-mode.mjs` (full), `tests/cli/init-prompt-implementation-mode.test.mjs` (signatures, scripted-stdin helper), `cli/index.mjs:2095-2120`, `skills/init/references/behavior-by-project-state.md:720-750`.

### Task 15 Context
- Spec: Output Contract "Templates"; review CON-4.
- Source: `templates/risk-policies-template.yaml`, `templates/risk-tiers/{prototype,strict}/risk-policies.yaml`, `.context-index/governance/risk-policies.yaml`, `tests/governance/risk-policies-implement-mode.test.mjs`, `tests/risk-tiers/tier-config.test.mjs` (signatures).

### Task 16 Context
- Spec: BEH-13; Output Contract `lib/cli/route.mjs`, `skills/route/`.
- Source: `lib/cli/route.mjs` (full), `skills/route/SKILL.md:100-140`, `tests/cli/route-emit-sidecar.test.mjs`.

### Task 17 Context
- Spec: BEH-1 (governance dispatch), BEH-11; AC BEH-11.
- Source: `lib/cli/governance.mjs:315-400, 775-795`, `lib/governance/dispatch-plan.mjs` (the `tier` field); `skills/build/step4-tier-propagation.md`, `skills/build/SKILL.md` (Arguments, `:141`), `skills/work/SKILL.md:85-100`, `skills/review-specs/SKILL.md:30-45, 110-125`; `tests/skills/build-tier-propagation.test.mjs`, `tests/cli/governance-dispatch.test.mjs`.

### Task 18 Context
- Spec: BEH-10 (validate side), BEH-11 (validate); AC BEH-10. Review WR-6.
- Source: `skills/validate/SKILL.md:29-60, 145-200`; the `lite-report` output from Task 10.

### Task 19 Context
- Spec: Output Contract "Cross-spec amendments" table, BEH-4, BEH-6, BEH-14.
- Source: the four base specs (`review-provenance.spec.md` Contract A, `batched-task-dispatch.spec.md` C.3, `graduated-review-depth.spec.md` B/E, `graduated-rigor-tiers.spec.md` invariant); `adev specify amend --help`; `.context-index/specs/cross-cutting/spec-amendment-artifacts.spec.md`.

### Task 20 Context
- Spec: Output Contract "Docs"; AC BEH-13 grep criterion.
- Source: `docs/README.md`, `docs/cli-reference.md` (the `adev implement` section), `docs/skill-reference.md` (implement, route, init, build), `docs/configuration.md` (risk policies), `docs/concepts.md`; `scripts/sync-provider-skills.mjs`.
- Heuristic: "A universal coverage claim must ship with the predicate that checks it" (scope the BEH-13 grep to `skills/ providers/ docs/`).

### Task 21 Context
- Spec: EV-1 (quick and lite arms, thresholds), EV-5, BEH-15 AC fixture runs.
- Source: Task 1's harness; `lib/implement/review-depth.mjs` (shipped resolver, imported by the replay); the 70+ `*.routing.json` sidecars under `.context-index/specs/`; `git log --format=%H%n%B` trailer parsing precedent in `lib/` (search `Plan-task:`).

### Task 22 Context
- Spec: EV-2, EV-3; AC EV-1–EV-5.
- Source: `tests/evals/comparison/run-comparison.mjs`, `tests/evals/comparison/reports/summary.json`, `evals/README.md`, `evals/lifecycle-gate-respected/`.
- Heuristics: "Use session JSONL for token measurement"; "Cache reads are 71% of session cost".

### Task 23 Context
- Spec: BEH-4 (the lite cap), BEH-5 (b), BEH-7, BEH-13, Revision 4 subsection; ADR 0020 "Amendment: revision 4".
- Source: `lib/implement/review-depth.mjs` (`liteEligible`, `liteGrant`, `resolveFloor`, `liteTripwire`), `lib/implement/provisional-inputs.mjs`, `tests/evals/implement-rigor-ladder/run-ab-eval.mjs` `classifyTasks`.

### Task 24 Context
- Spec: BEH-17, BEH-6.
- Source: `lib/cli/implement.mjs` (`cmdResolveDepth`, `cmdSnapshotBase`), `lib/execution-state.mjs`, `skills/implement/references/lite-mode.md`, `skills/implement/SKILL.md` Step 2.

### Task 25 Context
- Spec: EV-1, Revision 4 subsection.
- Source: `tests/evals/implement-rigor-ladder/run-ab-eval.mjs`, `judge-runs.mjs`.

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: A universal coverage claim must ship with the predicate that checks it (confidence: medium)
- **Pattern:** When closing a coverage gap in a spec or acceptance criterion, state the executable check alongside the claim — the exact command or match, and the paths it runs over. Scope it to live surfaces (skills/, providers/, docs/) and exclude directories that archive review and validate artifacts, since those necessarily quote the pattern being forbidden. Match on the meaningful component rather than an exact string, so equivalent forms (absolute vs repo-relative) are both caught.
- **Anti-pattern:** Answer a repeatedly-missed surface by widening the assertion — "no occurrence anywhere in the repository". An unbounded universal followed by a bounded list of examples cannot be discharged, and reads as coverage while providing none.
- **Evidence:** 1 observations

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption or cost of adev skills, parse real session JSONL files from ~/.claude/projects/ (message.usage fields: input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens). Dispatch paired A/B subagents and compare their JSONL data for controlled experiments.
- **Anti-pattern:** Estimate tokens using bytes/4 or hardcoded assumptions about thinking budgets and cache hit rates.
- **Evidence:** 1 observations

### Heuristic: Cache reads are 71% of session cost — minimize context accumulation (confidence: medium)
- **Pattern:** When optimizing token cost, focus on reducing what accumulates in conversation context (output echoes, artifact dumps, verbose subagent returns).
- **Anti-pattern:** Focus on reducing input token counts (SKILL.md sizes, context packets).
- **Evidence:** 1 observations

### Heuristic: Summarized skill output produces equivalent artifact quality (confidence: medium)
- **Pattern:** When a skill writes an artifact to disk, instruct it to return only a structured summary to the conversation.
- **Anti-pattern:** Assume that shorter output means lower quality artifacts.
- **Evidence:** 1 observations

The third heuristic bears directly on `lite`, which keeps every inline task's tool output in the orchestrator's context. `lite-mode.md` (Task 12) tells the orchestrator to keep inline-task narration terse, and EV-1 measures cache-read tokens per arm.

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8 → Task 9 → Task 10 → Task 16 → Task 17 → Task 18 → Task 15 → Task 11 → Task 12 → Task 13 → Task 19 → Task 21 → Task 22
- Group B (independent): Task 14

Group A is one chain because most of it shares `lib/implement/review-depth.mjs` and `lib/cli/implement.mjs`, and the skill-text tasks depend on the verb contract those tasks define. Task 14 touches only `cli/index.mjs`, the new verb file, its test and the init reference, so it can run beside Group A. Task 20 (docs plus regeneration of the provider mirror of every skill) runs alone after both groups finish. It reads every skill file the other tasks edit, so it must be last.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | EV-1 harness, fixture, smoke test, `main` full-arm baseline | medium | unit | — | 5 create, 0 modify |
| 2 | Rigor-mode `lite`, implement `quick` fallback, policy validation | small | unit | — | 0 create, 5 modify |
| 3 | Review-depth grant inversion and floor legs | medium | unit | Task 2 | 0 create, 4 modify |
| 4 | `liteEligible`, `liteGrant` and the resolver's `lite` path | medium | unit | Task 3 | 2 create, 1 modify |
| 5 | Touched-file modes, `isTripwireExempt`, ignored-path enumeration, final-pass tripwire | medium | unit | Task 4 | 1 create, 2 modify |
| 6 | Run-base governance reader and commit-id validation | medium | unit | Task 2 | 2 create, 3 modify |
| 7 | `adev implement check-flags` | small | unit | Task 6 | 1 create, 1 modify |
| 8 | `adev implement resolve-depth` ladder flags and output | medium | unit | Task 5, Task 6, Task 7 | 0 create, 2 modify |
| 9 | `adev implement batches --lite --run-base` and lite batch exclusion | small | unit | Task 4, Task 6 | 0 create, 4 modify |
| 10 | `adev implement lite-report` | small | unit | Task 2 | 1 create, 1 modify |
| 11 | Implement SKILL.md body: arguments, first-action `check-flags`, no-self-selection, Red Flags | small | unit | Task 7 | 1 create, 1 modify |
| 12 | Implement references: `lite-mode.md` and the Step 2 loop (incl. WR-8) | large | unit | Task 8, Task 9, Task 10, Task 11 | 1 create, 3 modify |
| 13 | Implement references: depth contract, batched mode, end-of-run gates | medium | unit | Task 12 | 0 create, 6 modify |
| 14 | `adev init prompt implement-rigor` verb, dispatch, init step | medium | unit | — | 3 create, 2 modify |
| 15 | Preset templates and this repo's risk policy [REQUIRES HUMAN APPROVAL] | small | unit | Task 2 | 1 create, 3 modify |
| 16 | Route `lite_eligible` output and summary line | small | unit | Task 4 | 1 create, 3 modify |
| 17 | Tier forwarding: governance dispatch, build, work, review-specs | small | unit | Task 2 | 1 create, 7 modify |
| 18 | Validate `--tier lite` and the `lite-report` advisory | small | unit | Task 10, Task 17 | 0 create, 2 modify |
| 19 | Cross-spec amendments and ADR 0020 acceptance [REQUIRES HUMAN APPROVAL] | medium | unit | Task 13 | 5 create, 1 modify |
| 20 | Docs and provider-mirror regeneration | medium | unit | every other task | 1 create, 5 modify + mirrors |
| 21 | EV-1 quick/lite arms, BEH-15 non-convergence fixture, EV-5 replay | large | unit | Task 13 | 5 create, 1 modify |
| 22 | EV-2 comparison arms, EV-3 plugin eval cases, run all evals, commit results | medium | unit | Task 21 | 4 create, 2 modify |

The file counts include test files. No task touches more than 5 non-test files. Task 20's regenerated mirrors are mechanical output of one script.

Every task resolved to `unit` (`adev test-policy strategy`, source `detected`, confidence `high`), so no Strategy Summary or Test Infrastructure Requirements section is emitted. The spec has no `infra_requirements:`. EV-1, EV-2 and EV-3 make live model calls, but they run as `[live]` harness steps under operator control rather than as test infrastructure. Test granularity is `per-behavior` (manifest): tasks that implement the same behavior extend one suite and do not create parallel ones.

---

## Tasks

Every commit carries these trailers (shown once here, abbreviated as `<trailers N>` below):

```
Spec: .context-index/specs/features/implementation/implement-rigor-ladder.spec.md
Plan-task: <N>
```

Branch: `spec/implementation/implement-rigor-ladder` (already checked out; never `main`). Test command: `node --test <file>` per task, `npm test` for the full suite.

### Task 1: EV-1 harness, fixture, smoke test and `main` full-arm baseline [specialist: none]

**Charter capability:** Key Behaviors — measured review cost of `/adev:implement` (EV-1 baseline before behavior changes, T0)
**Strategy:** unit (source: detected, confidence: high)
**Files:**
- Create: `tests/evals/implement-rigor-ladder/run-ab-eval.mjs`
- Create: `tests/evals/implement-rigor-ladder/fixture/` (`example.spec.md`, `example.plan.md`, `example.routing.json`, `seed/` source tree, `README.md` describing each seeded defect)
- Create: `tests/evals/implement-rigor-ladder/results/.gitkeep`
- Create: `tests/evals/implement-rigor-ladder/results/baseline-main-<date>.json` (live step)
- Test: `tests/lib/evals/implement-rigor-ladder-smoke.test.mjs`

**Tests:** `tests/lib/evals/implement-rigor-ladder-smoke.test.mjs` — create (EV-1/EV-4 smoke suite).

**Context to load:** Task 1 packet.

The harness defines three arms by the flags they pass to `/adev:implement`: `full` → `--tier full`, `quick` → none, `lite` → `--lite`. This task only has to make `--arm full` runnable live. `quick` and `lite` print in `--dry-run` but exit with `ARM_NOT_YET_AVAILABLE` live until Task 21 enables them. `--ref <git-ref>` (default `HEAD`) runs the arm against a throwaway `git worktree add --detach` of that ref, so the baseline can be recorded against `main` at any point in this plan. That satisfies T0's "before behavior changes" without ordering every other task behind a live run.

The fixture is a 7-task plan:
- 3 tasks lite-eligible (auto-agent, every score ≥ 0.6);
- 1 `assisted-agent` task;
- 1 task with a score of 0.4;
- 1 sensitive-path task (writes `src/auth/token.mjs`);
- 1 tripwire-target task, whose correct implementation must also edit an undeclared `src/registry.mjs`.

Four seeded-defect traps, each documented in `fixture/README.md` with the test that exposes it:
- a missed error case;
- an off-by-one boundary;
- an untested branch;
- a spec-noncompliant output shape.

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const HARNESS = join(import.meta.dirname, '../../evals/implement-rigor-ladder/run-ab-eval.mjs');

test('EV-1 --dry-run prints all three arms and writes nothing', () => {
  const out = execFileSync('node', [HARNESS, '--dry-run'], { encoding: 'utf8' });
  const plan = JSON.parse(out);
  assert.deepEqual(plan.arms.map((a) => a.id), ['full', 'quick', 'lite']);
  assert.deepEqual(plan.arms.find((a) => a.id === 'lite').implementArgs, ['--lite']);
  assert.deepEqual(plan.arms.find((a) => a.id === 'full').implementArgs, ['--tier full']);
  assert.equal(plan.writes.length, 0);
});

test('fixture mixes eligible and ineligible tasks and names its traps', () => {
  const plan = JSON.parse(execFileSync('node', [HARNESS, '--dry-run'], { encoding: 'utf8' }));
  assert.ok(plan.fixture.tasks >= 6 && plan.fixture.tasks <= 8);
  assert.ok(plan.fixture.liteEligible >= 1 && plan.fixture.liteIneligible >= 1);
  assert.ok(plan.fixture.sensitivePathTask);
  assert.ok(plan.fixture.tripwireTargetTask);
  assert.equal(plan.fixture.seededDefects.length, 4);
});

test('reuses the parallel-eval judge and report helpers', () => {
  const plan = JSON.parse(execFileSync('node', [HARNESS, '--dry-run'], { encoding: 'utf8' }));
  assert.deepEqual(plan.reuses.sort(), ['lib/parallel/eval/divergence.mjs#judge', 'lib/parallel/eval/report.mjs#renderReport']);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/implement-rigor-ladder-smoke.test.mjs`
Expected: FAIL — `Cannot find module .../run-ab-eval.mjs`

- [ ] **Implement**

Build `run-ab-eval.mjs` on the batched-task-dispatch harness's structure. Import `judge` and `renderReport` rather than copying them. The `--dry-run` JSON carries `arms`, `fixture` (counts derived by reading the fixture plan and sidecar, never hard-coded), `metrics` (`wall_clock_ms` from lifecycle event timestamps; `agent_dispatches`; `tokens` from session JSONL `message.usage` — `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`; `quality_gates`; and per-defect `caught_at: implement|validate|escaped`), `reuses` and `writes: []`. Live mode writes `results/<arm>-<ref-short>-<iso>.json`.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/implement-rigor-ladder-smoke.test.mjs`
Expected: PASS

- [ ] **Record the `main` baseline (live, operator checkpoint)**

Run: `node tests/evals/implement-rigor-ladder/run-ab-eval.mjs --arm full --ref main --runs 3`
Expected: three `results/full-<sha>-*.json` files, each with quality gates passing. This step makes live model calls. Present the cost estimate to the operator and run it on approval. If the operator defers it, commit the harness without results and record the deferral in the task report. Task 21 cannot compute EV-1 thresholds until the baseline exists.

- [ ] **Commit**

```bash
git add tests/evals/implement-rigor-ladder tests/lib/evals/implement-rigor-ladder-smoke.test.mjs
git commit -m "test(implementation): add EV-1 rigor-ladder harness and main baseline" -m "<trailers 1>"
```

### Task 2: Rigor-mode `lite`, implement `quick` fallback, policy validation [specialist: none]

**Charter capability:** Key Behaviors — graduated rigor tiers (BEH-1, BEH-2, BEH-16 policy validation)
**Strategy:** unit (source: detected, confidence: high)
**Files:**
- Modify: `lib/governance/rigor-mode.mjs:14-100`
- Modify: `lib/lifecycle-state.mjs:1461, 1476, 1491`
- Test: `tests/governance/rigor-mode.test.mjs` (extend)
- Test: `tests/lifecycle/review-depth-resolved-event.test.mjs` (extend)
- Test: `tests/cli/test-policy.test.mjs` (extend)

**Tests:** extend `tests/governance/rigor-mode.test.mjs` (BEH-1/BEH-2/BEH-16-policy suite); extend `tests/lifecycle/review-depth-resolved-event.test.mjs` (`depth: lite` accepted); extend `tests/cli/test-policy.test.mjs` (`adev test-policy resolve` fails with `INVALID_TIER`).

**Context to load:** Task 2 packet.

- [ ] **Write failing test**

```javascript
// tests/governance/rigor-mode.test.mjs (additions)
test('lite is a legal tier', () => {
  assert.deepEqual([...RIGOR_MODES], ['full', 'quick', 'lite']);
  assert.equal(isValidTier('lite'), true);
  assert.throws(() => resolveRigorMode({ skill: 'validate', tierOverride: 'Lite' }), { code: 'INVALID_TIER' });
});

test('non-implement skills map lite to quick; implement keeps lite', () => {
  for (const skill of ['review-specs', 'validate']) {
    assert.equal(resolveRigorMode({ skill, tierOverride: 'lite' }), 'quick');
    assert.equal(resolveRigorMode({ skill, riskLevel: 'medium', policies: { medium: { review_mode: 'lite', validate_mode: 'lite' } } }), 'quick');
  }
  assert.equal(resolveRigorMode({ skill: 'implement', tierOverride: 'lite' }), 'lite');
});

test('implement falls back to quick; review-specs and validate still fall back to full', () => {
  assert.equal(resolveRigorMode({ skill: 'implement', riskLevel: 'medium', policies: null }), 'quick');
  assert.equal(resolveRigorMode({ skill: 'review-specs', riskLevel: 'medium', policies: null }), 'full');
  assert.equal(resolveRigorMode({ skill: 'validate', riskLevel: 'medium', policies: null }), 'full');
});

test('loadRigorPolicies rejects bad mode values, unparseable files, and high lite', (t) => {
  const root = createTempDir(); t.after(() => cleanupTempDir(root));
  const write = (body) => writeFixture(root, '.context-index/governance/risk-policies.yaml', body);
  write('policies:\n  medium:\n    implement_mode: bogus\n');
  assert.throws(() => loadRigorPolicies(root), (e) => e.code === 'INVALID_TIER' && /medium/.test(e.message) && /risk-policies\.yaml/.test(e.message));
  write('policies:\n  medium:\n    review_mode: [\n');
  assert.throws(() => loadRigorPolicies(root), { code: 'INVALID_TIER' });
  write('policies:\n  high:\n    implement_mode: lite\n');
  assert.throws(() => loadRigorPolicies(root), { code: 'LITE_NOT_ALLOWED_FOR_HIGH' });
  write('policies:\n  medium:\n    implement_mode: lite\n  low:\n    implement_mode: lite\n');
  assert.equal(loadRigorPolicies(root).medium.implement_mode, 'lite');
});

test('parseRigorPolicies is the shared validator', () => {
  assert.throws(() => parseRigorPolicies('policies:\n  low:\n    validate_mode: nope\n', 'run-base:abc'), (e) => e.code === 'INVALID_TIER' && /run-base:abc/.test(e.message));
});
```

```javascript
// tests/lifecycle/review-depth-resolved-event.test.mjs (addition)
test('depth: lite is accepted and passes the event schema', (t) => {
  // reportReviewDepthResolved(... { depth: 'lite', source: 'lite-grant', ... }) writes one event;
  // validating the log with the diagnostics rule adev/event-schema-valid reports no finding.
});
```

```javascript
// tests/cli/test-policy.test.mjs (addition)
test('test-policy resolve fails with INVALID_TIER on a malformed implement_mode', (t) => {
  // fixture risk-policies.yaml with medium.implement_mode: bogus; run the CLI; assert exit 1 and stderr /INVALID_TIER/
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/rigor-mode.test.mjs tests/lifecycle/review-depth-resolved-event.test.mjs tests/cli/test-policy.test.mjs`
Expected: FAIL — `RIGOR_MODES` lacks `lite`; `parseRigorPolicies` is not exported; `reportReviewDepthResolved depth must be one of full|quick`

- [ ] **Implement**

- `RIGOR_MODES = Object.freeze(["full", "quick", "lite"])`. `InvalidTierError` accepts an optional `{ file, level, field }` context so the message names them.
- `parseRigorPolicies(text, label)`:
  - A parse error throws `INVALID_TIER` naming `label`. Today's code returns `null` here; that is replaced.
  - Any present `review_mode`, `validate_mode` or `implement_mode` outside `RIGOR_MODES` throws `INVALID_TIER` naming the file and level.
  - `high.implement_mode === 'lite'` throws a coded `LITE_NOT_ALLOWED_FOR_HIGH`.
  - The existing `test_depth` check (`INVALID_TEST_DEPTH`) is kept.
- `loadRigorPolicies(projectRoot)` still returns `null` for an absent file. Otherwise it delegates to `parseRigorPolicies`.
- `resolveRigorMode`:
  - After resolving the value, return `quick` when the value is `lite` and `skill !== "implement"`.
  - The implement fallback is `quick`. Every other skill's fallback stays `full`.
  - Update the header comment and the JSDoc precedence list. They state constraints, not history.
- `lib/lifecycle-state.mjs`: `REVIEW_DEPTHS = new Set(['full', 'quick', 'lite'])`. Update the JSDoc `@param {"full"|"quick"|"lite"}` and reword "chain -> predicate-grant -> floor" to "baseline -> lite grant -> floor".
- `lib/cli/test-policy.mjs` needs no code change. Its existing `loadRigorPolicies(projectRoot) ?? {}` now propagates the throw. Confirm the verb's error handler prints the code and exits 1, and add a catch only if it does not.

- [ ] **Verify test passes**

Run: `node --test tests/governance/rigor-mode.test.mjs tests/lifecycle/review-depth-resolved-event.test.mjs tests/cli/test-policy.test.mjs tests/governance/risk-policies-implement-mode.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/governance/rigor-mode.mjs lib/lifecycle-state.mjs tests/governance/rigor-mode.test.mjs tests/lifecycle/review-depth-resolved-event.test.mjs tests/cli/test-policy.test.mjs
git commit -m "feat(implementation): add lite rigor tier and validate risk-policy modes" -m "<trailers 2>"
```

### Task 3: Review-depth grant inversion and floor legs [specialist: none]

**Charter capability:** Key Behaviors — per-task review depth (BEH-2, BEH-3, BEH-4)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `lib/implement/review-depth.mjs:1-375`
- Modify: `lib/lifecycle-events.mjs:90` (comment only)
- Test: `tests/lib/implement/review-depth.test.mjs` (extend and rewrite the cases encoding retired behavior)
- Test: `tests/cli/implement-resolve-depth.test.mjs` (update expectations that change with the new fallback; flags come in Task 8)

**Tests:** extend `tests/lib/implement/review-depth.test.mjs` (BEH-3/BEH-4 suite).

**Context to load:** Task 3 packet.

- [ ] **Write failing test**

```javascript
// tests/lib/implement/review-depth.test.mjs
const base = { spec: { risk_level: 'medium', specPath: SPEC }, policies: {}, task: { id: '1', declared_files: ['lib/a.mjs'] } };
const auto = { selected_agent: 'auto-agent', scores: { spec_completeness: 0.8, pattern_coverage: 0.8, blast_radius: 0.8, novelty: 0.8 } };

test('no policy and no tier resolves quick with source default-quick', () => {
  const r = resolveImplementReviewDepth({ ...base, routingEntry: auto, pass: 'provisional' });
  assert.equal(r.depth, 'quick'); assert.equal(r.source, 'default-quick');
});

test('editing a declared file, a batched task, an assisted-agent task resolve quick', () => {
  for (const routingEntry of [auto, { ...auto, selected_agent: 'assisted-agent' }]) {
    const r = resolveImplementReviewDepth({ ...base, routingEntry, task: { ...base.task, additive_only: false, in_batch: true }, pass: 'provisional' });
    assert.equal(r.depth, 'quick'); assert.deepEqual(r.floor_legs, []);
  }
});

test('high-risk: auto-agent resolves quick, assisted-agent resolves full via risk-level', () => {
  const spec = { ...base.spec, risk_level: 'high' };
  assert.equal(resolveImplementReviewDepth({ ...base, spec, routingEntry: auto, pass: 'provisional' }).depth, 'quick');
  const r = resolveImplementReviewDepth({ ...base, spec, routingEntry: { ...auto, selected_agent: 'assisted-agent' }, pass: 'provisional' });
  assert.equal(r.depth, 'full'); assert.deepEqual(r.floor_legs, ['risk-level']);
});

test('human-only forces full via the routing leg', () => {
  const r = resolveImplementReviewDepth({ ...base, routingEntry: { ...auto, selected_agent: 'human-only' }, pass: 'provisional' });
  assert.deepEqual(r.floor_legs, ['routing']); assert.equal(r.depth, 'full');
});

test('sensitive declared path and boundary crossing force full; critical-finding only on final', () => { /* one assertion per leg */ });

test('final pass: undeclared non-sensitive touch no longer forces full (scope-mismatch retired from the floor)', (t) => {
  // temp git repo; snapshot; write lib/undeclared.mjs; resolve final with baseSha
  // assert depth 'quick', floor_legs excludes 'scope-mismatch' and 'batched-task'
});

test('final pass: touched sensitive or boundary path forces full even when undeclared', (t) => {
  // temp repo with sensitivePaths ['lib/governance/**']; write lib/governance/x.mjs; assert floor_legs includes 'sensitive-path'
  // boundaryCheck injected: (paths) => paths.includes('lib/b.mjs'); write lib/b.mjs; assert 'boundary'
});

test('explicit --tier quick records policy-baseline; --tier full stays absolute', () => { /* CON-3 decision */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/implement/review-depth.test.mjs`
Expected: FAIL — `source` is `policy-baseline` rather than `default-quick`, the depth is `full`, and `batched-task` appears in `floor_legs`

- [ ] **Implement**

- Delete `quickGrantPredicate` and `QUICK_GRANT_THRESHOLD`. Keep `validateScores` and `SCORE_DIMENSIONS`, which Task 4 reuses.
- Baseline:
  - `--tier full` returns `tier-full-absolute`, as today.
  - `--tier quick` gives `quick` with source `policy-baseline`.
  - Otherwise use the policy `implement_mode` for the risk level with source `policy-baseline`, where `lite` maps to the `quick` baseline (the lite grant is Task 4).
  - An absent policy value gives `quick` with source `default-quick`.
- `resolveFloor` legs:
  - `risk-level` when `risk_level === 'high' && routingEntry?.selected_agent !== 'auto-agent'`.
  - `routing` when `selected_agent === 'human-only'`.
  - `boundary` and `sensitive-path` on declared paths at both passes. On the final pass they are evaluated on every touched path as well.
  - `critical-finding` on the final pass only.
  - Remove `batched-task`. `task.in_batch` is now ignored.
  - Remove `scope-mismatch` from the floor. The `scopeMismatchLeg` helper is deleted. Task 5 reintroduces the check as the tripwire's own exemption-aware rule.
- The final pass's touched-path legs call `computeTouchedFiles` whenever `pass === 'final'` and a `baseSha` is given, and throw `MISSING_DIFF_RANGE` when it is absent.
- Boundary matching on touched paths uses an injected `boundaryCheck(paths) => boolean` (the CLI passes `boundaryCrossingFor` bound to its inputs). The resolver stays free of YAML reads, and `computeTouchedFiles` stays the only touched-file computation.
  - `lib/cli/implement.mjs` is not in this task's files and does not pass `boundaryCheck` until Task 8. With no `boundaryCheck`, the touched-path `boundary` leg is skipped; the declared-path `boundaryCrossing` input still applies. So `tests/cli/implement-resolve-depth.test.mjs` only changes here for the new fallback (`quick`, `default-quick`) and the retired `batched-task` / `scope-mismatch` legs. Touched-path boundary assertions at CLI level arrive with Task 8.
- Rewrite the module header to describe the ladder's precedence: tier-full-absolute → baseline → lite grant (Task 4) → floor → tripwire (Task 5).
- `lib/lifecycle-events.mjs:90`: reword the comment the same way. It is a sensitive path, so this task resolves `full` depth.

- [ ] **Verify test passes**

Run: `node --test tests/lib/implement/review-depth.test.mjs tests/cli/implement-resolve-depth.test.mjs tests/lib/implement/review-depth-task-snapshot.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/implement/review-depth.mjs lib/lifecycle-events.mjs tests/lib/implement/review-depth.test.mjs tests/cli/implement-resolve-depth.test.mjs
git commit -m "feat(implementation): make quick the reachable implement review default" -m "<trailers 3>"
```

### Task 4: `liteEligible`, `liteGrant` and the resolver's `lite` path [specialist: none]

**Charter capability:** Key Behaviors — per-task review depth (BEH-5, BEH-13 single definition)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 3
**Files:**
- Modify: `lib/implement/review-depth.mjs`
- Test: `tests/lib/implement/review-depth-lite-grant.test.mjs` (create)
- Test: `tests/lib/implement/lite-eligible-parity.test.mjs` (create)

**Tests:** create `tests/lib/implement/review-depth-lite-grant.test.mjs` (BEH-5 suite); create `tests/lib/implement/lite-eligible-parity.test.mjs` (EV-4 parity).

**Context to load:** Task 4 packet.

- [ ] **Write failing test**

```javascript
// review-depth-lite-grant.test.mjs
import { liteEligible, liteGrant, LITE_GRANT_THRESHOLD, resolveImplementReviewDepth } from '../../../lib/implement/review-depth.mjs';

test('threshold is 0.6 on the sidecar scale', () => assert.equal(LITE_GRANT_THRESHOLD, 0.6));

test('liteEligible: auto-agent and every score in [0.6, 1]', () => {
  assert.equal(liteEligible({ selected_agent: 'auto-agent', scores: s(0.6, 0.6, 0.6, 0.6) }).eligible, true);
  assert.equal(liteEligible({ selected_agent: 'assisted-agent', scores: s(1, 1, 1, 1) }).eligible, false);
  for (const bad of ['0.8', NaN, 1.2, undefined, -0.1, Infinity]) {
    const r = liteEligible({ selected_agent: 'auto-agent', scores: s(bad, 0.8, 0.8, 0.8) });
    assert.equal(r.eligible, false);
    assert.ok(r.warnings.some((w) => w.code === 'ROUTING_SCORE_OUT_OF_RANGE'));
  }
});

// Truth table over (a) authorized, (b) eligible, (c) not-high & no provisional floor leg, (d) not parallel.
for (const a of [true, false]) for (const b of [true, false]) for (const c of ['ok', 'high-risk', 'floor:sensitive-path']) for (const d of [true, false]) {
  test(`liteGrant a=${a} b=${b} c=${c} d=${d}`, () => {
    const r = liteGrant(fixtureFor({ a, b, c, d }));
    const granted = a && b && c === 'ok' && d;
    assert.equal(r.granted, granted);
    const expected = !a ? 'not-authorized' : !b ? 'routing-scores' : c !== 'ok' ? c : !d ? 'parallel' : null;
    assert.equal(r.lite_denied, expected);
  });
}

test('lite_source: flag, policy, or null; explicit --tier quick outranks policy lite', () => {
  assert.equal(resolveImplementReviewDepth(withPolicyLite({ liteFlag: true })).lite_source, 'flag');
  assert.equal(resolveImplementReviewDepth(withPolicyLite({})).lite_source, 'policy');
  const r = resolveImplementReviewDepth(withPolicyLite({ tierFlag: 'quick' }));
  assert.equal(r.depth, 'quick'); assert.equal(r.lite_source, null); assert.equal(r.lite_denied, 'not-authorized');
});

test('granted provisional pass returns depth lite, source lite-grant', () => { /* ... */ });
test('--tier lite is the same authorization as --lite', () => { /* ... */ });
```

```javascript
// lite-eligible-parity.test.mjs — oracle restates route's documented rule on the 1–5 scale.
const routeSaysEasy = (agent, dims5) => agent === 'auto-agent' && dims5.every((d) => d >= 3);
const TABLE = [
  ['auto-agent', [3, 3, 3, 3]], ['auto-agent', [2, 5, 5, 5]], ['assisted-agent', [5, 5, 5, 5]],
  ['auto-agent', [5, 5, 5, 3]], ['human-only', [4, 4, 4, 4]],
];
for (const [agent, dims5] of TABLE) {
  test(`parity ${agent} ${dims5}`, () => {
    const scores = toSidecarScale(dims5); // d/5 — 3/5 === 0.6 boundary
    assert.equal(liteEligible({ selected_agent: agent, scores }).eligible, routeSaysEasy(agent, dims5));
  });
}
test('non-numeric scores are never eligible', () => { /* '0.8', null */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/implement/review-depth-lite-grant.test.mjs tests/lib/implement/lite-eligible-parity.test.mjs`
Expected: FAIL — `liteEligible is not a function`

- [ ] **Implement**

- `export const LITE_GRANT_THRESHOLD = 0.6`.
- `export function liteEligible(entry)` returns `{ eligible, warnings }`, reusing `validateScores`. It is ineligible unless `selected_agent === 'auto-agent'`, every score is valid, and every score is `>= LITE_GRANT_THRESHOLD`.
- `export function liteGrant({ authorized, routingEntry, riskLevel, provisionalLegs, parallel })` checks conditions in BEH-5 order and returns `{ granted, lite_denied, warnings }`. Condition (c) reports `high-risk` before `floor:<first leg>`.
- `resolveImplementReviewDepth` gains:
  - inputs `liteFlag` (from `--lite` or `--tier lite`) and `parallel`;
  - authorization (a), which is `liteFlag`, or (no `tierFlag`, and the policy `implement_mode` for the risk level is `lite`);
  - `lite_source`: `flag`, `policy` or `null`;
  - the grant check, which runs on the **provisional pass only**, after the provisional floor legs are computed on declared paths. The final pass never grants `lite` (Task 5 keys the final pass off the provisional result). A grant returns `{ depth: 'lite', source: 'lite-grant', floor_applied: false, floor_legs: [], lite_denied: null, lite_source }`.
  - Otherwise the result is the Task 3 result plus `lite_denied` and `lite_source`, and `escalated_from: null` on every path until Task 5 sets it.
- Header JSDoc lists the return shape. `REVIEW_DEPTH_RESOLVED_KEYS` is not touched. The CLI (Task 8) strips the extra fields before reporting the event.

- [ ] **Verify test passes**

Run: `node --test tests/lib/implement/review-depth-lite-grant.test.mjs tests/lib/implement/lite-eligible-parity.test.mjs tests/lib/implement/review-depth.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/implement/review-depth.mjs tests/lib/implement/review-depth-lite-grant.test.mjs tests/lib/implement/lite-eligible-parity.test.mjs
git commit -m "feat(implementation): add liteEligible and liteGrant to the review-depth resolver" -m "<trailers 4>"
```

### Task 5: Touched-file modes, `isTripwireExempt`, ignored-path enumeration and final-pass tripwire [specialist: none]

**Charter capability:** Key Behaviors — per-task review depth (BEH-7; review RI-7, RI-8, BD-11)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 4
**Files:**
- Modify: `lib/implement/review-depth.mjs` (`computeTouchedFiles`, new `isTripwireExempt`, new `listIgnoredWrittenSince`, tripwire in `resolveImplementReviewDepth`)
- Test: `tests/lib/implement/review-depth-tripwire.test.mjs` (create)
- Test: `tests/lib/implement/review-depth-task-snapshot.test.mjs` (extend: mode fields)

**Tests:** create `tests/lib/implement/review-depth-tripwire.test.mjs` (BEH-7 suite); extend `tests/lib/implement/review-depth-task-snapshot.test.mjs`.

**Context to load:** Task 5 packet.

- [ ] **Write failing test**

```javascript
// review-depth-tripwire.test.mjs
import { isTripwireExempt, resolveImplementReviewDepth, snapshotWorkingTree } from '../../../lib/implement/review-depth.mjs';

test('isTripwireExempt: case-sensitive exemptions', () => {
  for (const p of ['tests/x.mjs', 'docs/guide.md', 'lib/a.test.mjs', 'src/b.spec.ts', 'pkg/README.md', 'x.test.py'])
    assert.equal(isTripwireExempt(p, '100644'), true, p);
  for (const p of ['Tests/x.mjs', 'DOCS/a.md', 'lib/a.TEST.mjs', 'lib/readme.md', 'lib/a.test.md', 'lib/a.mjs'])
    assert.equal(isTripwireExempt(p, '100644'), false, p);
});

test('isTripwireExempt: case-insensitive exclusions and symlinks', () => {
  for (const p of ['docs/x.spec.md', 'tests/X.SPEC.MD', '.context-index/a.test.mjs', '.Context-Index/tests/a.mjs', 'tests/.context-index/x.md'])
    assert.equal(isTripwireExempt(p, '100644'), false, p);
  assert.equal(isTripwireExempt('tests/link.mjs', '120000'), false);
});

test('lite task touching an undeclared source file escalates to quick (tracked and untracked)', (t) => {
  // temp repo; snapshot; modify tracked lib/x.mjs (undeclared) → resolve final with liteFlag, baseSha
  // assert { depth: 'quick', escalated_from: 'lite', source: 'lite-tripwire' }, floor_legs ['scope-mismatch'],
  // warnings has LITE_TRIPWIRE_ESCALATED naming task id and legs; repeat with a new untracked lib/y.mjs
});

test('undeclared tests/ or docs/ file keeps lite', (t) => { /* depth 'lite', source 'lite-grant' */ });

test('undeclared *.spec.md, X.SPEC.MD, .context-index/, .Context-Index/ and symlink escalate', (t) => { /* one sub-case each */ });

test('sensitive path escalates to full even under docs/', (t) => {
  // sensitivePaths ['docs/secrets/**'] or built-in '**/*secret*': write docs/my-secret.md → depth 'full', legs include 'sensitive-path'
});

test('own lifecycle-log M touch is excluded before the exemption check (RI-8)', (t) => {
  // commit .context-index/lifecycle-state/<slug>.jsonl; snapshot; append a line; resolve final → depth 'lite'
  // a second, different spec's log modified → escalates (exclusion is exactly one record)
});

test('gitignored .env written after the task started escalates to full (BD-11)', (t) => {
  // .gitignore '.env'; inProgressAt = now; write .env → depth 'full', legs ['sensitive-path']
  // a pre-existing ignored .env (mtime before inProgressAt) does not escalate
});

test('gitignored paths never feed scope-mismatch', (t) => { /* ignored build/out.js written → stays lite */ });
```

```javascript
// review-depth-task-snapshot.test.mjs (addition)
test('computeTouchedFiles reports git modes; a new symlink has mode 120000', (t) => {
  // symlinkSync('a.mjs', join(root, 'link.mjs')) → record { path: 'link.mjs', status: 'A', mode: '120000', src_mode: '000000' }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/implement/review-depth-tripwire.test.mjs tests/lib/implement/review-depth-task-snapshot.test.mjs`
Expected: FAIL — `isTripwireExempt is not a function`; touched-file records carry no `mode`

- [ ] **Implement**

- **`computeTouchedFiles` (RI-7).**
  - Switch to `git diff-tree -r --no-renames --raw -z <base>^{tree} <current>`. Records are `:<src_mode> <dst_mode> <src_sha> <dst_sha> <status>\0<path>\0`.
  - Return `{ path, status, mode: dst_mode, src_mode }`. Existing callers read only `path` and `status`, so the change is additive.
  - Paths stay git's own NUL-delimited repo-relative output. They are never joined or resolved.
- **`isTripwireExempt(path, mode)`.**
  - It is false when `mode === '120000'`. Callers pass `src_mode` for a `D` record, so a deleted symlink is caught.
  - It is false when any path segment lowercases to `.context-index`, or the lowercased path ends in `.spec.md`.
  - Otherwise it is true when the path starts with `tests/` or `docs/`, the basename is exactly `README.md`, or the basename matches `/^.+\.(test|spec)\.(js|mjs|cjs|ts|tsx|jsx|py|go|rb|rs)$/`. All of these matches are case-sensitive.
- **`listIgnoredWrittenSince(projectRoot, sinceMs)` (BD-11).**
  - Run `git ls-files -z --others --ignored --exclude-standard`.
  - Keep entries whose `lstat` mtime is `>= sinceMs`. A `sinceMs` of `null` keeps all entries, failing closed toward escalation.
  - Pre-filter by the sensitive-path globs and boundary regexes before calling `lstat`, so ignored trees such as `node_modules/` are not stat'ed file by file.
- **Final-pass tripwire.** It is keyed on the task's recorded provisional resolution, not on re-evaluating authorization. The resolver takes a new input `provisionalDepth`, and when it is `'lite'` the final pass runs the tripwire below.
  - The grant is never re-evaluated on the final pass. A final call that omits `--lite`, `--tier` or `--parallel` cannot skip the tripwire, and a final call that adds them cannot turn a `quick`/`full` task into `lite` after the fact.
  - When `provisionalDepth` is anything else (including `null`), the final pass takes the normal Task 3 path and never resolves `lite`.
  1. `computeTouchedFiles`.
  2. `excludeOwnLifecycleLogTouch` (RI-8: before anything else).
  3. `sensitive-path` and `boundary` over every remaining path plus `listIgnoredWrittenSince(projectRoot, inProgressAt)`. Either leg holding gives `full`.
  4. Otherwise `scope-mismatch` over remaining non-ignored paths that are undeclared and not `isTripwireExempt`. If it holds, the result is `quick`.
  5. On escalation, return `{ depth, source: 'lite-tripwire', escalated_from: 'lite', floor_applied: true, floor_legs }` plus the warning `{ code: 'LITE_TRIPWIRE_ESCALATED', task_id, legs }`. Escalation never moves more than two levels.
- `inProgressAt` (ms epoch or `null`) and `provisionalDepth` (`'lite' | 'quick' | 'full' | null`) are new inputs. The CLI supplies both from the lifecycle log (Task 8). Tests: add a case where `provisionalDepth: 'lite'` without `liteFlag` still runs the tripwire and escalates, and one where `liteFlag: true` with `provisionalDepth: 'quick'` resolves `quick`, never `lite`.

- [ ] **Verify test passes**

Run: `node --test tests/lib/implement/review-depth-tripwire.test.mjs tests/lib/implement/review-depth-task-snapshot.test.mjs tests/lib/implement/review-depth.test.mjs tests/lib/implement/review-depth-lite-grant.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/implement/review-depth.mjs tests/lib/implement/review-depth-tripwire.test.mjs tests/lib/implement/review-depth-task-snapshot.test.mjs
git commit -m "feat(implementation): add the lite final-pass tripwire" -m "<trailers 5>"
```

### Task 6: Run-base governance reader and commit-id validation [specialist: none]

**Charter capability:** Key Behaviors — per-task review depth (BEH-5 run-base reads, Arguments "Commit-id arguments"; review RI-6, BD-13)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 2
**Files:**
- Create: `lib/implement/run-base.mjs`
- Modify: `lib/cli/test-policy.mjs:152-188` (`boundaryCrossingFor`, `loadConfiguredSensitivePaths` accept `{ text }`)
- Modify: `lib/plan-routing-sidecar.mjs` (export `parseRoutingSidecarText(text, label)` through the existing validation; `readRoutingSidecar` delegates to it)
- Test: `tests/lib/implement/run-base.test.mjs` (create)
- Test: `tests/cli/test-policy.test.mjs` (extend: text override parity)

**Tests:** create `tests/lib/implement/run-base.test.mjs` (commit-id / run-base suite); extend `tests/cli/test-policy.test.mjs`.

**Context to load:** Task 6 packet.

- [ ] **Write failing test**

```javascript
// run-base.test.mjs
import { validateCommitId, readAtCommit, assertRepoRelative, loadGovernanceAtRunBase } from '../../../lib/implement/run-base.mjs';

test('INVALID_COMMIT_ID for non-hex, short, leading-dash, unresolvable', (t) => {
  const repo = initRepoWithCommit(t);
  for (const bad of ['--output=x', '-abc', 'abc123', 'HEAD', 'G'.repeat(40), 'a'.repeat(40)]) {
    assert.throws(() => validateCommitId('--run-base', bad, { projectRoot: repo, kinds: ['commit'] }),
      (e) => e.code === 'INVALID_COMMIT_ID' && /--run-base/.test(e.message));
  }
});

test('--run-base requires a commit; --base-sha accepts a commit or a tree', (t) => {
  const repo = initRepoWithCommit(t);
  const head = git(repo, 'rev-parse', 'HEAD'); const tree = git(repo, 'rev-parse', 'HEAD^{tree}');
  assert.equal(validateCommitId('--run-base', head, { projectRoot: repo, kinds: ['commit'] }), head);
  assert.throws(() => validateCommitId('--run-base', tree, { projectRoot: repo, kinds: ['commit'] }), { code: 'INVALID_COMMIT_ID' });
  assert.equal(validateCommitId('--base-sha', tree, { projectRoot: repo, kinds: ['commit', 'tree'] }), tree);
});

test('readAtCommit returns committed text, null when absent, ignores the working tree', (t) => { /* edit file after commit; read returns committed text */ });

test('assertRepoRelative rejects .., absolute, leading dash', () => {
  for (const p of ['../x', '/etc/passwd', '-x', 'a/../../b']) assert.throws(() => assertRepoRelative(p), { code: 'INVALID_PLAN_PATH' });
});

test('loadGovernanceAtRunBase reads policies, boundaries, sensitive paths and sidecar from the commit', (t) => {
  // commit risk-policies (medium implement_mode: lite) + sidecar; then edit both in the working tree
  // result.policies.medium.implement_mode === 'lite'; result.routingEntries from the commit
  // sidecar absent at run_base → { routingEntries: null, warnings: [{ code: 'ROUTING_SIDECAR_MISSING', run_base }] }
  // malformed policy at run_base → throws INVALID_TIER naming 'run-base:<sha>'
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/implement/run-base.test.mjs`
Expected: FAIL — `Cannot find module .../run-base.mjs`

- [ ] **Implement**

- **`validateCommitId(flag, value, { projectRoot, kinds })`.**
  - The value must match `/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/`. The regex already rules out a leading `-`.
  - Resolve it with `execFileSync('git', ['rev-parse', '--verify', '--quiet', '--end-of-options', `${value}^{object}`])`, then `git cat-file -t <value>`, which must be in `kinds`.
  - Any failure throws `codedError('INVALID_COMMIT_ID', '<flag> must be a full hex object id resolving to a <kinds>; got <value>')`.
  - Do not use `assertSafeArgvToken` (RI-6).
- **`assertRepoRelative(relPath)`.** Rejects absolute paths, any `..` segment after normalization, and a leading `-`, with `INVALID_PLAN_PATH`.
- **`readAtCommit(projectRoot, sha, relPath)`.** Runs `git cat-file -p <sha>:<relPath>` through argv after `assertRepoRelative`, and returns `null` on "does not exist".
- **`loadGovernanceAtRunBase({ projectRoot, runBase, planPath })`.** Returns `{ policies, sensitivePaths, boundaryCheck, routingEntries, warnings }`:
  - Policies are parsed with `parseRigorPolicies(text, 'run-base:<sha>:.context-index/governance/risk-policies.yaml')`.
  - Sensitive paths come from `loadConfiguredSensitivePaths(projectRoot, { text })`.
  - `boundaryCheck` is `(paths) => boundaryCrossingFor(projectRoot, paths, { text })`.
  - The sidecar is parsed with `parseRoutingSidecarText`.
  - An absent file is treated exactly like an absent file on disk.
  - An absent sidecar gives `routingEntries: null` plus a `ROUTING_SIDECAR_MISSING` warning naming the run base (BD-13).
- `lib/cli/test-policy.mjs`: add an optional third or second parameter `{ text } = {}`. When `text` is given it is parsed instead of reading the file, with the identical degradation rules. Update the two functions' comments to state the run-base use.

- [ ] **Verify test passes**

Run: `node --test tests/lib/implement/run-base.test.mjs tests/cli/test-policy.test.mjs tests/cli/implement-read-routing.test.mjs tests/cli/implement-batches.test.mjs`

Also add one regression assertion to `tests/lib/implement/run-base.test.mjs`: `parseRoutingSidecarText(readFileSync(p), p)` deep-equals `readRoutingSidecar(planPath)` on a real committed sidecar (`.context-index/specs/features/implementation/batched-task-dispatch.routing.json`), and both throw `INVALID_SIDECAR_JSON` on the same malformed input. `readRoutingSidecar` now delegates to the new parser, so its existing behavior must be pinned.
Expected: PASS

- [ ] **Commit**

```bash
git add lib/implement/run-base.mjs lib/cli/test-policy.mjs lib/plan-routing-sidecar.mjs tests/lib/implement/run-base.test.mjs tests/cli/test-policy.test.mjs
git commit -m "feat(implementation): read implement governance inputs from the run-base commit" -m "<trailers 6>"
```

### Task 7: `adev implement check-flags` [specialist: none]

**Charter capability:** Key Behaviors — per-task review depth (BEH-16, BEH-5 authorization visibility, BEH-8 `LITE_SUPPRESSED_PARALLEL`)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 6
**Files:**
- Modify: `lib/cli/implement.mjs` (new `cmdCheckFlags`, `run` switch, USAGE, header comment, `help()`)
- Test: `tests/cli/implement-check-flags.test.mjs` (create)

**Tests:** create `tests/cli/implement-check-flags.test.mjs` (BEH-16 suite).

**Context to load:** Task 7 packet.

- [ ] **Write failing test**

```javascript
// implement-check-flags.test.mjs — every case runs the real CLI in a temp git repo
const cases = [
  [['--lite', '--tier', 'full'], 'CONFLICTING_TIER_FLAGS'],
  [['--lite', '--tier', 'quick'], 'CONFLICTING_TIER_FLAGS'],
  [['--tier', 'bogus'], 'INVALID_TIER'],
];
for (const [args, code] of cases) {
  test(`check-flags ${args.join(' ')} exits 1 with ${code} and writes no lifecycle event`, (t) => {
    const repo = fixtureRepo(t);
    const r = runCli(repo, ['implement', 'check-flags', '--spec', SPEC, ...args]);
    assert.equal(r.status, 1); assert.match(r.stderr, new RegExp(code));
    assert.equal(existsSync(join(repo, '.context-index/lifecycle-state', `${SLUG}.jsonl`)), false);
  });
}

test('malformed medium.implement_mode, unparseable file, high lite → stated codes, no event', (t) => { /* INVALID_TIER, INVALID_TIER, LITE_NOT_ALLOWED_FOR_HIGH */ });

test('valid input prints { lite_authorized, lite_source, tier, run_base, warnings } with run_base = HEAD', (t) => {
  const repo = fixtureRepo(t);
  const out = JSON.parse(runCli(repo, ['implement', 'check-flags', '--spec', SPEC, '--lite']).stdout);
  assert.deepEqual(Object.keys(out).sort(), ['lite_authorized', 'lite_source', 'run_base', 'tier', 'warnings']);
  assert.equal(out.run_base, git(repo, 'rev-parse', 'HEAD'));
  assert.equal(out.lite_authorized, true); assert.equal(out.lite_source, 'flag'); assert.equal(out.tier, 'lite');
});

test('policy authorization: no flag, medium implement_mode lite → lite_source policy', (t) => { /* ... */ });
test('--tier quick with policy lite → lite_authorized false', (t) => { /* ... */ });
test('--lite --parallel → warnings includes LITE_SUPPRESSED_PARALLEL; lite_authorized stays true', (t) => { /* ... */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/implement-check-flags.test.mjs`
Expected: FAIL — `unknown subverb: check-flags`

- [ ] **Implement**

`cmdCheckFlags(argv, { projectRoot })` accepts `--spec`, `--lite`, `--tier` and `--parallel`. It does the following, in order:

1. Exit 1 with `CONFLICTING_TIER_FLAGS` when `--lite` is combined with `--tier full|quick`.
2. Exit 1 with `INVALID_TIER` when `--tier` is outside `RIGOR_MODES`.
3. `run_base = git rev-parse --verify HEAD` (full sha).
4. Read `risk_level` from the spec frontmatter (`parseFrontmatterFields`).
5. Load the policies at `run_base` through `loadGovernanceAtRunBase` (policies only). This throws `INVALID_TIER` or `LITE_NOT_ALLOWED_FOR_HIGH`, which is printed with the code and exits 1.
6. Compute the authorization: `--lite` or `--tier lite` gives `flag`. With no `--tier`, a policy `implement_mode: lite` for the risk level gives `policy`. Anything else gives `null`.
7. Add `LITE_SUPPRESSED_PARALLEL` to `warnings` when authorized and `--parallel` is set.
8. Print the JSON and exit 0.

The verb writes no lifecycle event on any path. Add it to the usage banner, the header comment's subverb list and exit-code block, and `help()`.

- [ ] **Verify test passes**

Run: `node --test tests/cli/implement-check-flags.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/implement.mjs tests/cli/implement-check-flags.test.mjs
git commit -m "feat(implementation): add adev implement check-flags" -m "<trailers 7>"
```

### Task 8: `adev implement resolve-depth` ladder flags and output [specialist: none]

**Charter capability:** Key Behaviors — per-task review depth (BEH-5, BEH-7 verb surface, BEH-8 `--parallel`, Arguments)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 5, Task 6, Task 7
**Files:**
- Modify: `lib/cli/implement.mjs:382-560` (`cmdResolveDepth`), `RESOLVE_DEPTH_USAGE`, `help()`, header comment
- Test: `tests/cli/implement-resolve-depth.test.mjs` (extend)

**Tests:** extend `tests/cli/implement-resolve-depth.test.mjs` (BEH-5/BEH-7 CLI suite).

**Context to load:** Task 8 packet.

- [ ] **Write failing test**

```javascript
test('resolve-depth --lite --run-base <sha> grants lite (CLI)', (t) => {
  const repo = liteFixtureRepo(t); const head = git(repo, 'rev-parse', 'HEAD');
  const out = JSON.parse(runCli(repo, ['implement', 'resolve-depth', ...ids, '--lite', '--run-base', head, '--pass', 'provisional']).stdout);
  assert.equal(out.depth, 'lite'); assert.equal(out.source, 'lite-grant');
  assert.equal(out.lite_denied, null); assert.equal(out.lite_source, 'flag'); assert.equal(out.escalated_from, null);
});

test('policy edited in the working tree after run_base does not change the result', (t) => { /* set medium implement_mode: full uncommitted → still lite */ });

test('the emitted event carries only REVIEW_DEPTH_RESOLVED_KEYS', (t) => {
  // read the jsonl line; keys ⊆ {plan, task_id, pass, depth, source, floor_applied, floor_legs} plus envelope keys
});

test('--run-base is required on both passes', (t) => { /* missing → exit 1, stderr names --run-base */ });

test('INVALID_COMMIT_ID for --run-base --output=x, a short sha, and an unresolvable sha', (t) => {
  for (const bad of ['--output=x', 'abc1234', 'f'.repeat(40)]) { /* exit 1, stderr /INVALID_COMMIT_ID/ and /--run-base/ */ }
});

test('--base-sha is validated the same way (commit or tree)', (t) => { /* ... */ });

test('--parallel grants no lite: lite_denied parallel', (t) => { /* ... */ });
test('--in-batch is accepted and ignored', (t) => { /* same result with and without */ });
test('final pass escalation prints LITE_TRIPWIRE_ESCALATED in warnings and records source lite-tripwire', (t) => { /* ... */ });
test('flag-sourced lite: provisional with --lite, final WITHOUT --lite still runs the tripwire and escalates', (t) => {
  // provisional: resolve-depth --lite --run-base <head> → depth lite (event written)
  // task writes undeclared lib/x.mjs; final: resolve-depth --pass final --run-base <head> --base-sha <snap> (no --lite)
  // assert depth 'quick', source 'lite-tripwire', escalated_from 'lite'
});
test('final pass with --lite after a quick provisional never resolves lite', (t) => { /* ... */ });
test('final pass reads the task in_progress timestamp for the ignored-path lower bound', (t) => { /* .env before vs after the event */ });
test('usage banner lists full|quick|lite', () => { /* run with no args; stderr matches /full\|quick\|lite/ */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/implement-resolve-depth.test.mjs`
Expected: FAIL — `Unknown option '--lite'` / `'--run-base'`

- [ ] **Implement**

- **Options.** Add `lite` (boolean), `parallel` (boolean) and `run-base` (string). Keep `in-batch` parsed but unused (comment: accepted for compatibility with older skill text; the leg it fed no longer exists).
- **Validation order.**
  1. `--run-base` present, else exit 1.
  2. `validateCommitId('--run-base', …, { kinds: ['commit'] })`.
  3. When `--base-sha` is given, `validateCommitId('--base-sha', …, { kinds: ['commit', 'tree'] })`.
  4. Then the existing checks.

  `INVALID_COMMIT_ID` exits 1, and git never sees a raw unvalidated value.
- **Governance and routing inputs.**
  - Governance comes from `loadGovernanceAtRunBase`.
  - The routing entry comes from the run-base sidecar. When that is absent, fall back to `lookupRoutingEntry` on the working tree for quick/full resolution, force `lite_denied: routing-scores`, and pass the warning through.
- **Resolver call.** Pass `liteFlag = values.lite || values.tier === 'lite'`, `tierFlag` (with `lite` mapped to `null`, since authorization rides on `liteFlag`), `parallel`, `boundaryCheck`, `inProgressAt` and `provisionalDepth`. Both are read with `filterEvents`, scoped to events after the latest implement `lifecycle_step` started event, and are `null` when absent:
  - `inProgressAt` is the timestamp of the latest `plan_task` event for `(plan, task_id)` with `status: in_progress`.
  - `provisionalDepth` is the `depth` of the latest `review_depth_resolved` for `(plan, task_id)` with `pass: provisional`.
- **Reporting.** `reportReviewDepthResolved` receives only the seven contract keys. The stdout JSON carries the full result plus `review_cycles`.
- Update `RESOLVE_DEPTH_USAGE`, the header subverb list, the exit-code block (add `INVALID_COMMIT_ID` to exit 1) and `help()`.

- [ ] **Verify test passes**

Run: `node --test tests/cli/implement-resolve-depth.test.mjs tests/cli/implement-snapshot-base.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/implement.mjs tests/cli/implement-resolve-depth.test.mjs
git commit -m "feat(implementation): add lite, run-base and parallel flags to resolve-depth" -m "<trailers 8>"
```

### Task 9: `adev implement batches --lite --run-base` and lite batch exclusion [specialist: none]

**Charter capability:** Key Behaviors — batched dispatch (BEH-8; review RI-10)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 4, Task 6
**Files:**
- Modify: `lib/implement/batching.mjs:64-195`
- Modify: `lib/cli/implement.mjs:168-325` (`cmdBatches`, `BATCHES_USAGE`, `help()`)
- Test: `tests/lib/implement/batching.test.mjs` (extend)
- Test: `tests/cli/implement-batches.test.mjs` (extend)

**Tests:** extend `tests/lib/implement/batching.test.mjs` and `tests/cli/implement-batches.test.mjs` (BEH-8 suite).

**Context to load:** Task 9 packet.

- [ ] **Write failing test**

```javascript
// batching.test.mjs
test('a task in liteGranted never joins a batch and is reported solo with reason lite', () => {
  const r = resolveBatches({ planContent: PLAN_GROUP_1_2_3, manifest, routingEntries: ALL_ELIGIBLE, liteGranted: new Set(['2']) });
  assert.ok(r.batches.every((b) => !b.taskIds.includes('2')));
  assert.deepEqual(r.solo.find((s) => s.taskId === '2'), { taskId: '2', reason: 'lite' });
});

// implement-batches.test.mjs
test('batches --lite --run-base excludes granted tasks; no --tier flag exists', (t) => {
  // runCli(['implement','batches','--plan',PLAN,'--lite','--run-base',head]) → granted ids absent from batches
  // runCli([... '--tier','lite']) → exit 1 argument error (RI-10)
});
test('policy authorization at run_base excludes granted tasks without --lite', (t) => { /* ... */ });
test('unresolvable spec header fails closed toward exclusion of eligible tasks', (t) => { /* ... */ });
test('INVALID_COMMIT_ID on a bad --run-base', (t) => { /* ... */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/implement/batching.test.mjs tests/cli/implement-batches.test.mjs`
Expected: FAIL — `Unknown option '--lite'`; granted task present in a batch

- [ ] **Implement**

- **`resolveBatches`.** Accepts `liteGranted = new Set()`. A member in the set goes to `solo` with `reason: 'lite'` before the gate and size checks. A group left with fewer than two batchable members falls back to solo, as today.
- **`cmdBatches` flags.** Gains `--lite` and `--run-base`. `--run-base` is validated with `validateCommitId`. It is required when `--lite` is passed, and otherwise optional, so existing non-lite callers keep working.
- **Granting.** With a run base, governance comes from `loadGovernanceAtRunBase`. For each plan task id, the verb evaluates `liteGrant` with:
  - authorization: `--lite`, or the policy `implement_mode: lite` at the spec's risk level;
  - provisional legs from the task's declared files (`readTaskFiles`);
  - `parallel: values.parallel`.

  The granted ids form `liteGranted`. When the plan has no resolvable `> **Spec:**` header, policy authorization is assumed (fail closed: eligible tasks are excluded from batches, never wrongly batched).
- **No `--tier` flag** (RI-10).
- Update `BATCHES_USAGE` and `help()`.

- [ ] **Verify test passes**

Run: `node --test tests/lib/implement/batching.test.mjs tests/cli/implement-batches.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/implement/batching.mjs lib/cli/implement.mjs tests/lib/implement/batching.test.mjs tests/cli/implement-batches.test.mjs
git commit -m "feat(implementation): exclude lite-granted tasks from batch formation" -m "<trailers 9>"
```

### Task 10: `adev implement lite-report` [specialist: none]

**Charter capability:** Key Behaviors — validation after implement (BEH-10)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `lib/cli/implement.mjs` (new `cmdLiteReport`, switch, USAGE, `help()`)
- Test: `tests/cli/implement-lite-report.test.mjs` (create)

**Tests:** create `tests/cli/implement-lite-report.test.mjs` (BEH-10 suite).

**Context to load:** Task 10 packet.

- [ ] **Write failing test**

```javascript
test('counts only tasks whose latest final-pass event after the latest implement start has depth lite', (t) => {
  const repo = fixtureRepo(t);
  // run 1: lifecycle_step implement started; final review_depth_resolved task 1 depth lite
  // run 2: lifecycle_step implement started; final task 2 lite; final task 3 lite then final task 3 quick (escalated)
  const out = JSON.parse(runCli(repo, ['implement', 'lite-report', '--spec', SPEC, '--json']).stdout);
  assert.deepEqual(out, { count: 1, task_ids: ['2'], since: '<iso of run 2 start>' });
});
test('reads raw events, not the reviewDepthResolutions projection', (t) => { /* projection would keep run-1 task 1 */ });
test('no implement start event → count 0', (t) => { /* ... */ });
test('text mode prints the advisory line only when count > 0', (t) => { /* ... */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/implement-lite-report.test.mjs`
Expected: FAIL — `unknown subverb: lite-report`

- [ ] **Implement**

`cmdLiteReport(argv, { projectRoot })` takes `--spec` and `--json`. Using `readEvents(projectRoot, specPath)`:

1. Find the index of the last `lifecycle_step` event with `step: 'implement'` in its started state. Match the existing event shape at `lib/lifecycle-state.mjs:883`.
2. Fold the later `review_depth_resolved` events with `pass: 'final'` to the latest per `(plan, task_id)`.
3. Collect those with `depth: 'lite'`.

`--json` prints `{ count, task_ids, since }`. Text mode prints `implemented without per-task review: <n> task(s) (<ids>)`, or nothing when the count is 0. Exit 0 in both modes.

- [ ] **Verify test passes**

Run: `node --test tests/cli/implement-lite-report.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/implement.mjs tests/cli/implement-lite-report.test.mjs
git commit -m "feat(implementation): add adev implement lite-report" -m "<trailers 10>"
```

### Task 11: Implement SKILL.md body — arguments, first-action `check-flags`, no-self-selection, Red Flags [specialist: none]

**Charter capability:** Key Files — `skills/implement/SKILL.md` (BEH-13, BEH-16 first action; review CON-1)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 7
**Files:**
- Modify: `skills/implement/SKILL.md` (Arguments, Prerequisites, Step 2 summary line, Red Flags)
- Test: `tests/skills/implement-rigor-ladder.test.mjs` (create)

**Tests:** create `tests/skills/implement-rigor-ladder.test.mjs` (implement skill-text suite; extended in Tasks 12 and 13).

**Context to load:** Task 11 packet.

- [ ] **Write failing test**

```javascript
const body = readFileSync('skills/implement/SKILL.md', 'utf8');

test('check-flags is the first action, before adev gate require', () => {
  const cf = body.indexOf('adev implement check-flags'); const gate = body.indexOf('adev gate require');
  assert.ok(cf > 0 && cf < gate);
});
test('Arguments document --lite and --tier full|quick|lite', () => {
  assert.match(body, /^- `--lite`/m); assert.match(body, /^- `--tier <full\|quick\|lite>`/m);
});
test('no-self-selection rule: lite only from operator input', () => {
  assert.match(body, /never add `--lite` or `--tier lite` on your own judgment/i);
});
test('run keeps run_base and lite_source from check-flags', () => { assert.match(body, /run_base/); assert.match(body, /lite_source/); });
test('Red Flags entry reworded', () => {
  assert.match(body, /Skip a review stage the resolved depth requires/);
  assert.doesNotMatch(body, /Skip either review stage/);
});
test('do-not-double-emit paragraph is byte-identical (CON-1)', () => {
  assert.ok(body.includes(DO_NOT_DOUBLE_EMIT_PARAGRAPH)); // literal copied from SKILL.md:73 at plan time
});
test('Step 2 summary points at lite-mode.md with an <ADEV_ROOT> anchor', () => {
  assert.match(body, /<ADEV_ROOT>\/skills\/implement\/references\/lite-mode\.md/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/implement-rigor-ladder.test.mjs`
Expected: FAIL — no `adev implement check-flags` in the body

- [ ] **Implement**

- **Arguments.** Add `--lite` (operator authorization for `lite`, equivalent to `--tier lite`, never added by an agent) and `--tier <full|quick|lite>` (`full` is absolute; `quick` is the baseline; `lite` is the same as `--lite`).
- **Prerequisites.** Insert a new first condition before the batch-flag check: run `adev implement check-flags --spec <spec-path> [--lite] [--tier <t>] [--parallel]` before anything else.
  - On exit 1, stop and surface stderr. No lifecycle event has been written.
  - On success, keep `run_base` and `lite_source`, and print `lite authorized via <lite_source>` once when `lite_authorized` is true. Echo any `LITE_SUPPRESSED_PARALLEL` warning.
  - Renumber the list ("five conditions" → "six").
- **No-self-selection rule.** One paragraph in Prerequisites (it governs the whole invocation, so it stays in the body): `--lite`/`--tier lite` come only from what the operator typed or from `risk-policies.yaml`. Never add `--lite` or `--tier lite` on your own judgment. A `/adev:route` `lite-eligible` count is an eligibility signal, not an authorization.
- **Step 2 summary.** Add one line plus the `<ADEV_ROOT>` conditional-loading pointer to `references/lite-mode.md` ("Load it when any task resolves `lite`").
- **Red Flags.** Replace "Skip either review stage (spec compliance AND code quality are both required)" with "Skip a review stage the resolved depth requires (`full`: both stages; `quick`: the synthesized reviewer; `lite`: none, but the tripwire always runs)".
- Leave `:73` untouched. Re-run the size-cap test. If it fails, move material to `references/`, never trim governing text.

- [ ] **Verify test passes**

Run: `node --test tests/skills/implement-rigor-ladder.test.mjs tests/skills/skill-size-cap.test.mjs tests/skills-extension-coverage.test.mjs tests/skills/implement-step-pointers.test.mjs tests/skills-no-inline-node.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/implement/SKILL.md tests/skills/implement-rigor-ladder.test.mjs
git commit -m "feat(implementation): add --lite and first-action check-flags to implement" -m "<trailers 11>"
```

### Task 12: Implement references — `lite-mode.md` and the Step 2 loop (incl. WR-8) [specialist: none]

**Charter capability:** Key Behaviors — per-task 2-stage review, thinned by depth (BEH-6, BEH-7, BEH-8, BEH-14, BEH-15; review WR-7, WR-8)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 8, Task 9, Task 10, Task 11
**Files:**
- Create: `skills/implement/references/lite-mode.md`
- Modify: `skills/implement/references/steps/step-2-per-task-loop.md:5, 68, 204-210, 299-325`
- Test: `tests/skills/implement-rigor-ladder.test.mjs` (extend)
- Test: `tests/skills/implement-graduated-review-depth.test.mjs` (update: `--in-batch` gone, `--run-base` present)

**Tests:** extend `tests/skills/implement-rigor-ladder.test.mjs`; update `tests/skills/implement-graduated-review-depth.test.mjs`.

**Context to load:** Task 12 packet.

- [ ] **Write failing test**

```javascript
const lite = readFileSync('skills/implement/references/lite-mode.md', 'utf8');
const loop = readFileSync('skills/implement/references/steps/step-2-per-task-loop.md', 'utf8');

test('lite-mode passes run_base to resolve-depth on both passes', () => {
  assert.match(lite, /resolve-depth[^\n]*--run-base <run_base>[^\n]*--pass provisional|--pass provisional[^\n]*--run-base <run_base>/);
  assert.match(lite, /--pass final --run-base <run_base> --base-sha/);
});
test('lite-mode: no Agent dispatch, agent-default mandate, test-integrity, one commit, no Review-round trailer', () => {
  for (const re of [/no `Agent` dispatch/i, /agent-default-mandate\.md/, /test-integrity\.md/, /Spec:/, /Plan-task:/, /no `Review-round:` trailer/i, /no `adev test-policy resolve`/i])
    assert.match(lite, re);
});
test('lite-mode order: in_progress event, then snapshot-base, then implement', () => {
  const a = lite.indexOf('in_progress'); const b = lite.indexOf('adev implement snapshot-base'); assert.ok(a > 0 && a < b);
});
test('the tripwire always runs for a lite task, whatever flags the final call carries', () => {
  assert.match(lite, /keyed on the task's provisional `lite` resolution/i);
});
test('visibility relays (WR-7)', () => {
  assert.match(lite, /lite authorized via/); assert.match(lite, /lite_denied/); assert.match(lite, /LITE_TRIPWIRE_ESCALATED/);
});
test('hard-gate list (BEH-14) names every gate', () => {
  for (const g of ['gate_mode', 'adev gate require', 'main', 'skill extensions', 'test-integrity.md', 'fail-fast', 'destructive', 'constitution'])
    assert.match(lite, new RegExp(g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
});
test('Stage 1 cap routes to the Step 2g halt, never to the user (WR-8)', () => {
  const s1 = section(loop, '#### 2f. Stage 1 Review');
  assert.doesNotMatch(s1, /escalate to the user/i);
  assert.match(s1, /plan_task` `blocked`/); assert.match(s1, /never waits for input/i);
});
test('the 2g halt applies to every run and is a build step\'s STEP_RESULT BLOCKED', () => {
  const s2 = section(loop, '#### 2g. Stage 2 Review');
  assert.match(s2, /interactive, headless, scheduled/i); assert.match(s2, /status: BLOCKED/);
});
test('Step 2 no longer passes --in-batch and passes --run-base', () => {
  assert.doesNotMatch(loop, /--in-batch/); assert.match(loop, /--run-base <run_base>/);
});
test('batches call passes --run-base and forwards only operator-typed --lite', () => {
  assert.match(loop, /adev implement batches --plan <plan-path> --run-base <run_base> \[--lite\]/);
  assert.match(loop, /Pass `--lite` only when the operator typed it/);
});
test('mixed plans run in plan order; consecutive lite tasks run inline', () => {
  assert.match(lite, /plan order/); assert.match(lite, /Consecutive `lite` tasks run inline/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/implement-rigor-ladder.test.mjs tests/skills/implement-graduated-review-depth.test.mjs`
Expected: FAIL — `ENOENT .../lite-mode.md`

- [ ] **Implement**

- **`references/lite-mode.md`** has these sections:
  1. **When it applies.** The provisional `resolve-depth` returned `depth: lite`.
  2. **Inline execution:**
     - emit `plan_task` `in_progress`;
     - `adev implement snapshot-base` (keep the tree id);
     - implement in your own context under `<ADEV_ROOT>/skills/implement/references/agent-default-mandate.md` and `test-integrity.md`;
     - no `Agent` dispatch;
     - no `adev test-policy resolve`, no `test_depth_assigned`;
     - keep narration terse (heuristic: cache reads).
  3. **Tripwire.** Before the commit, run `adev implement resolve-depth … --pass final --run-base <run_base> --base-sha <snapshot>`.
     - The verb's tripwire is keyed on the task's provisional `lite` resolution, so it always runs for a `lite` task.
     - Echo `LITE_TRIPWIRE_ESCALATED` and the legs to the transcript.
     - Still `lite`: run the 2h post-task gates, make one commit with `Spec:` and `Plan-task:` and no `Review-round:` trailer, then emit `plan_task` `done`.
     - Escalated: continue at Step 2f-pre's branch for the returned depth (`quick` → synthesized reviewer, `full` → both stages), with the review loop capped as in 2g.
  4. **Ordering.** Tasks run in plan order. Consecutive `lite` tasks run inline. `batches` reports granted tasks as `solo` with `reason: lite`.
  5. **Run summary.** Copy the `lite authorized via <source>` line, and each task's `lite_denied` value other than `not-authorized`, verbatim.
  6. **End of run.** Point to `integration-gate.md` and `step-3-final-review.md` (Task 13).
  7. **The BEH-15 halt for an escalated task.** It is the same Step 2g halt; `--lite` changes nothing about it.
  8. **Hard gates that `lite` never relaxes (BEH-14):** strict `lifecycle.gate_mode`, `adev gate require`, the non-main-branch stop, skill extensions, `test-integrity.md`, quality-gate fail-fast, destructive-action gates, constitution checks.

  No inline Node, and no `adev` verb inside a section that also shows inline Node.
- **`step-2-per-task-loop.md`:**
  - `:5`: `adev implement batches --plan <plan-path> --run-base <run_base> [--lite] [--max-batch <n>] [--no-batch]`. Pass `--lite` only when the operator typed it; policy authorization is read by the verb.
  - `:68`: `resolve-depth … --run-base <run_base> [--tier <t>] [--lite] [--parallel] [--review-cycles <n>] --pass provisional`. `--in-batch` is removed. On `depth: lite`, follow `<ADEV_ROOT>/skills/implement/references/lite-mode.md` instead of 2b–2g.
  - 2f-pre: add `--run-base <run_base>` and echo `LITE_TRIPWIRE_ESCALATED`.
  - 2f (WR-8): replace "After the last cycle, escalate to the user" with "After the last cycle, Stage 1 has not passed: apply the Step 2g terminal handling (`plan_task` `blocked` with `LOOP_BUDGET_EXHAUSTED`, execution state `status: "blocked"`, no later task starts, the halt message names the code, task id and outstanding findings). The halt never waits for input." Reuse the 2g message shape, with "spec-compliance review did not converge".
  - 2g: add one sentence. The halt applies to every run (interactive, headless, scheduled, build step), and as a build step its message is the `STEP_RESULT` with `status: BLOCKED`.

- [ ] **Verify test passes**

Run: `node --test tests/skills/implement-rigor-ladder.test.mjs tests/skills/implement-graduated-review-depth.test.mjs tests/skills/implement-step-pointers.test.mjs tests/skills-no-inline-node.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/implement/references/lite-mode.md skills/implement/references/steps/step-2-per-task-loop.md tests/skills/implement-rigor-ladder.test.mjs tests/skills/implement-graduated-review-depth.test.mjs
git commit -m "feat(implementation): add lite-mode execution path and route Stage 1 cap to the 2g halt" -m "<trailers 12>"
```

### Task 13: Implement references — depth contract, batched mode, end-of-run gates [specialist: none]

**Charter capability:** Key Behaviors — per-task 2-stage review, thinned by depth (BEH-4 batched review, BEH-9, BEH-13)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 12
**Files:**
- Modify: `skills/implement/graduated-review-depth.md`
- Modify: `skills/implement/references/batched-mode.md`
- Modify: `skills/implement/references/integration-gate.md`
- Modify: `skills/implement/references/steps/step-3-final-review.md`
- Modify: `skills/implement/references/failure-path-exit-event.md` (abort table row only)
- Test: `tests/skills/implement-rigor-ladder.test.mjs` (extend)

**Tests:** extend `tests/skills/implement-rigor-ladder.test.mjs`.

**Context to load:** Task 13 packet.

- [ ] **Write failing test**

```javascript
const read = (p) => readFileSync(p, 'utf8');
test('depth contract describes the ladder', () => {
  const d = read('skills/implement/graduated-review-depth.md');
  for (const s of ['default-quick', 'lite-grant', 'lite-tripwire', 'lite_denied', 'lite_source', 'routing'])
    assert.ok(d.includes(s), s);
  assert.doesNotMatch(d, /predicate-grant/);
  assert.match(d, /`batched-task` and `scope-mismatch` are no longer floor legs/);
});
test('batched-mode: a batched task is reviewed at its own resolved depth; lite never batches', () => {
  const b = read('skills/implement/references/batched-mode.md');
  assert.match(b, /at the task's resolved review depth/); assert.match(b, /`lite` tasks are never batched/);
});
test('integration gate: whole-run quality gates once after any lite task, QUALITY_GATES_FAILED, --verdict FAIL', () => {
  const g = read('skills/implement/references/integration-gate.md');
  assert.match(g, /QUALITY_GATES_FAILED/); assert.match(g, /--status failed --verdict FAIL/); assert.match(g, /any task in the run resolved `lite`/);
});
test('Step 3 skipped only when every task resolved lite', () => {
  assert.match(read('skills/implement/references/steps/step-3-final-review.md'), /only when every task in the run resolved `lite`/);
});
test('failure table gains QUALITY_GATES_FAILED; the do-not-double-emit line is unchanged (CON-1)', () => {
  const f = read('skills/implement/references/failure-path-exit-event.md');
  assert.match(f, /QUALITY_GATES_FAILED/); assert.ok(f.includes(FAILURE_PATH_LINE_22)); // literal captured at plan time
});
test('no implement skill text tells the agent to choose lite (BEH-13)', () => {
  // scan skills/implement/**; every line matching /--lite|--tier lite/ is an argument definition,
  // an operator-forwarding rule ("only when the operator typed it"), or the no-self-selection rule
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/implement-rigor-ladder.test.mjs`
Expected: FAIL — `default-quick` missing from `graduated-review-depth.md`

- [ ] **Implement**

- **`graduated-review-depth.md`.** Rewrite for the ladder. It covers:
  - the baseline (`quick` default);
  - the floor legs (`risk-level` narrowed, `routing`, `boundary`, `sensitive-path`, `critical-finding`), and that `batched-task` and `scope-mismatch` are no longer floor legs;
  - the `lite` grant and tripwire;
  - the `source` values;
  - `lite_denied` and `lite_source`.

  Keep the "Required reading" anchor that `step-2-per-task-loop.md` points to.
- **`batched-mode.md`.** A batched task is reviewed "at the task's resolved review depth". `lite` tasks are never batched.
- **`integration-gate.md` (BEH-9).**
  - When any task in the run resolved `lite`, run the constitution's quality gates once over the whole run, fail-fast, even when no `post-implement` gate is selected.
  - On failure, emit `adev report --type step … --status failed --verdict FAIL` and name `QUALITY_GATES_FAILED` in the output.
- **`step-3-final-review.md`.** Skipped only when every task in the run resolved `lite`. Otherwise it runs as today.
- **`failure-path-exit-event.md`.** Add a `QUALITY_GATES_FAILED` row to the abort table. Line 22 is unchanged.

- [ ] **Verify test passes**

Run: `node --test tests/skills/implement-rigor-ladder.test.mjs tests/skills/implement-batched-mode.test.mjs tests/skills/implement-integration-gate.test.mjs tests/skills/implement-graduated-review-depth.test.mjs tests/skills/skill-size-cap.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/implement/graduated-review-depth.md skills/implement/references/batched-mode.md skills/implement/references/integration-gate.md skills/implement/references/steps/step-3-final-review.md skills/implement/references/failure-path-exit-event.md tests/skills/implement-rigor-ladder.test.mjs
git commit -m "feat(implementation): update depth contract, batched mode and end-of-run gates for the ladder" -m "<trailers 13>"
```

### Task 14: `adev init prompt implement-rigor` verb, dispatch and init step [specialist: none]

**Charter capability:** Key Behaviors — project onboarding of the implement rigor choice (BEH-12)
**Strategy:** unit (source: detected, confidence: high)
**Files:**
- Create: `lib/cli/init-prompt-implement-rigor.mjs`
- Modify: `cli/index.mjs:2111-2115`
- Modify: `skills/init/references/behavior-by-project-state.md` (new step after `:748`)
- Test: `tests/cli/init-prompt-implement-rigor.test.mjs` (create)
- Test: `tests/skills/init-implement-rigor-step.test.mjs` (create)

**Tests:** create `tests/cli/init-prompt-implement-rigor.test.mjs` (BEH-12 suite) and `tests/skills/init-implement-rigor-step.test.mjs`.

**Context to load:** Task 14 packet.

- [ ] **Write failing test**

```javascript
// init-prompt-implement-rigor.test.mjs — scripted stdin with a TTY shim, as in init-prompt-implementation-mode.test.mjs
test('typed exact-case choice writes the enum constant to medium and low only', { timeout: 10_000 }, async (t) => {
  const root = fixture(t, { preset: 'standard' });
  const r = await run(root, [], { tty: true, answers: ['quick'] });
  assert.equal(r.code, 0);
  const p = parsePolicies(root);
  assert.equal(p.medium.implement_mode, 'quick'); assert.equal(p.low.implement_mode, 'quick'); assert.equal(p.high.implement_mode, 'quick');
  assert.equal(p.medium.review_mode, ORIGINAL.medium.review_mode); // other keys preserved
});
test('Lite, blank, and "lite\\nhigh: full" are refused and re-prompted', { timeout: 10_000 }, async (t) => { /* answers ['Lite','', 'lite\nhigh: full'] → exit 1 INVALID_IMPLEMENT_RIGOR, file unchanged */ });
test('three invalid answers / closed input / exhausted answers → exit 1, nothing written', { timeout: 10_000 }, async (t) => { /* three sub-cases */ });
test('--mode bogus → INVALID_IMPLEMENT_RIGOR, no prompt shown', async (t) => { /* ... */ });
test('choosing lite prints the warning first; choosing full also writes high', async (t) => { /* ... */ });
test('non-interactive: existing value kept; preset defaults strict→full, standard→quick, prototype→quick; prints --mode lite hint', async (t) => { /* ... */ });
test('reachable through cli/index.mjs dispatch', (t) => { /* spawn node cli/index.mjs init prompt implement-rigor --mode quick */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/init-prompt-implement-rigor.test.mjs tests/skills/init-implement-rigor-step.test.mjs`
Expected: FAIL — `Cannot find module .../init-prompt-implement-rigor.mjs`

- [ ] **Implement**

- **The verb.** Mirror `init-prompt-implementation-mode.mjs`:
  - `const CHOICES = Object.freeze(['lite', 'quick', 'full'])`, with exact, case-sensitive membership.
  - Lines are read through the readline async iterator. `MAX_ATTEMPTS = 3`. EOF or iterator exhaustion exits 1 with `INVALID_IMPLEMENT_RIGOR`.
  - The verb writes `CHOICES[idx]`, never the input. It splice-edits `.context-index/governance/risk-policies.yaml`: `implement_mode` for `medium` and `low`, plus `high` only when the choice is `full`. Every other key is preserved.
  - Choosing `lite` prints the warning (per-task review skipped for route-eligible tasks, deferred to `/adev:validate`) before the write.
  - Non-interactive runs (`!process.stdin.isTTY` and no `--mode`) never overwrite an existing `implement_mode`. Where none exists, they write the preset default (`--preset`, or the manifest's `risk_tier`, else `standard`) and print that `lite` is available through `--mode lite`.
- **Dispatch.** Add a branch beside `implementation-mode` in `cli/index.mjs`.
- **Init reference.** Add a new step after the implementation-mode step. It shows the menu, then: "Invoke `adev init prompt implement-rigor` to drive this step". It also notes the step runs for every `risk_tier` preset and on re-runs, and that all choice, validation and write logic lives in the verb.

- [ ] **Verify test passes**

Run: `node --test tests/cli/init-prompt-implement-rigor.test.mjs tests/skills/init-implement-rigor-step.test.mjs tests/cli/init-prompt-implementation-mode.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/init-prompt-implement-rigor.mjs cli/index.mjs skills/init/references/behavior-by-project-state.md tests/cli/init-prompt-implement-rigor.test.mjs tests/skills/init-implement-rigor-step.test.mjs
git commit -m "feat(init): add adev init prompt implement-rigor" -m "<trailers 14>"
```

### Task 15: Preset templates and this repo's risk policy [REQUIRES HUMAN APPROVAL] [specialist: none]

**Charter capability:** Key Behaviors — default implement rigor (Output Contract "Templates"; review CON-4)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `templates/risk-policies-template.yaml:20, 28` (`full` → `quick`)
- Modify: `.context-index/governance/risk-policies.yaml:20` (`high` `full` → `quick`)
- Modify: `tests/governance/risk-policies-implement-mode.test.mjs` (assert the new live values)
- Test: `tests/risk-tiers/implement-mode-presets.test.mjs` (create)

**Tests:** create `tests/risk-tiers/implement-mode-presets.test.mjs`.

**Context to load:** Task 15 packet.

This task changes the default review rigor every new standard-preset project inherits. The ADR 0020 decision covers it. Present the diff to the operator, and commit only on approval. `.context-index/governance/**` is a built-in sensitive path, so this task resolves `full` depth.

- [ ] **Write failing test**

```javascript
test('standard template: quick at every level (risk-level floor still forces full for non-auto-agent high-risk tasks)', () => {
  const p = parseYaml(readFileSync('templates/risk-policies-template.yaml', 'utf8')).policies;
  for (const l of ['high', 'medium', 'low']) assert.equal(p[l].implement_mode, 'quick', l);
});
test('prototype preset is already quick at every level and unchanged (CON-4)', () => { /* assert values; no lite */ });
test('strict preset unchanged: full at every level', () => { /* ... */ });
test('no preset ships lite (lite arrives only through BEH-12)', () => { /* ... */ });
test('this repository matches the standard template', () => { /* .context-index/governance/risk-policies.yaml */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/risk-tiers/implement-mode-presets.test.mjs`
Expected: FAIL — `high` is `full` in the standard template

- [ ] **Implement**

Edit the three `implement_mode` values: the template's `high` and `medium`, and this repo's `high`. Leave `prototype` and `strict` untouched. Update any comment in those files that describes `full` as the implement default.

- [ ] **Verify test passes**

Run: `node --test tests/risk-tiers/implement-mode-presets.test.mjs tests/governance/risk-policies-implement-mode.test.mjs tests/risk-tiers/tier-config.test.mjs`
Expected: PASS

- [ ] **Commit** (after operator approval)

```bash
git add templates/risk-policies-template.yaml .context-index/governance/risk-policies.yaml tests/risk-tiers/implement-mode-presets.test.mjs tests/governance/risk-policies-implement-mode.test.mjs
git commit -m "feat(governance): default standard preset implement_mode to quick" -m "<trailers 15>"
```

### Task 16: Route `lite_eligible` output and summary line [specialist: none]

**Charter capability:** Key Behaviors — routing signal for rigor (BEH-13)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 4
**Files:**
- Modify: `lib/cli/route.mjs:110-116`
- Modify: `skills/route/SKILL.md:116-118` (Rigor Tier Signal) and the summary step
- Test: `tests/cli/route-emit-sidecar.test.mjs` (extend)
- Test: `tests/skills/route-lite-eligible.test.mjs` (create)

**Tests:** extend `tests/cli/route-emit-sidecar.test.mjs`; create `tests/skills/route-lite-eligible.test.mjs`.

**Context to load:** Task 16 packet.

- [ ] **Write failing test**

```javascript
test('emit-sidecar output carries lite_eligible computed by liteEligible', (t) => {
  const out = JSON.parse(emit(t, [auto(0.8), auto(0.6), auto(0.4), assisted(0.9)]).stdout);
  assert.deepEqual(out.lite_eligible, { count: 2, total: 4 });
});
test('route SKILL prints lite-eligible line and cites liteEligible instead of restating the rule', () => {
  const s = readFileSync('skills/route/SKILL.md', 'utf8');
  assert.match(s, /lite-eligible: <count> of <total>/);
  assert.match(s, /liteEligible/);
  assert.doesNotMatch(s, /no dimension scores below 3/); // the restated rule is gone
  assert.match(s, /eligibility signal, never an authorization/i);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/route-emit-sidecar.test.mjs tests/skills/route-lite-eligible.test.mjs`
Expected: FAIL — `lite_eligible` undefined

- [ ] **Implement**

- `route.mjs`: import `liteEligible` and add `lite_eligible: { count, total }` to the success JSON. The sidecar schema is unchanged.
- `skills/route/SKILL.md`:
  - Replace the prose rule with: "A task is 'easy' exactly when `liteEligible(entry)` (`lib/implement/review-depth.mjs`) is true. `adev route emit-sidecar` reports the count."
  - Print `lite-eligible: <count> of <total>` in the summary.
  - State that this is an eligibility signal, never an authorization, so route never passes `--lite`.
  - Keep the `--tier quick` recommendation for review-specs/validate.

- [ ] **Verify test passes**

Run: `node --test tests/cli/route-emit-sidecar.test.mjs tests/skills/route-lite-eligible.test.mjs tests/skills/skill-size-cap.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/route.mjs skills/route/SKILL.md tests/cli/route-emit-sidecar.test.mjs tests/skills/route-lite-eligible.test.mjs
git commit -m "feat(implementation): report lite-eligible task count from route" -m "<trailers 16>"
```

### Task 17: Tier forwarding — governance dispatch, build, work, review-specs [specialist: none]

**Charter capability:** Key Behaviors — graduated rigor tiers across gate skills (BEH-1 governance dispatch, BEH-11)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `lib/cli/governance.mjs:321-351, 779-791`
- Modify: `skills/build/step4-tier-propagation.md`
- Modify: `skills/build/SKILL.md` (Arguments)
- Modify: `skills/work/SKILL.md:93-94`
- Modify: `skills/review-specs/SKILL.md:38, 117`
- Test: `tests/cli/governance-dispatch.test.mjs` (extend)
- Test: `tests/skills/build-tier-propagation.test.mjs` (extend)
- Test: `tests/skills/rigor-ladder-forwarding.test.mjs` (create)

**Tests:** extend `tests/cli/governance-dispatch.test.mjs` and `tests/skills/build-tier-propagation.test.mjs`; create `tests/skills/rigor-ladder-forwarding.test.mjs` (BEH-10/BEH-11 suite, extended in Task 18).

**Context to load:** Task 17 packet.

- [ ] **Write failing test**

```javascript
test('governance dispatch --tier lite plans the quick reviewer set and prints the mapping line', (t) => {
  const r = runCli(root, ['governance', 'dispatch', '--spec', SPEC, '--tier', 'lite', '--json']);
  // the --json envelope spreads buildDispatchPlan's result, which carries `tier`
  assert.equal(JSON.parse(r.stdout).tier, 'quick'); assert.match(r.stderr, /--tier lite runs as quick/);
});
test('build forwards --lite/--tier lite to implement as --lite and --tier lite to review-specs/validate', () => {
  const s = readFileSync('skills/build/step4-tier-propagation.md', 'utf8');
  assert.match(s, /append `--lite`/); assert.match(s, /never add/i);
});
test('work forwards only operator-typed --lite/--tier lite', () => {
  assert.match(readFileSync('skills/work/SKILL.md', 'utf8'), /only when the operator typed it/);
});
test('review-specs accepts --tier lite as quick with one printed line', () => {
  assert.match(readFileSync('skills/review-specs/SKILL.md', 'utf8'), /`--tier <full\|quick\|lite>`[^\n]*`lite` runs exactly as `quick`/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/governance-dispatch.test.mjs tests/skills/build-tier-propagation.test.mjs tests/skills/rigor-ladder-forwarding.test.mjs`
Expected: FAIL — `INVALID_TIER: --tier must be one of: full, quick (got "lite")`

- [ ] **Implement**

- **`governance.mjs`.** Accept `lite`, map it to `quick` before `buildDispatchPlan`, and print one line on stderr (`--tier lite runs as quick for review-specs`), so the `--json` stdout stays parseable. Update both usage strings and the help text.
- **Build.**
  - `step4-tier-propagation.md`: if the operator passed `--lite` or `--tier lite` to `/adev:build`, append `--lite` to the implement dispatch. Otherwise forward `--tier <t>` as today.
  - Steps 1 and 5 forward `--tier lite` unchanged.
  - Arguments documents `--lite`.
  - Never add either flag on your own.
- **Work.** Add the same operator-typed-only forwarding beside the `--tier quick` bullet at `:93`.
- **Review-specs.** Add `lite` to the `--tier` argument docs and to the precedence list at `:117`, with the rule "`lite` runs exactly as `quick`; print `--tier lite runs as quick here`".

- [ ] **Verify test passes**

Run: `node --test tests/cli/governance-dispatch.test.mjs tests/skills/build-tier-propagation.test.mjs tests/skills/rigor-ladder-forwarding.test.mjs tests/skills/skill-size-cap.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/governance.mjs skills/build/step4-tier-propagation.md skills/build/SKILL.md skills/work/SKILL.md skills/review-specs/SKILL.md tests/cli/governance-dispatch.test.mjs tests/skills/build-tier-propagation.test.mjs tests/skills/rigor-ladder-forwarding.test.mjs
git commit -m "feat(implementation): forward lite tiers through build, work, review-specs and governance dispatch" -m "<trailers 17>"
```

### Task 18: Validate `--tier lite` and the `lite-report` advisory [specialist: none]

**Charter capability:** Key Behaviors — validation after implement (BEH-10, BEH-11 validate side; review WR-6)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 10, Task 17
**Files:**
- Modify: `skills/validate/SKILL.md:35` (Arguments), Check 2 (`:149`), Report Format (`:185`)
- Test: `tests/skills/rigor-ladder-forwarding.test.mjs` (extend)

**Tests:** extend `tests/skills/rigor-ladder-forwarding.test.mjs`.

**Context to load:** Task 18 packet.

- [ ] **Write failing test**

```javascript
const v = readFileSync('skills/validate/SKILL.md', 'utf8');
test('validate accepts --tier lite as quick with one printed line', () => {
  assert.match(v, /`--tier <full\|quick\|lite>`[^\n]*`lite` runs exactly as `quick`/);
});
test('validate calls adev implement lite-report and reports the advisory (WR-6)', () => {
  assert.match(v, /adev implement lite-report --spec <spec-path> --json/);
  assert.match(v, /implemented without per-task review/);
});
test('lite tasks\' diffs are in Check 2 scope; validate is never skipped', () => {
  const check2 = section(v, '### Check 2: Spec Compliance');
  assert.match(check2, /lite-report/); assert.match(check2, /task_ids/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/rigor-ladder-forwarding.test.mjs`
Expected: FAIL — no `adev implement lite-report` in `skills/validate/SKILL.md`

- [ ] **Implement**

- **Arguments.** Add `lite` to `--tier`: "`lite` runs exactly as `quick`; print `--tier lite runs as quick here`".
- **Check 2.** Before Check 2 runs, call `adev implement lite-report --spec <spec-path> --json`. When `count > 0`, include the diffs of the commits whose `Plan-task:` trailer matches `task_ids` in the spec-compliance scope.
- **Report Format.** Add an advisory row: "implemented without per-task review: <count> (<task_ids>)". Emit it only when the count is non-zero.
- Validate is never skipped, and its own tier is unchanged. If the body nears the size guidance, put the advisory detail in a `references/` file behind an `<ADEV_ROOT>` pointer. Do not trim.

- [ ] **Verify test passes**

Run: `node --test tests/skills/rigor-ladder-forwarding.test.mjs tests/skills/skill-size-cap.test.mjs tests/skills-no-inline-node.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/validate/SKILL.md tests/skills/rigor-ladder-forwarding.test.mjs
git commit -m "feat(validate): report tasks implemented without per-task review" -m "<trailers 18>"
```

### Task 19: Cross-spec amendments and ADR 0020 acceptance [REQUIRES HUMAN APPROVAL] [specialist: none]

**Charter capability:** Key Behaviors — lifecycle artifacts stay consistent with code (BEH-4, BEH-6, BEH-14; Output Contract "Cross-spec amendments", "Governance")
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 13
**Files:**
- Create (via `adev specify amend`): the four amendment specs listed in File Structure
- Modify: `.context-index/adrs/0020-implement-rigor-ladder.md` (Status → Accepted, on approval)
- Test: `tests/specs/implement-rigor-ladder-amendments.test.mjs` (create)

**Tests:** create `tests/specs/implement-rigor-ladder-amendments.test.mjs`.

**Context to load:** Task 19 packet.

- [ ] **Write failing test**

```javascript
const find = (dir, re) => readdirSync(dir).filter((f) => re.test(f)).map((f) => join(dir, f));
test('review-provenance amendment exempts depth: lite from the trailer rule (BEH-6)', () => {
  const [p] = find(IMPL, /^review-provenance-rev-\d+-lite-exemption\.spec\.md$/);
  const s = readFileSync(p, 'utf8');
  assert.match(s, /^amends: .*review-provenance\.spec\.md/m); assert.match(s, /depth: lite/); assert.match(s, /Contract A/);
});
test('batched-task-dispatch amendment: reviewed at the task\'s resolved review depth (C.3)', () => { /* ... */ });
test('graduated-review-depth amendment supersedes B, E, the full fallback, batched-task and scope-mismatch legs', () => { /* ... */ });
test('graduated-rigor-tiers amendment names lite in the invariant; review breadth, not a hard gate (BEH-14)', () => { /* ... */ });
test('lite-mode.md hard-gate list ⊇ the amended invariant\'s gate list', () => { /* cross-file set comparison */ });
test('ADR 0020 status is Accepted', () => { /* only after approval */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/specs/implement-rigor-ladder-amendments.test.mjs`
Expected: FAIL — no amendment files

- [ ] **Implement**

- Run, one per base, filling each scaffold's body with the clauses from the spec's amendment table and updating the contradicted acceptance criteria:
  - `adev specify amend --spec .context-index/specs/features/implementation/review-provenance.spec.md --descriptor lite-exemption`
  - `adev specify amend --spec .context-index/specs/features/implementation/batched-task-dispatch.spec.md --descriptor resolved-depth`
  - `adev specify amend --spec .context-index/specs/features/implementation/graduated-review-depth.spec.md --descriptor rigor-ladder`
  - `adev specify amend --spec .context-index/specs/cross-cutting/graduated-rigor-tiers.spec.md --descriptor lite-tier`

  No base spec is edited in place.
- Record the plan-time decisions as a "Notes for implement-rigor-ladder revision 4" list in the ADR's Consequences section. They are inputs for a later `/adev:specify --revise` and are not applied to the spec here:
  - CON-3 (`--tier quick` → `policy-baseline`);
  - RI-6 (no `assertSafeArgvToken` reuse);
  - BD-13 (uncommitted sidecar handling);
  - the final pass keys the tripwire off the recorded provisional `lite` resolution rather than re-evaluating authorization (plan-review finding: BEH-7's command line does not repeat `--lite`);
  - BD-11 (ignored-path lower bound = `in_progress` timestamp);
  - TR-6/TR-7 (no maximum on `max_review_cycles`, an accepted operator choice; the per-loop cap gives `2 × cap` for `full` and `1 × cap` for `quick`);
  - the BEH-9/BEH-14 post-task-gate interpretation.
- **Human approval:** present ADR 0020 and the amendments to the operator. On approval, set the status to **Accepted** with the date. Without approval, leave it Proposed and report the task blocked. The ADR test is the only failing assertion in that case.

- [ ] **Verify test passes**

Run: `node --test tests/specs/implement-rigor-ladder-amendments.test.mjs tests/specify-amend.test.mjs tests/adrs`
Expected: PASS

- [ ] **Commit**

```bash
git add .context-index/specs/features/implementation/*-rev-*-*.spec.md .context-index/specs/cross-cutting/graduated-rigor-tiers-rev-*-lite-tier.spec.md .context-index/lifecycle-state .context-index/adrs/0020-implement-rigor-ladder.md tests/specs/implement-rigor-ladder-amendments.test.mjs
git commit -m "docs(implementation): amend review-depth specs for the rigor ladder; accept ADR 0020" -m "<trailers 19>"
```

### Task 20: Docs and provider-mirror regeneration [specialist: none]

**Charter capability:** Key Files — end-user and agent reference docs (Output Contract "Docs"; BEH-13 grep criterion)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** every other task (Tasks 1–19, Task 21, Task 22)
**Files:**
- Modify: `docs/skill-reference.md` (implement, route, init, build), `docs/cli-reference.md` (`init prompt implement-rigor`, `implement check-flags`, `implement lite-report`, the new `resolve-depth` and `batches` flags and output fields), `docs/configuration.md` (`implement_mode: lite`; the `implement_mode` vs `implementation_mode` distinction; `implement.max_review_cycles`), `docs/concepts.md` (the ladder)
- Modify: `providers/codex/skills/**` (generated)
- Test: `tests/docs/implement-rigor-ladder-docs.test.mjs` (create); `tests/docs/implement-resolve-depth-docs.test.mjs` (extend)

**Tests:** create `tests/docs/implement-rigor-ladder-docs.test.mjs`; extend `tests/docs/implement-resolve-depth-docs.test.mjs`.

**Context to load:** Task 20 packet.

- [ ] **Write failing test**

```javascript
test('cli-reference documents the new verbs and flags', () => {
  const d = readFileSync('docs/cli-reference.md', 'utf8');
  for (const s of ['adev implement check-flags', 'adev implement lite-report', 'adev init prompt implement-rigor', '--run-base', '--lite', 'lite_denied', 'lite_source', 'escalated_from', 'INVALID_COMMIT_ID'])
    assert.ok(d.includes(s), s);
});
test('configuration distinguishes implement_mode from implementation_mode', () => { /* ... */ });
test('concepts describes lite / quick / full', () => { /* ... */ });
test('BEH-13: --lite / --tier lite in skills/ providers/ docs/ are only definitions, forwarding rules or operator examples', () => {
  // walk skills/, providers/, docs/ (live surfaces only — not .context-index/, which quotes the pattern);
  // for each line matching /--lite|--tier lite/, assert it also matches an allow-list of shapes:
  // argument bullet, "forward"/"operator" forwarding rule, a fenced operator example, or the no-self-selection rule.
});
test('provider mirror is in sync', () => { /* run sync-provider-skills.mjs --check, or compare outputs */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/docs/implement-rigor-ladder-docs.test.mjs tests/docs/implement-resolve-depth-docs.test.mjs`
Expected: FAIL — `adev implement check-flags` missing from `docs/cli-reference.md`

- [ ] **Implement**

Write the four docs sections. Remove `--in-batch` from the documented `resolve-depth` usage, or mark it "accepted and ignored". Then regenerate the mirrors with `node scripts/sync-provider-skills.mjs`. Do not hand-edit them.

- [ ] **Verify test passes**

Run: `node --test tests/docs/implement-rigor-ladder-docs.test.mjs tests/docs/implement-resolve-depth-docs.test.mjs && npm test`
Expected: PASS (full suite green)

- [ ] **Commit**

```bash
git add docs providers/codex/skills tests/docs/implement-rigor-ladder-docs.test.mjs tests/docs/implement-resolve-depth-docs.test.mjs
git commit -m "docs(implementation): document the implement rigor ladder" -m "<trailers 20>"
```

### Task 21: EV-1 quick and lite arms, BEH-15 non-convergence fixture, EV-5 distribution replay [specialist: none]

**Charter capability:** Key Behaviors — measured review cost and quality (EV-1, EV-5, AC BEH-6/BEH-9/BEH-15 observation)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 13
**Files:**
- Modify: `tests/evals/implement-rigor-ladder/run-ab-eval.mjs` (enable `quick` and `lite`; threshold evaluation; `--fixture nonconvergent --mode build|direct`)
- Create: `tests/evals/implement-rigor-ladder/fixture-nonconvergent/` (escalated-`lite` task whose code-quality loop never converges; a second task whose spec-compliance loop never converges — WR-8; a third task after both to prove "no later task starts")
- Create: `tests/evals/implement-rigor-ladder/replay-distribution.mjs`
- Create: `tests/evals/implement-rigor-ladder/replay-distribution.test.mjs`
- Test: `tests/lib/evals/implement-rigor-ladder-smoke.test.mjs` (extend)

**Tests:** extend `tests/lib/evals/implement-rigor-ladder-smoke.test.mjs`; create `tests/evals/implement-rigor-ladder/replay-distribution.test.mjs` (runs under `npm run test:evals`).

**Context to load:** Task 21 packet.

- [ ] **Write failing test**

```javascript
// smoke (npm test)
test('quick and lite arms are live-enabled and thresholds are declared', () => {
  const plan = dryRun();
  assert.equal(plan.arms.every((a) => a.live), true);
  assert.deepEqual(plan.thresholds, { lite_wall_clock_vs_full: 0.5, quick_wall_clock_vs_full: 0.8, lite_escaped_defects_max_over_full: 1 });
});
test('nonconvergent fixture dry-run lists both modes and the Stage 1 case (WR-8)', () => {
  const plan = dryRun(['--fixture', 'nonconvergent']);
  assert.deepEqual(plan.modes, ['build', 'direct']);
  assert.ok(plan.fixture.cases.includes('stage1-spec-compliance-nonconvergent'));
  assert.deepEqual(plan.expect, { plan_task: 'blocked', execution_state: 'blocked', later_task_started: false, step_failed: false, waits_for_input: false, build_status: 'BLOCKED' });
});
```

```javascript
// replay-distribution.test.mjs (test:evals)
test('replay imports the shipped resolver and is deterministic', () => {
  const a = runReplay(); const b = runReplay();
  assert.deepEqual(a, b); assert.ok(a.resolverModule.endsWith('lib/implement/review-depth.mjs'));
});
test('trip computation applies the BEH-7 exemption to trailer-matched commits', () => { /* synthetic git history fixture */ });
test('distribution.json has per-task, per-plan tables and floor-leg tally', () => { /* ... */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/implement-rigor-ladder-smoke.test.mjs`
Expected: FAIL — `thresholds` undefined; `quick`/`lite` not live

- [ ] **Implement**

- **Harness.** Enable the arms. Evaluate the EV-1 thresholds against the Task 1 baseline, and fail loudly when the baseline file is missing. Add the non-convergent fixture runner, which checks the lifecycle log and execution state for the expected terminal shape in both modes.
- **Replay:**
  - Walk every `*.routing.json` under `.context-index/specs/`. Resolve each task with the shipped `resolveImplementReviewDepth`, with `lite` authorized and governance from `HEAD`.
  - Compute historical trips from `git log` trailers (`Spec:` and `Plan-task:`) against each task's declared `Files:` (`readTaskFiles`), with `isTripwireExempt`. Apply the corpus trip rate to tasks with no matching commit.
  - Write `results/distribution.json` with `{ per_task, per_plan, shares: { lite, quick, full }, floor_legs }`.
  - Make no model calls.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/implement-rigor-ladder-smoke.test.mjs && npm run test:evals -- tests/evals/implement-rigor-ladder/replay-distribution.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add tests/evals/implement-rigor-ladder tests/lib/evals/implement-rigor-ladder-smoke.test.mjs
git commit -m "test(implementation): add EV-1 lite/quick arms, BEH-15 fixture and EV-5 replay" -m "<trailers 21>"
```

### Task 22: EV-2 comparison arms, EV-3 plugin eval cases, run all evals and commit results [specialist: none]

**Charter capability:** Key Behaviors — release-blocking evaluation (EV-1–EV-5 acceptance)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 21
**Files:**
- Create: `evals/implement-no-self-selected-lite/`, `evals/implement-lite-refused-high-risk/`, `evals/init-offers-implement-rigor/`
- Modify: `tests/evals/comparison/run-comparison.mjs` (`adev-quick`, `adev-lite` arms; `adev-built` documented as the `full` arm; wall-clock per arm)
- Modify: `tests/evals/comparison/reports/summary.json`, `tests/evals/implement-rigor-ladder/results/*` (live outputs)
- Test: `tests/lib/evals/plugin-eval-cases-rigor-ladder.test.mjs` (create)

**Tests:** create `tests/lib/evals/plugin-eval-cases-rigor-ladder.test.mjs`. No existing test validates `evals/*/case.yaml`, because `tests/lib/evals/rubric-coverage.test.mjs` and `skill-regression-catalog.test.mjs` cover the `tests/evals/` rubric catalogs. The new suite checks that each case directory has `case.yaml`, `prompt.md`, `fixture.sh` and `graders/`, and that `case.yaml` parses with the same top-level keys as `evals/lifecycle-gate-respected/case.yaml`. It lives in `tests/lib/evals/` so it runs under `npm test`.

**Context to load:** Task 22 packet.

- [ ] **Write failing test**

```javascript
const REF_KEYS = Object.keys(parseYaml(readFileSync('evals/lifecycle-gate-respected/case.yaml', 'utf8'))).sort();
test('the three EV-3 cases exist with the standard case layout', () => {
  for (const id of ['implement-no-self-selected-lite', 'implement-lite-refused-high-risk', 'init-offers-implement-rigor']) {
    for (const f of ['case.yaml', 'prompt.md', 'fixture.sh', 'graders']) assert.ok(existsSync(join('evals', id, f)), `${id}/${f}`);
    assert.deepEqual(Object.keys(parseYaml(readFileSync(join('evals', id, 'case.yaml'), 'utf8'))).sort(), REF_KEYS, id);
  }
});
test('run-comparison declares adev-quick and adev-lite arms with wall-clock', () => { /* --dry-run */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/plugin-eval-cases-rigor-ladder.test.mjs`
Expected: FAIL — case directories missing

- [ ] **Implement**

- **EV-3 cases:**
  - `implement-no-self-selected-lite`: the grader asserts the transcript contains no `--lite` or `--tier lite` passed to any `adev implement` verb when the operator prompt did not include one.
  - `implement-lite-refused-high-risk`: a `risk_level: high` fixture run with `--lite`. The grader asserts no `review_depth_resolved` event has `depth: lite`.
  - `init-offers-implement-rigor`: the grader asserts the `lite / quick / full` prompt was shown and the typed choice was written.
- **EV-2:** add the arms, and report time per arm.
- **Live runs (operator checkpoint, cost estimate first):**
  - EV-1: at least 3 runs per arm.
  - The BEH-15 fixture in both modes.
  - EV-2 across the four projects.
  - EV-3 through `claude plugin eval`.
  - EV-5 replay.

  Commit every result file. If a threshold misses, do not edit fixtures or sidecars. Record the result and stop for a reviewed threshold change in the spec, as EV-1 and EV-5 require.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/plugin-eval-cases-rigor-ladder.test.mjs && npm test`
Expected: PASS; EV results recorded under `tests/evals/implement-rigor-ladder/results/` and `tests/evals/comparison/reports/summary.json`

- [ ] **Commit**

```bash
git add evals tests/evals/comparison tests/evals/implement-rigor-ladder/results tests/lib/evals/plugin-eval-cases-rigor-ladder.test.mjs
git commit -m "test(implementation): add EV-2/EV-3 rigor-ladder evals and record results" -m "<trailers 22>"
```

---

### Task 23: Revision 4 resolver — scoreless `liteEligible`, `no-routing-entry`, the lite cap [specialist: none]

**Charter capability:** Key Behaviors — per-task review depth (revision 4, BEH-4, BEH-5, BEH-7, BEH-13)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 21
**Files:**
- Modify: `lib/implement/review-depth.mjs` (`liteEligible`, `liteGrant`, `resolveFloor`, `liteTripwire`, `resolveImplementReviewDepth`, module header comment)
- Modify: `lib/implement/provisional-inputs.mjs` (`liteUnavailable` value `no-routing-entry`)
- Modify: `skills/implement/references/lite-mode.md`, `skills/implement/graduated-review-depth.md`, `skills/route/SKILL.md` (rule text only: the grant, the cap, `quick`-only tripwire escalation)
- Modify: `tests/evals/implement-rigor-ladder/run-ab-eval.mjs` (`classifyTasks` expected depths under the new rules), `tests/evals/implement-rigor-ladder/replay-distribution.mjs` (comment on invalid scores), `tests/evals/implement-rigor-ladder/fixture/README.md`
- Test: `tests/lib/implement/review-depth-lite-grant.test.mjs`, `tests/lib/implement/lite-eligible-parity.test.mjs`, `tests/lib/implement/provisional-inputs-parity.test.mjs`, `tests/lib/implement/review-depth-tripwire.test.mjs`, `tests/cli/implement-resolve-depth.test.mjs`, `tests/cli/route-emit-sidecar.test.mjs`, `tests/skills/route-lite-eligible.test.mjs`, `tests/skills/implement-rigor-ladder.test.mjs`, `tests/docs/*`, `tests/lib/evals/implement-rigor-ladder-*.test.mjs`, `tests/evals/implement-rigor-ladder/replay-distribution.test.mjs` (whatever asserts the revision-3 rule)

**Tests:** update the suites above to the revision-4 rule; add the new cases below.

**Context to load:** Task 23 packet (spec BEH-4 "The lite cap", BEH-5 (b), BEH-7, Revision 4 subsection; ADR 0020 "Amendment: revision 4").

- [ ] **Write failing test**
  - `liteEligible`: `auto-agent` and `assisted-agent` entries are eligible whatever their scores (`0.4`, `"0.8"`, `NaN`, missing); `human-only`, a missing entry, and an unknown `selected_agent` are not. It raises no `ROUTING_SCORE_OUT_OF_RANGE`.
  - `liteGrant`: missing entry → `no-routing-entry`; `human-only` → `floor:routing`; `liteUnavailable: 'no-routing-entry'` denies right after (a).
  - Lite cap, provisional: authorized + medium spec + declared sensitive path → `depth: quick`, `floor_applied: true`, `floor_legs: ['sensitive-path']`, `floor_cap: 'quick'`, `lite_denied: 'floor:sensitive-path'`. Same for `boundary`. Unauthorized → `full`, `floor_cap: null`. Authorized + high-risk spec → `full`. `human-only` under authorization → `full`.
  - Lite cap, final pass of a non-lite task: touched sensitive path → `quick` under authorization; `had_critical_finding` → `full`.
  - Tripwire: a `lite` task touching a sensitive path, a boundary path, or an ignored `.env` → `quick`, `source: lite-tripwire`, `escalated_from: lite`, `floor_cap: 'quick'`.
  - `REVIEW_DEPTH_FLOOR_APPLIED` message names the depth the floor gave (`quick` under the cap).
- [ ] **Verify test fails**
  Run: `node --test tests/lib/implement/review-depth-lite-grant.test.mjs tests/lib/implement/review-depth-tripwire.test.mjs`
  Expected: FAIL on the new cases
- [ ] **Implement**
  - `liteEligible(entry)` → `{ eligible: ['auto-agent','assisted-agent'].includes(entry?.selected_agent), warnings: [] }`. Remove `LITE_GRANT_THRESHOLD` and the score validation if nothing else uses them.
  - `liteGrant`: deny `floor:routing` for `human-only` and `no-routing-entry` for anything else not eligible.
  - `resolveFloor` gains `liteCap` (lite authorized and spec not high-risk): when every holding leg is `boundary` or `sensitive-path`, the depth is `quick`; any other leg gives `full`. Return `floor_cap: 'quick' | null`.
  - `liteTripwire` passes `liteCap: true`; with a holding floor leg the depth is `quick`.
  - `resolveImplementReviewDepth` passes `liteCap` on both passes and returns `floor_cap` on every path (`null` when not lowered).
  - Update the rule text in the three skill files and the harness's expected depths (task 4 and 5 become `lite`, task 6 `quick` under the `lite` arm).
- [ ] **Verify test passes**
  Run: `npm test` and `node tests/evals/implement-rigor-ladder/replay-distribution.mjs` (EV-5, record the new shares in the spec's Target distribution table)
  Expected: PASS
- [ ] **Commit**

```bash
git add <the files above>
git commit -m "feat(implementation): widen the lite grant and cap floors at quick under lite" -m "<trailers 23>"
```

---

### Task 24: Revision 4 overhead — `adev implement task-begin` and lean `lite` references [specialist: none]

**Charter capability:** Key Behaviors — per-task execution (revision 4, BEH-17)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 23
**Files:**
- Modify: `lib/cli/implement.mjs` (`task-begin` subcommand with `TASK_BEGIN_FAILED`, usage banner, help; `lite-report` gains the `capped` list, BEH-10)
- Modify: `skills/validate/` advisory text for `capped` tasks
- Modify: `skills/implement/SKILL.md` (Step 2 pointer: `lite-mode.md` for inline tasks, the Step 2 loop only for `quick`/`full`/escalated tasks), `skills/implement/references/lite-mode.md` (self-contained inline path through `task-begin`; the chained commit → `done` → next `task-begin`), `skills/implement/references/steps/step-2-per-task-loop.md` (2a: `task-begin` when `lite` is authorized; 2f-pre: the final pass repeats the operator's `--lite` and `--tier`, BEH-4)
- Modify: `docs/cli-reference.md`, provider mirrors (`node scripts/sync-provider-skills.mjs`)
- Test: `tests/cli/implement-task-begin.test.mjs` (create), `tests/skills/implement-rigor-ladder.test.mjs`

**Tests:** create `tests/cli/implement-task-begin.test.mjs`; extend the skill-text suite.

**Context to load:** Task 24 packet (spec BEH-17, BEH-6, BEH-7; `lib/cli/implement.mjs` `cmdResolveDepth` and `cmdSnapshotBase`; `adev execution-state write`).

- [ ] **Write failing test**
  - `task-begin` prints the same JSON as `resolve-depth --pass provisional` for the same inputs and emits one `review_depth_resolved` (provisional) event.
  - For a `lite` result it also emits `plan_task` `in_progress` and prints `snapshot` (a tree id equal to `snapshot-base`'s for an unchanged tree) and `execution_state`.
  - For a `quick` or `full` result it emits no `plan_task` event and prints neither field.
  - It rejects the same bad flags with the same codes as `resolve-depth` (`INVALID_COMMIT_ID`, missing `--run-base`).
  - A failed snapshot after the provisional event exits 1 with `TASK_BEGIN_FAILED`.
  - `lite-report --json` lists a task whose latest final-pass event is `quick` with a `sensitive-path` or `boundary` leg under `capped`, not under `lite`.
  - Skill text: `lite-mode.md` starts each inline task with `adev implement task-begin`; the body's Step 2 pointer loads `step-2-per-task-loop.md` only for a `quick` or `full` task; `lite-mode.md` states the `agent-default` mandate inline.
- [ ] **Verify test fails**
  Run: `node --test tests/cli/implement-task-begin.test.mjs tests/skills/implement-rigor-ladder.test.mjs`
  Expected: FAIL — unknown subcommand
- [ ] **Implement** — `task-begin` reuses `cmdResolveDepth`'s provisional path (no duplicated resolution), then for `lite` calls `reportPlanTask` (`in_progress`), the execution-state writer (conflict and failure reported, never fatal) and `snapshotWorkingTree`. Rewrite `lite-mode.md` around it, keeping every hard-gate and halt rule.
- [ ] **Verify test passes**
  Run: `npm test`
  Expected: PASS, including `skill-size-cap` and the provider-mirror parity tests
- [ ] **Commit**

```bash
git add <the files above>
git commit -m "feat(implementation): fold lite task bookkeeping into adev implement task-begin" -m "<trailers 24>"
```

---

### Task 25: Revision 4 evidence — EV-1 `lite` re-run and amendment text [specialist: none]

**Charter capability:** Key Behaviors — release-blocking evaluation (revision 4)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 24
**Files:**
- Modify: `.context-index/specs/features/implementation/graduated-review-depth-rev-13-rigor-ladder.spec.md`, `.context-index/specs/cross-cutting/graduated-rigor-tiers-rev-4-lite-tier.spec.md` (the grant and cap text)
- Modify: `tests/evals/implement-rigor-ladder/results/*` (live outputs)

**Tests:** none new; the EV-1 harness's own checks.

**Context to load:** Task 25 packet.

- [ ] **Implement**
  - Update the two amendment specs' statements of the grant and the floors to revision 4.
  - Live (operator-approved on 2026-11-27): EV-1 `lite` arm ×3 at the Task 24 commit, then `--compare` against the four-arm runs at `c90fa324e18f` and the blind judge.
- [ ] **Verify**
  Run: `node tests/evals/implement-rigor-ladder/run-ab-eval.mjs --evaluate`
  Expected: every run valid, quality gates pass, the tripwire fires on its target, no `lite` grant on the sensitive-path task
- [ ] **Commit**

```bash
git add <the files above>
git commit -m "test(implementation): record the revision-4 lite runs" -m "<trailers 25>"
```

---

## Acceptance Criteria Coverage

| Acceptance criterion | Task(s) |
|---|---|
| BEH-1 | Task 2 (values, event), Task 17 (governance dispatch) |
| BEH-2 | Task 2, Task 3 |
| BEH-3, BEH-4 (incl. batched-task-dispatch amendment and equivalence eval) | Task 3, Task 13 (batched-mode text), Task 19 (amendment), Task 22 (equivalence eval re-run under `npm run test:evals`) |
| BEH-5 | Task 4 (truth table, scores, `lite_source`), Task 8 (CLI, run-base immutability, event keys) |
| BEH-6 | Task 12 (skill text), Task 19 (review-provenance amendment), Task 21 and Task 22 (observed in the `lite` arm) |
| BEH-7 | Task 5, Task 8 |
| BEH-8 | Task 7, Task 8, Task 9, Task 12 |
| BEH-9 | Task 13, Task 21 and Task 22 (all-`lite` run observed) |
| BEH-10 | Task 10, Task 18 |
| BEH-11 | Task 17, Task 18 |
| BEH-12 | Task 14, Task 15 |
| BEH-13 | Task 4 (parity), Task 11, Task 13, Task 16, Task 20 (grep), Task 22 (EV-3) |
| BEH-14 | Task 12, Task 19 |
| BEH-15 | Task 12 (incl. WR-8), Task 21 (fixture), Task 22 (live runs) |
| BEH-16 | Task 2, Task 6, Task 7, Task 8, Task 11 |
| EV-1 | Task 1, Task 21, Task 22 |
| EV-2, EV-3 | Task 22 |
| EV-4 | Task 1, Task 4, Task 11, Task 12, Task 16 (+ every unit suite) |
| EV-5 | Task 21, Task 22 |
| SKILL.md size caps, Load Skill Extensions coverage | Task 11, Task 13, Task 16, Task 17, Task 18 (each re-runs `skill-size-cap`; Task 11 re-runs extension coverage) |
| All quality gates | Task 20, Task 22 |

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

From `.context-index/governance/gates.yaml`:

- `test` (deterministic, required, `post-task` + `post-implement`): `npm test`
- `quality-gate` (deterministic, domain `software`): `npm test`
- `integration-test` (deterministic, not required, `post-implement`): `npm run test:evals` — runs EV-5 replay, the batched-task equivalence eval and the comparison harness checks
- No lint or type-check gate is configured (zero-dependency ESM project). The constitution's quality gate is `npm test`.
- All acceptance criteria from the spec satisfied (table above); ADR 0020 Accepted before merge.
