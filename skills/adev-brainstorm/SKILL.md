---
name: adev-brainstorm
description: Charter-aware brainstorming. Explore a feature idea interactively and produce a Feature Charter grounded in the project constitution and existing specs.
---

# Brainstorm a Feature

Explore an idea within the bounds of the project constitution and produce a Feature Charter.

Full implementation pending. See design doc Part 3, Phase 1.

## Intended Behavior

1. **Load context:** Read `.context-kit/constitution.md`, `specs/product.md`, and existing feature charters to understand scope and boundaries.
2. **Interactive exploration:** Ask clarifying questions about the user's idea. Challenge assumptions. Surface conflicts with existing charters or constitutional principles.
3. **Domain modeling:** Identify entities, relationships, and boundaries relevant to the proposed feature.
4. **Output:** Generate a Feature Charter draft at `.context-kit/specs/features/<module>/charter.md` using the charter template at `${CLAUDE_PLUGIN_ROOT}/templates/charter-template.md`.
5. **Cross-reference:** Update `specs/product.md` module map if a new module is introduced.

## Arguments

- No arguments: freeform brainstorm (user describes the idea conversationally)
- `--module <name>`: scope brainstorm to an existing module (extends its charter)
- `--from-blueprint <path>`: seed brainstorm from a blueprint file
