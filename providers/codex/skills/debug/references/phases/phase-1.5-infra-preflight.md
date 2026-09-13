### Phase 1.5: Infrastructure Preflight

After reproducing the issue and loading heuristics, check whether the relevant spec or plan declares `infra_requirements`. If so, run the infrastructure preflight before investigating.

**`--no-infra` resolution:** Read `--no-infra` flag from arguments. If not passed, check `ADEV_NO_INFRA` env var (only exact value `1` activates bypass). Read once at skill entry, convert to `options.noInfra`. The agent must never set `--no-infra` or `ADEV_NO_INFRA` autonomously — if preflight fails, report the failure and wait for user direction.

**Three-tier spec/plan resolution:**

1. **Arguments:** If `--spec <path>` was passed, read that spec. Look for a `.plan.md` sibling adjacent to it (same directory, same base name). Use both for the preflight invocation.

2. **Active plan:** If no `--spec` was passed, read `.context-index/hygiene/.active-plan`. If the file exists and contains a plan path, read the plan and extract the referenced spec from the plan's `Spec:` header.

3. **Inference:** If neither tier 1 nor tier 2 produced a spec, determine the module from the buggy file's path via `manifest.yaml` modules. Glob specs in `.context-index/specs/features/<module>/` (cap at 10 spec files; validate each path is within the project root). Check each spec for `infra_requirements` in its frontmatter.

**Invocation:** Run the preflight via the CLI:

```bash
adev preflight run --spec <specPath> [--plan <planPath>] [--timeout 10] [--no-infra]
```

Stdout is a single JSON object — the preflight report. Exit codes: 0 on PASS or skipped, 2 on FAIL, 1 on argument errors.

**For tiers 1 and 2 (explicit spec/plan):** If the report has `passed === false` (exit 2), display the formatted report and block:

```
Infrastructure Preflight: FAILED

<formatted report output>

Execution blocked. Options:
  1. Fix the issues above and retry
  2. Re-run with --no-infra to bypass (user decision only)
```

**For tier 3 (inference):** If `report.passed === false`, use a NON-BLOCKING advisory instead of a hard block:

```
Infrastructure may be unavailable (inferred from <module> specs):
  ✗ <system>: <issue>

Waiting for user direction. Fix the infrastructure issues above, or
re-run with --no-infra to bypass.
```

Hard pause — the agent must not answer on behalf of the user.

If `report.passed === true` and `report.skipped === true`, emit: "Infrastructure preflight skipped (--no-infra)."

If `report.passed === true` and `report.skipped === false`, proceed silently.

If `lib/infra-preflight.mjs` fails to import, block with: "Infrastructure preflight library could not be loaded: <error>. Fix the library before proceeding."

If no spec with `infra_requirements` is found across all three tiers, skip the preflight silently.

