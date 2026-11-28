### Step 3: Final Review

After all tasks are complete, dispatch a final code quality reviewer subagent that reviews the entire implementation across all tasks:

- Cross-task consistency (shared types, naming conventions, import patterns)
- Integration between tasks (do components connect correctly?)
- Overall architecture coherence (does the whole thing match the charter's scope?)

The final reviewer is a single pass with no review loop.

**When every task resolved `lite`.** Skip the final reviewer only when every task in the run resolved `lite`: each task's final-pass `review_depth_resolved` kept `depth: lite`, so none was reviewed per task and the Step 2-post whole-run quality-gate pass has already run. A task the tripwire escalated resolved `quick` or `full`. Otherwise it runs as written above, including for a run that mixes `lite` tasks with `quick` or `full` ones. Say in the Step 4 completion report that the final review was skipped because every task resolved `lite`; `/adev:validate` covers those tasks' diff in its spec-compliance check.

If `governance/boundaries.yaml` exists, run final boundary compliance check: grep all changed files against boundary patterns, report violations. This check runs in every run, including one where the final reviewer was skipped.
