---
spec: .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
last-reviewed-revision: 1
file-sha: d79c958a627f94278be4816e8c162095a1de67aaba40ff7202909389ded0d3a5
verdict: PASS_WITH_NOTES
reviewed: 2026-05-19
---

# Architecture Review: review-block-auto-retry

> **Date:** 2026-05-19
> **Spec:** .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
> **Charter:** cross-cutting (affects: agent-reliable-state-artifacts, spec-lifecycle, strategic-planning)
> **Verdict:** PASS_WITH_NOTES

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

### SA-1 — Patch-vs-rewrite contract lacks blocker-to-section mapping

- **Severity:** warning
- **Location:** Behavior 1 + Acceptance Criteria bullet 2
- **Finding:** Behavior 1 mandates that `/adev:specify --revise` produces a "TARGETED patch addressing each blocker (preserving frontmatter fields not implicated by blockers, preserving spec body sections not implicated by blockers)". The acceptance criterion further requires that "frontmatter fields not implicated by blockers are preserved byte-identically; non-blocked body sections are preserved byte-identically." However, the spec does not define how an implementation determines which sections are "implicated" by a given blocker — `<spec-section-anchor>` appears in the `blocker_id` location-hash algorithm (Behavior 3) but the spec doesn't surface this anchor in the `.blockers.md` writer schema, nor does it specify whether `<spec-section-anchor>` is the H2/H3 heading slug, an explicit anchor, or something else.
- **Recommendation:** Add a Behavior or Postcondition documenting that each blocker entry in `.blockers.md` carries the `<spec-section-anchor>` it implicates (or "frontmatter:<field-name>" for frontmatter blockers), so the revise workflow has a deterministic mapping. Without this, the byte-identical-preservation acceptance criterion is unverifiable.

### SA-2 — `byRevision` projection requires lockstep amendment to lifecycle-event-log.spec.md

- **Severity:** warning
- **Location:** Behavior 5 + Module Impact Map + Acceptance Criteria
- **Finding:** Behavior 5 introduces `state.steps.<step>.byRevision[N]` as a new projection field. `lifecycle-event-log.spec.md` (rev 2, validated) is the canonical owner of the StateProjection shape — its acceptance criteria explicitly enumerate the projection keys (`currentStep`, `currentTask`, `planTasks`, `startedAt`, `updatedAt`, `interventions`, `partialRecoveries`, `unknownEvents`) and assert "No snake_case keys on the projection." Adding `byRevision` is consistent with that convention, but lifecycle-event-log.spec.md will require a lockstep amendment to declare it canonical. The cross-cutting spec acknowledges this in the Module Impact Map ("`currentState()` exposes `state.steps.<step>.byRevision[N]`") but does not enumerate the paired amendment in the Acceptance Criteria. The precedent set by `incremental-artifact-writes.spec.md` (which lists "Paired amendment landed: lifecycle-event-log.spec.md is amended in lockstep…" as the first acceptance criterion) is not followed here.
- **Recommendation:** Add an acceptance criterion: "Paired amendment to `agent-reliable-state-artifacts/lifecycle-event-log.spec.md` adds `byRevision[N]` to the documented StateProjection shape and the optional `revision:` field to the canonical `reviewer_report` and `step_completed` event variants."

### SA-3 — Convergence detector module placement ambiguous

- **Severity:** suggestion
- **Location:** Integration Points + Actionable Task Map
- **Finding:** The Actionable Task Map names `lib/loop-convergence.mjs` as the convergence detector home and assigns it to the `strategic-planning` module. The Integration Points section places it in the same module. This is reasonable since `/adev:build` owns the loop. However, the partitioning logic (`addressed`/`persistent`/`new`) is a pure set operation over blocker IDs; placing it under `lib/` rather than embedded in `skills/build/` is correct. No structural concern — flagging only that the cross-charter ownership boundary should be made explicit: convergence is `strategic-planning`-owned, not `agent-reliable-state-artifacts`-owned, even though the per-revision events feeding it live in the latter charter's domain.
- **Recommendation:** Add a one-line note in the Module Impact Map row for `strategic-planning` clarifying that `lib/loop-convergence.mjs` is owned by `strategic-planning` so future readers don't conflate ownership with the event-schema module.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

### SEC-1 — Path containment for new `/adev:specify --revise` not explicitly stated

- **Severity:** warning
- **Category:** input-validation
- **Finding:** The spec introduces `/adev:specify --revise <spec>` as a new workflow axis. The accompanying CLI verb (likely `adev specify revise` per the `cli-driver-surface` cross-reference) will accept a user-controlled `<spec>` path. Sibling specs (`lifecycle-event-log.spec.md` SEC-1/SEC-4, `incremental-artifact-writes.spec.md` "Helper or CLI verb invoked with a path that escapes …") already mandate `assertWithin`/`resolveContained` path-containment defenses for every CLI verb taking a spec path. This cross-cutting spec does not re-assert that contract for `--revise`, even though it directly extends the same threat surface (path traversal via crafted spec filenames, symlink escape).
- **Recommendation:** Add an Error Case row: `--revise` invoked with a spec path that escapes `<projectRoot>` or fails the `[a-z0-9._-]+` slug allowlist → `INVALID_SPEC_PATH`. Reference the existing containment pattern in `lib/lifecycle-state.mjs`. OWASP CWE-22 mitigation parity with sibling specs.

### SEC-2 — `blocker_id` slug and finding-type input validation unspecified

- **Severity:** warning
- **Category:** input-validation
- **Finding:** Behavior 3 defines `blocker_id` as `<reviewer-slug>:<finding-type>:<location-hash>`. The `<location-hash>` is constrained (first 8 hex chars of SHA-256). The `<reviewer-slug>` and `<finding-type>` are not constrained. Reviewer subagents are LLM-generated; if a malicious or buggy reviewer emits a `finding-type` containing newlines, colons, control characters, or markdown injection payloads, the value flows into (a) lifecycle event payloads (potentially crossing the 4 KB `notes` cap silently), (b) the `<spec-stem>.blockers.md` sidecar (rendered as human-readable markdown), and (c) `/adev:specify --revise` prompt context. The cross-spec contract with `lifecycle-event-log.spec.md` already enforces `[a-z0-9._-]+` on slugs derived from spec filenames; the same discipline should apply to reviewer-emitted IDs.
- **Recommendation:** Constrain `<reviewer-slug>` and `<finding-type>` to `[a-z0-9-]+` (kebab-case, consistent with existing reviewer IDs like `structural-architect`). Reject malformed IDs at the loop entry with `INVALID_BLOCKER_ID` and fall through to the LEGACY_REVIEWER_OUTPUT path. Add to Error Cases table.

### SEC-3 — `.blockers.md` sidecar content sanitization contract not re-asserted

- **Severity:** suggestion
- **Category:** data-exposure
- **Finding:** The spec relies on reviewer output flowing into the `.blockers.md` sidecar. Existing `skills/review-specs/SKILL.md` Step 4 already mandates redaction of denylisted patterns (`.env*`, `*.pem`, `id_*`, etc.) and an 8 KiB truncation cap for adapter-parse failures. The cross-cutting spec doesn't re-assert that the same redaction + truncation discipline applies to the new `.blockers.md` writer, which now becomes a structured input to `/adev:specify --revise` (not just a human-read artifact as in the current 7e333fd behavior). A reviewer subagent that leaks credentials or file contents through its prose findings will land them in `.blockers.md`, which is then re-injected into the revise prompt.
- **Recommendation:** Add a one-line cross-reference: "Reviewer output flowing into `<spec-stem>.blockers.md` is sanitized at write time per existing `/adev:review-specs` Step 4 redaction set; the revise consumer trusts the sanitized sidecar, not raw reviewer output."

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

### CON-1 — Sibling spec `adev-build-skill.spec.md` rev 7 directly contradicts this spec

- **Severity:** warning
- **Category:** contract
- **This Spec:** Behaviors 6 and 10 reinstate the BLOCK→revise auto-retry loop, flip `build.max_review_retries` default 0 → 2, and remove the "max_review_retries > 0 → warn and behave as 0" guard.
- **Conflicts With:** `.context-index/specs/features/strategic-planning/adev-build-skill.spec.md` rev 7 (status: implemented, source-manifest computed 2026-05-05) Behaviors 17–18: "Auto-retry is not supported in this version because /adev:specify does not carry a revision workflow flag (issue-527 family); the broken --revise --blocker-context dispatch from prior versions has been removed" and "When `build.max_review_retries` is set to a value > 0 then the orchestrator emits a warning that the auto-retry pathway is reserved for a future enhancement and behaves as if the value were 0."
- **Recommendation:** The cross-cutting spec's Module Impact Map already lists `strategic-planning: High`. Strengthen this by adding an Acceptance Criterion: "`adev-build-skill.spec.md` is revised (rev 8+) to remove the Behaviors 17 (sidecar-only/no auto-retry) and 18 (max_review_retries warn-and-behave-as-0) paragraphs, replaced with the loop semantics defined in this cross-cutting spec." Otherwise downstream readers will see two specs of equal authority making opposite claims about the same orchestrator behavior.

### CON-2 — Event-field naming consistent; projection field naming consistent

- **Severity:** suggestion (positive confirmation)
- **Category:** naming
- **This Spec:** snake_case for event payload fields (`from_revision`, `to_revision`, `addressed_blocker_ids`, `unresolved_blocker_ids`), camelCase for projection field (`byRevision`), kebab-case for blocker_id slug components.
- **Conflicts With:** Nothing. Verified against `lifecycle-event-log.spec.md` CON-1 ("snake_case for event-discriminator names and event-only fields; camelCase for StateProjection fields"). Naming is consistent.
- **Recommendation:** No action — flagging only to document that the naming check was performed.

### CON-3 — Sidecar enumeration consistent with ADR-0012

- **Severity:** suggestion (positive confirmation)
- **Category:** pattern
- **This Spec:** Uses `<spec-stem>.review.md` and `<spec-stem>.blockers.md` as canonical sidecars; does not introduce new peers.
- **Conflicts With:** Nothing. Both peers are explicitly enumerated in ADR-0012 (`Accepted` status) and in the updated CON-8 of `plan-task-events.spec.md`. The spec correctly reuses the existing sidecar contract rather than inventing new artifact types.
- **Recommendation:** No action.

### CON-4 — `currentState()` projection extension consistent with rev 7 charter addition

- **Severity:** suggestion (positive confirmation)
- **Category:** contract
- **This Spec:** Behavior 5 introduces `state.steps.<step>.byRevision[N]`.
- **Conflicts With:** Nothing — `agent-reliable-state-artifacts/charter.md` rev 8 Capability Map row "Per-revision lifecycle event schema *(rev 7)*" explicitly references this cross-cutting spec ("specified (review-block-auto-retry.spec.md — cross-cutting)") and describes the same `state.steps.<step>.byRevision[N]` projection field. Charter and spec are aligned.
- **Recommendation:** No action. (See SA-2 above for the separate concern that lifecycle-event-log.spec.md itself needs a paired amendment in the acceptance criteria.)

---

## Summary

**Total findings:** 9 (0 blockers, 5 warnings, 4 suggestions)

- **Structural Architect:** PASS_WITH_NOTES (2 warnings, 1 suggestion) — Strong cross-charter design with clear behavior contract, loop semantics, and convergence stop conditions. Two contract gaps: blocker-to-section mapping unspecified (SA-1), lockstep amendment to lifecycle-event-log.spec.md not enumerated in acceptance criteria (SA-2).
- **Security Reviewer:** PASS_WITH_NOTES (2 warnings, 1 suggestion) — No new external attack surface beyond what sibling specs already address. Two gaps where contracts from sibling specs aren't re-asserted (path containment SEC-1, sidecar sanitization SEC-3); one new input-validation requirement (blocker_id slug allowlist SEC-2).
- **Consistency Analyzer:** PASS_WITH_NOTES (1 warning, 3 suggestions) — Naming, event variants, sidecar enumeration, and projection extension all consistent with sibling specs and the charter rev 8 addition. One conflict with `adev-build-skill.spec.md` rev 7 wording (CON-1) — this cross-cutting spec must be accompanied by a sibling spec revision to avoid two authoritative contracts contradicting each other.

**Cross-charter concerns flagged:** The spec touches three charters and the cross-cutting concerns are well-acknowledged in its Module Impact Map. The warnings above identify three lockstep amendments that should be promoted from "module impact" to "acceptance criteria" (lifecycle-event-log.spec.md projection field, adev-build-skill.spec.md behaviors 17-18 replacement, blocker-to-section mapping in `.blockers.md` writer schema) so that the cross-cutting spec doesn't ship without its dependent siblings being updated in the same change.

**Action required:** Verdict is PASS_WITH_NOTES — the spec is ready for `/adev:plan` to proceed. Warnings (SA-1, SA-2, SEC-1, SEC-2, CON-1) should be addressed either as inline edits to this spec (preferable for SA-1, SA-2, SEC-1, SEC-2 since they tighten this spec's own contract) or tracked as plan tasks that revise sibling specs in lockstep (preferable for CON-1 since it touches an external spec).

> **Governance footer:** Risk level `high` — risk policy requires HITL approval (`require_hitl_approval: true` in `.context-index/governance/risk-policies.yaml`). The spec-to-plan transition gate (if defined in `gates.yaml`) may require additional approver-role sign-off before `/adev:plan` proceeds.
