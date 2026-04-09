# Live Spec: Validate Extraction

<!-- Live Spec within the heuristics charter.
     Phase 1a: add Check 12 (Success Heuristic Extraction) to /adev:validate
     SKILL.md, consuming the lib/heuristics.mjs API defined in
     store-and-helper.md. Runs only on first-run PASS.
     Does NOT modify the helper API — only consumes it.
     Parent Charter: .context-index/specs/features/heuristics/charter.md -->

---
charter: heuristics
status: review-pending
risk_level: low
milestone: 1a
revision: 1
charter-revision: 2
created: 2026-04-09
updated: 2026-04-09
---

## Behavioral Contract

### Preconditions

- `/adev:validate` has completed Checks 1-11 for a target spec
- Overall validation result is PASS (no failures in any non-warning check)
- This is the first validation run for this spec (no sibling `<spec-slug>-validation.md` file already exists)
- `lib/heuristics.mjs` is available (if missing, the check degrades to a `SKIP`)
- The target spec has a valid `charter:` field in its frontmatter

### Behaviors

1. **When** all prior checks PASS **and** no prior validation report exists for the target spec **then** Check 12 runs before the final report is written.
2. **When** a prior validation report exists (any `<spec-slug>-validation.md` sibling file) **then** Check 12 is skipped with status `SKIP` and note `"not first-run PASS"`.
3. **When** any prior check FAILed **then** Check 12 is skipped with status `SKIP` and note `"non-PASS result"`.
4. **When** Check 12 runs **then** the heuristic's `scope` is read from the target spec's `charter:` frontmatter field.
5. **When** Check 12 composes the heuristic **then** the `pattern` summarizes the success factor derived from the validation context — one of: a referenced golden sample, a followed ADR, a completed context packet, or a clean first-run implementation.
6. **When** no specific success factor can be identified **then** the `pattern` defaults to `"First-run PASS for <spec-title>: implementation matched all acceptance criteria without revision"`.
7. **When** Check 12 composes the heuristic **then** `anti-pattern` is left empty (success heuristics describe what to do, not what to avoid).
8. **When** Check 12 composes the heuristic **then** `evidence[]` contains exactly one entry: `{ source: "validation", path: "<validation-report-path>", date: "<today>" }`.
9. **When** Check 12 writes the heuristic **then** `confidence` is set to `medium` (first-run PASS is a stronger signal than recovery; `writeHeuristic` auto-promotes to `high` on the 3rd distinct-path recurrence).
10. **When** the `id` is generated **then** it is derived from the spec slug and a stable 6-character hash of the pattern text (e.g., `login-flow-d4e5f6`) to enable recurrence detection across validations of similar specs.
11. **When** `writeHeuristic` throws any error **then** Check 12 records status `SKIP` with the error message, but the overall validation result remains PASS.
12. **When** `lib/heuristics.mjs` is absent or fails to import **then** Check 12 is reported as `SKIP` with note `"helper unavailable"`; validation completes normally.
13. **When** Check 12 completes successfully **then** the validation report includes: `Check 12: Success Heuristic Extracted — <id> (scope: <scope>, confidence: medium)`.
14. **When** Check 12 is skipped **then** the validation report still lists Check 12 with its skip reason (for observability).

### Postconditions

- After a successful Check 12, a subsequent `readHeuristics(projectRoot, { module: <scope>, minConfidence: "medium" })` call returns the newly extracted entry.
- `/adev:validate`'s overall PASS/FAIL result is never influenced by Check 12 — the check is observational and non-blocking.
- Repeat validations of the same spec never create duplicate heuristics (Check 12 is gated on first-run PASS only).

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Target spec has no `charter:` frontmatter field | Skip Check 12 with note `"no charter scope"`, leave result unchanged | — |
| Validation report path cannot be resolved | Skip Check 12 with note `"no report path"`, leave result unchanged | — |
| `writeHeuristic` throws `HEURISTICS_SCHEMA_ERROR` | Skip Check 12 with the error message, leave result unchanged | — |
| `writeHeuristic` throws any other error | Skip Check 12 with the error message, leave result unchanged | — |
| `lib/heuristics.mjs` import fails | Skip Check 12 with note `"helper unavailable"`, leave result unchanged | — |

## System Constitution Reference

- **Principle 2: Skills are primarily markdown** — Check 12 is documented in `skills/validate/SKILL.md`; the inline Node invocation calls `lib/heuristics.mjs`. Skipping the check never affects the overall validation result.
- **Graceful degradation** — helper absence or failure is always reported as `SKIP`, never as FAIL. This preserves the validation workflow's primary purpose (spec compliance verification).
- **No false positives** — Check 12 only runs on the *first* PASS per spec, so repeat validations (e.g., after source manifest drift) don't create duplicate heuristics.
- **No hook protocol changes** — this spec modifies skill markdown only; no hooks are touched.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| T1 | Add Check 12 "Success Heuristic Extraction" markdown section to `skills/validate/SKILL.md` immediately after Check 11 | small |
| T2 | Update the validation report template to include Check 12 with full `SKIP` reason support | small |
| T3 | Document the "first-run PASS" detection rule (check for existing `-validation.md` sibling) | small |
| T4 | Document the success-factor derivation rules (golden sample / ADR / context packet / default) | small |
| T5 | Document the id generation rule (spec slug + 6-char hash of pattern text) | small |
| T6 | Specify the inline Node invocation pattern for calling `writeHeuristic` from the skill | small |
| T7 | Add eval test under `skills/validate/evals/` for first-run PASS extraction (verifies heuristic written at `medium`) | medium |
| T8 | Add eval test for second-run PASS (verifies `SKIP` with note `"not first-run PASS"`) | small |
| T9 | Add eval test for partial FAIL (verifies `SKIP` with note `"non-PASS result"`) | small |
| T10 | Integration test: end-to-end validate with extraction, verify heuristic appears at `medium` confidence via `readHeuristics` | medium |

## Acceptance Criteria

- [ ] `skills/validate/SKILL.md` has a Check 12 section titled "Success Heuristic Extraction" placed after Check 11
- [ ] Check 12 runs only when the overall result is PASS **and** no prior validation report exists for the target spec
- [ ] Skipped runs are explicitly reported with a reason (never silently omitted)
- [ ] Scope is derived from the target spec's `charter:` frontmatter field
- [ ] `id` generation is deterministic: the same spec + same pattern text produces the same id across invocations
- [ ] Initial `confidence` is always `medium`
- [ ] `evidence[]` always references the validation report path with `source: "validation"` and today's date
- [ ] Extraction failures never change the overall validation result (stays PASS if Checks 1-11 passed)
- [ ] Validation report always lists Check 12 with its outcome (PASS / SKIP + reason)
- [ ] Eval test covers first-run PASS case (heuristic written)
- [ ] Eval test covers second-run PASS case (SKIP with correct note)
- [ ] Eval test covers partial FAIL case (SKIP with correct note)
- [ ] Integration test verifies end-to-end `writeHeuristic` → `readHeuristics` round trip at `medium` confidence
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
