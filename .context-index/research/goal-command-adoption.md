---
topic: "Adopting Claude Code's built-in /goal command into the adev framework — feasibility and integration design"
date: "2026-06-02"
relates-to:
  - .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
  - .context-index/specs/cross-cutting/lifecycle-gate.spec.md
  - .context-index/specs/cross-cutting/execution-profiles.spec.md
  - skills/build/SKILL.md
  - skills/validate/SKILL.md
  - lib/loop-convergence.mjs
sources:
  - https://code.claude.com/docs/en/goal
  - https://github.com/jthack/claude-goal
  - https://venturebeat.com/orchestration/claude-codes-goals-separates-the-agent-that-works-from-the-one-that-decides-its-done
  - https://www.mindstudio.ai/blog/claude-code-goal-command-autonomous-tasks
  - internal
status: complete
---

## Summary

`/goal` is **not an installable skill** — it is a built-in Claude Code command shipped in
v2.1.139 (May 2026). It is a thin wrapper around a *session-scoped, prompt-based Stop hook*
plus a small/fast evaluator model (Haiku by default). You set a completion condition; after
every turn the evaluator reads the transcript and decides yes/no; "no" starts another turn,
"yes" clears the goal.

This reframes the adoption question. There is nothing to vendor or reimplement. The real
question is **how adev should relate to a harness primitive that overlaps with machinery
adev already built** — namely `/adev:build`'s self-re-invocation loop and the
`loop-convergence.mjs` evaluator.

**Verdict: do not reimplement. Adopt `/goal` as a complementary *outer driver* and make
adev's terminal skills `/goal`-friendly.** adev already has a stronger, deterministic,
tool-backed version of the same loop for its core lifecycle; `/goal`'s evaluator is
subjective and transcript-only. The two solve different halves — adev owns *what "done"
means* (deterministic gates), `/goal` owns *keeping the session running until done*
(unattended continuation). Let each keep its half.

## What `/goal` actually is

| Property | Behavior |
|---|---|
| Trigger | `/goal <condition>` starts a turn immediately, condition as the directive |
| Loop | After every turn a separate fast model (Haiku) reads the transcript, returns yes/no + reason; "no" → another turn with the reason as guidance; "yes" → goal clears |
| Evaluator limits | **Cannot run tools or read files** — judges only what Claude surfaced in the transcript. Conditions must be transcript-provable. |
| Bounding | No hard default cap; embed limits in the condition ("…or stop after 20 turns"). Condition ≤ 4,000 chars. |
| Implementation | Session-scoped prompt-based Stop hook. Requires workspace trust; unavailable if `disableAllHooks` or `allowManagedHooksOnly` is set. |
| Non-interactive | `claude -p "/goal …"` runs the loop to completion in one invocation; pairs with auto mode for unattended runs. |
| Resume | An active goal is restored on `--resume`/`--continue` (condition carries over; turn/token/timer baselines reset). |

`/goal` is explicitly contrasted in the docs with `/loop` (time-interval continuation) and
hand-written Stop hooks (custom logic). It is the "until a model confirms the condition"
member of that family.

The community precursor `jthack/claude-goal` implements the same idea as an actual
installable skill: SQLite state at `~/.claude/goal/goals.sqlite`, a Stop hook that blocks
stopping while a goal is active, and a 500-continuation guard
(`CLAUDE_GOAL_MAX_STOP_CONTINUES`). It is a useful reference for self-hostable mechanics but
is superseded by the official built-in.

## What adev already has (the parallel)

adev independently evolved the same "doer that works / checker that decides done" split, but
**deterministically and tool-backed**:

- **`/adev:build`** (`skills/build/SKILL.md`) is a hand-rolled goal loop: one step per turn,
  results recorded to `build-state.json`, then it **re-invokes itself with a fresh context**
  (`/adev:build --resume`) until the pipeline completes. The skill warns: *"Ending your
  response without re-invoking is a build failure."* That is a manual Stop-hook continuation.
- **Convergence detector** (`lib/loop-convergence.mjs`) is adev's evaluator analog. It
  compares *blocker-ID sets* across spec revisions and returns
  `PASS / CONTINUE / NO_PROGRESS / REGRESSED / BUDGET_EXHAUSTED`, bounded by
  `build.max_review_retries` (default 2).
- **`/adev:validate`** (`skills/validate/SKILL.md`) is the checker: a 13-check PASS/FAIL
  suite in an isolated subagent context, separate from the implementer.
- **Lifecycle gates** (`lifecycle-gate.spec.md`) block progression at `off/warn/confirm/block`
  levels.

The decisive difference: adev's evaluators **run tools** (tests, blocker-ID diffs, file
checks). `/goal`'s evaluator **cannot** — it only judges the transcript.

## Head-to-head

| Dimension | adev today | `/goal` |
|---|---|---|
| Loop continuation | Self re-invocation (`/adev:build --resume`) | Stop hook, automatic |
| "Done" decision | Deterministic (blocker-ID diff, exit codes, gates) | Subjective (Haiku reads transcript) |
| Checker can run tools? | **Yes** | **No** (transcript-only) |
| Bounding | Explicit caps (`max_retries`, convergence verdicts) | Prose ("stop after N turns") |
| Governance fit | Native — adev *is* gate-based governance | Weaker — hands the done-call to a model |
| Setup cost | Already built | Zero (harness built-in) |
| Scope | adev lifecycle only | Anything |

**Architectural tension:** adev's third pillar is Gate-Based Governance. Letting a Haiku
transcript-read decide "done" is softer than adev's deterministic gates. So `/goal` must not
*replace* adev's gates — it should be the unattended *outer engine* while adev's
deterministic checks remain the real arbiters.

## Adoption options

**Option 1 — Document `/goal` as a complementary driver (recommended, zero code).**
Guide users to wrap adev pipelines in a goal for hands-off execution:

```
/goal /adev:build --auto --spec <path> has run to completion and /adev:validate reports PASS
```

`/goal` + auto mode supply per-turn continuation; adev's `--auto` flag + deterministic gates
supply the real done-check. The Haiku evaluator only confirms what validate already proved in
the transcript. Natural home: `docs/concepts.md` or a new `docs/unattended-runs.md`.

**Option 2 — Make adev's terminal skills `/goal`-friendly (small, high-value).**
Because the evaluator sees only the transcript, terminal skills should print a
machine-checkable completion line — e.g. `/adev:validate` ending with a literal
`ADEV-VALIDATE: PASS` / `FAIL` token and `/adev:build` printing `ADEV-BUILD: COMPLETE`. Then a
goal condition becomes trivially reliable: *"the transcript contains `ADEV-BUILD: COMPLETE`
and `ADEV-VALIDATE: PASS`."* This removes the evaluator's main failure mode (guessing) for a
few output-format edits. Worth a spec.

**Option 3 — Reimplement a goal loop inside adev (not recommended).**
adev already has a better bounded loop for its domain (convergence detector + gates).
Rebuilding an open-ended subjective loop duplicates a harness feature, weakens determinism,
and adds maintenance. The only idea worth borrowing is the explicit continuation-cap guard
(`CLAUDE_GOAL_MAX_STOP_CONTINUES`-style), which `max_retries`/convergence verdicts already
cover.

## Recommendation

1. Adopt `/goal` as **documentation + an outer driver**, not as code (Option 1).
2. Spec a small **"`/goal`-friendly completion tokens"** change so terminal skills emit
   transcript-provable PASS/COMPLETE markers (Option 2) — the one piece of real engineering,
   and the thing that makes `/goal` reliable on top of adev.
3. Keep adev's **deterministic gates as the source of truth**. `/goal` removes per-turn
   prompting; it must never become the thing that decides a spec is correctly implemented.

## Open questions / follow-ups

- Should completion tokens be a cross-cutting convention (all terminal skills) or scoped to
  `build`/`validate` first? A cross-cutting spec is cleaner but touches more SKILL.md files
  and the skills-extension coverage test.
- Does `--auto` already emit anything transcript-stable enough to use as a goal condition
  today, or is Option 2 a hard prerequisite? (Audit `skills/build/SKILL.md` final-report
  format.)
- Interaction with `/loop` and scheduled/cloud routines for nightly unattended adev builds —
  worth a follow-up note once Option 1 lands.
