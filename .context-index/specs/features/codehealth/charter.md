---
status: approved
revision: 1
updated: 2026-04-02
---

# Feature Charter: adev:codehealth

## Business Intent

`/adev:codehealth` proactively scans source code to surface dead exports, duplicate logic, stale code, orphan files, and unused dependencies. It bridges the gap between `/adev:hygiene` (which audits context artifacts) and `/adev:specify --refactor` (which assumes you already know what to clean up), giving teams visibility into code-level cleanup opportunities before they become tech debt.

## Scope and Boundaries

### In Scope

- Five detection passes: dead exports, duplicate logic, stale code, orphan files, unused dependencies
- Reads `/adev:repomap` artifacts (`symbol-ranks.json`, `dependency-graph.json`) as primary data source
- Supplements with git history for staleness analysis
- Produces a severity-tiered markdown report (high/medium/low) in `.context-index/reports/codehealth-<date>.md`
- Optional `--module <slug>` filter to scope scan to a specific manifest module's paths
- Optional `--pass <name>` filter to run specific detection passes (e.g., `--pass dead-exports,orphan-files`)
- Callable standalone or dispatched by `/adev:hygiene` as one of its passes

### Out of Scope

- Auto-fixing or auto-refactoring findings (report only)
- Generating `/adev:specify --refactor` specs from findings
- Duplicating repomap's parsing — requires repomap to have been run
- Style/lint issues (covered by linters, not this skill)
- Test code analysis (respects `coverage_exclude` from manifest hygiene config)

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| `/adev:repomap` | internal module | Must be run first to produce `symbol-ranks.json` and `dependency-graph.json` |
| `/adev:hygiene` | internal module (peer) | Dispatches `/adev:codehealth` as an optional pass |
| `manifest.yaml` | config file | `source_roots`, `modules[].paths`, `hygiene.coverage_exclude` for scan scoping |
| `git` | external tool | Commit history per file for staleness detection |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Finding | A single code-level issue detected by a pass | `pass`, `severity` (high/medium/low), `file_path`, `line_number`, `symbol` (if applicable), `description` |
| Pass | A detection algorithm that produces findings | `name`, `description`, `requires` (list of repomap artifact filenames, e.g. `["symbol-ranks.json", "dependency-graph.json"]`) |
| Report | Aggregated findings from one or more passes | `date`, `module_filter`, `pass_filter`, `findings[]`, `summary` (counts by pass and severity) |

### Relationships

- A Report contains zero or more Findings
- Each Finding is produced by exactly one Pass
- A Pass reads repomap artifacts and optionally git history

### Invariants

- Every Finding must reference a valid file path that exists in `source_roots`
- Severity is always one of `high`, `medium`, `low` — never omitted
- A Report with `--module` filter only contains Findings for files within that module's `paths`
- A Report with `--pass` filter only contains Findings from the specified passes
- Files matching `coverage_exclude` are never included in findings

## Capability Map

| Capability | Description | Priority | Milestone | Status |
|-----------|-------------|----------|-------|--------|
| Dead export detection | Identify exported symbols with zero imports across the codebase using repomap dependency graph | must-have |  | validated |
| Orphan file detection | Find source files not imported by any other file and not covered by any test | must-have |  | validated |
| Unused dependency detection | Compare `package.json` dependencies against actual imports in source files | must-have |  | validated |
| Stale code detection | Flag files/symbols with no git commits in a configurable threshold relative to their module's activity | should-have |  | validated |
| Duplicate logic detection | Identify near-duplicate code blocks across files using structural similarity from repomap AST data. Skipped when tree-sitter data is unavailable (per ADR-0001). | should-have |  | validated |
| Module scoping | `--module <slug>` filter restricts scan to a single manifest module's paths | must-have |  | validated |
| Pass scoping | `--pass <name>` filter runs only specified detection passes | must-have |  | validated |
| Severity classification | Classify each finding as high, medium, or low confidence | must-have |  | validated |
| Report generation | Write structured markdown report to `.context-index/reports/codehealth-<date>.md` | must-have |  | validated |
| Precondition validation | Verify repomap artifacts exist before running passes; emit actionable error pointing to `/adev:repomap` if missing | must-have |  | validated |
| Hygiene integration | Callable by `/adev:hygiene` as a dispatched pass | should-have |  | validated |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `/adev:codehealth` | skill (CLI invocation) | Entry point. Accepts `--module <slug>` and `--pass <name>` arguments. Reads repomap artifacts, runs detection passes, writes report. |
| Report file | file (markdown) | `.context-index/reports/codehealth-<date>.md` — structured findings with frontmatter containing run metadata (date, filters, summary counts) |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| `symbol-ranks.json` | repomap | Ranked symbol index with reference counts — used for dead export and orphan detection |
| `dependency-graph.json` | repomap | Import/export edges between files — used for dead export, orphan, and duplicate detection |
| `manifest.yaml` | setup | `source_roots`, `modules[].paths`, `hygiene.coverage_exclude` for scan scoping |
| `package.json` | project root | `dependencies` and `devDependencies` for unused dependency detection |
| `git log` | git | Commit history per file for staleness detection |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Accuracy | High-severity findings must have <5% false positive rate — only flag symbols that are definitively unreferenced. Medium/low can tolerate higher ambiguity. |
| Performance | Full-project scan should complete within a single agent turn. No external network calls. |
| Idempotency | Running twice with same inputs produces identical reports. |
| Graceful precondition failure | If repomap artifacts are missing, emit a clear error message pointing to `/adev:repomap` rather than crashing or producing partial results. |
| Empty-result clarity | When no findings are detected, the report explicitly states "no issues found" with pass-level confirmation. When config is invalid (e.g., missing `source_roots`), emit a diagnostic error before running passes. |
