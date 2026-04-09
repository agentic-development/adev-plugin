# Live Spec: Recover Extraction

<!-- Live Spec within the heuristics charter.
     Phase 1a: add Step 6 (Extract Heuristic) to /adev:recover SKILL.md,
     consuming the lib/heuristics.mjs API defined in store-and-helper.md.
     Does NOT modify the helper API — only consumes it.
     Parent Charter: .context-index/specs/features/heuristics/charter.md -->

---
charter: heuristics
status: review-passed
risk_level: low
milestone: 1a
revision: 2
charter-revision: 3
created: 2026-04-09
updated: 2026-04-09
---

## Behavioral Contract

### Preconditions

- `/adev:recover` has successfully completed Step 5 (Write Recovery Record) for a stuck task
- The root cause diagnosis exists with exactly one of the six category labels: `MISSING_CONTEXT`, `AMBIGUOUS_SPEC`, `CONSTRAINT_CONFLICT`, `NOVEL_PROBLEM`, `TOOL_FAILURE`, `BUDGET_EXHAUSTION`
- `lib/heuristics.mjs` is available (if missing, the step degrades to a warning)
- `projectRoot` is resolvable from the skill execution context (derived from `process.cwd()` by walking up to find the nearest `.context-index/` directory; falls back to `process.env.CLAUDE_PROJECT_ROOT` if set)

### Scope Derivation Rule

The scope is derived from the active plan file path using this algorithm:

1. Read the active plan path from `.context-index/hygiene/.active-plan` or from the recover invocation's `--task` argument
2. Split the path on `/` and find the segment immediately after `features/`
3. Apply `path.basename()` to that segment to strip any traversal sequences
4. Check the result against `manifest.yaml` `modules[].slug` (reading modules list via yaml parse)
5. If the normalized segment matches a known module slug, use it as `scope`
6. Otherwise, fall back to `_global`

### Title Derivation Rule

The heuristic `title` is composed as `"<category-label>: <short-summary>"` where:
- `<category-label>` is one of: `"Missing context"`, `"Ambiguous spec"`, `"Constraint conflict"`, `"Novel problem"`, `"Tool failure"`, `"Budget exhaustion"`
- `<short-summary>` is a distilled 5-10 word summary of the root cause (not a verbatim quote — agents must generalize)
- Total title length must not exceed 120 characters (matches `writeHeuristic` schema cap)

### ID Derivation Rule

The `id` is composed as `<category-slug>-<hash>` where:
- `<category-slug>` is the lowercased diagnosis category with underscores replaced by hyphens (e.g., `missing-context`, `tool-failure`)
- `<hash>` is the first 8 characters of the lowercase hex SHA-256 of the normalized root cause text
- Normalization: lowercase, collapse consecutive whitespace to single spaces, strip leading/trailing whitespace, strip punctuation except `-` and `_`. This normalization makes recurrence detection robust against minor rewording.
- The resulting id must match the safe-slug pattern `/^[_a-z0-9][_a-z0-9-]{0,63}$/` (guaranteed by construction since category slugs and hex characters are both safe-slug compliant)

### Behaviors

1. **When** Step 5 has written a recovery record **then** Step 6 runs automatically before `/adev:recover` exits.
2. **When** Step 6 runs **then** it derives `scope` per the Scope Derivation Rule above.
3. **When** Step 6 composes a heuristic **then** it derives `title` per the Title Derivation Rule above.
4. **When** Step 6 composes a heuristic **then** it derives `id` per the ID Derivation Rule above.
5. **When** the diagnosis category is `MISSING_CONTEXT` **then** the extracted heuristic's `pattern` describes the context that should be included in future packets for similar tasks, and `antiPattern` describes the assumption that failed (distilled, not quoted verbatim).
6. **When** the diagnosis category is `AMBIGUOUS_SPEC` **then** `pattern` names the language clarification needed, and `antiPattern` paraphrases the ambiguous spec phrase — never quotes it verbatim (avoids accidentally capturing credentials or environment-specific strings embedded in spec examples).
7. **When** the diagnosis category is `CONSTRAINT_CONFLICT` **then** `pattern` states the constraint ordering or precedence rule, and `antiPattern` describes the conflict that triggered the failure.
8. **When** the diagnosis category is `NOVEL_PROBLEM` **then** `pattern` names the new pattern or tool introduced, and `antiPattern` is left empty.
9. **When** the diagnosis category is `TOOL_FAILURE` **then** `pattern` describes the pre-flight check or setup that prevents the failure, and `antiPattern` describes the tool state that caused the crash.
10. **When** the diagnosis category is `BUDGET_EXHAUSTION` **then** `pattern` describes the task-splitting rule that should have been applied, and `antiPattern` describes the task-size signal that was missed.
11. **When** Step 6 composes a heuristic **then** the `evidence[]` array contains exactly one entry: `{ source: "recovery", path: "<recovery-record-path>", date: "<today>" }`. Since `writeHeuristic` dedups on `(path, date)` (not `source`), a re-extraction from the same recovery record on the same day is idempotent.
12. **When** Step 6 writes the heuristic **then** it passes `confidence: low` as the caller-supplied initial value (a single failure is a weak signal; the helper's absolute-threshold auto-promotion handles recurrence — see store-and-helper Behaviors 11-12).
13. **When** Step 6 calls `writeHeuristic` **then** deduplication is keyed on `id`: the deterministic id formula in the ID Derivation Rule ensures that two recurrences of the same normalized root cause produce the same id, triggering the helper's append-or-update path and eventual auto-promotion.
14. **When** `writeHeuristic` throws any error **then** Step 6 catches it, logs a single-line warning to stderr (`heuristics: extraction skipped — <error-message>`), and allows `/adev:recover` to exit normally without propagating the failure.
15. **When** `lib/heuristics.mjs` is absent or fails to import **then** Step 6 logs a warning (`heuristics: helper unavailable, extraction skipped`) and is skipped; the recovery workflow completes successfully.
16. **When** Step 6 completes successfully **then** it prints a one-line confirmation: `Heuristic extracted: <id> (scope: <scope>, confidence: low)`.

### Postconditions

- After a successful Step 6, a subsequent `readHeuristics(projectRoot, { module: <scope> })` call returns the newly extracted (or reinforced) entry.
- `/adev:recover` always exits with the same status code regardless of extraction success (Step 6 is non-blocking).
- Recurrences of the same normalized root cause across multiple `/adev:recover` invocations produce the same `id`, triggering the helper's auto-promotion path from `low` → `medium` at the 2nd distinct-path evidence entry and → `high` at the 3rd.
- No raw content from recovery records (verbatim quotes, credentials, environment-specific strings) appears in the extracted heuristic's fields.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Recovery record path does not exist when Step 6 runs | Warn to stderr, skip extraction, exit normally | — |
| Diagnosis category missing or invalid | Warn to stderr, skip extraction, exit normally | — |
| Scope derivation produces a value that fails manifest lookup AND cannot fall back to `_global` (should not happen per rule) | Warn to stderr, skip extraction, exit normally | — |
| `writeHeuristic` throws `HEURISTICS_SCHEMA_ERROR` (including title-too-long, invalid scope/id from a bug in derivation) | Warn with original error message, skip, exit normally | — |
| `writeHeuristic` throws any other error | Warn with original error message, skip, exit normally | — |
| `lib/heuristics.mjs` import fails | Warn once, skip Step 6 entirely | — |

## System Constitution Reference

- **Principle 2: Skills are primarily markdown** — Step 6 is documented in `skills/recover/SKILL.md`; the inline Node invocation calls `lib/heuristics.mjs`. If the helper is missing, the skill still completes its primary purpose (recovery diagnosis and resume).
- **Graceful degradation** — failure in extraction never blocks recovery; this matches the existing pattern in `session-capture.sh` and `session-start.sh` where auxiliary persistence never blocks primary workflows.
- **No hook protocol changes** — this spec modifies skill markdown only; no hooks are touched.
- **Data safety** — distillation (not verbatim quotation) of source material protects against accidentally capturing secrets in git-tracked heuristic files.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| T1 | Add Step 6 "Extract Heuristic" markdown section to `skills/recover/SKILL.md` immediately after Step 5 | small |
| T2 | Document the 6 category-to-(pattern, antiPattern) mapping in the Step 6 section, with explicit "distill, do not quote" guidance | small |
| T3 | Document the Scope Derivation Rule (plan path → `features/<slug>` segment → `manifest.yaml` validation → `_global` fallback) | small |
| T4 | Document the Title Derivation Rule (category label + short summary, ≤120 chars) | small |
| T5 | Document the ID Derivation Rule (category slug + 8-char hex SHA-256 of normalized root-cause text) | small |
| T6 | Document `projectRoot` resolution for the inline Node invocation (walk up from cwd to find `.context-index/`; fallback to `CLAUDE_PROJECT_ROOT` env) | small |
| T7 | Specify the inline Node invocation pattern for calling `writeHeuristic` from the skill, including the try/catch degradation path | small |
| T8 | Update `/adev:recover` final report output to mention the extracted heuristic id on success | small |
| T9 | Add eval test under `skills/recover/evals/` exercising all 6 diagnosis categories | medium |
| T10 | Integration test: end-to-end recover with extraction, verify heuristic appears in scope file via `readHeuristics` | medium |
| T11 | Integration test: recurrence of same normalized root cause produces auto-promoted `medium`-confidence entry after the 2nd extraction | small |
| T12 | Integration test: verbatim quote of a credential-containing spec phrase is NOT captured (verifies the distillation discipline) | small |

## Acceptance Criteria

- [ ] `skills/recover/SKILL.md` has a Step 6 section titled "Extract Heuristic" placed after Step 5
- [ ] Step 6 documents the category-to-(pattern, antiPattern) mapping for all 6 diagnosis categories with explicit "distill, do not quote" guidance
- [ ] Step 6 documents the Scope Derivation Rule including `manifest.yaml` `modules[].slug` validation and `_global` fallback
- [ ] Step 6 documents the Title Derivation Rule (category label + short summary, ≤120 chars)
- [ ] Step 6 documents the ID Derivation Rule using a normalized-text 8-char SHA-256 hex hash prefixed by the category slug
- [ ] Step 6 documents `projectRoot` resolution (walk up from cwd, fallback to `CLAUDE_PROJECT_ROOT` env)
- [ ] Each category produces a heuristic with a non-empty `pattern` (and non-empty `antiPattern` except for `NOVEL_PROBLEM`)
- [ ] Initial `confidence` is always `low` (caller-supplied; helper's absolute-threshold auto-promotion handles recurrence)
- [ ] `evidence[]` always references the recovery record path with `source: "recovery"` and today's date
- [ ] No verbatim source-document content appears in any heuristic field (verified by dedicated integration test)
- [ ] Extraction failures never block the recovery workflow (degraded with stderr warning)
- [ ] Step 6 prints a single confirmation line on success
- [ ] Eval test exercises all 6 categories and asserts well-formed heuristic output
- [ ] Integration test verifies end-to-end `writeHeuristic` → `readHeuristics` round trip
- [ ] Integration test verifies recurrence produces auto-promoted `medium` confidence after the 2nd extraction with distinct source paths
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
