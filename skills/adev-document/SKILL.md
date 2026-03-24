---
name: adev-document
description: "Generate human-readable developer documentation in docs/ from repomap output. Produces docs/architecture.md (module map, dependency flow, entry points, ADR links), docs/modules/<slug>.md for each module, and docs/GENERATED.md manifest. Use when the user runs /adev-document, wants to generate project docs, or wants to update architecture documentation."
---

# Generate Developer Documentation

Produce human-readable documentation in `docs/` from `.context-index/` artifacts. This skill transforms machine-readable repomap outputs into navigable docs for developers onboarding to or maintaining the codebase.

## Arguments

- No arguments: generate all documentation (architecture + all module pages + manifest)
- `--module <slug>`: regenerate only the `docs/modules/<slug>.md` page for a single module
- `--check`: compute what would change and output a diff without writing any files to disk
- `--force`: regenerate all generated sections unconditionally, even if the file has not changed. Human content (after `<!-- adev:generated -->` zone, delimited by `<!-- adev:human -->`) is always preserved. Files that are human-owned (have `<!-- adev:human -->` but no `<!-- adev:generated -->`) are still skipped with a warning even under `--force`.

## Precondition Checks

Before doing any work, verify each required input exists. Stop immediately on the first failure.

1. Check `.context-index/hygiene/dependency-graph.json` exists.
   - If missing: output error `"Run /adev-repomap first. /adev-document requires the dependency graph."` and stop.

2. Check `.context-index/hygiene/symbol-ranks.json` exists.
   - If missing: output error `"Run /adev-repomap first. /adev-document requires the symbol index."` and stop.

3. Check `.context-index/manifest.yaml` exists.
   - If missing: output error `"Run /adev-init first. /adev-document requires manifest.yaml."` and stop.

4. If `docs/` does not exist, create it now (do not error — this is an expected first-run condition).

## Marker Protocol

Every file managed by this skill uses a two-zone layout. The markers divide generated content from human-authored content:

```
<!-- adev:generated -->
<!-- adev:human -->
```

**Canonical file layout:**

```
[generated content — owned by /adev-document]

<!-- adev:generated -->

[human content — owned by the developer, never overwritten]

<!-- adev:human -->
```

**Rules — apply before every write:**

| Condition | Action |
|-----------|--------|
| Both `<!-- adev:generated -->` and `<!-- adev:human -->` present | Preserve all content after `<!-- adev:human -->` verbatim. Regenerate everything before and including `<!-- adev:generated -->`. |
| `<!-- adev:human -->` present but `<!-- adev:generated -->` absent | File is human-owned. do NOT overwrite. Emit warning: `"Skipping <path>: file is human-owned (<!-- adev:human --> present but no <!-- adev:generated --> marker). Use --force to override."` Exit 0. |
| `<!-- adev:generated -->` present but `<!-- adev:human -->` absent | Regenerate the entire file. No human section to preserve. |
| Neither marker present | Write fresh content with both markers appended at the end. |

When `--force` is set, regenerate all generated content unconditionally (skip the "unchanged" optimization). Human-owned files (row 2 in the table above — `<!-- adev:human -->` present but no `<!-- adev:generated -->`) are still skipped with a warning. `--force` never removes the `<!-- adev:human -->` content boundary.

When `--check` is set, compute what the new content would be, diff it against the current file (or show the full content as an addition if the file does not exist), print the diff to stdout, and do NOT write to disk. When both `--force` and `--check` are set, `--check` takes precedence: compute the forced regeneration diff but do not write.

## Step 1: Generate docs/architecture.md

### 1.1 Load Inputs

Read the following files (skip gracefully if optional files are missing):

| File | Required | Purpose |
|------|----------|---------|
| `.context-index/hygiene/dependency-graph.json` | Yes | Module dependency edges, inbound/outbound counts |
| `.context-index/hygiene/symbol-ranks.json` | Yes | Exported symbols ranked by reference count |
| `.context-index/manifest.yaml` | Yes | Module list, project metadata |
| `.context-index/constitution.md` | Optional | Project principles (referenced in ADR links section) |
| `.context-index/platform-context.yaml` | Optional | Runtime environment metadata |
| `.context-index/specs/features/*/charter.md` | Optional | Per-module charter files (Business Intent field) |

### 1.2 Build Module Map

Produce a markdown table with one row per module declared in `manifest.yaml`:

| Column | Source |
|--------|--------|
| **Module** | Module name from `manifest.yaml` |
| **Purpose** | "Business Intent" field from the corresponding charter file in `.context-index/specs/features/<module>/charter.md`. If no charter file exists for this module, use the description from `manifest.yaml` or leave blank. |
| **Key Exports** | Top 3 symbols from `symbol-ranks.json` whose `file` path falls under the module's path prefix. List as comma-separated identifiers. |
| **Inbound** | Count of inbound edges for this module from `dependency-graph.json` (other modules that import from it). |
| **Outbound** | Count of outbound edges for this module from `dependency-graph.json` (modules this module imports from). |

### 1.3 Build Dependency Flow

Write a prose paragraph (3–6 sentences) summarizing the dependency topology derived from `dependency-graph.json` edges. Identify:

- **Core modules**: high inbound, low outbound (other modules depend on them).
- **Leaf consumers**: low inbound, high outbound (they consume core modules but are not themselves depended upon).
- **Middleware modules**: moderate inbound and outbound (pass-through orchestrators).

Name the top 2–3 modules in each category if they can be identified from the data.

### 1.4 Identify Entry Points

Entry points are files with **zero inbound edges** as recorded in `dependency-graph.json`. Do NOT use `symbol-ranks.json` for this determination — the dependency graph is the authoritative source for import topology.

List each entry point as a relative path from the project root. If more than 10 entry points are found, list the first 10 and append `... and N more`.

### 1.5 Build ADR Links

Use Glob to find all files matching `.context-index/adrs/*.md`. Exclude any file whose name ends with `.template.md`.

For each ADR file found:
- Read the first 10 lines to extract the `status:` frontmatter field (e.g., `accepted`, `proposed`, `superseded`, `deprecated`).
- Produce a markdown link: `- [<filename without extension>](<relative path>) — <status>`

If no ADR files exist (after excluding templates), omit this section from the output entirely.

### 1.6 Assemble docs/architecture.md

Build the file content with this structure:

```markdown
# Architecture

> Generated by /adev-document on <ISO timestamp>. Edit content below <!-- adev:human --> to add permanent notes.

## Module Map

<table from Step 1.2>

## Dependency Flow

<prose paragraph from Step 1.3>

## Entry Points

<list from Step 1.4>

## Architecture Decision Records

<links from Step 1.5, or omit section if no ADRs>

<!-- adev:generated -->

<!-- adev:human -->
```

Apply the marker protocol (Step "Marker Protocol" above) before writing `docs/architecture.md`.

If `--check` is set: compute the new content, diff against `docs/architecture.md` (or show full addition if it does not exist), print to stdout, do not write.

## After Generation

On completion, print a summary:

```
Documentation generated:

  docs/architecture.md       — module map, dependency flow, entry points, ADRs
  docs/modules/<slug>.md     — per-module purpose, exports, dependencies, specs
  docs/GENERATED.md          — manifest of all generated doc files

Run /adev-document --check to preview changes before regenerating.
```

If `--check` was set, print instead:

```
/adev-document --check: no files were written.
<diff output>
```

## Step 2: Generate docs/modules/<slug>.md

### 2.1 Slug Validation (for --module <slug> only)

Before performing any file system operations when `--module` is provided:

1. Validate the slug matches `^[a-z0-9_-]+$`. Reject any slug containing `/`, `\`, `..`, null bytes, or characters outside this set.
   - On failure: output error `"Invalid module slug '<slug>'. Slugs must match [a-z0-9_-]."` and exit 1.
2. Construct the resolved path: `path.resolve(projectRoot, 'docs/modules', slug + '.md')`.
3. Assert the resolved path starts with `path.resolve(projectRoot, 'docs/modules')`. This is the path traversal boundary check — prevents path traversal attacks via `..` sequences.
   - On failure: output error and exit 1.

### 2.2 Determine Modules to Process

- If `--module <slug>` is provided: process only that module. If the slug is not found in `manifest.yaml`, output error `"Module '<slug>' not found in manifest."` and exit 1.
- Otherwise: process all modules listed in `manifest.yaml`.

### 2.3 Create docs/modules/ Directory

Create `docs/modules/` if it does not exist. If `docs/` does not exist, create it first.

### 2.4 For Each Module, Generate docs/modules/<slug>.md

Apply the Marker Protocol (from the Marker Protocol section above) to any existing file at `docs/modules/<slug>.md`.

Build the module doc with these sections:

**Purpose**
Read the module's charter at `.context-index/specs/features/<slug>/charter.md`. Extract the `## Business Intent` section. If no charter exists, infer the purpose from the module's `paths` entries in `manifest.yaml`.

**Key Exports**
Filter `symbol-ranks.json` to symbols whose file path begins with any of the module's `paths` from `manifest.yaml`. Take up to 10 symbols ordered by importance score descending. For each, include:
- Symbol name, kind (function / class / interface / type / const), file location, and importance score.

If no symbols are found for the module, write: "No symbols indexed — run /adev-repomap to populate."

**Dependencies**
From `dependency-graph.json`:
- **Inbound** (modules that import from this module): list module names
- **Outbound** (modules this module imports from): list module names

If the dependency graph has no data for this module, write: "No dependency data — run /adev-repomap to populate."

**Related Specs**
Glob `.context-index/specs/features/<slug>/`. For each `.md` file found (excluding `*.review.md`, `*.plan.md`), produce a relative markdown link. If no directory exists, write: "No specs found."

**Template:**

```markdown
# Module: <name>

> Generated by /adev-document on YYYY-MM-DD.

## Purpose

<charter Business Intent or inferred>

## Key Exports

| Symbol | Kind | Location | Score |
|--------|------|----------|-------|
| ...    | ...  | ...      | N     |

## Dependencies

**Inbound (modules that depend on this):** Module A, Module B

**Outbound (modules this depends on):** Module C

## Related Specs

- [charter.md](.context-index/specs/features/<slug>/charter.md)

<!-- adev:generated -->
<!-- adev:human -->
```

### 2.5 --force Behaviour

When `--force` is set, skip diff comparison and regenerate all sections unconditionally. The `<!-- adev:human -->` preservation invariant still applies — human content is never overwritten. If a module doc has `<!-- adev:human -->` but no `<!-- adev:generated -->` marker, `--force` does NOT override the skip — the file is still skipped with a warning.

### 2.6 --check Behaviour

When `--check` is set, output the diff for each module doc that would change. Do not write any files.

## Step 3: Generate docs/GENERATED.md

This step runs after Steps 1 and 2 as part of every `/adev-document` invocation.

### 3.1 Precondition Check

If `docs/` does not exist at this point, output error:
> "docs/ not found. Run /adev-document to generate docs first."
Exit 1.

If `docs/` exists but contains no generated files (no `docs/architecture.md` and no files in `docs/modules/`), emit:
> "No generated docs found. Skipping GENERATED.md."
Exit 0.

### 3.2 Read Current Commit SHA

Run `git rev-parse --short HEAD` to get the current short SHA (7 hex characters).
Validate the output matches `^[0-9a-f]{7}$`. If it does not (e.g., not a git repo or no commits), use `"unknown"` as the value.

### 3.3 Read or Initialize the Manifest

If `docs/GENERATED.md` exists:
- Attempt to parse the markdown table. A valid table has a header row, a separator row (`|---|`), and data rows.
- If parsing fails (malformed table structure — cannot be parsed): treat as missing, emit warning:
  > "GENERATED.md was malformed and has been regenerated."
  Proceed as if the file does not exist.
- If parsing succeeds: load existing rows as a map keyed by file path.

If `docs/GENERATED.md` does not exist: start with an empty map.

### 3.4 Build the Updated Manifest Table

Enumerate all generated files in `docs/`. A file is "generated" if it was produced in the current run (architecture.md, and any modules/<slug>.md written in Steps 1-2).

For each generated file, build a row:
- **File**: relative path from project root (e.g., `docs/architecture.md`)
- **Generated Sections**: pipe-delimited list of top-level section headings in the file
- **Last Commit**: 7-character short SHA from Step 3.2
- **Last Run**: today's date in YYYY-MM-DD format

For unchanged files (in the existing manifest but not regenerated in this run): keep their existing row as-is.

Sanitize all values before inserting into the table:
- File paths: strip `|`, `\n`, `\r` characters
- SHA: already validated as hex
- Section names: strip `|`, `\n`, `\r` characters

### 3.5 Write docs/GENERATED.md

```markdown
# Generated Documentation Manifest

> Managed by /adev-document. Do not edit rows manually — run /adev-document to regenerate.

| File | Generated Sections | Last Commit | Last Run |
|------|--------------------|-------------|----------|
| docs/architecture.md | Module Map \| Dependency Flow \| Entry Points \| ADRs | abc1234 | 2026-03-23 |
| docs/modules/cli.md | Purpose \| Key Exports \| Dependencies \| Related Specs | abc1234 | 2026-03-23 |
```

### 3.6 --force Behaviour

When `--force` is set: update all rows (even unchanged files) with the current commit SHA and today's date.

### 3.7 --check Behaviour

When `--check` is set: output the diff of what rows would change without writing `docs/GENERATED.md`.
