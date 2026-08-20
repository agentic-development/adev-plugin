// tests/lib/tracker-provider-registry.test.mjs
//
// Spec: .context-index/specs/features/autonomous-bugfix-loop/tracker-provider-bridge.spec.md
// Plan-task: 1, 2, 4
import { test } from 'node:test';
import assert from 'node:assert';

import { assertTrackerProviderShape } from '../../lib/provider/tracker-provider-interface.mjs';

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
