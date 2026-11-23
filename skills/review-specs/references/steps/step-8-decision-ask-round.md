## Step 8 BLOCK branch: decision ask round

Read this on every BLOCK verdict. It runs `adev decisions pending` and routes the rest. The verdict stays BLOCK throughout: the round records answers, it never changes the verdict.

Start with:

```bash
adev decisions pending --spec <spec-path> --json
```

Its output carries `pending` (each entry has `blocker_id`, `question`, `options` with `label` and `implications`, `header`, `structured`, optional `duplicate_of`, and `ask`), `ask_round` (`{ limit: 16, asked, overflow }`) and `advisories`. If `pending` is empty, skip this round and use the plain BLOCK summary.

### With `--defer-decisions`

Ask nothing. The BLOCK summary lists every pending decision (question and options), then returns. The caller owns the ask round or the `DECISION_REQUIRED` halt. `/adev:build` passes this flag on every review dispatch. Every headless, scheduled or scripted caller must pass it too.

### Without the flag: one bounded ask round

**Attendance rule.** Invoke the structured-question tool only when an operator is attending: `--defer-decisions` is absent and this skill is not running as a dispatched subagent. A session that is headless but reached this round without the flag asks nothing; every group stays open. The round has no timeout of its own: a call that never returns is a harness hang, outside this skill's bound. The skill's guarantee is that the tool is never reached without an operator.

1. From the `adev decisions pending` output above (do not run it again), take only groups marked `ask: true`. A `duplicate_of` group is one question: ask it once, through its first entry. At most 16 groups per round are `ask: true`; every later group (`ask: false`, counted in `ask_round.overflow`) is not asked and stays open.
2. Structured groups (`structured: true`) go through the harness's structured-question tool (`AskUserQuestion` on Claude Code). Use at most 4 questions per call, so ceil(n/4) calls for n structured groups. Issue the calls back-to-back, with no reviewer dispatch, spec edit or other prompt between them. Show each option with its `implications` as the description, use the group's `header`, and let the operator answer with a free-text note when the tool allows it.
3. Then send at most one message carrying every unstructured group as numbered questions, each with its options. Where the harness has no structured-question tool, that one message carries every `ask: true` group instead.
4. Never re-ask or loop. A question stays open when its call returns no answer or an error, or when it gets no reply (including a numbered message whose turn ends unanswered). Record nothing for it. There is no timeout and no default answer.
5. Write every answer you received to a temp file inside the project root, for example `.context-index/packets/decision-answers.json` (gitignored; `@path` must be contained in the project). Each answer is `{ "blocker_ids": [...], "choice": "<option label>", "note": "<optional>" }`. Apply a group's answer to every blocker_id in that group, including the `duplicate_of` entries you did not ask about.
6. Record them with one `adev decisions record`, never one call per answer:

```bash
adev decisions record --spec <spec-path> --answers @.context-index/packets/decision-answers.json
```

If nothing was answered, skip the record call.

### BLOCK summary with decisions

```
Review complete. Specs blocked.

  <spec-slug>: BLOCK (<n> blockers, <w> warnings)

  Blockers:
  - <blocker_id>: [brief description]

Decisions recorded this round: <k>.

Open decisions (<m>):
  - <blocker_id>: <question>
      1. <option label> - <implications>
      2. <option label> - <implications>

Next steps:
  1. adev decisions record --spec <spec-path> --answers <json|@path>   (for the open decisions)
  2. /adev:specify --revise <spec-path>, then /adev:review-specs to re-review.
```

List open decisions from every cause: unanswered, errored, no reply, overflow, and every decision under `--defer-decisions`.

- Under `--defer-decisions`, omit the "Decisions recorded this round" line.
- When no decision remains open, omit "Open decisions"; Next steps then starts at `/adev:specify --revise`.
