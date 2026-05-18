---
charter: design
kind: skill
status: review-pending
risk_level: low
revision: 1
charter-revision: 2
created: 2026-05-18
updated: 2026-05-18
tracker-ref: issue-338
---

# Skill Spec: Brainstorm Step 8 Capability Grouping Suggestions

## Invocation Modes

Same invocation surface as today. No new flags. `/adev:brainstorm` Step 8 (Transition to Specification) gains additional output content; the menu it presents to the user is restructured but the skill still terminates by handing off to `/adev:specify`.

## Arguments

| Argument | Required | Description |
|---|---|---|
| *(none new)* | — | This spec adds output behavior to an existing skill; no new arguments. |

## Output Contract

After charter approval (current behavior, unchanged), Step 8 produces a **Spec Organization Plan** before listing top-priority capabilities:

1. **Capability grouping table.** For each proposed spec, list the capability slugs grouped together, with a one-line rationale.

   ```
   | Spec | Capabilities | Rationale |
   |---|---|---|
   | <spec-slug> | <cap-1>, <cap-2> | <cohesion / dependency / blast-radius reason> |
   ```

2. **Dependency graph (ASCII).** When two or more proposed specs have ordering dependencies, render an inline ASCII diagram:
   ```
   spec-A  ┐
           ├─→ spec-B ─→ spec-C
   spec-D ─┘
   ```
   When all specs are independent, the diagram is omitted.

3. **Heuristic citation (required).** Each rationale references one of three named heuristics — `cohesion`, `dependency-chain`, `blast-radius`. The skill defines these inline in the prompt so the model produces consistent rationales:
   - **cohesion** — capabilities sharing an invariant (e.g., a multi-file version-parity rule) belong together
   - **dependency-chain** — capability X consumes capability Y → both in one spec unless Y is reused by other specs
   - **blast-radius** — capabilities that touch the same module/file cluster belong together; capabilities that touch independent surfaces should split

4. **Existing capability list, retained.** After the grouping plan, the existing top-priority capability list is still rendered. The transition to `/adev:specify` now offers two paths:
   - Specify one *group* (writes one spec covering N capabilities, using the proposed grouping)
   - Specify one *capability* (override the grouping for that one spec)

5. **No new files written by Step 8.** Output goes only to the chat session and is durable only via the user's eventual `/adev:specify` calls. Charter is not edited.

## Failure Modes

| Condition | Skill Behavior | User Recovery |
|---|---|---|
| Charter has 0 must-have capabilities | Skip the grouping table; render only "No must-have capabilities yet — extend the charter or proceed to /adev:specify directly." | User adds capabilities via `/adev:brainstorm --module <name>` or proceeds with the single-spec path |
| Charter has exactly 1 must-have capability | Skip the grouping table; render only the existing single-capability prompt | User proceeds with the existing handoff |
| Charter has >12 must-have capabilities | Render the grouping table but cap at the top 12 by Priority/Milestone; append a note: "Charter has N capabilities; grouping shown for top 12. Consider splitting the charter." | User can either split the charter (re-run `/adev:brainstorm --module <name>`) or override the suggestion |
| Two heuristics conflict on the same capability pair | Pick the more conservative grouping (separate specs) and note "ambiguous: <cap-1> and <cap-2> — cohesion suggests together, blast-radius suggests apart." | User confirms or overrides |
| User picks "specify one capability" overriding the group | Honor the override; do not re-render the grouping table on subsequent turns of the same session | None — explicit user choice |

## System Constitution Reference

- **Skills are primarily markdown** (Constitution Principle 2). Implementation is a SKILL.md edit — no companion code required. The three heuristics are defined inline in the prompt.
- **Brainstorming is a gate** (design charter, Key Behaviors). This spec preserves the gate; it only enriches the gate's terminal output to make the downstream `/adev:specify` step less improvisational.
- **Specify creates a Feature work item bound 1:1 to each Live Spec** (design charter, Key Behaviors). The grouping table directly controls how many Feature work items get created downstream — wrong grouping creates the wrong board state. This raises the value of getting Step 8 right.

## Acceptance Criteria

- [ ] `skills/brainstorm/SKILL.md` Step 8 renders the Capability Grouping table whenever the charter has ≥2 must-have capabilities
- [ ] Each row's rationale cites exactly one of: `cohesion`, `dependency-chain`, `blast-radius`
- [ ] When ≥2 grouped specs have ordering dependencies, an ASCII dependency graph is rendered; when independent, the graph is omitted
- [ ] The three heuristics are defined inline in the SKILL.md so the rendering is reproducible across model runs
- [ ] Edge cases in the Failure Modes table are handled (0 caps, 1 cap, >12 caps, conflicting heuristics, user override)
- [ ] `/adev:specify` continues to work whether the user follows the suggested grouping or overrides it — Step 8's output is advisory, never mandatory
- [ ] The cursor-provider charter's 5-spec grouping (manifest+parity, adapter+sanitization, hook-generator+tests, CLI-integration, sync-target) is reproducible when the heuristics are applied to its 12 capabilities — used as a regression fixture in `tests/brainstorm-step-8.test.mjs`
- [ ] No new external dependencies; pure SKILL.md edit
- [ ] Lifecycle event log records spec status transitions per existing `/adev:specify` Step 5.5 contract — unchanged
