# Implementation Plan: Verification Runner and Schema Extension

> **Methodology:** adev
> **Charter:** .context-index/specs/features/infra-preflight/charter.md
> **Spec:** .context-index/specs/features/infra-preflight/verification-runner-and-schema.spec.md
> **Review:** PASS (2026-05-01)
> **Platform:** Node.js, JavaScript (ESM), node:test, npm

**Goal:** Build a generic infrastructure verification runner (`lib/infra-preflight.mjs`) that parses `infra_requirements` from spec/plan frontmatter, runs env var presence checks, CLI tool PATH/version checks, and connectivity probe commands, and returns a structured PreflightReport.

**Architecture:** The runner is a single ESM module (`lib/infra-preflight.mjs`) exporting three public functions: `parseInfraRequirements()`, `runPreflight()`, and `formatPreflightReport()`. It uses only Node.js built-ins (`fs`, `path`, `child_process`) for all I/O and process execution. The `@dotenvx/dotenvx` dependency is loaded via dynamic import with graceful degradation when unavailable. Probe commands execute via `execFileSync` with no shell — manual per-token `$VAR` substitution eliminates the shell injection surface. The module follows the existing `lib/` conventions (see `lib/source-manifest.mjs`, `lib/test-strategies/`) for code style and export patterns.

---

## File Structure

**Create:**
- `lib/infra-preflight.mjs` — Core module: parse, check, probe, format, orchestrate
- `tests/lib/infra-preflight.test.mjs` — Comprehensive unit tests for all behaviors
- `.context-index/adrs/0006-dotenvx-dependency.md` — ADR justifying `@dotenvx/dotenvx` dev dependency

**Modify:**
- `package.json` — Add `@dotenvx/dotenvx` as devDependency (pinned version with integrity hash)
- `templates/live-spec-template.md` — Add `cli_tools`, `probe`, `check_level`, `timeout`, `env_file` as commented examples in `infra_requirements` block

**Reference (read, do not modify):**
- `.context-index/specs/features/test-strategies/plan-infra-requirements.spec.md` — Existing schema for `infra_requirements` (this spec extends it)
- `lib/source-manifest.mjs` — Follow this module's pattern for path validation and error handling
- `lib/test-strategies/detection.mjs` — Follow this module's pattern for file-based detection
- `tests/lib/test-strategies/detection.test.mjs` — Follow this test pattern for temp dir setup/teardown
- `tests/helpers.mjs` — Use `createTempDir()`, `cleanupTempDir()`, `writeFixture()` in tests

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/infra-preflight/verification-runner-and-schema.spec.md` (ADR prerequisite section, System Constitution Reference)
- Charter: `.context-index/specs/features/infra-preflight/charter.md` (Dependencies table — dotenvx entry)
- Constitution: `.context-index/constitution.md` (Non-Negotiable Principles #1 — minimize external dependencies)
- ADR reference: `.context-index/adrs/0001-web-tree-sitter-dependency.md` (follow ADR format)

### Task 2 Context
- Spec: `.context-index/specs/features/infra-preflight/verification-runner-and-schema.spec.md` (Behaviors 1, Extended Schema)
- Spec dependency: `.context-index/specs/features/test-strategies/plan-infra-requirements.spec.md` (existing schema)
- Sample: `lib/source-manifest.mjs` (path validation pattern)

### Task 3 Context
- Spec: `.context-index/specs/features/infra-preflight/verification-runner-and-schema.spec.md` (Behaviors 3, Error Cases — PREFLIGHT_UNSAFE_ENV_FILE, PREFLIGHT_NO_DOTENVX)
- Constitution: `.context-index/constitution.md` (Non-Negotiable Principles #1)

### Task 4 Context
- Spec: `.context-index/specs/features/infra-preflight/verification-runner-and-schema.spec.md` (Behavior 4)

### Task 5 Context
- Spec: `.context-index/specs/features/infra-preflight/verification-runner-and-schema.spec.md` (Behavior 5, Error Cases — PREFLIGHT_INVALID_TOOL, PREFLIGHT_INVALID_VERSION)

### Task 6 Context
- Spec: `.context-index/specs/features/infra-preflight/verification-runner-and-schema.spec.md` (Behavior 6, Error Cases)
- Security: Behavior 11 (output sanitization at capture time)

### Task 7 Context
- Spec: `.context-index/specs/features/infra-preflight/verification-runner-and-schema.spec.md` (Behaviors 2, 7, 8, 9)
- Charter: `.context-index/specs/features/infra-preflight/charter.md` (Invariants — noInfra, timeout, PreflightReport)

### Task 8 Context
- Spec: `.context-index/specs/features/infra-preflight/verification-runner-and-schema.spec.md` (Behavior 10, Behavior 11)

### Task 9 Context
- Spec: `.context-index/specs/features/infra-preflight/verification-runner-and-schema.spec.md` (Extended Schema — commented examples)
- Template: `templates/live-spec-template.md` (existing infra_requirements block)

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8 (core module, each builds on prior)
- Group B (independent): Task 9 (template update, no file overlap with Group A)

Group B can run in parallel with Group A after Task 1 completes.

## Strategy Summary

| Strategy | Tasks | Source |
|----------|-------|--------|
| unit | 9 | fallback |

---

### Task 1: ADR for dotenvx dependency [specialist: none] [REQUIRES HUMAN APPROVAL]

**Charter capability:** Schema Extension (dependency justification)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `.context-index/adrs/0006-dotenvx-dependency.md`
- Modify: `package.json` (add devDependency)

**Tests:** `tests/lib/infra-preflight.test.mjs` — create the test file with a placeholder test verifying the ADR file exists

**Context to load:**
- `.context-index/adrs/0001-web-tree-sitter-dependency.md` (follow ADR format)
- `.context-index/specs/features/infra-preflight/verification-runner-and-schema.spec.md` (ADR prerequisite section)

- [ ] **Write failing test**

```javascript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..');

describe('ADR: dotenvx dependency', () => {
  test('ADR 0006 exists', () => {
    assert.ok(
      existsSync(join(PROJECT_ROOT, '.context-index', 'adrs', '0006-dotenvx-dependency.md')),
      'ADR 0006-dotenvx-dependency.md must exist'
    );
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/infra-preflight.test.mjs`
Expected: FAIL — ADR file does not exist

- [ ] **Implement**

Create ADR at `.context-index/adrs/0006-dotenvx-dependency.md` following the format of existing ADRs. Must address:
1. dotenvx does not make network calls during `.env` loading (verify from dotenvx source/docs)
2. Version is pinned with integrity hash in `package.json`
3. Dependency is dev-only and excluded from the published package via `files` field

Add `@dotenvx/dotenvx` to `devDependencies` in `package.json` with a pinned version. Run `npm install` to generate the integrity hash in `package-lock.json`.

- [ ] **Verify test passes**

Run: `node --test tests/lib/infra-preflight.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch (if not already created): `feat/infra-preflight/verification-runner`

```bash
git add .context-index/adrs/0006-dotenvx-dependency.md package.json package-lock.json tests/lib/infra-preflight.test.mjs
git commit -m "feat(infra-preflight): add ADR for dotenvx dependency and dev dependency"
```

---

### Task 2: parseInfraRequirements — frontmatter parsing and merge [specialist: none]

**Charter capability:** Verification Runner, Schema Extension
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/infra-preflight.mjs`
- Modify: `tests/lib/infra-preflight.test.mjs`

**Tests:** `tests/lib/infra-preflight.test.mjs`

**Context to load:**
- `.context-index/specs/features/infra-preflight/verification-runner-and-schema.spec.md` (Behavior 1, Extended Schema)
- `.context-index/specs/features/test-strategies/plan-infra-requirements.spec.md` (existing schema)

- [ ] **Write failing test**

```javascript
import { parseInfraRequirements } from '../../../lib/infra-preflight.mjs';

describe('parseInfraRequirements', () => {
  test('parses infra_requirements from YAML frontmatter', () => {
    const tmpDir = createTempDir();
    try {
      writeFixture(tmpDir, 'spec.md', `---
infra_requirements:
  systems:
    - name: "Postgres"
      env_vars: [DATABASE_URL]
---
# Spec
`);
      const result = parseInfraRequirements(join(tmpDir, 'spec.md'));
      assert.equal(result.systems.length, 1);
      assert.equal(result.systems[0].name, 'Postgres');
      assert.deepEqual(result.systems[0].env_vars, ['DATABASE_URL']);
    } finally {
      cleanupTempDir(tmpDir);
    }
  });

  test('returns null when no infra_requirements in frontmatter', () => {
    const tmpDir = createTempDir();
    try {
      writeFixture(tmpDir, 'spec.md', `---
status: draft
---
# Spec
`);
      const result = parseInfraRequirements(join(tmpDir, 'spec.md'));
      assert.equal(result, null);
    } finally {
      cleanupTempDir(tmpDir);
    }
  });

  test('throws PREFLIGHT_FILE_NOT_FOUND for missing file', () => {
    assert.throws(
      () => parseInfraRequirements('/nonexistent/file.md'),
      (err) => err.code === 'PREFLIGHT_FILE_NOT_FOUND'
    );
  });

  test('parses extended schema fields: cli_tools, probe, check_level, timeout, env_file', () => {
    const tmpDir = createTempDir();
    try {
      writeFixture(tmpDir, 'spec.md', `---
infra_requirements:
  env_file: ".env.test"
  systems:
    - name: "Postgres 15"
      env_vars: [DATABASE_URL]
      cli_tools:
        - psql
        - name: docker
          version: ">=24"
      probe: "pg_isready -h $DB_HOST"
      check_level: full
      timeout: 5
---
# Spec
`);
      const result = parseInfraRequirements(join(tmpDir, 'spec.md'));
      assert.equal(result.env_file, '.env.test');
      const pg = result.systems[0];
      assert.equal(pg.cli_tools.length, 2);
      assert.equal(pg.cli_tools[0], 'psql');
      assert.deepEqual(pg.cli_tools[1], { name: 'docker', version: '>=24' });
      assert.equal(pg.probe, 'pg_isready -h $DB_HOST');
      assert.equal(pg.check_level, 'full');
      assert.equal(pg.timeout, 5);
    } finally {
      cleanupTempDir(tmpDir);
    }
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/infra-preflight.test.mjs`
Expected: FAIL — `parseInfraRequirements` is not exported / module does not exist

- [ ] **Implement**

Create `lib/infra-preflight.mjs` with:
- YAML frontmatter parser (extract content between `---` delimiters, parse key-value and nested structures). Use a minimal YAML parser approach similar to existing patterns in the codebase (see `lib/profiles/yaml.mjs` for reference).
- `parseInfraRequirements(filePath)` — reads file, parses frontmatter, extracts `infra_requirements` block, returns structured object or `null`.
- Error handling: `PREFLIGHT_FILE_NOT_FOUND` when file doesn't exist, `PREFLIGHT_PARSE_ERROR` when frontmatter can't be parsed.
- Support for all extended schema fields: `env_file`, `systems[].cli_tools`, `systems[].probe`, `systems[].check_level`, `systems[].timeout`.

- [ ] **Verify test passes**

Run: `node --test tests/lib/infra-preflight.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/infra-preflight.mjs tests/lib/infra-preflight.test.mjs
git commit -m "feat(infra-preflight): add parseInfraRequirements with YAML frontmatter parsing"
```

---

### Task 3: dotenvx env file loading with path validation [specialist: none]

**Charter capability:** Verification Runner
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `lib/infra-preflight.mjs`
- Modify: `tests/lib/infra-preflight.test.mjs`

**Tests:** `tests/lib/infra-preflight.test.mjs`

**Context to load:**
- `.context-index/specs/features/infra-preflight/verification-runner-and-schema.spec.md` (Behavior 3, Error Cases)

- [ ] **Write failing test**

```javascript
describe('loadEnvFile', () => {
  test('rejects env_file path escaping project root with PREFLIGHT_UNSAFE_ENV_FILE', () => {
    assert.throws(
      () => loadEnvFile('../../etc/passwd', '/project/root'),
      (err) => err.code === 'PREFLIGHT_UNSAFE_ENV_FILE'
    );
  });

  test('rejects prefix-collision bypass (e.g., /app-secrets with projectRoot /app)', () => {
    // path.resolve('/app', '../app-secrets/.env') → '/app-secrets/.env'
    // which starts with '/app' but not '/app/'
    assert.throws(
      () => loadEnvFile('../app-secrets/.env', '/app'),
      (err) => err.code === 'PREFLIGHT_UNSAFE_ENV_FILE'
    );
  });

  test('accepts env_file within project root', () => {
    const tmpDir = createTempDir();
    try {
      writeFixture(tmpDir, '.env.test', 'DB_HOST=localhost\n');
      // Should not throw
      const result = loadEnvFile('.env.test', tmpDir);
      assert.equal(result.loaded, true);
    } finally {
      cleanupTempDir(tmpDir);
    }
  });

  test('returns warning when env_file not found', () => {
    const tmpDir = createTempDir();
    try {
      const result = loadEnvFile('.env.missing', tmpDir);
      assert.equal(result.loaded, false);
      assert.ok(result.warning.includes('env file not found'));
    } finally {
      cleanupTempDir(tmpDir);
    }
  });

  test('gracefully degrades when dotenvx not available', () => {
    const tmpDir = createTempDir();
    try {
      writeFixture(tmpDir, '.env.test', 'FOO=bar\n');
      // Test with dotenvx import failing (mock or dynamic import trap)
      const result = loadEnvFile('.env.test', tmpDir, { _dotenvxUnavailable: true });
      assert.equal(result.loaded, false);
      assert.ok(result.warning.includes('dotenvx not found'));
    } finally {
      cleanupTempDir(tmpDir);
    }
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/infra-preflight.test.mjs`
Expected: FAIL — `loadEnvFile` not defined

- [ ] **Implement**

Add `loadEnvFile(envFilePath, projectRoot, options)` to `lib/infra-preflight.mjs`:
- Resolve path via `path.resolve(projectRoot, envFilePath)`
- Containment check: resolved path must start with `projectRoot + path.sep` OR equal `projectRoot` exactly
- On escape: throw with code `PREFLIGHT_UNSAFE_ENV_FILE`
- Load via dynamic `import('@dotenvx/dotenvx')` with try/catch for graceful degradation
- Return `{ loaded: boolean, warning: string | null, env: object }`

- [ ] **Verify test passes**

Run: `node --test tests/lib/infra-preflight.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/infra-preflight.mjs tests/lib/infra-preflight.test.mjs
git commit -m "feat(infra-preflight): add env file loading with path containment validation"
```

---

### Task 4: Environment variable presence checks [specialist: none]

**Charter capability:** Verification Runner
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `lib/infra-preflight.mjs`
- Modify: `tests/lib/infra-preflight.test.mjs`

**Tests:** `tests/lib/infra-preflight.test.mjs`

**Context to load:**
- `.context-index/specs/features/infra-preflight/verification-runner-and-schema.spec.md` (Behavior 4)

- [ ] **Write failing test**

```javascript
describe('checkEnvVars', () => {
  test('reports missing env vars', () => {
    const result = checkEnvVars(['EXISTING_VAR', 'MISSING_VAR'], { EXISTING_VAR: 'value' });
    assert.equal(result.env_vars_ok, false);
    assert.deepEqual(result.missing_env_vars, ['MISSING_VAR']);
  });

  test('reports empty env vars as missing', () => {
    const result = checkEnvVars(['EMPTY_VAR'], { EMPTY_VAR: '' });
    assert.equal(result.env_vars_ok, false);
    assert.deepEqual(result.missing_env_vars, ['EMPTY_VAR']);
  });

  test('passes when all vars are defined and non-empty', () => {
    const result = checkEnvVars(['VAR_A', 'VAR_B'], { VAR_A: 'a', VAR_B: 'b' });
    assert.equal(result.env_vars_ok, true);
    assert.deepEqual(result.missing_env_vars, []);
  });

  test('handles empty env_vars array', () => {
    const result = checkEnvVars([], {});
    assert.equal(result.env_vars_ok, true);
    assert.deepEqual(result.missing_env_vars, []);
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/infra-preflight.test.mjs`
Expected: FAIL — `checkEnvVars` not defined

- [ ] **Implement**

Add `checkEnvVars(envVarNames, env)` to `lib/infra-preflight.mjs`:
- Iterate each name, check `env[name] !== undefined && env[name] !== ''`
- Return `{ env_vars_ok: boolean, missing_env_vars: string[] }`

- [ ] **Verify test passes**

Run: `node --test tests/lib/infra-preflight.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/infra-preflight.mjs tests/lib/infra-preflight.test.mjs
git commit -m "feat(infra-preflight): add environment variable presence checks"
```

---

### Task 5: CLI tool existence and version checks [specialist: none]

**Charter capability:** Verification Runner, Schema Extension
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `lib/infra-preflight.mjs`
- Modify: `tests/lib/infra-preflight.test.mjs`

**Tests:** `tests/lib/infra-preflight.test.mjs`

**Context to load:**
- `.context-index/specs/features/infra-preflight/verification-runner-and-schema.spec.md` (Behavior 5, Error Cases — PREFLIGHT_INVALID_TOOL, PREFLIGHT_INVALID_VERSION)

- [ ] **Write failing test**

```javascript
describe('checkCliTools', () => {
  test('validates tool name against [a-zA-Z0-9._-]+ pattern', () => {
    const result = checkCliTools(['valid-tool_1.0']);
    // Name should be accepted (not rejected)
    assert.ok(!result.warnings.some(w => w.code === 'PREFLIGHT_INVALID_TOOL'));
  });

  test('rejects tool names with path separators', () => {
    const result = checkCliTools(['../evil']);
    assert.ok(result.warnings.some(w => w.code === 'PREFLIGHT_INVALID_TOOL'));
  });

  test('rejects tool names with shell metacharacters', () => {
    const result = checkCliTools(['tool; rm -rf /']);
    assert.ok(result.warnings.some(w => w.code === 'PREFLIGHT_INVALID_TOOL'));
  });

  test('detects existing tool on PATH (node is always available)', () => {
    const result = checkCliTools(['node']);
    assert.equal(result.cli_tools_ok, true);
    assert.deepEqual(result.missing_tools, []);
  });

  test('reports missing tool', () => {
    const result = checkCliTools(['nonexistent_tool_xyz_12345']);
    assert.equal(result.cli_tools_ok, false);
    assert.deepEqual(result.missing_tools, ['nonexistent_tool_xyz_12345']);
  });

  test('handles object form with version check', () => {
    // node --version should return a semver-like string
    const result = checkCliTools([{ name: 'node', version: '>=14' }]);
    assert.equal(result.cli_tools_ok, true);
  });

  test('handles mixed string and object entries', () => {
    const result = checkCliTools(['node', { name: 'node', version: '>=14' }]);
    assert.equal(result.cli_tools_ok, true);
  });

  test('reports version mismatch', () => {
    // Request an impossibly high version
    const result = checkCliTools([{ name: 'node', version: '>=999' }]);
    assert.equal(result.cli_tools_ok, false);
    assert.equal(result.version_mismatches.length, 1);
    assert.equal(result.version_mismatches[0].tool, 'node');
    assert.equal(result.version_mismatches[0].required, '>=999');
  });

  test('handles invalid cli_tools entry format', () => {
    const result = checkCliTools([42]);
    assert.ok(result.warnings.some(w => w.code === 'PREFLIGHT_INVALID_TOOL'));
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/infra-preflight.test.mjs`
Expected: FAIL — `checkCliTools` not defined

- [ ] **Implement**

Add `checkCliTools(cliTools)` to `lib/infra-preflight.mjs`:
- Validate tool name against `/^[a-zA-Z0-9._-]+$/`
- Check existence via `execFileSync('which', [toolName])`
- For object form: run `execFileSync(toolPath, ['--version'])`, extract first semver token via `/\d+\.\d+(\.\d+)?/`, compare against constraint
- Semver comparison: implement minimal `satisfiesSemver(version, constraint)` supporting `>=X.Y.Z` patterns (Node.js built-in `process.version` parsing as reference)
- Return `{ cli_tools_ok, missing_tools, version_mismatches, warnings }`

- [ ] **Verify test passes**

Run: `node --test tests/lib/infra-preflight.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/infra-preflight.mjs tests/lib/infra-preflight.test.mjs
git commit -m "feat(infra-preflight): add CLI tool existence and version checks"
```

---

### Task 6: Probe command execution with $VAR substitution [specialist: none]

**Charter capability:** Verification Runner
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 4, Task 5
**Files:**
- Modify: `lib/infra-preflight.mjs`
- Modify: `tests/lib/infra-preflight.test.mjs`

**Tests:** `tests/lib/infra-preflight.test.mjs`

**Context to load:**
- `.context-index/specs/features/infra-preflight/verification-runner-and-schema.spec.md` (Behavior 6, Behavior 11)

- [ ] **Write failing test**

```javascript
describe('executeProbe', () => {
  test('executes probe command and returns success for exit code 0', () => {
    const result = executeProbe('echo hello', {}, { timeout: 5 });
    assert.equal(result.probe_ok, true);
    assert.equal(result.probe_error, null);
    assert.ok(typeof result.probe_duration_ms === 'number');
  });

  test('substitutes $VAR per-token from environment', () => {
    const result = executeProbe('echo $TEST_VALUE', { TEST_VALUE: 'world' }, { timeout: 5 });
    assert.equal(result.probe_ok, true);
  });

  test('handles space in env var value as single token (no argv splitting)', () => {
    // $VAR with spaces should NOT create new argv tokens
    const result = executeProbe('echo $MSG', { MSG: 'hello world' }, { timeout: 5 });
    assert.equal(result.probe_ok, true);
  });

  test('reports failure for non-zero exit code', () => {
    const result = executeProbe('false', {}, { timeout: 5 });
    assert.equal(result.probe_ok, false);
  });

  test('reports command not found', () => {
    const result = executeProbe('nonexistent_cmd_xyz', {}, { timeout: 5 });
    assert.equal(result.probe_ok, false);
    assert.ok(result.probe_error.includes('command not found') || result.probe_error.includes('ENOENT'));
  });

  test('truncates output to 200 chars and strips ANSI codes at capture time', () => {
    // Generate long output with ANSI codes
    const longOutput = 'A'.repeat(300);
    const result = executeProbe(`node -e "process.stderr.write('\\x1b[31m${longOutput}\\x1b[0m'); process.exit(1)"`, {}, { timeout: 5 });
    assert.equal(result.probe_ok, false);
    assert.ok(result.probe_error.length <= 200);
    assert.ok(!result.probe_error.includes('\x1b'));
  });

  test('times out and reports timeout error', () => {
    const result = executeProbe('sleep 10', {}, { timeout: 1 });
    assert.equal(result.probe_ok, false);
    assert.ok(result.probe_error.includes('timeout'));
  });

  test('does not support shell features (pipes, redirects)', () => {
    // This should fail because | is not a shell feature in execFileSync
    const result = executeProbe('echo hello | cat', {}, { timeout: 5 });
    // The | should be passed as an argument to echo, not interpreted as a pipe
    assert.equal(result.probe_ok, true); // echo succeeds with "hello | cat" as args
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/infra-preflight.test.mjs`
Expected: FAIL — `executeProbe` not defined

- [ ] **Implement**

Add `executeProbe(probeStr, env, options)` to `lib/infra-preflight.mjs`:
- Split probe string on whitespace into argv tokens
- Per-token `$VAR` substitution: for each token, replace `$[A-Z_][A-Z0-9_]*` with `env[varName]` or empty string
- First token = command, rest = args
- Execute via `execFileSync(command, args, { timeout, env: process.env })`
- Capture stdout + stderr, sanitize at capture time: strip ANSI via `/\x1b\[[0-9;]*[a-zA-Z]/g`, strip control chars, truncate to 200 chars
- Measure duration with `performance.now()` or `Date.now()`
- Return `{ probe_ok, probe_error, probe_duration_ms }`

- [ ] **Verify test passes**

Run: `node --test tests/lib/infra-preflight.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/infra-preflight.mjs tests/lib/infra-preflight.test.mjs
git commit -m "feat(infra-preflight): add probe command execution with per-token $VAR substitution"
```

---

### Task 7: runPreflight orchestrator with noInfra, check_level, timeout [specialist: none]

**Charter capability:** Verification Runner, Per-System Check Level Override, Probe Timeout Configuration
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2, Task 3, Task 4, Task 5, Task 6
**Files:**
- Modify: `lib/infra-preflight.mjs`
- Modify: `tests/lib/infra-preflight.test.mjs`

**Tests:** `tests/lib/infra-preflight.test.mjs`

**Context to load:**
- `.context-index/specs/features/infra-preflight/verification-runner-and-schema.spec.md` (Behaviors 1, 2, 7, 8, 9)
- `.context-index/specs/features/infra-preflight/charter.md` (Invariants)

- [ ] **Write failing test**

```javascript
describe('runPreflight', () => {
  test('returns passed:true, systems:[], skipped:false when no infra_requirements', () => {
    const tmpDir = createTempDir();
    try {
      writeFixture(tmpDir, 'spec.md', '---\nstatus: draft\n---\n# Spec\n');
      const result = runPreflight(join(tmpDir, 'spec.md'), null, {});
      assert.deepEqual(result, { passed: true, systems: [], skipped: false });
    } finally {
      cleanupTempDir(tmpDir);
    }
  });

  test('returns skipped:true when options.noInfra is true', () => {
    const tmpDir = createTempDir();
    try {
      writeFixture(tmpDir, 'spec.md', `---
infra_requirements:
  systems:
    - name: Postgres
      env_vars: [DATABASE_URL]
---
# Spec
`);
      const result = runPreflight(join(tmpDir, 'spec.md'), null, { noInfra: true });
      assert.deepEqual(result, { passed: true, systems: [], skipped: true });
    } finally {
      cleanupTempDir(tmpDir);
    }
  });

  test('merges systems from spec and plan, plan wins on conflict', () => {
    const tmpDir = createTempDir();
    try {
      writeFixture(tmpDir, 'spec.md', `---
infra_requirements:
  systems:
    - name: Postgres
      env_vars: [DB_URL]
    - name: Redis
      env_vars: [REDIS_URL]
---
# Spec
`);
      writeFixture(tmpDir, 'plan.md', `---
infra_requirements:
  systems:
    - name: Postgres
      env_vars: [DATABASE_URL, DB_HOST]
---
# Plan
`);
      const result = runPreflight(
        join(tmpDir, 'spec.md'),
        join(tmpDir, 'plan.md'),
        { projectRoot: tmpDir }
      );
      // Plan's Postgres (with DATABASE_URL, DB_HOST) should win
      const pg = result.systems.find(s => s.name === 'Postgres');
      assert.ok(pg);
      // Redis from spec should also be present
      const redis = result.systems.find(s => s.name === 'Redis');
      assert.ok(redis);
    } finally {
      cleanupTempDir(tmpDir);
    }
  });

  test('check_level: skip skips all checks for that system', () => {
    const tmpDir = createTempDir();
    try {
      writeFixture(tmpDir, 'spec.md', `---
infra_requirements:
  systems:
    - name: Optional
      check_level: skip
      env_vars: [SOME_VAR]
---
# Spec
`);
      const result = runPreflight(join(tmpDir, 'spec.md'), null, { projectRoot: tmpDir });
      assert.equal(result.passed, true);
      assert.equal(result.systems[0].skipped, true);
      assert.equal(result.systems[0].env_vars_ok, null);
    } finally {
      cleanupTempDir(tmpDir);
    }
  });

  test('check_level: presence-only skips probe', () => {
    const tmpDir = createTempDir();
    try {
      writeFixture(tmpDir, 'spec.md', `---
infra_requirements:
  systems:
    - name: DB
      check_level: presence-only
      probe: "pg_isready -h localhost"
---
# Spec
`);
      const result = runPreflight(join(tmpDir, 'spec.md'), null, { projectRoot: tmpDir });
      const db = result.systems[0];
      assert.equal(db.probe_ok, null);
      assert.ok(db.probe_error.includes('presence-only'));
    } finally {
      cleanupTempDir(tmpDir);
    }
  });

  test('timeout priority: system > options > manifest > default 10s', () => {
    const tmpDir = createTempDir();
    try {
      writeFixture(tmpDir, 'spec.md', `---
infra_requirements:
  systems:
    - name: Fast
      timeout: 2
      probe: "echo ok"
    - name: Default
      probe: "echo ok"
---
# Spec
`);
      const result = runPreflight(join(tmpDir, 'spec.md'), null, {
        projectRoot: tmpDir,
        timeout: 5
      });
      // Both should pass (echo ok is fast)
      assert.equal(result.passed, true);
    } finally {
      cleanupTempDir(tmpDir);
    }
  });

  test('probe skipped when prerequisites fail', () => {
    const tmpDir = createTempDir();
    try {
      writeFixture(tmpDir, 'spec.md', `---
infra_requirements:
  systems:
    - name: NeedsEnv
      env_vars: [NONEXISTENT_VAR_XYZ]
      probe: "echo should-not-run"
---
# Spec
`);
      const result = runPreflight(join(tmpDir, 'spec.md'), null, { projectRoot: tmpDir });
      assert.equal(result.passed, false);
      assert.equal(result.systems[0].env_vars_ok, false);
      assert.equal(result.systems[0].probe_ok, null);
      assert.ok(result.systems[0].probe_error.includes('prerequisites failed'));
    } finally {
      cleanupTempDir(tmpDir);
    }
  });

  test('PreflightReport matches expected schema shape', () => {
    const tmpDir = createTempDir();
    try {
      writeFixture(tmpDir, 'spec.md', `---
infra_requirements:
  systems:
    - name: Test
      env_vars: [PATH]
      probe: "echo ok"
---
# Spec
`);
      const result = runPreflight(join(tmpDir, 'spec.md'), null, { projectRoot: tmpDir });
      assert.equal(typeof result.passed, 'boolean');
      assert.ok(Array.isArray(result.systems));
      assert.equal(typeof result.skipped, 'boolean');
      const sys = result.systems[0];
      assert.equal(typeof sys.name, 'string');
      assert.equal(typeof sys.skipped, 'boolean');
      assert.ok(typeof sys.env_vars_ok === 'boolean' || sys.env_vars_ok === null);
      assert.ok(Array.isArray(sys.missing_env_vars));
      assert.ok(typeof sys.cli_tools_ok === 'boolean' || sys.cli_tools_ok === null);
      assert.ok(Array.isArray(sys.missing_tools));
      assert.ok(Array.isArray(sys.version_mismatches));
      assert.ok(typeof sys.probe_ok === 'boolean' || sys.probe_ok === null);
      assert.ok(typeof sys.probe_error === 'string' || sys.probe_error === null);
      assert.ok(typeof sys.probe_duration_ms === 'number' || sys.probe_duration_ms === null);
    } finally {
      cleanupTempDir(tmpDir);
    }
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/infra-preflight.test.mjs`
Expected: FAIL — `runPreflight` not defined / not wired up

- [ ] **Implement**

Add `runPreflight(specPath, planPath, options)` to `lib/infra-preflight.mjs`:
- Parse infra_requirements from spec and/or plan
- Merge systems (union by name, plan wins on conflict)
- Check noInfra bypass
- Load env file via dotenvx (or fallback to .env.test or process.env)
- For each system: apply check_level, run env var checks, run CLI tool checks, run probe if prerequisites pass
- Resolve timeout: system.timeout > options.timeout > manifest default > 10s
- Aggregate into PreflightReport

Also read `manifest.yaml` for `infra_preflight.default_timeout` when `options.manifestPath` is provided.

- [ ] **Verify test passes**

Run: `node --test tests/lib/infra-preflight.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/infra-preflight.mjs tests/lib/infra-preflight.test.mjs
git commit -m "feat(infra-preflight): add runPreflight orchestrator with check_level and timeout support"
```

---

### Task 8: formatPreflightReport — human-readable markdown output [specialist: none]

**Charter capability:** Verification Runner
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 7
**Files:**
- Modify: `lib/infra-preflight.mjs`
- Modify: `tests/lib/infra-preflight.test.mjs`

**Tests:** `tests/lib/infra-preflight.test.mjs`

**Context to load:**
- `.context-index/specs/features/infra-preflight/verification-runner-and-schema.spec.md` (Behavior 10, Behavior 11)

- [ ] **Write failing test**

```javascript
describe('formatPreflightReport', () => {
  test('renders passing report with checkmarks', () => {
    const report = {
      passed: true,
      skipped: false,
      systems: [{
        name: 'Postgres',
        skipped: false,
        env_vars_ok: true,
        missing_env_vars: [],
        cli_tools_ok: true,
        missing_tools: [],
        version_mismatches: [],
        probe_ok: true,
        probe_error: null,
        probe_duration_ms: 42
      }]
    };
    const output = formatPreflightReport(report);
    assert.ok(output.includes('Postgres'));
    assert.ok(output.includes('PASS') || output.includes('pass'));
  });

  test('renders failing report with actionable errors', () => {
    const report = {
      passed: false,
      skipped: false,
      systems: [{
        name: 'Redis',
        skipped: false,
        env_vars_ok: false,
        missing_env_vars: ['REDIS_URL'],
        cli_tools_ok: true,
        missing_tools: [],
        version_mismatches: [],
        probe_ok: null,
        probe_error: 'skipped — prerequisites failed',
        probe_duration_ms: null
      }]
    };
    const output = formatPreflightReport(report);
    assert.ok(output.includes('REDIS_URL'));
    assert.ok(output.includes('FAIL') || output.includes('fail'));
  });

  test('never includes env var values', () => {
    const report = {
      passed: true,
      skipped: false,
      systems: [{
        name: 'AWS',
        skipped: false,
        env_vars_ok: true,
        missing_env_vars: [],
        cli_tools_ok: null,
        missing_tools: [],
        version_mismatches: [],
        probe_ok: null,
        probe_error: null,
        probe_duration_ms: null
      }]
    };
    const output = formatPreflightReport(report);
    // Ensure no actual env values leak
    assert.ok(!output.includes(process.env.PATH));
  });

  test('renders skipped report', () => {
    const report = { passed: true, skipped: true, systems: [] };
    const output = formatPreflightReport(report);
    assert.ok(output.includes('skipped') || output.includes('--no-infra'));
  });

  test('shows probe timing', () => {
    const report = {
      passed: true,
      skipped: false,
      systems: [{
        name: 'DB',
        skipped: false,
        env_vars_ok: true,
        missing_env_vars: [],
        cli_tools_ok: true,
        missing_tools: [],
        version_mismatches: [],
        probe_ok: true,
        probe_error: null,
        probe_duration_ms: 150
      }]
    };
    const output = formatPreflightReport(report);
    assert.ok(output.includes('150'));
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/infra-preflight.test.mjs`
Expected: FAIL — `formatPreflightReport` not defined

- [ ] **Implement**

Add `formatPreflightReport(report, options)` to `lib/infra-preflight.mjs`:
- Render markdown block with per-system results
- Use checkmarks for pass, X for fail
- Show env var names (never values), CLI tool versions, probe results with timing
- Show final summary line: "Preflight: PASS" or "Preflight: FAIL (N of M systems failed)"
- All file paths in output are project-root-relative (when options.projectRoot provided)

- [ ] **Verify test passes**

Run: `node --test tests/lib/infra-preflight.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/infra-preflight.mjs tests/lib/infra-preflight.test.mjs
git commit -m "feat(infra-preflight): add formatPreflightReport for human-readable markdown output"
```

---

### Task 9: Update live-spec template with extended schema examples [specialist: none]

**Charter capability:** Schema Extension
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `templates/live-spec-template.md`
- Modify: `tests/lib/infra-preflight.test.mjs`

**Tests:** `tests/lib/infra-preflight.test.mjs`

**Context to load:**
- `.context-index/specs/features/infra-preflight/verification-runner-and-schema.spec.md` (Extended Schema)
- `templates/live-spec-template.md` (existing infra_requirements block)

- [ ] **Write failing test**

```javascript
describe('live-spec template', () => {
  test('template includes cli_tools, probe, check_level, timeout, env_file examples', () => {
    const template = readFileSync(
      join(PROJECT_ROOT, 'templates', 'live-spec-template.md'),
      'utf-8'
    );
    assert.ok(template.includes('cli_tools'), 'template must include cli_tools example');
    assert.ok(template.includes('probe'), 'template must include probe example');
    assert.ok(template.includes('check_level'), 'template must include check_level example');
    assert.ok(template.includes('timeout'), 'template must include timeout example');
    assert.ok(template.includes('env_file'), 'template must include env_file example');
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/infra-preflight.test.mjs`
Expected: FAIL — template does not include the extended schema fields

- [ ] **Implement**

Update the `infra_requirements` commented block in `templates/live-spec-template.md` to include the new fields as commented examples:

```yaml
# infra_requirements:
#   env_file: ".env.test"          # Optional. Path to env file (must be within project root). Default: .env.test
#   systems:
#     - name: "AWS S3"
#       env_vars: [AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION]
#       cli_tools:                 # Optional. CLI tools to verify on PATH.
#         - aws                    # String form: existence check only
#         - name: docker           # Object form: existence + version check
#           version: ">=24"
#       probe: "aws s3 ls $S3_BUCKET"  # Optional. Connectivity command (exit 0 = pass). Only $VAR expansion — no pipes/redirects.
#       check_level: full          # Optional. "full" (default) | "presence-only" | "skip"
#       timeout: 5                 # Optional. Probe timeout in seconds (default: 10).
#       notes: "Dedicated test account. Scope IAM to specific actions/ARNs."
#   ci_tag: "integration"
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/infra-preflight.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add templates/live-spec-template.md tests/lib/infra-preflight.test.mjs
git commit -m "feat(infra-preflight): extend live-spec template with verification schema examples"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied
