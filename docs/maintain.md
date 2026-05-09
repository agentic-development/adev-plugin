# Maintain

The maintain phase covers ongoing project health. These skills help you track work items, monitor project status, audit context for drift and staleness, run retrospectives, detect dead code, map your codebase, repair lifecycle mismatches, and curate reference implementations.

## Issues

**Skill:** `/adev:issues`

**What it does:** Manages project issues and epics using the configured task backend. Create, update, close, and view issues. Supports filtering by status, epic, or milestone, adding blocking dependencies, and viewing actionable (open and unblocked) items.

**When to use it:** When tracking work items, filing bugs, viewing the issue board, or managing epics and milestones.

**Prerequisites:** `.context-index/` must exist with `manifest.yaml` and `tasks.backend` configured.

**Example invocation:**

```
/adev:issues
```

Use `create "<title>"` to file an issue, `ready` to see actionable items, or `list --epic <id>` to filter.

See the [Skill Reference](skills.md) for full details on commands and filtering options.

## Status

**Skill:** `/adev:status`

**What it does:** Queries and displays the current status of adev lifecycle artifacts — charters, specs, capabilities, sessions, and source manifests. This is a read-only dashboard view that never modifies files.

**When to use it:** When checking project progress, viewing which specs are done, or getting a summary of where things stand.

**Prerequisites:** `.context-index/` must be initialized.

**Example invocation:**

```
/adev:status
```

Use `--charter <name>` for a specific feature, `--milestone <name>` for milestone progress, or `--backlog` for all pending work.

See the [Skill Reference](skills.md) for full details on query options and output formats.

## Hygiene

**Skill:** `/adev:hygiene`

**What it does:** Audits the health of `.context-index/` and source code across sixteen audit passes. Detects staleness, drift, coverage gaps, phase readiness, lifecycle consistency, operational patterns, code health issues, and heuristic index health. Generates actionable reports with checklists.

**When to use it:** Periodically to keep context healthy, before major work to catch drift, or when you suspect specs and code are out of sync.

**Prerequisites:** `.context-index/` must be initialized.

**Example invocation:**

```
/adev:hygiene
```

Use `--check <type>` for a single audit pass (e.g., `--check drift`), or `--fix` to auto-fix issues where possible.

See the [Skill Reference](skills.md) for full details on audit passes and auto-fix capabilities.

## Retro

**Skill:** `/adev:retro`

**What it does:** Analyzes completed work across a date range to extract patterns, compute delivery metrics (velocity, review cycles, recovery frequency), and generate actionable improvement recommendations. Examines git history, validation reports, recovery records, blocker files, hygiene reports, and plan files.

**When to use it:** After completing a feature or sprint, to reflect on what went well, what did not, and what to improve.

**Prerequisites:** `.context-index/` must be initialized with completed work (commits, plans, validation reports).

**Example invocation:**

```
/adev:retro
```

Use `--since <date>` to set the analysis window, or `--charter <module>` to scope to a specific feature.

See the [Skill Reference](skills.md) for full details on data sources and metric computation.

## Codehealth

**Skill:** `/adev:codehealth`

**What it does:** Scans source code for dead exports, orphan files, unused dependencies, stale code, and duplicate logic. Produces a severity-tiered markdown report from `/adev:repomap` artifacts.

**When to use it:** Before refactoring or cleanup, to identify what can be safely removed or consolidated.

**Prerequisites:** `.context-index/` must be initialized with `manifest.yaml` (requires `source_roots` configuration). Repomap artifacts should exist for best results.

**Example invocation:**

```
/adev:codehealth
```

Use `--module <slug>` to restrict to a single module, or `--check <name>` for specific checks (e.g., `--check dead-exports,orphan-files`).

See the [Skill Reference](skills.md) for full details on checks and severity tiers.

## Repomap

**Skill:** `/adev:repomap`

**What it does:** Generates an AST-based symbol index of the repository. Extracts exported functions, classes, types, and interfaces, ranks them by reference count, and outputs a repository map for drift detection by `/adev:hygiene`.

**When to use it:** When mapping codebase structure, preparing for drift detection, or generating input for `/adev:codehealth` and `/adev:document`.

**Prerequisites:** Source code files exist in the repository.

**Example invocation:**

```
/adev:repomap
```

Use `--path <dir>` to map a specific directory, or `--depth <n>` to limit tree depth.

See the [Skill Reference](skills.md) for full details on language support and output format.

## Reconcile

**Skill:** `/adev:reconcile`

**What it does:** Interactive repair for lifecycle mismatches between specs, plans, the issue board, and code provenance. Detects orphaned artifacts, stale epics, untraced code, and missing issues, then offers targeted fixes for each finding.

**When to use it:** When `/adev:hygiene` or `/adev:status` reveals inconsistencies between lifecycle artifacts — stale epics, orphaned plans, or code without spec traceability.

**Prerequisites:** `.context-index/` must exist with `manifest.yaml` and `tasks.backend` configured.

**Example invocation:**

```
/adev:reconcile
```

Use `--check <type>` for a specific reconciliation check, `--batch` to apply fixes without confirmation, or `--dry-run` to preview changes.

See the [Skill Reference](skills.md) for full details on detection checks and repair actions.

## Sample

**Skill:** `/adev:sample`

**What it does:** Scans the codebase for high-quality implementations, scores them against the constitution and declared patterns, and curates annotated golden samples in `.context-index/samples/`. Golden samples serve as reference implementations that guide subagents during `/adev:implement`.

**When to use it:** When building a sample library for subagent guidance, or when you have quality implementations worth preserving as reference code.

**Prerequisites:** `.context-index/` must be initialized with `constitution.md` and `manifest.yaml`.

**Example invocation:**

```
/adev:sample
```

Use `--pattern <name>` for a specific pattern, `--from <file>` to promote a file directly, or `--refresh` to re-score and update existing samples.

See the [Skill Reference](skills.md) for full details on discovery, scoring, and curation.
