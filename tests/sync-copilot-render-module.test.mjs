import test from 'node:test';
import assert from 'node:assert/strict';
import { renderModuleInstruction } from '../lib/sync/copilot.mjs';

const charterHappy = [
  '## Business Intent',
  '',
  'CLI module provides command-line entry points.',
  '',
  '## Scope',
  '',
  '### In Scope',
  '',
  '- Routing CLI verbs',
  '- Argument parsing',
  '',
  '### Out of Scope',
  '',
  '- Hooks',
  '',
].join('\n');

test('valid module emits double-quoted applyTo scalar', () => {
  const module = { slug: 'cli', name: 'CLI', paths: ['cli/', 'lib/cli/'] };
  const result = renderModuleInstruction(module, charterHappy);
  assert.equal(typeof result, 'object');
  assert.equal(typeof result.body, 'string');
  assert.match(result.body, /^applyTo: "cli\/,lib\/cli\/"$/m);
  assert.ok(result.body.includes('CLI module provides command-line entry points.'));
  assert.ok(result.body.includes('- Routing CLI verbs'));
  assert.deepEqual(result.warnings, []);
});

test('frontmatter is well-formed YAML with applyTo and description', () => {
  const module = { slug: 'cli', name: 'CLI', paths: ['cli/'] };
  const { body } = renderModuleInstruction(module, charterHappy);
  // First line opens YAML frontmatter
  assert.ok(body.startsWith('---\n'));
  // applyTo present as double-quoted scalar
  assert.match(body, /^applyTo: "cli\/"$/m);
  // description present
  assert.match(body, /^description: .+$/m);
  // frontmatter closes before body
  const lines = body.split('\n');
  assert.equal(lines[0], '---');
  const closingIdx = lines.indexOf('---', 1);
  assert.ok(closingIdx > 0, 'closing --- present');
});

test('empty paths fall back to "**" with SYNC_PATHS_EMPTY warning', () => {
  const module = { slug: 'cli', name: 'CLI', paths: [] };
  const result = renderModuleInstruction(module, charterHappy);
  assert.match(result.body, /^applyTo: "\*\*"$/m);
  assert.ok(result.warnings.some((w) => w.startsWith('SYNC_PATHS_EMPTY:')));
});

test('uppercase slug rejected with INVALID_MODULE_SLUG', () => {
  const module = { slug: 'FooBar', name: 'X', paths: ['src/'] };
  assert.throws(
    () => renderModuleInstruction(module, charterHappy),
    /INVALID_MODULE_SLUG: FooBar/,
  );
});

test('slug with slash rejected with INVALID_MODULE_SLUG', () => {
  const module = { slug: 'foo/bar', name: 'X', paths: ['src/'] };
  assert.throws(
    () => renderModuleInstruction(module, charterHappy),
    /INVALID_MODULE_SLUG/,
  );
});

test('slug with ../escape rejected', () => {
  const module = { slug: '../escape', name: 'X', paths: ['src/'] };
  assert.throws(
    () => renderModuleInstruction(module, charterHappy),
    /INVALID_MODULE_SLUG/,
  );
});

test('empty slug rejected', () => {
  const module = { slug: '', name: 'X', paths: ['src/'] };
  assert.throws(
    () => renderModuleInstruction(module, charterHappy),
    /INVALID_MODULE_SLUG/,
  );
});

test('65-character slug rejected', () => {
  const slug = 'a'.repeat(65);
  const module = { slug, name: 'X', paths: ['src/'] };
  assert.throws(
    () => renderModuleInstruction(module, charterHappy),
    /INVALID_MODULE_SLUG/,
  );
});

test('64-character slug accepted', () => {
  const slug = 'a'.repeat(64);
  const module = { slug, name: 'X', paths: ['src/'] };
  assert.doesNotThrow(() => renderModuleInstruction(module, charterHappy));
});

test('newline in paths rejected with INVALID_MODULE_PATH', () => {
  const module = { slug: 'x', name: 'X', paths: ['src/\n---\ninjection: true'] };
  assert.throws(
    () => renderModuleInstruction(module, charterHappy),
    /INVALID_MODULE_PATH/,
  );
});

test('--- substring in paths rejected', () => {
  const module = { slug: 'x', name: 'X', paths: ['src/---/foo'] };
  assert.throws(
    () => renderModuleInstruction(module, charterHappy),
    /INVALID_MODULE_PATH/,
  );
});

test('unescaped single quote in path rejected', () => {
  const module = { slug: 'x', name: 'X', paths: ["src/'foo"] };
  assert.throws(
    () => renderModuleInstruction(module, charterHappy),
    /INVALID_MODULE_PATH/,
  );
});

test('missing Business Intent emits CHARTER_INCOMPLETE warning, returns null body', () => {
  const module = { slug: 'x', name: 'X', paths: ['src/'] };
  const charter = '## Scope\n\n### In Scope\n\n- a\n';
  const result = renderModuleInstruction(module, charter);
  assert.equal(result.body, null);
  assert.ok(result.warnings.some((w) => w.startsWith('CHARTER_INCOMPLETE:')));
});

test('missing In Scope emits CHARTER_INCOMPLETE warning', () => {
  const module = { slug: 'x', name: 'X', paths: ['src/'] };
  const charter = '## Business Intent\n\nFoo.\n\n## Scope\n\n### Out of Scope\n\n- bar\n';
  const result = renderModuleInstruction(module, charter);
  assert.equal(result.body, null);
  assert.ok(result.warnings.some((w) => w.startsWith('CHARTER_INCOMPLETE:')));
});

test('module name appears in description', () => {
  const module = { slug: 'cli', name: 'CLI', paths: ['cli/'] };
  const { body } = renderModuleInstruction(module, charterHappy);
  assert.match(body, /^description: .*CLI.*$/m);
});

test('multiple paths joined with commas in order', () => {
  const module = { slug: 'multi', name: 'Multi', paths: ['a/', 'b/', 'c/d/**'] };
  const { body } = renderModuleInstruction(module, charterHappy);
  assert.match(body, /^applyTo: "a\/,b\/,c\/d\/\*\*"$/m);
});
