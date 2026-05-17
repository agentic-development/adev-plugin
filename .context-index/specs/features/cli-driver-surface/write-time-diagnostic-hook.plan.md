<!-- DO NOT EDIT statuses inline — see lifecycle log write-time-diagnostic-hook.jsonl -->
# Implementation Plan: Write-Time Diagnostic Hook

> **Methodology:** adev
> **Charter:** .context-index/specs/features/cli-driver-surface/charter.md (rev 3)
> **Spec:** .context-index/specs/features/cli-driver-surface/write-time-diagnostic-hook.spec.md (rev 2)
> **Review:** PASS (2026-05-14, fast re-review)
> **Platform:** Node.js (ESM, .mjs), node:test, zero external deps

**Goal:** Wire the diagnostic engine into `lib/lifecycle-state.mjs::appendEvent` so every JSONL write runs Tier-1 / event-impact diagnostics and tags or rejects the event per the `lifecycle.event_diagnostics: strict|tag|off` manifest knob. Default `tag` mode writes the event with `diagnostic_warnings: [<id>...]`; `strict` rejects on error-severity firings via `GateError`; `off` is the pre-spec baseline (no engine call).

**Architecture:** Minimal-surface extension of one existing function. `appendEvent` adds: (1) lazy memoized registry load via a module-level cache; (2) mode resolution from manifest with `tag` default + invalid-value fallback (one-time stderr warning); (3) for `tag`/`strict`, call `runDiagnostics({ tier: 1, scope: 'event-impact', event })`; (4) merge engine firings into `event.diagnostic_warnings` (dedupe + preserve caller-provided tags) for `tag`; (5) for `strict`, throw `GateError` on any error-severity firing *before* the file write; (6) for `off`, skip engine entirely. Engine errors (registry-load failure, runner crash) are logged to stderr (`[event-diagnostics]` prefix) and do not block the write in `tag`/`off`; in `strict` they propagate as `GateError`.

---

## File Structure

**Create:**
- `tests/lib/lifecycle-state-event-diagnostics.test.mjs` — covers all 10 behaviors × 3 modes (matrix) + all 7 error cases.

**Modify:**
- `lib/lifecycle-state.mjs::appendEvent` (lines 209-254) — engine integration.
- `lib/lifecycle-state.mjs` (top of file, near imports) — add lazy `loadDiagnosticsRegistry` memoization + `resolveEventDiagnosticsMode(manifest)` helper.
- `templates/manifest-template.yaml` — add commented section for `lifecycle.event_diagnostics: strict|tag|off`.
- Existing `appendEvent` test fixtures — add `event_diagnostics: off` to preserve baseline behavior in tests that don't exercise the hook directly.

**Reference (read, do not modify):**
- `lib/diagnostics/index.mjs` (from `diagnostic-registry` plan) — `runDiagnostics({...})` API.
- `lib/manifest.mjs::loadManifest` — for reading `manifest.lifecycle.event_diagnostics`.
- `lib/lifecycle-state.mjs:165-254` — current `normaliseEventInPlace` + `appendEvent` shape (the integration point).
- `write-time-diagnostic-hook.spec.md` rev 2 — Behaviors 1–10 + Error Cases (7 rows).

---

## Context Packets

### Task 1 Context (Engine integration in appendEvent)
- Spec: Behaviors 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 (full set)
- Source: `lib/lifecycle-state.mjs:209-254` (current `appendEvent`)
- API: `runDiagnostics({ projectRoot, spec, tier: 1, scope: 'event-impact', event })` returning `{ fired, skipped, errors }`
- AC: per-event overhead in `tag` mode <100 ms p99

### Task 2 Context (Mode resolver + invalid fallback)
- Spec: Behavior 9, Error Case row 1
- Source: existing `resolveGateMode(manifest)` in `lib/lifecycle-state.mjs` (similar pattern)

### Task 3 Context (Registry memoization)
- Reuse `loadRegistry(projectRoot)` from `lib/diagnostics/index.mjs` (registry plan Task 4)
- Memoize across `appendEvent` calls in the same process (no file-watch invalidation in this spec)

### Task 4 Context (diagnostic_warnings merge)
- Spec: Behavior 7 (preserve caller tags), Behavior 8 (registry-level errors → stderr only, NOT onto event)
- Simple dedupe: `[...new Set([...caller, ...fired.map(f => f.id)])]`

### Task 5 Context (Manifest knob documentation)
- File: `templates/manifest-template.yaml` (locate `lifecycle:` section if present, or append)
- Spec: Postcondition + AC

### Task 6 Context (Test matrix)
- Spec: 10 behaviors × 3 modes + 7 error cases
- Sample: existing `tests/lib/lifecycle-state.test.mjs` for `appendEvent` test pattern

### Task 7 Context (Migrate existing appendEvent tests)
- Grep: `grep -rn "appendEvent\|reportStep\|reportValidator\|reportReviewer\|reportPlanTask" tests/`
- Add `event_diagnostics: off` to test-fixture manifests so baseline tests stay deterministic

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 (all touching `lib/lifecycle-state.mjs`).
- Group B (after A): Task 5 (manifest template — different file).
- Group C (after A): Task 6 (new test file).
- Group D (after A): Task 7 (existing test migration).

A is the critical path. B, C, D run after A.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Engine integration in appendEvent | Medium | unit | — | 0 create, 1 modify |
| 2 | Mode resolver + invalid fallback | Small | unit | Task 1 | 0 create, 1 modify |
| 3 | Memoized registry loader | Small | unit | Task 1 | 0 create, 1 modify |
| 4 | diagnostic_warnings merge logic | Small | unit | Task 1 | 0 create, 1 modify |
| 5 | Document manifest knob | Small | unit | Task 1 | 0 create, 1 modify |
| 6 | Mode × behavior test matrix | Large | unit | Tasks 1–4 | 1 create, 0 modify |
| 7 | Migrate existing appendEvent tests | Medium | unit | Task 1 | 0 create, N modify |

---

## Test Infrastructure Requirements

None. All tests use `node:test` with temp-project fixtures. Engine is in-process (no external systems).

---

### Task 1: Engine integration in appendEvent [specialist: none]

**Charter capability:** Write-time Tier-1 hook in `appendEvent`
**Strategy:** unit
**Files:**
- Modify: `lib/lifecycle-state.mjs::appendEvent` (lines 209-254)

**Implementation outline:**

```javascript
export function appendEvent(projectRoot, specPath, event) {
  normaliseEventInPlace(event);

  // ── Resolve mode (Task 2) ──
  const manifest = loadManifestSafe(projectRoot);
  const mode = resolveEventDiagnosticsMode(manifest); // 'strict' | 'tag' | 'off'

  if (mode !== 'off') {
    // ── Run engine (Task 3 + Task 4) ──
    let diagResult = null;
    try {
      diagResult = runDiagnosticsSync({
        projectRoot,
        spec: specPath,
        tier: 1,
        scope: 'event-impact',
        event,
      });
    } catch (err) {
      // Engine itself crashed unexpectedly (containment guard error, etc.)
      console.error(`[event-diagnostics] engine error: ${err.message}`);
      if (mode === 'strict') {
        throw mkGateError(`event-diagnostics engine error: ${err.message}`, ...);
      }
      // tag mode: proceed without tags
    }

    if (diagResult) {
      const errorFirings = diagResult.fired.filter(f => f.severity === 'error');
      if (mode === 'strict' && errorFirings.length > 0) {
        // Reject BEFORE write
        const msg = errorFirings.map(f => f.message).join('; ');
        throw mkGateError(`event blocked by Tier-1 diagnostics: ${msg}`, { mode: 'strict' });
      }
      if (mode === 'tag') {
        // Merge firings into event.diagnostic_warnings (Task 4)
        mergeDiagnosticWarnings(event, diagResult.fired);
      }
      // Registry-level errors → stderr only, never onto event (Behavior 8)
      for (const e of diagResult.errors ?? []) {
        console.error(`[event-diagnostics:registry-error] ${e.id}: ${e.message}`);
      }
      // Slow findings → stderr only (Behavior 10)
      for (const f of diagResult.fired) {
        if (f.id === 'adev/diagnostic-slow') {
          console.error(`[event-diagnostics:slow] ${f.message}`);
        }
      }
    }
  }

  // ── Existing write path (lines 211-253) ──
  // ... [unchanged]
}
```

Important details:
- The engine is called BEFORE the file write in all modes — this is what enables `strict` to reject without persisting.
- `runDiagnostics` is async; for the synchronous `appendEvent` signature to be preserved, either (a) re-export a sync variant from the engine (if the engine internally is sync for Tier-1 — verify with the engine Task 4 sketch) OR (b) make `appendEvent` async. **Coordination note: this is a decision point that may require an amendment to either this plan or the engine plan.** The spec says "Tier-1 runners are synchronous-friendly per the engine spec performance budget," but the engine sketch uses `Promise.race` for timeout (which is async). One path: the engine exposes both `runDiagnostics()` (async) and `runDiagnosticsSync()` (Tier-1 only, no timeout, for the write-time path). Resolve during implementation kickoff.

- [ ] Decide async/sync question with the engine implementer.
- [ ] Write failing test (Task 6 covers).
- [ ] Implement.
- [ ] **Commit:** `feat(lib): integrate diagnostic engine into appendEvent`

---

### Task 2: Mode resolver + invalid fallback [specialist: none]

**Charter capability:** Manifest knob `lifecycle.event_diagnostics`
**Strategy:** unit
**Depends on:** Task 1
**Files:**
- Modify: `lib/lifecycle-state.mjs` (add `resolveEventDiagnosticsMode(manifest)` near other mode helpers)

**Implementation:**

```javascript
const VALID_EVENT_DIAGNOSTICS_MODES = new Set(['strict', 'tag', 'off']);
let _invalidModeWarned = false;

export function resolveEventDiagnosticsMode(manifest) {
  const raw = manifest?.lifecycle?.event_diagnostics ?? 'tag';
  if (!VALID_EVENT_DIAGNOSTICS_MODES.has(raw)) {
    if (!_invalidModeWarned) {
      console.error(`[event-diagnostics] unknown mode '${raw}'; defaulting to tag`);
      _invalidModeWarned = true;
    }
    return 'tag';
  }
  return raw;
}
```

- [ ] Tests in Task 6 cover invalid-mode fallback + default.
- [ ] Implement.
- [ ] **Commit:** `feat(lib): resolveEventDiagnosticsMode helper`

---

### Task 3: Memoized registry loader [specialist: none]

**Charter capability:** Write-time Tier-1 hook in `appendEvent` — performance
**Strategy:** unit
**Depends on:** Task 1
**Files:**
- Modify: `lib/lifecycle-state.mjs`

**Implementation:**

```javascript
let _registryCache = new Map();  // projectRoot → registry

function getRegistryCached(projectRoot) {
  if (!_registryCache.has(projectRoot)) {
    const { loadRegistry } = await import('./diagnostics/index.mjs');
    _registryCache.set(projectRoot, loadRegistry(projectRoot));
  }
  return _registryCache.get(projectRoot);
}
```

Note the async-import dynamic-import is fine for a one-time-per-process cost. After the first call per projectRoot, subsequent calls are O(1) Map lookups.

- [ ] Tests verify memoization (mock or spy on the underlying `loadRegistry` and assert one call across multiple `appendEvent` invocations).
- [ ] Implement.
- [ ] **Commit:** `feat(lib): memoize diagnostics registry per projectRoot`

---

### Task 4: diagnostic_warnings merge logic [specialist: none]

**Charter capability:** Write-time Tier-1 hook in `appendEvent` — output shape
**Strategy:** unit
**Depends on:** Task 1
**Files:**
- Modify: `lib/lifecycle-state.mjs`

**Implementation:**

```javascript
function mergeDiagnosticWarnings(event, fired) {
  const existing = Array.isArray(event.diagnostic_warnings) ? event.diagnostic_warnings : [];
  const ids = fired
    .filter(f => f.severity !== 'info')                          // info-severity NOT tagged (Behavior 10)
    .filter(f => f.id !== 'adev/diagnostic-slow')                // slow finding stderr-only
    .map(f => f.id);
  event.diagnostic_warnings = Array.from(new Set([...existing, ...ids]));
}
```

- [ ] Tests cover: empty caller array, pre-existing caller tags preserved, dedupe.
- [ ] Implement.
- [ ] **Commit:** `feat(lib): merge diagnostic firings into event.diagnostic_warnings`

---

### Task 5: Document manifest knob [specialist: none]

**Charter capability:** Manifest knob `lifecycle.event_diagnostics`
**Strategy:** unit
**Depends on:** Task 1
**Files:**
- Modify: `templates/manifest-template.yaml`

**Implementation:** add a commented section under `lifecycle:`:

```yaml
lifecycle:
  # gate_mode: strict   # existing — unchanged

  # Write-time diagnostics for lifecycle events. When set to:
  #   strict — event-impact diagnostics fire before writing; error-severity
  #            firings throw GateError, no file written.
  #   tag    — (default) event-impact diagnostics fire before writing;
  #            firings are tagged onto the event as diagnostic_warnings.
  #   off    — diagnostics engine not invoked. Pre-rev-2 baseline behavior.
  # event_diagnostics: tag
```

- [ ] Add the section.
- [ ] **Commit:** `docs(manifest): document lifecycle.event_diagnostics knob`

---

### Task 6: Mode × behavior test matrix [specialist: none]

**Charter capability:** Write-time Tier-1 hook in `appendEvent` — test discipline
**Strategy:** unit
**Depends on:** Tasks 1–4
**Files:**
- Create: `tests/lib/lifecycle-state-event-diagnostics.test.mjs`

**Test matrix (10 behaviors × 3 modes where applicable + 7 error cases):**

- **B1 (write + engine call):** `tag` mode → event written + diagnostics ran. `off` mode → event written, no engine call (assert via spy).
- **B2 (tag mode):** firings appear in `event.diagnostic_warnings`; return value `{ written: true, event, diagnostics }`.
- **B3 (strict mode error):** error-severity firing → `GateError` thrown, disk unchanged (assert file unchanged via stat).
- **B3 (strict mode success):** no error firings → write proceeds + tags applied for warnings.
- **B4 (off mode):** no engine call, baseline behavior preserved.
- **B5 (engine throws):** registry-load failure or runner crash → stderr log + write proceeds in `tag`/`off`; `GateError` in `strict`.
- **B6 (info/warning only):** `strict` does NOT block on warning/info; warning tags still applied.
- **B7 (preserve caller tags):** event pre-populated with `diagnostic_warnings: ['caller-tag']` → final result has `['caller-tag', ...fired-ids]` deduped.
- **B8 (registry errors → stderr only):** `runDiagnostics` returns `errors: [{ id, message }]` → not tagged onto event, only logged.
- **B9 (default mode):** no `event_diagnostics` field in manifest → `tag` used.
- **B10 (slow finding):** runner exceeds 200 ms → `adev/diagnostic-slow` info severity → stderr-only, not in `diagnostic_warnings`.

- **Error cases:**
  1. Invalid mode value → one-time stderr warning, `tag` fallback.
  2. Engine import fails → fall back to `off` for that call.
  3. Engine throws despite internal try/catch → propagate in strict; log + proceed in tag/off.
  4. Event missing required fields → `event-schema-valid` fires; `tag` writes with warning; `strict` throws.
  5. `runDiagnostics` returns runner-level errors → log with `[event-diagnostics:registry-error]` prefix.
  6. `strict` + error-severity firing → `GateError`, no write.
  7. `strict` + warning-only firings → write proceeds.

- **Performance:** `tag` mode 100 events → average per-event overhead <100 ms.

- [ ] Author the full matrix.
- [ ] Verify all PASS.
- [ ] **Commit:** `test(lib): event-diagnostics mode × behavior matrix`

---

### Task 7: Migrate existing appendEvent tests [specialist: none]

**Charter capability:** Write-time Tier-1 hook in `appendEvent` — backward compat
**Strategy:** unit
**Depends on:** Task 1
**Files:**
- Modify: tests that exercise `appendEvent` / `reportStep` / `reportValidator` etc. via temp manifests. Add `event_diagnostics: off` to those fixtures.

**Why:** existing tests don't expect engine firings. With the default mode `tag`, an existing test that writes a malformed event would suddenly see `diagnostic_warnings` appear. `off` mode preserves the pre-spec behavior for tests that aren't explicitly exercising the new hook.

- [ ] Grep: `grep -rn "appendEvent\|reportStep\|reportValidator\|reportReviewer\|reportPlanTask" tests/`
- [ ] For each test fixture that creates a temp manifest, add `lifecycle: { event_diagnostics: 'off' }` (or YAML equivalent).
- [ ] Run full test suite; verify no regressions.
- [ ] **Commit:** `test(lib): set event_diagnostics: off in baseline fixtures`

---

## Quality Gates

- `npm test` (full suite — baseline tests unchanged + new matrix tests pass)
- Manual: write a malformed event via inline node, assert it's tagged in `tag` mode and rejected in `strict` mode
- Performance: run `appendEvent` 100× in a tight loop, assert avg < 100 ms
- `/adev:validate --spec .context-index/specs/features/cli-driver-surface/write-time-diagnostic-hook.spec.md`
