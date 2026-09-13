## Per-Check Event Emission

For every surviving check (1, 1.5, 1.6, 2, 4, 8, 9, 11) that produces a verdict, emit a `validator_report` event to the lifecycle log via `adev report --type validator`. This makes the projection's `state.steps.validate` the canonical source of validator outcomes and removes the need to parse the prior `<spec-slug>.validate.md` file when computing aggregate verdict.

```bash
adev report --type validator \
  --spec "<spec-path>" \
  --step validate \
  --validator "validate.check-2-spec-compliance" \
  --verdict PASS \
  [--error "<short summary>"] \
  [--score <number>] \
  [--duration-ms <number>] \
  [--notes "<≤200-char summary>"]
```

Run one invocation per surviving check (1, 1.5, 1.6, 2, 4, 8, 9, 11). `--validator` is a stable identifier that MUST match the `id:` declared in `governance/validate.yaml` (or the domain starter at `templates/domains/<domain>/validate.yaml`). The registry-backed IDs in the bundled software domain are: `validate.check-1-quality-gates`, `validate.check-1.5-source-manifest`, `validate.check-2-spec-compliance`, `validate.check-4-constitution`, `validate.check-8-boundaries`, `validate.check-9-transition-gates`, `validate.check-11-visual-verification`. Use these exact strings — emitting an unprefixed form (e.g., `check-2-spec-compliance`) bypasses `_resolveActorSeverity` lookup and defaults every event to `severity: warning`, suppressing blocker-severity FAILs in the aggregation table.

Check 1's emission additionally carries `--gate-outcomes` and `--manifest-sha` (see Check 1 § Per-Gate Outcome Attestation). **No other check may pass `--gate-outcomes`** — Check 1 is the only sanctioned writer of `gate_outcomes`.

Check 1.6 (code-drift, observational) still has no registry entry — an event emitted with `--validator validate.check-1.6-code-drift` trips the unknown-validator fallback and is stamped `severity: warning`. That is acceptable because the check is advisory and never aggregates into a blocker-severity verdict; if that changes, add an explicit entry to `templates/domains/<domain>/validate.yaml` and to the project's `governance/validate.yaml`.

`--verdict` is one of `PASS`, `PASS_WITH_NOTES`, `FAIL`. Optional fields (`--error`, `--score`, `--duration-ms`, `--notes`) are passed through verbatim to the underlying `reportValidator(projectRoot, specPath, args)` call in `lib/lifecycle-state.mjs`.

Severity is stamped at write time by the lib from `validate.yaml` (each check's `severity:` field, per the single-source model in `validate-config-single-source.spec.md`). Neither the skill prose nor the CLI invocation computes or asserts severity (cross-reference `lifecycle-event-log.spec.md § Severity-resolution helper`).

When aggregating the overall validation verdict, read `state.steps.validate` from `currentState(projectRoot, specPath)` after all `adev report --type validator` invocations have landed. Do NOT re-read or re-parse any prior `<spec-slug>.validate.md` file.

`--notes` and `--error` arguments MUST NOT include API keys, tokens, file contents, or stack traces beyond the immediate error message. The lib caps at 4 KB and truncates with a `NOTES_TRUNCATED` warning; keep operator-facing summaries ≤ 200 characters.

> Authority: `lib/cli/report.mjs` is the canonical implementation per `.context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md` PR 2 (Task 2). Do not re-introduce inline `reportValidator` Node imports here — `tests/skills-no-inline-node.test.mjs` and `hooks/pre-commit-no-inline-node.sh` reject inline-Node patterns.
