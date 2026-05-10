---
topic: "Deploy skills and commands — ideas from other plugins and this plugin's history"
date: "2026-05-09"
relates-to: ""
sources:
  - internal
  - web
status: draft
---

## Summary

Research into deploy/release/ship skills across the Claude Code plugin ecosystem and adev-plugin's own history reveals a clear gap: adev has strong CI/CD infrastructure (GitHub Actions workflow, publish-on-tags spec, release-mode planning) but no interactive deploy skill that an operator can invoke from the CLI. The ecosystem has converged on three deploy-skill archetypes: (1) step-by-step deployment checklists, (2) CI/CD pipeline orchestrators with headless mode, and (3) release lifecycle managers that span changelog, tag, publish, and notify. Several of these map naturally onto adev's existing infrastructure without violating constitutional principles.

## Findings

### Internal

- **CI/CD charter already exists with two validated specs.** The `cicd` charter covers GitHub Actions quality gates (`run-quality-gates.spec.md`, validated) and npm publish automation (`publish-on-tags.spec.md`, validated). Both are wired to `.github/workflows/ci.yml`. The charter defers security scanning (npm audit) to v2. (`.context-index/specs/features/cicd/charter.md`)

- **Release Mode in /adev:plan sequences features into release plans.** The `--release <name>` flag reads milestones from `product.md`, builds a dependency graph across feature charters, performs topological sort, identifies the critical path, and creates umbrella Epics on the issue board. This is planning-only — it does not execute any deploy steps. (`skills/plan/release-mode.md`)

- **v1-release-research identifies deploy-adjacent gaps.** Theme 1 (Reliability) lists ghost validation, SHA drift, and test failures as blockers. Theme 3 (Extension Packs) proposes `pack install` CLI commands. No deploy skill was proposed, but the extension pack install flow is structurally similar to a deploy workflow. (`.context-index/research/v1-release-research.md`)

- **The build orchestrator chains review-plan-implement-validate** but stops at validation. There is no "ship" or "release" phase after validation passes. (`skills/build/SKILL.md`)

- **Platform context declares `deployment: npm registry`** with the install path `npx @adev-org/adev-cli install`. This is the only deployment target currently defined. (`.context-index/platform-context.yaml:10`)

- **Hooks cover session start, lint, merge guard, and sync** but not pre-deploy or post-deploy events. (`hooks/hooks.json`)

- **The validate skill runs 13 checks but does not trigger any release action** on full PASS. It produces a structured report and stops. (`skills/validate/SKILL.md`)

### Web

- **The nagisanzenin/claude-code-production-grade-plugin defines `/ship`, `/canary`, `/land-and-deploy`, `/ci:pipeline`, and `/ci:status` commands.** The SRE Agent executes in a SHIP phase after infrastructure provisioning. The `/ship` command handles the full deployment workflow from code to production including progressive rollout. ([GitHub: nagisanzenin/claude-code-production-grade-plugin](https://github.com/nagisanzenin/claude-code-production-grade-plugin))

- **The levnikolaevich/claude-code-skills plugin implements a full pipeline orchestrator** with stages: ln-700 (bootstrap), ln-100 (docs), ln-200 (decompose), ln-400 (implement with review loops), ln-500 (quality gates and Done). Each stage is fully automated with human approval checkpoints. Multi-model review delegates to Codex and Gemini agents running in parallel. ([GitHub: levnikolaevich/claude-code-skills](https://github.com/levnikolaevich/claude-code-skills))

- **Claude Code headless mode (`-p` flag) enables CI/CD pipeline integration.** The `-p` flag sends a single prompt without interaction, compatible with GitHub Actions, cron jobs, and shell scripts. Common patterns: install Claude Code via npm in CI, configure API key as GitHub secret, run with `--allowedTools` restriction. Production pipelines add `--dangerously-skip-permissions` and Unix timeout. ([SFEIR Institute tutorial](https://institute.sfeir.com/en/claude-code/claude-code-headless-mode-and-ci-cd/tutorial/), [Code With Seb](https://www.codewithseb.com/blog/claude-code-headless-mode-cicd-automation-playbook))

- **Kiro implements event-driven hooks for deploy automation.** Hook triggers include file events (save, create, delete), spec events (created, edited, approved), repo events (branch created, PR opened, merge completed), and external events (CodeCatalyst workflow state changes, S3 uploads, EventBridge, cron). Steering files can outline deployment processes including build, environment config, deploy steps, and rollback. ([Kiro docs: Hooks](https://kiro.dev/docs/hooks/), [Kiro blog](https://kiro.dev/blog/automate-your-development-workflow-with-agent-hooks/))

- **Deploy skills should use `disable-model-invocation: true`** in frontmatter because they have real side effects. This ensures they only run when explicitly invoked, never auto-triggered. ([Claude Code docs: Skills](https://code.claude.com/docs/en/skills))

- **Pulumi Agent Skills package infrastructure expertise as progressive-disclosure skills.** Claude reads only the description at startup (~100 tokens); full procedures load on invocation. Skills are organized into authoring and migration plugin groups, working across Claude Code, Copilot, Cursor, Codex, and Gemini CLI. ([Pulumi blog](https://www.pulumi.com/blog/top-8-claude-skills-devops-2026/), [Pulumi Agent Skills](https://www.pulumi.com/blog/pulumi-agent-skills/))

- **Superpowers (174K+ GitHub stars) implements a dispatcher skill pattern** where a master skill runs at session start and routes to specialized skills. The framework ships 14 skills covering planning, execution routing, TDD, debugging, and collaboration but does not include a dedicated deploy skill — deploy is handled via custom user commands. ([GitHub: obra/superpowers](https://github.com/obra/superpowers))

- **The alirezarezvani/claude-skills collection (232+ skills)** includes a DevOps automation suite with 25 plugins covering Git workflows, CI/CD pipelines, Docker optimization, and Kubernetes management. Skills are organized by domain (engineering, compliance, C-level advisory) and work across 10+ coding agents. ([GitHub: alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills))

## Code Examples

```yaml
# Example: Deploy skill frontmatter pattern (Claude Code docs)
# Source: https://code.claude.com/docs/en/skills
---
name: deploy
description: Deploy the application to production
context: fork
disable-model-invocation: true
---
```

```yaml
# Example: GitHub Actions step using Claude Code headless mode
# Source: https://institute.sfeir.com/en/claude-code/claude-code-headless-mode-and-ci-cd/tutorial/
- name: Generate changelog
  run: |
    claude -p "Generate a changelog from the last 10 commits" \
      --allowedTools Read,Bash \
      --output-format text > CHANGELOG_ENTRY.md
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

```json
// Example: Kiro hook for post-merge deploy trigger
// Source: https://kiro.dev/docs/hooks/
{
  "name": "auto-deploy-on-merge",
  "trigger": { "type": "repo", "event": "merge_completed", "branch": "main" },
  "action": "Run the deployment checklist: verify tests passed, bump version, tag release, publish to npm"
}
```

## Recommendations

### 1. Create an `/adev:release` skill that extends the build pipeline past validation

The build orchestrator currently chains review-plan-implement-validate and stops. A release skill would add the final phase: changelog generation, version bump (maintaining version parity per Principle 5), git tag, and publish trigger. This fills the gap between `/adev:plan --release` (which plans) and the CI/CD pipeline (which executes on tag push). The skill would be read-only in the sense that it orchestrates existing tools rather than introducing new runtime dependencies.

**Constitution reference:** Principle 5 (version parity), Principle 1 (minimize external dependencies — uses git and npm CLI only).

### 2. Add a `/adev:deploy` skill as a step-by-step deployment checklist

Modeled after the nagisanzenin `/ship` command and the Kiro deploy-assistant pattern. The skill would:
- Read `platform-context.yaml` for deployment target
- Run quality gates (already in manifest)
- Verify version parity between package.json and plugin.json
- Generate/update CHANGELOG from commits since last tag
- Bump version (patch/minor/major based on argument)
- Create git tag
- Push tag (triggering CI/CD publish-on-tags workflow)
- Verify npm publish succeeded (poll npm registry)

This is an orchestration skill — it calls existing tools, not new ones. Use `disable-model-invocation: true` equivalent (explicit invocation only) since it has real side effects.

**Constitution reference:** Principle 5 (version parity enforcement), Architecture Boundaries (adding new skills to lifecycle requires human approval).

### 3. Add pre-deploy and post-deploy hooks to the hook protocol

Kiro's event-driven hooks demonstrate value in deploy-triggered automation. Proposed hooks:
- `pre-deploy`: runs before version bump/tag — checks for uncommitted changes, validates quality gates, confirms branch
- `post-deploy`: runs after successful publish — updates issue board, closes milestone Epic, notifies

This requires extending the hook protocol (currently session-start, lint, merge-guard, sync), which is in the "Requires Human Approval" boundary.

**Constitution reference:** Principle 4 (hook protocol compliance), Architecture Boundaries (requires human approval for hook protocol changes).

### 4. Support headless deploy via Claude Code `-p` flag for CI/CD integration

Enable `/adev:deploy` to run in headless mode so it can be triggered from GitHub Actions or cron. Pattern: `claude -p "/adev:deploy --patch" --allowedTools Bash,Read,Write`. This requires no plugin changes — it is a usage pattern documented in a deploy skill's instructions. Add a `ci-deploy.yml` GitHub Actions workflow template to `templates/`.

**Constitution reference:** Principle 2 (skills are primarily markdown — the headless integration is documentation, not code).

### 5. Add a `/adev:changelog` utility skill for release note generation

Multiple plugins (nagisanzenin, levnikolaevich) include changelog generation as a distinct step. adev could offer a skill that reads git log since the last tag, groups commits by module (using commit trailers and conventional commit prefixes), and produces a structured changelog entry. This feeds into the release skill but is useful independently.

**Constitution reference:** Principle 1 (uses git CLI only, no changelog library dependency).

### 6. Extend `/adev:build` with a `--ship` flag for end-to-end delivery

Rather than creating a separate deploy skill, extend the build orchestrator with an optional `--ship` flag that adds a release phase after validation passes. This keeps the single-entry-point pattern and avoids skill proliferation. The flag would trigger version bump, tag, and push — essentially appending the deploy checklist to the existing pipeline.

**Constitution reference:** Architecture Boundaries (adding new skills to lifecycle requires human approval — extending an existing skill may be autonomous).

## References

### Internal Files
- `.context-index/specs/features/cicd/charter.md` -- CI/CD charter with quality gates and publish-on-tags capabilities
- `.context-index/specs/features/cicd/publish-on-tags.spec.md` -- Validated spec for npm publish on version tags
- `.context-index/specs/features/cicd/run-quality-gates.spec.md` -- Validated spec for GitHub Actions quality gates
- `skills/plan/release-mode.md` -- Release Mode planning with dependency graph and topological sort
- `skills/build/SKILL.md` -- Build pipeline orchestrator (review-plan-implement-validate)
- `skills/validate/SKILL.md` -- 13-check validation with structured reporting
- `.context-index/research/v1-release-research.md` -- v1.0 release themes and deferred work inventory
- `.context-index/research/orchestration-tools-feature-ideas.md` -- External orchestrator analysis
- `.context-index/platform-context.yaml` -- Platform context with npm registry deployment target

### Web Sources
- [Claude Code Skills docs](https://code.claude.com/docs/en/skills) -- Official skill authoring guide including deploy skill patterns
- [nagisanzenin/claude-code-production-grade-plugin](https://github.com/nagisanzenin/claude-code-production-grade-plugin) -- /ship, /canary, /land-and-deploy commands with SRE Agent
- [levnikolaevich/claude-code-skills](https://github.com/levnikolaevich/claude-code-skills) -- Full delivery lifecycle pipeline orchestrator with quality gates
- [Kiro Hooks documentation](https://kiro.dev/docs/hooks/) -- Event-driven hooks including repo events and deploy triggers
- [Kiro deploy automation blog](https://kiro.dev/blog/automate-your-development-workflow-with-agent-hooks/) -- Multi-step workflow hooks for release management
- [Claude Code headless mode docs](https://code.claude.com/docs/en/headless) -- Running Claude Code in CI/CD pipelines
- [SFEIR Institute: Headless CI/CD tutorial](https://institute.sfeir.com/en/claude-code/claude-code-headless-mode-and-ci-cd/tutorial/) -- GitHub Actions integration patterns
- [Code With Seb: CI/CD Automation Playbook](https://www.codewithseb.com/blog/claude-code-headless-mode-cicd-automation-playbook) -- Production CI/CD with token budgeting and error recovery
- [Pulumi: Top 8 Claude Skills for DevOps](https://www.pulumi.com/blog/top-8-claude-skills-devops-2026/) -- Progressive disclosure skill pattern for infrastructure
- [Pulumi Agent Skills](https://www.pulumi.com/blog/pulumi-agent-skills/) -- Cross-platform agent skills specification
- [GitHub: obra/superpowers](https://github.com/obra/superpowers) -- Dispatcher skill pattern with 14 bundled skills
- [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) -- 232+ skills including 25 DevOps plugins
- [DevOps Daily: Best plugins for DevOps 2026](https://devops-daily.com/posts/best-claude-code-plugins-devops-2026) -- Plugin comparison for DevOps workflows
