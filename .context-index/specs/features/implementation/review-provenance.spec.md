---
charter: implementation
kind: skill
status: validated
risk_level: medium
milestone:
revision: 4
charter-revision: 1
created: 2026-08-17
updated: 2026-08-17
research-ref: .context-index/research/tdd-cycle-graduation-design-analysis.md
enables:
  - .context-index/specs/features/implementation/batched-task-dispatch.spec.md
  - .context-index/specs/features/implementation/graduated-review-depth.spec.md
source-manifest:
  sha: "5e853c4"
  files:
    - .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md
    - .context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md
    - docs/cli-reference.md
    - lib/cli/report.mjs
    - lib/diagnostics/event-schemas.mjs
    - lib/lifecycle-events.mjs
    - lib/lifecycle-state.mjs
    - skills/implement/SKILL.md
    - tests/cli/report-review-round.test.mjs
    - tests/diagnostics/event-schemas.test.mjs
    - tests/diagnostics/tier1/event-schema-valid.test.mjs
    - tests/lifecycle/review-round-event.test.mjs
    - tests/lifecycle/review-round-trailer.test.mjs
    - tests/skills/implement-review-provenance.test.mjs
    - tests/specs/review-provenance-amendments.test.mjs
  computed-at: "2026-08-18T15:56:53.462Z"
---

<!-- partial_schema: implement@1 -->
<!-- partial_schema: spec@1 -->

# Skill Spec: Review-Round Provenance

<!-- Skill Spec within the implementation charter.
     Parent Charter: .context-index/specs/features/implementation/charter.md
     Source research: .context-index/research/tdd-cycle-graduation-design-analysis.md
     (Recommendation 1 — the measurement prerequisite). -->

<!-- WHY THIS SPEC EXISTS AND WHY IT IS FIRST.
     The originating issue (adev-plugin-tdd-cycle-simplification-xprl) asks which
     review rounds actually find things. That question is currently unanswerable
     from stored data: no artifact this framework writes records how many review
     cycles a task consumed or what each cycle found. Research finding F-I9
     established this, and finding F-I11 showed that commit shape alone
     corroborates the cost claim while saying nothing about yield.

     The intent to capture it already exists — skills/implement/SKILL.md step 2h
     item 4 instructs the orchestrator to "Record: specialist used, review cycles
     needed, concerns noted" — but no field, file, or schema receives it, so it
     lands in ephemeral chat output and is lost. This spec is therefore a
     completion of an existing instruction, not a new requirement.

     It ships before batched-task-dispatch and graduated-review-depth because both
     of those reduce dispatch count, and without this data neither one's effect on
     defect yield is observable. -->

## Invocation Modes

No new invocation modes and no new flags. Provenance recording is
**unconditional** — it applies on every `/adev:implement` run, in serial mode,
in `--parallel` group worktrees, and under any future batching or review-depth
setting. There is no mode in which it is disabled, because a measurement
channel that can be switched off silently produces exactly the gap this spec
closes.

## Arguments

`/adev:implement` gains no flags. This spec adds one CLI surface — the emitter for
the new event variant declared in Output Contract B.

| Argument | Required | Description |
|---|---|---|
| `/adev:implement` — *(none)* | — | No skill-level flags. Provenance recording is unconditional. |
| `adev report --type review-round --spec <spec> --plan <p> --task-id <id> --stage <s> --cycles <n> [--findings <m>]` | No | Emits one `review_round` event per stage per task. `--spec` identifies the lifecycle log to append to and is required by `adev report` for every event type. Omitted → no event, which reads as "not recorded". |

## Output Contract

### A. Per-stage cycle counts on the single task commit

**Commit granularity is unchanged by this spec.** `skills/implement/SKILL.md` step
2h authors exactly one commit per plan task, *after* both review stages pass
(a non-PASS verdict never falls through to 2h), and
`incremental-artifact-writes.spec.md` Integration Point 2 makes one-commit-per-task
mandatory because the commit is the crash checkpoint. A task's single commit
therefore fuses first-pass work with every review fix, and no commit is
exclusively a Stage 1 or Stage 2 fix.

Provenance is consequently recorded as **per-stage aggregates on that one
commit**, using a repeatable trailer key — one line per stage that ran:

```
Review-round: spec-compliance=2
Review-round: code-quality=1
```

The value is the count of reviewer dispatches that stage consumed for this task,
**including the initial review**, so a stage that passed on first look records
`=1`. Repeated trailer keys are legal in git's trailer format, so a task with two
stages produces two `Review-round:` lines.

**This is a structured trailer value, and that is a new shape for this repo.**
Every existing trailer here — `Spec:`, `Plan-task:`, and the hook-injected
`Author-type` / `Operator` — carries a bare scalar. `Review-round:` carries one
`key=value` pair, so a consumer must split on `=`. An earlier revision claimed
"no new parsing convention is introduced"; that claim was wrong and is withdrawn.
The shape is kept to exactly one pair to hold the new convention to a minimum,
and finding counts are deliberately **not** in the trailer — they live in the
event channel (B), where the id discipline that makes them countable exists.

**The trailer is constructed by a validated helper, never by free-text prose.**
`buildReviewRoundTrailer(stage, cycles)` in `lib/lifecycle-state.mjs`, co-located
with `reportReviewRound()`, is the only sanctioned producer of this trailer line,
and `skills/implement/SKILL.md` step 2h names it instead of leaving the text to
orchestrator prose. It may reuse the existing `escapeField` helper from `lib/issues/render-markdown.mjs`
(already imported by `lib/lifecycle-state.mjs`) for the escaping half, but that
reuse is an implementation convenience and not part of this contract. What the
contract requires is the behavior:

- **rejects embedded CR/LF**, so a value cannot forge an additional trailer line
  on the commit;
- **rejects control and ANSI escape sequences**, which would otherwise be echoed
  verbatim into the terminal-facing advisories this spec promises and into any
  tool rendering raw trailer text;
- **enforces a hard length cap** on the emitted `<stage>=<cycles>` string;
- **rejects a stage outside the enum, and any `cycles` failing `Number.isInteger(cycles) && cycles >= 1`** at construction. `cycles` is an integer; a float, a numeric string, `NaN`, or `Infinity` is rejected, not coerced.

Why this matters more than the equivalent gap on the event channel: the trailer
text is composed into a `git commit` message by an LLM orchestrator whose own
inputs are task reports, reviewer output, and the code under review — a surface
this codebase already treats as prompt-injectable — and **a merged commit is
materially harder to correct than an append-only JSONL row is to supersede**
(CWE-93 / CWE-113 / CWE-150). This was raised as SEC-1 against revision 2 and not
adopted in revision 3, which hardened the sibling event channel and widened the
asymmetry instead of closing it.

Note what is *not* being relaxed: **"recorded verbatim, never coerced" remains the
`value` semantics** — a `cycles` count is never silently rewritten to a
different number. Refusing trailer *syntax* that would corrupt the commit's
trailer block is a separate matter from rewriting a value, and the two are not in
tension. A refused trailer surfaces an error; it does not produce a quietly
altered one.

**First-pass is encoded positively, not by absence.** `=1` on both stages *is* the
"landed on the first look" signal. An earlier revision inferred first-pass status
from a trailer's *absence*; that was withdrawn because absence must mean "not
recorded" and cannot simultaneously mean "no rounds occurred".

**Every task commit carries at least one `Review-round:` trailer**, because 2h is
reached only after both stages pass, so both always ran at least once. A task
commit with no such trailer indicates a task that bypassed review, which is
itself the finding.

### B. A new canonical event variant: `review_round`

**`plan_task` is NOT widened.** `plan-task-events.spec.md` (`status: validated`,
`risk_level: high`) closes that payload to `plan`, `task_id`, `status`, and
optional `notes`, and forbids inventing fields: *"If a future skill needs to carry
extra metadata, it goes on `notes` … or, if structured, becomes a new event
variant in a follow-up spec."* Its Authoritative-Channel Invariant further fixes
`reportPlanTask()`'s argument surface. This spec **is** that follow-up spec, and it
takes the variant path rather than the widening path.

The precedent is `incremental-artifact-writes.spec.md` Integration Point 6, which
added `partial_recovery` as a *"New canonical event variant (NOT a widening of
`debug_intervention`)"* with a cross-spec amendment carried in lockstep. This
spec follows that shape exactly.

One event per stage per task, emitted at task completion:

```json
{ "event": "review_round", "plan": "<plan-path>", "task_id": "<id>",
  "stage": "code-quality", "cycles": 2, "findings": 1 }
```

| Field | Required | Meaning |
|---|---|---|
| `plan` | yes | Plan path, matching `plan_task`'s field of the same name |
| `task_id` | yes | Task this round belongs to |
| `stage` | yes | `spec-compliance`, `code-quality`, or `synthesized` |
| `cycles` | yes | Reviewer dispatches consumed, including the initial review. Must satisfy `Number.isInteger(cycles) && cycles >= 1` — a float, numeric string, `NaN`, or `Infinity` is rejected, never coerced |
| `findings` | no | Distinct Critical/Important finding ids produced across all cycles — **only for stages with a stable id convention** (see below) |

**Registration follows the four-step process the event module itself defines.**
`lib/diagnostics/event-schemas.mjs` states it in its header (line 18): *amend the
lifecycle-event-log spec, extend `CANONICAL_EVENTS`, extend the maps here, add
producer-test fixtures.* `REQUIRED_FIELDS_BY_EVENT` alone is **not** the closed-discriminator
authority — `lib/diagnostics/event-schemas.mjs` derives `KNOWN_EVENT_TYPES` as
`Object.freeze([...CANONICAL_EVENTS])` from the leaf module — so all four steps
land here:

| Step | Site |
|---|---|
| 1 | The cross-spec amendments below |
| 2 | `CANONICAL_EVENTS` in `lib/lifecycle-events.mjs` gains `'review_round'` |
| 3 | `REQUIRED_FIELDS_BY_EVENT` in `lib/diagnostics/event-schemas.mjs` gains `review_round: [...UNIVERSAL_REQUIRED, 'plan', 'task_id', 'stage', 'cycles']` |
| 4 | Producer-test fixtures for the new variant |

Registering in step 3 without step 2 is not a cosmetic gap: an unregistered
discriminator trips the existing `adev/event-schema-valid` Tier-1 producer at
severity `error` with *"unknown event type"*. Under the default
`event_diagnostics: tag` the event is written but permanently stamped with an
error-severity `diagnostic_warnings` entry in an append-only log; under `strict`,
`appendEvent` throws before the write. Either way the measurement channel this
spec exists to create would self-poison or fail closed. This spec therefore does
change what `adev/event-schema-valid` *accepts* — while adding no entry to
`diagnostics.yaml` and no runner to `TIER1_WRITE_TIME_RUNNERS`.

`docs/cli-reference.md` pins the verb signature as
`report --type <validator|step|reviewer|plan-task|intervention|cost-checkpoint>`,
and CLAUDE.md designates that file as the reference agents consult for CLI
signatures. It gains `review-round` as a seventh value in the same change, so the
documented surface never contradicts the implemented one.

**`findings` is scoped to stages that have stable finding ids.** Step 2g mandates
that the code-quality reviewer tag every Critical/Important finding with a stable
`cq-<n>` id reused across cycles; step 2f mandates no id convention at all for
spec-compliance. Counting "distinct findings" is therefore undefined for
`spec-compliance`, and the field is **omitted** for that stage under this spec's
own omit-rather-than-guess rule. `cycles` is still recorded for it. Giving Stage 1
an id convention would change review behavior and is out of scope here; the
`synthesized` stage in `graduated-review-depth.spec.md` gains `findings` because
that spec applies id tagging across both lenses.

**Write-time validation guard.** `reportReviewRound()` in `lib/lifecycle-state.mjs`
validates against a closed key allow-list and closed stage enum before the event
reaches the append-only log, mirroring `validateGateOutcomes()` /
`GATE_OUTCOME_KEYS` for the structurally similar `gate_outcomes` field. Validation
lives in the lib, not only in `lib/cli/report.mjs`, so a forged or misspelled
field cannot reach the log via any caller — a test, a future skill, or a later CLI
surface. Any key outside the allow-list, a stage outside the enum, `cycles < 1`,
or `findings < 0` throws `EVENT_SCHEMA_INVALID`.

**Declared cross-spec amendments (in scope, not incidental).** Both land with this
spec, in lockstep, following the `partial_recovery` precedent:

| Amendment target (full path) | Content |
|---|---|
| `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` | **Both halves that spec owns for every variant.** (i) Register `review_round` as a canonical variant, in that spec's `Behaviors` section (which carries the per-variant fold rules) and its `Acceptance Criteria` (which enumerates the legal projection keys). (ii) State the fold rule and the named projection field it lands in — see below. |
| `.context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md` | Record that per-stage review metadata is carried by `review_round`, discharging its own "becomes a new event variant in a follow-up spec" clause — `plan_task`'s closed payload is unchanged |

**The fold rule and projection field are part of the amendment, not an
afterthought.** `currentState()` is a closed `switch` over `CANONICAL_EVENTS`
whose `default:` branch pushes to `projection.unknownEvents` — a field
`lib/lifecycle-state.mjs` documents as **deprecated** and back-compat-only, the
same bucket as a corrupt or foreign discriminator. A variant added to
`CANONICAL_EVENTS` with no fold case lands there, which would make Contract C's
claim that the event "folds into the existing projection" false, and would hollow
out Contract B's entire rationale for preferring an event over the trailer
(queryability without shelling out to git).

The fold therefore surfaces these events under a named field, mirroring
`test_depth_assigned` → `testDepthAssignments` — the closest existing precedent,
and the right shape because this spec already needs a last-wins read rule:

| Property | Value |
|---|---|
| Projection field | `reviewRounds` |
| Key | `` `${plan}::${task_id}::${stage}` `` |
| Collision rule | Last event wins, matching `testDepthAssignments`' documented behavior |
| Must NOT land in | `unknownEvents[]` |

The `(plan, task_id, stage)` last-wins rule the Failure Modes table states is thereby
*implemented* by the fold rather than merely asserted at consumers.

**Absence means "not recorded", never "zero".** A task with no `review_round`
events is unknown, not cheap. Any analysis averaging cycle counts must exclude
such tasks rather than counting them as zero — otherwise the whole
pre-provenance corpus reads as a zero-cost baseline and every later comparison is
flattered.

### C. Two channels, deliberately

The trailer survives in git history independently of `.context-index/`, so it
remains readable after a context-index rebuild and is available to anyone with
a clone. The lifecycle event is queryable without shelling out to git and folds
into the existing projection under `reviewRounds` (Contract B). Neither is
derivable from the other: git history
does not know how many reviews *passed without* producing a commit, and the
event log does not survive a context-index reset.

### D. What this spec does not do

It records data. It changes no threshold, no cap, no dispatch count, and no
review behavior. A run before and after this spec must dispatch identically and
produce identical review outcomes.

The analysis that consumes this data — the round-yield table the originating
issue asked for — is explicitly **not** in scope. That analysis needs a corpus
that does not exist yet, and pre-committing to its shape now would be the same
mistake as pre-creating the implementation issue for an unanswered research
question.

## Failure Modes

**No runtime diagnostic is claimed for the trailers.** An earlier revision routed
trailer enforcement through a "write-time diagnostic". That was a
misclassification: write-time diagnostics in this repo fire from `appendEvent`
(see `write-time-diagnostic-hook.spec.md` and the `TIER1_WRITE_TIME_RUNNERS` set)
and structurally cannot observe git commits. Trailer authoring is therefore
asserted by **tests on the orchestrator's commit-authoring path**, and a
git-log-reading audit pass — which would belong to `/adev:hygiene`, the skill that
already traces commits to lifecycle artifacts — is named here as an explicit
out-of-scope follow-up rather than promised by this spec.

| Condition | Skill Behavior | User Recovery |
|---|---|---|
| No `Review-round:` trailer on a task commit | Nothing at runtime; no diagnostic observes commits. The gap is caught by the commit-path tests in Acceptance Criteria, and would be caught in history by the out-of-scope hygiene pass. | Amend the commit, or accept the gap. Note the absence is meaningful: since 2h is reached only after both stages pass, a task commit with no trailer indicates review was bypassed. |
| A `Review-round:` stage name is outside the enum, or `cycles < 1` | `buildReviewRoundTrailer()` refuses to emit the line and raises, so the malformed trailer never reaches the commit. Nothing is coerced — the value is rejected, not rewritten. | Fix the emitting path. Refusal beats recording-verbatim here because a merged commit is hard to correct; refusal beats coercion because silently rewriting a wrong stage label produces measurement that looks clean and is wrong. |
| Trailer text contains CR/LF, control, or ANSI escape sequences | `buildReviewRoundTrailer()` rejects it before `git commit` sees it, preventing a forged extra trailer line on a permanent commit and escape-sequence injection into terminal-facing advisories. | Fix the emitting path. The orchestrator must call the helper rather than compose the trailer as prose. |
| Trailer text exceeds the length cap | Rejected by the same helper. | Fix the emitting path. |
| `review_round` event carries a key outside the allow-list, a stage outside the enum, `cycles < 1`, or `findings < 0` | `reportReviewRound()` throws `EVENT_SCHEMA_INVALID` naming the offending key or value. The event is not written. | Fix the caller. Failing the write is correct here and differs deliberately from the trailer row above: the log is append-only, so a malformed event is permanent, while a malformed trailer is amendable. |
| `findings` supplied for the `spec-compliance` stage | Rejected by the same guard — the field is not in that stage's allow-list, because 2f has no stable id convention to count. | Omit `findings` for `spec-compliance`. |
| `adev report --type review-round` is passed a malformed value | Exits non-zero naming the offending argument; no event is written. Consistent with the "refuse loudly" precedent already in `lib/cli/report.mjs`. | Re-emit with a well-formed value. |
| The same stage is emitted twice for one task | Both events are written — the log is append-only and this spec adds no dedup. Consumers MUST treat the **last** event per `(plan, task_id, stage)` as authoritative. | None required. Documented rather than enforced, because rewriting append-only history to dedup is worse than a documented read rule. |
| The event write fails for an unrelated reason (disk, oversize) | Non-blocking, exactly as today: task completion is not gated on the observability write. A warning names the task. | Re-running the task re-emits. The gap reads as "not recorded", which is accurate. |
| A stage's cycle count is unknown (e.g. the run resumed mid-task after a crash) | Omit the event for that stage rather than guessing. | None needed. Omission is the honest encoding; a fabricated count would corrupt the corpus this spec exists to create. |
| A task is dispatched inside a `--parallel` group worktree | The group subagent writes the trailers on its per-task commits on the group branch and emits the events normally; both survive `adev worktree merge`. No behavior differs from serial. | None. |


## System Constitution Reference

- **Commit Trailers (CLAUDE.md, "Commit Trailers")** — Applies directly. The constitution already mandates `Spec:` and `Plan-task:` trailers on spec-tracked commits precisely so that `/adev:retro` and `/adev:hygiene` can trace commits to lifecycle artifacts. The `Review-round:` trailer extends that existing mechanism to the review dimension. It does introduce one new convention — a `key=value` trailer value where every existing trailer carries a bare scalar — which Output Contract A states explicitly rather than eliding; repetition of the key itself is already permitted by git's trailer format.
- **Principle 1 (Minimize external dependencies)** — Applies. Trailers are plain text written via `git commit`, and `review_round` is a plain object on the existing JSONL channel. No parser, no dependency, no new file format.
- **Cross-spec contract ownership (`plan-task-events.spec.md`, `status: validated`, `risk_level: high`)** — Applies as a preserved constraint. That spec closes the `plan_task` payload and directs structured metadata to a new event variant in a follow-up spec. This spec is that follow-up and takes the variant path, so `plan_task` is untouched. The paired amendments to `lifecycle-event-log.spec.md` and `plan-task-events.spec.md` are declared in Output Contract B as in-scope work landing in lockstep, following the `partial_recovery` precedent in `incremental-artifact-writes.spec.md` Integration Point 6.
- **ADR-0018** — Consulted and deliberately not followed on one point. ADR-0018 designates `reviewer_report` as the carrier for per-attempt review history. `reviewer_report` has no `task_id` field and `reportReviewer()` accepts none, so per-task attribution is not expressible there without widening that event instead — trading one payload widening for another. The new-variant path was chosen because it is the pattern `plan-task-events.spec.md` itself prescribes. Recorded so the divergence is reviewable rather than silent.
- **Autonomous (Agent May Decide) — "Adding tests"; "Refactoring within a module's boundaries"** — Applies. This spec is additive observability inside `implementation`'s own boundary. It does not touch the hook protocol, the lifecycle skill order, the CLI installation path, or any plugin manifest, so it requires no human-approval gate.
- **Measurement honesty (the dissolved `measurement-integrity.spec.md`)** — Applies as intent rather than as a live contract. That cross-cutting spec was superseded on 2026-08-13 and its behaviors dissolved elsewhere; its stated purpose was to make measurement trustworthy *before* work built on it. This spec discharges that purpose for the review dimension specifically.

## Acceptance Criteria

- [ ] Every task commit carries one `Review-round: <stage>=<cycles>` trailer per stage that ran, and commit granularity is unchanged at exactly one commit per task; a test asserts the commit count for a multi-cycle task is 1.
- [ ] A task whose stages both passed on first look records `=1` per stage; a test asserts first-pass is encoded positively, not by absence.
- [ ] `cycles` counts the initial review plus every fix pass; a test covers a task with multiple cycles in one stage and a single cycle in the other.
- [ ] `review_round` is registered in **both** `CANONICAL_EVENTS` (`lib/lifecycle-events.mjs`) and `REQUIRED_FIELDS_BY_EVENT` (`lib/diagnostics/event-schemas.mjs`) with `plan`, `task_id`, `stage`, `cycles` required; a test asserts a `review_round` write raises no `adev/event-schema-valid` error-severity diagnostic under `event_diagnostics: tag` and is not rejected under `strict`.
- [ ] A test asserts `plan_task`'s payload is unchanged (regression guard against the widening rejected at revision 3).
- [ ] Producer-test fixtures exist for the new variant, completing step 4 of the four-step process.
- [ ] The projection surfaces `review_round` under `reviewRounds`, keyed `plan::task_id::stage` with last-wins, and a test asserts it does **not** appear in the deprecated `unknownEvents[]`.
- [ ] `docs/cli-reference.md`'s `report --type` enum includes `review-round`, and a test or doc check asserts the documented enum matches the implemented one.
- [ ] `buildReviewRoundTrailer(stage, cycles)` is the only producer of the trailer line, and `skills/implement/SKILL.md` step 2h names it; tests assert it rejects embedded CR/LF, control/ANSI escape sequences, over-cap length, an out-of-enum stage, and `cycles < 1`, and that a rejected value is never silently coerced.
- [ ] `reportReviewRound()` validates against a closed key allow-list and closed stage enum **in the lib**, throwing `EVENT_SCHEMA_INVALID`; tests assert a forged key, an out-of-enum stage, `cycles: 0`, and `findings: -1` are each rejected regardless of caller.
- [ ] `findings` is accepted for `code-quality` and `synthesized` and **rejected** for `spec-compliance`; a test asserts the rejection and cites 2f's absent id convention.
- [ ] `adev report --type review-round` emits the event, and refuses loudly on malformed input without writing.
- [ ] Consumers treat a missing `review_round` as unknown, not zero; a test asserts no coercion to zero.
- [ ] Consumers treat the last event per `(plan, task_id, stage)` as authoritative when duplicates exist, matching the `reviewRounds` fold key exactly.
- [ ] The declared cross-spec amendments to `lifecycle-event-log.spec.md` and `plan-task-events.spec.md` land with this spec, not after it.
- [ ] `diagnostics.yaml` gains no entry and `TIER1_WRITE_TIME_RUNNERS` gains no runner; a test asserts both. (This spec does change what the existing `adev/event-schema-valid` producer *accepts*, via `CANONICAL_EVENTS` — that is intended and is covered by the registration criteria above.)
- [ ] Existing lifecycle logs written before this spec validate unchanged, with no migration step.
- [ ] Dispatch counts and review outcomes are unchanged by this spec: an eval or test asserts enabling provenance alters no review behavior.
- [ ] `skills/implement/SKILL.md` step 2h item 4 is updated to name the artifacts that now receive what it already instructs the orchestrator to record.
- [ ] All quality gates pass; no constitutional violations introduced.
