import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('templates/platform-context.yaml contains model_tiers section', () => {
  const content = readFileSync('templates/platform-context.yaml', 'utf-8');
  assert.ok(content.includes('model_tiers'));
});

test('templates/platform-context.yaml has fast, capable, reasoning keys under model_tiers', () => {
  const content = readFileSync('templates/platform-context.yaml', 'utf-8');
  assert.ok(content.includes('fast:'));
  assert.ok(content.includes('capable:'));
  assert.ok(content.includes('reasoning:'));
});

test('templates/platform-context.yaml model_tiers values are blank (not hardcoded model IDs)', () => {
  const content = readFileSync('templates/platform-context.yaml', 'utf-8');
  // Values should be blank (null or empty string), not specific model names
  const hardcoded = ['claude-sonnet', 'claude-opus', 'claude-haiku', 'gpt-4', 'gemini'];
  for (const model of hardcoded) {
    assert.ok(!content.includes(model), `Template must not hardcode model ID: ${model}`);
  }
});
