# Live Spec: Non-Code Reference Detection

<!-- Live Spec within the tree-sitter-repomap charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/tree-sitter-repomap/charter.md
     This spec extends the charter's Capability Map with a new should-have capability:
     "Non-code reference detection — recognize source-file references in skill markdown and
     declared public-API exports as inbound references contributing to dead-code suppression."

     REVISION HISTORY
     - rev 1 (2026-05-17): initial draft
     - rev 2 (2026-05-17): incorporates /adev:review-specs findings — schema reconciliation
       (renamed field collisions, additive evolution rule), regex-mode reconciliation
       (markdown-only surface in regex mode), manifest-driven path roots, REPOMAP_ error-code
       prefix, post-rank semantics, performance baseline clarification, scoped exports shapes.
     - rev 3 (2026-05-17): clarifying polish from rev-2 review (SA-10 through SA-13) — adds
       PageRank `score` vs `references` count distinction, conditional-object skip behavior,
       multi-language extension scoping note, and a downstream-consumer tolerance follow-up. -->

---
charter: tree-sitter-repomap
kind: behavioral
status: validated
risk_level: medium
milestone: v0.5.2
revision: 3
charter-revision: 1
charter-extension: true
created: 2026-05-17
updated: 2026-05-17
source-manifest:
  sha: "4fb0ecb"
  files:
    - .context-index/manifest.yaml
    - .context-index/specs/features/tree-sitter-repomap/core-parser-pipeline.spec.md
    - lib/repomap/doc-references.mjs
    - lib/repomap/index.mjs
    - lib/repomap/public-api-entries.mjs
    - lib/repomap/rank.mjs
    - skills/codehealth/SKILL.md
    - tests/repomap/doc-references.test.mjs
    - tests/repomap/index.test.mjs
    - tests/repomap/non-code-references.integration.test.mjs
    - tests/repomap/public-api-entries.test.mjs
    - tests/repomap/rank.test.mjs
    - tests/repomap/render-non-code-sections.test.mjs
  computed-at: "2026-05-17T19:00:21.169Z"
drift_detected: true
---

## Schema Evolution Rule

This spec extends two schemas defined in the sibling spec `core-parser-pipeline.spec.md` (FileNode and Edge). To keep both specs internally consistent without requiring a simultaneous edit of the sibling:

- **FileNodes gain an optional `tags: string[]` field.** A FileNode with no tags is identical to the v1 schema. The sibling's closed `kind` enumeration on `Symbol` is unchanged; the new field lives on `FileNode`, not on `Symbol`. (Resolves CON-1.)
- **Edges gain a new `type` value `"doc-reference"` and an optional `count: integer` field.** Both are additive. The sibling spec will receive a rev-2 amendment when this spec implements; until then, consumers MUST treat unknown edge types as `"unknown"` and ignore unknown fields. (Resolves SA-2, CON-2, SA-7, CON-4.)
- **`symbol-ranks.json` gains an optional `referenceSources: string[]` field on each symbol entry.** Lists labels for synthetic inbound references (e.g., `"package-exports"`). The existing `references: <count>` field is unchanged. (Resolves CON-5.)
- **Consumer-side guidance:** downstream skills (`/adev:route`, `/adev:validate`, `/adev:recover`, `/adev:hygiene`) MUST tolerate the new fields and edge type. The charter's existing graceful-degradation contract already requires consumers never to error on missing JSON fields; this spec extends that contract symmetrically to additional fields. The implementation plan must include a per-skill verification step (read the consumer code, confirm it does not assert closed enumerations on edge `type` or FileNode shape). Skills that assert the v1 closed set must be patched as part of this spec's task map; see the "Downstream consumer audit" task. (Resolves SA-12.)

## Behavioral Contract

<!-- Extends the dependency-graph construction pipeline so that two reference
     sources beyond JavaScript import statements are recognized: (a) SKILL.md
     prose mentions of source files and (b) entries declared in
     package.json:exports as the package's public API surface.

     Behaviors are framed against the FileNode/Edge schema as extended by the
     Schema Evolution Rule above. -->

### Preconditions

- The repomap pipeline has scanned source files and produced the base FileNode set.
- `skills/**/SKILL.md` files exist in the working tree (or the project has no skills/ tree, in which case Behaviors 1–2 are no-ops).
- `package.json` exists at the project root and may declare an `exports` field (or it may not, in which case Behavior 3 is a no-op).
- The base regex / tree-sitter parser has already populated `nodes[]`.
- `manifest.yaml` may declare `modules[].paths` (used to derive the path-detection root list; see Behavior 1).

### Behaviors

1. **When** the dependency-graph builder finishes processing JS/TS imports **then** it scans every `skills/**/SKILL.md` file for inline references to source files and emits one or more edges per reference. Path-detection roots are derived from `manifest.yaml modules[].paths` (union of every `paths[]` entry across all modules). If `manifest.yaml` is missing or declares no modules, the fallback root list is `["lib", "cli", "hooks", "providers", "templates", "tests"]`. The matched extensions are `mjs`, `js`, `ts`, `mts`, `cjs`, `sh`, `yaml` — pragmatic scoping to extensions currently present in this codebase. Multi-language projects (Python, Go, Rust, Java, Ruby — listed in the charter's language support) are intentionally out of scope for this spec; extension-list expansion is a tracked follow-up. Each emitted edge carries `type: "doc-reference"`, `from: <skill-doc-path>`, `to: <referenced-source-path>`, `symbols: []`. (Resolves SA-4, SA-13.)

2. **When** a SKILL.md path appears as the `from` of a new doc-reference edge but the referenced file does not exist on disk **then** the edge is dropped (no FileNode is fabricated for missing targets) and a single line is added to the human-readable `repo-map.md` under a "Missing doc-reference targets" section listing the skill file, the referenced path, and the line number.

3. **When** `package.json` declares an `exports` field at the project root **then** the builder resolves each export entry to an absolute file path and applies the tag `"public-api-entry"` to the resolved FileNode's `tags[]` array. Resolution is scoped to the simple shapes currently in use across this codebase: a top-level entry string (`"."`: `"./cli/index.mjs"`), and conditional resolution against the keys `"import"` and `"default"` (in that order — `"import"` wins when both are present). If a conditional object lacks both `"import"` and `"default"`, the entry is skipped with `REPOMAP_EXPORTS_UNSUPPORTED_SHAPE`. Other conditional keys (`"require"`, `"node"`, `"browser"`, etc.), subpath entries (`"./feature"`), `null` blocking entries, and glob patterns (`"./*.mjs"`) are out of scope for this spec; they emit a warning and are skipped. (Resolves SA-8, SA-11.)

4. **When** the symbol-ranks builder computes inbound-reference counts **then** it operates as a **post-rank annotation** over the PageRank output — the PageRank computation itself is unchanged and its scores still sum to 1.0 (charter invariant preserved). The PageRank `score` field on each symbol is distinct from the `references` count: this behavior modifies `references` (an integer count of incoming reference contributions) and `referenceSources[]` (a label array); the `score` field is never touched here. Annotations:
   - Symbols defined in FileNodes whose `tags[]` includes `"public-api-entry"` get the label `"package-exports"` appended to their `referenceSources[]` array. Their `references` count is incremented by 1 to ensure they are not in the "zero inbound" set.
   - For each FileNode that is the `to` of one or more doc-reference edges, the inbound-reference count of every symbol defined in that FileNode is incremented by the number of **distinct source skill files** that reference it (cap of one per source skill file regardless of how many times that file mentions it). The label `"doc-reference"` is appended to each such symbol's `referenceSources[]` array.
   (Resolves SA-3, CON-5, SA-10.)

5. **When** the parser mode is `regex` (tree-sitter not installed) **then** Behaviors 1–3 still execute, but the new findings surface only in `repo-map.md` (as the two summary sections defined in Behavior 6). No `dependency-graph.json` or `symbol-ranks.json` is produced — the charter invariant (regex mode produces no JSON artifacts) is preserved. (Resolves SA-5, CON-6.)

6. **When** the repomap is generated **then** `repo-map.md` includes two new sections regardless of parser mode:
   - **"Doc-reference inbound summary"** — top 10 source files by doc-reference inbound count (e.g., `lib/test-strategies/assignment.mjs ← 2 skill docs`).
   - **"Public API surface"** — every file whose FileNode tags include `"public-api-entry"`, with its declared `package.json:exports` key.

### Postconditions

- In tree-sitter mode: `dependency-graph.json` `edges[]` may contain edges with `type: "doc-reference"`; `nodes[]` may carry a `tags[]` array including `"public-api-entry"`; `symbol-ranks.json` symbol entries may carry a `referenceSources[]` array.
- In regex mode: no JSON artifacts are produced; the two new sections appear in `repo-map.md`.
- `repo-map.md` contains the two new summary sections regardless of parser mode.
- PageRank scores across all FileNodes continue to sum to 1.0 (charter invariant unchanged by this spec).
- Files genuinely without inbound references (no JS imports, no doc-references, not declared in `package.json:exports`) remain in the "zero inbound" set — true dead-code candidates are still surfaced.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `package.json` is missing | Skip the public-api step silently; emit no `"public-api-entry"` tags | — |
| `package.json` is malformed JSON | Log a single warning to stderr, skip the public-api step, continue with the rest of the pipeline | `REPOMAP_EXPORTS_PARSE_ERROR` |
| `package.json:exports` entry points to a path outside the project root | Reject that entry, log one warning naming the offending path, continue with remaining entries | `REPOMAP_EXPORTS_OUT_OF_ROOT` |
| `package.json:exports` uses an unsupported shape (subpath, glob, `null`, non-`import`/`default` conditional) | Skip that entry, log one warning naming the offending key | `REPOMAP_EXPORTS_UNSUPPORTED_SHAPE` |
| A SKILL.md path reference resolves outside the project root (any form of escape, not only `..`) | Skip the reference, log a warning | `REPOMAP_DOC_REFERENCE_PATH_TRAVERSAL` |
| A SKILL.md regex match spans a fenced code block (between triple backticks) | Skip — code-fenced examples are not references | — |
| The same source file is referenced multiple times in a single SKILL.md | Emit a single edge for that pair; the `count` field on the edge records how many text occurrences were collapsed. `count` is informational metadata and does not affect inbound-rank arithmetic (Behavior 4 caps at one per distinct source skill file). | — |
| A SKILL.md file is itself referenced by another SKILL.md | The doc-reference edge is recorded (skill files are valid edge targets) | — |
| `manifest.yaml` is missing or has no `modules[]` | Use the fallback root list (`["lib", "cli", "hooks", "providers", "templates", "tests"]`); proceed | — |

(Resolves CON-3 by prefixing all module-owned error codes with `REPOMAP_`.)

## System Constitution Reference

- **Principle:** "Minimize external dependencies — prefer Node.js built-ins" — Applies because the new detection passes are implemented with `fs`, `path`, regex, and the existing JSON parser. No new dependency may be introduced.
- **Principle:** "Pure ESM — all .mjs files, type: module" — Applies because new modules added under `lib/repomap/` continue the ESM convention.
- **Principle:** "Skills are primarily markdown" — Applies because this spec treats SKILL.md as authoritative reference content; the pipeline reads markdown but does not modify it.

## Actionable Task Map

<!-- /adev:plan will refine this into a detailed plan after review. -->

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Doc-reference scanner | New module `lib/repomap/doc-references.mjs` that walks `skills/**/SKILL.md`, reads `manifest.yaml modules[].paths` for detection roots (with the documented fallback), applies the path-matching regex, filters out code-fenced blocks, and rejects path-traversal attempts. Returns the edge list with `count` collapsed per source/target pair. | medium |
| Public-API entry resolver | New module `lib/repomap/public-api-entries.mjs` that reads `package.json`, resolves `exports` entries to absolute paths for the supported shapes (top-level entry; `import`/`default` conditionals), validates each is inside the project root, returns the tagged FileNode list. Unsupported shapes emit `REPOMAP_EXPORTS_UNSUPPORTED_SHAPE` and are skipped. | small |
| Pipeline integration | Wire both scanners into `lib/repomap/index.mjs`. Run doc-reference scan after JS import edges land; run public-api resolution before ranking. In regex mode, both scanners run but their output is consumed only by the `repo-map.md` renderer. | small |
| Ranker augmentation | Update symbol-ranks computation to post-rank annotate `tags`-bearing FileNodes and to count doc-reference edges in inbound totals (cap of one per distinct source skill file). Preserves the PageRank sum-to-1.0 invariant. | small |
| Repo-map rendering | Update `repo-map.md` template to include the two new summary sections and the "Missing doc-reference targets" footer. Both sections render in regex mode and tree-sitter mode. | small |
| Sibling spec amendment | Amend `core-parser-pipeline.spec.md` to rev 2: add `tags?: string[]` to the FileNode schema, add `"doc-reference"` to the Edge `type` enumeration, add `count?: integer` to Edge, add `referenceSources?: string[]` to symbol entries. | small |
| Downstream consumer audit | Read the consumer code for each downstream skill (`/adev:route`, `/adev:validate`, `/adev:recover`, `/adev:hygiene`) and confirm none assert a closed Edge `type` enumeration or a closed FileNode shape. Patch any that do. Records the audit result inline in this task's commit message. (Resolves SA-12.) | small |
| Tests | Unit tests per new module with fixtures; integration test that runs the full pipeline against this project and confirms the three previously-flagged false positives (`lib/test-strategies/`, `lib/governance/`, `cli/index.mjs` re-exports) no longer appear in the "zero inbound" set. | medium |
| Hygiene re-baseline | Re-run `/adev:hygiene` and confirm the codehealth pass no longer flags the false positives identified in the 2026-05-17 report. | small |

## Visual Expectations

<!-- Backend-only spec — no UI. Section retained per template convention but empty. -->

## Acceptance Criteria

- [ ] `lib/repomap/doc-references.mjs` exists, exports a deterministic function that returns the same edge list across runs given the same input. Detection roots derive from `manifest.yaml modules[].paths` with the documented fallback when absent.
- [ ] `lib/repomap/public-api-entries.mjs` exists, handles all four `REPOMAP_EXPORTS_*` error cases without crashing.
- [ ] In tree-sitter mode, `dependency-graph.json` produced for this project contains at least one `doc-reference` edge from a `skills/**/SKILL.md` to a `lib/**/*.mjs` file.
- [ ] In tree-sitter mode, `dependency-graph.json` produced for this project contains at least one FileNode with `tags` including `"public-api-entry"` matching the entry in `package.json:exports`.
- [ ] In regex mode, the two new sections appear in `repo-map.md` and no JSON artifacts are produced.
- [ ] PageRank scores across all FileNodes continue to sum to 1.0 in tree-sitter mode (charter invariant preserved).
- [ ] `core-parser-pipeline.spec.md` has been amended to rev 2 with the additive schema fields and edge type.
- [ ] Downstream consumer audit complete: each of `/adev:route`, `/adev:validate`, `/adev:recover`, `/adev:hygiene` confirmed (or patched) to tolerate unknown edge `type` values and additional FileNode fields without erroring.
- [ ] Re-running the codehealth investigation against this project produces a "no false positives" finding for the three candidates flagged in the 2026-05-17 report.
- [ ] Pipeline performance regression on the `tests/fixtures/sample-project/` fixture is under 10% relative to the pre-change baseline (captured by running the existing pipeline against the fixture immediately before this change lands). The charter's 60-second absolute budget for a 500-file project is unaffected by the regression-budget bound.
- [ ] All quality gates pass (tests, lint, typecheck).
- [ ] No constitutional violations introduced (no new external dependencies; all new code is ESM `.mjs`).
