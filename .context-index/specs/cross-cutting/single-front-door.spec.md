---
kind: skill
status: review-passed
mode: cross-cutting
risk_level: medium
affects: [using-adev, work, brainstorm, specify, review-specs, plan, route, implement]
extracted-from:
  - skills/using-adev/SKILL.md
  - skills/work/SKILL.md
  - skills/brainstorm/SKILL.md
  - skills/specify/SKILL.md
  - skills/review-specs/SKILL.md
  - skills/plan/SKILL.md
  - skills/route/SKILL.md
  - skills/implement/SKILL.md
source-manifest:
  files:
    - skills/using-adev/SKILL.md
    - skills/work/SKILL.md
    - skills/brainstorm/SKILL.md
    - skills/specify/SKILL.md
    - skills/review-specs/SKILL.md
    - skills/plan/SKILL.md
    - skills/route/SKILL.md
    - skills/implement/SKILL.md
  computed-at: "2026-07-01T00:00:00.000Z"
revision: 1
created: 2026-07-01
updated: 2026-07-01
tracker-ref: "PR #199"
drift_detected: true
---

# Skill Spec: Single Front Door

<!-- Cross-cutting skill spec documenting already-implemented behavior (extract-flavored;
     see PR #199 on branch feat/single-entry-point). It records the contract that makes
     /adev:work the one entry point and conductor for the lifecycle, so the behavior is
     traceable and /adev:hygiene can detect drift. Design rationale:
     .context-index/research/single-entry-point-design.md and adev-simplification-synthesis.md. -->

## Invocation Modes

The single front door is a cross-cutting contract over three surfaces, not a new skill:

1. **Gateway framing (`using-adev`, session-start).** The gateway presents skills in two tiers — **Start here** (`work`, `init`, `status`, `issues`) and **Lifecycle stages** (`/adev:work` runs these for you) — and frames all substantive work as *routed through the front door* rather than requiring the user to pick the matching skill.

2. **Front door + conductor (`/adev:work`).** `/adev:work` is the one entry point. It reads in-progress project state, classifies intent across the **full** skill surface, routes, and — in Conductor Mode — drives or proposes the next lifecycle step so the user never has to pick another command.
   - **With a description:** classify against the 26-route table and propose a route.
   - **With no description / "continue" / "resume" / "next":** the no-argument conductor path — route directly to the projected next step (Next-Step Projection) for the most recently active spec, without re-asking.

3. **Next-step chaining (spine skills).** Each of `brainstorm`, `specify`, `review-specs`, `plan`, `route`, `implement` ends with a uniform **"Next Step in the Lifecycle"** handoff naming the next skill, so a directly-invoked stage never strands the user.

## Arguments

`/adev:work` argument surface relevant to this contract (unchanged flags omitted):

| Argument | Required | Description |
|---|---|---|
| *(none)* | No | No-argument conductor path: scan state and route to the projected next step for the most recently active spec. Never re-ask "what to work on" when in-progress work exists. |
| *(free text)* | No | Intent description classified against the 26-route table (full skill coverage). |
| `continue` / `resume` / `next` (as free text) | No | Treated as the no-argument conductor path — advance current work. |

## Output Contract

Observable behavior each surface MUST hold on every invocation path:

**Gateway (`using-adev`)**
- Presents a two-tier skill list: a "Start here" set (`work`, `init`, `status`, `issues`) and a "Lifecycle stages" set the front door runs.
- The routing/invocation guidance frames skill selection as the front door's job ("Route Through the Front Door" / "When in doubt, `/adev:work`"), not the user's.

**`/adev:work`**
- Classification covers the full skill surface (≥ 26 routes spanning brainstorm, specify, review-specs, plan, route, build, implement, write-test, debug, validate, eval, status, hygiene, reconcile, codehealth, issues, research, document, deploy, retro, sample, learn, init, sync, prototype, repomap).
- Contains a **Next-Step Projection** table mapping a spec's lifecycle position (derived from `currentState(...).steps` + `readExecutionState(...)`, never from file presence) to its concrete next skill.
- No-argument / continue / resume routes **directly** to the projected next step for the most recently active spec; it does not re-ask what to work on when in-progress work exists.
- Conductor Mode: after a stage, hands full build flows into `/adev:build`'s engine or proposes the next stage; for low-risk/easy work it propagates the **quick rigor tier** (`--tier quick`) to the gate skills rather than skipping any gate — the gate still runs, just cheaper (see `graduated-rigor-tiers.spec.md`; resolves the CON-1 review finding). Lane selection MUST NOT weaken hard gates — the non-main-branch stop, quality-gate fail-fast, and constitution checks remain in force regardless of tier (resolves SEC-1).
- Does **not** write lifecycle/plan-task state itself (reads `state.planTasks`; writing belongs to `/adev:implement`). Preserves the existing plan-task channel invariant.

**Spine skills**
- Each of `brainstorm`, `specify`, `review-specs`, `plan`, `route`, `implement` contains a "Next Step in the Lifecycle" section naming the correct next skill (and, for `review-specs`, branching on PASS vs BLOCK).
- The addition is a footer; it does not alter the behavior those skills' owning specs govern, and does not appear after any terminal completion token (`build`/`validate` are excluded).

**Provider parity**
- The codex and opencode skill mirrors under `providers/*/skills/` stay byte-in-sync with canonical `skills/` (regenerated via `scripts/sync-provider-skills.mjs`).

## Module Impact Map

| Skill (module) | Impact | Change |
|---|---|---|
| `using-adev` | High | Tiered skill table; invocation rule reframed to route-through-the-door. |
| `work` | High | Repositioned as single front door + conductor; 26-route table; Next-Step Projection; no-arg continue. |
| `brainstorm`, `specify`, `review-specs`, `plan`, `route`, `implement` | Low | Append uniform "Next Step in the Lifecycle" handoff. |
| `build`, `validate` | None | Excluded from chaining (emit terminal completion tokens). |
| `providers/{codex,opencode}` mirrors | Mechanical | Regenerated to preserve parity. |

## Failure Modes

| Condition | Behavior | User Recovery |
|---|---|---|
| No `.context-index/` | `/adev:work` stops and directs to `/adev:init` (existing prerequisite). | Run `/adev:init`. |
| State scan read fails / malformed state | Skip the unreadable item, continue; no crash (graceful degradation, existing). | None needed. |
| No in-progress work on no-arg invocation | Fall through to classification (ask one classifying question). | Describe the work. |
| Ambiguous intent | Low-confidence path: ask one clarifying question with numbered routes. | Pick a route. |
| Lifecycle position unmappable in Next-Step Projection | Fall back to classification / ask; never guess from file presence. | Describe the next step. |
| Spine-skill footer would follow a completion token | Excluded by contract (`build`/`validate` carry no footer). | N/A. |

## System Constitution Reference

- **Principle 2 (Skills are primarily markdown)** — Applies: the entire contract is expressed as skill-markdown edits; no executable logic added to SKILL.md.
- **Anti-pattern: no inline Node in SKILL.md** — Applies: all added prose is descriptive; behavior that has runtime semantics (state reads) continues to name CLI verbs / lib functions, not inline Node.
- **Architecture Boundary: "Adding new skills to the lifecycle order" requires human approval** — Applies: this contract deliberately evolves the existing `work` skill and edits existing skills rather than adding a new skill or reordering the lifecycle, keeping the change autonomous.
- **Universal skill-extension coverage** — Applies: all edited skills retain their `Load Skill Extensions` block (enforced by `tests/skills-extension-coverage.test.mjs`).

## Acceptance Criteria

- [x] Gateway presents a two-tier skill list (Start here vs Lifecycle stages) and reframes invocation as route-through-the-door.
- [x] `/adev:work` classification table covers the full skill surface (≥ 26 routes).
- [x] `/adev:work` contains a Next-Step Projection table derived from lifecycle state, and no-arg/continue routes directly to the projected next step.
- [x] Conductor Mode drives or proposes the next step (hands full builds into `/adev:build`).
- [x] `brainstorm`, `specify`, `review-specs`, `plan`, `route`, `implement` each carry a "Next Step in the Lifecycle" handoff; `build`/`validate` do not (terminal-token safety).
- [x] Provider mirrors (codex, opencode) are in sync with canonical skills.
- [x] All edited skills retain their `Load Skill Extensions` block; no inline Node introduced.
- [x] `npm test` passes (4272 tests) with no new failures.
