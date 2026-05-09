---
status: approved
revision: 2
updated: 2026-05-09
---

# Feature Charter: User-Facing Documentation

## Business Intent

User-facing documentation that serves as the complete guide to adopting and using the adev framework. It replaces and reorganizes the existing `docs/` directory into a coherent linear progression — from understanding the framework's value, through installation and first use, to daily workflow guides and a comprehensive reference. The goal is to make adev self-service: a new user can go from "what is this?" to productive use without needing to read skill source files or ask for help.

## Scope and Boundaries

### In Scope

- Reorganize `docs/` into a linear guide structure replacing all existing content
- Philosophy/concepts overview (four pillars, context-first approach)
- Installation and setup guide (greenfield, brownfield, provider selection)
- Getting started tutorial (expanded from current quickstart)
- Project types guide with worked examples using eval fixture/submodule projects
- Workflow guides grouped by lifecycle phase (design, build, validate, maintain)
- Skill reference section with one entry per skill
- Configuration reference (manifest.yaml, constitution.md, platform-context.yaml)
- Hooks reference (what each hook does, when it fires, how to customize)
- Troubleshooting and FAQ
- Workspaces guide (absorbs existing content)
- Governance guide (absorbs existing content)
- Test strategies guide (absorbs existing content)

### Out of Scope

- Documentation site generator or hosting (stays as plain markdown)
- Contributor/developer documentation (architecture internals, module maps)
- API reference or JSDoc generation
- Video tutorials or interactive content
- Changelog or release notes

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| Skills | internal module | SKILL.md files are source of truth for skill reference entries |
| Constitution | shared context | Source for concepts and principles content |
| Manifest | shared context | Source for configuration reference |
| Platform Context | shared context | Source for configuration reference |
| Hooks | internal module | Source for hooks reference (names, triggers, behavior) |
| Eval fixture projects | git submodules | Source for project type worked examples |
| Existing docs/ | shared context | Content to absorb and reorganize |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Guide | A narrative document teaching a concept or workflow | title, audience level, position in reading order, related skills |
| Skill Entry | A reference page describing one skill | skill name, purpose, prerequisites, usage examples, related guides |
| Configuration Entry | A reference page for a config file or section | file name, fields, defaults, examples |
| Table of Contents | Root navigation document linking all guides and references | section groupings, reading order |

### Relationships

- Guides reference Skill Entries (link to deeper detail)
- Skill Entries link back to Guides (context for when to use)
- Configuration Entries are referenced by both Guides and Skill Entries

### Invariants

- Every skill in the plugin has exactly one Skill Entry in the reference section
- Every Guide has a defined position in the reading order
- No orphan pages — every document is reachable from the table of contents

## Capability Map

| Capability | Description | Priority | Phase | Status |
|-----------|-------------|----------|-------|--------|
| Table of Contents | Root index page organizing all docs into a linear reading path | must-have | 1 | validated |
| Concepts Overview | Brief explanation of the four pillars and the context-first approach | must-have | 1 | validated |
| Installation Guide | Step-by-step setup covering greenfield, brownfield, and provider selection | must-have | 1 | validated |
| Getting Started Tutorial | Expanded walkthrough taking a user from init through their first validated feature | must-have | 1 | validated |
| Project Types Guide | Worked examples showing how to use adev with different project types, using eval fixture/submodule projects as demos | must-have | 1 | review-passed |
| Design Phase Guide | How to brainstorm, write charters, author specs, run reviews, and prototype | must-have | 1 | review-passed |
| Build Phase Guide | How to plan, route, implement, write tests, and orchestrate builds | must-have | 1 | review-passed |
| Validate & Debug Guide | How to validate work, debug issues, and run evals | must-have | 1 | review-passed |
| Maintain Phase Guide | How to track issues, run hygiene, retrospectives, and keep context healthy | must-have | 1 | review-passed |
| Skill Reference | One entry per skill with purpose, prerequisites, arguments, and usage | must-have | 1 | review-passed |
| Configuration Reference | Field-level docs for manifest.yaml, constitution.md, platform-context.yaml | should-have | 1 | review-passed |
| Hooks Reference | What each hook does, when it fires, how to customize | should-have | 1 | review-passed |
| Troubleshooting & FAQ | Common issues, error messages, and recovery steps | should-have | 1 | review-passed |
| Workspaces Guide | Multi-repo coordination setup and usage (absorbs existing content) | should-have | 1 | implemented |
| Governance Guide | Customizing review and validation gates (absorbs existing content) | should-have | 1 | implemented |
| Test Strategies Guide | Domain-specific TDD configuration (absorbs existing content) | should-have | 1 | implemented |
| README Update | Update README.md to point to the new docs structure | nice-to-have | 1 | review-passed |

## Deferred Capabilities

| Capability | Reason | Target Phase | Depends On |
|-----------|--------|-------------|------------|

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| docs/README.md | markdown | Table of contents and entry point to all documentation |
| docs/*.md | markdown | Individual guide and reference pages, linkable from README.md and from each other |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| skills/*/SKILL.md | Skills | Source of truth for skill reference entries |
| .context-index/constitution.md | Constitution | Source for concepts and principles content |
| .context-index/manifest.yaml | Manifest | Source for configuration reference |
| .context-index/platform-context.yaml | Platform Context | Source for configuration reference |
| hooks/hooks.json | Hooks | Hook registry for hooks reference |
| hooks/*.sh | Hooks | Hook behavior for hooks reference |
| Eval fixture projects | Git submodules | Worked examples for project types guide |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Completeness | Every skill in the plugin has a reference entry; no dead links between pages |
| Accuracy | All content reflects current behavior — sourced from SKILL.md files and config files, not assumptions |
| Navigability | Any page reachable within 2 clicks from the table of contents |
| Readability | Written for a mixed audience; no assumed knowledge of adev internals; jargon defined on first use |
| Maintainability | Modular page structure so individual guides can be updated without affecting others |
