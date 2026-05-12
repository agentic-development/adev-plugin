# Implementation Plan: Execution State Migration

> **Methodology:** adev
> **Charter:** .context-index/specs/features/agent-reliable-state-artifacts/charter.md
> **Spec:** .context-index/specs/features/agent-reliable-state-artifacts/execution-state-migration.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-11)
> **Platform:** Node.js (ESM, `.mjs`), node:test, bash

**Goal:** Migrate `.execution-state.md` (YAML + markdown) to `.execution-state.json`. Rewrite `lib/execution-state.mjs` to read/write JSON via atomic temp-then-rename. Replace inline YAML parsing in `hooks/session-start.sh` and `hooks/lifecycle-gate-bash.sh` with a single Node helper `hooks/_execution-state.mjs` supporting two modes (`read`, `resume-block`).

**Architecture:** `lib/execution-state.mjs` keeps its public API (`writeExecutionState`, `readExecutionState`, `clearExecutionState`) but its body is rewritten to use `JSON.stringify`/`JSON.parse` and the atomic-write pattern from `lib/build-state.mjs`. Path-containment defenses are upgraded to manifest-presence + realpath-prefix check. A new single-helper Node module (`hooks/_execution-state.mjs`) is invoked from the existing registered bash hooks via env-var-mode dispatch, preserving constitution Principle 4 (bash retains exit-code ownership and the hookSpecificOutput envelope).

---

## File Structure

**Create:**
- `hooks/_execution-state.mjs` — Single Node helper with `read` and `resume-block` modes
- `tests/lib/execution-state.test.mjs` — Rewritten / extended unit tests (JSON fixtures)
- `tests/hooks/execution-state-helper.test.mjs` — Helper subprocess contract test
- `tests/hooks/session-start-resume.test.mjs` — End-to-end resume-block integration test
- `tests/hooks/lifecycle-gate-status.test.mjs` — End-to-end gate status test

**Modify:**
- `lib/execution-state.mjs` — Replace YAML/markdown serialization with JSON; add path-containment defenses; 256 KB read cap
- `hooks/session-start.sh` — Replace inline YAML parser with `node hooks/_execution-state.mjs` invocation in `resume-block` mode (stderr discarded)
- `hooks/lifecycle-gate-bash.sh` — Replace `grep -E "^status:"` with helper invocation in `read` mode (stderr discarded)
- `.context-index/specs/features/agent-reliable-state-artifacts/charter.md` — Capability Map: `Execution state migration` → `planned`

**Reference (read, do not modify):**
- `lib/build-state.mjs::atomicWriteJson` — Atomic-write pattern reference
- `hooks/_lifecycle-gate-check-bash.mjs` — Existing Node-helper-invoked-from-bash precedent
- `hooks/_parse-stdin.sh` — Existing internal helper naming precedent
- `hooks/hooks.json` — Registered hook entry-point map (unchanged)
- `.context-index/samples/hook-sessionstart-session-start.md` — Session-start hook sample

---

## Context Packets

### Task 1 Context — `.execution-state.json` schema doc
- Spec: lines 86, 110-135 (AC), Naming Conventions section
- Source: `lib/execution-state.mjs` (current YAML/markdown serializer)

### Task 2 Context — Rewrite `lib/execution-state.mjs` core (JSON serialization)
- Spec: AC criteria on `writeExecutionState`, `readExecutionState`, idle-normalization, validation
- Source: `lib/execution-state.mjs` (full read), `lib/build-state.mjs::atomicWriteJson`

### Task 3 Context — Atomic-write integration
- Spec: AC on temp-then-rename, best-effort `fs.unlinkSync` cleanup
- Source: `lib/build-state.mjs::atomicWriteJson`

### Task 4 Context — Path-containment defenses (`INVALID_PROJECT_ROOT`, `INVALID_STORAGE_PATH`)
- Spec: Path Safety section items 1-3
- Source: sibling pattern in `lib/lifecycle-state.mjs`

### Task 5 Context — Read-tolerance + 256 KB size cap
- Spec: AC on `readExecutionState` returning `null` on errors; `STATE_FILE_TOO_LARGE` cap; review-rev-1 SEC-2

### Task 6 Context — `hooks/_execution-state.mjs` helper (both modes)
- Spec: AC on helper modes; single-helper design; Helper Stderr Discard contract (CON-4 SEC-4); field rendering safety (SEC-3)
- Source: `hooks/_lifecycle-gate-check-bash.mjs` (existing helper pattern)

### Task 7 Context — Field-rendering safety (newline-to-space, truncation)
- Spec: AC on field-rendering safety rules a-d (256 KB / newline / 4 KB / progress cap)

### Task 8 Context — `hooks/session-start.sh` refactor
- Spec: AC on session-start.sh; constitution Principle 4 hook ownership
- Source: `hooks/session-start.sh` (current inline `node -e` block)

### Task 9 Context — `hooks/lifecycle-gate-bash.sh` refactor
- Spec: AC on lifecycle-gate-bash.sh; preserved gate semantics
- Source: `hooks/lifecycle-gate-bash.sh` (current `grep -E "^status:"` block)

### Task 10 Context — Helper subprocess contract tests
- Spec: AC on helper modes; Postconditions on stdout shape
- Source: existing helper-test patterns in `tests/hooks/`

### Task 11 Context — End-to-end hook tests
- Spec: AC on byte-identical resume block and gate decision for each of four statuses
- Source: existing hook tests under `tests/hooks/`

### Task 12 Context — Architectural tests
- Spec: AC on no inline YAML parsing in hooks; no writes to `.execution-state.md`; `_render-resume-block.mjs` does not exist; helper stderr-discard grep
- Source: existing architectural-test patterns

---

## Heuristics

> Module-scope heuristics returned empty at plan time. `/adev:implement` reads from the live heuristic store at execution.

---

## Parallelization

- **Group A (sequential):** Task 1 → Task 2 → Task 3 → Task 4 → Task 5 (all modify `lib/execution-state.mjs`)
- **Group B (after Group A):** Task 6 → Task 7 (helper file; field-rendering safety folds into helper)
- **Group C (after Group B):** Tasks 8, 9 (shell refactors; both depend on helper existing)
- **Group D (after Group C):** Tasks 10, 11, 12 (tests; can run in parallel within the group since they touch different test files)

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Lock JSON schema + write fixtures | small | unit | — | 0 create, 0 modify (fixtures inline in tests) |
| 2 | Rewrite `lib/execution-state.mjs` JSON serialization | medium | unit | Task 1 | 0 create, 1 modify |
| 3 | Wire atomic temp-then-rename with cleanup-on-failure | small | unit | Task 2 | 0 create, 1 modify |
| 4 | Path-containment defenses (`projectRoot` + realpath) | small | unit | Task 2 | 0 create, 1 modify |
| 5 | Read tolerance + 256 KB cap (`STATE_FILE_TOO_LARGE`) | small | unit | Task 2 | 0 create, 1 modify |
| 6 | `hooks/_execution-state.mjs` skeleton + both modes | medium | unit | Task 5 | 1 create, 0 modify |
| 7 | Field-rendering safety in `resume-block` mode | small | unit | Task 6 | 0 create, 1 modify |
| 8 | Refactor `hooks/session-start.sh` to invoke helper | small | unit | Task 7 | 0 create, 1 modify |
| 9 | Refactor `hooks/lifecycle-gate-bash.sh` to invoke helper | small | unit | Task 6 | 0 create, 1 modify |
| 10 | Helper subprocess contract tests | small | unit | Task 7 | 1 create, 0 modify |
| 11 | Hook integration tests (4 status fixtures × 2 hooks) | medium | integration | Tasks 8, 9 | 2 create, 0 modify |
| 12 | Architectural tests (no inline parse, stderr discard, no `_render-resume-block.mjs`) | small | unit | Tasks 8, 9 | 0 create (inline in `tests/architectural.test.mjs` or extend) |

---

## Strategy Summary

| Strategy | Tasks | Source |
|----------|-------|--------|
| unit | 11 | fallback |
| integration | 1 | detected (high confidence — invokes bash hook scripts via child_process) |

---

## Test Infrastructure Requirements

> Task 11 is integration only because it spawns bash subprocesses to exercise the registered hook entry points. No external systems, no credentials.

### External Systems

| System | Required By | Strategy |
|--------|-------------|----------|
| bash + Node child process | Task 11 | integration |

No external services. All fixtures are local.

---

## Task 1: Lock `.execution-state.json` schema [specialist: none]

**Charter capability:** Execution state migration
**Strategy:** unit
**Files:** Fixtures embedded in `tests/lib/execution-state.test.mjs`

- [x] **Write failing test** — Test asserts the JSON schema shape `{ status, planRef, currentTask, issueBinding, blockers, nextAction, progress[], updated }`. Test fixture covers all four statuses (`idle`, `active`, `blocked`, `standalone`).
- [x] **Verify test fails** (`writeExecutionState` still emits YAML+markdown)
- [x] **Implement** — Fixture definitions only. No code changes yet; subsequent tasks implement the writer.
- [x] **Commit**

```bash
git checkout -b feat/agent-reliable-state-artifacts/execution-state-json
git add tests/lib/execution-state.test.mjs
git commit -m "test(execution-state): schema fixtures for .execution-state.json

Spec: .context-index/specs/features/agent-reliable-state-artifacts/execution-state-migration.spec.md
Plan-task: 1"
```

## Task 2: Rewrite `lib/execution-state.mjs` JSON serialization [specialist: none]

**Charter capability:** Execution state migration
**Strategy:** unit
**Depends on:** Task 1

- [x] **Write failing tests** — `writeExecutionState({...})` produces `.execution-state.json` with JSON content. `readExecutionState` parses it back to the in-memory shape. Idle-normalization preserved. Validation errors (`INVALID_STATUS`, `MISSING_PLAN_REF`, `MISSING_CURRENT_TASK`) preserved.
- [x] **Verify tests fail**
- [x] **Implement** — Replace YAML+markdown serializer with `JSON.stringify(state, null, 2) + "\n"`. Replace regex-frontmatter parser with `JSON.parse`. Preserve all validation, normalization, and `currentTask` numeric coercion.
- [x] **Drop `sanitizeField`** — YAML-specific escape no longer needed; JSON-encoding handles all cases.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 3: Atomic temp-then-rename + cleanup-on-failure [specialist: none]

**Charter capability:** Execution state migration
**Strategy:** unit
**Depends on:** Task 2

- [x] **Write failing tests** — Atomic-write fault injection: kill process between temp write and rename; assert prior content unchanged and temp file orphaned. Best-effort `fs.unlinkSync` on rename failure swallows cleanup errors.
- [x] **Verify tests fail**
- [x] **Implement** — Use temp path `<finalPath>.<crypto.randomBytes(4).toString('hex')>.tmp`; `fs.writeFileSync` to temp, then `fs.renameSync` onto target. Try/catch on rename: `fs.unlinkSync(tempPath)` swallowing errors, rethrow original.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 4: Path-containment defenses [specialist: none]

**Charter capability:** Execution state migration
**Strategy:** unit
**Depends on:** Task 2

- [x] **Write failing tests** — `projectRoot` missing `.context-index/manifest.yaml` → `INVALID_PROJECT_ROOT`. Crafted `projectRoot` whose realpath escapes the workspace → `INVALID_STORAGE_PATH`. Symlink-escape fixture: `.context-index/` symlink to a sibling → `INVALID_STORAGE_PATH`. Update existing test fixtures to materialize `manifest.yaml` in their temp roots (per AC).
- [x] **Verify tests fail**
- [x] **Implement** — `validateProjectRoot()`: `path.resolve` + `fs.existsSync(`.context-index/manifest.yaml`)`. State-path containment: realpath parent dir + `startsWith` check + basename equality. Strip the legacy `isAbsolute()` check.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 5: Read tolerance + 256 KB cap [specialist: none]

**Charter capability:** Execution state migration
**Strategy:** unit
**Depends on:** Task 2

- [x] **Write failing tests** — `readExecutionState` returns `null` on missing file, malformed JSON, truncated content. Oversized file (>256 KB) returns `null` and emits one-time `STATE_FILE_TOO_LARGE` console warning.
- [x] **Verify tests fail**
- [x] **Implement** — `fs.statSync(...).size` check before parsing. Try/catch around `JSON.parse` → returns `null`.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 6: `hooks/_execution-state.mjs` helper (both modes) [specialist: none]

**Charter capability:** Execution state migration
**Strategy:** unit
**Depends on:** Task 5

- [x] **Write failing tests** — Spawn helper as child process. `ADEV_EXECUTION_STATE_MODE=read` + valid `ADEV_CONTEXT_ROOT` → stdout is `JSON.stringify(state)`. Unset `ADEV_CONTEXT_ROOT` → stdout is `"null"` and exit 0. `ADEV_EXECUTION_STATE_MODE=resume-block` + valid state → stdout is resume-block markdown. Unknown `ADEV_EXECUTION_STATE_MODE` defaults to `resume-block`, emits stderr warning.
- [x] **Verify tests fail** (helper does not exist)
- [x] **Implement** — New file `hooks/_execution-state.mjs`. Reads env vars, calls `readExecutionState(projectRoot)`, dispatches to `read` or `resume-block` mode based on `ADEV_EXECUTION_STATE_MODE`. Exit 0 on success, exit 1 only on unhandled internal error (helper-bootstrap failure).
- [x] **Verify tests pass**
- [x] **Commit**

## Task 7: Field-rendering safety in `resume-block` mode [specialist: none]

**Charter capability:** Execution state migration
**Strategy:** unit
**Depends on:** Task 6

- [x] **Write failing tests** — Each rule independently:
  - Newline-to-space in `blockers`, `nextAction`, `currentTask` (single-line markdown slots)
  - `blockers` and `nextAction` truncated to 4 KB Unicode codepoints with `…[truncated]` marker
  - `progress[].task` truncated to 256 codepoints per entry
  - `progress[]` truncated to 100 entries with `…[N more]` trailing line
- [x] **Verify tests fail**
- [x] **Implement** — `escapeInlineField(value, capCodepoints)` helper inside the resume-block mode. Apply uniformly.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 8: Refactor `hooks/session-start.sh` to invoke helper [specialist: none]

**Charter capability:** Execution state migration
**Strategy:** unit
**Depends on:** Task 7

- [x] **Write failing test** — Integration test fixture: project with `.execution-state.json` in each status. Assert `session-start.sh` stdout includes the expected resume block (`active`/`blocked`) or empty (`idle`/`standalone`).
- [x] **Verify test fails** (still uses inline YAML)
- [x] **Implement** — Replace the inline `node -e` YAML parser block with: `RESUME_BLOCK=$(ADEV_CONTEXT_ROOT="$CONTEXT_ROOT" ADEV_EXECUTION_STATE_MODE=resume-block node "$PLUGIN_ROOT/hooks/_execution-state.mjs" 2>/dev/null || true)`. Preserve the rest of the hook envelope.
- [x] **Verify test passes**
- [x] **Commit**

## Task 9: Refactor `hooks/lifecycle-gate-bash.sh` to invoke helper [specialist: none]

**Charter capability:** Execution state migration
**Strategy:** unit
**Depends on:** Task 6

- [x] **Write failing test** — Fixture project with `.execution-state.json` in each status. Assert `lifecycle-gate-bash.sh` exit code matches today's behavior (`standalone`/`active` ⇒ 0; otherwise pass through to existing gate logic).
- [x] **Verify test fails**
- [x] **Implement** — Replace the `grep -E "^status:"` block with: `STATE_STATUS=$(ADEV_CONTEXT_ROOT="$CONTEXT_ROOT" ADEV_EXECUTION_STATE_MODE=read node "$PLUGIN_ROOT/hooks/_execution-state.mjs" 2>/dev/null | node -e '...status extraction...' || echo "")`. Per CON-4 SEC-4, stderr discarded.
- [x] **Verify test passes**
- [x] **Commit**

## Task 10: Helper subprocess contract tests [specialist: none]

**Charter capability:** Execution state migration
**Strategy:** unit
**Depends on:** Task 7
**Files:** Create `tests/hooks/execution-state-helper.test.mjs`

- [x] **Write tests** — `child_process.spawnSync` of the helper with crafted env vars across every documented edge case from the spec's Behaviors and Error Cases tables: missing file, malformed JSON, oversized state, unknown `ADEV_EXECUTION_STATE_MODE`, helper-bootstrap failure.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 11: Hook integration tests [specialist: none]

**Charter capability:** Execution state migration
**Strategy:** integration
**Depends on:** Tasks 8, 9
**Files:** Create `tests/hooks/session-start-resume.test.mjs`, `tests/hooks/lifecycle-gate-status.test.mjs`

- [x] **Write tests** — Spawn the bash scripts with `ADEV_CONTEXT_ROOT` pointing at fixture projects (one per status: `idle`, `active`, `blocked`, `standalone`). Assert stdout/exit code match the today-baseline byte-for-byte / value-for-value.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 12: Architectural tests [specialist: none]

**Charter capability:** Execution state migration
**Strategy:** unit
**Depends on:** Tasks 8, 9

- [x] **Write tests** — All CI-gate architectural assertions in one file:
  - `grep -rE "^---|match\(\/\^---" hooks/*.sh` returns empty (no inline YAML)
  - `grep -rE "grep -E \"\\^status:\"" hooks/*.sh` returns empty (no inline gate parsing)
  - Every `node "$PLUGIN_ROOT/hooks/_execution-state.mjs"` line in `hooks/*.sh` is followed by `2>/dev/null`
  - `fs.existsSync('hooks/_render-resume-block.mjs')` returns `false` (single-helper design enforced)
  - `grep -r "\.execution-state\.md" lib/ hooks/` outside the migration-tool spec scope returns empty (no writes to legacy path)
- [x] **Verify tests pass**
- [x] **Commit**

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies:

- `npm test` green
- No new dependencies in `package.json`
- All files are `.mjs` ESM (or `.sh` for hooks)
- Test coverage ≥ 90% lines on `lib/execution-state.mjs` and `hooks/_execution-state.mjs`
- All AC criteria satisfied
- `hooks/hooks.json` registration map unchanged
- No constitutional violations
