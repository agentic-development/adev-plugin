---
name: adev:codehealth
description: "Proactively scan source code for dead exports, orphan files, unused dependencies, stale code, and duplicate logic. Produces severity-tiered reports from repomap artifacts. Use when the user says 'check code health', 'find dead code', 'unused exports', 'stale files', 'orphan files', 'unused dependencies', or wants to identify cleanup opportunities before refactoring. In Codex, invoke with $adev:codehealth"
---

# Code Health Scanner

Scan source code for dead exports, orphan files, unused dependencies, stale code, and duplicate logic. Produces a severity-tiered markdown report from `/adev:repomap` artifacts.

**Announce at start:** "I'm using the adev:codehealth skill to scan for code health issues."

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| *(none)* | — | Full scan: all passes against all `hygiene.source_roots` |
| `--module <slug>` | No | Restrict scan to a single manifest module's paths |
| `--check <name>` | No | Comma-separated check filter. Valid: `dead-exports`, `orphan-files`, `unused-deps`, `stale-code`, `duplicate-logic` |

Both `--module` and `--check` may be combined (intersection: only named checks, only files in the module).

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

> **MISSING_REPOMAP:** Repomap artifacts not found. Run `/adev:repomap` first to generate the symbol index and dependency graph.

Stop without running any passes.

### 3. Argument Validation

If `--module <slug>` is provided, resolve against `manifest.yaml` `modules[].slug`. If not found:

> **UNKNOWN_MODULE:** Unknown module '`<slug>`'. Available modules: `<comma-separated list of slugs>`.

If `--check <name>` is provided, validate each name against the allowlist: `dead-exports`, `orphan-files`, `unused-deps`, `stale-code`, `duplicate-logic`. If any is unrecognized:

> **UNKNOWN_CHECK:** Unknown pass '`<name>`'. Valid passes: dead-exports, orphan-files, unused-deps, stale-code, duplicate-logic.

### 4. File Scope Resolution

Resolve the set of files to scan:

1. Load `hygiene.source_roots` from manifest (e.g., `["cli/", "hooks/", "skills/", "templates/"]`)
2. If `--module <slug>` provided: intersect with the module's `paths` from `manifest.yaml` `modules[]`
3. Subtract `hygiene.coverage_exclude` glob patterns (e.g., `["tests/**", "skills/*/evals/**"]`)
4. The resulting file list is the scan scope for all passes

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill codehealth
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

---

## Detection Passes

Execute passes in this fixed order. If `--check` is provided, skip passes not in the filter.

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
     - If no such edge exists, the symbol is a dead-export candidate.
   - **Suppression by non-code references (rev-2 schema):** If the node carries `tags` including `"public-api-entry"`, OR if `symbol-ranks.json` records `referenceSources[]` containing `"package-exports"` or `"doc-reference"` for this symbol, the symbol is NOT dead — skip it. The new `referenceSources[]` field encodes inbound references that the static `.mjs`-only edge analysis cannot see (SKILL.md prose mentions; `package.json:exports` entries).

3. Cross-reference with `.context-index/hygiene/symbol-ranks.json` to get `line` number for each dead export.
   If `symbol-ranks.json` has unexpected format, skip line number enrichment with note:
   > **FORMAT_ERROR:** symbol-ranks.json format error — line numbers unavailable.

4. **Severity classification:**
   - **high:** The dead export is the *only* export in its file (entire file may be dead code).
   - **medium:** The dead export coexists with other referenced exports in the same file.
   - **low:** The symbol's file appears as the `to` target of an edge with `type: "re-export"` (barrel file re-export — may be consumed externally outside the project).

   Tolerance contract: Unknown `edge.type` values introduced by future schema evolutions (e.g., the rev-2 `"doc-reference"` type) MUST NOT cause this pass to crash; treat unknown types as informational and continue.

5. Emit findings: `{ pass: "dead-exports", severity, file_path, line_number, symbol, description }`.

### Pass 2: Orphan File Detection (`orphan-files`)

**Goal:** Find source files not imported by any other file.

**Steps:**

1. From `dependency-graph.json`, collect all file paths appearing as `edge.to` in any edge. These are "imported files." (Note: `doc-reference` edges introduced in rev-2 of `core-parser-pipeline.spec.md` also populate `edge.to`, so a file referenced from a SKILL.md is counted here and will not be flagged as an orphan.)
2. For each node in `nodes[]` within the resolved file scope:
   - If the node's `path` does NOT appear in the "imported files" set, it is an orphan candidate.
3. **Exclude entry points** from orphan detection:
   - Files matching `**/cli.*` or `**/main.*` (CLI entry points)
   - Files listed as hook scripts in `hooks/hooks.json`
   - Files whose FileNode `tags` includes `"public-api-entry"` (rev-2 schema — these files are declared as the package's public API surface via `package.json:exports` and are consumed by external dependents not visible in the local graph).
   - Test files matching `hygiene.coverage_exclude` patterns

   **Do NOT blanket-exclude `**/index.*`.** A file named `index.mjs` because it *is* the entry point, having zero inbound edges, is exactly the failure this pass exists to catch — not a reason to exempt it (issue-u1jtc0, motivated by `lib/repomap/index.mjs`: a 1,973-line subtree with zero real callers that read as alive purely because the old exclusion hid it). An `index.*` candidate goes through step 4's verification like any other file; it is excluded only if that verification actually finds a consumer.
4. **Verify candidates against real consumers** (required for every orphan candidate, `index.*` files included — this step is what step 3's `public-api-entry` and hook exclusions used to skip past for `index.*` files without checking):
   - Grep hook shell scripts (`hooks/*.sh`) for the module's filename or its exported symbol names. Hooks often contain inline Node.js blocks with dynamic `import()` calls that reference library modules — these are invisible in the static `.mjs` dependency graph but are real consumers.
   - Grep `package.json`'s `scripts` section for the file's path.
   - Grep `cli/index.mjs`'s verb dispatch table (and `lib/cli/*.mjs`) for an `import(...)` referencing the file's containing module — a lib subtree with a real CLI verb is not orphaned even if the entry point itself has no in-repo importer.
   - A candidate cleared by any of the three checks above is not an orphan. A candidate that clears NONE of them is a genuine finding — do not exempt it just because its name matches `**/index.*`.
5. **Severity classification:**
   - **high:** The orphan file has no outgoing edges either (imports nothing and is imported by nothing — fully isolated).
   - **medium:** The orphan file has outgoing edges (imports others but nobody imports it — possible unused entry point). An `index.*` file that fails step 4's verification lands here: it typically imports its own submodules (outgoing edges) while nothing imports it back.
6. Emit findings: `{ pass: "orphan-files", severity, file_path, description }`.

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
   - **high:** The stale file also has zero references — either an orphan-file finding exists for this file, OR a dead-export finding exists for this file **at `high` severity** (meaning the export list is empty of referenced symbols — see the dead-exports row of the Severity Reference table: "Only export in file"). A `medium`-severity dead-export finding ("Coexists with other referenced exports in the same file") does NOT qualify — the file has at least one live reference and is not actually unreferenced, no matter how many of its other exports are dead.
   - **low:** The stale file is still actively referenced (stable code, not necessarily problematic) — this includes files whose only cross-reference finding is a `medium`-severity dead export.
7. Emit findings: `{ pass: "stale-code", severity, file_path, description: "Last modified: <date>. Module last active: <date>." }`.

### Pass 5: Duplicate Logic Detection (`duplicate-logic`)

**Goal:** Find structurally similar or identical function bodies across files.

**Prerequisite:** Check if tree-sitter is available at runtime (use the same detection mechanism as `/adev:repomap` — check for `web-tree-sitter` module availability). If tree-sitter is NOT available:

> **TREESITTER_UNAVAILABLE:** Duplicate logic detection skipped — tree-sitter not available. Run `/adev:repomap` with tree-sitter enabled for this pass. (Per ADR-0001, tree-sitter is optional.)

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

**Persona adaptation:** The report written to disk always uses the full format below. The chat summary presented to the user should follow the active persona's output rules.

```yaml
---
date: <ISO 8601 timestamp>
module_filter: <--module value or "all">
check_filter: <--pass value or "all">
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

Skipped — tree-sitter not available. Run `/adev:repomap` with tree-sitter enabled.
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
