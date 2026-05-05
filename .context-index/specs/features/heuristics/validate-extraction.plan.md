# Implementation Plan: Validate Extraction

> **Methodology:** adev
> **Charter:** .context-index/specs/features/heuristics/charter.md
> **Spec:** .context-index/specs/features/heuristics/validate-extraction.spec.md (r2)
> **Review:** PASS_WITH_NOTES (2026-04-09, r2)
> **Platform:** JavaScript ESM, Node.js, node:test, bash skill markdown

**Goal:** Add "Check 12: Success Heuristic Extraction" to `skills/validate/SKILL.md`, placed after the existing Check 11 (Visual Verification) and before the "## Report Format" section. The check runs only on first-run PASS and extracts a positive pattern via `lib/heuristics.mjs` `writeHeuristic` at `medium` confidence.

**Architecture:** This is a skill-markdown change, not code. The new Check 12 documents: (1) when it runs (first-run PASS only, detected via sibling `.validate.md` absence), (2) how spec-slug is derived consistently across the first-run gate and id generation, (3) how scope is derived from the spec's `charter:` frontmatter, (4) how title is derived with truncation, (5) how id incorporates the absolute path to prevent same-title collisions, (6) the success-factor priority order (sample → ADR → packet → default), (7) the inline Node invocation with SKIP semantics. Eval tests under `skills/validate/evals/` verify first-run PASS, second-run SKIP, partial-FAIL SKIP, and helper-unavailable SKIP.

---

## File Structure

**Create:**
- `skills/validate/evals/success-heuristic.test.mjs` — Eval tests for the 4 paths (first-run PASS, second-run SKIP, non-PASS SKIP, helper-unavailable SKIP)
- `tests/skills/validate-extraction.test.mjs` — Integration test: end-to-end validate with extraction, verifies the written heuristic at `medium` confidence

**Modify:**
- `skills/validate/SKILL.md` — Insert "### Check 12: Success Heuristic Extraction" after Check 11 (line 242) and before "## Report Format" (line 244). Also extend the report template to include Check 12 output with SKIP reason support.
- `.context-index/specs/features/heuristics/validate-extraction.spec.md` — `/adev:implement` stamps a `source-manifest` block after implementation
- `.context-index/specs/features/heuristics/charter.md` — Capability Map: "Validate Extraction" → `implemented`

**Reference (read, do not modify):**
- `skills/validate/SKILL.md` lines 200-320 (existing Check 11 and Report Format sections) — context for insertion point
- `lib/heuristics.mjs` (built in Phase 5) — the helper API consumed
- `.context-index/memory/heuristics/_format.md` (built in Phase 5) — id namespace convention reference
- `tests/helpers.mjs` — `createTempDir()`, `cleanupTempDir()`

## Context Packets

### T1 Context
- Spec: validate-extraction.md (header comment, Behaviors 1-3 for run conditions)
- Target: `skills/validate/SKILL.md` lines 200-320

### T2 Context
- Spec: validate-extraction.md (Behavior 13-16: report template output for PASS / SKIP with reason)
- Existing report template in SKILL.md (line 244 onward)

### T3 Context
- Spec: validate-extraction.md (Spec-Slug Derivation Rule section)
- Consistency: same rule must be used in first-run gate AND id generation

### T4 Context
- Spec: validate-extraction.md (First-Run Detection Rule section)
- Edge case: file deletion counts as new first-run

### T5 Context
- Spec: validate-extraction.md (Scope Derivation Rule section)
- Fallback to `_global` if charter doesn't match a module slug

### T6 Context
- Spec: validate-extraction.md (Title Derivation Rule with 117+`...` truncation)
- Format: `"First-run PASS: <spec-title>"`

### T7 Context
- Spec: validate-extraction.md (ID Derivation Rule with path normalization)
- Hash input: lowercased absolute path + `|` + pattern text

### T8 Context
- Spec: validate-extraction.md (Behavior 7-9: success factor priority + distillation)

### T9 Context
- Spec: validate-extraction.md (Preconditions: projectRoot resolution; Behaviors 11-14: try/catch SKIP paths)
- Reference: recover-extraction.plan.md T6-T7 for the inline Node pattern

### T10-T14 Context
- Spec: validate-extraction.md (acceptance criteria eval tests and integration test)
- Reference: `tests/helpers.mjs`, `lib/heuristics.mjs`

## Parallelization

- **Group A (sequential, all modify `skills/validate/SKILL.md`):** T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 — the Check 12 markdown grows incrementally.
- **Group B (test files, depend on Group A):** T10-T14.

`/adev:implement` runs strictly sequentially T1 → T14.

---

### Task 1: Insert Check 12 skeleton after Check 11 [specialist: none]

**Charter capability:** Validate Extraction
**Files:**
- Modify: `skills/validate/SKILL.md` (insert new section after Check 11 end and before "## Report Format")
- Test: `skills/validate/evals/success-heuristic.test.mjs`

**Tests:** `skills/validate/evals/success-heuristic.test.mjs` — smoke test that the heading exists

- [ ] **Write failing test**: assert `skills/validate/SKILL.md` contains `"### Check 12: Success Heuristic Extraction"` placed between `"### Check 11: Visual Verification"` and `"## Report Format"`
- [ ] **Verify fail**: section does not exist
- [ ] **Implement**: Add the Check 12 section header with a 2-sentence summary: "On first-run PASS (all checks 1-11 passed and no prior validation report exists), extract a positive pattern heuristic at `medium` confidence via `lib/heuristics.mjs` `writeHeuristic`. This check is observational — it never blocks the overall validation result."
- [ ] **Verify pass**
- [ ] **Commit**: `feat(validate): insert Check 12 Success Heuristic Extraction skeleton`

### Task 2: Extend the report template with Check 12 and SKIP support [specialist: none]

**Charter capability:** Validate Extraction
**Files:**
- Modify: `skills/validate/SKILL.md` (Report Format section starting line 244)

**Tests:** `skills/validate/evals/success-heuristic.test.mjs`

- [ ] **Write failing test**: assert the Report Format section template includes a Check 12 line with both the PASS form (`Check 12: Success Heuristic Extracted — <id> (scope: <scope>, confidence: medium)`) and a SKIP form with reason (`Check 12: SKIP — <reason>`)
- [ ] **Verify fail**
- [ ] **Implement**: Append a Check 12 entry to the report template with both PASS and SKIP examples, plus a brief "Check 12 Skip Reasons" enumeration (`"not first-run PASS"`, `"non-PASS result"`, `"helper unavailable"`, `"no charter scope"`, `"no report path"`, `<HEURISTICS_SCHEMA_ERROR message>`)
- [ ] **Verify pass**
- [ ] **Commit**: `feat(validate): Check 12 in report template with SKIP reasons`

### Task 3: Document Spec-Slug Derivation Rule [specialist: none]

**Charter capability:** Validate Extraction
**Files:**
- Modify: `skills/validate/SKILL.md` (Check 12 section)

**Tests:** `skills/validate/evals/success-heuristic.test.mjs`

- [ ] **Write failing test**: assert Check 12 section contains a "Spec-Slug Derivation Rule" sub-heading with the 4-step algorithm (basename without extension → lowercase → non-alphanumeric → `-` → collapse + strip leading/trailing `-`) and a note that the same rule is used in first-run detection, id generation, and report output
- [ ] **Verify fail**
- [ ] **Implement**: Add the rule sub-section
- [ ] **Verify pass**
- [ ] **Commit**: `feat(validate): Check 12 spec-slug derivation rule`

### Task 4: Document First-Run Detection Rule [specialist: none]

**Charter capability:** Validate Extraction
**Files:**
- Modify: `skills/validate/SKILL.md` (Check 12 section)

**Tests:** `skills/validate/evals/success-heuristic.test.mjs`

- [ ] **Write failing test**: assert Check 12 section contains a "First-Run Detection Rule" sub-heading explaining that `<spec-slug>.validate.md` sibling file absence = first run, including the explicit note that deletion followed by re-validation counts as first run
- [ ] **Verify fail**
- [ ] **Implement**: Add the rule sub-section
- [ ] **Verify pass**
- [ ] **Commit**: `feat(validate): Check 12 first-run detection rule`

### Task 5: Document Scope Derivation Rule [specialist: none]

**Charter capability:** Validate Extraction
**Files:**
- Modify: `skills/validate/SKILL.md` (Check 12 section)

**Tests:** `skills/validate/evals/success-heuristic.test.mjs`

- [ ] **Write failing test**: assert Check 12 section contains a "Scope Derivation Rule" sub-heading explaining: read `charter:` from target spec frontmatter → `path.basename` → validate against `manifest.yaml modules[].slug` → fall back to `_global`
- [ ] **Verify fail**
- [ ] **Implement**: Add the rule sub-section
- [ ] **Verify pass**
- [ ] **Commit**: `feat(validate): Check 12 scope derivation rule`

### Task 6: Document Title Derivation Rule with truncation [specialist: none]

**Charter capability:** Validate Extraction
**Files:**
- Modify: `skills/validate/SKILL.md` (Check 12 section)

**Tests:** `skills/validate/evals/success-heuristic.test.mjs`

- [ ] **Write failing test**: assert Check 12 section contains a "Title Derivation Rule" sub-heading with the `"First-run PASS: <spec-title>"` format, the 120-char cap, and an explicit truncation rule (truncate to 117 chars + `"..."` if needed)
- [ ] **Verify fail**
- [ ] **Implement**: Add the rule sub-section
- [ ] **Verify pass**
- [ ] **Commit**: `feat(validate): Check 12 title derivation with 117+... truncation`

### Task 7: Document ID Derivation Rule with path normalization [specialist: none]

**Charter capability:** Validate Extraction
**Files:**
- Modify: `skills/validate/SKILL.md` (Check 12 section)

**Tests:** `skills/validate/evals/success-heuristic.test.mjs`

- [ ] **Write failing test**: assert Check 12 section contains an "ID Derivation Rule" sub-heading with: (a) `<spec-slug>-<hash>` format, (b) 8-char lowercase hex SHA-256, (c) hash input formula: lowercased absolute path (separators normalized to `/`) + `|` + pattern text, (d) the rationale (path inclusion prevents same-title collisions), (e) pathological-filename fallback to SKIP
- [ ] **Verify fail**
- [ ] **Implement**: Add the rule sub-section with a worked example
- [ ] **Verify pass**
- [ ] **Commit**: `feat(validate): Check 12 id derivation with path normalization`

### Task 8: Document success-factor derivation priority order with distill rule [specialist: none]

**Charter capability:** Validate Extraction
**Files:**
- Modify: `skills/validate/SKILL.md` (Check 12 section)

**Tests:** `skills/validate/evals/success-heuristic.test.mjs`

- [ ] **Write failing test**: assert Check 12 section contains a "Success Factor Derivation" sub-heading with the 4-step priority order (golden sample → ADR → context packet → default) and an explicit "first match wins" note plus a distillation discipline note for context-packet derivations
- [ ] **Verify fail**
- [ ] **Implement**: Add the sub-section with each priority level documented; the default pattern template (`"First-run PASS for <spec-title>: implementation matched all acceptance criteria without revision"`) is included verbatim
- [ ] **Verify pass**
- [ ] **Commit**: `feat(validate): Check 12 success factor priority with distill rule`

### Task 9: Specify inline Node invocation pattern with SKIP paths [specialist: none]

**Charter capability:** Validate Extraction
**Files:**
- Modify: `skills/validate/SKILL.md` (Check 12 section)

**Tests:** `skills/validate/evals/success-heuristic.test.mjs`

- [ ] **Write failing test**: assert Check 12 section contains an "Inline Node Invocation" sub-heading with a `node -e` snippet that: (a) resolves `projectRoot` via walk-up or `CLAUDE_PROJECT_ROOT`, (b) imports `writeHeuristic` from `./lib/heuristics.mjs`, (c) wraps in try/catch with explicit SKIP reason codes on failure, (d) reports SKIP on import failure with reason `"helper unavailable"`, (e) never affects the overall validation PASS/FAIL
- [ ] **Verify fail**
- [ ] **Implement**: Add the sub-section with the full runnable snippet plus the SKIP-vs-FAIL distinction note
- [ ] **Verify pass**
- [ ] **Commit**: `feat(validate): Check 12 inline Node invocation with SKIP semantics`

### Task 10: Eval test — first-run PASS extracts heuristic at medium [specialist: none]

**Charter capability:** Validate Extraction
**Files:**
- Create/Modify: `skills/validate/evals/success-heuristic.test.mjs`

**Tests:** `skills/validate/evals/success-heuristic.test.mjs`

- [ ] **Write failing test**: in a temp dir with a mock `.context-index/`, a target spec, and no existing `<spec-slug>.validate.md`, simulate Checks 1-11 all PASS, run Check 12 logic, assert `writeHeuristic` was called with `confidence: "medium"`, assert the written heuristic's `title` starts with `"First-run PASS: "`, assert `source: "validation"`, assert `evidence[0].date` is today
- [ ] **Verify fail**
- [ ] **Implement**: Build a test harness that drives Check 12 logic given the preconditions
- [ ] **Verify pass**
- [ ] **Commit**: `test(validate): Check 12 first-run PASS eval`

### Task 11: Eval test — second-run SKIPs with correct reason [specialist: none]

**Charter capability:** Validate Extraction
**Files:**
- Modify: `skills/validate/evals/success-heuristic.test.mjs`

**Tests:** `skills/validate/evals/success-heuristic.test.mjs`

- [ ] **Write failing test**: same setup as T10 but a prior `<spec-slug>.validate.md` sibling file already exists. Simulate Checks 1-11 PASS, run Check 12 logic, assert Check 12 is reported as SKIP with note `"not first-run PASS"`, assert no heuristic was written
- [ ] **Verify fail**
- [ ] **Implement**: extend the harness to detect the sibling file per the First-Run Detection Rule
- [ ] **Verify pass**
- [ ] **Commit**: `test(validate): Check 12 second-run SKIP eval`

### Task 12: Eval test — partial FAIL SKIPs with correct reason [specialist: none]

**Charter capability:** Validate Extraction
**Files:**
- Modify: `skills/validate/evals/success-heuristic.test.mjs`

**Tests:** `skills/validate/evals/success-heuristic.test.mjs`

- [ ] **Write failing test**: setup a scenario where Check 2 (Spec Compliance) FAILs, run Check 12 logic, assert Check 12 is reported as SKIP with note `"non-PASS result"`, assert no heuristic was written, assert the overall validation result is still FAIL (Check 12 does not override)
- [ ] **Verify fail**
- [ ] **Implement**: extend the harness to accept a per-check pass/fail map
- [ ] **Verify pass**
- [ ] **Commit**: `test(validate): Check 12 partial FAIL SKIP eval`

### Task 13: Eval test — helper unavailable SKIPs with correct reason [specialist: none]

**Charter capability:** Validate Extraction
**Files:**
- Modify: `skills/validate/evals/success-heuristic.test.mjs`

**Tests:** `skills/validate/evals/success-heuristic.test.mjs`

- [ ] **Write failing test**: setup a scenario where `lib/heuristics.mjs` import throws (e.g., module doesn't exist at the expected path in a temp project), run Check 12 logic, assert Check 12 is reported as SKIP with note `"helper unavailable"`, assert the overall validation result is unchanged, assert a single-line stderr warning was logged
- [ ] **Verify fail**
- [ ] **Implement**: extend the harness with a mock that can fail the dynamic import
- [ ] **Verify pass**
- [ ] **Commit**: `test(validate): Check 12 helper unavailable SKIP eval`

### Task 14: Integration test — end-to-end validate with extraction round-trip + distillation + antiPattern shape [specialist: none]

**Charter capability:** Validate Extraction
**Files:**
- Create: `tests/skills/validate-extraction.test.mjs`

**Tests:** `tests/skills/validate-extraction.test.mjs`

- [ ] **Write failing test**: in a fully-populated temp project (real `lib/heuristics.mjs` copy, real `.context-index/memory/heuristics/` directory, a mock target spec with `charter:` frontmatter and a context packet containing a credential-like string such as `"api_key=AKIAIOSFODNN7EXAMPLE"` and environment-specific paths), run Check 12 on a first-run PASS, then `readHeuristics(tempRoot, { module: <charter>, minConfidence: 'medium' })`. Assert:
  - (a) the extracted heuristic is returned with `confidence: "medium"`, `source: "validation"`, `evidence[0].date` is today
  - (b) `title` starts with `"First-run PASS: "`
  - (c) **distillation discipline** (Behavior 9, spec T16): no verbatim packet/ADR/sample content appears in any heuristic field — specifically assert that the credential string and environment-specific paths from the mock context packet do NOT appear in `title`, `pattern`, or `antiPattern`
  - (d) **Behavior 10** (antiPattern shape): `antiPattern` is empty (empty string or missing field — success heuristics describe what to do, not what to avoid)
- [ ] **Verify fail**
- [ ] **Implement**: build the end-to-end harness using `createTempDir()` + file copies of `lib/heuristics.mjs`. The harness simulates the derivation rules per the Success Factor Derivation section of Check 12, with the distill-not-copy discipline enforced. The test covers round-trip AND distillation AND antiPattern shape in one scenario.
- [ ] **Verify pass**
- [ ] **Commit**: `test(validate): Check 12 e2e round-trip with distillation and antiPattern shape`

---

## Quality Gates

- [ ] Tests pass: `npm test`
- [ ] All 18 acceptance criteria from the spec satisfied
- [ ] `skills/validate/SKILL.md` contains a "### Check 12: Success Heuristic Extraction" section placed after Check 11 and before "## Report Format"
- [ ] Report Format template updated to include Check 12 output with SKIP reason support
- [ ] Eval tests cover first-run PASS, second-run SKIP, partial FAIL SKIP, helper-unavailable SKIP
- [ ] Integration test verifies end-to-end round-trip at `medium` confidence
- [ ] Check 12 never changes the overall validation PASS/FAIL result
- [ ] No constitutional violations (skill remains markdown-primary)

## Notes

- Tasks T1-T9 all modify `skills/validate/SKILL.md`; `/adev:implement` must dispatch them sequentially.
- This plan depends on `lib/heuristics.mjs` being implemented and validated first (Phase 5 and 6). `/adev:implement` will be invoked on this plan in Phase 9, after the helper is stable.
- Interesting dogfooding loop: when this plan is implemented and then validated in Phase 10, the newly-added Check 12 will fire against `validate-extraction.md` itself — the first production use of the path this spec just added. If it writes a heuristic successfully, that's a good smoke test; if it SKIPs with `"helper unavailable"` during the first run (before manifest stamping), that's also acceptable.
- Advisory notes from r2 re-review (SA-NEW-7 UTF-8 truncation, SEC-NEW-4 path-separator normalization, SEC-NEW-5/6 intentional-deletion semantics) are non-blocking observations and are not addressed by this plan but can be picked up during implementation if convenient.
