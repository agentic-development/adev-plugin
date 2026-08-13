---
name: adev:init
description: "Initialize or diagnose the .context-index/ directory. Interactive wizard that explains each layer, detects existing setup, and lets users opt in or skip per layer. Use --brownfield for existing codebases, --dry-run to preview without writing. Trigger when the user wants to set up adev, initialize context, start a new project with adev, or diagnose a broken context-index. In Codex, invoke with $adev:init"
---

# Initialize Context Index

Interactive setup wizard for the Agentic Development Framework. Walks through each context layer one at a time, explains what it does, and lets the user opt in or skip.

## Arguments

- No arguments: interactive wizard (detects greenfield vs. existing setup automatically)
- `--brownfield`: adds reverse-chartering, ADR archaeology, and coverage analysis
- `--dry-run`: shows what would be created without writing any files
- `--workspace`: initialize a workspace root that aggregates multiple child repos under one `adev-workspace.yaml`

### Load Skill Extensions

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill init
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

## Behavior by Project State

### Detecting First Run vs. Diagnostic Mode

**The presence of `.context-index/` does NOT mean the project has been configured.**
`adev install` (the CLI step that runs *before* `/adev:init`) always scaffolds a
minimal `.context-index/` from templates — it creates `manifest.yaml`,
`constitution.md`, the directory tree, and stamps `adev_version` — then tells the
user to run `/adev:init` next. So on a fresh install the directory always exists,
but it is still in **pristine template state** (unconfigured).

Decide the mode by whether the context index has actually been **configured**, not
by whether the directory exists:

1. `.context-index/` is absent → **First Run** (onboarding wizard).
2. `.context-index/` exists but is still in pristine template state → **First Run**
   (onboarding wizard). Treat it as unconfigured when ANY of these hold:
   - `manifest.yaml` is missing, or still contains the template placeholders
     `{{ project_name }}` / `{{ project_description }}`.
   - `constitution.md` is missing, or still contains the template placeholder
     `{{ project_name }}` or the unfilled principle stubs (`1. ...`, `2. ...`).
   In this case do NOT report "existing project" or run the health check — the
   install merely scaffolded the skeleton; the user has not configured anything
   yet. Proceed with the onboarding wizard below (files already present are
   overwritten/filled in as the user answers each step).
3. `.context-index/` exists AND is configured (placeholders replaced with real
   values) → **Diagnostic Mode** (health check).

### No `.context-index/` exists, or it is unconfigured (First Run)

This IS the onboarding experience. Walk through each layer interactively:

```
Step 1/11: Project Analysis
  Analyzing your project...

  Detected:
  - Framework: Next.js 16.1 (App Router)
  - Language: TypeScript (strict mode)
  - Database: PostgreSQL via Prisma
  - Auth: Clerk
  - Deployment: Vercel
  - Existing context: CLAUDE.md (47 lines), AGENTS.md (120 lines)

  → Does this look right? (yes / edit)
```

```
Step 2/11: Constitution
  The constitution is the core of adev. It defines your project's
  non-negotiable principles, coding standards, and architecture
  boundaries. It stays under 200 lines and syncs to CLAUDE.md
  and other agent files automatically.

  Every AI agent that works on your project reads the constitution
  first. It tells them what rules to follow and where to find
  deeper context.

  I'll ask you a few questions to draft one.

  → Ready to create your constitution? (yes / skip for now)
```

If the user says yes, proceed with the constitution wizard:
- Project identity (one-line description, repo type)
- Non-negotiable principles (suggest 3-5 based on detected stack, user confirms/edits)
- Coding standards (detect from tsconfig/eslint/prettier, user confirms)
- Architecture boundaries (suggest based on project structure, user confirms)
- Quality gate commands (detect test/lint/typecheck commands from package.json scripts)
- Merge policy:

```
  Your merge policy controls whether agents can merge to main
  or must open pull requests.

  → Merge policy: pr (recommended) / merge / ask
```

Seed the `completion` section in the generated manifest with the user's answer. Default to `pr`.

Generate `constitution.md` from answers using the template at `${CLAUDE_PLUGIN_ROOT}/templates/constitution-template.md`.

```
Step 3/11: Platform Context
  Platform context captures your tech stack so agents make
  technology-aware decisions. When an agent needs to choose
  between Redis and Postgres, it checks here first.

  Based on your project, I generated:

  framework: nextjs
  version: "16.1"
  language: typescript
  database: postgresql
  orm: prisma
  auth: clerk
  deployment: vercel
  ...

  → Save this? (yes / edit / skip)
```

After saving the stack, prompt for model tiers:

```
  Model tiers let skills pick the right model for each task.
  Defaults (from model-routing spec):

    fast:      claude-haiku-4-5-20251001  # diffs, pattern matching, gaming detection
    capable:   claude-sonnet-4-6          # code generation, test authoring
    reasoning: claude-opus-4-7            # architecture review, cross-cutting analysis

  → Accept defaults / enter custom model IDs / skip
```

- **Accept defaults:** write the three keys with the hardcoded default values shown above.
- **Enter custom model IDs:** prompt for each tier value individually; accept empty to keep the default.
- **Skip:** write the three keys with blank values (skills will log a one-time advisory on first dispatch).

Write the `model_tiers` section to `platform-context.yaml` immediately after the stack fields, with inline comments matching the tier descriptions above.

```
Step 4/11: Orientation
  The orientation file is a human-written guide to your codebase.
  It tells agents where to find things: which directory handles
  auth, where the API routes live, how the modules connect.

  I can draft one from your directory structure. You should
  review and refine it since you know the codebase best.

  → Generate a draft? (yes / skip)
```

If yes, analyze directory structure, identify key modules, produce a brief `orientation/architecture.md` (3-5 paragraphs describing the codebase layout and module relationships).

```
Step 5/11: Product Charter
  A product charter defines WHAT you are building at the highest
  level: vision, module map, cross-cutting concerns, and quality
  attributes. Feature charters break this down per module.

  → Draft a product charter from your README? (yes / skip / I'll write one later)
```

```
Step 6/11: External References

  Does this project depend on external repos, API contracts,
  or shared standards? (e.g., company coding standards, OpenAPI specs,
  shared design tokens)

  → yes / no (skip)
```

If yes:
- Prompt for each reference: slug, source URL/repo, path, refresh interval
- Add entries to `external_contexts` in manifest
- Create `.context-index/references/` directory
- Show summary of configured references

If no: skip, most projects start without this.

```
Step 7/11: Governance Policies

  Declarative governance lets you define quality gates, architectural
  boundary rules, risk-based review policies, a project reviewer
  registry, and a project validate check registry as YAML files.
  Skills enforce these automatically during planning, implementation,
  and validation.

  Without governance files, adev uses the bundled defaults — the three
  reviewers (structural-architect, security-reviewer, consistency-
  analyzer) and the 12 bundled validate checks ship enabled; quality
  gates come from the constitution.

  → Set up governance? (yes / skip)
```

If yes, walk the sub-steps in order. Sub-steps 7a-7e are independent — the user may opt in or skip each.

### Step 7a: Foundation files

- Create `.context-index/governance/` and `.context-index/governance/overrides/`
- Generate `gates.yaml` from `templates/gates-template.yaml`, seeding gate commands from the quality-gate values collected in Step 2 (Constitution wizard)
- Copy `boundaries.yaml` from `templates/boundaries-template.yaml` (empty rules, commented examples)
- Copy `risk-policies.yaml` from `templates/risk-policies-template.yaml` (sensible defaults). The
  copied file carries a literal `test_depth` value per risk level (`thorough` / `standard` /
  `minimal` for `high` / `medium` / `low`) — these are real scalars in the template, not `{{ }}`
  placeholders, so no substitution step runs here.
- Do not emit `governance/sensitive-paths.yaml` on greenfield init. It is optional and
  extend-only — the built-in default applies until the project chooses to extend it. State this
  explicitly in the Step 7 summary (below) so the user does not read its absence as an oversight.

If no to Step 7 entirely: skip. Governance/ is optional.

**Test policy defaults (unconditional — not gated by the Step 7 governance opt-in).**
`test_policy.granularity` and `test_policy.escalation` live in `manifest.yaml`, not
`governance/`, so they are already present whether or not the user opts into Step 7:
`templates/manifest-template.yaml` ships an uncommented `test_policy:` block with literal
defaults (`granularity: per-behavior`, `escalation: true`) that `adev install` copies verbatim
when it scaffolds `manifest.yaml`. `/adev:init` does not prompt for these values on greenfield —
there is no per-project reason to differ from the domain default at first run — but does verify
them: whenever this wizard writes or rewrites `manifest.yaml` (including the First Run path
above, where an unconfigured manifest gets its placeholders "overwritten/filled in as the user
answers each step"), it carries the `test_policy` block forward with its literal values rather
than dropping it. Behavior 10 requires init to **write** this block on greenfield, not merely
inherit it — so an absent `test_policy` block after any wizard write is itself a failure, not a
silent fallback to `parseTestPolicy`'s per-behavior default.

**Placeholder guard — `UNSUBSTITUTED_POLICY_PLACEHOLDER`.** This extends the unconfigured-state
check at "Detecting First Run vs. Diagnostic Mode" above (`{{ project_name }}` etc.) with a
second, distinct check that runs as a post-write verification whenever `manifest.yaml` or
`risk-policies.yaml` is written or confirmed during this step: unlike the unconfigured-state
check, which treats a surviving placeholder as "run the wizard" (not an error), a surviving
placeholder in the `test_policy` block or the `test_depth` fields is always a bug — the template
values are already literal, so nothing should ever need substitution here. Fail init with
`UNSUBSTITUTED_POLICY_PLACEHOLDER`, naming the offending field (e.g. `test_policy.granularity`
or `policies.high.test_depth`) and its file, when any of these hold after the write:
- the `test_policy` block or any `policies.<level>.test_depth` field still contains an
  unsubstituted `{{ }}` placeholder;
- the field is present only as a commented-out line (`# granularity: ...`, `# test_depth: ...`);
- the `test_policy` block is **absent** from `manifest.yaml` entirely after a wizard write (the
  Behavior 10 write-not-inherit case above).

### Step 7b: External-skill discovery

Before proposing the review/validate registries, scan the project for pre-existing skills, commands, and agent definitions that could be adopted as reviewers, checks, or quality-gates. Surface them so the user does not rewrite work they already have.

**Search locations** (read-only probe; absent directories skip silently):

- `.claude/commands/*.md` — project-scoped Claude Code slash commands
- `.claude/agents/*.md` — project-scoped Claude Code subagents
- `.claude/skills/*/SKILL.md` — project-scoped custom skills
- `~/.claude/commands/*.md` + `~/.claude/agents/*.md` — user-scoped (read title + description only, never adopt without explicit user opt-in)
- `.cursor/rules/*.md` and `.cursorrules` — Cursor rules
- `.github/copilot-instructions.md` — Copilot instructions
- `.continue/config.json`, `.windsurf/**` — other agent configs
- Project-local `skills/**/SKILL.md` (adev convention)
- Superpowers / Spec-kit artifacts if present (`.superpowers/**`, `.spec-kit/**`)

**Classification heuristic.** For each discovered file, read the first ~200 lines. Classify by intent (keywords in title / frontmatter `description` / first paragraph):

| Signal | Adopted as |
|--------|-----------|
| "review", "audit", "inspect", "critique", "check for" | **Package-mode reviewer** in `governance/review.yaml` |
| "verify", "validate", "ensure compliance with", "confirm" | **`subagent-review` check** in `governance/validate.yaml` |
| Shell command / test runner / linter / formatter | **`quality-gate` check** in `governance/validate.yaml` |
| Documentation / planning / brainstorming / one-off | **Skip** — not a governance candidate |

Ambiguous cases (intent unclear): default to **skip** and note the file in the summary so the user can revisit manually.

**Prompt, per discovered candidate:**

```
  Found .claude/commands/security-audit.md
    Title: "Security Audit"
    First line: "Audit the authentication flow for OWASP Top 10 risks."
    Proposed role: package-mode reviewer
      id: project.security-audit
      dispatch: triggered on patterns you confirm below
      profile: reviewer-capable

  Adopt this? (yes / skip / re-classify as validate-check / show more)
```

If "show more": print the file's first 30 lines.

If "re-classify": swap between reviewer / validate-check / quality-gate; ambiguous files may also be left as "skip".

**Collect all adopted candidates** into a working set. They're written in Steps 7c / 7d. Each adopted entry carries:
- Source file path (for the `package.skill` field or the `prompt` field)
- Proposed `id` (prefixed `project.<slug>`)
- Proposed profile (`reviewer-capable` for reviewers, `read-only` for quality-gates)
- Proposed triggers: for reviewers with no obvious path pattern, ask the user.

**User-scoped files are NEVER auto-copied.** If a user-scoped file (`~/.claude/...`) is adopted, prompt whether to copy it into the project tree or reference it from its global location (with a caveat that global references don't survive `git clone`). Default: copy into `.context-index/skills/adopted/<slug>/SKILL.md`.

### Step 7c: Review registry (`governance/review.yaml`)

1. **Scan for existing charters.** Glob `.context-index/specs/features/*/charter.md`. If none exist, skip the "project-specific reviewers from charters" prompt.

2. **Check for legacy specialists.** Read `.context-index/manifest.yaml`. If it contains a non-empty `specialists:` list AND `governance/review.yaml` does not yet exist:

   ```
   ⚠ Legacy specialists found in manifest.yaml (N entries):
     - my-specialist (triggers: **/payment.md, stripe)
     - another-spec (triggers: specs/features/auth/**)

     These still work in 0.18.0 via a one-time deprecation advisory,
     but support is scheduled for removal in 0.19.0.

   → Migrate to governance/review.yaml now? (yes / later)
   ```

   If yes: convert each specialist in-memory to a reviewer entry under the `reviewer-capable` profile with `dispatch: triggered`, and remove the `specialists:` block from `manifest.yaml` at write time.

3. **Bundled reviewer customization.**

   ```
   The three bundled reviewers run by default:
     structural-architect  (reasoning tier, blocker cap)
     security-reviewer     (capable tier,   blocker cap)
     consistency-analyzer  (fast tier,      blocker cap)

   Customize?
     [d] disable one
     [c] cap severity for one
     [p] propose project reviewers from detected charters
     [s] skip customization
   ```

   On **[d]** — list the three ids; user picks one. Write `enabled: false`.

   On **[c]** — pick reviewer + new cap (`blocker` / `warning` / `suggestion`).

   On **[p]** — for each charter found in step 1, propose:

   ```
     Module 'billing' (charter: specs/features/billing/charter.md)
     Propose project reviewer?
       id: project.billing-domain
       dispatch.triggered:
         patterns: ["specs/features/billing/**/*.md"]
         keywords: (extracted from charter frontmatter + first section)
         min_score: 1
       profile: reviewer-capable
       prompt: .context-index/prompts/billing-reviewer.md
               (we'll scaffold a stub — edit after init)

     → yes / skip / edit keywords
   ```

   If yes: scaffold the stub prompt at the shown path with a TODO framing. Add the entry to the working set.

4. **Integrate adopted external skills.** For each "reviewer" entry adopted in Step 7b, confirm triggers + profile, then add it:

   ```
     Adopted external skill: .claude/agents/security-audit.md → project.security-audit
     Triggers?
       [a] always    [t] triggered (paths + keywords)    [s] skip
   ```

5. **Write the file.** If at least one customization / migration / adoption was selected, write `.context-index/governance/review.yaml` with:

   - A `reviewers:` block containing all chosen entries.
   - A commented `context_packs:` block seeded with `base: include: []` for easy extension.
   - A pointer at the bottom: `# See templates/governance/review.example.yaml for more examples.`

   If nothing was selected, DO NOT write the file — keep the repo on the zero-config path.

### Step 7d: Validate registry (`governance/validate.yaml`)

#### Step 7d.0: Scaffold from domain starter (single-source model)

Before any customization, materialize the project's `governance/validate.yaml` from the resolved domain's starter. This makes the project's validate check registry self-contained and visible at a single path — the single-source model from `validate-config-single-source.spec.md`.

1. Call `loadDomainConfig(resolvedDomain, 'validate', repoRoot, pluginRoot)`.
2. If the call returns a starter object AND `.context-index/governance/validate.yaml` does not yet exist:
   - Read the starter file directly (the same file that `loadDomainConfig` resolved) and copy its bytes verbatim into `.context-index/governance/validate.yaml`.
3. If `loadDomainConfig` returns `null` for the resolved domain (no starter shipped for this domain):
   - Fall back to `loadDomainConfig('software', 'validate', repoRoot, pluginRoot)` and write from the software starter.
   - Print exactly: `"No validate.yaml starter for domain '<domain>'; scaffolded from 'software' as fallback."`
4. If `.context-index/governance/validate.yaml` already exists: no-op (idempotent).
5. Do NOT prompt the user — this scaffold step is automatic, like `gates.yaml`.

Subsequent customization steps (7d.1–7d.5 below) operate on the already-scaffolded file.

#### Step 7d.1: Customize (existing behavior)

1. **Read platform-context.yaml** (captured in Step 3) plus detect stack signals at repo root: `package.json`, `pyproject.toml`, `Pipfile`, `go.mod`, `Cargo.toml`, `Gemfile`, `pom.xml`, `build.gradle`.

2. **Propose quality-gate candidates.** Cross-reference the stack against available scripts. Only propose commands that actually exist.

   | Detected | Propose (only if script/command exists) |
   |----------|-----------------------------------------|
   | `package.json` with scripts | `[npm, test]`, `[npm, run, lint]`, `[npm, run, typecheck]`, `[npm, run, build]` |
   | `pyproject.toml` + `pytest` | `[pytest, -q]`, `[ruff, check, .]`, `[mypy, .]` |
   | `go.mod` | `[go, test, ./...]`, `[go, vet, ./...]`, `[golangci-lint, run]` (if installed) |
   | `Cargo.toml` | `[cargo, test]`, `[cargo, clippy, --, -D, warnings]`, `[cargo, fmt, --check]` |

   ```
     Detected stack: Node.js. Propose these quality-gates:
       [ ] npm test         (you have a "test" script)
       [x] npm run lint     (you have a "lint" script — recommend gating)
       [x] npm run typecheck (you have a "typecheck" script — recommend gating)
       [ ] npm run build    (long-running; skip unless you want it)

     Select the ones to add (space-separated numbers, "all", or "none"):
   ```

   For each selected: write an entry with `profile: read-only` (note: read-only scopes the ADAPTER tool surface, not the subprocess — we ship an explicit acknowledgement), `command` in argv form, `severity: error`, and ask about `fail_fast: true`.

3. **Integrate adopted external commands/validate-checks from Step 7b.** For each candidate classified as `subagent-review` or `quality-gate`, add it to the checks list with the confirmed profile and, for subagent-review, a resolved prompt path.

4. **Offer to disable noisy bundled checks:**

   ```
     Disable any of these for this project?
       [ ] validate.check-10-platform-drift    (false-positives on small repos)
       [ ] validate.check-11-visual-verification (no UI — requires Playwright MCP)
       [ ] validate.check-12-heuristic-extraction (observational; enabled by default)
   ```

   For each selection, write an entry with `enabled: false`.

5. **Write the file** only if at least one selection was made (same zero-config preservation rule as 7c). Seed a commented block at the bottom pointing at `templates/governance/validate.example.yaml`.

### Step 7e: Profile overlay (conditional)

Only trigger this if any quality-gate added in 7d declared a required env key (e.g. an e2e gate that needs a `DATABASE_URL`). Ask which env keys are needed, which file supplies them, and generate:

```
  Quality-gate 'project.e2e-smoke' would run with env scoped to the
  declared profile — no invoking-shell inheritance. Create
  .context-index/profiles.yaml with a project-gate-profile that reads
  the required keys from .env?

  → yes / skip
```

If yes: write `.context-index/profiles.yaml`:

```yaml
profiles:
  project-gate-profile:
    description: "Declared posture for project quality-gate subprocesses."
    extends: read-only
    env:
      files:
        - ".env"
        - "optional:.env.local"
      allow:
        required: [<keys the user names>]
        optional: []
```

Then rewrite the relevant `governance/validate.yaml` entry to reference `profile: project-gate-profile`.

### Step 7 summary

After all sub-steps, print what was written:

```
  Governance setup complete.

  Files written:
    .context-index/governance/gates.yaml               (from constitution)
    .context-index/governance/boundaries.yaml          (template)
    .context-index/governance/risk-policies.yaml       (template — literal test_depth per risk level)
    .context-index/governance/review.yaml              (2 project reviewers + 1 migrated specialist)
    .context-index/governance/validate.yaml            (2 project quality-gates, check-10 disabled)
    .context-index/profiles.yaml                       (project-gate-profile)
    .context-index/prompts/billing-reviewer.md         (stub — edit before first run)

  Not written: governance/sensitive-paths.yaml — optional and extend-only; the
  built-in default sensitive-path set applies until you choose to extend it.

  manifest.yaml already carries test_policy (granularity: per-behavior,
  escalation: true) — scaffolded by `adev install`, not written here.

  Adopted skills from existing tools:
    .claude/commands/security-audit.md → project.security-audit (reviewer)
    .claude/agents/accessibility.md    → project.accessibility (validate-check)

  Next: run /adev:review-specs --spec <path> to verify the registries load
  cleanly. See docs/governance.md for customization beyond this wizard.
```

**Legacy gate migration (brownfield folded into Step 7a).** When running Step 7a on a project that already has a `gates:` block in `manifest.yaml` AND no `governance/gates.yaml`, print the legacy-gates notice before copying the template:

```
  ⚠ Legacy gates found in manifest.yaml. To adopt the unified gates
    system, move your gate definitions to governance/gates.yaml.

  → Scaffold governance/gates.yaml from template now? (yes / skip)
```

On yes: create `governance/gates.yaml` from `templates/gates-template.yaml`, seeding from the legacy entries (not from the constitution values in this case — the legacy block is already more specific). Note that init no longer writes a `gates:` block into new `manifest.yaml` files — gates live in `governance/gates.yaml`.

On skip: leave `manifest.yaml` unchanged; note "you can migrate later by running `/adev:init` again".

```
Step 8/11: Task Management
  Task management lets /adev:plan and /adev:implement create,
  update, and close issues automatically as work progresses.
  Without it, planning and implementation still work but issue
  tracking is skipped.

  Backends:
  - file:  Markdown-based board at .context-index/tasks/tasks.md
           (zero dependencies, works everywhere)
  - beads: Uses beads_rust (br) for structured task storage
           (requires br on PATH)

  → Choose a backend: file (recommended) / beads / skip
```

**Behavior:**

Always present this prompt. If `manifest.yaml` already has a `tasks:` section, show the current backend as the default but still let the user change it.

When the user selects a backend:
- **file:** Add `tasks:\n  backend: file` to `manifest.yaml`. Report: "Task management enabled (file backend). Issues will be tracked in `.context-index/tasks/tasks.md`."
- **beads:** Check if `br` is on PATH. If yes, add `tasks:\n  backend: beads`. If no, warn: "`br` not found. Install beads_rust first, or use `file` backend." and re-prompt.
- **skip:** Leave manifest unchanged. Note: "/adev:plan and /adev:implement will skip issue tracking."

### Step 8a: Session Capture preferences

```
Step 8a/11: Session Capture
  Session Capture writes a markdown summary of each agent session
  to .context-index/sessions/<YYYY-MM-DD>-<session-id>.md.
  Consumers like /adev:retro, /adev:work, /adev:status, and
  /adev:hygiene read those summaries for cross-session context.

  Modes:
  - hook         driven by Claude Code's SessionEnd + PreCompact
                 hooks (recommended for new projects)
  - post-commit  legacy back-compat path: captures fire from
                 .githooks/post-commit
  - off          disable capture entirely

  gitignored:    when true, the installer maintains a paired-marker
                 block in .gitignore covering .context-index/sessions/
                 (default true for new projects)
```

Invoke `adev init prompt session-capture` to drive this step. The verb owns the detection-based defaults (new project → `capture: hook, gitignored: true`; existing project → `capture: post-commit, gitignored: false`), surfaces the CON-8 conflict warning when stored manifest values disagree with detection signals, and writes the chosen values back to `manifest.yaml` under `integrations.session_capture.{capture, gitignored}` while preserving any existing `provider` key verbatim (SA-5).

Re-running `/adev:init` on a project that already has these values reads them as the default-accept; user content outside the installer-managed paired markers in `.githooks/post-commit` and `.gitignore` is never touched.

Spec: `.context-index/specs/features/session-awareness/hook-driven-capture.spec.md`.

```
Step 9/11: Sync Targets
  Your constitution will be synced to agent-specific files so
  every AI tool gets the same rules.

  Detected targets:
  ✓ CLAUDE.md (Claude Code)
  ✓ AGENTS.md (generic fallback)
  ✗ .cursorrules (no .cursor/ directory found)
  ✗ copilot-instructions.md (no .github/ directory found)

  → Confirm sync targets? (yes / add more / edit)
```

```
Step 10/11: Plugin Conflicts
  adev replaces the workflows provided by Superpowers and Spec Kit.
  Running them together causes duplicate skill invocations and
  competing gateway hooks.

  Detected plugins that conflict with adev:
  ⚠ superpowers — brainstorming, planning, TDD, and code review
    overlap with /adev:brainstorm, /adev:plan, /adev:implement,
    and /adev:validate.

  Recommended: disable conflicting plugins for THIS project only.
  They stay installed globally for your other projects.

  → Disable Superpowers for this project? (yes / no, I'll manage it myself)
```

If the user says yes, create or update `.claude/settings.json` in the project:

```json
{
  "enabledPlugins": {
    "superpowers@claude-plugins-official": false
  }
}
```

If `.claude/settings.json` already exists, merge the `enabledPlugins` key without overwriting other settings.

If the user says no, warn them:

```
  ⚠ Both adev and Superpowers will be active. You may see duplicate
  skill suggestions. If this becomes noisy, run:
    /adev:init
  and select "Fix issue" to disable Superpowers later.
```

Detection logic: check for installed plugins by looking at:
- `~/.claude/settings.json` → `enabledPlugins` for globally enabled plugins
- Project `.claude/settings.json` → `enabledPlugins` for project-level overrides
- Known conflicting plugins: `superpowers@claude-plugins-official`

If no conflicting plugins are detected, skip this step entirely.

```
Step 11/11: Summary

  Ready to create:
  ✓ .context-index/constitution.md          (87 lines)
  ✓ .context-index/manifest.yaml            (4 sync targets)
  ✓ .context-index/platform-context.yaml    (detected stack)
  ✓ .context-index/orientation/architecture.md (draft)
  ✓ .context-index/specs/product.md         (draft)
  ○ .context-index/specs/features/          (empty, ready for charters)
  ○ .context-index/adrs/                    (empty, ready for decisions)
  ○ .context-index/references/              (external contexts, if configured)
  ○ .context-index/governance/              (gates, boundaries, risk policies, if configured)
  ○ .context-index/samples/                 (empty, ready for examples)

  Will also:
  - Sync constitution → CLAUDE.md, AGENTS.md
  - Add .context-index/hygiene/ to .gitignore
  - Commit all files

  → Create everything? (yes / go back to step N / cancel)
```

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

## Brownfield Mode (`--brownfield`)

Adds these steps to the interactive wizard:

**After Step 1 (Analysis):**
```
Brownfield Analysis
  I found existing context to incorporate:
  - CLAUDE.md: 47 lines of project instructions
  - AGENTS.md: 120 lines of architecture docs
  - README.md: project description and setup guide

  → Absorb these into the constitution? (yes / review first / skip)
```

If yes, extract relevant rules from existing files into the constitution draft. User reviews the merged result.

**After Step 5 (Product Charter):**
```
Reverse Chartering
  Based on your directory structure, I identified these modules:
  - src/app/api/ → API routes (12 route handlers)
  - src/components/ → UI components (34 files)
  - src/lib/auth/ → Authentication (Clerk integration)
  - prisma/ → Database schema (8 models)

  → Generate feature charter drafts for each? (yes / select which / skip)
```

**After Step 6 (Sync Targets):**
```
ADR Archaeology
  Scanning git history for architectural decisions...

  Found 5 significant changes:
  1. 2026-01-15: Added Clerk auth (replaced NextAuth)
  2. 2026-02-01: Migrated from Pages Router to App Router
  3. 2026-02-20: Added Prisma (replaced raw SQL)
  4. 2026-03-01: Added i18n (next-intl)
  5. 2026-03-10: Added Vercel Blob for file uploads

  → Generate retrospective ADR drafts? (all / select / skip)
```

All generated drafts are marked: `<!-- DRAFT: Generated by /adev:init. Review and refine. -->`

**After Step 7 (Governance), if the project has an existing test suite:**

Instead of the domain default (`per-behavior`), propose an **inferred** granularity, labelled
`inferred`, naming the evidence for the proposal:

```
Test Policy Inference
  Scanning existing test suite for a granularity signal...

  Found 34 source files under src/, 31 with a matching *.test.* file
  (e.g. src/auth/session.ts → src/auth/session.test.ts) — a consistent
  per-file naming convention.

  → Proposed granularity: per-task (inferred — 31/34 source files have a
    1:1 test file). Domain default is per-behavior.

  Accept inferred value / use domain default / choose manually?
```

When no consistent per-file convention is found (or no test suite exists), fall back to the
domain default with a stated reason instead of guessing:

```
Test Policy Inference
  Scanning existing test suite for a granularity signal...

  Found 12 test files against 89 source files, no consistent per-file
  naming convention (tests grouped by feature area, not 1:1 with source
  files).

  → No reliable per-file signal. Proposing domain default: per-behavior.
```

Whichever value is accepted becomes the literal `test_policy.granularity` written to
`manifest.yaml`, subject to the same `UNSUBSTITUTED_POLICY_PLACEHOLDER` guard as the greenfield
path.

> **Implementation note.** This step is currently agent-performed analysis (read the source
> tree, count matches, reason about the convention) rather than a dedicated helper — the spec's
> Interface Contract names a future `inferGranularity(projectRoot, sourceRoots)` function for
> this, but no `adev test-policy` subverb wraps it yet. Per the cli-driver-surface charter, a
> SKILL.md step with this shape of branching/lookup logic should eventually call a named CLI
> verb rather than rely on agent judgment alone; wiring `inferGranularity` behind such a verb is
> tracked as follow-up scope, not implemented in this task (see issue-611).

**Final brownfield step:**
```
Coverage Report
  Generating context coverage analysis...

  High churn, no charter:  src/lib/auth/ (42 changes in 30 days)
  High churn, no charter:  src/app/api/ (38 changes in 30 days)
  Low churn, no charter:   prisma/ (5 changes in 30 days)
  Chartered:               (none yet — this is a fresh setup)

  Saved to .context-index/hygiene/coverage-report.md

  Recommendation: Start by chartering src/lib/auth/ — it changes
  most frequently and will benefit most from structured context.
```

## Dry-Run Mode (`--dry-run`)

Shows what would be created without writing anything. Runs the full analysis (tech stack detection, directory scanning, git history if brownfield) but only prints the summary:

```
/adev:init --dry-run

Would create:
  .context-index/constitution.md          (~85 lines)
  .context-index/manifest.yaml            (2 sync targets)
  .context-index/platform-context.yaml    (Next.js 16, Prisma, Clerk)
  .context-index/orientation/architecture.md
  .context-index/specs/product.md

Would sync to:
  CLAUDE.md (new file)
  AGENTS.md (would merge with existing 120-line file)

Would modify:
  .gitignore (add .context-index/hygiene/)

Run /adev:init to proceed.
```

## Persona Configuration (optional)

After all context files are created, ask the user if they want a project-specific persona override:

```
Would you like to set a project-specific output persona? (product/developer/architect/skip)
This creates .context-index/user-config with your persona preference for this project.
Your global default will be used if you skip.
```

If the user selects a persona (`product`, `developer`, or `architect`), write `.context-index/user-config`:

```
# Project-specific adev user config
persona=<selected>
```

If the user enters `skip` or presses enter without a value, do not create the file.

Ensure `.context-index/user-config` is listed in the project's `.gitignore` (the CLI already handles this during installation, but verify it is present).

## Session History Files

The CLI installer ships a git `post-commit` hook (`.githooks/post-commit`) that auto-generates one session summary file per commit at `.context-index/sessions/<date>-<shortSHA>.md`. These files contain commit metadata + subject/body and are consumed by `/adev:retro` (via the `## Session Activity` section in Step 1.8 — see `skills/retro/SKILL.md`), `/adev:hygiene`, and audit skills. `/adev:retro` reads both post-commit-mode files (this hook) and hook-mode files (`hook-driven-capture`) within the analysis window and renders tool-use distribution, per-spec session counts, token/cost trends, sessions ↔ closed-issues cross-reference, and frame-anchored Context Gaps.

The installer's `.gitignore` block intentionally does **not** include `.context-index/sessions/` — the convention is tracked content, batch-committed under `chore(sessions): record YYYY-MM-DD transcripts` messages. If the project prefers to keep them local-only, add `.context-index/sessions/` to `.gitignore`. Surface this choice to the user during init when relevant. Full reference: `docs/hooks.md` > Git Hooks > `post-commit`.

## After Initialization

```
Context Index initialized at .context-index/

Your constitution has been synced to CLAUDE.md. Every AI agent
that works on this project will now follow your rules.

Next steps:
- Review your constitution: .context-index/constitution.md
- Charter your first feature: /adev:brainstorm
- Or specify existing work: /adev:specify

The constitution linter hook is active — it will validate
your constitution whenever you edit it.
```

## Domain Extension Picker

After the providers and context-index scaffold steps, `adev install` (and
`adev upgrade` on projects with no installed domain profile) presents a
single picker prompt to surface installed first-party domain extensions.

The picker presents:

1. `software (bundled, default)` — the bundled software profile, no install.
2. One option per first-party domain extension (e.g. `data-engineering`,
   `process-automation`) whose source directory exists on disk under the
   plugin root.
3. `skip` — picks no extension and writes `domain: software` to
   `manifest.yaml`.

Consequences per choice:

- **`software`** or **`skip`** — writes `domain: software` into the project's
  `.context-index/manifest.yaml`. No extension install runs.
- **A catalog entry** (e.g. `data-engineering`) — installs that extension via
  the existing `installExtension()` pipeline and writes
  `domain: <name>` into `manifest.yaml`.

After the picker completes, the install-completion summary prints exactly:

```
Domain: <name>
```

(canonical wording, no variant). The same banner string is used by `adev
install`, `adev upgrade`, and this SKILL doc — they stay in lockstep.

If you skip at picker time, you can install a domain extension later with:

```
adev extension install <source>
```

where `<source>` is a local path, npm package, or git URL.

The picker is skipped silently when invoked at a workspace root (no
current repo slug from `detectWorkspace()`). Workspace isolation rules
(ADR-0005) prevent the picker from writing to a sibling repo's manifest.
