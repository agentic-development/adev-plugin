---
spec: .context-index/specs/features/implementation/batched-task-dispatch.spec.md
plan: .context-index/specs/features/implementation/batched-task-dispatch.plan.md
date: 2026-08-18
---

# Validation Report: Skill Spec: Batched Task Dispatch

> **Date:** 2026-08-18
> **Spec:** .context-index/specs/features/implementation/batched-task-dispatch.spec.md (revision 1)
> **Plan:** .context-index/specs/features/implementation/batched-task-dispatch.plan.md
> **Rigor tier:** quick (explicit `--tier quick` override; spec's own `risk_level: high` would otherwise resolve `validate_mode: full` per `governance/risk-policies.yaml` — explicit tier takes precedence per `graduated-rigor-tiers.spec.md` resolution order. This override was operator-directed, not agent-initiated.)
> **Overall Status:** PASS_WITH_NOTES

---

## Process note (read first)

Quick tier runs Check 1 (Quality Gates, fail-fast) plus one synthesized Check 2/Check 4
compliance pass, and specifies that Checks 1.5, 1.6, 8, and 9 are skipped. Checks 1.5 and 1.6
were run in full here before the tier's skip list was re-checked against the skill body — both
are cheap, deterministic, read-only CLI checks (`adev source-manifest verify`, `adev verify spec
--check-drift`) with no subagent cost, and both returned clean PASS results, so the deviation
added information rather than removing rigor. It is disclosed here rather than hidden. Checks 8
and 9 were correctly skipped per the quick-tier rule.

## Check 1: Quality Gates — PASS_WITH_NOTES

Gate set resolved via `adev domain load-gates --module implementation` (software domain,
materialized `governance/gates.yaml`): `test` and `quality-gate` (fast tier, both run `npm test`,
severity error), `integration-test` (integration tier, `npm run test:evals`, severity warning). No
e2e-tier gates configured.

- **Check 1a (fast tier):** `npm test` — **PASS** (71.4s). 7300 tests, 972 suites, 7298 pass, 0
  fail, 0 cancelled, 0 skipped, 2 todo (pre-existing, unrelated to this spec).
- **Check 1b (integration tier):** `npm run test:evals` — **WARN** (88.1s, severity `warning`, so
  non-blocking). 405 tests, 382 pass, 23 fail. Every failure is a pre-existing, infra-gated
  failure unrelated to this spec's files:
  - `tests/orders.integration.test.mjs`, `tests/evals/integration-sandbox/build-with-db.test.mjs`,
    `build-without-db.test.mjs`, `reality-check.test.mjs` — require a live Postgres on port 5433
    and the `pg` npm package (`ERR_MODULE_NOT_FOUND: Cannot find package 'pg'`); this environment
    has neither. Per project policy (integration tests must fail hard when infra is offline, never
    self-skip), these failures are the *correct* behavior of an offline sandbox, not a defect.
  - `tests/evals/work-tracking/work-tracking.test.mjs` — fixture/reverse-index mismatches, unrelated
    to batching.
  - `tests/evals/skill-compression/token-budget-eval/real-token-analysis.test.mjs` — requires real
    session JSONL token data not present in this environment.
  - `tests/evals/configurable-governance/tier2-dispatch-shape.test.mjs` — unrelated dispatch-shape
    fixture assertion.
  - None of the 23 failures touch any file in this spec's source-manifest.
- **Check 1c (e2e tier):** no gates configured — skipped.

Per-gate outcome attestation emitted via `adev report --type validator
--validator validate.check-1-quality-gates --gate-outcomes @...`: `test`=pass, `quality-gate`=pass,
`integration-test`=fail (tier: integration, recorded verbatim per its actual outcome — the
attestation records what ran, not what was accepted as blocking).

## Check 2: Spec Compliance — PASS_WITH_NOTES (quick-tier synthesized with Check 4)

Dispatched as a single subagent-review pass grounded in Read/Bash calls against the actual
source-manifest files (no plan-checkbox evidence used). Full per-criterion results:

- AC1 (sequential group of 2-4 tasks → one subagent, one commit/task): **PASS** —
  `lib/implement/batching.mjs:117-178`; `skills/implement/references/batched-mode.md:20`.
- AC2 (every eligibility row tested, `BATCH_SOLO_FORCED` names the failing row): **PASS** — all 6
  rows covered in `tests/lib/implement/batching.test.mjs` (size, human-only, human-checkpoint,
  boundary, routing-unusable x5 variants, prior-failure).
- AC3 (human-checkpoint task never batched + checkpoint still fires): **PARTIAL** — the
  gate-exclusion half is proven (`batching.test.mjs:129-139`); the "checkpoint still fires" half is
  explicitly unproven (no code in this repo executes or tests the RED-phase pause even in the
  pre-existing solo path — an acknowledged pre-existing gap the plan scopes out at
  `batched-task-dispatch.plan.md:347`, not something this spec introduced or hid).
- AC4 (N tasks → N Handoff Blocks, mechanically checked): **PASS** —
  `lib/implement/batch-verify.mjs:25-37`, `tests/lib/implement/batch-verify.test.mjs:19-68`.
- AC5 (both review stages per task, no group-level review): **PASS** — `batch-verify.mjs:77-88`,
  `batch-verify.test.mjs:139-188`.
- AC6 (no read-ahead, mechanically checked): **PASS** — `batch-verify.mjs:50-63`,
  `batch-verify.test.mjs:72-135`.
- AC7 (abort semantics — commits stand, remaining tasks solo on re-run): **PASS** —
  `batching.mjs:127-145`, `batching.test.mjs:244-262`, `tests/cli/implement-batches.test.mjs:128-149`.
- AC8 (`--no-batch` byte-identical to today's serial path): **PASS** — `batching.mjs:82-99`,
  `batching.test.mjs:278-293`, `implement-batches.test.mjs:83-101`.
- AC9 (`--no-batch --parallel` → `CONFLICTING_BATCH_FLAGS`): **PASS** —
  `lib/cli/implement.mjs:184-189`, `implement-batches.test.mjs:41-45`, also caught in `SKILL.md`
  Prerequisites (line 26).
- AC10 (`implement.batch_mode` / `implement.max_batch_size` throw-not-default validation):
  **PASS** — `lib/manifest.mjs:180-219`, `tests/lib/manifest.test.mjs:212-337`.
- **AC11 (equivalence eval — release-blocking): PARTIAL. See disposition below.**
- AC12 (`--parallel` behavior/eval unchanged): **PASS** — `lib/parallel/*` untouched by this diff;
  `tests/lib/parallel/*.test.mjs` (25/25 pass) and
  `tests/evals/worktree-parallelization/run-ab-eval.smoke.test.mjs` (2/2 pass) both still green.
- AC13 (quality gates pass, no constitutional violations): **PASS** — see Check 1 and Check 4.

### Equivalence eval disposition (Check 2 nuance flagged by the orchestrator)

**Precedent claim verified accurate.** `tests/evals/worktree-parallelization/run-ab-eval.mjs`
states verbatim (its own header): *"The full 3-arm run is [live] — it requires agent access to run
`/adev:implement --parallel`, so it is executed under CI/an agent, not by a unit test."* Its smoke
test's header states: *"The full 3-arm run is [live] (agent-driven) and is not exercised here."*
Both quotes confirmed by direct read, not paraphrase.

**New harness follows the same shape.** `tests/evals/batched-task-dispatch/run-ab-eval.mjs` has the
identical structure — a dry-run-exercisable path plus a fully-scripted `[live]` orchestration block
that is not invoked by any automated test — and its own smoke test
(`run-ab-eval.smoke.test.mjs`) was re-run directly for this validation: 2/2 pass, covering
arm/helper-wiring text presence and the exit-0-no-results-dir dry-run case.

**Disposition: PARTIAL, not PASS, not FAIL.** The precedent is real, and this codebase's
established norm for `--parallel`-class equivalence gates is "smoke-test the harness plumbing; the
live comparison is a deliberately separate, agent-driven step, not run by `npm test`." Grading this
spec's AC by a stricter bar than its own cited sibling would be inconsistent, so this is not a FAIL.
But the AC's text — "An equivalence eval **asserts** a batched run matches its twin... This is
release-blocking" — is present tense: a harness proven to be wired correctly has not yet asserted
anything, because the live 2-arm comparison it exists to run has never actually executed. That is a
real, unclosed gap the same as the `--parallel` precedent's own equivalent gap, not a new invention
of this spec. **Recommendation, not a blocker for quick-tier PASS:** run the live 2-arm comparison
(`node tests/evals/batched-task-dispatch/run-ab-eval.mjs`, non-dry-run, agent-driven) before treating
this feature as fully release-ready, exactly as the `--parallel` precedent itself still requires for
its own equivalence claim.

## Check 4: Constitution Compliance — PASS (quick-tier synthesized with Check 2)

- **Architecture boundaries: PASS** — No new skill added to lifecycle order, no hook-protocol
  change, no CLI install-path change, no plugin-registration-format change, no new external
  dependency. The one "Requires Human Approval" item this spec's own design triggers — batching
  on by default — is explicitly recorded and discharged in the spec's own System Constitution
  Reference section (`batched-task-dispatch.spec.md:271`): owner authorization on 2026-08-17.
- **Non-negotiable principles: PASS** — (1) no new deps; (2) grouping/eligibility logic lives in
  `.mjs`, not skill prose (`batched-mode.md:18` names the CLI verb rather than repeating logic);
  (3) pure ESM throughout the new/modified files; (4) no hook files touched; (5) version parity
  confirmed below.
- **Coding standards: PASS** — camelCase functions, kebab-case files, Node builtins imported before
  relative imports (`lib/cli/implement.mjs:44-50`), coded errors throughout (`.code` property
  pattern matching existing `INVALID_MAX_REVIEW_RETRIES`), no CommonJS.
- **Anti-patterns avoided: PASS** — `batched-mode.md` contains zero executable logic and no fenced
  code at all (confirmed by direct read and by its own doc-contract test
  `implement-batched-mode.test.mjs:13-17`, which asserts absence of inline-Node patterns). Re the
  "Load Skill Extensions" rule: `batched-mode.md` is a conditionally-loaded companion narrative for
  the existing `implement` skill (the same shape as the pre-existing `parallel-mode.md`), not a new
  top-level `skills/<name>/SKILL.md` — the rule's own text scopes it to new `SKILL.md` files, and
  `SKILL.md` itself already carries that block unmodified (`SKILL.md:73-79`). No gap.
- **Version parity: PASS** — `package.json` / `.claude-plugin/plugin.json` last touched by an
  unrelated commit (`48a7a452`) predating this spec's work; none of this spec's 5 implement-phase
  commits touch either manifest, and the working tree carries no diff to them.

## Check 8: Boundary Compliance — SKIP (quick rigor tier)
Skipped — quick rigor tier. (Informational, not run: this repo's `governance/boundaries.yaml`
rules are all `severity: warning` today per the plan's own Reference notes, so even a full-tier run
would not have blocked here.)

## Check 9: Transition Gates — SKIP (quick rigor tier)
Skipped — quick rigor tier.

## Check 11: Visual Verification — N/A
No UI files in the implementation diff (source-manifest is entirely `.mjs`/`.md`/`.json`/`.yaml`) —
visual verification not applicable (Case A of the trigger-guard matrix).

---

**Summary:** 3 passed (Check 1 with notes, Check 2 with notes, Check 4), 0 failed, 2 skipped by
quick-tier design (Checks 8, 9), 1 not applicable (Check 11). Checks 1.5 and 1.6 were additionally
run (outside the quick-tier's minimal set) and both PASS. No blocking failures. Two items are
flagged as follow-up, not blockers: AC3's checkpoint-fires clause (pre-existing, explicitly
scoped-out gap) and AC11/Output-Contract-G's live equivalence run (harness ready, never executed).

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files),
> 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly
>   Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now
>   covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix`
>   as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13
>   / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
>
> Historic `.validate.md` reports continue to use the pre-restructure numbering; the gaps in the
> surviving inventory (Checks 1, 1.5, 1.6, 2, 4, optionally 8 and 9) are intentional to preserve
> report readability.
