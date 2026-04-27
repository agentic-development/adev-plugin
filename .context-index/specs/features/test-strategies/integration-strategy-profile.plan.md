# Implementation Plan: Integration Strategy Profile

> **Methodology:** adev
> **Charter:** .context-index/specs/features/test-strategies/charter.md
> **Spec:** .context-index/specs/features/test-strategies/integration-strategy-profile.md
> **Review:** PASS_WITH_NOTES (2026-04-27)
> **Platform:** JavaScript (ESM), Node.js, node:test

**Goal:** Register `integration` as the 9th test strategy — covering behavioral tests against real external infrastructure — by adding the strategy registry entry, profile markdown, detection heuristics, gaming patterns, and write-test skill instruction.

**Architecture:** `integration` plugs into the existing strategy extension points in `lib/test-strategies/`: registry → profiles → detection → gaming. Each layer is independently tested and the `getStrategyProfile` machinery already handles any strategy ID once the registry validates it. `skills/write-test/SKILL.md` carries the mandatory Infrastructure Requirements block instruction consumed at runtime by Claude; no new executable code is required there.

---

## File Structure

**Create:**
- `lib/test-strategies/profiles/integration.md` — integration strategy profile with all required frontmatter fields
- `tests/lib/test-strategies/integration-gaming.test.mjs` — tests for integration-specific gaming patterns

**Modify:**
- `lib/test-strategies/registry.mjs` — add `integration` as 9th entry (alphabetical position between `fixture` and `policy`)
- `lib/test-strategies/detection.mjs` — add project-level and task-level integration detection rules
- `lib/test-strategies/gaming.mjs` — add BOUNDARY_MOCKING, CI_BYPASS, CREDENTIAL_ABSENT_PASS; export INTEGRATION_PATTERNS
- `skills/write-test/SKILL.md` — add mandatory Infrastructure Requirements block instruction for strategy=integration
- `tests/lib/test-strategies/registry.test.mjs` — update count 8→9, add integration to ALL_IDS, remove integration from null assertions
- `tests/lib/test-strategies/detection.test.mjs` — add tests for integration project-level and task-level detection
- `tests/lib/test-strategies/profiles.test.mjs` — add test for integration profile loading
- `.context-index/specs/features/test-strategies/strategy-type-registry.md` — update count and add integration entry
- `.context-index/specs/features/test-strategies/strategy-profile-contract.md` — update "8 known slugs" to registry-dynamic validation
- `.context-index/specs/features/test-strategies/cross-strategy-gaming-patterns.md` — update "any of the 8 types" wording

**Reference (read, do not modify):**
- `lib/test-strategies/profiles/contract.md` — follow this profile frontmatter structure
- `tests/lib/test-strategies/profiles.test.mjs` — follow existing test patterns for new profile test
- `tests/lib/test-strategies/gaming.test.mjs` — follow existing pattern structure for new gaming tests

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/test-strategies/integration-strategy-profile.md` (Behavior 7 — detection; Actionable Task Map: "Update strategy-type-registry")
- Charter: `.context-index/specs/features/test-strategies/charter.md` (capability: Strategy Type Registry)
- Reference: `lib/test-strategies/registry.mjs` — understand STRATEGIES array structure and alphabetical ordering

### Task 2 Context
- Spec: `.context-index/specs/features/test-strategies/integration-strategy-profile.md` (Behaviors 2, 3, 4, 5, 6, 8 — full profile)
- Charter: `.context-index/specs/features/test-strategies/charter.md` (capability: Strategy Profile Contract)
- Reference: `lib/test-strategies/profiles/contract.md` — exact frontmatter format to follow
- Reference: `lib/test-strategies/profiles.mjs:42-53` — REQUIRED_FIELDS and ARRAY_FIELDS for validation
- **Depends on Task 1** (registry must include `integration` before `getStrategyProfile` can load the profile without fallback)

### Task 3 Context
- Spec: `.context-index/specs/features/test-strategies/integration-strategy-profile.md` (Behavior 7 — detection heuristics)
- Charter: `.context-index/specs/features/test-strategies/charter.md` (capability: Strategy Detection Heuristics)
- Reference: `lib/test-strategies/detection.mjs` — existing detection patterns and helper functions
- Reference: `tests/lib/test-strategies/detection.test.mjs` — existing test helper `touch()` and `mkdir()` patterns

### Task 4 Context
- Spec: `.context-index/specs/features/test-strategies/integration-strategy-profile.md` (Behavior 4 — gaming rules; Error Cases: INTEGRATION_NO_CREDENTIALS, INTEGRATION_HOST_UNREACHABLE)
- Charter: `.context-index/specs/features/test-strategies/charter.md` (capability: Cross-strategy Gaming Patterns)
- Reference: `lib/test-strategies/gaming.mjs` — existing SHARED_PATTERNS structure and `lineMatches` helper
- Reference: `tests/lib/test-strategies/gaming.test.mjs` — existing test patterns for describe/test blocks

### Task 5 Context
- Spec: `.context-index/specs/features/test-strategies/integration-strategy-profile.md` (Behaviors 2, 3 — RED/GREEN definition, mandatory infra block; Error Cases: INTEGRATION_NO_REQUIREMENTS_BLOCK)
- Charter: `.context-index/specs/features/test-strategies/charter.md` (capability: Write-test Dispatch)
- Reference: `skills/write-test/SKILL.md:81-103` — existing strategy profile loading section to extend

### Task 6 Context
- Spec: `.context-index/specs/features/test-strategies/integration-strategy-profile.md` (charter extension note)
- Reference: `strategy-type-registry.md`, `strategy-profile-contract.md`, `cross-strategy-gaming-patterns.md` — sections to update

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 (Task 2's profile loading validates against the registry; `getStrategy('integration')` must return non-null before the profile test can pass)
- Group B (independent): Task 3 (detection.mjs — no shared files with A)
- Group C (independent): Task 4 (gaming.mjs — no shared files with A, B)
- Group D (independent): Task 5 (SKILL.md — no shared files)
- Group E (independent): Task 6 (spec docs — no shared files)

Groups B, C, D, E can run in parallel with Group A.

---

## Tasks

### Task 1: Register `integration` in strategy registry [specialist: none]

**Charter capability:** Strategy Type Registry
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/test-strategies/registry.mjs`
- Modify: `tests/lib/test-strategies/registry.test.mjs`

**Tests:** `tests/lib/test-strategies/registry.test.mjs`

**Context to load:**
- `lib/test-strategies/registry.mjs` — STRATEGIES array structure

- [x] **Write failing test**

In `tests/lib/test-strategies/registry.test.mjs`, make these changes:

1. Update `ALL_IDS` to add `'integration'` in alphabetical position (between `fixture` and `policy`):
```javascript
const ALL_IDS = [
  'contract',
  'fixture',
  'integration',  // ADD
  'policy',
  'schema',
  'smoke',
  'threshold',
  'unit',
  'visual',
];
```

2. Update count assertion (line 30):
```javascript
test('registry has exactly 9 strategies', () => {
  assert.equal(listStrategies().length, 9);
});
```

3. Update the `getStrategy returns null for unknown id` test (line 61) — remove `integration` from the null assertion list:
```javascript
test('getStrategy returns null for unknown id', () => {
  assert.equal(getStrategy('unknown'), null);
  assert.equal(getStrategy('e2e'), null);
});
```

4. Add a new test for integration specifically:
```javascript
test('getStrategy returns valid object for integration', () => {
  const s = getStrategy('integration');
  assert.ok(s !== null, 'getStrategy("integration") should not return null');
  assert.equal(s.id, 'integration');
  assert.equal(typeof s.name, 'string');
  assert.equal(typeof s.description, 'string');
  assert.ok(Array.isArray(s.typicalTools));
});
```

- [x] **Verify test fails**

```bash
node --test tests/lib/test-strategies/registry.test.mjs
```
Expected: FAIL — count is 8 (not 9), `getStrategy('integration')` returns null

- [x] **Implement**

In `lib/test-strategies/registry.mjs`, insert the `integration` entry into STRATEGIES in alphabetical position (after `fixture`, before `policy`):

```javascript
Object.freeze({
  id: 'integration',
  name: 'Integration Testing',
  description:
    'Behavioral tests that run against real external infrastructure (cloud APIs, databases, message queues, HTTP services) with no mocking at the infrastructure layer. Verifies that the implementation correctly interacts with live external systems under realistic conditions.',
  redSemantics:
    'The test fails because the system under test behaves incorrectly against real infrastructure — an assertion about state, response, or side-effect fails. RED caused by missing credentials or unreachable hosts is NOT valid RED and must be resolved as infrastructure setup.',
  greenSemantics:
    'All behavioral assertions pass against live external infrastructure. The implementation correctly interacts with the real service under realistic conditions.',
  domain: 'external service adapters and connectors',
  typicalTools: Object.freeze([
    'AWS SDK v3',
    'node-postgres (pg)',
    'mysql2',
    'mongodb driver',
    'ioredis',
    'kafkajs',
    'undici',
  ]),
}),
```

- [x] **Verify test passes**

```bash
node --test tests/lib/test-strategies/registry.test.mjs
```
Expected: PASS — 9 strategies, `getStrategy('integration')` returns non-null

- [x] **Commit**

Branch: `feat/test-strategies/integration-strategy-profile`

```bash
git add lib/test-strategies/registry.mjs tests/lib/test-strategies/registry.test.mjs
git commit -m "feat(test-strategies): register integration as 9th strategy type"
```

---

### Task 2: Create integration strategy profile [specialist: none]

**Charter capability:** Strategy Profile Contract
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `lib/test-strategies/profiles/integration.md`
- Modify: `tests/lib/test-strategies/profiles.test.mjs`

**Tests:** `tests/lib/test-strategies/profiles.test.mjs`

**Context to load:**
- `lib/test-strategies/profiles/contract.md` — exact frontmatter format
- `lib/test-strategies/profiles.mjs:42-53` — REQUIRED_FIELDS list

- [x] **Write failing test**

In `tests/lib/test-strategies/profiles.test.mjs`, add a describe block that tests loading the real integration profile from the actual profiles directory:

```javascript
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REAL_PROFILES_DIR = resolve(__dirname, '../../../lib/test-strategies/profiles');

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
```

- [x] **Verify test fails**

```bash
node --test tests/lib/test-strategies/profiles.test.mjs
```
Expected: FAIL — `lib/test-strategies/profiles/integration.md` does not exist (ENOENT → falls back to unit with `fallback: true`)

- [x] **Implement**

Create `lib/test-strategies/profiles/integration.md` with all required frontmatter fields:

```markdown
---
strategy_id: integration
red_exit_condition: "Test fails because the system under test behaves incorrectly against real infrastructure — an assertion about state, response, or side-effect fails. RED caused by missing credentials (INTEGRATION_NO_CREDENTIALS) or unreachable hosts (INTEGRATION_HOST_UNREACHABLE) is NOT valid RED — these are setup errors that must be resolved before the TDD cycle begins."
green_exit_condition: "All behavioral assertions pass against live external infrastructure. The implementation correctly interacts with the real service under realistic conditions — actual database rows exist, actual S3 objects were created/deleted, actual queue messages were sent/received."
gaming_blockers:
  - "Boundary mocking — mocking the specific external system this module wraps (e.g., jest.mock('S3Client') in an S3 adapter test, mocking the DB driver in a repository test)"
  - "In-process substitutes — using SQLite instead of Postgres, in-memory queue instead of SQS, local HTTP server instead of the real third-party API (unless explicitly documented in spec infra_requirements.notes)"
  - "Credential-absent pass — tests that pass when required env vars are unset; tests must fail fast with a clear error message when credentials are missing"
  - "CI bypass — if (process.env.CI) { skip() } or equivalent; integration tests must run in CI when credentials are available"
  - "Stale state dependency — tests that rely on state left by a prior test run; setup/teardown must be idempotent"
  - "Cross-test coupling — tests that fail when run in isolation because they depend on side effects of other integration tests"
assertion_rules: "Assert against real external state: actual database rows, actual S3 objects, actual queue message counts, actual HTTP response bodies from live endpoints. Cover at least one error path that only manifests with real infrastructure (constraint violations, rate limits, idempotency). Never assert against mocked or simulated responses."
seed_data_rule: "All test data created in before/setup hook and destroyed in after/teardown hook. Random suffixes or UUIDs required for resource names to prevent cross-run collisions (e.g., adev-test-bucket-${crypto.randomUUID()}). Tests must be runnable in parallel without interference via unique resource names."
handoff_format: "Infrastructure requirements block (systems, env vars, pre-provisioned state, connectivity, CI notes) + test file paths + list of external systems verified (service/operation/assertion) + teardown verification (all created resources deleted) + CI invocation command + total run time observed during RED verification"
permitted_tools:
  - "AWS SDK v3 (from project dependencies)"
  - "Google Cloud client libraries (from project dependencies)"
  - "Azure SDK (from project dependencies)"
  - "pg (node-postgres, from project dependencies)"
  - "mysql2 (from project dependencies)"
  - "mongodb driver (from project dependencies)"
  - "ioredis (from project dependencies)"
  - "amqplib (from project dependencies)"
  - "kafkajs (from project dependencies)"
  - "undici or fetch (from project dependencies)"
  - "Testcontainers (when documented as accepted local substitute in spec infra_requirements.notes)"
---

# Integration Strategy Profile

Behavioral tests against real external infrastructure. No mocking at the infrastructure boundary. Tests verify actual interactions with live cloud APIs, databases, message queues, and third-party HTTP services.

## Infrastructure Boundary Rule

The infrastructure boundary is the specific external system that the module under test is designed to wrap, connect to, or adapt. Mocking that system is a gaming violation. Mocking layers above it (other adapters, helpers, internal functions) is allowed.

| Module purpose | Infrastructure boundary | Mocking allowed |
|---|---|---|
| S3 adapter | AWS S3 API | Internal helpers, retry logic, serialization |
| Order service (calls S3 adapter) | Order service behavior | The S3 adapter — mock `uploadFile()` |
| Queue consumer | AWS SQS | Message parsing, downstream handlers |

## Error Codes

- `INTEGRATION_NO_CREDENTIALS` — required env vars missing; block with clear message, do NOT count as RED
- `INTEGRATION_HOST_UNREACHABLE` — external host unreachable; block with clear message, do NOT count as RED
- `INTEGRATION_STALE_STATE` — pre-existing state found; block, fix teardown
- `INTEGRATION_NO_REQUIREMENTS_BLOCK` — RED started without emitting infrastructure requirements block; block
```

- [x] **Verify test passes**

```bash
node --test tests/lib/test-strategies/profiles.test.mjs
```
Expected: PASS — all integration profile tests pass

- [x] **Commit**

```bash
git add lib/test-strategies/profiles/integration.md tests/lib/test-strategies/profiles.test.mjs
git commit -m "feat(test-strategies): add integration strategy profile"
```

---

### Task 3: Add integration detection heuristics [specialist: none]

**Charter capability:** Strategy Detection Heuristics
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/test-strategies/detection.mjs`
- Modify: `tests/lib/test-strategies/detection.test.mjs`

**Tests:** `tests/lib/test-strategies/detection.test.mjs`

**Context to load:**
- `lib/test-strategies/detection.mjs` — existing detection rules structure
- `tests/lib/test-strategies/detection.test.mjs` — existing `touch()` and `mkdir()` helper patterns

- [x] **Write failing test**

In `tests/lib/test-strategies/detection.test.mjs`, add tests for project-level and task-level integration detection:

```javascript
// --- Project-level: integration ---

describe('detectStrategies — integration project-level', () => {
  test('detects integration (high) when adapters/ directory exists', async () => {
    const dir = createTempDir();
    try {
      mkdir(dir, 'adapters');
      const results = await detectStrategies(dir);
      const entry = results.find((r) => r.strategyId === 'integration');
      assert.ok(entry, 'Expected integration to be detected');
      assert.equal(entry.confidence, 'high');
    } finally {
      cleanupTempDir(dir);
    }
  });

  test('detects integration (high) when integrations/ directory exists', async () => {
    const dir = createTempDir();
    try {
      mkdir(dir, 'integrations');
      const results = await detectStrategies(dir);
      const entry = results.find((r) => r.strategyId === 'integration');
      assert.ok(entry, 'Expected integration to be detected');
      assert.equal(entry.confidence, 'high');
    } finally {
      cleanupTempDir(dir);
    }
  });

  test('detects integration (high) when connectors/ directory exists', async () => {
    const dir = createTempDir();
    try {
      mkdir(dir, 'connectors');
      const results = await detectStrategies(dir);
      const entry = results.find((r) => r.strategyId === 'integration');
      assert.ok(entry, 'Expected integration to be detected');
      assert.equal(entry.confidence, 'high');
    } finally {
      cleanupTempDir(dir);
    }
  });

  test('detects integration (high) when serverless.yml exists', async () => {
    const dir = createTempDir();
    try {
      touch(dir, 'serverless.yml');
      const results = await detectStrategies(dir);
      const entry = results.find((r) => r.strategyId === 'integration');
      assert.ok(entry, 'Expected integration to be detected');
      assert.equal(entry.confidence, 'high');
    } finally {
      cleanupTempDir(dir);
    }
  });
});

// --- Task-level: integration ---

describe('detectTaskStrategy — integration task-level', () => {
  test('detects integration (medium) for path under adapters/', () => {
    const result = detectTaskStrategy(['src/adapters/s3-client.mjs']);
    assert.equal(result.strategyId, 'integration');
    assert.equal(result.confidence, 'medium');
  });

  test('detects integration (medium) for path under integrations/', () => {
    const result = detectTaskStrategy(['lib/integrations/stripe.mjs']);
    assert.equal(result.strategyId, 'integration');
    assert.equal(result.confidence, 'medium');
  });

  test('detects integration (medium) for path under connectors/', () => {
    const result = detectTaskStrategy(['src/connectors/kafka.mjs']);
    assert.equal(result.strategyId, 'integration');
    assert.equal(result.confidence, 'medium');
  });

  test('detects integration (medium) for *-adapter.* filename pattern', () => {
    const result = detectTaskStrategy(['src/storage/s3-adapter.mjs']);
    assert.equal(result.strategyId, 'integration');
    assert.equal(result.confidence, 'medium');
  });

  test('detects integration (medium) for *-client.* filename pattern', () => {
    const result = detectTaskStrategy(['lib/stripe-client.mjs']);
    assert.equal(result.strategyId, 'integration');
    assert.equal(result.confidence, 'medium');
  });

  test('integration does not override schema for migrations/ paths', () => {
    const result = detectTaskStrategy(['db/migrations/001_create_users.sql']);
    assert.equal(result.strategyId, 'schema', 'schema takes precedence over integration for migrations/');
  });

  test('contract takes precedence over integration for .proto files', () => {
    const result = detectTaskStrategy(['proto/adapters/service.proto']);
    assert.equal(result.strategyId, 'contract', 'contract takes precedence for .proto files');
  });
});
```

- [x] **Verify test fails**

```bash
node --test tests/lib/test-strategies/detection.test.mjs
```
Expected: FAIL — no integration detection rules exist yet

- [x] **Implement**

In `lib/test-strategies/detection.mjs`:

**Project-level** — after the `threshold` detection block and before `if (timedOut)`:
```javascript
// integration (high): adapters/, integrations/, connectors/ directories
// OR cloud-provider config files: serverless.yml/yaml, pulumi.yaml, firebase.json, app.yaml
if (
  dirNames.has('adapters') ||
  dirNames.has('integrations') ||
  dirNames.has('connectors')
) {
  addStrategy(results, 'integration', 'high');
}

if (
  fileNames.has('serverless.yml') ||
  fileNames.has('serverless.yaml') ||
  fileNames.has('pulumi.yaml') ||
  fileNames.has('firebase.json') ||
  fileNames.has('app.yaml')
) {
  addStrategy(results, 'integration', 'high');
}
```

**Task-level** — in `detectTaskStrategy`, add BEFORE the `// default` fallback line. Insert after the `threshold` block:
```javascript
// integration (medium): adapters/, integrations/, connectors/, clients/, providers/ directories
// OR filename patterns: *-adapter.*, *-connector.*, *-client.*, *-gateway.*
if (
  parts.includes('adapters') ||
  parts.includes('integrations') ||
  parts.includes('connectors') ||
  parts.includes('clients') ||
  parts.includes('providers')
) {
  return { strategyId: 'integration', confidence: 'medium' };
}

if (
  /-adapter\.[a-z]+$/.test(name) ||
  /-connector\.[a-z]+$/.test(name) ||
  /-client\.[a-z]+$/.test(name) ||
  /-gateway\.[a-z]+$/.test(name)
) {
  return { strategyId: 'integration', confidence: 'medium' };
}
```

Note: schema, policy, fixture, and contract rules precede integration in the function — existing high-confidence rules take priority by virtue of returning first (e.g., `migrations/` → schema, `.proto` → contract). This implements the precedence rule from PASS_WITH_NOTES finding SA-4: contract takes precedence when `.pact.json`, `.proto`, or OpenAPI files are present because those rules fire earlier in the function.

- [x] **Verify test passes**

```bash
node --test tests/lib/test-strategies/detection.test.mjs
```
Expected: PASS — all new integration detection tests pass, existing tests unaffected

- [x] **Commit**

```bash
git add lib/test-strategies/detection.mjs tests/lib/test-strategies/detection.test.mjs
git commit -m "feat(test-strategies): add integration strategy detection heuristics"
```

---

### Task 4: Add integration gaming patterns [specialist: none]

**Charter capability:** Cross-strategy Gaming Patterns
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/test-strategies/gaming.mjs`
- Create: `tests/lib/test-strategies/integration-gaming.test.mjs`

**Tests:** `tests/lib/test-strategies/integration-gaming.test.mjs`

**Context to load:**
- `lib/test-strategies/gaming.mjs` — existing pattern structure and `lineMatches` helper
- `tests/lib/test-strategies/gaming.test.mjs` — existing test structure to follow

- [x] **Write failing test**

Create `tests/lib/test-strategies/integration-gaming.test.mjs`:

```javascript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { INTEGRATION_PATTERNS } from '../../../lib/test-strategies/gaming.mjs';

describe('INTEGRATION_PATTERNS export', () => {
  test('is an array with at least 3 patterns', () => {
    assert.ok(Array.isArray(INTEGRATION_PATTERNS));
    assert.ok(INTEGRATION_PATTERNS.length >= 3, 'Expected BOUNDARY_MOCKING, CI_BYPASS, CREDENTIAL_ABSENT_PASS');
  });

  test('each pattern has id, name, description, and detect function', () => {
    for (const p of INTEGRATION_PATTERNS) {
      assert.equal(typeof p.id, 'string', `pattern ${p.id} missing id`);
      assert.equal(typeof p.name, 'string', `pattern ${p.id} missing name`);
      assert.equal(typeof p.description, 'string', `pattern ${p.id} missing description`);
      assert.equal(typeof p.detect, 'function', `pattern ${p.id} missing detect function`);
    }
  });
});

describe('BOUNDARY_MOCKING pattern', () => {
  const pattern = INTEGRATION_PATTERNS.find((p) => p.id === 'BOUNDARY_MOCKING');

  test('detects jest.mock() with module path containing S3Client', () => {
    const content = `jest.mock('@aws-sdk/client-s3', () => ({ S3Client: jest.fn() }));`;
    const violations = pattern.detect(content);
    assert.ok(violations.length > 0, 'Expected a BOUNDARY_MOCKING violation');
  });

  test('detects jest.mock() with sinon.stub patterns on database drivers', () => {
    const content = `const stub = sinon.stub(pool, 'query').resolves([]);`;
    const violations = pattern.detect(content);
    assert.ok(violations.length > 0, 'Expected a BOUNDARY_MOCKING violation for DB driver stub');
  });

  test('does not flag mocking of internal helper functions', () => {
    const content = `jest.mock('../utils/retry', () => ({ retry: jest.fn() }));`;
    const violations = pattern.detect(content);
    assert.equal(violations.length, 0, 'Should not flag internal helper mocks');
  });
});

describe('CI_BYPASS pattern', () => {
  const pattern = INTEGRATION_PATTERNS.find((p) => p.id === 'CI_BYPASS');

  test('detects if (process.env.CI) skip pattern', () => {
    const content = `if (process.env.CI) { test.skip('skips in CI', () => {}); }`;
    const violations = pattern.detect(content);
    assert.ok(violations.length > 0, 'Expected a CI_BYPASS violation');
  });

  test('detects process.env.CI combined with skip/return', () => {
    const content = `if (process.env.CI) return;\nassert.ok(true);`;
    const violations = pattern.detect(content);
    assert.ok(violations.length > 0, 'Expected a CI_BYPASS violation');
  });
});

describe('CREDENTIAL_ABSENT_PASS pattern', () => {
  const pattern = INTEGRATION_PATTERNS.find((p) => p.id === 'CREDENTIAL_ABSENT_PASS');

  test('detects tests that do not check for required env vars', () => {
    const content = `
test('uploads file to S3', async () => {
  const client = new S3Client({ region: 'us-east-1' });
  const result = await client.send(new PutObjectCommand({ Bucket: 'test', Key: 'file' }));
  assert.ok(result);
});`;
    const violations = pattern.detect(content);
    assert.ok(violations.length > 0, 'Expected CREDENTIAL_ABSENT_PASS violation — no env var guard');
  });

  test('does not flag tests that guard for missing credentials', () => {
    const content = `
if (!process.env.AWS_ACCESS_KEY_ID) throw new Error('AWS_ACCESS_KEY_ID is required');
test('uploads file to S3', async () => {
  assert.ok(result);
});`;
    const violations = pattern.detect(content);
    assert.equal(violations.length, 0, 'Should not flag tests with credential guard');
  });
});
```

- [x] **Verify test fails**

```bash
node --test tests/lib/test-strategies/integration-gaming.test.mjs
```
Expected: FAIL — `INTEGRATION_PATTERNS` is not exported from gaming.mjs

- [x] **Implement**

In `lib/test-strategies/gaming.mjs`, add three new patterns and export them:

```javascript
// ---------------------------------------------------------------------------
// Integration-specific gaming patterns
// ---------------------------------------------------------------------------

/**
 * BOUNDARY_MOCKING: Detects jest.mock / sinon.stub / nock calls targeting
 * known infrastructure SDK module paths or driver objects.
 * Uses line-pattern matching on import path strings and stub targets.
 */
const BOUNDARY_MOCKING = {
  id: 'BOUNDARY_MOCKING',
  name: 'Boundary Mocking',
  description:
    'Detects mocking of the specific external system that the module under test wraps. Using jest.mock, nock, sinon.stub, or msw to intercept the declared infrastructure boundary is a gaming violation in integration tests.',

  detect(content) {
    // Match jest.mock / vi.mock with SDK/infra module paths
    const MOCK_RE = /(?:jest|vi)\.mock\(\s*['"`]([^'"`]+)['"`]/g;
    const STUB_RE = /sinon\.stub\s*\(\s*(\w+)\s*,\s*['"`](query|send|request|connect|execute)['"`]/g;
    const NOCK_RE = /\bnock\s*\(/g;

    const INFRA_PATHS = [
      /@aws-sdk/, /pg/, /mysql2/, /mongodb/, /ioredis/, /kafkajs/, /amqplib/,
      /stripe/, /twilio/, /sendgrid/, /@google-cloud/, /@azure/,
    ];

    const violations = [];

    let m;
    while ((m = MOCK_RE.exec(content)) !== null) {
      const modulePath = m[1];
      if (INFRA_PATHS.some((re) => re.test(modulePath))) {
        const lineNum = content.slice(0, m.index).split('\n').length;
        violations.push({
          line: lineNum,
          match: m[0].slice(0, 60),
          message: `Boundary mocking detected: mocking infrastructure module '${modulePath}' in an integration test is a gaming violation`,
        });
      }
    }

    while ((m = STUB_RE.exec(content)) !== null) {
      const lineNum = content.slice(0, m.index).split('\n').length;
      violations.push({
        line: lineNum,
        match: m[0].slice(0, 60),
        message: `Boundary mocking detected: sinon.stub on infrastructure driver method '${m[2]}' is a gaming violation`,
      });
    }

    while ((m = NOCK_RE.exec(content)) !== null) {
      const lineNum = content.slice(0, m.index).split('\n').length;
      violations.push({
        line: lineNum,
        match: 'nock(',
        message: 'Boundary mocking detected: nock() intercepts HTTP — use real HTTP calls in integration tests',
      });
    }

    return violations;
  },
};

/**
 * CI_BYPASS: Detects tests that skip execution when process.env.CI is set.
 */
const CI_BYPASS = {
  id: 'CI_BYPASS',
  name: 'CI Bypass',
  description:
    'Detects if (process.env.CI) skip/return patterns. Integration tests must run in CI when credentials are available — bypassing them in CI defeats the purpose of the strategy.',

  detect(content) {
    const CI_RE = /if\s*\(\s*process\.env\.CI\s*\)/g;
    const violations = [];
    let m;
    while ((m = CI_RE.exec(content)) !== null) {
      const lineNum = content.slice(0, m.index).split('\n').length;
      violations.push({
        line: lineNum,
        match: 'if (process.env.CI)',
        message: 'CI bypass detected: integration tests must run in CI when credentials are available',
      });
    }
    return violations;
  },
};

/**
 * CREDENTIAL_ABSENT_PASS: Detects integration tests that use known SDK
 * constructors without any env var guard. Tests that pass without credentials
 * are not exercising the real infrastructure path.
 */
const CREDENTIAL_ABSENT_PASS = {
  id: 'CREDENTIAL_ABSENT_PASS',
  name: 'Credential-Absent Pass',
  description:
    'Detects integration tests that instantiate infrastructure SDK clients without any credential guard. Tests must fail fast with a clear error when required env vars are missing.',

  detect(content) {
    // Look for SDK constructors without a preceding env var guard in the same file
    const SDK_RE = /new\s+(?:S3Client|DynamoDBClient|SQSClient|SNSClient|Client)\s*\(/g;
    const ENV_GUARD_RE = /process\.env\.\w+.*(?:throw|Error|required|missing)/gi;

    // Only flag if the file contains SDK instantiation but no env var guard
    const hasSDKUsage = SDK_RE.test(content);
    SDK_RE.lastIndex = 0; // reset after .test()
    const hasEnvGuard = ENV_GUARD_RE.test(content);

    if (!hasSDKUsage || hasEnvGuard) return [];

    // Find all SDK constructor locations
    const violations = [];
    let m;
    while ((m = SDK_RE.exec(content)) !== null) {
      const lineNum = content.slice(0, m.index).split('\n').length;
      violations.push({
        line: lineNum,
        match: m[0],
        message: 'Credential-absent pass risk: SDK client instantiated without env var guard. Add: if (!process.env.REQUIRED_VAR) throw new Error("... is required")',
      });
    }
    return violations;
  },
};

export const INTEGRATION_PATTERNS = [BOUNDARY_MOCKING, CI_BYPASS, CREDENTIAL_ABSENT_PASS];
```

- [x] **Verify test passes**

```bash
node --test tests/lib/test-strategies/integration-gaming.test.mjs
```
Expected: PASS

- [x] **Verify no regressions in shared gaming tests**

```bash
node --test tests/lib/test-strategies/gaming.test.mjs
```
Expected: PASS

- [x] **Commit**

```bash
git add lib/test-strategies/gaming.mjs tests/lib/test-strategies/integration-gaming.test.mjs
git commit -m "feat(test-strategies): add integration gaming detection patterns"
```

---

### Task 5: Update write-test SKILL.md for mandatory infra block [specialist: none]

**Charter capability:** Write-test Dispatch
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/write-test/SKILL.md`

**Tests:** No executable test — this is a markdown instruction consumed at runtime. Verify by manual inspection that the section is present in the correct location within the skill.

> **Note:** PASS_WITH_NOTES finding SA-8 (acceptance criteria 10–11 conflate detection with runtime) is acknowledged. The implementation plan follows the spec's intent: error codes `INTEGRATION_NO_CREDENTIALS` and `INTEGRATION_HOST_UNREACHABLE` are referenced as runtime blocks in the skill instruction, not as detection-phase outputs.

- [x] **Locate insertion point**

Read `skills/write-test/SKILL.md` and find the section that handles strategy profile loading (around "Step 2: Load Strategy Profile" or "In addition to the strategy-specific `gaming_blockers`"). Identify the exact line where the integration-specific instruction should be added — immediately after the general strategy loading section, before the RED phase steps.

- [x] **Add the integration-specific instruction**

Add the following section immediately after the strategy profile loading paragraph (after the `gaming_blockers` / `assertion_rules` / `permitted_tools` section and before RED phase instructions):

```markdown
### Integration Strategy: Mandatory Infrastructure Requirements Block

When the resolved strategy is `integration`:

**Before authoring any test code**, emit the following Infrastructure Requirements block. This is required by the spec (Behavior 3) and validated by `/adev:validate`. Proceeding to RED without this block triggers `INTEGRATION_NO_REQUIREMENTS_BLOCK`.

Read the spec's `infra_requirements:` frontmatter field if present (authoritative). If absent, derive from the task's file paths and the Behavior 4 boundary table. Document env var names only — never record actual values, connection strings with embedded passwords, or any secret material.

```
## Infrastructure Requirements

**Strategy:** integration
**External systems:** <comma-separated list, e.g., "AWS S3, Postgres 15">

### Credentials / Environment Variables
> **Never record actual credential values here.** List env var names and descriptions only.
> Note: connection-string variables like DATABASE_URL embed credentials — treat as secrets.

| Variable | Description |
|----------|-------------|
| VAR_NAME | Purpose and where to obtain it (e.g., AWS IAM console — inject as CI secret) |

### Pre-Provisioned State
- [x] <resource that must exist before tests run>

### Connectivity Requirements
- Test runner must reach <host/service> on <port/protocol>

### CI Notes
- These tests require real credentials — they CANNOT run without them
- Use a dedicated test account with scoped permissions (least privilege)
- Run with: `npm run test:integration` or `node --test --test-name-pattern "integration"`
- Expected run time: 30–120 seconds (network I/O dominates)
```

**Infrastructure setup errors are NOT valid RED:**
- Missing env vars → `INTEGRATION_NO_CREDENTIALS`: Block with "Integration tests require credentials. Set the variables listed in the Infrastructure Requirements block before running."
- Unreachable host → `INTEGRATION_HOST_UNREACHABLE`: Block with "External host unreachable — this is a setup error, not a test failure. Verify network access before interpreting this as a behavioral defect."

Resolve these setup errors before starting the TDD cycle.
```

- [x] **Verify**

Re-read `skills/write-test/SKILL.md` and confirm:
1. The "Integration Strategy: Mandatory Infrastructure Requirements Block" section is present
2. It appears AFTER the strategy profile loading section and BEFORE RED phase steps
3. The section references `INTEGRATION_NO_REQUIREMENTS_BLOCK`, `INTEGRATION_NO_CREDENTIALS`, `INTEGRATION_HOST_UNREACHABLE`
4. The credential prohibition note is present

- [x] **Commit**

```bash
git add skills/write-test/SKILL.md
git commit -m "feat(test-strategies): add mandatory infra block instruction to write-test skill"
```

---

### Task 6: Update sibling specs for integration strategy [specialist: none]

**Charter capability:** Strategy Type Registry (and cross-cutting spec maintenance)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `.context-index/specs/features/test-strategies/strategy-type-registry.md`
- Modify: `.context-index/specs/features/test-strategies/strategy-profile-contract.md`
- Modify: `.context-index/specs/features/test-strategies/cross-strategy-gaming-patterns.md`

**Tests:** No executable tests — these are spec documents. Verify by reading each file after edit.

> These are documentation-only updates (per the CLAUDE.md constitution: "Updating specs/ADRs when code changes affect their assumptions — this is required, not optional").

- [x] **Update strategy-type-registry.md**

Read the file. Find all occurrences of "8 strategies" or "8 strategy types" or "8 known" and update to 9. Find the strategy table or list and add the `integration` row/entry:

| Field | Value |
|---|---|
| id | `integration` |
| name | Integration Testing |
| description | Behavioral tests against real external infrastructure with no mocking at the infrastructure layer |
| red_semantics | Assertion fails against real infrastructure; credential/connectivity errors are NOT RED |
| green_semantics | All assertions pass against live external systems |
| domain | External service adapters and connectors |
| typical_tools | AWS SDK v3, node-postgres, mysql2, mongodb driver, ioredis, kafkajs, undici |

Update acceptance criteria: "exactly 8 strategy types" → "exactly 9 strategy types". Bump the spec's `revision` frontmatter field by 1 and set `updated: 2026-04-27`.

- [x] **Update strategy-profile-contract.md**

Read the file. Find the precondition that references "one of the 8 known slugs" or a hardcoded list of 8 strategy IDs. Change the validation language from a hardcoded count/list to registry-dynamic: "validated against the strategy registry via `getStrategy(strategyId)` — any registered strategy ID is valid." Update acceptance criteria: "getStrategyProfile returns a valid profile for any of the 8 strategy IDs" → "any of the 9 strategy IDs". Bump `revision` by 1 and set `updated: 2026-04-27`.

- [x] **Update cross-strategy-gaming-patterns.md**

Read the file. Find occurrences of "any of the 8 types" or "8 strategy types" in preconditions or scope statements. Change to "any registered strategy type". Bump `revision` by 1 and set `updated: 2026-04-27`.

- [x] **Verify**

Read each of the three files and confirm the updates are correct and no other content was accidentally changed.

- [x] **Commit**

```bash
git add \
  .context-index/specs/features/test-strategies/strategy-type-registry.md \
  .context-index/specs/features/test-strategies/strategy-profile-contract.md \
  .context-index/specs/features/test-strategies/cross-strategy-gaming-patterns.md
git commit -m "docs(test-strategies): update sibling specs for integration as 9th strategy"
```

---

## Strategy Summary

All 6 tasks resolve to `unit` (source: fallback, confidence: high). No non-unit strategies assigned — no infrastructure requirements section needed for this plan itself.

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [x] All tests pass: `npm test`
- [x] `getStrategy('integration')` returns non-null
- [x] `getStrategyProfile('integration', profilesDir)` returns `fallback: false`
- [x] `detectStrategies` for a dir with `adapters/` includes `{ strategyId: 'integration', confidence: 'high' }`
- [x] `detectTaskStrategy(['src/adapters/s3-client.mjs'])` returns `{ strategyId: 'integration', confidence: 'medium' }`
- [x] `INTEGRATION_PATTERNS` exported from gaming.mjs with 3 patterns
- [x] `skills/write-test/SKILL.md` contains "Integration Strategy: Mandatory Infrastructure Requirements Block" section
- [x] All acceptance criteria from spec satisfied (13 criteria)
