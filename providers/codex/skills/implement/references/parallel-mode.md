<!-- Companion to skills/implement/SKILL.md. Extracted from the SKILL body
     because implement exceeded the 65,536-byte cap the Copilot provider
     enforces (lib/providers/copilot/skill-validator.mjs). Content is
     verbatim; only the heading level changed. Loaded conditionally — see
     the pointer stub in SKILL.md. -->

# Step 2.5: Parallel Group Execution (`--parallel`)

When invoked with `--parallel`, file-disjoint task groups run concurrently in adev-managed worktrees instead of strictly serially. This changes *when* work runs, never *what* it produces — a parallel run must be behaviorally equivalent to serial (the equivalence eval is the load-bearing gate). Groups are **consumed, not computed** here: `adev parallel groups --plan <plan>` parses the plan's `## Parallelization` section.

**Fall back to the serial Step 2 loop** (printing the reason) when any of these holds:
- the `--parallel` flag is absent (no message);
- `adev parallel groups --plan <plan>` reports `malformed: true`, or yields 0 or 1 independent group (`serial: no/malformed parallelization section` / `serial: single group`);
- `adev worktree guard` reports `nested: true` (`serial: nested in <kind> worktree`).

**Otherwise, orchestrate:**

1. Ensure `.adev/worktrees/` is git-ignored (managed block). Record the baseline with `adev parallel baseline` → `{ branch, head, clean }`, and read the concurrency cap with `adev parallel max-parallel`.
2. For each independent group, in waves bounded by the cap: guard re-runs with `adev parallel collision --slug <plan-slug>-<group>`. On `collision: true`: if `--fresh` was passed, auto-remove the retained worktree with `adev worktree remove --slug <…> --force` and continue; otherwise abort that group with `RERUN_COLLISION` (the operator must clear it manually with `adev worktree remove --slug <…> --force`, or re-run with `--fresh`). With no collision, create the worktree with `adev worktree add --slug <plan-slug>-<group>`.
3. Dispatch the wave's group subagents **concurrently in a single message** — one `Agent({description, prompt, run_in_background: false})` per group, all issued in the same message so the wave runs in parallel. Two failure modes to avoid: a backgrounded dispatch (`run_in_background` omitted or true) stalls because the nested caller is never re-invoked (see the Step 2d guardrail), and dispatching the groups across separate messages serializes them, defeating `--parallel`. **Never** pass `isolation: "worktree"` (the same nesting/cleanup hazards as Step 2d apply). Each group's prompt MUST bind the subagent to its worktree: *"`<worktree-path>` is your working-tree root; run every git and file operation with an absolute path or `git -C <worktree-path>` — never a relative op in the shared cwd (it would race on `index.lock`); run the group's tasks sequentially with full TDD + 2-stage review; commit each task to branch `adev/<plan-slug>-<group>`."*
4. **Join** — wait for every group subagent to return — then, before any merge-back:
   - assert the orchestrator is unpolluted: `adev parallel assert-clean --base-head <baseline.head>`. A non-zero `ORCHESTRATOR_POLLUTED` (a subagent committed/edited the orchestrator branch instead of its worktree) aborts the whole run before any merge.
   - verify each group is complete: `adev parallel verify --branch adev/<plan-slug>-<group> --base <baseline.head> --tasks <group task ids> --done <done task ids>`. A `COMMITS_NOT_VERIFIED` (a group task's commit is missing — partial work) marks that group failed; it is not merged.
5. Merge verified groups back into the orchestrator branch in deterministic order via `adev worktree merge --slug <plan-slug>-<group>`. On each clean merge, remove that group's worktree immediately (`adev worktree remove --slug <…> --delete-branch`) so a crash mid-run never leaves a merged worktree behind.
6. On any group failure (subagent error, `COMMITS_NOT_VERIFIED`, `RERUN_COLLISION`, or `MERGE_CONFLICT`): retain that group's worktree for inspection, leave its plan tasks open, still merge and clean up the *successful* groups, print a summary naming the retained worktree paths, and exit non-zero so orchestrators (e.g. `/adev:build`) detect the partial failure.

The per-task TDD loop, 2-stage review, and commit-per-task rules from Step 2 apply unchanged *inside* each worktree; this section only governs the parallel orchestration and merge-back.
