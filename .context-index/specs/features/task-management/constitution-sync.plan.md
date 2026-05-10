# Implementation Plan: Constitution and Sync Integration

> **Methodology:** adev
> **Charter:** .context-index/specs/features/task-management/charter.md
> **Spec:** .context-index/specs/features/task-management/constitution-sync.spec.md
> **Review:** PASS_WITH_NOTES (2026-03-31)
> **Platform:** none, javascript (ESM), node:test

**Goal:** Add a Task Management section to the constitution template and update the sync skill to emit a conditional task management block in agent files.

**Architecture:** Pure template and skill markdown changes. Constitution template changes only affect new scaffolds. Sync skill changes are additive — the block is emitted only when `tasks.backend` is configured.

---

## File Structure

**Modify:**
- `templates/constitution-template.md` — Add Task Management section
- `skills/sync/SKILL.md` — Add conditional Task Management block

**Reference (read, do not modify):**
- `.context-index/constitution.md` — Current constitution for reference
- `.context-index/specs/features/task-management/constitution-sync.spec.md` — Spec

## Context Packets

### Task 1 Context
- Spec: `constitution-sync.md` (Behaviors 1-2, Constitution Template)
- Reference: `templates/constitution-template.md` (current template structure)

### Task 2 Context
- Spec: `constitution-sync.md` (Behaviors 3-6, Sync Integration)
- Skill: `skills/sync/SKILL.md` (current sync instructions)

## Parallelization

- Task 1 and Task 2 are independent. Can run in parallel.

---

### Task 1: Update Constitution Template [specialist: none]

**Charter capability:** Constitution Section
**Files:**
- Modify: `templates/constitution-template.md`

**Tests:** No test file — template change. Acceptance verified by reading the file.

- [ ] **Write failing test**

```bash
! grep -q "Task Management" templates/constitution-template.md
```

- [ ] **Verify test fails** (no Task Management section yet)

- [ ] **Implement**

Add after the Quality Gates section in `templates/constitution-template.md`:

```markdown
## Task Management

<!-- Task tracking configuration. Controls how implementation issues are tracked.
     The backend is configured in manifest.yaml (tasks.backend).
     Options: file (markdown table, default), beads (beads_rust CLI). -->

Issues are tracked using the backend configured in `manifest.yaml` (`tasks.backend`).

When `tasks.backend: beads`:
- Use `br ready` to see actionable issues (open, unblocked)
- Use `br list --status in_progress` to see current work
- Use `br create "title" --type <bug|feature|task>` to create issues
- Use `br close <id> --reason "text"` to complete issues
- Issue data lives in `.beads/` (git-committed via `br sync --flush-only`)

When `tasks.backend: file` (or unset):
- The issue board lives at `.context-index/tasks/tasks.md`
- Update the markdown table directly to change issue status
- Use `/adev:issues` to manage issues interactively
```

- [ ] **Verify test passes** — grep finds "Task Management"
- [ ] **Commit**

```bash
git add templates/constitution-template.md
git commit -m "feat(task-management): add Task Management section to constitution template"
```

### Task 2: Update Sync Skill [specialist: none]

**Charter capability:** Sync Block
**Files:**
- Modify: `skills/sync/SKILL.md`

**Tests:** No test file — skill markdown change.

- [ ] **Write failing test**

```bash
! grep -q "BEGIN TASK MANAGEMENT" skills/sync/SKILL.md
```

- [ ] **Verify test fails**

- [ ] **Implement**

Add a conditional Task Management block to the Claude format and OpenCode format sections in `skills/sync/SKILL.md`. Insert after the Context Index section, before User Additions:

```markdown
   ### Task Management block (conditional)

   Read `tasks.backend` from `manifest.yaml`. If configured:

   ```markdown
   ## Task Management
   <!-- BEGIN TASK MANAGEMENT -->
   [Include the Task Management section from constitution.md.
    If tasks.backend is "beads", include br command reference.
    If tasks.backend is "file", include markdown table reference.
    If constitution has no Task Management section, generate from
    the default content matching the configured backend.]
   <!-- END TASK MANAGEMENT -->
   ```

   If `tasks.backend` is not configured in the manifest, omit this block entirely (no empty section).
```

- [ ] **Verify test passes** — grep finds "BEGIN TASK MANAGEMENT"
- [ ] **Commit**

```bash
git add skills/sync/SKILL.md
git commit -m "feat(task-management): add conditional task management block to adev:sync"
```

---

## Quality Gates

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied
