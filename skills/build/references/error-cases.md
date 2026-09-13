## Error Cases

| Condition | Expected Behavior |
|-----------|-------------------|
| `.context-index/` missing | Print "Run `/adev:init` first" and stop |
| `--spec` file not found | Print "Spec not found: `<path>`" and stop |
| `--charter` module directory not found | Print "Module directory not found: `.context-index/specs/features/<module>/`" and stop |
| `--charter` finds no specs in module | Print "No specs found under `.context-index/specs/features/<module>/`" and stop |
| `--milestone` finds no matching specs | Print "No specs found for milestone `<name>`" and stop |
| `--resume` with no build state files | Print "No interrupted build found" and stop |
| Review returns BLOCK | Stop build for that spec, save state, report findings |
| Quality gates fail during implement | Stop build for that spec, save state, report failures |
| Validation returns FAIL (max_retries=0) | Report FAIL but mark build as completed (informational) |
| Validation returns FAIL (max_retries>0) | Enter retry loop: extract failures, re-implement scoped to failures, re-validate. Stop on budget exhaustion, no progress, or regression |
| Retry cycle causes regression | Stop retrying immediately, report regression. Do not exhaust remaining budget |
| Retry cycle makes no progress | Stop retrying, report same failures persisting |
| `build.max_retries` > 3 in user-config | Clamp to 3 with warning |
| `--from <step>` with invalid step name | Print "Invalid step: `<name>`. Valid steps: specify, review, plan, route, implement, validate" and stop |
| Circular dependencies in milestone mode | Print warning, proceed in discovery order |

---
