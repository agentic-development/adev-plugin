---
name: adev-validate
description: Post-implementation validation with 10 ordered checks. Fail-fast on quality gates. Structured PASS/FAIL report with file references. Routes domain-specific review to specialists when applicable.
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

## Execution Strategy

**Fail-fast on Check 1 (Quality Gates).** If tests, lint, or typecheck fail, skip Checks 2 through 10 and report immediately. There is no value in checking spec compliance on code that does not compile or pass its own tests. The user must fix quality gate failures first and re-run `/adev-validate`.

**Checks 2 through 10 run in full regardless of individual failures.** Collect all issues across all checks so the user gets a complete picture in a single validation cycle. Do not stop at the first failure after Check 1.

## The 10 Checks

### Check 1: Quality Gates (fail-fast)

Gate source resolution order:
1. If `.context-index/governance/gates.yaml` exists → primary source
   - Run gates where `kind: deterministic` and `command` is non-empty
   - `kind: probabilistic` → skip with note
   - No `command` → skip with note
   - Record `required` flag (non-required failures = warnings, not failures)
2. If governance does not exist → fall back to constitution Quality Gates (existing behavior)
3. Also check manifest.yaml `gates:` as secondary fallback

Typical commands:
- Test suite: the `[test command]` from the constitution
- Linter: the `[lint command]` from the constitution
- Type checker: the `[type check command]` from the constitution
- Any custom gates the project defines

**If `--fix` was passed:** Before reporting failures, attempt auto-fix for lint and formatting errors (e.g., `npx eslint --fix`, `npx prettier --write`). Re-run the failing gate after the fix. If it passes now, record it as PASS (auto-fixed). If it still fails, record it as FAIL.

**If any gate fails (after auto-fix attempt if applicable):** Report the failures with the exact command output. Skip Checks 2 through 10. The report's overall status is FAIL.

**If all gates pass:** Proceed to Check 2.

### Check 2: Spec Compliance

Load the Live Spec and walk through every acceptance criterion.

For each criterion:
1. Identify which files and tests address it.
2. Read the relevant code. Verify the behavior matches the criterion.
3. Check that a test exists for the criterion and that the test actually verifies the described behavior (not a trivial assertion).

Record per criterion:
- PASS: code and tests satisfy the criterion.
- FAIL: code does not satisfy the criterion (with file:line references and explanation).
- PARTIAL: code partially satisfies (describe what is missing).

### Check 3: Charter Consistency

Load the Feature Charter referenced by the spec. Verify:

- **Scope boundaries.** The implementation does not introduce functionality outside the charter's defined scope. New endpoints, models, or UI components that are not described in the charter's Capability Map are flagged.
- **Domain model alignment.** Entity names, relationships, and boundaries in the code match the charter's Domain Model section.
- **Interface contracts.** API signatures, request/response shapes, and event payloads match the charter's Interface Contracts section (if defined).

Record PASS or FAIL with specific references to charter sections and code locations.

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

Read the `specialists` registry from `.context-index/manifest.yaml`. Apply the same match scoring algorithm used by `/adev-implement`:

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

If `.context-index/governance/boundaries.yaml` exists, collect all files changed. For each boundary rule:

1. Run regex `pattern` against file contents, respecting `exclude` globs.
2. `severity: error` → FAIL
3. `severity: warning` → WARN (does not cause overall FAIL)
4. Apply charter-specific overrides from `governance/overrides/<slug>.yaml` if present.
5. If `boundaries.yaml` does not exist → PASS (no rules configured).

### Check 9: Transition Gates

If `governance/gates.yaml` defines `implement-to-validate` or `implement-to-merge` transition:

1. Verify each `required_gates` was run and passed in Check 1.
2. If a required gate was skipped (probabilistic/no command) → log "manual verification required."
3. Note `approver_role` if present (informational).
4. If no transitions defined or governance/ absent → PASS.

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

[If FAIL: "Quality gates failed. Checks 2-10 skipped. Fix the above and re-run /adev-validate."]

## Check 2: Spec Compliance — PASS | FAIL
- [Criterion 1]: PASS | FAIL | PARTIAL
  - [file:line reference and explanation if not PASS]
- [Criterion 2]: PASS
- ...

## Check 3: Charter Consistency — PASS | FAIL
- Scope: PASS | FAIL [details]
- Domain model: PASS | FAIL [details]
- Interface contracts: PASS | FAIL [details]

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
```

## Overall Status

- **PASS:** All 10 checks passed. The implementation is validated.
- **FAIL:** One or more checks failed. The report lists every failure with file references. The user should fix the issues and re-run `/adev-validate`.

## After Validation

If PASS:

Read `completion.merge_policy` from manifest.yaml (default: "pr").

If "pr" (or target branch is in `completion.protected_branches`):
```
Validation passed. All 10 checks green.

The implementation satisfies the spec, stays within charter scope,
respects the constitution, and passes all quality gates.

Ready for PR. Run: gh pr create --base <target-branch>
Do NOT merge directly to protected branches.
```

If "merge" (and target branch is NOT protected):
```
Validation passed. All 10 checks green.

The implementation satisfies the spec, stays within charter scope,
respects the constitution, and passes all quality gates.

Ready to merge or proceed to the next feature.
```

If "ask":
```
Validation passed. All 10 checks green.

The implementation satisfies the spec, stays within charter scope,
respects the constitution, and passes all quality gates.

Ready to integrate. Open a PR or merge directly?
```

If FAIL:
```
Validation failed. [N] check(s) need attention.

[List the failed checks with a one-line summary each]

Fix the issues above and re-run: /adev-validate --spec <path>
```

## Red Flags

**Never:**
- Continue to Checks 2-10 if Check 1 (Quality Gates) failed
- Skip any of the 10 checks (except when fail-fast applies to Check 1)
- Report PASS when any check has unresolved failures
- Modify implementation code during validation (validation is read-only, except `--fix` for lint/formatting)
- Trust implementer claims without reading the actual code
- Skip specialist review when the scoring algorithm produces matches
- Suggest merging to a protected branch (always suggest PR for protected branches)
