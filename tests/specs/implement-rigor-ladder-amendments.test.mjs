import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { PLUGIN_ROOT } from '../helpers.mjs';
import { parseSpecFrontmatter } from '../../lib/meta-tools.mjs';

const IMPL = join(PLUGIN_ROOT, '.context-index/specs/features/implementation');
const XCUT = join(PLUGIN_ROOT, '.context-index/specs/cross-cutting');
const LOGS = join(PLUGIN_ROOT, '.context-index/lifecycle-state');
const LITE_MODE = join(PLUGIN_ROOT, 'skills/implement/references/lite-mode.md');
const ADR = join(PLUGIN_ROOT, '.context-index/adrs/0020-implement-rigor-ladder.md');

const BASES = {
  provenance: {
    dir: IMPL,
    stem: 'review-provenance',
    descriptor: 'lite-exemption',
    rel: '.context-index/specs/features/implementation/review-provenance.spec.md',
  },
  batched: {
    dir: IMPL,
    stem: 'batched-task-dispatch',
    descriptor: 'resolved-depth',
    rel: '.context-index/specs/features/implementation/batched-task-dispatch.spec.md',
  },
  depth: {
    dir: IMPL,
    stem: 'graduated-review-depth',
    descriptor: 'rigor-ladder',
    rel: '.context-index/specs/features/implementation/graduated-review-depth.spec.md',
  },
  tiers: {
    dir: XCUT,
    stem: 'graduated-rigor-tiers',
    descriptor: 'lite-tier',
    rel: '.context-index/specs/cross-cutting/graduated-rigor-tiers.spec.md',
  },
};

function amendmentFor(base) {
  const re = new RegExp(`^${base.stem}-rev-\\d+-${base.descriptor}\\.spec\\.md$`);
  const matches = readdirSync(base.dir).filter((f) => re.test(f));
  assert.equal(matches.length, 1, `expected exactly one ${base.stem}-rev-<N>-${base.descriptor}.spec.md`);
  const path = join(base.dir, matches[0]);
  return { path, file: matches[0], text: readFileSync(path, 'utf8') };
}

// Body under a heading, up to the next heading of the same or higher level.
function section(text, heading) {
  const level = heading.match(/^#+/)[0].length;
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim() === heading);
  assert.ok(start >= 0, `missing heading: ${heading}`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => {
    const m = /^(#+)\s/.exec(l);
    return m && m[1].length <= level;
  });
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

const bullets = (text) => text.split('\n').filter((l) => /^- /.test(l)).map((l) => l.slice(2).trim());

function assertLinked(base) {
  const { path, file, text } = amendmentFor(base);
  const fm = parseSpecFrontmatter(path);
  const baseFm = parseSpecFrontmatter(join(base.dir, `${base.stem}.spec.md`));
  const target = Number(baseFm.revision) + 1;
  assert.equal(fm.amends, base.rel);
  assert.equal(Number(fm['target-revision']), target);
  assert.equal(file, `${base.stem}-rev-${target}-${base.descriptor}.spec.md`);
  assert.match(text, /implement-rigor-ladder\.spec\.md/, 'must cite the driving spec');

  const events = readFileSync(join(LOGS, `${base.stem}.jsonl`), 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
    .filter((e) => e.event === 'spec_amended' && e.amendment_path === base.rel.replace(`${base.stem}.spec.md`, file));
  assert.equal(events.length, 1, `base log must record one spec_amended event for ${file}`);
  assert.equal(events[0].target_revision, target);
  assert.ok(existsSync(join(LOGS, `${file.slice(0, -'.spec.md'.length)}.jsonl`)), 'amendment has its own log');
  return text;
}

test('review-provenance amendment exempts depth: lite from the trailer rule (BEH-6)', () => {
  const s = assertLinked(BASES.provenance);
  assert.match(s, /^amends: .*review-provenance\.spec\.md/m);
  const delta = section(s, '## Behavioral Delta');
  assert.match(delta, /Contract A/);
  assert.match(delta, /final-pass `review_depth_resolved`[^\n]*`depth: lite`/);
  assert.match(delta, /`buildReviewRoundTrailer`[^\n]*unchanged/i);
  assert.match(delta, /`cycles >= 1`/);
  assert.match(section(s, '## Acceptance Criteria'), /Every task commit carries one `Review-round:/);
});

test("batched-task-dispatch amendment: reviewed at the task's resolved review depth (C.3)", () => {
  const s = assertLinked(BASES.batched);
  const delta = section(s, '## Behavioral Delta');
  assert.match(delta, /C\.3/);
  assert.match(delta, /at the task's resolved review depth/);
  assert.match(delta, /never batched/);
  assert.match(delta, /segment/i, 'states the sequential-group segment split');
  assert.match(delta, /`reason: "lite"`/);
  assert.match(delta, /`reason: "lite-assumed"`/);
  assert.match(delta, /LITE_AUTHORIZATION_ASSUMED/);
  assert.match(delta, /verifyPerTaskReviewRounds/);
  const ac = section(s, '## Acceptance Criteria');
  assert.match(ac, /Both review stages run per task inside a batch at unchanged depth/, 'names the superseded criterion');
  assert.match(ac, /equivalence eval/i);
});

test('graduated-review-depth amendment supersedes B, E, the full fallback, batched-task and scope-mismatch legs', () => {
  const s = assertLinked(BASES.depth);
  const delta = section(s, '## Behavioral Delta');
  for (const re of [
    /quick-grant predicate \(B\)/,
    /floor set \(E\)/,
    /`--tier quick`/,
    /`full` fallback/,
    /`batched-task` leg/,
    /`scope-mismatch` leg/,
    /BEH-2/,
    /BEH-5/,
    /BEH-7/,
  ]) {
    assert.match(delta, re);
  }
  assert.match(delta, /declared paths on both passes, plus every touched path on the final pass/);

  const standing = delta.split('\n\n').find((p) => /\bstand\b/.test(p));
  assert.ok(standing, 'names the base clauses that stand');
  assert.doesNotMatch(standing, /\bD\b|score validation|\(A\)/, 'D and A are superseded, not standing');
  const superseded = bullets(delta);
  const score = superseded.find((b) => b.startsWith('**Score validation (D).**'));
  assert.ok(score, 'D is in the superseded list');
  assert.match(score, /`ROUTING_SCORE_OUT_OF_RANGE`/);
  assert.match(score, /`quickTierSignal\(entry\)`/, 'scores gate only route\'s rigor-tier recommendation');
  assert.match(score, /does not gate `lite`/, 'revision 4: scores no longer deny lite');
  assert.match(score, /never resolves `full`/);
  const verb = superseded.find((b) => b.startsWith('**The verb signature (A).**'));
  assert.ok(verb, 'A\'s verb signature is in the superseded list');
  for (const re of [/`--tier full\|quick\|lite`/, /`--lite`/, /`--parallel`/, /`--run-base <sha>`[^\n]*required/, /`--in-batch`[^\n]*ignored/, /`lite_denied`/, /`lite_source`/, /`escalated_from`/, /`depth: 'full'\|'quick'\|'lite'`/]) {
    assert.match(verb, re);
  }
  const rows = section(s, '### Superseded Failure Modes rows');
  for (const re of [/out of range, non-finite, or non-numeric/, /no `risk_level`/, /outside the task's declared additive-only set/, /dispatched inside a batch/]) {
    assert.match(rows, re);
  }

  const ac = section(s, '## Acceptance Criteria');
  assert.match(ac, /Every task dispatched inside a batch[^\n]*resolves `full`/, 'names the superseded batched-task criterion');
  assert.match(ac, /superseded/i);
});

test('graduated-rigor-tiers amendment names lite in the invariant; review breadth, not a hard gate (BEH-14)', () => {
  const s = assertLinked(BASES.tiers);
  const delta = section(s, '## Behavioral Delta');
  assert.match(delta, /`resolveRigorMode`[^\n]*`full \| quick \| lite`/);
  const policy = bullets(delta).find((b) => b.startsWith('**Policy validation.**'));
  assert.ok(policy);
  assert.match(policy, /still holds for `review_mode` and `validate_mode`/);
  assert.match(policy, /For `implement_mode`, a missing file or missing key resolves `quick` \(BEH-2\)/);
  const inv = section(s, '### Amended invariant');
  assert.match(inv, /`quick` and `lite` never weaken hard gates/);
  assert.match(inv, /review breadth, not a hard gate/);
  assert.ok(bullets(inv).length >= 6, 'the invariant enumerates its gates as a list');
});

// Each hard gate the invariant may name, keyed to the phrase that identifies it.
// A bullet in the invariant that matches no key fails, so a gate added to the
// invariant cannot escape the lite-mode.md comparison below.
const GATES = {
  'gate-chain': /`lifecycle\.gate_mode`/,
  'gate-require': /`adev gate require`/,
  'non-main-branch': /non-main-branch stop/i,
  'skill-extensions': /skill extensions/i,
  'test-integrity': /`test-integrity\.md`/,
  'quality-gate-fail-fast': /quality-gate fail-fast/i,
  'destructive-action': /destructive-action gates/i,
  constitution: /constitution checks/i,
};

const gateKeys = (lines) =>
  lines.map((line) => {
    const keys = Object.keys(GATES).filter((k) => GATES[k].test(line));
    assert.equal(keys.length, 1, `gate bullet must name exactly one known gate: ${line}`);
    return keys[0];
  });

test("lite-mode.md hard-gate list ⊇ the amended invariant's gate list", () => {
  const inv = section(amendmentFor(BASES.tiers).text, '### Amended invariant');
  const invariantGates = new Set(gateKeys(bullets(inv)));
  const lite = readFileSync(LITE_MODE, 'utf8');
  const liteGates = new Set(gateKeys(bullets(section(lite, '## 8. Hard gates that `lite` never relaxes'))));
  const missing = [...invariantGates].filter((g) => !liteGates.has(g));
  assert.deepEqual(missing, [], 'lite-mode.md must list every gate the invariant names');
  assert.equal(invariantGates.size, Object.keys(GATES).length, 'the invariant names every BEH-14 gate');
});

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

test('no base spec is edited in place: each base matches HEAD byte for byte and keeps its revision', () => {
  const expected = { provenance: 4, batched: 1, depth: 12, tiers: 3 };
  for (const [key, base] of Object.entries(BASES)) {
    const committed = execFileSync('git', ['show', `HEAD:${base.rel}`], { cwd: PLUGIN_ROOT, encoding: 'utf8' });
    assert.equal(sha256(readFileSync(join(PLUGIN_ROOT, base.rel), 'utf8')), sha256(committed), `${base.stem} differs from HEAD`);
    const fm = parseSpecFrontmatter(join(base.dir, `${base.stem}.spec.md`));
    assert.equal(Number(fm.revision), expected[key], `${base.stem} revision unchanged`);
  }
});

test('ADR 0020 records the revision-4 notes in Consequences', () => {
  const adr = readFileSync(ADR, 'utf8');
  const notes = section(adr, '### Notes for implement-rigor-ladder revision 4');
  assert.ok(section(adr, '## Consequences').includes(notes), 'notes sit inside Consequences');
  for (const h of ['#### Decisions to ratify', '#### Open decisions', '#### Code follow-ups']) {
    assert.ok(notes.includes(h), `missing ${h}`);
  }
  for (const re of [
    /CON-3/, /RI-6/, /BD-13/, /BD-11/, /TR-6/, /TR-7/, /BEH-9/, /RI-10/,
    /RUN_BASE_UNAVAILABLE/, /RUN_BASE_READ_FAILED/, /POLICY_UNCOMMITTED_CHANGES/,
    /LITE_AUTHORIZATION_ASSUMED/, /INVALID_COMMIT_KINDS/, /ROUTING_SIDECAR_MISSING/,
    /verifyPerTaskReviewRounds/, /failure-path-exit-event\.md/, /liteUnavailable/,
    /`--task <N>`/, /BEH-15/, /BEH-5\s*\(b\)/,
  ]) {
    assert.match(notes, re);
  }
});

test('ADR 0020 status is Accepted', () => {
  const head = readFileSync(ADR, 'utf8').slice(0, 800);
  assert.match(head, /##\s+Status\s*\n+\*\*Accepted\*\* \(2026-11-26\)/);
  assert.doesNotMatch(head, /##\s+Status\s*\n+\*\*Proposed\*\*/);
});
