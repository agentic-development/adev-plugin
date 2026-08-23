---
partial_schema: spec@1
charter: task-management
status: validated
kind: behavioral
risk_level: low
milestone:
revision: 1
charter-revision: 8
created: 2026-08-22
updated: 2026-08-22
charter-extension: true
source-manifest:
  sha: "c5203b3"
  files:
    - skills/issues/SKILL.md
    - skills/plan/SKILL.md
    - tests/skills/issue-content-contract-empty-notes-warning.test.mjs
    - tests/skills/issue-content-contract-epic-notes.test.mjs
    - tests/skills/issue-content-contract-next-action-default.test.mjs
    - tests/skills/issue-content-contract-spec-ref.test.mjs
    - tests/skills/issue-content-contract-template.test.mjs
  computed-at: "2026-08-22T17:24:51.706Z"
---

<!-- Charter divergence: "Issue Content Contract" is not yet a row in the
     task-management charter's Capability Map. Authored directly via
     /adev:specify per explicit user instruction, skipping /adev:brainstorm.
     Backfill the Capability Map row when this spec is planned/implemented. -->

# Live Spec: Issue Content Contract

<!-- Live Spec within the task-management charter.
     Parent Charter: .context-index/specs/features/task-management/charter.md -->

## Behavioral Contract

<!-- The Issue data model (lib/issues/interface.mjs) already supports notes
     (the body), spec_ref, and next_action — but skills/issues/SKILL.md's
     `create` command never surfaces notes/spec_ref/next_action as something
     an author should fill in, and /adev:plan's Step 7 standard-mode epic
     creation (skills/plan/SKILL.md:828) writes title + planRef only. This
     spec defines a content contract for issue bodies and closes those two
     gaps without changing the schema or adding blocking validation. -->

### Preconditions

- `.context-index/` exists with `manifest.yaml`
- The issue board backend is initialized (json, beads, or file)
- For BEH-3: a Live Spec exists at the referenced `spec_ref` path (existence is not filesystem-validated — `spec_ref` remains a plain string field, consistent with `validateIssue`'s existing string-only check)

### Behaviors

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** `/adev:issues create "<title>" --type bug` or `--type feature` is invoked without `--notes`/`--body`/`--description`, **then** the skill prompts the author for the issue body using a trimmed content template (Problem/Intent, Acceptance Criteria, Out of Scope) before creating the issue, and passes the assembled text through the existing `description`/`body` → `notes` alias resolution (`resolveNotes`) unchanged.
- **BEH-2** — **When** `/adev:issues create --type task` is invoked (task is the default type), **then** the skill does not force the full template — a one-line `--notes` value is accepted as-is, since Tasks are typically short and already scoped by a parent Feature's spec.
- **BEH-3** — **When** an issue is created with `--spec-ref <path>`, or a `spec_ref` can be inferred from the active lifecycle context (e.g. invoked via `/adev:work` immediately after `/adev:specify`), **then** the created issue's `spec_ref` field is populated with that path so the issue traces back to its behavioral contract.
- **BEH-4** — **When** `/adev:issues create` completes for a `feature` or `bug` type issue whose resolved `notes` is empty (author skipped the BEH-1 prompt), **then** `validateIssue` still returns the issue as created — creation is never blocked — but the skill prints a soft warning: `Issue <id> was created without a body. Consider /adev:issues update <id> --notes "..." before work starts.`
- **BEH-5** — **When** `/adev:plan` (Step 7, standard mode) creates the plan-level epic, **then** `createEpic()` is called with a `notes` value summarizing the plan's stated goal (drawn from the plan document's opening section) in addition to the existing `title` and `planRef` fields, rather than leaving `notes` unset.
- **BEH-6** — **When** `/adev:issues create` or `update` is invoked without an explicit `--next-action <text>` for a newly created `feature` or `task` issue, **then** the skill looks up a default from the existing next_action Convention Table (`skills/plan/epic-mode.md`), keyed on `type` and known state, instead of leaving `next_action: null`. An explicit `--next-action` value, when supplied, is always stored verbatim and is never overridden by the lookup.

### Postconditions

- `validateIssue`'s fixed-whitelist return literal is unchanged — no new fields are introduced by this spec
- The `description`/`body` → `notes` alias resolution (`NOTES_ALIASES`, `resolveNotes`) is unchanged; BEH-1/BEH-2 build on it, they do not replace it
- Epics created by feature-mode (`create({ type: "epic", notes: "Charter: <module>" })`) and release-mode keep their existing `"Charter: <module>"` / `"Release: <name>"` tag prefix in `notes` unchanged — that prefix is load-bearing for `/adev:specify` Step 5.6-3's parent-epic lookup. BEH-5 only changes the plan-level epic created at `skills/plan/SKILL.md:828`, which currently sets no `notes` at all
- Empty-body issue creation still succeeds (BEH-4 is a warning, not a block) — no new required field, no schema change

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `--spec-ref` path does not point to an existing file | Issue is still created; `spec_ref` is a descriptive string field, not filesystem-validated (matches current `validateIssue` behavior) | N/A (soft) |
| `--notes`, `--body`, and `--description` supplied with conflicting values | Existing `CONFLICTING_NOTES_FIELDS` behavior applies unchanged | CONFLICTING_NOTES_FIELDS |
| Author skips or cancels the BEH-1 template prompt for a `feature`/`bug` issue | Issue is created with empty `notes`; BEH-4 soft warning is printed | N/A (soft) |
| `--next-action` value is not a string | Existing `INVALID_NEXT_ACTION` behavior applies unchanged | INVALID_NEXT_ACTION |
| Convention Table (BEH-6) has no matching row for the issue's `type`/state | `next_action` remains `null`, no error | N/A (soft) |

## System Constitution Reference

- **"Skills are primarily markdown — skill files are structured instructions for Claude"** — Applies because the BEH-1 content-template prompt and the BEH-6 convention-table lookup are authored entirely as SKILL.md prose (an interactive Q&A sequence and a table reference), with no new logic added to `lib/issues/`.
- **No SKILL.md contains both an inline-Node block and an `adev <verb>` invocation within the same H3 section** — Applies because BEH-6 must reuse the existing `skills/plan/epic-mode.md` Convention Table by reference rather than duplicating its branching logic as an inline script inside `skills/issues/SKILL.md`.
- **"Updating specs/ADRs when code changes affect their assumptions" (Autonomous)** — Applies because this spec formalizes a gap between the documented `/adev:issues create` interface and the richer `Issue` data model it has always been able to persist, identified by inspecting the current skill and adapter code rather than by a code change.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Add content-template prompt to Create Issue | Extend `skills/issues/SKILL.md`'s Create Issue section with the BEH-1/BEH-2 notes Q&A, gated on `--type` | medium |
| Wire `--spec-ref` pass-through | Document the `--spec-ref` flag and lifecycle-context inference in `skills/issues/SKILL.md` (BEH-3) | small |
| Add empty-notes soft warning | Extend the Create Issue report step with the BEH-4 warning text | small |
| Populate plan-level epic notes | Update `skills/plan/SKILL.md` Step 7 to draw a one-line goal summary into `notes` on `createEpic()` (BEH-5) | small |
| Default `next_action` lookup | Extend Create Issue to consult the `skills/plan/epic-mode.md` Convention Table when `--next-action` is omitted (BEH-6) | medium |

## Acceptance Criteria

- [ ] `/adev:issues create --type feature` (and `--type bug`) without `--notes` prompts using the trimmed content template before creating the issue
- [ ] `/adev:issues create --type task` accepts a one-line `--notes` without forcing the full template
- [ ] `--spec-ref <path>` populates the created issue's `spec_ref` field
- [ ] Creating a `feature`/`bug` issue with empty `notes` succeeds and prints the BEH-4 soft warning
- [ ] `/adev:plan` Step 7 standard-mode epic creation sets `notes` to a plan-goal summary instead of leaving it unset
- [ ] Feature-mode and release-mode epics keep their `"Charter: <module>"` / `"Release: <name>"` `notes` prefix unchanged (regression check for the Postconditions invariant)
- [ ] Newly created `feature`/`task` issues without an explicit `--next-action` receive a non-null `next_action` sourced from the Convention Table
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
