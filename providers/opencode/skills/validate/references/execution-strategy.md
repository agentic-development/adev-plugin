## Execution Strategy

### Resolve Rigor Tier (before running checks)

Resolve the **rigor tier** (`full` | `quick`) per `graduated-rigor-tiers.spec.md`. `quick` never skips the gate — it always runs Check 1 and emits the `validate` lifecycle event. Resolution precedence (this is the `resolveRigorMode({ skill: "validate", ... })` contract in `lib/governance/rigor-mode.mjs`):

1. **Explicit `--tier <full|quick>`** on invocation (reject other values with `INVALID_TIER`).
2. **Routing signal** — `--tier quick` propagated by `/adev:route`, `/adev:work`, or `/adev:build` for "easy" work.
3. **Risk policy** — `.context-index/governance/risk-policies.yaml` → the spec's `risk_level` (default `medium`) → `policies.<level>.validate_mode`.
4. **Default** — `full`.

**Quick tier behavior.** When the resolved tier is `quick`:
- Run **Check 1 (Quality Gates)** exactly as in full mode, with the same fail-fast semantics (a Check-1 FAIL still fails validation and stops).
- Then run **one synthesized compliance check** — a single subagent that verifies spec compliance (Check 2) and constitution compliance (Check 4) in one pass against the changed files, emitting a PASS/FAIL with cited evidence.
- **Skip** the remaining checks (1.5, 1.6, 8, 9, and the separate Check 2/Check 4 dispatches). Check 11 (Visual Verification) still triggers independently if the implementation includes UI files.
- Record skipped checks as `SKIP` with reason `"Skipped — quick rigor tier."` in the report; note the resolved tier in the report header. The `validate` lifecycle event is emitted as usual with the aggregate verdict.

When the resolved tier is `full` (default), run the whole check set as described below.

**Fail-fast on Check 1 (Quality Gates).** If tests, lint, or typecheck fail, skip Checks 2 through 13 and report immediately. There is no value in checking spec compliance on code that does not compile or pass its own tests. The user must fix quality gate failures first and re-run `/adev:validate`. **Exception:** Check 11 (Visual Verification) is triggered independently for UI files. If quality gates fail but the implementation includes UI files, still note that visual verification is pending.

**Checks 2 through 13 run in full regardless of individual failures.** Collect all issues across all checks so the user gets a complete picture in a single validation cycle. Do not stop at the first failure after Check 1.

**Disabled and fail-fast handling:** For every check in the sorted registry:

- If `enabled === false`, record `SKIPPED-DISABLED` with the disabled-note and continue without running. It does not contribute to the verdict.
- Otherwise call `shouldSkipDueToFailFast(check, priorResults)`: if any `after`-predecessor ran with `fail_fast: true` + `severity: error` + `status: FAIL`, record `SKIP` with reason `"Skipped — prerequisite '<id>' failed."` and continue.

**Project quality-gate checks:** invoke `runQualityGate(check, { env, redactor, cwd })` from `lib/governance/quality-gate.mjs`. The runner uses `execFile` with `shell: false`; the subprocess environment consists of the profile-resolved env plus a minimal startup whitelist (`PATH`, `HOME`, `LANG`, `LC_ALL`, `LC_CTYPE`, `TMPDIR`, `USER`, `LOGNAME`). `LD_PRELOAD`, `NODE_OPTIONS`, `PYTHONPATH`, `SSL_CERT_FILE`, and any other invoking-shell var is NOT inherited. stdout/stderr flow through the profile's redactor before report/display/dispatch-record use. Combined output is capped at 64 KiB with a tail-truncation marker.

**Subagent-review checks** (Checks 2, 4, 11): dispatch the subagent with `Agent({description, prompt, run_in_background: false})` and nothing else, with the prompt body loaded from each check's `resolvedPromptPath` (resolved at registry-load time from the `plugin:validate/checks/<id>.md` URI). Each check's section begins with an `enabled` guard — if the registry marked it disabled, the check is skipped without running.



**Checks 8 and 9 are NOT subagent-review checks.** Both are deterministic CLI reads — `adev boundaries check --json` and `adev gate transitions --json` — that this skill runs directly and records verbatim. Dispatch no subagent for either. Check 8 records SKIP when the project declares no boundary rules, and Check 9 SKIPs when it configures no `implement-to-validate` transition; in neither case is a subagent involved. Their bodies (`skills/validate/checks/validate.check-8-boundaries.md`, `…check-9-transition-gates.md`) are instructions for the orchestrator, not prompts to hand to an agent.
