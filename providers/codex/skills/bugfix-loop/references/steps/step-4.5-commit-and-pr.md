## Step 4.5: Commit and open a PR (FIXED verdicts only, gated)

Run this step only when **both** are true: the verdict from Step 4 was `FIXED`, **and** `--worktree-per-bug` or `--auto-commit` was passed. `PARKED`/`UNREPRODUCIBLE` skip this step entirely — nothing is committed or pushed for that bug (BEH-5). Without `--worktree-per-bug` and without `--auto-commit`, also skip this step entirely — this matches today's behavior exactly (nothing committed by the loop).

```bash
adev bugfix-loop commit-pr --run-id <run_id> --issue <id> --title "<WorkItem title>" [--notes "<WorkItem notes>"] [--spec-path <spec-path>] --pr-base <worktree_base_ref-from-Step-1-guard> --json
```

`--title`/`--notes` are the `bug.title`/`bug.notes` fields already in hand from Step 2's `adev issues next` result for this bug — no new lookup is needed. `--pr-base` is the `worktree_base_ref` value already read from Step 1's `guard --json` result this turn — the loop's starting branch for the first bug, or the previous bug's completed branch when `--worktree-per-bug` stacking is active (BEH-4). Never resolve this independently here; reuse the value Step 1 already produced.

`--spec-path` is optional and typically omitted: an ordinary bug fix is not spec-tracked work, and `bug`/`WorkItem` carries no structured spec-reference field. Pass it only if the WorkItem's notes happen to name a governing spec file for the fixed capability — most attempts will simply omit this flag.

Read the JSON result:

- `{"skipped": false, "branch": "...", "prUrl": "..."}`: the commit landed and a PR was opened — `commit-pr` already called `recordWorktreeBranch` internally on this path, so Step 3's next-bug base-ref resolution picks it up automatically; nothing further to do with `branch` here.
- `{"skipped": true, "reason": "..."}`: `commit-pr` degraded (`COMMIT_PR_SKIPPED` — `gh` missing/unauthenticated, push rejected, or a git sub-stage failed). Log the reason and continue; the bug's `AttemptRecord`/board state (already written above) is unaffected, and this never blocks or halts the run (BEH-7). Note the `reason` text for Step 6's worktree-teardown decision below — it distinguishes a pre-commit failure (worktree removal deferred) from a post-commit push/PR failure (safe to remove).

This step always exits 0 — there is no failure path here that halts the turn.
