/**
 * Tests for the post-validate heuristic-extraction hook.
 *
 * Spec: .context-index/specs/features/validation/check-set-restructure.spec.md
 * Plan-task: 4
 *
 * Verifies:
 *  - the new bash/mjs hook files exist
 *  - hooks.json registers the Stop event
 *  - the hook is non-blocking (exit 0 always)
 *  - input scoping (SEC-1): the mjs helper only consumes structured verdict
 *    metadata, never raw subprocess stdout/stderr
 */

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT } from '../helpers.mjs';

const SH = join(PLUGIN_ROOT, 'hooks/post-validate-extract-heuristics.sh');
const MJS = join(PLUGIN_ROOT, 'hooks/post-validate-extract-heuristics.mjs');
const HOOKS_JSON = join(PLUGIN_ROOT, 'hooks/hooks.json');

describe('Post-validate heuristic-extraction hook', () => {
  test("hook script file exists (+1 more contract assertions)", () => {
    // hook script file exists
    assert.ok(existsSync(SH), 'Missing post-validate-extract-heuristics.sh');

    // hook helper mjs file exists
    assert.ok(existsSync(MJS), 'Missing post-validate-extract-heuristics.mjs');
  });

  test('hooks.json registers the post-validate hook', () => {
    const hooks = JSON.parse(readFileSync(HOOKS_JSON, 'utf8'));
    const flattened = JSON.stringify(hooks);
    assert.ok(
      flattened.includes('post-validate-extract-heuristics'),
      'hooks.json must register the post-validate hook'
    );
    // Must register under the Stop event (per spec ADDED section).
    assert.ok(
      hooks.hooks && hooks.hooks.Stop && Array.isArray(hooks.hooks.Stop),
      'hooks.json must declare a Stop event handler list'
    );
    const stopBlob = JSON.stringify(hooks.hooks.Stop);
    assert.ok(
      stopBlob.includes('post-validate-extract-heuristics'),
      'Stop handler list must include post-validate-extract-heuristics'
    );
  });

  test('hook script is non-blocking — never uses exit 2, always exits 0', () => {
    const script = readFileSync(SH, 'utf8');
    assert.ok(
      !/^\s*exit\s+2\b/m.test(script),
      'Hook must not use exit 2 (which would block the Stop event per hook protocol)'
    );
    assert.ok(/^\s*exit\s+0\b/m.test(script), 'Hook must exit 0 to be non-blocking');
  });

  test('SEC-1 input scoping: mjs helper does not read subprocess stdout/stderr', () => {
    const helper = readFileSync(MJS, 'utf8');
    // Helper must reference structured verdict metadata fields, not raw
    // subprocess output channels. The spec's SEC-1 fix forbids re-emitting
    // captured quality-gate subprocess output into the heuristic store.
    assert.ok(
      /verdict|check.?id|outcome/.test(helper),
      'Helper must reference structured verdict metadata fields'
    );
    // No reading of subprocess stdout/stderr fields from the validate result
    // (the hook receives only the structured verdict_metadata object).
    assert.ok(
      !/tool_result\s*\.\s*stdout|tool_result\s*\.\s*stderr/.test(helper),
      'Helper must not pull subprocess stdout/stderr from tool_result (SEC-1)'
    );
  });

  test('mjs helper writes failure audit trail to stderr/console.warn (SEC-2)', () => {
    const helper = readFileSync(MJS, 'utf8');
    assert.ok(
      /console\.warn|console\.error|stderr/.test(helper),
      'Helper must log failures to a non-stdout channel so validate verdict is unaffected'
    );
  });
});
