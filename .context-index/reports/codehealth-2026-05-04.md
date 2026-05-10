---
date: 2026-05-04T19:15:00.000Z
module_filter: all
pass_filter: all
total_findings: 11
summary:
  high: 2
  medium: 4
  low: 5
---

# Code Health Report

| Pass | High | Medium | Low | Total |
|------|------|--------|-----|-------|
| Dead Export Detection | 1 | 3 | 0 | 4 |
| Orphan File Detection | 1 | 0 | 0 | 1 |
| Unused Dependency Detection | 1 | 0 | 0 | 1 |
| Stale Code Detection | 0 | 1 | 5 | 6 |
| Duplicate Logic Detection | — | — | — | skipped |
| **Total** | **3** | **4** | **5** | **12** |

## Dead Export Detection

| Severity | File | Line | Symbol | Description |
|----------|------|------|--------|-------------|
| high | lib/provider/interface.mjs | 17 | ProviderInterface | Only meaningful export in file; zero references anywhere in codebase |
| medium | lib/repomap/index.mjs | 51 | parseArgs | Internal helper; never called outside this file — should be unexported |
| medium | lib/repomap/index.mjs | 107 | parseManifestYaml | Internal helper; never called outside this file — should be unexported |
| medium | lib/repomap/index.mjs | 196 | globSourceFiles | Internal helper; never called outside this file — should be unexported |

**Note:** 49 symbols have references=1 (definition file only). Most are skill-consumed modules (persona, meta-tools, infra-preflight, spec-drift, reality-check, session-*, write-test/*) where SKILL.md files instruct Claude to import them at runtime. These are not dead — they are dynamically consumed. Only `ProviderInterface` and the three repomap internals are true dead exports.

## Orphan File Detection

| Severity | File | Description |
|----------|------|-------------|
| high | lib/provider/interface.mjs | Fully isolated — contains only dead `ProviderInterface`, no source/skill/hook references |

**False positive corrected:** `lib/token-cursor.mjs` was initially flagged as orphaned, but it is dynamically imported inside `hooks/session-capture.sh` (line 125) within an inline Node.js heredoc block. Static `.mjs` grep missed the shell-embedded import. Same applies to `lib/session-file-reader.mjs` and `lib/token-pricing.mjs` — all three are hook-consumed at runtime.

**Not flagged (skill-consumed):** lib/governance/dispatch-shape.mjs has test references but no SKILL.md or source imports — borderline case, keeping as informational.

## Unused Dependency Detection

| Severity | File | Symbol | Description |
|----------|------|--------|-------------|
| high | package.json | tree-sitter-wasms | Production dependency with zero imports in any source or test file. Previously flagged in 2026-04-02 codehealth report. Likely an incorrectly promoted transitive dependency. |

**Used dependencies confirmed:**
- `web-tree-sitter` — imported in lib/repomap/parse.mjs
- `tree-sitter-typescript` — referenced in lib/repomap/index.mjs (WASM path resolution)
- `@dotenvx/dotenvx` — dynamically imported in lib/infra-preflight.mjs (ADR-0006)
- `typescript` — used in tests/evals/repomap/generate-ground-truth.mjs

## Stale Code Detection

Staleness threshold: 30 days (cutoff: 2026-04-04)

| Severity | File | Last Modified | Module Last Active | Description |
|----------|------|---------------|-------------------|-------------|
| medium | lib/provider/detect.mjs | 2026-03-23 | 2026-03-25 | Module uniformly old but providers/ consumers updated since; also contains dead export |
| low | lib/provider/registry.mjs | 2026-03-25 | 2026-03-25 | Stable provider registry, still referenced |
| low | lib/session-parser.mjs | 2026-03-27 | 2026-04-20 | Stable; session-file-reader.mjs updated more recently |
| low | lib/session-summary.mjs | 2026-03-27 | 2026-04-20 | Stable; same session module area |
| low | lib/issues/registry.mjs | 2026-04-01 | 2026-04-16 | Stable; other issues files updated since |
| low | lib/issues/resolve-root.mjs | 2026-04-01 | 2026-04-16 | Stable; same module |

**Uniformly old (not flagged):**
- lib/repomap/ — all 6 files from 2026-03-23 (stable module, actively used by /adev:repomap)
- providers/codex/, providers/opencode/ — adapters from 2026-03-24/25 (stable, rarely changed)

## Duplicate Logic Detection

Skipped — full AST-based structural comparison not performed in this scan. Tree-sitter is available; run with `--pass duplicate-logic` for targeted analysis.
