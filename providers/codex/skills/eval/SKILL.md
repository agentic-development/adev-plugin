---
name: adev:eval
description: "Configure and run a graduated evaluation harness scoring agent output quality across four layers. In Codex, invoke with $adev:eval"
---

# Graduated Evaluation Harness

Score implementation quality across four evaluation layers (0-100).

**Announce:** "I'm using the adev:eval skill to run the evaluation harness."

## Arguments

- `--spec <path>`: evaluate specific spec (required)
- `--layer <N>`: run only specific layer (1-4)
- `--configure`: interactive eval setup
- `--rubric <path>`: custom Layer 3 rubric

## Prerequisites

1. Context Index initialized
2. `$adev:validate` should have passed
3. Golden samples exist for Layer 2
4. Eval config at `.context-index/evals/config.yaml` (from `--configure`)

## Layer 1: Deterministic Checks (Automated)

Run quality gates from `governance/gates.yaml` or constitution.

- Each gate: pass/fail
- Score = (passed / total) * 25
- Max: 25 points

## Layer 2: Architectural Conformance (Automated)

Compare against samples and constitutional patterns:

1. **Pattern consistency (0-10):** Naming, structure, error handling
2. **Boundary compliance (0-5):** Run `boundaries.yaml`
3. **Complexity metrics (0-5):** File sizes, function lengths
4. **Test quality (0-5):** Tests verify behavior, cover errors

Score = sum (0-25)

## Layer 3: LLM-as-a-Judge (AI-Assessed)

Dispatch reviewer subagent with rubric:

1. **Readability (0-5):** Clear names, understandable flow
2. **Maintainability (0-5):** Easy to modify, concerns separated
3. **Spec fidelity (0-5):** Captures spec spirit, handles edge cases
4. **Idiomatic usage (0-5):** Framework and language idioms
5. **Error handling (0-5):** Right level, useful messages

Score = sum (0-25)

## Layer 4: Human-in-the-Loop (Manual)

Surface requiring human judgment:

1. Business logic correctness
2. UX review (if UI changes)
3. Security review (for auth/data/API)
4. Performance impact

User rates: PASS (5), ACCEPTABLE (3), NEEDS_WORK (0)

Score = (sum / max) * 25

## Scoring

**Total = Layer 1 + Layer 2 + Layer 3 + Layer 4 (0-100)**

| Score | Grade | Interpretation |
|-------|-------|---------------|
| 90-100 | A | Excellent |
| 75-89 | B | Good |
| 60-74 | C | Acceptable |
| 40-59 | D | Below standard |
| 0-39 | F | Failing |

## Report Format

```markdown
# Evaluation Report: <Spec>

> **Date:** YYYY-MM-DD
> **Overall Score:** N/100 (Grade: A-F)

## Layer 1: Deterministic — N/25
- Tests: PASS/FAIL
- Lint: PASS/FAIL
- Typecheck: PASS/FAIL

## Layer 2: Architectural — N/25
- Pattern consistency: N/10
- Boundary compliance: N/5
- Complexity: N/5
- Test quality: N/5

## Layer 3: LLM-as-a-Judge — N/25
- Readability: N/5
- Maintainability: N/5
- Spec fidelity: N/5
- Idiomatic: N/5
- Error handling: N/5

## Layer 4: HITL — N/25
- Business logic: PASS/ACCEPTABLE/NEEDS_WORK
- UX: PASS/ACCEPTABLE/NEEDS_WORK/SKIPPED
- Security: PASS/ACCEPTABLE/NEEDS_WORK/SKIPPED
```

## Configuration

Interactive setup creates `.context-index/evals/config.yaml`:

```yaml
layers:
  deterministic: true
  architectural: true
  llm_judge: true
  hitl: false  # opt-in

thresholds:
  minimum_score: 60
  exemplary_score: 90
```

## Integration

- `$adev:validate` is prerequisite (pass/fail gate)
- `$adev:retro` reads scores for trends
- `$adev:sample` candidates from A-grade evals
- `$adev:hygiene` includes eval trends
