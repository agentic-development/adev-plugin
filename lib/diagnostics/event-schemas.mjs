/**
 * Per-event-type required-field schemas consumed by the
 * `adev/event-schema-valid` Tier-1 diagnostic producer.
 *
 * This module is a **mechanical mirror** of the canonical event-log
 * contract maintained in two coordinated locations:
 *
 *   1. `.context-index/specs/features/agent-reliable-state-artifacts/
 *      lifecycle-event-log.spec.md` — the spec-level authority.
 *   2. `lib/lifecycle-state.mjs::CANONICAL_EVENTS` and the per-emitter
 *      payload shapes in `reportReviewer` / `reportValidator` /
 *      `reportStep` / `reportPlanTask` / `reportIntervention` — the
 *      code-level emitter authority.
 *
 * Per `diagnostic-registry.spec.md` rev 2 amendment 12, if the two
 * authorities ever diverge, `lifecycle-event-log.spec.md` wins and
 * this module must be updated alongside it. Adding a new event type
 * is a four-step process: amend the lifecycle-event-log spec, extend
 * `CANONICAL_EVENTS` in `lib/lifecycle-state.mjs`, extend the maps
 * here, and add producer-test fixtures.
 *
 * **Reconciliation note** (rev 2 spec text vs code): Behavior 7 of
 * `diagnostic-registry.spec.md` enumerates six event types
 * (`step_started`, `step_completed`, `validator_report`,
 * `reviewer_report`, `status_change`, `plan_task`). The spec's own
 * amendment 12 designates `lifecycle-event-log.spec.md` (mirrored by
 * `CANONICAL_EVENTS`) as the authoritative list. The code-level
 * authority lists nine discriminators — `lifecycle_step` (not
 * `step_started`), `step_completed`, `step_failed`, `reviewer_report`,
 * `validator_report`, `plan_task`, `debug_intervention`,
 * `recovery_record`, `manual_override`. There is no `status_change`
 * discriminator in the emitter set; the spec's six-item list reflects
 * an authoring-time pre-finalization view. This module follows the
 * designated authority (CANONICAL_EVENTS) per amendment 12.
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
 * `lib/lifecycle-state.mjs` so the two cannot drift. Frozen so callers
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
 * Cross-references (code authority):
 *   - reviewer_report     → reportReviewer (lib/lifecycle-state.mjs:434-441)
 *   - validator_report    → reportValidator (lib/lifecycle-state.mjs:473-484)
 *   - lifecycle_step      → reportStep status=started (lib:514-519)
 *   - step_completed      → reportStep status=completed (lib:514-519)
 *   - step_failed         → reportStep status=failed (lib:514-519)
 *   - plan_task           → reportPlanTask (lib:543-549)
 *   - debug_intervention  → reportIntervention (lib:567-571)
 *   - recovery_record     → CANONICAL_EVENTS entry; no in-tree emitter yet
 *                           (only `event` + `ts` required for forward-compat)
 *   - manual_override     → CANONICAL_EVENTS entry; no in-tree emitter yet
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

  // cost_checkpoint — emitted by `reportCostCheckpoint()` after each pipeline step.
  // Persists per-step token + USD totals for downstream cost queries.
  // Optional fields (not asserted by Tier-1 diagnostic): model_breakdown, since,
  // checkpoints, skipped_lines, spec_ref. See cost-checkpoint-events.spec.md.
  cost_checkpoint: Object.freeze([...UNIVERSAL_REQUIRED, 'step', 'totals']),
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
