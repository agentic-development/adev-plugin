---
charter: spec-drift-detection
kind: refactor
mode: refactor
status: validated
revision: 3
charter-revision: 4
created: 2026-05-18
updated: 2026-05-21
tracker-ref: issue-516
source-manifest:
  sha: "735c4c4"
  files:
    - lib/cli/verify.mjs
    - lib/diagnostics/event-schemas.mjs
    - lib/lifecycle-events.mjs
    - lib/spec-drift.mjs
    - scripts/migrate-drift-fields.mjs
    - tests/cli/verify.test.mjs
    - tests/integration/spec-drift-no-merge-conflict.test.mjs
    - tests/lib/spec-drift.test.mjs
    - tests/scripts/migrate-drift-fields.test.mjs
  computed-at: "2026-05-18T13:59:32.083Z"
drift_detected: true
---

# Refactoring Spec: JSONL Drift Events

<!-- Refactoring spec within the spec-drift-detection charter.
     Extends the Live Spec format with current-state/target-state analysis and migration path.
     Parent Charter: .context-index/specs/features/spec-drift-detection/charter.md -->

## Revision History

- **rev 3 (2026-05-21):** Amended `stampDrift` emission contract to be idempotent on the JSONL side. Subsequent stamps on an already-drifted spec (frontmatter `drift_detected: true`) are no-ops; the second JSONL event only appears after a `clearDrift` re-arms detection. Motivation: a single edit to a hot file (e.g. `cli/index.mjs` is referenced by ~28 specs' source-manifests) generated 28 JSONL appends, and multiplied across in-flight PRs that storm produced merge conflicts even with `.gitattributes merge=union` in place (the union driver does not reliably fire under interactive rebase, fork merges, or non-merge-commit strategies). Idempotency drops per-PR drift churn by ~95% so the remaining cases (first transition on different branches) merge cleanly via the union driver. Behaviors 1 & 2 updated. Charter Invariant rewritten and the `Multi-file Drift Tracking` capability replaced with `Idempotent Drift Stamping` (the previously-deferred multi-source history is rescinded — no consumer reads it; `/adev:hygiene`, `/adev:validate`, `/adev:plan`, and `adev verify --check-drift` all consume only the latest unresolved event).
- **rev 2 (2026-05-18):** Folded review findings (1 blocker, 5 warnings, 6 suggestions). Renamed events to `code_drift_detected` / `code_drift_cleared` (CON-1) with `drift_source` / `drift_at` payload fields (CON-2). Added Migration Step 0 to canonicalize events in `lifecycle-event-log.spec.md` (CON-4 blocker). Added Behavior 3b for ADR 0011 coordination (SA-2). Added invariants for path canonicalization (SEC-1) and JSON serialization (SEC-2). Clarified migration idempotency mechanism (SA-3), lock-during-migration (SEC-3), legacy frontmatter validation (SEC-4), legacy null-field operator note (SA-1), explicit Deferred-row removal (CON-3), read-path performance criterion (CON-5).
- **rev 1 (2026-05-18):** Initial draft. Reviewed → BLOCK.

## Current State

### Structure

| File | Role | Lines | Notes |
|------|------|-------|-------|
| `lib/spec-drift.mjs` | Core: `scanForDrift`, `stampDrift`, `clearDrift`, `hasDrift` | ~180 | `stampDrift` writes `drift_detected: true`, `drift_source`, `drift_at` directly into spec YAML frontmatter (strip-and-append; overwrite-only) |
| `hooks/sync-trigger.sh` | PostToolUse:Edit hook that calls `scanForDrift` + `stampDrift` on every edit | ~105 | Inline Node block at lines 72-102 |
| `lib/cli/verify.mjs` | Implements `adev verify check-drift` | ~160 | Line 47 imports `hasDrift`; lines 133-156 read `drift_source`/`drift_at` directly via regex against frontmatter |
| `tests/lib/spec-drift.test.mjs` | Stamp/clear/hasDrift unit tests | ~270 | All current assertions read drift fields from frontmatter |
| `skills/validate/SKILL.md`, `skills/review-specs/SKILL.md`, `skills/plan/SKILL.md`, `skills/hygiene/SKILL.md` | Skill prose referencing drift fields | — | Mention `drift_detected`/`drift_source`/`drift_at` in step prose; consume via the CLI verbs above, not by direct frontmatter parsing |

### Problems

1. **Spurious merge conflicts.** `drift_source` and `drift_at` are written as per-edit operational state into the spec's YAML frontmatter (`lib/spec-drift.mjs:134-144` strips then re-appends). Two concurrent branches that edit different lifecycle SKILL.md files (e.g. one touches `skills/validate/SKILL.md`, another `skills/specify/SKILL.md`) cascade drift stamps onto the same overlapping set of specs and overwrite the same three lines with different values. Every rebase past such a merge produces a content conflict — observed five times in three days across PRs #132/#133/#134/#135/#137/#138.

2. **Single-source last-write-wins.** `stampDrift` removes any prior drift fields before re-appending (`lib/spec-drift.mjs:134-136`). If `skills/implement/SKILL.md` and `skills/validate/SKILL.md` are both edited and both appear in a spec's `source-manifest.files[]`, only the last edit's source survives. This is codified in the charter's Invariant 4 ("Multiple edits to different tracked files overwrite `drift_source` with the most recent — the flag is binary (drifted or not), not a list") — which is precisely the design defect this spec rescinds.

3. **Lost stamps from conflict resolution.** Because both branches' drift detections live on the same three frontmatter lines, the standard "take theirs" rebase strategy discards one side's drift event. Both events were legitimate detections; resolution loses one.

4. **Spec-file noise in git history.** `stampDrift` mutates the spec file itself, so `git log <spec>` mixes real spec edits with drift-stamping events. A spec showing recent activity may have been touched only by the hook.

### Dependencies

- **`lib/source-manifest.mjs::buildReverseIndex()`** — `scanForDrift` delegates to this for the file→spec mapping. Unchanged by this refactor.
- **`hooks/sync-trigger.sh` hook contract** — must still exit 0 and may still emit `{type: "warning", message: ...}` lines to stdout. No protocol change.
- **`adev verify check-drift` JSON output** — currently `{drifted, drift_source, drift_at}`. Must remain backward-compatible (this spec preserves the exact field names; their *source* moves from frontmatter to JSONL).
- **`lifecycle-event-log` canonical schema** (cross-cutting dependency, see `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md`) — this spec adds `code_drift_detected` and `code_drift_cleared` as canonical event variants. The canonical event-variant table in the lifecycle-event-log spec must be updated as part of this work; otherwise the events read as unknown extensions and `currentState` projections cannot rely on them.
- **`/adev:plan` gate, `/adev:validate` warning, `/adev:hygiene` report, `/adev:implement` clear** — all consume drift state through `hasDrift()` or `adev verify check-drift`. They do not parse spec frontmatter directly, so updating the lib + CLI verb is sufficient for them.
- **ADR 0011 (Source-Manifest Re-stamping Authority)** — introduces `/adev:validate --restamp`. This spec coordinates with ADR 0011 by establishing that ONLY `/adev:implement` clears drift (see Behavior 3b).

## Target State

### Structure

| File | Role | Notes |
|------|------|-------|
| `lib/spec-drift.mjs` | Same exported surface (`scanForDrift`, `stampDrift`, `clearDrift`, `hasDrift`) | `stampDrift` canonicalizes `driftSource` then appends a `{event: "code_drift_detected", drift_source, drift_at}` JSONL line to the spec's lifecycle log AND ensures `drift_detected: true` is present in frontmatter. `clearDrift` appends `{event: "code_drift_cleared", drift_at}` AND removes the inline boolean. `hasDrift` reads the inline boolean (fast path). |
| `lib/lifecycle-state.mjs` | Reused as-is for append-only event emission via `appendEvent(specPath, event)` | Already used for other lifecycle events; matches the pattern of `lib-import-control-flow-extraction.jsonl`, etc. |
| `hooks/sync-trigger.sh` | Node block calls `stampDrift` exactly as today | No protocol change; the lib swap is invisible to the hook |
| `lib/cli/verify.mjs` | `adev verify check-drift` reads the latest non-cleared `code_drift_detected` event from the spec's JSONL | JSON output shape preserved (`{drifted, drift_source, drift_at}`); `drifted` derives from the inline boolean (cheap), `drift_source`/`drift_at` derive from the latest unresolved JSONL event |
| `scripts/migrate-drift-fields.mjs` | One-shot migration: scan every `.spec.md` for `drift_source`/`drift_at`; emit a `{event: "code_drift_detected", drift_source, drift_at}` JSONL line; strip both fields from frontmatter; leave `drift_detected: true` if it was true | Idempotent; lock-protected; safe to re-run; reports a count |
| `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` | Canonical event-variant table extended | Adds rows for `code_drift_detected` and `code_drift_cleared` so projections can recognize them as canonical (not unknown extensions) |
| `tests/lib/spec-drift.test.mjs` | Existing test cases continue to pass; new cases assert idempotent JSONL emission (no-op on already-drifted), `clearDrift`-re-arms-stamping, single-event-under-contention, and JSONL event shape (rev 3) | |

### Improvements

1. **Spurious conflicts disappear.** `drift_detected: true` is byte-identical on both sides of a concurrent stamp → git's three-way merge auto-applies the identical "both added" line. JSONL events live in per-spec files and append only — no shared lines for branches to fight over.

2. **Idempotent stamping.** Once a spec transitions clean→drifted, further edits to any tracked source produce no JSONL appends until `clearDrift` re-arms detection. A hot source file (e.g. `cli/index.mjs` referenced by ~28 specs) generates 28 appends on the first edit since the last clear cycle, and zero on every subsequent edit — eliminating the per-PR churn that produced JSONL merge conflicts even with `merge=union` configured. (Rev 3: rescinds the prior "multi-source history" property — see Revision History.)

3. **Conflict-resolution lossless.** No drift event is ever discarded by a rebase, because no rebase touches the JSONL append region of two branches at the same offset (each branch's events are at the end of its own copy, and append-only files merge cleanly when both branches add disjoint lines).

4. **Clean `git log <spec>`.** Drift events live in `.context-index/lifecycle-state/<slug>.jsonl`, not in the spec body. A `git log` against a spec shows real spec edits only.

5. **Charter Invariant rewritten (rev 3).** The "single drift_source, last-write-wins" constraint from charter rev 2 was replaced by "every detection is appended" in charter rev 3. Charter rev 4 rewrites it again to: "First detection per clean→drifted transition appends a `code_drift_detected` event and stamps `drift_detected: true`; subsequent stamps on an already-drifted spec are no-ops until `clearDrift` re-arms detection." The `Multi-file Drift Tracking` capability is replaced with `Idempotent Drift Stamping`.

## Changes Catalog

### ADDED

- `scripts/migrate-drift-fields.mjs` — one-shot migration tool that extracts existing `drift_source`/`drift_at` frontmatter fields into per-spec JSONL events.
- `{event: "code_drift_detected", drift_source, drift_at}` and `{event: "code_drift_cleared", drift_at}` event variants in the canonical lifecycle event-log schema (added to `lifecycle-event-log.spec.md`).
- Multi-source drift history is now retained per spec.
- New invariants: path canonicalization on `driftSource`; explicit `JSON.stringify` discipline for JSONL writes.

### MODIFIED

- `lib/spec-drift.mjs::stampDrift(specPath, driftSource)` — canonicalizes the path then appends a JSONL event AND ensures inline boolean is present. Same signature; behavioral semantics extended from "overwrite single field" to "append event + ensure flag".
- `lib/spec-drift.mjs::clearDrift(specPath)` — appends a `code_drift_cleared` JSONL event AND removes the inline boolean. Same signature.
- `lib/spec-drift.mjs::hasDrift(specPath)` — reads the inline `drift_detected: true` boolean (no JSONL traversal in the hot path).
- `lib/cli/verify.mjs::check-drift` — sources `drift_source`/`drift_at` from the latest unresolved JSONL event. JSON output shape unchanged.
- Charter `Invariants` section: Invariant 4 (overwrite-only) is replaced with "Every detection appends an event; the inline boolean is the derived rolled-up view."
- Charter `Capability Map`: "Drift Flag Stamping" status reset to `specified` for this rev; the deferred "Multi-file Drift Tracking" row moves into the active table at `specified` AND is removed from the Deferred Capabilities table.
- Charter `Domain Model > Entities`: "Drift Flag" entity changes attribute set to `drift_detected` only; "Drift Event" attribute set is the canonical source of `drift_source`/`drift_at`.
- `lifecycle-event-log.spec.md` canonical event-variant table — adds `code_drift_detected` and `code_drift_cleared` rows.

### REMOVED

- `drift_source` and `drift_at` YAML frontmatter fields (post-migration). The migration script strips them; new stamping never writes them to frontmatter.
- Charter "Multi-file Drift Tracking" row removed from the Deferred Capabilities table (promoted to active Capability Map).

### RENAMED

- *(none in code surface; event names are NEW, not renames)*

## Migration Path

### Step 0: Canonicalize event variants in `lifecycle-event-log.spec.md`

- **What:** Edit `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` to add two rows to its canonical event-variant table: `code_drift_detected` (payload: `drift_source`, `drift_at`) and `code_drift_cleared` (payload: `drift_at`). Both are non-step events emitted ad-hoc by `lib/spec-drift.mjs`. Bump `lifecycle-event-log.spec.md` revision and re-run `/adev:review-specs` on it before proceeding to Step 1.
- **Why first:** Without canonical registration, `currentState` projection treats the events as unknown extensions and downstream consumers cannot rely on them. This is the CON-4 blocker from rev 1 review.
- **Risk:** Low — markdown-only edit to a sibling charter spec.
- **Verification:** `/adev:review-specs` for `lifecycle-event-log.spec.md` passes. `currentState` test fixtures cover the two new variants.

### Step 1: Add JSONL event emission alongside frontmatter writes (non-breaking)

- **What:** Modify `stampDrift` to canonicalize `driftSource` (`relative(projectRoot, resolve(projectRoot, driftSource))`; reject if it escapes `projectRoot`) and ALSO append a `{event: "code_drift_detected", drift_source, drift_at}` JSONL event via `lib/lifecycle-state.mjs::appendEvent`. Modify `clearDrift` to ALSO append `{event: "code_drift_cleared", drift_at}`. Both functions keep writing to frontmatter exactly as today.
- **Why next:** Establishes the JSONL signal without removing the legacy fields. Production-safe to roll out.
- **Risk:** Low — additive only. Existing readers see no change.
- **Verification:** All current `spec-drift.test.mjs` cases pass. New tests: (a) JSONL event is appended on stamp and clear; (b) path canonicalization is applied; (c) traversal escape (`../../etc/passwd`) is rejected with a thrown error.

### Step 2: Switch `lib/cli/verify.mjs::check-drift` to source from JSONL

- **What:** Rewrite the `drift_source`/`drift_at` extraction in `verify.mjs` (lines 138-156) to read the latest `code_drift_detected` event from the spec's JSONL that has not been superseded by a later `code_drift_cleared` event. Output JSON shape preserved.
- **Why next:** Decouples the CLI surface from frontmatter parsing while the migration is still in flight. After this step, no production reader depends on the frontmatter `drift_source`/`drift_at` fields.
- **Risk:** Low — the CLI output is the only public contract, and it does not change shape. Existing JSONL consumers see no change either.
- **Verification:** New test in `tests/cli/verify.test.mjs` (or extension of existing) covering: (a) spec with frontmatter fields only (legacy fallback returns `{drifted: true, drift_source: null, drift_at: null}`), (b) spec with JSONL events only, (c) spec with both — JSONL wins. `npm test` green.

### Step 3: Stop writing `drift_source`/`drift_at` to frontmatter

- **What:** Remove the frontmatter `drift_source`/`drift_at` writes from `stampDrift`; keep only the inline `drift_detected: true` boolean. Mirror change in `clearDrift` (only the boolean is removed). Update `hasDrift` to read the boolean (it already does; verify).
- **Why next:** The conflict source is the per-edit timestamp values on the same frontmatter line. Removing the writes closes the conflict window for any spec stamped from this commit forward.
- **Risk:** Medium — readers that bypass `verify.mjs` and parse frontmatter directly would break. Step 2 + the migration script (Step 4) ensure no such readers remain in-tree.
- **Verification:** `tests/lib/spec-drift.test.mjs` is updated to assert frontmatter no longer carries `drift_source`/`drift_at`; JSONL carries them. `npm test` green.

### Step 4: Run one-shot migration over existing specs

- **What:** Create `scripts/migrate-drift-fields.mjs`. For every `.spec.md` under `.context-index/specs/**`, acquire the same lock that `stampDrift` uses (via `lib/lifecycle-state.mjs::withLock(specPath, async () => ...)` or equivalent). Inside the lock: read frontmatter, extract `drift_source`/`drift_at` values, validate the extracted `drift_source` as a canonical relative path (reject + warn + skip the spec if traversal escape), append `{event: "code_drift_detected", drift_source, drift_at}` to `.context-index/lifecycle-state/<slug>.jsonl` UNLESS a matching event with the same `drift_at` already exists in the JSONL, strip the two frontmatter fields, leave `drift_detected: true` if it was true.

  **Idempotency rules:**
  - A spec is "already migrated" iff `drift_source`/`drift_at` are absent from frontmatter — script is a no-op.
  - A spec is "needs migration" iff `drift_source`/`drift_at` are present in frontmatter — append event + strip fields.
  - A spec is "partial state" iff both frontmatter AND a matching JSONL event (same `drift_at` timestamp) are present — log debug, strip fields without re-appending the event, treat as recovered.
  - Re-running the script on a fully-migrated repo is a no-op.

  Provides `--dry-run` mode that prints planned changes without writing.

- **Why next:** Drains the existing frontmatter pollution into the new store, so `verify.mjs` and `hasDrift` see consistent state across old and new specs.
- **Risk:** Medium — touches every spec file. Mitigations: idempotent (see rules above); dry-run mode; per-spec lock prevents race with concurrent hook fires; reports per-spec changes; runs under the existing constitution's atomic-write discipline (`.partial` + rename, see `agent-reliable-state-artifacts` charter).
- **Verification:** Dry-run output matches expected file list. Live run leaves repo with zero `drift_source`/`drift_at` matches in any `.spec.md`. Re-run is a no-op (verified by test). Traversal-escape input (e.g., synthesized `drift_source: ../../etc/passwd`) is rejected with a warning and the spec is skipped. `npm test` still green.

### Step 5: Update charter invariants + capability map

- **What:** In `.context-index/specs/features/spec-drift-detection/charter.md`:
  1. Rewrite Invariant 4 to: "Every detection appends a `code_drift_detected` event to the spec's JSONL; the inline `drift_detected` boolean is the derived rolled-up view. Multiple sources are preserved as separate events, not overwritten."
  2. **Remove** the "Multi-file Drift Tracking" row from the Deferred Capabilities table (do not leave a tombstone).
  3. **Add** "Multi-file Drift Tracking" to the active Capability Map with status `specified` (will flip to `validated` after this spec passes `/adev:validate`).
  4. Update "Drift Flag Stamping" capability status to `specified` for this revision.
  5. Bump charter `revision` from 2 → 3.
- **Why next:** Charter must reflect the new contract before any further work in this module is planned against the old invariant.
- **Risk:** Low — markdown-only edit. No code impact.
- **Verification:** `/adev:review-specs` passes against the revised charter; the Deferred row is gone; the active Capability Map shows "Multi-file Drift Tracking" at `specified`.

### Step 6: Update skill prose where it mentions drift fields

- **What:** Scan `skills/validate/SKILL.md`, `skills/review-specs/SKILL.md`, `skills/plan/SKILL.md`, `skills/hygiene/SKILL.md` for any prose that says "the spec's `drift_source` / `drift_at` frontmatter field" and rephrase to "the spec's latest `code_drift_detected` event in lifecycle-state" or "the inline `drift_detected` flag" as appropriate. None of these skills parse frontmatter directly today, so the change is wording-only.
- **Why last:** Once the data model is settled (Steps 0-5), the skill prose can describe it accurately without further churn.
- **Risk:** Low — markdown edits.
- **Verification:** Skill-prose validation (`tests/skills/no-stale-format-refs.test.mjs` or equivalent) does not flag the updated phrasing.

## Invariants

- [ ] All existing tests continue to pass at every step
- [ ] `adev verify check-drift` JSON output shape (`{drifted, drift_source, drift_at}`) is preserved across all steps
- [ ] `hasDrift(specPath)` returns the same boolean before and after each step for any given spec state
- [ ] Hook protocol (exit 0; optional `{type: "warning", message}` lines to stdout) unchanged
- [ ] No spec loses drift state during migration (Step 4 is idempotent and lossless)
- [ ] `drift_detected: true` boolean inline behavior preserved: when present, the spec is drifted; when absent, not
- [ ] No new external dependencies (Node built-ins only)
- [ ] **Path canonicalization (SEC-1):** `stampDrift` and `migrate-drift-fields.mjs` canonicalize `drift_source` via `relative(projectRoot, resolve(projectRoot, driftSource))` and reject any value that resolves outside `projectRoot`
- [ ] **JSON serialization discipline (SEC-2):** All JSONL writes use `JSON.stringify(event) + '\n'`; all reads use `JSON.parse` per-line. Special characters in any payload field (newlines, quotes, backslashes) are handled transparently by JSON
- [ ] **Authority rule (SA-2, ADR 0011 coordination):** Only `/adev:implement` calls `clearDrift`. `/adev:validate --restamp` does NOT clear drift, even though it re-stamps the source-manifest

## Behavioral Contract

### Behaviors

1. **When** a file edit triggers `sync-trigger.sh` and the edited path appears in some spec's `source-manifest.files[]` AND the spec's frontmatter does NOT already contain `drift_detected: true`, **then** `stampDrift` canonicalizes the edited path to a project-relative form, appends a `{event: "code_drift_detected", drift_source: <canonical relative path>, drift_at: <ISO timestamp>}` line to `.context-index/lifecycle-state/<spec-slug>.jsonl` AND writes `drift_detected: true` to that spec's frontmatter. (Rev 3: emission gated on the clean→drifted transition. The path-canonicalization and traversal-rejection invariants from SEC-1 still apply whenever a stamp WOULD emit.)
2. **When** the same spec is stamped repeatedly while already drifted (frontmatter `drift_detected: true` present, no intervening `clearDrift`), **then** every stamp after the first is a no-op: no JSONL event is appended, no frontmatter mutation occurs. A second `code_drift_detected` event for the same spec is only produced after `clearDrift` removes the inline boolean (and emits `code_drift_cleared`) and the next `stampDrift` re-arms detection. (Rev 3: replaces the prior "multi-source accumulation" behavior. No downstream consumer reads the historical events; only the latest unresolved detection is surfaced by `/adev:hygiene`, `/adev:validate`, `/adev:plan`, and `adev verify --check-drift`.)
3. **When** `/adev:implement` (or any caller of `clearDrift`) resolves drift on a spec, **then** `clearDrift` appends a `{event: "code_drift_cleared", drift_at: <ISO timestamp>}` event to the JSONL AND removes the inline `drift_detected: true` boolean from frontmatter.
3b. **When** `/adev:validate --restamp` re-stamps the source-manifest (per ADR 0011), **then** it does NOT call `clearDrift`. The drift flag remains until `/adev:implement` clears it. Rationale: validation confirms code-matches-spec; implementation confirms the plan cycle is complete. Two distinct authority signals; only the implementation signal clears drift.
4. **When** `hasDrift(specPath)` is called, **then** it returns `true` iff the spec's frontmatter contains `drift_detected: true` (no JSONL traversal in the hot path).
5. **When** `adev verify check-drift --spec <path>` is run, **then** it emits JSON of shape `{drifted: boolean, drift_source: string|null, drift_at: string|null}`. `drifted` comes from the inline boolean. `drift_source`/`drift_at` come from the latest `code_drift_detected` event in the JSONL that has not been superseded by a later `code_drift_cleared` event. **Legacy fallback (SA-1):** If the JSONL has no such event but the inline boolean is true (legacy specs pre-Step-4 migration), both `drift_source` and `drift_at` are `null` and `drifted` is `true`. Operators interpreting `{drifted: true, drift_source: null, drift_at: null}` should consult `git log <spec>` for the historical drift source — the migration has not yet drained the legacy frontmatter into JSONL for this spec.
6. **When** the migration script `scripts/migrate-drift-fields.mjs` is run on a spec that has `drift_source`/`drift_at` in frontmatter, **then** it acquires the spec's lock, canonicalizes the extracted `drift_source` (rejecting + warning on traversal escape), appends an equivalent `{event: "code_drift_detected", drift_source, drift_at}` event to the spec's JSONL UNLESS a matching event with the same `drift_at` already exists, strips the two frontmatter fields, and leaves the `drift_detected: true` boolean if it was present.
7. **When** the migration script runs against a spec that has no `drift_source`/`drift_at` in frontmatter, **then** it is a no-op (idempotent).
8. **When** two concurrent feature branches each cause `stampDrift` to fire on overlapping specs (different `source` files), **then** a `git merge` or `git rebase` of one branch onto the other resolves cleanly with no content conflict on the spec file (frontmatter boolean is identical "both added") and no content conflict on the JSONL (each branch's appends are disjoint lines added at the end of its own copy).

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|--------------------------|
| `stampDrift` called with a spec that has no `source-manifest` block | No-op; returns without writing | — (charter invariant 1 preserved) |
| `stampDrift` called with a `driftSource` not in the spec's `source-manifest.files[]` | Event is still appended (the hook scans against the manifest, so this case is unreachable in production; but the lib does not re-validate to avoid duplicate IO) | — |
| `stampDrift` called with a `driftSource` that resolves outside `projectRoot` (traversal escape) | Throws `PATH_TRAVERSAL_REJECTED`; no event written; no frontmatter mutation | `PATH_TRAVERSAL_REJECTED` |
| JSONL file is missing when `clearDrift` or `verify` runs | Treated as "no events"; for `verify`, the inline boolean alone determines `drifted` (returns `{drifted, drift_source: null, drift_at: null}`) | — |
| Concurrent `stampDrift` calls against the same spec | Whichever call wins the spec's lock first reads `drift_detected: false`, emits the JSONL event, and writes the frontmatter boolean. The contending call(s) re-read frontmatter under the lock, observe `drift_detected: true`, and no-op. Exactly one event lands per clean→drifted transition. (Rev 3: replaces the prior "both append cleanly" behavior — see Behavior 2.) | — |
| Concurrent migration-script + hook fire against the same spec | Migration acquires the spec's lock before reading frontmatter; the concurrent hook waits, then sees stripped frontmatter and appends only the new event. No duplicate events. | — |
| Migration script encounters a malformed spec frontmatter | Logs a warning, skips that spec, continues; non-zero exit at the end if any spec was skipped | exit 1 with summary |
| Migration script extracts a `drift_source` that fails canonicalization (traversal escape, non-UTF-8) | Logs a warning naming the spec + value, skips the spec, continues; exit 1 with summary | exit 1 with summary |

## System Constitution Reference

- **Principle:** "Minimize external dependencies — prefer Node.js built-ins" — Applies because the JSONL append reuses existing `lib/lifecycle-state.mjs` which is Node-built-in-only.
- **Principle:** "Pure ESM — all `.mjs` files" — Applies: `scripts/migrate-drift-fields.mjs` and the modified lib files remain ESM.
- **Principle:** "Hook protocol compliance — hooks read JSON from stdin + env vars, exit 0 (allow) or 2 (block), output JSON to stdout" — Applies: `sync-trigger.sh` protocol is preserved; only the inline Node block's lib call changes semantics, not the hook surface.
- **Principle:** *Architecture boundary*: Adding new dependencies requires human approval; changing the hook protocol requires human approval. — This spec does neither.
- **ADR 0011 (Source-Manifest Re-stamping Authority):** This spec coordinates with ADR 0011 by establishing in Behavior 3b that `/adev:validate --restamp` does NOT clear drift. Only `/adev:implement` does.

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Read-path performance (CON-5) | `hasDrift(specPath)` reads only the inline frontmatter boolean and completes in O(1) file reads. `adev verify check-drift` reads the spec's JSONL (typical size: <50 events per spec in production) and completes in <100ms for any spec with under 500 events. |
| Concurrency | All JSONL writes are lock-protected via `lib/lifecycle-state.mjs`. Migration script acquires the same lock. No duplicate events under any interleaving of hook + migration. |
| Idempotency | Migration is safely re-runnable. `stampDrift` and `clearDrift` are safe to invoke repeatedly. |
| Backward compatibility | `adev verify check-drift` JSON output shape unchanged. Specs without `source-manifest` blocks are still skipped silently. Specs migrated only partially (boolean still set, fields stripped, no JSONL event) return `{drifted: true, drift_source: null, drift_at: null}` per Behavior 5 legacy fallback. |
| Security | Path canonicalization (Invariant 8) rejects traversal escape in `driftSource` at every write site (`stampDrift`, migration script). JSON serialization (Invariant 9) handles special characters transparently. |

## Acceptance Criteria

- [ ] All existing tests in `tests/lib/spec-drift.test.mjs` pass without modification (or with updates that reflect the new assertion targets, not new behaviors)
- [ ] New tests cover: JSONL event emission on stamp, JSONL event emission on clear, multi-source append, `hasDrift` reads boolean only, `verify check-drift` sources from JSONL, migration script idempotency, migration script dry-run, **path canonicalization (SEC-1)**, **traversal-escape rejection (SEC-1)**, **concurrent migration + hook (SEC-3)**, **malformed legacy frontmatter handling (SEC-4)**
- [ ] No `drift_source:` or `drift_at:` fields remain in any `.context-index/specs/**/*.spec.md` frontmatter after Step 4
- [ ] Two demo branches each invoking `stampDrift` on overlapping specs from different `source` files can be merged via `git merge` or `git rebase` with zero content conflicts on the spec file (verified via integration test in `tests/integration/`)
- [ ] Charter (`.context-index/specs/features/spec-drift-detection/charter.md`) revision bumps to 3; Invariant 4 rewritten; Capability Map updated; **"Multi-file Drift Tracking" Deferred row REMOVED (not left as tombstone)**; added to active Capability Map at `specified`
- [ ] `lifecycle-event-log.spec.md` canonical event-variant table contains `code_drift_detected` and `code_drift_cleared` rows; revision bumped and re-reviewed (Step 0)
- [ ] All quality gates pass (`npm test`)
- [ ] `/adev:validate` passes for this spec
- [ ] No constitutional violations introduced
- [ ] `lib/cli/verify.mjs` `check-drift` JSON output shape (`{drifted, drift_source, drift_at}`) verified unchanged via test
- [ ] **Read-path performance criterion (CON-5):** integration test asserts `adev verify check-drift` completes in <100ms on a spec with 100 accumulated JSONL events
