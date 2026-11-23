---
partial_schema: implement@1
mode: cross-cutting
affects: [review, spec-lifecycle, strategic-planning, agent-reliable-state-artifacts]
kind: behavioral
status: implemented
risk_level: medium
revision: 4
charter-revision: 1
amends: .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
target-revision: 3
tracker-ref: adev-plugin-lifecycle-cycle-time-qa41.5
created: 2026-11-22
updated: 2026-11-23
source-manifest:
  sha: "5c10b1e"
  files:
    - .context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md
    - .context-index/specs/cross-cutting/skill-body-progressive-disclosure.spec.md
    - cli/index.mjs
    - docs/cli-reference.md
    - docs/skill-reference.md
    - lib/blockers-writer.mjs
    - lib/cli/blockers.mjs
    - lib/cli/decisions.mjs
    - lib/cli/specify.mjs
    - lib/decision-text.mjs
    - lib/decisions-of-record.mjs
    - lib/decisions.mjs
    - lib/governance/remedy-ref-render.mjs
    - lib/specify-revise.mjs
    - skills/build/SKILL.md
    - skills/build/references/blocker-auto-retry-loop.md
    - skills/build/references/pipeline/step-1-review.md
    - skills/build/references/resume-mode.md
    - skills/review-specs/SKILL.md
    - skills/review-specs/boundary-reviewer-prompt.md
    - skills/review-specs/consistency-analyzer-prompt.md
    - skills/review-specs/quick-synthesized-reviewer-prompt.md
    - skills/review-specs/references/steps/step-5-consolidate-findings.md
    - skills/review-specs/references/steps/step-6-events-and-report.md
    - skills/review-specs/references/steps/step-8-decision-ask-round.md
    - skills/review-specs/referent-integrity-prompt.md
    - skills/review-specs/security-reviewer-prompt.md
    - skills/review-specs/structural-architect-prompt.md
    - skills/review-specs/termination-reviewer-prompt.md
    - skills/review-specs/wiring-reviewer-prompt.md
    - skills/specify/references/revise-mode-authoring-dispatch.md
    - tests/cli/blockers-write.test.mjs
    - tests/cli/decisions.test.mjs
    - tests/cli/specify-group-blockers.test.mjs
    - tests/cli/specify-revise.test.mjs
    - tests/governance/context-pack-consistency-glob.test.mjs
    - tests/integration/decisions-end-to-end.test.mjs
    - tests/lib/blockers-writer.test.mjs
    - tests/lib/decision-text.test.mjs
    - tests/lib/decisions-of-record.test.mjs
    - tests/lib/decisions.test.mjs
    - tests/lib/governance/remedy-ref-render.test.mjs
    - tests/lib/specify-revise.test.mjs
    - tests/skills/build/blocker-loop-decisions.test.mjs
    - tests/skills/review-specs-decisions-ask-round.test.mjs
    - tests/skills/review-specs-finding-class-prompts.test.mjs
  computed-at: "2026-11-23T11:44:50.732Z"
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
one ask round collects every open decision across every reviewer; `adev decisions record` records each answer
on its decision's entry in the existing `.blockers.md` sidecar, and `/adev:specify --revise` then authors the
decided blockers into the spec and writes the spec's `## Decisions of Record` section, which later reviewers
read as settled. This stays within ADR-0012's closed sidecar set
(`.context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md`): no new sidecar is introduced, `.blockers.md`
is already a permitted peer, no side tool folds per-finding metadata into the spec, and the spec body is
written only by `adev specify revise`, its sanctioned writer — so ADR-0012 needs no amendment.

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
  array>` keys, written with the same untrusted-input posture rev-2 BEH-1 applies to `remedy_ref`. Each of
  `question`, `label`, and `implications` is processed in this fixed order, and the value that comes out is
  exactly the value stored: (1) the SEC-3 redaction set, `_redactForBlockers` in `lib/blockers-writer.mjs`;
  (2) truncation — a value longer than its bound (`question` 500, `label` 60, `implications` 300, counted in
  Unicode code points) is cut to the bound and the single-line marker `…[truncated]` (U+2026 followed by
  `[truncated]`, no newline) appended; `truncateProse`'s multi-line marker is never used for these fields;
  (3) the **unsafe decision text gate**, run on the truncated value. The gate is the one rule all five decision
  fields (`question`, `label`, `implications`, `choice`, `note`) share, and it **refuses, never strips**, a value
  that contains any character of Unicode general category C (`\p{C}`, which covers newline, carriage return,
  NEL, and bidi overrides) or U+2028 / U+2029; begins with `---` or `#`; contains a backtick fence (three
  consecutive backticks), `<!--`, `-->`, or `**`. Refusal drops the offending field — `question` itself, or the
  whole `options` array when any `label` or `implications` in it fails — with a `DECISION_TEXT_REJECTED`
  advisory; the entry and its prose are kept and the decision is asked as free text. `options` with fewer than 2
  or more than 4 entries, or any entry whose `label` is empty, is dropped with an `OPTIONS_REJECTED` advisory
  while the entry and its `question` are kept. Because the gate ran on the stored value, a value BEH-2 accepts
  always passes BEH-9's re-check. Every reader (`pending`, `group-blockers`, revise) reads stored values back
  with `JSON.parse` and gates the parsed string, so a JSON escape cannot smuggle a refused character past the
  gate. `question` or `options` on an entry that is not `decision`-classed is ignored with a
  `DECISION_FIELDS_IGNORED` advisory, and so is a reviewer-supplied `decision_choice`, `decision_note`, or
  `decision_recorded` on any entry: `adev decisions record` (BEH-5) is the sole writer of answer keys. Every
  advisory appears in the verb's `--json` `advisories` array, its consumer. The `--json` output also gains a
  `decisionsRequired` array (same pattern as `externalRemedies`): one
  `{ blocker_id, section_anchor, question, options }` per `decision`-classed entry written, with `question`
  falling back to the BEH-3 derived question when none was stored; `/adev:review-specs` renders it (BEH-4).
  Every render path that displays these values to a terminal, prompt, or report applies the control-character
  and ANSI-escape stripping of `renderRemedyRef` (`lib/governance/remedy-ref-render.mjs`).

- **BEH-3** — **When** `adev decisions pending --spec <path> [--json]` runs **then** it resolves the spec path and
  the derived `.blockers.md` path with realpath containment inside the project root (`INVALID_SPEC_PATH`
  otherwise, with no file content echoed in the message), reads open and answered decisions from the sidecar and
  decided ones from the spec's `## Decisions of Record` section, and never writes either. It lists only **open**
  decisions — `decision`-classed sidecar entries with no `decision_choice` — under `pending`, ordered by the
  position of the entry's `section_anchor` heading in the spec (unresolvable anchors last), then by
  `blocker_id`. Each carries `blocker_id`, `section_anchor`, `question`, `options` (possibly empty), `header`
  (≤ 12 characters, derived from the section heading and passed through `renderRemedyRef` stripping), and
  `structured` (true exactly when `options` has 2–4 entries). When the sidecar has no `question`, one is derived
  with a `QUESTION_DERIVED` advisory: the first sentence of the blocker prose, put through BEH-2's
  redact → truncate (500) → gate order; when that value fails the gate it is refused, never stripped, and
  replaced by the neutral question `Which option resolves blocker <blocker_id>?`, composed from the `blocker_id`
  alone after `parseBlockerId` (`lib/blocker-id.mjs`) validates it — no heading or prose text enters it, so a
  derived question always passes BEH-9's re-check. Within one section, when two or more pending entries have an
  identical normalized question (lowercased, whitespace runs collapsed to one space, trimmed), every entry after
  the first in `pending` order is marked `duplicate_of: <blocker_id of the first>`; the verb owns this grouping
  and the skill makes no dedup judgment of its own. A group is one entry with no `duplicate_of` together with its
  duplicates; groups are counted in `pending` order, and every entry carries `ask`, true for the first 16 groups
  (`ASK_ROUND_GROUP_LIMIT`) and false for every later one, so one ask round never asks more than 16 questions.
  The output's `ask_round: { limit, asked, overflow }` reports the cap, the groups inside it, and the groups
  beyond it. Entries carrying `decision_choice` are listed under
  `answered` with `decision_choice`, `decision_note`, and `decision_recorded`; they have no `DEC-<n>` yet,
  because only `adev specify revise` allocates one (BEH-9). Entries parsed from the spec's
  `## Decisions of Record` section are listed under `decided`, each with its `DEC-<n>` and its `blocker_id`s; a
  marker whose `blockers=` ids do not all pass `parseBlockerId`, or that otherwise does not parse, is omitted
  from `decided` with a `DECISION_MARKER_MALFORMED` advisory. A spec with no sidecar, or no `decision` blockers,
  prints an empty `pending` list and exits 0 (`decided` is still read from the spec).

- **BEH-4** — **When** `/adev:review-specs` reaches Step 8 with verdict BLOCK and the sidecar holds `decision`
  blockers **then** it writes a `## Decisions Required` table into `.review.md`, columns
  `blocker_id | section | question | options` (the option labels, in order), filled from the
  `decisionsRequired` array (BEH-2) with every value passed through `renderRemedyRef` stripping and `|` escaped
  as `\|` at render time; its consumer is the operator reading the report. What happens next depends on
  attendance, which one argument governs, `--defer-decisions`, which the skill declares in its Arguments
  table. **With `--defer-decisions`** — which `/adev:build` passes on every review dispatch, interactive and
  `--auto` alike, because build's review step runs inside a subagent that has no operator, and which every
  other non-interactive (headless, scheduled, or scripted) invocation should pass — Step 8 never asks: it lists
  every pending decision (question and options) in the BLOCK summary and returns, leaving the ask round or the
  `DECISION_REQUIRED` halt to the caller (BEH-7). **Without the flag**, Step 8 runs exactly **one bounded ask
  round** against `adev decisions pending`, asking each `ask: true` group once through its first entry:
  structured groups through the harness's structured-question tool (`AskUserQuestion` on Claude Code, listed in
  the skill's `allowed-tools`), at most 4 questions per call (the tool's per-call limit), so at most
  ceil(n/4) calls for the n structured groups marked `ask: true` (n ≤ 16, so at most 4 calls), issued back-to-back with no reviewer dispatch, spec edit, or other
  prompt between them, each option shown with its `implications` as the description; then at most one message
  carrying every unstructured group as numbered questions — or, where the harness has no structured-question
  tool, every group. The skill never re-asks or loops. A question whose call returns no answer or an error, or
  that gets no reply — including a headless or scripted session that reached the ask round without the flag,
  a numbered message whose turn ends unanswered, and every `ask: false` overflow group — stays **open**: no answer is recorded for it, and no
  timeout or default answer exists, because nothing waits; the round is bounded by its call count whatever the
  caller. The skill records every answer it did receive with one `adev decisions record`, each group's answer
  against every `blocker_id` in that group. The verdict stays BLOCK whatever was answered. The BLOCK summary
  reports how many decisions were recorded, lists every decision still open with its question and options, and
  names `adev decisions record` (for the open ones) followed by `/adev:specify --revise <spec>` as the next
  steps.

- **BEH-5** — **When** `adev decisions record --spec <path> --answers <json-or-@path>` runs with an array of
  `{ blocker_ids: [<id>, …], choice: <string>, note?: <string> }` **then** it writes each answer **only** onto
  its decisions' entries in the spec's existing `.blockers.md` sidecar, through `lib/blockers-writer.mjs`, as
  `decision_choice: <JSON-quoted string>`, `decision_note: <JSON-quoted string>` (only when a note is given), and
  `decision_recorded: <ISO-8601 UTC timestamp>`; it is the sole writer of these three keys (BEH-2 drops them from
  reviewer input). The spec path and derived sidecar path are resolved with realpath containment inside the
  project root (`INVALID_SPEC_PATH`); an `--answers @path` file is resolved the same way, and the `--answers`
  input, inline or from a file, is capped at 64 KiB — a file outside the root or input over the cap exits 1
  with `INVALID_DECISION_ANSWERS`. No error message echoes file content. A missing `.blockers.md` exits 1 with
  `NO_REVIEW_SIDECARS` even when the spec's other sidecars exist. It never writes the spec body: the
  `## Decisions of Record` section is written only by `adev specify revise` (BEH-9), and the spec's `revision:`
  and `status:` are not touched — `/adev:specify --revise` bumps them when it authors the decisions in.
  Re-recording a `blocker_id` that is already answered replaces `decision_choice`, `decision_note`, and
  `decision_recorded` in place; a re-record without a note removes `decision_note`. `choice` and `note` are
  operator text, read from the parsed answers JSON, and are refused, never truncated, when either is over 1,000
  characters or fails the BEH-2 gate: the command exits 1 with `UNSAFE_DECISION_TEXT` and nothing written.
  Accepted values then have `_redactForBlockers` applied before storage; its `[REDACTED]` replacement cannot
  introduce a refused character, so a stored answer always passes BEH-9's re-check. Every byte of the sidecar
  outside the named entries' answer keys is unchanged; the write is atomic (temp-then-rename) and
  all-or-nothing across the answers array. Any agent able to run this verb can record an answer — accepted
  under BEH-8's trust posture and listed in Known Gaps.

- **BEH-6** — **When** `adev specify group-blockers` reads a `decision`-classed blocker whose sidecar entry carries
  `decision_choice` **then** that answered blocker is grouped into `anchors` under its `section_anchor` like a
  `defect` blocker, with its answer attached as `decisions: [{ blocker_id, choice, note }]` on the anchor
  (`choice` from `decision_choice`, `note` from `decision_note`, both read back with `JSON.parse`; no `DEC-<n>`
  yet, since BEH-9 allocates it), and is excluded from `decision_blocker_ids`. Before grouping, the parsed
  `decision_choice` and `decision_note` go through the BEH-2 gate, because they enter the author's prompt
  verbatim and the sidecar can be edited by hand: an answer that fails it counts as no answer, so the blocker is
  not grouped, stays in `decision_blocker_ids`, and is reported in the output's `advisories` array as
  `DECISION_TEXT_REJECTED` with `blocker_id`, `field`, and `reason` (never the refused value). Re-recording the
  answer (BEH-5) replaces it. The per-anchor authoring dispatch
  (`revise-mode-authoring-dispatch.md`) passes each attached decision to the section's author as a binding
  instruction — the section must be rewritten to implement the recorded choice, not to reopen it. A
  `decision`-classed blocker with no `decision_choice` stays in `decision_blocker_ids` and halts the loop exactly
  as rev-2 BEH-2 specifies. `addressed_blocker_ids` is computed unchanged (rev-2 BEH-5): an answered blocker whose
  anchored section comes back unchanged is not addressed. When no section changed at all and revise runs under
  `--auto` (the build loop) or `--same-revision`, it exits `NOTHING_TO_REVISE` and writes nothing — no `DEC-<n>`
  entry either, so the answers stay in the sidecar — and the `/adev:build` loop stops with `LOOP_NO_PROGRESS`.
  An interactive revise with no changed section bumps the revision as rev-2 specifies, writes the `DEC-<n>`
  entries for the answered blockers, and then clears the sidecar: an operator ran it deliberately, and the
  recorded answers are carried into the spec rather than discarded with the sidecar.

- **BEH-7** — **When** the `/adev:build` review auto-retry loop gets a non-empty `decision_blocker_ids` from
  `adev specify group-blockers` in interactive mode (no `--auto`) **then**, instead of halting, the top-level
  orchestrator — never the review subagent, whose dispatch always carries `--defer-decisions` (BEH-4) — runs,
  in this order, `adev decisions pending`, the BEH-4 ask round against it, `adev decisions record` for the
  answers received, and `adev specify group-blockers` again; when no open `decision` blocker remains it continues
  the same cycle into per-anchor authoring. At most one ask round runs per review cycle. Each ask round follows
  a BLOCK whose review already consumed a review retry; the ask round itself dispatches no reviewer and consumes
  no further retry. If any decision is left open after the round, the loop halts with `DECISION_REQUIRED` as
  rev-2 BEH-2 specifies. When a BLOCK with open decisions arrives after `max_review_retries` is exhausted, no ask
  round runs: the loop exits `LOOP_BUDGET_EXHAUSTED` and its report lists every open decision with its question
  and options. Under `--auto`, the loop halts with `DECISION_REQUIRED` without asking, and the halt message lists
  every pending decision with its question and options (from `adev decisions pending`), so they can all be
  answered in one sitting, and names `adev decisions record` followed by `/adev:build --resume` as the recovery
  path.

- **BEH-8** — **When** a reviewer is dispatched for a spec whose body has a `## Decisions of Record` section
  **then** the reviewer prompt instructs it that a decided entry is settled: it must not re-raise the same
  choice as a `decision` finding; it raises a `defect` when the spec text contradicts a decided entry; and it
  may raise a new `decision` finding only for a different choice, including a follow-on choice that a decided
  entry opened. The section lives in the spec body, so it reaches the reviewer through the spec text it already
  receives; no new context-pack entry is introduced. An answered decision lives only in the sidecar and is not
  visible to sibling-spec reviewers until `adev specify revise` writes it into the section as a decided entry.
  An entry in the section is honored without a lifecycle-event cross-check (accepted risk): anyone able to edit
  the spec is the operator, spec changes go through PR review, and the lifecycle event log is no less writable
  than the spec, so a cross-check would add coupling without adding assurance. The agent path is guarded
  structurally instead — BEH-2 refuses marker text in reviewer-supplied fields and drops reviewer-supplied answer
  keys, and BEH-9 keeps the section out of every authoring target.

- **BEH-9** — **When** `adev specify revise` runs against a sidecar holding answered `decision` entries **then** it
  is the only writer of the spec's `## Decisions of Record` section, and it writes one decided entry per answer
  into the same atomic spec write (temp-then-rename) that carries the authored sections — before the sidecar is
  cleared as it is today, so the answer is in the spec before the sidecar is gone. Locating the section, and
  `## Acceptance Criteria`, ignores headings inside fenced code blocks; when the section is absent it is created
  immediately before `## Acceptance Criteria`, or at end of file when that heading is also absent. Each entry is
  a machine marker line `<!-- adev:decision DEC-<n> blockers=<id>,<id> -->` followed by
  `- **DEC-<n>** — <question> → **<choice>**. <implications of the chosen option, when it matches an option
  label>. <note, when given>`, where `<question>` is the sidecar `question` (or the BEH-3 derived question),
  `<choice>` is `decision_choice`, and `<note>` is `decision_note`, all read back with `JSON.parse`. Answered
  entries that the BEH-3 `duplicate_of` rule groups together (same section, identical normalized question) and
  that carry the same `decision_choice` and `decision_note` produce one entry naming every `blocker_id` in the
  group; every other answered entry gets its own. A new entry's `DEC-<n>` is the highest `DEC-<n>` present in
  the section, malformed lines included, plus 1. Re-deciding a blocker already named in the section replaces
  that entry in place and keeps its `DEC-<n>`. The tooling never deletes an entry (revise only appends or
  replaces in place), so under the tooling no id is reused; an entry deleted by hand may have its id reused. A
  marker line whose `blockers=` ids do not all pass `parseBlockerId`, or that otherwise does not parse, is
  preserved verbatim with a `DECISION_MARKER_MALFORMED` advisory. Before composing each entry, revise re-checks
  `question`, the chosen option's `implications`, `choice`, and `note` against the BEH-2 gate — values that
  passed the sidecar gate are not assumed safe, though by BEH-2, BEH-3, and BEH-5 an untampered value always
  passes. The re-check is all-or-nothing, like BEH-5's gate: one unsafe value in any decision refuses the whole
  revise, which exits 1 with `UNSAFE_DECISION_TEXT`, writes no `DEC-<n>` entry for any decision, and leaves the
  spec (authored sections included) and the sidecar unchanged, so no answer is lost. After composing the write,
  revise verifies that every byte outside the `## Decisions of Record` section and the authored anchors is
  identical to the current spec; any difference aborts with `SPLICE_VALIDATION_FAILED`, writing nothing to the
  spec or the sidecar. The section is never an authoring target: revise refuses, per anchor, any authored section
  body containing `<!-- adev:decision` (`SPLICE_VALIDATION_FAILED`, the same per-anchor refusal as rev-2
  BEH-5a), and that anchor's blocker stays unresolved. This needs no amendment of ADR-0012
  (`.context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md`): answers are stored in `.blockers.md`, an
  existing permitted peer, and the spec body is mutated only by revise, the spec's sanctioned writer, so no side
  tool folds per-finding metadata into the spec. ADR-0012's peer table gains `adev decisions record` as a second
  producer of `.blockers.md` — a documentation update to the table, not a rule change.
### Behaviors Amended
- **rev-2 BEH-1** — the `decision` value of `finding_class` gains the optional `question` and `options` fields of
  BEH-1 above, persisted per BEH-2. The `defect` and `external` values are unchanged.
- **rev-2 BEH-2** — the `DECISION_REQUIRED` halt now applies only to `decision` blockers whose `.blockers.md`
  sidecar entry carries **no recorded answer** (no `decision_choice` key, written by `adev decisions record` per
  BEH-5; see BEH-6), and in interactive mode it is preceded by the ask round, run by the top-level orchestrator
  (BEH-7). Under `--auto`, the halt is unchanged except for the fuller halt message.
### Behaviors Retired

None.

## Preconditions Delta

- The spec under review or revision has a `.blockers.md` sidecar written by `adev blockers write`, whose header
  revision matches the spec's `revision:` frontmatter, before `adev decisions record` will write to it.
- `adev decisions pending` has no precondition beyond a readable spec path inside the project root.

## Postconditions Delta
- After an ask round, each answered decision's `.blockers.md` entry carries its answer — `decision_choice`,
  `decision_recorded`, and `decision_note` when one was given — written by `adev decisions record`, and the spec
  is byte-identical.
- After `/adev:specify --revise`, the spec carries exactly one `DEC-<n>` entry per decided blocker in its
  `## Decisions of Record` section, written by the revise verb (BEH-9) before it clears the sidecar; each decided
  blocker's section implements the recorded choice; entries already in the section that were not re-decided are
  preserved byte-identical, and no `DEC-<n>` is reused. The section is never an authoring target: no authored
  section body carrying `<!-- adev:decision` is spliced (refused per anchor, `SPLICE_VALIDATION_FAILED`).
- A `decision` blocker never reaches an author without a recorded decision — rev-2's "never guess" guarantee is
  preserved.
- `decision` findings with no recorded answer are still visible in the lifecycle log and the operator-facing
  report, as rev-2 requires.
## Error Cases Delta
| Condition | Expected behavior | Code |
|---|---|---|
| `decision` finding with `options` outside 2–4 entries, or an empty `label` | Entry kept with its `question`; `options` dropped; asked as free text | `OPTIONS_REJECTED` (advisory) |
| `decision` finding with no `question` | `adev decisions pending` derives one from the prose's first sentence and passes it through the same unsafe-text rule; when it fails, the neutral question `Which option resolves blocker <blocker_id>?`, composed from the validated `blocker_id` alone, is used instead, so a derived question can never make revise fail | `QUESTION_DERIVED` (advisory) |
| `question` / `options` on a `defect` or `external` entry | Fields ignored; entry written normally | `DECISION_FIELDS_IGNORED` (advisory) |
| Reviewer-supplied `decision_choice`, `decision_note`, or `decision_recorded` on any entry at `adev blockers write` | Keys dropped; entry written normally — `adev decisions record` is the sole writer of the answer keys | `DECISION_FIELDS_IGNORED` (advisory) |
| Reviewer-supplied `question`, `label`, or `implications` at `adev blockers write`, after truncation to its bound with the single-line `…[truncated]` marker, contains a newline, carriage return, or other control character (Unicode category C, including NEL and bidi overrides, or U+2028 / U+2029), a line beginning with `---` or `#`, a backtick fence, `<!--` / `-->`, or `**` | Refused, never stripped: the offending field is dropped; the entry and its prose are kept; asked as free text | `DECISION_TEXT_REJECTED` (advisory) |
| Operator-supplied `choice` or `note` to `adev decisions record` matches the same unsafe-text rule, or is longer than 1,000 characters | Refused, never truncated: exit 1; nothing written | `UNSAFE_DECISION_TEXT` |
| `adev specify revise` re-checks `question`, `implications`, `choice`, or `note` before composing a `DEC-<n>` entry and the value matches the unsafe-text rule | Refused all-or-nothing (defense in depth — a value that passed the sidecar gate is not assumed safe): exit 1; the whole revise is refused, the spec and the sidecar are left unchanged, and no `DEC-<n>` entry is written for any decision, not only the offending one | `UNSAFE_DECISION_TEXT` |
| An authored section body returned to `adev specify revise` contains `<!-- adev:decision` | Refused per anchor, as rev-2 BEH-5a: the body is discarded, the anchor's prior text kept, and the blocker stays unresolved | `SPLICE_VALIDATION_FAILED` (advisory, existing code) |
| After composing the `## Decisions of Record` write, `adev specify revise` finds a byte outside that section and the authored anchors changed | Whole revise aborted: exit 1; nothing written; spec and sidecar unchanged | `SPLICE_VALIDATION_FAILED` (existing code) |
| No authored section changed, including an answered blocker whose anchored section came back unchanged | That blocker is not addressed; revise writes nothing; the build loop stops with `LOOP_NO_PROGRESS` | `NOTHING_TO_REVISE` (existing code) |
| `adev decisions record` names a `blocker_id` not in the sidecar | Exit 1; nothing written | `UNKNOWN_DECISION_BLOCKER` |
| `adev decisions record` names a blocker that is not `decision`-classed | Exit 1; nothing written | `NOT_A_DECISION_BLOCKER` |
| `adev decisions record` finds no `.blockers.md` sidecar, even when the other review sidecars exist | Exit 1; nothing written | `NO_REVIEW_SIDECARS` (existing code) |
| Sidecar header revision differs from the spec's `revision:` | Exit 1; nothing written — the answers would bind to a stale blocker set | `BLOCKERS_REVISION_MISMATCH` |
| `--answers` is not valid JSON, not an array, or an entry has an empty `choice` or empty `blocker_ids` | Exit 1; nothing written | `INVALID_DECISION_ANSWERS` |
| `--answers @path` resolves (realpath, symlinks followed) outside the project root, or the `--answers` input exceeds 64 KiB | Exit 1; nothing written; the message names the path or the limit and never echoes file content | `INVALID_DECISION_ANSWERS` |
| Spec path, or the derived `.blockers.md` path, resolves (realpath, symlinks followed) outside the project root | Exit 1; nothing written; the message names the path and never echoes file content | `INVALID_SPEC_PATH` (existing code) |
| A `<!-- adev:decision … -->` marker in the spec's `## Decisions of Record` section does not parse, or its `blockers=` list holds an id that `parseBlockerId` (`lib/blocker-id.mjs`) rejects | `pending` does not list that entry under `decided` (a sidecar entry for the same blocker is still reported from the sidecar); `adev specify revise` preserves the line verbatim when it rewrites the section | `DECISION_MARKER_MALFORMED` (advisory) |
| In the ask round, the operator leaves a question unanswered, the structured-question call errors or returns nothing, or the numbered-message fallback gets no reply (a headless or scripted session included) | That decision stays open and nothing is recorded for it — no re-ask, wait, timeout, or default answer; the review-specs verdict stays BLOCK and the summary lists every open decision with question and options and names `adev decisions record` then `/adev:specify --revise`; build halts `DECISION_REQUIRED` | — |
| `/adev:build` exhausts `max_review_retries` with decisions still open | Loop exits; the report lists every open decision | `LOOP_BUDGET_EXHAUSTED` (existing code) |
| Harness has no structured-question tool | All pending decisions asked in one numbered message; no reply is handled as an unanswered question above | — |
## System Constitution Reference

- **Minimize external dependencies** — the new verbs use only `node:fs`, `node:path`, and the existing
  `lib/blockers-writer.mjs` / `lib/specify-revise.mjs` / `lib/section-anchors.mjs` helpers.
- **Skills are primarily markdown** — the ask round is skill prose; every runtime decision (which entries are
  pending, ordering, structured vs. free text, which entries are exact duplicates — `adev decisions pending`
  marks them `duplicate_of`, and the skill only asks each group once and records its answer against every id in
  it — and the section rewrite) lives in `adev decisions pending|record` and `adev specify revise`, per the
  anti-pattern rule against control-flow logic in SKILL.md fenced blocks.
- **Pure ESM** — `lib/decisions.mjs` and `lib/cli/decisions.mjs` are `.mjs` modules.
- **Error handling** — the CLI exits 1 with a coded error for fatal input problems; advisories go to the JSON
  output and never fail the verb.

## Module Impact Map (Delta)
| Module | Change |
|---|---|
| `lib/decisions.mjs` (new) | Read and write the answer keys (`decision_choice`, `decision_note`, `decision_recorded`) on `.blockers.md` `decision` entries through `lib/blockers-writer.mjs`, re-record replacing all three and removing `decision_note` when no note is given; the unsafe decision text check shared by the three gates (Unicode category C plus U+2028 / U+2029, `**`, and the rest of the rule); realpath containment of the spec, sidecar, and `--answers @path` inside the project root and the 64 KiB `--answers` cap; parse the spec's `## Decisions of Record` section read-only, validating each marker's `blockers=` ids with `parseBlockerId` (`lib/blocker-id.mjs`); compute pending decisions (open under `pending`, answered under `answered`, both from the sidecar; `decided` from the section), the neutral fallback question `Which option resolves blocker <blocker_id>?`, and `duplicate_of` grouping of identical normalized questions within a section (BEH-3, BEH-5) |
| `lib/cli/decisions.mjs` (new) + `cli/index.mjs` | `adev decisions pending` and `adev decisions record` verbs with `--json` `advisories`; `record` writes the sidecar only, never the spec body (BEH-5) |
| `lib/blockers-writer.mjs` | Persist and validate `question` / `options` on `decision` entries: truncate `question` (500), `label` (60), and `implications` (300) with the single-line marker `…[truncated]` — not `truncateProse`'s multi-line marker — then run the unsafe-text gate on the truncated value, refusing with `DECISION_TEXT_REJECTED`, and apply `_redactForBlockers` (BEH-2); drop reviewer-supplied answer keys with `DECISION_FIELDS_IGNORED`; return a `decisionsRequired` array beside `externalRemedies`; persist the answer keys written by `adev decisions record` (BEH-5) |
| `lib/cli/blockers.mjs` | Emit `decisionsRequired` in `adev blockers write --json` output, as it does `externalRemedies` (BEH-2) |
| `lib/specify-revise.mjs` | `parseBlockersSidecar` reads `question` / `options` and the answer keys; answered `decision` blockers become authorable (BEH-6); sole writer of the `## Decisions of Record` section — fence-aware placement (a `## Acceptance Criteria` line inside a fenced code block is ignored), `DEC-<n>` allocated as the highest present + 1, marker format with `parseBlockerId`-validated ids, `UNSAFE_DECISION_TEXT` re-check, a byte-identity check outside the section and the authored anchors that aborts with `SPLICE_VALIDATION_FAILED`, entries written before the sidecar is cleared (BEH-9); the section is never an authoring target, and an authored body containing `<!-- adev:decision` is refused per anchor with `SPLICE_VALIDATION_FAILED` |
| `lib/cli/specify.mjs` | `group-blockers` attaches `decisions` to anchors and filters `decision_blocker_ids` (BEH-6) |
| `skills/review-specs/*-prompt.md` (8 prompts) | `question` / `options` / follow-on instruction (BEH-1); settled-decision rule (BEH-8) |
| `skills/review-specs/SKILL.md` Step 8, `references/steps/step-5-consolidate-findings.md`, `step-6-events-and-report.md` | `allowed-tools` gains the harness structured-question tool (`AskUserQuestion` on Claude Code); `--defer-decisions` declared in the Arguments table; bounded ask round when the flag is absent, pending decisions listed in the BLOCK summary when present (BEH-4); pass `question` / `options` through to `adev blockers write`; `.review.md` gains a `## Decisions Required` table (`blocker_id \| section \| question \| options`) filled from `decisionsRequired`, values passed through `renderRemedyRef`-style stripping (`lib/governance/remedy-ref-render.mjs`) with every pipe character escaped |
| `skills/specify/references/revise-mode-authoring-dispatch.md` | Pass attached decisions to the section author as binding (BEH-6) |
| `skills/build/references/blocker-auto-retry-loop.md` | Interactive ask round run by the top-level orchestrator (`pending`, `record`, then `group-blockers`), `LOOP_BUDGET_EXHAUSTED` reporting open decisions, and `--auto` halt message (BEH-7); pass `--defer-decisions` on its review dispatches |
| `skills/build/references/pipeline/step-1-review.md` | Pass `--defer-decisions` on every `/adev:review-specs` dispatch, interactive and `--auto` (BEH-4) |
| `.context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md` | Peer table names `adev decisions record` as a second producer of `.blockers.md` — a documentation update, not a rule change |
| Tests | New `tests/lib/decisions.test.mjs`, `tests/cli/decisions.test.mjs`, and an end-to-end `record` → `pending` → `group-blockers` → revise → `DEC-<n>` integration test under `tests/integration/`; extend `tests/lib/blockers-writer.test.mjs`, `tests/cli/blockers-write.test.mjs`, `tests/lib/specify-revise.test.mjs`, `tests/cli/specify-revise.test.mjs`, `tests/cli/specify-group-blockers.test.mjs`, and `tests/skills/review-specs-finding-class-prompts.test.mjs`; a build contract test under `tests/skills/build/` (per the Acceptance Criteria) |
| Provider mirrors under `providers/*/skills/**` | Regenerated from the edited skill files |
| `docs/cli-reference.md`, `docs/skill-reference.md` | Document the new verbs, the `--defer-decisions` flag, and the ask round |
## Integration Points (Delta)
- **rev-2 sidecar contract.** `.blockers.md` `decision` entries gain optional keys: the reviewer-supplied
  `question` and `options` (BEH-2) and the answer keys `decision_choice`, `decision_note`, and
  `decision_recorded` written by `adev decisions record` (BEH-5). Every value is stored JSON-quoted (`options` as a
  single-line JSON array) and read back with `JSON.parse`, so reviewer or operator text stays inert inside the
  YAML fence. Readers that ignore unknown keys (every current reader) are unaffected. Legacy sidecars without
  them behave as `structured: false` decisions with no recorded answer.
- **ADR-0012 (`.context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md`).** Complied with as-is; no rule
  change. No new sidecar is introduced — `.blockers.md` is already a permitted peer and only gains the answer
  keys above. `adev decisions record` becomes a second producer of `.blockers.md`, beside the review BLOCK path,
  and the ADR's peer table is updated to name it; that is a documentation update to the table, not a change to
  the closed sidecar set or its rules. No side tool folds per-finding metadata into the spec:
  `adev decisions record` writes the sidecar only, and the spec body is mutated only by `adev specify revise`,
  its sanctioned writer, which writes the `## Decisions of Record` section (BEH-9). Revise clears the sidecar only
  after the decision entries have been written into the spec, so an answer is never held by neither store.
- **Shared helpers.** Redaction of `question`, `label`, `implications`, `choice`, and `note` reuses
  `_redactForBlockers` in `lib/blockers-writer.mjs` (BEH-2, BEH-5). Render-time stripping of control characters
  and ANSI escapes reuses `renderRemedyRef` in `lib/governance/remedy-ref-render.mjs`; when a value is rendered
  into a markdown table (the `.review.md` `## Decisions Required` table), `|` is additionally escaped as `\|`.
- **`adev governance dispatch` (#434) / prior-round review.** Unchanged. The Decisions of Record section reaches
  reviewers through the spec body once `adev specify revise` has written it, and the prior-round report still
  carries the previous round's findings; BEH-8 is what tells a reviewer to treat a decided one as settled.
- **`adev review-notes show` (#435).** Unaffected: it reads PASS_WITH_NOTES warnings, which never carry
  `finding_class: decision`.
- **Harness question tools.** Claude Code's `AskUserQuestion` (≤ 4 questions per call, 2–4 options each, a
  ≤ 12-character header). Harnesses without an equivalent use the single-message fallback (BEH-4).
## Actionable Task Map (Delta)
| # | Task | Complexity |
|---|---|---|
| 1 | `lib/decisions.mjs`: sidecar answer-key read/write (`decision_choice` / `decision_note` / `decision_recorded`, re-record replacing all three and removing `decision_note` when no note is given), read-only `## Decisions of Record` parse with `parseBlockerId` marker-id validation (`DECISION_MARKER_MALFORMED`), pending computation (open under `pending`, `answered`, `decided`), the neutral fallback question, `duplicate_of` grouping of identical normalized questions within a section, shared unsafe decision text check (Unicode category C, U+2028 / U+2029, `**`); unit tests | medium |
| 2 | `adev decisions pending\|record` CLI verbs (`record` writes the sidecar only, never the spec), realpath containment of the spec, sidecar, and `--answers @path` (`INVALID_SPEC_PATH`, `INVALID_DECISION_ANSWERS`), the 64 KiB `--answers` cap, no file content echoed in errors, error codes including `UNSAFE_DECISION_TEXT` (over-1,000-character `choice` / `note` included) and `NO_REVIEW_SIDECARS`, `--json` with `advisories`; CLI tests | medium |
| 3 | `blockers-writer` `question` / `options` persistence and validation: single-line `…[truncated]` marker for `question` / `label` / `implications` with the gate run on the truncated value, `DECISION_TEXT_REJECTED`, `_redactForBlockers`; reviewer-supplied answer keys dropped with `DECISION_FIELDS_IGNORED`; `decisionsRequired` array in `adev blockers write --json` output; answer-key persistence; sidecar parser reads them; tests including advisories in the `--json` `advisories` array | small |
| 4 | `group-blockers` / revise: answered blockers authorable, decisions attached, section excluded from authoring, authored bodies containing `<!-- adev:decision` refused per anchor (`SPLICE_VALIDATION_FAILED`), an unchanged answered section not addressed (`NOTHING_TO_REVISE` when nothing changed); tests including the authoring dispatch receiving attached decisions | medium |
| 5 | revise writes `## Decisions of Record` (BEH-9): fence-aware placement, `DEC-<n>` allocated as highest present + 1 and in-place replacement, marker format, `UNSAFE_DECISION_TEXT` re-check, byte-identity check aborting with `SPLICE_VALIDATION_FAILED`, entries written before the sidecar is cleared; tests including a fenced `## Acceptance Criteria` line, an over-length truncated `question`, and an unchanged section staying byte-identical | medium |
| 6 | Reviewer prompt edits (BEH-1, BEH-8) across 8 prompts; prompt-contract test | small |
| 7 | review-specs Step 5/6/8 edits (pass-through, `## Decisions Required` table from `decisionsRequired` with `renderRemedyRef`-style stripping and pipe escaping, bounded ask round, `--defer-decisions` in the Arguments table, `AskUserQuestion` in `allowed-tools`); table test | small |
| 8 | build loop edits (interactive ask round, `LOOP_BUDGET_EXHAUSTED` with open decisions reported, `--auto` halt message, `--defer-decisions` on review dispatches in the loop and `pipeline/step-1-review.md`); revise authoring-dispatch edit; contract test for `--defer-decisions` on every dispatch, the `pending` / `record` / `group-blockers` order, and the `--auto` halt message | small |
| 9 | End-to-end integration test: `record` → `pending` → `group-blockers` → revise → `DEC-<n>` entry | small |
| 10 | ADR-0012 peer table note (`adev decisions record` as a second `.blockers.md` producer); provider mirror regeneration; docs | small |
## Known Gaps
- **Dependent decisions.** A question that only exists because of an answer not yet given still needs another
  round (see Amendment Rationale).
- **Warnings are not asked.** A PASS_WITH_NOTES warning that is really a decision goes to the plan's Review Notes
  (#435), not to the ask round. Only BLOCK findings carry `finding_class`.
- **Differently-phrased duplicates are asked twice.** `adev decisions pending` groups exact duplicates — pending
  entries in the same section whose normalized questions (lowercased, whitespace-collapsed) are identical are
  marked `duplicate_of` and asked once (BEH-3). Two reviewers phrasing the same choice differently, or raising it
  in different sections, are still asked separately; no verb detects semantic duplicates, and the skill makes no
  dedup judgment of its own.
- **Multi-spec builds ask per spec.** A milestone `/adev:build` runs one ask round per blocked spec as each
  reaches its review step, not one round across all specs.
- **Answered-but-not-yet-revised decisions are sidecar-only.** Between `adev decisions record` and the next
  `/adev:specify --revise`, an answer lives only on its `.blockers.md` entry. It reaches the spec's
  `## Decisions of Record` section — and so sibling-spec reviewers — only when revise runs; until then those
  reviewers cannot see it and may raise the same choice again.
- **Decisions of Record provenance is trusted, not verified (accepted risk).** A `## Decisions of Record` entry in
  the spec body is honored by `pending`, reviewers (BEH-8), and authors (BEH-6) without a lifecycle-event
  cross-check, so a hand-edited or PR-supplied entry is treated as settled. The agent path is guarded
  structurally instead: the section is never an authoring target, `adev specify revise` refuses any authored body
  containing `<!-- adev:decision`, and reviewer-supplied decision text carrying marker syntax is refused at
  persistence. The risk is accepted because anyone able to edit the spec is the operator, spec changes go through
  PR review, and the lifecycle event log is no less writable than the spec, so an event cross-check would add
  coupling without adding assurance.
- **Any agent that can run `adev decisions record` can answer a decision (accepted risk).** The verb does not
  check that its caller is the operator, so an agent with shell access could record an answer on a sidecar entry.
  This is accepted under the same trust decision as Decisions of Record provenance: the answer is authored into
  the spec only by `adev specify revise`, and the resulting `DEC-<n>` entry goes through PR review like any other
  spec change.
- **A hand-deleted `DEC-<n>` id may be reused.** Revise allocates `DEC-<n>` as the highest id present in the
  section + 1 and only appends or replaces entries in place, so under the tooling no id is reused. If an entry is
  deleted by hand, its id is no longer present and a later revise may allocate it again (BEH-9).
## Acceptance Criteria
- [ ] A `decision` finding carrying `question` and 2–4 `options` round-trips through `adev blockers write` and
      `parseBlockersSidecar` unchanged, stored JSON-quoted and read back with `JSON.parse`; a `question` over 500,
      a `label` over 60, or an `implications` over 300 characters is truncated first with the single-line marker
      `…[truncated]` (never `truncateProse`'s multi-line marker), the unsafe decision text gate then runs on the
      truncated value, and that exact stored value passes BEH-9's re-check — a test drives an over-length
      reviewer `question` through `adev specify revise` and gets a `DEC-<n>` entry, not `UNSAFE_DECISION_TEXT`
      (BEH-1, BEH-2).
- [ ] A `question`, `label`, or `implications` violating the unsafe decision text rule — including a Unicode
      category C character (NEL, a bidi override), U+2028, U+2029, or `**` — is refused (never stripped): the
      field is dropped, the entry and its prose kept, and a `DECISION_TEXT_REJECTED` advisory appears in the
      `adev blockers write --json` `advisories` array (BEH-2).
- [ ] `adev blockers write --json` reports in its `advisories` array: `OPTIONS_REJECTED` for out-of-bounds
      `options` (entry kept); `DECISION_FIELDS_IGNORED` for `question` / `options` on a `defect` or `external`
      entry; and `DECISION_FIELDS_IGNORED` for reviewer-supplied `decision_choice`, `decision_note`, or
      `decision_recorded` on any entry, which are dropped so `adev decisions record` stays the sole writer of the
      answer keys (BEH-2, BEH-5).
- [ ] On a BLOCK with `decision` blockers, `adev blockers write --json` output carries a `decisionsRequired` array
      (same pattern as `externalRemedies`), and `/adev:review-specs` writes it into `.review.md` as a
      `## Decisions Required` table with columns `blocker_id | section | question | options`, values passed
      through `renderRemedyRef`-style stripping with `|` escaped as `\|`; a test checks the table rows, including
      a value containing `|` (BEH-2).
- [ ] All 8 bundled reviewer prompts that define `finding_class` carry the `question` / `options` / follow-on
      instruction and the settled-decision rule, checked by a prompt-contract test (BEH-1, BEH-8).
- [ ] `adev decisions pending --json` lists under `pending` only OPEN `decision` blockers (no `decision_choice`)
      from the sidecar, in spec-section order, with `structured` set correctly; answered sidecar blockers are
      listed under `answered` and Decisions of Record entries under `decided`, read from the spec's
      `## Decisions of Record` section; an absent sidecar yields an empty `pending` list and exit 0; groups past
      the 16th are marked `ask: false` and counted in `ask_round.overflow` (BEH-3).
- [ ] `adev decisions pending --json` reports in its `advisories` array: `QUESTION_DERIVED` for every derived
      question, whose unsafe-text fallback is exactly `Which option resolves blocker <blocker_id>?`; and
      `DECISION_MARKER_MALFORMED` for a marker that does not parse or whose `blockers=` list holds an id
      `parseBlockerId` rejects, that entry then being absent from `decided` (BEH-3, BEH-9).
- [ ] `adev decisions pending` marks a pending entry `duplicate_of: <blocker_id>` when another pending entry in the
      same section has an identical normalized question (lowercased, whitespace-collapsed), and not when the
      questions differ or sit in different sections (BEH-3).
- [ ] `/adev:review-specs` Step 8 on a BLOCK with pending decisions and no `--defer-decisions` runs one bounded ask
      round before the summary — at most ceil(n/4) structured-question calls plus at most one message, only the
      first 16 groups (`ask: true`) asked and every overflow group left open, each `duplicate_of` group asked once and its answer recorded against every id in the group, no re-ask or loop;
      any question unanswered, errored, or without a reply stays open with no answer recorded, the verdict stays
      BLOCK, and the summary lists every open decision with question and options and names
      `adev decisions record` then `/adev:specify --revise`. With `--defer-decisions` it asks nothing and lists
      each pending question and its options in the BLOCK summary. `--defer-decisions` is declared in the skill's
      Arguments table, and its `allowed-tools` includes the harness structured-question tool (`AskUserQuestion`)
      (BEH-4).
- [ ] `adev decisions record` is the only writer of `decision_choice`, `decision_recorded`, and `decision_note`
      (when given), writing them only onto the named decisions' `.blockers.md` entries and leaving the spec
      byte-identical; re-recording a blocker replaces all three keys, and a re-record without a note removes
      `decision_note`. It rejects unknown (`UNKNOWN_DECISION_BLOCKER`), non-decision (`NOT_A_DECISION_BLOCKER`),
      stale-revision (`BLOCKERS_REVISION_MISMATCH`), and malformed (`INVALID_DECISION_ANSWERS`) input, a missing
      `.blockers.md` (`NO_REVIEW_SIDECARS`), and a `choice` / `note` violating the unsafe decision text rule or
      over 1,000 characters (`UNSAFE_DECISION_TEXT`, refused, not truncated), writing nothing (BEH-5).
- [ ] The spec path and the derived `.blockers.md` path resolving by realpath outside the project root (a symlink
      included) yield `INVALID_SPEC_PATH`; an `--answers @path` resolving outside the root, or `--answers` input
      over 64 KiB, yields `INVALID_DECISION_ANSWERS`; nothing is written and no error message echoes file content
      (BEH-3, BEH-5).
- [ ] `adev specify group-blockers` moves answered `decision` blockers into `anchors` with `decisions` attached
      and omits them from `decision_blocker_ids`; open ones still halt with `DECISION_REQUIRED`; a test checks the
      per-anchor authoring dispatch receives the attached decisions as binding. An answered blocker whose anchored
      section comes back unchanged is not addressed, and when no section changed revise under `--auto` exits
      `NOTHING_TO_REVISE` and the loop stops `LOOP_NO_PROGRESS`, while an interactive revise writes the
      `DEC-<n>` entries and clears the sidecar. A recorded `decision_choice` or `decision_note` that fails the
      BEH-2 gate is not authored: the blocker stays in `decision_blocker_ids` and a `DECISION_TEXT_REJECTED`
      advisory appears in the `group-blockers` output's `advisories` array (BEH-6).
- [ ] `adev specify revise` authoring answered blockers creates or updates `## Decisions of Record` (immediately
      before `## Acceptance Criteria`, located ignoring headings inside fenced code blocks, or at end of file when
      that heading is absent) with one marker-plus-entry per decision, `DEC-<n>` allocated as the highest present
      in the section + 1, and in-place replacement that keeps the `DEC-<n>` of a blocker already decided in the
      section; it re-checks `question` / `implications` / `choice` / `note` and refuses with
      `UNSAFE_DECISION_TEXT`; and it writes the entries before clearing the sidecar. A test with a fenced
      `## Acceptance Criteria` line places the section before the real heading (BEH-9).
- [ ] After composing the Decisions of Record write, `adev specify revise` aborts with `SPLICE_VALIDATION_FAILED`,
      writing nothing, when any byte outside that section and the authored anchors differs; a revise with no
      answered blockers leaves an existing `## Decisions of Record` section byte-identical (BEH-9).
- [ ] `adev specify revise` refuses, per anchor, any authored section body containing `<!-- adev:decision` with
      `SPLICE_VALIDATION_FAILED`, keeping the anchor's prior text and the blocker unresolved, and never treats
      `## Decisions of Record` as an authoring target (BEH-9).
- [ ] Interactive `/adev:build` asks pending decisions from the top-level orchestrator after a BLOCK that already
      consumed a review retry, and continues the cycle without a reviewer dispatch; exhausting
      `max_review_retries` with decisions still open exits `LOOP_BUDGET_EXHAUSTED` and reports them; `--auto`
      halts `DECISION_REQUIRED` with every pending question and option listed (BEH-7).
- [ ] A contract test over `skills/build/references/blocker-auto-retry-loop.md` and
      `skills/build/references/pipeline/step-1-review.md` checks that build passes `--defer-decisions` on every
      review dispatch, that the ask round runs `adev decisions pending`, `adev decisions record`, then
      `adev specify group-blockers` in that order, and that the `--auto` halt message lists the pending questions
      and names `adev decisions record` and `/adev:build --resume` (BEH-4, BEH-7).
- [ ] An integration test traces one decision end to end: `adev decisions record` answers it; `adev decisions
      pending` lists it under `answered`, not `pending`; `adev specify group-blockers` attaches it to its anchor;
      `adev specify revise` writes its `DEC-<n>` entry and clears the sidecar; `pending` then lists it under
      `decided` (BEH-3, BEH-5, BEH-6, BEH-9).
- [ ] `npm test` passes, including the skill size cap and the no-inline-Node SKILL.md guard.
- [ ] No constitutional violations.
