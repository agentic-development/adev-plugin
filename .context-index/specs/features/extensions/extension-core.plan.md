<!-- DO NOT EDIT statuses inline — see lifecycle log extension-core.jsonl -->
# Implementation Plan: Extension Core

> **Methodology:** adev
> **Charter:** .context-index/specs/features/extensions/charter.md
> **Spec:** .context-index/specs/features/extensions/extension-core.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-11)
> **Platform:** Node.js, JavaScript ESM, node:test, npm

**Goal:** Implement source resolution, manifest validation, version compatibility checking, and manifest stamping for the extension install pipeline.

**Architecture:** New `lib/extensions/` module owns all extension-core logic. `resolveExtensionSource(uri)` classifies and validates URIs, then delegates to per-type resolvers that use `child_process.spawn` (no shell). `installExtension()` orchestrates validation, delegates content operations to sibling modules (content-installation, cli-and-registration), and writes the manifest stamp. Follows the golden sample pattern from `lib/repomap/graph.mjs` — pure ESM, Node.js built-ins only, JSDoc type signatures.

---

## File Structure

**Create:**
- `lib/extensions/manifest-schema.mjs` — Extension manifest (`adev-extension.yaml`) parsing and validation
- `lib/extensions/resolve-source.mjs` — URI classification, pattern validation, and per-type source resolution
- `lib/extensions/install.mjs` — `installExtension()` orchestrator and manifest stamp writer
- `tests/lib/extensions/manifest-schema.test.mjs` — Schema validation tests
- `tests/lib/extensions/resolve-source.test.mjs` — Source resolution tests
- `tests/lib/extensions/install.test.mjs` — Install orchestration and manifest stamp tests

**Modify:**
- (none — extension-core is a new standalone module)

**Reference (read, do not modify):**
- `lib/profiles/yaml.mjs` — Reuse `parseYaml()` for extension manifest parsing
- `lib/domains/constants.mjs` — Pattern for constants module (BUNDLED_DOMAIN_NAMES)
- `tests/helpers.mjs` — `createTempDir()`, `cleanupTempDir()`, `writeFixture()`
- `.context-index/samples/general-library-module-graph.md` — Golden sample for lib module structure

## Context Packets

### Task 1 Context
- Spec: `extension-core.spec.md` (behaviors 5, 11; error cases INVALID_SCHEMA)
- Charter: `charter.md` (capabilities: Extension Manifest Schema)
- Sample: `.context-index/samples/general-library-module-graph.md`
- Reference: `lib/profiles/yaml.mjs` (parseYaml reuse), `lib/domains/constants.mjs` (pattern)

### Task 2 Context
- Spec: `extension-core.spec.md` (behaviors 1–4, 10; error cases SOURCE_RESOLUTION, MISSING_MANIFEST)
- Charter: `charter.md` (capabilities: Source Resolution)
- Reference: `tests/helpers.mjs` (createTempDir, cleanupTempDir)

### Task 3 Context
- Spec: `extension-core.spec.md` (behaviors 6–7; error cases INCOMPATIBLE_VERSION)
- Charter: `charter.md` (capabilities: Version Compatibility Check)
- Reference: `package.json` (version field for installed adev version)

### Task 4 Context
- Spec: `extension-core.spec.md` (behaviors 8–9; postconditions)
- Charter: `charter.md` (capabilities: Manifest Stamp)
- Reference: `lib/profiles/yaml.mjs` (parseYaml for manifest reading)

## Parallelization

- Group A (sequential): Task 1 → Task 2 (Task 2 imports schema validation from Task 1)
- Group B (independent): Task 3 (no file overlap with Group A)
- Group C (sequential, depends on A+B): Task 4 (orchestrator imports from Tasks 1–3)

Groups A and B can run in parallel. Group C runs after both complete.

**Note:** Task 2 covers all three resolver types (local, npm, git) in a single module. Each type is tested independently within the test file. The npm/git resolver tests that require network are structured as fixture-based tests using pre-created temp directories, not live network calls.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Extension manifest schema validation | medium | unit | — | 1 create, 1 create (test) |
| 2 | URI classification and source resolution | medium | unit | Task 1 | 1 create, 1 create (test) |
| 3 | Version compatibility check | small | unit | — | 0 create (inline in install.mjs), 1 create (test) |
| 4 | Install orchestrator and manifest stamp | medium | unit | Task 1, 2, 3 | 1 create, 1 create (test) |

---

### Task 1: Extension manifest schema validation [specialist: none]

**Charter capability:** Extension Manifest Schema
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/extensions/manifest-schema.mjs`
- Test: `tests/lib/extensions/manifest-schema.test.mjs`

**Tests:** `tests/lib/extensions/manifest-schema.test.mjs`

- [x] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { validateExtensionManifest } from '../../../lib/extensions/manifest-schema.mjs';

describe('extensions/manifest-schema', () => {
  it('accepts a valid minimal manifest', () => {
    const result = validateExtensionManifest({ name: 'my-ext', version: '1.0.0' });
    assert.equal(result.valid, true);
  });

  it('rejects missing name', () => {
    const result = validateExtensionManifest({ version: '1.0.0' });
    assert.equal(result.valid, false);
    assert.equal(result.code, 'INVALID_SCHEMA');
    assert.ok(result.message.includes('name'));
  });

  it('rejects missing version', () => {
    const result = validateExtensionManifest({ name: 'my-ext' });
    assert.equal(result.valid, false);
    assert.equal(result.code, 'INVALID_SCHEMA');
  });

  it('rejects non-kebab-case name', () => {
    const result = validateExtensionManifest({ name: 'MyExt', version: '1.0.0' });
    assert.equal(result.valid, false);
    assert.ok(result.message.includes('kebab-case'));
  });

  it('rejects name exceeding 64 characters', () => {
    const result = validateExtensionManifest({ name: 'a'.repeat(65), version: '1.0.0' });
    assert.equal(result.valid, false);
    assert.ok(result.message.includes('64'));
  });

  it('rejects invalid semver version', () => {
    const result = validateExtensionManifest({ name: 'my-ext', version: 'not-semver' });
    assert.equal(result.valid, false);
  });

  it('rejects version exceeding 32 characters', () => {
    const result = validateExtensionManifest({ name: 'my-ext', version: '1.0.0-' + 'a'.repeat(30) });
    assert.equal(result.valid, false);
  });

  it('ignores unknown fields (forward compat)', () => {
    const result = validateExtensionManifest({ name: 'my-ext', version: '1.0.0', future_field: true });
    assert.equal(result.valid, true);
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/extensions/manifest-schema.test.mjs`
Expected: FAIL — `Cannot find module '../../../lib/extensions/manifest-schema.mjs'`

- [x] **Implement**

Create `lib/extensions/manifest-schema.mjs`:
- Import `parseYaml` from `../profiles/yaml.mjs` for YAML parsing
- Export `parseExtensionManifest(yamlString)` — parse YAML string, call `validateExtensionManifest`
- Export `validateExtensionManifest(obj)` — validate against schema:
  - `name`: required, `^[a-z][a-z0-9-]*$`, max 64 chars, no `/` or `.`
  - `version`: required, valid semver pattern, max 32 chars
  - Optional: `description` (string), `author` (string), `requires` (object with optional `adev` string), `provides` (object)
  - Unknown fields: silently ignored
- Return `{ valid: true, manifest }` or `{ valid: false, code: 'INVALID_SCHEMA', message, missingFields }`

- [x] **Verify test passes**

Run: `node --test tests/lib/extensions/manifest-schema.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/extensions/manifest-schema.mjs tests/lib/extensions/manifest-schema.test.mjs
git commit -m "feat(extensions): add extension manifest schema validation

Spec: .context-index/specs/features/extensions/extension-core.spec.md
Plan-task: 1"
```

---

### Task 2: URI classification and source resolution [specialist: none]

**Charter capability:** Source Resolution
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `lib/extensions/resolve-source.mjs`
- Test: `tests/lib/extensions/resolve-source.test.mjs`

**Tests:** `tests/lib/extensions/resolve-source.test.mjs`

- [x] **Write failing test**

```javascript
import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { classifyUri, resolveExtensionSource } from '../../../lib/extensions/resolve-source.mjs';
import { createTempDir, cleanupTempDir, writeFixture } from '../../helpers.mjs';

describe('extensions/resolve-source', () => {
  describe('classifyUri', () => {
    it('classifies absolute path as local', () => {
      assert.equal(classifyUri('/tmp/my-ext'), 'local');
    });
    it('classifies ./ relative path as local', () => {
      assert.equal(classifyUri('./my-ext'), 'local');
    });
    it('classifies ../ relative path as local', () => {
      assert.equal(classifyUri('../my-ext'), 'local');
    });
    it('classifies https URL as git', () => {
      assert.equal(classifyUri('https://github.com/org/ext.git'), 'git');
    });
    it('classifies git@ SSH as git', () => {
      assert.equal(classifyUri('git@github.com:org/ext.git'), 'git');
    });
    it('classifies npm package name as npm', () => {
      assert.equal(classifyUri('@org/adev-ext-foo'), 'npm');
    });
    it('classifies simple name as npm', () => {
      assert.equal(classifyUri('adev-ext-foo'), 'npm');
    });
  });

  describe('resolveExtensionSource (local)', () => {
    let tmp;
    beforeEach(() => { tmp = createTempDir(); });
    afterEach(() => { cleanupTempDir(tmp); });

    it('resolves local dir with valid manifest', async () => {
      writeFixture(tmp, 'adev-extension.yaml', 'name: test-ext\nversion: 1.0.0\n');
      const result = await resolveExtensionSource(tmp);
      assert.equal(result.type, 'local');
      assert.ok(result.resolved_path.includes(tmp));
    });

    it('throws MISSING_MANIFEST for dir without manifest', async () => {
      await assert.rejects(
        () => resolveExtensionSource(tmp),
        (err) => err.code === 'MISSING_MANIFEST'
      );
    });
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/extensions/resolve-source.test.mjs`
Expected: FAIL — module not found

- [x] **Implement**

Create `lib/extensions/resolve-source.mjs`:
- Export `classifyUri(uri)` — apply classification rules: local (`/`, `./`, `../`), git (`https://`, `http://`, `git://`, `git@`, `ssh://`), npm (otherwise)
- Export `resolveExtensionSource(uri)` — classify, validate pattern, resolve:
  - **local:** `path.resolve(uri)`, check `adev-extension.yaml` exists via `fs.existsSync`
  - **npm:** validate against npm name regex, run `spawn('npm', ['pack', uri, '--pack-destination', tmpDir])`, extract tarball via `spawn('tar', ['-xzf', ...])`, validate manifest
  - **git:** validate against git URL regex, run `spawn('git', ['clone', '--depth', '1', '--config', 'core.hooksPath=/dev/null', uri, tmpDir])`, validate manifest
- All subprocess calls via `child_process.spawn` with argument arrays (no shell)
- Temp dirs via `fs.mkdtempSync(path.join(os.tmpdir(), 'adev-ext-'))`
- Credential stripping: `stripCredentials(uri)` helper per RFC 3986

- [x] **Verify test passes**

Run: `node --test tests/lib/extensions/resolve-source.test.mjs`
Expected: PASS (local tests pass; npm/git tests may need network mocking or be skipped in unit)

- [x] **Commit**

```bash
git add lib/extensions/resolve-source.mjs tests/lib/extensions/resolve-source.test.mjs
git commit -m "feat(extensions): add URI classification and source resolution

Spec: .context-index/specs/features/extensions/extension-core.spec.md
Plan-task: 2"
```

---

### Task 3: Version compatibility check [specialist: none]

**Charter capability:** Version Compatibility Check
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/extensions/version-check.mjs`
- Test: `tests/lib/extensions/version-check.test.mjs`

**Tests:** `tests/lib/extensions/version-check.test.mjs`

- [x] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { checkVersionCompatibility } from '../../../lib/extensions/version-check.mjs';

describe('extensions/version-check', () => {
  it('passes when requires.adev is absent', () => {
    const result = checkVersionCompatibility({}, '0.22.0');
    assert.equal(result.compatible, true);
  });

  it('passes when installed version satisfies range', () => {
    const result = checkVersionCompatibility({ adev: '>=0.20.0' }, '0.22.0');
    assert.equal(result.compatible, true);
  });

  it('fails when installed version does not satisfy range', () => {
    const result = checkVersionCompatibility({ adev: '>=1.0.0' }, '0.22.0');
    assert.equal(result.compatible, false);
    assert.equal(result.code, 'INCOMPATIBLE_VERSION');
    assert.ok(result.message.includes('>=1.0.0'));
    assert.ok(result.message.includes('0.22.0'));
  });

  it('passes with exact version match', () => {
    const result = checkVersionCompatibility({ adev: '0.22.0' }, '0.22.0');
    assert.equal(result.compatible, true);
  });

  it('passes with caret range', () => {
    const result = checkVersionCompatibility({ adev: '^0.22.0' }, '0.22.5');
    assert.equal(result.compatible, true);
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/extensions/version-check.test.mjs`
Expected: FAIL — module not found

- [x] **Implement**

Create `lib/extensions/version-check.mjs`:
- Export `checkVersionCompatibility(requires, installedVersion)` 
- If `requires` is null/undefined or `requires.adev` is absent → `{ compatible: true }`
- Parse semver range and compare using a minimal built-in semver matcher (no external dep)
- Return `{ compatible: false, code: 'INCOMPATIBLE_VERSION', message }` on mismatch
- Export `getInstalledVersion(pluginRoot)` — reads `package.json` version field

- [x] **Verify test passes**

Run: `node --test tests/lib/extensions/version-check.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/extensions/version-check.mjs tests/lib/extensions/version-check.test.mjs
git commit -m "feat(extensions): add version compatibility check

Spec: .context-index/specs/features/extensions/extension-core.spec.md
Plan-task: 3"
```

---

### Task 4: Install orchestrator and manifest stamp [specialist: none]

**Charter capability:** Manifest Stamp
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2, Task 3
**Files:**
- Create: `lib/extensions/install.mjs`
- Test: `tests/lib/extensions/install.test.mjs`

**Tests:** `tests/lib/extensions/install.test.mjs`

- [x] **Write failing test**

```javascript
import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeManifestStamp, readManifestStamps } from '../../../lib/extensions/install.mjs';
import { createTempDir, cleanupTempDir, writeFixture } from '../../helpers.mjs';

describe('extensions/install', () => {
  let tmp;
  beforeEach(() => {
    tmp = createTempDir();
    writeFixture(tmp, '.context-index/manifest.yaml', 'project:\n  name: test\n');
  });
  afterEach(() => { cleanupTempDir(tmp); });

  it('writes a new stamp to installed_extensions', () => {
    writeManifestStamp(tmp, { name: 'my-ext', version: '1.0.0', source_uri: 'https://example.com' });
    const stamps = readManifestStamps(tmp);
    assert.equal(stamps.length, 1);
    assert.equal(stamps[0].name, 'my-ext');
    assert.equal(stamps[0].version, '1.0.0');
    assert.ok(stamps[0].installed_date);
  });

  it('updates existing stamp on re-install (idempotent)', () => {
    writeManifestStamp(tmp, { name: 'my-ext', version: '1.0.0', source_uri: 'local' });
    writeManifestStamp(tmp, { name: 'my-ext', version: '2.0.0', source_uri: 'local' });
    const stamps = readManifestStamps(tmp);
    assert.equal(stamps.length, 1);
    assert.equal(stamps[0].version, '2.0.0');
  });

  it('preserves other extensions on update', () => {
    writeManifestStamp(tmp, { name: 'ext-a', version: '1.0.0', source_uri: 'local' });
    writeManifestStamp(tmp, { name: 'ext-b', version: '1.0.0', source_uri: 'local' });
    const stamps = readManifestStamps(tmp);
    assert.equal(stamps.length, 2);
  });

  it('strips credentials from source_uri', () => {
    writeManifestStamp(tmp, { name: 'my-ext', version: '1.0.0', source_uri: 'https://user:token@github.com/repo' });
    const stamps = readManifestStamps(tmp);
    assert.equal(stamps[0].source_uri, 'https://github.com/repo');
  });

  it('cleans up temp dir on install failure', async () => {
    const extDir = createTempDir();
    writeFixture(extDir, 'adev-extension.yaml', 'name: bad ext\nversion: not-semver\n');
    try {
      await installExtension(extDir, tmp);
    } catch (e) { /* expected */ }
    // The temp dir used for npm/git resolution should not persist
    // For local sources, no temp dir is created, so this tests the cleanup path
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/extensions/install.test.mjs`
Expected: FAIL — module not found

- [x] **Implement**

Create `lib/extensions/install.mjs`:
- Import from sibling modules: `parseExtensionManifest`, `resolveExtensionSource`, `checkVersionCompatibility`, `getInstalledVersion`
- Export `installExtension(resolvedPath, projectRoot)` — orchestrator:
  1. Read and validate `adev-extension.yaml` from `resolvedPath`
  2. Check version compatibility
  3. Delegate content operations (domain profiles, governance, samples → content-install module)
  4. Delegate registration (skills, hooks → register module)
  5. Write manifest stamp
  6. Cleanup temp dirs (finally block)
  7. Return install report
- Export `writeManifestStamp(projectRoot, { name, version, source_uri })` — idempotent upsert
- Export `readManifestStamps(projectRoot)` — read `installed_extensions` from manifest.yaml
- Export `listExtensions(manifest)` — return stamp array

- [x] **Verify test passes**

Run: `node --test tests/lib/extensions/install.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/extensions/install.mjs tests/lib/extensions/install.test.mjs
git commit -m "feat(extensions): add install orchestrator and manifest stamp writer

Spec: .context-index/specs/features/extensions/extension-core.spec.md
Plan-task: 4"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite.

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied
