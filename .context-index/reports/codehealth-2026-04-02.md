---
date: 2026-04-02T00:00:00.000Z
module_filter: all
pass_filter: all
total_findings: 45
summary:
  high: 21
  medium: 21
  low: 3
---

# Code Health Report

| Pass | High | Medium | Low | Total |
|------|------|--------|-----|-------|
| Dead Export Detection | 6 | 16 | 0 | 22 |
| Orphan File Detection | 12 | 1 | 0 | 13 |
| Unused Dependency Detection | 1 | 1 | 0 | 2 |
| Stale Code Detection | 0 | 0 | 0 | 0 |
| Duplicate Logic Detection | 2 | 3 | 3 | 8 |
| **Total** | **21** | **21** | **3** | **45** |

## Dead Export Detection

| Severity | File | Line | Symbol | Description |
|----------|------|------|--------|-------------|
| high | lib/provider/detect.mjs | 10 | detectProvider | Only export in file, zero references in dependency graph |
| high | lib/provider/interface.mjs | 17 | ProviderInterface | Only export in file, zero references in dependency graph |
| high | lib/repomap/graph.mjs | 34 | buildGraph | Only export in file, zero references in dependency graph (consumed via dynamic import in index.mjs, not captured in static graph) |
| high | lib/repomap/rank.mjs | 15 | computeRanks | Only export in file, zero references in dependency graph (consumed via dynamic import in index.mjs, not captured in static graph) |
| high | skills/write-test/detect-framework.mjs | 107 | detectFramework | Only export in file, zero references in dependency graph |
| high | skills/write-test/detect-gaming.mjs | 155 | detectGaming | Only export in file, zero references in dependency graph |
| medium | cli/index.mjs | 592 | enablePlugin | Coexists with 2 other unreferenced exports; likely API surface for external consumers |
| medium | cli/index.mjs | 593 | detectConflicts | Coexists with 2 other unreferenced exports; likely API surface for external consumers |
| medium | cli/index.mjs | 594 | disableConflictingPlugin | Coexists with 2 other unreferenced exports; likely API surface for external consumers |
| medium | lib/issues/interface.mjs | 44 | VALID_STATUSES | Coexists with 5 referenced exports in same file |
| medium | lib/issues/interface.mjs | 45 | VALID_TYPES | Coexists with 5 referenced exports in same file |
| medium | lib/issues/interface.mjs | 46 | VALID_PRIORITIES | Coexists with 5 referenced exports in same file |
| medium | lib/issues/interface.mjs | 52 | IssueManagerInterface | Coexists with 5 referenced exports in same file |
| medium | lib/issues/registry.mjs | 14 | SUPPORTED_BACKENDS | Coexists with getIssueManager; both unreferenced in graph but consumed externally by skills |
| medium | lib/issues/registry.mjs | 23 | getIssueManager | Coexists with SUPPORTED_BACKENDS; both unreferenced in graph but consumed externally by skills |
| medium | lib/provider/registry.mjs | 9 | providers | Coexists with 2 referenced exports (getProvider, getProviderNames) |
| medium | lib/repomap/index.mjs | 51 | parseArgs | Coexists with 4 other unreferenced exports; module API consumed via CLI |
| medium | lib/repomap/index.mjs | 82 | readManifest | Coexists with 4 other unreferenced exports |
| medium | lib/repomap/index.mjs | 107 | parseManifestYaml | Coexists with 4 other unreferenced exports |
| medium | lib/repomap/index.mjs | 196 | globSourceFiles | Coexists with 4 other unreferenced exports |
| medium | lib/repomap/index.mjs | 277 | run | Coexists with 4 other unreferenced exports; main entry for repomap generation |
| medium | lib/repomap/parse.mjs | 16 | initParser | Coexists with 2 other unreferenced exports; consumed via dynamic import |
| medium | lib/repomap/parse.mjs | 28 | loadGrammar | Coexists with 2 other unreferenced exports; consumed via dynamic import |
| medium | lib/repomap/parse.mjs | 43 | parseFile | Coexists with 2 other unreferenced exports; consumed via dynamic import |
| medium | lib/session-parser.mjs | 25 | computeProjectHash | Coexists with 2 other unreferenced exports |
| medium | lib/session-parser.mjs | 40 | resolveLogPath | Coexists with 2 other unreferenced exports |
| medium | lib/session-parser.mjs | 118 | parseSession | Coexists with 2 other unreferenced exports |
| medium | lib/session-summary.mjs | 99 | writeSummary | Coexists with 1 other unreferenced export |
| medium | lib/session-summary.mjs | 209 | readSummary | Coexists with 1 other unreferenced export |
| medium | lib/source-manifest.mjs | 42 | computeManifest | Coexists with 1 other unreferenced export |
| medium | lib/source-manifest.mjs | 117 | verifyManifest | Coexists with 1 other unreferenced export |
| medium | skills/write-test/write-handoff.mjs | 68 | writeHandoff | Coexists with 1 other unreferenced export |
| medium | skills/write-test/write-handoff.mjs | 191 | verifyHandoff | Coexists with 1 other unreferenced export |

> **Note:** Many "dead" exports are false positives caused by consumption patterns not captured in the static dependency graph: (1) `lib/repomap/graph.mjs`, `rank.mjs`, and `parse.mjs` are consumed via `await import()` dynamic imports in `lib/repomap/index.mjs`. (2) `lib/issues/registry.mjs` exports are consumed by skill markdown at runtime. (3) `cli/index.mjs` exports are the package's public API. (4) `lib/session-parser.mjs`, `lib/session-summary.mjs`, and `lib/source-manifest.mjs` are consumed by hook scripts via `node` invocations. Genuinely suspicious: `lib/provider/detect.mjs` (detectProvider) and `lib/provider/interface.mjs` (ProviderInterface) — neither is imported by any file in the graph or dynamically.

## Orphan File Detection

| Severity | File | Line | Symbol | Description |
|----------|------|------|--------|-------------|
| high | lib/provider/detect.mjs | — | — | Fully isolated: no incoming edges and no outgoing edges in dependency graph |
| high | lib/provider/interface.mjs | — | — | Fully isolated: no incoming edges and no outgoing edges |
| high | lib/repomap/graph.mjs | — | — | No incoming edges; consumed via dynamic import not captured in graph |
| high | lib/repomap/parse.mjs | — | — | No incoming edges; consumed via dynamic import not captured in graph |
| high | lib/repomap/rank.mjs | — | — | No incoming edges; consumed via dynamic import not captured in graph |
| high | lib/session-parser.mjs | — | — | Fully isolated: no edges in or out within dependency graph |
| high | lib/session-summary.mjs | — | — | Fully isolated: no edges in or out within dependency graph |
| high | lib/source-manifest.mjs | — | — | Fully isolated: no edges in or out within dependency graph |
| high | providers/opencode/plugin.mjs | — | — | No incoming edges; listed as package.json export ("./opencode") but not imported internally |
| high | skills/write-test/detect-framework.mjs | — | — | Fully isolated: no edges in or out |
| high | skills/write-test/detect-gaming.mjs | — | — | Fully isolated: no edges in or out |
| high | skills/write-test/write-handoff.mjs | — | — | Fully isolated: no edges in or out |
| medium | lib/issues/registry.mjs | — | — | No incoming edges but has outgoing edges (imports file-adapter, beads-adapter, resolve-root) |

> **Note:** Most orphan findings are false positives for the same reasons as dead exports — dynamic imports, hook-script invocations, and package.json entry points. Genuinely suspicious orphans: `lib/provider/detect.mjs` and `lib/provider/interface.mjs`.

## Unused Dependency Detection

| Severity | File | Line | Symbol | Description |
|----------|------|------|--------|-------------|
| high | package.json | — | tree-sitter-wasms | Production dependency with zero `import`/`require` references anywhere in source files. May be an incorrectly promoted transitive dependency of web-tree-sitter. |
| medium | package.json | — | typescript | Dev dependency only imported in tests/evals/ (excluded from scan scope by coverage_exclude). Used by eval scripts, not production source. |

> **Note:** `web-tree-sitter` is directly imported in `lib/repomap/parse.mjs`. `tree-sitter-typescript` is referenced by filesystem path in `lib/repomap/index.mjs` for WASM file resolution. Both are actively used. `tree-sitter-wasms` has zero direct references and should be investigated.

## Stale Code Detection

No issues found.

> All 25 source files were last modified between 2026-03-23 and 2026-04-01, well within the 30-day staleness threshold from 2026-04-02.

## Duplicate Logic Detection

| Severity | File | Line | Symbol | Description |
|----------|------|------|--------|-------------|
| high | providers/claude-code/adapter.mjs | 13 | ensureDir | Exact duplicate of providers/codex/adapter.mjs:85 (ensureDir) and providers/opencode/adapter.mjs:13 (ensureDir) — identical `if (!existsSync) mkdirSync({recursive})` body |
| high | providers/claude-code/adapter.mjs | 19 | readJson | Exact duplicate of providers/opencode/adapter.mjs:19 (readJson) — identical try/catch `JSON.parse(readFileSync)` returning null on error |
| medium | providers/claude-code/adapter.mjs | 27 | writeJson | Duplicate of providers/opencode/adapter.mjs:27 (writeJson) — identical `writeFileSync(JSON.stringify + newline)` body |
| medium | providers/opencode/adapter.mjs | 97 | linkSkillsFromCache | Structurally similar to providers/opencode/adapter.mjs:127 (linkSkills) — same iterate-skills/check-exists/unlink/symlink pattern, differs in source directory |
| medium | lib/issues/file-adapter.mjs | 179 | _nextIssueId | Structurally similar to lib/issues/file-adapter.mjs:188 (_nextEpicId) — identical max-ID-from-prefix pattern, differs only in prefix string ("issue-" vs "epic-") |
| low | skills/write-test/write-handoff.mjs | 41 | computeHash | Similar hash-computation pattern to lib/source-manifest.mjs:42 (computeManifest) — both sort files and compute SHA-256 over concatenated contents |
| low | providers/codex/adapter.mjs | 85 | ensureDir | Exact duplicate of providers/claude-code/adapter.mjs:13 (ensureDir) — see above |
| low | providers/opencode/adapter.mjs | 13 | ensureDir | Exact duplicate of providers/claude-code/adapter.mjs:13 (ensureDir) — see above |

> **Recommendation:** Extract `ensureDir`, `readJson`, and `writeJson` into a shared `lib/fs-utils.mjs` module to eliminate three-way duplication across provider adapters. Consider a generic `nextPrefixedId(items, prefix, idField)` helper for the file-adapter ID generation.
