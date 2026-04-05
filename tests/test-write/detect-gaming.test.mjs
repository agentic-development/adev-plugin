import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectGaming } from '../../skills/test-write/detect-gaming.mjs';

// Helper: run detector on inline content
async function scan(content) {
  return detectGaming([{ path: 'test.mjs', content }]);
}

test('flags toBeTruthy() as sole assertion — blocking', async () => {
  const violations = await scan(`
    test('x', () => {
      const result = doThing();
      expect(result).toBeTruthy();
    });
  `);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].type, 'vacuous-matcher');
  assert.equal(violations[0].severity, 'blocking');
  assert.ok(violations[0].line > 0);
});

test('flags toBeDefined() as sole assertion — blocking', async () => {
  const violations = await scan(`test('x', () => { expect(result).toBeDefined(); });`);
  assert.equal(violations.filter(v => v.type === 'vacuous-matcher').length, 1);
});

test('flags toBeGreaterThanOrEqual(0) — blocking', async () => {
  const violations = await scan(`test('x', () => { expect(count).toBeGreaterThanOrEqual(0); });`);
  assert.equal(violations.filter(v => v.severity === 'blocking').length, 1);
});

test('flags toBeGreaterThan(-1) — blocking', async () => {
  const violations = await scan(`test('x', () => { expect(count).toBeGreaterThan(-1); });`);
  assert.equal(violations.filter(v => v.severity === 'blocking').length, 1);
});

test('flags .skip( — blocking', async () => {
  const violations = await scan(`test.skip('x', () => { expect(1).toBe(1); });`);
  assert.equal(violations.filter(v => v.type === 'conditional-skip').length, 1);
});

test('flags xit( — blocking', async () => {
  const violations = await scan(`xit('x', () => { expect(1).toBe(1); });`);
  assert.ok(violations.some(v => v.severity === 'blocking'));
});

test('flags try { expect } without rethrow — blocking', async () => {
  const violations = await scan(`
    test('x', () => {
      try { expect(result).toBe(true); } catch(e) {}
    });
  `);
  assert.ok(violations.some(v => v.type === 'conditional-skip' && v.severity === 'blocking'));
});

test('flags if (x) { expect } without else — blocking', async () => {
  const violations = await scan(`
    test('x', () => {
      if (condition) { expect(result).toBe(true); }
    });
  `);
  assert.ok(violations.some(v => v.severity === 'blocking'));
});

test('flags .not.toThrow() as sole assertion — blocking', async () => {
  const violations = await scan(`test('x', () => { expect(() => fn()).not.toThrow(); });`);
  assert.ok(violations.some(v => v.severity === 'blocking'));
});

test('does not flag toEqual with specific expected value', async () => {
  const violations = await scan(`
    test('x', () => {
      expect(user).toEqual({ id: 1, name: 'Alice' });
    });
  `);
  assert.equal(violations.filter(v => v.severity === 'blocking').length, 0);
});

test('returns structured violation with file, line, matched text, severity', async () => {
  const violations = await detectGaming([{ path: 'src/test.mjs', content: `test('x', () => { expect(r).toBeTruthy(); });` }]);
  assert.ok(violations[0].file);
  assert.ok(violations[0].line >= 1);
  assert.ok(violations[0].matched);
  assert.ok(violations[0].severity);
  assert.ok(violations[0].type);
});

test('flags toMatchObject as advisory (not blocking)', async () => {
  const violations = await scan(`
    test('x', () => {
      expect(user).toMatchObject({ id: 1 });
    });
  `);
  const match = violations.find(v => v.type === 'weak-equality');
  assert.ok(match, 'expected a weak-equality violation');
  assert.equal(match.severity, 'advisory');
});

test('does not produce blocking violation for toMatchObject', async () => {
  const violations = await scan(`
    test('x', () => {
      expect(user).toMatchObject({ id: 1, name: 'Alice' });
    });
  `);
  assert.equal(violations.filter(v => v.severity === 'blocking').length, 0);
});

test('returns empty array for content with no violations', async () => {
  const violations = await scan(`
    test('x', () => {
      expect(add(2, 3)).toEqual(5);
    });
  `);
  assert.equal(violations.length, 0);
});

test('detects violations across multiple files', async () => {
  const violations = await detectGaming([
    { path: 'a.test.mjs', content: `test('x', () => { expect(r).toBeTruthy(); });` },
    { path: 'b.test.mjs', content: `test('y', () => { expect(count).toBeGreaterThanOrEqual(0); });` },
  ]);
  assert.equal(violations.filter(v => v.severity === 'blocking').length, 2);
  const files = violations.map(v => v.file);
  assert.ok(files.includes('a.test.mjs'));
  assert.ok(files.includes('b.test.mjs'));
});
