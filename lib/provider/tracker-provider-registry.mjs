/**
 * `TrackerProviderRegistry` — plain-map registry mapping a configured
 * provider name (`tasks.bugfix_loop.tracker_provider`, default `"github"`)
 * to its registered `TrackerProviderAdapter` implementation.
 *
 * Mirrors `lib/provider/registry.mjs`'s plain-map-and-lookup pattern
 * deliberately — NOT `lib/issues/registry.mjs`'s hardcoded if/else chain,
 * per the spec's own investigated Participants finding. A second provider
 * is added by implementing `TrackerProviderAdapter` and adding a map entry
 * here — no other participant changes.
 *
 * Unlike `lib/provider/registry.mjs::getProvider` (which falls back to
 * `claude-code` on a miss), `get()` here throws `UNKNOWN_TRACKER_PROVIDER`
 * on a miss — no silent fallback (Interaction Contract inbound step 1 /
 * outbound step 2: an unresolvable adapter degrades the turn exactly like
 * GitHub-unreachable, which requires the caller to observe the throw).
 *
 * Spec: .context-index/specs/features/autonomous-bugfix-loop/tracker-provider-bridge.spec.md
 * Plan-task: 2
 *
 * Pure Node.js built-ins only — no external dependencies (constitution
 * principle 1).
 *
 * @module lib/provider/tracker-provider-registry
 */

import { codedError as mkErr } from '../errors.mjs';
import { assertTrackerProviderShape } from './tracker-provider-interface.mjs';

/** @type {Record<string, import('./tracker-provider-interface.mjs').TrackerProviderAdapter>} */
export const trackerProviders = {};

/**
 * Register a `TrackerProviderAdapter` under a name. Validates the adapter's
 * shape before registering.
 *
 * @param {string} name
 * @param {object} adapter
 */
export function register(name, adapter) {
  assertTrackerProviderShape(adapter, name);
  trackerProviders[name] = adapter;
}

/**
 * Resolve a registered `TrackerProviderAdapter` by name. Throws
 * `UNKNOWN_TRACKER_PROVIDER` on a miss — never falls back silently.
 *
 * @param {string} name
 * @returns {object} the registered adapter
 */
export function get(name) {
  const adapter = trackerProviders[name];
  if (!adapter) {
    throw mkErr(
      'UNKNOWN_TRACKER_PROVIDER',
      `UNKNOWN_TRACKER_PROVIDER: "${name}" has no registered TrackerProviderAdapter. Registered: ${Object.keys(trackerProviders).join(', ') || '(none)'}`,
    );
  }
  return adapter;
}

/**
 * @returns {string[]} the names of all registered tracker providers
 */
export function getTrackerProviderNames() {
  return Object.keys(trackerProviders);
}

/**
 * Test-only escape hatch for registering a stub adapter. Production
 * registration is the `register('github', ...)` call below — exported
 * plainly (no env-gating) since this module has no other mutation surface
 * and `node:test` files are the only realistic caller outside this file's
 * own default registration.
 *
 * @param {string} name
 * @param {object} adapter
 */
export function registerForTest(name, adapter) {
  register(name, adapter);
}
