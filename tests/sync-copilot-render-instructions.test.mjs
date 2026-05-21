import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { renderCopilotInstructions } from '../lib/sync/copilot.mjs';

const fix = (name) =>
  readFileSync(new URL(`./sync-copilot-fixtures/${name}`, import.meta.url), 'utf8');

test('happy-path constitution renders ≤ 4000 UTF-8 bytes', () => {
  const c = fix('constitution-small.md');
  const result = renderCopilotInstructions(c);
  assert.equal(typeof result, 'object');
  assert.equal(typeof result.body, 'string');
  assert.ok(Buffer.byteLength(result.body, 'utf8') <= 4000);
  assert.deepEqual(result.droppedPrinciples, []);
  assert.deepEqual(result.warnings, []);
});

test('happy-path body contains Identity and Principles sections', () => {
  const c = fix('constitution-small.md');
  const { body } = renderCopilotInstructions(c);
  assert.ok(body.includes('## Identity'));
  assert.ok(body.includes('## Non-Negotiable Principles'));
  assert.ok(body.includes('First principle'));
  assert.ok(body.includes('Second principle'));
  // Must NOT include Coding Standards section
  assert.ok(!body.includes('## Coding Standards'));
});

test('SHA-256 pointer appended with 16-hex prefix', () => {
  const c = fix('constitution-small.md');
  const expected = createHash('sha256').update(c).digest('hex').slice(0, 16);
  const { body } = renderCopilotInstructions(c);
  assert.match(
    body,
    new RegExp(`<!-- Source: \\.context-index/constitution\\.md @ sha256:${expected}\\. Run /adev:sync to refresh\\. -->`),
  );
});

test('body has no YAML frontmatter', () => {
  const c = fix('constitution-small.md');
  const { body } = renderCopilotInstructions(c);
  assert.ok(!body.startsWith('---'));
});

test('overflow drops principles tail-first with in-file marker', () => {
  const c = fix('constitution-just-over.md');
  const result = renderCopilotInstructions(c);
  assert.ok(
    Buffer.byteLength(result.body, 'utf8') <= 4000,
    `body bytes = ${Buffer.byteLength(result.body, 'utf8')}`,
  );
  assert.match(result.body, /SYNC_OVERFLOW: principles .* dropped to fit 4,000-byte cap/);
  assert.ok(result.droppedPrinciples.length > 0);
  // Highest-numbered principle is dropped first
  const dropped = result.droppedPrinciples;
  for (let i = 1; i < dropped.length; i += 1) {
    assert.ok(dropped[i - 1] > dropped[i], 'dropped principles should be in tail-first order');
  }
  // Highest dropped > lowest dropped
  assert.equal(dropped[0], Math.max(...dropped));
  // A SYNC_OVERFLOW warning is emitted
  assert.ok(result.warnings.some((w) => w.startsWith('SYNC_OVERFLOW:')));
});

test('overflow marker appears after Identity, before remaining principles', () => {
  const c = fix('constitution-just-over.md');
  const { body } = renderCopilotInstructions(c);
  const identityIdx = body.indexOf('## Identity');
  const markerIdx = body.indexOf('SYNC_OVERFLOW: principles');
  const principlesIdx = body.indexOf('## Non-Negotiable Principles');
  assert.ok(identityIdx >= 0 && markerIdx >= 0 && principlesIdx >= 0);
  assert.ok(identityIdx < markerIdx, 'marker must come after Identity heading');
  assert.ok(markerIdx < principlesIdx, 'marker must come before Principles heading');
});

test('untruncatable Identity throws CONSTITUTION_TOO_LARGE', () => {
  const c = fix('constitution-identity-too-large.md');
  assert.throws(
    () => renderCopilotInstructions(c),
    /CONSTITUTION_TOO_LARGE/,
  );
});

test('multi-byte character counted in bytes, not chars', () => {
  const c = fix('constitution-multi-byte.md');
  const result = renderCopilotInstructions(c);
  assert.ok(Buffer.byteLength(result.body, 'utf8') <= 4000);
});

test('dangerous pattern rm -rf throws CONSTITUTION_DANGEROUS_PATTERN', () => {
  const c = fix('constitution-dangerous-rm-rf.md');
  assert.throws(
    () => renderCopilotInstructions(c),
    /CONSTITUTION_DANGEROUS_PATTERN/,
  );
});

test('dangerous pattern with allow-projection: true marker suppresses throw', () => {
  const c = fix('constitution-dangerous-rm-rf-allowed.md');
  assert.doesNotThrow(() => renderCopilotInstructions(c));
});

test('dangerous pattern --no-verify is detected', () => {
  const body = [
    '## Identity',
    '',
    'X',
    '',
    '## Non-Negotiable Principles',
    '',
    '1. **Avoid** — do not use --no-verify on commits.',
  ].join('\n');
  assert.throws(
    () => renderCopilotInstructions(body),
    /CONSTITUTION_DANGEROUS_PATTERN/,
  );
});

test('dangerous pattern --force push is detected', () => {
  const body = [
    '## Identity',
    '',
    'X',
    '',
    '## Non-Negotiable Principles',
    '',
    '1. **Avoid** — do not --force push to main.',
  ].join('\n');
  assert.throws(
    () => renderCopilotInstructions(body),
    /CONSTITUTION_DANGEROUS_PATTERN/,
  );
});

test('dangerous pattern chmod 777 is detected', () => {
  const body = [
    '## Identity',
    '',
    'X',
    '',
    '## Non-Negotiable Principles',
    '',
    '1. **Avoid** — never chmod 777 anything.',
  ].join('\n');
  assert.throws(
    () => renderCopilotInstructions(body),
    /CONSTITUTION_DANGEROUS_PATTERN/,
  );
});

test('dangerous pattern disable confirmation is detected', () => {
  const body = [
    '## Identity',
    '',
    'X',
    '',
    '## Non-Negotiable Principles',
    '',
    '1. **Avoid** — never disable confirmation prompts.',
  ].join('\n');
  assert.throws(
    () => renderCopilotInstructions(body),
    /CONSTITUTION_DANGEROUS_PATTERN/,
  );
});

test('missing Identity section throws CONSTITUTION_STRUCTURE_INVALID', () => {
  const body = [
    '# Constitution',
    '',
    '## Non-Negotiable Principles',
    '',
    '1. **X** — y.',
  ].join('\n');
  assert.throws(
    () => renderCopilotInstructions(body),
    /CONSTITUTION_STRUCTURE_INVALID.*Identity/,
  );
});

test('missing Non-Negotiable Principles section throws CONSTITUTION_STRUCTURE_INVALID', () => {
  const body = [
    '# Constitution',
    '',
    '## Identity',
    '',
    'X',
  ].join('\n');
  assert.throws(
    () => renderCopilotInstructions(body),
    /CONSTITUTION_STRUCTURE_INVALID.*Non-Negotiable Principles/,
  );
});

test('opt-out marker on preceding line also suppresses throw', () => {
  const body = [
    '## Identity',
    '',
    'X',
    '',
    '## Non-Negotiable Principles',
    '',
    '<!-- allow-projection: true -->',
    '1. **Note** — never run rm -rf in CI.',
  ].join('\n');
  assert.doesNotThrow(() => renderCopilotInstructions(body));
});

test('opt-out marker on same line also suppresses throw', () => {
  const body = [
    '## Identity',
    '',
    'X',
    '',
    '## Non-Negotiable Principles',
    '',
    '1. **Note** — never run rm -rf in CI. <!-- allow-projection: true -->',
  ].join('\n');
  assert.doesNotThrow(() => renderCopilotInstructions(body));
});
