# Implementation Plan: Incremental artifact writes (`.partial` + atomic rename)

> **Methodology:** adev
> **Charter:** cross-cutting (affects: `cli-driver-surface`, `agent-reliable-state-artifacts`, `lifecycle-artifacts`)
> **Spec:** `.context-index/specs/cross-cutting/incremental-artifact-writes.spec.md` (rev 2)
> **Review:** PASS_WITH_NOTES (2026-05-17) — 0 blockers, 2 warnings (SA-10 lock-steal contract, SA-11 stale-threshold precedence), 7 suggestions (folded into task scope where appropriate)
> **Platform:** JavaScript (ESM, `.mjs`), Node.js 18+, npm, node:test
> **Risk level:** medium

**Goal:** Implement the `.partial` + atomic-rename pattern so agent-authored artifacts (plans, specs, validation reports) survive mid-stream API failures with no silent loss and no permanent wedging on process kill.

**Architecture:** A pure-helper module (`lib/partial-artifact.mjs`) provides the building blocks (`partialPath`, `tryAcquireLock`, `commitPartial`, etc.) used by every adopting skill. A new canonical lifecycle event variant `partial_recovery` records every resume/discard/steal/abort decision via a dedicated `reportPartialRecovery()` helper (mirroring the one-helper-per-variant discipline of `reportReviewer`/`reportValidator`/`reportPlanTask`). Adopting skills (`/adev:plan`, `/adev:implement`, `/adev:specify`, `/adev:validate`, `/adev:build`) get SKILL.md prose updates instead of inline logic; CLI verbs (`adev partial {detect,resume,discard,inspect}`) wrap the helper so skill prose stays markdown-only per the `cli-driver-surface` charter. Lock-stealing for orphan `.partial.lock` files (SIGKILL recovery) follows a **stolen → discarded** contract: when a lock is stolen, the partial's content is considered unrecoverable and the next writer starts fresh. This sidesteps the TOCTOU window flagged by the rev-2 review (SA-10) and collapses the SA-11 precedence puzzle automatically.

---

## File Structure

**Create:**
- `lib/partial-artifact.mjs` — pure helpers (`partialPath`, `lockPath`, `commitPartial`, `findPartials`, `tryAcquireLock`, `isPartialStale`, plus `validateSchemaMarker`, `validateLockPayload`)
- `lib/cli/partial.mjs` — CLI verb dispatcher wrapping the helper module (`detect`, `resume`, `discard`, `inspect`)
- `tests/lib/partial-artifact.test.mjs` — unit tests for the helper module
- `tests/lib/partial-artifact-concurrency.test.mjs` — lock-acquire / contention / steal-on-stale tests
- `tests/lib/partial-artifact-validation.test.mjs` — schema-marker regex + lock-payload validation tests
- `tests/lib/lifecycle-state-partial-recovery.test.mjs` — `reportPartialRecovery()` + projection-fold tests
- `tests/integration/partial-resume-end-to-end.test.mjs` — end-to-end: kill a skill mid-write, assert `.partial` exists, re-dispatch, assert final artifact correct
- `tests/integration/scanner-invisibility.test.mjs` — regression: drop `*.spec.md.partial`/`*.plan.md.partial`/etc. into workspace, assert canonical scanners skip them
- `docs/partial-artifacts.md` — one-page explainer for skill authors

**Modify:**
- `lib/lifecycle-state.mjs` — add `reportPartialRecovery()` helper; extend `currentState()` fold to surface `partialRecoveries[]` projection field
- `lib/cli/index.mjs` — register the `adev partial` verb group
- `.gitignore` — add `*.partial` and `*.partial.lock` patterns
- `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` — **paired amendment** declaring `partial_recovery` as a canonical event variant; document the payload shape + helper reference + data-exposure boundary (SEC-8)
- `.context-index/specs/features/agent-reliable-state-artifacts/charter.md` — **paired amendment (SA-13)** hoist the write-state suffix taxonomy invariant from the cross-cutting spec into this charter's Invariants
- `skills/plan/SKILL.md` — mandate `.partial` pattern with `partial_schema: plan@1` marker
- `skills/implement/SKILL.md` — tighten "commit per task" to MUST; add `.partial` pattern for source-manifest staging
- `skills/specify/SKILL.md` — `.partial` pattern with `partial_schema: spec@1`
- `skills/validate/SKILL.md` — document that validate keeps existing `.tmp` per the suffix taxonomy
- `skills/build/SKILL.md` — orchestrator resume-mode update; partial-scan logic; `--auto` defaults
- `.context-index/manifest.yaml` — document new `lifecycle.partial_*` knobs (or `artifacts.partial_*` per CON-9 decision)

**Reference (read, do not modify):**
- `lib/issues/json-adapter.mjs::assertWithin` — canonical path-containment pattern (lines 69-81); helpers and CLI verbs must mirror it
- `lib/build-state.mjs::atomicWriteJson` — exemplar atomic-rename idiom at byte level (the `.tmp` pattern this spec preserves)
- `lib/lifecycle-state.mjs::reportReviewer`/`reportValidator`/`reportPlanTask` — one-helper-per-variant discipline that `reportPartialRecovery()` mirrors

---

## Context Packets

### Task 1 Context (cross-spec amendment + charter invariant hoist)
- Spec: `.context-index/specs/cross-cutting/incremental-artifact-writes.spec.md` (Module Impact Map row 2; System Constitution Reference; Invariants section)
- Target amendment files: `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` (canonical variant list + payload section), `.context-index/specs/features/agent-reliable-state-artifacts/charter.md` (Invariants section)
- Folds in: SA-13 (invariant ownership), SEC-8 (data-exposure boundary), CON-12 (schema marker syntax decision)

### Task 2 Context (helper module skeleton)
- Spec: Behaviors 1-3, Invariants section, Acceptance Criteria #3
- Reference code: `lib/build-state.mjs::atomicWriteJson` (atomic-rename pattern), `lib/issues/json-adapter.mjs::assertWithin` (path-containment)

### Task 3 Context (schema-marker grammar + validation)
- Spec: Preconditions (schema marker requirement), Behavior 4, Error Cases row 3
- Folds in: SEC-6 (regex + allowlist), CON-12 (syntax decision)

### Task 4 Context (lock-acquire + lock-payload validation + steal-on-stale)
- Spec: Behavior 6 (lock-stealing logic), Error Cases rows 5-7
- Folds in: SA-10 (stolen → discarded contract), SA-11 (precedence rule), SEC-7 (lock payload schema validation)

### Task 5 Context (findPartials + isPartialStale)
- Spec: Behaviors 5, 7; Acceptance Criteria #9, #10

### Task 6 Context (`reportPartialRecovery()` + projection fold)
- Spec: Behavior 8, Acceptance Criteria #1, #2
- Reference code: `lib/lifecycle-state.mjs::reportReviewer` / `reportValidator` / `reportPlanTask` (lines 793, 846, 911), `currentState()` fold switch
- Folds in: SA-12/CON-11 (pin projection field to `partialRecoveries[]`)

### Task 7 Context (manifest knobs)
- Spec: Behaviors 6-7, Task Map row "Manifest knobs", Acceptance Criteria #5
- Folds in: CON-9 (namespace decision — plan picks `lifecycle.partial_*` and documents the choice inline per CON-9 recommendation B)

### Task 8 Context (.gitignore)
- Spec: Preconditions (gitignore bullet), Postconditions, Acceptance Criteria #9
- Reference: existing `.gitignore` entries for `tasks.json.lock` and `tasks.json.*.tmp` (commit `ba44d3b`)

### Task 9 Context (CLI verbs)
- Spec: Integration Point 5, Task Map row "CLI verbs"
- Reference: `cli/index.mjs` (current verb dispatcher), the `adev partial` group must wrap `lib/partial-artifact.mjs` per the no-inline-Node rule

### Tasks 10-14 Context (per-skill SKILL.md updates)
- Spec: Integration Points 1-5 (per skill)

### Task 15 Context (scanner-invisibility regression)
- Spec: Postconditions paragraph 7 ("Scanner invisibility"), Acceptance Criteria #10
- Reference scanners: `/adev:hygiene`, `/adev:status`, `/adev:repomap` source-manifest globs

### Task 16 Context (end-to-end integration test)
- Spec: Acceptance Criteria #11
- One adopting skill is sufficient for v1; recommend `/adev:specify` since it's the smallest write-heavy skill

---

## Parallelization

- **Sequential spine A (paired-spec amendments first):** Task 1 → enables Tasks 4 (lock-steal contract refs spec), 6 (helper depends on amendment-declared variant naming).
- **Independent group B (pure helpers):** Tasks 2, 3, 5 can land in any order once Task 1 is done. Task 4 must follow Task 2 (uses `partialPath`/`lockPath`) and Task 3 (uses `validateSchemaMarker`).
- **Sequential follow-on C (lifecycle integration):** Task 6 depends on Tasks 1 + 2.
- **Independent group D (config + verbs):** Task 7 (manifest knobs) and Task 8 (.gitignore) independent of everything. Task 9 (CLI verbs) depends on Tasks 2-5 (helper module complete).
- **SKILL.md updates (group E):** Tasks 10-14 independent of each other; each depends on Tasks 2-9 being complete (helpers + verbs + manifest knobs all need to exist before SKILL prose can reference them).
- **Tests last (group F):** Tasks 15 (scanner-invisibility) and 16 (end-to-end) run after their dependencies. Task 15 depends only on Task 8 (gitignore). Task 16 depends on at least one SKILL.md update from group E plus the helper foundation.
- **Documentation (Task 17):** independent; can land any time after the helper module exists.

Recommended order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → (10-14 in any order) → 15, 16 → 17.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Paired-spec amendments (lifecycle-event-log + charter invariant) | small | unit | — | 0 create, 2 modify |
| 2 | Helper module skeleton (`partialPath`/`lockPath`/`commitPartial`) | small | unit | — | 1 create, 0 modify |
| 3 | Schema-marker grammar + allowlist validation | small | unit | Task 2 | 0 create, 1 modify |
| 4 | Lock-acquire + payload validation + steal-on-stale (stolen→discarded) | medium | unit | Tasks 2, 3 | 0 create, 1 modify |
| 5 | `findPartials` + `isPartialStale` | small | unit | Task 2 | 0 create, 1 modify |
| 6 | `reportPartialRecovery()` + `partialRecoveries[]` projection | small | unit | Tasks 1, 2 | 0 create, 1 modify |
| 7 | Manifest knobs (`lifecycle.partial_*` family) | small | unit | — | 0 create, 1 modify |
| 8 | `.gitignore` entries (`*.partial`, `*.partial.lock`) | small | unit | — | 0 create, 1 modify |
| 9 | CLI verbs `adev partial {detect,resume,discard,inspect}` | medium | unit | Tasks 2-5 | 1 create, 1 modify |
| 10 | `/adev:plan` SKILL.md update | medium | unit | Tasks 2-9 | 0 create, 1 modify |
| 11 | `/adev:implement` SKILL.md update | medium | unit | Tasks 2-9 | 0 create, 1 modify |
| 12 | `/adev:specify` SKILL.md update | small | unit | Tasks 2-9 | 0 create, 1 modify |
| 13 | `/adev:validate` SKILL.md update | small | unit | Tasks 2-9 | 0 create, 1 modify |
| 14 | `/adev:build` SKILL.md update (orchestrator resume) | medium | unit | Tasks 2-9, 6 | 0 create, 1 modify |
| 15 | Scanner-invisibility regression test | small | unit | Task 8 | 1 create, 0 modify |
| 16 | End-to-end integration test (one adopting skill) | medium | unit | Tasks 2-12 (or any one SKILL update) | 1 create, 0 modify |
| 17 | Documentation (`docs/partial-artifacts.md`) | small | unit | Tasks 2-9 | 1 create, 0 modify |

**17 tasks total.** All `unit` strategy (no infra dependencies — node:test only, plus child_process for the end-to-end test).

---

## Task Structure

> The per-task `- [ ]` checkboxes are authoring guides only. Authoritative task state lives in the spec's lifecycle log via `currentState(spec).planTasks`.

### Task 1: Paired-spec amendments (lifecycle-event-log + charter invariant) [specialist: none]

**Charter capability:** Cross-cutting; folds in SA-13 (invariant ownership) and SEC-8 (data-exposure boundary).
**Strategy:** unit
**Files:**
- Modify: `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` — add `partial_recovery` to canonical variant list; document payload (`{ts, event, artifact_path, prior_partial_ts, action, dispatch_mode}`); add data-exposure boundary note per SEC-8; reference `reportPartialRecovery()` helper
- Modify: `.context-index/specs/features/agent-reliable-state-artifacts/charter.md` — hoist write-state suffix taxonomy invariant from cross-cutting spec into this charter's Invariants section (closes the SA-13 governance gap)

**Tests:** No test (spec-only edits). Verified by `/adev:validate` Check 7 (spec coherence) on the cross-cutting spec.

- [ ] **Read both target files** to identify exact insertion points
- [ ] **Edit `lifecycle-event-log.spec.md`**: add row to canonical variant table; add payload-shape paragraph; add SEC-8 boundary note
- [ ] **Edit `charter.md`**: add the write-state suffix taxonomy as a new Invariant; cross-reference `incremental-artifact-writes.spec.md`
- [ ] **Verify no other spec breaks**: grep `.context-index/specs/` for any reference to the old single-spec ownership of the invariant
- [ ] **Commit**

```bash
git add .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md \
        .context-index/specs/features/agent-reliable-state-artifacts/charter.md
git commit -m "docs(agent-reliable-state-artifacts): declare partial_recovery variant + hoist write-state taxonomy invariant"
```

---

### Task 2: Helper module skeleton [specialist: none]

**Charter capability:** Cross-cutting (helper layer).
**Strategy:** unit
**Files:**
- Create: `lib/partial-artifact.mjs` — start with pure functions: `partialPath(finalPath)`, `lockPath(finalPath)`, `commitPartial(finalPath)`, plus `assertWithin` (mirrored from `lib/issues/json-adapter.mjs:69-81`)
- Test: `tests/lib/partial-artifact.test.mjs`

**Context to load:** `lib/issues/json-adapter.mjs:69-81` (`assertWithin` pattern to mirror).

- [ ] **Write failing tests** for `partialPath('/foo/bar.md') === '/foo/bar.md.partial'`, `lockPath` returns `.partial.lock`, `commitPartial` atomic-renames `.partial → final`, `assertWithin` rejects `../` traversal
- [ ] **Verify tests fail** (`node --test tests/lib/partial-artifact.test.mjs`)
- [ ] **Implement** with only `node:fs` built-ins
- [ ] **Verify tests pass**
- [ ] **Commit**

```bash
git add lib/partial-artifact.mjs tests/lib/partial-artifact.test.mjs
git commit -m "feat(partial-artifacts): helper skeleton — partialPath, lockPath, commitPartial, assertWithin"
```

---

### Task 3: Schema-marker grammar + allowlist [specialist: none]

**Charter capability:** Cross-cutting (input validation; folds in SEC-6 + CON-12).
**Strategy:** unit
**Files:**
- Modify: `lib/partial-artifact.mjs` — add `validateSchemaMarker(raw)` (regex `/^[a-z][a-z0-9-]{0,31}@[0-9]{1,3}$/`) + `SCHEMA_ALLOWLIST` map from `{skill, version}` → parser callable. Decision per CON-12: keep `@`-versioned syntax (matches the spec's wire format); allowlist makes the value safe to dispatch
- Test: `tests/lib/partial-artifact-validation.test.mjs`

- [ ] **Write failing tests**: valid markers pass (`plan@1`, `spec@1`, `validate@1`); invalid markers reject (`../etc`, `plan@1; rm -rf`, oversize line, empty, missing `@`); allowlist lookup returns parser for known tuples and null for unknown
- [ ] **Verify tests fail**
- [ ] **Implement** the regex + allowlist
- [ ] **Verify tests pass**
- [ ] **Commit**

```bash
git add lib/partial-artifact.mjs tests/lib/partial-artifact-validation.test.mjs
git commit -m "feat(partial-artifacts): schema-marker grammar + allowlist (closes SEC-6, CON-12)"
```

---

### Task 4: Lock-acquire + payload validation + steal-on-stale (stolen → discarded) [specialist: none]

**Charter capability:** Cross-cutting (lock-coordination; folds in SA-10 contract, SA-11 precedence, SEC-7 lock payload validation).
**Strategy:** unit
**Files:**
- Modify: `lib/partial-artifact.mjs` — add `tryAcquireLock(finalPath, opts)` and `validateLockPayload(raw)`. Lock payload: `{pid, started_at}` with strict validation (`pid` positive finite integer ≤ 2²², `started_at` parseable past ISO-8601). Steal contract: when a lock is stale (dead pid AND age > threshold), unlink BOTH the lock AND the partial file, then re-acquire — the spec's "stolen → discarded" framing means the partial's content is not recoverable, so unlinking it is correct, not a TOCTOU bug. Document this in the function's JSDoc.
- Test: `tests/lib/partial-artifact-concurrency.test.mjs`

**Context to load:** spec Behavior 6 (full lock-acquire/steal logic), Error Cases rows 5-7, rev-2 review SA-10 (TOCTOU concern + resolution path), SEC-7 (lock-payload schema), SA-11 (precedence rule).

- [ ] **Write failing tests** (cover all branches):
  - Lock acquire succeeds on clean state
  - Second acquire returns `PARTIAL_ARTIFACT_LOCKED` when first holder's pid is alive
  - Lock with dead-pid + young (`now - started_at < partial_stale_seconds`) → retry-with-backoff; returns `PARTIAL_ARTIFACT_LOCKED` after budget
  - Lock with dead-pid + old → steals: unlinks `.partial.lock` AND `.partial`, re-acquires, returns success
  - Lock payload validation rejects `pid:0`, `pid:-1`, `pid:"42"`, `pid:1.5`, missing `started_at`, future `started_at`, non-ISO `started_at`; failed validation → orphan-steal path (DO NOT invoke `process.kill`)
- [ ] **Verify tests fail**
- [ ] **Implement** with `openSync(O_EXCL)`, `kill(pid, 0)`, `statSync`, `unlinkSync`. Use a clock-injection seam for testing `started_at` thresholds
- [ ] **Verify tests pass**
- [ ] **Commit**

```bash
git add lib/partial-artifact.mjs tests/lib/partial-artifact-concurrency.test.mjs
git commit -m "feat(partial-artifacts): lock acquire + steal-on-stale (closes SA-10, SA-11, SEC-7)"
```

---

### Task 5: `findPartials` + `isPartialStale` [specialist: none]

**Charter capability:** Cross-cutting.
**Strategy:** unit
**Files:**
- Modify: `lib/partial-artifact.mjs` — add `findPartials(rootDir)` (glob `**/*.partial`) and `isPartialStale(path, thresholdHours)` (compare `statSync(path).mtime` to now)
- Test: extend `tests/lib/partial-artifact.test.mjs`

- [ ] **Write failing tests**: `findPartials` returns expected paths from a temp dir; doesn't follow symlinks; handles missing dirs; `isPartialStale` returns false for fresh files, true past threshold
- [ ] **Verify tests fail**
- [ ] **Implement** using `fs.readdirSync({recursive: true})` (Node 20+) with type filter
- [ ] **Verify tests pass**
- [ ] **Commit**

```bash
git add lib/partial-artifact.mjs tests/lib/partial-artifact.test.mjs
git commit -m "feat(partial-artifacts): findPartials + isPartialStale"
```

---

### Task 6: `reportPartialRecovery()` + projection fold [specialist: none]

**Charter capability:** `agent-reliable-state-artifacts` (lifecycle log; folds in SA-12/CON-11 projection field pinning).
**Strategy:** unit
**Files:**
- Modify: `lib/lifecycle-state.mjs` — new `reportPartialRecovery(projectRoot, specPath, {artifact_path, prior_partial_ts, action, dispatch_mode})` helper; `action` validated against closed enum `{resumed, discarded, stolen, aborted}`; `artifact_path` validated as project-root-relative (no absolute paths). Extend `currentState()` fold switch to emit a new `partialRecoveries[]` projection field (per SA-12/CON-11 — pin the choice now, don't defer to plan).
- Test: `tests/lib/lifecycle-state-partial-recovery.test.mjs`

**Context to load:** `lib/lifecycle-state.mjs::reportReviewer` (lines 793-820), `reportValidator` (846-...), `reportPlanTask` (911-...) — mirror their signature shape and validation discipline.

- [ ] **Write failing tests**:
  - `reportPartialRecovery({action: "resumed", ...})` appends a `partial_recovery` event with the validated payload
  - Invalid `action` value rejected with `EVENT_SCHEMA_INVALID`
  - Absolute `artifact_path` rejected (project-root-relative required per SEC-3)
  - `currentState()` surfaces the event in `partialRecoveries[]` projection array (NOT folded into `interventions[]`)
- [ ] **Verify tests fail**
- [ ] **Implement** mirroring the existing helper shape
- [ ] **Verify tests pass**
- [ ] **Commit**

```bash
git add lib/lifecycle-state.mjs tests/lib/lifecycle-state-partial-recovery.test.mjs
git commit -m "feat(agent-reliable-state-artifacts): reportPartialRecovery + partialRecoveries[] projection"
```

---

### Task 7: Manifest knobs [specialist: none]

**Charter capability:** Cross-cutting (manifest schema; folds in CON-9 namespace decision).
**Strategy:** unit
**Files:**
- Modify: `.context-index/manifest.yaml` — document four knobs under `lifecycle.*` family:
  - `lifecycle.partial_stale_seconds` (default 30) — lock-steal threshold
  - `lifecycle.partial_stale_hours` (default 24) — orphan-content sweep threshold
  - `lifecycle.partial_roots` (optional list) — containment allowlist beyond `.context-index/`
  - `lifecycle.partial_oversize_multiplier` (default 3) — runaway-write guard
- Add a brief inline comment defending the `lifecycle.*` namespace choice per CON-9 recommendation B: "These knobs govern lifecycle-artifact write-state, which is a lifecycle concern even though the per-knob behavior is artifact-byte-management."
- Modify: `lib/partial-artifact.mjs` — read knobs via existing `loadManifest` pattern (sync, no new deps)
- Test: extend `tests/lib/partial-artifact.test.mjs`

- [ ] **Write failing tests**: default knob values returned when manifest is silent; override values returned when manifest sets them
- [ ] **Verify tests fail**
- [ ] **Implement** sync manifest read (no async/dynamic-import) per the JsonAdapter precedent
- [ ] **Verify tests pass**
- [ ] **Commit**

```bash
git add .context-index/manifest.yaml lib/partial-artifact.mjs tests/lib/partial-artifact.test.mjs
git commit -m "feat(partial-artifacts): manifest knobs (lifecycle.partial_* family, closes CON-9)"
```

---

### Task 8: `.gitignore` entries [specialist: none]

**Charter capability:** Cross-cutting (prevents committed-orphan-partial breakage on clone).
**Strategy:** unit
**Files:**
- Modify: `.gitignore` — add `*.partial` and `*.partial.lock` patterns

- [ ] **Add the two patterns** to `.gitignore`
- [ ] **Verify via `git check-ignore -v`**: `foo.spec.md.partial`, `foo.plan.md.partial.lock` both ignored; `foo.spec.md`, `tasks.json` still tracked
- [ ] **Commit**

```bash
git add .gitignore
git commit -m "chore(partial-artifacts): gitignore *.partial and *.partial.lock"
```

---

### Task 9: CLI verbs [specialist: none]

**Charter capability:** `cli-driver-surface` (no inline Node in SKILL.md).
**Strategy:** unit
**Files:**
- Create: `lib/cli/partial.mjs` — verbs `detect`, `resume`, `discard`, `inspect`; each wraps `lib/partial-artifact.mjs`
- Modify: `lib/cli/index.mjs` (or `cli/index.mjs`) — register the `adev partial` verb group
- Test: `tests/cli/partial.test.mjs`

- [ ] **Write failing tests**: `adev partial detect --spec <path>` lists `.partial` files for the spec; `adev partial inspect --artifact <path>` shows the schema marker + lock state (read-only); `adev partial discard --artifact <path>` unlinks `.partial` + `.partial.lock`, emits `partial_recovery` (`action: discarded`); `adev partial resume` is informational (returns the partial's last coherent section)
- [ ] **Verify tests fail**
- [ ] **Implement** via verb dispatcher pattern matching existing verbs
- [ ] **Verify tests pass**
- [ ] **Commit**

```bash
git add lib/cli/partial.mjs lib/cli/index.mjs tests/cli/partial.test.mjs
git commit -m "feat(cli-driver-surface): adev partial {detect,resume,discard,inspect} verbs"
```

---

### Task 10: `/adev:plan` SKILL.md update [specialist: none]

**Charter capability:** `lifecycle-artifacts`.
**Strategy:** unit
**Files:**
- Modify: `skills/plan/SKILL.md` — mandate `.partial` pattern with `partial_schema: plan@1` marker; section-per-append cadence; final atomic rename in Step 7; resume-detection guard in Step 0

- [ ] **Add an "Incremental Authoring" subsection** under Step 5 (Write the Plan): document the `.partial` workflow + `partial_schema: plan@1` marker
- [ ] **Add resume-detection** to Step 0: if `<plan-path>.partial` exists, run `adev partial inspect`; offer resume/discard/abort
- [ ] **Verify SKILL.md is markdown-only** (no inline Node) per the cli-driver-surface charter
- [ ] **Commit**

```bash
git add skills/plan/SKILL.md
git commit -m "docs(plan): adopt .partial pattern with partial_schema: plan@1"
```

---

### Task 11: `/adev:implement` SKILL.md update [specialist: none]

**Charter capability:** `lifecycle-artifacts`.
**Strategy:** unit
**Files:**
- Modify: `skills/implement/SKILL.md` — tighten "commit per task" to MUST; `.partial` pattern for source-manifest stamping with `partial_schema: implement@1`

- [ ] **Update the per-task commit guidance**: change SHOULD-style language to MUST
- [ ] **Add `.partial` pattern** for source-manifest staging
- [ ] **Commit**

```bash
git add skills/implement/SKILL.md
git commit -m "docs(implement): mandate commit-per-task + .partial for source-manifest staging"
```

---

### Task 12: `/adev:specify` SKILL.md update [specialist: none]

**Charter capability:** `lifecycle-artifacts`.
**Strategy:** unit
**Files:**
- Modify: `skills/specify/SKILL.md` — `.partial` pattern with `partial_schema: spec@1` marker; per-section append cadence

- [ ] **Add incremental authoring guidance** to Step 5 (Write the Spec)
- [ ] **Commit**

```bash
git add skills/specify/SKILL.md
git commit -m "docs(specify): adopt .partial pattern with partial_schema: spec@1"
```

---

### Task 13: `/adev:validate` SKILL.md update [specialist: none]

**Charter capability:** `lifecycle-artifacts`.
**Strategy:** unit
**Files:**
- Modify: `skills/validate/SKILL.md` — document that validate keeps existing `.tmp` per the write-state suffix taxonomy invariant (no migration)

- [ ] **Add a note** under the "Atomic write protocol" section: explicitly state that validate uses `.tmp` (byte-level) and NOT `.partial` (artifact-level), per the taxonomy invariant in `agent-reliable-state-artifacts/charter.md`
- [ ] **Commit**

```bash
git add skills/validate/SKILL.md
git commit -m "docs(validate): document .tmp choice per write-state suffix taxonomy"
```

---

### Task 14: `/adev:build` SKILL.md update (orchestrator resume) [specialist: none]

**Charter capability:** `cli-driver-surface` + `lifecycle-artifacts`.
**Strategy:** unit
**Files:**
- Modify: `skills/build/SKILL.md` — orchestrator's resume path scans for `.partial` artifacts; offers resume/discard/abort per Behavior 5; `--auto` defaults documented (resume when schema OK, discard with warning when schema mismatched, never silent overwrite)

- [ ] **Add a "Partial Artifact Detection" subsection** to the One-Step-Per-Invocation Dispatch
- [ ] **Document the `--auto` resume/discard behavior** clearly
- [ ] **Reference `adev partial detect`** for the implementation
- [ ] **Commit**

```bash
git add skills/build/SKILL.md
git commit -m "docs(build): partial artifact detection in orchestrator resume path"
```

---

### Task 15: Scanner-invisibility regression test [specialist: none]

**Charter capability:** Cross-cutting (defends Postcondition #7).
**Strategy:** unit
**Files:**
- Create: `tests/integration/scanner-invisibility.test.mjs`

- [ ] **Write failing test**: in a temp workspace, drop `foo.spec.md.partial`, `foo.plan.md.partial`, `foo.review.md.partial`, `foo.validate.md.partial`; run scanners (`adev hygiene`, `adev status`, `adev repomap`) via `execFile`; assert none of them pick up the `.partial` content
- [ ] **Verify tests fail** (only matters if scanners currently DO accidentally pick partials up; if they don't, this is a positive regression-prevention test)
- [ ] **Confirm baseline passes** (no implementation change needed if scanners are already correctly scoped)
- [ ] **Commit**

```bash
git add tests/integration/scanner-invisibility.test.mjs
git commit -m "test(partial-artifacts): scanner-invisibility regression guard"
```

---

### Task 16: End-to-end integration test (one adopting skill) [specialist: none]

**Charter capability:** Cross-cutting (end-to-end proof).
**Strategy:** unit (with `child_process` spawning)
**Files:**
- Create: `tests/integration/partial-resume-end-to-end.test.mjs`

- [ ] **Write failing test**: spawn `/adev:specify` (or whichever adopting skill is simplest) in a child process; kill mid-write via `SIGTERM`; assert `<spec>.partial` and `<spec>.partial.lock` exist; re-dispatch the skill; assert it detects the partial, resumes (or discards per policy), and the final `.spec.md` is correct
- [ ] **Verify tests fail** (will fail until at least one SKILL.md adoption is wired through)
- [ ] **Implement** — no new code, just orchestrating the spawn + kill
- [ ] **Verify tests pass**
- [ ] **Commit**

```bash
git add tests/integration/partial-resume-end-to-end.test.mjs
git commit -m "test(partial-artifacts): end-to-end resume integration"
```

---

### Task 17: Documentation [specialist: none]

**Charter capability:** Cross-cutting.
**Strategy:** unit (doc only)
**Files:**
- Create: `docs/partial-artifacts.md` — one-page explainer for skill authors

- [ ] **Write the doc**: why (issue-504 reframing), what (the four-suffix taxonomy + the lock-steal contract), how (helper module API surface + CLI verbs)
- [ ] **Commit**

```bash
git add docs/partial-artifacts.md
git commit -m "docs(partial-artifacts): one-page explainer for skill authors"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test` (per `.context-index/governance/gates.yaml`)
- All 16 acceptance criteria from spec rev 2 satisfied
- No new runtime dependencies introduced (constitution Principle 1)
- No constitutional violations

### Acceptance-criterion coverage map (spec → plan task)

| Spec AC | Plan tasks |
|---|---|
| #1 (paired amendment landed) | 1 |
| #2 (`reportPartialRecovery` helper) | 6 |
| #3 (`currentState` fold) | 6 |
| #4 (helper module entry points + `assertWithin`) | 2, 3, 4, 5, 7 |
| #5 (lock semantics per Behavior 6) | 4 |
| #6 (`partial_schema` marker enforcement) | 3, 6 |
| #7 (subject-first error codes) | 3, 4 |
| #8 (`PARTIAL_ARTIFACT_OVERSIZE` per-append) | 4 (size-cap check inside `tryAcquireLock`'s caller path; verify during Task 4) |
| #9 (`artifact_path` project-root-relative) | 6 |
| #10 (`.gitignore` + scanner-invisibility) | 8, 15 |
| #11 (end-to-end integration test) | 16 |
| #12 (no new deps) | All tasks |
| #13 (`npm test` green) | All tasks |
| #14 (no constitutional violations) | All tasks |
| #15 (this plan's self-referential acceptance) | This plan was authored via `.partial` pattern — visible at `.context-index/specs/cross-cutting/incremental-artifact-writes.plan.md.partial` → atomic rename to `.plan.md` |
