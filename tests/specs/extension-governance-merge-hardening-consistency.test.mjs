import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SPEC = '.context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md';
const text = readFileSync(SPEC, 'utf8');

test('no rev-3 exclusion prose survives', () => {
  for (const stale of [
    'cannot contribute an executable field at all',
    'deliberately absent from the `gates.yaml` row',
    'becomes non-writable by extensions entirely',
    'ships a `diagnostics.yaml` runner',
  ]) {
    assert.equal(text.includes(stale), false, `stale rev-3 claim still present: ${stale}`);
  }
});

test('every error code used is declared in the ADDED list', () => {
  const declared = new Set(/### ADDED[\s\S]*?- Error codes:([\s\S]*?)\n\n/.exec(text)[1]
    .match(/GOVERNANCE_[A-Z_]+|PATH_TRAVERSAL|UNKNOWN_GOVERNANCE_TARGET/g));
  const used = new Set(text.match(/GOVERNANCE_[A-Z_]+|PATH_TRAVERSAL|UNKNOWN_GOVERNANCE_TARGET/g));
  for (const code of used) assert.ok(declared.has(code), `undeclared error code: ${code}`);
  assert.equal(declared.size, 12);
});

test('MODIFIED names every file the implementation touches', () => {
  for (const f of [
    'lib/extensions/content-install.mjs',
    'lib/extensions/install.mjs',
    'lib/gates/doctor.mjs',
    'cli/index.mjs',
    'extensions/example-validation-check/adev-extension.yaml',
  ]) {
    assert.ok(text.includes(f), `MODIFIED omits ${f}`);
  }
});

test('decisions A and B are recorded with rationale', () => {
  assert.match(text, /\.context-index\/extensions\/<extension-name>\//);
  assert.match(text, /`dispatch: triggered`[^.]*refused|refused[^.]*`dispatch: triggered`/);
  assert.match(text, /`package\.args`[^.]*refused|refused[^.]*`package\.args`/);
});

test('revision is 5', () => {
  assert.match(text, /^revision: 5$/m);
});
