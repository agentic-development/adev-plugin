---
date: 2026-04-15T10:20:00.000Z
module_filter: all
pass_filter: all
total_findings: 10
summary:
  high: 1
  medium: 5
  low: 4
---

# Code Health Report

| Pass | High | Medium | Low | Total |
|------|------|--------|-----|-------|
| Dead Export Detection | 0 | 2 | 2 | 4 |
| Orphan File Detection | 0 | 0 | 0 | 0 |
| Unused Dependency Detection | 1 | 0 | 0 | 1 |
| Stale Code Detection | 0 | 3 | 2 | 5 |
| Duplicate Logic Detection | — | — | — | skipped |
| **Total** | **1** | **5** | **4** | **10** |

## Dead Export Detection

**Note:** This project is a plugin where many exports are consumed by test files (excluded from the dependency graph per skill spec) and by markdown skills that invoke Node.js at runtime. Exports appearing "dead" in the graph may have legitimate external consumers. Only exports with zero references in symbol-ranks.json (including test file references) are flagged.

| Severity | File | Line | Symbol | Description |
|----------|------|------|--------|-------------|
| medium | lib/provider/interface.mjs | 17 | ProviderInterface | 0 references anywhere in codebase (symbol-ranks.json). Defines interface contract but no file imports it. |
| medium | lib/provider/registry.mjs | 9 | providers | 0 references anywhere in codebase. Internal registry object — consumers use getProvider() instead. |
| low | lib/repomap/index.mjs | 51 | parseArgs | 0 external references. Called internally from isMain CLI entry block in same file. |
| low | lib/repomap/index.mjs | 107 | parseManifestYaml | 0 external references. Called internally by readManifest() in same file. |

**Excluded from findings:** Exports like `globSourceFiles`, `run` (repomap/index.mjs) are CLI entry points called from within the same module. Exports consumed only by tests (e.g., `writeExecutionState`, `validateEntry`, `serializeHeuristic`) are expected — tests are excluded from the dependency graph.

## Orphan File Detection

No issues found.

**Note:** All source files in the dependency graph are either imported by another file or are legitimate entry points:
- `cli/index.mjs` — CLI entry point (npm `bin`)
- `hooks/issue-reminder.mjs` — hook helper script (listed in hooks.json)
- `lib/execution-state.mjs` — consumed by tests
- `lib/heuristics.mjs` — consumed by tests and skills
- `lib/session-parser.mjs`, `lib/session-summary.mjs` — consumed by tests
- `lib/source-manifest.mjs` — consumed by tests

## Unused Dependency Detection

| Severity | File | Line | Symbol | Description |
|----------|------|------|--------|-------------|
| high | package.json | — | @adev-org/adev-cli | Production dependency not imported by any source file. Only referenced in CLI help text strings. Self-referencing package — likely unnecessary as a dependency. |

**Verified in use:**
- `web-tree-sitter` — imported by `lib/repomap/parse.mjs`
- `tree-sitter-typescript` — path-resolved in `lib/repomap/index.mjs` (WASM file loaded at runtime)
- `tree-sitter-wasms` — indirect dependency of tree-sitter pipeline
- `typescript` (devDependency) — imported by `tests/evals/repomap/generate-ground-truth.mjs`

## Stale Code Detection

Staleness threshold: 30 days (from manifest)
Analysis date: 2026-04-15

**Module: lib-provider** (most recent file: 2026-03-25, 21 days ago — approaching threshold)

| Severity | File | Line | Symbol | Description |
|----------|------|------|--------|-------------|
| medium | lib/provider/detect.mjs | — | — | Last modified: 2026-03-23 (23 days). Module last active: 2026-03-25. |
| medium | lib/provider/interface.mjs | — | — | Last modified: 2026-03-25 (21 days). Also has 0 references (dead export). |
| medium | lib/provider/registry.mjs | — | — | Last modified: 2026-03-25 (21 days). Contains dead export `providers`. |

**Module: maintenance (repomap)** (most recent file: 2026-03-23, 23 days ago — uniformly old)

Skipped — all 6 files in the repomap module share the same last-modified date (2026-03-23). Uniformly aged module; not flagged.

**Module: lib-session** (most recent file: 2026-03-27, 19 days ago — uniformly old)

Skipped — both files share the same last-modified date. Uniformly aged.

**Other stale files (not in uniformly-old modules):**

| Severity | File | Line | Symbol | Description |
|----------|------|------|--------|-------------|
| low | providers/codex/adapter.mjs | — | — | Last modified: 2026-03-25 (21 days). Module last active: 2026-04-15 (providers-claude-code updated today). |
| low | providers/opencode/adapter.mjs | — | — | Last modified: 2026-03-24 (22 days). Module last active: 2026-04-15. |

## Duplicate Logic Detection

Skipped — tree-sitter is available but this pass requires AST-based function body comparison which is not implemented in the current repomap pipeline. The tree-sitter parser extracts symbols and imports but does not support structural similarity analysis.
