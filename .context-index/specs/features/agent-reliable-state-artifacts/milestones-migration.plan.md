<!-- DO NOT EDIT statuses inline — see lifecycle log milestones-migration.jsonl -->
# Implementation Plan: Milestones Migration

> **Methodology:** adev
> **Charter:** .context-index/specs/features/agent-reliable-state-artifacts/charter.md
> **Spec:** .context-index/specs/features/agent-reliable-state-artifacts/milestones-migration.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-11)
> **Platform:** Node.js (ESM, `.mjs`), node:test

**Goal:** Migrate `.context-index/milestones.yaml` to `.context-index/milestones.json`. Rewrite `lib/milestones.mjs` to use `JSON.parse`/`JSON.stringify` + atomic temp-then-rename, switch path resolution from per-worktree to shared-via-`resolveStorageRoot()`, drop the `parseYaml` import, and add manifest-presence + realpath-prefix path containment defenses.

**Architecture:** Public API of `lib/milestones.mjs` (`loadMilestones`, `saveMilestones`, `findMilestone`, `milestoneCreate`, `milestoneShip`, `milestoneDefer`, `milestoneList`, `getMilestoneStatusData`, `warnIfMilestoneUndefined`, two validators) keeps its current signatures, return shapes, and error codes. Only the on-disk format and path-resolution rule change. Storage moves from per-worktree to shared-across-worktrees via the existing `resolveStorageRoot()` helper — same rule as the issue board, so milestones and issues live side-by-side in the main repo's `.context-index/` and `tasks.db_path` governs both.

---

## File Structure

**Create:**
- `tests/lib/milestones.test.mjs` — Rewritten / extended (JSON fixtures, worktree fixture, traversal fixtures)

**Modify:**
- `lib/milestones.mjs` — Replace YAML with JSON; drop `parseYaml` import; switch to `resolveStorageRoot`; add containment defenses; atomic write
- `templates/manifest.yaml` — Comment clarifying `tasks.db_path` governs milestones too (no new knob)
- `.context-index/specs/features/agent-reliable-state-artifacts/charter.md` — Capability Map: `Milestones migration` → `planned`

**Reference (read, do not modify):**
- `lib/build-state.mjs::atomicWriteJson` — Atomic-write pattern reference
- `lib/issues/resolve-root.mjs::resolveStorageRoot` — Shared-storage resolution
- `lib/issues/json-adapter.mjs` (once Wave 1 lands) — Sibling adapter with identical containment contract
- `lib/profiles/yaml.mjs` — Module being un-imported

---

## Context Packets

### Task 1 Context — Schema lock
- Spec: lines 83 (schema task), 110 (AC criteria 1-3)

### Task 2 Context — Rewrite `loadMilestones` / `saveMilestones` JSON serialization
- Spec: AC on JSON.stringify formatting, single trailing newline, atomic write
- Source: `lib/milestones.mjs` (full read), `lib/build-state.mjs::atomicWriteJson`

### Task 3 Context — Drop `parseYaml` import and serialization
- Spec: AC on grep test (no `yaml`/`YAML`/`parseYaml` strings remain)
- Source: `lib/milestones.mjs`, `lib/profiles/yaml.mjs`

### Task 4 Context — Switch to `resolveStorageRoot`
- Spec: Worktree Behavior Decision; AC on `tasks.db_path` unified knob
- Source: `lib/issues/resolve-root.mjs`

### Task 5 Context — Path containment defenses
- Spec: Path Safety items 1-4; AC on `INVALID_PROJECT_ROOT`, `INVALID_STORAGE_PATH`, positive-containment check on `storageRoot`
- Source: sibling pattern in `lib/issues/json-adapter.mjs` (once Wave 1 lands)

### Task 6 Context — Atomic write + cleanup-on-failure
- Spec: AC on best-effort `fs.unlinkSync` swallowing errors
- Source: `lib/build-state.mjs::atomicWriteJson`

### Task 7 Context — `findMilestone`, `milestoneCreate/Ship/Defer/List`, status helpers
- Spec: Behaviors rows; AC on synchronous `loadMilestones` (CON-5)
- Source: `lib/milestones.mjs` (existing implementations to preserve)

### Task 8 Context — Manifest schema doc update
- Spec: line 102 task; AC on no new knob
- Source: `templates/manifest.yaml`

### Task 9 Context — Worktree-shared storage test
- Spec: AC on worktree test fixture
- Source: existing worktree test for issue board (find via grep)

### Task 10 Context — Traversal + symlink-escape tests
- Spec: AC on `/etc/passwd` rejection, symlink-escape fixture, unified-knob fixture

### Task 11 Context — Atomic-write fault injection
- Spec: AC on fault-injection passing

### Task 12 Context — Architectural tests
- Spec: AC on no `yaml`/`YAML` strings; no writes to `.yaml`; no direct writes to `milestones.json`

### Task 13 Context — Integration: `lib/deploy.mjs` import path unchanged
- Spec: AC on `lib/deploy.mjs::loadMilestones` consumer continuing to work without modification
- Source: `lib/deploy.mjs` (existing dynamic import path)

---

## Heuristics

> Module-scope heuristics returned empty at plan time. `/adev:implement` reads from the live store at execution.

---

## Parallelization

- **Group A (sequential):** Task 1 → Task 2 → Task 3 (schema + JSON serializer + YAML import drop)
- **Group B (after Group A):** Task 4 → Task 5 → Task 6 (path resolution, containment, atomic write)
- **Group C (after Group B):** Task 7 (mutators / helpers preserved via JSON path)
- **Group D (independent):** Task 8 (template comment — isolated)
- **Group E (after Groups B + C):** Tasks 9, 10, 11, 13 (worktree, traversal, fault-injection, deploy integration — can run in parallel)
- **Group F (after Group E):** Task 12 (architectural assertions — must run after every source file finalized)

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Lock `milestones.json` schema (fixtures) | small | unit | — | 0 create, 0 modify |
| 2 | Rewrite `loadMilestones` / `saveMilestones` for JSON | small | unit | Task 1 | 0 create, 1 modify |
| 3 | Drop `parseYaml` import; strip YAML serialization | small | unit | Task 2 | 0 create, 1 modify |
| 4 | Switch path resolution to `resolveStorageRoot` | medium | unit | Task 3 | 0 create, 1 modify |
| 5 | Path containment defenses (manifest presence + realpath) | small | unit | Task 4 | 0 create, 1 modify |
| 6 | Atomic temp-then-rename with cleanup-on-failure | small | unit | Task 4 | 0 create, 1 modify |
| 7 | Preserve `findMilestone`, `milestoneCreate/Ship/Defer/List`, status helpers | small | unit | Tasks 5, 6 | 0 create, 1 modify |
| 8 | Manifest template comment for unified `tasks.db_path` | small | unit | — | 0 create, 1 modify |
| 9 | Worktree-shared storage test fixture | medium | unit | Task 7 | 0 create, 1 modify (test file) |
| 10 | Traversal + symlink-escape + unified-knob tests | small | unit | Task 7 | 0 create, 1 modify (test file) |
| 11 | Atomic-write fault injection test | medium | unit | Task 7 | 0 create, 1 modify (test file) |
| 12 | Architectural tests (no YAML strings; no writes to `.yaml`; no direct writes to `.json`) | small | unit | Task 7 | 0 create, 1 modify (existing arch test) |
| 13 | `lib/deploy.mjs::loadMilestones` integration sanity test | small | unit | Task 7 | 0 create, 1 modify (test file) |

---

## Strategy Summary

All tasks resolve to `unit` strategy (source: fallback). No external infrastructure needed — worktree tests use local temp dirs.

---

## Task 1: Lock schema [specialist: none]

**Charter capability:** Milestones migration
**Strategy:** unit
**Files:** Fixtures in `tests/lib/milestones.test.mjs`

- [x] **Write failing test** — Fixture milestone document `{ version: 1, milestones: [{name, status, epic_id, target_date, release: {strategy}, ship_criteria: [...], defer_reason}] }` covering all four field-name domains. Assert `saveMilestones` produces exactly this byte-shape with 2-space indent + trailing newline.
- [x] **Verify test fails**
- [x] **Implement** — Fixtures only; subsequent tasks update the writer.
- [x] **Commit**

```bash
git checkout -b feat/agent-reliable-state-artifacts/milestones-json
git add tests/lib/milestones.test.mjs
git commit -m "test(milestones): JSON schema fixtures

Spec: .context-index/specs/features/agent-reliable-state-artifacts/milestones-migration.spec.md
Plan-task: 1"
```

## Task 2: Rewrite `loadMilestones` / `saveMilestones` for JSON [specialist: none]

**Charter capability:** Milestones migration
**Strategy:** unit
**Depends on:** Task 1

- [x] **Write failing tests** — `loadMilestones` parses JSON file. `saveMilestones` writes JSON via temp-then-rename. Empty/missing file → `[]`. Malformed JSON → `PARSE_ERROR` ("milestones.json is malformed — cannot parse").
- [x] **Verify tests fail**
- [x] **Implement** — Replace YAML parser with `JSON.parse`. Replace handcrafted YAML serializer with `JSON.stringify({ version: 1, milestones }, null, 2) + "\n"`. Preserve field-default coercion (`name ?? ""`, `status ?? "planned"`, etc.).
- [x] **Verify tests pass**
- [x] **Commit**

## Task 3: Drop `parseYaml` import + strip YAML logic [specialist: none]

**Charter capability:** Milestones migration
**Strategy:** unit
**Depends on:** Task 2

- [x] **Write failing test** — Grep `lib/milestones.mjs` for `yaml`/`YAML`/`parseYaml` — assert empty after rewrite.
- [x] **Verify test fails** (import still present)
- [x] **Implement** — Remove `import { parseYaml } from "./profiles/yaml.mjs"`. Remove any remaining line-by-line YAML serialization code.
- [x] **Verify test passes**
- [x] **Commit**

## Task 4: Switch to `resolveStorageRoot` [specialist: none]

**Charter capability:** Milestones migration
**Strategy:** unit
**Depends on:** Task 3

- [x] **Write failing tests** — In a git-worktree fixture, `loadMilestones` reads from the main repo's `.context-index/milestones.json`, not the worktree-local path. `tasks.db_path: /tmp/adev-shared-XYZ` resolves to `/tmp/adev-shared-XYZ/.context-index/milestones.json`. Unified-knob: same setting also resolves `JsonAdapter` to `/tmp/adev-shared-XYZ/.context-index/tasks/tasks.json`.
- [x] **Verify tests fail** (still per-worktree)
- [x] **Implement** — Add `loadManifest(projectRoot)` internal helper. Replace every `join(projectRoot, MILESTONES_PATH)` with `join(resolveStorageRoot(manifest, projectRoot), '.context-index', 'milestones.json')`. Update `MILESTONES_PATH` constant to be relative-to-storage-root.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 5: Path containment defenses [specialist: none]

**Charter capability:** Milestones migration
**Strategy:** unit
**Depends on:** Task 4

- [x] **Write failing tests** — `projectRoot` missing `.context-index/manifest.yaml` → `INVALID_PROJECT_ROOT`. `tasks.db_path: /etc/passwd` (regular file, not directory) → `INVALID_STORAGE_PATH` with message "`tasks.db_path` must point at an existing directory". Symlink-escape fixture under `.context-index/` → `INVALID_STORAGE_PATH`.
- [x] **Verify tests fail**
- [x] **Implement** — `validateProjectRoot(projectRoot)`: `path.resolve` + `fs.existsSync('.context-index/manifest.yaml')`. Positive-containment check on resolved `storageRoot`: `fs.statSync(resolvedStorageRoot).isDirectory() === true`. Realpath-prefix check on target path's parent dir.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 6: Atomic write with cleanup-on-failure [specialist: none]

**Charter capability:** Milestones migration
**Strategy:** unit
**Depends on:** Task 4

- [x] **Write failing tests** — Fault inject: kill process between temp write and rename. Prior content preserved. Best-effort `fs.unlinkSync` on rename failure swallows cleanup errors.
- [x] **Verify tests fail**
- [x] **Implement** — Mirror `lib/build-state.mjs::atomicWriteJson` exactly: temp path `<finalPath>.<crypto.randomBytes(4).toString('hex')>.tmp`; write to temp; rename onto target; on failure, swallow `fs.unlinkSync` errors, rethrow original.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 7: Preserve mutators and helpers [specialist: none]

**Charter capability:** Milestones migration
**Strategy:** unit
**Depends on:** Tasks 5, 6

- [x] **Write failing tests** — Re-run every existing test from `tests/lib/milestones.test.mjs` against the rewritten module. Fixtures rewritten to JSON shape. Auto-link-to-epic preserved. `loadMilestones` stays synchronous (returns array directly, not Promise) — assert `typeof loadMilestones(root) === 'object'` not `'function'.then`.
- [x] **Verify tests fail** (where format-coupled)
- [x] **Implement** — Ensure every helper's I/O path picks up the new JSON path. No signature changes.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 8: Manifest template comment update [specialist: none]

**Charter capability:** Milestones migration
**Strategy:** unit
**Depends on:** —

- [x] **Implement** — Add a comment to `templates/manifest.yaml` `tasks` block: `# tasks.db_path also governs milestones.json location (unified knob)`.
- [x] **Commit**

## Task 9: Worktree-shared storage test [specialist: none]

**Charter capability:** Milestones migration
**Strategy:** unit
**Depends on:** Task 7

- [x] **Write test** — Set up `git worktree` fixture; assert `loadMilestones`/`saveMilestones` resolve to the main repo's `.context-index/milestones.json`. Mirror the existing issue-board worktree test.
- [x] **Verify test passes**
- [x] **Commit**

## Task 10: Traversal + symlink-escape + unified-knob tests [specialist: none]

**Charter capability:** Milestones migration
**Strategy:** unit
**Depends on:** Task 7

- [x] **Write tests** — `tasks.db_path: /etc/passwd` rejection. `tasks.db_path: /tmp/adev-shared-XYZ` resolves milestones AND tasks under the same root (unified knob). Symlink-escape fixture: `.context-index/` is a symlink to `../sibling/` → `INVALID_STORAGE_PATH`.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 11: Atomic-write fault injection [specialist: none]

**Charter capability:** Milestones migration
**Strategy:** unit
**Depends on:** Task 7

- [x] **Write test** — Fork child process executing `saveMilestones`; SIGKILL between temp write and rename; assert no partial JSON visible to readers, temp file orphaned, follow-up write succeeds.
- [x] **Verify test passes**
- [x] **Commit**

## Task 12: Architectural tests [specialist: none]

**Charter capability:** Milestones migration
**Strategy:** unit
**Depends on:** Task 7

- [x] **Write tests** — `grep -E "yaml|YAML|parseYaml" lib/milestones.mjs` empty. `grep -rE "milestones\\.yaml" lib/` outside migration-tool scope empty. `grep -rE "writeFile\\(.*milestones\\.json" lib/` only matches `saveMilestones`/`_write`. All in `tests/architectural.test.mjs` or extend.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 13: `lib/deploy.mjs` integration sanity test [specialist: none]

**Charter capability:** Milestones migration
**Strategy:** unit
**Depends on:** Task 7

- [x] **Write test** — Exercise `lib/deploy.mjs`'s dynamic import of `loadMilestones` against a JSON fixture. Assert the existing `await` consumer continues to work (await on a non-promise resolves to the value).
- [x] **Verify test passes**
- [x] **Commit**

---

## Quality Gates

- `npm test` green
- No new dependencies
- All files are `.mjs` ESM
- Coverage ≥ 90% lines on `lib/milestones.mjs`
- All 22+ AC criteria satisfied
- `loadMilestones` remains synchronous (CON-5)
- No constitutional violations
