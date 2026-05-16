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
]);
