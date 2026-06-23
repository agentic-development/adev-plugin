<!-- partial_schema: plan@1 -->
<!-- DO NOT EDIT statuses inline — see lifecycle log cost-ticker.jsonl -->
# Implementation Plan: Per-Spec Cost Ticker

> **Methodology:** adev
> **Charter:** .context-index/specs/features/session-awareness/charter.md
> **Spec:** .context-index/specs/features/session-awareness/cost-ticker.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-22)
> **Platform:** JavaScript (ESM), Node.js, node:test

**Goal:** Add a read-only `adev cost summary` CLI verb that aggregates per-spec / per-step token + USD totals from `.context-index/.session-tracking.jsonl`, and wire `/adev:build` to invoke it between pipeline steps as a running cost ticker.

**Architecture:** A new pure-ESM library `lib/cost-summary.mjs` exposes `aggregate({ projectRoot, specPath, epicId, since })` which performs a single-pass line-stream read of the session JSONL, filters entries by `spec_ref` (or by the spec's bound Feature work-item ID resolved via `getIssueManager().findBySpecRef()`), groups them by the most recent preceding `lifecycle_step started` event from `lib/lifecycle-state.mjs`, and returns the JSON-shape object defined in spec Behavior 3. Two formatter modules (`formatText`, `formatJson`) shape the output. The CLI verb `cost summary` is added to `cli/index.mjs`'s `VERB_REGISTRY` via a new `lib/cli/cost.mjs` module that handles arg parsing, env-var-driven stderr routing, the optional `build.cost_warn_usd` threshold check, and exits per the spec's error-code table. `skills/build/SKILL.md` is amended to call the verb after each `{review, plan, route, implement, validate}` step's `completed` event, with `--quiet` in `--auto` mode. The implementation introduces zero new external dependencies and never mutates on-disk state — the integration test snapshots `.context-index/` before and after a verb invocation to enforce the read-only contract.

**Review notes addressed:**
- SA-1 (sticky cost-warn tracker): the plan resolves the warning as **idempotent and stateless inside the verb** — every invocation that finds `cost_usd >= threshold` emits the warning line; the verb does not attempt to dedup across invocations. Dedup-per-build moves to `/adev:build` prose (the orchestrator already has per-build state and can suppress repeat warnings via a boolean flag in `build-state.json`). This matches reviewer option (a) and lets the verb stay process-isolated.
- SA-2 (slug derivation for default `--since`): the verb calls `slugFromSpec(specPath)` from `lib/lifecycle-state.mjs` rather than constructing the path itself. That is the canonical resolver used elsewhere in the codebase.
- SA-3 (per-step ticker × 5 = 5 re-reads): acknowledged; not addressed in this plan. The current JSONL is well under 1 MB in practice and the single-pass streaming reader is allocation-bounded by line length. A future plan can add a per-build aggregator cache keyed on file mtime when JSONL size becomes a concern.
- SEC-1 (DoS bound on JSONL line size): handled as part of Task 1 — the line-stream reader rejects lines exceeding **1 MB** as malformed (counted under Behavior 13's `skipped_lines` mechanism). Documented in the aggregator JSDoc.
- CON-1 (event taxonomy wording): the plan and implementation use `{ event: "lifecycle_step", step: "review", status: "started" }` everywhere — matching `lib/lifecycle-state.mjs::reportStep`. The spec wording "of type started" is read as a status filter, not an event type.

---

## File Structure

**Create:**
- `lib/cost-summary.mjs` — Aggregator: `aggregate({ projectRoot, specPath, epicId, since })` returning the JSON-shape object from Behavior 3. Includes the 1 MB per-line cap (SEC-1).
- `lib/cost-formatters.mjs` — `formatText(aggregate, { includeCheckpoints })` and `formatJson(aggregate)` producing the two output formats from Behaviors 2-3.
- `lib/cli/cost.mjs` — CLI verb module exposing `run({ projectRoot, argv, manifest })` and `help()`; handles arg parsing (Behaviors 1, 3, 4, 6, 12), env-var routing (Behavior 7), and the `build.cost_warn_usd` threshold check (Behavior 11).
- `tests/lib/cost-summary.test.mjs` — Unit tests for the aggregator (fixture JSONL → expected JSON object).
- `tests/lib/cost-formatters.test.mjs` — Unit tests for both formatters (snapshot-style assertions on text output, schema validation on JSON output).
- `tests/cli/cost-summary.test.mjs` — CLI tests covering arg parsing, exit codes, error cases, env var routing, and the read-only snapshot test.

**Modify:**
- `cli/index.mjs:1530` — Add `["cost", () => import("../lib/cli/cost.mjs")]` to `VERB_REGISTRY`.
- `skills/build/SKILL.md` — Append ticker invocations to the prose for each of the five pipeline steps (after their `completed` event recording, before the next dispatch). Add `--auto` branch with `--quiet`.

**Reference (read, do not modify):**
- `lib/token-pricing.mjs` — Used to confirm model-ID coverage in `model_breakdown` (Behavior 10).
- `lib/lifecycle-state.mjs` — Reads `currentState()`, `filterEvents()`, `slugFromSpec()` for checkpoint grouping and default `--since` resolution.
- `lib/issues/registry.mjs` — `getIssueManager(manifest).findBySpecRef(path)` and `walkTree(epicId)` for issue-based filtering.
- `lib/manifest.mjs` — `loadManifest(projectRoot)` for resolving `build.cost_warn_usd`.
- `.context-index/samples/general-library-module-graph.md` — Follow this pattern for pure-ESM lib module structure.
- `lib/cli/state.mjs`, `lib/cli/issues.mjs` — Follow these for the CLI verb module shape (`run`, `help`, JSON-output convention).

## Context Packets

### Task 1 Context (Aggregator)
- Spec: `.context-index/specs/features/session-awareness/cost-ticker.spec.md` (Behaviors 1, 3, 6, 10, 13; Postconditions; Error Cases for malformed JSONL and missing file)
- Charter: `.context-index/specs/features/session-awareness/charter.md` (capability: Per-Spec Cost Ticker)
- Source files: `lib/token-pricing.mjs` (full read), `lib/lifecycle-state.mjs` (signatures only — interested in `slugFromSpec`, `filterEvents`, `currentState`), `lib/issues/registry.mjs` (signatures only — interested in `getIssueManager`, `findBySpecRef`, `walkTree`)
- Sample: `.context-index/samples/general-library-module-graph.md` (pure-ESM lib module structure)
- Sibling spec: `.context-index/specs/features/session-awareness/token-cost-logging.spec.md` (source-manifest-listed files — confirms the `usage` field shape on JSONL entries the aggregator consumes)
- Heuristics: 3 entries for module `session-awareness` (see Heuristics section)

### Task 2 Context (Formatters)
- Spec: cost-ticker.spec.md (Behaviors 2, 3, 4, 10; Acceptance Criteria on schema shape and compact-unit format)
- Source files: aggregator output shape from Task 1 (use the exported JSDoc type)

### Task 3 Context (CLI verb)
- Spec: cost-ticker.spec.md (Behaviors 1, 5, 6, 7, 11, 12; full Error Cases table)
- Source files: `lib/cli/state.mjs` and `lib/cli/issues.mjs` (signatures only — CLI verb module shape), `lib/manifest.mjs` (signatures only — `loadManifest`)
- Reference: `cli/index.mjs:1455-1531` (VERB_REGISTRY structure)

### Task 4 Context (CLI registration)
- Source files: `cli/index.mjs:1479-1531` (VERB_REGISTRY entry pattern)

### Task 5 Context (Build integration)
- Spec: cost-ticker.spec.md (Behaviors 8, 9; Acceptance Criteria on `--auto` and ticker placement)
- Source files: `skills/build/SKILL.md` (full read — locate the per-step dispatch loops to find insertion points)

### Task 6 Context (Read-only contract integration test)
- Spec: cost-ticker.spec.md (Postcondition: "No on-disk state is mutated by the verb"; Acceptance Criteria final integration-test bullet)
- Source files: `tests/helpers.mjs` (signatures only — `createTempDir`, `writeFixture`)

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption or cost of adev skills, parse real session JSONL files from ~/.claude/projects/ (message.usage fields: input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens). Dispatch paired A/B subagents and compare their JSONL data for controlled experiments.
- **Anti-pattern:** Estimate tokens using bytes/4 or hardcoded assumptions about thinking budgets and cache hit rates. These overstate savings by 2-2.5x vs real measurements.
- **Evidence:** 1 observations

### Heuristic: Cache reads are 71% of session cost — minimize context accumulation (confidence: medium)
- **Pattern:** When optimizing token cost, focus on reducing what accumulates in conversation context (output echoes, artifact dumps, verbose subagent returns). Every output token persists as a cache read on all subsequent turns, creating multiplicative amplification.
- **Anti-pattern:** Focus on reducing input token counts (SKILL.md sizes, context packets). Input is <1% of cost; cache reads at 0.1x pricing dominate due to volume (98% of all tokens processed).
- **Evidence:** 1 observations

### Heuristic: Summarized skill output produces equivalent artifact quality (confidence: medium)
- **Pattern:** When a skill writes an artifact to disk (plan, review, validation report), instruct it to return only a structured summary to the conversation. The artifact on disk will be equally complete — the summarization instruction affects echo volume, not reasoning.
- **Anti-pattern:** Assume that shorter output means lower quality artifacts. The model reasons the same way regardless of how much it echoes back. A/B eval showed 12/12 rubric parity with 36% cost savings.
- **Evidence:** 1 observations

## Parallelization

- Group A (sequential): Task 1 → Task 2 (Task 2 imports the aggregator output JSDoc type from Task 1)
- Group B (sequential, after Group A): Task 3 → Task 4 → Task 6 (Task 3 wires the verb; Task 4 registers it; Task 6 is an end-to-end integration test that runs the registered verb)
- Group C (independent): Task 5 (build integration — touches only `skills/build/SKILL.md`)

Group C can run in parallel with Group A or B once Task 3 is complete (Task 5 references the verb's argument shape).

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Cost-summary aggregator library | medium | unit | — | 1 create, 1 test |
| 2 | Text + JSON formatters | small | unit | Task 1 | 1 create, 1 test |
| 3 | CLI verb module (`lib/cli/cost.mjs`) | medium | unit | Task 1, Task 2 | 1 create, 1 test |
| 4 | Register `cost` verb in VERB_REGISTRY | small | unit | Task 3 | 0 create, 1 modify |
| 5 | `/adev:build` ticker integration | small | unit | Task 3 | 0 create, 1 modify |
| 6 | Read-only contract integration test | small | unit | Task 3, Task 4 | 0 create, 1 test (extends existing) |

All six tasks resolve to `unit` strategy (test source: fallback — no `test_strategy` in spec frontmatter, no manifest entry matches `lib/cli/cost.mjs` or `lib/cost-summary.mjs` paths). The spec has no `infra_requirements:` field. No Strategy Summary or Test Infrastructure Requirements section is emitted (all-unit case, backward compatible).

---

### Task 1: Cost-summary aggregator library [specialist: none]

**Charter capability:** Per-Spec Cost Ticker
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/cost-summary.mjs`
- Test: `tests/lib/cost-summary.test.mjs`

**Tests:** `tests/lib/cost-summary.test.mjs`

**Context to load:**
- `.context-index/specs/features/session-awareness/cost-ticker.spec.md` (Behaviors 1, 3, 6, 10, 13)
- `.context-index/samples/general-library-module-graph.md` (pure-ESM module pattern)
- `lib/token-pricing.mjs` (PRICE_TABLE shape, model-ID coverage)
- `lib/lifecycle-state.mjs` (signatures: `slugFromSpec`, `filterEvents`, `currentState`)
- `lib/issues/registry.mjs` (signatures: `getIssueManager`, `findBySpecRef`, `walkTree`)

- [ ] **Write failing test**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aggregate } from "../../lib/cost-summary.mjs";

describe("aggregate", () => {
  it("filters by spec_ref and sums usage fields", () => {
    const root = mkdtempSync(join(tmpdir(), "cost-"));
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(join(root, ".context-index", "manifest.yaml"), "project:\n  name: test\n");
    const specPath = "specs/x.spec.md";
    mkdirSync(join(root, "specs"), { recursive: true });
    writeFileSync(join(root, specPath), "# spec");
    const lines = [
      JSON.stringify({ spec_ref: specPath, model: "claude-sonnet-4-6",
        usage: { input_tokens: 100, output_tokens: 50, cache_read_tokens: 1000, cache_creation_tokens: 20, cost_usd: 0.01 },
        timestamp: "2026-05-22T10:00:00Z" }),
      JSON.stringify({ spec_ref: "specs/other.spec.md", model: "claude-sonnet-4-6",
        usage: { input_tokens: 999, output_tokens: 999, cost_usd: 0.99 },
        timestamp: "2026-05-22T10:01:00Z" }),
    ].join("\n") + "\n";
    writeFileSync(join(root, ".context-index", ".session-tracking.jsonl"), lines);

    const result = aggregate({ projectRoot: root, specPath });

    assert.equal(result.totals.input_tokens, 100);
    assert.equal(result.totals.output_tokens, 50);
    assert.equal(result.totals.cache_read_tokens, 1000);
    assert.equal(result.totals.cost_usd, 0.01);
  });

  it("returns null totals when JSONL is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "cost-"));
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(join(root, ".context-index", "manifest.yaml"), "project:\n  name: test\n");
    mkdirSync(join(root, "specs"), { recursive: true });
    writeFileSync(join(root, "specs/x.spec.md"), "# spec");
    const result = aggregate({ projectRoot: root, specPath: "specs/x.spec.md" });
    assert.equal(result.totals, null);
  });

  it("skips malformed lines and counts them", () => {
    const root = mkdtempSync(join(tmpdir(), "cost-"));
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(join(root, ".context-index", "manifest.yaml"), "project:\n  name: test\n");
    mkdirSync(join(root, "specs"), { recursive: true });
    writeFileSync(join(root, "specs/x.spec.md"), "# spec");
    const lines = ["not-json", "{broken", JSON.stringify({ spec_ref: "specs/x.spec.md", usage: { cost_usd: 0.5 } })].join("\n");
    writeFileSync(join(root, ".context-index", ".session-tracking.jsonl"), lines);
    const result = aggregate({ projectRoot: root, specPath: "specs/x.spec.md" });
    assert.equal(result.skipped_lines, 2);
    assert.equal(result.totals.cost_usd, 0.5);
  });

  it("rejects lines exceeding 1 MB as malformed (SEC-1)", () => {
    const root = mkdtempSync(join(tmpdir(), "cost-"));
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(join(root, ".context-index", "manifest.yaml"), "project:\n  name: test\n");
    mkdirSync(join(root, "specs"), { recursive: true });
    writeFileSync(join(root, "specs/x.spec.md"), "# spec");
    const oversized = "x".repeat(1024 * 1024 + 1);
    writeFileSync(join(root, ".context-index", ".session-tracking.jsonl"), oversized + "\n");
    const result = aggregate({ projectRoot: root, specPath: "specs/x.spec.md" });
    assert.equal(result.skipped_lines, 1);
    assert.equal(result.totals, null);
  });
});
```

- [ ] **Verify test fails**

Run: `npm test -- tests/lib/cost-summary.test.mjs`
Expected: FAIL — `Cannot find module '../../lib/cost-summary.mjs'`

- [ ] **Implement**

Create `lib/cost-summary.mjs` exporting:
- `aggregate({ projectRoot, specPath, epicId, since })` — main entry point. Single-pass line-stream read of `<projectRoot>/.context-index/.session-tracking.jsonl`. Uses `readline.createInterface(createReadStream(...))` from `node:readline`. Per-line cap: 1 MB (lines exceeding the cap are counted in `skipped_lines` and dropped). Per-line `JSON.parse` failures are also counted in `skipped_lines`. Returns `{ spec, issue_id, totals, checkpoints, model_breakdown, skipped_lines }` matching Behavior 3.
- Filter logic: when `epicId` is set, resolve work items via `getIssueManager(manifest).walkTree(epicId)` and match against the entry's `issue` field. Otherwise, when `specPath` is set, match against `spec_ref` OR (issue manager available AND entry's `issue` equals `getIssueManager(manifest).findBySpecRef(specPath)`).
- Checkpoint grouping: for each surviving entry, find the most recent preceding `lifecycle_step` event with `status: "started"` and `step ∈ {review, plan, route, implement, validate}` from `<root>/.context-index/lifecycle-state/<slug>.jsonl` (where `<slug> = slugFromSpec(specPath)`). Entries with no preceding step → `step: "ungrouped"`.
- Default `--since` resolution: when `since` is undefined and `specPath` is set, use the timestamp of the most recent `lifecycle_step` event with `step: "review", status: "started"`. If none exists, no `since` filter is applied. Use `slugFromSpec(specPath)` to derive the log path (SA-2 from review).
- Totals shape: `{ input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, cost_usd, wall_seconds }`. `cost_usd` is rounded to 6 decimals via `Math.round(value * 1e6) / 1e6`. `wall_seconds` is the integer difference between max and min `timestamp` across all included entries (0 if fewer than 2 entries).
- `model_breakdown`: sorted by `cost_usd` descending. `share` is rounded to 3 decimals.
- When `totals` would be all-zero (no matching entries), return `totals: null` so the formatter can emit the "(no usage data yet)" branch.
- Issue manager unavailable (no `tasks.backend` in manifest): fall back to `spec_ref` matching only. Do not warn.
- No on-disk writes anywhere in this module.

- [ ] **Verify test passes**

Run: `npm test -- tests/lib/cost-summary.test.mjs`
Expected: PASS — all four cases.

- [ ] **Commit**

Branch (if not already created): `feat/cost-ticker/aggregator`

```bash
git add lib/cost-summary.mjs tests/lib/cost-summary.test.mjs
git commit -m "$(cat <<'EOF'
feat(session-awareness): add cost-summary aggregator library

Implements per-spec / per-step JSONL aggregation with 1 MB per-line cap (SEC-1)
and canonical slug-resolution via slugFromSpec (SA-2). Read-only, single-pass
streaming. Zero new dependencies.

Spec: .context-index/specs/features/session-awareness/cost-ticker.spec.md
Plan-task: 1
EOF
)"
```

---

### Task 2: Text and JSON formatters [specialist: none]

**Charter capability:** Per-Spec Cost Ticker
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `lib/cost-formatters.mjs`
- Test: `tests/lib/cost-formatters.test.mjs`

**Tests:** `tests/lib/cost-formatters.test.mjs`

**Context to load:**
- cost-ticker.spec.md (Behaviors 2, 3, 4, 10)
- `lib/cost-summary.mjs` (the `AggregateResult` JSDoc type — from Task 1)

- [ ] **Write failing test**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatText, formatJson } from "../../lib/cost-formatters.mjs";

describe("formatText", () => {
  it("renders the compact one-line format", () => {
    const agg = {
      spec: "/abs/specs/x.spec.md",
      issue_id: "issue-1",
      totals: {
        input_tokens: 14000, output_tokens: 18000,
        cache_read_tokens: 1170000, cache_creation_tokens: 22000,
        cost_usd: 0.34, wall_seconds: 252,
      },
      checkpoints: [],
      model_breakdown: [{ model: "claude-sonnet-4-6", cost_usd: 0.34, share: 1.0 }],
      skipped_lines: 0,
    };
    const out = formatText(agg, { includeCheckpoints: false });
    assert.match(out, /cost: \$0\.34/);
    assert.match(out, /1\.2M tok/);
    assert.match(out, /cache·read/);
    assert.match(out, /sonnet/);
  });

  it('emits "(no usage data yet)" when totals are null', () => {
    const out = formatText({ totals: null, model_breakdown: [], checkpoints: [], skipped_lines: 0 });
    assert.equal(out, "cost: (no usage data yet)");
  });

  it("appends per-step table when includeCheckpoints", () => {
    const agg = {
      totals: { input_tokens: 100, output_tokens: 50, cache_read_tokens: 0, cache_creation_tokens: 0, cost_usd: 0.01, wall_seconds: 10 },
      checkpoints: [{ step: "review", input_tokens: 50, output_tokens: 25, cache_read_tokens: 0, cache_creation_tokens: 0, cost_usd: 0.005, wall_seconds: 5 }],
      model_breakdown: [{ model: "sonnet", cost_usd: 0.01, share: 1.0 }],
      skipped_lines: 0,
    };
    const out = formatText(agg, { includeCheckpoints: true });
    assert.match(out, /review/);
    assert.match(out, /total/);
  });

  it("suffixes +N when multiple models contribute", () => {
    const agg = {
      totals: { input_tokens: 100, output_tokens: 50, cache_read_tokens: 0, cache_creation_tokens: 0, cost_usd: 0.34, wall_seconds: 10 },
      checkpoints: [], skipped_lines: 0,
      model_breakdown: [
        { model: "claude-sonnet-4-6", cost_usd: 0.28, share: 0.823 },
        { model: "claude-opus-4-7", cost_usd: 0.06, share: 0.177 },
      ],
    };
    const out = formatText(agg, { includeCheckpoints: false });
    assert.match(out, /sonnet\+1/);
  });
});

describe("formatJson", () => {
  it("produces the schema from Behavior 3", () => {
    const agg = {
      spec: "/abs/x.spec.md", issue_id: null,
      totals: { input_tokens: 100, output_tokens: 50, cache_read_tokens: 0, cache_creation_tokens: 0, cost_usd: 0.123456789, wall_seconds: 10 },
      checkpoints: [],
      model_breakdown: [{ model: "sonnet", cost_usd: 0.123456789, share: 1.0 }],
      skipped_lines: 0,
    };
    const out = JSON.parse(formatJson(agg));
    assert.equal(out.spec, "/abs/x.spec.md");
    assert.equal(out.issue_id, null);
    assert.ok(typeof out.totals.cost_usd === "number");
    assert.ok(Array.isArray(out.checkpoints));
    assert.ok(Array.isArray(out.model_breakdown));
  });
});
```

- [ ] **Verify test fails**

Run: `npm test -- tests/lib/cost-formatters.test.mjs`
Expected: FAIL — `Cannot find module '../../lib/cost-formatters.mjs'`

- [ ] **Implement**

Create `lib/cost-formatters.mjs` exporting:
- `formatText(agg, { includeCheckpoints = false } = {})` — produces the one-line summary from Behavior 2 using a compact-unit helper (`compactTok(n)` rendering `1.2M`, `38K`, `512`). When `agg.totals === null`, returns `cost: (no usage data yet)`. When `includeCheckpoints` is true, appends `\n` followed by a fixed-width table with rows for each checkpoint plus a `total` row; entries grouped under `ungrouped` get an `ungrouped` row.
- `formatJson(agg)` — returns `JSON.stringify(shape)` where `shape` matches Behavior 3 exactly. `cost_usd` fields are kept at 6-decimal precision (the aggregator already rounds). `share` fields kept at 3-decimal precision. Always include `checkpoints` and `model_breakdown` arrays (empty arrays for no-data case).
- Internal helpers: `compactTok`, `dominantModelSummary`, `cachePct`. Not exported.

- [ ] **Verify test passes**

Run: `npm test -- tests/lib/cost-formatters.test.mjs`
Expected: PASS — all five cases.

- [ ] **Commit**

```bash
git add lib/cost-formatters.mjs tests/lib/cost-formatters.test.mjs
git commit -m "$(cat <<'EOF'
feat(session-awareness): add cost-summary text and JSON formatters

Implements compact-unit text rendering per Behavior 2 and the JSON schema
from Behavior 3 (including multi-model +N suffix and ungrouped checkpoint row).

Spec: .context-index/specs/features/session-awareness/cost-ticker.spec.md
Plan-task: 2
EOF
)"
```

---

### Task 3: CLI verb module (`lib/cli/cost.mjs`) [specialist: none]

**Charter capability:** Per-Spec Cost Ticker
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2
**Files:**
- Create: `lib/cli/cost.mjs`
- Test: `tests/cli/cost-summary.test.mjs`

**Tests:** `tests/cli/cost-summary.test.mjs`

**Context to load:**
- cost-ticker.spec.md (Behaviors 1, 5, 6, 7, 11, 12; all Error Cases)
- `lib/cli/state.mjs` and `lib/cli/issues.mjs` (signatures only — CLI verb module shape)
- `lib/manifest.mjs` (signatures: `loadManifest`)
- `cli/index.mjs:1455-1531` (VERB_REGISTRY structure)

- [ ] **Write failing test**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = new URL("../../cli/index.mjs", import.meta.url).pathname;

function runCli(args, env = {}) {
  try {
    const out = execFileSync("node", [CLI, "cost", "summary", ...args], {
      env: { ...process.env, ...env },
      encoding: "utf8",
    });
    return { code: 0, stdout: out, stderr: "" };
  } catch (e) {
    return { code: e.status, stdout: e.stdout?.toString() || "", stderr: e.stderr?.toString() || "" };
  }
}

function setupRoot() {
  const root = mkdtempSync(join(tmpdir(), "cost-cli-"));
  mkdirSync(join(root, ".context-index"), { recursive: true });
  writeFileSync(join(root, ".context-index", "manifest.yaml"), "project:\n  name: test\n");
  mkdirSync(join(root, "specs"), { recursive: true });
  writeFileSync(join(root, "specs/x.spec.md"), "# spec");
  return root;
}

describe("adev cost summary", () => {
  it("exits 1 with CONFLICTING_FILTERS when both --spec and --epic are passed", () => {
    const root = setupRoot();
    const r = runCli(["--spec", "specs/x.spec.md", "--epic", "epic-1"], { ADEV_PROJECT_ROOT: root });
    assert.equal(r.code, 1);
    assert.match(r.stderr + r.stdout, /mutually exclusive|CONFLICTING_FILTERS/);
  });

  it("exits 1 with INVALID_FORMAT for unknown format", () => {
    const root = setupRoot();
    const r = runCli(["--spec", "specs/x.spec.md", "--format", "xml"], { ADEV_PROJECT_ROOT: root });
    assert.equal(r.code, 1);
    assert.match(r.stderr + r.stdout, /text.*json|INVALID_FORMAT/);
  });

  it("routes output to stderr with [cost] prefix when ADEV_BUILD_TICKER=1", () => {
    const root = setupRoot();
    const r = runCli(["--spec", "specs/x.spec.md"], { ADEV_PROJECT_ROOT: root, ADEV_BUILD_TICKER: "1" });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /^\[cost\] /);
  });

  it("emits no-data text when JSONL is missing", () => {
    const root = setupRoot();
    const r = runCli(["--spec", "specs/x.spec.md"], { ADEV_PROJECT_ROOT: root });
    assert.equal(r.code, 0);
    assert.match(r.stdout, /no usage data yet/);
  });

  it("--quiet suppresses output and exits 0 even with no data", () => {
    const root = setupRoot();
    const r = runCli(["--spec", "specs/x.spec.md", "--quiet"], { ADEV_PROJECT_ROOT: root });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, "");
  });
});
```

- [ ] **Verify test fails**

Run: `npm test -- tests/cli/cost-summary.test.mjs`
Expected: FAIL — unknown verb `cost`.

- [ ] **Implement**

Create `lib/cli/cost.mjs` exporting:
- `run({ projectRoot, argv, manifest })` — parses `argv` (the spec-and-after slice) for the subcommand `summary` followed by optional flags: `--spec <path>`, `--epic <id>`, `--format <text|json>` (default `text`), `--include-checkpoints`, `--quiet`, `--since <iso8601>`. Unknown flags trip exit 1. Validates `--since` parses as a finite `Date` (`INVALID_SINCE` if not). Enforces mutual exclusion of `--spec`/`--epic` (`CONFLICTING_FILTERS`). Validates spec path exists and stays under `projectRoot` (`INVALID_SPEC_PATH`).
- Calls `aggregate(...)` from `lib/cost-summary.mjs`.
- Resolves manifest's `build.cost_warn_usd` via `loadManifest(projectRoot)`; if a finite positive number and `agg.totals?.cost_usd >= threshold`, emits `[cost warn] spec cost $<usd> exceeds threshold $<N>` to stderr after the summary. If the field is present but non-numeric or negative, emits `[cost warn] manifest build.cost_warn_usd is invalid, ignored` to stderr once and continues.
- Calls `formatText` or `formatJson` and prints to stdout (default) or stderr with `[cost] ` prefix (when `process.env.ADEV_BUILD_TICKER === "1"`). When `--quiet` and `agg.totals` is `null`, prints nothing.
- When `agg.skipped_lines > 0`: text format prints `(note: skipped <N> malformed lines)` to stderr; JSON format already includes the field via the formatter.
- Returns from `run()` on success. Throws on argument errors with `code` property; the outer dispatcher converts to `process.exit(1)`.
- `help()` — prints usage to stdout.
- `LIFECYCLE_STEP` is unset (not bound to a lifecycle gate — verb is read-only and can run any time).

- [ ] **Verify test passes**

Run: `npm test -- tests/cli/cost-summary.test.mjs`
Expected: PASS — all five cases (after Task 4 registers the verb).

> **Note:** The Task 3 test file references `cost` as a registered verb. The test will fail until Task 4 wires the verb into VERB_REGISTRY. Implementers should run Task 3's test only after Task 4 is complete, or stub the test temporarily by invoking the module directly.

- [ ] **Commit**

```bash
git add lib/cli/cost.mjs tests/cli/cost-summary.test.mjs
git commit -m "$(cat <<'EOF'
feat(session-awareness): add cost summary CLI verb module

Wraps the aggregator + formatters with arg parsing (Behaviors 1, 5, 6, 7, 12),
ADEV_BUILD_TICKER stderr routing (Behavior 7), and the build.cost_warn_usd
threshold check (Behavior 11). Sticky-warn dedup is left to /adev:build prose
per SA-1 resolution.

Spec: .context-index/specs/features/session-awareness/cost-ticker.spec.md
Plan-task: 3
EOF
)"
```

---

### Task 4: Register `cost` verb in VERB_REGISTRY [specialist: none]

**Charter capability:** Per-Spec Cost Ticker
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Modify: `cli/index.mjs:1530` (insert a new line in VERB_REGISTRY)

**Tests:** `tests/cli/cost-summary.test.mjs` (Task 3's test file is the regression test — it invokes `node cli/index.mjs cost summary ...` and depends on the verb being registered)

**Context to load:**
- `cli/index.mjs:1479-1531` (the VERB_REGISTRY Map)

- [ ] **Write failing test**

The failing test is already authored in Task 3. After this task, the test will go from "unknown verb cost" to passing the actual subcommand assertions.

- [ ] **Verify test fails**

Run: `npm test -- tests/cli/cost-summary.test.mjs`
Expected: FAIL with `unknown verb: cost`.

- [ ] **Implement**

Insert one line into `cli/index.mjs`'s `VERB_REGISTRY` Map (between `["retro", ...]` and the closing `]);`):

```javascript
  ["cost",            () => import("../lib/cli/cost.mjs")],
```

- [ ] **Verify test passes**

Run: `npm test -- tests/cli/cost-summary.test.mjs`
Expected: PASS — all five cases from Task 3 now pass.

- [ ] **Commit**

```bash
git add cli/index.mjs
git commit -m "$(cat <<'EOF'
feat(cli): register adev cost verb in VERB_REGISTRY

Wires lib/cli/cost.mjs into the CLI dispatcher.

Spec: .context-index/specs/features/session-awareness/cost-ticker.spec.md
Plan-task: 4
EOF
)"
```

---

### Task 5: `/adev:build` ticker integration [specialist: none]

**Charter capability:** Per-Spec Cost Ticker
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Modify: `skills/build/SKILL.md` (append ticker invocation prose after each step's `completed` event)

**Tests:** `tests/skills/build/cost-ticker-prose.test.mjs` (new test — assert the SKILL.md prose contains the expected ticker invocation lines and `--auto/--quiet` branch; this is a regex-based assertion since the skill is markdown)

**Context to load:**
- cost-ticker.spec.md (Behaviors 8, 9; Acceptance Criteria on `--auto` and ticker placement)
- `skills/build/SKILL.md` (full read — locate the dispatch loop where each step's `completed` event is recorded)

- [ ] **Write failing test**

Create `tests/skills/build/cost-ticker-prose.test.mjs`:

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SKILL = readFileSync(join(root, "skills/build/SKILL.md"), "utf8");

describe("build SKILL.md cost ticker prose", () => {
  it("references adev cost summary --include-checkpoints with ADEV_BUILD_TICKER=1", () => {
    assert.match(SKILL, /adev cost summary --spec.*--include-checkpoints/);
    assert.match(SKILL, /ADEV_BUILD_TICKER=1/);
  });

  it("documents --quiet branch for --auto mode", () => {
    assert.match(SKILL, /--auto/);
    assert.match(SKILL, /--quiet/);
  });

  it("treats ticker exit as non-blocking", () => {
    assert.match(SKILL, /non[- ]blocking|informational/);
  });
});
```

- [ ] **Verify test fails**

Run: `npm test -- tests/skills/build/cost-ticker-prose.test.mjs`
Expected: FAIL — the SKILL.md does not yet mention `adev cost summary`.

- [ ] **Implement**

Locate the Dispatch Loop section in `skills/build/SKILL.md` (around line 327 — after `recordStepResult()` call, before the "re-invoke or stop" decision). Add a new subsection titled "Cost ticker between steps":

```markdown
### Cost ticker between steps

After each step in `{review, plan, route, implement, validate}` records its `completed` event and before dispatching the next step, invoke the cost ticker:

```bash
# Interactive mode (default — ticker prints to stderr for visibility):
ADEV_BUILD_TICKER=1 adev cost summary --spec <spec-path> --include-checkpoints

# --auto mode (suppress informational output; cost-warn lines still surface on stderr):
ADEV_BUILD_TICKER=1 adev cost summary --spec <spec-path> --include-checkpoints --quiet
```

The ticker is informational. A non-zero exit from the verb does NOT block the build — record the issue in build state and continue to the next step.

**Per-build cost-warn dedup (SA-1 resolution):** The verb itself does not dedup `[cost warn]` lines across invocations. The orchestrator tracks a `cost_warn_emitted` boolean per spec in `build-state.json`. Once set, subsequent ticker invocations suppress the `[cost warn]` line (pipe stderr through a filter that drops `[cost warn]` lines when the flag is true). The flag is reset at the start of each new build.
```

- [ ] **Verify test passes**

Run: `npm test -- tests/skills/build/cost-ticker-prose.test.mjs`
Expected: PASS — all three assertions match.

- [ ] **Commit**

```bash
git add skills/build/SKILL.md tests/skills/build/cost-ticker-prose.test.mjs
git commit -m "$(cat <<'EOF'
feat(build): integrate adev cost summary ticker between pipeline steps

Adds prose-level invocations after each of {review, plan, route, implement,
validate} completed events. Documents the per-build cost-warn dedup contract
that resolves SA-1 from the review.

Spec: .context-index/specs/features/session-awareness/cost-ticker.spec.md
Plan-task: 5
EOF
)"
```

---

### Task 6: Read-only contract integration test [specialist: none]

**Charter capability:** Per-Spec Cost Ticker
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3, Task 4
**Files:**
- Test: extend `tests/cli/cost-summary.test.mjs` with a snapshot-diff integration test

**Tests:** the file already exists from Task 3; this task adds one additional `it(...)` block.

**Context to load:**
- cost-ticker.spec.md (Postcondition: "No on-disk state is mutated by the verb"; final Acceptance Criterion: "Integration test: snapshot `.context-index/` before and after `adev cost summary` — diff is empty")

- [ ] **Write failing test**

Append to `tests/cli/cost-summary.test.mjs`:

```javascript
import { readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";

function snapshotDir(dir) {
  const entries = [];
  function walk(d, rel = "") {
    for (const name of readdirSync(d).sort()) {
      const abs = join(d, name);
      const r = rel ? rel + "/" + name : name;
      const st = statSync(abs);
      if (st.isDirectory()) walk(abs, r);
      else entries.push(`${r}|${st.size}|${createHash("sha256").update(require("node:fs").readFileSync(abs)).digest("hex")}`);
    }
  }
  walk(dir);
  return entries.join("\n");
}

describe("read-only contract", () => {
  it("does not mutate .context-index/ on any invocation path", () => {
    const root = setupRoot();
    // Populate with a fixture JSONL so the verb has work to do.
    writeFileSync(
      join(root, ".context-index", ".session-tracking.jsonl"),
      JSON.stringify({ spec_ref: "specs/x.spec.md", usage: { input_tokens: 10, output_tokens: 5, cache_read_tokens: 0, cache_creation_tokens: 0, cost_usd: 0.001 }, timestamp: "2026-05-22T10:00:00Z" }) + "\n",
    );
    const before = snapshotDir(join(root, ".context-index"));
    runCli(["--spec", "specs/x.spec.md", "--include-checkpoints", "--format", "json"], { ADEV_PROJECT_ROOT: root });
    const after = snapshotDir(join(root, ".context-index"));
    assert.equal(before, after, ".context-index/ was mutated by a read-only verb invocation");
  });
});
```

- [ ] **Verify test fails**

If the implementation incidentally writes to `.context-index/` (e.g., logging, lifecycle event emission), the test will fail. With the current Task 1-4 implementation it should pass — the test is regression protection.

Run: `npm test -- tests/cli/cost-summary.test.mjs`
Expected: PASS (if Tasks 1-4 follow the read-only contract) — otherwise the failure pinpoints the offending write path.

- [ ] **Implement**

No production-code change is expected. If the test fails, the implementer must locate the offending write in `lib/cost-summary.mjs`, `lib/cost-formatters.mjs`, or `lib/cli/cost.mjs` and remove it (e.g., do not emit lifecycle events, do not cache results to disk, do not auto-create `.token-cursor.json`).

- [ ] **Verify test passes**

Run: `npm test -- tests/cli/cost-summary.test.mjs`
Expected: PASS.

- [ ] **Commit**

```bash
git add tests/cli/cost-summary.test.mjs
git commit -m "$(cat <<'EOF'
test(session-awareness): assert adev cost summary is read-only

Adds snapshot-diff integration test verifying .context-index/ is byte-identical
before and after a verb invocation, per spec Postcondition.

Spec: .context-index/specs/features/session-awareness/cost-ticker.spec.md
Plan-task: 6
EOF
)"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied:
  - `adev cost summary --spec <fixture>` matches hand-computed totals (Task 1 test)
  - `--format json` validates against Behavior 3 schema (Task 2 test)
  - `--include-checkpoints` text output contains per-checkpoint + `total` row (Task 2 test)
  - Missing JSONL produces "no usage data yet" / null totals (Tasks 1 + 3 tests)
  - `--quiet` with no data → zero output, exit 0 (Task 3 test)
  - `--since` and default-resolution behavior (Task 1 test extended in implementation)
  - `--spec` + `--epic` → exit 1 / CONFLICTING_FILTERS (Task 3 test)
  - Malformed JSONL lines skipped with stderr note (Task 1 test)
  - `ADEV_BUILD_TICKER=1` → stderr with `[cost]` prefix (Task 3 test)
  - `/adev:build` SKILL.md prose calls verb after each step (Task 5 test)
  - `--auto` → `--quiet` (Task 5 test)
  - `build.cost_warn_usd` threshold emits one stderr line per crossing (covered by implementer-extended Task 3 test)
  - Integration test: `.context-index/` snapshot diff is empty (Task 6 test)
- No constitutional violations (no new dependencies, pure ESM, no executable logic in SKILL.md, no per-file boundary errors)
