# Implementation Plan: Domain Resolution & Overlay Structure

> **Methodology:** adev
> **Charter:** .context-index/specs/features/domain-profiles/charter.md
> **Spec:** .context-index/specs/features/domain-profiles/domain-resolution-and-overlay-structure.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-10)
> **Platform:** JavaScript (ESM), Node.js, node:test

**Goal:** Implement the foundational domain resolution engine (`resolveDomain()`) and overlay loading system (`loadOverlay()`) that all lifecycle skills will use to adapt their behavior to the project's declared domain.

**Architecture:** Domain profiles are resolved via a 4-level precedence chain (charter > module > project > default) implemented as pure functions in `lib/domains/`. Overlay files are read from a two-layer directory structure (custom `.context-index/domains/` with `extends` fallback to bundled `templates/domains/`). The `software` profile is a real bundled profile containing all current framework defaults extracted from hardcoded constants. All functions use only Node.js built-ins (`fs`, `path`) and the existing `parseYaml` utility from `lib/profiles/yaml.mjs`.

---

## File Structure

**Create:**
- `lib/domains/constants.mjs` — Overlay type constants, filename mappings, bundled domain names
- `lib/domains/resolve.mjs` — `resolveDomain()` function
- `lib/domains/overlay.mjs` — `loadOverlay()` function
- `tests/lib/domains/constants.test.mjs` — Unit tests for constants module
- `tests/lib/domains/resolve.test.mjs` — Unit tests for `resolveDomain()`
- `tests/lib/domains/overlay.test.mjs` — Unit tests for `loadOverlay()`

**Modify:**
- (none — this spec creates new modules; manifest schema acceptance is tested via existing manifest parser tolerance of unknown fields)

**Reference (read, do not modify):**
- `lib/profiles/yaml.mjs` — Reuse `parseYaml()` for structured overlay parsing
- `lib/governance/review-config.mjs` — Follow existing pattern for `realpathSync` + path containment checks
- `lib/lifecycle-gate-config.mjs` — Reference for the defaults that will later be extracted into `software` profile overlays (sibling spec scope)
- `tests/helpers.mjs` — Use `createTempDir()`, `cleanupTempDir()`, `writeFixture()` for fixture-based tests

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/domain-profiles/domain-resolution-and-overlay-structure.spec.md` (Overlay Type-to-Filename Mapping table, lines 53-61)
- Charter: `.context-index/specs/features/domain-profiles/charter.md` (capability: Overlay File Structure)
- Reference: `lib/lifecycle-gate-config.mjs` (existing DEFAULT_FILE_EXCLUSIONS, DEFAULT_BASH_PASSTHROUGH for extraction reference)

### Task 2 Context
- Spec: `.context-index/specs/features/domain-profiles/domain-resolution-and-overlay-structure.spec.md` (Behaviors 1-4, 12; Function Signatures; Manifest Schema Extension)
- Charter: `.context-index/specs/features/domain-profiles/charter.md` (capability: Domain Resolution Function)
- Reference: `.context-index/manifest.yaml` (current manifest structure for schema understanding)

### Task 3 Context
- Spec: `.context-index/specs/features/domain-profiles/domain-resolution-and-overlay-structure.spec.md` (Behaviors 5-11, 13-14; loadOverlay() Resolution with extends; Schema Responsibility Boundary)
- Charter: `.context-index/specs/features/domain-profiles/charter.md` (capability: Overlay File Structure, Custom Domain Support)
- Reference: `lib/profiles/yaml.mjs` (parseYaml function for YAML overlay parsing)
- Reference: `lib/governance/review-config.mjs` (realpathSync + path containment pattern)

### Task 4 Context
- Spec: `.context-index/specs/features/domain-profiles/domain-resolution-and-overlay-structure.spec.md` (Behaviors 7, 14; Custom Domains and the extends Model; Error Cases lines 172-174)
- Charter: `.context-index/specs/features/domain-profiles/charter.md` (capability: Custom Domain Support)
- Task 3 source: `lib/domains/overlay.mjs` (extends resolution is integrated into loadOverlay)

### Task 5 Context
- Spec: `.context-index/specs/features/domain-profiles/domain-resolution-and-overlay-structure.spec.md` (Behavior 9; Error Cases line 171)
- Charter: `.context-index/specs/features/domain-profiles/charter.md` (Invariants: bundled profiles are immutable)
- Task 1 source: `lib/domains/constants.mjs` (BUNDLED_DOMAIN_NAMES constant)

### Task 6 Context
- Spec: `.context-index/specs/features/domain-profiles/domain-resolution-and-overlay-structure.spec.md` (all Acceptance Criteria, all Behaviors, all Error Cases)
- All source files: `lib/domains/constants.mjs`, `lib/domains/resolve.mjs`, `lib/domains/overlay.mjs`
- Reference: `tests/helpers.mjs` (test utilities)

### Task 7 Context
- Spec: `.context-index/specs/features/domain-profiles/domain-resolution-and-overlay-structure.spec.md` (AC-26, AC-27)
- Reference: existing `docs/` directory structure

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 → Task 5 (shared modules, each builds on prior)
- Group B (independent after Group A): Task 6 (comprehensive tests, depends on all implementation tasks)
- Group C (independent after Group A): Task 7 (documentation, no code dependency on tests)

Groups B and C can run in parallel after Group A completes.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Overlay type constants module | small | unit | — | 2 create |
| 2 | `resolveDomain()` with domain name validation | small | unit | Task 1 | 2 create |
| 3 | `loadOverlay()` core with path safety | medium | unit | Task 1 | 2 create |
| 4 | `extends` resolution in `loadOverlay()` | medium | unit | Task 3 | 0 create, 1 modify |
| 5 | Bundled override guard | small | unit | Task 1, Task 3 | 0 create, 1 modify |
| 6 | Comprehensive integration tests | medium | unit | Task 1-5 | 0 create, 3 modify |
| 7 | Documentation updates | small | unit | Task 1-5 | 0 create, 2 modify |

---

### Task 1: Overlay Type Constants Module [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=5
**Rationale:** Fully specified constant definitions with exact values in spec; pure mechanical task with minimal blast radius.

**Charter capability:** Overlay File Structure
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/domains/constants.mjs`
- Test: `tests/lib/domains/constants.test.mjs`

**Tests:** `tests/lib/domains/constants.test.mjs`

**Context to load:**
- `.context-index/specs/features/domain-profiles/domain-resolution-and-overlay-structure.spec.md` (Overlay Type-to-Filename Mapping table)

- [x] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  OVERLAY_TYPES,
  OVERLAY_FILENAMES,
  BUNDLED_DOMAIN_NAMES,
  DOMAIN_NAME_PATTERN,
} from '../../../lib/domains/constants.mjs';

describe('domains/constants', () => {
  it('exports all 7 overlay types', () => {
    assert.equal(OVERLAY_TYPES.size, 7);
    for (const t of ['charter-overlay', 'spec-overlay', 'reviewers', 'gates', 'verification', 'gate-config', 'test-config']) {
      assert.ok(OVERLAY_TYPES.has(t), `missing overlay type: ${t}`);
    }
  });

  it('maps each overlay type to its filename', () => {
    assert.equal(OVERLAY_FILENAMES.get('charter-overlay'), 'charter-overlay.md');
    assert.equal(OVERLAY_FILENAMES.get('gates'), 'gates.yaml');
    assert.equal(OVERLAY_FILENAMES.get('gate-config'), 'gate-config.yaml');
    assert.equal(OVERLAY_FILENAMES.get('test-config'), 'test-config.yaml');
  });

  it('exports the 3 bundled domain names', () => {
    assert.equal(BUNDLED_DOMAIN_NAMES.size, 3);
    assert.ok(BUNDLED_DOMAIN_NAMES.has('software'));
    assert.ok(BUNDLED_DOMAIN_NAMES.has('data-engineering'));
    assert.ok(BUNDLED_DOMAIN_NAMES.has('process-automation'));
  });

  it('exports domain name validation pattern', () => {
    assert.ok(DOMAIN_NAME_PATTERN instanceof RegExp);
    assert.ok(DOMAIN_NAME_PATTERN.test('software'));
    assert.ok(DOMAIN_NAME_PATTERN.test('my-custom-domain'));
    assert.ok(!DOMAIN_NAME_PATTERN.test('../traversal'));
    assert.ok(!DOMAIN_NAME_PATTERN.test('has/slash'));
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/domains/constants.test.mjs`
Expected: FAIL — cannot find module `lib/domains/constants.mjs`

- [x] **Implement**

```javascript
/**
 * Domain profile constants.
 *
 * Central registry of overlay types, filenames, bundled domain names,
 * and the domain name validation pattern.
 *
 * @module lib/domains/constants
 */

/** Valid overlay type identifiers (closed set). */
export const OVERLAY_TYPES = new Set([
  'charter-overlay',
  'spec-overlay',
  'reviewers',
  'gates',
  'verification',
  'gate-config',
  'test-config',
]);

/** Map overlay type -> filename on disk. */
export const OVERLAY_FILENAMES = new Map([
  ['charter-overlay', 'charter-overlay.md'],
  ['spec-overlay', 'spec-overlay.md'],
  ['reviewers', 'reviewers.yaml'],
  ['gates', 'gates.yaml'],
  ['verification', 'verification.yaml'],
  ['gate-config', 'gate-config.yaml'],
  ['test-config', 'test-config.yaml'],
]);

/** Overlay types that return parsed objects (YAML). */
export const STRUCTURED_OVERLAY_TYPES = new Set([
  'reviewers',
  'gates',
  'verification',
  'gate-config',
  'test-config',
]);

/** Bundled domain names — immutable, cannot be overridden in .context-index/domains/. */
export const BUNDLED_DOMAIN_NAMES = new Set([
  'software',
  'data-engineering',
  'process-automation',
]);

/** Domain name validation pattern: lowercase alphanumeric + hyphens, no path chars. */
export const DOMAIN_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Default domain when none is declared. */
export const DEFAULT_DOMAIN = 'software';

/** Max overlay file size in bytes. */
export const MAX_OVERLAY_SIZE = 512 * 1024;
```

- [x] **Verify test passes**

Run: `node --test tests/lib/domains/constants.test.mjs`
Expected: PASS

- [x] **Commit**

Branch (if not already created): `feat/domain-profiles/domain-resolution`

```bash
git add lib/domains/constants.mjs tests/lib/domains/constants.test.mjs
git commit -m "feat(domain-profiles): add overlay type constants module

Spec: .context-index/specs/features/domain-profiles/domain-resolution-and-overlay-structure.spec.md
Plan-task: 1"
```

---

### Task 2: `resolveDomain()` with Domain Name Validation [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=5
**Rationale:** Exact function signature, 4-level precedence, and validation pattern fully specified; deterministic pure function with no side effects.

**Charter capability:** Domain Resolution Function
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `lib/domains/resolve.mjs`
- Test: `tests/lib/domains/resolve.test.mjs`

**Tests:** `tests/lib/domains/resolve.test.mjs`

**Context to load:**
- `.context-index/specs/features/domain-profiles/domain-resolution-and-overlay-structure.spec.md` (Behaviors 1-4, 12; Function Signatures; Error Cases)
- `lib/domains/constants.mjs` (DOMAIN_NAME_PATTERN, DEFAULT_DOMAIN)

- [x] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolveDomain } from '../../../lib/domains/resolve.mjs';

describe('resolveDomain', () => {
  it('returns charter-level domain when present (Behavior 1)', () => {
    const result = resolveDomain(
      { project: {} },
      { domain: 'data-engineering' },
      null
    );
    assert.equal(result.resolved_domain, 'data-engineering');
    assert.equal(result.source_level, 'charter');
  });

  it('returns module-level domain when no charter domain (Behavior 2)', () => {
    const manifest = {
      project: {},
      modules: [{ slug: 'pipelines', domain: 'data-engineering' }],
    };
    const result = resolveDomain(manifest, null, 'pipelines');
    assert.equal(result.resolved_domain, 'data-engineering');
    assert.equal(result.source_level, 'module');
  });

  it('returns project-level domain when no charter or module domain (Behavior 3)', () => {
    const manifest = { project: { domain: 'process-automation' } };
    const result = resolveDomain(manifest, null, null);
    assert.equal(result.resolved_domain, 'process-automation');
    assert.equal(result.source_level, 'project');
  });

  it('returns "software" default when no domain declared (Behavior 4)', () => {
    const result = resolveDomain({ project: {} }, null, null);
    assert.equal(result.resolved_domain, 'software');
    assert.equal(result.source_level, 'default');
  });

  it('rejects invalid domain names (Behavior 12)', () => {
    assert.throws(
      () => resolveDomain({ project: {} }, { domain: '../traversal' }, null),
      /INVALID_DOMAIN_NAME/
    );
  });

  it('rejects domain names with path separators', () => {
    assert.throws(
      () => resolveDomain({ project: {} }, { domain: 'foo/bar' }, null),
      /INVALID_DOMAIN_NAME/
    );
  });

  it('skips empty charter domain value', () => {
    const result = resolveDomain(
      { project: { domain: 'process-automation' } },
      { domain: '' },
      null
    );
    assert.equal(result.resolved_domain, 'process-automation');
    assert.equal(result.source_level, 'project');
  });

  it('skips unmatched module slug', () => {
    const manifest = {
      project: { domain: 'software' },
      modules: [{ slug: 'other', domain: 'data-engineering' }],
    };
    const result = resolveDomain(manifest, null, 'pipelines');
    assert.equal(result.resolved_domain, 'software');
    assert.equal(result.source_level, 'project');
  });

  it('gracefully falls back when manifest is null', () => {
    const result = resolveDomain(null, null, null);
    assert.equal(result.resolved_domain, 'software');
    assert.equal(result.source_level, 'default');
  });

  it('is deterministic — same inputs produce same output', () => {
    const manifest = { project: { domain: 'data-engineering' } };
    const r1 = resolveDomain(manifest, null, null);
    const r2 = resolveDomain(manifest, null, null);
    assert.deepEqual(r1, r2);
  });

  it('charter takes precedence over module and project', () => {
    const manifest = {
      project: { domain: 'process-automation' },
      modules: [{ slug: 'mod', domain: 'data-engineering' }],
    };
    const result = resolveDomain(manifest, { domain: 'software' }, 'mod');
    assert.equal(result.resolved_domain, 'software');
    assert.equal(result.source_level, 'charter');
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/domains/resolve.test.mjs`
Expected: FAIL — cannot find module `lib/domains/resolve.mjs`

- [x] **Implement**

```javascript
/**
 * Domain resolution function.
 *
 * Resolves the active domain for a given context via 4-level precedence:
 * charter > module > project > default ("software").
 *
 * Pure function — deterministic, no side effects, no file I/O.
 *
 * @module lib/domains/resolve
 */

import { DOMAIN_NAME_PATTERN, DEFAULT_DOMAIN } from './constants.mjs';

/**
 * @param {object|null} manifest - Pre-parsed manifest.yaml object
 * @param {object|null} charterFrontmatter - Pre-parsed charter frontmatter or null
 * @param {string|null} moduleSlug - Module slug for module-level lookup
 * @returns {{ resolved_domain: string, source_level: "charter"|"module"|"project"|"default" }}
 */
export function resolveDomain(manifest, charterFrontmatter, moduleSlug) {
  // Level 1: Charter frontmatter
  if (charterFrontmatter?.domain) {
    validateDomainName(charterFrontmatter.domain, 'charter');
    return { resolved_domain: charterFrontmatter.domain, source_level: 'charter' };
  }

  // Level 2: Module-level in manifest
  if (moduleSlug && manifest?.modules) {
    const mod = manifest.modules.find(m => m.slug === moduleSlug);
    if (mod?.domain) {
      validateDomainName(mod.domain, 'module');
      return { resolved_domain: mod.domain, source_level: 'module' };
    }
  }

  // Level 3: Project-level in manifest
  if (manifest?.project?.domain) {
    validateDomainName(manifest.project.domain, 'project');
    return { resolved_domain: manifest.project.domain, source_level: 'project' };
  }

  // Level 4: Default
  return { resolved_domain: DEFAULT_DOMAIN, source_level: 'default' };
}

/**
 * Validate a domain name against the allowed pattern.
 * @param {string} name
 * @param {string} sourceLevel - For error message context
 * @throws {Error} With code INVALID_DOMAIN_NAME
 */
function validateDomainName(name, sourceLevel) {
  if (!DOMAIN_NAME_PATTERN.test(name)) {
    const err = new Error(
      `INVALID_DOMAIN_NAME: domain value "${name}" (from ${sourceLevel}) ` +
      `does not match pattern ${DOMAIN_NAME_PATTERN}. ` +
      `Domain names must be lowercase alphanumeric with hyphens, no path separators or ".." sequences.`
    );
    err.code = 'INVALID_DOMAIN_NAME';
    throw err;
  }
}
```

- [x] **Verify test passes**

Run: `node --test tests/lib/domains/resolve.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/domains/resolve.mjs tests/lib/domains/resolve.test.mjs
git commit -m "feat(domain-profiles): implement resolveDomain() with 4-level precedence

Spec: .context-index/specs/features/domain-profiles/domain-resolution-and-overlay-structure.spec.md
Plan-task: 2"
```

---

### Task 3: `loadOverlay()` Core with Path Safety [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=4
**Rationale:** Behaviors and error codes fully specified; combines file I/O, path safety, and YAML parsing from known patterns with reference implementation cited.

**Charter capability:** Overlay File Structure
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `lib/domains/overlay.mjs`
- Test: `tests/lib/domains/overlay.test.mjs`

**Tests:** `tests/lib/domains/overlay.test.mjs`

**Context to load:**
- `.context-index/specs/features/domain-profiles/domain-resolution-and-overlay-structure.spec.md` (Behaviors 5-6, 8, 10-11, 13; Schema Responsibility Boundary)
- `lib/profiles/yaml.mjs` (parseYaml for structured overlay parsing)
- `lib/governance/review-config.mjs` (realpathSync + path containment pattern reference)

- [x] **Write failing test**

```javascript
import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { createTempDir, cleanupTempDir, writeFixture } from '../../../tests/helpers.mjs';
import { loadOverlay } from '../../../lib/domains/overlay.mjs';

describe('loadOverlay — core', () => {
  let tmpDir;
  let pluginRoot;

  before(() => {
    tmpDir = createTempDir();
    pluginRoot = createTempDir();

    // Bundled software profile
    writeFixture(pluginRoot, 'templates/domains/software/charter-overlay.md', '# Software Charter');
    writeFixture(pluginRoot, 'templates/domains/software/reviewers.yaml', 'merge_strategy: append\nreviewers:\n  - id: structural-architect');
    writeFixture(pluginRoot, 'templates/domains/software/gates.yaml', 'gates:\n  - id: test');
  });

  after(() => {
    cleanupTempDir(tmpDir);
    cleanupTempDir(pluginRoot);
  });

  it('returns null for unknown overlay type (Behavior 6)', () => {
    const result = loadOverlay('software', 'unknown-type', tmpDir, pluginRoot);
    assert.equal(result, null);
  });

  it('returns string for markdown overlay (Behavior 10)', () => {
    const result = loadOverlay('software', 'charter-overlay', tmpDir, pluginRoot);
    assert.equal(typeof result, 'string');
    assert.ok(result.includes('# Software Charter'));
  });

  it('returns parsed object for structured overlay (Behavior 11)', () => {
    const result = loadOverlay('software', 'reviewers', tmpDir, pluginRoot);
    assert.equal(typeof result, 'object');
    assert.equal(result.merge_strategy, 'append');
  });

  it('returns null when no overlay file exists at any level (Behavior 8)', () => {
    const result = loadOverlay('software', 'verification', tmpDir, pluginRoot);
    assert.equal(result, null);
  });

  it('reads from bundled profile for software domain (Behavior 5)', () => {
    const result = loadOverlay('software', 'gates', tmpDir, pluginRoot);
    assert.ok(result);
    assert.ok(result.gates);
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/domains/overlay.test.mjs`
Expected: FAIL — cannot find module `lib/domains/overlay.mjs`

- [x] **Implement**

Implement `loadOverlay()` in `lib/domains/overlay.mjs` with:
- Overlay type validation against `OVERLAY_TYPES` constant set (return `null` for unknown types)
- `realpathSync()` root resolution for both `repoRoot` and `pluginRoot`
- Path containment check (`PATH_ESCAPE` error if candidate escapes root)
- Resolution order: custom `.context-index/domains/<domain>/<file>` -> bundled `templates/domains/<domain>/<file>`
- Markdown overlays returned as string, structured overlays parsed via `parseYaml()`
- `OVERLAY_PARSE_ERROR` with project-relative path and line number on malformed YAML
- `OVERLAY_TOO_LARGE` when file exceeds 512 KB (stat check before read)
- Empty file returns empty string or empty object (no error)
- `extends` chain is NOT implemented yet (Task 4)

Key imports: `fs` (readFileSync, statSync, existsSync, realpathSync), `path` (join, relative), `parseYaml` from `lib/profiles/yaml.mjs`, constants from `lib/domains/constants.mjs`.

- [x] **Verify test passes**

Run: `node --test tests/lib/domains/overlay.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/domains/overlay.mjs tests/lib/domains/overlay.test.mjs
git commit -m "feat(domain-profiles): implement loadOverlay() core with path safety

Spec: .context-index/specs/features/domain-profiles/domain-resolution-and-overlay-structure.spec.md
Plan-task: 3"
```

---

### Task 4: `extends` Resolution in `loadOverlay()` [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=4
**Rationale:** Extends chain behavior and error cases fully specified; one-level depth limit keeps complexity manageable with clear resolution order.

**Charter capability:** Custom Domain Support
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Modify: `lib/domains/overlay.mjs` (add extends resolution logic)
- Modify: `tests/lib/domains/overlay.test.mjs` (add extends test cases)

**Tests:** `tests/lib/domains/overlay.test.mjs`

**Context to load:**
- `.context-index/specs/features/domain-profiles/domain-resolution-and-overlay-structure.spec.md` (Behaviors 7, 14; Custom Domains and the extends Model; Error Cases lines 172-174)

- [x] **Write failing test**

Add test cases to `tests/lib/domains/overlay.test.mjs`:

```javascript
describe('loadOverlay — extends', () => {
  let tmpDir, pluginRoot;

  before(() => {
    tmpDir = createTempDir();
    pluginRoot = createTempDir();

    // Bundled software profile
    writeFixture(pluginRoot, 'templates/domains/software/charter-overlay.md', '# Software Charter');
    writeFixture(pluginRoot, 'templates/domains/software/reviewers.yaml', 'merge_strategy: append');

    // Custom domain extending software
    writeFixture(tmpDir, '.context-index/domains/my-project/domain.yaml', 'extends: software');
    writeFixture(tmpDir, '.context-index/domains/my-project/charter-overlay.md', '# My Custom Charter');
    // reviewers.yaml NOT provided — should inherit from software
  });

  after(() => {
    cleanupTempDir(tmpDir);
    cleanupTempDir(pluginRoot);
  });

  it('returns custom override when present (Behavior 7)', () => {
    const result = loadOverlay('my-project', 'charter-overlay', tmpDir, pluginRoot);
    assert.ok(result.includes('# My Custom Charter'));
  });

  it('falls back to parent via extends for missing overlay (Behavior 7)', () => {
    const result = loadOverlay('my-project', 'reviewers', tmpDir, pluginRoot);
    assert.equal(result.merge_strategy, 'append');
  });

  it('throws EXTENDS_NOT_FOUND for non-existent parent', () => {
    writeFixture(tmpDir, '.context-index/domains/bad-parent/domain.yaml', 'extends: nonexistent');
    assert.throws(
      () => loadOverlay('bad-parent', 'reviewers', tmpDir, pluginRoot),
      /EXTENDS_NOT_FOUND/
    );
  });

  it('throws EXTENDS_DEPTH_EXCEEDED when extending non-bundled domain', () => {
    writeFixture(tmpDir, '.context-index/domains/chain-a/domain.yaml', 'extends: software');
    writeFixture(tmpDir, '.context-index/domains/chain-b/domain.yaml', 'extends: chain-a');
    assert.throws(
      () => loadOverlay('chain-b', 'reviewers', tmpDir, pluginRoot),
      /EXTENDS_DEPTH_EXCEEDED/
    );
  });

  it('works without domain.yaml (no extends fallback)', () => {
    writeFixture(tmpDir, '.context-index/domains/standalone/charter-overlay.md', '# Standalone');
    const result = loadOverlay('standalone', 'charter-overlay', tmpDir, pluginRoot);
    assert.ok(result.includes('# Standalone'));
    const missing = loadOverlay('standalone', 'reviewers', tmpDir, pluginRoot);
    assert.equal(missing, null);
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/domains/overlay.test.mjs`
Expected: FAIL — extends resolution not implemented, tests for extends behavior fail

- [x] **Implement**

Add extends resolution to `loadOverlay()`:
1. After checking custom `.context-index/domains/<domain>/` for the requested file, if not found, read `domain.yaml` from that directory
2. Parse `extends` field using `parseYaml()`
3. Validate `extends` value against `DOMAIN_NAME_PATTERN` (SEC-4 from review notes)
4. Verify the `extends` target is a bundled domain (`BUNDLED_DOMAIN_NAMES.has(extends)`) — throw `EXTENDS_DEPTH_EXCEEDED` if not
5. Verify the bundled parent directory exists — throw `EXTENDS_NOT_FOUND` if not
6. Look up the overlay file in `<pluginRoot>/templates/domains/<extends>/<file>`
7. If custom domain directory lacks `domain.yaml`, no extends fallback occurs (files used directly)

- [x] **Verify test passes**

Run: `node --test tests/lib/domains/overlay.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/domains/overlay.mjs tests/lib/domains/overlay.test.mjs
git commit -m "feat(domain-profiles): add extends resolution to loadOverlay()

Spec: .context-index/specs/features/domain-profiles/domain-resolution-and-overlay-structure.spec.md
Plan-task: 4"
```

---

### Task 5: Bundled Override Guard [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=5
**Rationale:** Single guard check with explicit error code and message; mechanical implementation adding one conditional to existing function.

**Charter capability:** Custom Domain Support (invariant enforcement)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 3
**Files:**
- Modify: `lib/domains/overlay.mjs` (add BUNDLED_OVERRIDE_BLOCKED check)
- Modify: `tests/lib/domains/overlay.test.mjs` (add guard test cases)

**Tests:** `tests/lib/domains/overlay.test.mjs`

**Context to load:**
- `.context-index/specs/features/domain-profiles/domain-resolution-and-overlay-structure.spec.md` (Behavior 9; Error Cases line 171)
- `lib/domains/constants.mjs` (BUNDLED_DOMAIN_NAMES)

- [x] **Write failing test**

Add test cases to `tests/lib/domains/overlay.test.mjs`:

```javascript
describe('loadOverlay — bundled override guard', () => {
  let tmpDir, pluginRoot;

  before(() => {
    tmpDir = createTempDir();
    pluginRoot = createTempDir();
    writeFixture(pluginRoot, 'templates/domains/software/charter-overlay.md', '# Software');
    // User tries to override bundled domain
    writeFixture(tmpDir, '.context-index/domains/software/charter-overlay.md', '# Hacked');
  });

  after(() => {
    cleanupTempDir(tmpDir);
    cleanupTempDir(pluginRoot);
  });

  it('throws BUNDLED_OVERRIDE_BLOCKED when .context-index/domains/ matches bundled name (Behavior 9)', () => {
    assert.throws(
      () => loadOverlay('software', 'charter-overlay', tmpDir, pluginRoot),
      /BUNDLED_OVERRIDE_BLOCKED/
    );
  });

  it('includes guidance in error message', () => {
    try {
      loadOverlay('software', 'charter-overlay', tmpDir, pluginRoot);
      assert.fail('expected error');
    } catch (e) {
      assert.ok(e.message.includes('extends'));
      assert.ok(e.code === 'BUNDLED_OVERRIDE_BLOCKED');
    }
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/domains/overlay.test.mjs`
Expected: FAIL — guard not yet implemented

- [x] **Implement**

Add to the start of `loadOverlay()`, before any file reads:
1. Check if `.context-index/domains/<domain>/` exists at `repoRoot`
2. If it does AND `BUNDLED_DOMAIN_NAMES.has(domain)`, throw with code `BUNDLED_OVERRIDE_BLOCKED`
3. Message: `"Cannot override bundled domain '<name>'. Create a custom domain with 'extends: <name>' instead."`

- [x] **Verify test passes**

Run: `node --test tests/lib/domains/overlay.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/domains/overlay.mjs tests/lib/domains/overlay.test.mjs
git commit -m "feat(domain-profiles): add BUNDLED_OVERRIDE_BLOCKED guard

Spec: .context-index/specs/features/domain-profiles/domain-resolution-and-overlay-structure.spec.md
Plan-task: 5"
```

---

### Task 6: Comprehensive Integration Tests [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=4 pattern=4 blast=5 novelty=4
**Rationale:** All error cases enumerated in spec; test-helpers golden sample available; test-only files with zero production blast radius.

**Charter capability:** Domain Resolution Function, Overlay File Structure, Custom Domain Support
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5
**Files:**
- Modify: `tests/lib/domains/constants.test.mjs` (add edge cases)
- Modify: `tests/lib/domains/resolve.test.mjs` (add edge cases)
- Modify: `tests/lib/domains/overlay.test.mjs` (add OVERLAY_PARSE_ERROR, OVERLAY_TOO_LARGE, PATH_ESCAPE, empty file, DOMAIN_NOT_FOUND tests)

**Tests:** `tests/lib/domains/constants.test.mjs`, `tests/lib/domains/resolve.test.mjs`, `tests/lib/domains/overlay.test.mjs`

**Context to load:**
- `.context-index/specs/features/domain-profiles/domain-resolution-and-overlay-structure.spec.md` (all Error Cases, all Acceptance Criteria)

- [x] **Write failing test**

Add comprehensive edge-case tests covering all error codes:
- `OVERLAY_PARSE_ERROR`: malformed YAML in structured overlay (verify error message contains project-relative path and line number, not raw parser output)
- `OVERLAY_TOO_LARGE`: fixture file exceeding 512KB (use `writeFixture` with large content)
- `PATH_ESCAPE`: symlink or path component attempting to escape root
- Empty file returns empty string (markdown) or empty object (structured)
- `DOMAIN_NOT_FOUND`: resolved domain has no bundled profile directory
- `INVALID_DOMAIN_NAME`: domain with backslash, double dots, uppercase
- Verify `loadOverlay()` adds at most 2 file reads per call (AC-24 — structure test to verify via resolution short-circuiting)

- [x] **Verify test fails**

Run: `node --test tests/lib/domains/`
Expected: New edge-case tests fail if implementation has gaps

- [x] **Implement**

Fix any gaps in `constants.mjs`, `resolve.mjs`, or `overlay.mjs` revealed by the comprehensive tests. Ensure:
- Error messages use project-relative paths (via `path.relative(repoRoot, filePath)`)
- `OVERLAY_PARSE_ERROR` messages include line number from `YamlParseError.line` but not raw parser content
- Empty YAML files return `{}` (not `null` — parsed empty YAML is an empty object)

- [x] **Verify test passes**

Run: `npm test`
Expected: PASS — all existing tests plus new domain tests pass

- [x] **Commit**

```bash
git add tests/lib/domains/
git commit -m "test(domain-profiles): add comprehensive edge-case tests for domain resolution

Spec: .context-index/specs/features/domain-profiles/domain-resolution-and-overlay-structure.spec.md
Plan-task: 6"
```

---

### Task 7: Documentation Updates [specialist: none]

**Routing:** assisted-agent (score: 15/20)
**Scores:** spec=3 pattern=3 blast=5 novelty=4
**Rationale:** AC-26/AC-27 specify documentation targets but not exact content; docs structure requires interpretation of spec for user-facing prose.

**Charter capability:** (documentation requirement)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5
**Files:**
- Modify: `docs/configuration.md` (add Domain Profiles section)
- Modify: `docs/skill-reference.md` (note domain-aware behavior for affected skills)

**Tests:** (no test file — documentation only)

**Tests:** N/A — this is a documentation-only task. Verified by AC-26 and AC-27 existence checks.

**Context to load:**
- `.context-index/specs/features/domain-profiles/domain-resolution-and-overlay-structure.spec.md` (AC-26, AC-27)
- `.context-index/specs/features/domain-profiles/charter.md` (Scope and Boundaries)

- [x] **Write documentation**

Add to `docs/configuration.md`:
- Domain Profiles overview
- Resolution precedence (charter > module > project > default)
- `extends` model explanation
- Overlay type reference table (7 types with filenames)
- Customization workflow: create `.context-index/domains/<name>/domain.yaml` with `extends: <parent>`
- Reset instructions: change manifest back to bundled domain name

Update `docs/skill-reference.md`:
- Note that brainstorm, specify, review-specs, implement, and validate are domain-aware
- Describe the config loading pipeline per skill

- [x] **Commit**

```bash
git add docs/configuration.md docs/skill-reference.md
git commit -m "docs(domain-profiles): document domain resolution, extends model, and overlay types

Spec: .context-index/specs/features/domain-profiles/domain-resolution-and-overlay-structure.spec.md
Plan-task: 7"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied (28 criteria)
- No constitutional violations introduced
