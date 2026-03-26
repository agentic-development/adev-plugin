# Live Spec: cross-provider-reporting

## Capability

Generate a deterministic cross-provider rollup comparing the same lifecycle scenarios across Claude Code, Codex, and OpenCode live runs.

## Behavioral Contract

1. **When** live provider runs complete for an eval invocation **then** the reporting layer generates `tests/evals/lifecycle-tokens/reports/CROSS_PROVIDER.md` in addition to the existing provider-scoped scenario reports and `ROLLUP.md`.
2. **When** the cross-provider rollup is generated **then** it compares the same lifecycle scenarios across providers rather than mixing different scenario sets.
3. **When** token data is available for multiple providers on the same scenario **then** the rollup ranks and compares those provider-scenario runs by total lifecycle tokens, using a deterministic secondary sort key of `provider_id`.
4. **When** some providers have partial or missing token data **then** the rollup surfaces explicit unknown-coverage gaps instead of hiding those providers from comparison.
5. **When** a provider-scenario run is `incomplete` or `failed` **then** the report includes its terminal status and reason code in the comparison view.
6. **When** model identifiers are available **then** the report includes them as descriptive metadata, not as a separate comparison dimension in v1.
7. **When** retry overhead or subagent fan-out differs across providers for the same scenario **then** the report highlights those differences explicitly.
8. **When** the rollup identifies likely integration gaps, such as one provider consistently emitting unknown token fields or incomplete runs, **then** it lists them as rule-based findings.
9. **When** provider ids, model ids, status reasons, or rule-based findings are rendered into Markdown **then** those labels are escaped or normalized using the same rendering-safety rules as `scenario-reporting`.
10. **When** some provider rows have unknown total-token values **then** the report places all rows with known totals first, then orders unknown-total rows deterministically by `provider_id`.

## Preconditions

- Live provider runs have completed for at least one scenario
- Normalized provider results and raw event logs exist
- Provider ids and scenario ids are preserved in canonical run data
- The provider-scoped scenario report identity remains `tests/evals/lifecycle-tokens/reports/<run-id>.md`

## Postconditions

- One cross-provider rollup report is written for the invocation
- Provider-scoped scenario reports remain available
- The rollup includes:
  - scenario-by-scenario provider comparison
  - provider totals
  - unknown token coverage summary
  - retry and fan-out comparison sections
  - incomplete and failed run summary
  - integration-gap findings
- `ROLLUP.md` remains the scenario-matrix summary, while `CROSS_PROVIDER.md` owns provider-to-provider comparison for live invocations

## Error Cases

| Condition | Expected Behavior |
|---|---|
| One provider has no completed runs | Report provider coverage gap explicitly |
| Unknown token data prevents exact ranking for some rows | Render partial comparison with unknown markers |
| Provider-scoped report missing | Continue rollup from canonical run data, identify the missing artifact as `tests/evals/lifecycle-tokens/reports/<run-id>.md`, and flag the missing report |
| Cross-provider section cannot compute one metric | Omit only that metric section and surface the reason |
| Provider or model labels contain Markdown-unsafe content | Escape the rendered content and continue |

## Constitution References

- Deterministic reporting over ad hoc interpretation
- Eval-boundary isolation
- Zero-dependency implementation with Node built-ins only

## Actionable Task Map

1. Extend report inputs to include provider dimension
2. Define `CROSS_PROVIDER.md` Markdown template
3. Add unknown-coverage and incomplete-run sections
4. Add rule-based integration-gap detection
5. Add tests for deterministic ties, mixed known and unknown provider data, and escaped labels

## Acceptance Criteria

- One cross-provider rollup is generated per live eval invocation
- The same scenarios are compared across providers
- Known total-token rows sort before unknown-total rows, and ties sort by `provider_id`
- Unknown token coverage is visible
- Incomplete and failed provider runs remain visible
- Retry and fan-out differences are reported across providers
- Integration gaps are surfaced as explicit findings
- Provider and model labels are escaped or normalized before Markdown rendering
