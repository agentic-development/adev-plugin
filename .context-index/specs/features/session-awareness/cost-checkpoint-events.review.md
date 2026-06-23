# Architecture Review: cost-checkpoint-events

> **Date:** 2026-05-24
> **Spec:** .context-index/specs/features/session-awareness/cost-checkpoint-events.spec.md
> **Charter:** .context-index/specs/features/session-awareness/charter.md
> **Verdict:** PASS_WITH_NOTES

## Governance Note

This spec declares `risk_level: low`. Per `.context-index/governance/risk-policies.yaml`, low-risk specs have `require_review: false`. This review was explicitly requested by the pipeline caller; proceeding as instructed.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

### Findings

**SA-1 (suggestion):** The `aggregate()` function in `lib/cost-summary.mjs` returns `{ spec, issue_id, totals, checkpoints, model_breakdown, skipped_lines }` — it does not expose the resolved `since` cutoff as an ISO-8601 string in its return value. The spec's Behavior 3 example shows `"since": "<ISO-8601 cutoff>"` as a field in the emitted `cost_checkpoint` event. Behavior 2 correctly lists `since` as an optional field (not required by Tier-1 diagnostics). The CLI arm in `--from-summary` mode will need to independently resolve and capture the `since` ISO timestamp (from the equivalent of `defaultSinceFromReview()` or from the `opts.since` input) before calling `reportCostCheckpoint`. The spec does not explicitly describe this responsibility allocation — the implementer should either: (a) expose `since_iso` in `aggregate()`'s return value, or (b) document in the CLI arm that it captures the `since` cutoff before calling `aggregate()`. Either approach is valid; the omission is prose-level only, not a behavioral gap.

**SA-2 (suggestion):** The `aggregate()` function is async (returns `Promise<AggregateResult>`). The spec's API for `reportCostCheckpoint` mirrors `reportStep`'s synchronous contract. The CLI arm in `--from-summary` mode will therefore need `await aggregate(...)` before calling `reportCostCheckpoint`. This is the correct pattern (consistent with how the cost-summary CLI arm works today), but the spec does not mention the async boundary in Behavior 5's description. This is not a gap — the four-step process for adding events correctly routes the async concern to the CLI arm — but implementers should note it.

**SA-3 (suggestion):** Behavior 7's integration instruction says "immediately after the existing `adev build-state record` + ticker `adev cost summary` calls in `skills/build/SKILL.md` step 5/6." The current SKILL.md has step 5 as the build-state record and step 6 as the cost ticker. The new `adev report --type cost-checkpoint --from-summary` line should be added inside step 6, after the ticker calls but before step 7 (re-invoke). The spec's prose is unambiguous but the "step 5/6" reference may cause confusion since the new line is step-6-scoped, not step-5-scoped. Suggest clarifying as "add after the ticker calls in step 6."

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

### Findings

**SEC-1 (suggestion):** The spec specifies path containment for `--spec` (error table row: "Spec path escapes project root → exit 1 `INVALID_SPEC_PATH`"). This is correctly aligned with the existing `resolveContained()` helper in `lib/cli/report.mjs`. The `--totals-json` input validation requires rejection of non-finite-number fields — the spec says "rejecting non-object or non-finite-number fields" but does not specify whether this check is recursive (all nested numeric fields) or top-level only. Given the flat `totals` schema (all fields are top-level numeric), top-level-only is sufficient. The implementer should document this scope in the validation code to prevent scope creep. This is a suggestion, not a gap.

**SEC-2 (suggestion):** The `--totals-json` input path accepts arbitrary JSON from the CLI. The spec correctly requires the parsed value to be an object (not array, not string). It also requires rejection of non-finite numbers. The spec does not explicitly bound the size of the `--totals-json` payload. Given that existing `adev report` arms accept `--notes` strings without explicit size bounds (the lib caps at 4 KB via `NOTES_TRUNCATED`), the `totals` object should similarly be subject to `appendEvent`'s existing `EVENT_TOO_LARGE` cap (1 MB). This is automatically enforced by the existing `appendEvent` implementation and requires no spec change — noting for implementer awareness.

No SEC-3 violations: the `cost_checkpoint` event payload contains only token counts and USD values — no sensitive data, no file contents, no stack traces.

No new external dependencies introduced. Constitutional compliance confirmed.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

### Findings

**CON-1 (suggestion):** Behavior 5's explanatory parenthetical reads: "calls `aggregate({ projectRoot, specPath: spec, since: undefined })`". The parameter name `spec` in the object literal should be `specPath: spec` — this is actually what the spec text says. However, the `aggregate()` function's actual parameter is `opts.specPath`, and the spec's own API reference for `adev cost summary --from-summary` (Behavior 5) uses `specPath` consistently elsewhere. The call shape is correct; no action needed. This is a trivial inconsistency (the `spec` local variable name vs `specPath` key name) that is self-consistent in context.

**CON-2 (suggestion):** The Acceptance Criteria entry "`.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` canonical-events table includes the new discriminator" correctly calls for a cross-spec update. This is the fourth step of the four-step process documented in `lib/diagnostics/event-schemas.mjs`. The Module Impact Map flags this as `Documentation | Append the new discriminator to the canonical-events table`. This cross-spec update dependency is not reflected in the spec's `depends-on` frontmatter (the frontmatter has no `depends-on` field). Consider adding `depends-on: [.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md]` to make this dependency machine-readable. Low-priority suggestion — the prose of the Module Impact Map and Acceptance Criteria adequately communicates the dependency.

**CON-3 (suggestion):** The `REQUIRED_FIELDS_BY_EVENT.cost_checkpoint` entry listed in Behavior 2 is `['event', 'ts', 'step', 'totals']`. This correctly follows the `[...UNIVERSAL_REQUIRED, 'step', 'totals']` pattern (where `UNIVERSAL_REQUIRED = ['event', 'ts']`). The pattern is consistent with all other entries in `event-schemas.mjs`. One minor note: `UNIVERSAL_REQUIRED` is a module-internal constant; the spec correctly enumerates the expanded form. No inconsistency.

---

## Summary

**Total findings:** 6 (0 blockers, 0 warnings, 6 suggestions)
**Action required:** None required before planning. The spec is well-structured, behaviourally complete, and consistent with existing patterns. The six suggestions are informational notes for the implementer:

- SA-1: Clarify where `since` ISO value is captured in `--from-summary` mode (not surfaced by `aggregate()` return)
- SA-2: Note the `async` boundary between `aggregate()` and synchronous `reportCostCheckpoint`
- SA-3: Clarify that the new CLI line belongs inside step 6 (not step 5) of the SKILL.md
- SEC-1: Scope the non-finite-number validation to top-level fields only in `totals`
- SEC-2: Implementer-awareness note: `EVENT_TOO_LARGE` (1 MB) already bounds `--totals-json` via `appendEvent`
- CON-2: Optional: add `depends-on` frontmatter entry for the `lifecycle-event-log.spec.md` cross-spec update dependency

last-reviewed-revision: 1
file-sha: 9f617448ca195630117fec1215336c4877c7e43f9909c264d170b4225e68dd0d
