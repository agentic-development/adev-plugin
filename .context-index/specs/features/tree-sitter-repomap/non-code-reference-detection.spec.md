# Live Spec: Non-Code Reference Detection

<!-- Live Spec within the tree-sitter-repomap charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/tree-sitter-repomap/charter.md
     This spec extends the charter's Capability Map with a new must-have capability:
     "Non-code reference detection — recognize source-file references in skill markdown and
     declared public-API exports as inbound edges in the dependency graph." -->

---
charter: tree-sitter-repomap
kind: behavioral
status: review-pending
risk_level: medium
milestone: v0.5.2
revision: 1
charter-revision: 1
charter-extension: true
created: 2026-05-17
updated: 2026-05-17
---

## Behavioral Contract

<!-- Extends the dependency-graph construction pipeline so that two reference
     sources beyond JavaScript import statements are recognized: (a) SKILL.md
     prose mentions of source files and (b) entries declared in
     package.json:exports as the package's public API surface. -->

### Preconditions

- The repomap pipeline has scanned source files and produced the base FileNode set (`dependency-graph.json`).
- `skills/**/SKILL.md` files exist in the working tree.
- `package.json` exists at the project root and may declare an `exports` field.
- The base regex / tree-sitter parser has already populated `nodes[]`.

### Behaviors

1. **When** the dependency-graph builder finishes processing JS/TS imports **then** it scans every `skills/**/SKILL.md` file for inline references to source files (paths matching `(lib|cli|hooks|providers|templates|tests)/<path>.<ext>` where `<ext>` is `mjs`, `js`, `ts`, `mts`, `cjs`, `sh`, or `yaml`) and emits an edge for each match with `type: "skill-doc"`, `from: <skill-doc-path>`, `to: <referenced-source-path>`, `symbols: []`.

2. **When** a SKILL.md path appears as the `from` of a new skill-doc edge but the referenced file does not exist on disk **then** the edge is dropped (no FileNode is fabricated for missing targets) and a single line is added to the human-readable `repo-map.md` under a new "Missing skill-doc references" section listing the skill file, the referenced path, and the line number.

3. **When** `package.json` declares an `exports` field at the project root **then** the builder resolves each export entry to an absolute file path (relative paths under the package root, no remote URLs) and emits a FileNode tag of `kind: "public-api-entry"` on the resolved FileNode. Public-api entries are excluded from the "zero inbound references" set used to flag dead code.

4. **When** the symbol-ranks builder computes inbound-reference counts **then** symbols defined in files tagged `kind: "public-api-entry"` are credited with at least one synthetic inbound reference labeled `"package-exports"`, and skill-doc edges are counted as inbound references on the target FileNode (each skill-doc edge contributes +1 to the target's inbound count, capped at one per distinct source skill file).

5. **When** the parser mode is `regex` (tree-sitter not installed) **then** behaviors 1–4 still apply. Skill-doc reference detection and public-api recognition are file-format-agnostic; they do not depend on AST parsing of source code.

6. **When** the repomap is generated **then** `repo-map.md` includes a new "Skill-doc references" summary showing the top 10 source files by skill-doc inbound count (e.g., `lib/test-strategies/assignment.mjs ← 2 skill docs`), and a "Public API surface" summary listing every file tagged `kind: "public-api-entry"`.

### Postconditions

- `dependency-graph.json` `edges[]` contains zero, one, or more edges with `type: "skill-doc"` per qualifying SKILL.md reference.
- `dependency-graph.json` `nodes[]` may contain FileNodes with an added `kind: "public-api-entry"` field.
- `symbol-ranks.json` symbol entries reflect inbound counts that include skill-doc and public-api contributions.
- `repo-map.md` contains the two new summary sections.
- Files genuinely without inbound references (no JS imports, no skill-doc mentions, not declared in `package.json:exports`) remain in the "zero inbound" set — true dead-code candidates are still surfaced.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `package.json` is missing | Skip the public-api step silently; emit no `kind: "public-api-entry"` tags | — |
| `package.json` is malformed JSON | Log a single warning to stderr, skip the public-api step, continue with the rest of the pipeline | `EXPORTS_PARSE_ERROR` |
| `package.json:exports` entry points to a path outside the project root (e.g., `../other-package/file.mjs`) | Reject that entry, log one warning naming the offending path, continue with remaining entries | `EXPORTS_OUT_OF_ROOT` |
| A SKILL.md path reference contains `..` segments | Resolve and reject if the resolved path escapes the project root; log a warning, skip the reference | `SKILL_DOC_PATH_TRAVERSAL` |
| A SKILL.md regex match spans a fenced code block (between triple backticks) | Skip — code-fenced examples are not references | — |
| The same source file is referenced multiple times in a single SKILL.md | Emit a single edge with `count: <n>` on the edge object | — |
| A SKILL.md file is itself referenced by another SKILL.md | The skill-doc → skill-doc edge is recorded (skill files are valid edge targets) | — |

## System Constitution Reference

- **Principle:** "Minimize external dependencies — prefer Node.js built-ins" — Applies because the new detection passes must be implemented with `fs`, `path`, regex, and the existing JSON parser. No new dependency may be introduced.
- **Principle:** "Pure ESM — all .mjs files, type: module" — Applies because new modules added under `lib/repomap/` continue the ESM convention.
- **Principle:** "Hooks read JSON from stdin + env vars, exit 0 (allow) or 2 (block)" — Does not apply (this is a build-time pipeline, not a runtime hook). Listed for completeness so reviewers do not flag its absence.
- **Principle:** "Skills are primarily markdown" — Applies because this spec treats SKILL.md as authoritative reference content; the pipeline reads markdown but does not modify it.

## Actionable Task Map

<!-- /adev:plan will refine this into a detailed plan after review. -->

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Skill-doc reference scanner | New module `lib/repomap/skill-doc-references.mjs` that walks `skills/**/SKILL.md`, applies the path-matching regex, filters out code-fenced blocks and traversal attempts, and returns the edge list | medium |
| Public-API entry resolver | New module `lib/repomap/public-api-entries.mjs` that reads `package.json`, resolves `exports` entries to absolute paths, validates each is inside the project root, and returns the tagged file list | small |
| Pipeline integration | Wire both scanners into the existing `lib/repomap/index.mjs` orchestrator. Run skill-doc scan after JS import edges land; run public-api resolution before ranking | small |
| Ranker augmentation | Update the symbol-ranks computation to credit `kind: "public-api-entry"` FileNodes and to count skill-doc edges in inbound totals | small |
| Repo-map rendering | Update `repo-map.md` template to include the two new summary sections and the "Missing skill-doc references" footer | small |
| Tests | Unit tests for each new module (with fixtures), plus an integration test that runs the full pipeline against this project and confirms the previously-flagged false positives (`lib/test-strategies/`, `lib/governance/`, `cli/index.mjs` re-exports) no longer appear in the "zero inbound" set | medium |
| Hygiene re-baseline | Re-run `/adev:hygiene` and confirm the codehealth pass no longer flags the false positives identified in the 2026-05-17 report | small |

## Visual Expectations

<!-- Backend-only spec — no UI. Section retained per template convention but empty. -->

## Acceptance Criteria

- [ ] `lib/repomap/skill-doc-references.mjs` exists, exports a deterministic function that returns the same edge list across runs given the same input.
- [ ] `lib/repomap/public-api-entries.mjs` exists, handles all four error cases without crashing.
- [ ] `dependency-graph.json` produced for this project contains at least one `skill-doc` edge from a `skills/**/SKILL.md` to a `lib/**/*.mjs` file.
- [ ] `dependency-graph.json` produced for this project contains at least one FileNode with `kind: "public-api-entry"` matching the entry in `package.json:exports`.
- [ ] Re-running the codehealth investigation against this project produces a "no false positives" finding for the three candidates flagged in the 2026-05-17 report.
- [ ] Pipeline performance regression is under 10% (measured against the existing fixture project's 60-second budget from the charter's Quality Attributes).
- [ ] All quality gates pass (tests, lint, typecheck).
- [ ] No constitutional violations introduced (no new external dependencies; all new code is ESM `.mjs`).
