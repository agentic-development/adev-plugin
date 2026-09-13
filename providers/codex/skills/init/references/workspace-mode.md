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
✓ Governance          gates.yaml, boundaries.yaml, risk-policies.yaml configured (risk tier: standard)
⚠ Gate Liveness       1 gate command still uses the pre-argv shell-string form
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
6. governance/gates.yaml has 1 gate command still in the pre-argv shell-string
   form — dropped at load, so it runs zero checks while looking configured

→ Fix issue 1: create charter for user-management? (yes / skip)
→ Fix issue 2: draft ADRs from git history? (yes / skip)
→ Fix issue 3: I'll skip samples for now
→ Fix issue 4: disable Superpowers for this project? (yes / no)
→ Fix issue 5: enable task management? (file / beads / skip)
→ Fix issue 6: migrate gate commands to argv form? (yes / skip)
```

**Governance line's risk tier tag.** The `(risk tier: <name>)` suffix comes from `resolveRiskTier(manifest)` (`lib/risk-tiers/resolve.mjs`). A project with no `risk_tier` key resolves to `standard` silently — this is not listed under "Issues found" and there is no fix-it prompt for it, since `standard` is a legitimate, unconfigured-but-valid state, not a defect. Changing tier on an already-materialized project is out of scope here (see Step 7.0's note on re-adoption).

**Gate Liveness check:** `Governance` above only checks that `gates.yaml` (and
its siblings) exist — a project can have a well-formed, present gates.yaml
whose gates are dropped at load and never run, which reads identically to a
project that passed them. Run:

```bash
adev governance migrate-gates --dry-run --json
```

Parse the JSON envelope's `migrated` and `skipped` arrays.

- Both empty: `✓ Gate Liveness` — no legacy shell-string commands found.
- `migrated` non-empty: `⚠ Gate Liveness` — N command(s) can be safely rewritten
  to argv form. Add an issue naming the count. On `yes`, re-run
  `adev governance migrate-gates` (without `--dry-run`) and report each
  command it rewrote.
- `skipped` non-empty: report those commands too — they contain shell
  metacharacters and were left as-is; note that they need a human to rewrite
  as an argv list or split into separate gates, since `migrate-gates` will
  never guess at a command it cannot safely split.

This check exists specifically because a plugin-cache version bump — the
common way this plugin itself upgrades — never runs `adev upgrade`, so a
project that only ever upgraded that way never received this repair. This
diagnostic-mode check is the reachable second path, run whenever a user
actually re-runs `/adev:init` after an upgrade.

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