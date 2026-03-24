---
name: adev-specify
description: "Author Live Specs within a Feature Charter's scope. Supports modes for new features, extraction from existing code, refactoring, diff-driven changes, and cross-cutting concerns. In Codex, invoke with $adev-specify"
---

# Write a Live Spec

Author a Live Spec that defines a behavioral contract for implementation.

## Arguments

| Argument | Description |
|----------|-------------|
| *(positional)* | Feature module name or capability hint |
| `--charter <module>` | Explicit parent charter |
| `--title <title>` | Spec title |
| `--extract` | Extract mode: reverse-engineer from existing code |
| `--refactor` | Refactor mode: current + target state |
| `--from-diff` | From-diff mode: retroactive spec from git diff |
| `--cross-cutting` | Cross-cutting mode: spans multiple charters |

## Prerequisites

1. `.context-index/` exists
2. `.context-index/constitution.md` exists
3. At least one Feature Charter exists (except `--cross-cutting`)

## Shared: Resolve Charter

1. Scan `.context-index/specs/features/*/charter.md`
2. Match positional arg or prompt user to select

## Standard Mode (default)

### Step 1: Identify Capability

Present charter's capability map and existing specs.

### Step 2: Interactive Spec Authoring

**Behavioral Contract:** When...then format (3-8 statements)

**Preconditions and Postconditions:** Derive from behaviors

**Error Cases:** Condition, expected behavior, status code table

**Constitution Reference:** 2-4 relevant principles

**Actionable Task Map:** Preliminary breakdown (not full plan)

**Acceptance Criteria:** Concrete, checkable, every behavior maps to at least one

### Step 3: Write the Spec

1. Generate slug: lowercase, kebab-case
2. Fill template at `${ADEV_PLUGIN_ROOT}/templates/live-spec-template.md`
3. Save to `.context-index/specs/features/<module>/<spec-slug>.md`

## Extract Mode (`--extract`)

For brownfield codebases:
1. Read existing source code
2. Identify public interface, state mutations, error handling
3. Generate snapshot spec capturing current behavior
4. Note coverage gaps

## Cross-Cutting Mode (`--cross-cutting`)

For concerns spanning multiple features:
1. Identify the concern
2. Map module impact
3. Save to `.context-index/specs/cross-cutting/<spec-slug>.md`

## Constitution Validation

Before writing, scan constitution for conflicts. If found:

```
⚠ Constitutional conflict detected:
  Your spec proposes direct client-side database queries.
  Constitution principle: "All database access goes through server actions."

  Options:
  1. Revise to comply
  2. Propose amendment (creates ADR draft)
  3. Proceed with explicit exception
```

## Summary

Output: path, charter, status, counts, next steps.
