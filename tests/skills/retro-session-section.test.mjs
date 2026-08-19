// tests/skills/retro-session-section.test.mjs
//
// Skill-prose tests for the Session Activity insertion. Tasks 14, 15, 16,
// 17 verified here. Task 18 adds end-to-end snapshot tests against the
// CLI verb running against a fixture project.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PLUGIN_ROOT, createTempDir, cleanupTempDir, readSkillSurface } from '../helpers.mjs';

function runCli(args, { cwd } = {}) {
  const result = spawnSync('node', [join(PLUGIN_ROOT, 'cli', 'index.mjs'), ...args], {
    cwd: cwd || process.cwd(),
    encoding: 'utf8',
    timeout: 30_000,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

const RETRO_SKILL = readSkillSurface("retro");
const INIT_SKILL = readSkillSurface("init");

// ---- Task 14: § 1.8 Session Activity step inserted into retro skill ----

test("skills/retro: contains § 1.8 Session Activity heading (+3 more contract assertions)", () => {
  // skills/retro: contains § 1.8 Session Activity heading
  assert.match(RETRO_SKILL, /### 1\.8 Session Activity/);

  // skills/retro: § 1.8 invokes the CLI verb
  assert.match(RETRO_SKILL, /adev retro session-activity/);

  // skills/retro: § 1.8 documents --format text
  assert.match(RETRO_SKILL, /--format text/);

  // skills/retro: § 1.8 documents Graceful absence
  assert.match(RETRO_SKILL, /Graceful absence/);
});

test('skills/retro: contains no inline-Node patterns (Principle 2)', () => {
  // Pre-commit hook also enforces this; defense-in-depth from skill tests.
  assert.equal(RETRO_SKILL.includes('node -e '), false);
  assert.equal(RETRO_SKILL.includes('node --input-type=module -e'), false);
  assert.equal(RETRO_SKILL.includes('Run inline Node'), false);
});

// ---- Task 15: Step 2 Context Gaps removal ----

test('skills/retro: Step 2 "Context Gaps" subsection deleted', () => {
  // The phrase "if session capture is configured" was inside the old
  // conditional grep; absence confirms removal.
  assert.equal(
    RETRO_SKILL.includes('if session capture is configured'),
    false,
    'old conditional phrase still present'
  );
});

test('skills/retro: no "### Context Gaps" subheading under Step 2', () => {
  // The old subheading lived in Step 2; ensure no `### Context Gaps`
  // heading exists (Step 2 had it; Step 1.8 uses "## Session Activity"
  // header and the CLI verb renders the Context Gaps subsection as
  // ### Context Gaps inside the output, but the Step 2 occurrence is
  // gone — verify the location is not in Step 2 by checking it does
  // not appear between "## Step 2" and "## Step 3").
  const step2Start = RETRO_SKILL.indexOf('## Step 2');
  const step3Start = RETRO_SKILL.indexOf('## Step 3');
  assert.ok(step2Start > 0, 'Step 2 not found');
  assert.ok(step3Start > step2Start, 'Step 3 not found after Step 2');
  const step2Section = RETRO_SKILL.slice(step2Start, step3Start);
  assert.equal(
    step2Section.includes('### Context Gaps'),
    false,
    'Step 2 still contains a Context Gaps subheading'
  );
});

// ---- Task 16: Report Format documents Session Activity ordering ----

test('skills/retro: Report Format has ## Session Activity heading', () => {
  // The Report Format markdown template includes the section header so
  // the agent renders it in the right place.
  const reportStart = RETRO_SKILL.indexOf('### Report Format');
  assert.ok(reportStart > 0, 'Report Format heading not found');
  const reportSection = RETRO_SKILL.slice(reportStart);
  assert.match(reportSection, /## Session Activity/);
});

test('skills/retro: Report Format documents the six-subsection ordering', () => {
  const reportStart = RETRO_SKILL.indexOf('### Report Format');
  const section = RETRO_SKILL.slice(reportStart);
  // The Behavior 13 ordering documented in prose.
  assert.match(section, /Tool-Use Distribution/);
  assert.match(section, /Per-Spec Session Counts/);
  assert.match(section, /Cost & Token Trends/);
  assert.match(section, /Sessions . Closed Issues/); // "↔" with regex-safe wildcard
  assert.match(section, /Context Gaps/);
});

test('skills/retro: Report Format places Session Activity before Throughput', () => {
  const reportStart = RETRO_SKILL.indexOf('### Report Format');
  const section = RETRO_SKILL.slice(reportStart);
  const sessionPos = section.indexOf('## Session Activity');
  const throughputPos = section.indexOf('## Throughput');
  assert.ok(sessionPos > 0 && throughputPos > 0, 'sections not found');
  assert.ok(
    sessionPos < throughputPos,
    'Session Activity must precede Throughput in Report Format'
  );
});

// ---- Task 17: skills/init/SKILL.md doc-drift fix ----

test('skills/init: /adev:retro session-consumption claim is accurate', () => {
  // The claim should mention the actual section name (Session Activity)
  // and the step where it lives (§ 1.8 in retro SKILL.md).
  assert.match(INIT_SKILL, /Session Activity/);
  assert.match(INIT_SKILL, /skills\/retro\/SKILL\.md/);
});

test('skills/init: contains no inline-Node patterns', () => {
  // Pre-commit guard; defense-in-depth.
  assert.equal(INIT_SKILL.includes('node -e '), false);
});

// ---- Task 18: End-to-end snapshot tests ----

/**
 * Build a deterministic fixture project with a curated set of session
 * files exercising every conditional rendering branch.
 */
function buildFixture(dir) {
  mkdirSync(join(dir, '.context-index/sessions'), { recursive: true });

  // Hook-mode session-end with cost, model, issue, spec, tool patterns
  writeFileSync(
    join(dir, '.context-index/sessions/2026-05-10-sessabcd1234.md'),
    [
      '---',
      'kind: session-end',
      'session_id: sessabcd1234',
      'date: 2026-05-10',
      'cost_usd: 0.05',
      'input_tokens: 1000',
      'output_tokens: 200',
      'model: sonnet',
      'spec: .context-index/specs/features/a/a.spec.md',
      'issue: issue-1',
      '---',
      '### Read',
      '### Bash',
      '**Tool:** Read',
      '```output',
      'no matches',
      '```',
    ].join('\n')
  );

  // Hook-mode pre-compact (XS-2 excluded from cost/xref but counted)
  writeFileSync(
    join(dir, '.context-index/sessions/2026-05-11-precab5678.md'),
    [
      '---',
      'kind: pre-compact',
      'session_id: precab5678',
      'date: 2026-05-11',
      '---',
      '### Edit',
    ].join('\n')
  );

  // Post-commit-mode
  writeFileSync(
    join(dir, '.context-index/sessions/2026-05-12-deadbee.md'),
    [
      '---',
      'date: 2026-05-12',
      'type: commit',
      'agent: git-hook',
      'sha: deadbee',
      '---',
      '### Read',
    ].join('\n')
  );

  // Unknown format
  writeFileSync(
    join(dir, '.context-index/sessions/2026-05-13-unknxx.md'),
    [
      '---',
      'date: 2026-05-13',
      'random: noise',
      '---',
      '### Read',
    ].join('\n')
  );

  // Malformed YAML (custom tag) → unknown
  writeFileSync(
    join(dir, '.context-index/sessions/2026-05-14-malf.md'),
    [
      '---',
      'date: 2026-05-14',
      'foo: !!js/function "return 1"',
      '---',
      'body',
    ].join('\n')
  );

  // Out-of-window
  writeFileSync(
    join(dir, '.context-index/sessions/2025-01-01-oldddd.md'),
    [
      '---',
      'kind: session-end',
      'session_id: oldddd',
      'date: 2025-01-01',
      '---',
      'body',
    ].join('\n')
  );
}

test('e2e: fixture project — JSON output covers all branches', () => {
  const dir = createTempDir();
  try {
    buildFixture(dir);
    const r = runCli(
      ['retro', 'session-activity', '--since', '2026-05-01', '--until', '2026-05-31', '--project-root', dir],
      { cwd: dir }
    );
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    // 5 sessions in window: 2 hook (session-end + pre-compact), 1 post-commit, 2 unknown
    assert.equal(data.totalSessions, 5);
    assert.deepEqual(data.formatBreakdown, { hook: 2, 'post-commit': 1, unknown: 2 });
    // Tool-Use Distribution from hook-mode sessions only:
    // session-end has Read x2, Bash x1; pre-compact has Edit x1
    const read = data.toolUseDistribution.find((x) => x.tool === 'Read');
    const bash = data.toolUseDistribution.find((x) => x.tool === 'Bash');
    const edit = data.toolUseDistribution.find((x) => x.tool === 'Edit');
    assert.equal(read.count, 2);
    assert.equal(bash.count, 1);
    assert.equal(edit.count, 1);
    // Cost subsection rendered (session-end has cost fields)
    assert.ok(data.costTokens);
    assert.equal(data.costTokens.totals.cost_usd, 0.05);
    // Context Gaps: 1 frame-anchored 'no matches' in session-end
    assert.ok(data.contextGaps.length >= 1);
  } finally {
    cleanupTempDir(dir);
  }
});

test('e2e: --format text renders ordered subsections', () => {
  const dir = createTempDir();
  try {
    buildFixture(dir);
    const r = runCli(
      ['retro', 'session-activity', '--since', '2026-05-01', '--until', '2026-05-31', '--project-root', dir, '--format', 'text'],
      { cwd: dir }
    );
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = r.stdout;
    // Top section heading.
    assert.match(out, /## Session Activity/);
    // Format breakdown line.
    assert.match(out, /Total: 5 \(hook: 2, post-commit: 1, unknown: 2\)/);
    // Subsection headings in order.
    const headings = [
      '### Tool-Use Distribution',
      '### Per-Spec Session Counts',
      '### Cost & Token Trends',
      '### Context Gaps',
    ];
    let lastIdx = 0;
    for (const h of headings) {
      const idx = out.indexOf(h, lastIdx);
      assert.ok(idx >= 0, `missing subsection: ${h}`);
      assert.ok(idx >= lastIdx, `subsection out of order: ${h}`);
      lastIdx = idx;
    }
  } finally {
    cleanupTempDir(dir);
  }
});

test('e2e: section-omission case — no sessions in window → empty output', () => {
  const dir = createTempDir();
  try {
    // No sessions dir created.
    const r = runCli(
      ['retro', 'session-activity', '--since', '2026-05-01', '--until', '2026-05-31', '--project-root', dir, '--format', 'text'],
      { cwd: dir }
    );
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '', 'expected empty output (Graceful absence)');
  } finally {
    cleanupTempDir(dir);
  }
});

test('e2e: out-of-window-only fixture → section omitted', () => {
  const dir = createTempDir();
  try {
    mkdirSync(join(dir, '.context-index/sessions'), { recursive: true });
    writeFileSync(
      join(dir, '.context-index/sessions/2025-01-01-old.md'),
      '---\nkind: session-end\nsession_id: old\ndate: 2025-01-01\n---\nbody'
    );
    const r = runCli(
      ['retro', 'session-activity', '--since', '2026-05-01', '--until', '2026-05-31', '--project-root', dir, '--format', 'text'],
      { cwd: dir }
    );
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '');
  } finally {
    cleanupTempDir(dir);
  }
});
