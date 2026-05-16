# Live Spec: Hygiene Integration

---
charter: adev:codehealth
status: validated
risk_level: low
milestone:
revision: 1
charter-revision: 1
created: 2026-04-02
updated: 2026-04-02
source-manifest:
  sha: "51b3622"
  files:
    - skills/hygiene/SKILL.md
    - skills/codehealth/SKILL.md
  computed-at: "2025-04-25T00:00:00.000Z"
drift_detected: true
drift_source: skills/hygiene/SKILL.md
drift_at: 2026-05-16T00:16:38.187Z
---

## Behavioral Contract

### Preconditions

- `/adev:hygiene` skill exists with its current 12-pass audit structure
- `/adev:codehealth` skill is implemented and functional as a standalone skill

### Behaviors

1. **When** `/adev:hygiene` runs a full audit **then** it includes an additional pass (Pass 13: Code Health) that dispatches `/adev:codehealth` as a sub-skill invocation.

2. **When** Pass 13 executes **then** it checks if repomap artifacts exist before invoking `/adev:codehealth`. If they exist, it runs `/adev:codehealth` with no filters (full scan). If they don't, Pass 13 outputs SKIP with note: "Repomap artifacts not found — run `/adev:repomap` first." Note: this pre-check at the hygiene level prevents `/adev:codehealth` from being invoked and emitting its own MISSING_REPOMAP error. The precondition check in the preconditions spec applies only to standalone invocations.

3. **When** `/adev:codehealth` produces findings during a hygiene run **then** the hygiene drift report includes a Code Health section summarizing finding counts by severity, with an action item: "Review full report at `.context-index/reports/codehealth-<date>.md`."

4. **When** `/adev:codehealth` produces zero findings during a hygiene run **then** the Code Health pass shows PASS in the hygiene summary table. **When** findings exist but all are low severity **then** WARN. **When** any medium or high severity findings exist **then** FAIL.

5. **When** `/adev:hygiene` is invoked with `--check code-health` **then** only the Code Health pass runs (consistent with how other passes are selectable).

6. **When** `/adev:codehealth` is invoked standalone (not via hygiene) **then** it behaves identically — the hygiene integration adds no special behavior to the codehealth skill itself.

### Postconditions

- `/adev:hygiene` drift report includes Code Health pass status (PASS/WARN/FAIL/SKIP) in its summary table
- The codehealth report at `.context-index/reports/` is written regardless of whether invocation was standalone or via hygiene
- Hygiene's existing 12 passes are unaffected by the addition

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `/adev:codehealth` errors during hygiene run | Pass 13 shows FAIL in summary, hygiene continues with remaining passes | CODEHEALTH_ERROR |
| Repomap artifacts missing during hygiene run | Pass 13 shows SKIP, no error propagated to other passes | SKIP_NO_REPOMAP |

## System Constitution Reference

- **Principle 2:** "Skills are primarily markdown" — The integration is implemented as additional instructions in `/adev:hygiene`'s SKILL.md, not as executable code coupling the two skills.
- **Architecture Boundary:** "Adding new skills to the lifecycle order" requires human approval — this integration adds a pass within an existing skill, not a new lifecycle gate. The user approved this in the charter brainstorm.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Add Pass 13 to hygiene SKILL.md | Insert Code Health pass instructions after existing Pass 12 | small |
| Add `code-health` to `--check` options | Update the `--check` argument documentation in hygiene SKILL.md | small |
| Update hygiene summary table | Add Code Health row to the drift report summary | small |

## Acceptance Criteria

- [ ] `/adev:hygiene` full audit includes Code Health as Pass 13
- [ ] Pass 13 skips gracefully when repomap artifacts are missing
- [ ] Pass 13 shows PASS/WARN/FAIL/SKIP in the hygiene summary table
- [ ] `--check code-health` runs only the Code Health pass
- [ ] Codehealth report is written to `.context-index/reports/` during hygiene runs
- [ ] Existing 12 hygiene passes are unaffected
- [ ] Standalone `/adev:codehealth` invocation is unchanged
- [ ] All quality gates pass (tests)
- [ ] No constitutional violations introduced
