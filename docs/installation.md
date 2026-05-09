[adev docs](README.md) > Getting Started

# Installation & Setup

This guide walks you through installing the adev plugin and initializing your project's context.

## Prerequisites

Before you begin, ensure you have:

- **Node.js** (v18 or later) and **npm**
- **Git** (any recent version)
- **An AI coding assistant** — one of:
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (default and recommended — fully supported)
  - OpenCode (alpha)
  - Codex (alpha)

## Install the Plugin

Run the installer from npm:

```bash
npx @adev-org/adev-cli install
```

The CLI will prompt you to select your AI coding assistant. Choose the one you use:

- **Claude Code** (fully supported) — Registers as a Claude Code plugin with skills and hooks
- **OpenCode** (alpha) — Generates an AGENTS.md file. Basic lifecycle skills work, but hooks and session capture are not yet available.
- **Codex** (alpha) — Generates an AGENTS.md file. Basic lifecycle skills work, but hooks and session capture are not yet available.

The installer registers the plugin, scaffolds a minimal `.context-index/` directory, and configures git hooks for provenance tracking.

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
