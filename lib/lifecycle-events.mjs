/**
 * Canonical event discriminator set — extracted to break the module cycle
 * between `lib/lifecycle-state.mjs` and `lib/diagnostics/tier1/*` runners
 * (write-time-diagnostic-hook.spec.md rev 2).
 *
 * Before this extraction the closed-discriminator constant lived in
 * `lib/lifecycle-state.mjs` and was imported by
 * `lib/diagnostics/event-schemas.mjs`. The write-time hook now wires the
 * Tier-1 runners back into `lib/lifecycle-state.mjs::appendEvent`, which
 * would close the dependency loop:
 *
 *   lifecycle-state → tier1/event-schema-valid → event-schemas → lifecycle-state
 *
 * ESM tolerates module cycles only when no side effects access the cycled
 * binding before its declaration runs. `event-schemas.mjs` spreads the set
 * at module-init time (`Object.freeze([...CANONICAL_EVENTS])`), which is
 * exactly the unsafe pattern. Pulling the constant into a leaf module
 * (this file) — depended on by both endpoints but depending on nothing —
 * eliminates the cycle entirely.
 *
 * `lib/lifecycle-state.mjs` re-exports `CANONICAL_EVENTS` for back-compat
 * with existing call sites.
 *
 * Zero external dependencies; zero internal imports.
 *
 * @module lib/lifecycle-events
 */

/**
 * Closed set of canonical event discriminators recognised by core projections.
 *
 * Events with an `event` value not in this set are still persisted on append
 * and surfaced under `StateProjection.unknownEvents[]` on read. Domains and
 * future skills may define new variants without forking this module.
 */
export const CANONICAL_EVENTS = new Set([
  'lifecycle_step', 'step_completed', 'step_failed',
  'reviewer_report', 'validator_report',
  'plan_task', 'debug_intervention', 'recovery_record', 'manual_override',
  // Ad-hoc non-step drift events emitted by lib/spec-drift.mjs.
  // See .context-index/specs/features/spec-drift-detection/jsonl-drift-events.spec.md
  // and the Canonical Event Variants table in
  // .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md (rev 3).
  'code_drift_detected', 'code_drift_cleared',
  // partial_recovery — owned by lifecycle-event-log.spec.md per the cross-spec
  // contract with incremental-artifact-writes.spec.md. Emitted via
  // `reportPartialRecovery()` in lib/lifecycle-state.mjs when a `.partial`
  // artifact is resumed, discarded, stolen, or aborted.
  'partial_recovery',
  // spec_revised — emitted by `/adev:specify --revise` when it bumps a spec
  // from revision N to N+1 after BLOCK. Payload carries the from/to revision
  // numbers and the canonical blocker_id sets that were addressed vs left
  // unresolved. See review-block-auto-retry.spec.md Behavior 2.
  'spec_revised',
  // spec_amended — emitted by `/adev:specify --amend` (via `adev specify amend`)
  // when an amendment artifact is scaffolded against an already-shipped
  // (validated) base spec. Written to the BASE spec's log (not the amendment's),
  // carrying the amendment slug, project-root-relative path, and the base
  // revision it targets. Amendment is a relationship overlay, NOT a 7th `kind:`
  // value (the closed `kind:` enum is unchanged — see ADR-0009).
  // [BOUNDARY: human-approved] Adding a canonical event touches the lifecycle
  // event schema governed by ADR-0009; confirmed intentional by review
  // (PASS_WITH_NOTES). See spec-amendment-artifacts.spec.md Behavior 4 & AC 3.
  'spec_amended',
  // human_approval_required — emitted by `/adev:build --full
  // --require-human-final-pass` when the auto-retry loop converges on PASS
  // and the human-final-pass gate is on. Halts the build for operator
  // acknowledgement. See review-block-auto-retry.spec.md Behavior 9.
  'human_approval_required',
  // test_depth_assigned — emitted by `adev test-policy resolve` (sole writer) when depth is
  // resolved for a plan task: chain -> escalation -> floor. Payload carries plan, task_id,
  // depth, source, escalated, escalation_skipped?, floor_applied, floor_legs, floor_inputs,
  // dimensions?. Carries no granularity (plan-time property, already in the plan's **Tests:**
  // fields) and no file paths. A task may accumulate multiple events; most recent (append
  // order) wins. [BOUNDARY: human-approved] Adding a canonical event touches the lifecycle
  // event schema governed by ADR-0009; confirmed intentional by review (PASS_WITH_NOTES).
  // See test-depth-policy.spec.md Behaviors 12-13.
  'test_depth_assigned',
  // review_round — emitted by `reportReviewRound()` in lib/lifecycle-state.mjs (sole writer),
  // one event per review stage per plan task, at task completion. Payload carries plan,
  // task_id, stage, cycles, findings?. Folded to `reviewRounds` keyed
  // `${plan}::${task_id}::${stage}`, last-wins.
  // Carries no verdict and no lifecycle position.
  // [BOUNDARY: human-approved] Adding a canonical event touches the lifecycle event schema
  // governed by ADR-0009; confirmed intentional by review (PASS_WITH_NOTES, revision 4).
  // See .context-index/specs/features/implementation/review-provenance.spec.md Output Contract B.
  'review_round',
  // review_depth_resolved — emitted by `reportReviewDepthResolved()` in
  // lib/lifecycle-state.mjs (sole writer), one event per (plan, task_id, pass)
  // when review depth is resolved: chain -> predicate-grant -> floor. Payload
  // carries plan, task_id, pass, depth, source, floor_applied, floor_legs.
  // Folded to `reviewDepthResolutions` keyed `${plan}::${task_id}::${pass}`,
  // last-wins.
  // [BOUNDARY: human-approved] Adding a canonical event touches the lifecycle event schema
  // governed by ADR-0009; confirmed intentional by review.
  'review_depth_resolved',
]);
