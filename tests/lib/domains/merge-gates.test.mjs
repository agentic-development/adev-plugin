import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mergeGates } from '../../../lib/domains/merge-gates.mjs';

describe('mergeGates', () => {
  it('should merge domain and governance gates by id', () => {
    const domain = { gates: [{ id: 'test', command: ['npm', 'test'] }] };
    const governance = { gates: [{ id: 'lint', command: ['npm', 'run', 'lint'] }] };
    const result = mergeGates(domain, governance);
    assert.equal(result.gates.length, 2);
  });

  it('should override domain gate when governance has same id with warning', () => {
    const domain = { gates: [{ id: 'test', command: ['npm', 'test'] }] };
    const governance = { gates: [{ id: 'test', command: ['npm', 'run', 'test:ci'] }] };
    const result = mergeGates(domain, governance);
    assert.equal(result.gates.length, 1);
    assert.deepEqual(result.gates[0].command, ['npm', 'run', 'test:ci']);
    assert.ok(result.warnings.some(w => w.message.includes('overrides domain gate')));
  });

  it('should skip entries missing id or command with INVALID_GATE', () => {
    const domain = { gates: [{ command: ['npm', 'test'] }, { id: 'test' }, { id: 'lint', command: ['eslint', '.'] }] };
    const result = mergeGates(domain, null);
    assert.equal(result.gates.length, 1);
    assert.ok(result.warnings.filter(w => w.code === 'INVALID_GATE').length >= 2);
  });

  it('should reject shell-form command strings with INVALID_GATE', () => {
    const domain = { gates: [{ id: 'test', command: 'npm test' }] };
    const result = mergeGates(domain, null);
    assert.equal(result.gates.length, 0);
    assert.ok(result.warnings.some(w => w.code === 'INVALID_GATE'));
  });

  it('should reject a non-string argv element with INVALID_GATE', () => {
    // The YAML parser coerces numerics, so `command: ["node", 8080]` reaches
    // here as a mixed array. Dropping it matches the shell-form precedent and
    // keeps `computeCommandSha` (which only accepts strings) off a value it
    // would have to throw on — a throw there aborts `adev domain load-gates`
    // and `adev gate doctor` for the whole project.
    const domain = { gates: [{ id: 'test', command: ['node', 8080] }] };
    const result = mergeGates(domain, null);
    assert.equal(result.gates.length, 0);
    assert.ok(result.warnings.some(w => w.code === 'INVALID_GATE' && /test/.test(w.message)));
  });

  it('should return new object, never mutate inputs', () => {
    const domain = Object.freeze({ gates: Object.freeze([Object.freeze({ id: 'test', command: Object.freeze(['npm', 'test']) })]) });
    assert.doesNotThrow(() => mergeGates(domain, null));
  });

  it('should preserve severity from domain overlay', () => {
    const domain = { gates: [{ id: 'test', command: ['npm', 'test'], severity: 'warning' }] };
    const result = mergeGates(domain, null);
    assert.equal(result.gates[0].severity, 'warning');
  });

  it('should handle null domain and null governance', () => {
    const result = mergeGates(null, null);
    assert.equal(result.gates.length, 0);
  });
});
