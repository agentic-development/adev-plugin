# Implementation Plan: CLI and Registration

> **Methodology:** adev
> **Charter:** .context-index/specs/features/extensions/charter.md
> **Spec:** .context-index/specs/features/extensions/cli-and-registration.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-11)
> **Platform:** Node.js, JavaScript ESM, node:test, npm

**Goal:** Implement provider detection, skill/hook registration into provider hooks.json, and CLI commands for `extension install` and `extension list`.

**Architecture:** New `lib/extensions/register.mjs` handles provider detection and hooks.json registration. Skills are copied to `skills/<ext-name>-<skill-name>/SKILL.md`, hooks to `hooks/<ext-name>-<hook-event>.sh`, with path containment checks. CLI commands are wired into `cli/index.mjs` following the existing switch-case pattern. The `extension` command dispatches to `install` and `list` subcommands.

---

## File Structure

**Create:**
- `lib/extensions/register.mjs` — Provider detection, skill/hook file copying, hooks.json registration
- `tests/lib/extensions/register.test.mjs` — Registration tests

**Modify:**
- `cli/index.mjs` — Add `extension` command with `install` and `list` subcommands

**Reference (read, do not modify):**
- `lib/provider/registry.mjs` — `getProvider()`, `getProviderNames()` for provider detection pattern
- `hooks/hooks.json` — Existing hooks.json structure reference
- `lib/extensions/install.mjs` — `installExtension()`, `listExtensions()` from extension-core

## Context Packets

### Task 1 Context
- Spec: `cli-and-registration.spec.md` (behavior 9)
- Charter: `charter.md` (dependency: Provider Adapters)
- Reference: `lib/provider/registry.mjs` (provider detection pattern)

### Task 2 Context
- Spec: `cli-and-registration.spec.md` (behaviors 1–5; error cases PATH_TRAVERSAL, WARN_NO_PROVIDER)
- Charter: `charter.md` (capabilities: Skill Registration, Hook Registration)

### Task 3 Context
- Spec: `cli-and-registration.spec.md` (behaviors 6–8; error cases SOURCE_RESOLUTION, PREREQ)
- Charter: `charter.md` (capabilities: Extension List Command)
- Reference: `cli/index.mjs` (existing command pattern)

## Parallelization

- Group A (sequential): Task 1 → Task 2 (registration imports provider detection)
- Group B (depends on A + extension-core): Task 3 (CLI wires together all modules)

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Provider detection | small | unit | — | 1 create, 1 create (test) |
| 2 | Skill and hook registration | medium | unit | Task 1 | same file, same test file |
| 3 | CLI extension commands | medium | unit | Task 2, extension-core Tasks 1–4 | 0 create, 1 modify (cli/index.mjs), 1 create (test) |

---

### Task 1: Provider detection [specialist: none]

**Charter capability:** Skill Registration, Hook Registration (prerequisite)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/extensions/register.mjs`
- Test: `tests/lib/extensions/register.test.mjs`

**Tests:** `tests/lib/extensions/register.test.mjs`

- [x] **Write failing test**

```javascript
import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { detectProviders } from '../../../lib/extensions/register.mjs';
import { createTempDir, cleanupTempDir } from '../../helpers.mjs';

describe('extensions/register — provider detection', () => {
  let projectRoot;
  beforeEach(() => { projectRoot = createTempDir(); });
  afterEach(() => { cleanupTempDir(projectRoot); });

  it('detects .claude/ directory as claude-code provider', () => {
    mkdirSync(join(projectRoot, '.claude'));
    const providers = detectProviders(projectRoot);
    assert.ok(providers.some(p => p.name === 'claude-code'));
  });

  it('detects multiple providers', () => {
    mkdirSync(join(projectRoot, '.claude'));
    mkdirSync(join(projectRoot, '.codex'));
    const providers = detectProviders(projectRoot);
    assert.equal(providers.length, 2);
  });

  it('returns empty array when no providers found', () => {
    const providers = detectProviders(projectRoot);
    assert.equal(providers.length, 0);
  });
});
```

- [x] **Verify test fails** → FAIL
- [x] **Implement** `detectProviders(projectRoot)`:
  - Check for `.claude/`, `.codex/`, `.opencode/` directories within projectRoot
  - Return array of `{ name, hooksJsonPath }` for detected providers
- [x] **Verify test passes** → PASS
- [x] **Commit**

```bash
git add lib/extensions/register.mjs tests/lib/extensions/register.test.mjs
git commit -m "feat(extensions): add provider detection

Spec: .context-index/specs/features/extensions/cli-and-registration.spec.md
Plan-task: 1"
```

---

### Task 2: Skill and hook registration [specialist: none]

**Charter capability:** Skill Registration, Hook Registration
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `lib/extensions/register.mjs`
- Modify: `tests/lib/extensions/register.test.mjs`

**Tests:** `tests/lib/extensions/register.test.mjs`

- [x] **Write failing test**

```javascript
describe('extensions/register — skill registration', () => {
  it('copies SKILL.md and registers in hooks.json', () => {
    mkdirSync(join(projectRoot, '.claude'));
    writeFileSync(join(extDir, 'SKILL.md'), '# My Skill');
    registerSkill(projectRoot, pluginRoot, extDir, {
      extensionName: 'my-ext', skillName: 'my-skill', description: 'A skill'
    });
    const hooksJson = JSON.parse(readFileSync(join(projectRoot, '.claude/hooks.json'), 'utf8'));
    assert.ok(hooksJson.skills.some(s => s.name === 'my-skill'));
  });

  it('auto-creates hooks.json when missing', () => {
    mkdirSync(join(projectRoot, '.claude'));
    writeFileSync(join(extDir, 'SKILL.md'), '# Skill');
    registerSkill(projectRoot, pluginRoot, extDir, {
      extensionName: 'my-ext', skillName: 'test', description: 'Test'
    });
    assert.ok(existsSync(join(projectRoot, '.claude/hooks.json')));
  });

  it('updates existing entry on re-install (idempotent)', () => {
    mkdirSync(join(projectRoot, '.claude'));
    writeFileSync(join(extDir, 'SKILL.md'), '# Skill');
    registerSkill(projectRoot, pluginRoot, extDir, {
      extensionName: 'my-ext', skillName: 'test', description: 'v1'
    });
    registerSkill(projectRoot, pluginRoot, extDir, {
      extensionName: 'my-ext', skillName: 'test', description: 'v2'
    });
    const hooksJson = JSON.parse(readFileSync(join(projectRoot, '.claude/hooks.json'), 'utf8'));
    assert.equal(hooksJson.skills.filter(s => s.name === 'test').length, 1);
    assert.equal(hooksJson.skills.find(s => s.name === 'test').description, 'v2');
  });

  it('rejects path traversal in hook command', () => {
    mkdirSync(join(projectRoot, '.claude'));
    assert.throws(
      () => registerHook(projectRoot, pluginRoot, extDir, {
        extensionName: 'evil', event: '../../escape', command: 'hook.sh'
      }),
      (err) => err.code === 'PATH_TRAVERSAL'
    );
  });

  it('emits WARN_NO_PROVIDER when no provider dirs exist', () => {
    // projectRoot has no .claude/, .codex/, or .opencode/
    writeFileSync(join(extDir, 'SKILL.md'), '# Skill');
    const result = registerSkill(projectRoot, pluginRoot, extDir, {
      extensionName: 'my-ext', skillName: 'test', description: 'Test'
    });
    assert.ok(result.warnings.some(w => w.code === 'WARN_NO_PROVIDER'));
  });
});
```

- [x] **Verify test fails** → FAIL
- [x] **Implement**:
  - `pluginRoot` is resolved using the same pattern as `cli/index.mjs`: `resolve(dirname(fileURLToPath(import.meta.url)), '../..')` from within `lib/extensions/`. Alternatively, accept it as a parameter from the caller (the orchestrator in `install.mjs` resolves it once).
  - Export `registerSkill(projectRoot, pluginRoot, extSourceDir, { extensionName, skillName, description })`:
    - Copy SKILL.md to `<pluginRoot>/skills/<extensionName>-<skillName>/SKILL.md`
    - Verify dest within `skills/` directory
    - Upsert into hooks.json `skills` array
  - Export `registerHook(projectRoot, pluginRoot, extSourceDir, { extensionName, event, command })`:
    - Verify source within extSourceDir, dest within `<pluginRoot>/hooks/`
    - Copy hook script to `<pluginRoot>/hooks/<extensionName>-<event>.sh`
    - Set `command` in hooks.json to absolute path of installed copy (not from manifest)
    - Upsert into hooks.json `hooks` array
  - Both functions: detect all providers, register in each
  - Auto-create hooks.json with `{ "hooks": [], "skills": [] }` if missing
  - `WARN_NO_PROVIDER` if no providers detected (warn, don't throw)
- [x] **Verify test passes** → PASS
- [x] **Commit**

```bash
git add lib/extensions/register.mjs tests/lib/extensions/register.test.mjs
git commit -m "feat(extensions): add skill and hook registration with path containment

Spec: .context-index/specs/features/extensions/cli-and-registration.spec.md
Plan-task: 2"
```

---

### Task 3: CLI extension commands [specialist: none]

**Charter capability:** Extension List Command
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2, extension-core Tasks 1–4
**Files:**
- Modify: `cli/index.mjs`
- Test: `tests/cli-extension.test.mjs`

**Tests:** `tests/cli-extension.test.mjs`

- [x] **Write failing test**

```javascript
import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir, writeFixture, PLUGIN_ROOT } from './helpers.mjs';

describe('CLI extension commands', () => {
  let tmp;
  beforeEach(() => {
    tmp = createTempDir();
    writeFixture(tmp, '.context-index/manifest.yaml', 'project:\n  name: test\n');
  });
  afterEach(() => { cleanupTempDir(tmp); });

  it('extension list shows no extensions message', () => {
    const result = spawnSync('node', [join(PLUGIN_ROOT, 'cli/index.mjs'), 'extension', 'list'], {
      cwd: tmp, env: { ...process.env }
    });
    assert.ok(result.stdout.toString().includes('No extensions installed'));
  });

  it('extension install with invalid source fails', () => {
    const result = spawnSync('node', [join(PLUGIN_ROOT, 'cli/index.mjs'), 'extension', 'install'], {
      cwd: tmp, env: { ...process.env }
    });
    assert.notEqual(result.status, 0);
  });

  it('extension list shows installed extension after install', () => {
    // Create a local extension fixture (complete enough for installExtension)
    const extDir = createTempDir();
    writeFixture(extDir, 'adev-extension.yaml', 'name: test-ext\nversion: 1.0.0\nprovides: {}\n');
    
    spawnSync('node', [join(PLUGIN_ROOT, 'cli/index.mjs'), 'extension', 'install', extDir], {
      cwd: tmp, env: { ...process.env }
    });
    
    const result = spawnSync('node', [join(PLUGIN_ROOT, 'cli/index.mjs'), 'extension', 'list'], {
      cwd: tmp, env: { ...process.env }
    });
    assert.ok(result.stdout.toString().includes('test-ext'));
    cleanupTempDir(extDir);
  });
});
```

- [x] **Verify test fails** → FAIL
- [x] **Implement** — Add to `cli/index.mjs`:
  - Add `case "extension":` to the command switch
  - Parse subcommand: `process.argv[3]` → `install` or `list`
  - `extension install <source>`:
    1. `resolveExtensionSource(source)`
    2. `installExtension(resolvedPath, projectRoot)`
    3. Display install report (files written, merges, warnings)
  - `extension list`:
    1. Read `manifest.yaml`
    2. Read `installed_extensions`
    3. Display table: Name, Version, Installed Date, Source
    4. If empty: "No extensions installed."
  - Import `resolveExtensionSource` from `lib/extensions/resolve-source.mjs`
  - Import `installExtension`, `readManifestStamps` from `lib/extensions/install.mjs`
- [x] **Verify test passes** → PASS
- [x] **Commit**

```bash
git add cli/index.mjs tests/cli-extension.test.mjs
git commit -m "feat(extensions): add CLI extension install and list commands

Spec: .context-index/specs/features/extensions/cli-and-registration.spec.md
Plan-task: 3"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite.

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied
