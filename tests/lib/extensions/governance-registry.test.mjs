import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveRootKey,
  validateEntryFields,
  WRITABLE_REGISTRIES,
  FIELD_ALLOWLIST,
  INSTALLER_OWNED,
  assertRunnerScope,
  requiresCommand,
} from '../../../lib/extensions/governance-registry.mjs';

const throwsCode = (fn, code) => assert.throws(fn, e => e.code === code);

test('exactly five writable registries, validate.yaml maps to checks', () => {
  assert.equal(WRITABLE_REGISTRIES.size, 5);
  assert.equal(resolveRootKey('validate.yaml'), 'checks');
  assert.equal(resolveRootKey('review.yaml'), 'reviewers');
  for (const closed of ['risk-policies.yaml', 'sensitive-paths.yaml', 'anything.yaml'])
    throwsCode(() => resolveRootKey(closed), 'UNKNOWN_GOVERNANCE_TARGET');
});

test('every writable target resolves to its real root key', () => {
  // `size === 5` alone would pass if two targets shared a key or if gates /
  // diagnostics / boundaries mapped somewhere the loaders never read.
  assert.deepEqual(
    Object.fromEntries([...WRITABLE_REGISTRIES.keys()].map(t => [t, resolveRootKey(t)])),
    {
      'validate.yaml': 'checks',
      'review.yaml': 'reviewers',
      'gates.yaml': 'gates',
      'diagnostics.yaml': 'diagnostics',
      'boundaries.yaml': 'boundaries',
    }
  );
});

test('fields outside the registry allowlist are refused', () => {
  throwsCode(() => validateEntryFields('gates.yaml', { id: 'g', command: ['x'], runner: 'plugin:a' }),
    'GOVERNANCE_FIELD_NOT_ALLOWED');
  throwsCode(() => validateEntryFields('boundaries.yaml', { id: 'b', command: ['x'] }),
    'GOVERNANCE_FIELD_NOT_ALLOWED');
  assert.throws(() => validateEntryFields('boundaries.yaml', { id: 'b', command: ['x'] }), /command/);
});

test('installer-owned fields win the precedence race', () => {
  throwsCode(() => validateEntryFields('gates.yaml', { id: 'g', command: ['x'], source: 'forged' }),
    'GOVERNANCE_SOURCE_FORGED');
  throwsCode(() => validateEntryFields('review.yaml', { id: 'r', __source: 'project' }),
    'GOVERNANCE_SOURCE_FORGED');
  throwsCode(() => validateEntryFields('gates.yaml', { id: 'g', command: ['x'], exec_consented_at: 'now' }),
    'GOVERNANCE_SOURCE_FORGED');
  // `__source` is not on any allowlist either; the precedence rule is what makes
  // it report SOURCE_FORGED rather than FIELD_NOT_ALLOWED.
  assert.throws(() => validateEntryFields('review.yaml', { id: 'r', __source: 'project' }), /__source/);
});

test('Decision B — dispatch:triggered and package.args are refused', () => {
  assert.doesNotThrow(() => validateEntryFields('review.yaml', { id: 'r', dispatch: 'always' }));
  throwsCode(() => validateEntryFields('review.yaml', { id: 'r', dispatch: 'triggered' }),
    'GOVERNANCE_FIELD_VALUE_INVALID');
  throwsCode(() => validateEntryFields('review.yaml', { id: 'r', package: { skill: 'a.md', args: { x: 1 } } }),
    'GOVERNANCE_FIELD_VALUE_INVALID');
  assert.doesNotThrow(() => validateEntryFields('review.yaml',
    { id: 'r', package: { skill: 'a.md', adapter: 'b.md' } }));
});

test('field values are constrained, not only field names', () => {
  throwsCode(() => validateEntryFields('validate.yaml', { id: 'c', kind: 'made-up' }),
    'GOVERNANCE_FIELD_VALUE_INVALID');
  throwsCode(() => validateEntryFields('diagnostics.yaml', { id: 'd', runner: 'project:x.mjs' }),
    'GOVERNANCE_FIELD_VALUE_INVALID');
  throwsCode(() => validateEntryFields('validate.yaml', { id: 'c', runner: 'plugin:x.mjs' }),
    'GOVERNANCE_FIELD_NOT_ALLOWED');
  assert.throws(() => validateEntryFields('validate.yaml', { id: 'c', kind: 'made-up' }), /kind/);
});

// ---------------------------------------------------------------------------
// Additional coverage
// ---------------------------------------------------------------------------

const MAXIMAL_ENTRIES = {
  'validate.yaml': {
    id: 'domain.check-1',
    name: 'Domain Check One',
    kind: 'quality-gate',
    severity: 'error',
    profile: 'read-only',
    context_pack: 'base',
    prompt: 'plugin:checks/one.md',
    after: 'domain.check-0',
    description: 'Runs the domain quality gate',
    command: ['npm', 'test'],
    fail_fast: true,
    enabled: true,
    disabled_reason: 'not-disabled',
  },
  'review.yaml': {
    id: 'domain.reviewer-1',
    name: 'Domain Reviewer',
    dispatch: 'always',
    profile: 'read-only',
    context_pack: 'base',
    severity_cap: 'warning',
    prompt: 'plugin:reviewers/one.md',
    package: { skill: 'plugin:skills/one.md', adapter: 'plugin:adapters/generic.md' },
    enabled: true,
    disabled_reason: 'not-disabled',
  },
  'gates.yaml': {
    id: 'domain.gate-1',
    command: ['npm', 'run', 'lint'],
    description: 'Lints the repository',
    severity: 'error',
    tier: 1,
    enabled: true,
    disabled_reason: 'not-disabled',
  },
  'diagnostics.yaml': {
    id: 'domain/aspect',
    runner: 'plugin:tier1/aspect.mjs',
    severity: 'warning',
    tier: 1,
    scope: 'event-impact',
    enabled: true,
    disabled_reason: 'not-disabled',
  },
  'boundaries.yaml': {
    id: 'no-direct-db',
    severity: 'error',
    pattern: 'import.*from.*prisma',
    exclude: ['src/db/**', 'prisma/**'],
    description: 'Direct database imports live in src/db only',
    enabled: true,
    disabled_reason: 'not-disabled',
  },
};

test('each allowlist accepts a maximal valid entry for its registry', () => {
  for (const [target, entry] of Object.entries(MAXIMAL_ENTRIES)) {
    assert.deepEqual(
      Object.keys(entry).sort(),
      [...FIELD_ALLOWLIST.get(target)].sort(),
      `${target}: maximal fixture must exercise every allowlisted field`
    );
    assert.doesNotThrow(() => validateEntryFields(target, entry), `${target} maximal entry`);
  }
});

test('assertRunnerScope confines runner to diagnostics.yaml', () => {
  assert.doesNotThrow(() => assertRunnerScope('runner', 'diagnostics.yaml'));
  assert.doesNotThrow(() => assertRunnerScope('severity', 'gates.yaml'));
  for (const target of ['validate.yaml', 'review.yaml', 'gates.yaml', 'boundaries.yaml']) {
    assert.throws(() => assertRunnerScope('runner', target), e => e.code === 'GOVERNANCE_FIELD_NOT_ALLOWED');
  }
});

test('requiresCommand marks gates and quality-gate checks', () => {
  assert.equal(requiresCommand('gates.yaml', { id: 'g' }), true);
  assert.equal(requiresCommand('validate.yaml', { id: 'c', kind: 'quality-gate' }), true);
  assert.equal(requiresCommand('validate.yaml', { id: 'c', kind: 'observational' }), false);
  assert.equal(requiresCommand('review.yaml', { id: 'r' }), false);
  assert.throws(
    () => validateEntryFields('gates.yaml', { id: 'g', description: 'no command here' }),
    e => e.code === 'GOVERNANCE_FIELD_VALUE_INVALID'
  );
});

test('severity is an enum, not free text', () => {
  throwsCode(() => validateEntryFields('gates.yaml', { id: 'g', command: ['x'], severity: 'catastrophic' }),
    'GOVERNANCE_FIELD_VALUE_INVALID');
  assert.throws(
    () => validateEntryFields('boundaries.yaml', { id: 'b', severity: 'catastrophic' }),
    e => e.code === 'GOVERNANCE_FIELD_VALUE_INVALID'
  );
});

test('a non-string id is refused via the shared string-id primitive', () => {
  assert.throws(
    () => validateEntryFields('gates.yaml', { id: 42, command: ['x'] }),
    e => e.code === 'GOVERNANCE_FIELD_VALUE_INVALID'
  );
  throwsCode(() => validateEntryFields('boundaries.yaml', { id: true }), 'GOVERNANCE_FIELD_VALUE_INVALID');
});

test('an unsafe scalar in an allowlisted field is refused', () => {
  assert.throws(
    () => validateEntryFields('gates.yaml', { id: 'g', command: ['x'], description: 'a#b' }),
    e => e.code === 'GOVERNANCE_SCALAR_UNSAFE'
  );
  throwsCode(
    () => validateEntryFields('boundaries.yaml', { id: 'b', description: 'has "quotes"' }),
    'GOVERNANCE_SCALAR_UNSAFE'
  );
});

test('INSTALLER_OWNED names exactly the three installer-stamped fields', () => {
  assert.deepEqual([...INSTALLER_OWNED].sort(), ['__source', 'exec_consented_at', 'source']);
});

test('validateEntryFields is per-entry: no entries-per-target cap is applied here', () => {
  // The entriesPerTarget cap belongs to the merge level (a later task), not to
  // per-entry field validation. Validating many entries individually must not
  // accumulate any count.
  for (let i = 0; i < 64; i += 1) {
    assert.doesNotThrow(() => validateEntryFields('gates.yaml', { id: `g-${i}`, command: ['npm', 'test'] }));
  }
});

test('command elements are held to the argv rule, not the scalar rule', () => {
  // `[npm, test, --, --silent]` is the literal example in
  // lib/governance/validate-config.mjs:439. The scalar rule refuses a leading
  // `-`, so validating argv with it would make a legitimate gate
  // uncontributable — that divergence is the whole reason assertSafeArgvToken
  // exists separately from assertSafeScalar.
  assert.doesNotThrow(
    () => validateEntryFields('gates.yaml', { id: 'g', command: ['npm', 'test', '--', '--silent'] })
  );
  assert.doesNotThrow(
    () => validateEntryFields('validate.yaml',
      { id: 'c', kind: 'quality-gate', command: ['npm', 'test', '--', '--silent'] })
  );
  throwsCode(
    () => validateEntryFields('gates.yaml', { id: 'g', command: ['npm', 'test;rm -rf /'] }),
    'GOVERNANCE_SCALAR_UNSAFE'
  );
  assert.throws(
    () => validateEntryFields('gates.yaml', { id: 'g', command: ['npm', 'test;rm -rf /'] }),
    e => e.code === 'GOVERNANCE_SCALAR_UNSAFE'
  );
});

test('a shell-form command string is refused, not accepted as a scalar', () => {
  // merge-gates.mjs:34-40 drops a string command with a warning and
  // validate-config.mjs:437-442 rejects it; refusing it here means the
  // extension learns why instead of having its gate silently vanish.
  throwsCode(() => validateEntryFields('gates.yaml', { id: 'g', command: 'npm test' }),
    'GOVERNANCE_FIELD_VALUE_INVALID');
  assert.throws(
    () => validateEntryFields('gates.yaml', { id: 'g', command: 'npm test' }),
    /argv list/
  );
});

test('prose fields keep the strict scalar rule', () => {
  // The argv relaxation is scoped to `command`. A leading `-` in prose is still
  // a YAML indicator and still refused.
  throwsCode(
    () => validateEntryFields('gates.yaml', { id: 'g', command: ['npm'], description: '-leading' }),
    'GOVERNANCE_SCALAR_UNSAFE'
  );
  assert.throws(
    () => validateEntryFields('boundaries.yaml', { id: 'b', description: '-leading' }),
    e => e.code === 'GOVERNANCE_SCALAR_UNSAFE'
  );
});

test('package paths keep the scalar rule — the argv rule would refuse them', () => {
  // `plugin:<skill>/<file>` (skills/review-specs/SKILL.md:149) contains a
  // colon, which ARGV_TOKEN does not admit. Routing package.skill /
  // package.adapter through assertSafeArgvToken would make every package-mode
  // reviewer uncontributable. Pinned so that mistake fails loudly.
  assert.doesNotThrow(() => validateEntryFields('review.yaml', {
    id: 'r',
    package: { skill: 'plugin:skills/one.md', adapter: 'plugin:adapters/generic.md' },
  }));
  assert.doesNotThrow(() => validateEntryFields('review.yaml',
    { id: 'r', prompt: 'plugin:review-specs/adapters/generic.md' }));
});

test('severity_cap uses its own vocabulary, not severity\'s', () => {
  for (const cap of ['blocker', 'warning', 'suggestion']) {
    assert.doesNotThrow(() => validateEntryFields('review.yaml', { id: 'r', severity_cap: cap }), cap);
  }
  // The cross-vocabulary trap: 'error' is valid for `severity`
  // (validate-config.mjs:25) but NOT for `severity_cap`
  // (review-config.mjs:20). An unconstrained severity_cap is two exposures at
  // once — an in-vocabulary 'suggestion' silently downgrades a colliding
  // bundled reviewer past blocking (mergeReviewers, review-config.mjs:326),
  // and an out-of-vocabulary value pushes REVIEWER_SEVERITY_CAP
  // (review-config.mjs:375-381), which aborts the entire review
  // (skills/review-specs/SKILL.md:152).
  throwsCode(() => validateEntryFields('review.yaml', { id: 'r', severity_cap: 'error' }),
    'GOVERNANCE_FIELD_VALUE_INVALID');
  assert.throws(
    () => validateEntryFields('review.yaml', { id: 'r', severity_cap: 'info' }),
    e => e.code === 'GOVERNANCE_FIELD_VALUE_INVALID'
  );
  throwsCode(() => validateEntryFields('review.yaml', { id: 'r', severity_cap: 'nonsense' }),
    'GOVERNANCE_FIELD_VALUE_INVALID');
  // ...and `severity` does not accept severity_cap's vocabulary either.
  throwsCode(() => validateEntryFields('gates.yaml', { id: 'g', command: ['x'], severity: 'blocker' }),
    'GOVERNANCE_FIELD_VALUE_INVALID');
});

test('kind is not contributable to gates.yaml', () => {
  // Not a harmless no-op omission. merge-gates.mjs:41-47 drops `kind` from the
  // projection, but gate-doctor reads it off the raw file (doctor.mjs:844) and
  // `kind: probabilistic` makes doctor skip every command check (:847) while
  // the runner still executes the gate — static-analysis evasion.
  throwsCode(() => validateEntryFields('gates.yaml', { id: 'g', command: ['x'], kind: 'probabilistic' }),
    'GOVERNANCE_FIELD_NOT_ALLOWED');
  assert.throws(
    () => validateEntryFields('gates.yaml', { id: 'g', command: ['x'], kind: 'deterministic' }),
    e => e.code === 'GOVERNANCE_FIELD_NOT_ALLOWED'
  );
});

test('an unknown target is refused before any field is inspected', () => {
  assert.throws(
    () => validateEntryFields('risk-policies.yaml', { source: 'forged' }),
    e => e.code === 'UNKNOWN_GOVERNANCE_TARGET'
  );
});
