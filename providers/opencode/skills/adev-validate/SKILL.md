---
name: adev-validate
description: "Post-implementation validation with 11 ordered checks including browser-based visual verification for UI. Fail-fast on quality gates. In OpenCode, invoke with skill({ name: 'adev-validate' })"
---

# Validate Implementation

Run post-implementation validation against specs, constitution, charters, ADRs, quality gates, governance boundaries, and transition gates. Produces a structured report with PASS/FAIL per check.

## Arguments

- `--spec <path>`: validate against a specific Live Spec (required)
- `--plan <path>`: cross-reference the implementation plan (optional)
- `--fix`: attempt to auto-fix minor issues (lint errors, formatting) before reporting

## Prerequisites

1. **Context Index exists.** `.context-index/` must be present.
2. **Spec exists.** The target Live Spec must exist.
3. **Implementation exists.** Files referenced in the spec or plan must exist.

## Execution Strategy

**Fail-fast on Check 1 (Quality Gates).** If tests, lint, or typecheck fail, skip Checks 2-11 and report immediately.

**Checks 2-11 run in full regardless of individual failures.**

## The 11 Checks

### Check 1: Quality Gates (fail-fast)

Gate source resolution:

1. If `.context-index/governance/gates.yaml` exists → primary source
2. If governance does not exist → fall back to constitution Quality Gates
3. Also check manifest.yaml `gates:` as secondary fallback

Run gate commands (test suite, linter, type checker).

**If `--fix` was passed:** Attempt auto-fix for lint and formatting errors before reporting failures.

**If any gate fails:** Skip Checks 2-11. Report overall status as FAIL.

### Check 2: Spec Compliance

For each acceptance criterion:

1. Identify which files and tests address it
2. Read relevant code. Verify behavior matches criterion
3. Check that a test exists for the criterion
4. Verify test integrity: assertions must be strict

Flag anti-patterns:

- Loose matchers where exact values are expected
- Conditional skips (`if visible`, `try/catch` around assertions)
- Assertions that can never fail
- Tests weakened to pass

### Check 3: Charter Consistency

- **Scope boundaries.** Implementation does not introduce functionality outside charter scope
- **Domain model alignment.** Entity names, relationships, boundaries match
- **Interface contracts.** API signatures, request/response shapes match

### Check 4: Constitution Compliance

- **Architecture Boundaries.** Verify no boundary was crossed
- **Non-Negotiable Principles.** Verify each principle is respected
- **Coding Standards.** Verify naming, patterns, structure match constitution

### Check 5: ADR Compliance

For each ADR relevant to the implementation:

1. Read the ADR's decision and rationale
2. Check whether implementation conflicts with, contradicts, or ignores the decision
3. Flag intentional deviations

### Check 6: Cross-Cutting Spec Compliance

For each cross-cutting spec relevant to the implementation:

1. Read the spec's requirements
2. Verify the implementation follows those requirements

### Check 7: Specialist Review

Read `specialists` registry from manifest.yaml. Apply match scoring algorithm:

1. Collect all files touched by the implementation
2. For each specialist, compute pattern score and keyword score
3. If any specialist scores above 0, dispatch specialist review subagent

### Check 8: Boundary Compliance

If `.context-index/governance/boundaries.yaml` exists:

1. Run regex `pattern` against file contents
2. `severity: error` → FAIL
3. `severity: warning` → WARN

### Check 9: Transition Gates

If `governance/gates.yaml` defines transitions:

1. Verify each required gate was run and passed in Check 1
2. Note `approver_role` if present

### Check 10: Platform Drift

Compare `.context-index/platform-context.yaml` against `package.json`:

| platform-context field | Expected package |
|----------------------|------------------|
| `framework` | Framework package present |
| `language: typescript` | `typescript` in devDependencies |
| `orm` | ORM package present |
| `auth` | Auth package present |

### Check 11: Visual Verification (UI projects)

**Trigger:** If any file matches UI patterns: `*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss`, `components/**`, `app/**/page.*`

**Playwright MCP required.** If not available, **BLOCK** validation and inform user to install Playwright MCP.

If Playwright is available:

1. Ensure dev server is running
2. Visual Expectations check (if spec has one)
3. Responsive check at 375px, 768px, 1280px widths
4. Baseline check (page loads, no blank screen)
5. Dark mode check (if applicable)

## Report Format

Write to `.context-index/specs/features/<module>/<spec-slug>-validation.md`:

```markdown
# Validation Report: [Spec Title]

> **Date:** YYYY-MM-DD
> **Spec:** [path]
> **Overall Status:** PASS | FAIL

## Check 1: Quality Gates — PASS | FAIL
- Tests: PASS | FAIL
- Lint: PASS | FAIL
- Typecheck: PASS | FAIL

## Check 2: Spec Compliance — PASS | FAIL
- [Criterion 1]: PASS | FAIL | PARTIAL

...

## Overall Status
**PASS** or **FAIL** with list of failures
```

## After Validation

If PASS:

1. Update the spec's status to `validated`:
   - Read the spec file that was validated
   - Parse YAML frontmatter
   - Update status: `implemented` → `validated`
   - Write the spec file back
   - Log: "Updated spec status: implemented → validated"

2. Read `completion.merge_policy` from manifest.yaml:

- **"pr" or protected:** Ready for PR. Do NOT merge directly.
- **"merge":** Ready to merge or proceed.
- **"ask":** Open a PR or merge directly?

If FAIL:

```
Validation failed. [N] check(s) need attention.

Fix the issues above and re-run: skill({ name: "adev-validate", args: { spec: "<path>" } })
```
