// Every reviewer prompt must ask for `finding_class` (and `remedy_ref` for
// `external`) on BLOCK findings. `lib/blockers-writer.mjs` defaults a missing
// `finding_class` to `defect`, so a prompt that never asks for it silently
// makes the loop's DECISION_REQUIRED / EXTERNAL_REMEDY branches unreachable —
// nothing fails, the classes just never occur.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { loadReviewConfig } from '../../lib/governance/review-config.mjs';
import { PLUGIN_ROOT } from '../helpers.mjs';

function assertDeclaresFindingClass(text, label) {
  const requiredIdx = text.search(/^### Required fields when severity is `blocker`\s*$/m);
  assert.ok(requiredIdx !== -1, `${label}: missing the "Required fields when severity is \`blocker\`" section`);
  const section = text.slice(requiredIdx).split(/^## /m)[0];
  assert.match(section, /^- \*\*`finding_class`:\*\*/m, `${label}: required-fields list does not declare finding_class`);
  assert.match(section, /^- \*\*`remedy_ref`:\*\*/m, `${label}: required-fields list does not declare remedy_ref`);
  for (const cls of ['defect', 'decision', 'external']) {
    assert.match(section, new RegExp(`^\\s+- \`${cls}\` — `, 'm'), `${label}: finding_class value \`${cls}\` is not defined`);
  }
}

test('every enabled reviewer in the project registry declares finding_class and remedy_ref', () => {
  const { reviewers, errors } = loadReviewConfig(PLUGIN_ROOT);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  const enabled = reviewers.filter((r) => r.enabled !== false && r.promptPath);
  assert.ok(enabled.length > 0, 'registry resolved no enabled prompt-based reviewers — assertion would be vacuous');
  for (const r of enabled) {
    assertDeclaresFindingClass(readFileSync(r.promptPath, 'utf8'), r.id);
  }
});

test('every bundled reviewer prompt, including disabled defaults and the quick-tier reviewer, declares the fields', () => {
  const dir = join(PLUGIN_ROOT, 'skills', 'review-specs');
  const prompts = readdirSync(dir).filter((f) => f.endsWith('-prompt.md'));
  assert.ok(prompts.includes('quick-synthesized-reviewer-prompt.md'));
  for (const f of prompts) {
    assertDeclaresFindingClass(readFileSync(join(dir, f), 'utf8'), f);
  }
});

for (const provider of ['codex', 'opencode']) {
  test(`${provider} mirror reviewer prompts declare the fields`, () => {
    const dir = join(PLUGIN_ROOT, 'providers', provider, 'skills', 'review-specs');
    const prompts = readdirSync(dir).filter((f) => f.endsWith('-prompt.md'));
    assert.ok(prompts.length > 0);
    for (const f of prompts) {
      assertDeclaresFindingClass(readFileSync(join(dir, f), 'utf8'), `${provider}/${f}`);
    }
  });
}
