---
name: adev:specify
description: "Author Live Specs within a Feature Charter's scope. Supports modes for new features, extraction from existing code, refactoring, diff-driven changes, and cross-cutting concerns. Use when the user says 'write a spec', 'define the behavior', 'create a contract', 'specify the feature', or needs to formalize requirements into a behavioral specification before planning."
---

# Write a Live Spec

Author a Live Spec (behavioral contract) scoped to a Feature Charter. The spec drives `/adev:plan` and `/adev:implement`. Modes: standard (default), `--extract`, `--refactor`, `--from-diff`, `--cross-cutting`.

## Prerequisites

`.context-index/` and `constitution.md` must exist. At least one charter required (except `--cross-cutting`). Stop and explain if missing.

## Frontmatter

```yaml
charter: <module>          # omit for cross-cutting (use affects: instead)
status: draft
milestone: <phase from charter>
created: <YYYY-MM-DD>
# mode: extract | refactor | from-diff | cross-cutting
# extracted-from: [...] | diff-source: "..." | affects: [...] | charter-extension: true
```

---

## Standard Mode (default)

1. **Resolve charter** — scan `.context-index/specs/features/*/charter.md`. If `--charter`, load directly. If ambiguous, list and ask.
2. **Load context** — read constitution, platform-context, the charter, product.md, existing specs in this module, and any `references/**/*.md`.
3. **Identify capability** — show the charter Capability Map and existing specs, ask which capability to cover. If out-of-charter, warn and offer: extend charter first (`/adev:brainstorm --module`) or add `charter-extension: true`.
4. **Interactive spec authoring** — guide section-by-section, do not dump a blank template:
   - **Behavioral Contract:** ask what triggers the behavior, expected outcomes, failures. Write 3-8 `When...then` statements.
   - **Preconditions / Postconditions:** derive from behavioral statements.
   - **Error Cases:** build condition/expected-behavior/status table. Confirm completeness with user.
   - **Constitution Reference:** select 2-4 relevant principles, explain why each applies, confirm with user.
   - **Actionable Task Map:** preliminary task breakdown table (task, description, complexity).
   - **Acceptance Criteria:** concrete checkable criteria; every behavior maps to at least one; always include quality gates + no constitutional violations.
5. **Write spec** — slug: lowercase kebab-case. Fill `${CLAUDE_PLUGIN_ROOT}/templates/live-spec-template.md`. Inherit milestone from charter phase (confirm with user). Save to `.context-index/specs/features/<module>/<spec-slug>.md`.
6. **Summary** — output path, charter, status, counts (behaviors, errors, tasks, criteria), next steps.

---

## Extract Mode (`--extract`)

Reverse-engineer a spec from existing code. Documents what IS, not what SHOULD BE.

1. Resolve charter (shared above).
2. Identify files: if module provided, scan for associated files; if paths provided, use those. Confirm with user.
3. Read each file. Identify: public interface, state mutations, error handling, dependencies.
4. Generate snapshot spec:
   - Add `<!-- Extracted from existing code. Describes current behavior as of YYYY-MM-DD. -->` to Behavioral Contract.
   - Behaviors from code paths; flag unhandled errors with `⚠ UNHANDLED`.
   - Replace Actionable Task Map with **Coverage Gaps** section.
   - Constitution Reference flags observed violations with ✓/⚠.
   - Set `mode: extract` and `extracted-from: [<files>]` in frontmatter.
5. Save to `.context-index/specs/features/<module>/<spec-slug>.md`. Summary includes files analyzed, behaviors, unhandled errors, coverage gaps, violations.

---

## Refactor Mode (`--refactor`)

Current state → target state → migration path.

1. Resolve charter and load context (shared above).
2. Ask: what to refactor, what problem, what the target looks like.
3. Analyze current code: structure table (file, role, lines), specific measurable problems, dependencies (migration constraints).
4. Define target state: structure table, improvements addressing each problem. Validate against constitution — flag violations.
5. Build migration path: each step must be independently deployable, have verification criteria, and include risk (Low/Medium/High). Safe ordering: extract before modify, tests before refactor. Confirm with user.
6. Define invariants: tests pass at every step, public API unchanged, no data loss. Ask for domain-specific invariants.
7. Write spec using `${CLAUDE_PLUGIN_ROOT}/templates/refactoring-spec-template.md`. Set `mode: refactor`. Save to `.context-index/specs/features/<module>/<spec-slug>.md`. Summary includes files, problems, steps, invariants, behaviors, criteria.

---

## From-Diff Mode (`--from-diff`)

Retroactive spec from a git diff or PR.

1. Identify diff: staged → working tree → commit range → branch → PR number (in that priority).
2. Resolve charter from changed file paths. If multiple modules, ask: one spec or separate?
3. Load context (shared above). Analyze diff: behavior added, modified, removed per file.
4. Generate retroactive spec: behaviors from significant code changes; errors from new/modified error handling; replace Task Map with **Changes Summary** table; acceptance criteria use `[x]` for existing, `[ ]` for gaps. Set `mode: from-diff` and `diff-source` in frontmatter.
5. Save to `.context-index/specs/features/<module>/<spec-slug>.md`. Summary: source, files, behaviors, gaps.

---

## Cross-Cutting Mode (`--cross-cutting`)

Concerns spanning multiple features (auth, error handling, logging, etc.).

1. No charter needed — only constitution and product.md.
2. Ask: what concern, which modules it touches.
3. Load constitution, product.md, named charters. Identify existing references.
4. Author spec (same behavioral contract steps as standard), plus:
   - **Module Impact Map:** module, impact level, changes required.
   - **Integration Points:** how modules interact through this concern.
5. Save to `.context-index/specs/cross-cutting/<spec-slug>.md`. Set `mode: cross-cutting` and `affects: [<modules>]`. Summary: modules, behaviors, integration points, criteria.

---

## Constitution Validation (All Modes)

Before writing: check proposed spec against constitution principles. If conflict found, present 3 options: (1) revise to comply, (2) propose constitutional amendment (create ADR draft), (3) explicit exception (`constitutional-exception:` in frontmatter). Only proceed after user chooses.

## Duplicate Detection (All Modes)

Before creating: scan existing specs in target directory. If behavioral contracts overlap significantly, present 3 options: (1) extend existing spec, (2) create anyway (different scope), (3) cancel.
