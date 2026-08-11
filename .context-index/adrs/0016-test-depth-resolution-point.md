# ADR 0016: Test Depth Resolution Point and Persistence

## Status

**Proposed**

> **Revised 2026-08-11** (revisions 6-7 of the spec): end-to-end floor *enforcement* is descoped — the floor assigns and records depth, and nothing verifies the authored suite against it (see the spec's Scope Boundary; follow-on filed as issue-559). The event log described in §4 is therefore this capability's product: an advisory intent signal plus audit trail, not an enforcement mechanism. Missing floor path inputs degrade visibly (`floor_inputs: "unavailable"`) rather than failing.
>
> **Proposed 2026-08-10**: Resolves blocker `structural-architect:adr-conflict:02511dad` raised against `.context-index/specs/features/test-strategies/test-depth-policy.spec.md` at revision 1. That spec proposed scaling test depth from `/adev:route` dimension scores, but placed the resolution at `/adev:plan` time — where routing scores do not yet exist, because `/adev:route` requires an already-authored plan. The spec additionally named no persistence site for the resulting assignment, and all three candidate sites are closed by ADR-0012 and `plan-task-events.spec.md` CON-8. This ADR settles both questions: **where** depth resolves, and **how** the assignment persists.

## Date

2026-08-10

## Context

`test-depth-policy.spec.md` introduces two independent axes governing test volume:

- **Granularity** (`per-task | per-behavior | per-spec`) — how test suites map onto units of change. Consumed by `/adev:plan` when it emits each task's `tests:` field.
- **Depth** (`minimal | standard | thorough`) — how many case classes a suite must cover. Consumed when tests are actually authored.

The spec's intent is that depth scale with the complexity and severity of the change, reusing the four-dimensional scoring `/adev:route` already performs rather than introducing a second scoring mechanism. This mirrors `graduated-rigor-tiers`, which scales review and validation breadth from the same routing signal via `resolveRigorMode` in `lib/governance/rigor-mode.mjs`.

Three constraints collide.

**1. Ordering.** The lifecycle runs `plan → route → implement → validate`. `/adev:route` takes `--plan <path>` as a required argument and scores the tasks *inside* an authored plan. If depth is resolved at plan time, routing scores cannot exist yet — the dependency is circular. Revision 1 of the spec did place resolution at plan time, which made its dynamic assessment dead code: every task would fall through to the `MISSING_ROUTING_SCORE` fallback.

**2. Persistence.** The spec requires that a policy change not rewrite plans already in flight, which implies each task's depth assignment is recorded somewhere at resolution time. Three candidate sites are unavailable:

- The plan body is read-only after authoring (`plan-task-events.spec.md` CON-8).
- `<plan-stem>.routing.json` is writer-owned by `/adev:route`; a re-run fully replaces the prior sidecar, so a depth assignment written there would not survive a re-route.
- A new sidecar peer is forbidden without an ADR — ADR-0012 closes the set at four (`.review.md`, `.validate.md`, `.blockers.md`, `.routing.json`).

**3. Representation.** `depth_rules` in revision 1 compared routing dimensions against a 1–5 scale. That scale exists only in the human-readable scoring table in `skills/route/SKILL.md`. The machine-readable sidecar contract (`skills/route/SKILL.md:156`) specifies each of the four dimensions as a `0..1` float. Rules written against 1–5 match every possible sidecar value.

The relevant observation is that **the two axes are needed at different moments**. Granularity determines the *suite path* a task's `tests:` field points at, which `/adev:plan` must know while authoring. Depth determines *how many case classes* the RED phase authors inside that suite — information not needed until tests are actually written. Test authoring happens in `/adev:write-test`, which is dispatched by `/adev:implement` (`skills/implement/SKILL.md:362`), strictly after `/adev:route`. At that point the routing sidecar exists and is already read per-task through the shipped `adev implement read-routing --plan <path> --task-id <id>` verb.

## Decision

Split the two axes by resolution point, and persist depth assignments as lifecycle events rather than as a new sidecar.

### 1. Granularity resolves at plan time, from static sources only

`/adev:plan` resolves granularity from the static configuration chain (module override → project manifest → domain default → built-in) with **no routing input**. Plan-time resolution stays fully deterministic and acquires no dependency on `/adev:route`.

### 2. Depth resolves at test-authoring time, after routing — owned by `/adev:implement`

Depth is resolved when tests are authored, and **`/adev:implement` owns that resolution**. It already reads the routing sidecar per task (`adev implement read-routing`) and dispatches write-test (`skills/implement/SKILL.md:362`), so it holds every input at the moment tests are authored. It resolves depth by invoking `adev test-policy resolve` — which is the **sole writer** of the assignment event — and passes the resolved depth into the write-test subagent. `/adev:write-test` consumes what it is given and never resolves depth itself.

Standalone `/adev:write-test` (no plan, no routing sidecar) reads no policy configuration at all: it authors at the built-in `standard` depth, resolves no chain, evaluates no floor, and emits no assignment event, since there is no plan task to key one to. (Supersedes the earlier "resolves from the static chain alone" formulation, under which the floor — then specified fail-closed — would have applied to invocations that have no task to floor.) Naming a single owner closes the "write-test *or* implement" ambiguity the first draft of this ADR left open.

This also places depth where it is consumed: the RED phase is the only stage that acts on "how many case classes must this suite cover."

### 3. Routing coupling is escalation-only, and scores are consumed as `0..1` floats

**Revised 2026-08-10 (revision 3 of test-depth-policy.spec.md).** The original draft of this ADR described bidirectional dynamic assessment — routing could raise *or* lower depth as a chain stage. That framing is withdrawn for two reasons.

First, a derived signal occupying a chain stage made operator-authored overrides unreachable: with the shipped default enabled and routing scores always present at test-authoring time, a `modules[].test_depth` override was never consulted.

Second, and more fundamentally, **route's four-dimension scores are LLM judgment, not computed values** — there is no `lib/route*` module; `lib/cli/route.mjs` carries only the sidecar plumbing, and the scoring is agent reasoning executed from skill prose. Allowing a non-reproducible score to *reduce* verification is a materially different risk from allowing it to increase verification.

Routing coupling is therefore **escalation-only**: a post-chain, monotonic-upward pass that may raise the depth the static chain produced and may never lower it. Non-determinism in the scores can then only ever produce more coverage, never less. Rules are expressed against the `0..1` float representation defined by the `.routing.json` field contract, never the 1–5 human-readable table.

A consequence worth stating: escalation is a ratchet. Loosening its thresholds silently increases test volume, which is the failure mode the surrounding policy exists to prevent, so the shipped thresholds are deliberately narrow and are covered by an acceptance criterion.

### 4. Depth assignments persist as lifecycle events, not a sidecar

Each resolved assignment is appended to the lifecycle event log as a `test_depth_assigned` event carrying `{ plan, task_id, depth, source, escalated, escalation_skipped?, floor_applied, floor_inputs, dimensions? }`. `floor_inputs` (`"available" | "unavailable"`) records whether the task's path inputs could be parsed from its `**Files:**` block — when unavailable, the sensitive-path floor leg was skipped and the record says so, which is what lets `adev test-policy explain` render three distinct floor states (held / not held / path leg not evaluated). The payload carries no `granularity` — that is a plan-time property already visible in the plan's `tests:` fields, and it has no producer at resolve time. The `plan` field matches every shipped task-scoped event (`lib/diagnostics/event-schemas.mjs`), and registration must land in **both** `CANONICAL_EVENTS` (`lib/lifecycle-events.mjs`) and `REQUIRED_FIELDS_BY_EVENT` — registering only the latter would leave the event in `unknownEvents[]`.

**ADR-0012's closed peer set is deliberately left unamended.** Its own sidecar-versus-event guidance selects the event log for exactly this data shape:

| ADR-0012 criterion | Depth assignment |
|---|---|
| Data is per-event with timestamp semantics | Yes — one assignment per resolution, at the moment tests are authored. A task may accumulate several across re-routes and `/adev:recover` re-invocations; the most recent wins |
| Data is machine-consumed only | Yes — read by `adev test-policy explain`; humans read the rendered explanation, not the raw record |
| Data accumulates across runs | Yes — a re-run appends rather than replacing, preserving the audit trail |
| Data fits a single JSON object per emission | Yes |

Because assignments accumulate as immutable events, a later policy change cannot retroactively alter what an in-flight plan already resolved — satisfying the spec's mid-flight-stability requirement without any new artifact.

`.routing.json` gains depth resolution as a **consumer**. It gains no new producer and no new field, so the four-peer enumeration in ADR-0012 and CON-8 stands unchanged.

## Consequences

### Positive

- **Escalation becomes implementable.** Resolution reads a sidecar that provably exists at that point in the lifecycle; the routing read reuses the shipped `adev implement read-routing` verb, while depth resolution itself is a new verb (`adev test-policy resolve`) introduced by the spec.
- **Plan stays deterministic.** `/adev:plan` acquires no dependency on `/adev:route`, so plan output remains reproducible from static config alone. The lifecycle order is unchanged; no skill needs reordering.
- **No new artifact.** The four-peer sidecar enumeration survives intact, and the repository does not gain a seventh adjacent file per spec.
- **Audit trail by construction.** Because assignments are append-only events, `adev test-policy explain` can report what a task resolved to *and when*, including across re-routes — which a replace-on-rerun sidecar could not. The trail records assignments, not compliance: the floor is advisory, and nothing verifies the authored suite against the assigned depth.
- **Mid-flight stability falls out for free.** Immutable events mean a policy change cannot rewrite history; no explicit "do not rewrite plans" enforcement is needed.
- **Consistent with the sibling mechanism.** `graduated-rigor-tiers` consumes the same routing signal for review and validation breadth. Depth now consumes it at the analogous point for test authoring.

### Negative

- **Depth is not visible in the plan.** A reader of `.plan.md` sees the suite path (granularity) but not the depth each task will receive; that requires `adev test-policy explain` or reading the event log. This is the accepted cost of keeping plan markdown read-only.
- **A new event type.** `test_depth_assigned` must be added to the lifecycle event canon and its schema registered in `lib/diagnostics/event-schemas.mjs`, with the usual projection and unknown-event handling.
- **Two resolution points for one feature.** Granularity and depth resolve in different skills, so an implementer must hold both in mind. The spec mitigates this by documenting each axis with its own chain and resolution point.
- **Re-routing can change depth mid-implementation.** If `/adev:route` is re-run after some tasks are implemented, later tasks may resolve a different depth than earlier ones. The event log makes this visible rather than silent, but the divergence is real and is not prevented.

## Related

- **ADR-0012** — Plan-Adjacent Sidecar Artifacts. Establishes the closed four-peer set this ADR declines to extend, and supplies the sidecar-versus-event criteria used above.
- **ADR-0009** — Lifecycle Artifact Taxonomy.
- `.context-index/specs/features/test-strategies/test-depth-policy.spec.md` — the spec this decision unblocks (blocker `structural-architect:adr-conflict:02511dad`, and jointly `…contract-mismatch:5de250f0` on score representation).
- `.context-index/specs/cross-cutting/graduated-rigor-tiers.spec.md` — the sibling mechanism scaling review/validate breadth from the same routing signal.
- `.context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md` — CON-8, the read-only-after-authoring invariant.
- `.context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md` — defines `.routing.json`; the `read-routing` consumer verb is enumerated in ADR-0012.
