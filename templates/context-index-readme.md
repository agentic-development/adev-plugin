# Context Index

This directory contains structured context for the Agentic Development Framework (adev).
Skills read from and write to these files throughout the development lifecycle.

## Directory Guide

| Path | Purpose | Managed by |
|------|---------|------------|
| `constitution.md` | Non-negotiable project principles | `/adev-init`, manual edits |
| `manifest.yaml` | Module registry, sync targets, configuration | `/adev-init`, manual edits |
| `platform-context.yaml` | Tech stack and deployment targets | `/adev-init` |
| `specs/` | Feature charters and live specs | `/adev-brainstorm`, `/adev-specify` |
| `adrs/` | Architecture Decision Records | Manual |
| `sessions/` | Auto-captured session summaries | Git hooks |
| `tasks/` | Issue board (file or beads backend) | `/adev-issues`, `/adev-plan` |
| `samples/` | Golden reference implementations | `/adev-sample` |
| `hygiene/` | Repomap output, drift data | `/adev-repomap`, `/adev-hygiene` |
| `orientation/` | Codebase architecture guide | `/adev-document` |
| `specialists/` | Domain expert subagent prompts | Manual |

## Getting started

1. Edit `constitution.md` to define your project's principles
2. Edit `manifest.yaml` to declare your modules and paths
3. Run `/adev-brainstorm` to create your first Feature Charter
4. See the [quickstart guide](../docs/quickstart.md) for a full walkthrough
