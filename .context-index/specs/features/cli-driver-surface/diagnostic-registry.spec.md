# Live Spec: Diagnostic Registry

<!-- Live Spec within the cli-driver-surface charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/cli-driver-surface/charter.md -->

---
charter: cli-driver-surface
status: review-passed
risk_level: high
milestone: adev-compiler-discipline
revision: 1
charter-revision: 2
created: 2026-05-14
updated: 2026-05-14
---

## Behavioral Contract

The diagnostic registry is the engine and declarative schema that the `cli-driver-surface` charter (and downstream charters `artifact-schemas`, `validation`'s citation-grounding spec, and a future LSP daemon) all consume to answer one question: *"is this artifact verifiably done?"* The registry generalizes ADR-0003's configurable-review-registry pattern to diagnostics — each entry is a named, runnable, severity-stamped, tier-categorized check, identified by a kebab-case ID prefixed `adev/`. This spec defines the engine (`lib/diagnostics/index.mjs::runDiagnostics`), the declarative file (`governance/diagnostics.yaml`), the schema for entries, and the four Tier-1 producers that ship in v1 — enough to make the engine useful immediately. Tier-2 and Tier-3 producers are extension points (concrete producers land in dependent charters per the parent charter's Out of Scope section). The registry is the single source of truth for "which checks exist"; runners are the implementations.

### Preconditions

- Driver substrate spec (`driver-substrate`) has been validated — `lib/cli/<verb>.mjs` pattern is available so individual diagnostic runners can also be exposed as CLI verbs if needed.
- `lib/lifecycle-state.mjs::currentState` is available for state inspection by lifecycle-prerequisite diagnostics.
- `lib/manifest.mjs::loadManifest` is available; manifest parsing handles unknown fields gracefully.
- `.context-index/lifecycle-state/` may or may not contain JSONL files for a given spec; the engine must not assume presence.

### Behaviors

1. **When** `runDiagnostics({ projectRoot, spec, tier, only, scope })` is called, **then** it loads `governance/diagnostics.yaml`, filters entries by `tier` (one of `1`, `2`, `3`) and optionally by `only: [<id>...]` (allowlist) and `scope` (`event-impact` / `spec` / `workspace`), invokes each surviving entry's runner, and returns `{ fired: [<verdict>...], skipped: [<{id, reason}>...], errors: [<{id, message}>...] }`.
2. **When** `governance/diagnostics.yaml` is loaded, **then** the engine validates each entry against the schema (`id`, `runner`, `severity`, `tier`, `scope`); entries failing schema validation are added to `errors` with reason `SCHEMA_INVALID` and skipped — the engine does not crash on registry malformation. Runner paths in each entry resolve relative to `projectRoot`; bundled runners shipped by the plugin use the special prefix `plugin:` (e.g., `plugin:diagnostics/tier1/event-schema-valid.mjs`). After resolution, the engine asserts the path is contained within either `projectRoot` or the plugin root — paths escaping containment are treated as `SCHEMA_INVALID` and never imported (per security invariant in SEC consideration).
3. **When** a registry entry's `runner` path does not resolve to an importable module or its module does not export `run`, **then** that diagnostic emits a *self-diagnostic verdict* — id `adev/diagnostic-runner-missing`, severity `warning`, message `"runner not found: <path>"` — and is added to `errors`. The diagnostic call as a whole does not crash; the missing runner is itself a finding.
4. **When** a registered runner is invoked, **then** it receives `{ projectRoot, spec, manifest, state }` (the resolved spec path, parsed manifest, and current lifecycle state projection); it returns either `{ fired: true, id, severity, message, citation?, runner_path }` or `{ fired: false }`. The engine annotates each verdict with `runner_path` (the resolved path of the runner module) before returning, so downstream consumers (`adev diagnose --json`) can surface the originating module without re-querying the registry.
5. **When** a Tier-1 diagnostic is run, **then** its runner completes in ≤50 ms (median) and ≤200 ms (p99) for a single spec. The engine enforces this loosely by recording wall-clock duration per runner and emitting a warning to the `errors` array (severity `info`, id `adev/diagnostic-slow`) when a Tier-1 runner exceeds 200 ms. The runner itself is not killed; this is observability, not a hard kill.
6. **When** `runDiagnostics` is invoked with `tier: 1, scope: 'event-impact'` (the write-time case), **then** only producers whose `scope` includes `event-impact` are run; broader scopes are skipped silently (not added to `errors`).
7. **When** the `adev/event-schema-valid` Tier-1 producer is run against a JSONL event, **then** it asserts the event is a valid JSON object with required fields `{ event: string, ts: string }` (per `agent-reliable-state-artifacts/lifecycle-event-log.spec.md` — the canonical timestamp field is `ts`, not `timestamp`) and validates known event types (`step_started`, `step_completed`, `validator_report`, `reviewer_report`, `status_change`, `plan_task`) against their per-type schemas (defined in `lib/diagnostics/event-schemas.mjs` shipped by this spec).
8. **When** the `adev/status-enum-legal` Tier-1 producer is run against a spec's frontmatter `status` field, **then** it asserts the value is in `{ draft, review-pending, review-passed, review-blocked, implemented, validated, superseded }`; any other value fires with severity `error`.
9. **When** the `adev/lifecycle-prerequisite-met` Tier-1 producer is run for an event of type `step_completed` or `status_change`, **then** it asserts the prior-step events the transition requires are present in the spec's `.jsonl` log. Prerequisites are declared in the same `governance/diagnostics.yaml` file under a top-level `prerequisites:` map (`<target-step>: [<required-prior-event>...]`). Missing prerequisites fire with severity `error`.
10. **When** the `adev/frontmatter-present` Tier-1 producer is run against a markdown artifact, **then** it asserts the file begins with `---`-delimited YAML frontmatter and the YAML parses without error; missing or malformed frontmatter fires with severity `error`.
11. **When** the engine returns to a caller, **then** the response shape is stable across releases — `fired`, `skipped`, `errors` are always present (possibly empty arrays), every verdict has `id` and `severity`, and the JSON output of `adev diagnose --json` (spec #3) is the same shape.

### Postconditions

- `lib/diagnostics/index.mjs` exists, exports `runDiagnostics({...})` and a `loadRegistry(projectRoot)` helper.
- `governance/diagnostics.yaml` exists in this repo's `.context-index/governance/` (and is scaffolded into `templates/` so new installs get it).
- The four Tier-1 producers live in `lib/diagnostics/tier1/` — one file per producer, each exporting `run({...})`.
- `lib/diagnostics/event-schemas.mjs` defines per-event-type schemas for the event-schema producer.
- `tests/diagnostics/registry.test.mjs` covers the engine: registry load, schema validation, missing-runner handling, tier/scope filtering, response shape.
- `tests/diagnostics/tier1/` has one test file per producer covering each producer's behavior.
- `cli-driver-surface` charter Capability Map: rows "Diagnostic registry engine", "`governance/diagnostics.yaml` schema + initial scaffold", "Tier-1 producers (v1 set)" have `Status: specified`.

### Error Cases

| Condition | Expected Behavior | Severity |
|---|---|---|
| `governance/diagnostics.yaml` missing | Engine returns `{ fired: [], skipped: [], errors: [{ id: 'adev/registry-missing', message: '...' }] }` — does not crash | warning |
| Entry has invalid `severity` (not info/warning/error) | Entry skipped, added to `errors` with reason `schema-invalid` | error |
| Entry has invalid `tier` (not 1/2/3) | Entry skipped, added to `errors` with reason `schema-invalid` | error |
| Two entries share the same `id` | Engine logs warning, uses the *last* entry encountered, adds an entry to `errors` for the duplicate | warning |
| Runner module import throws | Runner's diagnostic ID added to `errors` with `{ message: <import-error-message> }`; other diagnostics continue | warning |
| Runner `run()` throws | Runner's diagnostic ID added to `errors` with `{ message: <runtime-error-message> }`; other diagnostics continue | warning |
| Runner exceeds Tier-1 budget (200 ms) | Self-diagnostic `adev/diagnostic-slow` fires (info severity); runner result still reported | info |
| Spec path argument resolves to a non-existent file | Self-diagnostic `adev/spec-not-found` fires (error severity); runner is not invoked | error |
| Event passed to `event-schema-valid` is not valid JSON | Producer fires; message includes the parse error and line offset | error |
| Status value not in legal enum | `adev/status-enum-legal` fires | error |
| Lifecycle prerequisite missing | `adev/lifecycle-prerequisite-met` fires; message names the missing prior event | error |
| Frontmatter missing or malformed | `adev/frontmatter-present` fires | error |

## System Constitution Reference

- **Principle 1 ("Minimize external dependencies"):** Engine uses only `node:fs`, `node:path`, `node:yaml` (no — YAML parsing uses existing helpers in `lib/manifest.mjs` style; if no YAML helper is shared, factor `lib/yaml.mjs` from existing manifest parsing rather than introducing a dependency). Schema validation is hand-rolled, deterministic.
- **Principle 3 ("Pure ESM"):** All modules `.mjs`, ESM-only.
- **Principle 4 ("Hook protocol compliance"):** When invoked via `adev diagnose` (spec #3), exit codes follow 0 / 2 convention; this spec defines the *engine*, not the CLI surface, so exit codes are out of scope here.
- **ADR-0003 precedent:** Registry schema (`id` / `runner` / `severity` / `tier` / `scope`) directly extends the configurable-review-registry pattern. Diagnostic runners follow the same module-with-runner-path convention.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|---|---|---|
| Define registry schema | Document the YAML entry shape in `lib/diagnostics/index.mjs` header comment + a JSON-schema-style validator function | Small |
| Implement `lib/diagnostics/index.mjs::loadRegistry` | Read `governance/diagnostics.yaml`, validate each entry, return `{ entries: [...], errors: [...] }` | Medium |
| Implement `lib/diagnostics/index.mjs::runDiagnostics` | Filter by tier/scope/only, import each runner, invoke, aggregate results, enforce timing budget (observability only) | Medium |
| Scaffold `governance/diagnostics.yaml` with 4 Tier-1 entries | One entry per Tier-1 producer; also seed `templates/diagnostics-template.yaml` | Small |
| Implement `lib/diagnostics/tier1/event-schema-valid.mjs` | Validate JSONL event shape against per-type schemas; use `lib/diagnostics/event-schemas.mjs` | Medium |
| Implement `lib/diagnostics/event-schemas.mjs` | Per-event-type schemas for `step_started`, `step_completed`, `validator_report`, `reviewer_report`, `status_change`, `plan_task` | Medium |
| Implement `lib/diagnostics/tier1/status-enum-legal.mjs` | Check spec frontmatter status against legal enum | Small |
| Implement `lib/diagnostics/tier1/lifecycle-prerequisite-met.mjs` | Read jsonl, fold events, assert prior-event presence per `prerequisites:` map | Medium |
| Implement `lib/diagnostics/tier1/frontmatter-present.mjs` | Assert YAML frontmatter parses; use shared YAML helper | Small |
| Write `tests/diagnostics/registry.test.mjs` | Engine-level behavior coverage | Medium |
| Write `tests/diagnostics/tier1/*.test.mjs` | One per producer | Medium |

## Acceptance Criteria

- [ ] `lib/diagnostics/index.mjs` exports `runDiagnostics({...})` and `loadRegistry(projectRoot)`
- [ ] `governance/diagnostics.yaml` exists with at least the 4 Tier-1 entries (`adev/event-schema-valid`, `adev/status-enum-legal`, `adev/lifecycle-prerequisite-met`, `adev/frontmatter-present`)
- [ ] Each Tier-1 producer exists at `lib/diagnostics/tier1/<id-stem>.mjs`, exports `run({...})`, completes in ≤50 ms median against the project's existing artifacts
- [ ] `loadRegistry` validates entries against the schema; invalid entries land in the `errors` array with reason `schema-invalid`
- [ ] Missing runner path emits `adev/diagnostic-runner-missing` self-diagnostic (severity warning); engine does not crash
- [ ] Duplicate `id` entries: engine uses the last, logs the duplicate
- [ ] `runDiagnostics({ tier: 1, scope: 'event-impact' })` filters to event-impact-scoped diagnostics only
- [ ] Response shape `{ fired: [...], skipped: [...], errors: [...] }` is stable; all three arrays always present
- [ ] Runner timing exceeding 200 ms (Tier-1) emits `adev/diagnostic-slow` observability finding; runner is not killed
- [ ] `event-schema-valid` correctly validates all 6 known event types against their schemas; rejects malformed events with clear messages
- [ ] `status-enum-legal` accepts all 7 legal values, rejects others with severity error
- [ ] `lifecycle-prerequisite-met` reads jsonl, folds correctly, and uses the `prerequisites:` map from `governance/diagnostics.yaml`
- [ ] `frontmatter-present` works on `.spec.md`, `.charter.md`, `.review.md`, `.validate.md`
- [ ] `tests/diagnostics/registry.test.mjs` and all `tests/diagnostics/tier1/*.test.mjs` pass
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations
