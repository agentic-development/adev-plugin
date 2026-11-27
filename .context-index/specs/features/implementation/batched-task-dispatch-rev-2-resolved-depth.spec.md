---
charter: implementation
kind: skill
status: review-pending
risk_level: high
revision: 1
charter-revision: 1
amends: .context-index/specs/features/implementation/batched-task-dispatch.spec.md
target-revision: 2
created: 2026-11-26
updated: 2026-11-26
---

# Amendment: Skill Spec: Batched Task Dispatch (targeting rev 2)

> This spec **amends** `.context-index/specs/features/implementation/batched-task-dispatch.spec.md` targeting revision 2.
> The base spec is immutable; this artifact carries the delta and is
> reviewed, planned, and validated on its own lifecycle.

## Amendment Rationale

`.context-index/specs/features/implementation/implement-rigor-ladder.spec.md` removes the `batched-task` floor leg (BEH-4) and adds a `lite` depth whose tasks run inline in the orchestrator (BEH-6, BEH-8).

The base spec's Output Contract C.3 promises "both review stages — Stage 1 then Stage 2, per task, at today's depth" inside every batch. `graduated-review-depth.spec.md` kept that promise true only by forcing every batched task to `full`. With the leg gone, a batched task can resolve `quick`, and C.3 would be silently reinterpreted. This amendment states the new contract explicitly instead.

## Behavioral Delta

**C.3, superseded.** Item 3 of Output Contract C now reads:

> 3. **The review its resolved depth requires.** Each task inside a batch is reviewed on its own, **at the task's resolved review depth**, as that task's own `adev implement resolve-depth` calls decide. `full` runs Stage 1 then Stage 2. `quick` runs one synthesized reviewer. Batch membership never changes a task's depth, and no longer implies two stages. Batching the review itself (one group-level review, one group-level fix commit) stays out of scope.

Items 1, 2, 4 and 5 of Output Contract C are unchanged.

**`lite` tasks are never batched.** A task granted `lite` runs inline in the orchestrator's own context, so it can never share a subagent with its group. `adev implement batches --run-base <run_base> [--lite] [--tier <t>]` evaluates the `lite` grant per task against governance read at `run_base`, using the same resolver inputs as `resolve-depth --pass provisional`. A granted task never joins a batch and is listed in `solo` with `reason: "lite"`.

**Segment rule.** A `lite`-granted member splits its `(sequential)` group. The group's other members are partitioned into **segments**, the maximal contiguous runs of non-`lite` members in group order. Each segment is gated (Output Contract B) and sized (`2 <= size <= implement.max_batch_size`) on its own. Each formed batch carries a 1-based `segment` number that counts every run in the group, whether or not that run formed a batch, so two batches from one group are told apart. One group can therefore yield more than one batch. Batches, solo tasks and inline `lite` tasks dispatch interleaved in plan order: a batch dispatches when its first member comes up, and a `lite` task between two segments runs inline after the first batch finishes and before the second dispatches.

**Assumed authorization.** When the plan's spec cannot be resolved from the plan header, `batches` cannot tell whether the policy authorizes `lite`. With no `--tier`, it then assumes authorization. A task that would be granted is kept out of every batch, listed in `solo` with `reason: "lite-assumed"`, and the response carries one `LITE_AUTHORIZATION_ASSUMED` advisory. A `lite-assumed` task is never treated as granted: its own provisional `resolve-depth` call decides whether it runs inline. Over-exclusion costs a batch, while under-exclusion would put an inline task in a subagent batch.

**`--run-base` is required whenever `lite` may be authorized.** That is the case for `--lite`, `--tier lite`, or, with no `--tier`, an `implement_mode: lite` at the spec's risk level (any level when the spec cannot be resolved) in the working tree or committed at `HEAD`. `--tier quick` or `--tier full` opts the run out of `lite` and needs no `--run-base`.

**Output Contract B, eligibility rows.** Rows are unchanged. `lite` exclusion is not an eligibility row: it removes the task before the group is gated, and `BATCH_SOLO_FORCED` names `lite` or `lite-assumed` as the reason.

**Output Contract G, equivalence.** The sentence "Because batching preserves every review stage at full depth" is replaced by: because batching never changes a task's resolved depth, a batched run and its `--no-batch` twin review every task at the same depth, so the equivalence eval still compares like with like.

**Batch verification.** `lib/implement/batch-verify.mjs::verifyPerTaskReviewRounds()` expects both stage records (`spec-compliance` and `code-quality`) and is therefore valid only for batched tasks that resolved `full`. A `quick` task records the single `synthesized` stage. Making the check depth-aware is a recorded code follow-up (ADR 0020, revision-4 notes).

## Acceptance Criteria

The base criterion "Both review stages run per task inside a batch at unchanged depth; no group-level review is dispatched" is superseded by the first criterion below. The equivalence criterion is unchanged.

- [ ] Each task inside a batch is reviewed at the task's resolved review depth (`full`: two stages; `quick`: one synthesized reviewer), and no group-level review is dispatched.
- [ ] `adev implement batches --lite --run-base <sha>` never places a task granted `lite` in a batch; it is listed in `solo` with `reason: "lite"`.
- [ ] A `(sequential)` group with a `lite`-granted middle member yields one batch per eligible segment, each with its own `segment` number, and the dispatch order follows plan order.
- [ ] An unresolvable plan spec with no `--tier` yields `reason: "lite-assumed"` for eligible tasks and one `LITE_AUTHORIZATION_ASSUMED` advisory.
- [ ] `batches` exits non-zero without `--run-base` when `lite` may be authorized.
- [ ] The equivalence eval (Output Contract G) still passes: a batched run matches its `--no-batch` twin on commit count, per-task commit content, `plan_task` events and review outcomes.
