# Implementation Plan: JSONL Drift Events

> **Methodology:** adev
> **Charter:** .context-index/specs/features/spec-drift-detection/charter.md (rev 2)
> **Spec:** .context-index/specs/features/spec-drift-detection/jsonl-drift-events.spec.md (rev 2, review-passed)
> **Review:** PASS_WITH_NOTES (2026-05-18) — SEC-5/SEC-6 suggestions folded into Tasks 7 & 4
> **Platform:** Node.js (ESM, .mjs), node:test, zero external deps

**Goal:** Migrate the drift-detection signal from in-band YAML frontmatter (overwrite-only) to a split between an inline boolean `drift_detected: true` and append-only JSONL events `code_drift_detected` / `code_drift_cleared` in `.context-index/lifecycle-state/<spec-slug>.jsonl`. Eliminates spurious merge conflicts between concurrent stamps; preserves multi-source drift history.

**Architecture:** Additive-first migration (7 steps from spec). New events are canonicalized in `lifecycle-event-log` first (Step 0). `stampDrift`/`clearDrift` gain JSONL emission while keeping legacy writes (Step 1), then `verify check-drift` switches its read source (Step 2), then legacy writes are removed (Step 3), then a one-shot script drains existing frontmatter into JSONL (Step 4), then charter + skill prose catch up (Steps 5–6). Each task leaves the system in a working state.

---

## File Structure

**Create:**
- `scripts/migrate-drift-fields.mjs` — One-shot migration tool (Task 7)
- `tests/integration/spec-drift-no-merge-conflict.test.mjs` — Headline acceptance: two-branch concurrent stamp merges cleanly (Task 11)

**Modify:**
- `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` — Add canonical `code_drift_detected` / `code_drift_cleared` event-variant rows (Task 1)
- `lib/spec-drift.mjs:124-148` — `stampDrift` gains canonicalization + JSONL append (Task 2); `clearDrift` gains JSONL append (Task 3); legacy frontmatter writes removed (Task 6)
- `lib/cli/verify.mjs:133-156` — `check-drift` sources `drift_source`/`drift_at` from JSONL with legacy fallback (Task 5)
- `tests/lib/spec-drift.test.mjs` — New cases for JSONL emission, canonicalization, traversal rejection, lock-scope, legacy fallback (Tasks 2–6)
- `tests/cli/verify.test.mjs` — New cases for verify check-drift JSONL sourcing + read-path performance (Task 5)
- `.context-index/specs/features/spec-drift-detection/charter.md` — Rev 2 → 3: rewrite Invariant 4, remove "Multi-file Drift Tracking" from Deferred, add to Capability Map (Task 9)
- `skills/validate/SKILL.md`, `skills/review-specs/SKILL.md`, `skills/plan/SKILL.md`, `skills/hygiene/SKILL.md` — Prose updates (Task 10)

**Reference (read, do not modify):**
- `lib/lifecycle-state.mjs` — Existing `appendEvent` / `withLock` API to reuse
- `hooks/sync-trigger.sh:72-102` — Existing caller of `stampDrift`; protocol unchanged
- `.context-index/adrs/0011-source-manifest-restamping-authority.md` — ADR coordination for Behavior 3b (only `/adev:implement` clears drift)

---

## Context Packets

### Task 1 Context (lifecycle-event-log canonical extension)
- Spec: `jsonl-drift-events.spec.md` § Migration Step 0
- Target spec: `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` (full read — adding canonical variants)
- Charter (parent): `agent-reliable-state-artifacts/charter.md` (capability: lifecycle event log)

### Task 2 Context (stampDrift JSONL emission)
- Spec: `jsonl-drift-events.spec.md` § Behavior 1, § Invariant 8, § Migration Step 1
- Source files: `lib/spec-drift.mjs` (full read — `stampDrift` at line 124), `lib/lifecycle-state.mjs` (signatures only — `appendEvent`, `withLock`)
- Test file: `tests/lib/spec-drift.test.mjs` (signatures only)

### Task 3 Context (clearDrift JSONL emission)
- Spec: `jsonl-drift-events.spec.md` § Behavior 3, § Migration Step 1
- Source files: `lib/spec-drift.mjs::clearDrift` at line 158
- Test file: `tests/lib/spec-drift.test.mjs`

### Task 4 Context (SEC-6 per-spec lock-scope test)
- Spec: `jsonl-drift-events.spec.md` § Invariant: SEC-6 lock-scope verification, Behavior 8 (no-conflict invariant)
- Source: `lib/lifecycle-state.mjs::withLock` (read full — confirm per-spec granularity)

### Task 5 Context (verify check-drift JSONL source + perf)
- Spec: `jsonl-drift-events.spec.md` § Behavior 5, § Quality Attributes (CON-5 performance), § Migration Step 2
- Source files: `lib/cli/verify.mjs:133-156` (full read), `lib/spec-drift.mjs::hasDrift`, `lib/lifecycle-state.mjs` (event-reading helpers)
- Existing tests: `tests/cli/verify.test.mjs` if present (signatures only)

### Task 6 Context (stop frontmatter writes)
- Spec: `jsonl-drift-events.spec.md` § Migration Step 3
- Source: `lib/spec-drift.mjs::stampDrift` (Task 2 output) and `clearDrift` (Task 3 output)

### Task 7 Context (migration script)
- Spec: `jsonl-drift-events.spec.md` § Migration Step 4 (full read — idempotency rules), § Error Cases (legacy frontmatter validation, traversal rejection), § Behavior 6/7
- Source: `lib/spec-drift.mjs` (post-Task 6), `lib/lifecycle-state.mjs::withLock` and `appendEvent`

### Task 8 Context (run migration)
- Output of Task 7
- All `.context-index/specs/**/*.spec.md` files containing `drift_source:` or `drift_at:` in frontmatter

### Task 9 Context (charter rev 3)
- Spec: `jsonl-drift-events.spec.md` § Migration Step 5
- Target: `.context-index/specs/features/spec-drift-detection/charter.md` (full read — Invariants, Capability Map, Deferred Capabilities tables)

### Task 10 Context (skill prose updates)
- Spec: `jsonl-drift-events.spec.md` § Migration Step 6
- Targets: `skills/validate/SKILL.md`, `skills/review-specs/SKILL.md`, `skills/plan/SKILL.md`, `skills/hygiene/SKILL.md` — grep for `drift_detected`, `drift_source`, `drift_at`

### Task 11 Context (integration test)
- Spec: `jsonl-drift-events.spec.md` § Behavior 8, § Acceptance criterion "two demo branches"
- Source: `lib/spec-drift.mjs` (post-Task 8 — final form)

---

## Parallelization

- **Group A (sequential foundation):** Task 1 → Task 2 → Task 3
- **Group B (independent test):** Task 4 (per-spec lock-scope) — runs after Task 1, no file overlap with A
- **Group C (reader switch):** Task 5 — depends on Tasks 2 & 3 (events must exist)
- **Group D (destructive cleanup):** Task 6 → Task 7 → Task 8 — depends on Tasks 2–5
- **Group E (markdown):** Task 9 + Task 10 — can run any time after Task 8
- **Group F (integration test):** Task 11 — depends on Tasks 2–6 (final code form)

Groups B can run in parallel with A. Group E can run in parallel with D after Task 6. Groups C, D, F are sequential after their respective dependencies.

---

## Task Summary

| # | Migration Step | Title | Complexity | Strategy | Depends On | Files |
|---|---|-------|-----------|----------|------------|-------|
| 1 | Step 0 | Canonicalize `code_drift_detected` / `code_drift_cleared` in lifecycle-event-log | small | doc | — | 0 create, 1 modify |
| 2 | Step 1 (a) | `stampDrift` appends JSONL event + canonicalizes path | medium | unit | Task 1 | 0 create, 2 modify |
| 3 | Step 1 (b) | `clearDrift` appends `code_drift_cleared` event | small | unit | Task 2 | 0 create, 2 modify |
| 4 | Step 1 / SEC-6 | Per-spec lock-scope test (SEC-6) | small | unit | Task 1 | 0 create, 1 modify |
| 5 | Step 2 | `verify check-drift` sources from JSONL + read-path perf test (CON-5) | medium | unit | Task 2, Task 3 | 0 create, 2 modify |
| 6 | Step 3 | Stop writing `drift_source` / `drift_at` to frontmatter | small | unit | Task 5 | 0 create, 2 modify |
| 7 | Step 4 (code) | `scripts/migrate-drift-fields.mjs` with `--dry-run` (SEC-5), idempotency rules, traversal rejection (SEC-1), concurrent-race handling (SEC-3) | medium | unit | Task 6 | 1 create, 1 modify |
| 8 | Step 4 (exec) | Run migration over existing specs in repo (one-shot operational) | small | exec | Task 7 | 0 create, N modify |
| 9 | Step 5 | Charter rev 3: rewrite Invariant 4, remove Deferred row, add Capability Map row | small | doc | Task 8 | 0 create, 1 modify |
| 10 | Step 6 | Update skill prose mentions in validate/review-specs/plan/hygiene SKILL.md | small | doc | Task 8 | 0 create, 4 modify |
| 11 | Acceptance | **Headline acceptance test** (Behavior 8): two-branch concurrent stamp merges with zero conflicts | medium | integration | Task 6 | 1 create, 0 modify |

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

(Retrieved heuristics are general-purpose — token measurement and cache-context optimization — not directly applicable to this implementation. Loaded for awareness; no specific tasks gated on them.)

---

## Task 1: Canonicalize event variants in `lifecycle-event-log.spec.md` [specialist: none]

**Charter capability:** Multi-file Drift Tracking (promoted from Deferred in this rev)
**Strategy:** doc (markdown edit + spec re-review)
**Files:**
- Modify: `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` (extend canonical event-variant table)

**Tests:** `/adev:review-specs --spec .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` must pass after edit. (No code test; doc-strategy gates on review.)

**Context to load:** Task 1 Context packet.

- [ ] **Read current canonical event-variant table** in `lifecycle-event-log.spec.md`. Identify the table location and existing rows.

- [ ] **Add two rows to the canonical event-variant table:**
  - `code_drift_detected` — emitted by `lib/spec-drift.mjs::stampDrift`. Payload: `{ drift_source: <canonical relative path>, drift_at: <ISO timestamp> }`. Non-step event; ad-hoc emission tied to source-manifest edits.
  - `code_drift_cleared` — emitted by `lib/spec-drift.mjs::clearDrift`. Payload: `{ drift_at: <ISO timestamp> }`. Marks the previous `code_drift_detected` events as resolved.

- [ ] **Bump `lifecycle-event-log.spec.md` revision** (e.g., rev N → N+1) and add a revision history entry.

- [ ] **Re-run `/adev:review-specs --spec <lifecycle-event-log path>`.** Expected: PASS or PASS_WITH_NOTES.

- [ ] **Commit**

Branch: `feat/spec-drift-detection/jsonl-drift-events`

```bash
git add .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md \
        .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.review.md
git commit -m "feat(spec-drift-detection): canonicalize code_drift_detected/code_drift_cleared in lifecycle-event-log

Spec: .context-index/specs/features/spec-drift-detection/jsonl-drift-events.spec.md
Plan-task: 1"
```

---

## Task 2: `stampDrift` appends JSONL event + canonicalizes path [specialist: none]

**Charter capability:** Drift Flag Stamping (revised semantics)
**Strategy:** unit
**Files:**
- Modify: `lib/spec-drift.mjs:124-148` (extend `stampDrift` body — additive, keep legacy writes)
- Modify: `tests/lib/spec-drift.test.mjs` (add new cases)
- Test: `tests/lib/spec-drift.test.mjs`

**Tests:** `tests/lib/spec-drift.test.mjs`

**Context to load:** Task 2 Context packet.

- [ ] **Write failing tests** in `tests/lib/spec-drift.test.mjs`:

```javascript
import { stampDrift } from '../../lib/spec-drift.mjs';
import { readEvents } from '../../lib/lifecycle-state.mjs';
// fixtures: createTempSpec, cleanup

it('stampDrift appends a code_drift_detected event to the spec JSONL', async () => {
  const specPath = await createTempSpec({ slug: 'fx-spec', sourceManifestFiles: ['lib/foo.mjs'] });
  await stampDrift(specPath, 'lib/foo.mjs');
  const events = await readEvents(specPath);
  const drift = events.filter(e => e.event === 'code_drift_detected');
  assert.equal(drift.length, 1);
  assert.equal(drift[0].drift_source, 'lib/foo.mjs');
  assert.match(drift[0].drift_at, /^\d{4}-\d{2}-\d{2}T/);
});

it('stampDrift canonicalizes a non-canonical driftSource path', async () => {
  const specPath = await createTempSpec({ slug: 'fx-spec', sourceManifestFiles: ['lib/foo.mjs'] });
  await stampDrift(specPath, 'lib/bar/../foo.mjs');
  const events = await readEvents(specPath);
  assert.equal(events.at(-1).drift_source, 'lib/foo.mjs');
});

it('stampDrift rejects a driftSource that resolves outside projectRoot', async () => {
  const specPath = await createTempSpec({ slug: 'fx-spec', sourceManifestFiles: ['lib/foo.mjs'] });
  await assert.rejects(
    () => stampDrift(specPath, '../../etc/passwd'),
    err => err.code === 'PATH_TRAVERSAL_REJECTED'
  );
  const events = await readEvents(specPath);
  assert.equal(events.filter(e => e.event === 'code_drift_detected').length, 0);
});

it('stampDrift records multiple sources as separate events (multi-source history)', async () => {
  const specPath = await createTempSpec({ slug: 'fx-spec', sourceManifestFiles: ['a.mjs','b.mjs','c.mjs'] });
  await stampDrift(specPath, 'a.mjs');
  await stampDrift(specPath, 'b.mjs');
  await stampDrift(specPath, 'c.mjs');
  const events = (await readEvents(specPath)).filter(e => e.event === 'code_drift_detected');
  assert.deepEqual(events.map(e => e.drift_source), ['a.mjs', 'b.mjs', 'c.mjs']);
});
```

- [ ] **Verify tests fail.** Run `node --test tests/lib/spec-drift.test.mjs`. Expected: all four new cases FAIL (`code_drift_detected` not emitted, no canonicalization, no PATH_TRAVERSAL_REJECTED).

- [ ] **Implement** in `lib/spec-drift.mjs::stampDrift`:

```javascript
import { resolve as resolvePath, relative } from 'node:path';
import { appendEvent } from './lifecycle-state.mjs';

export async function stampDrift(specPath, driftSource) {
  // Canonicalize driftSource — reject traversal escape (SEC-1)
  const projectRoot = process.cwd(); // resolveStorageRoot if available
  const absolute = resolvePath(projectRoot, driftSource);
  const canonical = relative(projectRoot, absolute);
  if (canonical.startsWith('..') || resolvePath(canonical).startsWith('..')) {
    const err = new Error(`PATH_TRAVERSAL_REJECTED: ${driftSource} resolves outside projectRoot`);
    err.code = 'PATH_TRAVERSAL_REJECTED';
    throw err;
  }

  // Append JSONL event (additive — frontmatter writes still happen for now)
  const driftAt = new Date().toISOString();
  await appendEvent(specPath, {
    event: 'code_drift_detected',
    drift_source: canonical,
    drift_at: driftAt,
  });

  // EXISTING frontmatter writes — keep them in Task 2; removed in Task 6
  // (existing strip-and-append logic stays here unchanged)
  ...
}
```

- [ ] **Verify tests pass.** `node --test tests/lib/spec-drift.test.mjs` — all four new cases PASS; all prior cases still PASS.

- [ ] **Commit**

```bash
git add lib/spec-drift.mjs tests/lib/spec-drift.test.mjs
git commit -m "feat(spec-drift-detection): stampDrift appends code_drift_detected event with canonicalized path

Spec: .context-index/specs/features/spec-drift-detection/jsonl-drift-events.spec.md
Plan-task: 2"
```

---

## Task 3: `clearDrift` appends `code_drift_cleared` event [specialist: none]

**Charter capability:** Drift Flag Clearing (revised semantics)
**Strategy:** unit
**Files:**
- Modify: `lib/spec-drift.mjs::clearDrift`
- Modify: `tests/lib/spec-drift.test.mjs`
- Test: `tests/lib/spec-drift.test.mjs`

**Tests:** `tests/lib/spec-drift.test.mjs`

**Context to load:** Task 3 Context packet.

- [ ] **Write failing test:**

```javascript
it('clearDrift appends a code_drift_cleared event AND removes inline boolean', async () => {
  const specPath = await createTempSpec({ slug: 'fx-spec', sourceManifestFiles: ['lib/foo.mjs'] });
  await stampDrift(specPath, 'lib/foo.mjs');
  await clearDrift(specPath);
  const events = await readEvents(specPath);
  const cleared = events.filter(e => e.event === 'code_drift_cleared');
  assert.equal(cleared.length, 1);
  assert.match(cleared[0].drift_at, /^\d{4}-\d{2}-\d{2}T/);
  // Inline boolean is removed
  const content = await readFile(specPath, 'utf-8');
  assert.doesNotMatch(content, /^drift_detected:/m);
});
```

- [ ] **Verify test fails.**

- [ ] **Implement** in `lib/spec-drift.mjs::clearDrift`:

```javascript
export async function clearDrift(specPath) {
  await appendEvent(specPath, {
    event: 'code_drift_cleared',
    drift_at: new Date().toISOString(),
  });
  // Existing frontmatter removal of drift_detected boolean stays
  // (removal of drift_source/drift_at strip happens in Task 6)
  ...
}
```

- [ ] **Verify test passes.** All prior cases still pass.

- [ ] **Commit**

```bash
git add lib/spec-drift.mjs tests/lib/spec-drift.test.mjs
git commit -m "feat(spec-drift-detection): clearDrift appends code_drift_cleared event

Spec: .context-index/specs/features/spec-drift-detection/jsonl-drift-events.spec.md
Plan-task: 3"
```

---

## Task 4: SEC-6 per-spec lock-scope verification test [specialist: none]

**Charter capability:** Drift Flag Stamping (lock discipline)
**Strategy:** unit
**Files:**
- Modify: `tests/lib/spec-drift.test.mjs` (add concurrency test only — no source changes)
- Test: `tests/lib/spec-drift.test.mjs`

**Tests:** `tests/lib/spec-drift.test.mjs`

**Context to load:** Task 4 Context packet.

> Per the review SEC-6: confirm that `lib/lifecycle-state.mjs::withLock` is per-spec scoped (not global). Concurrent `stampDrift` calls on DIFFERENT specs must proceed in parallel.

- [ ] **Write failing test (or confirm passing):**

```javascript
it('concurrent stampDrift calls on different specs proceed in parallel (per-spec lock)', async () => {
  const specA = await createTempSpec({ slug: 'spec-a', sourceManifestFiles: ['lib/a.mjs'] });
  const specB = await createTempSpec({ slug: 'spec-b', sourceManifestFiles: ['lib/b.mjs'] });
  const start = Date.now();
  await Promise.all([
    stampDrift(specA, 'lib/a.mjs'),
    stampDrift(specB, 'lib/b.mjs'),
  ]);
  const elapsed = Date.now() - start;
  // Sequential would be ~2× a single stamp (~20-50ms each). Per-spec lock keeps them concurrent.
  assert.ok(elapsed < 200, `Concurrent stamps on different specs took ${elapsed}ms — suggests global lock`);
});

it('concurrent stampDrift calls on the SAME spec serialize correctly (no duplicate, no corruption)', async () => {
  const specPath = await createTempSpec({ slug: 'fx-spec', sourceManifestFiles: ['a.mjs','b.mjs'] });
  await Promise.all([
    stampDrift(specPath, 'a.mjs'),
    stampDrift(specPath, 'b.mjs'),
  ]);
  const events = (await readEvents(specPath)).filter(e => e.event === 'code_drift_detected');
  assert.equal(events.length, 2); // Both appended; no corruption
});
```

- [ ] **Verify test outcome.** If `withLock` is already per-spec scoped (likely given existing lifecycle-state.mjs usage), test passes immediately — this confirms the SEC-6 invariant holds. If global, it FAILS — fix `withLock` scoping in `lib/lifecycle-state.mjs`.

- [ ] **Implement (only if test fails)** — make `withLock` keyed by absolute spec path.

- [ ] **Verify both tests pass.**

- [ ] **Commit**

```bash
git add tests/lib/spec-drift.test.mjs lib/lifecycle-state.mjs # (lib only if fix needed)
git commit -m "test(spec-drift-detection): verify per-spec lock-scope for concurrent stamps (SEC-6)

Spec: .context-index/specs/features/spec-drift-detection/jsonl-drift-events.spec.md
Plan-task: 4"
```

---

## Task 5: `verify check-drift` sources from JSONL + read-path perf test [specialist: none]

**Charter capability:** Drift Flag Stamping (CLI surface)
**Strategy:** unit
**Files:**
- Modify: `lib/cli/verify.mjs:133-156`
- Modify or Create: `tests/cli/verify.test.mjs`
- Test: `tests/cli/verify.test.mjs`

**Tests:** `tests/cli/verify.test.mjs`

**Context to load:** Task 5 Context packet.

- [ ] **Write failing tests:**

```javascript
import { spawnSync } from 'node:child_process';
const cli = (args) => spawnSync('node', ['cli/index.mjs', 'verify', 'check-drift', ...args], { encoding: 'utf-8' });

it('check-drift returns drift_source/drift_at from latest unresolved code_drift_detected event', async () => {
  const specPath = await createTempSpec({ slug: 'fx', sourceManifestFiles: ['a.mjs', 'b.mjs'] });
  await stampDrift(specPath, 'a.mjs');
  await stampDrift(specPath, 'b.mjs'); // newer wins
  const out = JSON.parse(cli(['--spec', specPath]).stdout);
  assert.equal(out.drifted, true);
  assert.equal(out.drift_source, 'b.mjs');
});

it('check-drift legacy fallback: frontmatter-only spec returns drift_source=null, drift_at=null, drifted=true', async () => {
  const specPath = await createTempSpec({ slug: 'fx', sourceManifestFiles: ['a.mjs'], legacyFrontmatter: { drift_detected: true } });
  // No JSONL events emitted
  const out = JSON.parse(cli(['--spec', specPath]).stdout);
  assert.equal(out.drifted, true);
  assert.equal(out.drift_source, null);
  assert.equal(out.drift_at, null);
});

it('check-drift returns drifted=false when latest event is code_drift_cleared', async () => {
  const specPath = await createTempSpec({ slug: 'fx', sourceManifestFiles: ['a.mjs'] });
  await stampDrift(specPath, 'a.mjs');
  await clearDrift(specPath);
  const out = JSON.parse(cli(['--spec', specPath]).stdout);
  assert.equal(out.drifted, false);
});

it('check-drift completes in <100ms on a spec with 100 accumulated JSONL events (CON-5)', async () => {
  const specPath = await createTempSpec({ slug: 'fx', sourceManifestFiles: Array.from({length: 100}, (_, i) => `f${i}.mjs`) });
  for (let i = 0; i < 100; i++) await stampDrift(specPath, `f${i}.mjs`);
  const start = Date.now();
  cli(['--spec', specPath]);
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 100, `check-drift took ${elapsed}ms on 100-event JSONL — exceeds CON-5 budget`);
});
```

- [ ] **Verify all four cases fail.**

- [ ] **Implement** in `lib/cli/verify.mjs`:
  - Replace the regex frontmatter parser (lines 138-156) with `readEvents(specPath)` from `lib/lifecycle-state.mjs`.
  - Find the latest `code_drift_detected` event whose timestamp is greater than the latest `code_drift_cleared` event.
  - `drifted` = inline boolean from frontmatter (keep `hasDrift` semantics).
  - Legacy fallback: if `drifted` is `true` but no JSONL events match, return `{ drift_source: null, drift_at: null }`.

- [ ] **Verify all four cases pass.**

- [ ] **Commit**

```bash
git add lib/cli/verify.mjs tests/cli/verify.test.mjs
git commit -m "feat(spec-drift-detection): verify check-drift sources from JSONL (Step 2)

Spec: .context-index/specs/features/spec-drift-detection/jsonl-drift-events.spec.md
Plan-task: 5"
```

---

## Task 6: Stop writing `drift_source` / `drift_at` to frontmatter [specialist: none]

**Charter capability:** Drift Flag Stamping (legacy write removal)
**Strategy:** unit
**Files:**
- Modify: `lib/spec-drift.mjs::stampDrift` and `::clearDrift`
- Modify: `tests/lib/spec-drift.test.mjs`
- Test: `tests/lib/spec-drift.test.mjs`

**Tests:** `tests/lib/spec-drift.test.mjs`

**Context to load:** Task 6 Context packet.

- [ ] **Write failing tests:**

```javascript
it('stampDrift no longer writes drift_source or drift_at to spec frontmatter', async () => {
  const specPath = await createTempSpec({ slug: 'fx', sourceManifestFiles: ['a.mjs'] });
  await stampDrift(specPath, 'a.mjs');
  const content = await readFile(specPath, 'utf-8');
  assert.match(content, /^drift_detected:\s*true$/m);
  assert.doesNotMatch(content, /^drift_source:/m);
  assert.doesNotMatch(content, /^drift_at:/m);
});

it('clearDrift no longer mutates drift_source or drift_at in frontmatter (they should not exist anyway)', async () => {
  const specPath = await createTempSpec({ slug: 'fx', sourceManifestFiles: ['a.mjs'] });
  await stampDrift(specPath, 'a.mjs');
  await clearDrift(specPath);
  const content = await readFile(specPath, 'utf-8');
  assert.doesNotMatch(content, /^drift_(detected|source|at):/m);
});
```

- [ ] **Verify tests fail** (current code still writes `drift_source`/`drift_at` lines from Tasks 2-3).

- [ ] **Implement.** In `lib/spec-drift.mjs::stampDrift`:
  - Remove the `drift_source` and `drift_at` append-to-frontmatter logic.
  - Keep only the `drift_detected: true` boolean append.
  - JSONL emission (from Task 2) remains.
  In `clearDrift`:
  - Remove the strip of `drift_source`/`drift_at` from frontmatter (they're no longer written).
  - Keep the removal of `drift_detected` boolean.
  - JSONL `code_drift_cleared` emission (from Task 3) remains.

- [ ] **Verify tests pass.** All prior tests (Tasks 2, 3, 5) still pass (check-drift sources from JSONL; legacy fallback still works for not-yet-migrated specs).

- [ ] **Commit**

```bash
git add lib/spec-drift.mjs tests/lib/spec-drift.test.mjs
git commit -m "feat(spec-drift-detection): stop writing drift_source/drift_at to frontmatter (Step 3)

Spec: .context-index/specs/features/spec-drift-detection/jsonl-drift-events.spec.md
Plan-task: 6"
```

---

## Task 7: `scripts/migrate-drift-fields.mjs` with `--dry-run`, idempotency, traversal rejection [specialist: none]

**Charter capability:** Multi-file Drift Tracking (migration tool)
**Strategy:** unit
**Files:**
- Create: `scripts/migrate-drift-fields.mjs`
- Modify: `tests/scripts/migrate-drift-fields.test.mjs` (create if not exists; ESM test)
- Test: `tests/scripts/migrate-drift-fields.test.mjs`

**Tests:** `tests/scripts/migrate-drift-fields.test.mjs`

**Context to load:** Task 7 Context packet.

- [ ] **Write failing tests** covering all idempotency rules + security cases:

```javascript
// (a) needs migration — frontmatter present, no JSONL event
it('migrates a spec with drift_source/drift_at in frontmatter', async () => { ... });

// (b) already migrated — no frontmatter fields → no-op
it('is a no-op on a spec with no drift_source/drift_at in frontmatter', async () => { ... });

// (c) partial state — both present → strip fields, do not re-append
it('treats both-present state as recovered: strips fields, does not re-append event', async () => { ... });

// SEC-1 traversal rejection
it('rejects + warns + skips a spec whose legacy drift_source contains traversal escape', async () => { ... });

// SEC-5 dry-run side-effect-free
it('--dry-run produces a report but does not mutate any spec or JSONL file', async () => {
  const before = await snapshot(testDir);
  await runMigration(['--dry-run']);
  const after = await snapshot(testDir);
  assert.deepEqual(before, after);
});

// SEC-3 concurrent migration + hook race
it('concurrent stampDrift fire during migration does not produce duplicate events', async () => { ... });

// Idempotency on full repo
it('re-running the script on a fully-migrated tree is a no-op', async () => { ... });

// Exit code semantics
it('exits 1 with summary when any spec is skipped', async () => { ... });
```

- [ ] **Verify tests fail** (script does not exist).

- [ ] **Implement** `scripts/migrate-drift-fields.mjs`:
  - Arg parser: `--dry-run`, `--root <path>` (default `.context-index/specs`)
  - For each `.spec.md` file:
    - Read frontmatter, detect `drift_source` / `drift_at`
    - If absent → no-op
    - If present: acquire `withLock(specPath, async () => {...})`, canonicalize `drift_source` (reject + warn + skip on traversal escape), read existing JSONL events, check for matching `drift_at` (partial state), append `code_drift_detected` event UNLESS partial, strip `drift_source`/`drift_at` from frontmatter, leave `drift_detected: true` boolean
  - Summary report: per-spec status (migrated / skipped / no-op), count, exit code 0 if all succeeded or 1 if any skipped
  - `--dry-run`: build the report without acquiring locks or writing files

- [ ] **Verify all tests pass.**

- [ ] **Commit**

```bash
git add scripts/migrate-drift-fields.mjs tests/scripts/migrate-drift-fields.test.mjs
git commit -m "feat(spec-drift-detection): one-shot migrate-drift-fields script (Step 4)

Spec: .context-index/specs/features/spec-drift-detection/jsonl-drift-events.spec.md
Plan-task: 7"
```

---

## Task 8: Run migration over existing specs in repo [specialist: none]

**Charter capability:** Multi-file Drift Tracking (migration execution)
**Strategy:** exec (operational task)
**Files:**
- Modify: every `.context-index/specs/**/*.spec.md` that contains `drift_source:` or `drift_at:` in frontmatter (N files — determined at runtime)

**Tests:** Acceptance: `grep -rE "^drift_source:|^drift_at:" .context-index/specs/` returns zero matches post-migration.

**Context to load:** Task 8 Context packet.

- [ ] **Dry run first:**

```bash
node scripts/migrate-drift-fields.mjs --dry-run
```

Expected: report listing every spec with legacy fields and what the migration will do. Review.

- [ ] **Live run:**

```bash
node scripts/migrate-drift-fields.mjs
```

Expected: per-spec status, exit code 0.

- [ ] **Verify post-state.** `grep -rE "^drift_source:|^drift_at:" .context-index/specs/` returns no matches.

- [ ] **Verify lifecycle JSONLs.** Spot-check 2-3 previously-drifted specs to confirm `code_drift_detected` events were appended.

- [ ] **Verify `npm test` still passes.**

- [ ] **Commit**

```bash
git add .context-index/specs .context-index/lifecycle-state
git commit -m "chore(spec-drift-detection): run one-shot migration over existing specs (Step 4)

Spec: .context-index/specs/features/spec-drift-detection/jsonl-drift-events.spec.md
Plan-task: 8"
```

---

## Task 9: Charter rev 3 — rewrite Invariant 4, remove Deferred row, add Capability Map row [specialist: none]

**Charter capability:** Multi-file Drift Tracking (formal promotion)
**Strategy:** doc
**Files:**
- Modify: `.context-index/specs/features/spec-drift-detection/charter.md`

**Tests:** `/adev:review-specs --spec <this spec>` continues to pass on charter rev 3 (the spec's `charter-revision` field already points at 2; this Task uplifts to 3 in implement-validate handoff).

**Context to load:** Task 9 Context packet.

- [ ] **Edit `charter.md`:**
  1. Rewrite Invariant 4 (line 75) from:
     > "Multiple edits to different tracked files overwrite `drift_source` with the most recent — the flag is binary (drifted or not), not a list"

     to:
     > "Every detection appends a `code_drift_detected` event to the spec's JSONL; the inline `drift_detected` boolean is the derived rolled-up view. Multiple sources are preserved as separate events, not overwritten."
  2. In the Capability Map: confirm "Drift Flag Stamping" status is `review-passed` (will move to `validated` after Task 11). Add a new row:
     `| Multi-file Drift Tracking | Every drift detection appended to per-spec JSONL; inline boolean is the derived view. | must-have |  | specified |`
  3. In the Deferred Capabilities table: **REMOVE** the "Multi-file Drift Tracking" row entirely. No tombstone.
  4. Bump frontmatter `revision: 2` → `revision: 3` and `updated:` to today's date.

- [ ] **Verify** by grepping: `grep -c "Multi-file Drift Tracking" .context-index/specs/features/spec-drift-detection/charter.md` should return `1` (only in active Capability Map, not in Deferred).

- [ ] **Commit**

```bash
git add .context-index/specs/features/spec-drift-detection/charter.md
git commit -m "feat(spec-drift-detection): charter rev 3 — promote multi-file drift tracking, rewrite invariant 4 (Step 5)

Spec: .context-index/specs/features/spec-drift-detection/jsonl-drift-events.spec.md
Plan-task: 9"
```

---

## Task 10: Update skill prose in validate / review-specs / plan / hygiene [specialist: none]

**Charter capability:** Drift Flag Stamping (skill prose alignment)
**Strategy:** doc
**Files:**
- Modify: `skills/validate/SKILL.md`, `skills/review-specs/SKILL.md`, `skills/plan/SKILL.md`, `skills/hygiene/SKILL.md`

**Tests:** `tests/skills/no-stale-format-refs.test.mjs` (if present) and `npm test` overall.

**Context to load:** Task 10 Context packet.

- [ ] **Grep for outdated prose:**

```bash
grep -nE 'drift_(source|at)' skills/{validate,review-specs,plan,hygiene}/SKILL.md
```

- [ ] **For each match, update prose:**
  - "the spec's `drift_source` / `drift_at` frontmatter fields" → "the spec's latest `code_drift_detected` event in lifecycle-state"
  - "stamped on the spec's frontmatter" (where it implies all three fields) → "stamped via inline `drift_detected: true` boolean + JSONL event"
  - Preserve any prose that legitimately references the inline `drift_detected` boolean unchanged.

- [ ] **Verify** by re-grep: should return only mentions of the inline `drift_detected` boolean or quoted historical context. No bare prose referencing `drift_source`/`drift_at` as frontmatter fields.

- [ ] **Run `npm test`.** Skill-prose validation tests pass.

- [ ] **Commit**

```bash
git add skills/validate/SKILL.md skills/review-specs/SKILL.md skills/plan/SKILL.md skills/hygiene/SKILL.md
git commit -m "feat(spec-drift-detection): update skill prose for JSONL drift model (Step 6)

Spec: .context-index/specs/features/spec-drift-detection/jsonl-drift-events.spec.md
Plan-task: 10"
```

---

## Task 11: Integration test — two-branch concurrent stamp merges with zero conflicts [specialist: none]

> **Migration step:** Acceptance verification (no migration step; this is the headline acceptance test for Behavior 8 and the "two demo branches" acceptance criterion from the spec). The bug this whole spec exists to fix is this exact merge scenario; this task converts the bug into a regression-locking test.

**Charter capability:** Drift Flag Stamping (headline acceptance: no spurious conflicts)
**Strategy:** integration
**Files:**
- Create: `tests/integration/spec-drift-no-merge-conflict.test.mjs`

**Tests:** `tests/integration/spec-drift-no-merge-conflict.test.mjs`

**Context to load:** Task 11 Context packet.

> This is the headline acceptance criterion from the spec: two demo branches each invoking `stampDrift` on the same spec from different sources must `git merge` / `git rebase` with zero content conflicts.

- [ ] **Write failing test:**

```javascript
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stampDrift } from '../../lib/spec-drift.mjs';

test('two concurrent feature branches stamping overlapping specs merge with zero conflicts', async (t) => {
  // Set up a temp git repo containing one spec with two source-manifest files
  const repo = await mkdtemp(join(tmpdir(), 'drift-merge-'));
  t.after(() => rm(repo, { recursive: true, force: true }));

  // Initialize repo, create spec with source-manifest: [a.mjs, b.mjs]
  // commit on main as the merge base
  ...

  // Branch A: stampDrift(specPath, 'a.mjs'); commit
  execFileSync('git', ['checkout', '-b', 'branchA'], { cwd: repo });
  await stampDrift(...);
  execFileSync('git', ['commit', '-am', 'stamp from a.mjs'], { cwd: repo });

  // Branch B: from main, stampDrift(specPath, 'b.mjs'); commit
  execFileSync('git', ['checkout', 'main'], { cwd: repo });
  execFileSync('git', ['checkout', '-b', 'branchB'], { cwd: repo });
  await stampDrift(...);
  execFileSync('git', ['commit', '-am', 'stamp from b.mjs'], { cwd: repo });

  // Merge branchA into branchB
  const merge = execFileSync('git', ['merge', 'branchA', '--no-edit'], { cwd: repo, encoding: 'utf-8' });
  // Assert no conflicts
  const status = execFileSync('git', ['status', '--short'], { cwd: repo, encoding: 'utf-8' });
  assert.doesNotMatch(status, /^UU /, 'unexpected unmerged paths after merge');

  // Assert both drift events present in the JSONL
  const events = await readEvents(specPath);
  const sources = events.filter(e => e.event === 'code_drift_detected').map(e => e.drift_source).sort();
  assert.deepEqual(sources, ['a.mjs', 'b.mjs']);
});
```

- [ ] **Verify test fails** (or initially passes if the new code is correct — TDD here is a confirmation that the bug is gone).

- [ ] **Verify test passes against current code** (after Tasks 2-8 land).

- [ ] **Bonus regression check:** check out the pre-refactor branch (pre-Task 2), re-run the test, confirm it FAILS (proves we actually fixed the bug, not just removed the test).

- [ ] **Commit**

```bash
git add tests/integration/spec-drift-no-merge-conflict.test.mjs
git commit -m "test(spec-drift-detection): two-branch concurrent stamp merges without conflicts (headline acceptance)

Spec: .context-index/specs/features/spec-drift-detection/jsonl-drift-events.spec.md
Plan-task: 11"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`

### Acceptance Criteria Coverage (spec rev 2 § Acceptance Criteria)

| # | Acceptance Criterion | Verified By |
|---|----------------------|-------------|
| 1 | All existing `spec-drift.test.mjs` cases pass | Tasks 2, 3, 6 (regression) |
| 2 | New tests cover: JSONL emit on stamp, JSONL emit on clear, multi-source append, hasDrift reads boolean, verify check-drift sources from JSONL, migration idempotency, migration dry-run, path canonicalization (SEC-1), traversal-escape rejection (SEC-1), concurrent migration + hook (SEC-3), malformed legacy frontmatter (SEC-4) | Tasks 2, 3, 4, 5, 6, 7 |
| 3 | No `drift_source:` / `drift_at:` fields remain in any `.context-index/specs/**/*.spec.md` frontmatter after Step 4 | Task 8 grep check |
| 4 | Two demo branches each invoking `stampDrift` on overlapping specs from different `source` files merge with zero conflicts (Behavior 8 — headline) | **Task 11** |
| 5 | Charter rev 3; Invariant 4 rewritten; Capability Map updated; Deferred row REMOVED (not tombstone) | Task 9 grep check |
| 6 | `lifecycle-event-log.spec.md` canonical event-variant table contains `code_drift_detected` + `code_drift_cleared` rows | Task 1 |
| 7 | All quality gates pass (`npm test`) | All tasks; final `/adev:validate` run |
| 8 | `/adev:validate` passes for this spec | Post-implement validate phase |
| 9 | No constitutional violations introduced | See Constitutional Compliance section below |
| 10 | `verify check-drift` JSON output shape `{drifted, drift_source, drift_at}` unchanged | Task 5 test |
| 11 | `verify check-drift` <100ms on a spec with 100 accumulated JSONL events (CON-5) | Task 5 perf test |

### Constitutional Compliance (mapped to constitution + spec invariants)

| Concern | Verified By |
|---------|-------------|
| No new external dependencies | No `package.json` change; all new code uses Node built-ins (Tasks 2, 7) |
| Pure ESM (`.mjs`, `"type": "module"`) | New script `scripts/migrate-drift-fields.mjs` is ESM (Task 7); integration test is ESM (Task 11) |
| Hook protocol compliance | `hooks/sync-trigger.sh` unchanged; only the inline Node block's lib call has new semantics (Tasks 2, 3, 6) |
| Version parity | No version bump required for this refactor |
| No architecture-boundary crossing requiring human approval | No new skills, no hook protocol change, no CLI install-path change, no plugin-registration change, no new dependencies |
| CON-1: event names domain-prefixed (`code_*`) | Tasks 1, 2, 3 |
| CON-2: payload fields named `drift_source` / `drift_at` (not bare `source`/`at`) | Tasks 2, 3, 5, 7 |
| CON-3: Deferred row REMOVED, not tombstoned | Task 9 |
| CON-4: events canonicalized in lifecycle-event-log before emission | Task 1 (Step 0 first) |
| CON-5: <100ms read-path performance criterion | Task 5 perf test |
| SA-2 / ADR 0011: only `/adev:implement` clears drift | Spec Behavior 3b + Invariant; no code path in `/adev:validate --restamp` calls `clearDrift` |
| SEC-1: path canonicalization + `PATH_TRAVERSAL_REJECTED` | Tasks 2, 7 |
| SEC-2: JSONL serialization via `JSON.stringify`/`JSON.parse` | Inherited from `lib/lifecycle-state.mjs::appendEvent`; spec Invariant 9 |
| SEC-3: concurrent migration + hook race handled via `withLock` | Task 7 |
| SEC-4: legacy frontmatter validation during migration | Task 7 |
| SEC-5: `--dry-run` is side-effect-free | Task 7 explicit test |
| SEC-6: per-spec lock-scope (concurrent stamps on different specs are parallel) | Task 4 explicit test |
