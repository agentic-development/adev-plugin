# Live Spec: Contradiction Tracking

<!-- Live Spec within the heuristics charter.
     Defines when and how the contradicted-by field is populated during the
     adev lifecycle. The addContradiction API already exists in lib/heuristics.mjs
     (Phase 1a); this spec defines the lifecycle events that trigger it:
     validation failures that contradict success heuristics, and recovery
     diagnoses that contradict failure heuristics.
     Parent Charter: .context-index/specs/features/heuristics/charter.md -->

---
charter: heuristics
status: validated
risk_level: medium
milestone: 1
revision: 2
charter-revision: 3
created: 2026-04-12
updated: 2026-04-12
---

## Behavioral Contract

### Preconditions

- `lib/heuristics.mjs` is importable with `addContradiction`, `readHeuristics`, and `archiveHeuristic` available
- `/adev:validate` SKILL.md has Check 12 (success heuristic extraction, Phase 1a)
- `/adev:recover` SKILL.md has Step 7 (failure heuristic extraction, Phase 1a)
- `.context-index/memory/heuristics/` contains at least one heuristic file

### Behaviors

**Validation PASS contradicts an existing heuristic:**

1. **When** `/adev:validate` produces a PASS result for a spec **and** an existing heuristic in the spec's module scope has a `pattern` that directly conflicts with the new success heuristic's `antiPattern`, or an `antiPattern` that conflicts with the new heuristic's `pattern` **then** Check 12 calls `addContradiction(projectRoot, heuristicId, { path: '<validation-report-path>', date: '<today>', source: 'validation' })` after extracting the new heuristic.

2. **When** `addContradiction` is called and the heuristic's `contradicted-by[]` length reaches 2 **then** the heuristic is automatically archived with reason `"contradicted"` per the store-and-helper spec invariants. No additional action is needed from this spec.

**Recovery contradicts an existing heuristic:**

3. **When** `/adev:recover` diagnoses a root cause **and** an existing heuristic in the recovery's module scope has a `pattern` that directly conflicts with the new heuristic's `antiPattern`, or an `antiPattern` that conflicts with the new heuristic's `pattern` **then** Step 7 calls `addContradiction(projectRoot, heuristicId, { path: '<recovery-record-path>', date: '<today>', source: 'recovery' })` before extracting the new heuristic.

**Contradiction detection heuristic (skill-level, not programmatic):**

4. **When** an extraction step (Check 12 or Step 7) is about to write a new heuristic **then** it first reads existing heuristics for the target scope and scans for semantic contradictions: a new `pattern` that directly conflicts with an existing entry's `antiPattern`, or a new `antiPattern` that conflicts with an existing entry's `pattern`. This is a best-effort semantic check performed by the agent, not a programmatic string comparison.

5. **When** a contradiction is detected **then** the extraction step calls `addContradiction` on the existing entry before writing the new heuristic. Both operations (contradiction + new write) execute in sequence — contradiction first, then write.

6. **When** no contradiction is detected **then** the extraction step writes the new heuristic without calling `addContradiction`.

**Non-blocking semantics:**

7. **When** `addContradiction` throws (e.g., `HEURISTICS_NOT_FOUND` because the entry was archived between read and write) **then** the calling skill catches the error, logs a warning, and proceeds. Contradiction tracking failures never block extraction or the parent workflow.

### Postconditions

- Contradicted heuristics have their `contradicted-by[]` array updated with the contradicting evidence
- Heuristics with 2+ contradictions are archived with reason `"contradicted"`
- New heuristics are written after any contradiction is recorded on existing entries
- Contradiction detection may update `contradicted-by[]`, drop confidence, or archive an entry — all per `addContradiction` invariants in store-and-helper. No other fields are modified.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `addContradiction` throws `HEURISTICS_NOT_FOUND` | Log warning, proceed without recording contradiction | — |
| `addContradiction` throws `HEURISTICS_ARCHIVE_CONFLICT` | Log warning, proceed — entry was already archived | — |
| `readHeuristics` for contradiction scan throws | Log warning, skip contradiction detection, proceed with extraction | — |
| Agent fails to detect a semantic contradiction | Acceptable — contradiction detection is best-effort. Retro consolidation is the backstop. | — |

## System Constitution Reference

- **Principle 2: Skills are primarily markdown** — Contradiction detection logic is documented as SKILL.md instructions within the existing extraction steps. The agent performs semantic comparison; no new companion code is required.
- **Quality: Degradation** — Contradiction tracking failures never block extraction or parent workflows.
- **Quality: Safety** — Heuristics are inert markdown. Contradiction tracking modifies only the `contradicted-by` field and confidence level via the existing atomic write API.
- **Quality: Transparency** — Every contradiction records its source evidence, enabling humans to trace why a heuristic was demoted or archived.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| T1 | Add contradiction scan instruction to `/adev:validate` Check 12 in SKILL.md (read existing heuristics, compare semantically, call `addContradiction` if conflict found) | small |
| T2 | Add contradiction scan instruction to `/adev:recover` Step 7 in SKILL.md (same pattern) | small |
| T3 | Document the ordering rule: contradiction first, then new heuristic write | small |
| T4 | Eval test: validation PASS contradicts existing failure heuristic → contradiction recorded | medium |
| T5 | Eval test: recovery contradicts existing success heuristic → contradiction recorded | medium |
| T6 | Eval test: no contradiction detected → extraction proceeds without addContradiction call | small |
| T7 | Eval test: addContradiction throws → extraction proceeds with warning | small |

## Acceptance Criteria

- [ ] `/adev:validate` Check 12 scans existing heuristics for contradictions before writing
- [ ] `/adev:recover` Step 7 scans existing heuristics for contradictions before writing
- [ ] Detected contradictions are recorded via `addContradiction` before new heuristic is written
- [ ] Contradiction detection is best-effort semantic comparison, not programmatic string matching
- [ ] `addContradiction` failures are caught and logged, never blocking extraction
- [ ] The contradiction → auto-demotion → auto-archive chain (from store-and-helper invariants) is exercised end-to-end
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
