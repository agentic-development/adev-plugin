<!-- partial_schema: spec@1 -->

---
charter: implementation
kind: skill
status: implemented
risk_level: high
milestone:
revision: 1
charter-revision: 1
created: 2026-08-17
updated: 2026-08-18
research-ref: .context-index/research/tdd-cycle-graduation-design-analysis.md
depends-on:
  - .context-index/specs/features/implementation/review-provenance.spec.md
relates-to: .context-index/specs/cross-cutting/incremental-artifact-writes.spec.md
source-manifest:
  sha: "8723ea0"
  files:
    - .context-index/manifest.yaml
    - docs/cli-reference.md
    - docs/skill-reference.md
    - lib/cli/implement.mjs
    - lib/implement/batch-verify.mjs
    - lib/implement/batching.mjs
    - lib/manifest.mjs
    - skills/implement/SKILL.md
    - skills/implement/batched-mode.md
    - tests/cli/implement-batches.test.mjs
    - tests/docs/batched-task-dispatch-docs.test.mjs
    - tests/evals/batched-task-dispatch/fixture/example.plan.md
    - tests/evals/batched-task-dispatch/fixture/example.routing.json
    - tests/evals/batched-task-dispatch/run-ab-eval.mjs
    - tests/evals/batched-task-dispatch/run-ab-eval.smoke.test.mjs
    - tests/lib/implement/batch-verify.test.mjs
    - tests/lib/implement/batching.test.mjs
    - tests/lib/manifest.test.mjs
    - tests/skills/implement-batched-mode.test.mjs
  computed-at: "2026-08-18T22:04:02.308Z"
---

# Skill Spec: Batched Task Dispatch

<!-- Skill Spec within the implementation charter.
     Parent Charter: .context-index/specs/features/implementation/charter.md
     Source research: .context-index/research/tdd-cycle-graduation-design-analysis.md
     (finding F-I12, and the batching axis raised during its review). -->

<!-- THE CORE OBSERVATION.
     Batched dispatch is not a new capability for this framework — it already
     runs in production, but only inside `--parallel`. skills/implement/parallel-mode.md
     dispatches ONE subagent per task group, and instructs it to "run the group's
     tasks sequentially with full TDD + 2-stage review; commit each task to branch
     adev/<plan-slug>-<group>". So one agent handling N tasks with N commits is
     already proven, already verified (`adev parallel verify --tasks … --done …`
     fails a group with COMMITS_NOT_VERIFIED when any task's commit is missing).

     What does not exist is reaching that batching WITHOUT worktree parallelism.
     Today the only way to get one-agent-per-group is `--parallel`, which drags in
     worktree creation, collision handling, ORCHESTRATOR_POLLUTED detection, and
     merge-back. This spec decouples the two: batching becomes a property of
     dispatch shape, parallelism stays a property of scheduling. The result is
     strictly less machinery than parallel mode, not more.

     CORRECTION TO THE SOURCE RESEARCH. Finding F-I12 states that batching
     "collides head-on with the mandatory one-commit-per-task recovery guarantee
     in step 2h". That is true only of batching the REVIEW into one group-level
     fix commit. It is not true of batching dispatch: step 2h forbids a combined
     COMMIT, not a combined DISPATCH, and parallel mode already demonstrates the
     compliant shape. F-I12's headline ("parallel mode explicitly declines to use
     it") is also too strong — parallel mode consumes the grouping metadata via
     `adev parallel groups`; what goes unused is grouping for review batching. -->

## Invocation Modes

### Default: batch cohesive groups, dispatch everything else solo

Batching is **on by default**. On every serial `/adev:implement` run, tasks
belonging to an eligible group (see Output Contract B) are dispatched to a
single subagent that works them sequentially; every other task is dispatched
solo exactly as today.

The default is safe not because batching is conservative but because
**eligibility is** — a group must be cohesive, within the size cap, and free of
any solo-forcing task before it batches. Plans whose tasks do not form such
groups see no change in dispatch shape.

### `--no-batch`: restore strict one-subagent-per-task

Forces solo dispatch for every task regardless of grouping. This is the
bisection tool: any behavioral difference between a run and its `--no-batch`
twin is attributable to batching alone.

### Relationship to `--parallel`

The two axes compose and must not be conflated:

| | Grouping used for | Where tasks run |
|---|---|---|
| Batching (this spec) | Cohesion **within** a group — shared files, dependency order | Sequentially, in the orchestrator's own tree |
| `--parallel` | Disjointness **across** groups — no file overlap | Concurrently, in separate managed worktrees |

`--parallel` already batches within each group, so passing both flags changes
nothing about the group agent's behavior; batching simply becomes the same
shape applied to the serial path. `--no-batch` combined with `--parallel` is a
contradiction — `--parallel`'s whole unit of dispatch is the group — and is
rejected with `CONFLICTING_BATCH_FLAGS` rather than silently honouring one.

## Arguments

| Argument | Required | Description |
|---|---|---|
| `--no-batch` | No | Force solo dispatch for every task. Rejected with `CONFLICTING_BATCH_FLAGS` when combined with `--parallel`. |
| `--max-batch <n>` | No | Per-run override of `implement.max_batch_size`. `1` is equivalent to `--no-batch`. |

| Surface | Location | Default | Validation |
|---|---|---|---|
| `implement.batch_mode: on \| off` | `.context-index/manifest.yaml` | `on` | New `validateBatchMode()` in `lib/manifest.mjs`; an out-of-enumeration value throws `INVALID_BATCH_MODE` rather than defaulting, because a typo here silently changes dispatch shape on every task |
| `implement.max_batch_size` | `.context-index/manifest.yaml` | `4` | Structural copy of the existing `validateMaxReviewRetries()`; throws `INVALID_MAX_BATCH_SIZE` on non-integer / non-finite / `< 1` |

The default cap of `4` is not a tuning guess: research finding F-I12 measured
the existing plan corpus and found `## Parallelization` groups run **2–4 tasks**
each in the sampled plans. The cap is set to the top of the observed range so
that today's plans batch as authored, and no plan gets a batch larger than one
a human already reviewed as a coherent group.

## Output Contract

### A. Batches are consumed, not computed

`/adev:implement` does not decide which tasks are cohesive. It reads the
`## Parallelization` section `/adev:plan` already authors
(`skills/plan/SKILL.md:472`), which encodes both properties this spec needs:

```markdown
- Group A (sequential): Task 1 → Task 2 (shared files)
- Group B (independent): Task 3 (no file overlap with Group A)
```

A `(sequential)` group is *defined* as tasks sharing files in dependency order
— precisely the batch worth forming, because shared files are what make one
agent's context worth amortizing. No new grouping axis and no new plan section
is introduced: 153 of 165 existing plans already carry this section, so the
signal is present in the corpus today.

A new verb resolves the batch plan, keeping the decision out of skill prose:

```bash
adev implement batches --plan <plan-path> [--max-batch <n>] [--no-batch]
```

It prints, per batch, the group name, the ordered task ids, and — for every task
forced solo — the reason. `lib/implement/batching.mjs` owns the logic.

**Routing scores are not the grouping key.** They measure agent-*suitability*
(spec completeness, pattern coverage, blast radius, novelty), not cohesion. Two
tasks can both score 5/5 and touch unrelated modules, where batching amortizes
nothing while still compounding failure risk. Routing enters only as an
eligibility gate (B).

### B. Eligibility gate — every condition must hold

A group batches only when all of the following are true. Any failure sends the
offending task, and only that task, to solo dispatch.

| Condition | Source | Why |
|---|---|---|
| Group kind is `(sequential)` | `## Parallelization` | Cohesion is the whole premise; an `(independent)` group shares no files |
| `2 <= size <= implement.max_batch_size` | plan + manifest | Size 1 is solo by definition; the cap bounds compounding |
| No task routed `human-only` | `.routing.json` `selected_agent` | A task needing a human never rides along in an agent batch |
| No task requires a human checkpoint | `.routing.json` | Implement already uses `selected_agent` to decide a pause after RED. A batch agent that ran past that pause would silently delete the checkpoint — the one existing consumer of routing in this skill |
| No task crosses a governance boundary | `boundaries.yaml` evaluation | Highest-consequence tasks do not accept compounding; they get their own agent and their own checkpoint |
| Every task's routing scores are usable | `.routing.json` `scores` | Unusable or out-of-range scores mean eligibility is unknowable; unknown resolves to solo |

The gate is **fail-closed by construction**: batching requires affirmative
satisfaction of every row, while a single failure revokes it. Missing sidecar,
malformed `## Parallelization`, absent group, unreadable manifest — each lands
on today's solo behavior.

### C. Invariants preserved inside a batch

Batching changes *who holds the context*, and nothing else. Within a batch, per
task, unchanged:

1. **A full RED phase** — failing test authored and verified failing, gaming
   detection, mocking-boundary classification, and an immutable Handoff Block.
   Depth-invariant test-integrity enforcement is untouched.
2. **Exactly one commit**, carrying `Spec:`, `Plan-task:`, and the provenance
   trailers from `review-provenance.spec.md`. This is the recovery checkpoint
   and it is non-negotiable — `incremental-artifact-writes.spec.md` Integration
   Point 2 forbids a *combined commit*, which this spec does not produce.
3. **Both review stages** — Stage 1 then Stage 2, per task, at today's depth.
   **Batching the review is explicitly out of scope**: a group-level review
   producing one group-level fix commit is the case that genuinely does break
   the checkpoint contract, and it is deferred to a separate spec.
4. **Its own `plan_task` events**, including the terminal event.
5. **Post-task governance gates** per step 2h.

### D. Context hygiene within the batch

One agent now holds RED and GREEN across several tasks, which enlarges the
surface of the open concern in `adev-plugin-q3ek` (RED/GREEN context isolation).
Two invariants bound it:

- The batch agent MUST fully complete task *N* — RED, GREEN, both reviews,
  commit — before reading task *N+1*'s context packet. Reading ahead is
  forbidden, so a later task's expected implementation cannot inform the
  current task's failing test.
- Each task's Handoff Block stays immutable and per-task. A batch produces *N*
  handoff blocks, not one.

### E. Batch abort semantics

If any task inside a batch terminates non-`PASS` (review non-convergence via
`LOOP_NO_PROGRESS` / `LOOP_REGRESSED` / `LOOP_BUDGET_EXHAUSTED`, or a required
gate failure), the batch agent **stops at that task**:

- Commits for already-completed tasks in the batch stand. They are checkpoints
  and are never rolled back.
- The failing task and every later task in the batch stay open.
- On re-run, the remaining tasks are dispatched **solo**, regardless of
  eligibility. A batch that has already failed once has demonstrated that its
  shared context is not helping.

This is what stops "task 3 went wrong and tasks 4–5 built on it": the batch
cannot proceed past a task that did not pass, exactly as the serial loop cannot.

### F. A batched run is auditable, never invisible

| Advisory | Emitted when |
|---|---|
| `BATCH_DISPATCHED` | A batch forms — names the group, ordered task ids, and size |
| `BATCH_SOLO_FORCED` | A task is pulled out of a candidate batch — names the task and the failing eligibility row |
| `BATCH_ABORTED` | A batch stops early per (E) — names the failing task and the tasks left open |

`BATCH_SOLO_FORCED` fires per task even when the whole group ends up solo, so a
run that never batched is distinguishable from a run that batched silently.

### G. Equivalence is the load-bearing gate

A batched run MUST be behaviorally equivalent to its `--no-batch` twin:
identical commit count and per-task commit contents, identical `plan_task`
events, identical review outcomes. This mirrors the standard `--parallel`
already holds itself to — *"a parallel run must be behaviorally equivalent to
serial (the equivalence eval is the load-bearing gate)"* — and it is the only
check that can catch batching quietly degrading work rather than merely
reshaping dispatch.

Because batching preserves every review stage at full depth, the equivalence
eval is a genuine quality check here rather than a formality: if batched output
is worse, the reviews are still running and should say so.

## Failure Modes

| Condition | Skill Behavior | User Recovery |
|---|---|---|
| `## Parallelization` section absent or malformed | Every task dispatches solo (today's behavior). Advisory names the reason, mirroring parallel mode's `serial: no/malformed parallelization section` fallback. | Re-run `/adev:plan` to author the section, or accept solo dispatch. |
| `--no-batch` combined with `--parallel` | Exit non-zero with `CONFLICTING_BATCH_FLAGS`. | Drop one flag. Silently honouring one would leave the operator believing they disabled batching when `--parallel`'s unit of dispatch is the group. |
| `implement.batch_mode` holds a value outside `on \| off` | `INVALID_BATCH_MODE` from `loadManifest()`; the run stops. | Fix the manifest. This throws rather than defaulting because a typo would silently change dispatch shape on every task of every run. |
| `implement.max_batch_size` non-integer, non-finite, or `< 1` | `INVALID_MAX_BATCH_SIZE` from `loadManifest()`; the run stops. | Fix the manifest. |
| Routing sidecar missing | Unchanged from today: the skill stops with `ROUTING_SIDECAR_MISSING` and instructs the operator to run `/adev:route`. Batching introduces no fallback path. | Run `/adev:route --plan <path>`, re-invoke. |
| A group names a task id absent from the plan | That group is ineligible; its resolvable tasks dispatch solo. Advisory `BATCH_SOLO_FORCED` names the unresolvable id. | Re-run `/adev:plan`/`/adev:route` so grouping and tasks agree. |
| Batch agent returns without committing a task it reported done | Treated exactly as `--parallel` treats it: the task is not complete, its `plan_task` terminal event is not emitted, and the run halts on that task. Per-task commit presence is verified, not trusted. | Re-run `/adev:implement --task <N>`; it dispatches solo. |
| Batch agent dies mid-batch (crash, budget exhaustion) | Completed tasks' commits stand as checkpoints. Remaining tasks stay open and dispatch solo on re-run per (E). | Re-invoke `/adev:implement`; no manual cleanup — batching creates no worktree and no lock. |
| A task inside a batch terminally fails review | Batch stops at that task per (E); `BATCH_ABORTED` advisory. Later tasks are dispatched solo on re-run. | Fix the findings and re-run, or `/adev:recover` if the fix loop is stuck. |
| Batched output diverges from the `--no-batch` twin | The equivalence eval fails, which is a release-blocking failure for this spec, not an advisory. | Do not ship. Set `implement.batch_mode: off` to restore per-task dispatch while the divergence is diagnosed. |

## System Constitution Reference

- **Commit-per-task recovery contract (`incremental-artifact-writes.spec.md` Integration Point 2, via SKILL.md step 2h)** — Applies as a preserved constraint, and is the single most important boundary in this spec. That contract forbids "multi-task implementations with a single combined commit" because the commit *is* the crash checkpoint. This spec batches dispatch while leaving commit granularity untouched, which is the shape `--parallel` already ships and `adev parallel verify` already enforces. Any future move toward one commit per batch would violate this contract and is out of scope.
- **Requires Human Approval (constitution, Architecture Boundaries)** — Applies to the *default*, and is discharged explicitly. Turning batching on by default changes the dispatch shape of the framework's most load-bearing skill for every plan, which is a decision beyond the "Autonomous (Agent May Decide)" list. The project owner authorized default-on with `--no-batch` opt-out on 2026-08-17, after being shown the alternative of shipping opt-in first. Recorded here so review does not have to re-derive the provenance of that choice.
- **Principle 1 (Minimize external dependencies)** — Applies. Batch resolution is plain parsing of a plan section plus manifest validation, in `lib/implement/batching.mjs`, using Node built-ins only.
- **Principle 2 (Skills are primarily markdown) and the cli-driver-surface rules** — Applies. Batch composition is a CLI verb (`adev implement batches`), not logic in SKILL.md prose; the batched orchestration narrative goes in a conditionally-loaded companion (`skills/implement/batched-mode.md`), following the precedent set by `parallel-mode.md`, which was extracted because implement already exceeds the 65,536-byte cap the Copilot provider enforces.
- **Autonomous — "Refactoring within a module's boundaries"** — Applies to the mechanism itself, which reuses parallel mode's proven group-agent shape inside `implementation`'s own boundary and touches no hook protocol, lifecycle skill order, install path, or plugin manifest.

## Acceptance Criteria

- [ ] A `(sequential)` group of 2–4 eligible tasks dispatches to exactly one subagent, and that agent produces one commit per task.
- [ ] Every eligibility row in Output Contract B is covered by a test that asserts the offending task is forced solo and that `BATCH_SOLO_FORCED` names the failing row.
- [ ] A task requiring a human checkpoint is never batched, and a test asserts the checkpoint still fires.
- [ ] Per-task RED, gaming detection, mocking-boundary classification, and one immutable Handoff Block per task all hold inside a batch; a test asserts a batch of *N* tasks produces *N* handoff blocks.
- [ ] Both review stages run per task inside a batch at unchanged depth; no group-level review is dispatched.
- [ ] Read-ahead is prevented: a test asserts task *N+1*'s context packet is not read before task *N*'s commit lands.
- [ ] Batch abort leaves completed commits intact, later tasks open, and forces solo dispatch for them on re-run.
- [ ] `--no-batch` produces byte-identical dispatch to today's serial path.
- [ ] `--no-batch --parallel` exits non-zero with `CONFLICTING_BATCH_FLAGS`.
- [ ] `implement.batch_mode` and `implement.max_batch_size` validate per the Arguments table, throwing rather than defaulting on malformed values.
- [ ] **An equivalence eval asserts a batched run matches its `--no-batch` twin on commit count, per-task commit content, `plan_task` events, and review outcomes.** This is release-blocking.
- [ ] `--parallel` behavior is unchanged by this spec; its existing equivalence eval still passes.
- [ ] All quality gates pass; no constitutional violations introduced.
