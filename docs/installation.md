[adev docs](README.md) > Getting Started

# Installation & Setup

This guide walks you through installing the adev plugin and initializing your project's context.

## Prerequisites

Before you begin, ensure you have:

- **Node.js** (v18 or later) and **npm**
- **Git** (any recent version)
- **An AI coding assistant** — one of:
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (default and recommended — fully supported)
  - [Cursor](https://cursor.com)
  - [GitHub Copilot](https://github.com/features/copilot)
  - OpenCode (alpha)
  - Codex (alpha)

## Install the Plugin

Run the installer from npm:

```bash
npx @adev-org/adev-cli install
```

The CLI will prompt you to select your AI coding assistant. Choose the one you use:

- **Claude Code** (fully supported) — Registers as a Claude Code plugin with skills and hooks
- **Cursor** — Installs a peer plugin manifest at `.cursor-plugin/plugin.json` (version-locked to `package.json` and `.claude-plugin/plugin.json`) plus a generated `providers/cursor/hooks.json` that maps Claude's hook lifecycle onto Cursor's events while preserving fail-closed deny semantics. Skill names are sanitized from `adev:<x>` to `adev-<x>` at install time per Cursor's naming rules.
- **GitHub Copilot** — File-convention adapter (Copilot has no plugin home). Materializes skills and hooks into `.github/` and records a state file at `.github/.adev-copilot-install.json` so `uninstall` can reverse exactly what was written. Optional `--user` mirrors a subset under `~/.copilot/`. Invoke directly with `npx @adev-org/adev-cli install --target copilot [--user] [--dry-run]`.
- **OpenCode** (alpha) — Generates an AGENTS.md file. Basic lifecycle skills work, but hooks and session capture are not yet available.
- **Codex** (alpha) — Generates an AGENTS.md file. Basic lifecycle skills work, but hooks and session capture are not yet available.

The installer registers the plugin, scaffolds a minimal `.context-index/` directory, and configures git hooks for provenance tracking.

### Pre-release channel (`@next`)

Fixes and features land on the `next` npm dist-tag before they reach a stable release. To install the pre-release build:

```bash
npx @adev-org/adev-cli@next install
```

Pre-release versions look like `0.28.0-next.N` and are cut from the `release/next` branch. They pass the full test suite but may include changes that have not yet shipped in a stable release. To return to stable, re-run the installer without the tag (`npx @adev-org/adev-cli install`) and remove any stale plugin cache versions.

## Domain Extension Picker

After the provider and scaffold steps, the installer presents a single prompt to pick a domain profile:

```
══ Domain Extension ══
Pick a domain (1-4) [1]:
  1. software (bundled, default)
  2. Data Engineering (data-engineering)
  3. Process Automation (process-automation)
  4. skip — pick a domain later via `adev extension install <source>`
```

What each choice does:

- **`software`** or **`skip`** — writes `domain: software` into `.context-index/manifest.yaml`. No extension is installed.
- **A catalog entry** (e.g. `data-engineering`) — installs the extension via the standard install pipeline and writes `domain: <name>` into `manifest.yaml`.

The completion banner names the active domain:

```
Domain: data-engineering
```

If you skip at picker time, you can install a domain extension later:

```bash
adev extension install <source>
```

where `<source>` is a local path, npm package, or git URL. See [Extensions](extensions.md) for details.

The picker is skipped silently when invoked at a workspace root (no current repo slug). Workspace isolation rules ([ADR-0005](../.context-index/adrs/0005-workspace-isolation-invariant.md)) prevent the picker from writing to a sibling repo's manifest.

The picker only lists catalog entries whose source directory exists on disk under the plugin root — missing entries are dropped with an advisory and do not abort install. If the bundled catalog (`templates/extensions-catalog.json`) is missing or malformed, the installer falls through to `software` with a one-line note rather than crashing.

## Initialize Your Project

Open your AI coding assistant in your project directory and run:

```
/adev:init
```

The interactive wizard walks you through 10 layers of project context:

1. **Constitution** — Your project's non-negotiable principles and coding standards
2. **Manifest** — Module registry, quality gates, and framework configuration
3. **Platform Context** — Tech stack details (language, runtime, framework, test runner)
4. **Task Management** — File-based or external issue tracking configuration
5. **Specialists** — Domain-specific reviewers for your project's needs
6. **Governance** — Quality gate definitions and review policies
7. **Sync Targets** — Agent configuration files to keep in sync with the constitution
8. **Heuristics** — Module-scoped lessons learned from past work
9. **Samples** — Golden reference implementations for agent guidance
10. **Orientation** — Codebase navigation hints for agents

You can accept defaults for most layers and customize later. Each layer is optional — skip any that do not apply to your project.

### Greenfield Setup (New Project)

For a brand-new project with no existing code:

```
/adev:init
```

The wizard creates the full `.context-index/` directory structure. You will define your project's identity, principles, and tech stack from scratch. This is the recommended path for new projects.

### Brownfield Setup (Existing Codebase)

For an existing codebase that you want to bring under adev management:

```
/adev:init --brownfield
```

The `--brownfield` flag enables automatic detection of your tech stack. The wizard scans your project for:

- Package manager and dependencies (package.json, requirements.txt, go.mod, etc.)
- Framework and runtime (Next.js, Express, Django, etc.)
- Test runner and test patterns
- Existing documentation and configuration

Detected values are pre-filled as defaults, so you only need to confirm or adjust them.

## Verify Your Installation

After installation and initialization, verify everything is set up correctly:

1. **Check the Context Index exists:**

   ```bash
   ls .context-index/
   ```

   You should see `constitution.md`, `manifest.yaml`, and `platform-context.yaml` at minimum.

2. **Check the plugin is registered:**

   For Claude Code, verify the plugin appears in your configuration:

   ```bash
   claude plugins list
   ```

3. **Run a quick smoke test:**

   ```
   /adev:status
   ```

   This should display your project's current state without errors.

## Troubleshooting

### Plugin not found after installation

If your AI assistant does not recognize `/adev:*` commands after installation:

- Restart the assistant session (close and reopen)
- Verify the plugin directory exists at the expected path
- Re-run `npx @adev-org/adev-cli install` and check for error messages

### Init wizard fails to detect tech stack

If `--brownfield` detection misses your stack:

- Run `/adev:init` without `--brownfield` and enter values manually
- You can always edit `platform-context.yaml` directly after initialization

---

[Previous: Core Concepts](concepts.md) | [Next: Getting Started](getting-started.md)
