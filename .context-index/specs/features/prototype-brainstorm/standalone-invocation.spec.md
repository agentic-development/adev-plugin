---
charter: prototype-brainstorm
status: validated
risk_level: low
milestone:
revision: 2
charter-revision: 2
created: 2026-05-07
updated: 2026-05-07
source-manifest:
  files:
    - skills/prototype/SKILL.md
  computed-at: "2026-05-10T23:51:54.631Z"
drift_detected: true
---

# Live Spec: Standalone Invocation

<!-- Live Spec within the prototype-brainstorm charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/prototype-brainstorm/charter.md -->

## Behavioral Contract

This spec covers the standalone invocation path for `/adev:prototype` — when a user invokes the skill directly (not dispatched from `/adev:brainstorm`). Standalone mode constructs its own context from the charter and platform files, supports full argument parsing (`--module`, `--tier`, `--framework`), and runs the complete prototype loop (generation, serving, feedback, persistence, heuristics) without a brainstorm handoff.

This spec complements `brainstorm-integration.spec.md`, which defines the brainstorm dispatch/return contract. The core prototype loop itself (generation, serving, feedback, persistence) is defined in `prototype-core.spec.md` and applies to both invocation paths.

### Preconditions

- `.context-index/` exists with at least one charter under `specs/features/`.
- `platform-context.yaml` exists (for framework defaults).
- `constitution.md` exists (for constraint validation).

### Behaviors

1. **When** the user invokes `/adev:prototype --module <name>` directly (no brainstorm context) **then** the skill validates that `<name>` matches `^[a-z0-9][a-z0-9-]*$` (kebab-case, max 64 chars — no path separators, dots, or special characters), then loads the charter at `.context-index/specs/features/<name>/charter.md`, extracts approach context from the charter's Business Intent and Capability Map, loads `platform-context.yaml` for framework defaults, and loads relevant constitution constraints. It then proceeds to tier selection (as defined in `prototype-core`). Constitution validation is a standalone-only responsibility — when invoked from brainstorm, the brainstorm caller has already validated it (see `brainstorm-integration.spec.md` Preconditions).

2. **When** the user invokes `/adev:prototype` without `--module` and exactly one charter exists **then** that charter is used automatically, with a confirmation: "Using charter: <module> — <charter title>. Proceed? (yes / pick a different one)"

3. **When** the user invokes `/adev:prototype` without `--module` and multiple charters exist **then** the skill discovers charters by globbing `.context-index/specs/features/*/charter.md`, lists all available charters, and prompts for selection:
   ```
   Available charters:
     1. task-boards — Task management with drag-and-drop boards
     2. notifications — Real-time notification system
   → Which module should this prototype target? (number or name)
   ```

4. **When** the user invokes `/adev:prototype` without `--module` and no charters exist **then** the skill errors: "No charters found under `.context-index/specs/features/`. Run `/adev:brainstorm` first to create a charter."

5. **When** the user provides `--tier <wireframe|mockup|functional>` as an argument **then** the tier selection prompt is skipped and the specified tier is used directly. Invalid tier values trigger: "Invalid tier: `<value>`. Options: wireframe, mockup, functional."

6. **When** the user provides `--framework <react|vue|svelte|vanilla>` with `--tier functional` **then** the framework selection prompt is skipped and the specified framework is used directly.

7. **When** the user provides `--framework` without `--tier functional` **then** the `--framework` argument is ignored with a note: "Note: `--framework` only applies to the functional tier. Ignoring for <tier> tier."

8. **When** the standalone session completes **then** no return-to-brainstorm step occurs. The session ends after persistence choice and heuristics capture (as defined in `brainstorm-integration`). The final output is a session summary: tier used, `iteration_count` (number of `Feedback Iteration` entities), persistence choice (`"project"` or `"ephemeral"`), visual references captured, heuristics saved.

9. **When** the charter's `status` frontmatter field is `closed` **then** the skill warns but does not block: "Note: The <module> charter is closed. You can still prototype against it, but consider whether a new charter is needed." (Prototyping against a closed charter is valid for exploratory or retrospective purposes.)

10. **When** existing module heuristics are found via `retrieveHeuristics(projectRoot, module)` **then** they are surfaced before tier selection (same behavior as brainstorm path, defined in `brainstorm-integration`). This gives the user prior design context before starting.

### Postconditions

- The prototype loop ran to completion using charter-derived context.
- No brainstorm return was attempted.
- Session summary was output with final stats.
- All postconditions from `prototype-core` (file persistence) and `brainstorm-integration` (heuristics) apply.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `--module` value fails validation (`^[a-z0-9][a-z0-9-]*$`, max 64 chars) | Error: "Invalid module name: `<value>`. Must be kebab-case (lowercase letters, numbers, hyphens)." | INVALID_MODULE_NAME |
| `--module` references non-existent charter | Error: "No charter found at `.context-index/specs/features/<module>/charter.md`." | CHARTER_NOT_FOUND |
| No charters exist (no `--module`) | Error: "No charters found. Run `/adev:brainstorm` first." | NO_CHARTERS |
| Invalid `--tier` value | Error with valid options; re-prompt | INVALID_TIER |
| Invalid `--framework` value | Error with valid options; re-prompt | INVALID_FRAMEWORK |
| `--framework` without functional tier | Warning note; argument ignored | FRAMEWORK_IGNORED |
| `platform-context.yaml` missing | Warning: "No platform context found. Framework defaults will not be pre-selected." Proceed. | NO_PLATFORM_CONTEXT |
| `constitution.md` missing | Error: "Constitution not found. Run `/adev:init` to set up the context index." | NO_CONSTITUTION |

## System Constitution Reference

- **"Skills are primarily markdown"** — The standalone invocation path is entirely SKILL.md instructions. Argument parsing (`--module`, `--tier`, `--framework`) is handled by Claude's tool argument interpretation, not programmatic CLI parsing.
- **"Minimize external dependencies"** — Context loading uses `fs.readFileSync` for charter, platform-context, and constitution. No additional libraries.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| T1: Argument parsing | SKILL.md instructions for `--module`, `--tier`, `--framework` argument handling | small |
| T2: Charter discovery | Module prompt when `--module` absent — single charter auto-select, multi-charter list | small |
| T3: Context construction | Extract approach from charter Business Intent/Capability Map; load platform-context and constitution | medium |
| T4: Tier/framework shortcut | Skip prompts when `--tier` and `--framework` provided via arguments | small |
| T5: Session summary | End-of-session output: tier, iterations, persistence, references, heuristics | small |
| T6: SKILL.md authoring | Write the `/adev:prototype` SKILL.md with both standalone and brainstorm paths | medium |

## Acceptance Criteria

- [ ] `--module` value is validated against `^[a-z0-9][a-z0-9-]*$` (max 64 chars) before filesystem path construction
- [ ] Charter discovery uses glob `.context-index/specs/features/*/charter.md`
- [ ] `/adev:prototype --module <name>` loads charter and constructs context without brainstorm
- [ ] Approach context is extracted from charter Business Intent and Capability Map
- [ ] No `--module` with one charter: auto-selects with confirmation
- [ ] No `--module` with multiple charters: lists and prompts
- [ ] No `--module` with no charters: errors with `/adev:brainstorm` suggestion
- [ ] `--tier` argument skips tier selection prompt
- [ ] `--framework` argument skips framework prompt (functional tier only)
- [ ] `--framework` without functional tier produces warning and is ignored
- [ ] Closed charter produces warning but does not block
- [ ] Session ends with summary (no brainstorm return)
- [ ] Existing module heuristics surfaced before tier selection
- [ ] Missing `platform-context.yaml` produces warning, does not block
- [ ] Missing `constitution.md` produces error and blocks
- [ ] All quality gates pass (tests, lint)
- [ ] No constitutional violations introduced
