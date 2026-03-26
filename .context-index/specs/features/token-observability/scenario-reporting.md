# Live Spec: Scenario Reporting

---
charter: token-observability
status: draft
risk_level: medium
milestone: v1
created: 2026-03-25
---

## Behavioral Contract

### Preconditions

- Scenario run has completed with terminal status
- Raw event log exists for that run
- Scenario definition is available to compare declared vs actual path

### Behaviors

1. **When** a scenario run finishes **then** the reporting layer generates a per-scenario-run report from that run's raw events and terminal status.
2. **When** all scenario runs in the matrix finish **then** the reporting layer generates a rollup report across the full invocation.
3. **When** a per-scenario-run report is generated **then** it shows both the declared scenario structure and the realized execution path for that run.
4. **When** a scenario contains retries, re-review loops, recovery branches, or subagent fan-out **then** the report quantifies their token overhead explicitly.
5. **When** the rollup report is generated **then** it ranks scenarios by total lifecycle tokens as the primary ordering.
6. **When** the rollup report is generated **then** it includes explicit sections for phase rankings, retry multipliers, and subagent cost share.
7. **When** the rollup report is generated **then** it also includes derived overhead views for retry or rework cost and subagent fan-out cost.
8. **When** the rollup report is generated **then** it identifies top optimization candidates using deterministic rule-based heuristics derived from measured data.
9. **When** token fields are unknown for parts of a run **then** reports surface those unknowns explicitly rather than hiding them.
10. **When** scenario names, phase names, branch names, or any authored labels are rendered into Markdown **then** they are escaped or normalized so they cannot alter the intended report structure.

### Postconditions

- One Markdown report is written per scenario run at `tests/evals/lifecycle-tokens/reports/<run-id>.md`
- One aggregate Markdown rollup is written after the matrix completes
- Reports preserve explicit unknown-data markers
- Rollup rankings are deterministic for the same input data
- The rollup includes explicit sections for scenario totals, phase rankings, retry multipliers, subagent cost share, and top optimization candidates

### Error Cases

| Condition | Expected Behavior | HTTP Status / Error Code |
|---|---|---|
| Scenario report cannot be written | Mark reporting failure for that scenario and continue rollup if possible | `scenario_report_write_failed` |
| Raw event log missing | Scenario report shows explicit missing-data failure | `raw_event_log_missing` |
| Declared path cannot be reconstructed from scenario definition | Scenario report fails with explicit comparison error | `path_reconstruction_failed` |
| Rollup cannot read one scenario report | Rollup continues from raw run data where possible and flags the missing report | `scenario_report_unreadable` |
| Unknown token fields prevent some aggregate math | Render partial aggregate with explicit unknown markers | `aggregate_unknown_values` |
| Authored labels contain Markdown-unsafe content | Escape the rendered content and continue | `markdown_content_escaped` |

## System Constitution Reference

- **Principle:** "Minimize external dependencies" — Applies because reporting must remain deterministic and use Node.js built-ins only.
- **Principle:** "Skills are primarily markdown" — Applies because reporting is an eval artifact layer, not an embedded skill behavior.
- **Principle:** "Pure ESM" — Applies because reporting modules remain `.mjs`.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|---|---|---|
| Scenario report template | Define the Markdown template for per-scenario-run reports | small |
| Rollup report template | Define the aggregate rollup structure | small |
| Path comparison | Implement declared-vs-actual path comparison | medium |
| Overhead calculations | Compute retry and fan-out overhead | medium |
| Heuristic ranking | Identify top optimization candidates using rule-based rules | medium |
| Rendering safety | Escape or normalize authored labels before Markdown output | small |
| Reporting tests | Cover partial data, unknown token fields, and escaped labels | medium |

## Acceptance Criteria

- [ ] Each finished scenario run produces a Markdown report
- [ ] The full matrix produces a rollup Markdown report
- [ ] Rollup ranks scenarios by total lifecycle tokens
- [ ] Rollup includes explicit phase rankings, retry multipliers, and subagent cost share sections
- [ ] Retry or rework and fan-out overhead sections are present
- [ ] Declared path and realized path are both visible per scenario
- [ ] Unknown token data remains visible in scenario and rollup outputs
- [ ] Authored labels are escaped or normalized before Markdown rendering
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
