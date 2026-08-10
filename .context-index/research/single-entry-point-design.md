---
topic: "A single point of entry for adev — reducing the 31-skill surface to one front door"
date: "2026-07-01"
relates-to: ""
sources:
  - internal
status: complete
---

## Summary

Users cannot tell when to use `/adev:work` vs `brainstorm` vs `specify` vs the other 28 skills, because adev's **internal lifecycle stages are exposed as the user interface** — 31 near-synonymous `/adev:*` commands with trigger-word-optimized descriptions that compete for invocation. The framework already has *two half-orchestrators*: `/adev:work` (a front-end router that classifies intent and hands off, then leaves — solving only the first "which command?" decision) and `/adev:build` (a back-end conductor that genuinely drives review→plan→route→implement→validate as fresh subagents, but assumes the user already decided to "build" and starts at `specify`). Neither spans the whole arc from vague idea → shipped → healthy while *staying with the user*. Additionally, the `using-adev` gateway's **"Skill Invocation Rule"** hard-gate actively works against a single entry by mandating the model always hunt for and invoke a matching skill on every turn — maximizing per-turn skill selection, the opposite of "one door routes you." The recommended fix is a **layered, staged convergence**: (1) four cheap markdown-only levers now (gateway reframe, description hygiene, next-step chaining, doc tiering); (2) evolve `/adev:work` into a true conductor that classifies new intent, drives the arc via `build`'s existing delegation engine, and on no-args *continues* the current work's next lifecycle step; (3) later, structural consolidation of 31 skills → ~8 goal-verbs. The single entry is also the natural home for the Express Lane rigor selection from `adev-simplification-synthesis.md`.

## Findings

### The structural diagnosis

- **Stages-as-UI.** The 31 skills are the *implementation* of the methodology (brainstorm/specify/plan/implement/…) presented as the *interface*. Users think in goals ("build X", "fix this", "is my project healthy?"), not lifecycle phases. This is the category error behind "which command?".
- **Two half-orchestrators, neither spanning the full arc:**
  - `/adev:work` (`skills/work/SKILL.md`) — classify (9-route table) + handoff. Scans in-progress state (Step 1) but exits after one hop; the user re-faces the palette for the next step. Routing table covers only brainstorm/specify/review-specs/plan/implement/debug/hygiene — **no** status/research/eval/deploy/document/retro/sample/issues.
  - `/adev:build` (`skills/build/SKILL.md`) — a real conductor with fresh-subagent dispatch per step, retry loops, `--resume`, `--auto`, `--full`. But starts at `specify`; does not cover the fuzzy front (brainstorm/charter) or the maintenance side (status/hygiene/reconcile).
- **The gateway fights single-entry.** `skills/using-adev/SKILL.md` "Skill Invocation Rule" is a hard-gate: *"Before doing ANY work … check whether an `/adev:*` skill applies. If there is even a 1% chance a skill applies, invoke it,"* plus a "common bypass patterns to catch yourself on" table. This maximizes explicit skill-selection per turn — the machinery a single front door must replace, not extend.
- **Feasibility constraints:** skill frontmatter has no `hidden`/`internal` flag today (all 31 are user-invocable); plugin commands are namespaced `/adev:<skill>` (no bare `/adev` without verification). So the near-term fix is positioning + routing coverage + trigger funneling, not a platform trick.

### Option space (four axes: what the entry *is* · how it *routes* · fate of the other 30 · interaction paradigm)

| # | Strategy | Mechanism | Solves | Cost | Single-ness |
|---|----------|-----------|--------|------|:---:|
| 1 | **Conversational conductor** | Unify `work`+`build`: one entry classifies *then drives* the whole arc; stages internal | Every "what next" | High (build = ~80% of engine) | ★★★★★ |
| 2 | **Router + handoff** | Evolve `work` only: full routing coverage, still hands off | First decision only | Low | ★★☆ |
| 3 | **Natural-language-first** | No command; gateway + tightened descriptions let the model route from intent | "I must pick" mental model | Low (markdown) | ★★★★ (invisible) |
| 4 | **"Continue / what's next"** | No-arg entry advances current work to next lifecycle step via state machine | Repeat decisions on in-flight work | Moderate | ★★★★ (resume) |
| 5 | **Structural consolidation** | Merge 31 → ~8 goal-verbs (create/ship/fix/check/setup/track/research/learn) | Root palette clutter | High (breaking) | ★★★ (8 legible doors) |
| 6 | **Porcelain/plumbing split** | Designate ~4 user-facing; re-describe rest as internal stages; tier docs | Perceived surface | Low-moderate | ★★★ |
| 7 | **Namespaced hierarchy** | Rename into groups (`/adev:make:*`, `/adev:check:*`) | Legibility only | Moderate | ★☆ (not recommended) |

**Creative variants:** two-verb minimalism (*begin new* vs *resume/advance* — a tight 1+4); a no-arg goal menu (Build/Fix/Check/Maintain) as onboarding; a central `routing.md` rubric replacing 31 competing trigger descriptions; `manifest.ui.mode: simple|expert` adaptive disclosure.

### Four cheap levers (markdown-only, apply regardless of strategy)

1. **Gateway reframe** — flip the "Skill Invocation Rule" from *"always find the right skill"* to *"describe intent; the front door routes."*
2. **Description hygiene / trigger funneling** — only the ~4 entry skills broad-trigger; narrow the 26 stage skills to named-only / in-flow triggers so they stop competing.
3. **Next-step chaining** — every stage skill ends by proposing (or auto-advancing to) the next step. Makes a cheap handoff-router *behave* like a conductor without building one.
4. **Doc tiering** — reorganize `using-adev` table and `docs/skill-reference.md` into "Start here" (few) vs "Stages (advanced)."

## Recommendations

**Staged convergence, not one option:**

1. **Now (pure markdown, autonomous per CLAUDE.md):** the four cheap levers. Makes `/adev:work` *feel* like the one door and stops stages from stranding users — most of the perceived problem at near-zero risk.
2. **Core:** evolve `/adev:work` into a **conductor** (Options 1+2+4) — classify new intent, *stay in control* driving the arc via `build`'s delegation engine, and on no-args *continue* the current work's next step. Home for Express-Lane rigor selection (express/standard/full) from `adev-simplification-synthesis.md`. Done by upgrading the existing skill (autonomous) rather than adding a new skill (which would touch the "new skills / lifecycle order" human-approval boundary).
3. **Later (structural, needs human sign-off):** Option 5 consolidation → ~8 goal-verbs, informed by the detect/repair-trio and gate-dedup findings already in `research/`.

**Naming** is secondary to mechanism. Prefer a bare `/adev` if registrable (verify — plugin skills normally force `/adev:<name>`), else `/adev:go`. Do not re-litigate `work`→`start` unless collapsing its role into the conductor.

**Human-approval boundaries to respect:** adding a genuinely new skill, changing lifecycle order, and changing plugin registration all require human approval (CLAUDE.md). Evolving `work` and editing the gateway are autonomous skill-markdown edits.

## References

### Internal
- `skills/work/SKILL.md` — front-end router to evolve into the conductor
- `skills/build/SKILL.md` — back-end conductor whose delegation engine the conductor reuses
- `skills/using-adev/SKILL.md` — gateway; "Skill Invocation Rule" to reframe; skill table to tier
- `.context-index/research/adev-simplification-synthesis.md` — Express Lane / graduated rigor (pairs with the single entry)
- `docs/skill-reference.md` — per-skill reference to tier into "Start here" vs "Stages"
- `lib/lifecycle-state.mjs` (`listLifecycleStates`, `currentState`) — state machine powering the no-arg "continue" behavior
