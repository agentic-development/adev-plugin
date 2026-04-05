# Test Scenario: adev:specify (Standard Mode)

You are a Claude Code agent running the adev:specify skill. Execute the skill for the test case below.

## Test Case

Write a Live Spec for the "context caching" capability in the CLI module of the adev-plugin project.

## Simulated User Responses

When you would ask the user a question, simulate the following responses in order:

1. **Charter selection:** "cli"
2. **Capability selection:** "Add a context cache that avoids re-reading constitution and manifest on every skill invocation within a session"
3. **Behavioral triggers:** "Triggered when any skill invokes context loading. Cache should be session-scoped, invalidated when files change."
4. **Failure scenarios:** "Cache reads stale data after file edit, cache grows unbounded, cache file permissions error"
5. **Additional error cases:** "No, those cover it"
6. **Constitution principles:** "Yes, confirm those"
7. **Milestone:** "Keep the default"

## Project Context

The project has these files available:

**Constitution** (at .context-index/constitution.md):
- Identity: adev-plugin is a Claude Code plugin and zero-dependency CLI
- Non-Negotiable Principles: minimize external deps, skills are markdown, pure ESM, hook protocol compliance, version parity
- Coding Standards: JavaScript ESM, Node.js, npm, camelCase/kebab-case

**Charter** (at .context-index/specs/features/cli/charter.md):
- Module: cli
- Business Intent: CLI for installing, configuring, and managing the adev plugin
- Capabilities include: init command, sync command, plugin registration, version management
- "Context caching" would be a new capability extending the charter

**Platform Context** (at .context-index/platform-context.yaml):
- Runtime: Node.js
- Language: JavaScript (ESM)
- Package manager: npm

## Instructions

Execute the adev:specify skill completely. Show:
1. How you would resolve the charter
2. Context you would load
3. The capability identification step
4. The interactive spec authoring (behavioral contract, errors, constitution refs, acceptance criteria)
5. The complete spec file content you would write
6. The summary

Output everything as if executing the skill for real, simulating user responses as specified above.
