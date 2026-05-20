<!-- DO NOT EDIT statuses inline — see lifecycle log copilot-sync-output.jsonl -->

# Implementation Plan: Copilot Sync-Target Output

> **Methodology:** adev
> **Charter:** .context-index/specs/features/copilot-provider/charter.md (rev 6, approved)
> **Spec:** .context-index/specs/features/copilot-provider/copilot-sync-output.spec.md (rev 2)
> **Review:** PASS_WITH_NOTES → PASS-equivalent (2026-05-19, rev 2; 2 minor wording warnings fixed inline)
> **Platform:** Node.js (ESM, `.mjs`), node:test, npm, no new external deps

**Goal:** Add `format: copilot` as a recognized sync target so `/adev:sync` writes `.github/copilot-instructions.md` (≤ 4,000 UTF-8 bytes constitution projection with SHA-256 tamper-evidence pointer + dangerous-pattern guardrail) and one `.github/instructions/<module>.instructions.md` per registered module that has a charter (each carrying a validated `applyTo` glob list as a YAML double-quoted scalar).

**Architecture:** One new ESM module at `lib/sync/copilot.mjs` exporting three functions: `renderCopilotInstructions(constitutionText)` (pure — projects + applies SHA-256 pointer + overflow drop-tail-first with in-file marker + dangerous-pattern scan), `renderModuleInstruction(module, charterText)` (pure — emits YAML double-quoted `applyTo` scalar + Business Intent / In-Scope body), `syncCopilot({ projectRoot, manifest, constitutionText, charters, dryRun })` (dispatcher — runs slug/path/size validation, calls renderers, writes via `<path>.tmp` + `fs.fsyncSync` + `renameSync` for crash-consistency, uses `path.relative(projectRoot, resolved)` containment check). One line added to the existing sync dispatcher in `cli/index.mjs` (or `lib/sync/index.mjs` if extracted) to route `format: copilot` entries through `syncCopilot`. The `setup` charter is bumped to document `copilot` as a recognized sync-target format. The constitution's Context Routing table receives one new row for `lib/sync/` as a non-blocking hygiene update.

**Boundary:** This plan does NOT touch the `CopilotAdapter` (sibling `copilot-adapter` plan). The adapter is a read-only observer of sync-output files in its `status` return; it never writes them. Conversely, `/adev:sync` never touches `.github/skills/`, `.github/hooks/`, or `.github/.adev-copilot-install.json`.

**Review notes carried forward (non-blocking informational):**
- **N-1** (security informational): 16-hex-prefix SHA-256 truncation is collision-resistant against accidental drift but not cryptographically binding against a motivated adversary. Acceptable for the "tamper-evidence" claim.
- **N-2** (security informational): Dangerous-pattern regex `\b` boundaries work for the v1 token set; revisit if future patterns lack word boundaries.

---

## File Structure

**Create:**
- `lib/sync/copilot.mjs` — `renderCopilotInstructions`, `renderModuleInstruction`, `syncCopilot`.
- `tests/sync-copilot.test.mjs` — end-to-end sync tests + every error path.
- `tests/sync-copilot-fixtures/` — fixture constitutions (≤ 4000 byte, just-over, untruncatable, multi-byte, dangerous-pattern with and without opt-out) and fixture manifests/charters for module-level tests.

**Modify:**
- `cli/index.mjs` (or `lib/sync/index.mjs` if extracted) — route `format: copilot` entries through `syncCopilot`. Inspect the existing `claude` / `agents` / `cursor` dispatch points to find the right insertion site.
- `.context-index/specs/features/setup/charter.md` — document `copilot` as a recognized sync-target format. Bump charter revision.
- `.context-index/constitution.md` — add `Sync helpers — lib/sync/` row to the Context Routing table (non-blocking hygiene; same advisory pattern as copilot-hook-generator's SA-5 for `lib/providers/copilot/`).
- Sync summary renderer (wherever it lives; likely `cli/index.mjs` or `lib/sync/summary.mjs`) — add a `copilot:` block mirroring the existing `claude:` / `cursor:` block format.

**Reference (read, do not modify):**
- `.context-index/manifest.yaml` — `sync.targets` and `modules[]` schema reference.
- `.context-index/constitution.md` — projection source.
- `.context-index/specs/features/*/charter.md` — per-module Business Intent + In-Scope source (read at sync time, one per registered module).
- `.context-index/specs/features/copilot-provider/copilot-sync-output.spec.md` — authoritative spec.
- `.context-index/research/github-copilot-extensibility-2026-05-19.md` Q1 — `applyTo` frontmatter schema reference.

---

## Context Packets

### Task 1 Context (renderCopilotInstructions)
- Spec: `copilot-sync-output.spec.md` Behaviors §2 + §3 (dangerous-pattern guardrail) + Source-of-Truth Map (Identity never droppable) + Note on Units paragraph
- Source: `.context-index/constitution.md` (full read — projection source)
- Research: Q1 (Copilot instruction file shape — plain markdown, no frontmatter for repo-wide)
- Test helpers: `tests/helpers.mjs`

### Task 2 Context (renderModuleInstruction)
- Spec: `copilot-sync-output.spec.md` Behaviors §4 + Preconditions (slug and path regex validation)
- Research: Q1 `.instructions.md` frontmatter schema (`applyTo`, optional `excludeAgent`, `description`)
- Source files: `.context-index/specs/features/*/charter.md` (signatures + Business Intent + In-Scope sections — for fixture authoring)

### Task 3 Context (syncCopilot dispatcher)
- Spec: `copilot-sync-output.spec.md` Preconditions (input caps), Behaviors §1/§7/§9, Postconditions, Error Cases (all rows)
- Sibling files (Tasks 1, 2 outputs): `lib/sync/copilot.mjs` renderers
- Source files: `.context-index/manifest.yaml`, `.context-index/constitution.md`, all `*/charter.md` files (loaded at sync time)

### Task 4 Context (CLI/dispatcher wiring)
- Source file: `cli/index.mjs` (existing sync dispatch — full read to find the right insertion site)
- Sibling format slots: how `claude` / `agents` / `cursor` are currently registered

### Task 5 Context (setup charter)
- `.context-index/specs/features/setup/charter.md` (existing sync-target format list)

### Task 6 Context (constitution Context Routing)
- `.context-index/constitution.md` (Context Routing table section)

### Task 7 Context (sync summary renderer)
- Existing summary renderer (find it via grep for `claude:` or `cursor:` block emission)

### Task 8 Context (full sync end-to-end test)
- All preceding task outputs
- Test helpers + fixture infrastructure from Tasks 1, 2

---

## Parallelization

- Group A (parallel): Task 1 (renderCopilotInstructions) || Task 2 (renderModuleInstruction) — independent renderers
- Group B (depends on Group A): Task 3 (syncCopilot dispatcher) — orchestrates both renderers
- Group C (depends on Group B): Task 4 (CLI wiring) || Task 5 (setup charter) || Task 7 (sync summary renderer) — independent integrations
- Group D (parallel, no code deps): Task 6 (constitution Context Routing) — markdown-only hygiene
- Group E (depends on Groups B + C): Task 8 (end-to-end test) — exercises the full pipeline

Bias: Group A in parallel, Task 3, then C/D/E.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | renderCopilotInstructions | large | unit | — | 1 create, 1 test |
| 2 | renderModuleInstruction | medium | unit | — | 1 create, 1 test |
| 3 | syncCopilot dispatcher | large | unit | 1, 2 | 1 create, 1 test |
| 4 | CLI / dispatcher wiring | small | unit | 3 | 1 modify |
| 5 | Setup charter revision | small | unit | 4 | 1 modify |
| 6 | Constitution Context Routing | small | unit | — | 1 modify |
| 7 | Sync summary renderer | small | unit | 4 | 1 modify |
| 8 | End-to-end sync test | medium | unit | 3, 4, 7 | 1 create |

---

## Task Structure

### Task 1: renderCopilotInstructions [specialist: none]

**Charter capability:** `.github/copilot-instructions.md` sync output
**Strategy:** unit
**Files:**
- Create: `lib/sync/copilot.mjs` (export `renderCopilotInstructions`, scaffold of other exports)
- Test: `tests/sync-copilot-render-instructions.test.mjs`
- Fixtures: `tests/sync-copilot-fixtures/constitution-*.md` (5 fixtures: happy-path, just-over-4000, untruncatable, multi-byte emoji, dangerous-pattern with and without opt-out)

**Tests:** Happy-path ≤ 4000 bytes, overflow drop-tail-first + in-file marker, untruncatable Identity throws CONSTITUTION_TOO_LARGE, multi-byte byte-count enforced, each dangerous pattern throws CONSTITUTION_DANGEROUS_PATTERN without opt-out, opt-out marker suppresses the throw, SHA-256 16-hex pointer appended.

- [ ] **Write failing tests:**

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { renderCopilotInstructions } from '../lib/sync/copilot.mjs';

const fix = (name) => readFileSync(new URL(`./sync-copilot-fixtures/${name}`, import.meta.url), 'utf8');

test('happy-path constitution renders ≤ 4000 UTF-8 bytes', () => {
  const c = fix('constitution-small.md');
  const out = renderCopilotInstructions(c);
  assert.ok(Buffer.byteLength(out, 'utf8') <= 4000);
});

test('SHA-256 pointer appended with 16-hex prefix', () => {
  const c = fix('constitution-small.md');
  const expected = createHash('sha256').update(c).digest('hex').slice(0, 16);
  const out = renderCopilotInstructions(c);
  assert.ok(out.includes(`@ sha256:${expected}`));
});

test('overflow drops principles tail-first with in-file marker', () => {
  const c = fix('constitution-just-over.md');
  const result = renderCopilotInstructions(c);
  assert.ok(Buffer.byteLength(result.body, 'utf8') <= 4000);
  assert.ok(result.body.includes('SYNC_OVERFLOW: principles'));
  assert.ok(result.droppedPrinciples.length > 0);
});

test('untruncatable Identity throws CONSTITUTION_TOO_LARGE', () => {
  const c = fix('constitution-identity-too-large.md');
  assert.throws(() => renderCopilotInstructions(c), /CONSTITUTION_TOO_LARGE/);
});

test('multi-byte character counted in bytes, not chars', () => {
  // Fixture has Identity = 3990 ASCII bytes + a 4-byte emoji that pushes byteLength over 4000
  // The renderer should drop principles to fit, not silently include all content.
  const c = fix('constitution-multi-byte.md');
  const result = renderCopilotInstructions(c);
  assert.ok(Buffer.byteLength(typeof result === 'string' ? result : result.body, 'utf8') <= 4000);
});

test('dangerous pattern rm -rf throws CONSTITUTION_DANGEROUS_PATTERN', () => {
  const c = fix('constitution-dangerous-rm-rf.md');
  assert.throws(() => renderCopilotInstructions(c), /CONSTITUTION_DANGEROUS_PATTERN/);
});

test('dangerous pattern with allow-projection: true marker suppresses throw', () => {
  const c = fix('constitution-dangerous-rm-rf-allowed.md');
  assert.doesNotThrow(() => renderCopilotInstructions(c));
});
```

- [ ] **Verify tests fail.**

- [ ] **Implement:**
  - Parse `## Identity` and `## Non-Negotiable Principles` sections from constitution markdown using simple line-scanning (no full markdown parser needed).
  - Scan body for `/\b(rm\s+-rf|--no-verify|--force\s+push|chmod\s+777|disable\s+confirmation)\b/i` matches; for each match, check the matched line OR the preceding line for `<!-- allow-projection: true -->`; if no opt-out, throw `CONSTITUTION_DANGEROUS_PATTERN: <line>:<snippet>`.
  - Assemble projection: Identity section + Non-Negotiable Principles section + SHA-256 pointer comment.
  - Check `Buffer.byteLength(content, 'utf8')`: if ≤ 4000, return. If Identity alone > 4000, throw `CONSTITUTION_TOO_LARGE`. Else drop the last principle, prepend an in-file `<!-- SYNC_OVERFLOW: principles <names> dropped to fit 4,000-byte cap. -->` marker after Identity, recompute; iterate until fits.
  - Compute SHA-256 of source constitution; embed first 16 hex chars in trailing comment.

- [ ] **Verify tests pass.**

- [ ] **Commit:**

```bash
git add lib/sync/copilot.mjs tests/sync-copilot-render-instructions.test.mjs tests/sync-copilot-fixtures/
git commit -m "feat(copilot-provider): add renderCopilotInstructions with SHA-256 tamper-evidence + overflow + dangerous-pattern guardrail

Closes SEC-5 (constitution trust boundary), SA-1 (in-file SYNC_OVERFLOW marker),
CON-1 (UTF-8 byte cap), CON-10 (Identity never dropped).

Spec: .context-index/specs/features/copilot-provider/copilot-sync-output.spec.md
Plan-task: 1"
```

---

### Task 2: renderModuleInstruction [specialist: none]

**Charter capability:** `.github/instructions/<module>.instructions.md` sync output
**Strategy:** unit
**Files:**
- Modify: `lib/sync/copilot.mjs` (add `renderModuleInstruction` export)
- Create: `tests/sync-copilot-render-module.test.mjs`

**Tests:** Slug regex enforcement, path regex enforcement (rejects newlines + `---`), `applyTo` emitted as YAML double-quoted scalar, empty-paths fallback to `**`.

- [ ] **Write failing tests:**

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderModuleInstruction } from '../lib/sync/copilot.mjs';

test('valid module emits double-quoted applyTo scalar', () => {
  const module = { slug: 'cli', name: 'CLI', paths: ['cli/', 'lib/cli/'] };
  const charter = '## Business Intent\n\nCLI module.\n\n## Scope\n\n### In Scope\n\n- foo\n- bar\n';
  const out = renderModuleInstruction(module, charter);
  assert.match(out, /^applyTo: "cli\/,lib\/cli\/"$/m);
  assert.ok(out.includes('CLI module.'));
  assert.ok(out.includes('- foo'));
});

test('empty paths fall back to "**" with SYNC_PATHS_EMPTY warning', () => {
  const module = { slug: 'cli', name: 'CLI', paths: [] };
  const charter = '## Business Intent\n\nX.\n\n## Scope\n\n### In Scope\n\n- a\n';
  const result = renderModuleInstruction(module, charter);
  assert.match(result.body, /^applyTo: "\*\*"$/m);
  assert.ok(result.warnings.some(w => w.startsWith('SYNC_PATHS_EMPTY:')));
});

test('uppercase slug rejected with INVALID_MODULE_SLUG', () => {
  const module = { slug: 'FooBar', name: 'X', paths: ['src/'] };
  const charter = '## Business Intent\n\nX.\n';
  assert.throws(() => renderModuleInstruction(module, charter), /INVALID_MODULE_SLUG: FooBar/);
});

test('newline in paths rejected with INVALID_MODULE_PATH', () => {
  const module = { slug: 'x', name: 'X', paths: ['src/\n---\ninjection: true'] };
  const charter = '## Business Intent\n\nX.\n';
  assert.throws(() => renderModuleInstruction(module, charter), /INVALID_MODULE_PATH/);
});

test('--- substring in paths rejected', () => {
  const module = { slug: 'x', name: 'X', paths: ['src/---/foo'] };
  const charter = '## Business Intent\n\nX.\n';
  assert.throws(() => renderModuleInstruction(module, charter), /INVALID_MODULE_PATH/);
});

test('missing Business Intent emits CHARTER_INCOMPLETE warning, returns null body', () => {
  const module = { slug: 'x', name: 'X', paths: ['src/'] };
  const charter = '## Scope\n\n### In Scope\n\n- a\n';
  const result = renderModuleInstruction(module, charter);
  assert.equal(result.body, null);
  assert.ok(result.warnings.some(w => w.startsWith('CHARTER_INCOMPLETE:')));
});
```

- [ ] **Verify tests fail.**

- [ ] **Implement:**
  - Validate `slug` against `^[a-z0-9-]{1,64}$` after NFC normalization; throw `INVALID_MODULE_SLUG: <slug>` on failure.
  - Validate each `paths[]` entry against `^[A-Za-z0-9_\-./*?\[\]{}!,]+$` AND assert no `\n` or `---` substrings; throw `INVALID_MODULE_PATH: <module>: <path>`.
  - Empty paths → `applyTo: "**"` + `SYNC_PATHS_EMPTY: <slug>` warning.
  - Parse charter for `## Business Intent` and `### In Scope` sections; if either missing → `CHARTER_INCOMPLETE: <slug>` warning, return `{ body: null, warnings }`.
  - Otherwise assemble YAML frontmatter with double-quoted `applyTo` (escape any embedded `"` or `\` per YAML rules — though the regex allow-list should already preclude them) + description + body. Return `{ body, warnings }`.

- [ ] **Verify tests pass.**

- [ ] **Commit:**

```bash
git add lib/sync/copilot.mjs tests/sync-copilot-render-module.test.mjs
git commit -m "feat(copilot-provider): add renderModuleInstruction with slug/path validation + YAML escaping

Closes SEC-1 (module slug validation), SEC-2 (applyTo path injection).

Spec: .context-index/specs/features/copilot-provider/copilot-sync-output.spec.md
Plan-task: 2"
```

---

### Task 3: syncCopilot dispatcher [specialist: none]

**Charter capability:** Both sync outputs (orchestration)
**Strategy:** unit
**Depends on:** Task 1, Task 2
**Files:**
- Modify: `lib/sync/copilot.mjs` (add `syncCopilot` export)
- Create: `tests/sync-copilot-dispatcher.test.mjs`

**Tests:** Input-cap rejection (manifest, constitution, charter, modules count, paths-per-module), dry-run writes nothing, path-confinement check fires, tmp+rename crash-consistency, no-absolute-paths string-scan on emitted files, MODULE_NO_CHARTER non-fatal skip.

- [ ] **Write failing tests:** assert each documented error code; assert dry-run returns `{ wouldWrite, warnings, errors }`; assert real run writes `.github/copilot-instructions.md.tmp` then renames; assert emitted content has no `/Users/`, `/home/`, `C:\\` substrings.

- [ ] **Implement:**
  - Cap checks: `Buffer.byteLength(constitutionText, 'utf8') <= 256 * 1024`, `manifest.modules.length <= 256`, each `paths.length <= 64`, each `charterText.length <= 256 * 1024`.
  - For each module with `format: copilot` in sync.targets: render via Task 2, write via tmp+rename.
  - Render constitution via Task 1, write via tmp+rename.
  - Path-confinement: `path.relative(projectRoot, resolved)` must not start with `..`, must not be absolute, must not be empty.
  - Return `{ artifacts, warnings, errors }`.

- [ ] **Verify tests pass.**

- [ ] **Commit:**

```bash
git add lib/sync/copilot.mjs tests/sync-copilot-dispatcher.test.mjs
git commit -m "feat(copilot-provider): add syncCopilot dispatcher with input caps + path-confinement + atomic write

Closes SEC-3 (input caps), SEC-6 (partial-write recovery), SEC-7 (path-confinement portability).

Spec: .context-index/specs/features/copilot-provider/copilot-sync-output.spec.md
Plan-task: 3"
```

---

### Task 4: CLI / dispatcher wiring [specialist: none]

**Charter capability:** Sync-target format slot
**Strategy:** unit
**Depends on:** Task 3
**Files:**
- Modify: `cli/index.mjs` (or wherever the existing sync dispatcher lives — `claude` / `agents` / `cursor` slots are the reference points)

- [ ] **Read** the existing sync dispatch logic to find the right insertion site.

- [ ] **Implement:** import `syncCopilot` from `lib/sync/copilot.mjs`; add a `case 'copilot':` branch in the format switch that calls `syncCopilot(...)` with the same arguments shape as the sibling slots.

- [ ] **Verify manually:** `node cli/index.mjs sync --dry-run` against a fixture project with `format: copilot` in `sync.targets` returns the documented dry-run shape.

- [ ] **Commit:**

```bash
git add cli/index.mjs
git commit -m "feat(copilot-provider): wire format: copilot into /adev:sync dispatcher

Spec: .context-index/specs/features/copilot-provider/copilot-sync-output.spec.md
Plan-task: 4"
```

---

### Task 5: Setup charter revision [specialist: none]

**Charter capability:** Sync-target format slot (documentation)
**Strategy:** unit
**Depends on:** Task 4
**Files:**
- Modify: `.context-index/specs/features/setup/charter.md`

- [ ] **Update** the setup charter's sync-target format list to include `copilot` alongside `claude`, `agents`, `cursor`. Bump the charter's `revision:` frontmatter.

- [ ] **Commit:**

```bash
git add .context-index/specs/features/setup/charter.md
git commit -m "docs(setup): document copilot as a recognized sync-target format

Spec: .context-index/specs/features/copilot-provider/copilot-sync-output.spec.md
Plan-task: 5"
```

---

### Task 6: Constitution Context Routing [specialist: none]

**Charter capability:** Hygiene (non-blocking advisory from review)
**Strategy:** unit
**Files:**
- Modify: `.context-index/constitution.md`

> **NOTE:** Editing the constitution requires careful review per its own Architecture Boundaries. This task adds **only** a Context Routing row — internal documentation that is autonomous per the constitution's "Updating internal documentation" allowance. If the project owner prefers to gate this behind a separate human-review PR, split this task into a follow-up and skip it here.

- [ ] **Add a row** to the Context Routing table:
  ```
  | Sync helpers | `lib/sync/` |
  ```

- [ ] **Run** `npx adev sync` (or the equivalent) to propagate constitution changes to `CLAUDE.md` if applicable.

- [ ] **Commit:**

```bash
git add .context-index/constitution.md CLAUDE.md
git commit -m "docs(constitution): add lib/sync/ to Context Routing table

Spec: .context-index/specs/features/copilot-provider/copilot-sync-output.spec.md
Plan-task: 6"
```

---

### Task 7: Sync summary renderer [specialist: none]

**Charter capability:** Sync-summary output (Behavior §10)
**Strategy:** unit
**Depends on:** Task 4
**Files:**
- Modify: existing summary renderer (find via `grep -rn '"claude:"' cli/ lib/` or similar)

- [ ] **Locate** the existing `claude:` / `cursor:` block emission code.

- [ ] **Implement:** add a parallel `copilot:` block listing every artifact written (paths + byte counts) and every warning emitted (`SYNC_OVERFLOW`, `MODULE_NO_CHARTER`, `SYNC_PATHS_EMPTY`, `CHARTER_INCOMPLETE`).

- [ ] **Verify** by running `node cli/index.mjs sync` against a fixture project and confirming the `copilot:` block appears.

- [ ] **Commit:**

```bash
git add cli/index.mjs   # or wherever the renderer lives
git commit -m "feat(copilot-provider): emit copilot: block in sync summary

Spec: .context-index/specs/features/copilot-provider/copilot-sync-output.spec.md
Plan-task: 7"
```

---

### Task 8: End-to-end sync test [specialist: none]

**Charter capability:** Both sync outputs (integration)
**Strategy:** unit
**Depends on:** Task 3, Task 4, Task 7
**Files:**
- Create: `tests/sync-copilot.test.mjs`

**Tests:** Full sync run against a fixture project containing manifest with `format: copilot`, constitution, and several module charters. Assertions: `.github/copilot-instructions.md` written with valid SHA-256 pointer; per-module `.github/instructions/*.instructions.md` written with double-quoted `applyTo`; emitted content has zero absolute paths; `.github/skills/` and `.github/hooks/` are NOT touched (pre-create them and assert byte-equality after).

- [ ] **Write failing test, implement (already complete from Task 3 — this task wires up the fixture), verify pass.**

- [ ] **Commit:**

```bash
git add tests/sync-copilot.test.mjs
git commit -m "test(copilot-provider): end-to-end /adev:sync run with format: copilot

Spec: .context-index/specs/features/copilot-provider/copilot-sync-output.spec.md
Plan-task: 8"
```

---

## Quality Gates

After all tasks complete, `/adev:validate` verifies the constitution's quality gate suite. Results are recorded in `.validate.md`.

- Tests pass: `npm test`
- All acceptance criteria from `copilot-sync-output.spec.md` satisfied (21 criteria)
- No new entries in `package.json:dependencies` or `:devDependencies`
- No constitutional violations introduced (pure ESM, Node built-ins only)
- Sync skill does NOT touch adapter-owned paths (`.github/skills/`, `.github/hooks/`, `.github/.adev-copilot-install.json`)
- `.github/copilot-instructions.md` always ≤ 4,000 UTF-8 bytes (verified via `Buffer.byteLength`)
- Zero absolute operator-machine paths in any emitted file
