---
status: approved
revision: 2
updated: 2026-04-16
---

# Feature Charter: Planning

## Purpose

Decompose work at multiple scopes (Live Spec → Tasks; Charter → Features; Release → Epics; Milestone → Epic+Features) into ordered tiered work items with TDD expectations, context routing hints, and `next_action` guidance for downstream agents.

## Skills

- **adev:plan** — constitution-gated multi-scope planning. Five modes inferred from input or selected via flag:
  - `--spec <path>` (default) — decompose a Live Spec into Tasks (TDD increments)
  - `--feature <module>` — decompose a Charter into Features (one per planned Live Spec)
  - `--release <name>` — sequence Epics across a release with cross-feature dependencies
  - `--milestone <name>` — define a milestone (Epic + planned Features, target date)
  - `--epic <id>` — decompose an existing Epic into child Features and Tasks

  Natural-language triage detects mode from prompt + project state when no flag passed; falls back to a multiple-choice prompt if ambiguous. Produces tiered work items per the task-management model (Epics, Features, Tasks with dotted IDs); sets `next_action` on every created item. Uses a plan-reviewer subagent for quality.

## Key Behaviors

- Spec mode (`--spec`) is gated on `/adev:review-specs` passing — will not plan unreviewed specs. Other modes have their own gates (e.g., `--feature` requires an approved charter)
- Each Task includes: description, acceptance criteria, TDD expectations, files to touch, specialist hint, `next_action` pointing at `/adev:implement`
- Each Feature includes: title (from spec), spec ref (1:1), `next_action` pointing at `/adev:review-specs` or `/adev:implement` depending on review status
- Mode detection precedence: explicit flag → prompt keyword detection → project state inference → clarifying multiple-choice question
- Plan output feeds into `/adev:implement` (Tasks) or further planning (Features needing decomposition) per `next_action`

## Key Files

- `skills/plan/SKILL.md`
- `skills/plan/references/plan-reviewer-prompt.md`
- `skills/plan/references/mode-router.md` (internal — mode detection rules)
