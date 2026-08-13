---
mode: cross-cutting
affects: [review, validation, hygiene, lifecycle-state]
kind: behavioral
status: draft
risk_level: medium
tracker-ref: issue-561
revision: 1
created: 2026-08-13
updated: 2026-08-13
blocked-by: "ADR-0012 amendment — the permitted sidecar peer set is closed by ADR"
---

# Live Spec: Report Rotation — preserve per-attempt review and validation history

<!-- Split out of measurement-integrity.spec.md at revision 2, on the SA-1 blocker
     from that spec's architecture review. Frontmatter precedes the H1 deliberately:
     `adev specify revise` cannot parse a spec whose frontmatter is not the first
     non-blank content (see epic-104). -->

## Status: DRAFT — blocked on an architecture decision

This spec **must not enter review until ADR-0012 is amended.** That ADR closes the set of permitted sidecar peers (`<artifact-stem>.<purpose>.<ext>`) and states that skills MUST NOT write arbitrary `<stem>.<x>.md` files outside the enumeration. Every design below adds at least one new peer shape, so the ADR amendment is a precondition, not a follow-up.

## Problem

`.review.md` and `.validate.md` are overwritten in place on every re-run, so per-attempt history is destroyed. Measured on this repo's corpus (2026-08-12): current review files show **0 BLOCK** verdicts, while git history contains **38 BLOCK verdicts across 24 spec files (~12%)**. The review gate demonstrably blocks; the evidence is being erased by the writer.

Consequences: rework cannot be measured, the review→revise→re-review loop cannot be analysed for convergence, and the 2026-05-19 retro's recommendation to make these artifacts append-only remains unimplemented.

## Behavioral Contract (draft — not yet reviewed)

### Behaviors

1. **When** a report is written for a spec that already has one at the canonical path **then** the existing report is preserved under a distinct name and the new report is written to the canonical path, so downstream gates that read only the canonical path are unaffected.
2. **When** N attempts have occurred **then** all N are recoverable from the filesystem without git archaeology.
3. **When** hygiene evaluates `VALIDATED_WITHOUT_REPORT` (owned by `measurement-integrity.spec.md`) **then** a preserved prior attempt counts as backing evidence, not only the canonical report.

## Design constraints carried over from the 2026-08-12 review

These are the rotation-specific findings from `measurement-integrity.review.md`. They are recorded here so the split does not lose them; each must be resolved before this spec passes review.

| Origin | Constraint |
|---|---|
| SA-1 (blocker) | ADR-0012 closes the sidecar peer set and mandates a three-segment `<stem>.<purpose>.<ext>` shape. A four-segment rotated name violates both. The ADR amendment must enumerate the new peers, their naming shape, and the revised lifecycle of the two canonical peers. |
| SA-3 | Rotate-then-write leaves the canonical path absent during the write window. The spec must state which path is authoritative during rotation and what a reader observing an absent canonical path must conclude. |
| SA-4 | `<rev>` is undefined against two existing vocabularies: the spec frontmatter `revision:` field, and the `revision` field on lifecycle events. If rotation reuses the spec revision, two attempts at one revision collide and the collision path becomes the normal path. |
| CON-3 | `rev` is an occupied token in this corpus (`spec-amendment-artifacts.spec.md` owns `-rev-<target>-<descriptor>`; `review-block-auto-retry.spec.md` bumps `revision:` per retry). Prefer `<attempt>` or a sibling directory, and state the relationship to `revision:` explicitly. |
| CON-4 | `.blockers.md` is treated as an inseparable pair with `.review.md` by `review-block-auto-retry.spec.md`, and `lib/specify-revise.mjs` clears it every attempt. Excluding it from preservation defeats the loop that most needs per-attempt history (partitioning blockers into addressed / persistent / new). Either include it or state the exclusion and why. |
| CON-5 | No discovery helper exists for preserved reports. `lib/reality-check.mjs:323-348` derives report paths by regex, canonical-only. `spec-file-suffixes.spec.md` mandates positive globs that deliberately do not match rotated names, and `incremental-artifact-writes.spec.md` establishes scanner-invisibility as a load-bearing invariant requiring a regression test. |
| SEC-3 | No retention bound. With the auto-retry loop, each blocked spec accumulates reports indefinitely. Collision resolution ("pick next free index") is an unbounded probe. The rotation target derives from a CLI argument and needs `assertWithin(projectRoot, target)` before any rename. |
| SEC-4 | Retention goes from one report to N, so a secret appearing in an early attempt persists rather than being overwritten. Report bodies should pass through the same redaction set `lib/blockers-writer.mjs` applies, and preserved files should inherit the canonical report's permissions. |
| SA-2 | The real writer is `lib/cli/artifact.mjs:41-42` (closed `type → suffix` map, `.tmp`+rename commit), not skill prose. Rotation logic belongs there — putting control flow in SKILL.md would violate the constitution's cli-driver-surface rule. Also affected: `lib/reality-check.mjs`, `lib/specify-revise.mjs:20`. |

## Open design questions

1. Rotation vs. an append-only single file vs. a sibling `history/` directory — the ADR amendment scope differs sharply between these, and only the first necessarily adds peer filenames.
2. Whether preservation applies to `.blockers.md` (see CON-4).
3. Retention policy: keep-N, age-based, or unbounded with gitignore.

## Acceptance Criteria

- [ ] ADR-0012 amended (or a follow-on ADR accepted) before this spec enters review
- [ ] Every constraint in the table above is resolved in the spec text
- [ ] Re-running a report leaves all attempts recoverable, latest at the canonical path
- [ ] A regression test asserts preserved reports stay invisible to the positive globs in `spec-file-suffixes.spec.md`
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
