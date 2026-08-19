### Step 2: Per-Task Execution Loop

For each task in dependency order:

Before the loop begins, `adev implement batches --plan <plan-path> [--max-batch <n>] [--no-batch]` resolves which tasks form a batch and which dispatch solo.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/implement/references/batched-mode.md` for the full Batched Task Dispatch instructions.
> Load it only when at least one batch forms; a plan with no eligible `(sequential)` group runs the loop below exactly as written, per task.

#### 2.pre: Implementation Probe

Before dispatching a subagent, check if the task's target files already exist and may be already implemented:

1. Read the task's file list from the plan (Create + Modify + Test files).
2. Check if all listed files already exist on disk.
3. If all files exist AND test files are present:
   - Run the test files: `node --test <test-file>`.
   - If tests pass: the task is likely already implemented.
   - Report: "Task <N> appears already implemented — <file-list> exist and tests pass."
   - Ask the user: "Skip this task and mark it as done with 'Already implemented'?"
   - If user confirms: emit `reportPlanTask(projectRoot, specPath, { plan: planFilePath, task_id, status: "done", notes: "Already implemented (detected by implementation probe)" })`, skip to next task.
   - If user declines: proceed with normal dispatch.
4. If files exist but tests fail (or no test files): proceed with normal dispatch (code exists but may be incomplete).
5. If files don't exist: proceed with normal dispatch (standard case).

This probe prevents re-implementing work that was done outside the lifecycle or in a previous session.

#### 2a. Context Packet Assembly

Before routing or dispatching, assemble the task's context packet:

1. Read the task's `context_packet` section from the plan (if present).
2. For each listed file, read and extract the relevant section. **Source-manifest-guided loading:** When the spec has `source-manifest.files[]`, prioritize those files — read the primary implementation file in full, read test files and siblings as signatures only (`grep "^export"`). This provides targeted context without loading everything.
3. Write the assembled packet to `.context-index/packets/<task-slug>.md` (gitignored). This log enables post-mortem debugging via `/adev:recover`.
4. If no context_packet section exists in the plan, assemble a default packet from: constitution excerpt, spec acceptance criteria for this task, charter capability, and any samples matching the task's file patterns. If the spec has `source-manifest.files[]`, include those as the primary context source.
5. **Heuristics injection:** If heuristics were loaded in Step 1 (count > 0), append a `## Heuristics` section to the context packet with the rendered blocks from Step 1. Prefix the section with the advisory preamble:

   > The following heuristics are lessons learned from past work in this module. Use them as guidance, not as hard rules.

   All tasks in the same plan receive the same heuristic set. If no heuristics are available, omit this section entirely — do not emit an empty placeholder.

6. **Cross-repo reference resolution (workspace mode only):** If workspace state is non-null (from Step 1, item 12), parse the Live Spec's `depends-on` frontmatter for entries matching the `@repo-slug/spec-slug` pattern. For each cross-repo reference found:
   - Call `resolveRef(workspaceRoot, config, ref)` to resolve the reference. `resolveRef` only searches `specs/features/` within the target repo's `.context-index/` directory.
   - If resolution succeeds, read the resolved spec file's Behavioral Contract and Acceptance Criteria sections.
   - If resolution fails (returns `null`), emit a non-blocking warning: "Cross-repo reference '@repo-slug/spec-slug' could not be resolved — skipping." Do not abort the task.
   - Append all successfully resolved content under a `## Cross-Repo Reference Context` heading in the context packet. This section provides the implementer subagent with behavioral contracts from sibling repos that the current task depends on.
   - If no cross-repo references exist in `depends-on`, or if workspace state is null, skip this step entirely.

7. **Shared test helper injection:** Load the project's existing shared test infrastructure once for the whole plan:

   ```bash
   adev test-helpers inventory --format text
   ```

   Append the output to the context packet under a `## Shared Test Helper Inventory` heading, prefixed with the advisory preamble:

   > These shared test helpers, fixtures, and golden test samples already exist in this project. Reuse them instead of writing your own setup, teardown, or fixture code.

   Follow the same discipline as the Heuristics injection (item 5): all tasks in the same plan receive the same block, and if the output is `No shared test helpers, fixtures, or test samples detected.` — or the verb fails for any reason — omit the section entirely rather than emitting an empty placeholder. The block is language-agnostic: in a Python project it lists `conftest.py` and its pytest fixtures, in this repo it lists `tests/helpers.mjs` and its exports. Without it, a contextless implementer re-derives setup that already exists.

**Routing tag check:** If the task has a routing tag from `/adev:route`:
- `auto-agent`: proceed with standard dispatch
- `assisted-agent`: proceed with dispatch, but pause after RED phase (tests written) for user review before GREEN phase
- `human-only`: generate scaffolding only (type stubs, file structure, test shells), present as a manual task checklist, emit `reportPlanTask(projectRoot, specPath, { plan: planFilePath, task_id, status: "skipped", notes: "MANUAL — requires human implementation" })`, skip to next task

#### 2b. Specialist Routing

Determine which specialist (if any) should handle this task.

**Match scoring algorithm:**

1. Collect the task's file list (Create + Modify + Test files from the plan).
2. Collect the task's title and description text.
3. For each specialist declared in `manifest.yaml` under the `specialists` key:
   - **Pattern score:** For each `trigger_patterns` glob that matches any file in the task's file list, add 2 points. Add a depth bonus equal to the number of path segments in the pattern beyond the root (e.g., `components/**` = 1 bonus, `src/app/api/**` = 3 bonus). Total per matching pattern = 2 + depth bonus.
   - **Keyword score:** For each `trigger_keywords` entry found (case-insensitive substring match) in the task title or description, add 1 point.
   - Total score = sum of all pattern scores + sum of all keyword scores.
4. **Routing decision:**
   - No specialist scores above 0: use generic implementation subagent.
   - Single highest scorer: route to that specialist.
   - Tie between highest scorers: the specialist declared first in `manifest.yaml` wins.
   - Secondary matches (score > 0 but not highest): record them. Pass the list to the code quality reviewer in step 2g so it knows which additional domains to check.

**Example.** Given specialists:

```yaml
specialists:
  frontend-design:
    trigger_patterns: ["*.tsx", "*.css", "components/**"]
    trigger_keywords: ["UI", "layout", "responsive"]
  security:
    trigger_patterns: ["**/auth/**", "**/middleware/**"]
    trigger_keywords: ["authentication", "authorization"]
```

And a task touching `src/components/LoginForm.tsx` and `src/lib/auth/session.ts`:

| Specialist | Pattern Hits | Pattern Score | Keyword Hits | Keyword Score | Total |
|---|---|---|---|---|---|
| frontend-design | `*.tsx` (2+0), `components/**` (2+1) | 5 | 0 | 0 | 5 |
| security | `**/auth/**` (2+1) | 3 | 0 | 0 | 3 |

Primary: frontend-design. Secondary: security (flagged for review).

If `--dry-run` was passed, print the routing table for every task and stop.

#### 2c. Compose Subagent Prompt

Build the implementer subagent prompt with these sections in order:

1. **Role.** "You are implementing Task N: [title]." If routed to a specialist: "You are the [specialist name] specialist implementing Task N: [title]."
1b. **Execution directive.** If `--verbose` is NOT set: "Execute silently — no intermediate narration. Chain all steps without commentary. Use parallel tool calls for multi-file reads. Report ONLY the final result in the Report Format below." If `--verbose` IS set: "VERBOSE: true" (enables step-by-step narration for debugging).
2. **Constitution excerpt.** The Non-Negotiable Principles and Coding Standards sections. Keep under 60 lines. Do not include the full constitution.
3. **Task description.** Full text of the task from the plan. Never make the subagent read the plan file.
4. **Scene-setting context.** Where this task fits in the feature. What prior tasks produced. Dependencies and constraints. Relevant file paths or code snippets the subagent will need. Before implementing, read the actual source files you will modify. Do not assume file contents based on the task description or plan. If a file has changed since the plan was written, work with the current state. If workspace state is non-null and the spec has a `target-repo:` frontmatter field, include an informational advisory: "This task targets repo '<target-repo>' within workspace '<workspace-name>'. All file paths are relative to that repo's root."
5. **Spec excerpt.** The acceptance criteria from the Live Spec that this task addresses.
5b. **Shared Test Helper Inventory.** The `## Shared Test Helper Inventory` section assembled in step 2a item 7, verbatim, when it is non-empty. Omit the section entirely when the inventory is empty. This is what stops a contextless implementer from re-deriving fixtures the project already has.
6. **Scope discipline.** Only make changes directly required by the task. Do not refactor surrounding code, add abstractions, create helper files, or introduce patterns unless the task explicitly requires it. If you notice improvements outside the task scope, note them in your Concerns section but do not implement them. **Cross-repo isolation constraint (workspace mode):** When operating inside a workspace, do NOT modify files in sibling repos. Cross-repo reference context is read-only — it informs your implementation but all changes must be confined to the current repo. If a task requires changes in a sibling repo, report it as NEEDS_CONTEXT with a note identifying the sibling repo and required changes.
7. **TDD mandate.** This section is non-negotiable. Include the full content of `<ADEV_ROOT>/skills/implement/references/tdd-mandate.md`.

   **Write-test subagent dispatch:** When dispatching write-test subagents, set `ADEV_DISPATCHED_BY=implement` in the subagent environment so write-test can detect dispatch mode and skip its own preflight (implement already verified infrastructure).

   **Domain-Aware Test Config:** Load domain test config for test framework detection and gaming thresholds via the CLI:

   ```bash
   adev domain load-test-config --module <module-slug> [--charter <charter-path>]
   ```

   Stdout is a single JSON object `{ domain, config, warnings }` where `config` contains `permitted_tools`, `skip_patterns`, and `max_test_file_size`. Pass `config.permitted_tools` to the write-test subagent for test framework detection. Pass `config.skip_patterns` for domain-specific skipped test detection.

   **Test Depth Resolution:** Before dispatching the write-test subagent, resolve the task's assigned test depth via the CLI:

   ```bash
   adev test-policy resolve --plan <plan-path> --task-id <task-id>
   ```

   Stdout is a single JSON object carrying a `depth` field (`minimal | standard | thorough`). Pass the resolved depth into the write-test subagent's prompt alongside `config.permitted_tools`/`config.skip_patterns` — it tells the subagent how many case classes the suite must cover.

   After the write-test subagent hands back a suite and it is accepted, verify an assignment was recorded:

   ```bash
   adev test-policy assert-assigned --plan <plan-path> --task-id <task-id>
   ```

   A non-zero exit fails the write-test step for that task with `MISSING_DEPTH_ASSIGNMENT` rather than passing silently — do not proceed to GREEN phase or accept the suite.

7. **Specialist context** (if routed). Load the specialist prompt template from `.context-index/specialists/<name>.md` (for `invoke: subagent`) or note the skill to invoke (for `invoke: skill`). Include domain-specific guidelines.
8. **Blocker flag protocol.** If the subagent encounters an unresolvable issue, it must write a structured blocker file to `.context-index/hygiene/blockers/<task-slug>.md` using the blocker template (category, description, what was tried, what is needed) and STOP. The blocker file triggers `/adev:recover` for diagnosis. Never loop on a problem — file a blocker and halt.
9. **Escalation rules.** The subagent must report one of four status codes. It must never silently produce work it is unsure about. It is always acceptable to stop and escalate.
9. **Report format** (subagent reports use the full format regardless of persona; the chat summary presented to the user follows the active persona's output rules):

```
## Report Format

When done, report:
- **Status:** DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
- **What you implemented** (or attempted, if blocked)
- **Tests written and results** (which tests, pass/fail, TDD cycle count)
- **Files changed** (created, modified, deleted)
- **Self-review findings** (issues found and fixed during self-review)
- **Concerns** (if DONE_WITH_CONCERNS: what you are unsure about)
- **Missing context** (if NEEDS_CONTEXT: what you need and where you looked)
- **Blocker** (if BLOCKED: what prevents progress and what you tried)
```

Keep your report under 2,000 tokens. List files and results concisely. Do not restate the task description.

**Cleanup before reporting.** Remove any debugging console.log, print, or debugger statements added during development. Remove commented-out exploration code. Verify all imports are used and no temporary files were left behind.

**Update Execution State:** Before dispatching the implementer subagent, write execution state via the CLI:

```bash
adev execution-state write \
  --status active \
  --plan-ref <plan-file-path> \
  --current-task <task-number> \
  [--issue-binding <issue-id>] \
  --next-action "<task description>" \
  --progress-json '<json-array-of-progress-items>'
```

The verb wraps `lib/execution-state.mjs::writeExecutionState`. If the CLI call exits non-zero, log a warning and continue — do not block implementation.

#### 2d. Dispatch and Handle Status

Dispatch the subagent with `Agent({description, prompt, run_in_background: false})` and nothing else.



**Do not pass `isolation: "worktree"`.** Implement runs tasks serially against the orchestrator's branch; the subagent must write to the same working tree. From inside an existing worktree (`cwd` contains `.claude/worktrees/`), worktree isolation nests a new worktree inside the parent — the parent then captures it as untracked `.claude/worktrees/agent-<id>/` content, and every per-task dispatch adds another level (8+ deep observed in field reports). Subagents that commit also defeat the harness's auto-cleanup contract, leaving the nested trees on disk forever.

Handle the returned status:

**DONE.** Proceed to visual verification (step 2e) then 2-stage review (steps 2f-2g).

**DONE_WITH_CONCERNS.** Read the concerns carefully.
- Observational concerns (e.g., "this file is getting large", "naming could be improved"): note them and proceed to review. Pass them to the code quality reviewer.
- Correctness or scope concerns (e.g., "unsure this handles the edge case in the spec"): address before review. Re-dispatch with clarification, or ask the user.

**NEEDS_CONTEXT.** The subagent lacks information.
1. Check whether the missing context exists in `.context-index/` (charters, ADRs, samples, orientation, cross-cutting specs).
2. If found: re-dispatch the same subagent with the additional context appended to the prompt.
3. If not found: ask the user to provide the missing information.
4. Maximum 2 re-dispatches per task. After the second, escalate to the user regardless.

**BLOCKED.** The subagent cannot proceed.
- Present the blocker description to the user immediately.
- **Emit a `plan_task` blocked event:** `reportPlanTask(projectRoot, specPath, { plan: planFilePath, task_id, status: "blocked", notes: "<≤200-char operator-facing summary>" })`. The `notes` field must NOT contain stack traces, env values, secrets, or full command output — those belong in the blocker file under `.context-index/hygiene/blockers/`, not in the lifecycle log.
- **Update Execution State on Blocker:** Write execution state with `status: "blocked"`, `blockers` set to the blocker description, and `nextAction` set to the recommended resolution, via the CLI:
  ```bash
  adev execution-state write --status blocked \
    --blockers "<blocker description>" \
    --next-action "<recommended resolution>"
  ```
- The user can: provide guidance (re-dispatch with new info), modify the spec (back to `/adev:specify`), or skip the task.
- Never force a retry without changing something. If the subagent said it is stuck, something needs to change.

#### 2e. Visual Verification (UI tasks)

**Domain-Aware Verification Config:** Before checking UI patterns, resolve the active domain and load verification config via the CLI:

```bash
adev domain load-verification --module <module-slug> [--charter <charter-path>] [--mcp-server <name>]...
```

Pass each active MCP server name as `--mcp-server <name>` (repeat the flag for multiple). Stdout is a single JSON object `{ domain, config, warnings }`. If the verification tool listed in the domain config is not in the active MCP server set, `config` is `null` and a `TOOL_UNAVAILABLE` warning appears in `warnings`.

Based on the verification `type`:
- `visual`: use browser-based snapshot verification (existing Playwright flow below)
- `output`: use output comparison via assertions — no browser, no MCP tool
- `flow`: use assertion-based checks on workflow definitions
If no verification config exists (`config` is null), log a warning and skip domain-specific verification.

**Trigger:** If any file in the task's file list matches UI patterns: `*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss`, `components/**`, `app/**/page.*`, `app/**/layout.*`, `pages/**`.

**Playwright MCP required.** Check for the Playwright MCP browser tools (`browser_navigate`, `browser_snapshot`). If they are not available, **STOP the entire implementation** and tell the user:

```
BLOCKED: This task modifies UI files but no browser verification tool is available.

Install the Playwright MCP server so the agent can visually verify UI work:
  npm install -g @anthropic/mcp-playwright

Then add it to your Claude Code MCP config and restart.

Without visual verification, UI tasks cannot be validated one-shot.
The agent will ship broken layouts, invisible elements, and styling regressions.
```

Do not proceed. Do not skip. Do not fall back to code-only review for UI tasks.

**If Playwright is available:**

1. **Dev server.** Ensure the dev server is running. If not, start it (`npm run dev`, `next dev`, or whatever the project uses). Wait for it to be ready.
2. **Navigate.** Use the browser tool to navigate to the route this task affects. Infer the route from the file path (e.g., `app/dashboard/page.tsx` → `/dashboard`). If ambiguous, check the spec for the target URL.
3. **Snapshot and verify.** Take a browser snapshot. Compare against the Visual Expectations section from the Live Spec:
   - Are all described elements visible and correctly positioned?
   - Does text content render (no blank screens, no hydration errors)?
   - Are interactive states working (hover, focus, disabled)?
4. **Responsive check.** If the spec mentions mobile or responsive behavior, resize the viewport to 375px width and re-snapshot. Verify mobile expectations.
5. **Fix loop.** If something is wrong:
   - Identify the issue from the snapshot.
   - IMPORTANT: If a test assertion fails after the visual fix, investigate the
     rendered UI (snapshot) before changing the assertion. The visual result is
     the source of truth. If the snapshot shows the correct behavior but the test
     fails, the test selector or matcher is wrong — fix the selector, not the
     assertion strength. If the snapshot shows incorrect behavior, fix the
     component code.
   - Fix the code.
   - Re-snapshot and verify.
   - Maximum 3 visual fix cycles per task. After the third, report remaining visual issues in the subagent report as DONE_WITH_CONCERNS.
6. **Evidence.** Include a summary of what was visually verified in the subagent report (which pages, which breakpoints, what was checked).

**If the spec has no Visual Expectations section:** Still take a basic snapshot after implementation. Verify the page loads without errors, shows content (not a blank screen), and has no console errors. This is the minimum bar.

#### 2f. Stage 1 Review: Spec Compliance

Dispatch a fresh spec reviewer subagent with:

- Full task requirements from the plan
- The implementer's status report (what they claim they built)
- The acceptance criteria from the Live Spec
- Instructions to not trust the report and independently read the actual code

The spec reviewer verifies by reading code, not by trusting the report:
- **Missing requirements:** Was everything requested actually implemented?
- **Extra work:** Was anything built that was not requested?
- **Misunderstandings:** Were requirements interpreted correctly?

**If the reviewer finds issues:** The implementer subagent (same one) fixes them. The spec reviewer reviews again. Maximum 3 review cycles per task. After the third, escalate to the user.

**Only proceed to Stage 2 after Stage 1 passes.**

#### 2g. Stage 2 Review: Code Quality

Dispatch a fresh code quality reviewer subagent with:

- The implementer's report
- The task requirements
- The git diff (base SHA before task, head SHA after task)
- The Coding Standards section from the constitution
- Any concerns from the implementer (if DONE_WITH_CONCERNS)
- Secondary specialist matches from step 2a (so the reviewer checks those domains)
- Instructions to tag every Critical or Important finding with a stable short id (for example `cq-1`, `cq-2`) and to reuse the same id across cycles for the same underlying finding. The ids are what make the convergence check below meaningful — without them, "the same three issues came back" is indistinguishable from "three different issues".

The code quality reviewer checks the items in `<ADEV_ROOT>/skills/implement/references/code-quality-checklist.md`.

**Minor issues:** Noted but do not block progress.

**Critical or Important issues — bounded fix/review loop.** The implementer subagent (same one) fixes them and the reviewer reviews again, but the loop is capped. **Maximum 3 code-quality review cycles per task**, matching the Stage 1 cap (2f) and the visual fix cap (2e). This is a hardcoded convention because no manifest knob exists for it yet; a config-backed budget mirroring `build.max_review_retries` (see `lib/manifest.mjs` and `skills/build/SKILL.md` Step 1) is a follow-up.

Each cycle, compare the reviewer's Critical/Important finding ids against the previous cycle's set the way `/adev:build`'s BLOCK→revise loop does, using the convergence primitive `lib/loop-convergence.mjs` (`partitionBlockers` splits the two id sets into addressed / persistent / new; `evaluateStopCondition` turns that partition plus the cycles remaining into one verdict). Act on the verdict:

| Verdict | Action |
|---------|--------|
| `PASS` | No Critical or Important findings remain. Stage 2 passes; proceed to 2h. |
| `CONTINUE` | Findings were addressed (or this is the first cycle) and cycles remain. Decrement the remaining cycles and dispatch the implementer for another fix pass. |
| `NO_PROGRESS` | The reviewer returned the identical Critical/Important id set — the fix pass changed nothing the reviewer can see. Stop with `LOOP_NO_PROGRESS`. |
| `REGRESSED` | The fix pass introduced more new Critical/Important findings than it resolved. Stop with `LOOP_REGRESSED`. Preserve the work as-is (no rollback); the operator decides whether to revert. |
| `BUDGET_EXHAUSTED` | The third cycle ended with Critical or Important findings still open. Stop with `LOOP_BUDGET_EXHAUSTED`. |

**On any terminal non-PASS verdict, Stage 2 has NOT passed.** Do not fall through to 2h — the task is not marked complete, no `plan_task` `done` event is emitted, no governance gates run, and the next task is not started. Escalate through the existing blocker path from Step 2d: emit the `plan_task` `blocked` event and write execution state with `status: "blocked"`, `blockers` set to the outstanding Critical/Important findings, and `nextAction` set to the recommended fix.

What the operator sees is a halt naming the outcome, not a silent pass:

```text
Task <N> (<task-title>): code-quality review did not converge — LOOP_BUDGET_EXHAUSTED
after 3 cycles. Outstanding: cq-2 (Critical), cq-5 (Important).
The task is NOT marked complete and implementation has stopped here.
Fix the findings and re-run `/adev:implement --task <N>`, or run `/adev:recover`
if the fix loop is stuck.
```

Use the same message shape for `LOOP_NO_PROGRESS` and `LOOP_REGRESSED`, substituting the verdict and (for `LOOP_REGRESSED`) noting which findings are newly introduced.

#### 2h. Mark Task Complete

After both reviews pass, if `governance/gates.yaml` exists:
1. Read gates where `triggers` includes "post-task" or "post-implement"
2. For each gate with `kind: deterministic` and non-empty `command`: run it. If fail + `required: true` → task failure. If fail + `required: false` → log warning.
3. `kind: probabilistic` or no `command` → log "Skipped (requires platform runtime)"
4. `approver_role` → log informational note
5. If `governance/gates.yaml` does not exist, skip governance gate checks.

After both reviews pass:
1. Emit a `plan_task` `done` event: `reportPlanTask(projectRoot, specPath, { plan: planFilePath, task_id, status: "done", notes: <optional 1-line summary or null> })`. This is the **only** task-completion signal — the plan file itself is not modified.
2. **Do NOT mutate plan file checkboxes.** The `- [ ]` markers in the plan file are authoring guides for human reviewers; they are not authoritative state and are never flipped by skills. Authoritative status lives in `currentState(spec).planTasks` (folded from `plan_task` events in the lifecycle log).
3. **Commit-per-task is MANDATORY.** Per `incremental-artifact-writes.spec.md` Integration Point 2, every plan task MUST produce exactly one git commit before the orchestrator moves on. The commit IS the checkpoint — if a later task fails or a session crashes mid-pipeline, the prior task's work is preserved in git history. Multi-task implementations with a single combined commit are forbidden; they defeat the recovery guarantee.
4. **Record review-round provenance on both channels** (`review-provenance.spec.md`
   Output Contract A and B). For each review stage that ran on this task — always at least `spec-compliance` and
   `code-quality`, since 2h is reached only after both pass:
   - **Trailer.** Add one `Review-round: <stage>=<cycles>` line to this task's single
     commit, built by `buildReviewRoundTrailer(stage, cycles)` in
     `lib/lifecycle-state.mjs`. That helper is the **only** sanctioned producer of the
     line — never compose the text as prose. `cycles` counts reviewer dispatches
     **including the initial review**, so a stage that passed on first look records
     `=1`. Repeated `Review-round:` keys are legal, so two stages produce two lines. The helper
     rejects CR/LF, control/ANSI escapes, over-cap length, an out-of-enum stage, and any
     `cycles` that is not an integer >= 1; a rejection is never coerced into a written line.
   - **Event.** Emit one event per stage:
     `adev report --type review-round --spec <spec> --plan <plan> --task-id <id> --stage <s> --cycles <n> [--findings <m>]`.
     Supply `--findings` only for `code-quality` (and `synthesized`), never for
     `spec-compliance` — step 2f mandates no stable finding-id convention, so distinct
     findings are not countable there. If a stage's cycle count is genuinely unknown
     (for example the run resumed mid-task after a crash), **omit the event for that
     stage** rather than guessing: absence reads as "not recorded", and a fabricated
     count would corrupt the corpus this record exists to create.
   Still record the specialist used (or "generic") and any concerns noted in the
   task report as before. Neither channel gates task completion: a failed
   observability write is a warning naming the task, not a task failure.
5. Move to the next task.
