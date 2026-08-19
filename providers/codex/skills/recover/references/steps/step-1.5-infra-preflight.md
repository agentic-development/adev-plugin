### Step 1.5: Infrastructure Preflight

After detecting the stall point, check whether the relevant spec or plan declares `infra_requirements`. If so, run the infrastructure preflight. This step always runs when `infra_requirements` are present — recovery must verify infrastructure state before gathering evidence, since infrastructure failure may be the root cause.

**`--no-infra` resolution:** Read `--no-infra` flag from arguments. If not passed, check `ADEV_NO_INFRA` env var (only exact value `1` activates bypass). Read once at skill entry, convert to `options.noInfra`. The agent must never set `--no-infra` or `ADEV_NO_INFRA` autonomously — if preflight fails, report the failure and wait for user direction.

**Spec/plan resolution:** Use the plan and spec identified in Step 1 (Detect). The plan path comes from the active plan or `--task` resolution. The spec path comes from the plan's `Spec:` header.

**Invocation:** Run the preflight via the CLI:

```bash
adev preflight run --spec <specPath> [--plan <planPath>] [--timeout 10] [--no-infra]
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

**Infrastructure-related recovery context:** When the recovery skill classifies the root cause as infrastructure-related (e.g., TOOL_FAILURE caused by unreachable services, missing credentials, or connection failures), include the formatted preflight report (from `formatPreflightReport()`, not the raw object) in the corrective context injected into the re-dispatched subagent. This gives the subagent awareness of current infrastructure state.

