---
charter: planning
status: implemented
risk_level: medium
milestone:
revision: 1
charter-revision: 2
created: 2026-04-16
updated: 2026-04-16
depends-on: ["tiered-hierarchy-and-tree-walking", "unified-create-api", "next-action-and-type-fields"]
tracker-ref: epic-9
source-manifest:
  files:
    - path: skills/plan/SKILL.md
    - path: skills/plan/references/mode-router.md
    - path: skills/plan/references/plan-reviewer-prompt.md
---

# Live Spec: Multi-Scope /adev:plan with Natural-Language Triage

<!-- Expands /adev:plan from spec-only decomposition to a polymorphic
     planning skill operating at five scopes (spec, feature, release,
     milestone, epic). Mode is detected from prompt + project state when
     no explicit flag is passed; falls back to multi-choice on ambiguity. -->

## Behavioral Contract

### Preconditions

- `task-management` spec `unified-create-api` implemented (`create()` accepts tier inference)
- `task-management` spec `next-action-and-type-fields` implemented (`next_action` writable)
- `skills/plan/SKILL.md` exists with current spec-mode behavior
- `/adev:review-specs` skill exists and produces `*.review.md` artifacts

### Behaviors

#### Mode Detection

1. **When** `/adev:plan --spec <path>` is invoked **then** the skill enters spec mode regardless of project state. Explicit flag wins.

2. **When** `/adev:plan --feature <module>` is invoked **then** the skill enters feature mode targeting the named charter.

3. **When** `/adev:plan --release <name>` is invoked **then** the skill enters release mode targeting the named release.

4. **When** `/adev:plan --milestone <name>` is invoked **then** the skill enters milestone mode targeting the named milestone.

5. **When** `/adev:plan --epic <id>` is invoked **then** the skill enters epic mode targeting the named epic.

6. **When** `/adev:plan` is invoked with no flag and a free-text argument like "plan release v2" **then** keyword detection routes to release mode with `name: "v2"`.

7. **When** `/adev:plan` is invoked with no flag and a path argument like `multi-repo-workspace/init-workspace.md` **then** the skill detects the file extension/location, identifies it as a Live Spec, and routes to spec mode.

8. **When** `/adev:plan` is invoked with no flag and no argument **then** the skill scans project state: if a single reviewed spec lacks a plan, propose spec mode; if multiple reviewed specs lack plans, propose a multi-choice menu of all pending modes.

9. **When** mode detection cannot resolve to a single mode **then** the skill presents a multi-choice menu of applicable scopes with one-line context per option, awaits user choice, and proceeds.

#### Spec Mode (existing behavior preserved)

10. **When** in spec mode **then** the skill reads the Live Spec, verifies `*.review.md` exists with passing verdict (existing gate), and decomposes the spec into ordered Tasks per the existing plan-reviewer flow.

11. **When** in spec mode and creating Tasks **then** each Task is created via `create({ parent_id: <feature-id>, type: "task", plan_ref: <plan-path>, plan_task: <N>, next_action: "Run /adev:implement to do RED-GREEN-REFACTOR for this Task" })`. The `<feature-id>` is resolved by walking the issue board for a Feature with matching `spec_ref`.

12. **When** in spec mode and no Feature exists for the spec **then** the skill creates a Feature first (with `next_action` pointing at `/adev:implement`) and uses its ID as `parent_id` for the Tasks.

#### Feature Mode

13. **When** in feature mode **then** the skill reads the named charter, identifies all capabilities lacking specs, and produces a Feature plan: a list of proposed Live Specs to author, each with title, scope, and a `next_action` string from the convention table (Behavior 20). At this stage the `next_action` strings are display text shown in the proposed plan output to the user — they have not yet been persisted to work items.

14. **When** the user approves the feature plan **then** the skill creates Feature work items via `create({ parent_id: <epic-id>, type: "feature", spec_ref: null, next_action: "<from convention table>" })`. The `next_action` strings from Behavior 13 are persisted onto the created Feature work items at this point. If no Epic exists for the charter, an Epic is created first via `create({ type: "epic", notes: "Charter: <module>" })` so subsequent lookups by charter work (per specify-creates-feature spec).

#### Release Mode

15. **When** in release mode **then** the skill reads `product.md` for the milestone matching `<release-name>`, identifies all features in that release, and enumerates existing child Epics. If a release Epic already exists on the issue board, `walkTree(<release-epic-id>)` returns its child Epics — this is the source of truth for current state. The skill then builds a dependency graph from charter `Dependencies` tables and spec `depends-on` frontmatter, and produces a sequenced release plan (critical path, risk assessment) reconciling product.md feature list with the work item tree.

16. **When** the user approves the release plan **then** the skill creates the umbrella Epic for the release if not present, child Epics for each feature, and `next_action` set per Epic to point at the next planning step (typically `/adev:plan --feature <module>`).

#### Milestone Mode

17. **When** in milestone mode **then** the skill operates on the milestone definition in `product.md`: creates or updates the milestone Epic, creates Feature placeholders for each named feature, sets target date, and writes `next_action` per item.

18. **When** the milestone does not exist in `product.md` **then** the skill prompts the user to define it (target date, feature list, success criteria) and writes the new milestone to `product.md` before creating the Epic.

#### Epic Mode

19. **When** in epic mode **then** the skill reads the named Epic, scans for missing Features (Epic capabilities without corresponding Feature work items), and proposes Feature creation. Behavior thereafter matches feature mode.

#### next_action Population

20. **When** any work item is created in any mode **then** `next_action` is populated with a specific skill invocation (free-text string). Token placeholders below align with WorkItem field names (e.g., `<spec_ref>` is the Feature's `spec_ref` field value). The convention table:
   - Task → `"Run /adev:implement to do RED-GREEN-REFACTOR for this Task"`
   - Feature without spec → `"Run /adev:specify --module <module> to author this Feature"`
   - Feature with spec needing review → `"Run /adev:review-specs --module <module>"`
   - Feature with reviewed spec → `"Run /adev:plan --spec <spec_ref> to decompose into Tasks"`
   - Epic with no Features → `"Run /adev:plan --feature <module> to break into Features"`
   - Epic with all Features planned → `"Run /adev:plan --epic <id> to verify decomposition"`

### Postconditions

- `skills/plan/SKILL.md` updated with mode detection section and per-mode flows
- `skills/plan/references/mode-router.md` (new internal doc) describes detection precedence and keyword/state inference rules
- `skills/plan/references/plan-reviewer-prompt.md` updated to validate plans at any scope
- All created work items carry `next_action` per the convention table
- Existing `--spec` invocations continue to work without behavior change
- Tests cover mode detection for all five scopes plus ambiguity fallback

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `--spec <path>` on unreviewed spec | Block with "spec must pass /adev:review-specs first" | REVIEW_GATE |
| `--feature <module>` on missing or draft charter | Block with "charter must be approved" | CHARTER_GATE |
| `--release <name>` with no matching milestone in product.md | Prompt user to create milestone or cancel | — |
| Mode detection ambiguous, user dismisses menu | Skill exits without action | — |
| Conflicting flags (e.g., `--spec` and `--feature` both passed) | Throws CONFLICTING_FLAGS | CONFLICTING_FLAGS |

## System Constitution Reference

- **Principle 2 (Skills are primarily markdown):** All mode logic lives in `skills/plan/SKILL.md`. The `mode-router.md` companion is documentation, not executable.
- **Charter Quality Attribute (Adaptability — task-management):** Plan creates work items at any tier; new tier conventions just work via the unified `create()` API.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Author `mode-router.md` | Document detection precedence, keyword rules, project-state inference, multi-choice fallback | small |
| Update `skills/plan/SKILL.md` Step 1 | Add mode detection at the top before existing spec-mode flow | medium |
| Add per-mode sections to SKILL.md | One section each for feature/release/milestone/epic; keep existing spec section | medium |
| Wire `create()` calls per mode | Each mode creates appropriate work items with `next_action` per convention table | medium |
| Update `plan-reviewer-prompt.md` | Validate plans at any scope (not just spec-tasks) | small |
| Tests | Mode detection unit tests + per-mode scenarios + next_action assertions | medium |

## Acceptance Criteria

- [ ] All five explicit flags route to the correct mode
- [ ] Keyword detection routes "release v2" → release mode
- [ ] Path argument detection routes spec paths → spec mode
- [ ] Ambiguous input shows multi-choice menu
- [ ] Spec mode preserves existing behavior (gate on review, plan-reviewer subagent)
- [ ] Feature mode creates Feature work items under the appropriate Epic
- [ ] Release mode reads product.md milestones and produces sequenced plan
- [ ] Milestone mode creates/updates Epic + Feature placeholders
- [ ] Epic mode decomposes existing Epic into missing Features
- [ ] Every created work item has `next_action` populated per convention
- [ ] `--spec` and `--feature` together throws CONFLICTING_FLAGS
- [ ] `mode-router.md` exists and documents all five mode detection rules with concrete keyword/state examples
- [ ] All existing tests pass; new tests cover all modes
- [ ] No constitutional violations (no new deps, SKILL.md remains primary surface)
