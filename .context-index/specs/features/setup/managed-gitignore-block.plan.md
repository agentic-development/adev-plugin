<!-- partial_schema: plan@1 -->

# Implementation Plan: Managed Gitignore Block

> **Methodology:** adev
> **Charter:** .context-index/specs/features/setup/charter.md
> **Spec:** .context-index/specs/features/setup/managed-gitignore-block.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-22)
> **Platform:** Node.js (ESM), `node:test` runner, npm

**Goal:** Ship an idempotent paired-marker `.gitignore` block (`adev:gitignore`) maintained by a single canonical path list, wired into `adev init`, exposed via an `adev init ensure-gitignore [--remove]` subverb, and dogfooded in this repo.

**Architecture:** A new `lib/gitignore-paths.mjs` exports the single source of truth `MANAGED_GITIGNORE_PATHS` (ordered `{ path, comment? }` tuples). A new `lib/gitignore-installer.mjs` exposes `ensureManagedBlock` and `removeManagedBlock`, mirroring the paired-marker primitives of `lib/session-capture-installer.mjs:121-167` but adding three hardenings called out in the review (warnings SEC-1/SEC-2/SEC-6): `realpath`-based path containment, temp-then-rename atomic write, and scoped (not global) newline collapse. `cli/index.mjs` gains an `ensure-gitignore` sub-verb under `init`, gated by a new `setup.managed_gitignore` manifest knob (default `true`). `lib/prototype-server.mjs::ensureGitignore` becomes a one-line delegation. The repo's own `.gitignore` is re-baselined and a dogfood test pins it to `MANAGED_GITIGNORE_PATHS`.

---

## Up-Front Review-Warning Resolutions

The architecture review returned 0 blockers, 8 warnings, 9 suggestions. The plan addresses each warning before any implementation task lands so the implementer inherits decided semantics, not open questions.

| Warning | Resolution baked into the plan | Affected task |
|---------|-------------------------------|---------------|
| **SA-1** (ownership transfer of `lifecycle-state/*.json` + `build-state/*.json`) | **Absorb** into `MANAGED_GITIGNORE_PATHS`. Both entries carry an explicit `comment` field reading `"build-state JSON (jsonl events ARE committed)"` / `"legacy build-state (pre-rename)"`. The dogfood test verifies the comment renders into the block. No carve-out file needed. | Task 1 |
| **SA-2** (manifest-knob contract surface) | Schema: `setup.managed_gitignore: boolean`. Default: `true`. Explicit `adev init ensure-gitignore` **respects** the knob: when `false`, the write path noops with the same advisory line as `adev init`; `--remove` always bypasses the gate (operators must still be able to clean up). Documented in `docs/configuration.md` and inline in `templates/manifest-template.yaml`. | Tasks 5, 6, 10 |
| **SA-5** (paired amendment to `incremental-artifact-writes.spec.md:236`) | Add Task 9b: amend the cross-cutting spec's acceptance criterion to reference the `adev:gitignore` block as the enforcement vector instead of "CI gate or test fixture". | Task 9b |
| **CON-4** (cross-cutting handoff for `*.partial` / `*.partial.lock`) | Glob form chosen: **bare `*.partial`** and **bare `*.partial.lock`** (matches a `.gitignore` semantic of "any depth"). `MANAGED_GITIGNORE_PATHS` carries comment `"incremental artifact write — satisfies cross-cutting/incremental-artifact-writes:236"`. Task 9b records the handoff. | Tasks 1, 9b |
| **CON-2** (manifest-knob namespace rationale) | Documented in `docs/configuration.md`: `setup.*` namespace because the knob governs **scaffold-time install behavior** (run at `adev init`), parallel to `setup`-charter ownership; `integrations.session_capture.gitignored` lives under `integrations.*` because it gates **runtime-feature install behavior** for an opt-in integration. Different lifecycles → different namespaces. | Task 10 |
| **SEC-1** (path-containment algorithm) | `ensureManagedBlock` calls `realpathSync.native(projectRoot)`; if `.gitignore` exists, it also calls `realpathSync.native(dirname(gitignorePath))` and asserts the latter starts with the former + `path.sep`. If `.gitignore` is itself a symlink resolving outside `projectRoot`, refuse with `UNSAFE_GITIGNORE_PATH` and exit code 2 in the CLI. Implemented as `assertProjectContainment(projectRoot, gitignorePath)` helper in `lib/gitignore-installer.mjs`. | Tasks 2, 3 |
| **SEC-2** (atomic-write semantics) | Temp-then-rename: write `${gitignorePath}.<pid>.tmp` in the same directory, `fsyncSync(fd)` on the descriptor, then `renameSync(tmp, final)`. On failure, attempt to `unlinkSync` the tmp file. **The `.gitignore.*.tmp` pattern is added to `MANAGED_GITIGNORE_PATHS`** so a half-finished tmp written by this installer in the dogfood path does not leak into git. | Tasks 1, 2, 3 |
| **SEC-6** (scope newline collapse to splice region) | `removeManagedBlock` slices `before = content.slice(0, openIdx)` and `after = content.slice(closeIdx + CLOSE.length)`, then applies `\n{3,}` → `\n\n` collapse **only to the joined splice region** (`before.tail` + `after.head`, capped at 4 leading + 4 trailing chars on each side). Bytes outside that window survive byte-for-byte. Test asserts a triple-newline run far from the block survives `--remove`. | Tasks 2, 3 |
| **CON-1** (`ensure*` vs `append*` naming parity, _suggestion-class but escalated to warning in summary_) | **Keep `ensureManagedBlock` / `removeManagedBlock`.** Rationale documented inline in `lib/gitignore-installer.mjs`: `ensure*` better describes the generic-primitive contract (write-or-update-or-noop, branchless to caller) vs `append*` which describes a single sibling-installer code path. Inline docstring captures the divergence. | Task 2 |

The remaining suggestions (SA-3 paired-marker extraction, SA-4 prototype manifest-gate, SEC-3 input invariants, SEC-4 non-sensitivity docstring, SEC-5 disabled-knob advisory strengthening, CON-3 no-file branch parity, CON-5 CLI-verb shape, CON-6 return-value enum) are absorbed inline below in the relevant task notes — they do not require dedicated up-front tasks but are budgeted into existing tasks where applicable.

---

## File Structure

**Create:**
- `lib/gitignore-paths.mjs` — Exports `MANAGED_GITIGNORE_PATHS` (ordered `{ path, comment? }` tuples) plus a startup load-time assertion (SEC-3) that paths/comments contain no `\n`/`\r`/`\0` and no literal marker tokens.
- `lib/gitignore-installer.mjs` — Exports `ensureManagedBlock(projectRoot)`, `removeManagedBlock(projectRoot)`, and private helpers `assertProjectContainment`, `renderBlock`, `atomicWriteFile`. Mirrors paired-marker logic from `lib/session-capture-installer.mjs:121-167` with the three SEC hardenings (containment, atomic write, scoped collapse) and the `ensure*` naming choice (CON-1).
- `lib/cli/init-ensure-gitignore.mjs` — Wraps the installer behind `adev init ensure-gitignore [--remove]`. Honors `setup.managed_gitignore` knob (write-path); `--remove` always bypasses.
- `tests/lib/gitignore-installer.test.mjs` — Idempotency, drift regeneration, user-content preservation, no-file creation, malformed-open repair, dedupe, `--remove` semantics, scoped-collapse boundary, path-containment refusal, atomic-write crash-survivability proxy.
- `tests/lib/gitignore-paths-dogfood.test.mjs` — Parity check: this repo's `.gitignore` managed block byte-equals the canonical rendering of `MANAGED_GITIGNORE_PATHS`.
- `tests/lib/gitignore-paths.test.mjs` — Load-time invariant assertions (SEC-3) and shape contract for `MANAGED_GITIGNORE_PATHS`.

**Modify:**
- `cli/index.mjs` (around line 1556, the `init` legacy registry entry) — Route `adev init ensure-gitignore [--remove]` to the new `lib/cli/init-ensure-gitignore.mjs` module before falling through to install/upgrade.
- `cli/index.mjs` (within `cmdInstall` / `cmdUpgrade` flows) — After manifest write, invoke `ensureManagedBlock(projectRoot)` gated by `setup.managed_gitignore` knob (default `true`). Exact insertion point chosen at implement time alongside the existing session-capture installer call.
- `lib/prototype-server.mjs:209-238` — Replace the body of `ensureGitignore(projectRoot)` with a single delegation to `ensureManagedBlock(projectRoot)`; remove the legacy lazy `.adev/` append; preserve the function signature so existing callers in `lib/cli/prototype.mjs:242` need no change. Prototype path force-installs (does NOT honor the manifest gate per SA-4: prototype boot specifically needs `.adev/` ignored).
- `.gitignore` (this repo) — Re-baseline so the managed block carries exactly the rendering of `MANAGED_GITIGNORE_PATHS`. Preserve all non-managed user lines (including the existing `# >>> adev:session-capture-gitignore >>>` block).
- `docs/hooks.md:354, ~358-365` — Replace the stale "5 ephemeral paths" sentence (which appears twice in the file) with an accurate description of the `adev:gitignore` block and a pointer to `lib/gitignore-paths.mjs` as the source of truth.
- `docs/configuration.md` — New section "Managed gitignore block" documenting the block, the `setup.managed_gitignore: bool` knob, the namespace rationale vs `integrations.session_capture.gitignored` (CON-2), and the `--remove` exit-pathway.
- `templates/manifest-template.yaml` — Append a commented `setup:\n  managed_gitignore: true` example block under a new `# Setup` heading, with an inline comment explaining the opt-out behavior.
- `.context-index/specs/cross-cutting/incremental-artifact-writes.spec.md:236` — Replace "CI gate or test fixture verifies" with "The `adev:gitignore` managed block (lib/gitignore-paths.mjs) carries `*.partial` and `*.partial.lock`; the dogfood parity test in tests/lib/gitignore-paths-dogfood.test.mjs is the enforcement vector."
- `tests/lib/prototype-server.test.mjs` (or the existing prototype-server test file) — Update `ensureGitignore` tests to assert delegation behavior (block written, not lazy `.adev/`-only append).

**Reference (read, do not modify):**
- `lib/session-capture-installer.mjs:121-167` — Source pattern for paired-marker open/close splice, idempotent noop semantics, and write-or-update branching.
- `.context-index/specs/cross-cutting/incremental-artifact-writes.spec.md` — Defines the partial-write contract whose `*.partial`/`*.partial.lock` ownership now flows through this block.
- `.context-index/specs/features/setup/charter.md` — Parent charter; capability map needs a new "Managed gitignore block" row at next charter revision.

---

## Context Packets

> Plan-time snapshot. `/adev:implement` reassembles these per task before dispatching subagents.

### Task 1 Context (`lib/gitignore-paths.mjs`)
- Spec: managed-gitignore-block.spec.md — Behaviors 1-3, Canonical Path List section
- Charter: setup/charter.md — Capability Map (new row pending)
- Reference (signatures only): `lib/session-capture-installer.mjs` lines 29-30 (marker token shape)
- Cross-cutting (full read): `.context-index/specs/cross-cutting/incremental-artifact-writes.spec.md` Behavior 6 + acceptance criterion 236

### Task 2 Context (`lib/gitignore-installer.mjs`)
- Spec: managed-gitignore-block.spec.md — Behaviors 1-8, Error Cases, Postconditions
- Source pattern (full read): `lib/session-capture-installer.mjs:1-170`
- Review warnings to honor: SEC-1 (containment), SEC-2 (atomic write), SEC-6 (scoped collapse), CON-1 (naming)
- Module: `lib/gitignore-paths.mjs` (from Task 1, signatures only)

### Task 3 Context (`tests/lib/gitignore-installer.test.mjs`)
- Spec: managed-gitignore-block.spec.md — Acceptance Criteria (lines 127-140)
- Test pattern (full read): one nearby idempotency-style test file under `tests/lib/` for `node:test` conventions in this repo
- Source under test: `lib/gitignore-installer.mjs` (from Task 2, full read)

### Task 4 Context (`tests/lib/gitignore-paths-dogfood.test.mjs`)
- Spec: managed-gitignore-block.spec.md — Acceptance "MANAGED_GITIGNORE_PATHS is the only path list source"
- This repo's `.gitignore` (full read at test time, not plan time)
- Module: `lib/gitignore-paths.mjs` + `lib/gitignore-installer.mjs::renderBlock` (signatures)

### Task 5 Context (`cli/index.mjs` install/upgrade wiring)
- Spec: managed-gitignore-block.spec.md — Behavior 1, Behavior 8
- Existing site (full read): `cli/index.mjs:680-690` (session-capture dispatcher call) — insert ensureManagedBlock call adjacent
- Module: `lib/gitignore-installer.mjs::ensureManagedBlock` (signature)

### Task 6 Context (`lib/cli/init-ensure-gitignore.mjs` + `cli/index.mjs` sub-verb route)
- Spec: managed-gitignore-block.spec.md — Behaviors 4, 5; Error Case: `--remove`-while-knob-false (decided: bypasses gate)
- Pattern (full read): `lib/cli/init-prompt-session-capture.mjs` — same sub-verb adapter shape
- Module: `lib/gitignore-installer.mjs` (signatures)

### Task 7 Context (`lib/prototype-server.mjs::ensureGitignore`)
- Spec: managed-gitignore-block.spec.md — Behavior 7; review suggestion SA-4 (prototype force-install rationale)
- Source under refactor (full read): `lib/prototype-server.mjs:200-240`
- Tests to update: existing prototype-server tests that exercise `ensureGitignore`
- Module: `lib/gitignore-installer.mjs::ensureManagedBlock` (signature)

### Task 8 Context (`.gitignore` re-baseline)
- Spec: managed-gitignore-block.spec.md — Acceptance "This repo's `.gitignore` carries the canonical managed block"
- Existing repo `.gitignore` (full read at task time)
- Module: `lib/gitignore-paths.mjs` + `lib/gitignore-installer.mjs::ensureManagedBlock` (run via CLI verb to dogfood)

### Task 9 Context (`docs/hooks.md` doc-drift fix)
- Spec: managed-gitignore-block.spec.md — Acceptance "`docs/hooks.md` no longer claims a 5-path installer block"
- Source (full read): `docs/hooks.md:350-365` (both occurrences of the stale claim)
- Module: `lib/gitignore-paths.mjs` (canonical list for accurate description)

### Task 9b Context (cross-cutting paired amendment)
- Spec: `.context-index/specs/cross-cutting/incremental-artifact-writes.spec.md:236` (full read of acceptance section)
- This spec: managed-gitignore-block.spec.md — Behaviors 1, 7

### Task 10 Context (`docs/configuration.md` + `templates/manifest-template.yaml`)
- Spec: managed-gitignore-block.spec.md — Behavior 8, manifest knob contract
- Existing docs (full read): `docs/configuration.md` (locate Setup section or end-of-file insertion point), `templates/manifest-template.yaml` (full read for insertion order)
- Reference: `integrations.session_capture` block in `.context-index/manifest.yaml` (signatures only — for namespace-rationale comparison)

> No heuristics matched module `setup` at plan time (only adev-meta heuristics about cost/cache returned). Section omitted.

---

## Parallelization

- **Group A (sequential, foundation):** Task 1 → Task 2 → Task 3. Shared module `lib/gitignore-installer.mjs` plus its tests.
- **Group B (sequential, dogfood):** Task 4 → Task 8. Task 8 runs the installer in dogfood mode; Task 4's test then asserts parity. Order matters: re-baselining `.gitignore` before the test pins.
- **Group C (independent, after Group A):** Tasks 5 + 6. Touch `cli/index.mjs` (Task 5 in install/upgrade flow, Task 6 in registry table) — files overlap, so 5 → 6 sequential within C.
- **Group D (independent, after Group A):** Task 7. Touches `lib/prototype-server.mjs` only.
- **Group E (independent, after Groups B+C+D):** Tasks 9, 9b, 10. Pure doc/spec edits.

Group A must complete before any other group starts (everything depends on the installer existing). Groups B/C/D may run in parallel after Group A. Group E runs last.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Author `lib/gitignore-paths.mjs` (`MANAGED_GITIGNORE_PATHS` + load-time invariants) | small | unit | — | 1 create, 0 modify |
| 2 | Implement `ensureManagedBlock` + `removeManagedBlock` in `lib/gitignore-installer.mjs` (containment + atomic write + scoped collapse) | medium | unit | Task 1 | 1 create, 0 modify |
| 3 | Installer test suite: idempotency, drift, preservation, no-file, repair, dedupe, remove, scoped-collapse boundary, containment refusal | medium | unit | Task 2 | 2 create, 0 modify |
| 4 | Dogfood parity test pinning this repo's `.gitignore` block to `MANAGED_GITIGNORE_PATHS` | small | unit | Tasks 2, 8 | 1 create, 0 modify |
| 5 | Wire `ensureManagedBlock` into `adev install` / `adev upgrade` flow in `cli/index.mjs`, gated by `setup.managed_gitignore` knob | small | unit | Task 2 | 0 create, 1 modify |
| 6 | Add `adev init ensure-gitignore [--remove]` sub-verb (`lib/cli/init-ensure-gitignore.mjs` + `cli/index.mjs` registry route) | small | unit | Task 2 | 1 create, 1 modify |
| 7 | Refactor `lib/prototype-server.mjs::ensureGitignore` to delegate; update its tests | small | unit | Task 2 | 0 create, 2 modify |
| 8 | Re-baseline this repo's `.gitignore` to the canonical-block format (preserve non-managed user lines) | small | dogfood | Tasks 2, 6 | 0 create, 1 modify |
| 9 | Fix stale "5 ephemeral paths" claim in `docs/hooks.md` (~lines 354, 358-365) | small | docs | Task 1 | 0 create, 1 modify |
| 9b | Paired amendment to `cross-cutting/incremental-artifact-writes.spec.md:236` (handoff per SA-5 / CON-4) | small | docs | Task 1 | 0 create, 1 modify |
| 10 | Document block + `setup.managed_gitignore` knob in `docs/configuration.md`; commented example in `templates/manifest-template.yaml` (CON-2 rationale) | small | docs | Tasks 5, 6 | 0 create, 2 modify |

### Strategy Summary

| Strategy | Tasks | Source |
|----------|-------|--------|
| unit | 7 | fallback |
| dogfood | 1 | detected (medium confidence — Task 8 modifies repo state to satisfy a test, not the test itself) |
| docs | 3 | detected (medium confidence — doc-only edits) |

No non-unit tasks require external infrastructure. Skipping `## Test Infrastructure Requirements` section per the skill's emission trigger (no `infra_requirements:` in spec, no integration/visual/schema tasks).

---

## Task Structure

> **Note on task status.** The per-task `- [ ]` checkboxes are authoring guides. Authoritative task state lives in `.context-index/lifecycle-state/<slug>.jsonl` via `plan_task` events.

### Task 1: Author `lib/gitignore-paths.mjs` [specialist: none]

**Charter capability:** Managed gitignore block (new — to be added to setup charter at next revision)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/gitignore-paths.mjs`
- Test: `tests/lib/gitignore-paths.test.mjs`

**Tests:** `tests/lib/gitignore-paths.test.mjs`

**Context to load:**
- `.context-index/specs/features/setup/managed-gitignore-block.spec.md` (Canonical Path List section, lines 85-105)
- `.context-index/specs/cross-cutting/incremental-artifact-writes.spec.md:236` (handoff note context)
- `lib/session-capture-installer.mjs:29-30` (marker-token shape — for the SEC-3 invariant test)

- [ ] **Write failing test**

The test file at `tests/lib/gitignore-paths.test.mjs` asserts:
1. `MANAGED_GITIGNORE_PATHS` is an array of `{ path: string, comment?: string }` objects.
2. The list contains the 18 entries from the spec's canonical list in declared order (including `lifecycle-state/*.json`, `build-state/*.json`, `.gitignore.*.tmp` per SEC-2, `*.partial`, `*.partial.lock`, `.adev/`, and explicitly NOT `.context-index/sessions/`).
3. SEC-3 invariants: no entry's `path` or `comment` contains `\n`, `\r`, `\0`, or the literal marker tokens `# >>> adev:gitignore >>>` / `# <<< adev:gitignore <<<`.
4. SA-1 absorption: the `lifecycle-state/*.json` entry's `comment` includes the substring `jsonl` (proving the load-bearing rationale survived absorption).

- [ ] **Verify test fails**

Run: `node --test tests/lib/gitignore-paths.test.mjs`
Expected: FAIL — `Cannot find module '../../lib/gitignore-paths.mjs'`

- [ ] **Implement**

`lib/gitignore-paths.mjs` exports the `MANAGED_GITIGNORE_PATHS` constant (frozen ordered list of `{ path, comment? }`) plus a top-level IIFE that runs the SEC-3 assertions at module load. Path entries:

```
.context-index/hygiene/                       # hygiene reports (regenerated)
.context-index/packets/                       # review packets (regenerated)
.context-index/.token-cursor.json             # session-tracking cursor
.context-index/.reminder-counter              # issue-reminder counter
.context-index/.session-tracking.jsonl        # session telemetry
.context-index/user-config                    # local user config override
.context-index/.context-preflight-ok          # preflight session flag
.context-index/.execution-state.json          # execution state (transient)
.context-index/.advisory-counter              # lifecycle-gate advisory counter
.context-index/lifecycle-state/*.json         # build-state JSON (jsonl event logs ARE committed; only the *.json build-state files are ignored — SA-1)
.context-index/build-state/*.json             # legacy build-state (pre-rename)
.context-index/tasks/tasks.json.lock          # issue-board CAS lock
.context-index/tasks/tasks.json.*.tmp         # issue-board atomic-write temp
.context-index/tasks/.migrate-state.json      # backend-migration resume state
*.partial                                     # incremental artifact write — satisfies cross-cutting/incremental-artifact-writes:236
*.partial.lock                                # incremental artifact lock
.gitignore.*.tmp                              # gitignore-installer atomic-write temp (SEC-2)
.adev/                                        # prototype workspace
```

A docstring at the top of the file records (SEC-4): entries are user-visible (committed in the dogfood block) and must remain non-sensitive — no credentials, no PII, no host-specific paths.

- [ ] **Verify test passes**

Run: `node --test tests/lib/gitignore-paths.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch (if not already created): `feat/setup/managed-gitignore-block`

```bash
git add lib/gitignore-paths.mjs tests/lib/gitignore-paths.test.mjs
git commit -m "feat(setup): add MANAGED_GITIGNORE_PATHS canonical list

Spec: .context-index/specs/features/setup/managed-gitignore-block.spec.md
Plan-task: 1"
```

---

### Task 2: Implement `lib/gitignore-installer.mjs` [specialist: none]

**Charter capability:** Managed gitignore block
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1

**Files:**
- Create: `lib/gitignore-installer.mjs`

**Tests:** `tests/lib/gitignore-installer.test.mjs` (authored in Task 3 — the implementation here is test-driven via Task 3's RED phase)

**Context to load:**
- `lib/session-capture-installer.mjs:121-167` (paired-marker pattern — mirror, with three hardenings)
- `lib/gitignore-paths.mjs` (Task 1 output)
- Spec Error Cases table (containment, malformed-open repair, dedupe, --remove noop)

- [ ] **Write failing test**

The full installer test file lives in Task 3. For this task, the minimal RED is a single smoke test at the top of `tests/lib/gitignore-installer.test.mjs`:

```javascript
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { ensureManagedBlock } from '../../lib/gitignore-installer.mjs';

test('ensureManagedBlock creates .gitignore from scratch with block + trailing newline', () => {
  const root = mkdtempSync(join(tmpdir(), 'mgb-smoke-'));
  mkdirSync(join(root, '.context-index'), { recursive: true });
  try {
    const result = ensureManagedBlock(root);
    assert.equal(result, 'added');
    const content = readFileSync(join(root, '.gitignore'), 'utf8');
    assert.ok(content.startsWith('# >>> adev:gitignore >>>\n'));
    assert.ok(content.endsWith('# <<< adev:gitignore <<<\n'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/gitignore-installer.test.mjs`
Expected: FAIL — `Cannot find module '../../lib/gitignore-installer.mjs'`

- [ ] **Implement**

`lib/gitignore-installer.mjs` exports:

1. **Marker constants** (module-private):
   ```javascript
   const GITIGNORE_OPEN  = '# >>> adev:gitignore >>>';
   const GITIGNORE_CLOSE = '# <<< adev:gitignore <<<';
   ```

2. **`renderBlock()`** (module-private): builds the canonical block body string from `MANAGED_GITIGNORE_PATHS`. For each entry, emits `# <comment>\n<path>\n` when `comment` present, else `<path>\n`. Wraps in `${OPEN}\n…${CLOSE}`. Pure / no I/O.

3. **`assertProjectContainment(projectRoot, gitignorePath)`** (module-private, SEC-1): calls `realpathSync.native(projectRoot)` and (if `.gitignore` exists) `realpathSync.native(dirname(gitignorePath))`; asserts the latter starts with the former + `path.sep`. If `.gitignore` is itself a symlink, additionally `realpathSync.native(gitignorePath)` and require it starts with the realpath of `projectRoot` + `path.sep`. On violation, throw an `Error` whose `code` is `'UNSAFE_GITIGNORE_PATH'`.

4. **`atomicWriteFile(finalPath, content)`** (module-private, SEC-2): writes to `${finalPath}.${process.pid}.tmp`, calls `fsyncSync` on the open fd, closes, `renameSync(tmp, finalPath)`. On any error, attempts `unlinkSync(tmp)` (best-effort) and rethrows.

5. **`ensureManagedBlock(projectRoot)`** (exported): the main entrypoint. Returns one of `"added" | "updated" | "noop" | "repaired" | "deduped"`.
   - Resolve `gitignorePath = join(projectRoot, '.gitignore')`; call `assertProjectContainment`.
   - If `.gitignore` does not exist: write `${renderBlock()}\n` via `atomicWriteFile` → return `"added"`.
   - Read content. Find all occurrences of `GITIGNORE_OPEN`.
   - If zero opens: append at EOF with prefix/tail newlines matching the sibling installer (`lib/session-capture-installer.mjs:141-145`) → write via `atomicWriteFile` → return `"added"`.
   - If exactly one open and one close at `closeIdx > openIdx`: splice canonical block into place. If `next === content`, return `"noop"`; else `atomicWriteFile` → return `"updated"`.
   - If exactly one open and no close (malformed): replace from `openIdx` through EOF with canonical block + `\n`; emit one-line `process.stderr.write('warn: adev:gitignore block had unmatched open marker; rewriting\n')`; `atomicWriteFile` → return `"repaired"`.
   - If two or more opens: collapse to one canonical block at the position of the first open; everything between first open and last close (inclusive) is removed; emit stderr warning naming the duplicate offsets; `atomicWriteFile` → return `"deduped"`.

6. **`removeManagedBlock(projectRoot)`** (exported): returns `"removed" | "noop"`.
   - Resolve `gitignorePath`; call `assertProjectContainment`.
   - If file does not exist OR no `GITIGNORE_OPEN` substring: return `"noop"`.
   - Splice: `before = content.slice(0, openIdx)`, `after = content.slice(closeIdx + CLOSE.length)`.
   - **SEC-6 scoped collapse:** compute `bTail = before.slice(-4)`, `aHead = after.slice(0, 4)`. Apply `replace(/\n{3,}/g, "\n\n")` ONLY to the joined `bTail + aHead` substring; reassemble as `before.slice(0, -4) + collapsed + after.slice(4)`. Bytes outside the 8-char window are never modified.
   - `atomicWriteFile` → return `"removed"`.

7. **Inline docstring at top of file** documenting (CON-1): "`ensure*`/`remove*` naming chosen for generic-primitive contract (write-or-update-or-noop, branchless to caller). Sibling `lib/session-capture-installer.mjs` uses `append*` for its single-write code path — divergence is deliberate and namespace-scoped."

Inline imports: `fs` (readFileSync, writeFileSync, existsSync, openSync, fsyncSync, closeSync, unlinkSync, renameSync, realpathSync), `path` (join, dirname, sep). Imports `MANAGED_GITIGNORE_PATHS` from `./gitignore-paths.mjs`.

- [ ] **Verify test passes**

Run: `node --test tests/lib/gitignore-installer.test.mjs`
Expected: PASS (smoke test only — Task 3 expands to full suite)

- [ ] **Commit**

```bash
git add lib/gitignore-installer.mjs tests/lib/gitignore-installer.test.mjs
git commit -m "feat(setup): implement ensureManagedBlock / removeManagedBlock

Spec: .context-index/specs/features/setup/managed-gitignore-block.spec.md
Plan-task: 2"
```

---

### Task 3: Full installer test suite [specialist: none]

**Charter capability:** Managed gitignore block
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2

**Files:**
- Modify: `tests/lib/gitignore-installer.test.mjs` (expand smoke → full suite)

**Tests:** `tests/lib/gitignore-installer.test.mjs`

**Context to load:**
- Spec Acceptance Criteria (lines 127-140) + Error Cases table (lines 53-59)
- `lib/gitignore-installer.mjs` (Task 2 output, full)

- [ ] **Write failing test**

Add the following test cases (each a separate `test(...)` block in `tests/lib/gitignore-installer.test.mjs`):

1. **Idempotency:** call `ensureManagedBlock` twice on the same root → second call returns `"noop"` and file is byte-identical.
2. **Drift regeneration:** write a `.gitignore` containing a managed block with a stale path list (e.g., only `.adev/`); call `ensureManagedBlock` → returns `"updated"`, block body now matches canonical render, content outside markers unchanged.
3. **User-content preservation:** seed `.gitignore` with `user-line-above\n${OPEN}\nold\n${CLOSE}\nuser-line-below\n`; call → returns `"updated"`, both user lines present byte-identical at original byte offsets relative to splice.
4. **No-file creation:** delete `.gitignore`; call → returns `"added"`, content is exactly `${renderBlock()}\n` (no leading whitespace, single trailing newline).
5. **Malformed-open repair:** `.gitignore` is `${OPEN}\nfoo\nbar\n` (no close marker, junk after); call → returns `"repaired"`, file now ends with canonical block + `\n`, stderr warning emitted.
6. **Dedupe:** `.gitignore` has two `${OPEN}…${CLOSE}` pairs; call → returns `"deduped"`, exactly one block remains at the position of the first open, stderr warning emitted.
7. **`--remove` semantics:** `removeManagedBlock` on a file with block → `"removed"`, block + markers gone, surrounding user lines preserved. Call again → `"noop"`.
8. **`--remove` noop on absent file:** `removeManagedBlock` when `.gitignore` does not exist → `"noop"`.
9. **SEC-6 scoped collapse:** `.gitignore` content `a\n\n\n\n${OPEN}\nfoo\n${CLOSE}\n\n\n\n\nb` — assert that after `removeManagedBlock`, the `a\n\n\n\n` prefix far from the splice survives byte-for-byte (the `\n{3,}` collapse only applies to the joined splice-window of `before.slice(-4) + after.slice(0,4)`).
10. **SEC-1 containment refusal:** create `projectRoot/inner/`; symlink `projectRoot/inner/.gitignore → /tmp/elsewhere/.gitignore`; call `ensureManagedBlock(join(projectRoot, 'inner'))` → throws with `error.code === 'UNSAFE_GITIGNORE_PATH'`. Skip on platforms without symlink permission (`process.platform === 'win32'` || env signals).
11. **SEC-2 atomic-write proxy:** monkey-patch `renameSync` to throw on first call; verify (a) the `.gitignore` is not partially written (still its pre-call content), (b) no orphaned `.gitignore.*.tmp` remains in the project root after the throw.
12. **Round-trip:** `ensure` → `remove` → `ensure` produces canonical content; the post-`remove` content has no marker tokens anywhere.

Each test uses `mkdtempSync` for isolation and `rmSync(root, { recursive: true, force: true })` in cleanup.

- [ ] **Verify test fails**

Run: `node --test tests/lib/gitignore-installer.test.mjs`
Expected: 1 PASS (smoke from Task 2), 11 FAIL.

- [ ] **Implement**

Iterate on `lib/gitignore-installer.mjs` to make each test green. Most will pass with the Task 2 implementation — the likely gaps are: stderr warnings (5, 6), scoped-collapse window precision (9), containment in `removeManagedBlock` (10 only exercises `ensure`, but `remove` should also call `assertProjectContainment`), tmp-cleanup on rename failure (11).

- [ ] **Verify test passes**

Run: `node --test tests/lib/gitignore-installer.test.mjs`
Expected: 12 PASS.

- [ ] **Commit**

```bash
git add tests/lib/gitignore-installer.test.mjs lib/gitignore-installer.mjs
git commit -m "test(setup): full ensureManagedBlock / removeManagedBlock suite

Spec: .context-index/specs/features/setup/managed-gitignore-block.spec.md
Plan-task: 3"
```

---

### Task 4: Dogfood-parity test [specialist: none]

**Charter capability:** Managed gitignore block
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Tasks 2, 8 (Task 8 re-baselines the repo `.gitignore` first; this task's test then pins it)

**Files:**
- Create: `tests/lib/gitignore-paths-dogfood.test.mjs`

**Tests:** `tests/lib/gitignore-paths-dogfood.test.mjs`

**Context to load:**
- `lib/gitignore-paths.mjs`, `lib/gitignore-installer.mjs::renderBlock` (Tasks 1-2)
- This repo's `.gitignore` (read at test runtime)

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderBlock } from '../../lib/gitignore-installer.mjs';

const REPO_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

test('repo .gitignore carries canonical adev:gitignore block byte-for-byte', () => {
  const content = readFileSync(join(REPO_ROOT, '.gitignore'), 'utf8');
  const open = '# >>> adev:gitignore >>>';
  const close = '# <<< adev:gitignore <<<';
  const openIdx = content.indexOf(open);
  const closeIdx = content.indexOf(close);
  assert.ok(openIdx >= 0, 'missing adev:gitignore open marker in repo .gitignore');
  assert.ok(closeIdx > openIdx, 'missing or misordered adev:gitignore close marker');
  const blockInRepo = content.slice(openIdx, closeIdx + close.length);
  assert.equal(blockInRepo, renderBlock(), 'repo .gitignore block drifted from MANAGED_GITIGNORE_PATHS');
});

test('repo .gitignore does NOT absorb the session-capture block', () => {
  const content = readFileSync(join(REPO_ROOT, '.gitignore'), 'utf8');
  assert.ok(content.includes('# >>> adev:session-capture-gitignore >>>'),
    'session-capture block must remain separately owned (SA-1 carve-out)');
});
```

Note: `renderBlock` is currently module-private (Task 2). Either (a) export it from `lib/gitignore-installer.mjs` as a `// @internal` helper, or (b) re-derive the canonical string inline in the test by importing `MANAGED_GITIGNORE_PATHS` directly. Choice (a) is preferred — explicit `// @internal` JSDoc tag — so future installer changes propagate naturally.

- [ ] **Verify test fails**

Run: `node --test tests/lib/gitignore-paths-dogfood.test.mjs`
Expected: FAIL — the repo `.gitignore` does not yet carry the canonical block (Task 8 re-baselines it; this task must run after Task 8 to assert parity, but the failing-test phase is satisfied even pre-Task-8).

- [ ] **Implement**

No implementation file. The "implementation" is Task 8's re-baseline, which this test pins. After Task 8 runs, this test must pass.

- [ ] **Verify test passes**

Run: `node --test tests/lib/gitignore-paths-dogfood.test.mjs`
Expected: PASS (after Task 8 has run).

- [ ] **Commit**

```bash
git add tests/lib/gitignore-paths-dogfood.test.mjs
git commit -m "test(setup): dogfood-pin repo .gitignore to MANAGED_GITIGNORE_PATHS

Spec: .context-index/specs/features/setup/managed-gitignore-block.spec.md
Plan-task: 4"
```

---

### Task 5: Wire `ensureManagedBlock` into install/upgrade [specialist: none]

**Charter capability:** Managed gitignore block
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2

**Files:**
- Modify: `cli/index.mjs` (within `cmdInstall` and/or `cmdUpgrade`, after manifest-write step, adjacent to the existing `dispatchInstallerByCaptureMode` call around line 680-690)

**Tests:** Extend existing `tests/cli.test.mjs` or add `tests/cli-init-managed-gitignore.test.mjs` (new file is cleaner — isolates concern).

**Context to load:**
- `cli/index.mjs:680-700` (session-capture dispatcher call site — adjacent insertion target)
- `lib/gitignore-installer.mjs::ensureManagedBlock` (Task 2)
- `lib/manifest.mjs::loadManifest` (or wherever manifest read happens in cmdInstall) — for reading `setup.managed_gitignore`

- [ ] **Write failing test**

Create `tests/cli-init-managed-gitignore.test.mjs` with two tests:

1. **Knob default (no `setup:` block in manifest):** spawn `node cli/index.mjs install` in a temp project root where `manifest.yaml` has no `setup:` block; assert post-run that `.gitignore` contains the `adev:gitignore` open marker.
2. **Knob explicitly false:** seed `manifest.yaml` with `setup:\n  managed_gitignore: false`; spawn install; assert (a) `.gitignore` does NOT contain the marker, (b) stdout contains the advisory `managed gitignore: disabled by manifest`.

- [ ] **Verify test fails**

Run: `node --test tests/cli-init-managed-gitignore.test.mjs`
Expected: FAIL — the install flow doesn't yet invoke `ensureManagedBlock` and the advisory is unprinted.

- [ ] **Implement**

In `cli/index.mjs`, add a helper near the existing session-capture dispatcher (around line 680):

```javascript
async function maybeEnsureManagedGitignore(projectRoot, manifest) {
  const knob = manifest?.setup?.managed_gitignore;
  const enabled = knob !== false;  // default true; only literal false disables
  if (!enabled) {
    console.log('managed gitignore: disabled by manifest');
    return;
  }
  const { ensureManagedBlock } = await import('../lib/gitignore-installer.mjs');
  try {
    const result = ensureManagedBlock(projectRoot);
    if (result !== 'noop') console.log(`managed gitignore: ${result}`);
  } catch (err) {
    if (err?.code === 'UNSAFE_GITIGNORE_PATH') {
      console.error('warn: adev:gitignore not written — path-containment violation');
      return;
    }
    if (err?.code === 'EACCES') {
      console.error('warn: adev:gitignore not written — .gitignore is read-only');
      return;
    }
    throw err;
  }
}
```

Call `await maybeEnsureManagedGitignore(projectRoot, manifest)` immediately after the existing session-capture installer dispatch in both `cmdInstall` and `cmdUpgrade` (or factor the call into the shared post-manifest-write step if one exists).

- [ ] **Verify test passes**

Run: `node --test tests/cli-init-managed-gitignore.test.mjs`
Expected: PASS.

- [ ] **Commit**

```bash
git add cli/index.mjs tests/cli-init-managed-gitignore.test.mjs
git commit -m "feat(setup): wire ensureManagedBlock into adev install/upgrade

Spec: .context-index/specs/features/setup/managed-gitignore-block.spec.md
Plan-task: 5"
```

---

### Task 6: `adev init ensure-gitignore [--remove]` sub-verb [specialist: none]

**Charter capability:** Managed gitignore block
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2

**Files:**
- Create: `lib/cli/init-ensure-gitignore.mjs`
- Modify: `cli/index.mjs` (around line 1561 — extend the `init` verb's `prompt session-capture` sub-verb routing to also recognize `ensure-gitignore`)

**Tests:** Extend `tests/cli-init-managed-gitignore.test.mjs` with sub-verb-specific cases (or add `tests/cli-init-ensure-gitignore.test.mjs`).

**Context to load:**
- `lib/cli/init-prompt-session-capture.mjs` (full read — same sub-verb adapter shape, mirror its `run({projectRoot, argv, manifest})` signature)
- `cli/index.mjs:1556-1576` (init verb dispatcher)
- `lib/gitignore-installer.mjs` (Task 2)

- [ ] **Write failing test**

Tests for the new sub-verb:

1. **`ensure-gitignore` writes block:** in a temp project, run `node cli/index.mjs init ensure-gitignore` → exit 0, `.gitignore` contains the block.
2. **`--remove` excises block:** seed the block; run `node cli/index.mjs init ensure-gitignore --remove` → exit 0, marker absent.
3. **`--remove` noop:** no block present; run `--remove` → exit 0, `.gitignore` byte-identical to pre-run.
4. **Knob `false` blocks write but not remove:** manifest with `setup.managed_gitignore: false` AND existing block; (a) `ensure-gitignore` (write path) → exit 0, advisory printed, block unchanged; (b) `ensure-gitignore --remove` → exit 0, block removed (`--remove` bypasses the knob).
5. **Containment refusal:** symlink-escape scenario → exit 2 with `UNSAFE_GITIGNORE_PATH` on stderr.

- [ ] **Verify test fails**

Run: `node --test tests/cli-init-ensure-gitignore.test.mjs`
Expected: FAIL — sub-verb not registered.

- [ ] **Implement**

Create `lib/cli/init-ensure-gitignore.mjs`:

```javascript
// lib/cli/init-ensure-gitignore.mjs
// Sub-verb adapter for `adev init ensure-gitignore [--remove]`.
// Shape mirrors lib/cli/init-prompt-session-capture.mjs.
// Spec: .context-index/specs/features/setup/managed-gitignore-block.spec.md
import { ensureManagedBlock, removeManagedBlock } from '../gitignore-installer.mjs';
import { loadManifest } from '../manifest.mjs';

export async function run({ projectRoot, argv, manifest }) {
  const isRemove = argv.includes('--remove');
  const m = manifest ?? (await loadManifest(projectRoot).catch(() => null));
  const knob = m?.setup?.managed_gitignore;
  const enabled = knob !== false;

  try {
    if (isRemove) {
      // --remove always bypasses the manifest knob (operator escape hatch).
      const result = removeManagedBlock(projectRoot);
      console.log(`managed gitignore: ${result}`);
      process.exit(0);
    }
    if (!enabled) {
      console.log('managed gitignore: disabled by manifest');
      process.exit(0);
    }
    const result = ensureManagedBlock(projectRoot);
    console.log(`managed gitignore: ${result}`);
    process.exit(0);
  } catch (err) {
    if (err?.code === 'UNSAFE_GITIGNORE_PATH') {
      console.error('error: UNSAFE_GITIGNORE_PATH — .gitignore escapes project root via symlink');
      process.exit(2);
    }
    if (err?.code === 'EACCES') {
      console.error('error: .gitignore is read-only');
      process.exit(1);
    }
    throw err;
  }
}
```

In `cli/index.mjs`, extend the `init` dispatcher (around line 1561) to recognize the `ensure-gitignore` sub-verb before the `prompt session-capture` branch:

```javascript
if (sub === 'ensure-gitignore') {
  const mod = await import('../lib/cli/init-ensure-gitignore.mjs');
  const projectRoot = process.cwd();
  const m = await (await import('../lib/manifest.mjs')).loadManifest(projectRoot).catch(() => null);
  await mod.run({ projectRoot, argv: process.argv.slice(4), manifest: m });
  return;
}
```

- [ ] **Verify test passes**

Run: `node --test tests/cli-init-ensure-gitignore.test.mjs`
Expected: PASS.

- [ ] **Commit**

```bash
git add lib/cli/init-ensure-gitignore.mjs cli/index.mjs tests/cli-init-ensure-gitignore.test.mjs
git commit -m "feat(setup): add adev init ensure-gitignore [--remove] sub-verb

Spec: .context-index/specs/features/setup/managed-gitignore-block.spec.md
Plan-task: 6"
```

---

### Task 7: Refactor `lib/prototype-server.mjs::ensureGitignore` [specialist: none]

**Charter capability:** Managed gitignore block (delegating call site)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2

**Files:**
- Modify: `lib/prototype-server.mjs:201-238` (replace the body of `ensureGitignore`)
- Modify: existing prototype-server test file(s) that exercise `ensureGitignore` (locate via `grep -rln "ensureGitignore" tests/`)

**Tests:** Reuse existing prototype-server test file; update assertions.

**Context to load:**
- `lib/prototype-server.mjs:200-240` (current implementation)
- `lib/cli/prototype.mjs:240-250` (call site — verify signature preserved)
- `lib/gitignore-installer.mjs::ensureManagedBlock` (Task 2)

- [ ] **Write failing test**

Update the existing prototype-server test asserting `ensureGitignore` behavior:

1. **Block delegation:** invoke `ensureGitignore(tmpRoot)` → assert `.gitignore` now contains `# >>> adev:gitignore >>>` (not just `.adev/`).
2. **Force-install (SA-4):** invoke `ensureGitignore(tmpRoot)` when `manifest.yaml` contains `setup.managed_gitignore: false` → block STILL installed (prototype path force-installs, bypassing the manifest knob, because prototype boot specifically needs `.adev/` ignored).
3. **Idempotent:** second call returns the same state.

Mark the legacy "only appends `.adev/` line" expectation as removed.

- [ ] **Verify test fails**

Run: `node --test tests/lib/prototype-server.test.mjs` (or the actual file name).
Expected: FAIL — current implementation still does the lazy `.adev/` append.

- [ ] **Implement**

Replace `lib/prototype-server.mjs:201-238` (the `ensureGitignore` function body) with:

```javascript
/**
 * Ensure the managed adev:gitignore block (which includes `.adev/`) is
 * present in the project's `.gitignore`. Force-installs the block — does
 * NOT honor `setup.managed_gitignore: false` because the prototype workspace
 * specifically needs `.adev/` ignored to boot safely (SA-4).
 *
 * @param {string} projectRoot - Absolute path to the project root
 */
export function ensureGitignore(projectRoot) {
  // Local import to avoid circular module-load cost on cold prototype-server start.
  const { ensureManagedBlock } = require('./gitignore-installer.mjs');
  ensureManagedBlock(projectRoot);
}
```

Note: this file is ESM, so `require` is unavailable. Convert to top-of-file `import { ensureManagedBlock } from './gitignore-installer.mjs';` and reduce `ensureGitignore` to a one-liner:

```javascript
import { ensureManagedBlock } from './gitignore-installer.mjs';
// …
export function ensureGitignore(projectRoot) {
  ensureManagedBlock(projectRoot);
}
```

Remove the now-unused `readGitignore` / `appendFileSync` imports from this file if no other callers remain.

- [ ] **Verify test passes**

Run: `node --test tests/lib/prototype-server.test.mjs`
Expected: PASS.

- [ ] **Commit**

```bash
git add lib/prototype-server.mjs tests/lib/prototype-server.test.mjs
git commit -m "refactor(setup): delegate prototype-server ensureGitignore to managed block

Spec: .context-index/specs/features/setup/managed-gitignore-block.spec.md
Plan-task: 7"
```

---

### Task 8: Re-baseline this repo's `.gitignore` [specialist: none]

**Charter capability:** Managed gitignore block (dogfood)
**Strategy:** dogfood (source: detected, confidence: medium — this task modifies repo state to make Task 4's test pass; it is not itself a test-driven authoring step)
**Depends on:** Tasks 2, 6

**Files:**
- Modify: `.gitignore` (this repo)

**Tests:** Task 4's `tests/lib/gitignore-paths-dogfood.test.mjs` is the assertion vector.

**Context to load:**
- This repo's current `.gitignore` (read at task time — preserve all non-managed lines)
- `lib/gitignore-installer.mjs::ensureManagedBlock` (Task 2)

- [ ] **Write failing test**

No new test — Task 4's dogfood test is the gating assertion. Confirm it currently FAILs before this task runs.

Run: `node --test tests/lib/gitignore-paths-dogfood.test.mjs`
Expected (pre-task-8): FAIL — the repo `.gitignore` does not yet carry the canonical block.

- [ ] **Verify test fails**

Same as above.

- [ ] **Implement**

Run `node cli/index.mjs init ensure-gitignore` in this repo to install the block via the sub-verb (Task 6). Manual sanity-review the resulting `.gitignore` diff:

- All non-managed lines (including the existing `# >>> adev:session-capture-gitignore >>>` block, the `node_modules/`, `.DS_Store`, etc.) survive byte-for-byte.
- The new `# >>> adev:gitignore >>>` block is appended (or replaces any pre-existing managed block).
- File ends with a single trailing newline.

If the dogfood diff is surprising (e.g., the installer collapses existing duplicated patterns), capture the rationale in the commit message rather than hand-editing the file — the goal is to dogfood the installer, not curate around it.

- [ ] **Verify test passes**

Run: `node --test tests/lib/gitignore-paths-dogfood.test.mjs`
Expected: PASS.

- [ ] **Commit**

```bash
git add .gitignore
git commit -m "chore(setup): re-baseline .gitignore via adev init ensure-gitignore

Dogfoods the managed-gitignore-block installer on the plugin repo itself.
Preserves all non-managed user lines including the separately-owned
adev:session-capture-gitignore block.

Spec: .context-index/specs/features/setup/managed-gitignore-block.spec.md
Plan-task: 8"
```

---

### Task 9: Fix stale "5 ephemeral paths" claim in `docs/hooks.md` [specialist: none]

**Charter capability:** Managed gitignore block (documentation)
**Strategy:** docs (source: detected, confidence: high)
**Depends on:** Task 1

**Files:**
- Modify: `docs/hooks.md` (two adjacent occurrences around lines 354 and 358)

**Tests:** None (docs-only); covered indirectly by `/adev:hygiene` doc-drift detection.

**Context to load:**
- `docs/hooks.md:350-365` (both stale occurrences)
- `lib/gitignore-paths.mjs` (Task 1 output — for an accurate description of what's now in the block)

- [ ] **Write failing test**

No automated test. Manual review checklist: grep `docs/hooks.md` for `5 ephemeral paths` post-edit; assert zero matches.

- [ ] **Verify test fails**

Run: `grep -c "5 ephemeral paths" docs/hooks.md`
Expected pre-fix: `2`.

- [ ] **Implement**

Rewrite both occurrences (lines 354 and ~358-365) to read approximately:

```
| Are they tracked content? | **Yes** by default. The installer's
`adev:gitignore` block lists 18 ephemeral paths (see
`lib/gitignore-paths.mjs` for the canonical list) but **does not**
include `.context-index/sessions/`. So `git status` will show those
session files after each commit. |
```

If the surrounding paragraph also enumerates the old 5-name list (`hygiene/`, `.token-cursor.json`, `.reminder-counter`, `.session-tracking.jsonl`, `user-config`), replace the enumeration with the pointer to `lib/gitignore-paths.mjs` rather than re-enumerating all 18 paths inline (the canonical list is the source of truth; documentation should not duplicate it).

- [ ] **Verify test passes**

Run: `grep -c "5 ephemeral paths" docs/hooks.md`
Expected: `0`.

- [ ] **Commit**

```bash
git add docs/hooks.md
git commit -m "docs(hooks): fix stale 5-paths claim; point to lib/gitignore-paths.mjs

Spec: .context-index/specs/features/setup/managed-gitignore-block.spec.md
Plan-task: 9"
```

---

### Task 9b: Paired amendment to `cross-cutting/incremental-artifact-writes.spec.md` [specialist: none]

**Charter capability:** Managed gitignore block (cross-cutting handoff per SA-5 / CON-4)
**Strategy:** docs (source: detected, confidence: high)
**Depends on:** Task 1

**Files:**
- Modify: `.context-index/specs/cross-cutting/incremental-artifact-writes.spec.md:236`

**Tests:** None (spec-text edit); will be picked up by `/adev:hygiene` cross-cutting consistency pass.

**Context to load:**
- `.context-index/specs/cross-cutting/incremental-artifact-writes.spec.md:230-245` (acceptance section context)

- [ ] **Write failing test**

No automated test. Manual check: grep for the phrase `CI gate or test fixture` in the file; post-edit must be replaced with the `adev:gitignore` block reference.

- [ ] **Verify test fails**

Run: `grep -c "CI gate or test fixture" .context-index/specs/cross-cutting/incremental-artifact-writes.spec.md`
Expected pre-fix: `1`.

- [ ] **Implement**

Replace the acceptance line at ~236 from:

```
- [ ] `*.partial` and `*.partial.lock` patterns in repo-wide `.gitignore`. CI gate or test fixture verifies.
```

To:

```
- [ ] `*.partial` and `*.partial.lock` patterns in repo-wide `.gitignore`. Enforced by the `adev:gitignore` managed block (`lib/gitignore-paths.mjs`); the dogfood parity test (`tests/lib/gitignore-paths-dogfood.test.mjs`) is the verification vector. See `setup/managed-gitignore-block.spec.md` for ownership.
```

Bump the cross-cutting spec's frontmatter `revision` field (`revision: N` → `revision: N+1`) and update `updated:` to today's date.

- [ ] **Verify test passes**

Run: `grep -c "CI gate or test fixture" .context-index/specs/cross-cutting/incremental-artifact-writes.spec.md`
Expected: `0`.

- [ ] **Commit**

```bash
git add .context-index/specs/cross-cutting/incremental-artifact-writes.spec.md
git commit -m "docs(spec): point incremental-artifact-writes:236 at managed-gitignore-block

Spec: .context-index/specs/features/setup/managed-gitignore-block.spec.md
Plan-task: 9b"
```

---

### Task 10: Documentation + manifest template [specialist: none]

**Charter capability:** Managed gitignore block (documentation)
**Strategy:** docs (source: detected, confidence: high)
**Depends on:** Tasks 5, 6

**Files:**
- Modify: `docs/configuration.md` (new "Managed gitignore block" section)
- Modify: `templates/manifest-template.yaml` (commented `setup.managed_gitignore: true` example)

**Tests:** None (docs + template). Indirectly covered by `/adev:hygiene` config-coverage audit.

**Context to load:**
- `docs/configuration.md` (full read — locate Setup-related section or end-of-file insertion point)
- `templates/manifest-template.yaml` (full read — for insertion order between existing namespaced blocks)
- `.context-index/manifest.yaml:217-225` (existing `integrations.session_capture` block — referenced for CON-2 namespace-rationale comparison)

- [ ] **Write failing test**

Manual review checklist:
1. `docs/configuration.md` contains a "Managed gitignore block" section.
2. The section documents: (a) what the block is, (b) the `setup.managed_gitignore: bool` knob with default `true`, (c) the CON-2 namespace rationale (`setup.*` vs `integrations.*`), (d) how `--remove` interacts with the knob (always bypasses).
3. `templates/manifest-template.yaml` contains a commented `setup:` block.

- [ ] **Verify test fails**

Run: `grep -c "Managed gitignore" docs/configuration.md`
Expected pre-fix: `0`.

- [ ] **Implement**

Add a section to `docs/configuration.md`:

```markdown
## Managed gitignore block (`setup.managed_gitignore`)

The `adev install` and `adev upgrade` flows maintain an idempotent
paired-marker `.gitignore` block (open/close: `# >>> adev:gitignore >>>` /
`# <<< adev:gitignore <<<`) that lists ephemeral adev artifacts which
should never be committed (lifecycle state, atomic-write temps, partial
writes, prototype workspace, etc.). The canonical path list lives in
`lib/gitignore-paths.mjs`.

### Knob

```yaml
setup:
  managed_gitignore: true  # default; set false to skip block writes
```

When `false`, both `adev install/upgrade` AND `adev init ensure-gitignore`
(write path) skip the block and emit the advisory:

```
managed gitignore: disabled by manifest
```

`adev init ensure-gitignore --remove` always bypasses the knob — operators
must still be able to remove a block they previously installed.

### Why `setup.*` and not `integrations.*`?

The sibling knob `integrations.session_capture.gitignored` lives under
`integrations.*` because it gates **runtime-feature install behavior** for
an opt-in integration. `setup.managed_gitignore` lives under `setup.*`
because it governs **scaffold-time install behavior** run at every
`adev install`. Different lifecycles → different namespaces.

### Manual operations

```bash
adev init ensure-gitignore           # install or refresh the block
adev init ensure-gitignore --remove  # excise the block
```

Spec: `.context-index/specs/features/setup/managed-gitignore-block.spec.md`
```

Add to `templates/manifest-template.yaml`:

```yaml
# ============================================================================
# Setup
# ============================================================================

# setup:
#   # When true (default), `adev install` and `adev upgrade` write/refresh
#   # an `adev:gitignore` paired-marker block in your project's .gitignore.
#   # See lib/gitignore-paths.mjs for the canonical path list.
#   # Set to false to opt out (existing blocks are preserved; run
#   # `adev init ensure-gitignore --remove` to remove an installed block).
#   managed_gitignore: true
```

Insert between an existing logical neighbor (e.g., between `project:` and `sync:` blocks, or just before `integrations:` — chooser at implement time based on the actual template ordering).

- [ ] **Verify test passes**

Run:
```bash
grep -c "Managed gitignore" docs/configuration.md          # → 1+
grep -c "managed_gitignore" templates/manifest-template.yaml  # → 1+
```

- [ ] **Commit**

```bash
git add docs/configuration.md templates/manifest-template.yaml
git commit -m "docs(setup): document setup.managed_gitignore knob and manifest template

Spec: .context-index/specs/features/setup/managed-gitignore-block.spec.md
Plan-task: 10"
```

---

## Quality Gates

After all tasks complete, `/adev:validate` verifies the full quality gate suite. Results land in `.validate.md`, not in this plan.

- Tests pass: `npm test`
- All 13 acceptance criteria from the spec satisfied:
  1. `MANAGED_GITIGNORE_PATHS` is the only path-list source (verified by grep — Task 4 dogfood test pins it).
  2. `ensureManagedBlock` twice → byte-identical noop (Task 3 idempotency test).
  3. User-authored lines preserved byte-for-byte (Task 3 preservation test).
  4. Creating from scratch yields `<block>\n` only (Task 3 no-file test).
  5. Drift case regenerates body only (Task 3 drift-regeneration test).
  6. Malformed-block repaired (Task 3 repair test).
  7. `adev init ensure-gitignore [--remove]` semantics (Task 6 sub-verb tests).
  8. `prototype-server::ensureGitignore` delegates (Task 7 delegation test).
  9. `setup.managed_gitignore: false` skips write + advisory; `--remove` still works (Tasks 5, 6).
  10. Repo dogfood block matches (Task 4 + Task 8).
  11. `docs/hooks.md` accurate (Task 9).
  12. `docs/configuration.md` documents the knob (Task 10).
  13. No new dependencies; `node:fs` + `node:path` only (Task 2 implementation; visible in source-manifest stamping).

- No new external dependencies (constitution Principle 1).
- All `.mjs` files; pure ESM (constitution Principle 3).
- No skill changes; no inline-Node patterns introduced (CLI driver surface charter).
- Cross-cutting handoff to `incremental-artifact-writes.spec.md` complete (Task 9b).

No `governance/gates.yaml` blocks were enumerated for the setup module beyond the constitution defaults; `npm test` is the operative gate.
