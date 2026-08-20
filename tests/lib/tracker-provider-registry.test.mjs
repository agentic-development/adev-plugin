// tests/lib/tracker-provider-registry.test.mjs
//
// Spec: .context-index/specs/features/autonomous-bugfix-loop/tracker-provider-bridge.spec.md
// Plan-task: 1, 2, 4
import { test } from 'node:test';
import assert from 'node:assert';

import { assertTrackerProviderShape } from '../../lib/provider/tracker-provider-interface.mjs';
import { get, registerForTest } from '../../lib/provider/tracker-provider-registry.mjs';

test('registry resolves "github" to the GitHub tracker adapter by default', () => {
  const adapter = get('github');
  assert.strictEqual(typeof adapter.gateCheck, 'function');
  assert.strictEqual(typeof adapter.fetchGated, 'function');
  assert.strictEqual(typeof adapter.postComment, 'function');
});

test('get() throws UNKNOWN_TRACKER_PROVIDER for an unregistered name, never falls back', () => {
  assert.throws(() => get('nonexistent-provider-xyz'), /UNKNOWN_TRACKER_PROVIDER/);
});

test('registerForTest lets a stub adapter be registered and resolved (test-only escape hatch)', () => {
  const stub = { gateCheck: async () => [], fetchGated: async () => ({}), postComment: async () => ({}) };
  registerForTest('stub-provider', stub);
  assert.strictEqual(get('stub-provider'), stub);
});

test('assertTrackerProviderShape throws INVALID_TRACKER_PROVIDER_SHAPE when a method is missing', () => {
  assert.throws(
    () => assertTrackerProviderShape({ gateCheck: () => {}, fetchGated: () => {} }, 'stub'),
    /INVALID_TRACKER_PROVIDER_SHAPE/,
  );
});

test('assertTrackerProviderShape passes for a complete adapter', () => {
  assert.doesNotThrow(() =>
    assertTrackerProviderShape({ gateCheck: () => {}, fetchGated: () => {}, postComment: () => {} }, 'stub'),
  );
});
