# Scenario E: Quality-gate security hardening

## Skill
`adev:validate` (load + run phases)

## Target Project
`fixture` with negative variants swapped into `governance/validate.yaml` one at a time.

## Prompt
Repeatedly attempt `/adev:validate`. Each run uses one of:
- `.context-index/negative/shell-gate.yaml` — `command` is a string (shell form)
- `.context-index/negative/interpolation-gate.yaml` — argv contains `{{ spec.slug }}`
- `.context-index/negative/project-deterministic.yaml` — project tries to register `kind: deterministic-check`

## Expected Behavior
Each variant fails load with a specific error code:

| Variant | Error code |
|---|---|
| shell-gate | `QUALITY_GATE_COMMAND_SHELL` |
| interpolation-gate | `QUALITY_GATE_INTERPOLATION` |
| project-deterministic | `DETERMINISTIC_PROJECT` |

The happy-path fixture with `project.npm-test` (argv form, explicit profile, no interpolation) runs to PASS via `execFile` with:
- `shell: false`
- env scoped to profile-declared keys + minimal startup whitelist
- stdout/stderr redacted before display (values shorter than 8 chars excluded from redaction)

## Success Criteria
- Each negative variant surfaces its expected error code and does NOT spawn a subprocess.
- The happy-path gate spawns, exits 0, and shows redacted stdout in the report.
- `LD_PRELOAD`/`NODE_OPTIONS` from the invoking shell do not leak into the subprocess env.
