### Check 8: Boundary Compliance

Run the boundary evaluator and record what it returns:

```
adev boundaries check --json
```

Take the `verdict` verbatim — `PASS`, `WARN`, `FAIL` or `SKIP`. Do not recompute it from the findings, and do not run the rule regexes yourself: the algorithm (regex against file contents, `exclude` globs, severity mapping, time and size budgets) lives in the verb.

The envelope carries `verdict`, `reason`, `findings`, `disabled`, `warnings` and `summary`. List every finding with its `ruleId` (the field is `ruleId`, **not** `rule`), its `file:line` and its `matchedLine`; list every `disabled` rule with its `disabled_reason` (a switched-off rule must read differently from one the project never declared); surface the top-level `warnings`, which are registry **schema** warnings such as `DISABLED_WITHOUT_REASON` and are a different thing from `summary.warnings`.

**A project declaring no rules records SKIP, never PASS** — nothing was read, so nothing held; the reason reads `no boundary rules declared`. A registry whose rules are all switched off SKIPs with a different reason naming them, because "nobody declared any" and "somebody turned them off" are different facts. Exit 1 (`INVALID_BOUNDARY_PATTERN`, `BOUNDARIES_PARSE_ERROR`) is a FAIL, not a SKIP: the project believes it has boundaries and the registry is unreadable.

Full body, including the per-finding table: `skills/validate/checks/validate.check-8-boundaries.md`.
