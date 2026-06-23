---
charter: lifecycle-artifacts
kind: skill
status: validated
risk_level: medium
milestone:
revision: 2
charter-revision: 2
created: 2026-05-14

plan-ref: .context-index/specs/features/lifecycle-artifacts/specify-kind-routing.plan.md
---

# Live Spec: `/adev:specify` Kind Routing

<!-- Defines the changes to skills/specify/SKILL.md to ask for kind: up-front and
     route to the matching template. Reconciles the existing workflow modes
     (--extract, --refactor, --from-diff, --cross-cutting) as orthogonal axes
     to the new --kind flag. -->

## Invocation Modes

`/adev:specify` gains a new dimension — **artifact kind** — orthogonal to its existing workflow flags. The two axes combine independently.

| Workflow axis (existing direct flags) | Kind axis (new `--kind` flag) |
|---|---|
| (no flag) = standard | `--kind behavioral` (default) |
| `--extract` | `--kind refactor` |
| `--refactor` | `--kind action` |
| `--from-diff` | `--kind skill` |
| `--cross-cutting` | `--kind integration` |
| | `--kind artifact` |

The existing workflow flags (`--extract`, `--refactor`, `--from-diff`, `--cross-cutting`) are **direct boolean flags**, not values of a `--mode` flag — preserving the current `/adev:specify` argument syntax exactly. Layer 1 does **not** introduce a `--mode` flag. The kind axis is added via a new `--kind <value>` flag.

Any combination is permitted. Examples:
- `--extract --kind artifact` — extract an artifact-shaped spec describing an existing static deliverable
- `--kind skill` — greenfield-author a skill-kind spec (no workflow flag = standard)
- `--refactor --kind refactor` — both axes set to refactor: a refactoring workflow producing a refactor-kind spec (the natural pairing for migrations)

**Deprecation note:** The existing `--refactor` flag is preserved but now overlaps semantically with `--kind refactor`. The two are independently meaningful (workflow vs. shape). A future cleanup may consolidate workflow flags under a unified `--workflow <name>` flag to remove the orthogonality from the surface API (out of scope for Layer 1; flagged as a Layer-2 hygiene candidate in `issue-463`).

## Arguments

| Argument | Required | Description |
|---|---|---|
| `--kind <kind>` | No | One of `SPEC_KINDS`. If omitted, the skill prompts via ask-first menu. Strict-on-write: missing or invalid value re-prompts. No defaulting at write time. |
| All existing args | — | Preserved: `--charter`, `--title`, `--extract`, `--refactor`, `--from-diff`, `--cross-cutting` |

**Ask-first prompt** (when `--kind` not supplied):

```
What kind of spec is this?

  1. behavioral (default) — runtime behavior of a feature
  2. refactor — current→target migration with steps and invariants
  3. action — one-shot operational task (cleanup, backfill, migration tool)
  4. skill — defines /adev:* CLI surface
  5. integration — wires two skills or modules together
  6. artifact — static deliverable (package, template, fixture, schema)

→ Pick a number or name (default: behavioral)
```

If user skips (presses enter), prompt again with: `"Kind is required for new specs. Pick a number or name."` — strict-on-write means no silent default at authoring time.

## Output Contract

The resulting spec file at `.context-index/specs/features/<module>/<slug>.spec.md` carries:

- Frontmatter containing `kind: <chosen value>` as an explicit field
- Section structure matching the template resolved via `resolveTemplate('spec', kind, domain)`
- All existing frontmatter fields (charter, status, milestone, revision, charter-revision, created, updated)
- Optional fields per the existing skill flow (infra_requirements, tracker-ref, etc.)

Other side effects unchanged from the current skill:
- Charter Capability Map row's `Status` column updated to `specified`
- Spec status flipped to `review-pending` (Step 5.5)
- Feature work item created on the issue board with `spec_ref` (Step 5.6)
- Lifecycle event `specify started` / `specify completed` emitted

## Failure Modes

| Condition | Skill Behavior | User Recovery |
|---|---|---|
| `--kind` not supplied AND user skips prompt | Re-prompt: "Kind is required" | User picks a kind |
| `--kind <invalid>` supplied | Reject with valid-options list | User re-invokes with valid kind |
| `--kind refactor` + `--extract` (or any non-`--refactor` workflow flag) | Accept; orthogonal axes combine | — |
| `resolveTemplate('spec', kind, domain)` throws `TEMPLATE_NOT_FOUND` | Fail with diagnostic showing attempted paths; suggest checking domain extension | User fixes domain config or uses a different kind |
| Existing skill failures (charter closed, duplicate spec, etc.) | Unchanged behavior | Unchanged |

## System Constitution Reference

- **Architecture Boundaries: Autonomous — "Editing skill markdown content"** — Applies; SKILL.md edits are autonomous.
- **Principle 2: "Skills are primarily markdown"** — Applies; the routing logic is described in SKILL.md and executed by Claude, not by companion code.

## Acceptance Criteria

- [ ] `skills/specify/SKILL.md` documents the ask-first kind prompt and `--kind` flag
- [ ] Skill rejects missing kind on write (no defaulting)
- [ ] Skill rejects invalid kind values
- [ ] Skill resolves template via `resolveTemplate('spec', kind, domain)` and writes a spec following the resolved template's section structure
- [ ] Skill writes `kind:` explicitly to frontmatter
- [ ] Workflow modes (`--extract`, `--refactor`, etc.) continue to work independently of `--kind`
- [ ] All existing tests pass; new tests cover the kind-routing path
- [ ] No constitutional violations introduced
