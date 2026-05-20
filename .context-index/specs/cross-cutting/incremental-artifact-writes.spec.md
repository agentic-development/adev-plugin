---
affects: [cli-driver-surface, agent-reliable-state-artifacts, lifecycle-artifacts]
kind: behavioral
status: validated
risk_level: medium
mode: cross-cutting
revision: 2
created: 2026-05-17
updated: 2026-05-17
tracker-ref: issue-504
source-manifest:
  sha: "a53bfcc"
  files:
    - .context-index/manifest.yaml
    - .context-index/specs/features/agent-reliable-state-artifacts/charter.md
    - .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md
    - .gitignore
    - cli/index.mjs
    - docs/partial-artifacts.md
    - lib/cli/partial.mjs
    - lib/diagnostics/event-schemas.mjs
    - lib/lifecycle-events.mjs
    - lib/lifecycle-state.mjs
    - lib/partial-artifact.mjs
    - skills/build/SKILL.md
    - skills/implement/SKILL.md
    - skills/plan/SKILL.md
    - skills/specify/SKILL.md
    - skills/validate/SKILL.md
    - tests/cli/partial.test.mjs
    - tests/integration/partial-resume-end-to-end.test.mjs
    - tests/integration/scanner-invisibility.test.mjs
    - tests/lib/lifecycle-state-partial-recovery.test.mjs
    - tests/lib/partial-artifact-concurrency.test.mjs
    - tests/lib/partial-artifact-validation.test.mjs
    - tests/lib/partial-artifact.test.mjs
  computed-at: "2026-05-17T22:02:42.030Z"
drift_detected: true
---

# Live Spec: Incremental artifact writes — `.partial` + atomic-rename for agent-authored artifacts

<!-- Cross-cutting spec; no parent charter.
     Affects: cli-driver-surface, agent-reliable-state-artifacts, lifecycle-artifacts.
     Tracker: issue-504 (upstream Claude API streaming failures that occasionally
     drop long Write tool calls mid-stream — bug is INTERMITTENT, not stable, and
     outside project control).
     This spec was authored 2026-05-17 using its own pattern — written incrementally
     to .partial then renamed.

     Revision 2 (2026-05-17): Resolves rev-1 blockers and warnings —
     - SA-1/CON-1: introduces a new canonical event variant `partial_recovery`
       (matching the naming pattern of `plan_task` / `step_failed` / `recovery_record`)
       rather than overloading the existing `debug_intervention`. Requires a paired
       amendment to `agent-reliable-state-artifacts/lifecycle-event-log.spec.md`.
     - CON-2: introduces a dedicated `reportPartialRecovery()` helper rather than
       widening `reportIntervention`'s `{kind, note}` contract.
     - SA-2/CON-4: prescriptively distinguishes `.tmp` (byte-level atomic-rename
       staging, transient) from `.partial` (artifact-level incremental authoring,
       durable, recoverable). Stated as an invariant; not a follow-up.
     - SEC-1: orphan-lock liveness fix via sidecar `.partial.lock` with PID +
       start-ts. Steal-on-stale instead of wedging for 24h.
     - SEC-2: path-containment via `assertWithin` is mandatory at every helper
       and CLI verb entry point. New error code `INVALID_PARTIAL_PATH`.
     - SA-6: `.partial` files MUST carry a `partial_schema: <skill>@<version>`
       marker in the first authored chunk; auto-resume checks it.
     - SA-3 + CON-5: postcondition documents scanner-invisibility of
       `*.spec.md.partial` (and similar). Write-state suffixes vs artifact-kind
       suffixes are orthogonal taxonomies.
     - SA-7: Module Impact Map row 2 enumerates the three required
       lifecycle-event-log amendments (spec, lib, helper).
     - SEC-3/4 + CON-3: project-root-relative paths in lifecycle events;
       PARTIAL_OVERSIZE tightened to 3×; error codes use subject-first naming. -->

## Behavioral Contract

<!-- This spec defines a uniform write protocol for any skill that produces a
     non-trivial artifact, regardless of whether it runs foreground or as a
     subagent. The protocol survives mid-stream API failures by checkpointing
     to disk frequently and using atomic rename as the "I'm done" signal.

     The pattern: write to `<final-path>.partial` in checkpointed chunks; atomic
     rename to `<final-path>` as the "commit" signal. Orchestrators on resume
     detect `.partial` files and offer continuation or restart.

     Threshold: MANDATORY for artifacts whose final size would exceed ~2 KB.
     Below that threshold a single Write is cheap to retry and the overhead of
     incremental authoring isn't justified. -->

### Preconditions

- The artifact's destination directory exists (or can be created by the skill before first write).
- The destination filesystem supports atomic `rename(2)`: POSIX guarantees this on same-filesystem renames; Node's `fs.renameSync` uses `MoveFileExW` with `MOVEFILE_REPLACE_EXISTING` on Windows, which is also atomic.
- The skill knows its artifact's logical structure (sections, tasks, commits) well enough to checkpoint at sub-unit boundaries.
- The skill produces a non-trivial artifact: ≥ 2 KB final size, OR ≥ 3 logical sections, OR > 5 minutes of subagent reasoning to produce. Trivial artifacts may direct-write.
- A `.gitignore` entry exists for `*.partial` and `*.partial.lock` files. (Adoption check; this spec doesn't enforce programmatically — see Task Map.)
- Every `.partial` file's first authored chunk includes a machine-readable schema marker `partial_schema: <skill>@<schema-version>` (e.g., `plan@1`, `spec@1`, `validate@1`). The schema version corresponds to the authoring skill's partial-format version; bumped when the skill changes its checkpoint layout. The resume path checks this marker before parsing.

### Invariants

- **Write-state suffix taxonomy.** `.tmp`, `.lock`, and `.partial` (plus `.partial.lock`) are *write-state* suffixes orthogonal to the *artifact-kind* suffix taxonomy defined by `spec-file-suffixes.spec.md` (`.spec.md`, `.plan.md`, `.review.md`, `.validate.md`). The two layers compose without aliasing:
  - **`.tmp`** — byte-level atomic-rename staging. Lifetime: milliseconds. Created by `fs.writeFileSync(tmpPath); fs.renameSync(tmpPath, finalPath)` idiom. Never inspected for recovery; never persisted across process exit. Existing exemplars: `lib/build-state.mjs::atomicWriteJson`, `lib/issues/json-adapter.mjs::_write` (the random-hex `.tmp` suffix).
  - **`.lock`** — exclusive-write coordination. Lifetime: scoped to a single critical section (typically milliseconds for byte-level CAS, or for the duration of one mutator call). Created via `openSync(O_EXCL)`. Existing exemplar: `lib/issues/json-adapter.mjs` (`tasks.json.lock`).
  - **`.partial`** — artifact-level incremental authoring. Lifetime: minutes to hours. Persists across process exit specifically so a successor invocation can resume or discard. Committed via atomic rename to the canonical filename. **This spec introduces this suffix.**
  - **`.partial.lock`** — sidecar coordination for `.partial` writers. Lifetime: matches the `.partial`'s authoring window. Holds PID + start timestamp so an orphaned lock can be detected and stolen (see Behavior 6 below). **This spec introduces this suffix.**

  Tooling never aliases the four suffixes: recovery scanners look only at `.partial` (not `.tmp`); lock-coordination logic looks only at `.partial.lock` (not the JsonAdapter's `tasks.json.lock`); etc.

### Behaviors

1. **When** a skill begins authoring a non-trivial artifact **then** it writes to `<final-path>.partial` (suffix appended to the final path) rather than directly to `<final-path>`. The `.partial` file MUST become visible on disk after the first Write call so that any subsequent failure leaves a recoverable artifact. The first chunk MUST include the `partial_schema` marker (see Preconditions).

2. **When** a skill has completed authoring **then** it atomically renames `<final-path>.partial` → `<final-path>` via a single `renameSync` call, then unlinks `<final-path>.partial.lock`. The rename is the artifact's "commit" signal. Readers MUST treat the final filename as authoritative and the `.partial` suffix as in-progress.

3. **When** a skill makes incremental progress on a long artifact **then** it appends each logical sub-unit to the `.partial` file as soon as that sub-unit is coherent. Per-artifact-type cadence:
   - Markdown artifacts (plans, specs, validation reports): one section (H2 boundary or coherent block) per append.
   - Multi-file code changes: one git commit per logical chunk (the commit IS the checkpoint).
   - Lifecycle-state JSONL: defer to existing `appendEvent` primitive — already incremental by construction; no change.

4. **When** a skill detects an existing `<final-path>.partial` on entry **then** it inspects the partial content (reading the `partial_schema` marker first) and chooses one of: (a) **resume** from where the prior invocation left off, OR (b) **discard** and start fresh. The skill MUST NOT silently overwrite a `.partial` file without acknowledging it. Resumption is the preferred behavior when feasible. Discard-and-restart is mandatory when the schema marker is missing, unparseable, or names a different `<skill>@<version>` than the current skill expects (→ `PARTIAL_ARTIFACT_SCHEMA_MISMATCH`).

5. **When** an orchestrator (e.g., `/adev:build`) inspects a spec's artifacts on resume **then** it lists any `.partial` files alongside the final artifacts. If a `.partial` exists for the step about to dispatch, the orchestrator offers three choices: **resume** (re-dispatch the skill, pass the partial as context), **discard** (delete the partial AND its `.partial.lock` if present, start fresh), or **abort** (stop the pipeline for manual inspection). In `--auto` mode, the orchestrator defaults to **resume** when the schema marker checks out; if the marker is missing or mismatched, it falls back to **discard** with a logged warning.

6. **When** a skill attempts to acquire the `.partial` write slot **then** it creates `<final-path>.partial.lock` via `openSync(O_EXCL)` containing `{pid, started_at}` as JSON. If the open fails with `EEXIST`:
   - Read the existing lock; parse `{pid, started_at}`.
   - **If `pid` is still alive** (kill -0 returns 0): another writer holds the slot. Return `PARTIAL_ARTIFACT_LOCKED` (caller may wait + retry or abort per its policy).
   - **If `pid` is dead** AND `now - started_at > partial_stale_seconds` (default 30s, configurable via `manifest.lifecycle.partial_stale_seconds`): treat as orphaned; unlink the lock and the `.partial` file; emit a `partial_recovery` lifecycle event with `action: stolen`; retry the `openSync` once. **If retry also fails:** return `PARTIAL_ARTIFACT_LOCKED`.
   - **If `pid` is dead** AND `now - started_at <= partial_stale_seconds`: writer crashed recently; treat as transient and retry after a short backoff. Configurable retry count (default 3) — beyond that, return `PARTIAL_ARTIFACT_LOCKED`.

   Lock-stealing replaces the rev-1 design where `.partial` files would wedge the system for the full `partial_stale_hours` window after any SIGKILL. The 30-second threshold balances "give the writer a chance to finish" against "don't block forever on a crashed process."

7. **When** a `.partial` file (without a live lock) is older than `manifest.lifecycle.partial_stale_hours` (default 24 hours) **then** the orchestrator MAY treat it as orphaned during resume scans. The user is prompted before resuming in interactive mode; `--auto` mode discards orphans with a logged warning. This is a secondary defense for partials whose lock was already removed (e.g., by manual cleanup) but whose content lingers.

8. **When** the lifecycle log records a partial-recovery action **then** it emits a `partial_recovery` event (new canonical variant). Fields: `{ ts, event: "partial_recovery", artifact_path, prior_partial_ts, action, dispatch_mode }`. Where:
   - `artifact_path` — project-root-relative path (never absolute), so log entries are portable across clones.
   - `prior_partial_ts` — ISO-8601 timestamp of the prior `.partial` file's mtime.
   - `action` — `"resumed" | "discarded" | "stolen" | "aborted"`.
   - `dispatch_mode` — `"foreground" | "subagent"`.

   The event is emitted via a new helper `reportPartialRecovery(projectRoot, specPath, args)` — dedicated to this variant, NOT a widening of `reportIntervention`. The helper mirrors the discipline of `reportReviewer` / `reportValidator` / `reportPlanTask` (one helper per event variant; tight argument schema).

### Postconditions

- The final artifact at `<final-path>` always represents a complete, coherent state — never a partial document. Any reader that opens the final filename sees authoritative content.
- A `.partial` file at `<final-path>.partial` always represents in-progress or interrupted authoring. Readers MUST treat its content as not-yet-committed and MUST NOT base further work on it without explicit recovery.
- Atomic rename guarantees: at any instant, the filesystem contains either the prior `<final-path>` content, the new content, or both filenames briefly (during the rename window) — never a half-written final file.
- No skill produces an artifact larger than ~2 KB via a single direct Write to `<final-path>`. Below the threshold, direct-write remains permitted.
- Lifecycle log entries record every partial-recovery via the dedicated `partial_recovery` event so retros can quantify the upstream API failure rate and the cost we paid for it.
- The `.gitignore` repo-wide patterns for `*.partial` and `*.partial.lock` files prevent committed-orphan breakage across clones (analogous to how `tasks.json.lock` was added in commit `ba44d3b`).
- **Scanner invisibility.** Canonical artifact-kind globs (`*.spec.md`, `*.plan.md`, `*.review.md`, `*.validate.md` per `spec-file-suffixes.spec.md`) do NOT match `<name>.<type>.md.partial` — partials are invisible to spec-aggregation tooling by construction. This is load-bearing: `/adev:hygiene` / `/adev:status` / `/adev:repomap` etc. operate on canonical artifacts only and never accidentally pull partial content into reports. A future regression that broadens a glob to `*.md` would break this invariant; CI test recommended (see Task Map).
- **No suffix aliasing.** Per the write-state-suffix taxonomy invariant: `.tmp` is never inspected by partial-recovery logic, `.partial.lock` is never confused with JsonAdapter's `tasks.json.lock`, etc. Each suffix has one owner and one purpose.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `.partial` exists; skill chooses to resume | Read partial, verify `partial_schema` marker, parse progress, dispatch continuation | (no error — normal recovery path) |
| `.partial` exists; skill chooses to discard | Delete `.partial` and `.partial.lock`, emit `partial_recovery` (`action: discarded`), start fresh | (no error — normal recovery path) |
| `.partial` is malformed OR schema marker missing/mismatched | Treat as orphaned: prompt user interactively; in `--auto` mode discard with logged warning + `partial_recovery` (`action: discarded`). Do NOT parse-and-resume malformed or schema-mismatched partials. | `PARTIAL_ARTIFACT_SCHEMA_MISMATCH` |
| Atomic rename fails (permission, cross-filesystem, target locked) | Throw underlying `fs` error (`EACCES`, `EXDEV`, etc.); leave `.partial` and `.partial.lock` intact for inspection. `<final-path>` is not modified. | (existing `fs` errors) |
| Lock contention with live owner (`.partial.lock` exists, pid alive) | Return `PARTIAL_ARTIFACT_LOCKED`. Caller may retry-with-backoff or abort per its policy. Default: abort with `PARTIAL_ARTIFACT_LOCKED`. | `PARTIAL_ARTIFACT_LOCKED` |
| Lock contention with dead owner, started_at within stale threshold | Backoff and retry the lock acquire (default 3 retries). After budget: `PARTIAL_ARTIFACT_LOCKED`. | `PARTIAL_ARTIFACT_LOCKED` (after exhaustion only) |
| Lock contention with dead owner, started_at older than stale threshold | Steal the lock: unlink `.partial.lock` AND `.partial`; emit `partial_recovery` (`action: stolen`); retry `openSync`. | (no error — normal stale-recovery path) |
| `.partial` size exceeds 3× the expected artifact size | Treat as runaway: do NOT rename; warn the user; preserve `.partial` for inspection. Check fires on **every** append, not just at rename time. | `PARTIAL_ARTIFACT_OVERSIZE` |
| Helper or CLI verb invoked with a path that escapes `<projectRoot>/.context-index/` (or the allowlist in `manifest.lifecycle.partial_roots`) | Throw `Error` with `err.code = "INVALID_PARTIAL_PATH"`; do not perform any filesystem operation. Routed through the same `assertWithin` containment used by `lib/issues/json-adapter.mjs:97-109`. | `INVALID_PARTIAL_PATH` |
| Skill invoked as subagent; subagent dies before final rename | Subagent's `.partial` and `.partial.lock` survive. Parent receives no STEP_RESULT (standard subagent-failure handling). Next orchestrator resume finds the lock with a dead pid; steals if past the stale threshold, otherwise asks the user. | (no error — graceful degradation; the whole point of the pattern) |
| Skill invoked foreground; API drops mid-Write to `.partial` | The partial file on disk reflects whatever bytes landed (may be torn within a section, but section boundaries are reliable). Caller retries the Write; the partial's last coherent section is the resume point. The lock is still held by the same pid, so retry doesn't need lock recovery. | (no new error code — caller-side retry per the failed tool call) |

## System Constitution Reference

- **Principle 1: Minimize external dependencies.** The pattern uses only `node:fs` primitives (`writeFileSync`, `renameSync`, `openSync(O_EXCL)`, `statSync`, `unlinkSync`, `readFileSync`) and `process.kill(pid, 0)` for liveness checks — all built-ins.
- **Principle 2: Skills are primarily markdown.** This spec drives changes to multiple SKILL.md files. Companion helpers in `lib/` are acceptable but skills remain readable without them.
- **Principle 3: Pure ESM.** Companion helpers go in `lib/` as `.mjs`. No CommonJS.
- **Coding Standards — Patterns to Follow:** "Atomic file ops via temp+rename" (already exemplified by `lib/build-state.mjs::atomicWriteJson` and the CAS layer in `lib/issues/json-adapter.mjs`). This spec generalizes the same idiom to skill-authored artifacts AND adds the durable `.partial` layer.
- **Coding Standards — Path-containment:** `lib/issues/json-adapter.mjs::assertWithin` is the canonical pattern for resolving and validating user-controlled paths. This spec adopts it verbatim for all helper and CLI-verb entry points (see error case `INVALID_PARTIAL_PATH`).
- **Cross-reference to `agent-reliable-state-artifacts/charter.md`:** That charter's Invariant #6 ("atomic write or no write") governs adapter-internal state files at byte-level. This spec extends an analogous artifact-level invariant: every artifact write is either a complete final file or a `.partial`-prefixed in-progress draft — never a torn final. The two are complementary halves of the same reliability story; the spec's write-state-suffix taxonomy invariant explicitly states they never alias.
- **Cross-reference to `cli-driver-surface` charter:** The orchestrator-side detection of `.partial` files and the recovery flow are CLI verbs (`adev partial detect/resume/discard`), per the charter's "no inline Node in SKILL.md" rule.
- **Cross-reference to `lifecycle-event-log.spec.md` (paired amendment, REQUIRED):** This spec introduces `partial_recovery` as a new canonical event variant. The sibling spec's canonical variant list MUST be amended in lockstep (analogous to the cross-spec amendment pattern used by `concurrent-write-protection.spec.md` for the `seq` field). The sibling amendment adds the variant to the list, updates the fold switch documentation, and references `reportPartialRecovery()` as the helper.

## Module Impact Map

| Module | Impact | Changes Required |
|--------|--------|------------------|
| `cli-driver-surface` | High | New CLI verbs `adev partial {detect,resume,discard,inspect}` (the helper layer); skill prose update for `/adev:build` orchestrator to scan for `.partial` files on resume; integration with `--auto` mode defaults. |
| `agent-reliable-state-artifacts` | High (upgraded from "Medium" per SA-7) | Three paired amendments: (a) **`lifecycle-event-log.spec.md`** — add `partial_recovery` to the canonical event variant list, document the event-payload shape, reference `reportPartialRecovery()`. (b) **`lib/lifecycle-state.mjs`** — implement `reportPartialRecovery()` helper (NOT a widening of `reportIntervention`); extend the `currentState()` fold switch to fold `partial_recovery` events into a projection bucket (TBD: probably alongside `interventions[]` or as a new `partial_recoveries[]` array). (c) **Field discipline** — store `artifact_path` as project-root-relative; never absolute. |
| `lifecycle-artifacts` | Medium | Update template-rename guidance to acknowledge `.partial` and `.partial.lock` suffixes. Update `/adev:plan`, `/adev:implement`, `/adev:specify`, `/adev:validate` SKILL.md prose to mandate the pattern when authoring artifacts. |
| `task-management` | Low | No direct impact on issue board (`tasks.json` mutations already use CAS + `tasks.json.lock` — different mechanism, different suffix family). |
| `spec-lifecycle` | Low | Status enum doesn't change; `.partial` artifacts are a *write-state* concept, orthogonal to the spec-status state machine. |

## Integration Points

1. **`/adev:plan` ↔ this pattern.** Writes `.plan.md.partial` with `partial_schema: plan@1`; appends per H2 section; renames on completion. The plan-reviewer subagent step (failure-prone per `issue-504`) becomes safe to dispatch.

2. **`/adev:implement` ↔ this pattern.** TDD task commits are already incremental (one commit per task; `partial_schema: implement@1` if needed for source-manifest staging). Source-manifest stamping at the end uses `.partial → .final` rename of the spec's frontmatter region. Multi-file Writes within a single task use `.partial` if the file exceeds the threshold.

3. **`/adev:specify` ↔ this pattern.** `.spec.md.partial` (`partial_schema: spec@1`); section-per-append; rename on completion. Resumption straightforward — spec sections are independent.

4. **`/adev:validate` ↔ this pattern.** The existing `adev artifact commit` verb already does atomic temp+rename via a `.tmp` suffix. Per the write-state-suffix taxonomy invariant (Invariants section), **`.tmp` stays — it's the right suffix for byte-level atomic-rename staging** (ms-scale, never recovered). The validate skill does NOT migrate to `.partial`. (Resolves SA-2 / CON-4: the rev-1 ambiguity is now a clean "stay `.tmp`" decision.)

5. **`/adev:build` ↔ this pattern.** Orchestrator's resume path scans for `.partial` files for the spec being built. Detection logic in `lib/build-state.mjs` (existing helper); new sub-step before dispatching: "check for `.partial` artifact for this step's output; check `.partial.lock` for live owner; offer recovery per Behavior 5."

6. **Lifecycle log ↔ this pattern.** New canonical event variant `partial_recovery` (NOT a widening of `debug_intervention`). Dedicated helper `reportPartialRecovery()`. Cross-spec amendment to `lifecycle-event-log.spec.md` adds the variant in lockstep. Payload: `{ts, event, artifact_path (relative), prior_partial_ts, action, dispatch_mode}`.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Cross-spec amendment: `lifecycle-event-log.spec.md` | Add `partial_recovery` to canonical event variant list; document event payload shape; reference `reportPartialRecovery()` helper. Paired with this spec's implementation. | small |
| Add `partial_recovery` to `lib/lifecycle-state.mjs` | New `reportPartialRecovery(projectRoot, specPath, {artifact_path, prior_partial_ts, action, dispatch_mode})` helper. Extend `currentState()` fold to surface partial-recovery events (probably as a new `partialRecoveries[]` projection field or merged into `interventions[]` with a discriminator). | medium |
| Helper module: `lib/partial-artifact.mjs` | Pure helpers: `partialPath(finalPath)`, `lockPath(finalPath)`, `commitPartial(finalPath)`, `findPartials(specPath)`, `tryAcquireLock(finalPath, opts)`, `stealStaleLock(finalPath, opts)`, `isPartialStale(path, thresholdHours)`. Every entry point enforces `assertWithin` containment. | medium |
| Add `*.partial`, `*.partial.lock` to `.gitignore` | Two lines under each artifact directory (or repo-wide `**/*.partial`, `**/*.partial.lock`). Prevents stale pollution of clones. | small |
| Manifest knobs | `lifecycle.partial_stale_seconds` (default 30, for lock-steal threshold), `lifecycle.partial_stale_hours` (default 24, for orphan-content sweep), `lifecycle.partial_roots` (optional allowlist of containment roots beyond `.context-index/`), `lifecycle.partial_oversize_multiplier` (default 3). | small |
| Update `/adev:plan` SKILL.md | Mandate incremental section appends to `.plan.md.partial` with `partial_schema: plan@1` marker; final rename on success. Add resume-detection note in Step 0. | medium |
| Update `/adev:implement` SKILL.md | Tighten "commit per task" to a hard requirement (already largely true). Add `.partial` pattern for source-manifest stamping with `partial_schema: implement@1`. | medium |
| Update `/adev:specify` SKILL.md | Add incremental authoring guidance with `partial_schema: spec@1` marker. | small |
| Update `/adev:validate` SKILL.md | Document that validate keeps its existing `.tmp` artifact-commit pattern per the write-state-suffix taxonomy. No migration. | small |
| Update `/adev:build` SKILL.md | Add partial-scan logic to resume mode; define resume/discard/abort prompt; document `--auto` behavior. | medium |
| CLI verbs: `adev partial {detect,resume,discard,inspect}` | Per `cli-driver-surface` charter. Wrap helper module so skill prose doesn't embed Node. `inspect` shows the schema marker + lock state without modifying anything. | medium |
| Scanner-invisibility regression test | Test fixture: drop a `.spec.md.partial`, `.plan.md.partial`, etc., into the workspace. Run scanners (`/adev:hygiene`, `/adev:status`, `/adev:repomap`). Assert none of them pick up the partial content. | small |
| Helper module unit tests | Round-trip `partialPath` ↔ `commitPartial`; lock acquire / lock contention / lock steal under stale; staleness threshold; `findPartials` glob behavior; `assertWithin` rejection on path traversal. | medium |
| Orchestrator resume integration test | Fixture: build state with a `.partial` adjacent to a partially-completed step. Assert detection, prompt (or auto-resume), and re-dispatch correctness. | medium |
| Skill-level integration tests | One test per adopting skill: kill the skill mid-write, assert `.partial` + `.partial.lock` exist with last coherent section, re-dispatch, assert resumed run produces final artifact. | medium |
| Documentation | One-page explainer in `docs/` for skill authors. The "why" is the user-facing benefit; the "how" is the helper-module API. | small |

## Acceptance Criteria

- [ ] **Paired amendment landed.** `lifecycle-event-log.spec.md` is amended in lockstep to declare `partial_recovery` as a canonical event variant with documented payload shape and helper reference.
- [ ] `lib/lifecycle-state.mjs` exports `reportPartialRecovery(projectRoot, specPath, args)` accepting `{artifact_path, prior_partial_ts, action, dispatch_mode}` with `action` validated against the closed enum `{resumed, discarded, stolen, aborted}`. `reportIntervention` is unchanged.
- [ ] `currentState()` fold surfaces `partial_recovery` events in the projection (field name decided at implementation time; spec defers to plan).
- [ ] `lib/partial-artifact.mjs` exists and exports `partialPath`, `lockPath`, `commitPartial`, `findPartials`, `tryAcquireLock`, `stealStaleLock`, `isPartialStale` with the documented signatures. Every entry point that takes a caller-controlled path enforces `assertWithin` containment.
- [ ] Lock-acquire follows Behavior 6: `O_EXCL` creates the `.partial.lock` with `{pid, started_at}` payload; contention path checks `kill(pid, 0)` for liveness; stale dead-owner locks are stolen (`partial_recovery` event with `action: stolen` emitted); live owners produce `PARTIAL_ARTIFACT_LOCKED`.
- [ ] Every `.partial` file's first authored chunk includes a `partial_schema: <skill>@<version>` marker. Resume path checks the marker; mismatch produces `PARTIAL_ARTIFACT_SCHEMA_MISMATCH` and `--auto` falls back to discard.
- [ ] Error codes use subject-first naming: `PARTIAL_ARTIFACT_SCHEMA_MISMATCH`, `PARTIAL_ARTIFACT_LOCKED`, `PARTIAL_ARTIFACT_OVERSIZE`, `INVALID_PARTIAL_PATH`. (No adjective-only `PARTIAL_*` codes.)
- [ ] `PARTIAL_ARTIFACT_OVERSIZE` fires when partial size exceeds 3× expected (configurable via `manifest.lifecycle.partial_oversize_multiplier`). Check runs on every append, not just at rename.
- [ ] Lifecycle event `partial_recovery` carries `artifact_path` as a **project-root-relative** path. No absolute paths in committed JSONL.
- [ ] `*.partial` and `*.partial.lock` patterns in repo-wide `.gitignore`. CI gate or test fixture verifies.
- [ ] Scanner-invisibility regression test passes: dropping `.spec.md.partial` / `.plan.md.partial` / `.review.md.partial` / `.validate.md.partial` into the workspace does NOT cause `/adev:hygiene`, `/adev:status`, `/adev:repomap`, or any other canonical-suffix scanner to pick them up.
- [ ] At least one adopting skill's SKILL.md prose is updated AND exercised by an integration test that proves: kill the skill mid-write → `.partial` + `.partial.lock` exist → re-dispatch → final artifact correct. (One end-to-end proof sufficient for v1; full coverage of all four adopting skills is a follow-up.)
- [ ] No new runtime dependencies introduced (constitution Principle 1).
- [ ] All quality gates pass (`npm test`).
- [ ] No constitutional violations introduced.
- [ ] This spec itself was authored using the pattern it defines (rev 1 and rev 2 both written via `.partial` then atomic rename). Eats-its-own-dog-food acceptance — kept per SA-8; reviewers disagree on this one (CON-8 argues drop), spec author kept it.
