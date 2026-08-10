# adev Documentation

The Agentic Development Framework (adev) is a structured methodology for building software with AI agents. This documentation covers everything from core concepts to daily workflows.

## Getting Started

Start here if you are new to adev.

- [Core Concepts](concepts.md) — The four pillars and how adev thinks about development
- [Installation & Setup](installation.md) — Install the plugin and initialize your project
- [Getting Started Tutorial](getting-started.md) — Build your first feature end-to-end

## Workflow Guides

Guides organized by lifecycle phase, covering the skills you use day-to-day.

- [Design Phase](design-phase.md) — Brainstorm, charter, specify, review, and prototype
- [Build Phase](build-phase.md) — Plan, route, implement, write tests, and orchestrate
- [Validate & Debug](validate-debug.md) — Validate work, debug issues, and run evals
- [Maintain](maintain.md) — Track issues, run hygiene, retrospectives, and keep context healthy

## Reference

Detailed reference documentation for every skill, configuration file, and hook.

- [Skill Reference](skill-reference.md) — One entry per skill with usage, arguments, and examples
- [CLI Reference](cli-reference.md) — Every `adev` CLI verb by audience (user-facing + lifecycle/internal) with signatures and examples
- [Configuration Reference](configuration.md) — manifest.yaml, constitution.md, platform-context.yaml, [user-config (personas & verbosity)](configuration.md#user-config--personas--verbosity)
- [Hooks Reference](hooks.md) — What each hook does, when it fires, how to customize
- [Extensions](extensions.md) — Authoring extension packages (manifest schema, install merge, validate-time event flow)

## Advanced

Specialized guides for power users and complex setups.

- [Workspaces](workspaces.md) — Multi-repo coordination and workspace configuration
- [Governance](governance.md) — Customizing review and validation gates
- [Test Strategies](test-strategies.md) — Domain-specific TDD configuration and patterns
- [Project Types](project-types.md) — Worked examples for different project architectures
- [Troubleshooting & FAQ](troubleshooting.md) — Common issues and recovery steps

## Maintainers

Procedures for people who ship adev itself, rather than build with it.

- [Releasing](releasing.md) — Release channels (`latest` / `next` / `legacy`), how release-please cuts versions, and how to publish a pre-release
- [Copilot Smoke-Install Verification](smoke-install-copilot.md) — Manual checklist for verifying the GitHub Copilot adapter against a live project
