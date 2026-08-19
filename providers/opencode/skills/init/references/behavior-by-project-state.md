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
- Generate `gates.yaml` from `templates/gates-template.yaml`, seeding **both** of the template's
  live tiers from the quality-gate values collected in Step 2 (Constitution wizard):
  - the fast-tier `test` gate from the wizard's test command, in argv form —
    `command: [npm, test]`, `command: [pytest]`, and so on;
  - the integration-tier `integration-test` gate, also in argv form. When the detected stack has
    a real integration entrypoint, seed it. When it does not, seed the no-op-if-absent idiom the
    domain starters use — on npm stacks,
    `command: [npm, run, --if-present, test:integration]` — so the tier is live and costs nothing
    until a `test:integration` script exists.

  Gate commands are **argv lists, never shell strings**: a string value is rejected at load by
  `lib/domains/merge-gates.mjs` with `INVALID_GATE`. A tier the wizard cannot seed keeps the
  template's `command: ""` sentinel, which is dropped at load with a named `INVALID_GATE` warning
  — a declared-but-unwired tier, not a broken scaffold, and the warning is the actionable signal.
  Never write a `{{ }}` placeholder into a `command` value (`gate-doctor/unsubstituted-placeholder`
  is error-severity).

  **A scaffolded project is born materialized.** `templates/gates-template.yaml` already ends with
  a top-level `materialized_at:` line, and seeding the gate commands does not touch it — copy it
  through verbatim. That marker is what tells every loader of a marked registry that the file it
  is reading IS the complete effective set, so a fresh scaffold passes the fail-closed guard on
  its very first run and no `adev governance materialize` step is needed here. The marker is
  write-once: running `adev governance materialize --registry gates` later leaves it unchanged.
  Be accurate about what the copied value MEANS if the user asks: it is a frozen literal fixed
  when the template's gate set was fixed, not a stamp of when this project was materialized.
  Nothing reads the value — every loader and the extension-install gate check only that a valid
  top-level marker is present. A project that wants a real instant deletes the line and runs
  `adev governance materialize --registry <name>`.
  Do the same for `governance/diagnostics.yaml` (from `templates/diagnostics-template.yaml`) and
  `governance/review.yaml` (Step 7c) — those are the other two marked registries. Do NOT add a
  marker to `boundaries.yaml` or `validate.yaml`: both are marker-exempt single-source registries,
  and a marker there would enforce nothing while breaking the empty-`boundaries.yaml` SKIP path.
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
   - A top-level `materialized_at:` line, copied verbatim from the one at the bottom of
     `templates/governance/review.example.yaml`. `review.yaml` is a marked registry: written
     without that line it fails closed on the project's first `/adev:review-specs` and an
     extension install into it is refused with `REGISTRY_NOT_MATERIALIZED`. Writing it here is
     what makes the scaffolded project born materialized. The marker is a claim about this file —
     that the reviewers listed above are the whole effective set, with nothing merged in behind
     them at run time — so if you write a `review.yaml` that omits a bundled reviewer, that
     reviewer does not run, which is the intended and now-visible behaviour.
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
