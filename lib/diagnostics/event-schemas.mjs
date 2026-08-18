/**
 * Per-event-type required-field schemas consumed by the
 * `adev/event-schema-valid` Tier-1 diagnostic producer.
 *
 * This module is a **mechanical mirror** of the canonical event-log
 * contract maintained in two coordinated locations:
 *
 *   1. `.context-index/specs/features/agent-reliable-state-artifacts/
 *      lifecycle-event-log.spec.md` — the spec-level authority.
 *   2. `lib/lifecycle-events.mjs::CANONICAL_EVENTS` and the per-emitter
 *      payload shapes in `reportReviewer` / `reportValidator` /
 *      `reportStep` / `reportPlanTask` / `reportIntervention` — the
 *      code-level emitter authority.
 *
 * Per `diagnostic-registry.spec.md` rev 2 amendment 12, if the two
 * authorities ever diverge, `lifecycle-event-log.spec.md` wins and
 * this module must be updated alongside it. Adding a new event type
 * is a four-step process: amend the lifecycle-event-log spec, extend
 * `CANONICAL_EVENTS` in `lib/lifecycle-events.mjs`, extend the maps
 * here, and add producer-test fixtures.
 *
 * **Reconciliation note** (rev 2 spec text vs code): Behavior 7 of
 * `diagnostic-registry.spec.md` enumerates six event types
 * (`step_started`, `step_completed`, `validator_report`,
 * `reviewer_report`, `status_change`, `plan_task`). The spec's own
 * amendment 12 designates `lifecycle-event-log.spec.md` (mirrored by
 * `CANONICAL_EVENTS`) as the authoritative list. The code-level
 * authority is `CANONICAL_EVENTS` in `lib/lifecycle-events.mjs`, from
 * which `KNOWN_EVENT_TYPES` below is derived; it is not re-enumerated
 * here, because a hand-copied list rots on every variant addition.
 * It uses `lifecycle_step`, not `step_started`, and there is no
 * `status_change` discriminator in the emitter set at all; the spec's
 * six-item list reflects an authoring-time pre-finalization view.
 * This module follows the designated authority per amendment 12.
 *
 * Schema shape is "closed discriminator, open per-type fields":
 * - The discriminator (`event`) MUST be one of `KNOWN_EVENT_TYPES`.
 * - For each known type, only the listed required fields are asserted.
 *   Extra fields pass through and are not flagged.
 *
 * Zero external dependencies. Pure data + two thin accessors.
 *
 * @module lib/diagnostics/event-schemas
 */

// Read from the leaf module so the write-time-diagnostic-hook runner chain
// (lifecycle-state → tier1/* → event-schemas → lifecycle-events) does not
// form a cycle back through lifecycle-state.mjs. Functionally identical:
// lifecycle-state.mjs re-exports CANONICAL_EVENTS for back-compat.
import { CANONICAL_EVENTS } from '../lifecycle-events.mjs';

/**
 * The closed set of canonical event discriminators.
 *
 * Derived at module load time from `CANONICAL_EVENTS` in
 * `lib/lifecycle-events.mjs` so the two cannot drift. Frozen so callers
 * cannot mutate it; treat as `Readonly<string[]>`.
 *
 * @type {readonly string[]}
 */
export const KNOWN_EVENT_TYPES = Object.freeze([...CANONICAL_EVENTS]);

// Universal required fields — present on every event regardless of type.
// Every JSONL line in the lifecycle log carries the discriminator and the
// write-time-stamped timestamp.
const UNIVERSAL_REQUIRED = ['event', 'ts'];

/**
 * Per-discriminator required-field schemas.
 *
 * Each entry's value is a frozen array listing the fields that MUST be
 * present on an event with that discriminator. Field-shape checks
 * (primitive-type assertions) live in the producer runner that consumes
 * this schema — this module only declares which fields are required.
 *
 * Cross-references (code authority) — cited by function name, never by line
 * number: names stay greppable across edits, line ranges rot silently because
 * nothing validates them.
 *   - reviewer_report     → reportReviewer (lib/lifecycle-state.mjs)
 *   - validator_report    → reportValidator (lib/lifecycle-state.mjs)
 *   - lifecycle_step      → reportStep status=started (lib/lifecycle-state.mjs)
 *   - step_completed      → reportStep status=completed (lib/lifecycle-state.mjs)
 *   - step_failed         → reportStep status=failed (lib/lifecycle-state.mjs)
 *   - plan_task           → reportPlanTask (lib/lifecycle-state.mjs)
 *   - debug_intervention  → reportIntervention (lib/lifecycle-state.mjs)
 *   - recovery_record     → CANONICAL_EVENTS entry; no in-tree emitter yet
 *                           (only `event` + `ts` required for forward-compat)
 *   - manual_override     → CANONICAL_EVENTS entry; no in-tree emitter yet
 *   - review_round        → CANONICAL_EVENTS entry; no in-tree emitter yet
 *                           (planned sole writer: reportReviewRound in
 *                           lib/lifecycle-state.mjs)
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const REQUIRED_FIELDS_BY_EVENT = Object.freeze({
  // Actor events — stamp severity at write time per
  // lifecycle-event-log.spec.md AC ("severity stamped at write time").
  reviewer_report: Object.freeze([
    ...UNIVERSAL_REQUIRED,
    'step',
    'reviewer',
    'verdict',
    'severity',
  ]),
  validator_report: Object.freeze([
    ...UNIVERSAL_REQUIRED,
    'step',
    'validator',
    'verdict',
    'severity',
  ]),

  // Step-transition events (non-actor).
  lifecycle_step: Object.freeze([...UNIVERSAL_REQUIRED, 'step']),
  step_completed: Object.freeze([...UNIVERSAL_REQUIRED, 'step']),
  step_failed: Object.freeze([...UNIVERSAL_REQUIRED, 'step']),

  // Plan-task channel (canonical home of plan-task state per the contract
  // between lifecycle-event-log.spec.md and json-issue-board-adapter.spec.md).
  plan_task: Object.freeze([...UNIVERSAL_REQUIRED, 'plan', 'task_id', 'status']),

  // Debug / recovery / manual override channels.
  debug_intervention: Object.freeze([...UNIVERSAL_REQUIRED, 'kind', 'note']),
  recovery_record: Object.freeze([...UNIVERSAL_REQUIRED]),
  manual_override: Object.freeze([...UNIVERSAL_REQUIRED]),

  // Ad-hoc drift channels emitted by lib/spec-drift.mjs.
  // See .context-index/specs/features/spec-drift-detection/jsonl-drift-events.spec.md
  // - code_drift_detected: emitted by stampDrift; carries canonical project-root-relative
  //   drift_source and ISO-8601 drift_at.
  // - code_drift_cleared:  emitted by clearDrift; carries ISO-8601 drift_at only.
  code_drift_detected: Object.freeze([...UNIVERSAL_REQUIRED, 'drift_source', 'drift_at']),
  code_drift_cleared: Object.freeze([...UNIVERSAL_REQUIRED, 'drift_at']),

  // Partial-recovery channel (per incremental-artifact-writes.spec.md and the
  // paired amendment in lifecycle-event-log.spec.md). Emitted by
  // `reportPartialRecovery()` when a .partial artifact is resumed,
  // discarded, stolen, or aborted.
  partial_recovery: Object.freeze([
    ...UNIVERSAL_REQUIRED,
    'artifact_path',
    'prior_partial_ts',
    'action',
    'dispatch_mode',
  ]),

  // spec_revised — emitted by `/adev:specify --revise` when a BLOCKED spec
  // is bumped from rev N → N+1 with a targeted patch addressing the
  // reviewer's canonical blocker_id set. Payload (snake_case per CON-1):
  //   from_revision, to_revision         — integer revisions
  //   addressed_blocker_ids              — array of blocker_id strings (in rev N, absent from rev N+1)
  //   unresolved_blocker_ids             — array of blocker_id strings still present after revise
  // See review-block-auto-retry.spec.md Behaviors 1, 2.
  spec_revised: Object.freeze([
    ...UNIVERSAL_REQUIRED,
    'from_revision',
    'to_revision',
    'addressed_blocker_ids',
    'unresolved_blocker_ids',
  ]),

  // spec_amended — emitted by `/adev:specify --amend` (via `adev specify amend`)
  // when an amendment artifact is scaffolded against a shipped base spec. The
  // event is appended to the BASE spec's log. Payload (snake_case per CON-1),
  // SA-1 pinned required fields beyond the universal event+ts:
  //   amendment_slug   — kebab-case slug of the amendment file (string)
  //   amendment_path   — project-root-relative path to the amendment (string)
  //   target_revision  — integer ≥ 2; the base revision the amendment targets
  // No optional fields beyond pass-through. See spec-amendment-artifacts.spec.md
  // Behavior 4 & AC 3. [BOUNDARY: human-approved] — governed by ADR-0009.
  spec_amended: Object.freeze([
    ...UNIVERSAL_REQUIRED,
    'amendment_slug',
    'amendment_path',
    'target_revision',
  ]),

  // human_approval_required — emitted by `/adev:build --full
  // --require-human-final-pass` when the auto-retry loop converges on PASS
  // and the operator must acknowledge the final revision before plan/implement.
  // Payload:
  //   spec                              — spec path (project-root-relative)
  //   revision                          — integer revision at which PASS was reached
  //   reason                            — human-readable explanation
  // See review-block-auto-retry.spec.md Behavior 9.
  human_approval_required: Object.freeze([
    ...UNIVERSAL_REQUIRED,
    'spec',
    'revision',
    'reason',
  ]),

  // test_depth_assigned — emitted by `adev test-policy resolve` (sole writer) when depth is
  // resolved for a plan task. Payload carries plan, task_id, depth, source, escalated,
  // escalation_skipped?, floor_applied, floor_legs, floor_inputs, dimensions?; no granularity,
  // no file paths. See test-depth-policy.spec.md Behaviors 12-13, Interface Contract.
  // [BOUNDARY: human-approved] — governed by ADR-0009.
  test_depth_assigned: Object.freeze([
    ...UNIVERSAL_REQUIRED, 'plan', 'task_id', 'depth', 'source',
    'escalated', 'floor_applied', 'floor_legs', 'floor_inputs',
  ]),

  // review_round — to be emitted by reportReviewRound (lib/lifecycle-state.mjs), not yet in
  // tree. `findings` is optional and is REJECTED for the spec-compliance stage (no stable
  // finding-id convention at step 2f). See review-provenance.spec.md Output Contract B.
  // [BOUNDARY: human-approved] — governed by ADR-0009.
  review_round: Object.freeze([
    ...UNIVERSAL_REQUIRED, 'plan', 'task_id', 'stage', 'cycles',
  ]),

});

/**
 * Return the required-field list for `discriminator`, or `undefined` if
 * the discriminator is not one of `KNOWN_EVENT_TYPES`.
 *
 * @param {string} discriminator
 * @returns {readonly string[] | undefined}
 */
export function getRequiredFields(discriminator) {
  return REQUIRED_FIELDS_BY_EVENT[discriminator];
}

/**
 * Test whether `discriminator` is a recognised canonical event type.
 *
 * Returns `false` for typos (e.g. `step-completed` with a hyphen,
 * `validatorReport` in camelCase), non-strings, the empty string, and any
 * string outside the closed set.
 *
 * @param {unknown} discriminator
 * @returns {boolean}
 */
export function isKnownEventType(discriminator) {
  return typeof discriminator === 'string' && KNOWN_EVENT_TYPES.includes(discriminator);
}
