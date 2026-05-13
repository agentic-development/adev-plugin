<!-- DO NOT EDIT statuses inline — see lifecycle log lifecycle-event-log.jsonl -->
# Implementation Plan: Lifecycle Event Log

> **Methodology:** adev
> **Charter:** .context-index/specs/features/agent-reliable-state-artifacts/charter.md
> **Spec:** .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md
> **Review:** PASS (2026-05-11, round 2 — 0 blockers, 0 warnings)
> **Platform:** Node.js, JavaScript ESM (`.mjs`), `node:test`, npm

**Goal:** Build `lib/lifecycle-state.mjs` — an append-only JSONL event log per spec, with write primitives, a state-projection fold, multi-actor severity-aware aggregation, and a `requireGate` enforcer that replaces filesystem-grep of `.review.md` frontmatter.

**Architecture:** A single passive library module under `lib/`, following the `lib/build-state.mjs` exemplar for slug derivation, project-root validation, and error-code shapes — but using `fs.appendFile` instead of atomic temp-then-rename, because the log is append-only. Severity resolution is a write-time, one-shot lookup against existing `lib/domains/domain-config.mjs` (no read-time domain config touch). The state projection is a pure reducer over the events array. The gate enforcer is stateless: callers pass `mode` explicitly, resolved once via a thin `resolveGateMode(manifest)` helper. No new dependencies — only `node:fs`, `node:path`, `node:crypto`.

---

## File Structure

**Create:**
- `lib/lifecycle-state.mjs` — Append-only event log lib (the module under spec)
- `tests/lib/lifecycle-state.test.mjs` — Unit tests for primitives, fold, gate
- `tests/lib/lifecycle-state-concurrent.test.mjs` — 100-process concurrent-write harness
- `tests/lib/lifecycle-state-crash.test.mjs` — Fault-injection (kill mid-write)
- `tests/lib/lifecycle-state-perf.test.mjs` — Performance assertions for `appendEvent` / `currentState` / `listLifecycleStates`
- `tests/lib/lifecycle-state-arch.test.mjs` — Architectural test: grep for non-`appendFile` writes to `lifecycle-state/`
- `tests/fixtures/lifecycle-state/concurrent-writer.mjs` — Child-process script for concurrent test
- `tests/fixtures/lifecycle-state/crash-writer.mjs` — Child-process script for crash test

**Modify:**
- `.context-index/manifest.yaml` — Document `lifecycle.gate_mode` knob (comment-form only; default behaviour is `strict` when absent)
- `templates/manifest.yaml` (only if present) — Mirror the new `lifecycle` block for new scaffolds

**Reference (read, do not modify):**
- `lib/build-state.mjs` — Slug derivation, project-root validation, error-code conventions, JSDoc shape
- `lib/domains/domain-config.mjs` — `loadDomainConfig(domain, type, repoRoot, pluginRoot)` signature for severity lookup
- `.context-index/samples/general-library-module-graph.md` — Pure-ESM module structure (single-purpose, named exports, JSDoc, Node-built-ins-only imports)
- `tests/lib/build-state.test.mjs` — Test layout, fixture patterns, `node:test` conventions

---

## Context Packets

> No `source-manifest:` block exists on this spec (the module is greenfield). Context packets are assembled from the charter Dependencies table, sibling spec source-manifests, and the orientation file per Step 5 guidance.

### Task 1 Context (Event Schema + Canonical Variants)
- Spec: lifecycle-event-log.spec.md — Behaviors lines 113–137, Acceptance Criteria 80–84
- Charter: charter.md — Domain Model → Entities (lines 79–101), Interface Contracts → Event schema (lines 212–228)
- Sample: `.context-index/samples/general-library-module-graph.md` — JSDoc shape, named-export module pattern

### Task 2 Context (`slugFromSpec` + path helpers + path-safety enforcement)
- Spec: lifecycle-event-log.spec.md — Path Safety section (lines 32–43), AC line 86, Error Cases lines 156–157, 169
- Reference: `lib/build-state.mjs:29-57` — existing `slugFromSpec` and `resolveStatePath` pattern
- Note: this task introduces the four-layer defense (resolve + containment + extension + slug allowlist)

### Task 3 Context (`ensureLifecycleState` / `hasLifecycleState`)
- Spec: lifecycle-event-log.spec.md — Acceptance Criteria (none directly), Behaviors line 114 (file creation on first write)
- Reference: `lib/build-state.mjs:65-77` — atomic write pattern (informational; not used here — we use append)

### Task 4 Context (`appendEvent` primitive)
- Spec: lifecycle-event-log.spec.md — Behaviors lines 113–115, AC line 81, Error Cases lines 151–158
- Charter: Quality Attributes (line 334) — `appendEvent` p99 < 5 ms
- Constraint: AC line 81 — only `fs.appendFile`/`O_APPEND` writes allowed (architectural test in Task 16)

### Task 5 Context (`readEvents` primitive)
- Spec: lifecycle-event-log.spec.md — Behaviors lines 116–117, Error Cases lines 159–160

### Task 6 Context (Severity-resolution helper, internal)
- Spec: lifecycle-event-log.spec.md — Behaviors line 118–119, AC line 88, Error Cases line 163
- Reference: `lib/domains/domain-config.mjs:36-50` — `loadDomainConfig(domain, type, repoRoot, pluginRoot)` signature
- Note: best-effort fallback to `severity: warning` + one-time `DOMAIN_CONFIG_DEGRADED` warning

### Task 7 Context (Convenience writers — `reportReviewer`/`reportValidator`/`reportStep`/`reportPlanTask`/`reportIntervention`)
- Spec: lifecycle-event-log.spec.md — Behaviors lines 118–119, 137, AC lines 80, 82, Error Cases lines 155, 161–163
- Cross-spec: `json-issue-board-adapter.spec.md` (granularity invariant — `reportPlanTask` is the canonical home of plan-task state)

### Task 8 Context (`currentState` fold — base reducer)
- Spec: lifecycle-event-log.spec.md — Behaviors lines 120, 135, AC lines 83, 90
- Note: Pure function; property-test for determinism (AC line 83)

### Task 9 Context (Aggregation algorithm — multi-actor severity rule)
- Spec: lifecycle-event-log.spec.md — Behaviors lines 121–132 (severity × verdict table), AC line 89
- Charter: charter.md — Domain Model line 88 (ActorReport.severity), Invariants line 123 (immutable severity)

### Task 10 Context (`requireGate` + `resolveGateMode`)
- Spec: lifecycle-event-log.spec.md — Behaviors line 133, AC line 85, Error Cases lines 165–167
- Charter: Manifest additions (lines 297–304) — `lifecycle.gate_mode: strict|advisory`

### Task 11 Context (`listLifecycleStates` aggregate)
- Spec: lifecycle-event-log.spec.md — AC line 91, Behaviors line 134, Error Cases line 168

### Task 12 Context (`filterEvents` predicate API)
- Spec: lifecycle-event-log.spec.md — Interface contract only (charter.md line 198)

### Task 13 Context (`renderMarkdown` stub)
- Spec: lifecycle-event-log.spec.md — AC line 101, Visual Expectations line 75
- Note: Stable signature; body returns deterministic placeholder. Full implementation deferred to `markdown-rendering-layer` sibling spec.

### Task 14 Context (Size caps — events, log file, notes)
- Spec: lifecycle-event-log.spec.md — AC line 87, Error Cases lines 153–155

### Task 15 Context (Crash-safety + concurrent-write harness)
- Spec: lifecycle-event-log.spec.md — AC lines 99–100, Behaviors lines 115–116
- Charter: Quality Attributes lines 337–338 (crash safety, concurrent-write — payloads ≤ PIPE_BUF ≈ 4 KB on macOS/Linux)

### Task 16 Context (Architectural test — append-only enforcement)
- Spec: lifecycle-event-log.spec.md — AC line 81, Error Cases line 170
- Charter: Quality Attributes line 342 (format invariant: append-only)

### Task 17 Context (Performance harness)
- Spec: lifecycle-event-log.spec.md — AC lines 95–98
- Charter: Quality Attributes lines 334–336

### Task 18 Context (Manifest schema doc)
- Charter: charter.md — Manifest additions (lines 297–304)
- Reference: `.context-index/manifest.yaml:135-140` — existing `tasks` block style

---

## Parallelization

- Group A (sequential — module core): Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 (shared file `lib/lifecycle-state.mjs`)
- Group B (sequential — projection): Task 8 → Task 9 (shared file; depends on Group A)
- Group C (depends on A, B): Task 10, Task 11, Task 12, Task 13 (touch `lib/lifecycle-state.mjs`; serialize among themselves)
- Group D (size caps): Task 14 (touches `lib/lifecycle-state.mjs`; runs after A)
- Group E (test harnesses, independent files): Task 15 (concurrent + crash), Task 17 (perf) — can run in parallel with each other once A is GREEN
- Group F (architectural test, standalone file): Task 16 — independent
- Group G (manifest doc, standalone file): Task 18 — independent

Groups E, F, G can run in parallel once Group A completes.

---

## Task Summary

| #  | Title                                        | Complexity | Strategy     | Depends On       | Files                  |
|----|----------------------------------------------|------------|--------------|------------------|------------------------|
| 1  | Event schema constants + canonical variants  | small      | unit         | —                | 1 create               |
| 2  | `slugFromSpec` + path-safety helpers         | small      | unit         | Task 1           | 0 create, 1 modify     |
| 3  | `ensureLifecycleState` / `hasLifecycleState` | small      | unit         | Task 2           | 0 create, 1 modify     |
| 4  | `appendEvent` primitive                      | small      | unit         | Task 2, Task 3   | 0 create, 1 modify     |
| 5  | `readEvents` primitive                       | small      | unit         | Task 2           | 0 create, 1 modify     |
| 6  | Severity-resolution helper (internal)        | medium     | unit         | Task 1           | 0 create, 1 modify     |
| 7  | Convenience writers (5 helpers)              | medium     | unit         | Task 4, Task 6   | 0 create, 1 modify     |
| 8  | `currentState` fold — base reducer           | medium     | unit         | Task 5           | 0 create, 1 modify     |
| 9  | Aggregation algorithm (severity × verdict)   | medium     | unit         | Task 8           | 0 create, 1 modify     |
| 10 | `requireGate` + `resolveGateMode`            | small      | unit         | Task 9           | 0 create, 1 modify     |
| 11 | `listLifecycleStates` aggregate              | small      | unit         | Task 8           | 0 create, 1 modify     |
| 12 | `filterEvents` predicate API                 | small      | unit         | Task 5           | 0 create, 1 modify     |
| 13 | `renderMarkdown` stub                        | small      | unit         | Task 8           | 0 create, 1 modify     |
| 14 | Size caps (event 1 MB, log 50 MB, notes 4 KB)| medium     | unit         | Task 4, Task 7   | 0 create, 1 modify     |
| 15 | Crash-safety + concurrent-write harnesses    | medium     | integration  | Task 4           | 4 create               |
| 16 | Architectural test (`appendFile`-only)       | small      | unit         | Task 4           | 1 create               |
| 17 | Performance harness                          | small      | unit         | Task 4, 8, 11    | 1 create               |
| 18 | Manifest schema doc (`lifecycle.gate_mode`)  | small      | unit         | Task 10          | 0 create, 1–2 modify   |

---

## Strategy Summary

| Strategy    | Tasks | Source    |
|-------------|-------|-----------|
| unit        | 17    | fallback  |
| integration | 1     | detected (high confidence — spawns child processes via `node:child_process`) |

All unit tasks use `node --test`. Task 15 spawns child processes that perform real filesystem operations against the host `tmp` directory; it remains hermetic (no network, no DB) but is classified `integration` because it requires concurrent OS-level processes and is sensitive to host filesystem semantics. Task 17 (performance) uses `process.hrtime.bigint()` in a single process against the host filesystem; classified `unit` because it neither spawns child processes nor depends on external infrastructure. CI runs it as part of the default suite with a generous margin on the published p99 targets.

---

## Test Infrastructure Requirements

> These requirements must be satisfied before integration/infrastructure tests can run.
> Tasks without these prerequisites will produce setup errors, not test failures.
> **Never record actual credential values in plan output or spec files — env var names only.**

> ⚠ Infrastructure requirements auto-detected with low confidence — review and confirm before proceeding. The spec has no `infra_requirements:` frontmatter; this section was derived from file-path globbing. All required infrastructure resolves to the **local Node runtime and host filesystem only**.

### External Systems

| System                  | Required By                          | Strategy     |
|-------------------------|--------------------------------------|--------------|
| Local filesystem (tmpdir) | Task 15 (concurrent + crash)       | integration  |
| Node `child_process`    | Task 15 (concurrent + crash)         | integration  |

No external services (no DB, no cloud APIs, no Storybook server). The test runner uses `os.tmpdir()` for ephemeral fixture directories and `child_process.spawn` / `fork` for parallel writers.

### Credentials / Environment Variables

None required. The library and its tests use only filesystem and process primitives.

### Pre-Provisioned State

- [x] Host writable `os.tmpdir()` (POSIX) — already standard on macOS, Linux, and CI runners
- [x] `node --test` available (standard Node ≥ 18.19)
- [x] Ability to `spawn`/`fork` ≥ 100 child processes (CI runners default to >> 100 fds; verify in tight containers)

### CI Configuration

These tests run as part of the default `npm test` suite — they do not require a separate `test:integration` script. However, the perf and concurrent harnesses are tagged so they can be skipped on resource-constrained runners via `--test-name-pattern`:

```bash
npm test                                        # full suite
node --test --test-name-pattern '^lifecycle'    # lib subset only
node --test --test-skip-pattern 'concurrent|perf' # skip heavy harnesses
```

### Unresolved Requirements

None — all infrastructure resolves to the local host.

---

## Heuristics

*(No heuristics retrieved for module `agent-reliable-state-artifacts`. Section omitted.)*

---

## Tasks

### Task 1: Event schema constants + canonical variants [specialist: none]

**Charter capability:** Lifecycle event log (canonical event schema)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/lifecycle-state.mjs`
- Test: `tests/lib/lifecycle-state.test.mjs`

**Tests:** `tests/lib/lifecycle-state.test.mjs` — new file; this task creates the first test case.

**Context to load:**
- Spec: lines 212–228 of `charter.md` (event schema canonical variants)
- Sample: `.context-index/samples/general-library-module-graph.md` (module structure)

- [x] **Write failing test** (`tests/lib/lifecycle-state.test.mjs`)

```javascript
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { CANONICAL_EVENTS } from '../../lib/lifecycle-state.mjs';

test('CANONICAL_EVENTS contains every documented variant', () => {
  for (const e of [
    'lifecycle_step', 'step_completed', 'step_failed',
    'reviewer_report', 'validator_report',
    'plan_task', 'debug_intervention', 'recovery_record', 'manual_override',
  ]) assert.ok(CANONICAL_EVENTS.has(e), `missing variant: ${e}`);
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/lifecycle-state.test.mjs`
Expected: FAIL — `Cannot find module '../../lib/lifecycle-state.mjs'`

- [x] **Implement** (`lib/lifecycle-state.mjs`)

Create the file with JSDoc module header (mirror `lib/build-state.mjs`'s shape) and export:

```javascript
export const CANONICAL_EVENTS = new Set([
  'lifecycle_step', 'step_completed', 'step_failed',
  'reviewer_report', 'validator_report',
  'plan_task', 'debug_intervention', 'recovery_record', 'manual_override',
]);
```

Also declare module-level constants that later tasks will use:
```javascript
const LIFECYCLE_STATE_DIR = '.context-index/lifecycle-state';
const SLUG_ALLOWLIST = /^[a-z0-9._-]+$/;
const MAX_EVENT_BYTES = 1_000_000;          // 1 MB
const MAX_LOG_BYTES   = 50 * 1024 * 1024;   // 50 MB
const MAX_NOTES_BYTES = 4096;               // 4 KB
```

- [x] **Verify test passes**

Run: `node --test tests/lib/lifecycle-state.test.mjs`
Expected: PASS

- [x] **Commit**

Branch (if not already created): `feat/agent-reliable-state-artifacts/lifecycle-event-log`

```bash
git add lib/lifecycle-state.mjs tests/lib/lifecycle-state.test.mjs
git commit -m "feat(agent-reliable-state-artifacts): seed lifecycle-state lib with canonical event set"
```

---

### Task 2: `slugFromSpec` + path-safety helpers [specialist: none]

**Charter capability:** Lifecycle event log (path safety)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/lifecycle-state.mjs` — add `slugFromSpec`, internal `resolveLogPath`, `validateProjectRoot`
- Test: `tests/lib/lifecycle-state.test.mjs` — extend

**Tests:** `tests/lib/lifecycle-state.test.mjs`

**Context to load:**
- Spec: Path Safety section (lines 32–43), Error Cases lines 156–157, 169
- Reference: `lib/build-state.mjs:29-57` (existing `slugFromSpec` shape)

**Depends on:** Task 1

- [x] **Write failing tests**

```javascript
import { slugFromSpec } from '../../lib/lifecycle-state.mjs';

test('slugFromSpec accepts a normal spec filename', () => {
  assert.equal(slugFromSpec('a/b/foo.spec.md'), 'foo');
});

test('slugFromSpec rejects path traversal (INVALID_SPEC_PATH)', () => {
  assert.throws(
    () => slugFromSpec('../../.bashrc.spec.md'),
    err => err.code === 'INVALID_SPEC_PATH'
  );
});

test('slugFromSpec rejects non-spec extension', () => {
  assert.throws(
    () => slugFromSpec('a/b/foo.md'),
    err => err.code === 'INVALID_SPEC_PATH'
  );
});

test('slugFromSpec rejects disallowed characters', () => {
  assert.throws(
    () => slugFromSpec('a/b/foo!.spec.md'),
    err => err.code === 'INVALID_SPEC_PATH'
  );
});
```

Also add an internal test for `validateProjectRoot` against a missing `manifest.yaml`:
```javascript
import { validateProjectRoot } from '../../lib/lifecycle-state.mjs';
test('validateProjectRoot throws INVALID_PROJECT_ROOT when manifest missing', async () => {
  const dir = await fsTmp();           // bare tmpdir, no .context-index
  assert.throws(() => validateProjectRoot(dir),
    err => err.code === 'INVALID_PROJECT_ROOT');
});
```

- [x] **Verify tests fail**

Run: `node --test tests/lib/lifecycle-state.test.mjs`
Expected: FAIL — `slugFromSpec is not a function` (or thrown shape mismatch).

- [x] **Implement** in `lib/lifecycle-state.mjs`

```javascript
import { resolve, sep, basename } from 'node:path';
import { existsSync } from 'node:fs';

const SLUG_ALLOWLIST = /^[a-z0-9._-]+$/;

export function slugFromSpec(specPath) {
  if (!specPath || typeof specPath !== 'string' || !specPath.endsWith('.spec.md')) {
    throw mkErr('INVALID_SPEC_PATH', `spec path must end with .spec.md: ${specPath}`);
  }
  const slug = basename(specPath).slice(0, -'.spec.md'.length).toLowerCase();
  if (!SLUG_ALLOWLIST.test(slug)) {
    throw mkErr('INVALID_SPEC_PATH', `slug "${slug}" contains characters outside [a-z0-9._-]+`);
  }
  return slug;
}

export function validateProjectRoot(projectRoot) {
  const resolved = resolve(projectRoot);
  if (!existsSync(`${resolved}${sep}.context-index${sep}manifest.yaml`)) {
    throw mkErr('INVALID_PROJECT_ROOT', `manifest.yaml missing at ${resolved}`);
  }
  return resolved;
}

function resolveLogPath(projectRoot, specPath) {
  const root = validateProjectRoot(projectRoot);
  // Layered defense: resolve absolute spec path and require containment in projectRoot
  const absSpec = resolve(root, specPath);
  if (!absSpec.startsWith(root + sep)) {
    throw mkErr('INVALID_SPEC_PATH', `spec resolves outside projectRoot: ${absSpec}`);
  }
  const slug = slugFromSpec(specPath);
  const logPath = resolve(root, '.context-index', 'lifecycle-state', `${slug}.jsonl`);
  const prefix = `${root}${sep}.context-index${sep}lifecycle-state${sep}`;
  if (!logPath.startsWith(prefix)) {
    throw mkErr('INVALID_SPEC_PATH', `log path escapes lifecycle-state/: ${logPath}`);
  }
  return logPath;
}

function mkErr(code, msg) { const e = new Error(msg); e.code = code; return e; }
```

- [x] **Verify tests pass**

Run: `node --test tests/lib/lifecycle-state.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/lifecycle-state.mjs tests/lib/lifecycle-state.test.mjs
git commit -m "feat(agent-reliable-state-artifacts): path-safety primitives for lifecycle-state"
```

---

### Task 3: `ensureLifecycleState` / `hasLifecycleState` [specialist: none]

**Charter capability:** Lifecycle event log (bootstrap helpers)
**Strategy:** unit
**Files:**
- Modify: `lib/lifecycle-state.mjs` — export `ensureLifecycleState`, `hasLifecycleState`
- Test: `tests/lib/lifecycle-state.test.mjs`

**Depends on:** Task 2

- [x] **Write failing tests** — `hasLifecycleState` is false on a fresh tmp project; after `ensureLifecycleState`, the file exists and `hasLifecycleState` is true; calling `ensureLifecycleState` twice is idempotent (file size unchanged).

- [x] **Verify tests fail.**

- [x] **Implement** — `ensureLifecycleState` calls `fs.mkdirSync(dirname(logPath), { recursive: true })` and `fs.openSync(logPath, 'a')` + `closeSync` (touch); `hasLifecycleState` returns `existsSync(logPath)`. Use `resolveLogPath` from Task 2.

- [x] **Verify tests pass.**

- [x] **Commit:** `feat(agent-reliable-state-artifacts): ensure/has lifecycle-state helpers`

---

### Task 4: `appendEvent` primitive [specialist: none]

**Charter capability:** Lifecycle event log (atomic-append primitive)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/lifecycle-state.mjs` — export `appendEvent`
- Test: `tests/lib/lifecycle-state.test.mjs`

**Depends on:** Task 2, Task 3

**Context to load:** Spec Behaviors lines 113–115, AC line 81, Error Cases lines 151–158.

- [x] **Write failing tests**

Cases:
1. Append one event → file contains one `\n`-terminated JSON line.
2. Append two events → file contains two lines, in order, each well-formed JSON.
3. Missing `event` field → throws `EVENT_SCHEMA_INVALID`.
4. Non-string `event` value → throws `EVENT_SCHEMA_INVALID`.
5. `ts` absent on call → event written with a stamped ISO-8601 `ts`.
6. Parent directory does not exist → directory + file are created and event lands.

```javascript
test('appendEvent writes one newline-terminated JSON line', async () => {
  const { root, spec } = await makeProject();
  appendEvent(root, spec, { event: 'lifecycle_step', step: 'specify', status: 'started' });
  const text = readFileSync(resolveLogPathForTest(root, spec), 'utf8');
  assert.equal(text.endsWith('\n'), true);
  const obj = JSON.parse(text.slice(0, -1));
  assert.equal(obj.event, 'lifecycle_step');
  assert.ok(obj.ts);                    // stamped
});
```

- [x] **Verify tests fail** — `appendEvent is not a function`.

- [x] **Implement** — Use `fs.appendFileSync(logPath, line, { flag: 'a' })`. `line` = `JSON.stringify(event) + '\n'`. Validate `event.event` is a non-empty string; stamp `ts` if absent. Throw `EVENT_SCHEMA_INVALID` on missing/invalid `event`. Wrap `fs` errors and surface `FS_ERROR` with the original message preserved.

- [x] **Verify tests pass.**

- [x] **Commit:** `feat(agent-reliable-state-artifacts): appendEvent primitive with O_APPEND semantics`

---

### Task 5: `readEvents` primitive [specialist: none]

**Charter capability:** Lifecycle event log (read primitive)
**Strategy:** unit
**Files:**
- Modify: `lib/lifecycle-state.mjs` — export `readEvents`
- Test: `tests/lib/lifecycle-state.test.mjs`

**Depends on:** Task 2

- [x] **Write failing tests**

Cases:
1. Missing file → returns `[]`, no throw.
2. Two events on disk → returns two parsed objects, in order.
3. Truncated final line (no trailing `\n`) → previous full lines returned, tail skipped silently.
4. Malformed interior line → that line skipped; warning emitted at most once; remaining events returned.

- [x] **Verify tests fail.**

- [x] **Implement** — Read file with `readFileSync(logPath, 'utf8')`; split on `\n`; for each non-empty token, `try { JSON.parse(token) } catch { continue }`. If the last token is non-empty and does not parse (truncated), drop it silently. Log a one-time `console.warn('MALFORMED_LINE_SKIPPED ...')` for interior failures; gate the warning behind a module-scoped `Set` of file paths already warned about. Return `[]` when file is missing (catch `ENOENT`).

- [x] **Verify tests pass.**

- [x] **Commit:** `feat(agent-reliable-state-artifacts): readEvents primitive with crash-tolerant tail`

---

### Task 6: Severity-resolution helper (internal) [specialist: none]

**Charter capability:** Severity stamping at write time
**Strategy:** unit
**Files:**
- Modify: `lib/lifecycle-state.mjs` — internal `resolveActorSeverity(domain, actorKind, actorName)`
- Test: `tests/lib/lifecycle-state.test.mjs`

**Depends on:** Task 1

**Context:** `lib/domains/domain-config.mjs:36-50` — `loadDomainConfig(domain, configType, repoRoot, pluginRoot)` returns parsed object or null. Configs: `reviewers` (object with `severity_cap` per reviewer) and `gates` (object with `severity` per gate id).

- [x] **Write failing tests**

Cases:
1. Known reviewer in `reviewers.yaml` → returns their `severity_cap`.
2. Unknown reviewer → returns `'warning'` and emits one-time `UNKNOWN_REVIEWER_DEFAULTED` warning.
3. `loadDomainConfig` throws → returns `'warning'` and emits one-time `DOMAIN_CONFIG_DEGRADED` warning.
4. Known validator (gate id) in `gates.yaml` → returns its `severity`.

- [x] **Verify tests fail.**

- [x] **Implement** — Wrap `loadDomainConfig` in try/catch. On throw, log `DOMAIN_CONFIG_DEGRADED` (once per file path), return `'warning'`. On null/missing actor, log `UNKNOWN_REVIEWER_DEFAULTED` / `UNKNOWN_VALIDATOR_DEFAULTED` (once per actor), return `'warning'`. Internal API only; not exported. Plumb domain resolution through caller-supplied `projectRoot`/`pluginRoot`; if `pluginRoot` is unavailable in the test environment, default to `null` and let `loadDomainConfig` fall back.

- [x] **Verify tests pass.**

- [x] **Commit:** `feat(agent-reliable-state-artifacts): severity-resolution helper with best-effort fallback`

---

### Task 7: Convenience writers (five helpers) [specialist: none]

**Charter capability:** Lifecycle event log (convenience writers)
**Strategy:** unit
**Files:**
- Modify: `lib/lifecycle-state.mjs` — export `reportReviewer`, `reportValidator`, `reportStep`, `reportPlanTask`, `reportIntervention`
- Test: `tests/lib/lifecycle-state.test.mjs`

**Depends on:** Task 4, Task 6

- [x] **Write failing tests**

Cases:
1. `reportReviewer({step, reviewer, verdict, notes})` → appends a `reviewer_report` event with stamped `severity`.
2. `reportValidator({step, validator, verdict})` → appends a `validator_report` event with stamped `severity`.
3. `reportStep({step, status, verdict})` → appends `lifecycle_step` or `step_completed`/`step_failed` based on `status`.
4. `reportPlanTask({plan, task_id, status})` → appends `plan_task` event.
5. `reportIntervention({kind, note})` → appends `debug_intervention` event.
6. Every actor write (`reportReviewer`/`reportValidator`) must end up with `severity` set on disk — schema-validation test over a multi-event fixture.

- [x] **Verify tests fail.**

- [x] **Implement** — Each function: build event payload, call `resolveActorSeverity` for actor events, stamp `severity`, then call `appendEvent`. `reportStep` chooses discriminator from `status` (`started` → `lifecycle_step`, `completed` → `step_completed`, `failed` → `step_failed`).

- [x] **Verify tests pass.**

- [x] **Commit:** `feat(agent-reliable-state-artifacts): convenience writers (reviewer/validator/step/plan_task/intervention)`

---

### Task 8: `currentState` fold — base reducer [specialist: none]

**Charter capability:** Lifecycle event log (state projection)
**Strategy:** unit
**Files:**
- Modify: `lib/lifecycle-state.mjs` — export `currentState`
- Test: `tests/lib/lifecycle-state.test.mjs`

**Depends on:** Task 5

- [x] **Write failing tests**

Cases:
1. Empty file → `{ spec, status: 'pending', currentStep: null, currentTask: null, steps: {}, planTasks: {}, interventions: [], unknownEvents: [], startedAt: null, updatedAt: null }`.
2. Lifecycle-step events transition `status` and `currentStep`.
3. Unknown `event` variants land in `unknownEvents[]` and are ignored by core projections.
4. Determinism property: same input → same output (idempotent re-fold).
5. All projection keys are camelCase (regex `/^[a-z][a-zA-Z0-9]*$/`).

- [x] **Verify tests fail.**

- [x] **Implement** — Pure reducer over events. Switch on `event.event`. Unknown variants → push to `unknownEvents`. Track `currentStep`, `currentTask`, `startedAt`/`updatedAt` from first/last event `ts`. Aggregation of step verdicts is left to Task 9 (this task fills `steps[step].reports[]` and leaves `verdict`/`status` derived later).

- [x] **Verify tests pass.**

- [x] **Commit:** `feat(agent-reliable-state-artifacts): currentState reducer + StateProjection camelCase shape`

---

### Task 9: Aggregation algorithm (severity × verdict) [specialist: none]

**Charter capability:** Lifecycle event log (multi-actor aggregation)
**Strategy:** unit
**Files:**
- Modify: `lib/lifecycle-state.mjs` — extend `currentState` to compute step `verdict` + `status` from accumulated reports
- Test: `tests/lib/lifecycle-state.test.mjs`

**Depends on:** Task 8

- [x] **Write failing tests**

Fixture-driven table tests covering each row of the spec's severity table (Behaviors lines 121–132):
| Worst FAIL severity | Expected verdict       | Expected status |
|---------------------|------------------------|-----------------|
| blocker             | FAIL                   | failed          |
| error               | FAIL                   | failed          |
| warning             | PASS_WITH_NOTES        | completed       |
| advisory            | PASS_WITH_NOTES        | completed       |
| no FAILs, ≥1 P_W_N  | PASS_WITH_NOTES        | completed       |
| all PASS            | PASS                   | completed       |

- [x] **Verify tests fail.**

- [x] **Implement** — After reducer runs, for each step iterate its `reports[]`. Find worst-severity FAIL (priority: blocker > error > warning > advisory). Apply table. If any explicit `step_completed`/`step_failed` event exists for the step, prefer the explicit event's `verdict` over the synthesized one but flag a discrepancy via `aggregated_from`.

- [x] **Verify tests pass.**

- [x] **Commit:** `feat(agent-reliable-state-artifacts): step verdict aggregation per severity table`

---

### Task 10: `requireGate` + `resolveGateMode` [specialist: none]

**Charter capability:** Lifecycle-state gates
**Strategy:** unit
**Files:**
- Modify: `lib/lifecycle-state.mjs` — export `requireGate(state, stepName, { mode })` and `resolveGateMode(manifest)`
- Test: `tests/lib/lifecycle-state.test.mjs`

**Depends on:** Task 9

- [x] **Write failing tests**

Cases:
1. Prior step missing + `mode: 'strict'` → throws `GateError` with `{requiredStep, currentStatus, mode}`.
2. Prior step missing + `mode: 'advisory'` → emits `console.warn`, returns normally.
3. Prior step `completed` + verdict `PASS` → no throw, no warn.
4. Prior step `completed` + verdict `PASS_WITH_NOTES` → no throw, no warn.
5. `resolveGateMode({ lifecycle: { gate_mode: 'advisory' } })` → `'advisory'`.
6. `resolveGateMode({})` → `'strict'` (default).
7. `resolveGateMode({ lifecycle: { gate_mode: 'bogus' } })` → returns `'strict'` and emits one-time `UNKNOWN_GATE_MODE_DEFAULTED` warning.

- [x] **Verify tests fail.**

- [x] **Implement** — `GateError extends Error` with `code: 'GATE_BLOCKED'`. `requireGate` looks up `state.steps[prior]`; if status ≠ `'completed'` or verdict ∉ {`PASS`, `PASS_WITH_NOTES`}, branch on mode. Step-ordering table: `specify → review → plan → route → implement → validate`. `resolveGateMode` reads `manifest?.lifecycle?.gate_mode`, validates, falls back to `strict`.

- [x] **Verify tests pass.**

- [x] **Commit:** `feat(agent-reliable-state-artifacts): requireGate + resolveGateMode`

---

### Task 11: `listLifecycleStates` aggregate [specialist: none]

**Charter capability:** `listLifecycleStates()` helper
**Strategy:** unit
**Files:**
- Modify: `lib/lifecycle-state.mjs` — export `listLifecycleStates`
- Test: `tests/lib/lifecycle-state.test.mjs`

**Depends on:** Task 8

- [x] **Write failing tests**

Cases:
1. Directory missing → returns `[]`.
2. Three `<slug>.jsonl` files → returns three entries with `{ spec, slug, status, currentStep, updated }`.
3. Malformed file mid-glob → that file is skipped with `MALFORMED_FILE_SKIPPED` warning; remaining entries returned.

- [x] **Verify tests fail.**

- [x] **Implement** — `fs.readdirSync(lifecycleStateDir, { withFileTypes: true })`; filter `.jsonl`; for each, derive `specPath` from slug (best-effort: store `spec` in the first event as a back-reference, or re-discover via charter manifest scan — start with reading `spec` from the first `lifecycle_step` event, fall back to `slug` only). Wrap each per-file fold in `try`; on error, log + continue.

- [x] **Verify tests pass.**

- [x] **Commit:** `feat(agent-reliable-state-artifacts): listLifecycleStates aggregate fold`

---

### Task 12: `filterEvents` predicate API [specialist: none]

**Charter capability:** Lifecycle event log (read API)
**Strategy:** unit
**Files:**
- Modify: `lib/lifecycle-state.mjs` — export `filterEvents`
- Test: `tests/lib/lifecycle-state.test.mjs`

**Depends on:** Task 5

- [x] **Write failing tests** — Predicate `(e) => e.event === 'plan_task'` returns only plan_task events. Empty predicate result returns `[]`. No side effects on the log.

- [x] **Verify tests fail.**

- [x] **Implement** — `function filterEvents(projectRoot, specPath, predicate) { return readEvents(projectRoot, specPath).filter(predicate); }`.

- [x] **Verify tests pass.**

- [x] **Commit:** `feat(agent-reliable-state-artifacts): filterEvents predicate API`

---

### Task 13: `renderMarkdown` stub [specialist: none]

**Charter capability:** Markdown rendering layer (stub only)
**Strategy:** unit
**Files:**
- Modify: `lib/lifecycle-state.mjs` — export `renderMarkdown(state)`
- Test: `tests/lib/lifecycle-state.test.mjs`

**Depends on:** Task 8

- [x] **Write failing tests** — `renderMarkdown(state)` returns a deterministic string containing the literal token `<!-- DO NOT EDIT — generated -->` and the projection's `spec` reference. Two calls with the same input produce byte-identical output.

- [x] **Verify tests fail.**

- [x] **Implement** — Return a placeholder string per the spec (AC line 101). Full body deferred to `markdown-rendering-layer` sibling spec.

```javascript
export function renderMarkdown(state) {
  return [
    `<!-- DO NOT EDIT — generated -->`,
    `# Lifecycle: ${state.spec ?? '(unknown)'}`,
    ``,
    `_Render pending (markdown-rendering-layer spec)._`,
    ``,
  ].join('\n');
}
```

- [x] **Verify tests pass.**

- [x] **Commit:** `feat(agent-reliable-state-artifacts): renderMarkdown stub with stable signature`

---

### Task 14: Size caps (event 1 MB, log 50 MB, notes 4 KB) [specialist: none]

**Charter capability:** Lifecycle event log (size caps)
**Strategy:** unit
**Files:**
- Modify: `lib/lifecycle-state.mjs` — enforce caps in `appendEvent` and convenience writers
- Test: `tests/lib/lifecycle-state.test.mjs`

**Depends on:** Task 4, Task 7

- [x] **Write failing tests**

Cases:
1. Event payload > 1 MB → throws `EVENT_TOO_LARGE`.
2. Log file already ≥ 50 MB → throws `LOG_TOO_LARGE`.
3. `notes` field > 4 KB → truncated to 4096 bytes with `…[truncated]` suffix; one-time `NOTES_TRUNCATED` warning; event still appends.

- [x] **Verify tests fail.**

- [x] **Implement** — Pre-stringify check in `appendEvent`: compute `Buffer.byteLength(line)`; throw `EVENT_TOO_LARGE` if > 1 MB. Stat the log file before appending; throw `LOG_TOO_LARGE` if `statSync(logPath).size >= 50 MB`. In `reportReviewer`/`reportValidator`, truncate `notes` and emit warning before delegating to `appendEvent`.

- [x] **Verify tests pass.**

- [x] **Commit:** `feat(agent-reliable-state-artifacts): size caps for events, log file, and notes`

---

### Task 15: Crash-safety + concurrent-write harnesses [specialist: none]

**Charter capability:** Quality Attributes — crash safety, concurrent write
**Strategy:** integration (source: detected, confidence: high — spawns child processes)
**Files:**
- Create: `tests/lib/lifecycle-state-concurrent.test.mjs`
- Create: `tests/lib/lifecycle-state-crash.test.mjs`
- Create: `tests/fixtures/lifecycle-state/concurrent-writer.mjs`
- Create: `tests/fixtures/lifecycle-state/crash-writer.mjs`

**Depends on:** Task 4

- [x] **Write failing tests**

Concurrent: parent spawns 100 children via `child_process.fork(concurrent-writer.mjs, [...])` each calling `appendEvent` with a unique payload (≤ PIPE_BUF ≈ 4 KB) on the same log. After all exit, the log must have exactly 100 well-formed lines, no interleaving, no truncation.

Crash: spawn a child that begins writing a giant event then `process.kill(child.pid, 'SIGKILL')` while it is mid-write. Then call `readEvents` — it must return every prior complete event and skip the truncated tail silently.

- [x] **Verify tests fail** (harness files reference yet-unwritten fixtures).

- [x] **Implement** — `concurrent-writer.mjs` reads `process.argv` for `projectRoot`, `specPath`, and a unique index, calls `appendEvent`, exits 0. `crash-writer.mjs` writes a 100 KB payload one byte at a time using a custom write loop (so SIGKILL lands mid-write); only used to simulate truncation — production code uses `appendFile`.

- [x] **Verify tests pass.**

- [x] **Commit:** `test(agent-reliable-state-artifacts): concurrent-write and crash-safety harnesses`

---

### Task 16: Architectural test (`appendFile`-only enforcement) [specialist: none]

**Charter capability:** Format invariant — append-only
**Strategy:** unit
**Files:**
- Create: `tests/lib/lifecycle-state-arch.test.mjs`

**Depends on:** Task 4

- [x] **Write failing test** — Reads `lib/lifecycle-state.mjs` source; greps for `writeFile`, `writeFileSync`, `createWriteStream` outside an allowed allowlist (the file must not contain any non-append write to a `<slug>.jsonl` path). Fails with `ARCH_VIOLATION_APPEND_ONLY` if any forbidden write primitive is found.

- [x] **Verify test fails** initially if the implementation contains, e.g., a stale `writeFileSync` import (it should not).

- [x] **Implement** — Test reads the lib source, runs a tokenizer-free regex scan, asserts only `appendFile`/`appendFileSync` are present.

- [x] **Verify test passes.**

- [x] **Commit:** `test(agent-reliable-state-artifacts): architectural test enforcing append-only writes`

---

### Task 17: Performance harness [specialist: none]

**Charter capability:** Quality Attributes — latency targets
**Strategy:** unit (single-process timing; no external infra)
**Files:**
- Create: `tests/lib/lifecycle-state-perf.test.mjs`

**Depends on:** Task 4, Task 8, Task 11

- [x] **Write failing tests**

Cases (using `process.hrtime.bigint()`):
1. `appendEvent` p99 < 5 ms over 1000 iterations.
2. `currentState` p99 < 5 ms at N=50, < 50 ms at N=1000.
3. `listLifecycleStates` p99 < 100 ms at 100 specs.

Wrap each in a generous CI margin (×3 of the published target) to avoid flakes on shared runners.

- [x] **Verify tests fail** if the lib does not yet export the relevant functions.

- [x] **Implement** — Build the synthetic fixtures inside the test using `os.tmpdir()`. Skip individual perf cases when `process.env.CI === '1'` and the runner reports `os.loadavg()[0] > 4` (defensive skip on overloaded runners).

- [x] **Verify tests pass.**

- [x] **Commit:** `test(agent-reliable-state-artifacts): perf harness for appendEvent / currentState / listLifecycleStates`

---

### Task 18: Manifest schema doc (`lifecycle.gate_mode`) [specialist: none]

**Charter capability:** Lifecycle-state gates (manifest knob)
**Strategy:** unit
**Files:**
- Modify: `.context-index/manifest.yaml` — add commented-out `lifecycle:` block documenting `gate_mode`
- Modify (if present): `templates/manifest.yaml` — same block for new scaffolds

**Depends on:** Task 10

- [x] **Write failing test** — `tests/lib/lifecycle-state.test.mjs` extension: parse the project's `manifest.yaml`; assert it contains the literal token `lifecycle.gate_mode` (in a comment or active block).

- [x] **Verify test fails.**

- [x] **Implement** — Add to `manifest.yaml`:

```yaml
# ============================================================================
# Lifecycle State
# ============================================================================

# Controls how requireGate behaves on a missing/failed prior step.
#   strict   — throw GateError (default)
#   advisory — emit console.warn and continue
# lifecycle:
#   gate_mode: strict
```

Mirror the block to `templates/manifest.yaml` if that template exists.

- [x] **Verify test passes.**

- [x] **Commit:** `docs(agent-reliable-state-artifacts): document lifecycle.gate_mode manifest knob`

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test` (gate id `test` from `governance/gates.yaml`)
- Coverage on `lib/lifecycle-state.mjs` ≥ 90% lines (AC line 94)
- No new dependencies in `package.json` (AC line 92)
- All files added under `lib/` and `tests/` are `.mjs` ESM (AC line 92)
- Every acceptance criterion in `lifecycle-event-log.spec.md` is mapped to at least one task

`governance/gates.yaml` declares only the `test` gate at tier `fast`. No `integration` or `e2e` gates are active in this repo. Probabilistic gates: none configured.
