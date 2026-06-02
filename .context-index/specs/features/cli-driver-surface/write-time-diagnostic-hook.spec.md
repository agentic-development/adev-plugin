---
charter: cli-driver-surface
kind: behavioral
status: implemented
risk_level: high
milestone:
revision: 2
charter-revision: 3
created: 2026-05-14
updated: 2026-05-14
source-manifest:
  sha: "9f7eaab"
  files:
    - lib/diagnostics/event-schemas.mjs
    - lib/lifecycle-events.mjs
    - lib/lifecycle-state.mjs
    - templates/manifest-template.yaml
    - tests/cli/status-pipeline.test.mjs
    - tests/cli/status-render.test.mjs
    - tests/lib/lifecycle-state-concurrent.test.mjs
    - tests/lib/lifecycle-state-crash.test.mjs
    - tests/lib/lifecycle-state-event-diagnostics.test.mjs
    - tests/lib/lifecycle-state-perf.test.mjs
    - tests/lib/lifecycle-state.render.test.mjs
    - tests/lib/lifecycle-state.test.mjs
  computed-at: "2026-05-14T21:41:53.147Z"
drift_detected: true
---

# Live Spec: Write-Time Diagnostic Hook

<!-- Live Spec within the cli-driver-surface charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/cli-driver-surface/charter.md -->

> **Rev 2 amendment (2026-05-14):** Updated illustrative diagnostic IDs to match `diagnostic-registry.spec.md` rev 2. The example previously used `adev/lifecycle-prerequisite-met`, which was dropped from the Tier-1 producer set in `diagnostic-registry` rev 2 (lifecycle step-order is now enforced by `requireGate`, not by a diagnostic). Examples now use `adev/event-schema-valid` (a real Tier-1 producer). Behavior contracts are unchanged; this is a documentation alignment, not a contract change. Status returned to `review-pending` because cross-spec example payloads changed.

## Behavioral Contract

The write-time diagnostic hook closes the claim/evidence gap at the strongest possible moment: every time a lifecycle event is appended to a spec's JSONL log, the engine runs Tier-1 diagnostics scoped to `event-impact` and tags the event inline with any firing diagnostic IDs. The result: an agent appending an event with a typo'd or unknown discriminator cannot do so silently — the appended event carries `diagnostic_warnings: ["adev/event-schema-valid", ...]` as a structural part of the audit trail. The default mode is `tag` (write succeeds, warnings recorded inline); `strict` mode rejects the write with a `GateError`; `off` disables. The manifest knob `lifecycle.event_diagnostics: strict|tag|off` (default `tag`) controls behavior.

### Preconditions

- `diagnostic-registry` spec validated; `runDiagnostics({ tier: 1, scope: 'event-impact' })` is available and meets its <50 ms per-event budget.
- `lib/lifecycle-state.mjs::appendEvent` exists (from `agent-reliable-state-artifacts` charter); this spec extends it but does not redesign the underlying append semantics.
- `lib/manifest.mjs::loadManifest` correctly parses unknown manifest fields without crashing.
- `.context-index/lifecycle-state/<slug>.jsonl` files use single-line JSON per event (no multi-line embedded JSON).

### Behaviors

1. **When** `appendEvent(projectRoot, specPath, event)` is called (parameter named `specPath` per `agent-reliable-state-artifacts/lifecycle-event-log.spec.md` canonical signature), **then** it (a) writes the event to the spec's `.jsonl` file as before, (b) loads the diagnostic registry, (c) calls `runDiagnostics({ projectRoot, spec: specPath, tier: 1, scope: 'event-impact', event })`, (d) processes the result according to the manifest's `lifecycle.event_diagnostics` mode.
2. **When** `lifecycle.event_diagnostics` is `tag` (default), **then** firing diagnostics are appended to the event's `diagnostic_warnings` field as an array of IDs *before* the event is written to disk; the write proceeds; `appendEvent` returns `{ written: true, event: <event-with-tags>, diagnostics: <full-result-from-engine> }`.
3. **When** `lifecycle.event_diagnostics` is `strict`, **then** any error-severity firing causes `appendEvent` to throw a `GateError` *before* the event is written; the disk state is unchanged; the caller sees the error and can decide how to recover. On the success path (no error-severity firings), strict mode returns the same `{ written: true, event, diagnostics }` shape as `tag` mode — events still receive `diagnostic_warnings` tags for non-error firings.
4. **When** `lifecycle.event_diagnostics` is `off`, **then** the engine is not invoked; `appendEvent` behavior matches the pre-spec baseline (no tagging, no GateError, no diagnostic processing). Return value matches the pre-spec baseline (whatever the baseline implementation returns, typically `undefined` or `{ written: true }`).
5. **When** the diagnostic engine throws an unexpected error (registry-load failure, runner crash that escaped containment), **then** `appendEvent` logs the error to stderr (one line, prefixed `[event-diagnostics]`) but still writes the event without tags — engine failure does not block lifecycle writes. The error is itself a self-diagnostic that future `adev diagnose` runs surface.
6. **When** the engine returns firings of severity `info` or `warning` only, **then** regardless of mode, the write proceeds. `strict` mode only blocks on `error` severity.
7. **When** an event already has a `diagnostic_warnings` field (e.g., set by the caller for testing), **then** the engine's firings are *merged into* that array, deduplicated; the caller's tags are preserved.
8. **When** the engine reports `errors:` (registry-level, missing runners), **then** these are NOT tagged onto the event (they are not findings about the event itself); they are logged to stderr with prefix `[event-diagnostics:registry-error]`.
9. **When** the manifest does not declare `lifecycle.event_diagnostics`, **then** the default is `tag`.
10. **When** the engine call exceeds 50 ms (Tier-1 budget; per `diagnostic-registry` spec the engine reports this as `adev/diagnostic-slow` info severity), **then** the slow finding is logged but does not affect the event's `diagnostic_warnings` (slow runners report observability findings to stderr, not as event tags).

### Postconditions

- `lib/lifecycle-state.mjs::appendEvent` integrates the engine call as specified.
- New manifest field `lifecycle.event_diagnostics: strict|tag|off` is documented in `templates/manifest-template.yaml` (default `tag`).
- New event field `diagnostic_warnings: [<id>...]` is documented in the lifecycle-event schema (`lib/diagnostics/event-schemas.mjs` per `diagnostic-registry` spec).
- `tests/lib/lifecycle-state-event-diagnostics.test.mjs` covers all behaviors across all three modes.
- Charter Capability Map: rows "Write-time Tier-1 hook in `appendEvent`" and "Manifest knob `lifecycle.event_diagnostics`" have `Status: specified`.

### Error Cases

| Condition | Expected Behavior |
|---|---|
| Manifest has invalid `lifecycle.event_diagnostics` value (not strict/tag/off) | Treat as `tag`, log warning to stderr at first call: `"[event-diagnostics] unknown mode '<v>'; defaulting to tag"` |
| Engine import fails (e.g., `lib/diagnostics/index.mjs` not yet installed) | Log error to stderr, fall back to `off` mode for this call; write proceeds without tags |
| Engine call throws despite engine's internal try/catch | Log full error to stderr; in `tag`/`off` modes write proceeds; in `strict` mode the throw propagates as `GateError` |
| Event object missing required fields (no `event`/`ts`) | The event-schema-valid Tier-1 producer fires; in `tag` mode the warning is tagged onto the malformed event itself (still written); in `strict` mode `appendEvent` throws |
| `runDiagnostics` returns runner-level `errors:` (registry malformed) | Log to stderr with `[event-diagnostics:registry-error]` prefix; do not tag onto event; write proceeds |
| `strict` mode AND an error-severity Tier-1 producer fires on the appended event (e.g., `adev/event-schema-valid` rejects an unknown event discriminator, or `adev/frontmatter-present` flags a spec missing frontmatter) | `appendEvent` throws `GateError` with the firing diagnostic's message; event NOT written to disk |
| `strict` mode AND only `warning` or `info` severities fire | Write proceeds; not blocking |

## System Constitution Reference

- **Principle 1 ("Minimize external dependencies"):** Integration uses existing modules only. No new deps.
- **Principle 3 ("Pure ESM"):** All affected files `.mjs`, ESM.
- **Principle 4 ("Hook protocol compliance"):** When `appendEvent` is called from within a `lib/cli/<verb>.mjs` helper and throws `GateError` in strict mode, the driver-substrate dispatcher converts to exit code 2 — composing cleanly with the hook protocol.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|---|---|---|
| Extend `lib/lifecycle-state.mjs::appendEvent` | Add engine integration: load registry once (memoize), call `runDiagnostics`, branch on mode | Medium |
| Add memoized registry loader in `lib/lifecycle-state.mjs` | One load per process; invalidate on file-watch (out of scope; just load once at first use) | Small |
| Implement merge logic for `diagnostic_warnings` | Dedupe + preserve caller-provided tags | Small |
| Document the manifest knob | Update `templates/manifest-template.yaml`, add comments | Small |
| Document the event field | Update schema docs in `lib/diagnostics/event-schemas.mjs` (added in registry spec) | Small |
| Write `tests/lib/lifecycle-state-event-diagnostics.test.mjs` | Cover all 10 behaviors across all 3 modes (matrix); cover all error cases | Large |
| Update existing `appendEvent` tests | Existing baseline tests must remain green; explicit `event_diagnostics: off` in test fixtures preserves prior behavior | Medium |

## Acceptance Criteria

- [ ] `appendEvent` writes the event AND processes diagnostics per the manifest mode
- [ ] `tag` mode (default): writes event with `diagnostic_warnings: [<id>...]` inlined; returns `{ written, event, diagnostics }`
- [ ] `strict` mode: throws `GateError` on error-severity firings BEFORE writing; disk state unchanged
- [ ] `off` mode: no engine call; behavior identical to pre-spec baseline
- [ ] Default mode when manifest field absent is `tag`
- [ ] Invalid mode value falls back to `tag` with one-time stderr warning
- [ ] Engine errors (registry-load, runner crash) do not block writes in `tag`/`off` modes
- [ ] Engine errors in `strict` mode propagate as `GateError`
- [ ] Existing `diagnostic_warnings` on an event are preserved; engine firings merged + deduped
- [ ] Slow runner findings (`adev/diagnostic-slow`) go to stderr, not onto event tags
- [ ] Per-event overhead in `tag` mode is <100 ms p99 against this repo's lifecycle logs
- [ ] All existing `appendEvent` tests continue to pass (with `off` mode in fixtures)
- [ ] `tests/lib/lifecycle-state-event-diagnostics.test.mjs` covers the full mode × behavior matrix
- [ ] `templates/manifest-template.yaml` documents the new knob
- [ ] `npm test` passes
- [ ] No constitutional violations
