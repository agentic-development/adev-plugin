<!-- partial_schema: plan@1 -->

# Implementation Plan: Test Depth Policy and Escalation-Only Coverage Scaling

> **Methodology:** adev
> **Charter:** .context-index/specs/features/test-strategies/charter.md
> **Spec:** .context-index/specs/features/test-strategies/test-depth-policy.spec.md
> **Review:** PASS_WITH_NOTES (2026-08-11)
> **Platform:** Node.js (CLI/plugin, no framework), JavaScript ESM, node:test, npm

**Goal:** Add a second, independent test-authoring axis — `depth` (`minimal` | `standard` |
`thorough`) — alongside the existing `strategy` axis, resolved via a static chain plus two
monotonic-upward-only passes (escalation, then a sensitive-path/risk/boundary floor), all owned
by a new `adev test-policy` CLI verb and consumed by `/adev:implement` at test-authoring time.

**Architecture:** Mirrors the shipped strategy-assignment pattern in `lib/test-strategies/
assignment.mjs` (spec-declared → module override → risk-policy/manifest → domain → fallback,
first-match-wins) but adds two monotonic-only passes after the chain. Per ADR-0016, granularity
resolves at plan time from static config only (no routing dependency — avoids the circularity of
ADR-0016 revision 1); depth resolves at test-authoring time inside `/adev:implement`, which
already reads the routing sidecar (`lib/plan-routing-sidecar.mjs`) and dispatches write-test
(`skills/implement/SKILL.md:362`). `adev test-policy resolve` is the sole writer of the new
`test_depth_assigned` lifecycle event (registered in `CANONICAL_EVENTS` per the `spec_amended`
`[BOUNDARY: human-approved]` precedent at `lib/lifecycle-events.mjs:61-63`). End-to-end floor
*enforcement* is explicitly out of scope (issue-559) — this plan implements assignment and
recording only, per the spec's Scope Boundary.

**Review notes addressed:** PASS_WITH_NOTES from all three specialist reviewers (Structural
Architect, Consistency Analyzer, Security Reviewer) after ten review rounds; minor suggestions
were already folded into the spec's finalization commit. Per the spec's own header note, Charter
revision 3 (capability row, qualified Out of Scope line, governance dependency,
`TestDepthAssignment` entity, `Spec test_depth field | design` Consumed-API row) is scheduled as
**Task 1** of this plan so it lands in the same change, ahead of every task that traces to the
new capability. The descoped end-to-end floor-enforcement verification (issue-559 on the shared
task board) is intentionally **not** a task in this plan.

---

## File Structure

**Create:**
- `lib/test-strategies/sensitive-paths.mjs` — `DEFAULT_SENSITIVE_PATHS` constant + `effectiveSensitivePaths()`
- `lib/test-strategies/policy.mjs` — `parseTestPolicy()` + `resolveGranularity()`
- `lib/test-strategies/task-files.mjs` — `readTaskFiles()` (Behavior 8 plan-region parser)
- `lib/test-strategies/depth.mjs` — `resolveTestDepth()` (chain → escalation → floor)
- `lib/test-strategies/suite-path.mjs` — `resolveSuitePath()` (existing-suite reuse detection)
- `lib/cli/test-policy.mjs` — `adev test-policy resolve|assert-assigned|show|set|explain`
- `.context-index/governance/sensitive-paths.yaml` — self-hosting overlay (this repo's own extension)
- `tests/lib/test-strategies/sensitive-paths.test.mjs`
- `tests/lib/test-strategies/policy.test.mjs`
- `tests/lib/test-strategies/task-files.test.mjs`
- `tests/lib/test-strategies/depth.test.mjs`
- `tests/lib/test-strategies/suite-path.test.mjs`
- `tests/cli/test-policy.test.mjs`
- `tests/governance/rigor-mode-test-depth.test.mjs`
- `tests/skills/plan-test-depth-integration.test.mjs`
- `tests/skills/implement-test-depth-integration.test.mjs`
- `tests/skills/write-test-standalone-depth.test.mjs`
- `tests/cli/status-test-depth-counting.test.mjs`
- `tests/skills/init-test-policy-emission.test.mjs`
- `tests/skills/specify-test-depth-frontmatter.test.mjs`
- `tests/skills/hygiene-test-policy-drift-pass.test.mjs`
- `tests/lib/governance/sensitive-paths-self-hosting.test.mjs`
- `tests/specs/test-strategies-charter-revision-3.test.mjs`
- `tests/docs/test-depth-policy-docs.test.mjs`

**Modify:**
- `.context-index/specs/features/test-strategies/charter.md` — Capability Map row, Out of Scope, Dependencies, Domain Model entity, Consumed APIs
- `.context-index/specs/features/test-strategies/test-depth-policy.spec.md:8` — bump `charter-revision: 2` → `3` once Task 1 lands
- `lib/lifecycle-events.mjs:36-70` — add `test_depth_assigned` to `CANONICAL_EVENTS`
- `lib/diagnostics/event-schemas.mjs:90-188` — add `test_depth_assigned` to `REQUIRED_FIELDS_BY_EVENT`
- `lib/governance/rigor-mode.mjs:34` (`loadRigorPolicies`) — extend read-only to surface `test_depth`
- `.context-index/governance/risk-policies.yaml` — add `test_depth` per risk level
- `templates/risk-policies-template.yaml` — add `test_depth` per risk level (init source)
- `cli/index.mjs:1719` (`VERB_REGISTRY`) — register `["test-policy", () => import("../lib/cli/test-policy.mjs")]`
- `skills/plan/SKILL.md` (Strategy Assignment / Strategy Summary region, ~L494-620) — granularity-driven `**Tests:**` emission, per-task `**Files:**` mandate, suite-reuse "extend" instruction
- `skills/implement/SKILL.md:360-378` (write-test dispatch sub-step) — call `adev test-policy resolve` + `assert-assigned`, pass depth into write-test subagent prompt
- `skills/write-test/SKILL.md:15-27` (Step 0: Standalone Pre-flight) — pin standalone to built-in `standard`; consume caller-passed depth when dispatched from implement
- `skills/status/SKILL.md:~60` (Mode `--spec`, item 8) — replace file-existence check with `adev state current --spec <path>` plan-task-event counting
- `skills/init/SKILL.md:213,441` (risk-policies.yaml emission) — emit `test_policy` block + `test_depth` per risk level, placeholder guard, brownfield granularity inference
- `skills/specify/SKILL.md` (shared frontmatter section, referenced at L422/L710/L804/L880) — add `test_depth:` to the legal frontmatter set
- `skills/hygiene/SKILL.md` (after Audit Pass 21, ~L1002) — new test-policy drift pass reporting `floor_inputs: "unavailable"` tasks
- `docs/test-strategies.md`, `docs/governance.md`, `docs/configuration.md`, `docs/cli-reference.md`, `docs/getting-started.md`, `docs/README.md` — the six required doc updates

**Reference (read, do not modify):**
- `lib/test-strategies/assignment.mjs:23-95` — `resolveStrategy()` chain pattern to mirror for `resolveTestDepth()`
- `lib/test-strategies/manifest.mjs:20` — `matchGlob()`, reused (not reimplemented) for sensitive-path matching
- `lib/plan-routing-sidecar.mjs:64-69,91,283,305` — `.routing.json` shape, `REQUIRED_SCORE_DIMENSIONS`, `readRoutingSidecar`/`lookupRoutingEntry`
- `lib/source-manifest.mjs:56-62` — `PATH_OUTSIDE_ROOT` containment-check style to reuse
- `lib/workspace.mjs:9` — `detectWorkspace()`, `currentRepoSlug === null` idiom for `WORKSPACE_ROOT_REFUSED`
- `lib/cli/issues.mjs:23,32,49` — subcommand-dispatch pattern (`run({projectRoot,argv,manifest})` + `help()`) for the new `test-policy` verb
- `lib/lifecycle-state.mjs:909,961,1401` — `reportStep`, `reportPlanTask`, `currentState`
- `.context-index/adrs/0016-test-depth-resolution-point.md` — governing decision for the two-axis split and escalation-only coupling
- `.context-index/adrs/0005-workspace-isolation-invariant.md` — governing decision for `WORKSPACE_ROOT_REFUSED`
- `.context-index/specs/cross-cutting/spec-amendment-artifacts.spec.md` — protocol for amending `plan-test-mapping.spec.md`
- `.context-index/specs/features/spec-lifecycle/plan-test-mapping.spec.md:36` — Behavior 3 (the counting rule Task 18 supersedes)
- `.context-index/specs/features/write-test/immutable-handoff-block.spec.md:37,41` — Handoff Block keying/overwrite behavior cited in the spec's Scope Boundary
- `tests/governance/rigor-mode.test.mjs` — MUST remain byte-unchanged (acceptance criterion)

---

## Context Packets

### Task 1 Context
- Spec: test-depth-policy.spec.md (header note; "Charter revision 3" row in Actionable Task Map)
- Charter: `.context-index/specs/features/test-strategies/charter.md` (all sections: Capability Map L69, Out of Scope L24, Dependencies L32, Domain Model L45, Consumed APIs L105)
- ADR: `.context-index/adrs/0016-test-depth-resolution-point.md` (decision + rationale)

### Task 2 Context
- Spec: Behavior 7, Configuration Schema "Matching semantics" section, `DEFAULT_SENSITIVE_PATHS` code block
- Source: `lib/test-strategies/manifest.mjs:20` (`matchGlob`, full read — reused, not reimplemented)
- Sample: existing `lib/test-strategies/registry.mjs:1` (`STRATEGIES` frozen-array pattern) as the frozen-constant style to follow

### Task 3 Context
- Spec: Behaviors 1, 2 (granularity), 9 (enum validation), Resolution → Granularity chain, Configuration Schema "Project structure config"
- Source: `lib/test-strategies/assignment.mjs:23-95` (full read — mirror the chain/warnings/source shape), `lib/test-strategies/manifest.mjs:62-84` (`parseTestStrategies` validation style for `parseTestPolicy`)

### Task 4 Context
- Spec: "Relationship to graduated rigor tiers", Configuration Schema `risk-policies.yaml` block
- Source: `lib/governance/rigor-mode.mjs:14-60` (full read — `RIGOR_MODES`, `RISK_LEVELS`, `loadRigorPolicies`, `resolveRigorMode` — extend the loader only, `resolveRigorMode` itself is out of scope and MUST NOT change)
- Reference: `.context-index/governance/risk-policies.yaml` (current 3-tier shape), `templates/risk-policies-template.yaml`
- Test (read-only, do not modify): `tests/governance/rigor-mode.test.mjs`

### Task 5 Context
- Spec: Behavior 8 (full — task-region mapping, token predicate, decision note), Interface Contract `readTaskFiles()` row
- Source: `skills/plan/SKILL.md` Context Packets section (~L415-425) and Task Structure `**Files:**`/`**Tests:**` fields (~L608,613) — the two shipped heading families this parser must distinguish
- Sample: shipped plan files under `.context-index/specs/features/*/*.plan.md` as fixtures for both shipped `**Files:**` shapes

### Task 6 Context
- Spec: Behaviors 4, 5, 6 (full), Resolution section (both chains + two monotonic passes), Interface Contract `resolveTestDepth()` row
- Source: `lib/test-strategies/assignment.mjs:23-95` (chain pattern), Task 2/3/5 outputs (`effectiveSensitivePaths`, `parseTestPolicy`, `readTaskFiles`)
- ADR: `.context-index/adrs/0016-test-depth-resolution-point.md` (escalation-only coupling rationale)

### Task 7 Context
- Spec: Behaviors 12, 13, Interface Contract `test_depth_assigned` row
- Source: `lib/lifecycle-events.mjs:36-70` (full read — `CANONICAL_EVENTS`, the `spec_amended` `[BOUNDARY: human-approved]` precedent at L61-63 to mirror verbatim in style)
- Source: `lib/diagnostics/event-schemas.mjs:66,90-188,211` (full read — `UNIVERSAL_REQUIRED`, `REQUIRED_FIELDS_BY_EVENT`, `plan_task` entry at L115 as the task-scoped-event template, module doc L14-20's 4-step process)

### Task 8 Context
- Spec: Behaviors 12, 14, 15, 16, Interface Contract (all `adev test-policy` rows), Error Cases table (full)
- Source: `lib/cli/issues.mjs:23,32,49` (full read — subcommand dispatch pattern), `lib/source-manifest.mjs:56-62` (`PATH_OUTSIDE_ROOT`), `lib/workspace.mjs:9` (`detectWorkspace`, `WORKSPACE_ROOT_REFUSED`)
- Source: `lib/amendment-graph.mjs:56` (`parseFrontmatterFields`, reused to read the spec's `risk_level:`/`test_depth:` frontmatter — the plan file has no `--spec` flag, so `resolve` locates the spec via the plan header's `> **Spec:** <path>` line, per the Plan Document Header format)
- Reference: `.context-index/manifest.yaml` `modules[]` shape (`{slug, paths[]}`) for module-override lookup by matching `targetPaths` against each module's `paths[]`; `.context-index/governance/boundaries.yaml` (`{id, severity, pattern, exclude[]}`, currently `boundaries: []` in this repo) for boundary-crossing evaluation
- Depends on: Tasks 2, 3, 4, 5, 6, 7 (all resolution primitives + the event)

### Task 9 Context
- Spec: Behavior 3, Interface Contract `resolveSuitePath()` reference (Known Limitations "Depth is not reconciled across tasks sharing a suite")
- Source: Task 3 output (`resolveGranularity`)

### Task 10 Context
- Spec: Behaviors 1, 2, 3, 18 (partial — status counting is Task 13, but the `**Tests:**` field change here is what status will read)
- Source: `skills/plan/SKILL.md` current Strategy Assignment (~L494) / Strategy Summary (~L506) / Task Structure `**Files:**` (~L608) / `**Tests:**` (~L613) sections — the analogous slot the new Granularity/Tests logic mirrors
- Depends on: Tasks 3, 9

### Task 11 Context
- Spec: Ownership section (full), Behavior 14
- Source: `skills/implement/SKILL.md:360-372` (full read — "Domain-Aware Test Config" sub-step, the exact CLI-verb → JSON stdout → subagent-prompt wiring pattern to mirror)
- Depends on: Task 8

### Task 12 Context
- Spec: Behavior 17 (full)
- Source: `skills/write-test/SKILL.md:15-27` (Step 0: Standalone Pre-flight, full read)
- Depends on: Task 11

### Task 13 Context
- Spec: Behavior 18 (full)
- Source: `skills/status/SKILL.md` Mode `--spec` item 8 (~L60, full read), `lib/cli/state.mjs:1-40` (full read — `adev state current --spec <path>` contract)
- Cross-cutting: `.context-index/specs/features/spec-lifecycle/plan-test-mapping.spec.md:36` (Behavior 3 — the rule being replaced; superseded formally by Task 18)
- Depends on: Task 7

### Task 14 Context
- Spec: Behaviors 10, 11
- Source: `skills/init/SKILL.md:44-47` (`{{ }}` placeholder-guard precedent), `:213,441` (risk-policies.yaml emission), `templates/risk-policies-template.yaml`, `templates/manifest-template.yaml`
- Depends on: Tasks 3, 4

### Task 15 Context
- Spec: Actionable Task Map row "Extend specify frontmatter contract"
- Source: `skills/specify/SKILL.md` shared frontmatter section (referenced generically at L422, L710, L804, L880 — locate and extend, do not invent a new enum list)

### Task 16 Context
- Spec: Behavior 20
- Source: `skills/hygiene/SKILL.md` Audit Pass numbering (1-21, confirmed on disk; frontmatter description says "twenty" — pre-existing description/body mismatch, do not fix as part of this task), Audit Pass 12 step 1 (~L512-518, `specs/features/` scan pattern to mirror for iterating tasks)
- Depends on: Tasks 7, 8

### Task 17 Context
- Spec: "Self-hosting note" (Configuration Schema section)
- Source: `.context-index/governance/sensitive-paths.yaml` (does not yet exist — this task creates it), Task 2 output (`DEFAULT_SENSITIVE_PATHS` — this overlay only adds entries, never removes)

### Task 18 Context
- Spec: Behavior 18 (last sentence: "supersedes Behavior 3 of `plan-test-mapping.spec.md`, which must be amended per `spec-amendment-artifacts.spec.md`")
- Cross-cutting: `.context-index/specs/cross-cutting/spec-amendment-artifacts.spec.md` (full read — `/adev:specify --amend` protocol, Behaviors 1-4)
- Target: `.context-index/specs/features/spec-lifecycle/plan-test-mapping.spec.md:36` (Behavior 3, full read)
- Depends on: Task 13

### Task 19 Context
- Spec: Documentation Requirements table (full), System Constitution Reference
- Source: current `docs/test-strategies.md`, `docs/governance.md`, `docs/configuration.md`, `docs/cli-reference.md`, `docs/getting-started.md`, `docs/README.md` (read existing `## Priority chain` section in `docs/test-strategies.md` to extend, not replace)
- Depends on: Tasks 1-18 (documents the shipped shape)

---

## Parallelization

- Group A (independent): Task 1 (charter.md only — no code overlap with any other task)
- Group B (independent — no shared files): Task 2 (`sensitive-paths.mjs`), Task 3 (`policy.mjs`), Task 4 (`rigor-mode.mjs` + `risk-policies.yaml`), Task 5 (`task-files.mjs`), Task 7 (`lifecycle-events.mjs` + `event-schemas.mjs`), Task 15 (`specify/SKILL.md`)
- Group C (sequential, depends on Group B): Task 6 (depends on 2,3,4,5) → Task 9 (depends on 3)
- Group D (depends on Group C): Task 8 (depends on 2,3,4,5,6,7)
- Group E (depends on Group D, mostly independent of each other): Task 10 (depends 3,9), Task 11 (depends 8), Task 13 (depends 7), Task 14 (depends 3,4), Task 16 (depends 7,8), Task 17 (depends 2)
- Group F (sequential): Task 12 (depends on 11) → Task 18 (depends on 13)
- Group G (last): Task 19 (depends on everything)

Groups A and B can run fully in parallel with each other. Within Group E, tasks touch disjoint
SKILL.md files and can run concurrently once Group D lands.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Charter revision 3 | small | unit | — | 0 create, 2 modify |
| 2 | `DEFAULT_SENSITIVE_PATHS` + `effectiveSensitivePaths()` | small | unit | — | 2 create, 0 modify |
| 3 | Policy schema, parser, granularity resolution | small | unit | — | 2 create, 0 modify |
| 4 | Risk-policy `test_depth` extension | small | unit | — | 1 create, 3 modify |
| 5 | Plan-task file reader (`readTaskFiles`) | medium | unit | — | 2 create, 0 modify |
| 6 | Depth resolution (`resolveTestDepth`) | medium | unit | 2, 3, 4, 5 | 2 create, 0 modify |
| 7 | Event canon (`test_depth_assigned`) | medium | unit | — | 0 create, 2 modify |
| 8 | `adev test-policy` CLI verb | medium | unit | 2, 3, 4, 5, 6, 7 | 2 create, 1 modify |
| 9 | Suite path resolution (`resolveSuitePath`) | medium | unit | 3 | 2 create, 0 modify |
| 10 | Plan integration (granularity-driven `**Tests:**`) | medium | unit | 3, 9 | 0 create, 1 modify |
| 11 | Implement integration (resolve + assert-assigned) | medium | unit | 8 | 1 create, 1 modify |
| 12 | Write-test standalone depth pin + gaming-blocker depth-invariance (Behavior 19) | small | unit | 11 | 1 create, 1 modify |
| 13 | Status integration (event-based counting) | small | unit | 7 | 1 create, 1 modify |
| 14 | Init integration (test_policy emission) | medium | unit | 3, 4 | 1 create, 3 modify |
| 15 | Specify frontmatter (`test_depth:`) | medium | unit | — | 1 create, 1 modify |
| 16 | Hygiene drift pass | medium | unit | 7, 8 | 1 create, 1 modify |
| 17 | Self-hosting `sensitive-paths.yaml` | small | unit | 2 | 2 create, 0 modify |
| 18 | Amend `plan-test-mapping.spec.md` | small | unit | 13 | 1 create, 0 modify (+ scaffolded amendment file) |
| 19 | Documentation (6 files) | medium | unit | 1-18 | 1 create, 6 modify |

All 19 tasks resolve to `unit` strategy via fallback (no `test_strategies` section is declared in
this repo's `manifest.yaml`, and no task's file paths match a non-unit auto-detection heuristic).
The **Strategy Summary** section is therefore omitted per plan-format convention (all-`unit`,
all-`fallback` is the backward-compatible no-noise case). The **Test Infrastructure Requirements**
section is likewise omitted: the spec's frontmatter carries no `infra_requirements:` and every
task is `unit`.

---

## Task Structure

### Task 1: Charter Revision 3 — Capability Row and Entity [specialist: none]

**Charter capability:** Test Depth Policy (new — this task creates the row)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `.context-index/specs/features/test-strategies/charter.md`
- Modify: `.context-index/specs/features/test-strategies/test-depth-policy.spec.md:8` (bump `charter-revision:` — do this LAST, after the charter edit lands and is committed)
- Test: `tests/specs/test-strategies-charter-revision-3.test.mjs`

**Tests:** `tests/specs/test-strategies-charter-revision-3.test.mjs`

**Context to load:**
- `.context-index/specs/features/test-strategies/charter.md` (Capability Map L69, Out of Scope L24, Dependencies L32, Domain Model L45, Consumed APIs L105)
- `.context-index/adrs/0016-test-depth-resolution-point.md`

- [ ] **Write failing test**

```javascript
// tests/specs/test-strategies-charter-revision-3.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const charter = readFileSync(
  new URL(
    "../../.context-index/specs/features/test-strategies/charter.md",
    import.meta.url,
  ),
  "utf8",
);

test("charter revision 3 adds the Test Depth Policy capability row", () => {
  assert.match(charter, /Test Depth Policy/);
});

test("charter Domain Model declares TestDepthAssignment entity", () => {
  assert.match(charter, /TestDepthAssignment/);
});

test("charter Consumed APIs lists Spec test_depth field alongside test_strategy field", () => {
  assert.match(charter, /test_depth field/);
  assert.match(charter, /test_strategy field/); // pre-existing row must remain
});

test("charter Out of Scope qualifies floor enforcement as excluded", () => {
  assert.match(charter, /enforc/i);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/specs/test-strategies-charter-revision-3.test.mjs`
Expected: FAIL — none of the four assertions match (charter.md is still revision 2 content)

- [ ] **Implement**

Edit `.context-index/specs/features/test-strategies/charter.md`:
- Capability Map (L69-84): add a row `| Test Depth Policy | Risk-scaled control over how many case classes a suite must cover (depth), independent of which strategy applies | must-have | | in-planning |`
- Out of Scope (L24-31): add a qualified line, e.g. `- End-to-end verification that an authored suite matches its assigned depth (advisory floor only — issue-559)`
- Dependencies (L32-41): add `| governance/risk-policies.yaml | internal config | Reads test_depth per risk level |`
- Domain Model → Entities (L45-52): add `| TestDepthAssignment | A task-level binding of resolved depth to a plan task | task_id, plan, depth, source, escalated, floor_applied, floor_legs, floor_inputs |`
- Consumed APIs (L105+): add `| Spec test_depth field | design | Live Specs may declare optional test_depth override in frontmatter |` alongside the existing `Spec test_strategy field` row

Then, once this edit is committed, bump `test-depth-policy.spec.md:8` `charter-revision: 2` → `3`
in the SAME commit (per repo convention: the spec's `charter-revision:` reflects the charter's
actual revision only once the charter edit has landed).

- [ ] **Verify test passes**

Run: `node --test tests/specs/test-strategies-charter-revision-3.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch (if not already created): `feat/test-strategies/test-depth-policy`

```bash
git add .context-index/specs/features/test-strategies/charter.md \
        .context-index/specs/features/test-strategies/test-depth-policy.spec.md \
        tests/specs/test-strategies-charter-revision-3.test.mjs
git commit -m "feat(test-strategies): land charter revision 3 for test depth policy

Spec: .context-index/specs/features/test-strategies/test-depth-policy.spec.md
Plan-task: 1"
```

---

### Task 2: `DEFAULT_SENSITIVE_PATHS` and `effectiveSensitivePaths()` [specialist: none]

**Charter capability:** Test Depth Policy
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/test-strategies/sensitive-paths.mjs`
- Test: `tests/lib/test-strategies/sensitive-paths.test.mjs`

**Tests:** `tests/lib/test-strategies/sensitive-paths.test.mjs`

**Context to load:**
- Spec Behavior 7, Configuration Schema "Matching semantics" and `DEFAULT_SENSITIVE_PATHS` block
- `lib/test-strategies/manifest.mjs:20` (`matchGlob` — reuse, do not reimplement)

- [ ] **Write failing test**

```javascript
// tests/lib/test-strategies/sensitive-paths.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SENSITIVE_PATHS,
  effectiveSensitivePaths,
} from "../../../lib/test-strategies/sensitive-paths.mjs";

test("DEFAULT_SENSITIVE_PATHS covers auth, secrets, credentials, env, key material, governance", () => {
  assert.ok(DEFAULT_SENSITIVE_PATHS.some((p) => p.includes("auth")));
  assert.ok(DEFAULT_SENSITIVE_PATHS.some((p) => p.includes(".env")));
  assert.ok(DEFAULT_SENSITIVE_PATHS.some((p) => p.includes("governance")));
});

test("effectiveSensitivePaths unions configured entries with the built-in default", () => {
  const result = effectiveSensitivePaths(["src/billing/**"]);
  assert.ok(result.includes("src/billing/**"));
  for (const p of DEFAULT_SENSITIVE_PATHS) assert.ok(result.includes(p));
});

test("effectiveSensitivePaths never returns fewer entries than the built-in default", () => {
  assert.ok(effectiveSensitivePaths([]).length >= DEFAULT_SENSITIVE_PATHS.length);
  assert.ok(effectiveSensitivePaths(undefined).length >= DEFAULT_SENSITIVE_PATHS.length);
});

test("malformed configured input degrades to the built-in set with an advisory", () => {
  const { paths, warnings } = effectiveSensitivePaths({ not: "an array" }, { withWarnings: true });
  assert.deepEqual(paths, DEFAULT_SENSITIVE_PATHS);
  assert.ok(warnings.some((w) => w.code === "INVALID_SENSITIVE_PATHS"));
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/test-strategies/sensitive-paths.test.mjs`
Expected: FAIL — `Cannot find module '../../../lib/test-strategies/sensitive-paths.mjs'`

- [ ] **Implement**

```javascript
// lib/test-strategies/sensitive-paths.mjs
export const DEFAULT_SENSITIVE_PATHS = Object.freeze([
  "**/auth/**", "**/auth*", "**/crypto/**", "**/crypto*",
  "**/secrets/**", "**/*secret*", "**/credentials/**", "**/*credential*",
  "**/.env*", "**/*.pem", "**/*.key", "**/*.p12",
  ".context-index/governance/**", ".github/workflows/**",
]);

export function effectiveSensitivePaths(configured, { withWarnings = false } = {}) {
  const warnings = [];
  let extra = [];
  if (Array.isArray(configured) && configured.every((e) => typeof e === "string")) {
    extra = configured;
  } else if (configured != null && (!Array.isArray(configured) || configured.length > 0)) {
    warnings.push({
      code: "INVALID_SENSITIVE_PATHS",
      message: "sensitive-paths.yaml is present but unparseable, or contains a non-string entry; proceeding on the built-in set alone",
    });
  }
  const paths = Object.freeze([...new Set([...DEFAULT_SENSITIVE_PATHS, ...extra])]);
  return withWarnings ? { paths, warnings } : paths;
}
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/test-strategies/sensitive-paths.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/test-strategies/sensitive-paths.mjs tests/lib/test-strategies/sensitive-paths.test.mjs
git commit -m "feat(test-strategies): add DEFAULT_SENSITIVE_PATHS and effectiveSensitivePaths

Spec: .context-index/specs/features/test-strategies/test-depth-policy.spec.md
Plan-task: 2"
```

---

### Task 3: Policy Schema, Parser, and Granularity Resolution [specialist: none]

**Charter capability:** Test Depth Policy
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/test-strategies/policy.mjs`
- Test: `tests/lib/test-strategies/policy.test.mjs`

**Tests:** `tests/lib/test-strategies/policy.test.mjs`

**Context to load:**
- Spec Behaviors 1, 2, 9; Resolution → Granularity chain; Configuration Schema "Project structure config"
- `lib/test-strategies/assignment.mjs:23-95` (chain/warnings/source shape to mirror)
- `lib/test-strategies/manifest.mjs:62-84` (`parseTestStrategies` validation style)

- [ ] **Write failing test**

```javascript
// tests/lib/test-strategies/policy.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTestPolicy, resolveGranularity } from "../../../lib/test-strategies/policy.mjs";

test("parseTestPolicy returns per-behavior fallback with no warnings when block is absent", () => {
  const { policy, warnings } = parseTestPolicy({});
  assert.equal(policy.granularity, "per-behavior");
  assert.equal(policy.escalation, true);
  assert.deepEqual(warnings, []);
});

test("parseTestPolicy rejects an out-of-enumeration granularity", () => {
  assert.throws(
    () => parseTestPolicy({ test_policy: { granularity: "per-sprint" } }),
    /INVALID_TEST_GRANULARITY/,
  );
});

test("parseTestPolicy rejects a non-boolean escalation flag", () => {
  assert.throws(
    () => parseTestPolicy({ test_policy: { escalation: "yes" } }),
    /INVALID_ESCALATION_FLAG/,
  );
});

test("parseTestPolicy rejects an escalation_rules when: expression against a 1-5 scale", () => {
  assert.throws(
    () => parseTestPolicy({ test_policy: { escalation_rules: [{ when: { blast_radius: "<=3" }, depth: "thorough" }] } }),
    /INVALID_ESCALATION_RULE_EXPRESSION/,
  );
});

test("parseTestPolicy rejects an escalation_rules entry naming an unknown dimension", () => {
  assert.throws(
    () => parseTestPolicy({ test_policy: { escalation_rules: [{ when: { made_up_dim: "<=0.3" }, depth: "thorough" }] } }),
    /UNKNOWN_ROUTING_DIMENSION/,
  );
});

test("parseTestPolicy rejects more than 32 escalation_rules", () => {
  const rules = Array.from({ length: 33 }, () => ({ when: { novelty: "<=0.3" }, depth: "thorough" }));
  assert.throws(
    () => parseTestPolicy({ test_policy: { escalation_rules: rules } }),
    /ESCALATION_RULES_LIMIT_EXCEEDED/,
  );
});

test("resolveGranularity: module override beats manifest beats domain beats fallback", () => {
  assert.equal(resolveGranularity({ moduleOverride: "per-task" }).granularity, "per-task");
  assert.equal(resolveGranularity({ manifestPolicy: "per-spec" }).source, "manifest");
  assert.equal(resolveGranularity({}).source, "fallback");
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/test-strategies/policy.test.mjs`
Expected: FAIL — module not found

- [ ] **Implement**

```javascript
// lib/test-strategies/policy.mjs
const GRANULARITIES = new Set(["per-task", "per-behavior", "per-spec"]);
const DIMENSIONS = new Set(["spec_completeness", "pattern_coverage", "blast_radius", "novelty"]);
const RULE_EXPR = /^(<=|>=|<|>|==)\s*(0(\.\d+)?|1(\.0+)?)$/;
const MAX_RULES = 32;

export function parseTestPolicy(manifest) {
  const block = manifest?.test_policy ?? {};
  const granularity = block.granularity ?? "per-behavior";
  if (!GRANULARITIES.has(granularity)) {
    throw new Error(`INVALID_TEST_GRANULARITY: '${granularity}' (manifest.yaml test_policy.granularity) — legal set: ${[...GRANULARITIES].join(", ")}`);
  }
  const escalation = block.escalation ?? true;
  if (typeof escalation !== "boolean") {
    throw new Error(`INVALID_ESCALATION_FLAG: '${escalation}' (manifest.yaml test_policy.escalation) — must be boolean`);
  }
  const rules = block.escalation_rules ?? [];
  if (rules.length > MAX_RULES) {
    throw new Error(`ESCALATION_RULES_LIMIT_EXCEEDED: ${rules.length} rules exceeds cap of ${MAX_RULES}`);
  }
  for (const rule of rules) {
    for (const [dim, expr] of Object.entries(rule.when ?? {})) {
      if (!DIMENSIONS.has(dim)) {
        throw new Error(`UNKNOWN_ROUTING_DIMENSION: '${dim}' — legal dimensions: ${[...DIMENSIONS].join(", ")}`);
      }
      if (!RULE_EXPR.test(expr)) {
        throw new Error(`INVALID_ESCALATION_RULE_EXPRESSION: '${expr}' for dimension '${dim}' — must match ${RULE_EXPR}`);
      }
    }
  }
  return { policy: { granularity, escalation, escalation_rules: rules }, warnings: [] };
}

export function resolveGranularity({ moduleOverride, manifestPolicy, domainDefault } = {}) {
  if (moduleOverride) return { granularity: moduleOverride, source: "module" };
  if (manifestPolicy) return { granularity: manifestPolicy, source: "manifest" };
  if (domainDefault) return { granularity: domainDefault, source: "domain" };
  return { granularity: "per-behavior", source: "fallback" };
}
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/test-strategies/policy.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/test-strategies/policy.mjs tests/lib/test-strategies/policy.test.mjs
git commit -m "feat(test-strategies): add parseTestPolicy and resolveGranularity

Spec: .context-index/specs/features/test-strategies/test-depth-policy.spec.md
Plan-task: 3"
```

---

### Task 4: Risk-Policy `test_depth` Extension [specialist: none]

**Charter capability:** Test Depth Policy
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `.context-index/governance/risk-policies.yaml`
- Modify: `templates/risk-policies-template.yaml`
- Modify: `lib/governance/rigor-mode.mjs:34` (`loadRigorPolicies`)
- Test: `tests/governance/rigor-mode-test-depth.test.mjs`

**Tests:** `tests/governance/rigor-mode-test-depth.test.mjs`

**Context to load:**
- Spec "Relationship to graduated rigor tiers", Configuration Schema `risk-policies.yaml` block
- `lib/governance/rigor-mode.mjs:14-60` (full read; `resolveRigorMode` is OUT OF SCOPE — read-only reference)
- `tests/governance/rigor-mode.test.mjs` (read-only — confirm it stays green and byte-unchanged)

- [ ] **Write failing test**

```javascript
// tests/governance/rigor-mode-test-depth.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRigorPolicies } from "../../lib/governance/rigor-mode.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

test("loadRigorPolicies surfaces test_depth per risk level", async () => {
  const dir = await createTempDir();
  try {
    await writeFixture(dir, ".context-index/governance/risk-policies.yaml", `
policies:
  high:   { review_mode: full,  validate_mode: full,  test_depth: thorough }
  medium: { review_mode: full,  validate_mode: full,  test_depth: standard }
  low:    { review_mode: quick, validate_mode: quick, test_depth: minimal }
`);
    const policies = loadRigorPolicies(dir);
    assert.equal(policies.high.test_depth, "thorough");
    assert.equal(policies.medium.test_depth, "standard");
    assert.equal(policies.low.test_depth, "minimal");
  } finally {
    await cleanupTempDir(dir);
  }
});

test("an out-of-enumeration test_depth raises INVALID_TEST_DEPTH", async () => {
  const dir = await createTempDir();
  try {
    await writeFixture(dir, ".context-index/governance/risk-policies.yaml", `
policies:
  high: { review_mode: full, validate_mode: full, test_depth: extreme }
`);
    assert.throws(() => loadRigorPolicies(dir), /INVALID_TEST_DEPTH/);
  } finally {
    await cleanupTempDir(dir);
  }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/rigor-mode-test-depth.test.mjs`
Expected: FAIL — `policies.high.test_depth` is `undefined`; no `INVALID_TEST_DEPTH` thrown

- [ ] **Implement**

- In `.context-index/governance/risk-policies.yaml` and `templates/risk-policies-template.yaml`,
  add `test_depth: thorough|standard|minimal` to the `high`/`medium`/`low` entries per the spec's
  Configuration Schema block.
- In `lib/governance/rigor-mode.mjs`, extend `loadRigorPolicies()` (read-only extension — do not
  touch `resolveRigorMode`'s signature or precedence) to also read and validate `test_depth` per
  entry against `["minimal", "standard", "thorough"]`, throwing
  `INVALID_TEST_DEPTH: '<value>' (<source file>) — legal set: minimal, standard, thorough` on a
  bad value, naming the value and source file per spec Error Cases table.

- [ ] **Verify test passes**

Run: `node --test tests/governance/rigor-mode-test-depth.test.mjs tests/governance/rigor-mode.test.mjs`
Expected: PASS for both files — `rigor-mode.test.mjs` is unaffected

- [ ] **Commit**

```bash
git add .context-index/governance/risk-policies.yaml templates/risk-policies-template.yaml \
        lib/governance/rigor-mode.mjs tests/governance/rigor-mode-test-depth.test.mjs
git commit -m "feat(governance): extend risk policies with test_depth per risk level

Spec: .context-index/specs/features/test-strategies/test-depth-policy.spec.md
Plan-task: 4"
```

---

### Task 5: Plan-Task File Reader (`readTaskFiles`) [specialist: none]

**Charter capability:** Test Depth Policy
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/test-strategies/task-files.mjs`
- Test: `tests/lib/test-strategies/task-files.test.mjs`

**Tests:** `tests/lib/test-strategies/task-files.test.mjs`

**Context to load:**
- Spec Behavior 8 in full (task-region mapping, token predicate, decision note) — this is the
  densest behavior in the spec; re-read it fully before writing tests
- `skills/plan/SKILL.md` Context Packets (~L415-425) and Task Structure `**Files:**`/`**Tests:**`
  (~L608,613) sections — the two heading families and two shipped `**Files:**` shapes

- [ ] **Write failing test**

```javascript
// tests/lib/test-strategies/task-files.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readTaskFiles } from "../../../lib/test-strategies/task-files.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../../helpers.mjs";

const PLAN = `
## Context Packets

### Task 1 Context
- Source files: \`src/foo.ts\`

## Task Structure

### Task 1: Context-pack library [specialist: none]
**Files:**
- Create: \`src/foo.ts\`
- Modify: \`src/bar.ts:12-20\`
- Test: \`tests/foo.test.ts\`

**Tests:** \`tests/foo.test.ts\`

### Task 2: Prototype Context Reception [specialist: none]
**Files:** \`src/baz.ts\` (no source changes), \`--dry-run\`, \`_acquireLock\`

### Task 9b: Suffixed heading [specialist: none]
**Files:**
- Create: \`src/suffixed.ts\`
`;

test("resolves t1 to the task-body region, not the preceding context packet", async () => {
  const dir = await createTempDir();
  try {
    await writeFixture(dir, "plan.md", PLAN);
    const { targetPaths, available } = await readTaskFiles(`${dir}/plan.md`, "t1");
    assert.ok(targetPaths.includes("src/foo.ts"));
    assert.ok(targetPaths.includes("src/bar.ts")); // line range stripped
    assert.ok(targetPaths.includes("tests/foo.test.ts")); // Test: + Tests: field included
    assert.ok(available);
  } finally {
    await cleanupTempDir(dir);
  }
});

test("a task-body heading whose title contains the word Context still opens its region", async () => {
  const dir = await createTempDir();
  try {
    await writeFixture(dir, "plan.md", PLAN);
    const { targetPaths } = await readTaskFiles(`${dir}/plan.md`, "t2");
    assert.ok(targetPaths.includes("src/baz.ts"));
    assert.ok(!targetPaths.some((p) => p.includes("dry-run")));
    assert.ok(!targetPaths.some((p) => p.includes("acquireLock")));
  } finally {
    await cleanupTempDir(dir);
  }
});

test("a suffixed heading (Task 9b) resolves to no region and degrades visibly", async () => {
  const dir = await createTempDir();
  try {
    await writeFixture(dir, "plan.md", PLAN);
    const { targetPaths, available } = await readTaskFiles(`${dir}/plan.md`, "t9b");
    assert.deepEqual(targetPaths, []);
    assert.equal(available, false);
  } finally {
    await cleanupTempDir(dir);
  }
});

test("a task whose parse yields zero paths degrades to available:false without throwing", async () => {
  const dir = await createTempDir();
  try {
    await writeFixture(dir, "plan.md", "## Task Structure\n\n### Task 3: Prose only [specialist: none]\nNo files declared, just prose.\n");
    const { targetPaths, available } = await readTaskFiles(`${dir}/plan.md`, "t3");
    assert.deepEqual(targetPaths, []);
    assert.equal(available, false);
  } finally {
    await cleanupTempDir(dir);
  }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/test-strategies/task-files.test.mjs`
Expected: FAIL — module not found

- [ ] **Implement**

```javascript
// lib/test-strategies/task-files.mjs
import { readFile } from "node:fs/promises";

const CONTEXT_FAMILY = /^(\s*[-–]\s*\d+)?\s+Context\b/;
const TASK_HEADING = /^#{2,4}\s+Task\s+(\d+)\b(.*)$/;
const PATH_TOKEN = (tok) => tok.includes("/") || /\.[A-Za-z0-9_-]+$/.test(tok);

function isTargetToken(raw) {
  const tok = raw.replace(/^`|`$/g, "").replace(/:\d+(-\d+)?$/, "");
  if (!PATH_TOKEN(tok)) return null;
  return tok.replace(/^\.\//, "");
}

export async function readTaskFiles(planPath, taskId) {
  const m = /^t(\d+)$/.exec(taskId);
  if (!m) return { targetPaths: [], available: false };
  const n = m[1];
  const text = await readFile(planPath, "utf8");
  const lines = text.split("\n");

  let regionStart = -1;
  let regionEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const hm = TASK_HEADING.exec(lines[i]);
    if (!hm) continue;
    const [, num, remainder] = hm;
    const isContext = CONTEXT_FAMILY.test(remainder);
    if (isContext) continue; // context-family never opens/closes a region
    if (num === n && regionStart === -1) {
      regionStart = i + 1;
    } else if (regionStart !== -1 && num !== n) {
      regionEnd = i;
      break;
    }
  }
  if (regionStart === -1) return { targetPaths: [], available: false };

  const region = lines.slice(regionStart, regionEnd).join("\n");
  const tokens = region.match(/`[^`]+`|\S+/g) ?? [];
  const paths = new Set();
  for (const tok of tokens) {
    const p = isTargetToken(tok);
    if (p) paths.add(p);
  }
  const targetPaths = [...paths];
  return { targetPaths, available: targetPaths.length > 0 };
}
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/test-strategies/task-files.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/test-strategies/task-files.mjs tests/lib/test-strategies/task-files.test.mjs
git commit -m "feat(test-strategies): add readTaskFiles plan-region parser

Spec: .context-index/specs/features/test-strategies/test-depth-policy.spec.md
Plan-task: 5"
```

---

### Task 6: Depth Resolution (`resolveTestDepth`) [specialist: none]

**Charter capability:** Test Depth Policy
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2, Task 3, Task 4, Task 5
**Files:**
- Create: `lib/test-strategies/depth.mjs`
- Test: `tests/lib/test-strategies/depth.test.mjs`

**Tests:** `tests/lib/test-strategies/depth.test.mjs`

**Context to load:**
- Spec Behaviors 4, 5, 6 (full), Resolution section, Interface Contract `resolveTestDepth()` row
- `lib/test-strategies/assignment.mjs:23-95` (chain pattern)
- Task 2 (`effectiveSensitivePaths`), Task 3 (`parseTestPolicy`), Task 5 (`readTaskFiles` output shape)

- [ ] **Write failing test**

```javascript
// tests/lib/test-strategies/depth.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTestDepth } from "../../../lib/test-strategies/depth.mjs";
import { DEFAULT_SENSITIVE_PATHS } from "../../../lib/test-strategies/sensitive-paths.mjs";

const base = {
  spec: {}, riskLevel: "medium",
  policies: { medium: { test_depth: "standard" } },
  escalationEnabled: true, escalationRules: [],
  boundaryCrossing: false, targetPaths: [], sensitivePaths: DEFAULT_SENSITIVE_PATHS,
};

test("spec-declared test_depth beats module override and risk-policy default", () => {
  const r = resolveTestDepth({ ...base, spec: { test_depth: "thorough" }, moduleOverride: "minimal" });
  assert.equal(r.depth, "thorough");
  assert.equal(r.source, "spec-declared");
});

test("chain falls through to risk-policy default with no overrides", () => {
  const r = resolveTestDepth(base);
  assert.equal(r.depth, "standard");
  assert.equal(r.source, "risk-policy");
});

test("escalation is monotonic upward only — a lower-naming rule is a no-op", () => {
  const r = resolveTestDepth({
    ...base, spec: { test_depth: "thorough" },
    escalationRules: [{ when: { blast_radius: "<=0.3" }, depth: "minimal" }],
    routingScore: { blast_radius: 0.1 },
  });
  assert.equal(r.depth, "thorough");
});

test("two matching rules of different depths take the highest with a CONFLICTING_ESCALATION_RULE advisory", () => {
  const r = resolveTestDepth({
    ...base,
    escalationRules: [
      { when: { blast_radius: "<=0.3" }, depth: "standard" },
      { when: { novelty: "<=0.3" }, depth: "thorough" },
    ],
    routingScore: { blast_radius: 0.1, novelty: 0.1 },
  });
  assert.equal(r.depth, "thorough");
  assert.ok(r.warnings.some((w) => w.code === "CONFLICTING_ESCALATION_RULE"));
});

test("escalation_skipped distinguishes disabled / no-routing-entry / no-match", () => {
  assert.equal(resolveTestDepth({ ...base, escalationEnabled: false }).escalation_skipped, "disabled");
  assert.equal(resolveTestDepth({ ...base, escalationRules: [{ when: { novelty: "<=0.3" }, depth: "thorough" }] }).escalation_skipped, "no-routing-entry");
  assert.equal(
    resolveTestDepth({ ...base, escalationRules: [{ when: { novelty: "<=0.3" }, depth: "thorough" }], routingScore: { novelty: 0.9 } }).escalation_skipped,
    "no-match",
  );
});

test("floor fires on a sensitive-path match with risk_level low and no boundaries", () => {
  const r = resolveTestDepth({
    ...base, riskLevel: "low", policies: { low: { test_depth: "minimal" } },
    boundaryCrossing: false, targetPaths: ["src/auth/session.ts"],
  });
  assert.equal(r.depth, "thorough");
  assert.equal(r.floor_applied, true);
  assert.deepEqual(r.floor_legs, ["sensitive-path"]);
});

test("floor_applied is recorded even when escalation already reached thorough", () => {
  const r = resolveTestDepth({
    ...base, riskLevel: "low", policies: { low: { test_depth: "minimal" } },
    targetPaths: ["src/auth/session.ts"],
    escalationRules: [{ when: { novelty: "<=0.3" }, depth: "thorough" }],
    routingScore: { novelty: 0.1 },
  });
  assert.equal(r.depth, "thorough");
  assert.equal(r.floor_applied, true);
});

test("risk_level high with no parseable path block records floor_applied true and floor_inputs unavailable", () => {
  const r = resolveTestDepth({ ...base, riskLevel: "high", policies: { high: { test_depth: "thorough" } }, targetPaths: [] });
  assert.equal(r.floor_applied, true);
  assert.deepEqual(r.floor_legs, ["risk-level"]);
  assert.equal(r.floor_inputs, "unavailable");
});

test("floor legs are evaluated last, after chain and escalation, and only escalate", () => {
  const r = resolveTestDepth({ ...base, riskLevel: "low", policies: { low: { test_depth: "minimal" } }, targetPaths: [] });
  assert.equal(r.depth, "minimal"); // no leg held: risk low, no boundary, no sensitive path
  assert.equal(r.floor_applied, false);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/test-strategies/depth.test.mjs`
Expected: FAIL — module not found

- [ ] **Implement**

```javascript
// lib/test-strategies/depth.mjs
import { matchGlob } from "./manifest.mjs";

const RANK = { minimal: 0, standard: 1, thorough: 2 };
const higher = (a, b) => (RANK[a] >= RANK[b] ? a : b);

function chain({ spec, moduleOverride, riskLevel, policies, domainDefault }) {
  if (spec?.test_depth) return { depth: spec.test_depth, source: "spec-declared" };
  if (moduleOverride) return { depth: moduleOverride, source: "module" };
  if (policies?.[riskLevel]?.test_depth) return { depth: policies[riskLevel].test_depth, source: "risk-policy" };
  if (domainDefault) return { depth: domainDefault, source: "domain" };
  return { depth: "standard", source: "fallback" };
}

function evalExpr(expr, value) {
  const m = /^(<=|>=|<|>|==)\s*([\d.]+)$/.exec(expr);
  const [, op, num] = m;
  const n = Number(num);
  return { "<=": value <= n, ">=": value >= n, "<": value < n, ">": value > n, "==": value === n }[op];
}

function escalate({ depth, escalationEnabled, escalationRules, routingScore }) {
  const warnings = [];
  if (!escalationEnabled) return { depth, escalated: false, escalation_skipped: "disabled", warnings };
  if (!routingScore) return { depth, escalated: false, escalation_skipped: "no-routing-entry", warnings };
  let winner = null;
  const matched = [];
  for (const rule of escalationRules ?? []) {
    const dims = Object.entries(rule.when ?? {});
    const allMatch = dims.every(([dim, expr]) => routingScore[dim] !== undefined && evalExpr(expr, routingScore[dim]));
    if (allMatch) {
      matched.push(rule);
      winner = winner ? higher(winner, rule.depth) : rule.depth;
    }
  }
  if (matched.length === 0) return { depth, escalated: false, escalation_skipped: "no-match", warnings };
  if (matched.length > 1 && new Set(matched.map((r) => r.depth)).size > 1) {
    warnings.push({ code: "CONFLICTING_ESCALATION_RULE", rules: matched.map((r) => r.when) });
  }
  const finalDepth = higher(depth, winner);
  return { depth: finalDepth, escalated: finalDepth !== depth, escalation_skipped: undefined, warnings };
}

function floor({ depth, riskLevel, boundaryCrossing, targetPaths, sensitivePaths }) {
  const legs = [];
  if (riskLevel === "high") legs.push("risk-level");
  if (boundaryCrossing) legs.push("boundary");
  if (targetPaths.length > 0 && targetPaths.some((p) => sensitivePaths.some((pat) => matchGlob(pat, p)))) {
    legs.push("sensitive-path");
  }
  const floor_applied = legs.length > 0;
  const finalDepth = floor_applied ? higher(depth, "thorough") : depth;
  const floor_inputs = targetPaths.length > 0 ? "available" : "unavailable";
  return { depth: finalDepth, floor_applied, floor_legs: legs, floor_inputs };
}

export function resolveTestDepth(input) {
  const chainResult = chain(input);
  const escResult = escalate({ ...input, depth: chainResult.depth });
  const floorResult = floor({ ...input, depth: escResult.depth });
  return {
    depth: floorResult.depth,
    source: chainResult.source,
    escalated: escResult.escalated,
    escalation_skipped: escResult.escalation_skipped,
    floor_applied: floorResult.floor_applied,
    floor_legs: floorResult.floor_legs,
    floor_inputs: floorResult.floor_inputs,
    warnings: [...escResult.warnings],
  };
}
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/test-strategies/depth.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/test-strategies/depth.mjs tests/lib/test-strategies/depth.test.mjs
git commit -m "feat(test-strategies): add resolveTestDepth chain, escalation, and floor

Spec: .context-index/specs/features/test-strategies/test-depth-policy.spec.md
Plan-task: 6"
```

---

### Task 7: Event Canon — `test_depth_assigned` [specialist: none]

**Charter capability:** Test Depth Policy
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/lifecycle-events.mjs:36-70`
- Modify: `lib/diagnostics/event-schemas.mjs:90-188`
- Test: `tests/lib/lifecycle-events.test.mjs` (extend)
- Test: `tests/diagnostics/event-schemas.test.mjs` (extend)

**Tests:** `tests/lib/lifecycle-events.test.mjs`, `tests/diagnostics/event-schemas.test.mjs`

**Context to load:**
- Spec Behaviors 12, 13, Interface Contract `test_depth_assigned` row
- `lib/lifecycle-events.mjs:36-70` (`spec_amended` `[BOUNDARY: human-approved]` precedent at L61-63)
- `lib/diagnostics/event-schemas.mjs:66,90-188,211` (`plan_task` entry at L115 as template)

- [ ] **Write failing test**

```javascript
// appended to tests/lib/lifecycle-events.test.mjs
test("CANONICAL_EVENTS includes test_depth_assigned", () => {
  assert.ok(CANONICAL_EVENTS.has("test_depth_assigned"));
});
```

```javascript
// appended to tests/diagnostics/event-schemas.test.mjs
test("test_depth_assigned requires plan, task_id, depth, floor_inputs, floor_legs", () => {
  const fields = getRequiredFields("test_depth_assigned");
  for (const f of ["plan", "task_id", "depth", "floor_inputs", "floor_legs"]) {
    assert.ok(fields.includes(f), `expected ${f} in required fields`);
  }
});

test("test_depth_assigned is a known event type", () => {
  assert.equal(isKnownEventType("test_depth_assigned"), true);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/lifecycle-events.test.mjs tests/diagnostics/event-schemas.test.mjs`
Expected: FAIL — `test_depth_assigned` absent from both `CANONICAL_EVENTS` and `REQUIRED_FIELDS_BY_EVENT`

- [ ] **Implement**

In `lib/lifecycle-events.mjs`, add to `CANONICAL_EVENTS` (mirroring the `spec_amended` comment
style, since this is a canon addition per the module's own precedent):

```javascript
  // test_depth_assigned — emitted by `adev test-policy resolve` (sole writer) when depth is
  // resolved for a plan task: chain -> escalation -> floor. Payload carries plan, task_id,
  // depth, source, escalated, escalation_skipped?, floor_applied, floor_legs, floor_inputs,
  // dimensions?. Carries no granularity (plan-time property, already in the plan's **Tests:**
  // fields) and no file paths. A task may accumulate multiple events; most recent (append
  // order) wins. [BOUNDARY: human-approved] Adding a canonical event touches the lifecycle
  // event schema governed by ADR-0009; confirmed intentional by review (PASS_WITH_NOTES).
  // See test-depth-policy.spec.md Behaviors 12-13.
  'test_depth_assigned',
```

In `lib/diagnostics/event-schemas.mjs`, add to `REQUIRED_FIELDS_BY_EVENT`:

```javascript
  test_depth_assigned: Object.freeze([
    ...UNIVERSAL_REQUIRED, 'plan', 'task_id', 'depth', 'source',
    'escalated', 'floor_applied', 'floor_legs', 'floor_inputs',
  ]),
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/lifecycle-events.test.mjs tests/diagnostics/event-schemas.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/lifecycle-events.mjs lib/diagnostics/event-schemas.mjs \
        tests/lib/lifecycle-events.test.mjs tests/diagnostics/event-schemas.test.mjs
git commit -m "feat(lifecycle): register test_depth_assigned canonical event

Spec: .context-index/specs/features/test-strategies/test-depth-policy.spec.md
Plan-task: 7"
```

---

### Task 8: `adev test-policy` CLI Verb [specialist: none]

**Charter capability:** Test Depth Policy
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2, Task 3, Task 4, Task 5, Task 6, Task 7
**Files:**
- Create: `lib/cli/test-policy.mjs`
- Modify: `cli/index.mjs:1719` (`VERB_REGISTRY`)
- Test: `tests/cli/test-policy.test.mjs`

**Tests:** `tests/cli/test-policy.test.mjs`

**Context to load:**
- Spec Behaviors 12, 14, 15, 16, Interface Contract (all `adev test-policy` rows), Error Cases table
- `lib/cli/issues.mjs:23,32,49` (subcommand dispatch pattern)
- `lib/source-manifest.mjs:56-62` (`PATH_OUTSIDE_ROOT`), `lib/workspace.mjs:9` (`detectWorkspace`)

- [ ] **Write failing test**

```javascript
// tests/cli/test-policy.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../../lib/cli/test-policy.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

// Every subcommand except the two argument-validation-only cases resolves the owning spec via
// the plan header's `> **Spec:** <path>` line (appendEvent/readEvents are per-spec logs, not
// global — see the Implement step's specRelFromPlan). This helper seeds both files so each test
// isn't duplicating spec-frontmatter boilerplate.
async function seedPlanWithSpec(dir, { specRel = ".context-index/specs/features/demo/x.spec.md", specFrontmatter = "", planBody }) {
  await writeFixture(dir, specRel, `---\n${specFrontmatter}---\n# X\n`);
  await writeFixture(dir, "plan.plan.md", `> **Spec:** ${specRel}\n\n${planBody}`);
}

test("resolve rejects a malformed --task-id before any append", async () => {
  const dir = await createTempDir();
  try {
    await assert.rejects(
      run({ projectRoot: dir, argv: ["resolve", "--plan", "p.plan.md", "--task-id", "../../x"] }),
      /INVALID_TASK_ID/,
    );
  } finally {
    await cleanupTempDir(dir);
  }
});

test("resolve rejects a --plan path resolving outside the project root", async () => {
  const dir = await createTempDir();
  try {
    await assert.rejects(
      run({ projectRoot: dir, argv: ["resolve", "--plan", "../outside.plan.md", "--task-id", "t1"] }),
      /PATH_OUTSIDE_ROOT/,
    );
  } finally {
    await cleanupTempDir(dir);
  }
});

test("resolve appends test_depth_assigned and prints the assignment as JSON", async () => {
  const dir = await createTempDir();
  try {
    await seedPlanWithSpec(dir, { planBody: "## Task Structure\n\n### Task 1: X [specialist: none]\n**Files:**\n- Create: `src/x.ts`\n" });
    const result = await run({ projectRoot: dir, argv: ["resolve", "--plan", "plan.plan.md", "--task-id", "t1"] });
    assert.ok(result.depth);
    assert.ok(["minimal", "standard", "thorough"].includes(result.depth));
  } finally {
    await cleanupTempDir(dir);
  }
});

test("assert-assigned fails with MISSING_DEPTH_ASSIGNMENT when no event exists", async () => {
  const dir = await createTempDir();
  try {
    await seedPlanWithSpec(dir, { planBody: "## Task Structure\n\n### Task 2: Y [specialist: none]\n" });
    await assert.rejects(
      run({ projectRoot: dir, argv: ["assert-assigned", "--plan", "plan.plan.md", "--task-id", "t2"] }),
      /MISSING_DEPTH_ASSIGNMENT/,
    );
  } finally {
    await cleanupTempDir(dir);
  }
});

test("explain reports NO_RECORDED_ASSIGNMENT for a task with no assignment event", async () => {
  const dir = await createTempDir();
  try {
    await seedPlanWithSpec(dir, { planBody: "## Task Structure\n\n### Task 3: Z [specialist: none]\n" });
    const result = await run({ projectRoot: dir, argv: ["explain", "--plan", "plan.plan.md", "--task-id", "t3"] });
    assert.equal(result.code, "NO_RECORDED_ASSIGNMENT");
  } finally {
    await cleanupTempDir(dir);
  }
});

test("explain never echoes targetPaths or any task file path", async () => {
  const dir = await createTempDir();
  try {
    await seedPlanWithSpec(dir, { planBody: "## Task Structure\n\n### Task 4: W [specialist: none]\n**Files:**\n- Create: `src/secret-path.ts`\n" });
    await run({ projectRoot: dir, argv: ["resolve", "--plan", "plan.plan.md", "--task-id", "t4"] });
    const result = await run({ projectRoot: dir, argv: ["explain", "--plan", "plan.plan.md", "--task-id", "t4"] });
    assert.ok(!JSON.stringify(result).includes("secret-path"));
  } finally {
    await cleanupTempDir(dir);
  }
});

test("resolve reads the spec's spec-declared test_depth via the plan header's Spec: line", async () => {
  const dir = await createTempDir();
  try {
    await seedPlanWithSpec(dir, {
      specFrontmatter: "test_depth: thorough\nrisk_level: low\n",
      planBody: "## Task Structure\n\n### Task 5: V [specialist: none]\n**Files:**\n- Create: `src/v.ts`\n",
    });
    const result = await run({ projectRoot: dir, argv: ["resolve", "--plan", "plan.plan.md", "--task-id", "t5"] });
    assert.equal(result.depth, "thorough");
    assert.equal(result.source, "spec-declared");
  } finally {
    await cleanupTempDir(dir);
  }
});

test("resolve consults a modules[].test_depth override by matching targetPaths against modules[].paths", async () => {
  const dir = await createTempDir();
  try {
    await writeFixture(dir, ".context-index/manifest.yaml", "modules:\n  - slug: payments\n    paths:\n      - src/payments/\n    test_depth: thorough\n");
    await seedPlanWithSpec(dir, { planBody: "## Task Structure\n\n### Task 6: U [specialist: none]\n**Files:**\n- Create: `src/payments/charge.ts`\n" });
    const result = await run({ projectRoot: dir, argv: ["resolve", "--plan", "plan.plan.md", "--task-id", "t6"] });
    assert.equal(result.depth, "thorough");
    assert.equal(result.source, "module");
  } finally {
    await cleanupTempDir(dir);
  }
});

test("resolve evaluates boundary crossing against governance/boundaries.yaml and floors on a match", async () => {
  const dir = await createTempDir();
  try {
    await writeFixture(
      dir, ".context-index/governance/boundaries.yaml",
      "boundaries:\n  - id: no-direct-db\n    severity: error\n    pattern: 'src/db/'\n    exclude: []\n",
    );
    await seedPlanWithSpec(dir, { planBody: "## Task Structure\n\n### Task 7: T [specialist: none]\n**Files:**\n- Create: `src/db/query.ts`\n" });
    const result = await run({ projectRoot: dir, argv: ["resolve", "--plan", "plan.plan.md", "--task-id", "t7"] });
    assert.equal(result.floor_applied, true);
    assert.ok(result.floor_legs.includes("boundary"));
  } finally {
    await cleanupTempDir(dir);
  }
});

test("resolve degrades to no escalation when .routing.json is absent (ROUTING_SIDECAR_MISSING must not crash resolve)", async () => {
  const dir = await createTempDir();
  try {
    await seedPlanWithSpec(dir, { planBody: "## Task Structure\n\n### Task 8: S [specialist: none]\n**Files:**\n- Create: `src/s.ts`\n" });
    // No plan.routing.json fixture written — this is the normal pre-/adev:route state.
    const result = await run({ projectRoot: dir, argv: ["resolve", "--plan", "plan.plan.md", "--task-id", "t8"] });
    assert.equal(result.escalated, false);
    assert.equal(result.escalation_skipped, "no-routing-entry");
  } finally {
    await cleanupTempDir(dir);
  }
});

test("resolve consults risk-policies.yaml's test_depth per risk level via loadRigorPolicies, not a manifest.yaml field", async () => {
  const dir = await createTempDir();
  try {
    await writeFixture(dir, ".context-index/governance/risk-policies.yaml", "policies:\n  low: { review_mode: quick, validate_mode: quick, test_depth: minimal }\n");
    await seedPlanWithSpec(dir, {
      specFrontmatter: "risk_level: low\n",
      planBody: "## Task Structure\n\n### Task 9: R [specialist: none]\n**Files:**\n- Create: `src/r.ts`\n",
    });
    const result = await run({ projectRoot: dir, argv: ["resolve", "--plan", "plan.plan.md", "--task-id", "t9"] });
    assert.equal(result.depth, "minimal");
    assert.equal(result.source, "risk-policy");
  } finally {
    await cleanupTempDir(dir);
  }
});

test("show prints the effective policy with the layer that supplied each field", async () => {
  const dir = await createTempDir();
  try {
    const result = await run({ projectRoot: dir, argv: ["show"] });
    assert.ok(result.granularity); // e.g. "per-behavior" — flat string, not nested
    assert.ok(result.granularity_source); // e.g. "fallback"
    assert.ok(Array.isArray(result.sensitive_paths.built_in));
  } finally {
    await cleanupTempDir(dir);
  }
});

test("set validates --module against modules[] and rejects an unknown slug with UNKNOWN_POLICY_MODULE", async () => {
  const dir = await createTempDir();
  try {
    await writeFixture(dir, ".context-index/manifest.yaml", "modules:\n  - slug: lib\n    paths:\n      - lib/\n");
    await assert.rejects(
      run({ projectRoot: dir, argv: ["set", "--module", "does-not-exist", "--test_depth", "thorough"] }),
      /UNKNOWN_POLICY_MODULE/,
    );
  } finally {
    await cleanupTempDir(dir);
  }
});

test("set writes via temp-file-plus-rename and round-trip-verifies before committing", async () => {
  const dir = await createTempDir();
  try {
    await writeFixture(dir, ".context-index/manifest.yaml", "modules:\n  - slug: lib\n    paths:\n      - lib/\n");
    await run({ projectRoot: dir, argv: ["set", "--module", "lib", "--test_depth", "thorough"] });
    const result = await run({ projectRoot: dir, argv: ["show", "--module", "lib"] });
    assert.equal(result.test_depth.value, "thorough");
  } finally {
    await cleanupTempDir(dir);
  }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/test-policy.test.mjs`
Expected: FAIL — module not found

- [ ] **Implement**

```javascript
// lib/cli/test-policy.mjs
import { resolve as resolvePath } from "node:path";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { loadManifest } from "../manifest.mjs";
import { detectWorkspace } from "../workspace.mjs";
import { readTaskFiles } from "../test-strategies/task-files.mjs";
import { resolveTestDepth } from "../test-strategies/depth.mjs";
import { effectiveSensitivePaths, DEFAULT_SENSITIVE_PATHS } from "../test-strategies/sensitive-paths.mjs";
import { resolveGranularity } from "../test-strategies/policy.mjs";
import { lookupRoutingEntry } from "../plan-routing-sidecar.mjs";
import { appendEvent, readEvents } from "../lifecycle-state.mjs"; // both take (projectRoot, specPath, ...) — the
                                                                    // log is per-spec, not global; see specPathFromPlan below
import { loadRigorPolicies } from "../governance/rigor-mode.mjs"; // returns risk-policies.yaml's `policies` map, or null
                                                                     // when the file is absent — never throws (verified: no
                                                                     // try/catch needed here, unlike lookupRoutingEntry below)
import { parseFrontmatterFields } from "../amendment-graph.mjs";
import { parseYaml } from "../profiles/yaml.mjs"; // the project's only YAML tool is a PARSER, no serializer —
                                                    // see the implementation note below `set` for why writes
                                                    // use targeted text substitution, not parse+re-dump

function assertContained(projectRoot, relPath) {
  const abs = resolvePath(projectRoot, relPath);
  if (!abs.startsWith(resolvePath(projectRoot) + "/")) {
    const err = new Error(`PATH_OUTSIDE_ROOT: '${relPath}' resolves outside the project root`);
    err.code = "PATH_OUTSIDE_ROOT";
    throw err;
  }
  return abs;
}

function assertTaskId(taskId) {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(taskId)) {
    const err = new Error(`INVALID_TASK_ID: '${taskId}' does not match ^[a-z0-9][a-z0-9._-]{0,63}$`);
    err.code = "INVALID_TASK_ID";
    throw err;
  }
}

function assertNotWorkspaceRoot(projectRoot) {
  const ws = detectWorkspace(projectRoot);
  if (ws && ws.currentRepoSlug === null) {
    const err = new Error("WORKSPACE_ROOT_REFUSED: test-policy verbs do not run at a workspace root");
    err.code = "WORKSPACE_ROOT_REFUSED";
    throw err;
  }
}

// The plan file carries no --spec flag; every subcommand that reads or writes the lifecycle
// event log locates the owning spec via the plan header's `> **Spec:** <path>` line (Plan
// Document Header format, skills/plan/SKILL.md) — `appendEvent`/`readEvents` in
// lib/lifecycle-state.mjs are BOTH `(projectRoot, specPath, ...)`: the event log is one JSONL
// file per spec, not a single global log, so every one of resolve/assert-assigned/explain needs
// this resolution step, not just resolve.
function specRelFromPlan(projectRoot, planRel) {
  const planAbs = assertContained(projectRoot, planRel);
  const planText = readFileSync(planAbs, "utf8");
  const m = /^>\s*\*\*Spec:\*\*\s*(\S+)/m.exec(planText);
  if (!m) {
    const err = new Error(`plan '${planRel}' has no '> **Spec:**' header line — cannot resolve its lifecycle event log`);
    err.code = "PLAN_MISSING_SPEC_HEADER";
    throw err;
  }
  return { planAbs, specRel: m[1] };
}

function loadOwningSpec(projectRoot, specRel) {
  const specAbs = assertContained(projectRoot, specRel);
  const fields = parseFrontmatterFields(readFileSync(specAbs, "utf8"));
  return { test_depth: fields.test_depth, risk_level: fields.risk_level ?? "medium" };
}

function moduleOverrideFor(manifest, targetPaths) {
  for (const mod of manifest?.modules ?? []) {
    const paths = mod.paths ?? [];
    if (targetPaths.some((tp) => paths.some((p) => tp.startsWith(p)))) {
      if (mod.test_depth) return mod.test_depth;
    }
  }
  return undefined;
}

function boundaryCrossingFor(projectRoot, targetPaths) {
  // The RegExp construction is INSIDE the try block too: an operator-authored boundaries.yaml
  // can carry a syntactically invalid regex pattern (this verb reinterprets `pattern` as a
  // path-string regex, not the content regex other boundaries.yaml consumers use — see the note
  // below the code block), and a bad pattern must degrade the same as an unparseable file, never
  // crash `resolve` outright.
  try {
    const doc = parseYaml(readFileSync(resolvePath(projectRoot, ".context-index/governance/boundaries.yaml"), "utf8"));
    const rules = doc?.boundaries ?? [];
    return targetPaths.some((tp) => rules.some((rule) => new RegExp(rule.pattern).test(tp)));
  } catch {
    return false; // absent/unparseable boundaries.yaml, or an invalid regex pattern — no crossing, not an error (widen-only default)
  }
}

// Targeted text substitution, not parse+re-serialize: this project ships no YAML *serializer*
// (only `parseYaml`), and manifest.yaml is a hand-authored, heavily commented file — a
// parse-then-dump round-trip would silently drop every comment. `applyTestPolicyEdit` instead
// finds the exact line(s) to change via anchored regex and rewrites only those lines, leaving
// everything else byte-identical. This mirrors the "leaves every config file byte-identical on
// failure" requirement more literally than an object-level diff ever could.
function applyTestPolicyEdit(text, flags) {
  if (flags.module) {
    // Anchor the slug match to end-of-line/whitespace, NOT \b: `-` is a non-word character, so
    // \b is satisfied between "lib" and "lib-old" too, letting `--module lib` match a longer
    // sibling slug's block when it's listed first. `\s*$` with the `m` flag requires the slug to
    // be the entire (trimmed) line content.
    const moduleBlockRe = new RegExp(`(-\\s+slug:\\s*${flags.module}\\s*$[\\s\\S]*?)(\\n\\s*-\\s+slug:|\\n\\n|$)`, "m");
    const m = moduleBlockRe.exec(text);
    if (!m) throw new Error(`UNKNOWN_POLICY_MODULE: '${flags.module}' block not found in manifest.yaml`);
    const block = m[1];
    const updatedBlock = /test_depth:\s*\S+/.test(block)
      ? block.replace(/test_depth:\s*\S+/, `test_depth: ${flags.test_depth}`)
      : `${block}\n    test_depth: ${flags.test_depth}`;
    return text.slice(0, m.index) + updatedBlock + text.slice(m.index + block.length);
  }
  if (flags.granularity) {
    if (/test_policy:\s*\n(\s+granularity:\s*\S+)/.test(text)) {
      return text.replace(/(test_policy:\s*\n\s+granularity:\s*)\S+/, `$1${flags.granularity}`);
    }
    return `${text}\ntest_policy:\n  granularity: ${flags.granularity}\n`;
  }
  return text;
}

export async function run({ projectRoot, argv }) {
  const [sub, ...rest] = argv;
  const flags = Object.fromEntries(
    rest.reduce((acc, v, i, a) => (v.startsWith("--") ? [...acc, [v.slice(2), a[i + 1]]] : acc), []),
  );
  // loadManifest() throws INVALID_PROJECT_ROOT when .context-index/manifest.yaml is absent
  // (lib/manifest.mjs). Every downstream branch already reads manifest via `manifest?.` optional
  // chaining, so a fixture-less test project (no manifest.yaml at all) must still resolve — load
  // lazily and degrade to `undefined` rather than letting the whole verb throw before dispatch.
  let manifest;
  try {
    manifest = loadManifest(projectRoot);
  } catch {
    manifest = undefined;
  }

  switch (sub) {
    case "resolve": {
      assertTaskId(flags["task-id"]);
      assertNotWorkspaceRoot(projectRoot);
      const { planAbs, specRel } = specRelFromPlan(projectRoot, flags.plan); // also validates PATH_OUTSIDE_ROOT
      const { targetPaths, available } = await readTaskFiles(planAbs, flags["task-id"]);
      // lookupRoutingEntry throws ROUTING_SIDECAR_MISSING whenever <plan-stem>.routing.json is
      // absent — the NORMAL case unless /adev:route already ran (spec Preconditions: "Its
      // absence means no escalation — a defined outcome, not an error"). Must degrade, not crash.
      let routingEntry;
      try {
        routingEntry = lookupRoutingEntry(planAbs, flags["task-id"]);
      } catch {
        routingEntry = undefined;
      }
      const spec = loadOwningSpec(projectRoot, specRel);
      const assignment = resolveTestDepth({
        spec,
        riskLevel: spec.risk_level ?? "medium",
        policies: loadRigorPolicies(projectRoot) ?? {}, // risk-policies.yaml's test_depth per level — NOT a manifest.yaml field
        moduleOverride: moduleOverrideFor(manifest, targetPaths),
        domainDefault: manifest?.test_policy?.domain_default,
        routingScore: routingEntry?.scores,
        escalationRules: manifest?.test_policy?.escalation_rules ?? [],
        escalationEnabled: manifest?.test_policy?.escalation ?? true,
        boundaryCrossing: boundaryCrossingFor(projectRoot, targetPaths),
        targetPaths,
        sensitivePaths: effectiveSensitivePaths(manifest?.sensitive_paths),
      });
      appendEvent(projectRoot, specRel, {
        event: "test_depth_assigned",
        plan: flags.plan, task_id: flags["task-id"],
        depth: assignment.depth, source: assignment.source,
        escalated: assignment.escalated, escalation_skipped: assignment.escalation_skipped,
        floor_applied: assignment.floor_applied, floor_legs: assignment.floor_legs,
        floor_inputs: available ? "available" : "unavailable",
      });
      return assignment;
    }
    case "assert-assigned": {
      const { specRel } = specRelFromPlan(projectRoot, flags.plan);
      const events = readEvents(projectRoot, specRel).filter(
        (e) => e.event === "test_depth_assigned" && e.plan === flags.plan && e.task_id === flags["task-id"],
      );
      if (events.length === 0) {
        const err = new Error(`MISSING_DEPTH_ASSIGNMENT: no test_depth_assigned event for ${flags.plan}#${flags["task-id"]}`);
        err.code = "MISSING_DEPTH_ASSIGNMENT";
        throw err;
      }
      return { ok: true };
    }
    case "explain": {
      const { specRel } = specRelFromPlan(projectRoot, flags.plan);
      const events = readEvents(projectRoot, specRel).filter(
        (e) => e.event === "test_depth_assigned" && e.plan === flags.plan && e.task_id === flags["task-id"],
      );
      if (events.length === 0) return { code: "NO_RECORDED_ASSIGNMENT" };
      const last = events[events.length - 1];
      return {
        depth: last.depth, source: last.source, escalated: last.escalated,
        escalation_skipped: last.escalation_skipped,
        floor_applied: last.floor_applied, floor_legs: last.floor_legs,
        floor_inputs: last.floor_inputs,
      };
    }
    case "show": {
      // resolveGranularity() already returns { granularity, source } — return it directly under
      // the `granularity` key rather than re-wrapping, so callers read `result.granularity` (a
      // string) and `result.granularity.source`, not the double-nested `result.granularity.granularity`.
      const granularity = resolveGranularity({
        moduleOverride: flags.module
          ? manifest?.modules?.find((m) => m.slug === flags.module)?.test_policy?.granularity
          : undefined,
        manifestPolicy: manifest?.test_policy?.granularity,
        domainDefault: manifest?.test_policy?.domain_default,
      });
      return {
        granularity: granularity.granularity,
        granularity_source: granularity.source,
        test_depth: flags.module
          ? { value: manifest?.modules?.find((m) => m.slug === flags.module)?.test_depth, source: "module" }
          : undefined,
        sensitive_paths: {
          built_in: DEFAULT_SENSITIVE_PATHS,
          configured: manifest?.sensitive_paths ?? [],
        },
      };
    }
    case "set": {
      assertNotWorkspaceRoot(projectRoot);
      if (flags.module) {
        const mod = manifest?.modules?.find((m) => m.slug === flags.module);
        if (!mod || !/^[a-z0-9][a-z0-9-]*$/.test(flags.module)) {
          const err = new Error(`UNKNOWN_POLICY_MODULE: '${flags.module}' is not a valid or existing module slug`);
          err.code = "UNKNOWN_POLICY_MODULE";
          throw err;
        }
      }
      const manifestPath = assertContained(projectRoot, ".context-index/manifest.yaml");
      const original = readFileSync(manifestPath, "utf8");
      const edited = applyTestPolicyEdit(original, flags); // targeted text substitution — see note below
      const tmpPath = `${manifestPath}.tmp-${process.pid}`;
      writeFileSync(tmpPath, edited);
      // Round-trip verify: re-parse the edited text and confirm the target field now holds the
      // intended value, and that every OTHER top-level key still parses identically to before.
      const before = parseYaml(original);
      const after = parseYaml(readFileSync(tmpPath, "utf8"));
      const targetOk = flags.module
        ? after.modules.find((m) => m.slug === flags.module)?.test_depth === flags.test_depth
        : after.test_policy?.granularity === flags.granularity;
      const untouchedKeysOk = Object.keys(before)
        .filter((k) => k !== "modules" && k !== "test_policy")
        .every((k) => JSON.stringify(before[k]) === JSON.stringify(after[k]));
      if (!targetOk || !untouchedKeysOk) {
        throw new Error("test-policy set: round-trip verification failed; manifest.yaml left byte-identical (temp file discarded, no rename)");
      }
      renameSync(tmpPath, manifestPath);
      return { ok: true };
    }
    default:
      throw new Error(`unknown test-policy subcommand: ${sub}`);
  }
}

export function help() {
  return "usage: adev test-policy <resolve|assert-assigned|show|set|explain> [flags]";
}
```

**Note on `boundaries.yaml` pattern semantics:** the shipped `boundaries.yaml` schema documents
`pattern` as a regex matched against file *content* (e.g. `import.*from.*prisma`) in its existing
consumers. This CLI verb instead matches `pattern` as a regex against each *path string* in
`targetPaths`, since `resolve` never reads file contents (only declared paths). This is a narrower
interpretation than other `boundaries.yaml` consumers may use — call this out explicitly in the
verb's `--help` text and in `docs/cli-reference.md` (Task 19) so operators don't expect content
matching from this specific check.

- [ ] **Verify test passes**

Run: `node --test tests/cli/test-policy.test.mjs`
Expected: PASS — all 14 cases: the 6 base cases (task-id validation, containment, resolve/
assert-assigned/explain happy paths), the 6 chain-input-wiring cases (spec-declared, module
override, boundary crossing, `show`, `set` × 2), and the 2 degrade-not-crash cases added after
round-3 review (missing `.routing.json` sidecar, `risk-policies.yaml` consulted via
`loadRigorPolicies` rather than a nonexistent `manifest.risk_policies` field)

- [ ] **Commit**

```bash
git add lib/cli/test-policy.mjs cli/index.mjs tests/cli/test-policy.test.mjs
git commit -m "feat(cli): add adev test-policy resolve/assert-assigned/explain verb

Spec: .context-index/specs/features/test-strategies/test-depth-policy.spec.md
Plan-task: 8"
```

---

### Task 9: Suite Path Resolution (`resolveSuitePath`) [specialist: none]

**Charter capability:** Test Depth Policy
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Create: `lib/test-strategies/suite-path.mjs`
- Test: `tests/lib/test-strategies/suite-path.test.mjs`

**Tests:** `tests/lib/test-strategies/suite-path.test.mjs`

**Context to load:**
- Spec Behavior 3, Known Limitations "Depth is not reconciled across tasks sharing a suite"
- Task 3 output (`resolveGranularity`)

- [ ] **Write failing test**

```javascript
// tests/lib/test-strategies/suite-path.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSuitePath } from "../../../lib/test-strategies/suite-path.mjs";

test("per-task granularity always proposes a new suite path", () => {
  const r = resolveSuitePath({ granularity: "per-task", behaviorSlug: "resolve-depth", existingSuites: ["tests/foo.test.mjs"] });
  assert.equal(r.action, "create");
});

test("per-behavior granularity reuses an existing suite covering the behavior", () => {
  const r = resolveSuitePath({
    granularity: "per-behavior", behaviorSlug: "resolve-depth",
    existingSuites: ["tests/lib/test-strategies/depth.test.mjs"],
    behaviorSuiteIndex: { "resolve-depth": "tests/lib/test-strategies/depth.test.mjs" },
  });
  assert.equal(r.action, "extend");
  assert.equal(r.path, "tests/lib/test-strategies/depth.test.mjs");
});

test("per-spec granularity proposes one suite for the whole spec", () => {
  const r = resolveSuitePath({ granularity: "per-spec", specSlug: "test-depth-policy", existingSuites: [] });
  assert.equal(r.action, "create");
  assert.match(r.path, /test-depth-policy/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/test-strategies/suite-path.test.mjs`
Expected: FAIL — module not found

- [ ] **Implement**

```javascript
// lib/test-strategies/suite-path.mjs
export function resolveSuitePath({ granularity, behaviorSlug, specSlug, existingSuites = [], behaviorSuiteIndex = {} }) {
  if (granularity === "per-behavior" && behaviorSuiteIndex[behaviorSlug]) {
    return { action: "extend", path: behaviorSuiteIndex[behaviorSlug] };
  }
  if (granularity === "per-spec") {
    const existing = existingSuites.find((p) => p.includes(specSlug));
    return existing ? { action: "extend", path: existing } : { action: "create", path: `tests/specs/${specSlug}.test.mjs` };
  }
  return { action: "create", path: undefined };
}
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/test-strategies/suite-path.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/test-strategies/suite-path.mjs tests/lib/test-strategies/suite-path.test.mjs
git commit -m "feat(test-strategies): add resolveSuitePath for granularity-driven suite reuse

Spec: .context-index/specs/features/test-strategies/test-depth-policy.spec.md
Plan-task: 9"
```

---

### Task 10: Plan Integration — Granularity-Driven `**Tests:**` Emission [specialist: none]

**Charter capability:** Test Depth Policy
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3, Task 9
**Files:**
- Modify: `skills/plan/SKILL.md` (Strategy Assignment / Strategy Summary region, ~L494-620)
- Test: `tests/skills/plan-test-depth-integration.test.mjs`

**Tests:** `tests/skills/plan-test-depth-integration.test.mjs`

**Context to load:**
- Spec Behaviors 1, 2, 3
- Current `skills/plan/SKILL.md` Strategy Assignment (~L494) and Task Structure `**Files:**`/`**Tests:**` (~L608,613) sections

- [ ] **Write failing test**

```javascript
// tests/skills/plan-test-depth-integration.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const skill = readFileSync(new URL("../../skills/plan/SKILL.md", import.meta.url), "utf8");

test("plan SKILL.md documents granularity-driven Tests: field emission", () => {
  assert.match(skill, /### Granularity Assignment/);
  assert.match(skill, /resolveGranularity/);
});

test("plan SKILL.md still mandates a **Files:** block on every emitted task (Behavior 2)", () => {
  assert.match(skill, /every task .*carries its own \*\*Files:\*\* block/i);
});

test("plan SKILL.md instructs an 'extend' wording when a suite already covers the behavior", () => {
  assert.match(skill, /extend/i);
});

test("plan SKILL.md contains no inline-Node or eval in the new section", () => {
  const section = skill.slice(skill.indexOf("### Granularity Assignment"));
  assert.doesNotMatch(section, /node -e|node --input-type=module -e/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/plan-test-depth-integration.test.mjs`
Expected: FAIL — `### Granularity Assignment` section does not exist yet

- [ ] **Implement**

Add a `### Granularity Assignment` section to `skills/plan/SKILL.md` immediately after
`### Strategy Assignment` (~L494), describing (as prose that names the CLI-verb-free
`resolveGranularity()` output — control flow stays in `lib/`, per the constitution's
descriptive-reference rule): resolve granularity once for the whole plan (module override >
manifest > domain > fallback), then for each task's `**Tests:**` field:
- `per-task`: one new suite path per task (current shipped behavior, unchanged)
- `per-behavior`: one suite path per spec behavior statement; tasks implementing an
  already-covered behavior get "extend `<path>`" instead of "create"
- `per-spec`: one suite path for the whole spec

Every task still emits its own `**Files:**` block regardless of granularity (Behavior 2 — this
requirement is unconditional and pre-existing).

- [ ] **Verify test passes**

Run: `node --test tests/skills/plan-test-depth-integration.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/plan/SKILL.md tests/skills/plan-test-depth-integration.test.mjs
git commit -m "feat(plan): emit Tests: fields per granularity chain

Spec: .context-index/specs/features/test-strategies/test-depth-policy.spec.md
Plan-task: 10"
```

---

### Task 11: Implement Integration — `resolve` + `assert-assigned` [specialist: none]

**Charter capability:** Test Depth Policy
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 8
**Files:**
- Modify: `skills/implement/SKILL.md:360-378`
- Test: `tests/skills/implement-test-depth-integration.test.mjs`

**Tests:** `tests/skills/implement-test-depth-integration.test.mjs`

**Context to load:**
- Spec Ownership section (full), Behavior 14
- `skills/implement/SKILL.md:360-372` ("Domain-Aware Test Config" sub-step — wiring pattern to mirror)

- [ ] **Write failing test**

```javascript
// tests/skills/implement-test-depth-integration.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const skill = readFileSync(new URL("../../skills/implement/SKILL.md", import.meta.url), "utf8");

test("implement SKILL.md calls adev test-policy resolve before write-test dispatch", () => {
  assert.match(skill, /adev test-policy resolve/);
});

test("implement SKILL.md calls adev test-policy assert-assigned after accepting a suite", () => {
  assert.match(skill, /adev test-policy assert-assigned/);
});

test("implement SKILL.md fails the step with MISSING_DEPTH_ASSIGNMENT on a missing event", () => {
  assert.match(skill, /MISSING_DEPTH_ASSIGNMENT/);
});

test("implement SKILL.md passes the resolved depth into the write-test subagent prompt", () => {
  assert.match(skill, /resolved depth into the write-test/i);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/implement-test-depth-integration.test.mjs`
Expected: FAIL — none of the four strings present yet

- [ ] **Implement**

In `skills/implement/SKILL.md`, in the same numbered sub-step as the existing "Domain-Aware Test
Config" block (~L360-372), add a parallel block: before dispatching the write-test subagent, run
`adev test-policy resolve --plan <plan-path> --task-id <task-id>`, capture the JSON `depth` field,
and pass it into the write-test subagent's prompt alongside `config.permitted_tools` /
`config.skip_patterns`. After the write-test subagent hands back a suite and it is accepted, run
`adev test-policy assert-assigned --plan <plan-path> --task-id <task-id>`; a non-zero exit fails
the write-test step for that task with `MISSING_DEPTH_ASSIGNMENT` rather than passing silently.

- [ ] **Verify test passes**

Run: `node --test tests/skills/implement-test-depth-integration.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/implement/SKILL.md tests/skills/implement-test-depth-integration.test.mjs
git commit -m "feat(implement): call test-policy resolve and assert-assigned per task

Spec: .context-index/specs/features/test-strategies/test-depth-policy.spec.md
Plan-task: 11"
```

---

### Task 12: Write-Test Standalone Depth Pin + Gaming-Blocker Depth-Invariance [specialist: none]

**Charter capability:** Test Depth Policy
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 11
**Files:**
- Modify: `skills/write-test/SKILL.md:15-27` (Step 0: Standalone Pre-flight)
- Modify: `tests/lib/test-strategies/depth.test.mjs` (append — file created and owned by Task 6; this task adds one Behavior-19 assertion, does not recreate it)
- Test: `tests/skills/write-test-standalone-depth.test.mjs`

**Tests:** `tests/skills/write-test-standalone-depth.test.mjs`, `tests/lib/test-strategies/depth.test.mjs` (appended)

**Context to load:**
- Spec Behavior 17 (full), Behavior 19 (full — "the full cross-strategy and strategy-profile
  blocker set applies regardless of resolved depth")
- `skills/write-test/SKILL.md:15-27`
- `lib/test-strategies/gaming.mjs` (full read — `detectSharedGamingPatterns`, `SHARED_PATTERNS`;
  confirm the blocker set takes no `depth` parameter anywhere in its signature)

- [ ] **Write failing test**

```javascript
// tests/skills/write-test-standalone-depth.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const skill = readFileSync(new URL("../../skills/write-test/SKILL.md", import.meta.url), "utf8");
const preflight = skill.slice(skill.indexOf("## Step 0: Standalone Pre-flight"));

test("standalone pre-flight pins depth to the built-in standard", () => {
  assert.match(preflight, /built-in `standard`/);
});

test("standalone pre-flight performs no chain resolution, escalation, or floor evaluation", () => {
  assert.match(preflight, /no (chain resolution|policy)/i);
});

test("standalone mode emits no test_depth_assigned event", () => {
  assert.match(preflight, /no test_depth_assigned event/);
});

test("write-test SKILL.md states the gaming-blocker set is identical at every depth (Behavior 19)", () => {
  assert.match(skill, /gaming.{0,40}(blocker|pattern).{0,80}(regardless of|identical|invariant).{0,40}depth/is);
});
```

```javascript
// appended to tests/lib/test-strategies/depth.test.mjs (from Task 6) — Behavior 19 lives here
// because gaming-blocker invariance is a property of the SAME suite scanned at every depth, not
// a write-test-specific rule; asserting it against the shared blocker registry directly is more
// robust than asserting SKILL.md prose alone.
import { SHARED_PATTERNS, detectSharedGamingPatterns } from "../../../lib/test-strategies/gaming.mjs";

test("detectSharedGamingPatterns() and SHARED_PATTERNS take no depth parameter — blocker set is depth-invariant by construction", () => {
  assert.equal(detectSharedGamingPatterns.length <= 1, true); // arity: (suiteText) only, no depth arg
  assert.ok(Array.isArray(SHARED_PATTERNS) && SHARED_PATTERNS.length > 0);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/write-test-standalone-depth.test.mjs tests/lib/test-strategies/depth.test.mjs`
Expected: FAIL — Step 0 does not mention depth pinning or gaming-blocker invariance yet; the
appended `depth.test.mjs` assertion itself passes trivially (it asserts a pre-existing, unmodified
export's arity) but is included here for completeness of the RED→GREEN record

- [ ] **Implement**

Add a short paragraph to `## Step 0: Standalone Pre-flight` in `skills/write-test/SKILL.md`:
standalone invocation (`--red --spec`, `--red --file`, `--red "<description>"`, with or without
`.context-index/`) authors at the built-in `standard` depth unconditionally. It performs no chain
resolution, no escalation, and no floor evaluation, and emits no `test_depth_assigned` event —
there is no plan task to key one to. When dispatched from `/adev:implement` (non-standalone), the
depth passed in the subagent prompt (Task 11) is authoritative instead.

Add one more sentence (Behavior 19): depth selects which case classes the RED phase authors; it
never selects which gaming detectors run. The blocker sets in `lib/test-strategies/gaming.mjs`
are content scanners over whatever tests exist and apply identically regardless of resolved
depth — a suite authored at `minimal` is scanned by the same blocker set as one authored at
`thorough`. This is a documentation-only change: `lib/test-strategies/gaming.mjs` itself is
correctly unmodified by this plan (its functions already take no depth parameter), so the
`depth.test.mjs` addition is a locked-in-place assertion, not new behavior.

- [ ] **Verify test passes**

Run: `node --test tests/skills/write-test-standalone-depth.test.mjs tests/lib/test-strategies/depth.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/write-test/SKILL.md tests/skills/write-test-standalone-depth.test.mjs \
        tests/lib/test-strategies/depth.test.mjs
git commit -m "feat(write-test): pin standalone mode to standard depth; document gaming-blocker depth-invariance

Spec: .context-index/specs/features/test-strategies/test-depth-policy.spec.md
Plan-task: 12"
```

---

### Task 13: Status Integration — Event-Based Completion Counting [specialist: none]

**Charter capability:** Test Depth Policy
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 7
**Files:**
- Modify: `skills/status/SKILL.md` (Mode `--spec`, item 8, ~L60)
- Test: `tests/cli/status-test-depth-counting.test.mjs`

**Tests:** `tests/cli/status-test-depth-counting.test.mjs`

**Context to load:**
- Spec Behavior 18
- `skills/status/SKILL.md` Mode `--spec` item 8, `lib/cli/state.mjs:1-40` (`adev state current --spec <path>`)
- `.context-index/specs/features/spec-lifecycle/plan-test-mapping.spec.md:36` (Behavior 3 — the rule being replaced; superseded formally in Task 18)

- [ ] **Write failing test**

```javascript
// tests/cli/status-test-depth-counting.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const skill = readFileSync(new URL("../../skills/status/SKILL.md", import.meta.url), "utf8");

test("status SKILL.md counts completion via adev state current, not file existence", () => {
  assert.match(skill, /adev state current --spec/);
});

test("status SKILL.md no longer instructs a raw test-file-existence check for completion", () => {
  const item8Region = skill.slice(skill.indexOf("Check if test files exist"), skill.indexOf("Check if test files exist") + 300);
  assert.equal(item8Region.startsWith("Check if test files exist"), false);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/status-test-depth-counting.test.mjs`
Expected: FAIL — item 8 still reads "Check if test files exist for this spec..."

- [ ] **Implement**

Replace item 8 in `skills/status/SKILL.md`'s Mode `--spec` list with: run
`adev state current --spec <path>` and read the returned `planTasks` projection; report
completion as "`<N>`/`<total>` tasks with a recorded assignment" derived from `plan_task` and
`test_depth_assigned` events rather than filesystem existence checks — this is required because
under non-`per-task` granularity, N tasks can share one suite path, so "does the file exist" no
longer maps 1:1 to "is this task done."

- [ ] **Verify test passes**

Run: `node --test tests/cli/status-test-depth-counting.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/status/SKILL.md tests/cli/status-test-depth-counting.test.mjs
git commit -m "feat(status): count task completion from lifecycle events, not file existence

Spec: .context-index/specs/features/test-strategies/test-depth-policy.spec.md
Plan-task: 13"
```

---

### Task 14: Init Integration — `test_policy` / `test_depth` Emission [specialist: none]

**Charter capability:** Test Depth Policy
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3, Task 4
**Files:**
- Modify: `skills/init/SKILL.md:213,441`
- Modify: `templates/manifest-template.yaml`
- Modify: `templates/risk-policies-template.yaml` (already touched in Task 4 — confirm `test_depth` values are literal, not placeholders)
- Test: `tests/skills/init-test-policy-emission.test.mjs`

**Tests:** `tests/skills/init-test-policy-emission.test.mjs`

**Context to load:**
- Spec Behaviors 10, 11
- `skills/init/SKILL.md:44-47` (`{{ }}` placeholder-guard precedent)

- [ ] **Write failing test**

```javascript
// tests/skills/init-test-policy-emission.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const skill = readFileSync(new URL("../../skills/init/SKILL.md", import.meta.url), "utf8");
const manifestTemplate = readFileSync(new URL("../../templates/manifest-template.yaml", import.meta.url), "utf8");

test("init SKILL.md emits literal test_policy.granularity into manifest.yaml", () => {
  assert.match(skill, /test_policy/);
  assert.match(skill, /granularity/);
});

test("init SKILL.md guards against an unsubstituted {{ }} placeholder with UNSUBSTITUTED_POLICY_PLACEHOLDER", () => {
  assert.match(skill, /UNSUBSTITUTED_POLICY_PLACEHOLDER/);
});

test("init SKILL.md does not emit sensitive-paths.yaml on greenfield init", () => {
  assert.match(skill, /does not.*sensitive-paths\.yaml|built-in default applies/i);
});

test("init --brownfield proposes inferred granularity with evidence", () => {
  assert.match(skill, /inferGranularity|inferred granularity/i);
});

test("manifest-template.yaml carries no unfilled test_policy placeholder", () => {
  if (manifestTemplate.includes("test_policy")) {
    assert.doesNotMatch(manifestTemplate.slice(manifestTemplate.indexOf("test_policy")), /\{\{\s*\}\}/);
  }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/init-test-policy-emission.test.mjs`
Expected: FAIL — none of the markers present yet

- [ ] **Implement**

- In `skills/init/SKILL.md` (near L213/L441 risk-policies.yaml emission), add: on greenfield,
  write a literal `test_policy: { granularity: per-behavior, escalation: true }` block into
  `manifest.yaml`, and literal `test_depth` per risk level into `risk-policies.yaml` (values, not
  `{{ }}` placeholders). Extend the existing L44-47 placeholder-guard prose to also check the new
  block, failing init with `UNSUBSTITUTED_POLICY_PLACEHOLDER` naming the offending field if an
  unsubstituted `{{ }}` or a commented-out policy line is detected. Do not emit
  `sensitive-paths.yaml` — the built-in default applies until the project opts to extend it.
- On `--brownfield`, call `inferGranularity(projectRoot, sourceRoots)` (spec's Interface
  Contract row — implement as a small addition alongside Task 3's `policy.mjs`, or as a follow-up
  if `inferGranularity` needs its own dedicated task; note this in the task's commit message if
  split out) and propose the inferred value, labelled "inferred" with the evidence named, falling
  back to the domain default with a stated reason when no suite exists.
- Add `test_policy:` scaffold to `templates/manifest-template.yaml` with literal (non-placeholder)
  default values.

- [ ] **Verify test passes**

Run: `node --test tests/skills/init-test-policy-emission.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/init/SKILL.md templates/manifest-template.yaml templates/risk-policies-template.yaml \
        tests/skills/init-test-policy-emission.test.mjs
git commit -m "feat(init): emit test_policy and test_depth on greenfield and brownfield init

Spec: .context-index/specs/features/test-strategies/test-depth-policy.spec.md
Plan-task: 14"
```

---

### Task 15: Specify Frontmatter — `test_depth:` [specialist: none]

**Charter capability:** Test Depth Policy
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/specify/SKILL.md` (shared frontmatter section)
- Test: `tests/skills/specify-test-depth-frontmatter.test.mjs`

**Tests:** `tests/skills/specify-test-depth-frontmatter.test.mjs`

**Context to load:**
- Spec Actionable Task Map row "Extend specify frontmatter contract"
- `skills/specify/SKILL.md` shared frontmatter section (referenced at L422, L710, L804, L880)

- [ ] **Write failing test**

```javascript
// tests/skills/specify-test-depth-frontmatter.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const skill = readFileSync(new URL("../../skills/specify/SKILL.md", import.meta.url), "utf8");

test("specify SKILL.md documents test_depth: as legal frontmatter alongside test_strategy:", () => {
  assert.match(skill, /test_depth:/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/specify-test-depth-frontmatter.test.mjs`
Expected: FAIL — `test_depth:` not yet mentioned

- [ ] **Implement**

Locate the shared frontmatter section in `skills/specify/SKILL.md` (the block referenced
generically from each mode section) and add `test_depth:` (optional, `minimal | standard |
thorough`) alongside the existing `test_strategy:` field, with a one-line description: "overrides
the depth chain's stage 1 (spec-declared) — see test-depth-policy.spec.md."

- [ ] **Verify test passes**

Run: `node --test tests/skills/specify-test-depth-frontmatter.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/specify/SKILL.md tests/skills/specify-test-depth-frontmatter.test.mjs
git commit -m "feat(specify): accept test_depth: as legal spec frontmatter

Spec: .context-index/specs/features/test-strategies/test-depth-policy.spec.md
Plan-task: 15"
```

---

### Task 16: Hygiene Test-Policy Drift Pass [specialist: none]

**Charter capability:** Test Depth Policy
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 7, Task 8
**Files:**
- Modify: `skills/hygiene/SKILL.md` (new pass after Audit Pass 21, ~L1002)
- Test: `tests/skills/hygiene-test-policy-drift-pass.test.mjs`

**Tests:** `tests/skills/hygiene-test-policy-drift-pass.test.mjs`

**Context to load:**
- Spec Behavior 20
- `skills/hygiene/SKILL.md` Audit Pass 12 step 1 (~L512-518, `specs/features/` scan pattern)

- [ ] **Write failing test**

```javascript
// tests/skills/hygiene-test-policy-drift-pass.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const skill = readFileSync(new URL("../../skills/hygiene/SKILL.md", import.meta.url), "utf8");

test("hygiene SKILL.md adds an Audit Pass reporting floor_inputs: unavailable tasks", () => {
  assert.match(skill, /## Audit Pass 22/);
  assert.match(skill, /floor_inputs.*unavailable/s);
});

test("new pass names the plan and task id for each flagged task", () => {
  const passStart = skill.indexOf("## Audit Pass 22");
  const passBody = skill.slice(passStart, passStart + 1500);
  assert.match(passBody, /plan/i);
  assert.match(passBody, /task[_ ]id/i);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/hygiene-test-policy-drift-pass.test.mjs`
Expected: FAIL — `## Audit Pass 22` does not exist

- [ ] **Implement**

Add `## Audit Pass 22: Test-Policy Drift` to `skills/hygiene/SKILL.md` after the existing
`## Audit Pass 21: Amendment Graph` (~L1002), mirroring Audit Pass 12's `specs/features/` scan
structure: for every spec with a plan, read the most recent `test_depth_assigned` event per task
via `adev state events --spec <path> --event test_depth_assigned`; report every task whose most
recent event records `floor_inputs: "unavailable"`, naming the plan path and task id, as the
third visibility mechanism the spec's Behavior 8 decision note relies on (alongside `explain` and
the event field itself).

- [ ] **Verify test passes**

Run: `node --test tests/skills/hygiene-test-policy-drift-pass.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/hygiene/SKILL.md tests/skills/hygiene-test-policy-drift-pass.test.mjs
git commit -m "feat(hygiene): add test-policy drift pass for floor_inputs: unavailable tasks

Spec: .context-index/specs/features/test-strategies/test-depth-policy.spec.md
Plan-task: 16"
```

---

### Task 17: Self-Hosting `sensitive-paths.yaml` [specialist: none]

**Charter capability:** Test Depth Policy
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Create: `.context-index/governance/sensitive-paths.yaml`
- Test: `tests/lib/governance/sensitive-paths-self-hosting.test.mjs`

**Tests:** `tests/lib/governance/sensitive-paths-self-hosting.test.mjs`

**Context to load:**
- Spec "Self-hosting note" (Configuration Schema section)

- [ ] **Write failing test**

```javascript
// tests/lib/governance/sensitive-paths-self-hosting.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { parseYaml } from "../../../lib/profiles/yaml.mjs"; // the project's only YAML tool — a parser, no serializer (see Task 8's note)

const PATH = new URL("../../../.context-index/governance/sensitive-paths.yaml", import.meta.url);

test("adev's own sensitive-paths.yaml exists", () => {
  assert.ok(existsSync(PATH));
});

test("it extends the default with lib/test-strategies/**, lib/governance/**, and lib/lifecycle-events.mjs", () => {
  const doc = parseYaml(readFileSync(PATH, "utf8"));
  assert.ok(doc.sensitive_paths.includes("lib/test-strategies/**"));
  assert.ok(doc.sensitive_paths.includes("lib/governance/**"));
  assert.ok(doc.sensitive_paths.includes("lib/lifecycle-events.mjs"));
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/governance/sensitive-paths-self-hosting.test.mjs`
Expected: FAIL — file does not exist

- [ ] **Implement**

```yaml
# .context-index/governance/sensitive-paths.yaml — OPTIONAL and EXTEND-ONLY.
# The effective set is DEFAULT_SENSITIVE_PATHS ∪ these entries.
#
# adev's own repository extends the shipped default with the policy
# implementation itself — the highest-leverage change class in THIS repo,
# not in a consumer repo (where these paths would be wrong defaults).
sensitive_paths:
  - "lib/test-strategies/**"
  - "lib/governance/**"
  - "lib/lifecycle-events.mjs"
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/governance/sensitive-paths-self-hosting.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add .context-index/governance/sensitive-paths.yaml tests/lib/governance/sensitive-paths-self-hosting.test.mjs
git commit -m "chore(governance): extend sensitive-paths.yaml with adev's own policy implementation

Spec: .context-index/specs/features/test-strategies/test-depth-policy.spec.md
Plan-task: 17"
```

---

### Task 18: Amend `plan-test-mapping.spec.md` [specialist: none]

**Charter capability:** Test Depth Policy
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 13
**Files:**
- Create: amendment artifact scaffolded by `adev specify amend` (co-located under
  `.context-index/specs/features/spec-lifecycle/`)
- Test: `tests/specs/plan-test-mapping-amendment.test.mjs`

**Tests:** `tests/specs/plan-test-mapping-amendment.test.mjs`

**Context to load:**
- Spec Behavior 18 (last sentence), `.context-index/specs/cross-cutting/spec-amendment-artifacts.spec.md` (full — Behaviors 1-4)
- `.context-index/specs/features/spec-lifecycle/plan-test-mapping.spec.md:36` (Behavior 3)

- [ ] **Write failing test**

```javascript
// tests/specs/plan-test-mapping-amendment.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";

const dir = new URL("../../.context-index/specs/features/spec-lifecycle/", import.meta.url);

test("an amendment artifact against plan-test-mapping.spec.md exists", () => {
  const files = readdirSync(dir).filter((f) => f.startsWith("plan-test-mapping-") && f.endsWith(".spec.md"));
  assert.ok(files.length > 0, "expected a plan-test-mapping-rev-*-*.spec.md amendment file");
});

test("the base spec's lifecycle log recorded a spec_amended event", () => {
  const log = readFileSync(
    new URL("../../.context-index/lifecycle-state/plan-test-mapping.jsonl", import.meta.url),
    "utf8",
  );
  assert.match(log, /"event":"spec_amended"/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/specs/plan-test-mapping-amendment.test.mjs`
Expected: FAIL — no amendment file, no `spec_amended` event

- [ ] **Implement**

Run `adev specify amend --base .context-index/specs/features/spec-lifecycle/plan-test-mapping.spec.md`
per the `spec-amendment-artifacts.spec.md` protocol (Behaviors 1-4): this scaffolds a co-located
`plan-test-mapping-rev-<N>-test-depth-granularity.spec.md` with `amends:` / `target-revision:`
frontmatter, and emits `spec_amended` on the base spec's lifecycle log. Author the amendment body
to state plainly that Behavior 3's "checks whether the referenced test files exist" counting rule
is superseded for any project using non-`per-task` granularity, replaced by plan-task
lifecycle-event counting (Behavior 18 of `test-depth-policy.spec.md`), and that `per-task`
granularity is unaffected (file-existence counting remains valid there since suites are 1:1 with
tasks).

- [ ] **Verify test passes**

Run: `node --test tests/specs/plan-test-mapping-amendment.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add .context-index/specs/features/spec-lifecycle/ .context-index/lifecycle-state/plan-test-mapping.jsonl \
        tests/specs/plan-test-mapping-amendment.test.mjs
git commit -m "docs(spec-lifecycle): amend plan-test-mapping.spec.md Behavior 3 for granularity

Spec: .context-index/specs/features/test-strategies/test-depth-policy.spec.md
Plan-task: 18"
```

---

### Task 19: Documentation [specialist: none]

**Charter capability:** Test Depth Policy
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1 through Task 18
**Files:**
- Modify: `docs/test-strategies.md`, `docs/governance.md`, `docs/configuration.md`, `docs/cli-reference.md`, `docs/getting-started.md`, `docs/README.md`
- Test: `tests/docs/test-depth-policy-docs.test.mjs`

**Tests:** `tests/docs/test-depth-policy-docs.test.mjs`

**Context to load:**
- Spec Documentation Requirements table (full)
- Current `docs/test-strategies.md` `## Priority chain` section (extend, do not replace)

- [ ] **Write failing test**

```javascript
// tests/docs/test-depth-policy-docs.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(p) {
  return readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
}

test("docs/test-strategies.md states plainly that the floor is advisory", () => {
  assert.match(read("docs/test-strategies.md"), /floor is advisory/i);
});

test("docs/governance.md documents test_depth and the advisory-floor statement", () => {
  const doc = read("docs/governance.md");
  assert.match(doc, /test_depth/);
  assert.match(doc, /advisory/i);
});

test("docs/configuration.md documents the test_policy block and escalation grammar", () => {
  const doc = read("docs/configuration.md");
  assert.match(doc, /test_policy/);
  assert.match(doc, /escalation_rules/);
});

test("docs/cli-reference.md documents all five adev test-policy subcommands", () => {
  const doc = read("docs/cli-reference.md");
  for (const sub of ["resolve", "assert-assigned", "show", "set", "explain"]) {
    assert.match(doc, new RegExp(`test-policy ${sub}|test-policy \\| .*${sub}`));
  }
});

test("docs/getting-started.md explains what init asks about test_policy", () => {
  assert.match(read("docs/getting-started.md"), /test_policy|granularity/);
});

test("docs/README.md indexes the updated pages", () => {
  const readme = read("docs/README.md");
  for (const page of ["test-strategies.md", "governance.md", "configuration.md", "cli-reference.md", "getting-started.md"]) {
    assert.match(readme, new RegExp(page.replace(".", "\\.")));
  }
});

test("upgrade note states fewer test files, per-task opt-out, and no new required config file", () => {
  const doc = read("docs/test-strategies.md");
  assert.match(doc, /fewer test files/i);
  assert.match(doc, /per-task/);
  assert.match(doc, /no new config file|no new file/i);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/docs/test-depth-policy-docs.test.mjs`
Expected: FAIL — none of the six docs mention the new capability yet

- [ ] **Implement**

Per the spec's Documentation Requirements table, update each of the six files with exactly the
content it specifies (both axes, both chains, the two monotonic passes, escalation-upward
rationale, standalone write-test behavior, worked per-granularity examples, the advisory-floor
statement, the `test_policy` block reference, all five CLI subcommands with the two `explain`
floor facets, what init asks, and accurate `docs/README.md` index entries). Verify every
documented default (e.g. `per-behavior` fallback, `standard` depth fallback, `escalation: true`)
against the shipped values in `lib/test-strategies/policy.mjs` and `lib/test-strategies/depth.mjs`
rather than transcribing from the spec — this task runs last precisely so the shipped code is the
source of truth. Do not use documentation prose as a substitute for enforcement; the tests above
check structural presence of required topics, not string-match the prose as a proxy for runtime
behavior.

- [ ] **Verify test passes**

Run: `node --test tests/docs/test-depth-policy-docs.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add docs/test-strategies.md docs/governance.md docs/configuration.md \
        docs/cli-reference.md docs/getting-started.md docs/README.md \
        tests/docs/test-depth-policy-docs.test.mjs
git commit -m "docs: document test depth policy across the six required pages

Spec: .context-index/specs/features/test-strategies/test-depth-policy.spec.md
Plan-task: 19"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are
recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from the spec satisfied (60+ criteria — cross-check against
  `test-depth-policy.spec.md`'s Acceptance Criteria section task by task)
- `tests/governance/rigor-mode.test.mjs` remains byte-unchanged and green
- No constitutional violations: no new external dependencies, no CommonJS, no executable logic
  added to any `SKILL.md` (all control flow lives in `lib/test-strategies/*.mjs` and
  `lib/cli/test-policy.mjs` per the constitution's anti-pattern rule cited in the spec's own
  System Constitution Reference section)
- `governance/gates.yaml`-equivalent (`.context-index/governance/gates.yaml`) has no deterministic
  gates beyond `npm test` for this repo; no probabilistic/no-command gates apply

**Known scope boundary (not a gate failure):** end-to-end verification that an authored suite's
actual case-class coverage matches its assigned depth is deliberately out of scope for this plan
(issue-559). `/adev:validate` should not fail a task for "shallow tests despite thorough
assignment" — that check does not exist yet by design.
