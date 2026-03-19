---
name: adev-specify
description: Author Live Specs within a Feature Charter's scope. Supports modes for new features, extraction from existing code, refactoring, diff-driven changes, and cross-cutting concerns.
---

# Write a Live Spec

Author a Live Spec that defines a behavioral contract for implementation, scoped to an existing Feature Charter.

Full implementation pending. See design doc Part 3, Phase 1.

## Modes

| Mode | Flag | Description |
|------|------|-------------|
| Standard | *(default)* | New feature spec from scratch within a charter |
| Extract | `--extract` | Reverse-engineer a spec from existing code |
| Refactor | `--refactor` | Spec a refactoring with current state, target state, and migration path |
| From-Diff | `--from-diff` | Generate a spec from a git diff or PR description |
| Cross-Cutting | `--cross-cutting` | Spec a concern that spans multiple charters (auth, logging, etc.) |

## Process

1. **Resolve charter:** Identify the parent Feature Charter. If ambiguous, ask the user.
2. **Constitution check:** Verify the spec topic does not violate constitutional principles.
3. **Author spec:** Generate a Live Spec using the appropriate template:
   - Standard/Extract/From-Diff: `${CLAUDE_PLUGIN_ROOT}/templates/live-spec-template.md`
   - Refactor: `${CLAUDE_PLUGIN_ROOT}/templates/refactoring-spec-template.md`
   - Cross-Cutting: `${CLAUDE_PLUGIN_ROOT}/templates/live-spec-template.md` (saved to `specs/cross-cutting/`)
4. **Output:** Save to `.context-kit/specs/features/<module>/<spec-slug>.md` (or `specs/cross-cutting/<spec-slug>.md`).

## Arguments

- `--charter <module>`: target charter (required unless only one exists)
- `--title <title>`: spec title (prompted interactively if omitted)
