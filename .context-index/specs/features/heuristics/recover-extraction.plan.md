# Implementation Plan: Recover Extraction

> **Methodology:** adev
> **Charter:** .context-index/specs/features/heuristics/charter.md
> **Spec:** .context-index/specs/features/heuristics/recover-extraction.spec.md (r3)
> **Review:** PASS_WITH_NOTES (2026-04-09, r3 targeted re-review)
> **Platform:** JavaScript ESM, Node.js, node:test, bash skill markdown

**Goal:** Add "Step 7: Extract Heuristic" to `skills/recover/SKILL.md`, placed immediately after the existing Step 6 (Enrich), that distills the recovery's root-cause diagnosis into a heuristic entry via `lib/heuristics.mjs` `writeHeuristic`.

**Architecture:** This is a skill-markdown change, not code. The new Step 7 documents: (1) when it runs (after Step 6 Enrich), (2) how scope is derived from the active plan path, (3) how title is derived from the diagnosis category, (4) how id is deterministically derived from the normalized root-cause text for recurrence detection, (5) how the inline Node invocation calls `lib/heuristics.mjs` with `projectRoot` resolution, and (6) how failures degrade gracefully without blocking recovery. Eval tests under `skills/recover/evals/` verify the skill produces a well-formed heuristic for each of the 6 diagnosis categories, and a tests/integration file verifies end-to-end recover→writeHeuristic→readHeuristics round-trip and recurrence-driven auto-promotion.

---

## File Structure

**Create:**
- `skills/recover/evals/extract-heuristic.test.mjs` — Eval tests for all 6 diagnosis categories (well-formed heuristic output)
- `tests/skills/recover-extraction.test.mjs` — Integration tests for end-to-end writeHeuristic→readHeuristics and recurrence auto-promotion

**Modify:**
- `skills/recover/SKILL.md` — Insert "### Step 7: Extract Heuristic" after the existing "### Step 6: Enrich" (line 267-319) and before the "## Patterns Across Multiple Recoveries" section (line 304)
- `.context-index/specs/features/heuristics/recover-extraction.spec.md` — `/adev:implement` stamps a `source-manifest` block in frontmatter after implementation
- `.context-index/specs/features/heuristics/charter.md` — Capability Map: "Recover Extraction" → `implemented`

**Reference (read, do not modify):**
- `skills/recover/SKILL.md` lines 267-319 (existing Step 6: Enrich) — context for insertion point
- `lib/heuristics.mjs` (built in Phase 5) — the helper API this step consumes
- `.context-index/memory/heuristics/_format.md` (built in Phase 5) — id namespace convention reference
- `tests/helpers.mjs` — `createTempDir()`, `cleanupTempDir()`

## Context Packets

### T1 Context
- Spec: recover-extraction.md (header comment, Scope/Title/ID Derivation Rules)
- Target: `skills/recover/SKILL.md` lines 248-330 (Step 5 Resume, Step 6 Enrich, Red Flags)
- Convention: the existing Step 6 Enrich writes to `.context-index/hygiene/recoveries/<date>-<task-slug>.md`; Step 7's evidence[] references this path

### T2 Context
- Spec: recover-extraction.md (Behaviors 5-10: the 6 category templates)
- Data safety rule: distill, do not quote verbatim (Behaviors 5-10, postcondition 4)

### T3 Context
- Spec: recover-extraction.md (Scope Derivation Rule section)
- Manifest: `.context-index/manifest.yaml` `modules[].slug` list

### T4 Context
- Spec: recover-extraction.md (Title Derivation Rule section)
- Helper schema: `lib/heuristics.mjs` 120-char cap on title

### T5 Context
- Spec: recover-extraction.md (ID Derivation Rule section)
- Normalization algorithm: lowercase + collapse whitespace + strip punctuation except `-`/`_`

### T6 Context
- Spec: recover-extraction.md (Preconditions: projectRoot resolution rule)
- Reference: `lib/execution-state.mjs` for the walk-up-from-cwd pattern

### T7 Context
- Spec: recover-extraction.md (Behaviors 11-16: writeHeuristic invocation, try/catch degradation, final confirmation line)
- Helper API: `lib/heuristics.mjs` `writeHeuristic(projectRoot, entry)`

### T8 Context
- Spec: recover-extraction.md (Behavior 16: confirmation line format)
- Existing Red Flags section in recover SKILL.md (line 321) — do not break

### T9 Context
- Spec: recover-extraction.md (acceptance criteria: eval test exercises all 6 categories)
- Pattern: existing eval tests under `skills/*/evals/` if any

### T10-T12 Context
- Spec: recover-extraction.md (integration test acceptance criteria)
- Reference: `tests/helpers.mjs` `createTempDir()`

## Parallelization

- **Group A (sequential, all modify `skills/recover/SKILL.md`):** T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 — the new Step 7 markdown grows incrementally through these tasks; they all share the same target file.
- **Group B (independent, creates new files):** T9 (eval test), T10-T12 (integration tests) — depend on T1-T8 being complete.

`/adev:implement` runs strictly sequentially T1 → T12.

---

### Task 1: Insert Step 7 skeleton after Step 6 Enrich [specialist: none]

**Charter capability:** Recover Extraction
**Files:**
- Modify: `skills/recover/SKILL.md` (insert new section between line 319 end of Step 6 and line 304 start of "## Patterns Across Multiple Recoveries")
- Test: (T9 will cover this task's output as part of the full eval)

**Tests:** This is a markdown-only task. Verification: grep for "Step 7: Extract Heuristic" in the file. Eval test (T9) is the functional test.

- [ ] **Write failing test**: `skills/recover/evals/extract-heuristic.test.mjs` — smoke test that asserts `skills/recover/SKILL.md` contains a heading "### Step 7: Extract Heuristic" placed after "### Step 6: Enrich" and before "## Patterns Across Multiple Recoveries"
- [ ] **Verify fail**: section does not exist
- [ ] **Implement**: Add the Step 7 section header with a 2-sentence summary: "After the recovery record is written in Step 6, extract a transferable heuristic from the root-cause diagnosis via `lib/heuristics.mjs` `writeHeuristic`. This step is non-blocking — extraction failures log a warning and allow `/adev:recover` to exit normally."
- [ ] **Verify pass**: smoke test finds the heading
- [ ] **Commit**: `feat(recover): insert Step 7 Extract Heuristic skeleton`

### Task 2: Document the 6 category-to-(pattern, antiPattern) mapping [specialist: none]

**Charter capability:** Recover Extraction
**Files:**
- Modify: `skills/recover/SKILL.md` (Step 7 section)

**Tests:** `skills/recover/evals/extract-heuristic.test.mjs`

- [ ] **Write failing test**: assert each of the 6 category labels (`MISSING_CONTEXT`, `AMBIGUOUS_SPEC`, `CONSTRAINT_CONFLICT`, `NOVEL_PROBLEM`, `TOOL_FAILURE`, `BUDGET_EXHAUSTION`) appears in the Step 7 section with a template describing what `pattern` and `antiPattern` should contain
- [ ] **Verify fail**
- [ ] **Implement**: Add a sub-heading "### Category Templates" listing each of the 6 diagnosis categories with: (a) `pattern` guidance (what to write), (b) `antiPattern` guidance (empty for NOVEL_PROBLEM), and (c) an explicit "Distill, do not quote verbatim" warning — especially for AMBIGUOUS_SPEC where raw spec phrases might embed credentials
- [ ] **Verify pass**
- [ ] **Commit**: `feat(recover): Step 7 category templates with distill rule`

### Task 3: Document Scope Derivation Rule [specialist: none]

**Charter capability:** Recover Extraction
**Files:**
- Modify: `skills/recover/SKILL.md` (Step 7 section)

**Tests:** `skills/recover/evals/extract-heuristic.test.mjs`

- [ ] **Write failing test**: assert the Step 7 section contains a "Scope Derivation Rule" sub-heading with the 6-step algorithm (read active plan path → split on `/` → segment after `features/` → path.basename → manifest.yaml modules[].slug check → `_global` fallback)
- [ ] **Verify fail**
- [ ] **Implement**: Add the 6-step Scope Derivation Rule sub-section with a worked example (`.context-index/specs/features/hooks/*.plan.md` → `hooks`) and explicit fallback-to-`_global` behavior for unknown scopes
- [ ] **Verify pass**
- [ ] **Commit**: `feat(recover): Step 7 scope derivation rule`

### Task 4: Document Title Derivation Rule [specialist: none]

**Charter capability:** Recover Extraction
**Files:**
- Modify: `skills/recover/SKILL.md` (Step 7 section)

**Tests:** `skills/recover/evals/extract-heuristic.test.mjs`

- [ ] **Write failing test**: assert the Step 7 section contains a "Title Derivation Rule" sub-heading with: (a) the `"<category-label>: <short-summary>"` format, (b) the 6 category labels (`Missing context`, `Ambiguous spec`, etc.), (c) the 120-char cap, (d) an explicit "5-10 word distilled summary" guideline
- [ ] **Verify fail**
- [ ] **Implement**: Add the Title Derivation Rule sub-section
- [ ] **Verify pass**
- [ ] **Commit**: `feat(recover): Step 7 title derivation rule`

### Task 5: Document ID Derivation Rule with normalization [specialist: none]

**Charter capability:** Recover Extraction
**Files:**
- Modify: `skills/recover/SKILL.md` (Step 7 section)

**Tests:** `skills/recover/evals/extract-heuristic.test.mjs`

- [ ] **Write failing test**: assert the Step 7 section contains an "ID Derivation Rule" sub-heading with: (a) `<category-slug>-<hash>` format, (b) 8-char lowercase hex SHA-256, (c) normalization algorithm (lowercase, collapse whitespace, strip punctuation except `-`/`_`), (d) the purpose (recurrence detection)
- [ ] **Verify fail**
- [ ] **Implement**: Add the ID Derivation Rule sub-section with a worked example: `MISSING_CONTEXT` + "Error: cache miss on third-party API" → `missing-context-a1b2c3d4`
- [ ] **Verify pass**
- [ ] **Commit**: `feat(recover): Step 7 id derivation rule with recurrence normalization`

### Task 6: Document projectRoot resolution for the inline Node invocation [specialist: none]

**Charter capability:** Recover Extraction
**Files:**
- Modify: `skills/recover/SKILL.md` (Step 7 section)

**Tests:** `skills/recover/evals/extract-heuristic.test.mjs`

- [ ] **Write failing test**: assert the Step 7 section documents `projectRoot` resolution — walk up from `process.cwd()` to find the nearest `.context-index/` directory, fallback to `process.env.CLAUDE_PROJECT_ROOT`
- [ ] **Verify fail**
- [ ] **Implement**: Add a "projectRoot Resolution" paragraph with the walk-up algorithm and env fallback; cite `lib/execution-state.mjs` convention
- [ ] **Verify pass**
- [ ] **Commit**: `feat(recover): Step 7 projectRoot resolution`

### Task 7: Specify the inline Node invocation pattern (writeHeuristic call + try/catch) [specialist: none]

**Charter capability:** Recover Extraction
**Files:**
- Modify: `skills/recover/SKILL.md` (Step 7 section)

**Tests:** `skills/recover/evals/extract-heuristic.test.mjs`

- [ ] **Write failing test**: assert the Step 7 section contains a code block with a `node -e` inline invocation that: (a) imports `writeHeuristic` from `./lib/heuristics.mjs`, (b) wraps the call in try/catch, (c) on success prints the confirmation line `Heuristic extracted: <id> (scope: <scope>, confidence: low)`, (d) on failure logs `heuristics: extraction skipped — <error>` to stderr and exits normally
- [ ] **Verify fail**
- [ ] **Implement**: Add the "Inline Node Invocation" sub-section with the full runnable snippet
- [ ] **Verify pass**
- [ ] **Commit**: `feat(recover): Step 7 inline Node invocation with try/catch`

### Task 8: Update the /adev:recover final report to mention the extracted heuristic id [specialist: none]

**Charter capability:** Recover Extraction
**Files:**
- Modify: `skills/recover/SKILL.md` (existing Step 6 or a new bullet in Step 7)

**Tests:** `skills/recover/evals/extract-heuristic.test.mjs`

- [ ] **Write failing test**: assert the Step 7 section's confirmation output documentation includes the heuristic id format `<id> (scope: <scope>, confidence: low)` and that this output is part of the `/adev:recover` wrap-up
- [ ] **Verify fail**
- [ ] **Implement**: Ensure the confirmation line is the last thing Step 7 prints; do not modify the existing Step 6 Enrich confirmation
- [ ] **Verify pass**
- [ ] **Commit**: `feat(recover): Step 7 confirmation line in final output`

### Task 9: Eval test exercising all 6 diagnosis categories [specialist: none]

**Charter capability:** Recover Extraction
**Files:**
- Create/Modify: `skills/recover/evals/extract-heuristic.test.mjs`

**Tests:** `skills/recover/evals/extract-heuristic.test.mjs`

- [ ] **Write failing test**: 6 test cases — one per category — that (a) simulate a mock recovery record for that category, (b) invoke the documented Step 7 logic inline, (c) assert the produced heuristic has correct `id` (category-prefix + 8-char hash), correct `title` (category label + summary, ≤120 chars), correct `pattern` and `antiPattern` (non-empty except `NOVEL_PROBLEM` antiPattern), correct `scope` (derived from mock plan path), correct `evidence[]` (single entry with `source: "recovery"`), correct `confidence: low`
- [ ] **Verify fail**
- [ ] **Implement**: Build a reusable test harness that takes a category + mock root-cause text, walks through the derivation rules, and calls `writeHeuristic`. Assert the written heuristic matches expectations via `readHeuristics`.
- [ ] **Verify pass**: all 6 category tests pass
- [ ] **Commit**: `test(recover): eval test covering all 6 diagnosis categories`

### Task 10: Integration test — end-to-end recover with extraction [specialist: none]

**Charter capability:** Recover Extraction
**Files:**
- Create: `tests/skills/recover-extraction.test.mjs`

**Tests:** `tests/skills/recover-extraction.test.mjs`

- [ ] **Write failing test**: in a temp dir, set up a mock `.context-index/` with a mock plan file under `features/hooks/`, a mock recovery record with a `MISSING_CONTEXT` diagnosis, invoke the Step 7 logic, then call `readHeuristics(tempRoot, { module: 'hooks' })` and assert the extracted heuristic is returned
- [ ] **Verify fail**
- [ ] **Implement**: Build a harness that drives Step 7 end-to-end in an isolated temp project
- [ ] **Verify pass**
- [ ] **Commit**: `test(recover): end-to-end extraction integration test`

### Task 11: Integration test — recurrence produces auto-promoted medium [specialist: none]

**Charter capability:** Recover Extraction
**Files:**
- Modify: `tests/skills/recover-extraction.test.mjs`

**Tests:** `tests/skills/recover-extraction.test.mjs`

- [ ] **Write failing test**: extract the same normalized root cause from 2 different mock plan paths (distinct source paths) — assert the second extraction auto-promotes the heuristic from `low` to `medium`; then extract a third time from another distinct path and assert auto-promotion to `high`
- [ ] **Verify fail**
- [ ] **Implement**: extend the harness with multi-recovery support
- [ ] **Verify pass**
- [ ] **Commit**: `test(recover): recurrence auto-promotion integration test`

### Task 12: Integration test — distillation discipline (no verbatim capture) [specialist: none]

**Charter capability:** Recover Extraction
**Files:**
- Modify: `tests/skills/recover-extraction.test.mjs`

**Tests:** `tests/skills/recover-extraction.test.mjs`

- [ ] **Write failing test**: mock a spec with an ambiguous phrase containing a credential-like string (e.g., `"api_key=AKIAIOSFODNN7EXAMPLE"`), set up an `AMBIGUOUS_SPEC` recovery, run Step 7, assert the extracted heuristic's `title`, `pattern`, and `antiPattern` do NOT contain the literal credential string
- [ ] **Verify fail** (if naive implementation verbatim copies the phrase)
- [ ] **Implement**: ensure the Step 7 markdown guidance enforces paraphrasing and the eval harness mirrors that behavior
- [ ] **Verify pass**
- [ ] **Commit**: `test(recover): distillation discipline verifies no verbatim capture`

---

## Quality Gates

- Tests pass: `npm test`
- All 16 acceptance criteria from the spec satisfied
- `skills/recover/SKILL.md` contains a "### Step 7: Extract Heuristic" section placed after the existing Step 6 (Enrich)
- Eval test exercises all 6 diagnosis categories
- Integration tests cover end-to-end extraction, recurrence auto-promotion, and distillation discipline
- No modification to the existing Step 6 Enrich section beyond adding Step 7 after it
- No constitutional violations (skill remains markdown-primary; helper call is via inline Node per convention)

## Notes

- Tasks T1-T8 all modify `skills/recover/SKILL.md` — `/adev:implement` must dispatch them sequentially to avoid file conflicts.
- This plan depends on `lib/heuristics.mjs` being implemented and validated first (Phase 5 and 6 in the build pipeline). `/adev:implement` will be invoked on this plan in Phase 7, after the helper is stable.
- The integration tests (T10-T12) exercise the real `lib/heuristics.mjs` via `readHeuristics` and `writeHeuristic` calls — no mocks of the helper itself.
