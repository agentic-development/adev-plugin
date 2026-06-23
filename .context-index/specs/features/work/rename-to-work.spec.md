---
charter: start
status: validated
risk_level: medium
milestone:
revision: 1
charter-revision: 2
created: 2026-04-16
updated: 2026-04-16
tracker-ref: epic-9
source-manifest:
  files:
    - path: skills/work/SKILL.md
    - path: .context-index/specs/features/work/charter.md
    - path: .context-index/manifest.yaml
    - path: .claude-plugin/plugin.json
    - path: README.md
---

# Live Spec: Rename /adev:start to /adev:work

<!-- Mechanical-but-broad rename of the triage skill from /adev:start
     to /adev:work. Touches skill directory, charter directory, manifest,
     all references in other SKILL.md files, README, docs, and the
     using-adev gateway. No backward-compatible alias. -->

## Behavioral Contract

### Preconditions

- `skills/start/SKILL.md` exists and is the canonical triage skill
- `.context-index/specs/features/start/charter.md` exists (rev 2 — already approved as part of strategic-planning consolidation bundle)
- `.claude-plugin/plugin.json` registers the skill
- Numerous SKILL.md files and docs reference `/adev:start`

### Behaviors

#### Skill Directory Rename

1. **When** the rename ships **then** `skills/start/` is renamed to `skills/work/`. All files inside (SKILL.md, supporting docs, evals/) move with the directory.

2. **When** `skills/work/SKILL.md` is read **then** its frontmatter `name` field is `adev:work` (was `adev:start`). The description field is updated to use action-oriented "work" language but otherwise preserves intent.

3. **When** the user invokes `/adev:work` **then** the skill activates and executes the existing triage flow. When the user invokes `/adev:start` **then** Claude reports skill not found (no alias).

#### Charter Directory Rename

4. **When** the rename ships **then** `.context-index/specs/features/start/` is renamed to `.context-index/specs/features/work/`. The charter file `charter.md` and the rename spec itself (this file) move with the directory.

5. **When** any reference points to `.context-index/specs/features/start/charter.md` **then** the path is updated to `.context-index/specs/features/work/charter.md`.

#### Manifest Update

6. **When** `manifest.yaml` is updated **then** the `triage` module's path entry changes from `skills/start/` to `skills/work/`. Module slug remains `triage` (broader concept than the skill name).

#### Reference Sweep

7. **When** the rename ships **then** every occurrence of `/adev:start` in the following file sets is replaced with `/adev:work`:
   - All `skills/*/SKILL.md` files (lifecycle docs, examples, references)
   - `README.md` (project root)
   - `docs/**/*.md` (any user docs)
   - `.context-index/constitution.md` (if it mentions /adev:start)
   - `.context-index/specs/**/*.md` (Live Specs and feature charters that reference the skill)
   - `.context-index/sessions/**/*.md` (historical session captures — sweep but DO NOT modify; sessions are append-only and may legitimately reference the old name as historical record. Flag any matches for the implementer to review case-by-case.)
   - `.context-index/memory/**/*.md` (heuristic memory store)
   - `templates/*.md` (template files that mention skills)
   - `templates/manifest-template.yaml` (if it mentions the triage skill path)
   - `.claude-plugin/plugin.json` (if it lists slash commands)

8. **When** a sweep target file does not contain `/adev:start` **then** no change is made to that file (idempotent).

9. **When** the sweep encounters `/adev:start` inside a code block, comment, or example **then** the replacement still occurs. The intent is total rename — no instances of the old name remain in the shipping plugin (except in the migration notes of `start/charter.md` rev 2 / `work/charter.md` rev 2).

#### Tests Update

10. **When** the rename ships **then** any test files that reference `skills/start/` or `/adev:start` (e.g., `tests/skills/start.test.mjs`) are updated. Test file names are also renamed if they encode the skill name.

#### Migration Notes Preservation

11. **When** the sweep is applied to `.context-index/specs/features/work/charter.md` (the renamed charter) **then** the Migration Notes section's historical references to `/adev:start` are intentionally preserved (they document that this rename happened). Sweep should be scoped to skip frontmatter, headings, and Migration Notes sections that are clearly historical.

#### Validation After Rename

12. **When** the rename is complete **then** `grep -r "/adev:start" .` (excluding `.git`, `node_modules`, intentional historical references in Migration Notes sections, and this spec file itself) returns zero hits.

13. **When** `npm test` runs **then** all tests pass with the new skill name.

### Postconditions

- `skills/start/` no longer exists; `skills/work/` exists with identical content (modulo the SKILL.md frontmatter rename)
- `.context-index/specs/features/start/` no longer exists; `.context-index/specs/features/work/` exists
- `manifest.yaml` triage module path updated
- All reference sweeps complete with zero remaining unintentional references to `/adev:start`
- All tests pass
- The plugin functions identically with `/adev:work` as users previously expected `/adev:start`

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Rename collision (`skills/work/` already exists) | Block with error: "rename target already exists" | RENAME_COLLISION |
| Reference sweep misses a file | Detected by validation grep; spec implementer fixes manually | — |
| User invokes `/adev:start` post-rename | Claude reports "skill not found" (no alias by design) | — |
| Tests for the old skill name fail because of rename | Implementer updates test files as part of the sweep | — |

## System Constitution Reference

- **Architecture Boundary (Autonomous):** Renaming a skill within a module's boundaries falls under "Refactoring within a module's boundaries" and "Updating internal documentation" — no human approval required. The triage module is unchanged; only the skill name within it changes.
- **Human approval already obtained for the no-alias decision:** Removing `/adev:start` without a backward-compatible alias is a breaking change for users with muscle memory. This decision was explicitly approved by the user during the strategic-planning consolidation conversation (2026-04-16) and ratified in `start/charter.md` rev 2 Out of Scope: *"Backward-compatible `/adev:start` alias — slash commands have no user alias mechanism; `/adev:start` is removed entirely in this revision."* The implementer is not making this call autonomously; the charter records the decision.
- **Principle 2 (Skills are primarily markdown):** The change is largely string replacements in markdown files. Companion code is minimal.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| `git mv skills/start/ skills/work/` | Directory rename preserves history | small |
| `git mv .context-index/specs/features/start/ .context-index/specs/features/work/` | Charter dir rename | small |
| Update SKILL.md frontmatter | Change `name: adev:start` → `name: adev:work`; update description | small |
| Update manifest.yaml | Change triage module path | small |
| Sweep all `/adev:start` references | Use `Grep` to find, then `Edit` per file (or scripted sed-equivalent via Edit tool); skip Migration Notes sections | medium |
| Update test files | Rename test files referencing the old skill; update test content | small |
| Validation grep | Confirm zero unintentional `/adev:start` references remain | small |
| Run full test suite | `npm test` must pass | small |

## Acceptance Criteria

- [ ] `skills/start/` directory does not exist; `skills/work/` exists with same files
- [ ] `.context-index/specs/features/start/` does not exist; `.context-index/specs/features/work/` exists
- [ ] `skills/work/SKILL.md` frontmatter has `name: adev:work`
- [ ] `manifest.yaml` triage module path is `skills/work/`
- [ ] No unintentional `/adev:start` references in any shipping file (excluding Migration Notes and this spec)
- [ ] `/adev:work` invocation produces the expected triage behavior
- [ ] `/adev:start` invocation results in skill-not-found
- [ ] All existing tests pass after the rename
- [ ] Test file renames preserve test history
- [ ] No constitutional violations (no new deps; rename is autonomous within triage module boundary)
