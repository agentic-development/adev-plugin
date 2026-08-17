// tests/frontmatter.test.mjs
//
// adev-plugin-akoy.1 — shared frontmatter preamble parser.
//
// Consolidates three near-duplicate copies that each broke on multi-line HTML
// comments (lib/specify-amend.mjs, lib/specify-revise.mjs,
// lib/amendment-graph.mjs). 129 of 254 .spec.md files in this repo open with an
// H1 + multi-line comment preamble and were read as `{}` by all three.
//
// The old scan skipped blank lines, lines starting with `#`, and lines starting
// with `<!--`, but never tracked an UNCLOSED comment: a continuation line of a
// multi-line comment is non-blank, does not start with `#`, and does not start
// with `<!--`, so the scan broke before reaching the fence.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseFrontmatter, parseFrontmatterFields } from '../lib/frontmatter.mjs';

// ── Clean shape (fence on line 1) — 125 of 254 specs ───────────────────────

test('parses frontmatter when the fence is on line 1', () => {
  const text = '---\ncharter: auth\nrevision: 4\n---\n\n# Body\n';
  const fields = parseFrontmatterFields(text);
  assert.equal(fields.charter, 'auth');
  assert.equal(fields.revision, '4');
});

// ── H1 + single-line comment (the shape the old scan did handle) ───────────

test('parses frontmatter behind an H1 and a single-line comment', () => {
  const text = '# Live Spec: Auth\n\n<!-- one liner -->\n\n---\nrevision: 2\n---\n\nBody.\n';
  assert.equal(parseFrontmatterFields(text).revision, '2');
});

// ── THE BUG: H1 + multi-line comment with indented continuations ───────────

test('parses frontmatter behind a multi-line HTML comment (akoy.1 regression)', () => {
  // Byte-for-byte the shape of lifecycle-event-log.spec.md lines 1-12.
  const text = [
    '# Live Spec: Lifecycle Event Log',
    '',
    '<!-- Live Spec within the agent-reliable-state-artifacts charter.',
    '     This defines a specific behavioral contract that drives implementation and testing.',
    '     Parent Charter: .context-index/specs/features/agent-reliable-state-artifacts/charter.md -->',
    '',
    '---',
    'charter: agent-reliable-state-artifacts',
    'status: validated',
    'revision: 4',
    '---',
    '',
    'Body.',
  ].join('\n');

  const fields = parseFrontmatterFields(text);
  assert.equal(fields.revision, '4', 'revision must parse from behind a multi-line comment');
  assert.equal(fields.status, 'validated');
  assert.equal(fields.charter, 'agent-reliable-state-artifacts');
});

// ── The line-15 case: long comment, closing `-->` on its own line ──────────

test('parses frontmatter when the comment closes on its own line beyond 10 lines', () => {
  // Shape of core-parser-pipeline.spec.md — fence at line 15, past the old
  // hard-coded 10-line scan cap, so comment tracking alone is not sufficient.
  const text = [
    '# Live Spec: Core Parser Pipeline',
    '',
    '<!-- REVISION HISTORY',
    '     - rev 1 (2026-03-23): initial draft and implementation contract.',
    '     - rev 2 (2026-05-17): additive schema evolution from sibling spec',
    '       `non-code-reference-detection.spec.md`. Adds optional `tags`',
    '       to FileNode, adds "doc-reference" to the Edge type enumeration,',
    '       adds optional `count` to Edge, adds optional',
    '       `referenceSources` to symbol entries. All additions are',
    '       purely additive; pre-existing artifacts remain',
    '       schema-valid under rev 2. Consumers MUST tolerate unknown edge',
    '       types and additional FileNode fields per the graceful-degradation',
    '       contract.',
    '-->',
    '---',
    'charter: tree-sitter-repomap',
    'revision: 2',
    '---',
    '',
    'Body.',
  ].join('\n');

  const fields = parseFrontmatterFields(text);
  assert.equal(fields.charter, 'tree-sitter-repomap');
  assert.equal(fields.revision, '2');
});

// ── A `---` inside a comment must not be mistaken for the fence ────────────

test('a fence-like line inside a comment does not open the frontmatter', () => {
  const text = [
    '<!-- preamble',
    '---',
    'not: frontmatter',
    '-->',
    '---',
    'revision: 7',
    '---',
    '',
    'Body.',
  ].join('\n');

  const fields = parseFrontmatterFields(text);
  assert.equal(fields.revision, '7');
  assert.equal(fields.not, undefined, 'comment interior must not contribute fields');
});

// ── Negative cases: preserve the old contract ─────────────────────────────

test('returns no fields when real content precedes the fence', () => {
  const text = 'This is a paragraph.\n\n---\nrevision: 1\n---\n';
  assert.deepEqual(parseFrontmatterFields(text), {});
});

test('returns no fields when there is no fence at all', () => {
  assert.deepEqual(parseFrontmatterFields('# Title\n\nBody only.\n'), {});
});

test('returns no fields when the fence is never closed', () => {
  assert.deepEqual(parseFrontmatterFields('---\nrevision: 1\n\nBody with no close.\n'), {});
});

test('captures only indent-0 scalar keys', () => {
  const text = '---\ntop: yes\nnested:\n  inner: no\n---\n';
  const fields = parseFrontmatterFields(text);
  assert.equal(fields.top, 'yes');
  assert.equal(fields.inner, undefined, 'indented keys must not be captured');
});

// ── Rich form: frontmatterText + body split (used by specify-revise) ───────

test('parseFrontmatter splits frontmatterText and body around the fence', () => {
  const text = '# H1\n\n<!-- c\n   cont -->\n\n---\na: 1\n---\nbody line\nsecond\n';
  const parsed = parseFrontmatter(text);
  assert.equal(parsed.fields.a, '1');
  assert.equal(parsed.frontmatterText, 'a: 1');
  assert.equal(parsed.body, 'body line\nsecond\n');
});

test('parseFrontmatter reports null frontmatterText and full body when absent', () => {
  const text = 'Just prose.\n';
  const parsed = parseFrontmatter(text);
  assert.equal(parsed.frontmatterText, null);
  assert.equal(parsed.body, text);
  assert.deepEqual(parsed.fields, {});
});
