---
charter: session-awareness
charter-extension: true
status: validated
kind: behavioral
risk_level: medium
milestone: 0.28.0
revision: 1
charter-revision: 6
created: 2026-05-22
updated: 2026-05-22
tracker-ref: issue-501
source-manifest:
  sha: "93e83cd"
  files:
    - cli/index.mjs
    - lib/cli/cost.mjs
    - lib/cost-formatters.mjs
    - lib/cost-summary.mjs
    - skills/build/SKILL.md
    - tests/cli/cost-summary.test.mjs
    - tests/lib/cost-formatters.test.mjs
    - tests/lib/cost-summary.test.mjs
    - tests/skills/build/cost-ticker-prose.test.mjs
  computed-at: "2026-05-22T14:38:32.264Z"
drift_detected: true
---

# Live Spec: Per-Spec Cost Ticker

<!-- Live Spec within the session-awareness charter.
     Charter-extension: true — this capability is not yet in the Capability Map.
     Parent Charter: .context-index/specs/features/session-awareness/charter.md
     Consumes: token-cost-logging.spec.md (validated, rev 2) — the data-collection layer.
     Origin: .context-index/hygiene/retros/2026-05-16-validation-charter-build.md improvement #7
     Tracker: issue-501 (epic-72, milestone 0.28.0) -->

## Behavioral Contract

This spec defines a **read-side cost summary** for adev work. A new CLI verb (`adev cost summary`) aggregates entries from `.context-index/.session-tracking.jsonl` (populated by the validated `token-cost-logging` capability) and emits per-spec / per-step cost totals. `/adev:build` invokes the verb between pipeline steps to surface a running cost ticker so long builds are no longer cost-blind.

The verb is read-only; it never mutates session-tracking state, the cursor file, or any other on-disk artifact. It is safe to run from any context (CI, hooks, manual).

### Preconditions

- `.context-index/.session-tracking.jsonl` exists (created by `hooks/session-capture.sh` on first tool call) OR is absent (the verb degrades to a no-data path)
- `lib/token-pricing.mjs` is present (existing, from `token-cost-logging.spec.md`)
- For the `/adev:build` integration: the orchestrator has access to the spec path argument (already true)

### Behaviors

1. **When** `adev cost summary --spec <path>` is invoked **then** the verb reads `.context-index/.session-tracking.jsonl` line-by-line, filters entries whose `spec_ref` field equals the resolved spec path (or whose `issue` field is the spec's bound Feature work item ID as resolved via `getIssueManager(manifest).findBySpecRef(path)`), aggregates the `usage` block fields (`input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`, `cost_usd`), and emits a one-line summary to stdout.

2. **When** the default `--format text` is used **then** the one-line output follows this format (single line, no trailing newline-of-blank): `cost: $<usd> · <total-tok> tok (<cache-tok> cache·read <cache-pct>% · <out-tok> out · <in-tok> in) · <wall>s · <model-summary>`. Counts use compact units (`1.2M`, `38K`, `512`). `<model-summary>` is the dominant model ID by cost share (e.g. `sonnet`); if multiple models contribute, suffix with `+<N>` (e.g. `sonnet+1`).

3. **When** `--format json` is passed **then** stdout is a single JSON object with this shape:

   ```json
   {
     "spec": "<absolute path>",
     "issue_id": "<issue id or null>",
     "totals": {
       "input_tokens": 14000,
       "output_tokens": 18000,
       "cache_read_tokens": 1170000,
       "cache_creation_tokens": 22000,
       "cost_usd": 0.340000,
       "wall_seconds": 252
     },
     "checkpoints": [
       { "step": "review",    "input_tokens": 3000, "output_tokens": 2000, "cache_read_tokens": 315000, "cache_creation_tokens": 5000, "cost_usd": 0.040000, "wall_seconds": 48 },
       { "step": "plan",      "...": "..." }
     ],
     "model_breakdown": [
       { "model": "claude-sonnet-4-6", "cost_usd": 0.280000, "share": 0.823 },
       { "model": "claude-opus-4-7",   "cost_usd": 0.060000, "share": 0.177 }
     ]
   }
   ```

   `checkpoints` is a flat array; entries without an associated `lifecycle_step` event are grouped under `step: "ungrouped"`. `model_breakdown` is sorted by `cost_usd` descending. Field precision: `cost_usd` is 6 decimals; `share` is 3 decimals (sums to 1.0 ± epsilon).

4. **When** `--include-checkpoints` is set **then** the `text` format appends a per-step breakdown table after the summary line; checkpoint grouping is by the most recent preceding `lifecycle_step` event of type `started` with `step ∈ {review, plan, route, implement, validate}`. Entries with no preceding step event are grouped under `ungrouped`. In `json` format, the `checkpoints` array is always populated regardless of this flag (the flag is text-only).

5. **When** `.session-tracking.jsonl` is missing OR contains zero matching entries for the spec **then** the verb prints `cost: (no usage data yet)` to stdout (text format) or `{"spec":"...","totals":null,...}` (json format), and exits 0. With `--quiet`, prints nothing and still exits 0.

6. **When** `--since <iso8601>` is passed **then** only entries with `timestamp >= since` are included. If `--since` is omitted, default to the most recent `lifecycle_step` event with `step: "review"`, `status: "started"` for this spec found in `.context-index/lifecycle-state/<slug>.jsonl`; if no such event exists, default to "all entries for this spec."

7. **When** the verb is invoked with the environment variable `ADEV_BUILD_TICKER=1` **then** the output is prefixed with `[cost] ` and routed to **stderr** (not stdout). Standalone invocations (without the env var) write to stdout. This keeps `/adev:build`'s ticker out of any stdout-consuming pipe but visible to interactive users.

8. **When** `/adev:build` finishes any step in `{review, plan, route, implement, validate}` and is NOT in `--auto` mode **then** the orchestrator invokes `adev cost summary --spec <path> --include-checkpoints` with `ADEV_BUILD_TICKER=1`, prints the result, and proceeds to the next step. Ticker output is informational; an empty or non-zero exit from the verb does not block the build.

9. **When** `/adev:build --auto` is active **then** the orchestrator invokes the same verb with `--quiet` appended. No ticker output appears in `--auto` runs unless cost-cap warnings fire (see Behavior 11).

10. **When** entries reference multiple model IDs **then** the `model_breakdown` field is populated (json) or the text-format model summary shows the dominant model with `+N` suffix (e.g. `sonnet+1`).

11. **When** the resolved manifest contains `build.cost_warn_usd: <N>` AND the accumulated `cost_usd` for the current spec equals-or-exceeds `<N>` **then** the verb emits an additional warning line on stderr after the summary: `[cost warn] spec cost $<usd> exceeds threshold $<N>`. The warning fires at most once per `(spec, threshold-crossing)` boundary — once `cost_usd >= N` it is sticky for the rest of the build. The warning is non-blocking; the build continues. If `build.cost_warn_usd` is absent from manifest, no warning logic runs.

12. **When** `--epic <id>` is passed **then** the filter changes from "entries matching the spec's bound Feature work item" to "entries matching any work item under the named epic (resolved via `getIssueManager(manifest).walkTree(<epic-id>)`)". `--epic` and `--spec` are mutually exclusive — passing both exits 1 with `CONFLICTING_FILTERS`.

13. **When** a JSONL line is malformed (parse error) **then** the verb skips the line, increments an internal `skipped_lines` counter, and continues. If `skipped_lines > 0` at end-of-input, the verb prints `(note: skipped <N> malformed lines)` to stderr (text format) or includes `"skipped_lines": N` in the JSON object. The verb never errors out on individual malformed lines.

### Postconditions

- No on-disk state is mutated by the verb (read-only contract — verified by an integration test that snapshots `.context-index/` before and after a verb invocation)
- The verb exits 0 on success including no-data paths; exit 1 only on argument errors (`CONFLICTING_FILTERS`, unknown flag, malformed `--since`)
- `/adev:build` continues regardless of verb exit code (informational ticker, never a gate)

### Error Cases

| Condition | Expected Behavior | Exit / Code |
|-----------|-------------------|-------------|
| Both `--spec` and `--epic` provided | Print `error: --spec and --epic are mutually exclusive`, exit 1 | 1 / `CONFLICTING_FILTERS` |
| `--since <value>` is not parseable as ISO-8601 | Print `error: --since '<value>' is not a valid ISO-8601 timestamp`, exit 1 | 1 / `INVALID_SINCE` |
| `--format` value other than `text` / `json` | Print `error: --format must be 'text' or 'json'`, exit 1 | 1 / `INVALID_FORMAT` |
| `.session-tracking.jsonl` missing | Print `cost: (no usage data yet)` (text) or empty JSON (json), exit 0 | 0 |
| Zero matching entries for the resolved filter | Same as missing-file path | 0 |
| Spec path passed to `--spec` does not exist on disk | Print `error: spec not found at '<path>'`, exit 1 | 1 / `INVALID_SPEC_PATH` |
| Spec path passes traversal-guard (outside `projectRoot`) | Print `error: spec path outside project root`, exit 1 | 1 / `INVALID_SPEC_PATH` |
| Malformed JSONL line | Skip + count + emit stderr note at end; never aborts | 0 |
| Issue manager unavailable (manifest missing `tasks.backend`) | Fall back to `spec_ref` field matching only; do not attempt issue resolution; no warning | 0 |
| `build.cost_warn_usd` is non-numeric or negative | Ignore the field, emit stderr `[cost warn] manifest build.cost_warn_usd is invalid, ignored`, continue | 0 |

## System Constitution Reference

- **Principle: "Minimize external dependencies — prefer Node.js built-ins."** Applies because the verb implementation parses JSONL with the existing `lib/token-pricing.mjs` + standard `fs` / `path` modules. No new dependencies are introduced. The aggregator is a single-pass line-stream reader.
- **Principle: "Hook protocol compliance — exit 0 (allow) or 2 (block)."** Tangentially applies: the verb is not itself a hook, but the `/adev:build` integration path treats verb failures as non-blocking (exit code is informational), preserving the build's own gate semantics.
- **Principle: "Skills are primarily markdown — companion code is allowed but skills must not require it to function."** Applies because the `/adev:build` integration is a prose-level instruction calling a named CLI verb; the verb's existence is required for the ticker to function but `/adev:build` does not embed implementation logic in its SKILL.md.

## Module Impact Map

| Module | Impact | Changes Required |
|--------|--------|------------------|
| session-awareness | Primary | New CLI verb `adev cost summary`; new aggregator in `lib/cost-summary.mjs`; tests under `tests/lib/cost-summary.test.mjs` and `tests/cli/cost-summary.test.mjs` |
| build (skills/build) | Integration | Add ticker invocations to SKILL.md prose after each of `review`, `plan`, `route`, `implement`, `validate`. No code changes to lib/build-state.mjs. |
| CLI dispatch (`cli/index.mjs`) | Integration | Register new `cost` verb with `summary` subcommand. |
| Manifest schema (manifest.yaml) | Optional | New top-level optional field `build.cost_warn_usd` (number) consumed by Behavior 11. |

## Integration Points

1. **`/adev:build` ↔ `adev cost summary`** — orchestrator invokes the verb after each step's `completed` lifecycle event and before dispatching the next step. Passes `ADEV_BUILD_TICKER=1` env var. Treats verb exit non-blocking.
2. **`adev cost summary` ↔ `.context-index/.session-tracking.jsonl`** — read-only consumer of the JSONL produced by `hooks/session-capture.sh` per `token-cost-logging.spec.md`.
3. **`adev cost summary` ↔ `lib/lifecycle-state.mjs`** — reads `.context-index/lifecycle-state/<slug>.jsonl` for step-boundary grouping (Behavior 4) and for default `--since` resolution (Behavior 6).
4. **`adev cost summary` ↔ `lib/issues/registry.mjs`** — calls `getIssueManager(manifest).findBySpecRef(path)` to resolve the spec's bound Feature for issue-based filtering. Degrades gracefully if no issue board is configured.
5. **`adev cost summary` ↔ `lib/token-pricing.mjs`** — uses the pricing table only to confirm model-ID coverage in the model-breakdown computation; per-entry `cost_usd` is already computed at capture time by the hook.

## Actionable Task Map

| Task | Description | Complexity |
|------|-------------|------------|
| Aggregator library | `lib/cost-summary.mjs` exporting `aggregate({ projectRoot, specPath, epicId, since })` returning the JSON-shape object | medium |
| CLI verb wiring | Register `cost` verb in `cli/index.mjs`; subcommand `summary`; arg parsing per Behavior 1-6, 12 | small |
| Text formatter | `formatText(aggregate, { includeCheckpoints })` producing the compact line and optional table | small |
| JSON formatter | `formatJson(aggregate)` producing the schema in Behavior 3 | small |
| Build integration | Update `skills/build/SKILL.md` to invoke the verb after each pipeline step's exit event; gate on `--auto` for `--quiet` | small |
| Cost-warn feature | Behavior 11 — manifest field read in CLI; warn-once tracker per build run | small |
| Tests | Aggregator (deterministic fixture JSONL → expected aggregate); CLI parse/format; missing-file path; multi-model breakdown; --quiet; --since; --epic; malformed-line skip | medium |

## Acceptance Criteria

- [ ] `adev cost summary --spec <validated-fixture-spec>` returns totals matching a hand-computed fixture (regression test)
- [ ] `adev cost summary --spec <path> --format json` output validates against the schema in Behavior 3 (key set, types, sort order, decimal precision)
- [ ] `adev cost summary --spec <path> --include-checkpoints` text output contains a line per checkpoint plus a `total` row; ungrouped entries appear in an `ungrouped` row if present
- [ ] Missing `.session-tracking.jsonl` path produces `cost: (no usage data yet)` text or null-totals JSON; exit 0
- [ ] `--quiet` with no data produces zero output and exit 0
- [ ] `--since <iso>` filters entries correctly; default `--since` resolves to the most recent `review:started` lifecycle event for the spec
- [ ] `--spec` and `--epic` together exit 1 with `CONFLICTING_FILTERS`
- [ ] Malformed JSONL lines are skipped with a stderr note; the verb does not abort
- [ ] `ADEV_BUILD_TICKER=1` routes output to stderr with `[cost]` prefix
- [ ] `/adev:build` SKILL.md prose calls the verb after each step's `completed` event and before the next dispatch
- [ ] `/adev:build --auto` mode appends `--quiet` to the ticker invocation
- [ ] When `build.cost_warn_usd` is set and exceeded, a `[cost warn]` line is emitted on stderr once per crossing; absent or invalid setting suppresses the check
- [ ] Integration test: snapshot `.context-index/` before and after `adev cost summary` — diff is empty (read-only contract)
- [ ] `npm test` passes
- [ ] No constitutional violations
