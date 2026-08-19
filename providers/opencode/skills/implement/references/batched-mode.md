<!-- Companion to skills/implement/SKILL.md. Extracted from the SKILL body
     because implement exceeded the 65,536-byte cap the Copilot provider
     enforces (lib/providers/copilot/skill-validator.mjs). Content is
     verbatim; only the heading level changed. Loaded conditionally — see
     the pointer stub in SKILL.md. -->

# Step 2.4: Batched Task Dispatch (`implement.batch_mode`)

This section loads only when `implement.batch_mode` resolves to `on` (its default) and `--no-batch` was not passed on the invocation. Batching applies to the serial path only — it groups cohesive tasks so one subagent processes several tasks back to back inside its own tree, in place of one subagent per task. It is a different axis from `--parallel`, and the two compose without conflict:

| | Grouping used for | Where tasks run |
|---|---|---|
| Batching (this spec) | Cohesion **within** a group — shared files, dependency order | Sequentially, in the orchestrator's own tree |
| `--parallel` | Disjointness **across** groups — no file overlap | Concurrently, in separate managed worktrees |

`--parallel` already batches within each group, so passing both flags changes nothing about the group agent's behavior; batching simply becomes the same shape applied to the serial path. When `--parallel` is active, Step 2.5 owns dispatch and this section does not run a second time on top of it.

**Resolving batches.** Before Step 2's per-task loop begins, call `adev implement batches --plan <plan-path> [--max-batch <n>] [--no-batch]` exactly once. The CLI verb owns all grouping logic — file overlap, dependency ordering, and the eligibility gate that decides which tasks may share an agent — none of that logic is repeated here. Print `BATCH_DISPATCHED` for each batch the verb forms, and print `BATCH_SOLO_FORCED` for each task the eligibility gate pulled back out of a group, naming the specific failing eligibility row the CLI verb reports for that task.

**Dispatch shape.** For each formed batch, issue one `Agent({description, prompt, run_in_background: false})` call. As with every other dispatch site in this skill: never background the call (`run_in_background` omitted or `true` stalls the run, because the nested caller is never re-invoked). Do not pass `isolation: "worktree"` for this dispatch either (the same nesting/cleanup hazards from Step 2d apply here too). The batch agent's prompt instructs it to process the batch's task ids **in order**, running the full, unmodified Step 2 loop (2.pre through 2h) for each task before touching the next one. Both review stages — 2f Stage 1 spec-compliance, then 2g Stage 2 code quality — run per task, at unchanged depth and cycle caps; no group-level review is dispatched, and no group-level fix commit is produced. Batching the review itself is out of scope for this spec: an implementer must not "optimize" a batch by reviewing the batch's diff once at the end instead of reviewing each task on its own.

**Read-ahead prohibition.** The batch agent MUST fully complete task *N* — RED, GREEN, both reviews, commit — before reading task *N+1*'s context packet. Reading ahead is forbidden. (For implementers: `lib/implement/batch-verify.mjs::verifyNoReadAhead()`, already committed in Task 2, is the mechanical postcondition check for this rule.)

**Per-task Handoff Blocks.** A batch produces N handoff blocks, not one; each task in the batch gets its own immutable, per-task Handoff Block, exactly as a solo-dispatched task would. `lib/implement/batch-verify.mjs::verifyHandoffBlocks()` (Task 2) is the mechanical postcondition check for this rule, and `verifyPerTaskReviewRounds()` in the same file is the analogous check for the "both review stages per task" claim above, reusing the already-shipped `reviewRounds` projection from `lib/lifecycle-state.mjs::currentState()`.

**Abort semantics.** If any task inside the batch terminates non-PASS — the same `LOOP_NO_PROGRESS`, `LOOP_REGRESSED`, or `LOOP_BUDGET_EXHAUSTED` verdicts Step 2g already defines, or a required governance gate failure from Step 2h — the batch agent stops at that task. Prior completed tasks' commits stand and are **never rolled back**; the failing task and every later task in the batch stay open. Emit `BATCH_ABORTED` naming the failing task and the tasks left open. On re-run, the remaining tasks in that group are dispatched **solo**, regardless of eligibility — a batch that already failed once has demonstrated its shared context is not helping, so the eligibility gate is not consulted again for that group.

The per-task TDD loop, 2-stage review, and commit-per-task rules from Step 2 apply unchanged *inside* each batch; this section only governs which tasks share an agent and in what order.
