[adev docs](README.md) > Advanced

# Troubleshooting & FAQ

This page covers common issues you may encounter when using adev, organized by symptom. Each entry describes what you see, why it happens, and how to fix it. The FAQ section at the end answers frequently asked questions.

## Troubleshooting

### Hook Warnings

#### "merge-guard blocked my push"

**What you see:** The merge-guard hook exits with code 2 and blocks your `git push` or `git merge` command.

**Why it happens:** You are trying to push or merge directly to a protected branch (typically `main` or `master`). The merge-guard hook enforces the project's merge policy by preventing direct pushes to protected branches.

**How to fix it:** Create a feature branch and open a pull request instead. Protected branches are configured in `manifest.yaml` under `completion.protected_branches`. If you need to change which branches are protected, edit that list — but never bypass the hook by force-pushing.

#### "constitution-linter warning"

**What you see:** A warning appears after editing the constitution file, indicating the constitution is too large or has structural problems.

**Why it happens:** The constitution linter hook runs after every edit to `constitution.md`. It checks that the file follows the expected structure (Identity, Non-Negotiable Principles, Coding Standards, etc.) and stays within a reasonable size. A malformed or oversized constitution can degrade agent performance because every skill reads it.

**How to fix it:** Review your constitution for sections that grew too long. Move detailed guidelines into specialist files (`.context-index/specialists/`) or ADRs (`.context-index/adrs/`). Keep the constitution under ~200 lines. Run `/adev:sync` after making changes to propagate updates to agent files.

#### "context-preflight warning"

**What you see:** A warning appears before source file edits, saying you have not read project context yet.

**Why it happens:** The context-preflight hook fires before `Edit` tool calls and checks whether the agent has read the constitution, manifest, or relevant specs in the current session. It is a safety net to prevent code changes that ignore project principles.

**How to fix it:** Read the relevant context files first. At minimum, the agent should read `.context-index/constitution.md` and `.context-index/manifest.yaml` before making code changes. Using `/adev:work` or any lifecycle skill handles this automatically. The warning is advisory and does not block the edit.

### Lifecycle Gate Blocks

#### "No charter found"

**What you see:** A lifecycle gate blocks you from running `/adev:specify` or `/adev:plan` because no Feature Charter exists for the module.

**Why it happens:** adev enforces a design-first workflow. You cannot write specs or plans without first defining the feature's scope in a charter. The gate checks for a charter file in `.context-index/specs/features/<module>/charter.md`.

**How to fix it:** Run `/adev:brainstorm` to explore the feature idea and produce a charter. The brainstorm skill creates the charter file, which unlocks the downstream skills. For existing code, you can create a charter manually or use `/adev:brainstorm` to formalize what already exists.

#### "Spec not reviewed"

**What you see:** A lifecycle gate blocks `/adev:plan` because the spec has not passed architecture review.

**Why it happens:** adev requires specs to be reviewed by specialist agents (structural, security, consistency) before planning begins. This catches design issues before any code is written. The gate checks for a `.review.md` file adjacent to the spec with a PASS status.

**How to fix it:** Run `/adev:review-specs` on the spec. The review produces a `.review.md` file. If the review finds issues, address them in the spec and re-run the review until it passes.

#### "No plan found"

**What you see:** A lifecycle gate blocks `/adev:implement` because no implementation plan exists for the spec.

**Why it happens:** Implementation requires a structured plan that decomposes the spec into ordered tasks with TDD expectations. The gate checks for a `.plan.md` file adjacent to the spec.

**How to fix it:** Run `/adev:plan` on the spec. The plan skill reads the reviewed spec and produces a task-by-task implementation plan. Each task includes file lists, test strategies, and dependency information.

### Skill Errors

#### "Skill prerequisites not met"

**What you see:** A skill refuses to run, reporting that required context files are missing.

**Why it happens:** Each skill has prerequisites — files or conditions that must exist before it can operate. For example, `/adev:implement` requires a plan, `/adev:plan` requires a reviewed spec, and `/adev:validate` requires completed implementation. Missing prerequisites usually mean an earlier lifecycle step was skipped.

**How to fix it:** Run `/adev:init` if the `.context-index/` directory is missing entirely. Otherwise, follow the lifecycle order: brainstorm, specify, review, plan, implement, validate. Use `/adev:work` to automatically determine which step to run next.

#### "Subagent failed or got stuck"

**What you see:** An implementation or review subagent stops making progress, produces incorrect output, or enters a retry loop.

**Why it happens:** Subagents can get stuck when they lack sufficient context, encounter an unexpected codebase state, or hit an ambiguous requirement. The `/adev:implement` skill caps retry loops to prevent infinite cycling.

**How to fix it:** Run `/adev:recover` to diagnose the root cause. The recover skill classifies the failure (missing context, spec ambiguity, tooling issue, etc.), injects corrective context, and re-dispatches with an enriched prompt. If recovery fails, check `.context-index/hygiene/blockers/` for structured blocker files that describe what went wrong.

### Configuration Mistakes

#### "manifest.yaml not found"

**What you see:** Skills report that `manifest.yaml` is missing or cannot be read.

**Why it happens:** The manifest file at `.context-index/manifest.yaml` is the central configuration for adev. It defines modules, specialists, quality gates, and other settings. Without it, most skills cannot determine project structure.

**How to fix it:** Run `/adev:init` to create or regenerate the manifest. If you have a `.context-index/` directory but the manifest was accidentally deleted, the init wizard can recreate it while preserving other context files.

#### "Version mismatch between package.json and plugin.json"

**What you see:** A warning about version numbers not matching between `package.json` and `.claude-plugin/plugin.json`.

**Why it happens:** adev enforces version parity as a non-negotiable principle. Both files must declare the same version string. This can happen when one file is updated manually without updating the other.

**How to fix it:** Update both files to the same version. Check the current versions with `cat package.json | grep version` and `cat .claude-plugin/plugin.json | grep version`, then edit whichever is behind. Always update both in the same commit.

## FAQ

### Can I use adev with tools other than Claude Code?

Yes. adev supports Claude Code, OpenCode, and OpenAI Codex. The plugin architecture is provider-agnostic — skills are markdown files that any AI assistant can interpret. Install with `npx @adev-org/adev-cli install` and use `--provider` to select your tool. The `.context-index/` directory works identically across all supported providers.

### Do I have to follow every lifecycle step?

No. The lifecycle (brainstorm, specify, review, plan, implement, validate) is the recommended flow for new features, but you can skip steps when appropriate. Use `/adev:work` to route your request — it will determine the right entry point. For small bug fixes, `/adev:debug` jumps straight to investigation. For quick changes, you can implement directly and run `/adev:validate` to verify. The gates exist to catch issues early, not to slow you down.

### How do I add a custom skill?

Create a markdown file at `skills/<name>/SKILL.md` following the existing skill format. Skills are structured instructions — they do not require companion code, though helper files are allowed. The skill name becomes the slash command (e.g., `skills/my-skill/SKILL.md` becomes `/adev:my-skill`). Register it by adding the skill to your manifest modules list if you want it tracked.

### What do I do when an agent gets stuck?

Run `/adev:recover`. It diagnoses the root cause by classifying the failure into one of six categories (missing context, spec ambiguity, tooling issue, scope creep, environment problem, or model limitation). It then injects corrective context and re-dispatches the stuck subagent. Check `.context-index/hygiene/blockers/` for structured records of what went wrong. If recovery does not resolve the issue, the blocker file provides enough detail to fix the problem manually.

### How do I customize quality gates?

Edit the `governance/` directory in your `.context-index/`. Quality gates are defined in `governance/gates.yaml` with tiers (fast, integration, e2e), commands, and severity levels. The constitution's Quality Gates section (`constitution.md`) defines the baseline gates that every skill checks. You can add project-specific gates, change severity from error to warning, or add custom validation commands. Run `/adev:sync` after changing constitution-level gates.

### Can I use adev on an existing codebase?

Yes. Run `/adev:init --brownfield` to auto-detect your existing project structure, tech stack, and conventions. The wizard scans your codebase and populates the constitution with your actual patterns rather than defaults. You can also run `/adev:assess` to score your codebase's readiness for agentic development across multiple structural dimensions, then address the gaps it identifies.
