---
name: adev:validate
description: "Post-implementation validation with 11 ordered checks including browser-based visual verification for UI. Fail-fast on quality gates. In Codex, invoke with $adev:validate"
---

# Validate Implementation

Run post-implementation validation against specs, constitution, and quality gates.

## Arguments

- `--spec <path>`: validate against specific spec (required)
- `--plan <path>`: cross-reference implementation plan
- `--fix`: attempt auto-fix for lint/formatting errors

## Prerequisites

1. Context Index exists
2. Spec exists
3. Implementation exists

## Execution Strategy

**Fail-fast on Check 1 (Quality Gates).** If tests/lint/typecheck fail, skip Checks 2-11.

## The 11 Checks

### Check 1: Quality Gates (fail-fast)

Run gate commands from `governance/gates.yaml` or constitution fallback.

If `--fix`: attempt auto-fix before reporting.

### Check 2: Spec Compliance

For each acceptance criterion:
1. Identify which files address it
2. Read code, verify behavior matches
3. Check test exists with strict assertions

### Check 3: Charter Consistency

- Scope boundaries respected
- Domain model aligned
- Interface contracts matched

### Check 4: Constitution Compliance

- Architecture Boundaries not crossed
- Non-Negotiable Principles respected
- Coding Standards followed

### Check 5: ADR Compliance

Verify implementation follows ADR decisions.

### Check 6: Cross-Cutting Spec Compliance

Verify cross-cutting requirements met.

### Check 7: Specialist Review

If specialist matched in manifest, dispatch specialist review.

### Check 8: Boundary Compliance

If `boundaries.yaml` exists, run regex patterns.

### Check 9: Transition Gates

Verify required gates passed in Check 1.

### Check 10: Platform Drift

Compare `platform-context.yaml` against `package.json`.

### Check 11: Visual Verification (UI)

If UI files modified:
1. Ensure dev server running
2. Check Visual Expectations (if spec has them)
3. Responsive check (375px, 768px, 1280px)
4. Baseline check (page loads)
5. Dark mode (if applicable)

Requires Playwright MCP. BLOCK if not available.

## Report Format

```markdown
# Validation Report: <Spec Title>

> **Date:** YYYY-MM-DD
> **Overall Status:** PASS | FAIL

## Check 1: Quality Gates — PASS/FAIL
## Check 2: Spec Compliance — PASS/FAIL
...

## Overall Status
<FAIL with list of failures or PASS>
```

## After Validation

If PASS:
1. Update the spec's status to `validated`:
   - Read the spec file that was validated
   - Parse YAML frontmatter
   - Update status: `implemented` → `validated`
   - Write the spec file back
   - Log: "Updated spec status: implemented → validated"

2. Ready for PR or merge per completion policy.

If FAIL: Fix issues, re-run `$adev:validate`.
