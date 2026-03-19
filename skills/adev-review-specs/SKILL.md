---
name: adev-review-specs
description: Architecture review using parallel specialist subagents. A structural architect, security reviewer, and consistency analyzer independently evaluate specs before planning begins.
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
   - No adjacent `.review.md` file exists (e.g., `card-ordering.md` expects `card-ordering.review.md`)
   - The spec file is newer than its `.review.md` file (spec was modified after last review)

If no specs need review, report that and exit.

## Step 2: Load Context for Each Spec

For each spec to be reviewed, gather the context package that all reviewers will receive:

1. **The spec itself:** Read the full Live Spec file.
2. **Parent charter:** Read `.context-index/specs/features/<module>/charter.md` (the charter that owns this spec).
3. **Constitution:** Read `.context-index/constitution.md`.
4. **Sibling specs:** Read other specs under the same charter (for cross-reference checks).
5. **Cross-cutting specs:** Read all files in `.context-index/specs/cross-cutting/` (for contract compatibility).
6. **ADRs:** Read all files in `.context-index/adrs/` (for decision compliance).
7. **Platform context:** Read `.context-index/platform-context.yaml` (for technology constraints).

If a charter or constitution file is missing, warn the user and ask whether to proceed with reduced context or abort.

## Step 3: Check Specialist Registry

Read `.context-index/manifest.yaml` and check the `specialists` section. For each spec, match file patterns and keywords from the spec content against the specialist registry:

- **Pattern match:** Check file paths mentioned in the spec (in "Files" sections, code blocks, or interface contracts) against each specialist's `trigger_patterns`.
- **Keyword match:** Check the spec body text against each specialist's `trigger_keywords`.

Scoring (used to determine which specialists to invoke):
- 2 points per matching glob pattern. Deeper paths score higher (add 1 per path segment beyond root).
- 1 point per matching keyword.
- Any specialist with a score above 0 is invoked as an additional reviewer.

## Step 4: Dispatch Parallel Review Subagents

Launch all reviewer subagents in parallel. Each subagent gets a clean context window with only the context package from Step 2. Do not pass your session history.

### Core Reviewers (always dispatched)

**Structural Architect** (model: opus):
```
Task tool (general-purpose):
  description: "Structural architecture review of Live Spec"
  prompt: |
    <content of structural-architect-prompt.md from this skill directory>

    ---

    ## Constitution
    <constitution content>

    ## Platform Context
    <platform-context.yaml content>

    ## Parent Charter
    <charter content>

    ## ADRs
    <all ADR contents, each prefixed with filename>

    ## Target Spec
    <the spec being reviewed>
```

**Security Reviewer** (model: opus):
```
Task tool (general-purpose):
  description: "Security review of Live Spec"
  prompt: |
    <content of security-reviewer-prompt.md from this skill directory>

    ---

    ## Constitution
    <constitution content>

    ## Platform Context
    <platform-context.yaml content>

    ## Target Spec
    <the spec being reviewed>
```

**Consistency Analyzer** (model: opus):
```
Task tool (general-purpose):
  description: "Consistency analysis of Live Spec"
  prompt: |
    <content of consistency-analyzer-prompt.md from this skill directory>

    ---

    ## Constitution
    <constitution content>

    ## Parent Charter
    <charter content>

    ## Sibling Specs
    <other specs from the same charter, each prefixed with filename>

    ## Cross-Cutting Specs
    <cross-cutting specs, each prefixed with filename>

    ## Target Spec
    <the spec being reviewed>
```

### Domain Specialists (dispatched if matched in Step 3)

For each matched specialist from the registry:

- If `invoke: subagent`, load the prompt template from the specialist's `prompt_template` path and dispatch a subagent with that prompt plus the context package.
- If `invoke: skill`, note the skill name in the review report but do not dispatch (skills require user invocation).

All subagents run on the model specified in their registry entry (default: opus).

## Step 5: Collect and Consolidate Findings

Wait for all subagents to return. Merge findings into a single consolidated report.

### Verdict Logic

Determine the overall verdict for each spec:

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

<findings list, or "No findings.">

## Security Reviewer

**Verdict:** PASS | PASS_WITH_NOTES | BLOCK

<findings list, or "No findings.">

## Consistency Analyzer

**Verdict:** PASS | PASS_WITH_NOTES | BLOCK

<findings list, or "No findings.">

## Domain Specialists

### <Specialist Name> (if any were dispatched)

**Verdict:** PASS | PASS_WITH_NOTES | BLOCK

<findings list>

---

## Summary

**Total findings:** N (B blockers, W warnings, S suggestions)
**Action required:** <what the user must do next, based on verdict>
```

## Step 6: Save Review Report

Write the consolidated report to a `.review.md` file adjacent to the spec:

- Feature spec at `.context-index/specs/features/<module>/<task>.md` gets its review at `.context-index/specs/features/<module>/<task>.review.md`
- Cross-cutting spec at `.context-index/specs/cross-cutting/<topic>.md` gets its review at `.context-index/specs/cross-cutting/<topic>.review.md`

## Step 7: Report to User

Present the consolidated verdict and findings summary.

**If PASS:**
```
Review complete. All specs passed.

  <spec-slug>: PASS (0 findings)

The spec is ready for planning. Run /adev-plan --spec <path> to proceed.
```

**If PASS_WITH_NOTES:**
```
Review complete. Specs passed with notes.

  <spec-slug>: PASS_WITH_NOTES (2 warnings, 1 suggestion)

  Warnings:
  - SA-2: [brief description]
  - SEC-1: [brief description]

Review the full report at <path to .review.md>.
You can proceed to /adev-plan or address the warnings first.
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
Run /adev-specify to revise the spec, then /adev-review-specs to re-review.
```

## Gate Behavior

This skill produces the gate artifact that `/adev-plan` checks. The plan skill will:

1. Look for a `.review.md` file adjacent to the target spec.
2. Read the `Verdict` line from the review file header.
3. Compare the spec file modification time against the review file modification time.
4. Block planning if: no review exists, verdict is BLOCK, or spec is newer than review.

## Multiple Specs

When reviewing multiple specs (no arguments or `--charter`), process each spec independently. Each gets its own set of parallel subagents and its own `.review.md` file. Present a summary table at the end:

```
Architecture Review Summary

| Spec | Verdict | Blockers | Warnings | Suggestions |
|------|---------|----------|----------|-------------|
| card-ordering | PASS | 0 | 0 | 1 |
| drag-drop | BLOCK | 2 | 1 | 0 |

1 of 2 specs ready for planning.
```
