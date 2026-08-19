## Step 1a: Infrastructure Preflight

After model tier resolution, check whether the spec declares `infra_requirements`. If so, run the infrastructure preflight before proceeding to strategy resolution.

**Dispatch detection:** If `ADEV_DISPATCHED_BY=implement` is set in the environment, skip the preflight step entirely (implement already verified infrastructure). The agent must not set `ADEV_DISPATCHED_BY=implement` except when dispatching from implement.

**Strategy-aware skip:** If the resolved test strategy is `unit`, skip the preflight step regardless of `infra_requirements`. Unit tests do not exercise external infrastructure.

**`--no-infra` resolution:** Read `--no-infra` flag from arguments. If not passed, check `ADEV_NO_INFRA` env var (only exact value `1` activates bypass). Read once at skill entry, convert to `options.noInfra`. The agent must never set `--no-infra` or `ADEV_NO_INFRA` autonomously — if preflight fails, report the failure and wait for user direction.

**Invocation:** Run the preflight via the CLI:

```bash
adev preflight run --spec <specPath> [--timeout 10] [--no-infra]
```

Stdout is a single JSON object — the preflight report. Exit codes: 0 on PASS or skipped, 2 on FAIL, 1 on argument errors.

If the report has `passed === false` (exit 2), display the formatted report and block:

```
Infrastructure Preflight: FAILED

<formatted report output>

Execution blocked. Options:
  1. Fix the issues above and retry
  2. Re-run with --no-infra to bypass (user decision only)
```

If `report.passed === true` and `report.skipped === true`, emit: "Infrastructure preflight skipped (--no-infra)."

If `report.passed === true` and `report.skipped === false`, proceed silently.

If `lib/infra-preflight.mjs` fails to import, block with: "Infrastructure preflight library could not be loaded: <error>. Fix the library before proceeding."

---
