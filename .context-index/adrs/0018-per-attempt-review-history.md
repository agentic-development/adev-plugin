# ADR 0018: Per-Attempt Review History Lives in the Event Log, Not in Rotated Sidecars

## Status

**Proposed**

> Amends **ADR 0012 (Plan-Adjacent Sidecar Artifacts)** by *declining* to widen its closed peer enumeration. The four permitted peers stand unchanged.

## Date

2026-08-13

## Context

`.review.md` and `.validate.md` are overwritten in place on every re-run, so per-attempt history is destroyed. Measured on this repo (2026-08-12): the current review files show **0 BLOCK verdicts**, while git history contains **38 BLOCK verdicts across 24 spec files (~12%)**. The review gate demonstrably blocks; the evidence is being erased by the writer.

The consequences are real. Rework cannot be measured, the review → revise → re-review loop cannot be analysed for convergence, and the 2026-05-19 retro's recommendation to make these artifacts append-only has stayed unimplemented because every proposed shape ran into ADR-0012.

`issue-561` and the draft `report-rotation.spec.md` proposed **rotated sibling files** — `<spec-stem>.review.<rev>.md` — preserving each attempt under a distinct name. That proposal drew a blocker in architecture review (SA-1) plus seven further constraints. This ADR resolves that blocker.

### Why rotation was the obvious answer, and why it fails

ADR-0012 §"Permitted peers" closes the sidecar set: *"Adding a new peer requires either an ADR amendment or a follow-on ADR that enumerates it. Skills MUST NOT write arbitrary `<stem>.<x>.md` files outside this enumeration."* Rotation adds an unbounded family of peers, not one — `<stem>.review.1.md`, `.2.md`, and so on.

It also breaks the naming convention itself. ADR-0012 §"Naming convention" specifies exactly three segments, `<artifact-stem>.<purpose>.<ext>`; a rotated name has four. So rotation needs the convention widened *and* the enumeration opened — two amendments to accommodate one feature.

Seven further problems surfaced in review, each individually solvable and collectively damning:

| Origin | Problem |
|---|---|
| SA-3 | Rotate-then-write leaves the canonical path absent during the write window, so a crash yields a gate observing no report. |
| SA-4 / CON-3 | `<rev>` collides with two existing vocabularies — the spec frontmatter `revision:` and the `revision` field on lifecycle events. Two attempts at one spec revision collide, making the collision path the normal path. |
| CON-4 | `.blockers.md` is inseparable from `.review.md` for the retry loop, and `lib/specify-revise.mjs` clears it every attempt. Rotating one without the other defeats exactly the loop that needs the history. |
| CON-5 | No discovery helper exists for rotated files, and `spec-file-suffixes.spec.md` mandates positive globs that deliberately *do not* match them — scanner-invisibility is a load-bearing invariant with its own regression test. |
| SEC-3 | No retention bound. With the auto-retry loop, a blocked spec accumulates report files indefinitely; collision resolution is an unbounded probe. |
| SEC-4 | Retention goes from one report to N, so a secret in an early attempt persists instead of being overwritten. |
| SA-2 | The real writer is `lib/cli/artifact.mjs`, not skill prose — rotation logic in a SKILL.md would violate the constitution's control-flow-in-CLI rule. |

### The observation that dissolves the problem

**An append-only, per-attempt store already exists.** `/adev:review-specs` emits one `reviewer_report` event per dispatched reviewer per run into `.context-index/lifecycle-state/<slug>.jsonl`, which is append-only by construction. `/adev:validate` emits `validator_report` events the same way.

The skill already says which artifact is authoritative — `skills/review-specs/SKILL.md` §6b: *"The `.review.md` artifact is now a presentation/audit artifact for human consumption; the canonical reviewer state lives in the lifecycle log."* And §"Gate Behavior" is explicit that downstream skills *"MUST call `requireGate` … they MUST NOT parse `.review.md` frontmatter for verdict."*

So per-attempt **verdicts** are already preserved and already canonical. What overwriting destroys is the per-attempt **finding prose** and the finding-ID set — not the verdict history the metrics actually need.

Rotation, then, proposed to build a second per-attempt store alongside the one that already exists, in the artifact explicitly designated as a *view*.

## Decision

**Decline to widen ADR-0012's peer enumeration. Preserve per-attempt review history in the lifecycle event log, which is already append-only and already declared canonical.**

Three parts:

1. **The four permitted peers stand unchanged.** `.review.md` and `.validate.md` keep the lifecycle ADR-0012 assigns them — *"Rewritten on each review run"* — and remain human-facing presentation artifacts. No new peer, no fourth naming segment, no rotation.

2. **`reviewer_report` and `validator_report` events carry the finding-ID set for that attempt.** Reviewers already emit canonical `blocker_id`s (`lib/blocker-id.mjs`), and `lib/loop-convergence.mjs::partitionBlockers` already partitions blocker sets into addressed / persistent / new. Recording those IDs on the event closes the only genuine gap: which findings appeared, persisted, or were resolved at each attempt becomes queryable without git archaeology.

3. **Finding prose is not preserved per attempt.** This is a deliberate trade. Prose is the largest, most secret-prone, and least machine-useful part of a report; the metrics that motivated `issue-561` (rework rate, convergence, round counts) need IDs and verdicts, not narrative. Anyone needing the prose of a superseded attempt can read git history — which is exactly how the 38 hidden BLOCKs were recovered.

### What this resolves

Every constraint that made rotation expensive disappears rather than being solved, because no new file is created: SA-3 (no rotation window), SA-4 and CON-3 (no `<rev>` token needed), CON-4 (`.blockers.md` untouched), CON-5 (no scanner-invisibility problem), SEC-3 (the event log already has size caps; no unbounded probe), SEC-4 (the event log already applies redaction and a 4 KB `notes` cap), SA-2 (the change lands in `lib/lifecycle-state.mjs`, already the owner).

## Consequences

**Positive.** The closed peer set stays closed, which preserves the property ADR-0012 exists to protect. Per-attempt history becomes *queryable* rather than merely recoverable, which is a stronger outcome than rotation offered — a JSONL scan versus `git log -p` archaeology. No new discovery helper, no retention policy, no redaction pass, and no new failure mode in the artifact writer.

**Negative.** Per-attempt finding *prose* is still lost on overwrite, so a reviewer wanting to read what an earlier attempt actually said must consult git. Event payloads grow by the finding-ID set — bounded, but not free. And the event log becomes load-bearing for a use case (retrospective analysis) beyond gate evaluation, which raises the cost of ever corrupting it.

**Neutral.** `issue-561`'s framing — "append-only validate/review reports" — is answered, but not in the way it was written: the append-only store already existed, and the work is to use it rather than to build a second one. `report-rotation.spec.md` should be closed as superseded by this ADR rather than revised.

## Alternatives considered

**Rotated sibling files** (`<stem>.review.<attempt>.md`) — the original proposal. Rejected: requires amending both the closed enumeration and the three-segment naming convention, and carries the seven constraints tabulated above. It builds a second per-attempt store beside an existing one.

**A history directory** (`<stem>.history/review-<attempt>.md`) — sidesteps the naming convention by nesting rather than extending. Rejected: it introduces a new *directory* concept to the sidecar model, still needs a discovery helper and a retention policy, and still duplicates the event log.

**Rely on git history alone, change nothing** — defensible, and it is the status quo that produced the 38-BLOCK archaeology. Rejected because the finding-ID set is not recoverable from git without parsing every historical revision of every report, which is precisely the analysis the study needed and could not perform.

**Append attempts within the single `.review.md`** — keeps one peer and one filename. Rejected: the file grows without bound, every reader must learn to find the newest section, and the artifact ADR-0012 designates as a human-facing view becomes a log with a presentation layer bolted on. It also contradicts the declared "Rewritten on each review run" lifecycle without saying so.

## References

- ADR 0012 — Plan-Adjacent Sidecar Artifacts (the enumeration this ADR declines to widen)
- ADR 0010 — Governance Check Layering (surface-role assignment)
- `.context-index/specs/cross-cutting/report-rotation.spec.md` — the draft this supersedes
- `.context-index/specs/cross-cutting/measurement-integrity.review.md` — SA-1 and the seven constraints, from the rev-2 architecture review
- `.context-index/research/harness-simplification-study.md` — the overwrite finding (38 BLOCKs hidden by in-place rewrite)
- `lib/loop-convergence.mjs`, `lib/blocker-id.mjs` — the existing convergence and finding-ID machinery this decision builds on
