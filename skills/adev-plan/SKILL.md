---
name: adev-plan
description: Constitution-gated planning. Decomposes reviewed Live Specs into ordered implementation tasks with TDD expectations and context routing hints.
---

# Plan Implementation

Decompose reviewed Live Specs into an ordered task list ready for `/adev-implement`.

Full implementation pending. See design doc Part 3, Phase 2.

## Gate

Planning is blocked if the target spec has not passed `/adev-review-specs`. If the spec review status is `blocked` or missing, this skill will refuse to proceed and direct the user to run `/adev-review-specs` first.

## Process

1. **Load spec:** Read the target Live Spec and its review report.
2. **Constitution check:** Verify plan scope stays within constitutional boundaries (e.g., architecture decisions that require human approval).
3. **Task decomposition:** Break the spec into discrete implementation tasks, each with:
   - Task ID and title
   - Description of what to build
   - Test expectations (what test to write first, TDD red phase)
   - Files likely to be created or modified
   - Dependencies on other tasks (ordering)
   - Specialist hint (if a domain expert subagent should handle it)
4. **Context routing:** For each task, list which context files the implementer should load.
5. **Output:** Write plan to `.context-kit/specs/features/<module>/<spec-slug>-plan.md`.

## Arguments

- `--spec <path>`: plan a specific spec (required)
- `--dry-run`: show the plan without writing it
