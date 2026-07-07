# Live Spec: Brainstorm Integration

<!-- Live Spec within the prototype-brainstorm charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/prototype-brainstorm/charter.md -->

---
charter: prototype-brainstorm
status: implemented
risk_level: medium
milestone:
revision: 2
charter-revision: 2
created: 2026-05-07
updated: 2026-05-07
source-manifest:
  files:
    - skills/prototype/SKILL.md
    - skills/brainstorm/SKILL.md
  computed-at: "2026-07-03T22:27:11.336Z"
---

## Behavioral Contract

This spec covers two tightly coupled capabilities: (1) the integration contract between `/adev:brainstorm` and `/adev:prototype`, defining how context flows in and control flows back, and (2) post-session heuristics capture, where key design decisions from the prototype loop are persisted as module-scoped heuristics via `/adev:learn`. These are grouped because heuristics capture is the final step of the brainstorm-prototype handoff — it closes the loop by feeding forward what was learned.

### Preconditions

- For brainstorm integration: `/adev:brainstorm` has reached Step 3 (approach selection) and the user has opted into prototyping (Step 3b). Platform context and constitution are assumed valid — their validation is the brainstorm caller's responsibility.
- For standalone invocation: `--module <name>` is provided and a charter exists at `.context-index/specs/features/<module>/charter.md`.
- For heuristics capture: the prototype session has completed (user approved or discarded the prototype), and `lib/heuristics.mjs` is importable from the plugin root.

### Behaviors

#### Brainstorm Integration

1. **When** `/adev:brainstorm` dispatches to `/adev:prototype` at Step 3b **then** the prototype skill receives structured context containing:
   - `module` (string, required) — charter module slug (kebab-case, matches directory name under `specs/features/`)
   - `approach_summary` (string, required) — the selected approach description from Step 3
   - `platform_context` (object, required) — parsed contents of `platform-context.yaml` (not the raw YAML string or file path)
   - `constitution_constraints` (array of strings, optional, defaults to `[]`) — relevant constitutional principles identified during brainstorm

2. **When** the prototype skill receives brainstorm context **then** it uses the `approach_summary` to seed the initial prototype generation (the approach guides what the prototype demonstrates), the `platform_context` to set framework defaults for functional tier, and the `constitution_constraints` to validate generated prototype code against principles.

3. **When** the prototype skill receives brainstorm context **then** it skips the charter lookup step (the brainstorm already loaded the charter) and proceeds directly to tier selection.

4. **When** the prototype session completes (after persistence choice and heuristics capture) **then** the skill returns control to `/adev:brainstorm` with a structured result containing:
   - `status` (string) — `"completed"` (user approved) or `"discarded"` (user chose to discard)
   - `tier` (string) — `"wireframe"`, `"mockup"`, or `"functional"`
   - `visual_references` (array of `{ path: string, description: string }`) — captured images with their slugified descriptions, may be empty (see `visual-reference-capture.spec.md` Behavior 8)
   - `heuristics_saved` (number) — count of heuristics captured via `/adev:learn`
   - `persistence` (string) — `"project"` (files kept at `.adev/prototype/<module>/`) or `"ephemeral"` (temp files removed). These are the charter domain model values; the user-facing labels are "keep"/"discard" (see `prototype-core.spec.md` Behavior 11).

5. **When** the prototype skill is invoked standalone (not from brainstorm) **then** it loads the charter for `--module`, extracts approach context from the charter's Business Intent and Capability Map, loads `platform-context.yaml` for framework defaults, and loads relevant constitution constraints (full standalone context construction is defined in `standalone-invocation.spec.md` Behavior 1). The return-to-brainstorm step is skipped — the session simply ends after persistence choice and heuristics capture.

6. **When** the prototype skill is invoked standalone without `--module` **then** it follows the charter discovery UX defined in `standalone-invocation.spec.md` Behaviors 2-4 (single-charter auto-select with confirmation, multi-charter list prompt, or no-charters error).

#### Heuristics Capture

7. **When** the prototype session completes (user approved or discarded) **then** the skill asks the user to identify 2-4 key design decisions that emerged during prototyping: "What design decisions should be carried forward? (e.g., 'sidebar navigation works better than top-nav for this data density', 'users expect inline editing, not modal forms')"

8. **When** the user provides design decisions **then** the skill invokes `/adev:learn` for each one, scoped to the current module. Each heuristic includes: the decision text, the prototype tier and iteration where it emerged (if identifiable), and a `source: prototype` tag.

9. **When** the user skips heuristics capture (e.g., "none", "skip") **then** the skill proceeds to session completion without saving heuristics. This is not an error — not every session produces reusable insights.

10. **When** existing module heuristics are present (loaded via `retrieveHeuristics(projectRoot, module)` at session start — module-scoped retrieval) **then** the skill surfaces them before the first prototype generation: "Previous design learnings for this module:" followed by the heuristic summaries. This gives the prototype generation context from past sessions.

11. **When** the user provides more than 4 design decisions **then** the skill asks the user to prioritize: "You've identified N decisions. To keep heuristics focused, please select the 4 most important ones, or confirm you want to save all N."

12. **When** `/adev:learn` invocation fails (import error, write error) **then** the skill logs the error, reports "Heuristic capture failed — you can save these manually with `/adev:learn` later", and proceeds to session completion. Heuristics capture failure does not block the prototype session.

### Postconditions

- When invoked from brainstorm: control has returned to `/adev:brainstorm` with the structured result.
- When invoked standalone: the session has ended cleanly.
- Heuristics (if captured) are persisted in `.context-index/memory/heuristics/` scoped to the module.
- Existing module heuristics were surfaced at session start (if any existed).

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Brainstorm context missing required fields (module, approach_summary) | Error: "Incomplete brainstorm context. Required: module, approach_summary. Received: <fields>." | INCOMPLETE_CONTEXT |
| `--module` not provided in standalone mode and no charters exist | Error: "No charters found. Run `/adev:brainstorm` first to create a charter." | NO_CHARTERS |
| `--module` charter not found (standalone) | Error: "No charter found at `.context-index/specs/features/<module>/charter.md`." | CHARTER_NOT_FOUND |
| `/adev:learn` invocation fails | Warning: "Heuristic capture failed." Proceeds without blocking. | HEURISTIC_SAVE_ERROR |
| `retrieveHeuristics()` fails at session start | Warning logged; proceeds without existing heuristics. Non-blocking. | HEURISTIC_LOAD_ERROR |
| User provides 0 design decisions after prompt | Proceed without saving heuristics (same as "skip"). | NO_HEURISTICS |

## System Constitution Reference

- **"Skills are primarily markdown"** — The brainstorm-to-prototype dispatch is orchestrated through SKILL.md instructions, not programmatic function calls. The structured context is a conceptual contract — the brainstorm SKILL.md describes what to pass, and the prototype SKILL.md describes what to expect.
- **"Minimize external dependencies"** — Heuristics capture uses the existing `lib/heuristics.mjs` library (already a project dependency). No new libraries introduced.
- **"No executable logic inside SKILL.md files"** — The dispatch and return are described as instructions. The actual heuristic persistence uses `/adev:learn` (an existing skill), not inline code in SKILL.md.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| T1: Context contract | Define the structured context interface between brainstorm and prototype (module, approach_summary, platform_context, constitution_constraints) | small |
| T2: Context reception | Prototype SKILL.md instructions for receiving and using brainstorm context — seed generation, skip charter lookup | medium |
| T3: Standalone fallback | Instructions for standalone mode: charter lookup, approach extraction from charter, module prompt | small |
| T4: Return contract | Define the structured result interface returned to brainstorm (status, tier, visual_references, heuristics_saved, persistence) | small |
| T5: Heuristics prompt | Post-session prompt for 2-4 design decisions; handle skip, excess, and empty responses | small |
| T6: Heuristics persistence | Invoke `/adev:learn` for each decision with module scope and `source: prototype` tag | medium |
| T7: Heuristics preload | Load existing module heuristics at session start via `retrieveHeuristics()` and surface to user | small |
| T8: Brainstorm SKILL.md update | Update `/adev:brainstorm` Step 3 to include Step 3b dispatch with context contract | medium |

## Acceptance Criteria

- [ ] Brainstorm dispatches to prototype with structured context: module, approach_summary, platform_context, constitution_constraints
- [ ] Prototype uses approach_summary to seed initial generation
- [ ] Prototype uses platform_context for functional-tier framework defaults
- [ ] Charter lookup is skipped when brainstorm context is provided
- [ ] Prototype returns structured result to brainstorm: status, tier, visual_references (`[{ path, description }]`), heuristics_saved, persistence (`"project"` | `"ephemeral"`)
- [ ] Standalone mode loads charter, extracts approach context, skips return-to-brainstorm
- [ ] Standalone mode without `--module` prompts with charter list
- [ ] Post-session prompt asks for 2-4 design decisions
- [ ] Each decision is saved as module-scoped heuristic via `/adev:learn` with `source: prototype` tag
- [ ] User can skip heuristics capture ("none" / "skip")
- [ ] More than 4 decisions triggers prioritization prompt
- [ ] Existing module heuristics are surfaced at session start
- [ ] `/adev:learn` failure does not block session completion
- [ ] `retrieveHeuristics()` failure does not block session start
- [ ] All quality gates pass (tests, lint)
- [ ] No constitutional violations introduced
