import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { validateSkillNames } from '../lib/providers/copilot/skill-validator.mjs';

function makeFixture(skills) {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-skills-'));
  for (const [name, content] of Object.entries(skills)) {
    mkdirSync(path.join(dir, name), { recursive: true });
    writeFileSync(path.join(dir, name, 'SKILL.md'), content);
  }
  return dir;
}

test('adev-prefixed frontmatter passes when dirname matches name-without-prefix', () => {
  // Reflects the real adev skill convention: dir 'init', frontmatter 'name: adev:init'.
  const dir = makeFixture({ 'init': '---\nname: adev:init\n---\n# X\n' });
  assert.deepEqual(validateSkillNames(dir), ['init']);
  rmSync(dir, { recursive: true, force: true });
});

test('unprefixed frontmatter passes when dirname byte-equals name', () => {
  // Reflects skills/using-adev/SKILL.md: dir 'using-adev', frontmatter 'name: using-adev'.
  const dir = makeFixture({ 'using-adev': '---\nname: using-adev\n---\n# X\n' });
  assert.deepEqual(validateSkillNames(dir), ['using-adev']);
  rmSync(dir, { recursive: true, force: true });
});

test('SKILL.md without name frontmatter is skipped silently', () => {
  const dir = makeFixture({ 'standalone': '# Just a heading\n' });
  assert.deepEqual(validateSkillNames(dir), []);
  rmSync(dir, { recursive: true, force: true });
});

test('SKILL.md missing entirely is skipped silently', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-skills-'));
  mkdirSync(path.join(dir, 'no-skill-md'));
  assert.deepEqual(validateSkillNames(dir), []);
  rmSync(dir, { recursive: true, force: true });
});

test('non-directory entries (loose files) skipped without warning', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-skills-'));
  writeFileSync(path.join(dir, 'loose.txt'), 'ignore me');
  mkdirSync(path.join(dir, 'init'));
  writeFileSync(path.join(dir, 'init', 'SKILL.md'), '---\nname: adev:init\n---\n# X\n');
  assert.deepEqual(validateSkillNames(dir), ['init']);
  rmSync(dir, { recursive: true, force: true });
});

test('uppercase directory name rejected with INVALID_SKILL_NAME', () => {
  const dir = makeFixture({ 'Foo_Bar': '---\nname: Foo_Bar\n---\n# X\n' });
  assert.throws(() => validateSkillNames(dir), /INVALID_SKILL_NAME: Foo_Bar/);
  rmSync(dir, { recursive: true, force: true });
});

test('frontmatter name with uppercase rejected by regex even with adev: prefix', () => {
  const dir = makeFixture({ 'init': '---\nname: adev:Init\n---\n# X\n' });
  assert.throws(() => validateSkillNames(dir), /INVALID_SKILL_NAME/);
  rmSync(dir, { recursive: true, force: true });
});

test('prefix-stripped name mismatch rejected with SKILL_NAME_MISMATCH', () => {
  // Dir 'init', frontmatter 'adev:brainstorm' → strip → 'brainstorm' != 'init'.
  const dir = makeFixture({ 'init': '---\nname: adev:brainstorm\n---\n# X\n' });
  assert.throws(() => validateSkillNames(dir), /SKILL_NAME_MISMATCH: init vs brainstorm/);
  rmSync(dir, { recursive: true, force: true });
});

test('oversize frontmatter rejected with INVALID_SKILL_FRONTMATTER', () => {
  const huge = '---\nname: adev:init\ndescription: ' + 'A'.repeat(65 * 1024) + '\n---\n';
  const dir = makeFixture({ 'init': huge });
  assert.throws(() => validateSkillNames(dir), /INVALID_SKILL_FRONTMATTER/);
  rmSync(dir, { recursive: true, force: true });
});

test('non-ASCII bytes in frontmatter rejected with INVALID_SKILL_FRONTMATTER', () => {
  const dir = makeFixture({ 'init': '---\nname: adev:init\ndescription: "café"\n---\n' });
  assert.throws(() => validateSkillNames(dir), /INVALID_SKILL_FRONTMATTER/);
  rmSync(dir, { recursive: true, force: true });
});

test('multiple valid skills returned sorted', () => {
  const dir = makeFixture({
    'init': '---\nname: adev:init\n---\n# X\n',
    'brainstorm': '---\nname: adev:brainstorm\n---\n# X\n',
    'using-adev': '---\nname: using-adev\n---\n# X\n',
  });
  const result = validateSkillNames(dir);
  assert.deepEqual(result.sort(), ['brainstorm', 'init', 'using-adev']);
  rmSync(dir, { recursive: true, force: true });
});
