# ADR 0012: Plan-Adjacent Sidecar Artifacts

## Status

**Accepted**

> **Proposed 2026-05-19**: Establishes the sibling-file convention for skills that produce auxiliary data tied to a Live Spec or plan but must not mutate it. Resolves the architectural tension between (a) `CON-8` in `plan-task-events.spec.md` (the artifact markdown is read-only after authoring) and (b) the legitimate need for skills like `/adev:route` and `/adev:review-specs` to record per-task or per-finding metadata alongside the primary artifact. The pattern is already exercised by `<spec-stem>.review.md` and `<spec-stem>.validate.md`; this ADR formalises it as the canonical solution and enumerates current and planned peers.
>
> **Accepted 2026-05-19**: All three acceptance gates landed via `.context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md`:
>
> 1. `/adev:route` no longer mutates plans — Step 4 now writes `<plan-stem>.routing.md` via the `adev route emit-sidecar` CLI verb (plan-routing-sidecar plan-task t5).
> 2. CON-8 in `plan-task-events.spec.md` was amended to enumerate the four permitted sidecar peers (`.review.md`, `.validate.md`, `.routing.md`, `.blockers.md`) with this ADR as the cross-reference for the closed set (plan-routing-sidecar plan-task t7).
> 3. `lib/plan-immutability.mjs` gained a working-tree inspection branch that flags `PLAN_MUTATED_WITHOUT_SIDECAR` for plans with inline `**Routing:**` blocks and no sibling `.routing.md`, independent of `--diff-filter=M` git history — closing the mutate-then-single-add gap (plan-routing-sidecar plan-task t4).
>
> The convention now governs future additions to the sidecar enumeration via ADR amendments.

## Date

2026-05-19

## Context

The `agent-reliable-state-artifacts` charter's `plan-task-events.spec.md` invariant `CON-8` states:

> Plan markdown is read-only after authoring. `/adev:plan` writes the plan file once; authoritative status thereafter lives in the lifecycle event log.

The same principle applies to specs after they enter `review-passed` or later states — the markdown is a stable input to downstream consumers.

Two recurring patterns violate or strain this invariant:

1. **`/adev:route` annotates plans.** `skills/route/SKILL.md` Step 4 (lines 108-133) writes `**Routing:** / **Scores:** / **Rationale:**` blocks into each task header inside `.plan.md` — directly mutating the file after `/adev:plan` has already emitted `plan_task: pending` events. The detector in `lib/plan-immutability.mjs` catches this for untracked plans but masks the violation for plans committed as single-add commits (no `--diff-filter=M` history). Documented as `issue-526`.

2. **Review BLOCK had no place to record findings before commit `7e333fd`.** The original `/adev:build` blocker-fix loop dispatched `/adev:specify --revise --blocker-context <findings>` — undocumented flags that did not exist on `/adev:specify`. The fix in commit `7e333fd` introduced `<spec-stem>.blockers.md` as a sibling artifact: the findings are written to the sidecar, the build fails with a manual-revision-required message, and the user revises + `/adev:build --resume`s. Auto-retry of the revision pathway is now blocked on a real `/adev:specify --revise` workflow (`issue-527`, HIGH priority).

Both situations share a common shape: a skill needs to record per-task or per-finding metadata that is *adjacent* to the spec or plan but must not be *folded into* it. Without a stated convention, each skill invents its own approach — direct mutation (the current `/adev:route` mistake), inventing fake CLI flags (the prior broken blocker-fix loop), or lifecycle-event emission for data that is inherently per-artifact rather than per-event.

A third standing case is the `<spec-stem>.review.md` and `<spec-stem>.validate.md` files written by `/adev:review-specs` and `/adev:validate`. These are already-accepted sidecars, and they work — they're widely consumed by downstream skills (the build orchestrator reads them; hygiene Pass 12 reads them; retro Pass 14 reads them). The pattern is in use; it just isn't documented as a deliberate architectural decision.

## Decision

Adopt **sibling-file artifacts** with a documented naming convention as the canonical way for skills to produce auxiliary data alongside a Live Spec or plan, in place of mutating the primary artifact.

### Naming convention

```
<artifact-stem>.<purpose>.md
```

- `<artifact-stem>` is the spec or plan filename without its kind suffix (e.g. `cli-install-integration` for both `cli-install-integration.spec.md` and `cli-install-integration.plan.md`).
- `<purpose>` is a short verb-or-noun describing what the sidecar carries.

### Permitted peers (as of this ADR)

| Peer | Producer | Consumer(s) | Lifecycle |
|---|---|---|---|
| `<spec-stem>.review.md` | `/adev:review-specs` | `/adev:build` (skip-condition), hygiene Pass 12 | Rewritten on each review run |
| `<spec-stem>.validate.md` | `/adev:validate` | `/adev:build` (skip-condition), hygiene | Rewritten on each validate run |
| `<spec-stem>.blockers.md` | `/adev:build` Step 1 (BLOCK path) | Human reviser; future `/adev:specify --revise` (`issue-527`) | Written on review BLOCK; cleared when superseded review passes |
| `<plan-stem>.routing.md` | `/adev:route` (target shape per `issue-526`) | `/adev:implement` | Rewritten on each route run |

The set is closed by ADR. Adding a new peer requires either an ADR amendment or a follow-on ADR that enumerates it. Skills MUST NOT write arbitrary `<stem>.<x>.md` files outside this enumeration.

### When to use a sidecar vs the lifecycle event log

| Use a **sidecar** when | Use a **lifecycle event** when |
|---|---|
| Data is per-artifact and reviewed as a whole (e.g. review verdict, validation report) | Data is per-event with timestamp semantics (e.g. step entry/exit) |
| Data is human-readable and frequently inspected at the terminal | Data is machine-consumed only |
| Data is rewritten in full each run | Data accumulates across runs |
| Data has structural fields beyond simple status (tables, narrative) | Data fits a single JSON object per emission |

When in doubt, prefer the lifecycle log — sidecars are an exception for per-artifact human-readable reports.

### Update to CON-8

`plan-task-events.spec.md` CON-8 SHOULD be amended to enumerate the permitted sidecar peers explicitly, so future readers do not mistake the existence of `<stem>.routing.md` (etc.) for a violation. Suggested wording:

> Plan markdown (`<stem>.plan.md`) and spec markdown (`<stem>.spec.md`) are read-only after authoring. The following sibling sidecars are permitted and do not constitute mutations of the primary artifact: `<stem>.review.md`, `<stem>.validate.md`, `<stem>.blockers.md`, `<stem>.routing.md`. Adding a new permitted sidecar requires an ADR.

### Detector enhancement

`lib/plan-immutability.mjs` SHOULD be extended (as part of `issue-526`) to detect the "mutate-then-single-add-commit" pattern by checking the plan body for inline `**Routing:**` blocks when no sibling `.routing.md` exists. The current detector relies on `--diff-filter=M` history, which masks violations introduced before the plan is first committed.

## Consequences

### Positive

- **CON-8 stays enforceable.** Skills that need auxiliary data write to sidecars instead of mutating the primary artifact. The plan-immutability detector becomes meaningful again.
- **Pattern consistency.** The four documented peers (`.review.md`, `.validate.md`, `.blockers.md`, `.routing.md`) all follow the same naming convention. Future skills inherit the pattern without re-deciding.
- **Resolves issue-526 cleanly.** The /adev:route fix becomes mechanical: rewrite Step 4 to write `.routing.md` instead of mutating the plan. The migration plan for the 5 already-mutated cursor-provider plans gets a clear target file shape.
- **Unblocks issue-527 design.** A real `/adev:specify --revise` workflow can read `<spec-stem>.blockers.md` (already established by commit `7e333fd`) plus the spec at revision N to produce revision N+1. The input-side artifact contract is settled.
- **Backwards-compatible.** `.review.md` and `.validate.md` already exist and work; this ADR retroactively legitimizes them and bounds the namespace going forward.

### Negative

- **One more file per task lifecycle stage.** A fully-built spec now has up to six adjacent files: `.spec.md`, `.plan.md`, `.routing.md`, `.review.md`, `.validate.md`, plus the issued-only `.blockers.md` when review BLOCKs. Repository layout gets denser.
- **Closed-enum maintenance.** Each new sidecar requires an ADR amendment. A skill that wants auxiliary data must justify why a sidecar is right (vs lifecycle event) before adding to the enumeration. This is intentional friction.
- **Migration cost for cursor-provider plans.** Five existing plans (`hook-config-generator.plan.md`, `cursor-adapter.plan.md`, `plugin-manifest-and-parity.plan.md`, `cli-install-integration.plan.md`, `sync-target-output.plan.md`) carry inline routing annotations and must be migrated to the sidecar shape per `issue-526`. Two migration options are documented in that issue.

### Neutral

- The convention does NOT prescribe whether the sidecar is tracked in git. `<spec-stem>.review.md` and `<spec-stem>.validate.md` are tracked today; `<plan-stem>.routing.md` and `<spec-stem>.blockers.md` will be tracked too. The decision per peer follows from whether the sidecar is a durable record (track) or a transient artefact (gitignore).
- Sidecars do not replace the lifecycle event log — both coexist. The log emits per-event timestamps and structured payloads; sidecars carry per-artifact narrative reports.

## Alternatives Considered

### A. Embed everything in the lifecycle event log

Rejected: lifecycle events are designed for per-event timestamps. Cramming a multi-paragraph review report or a routing-decision table into a single JSON object per event makes the log hard to read and hard to query. The sidecar pattern keeps each artifact human-inspectable at the terminal.

### B. Allow targeted mutation of the primary artifact

Rejected: this would undo CON-8 and re-introduce the failure mode `issue-526` describes. Once we allow `/adev:route` to mutate the plan, every subsequent skill will want the same affordance, and the read-only invariant becomes nominal rather than enforced. The plan-immutability detector exists precisely because experience has shown silent mutations cause downstream drift.

### C. Per-task subdirectories (e.g. `<plan-stem>.d/routing.md`, `<plan-stem>.d/review.md`)

Rejected: adds nesting without buying much. The flat sibling convention already keeps related files together in directory listings (they sort alphabetically by stem). Adding `.d/` directories would also break the simple grep-discoverable filename pattern used by `/adev:build`, hygiene, and retro.

### D. Single combined `<stem>.lifecycle.md` sidecar holding all metadata

Rejected: each peer has a different write cadence and a different producer skill. Review writes after specify; validate writes after implement; routing writes after plan; blockers write on review BLOCK. Combining them into one file creates write-coordination problems (race conditions, partial states) without simplifying the consumer model — the consumers already know which peer they want.

## Implementation

This ADR is **proposed**, not accepted. Acceptance follows from:

1. The `/adev:route` fix lands per `issue-526` (validates the sidecar pattern for routing).
2. CON-8 amendment commits to `plan-task-events.spec.md`.
3. Plan-immutability detector enhancement commits to `lib/plan-immutability.mjs`.

When all three are in, the ADR status flips from `Proposed` to `Accepted`. The convention then governs future additions to the sidecar enumeration via ADR amendments.

`issue-527`'s scope is informed by but not blocked on this ADR — the `<spec-stem>.blockers.md` sidecar is already in use (commit `7e333fd`), and the open work in `issue-527` (canonical blocker IDs, per-revision lifecycle events, convergence detection) is orthogonal to the sidecar contract itself.

## References

- `.context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md` (acceptance gate — drives this ADR's Proposed → Accepted transition)
- `.context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md` (CON-8)
- `lib/plan-immutability.mjs` (detector)
- `skills/route/SKILL.md` (Step 4 — current violation site)
- `skills/build/SKILL.md` (BLOCK path — sidecar consumer)
- `tests/skills/plan-task-immutability.test.mjs` (detector regression test)
- Commit `7e333fd` — introduced `<spec-stem>.blockers.md`
- Commit `c080e13` — adjacent provenance hook fix (different issue, related artifact-handling discipline)
- Local issue board: `issue-526`, `issue-527`
- `.context-index/hygiene/retros/2026-05-19-cursor-provider.md` — full session retro
