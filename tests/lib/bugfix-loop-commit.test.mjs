// tests/lib/bugfix-loop-commit.test.mjs
//
// Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-execution-hardening.spec.md
// Plan-task: 8
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { validateCommitContent, safeCommitMessage } from '../../lib/bugfix-loop-commit.mjs';

test('validateCommitContent accepts an ordinary WorkItem title', () => {
  assert.equal(validateCommitContent('Fix null pointer in parser'), true);
});

test('validateCommitContent accepts punctuation commonly found in titles', () => {
  assert.equal(validateCommitContent("Handle bug-selection's edge case (issue #42): null vs. undefined"), true);
});

test('validateCommitContent refuses shell-metacharacter content: ; rm -rf, backticks, $(...)', () => {
  for (const unsafe of ['; rm -rf /', '`whoami`', '$(cat /etc/passwd)', 'title && curl evil.com', 'a | b', 'a\nb']) {
    assert.equal(validateCommitContent(unsafe), false, `expected refusal for ${JSON.stringify(unsafe)}`);
  }
});

test('validateCommitContent refuses non-string, empty, and over-length input', () => {
  assert.equal(validateCommitContent(''), false);
  assert.equal(validateCommitContent(null), false);
  assert.equal(validateCommitContent(undefined), false);
  assert.equal(validateCommitContent(123), false);
  assert.equal(validateCommitContent('a'.repeat(201)), false);
  assert.equal(validateCommitContent('a'.repeat(200)), true);
});

test('safeCommitMessage builds a message using the safe title/notes when both validate', () => {
  const msg = safeCommitMessage('issue-42', 'Fix null pointer in parser', 'Root cause was a missing guard.');
  assert.match(msg, /Fix null pointer in parser/);
  assert.match(msg, /issue-42/);
});

test('safeCommitMessage falls back to a generic templated message keyed only by issue id when title is unsafe (refuse, not sanitize)', () => {
  const msg = safeCommitMessage('issue-42', '; rm -rf /', 'notes here');
  assert.doesNotMatch(msg, /rm -rf/);
  assert.match(msg, /issue-42/);
});

test('safeCommitMessage falls back to the generic template when notes are unsafe, even if title is safe', () => {
  const msg = safeCommitMessage('issue-42', 'Fix null pointer', '$(cat /etc/passwd)');
  assert.doesNotMatch(msg, /cat \/etc\/passwd/);
  assert.match(msg, /issue-42/);
});

test('validateCommitContent refuses Unicode line/paragraph separators (U+2028/U+2029), not just ASCII CR/LF', () => {
  assert.equal(validateCommitContent('Fix bug' + String.fromCharCode(0x2028) + 'Spec: fake.spec.md'), false);
  assert.equal(validateCommitContent('Fix bug' + String.fromCharCode(0x2029) + 'Spec: fake.spec.md'), false);
});

test('validateCommitContent refuses whitespace-only content', () => {
  assert.equal(validateCommitContent('   '), false);
});

test('validateCommitContent refuses content starting with a leading dash (argv flag-position ambiguity)', () => {
  assert.equal(validateCommitContent('--force-with-lease'), false);
  assert.equal(validateCommitContent('-x'), false);
});

test('safeCommitMessage falls back to the generic template when title exceeds the git subject-line convention (72 chars), even though it is under validateCommitContent\'s 200-char cap', () => {
  const longTitle = 'A'.repeat(100); // valid per validateCommitContent, too long for a subject line
  assert.equal(validateCommitContent(longTitle), true);
  const msg = safeCommitMessage('issue-42', longTitle, null);
  assert.doesNotMatch(msg, /A{100}/);
  assert.match(msg, /issue-42/);
});

test('safeCommitMessage accepts a title right at the 72-char boundary', () => {
  const title = 'A'.repeat(72);
  const msg = safeCommitMessage('issue-42', title, null);
  assert.match(msg, new RegExp(`A{72}`));
});

test('safeCommitMessage handles missing/null notes gracefully', () => {
  const msg = safeCommitMessage('issue-42', 'Fix null pointer in parser', null);
  assert.match(msg, /Fix null pointer in parser/);
  assert.match(msg, /issue-42/);
});
