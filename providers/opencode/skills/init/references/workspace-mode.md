## Workspace Mode (`--workspace`)

Use this mode at a monorepo or multi-repo root to create a workspace that aggregates child repos under shared governance.

### Guard: skip if already initialized

Before doing anything, check whether `adev-workspace.yaml` already exists in the current directory. If it does:

```
adev-workspace.yaml already exists. Run /adev:init to diagnose individual repos,
or edit adev-workspace.yaml directly to add/remove repos.
```

Exit without writing any files.

### Step W1: Scaffold workspace files

Scaffold `adev-workspace.yaml` from the workspace template at `${CLAUDE_PLUGIN_ROOT}/templates/workspace-template/adev-workspace.yaml`.

Also create a workspace `.context-index/` directory with a minimal `manifest.yaml` scoped to the workspace root (no constitution sync targets — workspace-level CLAUDE.md is out of scope and will not be created).

```
Workspace initialized:
  ✓ adev-workspace.yaml                   (from workspace-template)
  ✓ .context-index/manifest.yaml          (workspace scope)
```

No workspace-level CLAUDE.md is created. Each child repo manages its own agent files independently.

### Step W2: Auto-discover child repos

Scan immediate subdirectories (depth 1) for `.context-index/manifest.yaml`. Present discovered repos to the user:

```
Auto-discover child repos

  Found repos with .context-index/:
  ✓ ./api          (.context-index/manifest.yaml — Next.js API)
  ✓ ./web          (.context-index/manifest.yaml — React app)
  ✓ ./infra        (.context-index/manifest.yaml — Terraform)
  ? ./scripts      (no .context-index/ found)

  → Register discovered repos? (yes / select / skip)
```

- **yes:** register all discovered repos in `adev-workspace.yaml` under the `repos:` key.
- **select:** prompt for each repo individually — register or skip.
- **skip:** leave `repos:` empty; the user can add entries manually.

For each registered repo, write an entry:

```yaml
repos:
  - path: ./api
    name: api
  - path: ./web
    name: web
  - path: ./infra
    name: infra
```

### `.context-index/` exists AND is configured (Diagnostic Mode)

When run on a project whose `.context-index/` has already been configured (template
placeholders replaced with real values — see "Detecting First Run vs. Diagnostic
Mode" above), the wizard becomes a health check. Do NOT enter this mode merely
because the directory exists; a freshly installed-but-unconfigured skeleton must go
through First Run instead.

```
adev Context Index — Health Check

✓ Constitution        .context-index/constitution.md (92 lines, 6/6 sections)
✓ Manifest            .context-index/manifest.yaml (2 sync targets)
✓ Platform Context    Next.js 16, Prisma, Clerk, Vercel
✓ Product Charter     2 modules defined
⚠ Feature Charters    task-boards has charter, user-management does not
✗ ADRs                none found (3 architectural changes detected in recent git history)
✓ Orientation         architecture.md (last updated 12 days ago)
✗ Samples             empty directory
✓ External References references/ matches manifest (2 configured, 2 present)
✓ Governance          gates.yaml, boundaries.yaml, risk-policies.yaml configured
✓ Sync Status         CLAUDE.md matches constitution (synced 2 days ago)
⚠ Plugin Conflict     Superpowers is active globally but not disabled for this project
✗ Task Management     no tasks: section in manifest.yaml

Issues found:
1. user-management module has no charter
2. No ADRs — 3 recent architectural changes could be documented
3. No golden samples — agents have no reference implementations
4. Superpowers plugin may conflict with adev workflows
5. Task management not configured — /adev:plan and /adev:implement
   cannot track issues without tasks.backend in manifest.yaml

→ Fix issue 1: create charter for user-management? (yes / skip)
→ Fix issue 2: draft ADRs from git history? (yes / skip)
→ Fix issue 3: I'll skip samples for now
→ Fix issue 4: disable Superpowers for this project? (yes / no)
→ Fix issue 5: enable task management? (file / beads / skip)
```

**Fix issue 5 behavior (task management):**

Detect by checking whether `manifest.yaml` contains a `tasks:` section with a `backend` key.

- **If `tasks:` section is missing:** flag as issue and prompt.
- **If `tasks:` section exists:** show `✓ Task Management` with the configured backend and skip.

When the user selects a backend:
- **file:** Add `tasks:\n  backend: file` to `manifest.yaml`. Report: "Task management enabled (file backend). Issues will be tracked in `.context-index/tasks/tasks.md`."
- **beads:** Check if `br` is on PATH. If yes, add `tasks:\n  backend: beads`. If no, warn: "`br` not found. Install beads_rust first, or use `file` backend." and re-prompt.
- **skip:** Leave manifest unchanged. Note: "/adev:plan and /adev:implement will skip issue tracking."

After enabling, suggest: "Run `/adev:sync` to update CLAUDE.md with task management instructions."

This replaces the need for a separate `/adev:tour` skill. The init command IS the tour on first run, and the diagnostic on subsequent runs.
