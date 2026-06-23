---
charter: cli-driver-surface
kind: behavioral
status: implemented
risk_level: high
milestone:
revision: 2
charter-revision: 2
created: 2026-05-14
updated: 2026-05-14
source-manifest:
  sha: "02cf5b1"
  files:
    - cli/index.mjs
    - lib/diagnostics/event-schemas.mjs
    - lib/diagnostics/index.mjs
    - lib/diagnostics/tier1/event-schema-valid.mjs
    - lib/diagnostics/tier1/frontmatter-present.mjs
    - lib/diagnostics/tier1/status-enum-legal.mjs
    - lib/lifecycle-state.mjs
    - lib/meta-tools.mjs
    - lib/reality-check.mjs
    - lib/spec-status.mjs
    - skills/hygiene/SKILL.md
    - skills/implement/SKILL.md
    - skills/review-specs/SKILL.md
    - skills/specify/SKILL.md
    - skills/validate/SKILL.md
    - templates/diagnostics-template.yaml
    - tests/cli.test.mjs
    - tests/diagnostics/event-schemas.test.mjs
    - tests/diagnostics/fixtures/runners/conforming.mjs
    - tests/diagnostics/fixtures/runners/firing.mjs
    - tests/diagnostics/fixtures/runners/hung.mjs
    - tests/diagnostics/fixtures/runners/slow.mjs
    - tests/diagnostics/fixtures/runners/throws-external-path.mjs
    - tests/diagnostics/fixtures/runners/throws-home-path.mjs
    - tests/diagnostics/fixtures/runners/throws-project-path.mjs
    - tests/diagnostics/index-smoke.test.mjs
    - tests/diagnostics/registry.test.mjs
    - tests/diagnostics/tier1/event-schema-valid.test.mjs
    - tests/diagnostics/tier1/frontmatter-present.test.mjs
    - tests/diagnostics/tier1/status-enum-legal.test.mjs
    - tests/lib/lifecycle-state.test.mjs
    - tests/lib/spec-status-no-bare-literals.test.mjs
    - tests/lib/spec-status.test.mjs
  computed-at: "2026-05-14T21:13:35.721Z"
drift_detected: true
---

# Live Spec: Diagnostic Registry

<!-- Live Spec within the cli-driver-surface charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/cli-driver-surface/charter.md -->

> **Rev 2 amendment (2026-05-14):**
>
> **(1) Dropped the `adev/lifecycle-prerequisite-met` Tier-1 producer** and the `governance/diagnostics.yaml::prerequisites:` map. Rationale: `requireGate(state, stepName, { mode })` in `lib/lifecycle-state.mjs` already enforces step-order at skill entry (the moment that matters), and every `appendEvent` call originates from a `lib/lifecycle-state.mjs` helper that runs after `requireGate` already passed — so a write-time diagnostic only re-checks a precondition the caller just satisfied. `STEP_ORDER` in `lib/lifecycle-state.mjs:859` remains the single source of truth for lifecycle step ordering; moving it into YAML would invite "reorder the steps in config" misuses for a code-level invariant. Detecting manual / out-of-band JSONL edits is deferred to a future Tier-2 forensic producer if and when an out-of-band write case appears. **Tier-1 producer count is now 3, not 4.**
>
> **(2) `adev/event-schema-valid` adopts a closed-discriminator / open-per-type-shape stance.** The `event` field must be one of six known types (typos → error); within each known type, only required fields are checked (extras pass through). This catches typo-class bugs without locking the schema against additive field changes. The lib's `normaliseEventInPlace` docstring at `lib/lifecycle-state.mjs:171-172` (which currently says "Schema is open: unknown event strings are accepted on write") is updated by this spec's implementation to reflect the new stance; `StateProjection.unknownEvents[]` is marked deprecated.
>
> **(3) Extracted shared `lib/spec-status.mjs` as the single source of truth for spec frontmatter status enum.** `adev/status-enum-legal` imports from it (does NOT inline the literal set). Lib-side writers that currently hardcode the seven status strings are migrated to import from this module in the same implementation. Skill-side writers (`/adev:specify`, `/adev:review-specs`, `/adev:implement`, `/adev:validate`, `/adev:hygiene`) update their SKILL.md prose to reference `SPEC_STATUSES` as canonical. Eliminates the divergence window where the diagnostic and writers could disagree on what counts as a legal status.
>
> **(4) Strengthened runner-path containment guard (per re-review SEC-1).** Behavior 2 now specifies a four-step guard for runner-path resolution: `..` rejection on raw input, prefix resolution (`plugin:` → pluginRoot, else projectRoot, absolute rejected), `fs.realpathSync` resolution of both candidate and roots, and per-root containment with cross-root confused-deputy rejection. Pure string-prefix containment is explicitly forbidden. A new self-diagnostic `adev/diagnostic-runner-invalid` (error) fires on rejected entries with raw-input message only. The `tests/diagnostics/registry.test.mjs` AC requires six containment test cases (symlink-escape, `..` traversal, absolute path, cross-root deputy, legitimate `plugin:`, legitimate project-relative).
>
> **(5) Casing fix propagated.** Error Cases table now consistently uses `SCHEMA_INVALID` (was `schema-invalid` on two rows). Resolves rev 1 review CON-3 spillover.
>
> **(6) Runner allowlist narrowed (per re-review SEC-2).** Behavior 2 Step B now requires runner paths to carry an explicit `plugin:<rel>` or `project:<rel>` prefix, and the resolved path MUST live under `lib/diagnostics/` (plugin) or `.context-index/diagnostics/` (project). Bare relative paths, absolute paths, and paths pointing into `node_modules/`, `lib/` (non-diagnostics), or `scripts/` are rejected as `SCHEMA_INVALID`. Cuts the runner attack surface from "anything under either root" to "a single dedicated subdirectory under each root."
>
> **(7) Hard timeout on Tier-1 runners (per re-review SEC-4).** Behavior 5 now defines two-stage timing enforcement: soft observability via `adev/diagnostic-slow` at 200 ms (unchanged), plus hard `Promise.race` timeout at 500 ms emitting `adev/diagnostic-timeout` (error severity) and abandoning the runner's promise. Critical for the write-time exec model, where a hung runner would otherwise stall every adev lifecycle write. Accepted limitation: JavaScript can't truly kill a sync runaway without workers; the abandoned promise runs in the event loop but the engine has already moved on. Trust model: runners are source-controlled and code-reviewed; this protects against bugs, not against hostile runners (which are a supply-chain attack).
>
> **(8) Closed-discriminator enforcement is mode-dependent (per re-review SA-3).** Behavior 7's third bullet now makes explicit that `normaliseEventInPlace` itself stays permissive — the producer enforces closure at diagnostic time, and whether bad events reach disk depends on `lifecycle.event_diagnostics` mode (`strict` rejects via `appendEvent` throw; `tag` writes-then-tags; `off` disables entirely). Resolves SA-3 reviewer concern that the lib's code-level behavior was previously ambiguous.
>
> **(9) Message redaction contract (per re-review SEC-3).** Behavior 3 now defines a normalisation pass on all surfaced message strings: absolute paths rewritten to `project:` / `plugin:` / `~/...` / `<external-path-redacted>` forms; `err.stack` never surfaced in `errors[].message` (stderr logging only, debug-gated). Prevents leakage of usernames, internal paths, and module contents via `adev diagnose --json` output in CI/shared transcripts.
>
> **(10) Migration scope tightened (per re-review CON-4).** Task Map row for `lib/spec-status.mjs` migration now reflects the actual grep result (2 affected files: `lib/meta-tools.mjs`, `lib/reality-check.mjs`) instead of the speculative 7-file list, with explicit instruction to re-grep at implementation time.
>
> **(11) ACs added for templates + event-schemas (per re-review CON-3).** Two new Acceptance Criteria entries cover `templates/diagnostics-template.yaml` and `lib/diagnostics/event-schemas.mjs` artifacts that the Task Map introduces.
>
> **(12) Per-type schema authority cited (per re-review SA-2).** Behavior 7's second bullet now names `agent-reliable-state-artifacts/lifecycle-event-log.spec.md` as the authoritative source of per-event-type required-field shapes; `lib/diagnostics/event-schemas.mjs` is explicitly framed as a mechanical mirror of that spec. Adding event types is documented as a four-step process spanning both specs.
>
> **(13) Duplicate-ID resolution flipped from last-wins to first-wins (per re-review SEC-7).** Bundled `plugin:` entries can no longer be silently shadowed by later project entries; subsequent duplicates are dropped with an `adev/diagnostic-duplicate-id` warning. Combined with the runner allowlist (rev 2 amendment #6), this eliminates the tampering-amplification vector where a single config line could replace a legitimate check.
>
> **(14) Self-diagnostic ID naming convention (per re-review-2 SA-8).** The engine emits seven self-diagnostic IDs. Five describe runner-level conditions and use the `adev/diagnostic-<aspect>` form (`adev/diagnostic-runner-missing`, `adev/diagnostic-runner-invalid`, `adev/diagnostic-slow`, `adev/diagnostic-timeout`, `adev/diagnostic-duplicate-id`). Two describe engine-input failures and use the `adev/<aspect>-<state>` form (`adev/registry-missing`, `adev/spec-not-found`) — the divergence is intentional: the `diagnostic-` infix is reserved for findings about a runner's behavior, not about whether the engine could even be invoked.
>
> **(15) Spec-internal cleanups (per re-review-2 SA-9, SA-10).** Behavior 2 Step A now refers to the field as `runner` (matching the registry schema), not `path`. A new AC tests the message-redaction contract from Behavior 3 with three concrete scenarios (project-root path, `$HOME` path, external path).

## Behavioral Contract

The diagnostic registry is the engine and declarative schema that the `cli-driver-surface` charter (and downstream charters `artifact-schemas`, `validation`'s citation-grounding spec, and a future LSP daemon) all consume to answer one question: *"is this artifact verifiably done?"* The registry generalizes ADR-0003's configurable-review-registry pattern to diagnostics — each entry is a named, runnable, severity-stamped, tier-categorized check, identified by a kebab-case ID prefixed `adev/`. This spec defines the engine (`lib/diagnostics/index.mjs::runDiagnostics`), the declarative file (`governance/diagnostics.yaml`), the schema for entries, and the three Tier-1 producers that ship in v1 — enough to make the engine useful immediately. Tier-2 and Tier-3 producers are extension points (concrete producers land in dependent charters per the parent charter's Out of Scope section). The registry is the single source of truth for "which checks exist"; runners are the implementations.

**Scope boundary vs `requireGate` (rev 2):** lifecycle step-order is enforced by `lib/lifecycle-state.mjs::requireGate` at skill entry and is NOT a diagnostic. The diagnostic registry answers "is this *artifact* verifiably done?" — schema legality, frontmatter presence, status legality. The question "is the *workflow* in the right state to do this work?" remains the responsibility of `requireGate` + `STEP_ORDER`.

### Preconditions

- Driver substrate spec (`driver-substrate`) has been validated — `lib/cli/<verb>.mjs` pattern is available so individual diagnostic runners can also be exposed as CLI verbs if needed.
- `lib/lifecycle-state.mjs::currentState` is available for state inspection if a Tier-2/3 producer needs it. (Tier-1 producers in v1 do not inspect lifecycle state — that is `requireGate`'s domain.)
- `lib/manifest.mjs::loadManifest` is available; manifest parsing handles unknown fields gracefully.
- `.context-index/lifecycle-state/` may or may not contain JSONL files for a given spec; the engine must not assume presence.

### Behaviors

1. **When** `runDiagnostics({ projectRoot, spec, tier, only, scope })` is called, **then** it loads `governance/diagnostics.yaml`, filters entries by `tier` (one of `1`, `2`, `3`) and optionally by `only: [<id>...]` (allowlist) and `scope` (`event-impact` / `spec` / `workspace`), invokes each surviving entry's runner, and returns `{ fired: [<verdict>...], skipped: [<{id, reason}>...], errors: [<{id, message}>...] }`.
2. **When** `governance/diagnostics.yaml` is loaded, **then** the engine validates each entry against the schema (`id`, `runner`, `severity`, `tier`, `scope`); entries failing schema validation are added to `errors` with reason `SCHEMA_INVALID` and skipped — the engine does not crash on registry malformation.

   **Runner-path resolution and containment (rev 2 — strengthened per SEC-1):** Runners are loaded via dynamic `import()` and execute under the user's profile — successful escape of the containment guard equals arbitrary code execution at every `appendEvent` call. The guard is therefore strict and operates as follows:

   - **Step A — `..` rejection on raw input.** If a runner entry's `runner` field contains any `..` segment as a path component (before any normalisation), the entry is rejected as `SCHEMA_INVALID` and never resolved. This blocks `runner: ./..` / `runner: foo/../../bar.mjs` / `runner: plugin:../../etc/passwd` patterns.
   - **Step B — prefix resolution and per-root allowlist (rev 2 — strengthened per re-review SEC-2).** Runner paths MUST carry an explicit prefix; bare paths are rejected as `SCHEMA_INVALID`. Two prefixes are recognised:
     - `plugin:<rel>` — resolves to `<pluginRoot>/lib/diagnostics/<rel>`. The runner MUST live under `lib/diagnostics/` within `pluginRoot`; entries pointing elsewhere under `pluginRoot` are rejected.
     - `project:<rel>` — resolves to `<projectRoot>/.context-index/diagnostics/<rel>`. Project-defined runners MUST live under `.context-index/diagnostics/`; entries pointing elsewhere under `projectRoot` (including `node_modules/`, `lib/`, `scripts/`) are rejected.

     Absolute paths and unprefixed relative paths are both `SCHEMA_INVALID`. This narrows the attack surface from "anything under projectRoot or pluginRoot" to "a single dedicated subdirectory under each root" — a malicious dependency in `node_modules` or a stray script elsewhere in the tree is no longer a candidate even if a `governance/diagnostics.yaml` entry points at it.
   - **Step C — `realpathSync` resolution.** Both allowlist roots are resolved via `fs.realpathSync` once at load time and cached as `realPluginDiagRoot` (`<realpath of pluginRoot>/lib/diagnostics`) and `realProjectDiagRoot` (`<realpath of projectRoot>/.context-index/diagnostics`). Each candidate runner path is resolved via `fs.realpathSync` to `realRunner`. Failure to resolve (ENOENT, EACCES, symlink loop) → `SCHEMA_INVALID`.
   - **Step D — containment check.** A runner is admitted iff exactly one of the following holds: `realRunner === realPluginDiagRoot || realRunner.startsWith(realPluginDiagRoot + path.sep)` OR `realRunner === realProjectDiagRoot || realRunner.startsWith(realProjectDiagRoot + path.sep)`. If neither holds, or both hold (cross-root confused-deputy case where one realpath is a descendant of the other), the entry is `SCHEMA_INVALID` and not imported. Pure string-prefix comparison without `realpathSync` is **explicitly forbidden** by this spec.
   - **Self-diagnostic on rejection.** Each rejected entry emits `adev/diagnostic-runner-invalid` with `severity: error`, message `"runner path failed containment: <raw-input>"` (raw input only, never the resolved real path — see Behavior 3 for the redaction contract).

   This three-stage guard (`..`-reject → realpath → per-root containment) supersedes the simpler string-prefix containment used by `lib/cli/gate.mjs:69-80` for *spec resolution*. The two are not interchangeable: spec resolution reads a file; runner resolution executes one.
3. **When** a registry entry's `runner` path does not resolve to an importable module or its module does not export `run`, **then** that diagnostic emits a *self-diagnostic verdict* — id `adev/diagnostic-runner-missing`, severity `warning`, message `"runner not found: <path>"` — and is added to `errors`. The diagnostic call as a whole does not crash; the missing runner is itself a finding.

   **Message redaction contract (rev 2 — per re-review SEC-3):** All surfaced message strings — for `adev/diagnostic-runner-missing`, `adev/diagnostic-runner-invalid`, `adev/diagnostic-slow`, `adev/diagnostic-timeout`, and the wrapping `errors[].message` for import-time and runtime exceptions — are normalised before being placed in the engine's return value:
   - Absolute paths under `realProjectRoot` are rewritten to `project:<rel>` form.
   - Absolute paths under `realPluginRoot` are rewritten to `plugin:<rel>` form.
   - Absolute paths under `$HOME` (but outside both roots) are rewritten to `~/<rel>` form.
   - All other absolute paths are replaced with the literal string `<external-path-redacted>`.
   - For runtime exceptions caught from `runner.run()`, the engine surfaces `err.message` only — never `err.stack`. The full stack is logged to stderr with the `[diagnostics:debug]` prefix (visible to operators but not propagated to `adev diagnose --json` or to `errors[].message`). Stack traces become available in machine-readable output only when `adev diagnose --debug` is set, gated by `diagnose-cli` spec; this engine never emits them.

   Rationale: `errors[].message` is consumed by `adev diagnose --json` and surfaced verbatim in CI logs, shared transcripts, and public issue trackers. Absolute paths leak usernames, internal directory layouts, and (via stack frames) the contents of intermediate modules.
4. **When** a registered runner is invoked, **then** it receives `{ projectRoot, spec, manifest, state }` (the resolved spec path, parsed manifest, and current lifecycle state projection); it returns either `{ fired: true, id, severity, message, citation?, runner_path }` or `{ fired: false }`. The engine annotates each verdict with `runner_path` (the resolved path of the runner module) before returning, so downstream consumers (`adev diagnose --json`) can surface the originating module without re-querying the registry.
5. **When** a Tier-1 diagnostic is run, **then** its runner completes in ≤50 ms (median) and ≤200 ms (p99) for a single spec.

   **Two-stage timing enforcement (rev 2 — strengthened per re-review SEC-4):**
   - **Stage 1 — observability (soft).** The engine records wall-clock duration per runner. Runners exceeding 200 ms emit `adev/diagnostic-slow` (severity `info`) in the `errors` array. Runner is not interrupted at this stage; the diagnostic is for human inspection of trend data.
   - **Stage 2 — hard timeout (kill).** The engine wraps each runner invocation in `Promise.race([runner.run(ctx), timeout(500)])` where `timeout(ms)` returns a promise that rejects after `ms` milliseconds with a sentinel error. On timeout, the engine emits `adev/diagnostic-timeout` (severity `error`, message `"runner exceeded 500 ms hard timeout: <id>"`) in the `errors` array and abandons the runner's promise. The hard cap is 500 ms for Tier-1, an order of magnitude over the p99 budget, large enough that legitimate runners never hit it under any plausible load.

   The hard timeout is critical because Tier-1 runs on every `appendEvent` — without it, a runner with an infinite loop, never-resolving await, or sync I/O on a slow filesystem stalls every adev lifecycle write in the project. Note: JavaScript cannot truly kill a runaway sync runner without worker threads (which would violate Constitution Principle 1 if a worker library were added). The abandoned promise still runs to completion in the event loop, but the engine has already moved on and surfaced the timeout. This is an accepted limitation; the threat model assumes runners are source-controlled and code-reviewed (a hostile runner is a supply-chain attack, not an availability concern).
6. **When** `runDiagnostics` is invoked with `tier: 1, scope: 'event-impact'` (the write-time case), **then** only producers whose `scope` includes `event-impact` are run; broader scopes are skipped silently (not added to `errors`).
7. **When** the `adev/event-schema-valid` Tier-1 producer is run against a JSONL event, **then** it applies a **closed-discriminator / open-per-type-shape** schema:
   - **Discriminator (closed):** the event is a valid JSON object with `{ event: string, ts: string }` (per `agent-reliable-state-artifacts/lifecycle-event-log.spec.md` — the canonical timestamp field is `ts`, not `timestamp`), and `event` is one of the six known types (`step_started`, `step_completed`, `validator_report`, `reviewer_report`, `status_change`, `plan_task`). Any other `event` value fires with severity `error` and message `unknown event type: <value> (expected one of: ...)`. This catches typos like `step-completed` (hyphen) or `validatorReport` (camelCase).
   - **Per-type shape (open):** for each known event type, the producer asserts only that the **required fields** are present and have the expected primitive types. **The authoritative per-type required-field schema lives in `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md`** (the canonical event-log contract); `lib/diagnostics/event-schemas.mjs` is a mechanical mirror of that spec, not an independent source of truth. If the two ever diverge, `lifecycle-event-log.spec.md` wins and `event-schemas.mjs` must be updated. Extra fields are permitted and pass through unchanged — new event-type fields can be added in writers without a `diagnostic-registry` spec amendment, as long as they don't change the required set (which would require amending `lifecycle-event-log.spec.md` first). Adding a brand new event type requires (a) amending `lifecycle-event-log.spec.md`, (b) extending `KNOWN_EVENT_TYPES` in `lib/diagnostics/event-schemas.mjs`, (c) adding its required-field schema entry, (d) updating the producer test fixtures.
   - **Coordination with `normaliseEventInPlace` (rev 2 — clarified per re-review SA-3):** the lib's `normaliseEventInPlace` itself does NOT close the discriminator — it continues to validate only `event.event` is a non-empty string and stamp `ts`. The closed-discriminator commitment is **enforced by this producer at diagnostic time, not at write time inside `appendEvent`**. Whether unknown events reach disk depends on `lifecycle.event_diagnostics` mode (see `write-time-diagnostic-hook.spec.md`): in `strict` mode, the producer's error firing causes `appendEvent` to reject the write before persisting; in `tag` mode (default) the event is written and tagged; in `off` mode the producer doesn't run at all. The lib's docstring at `lib/lifecycle-state.mjs:171-172` is updated by this spec's implementation to reflect this split: "the discriminator is closed per `governance/diagnostics.yaml::adev/event-schema-valid`, but enforcement is mode-dependent (`lifecycle.event_diagnostics`); `normaliseEventInPlace` itself remains permissive on the discriminator value." The `StateProjection.unknownEvents[]` projection field is **deprecated** (kept for back-compat against pre-rev-2 logs; new events should never land there when running in `strict` mode).
8. **When** the `adev/status-enum-legal` Tier-1 producer is run against a spec's frontmatter `status` field, **then** it asserts the value is in `SPEC_STATUSES`, the canonical set exported by `lib/spec-status.mjs` (`{ draft, review-pending, review-passed, review-blocked, implemented, validated, superseded }`); any other value fires with severity `error`. The producer imports the enum from `lib/spec-status.mjs` — it does NOT inline the literal set. This is the single source of truth: all writers (`/adev:review-specs`, `/adev:implement`, `/adev:validate`, `/adev:specify`, `/adev:hygiene`, and any lib code touching spec frontmatter status) MUST import `SPEC_STATUSES` (or the helper `assertLegalStatus(value)`) from the same module rather than hardcoding string literals.
9. **When** the `adev/frontmatter-present` Tier-1 producer is run against a markdown artifact, **then** it asserts the file begins with `---`-delimited YAML frontmatter and the YAML parses without error; missing or malformed frontmatter fires with severity `error`.
10. **When** the engine returns to a caller, **then** the response shape is stable across releases — `fired`, `skipped`, `errors` are always present (possibly empty arrays), every verdict has `id` and `severity`, and the JSON output of `adev diagnose --json` (spec #3) is the same shape.

### Postconditions

- `lib/diagnostics/index.mjs` exists, exports `runDiagnostics({...})` and a `loadRegistry(projectRoot)` helper.
- `governance/diagnostics.yaml` exists in this repo's `.context-index/governance/` (and is scaffolded into `templates/` so new installs get it). The file contains a top-level `diagnostics:` list only — there is no `prerequisites:` map (lifecycle step-order is enforced by `requireGate`, not by diagnostics).
- The three Tier-1 producers live in `lib/diagnostics/tier1/` — one file per producer, each exporting `run({...})`.
- `lib/diagnostics/event-schemas.mjs` defines per-event-type schemas for the event-schema producer.
- `lib/spec-status.mjs` exists and exports `SPEC_STATUSES` (the seven-element array of legal spec frontmatter status values) and `assertLegalStatus(value)` (throws `SPEC_STATUS_INVALID` with a descriptive message on out-of-enum input). The `adev/status-enum-legal` producer imports from this module; lib-side writers (`lib/meta-tools.mjs`, `lib/reality-check.mjs`, `lib/migrate-state-artifacts.mjs`, and any other `.mjs` file currently using string literals for spec status) are migrated to import from this module in the same spec implementation. Skill-side writers (markdown SKILL.md files) reference the module by name in their prose so future agents check the canonical list.
- `tests/diagnostics/registry.test.mjs` covers the engine: registry load, schema validation, missing-runner handling, tier/scope filtering, response shape.
- `tests/diagnostics/tier1/` has one test file per producer covering each producer's behavior.
- `cli-driver-surface` charter Capability Map: rows "Diagnostic registry engine", "`governance/diagnostics.yaml` schema + initial scaffold", "Tier-1 producers (v1 set)" have `Status: specified`.

### Error Cases

| Condition | Expected Behavior | Severity |
|---|---|---|
| `governance/diagnostics.yaml` missing | Engine returns `{ fired: [], skipped: [], errors: [{ id: 'adev/registry-missing', message: '...' }] }` — does not crash | warning |
| Entry has invalid `severity` (not info/warning/error) | Entry skipped, added to `errors` with reason `SCHEMA_INVALID` | error |
| Entry has invalid `tier` (not 1/2/3) | Entry skipped, added to `errors` with reason `SCHEMA_INVALID` | error |
| Two entries share the same `id` | Engine uses the *first* entry encountered (so bundled `plugin:` entries cannot be silently shadowed by later project-level entries). Subsequent duplicates are dropped and added to `errors` with `adev/diagnostic-duplicate-id` (severity warning) citing the dropped runner path. | warning |
| Runner module import throws | Runner's diagnostic ID added to `errors` with `{ message: <import-error-message> }`; other diagnostics continue | warning |
| Runner `run()` throws | Runner's diagnostic ID added to `errors` with `{ message: <runtime-error-message> }`; other diagnostics continue | warning |
| Runner exceeds Tier-1 budget (200 ms) | Self-diagnostic `adev/diagnostic-slow` fires (info severity); runner result still reported | info |
| Runner exceeds Tier-1 hard timeout (500 ms) | Self-diagnostic `adev/diagnostic-timeout` fires (error severity); engine abandons the runner's promise and continues with remaining runners | error |
| Runner entry uses unprefixed or absolute path (no `plugin:` or `project:` prefix) | Entry skipped; `adev/diagnostic-runner-invalid` fires; engine continues | error |
| Runner entry uses `project:` prefix but resolves outside `.context-index/diagnostics/` | Entry skipped; `adev/diagnostic-runner-invalid` fires | error |
| Runner entry uses `plugin:` prefix but resolves outside `lib/diagnostics/` within pluginRoot | Entry skipped; `adev/diagnostic-runner-invalid` fires | error |
| Spec path argument resolves to a non-existent file | Self-diagnostic `adev/spec-not-found` fires (error severity); runner is not invoked | error |
| Event passed to `event-schema-valid` is not valid JSON | Producer fires; message includes the parse error and line offset | error |
| Event has unknown `event` value (typo or new type not yet in the discriminator enum) | `adev/event-schema-valid` fires; message lists the expected enum | error |
| Event has a known `event` value but missing a required per-type field | `adev/event-schema-valid` fires; message names the missing field | error |
| Event has a known `event` value with extra fields beyond the per-type required set | Producer passes the event through; extra fields are permitted (per-type shape is open) | n/a |
| Status value not in legal enum | `adev/status-enum-legal` fires | error |
| Frontmatter missing or malformed | `adev/frontmatter-present` fires | error |

## System Constitution Reference

- **Principle 1 ("Minimize external dependencies"):** Engine uses only `node:fs`, `node:path`, `node:yaml` (no — YAML parsing uses existing helpers in `lib/manifest.mjs` style; if no YAML helper is shared, factor `lib/yaml.mjs` from existing manifest parsing rather than introducing a dependency). Schema validation is hand-rolled, deterministic.
- **Principle 3 ("Pure ESM"):** All modules `.mjs`, ESM-only.
- **Principle 4 ("Hook protocol compliance"):** When invoked via `adev diagnose` (spec #3), exit codes follow 0 / 2 convention; this spec defines the *engine*, not the CLI surface, so exit codes are out of scope here.
- **ADR-0003 precedent:** Registry schema (`id` / `runner` / `severity` / `tier` / `scope`) directly extends the configurable-review-registry pattern. Diagnostic runners follow the same module-with-runner-path convention.
- **ADR-0009 (Governance Check Layering):** This spec defines the *artifact-level verifiability* surface in the six-surface governance model. Workflow-precondition checks belong to `requireGate` (not here). Shell-command quality gates belong to `gates.yaml` (not here). Subjective review belongs to `review.yaml` (not here). The decision flow in ADR-0009 routes new checks to the right surface.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|---|---|---|
| Define registry schema | Document the YAML entry shape in `lib/diagnostics/index.mjs` header comment + a JSON-schema-style validator function | Small |
| Implement `lib/diagnostics/index.mjs::loadRegistry` | Read `governance/diagnostics.yaml`, validate each entry, return `{ entries: [...], errors: [...] }` | Medium |
| Implement `lib/diagnostics/index.mjs::runDiagnostics` | Filter by tier/scope/only, import each runner, invoke, aggregate results, enforce timing budget (observability only) | Medium |
| Scaffold `governance/diagnostics.yaml` with 3 Tier-1 entries | One entry per Tier-1 producer; also seed `templates/diagnostics-template.yaml` | Small |
| Implement `lib/diagnostics/tier1/event-schema-valid.mjs` | Validate JSONL event shape against per-type schemas; use `lib/diagnostics/event-schemas.mjs` | Medium |
| Implement `lib/diagnostics/event-schemas.mjs` | Per-event-type schemas for `step_started`, `step_completed`, `validator_report`, `reviewer_report`, `status_change`, `plan_task` | Medium |
| Extract `lib/spec-status.mjs` | Export `SPEC_STATUSES` (7-element array) and `assertLegalStatus(value)`. Becomes the single source of truth for legal spec frontmatter status values. | Small |
| Migrate lib-side writers to import from `lib/spec-status.mjs` | Confirmed migration sites at spec-authoring time (grep across `lib/**/*.mjs` for the six multi-word status literals, performed 2026-05-14): `lib/meta-tools.mjs` (JSDoc comment at line ~117), `lib/reality-check.mjs` (assignment sites at lines ~319-330). Re-run the grep at implementation time and migrate whatever the grep returns — the canonical AC is the post-migration grep result, not the spec-authoring-time list (other writers may land between now and implementation). Replace bare literals with `import { SPEC_STATUSES } from './spec-status.mjs'` and use `SPEC_STATUSES[i]` or `assertLegalStatus(value)` as appropriate. | Small |
| Migrate skill SKILL.md writers to cite `lib/spec-status.mjs` | The status-setting skills (`/adev:specify`, `/adev:review-specs`, `/adev:implement`, `/adev:validate`, `/adev:hygiene`) update their SKILL.md prose to mention "legal status values are defined in `lib/spec-status.mjs::SPEC_STATUSES`" instead of inlining the list. The string literals themselves may remain in skill prose (since skills are markdown, not JS), but the canonical reference lives in the lib. | Small |
| Implement `lib/diagnostics/tier1/status-enum-legal.mjs` | Imports `SPEC_STATUSES` from `lib/spec-status.mjs`; checks spec frontmatter status against the imported set; does NOT inline the literal list. | Small |
| Implement `lib/diagnostics/tier1/frontmatter-present.mjs` | Assert YAML frontmatter parses; use shared YAML helper | Small |
| Write `tests/diagnostics/registry.test.mjs` | Engine-level behavior coverage | Medium |
| Write `tests/diagnostics/tier1/*.test.mjs` | One per producer | Medium |

## Acceptance Criteria

- [ ] `lib/diagnostics/index.mjs` exports `runDiagnostics({...})` and `loadRegistry(projectRoot)`
- [ ] `governance/diagnostics.yaml` exists with at least the 3 Tier-1 entries (`adev/event-schema-valid`, `adev/status-enum-legal`, `adev/frontmatter-present`); no top-level `prerequisites:` map is present (lifecycle step-order is enforced by `requireGate`)
- [ ] Each Tier-1 producer exists at `lib/diagnostics/tier1/<id-stem>.mjs`, exports `run({...})`, completes in ≤50 ms median against the project's existing artifacts
- [ ] `loadRegistry` validates entries against the schema; invalid entries land in the `errors` array with reason `SCHEMA_INVALID`
- [ ] Runner-path containment guard is implemented per Behavior 2 Steps A–D: rejects raw `..` segments, requires `fs.realpathSync` resolution, rejects absolute paths, and admits a runner only if its realpath is contained under exactly one of `realProjectRoot` / `realPluginRoot`. `tests/diagnostics/registry.test.mjs` covers: (i) symlink-escape rejection (symlink in `node_modules/` pointing outside both roots), (ii) raw `..` traversal rejection (`../../etc/passwd`-shaped input), (iii) absolute-path rejection, (iv) cross-root confused-deputy rejection (symlink inside `projectRoot` pointing into `pluginRoot` or vice versa), (v) admission of legitimate `plugin:` runner, (vi) admission of legitimate project-relative runner under `realProjectRoot`. Pure `string.startsWith` containment without `realpathSync` MUST cause the pattern test to fail.
- [ ] Missing runner path emits `adev/diagnostic-runner-missing` self-diagnostic (severity warning); engine does not crash
- [ ] Duplicate `id` entries: engine uses the *first* entry encountered (bundled `plugin:` entries cannot be shadowed); subsequent duplicates emit `adev/diagnostic-duplicate-id` (warning) and are dropped
- [ ] `runDiagnostics({ tier: 1, scope: 'event-impact' })` filters to event-impact-scoped diagnostics only
- [ ] Response shape `{ fired: [...], skipped: [...], errors: [...] }` is stable; all three arrays always present
- [ ] Runner timing exceeding 200 ms (Tier-1) emits `adev/diagnostic-slow` (info) observability finding; runner is not killed
- [ ] Runner timing exceeding 500 ms hard timeout emits `adev/diagnostic-timeout` (error); engine abandons the runner via `Promise.race` and continues with remaining runners. `tests/diagnostics/registry.test.mjs` covers: (i) a deliberately slow runner (~250 ms) emits `diagnostic-slow` but is not abandoned; (ii) a deliberately hung runner (`new Promise(() => {})`) is abandoned and emits `diagnostic-timeout` within ~600 ms wall-clock; (iii) the engine continues to invoke remaining runners after a timeout
- [ ] Message redaction contract from Behavior 3 is exercised by `tests/diagnostics/registry.test.mjs`: a fixture runner that throws an exception whose message contains an absolute path under `realProjectRoot` produces an `errors[].message` that begins with the literal `project:` prefix; a runner throwing with an absolute path under `$HOME` (but outside both roots) produces a message containing `~/`; a runner throwing with a path entirely outside both roots and `$HOME` produces a message containing the literal sentinel `<external-path-redacted>`; in all three cases the `errors[].message` does NOT contain a substring matching the original absolute-path prefix or any `at ` stack-frame marker
- [ ] `event-schema-valid` correctly validates all 6 known event types against their required-field schemas; rejects events with unknown `event` discriminator (severity error) and events with known `event` but missing required fields (severity error); permits extra fields beyond the required set
- [ ] `templates/diagnostics-template.yaml` exists and is byte-for-byte content-equivalent to the in-repo `governance/diagnostics.yaml` scaffolded by this spec; new project installs scaffold it via `/adev:init`
- [ ] `lib/diagnostics/event-schemas.mjs` exists and exports (a) `KNOWN_EVENT_TYPES` as a `Readonly<string[]>` listing the six discriminator values, and (b) a per-type schema map keyed by discriminator value with the required-field set for each type; the `event-schema-valid` runner imports both and does NOT inline either
- [ ] `lib/lifecycle-state.mjs`'s `normaliseEventInPlace` docstring (line 171-172) is updated to reflect the closed-discriminator / open-shape stance; the `StateProjection.unknownEvents[]` field is marked deprecated
- [ ] `lib/spec-status.mjs` exists, exports `SPEC_STATUSES` (a `Readonly<string[]>` or frozen `Set`) and `assertLegalStatus(value)` (throws `SPEC_STATUS_INVALID` on out-of-enum input)
- [ ] `lib/diagnostics/tier1/status-enum-legal.mjs` imports the enum from `lib/spec-status.mjs` — no inline literal list of the 7 values appears in the runner module
- [ ] Every `.mjs` file under `lib/` that previously hardcoded any of the seven spec-status strings now imports from `lib/spec-status.mjs`. Verified by grep: no `.mjs` file under `lib/` (excluding `lib/spec-status.mjs` itself) contains the bare literals `'review-passed'`, `'review-blocked'`, `'review-pending'`, `'implemented'`, `'validated'`, or `'superseded'`. (The literal `'draft'` is allowed since it appears in unrelated contexts; reviewer should spot-check each remaining occurrence.)
- [ ] `status-enum-legal` accepts all 7 legal values, rejects others with severity error
- [ ] The 5 status-setting skills (`/adev:specify`, `/adev:review-specs`, `/adev:implement`, `/adev:validate`, `/adev:hygiene`) reference `lib/spec-status.mjs::SPEC_STATUSES` in their SKILL.md prose as the canonical source
- [ ] `frontmatter-present` works on `.spec.md`, `.charter.md`, `.review.md`, `.validate.md`
- [ ] `tests/diagnostics/registry.test.mjs` and all `tests/diagnostics/tier1/*.test.mjs` pass
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations
