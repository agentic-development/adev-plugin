# Live Spec: Cost-Checkpoint Lifecycle Events

<!-- Live Spec within the session-awareness charter.
     Charter-extension: true — this capability is not yet in the Capability Map.
     Parent Charter: .context-index/specs/features/session-awareness/charter.md
     Sibling: cost-ticker.spec.md (read-side aggregator) — this spec is the write-side
              that persists per-step cost into the lifecycle event log.
     Consumes: cost-ticker.spec.md (validated) — emits via `adev cost summary --format json`.
     Origin: conversation 2026-05-24 — observed that the lifecycle log has zero cost entries
             despite the cost-ticker work; downstream consumers (/adev:retro, /adev:status,
             /adev:hygiene) cannot query cost without re-aggregating from
             `.session-tracking.jsonl`. -->

---
charter: session-awareness
charter-extension: true
status: implemented
kind: behavioral
risk_level: low
milestone: 0.28.0
revision: 1
charter-revision: 6
created: 2026-05-24
updated: 2026-05-24
tracker-ref: issue-539
source-manifest:
  sha: "1990758"
  files:
    - .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md
    - lib/cli/report.mjs
    - lib/diagnostics/event-schemas.mjs
    - lib/lifecycle-events.mjs
    - lib/lifecycle-state.mjs
    - skills/build/SKILL.md
    - tests/cli/report-cost-checkpoint.test.mjs
    - tests/lib/lifecycle-state-cost-checkpoint.test.mjs
  computed-at: "2026-05-24T21:58:24.162Z"
---

## Behavioral Contract

This spec defines a **write-side cost checkpoint** that persists per-step token + USD totals into the lifecycle event log (`.context-index/lifecycle-state/<slug>.jsonl`). It introduces a new canonical event discriminator (`cost_checkpoint`) and a CLI emitter (`adev report --type cost-checkpoint`). The `/adev:build` orchestrator wires the emitter into the post-step path, immediately after the existing `step_completed` event, by piping the read-side aggregator (`adev cost summary --spec <p> --format json` — already defined by `cost-ticker.spec.md`) into the new emitter.

The discriminator is additive. Existing event types (`step_completed`, `validator_report`, etc.) are unchanged. Logs authored before this spec lands continue to parse and project without modification.

Downstream consumers (`/adev:retro`, `/adev:status`, `/adev:hygiene`) gain a queryable per-spec / per-step cost view without re-aggregating from `.session-tracking.jsonl`.

### Preconditions

- `lib/cost-summary.mjs::aggregate()` and `adev cost summary --format json` are present (provided by `cost-ticker.spec.md`, validated)
- `lib/lifecycle-state.mjs::appendEvent()`, `CANONICAL_EVENTS`, and the existing `reportStep` emitter pattern are present
- `.context-index/lifecycle-state/<slug>.jsonl` exists (created lazily by the first lifecycle event for the spec — same precondition as every other event type)
- For the `/adev:build` integration: the orchestrator has already emitted a `step_completed` event for the just-finished step (already true; this spec adds a sibling event)

### Behaviors

1. **When** `lib/lifecycle-events.mjs::CANONICAL_EVENTS` is exported **then** it includes the discriminator `'cost_checkpoint'`. Logs containing `cost_checkpoint` events project under the canonical set rather than `StateProjection.unknownEvents[]`.

2. **When** `lib/diagnostics/event-schemas.mjs::REQUIRED_FIELDS_BY_EVENT` is consulted **then** the entry `cost_checkpoint` lists the required fields: `['event', 'ts', 'step', 'totals']`. The `totals` field is required (must be an object). Optional fields (not asserted by the Tier-1 diagnostic but accepted on write): `model_breakdown`, `since`, `checkpoints`, `skipped_lines`, `spec_ref`. Field-shape (primitive-type) checks live in the producer runner per the existing pattern; this spec adds only the required-field declaration.

3. **When** `reportCostCheckpoint(projectRoot, specPath, payload)` is called from `lib/lifecycle-state.mjs` **then** it appends one line to `.context-index/lifecycle-state/<slug>.jsonl` with shape:

   ```json
   {
     "event": "cost_checkpoint",
     "ts": "<ISO-8601 stamped by appendEvent>",
     "step": "<one of: review | plan | route | implement | validate>",
     "totals": {
       "input_tokens": 14000,
       "output_tokens": 18000,
       "cache_read_tokens": 1170000,
       "cache_creation_tokens": 22000,
       "cost_usd": 0.340000,
       "wall_seconds": 252
     },
     "model_breakdown": [
       { "model": "claude-sonnet-4-6", "cost_usd": 0.280000, "share": 0.823 }
     ],
     "since": "<ISO-8601 cutoff used by the aggregator>",
     "skipped_lines": 0
   }
   ```

   The emitter mirrors `reportStep`'s API contract: side-effecting append, no return value, no on-stdout output, errors thrown synchronously through to the caller.

4. **When** `adev report --type cost-checkpoint --spec <p> --step <name> --totals-json <json>` is invoked **then** the CLI verb parses the flags, validates that `--step` is in `{review, plan, route, implement, validate}`, parses `--totals-json` as a JSON object (rejecting non-object or non-finite-number fields), and delegates to `reportCostCheckpoint(projectRoot, specPath, { step, totals, ... })`. Silent success on exit 0; argument errors exit 1 with a usage line; gate-blocked exits 2 (mirrors the existing `--type validator` / `--type step` patterns).

5. **When** `adev report --type cost-checkpoint --from-summary --spec <p> --step <name>` is invoked **then** the CLI verb internally calls `aggregate({ projectRoot, specPath: spec, since: undefined })` (the same library function the cost-summary verb wraps), normalizes the result to the `cost_checkpoint` payload shape (see Behavior 3), and delegates to `reportCostCheckpoint`. This avoids forcing the orchestrator to shell-pipe JSON and re-parse it; the verb owns the end-to-end aggregation→persistence flow. The cost-summary verb itself remains read-only (no change to its contract).

6. **When** the cost aggregator reports `totals: null` (no data yet for the spec) **then** `adev report --type cost-checkpoint --from-summary` exits 0 without appending an event. A `cost_checkpoint` with null totals is never persisted (the diagnostic in Behavior 2 requires `totals` to be an object).

7. **When** `/adev:build` finishes any step in `{review, plan, route, implement, validate}` **then** the orchestrator invokes — immediately after the existing `adev build-state record` + ticker `adev cost summary` calls in `skills/build/SKILL.md` step 5/6 — the persistence call:

   ```bash
   adev report --type cost-checkpoint --from-summary --spec <SPEC_PATH> --step <STEP_NAME>
   ```

   The call is informational: a non-zero exit does NOT block the build. If the aggregator has no data (Behavior 6), the call is a silent no-op. The `step` argument echoes the `--step` flag the orchestrator just passed to `adev build-state record`.

8. **When** the orchestrator runs `/adev:build --auto` **then** the `--type cost-checkpoint` call still fires (persistence is independent of the ticker's `--quiet` flag — humans don't need to see the ticker, but downstream tooling needs the lifecycle entry regardless).

9. **When** a `cost_checkpoint` event already exists in the JSONL for the same `(spec_ref, step)` pair **then** the emitter appends a new event anyway. The lifecycle log is append-only and event-sourced; later projections take the most recent `cost_checkpoint` per step. This matches `step_completed` semantics (steps may be re-run; later wins on read).

10. **When** `/adev:retro` walks the lifecycle event log for an analysis window **then** it MAY surface aggregate `cost_checkpoint` totals per spec and per step in its output. (This spec persists the data; how `/adev:retro` consumes it is out of scope here.)

11. **When** `/adev:status --spec <path>` is invoked **then** it MAY include a `cost:` row derived from the most recent `cost_checkpoint` event per step. (This spec persists the data; consumer wiring is out of scope.)

12. **When** `/adev:hygiene` runs its audit passes **then** it MAY add a pass that flags specs whose `step_completed` events have no matching `cost_checkpoint` (suggesting the build orchestrator skipped the persistence call). (Out of scope here; this spec only delivers the producer.)

### Postconditions

- New discriminator `cost_checkpoint` is recognized by `CANONICAL_EVENTS`, `REQUIRED_FIELDS_BY_EVENT`, and the Tier-1 `adev/event-schema-valid` diagnostic
- New emitter `reportCostCheckpoint` exists in `lib/lifecycle-state.mjs` and is exported alongside the other `report*` helpers
- New CLI arm `adev report --type cost-checkpoint` accepts both `--totals-json <json>` (raw mode) and `--from-summary` (aggregate-and-emit mode)
- `skills/build/SKILL.md` step 5/6 prose names the new CLI verb in the `{review, plan, route, implement, validate}` loop
- Logs authored before this spec lands continue to parse — the discriminator is additive, no field changes to existing events
- The cost-summary verb's read-only contract (cost-ticker.spec.md line 41) is preserved — this spec adds a separate write-side emitter

### Error Cases

| Condition | Expected Behavior | Exit / Code |
|-----------|-------------------|-------------|
| `--type cost-checkpoint` without `--step` | Print `--type cost-checkpoint requires --step`, exit 1 | 1 |
| `--step` not in `{review, plan, route, implement, validate}` | Print `--step must be one of: review, plan, route, implement, validate`, exit 1 | 1 |
| `--totals-json` not valid JSON | Print `--totals-json could not be parsed: <err>`, exit 1 | 1 |
| `--totals-json` parses to non-object (e.g., array, string) | Print `--totals-json must be a JSON object`, exit 1 | 1 |
| `--totals-json` and `--from-summary` both passed | Print `--totals-json and --from-summary are mutually exclusive`, exit 1 | 1 |
| Neither `--totals-json` nor `--from-summary` passed | Print `--type cost-checkpoint requires --totals-json or --from-summary`, exit 1 | 1 |
| `--from-summary` and aggregator returns `totals: null` | Silent; exit 0; no event appended | 0 |
| Spec path escapes project root (containment) | Print `spec path outside project root`, exit 1 | 1 / `INVALID_SPEC_PATH` |
| Spec path does not exist | Print `spec not found: <path>`, exit 1 | 1 / `INVALID_SPEC_PATH` |
| `cost_checkpoint` event missing the required `step` or `totals` field | Tier-1 diagnostic `adev/event-schema-valid` flags it at write time; the in-process producer-runner check rejects the append per existing strict-mode behavior | 2 / event-diagnostics |

## System Constitution Reference

- **Principle: "Minimize external dependencies — prefer Node.js built-ins."** Applies because the emitter is a thin wrapper around `appendEvent` (existing) and a thin JSON parse / numeric coercion in the CLI arm. No new dependencies.
- **Principle: "Hook protocol compliance — exit 0 (allow) or 2 (block)."** The new CLI arm follows the existing `adev report` exit-code contract: 0 on silent success, 1 on argument error, 2 on gate-blocked (strict event-diagnostics mode).
- **Principle: "Skills are primarily markdown."** The `/adev:build` integration is a one-line CLI invocation added to skills/build/SKILL.md prose; no executable logic in SKILL.md.

## Module Impact Map

| Module | Impact | Changes Required |
|--------|--------|------------------|
| session-awareness | Primary | New emitter `reportCostCheckpoint`; new CLI arm `--type cost-checkpoint`; new discriminator registered in `CANONICAL_EVENTS` |
| lifecycle-state (`lib/lifecycle-state.mjs`) | Primary | Add `reportCostCheckpoint(projectRoot, specPath, payload)` mirroring `reportStep` shape |
| canonical events (`lib/lifecycle-events.mjs`) | Primary | Add `'cost_checkpoint'` to the `CANONICAL_EVENTS` set |
| event schemas (`lib/diagnostics/event-schemas.mjs`) | Primary | Add `cost_checkpoint: [...UNIVERSAL_REQUIRED, 'step', 'totals']` to `REQUIRED_FIELDS_BY_EVENT` |
| CLI report (`lib/cli/report.mjs`) | Primary | Add `--type cost-checkpoint` arm with `--step`, `--totals-json`, `--from-summary` flags |
| build skill (`skills/build/SKILL.md`) | Integration | Add one CLI line in step 5/6 prose: `adev report --type cost-checkpoint --from-summary --spec <p> --step <n>` after the existing ticker call |
| Tier-1 diagnostic (`lib/diagnostics/tier1/event-schema-valid.mjs`) | Read-through | No code change — the diagnostic loads its allowed-fields table from `REQUIRED_FIELDS_BY_EVENT`, so adding the entry is sufficient |
| Lifecycle event log spec (`.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md`) | Documentation | Append the new discriminator to the canonical-events table (per the four-step process documented in `lib/diagnostics/event-schemas.mjs:17-20`) |
| Tests | New | Producer test for `reportCostCheckpoint`; CLI arm tests (raw + `--from-summary` + error cases); diagnostic schema test asserting the new entry; build-skill prose test asserting the verb is named |

## Integration Points

1. **`adev report --type cost-checkpoint` ↔ `lib/cost-summary.mjs::aggregate`** — the `--from-summary` mode internally calls the aggregator (the same library the cost-summary CLI verb wraps). This keeps the orchestrator's invocation a single shell call.
2. **`adev report --type cost-checkpoint` ↔ `lib/lifecycle-state.mjs::appendEvent`** — final write path; reuses existing atomicity + diagnostic-gate semantics.
3. **`/adev:build` ↔ `adev report --type cost-checkpoint`** — orchestrator wires the call into the existing step 5/6 loop in `skills/build/SKILL.md`, immediately after the ticker. Treats non-zero exit as non-blocking.
4. **Downstream consumers (`/adev:retro`, `/adev:status`, `/adev:hygiene`)** ↔ `cost_checkpoint` events** — out-of-scope here; this spec only emits the events. Each consumer will land in a follow-up spec.

## Actionable Task Map

| Task | Description | Complexity |
|------|-------------|------------|
| Extend `CANONICAL_EVENTS` | Add `'cost_checkpoint'` to the set in `lib/lifecycle-events.mjs` | small |
| Extend `REQUIRED_FIELDS_BY_EVENT` | Add `cost_checkpoint: [...UNIVERSAL_REQUIRED, 'step', 'totals']` in `lib/diagnostics/event-schemas.mjs` | small |
| New emitter `reportCostCheckpoint` | Add to `lib/lifecycle-state.mjs`; mirrors `reportStep` shape; appends through `appendEvent` | small |
| CLI arm `--type cost-checkpoint` | Add to `lib/cli/report.mjs`; flags `--step`, `--totals-json`, `--from-summary`; mutual-exclusion + numeric validation | medium |
| Build skill prose | Add one line to `skills/build/SKILL.md` step 5/6 invoking the new CLI verb after the ticker call | small |
| Update lifecycle-event-log spec | Append the new discriminator to the canonical-events table in `agent-reliable-state-artifacts/lifecycle-event-log.spec.md` | small |
| Tests | Producer test (deterministic JSONL fixture); CLI arm tests (raw + `--from-summary` + error cases); diagnostic-schema test; build-skill prose presence test | medium |

## Acceptance Criteria

- [ ] `lib/lifecycle-events.mjs::CANONICAL_EVENTS` contains `'cost_checkpoint'`
- [ ] `lib/diagnostics/event-schemas.mjs::REQUIRED_FIELDS_BY_EVENT.cost_checkpoint` equals `['event', 'ts', 'step', 'totals']`
- [ ] `reportCostCheckpoint(projectRoot, specPath, payload)` is exported from `lib/lifecycle-state.mjs` and appends a `cost_checkpoint` event with the schema in Behavior 3
- [ ] `adev report --type cost-checkpoint --spec <p> --step review --totals-json '{"input_tokens":...}'` appends a single event; exit 0 silent
- [ ] `adev report --type cost-checkpoint --from-summary --spec <p> --step review` reads the aggregator and appends; exit 0 silent
- [ ] `--from-summary` with no aggregator data → no event appended; exit 0
- [ ] `--totals-json` mutually exclusive with `--from-summary` → exit 1 with the documented error
- [ ] `--step` outside the allowed set → exit 1
- [ ] Spec path traversal or non-existence → exit 1 with `INVALID_SPEC_PATH`
- [ ] Tier-1 `adev/event-schema-valid` diagnostic recognises the new discriminator and asserts `step` + `totals` presence (test: a `cost_checkpoint` event missing `step` is rejected at write time)
- [ ] Logs containing events with unknown discriminators (e.g., `cost_foo`) continue to parse and project under `unknownEvents[]` — additive change does not regress existing semantics
- [ ] `skills/build/SKILL.md` step 5/6 prose contains exactly one invocation of `adev report --type cost-checkpoint --from-summary --spec ... --step ...`
- [ ] An end-to-end test runs `/adev:build` against a fixture spec with a non-empty `.session-tracking.jsonl`, then asserts the spec's lifecycle JSONL contains one `cost_checkpoint` per executed step
- [ ] The cost-summary verb's read-only contract (cost-ticker.spec.md line 41) is preserved — an integration test snapshots `.context-index/` before and after `adev cost summary` and asserts no diff
- [ ] `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` canonical-events table includes the new discriminator (cross-spec consistency)
- [ ] `npm test` passes
- [ ] No constitutional violations
