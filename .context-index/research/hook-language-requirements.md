---
topic: "Hook implementation languages — bash, Node.js, or Python for Claude Code hooks"
date: "2026-04-06"
relates-to: ""
sources:
  - internal
  - web
status: draft
---

# Hook Implementation Languages

## Summary

Claude Code hooks are **not restricted to bash**. The `command` field runs any executable — bash, Node.js, Python, or compiled binaries. The official docs explicitly state this, and the community ecosystem confirms it: popular hook collections use Node.js (96.7% in one), all-Python (another), and bash (official examples). For this project, Node.js inline calls in bash hooks follow established patterns and are well within what Anthropic supports.

## Findings

### Official Anthropic Documentation

The [hooks reference](https://code.claude.com/docs/en/hooks) states:

> **`command`** (required): Shell command to execute

The command field is **not restricted to bash** — it can run any executable. The docs explicitly show:
- Bash scripts (`#!/bin/bash`)
- Python scripts (`/path/to/validate-command.py`)
- Node.js via npx (`jq -r '.tool_input.file_path' | xargs npx prettier --write`)
- PowerShell (via `"shell": "powershell"` field on Windows)
- Any compiled binary

The [hooks guide](https://code.claude.com/docs/en/hooks-guide) notes:
> "If you see `jq: command not found`, install jq or use **Python/Node.js for JSON parsing**"

This is an explicit recommendation from Anthropic that Node.js and Python are valid alternatives for JSON handling in hooks.

### Official Plugin Hook Development Skill

The [Anthropic plugin-dev hook-development SKILL.md](https://github.com/anthropics/claude-code/blob/main/plugins/plugin-dev/skills/hook-development/SKILL.md) shows all examples in bash but notes that command hooks execute shell commands that can call any runtime.

### Community Hook Collections

| Collection | Primary Language | Notes |
|-----------|-----------------|-------|
| [karanb192/claude-code-hooks](https://github.com/karanb192/claude-code-hooks) | **Node.js** (96.7%) | All hooks are JS, one Python utility |
| [disler/claude-code-hooks-mastery](https://github.com/disler/claude-code-hooks-mastery) | **Python** (100%) | UV single-file scripts, no bash at all |
| [johnlindquist/claude-hooks](https://github.com/johnlindquist/claude-hooks) | Mixed | Various languages |
| Official Anthropic examples | **Bash + Python** | `bash_command_validator_example.py` is Python |

### Internal Codebase Patterns

This project (`adev-plugin`) already uses both patterns:

1. **Pure bash hooks**: `merge-guard.sh`, `constitution-linter.sh`, `context-preflight.sh` — simple pattern matching and file checks
2. **Bash + inline Node.js**: `session-capture.sh` — uses `node -e '...'` for JSON parsing and file operations
3. **Bash + python3**: `session-start.sh` — uses `python3 -c` for JSON string escaping

The `session-capture.sh` hook (already merged and tested) demonstrates the exact pattern proposed for `session-start-resume`: a bash wrapper that calls Node.js inline for complex logic.

## Recommendations

### For this project: Keep the current approach (bash + inline Node.js)

**Rationale:**
1. **Anthropic explicitly supports it.** The `command` field runs any executable. Node.js, Python, and bash are all first-class options.
2. **Established internal precedent.** `session-capture.sh` already uses inline Node.js. `session-start.sh` already uses inline Python.
3. **Node.js is a hard prerequisite.** This plugin installs via `npx adev-cli install`. Node.js is always available.
4. **The lib module exists.** `readExecutionState` in `lib/execution-state.mjs` is already written and tested. Reimplementing its YAML parsing and progress body parsing in bash or Python would be duplication.
5. **Constitution compliance.** "Minimize external dependencies" — reusing existing Node.js modules avoids adding bash YAML parsers or Python frontmatter libraries.

### When to use each language

| Use Case | Language | Why |
|----------|----------|-----|
| Simple file/path checks | Bash | Fastest, no runtime overhead |
| JSON escaping | Python (`python3 -c`) | Universally available, existing pattern |
| Complex logic with existing lib modules | Node.js (inline `node -e`) | Reuses tested code, avoids duplication |
| Standalone hook scripts | Any language | The `command` field supports all executables |

### What would NOT be appropriate

- Adding a Python dependency to import a YAML library for frontmatter parsing
- Writing a separate Node.js script file when inline `node -e` suffices
- Using `jq` (not universally installed) when Node.js is already available

## References

- [Automate workflows with hooks - Claude Code Docs](https://code.claude.com/docs/en/hooks-guide)
- [Hooks reference - Claude Code Docs](https://code.claude.com/docs/en/hooks)
- [Anthropic plugin-dev hook-development SKILL.md](https://github.com/anthropics/claude-code/blob/main/plugins/plugin-dev/skills/hook-development/SKILL.md)
- [karanb192/claude-code-hooks (Node.js)](https://github.com/karanb192/claude-code-hooks)
- [disler/claude-code-hooks-mastery (Python)](https://github.com/disler/claude-code-hooks-mastery)
- [Bash command validator example (Python)](https://github.com/anthropics/claude-code/blob/main/examples/hooks/bash_command_validator_example.py)
