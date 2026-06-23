# Architecture Review: spec-amendment-artifacts

> **Date:** 2026-06-19
> **Spec:** .context-index/specs/cross-cutting/spec-amendment-artifacts.spec.md
> **Charter:** (none — cross-cutting spec, no parent charter)
> **Verdict:** PASS_WITH_NOTES

last-reviewed-revision: 1
file-sha: 43dbfea5c041dc89789159cb2f0a2989f0bb4425b6e0a2758781b0c5930930c8

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-capable (tier: reasoning) | plugin:review-specs/prompts/structural-architect.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable (tier: capable) | plugin:review-specs/prompts/security-reviewer.md |
| consistency-analyzer | Consistency Analyzer | subagent | read-only (tier: fast) | plugin:review-specs/prompts/consistency-analyzer.md |

> Governance note: `.context-index/governance/review.yaml` declares an empty
> reviewer list, so the three bundled defaults were dispatched. `risk_level:
> medium` ⇒ `require_review: true` (review not skippable). No `spec-to-plan`
> `approver_role` is configured in `gates.yaml`. No `.context-index/references/`
> directory present. No workspace detected and the spec carries no cross-repo
> `depends-on` references, so cross-repo validation was skipped.

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

The spec is structurally complete and architecturally sound. All canonical
sections are present (Preconditions, 10 Behaviors as When/Then, Postconditions,
a 7-row Error Cases table, System Constitution Reference, Module Impact Map,
Integration Points, Actionable Task Map, Acceptance Criteria) and mutually
consistent.

**Boundary-change handling (informational, not a finding):** The spec
deliberately touches two constitutional "Requires Human Approval" boundaries —
amending ADR-0009 (lifecycle artifact taxonomy) and adding `spec_amended` to
`CANONICAL_EVENTS`. These are surfaced explicitly in the System Constitution
Reference and Integration Points #3 as intentional, human-approved taxonomy
changes. This is the correct mechanism: a reviewed spec proposing the change
with the change recorded, rather than a silent addition. Verified against
source: `lib/kinds.mjs` holds exactly the closed 6-value `SPEC_KINDS` enum the
spec preserves; `lib/lifecycle-events.mjs` already contains a `spec_revised`
canonical event, establishing the naming/shape precedent for `spec_amended`;
`slugFromSpec` (lib/lifecycle-state.mjs:64-69) throws `INVALID_SPEC_PATH` for
non-`.spec.md` paths, matching the spec's claim that amendments keep the
extension and gain a lifecycle log unchanged.

**Design soundness:** Modeling amendment as an orthogonal `amends:` relationship
field rather than a 7th `kind:` value (Behavior #10, "Relationship to prior
decisions") is well-justified and mirrors the workflow-axis-vs-kind-axis
orthogonality already documented in ADR-0009's Consequences. Effective-revision
computation (Behavior #6) preserves base immutability while letting the
amendment carry the delta — sound. Cycle/chain (#9, `AMENDMENT_CYCLE`),
dangling (#7), and incomplete-link (#8) cases cover the graph-traversal edges.

**Findings:**

- **SA-1 (warning):** The `spec_amended` event payload is given as
  `{ amendment_slug, amendment_path, target_revision }`, and the Module Impact
  Map says "Add `spec_amended` to `CANONICAL_EVENTS` + its event schema," but
  the Behavioral Contract does not pin the schema's required/optional fields or
  the failure mode when a field is missing. `lib/lifecycle-state.mjs` performs
  per-event schema validation (membership gate at line 1351 plus per-discriminator
  checks); the spec should specify the `spec_amended` schema strictness (which
  fields are required, what error fires on a malformed event) so implementation
  does not silently choose. Completeness gap, not a design flaw.
- **SA-2 (warning):** Behavior #6 computes effective revision over "validated
  amendments," but the contract does not state how `/adev:status` treats
  amendments still in `review-pending` / `review-blocked` for the
  effective-revision number. Behavior #5 (relationship reporting regardless of
  status) partially resolves this, but the interaction of the two should be made
  explicit so status output is deterministic.
- **SA-3 (suggestion):** Consider stating whether the `spec_amended` event is
  idempotent if `adev specify amend` is re-run for the same base+descriptor
  (re-scaffold vs. abort), to keep the base log clean.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

No credential-handling, network, or supply-chain surface: amendments are spec
markdown, the `spec_amended` payload carries only slug/path/revision, and
Principle 1 (no new dependency) is honored in the Task Map. Path containment is
addressed via the `INVALID_SPEC_PATH` error case and the "path containment"
entry in the `lib/specify-amend.mjs` task, consistent with the existing
`slugFromSpec` `[a-z0-9._-]+` allowlist. Atomic write (task map) avoids
partial-file corruption.

**Findings:**

- **SEC-1 (warning):** The author-supplied `<descriptor>` is interpolated into a
  filesystem path (`<base-dir>/<base-stem>-rev-<target>-<descriptor>.spec.md`).
  The spec describes it as "a kebab-case slug" but does not pin descriptor
  validation/sanitization at scaffold time. A descriptor containing `../` or
  path separators would be a traversal vector; while the final path must still
  satisfy `slugFromSpec`'s allowlist downstream, the scaffolder should validate
  and reject a malformed descriptor up front (fail fast) with a dedicated error
  code, rather than relying on a later check. Recommend adding an explicit
  descriptor-sanitization behavior + error code to the Behavioral Contract.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

The spec is consistent with the governing decisions and repo conventions:

- **ADR-0009:** keeps the `kind:` enum closed at 6 (verified in `lib/kinds.mjs`),
  treats amendment as a relationship overlay, and intentionally rejects
  `--kind amendment` with the existing `INVALID_KIND` error — aligned with the
  ADR's "future kind additions require an ADR amendment" and orthogonal-workflow-
  axis framing.
- **`slugFromSpec`:** explicitly unchanged; amendments keep `.spec.md` — verified.
- **`CANONICAL_EVENTS`:** `spec_amended` parallels the existing `spec_revised` —
  naming convention consistent.
- **`--revise` vs `--amend`:** cleanly distinguished (in-place N→N+1 on a
  review-blocked spec clearing `.blockers.md`, vs. a new co-located artifact
  amending a shipped/validated base while keeping it immutable), with mutual
  exclusion via `CONFLICTING_FLAGS` — consistent with the review-block-auto-retry
  spec and the ADR-0009 workflow-flag model.
- **Constitution:** System Constitution Reference accurately maps Principle 1,
  Principle 2, the cli-driver-surface anti-pattern, and the human-approval
  boundary; Acceptance Criteria carry the no-inline-Node and
  logic-lives-in-`lib/specify-amend.mjs` constraints.
- **Frontmatter:** `kind: behavioral` with no `charter:` and an `affects:` list
  matches the existing cross-cutting spec convention (e.g.,
  review-block-auto-retry.spec.md).

**Findings:**

- **CON-1 (suggestion):** The dangling-amendment case is referred to both as the
  `DANGLING_AMENDMENT` error code (Error Cases table) and as a
  "dangling-amendment finding" in prose (Behavior #7, Postconditions). Reference
  the canonical code uniformly to avoid downstream string drift.

---

## Summary

**Total findings:** 5 (0 blockers, 3 warnings, 2 suggestions)
**Action required:** None blocking. The spec is ready for planning. The three
warnings (SA-1 event-schema field pinning, SA-2 effective-revision vs amendment
status, SEC-1 descriptor sanitization) are best addressed during `/adev:specify`
revision or captured as plan tasks, but do not gate the transition. Proceed to
`/adev:plan --spec .context-index/specs/cross-cutting/spec-amendment-artifacts.spec.md`,
optionally revising the spec first to fold in the warnings.
