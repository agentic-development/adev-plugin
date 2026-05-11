# Live Spec: Template Updates

---
charter: spec-lifecycle
status: validated
risk_level: low
milestone:
revision: 1
charter-revision: 1
created: 2026-03-27
updated: 2026-03-28
source-manifest:
  sha: "bf6c53c"
  files:
    - templates/charter-template.md
    - templates/live-spec-template.md
    - templates/manifest-template.yaml
    - cli/index.mjs
    - .githooks/prepare-commit-msg
    - .githooks/post-commit
  computed-at: "2025-04-25T00:00:00.000Z"
---

## Behavioral Contract

### Preconditions

- Template files exist at `templates/charter-template.md`, `templates/live-spec-template.md`, `templates/manifest-template.yaml`
- `/adev:init` uses these templates to scaffold new projects

### Behaviors

1. **When** `templates/charter-template.md` is used to create a new charter **then** the template includes `status`, `revision`, and `updated` fields in YAML frontmatter, and the Capability Map table includes a `Status` column with default value `—`.

2. **When** `templates/live-spec-template.md` is used to create a new spec **then** the template includes `revision`, `charter-revision`, `updated`, and `tracker-ref` fields in YAML frontmatter, with a comment explaining each field's purpose.

3. **When** `templates/manifest-template.yaml` is used to scaffold a new project **then** the template includes an `integrations:` section with `session_capture:` containing `provider:` (defaulting to `none`) and a comment explaining the options (`entire`, `native`, `none`).

4. **When** `/adev:init` scaffolds a new project **then** it creates a `.githooks/` directory containing `prepare-commit-msg` and `post-commit` hook scripts, and runs `git config core.hooksPath .githooks` to activate them.

5. **When** `/adev:init` is run on an existing project that already has `.githooks/` **then** it does not overwrite existing hooks — it only adds missing hook files and warns about existing ones.

6. **When** `/adev:init` scaffolds `.context-index/` **then** it creates a `sessions/` subdirectory for session summary storage.

### Postconditions

- All templates include the new lifecycle fields
- New projects scaffolded by `/adev:init` have `.githooks/` with git hooks installed and `core.hooksPath` configured
- New projects have `.context-index/sessions/` directory
- Existing projects are not broken by re-running `/adev:init`

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `.githooks/` already exists with custom hooks | Warn: "Existing hooks found — not overwriting. New hooks written as <name>.adev for manual merge." | HOOKS_EXIST |
| `git config` fails (not a git repo) | Warn: "Not a git repo — skipping git hooks setup" | NOT_GIT_REPO |
| Template file missing | `/adev:init` fails with: "Template <name> not found. Plugin may be corrupted." | TEMPLATE_MISSING |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — Templates are static markdown/YAML files consumed by `cpSync()`, no executable logic.
- **Principle:** "Hook protocol compliance" — Git native hooks (`.githooks/`) are separate from Claude Code hooks (`hooks/`) but coexist in the same plugin.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Update `templates/charter-template.md` | Add `status`, `revision`, `updated` frontmatter; add `Status` column to Capability Map | small |
| Update `templates/live-spec-template.md` | Add `revision`, `charter-revision`, `updated`, `tracker-ref` frontmatter | small |
| Update `templates/manifest-template.yaml` | Add `integrations.session_capture` section | small |
| Create `.githooks/prepare-commit-msg` | Git hook script for commit trailer injection | medium |
| Create `.githooks/post-commit` | Git hook script for session summary persistence | medium |
| Update `cli/index.mjs` | Add `.githooks/` scaffolding and `git config core.hooksPath` to init flow | medium |
| Create `templates/sessions/` placeholder | Add `.gitkeep` or README for sessions directory | small |
| Write tests | Test template content, init scaffolding, idempotent re-run | medium |

## Acceptance Criteria

- [ ] Charter template includes `status`, `revision`, `updated` fields and `Status` column in Capability Map
- [ ] Spec template includes `revision`, `charter-revision`, `updated`, `tracker-ref` fields
- [ ] Manifest template includes `integrations.session_capture.provider` with comments
- [ ] `/adev:init` creates `.githooks/` with `prepare-commit-msg` and `post-commit`
- [ ] `/adev:init` runs `git config core.hooksPath .githooks`
- [ ] `/adev:init` creates `.context-index/sessions/` directory
- [ ] Re-running `/adev:init` does not overwrite existing hooks
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
