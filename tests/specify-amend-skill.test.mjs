// tests/specify-amend-skill.test.mjs
//
// Task 5 of spec-amendment-artifacts.plan.md — /adev:specify --amend skill surface.
//
// Asserts the SKILL.md gains a markdown-only --amend workflow axis that names
// the CLI verb `adev specify amend` and contains NO inline-Node directive
// (AC 8). The repository-wide inline-Node guard (tests/skills-no-inline-node)
// enforces the negative invariant globally; this test pins the positive
// presence of the amend axis.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL = resolve(__dirname, '..', 'skills', 'specify', 'SKILL.md');

const FORBIDDEN_INLINE_NODE = /Run inline Node|node\s+--input-type=module\s+-e|node\s+-e/;

test('specify SKILL.md has an --amend arguments-table row', () => {
  const text = readFileSync(SKILL, 'utf8');
  assert.match(text, /\|\s*`--amend <base-spec>`\s*\|/,
    'arguments table must document the --amend <base-spec> flag');
});

test('specify SKILL.md has an Amend Mode section naming `adev specify amend`', () => {
  const text = readFileSync(SKILL, 'utf8');
  assert.match(text, /##\s+Amend Mode \(`--amend <base-spec>`\)/,
    'must have a "## Amend Mode (`--amend <base-spec>`)" section');
  // Section must name the CLI verb.
  const idx = text.indexOf('## Amend Mode');
  const section = text.slice(idx);
  assert.match(section, /adev specify amend --spec/,
    'Amend Mode section must name the CLI verb `adev specify amend --spec ...`');
});

test('specify SKILL.md states --amend mutual-exclusion', () => {
  const text = readFileSync(SKILL, 'utf8');
  assert.match(text, /`--amend`[^]*mutually exclusive[^]*--revise/,
    'must state --amend is mutually exclusive with the other workflow flags');
});

test('specify SKILL.md contains no inline-Node directive (AC 8)', () => {
  const text = readFileSync(SKILL, 'utf8');
  assert.equal(FORBIDDEN_INLINE_NODE.test(text), false,
    'SKILL.md must contain no inline-Node directive');
});
