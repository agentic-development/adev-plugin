---
name: adev-review-specs
description: "Architecture review using parallel specialist subagents. A structural architect, security reviewer, and consistency analyzer independently evaluate specs before planning begins. In Codex, invoke with $adev-review-specs"
---

# Review Specs

Run an architecture review on one or more Live Specs using parallel specialist subagents.

**Announce:** "I'm using the adev-review-specs skill to run an architecture review."

## Arguments

- No arguments: review all unreviewed specs
- `--spec <path>`: review a specific spec file
- `--charter <module>`: review all specs under a feature charter

## Step 1: Identify Target Specs

1. If `--spec <path>` provided, use that file
2. If `--charter <module>` provided, glob specs under that charter
3. Otherwise, scan all specs. A spec needs review if:
   - No adjacent `.review.md` file exists
   - Spec is newer than its review

## Step 2: Load Context for Each Spec

1. The spec itself
2. Parent charter
3. Constitution
4. Sibling specs
5. Cross-cutting specs
6. ADRs
7. Platform context
8. Governance policies

## Step 3: Check Specialist Registry

Match file patterns and keywords from spec against specialists registry.

Scoring: 2 points per glob match, 1 point per keyword match.

## Step 4: Dispatch Parallel Review Subagents

### Core Reviewers (always dispatched)

**Structural Architect:** Architecture, interfaces, patterns

**Security Reviewer:** Auth, data handling, input validation

**Consistency Analyzer:** Cross-spec consistency, naming, patterns

### Domain Specialists (if matched)

Load prompt template and dispatch if specialist scored above 0.

## Step 5: Collect and Consolidate Findings

### Verdict Logic

| Condition | Verdict |
|-----------|---------|
| All reviewers: zero findings | **PASS** |
| Warnings but zero blockers | **PASS_WITH_NOTES** |
| Any blocker | **BLOCK** |

## Step 6: Save Review Report

Write to `.review.md` adjacent to spec.

## Step 6.5: Update Spec Status

After saving the review report, update the spec's status based on the verdict:

**If verdict is PASS or PASS_WITH_NOTES:**
1. Read the spec file
2. Parse YAML frontmatter
3. Update status: `review-pending` → `review-passed`
4. Write the spec file back

**If verdict is BLOCK:**
1. Read the spec file
2. Parse YAML frontmatter
3. Update status: `review-pending` → `review-blocked`
4. Write the spec file back

Log the status change to the user.

## Step 7: Report to User

```
Review complete.
  <spec-slug>: PASS (0 findings)

Ready for planning. $adev-plan
```

```
Review complete.
  <spec-slug>: PASS_WITH_NOTES (2 warnings)

Review report at <path>. Proceed to $adev-plan or address warnings.
```

```
Review complete.
  <spec-slug>: BLOCK (1 blocker)

Fix issues first. $adev-specify to revise, then re-review.
```

## Gate Behavior

`$adev-plan` checks for `.review.md` with PASS or PASS_WITH_NOTES verdict.
