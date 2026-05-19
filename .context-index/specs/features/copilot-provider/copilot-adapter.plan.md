<!-- DO NOT EDIT statuses inline — see lifecycle log copilot-adapter.jsonl -->

# Implementation Plan: CopilotAdapter — install / uninstall / status

> **Methodology:** adev
> **Charter:** .context-index/specs/features/copilot-provider/charter.md (rev 6, approved)
> **Spec:** .context-index/specs/features/copilot-provider/copilot-adapter.spec.md (rev 2)
> **Review:** PASS_WITH_NOTES (2026-05-19, rev 2)
> **Platform:** Node.js (ESM, `.mjs`), node:test, npm, no new external deps

**Goal:** Ship the fifth peer provider adapter for GitHub Copilot. Materializes adev's skills + hooks into the consuming project's `.github/` tree (no plugin home — Copilot is file-convention-based). Optional `--user` flag mirrors a subset under `~/.copilot/`. State record at `.github/.adev-copilot-install.json` is the single source of truth for what `uninstall` touches, with re-validation against `^[a-z0-9-]{1,64}$` + path-confinement on uninstall to defend against state-record forgery.

**Architecture:** One adapter module at `providers/copilot/adapter.mjs` exporting the peer-adapter shape (`name: "copilot"`, `pluginRoot`, `version`, `detect()`, `install()`, `uninstall()`, `status()`, plus `getCopilotHome()` and `validateSkillNames()` helpers). Three helper modules under `lib/providers/copilot/` for the install pipeline: `skill-validator.mjs` (NFC + regex check on every skill dir), `symlink-scanner.mjs` (pre-copy rejection of symlinks under `skills/`), `hook-config-rewriter.mjs` (absolute→relative path rewrite from `pluginRoot/hooks/*.sh` to `./scripts/<name>.sh` inside `hooks.json`). The adapter consumes the committed `providers/copilot/hooks.json` produced by the sibling `copilot-hook-generator` plan — this plan does NOT touch the generator. Hook scripts are **copied** into `.github/hooks/scripts/` (closing SEC-5 absolute-path leak) using `fs.cpSync({ recursive: true, dereference: false, verbatimSymlinks: false })` (closing SEC-2 symlink-follow). User-scope writes happen before repo-scope when `user: true`; the state record is written **last** so partial-failure leaves no committed record. CLI integration via `cli/index.mjs` install dispatch (`adapter.name === "copilot"`). One brief `lib/providers/copilot/README.md` documents the principled `opts.projectRoot + opts.user` divergence from peer adapters' `opts.scope`. The `cli` charter is bumped to list Copilot in its provider list; the copilot-provider charter is already at rev 6.

**Review notes carried forward (non-blocking):**
- **SEC-9** (rev 2 PASS_WITH_NOTES warning, security): uninstall's `rmSync` symlink-following defense gap — folded in as an explicit `lstatSync.isSymbolicLink()` check in Task 7 below.
- **SEC-10** (rev 2 PASS_WITH_NOTES warning, security): user-scope partial-failure leaves orphaned `~/.copilot/` tree — addressed by explicitly declaring user-scope uninstall **out of scope for v1** in this plan (see Task 6's notes); tracked as a deferred capability in the parent charter for a future revision.
- **CON-9** (rev 2 PASS_WITH_NOTES warning, consistency): hook config filename aggregation — folded in as a one-line rationale comment inside Task 4's emitted state record.

---

## File Structure

**Create:**
- `providers/copilot/adapter.mjs` — peer adapter exporting `CopilotAdapter`.
- `lib/providers/copilot/skill-validator.mjs` — `validateSkillNames(skillsDir)` pure helper.
- `lib/providers/copilot/symlink-scanner.mjs` — `scanForSymlinks(dir)` pure helper that throws `SKILL_CONTAINS_SYMLINK` on first hit.
- `lib/providers/copilot/hook-config-rewriter.mjs` — `rewriteHookConfigForCopilot(config, pluginRoot)` pure helper. Returns `{ rewrittenConfig, scriptFiles: string[] }`.
- `lib/providers/copilot/README.md` — brief documentation of the `opts.projectRoot + opts.user` divergence from peer adapters.
- `tests/copilot-adapter.test.mjs` — end-to-end adapter tests (install in fixture repo, uninstall, status, dry-run, idempotency).
- `tests/copilot-skill-validator.test.mjs` — unit tests for skill validation.
- `tests/copilot-symlink-scanner.test.mjs` — unit tests for symlink rejection.
- `tests/copilot-hook-config-rewriter.test.mjs` — unit tests for absolute→relative path rewriting + zero-pluginRoot assertion.
- `tests/copilot-adapter-uninstall-defense.test.mjs` — security-focused uninstall tests (state-record forgery rejection, symlink rejection, schema-version gating).
- `docs/smoke-install-copilot.md` — manual smoke verification procedure.

**Modify:**
- `cli/index.mjs` — install/uninstall/status dispatchers gain a `copilot` target. Parse `--user`, `--dry-run`, `--force` flags. Route to `CopilotAdapter`.
- `.context-index/specs/features/cli/charter.md` — update the `install` command description's provider list to include `Copilot`; bump charter revision.

**Reference (read, do not modify):**
- `providers/opencode/adapter.mjs` — peer adapter shape reference (exports, `getOpenCodeConfigDir` pattern).
- `providers/claude-code/adapter.mjs` — peer adapter shape reference (`detect()` pattern, `getClaudeHome()` pattern).
- `providers/copilot/hooks.json` — produced by `copilot-hook-generator` plan (Task 6); consumed unchanged by this adapter.
- `hooks/*.sh` — copied into `.github/hooks/scripts/` at install time; not modified.
- `skills/*/SKILL.md` — validated and copied by the adapter; not modified.
- `.context-index/specs/features/copilot-provider/copilot-adapter.spec.md` — authoritative spec.
- `.context-index/constitution.md` — Principles 1, 3; anti-pattern on hardcoded `~/.claude/`.

---

## Context Packets

### Task 1 Context (skill-validator)
- Spec: `copilot-adapter.spec.md` Behaviors §6 + Error Cases rows for `INVALID_SKILL_NAME`, `SKILL_NAME_MISMATCH`, `INVALID_SKILL_FRONTMATTER`
- Sample SKILL.md files: `skills/init/SKILL.md`, `skills/brainstorm/SKILL.md` (signatures only — frontmatter shape reference)
- Constitution: Principle 3 (pure ESM)

### Task 2 Context (symlink-scanner)
- Spec: `copilot-adapter.spec.md` Behaviors §1(b) + Error Cases row for `SKILL_CONTAINS_SYMLINK`
- Node.js docs concept: `fs.lstatSync` vs `fs.statSync` (lstat does not follow)

### Task 3 Context (hook-config-rewriter)
- Spec: `copilot-adapter.spec.md` Behaviors §1(e), Install-Surface Map, Postconditions (no absolute paths in committed output)
- Reference impl: existing committed `providers/cursor/hooks.json` (peer pattern — same canonical input, different translation table, but absolute-path rewrite concept is novel to this adapter)
- Source file: `providers/copilot/hooks.json` (full read — input shape; comes from the sibling `copilot-hook-generator` plan)

### Task 4 Context (adapter core)
- Spec: `copilot-adapter.spec.md` Peer-Adapter Surface table + Behaviors §0/§1/§2/§3/§4/§5 + Postconditions + Error Cases
- Charter: `copilot-provider/charter.md` Domain Model `CopilotAdapter` entity, Exposed APIs rows
- Sibling files (Tasks 1, 2, 3 outputs): `lib/providers/copilot/{skill-validator,symlink-scanner,hook-config-rewriter}.mjs` (full read)
- Reference impl: `providers/opencode/adapter.mjs` and `providers/claude-code/adapter.mjs` (full read — peer shape)
- Test helpers: `tests/helpers.mjs` (`createTempDir`, `writeFixture`)

### Task 5 Context (CLI integration)
- Source file: `cli/index.mjs` (the install/uninstall/status verb dispatch logic — full read)
- Spec: Behaviors §7 — `adev install --target copilot [--user] [--dry-run]`, `adev uninstall --target copilot [--force]`, `adev status --target copilot`
- Sibling adapters: see how each registers itself in the dispatch table (one of `providers/*/adapter.mjs`)

### Task 6 Context (CLI charter revision)
- `.context-index/specs/features/cli/charter.md` (`install` command description row)
- Spec acceptance criterion: provider list includes Copilot

### Task 7 Context (uninstall-defense tests)
- Spec: Behavior §4 + Error Cases rows for `SUSPICIOUS_STATE_ENTRY`, `STATE_RECORD_TAMPERED`, `STATE_RECORD_VERSION_INCOMPATIBLE`
- Spec acceptance criteria: tampered state record with `["../etc/passwd"]` rejected; `schemaVersion: 2` requires `--force`; `pluginVersion` mismatch is warning-only

### Task 8 Context (smoke-install procedure docs)
- Spec: Behavior §9 + AGENTS.md Compatibility Stance
- Research: `.context-index/research/github-copilot-extensibility-2026-05-19.md` Q6 (Copilot CLI install commands)

### Task 9 Context (README for argument-convention divergence)
- Spec: Behavioral Contract paragraph "Argument-convention divergence from peers"
- Charter: `copilot-provider/charter.md` Interface Contracts rows for `CopilotAdapter.install({ projectRoot, dryRun, user })`

---

## Parallelization

- Group A (parallel): Task 1 (skill-validator) || Task 2 (symlink-scanner) || Task 3 (hook-config-rewriter) — all independent helpers
- Group B (depends on Group A): Task 4 (adapter core) — orchestrates Tasks 1-3
- Group C (depends on Group B): Task 5 (CLI integration) || Task 7 (uninstall-defense tests) || Task 8 (smoke docs) || Task 9 (README) — all independent given the adapter exists
- Group D (depends on Group C): Task 6 (CLI charter revision) — small markdown update, can also run alongside Group C

Bias: complete Group A in parallel, Task 4 next, then Group C/D in parallel.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Skill validator helper | small | unit | — | 1 create, 1 test |
| 2 | Symlink scanner helper | small | unit | — | 1 create, 1 test |
| 3 | Hook-config rewriter helper | medium | unit | — | 1 create, 1 test |
| 4 | CopilotAdapter core | large | unit | 1, 2, 3 | 1 create, 1 test |
| 5 | CLI install/uninstall/status integration | medium | unit | 4 | 1 modify |
| 6 | CLI charter revision | small | unit | 5 | 1 modify |
| 7 | Uninstall-defense security tests | medium | unit | 4 | 1 create |
| 8 | Smoke-install procedure docs | small | unit | 4, 5 | 1 create |
| 9 | Argument-convention README | small | unit | 4 | 1 create |

---

## Task Structure

### Task 1: Skill validator helper [specialist: none]

**Charter capability:** Skill name compliance check
**Strategy:** unit
**Files:**
- Create: `lib/providers/copilot/skill-validator.mjs`
- Test: `tests/copilot-skill-validator.test.mjs`

**Tests:** Regex enforcement, NFC normalization, frontmatter `name:` equality, 64-KiB cap, non-ASCII rejection.

- [ ] **Write failing test:**

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { validateSkillNames } from '../lib/providers/copilot/skill-validator.mjs';

function makeFixture(skills) {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-skills-'));
  for (const [name, content] of Object.entries(skills)) {
    mkdirSync(path.join(dir, name), { recursive: true });
    writeFileSync(path.join(dir, name, 'SKILL.md'), content);
  }
  return dir;
}

test('valid skill names pass', () => {
  const dir = makeFixture({ 'adev-init': '---\nname: adev-init\n---\n# X\n' });
  assert.deepEqual(validateSkillNames(dir), ['adev-init']);
  rmSync(dir, { recursive: true, force: true });
});

test('uppercase directory name rejected with INVALID_SKILL_NAME', () => {
  const dir = makeFixture({ 'Foo_Bar': '---\nname: Foo_Bar\n---\n# X\n' });
  assert.throws(() => validateSkillNames(dir), /INVALID_SKILL_NAME: Foo_Bar/);
  rmSync(dir, { recursive: true, force: true });
});

test('frontmatter name mismatch rejected with SKILL_NAME_MISMATCH', () => {
  const dir = makeFixture({ 'adev-init': '---\nname: adev-brainstorm\n---\n# X\n' });
  assert.throws(() => validateSkillNames(dir), /SKILL_NAME_MISMATCH/);
  rmSync(dir, { recursive: true, force: true });
});

test('oversize frontmatter rejected with INVALID_SKILL_FRONTMATTER', () => {
  const huge = '---\nname: adev-init\ndescription: ' + 'A'.repeat(65 * 1024) + '\n---\n';
  const dir = makeFixture({ 'adev-init': huge });
  assert.throws(() => validateSkillNames(dir), /INVALID_SKILL_FRONTMATTER/);
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Verify test fails:** module not found.

- [ ] **Implement:** `validateSkillNames(skillsDir)` — `readdirSync`, for each dir: read `SKILL.md` (cap at 64 KiB via `readFileSync` + length check), parse frontmatter with a minimal allocation-bounded YAML reader (extract only the `name:` line), NFC-normalize both dir name and frontmatter name, assert both match `^[a-z0-9-]{1,64}$` AND byte-equal each other. Throws documented error codes; returns the validated dir names.

- [ ] **Verify test passes:** `node --test tests/copilot-skill-validator.test.mjs` → PASS.

- [ ] **Commit:**

```bash
git add lib/providers/copilot/skill-validator.mjs tests/copilot-skill-validator.test.mjs
git commit -m "feat(copilot-provider): add skill-name validator with NFC + regex + frontmatter checks

Spec: .context-index/specs/features/copilot-provider/copilot-adapter.spec.md
Plan-task: 1"
```

---

### Task 2: Symlink scanner helper [specialist: none]

**Charter capability:** Skill name compliance check (defense-in-depth)
**Strategy:** unit
**Files:**
- Create: `lib/providers/copilot/symlink-scanner.mjs`
- Test: `tests/copilot-symlink-scanner.test.mjs`

**Tests:** Symlink at top-level rejected; nested symlink rejected; no-symlink tree passes.

- [ ] **Write failing test:**

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { scanForSymlinks } from '../lib/providers/copilot/symlink-scanner.mjs';

test('clean tree returns true', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'symlink-scan-'));
  writeFileSync(path.join(dir, 'foo.txt'), 'ok');
  assert.equal(scanForSymlinks(dir), true);
  rmSync(dir, { recursive: true, force: true });
});

test('top-level symlink rejected', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'symlink-scan-'));
  symlinkSync('/etc/passwd', path.join(dir, 'leak'));
  assert.throws(() => scanForSymlinks(dir), /SKILL_CONTAINS_SYMLINK/);
  rmSync(dir, { recursive: true, force: true });
});

test('nested symlink rejected', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'symlink-scan-'));
  mkdirSync(path.join(dir, 'sub'));
  symlinkSync('/etc/passwd', path.join(dir, 'sub', 'leak'));
  assert.throws(() => scanForSymlinks(dir), /SKILL_CONTAINS_SYMLINK/);
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Verify test fails.**

- [ ] **Implement:** recursive walk using `readdirSync(dir, { withFileTypes: true })`; for each entry, check `lstatSync(fullPath).isSymbolicLink()` (note: `dirent.isSymbolicLink()` works directly from `withFileTypes`); throws `SKILL_CONTAINS_SYMLINK: <fullPath>` on first hit; recurses into directories.

- [ ] **Verify test passes.**

- [ ] **Commit:**

```bash
git add lib/providers/copilot/symlink-scanner.mjs tests/copilot-symlink-scanner.test.mjs
git commit -m "feat(copilot-provider): add pre-copy symlink scanner

Spec: .context-index/specs/features/copilot-provider/copilot-adapter.spec.md
Plan-task: 2"
```

---

### Task 3: Hook-config rewriter helper [specialist: none]

**Charter capability:** CopilotAdapter install (no absolute-path leak)
**Strategy:** unit
**Files:**
- Create: `lib/providers/copilot/hook-config-rewriter.mjs`
- Test: `tests/copilot-hook-config-rewriter.test.mjs`

**Tests:** Absolute paths under `pluginRoot/hooks/` rewritten to `./scripts/<name>.sh`; output contains zero absolute paths; returns the list of script files to copy.

- [ ] **Write failing test:**

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { rewriteHookConfigForCopilot } from '../lib/providers/copilot/hook-config-rewriter.mjs';

test('absolute pluginRoot/hooks/foo.sh rewritten to ./scripts/foo.sh', () => {
  const pluginRoot = '/Users/dev/adev-plugin';
  const input = {
    version: 1,
    hooks: {
      preToolUse: [{ type: 'command', bash: '/Users/dev/adev-plugin/hooks/foo.sh', cwd: '.' }],
    },
  };
  const { rewrittenConfig, scriptFiles } = rewriteHookConfigForCopilot(input, pluginRoot);
  assert.equal(rewrittenConfig.hooks.preToolUse[0].bash, './scripts/foo.sh');
  assert.deepEqual(scriptFiles, ['foo.sh']);
});

test('output contains zero absolute paths from pluginRoot', () => {
  const pluginRoot = '/Users/dev/adev-plugin';
  const input = {
    version: 1,
    hooks: {
      preToolUse: [{ type: 'command', bash: '/Users/dev/adev-plugin/hooks/a.sh', cwd: '.' }],
      postToolUse: [{ type: 'command', bash: '/Users/dev/adev-plugin/hooks/b.sh', cwd: '.' }],
    },
  };
  const { rewrittenConfig } = rewriteHookConfigForCopilot(input, pluginRoot);
  const json = JSON.stringify(rewrittenConfig);
  assert.equal(json.includes(pluginRoot), false);
  assert.equal(json.includes('/Users/'), false);
});

test('script file list is deduplicated', () => {
  const pluginRoot = '/p';
  const input = {
    hooks: {
      preToolUse: [{ bash: '/p/hooks/dup.sh' }],
      postToolUse: [{ bash: '/p/hooks/dup.sh' }],
    },
  };
  const { scriptFiles } = rewriteHookConfigForCopilot(input, pluginRoot);
  assert.deepEqual(scriptFiles.sort(), ['dup.sh']);
});
```

- [ ] **Verify test fails.**

- [ ] **Implement:** deep-clone the config, walk every event array, for each entry replace `bash` field via `path.relative(path.join(pluginRoot, 'hooks'), entry.bash)` then prepend `./scripts/`; collect the basenames in a `Set`; return `{ rewrittenConfig, scriptFiles: [...set] }`.

- [ ] **Verify test passes.**

- [ ] **Commit:**

```bash
git add lib/providers/copilot/hook-config-rewriter.mjs tests/copilot-hook-config-rewriter.test.mjs
git commit -m "feat(copilot-provider): add hook-config rewriter (absolute → ./scripts/ relative)

Closes SEC-5: no absolute pluginRoot paths in committed .github/hooks/hooks.json.

Spec: .context-index/specs/features/copilot-provider/copilot-adapter.spec.md
Plan-task: 3"
```

---

### Task 4: CopilotAdapter core [specialist: none]

**Charter capability:** CopilotAdapter install/uninstall/status, AGENTS.md compat confirmation
**Strategy:** unit
**Depends on:** Task 1, Task 2, Task 3
**Files:**
- Create: `providers/copilot/adapter.mjs`
- Test: `tests/copilot-adapter.test.mjs`

**Tests:** Install in fixture repo (with/without `--user`/`--dry-run`); uninstall; status before/after; idempotent install; `INVALID_SKILL_NAME` rejection (delegated to Task 1); `SKILL_CONTAINS_SYMLINK` rejection (delegated to Task 2); `INSTALL_PATH_ESCAPE` synthetic test; no-absolute-paths string-scan on committed output.

- [ ] **Write failing test** (in-fixture-repo install + assertion suite):

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { CopilotAdapter } from '../providers/copilot/adapter.mjs';

function makeProjectRoot() {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-install-'));
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  return dir;
}

test('detect() returns true when COPILOT env is set', () => {
  process.env.COPILOT = 'true';
  try { assert.equal(CopilotAdapter.detect(), true); }
  finally { delete process.env.COPILOT; }
});

test('install writes .github/skills/, .github/hooks/hooks.json, state record', () => {
  const projectRoot = makeProjectRoot();
  const result = CopilotAdapter.install({ projectRoot, dryRun: false, user: false });
  assert.equal(result.installed, true);
  assert.ok(existsSync(path.join(projectRoot, '.github/skills')));
  assert.ok(existsSync(path.join(projectRoot, '.github/hooks/hooks.json')));
  assert.ok(existsSync(path.join(projectRoot, '.github/.adev-copilot-install.json')));
  rmSync(projectRoot, { recursive: true, force: true });
});

test('committed hooks.json contains no pluginRoot absolute paths', () => {
  const projectRoot = makeProjectRoot();
  CopilotAdapter.install({ projectRoot, dryRun: false, user: false });
  const config = readFileSync(path.join(projectRoot, '.github/hooks/hooks.json'), 'utf8');
  assert.equal(/\/Users\/|\/home\/|C:\\/.test(config), false);
  rmSync(projectRoot, { recursive: true, force: true });
});

test('install fails when projectRoot is not a git repo', () => {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'not-a-repo-'));
  assert.throws(() => CopilotAdapter.install({ projectRoot, dryRun: false, user: false }), /NOT_A_GIT_REPO/);
  rmSync(projectRoot, { recursive: true, force: true });
});

test('dry-run writes nothing', () => {
  const projectRoot = makeProjectRoot();
  const result = CopilotAdapter.install({ projectRoot, dryRun: true, user: false });
  assert.equal(existsSync(path.join(projectRoot, '.github')), false);
  assert.ok(Array.isArray(result.wouldWrite));
  rmSync(projectRoot, { recursive: true, force: true });
});

test('uninstall removes only state-record-listed paths; leaves sync-output untouched', () => {
  const projectRoot = makeProjectRoot();
  CopilotAdapter.install({ projectRoot, dryRun: false, user: false });
  // Simulate sync-output presence
  writeFileSync(path.join(projectRoot, '.github/copilot-instructions.md'), 'sync output');
  CopilotAdapter.uninstall({ projectRoot });
  assert.equal(existsSync(path.join(projectRoot, '.github/.adev-copilot-install.json')), false);
  assert.equal(existsSync(path.join(projectRoot, '.github/skills')), false);
  assert.ok(existsSync(path.join(projectRoot, '.github/copilot-instructions.md')), 'sync-output preserved');
  rmSync(projectRoot, { recursive: true, force: true });
});

test('idempotent install: running twice produces identical post-state', () => {
  const projectRoot = makeProjectRoot();
  CopilotAdapter.install({ projectRoot, dryRun: false, user: false });
  const before = readFileSync(path.join(projectRoot, '.github/.adev-copilot-install.json'), 'utf8');
  CopilotAdapter.install({ projectRoot, dryRun: false, user: false });
  const after = readFileSync(path.join(projectRoot, '.github/.adev-copilot-install.json'), 'utf8');
  // installedAt timestamp will differ; everything else should match
  assert.equal(JSON.parse(before).skills.length, JSON.parse(after).skills.length);
  rmSync(projectRoot, { recursive: true, force: true });
});

test('status returns documented shape', () => {
  const projectRoot = makeProjectRoot();
  const before = CopilotAdapter.status({ projectRoot });
  assert.equal(before.installed, false);
  CopilotAdapter.install({ projectRoot, dryRun: false, user: false });
  const after = CopilotAdapter.status({ projectRoot });
  assert.equal(after.installed, true);
  assert.equal(typeof after.skillCount, 'number');
  assert.equal(after.hookConfigPresent, true);
  assert.ok(after.syncOutputPresent && typeof after.syncOutputPresent.repoInstructions === 'boolean');
  assert.ok(after.agentsMd && typeof after.agentsMd.exists === 'boolean');
  rmSync(projectRoot, { recursive: true, force: true });
});

test('exports the peer-adapter surface (name, pluginRoot, version, detect)', () => {
  assert.equal(CopilotAdapter.name, 'copilot');
  assert.equal(typeof CopilotAdapter.pluginRoot, 'string');
  assert.equal(typeof CopilotAdapter.version, 'string');
  assert.equal(typeof CopilotAdapter.detect, 'function');
});
```

- [ ] **Verify tests fail.**

- [ ] **Implement** (skeleton):

```javascript
// providers/copilot/adapter.mjs
import { existsSync, readFileSync, writeFileSync, cpSync, chmodSync, mkdirSync, readdirSync, rmSync, lstatSync, renameSync, statSync } from 'node:fs';
import { join, dirname, resolve, sep, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { validateSkillNames } from '../../lib/providers/copilot/skill-validator.mjs';
import { scanForSymlinks } from '../../lib/providers/copilot/symlink-scanner.mjs';
import { rewriteHookConfigForCopilot } from '../../lib/providers/copilot/hook-config-rewriter.mjs';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PLUGIN_VERSION = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8')).version;
const SCHEMA_VERSION = 1;

export function getCopilotHome() {
  return process.env.COPILOT_HOME || join(homedir(), '.copilot');
}

export const CopilotAdapter = {
  name: 'copilot',
  pluginRoot: PLUGIN_ROOT,
  version: PLUGIN_VERSION,
  detect() { /* env || .github/copilot-instructions.md || getCopilotHome() exists */ },
  install({ projectRoot, dryRun = false, user = false }) { /* validate skills, scan symlinks, write user-scope first if user, copy skills, copy hook scripts to .github/hooks/scripts/, write rewritten hooks.json, write state record last */ },
  uninstall({ projectRoot, force = false }) { /* read state record, gate schemaVersion, re-validate each entry, lstatSync.isSymbolicLink check, path.relative containment, rmSync */ },
  status({ projectRoot }) { /* read state record if present, report shape */ },
  validateSkillNames,
  getCopilotHome,
};
```

- [ ] **Verify tests pass.**

- [ ] **Commit:**

```bash
git add providers/copilot/adapter.mjs tests/copilot-adapter.test.mjs
git commit -m "feat(copilot-provider): add CopilotAdapter install/uninstall/status

Spec: .context-index/specs/features/copilot-provider/copilot-adapter.spec.md
Plan-task: 4"
```

---

### Task 5: CLI install/uninstall/status integration [specialist: none]

**Charter capability:** CLI install integration
**Strategy:** unit
**Depends on:** Task 4
**Files:**
- Modify: `cli/index.mjs`

**Tests:** Covered by Task 4's end-to-end suite invoked via the CLI wrapper.

- [ ] **Read** `cli/index.mjs` to locate the existing install/uninstall/status dispatch tables (look for `claude-code`, `opencode`, `codex` adapter registration).

- [ ] **Implement:** import `CopilotAdapter` from `providers/copilot/adapter.mjs`; register under the existing adapter map keyed by `adapter.name`; ensure `--user`, `--dry-run`, `--force` flags are parsed from argv and forwarded to `install({ ... })` / `uninstall({ ... })` calls.

- [ ] **Verify manually:** `node cli/index.mjs install --target copilot --dry-run` inside a fixture git repo returns the documented `{ wouldWrite, ... }` shape.

- [ ] **Commit:**

```bash
git add cli/index.mjs
git commit -m "feat(copilot-provider): wire adev install/uninstall/status --target copilot

Spec: .context-index/specs/features/copilot-provider/copilot-adapter.spec.md
Plan-task: 5"
```

---

### Task 6: CLI charter revision [specialist: none]

**Charter capability:** CLI charter revision
**Strategy:** unit
**Depends on:** Task 5
**Files:**
- Modify: `.context-index/specs/features/cli/charter.md`

- [ ] **Update** the `install` command description to include `Copilot` in the provider list ("Claude Code, OpenCode, Codex, Cursor, Copilot"). Bump the charter's `revision:` frontmatter by 1.

- [ ] **Commit:**

```bash
git add .context-index/specs/features/cli/charter.md
git commit -m "docs(cli): add Copilot to install verb provider list

Spec: .context-index/specs/features/copilot-provider/copilot-adapter.spec.md
Plan-task: 6"
```

---

### Task 7: Uninstall-defense security tests [specialist: none]

**Charter capability:** CopilotAdapter uninstall (SEC-3 + SEC-9 mitigation)
**Strategy:** unit
**Depends on:** Task 4
**Files:**
- Create: `tests/copilot-adapter-uninstall-defense.test.mjs`

**Tests:** Tampered state record, symlinked state-record entry, schema-version drift, plugin-version drift warning-only.

- [ ] **Write failing tests:**

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { CopilotAdapter } from '../providers/copilot/adapter.mjs';

function makeInstalledRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-uninstall-defense-'));
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  CopilotAdapter.install({ projectRoot: dir, dryRun: false, user: false });
  return dir;
}

test('tampered state record listing ../etc/passwd rejected (SUSPICIOUS_STATE_ENTRY)', () => {
  const projectRoot = makeInstalledRepo();
  // Tamper: rewrite state record to list an escape path
  const state = { schemaVersion: 1, pluginVersion: '0.27.0', user: false,
    skills: ['../etc/passwd', '/Users/victim/.ssh'],
    hookConfig: 'hooks/hooks.json', hookScripts: [], installedAt: new Date().toISOString() };
  writeFileSync(path.join(projectRoot, '.github/.adev-copilot-install.json'), JSON.stringify(state));
  const result = CopilotAdapter.uninstall({ projectRoot });
  assert.ok(result.residual.some(r => r.includes('SUSPICIOUS_STATE_ENTRY')));
  // Critical: no path outside .github/ was touched
  assert.ok(existsSync('/etc/passwd'));
  rmSync(projectRoot, { recursive: true, force: true });
});

test('symlinked state-record entry rejected (SEC-9 / SUSPICIOUS_STATE_ENTRY symlink)', () => {
  const projectRoot = makeInstalledRepo();
  // Replace one skill dir with a symlink to a sibling target
  rmSync(path.join(projectRoot, '.github/skills/adev-init'), { recursive: true, force: true });
  symlinkSync('/tmp', path.join(projectRoot, '.github/skills/adev-init'));
  const result = CopilotAdapter.uninstall({ projectRoot });
  assert.ok(result.residual.some(r => r.includes('symlink') || r.includes('SUSPICIOUS_STATE_ENTRY')));
  // /tmp must still exist
  assert.ok(existsSync('/tmp'));
  rmSync(projectRoot, { recursive: true, force: true });
});

test('schemaVersion: 2 without --force rejected (STATE_RECORD_VERSION_INCOMPATIBLE)', () => {
  const projectRoot = makeInstalledRepo();
  const state = JSON.parse(readFileSync(path.join(projectRoot, '.github/.adev-copilot-install.json'), 'utf8'));
  state.schemaVersion = 2;
  writeFileSync(path.join(projectRoot, '.github/.adev-copilot-install.json'), JSON.stringify(state));
  assert.throws(() => CopilotAdapter.uninstall({ projectRoot, force: false }), /STATE_RECORD_VERSION_INCOMPATIBLE/);
  rmSync(projectRoot, { recursive: true, force: true });
});

test('schemaVersion: 2 with --force proceeds with warning', () => {
  const projectRoot = makeInstalledRepo();
  const state = JSON.parse(readFileSync(path.join(projectRoot, '.github/.adev-copilot-install.json'), 'utf8'));
  state.schemaVersion = 2;
  writeFileSync(path.join(projectRoot, '.github/.adev-copilot-install.json'), JSON.stringify(state));
  const result = CopilotAdapter.uninstall({ projectRoot, force: true });
  assert.equal(result.removed, true);
  rmSync(projectRoot, { recursive: true, force: true });
});

test('pluginVersion mismatch proceeds with warning, not failure', () => {
  const projectRoot = makeInstalledRepo();
  const state = JSON.parse(readFileSync(path.join(projectRoot, '.github/.adev-copilot-install.json'), 'utf8'));
  state.pluginVersion = '0.0.1-ancient';
  writeFileSync(path.join(projectRoot, '.github/.adev-copilot-install.json'), JSON.stringify(state));
  const result = CopilotAdapter.uninstall({ projectRoot, force: false });
  assert.equal(result.removed, true); // proceeds despite mismatch
  rmSync(projectRoot, { recursive: true, force: true });
});
```

- [ ] **Verify tests fail.**

- [ ] **Implement:** ensure adapter's `uninstall()` does (a) regex re-validation of every state-record entry, (b) `lstatSync(resolved).isSymbolicLink()` check before any `rmSync`, (c) `path.relative(<.github/skills/|.github/hooks/>, resolved)` containment check, (d) annotates `residual` with `SUSPICIOUS_STATE_ENTRY: <entry>` on rejection, (e) gates `schemaVersion` against `1` (others require `--force`), (f) warns-only on `pluginVersion` mismatch.

- [ ] **Verify tests pass.**

- [ ] **Commit:**

```bash
git add tests/copilot-adapter-uninstall-defense.test.mjs
git commit -m "test(copilot-provider): defend against state-record forgery + symlink uninstall

Closes SEC-3 (state-record forgery) and SEC-9 (symlink-rmSync defense gap).

Spec: .context-index/specs/features/copilot-provider/copilot-adapter.spec.md
Plan-task: 7"
```

---

### Task 8: Smoke-install procedure docs [specialist: none]

**Charter capability:** Smoke install verification
**Strategy:** unit
**Depends on:** Task 4, Task 5
**Files:**
- Create: `docs/smoke-install-copilot.md`

- [ ] **Implement:** ~300-word markdown procedure documenting: (a) prerequisites (Node.js, git, Copilot CLI), (b) install Copilot CLI (`npm install -g @github/copilot` per research §Q6), (c) clone fixture or use an existing repo, (d) `adev install --target copilot`, (e) launch `copilot` CLI inside the repo, (f) verify `/skills` lists adev skills, (g) verify `AGENTS.md` and `.github/copilot-instructions.md` discovery via `/context`. Reference the parent spec's Behavior §9 for the canonical checklist.

- [ ] **Commit:**

```bash
git add docs/smoke-install-copilot.md
git commit -m "docs(copilot-provider): add smoke-install verification procedure

Spec: .context-index/specs/features/copilot-provider/copilot-adapter.spec.md
Plan-task: 8"
```

---

### Task 9: Argument-convention README [specialist: none]

**Charter capability:** CLI install integration (developer docs)
**Strategy:** unit
**Depends on:** Task 4
**Files:**
- Create: `lib/providers/copilot/README.md`

- [ ] **Implement:** ~150-word README documenting the principled `opts.projectRoot + opts.user` divergence from peer adapters' `opts.scope`. Anchor on the rationale: Copilot is repo-scoped by design (`.github/` lives in the consuming project); Claude Code / OpenCode / Codex are user-scoped (their plugin homes live in `~/.<provider>/`). Future maintainers reading this can extend the convention deliberately rather than discovering it via grep.

- [ ] **Commit:**

```bash
git add lib/providers/copilot/README.md
git commit -m "docs(copilot-provider): explain opts.projectRoot+user divergence from peer adapters

Spec: .context-index/specs/features/copilot-provider/copilot-adapter.spec.md
Plan-task: 9"
```

---

## Quality Gates

After all tasks complete, `/adev:validate` verifies the constitution's quality gate suite. Results are recorded in `.validate.md`.

- Tests pass: `npm test`
- All acceptance criteria from `copilot-adapter.spec.md` satisfied (20 criteria)
- No new entries in `package.json:dependencies` or `:devDependencies`
- No constitutional violations introduced (pure ESM, Node built-ins only, no hardcoded `~/.claude/`)
- Hook scripts in `hooks/*.sh` unmodified (the adapter copies them; the protocol contract is preserved)
