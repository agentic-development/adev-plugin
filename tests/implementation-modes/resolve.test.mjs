import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { IMPLEMENTATION_MODE_NAMES, DEFAULT_IMPLEMENTATION_MODE, IMPLEMENTATION_MODE_CONFIGS } from '../../lib/implementation-modes/constants.mjs';

describe('implementation-mode constants', () => {
  it('declares exactly the 3 modes from the charter', () => {
    assert.deepStrictEqual([...IMPLEMENTATION_MODE_NAMES].sort(), ['agent-default', 'tdd', 'test-required']);
  });

  it('defaults to tdd for full backward compatibility', () => {
    assert.equal(DEFAULT_IMPLEMENTATION_MODE, 'tdd');
  });

  it('every mode config has exactly {dispatch_red, ordering_enforced, coverage_check}', () => {
    for (const name of IMPLEMENTATION_MODE_NAMES) {
      const cfg = IMPLEMENTATION_MODE_CONFIGS.get(name);
      assert.deepStrictEqual(Object.keys(cfg).sort(), ['coverage_check', 'dispatch_red', 'ordering_enforced']);
    }
  });
});
