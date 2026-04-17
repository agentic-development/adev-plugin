---
charter: design
status: review-passed
risk_level: low
milestone: strategic-planning-consolidation
revision: 1
charter-revision: 2
created: 2026-04-16
updated: 2026-04-16
depends-on: ["unified-create-api", "next-action-and-type-fields"]
tracker-ref: epic-9
---

# Live Spec: /adev:specify Creates Feature Work Item (1:1 with Spec)

<!-- After /adev:specify writes a Live Spec, it creates a Feature
     work item bound 1:1 to that spec via spec_ref. Closes the loop
     between specs and the issue board so /adev:plan and /adev:status
     can find specs through the work item graph. -->

## Behavioral Contract

### Preconditions

- `task-management` spec `unified-create-api` implemented (`create()` accepts `type: "feature"` and `spec_ref`)
- `task-management` spec `next-action-and-type-fields` implemented (`next_action` writable)
- `skills/specify/SKILL.md` exists with Step 5 (Write the Spec) and Step 5.5 (Update Spec Status)
- `manifest.yaml` has `tasks.backend` configured

### Behaviors

#### Feature Creation After Spec Write

1. **When** `/adev:specify` completes Step 5.5 (status flipped to `review-pending`) **then** a new Step 5.6 fires that creates a Feature work item via `getIssueManager(manifest).create({ title, parent_id, type: "feature", spec_ref })`.

2. **When** `manifest.yaml` lacks `tasks.backend` **then** Step 5.6 is skipped silently with a one-line note in the summary: `"Issue board not configured; skipping Feature work item creation."`

3. **When** the spec was authored under module `<module>` **then** the skill queries the issue board for items with `type: "epic"` whose `notes` field begins with the literal string `"Charter: <module-slug>"` (a convention established when `/adev:plan --feature <module>` creates the Epic per the multi-scope-plan spec). If exactly one matching Epic is found, the Feature is created with `parent_id: <epic-id>`. If multiple matching Epics are found, the most recently updated one is used and a warning is logged.

4. **When** no Epic exists for the module (zero matches by the `Charter: <module-slug>` convention in Behavior 3) **then** the Feature is created as a root item (no `parent_id`) with `type: "feature"`. A subsequent `/adev:plan --feature <module>` invocation can later create the Epic and re-parent the Feature.

#### Feature Fields

5. **When** the Feature is created **then** its fields are:
   - `title`: copied from the spec's `# Live Spec: <title>` heading
   - `type`: `"feature"`
   - `spec_ref`: absolute path to the spec file (`.context-index/specs/features/<module>/<spec-slug>.md`)
   - `next_action`: based on spec status — `review-pending` → `"Run /adev:review-specs --module <module>"`; later transitions update this field
   - `parent_id`: the resolved Epic ID, or absent for root
   - `notes`: `"Bound 1:1 to spec at <spec_ref>. Created by /adev:specify on <date>."`

6. **When** a Feature already exists with the same `spec_ref` **then** Step 5.6 updates the existing Feature (refreshes `next_action`, `updated`) rather than creating a duplicate. Idempotent re-runs of `/adev:specify` on an updated spec do not produce duplicate Features.

#### next_action Lifecycle

7. **When** `/adev:review-specs` produces a passing review for the spec **then** it updates the bound Feature's `next_action` to `"Run /adev:plan --spec <spec_ref> to decompose into Tasks"`.

8. **When** `/adev:plan --spec <path>` creates Tasks under the Feature **then** the Feature's `next_action` updates to `"Run /adev:implement --plan <plan_path> to execute Tasks"` and Task next_actions are set per the planning module's convention table.

9. **When** all Tasks under a Feature are closed **then** subsequent `/adev:validate` runs update the Feature's `next_action` to `"Run /adev:validate --plan <plan_path>"` (if not already done) or `"Done — close Feature after final validation"`.

#### Cross-Cutting and Refactor Modes

10. **When** `/adev:specify --cross-cutting` writes a spec to `.context-index/specs/cross-cutting/<slug>.md` **then** the Feature is created with `parent_id` absent (no module Epic) and `notes` flagging the cross-cutting nature. `affects: [<module-list>]` from the spec frontmatter is included in the Feature's notes.

11. **When** `/adev:specify --refactor` writes a refactoring spec **then** the Feature is created with `type: "feature"` (refactors are still Features in the model) and `next_action` includes a note about migration steps if applicable.

#### Backward Compatibility

12. **When** a spec lacks a corresponding Feature work item (spec authored before this behavior landed) **then** running `/adev:specify --module <module>` on the spec backfills the Feature on next invocation. No automatic migration sweep — Features appear lazily as specs are touched.

### Postconditions

- `skills/specify/SKILL.md` includes a new Step 5.6 (Create Feature Work Item) between Step 5.5 (Update Spec Status) and Step 6 (Summary)
- All new specs created via `/adev:specify` have a corresponding Feature work item bound by `spec_ref`
- Re-running `/adev:specify` on an existing spec updates the Feature, does not duplicate
- Cross-cutting and refactor specs produce Features tagged appropriately
- Skills downstream (`/adev:plan`, `/adev:review-specs`, `/adev:validate`) update Feature `next_action` on transitions per the convention table in `planning/multi-scope-plan.md` Behavior 20

**Cross-spec obligation (out of this spec's scope but called out for tracking):** `/adev:review-specs` and `/adev:validate` skills must be updated to write `next_action` on bound Features when they advance review/validation state. Those updates are tracked as implementation work under their respective module specs and are part of the strategic-planning consolidation epic-9, not scoped to this spec.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `tasks.backend` not configured | Step 5.6 skipped with one-line note | — |
| Issue board adapter throws on create | Spec is still written; Feature creation failure logged but does not block spec completion | — |
| Multiple Features somehow have the same `spec_ref` | Update the most recently created one; warn about duplicates | — |
| Spec deleted but Feature still references it | `/adev:hygiene` (future) flags orphaned Features; this spec does not implement cleanup |

## System Constitution Reference

- **Principle 2 (Skills are primarily markdown):** New Step 5.6 lives in `skills/specify/SKILL.md` as additional instructions. The actual `create()` call is via the existing `lib/issues/` API.
- **Charter Quality Attribute (Anti-Drift — task-management):** Establishing 1:1 spec ↔ Feature binding makes the issue board the canonical map of work-in-flight. Agents reading the board can navigate to specs without hunting through directory structure.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Add Step 5.6 to specify SKILL.md | Detection of existing Feature, create-or-update via unified create() | small |
| Implement Feature lookup by `spec_ref` | Helper in `lib/issues/` or inline in skill instructions | small |
| Add backfill behavior for legacy specs | Step 5.6 also fires when re-running on existing spec without bound Feature | small |
| Tests | New spec creates Feature; re-run updates not duplicates; cross-cutting/refactor variants; tasks.backend missing path | small |

## Acceptance Criteria

- [ ] New spec created via `/adev:specify` produces a Feature work item with `spec_ref` set
- [ ] Feature `next_action` set to `"Run /adev:review-specs ..."` for `review-pending` specs
- [ ] Re-running `/adev:specify` on the same spec updates the Feature instead of duplicating
- [ ] When module Epic exists, Feature is created as a child of that Epic
- [ ] When no module Epic exists, Feature is created as a root item
- [ ] Cross-cutting specs produce Features with appropriate notes
- [ ] Refactor specs produce Features with migration notes
- [ ] When `tasks.backend` is absent, Step 5.6 is skipped without error
- [ ] Issue board create failures do not block spec completion
- [ ] All existing tests pass; new tests cover the scenarios above
- [ ] No constitutional violations
