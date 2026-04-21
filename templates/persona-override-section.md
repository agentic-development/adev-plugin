## Persona Override

| Argument | Required | Description |
|----------|----------|-------------|
| `--persona <name>` | No | Override the session-start persona for this invocation only. Valid values: `product`, `developer`, `architect`. |

If `--persona` is provided in the skill's argument text:

1. Validate the name against available templates in `templates/personas/` (reject path separators and names not matching an existing template file).
2. If valid, read the matching persona directive template (`templates/personas/<name>.md`) and apply its output rules for this invocation, overriding the session-start default.
3. If invalid (unknown name, empty value, or path traversal attempt), show a warning to the user and keep the session-start persona active — do not override.

This argument affects only the **presentation** of outputs (verbosity, code references, next actions, spec citations, review verdicts, test results, error details). It does not change internal processing, gates, reviews, or validation logic.
