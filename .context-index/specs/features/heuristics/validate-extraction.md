# Live Spec: Validate Extraction

<!-- Live Spec within the heuristics charter.
     Phase 1a: add Check 12 (Success Heuristic Extraction) to /adev:validate
     SKILL.md, consuming the lib/heuristics.mjs API defined in
     store-and-helper.md. Runs only on first-run PASS.
     Does NOT modify the helper API — only consumes it.
     Parent Charter: .context-index/specs/features/heuristics/charter.md -->

---
charter: heuristics
status: validated
risk_level: low
milestone: 1a
revision: 2
charter-revision: 3
created: 2026-04-09
updated: 2026-04-09
source-manifest:
  sha: "de8e964"
  files:
    - skills/validate/SKILL.md
    - tests/skills/validate-extraction.test.mjs
    - tests/skills/validate-success-heuristic-harness.mjs
    - tests/skills/validate-success-heuristic.test.mjs
  computed-at: "2026-04-10T00:28:19.351Z"
---

## Behavioral Contract

### Preconditions

- `/adev:validate` has completed Checks 1-11 for a target spec
- Overall validation result is PASS (no failures in any non-warning check)
- This is the first validation run for this spec (see First-Run Detection Rule below)
- `lib/heuristics.mjs` is available (if missing, the check is reported as `SKIP`)
- The target spec has a valid `charter:` field in its frontmatter
- `projectRoot` is resolvable from the skill execution context (walk up from `process.cwd()` to find the nearest `.context-index/` directory; fallback to `process.env.CLAUDE_PROJECT_ROOT`)

### Spec-Slug Derivation Rule

The `spec-slug` used throughout this spec is derived from the target spec file as follows:

1. Take the target spec's absolute path
2. Compute `path.basename(path, '.md')` to get the filename stem
3. Lowercase and replace any non-alphanumeric characters with `-`
4. Collapse consecutive `-` characters; strip leading/trailing `-`

This same rule is used for (a) the First-Run Detection check, (b) id generation, and (c) the report output. The rule is applied consistently so that the first-run gate and id match.

### First-Run Detection Rule

Check 12 treats a validation as "first run" if and only if no file matching the pattern `<spec-slug>-validation.md` exists in the same directory as the target spec. File deletion followed by re-validation IS treated as a first run (intentional: explicit deletion signals the user wants to re-extract).

### Scope Derivation Rule

The scope is derived from the target spec's `charter:` frontmatter field:

1. Read the `charter:` value from the target spec's YAML frontmatter
2. Apply `path.basename()` to strip any traversal sequences
3. Check the result against `manifest.yaml` `modules[].slug`
4. If matched, use it as `scope`
5. Otherwise, fall back to `_global`

This maps a charter name to a module slug; the two are usually the same, but the `manifest.yaml` lookup is the canonical source of truth.

### Title Derivation Rule

The heuristic `title` is composed as `"First-run PASS: <spec-title>"` where:
- `<spec-title>` is the first-level heading (`# ...`) from the target spec file, with any leading `Live Spec: ` prefix removed
- If no heading exists, use the spec-slug as a fallback
- Total title length must not exceed 120 characters (matches `writeHeuristic` schema cap; longer titles are truncated to 117 chars plus `...`)

### ID Derivation Rule

The `id` is composed as `<spec-slug>-<hash>` where:
- `<spec-slug>` is derived per the Spec-Slug Derivation Rule above
- `<hash>` is the first 8 characters of the lowercase hex SHA-256 of a normalization input comprising: the spec's absolute file path (lowercased, with path separators normalized to `/`) + `|` + the pattern text. Including the file path prevents id collisions between two specs with identical titles.
- For well-formed spec filenames (at least one alphanumeric character in the filename stem), the resulting id matches the safe-slug pattern `/^[_a-z0-9][_a-z0-9-]{0,63}$/` by construction. For pathological filenames (e.g., all-punctuation stems that strip to empty), the id would fail the safe-slug check; `writeHeuristic` throws `HEURISTICS_SCHEMA_ERROR` and Check 12 falls back to `SKIP` per Behavior 13.

### Behaviors

1. **When** all prior checks PASS **and** no prior validation report exists for the target spec **then** Check 12 runs before the final report is written.
2. **When** a prior validation report exists (matched per the First-Run Detection Rule) **then** Check 12 is reported as `SKIP` with note `"not first-run PASS"`.
3. **When** any prior check FAILed **then** Check 12 is reported as `SKIP` with note `"non-PASS result"`.
4. **When** Check 12 runs **then** it derives `scope` per the Scope Derivation Rule (reads the spec's `charter:` frontmatter and validates against `manifest.yaml` `modules[].slug`, falling back to `_global` on mismatch).
5. **When** Check 12 composes the heuristic **then** `title` is derived per the Title Derivation Rule.
6. **When** Check 12 composes the heuristic **then** `id` is derived per the ID Derivation Rule (includes file path to prevent same-title collisions).
7. **When** Check 12 composes the heuristic **then** `pattern` summarizes the success factor derived from the validation context. Success factors are detected in this priority order: (a) a golden sample referenced in the implementation, (b) an ADR referenced in the context packet, (c) a completed context packet noted as pre-condition, (d) default pattern below.
8. **When** no specific success factor can be identified **then** the `pattern` defaults to `"First-run PASS for <spec-title>: implementation matched all acceptance criteria without revision"`.
9. **When** Check 12 composes a heuristic whose pattern is derived from a context packet **then** the pattern describes the structural or behavioral lesson (e.g., "context packet referenced cross-cutting auth spec") — it does NOT copy packet content verbatim (avoids preserving environment-specific paths, file names, or embedded configuration).
10. **When** Check 12 composes the heuristic **then** `antiPattern` is left empty (success heuristics describe what to do, not what to avoid).
11. **When** Check 12 composes the heuristic **then** `evidence[]` contains exactly one entry: `{ source: "validation", path: "<validation-report-path>", date: "<today>" }`.
12. **When** Check 12 writes the heuristic **then** it passes `confidence: medium` as the caller-supplied initial value (first-run PASS is a stronger signal than recovery's `low`; the helper's absolute-threshold auto-promotion will raise to `high` at the 3rd distinct-path evidence entry — see store-and-helper Behavior 12).
13. **When** `writeHeuristic` throws any error **then** Check 12 is reported as `SKIP` with the error message, but the overall validation result remains PASS.
14. **When** `lib/heuristics.mjs` is absent or fails to import **then** Check 12 is reported as `SKIP` with note `"helper unavailable"`; validation completes normally.
15. **When** Check 12 completes successfully **then** the validation report includes: `Check 12: Success Heuristic Extracted — <id> (scope: <scope>, confidence: medium)`.
16. **When** Check 12 is skipped **then** the validation report still lists Check 12 with its skip reason (for observability).

### Postconditions

- After a successful Check 12, a subsequent `readHeuristics(projectRoot, { module: <scope>, minConfidence: "medium" })` call returns the newly extracted entry.
- `/adev:validate`'s overall PASS/FAIL result is never influenced by Check 12 — the check is observational and non-blocking.
- Repeat validations of the same spec (without explicit deletion of the prior `-validation.md`) never create duplicate heuristics — Check 12 is gated on first-run PASS only.
- No context-packet content or environment-specific strings appear verbatim in any extracted heuristic field.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Target spec has no `charter:` frontmatter field | Skip Check 12 with note `"no charter scope"`, leave overall result unchanged | — |
| Scope derivation produces a value that fails manifest lookup | Fall back to `_global` (not an error) | — |
| Validation report path cannot be resolved | Skip Check 12 with note `"no report path"`, leave result unchanged | — |
| `writeHeuristic` throws `HEURISTICS_SCHEMA_ERROR` (including title-too-long, invalid scope/id) | Skip Check 12 with the error message, leave result unchanged | — |
| `writeHeuristic` throws any other error | Skip Check 12 with the error message, leave result unchanged | — |
| `lib/heuristics.mjs` import fails | Skip Check 12 with note `"helper unavailable"`, leave result unchanged | — |

## System Constitution Reference

- **Principle 2: Skills are primarily markdown** — Check 12 is documented in `skills/validate/SKILL.md`; the inline Node invocation calls `lib/heuristics.mjs`. Skipping the check never affects the overall validation result.
- **Graceful degradation** — helper absence or failure is always reported as `SKIP`, never as FAIL. This preserves the validation workflow's primary purpose.
- **No false positives** — Check 12 only runs on the *first* PASS per spec, so repeat validations (e.g., after source manifest drift) don't create duplicate heuristics.
- **Data safety** — distillation (not verbatim quotation) of context-packet content protects against accidentally capturing environment-specific strings in git-tracked heuristic files.
- **No hook protocol changes** — this spec modifies skill markdown only; no hooks are touched.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| T1 | Add Check 12 "Success Heuristic Extraction" markdown section to `skills/validate/SKILL.md` immediately after Check 11 | small |
| T2 | Update the validation report template to include Check 12 with full `SKIP` reason support | small |
| T3 | Document the Spec-Slug Derivation Rule (basename without extension, lowercase, non-alphanumeric → `-`) | small |
| T4 | Document the First-Run Detection Rule (sibling `<spec-slug>-validation.md`; deletion counts as new first-run) | small |
| T5 | Document the Scope Derivation Rule (spec `charter:` frontmatter → `manifest.yaml` slug validation → `_global` fallback) | small |
| T6 | Document the Title Derivation Rule (`"First-run PASS: <spec-title>"`, 120-char cap with truncation) | small |
| T7 | Document the ID Derivation Rule (spec-slug + 8-char SHA-256 hex of lowercased-path + pipe + pattern) | small |
| T8 | Document `projectRoot` resolution for the inline Node invocation (walk up from cwd; fallback to `CLAUDE_PROJECT_ROOT` env) | small |
| T9 | Document success-factor derivation priority order (golden sample / ADR / context packet / default) and the "distill, do not copy" rule | small |
| T10 | Specify the inline Node invocation pattern for calling `writeHeuristic` from the skill, including the try/catch SKIP path | small |
| T11 | Add eval test under `skills/validate/evals/` for first-run PASS extraction (verifies heuristic written at `medium`) | medium |
| T12 | Add eval test for second-run PASS (verifies `SKIP` with note `"not first-run PASS"`) | small |
| T13 | Add eval test for partial FAIL (verifies `SKIP` with note `"non-PASS result"`) | small |
| T14 | Add eval test for helper-unavailable case (verifies `SKIP` with note `"helper unavailable"`) | small |
| T15 | Integration test: end-to-end validate with extraction, verify heuristic appears at `medium` confidence via `readHeuristics` | medium |
| T16 | Integration test: no context-packet content appears verbatim in extracted heuristic (verifies distillation discipline) | small |

## Acceptance Criteria

- [ ] `skills/validate/SKILL.md` has a Check 12 section titled "Success Heuristic Extraction" placed after Check 11
- [ ] Check 12 runs only when the overall result is PASS **and** no prior validation report exists for the target spec
- [ ] Skipped runs are explicitly reported with a reason (never silently omitted)
- [ ] Spec-Slug Derivation Rule is explicitly documented and used consistently in first-run detection, id generation, and report output
- [ ] First-Run Detection Rule explicitly states that deletion of the prior validation report is treated as a new first run
- [ ] Scope Derivation Rule validates against `manifest.yaml` `modules[].slug` and falls back to `_global` on mismatch
- [ ] Title Derivation Rule produces `"First-run PASS: <spec-title>"` with a 120-char cap and truncation
- [ ] ID Derivation Rule includes the absolute spec path to prevent id collisions between specs with identical titles
- [ ] ID uses 8-char SHA-256 hex (not 6) to reduce collision probability
- [ ] Initial `confidence` is always `medium` (caller-supplied; helper's absolute-threshold auto-promotion raises to `high` at the 3rd distinct-path evidence entry)
- [ ] `evidence[]` always references the validation report path with `source: "validation"` and today's date
- [ ] No context-packet content, ADR content, or golden-sample content appears verbatim in any heuristic field (verified by dedicated integration test)
- [ ] Extraction failures never change the overall validation result (stays PASS if Checks 1-11 passed)
- [ ] Validation report always lists Check 12 with its outcome (PASS / SKIP + reason)
- [ ] Eval test covers first-run PASS case (heuristic written)
- [ ] Eval test covers second-run PASS case (SKIP with correct note)
- [ ] Eval test covers partial FAIL case (SKIP with correct note)
- [ ] Eval test covers helper-unavailable case (SKIP with correct note)
- [ ] Integration test verifies end-to-end `writeHeuristic` → `readHeuristics` round trip at `medium` confidence
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
