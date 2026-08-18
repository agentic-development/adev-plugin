import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { UNIT_PROFILE, getStrategyProfile } from '../../../lib/test-strategies/profiles.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REAL_PROFILES_DIR = resolve(__dirname, '../../../lib/test-strategies/profiles');

// ---------------------------------------------------------------------------
// UNIT_PROFILE constant
// ---------------------------------------------------------------------------

describe('UNIT_PROFILE', () => {
  const REQUIRED_FIELDS = [
    'strategy_id',
    'red_exit_condition',
    'green_exit_condition',
    'gaming_blockers',
    'assertion_rules',
    'seed_data_rule',
    'handoff_format',
    'permitted_tools',
  ];

  test('has all required fields', () => {
    for (const field of REQUIRED_FIELDS) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(UNIT_PROFILE, field),
        `Missing field: ${field}`
      );
    }
  });

  test('gaming_blockers is a non-empty array', () => {
    assert.ok(Array.isArray(UNIT_PROFILE.gaming_blockers));
    assert.ok(UNIT_PROFILE.gaming_blockers.length > 0);
  });

  test('permitted_tools is an empty array (tools now come from the domain profile)', () => {
    // Bundled permitted_tools were removed in favor of domain-provided values —
    // see lib/test-strategies/profiles.mjs and lib/domains/merge-test-config.mjs.
    assert.ok(Array.isArray(UNIT_PROFILE.permitted_tools));
    assert.equal(UNIT_PROFILE.permitted_tools.length, 0);
  });

  test('strategy_id is "unit"', () => {
    assert.equal(UNIT_PROFILE.strategy_id, 'unit');
  });

  test('is frozen (immutable)', () => {
    assert.ok(Object.isFrozen(UNIT_PROFILE), 'UNIT_PROFILE should be frozen');
    assert.throws(() => {
      UNIT_PROFILE.strategy_id = 'mutated';
    }, TypeError);
  });

  test("gaming_blockers array is frozen (+1 more contract assertions)", () => {
    // gaming_blockers array is frozen
    assert.ok(Object.isFrozen(UNIT_PROFILE.gaming_blockers));

    // permitted_tools array is frozen
    assert.ok(Object.isFrozen(UNIT_PROFILE.permitted_tools));
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a temp directory and return its path.
 */
function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'adev-profiles-test-'));
}

const VALID_UNIT_MD = `---
strategy_id: unit
red_exit_condition: "Test runner exits non-zero"
green_exit_condition: "Test runner exits zero"
gaming_blockers:
  - "toBeTruthy as sole assertion"
  - ".skip( — disabled tests"
assertion_rules: "Mock only at external boundaries."
seed_data_rule: "Deterministic seeded data only."
handoff_format: "SHA-256 hash of test files"
permitted_tools:
  - "node:test"
  - "jest"
---

# Unit Strategy Profile
`;

// ---------------------------------------------------------------------------
// getStrategyProfile — success path
// ---------------------------------------------------------------------------

describe('getStrategyProfile — valid ID and existing file', () => {
  test('loads profile from markdown file', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'unit.md'), VALID_UNIT_MD);

    const { profile, warnings, fallback } = getStrategyProfile('unit', dir);

    assert.equal(fallback, false);
    assert.deepEqual(warnings, []);
    assert.equal(profile.strategy_id, 'unit');
    assert.equal(profile.red_exit_condition, 'Test runner exits non-zero');
    assert.equal(profile.green_exit_condition, 'Test runner exits zero');
    assert.ok(Array.isArray(profile.gaming_blockers));
    assert.equal(profile.gaming_blockers.length, 2);
    assert.ok(Array.isArray(profile.permitted_tools));
    assert.equal(profile.permitted_tools.length, 2);
  });

  test('returned profile is frozen', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'unit.md'), VALID_UNIT_MD);

    const { profile } = getStrategyProfile('unit', dir);

    assert.ok(Object.isFrozen(profile));
  });

  test('returned array fields are frozen', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'unit.md'), VALID_UNIT_MD);

    const { profile } = getStrategyProfile('unit', dir);

    assert.ok(Object.isFrozen(profile.gaming_blockers));
    assert.ok(Object.isFrozen(profile.permitted_tools));
  });

  test('fallback flag is false on successful load', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'unit.md'), VALID_UNIT_MD);

    const { fallback } = getStrategyProfile('unit', dir);

    assert.equal(fallback, false);
  });

  test('loads a non-unit known strategy (smoke)', () => {
    const dir = makeTempDir();
    const smokeContent = `---
strategy_id: smoke
red_exit_condition: "Service does not respond"
green_exit_condition: "Service responds with exit zero"
gaming_blockers:
  - "No assertions"
assertion_rules: "Minimal assertions only."
seed_data_rule: "Use live or seeded environment."
handoff_format: "SHA-256 hash of smoke script"
permitted_tools:
  - "curl"
  - "httpie"
---

# Smoke
`;
    writeFileSync(join(dir, 'smoke.md'), smokeContent);

    const { profile, fallback } = getStrategyProfile('smoke', dir);

    assert.equal(fallback, false);
    assert.equal(profile.strategy_id, 'smoke');
  });
});

// ---------------------------------------------------------------------------
// getStrategyProfile — file not found fallback
// ---------------------------------------------------------------------------

describe('getStrategyProfile — file not found', () => {
  test('returns unit fallback when profile file is missing', () => {
    const dir = makeTempDir();
    // Do NOT write any file

    const { profile, warnings, fallback } = getStrategyProfile('unit', dir);

    assert.equal(fallback, true);
    assert.deepEqual(profile, UNIT_PROFILE);
    assert.equal(warnings.length, 1);
    assert.ok(
      warnings[0].includes('not found'),
      `Expected "not found" in warning, got: "${warnings[0]}"`
    );
    assert.ok(
      warnings[0].includes('unit'),
      `Expected strategy id in warning, got: "${warnings[0]}"`
    );
  });

  test('advisory message mentions "falling back to unit profile"', () => {
    const dir = makeTempDir();

    const { warnings } = getStrategyProfile('contract', dir);

    assert.ok(
      warnings[0].includes('falling back to unit profile'),
      `Expected fallback advisory in warning, got: "${warnings[0]}"`
    );
  });
});

// ---------------------------------------------------------------------------
// getStrategyProfile — invalid strategy ID
// ---------------------------------------------------------------------------

describe('getStrategyProfile — invalid strategy ID', () => {
  test('returns unit fallback for unknown slug', () => {
    const dir = makeTempDir();

    const { profile, warnings, fallback } = getStrategyProfile('nonexistent', dir);

    assert.equal(fallback, true);
    assert.deepEqual(profile, UNIT_PROFILE);
    assert.equal(warnings.length, 1);
  });

  test('returns unit fallback for empty string', () => {
    const dir = makeTempDir();

    const { profile, warnings, fallback } = getStrategyProfile('', dir);

    assert.equal(fallback, true);
    assert.deepEqual(profile, UNIT_PROFILE);
    assert.equal(warnings.length, 1);
  });

  test('returns unit fallback for ID with uppercase letters', () => {
    const dir = makeTempDir();

    const { profile, fallback } = getStrategyProfile('Unit', dir);

    assert.equal(fallback, true);
    assert.deepEqual(profile, UNIT_PROFILE);
  });

  test('returns unit fallback for ID with numbers', () => {
    const dir = makeTempDir();

    const { fallback } = getStrategyProfile('unit1', dir);

    assert.equal(fallback, true);
  });

  test('returns unit fallback for null-like value (undefined as string)', () => {
    const dir = makeTempDir();

    const { fallback } = getStrategyProfile('undefined', dir);

    // 'undefined' passes regex but is not a known registry ID
    assert.equal(fallback, true);
  });
});

// ---------------------------------------------------------------------------
// getStrategyProfile — malformed profile
// ---------------------------------------------------------------------------

describe('getStrategyProfile — malformed profile', () => {
  test('returns unit fallback when required field is missing', () => {
    const dir = makeTempDir();
    // Missing green_exit_condition and gaming_blockers
    const malformed = `---
strategy_id: unit
red_exit_condition: "Something"
assertion_rules: "Rules"
seed_data_rule: "Seed rule"
handoff_format: "Format"
permitted_tools:
  - "node:test"
---
`;
    writeFileSync(join(dir, 'unit.md'), malformed);

    const { profile, warnings, fallback } = getStrategyProfile('unit', dir);

    assert.equal(fallback, true);
    assert.deepEqual(profile, UNIT_PROFILE);
    assert.equal(warnings.length, 1);
    assert.ok(
      warnings[0].includes('missing required fields'),
      `Expected "missing required fields" in warning, got: "${warnings[0]}"`
    );
  });

  test('warning lists the specific missing fields', () => {
    const dir = makeTempDir();
    const malformed = `---
strategy_id: unit
red_exit_condition: "Something"
---
`;
    writeFileSync(join(dir, 'unit.md'), malformed);

    const { warnings } = getStrategyProfile('unit', dir);

    assert.ok(
      warnings[0].includes('green_exit_condition'),
      `Expected "green_exit_condition" in warning, got: "${warnings[0]}"`
    );
    assert.ok(
      warnings[0].includes('gaming_blockers'),
      `Expected "gaming_blockers" in warning, got: "${warnings[0]}"`
    );
  });

  test('returns unit fallback when file has no frontmatter', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'unit.md'), '# No frontmatter here\n\nJust prose.');

    const { profile, fallback } = getStrategyProfile('unit', dir);

    assert.equal(fallback, true);
    assert.deepEqual(profile, UNIT_PROFILE);
  });

  test('returns unit fallback when gaming_blockers is empty array', () => {
    const dir = makeTempDir();
    // gaming_blockers key present but no items
    const emptyArray = `---
strategy_id: unit
red_exit_condition: "Something"
green_exit_condition: "Something else"
gaming_blockers:
assertion_rules: "Rules"
seed_data_rule: "Seed"
handoff_format: "Format"
permitted_tools:
  - "node:test"
---
`;
    writeFileSync(join(dir, 'unit.md'), emptyArray);

    const { fallback } = getStrategyProfile('unit', dir);

    assert.equal(fallback, true);
  });
});

// ---------------------------------------------------------------------------
// getStrategyProfile — warnings array shape
// ---------------------------------------------------------------------------

describe('getStrategyProfile — warnings array', () => {
  test('warnings is an empty array on successful load', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'unit.md'), VALID_UNIT_MD);

    const { warnings } = getStrategyProfile('unit', dir);

    assert.ok(Array.isArray(warnings));
    assert.equal(warnings.length, 0);
  });

  test('warnings contains exactly one entry on fallback', () => {
    const dir = makeTempDir();

    const { warnings } = getStrategyProfile('unit', dir);

    assert.ok(Array.isArray(warnings));
    assert.equal(warnings.length, 1);
  });

  test('warnings entries are strings', () => {
    const dir = makeTempDir();

    const { warnings } = getStrategyProfile('badid', dir);

    for (const w of warnings) {
      assert.equal(typeof w, 'string');
    }
  });
});

// ---------------------------------------------------------------------------
// getStrategyProfile — integration profile (real file)
// ---------------------------------------------------------------------------

describe('getStrategyProfile — integration profile (real file)', () => {
  test('loads integration profile without fallback', () => {
    const { profile, warnings, fallback } = getStrategyProfile('integration', REAL_PROFILES_DIR);
    assert.equal(fallback, false, `Should not fall back to unit profile. Warnings: ${warnings.join(', ')}`);
    assert.deepEqual(warnings, []);
    assert.equal(profile.strategy_id, 'integration');
  });

  test('integration profile has all required fields', () => {
    const { profile } = getStrategyProfile('integration', REAL_PROFILES_DIR);
    const REQUIRED = ['strategy_id', 'red_exit_condition', 'green_exit_condition', 'gaming_blockers', 'assertion_rules', 'seed_data_rule', 'handoff_format', 'permitted_tools'];
    for (const field of REQUIRED) {
      assert.ok(profile[field] !== undefined && profile[field] !== null, `Missing field: ${field}`);
    }
  });

  test('integration profile gaming_blockers is non-empty', () => {
    const { profile } = getStrategyProfile('integration', REAL_PROFILES_DIR);
    assert.ok(Array.isArray(profile.gaming_blockers));
    assert.ok(profile.gaming_blockers.length >= 3, 'Expected at least 3 gaming blockers');
  });

  test('integration profile permitted_tools is non-empty', () => {
    const { profile } = getStrategyProfile('integration', REAL_PROFILES_DIR);
    assert.ok(Array.isArray(profile.permitted_tools));
    assert.ok(profile.permitted_tools.length > 0);
  });
});
