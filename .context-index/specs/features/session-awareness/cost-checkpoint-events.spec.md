# Live Spec: Per-Step Cost in Lifecycle Events

<!-- Live Spec within the session-awareness charter.
     Charter-extension: true — this capability is not yet in the Capability Map.
     Parent Charter: .context-index/specs/features/session-awareness/charter.md
     Sibling: cost-ticker.spec.md (read-side aggregator) — this spec is the write-side
              that persists per-step cost into the lifecycle event log.
     Consumes: cost-ticker.spec.md (validated) — calls aggregate() internally.
     Origin: conversation 2026-05-24 — observed that the lifecycle log has zero cost entries
             despite the cost-ticker work; downstream consumers (/adev:retro, /adev:status,
             /adev:hygiene) cannot query cost without re-aggregating from
             `.session-tracking.jsonl`.
     Revised: 2026-05-24 — initial design used a separate `cost_checkpoint` discriminator;
              refactored to embed cost fields directly in `step_completed` via `--from-summary`
              on the existing `adev report --type step` arm. One event per step instead of two;
              sub-skills own the emission at their exit point. -->

---
charter: session-awareness
charter-extension: true
status: validated
kind: behavioral
risk_level: low
milestone: 0.28.0
revision: 2
charter-revision: 6
created: 2026-05-24
updated: 2026-05-24
tracker-ref: issue-539
source-manifest:
  sha: "b2f4697"
  files:
    - .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md
    - lib/cli/report.mjs
    - lib/diagnostics/event-schemas.mjs
    - lib/lifecycle-events.mjs
    - lib/lifecycle-state.mjs
    - skills/build/SKILL.md
    - skills/implement/SKILL.md
    - skills/plan/SKILL.md
    - skills/review-specs/SKILL.md
    - skills/specify/SKILL.md
    - skills/validate/SKILL.md
    - tests/cli/report-step-from-summary.test.mjs
    - tests/lib/lifecycle-state-step-cost.test.mjs
  computed-at: "2026-05-24T22:30:00.000Z"
drift_detected: true
---

## Behavioral Contract

This spec defines how per-step token + USD totals are persisted into the lifecycle event log (`.context-index/lifecycle-state/<slug>.jsonl`). Rather than introducing a separate event discriminator, cost fields (`totals`, `model_breakdown`, `skipped_lines`) are embedded directly in the existing `step_completed` event. Sub-skills pass `--from-summary` on their exit event call; `adev report --type step` aggregates from `.session-tracking.jsonl` (via the same `aggregate()` function the cost-ticker verb wraps) and writes cost into the event payload.

No new discriminator is introduced. Existing `step_completed` events without cost fields continue to parse correctly — the fields are optional. The cost-summary verb's read-only contract (cost-ticker.spec.md) is preserved.

Downstream consumers (`/adev:retro`, `/adev:status`, `/adev:hygiene`) gain a queryable per-spec / per-step cost view from the existing `step_completed` event without re-aggregating from `.session-tracking.jsonl`.

### Preconditions

- `lib/cost-summary.mjs::aggregate()` is present (provided by `cost-ticker.spec.md`, validated)
- `lib/lifecycle-state.mjs::appendEvent()` and the existing `reportStep` emitter are present
- `.context-index/lifecycle-state/<slug>.jsonl` exists (created lazily by the first lifecycle event for the spec)
- The emitting sub-skill has already run and its API calls are flushed to `.session-tracking.jsonl` before the exit event is emitted

### Behaviors

1. **When** `adev report --type step --status completed --from-summary --spec <p>` is invoked **then** the CLI arm calls `aggregate({ projectRoot, specPath })` internally, and if `result.totals` is non-null, includes `totals`, `model_breakdown`, and `skipped_lines` in the `reportStep` call. The resulting `step_completed` event in the JSONL has shape:

   ```json
   {
     "event": "step_completed",
     "ts": "<ISO-8601 stamped by appendEvent>",
     "step": "<one of: specify | review | plan | route | implement | validate>",
     "verdict": "<PASS | PASS_WITH_NOTES | FAIL>",
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
     "skipped_lines": 0
   }
   ```

2. **When** `--from-summary` is passed with `--status started` or `--status failed` **then** the CLI exits 1 with `--from-summary is only valid with --status completed`. Cost fields are only meaningful on `step_completed`; they are never written to `lifecycle_step` or `step_failed` events.

3. **When** `aggregate()` returns `totals: null` (no session data for the spec) **then** `step_completed` is still appended, but without cost fields. The event is valid — cost fields are optional.

4. **When** `reportStep(projectRoot, specPath, args)` is called with `args.totals` as a non-null object **then** it includes `totals` in the payload. When `args.totals` is null, undefined, or absent, the payload omits the field. `model_breakdown` and `skipped_lines` follow the same optional pattern. Cost fields are silently ignored when `args.status` is not `'completed'`.

5. **When** each sub-skill (`/adev:review-specs`, `/adev:plan`, `/adev:implement`, `/adev:validate`, `/adev:specify`) emits its exit lifecycle event **then** it appends `--from-summary` to the `adev report --type step --status completed` call. The sub-skill owns the cost emission at its own exit point — the build orchestrator does not need a separate cost-persistence call.

6. **When** a `step_completed` event already exists in the JSONL for the same step **then** the emitter appends a new event anyway. The lifecycle log is append-only and event-sourced; later projections take the most recent `step_completed` per step.

7. **When** `/adev:retro` walks the lifecycle event log **then** it MAY read the `totals` field from the most recent `step_completed` per step to surface per-spec / per-step cost. (Consumer wiring is out of scope here.)

8. **When** `/adev:status --spec <path>` is invoked **then** it MAY include a `cost:` row derived from the `totals` field in the most recent `step_completed` per step. (Consumer wiring is out of scope here.)

9. **When** `/adev:hygiene` runs its audit passes **then** it MAY add a pass that flags `step_completed` events missing a `totals` field, suggesting the sub-skill's exit event was emitted without `--from-summary`. (Out of scope here.)

### Postconditions

- `adev report --type step --status completed --from-summary` aggregates cost and embeds it in the `step_completed` payload
- `reportStep` accepts optional `totals`, `model_breakdown`, `skipped_lines` fields; these are included in the event only when `status === 'completed'` and `totals` is non-null
- `--from-summary` is present in the exit event call of `review-specs`, `plan`, `implement`, `validate`, and `specify` SKILL.md files
- Existing `step_completed` events without cost fields continue to parse — the fields are optional
- The cost-summary verb's read-only contract (cost-ticker.spec.md) is preserved — `aggregate()` is called by the `--type step` arm, not by the cost-summary verb

### Error Cases

| Condition | Expected Behavior | Exit / Code |
|-----------|-------------------|-------------|
| `--from-summary` with `--status started` | Print `--from-summary is only valid with --status completed`, exit 1 | 1 |
| `--from-summary` with `--status failed` | Print `--from-summary is only valid with --status completed`, exit 1 | 1 |
| `--from-summary` and aggregator returns `totals: null` | Append `step_completed` without cost fields; exit 0 | 0 |
| Spec path escapes project root (containment) | Print `spec not found: <path>`, exit 1 | 1 / `INVALID_SPEC_PATH` |
| Spec path does not exist | Print `spec not found: <path>`, exit 1 | 1 / `INVALID_SPEC_PATH` |

## System Constitution Reference

- **Principle: "Minimize external dependencies — prefer Node.js built-ins."** Applies because the implementation adds optional fields to an existing emitter with no new dependencies.
- **Principle: "Hook protocol compliance — exit 0 (allow) or 2 (block)."** The `--from-summary` path follows the existing `adev report` exit-code contract.
- **Principle: "Skills are primarily markdown."** Sub-skills add one flag (`--from-summary`) to their existing exit event call; no executable logic in SKILL.md files.

## Module Impact Map

| Module | Impact | Changes |
|--------|--------|---------|
| lifecycle-state (`lib/lifecycle-state.mjs`) | Primary | `reportStep` accepts optional `totals`, `model_breakdown`, `skipped_lines`; silently ignored unless `status === 'completed'` |
| CLI report (`lib/cli/report.mjs`) | Primary | `--type step --status completed` gains `--from-summary` flag; calls `aggregate()` and passes cost fields to `reportStep` |
| Sub-skill SKILL.md files | Integration | `review-specs`, `plan`, `implement`, `validate`, `specify` add `--from-summary` to their `--status completed` exit event call |
| Lifecycle event log spec (`lifecycle-event-log.spec.md`) | Documentation | `step_completed` description updated to note optional cost fields |
| Tier-1 diagnostic (`lib/diagnostics/tier1/event-schema-valid.mjs`) | None | No change — cost fields are optional and not in `REQUIRED_FIELDS_BY_EVENT` |
| `lib/lifecycle-events.mjs` / `lib/diagnostics/event-schemas.mjs` | None | No new discriminator; `cost_checkpoint` was removed in the refactor |

## Integration Points

1. **`adev report --type step --from-summary` ↔ `lib/cost-summary.mjs::aggregate`** — the `--from-summary` arm calls `aggregate()` internally; the cost-summary verb itself remains read-only.
2. **`adev report --type step --from-summary` ↔ `lib/lifecycle-state.mjs::reportStep`** — passes cost fields into `reportStep`, which writes them to the `step_completed` payload via `appendEvent`.
3. **Sub-skills ↔ `adev report --type step --from-summary`** — each sub-skill's SKILL.md exit event call includes `--from-summary`; the orchestrator has no separate cost-persistence call.
4. **Downstream consumers (`/adev:retro`, `/adev:status`, `/adev:hygiene`) ↔ `step_completed` cost fields** — out-of-scope here; this spec only persists the data.

## Actionable Task Map

| Task | Description | Complexity |
|------|-------------|------------|
| Extend `reportStep` | Accept optional `totals`, `model_breakdown`, `skipped_lines`; embed in payload when `status === 'completed'` | small |
| Add `--from-summary` to `--type step` | In `lib/cli/report.mjs`: validate only with `--status completed`; call `aggregate()`; pass cost fields to `reportStep` | small |
| Update sub-skill SKILL.md files | Add `--from-summary` to exit event calls in `review-specs`, `plan`, `implement`, `validate`, `specify` | small |
| Update `lifecycle-event-log.spec.md` | Note optional cost fields on `step_completed` | small |
| Tests | `reportStep` cost-field tests (5); CLI `--from-summary` on `--type step` tests (5) | small |

## Acceptance Criteria

- [x] `adev report --type step --status completed --from-summary --spec <p>` embeds `totals` in the appended `step_completed` event when session data exists; exit 0 silent
- [x] `adev report --type step --status completed --from-summary --spec <p>` with no session data appends `step_completed` without cost fields; exit 0
- [x] `--from-summary` with `--status started` exits 1 with the documented error
- [x] `--from-summary` with `--status failed` exits 1 with the documented error
- [x] `reportStep` with `totals` non-null embeds cost fields in `step_completed` payload
- [x] `reportStep` with `totals` null/absent emits `step_completed` without cost fields
- [x] `reportStep` with `totals` present but `status !== 'completed'` silently omits cost fields
- [x] `skills/review-specs/SKILL.md`, `skills/plan/SKILL.md`, `skills/implement/SKILL.md`, `skills/validate/SKILL.md`, `skills/specify/SKILL.md` exit event calls include `--from-summary`
- [x] Existing `step_completed` events without cost fields continue to parse correctly — no regression
- [x] The cost-summary verb's read-only contract (cost-ticker.spec.md) is preserved
- [x] `npm test` passes
- [x] No constitutional violations
