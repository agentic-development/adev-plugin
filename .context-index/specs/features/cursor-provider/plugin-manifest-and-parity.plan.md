<!-- partial_schema: plan@1 -->

# Implementation Plan: Cursor Plugin Manifest and Three-Way Version Parity

> **Methodology:** adev
> **Charter:** .context-index/specs/features/cursor-provider/charter.md
> **Spec:** .context-index/specs/features/cursor-provider/plugin-manifest-and-parity.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-17)
> **Platform:** Node.js (built-ins only), JavaScript ESM, node:test

**Goal:** Ship a Cursor plugin manifest at `.cursor-plugin/plugin.json`, wire it into release-please's `extra-files`, and add a `node:test` contract that enforces three-way version parity across `package.json`, `.claude-plugin/plugin.json`, and `.cursor-plugin/plugin.json`.

**Architecture:** Three small, independent deliverables sit at the plugin root. The new manifest mirrors the field shape of `.claude-plugin/plugin.json` so the three identity files stay shape-equivalent for inspection. The `release-please-config.json` change is a one-line array extension per ADR-0008 (`extra-files`) so the automated Release PR bumps all three manifests in lockstep. The new `tests/version-parity.test.mjs` runs under the existing `npm test` quality gate and is the first programmatic enforcement of constitution Principle 5 (version parity), closing a gap that was previously only stated.

**Review notes addressed:** Reviewer suggestion CON-1 (consistency-analyzer) flagged that `category` and `keywords` appear in the spec's JSON shape block but not in the acceptance criteria's required-copy list. Resolution adopted in this plan: the manifest authoring task copies `description`, `author`, `homepage`, `repository`, `license`, `category`, AND `keywords` verbatim from `.claude-plugin/plugin.json`. This naturally satisfies both the spec's "all other fields SHOULD be copied verbatim" guidance and the reviewer's suggested completeness without changing acceptance criteria.

---

## File Structure

**Create:**
- `.cursor-plugin/plugin.json` — Cursor 2.5 plugin manifest; mirrors `.claude-plugin/plugin.json` field shape with locked `version`.
- `tests/version-parity.test.mjs` — `node:test` contract asserting three-way `version` equality and `release-please-config.json:extra-files` membership.

**Modify:**
- `release-please-config.json:11-13` — Append `.cursor-plugin/plugin.json` to the `packages["."].extra-files` array (alphabetical order: `.claude-plugin/plugin.json` then `.cursor-plugin/plugin.json`).

**Reference (read, do not modify):**
- `.claude-plugin/plugin.json` — Source-of-truth for `description`, `author`, `homepage`, `repository`, `license`, `category`, `keywords`. Copy verbatim.
- `package.json` — Source-of-truth for `version`. The three manifest `version` strings MUST equal `package.json:version`.
- `.context-index/adrs/0008-release-please-automation.md` — Decision behind the `extra-files` mechanism; this plan extends it from two manifests to three.
- `tests/cli-driver-pattern.test.mjs` — Example `node:test` style in this repo (ESM, built-ins only, no test framework).

## Context Packets

### Task 1 Context (Cursor manifest)
- Spec: `.context-index/specs/features/cursor-provider/plugin-manifest-and-parity.spec.md` (Structural Shape §1; Acceptance Criteria rows 1-5)
- Charter: `.context-index/specs/features/cursor-provider/charter.md` (capability: "Cursor plugin manifest", "Three-way version parity")
- Source-of-truth: `.claude-plugin/plugin.json` (full read — copy `description`, `author`, `homepage`, `repository`, `license`, `category`, `keywords` verbatim)
- Version source: `package.json` (read `version` only)
- Review: `.context-index/specs/features/cursor-provider/plugin-manifest-and-parity.review.md` (CON-1 suggestion addressed: include `category` and `keywords`)

### Task 2 Context (release-please-config.json update)
- Spec: `.context-index/specs/features/cursor-provider/plugin-manifest-and-parity.spec.md` (Structural Shape §2; Acceptance Criteria row 6)
- ADR: `.context-index/adrs/0008-release-please-automation.md` (decision: extra-files keeps `package.json` and manifests in lockstep — extending from one extra-file to two)
- Source file: `release-please-config.json` (full read; only modify the `extra-files` array under `packages["."]`)

### Task 3 Context (parity test)
- Spec: `.context-index/specs/features/cursor-provider/plugin-manifest-and-parity.spec.md` (Structural Shape §3; Acceptance Criteria rows 4, 6, 7, 8, 9)
- Charter invariant: `.context-index/specs/features/cursor-provider/charter.md` lines 69, 79-81 (three-way parity)
- Constitution: `.context-index/constitution.md` Principle 1 (Node built-ins only), Principle 3 (Pure ESM), Principle 5 (Version parity — this test is its first programmatic enforcement)
- Pattern reference: `tests/cli-driver-pattern.test.mjs` (idiomatic node:test + node:assert structure used elsewhere in this repo)
- Inputs at test time: `package.json`, `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`, `release-please-config.json`

## Parallelization

- Group A (sequential): Task 1 (create `.cursor-plugin/plugin.json`) — must precede Task 3 because the parity test reads this file.
- Group B (sequential): Task 2 (modify `release-please-config.json`) — must precede Task 3 because the parity test asserts both manifests are listed in `extra-files`.
- Group C (depends on A and B): Task 3 (`tests/version-parity.test.mjs`) — RED-phase fails because the new manifest does not exist; once Tasks 1 + 2 land, GREEN-phase passes under `npm test`.

Group A and Group B touch disjoint files (`.cursor-plugin/plugin.json` vs. `release-please-config.json`) and can run in parallel. Group C is sequential after both complete. In strict TDD ordering, Task 3 (the failing test) may also be authored first; in that case Tasks 1 and 2 each turn one assertion green and the final `npm test` after both lands fully passes.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Create `.cursor-plugin/plugin.json` | small | unit | — | 1 create, 0 modify |
| 2 | Add `.cursor-plugin/plugin.json` to release-please `extra-files` | small | unit | — | 0 create, 1 modify |
| 3 | Add `tests/version-parity.test.mjs` three-way parity contract | small | unit | Task 1, Task 2 | 1 create, 0 modify |

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

(Module-scoped heuristics for `cursor-provider` are not yet populated; the retrieved global heuristics relate to token measurement and skill output discipline and are not actionable for this implementation plan.)

## Task Structure

### Task 1: Create `.cursor-plugin/plugin.json` [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Mechanical copy of `.claude-plugin/plugin.json` field shape with a version pin; spec gives exact JSON, blast radius is one new file at the plugin root, no boundary crossings.

**Charter capability:** Cursor plugin manifest (must-have, v1)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `.cursor-plugin/plugin.json`
- Test: `tests/version-parity.test.mjs` (created in Task 3 — the assertions on this manifest live there)

**Tests:** `tests/version-parity.test.mjs` — created in Task 3. This task's correctness is verified end-to-end when Task 3 runs `npm test` against the produced file.

**Context to load:**
- `.claude-plugin/plugin.json` (full read; source-of-truth for non-version fields)
- `package.json` (read `version`)
- `.context-index/specs/features/cursor-provider/plugin-manifest-and-parity.spec.md` (Structural Shape §1)

- [ ] **Write failing test**

The failing test for this task is `tests/version-parity.test.mjs`, authored in Task 3. Authors may choose strict-TDD order (write Task 3 first, watch it fail, then implement Tasks 1 and 2). Either way, the assertion that fails when this task is skipped is in Task 3's test file:

```javascript
// from tests/version-parity.test.mjs (see Task 3)
assert.ok(fs.existsSync(cursorPluginPath), '.cursor-plugin/plugin.json must exist');
const cursorPlugin = JSON.parse(fs.readFileSync(cursorPluginPath, 'utf8'));
assert.strictEqual(cursorPlugin.name, 'adev');
assert.strictEqual(cursorPlugin.version, claudePlugin.version);
assert.strictEqual(cursorPlugin.version, pkg.version);
```

- [ ] **Verify test fails**

Run: `node --test tests/version-parity.test.mjs`
Expected: FAIL — `.cursor-plugin/plugin.json must exist` (file missing).

- [ ] **Implement**

Create `.cursor-plugin/plugin.json` by copying the field set from `.claude-plugin/plugin.json` verbatim, with `version` matching `package.json:version` at this moment (currently `0.26.0`). Address reviewer CON-1 by including `category` and `keywords` even though the acceptance-criteria's required-copy list does not enumerate them — the spec's structural shape block lists them and copying matches the source manifest verbatim.

```json
{
  "name": "adev",
  "version": "0.26.0",
  "description": "Agentic Development Framework — full lifecycle methodology for AI-assisted software delivery. Context engineering, charter-native specs, constitution gating, architecture review, specialist routing, and Claude Code/OpenCode/OpenAI Codex provider support.",
  "author": {
    "name": "Agentic Development",
    "url": "https://agentic-dev.org"
  },
  "homepage": "https://agentic-dev.org",
  "repository": "https://github.com/agentic-development/adev-plugin",
  "license": "MIT",
  "category": "development",
  "keywords": [
    "agentic-development",
    "context-engineering",
    "spec-driven",
    "constitution",
    "charter",
    "architecture-review",
    "live-specs",
    "adrs",
    "code-context",
    "methodology",
    "governance",
    "context-packets",
    "task-routing",
    "agent-recovery",
    "golden-samples",
    "eval-harness"
  ]
}
```

Important: the `version` value MUST be read from `package.json` at authoring time, NOT hardcoded blindly. If `package.json:version` has moved since this plan was written, use the current value to keep the three-way parity invariant green.

- [ ] **Verify test passes**

Run: `node --test tests/version-parity.test.mjs` (after Task 3's test file exists)
Expected: PASS for the existence and name/version assertions on `.cursor-plugin/plugin.json`; PASS for the equality assertions against `.claude-plugin/plugin.json` and `package.json`.

- [ ] **Commit**

Branch (if not already created): `feat/cursor-provider/cursor-plugin-manifest`

```bash
git add .cursor-plugin/plugin.json
git commit -m "feat(cursor-provider): add .cursor-plugin/plugin.json (three-way identity manifest)

Spec: .context-index/specs/features/cursor-provider/plugin-manifest-and-parity.spec.md
Plan-task: 1"
```

---

### Task 2: Add `.cursor-plugin/plugin.json` to release-please `extra-files` [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** One-line array append into `release-please-config.json` with explicit diff in the spec; existing `.claude-plugin/plugin.json` entry provides direct precedent in the same array.

**Charter capability:** Release-please extra-files update (must-have, v1)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `release-please-config.json:11-13` — append `".cursor-plugin/plugin.json"` to the `extra-files` array under `packages["."]`
- Test: `tests/version-parity.test.mjs` (assertion 5 — extra-files membership)

**Tests:** `tests/version-parity.test.mjs` — created in Task 3. The assertion below fails until this modification is made.

**Context to load:**
- `.context-index/adrs/0008-release-please-automation.md` (decision rationale)
- `release-please-config.json` (full read)
- `.context-index/specs/features/cursor-provider/plugin-manifest-and-parity.spec.md` (Structural Shape §2)

- [ ] **Write failing test**

The failing assertion lives in `tests/version-parity.test.mjs` (Task 3):

```javascript
const config = JSON.parse(fs.readFileSync('release-please-config.json', 'utf8'));
const extraFiles = config.packages['.']['extra-files'];
assert.ok(extraFiles.includes('.claude-plugin/plugin.json'),
  'release-please-config.json must list .claude-plugin/plugin.json under extra-files');
assert.ok(extraFiles.includes('.cursor-plugin/plugin.json'),
  'release-please-config.json must list .cursor-plugin/plugin.json under extra-files');
```

- [ ] **Verify test fails**

Run: `node --test tests/version-parity.test.mjs`
Expected: FAIL — `release-please-config.json must list .cursor-plugin/plugin.json under extra-files`.

- [ ] **Implement**

Edit `release-please-config.json` and append the new manifest to the `extra-files` array. Alphabetical order keeps diffs stable across future provider additions (per spec note).

Diff:

```json
"extra-files": [
  ".claude-plugin/plugin.json",
  ".cursor-plugin/plugin.json"
]
```

- [ ] **Verify test passes**

Run: `node --test tests/version-parity.test.mjs`
Expected: PASS — both extra-files membership assertions hold.

- [ ] **Commit**

Branch (if not already created): `feat/cursor-provider/cursor-plugin-manifest`

```bash
git add release-please-config.json
git commit -m "chore(cursor-provider): add .cursor-plugin/plugin.json to release-please extra-files

Per ADR-0008, every manifest tracking the package version must appear in
extra-files so the automated Release PR bumps all three in lockstep.
Extends the two-file lockstep (package.json + .claude-plugin/plugin.json)
to three.

Spec: .context-index/specs/features/cursor-provider/plugin-manifest-and-parity.spec.md
Plan-task: 2"
```

---

### Task 3: Add `tests/version-parity.test.mjs` three-way parity contract [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Plan ships a full node:test scaffold matching the repo's existing `tests/cli-driver-pattern.test.mjs` style; uses only built-ins, lives in `tests/`, touches no production code.

**Depends on:** Task 1, Task 2 (test will fully pass only after both land; in strict-TDD ordering this task may be authored first and run RED until 1 and 2 close)

**Charter capability:** Three-way version parity (must-have, v1)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/version-parity.test.mjs`
- Reads (test inputs, never modified): `package.json`, `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`, `release-please-config.json`

**Tests:** `tests/version-parity.test.mjs` — this task creates the file. The test IS the deliverable; verification is running it under `node --test` and `npm test`.

**Context to load:**
- `.context-index/specs/features/cursor-provider/plugin-manifest-and-parity.spec.md` (Structural Shape §3; Acceptance Criteria rows 4, 6, 7, 8, 9)
- `.context-index/constitution.md` (Principle 1: Node built-ins only; Principle 3: Pure ESM; Principle 5: Version parity)
- `tests/cli-driver-pattern.test.mjs` (reference pattern for `node:test` + `node:assert` in this repo)

- [ ] **Write failing test**

Create `tests/version-parity.test.mjs` using only `node:test`, `node:assert/strict`, and `node:fs`. ESM, `.mjs` extension. No external dependencies.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const pkgPath = path.join(repoRoot, 'package.json');
const claudeManifestPath = path.join(repoRoot, '.claude-plugin', 'plugin.json');
const cursorManifestPath = path.join(repoRoot, '.cursor-plugin', 'plugin.json');
const releaseConfigPath = path.join(repoRoot, 'release-please-config.json');

function readJson(p, label) {
  assert.ok(fs.existsSync(p), `${label} must exist at ${p}`);
  const raw = fs.readFileSync(p, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    assert.fail(`${label} must be parseable JSON: ${err.message}`);
  }
  return parsed;
}

test('version-parity: all three manifests exist and parse as JSON', () => {
  readJson(pkgPath, 'package.json');
  readJson(claudeManifestPath, '.claude-plugin/plugin.json');
  readJson(cursorManifestPath, '.cursor-plugin/plugin.json');
});

test('version-parity: every manifest has a version field', () => {
  const pkg = readJson(pkgPath, 'package.json');
  const claude = readJson(claudeManifestPath, '.claude-plugin/plugin.json');
  const cursor = readJson(cursorManifestPath, '.cursor-plugin/plugin.json');
  assert.ok(typeof pkg.version === 'string' && pkg.version.length > 0,
    'package.json must declare a non-empty version string');
  assert.ok(typeof claude.version === 'string' && claude.version.length > 0,
    '.claude-plugin/plugin.json must declare a non-empty version string');
  assert.ok(typeof cursor.version === 'string' && cursor.version.length > 0,
    '.cursor-plugin/plugin.json must declare a non-empty version string');
});

test('version-parity: package.json, .claude-plugin/plugin.json, and .cursor-plugin/plugin.json have strictly equal version fields', () => {
  const pkg = readJson(pkgPath, 'package.json');
  const claude = readJson(claudeManifestPath, '.claude-plugin/plugin.json');
  const cursor = readJson(cursorManifestPath, '.cursor-plugin/plugin.json');
  assert.strictEqual(claude.version, pkg.version,
    `.claude-plugin/plugin.json version (${claude.version}) must equal package.json version (${pkg.version})`);
  assert.strictEqual(cursor.version, pkg.version,
    `.cursor-plugin/plugin.json version (${cursor.version}) must equal package.json version (${pkg.version})`);
  assert.strictEqual(cursor.version, claude.version,
    `.cursor-plugin/plugin.json version (${cursor.version}) must equal .claude-plugin/plugin.json version (${claude.version})`);
});

test('version-parity: .cursor-plugin/plugin.json:name === "adev"', () => {
  const cursor = readJson(cursorManifestPath, '.cursor-plugin/plugin.json');
  assert.strictEqual(cursor.name, 'adev',
    '.cursor-plugin/plugin.json:name must be "adev"');
});

test('version-parity: release-please-config.json extra-files lists both .claude-plugin and .cursor-plugin manifests', () => {
  const config = readJson(releaseConfigPath, 'release-please-config.json');
  const extraFiles = config?.packages?.['.']?.['extra-files'];
  assert.ok(Array.isArray(extraFiles),
    'release-please-config.json:packages["."].extra-files must be an array');
  assert.ok(extraFiles.includes('.claude-plugin/plugin.json'),
    'release-please-config.json:extra-files must include .claude-plugin/plugin.json');
  assert.ok(extraFiles.includes('.cursor-plugin/plugin.json'),
    'release-please-config.json:extra-files must include .cursor-plugin/plugin.json');
});
```

- [ ] **Verify test fails**

Run: `node --test tests/version-parity.test.mjs`
Expected: FAIL — at least one of the new assertions fails when run before Tasks 1 and 2 complete (`.cursor-plugin/plugin.json must exist` and `release-please-config.json:extra-files must include .cursor-plugin/plugin.json`).

- [ ] **Implement**

The test file itself IS the implementation. No production source change is added by this task — the assertion bodies above are the deliverable. Make sure to use:
- `import { test } from 'node:test'` (not `describe`/`it` block syntax — matches `tests/cli-driver-pattern.test.mjs` style)
- `import assert from 'node:assert/strict'`
- Only `node:fs` and `node:path` for filesystem reads
- ESM `import.meta.dirname` for `repoRoot` resolution (Node 20+)

If the surrounding repo prefers `describe`/`it`, mirror whichever convention dominates `tests/*.test.mjs`. Either is acceptable; consistency with existing tests is the deciding factor.

- [ ] **Verify test passes**

Run: `node --test tests/version-parity.test.mjs` and `npm test`
Expected: PASS for all five assertions. `npm test` exits 0.

- [ ] **Commit**

Branch (if not already created): `feat/cursor-provider/cursor-plugin-manifest`

```bash
git add tests/version-parity.test.mjs
git commit -m "test(cursor-provider): add three-way version-parity contract

First programmatic enforcement of constitution Principle 5 (version
parity), extended from the existing two-file invariant to include
.cursor-plugin/plugin.json. Uses only node:test, node:assert/strict,
and node:fs — zero new dependencies.

Spec: .context-index/specs/features/cursor-provider/plugin-manifest-and-parity.spec.md
Plan-task: 3"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All five acceptance criteria from Spec §3 assertions hold
- No new external dependencies introduced (Principle 1)
- All new code is pure ESM `.mjs` (Principle 3)
- Three-way version parity invariant holds at HEAD (Principle 5, now programmatically enforced)
- No changes to hook protocol, CLI installation path structure, or plugin registration format (Autonomous lane)
