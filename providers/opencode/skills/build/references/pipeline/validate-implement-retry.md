### Validate→Implement Retry Loop

**Configuration:** Resolve `build.max_retries` from `user-config` files (local `.context-index/user-config` → global `<PLUGIN_ROOT>/user-config` → default `0`). Uses the same `parseUserConfig()` from `lib/persona.mjs` that resolves persona. Default is `0` (disabled — fail-fast behavior). Maximum allowed value is `3`. Values above 3 are clamped to 3 with a warning.

Example `user-config` entry:
```
build.max_retries=2
```

When validate returns FAIL and retry budget remains (`current_retry < max_retries`):

#### 1. Extract Failure Context

Read the validation report written by the validate subagent (at `.context-index/specs/features/<module>/<spec-slug>.validate.md`). Extract:

- Which checks failed (check number, name, severity)
- Specific failure details (file:line references, acceptance criteria IDs, error messages)
- Which checks passed (so the retry doesn't regress them)

Assemble this into a `RETRY_CONTEXT` block:

```
RETRY_CONTEXT:
  retry_cycle: <N> of <max_retries>
  validation_report_path: <path to validation report>
  failed_checks:
    - check: "Check 2: Spec Compliance"
      failures:
        - criterion: "AC-3: Error messages include request ID"
          detail: "src/api/handler.mjs:45 — error response missing requestId field"
    - check: "Check 4: Constitution Compliance"
      failures:
        - principle: "Coding Standards — naming conventions"
          detail: "src/lib/helper.mjs:12 — function 'processData' uses camelCase but constitution requires snake_case for this module"
  passed_checks: [1, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13]
```

#### 2. Re-dispatch Implement (scoped)

Dispatch a new implement subagent with the standard context packet plus the `RETRY_CONTEXT`. The subagent prompt includes an additional directive:

```
IMPORTANT: This is a retry cycle. The previous implementation passed quality
gates but failed validation on specific checks. Your task is to fix ONLY the
validation failures listed in RETRY_CONTEXT. Do NOT re-implement the entire
plan. Do NOT modify code that passed validation. Scope your changes to the
minimum required to address each failed check.

After fixing, invoke `/adev:implement --task <N>` for each affected task,
or make targeted fixes and run the quality gates to verify no regressions.
```

The implement skill's internal logic handles the scoped re-implementation. The retry subagent gets the full implement SKILL.md via the Skill tool, so it follows all protocols (TDD, review, source manifest update).

#### 3. Re-dispatch Validate

After the implement retry subagent returns COMPLETED, dispatch a fresh validate subagent with the standard context packet plus:

```
RETRY_CONTEXT:
  retry_cycle: <N> of <max_retries>
  previous_failures: <list of checks that failed last cycle>
  expect_regression_check: true
```

The validate subagent runs the full 13-check suite. It does not skip previously-passed checks — regression detection requires a full run.

#### 4. Evaluate and Loop or Stop

- **PASS or PASS_WITH_WARNINGS:** Retry succeeded. Record in build state with `retry_cycles: N`.
- **FAIL with same failures:** No progress. Stop retrying regardless of budget. Record FAIL with note: "Retry cycle <N> made no progress — same checks still failing."
- **FAIL with different failures:** Progress was made but new issues appeared. If budget remains, loop back to step 1. If budget exhausted, record FAIL with full details.
- **FAIL with regression:** A previously-passing check now fails. Stop retrying immediately. Record FAIL with note: "Retry cycle <N> caused regression in Check <X>."

#### Build State for Retries

Retry cycles are recorded in build state under the validate step:

```json
{
  "name": "validate",
  "status": "completed",
  "timestamp": "...",
  "verdict": "PASS",
  "retry_cycles": 2,
  "retry_history": [
    { "cycle": 1, "verdict": "FAIL", "failed_checks": [2, 4] },
    { "cycle": 2, "verdict": "PASS" }
  ]
}
```

---
