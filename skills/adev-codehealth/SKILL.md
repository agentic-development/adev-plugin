---
name: adev-codehealth
description: "Proactively scan source code for dead exports, orphan files, unused dependencies, stale code, and duplicate logic. Produces severity-tiered reports from repomap artifacts. Use when the user says 'check code health', 'find dead code', 'unused exports', 'stale files', 'orphan files', 'unused dependencies', or wants to identify cleanup opportunities before refactoring."
---

# Code Health Scanner

Scan source code for dead exports, orphan files, unused dependencies, stale code, and duplicate logic. Produces a severity-tiered markdown report from `/adev-repomap` artifacts.

**Announce at start:** "I'm using the adev-codehealth skill to scan for code health issues."

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| *(none)* | — | Full scan: all passes against all `hygiene.source_roots` |
| `--module <slug>` | No | Restrict scan to a single manifest module's paths |
| `--pass <name>` | No | Comma-separated pass filter. Valid: `dead-exports`, `orphan-files`, `unused-deps`, `stale-code`, `duplicate-logic` |

Both `--module` and `--pass` may be combined (intersection: only named passes, only files in the module).

## Prerequisites

Complete these checks in order. Stop at the first failure.

### 1. Manifest Validation

Read `.context-index/manifest.yaml`. If missing or unreadable:

> **INVALID_MANIFEST:** Missing or invalid manifest.yaml — `source_roots` is required for codehealth scanning.

Verify `hygiene.source_roots` exists and is a non-empty list. If absent:

> **INVALID_MANIFEST:** manifest.yaml is missing `hygiene.source_roots` — required for codehealth scanning.

### 2. Repomap Artifact Validation

Check that both files exist:
- `.context-index/hygiene/symbol-ranks.json`
- `.context-index/hygiene/dependency-graph.json`

If either is missing:

> **MISSING_REPOMAP:** Repomap artifacts not found. Run `/adev-repomap` first to generate the symbol index and dependency graph.

Stop without running any passes.

### 3. Argument Validation

If `--module <slug>` is provided, resolve against `manifest.yaml` `modules[].slug`. If not found:

> **UNKNOWN_MODULE:** Unknown module '`<slug>`'. Available modules: `<comma-separated list of slugs>`.

If `--pass <name>` is provided, validate each name against the allowlist: `dead-exports`, `orphan-files`, `unused-deps`, `stale-code`, `duplicate-logic`. If any is unrecognized:

> **UNKNOWN_PASS:** Unknown pass '`<name>`'. Valid passes: dead-exports, orphan-files, unused-deps, stale-code, duplicate-logic.

### 4. File Scope Resolution

Resolve the set of files to scan:

1. Load `hygiene.source_roots` from manifest (e.g., `["cli/", "hooks/", "skills/", "templates/"]`)
2. If `--module <slug>` provided: intersect with the module's `paths` from `manifest.yaml` `modules[]`
3. Subtract `hygiene.coverage_exclude` glob patterns (e.g., `["tests/**", "skills/*/evals/**"]`)
4. The resulting file list is the scan scope for all passes

---

## Detection Passes

Execute passes in this fixed order. If `--pass` is provided, skip passes not in the filter.

**Scope types:** Passes 1 and 2 are *dependency-graph-scoped* (analyze only files present in `dependency-graph.json` nodes). Passes 3 and 4 are *file-system-scoped* (scan all files within resolved `source_roots`). Pass 5 requires tree-sitter at runtime.

### Pass 1: Dead Export Detection (`dead-exports`)

**Goal:** Find exported symbols with zero imports across the codebase.

**Steps:**

1. Read `.context-index/hygiene/dependency-graph.json`. Parse `nodes[]` and `edges[]`.
   If the JSON has unexpected format, skip this pass with note:
   > **FORMAT_ERROR:** dependency-graph.json format error — pass skipped.

2. For each node in `nodes[]` within the resolved file scope:
   - For each symbol in the node's `exports[]`:
     - Search all `edges[]` for an edge where `edge.to` matches the node's `path` AND the symbol appears in `edge.symbols[]`.
     - If no such edge exists, the symbol is a dead export.

3. Cross-reference with `.context-index/hygiene/symbol-ranks.json` to get `line` number for each dead export.
   If `symbol-ranks.json` has unexpected format, skip line number enrichment with note:
   > **FORMAT_ERROR:** symbol-ranks.json format error — line numbers unavailable.

4. **Severity classification:**
   - **high:** The dead export is the *only* export in its file (entire file may be dead code).
   - **medium:** The dead export coexists with other referenced exports in the same file.
   - **low:** The symbol's file appears as the `to` target of an edge with `type: "re-export"` (barrel file re-export — may be consumed externally outside the project).

5. Emit findings: `{ pass: "dead-exports", severity, file_path, line_number, symbol, description }`.

### Pass 2: Orphan File Detection (`orphan-files`)

**Goal:** Find source files not imported by any other file.

**Steps:**

1. From `dependency-graph.json`, collect all file paths appearing as `edge.to` in any edge. These are "imported files."
2. For each node in `nodes[]` within the resolved file scope:
   - If the node's `path` does NOT appear in the "imported files" set, it is an orphan candidate.
3. **Exclude entry points** from orphan detection:
   - Files matching `**/index.*` (barrel files / entry points)
   - Files matching `**/cli.*` or `**/main.*` (CLI entry points)
   - Files listed as hook scripts in `hooks/hooks.json`
   - Test files matching `hygiene.coverage_exclude` patterns
4. **Severity classification:**
   - **high:** The orphan file has no outgoing edges either (imports nothing and is imported by nothing — fully isolated).
   - **medium:** The orphan file has outgoing edges (imports others but nobody imports it — possible unused entry point).
5. Emit findings: `{ pass: "orphan-files", severity, file_path, description }`.

### Pass 3: Unused Dependency Detection (`unused-deps`)

**Goal:** Compare `package.json` dependencies against actual imports in source files.

**Steps:**

1. Read `package.json` from the project root. If missing, skip this pass with note:
   > **MISSING_PACKAGE_JSON:** package.json not found — unused dependency detection skipped.

2. Collect all package names from `dependencies` and `devDependencies`.
3. Scan all source files within the resolved `source_roots` (not just dependency graph nodes) for import patterns:
   - `import ... from '<package>'` or `import ... from '<package>/...'`
   - `import('<package>')` or `import('<package>/...')`
   - `require('<package>')` or `require('<package>/...')` (included for consumer project compatibility — this project is pure ESM per constitution)
4. For each package not matched by any import pattern:
   - **Severity:**
     - **high:** Package is in `dependencies` (production dependency, definitely unused).
     - **medium:** Package is in `devDependencies` (may be used by scripts, tooling, or test runners not captured by import analysis).
5. Emit findings: `{ pass: "unused-deps", severity, file_path: "package.json", symbol: "<package-name>", description }`.

### Pass 4: Stale Code Detection (`stale-code`)

**Goal:** Flag files not modified recently relative to their module's activity.

**Steps:**

1. Read `hygiene.staleness_threshold_days` from manifest (default: 30 if absent).
2. For each source file within the resolved scope, run:
   ```bash
   git log -1 --format=%ci -- <file-path>
   ```
   Extract the last commit date. If `git log` fails or git is unavailable, skip this pass with note:
   > **GIT_UNAVAILABLE:** git not available or git log failed — stale code detection skipped.

3. Group files by module (from `manifest.yaml` `modules[].paths`).
4. For each module, find the most recent commit date across all its files.
5. For each file whose last commit date is older than `staleness_threshold_days` ago:
   - **Skip if uniformly old:** If ALL files in the module have the same "most recent" date (the entire module is uniformly aged), emit no staleness findings for that module.
   - Otherwise, check if the file also appears as a dead export or orphan finding from earlier passes.
6. **Severity classification:**
   - **high:** The stale file also has zero references (dead export or orphan finding exists for this file).
   - **low:** The stale file is still actively referenced (stable code, not necessarily problematic).
7. Emit findings: `{ pass: "stale-code", severity, file_path, description: "Last modified: <date>. Module last active: <date>." }`.

### Pass 5: Duplicate Logic Detection (`duplicate-logic`)

**Goal:** Find structurally similar or identical function bodies across files.

**Prerequisite:** Check if tree-sitter is available at runtime (use the same detection mechanism as `/adev-repomap` — check for `web-tree-sitter` module availability). If tree-sitter is NOT available:

> **TREESITTER_UNAVAILABLE:** Duplicate logic detection skipped — tree-sitter not available. Run `/adev-repomap` with tree-sitter enabled for this pass. (Per ADR-0001, tree-sitter is optional.)

Skip this pass entirely.

**Steps (if tree-sitter available):**

1. For each source file within the resolved scope, parse with tree-sitter to extract function/method AST nodes.
2. For each pair of functions across different files, compare structural similarity:
   - Normalize variable names (replace with positional placeholders).
   - Compare AST node types and structure.
3. **Severity classification:**
   - **high:** Exact duplicates (identical function bodies after normalization).
   - **medium:** Structurally similar (same AST shape, different variable names or literal values).
4. Emit findings: `{ pass: "duplicate-logic", severity, file_path, line_number, symbol, description: "Duplicate of <other-file>:<line> (<symbol>)" }`.

---

## Severity Reference

| Pass | High | Medium | Low |
|------|------|--------|-----|
| dead-exports | Only export in file | Coexists with referenced exports | Re-export target |
| orphan-files | Fully isolated (no edges) | Has outgoing edges only | — |
| unused-deps | `dependencies` package | `devDependencies` package | — |
| stale-code | Stale + unreferenced | — | Stale but referenced |
| duplicate-logic | Exact duplicate | Structural similarity | — |

---

## Report Generation

After all passes complete, generate the report.

### Report Path

`.context-index/reports/codehealth-<YYYY-MM-DD>.md`

Create the `.context-index/reports/` directory if it does not exist. If a report for today's date already exists, overwrite it (idempotent).

If unable to write:

> **WRITE_ERROR:** Unable to write report — check directory permissions.

### Report Format

```yaml
---
date: <ISO 8601 timestamp>
module_filter: <--module value or "all">
pass_filter: <--pass value or "all">
total_findings: <count>
summary:
  high: <count>
  medium: <count>
  low: <count>
---
```

#### Summary Table

```markdown
# Code Health Report

| Pass | High | Medium | Low | Total |
|------|------|--------|-----|-------|
| Dead Export Detection | N | N | N | N |
| Orphan File Detection | N | N | N | N |
| Unused Dependency Detection | N | N | N | N |
| Stale Code Detection | N | N | N | N |
| Duplicate Logic Detection | N | N | N | N |
| **Total** | **N** | **N** | **N** | **N** |
```

#### Per-Pass Sections

For each pass that ran:

**If findings exist:**

```markdown
## Dead Export Detection

| Severity | File | Line | Symbol | Description |
|----------|------|------|--------|-------------|
| high | src/utils/old.mjs | 12 | unusedHelper | Only export in file, zero references |
| medium | src/lib/api.mjs | 45 | legacyFetch | Coexists with 3 referenced exports |
```

Sort findings by severity (high first), then file path ascending, then line number ascending. Show `—` for optional fields (Line, Symbol) when absent.

**If zero findings:**

```markdown
## Dead Export Detection

No issues found.
```

**If pass was skipped:**

```markdown
## Duplicate Logic Detection

Skipped — tree-sitter not available. Run `/adev-repomap` with tree-sitter enabled.
```

#### Malformed Findings

If any finding is missing required fields (`pass`, `severity`, `file_path`, `description`), skip it and note in the report:

> **MALFORMED_FINDING:** N finding(s) omitted due to missing data.

#### Empty Results

If ALL passes produced zero findings:

```markdown
# Code Health Report

**No code health issues found.**

| Pass | High | Medium | Low | Total |
|------|------|--------|-----|-------|
| Dead Export Detection | 0 | 0 | 0 | 0 |
| ... | ... | ... | ... | ... |
| **Total** | **0** | **0** | **0** | **0** |
```

### Conversation Summary

After writing the report, print to the conversation:

```
Code health scan complete.

Findings: N high, N medium, N low (N total)

Top issues:
1. [high] src/utils/old.mjs:12 — unusedHelper: Only export in file, zero references
2. [high] package.json — lodash: Production dependency not imported anywhere
3. [medium] src/lib/api.mjs:45 — legacyFetch: Coexists with 3 referenced exports

Full report: .context-index/reports/codehealth-<date>.md
```

Show top 3 findings sorted by severity descending, then file path ascending. If zero findings:

```
Code health scan complete. No issues found.

Full report: .context-index/reports/codehealth-<date>.md
```
