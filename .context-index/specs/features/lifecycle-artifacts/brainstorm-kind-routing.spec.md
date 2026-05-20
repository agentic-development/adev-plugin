---
charter: lifecycle-artifacts
kind: skill
status: validated
risk_level: medium
milestone: spec-and-charter-taxonomy
revision: 1
charter-revision: 2
created: 2026-05-14

plan-ref: .context-index/specs/features/lifecycle-artifacts/brainstorm-kind-routing.plan.md

source-manifest:
  sha: "4358a4c"
  files:
    - providers/codex/skills/brainstorm/SKILL.md
    - providers/opencode/skills/brainstorm/SKILL.md
    - skills/brainstorm/SKILL.md
    - tests/skills/brainstorm-kind-routing.test.mjs
  computed-at: "2026-05-15T16:16:10.334Z"
drift_detected: true
---

# Live Spec: `/adev:brainstorm` Kind Routing

<!-- Defines the changes to skills/brainstorm/SKILL.md to ask for charter kind:
     up-front and route to the matching charter template. -->

## Invocation Modes

`/adev:brainstorm` gains a single new axis — **charter kind** — selected before approach proposal. Unlike `/adev:specify`, `/adev:brainstorm` has fewer existing modes; the kind axis fits naturally early in the flow.

| Existing argument | New argument |
|---|---|
| `--module <name>` (extend or revise existing) | `--kind <kind>` |
| `--from-blueprint <path>` | — |
| `--no-bootstrap` | — |

The ask-first kind prompt is inserted in Step 2 (Clarify), before approach selection. This is intentional: the kind shapes which clarifying questions get asked (e.g., a `kind: module` charter doesn't need Domain Model questions; a `kind: cross-cutting` doesn't need Capability Map questions).

## Arguments

| Argument | Required | Description |
|---|---|---|
| `--kind <kind>` | No | One of `CHARTER_KINDS`. If omitted, the skill prompts via ask-first menu. Strict-on-write: missing or invalid value re-prompts. |
| All existing args | — | Preserved |

**Ask-first prompt** (when `--kind` not supplied):

```
What kind of charter is this?

  1. feature (default) — discrete capability with full domain model
  2. module — lifecycle-slot module registered in manifest.yaml (skill registry shape)
  3. cross-cutting — concern affecting multiple modules (lives in specs/cross-cutting/)
  4. initiative — time-bounded effort (migration, theme, release-bound work)

→ Pick a number or name (default: feature)
```

If user skips (presses enter), prompt again: `"Kind is required for new charters. Pick a number or name."`

## Output Contract

The resulting charter file carries:

- Frontmatter containing `kind: <chosen value>` as an explicit field
- Section structure matching the template resolved via `resolveTemplate('charter', kind, domain)`
- All existing frontmatter fields (status: draft, revision: 1, updated)

File-path policy:
- `kind: feature`, `kind: module`, `kind: initiative` → save to `.context-index/specs/features/<module>/charter.md` (existing path)
- `kind: cross-cutting` → save to `.context-index/specs/cross-cutting/<module>/charter.md` (different parent directory; advisory in Layer 1, enforced in Layer 2)

Side effects unchanged from the current skill:
- Product.md Module Map appended (Step 5b-4)
- Charter review loop (Step 6)
- User approval cycle (Step 7)
- Transition to `/adev:specify` (Step 8)

## Failure Modes

| Condition | Skill Behavior | User Recovery |
|---|---|---|
| `--kind` not supplied AND user skips prompt | Re-prompt: "Kind is required" | User picks a kind |
| `--kind <invalid>` supplied | Reject with valid-options list | User re-invokes with valid kind |
| `--kind module` selected but no `manifest.yaml:modules[]` entry exists | Warn (non-blocking): "Module charters typically correspond to a manifest entry. Add to manifest.yaml after this charter lands." Proceed with charter creation. | User updates manifest after charter creation |
| `--kind cross-cutting` selected but `.context-index/specs/cross-cutting/` directory not present | Create the directory; warn that the conventional location is being established | — |
| `resolveTemplate('charter', kind, domain)` throws `TEMPLATE_NOT_FOUND` | Fail with diagnostic | User fixes domain config |
| Existing skill failures (workspace mode, etc.) | Unchanged behavior | Unchanged |

## System Constitution Reference

- **Architecture Boundaries: Autonomous — "Editing skill markdown content"** — Applies.
- **Principle 2: "Skills are primarily markdown"** — Applies; the routing logic is described in SKILL.md.

## Acceptance Criteria

- [ ] `skills/brainstorm/SKILL.md` documents the ask-first kind prompt and `--kind` flag
- [ ] Skill rejects missing kind on write
- [ ] Skill rejects invalid kind values
- [ ] Skill resolves template via `resolveTemplate('charter', kind, domain)` and writes a charter following the resolved template's section structure
- [ ] `kind: cross-cutting` charters land in `specs/cross-cutting/`
- [ ] `kind: module` without manifest entry produces a non-blocking warning
- [ ] All existing tests pass; new tests cover the kind-routing path
- [ ] No constitutional violations introduced
