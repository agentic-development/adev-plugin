---
status: approved
revision: 2
updated: 2026-04-16
---

# Feature Charter: Design

## Purpose

Explore ideas and formalize them into structured specifications before any code is written. Ensures every feature has a clear charter and behavioral contracts.

## Skills

- **adev:brainstorm** — interactive exploration of a feature idea. Validates against the constitution and existing charters. Produces a Feature Charter. Bootstraps `product.md` identity on first charter (subsumes former `/adev:vision` identity behavior); subsequent brainstorms append to Module Map. Uses a charter-reviewer subagent for quality checks.
- **adev:specify** — authors Live Specs within a charter's scope. Supports modes for new features, extraction from existing code, refactoring, diff-driven changes, and cross-cutting concerns. Creates a Feature work item bound 1:1 to each authored Live Spec (per task-management charter rev 3).

## Key Behaviors

- Brainstorming is a gate — no implementation without a charter or spec
- Specs are behavioral contracts, not implementation details
- Both skills check the constitution for principle violations before producing output
- Brainstorm owns product vision bootstrap — there is no separate `/adev:vision` skill (folded in revision 2)
- Specify creates a Feature work item (tier 2 in default Epic→Feature→Task hierarchy) bound 1:1 to each Live Spec

## Key Files

- `skills/brainstorm/SKILL.md`
- `skills/brainstorm/references/steps/step-6-charter-review-loop.md` (the charter-reviewer prompt is inlined here; the former standalone `charter-reviewer-prompt.md` was a duplicate and was removed)
- `skills/specify/SKILL.md`
- `templates/charter-template.md`
- `templates/live-spec-template.md`
- `templates/refactoring-spec-template.md`
