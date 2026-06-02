---
charter: cli-driver-surface
kind: behavioral
status: implemented
risk_level: medium
milestone:
revision: 1
charter-revision: 2
created: 2026-05-14
updated: 2026-05-14
source-manifest:
  sha: "0a68e9c"
  files:
    - cli/index.mjs
    - lib/cli/diagnose.mjs
    - tests/cli/diagnose.test.mjs
    - tests/cli/fixtures/diagnose/expected.json
  computed-at: "2026-05-14T21:26:32.169Z"
drift_detected: true
---

# Live Spec: `adev diagnose` CLI Verb

<!-- Live Spec within the cli-driver-surface charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/cli-driver-surface/charter.md -->

## Behavioral Contract

`adev diagnose` is the on-demand CLI surface over the diagnostic registry (`diagnostic-registry` spec). It is the entry point for deterministic artifact verification — the answer to *"is this artifact verifiably done?"* It accepts filtering by spec, tier, diagnostic ID, and emits either human-readable output (default) or stable JSON (`--json`) for tool consumption. Exit codes follow the hook protocol: 0 if no error-severity diagnostics fired, 2 if any did. This is the verb that `/adev:review-specs` Step 0, `/adev:plan` Step 0, `/adev:implement` Step 0, and `/adev:validate` Step 0 all call to refuse to start unless prior-phase artifacts are clean. It is also the verb `PreToolUse` / `SessionStart` hooks call to inject current diagnostics into agent context.

### Preconditions

- `driver-substrate` spec validated (the `lib/cli/<verb>.mjs` pattern and `cli/index.mjs` dispatch are in place).
- `diagnostic-registry` spec validated (`lib/diagnostics/index.mjs::runDiagnostics` is available and `governance/diagnostics.yaml` exists).
- `.context-index/manifest.yaml` is loadable.

### Behaviors

1. **When** `adev diagnose` is invoked with no arguments, **then** it runs all registered diagnostics at all tiers across all specs in `.context-index/specs/features/**/*.spec.md`, prints firing diagnostics grouped by spec to stdout, and exits 0 (if zero error-severity fired) or 2 (if any did).
2. **When** `adev diagnose --spec <path>` is invoked, **then** the diagnostic run is scoped to that single spec; diagnostics whose `scope` is `workspace` are still run but receive `spec: <path>` for context. The resolved `--spec` path must be contained within `projectRoot` (via `path.resolve(spec).startsWith(path.resolve(projectRoot))`); out-of-bounds paths exit 1 with `"spec not found: <path>"`.
3. **When** `adev diagnose --tier <1|2|3>` is invoked, **then** only diagnostics with `tier: <N>` are run. Tier flag accepts comma-separated values (`--tier 1,2`); default is all tiers.
4. **When** `adev diagnose --only <id>[,<id>...]` is invoked, **then** only diagnostics whose ID matches one of the allowlisted IDs are run.
5. **When** `adev diagnose --json` is invoked, **then** stdout is a single JSON object matching the stable schema documented in the response shape; no human-readable text is mixed into stdout. Errors go to stderr.
6. **When** the JSON output is emitted, **then** it conforms to: `{ schema_version: "1", fired: [ { id, severity, message, citation?, spec?, runner_path } ], skipped: [ { id, reason } ], errors: [ { id, message } ], summary: { total_fired, by_severity: { info, warning, error }, exit_code } }`.
7. **When** `adev diagnose` is invoked from inside a `PreToolUse` or `SessionStart` hook (`--json` mode), **then** the output is stdout-only and emits in <1 s for project-wide Tier-1 diagnostics, <500 ms for single-spec Tier-1 diagnostics (per `diagnostic-registry` spec's performance budget).
8. **When** any diagnostic of severity `error` fires, **then** exit code is 2. When the highest-severity firing is `warning`, exit code is 0 by default but 2 if `--strict-warnings` is passed.
9. **When** `--quiet` is passed, **then** human-readable output suppresses any firing of severity `info`; JSON output is unchanged.
10. **When** `adev diagnose --help` is invoked, **then** it prints argv schema, examples, and the list of available diagnostic IDs (read from `governance/diagnostics.yaml`).
11. **When** `--registry-errors` mode is invoked (or by default in human mode), **then** registry-level errors (missing runners, malformed entries) are printed prominently at the top of output so operators see them before regular findings.

### Postconditions

- `lib/cli/diagnose.mjs` exists, exports `run({...})` and `help()` per the driver-substrate pattern.
- `cli/index.mjs` verb registry includes `diagnose` → `lib/cli/diagnose.mjs`.
- The verb does NOT export `LIFECYCLE_STEP` — `adev diagnose` is not itself a lifecycle step; it's a query.
- `tests/cli/diagnose.test.mjs` covers all behaviors and stable JSON shape.
- Charter Capability Map: row "`adev diagnose` CLI verb" has `Status: specified`.

### Error Cases

| Condition | Expected Behavior | Exit code |
|---|---|---|
| `--spec <path>` where path does not resolve to an existing `.spec.md` file | Print `"spec not found: <path>"` to stderr | 1 |
| `--tier X` where X is not 1, 2, 3, or comma-list of those | Print usage with error | 1 |
| `--only <id>` where the ID is not in `governance/diagnostics.yaml` | Print warning to stderr (`unknown diagnostic id: <id>`), continue with remaining valid IDs; if no IDs remain, exit | 1 |
| `--json` AND `--quiet` both passed | `--quiet` is ignored in JSON mode; warning printed to stderr | 0 (proceeds) |
| `governance/diagnostics.yaml` missing | Engine reports registry-missing error (per registry spec); `adev diagnose` prints to stderr, exits | 1 |
| Engine throws unexpectedly | Caught at the `cli/index.mjs` dispatch level per the driver-substrate error-handling contract (unexpected exception → message + stack to stderr) | 1 |
| Any diagnostic of severity error fires | Print firings to stdout, exit | 2 |
| Diagnostic of severity warning fires AND `--strict-warnings` passed | Same as error case | 2 |
| Diagnostic of severity warning fires, no `--strict-warnings` | Print firings to stdout, exit | 0 |
| Diagnostic of severity info fires only | Print firings to stdout, exit | 0 |
| No diagnostics fire | Print `"All checks passed."` to stdout (or empty in JSON), exit | 0 |

## System Constitution Reference

- **Principle 1 ("Minimize external dependencies"):** Argv parsing uses `node:util::parseArgs`. JSON output uses `JSON.stringify`. No external deps.
- **Principle 3 ("Pure ESM"):** `.mjs`, ESM-only.
- **Principle 4 ("Hook protocol compliance"):** Exit codes 0 / 1 / 2 per protocol. JSON output discipline (stdout JSON-only when `--json`) makes the verb usable from `PreToolUse` hooks per Claude Code's stdout-injection mechanic.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|---|---|---|
| Implement `lib/cli/diagnose.mjs::run` | Parse argv, call `runDiagnostics`, branch on `--json` vs human, compute exit code | Medium |
| Implement human-readable formatter | Group firings by spec, color severities (no color library — ANSI escape sequences in built-ins), print citations with `path:line` form | Medium |
| Implement JSON formatter | Build the stable schema response object, `JSON.stringify` with stable key order | Small |
| Implement `lib/cli/diagnose.mjs::help` | Read registry, print available diagnostic IDs grouped by tier and severity | Small |
| Register `diagnose` in `cli/index.mjs` verb registry | One-line registration per the driver-substrate pattern | Small |
| Write `tests/cli/diagnose.test.mjs` | Cover all behaviors, error cases, exit codes; assert JSON schema stability via golden snapshots | Medium |

## Acceptance Criteria

- [ ] `adev diagnose` runs all diagnostics, prints firings, exits 0 (clean) or 2 (errors fired)
- [ ] `adev diagnose --spec <path>` scopes to one spec
- [ ] `adev diagnose --tier 1` runs only Tier-1; `--tier 1,2` runs both
- [ ] `adev diagnose --only <id>` filters to one or more IDs
- [ ] `adev diagnose --json` emits a stable JSON object matching `{ schema_version, fired, skipped, errors, summary }`
- [ ] JSON schema is locked via golden snapshot test; changes require schema version bump
- [ ] `adev diagnose --strict-warnings` treats warning-severity firings as error-severity for exit code purposes
- [ ] `adev diagnose --quiet` suppresses info-severity firings in human output
- [ ] `adev diagnose --help` lists all registered diagnostic IDs from `governance/diagnostics.yaml`
- [ ] Registry-level errors print at the top of human output (and appear in `errors:` array in JSON)
- [ ] No diagnostics fire → `"All checks passed."` on stdout, exit 0
- [ ] Project-wide Tier-1 run completes in <1 s on this repo
- [ ] Single-spec Tier-1 run completes in <500 ms
- [ ] `tests/cli/diagnose.test.mjs` passes; covers all behaviors and error cases
- [ ] Stable JSON schema documented in `lib/cli/diagnose.mjs` header comment
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations
