## Single Spec Mode (`--spec`)

When `--spec <path>` is invoked without `--resume`, `--charter`, `--milestone`, or `--dry-run`:

1. Verify the spec file exists. If not, print: "Spec not found: `<path>`" and stop.
2. Create or reset the build state file for this spec.
3. If `tasks.backend` is configured, find the matching issue for this spec and mark it `in_progress`.
4. Execute the 5-step pipeline in order (see Build Pipeline above).
5. On completion, print the summary.

### Summary Output

```
Build complete.

  Spec: <path>
  Status: PASSED | FAILED at step <N> (<step-name>)
  Steps:
    1. Review    — completed | skipped | failed
    2. Plan      — completed | skipped | failed
    3. Route     — completed | skipped
    4. Implement — completed | failed
    5. Validate  — PASS | FAIL | PASS (after N retry cycles)
  Retry cycles: 0 | N of M (checks fixed: [...], regressions: [...])
```

### Completion token (`/goal`-friendly)

When the build reaches a terminal state for a single spec (or the final spec of a `--charter`/`--milestone` run), the **final line** of your chat output for that run MUST be the build completion token — emit it verbatim, mapped from the terminal status:

- All required steps completed and the terminal Validate step reported PASS → `ADEV-BUILD: COMPLETE`
- A non-review step errored and halted the pipeline (e.g. implement/validate failure with `build.max_retries == 0`) → `ADEV-BUILD: FAILED`
- The pipeline stopped on an unresolved review state → `ADEV-BUILD: BLOCKED`. This is the terminal token when the review step's final convergence verdict (from `lib/loop-convergence.mjs`) is one of `BUDGET_EXHAUSTED`, `NO_PROGRESS`, `REGRESSED`, or `PASS_PENDING_HUMAN` (the `--require-human-final-pass` halt awaiting operator sign-off), or when `build.max_review_retries == 0` and review returned BLOCK.

Rules: emit it exactly once, as plain text (no code fence, no backticks, no trailing prose after it), as the very last line, regardless of the active persona or verbosity level. It is a transcript-provable marker so Claude Code's `/goal` evaluator can read completion from the transcript (see `.context-index/specs/cross-cutting/completion-tokens/`). Subagents and per-step sub-skills (review/plan/implement/validate) MUST NOT emit a build completion-token line — only this top-level orchestrator does, once, at terminal state.

---
