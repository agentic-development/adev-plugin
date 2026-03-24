---
name: adev-review-specs
description: "Architecture review using parallel specialist subagents. A structural architect, security reviewer, and consistency analyzer independently evaluate specs before planning begins. In OpenCode, invoke with skill({ name: 'adev-review-specs' })"
---

# Review Specs

Run an architecture review on one or more Live Specs using parallel specialist subagents. This is the gate between specification and planning. No code gets planned until specs pass review.

**Announce at start:** "I'm using the adev-review-specs skill to run an architecture review."

## Arguments

- No arguments: review all unreviewed specs (specs without a `.review.md` file, or where the spec is newer than the review)
- `--spec <path>`: review a specific spec file
- `--charter <module>`: review all specs under a feature charter

## Step 1: Identify Target Specs

Determine which specs need review:

1. If `--spec <path>` is provided, use that file directly.
2. If `--charter <module>` is provided, glob `.context-index/specs/features/<module>/*.md` excluding `charter.md` and any `*.review.md` files.
3. If no arguments, scan all `.context-index/specs/features/` and `.context-index/specs/cross-cutting/` directories. A spec needs review if:
   - No adjacent `.review.md` file exists
   - The spec file is newer than its `.review.md` file

If no specs need review, report that and exit.

## Step 2: Load Context for Each Spec

For each spec to be reviewed, gather the context package:

1. **The spec itself:** Read the full Live Spec file.
2. **Parent charter:** Read `.context-index/specs/features/<module>/charter.md`.
3. **Constitution:** Read `.context-index/constitution.md`.
4. **Sibling specs:** Read other specs under the same charter.
5. **Cross-cutting specs:** Read all files in `.context-index/specs/cross-cutting/`.
6. **ADRs:** Read all files in `.context-index/adrs/`.
7. **Platform context:** Read `.context-index/platform-context.yaml`.
8. **External references:** If `.context-index/references/` exists and has files, read them.
9. **Governance policies:** If `.context-index/governance/risk-policies.yaml` exists, read it.

## Step 3: Check Specialist Registry

Read `.context-index/manifest.yaml` and check the `specialists` section. Match file patterns and keywords from the spec against the specialist registry.

Scoring:

- 2 points per matching glob pattern (deeper paths score higher)
- 1 point per matching keyword
- Any specialist with a score above 0 is invoked as an additional reviewer

## Step 4: Dispatch Parallel Review Subagents

Launch reviewer subagents in parallel. Each subagent gets a clean context window.

### Core Reviewers (always dispatched)

**Structural Architect:**
```
Task tool (general-purpose):
  description: "Structural architecture review of Live Spec"
  prompt: |
    <content of structural-architect-prompt.md from skill directory>

    ---

    ## Constitution
    <constitution content>

    ## Platform Context
    <platform-context.yaml content>

    ## Parent Charter
    <charter content>

    ## ADRs
    <all ADR contents>

    ## Target Spec
    <the spec being reviewed>
```

**Security Reviewer:**
```
Task tool (general-purpose):
  description: "Security review of Live Spec"
  prompt: |
    <content of security-reviewer-prompt.md from skill directory>

    ---

    ## Constitution
    <constitution content>

    ## Platform Context
    <platform-context.yaml content>

    ## Target Spec
    <the spec being reviewed>
```

**Consistency Analyzer:**
```
Task tool (general-purpose):
  description: "Consistency analysis of Live Spec"
  prompt: |
    <content of consistency-analyzer-prompt.md from skill directory>

    ---

    ## Constitution
    <constitution content>

    ## Parent Charter
    <charter content>

    ## Sibling Specs
    <other specs from the same charter>

    ## Cross-Cutting Specs
    <cross-cutting specs>

    ## Target Spec
    <the spec being reviewed>
```

### Domain Specialists (dispatched if matched in Step 3)

For each matched specialist:

- If `invoke: subagent`, load the prompt template and dispatch a subagent.
- If `invoke: skill`, note the skill name in the review report.

## Step 5: Collect and Consolidate Findings

### Verdict Logic

| Condition | Verdict |
|-----------|---------|
| All reviewers returned zero findings or only `suggestion` severity | **PASS** |
| At least one `warning` finding but zero `blocker` findings | **PASS_WITH_NOTES** |
| At least one `blocker` finding from any reviewer | **BLOCK** |

### Consolidated Report Format

```markdown
# Architecture Review: <spec-slug>

> **Date:** YYYY-MM-DD
> **Spec:** <path to spec>
> **Charter:** <path to charter>
> **Verdict:** PASS | PASS_WITH_NOTES | BLOCK

## Structural Architect
**Verdict:** PASS | PASS_WITH_NOTES | BLOCK
<findings list>

## Security Reviewer
**Verdict:** PASS | PASS_WITH_NOTES | BLOCK
<findings list>

## Consistency Analyzer
**Verdict:** PASS | PASS_WITH_NOTES | BLOCK
<findings list>

## Summary
**Total findings:** N (B blockers, W warnings, S suggestions)
**Action required:** <what the user must do next>
```

## Step 6: Save Review Report

Write the consolidated report to a `.review.md` file adjacent to the spec:

- Feature spec at `.context-index/specs/features/<module>/<task>.md` → `.context-index/specs/features/<module>/<task>.review.md`
- Cross-cutting spec → similarly adjacent

## Step 7: Report to User

**If PASS:**
```
Review complete. All specs passed.
  <spec-slug>: PASS (0 findings)

The spec is ready for planning. Run skill({ name: "adev-plan", args: { spec: "<path>" } })
```

**If PASS_WITH_NOTES:**
```
Review complete. Specs passed with notes.
  <spec-slug>: PASS_WITH_NOTES (2 warnings, 1 suggestion)

Review the full report at <path to .review.md>.
You can proceed to skill({ name: "adev-plan" }) or address the warnings first.
```

**If BLOCK:**
```
Review complete. Specs blocked.
  <spec-slug>: BLOCK (1 blocker, 2 warnings)

Blockers:
  - SA-1: [brief description]
  - CON-3: [brief description]

These issues must be resolved before planning can begin.
Review the full report at <path to .review.md>.
Run skill({ name: "adev-specify" }) to revise the spec, then re-review.
```

## Gate Behavior

This skill produces the gate artifact that `adev-plan` checks. The plan skill will:

1. Look for a `.review.md` file adjacent to the target spec.
2. Read the `Verdict` line from the review file header.
3. Block planning if: no review exists, verdict is BLOCK, or spec is newer than review.

## Multiple Specs

When reviewing multiple specs, process each independently. Present a summary table:

```
Architecture Review Summary

| Spec | Verdict | Blockers | Warnings | Suggestions |
|------|---------|----------|----------|-------------|
| card-ordering | PASS | 0 | 0 | 1 |
| drag-drop | BLOCK | 2 | 1 | 0 |

1 of 2 specs ready for planning.
```
