---
name: adev:specify
description: "Author Live Specs within a Feature Charter's scope. Supports modes for new features, extraction from existing code, refactoring, diff-driven changes, and cross-cutting concerns. Use when the user says 'write a spec', 'define the behavior', 'create a contract', 'specify the feature', or needs to formalize requirements into a behavioral specification before planning."
---

# Write a Live Spec

Author a Live Spec that defines a behavioral contract for implementation, scoped to an existing Feature Charter. The spec becomes the single source of truth for what `/adev:plan` decomposes and `/adev:implement` builds.

## Output Directive: Artifact-to-Disk Summarization

**CRITICAL:** When producing the spec document, follow this two-step pattern:

1. **Write** the full spec to disk using the Write tool (same as today — full content at the spec file path)
2. **Present** ONLY a structured summary to the user. Do NOT echo the full spec content in your response.

**Summary format (max ~500 tokens), used by EVERY mode:**

```
<Mode> Spec created:
  <spec-path>

  Charter: <module>            (omit for cross-cutting; show "Affects: N modules")
  Status: draft
  Milestone: <phase or —>
  Behaviors: <N>
  Error cases: <N> (<N> unhandled)
  Tasks: <N>                   (extract → "Coverage gaps: N"; from-diff → "Gaps identified: N";
                                refactor → "Migration steps: N / Invariants: N")
  Acceptance criteria: <N>

Next steps:
  - Review the spec: read <spec-path>
  - Submit for architecture review: /adev:review-specs
  - Or write another spec: /adev:specify <module>
```

**What NOT to include in the chat response:**
- The full behavioral contract, error case table, or acceptance criteria list
- The filled template body or its frontmatter block
- The Module Impact / Integration Points / Migration Path tables in full (report counts)

These are all written to disk and available via `Read <spec-path>`. The user or next skill reads from disk, not from conversation history.

This directive governs the **final** write-up only. The interactive authoring steps still present their content in chat — you cannot get the user's answers about behaviors and error cases from a file that does not exist yet.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| *(positional)* | No | Feature module name or capability hint (e.g., `task-boards` or `"add drag-and-drop reordering"`) |
| `--charter <module>` | No | Explicit parent charter. Required when multiple charters exist and the positional arg is ambiguous. |
| `--title <title>` | No | Spec title. Prompted interactively if omitted. |
| `--extract` | No | Extract mode: reverse-engineer a spec from existing code. |
| `--refactor` | No | Refactor mode: current state + target state + migration path. |
| `--from-diff` | No | From-diff mode: generate a retroactive spec from a git diff or PR. |
| `--cross-cutting` | No | Cross-cutting mode: spec spans multiple charters (auth, logging, error handling, etc.). |

Modes are mutually exclusive. If none is specified, standard mode is used.

## Prerequisites

Verify before running: (1) `.context-index/` exists — if not, tell the user to run `/adev:init` first; (2) `.context-index/constitution.md` exists and is non-empty; (3) at least one Feature Charter exists under `.context-index/specs/features/`, except in `--cross-cutting` mode which only needs the constitution and product charter.

If any prerequisite fails, stop and explain what is missing. Do not generate a spec without a charter anchor (cross-cutting excepted).

## Mode Reference

| Mode | Flag | Input | Output Location | Template |
|------|------|-------|-----------------|----------|
| Standard | *(default)* | Charter capability | `.context-index/specs/features/<module>/<spec-slug>.md` | `live-spec-template.md` |
| Extract | `--extract` | Existing source code | `.context-index/specs/features/<module>/<spec-slug>.md` | `live-spec-template.md` |
| Refactor | `--refactor` | Existing code + target description | `.context-index/specs/features/<module>/<spec-slug>.md` | `refactoring-spec-template.md` |
| From-Diff | `--from-diff` | Git diff or PR | `.context-index/specs/features/<module>/<spec-slug>.md` | `live-spec-template.md` |
| Cross-Cutting | `--cross-cutting` | Cross-module concern | `.context-index/specs/cross-cutting/<spec-slug>.md` | `live-spec-template.md` |

---

## Standard Mode (default)

The primary path. Takes a Feature Charter and produces a Live Spec for one capability within that charter.

### Step 1: Resolve Charter

1. Read all Feature Charters by scanning `.context-index/specs/features/*/charter.md`.
2. If `--charter <module>` is provided, load that charter directly. Error if it does not exist.
3. If a positional argument is provided, match it against charter module names. If ambiguous, list the matches and ask the user to pick one.
4. If no argument is provided and only one charter exists, use it. If multiple exist, list them (number — one-line description each) and ask:

```
→ Which charter should this spec belong to? (number or name)
```

### Step 2: Load Context

Read and hold in working memory: `.context-index/constitution.md` (principle references and gate validation), `.context-index/platform-context.yaml` (technology-aware decisions), the resolved Feature Charter (scope boundaries and capability list), `.context-index/specs/product.md` (cross-module awareness), any existing specs in the same module directory (avoid duplication), and `.context-index/references/**/*.md` if present (external interfaces this module must comply with).

### Step 3: Identify Capability

Present the charter's Capability Map as a numbered list alongside the existing specs in the module and their statuses, then ask:

```
→ Which capability should this spec cover? (number, name, or describe a new one)
```

If the user describes something not in the charter, warn them and offer: (1) add it to the charter first — recommended, via `/adev:brainstorm --module <module>`; (2) proceed anyway, and the spec notes it extends beyond current charter scope. On option 2, add frontmatter `charter-extension: true` plus a comment at the top of the spec noting the divergence.

### Step 4: Interactive Spec Authoring

Gather what the Live Spec template needs by asking focused questions. Do not dump a blank template for the user to fill. Guide them section by section:

**Behavioral Contract.** Ask what triggers the behavior, the expected outcome on success, and the failure scenarios. Write behaviors in the **When...then** format:

- **When** a user drags a card to a new position within the same column **then** the card's `position` field updates and all affected cards reindex.

Aim for 3-8 behavior statements. Each must be directly testable.

**Preconditions and Postconditions.** Derive from the behavioral statements — what must be true before execution, and what must be true after.

**Error Cases.** Build the error case table; each row needs condition, expected behavior, and status/error code. Propose the obvious ones (permission denied → 403, missing target → 404, concurrent edit → 409) and ask for additions.

**Constitution Reference.** Scan the constitution and select 2-4 relevant principles, explaining why each applies. Present them as `- "<principle>" — Applies because <reason>.` and ask whether any others should be referenced.

**Actionable Task Map.** A preliminary breakdown (task, description, estimated complexity) so reviewers can assess scope. This is not the full implementation plan — that is `/adev:plan`'s job.

**Acceptance Criteria.** Concrete and checkable. Every behavior statement maps to at least one criterion. Always include: all quality gates pass (tests, lint, typecheck), and no constitutional violations introduced.

### Step 5: Write the Spec

1. Generate the spec slug from the title: lowercase, kebab-case, no special characters (e.g. `drag-and-drop-reordering`).
2. Fill `${CLAUDE_PLUGIN_ROOT}/templates/live-spec-template.md` with all gathered content.
3. Set frontmatter:
   ```yaml
   charter: <module-name>
   status: draft
   milestone: <phase from charter capability map, if any>
   created: <today's date YYYY-MM-DD>
   ```
   **Milestone inheritance:** read the capability's Phase from the parent charter's Capability Map. If the capability has a phase, set `milestone` to match; if not, leave it empty. Always tell the user which milestone was inherited and let them override:
   ```
   The charter assigns this capability to phase "v1". Setting milestone: v1.
   → Keep this milestone, or override? (enter to confirm / type new value)
   ```
4. Save to `.context-index/specs/features/<module>/<spec-slug>.md`.
5. Report using the shared summary format from the Output Directive.

---

## Extract Mode (`--extract`)

For brownfield codebases. Reads existing source code and produces a "snapshot spec" that captures current behavior. This documents what IS, not what SHOULD BE.

**Step 1: Resolve Charter.** Same as standard mode — an extract spec belongs to a charter like any other spec.

**Step 2: Identify code to extract.** If given a module name, locate its files using the charter's file references, directory conventions, and `platform-context.yaml`. If given file paths, use those. List what you found (path, role, line count) and ask: extract from all of these, or select specific files?

**Step 3: Read and analyze.** For each selected file identify the public interface (exports, endpoints, component props), state mutations (database writes, state updates, side effects), error handling (try/catch, error responses, validation), and dependencies (imports, external services, queries).

**Step 4: Generate the snapshot spec**, where:

- **Behavioral Contract** describes observed, not intended, behavior. Mark it: `<!-- Extracted from existing code. Describes current behavior as of YYYY-MM-DD. -->`
- **Behaviors** derive from code paths, not user stories. Each public function or endpoint becomes one or more behavior statements.
- **Error Cases** come from existing error handling. Flag unhandled ones explicitly, e.g. `| Invalid user ID | ⚠ UNHANDLED — throws raw Prisma error | 500 |`
- **Actionable Task Map** is empty (the code exists). Replace it with a **Coverage Gaps** section listing issues found during extraction that may become future specs.
- **Constitution Reference** flags observed violations, marking each principle ✓ Compliant or ⚠ VIOLATION with the offending location.

Frontmatter adds `mode: extract` and an `extracted-from:` list of the analyzed files, alongside `charter:`, `status: draft`, and `created:`. Save to `.context-index/specs/features/<module>/<spec-slug>.md`.

**Step 5: Summary.** Use the shared format, reporting files analyzed, behaviors documented, error cases (with unhandled count), coverage gaps, and constitutional violations. State plainly that the spec captures current behavior and does NOT prescribe changes, then point to `/adev:specify --refactor <module>` for structural changes or `/adev:specify <module>` for new capabilities.

---

## Refactor Mode (`--refactor`)

Produces a refactoring spec with current state analysis, target state definition, a step-by-step migration path, and invariants that must hold throughout.

**Step 1: Resolve Charter.** Same as standard mode.

**Step 2: Identify scope.** Ask what code to refactor, what the problem with it is (performance, complexity, maintainability), and what the target state should look like.

**Step 3: Analyze current state.** Read the identified code and build: a **structure table** (file, role, line count, notes); **problems** stated specifically and measurably — not "the code is messy" but "the `processOrder` function is 340 lines with cyclomatic complexity of 28, handling 4 unrelated concerns"; and **dependencies** — what imports from, extends, or relies on this code, since those are migration constraints. If an extract spec already exists for this module, start from it rather than re-analyzing.

**Step 4: Define target state.** A target structure table and a mapping of how each Current State problem is resolved. Validate against the constitution and flag violations before proceeding, offering to revise the target or note a constitutional exception.

**Step 5: Build the migration path.** The critical section. Each step must be independently deployable (all tests pass after it), carry clear verification criteria and a risk assessment, and follow safe ordering (extract before modify, tests before refactor). Use `${CLAUDE_PLUGIN_ROOT}/templates/refactoring-spec-template.md`. Present the proposed path as numbered steps with description, risk, and verification, then ask: does this look right? (yes / reorder / add step / remove step)

**Step 6: Define invariants.** Properties that hold at every migration step. Always include: all existing tests continue to pass at every step; public API contracts do not change unless the spec explicitly permits it; no data loss or corruption during migration. Ask the user for domain-specific additions (response time budgets, audit log format stability, backward compatibility).

**Step 7: Write the behavioral contract.** Even for refactoring, define the target behavior — what the system does AFTER the refactoring completes. This gives `/adev:validate` something to verify against.

**Step 8: Write the spec.** Fill the refactoring template, set frontmatter (`charter:`, `status: draft`, `mode: refactor`, `created:`), and save to `.context-index/specs/features/<module>/<spec-slug>.md`.

**Step 9: Summary.** Shared format, reporting current state, target state, migration steps, invariants, behaviors, and acceptance criteria. Add: review the migration path carefully — it is the highest-risk section.

---

## From-Diff Mode (`--from-diff`)

Generates a retroactive Live Spec from a git diff or PR. Useful for documenting work done before adev was adopted, or for catching up on hotfixes that skipped the spec phase.

**Step 1: Identify the diff.** With no argument, use staged changes (`git diff --cached`), falling back to the working tree (`git diff`). With a commit range, use `git diff <range>`. With a branch name, `git diff main..<branch>`. With a PR number, fetch the PR diff. Report the changed files with added/deleted line counts and ask: generate a retroactive spec for these changes? (yes / narrow scope / cancel)

**Step 2: Resolve Charter.** Determine which module the changed files belong to and match against existing charters. If the changes span multiple modules, ask whether to create one spec or separate specs per module.

**Step 3: Analyze the diff.** For each changed file, identify behavior added (new functions, endpoints, UI elements), behavior modified (changed logic, updated validation, altered responses), and behavior removed.

**Step 4: Generate the retroactive spec**, where:

- **Behavioral Contract** describes behavior as it exists after the diff is applied.
- **Behaviors** map to the diff; each significant change becomes a behavior statement.
- **Error Cases** are extracted from new or modified error handling in the diff.
- **Actionable Task Map** is replaced with a **Changes Summary** table (file, change type, description).
- **Acceptance Criteria** use `[x]` for behaviors already present in the diff and `[ ]` for anything that appears missing (e.g. absent validation or test coverage), so gaps are visible.

Frontmatter adds `mode: from-diff` and `diff-source:` (commit range, branch name, or "working tree") alongside `charter:`, `status: draft`, and `created:`. Save to `.context-index/specs/features/<module>/<spec-slug>.md`.

**Step 5: Summary.** Shared format, reporting diff source, files analyzed, behaviors documented, and gaps identified. Note that this documents existing changes and that the gaps may need follow-up specs or immediate fixes.

---

## Cross-Cutting Mode (`--cross-cutting`)

Produces specs for concerns that span multiple features: authentication flows, error handling patterns, API versioning, logging standards, etc.

**Step 1: Prerequisites.** No Feature Charter required. Requires `.context-index/constitution.md` (mandatory) and `.context-index/specs/product.md` (recommended, for module awareness).

**Step 2: Identify the concern.** Ask what cross-cutting concern to spec (examples: authentication flow, error handling, API versioning, logging/observability, rate limiting, caching strategy) and which modules it touches (all / a specific list).

**Step 3: Load affected charters.** For each named module, load its charter and identify existing references to the concern.

**Step 4: Interactive spec authoring.** Same as standard mode (behavioral contract, constitution reference, task map, acceptance criteria), plus two extra sections:

- **Module Impact** — a table of module, impact level, and changes required.
- **Integration Points** — how the concern connects to each affected module, written as `**<module-a> ↔ <concern>:** <how they connect>`. Each integration point needs its own test.

**Step 5: Write the spec.** Fill `${CLAUDE_PLUGIN_ROOT}/templates/live-spec-template.md`, append Module Impact and Integration Points after the standard sections, set frontmatter (`status: draft`, `mode: cross-cutting`, `created:`, and an `affects:` list of modules), and save to `.context-index/specs/cross-cutting/<spec-slug>.md`.

Note: cross-cutting specs have no `charter` field in frontmatter. They use `affects` instead to list the modules they touch.

**Step 6: Summary.** Shared format, reporting modules affected, behaviors, integration points, and acceptance criteria, plus: review the module impact with each module's maintainer, and `/adev:plan --spec <spec-path>` to plan implementation.

---

## Constitution Validation (All Modes)

Before writing any spec, scan the constitution for conflicts:

1. Read `.context-index/constitution.md`.
2. Check that the proposed spec does not contradict any principle.
3. If a conflict is found, present it with the offending proposal and the Constitution principle it violates, then offer three options: (1) revise the spec to comply; (2) propose a constitutional amendment, which creates an ADR draft at `.context-index/adrs/NNNN-<title>.md` and notes the pending ADR in the spec; (3) proceed with an explicit exception, adding `constitutional-exception: "<principle text>"` to the spec frontmatter.

## Duplicate Detection (All Modes)

Before creating a spec, read all `.md` files in the target directory and compare the proposed title and behavioral contract against them. If the contracts overlap significantly, present both specs and offer: (1) extend the existing spec instead; (2) create a new spec anyway because the scope differs; (3) cancel.

## Output Conventions

- **Slug format:** lowercase kebab-case, no special characters. Derived from the spec title. Example: "Add drag-and-drop reordering" becomes `add-drag-and-drop-reordering`.
- **Date format:** YYYY-MM-DD in all frontmatter fields.
- **Status:** always starts as `draft`. Only `/adev:review-specs` can advance it.
- **Template resolution:** Templates are resolved from `${CLAUDE_PLUGIN_ROOT}/templates/`. If a template is missing, warn the user and generate the spec structure inline.
- **Chat output:** the spec body lives on disk. Chat gets the summary block only.
