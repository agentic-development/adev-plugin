### Step 1.5: Infrastructure Preflight

After loading context, check whether the spec or plan declares `infra_requirements`. If so, run the infrastructure preflight.

**`--no-infra` resolution:** Read `--no-infra` flag from arguments. If not passed, check `ADEV_NO_INFRA` env var (only exact value `1` activates bypass). Read once at skill entry, convert to `options.noInfra`. The agent must never set `--no-infra` or `ADEV_NO_INFRA` autonomously — if preflight fails, report the failure and wait for user direction.

**Invocation:** Run the preflight via the CLI:

```bash
adev preflight run --spec <specPath> --plan <planPath> [--timeout N] [--no-infra]
```

Where `<specPath>` is extracted from the plan's `Spec:` header and `<planPath>` is the `<plan-path>` argument. Stdout is a single JSON object — the preflight report. Exit codes: 0 on PASS or skipped, 2 on FAIL, 1 on argument errors.

Parse the JSON output. If `report.passed === false`, display the formatted report and block:

```
Infrastructure Preflight: FAILED

<formatted report output>

Execution blocked. Options:
  1. Fix the issues above and retry
  2. Re-run with --no-infra to bypass (user decision only)
  3. Use --task N to run only tasks that don't need this infrastructure
```

Option 3 is shown only when the plan has mixed strategies (some unit, some non-unit). Omit it when all tasks require the failed infrastructure.

If `report.passed === true` and `report.skipped === true`, emit: "Infrastructure preflight skipped (--no-infra)."

If `report.passed === true` and `report.skipped === false`, proceed silently.

If `lib/infra-preflight.mjs` fails to import, block with: "Infrastructure preflight library could not be loaded: <error>. Fix the library before proceeding."

If `runPreflight()` throws `PREFLIGHT_FILE_NOT_FOUND` or `PREFLIGHT_PARSE_ERROR`, block with the error message.
