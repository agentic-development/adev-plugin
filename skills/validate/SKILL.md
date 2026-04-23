---
name: adev:validate
description: "Post-implementation validation with 13 ordered checks including lifecycle reconciliation and browser-based visual verification for UI. Fail-fast on quality gates. Structured PASS/FAIL report with file references. Routes domain-specific review to specialists when applicable. Use when the user says 'validate the implementation', 'check if it works', 'run validation', 'verify the feature', or after implementation is complete and needs quality assurance."
---

# Validate Implementation

Run post-implementation validation against specs, constitution, charters, ADRs, quality gates, governance boundaries, and transition gates. Produces a structured report with PASS/FAIL per check and specific file references for every failure.

## Arguments

- `--spec <path>`: validate against a specific Live Spec (required)
- `--plan <path>`: cross-reference the implementation plan (optional, improves traceability)
- `--fix`: attempt to auto-fix minor issues (lint errors, formatting) before reporting

## Prerequisites

Before starting, verify:

1. **Context Index exists.** `.context-index/` must be present with `constitution.md` and `manifest.yaml`.
2. **Spec exists.** The target Live Spec must exist and be readable.
3. **Implementation exists.** The files referenced in the spec or plan must exist. If the spec references files that do not exist, the implementation is incomplete. Report this immediately without running the full check suite.

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

Before running any check, call `loadValidateConfig(repoRoot)` from `lib/governance/validate-config.mjs`. The loader:

- Reads bundled defaults from `templates/validate/defaults.yaml` (12 entries covering Check 1.5 + Checks 2–12). Check 1 is not in this registry; it continues to be sourced from `governance/gates.yaml`.
- Overlays `.context-index/governance/validate.yaml` if present. Matching `id` overrides field-by-field; new `id` appends.
- Validates each entry's `kind` (quality-gate | subagent-review | deterministic-check | observational).
- For `kind: quality-gate`: rejects string-form `command`; rejects any argv token containing `{{...}}`, `$VAR`, `${VAR}`, or `%VAR%` interpolation; requires an explicit `profile` (no implicit default — authors must positively acknowledge that profile permissions scope the adapter's tool surface, NOT the spawned subprocess).
- For `kind: observational`: rejects `severity: error`.
- For `kind: deterministic-check`: rejects project-registered entries (only bundled ids allowed).
- Resolves each check's profile via `lib/profiles/` (MCP-missing fails load; required env missing fails load).
- Topologically sorts by `after` with lex-by-id tie-break; cycles fail load; unknown `after` ids emit WARN.

Abort on any loader error. Warnings surface in the report header.

## Execution Strategy

**Fail-fast on Check 1 (Quality Gates).** If tests, lint, or typecheck fail, skip Checks 2 through 13 and report immediately. There is no value in checking spec compliance on code that does not compile or pass its own tests. The user must fix quality gate failures first and re-run `/adev:validate`. **Exception:** Check 11 (Visual Verification) is triggered independently for UI files. If quality gates fail but the implementation includes UI files, still note that visual verification is pending.

**Checks 2 through 13 run in full regardless of individual failures.** Collect all issues across all checks so the user gets a complete picture in a single validation cycle. Do not stop at the first failure after Check 1.

**Disabled and fail-fast handling:** For every check in the sorted registry:

- If `enabled === false`, record `SKIPPED-DISABLED` with the disabled-note and continue without running. It does not contribute to the verdict.
- Otherwise call `shouldSkipDueToFailFast(check, priorResults)`: if any `after`-predecessor ran with `fail_fast: true` + `severity: error` + `status: FAIL`, record `SKIP` with reason `"Skipped — prerequisite '<id>' failed."` and continue.

**Project quality-gate checks:** invoke `runQualityGate(check, { env, redactor, cwd })` from `lib/governance/quality-gate.mjs`. The runner uses `execFile` with `shell: false`; the subprocess environment consists of the profile-resolved env plus a minimal startup whitelist (`PATH`, `HOME`, `LANG`, `LC_ALL`, `LC_CTYPE`, `TMPDIR`, `USER`, `LOGNAME`). `LD_PRELOAD`, `NODE_OPTIONS`, `PYTHONPATH`, `SSL_CERT_FILE`, and any other invoking-shell var is NOT inherited. stdout/stderr flow through the profile's redactor before report/display/dispatch-record use. Combined output is capped at 64 KiB with a tail-truncation marker.

**Bundled `internal: true` subagent-review checks** (Checks 2–11): continue to execute via the per-check prose below. Each check's section begins with an `enabled` guard — if the registry marked it disabled, the check is skipped without running.

**Check 12 (heuristic extraction) as observational**: never contributes to verdict per Behavior 9.

## The 12 Checks

### Check 1: Quality Gates (fail-fast, tiered)

#### Gate Source Resolution

1. If `governance/gates.yaml` exists → read all gates. Each gate has fields: `id`, `name`, `kind`, `tier`, `command`, `scope`, `required`, `severity`, `triggers`, `group` (e2e-only). Group gates by `tier` into ordered execution: fast → integration → e2e. Execute as sub-checks 1a/1b/1c.
2. If `governance/gates.yaml` does not exist → SKIP Check 1 with advisory: "No governance/gates.yaml found. Quality gates are not configured. Run `/adev:init` to set up gates."

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

1. Call `verifyManifest(specPath)` from `lib/source-manifest.mjs`.
2. For each file in the manifest, compare the recorded SHA against the current `git hash-object` output.
3. Report results:
   - **Match:** All source files are unchanged since implementation. Record PASS.
   - **Drift:** One or more files have been modified since the manifest was stamped. List each drifted file with its expected and actual SHA. Record WARN (does not cause overall FAIL, but signals that source may have diverged from the spec contract).
   - **Missing files:** Source files in the manifest that no longer exist. Record FAIL.

If the spec has no `source-manifest` block, skip this check with a note: "No source manifest found. Run /adev:implement to stamp one."

This check runs after quality gates (Check 1) regardless of their result, since it is a metadata check, not a code quality check.

### Check 2: Spec Compliance

Load the Live Spec and walk through every acceptance criterion.

For each criterion:
1. Identify which files and tests address it.
2. Read the relevant code. Verify the behavior matches the criterion.
3. Check that a test exists for the criterion and that the test actually verifies the described behavior (not a trivial assertion).
4. Verify test integrity: assertions must be strict and match the spec exactly.
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

Record per criterion:
- PASS: code and tests satisfy the criterion.
- FAIL: code does not satisfy the criterion (with file:line references and explanation).
- PARTIAL: code partially satisfies (describe what is missing).

**Cross-repo interface verification (workspace-aware validation mode only):** When workspace-aware validation mode is active and `crossRepoDeps` is non-empty, Check 2 gains an additional sub-step: for each acceptance criterion that references behaviour defined in a cross-repo dependency spec, verify that the implementation respects the interface contracts (API signatures, data shapes, event payloads) described in the dependency spec. Record findings per criterion as PASS / FAIL / PARTIAL with references to both the local code and the cross-repo dependency spec.

### Check 3: Charter Consistency

Load the Feature Charter referenced by the spec. Verify:

- **Scope boundaries.** The implementation does not introduce functionality outside the charter's defined scope. New endpoints, models, or UI components that are not described in the charter's Capability Map are flagged.
- **Domain model alignment.** Entity names, relationships, and boundaries in the code match the charter's Domain Model section.
- **Interface contracts.** API signatures, request/response shapes, and event payloads match the charter's Interface Contracts section (if defined).

Record PASS or FAIL with specific references to charter sections and code locations.

**Cross-repo dependency context (workspace-aware validation mode only):** When workspace-aware validation mode is active, Check 3 includes the cross-repo dependency specs as additional scope context. The validator must verify that the implementation does not assume interfaces or behaviours from sibling repos that are not documented in the dependency specs. Undocumented cross-repo assumptions are flagged as WARN.

### Check 4: Constitution Compliance

Load `.context-index/constitution.md`. Check:

- **Architecture Boundaries.** Verify no boundary was crossed. Common violations: new services or database tables created without approval, authentication flows modified, unauthorized dependencies added.
- **Non-Negotiable Principles.** Verify each principle is respected in the implementation. This is a semantic check: read the code and assess whether the principle's intent is honored.
- **Coding Standards.** Verify naming conventions, pattern usage, and structural conventions match the constitution. This complements the linter (Check 1) with standards that cannot be machine-checked.

Record PASS or FAIL with specific principle/boundary violated and code location.

### Check 5: ADR Compliance

List all ADRs in `.context-index/adrs/`. For each ADR relevant to the implementation's domain:

1. Read the ADR's decision and rationale.
2. Check whether the implementation conflicts with, contradicts, or ignores the decision.
3. If the implementation intentionally deviates from an ADR, flag it. The user must either update the ADR or change the implementation.

If no ADRs exist or none are relevant, record PASS (no applicable ADRs).

### Check 6: Cross-Cutting Spec Compliance

List all specs in `.context-index/specs/cross-cutting/`. For each cross-cutting spec relevant to the implementation:

1. Read the spec's requirements (e.g., error handling conventions, API versioning rules, auth flow requirements).
2. Verify the implementation follows those requirements.

Relevance is determined by the domain: if a cross-cutting spec covers error handling and the implementation includes error handling code, that spec is relevant.

If no cross-cutting specs exist or none are relevant, record PASS (no applicable cross-cutting specs).

### Check 7: Specialist Review

Read the `specialists` registry from `.context-index/manifest.yaml`. Apply the same match scoring algorithm used by `/adev:implement`:

1. Collect all files touched by the implementation (from the plan, or by diffing against the base branch).
2. For each specialist, compute pattern score (2 points per matching glob + depth bonus) and keyword score (1 point per matching keyword in the spec title/description).
3. If any specialist scores above 0, flag the implementation for domain-specific review.

For each matched specialist:
- If `invoke: skill`, note the skill name and recommend the user invoke it for a focused review.
- If `invoke: subagent`, dispatch the specialist as a review subagent with:
  - The specialist's prompt template from `.context-index/specialists/<name>.md`
  - The list of files to review
  - The relevant spec sections
  - Instructions to check domain-specific quality (e.g., accessibility for frontend, injection vectors for security, migration safety for data-engineering)

Record per specialist: PASS, FAIL (with specific findings), or SKIPPED (no specialist matched).

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

### Check 10: Platform Drift

Compare `.context-index/platform-context.yaml` tech stack declarations against `package.json` dependencies. Catches cases where the declared stack no longer matches what is actually installed.

**If `platform-context.yaml` does not exist:** SKIP (no platform context configured).
**If `package.json` does not exist:** SKIP (not a Node.js project; platform drift check is not applicable).

**Mapping rules:**

For each field in `platform-context.yaml`, check the corresponding package in `package.json` (dependencies + devDependencies):

| platform-context field | Expected package(s) | Example |
|----------------------|---------------------|---------|
| `framework` | Framework package present (`next`, `nuxt`, `astro`, `svelte`, etc.) | `framework: nextjs` → `next` in dependencies |
| `version` | Framework package version satisfies declared version | `version: "16"` → `next` version starts with `16.x` |
| `language` | If `typescript`, `typescript` in devDependencies | `language: typescript` → `typescript` present |
| `orm` | ORM package present (`prisma`, `drizzle-orm`, `typeorm`, `@mikro-orm/core`, etc.) | `orm: prisma` → `prisma` or `@prisma/client` present |
| `auth` | Auth package present (`@clerk/nextjs`, `next-auth`, `@auth0/nextjs-auth0`, etc.) | `auth: clerk` → `@clerk/nextjs` present |
| `database` | DB driver or client present if applicable | `database: postgresql` → pg-related package or ORM handles it |
| `testing` | Test framework present | `testing: vitest` → `vitest` in devDependencies |

**Unknown fields or values:** If a `platform-context.yaml` field has a value the mapping does not recognize, log it as INFO (not a failure). The mapping is best-effort.

**Version check:** Only performed for `framework` + `version`. Uses semver-compatible prefix matching (e.g., declared `"16"` matches installed `16.1.2`). If the major version does not match, flag as FAIL.

Record per field: PASS (matches), FAIL (mismatch with details), WARN (could not verify), or SKIP (field not declared).

### Check 11: Visual Verification (UI projects)

**Trigger:** If any file touched by the implementation matches UI patterns (`*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss`, `components/**`, `app/**/page.*`, `app/**/layout.*`, `pages/**`).

**Playwright MCP required.** Check for the Playwright MCP browser tools (`browser_navigate`, `browser_snapshot`). If they are not available, **BLOCK validation** and tell the user:

```
BLOCKED: This implementation includes UI files but no browser verification tool is available.

Install the Playwright MCP server so the agent can visually verify UI work:
  npm install -g @anthropic/mcp-playwright

Then add it to your Claude Code MCP config and restart.

Without visual verification, UI implementations cannot be fully validated.
```

Do not record SKIP. Do not proceed without it. UI code without visual verification is unvalidated code.

**If Playwright is available:**

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

### Check 12: Lifecycle Reconciliation

Verify that lifecycle artifacts (issues, epics, spec status, charter capability map) are consistent with the implementation state. This check catches the drift that accumulates when implementation completes but bookkeeping is skipped.

**If `tasks.backend` is not configured in `manifest.yaml`:** SKIP checks 12a–12c with note: "No task backend configured."

#### 12a. Issue Status Alignment

Find all issues with `plan-ref` matching the current spec's plan file.

For each issue:
1. Read the issue status.
2. If the issue is still `open` or `in-progress` but all its plan tasks are implemented and tests pass → flag as WARN: "Issue `<id>` (`<title>`) is still `<status>` but implementation is complete."
3. **`--fix` behavior:** Update the issue status to `closed` with note `"Auto-closed by validation: implementation complete and tests pass."`

#### 12b. Epic Completion

Find the epic associated with the current spec's plan (via `epicRef` on child issues or plan frontmatter).

If an epic is found:
1. Count total child issues vs closed child issues.
2. If ALL child issues are closed (or will be closed by 12a fix) but the epic is still `open` → flag as WARN: "Epic `<id>` (`<title>`) has all children closed but is still open."
3. **`--fix` behavior:** Update epic status to `closed`.

If no epic is found, record PASS (no epic to reconcile).

#### 12c. Spec Status Consistency

Read the current spec's `status` frontmatter field.

1. If the spec status is `implemented` but all checks 1–11 passed → this is expected (validation will update it to `validated` in the "After Validation" step). Record PASS.
2. If the spec status is `draft` or `review-pending` → flag as WARN: "Spec status is `<status>` but implementation exists and passes validation. Status may not have been updated after implementation."
3. **`--fix` behavior:** Update spec status to `implemented` (the "After Validation" step will then promote to `validated`).

#### 12d. Charter Capability Map Sync

Read the parent charter's Capability Map. For each capability covered by this spec:

1. Check the `Status` column value.
2. If the capability status is `planned` or `in-progress` but the spec is validated → flag as WARN: "Charter capability `<name>` is `<status>` but spec is validated."
3. **`--fix` behavior:** Update the capability status to `validated`.

If no charter is referenced in the spec's frontmatter, SKIP with note: "No charter reference found."

**Output format:**
```
## Check 12: Lifecycle Reconciliation — PASS | WARN | SKIP
- Issue alignment: PASS | WARN [N issues still open]
- Epic completion: PASS | WARN [epic still open] | N/A
- Spec status: PASS | WARN [status is <current>]
- Charter sync: PASS | WARN [N capabilities stale] | SKIP
```

**This check uses WARN severity, not FAIL.** Lifecycle drift does not invalidate the implementation — the code is correct. But warnings are prominently displayed so the user knows to run `/adev:reconcile` or apply `--fix` for automatic cleanup.

### Check 13: Success Heuristic Extraction

#### Overview

On first-run PASS (all checks 1-12 passed with no FAIL results, and no prior validation report exists), extract a positive pattern heuristic at `medium` confidence via `lib/heuristics.mjs`. This check is observational — it never blocks the overall validation result.

#### Spec-Slug Derivation Rule

1. Take the target spec's absolute path.
2. Compute `path.basename(path, '.md')` to get the filename stem.
3. Lowercase and replace any non-alphanumeric characters with `-`.
4. Collapse consecutive `-` characters; strip leading/trailing `-`.

This rule is used consistently in (a) First-Run Detection, (b) id generation, and (c) report output.

#### First-Run Detection Rule

A validation is "first run" if and only if no file matching `<spec-slug>-validation.md` exists in the same directory as the target spec. Explicit deletion followed by re-validation IS treated as a first run (intentional: deletion signals the user wants to re-extract).

#### Scope Derivation Rule

1. Read the `charter:` field from the target spec's YAML frontmatter.
2. Apply `path.basename()` to strip any traversal sequences.
3. Check the result against `manifest.yaml modules[].slug`.
4. If matched, use it as `scope`.
5. Otherwise, fall back to `_global`.

#### Title Derivation Rule

Format: `"First-run PASS: <spec-title>"` where:

- `<spec-title>` is the first-level heading (`# ...`) from the target spec file, with any leading `Live Spec: ` prefix removed.
- If no heading exists, fall back to the spec-slug.
- Cap at 120 chars total; if longer, truncate the title to 117 chars + `"..."`.

#### ID Derivation Rule

Format: `<spec-slug>-<hash>` where:

- `<spec-slug>` is per the Spec-Slug Derivation Rule.
- `<hash>` is 8 chars of lowercase hex SHA-256 of: `<lowercased-normalized-absolute-path>` + `"|"` + `<pattern-text>`.
- Absolute path separators are normalized to `/` before lowercasing.
- Including the path prevents id collisions between specs with identical titles.
- Worked example: spec at `/project/.context-index/specs/features/hooks/foo.md` with pattern `X` → hash input is `/project/.context-index/specs/features/hooks/foo.md|X`.
- For pathological filenames that would produce an empty spec-slug, Check 13 falls back to SKIP with note `"invalid spec slug"`.

#### projectRoot Resolution

Walk up from `process.cwd()` to find the nearest `.context-index/` directory. Fallback to `process.env.CLAUDE_PROJECT_ROOT`. Matches the convention in `lib/execution-state.mjs` and `/adev:recover` Step 7.

#### Success Factor Derivation

Priority order, first match wins:

1. A **golden sample** referenced in the implementation's context packet → pattern describes the sample's role.
2. An **ADR** referenced in the context packet → pattern describes the ADR's decision application.
3. A **cross-cutting spec** or context packet noted as a pre-condition → pattern describes the structural/behavioral lesson.
4. **Default**: `"First-run PASS for <spec-title>: implementation matched all acceptance criteria without revision"`.

> **Distillation rule:** the pattern must describe the structural or behavioral lesson, NOT verbatim-copy packet content. Avoid preserving environment-specific paths, file names, credentials, or embedded configuration.

`antiPattern` is ALWAYS empty for success heuristics (success describes what to do, not what to avoid).

#### Confidence Rationale

Initial `confidence: medium` is used (a stronger signal than `/adev:recover`'s `low`) because first-run PASS validates all 12 checks at once. The helper's absolute-threshold auto-promotion will raise the entry to `high` at the 3rd distinct-path evidence entry — print whatever confidence the helper returns from the write call, not the caller-supplied input.

#### Contradiction Scan (before write)

Before writing the new heuristic, scan for semantic contradictions with existing heuristics:

1. Read existing heuristics for the target scope: call `readHeuristics(projectRoot, { module: scope })` via inline Node.js (importing from `<ADEV_ROOT>/lib/heuristics.mjs`, where `<ADEV_ROOT>` is the resolved plugin root).
2. For each existing entry, compare semantically: does the new heuristic's `pattern` directly conflict with an existing entry's `antiPattern`, or does the new heuristic's `antiPattern` conflict with an existing entry's `pattern`?
3. If a semantic contradiction is detected, call `addContradiction(projectRoot, existingId, { path: '<validation-report-path>', date: '<today>', source: 'validation' })` before writing the new heuristic. Wrap in try/catch — if `addContradiction` throws (e.g., `HEURISTICS_NOT_FOUND` because the entry was archived between read and write), log a warning and proceed.
4. If no contradiction is detected, proceed directly to writeHeuristic.

This is a best-effort semantic comparison performed by you (the agent), not a programmatic string match. When in doubt, do not record a contradiction — `/adev:retro` consolidation is the backstop for missed contradictions.

#### Inline Node Invocation

Run the extraction via an inline Node invocation that resolves `projectRoot`, imports `writeHeuristic` from the adev plugin's `lib/heuristics.mjs`, builds the entry using the derivation rules above, and wraps the call in `try`/`catch` so any failure degrades to a SKIP without affecting the overall PASS/FAIL. The process always exits with code 0. The `evidence[]` array must contain exactly one entry: `{ source: "validation", path: "<validation-report-path>", date: "<today>" }`. Initial `confidence: "medium"` is caller-supplied; the final confidence in the printed output must come from the `writeHeuristic` return value (which may auto-promote).

**Plugin root resolution:** The `lib/` directory lives at the adev plugin root, NOT the project root. Derive the plugin root from this skill file's base directory by stripping the `skills/<name>/` suffix. For example, if this skill's base directory is `/path/to/adev/0.10.0/skills/validate`, the plugin root is `/path/to/adev/0.10.0`. Use the absolute path in the import.

On import failure: SKIP with reason `"helper unavailable"`.
On `HEURISTICS_SCHEMA_ERROR` or any thrown error: SKIP with the error message.

Concrete invocation (replace `<ADEV_ROOT>` with the resolved absolute plugin root path):

```bash
node --input-type=module -e "
try {
  const { writeHeuristic } = await import('<ADEV_ROOT>/lib/heuristics.mjs');
  try {
    const h = await writeHeuristic(projectRoot, {
      id: 'foo-spec-a1b2c3d4',
      scope: 'hooks',
      title: 'First-run PASS: Foo Spec',
      pattern: 'First-run PASS for Foo Spec: implementation matched all acceptance criteria without revision',
      antiPattern: '',
      confidence: 'medium',
      evidence: [{ path: '.context-index/specs/features/hooks/foo-spec-validation.md', date: '2026-04-09', source: 'validation' }],
    });
    console.log(\`Check 13: Success Heuristic Extracted — \${h.id} (scope: \${h.scope}, confidence: \${h.confidence})\`);
  } catch (err) {
    console.log(\`Check 13: SKIP — \${err.message}\`);
  }
} catch (err) {
  console.log('Check 13: SKIP — helper unavailable');
}
"
```

#### SKIP Semantics

Explicit list of SKIP reasons:

- `"not first-run PASS"` — prior `<spec-slug>-validation.md` exists.
- `"non-PASS result"` — any of checks 1-12 FAILed.
- `"helper unavailable"` — `lib/heuristics.mjs` import failed.
- `"no charter scope"` — target spec has no `charter:` frontmatter field.
- `"no report path"` — validation report path cannot be resolved.
- `"invalid spec slug"` — spec filename produced empty slug.
- `<HEURISTICS_SCHEMA_ERROR message>` — `writeHeuristic` validation failed.

**Check 13 never changes the overall validation result.** SKIP is informational.

#### Final Confirmation

On success, Check 13 prints exactly: `Check 13: Success Heuristic Extracted — <id> (scope: <scope>, confidence: medium)` — or whatever confidence the helper returns after auto-promotion, since the confidence value must come from the `writeHeuristic` return value rather than the caller-supplied input.

## Report Format

Write the validation report to `.context-index/specs/features/<module>/<spec-slug>-validation.md`.

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

## Check 3: Charter Consistency — PASS | FAIL
- Scope: PASS | FAIL [details]
- Domain model: PASS | FAIL [details]
- Interface contracts: PASS | FAIL [details]

## Cross-Repo Dependency Validation — PASS | WARN | N/A
- [@repo-slug/spec-slug]: Resolved — interface contracts verified (PASS | FAIL | PARTIAL)
- [@repo-slug/spec-slug]: WARN — reference unresolvable (repo not in workspace)
- N/A — no cross-repo depends-on references

## Check 4: Constitution Compliance — PASS | FAIL
- Architecture boundaries: PASS | FAIL [boundary violated, file:line]
- Non-negotiable principles: PASS | FAIL [principle violated, file:line]
- Coding standards: PASS | FAIL [standard violated, file:line]

## Check 5: ADR Compliance — PASS | FAIL | N/A
- [ADR-001]: PASS | FAIL [conflict description]
- ...

## Check 6: Cross-Cutting Specs — PASS | FAIL | N/A
- [error-handling.md]: PASS | FAIL [details]
- ...

## Check 7: Specialist Review — PASS | FAIL | SKIPPED
- [frontend-design]: PASS | FAIL [findings]
- [security]: PASS | FAIL [findings]
- ...

## Check 8: Boundary Compliance — PASS | FAIL | N/A
- [boundary-id]: PASS | FAIL | WARN [details]
- ...

## Check 9: Transition Gates — PASS | FAIL | N/A
- [transition-id]: PASS | FAIL [details]
- ...

## Check 10: Platform Drift — PASS | FAIL | SKIP
- framework: PASS | FAIL [declared: X, found: Y]
- version: PASS | FAIL [declared: X, installed: Y]
- language: PASS | FAIL [details]
- orm: PASS | FAIL [declared: X, not found in package.json]
- auth: PASS | FAIL [details]
- ...

## Check 11: Visual Verification — PASS | FAIL | N/A
- [expectation 1]: PASS | FAIL [what was seen]
- [expectation 2]: PASS | FAIL [what was seen]
- Responsive (375px): PASS | FAIL [details]
- Responsive (768px): PASS | FAIL [details]
- Responsive (1280px): PASS | FAIL [details]
- Dark mode: PASS | FAIL | N/A [details]

## Check 12: Lifecycle Reconciliation — PASS | WARN | SKIP
- Issue alignment: PASS | WARN [N issues still open]
- Epic completion: PASS | WARN [epic still open] | N/A
- Spec status: PASS | WARN [status is <current>]
- Charter sync: PASS | WARN [N capabilities stale] | SKIP

## Check 13: Success Heuristic Extraction — PASS | SKIP
- [PASS case] Heuristic extracted: <id> (scope: <scope>, confidence: medium)
- [SKIP case] SKIP: <reason> (e.g., "not first-run PASS", "non-PASS result", "helper unavailable", "no charter scope", "no report path", "invalid spec slug", "<HEURISTICS_SCHEMA_ERROR message>")

---

**Summary:** [N] passed, [N] failed, [N] skipped checks. [If any skipped due to missing configuration: "Run `/adev:init` to configure missing components."]
```

## Overall Status

- **PASS:** All 13 checks passed (WARN-only in Check 12 counts as PASS). The implementation is validated.
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

3. **Record validation outcome on issue board:** Read `tasks.backend` from `manifest.yaml`. If configured:
   - Find all issues with `plan-ref` matching the validated spec's plan file.
   - For each issue, add a note with the validation result:
     - PASS: `update(id, { notes: "Validated: PASS (YYYY-MM-DD) — <validation-report-path>" })`
     - FAIL: `update(id, { notes: "Validated: FAIL (YYYY-MM-DD) — <validation-report-path>" })`
   - Do not change issue status based on validation outcome.
   If `tasks.backend` is not configured, skip.

4. Read `completion.merge_policy` from manifest.yaml (default: "pr").

If "pr" (or target branch is in `completion.protected_branches`):
```
Validation passed. All 13 checks green.

The implementation satisfies the spec, stays within charter scope,
respects the constitution, and passes all quality gates.

Ready for PR. Run: gh pr create --base <target-branch>
Do NOT merge directly to protected branches.
```

If "merge" (and target branch is NOT protected):
```
Validation passed. All 13 checks green.

The implementation satisfies the spec, stays within charter scope,
respects the constitution, and passes all quality gates.

Ready to merge or proceed to the next feature.
```

If "ask":
```
Validation passed. All 13 checks green.

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
- Skip any of the 13 checks (except when fail-fast applies to Check 1)
- Report PASS when any check has unresolved failures
- Modify implementation code during validation (validation is read-only, except `--fix` for lint/formatting)
- Trust implementer claims without reading the actual code
- Skip specialist review when the scoring algorithm produces matches
- Skip visual verification for UI files when Playwright is not available (block and ask the user to install it)
- Record SKIP for Check 11 when UI files are present (N/A is only valid when no UI files are touched)
- Suggest merging to a protected branch (always suggest PR for protected branches)
