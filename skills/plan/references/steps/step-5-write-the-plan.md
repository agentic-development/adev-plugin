## Step 5: Write the Plan

### Incremental Authoring (.partial pattern)

Per `incremental-artifact-writes.spec.md`, plan files MUST be authored incrementally to `<plan-path>.partial` and atomically renamed to `<plan-path>` on completion. This protocol survives mid-stream API failures (issue-504) by checkpointing to disk frequently.

Cadence: one section (H2 boundary or coherent block) per append. The first authored chunk MUST begin with a `partial_schema: plan@1` marker placed in an HTML comment so it does not render in the final plan:

```markdown
<!-- partial_schema: plan@1 -->

# Implementation Plan: <Feature Name>

...
```

Section append order matches the plan header → File Structure → Context Packets → Parallelization → Task Summary → Task Structure → Quality Gates flow defined below. Each section, once written, is durable: a kill/crash mid-write leaves the prior sections on disk and only the in-flight section is lost.

**Runaway-write guard (PARTIAL_ARTIFACT_OVERSIZE).** Before each append, run `adev partial check-size --artifact <plan-path>` to verify the in-progress partial has not exceeded `partial_oversize_multiplier × expected` bytes (defaults: 3× max(prior plan size, 50 KB)). The verb exits 2 with `PARTIAL_ARTIFACT_OVERSIZE` when the cap is breached — treat that as a hard stop: do NOT continue appending, do NOT commit the rename, preserve the partial for inspection, and surface the error to the user. This protects against retry loops that re-write prior chunks instead of appending only the new section.

After writing the final Quality Gates section, commit the artifact via atomic rename. Use the CLI verb so the SKILL.md stays markdown-only per the `cli-driver-surface` charter:

```bash
adev partial inspect --artifact <plan-path>.partial   # sanity check before commit
# then perform the rename (helper invocation, NOT inline Node):
# In a foreground skill, the wrapping CLI driver performs the rename; the
# skill simply marks "done" so the orchestrator finalises.
```

Lock coordination: acquire `<plan-path>.partial.lock` via `adev partial inspect` first (lock_exists must be false OR the lock must be owned by this process). On a stale lock (dead-owner, age > `lifecycle.partial_stale_seconds`), the helper auto-steals — see the spec's Behavior 6 for the full contract.

If `/adev:plan` is interrupted mid-section, the next invocation enters Step 0 Resume Detection and picks up from the last coherent H2 boundary.

### Plan Location

Save the plan adjacent to the spec:
- Spec at `.context-index/specs/features/<module>/<task>.md` gets its plan at `.context-index/specs/features/<module>/<task>.plan.md`
- Cross-cutting spec at `.context-index/specs/cross-cutting/<topic>.spec.md` gets its plan at `.context-index/specs/cross-cutting/<topic>.plan.md`

**Workspace-aware plan save location:** When in workspace-aware Spec Mode, the plan is saved in the workspace `.context-index/`, not in the target repo's `.context-index/`. This keeps workspace-level planning artifacts co-located with the workspace-level specs that produced them.

### Plan Document Header

Every plan starts with this header:

```markdown
# Implementation Plan: <Feature Name>

> **Methodology:** adev
> **Charter:** .context-index/specs/features/<module>/charter.md
> **Spec:** .context-index/specs/features/<module>/<task>.spec.md
> **Review:** <PASS|PASS_WITH_NOTES> (YYYY-MM-DD)
> **Platform:** <framework> <version>, <language>, <key deps>

**Goal:** <One sentence describing what this builds>

**Architecture:** <2-3 sentences about the approach, referencing orientation and ADRs where relevant>

---
```

### Scope Check

If the spec covers multiple independent subsystems that could be built and tested separately, suggest breaking into separate plans. Each plan should produce working, testable software on its own.

### File Structure Section

Before defining tasks, map out all files that will be created or modified:

```markdown
## File Structure

**Create:**
- `src/components/Dashboard.tsx` — Main dashboard component
- `tests/components/Dashboard.test.tsx` — Dashboard unit tests

**Modify:**
- `src/app/layout.tsx:15-20` — Add dashboard route
- `src/lib/api/index.ts:42-50` — Export new endpoint handler

**Reference (read, do not modify):**
- `.context-index/samples/component-sample.md` — Follow this pattern for component structure
- `src/components/ExistingWidget.tsx` — Follow this component's pattern for state management
```

Design units with clear boundaries. Prefer smaller, focused files. Follow existing codebase patterns. If the codebase uses large files, do not unilaterally restructure.

#### Workspace-Aware Repo-Relative File Paths

When in workspace-aware Spec Mode, file paths in the File Structure and Task Structure sections must be repo-relative:

- **When target-repo is a repo slug:** prefix all file paths with the target repo's path relative to the workspace root (e.g., `<repo-slug>/src/module.ts`). This makes paths unambiguous in a multi-repo workspace.
- **When target-repo is `workspace`:** paths are workspace-relative (relative to the workspace root directory).
- **Commit scope:** The commit scope in each task's commit step must include the target repo slug (e.g., `feat(<target-repo-slug>/<module>): ...`). When target-repo is `workspace`, use the workspace name as the scope prefix (e.g., `feat(<workspace-name>/<module>): ...`). Branch naming follows the same convention: `feat/<target-repo-slug>/<short-description>` or `feat/<workspace-name>/<short-description>` for workspace-scoped specs.

### Context Packet Section

After the file structure and before individual tasks, include a context packet manifest per task. This makes subagent context explicit and inspectable.

**Source-manifest-guided loading:** When the spec has a `source-manifest.files[]` in its frontmatter, use those files as the primary relevance signal for context packets:
1. **Primary implementation file** (from source-manifest): include in full — the implementer needs to see existing patterns.
2. **Test file** (from source-manifest): include function signatures only (`grep "^export\|^describe\|^it"`) — shows test structure without full content.
3. **Sibling specs' source-manifest files** (same module): include export signatures only (`grep "^export"`) — shows available APIs.
4. **ADRs referenced in spec**: include decision + rationale sections only, not full ADR.

When no source-manifest exists (new spec), fall back to: charter Dependencies table for module boundaries, sibling specs' source manifests for shared directory patterns, and orientation file for module placement.

```markdown
## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/<module>/<task>.spec.md` (criteria 1-3)
- Charter: `.context-index/specs/features/<module>/charter.md` (capability: <name>)
- Source files: <from spec source-manifest.files[], full read for primary, signatures for siblings>
- Sample: `.context-index/samples/<pattern>-sample.md`
- ADR: `.context-index/adrs/<relevant-adr>.md` (decision + rationale only)
- Cross-cutting: `.context-index/specs/cross-cutting/<relevant>.spec.md`
- Boundary rules: `governance/boundaries.yaml` (rules affecting task files)
- Heuristics: <N> entries for module `<M>` (IDs: <id1>, <id2>, ...)

### Task 2 Context
- ...
```

Each packet entry lists the specific file AND the relevant section or criteria within it. `/adev:implement` assembles these packets before dispatching subagents and logs them to `.context-index/packets/` (gitignored) for debugging failed tasks. `/adev:recover` reads packets to diagnose root causes.

### Heuristics Section

If heuristics were loaded in Step 2, add a `## Heuristics` section to the plan after Context Packets and before Parallelization:

```markdown
## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

<rendered heuristic blocks from Step 2>
```

If no heuristics are available, omit this section entirely.

### Parallelization Hints

After context packets, annotate which tasks can run in parallel (no shared file dependencies):

```markdown
## Parallelization

- Group A (sequential): Task 1 → Task 2 (shared files)
- Group B (independent): Task 3 (no file overlap with Group A)
- Group C (independent): Task 4 (no file overlap with A or B)

Groups B and C can run in parallel with Group A.
```

This is informational for `/adev:implement --parallel` (future). Tasks within a group run sequentially; groups run concurrently.

### Task Summary Table

After the Parallelization section, emit a `## Task Summary` table that provides a quick-glance overview of all tasks. This is the first thing users and `/adev:implement` see before the detailed task sections.

```markdown
## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | ADR for dotenvx dependency | small | unit | — | 2 create, 1 modify |
| 2 | parseInfraRequirements | medium | unit | — | 1 create, 1 modify |
| 3 | dotenvx env file loading | medium | unit | Task 2 | 0 create, 2 modify |
| 4 | Env var presence checks | small | unit | Task 2 | 0 create, 2 modify |
```

**Column definitions:**
- **#** — sequential task number
- **Title** — short task name (from `### Task N: <title>`)
- **Complexity** — small / medium / large (from spec's Actionable Task Map or inferred from file count and description)
- **Strategy** — test strategy assigned to this task
- **Depends On** — task dependencies (from `Depends on:` annotation) or `—` if none
- **Files** — count of files to create and modify

This table is always emitted, regardless of project complexity or strategy configuration.

### Strategy Assignment

For each task, resolve its test strategy using the priority chain defined in `lib/test-strategies/assignment.mjs`:

1. Check if the parent spec declares `test_strategy` in its YAML frontmatter → use it (source: spec-declared, confidence: high)
2. Check if `manifest.yaml` has a `test_strategies` entry whose path globs match the task's file paths → use it (source: manifest, confidence: high)
3. Auto-detect from the task's file paths using `lib/test-strategies/detection.mjs` → use the detected strategy (source: detected, confidence from heuristic)
4. Default to `unit` (source: fallback, confidence: high)

Include the resolved strategy in each task's metadata. If any task uses a non-unit strategy, append a **Strategy Summary** section after the task list:

```markdown
## Strategy Summary

| Strategy | Tasks | Source |
|----------|-------|--------|
| unit | 3 | fallback |
| schema | 2 | manifest |

⚠ Low confidence assignments:
- Task 4: strategy=visual (detected, medium confidence) — verify before proceeding
```

Omit this section entirely when all tasks resolve to `unit` (backward compatible — no noise for projects not using test strategies).

### Granularity Assignment

Resolve granularity **once for the whole plan**, not per task, using `resolveGranularity()`:

```javascript
import { resolveGranularity } from '<ADEV_ROOT>/lib/test-strategies/policy.mjs';
// resolveGranularity({ moduleOverride, manifestPolicy, domainDefault }) →
//   { granularity: "per-task" | "per-behavior" | "per-spec", source }
```

It resolves from static configuration only — no routing input — in priority order: a
`modules[].test_policy.granularity` override for the task's module (source: module), then
`test_policy.granularity` in `manifest.yaml` (source: manifest), then the domain
`test-config.yaml` default (source: domain), then the built-in fallback `per-behavior`
(source: fallback).

The resolved granularity governs how each task's `**Tests:**` field is emitted:

- **`per-task`** — one new suite path per task (the previously shipped, unchanged behavior):
  every task's `**Tests:**` field names its own new suite.
- **`per-behavior`** (the fallback default) — one suite path per spec behavior statement, so
  several tasks implementing the same behavior share a single suite. Use `resolveSuitePath()`
  (`lib/test-strategies/suite-path.mjs`) per task to check whether the behavior it implements
  is already covered: when it is, the `**Tests:**` field references the existing suite and the
  task instruction reads "extend `<path>`" instead of "create"; when it is not yet covered,
  the field proposes a new suite path and the instruction reads "create `<path>`".
- **`per-spec`** — one suite path for the whole spec, shared by every task the spec produces.
  `resolveSuitePath()` resolves the same way against the spec's canonical suite path: "create"
  for the first task that produces it, "extend" for every task after.

Granularity governs only the `**Tests:**` field. Independent of granularity, every task carries its own **Files:** block (the per-task format under Task
Structure below, unconditionally emitted by `/adev:plan`) — this requirement does not vary by granularity, so
newly authored plans always give depth resolution (owned by `/adev:implement` at
test-authoring time) its path inputs.

### Infrastructure Requirements Section

After the Strategy Summary (or in its place when no non-unit strategies exist), check whether the plan needs a `## Test Infrastructure Requirements` section.

**Emission trigger (either condition):**
- The spec frontmatter contains `infra_requirements:` (regardless of strategy), OR
- One or more tasks are assigned a non-unit strategy

When all tasks are `unit` AND the spec has no `infra_requirements:` field, skip this section entirely (backward compatible — no noise for pure unit-test tasks).

**Derivation:**
For each non-unit task (or for all tasks when `infra_requirements:` is in spec frontmatter):
1. Read `infra_requirements:` from spec frontmatter — **if present, use as authoritative source and skip auto-detection (skip step 3)**
2. Otherwise, auto-detect from task file paths using file-globbing heuristics (e.g., files under `src/adapters/aws/` → AWS credentials likely needed; task paths matching `**/s3-client.*` → AWS S3 credentials likely needed). Detection uses file globbing only — no import scanning or content parsing.
3. Deduplicate requirements across tasks, grouped by external system.

When auto-detection confidence is `low`, prepend an advisory: "⚠ Infrastructure requirements auto-detected with low confidence — review and confirm before proceeding."

When `infra_requirements: unknown` is in spec frontmatter, emit `PLAN_INFRA_UNKNOWN` for all tasks in the spec.

**Section format:**

~~~markdown
