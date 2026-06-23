---
date: 2026-06-02T14:20:00.000Z
module_filter: all
check_filter: all
total_findings: 27
summary:
  high: 0
  medium: 27
  low: 0
repomap_commit: 5ef98c43
scope_nodes: 167
---

# Code Health Report

Scan run after refreshing the repomap (was 779 commits stale) and fixing a
repomap-exclude gap that had polluted the graph with 4 stale agent worktrees
under `.claude/worktrees/` (36% of nodes). Both corrections were required for
this scan to mean anything.

| Pass | High | Medium | Low | Total |
|------|------|--------|-----|-------|
| Dead Export Detection | 0 | 27 | 0 | 27 |
| Orphan File Detection | 0 | 0 | 0 | 0 |
| Unused Dependency Detection | 0 | 0 | 0 | 0 |
| Stale Code Detection | 0 | 31 (info) | — | 31 |
| Duplicate Logic Detection | — | — | — | not run |
| **Total** | **0** | **27** | **0** | **27** |

**Headline: 0 high-severity findings, 0 orphans.** The codebase is structurally
healthy. The 27 medium dead-export findings split into 20 benign (test-only
exports) and 7 genuine low-value candidates (below).

## Methodology corrections (why the raw numbers were misleading)

A naive pass over the graph reported **93 dead exports + 26 orphans**. Almost all
were false positives from dynamic dispatch the static `.mjs` edge graph cannot
see. After suppression the real signal is small. The three blind spots:

1. **CLI verb table.** `cli/index.mjs` (~line 1660) dispatches every
   `lib/cli/<verb>.mjs` via `import("../lib/cli/<verb>.mjs")` inside an array
   literal (24 verbs). Their `run`/`help` exports looked dead — they are not.
2. **Hook `.sh` dynamic imports.** Hook helper modules (`hooks/issue-reminder.mjs`,
   `hooks/post-validate-extract-heuristics.mjs`) are `import()`-ed from inline
   Node blocks in `.sh` hooks — invisible to the graph, flagged as fully-isolated
   orphans. Suppressed by scanning hook scripts for `.mjs` references.
3. **External provider entry points.** `providers/opencode/plugin.mjs` (`AdevPlugin`)
   is loaded by the opencode harness, not by this repo. Treated as a public-API
   entry (like `cli/index.mjs`, which carries the `public-api-entry` tag).

A fourth structural caveat, **not** a bug: the repomap **excludes test files** from
the graph, so any symbol referenced *only* by `tests/**` appears dead. 20 of the
27 dead-export findings are exactly this — helpers exported so unit tests can
reach them. They are benign.

## Dead Export Detection

0 high · 27 medium · 0 low. Breakdown:

### Benign — exported for tests only (20)
These symbols are referenced by `tests/**` (excluded from the graph) and are not
dead. No action needed. Examples: `lib/cli/domain-extension-picker.mjs`
(`loadCatalog`, `validateEntries`, `dispatchInstall`, `run`, `help`),
`lib/profiles/adapters/{claude-code,opencode}.mjs` (`HARNESS`, `capabilities`,
`prepareForDispatch`, …), `providers/copilot/adapter.mjs` (`getCopilotHome`).

### Genuine dead-export candidates (7) — RESOLVED 2026-06-02
On inspection, all 7 are **used internally** within their own file (0 references
in any other file, including tests) — i.e. over-exported, not dead code. 4 were
plain internal helpers and have been un-exported; 3 are intentional/borderline
public API and were left exported (rationale below).

| File | Line | Symbol | Resolution |
|------|------|--------|------------|
| lib/sync/cursor-writer.mjs | 38 | `deriveDescription` | **un-exported** (internal helper) |
| lib/sync/cursor-writer.mjs | 69 | `deriveIdentitySentence` | **un-exported** (internal helper) |
| lib/sync/cursor-writer.mjs | 80 | `defaultPointerBody` | **un-exported** (internal helper) |
| lib/sync/cursor-writer.mjs | 164 | `extractUserAdditions` | **un-exported** (internal helper) |
| lib/plan-routing-sidecar.mjs | 353 | `unlinkSidecarTmp` | kept — code comment documents it as a deliberate re-export for external cleanup callers |
| lib/providers/copilot/matcher.mjs | 15 | `MAX_MATCHER_BYTES` | kept — spec-anchored limit constant (MATCHER_TOO_LARGE), plausibly exported for boundary tests |
| lib/repomap/index.mjs | 84 | `readManifest` | kept — module utility with public API JSDoc; part of the repomap module surface |
| lib/plan-routing-sidecar.mjs | 353 | `unlinkSidecarTmp` | possibly a test-teardown helper that lost its caller |
| lib/providers/copilot/matcher.mjs | 15 | `MAX_MATCHER_BYTES` | unused constant |
| lib/repomap/index.mjs | 84 | `readManifest` | used internally by `run()` in same file — over-exported, not dead; consider un-exporting |

## Orphan File Detection

**No issues found** (after dynamic-dispatch + public-api-entry suppression). All
26 raw candidates were dynamically-dispatched CLI verbs, hook helpers, or external
provider entry points.

## Unused Dependency Detection

**No issues found.** The 3 raw flags are all used via paths import-regex can't see:
- `tree-sitter-typescript` — loaded by the repomap tree-sitter grammar layer.
- `web-tree-sitter` — resolved via `require.resolve()` in `lib/repomap/check-deps.mjs`.
- `@dotenvx/dotenvx` — invoked as a binary, not imported.
- `typescript` (devDep) — used by the repomap eval harness (ADR 0002).

## Stale Code Detection

0 high · 31 informational. With orphans/dead-files at ~0, no stale file is also
unreferenced, so there are no high-severity stale findings. The 31 are stable
files older than the 30-day threshold but still actively referenced — normal for
a mature codebase. Not actionable.

## Duplicate Logic Detection

**Not run.** Tree-sitter is available, but full pairwise AST comparison across 167
in-scope files is O(n²) and was deferred for cost. Run `/adev:codehealth --check
duplicate-logic` if needed.

## Follow-up

- The real find here was the **repomap-exclude gap** (worktree pollution), now
  fixed in `manifest.yaml` (`repomap.exclude` += `.claude/**`,
  `.context-index/hygiene/**`).
- Done: trimmed 4 of the 7 dead-export candidates (un-exported internal helpers
  in `lib/sync/cursor-writer.mjs`); the other 3 were intentional public API and
  kept.
- Consider teaching the repomap graph about the CLI verb table so future scans
  don't need manual dynamic-dispatch suppression.
