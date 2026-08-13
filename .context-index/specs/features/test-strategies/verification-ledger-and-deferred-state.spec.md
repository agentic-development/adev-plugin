---
charter: test-strategies
charter-extension: true
kind: behavioral
status: review-pending
risk_level: high
milestone:
revision: 3
charter-revision: 5
created: 2026-08-13
updated: 2026-08-13
---

# Live Spec: Verification Ledger and Deferred State

**Capability:** Give every strategy verification a recorded, per-task outcome
drawn from a **closed enum** — and make `deferred` (could not run) a loud,
distinguishable, non-passing state rather than a silent skip. The ledger is the
**existing lifecycle event log**; this spec introduces no new results store.

> **Charter extension note:** This spec supports the charter's revision-5
> non-code strategies (`snapshot`, `reconciliation`, `tolerance`), each of which
> references it for outcome recording. It does not add a strategy type, so the
> `strategy-type-registry` count is unaffected. It does extend the vocabulary that
> `strategy-profile-contract` profiles must speak.

## Problem and Motivation

Two findings from the 2026-08-10 audit, one structural and one urgent.

**Structural.** A project running 391 pipelines built a 391-file RED/GREEN/VERIFY
status ledger by hand, because adev offered no per-unit place to record "this
verification ran and here is what happened." The instinct was right; the
implementation was a parallel universe adev could not read.

**Urgent.** In that same ledger, **235 of 391** pipelines recorded
`verify_compare_counts: skipped` with the note "no data access". More than half
the fleet was unverified, and nothing anywhere was red. A skip that reads as
absence is indistinguishable from a skip that reads as success — both are quiet.
This is the same class of failure that issue-553 addressed for gaming detection
by replacing agent prose with a deterministic gate.

## Decision of record: reuse the lifecycle event log

**Decision: the lifecycle event log is the status ledger. No new store.**

Considered and rejected: a dedicated `.context-index/verification-ledger/`
directory of per-task status files (closest to what the audited project built),
and a single rendered board file.

Reasons to reuse:

- **The machinery already exists and is proven.** `appendEvent()` gives
  append-only per-spec JSONL under `.context-index/lifecycle-state/<slug>.jsonl`;
  `currentState()` projects it; `renderMarkdown()` renders a human-readable board
  on demand; `filterEvents()` and `listLifecycleStates()` support fleet-wide
  queries. A per-file ledger would reimplement all of it.
- **The per-task keying precedent is established.** `plan_task` and
  `test_depth_assigned` are already per-task events keyed by `task_id` on the
  owning spec's log. A verification outcome is the same shape. The audited
  project's per-pipeline granularity maps onto per-plan-task granularity without
  a new addressing scheme.
- **Zero new dependencies and no new file format** (non-negotiable principle 1).
- **A separate store re-creates the original problem.** The audited ledger was
  invisible to every adev skill precisely because it lived outside the log.
- **Append-only beats mutable status files** for the specific failure being
  fixed. A status file can be overwritten from `skipped` to `ok` with no trace; a
  JSONL log keeps both records, and the projection rule is explicit.

Cost accepted: `slugFromSpec` keys logs by spec, so a project whose work is not
spec-tracked gets no ledger. That is the correct pressure — it pushes non-code
work into the same lifecycle as code work, which is the point of this charter
revision.

## Behavioral Contract

### Preconditions

- The task belongs to a plan derived from a `.spec.md`, so `slugFromSpec` resolves
  and a lifecycle log exists (`ensureLifecycleState`).
- A `StrategyAssignment` exists for the task.
- Where the strategy requires external systems, `infra_requirements:` is declared
  so `runPreflight()` can produce a structured result.

### Behaviors

**1. Closed outcome enum**

Every strategy verification resolves to exactly one of four outcomes:

| Outcome | Meaning | Satisfies a GREEN gate? |
|---|---|---|
| `red` | Verification ran; the expectation was not met. This is the intended state before implementation. | No |
| `green` | Verification ran; the expectation was met. | Yes |
| `deferred` | Verification did **not** run for an environmental reason. No verdict exists. | **No** |
| `error` | Verification attempted and crashed — malformed config, tool failure, unparseable output. No verdict exists. | No |

There is no fifth value, and in particular there is no `skipped`. The absence of
a `skipped` value is deliberate: `skipped` is the word that let 235 pipelines
disappear.

**2. `deferred` is never a pass and never silent**

A `deferred` outcome must carry a `reason_code` from a closed set and the
specific unmet requirement:

| `reason_code` | Meaning |
|---|---|
| `infra_unavailable` | Required credentials, env vars, CLI tools, or connectivity absent |
| `infra_partial` | Some declared systems reachable, others not (names the unreachable ones) |
| `insufficient_population` | Data present but below a declared minimum for a meaningful verdict |
| `awaiting_dependency` | A prerequisite task has not produced its output yet |
| `operator_deferred` | A human explicitly deferred it, with an attributed record |

`unmet_requirement` names the specific `infra_requirements` system, env var, or
CLI tool that failed preflight, sourced from `runPreflight()` output — not free
prose. A `deferred` outcome with a missing or unrecognised `reason_code` is
itself an error (`LEDGER_DEFERRED_UNEXPLAINED`).

**`unmet_requirement` is a name, never a message.** It is populated **only** from
`runPreflight()`'s `missing_env_vars`, `missing_tools`, and failing-system
identifiers. Populating it from `probe_error` is explicitly forbidden:
`probe_error` carries up to 200 characters of `sanitizeStderr()`-cleaned stderr,
and that sanitiser strips ANSI and control characters but **not**
credential-shaped substrings — a failing probe's stderr routinely echoes the
connection string it was handed. Because the lifecycle log is committed JSONL,
that would write secrets into git history. A record whose `unmet_requirement`
does not match a name present in the preflight result is rejected with
`LEDGER_UNMET_REQUIREMENT_NOT_A_NAME`.

**System-name granularity is the floor.** `missing_env_vars` and `missing_tools`
are nullable — `runPreflight()` leaves the corresponding check `null` when a
system declares no `env_vars` or `cli_tools`. A probe-only system that fails
therefore yields no variable- or tool-level name at all, only `probe_error`,
which this rule forbids. In that case `unmet_requirement` carries the **system
name** (`sys.name`, always present). The contract is "the failing system, and the
specific env var or CLI tool where preflight knows one" — not a promise of
variable-level granularity in every case.

**3. Agents may not choose `deferred` to make progress**

An agent encountering an environmental obstacle records `infra_unavailable` /
`infra_partial` and **stops**; it does not deem the work done. This mirrors the
integration profile's existing prohibition on agent-initiated skips and extends
it to every strategy.

**`operator_deferred` requires verified human attribution, not a self-declared
source.** The other four reason codes are machine-derived from preflight or
population data and cannot be forged by prose. `operator_deferred` is the single
code that asserts a *human decision*, which makes it the one code an agent could
use to launder an obstacle into forward progress — the same shape as the
235-of-391 `skipped` failure wearing a different label. Therefore:

- **The attestation must be an out-of-band, human-authored artifact — not a
  runtime claim.** An earlier revision proposed reading the project's
  `Author-type` / `Operator` provenance. That was wrong and is withdrawn: those
  are **git commit-message trailers** written by `.githooks/prepare-commit-msg`
  at commit time, not a runtime channel a CLI verb can read; the derivation fails
  **open** (`hasSessionId ? agent : human`, plus an empty-string fallback); and
  its only input is a session-tracking file the attesting session itself writes.
  Building an authentication guarantee on that substrate would be worse than
  having none, because it would read as verified.
- Instead, the recording verb accepts `operator_deferred` **only** when the task
  is named in a checked-in deferral policy file. The record cites the policy entry
  and the commit that introduced it. There is no runtime path to
  `operator_deferred` at all — producing one requires a human to have committed a
  file.

  > **This artifact does not exist yet; this spec introduces it.** Saying so
  > explicitly is the point: the defect this bullet replaces was a fix that
  > referenced machinery which was not there. The contract is deliberately
  > minimal, and the location and exact schema are a **human decision** (see
  > Acceptance Criteria):
  >
  > - **Proposed path:** `.context-index/governance/deferrals.yaml`, alongside the
  >   existing `risk-policies.yaml` / `gates.yaml` / `review.yaml` governance
  >   files, which is where reviewable human policy already lives in adev.
  > - **Proposed minimal schema:** a list of entries, each
  >   `{ spec: <project-root-relative .spec.md path>, task_id: <string>,
  >   reason: <prose, required>, expires: <ISO date, optional> }`.
  > - **Absent file:** treated as an empty list. No `operator_deferred` record is
  >   accepted; every other reason code is unaffected. A project that never
  >   creates the file simply cannot use `operator_deferred`, which is the safe
  >   default.
  > - **Parsing:** the existing zero-dependency governance YAML reader is reused;
  >   no new parser and no new dependency.
  > - **Expiry:** an entry past `expires` no longer authorises a deferral, so a
  >   standing exemption cannot become permanent by inattention.
- An `operator_deferred` record naming a task absent from the policy file is
  **rejected**, not downgraded, with `LEDGER_UNATTRIBUTED_OVERRIDE`. Rejection
  rather than downgrade is deliberate: a silent downgrade would let the agent
  continue believing it had recorded a deferral.
- The policy file is itself subject to review: adding a task to it is a diff a
  human wrote and a reviewer can see, which is the whole point. Deferrals granted
  this way still count as `deferred` in the board and still never satisfy a GREEN
  gate — the policy authorises *recording* the deferral, never *passing*.

**4. Recording is mandatory, and absence is itself a finding**

Every plan task carrying a non-`unit` strategy assignment must have at least one
recorded outcome by the time validation runs. A task with an assignment and no
outcome is reported as `unverified` — the state the audited project's absent
records should have produced. Absence never reads as success.

**Effective date, not retroactive.** This obligation applies only to tasks whose
strategy assignment was recorded **on or after** the commit that lands the
`strategy_verification` event. Tasks assigned before that point are reported as
`unverified (pre-ledger)` — visible in the board but not counted as findings and
not blocking any gate. Without this rule, landing the ledger would instantly mark
every existing non-`unit` task in every adev project as unverified, which would
train operators to ignore the signal on day one — the precise outcome this spec
exists to prevent.

**The cutoff is a version anchor, and only a version anchor.** It is the release
in which `strategy_verification` lands, recorded as a constant in the codebase
and compared against the `plan_task` event that created the assignment. An
earlier revision also offered a data anchor ("read from the first
`strategy_verification` event in the project's logs"); that reading is
**withdrawn**, because it would let the recorder set its own exemption boundary
and would make a project that never records anything permanently exempt —
reproducing the 235-of-391 outcome exactly. A project that has recorded nothing
is maximally unverified, not maximally exempt.

**5. Event shape (proposed — requires human approval)**

Outcomes are recorded as a `strategy_verification` event appended to the owning
spec's log:

```
{ event: "strategy_verification", task_id, strategy_id,
  outcome, reason_code?, unmet_requirement?, evidence_ref?,
  baseline_checksum?, baseline_captured_at?, ts }
```

`evidence_ref` is a project-root-relative path to the report or artifact that
justifies the outcome (reconciliation report, snapshot provenance record,
tolerance measurement report) — not the payload itself, keeping event size bounded
and secrets out of the log.

`baseline_checksum` and `baseline_captured_at` exist so that
`snapshot-strategy-profile.spec.md`'s two defining gaming blockers have a durable
substrate. Without them, the post-hoc-baseline rule ("was the baseline captured
before implementation?") and the write-once rule ("has a baseline already been
recorded for this task?") have nothing to check against — the write-test handoff
block is not a durable, timestamped, queryable record. Both fields are bounded
scalars (a hex digest and an ISO timestamp), so they do not reintroduce the
payload-size or secret-leak concerns that `evidence_ref` avoids.

**Where the pairing check lives.** Both fields are **unconditionally optional** in
`lib/diagnostics/event-schemas.mjs`, whose `getRequiredFields(discriminator)`
contract expresses only a flat per-discriminator required-field array and cannot
express "required when `strategy_id === 'snapshot'`". The conditional rule is
enforced in the **emitter** (`reportStrategyVerification()`), which rejects a
`snapshot` outcome that records a baseline without both fields
(`LEDGER_MISSING_BASELINE_FIELDS`). Putting the check in the emitter rather than
bending the schema module keeps a validated contract intact — an earlier revision
specified conditional-required in the schema module, which is not expressible
there.

**What `baseline_captured_at` can and cannot prove.** It is self-reported by the
same capture step it polices, so on its own it cannot prove a baseline was not
captured late. Its value is corroborative: it must be *consistent with* the
independently-recorded event append time and precede the first implementation
commit. A capture step that lies about its timestamp but appends the event late
is caught by the append time; one that appends early but re-captures later is
caught by the write-once checksum rule. Neither check is claimed to be
tamper-proof, and the profile says so rather than implying a guarantee.

> **[BOUNDARY: human-approved] required.** Adding `strategy_verification` to
> `CANONICAL_EVENTS` in `lib/lifecycle-events.mjs` touches the lifecycle event
> schema governed by ADR-0009, exactly as `spec_amended` and `test_depth_assigned`
> did. **This spec proposes the event; it does not land it.** Implementation is
> blocked until a human approves the taxonomy addition.
>
> The approval must also cover
> `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md`,
> which ADR-0009 §8 designates as the event-log authority and whose Canonical
> Event Variants table must gain a `strategy_verification` row. That table is
> already stale (missing `spec_amended`, `test_depth_assigned`, and
> `code_drift_*`); this change adopts the fix for its own row and flags the
> backlog rather than silently extending the drift.
>
> The fallback if it is not approved is instructive and argues for approval:
> non-canonical events still persist on append but surface under
> `StateProjection.unknownEvents[]`. A signal whose entire purpose is to be loud
> would be filed in the bucket for events the system does not recognise — which is
> a quieter version of the failure this spec exists to fix.

**6. Projection rule: most recent wins, history retained**

For a given `(task_id, strategy_id)`, the most recent event in append order is
the current outcome — matching the `test_depth_assigned` precedent. Earlier
events are retained and readable, so a `deferred → green` transition is auditable
and a `green → deferred` regression is visible.

**7. Rendered board**

`renderMarkdown(state)` gains a verification section listing, per task: strategy,
current outcome, reason code, and evidence reference. Counts by outcome are
reported, with `deferred` and `unverified` totals stated separately and
prominently rather than folded into a pass rate. A fleet where 235 of 391 tasks
are `deferred` must be impossible to read as healthy.

**8. Gate interaction**

Any gate that requires GREEN treats `deferred`, `error`, and `unverified` as
non-passing. A project may configure a gate to *proceed* despite deferrals, but
only via explicit configuration that is itself recorded — never by an agent's
judgement, and never such that the summary reports a pass.

### Postconditions

- Every non-`unit` task has a recorded outcome or is reported `unverified`.
- Every `deferred` outcome names its reason code and unmet requirement.
- The rendered board reports deferral and unverified counts separately from
  passes.

### Error Cases

> **Note on `LEDGER_SPEC_PATH_UNRESOLVED`.** An earlier revision reused
> `INVALID_SPEC_PATH` here. That code already carries an established, different
> contract — `assertWithin()` path-traversal rejection in `lib/cli/specify.mjs`,
> a hard CLI failure with exit 1. This spec's case is explicitly non-fatal
> (report and continue). Reusing one code for two incompatible severities across
> modules is what ADR-0009 §5's throw-site-prefixing rule exists to prevent, so a
> distinct `LEDGER_`-prefixed code is used. `INVALID_SPEC_PATH` retains its
> existing meaning and is still raised, unchanged, for genuine containment
> violations.

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Outcome value outside the closed enum | Reject the record | `LEDGER_INVALID_OUTCOME` |
| `deferred` with no or unrecognised `reason_code` | Reject the record | `LEDGER_DEFERRED_UNEXPLAINED` |
| `deferred` with `reason_code: infra_unavailable` but no `unmet_requirement` | Reject the record | `LEDGER_DEFERRAL_UNATTRIBUTED` |
| `operator_deferred` with no attributed human source | Reject the record | `LEDGER_UNATTRIBUTED_OVERRIDE` |
| Task has a non-`unit` assignment and no outcome at validate time | Report `unverified`; non-passing | `LEDGER_UNVERIFIED_TASK` |
| Spec path does not resolve to a lifecycle log | Report; do not silently drop the outcome | `LEDGER_SPEC_PATH_UNRESOLVED` |
| `unmet_requirement` is not a name present in the preflight result (e.g. sourced from `probe_error`) | Reject the record | `LEDGER_UNMET_REQUIREMENT_NOT_A_NAME` |
| `strategy_id` is `snapshot` and a baseline is recorded without `baseline_checksum` / `baseline_captured_at` | Reject the record | `LEDGER_MISSING_BASELINE_FIELDS` |
| `evidence_ref` escapes the project root | Reject the record | `LEDGER_EVIDENCE_OUT_OF_ROOT` |

## System Constitution Reference

- **"Minimize external dependencies"** — reuses `lib/lifecycle-state.mjs` and
  `lib/infra-preflight.mjs`; adds no store, format, or dependency.
- **"Skills are primarily markdown"** — recording is a CLI verb; skills name it.
- **"No inline Node in SKILL.md"** — outcome resolution and the deferral decision
  are control flow, so they live in `lib/`, never in skill prose.
- **Architecture Boundary — "Changing the hook protocol / plugin registration
  requires human approval."** Applies by the ADR-0009 precedent: adding a
  canonical event is a human-approved taxonomy change (Behavior 5).

## Module Impact Map

| Module | Impact | Changes Required |
|--------|--------|-----------------|
| `lib/lifecycle-events.mjs` | High | Add `strategy_verification` to `CANONICAL_EVENTS` with a `[BOUNDARY: human-approved]` comment — **blocked on approval** |
| `agent-reliable-state-artifacts/lifecycle-event-log.spec.md` | High | ADR-0009 §8 designates it the event-log authority; its Canonical Event Variants table gains a `strategy_verification` row (and is already stale for `spec_amended` / `test_depth_assigned` / `code_drift_*`) |
| `lib/lifecycle-state.mjs` | High | `reportStrategyVerification()` emitter, projection rule, `renderMarkdown` verification section |
| `lib/diagnostics/event-schemas.mjs` | Medium | Schema for the new event: closed enums, flat required-field array. `baseline_checksum` / `baseline_captured_at` stay **unconditionally optional** here; the strategy-conditional pairing check lives in the emitter, because `getRequiredFields(discriminator)` cannot express a conditional |
| `lib/infra-preflight.mjs` | Medium | Expose which declared system/env var/tool failed, so `unmet_requirement` is machine-sourced |
| `lib/test-strategies/` | Medium | Profiles reference the outcome vocabulary; resolve preflight failure → `deferred` |
| `.context-index/governance/deferrals.yaml` | High | **New artifact introduced by this spec** — the only path to `operator_deferred`. Proposed location and minimal schema in Behavior 3; final location and format are a human decision. Absent file = empty list = no `operator_deferred` accepted. Reuses the existing governance YAML reader; no new dependency |
| `skills/validate/SKILL.md`, `skills/write-test/SKILL.md`, `skills/hygiene/SKILL.md`, `skills/status/SKILL.md` | **Deferred — out of scope for this spec** | Gate, dispatch, and reporting prose. Contended surfaces; sequenced as required follow-up |

## Integration Points

1. **Preflight → outcome:** `runPreflight()` failure resolves to `deferred` with
   a machine-sourced `unmet_requirement`, not to a skip.
2. **Profiles → ledger:** the `snapshot`, `reconciliation`, and `tolerance`
   profiles each name this spec as their outcome-recording contract.
3. **Ledger → gates:** the four-value enum is the input to any GREEN gate.
4. **Ledger → hygiene/status:** `unverified` and `deferred` totals are reportable
   fleet-wide via `listLifecycleStates()` + `filterEvents()`.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Human approval for the canonical event | Present the ADR-0009 taxonomy addition for approval — **blocks everything below** | small |
| Event + schema | `strategy_verification` in `CANONICAL_EVENTS` + `event-schemas.mjs` | medium |
| Emitter | `reportStrategyVerification()` with closed-enum and field-pairing validation | medium |
| Preflight attribution | Surface the specific failed system/var/tool | medium |
| Projection + render | Most-recent-wins projection; verification section with separate deferred/unverified counts | medium |
| Unverified detection | Non-`unit` assignment with no outcome → `unverified` | medium |
| Gate integration | `deferred`/`error`/`unverified` never satisfy GREEN | medium |
| Tests | Enum closure, each error code, projection ordering, deferral attribution, render counts | large |

## Acceptance Criteria

Acceptance criteria are split by where they are enforceable, so a reader can tell
which are testable in `lib/` now and which depend on the deferred SKILL.md wiring
named in the Module Impact Map.

**Enforceable in `lib/` (this spec's implementable scope):**

- [ ] The outcome enum is closed at four values and contains no `skipped`
- [ ] A `deferred` record without a recognised `reason_code` is rejected
- [ ] A `deferred` record with `infra_unavailable` and no `unmet_requirement` is rejected
- [ ] `unmet_requirement` is populated only from `runPreflight()`'s `missing_env_vars` / `missing_tools` / failing-system names; a value sourced from `probe_error` is rejected with `LEDGER_UNMET_REQUIREMENT_NOT_A_NAME`
- [ ] An agent cannot produce `operator_deferred`: the only path is a task named in a checked-in deferral policy file; a record for a task absent from that file is **rejected** (not downgraded) with `LEDGER_UNATTRIBUTED_OVERRIDE`. No runtime provenance claim is read
- [ ] `unmet_requirement` falls back to the system name when preflight has no env-var or tool-level name (probe-only systems)
- [ ] The `strategy_verification` conditional baseline-field check lives in the emitter; `event-schemas.mjs` keeps its flat required-field array contract unchanged
- [ ] The pre-ledger cutoff is a version anchor only; a project with zero recorded outcomes is maximally unverified, not exempt
- [ ] `evidence_ref` escaping the project root is rejected
- [ ] A `snapshot` outcome recording a baseline without `baseline_checksum` / `baseline_captured_at` is rejected
- [ ] `LEDGER_SPEC_PATH_UNRESOLVED` is used for the non-fatal case; `INVALID_SPEC_PATH` keeps its existing hard-failure contract
- [ ] Most-recent-wins projection per `(task_id, strategy_id)`, with earlier events retained and readable
- [ ] No new results store, board file, or file format is introduced

**Depends on the deferred SKILL.md wiring (tracked as required follow-up, not satisfiable by this spec alone):**

- [ ] A non-`unit` task with no recorded outcome reports `unverified` and does not pass
- [ ] Tasks assigned before the ledger's effective date report `unverified (pre-ledger)`, are not counted as findings, and block nothing
- [ ] `renderMarkdown()` reports `deferred` and `unverified` counts separately from passes
- [ ] No gate treats `deferred`, `error`, or `unverified` as GREEN

- [ ] An absent `deferrals.yaml` is treated as an empty list: no `operator_deferred` is accepted, and every other reason code is unaffected
- [ ] A `deferrals.yaml` entry past its `expires` date no longer authorises a deferral

**Gated on human approval (blocks everything above):**

- [ ] The location and schema of the deferral policy file are confirmed (proposed: `.context-index/governance/deferrals.yaml`) — it is a new artifact this spec introduces, not existing machinery

- [ ] The `strategy_verification` canonical event carries a `[BOUNDARY: human-approved]` comment and lands only after explicit approval
- [ ] `lifecycle-event-log.spec.md`'s Canonical Event Variants table gains a `strategy_verification` row
- [ ] All quality gates pass; no constitutional violations introduced
