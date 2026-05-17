<!-- DO NOT EDIT statuses inline — see lifecycle log non-code-reference-detection.jsonl -->
# Implementation Plan: Non-Code Reference Detection

> **Methodology:** adev
> **Charter:** `.context-index/specs/features/tree-sitter-repomap/charter.md` (rev 1, approved)
> **Spec:** `.context-index/specs/features/tree-sitter-repomap/non-code-reference-detection.spec.md` (rev 3)
> **Review:** PASS (2026-05-17, second pass after rev-2 incorporated rev-1 findings)
> **Platform:** Node.js (ESM, `.mjs`), node:test, zero external deps

**Goal:** Stop the repomap from falsely flagging code as dead by teaching it to recognize two additional reference sources — `SKILL.md` prose mentions of source files (new edge type `doc-reference`) and `package.json:exports` entries (new FileNode tag `public-api-entry`).

**Architecture:** Two new pure-function modules under `lib/repomap/` (`doc-references.mjs`, `public-api-entries.mjs`), wired into the existing orchestrator at well-defined points (post-import-edge phase for doc-references; pre-rank phase for public-api). The symbol-ranker runs the new contributions as **post-rank annotations** — PageRank scores are untouched, only `references` counts and `referenceSources[]` labels are mutated. In regex mode, both scanners still run, but their output is rendered only into `repo-map.md` (no JSON artifacts), preserving the charter's regex-mode invariant.

---

## File Structure

**Create:**
- `lib/repomap/doc-references.mjs` — Scans `skills/**/SKILL.md` for source-file references; returns the edge list (with `count` collapsed per source/target pair) and the missing-target list.
- `lib/repomap/public-api-entries.mjs` — Reads `package.json:exports`; returns the list of FileNodes to tag and any unsupported-shape warnings.
- `tests/repomap/doc-references.test.mjs` — Unit tests for the scanner: detection roots from manifest, fallback list, extension list, code-fence skipping, path-traversal rejection, multi-occurrence collapse, missing-target handling.
- `tests/repomap/public-api-entries.test.mjs` — Unit tests for the resolver: simple top-level entry, `import`/`default` conditionals with precedence, conditional-object lacking both keys, unsupported shapes (subpath, glob, `null`, non-supported conditional), out-of-root rejection, malformed JSON.
- `tests/repomap/non-code-references.integration.test.mjs` — Integration test that runs the full pipeline against this project; asserts the three previously-flagged false positives no longer appear in the "zero inbound" set; asserts PageRank scores still sum to 1.0.
- `tests/repomap/fixtures/doc-refs/` — Test fixtures: skill files with various reference shapes (in-prose, in-code-fence, traversal attempt, multi-occurrence, missing-target).
- `tests/repomap/fixtures/public-api/` — Test fixtures: `package.json` snippets covering each supported and unsupported shape.

**Modify:**
- `lib/repomap/index.mjs` — Wire the two new scanners into the orchestrator. Doc-reference scan runs after the JS import edges land; public-api resolution runs before ranking. In regex mode, both still run but their output is passed only to the `repo-map.md` renderer.
- `lib/repomap/rank.mjs` (or equivalent — locate ranker entry during Task 4) — Add post-rank annotation pass: increment `references` count and append `referenceSources[]` labels for `public-api-entry`-tagged FileNodes and for doc-reference edge targets (cap one contribution per distinct source skill file).
- `lib/repomap/render-repo-map.mjs` (or equivalent — locate during Task 5) — Add three new sections to the rendered Markdown: "Doc-reference inbound summary" (top 10), "Public API surface", "Missing doc-reference targets".
- `.context-index/specs/features/tree-sitter-repomap/core-parser-pipeline.spec.md` — Amend to rev 2: declare `tags?: string[]` on FileNode, add `"doc-reference"` to the Edge `type` enumeration, add `count?: integer` to Edge, add `referenceSources?: string[]` to symbol entries.

**Reference (read, do not modify):**
- `lib/repomap/parse.mjs` — Existing parser entry point; use the same path-resolution helpers and module-mapping pattern.
- `lib/source-manifest.mjs` — Project-root-relative path validation pattern reuse target.
- `lib/manifest.mjs` — `modules[].paths` reader; reuse rather than re-parse.

---

## Context Packets

### Task 1 Context — Doc-reference scanner
- Spec: `non-code-reference-detection.spec.md` Behaviors 1, 2 + Error Cases (code-fence, traversal, multi-occurrence, missing target)
- Charter: capability "Non-code reference detection"; Domain Model FileNode/Edge entities
- Source files (full read): `lib/repomap/parse.mjs` for path-resolution pattern; `lib/manifest.mjs` for `modules[].paths` reader
- Cross-cutting: path-containment guard pattern from `lib/source-manifest.mjs`
- Fixtures to build: `tests/repomap/fixtures/doc-refs/`

### Task 2 Context — Public-API entry resolver
- Spec: Behavior 3 + Error Cases (REPOMAP_EXPORTS_*, conditional-object missing both keys)
- Source files (full read): the project's own `package.json` for the canonical simple shape
- Reference: Node.js `package.json:exports` documentation for the supported subset
- Fixtures to build: `tests/repomap/fixtures/public-api/`

### Task 3 Context — Pipeline integration
- Source files (full read): `lib/repomap/index.mjs` (the orchestrator)
- Spec: Behavior 5 (regex-mode reconciliation — both scanners run, output routed to renderer only)
- Modules built in Tasks 1 and 2

### Task 4 Context — Ranker augmentation
- Spec: Behavior 4 (post-rank annotation rule; PageRank `score` distinct from `references` count)
- Source files (locate during task): `lib/repomap/rank.mjs` or equivalent — the ranker entry point
- Charter invariant: PageRank sum-to-1.0; the modification must not touch `score`

### Task 5 Context — Repo-map rendering
- Spec: Behavior 6 (three new sections); Behavior 2 (missing-target listing)
- Source files (locate during task): the Markdown renderer for `repo-map.md`
- Output data shapes from Tasks 3 and 4

### Task 6 Context — Sibling spec amendment
- Source files (full read): `core-parser-pipeline.spec.md` Postconditions + Domain Model
- Spec: Schema Evolution Rule section of this spec (the additive contract)

### Task 7 Context — Downstream consumer audit
- Source files (read each): consumer code for `/adev:route`, `/adev:validate`, `/adev:recover`, `/adev:hygiene` that reads `dependency-graph.json` and `symbol-ranks.json`. Locate via `grep -rn "dependency-graph\|symbol-ranks" skills/ lib/`.
- Patch criteria: any closed-set assertion on Edge `type` or FileNode shape must be relaxed to ignore unknown values.

### Task 8 Context — Tests
- Spec: Acceptance Criteria (all bullets); Error Cases table
- Modules built in Tasks 1–4
- Fixture sets from Tasks 1 and 2

### Task 9 Context — Hygiene re-baseline
- Codehealth report: `.context-index/reports/codehealth-2026-05-17.md` (the three false positives to be re-verified)
- Repomap output: refreshed artifacts in `.context-index/hygiene/`

---

## Parallelization

- Group A (sequential): Task 1 → Task 3a (doc-reference wiring) → Task 8a (doc-reference tests)
- Group B (sequential): Task 2 → Task 3b (public-api wiring) → Task 8b (public-api tests)
- Group C (depends on A + B): Task 4 (ranker augmentation) → Task 5 (renderer) → Task 8c (integration test)
- Group D (independent of A–C): Task 6 (sibling spec amendment) — can run any time after spec is approved
- Group E (depends on Task 4): Task 7 (downstream consumer audit) — needs the new edge type names finalized
- Group F (depends on entire impl): Task 9 (hygiene re-baseline)

Groups A and B run in parallel. D runs anywhere. C, E, F are sequential gates after A+B.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Doc-reference scanner module | medium | unit | — | 1 create, 0 modify |
| 2 | Public-API entry resolver module | small | unit | — | 1 create, 0 modify |
| 3 | Wire scanners into orchestrator | small | unit | Task 1, Task 2 | 0 create, 1 modify |
| 4 | Ranker post-rank annotation | small | unit | Task 1, Task 2, Task 3 | 0 create, 1 modify |
| 5 | Repo-map rendering | small | unit | Task 4 | 0 create, 1 modify |
| 6 | Sibling spec amendment | small | unit | — | 0 create, 1 modify |
| 7 | Downstream consumer audit | small | unit | Task 4 | 0 create, ≤4 modify |
| 8 | Unit + integration tests | medium | unit | Task 1, Task 2, Task 4 | 3 create, 0 modify |
| 9 | Hygiene re-baseline verification | small | unit | All prior | 0 create, 0 modify |

All tasks resolve to `unit` strategy (default; manifest declares no `test_strategies`).

---

## Tasks

### Task 1: Doc-reference scanner module [specialist: none]

**Charter capability:** Non-code reference detection
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/repomap/doc-references.mjs`
- Create: `tests/repomap/doc-references.test.mjs`
- Create: `tests/repomap/fixtures/doc-refs/` (fixture skill files)

**Tests:** `tests/repomap/doc-references.test.mjs`

**Context to load:**
- Spec Behaviors 1, 2 + relevant Error Cases
- `lib/manifest.mjs` (read `modules[].paths`)
- `lib/source-manifest.mjs` (path-containment pattern)

- [ ] **Write failing test** — scenarios: detection roots from manifest (with fallback when manifest missing); extension list match; code-fence skipping; multi-occurrence collapse to single edge with `count`; missing-target dropped + reported; path-traversal rejected with `REPOMAP_DOC_REFERENCE_PATH_TRAVERSAL`.
- [ ] **Verify test fails** — Run: `node --test tests/repomap/doc-references.test.mjs` → FAIL (module not found).
- [ ] **Implement** — Module exports `scanDocReferences({ projectRoot, manifest? }): { edges: Edge[], missing: { source, ref, line }[], unsupported: [] }`. Pure function; no I/O outside the project root.
- [ ] **Verify test passes** — Run the same test; expect PASS.
- [ ] **Commit** — Branch `feat/tree-sitter-repomap/non-code-reference-detection` (already exists). Commit message: `feat(tree-sitter-repomap): doc-reference scanner module`.

---

### Task 2: Public-API entry resolver module [specialist: none]

**Charter capability:** Non-code reference detection
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/repomap/public-api-entries.mjs`
- Create: `tests/repomap/public-api-entries.test.mjs`
- Create: `tests/repomap/fixtures/public-api/` (fixture `package.json` snippets)

**Tests:** `tests/repomap/public-api-entries.test.mjs`

**Context to load:**
- Spec Behavior 3 + REPOMAP_EXPORTS_* error cases
- The project's own `package.json` (canonical simple shape)

- [ ] **Write failing test** — scenarios: top-level entry `{ ".": "./cli/index.mjs" }`; conditional with `import` only; conditional with both `import` and `default` (verify `import` wins); conditional with `default` only; conditional with neither (`REPOMAP_EXPORTS_UNSUPPORTED_SHAPE`); subpath entry, glob, `null`, non-`import`/`default` conditional (all `REPOMAP_EXPORTS_UNSUPPORTED_SHAPE`); out-of-root path (`REPOMAP_EXPORTS_OUT_OF_ROOT`); malformed JSON (`REPOMAP_EXPORTS_PARSE_ERROR`); missing `package.json` (no error, returns empty).
- [ ] **Verify test fails** — Run: `node --test tests/repomap/public-api-entries.test.mjs` → FAIL.
- [ ] **Implement** — Module exports `resolvePublicApiEntries({ projectRoot }): { tagged: FileNodeTag[], warnings: { code, path }[] }`.
- [ ] **Verify test passes** — Run; expect PASS.
- [ ] **Commit** — `feat(tree-sitter-repomap): public-api entry resolver`.

---

### Task 3: Wire scanners into orchestrator [specialist: none]

**Charter capability:** Non-code reference detection
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2
**Files:**
- Modify: `lib/repomap/index.mjs` — call `scanDocReferences` after import-edge phase; call `resolvePublicApiEntries` before ranking; in regex mode, pass both outputs to the renderer only (no JSON write).

**Tests:** `tests/repomap/non-code-references.integration.test.mjs` (covered in Task 8) plus existing orchestrator tests must continue passing.

**Context to load:**
- `lib/repomap/index.mjs` (full read)
- Spec Behavior 5 (regex-mode reconciliation)

- [ ] **Write failing test** — Extend orchestrator test to assert: in tree-sitter mode, edges include `doc-reference`; in regex mode, no JSON artifacts are produced but the renderer receives the new data.
- [ ] **Verify test fails** — Run; expect FAIL.
- [ ] **Implement** — Minimal wiring: import both new modules, call them at the right phase, route output appropriately based on parser mode.
- [ ] **Verify test passes** — Run; expect PASS.
- [ ] **Commit** — `feat(tree-sitter-repomap): wire doc-reference and public-api scanners into orchestrator`.

---

### Task 4: Ranker post-rank annotation [specialist: none]

**Charter capability:** Non-code reference detection
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2, Task 3
**Files:**
- Modify: `lib/repomap/rank.mjs` (or equivalent — locate during task) — add a final annotation pass that increments `references` count and appends `referenceSources[]` labels.

**Tests:** Add ranker-specific cases to `tests/repomap/non-code-references.integration.test.mjs` (Task 8) plus a focused unit test if a ranker test file exists.

**Context to load:**
- Spec Behavior 4 (post-rank, `references` not `score`)
- Charter invariant: PageRank scores sum to 1.0

- [ ] **Write failing test** — Assert: (a) PageRank `score` sum still equals 1.0 after annotation; (b) symbols in `public-api-entry`-tagged FileNodes have `referenceSources` containing `"package-exports"` and `references >= 1`; (c) symbols in FileNodes that are `to` of doc-reference edges have `referenceSources` containing `"doc-reference"` and `references` incremented by the count of distinct source skill files (capped at 1 per source).
- [ ] **Verify test fails** — Run; expect FAIL.
- [ ] **Implement** — Add the annotation pass strictly post-rank. Do not modify the PageRank algorithm itself.
- [ ] **Verify test passes** — Run; expect PASS.
- [ ] **Commit** — `feat(tree-sitter-repomap): post-rank annotation for doc-reference and public-api`.

---

### Task 5: Repo-map rendering [specialist: none]

**Charter capability:** Non-code reference detection
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 4
**Files:**
- Modify: the `repo-map.md` renderer (locate during task — likely `lib/repomap/render.mjs` or similar) — add three new sections.

**Tests:** Add renderer cases to the integration test in Task 8 plus a focused unit test if a renderer test exists.

**Context to load:**
- Spec Behavior 6 (three sections); Behavior 2 (missing-target listing)
- Sample existing `repo-map.md` from `.context-index/hygiene/` for current formatting

- [ ] **Write failing test** — Assert `repo-map.md` contains: "Doc-reference inbound summary" with up to 10 entries sorted by inbound count; "Public API surface" listing tagged files with their `exports` keys; "Missing doc-reference targets" listing source skill + ref path + line number.
- [ ] **Verify test fails** — Run; expect FAIL.
- [ ] **Implement** — Render the three sections from the data already produced by Tasks 1–4.
- [ ] **Verify test passes** — Run; expect PASS.
- [ ] **Commit** — `feat(tree-sitter-repomap): repo-map renderer adds doc-reference and public-api sections`.

---

### Task 6: Sibling spec amendment [specialist: none]

**Charter capability:** Non-code reference detection (schema reconciliation)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `.context-index/specs/features/tree-sitter-repomap/core-parser-pipeline.spec.md`

**Tests:** None — markdown-only change. Spec drift detection will catch this.

**Context to load:**
- `core-parser-pipeline.spec.md` (full read, focus on Postconditions and Domain Model)
- This spec's Schema Evolution Rule section

- [ ] **Edit the sibling spec** — Bump its `revision` to 2. Update Postconditions: FileNode adds optional `tags: string[]`; Edge `type` enumeration extends with `"doc-reference"`; Edge adds optional `count: integer`; symbol entries add optional `referenceSources: string[]`. Note the back-reference to this spec in a revision-history comment.
- [ ] **Commit** — `docs(tree-sitter-repomap): amend core-parser-pipeline rev 2 — additive schema evolution`.

---

### Task 7: Downstream consumer audit [specialist: none]

**Charter capability:** Non-code reference detection (consumer-tolerance)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 4
**Files:**
- Modify (only if a consumer asserts a closed set): up to 4 SKILL.md or `lib/` files for `/adev:route`, `/adev:validate`, `/adev:recover`, `/adev:hygiene`.

**Tests:** Existing tests for each consumer skill must continue passing.

**Context to load:**
- Grep results: `grep -rn "dependency-graph\|symbol-ranks" skills/route/ skills/validate/ skills/recover/ skills/hygiene/ lib/`
- Spec Schema Evolution Rule (the consumer-side guidance)

- [ ] **Read each consumer** — For each of the four skills, read the code that reads `dependency-graph.json` / `symbol-ranks.json`. Confirm or refute that it asserts closed sets.
- [ ] **Patch any closed-set assertions** — If a consumer hard-codes the v1 Edge `type` enum or rejects unknown FileNode fields, patch it to ignore unknown values silently.
- [ ] **Verify existing tests pass** — Run `npm test` and confirm no regression.
- [ ] **Commit** — `fix(<scope>): downstream consumers tolerate doc-reference edges and FileNode tags` (omit if no patches needed; in that case the commit message records the audit result: `docs(tree-sitter-repomap): downstream consumer audit — all clean`).

---

### Task 8: Unit + integration tests [specialist: none]

**Charter capability:** Non-code reference detection (correctness)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2, Task 4
**Files:**
- Create: `tests/repomap/non-code-references.integration.test.mjs`
- Augment: `tests/repomap/doc-references.test.mjs` (from Task 1) and `tests/repomap/public-api-entries.test.mjs` (from Task 2) — fill remaining edge cases not covered when the modules were first written.

**Tests:** All three test files above.

**Context to load:**
- Spec Acceptance Criteria
- Codehealth report `.context-index/reports/codehealth-2026-05-17.md` for the three false positives to verify

- [ ] **Write failing integration test** — Run the full pipeline against this project; assert: `dependency-graph.json` (tree-sitter mode) contains at least one `doc-reference` edge from `skills/**/SKILL.md` to `lib/**/*.mjs`; at least one FileNode with `tags` including `"public-api-entry"`; `lib/test-strategies/`, `lib/governance/`, `cli/index.mjs` re-exports are NOT in the "zero inbound" set after this pipeline runs. In regex mode, `repo-map.md` contains the three new sections and no JSON artifacts are produced.
- [ ] **Verify test fails** — Run; expect FAIL (depending on which tasks have landed).
- [ ] **Verify test passes after impl is complete** — Run; expect PASS.
- [ ] **Commit** — `test(tree-sitter-repomap): integration tests for non-code reference detection`.

---

### Task 9: Hygiene re-baseline verification [specialist: none]

**Charter capability:** Non-code reference detection (validation)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** All prior tasks
**Files:** None (verification-only task).

**Tests:** None — observational.

- [ ] **Re-run `/adev:repomap`** — Regenerate `.context-index/hygiene/repo-map.md`, `dependency-graph.json`, `symbol-ranks.json`.
- [ ] **Re-run the codehealth investigation** — Confirm none of the three false positives from `codehealth-2026-05-17.md` (`lib/test-strategies/`, `lib/governance/`, `cli/index.mjs` re-exports) appear as zero-inbound.
- [ ] **Capture the result in this task's commit** — `chore(tree-sitter-repomap): hygiene re-baseline — codehealth false positives resolved`.

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test` (gate `test` in `governance/gates.yaml`)
- All spec acceptance criteria satisfied
- PageRank sum-to-1.0 invariant preserved (charter invariant)
- No constitutional violations introduced (no new external dependencies; all new code is ESM `.mjs`)
