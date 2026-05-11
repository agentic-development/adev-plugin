---
charter: test-strategies
charter-extension: true
status: validated
revision: 1
charter-revision: 2
created: 2026-04-20
updated: 2026-05-04
source-manifest:
  files:
    - lib/test-strategies/profiles/smoke.md
    - lib/test-strategies/profiles.mjs
  computed-at: "2026-05-10T23:51:01.456Z"
---

# Live Spec: Smoke Strategy Profile

## Capability

The **smoke** test strategy profile governs lightweight integration checks that verify a thing runs without errors. It defines the RED/GREEN contract, test authoring rules, anti-patterns, assertion constraints, seed data requirements, and handoff expectations for any project using smoke-based quality gates.

This profile is loaded when a project's test strategy configuration includes `smoke` as a registered strategy. The adev framework routes test writing and validation tasks through these rules when the smoke profile is active. Smoke tests are intentionally minimal — they are not substitutes for integration or end-to-end suites, and they must not be expanded into full functional checks under this profile.

## Behavioral Contract

### Preconditions

- The target system, service, or artifact is defined: a URL, a CLI command, a migration script, or a deployment endpoint.
- Expected preconditions for the target are documented in the task ticket (e.g., "database must be migrated", "config file must exist at path X").
- A reasonable timeout value is chosen and documented before the check is written.
- The test runs against the actual deployed or running artifact — not a mock of the target itself.

### Behaviors

**1. RED/GREEN definition**

- RED: the smoke check exits non-zero because the service, migration, or deployment does not work — the HTTP health endpoint does not return the expected status, the migration script exits with an error, the deployed service does not respond to a basic request, or the CLI tool does not exit 0.
- GREEN: the smoke check passes — the service responds, the migration completes, the deployment is healthy, or the CLI tool exits 0 with expected output.

**2. Test authoring**

Write minimal health or liveness checks that verify the system is operational. Do not add functional assertions beyond what is needed to confirm the system is running and responsive. Representative checks:

- HTTP health endpoint returns 200 with a body containing an expected key (e.g., `{"status": "ok"}`).
- Migration script completes without error and exits 0.
- Deployed service responds to a basic request with a non-error status.
- CLI tool runs with a canonical invocation and exits 0.

Order of operations:
1. Document the smoke target and expected preconditions.
2. Choose and document the timeout value.
3. Write the smoke check — it will fail because the target is not yet deployed or not yet working (RED).
4. Deploy or build the artifact.
5. Run the smoke check and confirm it passes (GREEN).

**3. Gaming patterns (prohibited)**

The following patterns are explicitly prohibited and will cause `/adev:validate` to block the PR:

- Smoke tests that only check process exit code without verifying any output or response content.
- Health checks that return 200 even when the service is degraded or returning error payloads.
- Checks that pass on empty or default responses without verifying that expected content is present.
- Overly broad "it didn't crash" assertions with no property verification.

**4. Assertion rules**

- Smoke tests must verify at least one meaningful response property: status code plus body containing an expected key, or exit code plus stdout containing expected output.
- A timeout must be set explicitly — checks that wait indefinitely are prohibited.
- Tests must run against the actual deployed or running artifact, not a mock of the target.

**5. Seed data**

Smoke tests use whatever state the system starts with after its own initialization. Seed data requirements are minimal, but preconditions must be explicitly documented:

- "Database must be migrated before running smoke check."
- "Config file must exist at `/etc/app/config.yaml`."
- "Service must be running on port 8080."

Do not introduce fixture data or state mutations as part of the smoke check itself.

**6. Handoff**

When handing off a completed smoke test cycle, provide:

- Smoke script paths or inline commands used.
- Target URL, command, or script identifier.
- Expected response shape (status code, body key, stdout pattern, exit code).
- Timeout value in use.
- Precondition checklist (what must be true before the check is run).

**7. RED verification**

The smoke check must fail because the service or artifact is not running or not working correctly. RED caused by the following is not a valid RED and must be fixed before the cycle continues:

- A bug in the smoke check script itself (wrong URL, wrong command, syntax error).
- The target URL or command being incorrectly specified.
- A network routing issue between the test runner and the target (see `SMOKE_UNREACHABLE` error case).

### Error Cases

| Code | Trigger | Behavior |
|---|---|---|
| `SMOKE_UNREACHABLE` | Target host is unreachable due to network failure | Distinguish from smoke failure: "Target unreachable — this is a setup error, not a smoke failure. Check DNS, firewall, and routing before interpreting this as a service defect." Do not count as a RED for implementation purposes. |
| `SMOKE_TIMEOUT` | Smoke check exceeds the documented timeout | Report as failure with the timeout value: "Smoke check timed out after {N}ms — service did not respond within the allowed window." Count as RED. |
| `SMOKE_NO_TARGET` | No smoke target (URL, command, or script) is defined | Block: "Define the smoke target (URL, command, or script) before authoring the smoke check." Do not proceed to test authoring. |

## Constitution Reference

This spec operates under the adev constitution constraints:

- Tests are written before the implementation is complete (RED first).
- GREEN must be achieved through correct deployment or build, not by weakening assertions or removing timeout constraints.
- Handoff artifacts are required before a cycle is considered done.
- Anti-patterns listed above constitute violations of the test-integrity principle.
- Smoke tests must not be expanded into functional test suites — keep scope minimal.

See `.context-index/constitution.md` for the full constraint set.

## Actionable Task Map

| Milestone | Task |
|---|---|
| Specify | Document the smoke target, expected preconditions, expected response shape, and timeout value in the task ticket. |
| Plan | Confirm target is reachable in the test environment; verify preconditions can be satisfied; choose the smoke tool. |
| Write-test | Author the smoke check (script, curl command, or test file). Confirm RED by running against a non-running or broken target. |
| Implement | Deploy or build the artifact until the smoke check exits 0 with the expected output. |
| Validate | Run the smoke check against the deployed artifact; confirm at least one meaningful property is asserted; verify timeout is set; check for prohibited gaming patterns. |
| Handoff | Deliver script paths, target, expected response shape, timeout value, and precondition checklist. |

## Acceptance Criteria

- [ ] The smoke target (URL, command, or script) is explicitly defined before test authoring begins.
- [ ] Preconditions are documented in the task ticket or handoff block.
- [ ] The smoke check verifies at least one meaningful response property beyond exit code alone.
- [ ] A timeout is explicitly set and documented.
- [ ] The check runs against the actual deployed or running artifact, not a mock of the target.
- [ ] RED is confirmed before implementation begins and is caused by the artifact not working, not by a script bug or network routing issue.
- [ ] GREEN is confirmed by the smoke check passing against the correctly deployed artifact.
- [ ] No prohibited gaming patterns are present in the smoke check.
- [ ] `SMOKE_UNREACHABLE` errors are correctly distinguished from genuine smoke failures.
- [ ] Handoff artifacts are complete: script paths, target, response shape, timeout, precondition checklist.

## Permitted Tools

curl, httpie, wget, custom shell scripts, Docker healthcheck, Kubernetes readiness probes, Playwright (for web smoke), Testcontainers.
