---
charter: planning
charter-revision: 2
kind: behavioral
status: implemented
risk_level: low
tracker-ref: adev-plugin-lifecycle-cycle-time-qa41.4
revision: 1
created: 2026-11-19
updated: 2026-11-19
source-manifest:
  files:
    - path: lib/review-notes.mjs
    - path: lib/cli/review-notes.mjs
    - path: skills/review-specs/SKILL.md
    - path: skills/plan/references/steps/step-1-review-gate.md
    - path: skills/plan/references/steps/step-2-load-context.md
    - path: skills/plan/references/steps/step-5-write-the-plan.md
---

# Live Spec: Review Notes Carry-Forward — PASS_WITH_NOTES warnings go into the plan

## Problem

In a field session a spec passed review (PASS_WITH_NOTES) at revision 5, then went through five more revise-and-review rounds (revisions 6-10) to clear non-blocking warnings. Each round produced about six new warnings, so the count never converged, and revision 7 regressed to BLOCK on wording added to fix an earlier warning. `/adev:build` already stops at PASS_WITH_NOTES (`lib/loop-convergence.mjs`), so those rounds were manual, and the skills invited them:

- `/adev:review-specs` Step 8 closed the PASS_WITH_NOTES report with "You can proceed to /adev:plan or address the warnings first."
- `/adev:plan` Step 1 only printed PASS_WITH_NOTES warnings, so they were lost unless someone re-ran the review.

## Behavioral Contract

### Behaviors

1. **When** `/adev:review-specs` reports a PASS_WITH_NOTES verdict **then** the report recommends `/adev:plan --spec <path>`, says the warnings carry forward into the plan, and states why another revise-and-review round is not recommended: warning counts do not converge to zero under re-review, and edits made to clear a warning can regress the spec to BLOCK. It does not offer addressing the warnings first as a co-equal next step.
2. **When** `/adev:review-specs --spec <path>` is invoked on a spec whose latest lifecycle review verdict is PASS or PASS_WITH_NOTES and whose bytes match the `.review.md` `file-sha` **then** it prints a non-blocking advisory recommending `/adev:plan`, and then runs the requested review. It prints nothing when the spec has changed, when the `file-sha` is absent or not a sha256, or when the verdict is anything else.
3. **When** `/adev:plan` passes the review gate on a PASS_WITH_NOTES spec **then** it reads the open warnings with `adev review-notes show --spec <path> --json` and writes a `## Review Notes` section into the plan, immediately after the Task Summary: one row per warning with its ID (or `(no ID)`), a one-line summary, the cited spec section (or `—`), and an assignment.
4. **When** a warning cites a spec section **then** it is assigned to the first task (lowest task number) whose work touches that section. **When** it cites no section, or no task touches it, **then** the assignment reads exactly `unassigned — address in Task 1`. Each assigned task's Context Packet lists the warning IDs it owns.
5. **When** the latest lifecycle review verdict is PASS **then** `adev review-notes show` returns no warnings and the plan has no `## Review Notes` section.

### `adev review-notes show`

`adev review-notes show --spec <path> [--json]` (`lib/cli/review-notes.mjs`, wrapping `lib/review-notes.mjs::readReviewNotes`) prints `{ spec, review, verdict, unchangedSinceReview, warnings }`:

- `verdict` — from the lifecycle log (`currentState().steps.review`), never from `.review.md`, matching the `/adev:review-specs` Gate Behavior rule that the log is the source of truth. `null` when no terminal review step is recorded.
- `unchangedSinceReview` — `true`/`false` from comparing the spec's sha256 with the `.review.md` `file-sha`; `null` when the report has no sha256 there.
- `warnings[]` — `{ id, reviewer, section, summary }` from `extractReviewWarnings()`: open `warning`-severity findings only. Suggestions, blockers, struck-through (`~~`) or resolved findings, and findings inside fenced code blocks are skipped. The first open-warning occurrence of an ID wins. `summary` is a single line of at most 160 characters.

`.review.md` finding text is reviewer prose with no fixed grammar, so the parser covers the shapes the reviewer prompts and the corpus produce (heading form with field lines, bold list form with a parenthesised severity, em-dash and pipe separated forms, bracketed severity, four-column tables, and legacy `WARNING:` lines without an ID). It is best-effort: when `warnings` is empty but the verdict is PASS_WITH_NOTES, `/adev:plan` reads the report by hand.

Exit codes: `0` report printed; `1` argument error, or a spec that is missing or resolves outside the project root (one message for both).

### Integration Points

- **Plan immutability** (`agent-reliable-state-artifacts/plan-task-events.spec.md`, `lib/plan-immutability.mjs`): the `## Review Notes` section is authored during Step 5, in the incremental append order (Task Summary → Review Notes → Task Structure), before Step 7 emits the `plan_task` `pending` events. It is never edited afterwards; resolving a warning is recorded on the owning task's lifecycle events and commit.
- **Plan parsers**: the section contains no `### Task N` heading and no `- Group` line, so `lib/reality-check.mjs`, `lib/meta-tools.mjs` and `lib/parallel/groups.mjs` are unaffected.
- **Build loop**: unchanged. `lib/loop-convergence.mjs` already stops the BLOCK→revise loop at PASS_WITH_NOTES.

## Acceptance Criteria

- [x] The Step 8 PASS_WITH_NOTES template recommends `/adev:plan`, says warnings carry forward, and gives the non-convergence / regression reason (`tests/skills/review-notes-carry-forward.test.mjs`)
- [x] `/adev:review-specs` Step 1 prints the unchanged-spec advisory from `adev review-notes show` and does not block
- [x] `/adev:plan` Step 1 reads warnings with `adev review-notes show`; Step 5's template has a `## Review Notes` section with the assignment rule
- [x] `extractReviewWarnings` / `readReviewNotes` covered by `tests/lib/review-notes.test.mjs` against `tests/fixtures/review-notes/mixed-formats.review.md`
- [x] The CLI verb is covered by `tests/cli/review-notes.test.mjs` and documented in `docs/cli-reference.md`
- [x] No inline Node or executable fenced JavaScript added to any SKILL.md
