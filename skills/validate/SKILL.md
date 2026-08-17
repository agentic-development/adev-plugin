---
name: adev:validate
description: "Post-implementation validation with a trimmed code-time check set (quality gates, source manifest, code-drift advisory, spec compliance with scope-expansion sub-finding, constitution compliance with evidence-citation contract, optionally governance boundaries and transition gates, and visual verification for UI implementations). Fail-fast on quality gates. Structured PASS/FAIL report with migration-orientation footer pointing users to /adev:hygiene, /adev:reconcile, and /adev:review-specs for relocated concerns. Use when the user says 'validate the implementation', 'check if it works', 'run validation', 'verify the feature', or after implementation is complete and needs quality assurance."
---

# Validate Implementation

Run post-implementation validation against specs, constitution, charters, ADRs, quality gates, governance boundaries, and transition gates. Produces a structured report with PASS/FAIL per check and specific file references for every failure.

## Arguments

- `--spec <path>`: validate against a specific Live Spec (required)
- `--plan <path>`: cross-reference the implementation plan (optional, improves traceability)
- `--fix`: attempt to auto-fix minor issues (lint errors, formatting) before reporting
- `--no-infra`: skip infrastructure preflight checks (user-only — the agent must never set this flag)
- `--tier <full|quick>`: rigor tier (graduated-rigor-tiers spec). `full` (default) runs the whole check set; `quick` runs Check 1 (quality gates, fail-fast) plus a single synthesized spec+constitution compliance check, and skips the remaining checks. Overrides any routing/risk-policy signal. Invalid value → `INVALID_TIER`.

## Prerequisites

Before starting, verify:

1. **Context Index exists.** `.context-index/` must be present with `constitution.md` and `manifest.yaml`.
2. **Spec exists.** The target Live Spec must exist and be readable.
3. **Implementation exists.** The files referenced in the spec or plan must exist. If the spec references files that do not exist, the implementation is incomplete. Report this immediately without running the full check suite.

### Step 0a: Implement-step gate (FIRST action)

Before any validation work, gate on the prior step via the lifecycle log, then emit the step-started event:

```bash
adev gate require --skill validate --spec <spec-path>
adev report --type step --spec <spec-path> --step validate --status started
```

In strict mode (default — resolved from `manifest.yaml`'s `lifecycle.gate_mode`), `adev gate require` exits `2` if the `implement` step did not complete with a passing verdict — the skill stops and the operator is told which prior step is missing. In advisory mode, it emits a warning and exits `0`. Do NOT catch the failure — surface the helper's stderr unchanged. Path-containment is enforced by the helper (`INVALID_PROJECT_ROOT` / `INVALID_SPEC_PATH`); skill prose MUST NOT pre-validate paths.

Emit a matching exit event in the new "Step Z: Emit lifecycle completion" section after the validation report is written. The exit event carries the aggregate verdict (PASS / PASS_WITH_NOTES / FAIL) computed from the consolidated check results.

### Step 0a-fail: Failure-path exit event

An aggregate `FAIL` verdict is **not** this section's business — a validation run that completed and concluded FAIL exits through the Step Z `--status completed --verdict FAIL` line. This section covers the case where validation aborts before it can compute any aggregate at all.

Whenever the skill stops after the `--status started` event above without reaching Step Z, emit the terminal event before surfacing the error to the operator:

```bash
adev report --type step --spec <spec-path> --step validate --status failed --verdict FAIL
```

`--verdict FAIL` is required, not decorative. The projection's aggregation pass in `lib/lifecycle-state.mjs` only treats a step terminal as explicit when it carries a string verdict; a `step_failed` emitted without one is overwritten by the verdict synthesized from whatever `validator_report` events already landed, so a run that aborted after two passing checks would project as `{verdict: PASS, status: completed}` — a dead run indistinguishable from a clean one.

Abort paths in this skill that MUST emit it:

| Step | Abort |
|---|---|
| Preflight | `adev preflight run` reports `report.passed === false` — execution is blocked pending operator direction. The agent must never set `--no-infra` or `ADEV_NO_INFRA` autonomously to get past it. |
| Preflight | `lib/infra-preflight.mjs` fails to import. |
| Step 0 | `loadValidateConfig` throws `MISSING_VALIDATE_CONFIG` — no checks dispatch and no report is written. |
| Step 0 | Any other `loadValidateConfig` loader error (`INVALID_CHECK_ID`, `DETERMINISTIC_PROJECT`, unresolvable prompt URI, profile resolution failure, `after` cycle) — "abort on any loader error". |

The Prerequisites block (missing `.context-index/`, missing spec, missing implementation files) runs *before* the `--status started` event and therefore strands nothing — do not emit for those.

**Known gap (not this skill's to fix):** `adev report --type step` accepts no `--error` flag, so the abort's error code cannot be carried on the event even though the `step_failed` schema has an `error` field. Name the code in operator-facing output; widening the CLI surface is a follow-up.

## Workspace-Aware Validation Mode

Before running the 12 checks, call `detectWorkspace(cwd)` from `lib/workspace.mjs`.

**If `detectWorkspace(cwd)` returns `null`** (no workspace detected), skip all workspace-aware logic. All 12 checks behave identically to single-repo behaviour. No new output, no new warnings, no performance overhead beyond the single `detectWorkspace()` call.

**If a workspace is detected** and the spec's `depends-on` frontmatter array contains at least one cross-repo reference matching the pattern `@<repo-slug>/<spec-slug>`, enter **workspace-aware validation mode**:

1. For each cross-repo reference in `depends-on`, call `resolveRef(workspaceRoot, ref)` to obtain the absolute path to the sibling spec file.
2. Validate each resolved path with `assertPathInWorkspace(workspaceRoot, resolvedPath)` before reading. Any path that escapes the workspace root is rejected with a warning (not a blocking error).
3. Read each resolved sibling spec (capped at 512 KB per file via `readCappedText` semantics — files exceeding the cap produce a warning and are skipped).
4. Collect all successfully resolved specs into a `crossRepoDeps` context object for use by Checks 2 and 3.

**Unresolvable cross-repo references:** If `resolveRef()` returns `null` for a cross-repo reference (repo not in workspace registry, or spec file not found), emit a **warning** — not a blocking error. The warning must include the unresolvable reference string. Validation continues with the remaining resolvable references.

**Sibling repo content is read-only reference.** Cross-repo spec content is used strictly as read-only reference material. The validate skill must never write to, modify, or suggest modifications to files in sibling repos.

**Repo-mode-inside-workspace advisory:** When `detectWorkspace(cwd)` returns non-null but the spec has no cross-repo `depends-on` references, emit an advisory to stdout (once per invocation): `"Advisory: running repo-scoped inside workspace — cross-repo validation skipped (no cross-repo depends-on references)."` This is informational only and does not affect validation behaviour.

## Preflight: Infrastructure Verification

After verifying prerequisites, check whether the spec declares `infra_requirements`. If so, run the infrastructure preflight before proceeding to validation checks.

**`--no-infra` resolution:** Read `--no-infra` flag from arguments. If not passed, check `ADEV_NO_INFRA` env var (only exact value `1` activates bypass). Read once at skill entry, convert to `options.noInfra`. The agent must never set `--no-infra` or `ADEV_NO_INFRA` autonomously — if preflight fails, report the failure and wait for user direction.

**Invocation:** Run the preflight via the CLI:

```bash
adev preflight run --spec <specPath> [--plan <planPath>] [--timeout N] [--no-infra]
```

Where `<specPath>` is the `--spec` argument and `<planPath>` is the `--plan` argument (omit `--plan` when not provided). Stdout is a single JSON object — the preflight report. Exit codes: 0 on PASS or skipped, 2 on FAIL, 1 on argument errors.

If `report.passed === false`, display the formatted report and block:

```
Execution blocked. Options:
  1. Fix the issues above and retry
  2. Re-run with --no-infra to bypass (user decision only)
```

If `report.passed === true` and `report.skipped === true`, emit: "Infrastructure preflight skipped (--no-infra)."

If `lib/infra-preflight.mjs` fails to import, block with: "Infrastructure preflight library could not be loaded: <error>. Fix the library before proceeding."

## Step 0: Load Check Registry

**Heuristics:** Before loading the check registry, load module-scoped heuristics for the spec's charter module via the CLI:

```bash
adev heuristics retrieve --module <charter-module> --tier summary --format text
```

Derive the module slug from the spec's `charter:` frontmatter field. Stdout is either rendered markdown blocks (one per heuristic) or the literal sentinel `__NONE__` when no heuristics match. The verb exits 0 regardless — retrieval failures degrade to `__NONE__` so heuristic injection stays non-blocking.

When heuristics are present (output is not `__NONE__`), include them in the validation context so checks can reference learned patterns and prepend: "The following heuristics are lessons learned from past work in this module. Use them as guidance, not as hard rules."

**Domain-Aware Gate Loading:** Resolve the active domain and load domain-specific gates before running checks via the CLI:

```bash
adev domain load-gates --module <module-slug> [--charter <charter-path>]
```

The verb resolves the active domain (charter frontmatter → manifest.modules[].domain → manifest.project.domain → 'software'), loads `templates/domains/<domain>/gates.yaml`, and merges `.context-index/governance/gates.yaml` on top (governance wins on `id` conflict). Stdout is a single JSON object:

```json
{ "domain": { "resolved_domain": "...", "source_level": "..." }, "gates": [...], "warnings": [...] }
```

Log any warnings from the `warnings` field. The `gates` list is the resolved gate set for Check 1. When Check 1 resolves gates, use this merged list instead of reading `governance/gates.yaml` directly — domain gates are already merged in. Gate commands continue to execute via `execFile` (no shell interpolation).

Before running any check, call `loadValidateConfig(repoRoot)` from `lib/governance/validate-config.mjs`. The loader follows the **single-source model** (per `validate-config-single-source.spec.md`):

- **Preflight (missing-file check):** If `.context-index/governance/validate.yaml` does not exist, `loadValidateConfig` throws `MISSING_VALIDATE_CONFIG` with the message: `"No governance/validate.yaml found. Run /adev:init to scaffold the validate configuration for your domain."` The skill catches this only to surface the message and stop — no checks dispatch, no report is written.
- **Direct read:** Loads `.context-index/governance/validate.yaml` directly. There is no bundled-defaults file, no overlay merge. The project file is the entire registry. It was scaffolded at `/adev:init` time from `templates/domains/<domain>/validate.yaml`.
- **Id allowlist (SEC-1):** Every entry's `id` is validated against `^[a-z0-9][a-z0-9._-]*$` BEFORE any `plugin:` URI construction. Non-conforming ids fail load with `INVALID_CHECK_ID` and the offending value is stripped to allowlist chars + truncated to 64 chars in the diagnostic.
- **Prompt URI resolution:** For each entry's `prompt` field, the loader resolves `plugin:validate/checks/<id>.md` to `<pluginRoot>/skills/validate/checks/<id>.md` with path-containment and absolute/cross-plugin guards. Project-relative paths resolve under `.context-index/`. The resolved absolute path is stored on the check object as `resolvedPromptPath`.
- **Per-kind validation:** Validates each entry's `kind` (`quality-gate` | `subagent-review` | `deterministic-check` | `observational`).
  - `quality-gate`: rejects string-form `command`; rejects any argv token containing `{{...}}`, `$VAR`, `${VAR}`, or `%VAR%` interpolation; requires an explicit `profile` (no implicit default — authors must positively acknowledge that profile permissions scope the adapter's tool surface, NOT the spawned subprocess).
  - `observational`: rejects `severity: error`.
  - `deterministic-check`: only the bundled allowed-id set (`validate.check-1.5-source-manifest`) may use this kind; other ids fail with `DETERMINISTIC_PROJECT`.
- Resolves each check's profile via `lib/profiles/` (MCP-missing fails load; required env missing fails load).
- Topologically sorts by `after` with lex-by-id tie-break; cycles fail load; unknown `after` ids emit WARN.

Abort on any loader error. Warnings surface in the report header. Check 1 (quality gates) IS a registry entry (`validate.check-1-quality-gates`, `kind: deterministic-check`, `severity: error`, `fail_fast: true`) — the entry declares the check's severity so its `validator_report` is stamped `error` rather than defaulting to `warning`. Its *gate set* is sourced from the project's MATERIALIZED `governance/gates.yaml` and nothing else, via `adev domain load-gates` above. The domain overlay is NOT merged at run time — `loadCheck1Gates` composes it only under `composeDomainOverlay`, which only `adev governance materialize --registry gates` sets. A domain gate that the project has not materialized does not run. The registry entry does not change where gates come from.

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill validate
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

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

**Subagent-review checks** (Checks 2, 4, 11): dispatch the subagent with the prompt body loaded from each check's `resolvedPromptPath` (resolved at registry-load time from the `plugin:validate/checks/<id>.md` URI). Each check's section begins with an `enabled` guard — if the registry marked it disabled, the check is skipped without running.

**Checks 8 and 9 are NOT subagent-review checks.** Both are deterministic CLI reads — `adev boundaries check --json` and `adev gate transitions --json` — that this skill runs directly and records verbatim. Dispatch no subagent for either. Check 8 records SKIP when the project declares no boundary rules, and Check 9 SKIPs when it configures no `implement-to-validate` transition; in neither case is a subagent involved. Their bodies (`skills/validate/checks/validate.check-8-boundaries.md`, `…check-9-transition-gates.md`) are instructions for the orchestrator, not prompts to hand to an agent.

## The Checks

> **Source of truth for per-check prompts:** As of `validate-config-single-source.spec.md`, the substantive prompt body for each subagent-review / deterministic-check / observational check lives in `skills/validate/checks/<id>.md`, referenced from the registry via the `plugin:validate/checks/<id>.md` URI. The sections below describe each check's purpose, orchestration semantics, and execution guards. The dispatch loop reads the prompt from the registry entry's `resolvedPromptPath`, not from the prose in this file. When the two diverge, the externalized file wins.

### Check 1: Quality Gates (fail-fast, tiered)

#### Gate Source Resolution

1. Use the resolved gate list computed in Step 0. It is the project's materialized `governance/gates.yaml`, not a run-time merge with the domain overlay (Task 11 removed that). If the list is non-empty, group gates by `tier` into ordered execution: fast → integration → e2e. Execute as sub-checks 1a/1b/1c. Each gate has fields: `id`, `name`, `kind`, `tier`, `command`, `scope`, `required`, `severity`, `triggers`, `group` (e2e-only), and `command_sha` — the SHA-256 of the gate's resolved argv, computed by the loader (`computeCommandSha` in `lib/gates/gate-sets.mjs`) and carried on the `adev domain load-gates` output. Use the value as given; never recompute it.
2. If the gate list is empty and `governance/gates.yaml` does not exist → SKIP Check 1 with advisory: "No governance/gates.yaml found. Quality gates are not configured. Run `/adev:init` to set up gates, then `adev governance materialize --registry gates` to adopt the domain's."

**Legacy gate detection:** If `manifest.yaml` contains a `gates:` section, emit a migration warning: "Legacy gates: section found in manifest.yaml. This is no longer used. Move gate definitions to governance/gates.yaml." This warning is informational and does not affect Check 1 execution.

**Default rules:**
- Gates without explicit `tier` default to `fast`
- Gates without explicit `kind` default to `deterministic`
- Default severity: `error` for fast/integration, `warning` for e2e
- `required: false` forces `severity: warning` regardless of other settings
- `kind: probabilistic` gates → skip with note: "Gate '<id>' is probabilistic — requires manual or eval-based verification."
- Probabilistic with `command` → ignore command, emit WARN: "Gate '<id>' is probabilistic but has a command — command ignored."
- E2E `group: smoke` runs before `group: full`, with independent severity defaults (error for smoke, warning for full). If smoke fails with error severity, skip full.

**Misconfiguration warnings:**
- Empty gates list → SKIP Check 1 with advisory.
- Invalid severity value → default to `error` with WARN.
- Invalid tier value → default to `fast` with WARN.
- Duplicate gate IDs → second definition ignored with WARN.

#### Tiered Execution (sub-checks 1a/1b/1c)

When tiered gates are resolved from `governance/gates.yaml`, Check 1 splits into sub-checks:

**Check 1a: Fast Tier** — Run all fast-tier gates sequentially. If a gate exits non-zero with `severity: error`, skip remaining fast gates (intra-tier fail-fast), skip Checks 1b, 1c, and 2–10. Report FAIL. If `severity: warning`, record WARN and continue to next gate. If no gates are assigned to the fast tier, skip with note: "fast tier — no gates configured, skipped."

**Check 1b: Integration Tier** — Run all integration-tier gates sequentially. Same fail-fast and severity semantics as 1a. If no gates are assigned to the integration tier, skip with note: "integration tier — no gates configured, skipped."

**Check 1c: E2E Tier** — Run all e2e-tier gates sequentially. Gates in `group: smoke` run before `group: full`. Smoke default severity: `error`; full default severity: `warning`. If smoke fails with error severity, skip full. If no gates are assigned to the e2e tier, skip with note: "e2e tier — no gates configured, skipped." E2E gate commands invoke Playwright (or any test runner) via shell — they are independent of Check 11's Playwright MCP visual verification.

**Output truncation:** Command stdout/stderr in failure reports is truncated to the last 8 KB per stream.

**`--fix` behavior:** Auto-fix applies only to the fast tier (Check 1a). If `--fix` was passed and a fast-tier lint or formatting gate fails, attempt auto-fix (e.g., `npx eslint --fix`). Re-run the gate. If it passes, record as PASS (auto-fixed). Integration and E2E commands are never auto-fixed.

**Check 11 exception:** If an error-severity tier fails and Checks 2–13 are skipped, Check 11 (Visual Verification) still follows its existing independent trigger rules — if the spec references UI files, note that visual verification is pending.

**Tier summary:** After Check 1 completes (all tiers pass or warning-only failures), include a tier summary in the report showing each tier's status, commands run, and duration per command. Use GateResult format: `Check 1a (fast): npm test — PASS (2.1s)`.

**If all tiers pass (or only warning-severity tiers fail):** Proceed to Check 2.

#### Per-Gate Outcome Attestation

After the tiers have run, Check 1 emits **exactly one** `validator_report` for the whole check, carrying one outcome per gate in the resolved set. The substantive procedure lives in `skills/validate/checks/validate.check-1-quality-gates.md`; the normative rule is here:

**Check 1 is the only sanctioned writer of `gate_outcomes`.** No other check, no subagent, and no other skill may emit a `validator_report` carrying that field. A `gate_outcomes` record is read downstream as evidence that the named gates actually executed against the code the spec's source manifest pins — a record from any other producer asserts an execution that did not happen.

Each outcome is `{ id, verdict, tier, command_sha }`: `id` and `command_sha` verbatim from the resolved gate set, `verdict` one of `pass` | `fail` | `skip` (lowercase), `tier` the gate's tier. Gates that never ran because an earlier gate failed are recorded as `skip` — omitting them is indistinguishable from never declaring them. `--manifest-sha` carries the `sha` from the spec's `source-manifest` frontmatter block, omitted when the spec has no such block.

Prefer the `@<path>` form of `--gate-outcomes` (a JSON file inside the project root): a non-trivial gate set exceeds what an argv element reliably carries.

Emit it once for the whole check — never once per gate.

### Check 1.5: Source Manifest Verification

If the spec's frontmatter contains a `source-manifest` block (stamped by `/adev:implement`), verify it via the CLI:

```bash
adev source-manifest verify --spec <spec-path>
```

The verb parses the `source-manifest` block from the spec's frontmatter (fields `sha`, `files`, and `computed-at`) and delegates to `verifyManifest(manifest, projectRoot)` from `lib/source-manifest.mjs` — passing the parsed manifest object and the project root path (NOT the spec file path). SHA comparison uses SHA-256 of file contents. The function returns `{ matches: bool, currentSha: string|null, missingFiles?: string[] }`; the verb classifies the result into one of the four outcomes below. Stdout is a single line; exit code follows the outcome.

| Outcome | Stdout shape | Exit | Validator verdict |
|---------|--------------|------|--------------------|
| Match — all listed files unchanged since stamping | `Check 1.5: PASS — source manifest matches (sha: <sha>)` | 0 | PASS |
| Drift — one or more files modified since stamping | `Check 1.5: WARN — source manifest drifted (...). Files: <list>` | 0 | PASS_WITH_NOTES (does not block) |
| Missing file — a listed file no longer exists on disk | `Check 1.5: FAIL — missing source files: <list>` | 1 | FAIL |
| No manifest block — spec has not been implemented yet | `Check 1.5: SKIP — no source manifest found. Run /adev:implement to stamp one.` | 0 | SKIP |

Pass `--quiet` to suppress the PASS / SKIP stdout line (errors and WARN are still emitted). The validator should still emit a `validator_report` event per Check 1.5 outcome via `adev report --type validator --validator validate.check-1.5-source-manifest`.

**Implementation existence check (post-CLI, validator-side):** For each file in the manifest, verify it has been committed to git (`git log --oneline -1 -- <file>`). If a file exists on disk but has NEVER been committed (untracked or only staged), it was not implemented through the normal workflow — record FAIL with: "Source file `<file>` exists but was never committed. Implementation may be incomplete or was not committed." The CLI does not perform this git-tracked check (it only inspects file content vs. SHA); the validator wraps it around the CLI call.

This check runs after quality gates (Check 1) regardless of their result, since it is a metadata check, not a code quality check.

### Check 1.6: Code-Side Drift Warning

Check for code-side drift via the `drift_detected` frontmatter flag. This check is **non-blocking** -- validation continues regardless of result.

Run the drift check via the CLI:

```bash
adev verify spec --spec <specPath> --check-drift
```

The `--check-drift` mode reads the spec's inline `drift_detected` boolean from frontmatter and sources the `drift_source` / `drift_at` payload from the spec's latest unresolved `code_drift_detected` event in `.context-index/lifecycle-state/<slug>.jsonl`. It emits a single JSON object on stdout:

```json
{ "drifted": <bool>, "drift_source": "<path|null>", "drift_at": "<timestamp|null>" }
```

If `drifted === true`, emit a WARN: "drift_detected flag set. Source file `<drift_source>` was modified at `<drift_at>`. Verify that spec still reflects implementation behavior."

Legacy fallback: pre-migration specs may return `drift_source: null` / `drift_at: null` when the spec has the inline boolean but no JSONL event yet. The drift is still real; the historical source is recoverable from `git log <spec>`.

If the verb exits non-zero (spec unreadable or path containment violation), record `CODE_DRIFT_READ_ERROR` and emit: "WARN: drift check skipped — spec unreadable".

Also run `adev source-manifest verify --spec <specPath>` (see Check 1.5) as a fallback for non-Claude-Code hosts where the hook never fired. If SHA mismatches, emit the same warning.

This check is **non-blocking** — validation continues regardless. Record WARN if drift is detected, PASS otherwise.

### Check 2: Spec Compliance

Load the Live Spec and walk through every acceptance criterion.

**Before citing any file:line reference, you MUST use the Read tool to read the actual file content.** Do not infer, assume, or fabricate file contents from the spec or plan. Every PASS/FAIL/PARTIAL verdict must cite at least one file that was explicitly read in this validation run. If a criterion cannot be verified because no relevant files were found with Glob/Grep, record PARTIAL with the note "Unable to locate implementation files — criterion unverified."

For each criterion:
1. Use Glob and Grep to identify which files and tests address it.
2. **Read the actual file content** using the Read tool. You MUST read the file before making any claims about its contents. Do NOT infer code structure, line numbers, or behavior from the spec alone — verify against the actual source. If you cite `file:line`, that line number must come from reading the file, not from guessing.
3. Verify the behavior matches the criterion based on what you read.
4. Check that a test exists for the criterion and that the test actually verifies the described behavior (not a trivial assertion).
5. Verify test integrity: assertions must be strict and match the spec exactly.
   Flag any of these anti-patterns:
   - Loose matchers where exact values are expected (regex where string would do,
     `toContain` where `toEqual` is appropriate)
   - Conditional skips (`if visible`, `try/catch` around assertions)
   - Assertions that can never fail (`>= 0`, `toBeTruthy()` on a string)
   - Tests that were clearly weakened to pass (look for recent changes that
     loosen assertions without a corresponding spec change)
   - Tests that assert on runtime/dynamic data instead of deterministic seed values
     (e.g., `toBeGreaterThan(0)` on a query result instead of seeding known data
     and asserting exact values)
   - Fixes applied to failing tests without evidence that the spec, charter,
     or ADRs were consulted (look for comments or commit messages referencing
     the context that justified the change)

**Do NOT use plan file checkboxes (`[x]`) as evidence of completion.** A `[x]` checkbox in a `.plan.md` file means the implementer marked the step done — it does not prove the code was written correctly or at all. Check 2 must be grounded in reading actual source files and tests, not plan metadata.

Record per criterion:
- PASS: code and tests satisfy the criterion (cite file:line from actual file reads).
- FAIL: code does not satisfy the criterion (with file:line references and explanation).
- PARTIAL: code partially satisfies (describe what is missing).

**Anti-fabrication rule:** Every file:line citation in the report MUST come from a Read tool call in this session. If you cannot read a file (it does not exist, is too large, etc.), say so explicitly rather than guessing its contents. A validation report with fabricated citations is worse than no report at all.

**Cross-repo interface verification (workspace-aware validation mode only):** When workspace-aware validation mode is active and `crossRepoDeps` is non-empty, Check 2 gains an additional sub-step: for each acceptance criterion that references behaviour defined in a cross-repo dependency spec, verify that the implementation respects the interface contracts (API signatures, data shapes, event payloads) described in the dependency spec. Record findings per criterion as PASS / FAIL / PARTIAL with references to both the local code and the cross-repo dependency spec.

### Check 4: Constitution Compliance

Load `.context-index/constitution.md`. Check:

- **Architecture Boundaries.** Verify no boundary was crossed. Common violations: new services or database tables created without approval, authentication flows modified, unauthorized dependencies added.
- **Non-Negotiable Principles.** Verify each principle is respected in the implementation. This is a semantic check: read the code and assess whether the principle's intent is honored.
- **Coding Standards.** Verify naming conventions, pattern usage, and structural conventions match the constitution. This complements the linter (Check 1) with standards that cannot be machine-checked.

Record PASS or FAIL with specific principle/boundary violated and code location.

### Check 8: Boundary Compliance

Run the boundary evaluator and record what it returns:

```
adev boundaries check --json
```

Take the `verdict` verbatim — `PASS`, `WARN`, `FAIL` or `SKIP`. Do not recompute it from the findings, and do not run the rule regexes yourself: the algorithm (regex against file contents, `exclude` globs, severity mapping, time and size budgets) lives in the verb.

The envelope carries `verdict`, `reason`, `findings`, `disabled`, `warnings` and `summary`. List every finding with its `ruleId` (the field is `ruleId`, **not** `rule`), its `file:line` and its `matchedLine`; list every `disabled` rule with its `disabled_reason` (a switched-off rule must read differently from one the project never declared); surface the top-level `warnings`, which are registry **schema** warnings such as `DISABLED_WITHOUT_REASON` and are a different thing from `summary.warnings`.

**A project declaring no rules records SKIP, never PASS** — nothing was read, so nothing held; the reason reads `no boundary rules declared`. A registry whose rules are all switched off SKIPs with a different reason naming them, because "nobody declared any" and "somebody turned them off" are different facts. Exit 1 (`INVALID_BOUNDARY_PATTERN`, `BOUNDARIES_PARSE_ERROR`) is a FAIL, not a SKIP: the project believes it has boundaries and the registry is unreadable.

Full body, including the per-finding table: `skills/validate/checks/validate.check-8-boundaries.md`.

### Check 9: Transition Gates

Run the transition comparator for the transition this skill drives:

```
adev gate transitions --transition implement-to-validate --spec <spec-path> --json
```

`implement-to-validate` is the only transition Check 9 evaluates: `/adev:validate` sits at the `implemented → validated` boundary. A project may declare others (this repo also declares `validate-to-merge`), but those belong to whoever drives that boundary — at the moment Check 9 runs, validate has not recorded its own outcome yet.

Add `--module <slug>` or `--charter <path>` when Check 1 ran under a module scope; the slug MUST match, or the resolved gate set differs and every recorded outcome reads as `unattested-gate-record`.

The envelope is `{transition, verdict, reason, gates}`; take the `verdict` verbatim. On exit 1 it is `{transition, error, code}` instead (`GATES_PARSE_ERROR`, `GATES_PATH_ESCAPE`, `GOVERNANCE_READ_ERROR`, `MANIFEST_PARSE_ERROR`, `INVALID_DOMAIN_NAME`) — record FAIL and quote the code. Report each blocked gate's reason: `no-recorded-outcome`, `stale-gate-record`, `no-manifest-stamp`, `unattested-gate-record`, `disabled-gate` and `unknown-gate` each call for a different remedy.

A SKIP means no transition was evaluated, and the reason says which case: `no transitions configured`, no transition of that name, the transition requires no gates, or the spec carries no source-manifest stamp (`no-manifest-stamp` — an unstamped spec has never completed implementation, so it owes no outcomes).

The verb reads recorded history only. It never runs a gate — Check 1 remains the only sanctioned writer of `gate_outcomes`.

Full body, including the per-reason table: `skills/validate/checks/validate.check-9-transition-gates.md`.

### Check 11: Visual Verification (UI projects)

**Trigger guard (revised by `check-set-restructure.spec.md` Behaviors 5 + 6).** Before running visual verification, evaluate the implementation diff against UI file patterns (`*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss`, `*.html`, files under `components/`, `pages/`, `views/`, `public/`, `app/**/page.*`, `app/**/layout.*`) and check whether the Playwright MCP server (`browser_navigate`, `browser_snapshot`) is available.

The four-case matrix:

| UI files in diff? | Playwright available? | Outcome |
|---|---|---|
| No  | No  | **SKIP** — "No UI files in implementation diff — visual verification not applicable." |
| Yes | No  | **BLOCK** — see message below (preserved from previous behavior). |
| Yes | Yes | Proceed with the visual verification protocol below. |
| No  | Yes | **SKIP** — "Playwright available but nothing to verify for this spec." |

The full guard logic with rationale lives in `skills/validate/checks/validate.check-11-visual-verification.md` (Trigger Guard section).

**BLOCK message** (Case B only):

```
BLOCKED: This implementation includes UI files but no browser verification tool is available.

Install the Playwright MCP server so the agent can visually verify UI work:
  npm install -g @anthropic/mcp-playwright

Then add it to your Claude Code MCP config and restart.

Without visual verification, UI implementations cannot be fully validated.
```

**If Playwright is available AND UI files match (Case C):**

1. **Dev server.** Ensure the dev server is running. If not, start it. Wait for it to be ready.
2. **Visual Expectations check.** If the spec has a `## Visual Expectations` section, verify each expectation:
   - Navigate to the relevant route.
   - Take a browser snapshot.
   - Verify each visual expectation against the snapshot.
   - Record PASS or FAIL per expectation with a description of what was seen.
3. **Responsive check.** Test at three breakpoints:
   - Mobile: 375px width
   - Tablet: 768px width
   - Desktop: 1280px width
   If the spec mentions specific responsive behavior, verify it. Otherwise, verify no layout breakage (overlapping elements, horizontal scroll, invisible content).
4. **Baseline check (no Visual Expectations).** If the spec has no Visual Expectations section, still verify the minimum:
   - Page loads without blank screen or error page.
   - Key elements from acceptance criteria are visible on screen.
   - No console errors (use browser console messages tool if available).
5. **Dark mode.** If the project uses dark mode (check for `dark:` classes in CSS or `darkMode` config), toggle and verify no contrast or visibility issues.

Record per visual expectation: PASS or FAIL with description.
Overall: PASS if all expectations met, FAIL if any expectation fails or if page does not load.

## Per-Check Event Emission

For every surviving check (1, 1.5, 1.6, 2, 4, 8, 9, 11) that produces a verdict, emit a `validator_report` event to the lifecycle log via `adev report --type validator`. This makes the projection's `state.steps.validate` the canonical source of validator outcomes and removes the need to parse the prior `<spec-slug>.validate.md` file when computing aggregate verdict.

```bash
adev report --type validator \
  --spec "<spec-path>" \
  --step validate \
  --validator "validate.check-2-spec-compliance" \
  --verdict PASS \
  [--error "<short summary>"] \
  [--score <number>] \
  [--duration-ms <number>] \
  [--notes "<≤200-char summary>"]
```

Run one invocation per surviving check (1, 1.5, 1.6, 2, 4, 8, 9, 11). `--validator` is a stable identifier that MUST match the `id:` declared in `governance/validate.yaml` (or the domain starter at `templates/domains/<domain>/validate.yaml`). The registry-backed IDs in the bundled software domain are: `validate.check-1-quality-gates`, `validate.check-1.5-source-manifest`, `validate.check-2-spec-compliance`, `validate.check-4-constitution`, `validate.check-8-boundaries`, `validate.check-9-transition-gates`, `validate.check-11-visual-verification`. Use these exact strings — emitting an unprefixed form (e.g., `check-2-spec-compliance`) bypasses `_resolveActorSeverity` lookup and defaults every event to `severity: warning`, suppressing blocker-severity FAILs in the aggregation table.

Check 1's emission additionally carries `--gate-outcomes` and `--manifest-sha` (see Check 1 § Per-Gate Outcome Attestation). **No other check may pass `--gate-outcomes`** — Check 1 is the only sanctioned writer of `gate_outcomes`.

Check 1.6 (code-drift, observational) still has no registry entry — an event emitted with `--validator validate.check-1.6-code-drift` trips the unknown-validator fallback and is stamped `severity: warning`. That is acceptable because the check is advisory and never aggregates into a blocker-severity verdict; if that changes, add an explicit entry to `templates/domains/<domain>/validate.yaml` and to the project's `governance/validate.yaml`.

`--verdict` is one of `PASS`, `PASS_WITH_NOTES`, `FAIL`. Optional fields (`--error`, `--score`, `--duration-ms`, `--notes`) are passed through verbatim to the underlying `reportValidator(projectRoot, specPath, args)` call in `lib/lifecycle-state.mjs`.

Severity is stamped at write time by the lib from `validate.yaml` (each check's `severity:` field, per the single-source model in `validate-config-single-source.spec.md`). Neither the skill prose nor the CLI invocation computes or asserts severity (cross-reference `lifecycle-event-log.spec.md § Severity-resolution helper`).

When aggregating the overall validation verdict, read `state.steps.validate` from `currentState(projectRoot, specPath)` after all `adev report --type validator` invocations have landed. Do NOT re-read or re-parse any prior `<spec-slug>.validate.md` file.

`--notes` and `--error` arguments MUST NOT include API keys, tokens, file contents, or stack traces beyond the immediate error message. The lib caps at 4 KB and truncates with a `NOTES_TRUNCATED` warning; keep operator-facing summaries ≤ 200 characters.

> Authority: `lib/cli/report.mjs` is the canonical implementation per `.context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md` PR 2 (Task 2). Do not re-introduce inline `reportValidator` Node imports here — `tests/skills-no-inline-node.test.mjs` and `hooks/pre-commit-no-inline-node.sh` reject inline-Node patterns.

## Report Format

**Persona adaptation:** The validation report written to disk always uses the full format below. The chat summary presented to the user should follow the active persona's output rules.

**Atomic write protocol (per epic-85 / issue-496):** Write the validation report in two steps so that a session terminated mid-write never leaves a partial `.validate.md` on disk:

1. Use the Write tool to write the full report body to `.context-index/specs/features/<module>/<spec-slug>.validate.md.tmp` (note the `.tmp` suffix).
2. Commit the artifact via the CLI:

```bash
adev artifact commit --spec .context-index/specs/features/<module>/<spec-slug>.spec.md --kind validate
```

**Frontmatter must come first.** The first non-blank line of the report body MUST be the `---` frontmatter delimiter — before any heading or HTML comment. `adev/frontmatter-present` (severity: `error`) rejects a markdown body above the delimiter, and `lib/specify-revise.mjs` cannot parse an artifact whose frontmatter is not first. `adev artifact commit` enforces this and exits non-zero with `ARTIFACT_FRONTMATTER_NOT_FIRST`, leaving the `.tmp` in place for you to fix and re-run.

The verb resolves source (`<spec-path>.validate.md.tmp`) and destination (`<spec-path>.validate.md`) from the spec path, validates that the temp file exists, is non-empty (rejects zero-byte artifacts), and opens with frontmatter, then performs a same-directory `fs.renameSync` — atomic on POSIX. Until the commit step runs, the canonical `.validate.md` either reflects the prior run or is absent; the new content is never partially observable. On any failure the verb exits non-zero with a diagnostic message and the temp file remains for inspection.

**Write-state suffix choice (`.tmp` not `.partial`).** Per the write-state suffix taxonomy invariant in `agent-reliable-state-artifacts/charter.md` (Invariant #10) and `incremental-artifact-writes.spec.md` Integration Point 4, validate keeps the existing `.tmp` (byte-level, ms-scale, never recovered) and does NOT migrate to `.partial` (artifact-level, minutes-to-hours, durable). Rationale: the entire validate report is computed in memory and written in a single Write call — there is no incremental-checkpoint surface for `.partial` to protect. The `.tmp` + `adev artifact commit` idiom is the right tool for byte-level atomicity here; `.partial` is the right tool for skills (like `/adev:plan`, `/adev:specify`, `/adev:implement`) that author across multiple Write calls over minutes.

```markdown
# Validation Report: [Spec Title]

> **Date:** [YYYY-MM-DD]
> **Spec:** [path to Live Spec]
> **Plan:** [path to plan, if provided]
> **Overall Status:** PASS | FAIL

---

## Check 1: Quality Gates — PASS | FAIL
- Tests: PASS | FAIL [command output if failed]
- Lint: PASS | FAIL (auto-fixed) [command output if failed]
- Typecheck: PASS | FAIL [command output if failed]
- [Custom gate]: PASS | FAIL

[If FAIL: "Quality gates failed. Checks 2-13 skipped. Fix the above and re-run /adev:validate."]

## Check 2: Spec Compliance — PASS | FAIL
- [Criterion 1]: PASS | FAIL | PARTIAL
  - [file:line reference and explanation if not PASS]
- [Criterion 2]: PASS
- ...

## Cross-Repo Dependency Validation — PASS | WARN | N/A
- [@repo-slug/spec-slug]: Resolved — interface contracts verified (PASS | FAIL | PARTIAL)
- [@repo-slug/spec-slug]: WARN — reference unresolvable (repo not in workspace)
- N/A — no cross-repo depends-on references

## Check 4: Constitution Compliance — PASS | FAIL
- Architecture boundaries: PASS | FAIL [boundary violated, file:line]
- Non-negotiable principles: PASS | FAIL [principle violated, file:line]
- Coding standards: PASS | FAIL [standard violated, file:line]

## Check 8: Boundary Compliance — PASS | WARN | FAIL | SKIP
- Verdict and reason as returned by `adev boundaries check --json`
- [rule-id]: FAIL | WARN [file:line — message]
- Disabled: [rule-id] — [disabled_reason]  (omit when none)
- Registry warnings: [code] — [message]  (omit when none)
- SKIP means no rules were declared, or all declared rules are disabled — not that boundaries held

## Check 9: Transition Gates — PASS | FAIL | SKIP
- Transition: implement-to-validate
- [gate-id]: pass | blocked [reason: no-recorded-outcome | stale-gate-record | no-manifest-stamp | unattested-gate-record | disabled-gate | unknown-gate]
- [gate-id]: command_attested: false  (when attestation did not hold)

## Check 11: Visual Verification — PASS | FAIL | N/A
- [expectation 1]: PASS | FAIL [what was seen]
- [expectation 2]: PASS | FAIL [what was seen]
- Responsive (375px): PASS | FAIL [details]
- Responsive (768px): PASS | FAIL [details]
- Responsive (1280px): PASS | FAIL [details]
- Dark mode: PASS | FAIL | N/A [details]

---

**Summary:** [N] passed, [N] failed, [N] skipped checks. [If any skipped due to missing configuration: "Run `/adev:init` to configure missing components."]

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
>
> Historic `.validate.md` reports continue to use the pre-restructure numbering; the gaps in the surviving inventory (Checks 1, 1.5, 1.6, 2, 4, optionally 8 and 9) are intentional to preserve report readability.
```

## Overall Status

- **PASS:** All dispatched checks (Check 1 quality gates plus the surviving registry — 1.5, 2, 4, and conditionally 8, 9, 11) passed. The implementation is validated.
- **FAIL:** One or more checks failed. The report lists every failure with file references. The user should fix the issues and re-run `/adev:validate`.

### Heuristics on FAIL: prior occurrences of this failure

When the Overall Status is FAIL you still hold the live verdict payload — the consolidated `checks[]` array carrying each check's `id` and `outcome`. Read the ids from that live payload and from nowhere else: the per-check event log records only `validator` and `verdict`, never a `checks[]` array, so this key cannot be derived from it.

First derive the recurrence key, passing one flag per check whose `outcome` is not `PASS`:

```bash
adev heuristics signature --origin validate --check-id <id> [--check-id <id> ...]
```

Pass the ids exactly as the verdict carries them, in any order, duplicates included. Do not sort, de-duplicate, or concatenate them into `--text` — the verb normalizes them itself, and reshaping them here would mint a different key from the stored one.

Then re-query the store with the key the verb printed:

```bash
adev heuristics retrieve --module <charter-module> --signature <sig> --tier summary --format text
```

Stdout is either rendered markdown blocks or the literal sentinel `__NONE__`. When it is not `__NONE__`, inject the blocks into your FAIL output under the heading `## Heuristics — prior occurrences of this failure`, prefixed with: "The following heuristics are lessons learned from past work in this module. Use them as guidance, not as hard rules."

Derive the module slug from the spec's `charter:` frontmatter field — the same slug Step 0 uses. Do not pass `--injection-limit`: because `--signature` is present the verb applies the error-time cap itself. Do not read a limit out of `manifest.yaml` and do not hardcode one.

Skip this step silently, emitting nothing at all about heuristics, when the output is `__NONE__`, when either verb exits non-zero, or when no check has a non-`PASS` outcome — never invent or synthesize a key when there are no failing ids. The step is advisory only: the FAIL verdict and the report are emitted unchanged either way, and this step never blocks, never retries a check, and never edits the verdict.

### Completion token (`/goal`-friendly)

After the Overall Status is known, the **final line** of your chat output for this run MUST be the completion token — emit it verbatim:

- Overall PASS → `ADEV-VALIDATE: PASS`
- Overall FAIL → `ADEV-VALIDATE: FAIL`

Rules: emit it exactly once, as plain text (no code fence, no backticks, no trailing prose after it), regardless of the active persona or verbosity level. This is a transcript-provable marker so Claude Code's `/goal` evaluator can read completion from the transcript (see `.context-index/specs/cross-cutting/completion-tokens/`). Subagents dispatched by this skill MUST NOT emit a completion-token line — only this top-level skill does.

## Step Z: Emit lifecycle completion event

After the validation report has been written to disk (Step 14 / atomic-write commit), emit the matching exit event paired with Step 0a's `started` emission. The verdict is the aggregate computed from the consolidated check results:

- All dispatched checks PASS → `--verdict PASS`
- At least one check returned PASS_WITH_NOTES, no FAILs → `--verdict PASS_WITH_NOTES`
- Any FAIL → `--verdict FAIL`

```bash
adev report --type step --spec <spec-path> --step validate --status completed --verdict <aggregate> --from-summary
```

This event is REQUIRED. Without it, the lifecycle log shows `lifecycle_step:validate started` with no terminal event, and any future skill that gates on validate completion will block permanently.

## After Validation

> Legal status values are defined in `lib/spec-status.mjs::SPEC_STATUSES`. The
> `adev/status-enum-legal` diagnostic enforces this enum at write time; the
> specific transition this skill drives is `implemented → validated`.

If PASS:

1. Update the spec's status to `validated`:
   - Read the spec file that was validated
   - Parse YAML frontmatter
   - Update status: `implemented` → `validated`
   - Write the spec file back
   - Log: "Updated spec status: implemented → validated"

2. **Update charter Capability Map:** Read the parent charter and update the Capability Map. For each capability covered by this spec, set its `Status` column to `validated`.

3. **Record validation outcome on issue board with confidence:** Read `tasks.backend` from `manifest.yaml`. If configured:
   - Find all issues with `plan-ref` matching the validated spec's plan file.
   - For each issue, run reality-check verification via the CLI (pass the issue JSON object and the desired confidence-note action):
     ```bash
     adev verify issue --issue-json '<issue-object-json>' \
       --note Validated \
       --report-path <validation-report-path> \
       [--files-verified <n>] [--tests-pass <true|false>]
     ```
     The verb wraps `verifyIssueCompleted` + `formatConfidenceNote` and emits JSON `{ completed, confidence, reason, note }`.
   - Update each issue with the confidence-annotated note:
     - PASS + HIGH confidence: `update(id, { status: "closed", notes: "<confidence note>" })`
     - PASS + MEDIUM confidence: `update(id, { notes: "<confidence note>. Manual verification recommended." })`
     - FAIL: `update(id, { notes: "Validated: FAIL (YYYY-MM-DD) — <validation-report-path>" })`
   - Only close issues automatically when confidence is HIGH (files committed, tests pass, spec criteria met). MEDIUM confidence adds a note but does not close.
   If `tasks.backend` is not configured, skip.
   If `adev verify issue` exits non-zero, fall back to the previous behavior (add note without confidence scoring).

4. Read `completion.merge_policy` from manifest.yaml (default: "pr").

If "pr" (or target branch is in `completion.protected_branches`):
```
Validation passed. All dispatched checks green.

The implementation satisfies the spec, stays within charter scope,
respects the constitution, and passes all quality gates.

Ready for PR. Run: gh pr create --base <target-branch>
Do NOT merge directly to protected branches.
```

If "merge" (and target branch is NOT protected):
```
Validation passed. All dispatched checks green.

The implementation satisfies the spec, stays within charter scope,
respects the constitution, and passes all quality gates.

Ready to merge or proceed to the next feature.
```

If "ask":
```
Validation passed. All dispatched checks green.

The implementation satisfies the spec, stays within charter scope,
respects the constitution, and passes all quality gates.

Ready to integrate. Open a PR or merge directly?
```

If FAIL:
```
Validation failed. [N] check(s) need attention.

[List the failed checks with a one-line summary each]

Fix the issues above and re-run: /adev:validate --spec <path>
```

## Red Flags

**Never:**
- Continue to Checks 2-13 if Check 1 (Quality Gates) failed
- Skip any of the dispatched registry checks (except when fail-fast applies to Check 1, or when the `quick` rigor tier is resolved — see Execution Strategy → Resolve Rigor Tier)
- Report PASS when any check has unresolved failures
- Modify implementation code during validation (validation is read-only, except `--fix` for lint/formatting)
- Trust implementer claims without reading the actual code
- Skip specialist review when the scoring algorithm produces matches
- Skip visual verification for UI files when Playwright is not available (block and ask the user to install it — Case B in the Check 11 trigger guard)
- Record SKIP for Check 11 when UI files ARE present (SKIP is only valid when no UI files are touched — Cases A and D)
- Suggest merging to a protected branch (always suggest PR for protected branches)

## API reference

Lifecycle event log:

- `currentState(projectRoot, specPath)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — read the projection. `state.steps.validate` aggregates this skill's per-check results.
- `requireGate(state, "implement", { mode })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — hard-blocks (or warns) when implementation is not complete.
- `resolveGateMode(loadManifest(projectRoot))` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — resolves `manifest.lifecycle.gate_mode`.
- `reportStep(projectRoot, specPath, { step: "validate", status })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — emits skill entry/exit.
- `reportValidator(projectRoot, specPath, { step, validator, verdict, error, score, duration_ms })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — emits one event per check. Severity is stamped at write time.

Rigor tiers:

- `resolveRigorMode({ skill: "validate", riskLevel, policies, tierOverride, routingEasy })` from `<ADEV_ROOT>/lib/governance/rigor-mode.mjs` — resolves `full` | `quick` (Execution Strategy). Precedence: tier override > routing signal > risk policy (`validate_mode`) > `full`.
- `loadRigorPolicies(projectRoot)` from `<ADEV_ROOT>/lib/governance/rigor-mode.mjs` — reads `risk-policies.yaml` `policies` map.

Manifest:

- `loadManifest(projectRoot)` from `<ADEV_ROOT>/lib/manifest.mjs` — parses `.context-index/manifest.yaml`.
