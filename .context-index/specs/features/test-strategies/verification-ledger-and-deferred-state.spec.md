---
charter: test-strategies
charter-extension: true
kind: behavioral
status: review-pending
risk_level: high
milestone:
revision: 1
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

`unmet_requirement` names the specific `infra_requirements` system/env var/tool
that failed preflight, sourced from `runPreflight()` output — not free prose.
A `deferred` outcome with a missing or unrecognised `reason_code` is itself an
error (`LEDGER_DEFERRED_UNEXPLAINED`).

**3. Agents may not choose `deferred` to make progress**

`operator_deferred` requires an explicit human instruction or a project
configuration entry, recorded with its source. An agent encountering an
environmental obstacle records `infra_unavailable` / `infra_partial` and
**stops**; it does not deem the work done. This mirrors the integration profile's
existing prohibition on agent-initiated skips, and extends it to every strategy.

**4. Recording is mandatory, and absence is itself a finding**

Every plan task carrying a non-`unit` strategy assignment must have at least one
recorded outcome by the time validation runs. A task with an assignment and no
outcome is reported as `unverified` — the state the audited project's absent
records should have produced. Absence never reads as success.

**5. Event shape (proposed — requires human approval)**

Outcomes are recorded as a `strategy_verification` event appended to the owning
spec's log:

```
{ event: "strategy_verification", task_id, strategy_id,
  outcome, reason_code?, unmet_requirement?, evidence_ref?, ts }
```

`evidence_ref` is a project-root-relative path to the report or artifact that
justifies the outcome (reconciliation report, snapshot provenance record,
tolerance measurement report) — not the payload itself, keeping event size bounded
and secrets out of the log.

> **[BOUNDARY: human-approved] required.** Adding `strategy_verification` to
> `CANONICAL_EVENTS` in `lib/lifecycle-events.mjs` touches the lifecycle event
> schema governed by ADR-0009, exactly as `spec_amended` and `test_depth_assigned`
> did. **This spec proposes the event; it does not land it.** Implementation is
> blocked until a human approves the taxonomy addition.
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

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Outcome value outside the closed enum | Reject the record | `LEDGER_INVALID_OUTCOME` |
| `deferred` with no or unrecognised `reason_code` | Reject the record | `LEDGER_DEFERRED_UNEXPLAINED` |
| `deferred` with `reason_code: infra_unavailable` but no `unmet_requirement` | Reject the record | `LEDGER_DEFERRAL_UNATTRIBUTED` |
| `operator_deferred` with no attributed human source | Reject the record | `LEDGER_UNATTRIBUTED_OVERRIDE` |
| Task has a non-`unit` assignment and no outcome at validate time | Report `unverified`; non-passing | `LEDGER_UNVERIFIED_TASK` |
| Spec path does not resolve to a lifecycle log | Report; do not silently drop the outcome | `INVALID_SPEC_PATH` |
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
| `lib/lifecycle-state.mjs` | High | `reportStrategyVerification()` emitter, projection rule, `renderMarkdown` verification section |
| `lib/diagnostics/event-schemas.mjs` | Medium | Schema for the new event: closed enums, required-field pairing |
| `lib/infra-preflight.mjs` | Medium | Expose which declared system/env var/tool failed, so `unmet_requirement` is machine-sourced |
| `lib/test-strategies/` | Medium | Profiles reference the outcome vocabulary; resolve preflight failure → `deferred` |
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

- [ ] The outcome enum is closed at four values and contains no `skipped`
- [ ] A `deferred` record without a recognised `reason_code` is rejected
- [ ] A `deferred` record with `infra_unavailable` and no `unmet_requirement` is rejected
- [ ] `unmet_requirement` is populated from `runPreflight()` output, not free prose
- [ ] An agent cannot produce `operator_deferred` without an attributed human source
- [ ] A non-`unit` task with no recorded outcome reports `unverified` and does not pass
- [ ] `renderMarkdown()` reports `deferred` and `unverified` counts separately from passes
- [ ] No gate treats `deferred`, `error`, or `unverified` as GREEN
- [ ] No new results store, board file, or file format is introduced
- [ ] The `strategy_verification` canonical event carries a `[BOUNDARY: human-approved]` comment and landed only after explicit approval
- [ ] All quality gates pass; no constitutional violations introduced
