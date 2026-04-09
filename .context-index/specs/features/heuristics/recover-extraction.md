# Live Spec: Recover Extraction

<!-- Live Spec within the heuristics charter.
     Phase 1a: add Step 6 (Extract Heuristic) to /adev:recover SKILL.md,
     consuming the lib/heuristics.mjs API defined in store-and-helper.md.
     Does NOT modify the helper API — only consumes it.
     Parent Charter: .context-index/specs/features/heuristics/charter.md -->

---
charter: heuristics
status: review-blocked
risk_level: low
milestone: 1a
revision: 1
charter-revision: 2
created: 2026-04-09
updated: 2026-04-09
---

## Behavioral Contract

### Preconditions

- `/adev:recover` has successfully completed Step 5 (Write Recovery Record) for a stuck task
- The root cause diagnosis exists with exactly one of the six category labels: `MISSING_CONTEXT`, `AMBIGUOUS_SPEC`, `CONSTRAINT_CONFLICT`, `NOVEL_PROBLEM`, `TOOL_FAILURE`, `BUDGET_EXHAUSTION`
- `lib/heuristics.mjs` is available (if missing, the step degrades to a warning)
- The stuck task has an identifiable module scope (derivable from the active plan file path)

### Behaviors

1. **When** Step 5 has written a recovery record **then** Step 6 runs automatically before `/adev:recover` exits.
2. **When** Step 6 runs **then** it derives a `scope` from the active plan's module directory (e.g., a plan at `.context-index/specs/features/hooks/*.plan.md` maps to scope `hooks`).
3. **When** the module cannot be derived from the plan path **then** the scope defaults to `_global`.
4. **When** the diagnosis category is `MISSING_CONTEXT` **then** the extracted heuristic's `pattern` describes the context that should be included in future packets for similar tasks, and `anti-pattern` describes the assumption that failed.
5. **When** the diagnosis category is `AMBIGUOUS_SPEC` **then** the extracted heuristic's `pattern` names the language clarification needed, and `anti-pattern` quotes the ambiguous spec phrase.
6. **When** the diagnosis category is `CONSTRAINT_CONFLICT` **then** the extracted heuristic's `pattern` states the constraint ordering or precedence rule, and `anti-pattern` describes the conflict that triggered the failure.
7. **When** the diagnosis category is `NOVEL_PROBLEM` **then** the extracted heuristic's `pattern` names the new pattern or tool introduced, and `anti-pattern` is left empty.
8. **When** the diagnosis category is `TOOL_FAILURE` **then** the extracted heuristic's `pattern` describes the pre-flight check or setup that prevents the failure, and `anti-pattern` describes the tool state that caused the crash.
9. **When** the diagnosis category is `BUDGET_EXHAUSTION` **then** the extracted heuristic's `pattern` describes the task-splitting rule that should have been applied, and `anti-pattern` describes the task-size signal that was missed.
10. **When** Step 6 composes a heuristic **then** the `evidence[]` array contains exactly one entry: `{ source: "recovery", path: "<recovery-record-path>", date: "<today>" }`.
11. **When** Step 6 writes the heuristic **then** it sets `confidence: low` (a single failure is a weak signal; `writeHeuristic` auto-promotes on recurrence).
12. **When** Step 6 calls `writeHeuristic` **then** the helper's append-or-update logic handles duplicate detection automatically (same `id` in the same scope reinforces the existing entry).
13. **When** the `id` is generated **then** it is derived from the diagnosis category and a stable 6-character hash of the root cause text (e.g., `missing-context-a1b2c3`) so that recurrences deterministically collide with prior entries.
14. **When** `writeHeuristic` throws any error **then** Step 6 catches it, logs a single-line warning to stderr (`heuristics: extraction skipped — <error>`), and allows `/adev:recover` to exit normally without propagating the failure.
15. **When** `lib/heuristics.mjs` is absent or fails to import **then** Step 6 logs a warning and is skipped; the recovery workflow completes successfully.
16. **When** Step 6 completes successfully **then** it prints a one-line confirmation: `Heuristic extracted: <id> (scope: <scope>, confidence: low)`.

### Postconditions

- After a successful Step 6, a subsequent `readHeuristics(projectRoot, { module: <scope> })` call returns the newly extracted (or reinforced) entry.
- `/adev:recover` always exits with the same status code regardless of extraction success (Step 6 is non-blocking).
- Recurrences of the same root cause across multiple `/adev:recover` invocations produce the same `id`, triggering the helper's auto-promotion path.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Recovery record path does not exist when Step 6 runs | Warn to stderr, skip extraction, exit normally | — |
| Diagnosis category missing or invalid | Warn to stderr, skip extraction, exit normally | — |
| `writeHeuristic` throws `HEURISTICS_SCHEMA_ERROR` | Warn with original error message, skip, exit normally | — |
| `writeHeuristic` throws any other error | Warn with original error message, skip, exit normally | — |
| `lib/heuristics.mjs` import fails | Warn once, skip Step 6 entirely | — |

## System Constitution Reference

- **Principle 2: Skills are primarily markdown** — Step 6 is documented in `skills/recover/SKILL.md`; the inline Node invocation calls `lib/heuristics.mjs`. If the helper is missing, the skill still completes its primary purpose (recovery diagnosis and resume).
- **Graceful degradation** — failure in extraction never blocks recovery; this matches the existing pattern in `session-capture.sh` and `session-start.sh` where auxiliary persistence never blocks primary workflows.
- **No hook protocol changes** — this spec modifies skill markdown only; no hooks are touched.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| T1 | Add Step 6 "Extract Heuristic" markdown section to `skills/recover/SKILL.md` immediately after Step 5 | small |
| T2 | Define the 6 category-to-template mapping in the Step 6 section (one row per diagnosis category) | small |
| T3 | Document the scope derivation rule (active plan directory → module slug, default `_global`) | small |
| T4 | Document the id generation rule (category + 6-char hash of root cause text) | small |
| T5 | Specify the inline Node invocation pattern for calling `writeHeuristic` from the skill | small |
| T6 | Update `/adev:recover` report output to mention the extracted heuristic id on success | small |
| T7 | Add eval test under `skills/recover/evals/` that exercises all 6 diagnosis categories | medium |
| T8 | Integration test: end-to-end recover with extraction, verify heuristic appears in scope file via `readHeuristics` | medium |
| T9 | Integration test: recurrence of same root cause produces auto-promoted `medium`-confidence entry | small |

## Acceptance Criteria

- [ ] `skills/recover/SKILL.md` has a Step 6 section titled "Extract Heuristic" placed after Step 5
- [ ] Step 6 documents the category-to-template mapping for all 6 diagnosis categories
- [ ] Each category produces a heuristic with a non-empty `pattern` (and non-empty `anti-pattern` except for `NOVEL_PROBLEM`)
- [ ] Scope is derived from the active plan's module directory or defaults to `_global`
- [ ] `id` generation is deterministic: the same root cause text produces the same id across invocations (enabling recurrence detection)
- [ ] Initial `confidence` is always `low`
- [ ] `evidence[]` always references the recovery record path with `source: "recovery"` and today's date
- [ ] Extraction failures never block the recovery workflow (degraded with stderr warning)
- [ ] Step 6 prints a single confirmation line on success
- [ ] Eval test exercises all 6 categories and asserts well-formed heuristic output
- [ ] Integration test verifies end-to-end `writeHeuristic` → `readHeuristics` round trip
- [ ] Integration test verifies recurrence produces auto-promoted `medium` confidence after the 2nd extraction
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
