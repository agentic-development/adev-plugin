# Scenario B: Install and run /adev:validate with project overlay

## Skill
`adev:validate`

## Target Project
`tests/evals/configurable-governance/fixture`

## Prompt
Run `/adev:validate --spec .context-index/specs/features/billing/invoice-generation.md`. Honor `governance/validate.yaml` (disables `check-10-platform-drift`, adds `project.npm-test` quality-gate, adds `project.billing-domain-rules` after `check-2-spec-compliance`, adds `project.adoption-metric` observational).

## Expected Behavior
- Loader emits 15 entries (12 bundled + 3 project) including the disabled entry, which is reported as `SKIPPED-DISABLED`.
- `project.billing-domain-rules` appears after `validate.check-2-spec-compliance` in the executed order (topological sort).
- `project.npm-test` runs via argv-form `execFile` (no shell) with env from `project-gate-profile` (only `API_TOKEN` + `DEBUG_FLAG` plus minimal startup whitelist).
- Quality-gate stdout/stderr flows through the profile's redactor; `API_TOKEN` is replaced with `<REDACTED:API_TOKEN>` in the report.
- `project.adoption-metric` runs but never affects the verdict (observational).

## Success Criteria
- Report includes `SKIPPED-DISABLED` line for `check-10-platform-drift`.
- Report shows `project.npm-test` with argv, profile, and redacted stdout.
- Verdict is unaffected by the observational check.
