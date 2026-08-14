# Live Spec: Lifecycle Event Log

<!-- Live Spec within the agent-reliable-state-artifacts charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/agent-reliable-state-artifacts/charter.md -->

---
charter: agent-reliable-state-artifacts
status: validated
risk_level: high
milestone: 0.26.0
revision: 3
charter-revision: 3
created: 2026-05-11
updated: 2026-05-19
source-manifest:
  sha: "449d3d5"
  files:
    - lib/lifecycle-events.mjs
    - lib/lifecycle-state.mjs
    - tests/fixtures/lifecycle-state/concurrent-writer.mjs
    - tests/fixtures/lifecycle-state/crash-writer.mjs
    - tests/lib/lifecycle-state-arch.test.mjs
    - tests/lib/lifecycle-state-concurrent.test.mjs
    - tests/lib/lifecycle-state-crash.test.mjs
    - tests/lib/lifecycle-state-partial-recovery.test.mjs
    - tests/lib/lifecycle-state-perf.test.mjs
    - tests/lib/lifecycle-state.test.mjs
  computed-at: "2026-05-17T20:42:36.797Z"
drift_detected: true
---

## Behavioral Contract

The Lifecycle Event Log is a new library module (`lib/lifecycle-state.mjs`) that persists every event in a spec's lifecycle as a line in a per-spec JSONL file at `.context-index/lifecycle-state/<slug>.jsonl`. It exposes a small set of write primitives (`appendEvent`, `reportReviewer`, `reportValidator`, `reportStep`, `reportPlanTask`, `reportIntervention`, `reportPartialRecovery`), read primitives (`readEvents`, `filterEvents`), a state projector (`currentState`), a gate enforcer (`requireGate`), and aggregation helpers (`listLifecycleStates`, `slugFromSpec`, `ensureLifecycleState`, `hasLifecycleState`). Writes are append-only via `fs.appendFile`; no code path ever rewrites a log. Actor events (reviewer / validator reports) carry their severity stamped at write time, resolved once from existing domain config (`reviewers.yaml::severity_cap`, `gates.yaml::severity`); reads never touch domain config. `currentState()` folds the log into a state object — steps, plan tasks, interventions, partial recoveries — and the aggregation rule is: any `blocker`/`error` severity returning `FAIL` ⇒ step fails; lower severities returning `FAIL` ⇒ `PASS_WITH_NOTES`. The schema is open: a stable set of canonical event variants is documented, but unknown `event` values are preserved on read and ignored by core projections so domains can extend without forking the lib. `requireGate(state, stepName)` is the new prerequisite check that replaces filesystem-grep of `.review.md` frontmatter; it hard-blocks by default and softens to advisory via `manifest.yaml::lifecycle.gate_mode`.

## Naming Conventions (CON-1)

This spec mixes two distinct naming domains. They follow different conventions on purpose:

- **Event-discriminator names and event-only fields** use `snake_case`: `lifecycle_step`, `step_completed`, `step_failed`, `reviewer_report`, `validator_report`, `plan_task`, `debug_intervention`, `recovery_record`, `manual_override`, `partial_recovery`, `spec_revised`, `human_approval_required`, `task_id`, `aggregated_from`, `artifact_path`, `prior_partial_ts`, `dispatch_mode`, `from_revision`, `to_revision`, `addressed_blocker_ids`, `unresolved_blocker_ids`. This matches the convention established by the existing `lib/build-state.mjs` JSON schema (`recordStepResult` writes `retry_history`, etc.) and is the natural shape for new code.
- **Issue board WorkItem fields** preserve the existing `FileAdapter`/`IssueManagerInterface` convention, which is a mix: top-level fields like `id`, `title`, `status`, `priority`, `type`, `epicId`, `planRef`, `planTask` are camelCase, while the later-added fields `spec_ref` and `next_action` are snake_case. This mix is legacy of the file-adapter parser and is **preserved as-is** to keep the `IssueManagerInterface` stable across `FileAdapter`, `JsonAdapter`, and `BeadsAdapter`. Changing it is out of scope for this charter.
- **StateProjection fields** are camelCase (`currentStep`, `currentTask`, `startedAt`, `updatedAt`). The internal projection object is new code, not subject to the WorkItem-legacy mix. **Note:** within the projection, the `plan_tasks` key is renamed to `planTasks` per this convention (correcting CON-2).

The implementer must NOT rename `planRef`/`planTask` on the WorkItem to snake_case during this work — that would break the `IssueManagerInterface` parity invariant declared in the sibling `json-issue-board-adapter` spec.

## Path Safety (SEC-1, SEC-4)

The module enforces a path-containment invariant on every public function that takes a `specPath` or `projectRoot`:

1. **`projectRoot` normalization.** Every public function resolves `projectRoot` via `path.resolve()` at entry. The resolved path must contain `.context-index/manifest.yaml` (validated by `fs.existsSync`). If validation fails, the function throws `INVALID_PROJECT_ROOT`.
2. **Spec path containment.** `slugFromSpec(specPath)` and every function taking `specPath` must:
   1. Normalize via `path.resolve(projectRoot, specPath)`.
   2. Assert the resolved path starts with `path.resolve(projectRoot)` followed by `path.sep`. If not, throw `INVALID_SPEC_PATH` (path-traversal defense per OWASP/CWE-22).
   3. Assert the resolved path ends with `.spec.md`. If not, throw `INVALID_SPEC_PATH`.
3. **Log path containment.** The derived log path `<projectRoot>/.context-index/lifecycle-state/<slug>.jsonl` must satisfy `resolvedLogPath.startsWith(projectRoot + sep + '.context-index' + sep + 'lifecycle-state' + sep)`. If not (e.g., slug contains `..`), throw `INVALID_SPEC_PATH`.
4. **Slug character allowlist.** Slugs derived from spec filenames are constrained to `[a-z0-9._-]+`. Any other character causes `INVALID_SPEC_PATH`. Combined with the containment check, this defeats traversal via crafted spec filenames.

## System Constitution Reference

- **Principle:** "Minimize external dependencies — prefer Node.js built-ins" — Applies because this module uses only `node:fs`, `node:path`, and `node:crypto` (the latter for nothing more exotic than a temp-file suffix). No external library is introduced.
- **Principle:** "Pure ESM — all `.mjs` files" — Applies because `lib/lifecycle-state.mjs` is authored in ESM and exports named functions consumed by ESM callers (every lifecycle skill).
- **Principle:** "Skills are primarily markdown" — Applies because the lib does not invert the relationship: skills remain markdown, this module is a passive helper they call. No skill logic moves into the lib.
- **Architecture Boundary (Autonomous):** "Refactoring within a module's boundaries" — Applies because this lib lives inside the `agent-reliable-state-artifacts` module; no human approval needed to add or evolve it within the scope laid out in the charter.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Event schema + canonical variants | Define the open discriminated-union event shape and the canonical variants (`lifecycle_step`, `step_completed`, `step_failed`, `reviewer_report`, `validator_report`, `plan_task`, `debug_intervention`, `recovery_record`, `manual_override`, `partial_recovery`, `spec_revised`, `human_approval_required`). Include `ts` and `event` invariants. The `reviewer_report`, `step_completed`, `step_failed`, and `lifecycle_step` variants accept an OPTIONAL integer `revision: N` field added by the `review-block-auto-retry` cross-cutting spec. `step_completed` optionally carries `totals`, `model_breakdown`, and `skipped_lines` when emitted with `--from-summary`. | small |
| `appendEvent` primitive | Atomic-append-one-line implementation using `fs.appendFile` with `O_APPEND` semantics. Validates required fields (`ts`, `event`). Stamps `ts` if absent. Creates parent dir + file if missing. | small |
| `readEvents` primitive | Read file, split on newline, parse each line as JSON. Tolerates truncated final line (skip-and-continue). Returns `[]` for missing file. | small |
| `slugFromSpec` / path helpers | Compute slug from spec filename. Resolve path to `<projectRoot>/.context-index/lifecycle-state/<slug>.jsonl`. | small |
| `ensureLifecycleState` / `hasLifecycleState` | Idempotent bootstrap and existence check. | small |
| Convenience writers | `reportReviewer`, `reportValidator`, `reportStep`, `reportPlanTask`, `reportIntervention`, `reportPartialRecovery`. Each calls `appendEvent` after stamping severity (for actor events) via `loadDomainConfig` lookup. `reportPartialRecovery` follows the one-helper-per-variant discipline (NOT a widening of `reportIntervention`) and emits `partial_recovery` events. `reportStep` optionally accepts `totals`, `model_breakdown`, and `skipped_lines` — when present on a `completed` event, these are embedded in the `step_completed` payload. | medium |
| Severity resolution helper | Internal function that resolves an actor's severity from `reviewers.yaml`/`gates.yaml` for the resolved domain at write time. Caches the loaded config for the lifetime of the call only. | medium |
| `currentState` fold | Reducer over events producing the StateProjection. Handles every canonical variant; preserves unknown variants under an `unknownEvents[]` array. | medium |
| Aggregation algorithm | The fold's `step_completed`/`step_failed` synthesis: walk per-step reports, apply severity rule (any `blocker`/`error` FAIL ⇒ FAIL; lower ⇒ PASS_WITH_NOTES). | medium |
| `requireGate` enforcer | Look up prior step in projection. If not completed/passed, throw `GateError` (strict) or log warning (advisory). Read mode from `manifest.yaml::lifecycle.gate_mode`. | small |
| `listLifecycleStates` aggregate | Glob `lifecycle-state/*.jsonl`, fold each, return array of `{spec, slug, status, currentStep, updated}`. | small |
| `filterEvents` predicate API | Convenience for custom projections (`/adev:retro`, `/adev:hygiene`). Pure read; no side effects. | small |
| `renderMarkdown` stub | Stub function returning a deterministic placeholder string. Full implementation is a separate spec; this one only commits to the signature. | small |
| Crash-safety test harness | Fault-injection helper that kills mid-write and asserts the reader recovers. | medium |
| Concurrent-write test harness | Spawn 100 child processes that all call `appendEvent` on the same log; assert every event lands and no line is interleaved or truncated. | medium |
| Performance test harness | Synthetic event-count perf tests for `appendEvent` and `currentState` at N ∈ {50, 1000}. Asserts p99 targets from the charter. | small |
| Unit test coverage | Per-function unit tests; happy paths, edge cases (missing file, empty file, malformed line, unknown event variant), schema validation. | large |
| Manifest schema doc | Document `lifecycle.gate_mode` in `manifest.yaml` template and the constitution sync block. | small |

## Visual Expectations

Not applicable — `lib/lifecycle-state.mjs` is a passive library module with no UI surface. Human-visible output is deferred to the separate `renderMarkdown` spec.

## Acceptance Criteria

- [ ] `lib/lifecycle-state.mjs` exports every function listed in the charter's Interface Contracts: `appendEvent`, `readEvents`, `currentState`, `requireGate`, `resolveGateMode`, `listLifecycleStates`, `renderMarkdown`, `slugFromSpec`, `ensureLifecycleState`, `hasLifecycleState`, `filterEvents`, `reportReviewer`, `reportValidator`, `reportStep`, `reportPlanTask`, `reportIntervention`, `reportPartialRecovery`.
- [ ] All writes go through `fs.appendFile` (or equivalent `O_APPEND` write). A grep test asserts no other write primitive (`writeFile`, `writeFileSync`, `createWriteStream` truncating) appears in the module. CI gate.
- [ ] `reportReviewer` and `reportValidator` always stamp `severity` on the event before appending. A schema-validation test over fixture events confirms no actor event lacks `severity`.
- [ ] `currentState()` is a pure function of the events array; same input always yields the same output. Asserted by property test.
- [ ] Unknown event variants are preserved on read and surfaced under an `unknownEvents[]` field on the projection. Asserted by a fixture with a custom event type.
- [ ] `requireGate(state, stepName, { mode })` throws `GateError` when the prior step is missing or failed and `mode === "strict"`. It logs an advisory warning and returns when `mode === "advisory"`. The function performs no manifest I/O; callers pass `mode` explicitly (typically via `resolveGateMode(manifest)`).
- [ ] Path-containment defenses are enforced: any `specPath` that resolves outside `projectRoot`, lacks `.spec.md`, or produces a slug with characters outside `[a-z0-9._-]+` throws `INVALID_SPEC_PATH`. Any `projectRoot` lacking `.context-index/manifest.yaml` throws `INVALID_PROJECT_ROOT`. CI test exercises traversal payloads (`../../.bashrc.spec.md`, symlink escape, crafted slugs).
- [ ] Size caps enforced: events > 1 MB → `EVENT_TOO_LARGE`; log file ≥ 50 MB → `LOG_TOO_LARGE`; `notes` > 4 KB → truncated with `NOTES_TRUNCATED` warning. Test fixtures exercise each cap.
- [ ] Severity-resolution best-effort: if `loadDomainConfig` throws (broken `reviewers.yaml`/`gates.yaml`), the writer stamps `severity: warning`, emits a one-time `DOMAIN_CONFIG_DEGRADED` warning, and appends the event. Durability is prioritized over strict severity.
- [ ] Aggregation per the per-severity table in Behaviors: `blocker`/`error` FAIL → step FAIL; `warning`/`advisory` FAIL → step PASS_WITH_NOTES. Fixture-driven test covers all four severity rows.
- [ ] The StateProjection uses camelCase keys throughout (`currentStep`, `currentTask`, `planTasks`, `startedAt`, `updatedAt`, `interventions`, `partialRecoveries`, `unknownEvents`). No snake_case keys on the projection (event-discriminator names within event payloads keep their snake_case as per Naming Conventions).
- [ ] `reportPartialRecovery(projectRoot, specPath, args)` exists with the documented signature. `action` is validated against the closed enum `{resumed, discarded, stolen, aborted}` and rejected with `EVENT_SCHEMA_INVALID` otherwise. `artifact_path` is rejected with `EVENT_SCHEMA_INVALID` if absolute. The fold surfaces `partial_recovery` events under `partialRecoveries[]` on the projection (NOT folded into `interventions[]`). This is the cross-spec contract with `incremental-artifact-writes.spec.md` — that spec defines the .partial recovery lifecycle; this spec owns the event-payload shape and projection field.
- [ ] **Data-exposure boundary (SEC-8):** `partial_recovery` events MUST persist `artifact_path` as project-root-relative. Helper rejects absolute paths at write time. Lock-payload PIDs, environment values, and full command output MUST NOT appear in any `partial_recovery` event — those belong outside the lifecycle log per the spec's data-exposure boundary.
- [ ] `listLifecycleStates(projectRoot)` returns one entry per `<slug>.jsonl` file in `.context-index/lifecycle-state/`. Empty array when directory missing.
- [ ] All constitution quality gates pass: `npm test` green, no new dependencies in `package.json`, all files are `.mjs` ESM.
- [ ] No constitutional violations.
- [ ] Test coverage on `lib/lifecycle-state.mjs` ≥ 90% lines.
- [ ] Performance targets from the charter met under `node --test`:
  - `appendEvent` < 5 ms p99
  - `currentState()` < 5 ms p99 at N=50; < 50 ms p99 at N=1000
  - `listLifecycleStates()` < 100 ms p99 at 100 specs
- [ ] Crash-safety test passes: kill a process mid-write, then read the log; the reader sees a consistent prefix (last full line) and tolerates the truncated tail by skipping it.
- [ ] Concurrent-write test passes: 100 child processes appending in parallel; all 100 events present, well-formed, non-interleaved.
- [ ] `renderMarkdown(state)` exists with a stable signature; its body may return a placeholder pending the dedicated render spec.

## Preconditions

- The project has a `.context-index/` directory (created by `/adev:init`).
- The project has a `manifest.yaml` declaring at least the `domain` field (defaulting to `software` if absent).
- For convenience writers that resolve severity (`reportReviewer`, `reportValidator`), the resolved domain has a `reviewers.yaml` and/or `gates.yaml` reachable via `loadDomainConfig`. If absent, the writer falls back to severity `warning` (advisory) and emits a one-time console warning.
- Node.js runtime ≥ the project's declared minimum (existing constitution rule: Node built-ins available).
- No prior lifecycle-state file is required — `ensureLifecycleState` creates the file lazily on first write.

## Behaviors

- **When** a caller invokes `appendEvent(projectRoot, specPath, event)` **then** one well-formed JSON line is appended to `.context-index/lifecycle-state/<slug>.jsonl`, terminated by `\n`, with `ts` stamped if the caller omitted it.
- **When** `appendEvent` is called and the target file does not exist **then** the file (and `lifecycle-state/` directory if missing) is created and the event is the first line.
- **When** `appendEvent` is called concurrently from N processes on the same file **then** all N events are written, each as a complete line, with no interleaving between writers (relying on `O_APPEND` atomicity for payloads ≤ PIPE_BUF on macOS/Linux).
- **When** `readEvents(projectRoot, specPath)` is called on a file with a truncated final line (no trailing newline) **then** the truncated tail is skipped and all prior complete lines are returned.
- **When** `readEvents` is called on a missing file **then** an empty array is returned (no error thrown).
- **When** `reportReviewer({step, reviewer, verdict})` is called **then** the helper looks up the reviewer's `severity_cap` from `reviewers.yaml` in the resolved domain, stamps `severity` on the event, and appends. If the reviewer is not found in domain config, `severity` defaults to `warning` and a one-time console warning is emitted.
- **When** `reportValidator({step, validator, verdict})` is called **then** the helper looks up the validator's `severity` from `gates.yaml`, stamps it on the event, and appends. Same default-to-warning fallback as reviewers.
- **When** `currentState(projectRoot, specPath)` is called **then** the events are read, folded into a `StateProjection` object containing `{spec, status, currentStep, currentTask, steps{}, planTasks{}, interventions[], partialRecoveries[], specRevisions?[], humanApprovalsRequired?[], startedAt, updatedAt, unknownEvents[]}`, and that object is returned. Each entry in `steps{}` carries the latest-revision projection plus a `byRevision[N]` map keyed by integer revision (`{ verdict, blockers[], completed_at, reports[] }`). Events without a `revision:` field fold into `byRevision[1]` (legacy-fold-as-rev-1); top-level `step.verdict`/`step.status` reflect the latest revision (no breaking change for callers that ignore the new field). Per-revision history is added by the `review-block-auto-retry` cross-cutting spec.
- **When** any of `reviewer_report`, `step_completed`, `step_failed`, or `lifecycle_step` carries an optional integer `revision: N` (`N >= 1`) **then** the fold uses it to populate `steps.<step>.byRevision[N]`. Emitters that do not know the spec's revision MAY omit the field; the fold treats those events as revision 1 for projection purposes (forward-compatible / no breaking change for legacy events).

- **When** the fold encounters `code_drift_detected` (fields `drift_source`, `drift_at`) or `code_drift_cleared` (field `drift_at`) **then** it projects `state.drift`, which is `{ source, at, ts }` for the latest `code_drift_detected` not superseded by a later `code_drift_cleared`, and `null` otherwise (`null` by default, always present). This implements `jsonl-drift-events.spec.md` Behavior 5's "latest unsuperseded event" rule as a forward fold: last-wins on detected, reset-to-null on cleared. It is deliberately NOT an accumulating list — rev 3 of that spec rescinded multi-source history because every consumer reads only the latest unresolved event. Projection keys are `source`/`at` rather than the raw `drift_source`/`drift_at`, per the no-snake_case-on-the-projection rule above; raw payloads keep their own field names.

  `state.drift` is NOT authoritative for "is this spec drifted?" — Behavior 5's legacy fallback means a pre-migration spec can be drifted while carrying zero JSONL events, so the spec frontmatter's `drift_detected` boolean remains the answer to that question. `state.drift` answers only "what does the event log record".

- **When** the fold encounters `spec_amended` (fields `amendment_slug`, `amendment_path`, `target_revision`) **then** it appends the raw event to `state.specAmendments[]`, an ordered lazily-created list mirroring the existing `specRevisions` convention. Unlike drift, amendments accumulate: a base spec may carry several, and status/hygiene traversal needs all of them rather than the latest.

- **When** any of `code_drift_detected`, `code_drift_cleared`, or `spec_amended` is folded **then** `status` and `currentStep` are unchanged and no gate is affected. Both concerns are advisory/relational, not lifecycle positions.

  These three rows close the debt from `jsonl-drift-events.spec.md` Migration Step 0 and `spec-amendment-artifacts.spec.md` Behavior 4, which required BOTH canonical registration and a documented variant here. Step 0 was half-executed: the discriminators reached `CANONICAL_EVENTS`, so `appendEvent` accepted them, but no reducer case and no spec row were written — leaving events the writer treated as canonical and the reducer bucketed into `unknownEvents`, which is the CON-4 blocker that step names.
- **When** the fold encounters reports from multiple actors on the same step **then** the step's aggregate verdict is computed by the explicit severity × verdict table below (SA-5):

  | Worst-case actor severity reporting FAIL | Aggregate step verdict | Aggregate step status |
  |---|---|---|
  | `blocker` | `FAIL` | `failed` |
  | `error` | `FAIL` | `failed` |
  | `warning` | `PASS_WITH_NOTES` | `completed` |
  | `advisory` | `PASS_WITH_NOTES` | `completed` |
  | (no FAILs at all, ≥1 PASS_WITH_NOTES) | `PASS_WITH_NOTES` | `completed` |
  | (all PASS) | `PASS` | `completed` |

  The aggregation is "worst wins" by severity for `FAIL` verdicts; non-FAIL `PASS_WITH_NOTES` reports demote `PASS` to `PASS_WITH_NOTES` regardless of their severity.
- **When** `requireGate(state, "plan", { mode })` is called and `state.steps.review.status` is not `completed` with verdict `PASS` or `PASS_WITH_NOTES` **then** under `mode === "strict"` a `GateError` is thrown; under `mode === "advisory"` a `console.warn` advisory is emitted and the function returns normally. The `mode` argument is required — callers resolve it from `manifest.yaml::lifecycle.gate_mode` themselves (typically once per skill invocation), keeping `lib/lifecycle-state.mjs` free of manifest I/O. A helper `resolveGateMode(manifest)` is provided as a thin wrapper for callers that want to avoid duplicating the resolution logic.
- **When** `listLifecycleStates(projectRoot)` is called **then** every `*.jsonl` file in `.context-index/lifecycle-state/` is folded and returned as a single array of `{spec, slug, status, currentStep, updated}` records.
- **When** the fold encounters an event with an `event` value not in the canonical set **then** the event is preserved on the projection's `unknownEvents[]` array and otherwise ignored by core step / plan-task / intervention projections.
- **When** any caller attempts to write a log file with a non-append primitive (`writeFile`, truncating stream, etc.) **then** a CI architectural test catches it and fails the build.
- **When** a skill needs to record per-task progress on a spec's plan **then** it MUST call `reportPlanTask(projectRoot, specPath, { plan, task_id, status })` — this is the canonical substitute for the legacy pattern of creating per-task issues on the board. The sibling `json-issue-board-adapter` spec enforces the inverse: `create()` / `update()` calls that would persist `planTask` on an Issue are rejected with `BOARD_GRANULARITY_VIOLATION`. The two specs together form one contract: plan-task state lives exclusively in the lifecycle log (SA-7 / cross-spec contract).
- **When** a `.partial` artifact's authoring is resolved (resumed, discarded, stolen, or aborted) **then** the actor MUST call `reportPartialRecovery(projectRoot, specPath, { artifact_path, prior_partial_ts, action, dispatch_mode })`. The helper appends a `partial_recovery` event to the lifecycle log. `action` is validated against the closed enum `{resumed, discarded, stolen, aborted}`; `artifact_path` MUST be a project-root-relative path (no absolute paths persisted to disk per SEC-3 data-exposure boundary); `prior_partial_ts` is the ISO-8601 mtime of the prior `.partial` file; `dispatch_mode` is `"foreground" | "subagent"`. The fold surfaces these events under a new projection field `partialRecoveries[]` (NOT folded into `interventions[]` — see `incremental-artifact-writes.spec.md` for the full design). The cross-spec contract: `lib/partial-artifact.mjs` invokes `reportPartialRecovery` on every resume/discard/steal/abort decision; this spec owns the event-payload shape and helper signature.

## Postconditions

- After a successful `appendEvent`, the caller's event is present in the target file as one complete `\n`-terminated JSON line that parses to the event payload exactly as written, including a stamped `ts` and (for actor events) `severity`. Under concurrent writers the caller's event may not be the file's last line — the postcondition is per-event, not positional (SA-6).
- After a successful convenience write (`reportReviewer`, `reportValidator`, `reportStep`, `reportPlanTask`, `reportIntervention`), the event's actor-determined fields (severity for actor events) are immutable on disk for the life of the file.
- After a `currentState` call, the returned projection is independent of any future writes — it captures the log state at read time. Subsequent writes do not mutate prior projections.
- After a strict-mode `requireGate` throw, no side effect has occurred (no log write, no file mutation) — the caller's transaction can safely abort.
- After `listLifecycleStates`, each entry in the array reflects the current state at glob time; entries are not memoised.

## Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `appendEvent` called with missing `event` field | Throws `EVENT_SCHEMA_INVALID` with field name | EVENT_SCHEMA_INVALID |
| `appendEvent` called with non-string `event` value | Throws `EVENT_SCHEMA_INVALID` | EVENT_SCHEMA_INVALID |
| `appendEvent` called with payload exceeding 1 MB | Throws `EVENT_TOO_LARGE` — concurrent-safe atomicity is no longer guaranteed for oversized payloads | EVENT_TOO_LARGE |
| `appendEvent` called when the target log file is already ≥ 50 MB | Throws `LOG_TOO_LARGE` advising the caller to await compaction (deferred capability). Defensive cap until compaction lands. | LOG_TOO_LARGE |
| `reportReviewer` / `reportValidator` called with `notes` exceeding 4 KB | Truncate `notes` to 4 KB, append `…[truncated]` marker, emit one-time `NOTES_TRUNCATED` console warning, append the event. Caller is responsible for not passing secret-bearing text (documented in helper signature). | NOTES_TRUNCATED (warning) |
| Caller passes a `projectRoot` that does not contain `.context-index/manifest.yaml` after `path.resolve()` | Throws `INVALID_PROJECT_ROOT` with the resolved path | INVALID_PROJECT_ROOT |
| Caller passes a `specPath` that resolves outside `projectRoot`, ends without `.spec.md`, or yields a slug with characters outside `[a-z0-9._-]+` | Throws `INVALID_SPEC_PATH` with the offending value | INVALID_SPEC_PATH |
| `appendEvent` cannot create the file (permission, disk full) | Surfaces the underlying `fs` error code unchanged | FS_ERROR |
| `readEvents` encounters a malformed (non-JSON) interior line | Skip the line, log a one-time `MALFORMED_LINE_SKIPPED` warning, continue reading | MALFORMED_LINE_SKIPPED |
| `readEvents` encounters a truncated final line | Skip the final line silently (recoverable from a crash mid-write) | — (no error) |
| `reportReviewer` called with a reviewer name not in `reviewers.yaml` | Default severity to `warning`, emit one-time console warning, append the event | UNKNOWN_REVIEWER_DEFAULTED |
| `reportValidator` called with a validator name not in `gates.yaml` | Default severity to `warning`, emit one-time console warning, append the event | UNKNOWN_VALIDATOR_DEFAULTED |
| `loadDomainConfig` throws when resolving severity (e.g., malformed `reviewers.yaml`/`gates.yaml`) | Best-effort: stamp `severity: warning`, emit one-time `DOMAIN_CONFIG_DEGRADED` console warning naming the file, and append the event. Durability of the log is prioritized over strict severity resolution. The advisory points the user at the broken file. | DOMAIN_CONFIG_DEGRADED (warning) |
| `currentState` called on a file with all unknown event variants | Return a projection with empty `steps{}` and the events in `unknownEvents[]` | — (no error) |
| `requireGate(state, step)` with prior step missing/failed and `gate_mode: strict` | Throws `GateError` with `{requiredStep, currentStatus, mode}` | GATE_BLOCKED |
| `requireGate` with `gate_mode: advisory` and prior step missing/failed | Emit `console.warn` with the same payload; return normally | — (no error) |
| `requireGate` called with an unknown `gate_mode` value in manifest | Treat as `strict`, emit one-time `console.warn` about the unknown mode | UNKNOWN_GATE_MODE_DEFAULTED |
| `listLifecycleStates` encounters a malformed file mid-glob | Skip that file, emit one-time warning, continue with remaining files | MALFORMED_FILE_SKIPPED |
| `slugFromSpec` called with a path that does not match `*.spec.md` | Throws `INVALID_SPEC_PATH` | INVALID_SPEC_PATH |
| Caller writes to the log via any non-`appendEvent` path | CI architectural test fails the build | ARCH_VIOLATION_APPEND_ONLY |
