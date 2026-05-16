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

## Prerequisites

Before starting, verify:

1. **Context Index exists.** `.context-index/` must be present with `constitution.md` and `manifest.yaml`.
2. **Spec exists.** The target Live Spec must exist and be readable.
3. **Implementation exists.** The files referenced in the spec or plan must exist. If the spec references files that do not exist, the implementation is incomplete. Report this immediately without running the full check suite.

### Step 0a: Implement-step gate (FIRST action)

Before any validation work, gate on the prior step via the lifecycle log:

```javascript
import { currentState, requireGate, resolveGateMode, reportStep } from '<ADEV_ROOT>/lib/lifecycle-state.mjs';
import { loadManifest } from '<ADEV_ROOT>/lib/manifest.mjs';

const state = currentState(projectRoot, specPath);
const mode = resolveGateMode(loadManifest(projectRoot));
requireGate(state, "validate", { mode });
reportStep(projectRoot, specPath, { step: "validate", status: "started" });
```

`requireGate(state, "validate", ...)` follows the lib contract: pass the step about to begin; the lib resolves its prior (`implement`) and asserts that step is completed with a passing verdict. In strict mode (default), it throws `GateError` when implement is incomplete. In advisory mode, it warns and continues. Do NOT catch `GateError`. The lib enforces path-containment (`INVALID_PROJECT_ROOT` / `INVALID_SPEC_PATH`); skill prose MUST NOT pre-validate paths.

Emit a matching `reportStep` exit (`status: "completed"`, including the aggregate verdict) after the report is written in Step 14.

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

**Invocation:** Run inline Node.js:

```bash
node --input-type=module -e "
import { runPreflight, formatPreflightReport } from '<ADEV_ROOT>/lib/infra-preflight.mjs';
const report = await runPreflight('<specPath>', '<planPath>', { timeout: <timeout>, noInfra: <noInfra> });
console.log(JSON.stringify(report));
"
```

Where `<specPath>` is the `--spec` argument and `<planPath>` is the `--plan` argument (or `null` if not provided).

If `report.passed === false`, display the formatted report and block:

```
Execution blocked. Options:
  1. Fix the issues above and retry
  2. Re-run with --no-infra to bypass (user decision only)
```

If `report.passed === true` and `report.skipped === true`, emit: "Infrastructure preflight skipped (--no-infra)."

If `lib/infra-preflight.mjs` fails to import, block with: "Infrastructure preflight library could not be loaded: <error>. Fix the library before proceeding."

## Step 0: Load Check Registry

**Heuristics:** Before loading the check registry, load module-scoped heuristics for the spec's charter module.
Derive the module slug from the spec's `charter:` frontmatter field.
**Plugin root resolution:** Derive the plugin root from this skill file's base directory by stripping the `skills/<name>/` suffix. Replace `<ADEV_ROOT>` with the resolved path.
Run inline Node.js:
```javascript
const { retrieveHeuristics, renderHeuristic } = await import('<ADEV_ROOT>/lib/heuristics.mjs');
const entries = await retrieveHeuristics(projectRoot, charterModule, { tier: 'summary' });
const rendered = entries.map(renderHeuristic).join('\n\n');
```
If the call fails or returns empty, proceed without heuristics — non-blocking.
When heuristics are present, include them in the validation context so checks can reference learned patterns.
Prepend: "The following heuristics are lessons learned from past work in this module. Use them as guidance, not as hard rules."

**Domain-Aware Gate Loading:** Resolve the active domain and load domain-specific gates before running checks. Run inline Node.js:
```javascript
const { resolveDomain } = await import('<ADEV_ROOT>/lib/domains/resolve.mjs');
const { loadDomainConfig } = await import('<ADEV_ROOT>/lib/domains/domain-config.mjs');
const { mergeGates } = await import('<ADEV_ROOT>/lib/domains/merge-gates.mjs');
const domain = resolveDomain(manifest, charterFrontmatter, moduleSlug);
const domainOverlay = loadDomainConfig(domain.resolved_domain, 'gates', repoRoot, pluginRoot);
// Read governance gates
const govGatesPath = join(repoRoot, '.context-index', 'governance', 'gates.yaml');
const govGates = existsSync(govGatesPath) ? parseYaml(readFileSync(govGatesPath, 'utf8')) : null;
// Merge domain + governance gates (governance wins on id conflict)
const { gates: mergedGates, warnings: gateWarnings } = mergeGates(domainOverlay, govGates);
// Gate commands execute via execFile (no shell interpolation)
```
Log any warnings from the merge process. The `mergedGates` list is the resolved gate set for Check 1. When Check 1 resolves gates, use this merged list instead of reading `governance/gates.yaml` directly — domain gates are already merged in.

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

Abort on any loader error. Warnings surface in the report header. Check 1 (quality gates) is not in this registry; it continues to be sourced from `governance/gates.yaml`.

## Execution Strategy

**Fail-fast on Check 1 (Quality Gates).** If tests, lint, or typecheck fail, skip Checks 2 through 13 and report immediately. There is no value in checking spec compliance on code that does not compile or pass its own tests. The user must fix quality gate failures first and re-run `/adev:validate`. **Exception:** Check 11 (Visual Verification) is triggered independently for UI files. If quality gates fail but the implementation includes UI files, still note that visual verification is pending.

**Checks 2 through 13 run in full regardless of individual failures.** Collect all issues across all checks so the user gets a complete picture in a single validation cycle. Do not stop at the first failure after Check 1.

**Disabled and fail-fast handling:** For every check in the sorted registry:

- If `enabled === false`, record `SKIPPED-DISABLED` with the disabled-note and continue without running. It does not contribute to the verdict.
- Otherwise call `shouldSkipDueToFailFast(check, priorResults)`: if any `after`-predecessor ran with `fail_fast: true` + `severity: error` + `status: FAIL`, record `SKIP` with reason `"Skipped — prerequisite '<id>' failed."` and continue.

**Project quality-gate checks:** invoke `runQualityGate(check, { env, redactor, cwd })` from `lib/governance/quality-gate.mjs`. The runner uses `execFile` with `shell: false`; the subprocess environment consists of the profile-resolved env plus a minimal startup whitelist (`PATH`, `HOME`, `LANG`, `LC_ALL`, `LC_CTYPE`, `TMPDIR`, `USER`, `LOGNAME`). `LD_PRELOAD`, `NODE_OPTIONS`, `PYTHONPATH`, `SSL_CERT_FILE`, and any other invoking-shell var is NOT inherited. stdout/stderr flow through the profile's redactor before report/display/dispatch-record use. Combined output is capped at 64 KiB with a tail-truncation marker.

**Subagent-review checks** (Checks 2–11): dispatch the subagent with the prompt body loaded from each check's `resolvedPromptPath` (resolved at registry-load time from the `plugin:validate/checks/<id>.md` URI). Each check's section begins with an `enabled` guard — if the registry marked it disabled, the check is skipped without running.

**Check 12 (heuristic extraction) as observational**: never contributes to verdict per Behavior 9.

## The 12 Checks

> **Source of truth for per-check prompts:** As of `validate-config-single-source.spec.md`, the substantive prompt body for each subagent-review / deterministic-check / observational check lives in `skills/validate/checks/<id>.md`, referenced from the registry via the `plugin:validate/checks/<id>.md` URI. The sections below describe each check's purpose, orchestration semantics, and execution guards. The dispatch loop reads the prompt from the registry entry's `resolvedPromptPath`, not from the prose in this file. When the two diverge, the externalized file wins.

### Check 1: Quality Gates (fail-fast, tiered)

#### Gate Source Resolution

1. Use the `mergedGates` list computed in Step 0 (domain gates merged with governance gates). If the merged list is non-empty, group gates by `tier` into ordered execution: fast → integration → e2e. Execute as sub-checks 1a/1b/1c. Each gate has fields: `id`, `name`, `kind`, `tier`, `command`, `scope`, `required`, `severity`, `triggers`, `group` (e2e-only).
2. If the merged gate list is empty and `governance/gates.yaml` does not exist → SKIP Check 1 with advisory: "No governance/gates.yaml found and no domain gates configured. Quality gates are not configured. Run `/adev:init` to set up gates."

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

### Check 1.5: Source Manifest Verification

If the spec's frontmatter contains a `source-manifest` block (stamped by `/adev:implement`), verify it:

1. Parse the `source-manifest` block from the spec's frontmatter. The block is an object with fields `sha`, `files`, and `computedAt`.
2. Call `verifyManifest(manifest, projectRoot)` from `lib/source-manifest.mjs`, passing the parsed manifest object and the project root path (NOT the spec file path). The function returns `{ matches: bool, currentSha: string|null, missingFiles?: string[] }`. SHA comparison uses SHA-256 of file contents.
3. **Implementation existence check:** For each file in the manifest, verify it has been committed to git (`git log --oneline -1 -- <file>`). If a file exists on disk but has NEVER been committed (untracked or only staged), it was not implemented through the normal workflow — record FAIL with: "Source file `<file>` exists but was never committed. Implementation may be incomplete or was not committed."
4. Report results:
   - **Match:** All source files are unchanged since implementation AND all files are git-tracked. Record PASS.
   - **Drift:** One or more files have been modified since the manifest was stamped. List each drifted file with its expected and actual SHA. Record WARN (does not cause overall FAIL, but signals that source may have diverged from the spec contract).
   - **Missing files:** Source files in the manifest that no longer exist on disk. Record FAIL.
   - **Untracked files:** Source files exist but were never committed. Record FAIL (implementation incomplete).

If the spec has no `source-manifest` block, skip this check with a note: "No source manifest found. Run /adev:implement to stamp one."

This check runs after quality gates (Check 1) regardless of their result, since it is a metadata check, not a code quality check.

### Check 1.6: Code-Side Drift Warning

Check for code-side drift via the `drift_detected` frontmatter flag. This check is **non-blocking** -- validation continues regardless of result.

Run inline Node.js:
```javascript
const { hasDrift } = await import('<ADEV_ROOT>/lib/spec-drift.mjs');
try {
  const drifted = await hasDrift(specPath);
  if (drifted) {
    // Read drift_source and drift_at from frontmatter
    // Emit: "WARN: drift_detected flag set. Source file <drift_source>
    // was modified at <drift_at>. Verify that spec still reflects
    // implementation behavior."
  }
} catch {
  // Emit: "WARN: drift check skipped — frontmatter unreadable"
  // Record CODE_DRIFT_READ_ERROR
}
```

Also run `verifyManifest()` as a fallback for non-Claude-Code hosts where the hook never fired. If SHA mismatches, emit the same warning.

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

If the `governance/` directory does not exist → SKIP: "No governance directory configured."

If `governance/` exists but `.context-index/governance/boundaries.yaml` is missing → PASS (no rules configured).

If `governance/boundaries.yaml` exists, collect all files changed. For each boundary rule:

1. Run regex `pattern` against file contents, respecting `exclude` globs.
2. `severity: error` → FAIL
3. `severity: warning` → WARN (does not cause overall FAIL)
4. Apply charter-specific overrides from `governance/overrides/<slug>.yaml` if present.

### Check 9: Transition Gates

If `governance/gates.yaml` defines `implement-to-validate` or `implement-to-merge` transition:

1. Verify each `required_gates` was run and passed in Check 1.
2. If a required gate was skipped (probabilistic/no command) → log "manual verification required."
3. Note `approver_role` if present (informational).
4. If no transitions configured in `governance/gates.yaml` (or `governance/` absent) → SKIP: "No transitions configured."

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

For every check (1 through 13) that produces a verdict, emit a `validator_report` event to the lifecycle log. This makes the projection's `state.steps.validate` the canonical source of validator outcomes and removes the need to parse the prior `<spec-slug>.validate.md` file when computing aggregate verdict.

```javascript
import { reportValidator } from '<ADEV_ROOT>/lib/lifecycle-state.mjs';
reportValidator(projectRoot, specPath, {
  step: "validate",
  validator: "check-2-spec-compliance",  // a stable identifier per check
  verdict: "PASS",                       // PASS | PASS_WITH_NOTES | FAIL
  error: null,                           // short error summary on FAIL (≤200 chars)
  score: null,                           // optional numeric score
  duration_ms: 1234,
});
```

Severity is stamped at write time by the lib from `gates.yaml` domain config — skill prose does NOT compute or assert severity (cross-reference `lifecycle-event-log.spec.md § Severity-resolution helper`).

When aggregating the overall validation verdict, read `state.steps.validate` from `currentState(projectRoot, specPath)` after all `reportValidator` calls have landed. Do NOT re-read or re-parse any prior `<spec-slug>.validate.md` file.

`notes` and `error` arguments MUST NOT include API keys, tokens, file contents, or stack traces beyond the immediate error message. The lib caps at 4 KB and truncates with a `NOTES_TRUNCATED` warning; keep operator-facing summaries ≤ 200 characters.

## Report Format

**Persona adaptation:** The validation report written to disk always uses the full format below. The chat summary presented to the user should follow the active persona's output rules.

Write the validation report to `.context-index/specs/features/<module>/<spec-slug>.validate.md`.

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

## Check 8: Boundary Compliance — PASS | FAIL | N/A
- [boundary-id]: PASS | FAIL | WARN [details]
- ...

## Check 9: Transition Gates — PASS | FAIL | N/A
- [transition-id]: PASS | FAIL [details]
- ...

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

## After Validation

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
   - For each issue, run reality-check verification via inline Node.js:
     ```bash
     node --input-type=module -e "
     import { verifyIssueCompleted, formatConfidenceNote } from '<ADEV_ROOT>/lib/reality-check.mjs';
     const result = verifyIssueCompleted(issue, { projectRoot });
     const note = formatConfidenceNote('Validated', result.confidence, { reportPath, filesVerified, testsPass });
     console.log(JSON.stringify({ ...result, note }));
     "
     ```
   - Update each issue with the confidence-annotated note:
     - PASS + HIGH confidence: `update(id, { status: "closed", notes: "<confidence note>" })`
     - PASS + MEDIUM confidence: `update(id, { notes: "<confidence note>. Manual verification recommended." })`
     - FAIL: `update(id, { notes: "Validated: FAIL (YYYY-MM-DD) — <validation-report-path>" })`
   - Only close issues automatically when confidence is HIGH (files committed, tests pass, spec criteria met). MEDIUM confidence adds a note but does not close.
   If `tasks.backend` is not configured, skip.
   If `lib/reality-check.mjs` fails to import, fall back to the previous behavior (add note without confidence scoring).

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
- Skip any of the dispatched registry checks (except when fail-fast applies to Check 1)
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

Manifest:

- `loadManifest(projectRoot)` from `<ADEV_ROOT>/lib/manifest.mjs` — parses `.context-index/manifest.yaml`.
