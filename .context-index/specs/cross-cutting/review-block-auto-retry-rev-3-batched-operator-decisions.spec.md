---
partial_schema: spec@1
mode: cross-cutting
affects: [review, spec-lifecycle, strategic-planning, agent-reliable-state-artifacts]
kind: behavioral
status: review-pending
risk_level: medium
revision: 1
charter-revision: 1
amends: .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
target-revision: 3
tracker-ref: adev-plugin-lifecycle-cycle-time-qa41.5
created: 2026-11-22
updated: 2026-11-22
---

# Amendment: Live Spec: Auto-Retry Loop on Review BLOCK — Batched Operator Decisions (targeting rev 3)

> This spec **amends** `.context-index/specs/cross-cutting/review-block-auto-retry.spec.md` targeting revision 3.
> It builds on revision 2 (`review-block-auto-retry-rev-2-targeted-author-verify-loop.spec.md`), whose
> `finding_class` taxonomy and `DECISION_REQUIRED` halt it extends. The base spec and the rev-2 amendment
> are immutable; this artifact carries the delta and is reviewed, planned, and validated on its own lifecycle.

## Amendment Rationale

In a measured field session (the cycle-time report behind `adev-plugin-lifecycle-cycle-time-qa41`), the largest
single cost was **waiting for operator decisions**: gaps of 80 min, 1 h 50 min, and 42 min between a blocked
review and the next revision. The decisions surfaced one per round — preview access for agents, then the MCP
budget; slug disclosure, then the probe cap, then the slug window; the admin-channel priority last — so every
decision paid a full review round trip before the next one was even visible.

Revision 2 already separates "needs a human" from "the author can fix it": a BLOCK finding carries
`finding_class: decision`, and the build loop halts with `DECISION_REQUIRED` rather than letting an author guess
(rev-2 BEH-1, BEH-2). What happens *after* that halt is unspecified, and that is where the time goes:

1. **A decision finding is prose only.** There is no `question` to put to the operator and no `options` with
   their consequences, so the operator reconstructs the choice from the finding text, and second-order
   questions ("if you pick A, what is the cap?") are only discovered by the next review round.
2. **Nobody asks.** `/adev:review-specs` Step 8 prints the BLOCK summary and says "run /adev:specify";
   `/adev:build` halts naming the blocker ids. Each decision is answered whenever the operator happens to
   read it, one at a time.
3. **Answers have nowhere to go.** `lib/specify-revise.mjs` never authors a `decision` blocker, and specs
   have no convention for recording a settled choice. The operator edits the spec by hand, and the next
   round's reviewers — or a sibling spec's reviewers — cannot tell a settled choice from an open one.

This amendment closes all three: reviewers state the question and the options with their implications;
one ask round collects every open decision across every reviewer; answers are recorded in the spec's
`## Decisions of Record` section, from which `/adev:specify --revise` authors them and later reviewers read
them as settled.

**Caveat, stated up front.** Some decisions only exist because of an earlier answer. Asking for implications
per option and for foreseeable follow-on decisions in the same round reduces the round trips; it cannot
remove those that depend on an answer not yet given.

## Behavioral Delta

### Behaviors Added

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** a reviewer emits a BLOCK finding with `finding_class: decision` **then** it may also carry
  `question` (one sentence the operator answers, ending in `?`) and `options` (2–4 entries, each
  `{ label, implications }`: `label` ≤ 60 characters naming the choice; `implications` ≤ 300 characters stating
  what that answer forces in the spec — including any follow-on decision it would open). Every bundled reviewer
  prompt that defines `finding_class` (`structural-architect`, `security-reviewer`, `consistency-analyzer`,
  `boundary-reviewer`, `referent-integrity`, `termination-reviewer`, `wiring-reviewer`,
  `quick-synthesized-reviewer`) instructs the reviewer to supply both fields for every `decision` finding, and to
  raise a follow-on decision it can already foresee — one that arises whichever option is chosen — as its own
  `decision` finding in the same round rather than leaving it for the next. Both fields are optional: a
  `decision` finding without them remains valid.

- **BEH-2** — **When** `adev blockers write` persists a `decision`-classed entry carrying `question` and/or
  `options` **then** the sidecar entry gains `question: <JSON-quoted string>` and `options: <single-line JSON
  array>` keys, written with the same untrusted-input posture rev-2 BEH-1 applies to `remedy_ref`: JSON-quoting
  keeps reviewer text inert inside the YAML fence; `question` longer than 500 characters is truncated with the
  existing truncation marker; `options` with fewer than 2 or more than 4 entries, or any entry whose `label` is
  empty, is dropped with an `OPTIONS_REJECTED` advisory while the entry and its `question` are kept; `label` and
  `implications` over their bounds are truncated. Either field on an entry that is not `decision`-classed is
  ignored with a `DECISION_FIELDS_IGNORED` advisory. Every render path that displays these values to a terminal
  or prompt applies the control-character and ANSI-escape stripping `renderRemedyRef` applies.

- **BEH-3** — **When** `adev decisions pending --spec <path> [--json]` runs **then** it reads the spec's
  `.blockers.md` sidecar and the spec's `## Decisions of Record` section and prints every `decision`-classed
  blocker that has no recorded decision, ordered by the position of its `section_anchor` heading in the spec
  (unresolvable anchors last), then by `blocker_id`. Each entry carries `blocker_id`, `section_anchor`,
  `question` (when the sidecar has none, derived from the first sentence of the blocker prose, capped at 500
  characters, with a `QUESTION_DERIVED` advisory), `options` (possibly empty), `header` (≤ 12 characters, derived
  from the section heading), and `structured` (true exactly when `options` has 2–4 entries). The output also
  lists already-decided entries under `decided`, each with its `DEC-<n>` id. A spec with no sidecar, or no
  `decision` blockers, prints an empty `pending` list and exits 0.

- **BEH-4** — **When** `/adev:review-specs` reaches Step 8 with verdict BLOCK and `adev decisions pending` returns
  a non-empty list **then**, before printing the BLOCK summary, the skill asks every pending decision in **one
  ask round**: structured entries through the harness's structured-question tool in calls of at most 4 questions
  each (the tool's per-call limit), issued back-to-back with no reviewer dispatch, spec edit, or other prompt
  between calls, each option shown with its `implications` as the description; unstructured entries together in
  a single message after the structured calls. Where the harness has no structured-question tool, all pending
  entries go in one numbered message. When two pending entries in the same section ask the same choice, the
  skill may ask it once and record the answer against both `blocker_id`s. The operator may leave any question
  unanswered. The skill then records every answer with `adev decisions record`, and the BLOCK summary reports
  how many decisions were recorded and how many remain open, and names `/adev:specify --revise <spec>` as the
  next step.

- **BEH-5** — **When** `adev decisions record --spec <path> --answers <json-or-@path>` runs with an array of
  `{ blocker_ids: [<id>, …], choice: <string>, note?: <string> }` **then** it writes one entry per answer into
  the spec's `## Decisions of Record` section — creating the section immediately before `## Acceptance Criteria`
  when absent, or at end of file when that heading is also absent — as a machine marker line
  `<!-- adev:decision DEC-<n> blockers=<id>,<id> -->` followed by
  `- **DEC-<n>** — <question> → **<choice>**. <implications of the chosen option, when it matches an option
  label>. <note, when given>`. `DEC-<n>` ids are allocated like `BEH-<n>` ids: one greater than the highest ever
  used in the section, never reused. Re-recording a `blocker_id` that already has an entry replaces that entry
  in place and keeps its `DEC-<n>`. `choice` and `note` are operator text: control characters are stripped, the
  SEC-3 redaction set is applied, and each is capped at 1,000 characters. Every byte outside the section is
  unchanged; the write is atomic (temp-then-rename); the spec's `revision:` and `status:` are not touched —
  `/adev:specify --revise` bumps them when it authors the decisions in.

- **BEH-6** — **When** `adev specify group-blockers` reads a `decision`-classed blocker whose `blocker_id` has a
  recorded decision **then** that blocker is grouped into `anchors` under its `section_anchor` like a `defect`
  blocker, with the recorded decision attached as `decisions: [{ id: "DEC-<n>", blocker_id, choice, note }]` on
  the anchor, and is excluded from `decision_blocker_ids`. The per-anchor authoring dispatch
  (`revise-mode-authoring-dispatch.md`) passes each attached decision to the section's author as a binding
  instruction — the section must be rewritten to implement the recorded choice, not to reopen it. A
  `decision`-classed blocker with no recorded decision stays in `decision_blocker_ids` and halts the loop exactly
  as rev-2 BEH-2 specifies. `addressed_blocker_ids` is computed unchanged (rev-2 BEH-5): a decided blocker is
  addressed only when its anchored section text changed.

- **BEH-7** — **When** the `/adev:build` review auto-retry loop gets a non-empty `decision_blocker_ids` from
  `adev specify group-blockers` in interactive mode (no `--auto`) **then**, instead of halting, the orchestrator
  runs the BEH-4 ask round against `adev decisions pending`, records the answers, re-runs `adev specify
  group-blockers`, and — when no undecided `decision` blocker remains — continues the same cycle into per-anchor
  authoring. The ask round dispatches no reviewer and consumes no review retry. If any decision is left
  unanswered, the loop halts with `DECISION_REQUIRED` as rev-2 BEH-2 specifies. Under `--auto`, the loop halts
  with `DECISION_REQUIRED` without asking, and the halt message lists every pending decision with its question
  and options (from `adev decisions pending`), so they can all be answered in one sitting, and names
  `adev decisions record` followed by `/adev:build --resume` as the recovery path.

- **BEH-8** — **When** a reviewer is dispatched for a spec whose body has a `## Decisions of Record` section
  **then** the reviewer prompt instructs it that a recorded decision is settled: it must not re-raise the same
  choice as a `decision` finding; it raises a `defect` when the spec text contradicts a recorded decision; and it
  may raise a new `decision` finding only for a different choice, including a follow-on choice that a recorded
  answer opened. The section lives in the spec body, so it reaches the reviewer through the spec text it already
  receives; no new context-pack entry is introduced.

### Behaviors Amended

- **rev-2 BEH-1** — the `decision` value of `finding_class` gains the optional `question` and `options` fields of
  BEH-1 above, persisted per BEH-2. The `defect` and `external` values are unchanged.
- **rev-2 BEH-2** — the `DECISION_REQUIRED` halt now applies only to `decision` blockers with **no recorded
  decision** (BEH-6), and in interactive mode it is preceded by the ask round (BEH-7). Under `--auto`, the halt is
  unchanged except for the fuller halt message.

### Behaviors Retired

None.

## Preconditions Delta

- The spec under review or revision has a `.blockers.md` sidecar written by `adev blockers write`, whose header
  revision matches the spec's `revision:` frontmatter, before `adev decisions record` will write to it.
- `adev decisions pending` has no precondition beyond a readable spec path inside the project root.

## Postconditions Delta

- After an ask round, every answered decision has exactly one `DEC-<n>` entry in the spec's
  `## Decisions of Record` section, and the spec is otherwise byte-identical.
- After `/adev:specify --revise`, each decided blocker's section implements the recorded choice and the
  `## Decisions of Record` section is preserved byte-identical (it is not an authoring target).
- A `decision` blocker never reaches an author without a recorded decision — rev-2's "never guess" guarantee is
  preserved.
- `decision` findings with no recorded answer are still visible in the lifecycle log and the operator-facing
  report, as rev-2 requires.

## Error Cases Delta

| Condition | Expected behavior | Code |
|---|---|---|
| `decision` finding with `options` outside 2–4 entries, or an empty `label` | Entry kept with its `question`; `options` dropped; asked as free text | `OPTIONS_REJECTED` (advisory) |
| `decision` finding with no `question` | `adev decisions pending` derives one from the prose's first sentence | `QUESTION_DERIVED` (advisory) |
| `question` / `options` on a `defect` or `external` entry | Fields ignored; entry written normally | `DECISION_FIELDS_IGNORED` (advisory) |
| `adev decisions record` names a `blocker_id` not in the sidecar | Exit 1; nothing written | `UNKNOWN_DECISION_BLOCKER` |
| `adev decisions record` names a blocker that is not `decision`-classed | Exit 1; nothing written | `NOT_A_DECISION_BLOCKER` |
| `adev decisions record` with no `.blockers.md` sidecar | Exit 1; nothing written | `NO_REVIEW_SIDECARS` (existing code) |
| Sidecar header revision differs from the spec's `revision:` | Exit 1; nothing written — the answers would bind to a stale blocker set | `BLOCKERS_REVISION_MISMATCH` |
| `--answers` is not valid JSON, not an array, or an entry has an empty `choice` or empty `blocker_ids` | Exit 1; nothing written | `INVALID_DECISION_ANSWERS` |
| Spec path outside the project root | Exit 1 | `INVALID_SPEC_PATH` (existing code) |
| A `<!-- adev:decision … -->` marker in the section does not parse | That entry is treated as undecided by `pending`; `record` preserves the line verbatim | `DECISION_MARKER_MALFORMED` (advisory) |
| Operator leaves every question unanswered | Nothing recorded; review-specs BLOCK summary lists the open decisions; build halts `DECISION_REQUIRED` | — |
| Harness has no structured-question tool | All pending decisions asked in one numbered message | — |

## System Constitution Reference

- **Minimize external dependencies** — the new verbs use only `node:fs`, `node:path`, and the existing
  `lib/blockers-writer.mjs` / `lib/specify-revise.mjs` / `lib/section-anchors.mjs` helpers.
- **Skills are primarily markdown** — the ask round is skill prose; every runtime decision (which entries are
  pending, ordering, structured vs. free text, the section rewrite) lives in `adev decisions pending|record`, per
  the anti-pattern rule against control-flow logic in SKILL.md fenced blocks.
- **Pure ESM** — `lib/decisions.mjs` and `lib/cli/decisions.mjs` are `.mjs` modules.
- **Error handling** — the CLI exits 1 with a coded error for fatal input problems; advisories go to the JSON
  output and never fail the verb.

## Module Impact Map (Delta)

| Module | Change |
|---|---|
| `lib/decisions.mjs` (new) | Parse/write the `## Decisions of Record` section; compute pending decisions from sidecar + section |
| `lib/cli/decisions.mjs` (new) + `cli/index.mjs` | `adev decisions pending` and `adev decisions record` verbs |
| `lib/blockers-writer.mjs` | Persist and validate `question` / `options` on `decision` entries (BEH-2) |
| `lib/specify-revise.mjs` | `parseBlockersSidecar` reads `question` / `options`; decided `decision` blockers become authorable (BEH-6); `## Decisions of Record` is never an authoring target |
| `lib/cli/specify.mjs` | `group-blockers` attaches `decisions` to anchors and filters `decision_blocker_ids` (BEH-6) |
| `skills/review-specs/*-prompt.md` (8 prompts) | `question` / `options` / follow-on instruction (BEH-1); settled-decision rule (BEH-8) |
| `skills/review-specs/SKILL.md` Step 8, `references/steps/step-5-consolidate-findings.md`, `step-6-events-and-report.md` | Ask round (BEH-4); pass `question` / `options` through to `adev blockers write`; `.review.md` gains a `## Decisions Required` table |
| `skills/specify/references/revise-mode-authoring-dispatch.md` | Pass attached decisions to the section author as binding (BEH-6) |
| `skills/build/references/blocker-auto-retry-loop.md` | Interactive ask round and `--auto` halt message (BEH-7) |
| Provider mirrors under `providers/*/skills/**` | Regenerated from the edited skill files |
| `docs/cli-reference.md`, `docs/skill-reference.md` | Document the new verbs and the ask round |

## Integration Points (Delta)

- **rev-2 sidecar contract.** `.blockers.md` entries gain two optional keys; readers that ignore unknown keys
  (every current reader) are unaffected. Legacy sidecars without them behave as `structured: false` decisions.
- **`adev governance dispatch` (#434) / prior-round review.** Unchanged. The Decisions of Record section reaches
  reviewers through the spec body, and the prior-round report still carries the previous round's findings;
  BEH-8 is what tells a reviewer to treat a decided one as settled.
- **`adev review-notes show` (#435).** Unaffected: it reads PASS_WITH_NOTES warnings, which never carry
  `finding_class: decision`.
- **Harness question tools.** Claude Code's `AskUserQuestion` (≤ 4 questions per call, 2–4 options each, a
  ≤ 12-character header). Harnesses without an equivalent use the single-message fallback (BEH-4).

## Actionable Task Map (Delta)

| # | Task | Complexity |
|---|---|---|
| 1 | `lib/decisions.mjs`: section parse/write, `DEC-<n>` allocation, pending computation; unit tests | medium |
| 2 | `adev decisions pending|record` CLI verbs, error codes, `--json`; CLI tests | medium |
| 3 | `blockers-writer` `question` / `options` persistence and validation; sidecar parser reads them | small |
| 4 | `group-blockers` / revise: decided blockers authorable, decisions attached, section excluded from authoring | medium |
| 5 | Reviewer prompt edits (BEH-1, BEH-8) across 8 prompts; prompt-contract test | small |
| 6 | review-specs Step 5/6/8 edits (pass-through, `## Decisions Required`, ask round) | small |
| 7 | build loop edits (interactive ask round, `--auto` halt message); revise authoring-dispatch edit | small |
| 8 | Provider mirror regeneration; docs | small |

## Known Gaps

- **Dependent decisions.** A question that only exists because of an answer not yet given still needs another
  round (see Amendment Rationale).
- **Warnings are not asked.** A PASS_WITH_NOTES warning that is really a decision goes to the plan's Review Notes
  (#435), not to the ask round. Only BLOCK findings carry `finding_class`.
- **Semantic deduplication is the orchestrator's call.** Two reviewers phrasing the same choice differently in
  different sections are asked twice; BEH-4 lets the orchestrator merge obvious duplicates, but no verb detects
  them.
- **Multi-spec builds ask per spec.** A milestone `/adev:build` runs one ask round per blocked spec as each
  reaches its review step, not one round across all specs.

## Acceptance Criteria

- [ ] A `decision` finding carrying `question` and 2–4 `options` round-trips through `adev blockers write` and
      `parseBlockersSidecar` unchanged; out-of-bounds `options` yield `OPTIONS_REJECTED` and keep the entry (BEH-1, BEH-2).
- [ ] All 8 bundled reviewer prompts that define `finding_class` carry the `question` / `options` / follow-on
      instruction and the settled-decision rule, checked by a prompt-contract test (BEH-1, BEH-8).
- [ ] `adev decisions pending --json` lists exactly the undecided `decision` blockers in spec-section order, with
      `structured` set correctly and derived questions flagged `QUESTION_DERIVED`; an absent sidecar yields an
      empty list and exit 0 (BEH-3).
- [ ] `/adev:review-specs` Step 8 on a BLOCK with pending decisions asks them all in one round, in calls of at
      most 4, before the summary, and records the answers (BEH-4).
- [ ] `adev decisions record` creates or updates `## Decisions of Record` with stable, never-reused `DEC-<n>`
      ids, leaves every byte outside the section unchanged, and rejects unknown, non-decision, stale-revision, and
      malformed input with the coded errors above (BEH-5).
- [ ] `adev specify group-blockers` moves decided `decision` blockers into `anchors` with `decisions` attached
      and omits them from `decision_blocker_ids`; undecided ones still halt with `DECISION_REQUIRED` (BEH-6).
- [ ] Interactive `/adev:build` asks pending decisions and continues the cycle without a reviewer dispatch;
      `--auto` halts with every pending question and option listed (BEH-7).
- [ ] `npm test` passes, including the skill size cap and the no-inline-Node SKILL.md guard.
- [ ] No constitutional violations.
