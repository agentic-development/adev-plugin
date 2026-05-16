/**
 * Tier-1 producer: `adev/event-schema-valid`.
 *
 * Validates a lifecycle event payload against the closed-discriminator /
 * open-per-type-shape schema declared in `lib/diagnostics/event-schemas.mjs`.
 *
 * Behavior (per `diagnostic-registry.spec.md` rev 2 Behavior 7):
 *
 *   1. The event MUST be a non-null object with a string `event`
 *      discriminator. Otherwise the producer fires with severity `error`.
 *   2. The `event` discriminator MUST be one of `KNOWN_EVENT_TYPES`.
 *      Otherwise the producer fires with severity `error` and lists the
 *      legal set in the message.
 *   3. For each known discriminator, all `REQUIRED_FIELDS_BY_EVENT[type]`
 *      fields MUST be present (presence-only check — primitive-type
 *      assertions live alongside required-field assertions but only
 *      against the discriminator field; for other fields, we trust the
 *      writer's type because per-type type checks would couple this
 *      producer to every emitter shape, contradicting "open per-type
 *      shape" / "extra fields permitted").
 *   4. Extra fields beyond the required set are silently accepted.
 *
 * If no event is supplied (`ctx.event == null`), the runner returns
 * `{ fired: false }` — the producer is a no-op outside the write-time
 * hook context. On-demand `adev diagnose --tier 1` callers can still
 * exercise it by passing an event explicitly.
 *
 * @module lib/diagnostics/tier1/event-schema-valid
 */

import {
  KNOWN_EVENT_TYPES,
  REQUIRED_FIELDS_BY_EVENT,
  isKnownEventType,
} from '../event-schemas.mjs';

const DIAGNOSTIC_ID = 'adev/event-schema-valid';
const SEVERITY = 'error';

/**
 * Run the event-schema-valid producer.
 *
 * @param {object} ctx
 * @param {object} [ctx.event] - The lifecycle event payload to validate.
 *   When absent, the producer is a no-op (returns `{ fired: false }`).
 * @returns {{ fired: boolean, id?: string, severity?: string, message?: string }}
 */
export function run(ctx) {
  const event = ctx?.event;
  if (event == null) return { fired: false };

  // Discriminator presence + shape.
  if (typeof event !== 'object' || Array.isArray(event)) {
    return {
      fired: true,
      id: DIAGNOSTIC_ID,
      severity: SEVERITY,
      message: `event must be a non-null object (got ${event === null ? 'null' : Array.isArray(event) ? 'array' : typeof event})`,
    };
  }
  if (typeof event.event !== 'string' || event.event.length === 0) {
    return {
      fired: true,
      id: DIAGNOSTIC_ID,
      severity: SEVERITY,
      message: `event.event must be a non-empty string discriminator`,
    };
  }

  // Closed-discriminator check (rev 2 Behavior 7 first bullet).
  if (!isKnownEventType(event.event)) {
    return {
      fired: true,
      id: DIAGNOSTIC_ID,
      severity: SEVERITY,
      message: `unknown event type: ${JSON.stringify(event.event)} (expected one of: ${[...KNOWN_EVENT_TYPES].join(', ')})`,
    };
  }

  // Open per-type shape: only required fields are checked. Extras pass through.
  const required = REQUIRED_FIELDS_BY_EVENT[event.event];
  const missing = [];
  for (const field of required) {
    // The discriminator itself is in `required`; we already validated it.
    if (field === 'event') continue;
    // `ts` is universal: check it's a non-empty string.
    if (field === 'ts') {
      if (typeof event.ts !== 'string' || event.ts.length === 0) missing.push('ts');
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(event, field) || event[field] == null) {
      missing.push(field);
    }
  }
  if (missing.length > 0) {
    return {
      fired: true,
      id: DIAGNOSTIC_ID,
      severity: SEVERITY,
      message: `event "${event.event}" missing required field(s): ${missing.join(', ')}`,
    };
  }

  return { fired: false };
}
