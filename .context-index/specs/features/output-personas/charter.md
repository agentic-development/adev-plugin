---
status: approved
revision: 2
updated: 2026-04-21
---

# Feature Charter: Output Personas

## Business Intent

Output Personas is a presentation layer that adapts plugin outputs to the user's role and expertise level. It resolves a persona (`product`, `developer`, `architect`) from a layered config hierarchy and injects a directive at session start that shapes how all skills present their results — without changing internal processing, reviews, validations, or TDD cycles. Each persona controls output verbosity, technical depth, code references, and actionable next steps.

## Scope and Boundaries

### In Scope

- Three built-in personas: `product`, `developer`, `architect`
- Persona directive templates in `templates/personas/<name>.md`
- `user-config` file format (flat key-value, bash-parseable) shared between global (resolved via CLI plugin root) and local (`.context-index/user-config`, gitignored) paths
- Config resolution hierarchy: per-invocation flag → local project → global user → fallback (`developer`)
- Session-start hook modification to resolve and inject persona directive
- Persona-specific next-action guidance in outputs
- `/adev:init` asks persona preference during setup and writes to global `user-config`

### Out of Scope

- Custom user-defined personas (future extension, not v1)
- Changing internal skill processing, review logic, or validation gates
- Per-skill persona overrides in the config (v1 uses one persona for all skills)
- Model tier override via `user-config` (natural fit but separate charter)
- UI/visual theming

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| Hooks | internal module | Modifies `session-start.sh` to resolve persona and inject directive |
| Setup | internal module | Modifies `/adev:init` to collect persona preference |
| CLI | internal module | Uses plugin root resolution to locate global and template directories |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Persona | Named output profile defining presentation rules | `name` (string), `description` (string), `output_rules` (structured directive) |
| UserConfig | Per-location flat key-value config file with user preferences, bash-parseable without external deps | `persona` (string), `path` (global or local) |
| PersonaDirective | Resolved markdown block injected at session start | `persona_name`, `dimensions` (verbosity, code refs, next actions, etc.) |

### Relationships

- A UserConfig references a Persona by name
- A PersonaDirective is produced by resolving the config hierarchy and reading the matching Persona template

### Invariants

- The resolved persona must match a template file in `templates/personas/` — unknown names produce a warning and fall back to `developer`
- Local `user-config` always takes precedence over global when both exist
- Per-invocation `--persona` argument (parsed from skill invocation text) always takes precedence over any config file
- Persona affects only output presentation — never gates, reviews, or internal processing

## Capability Map

| Capability | Description | Priority | Phase | Status |
|-----------|-------------|----------|-------|--------|
| Persona resolution | Resolve persona from hierarchy: flag → local → global → fallback | must-have | | specified |
| User config file format | Define and parse `user-config` schema for both global and local paths | must-have | | specified |
| Persona directive templates | Three markdown templates (`product.md`, `developer.md`, `architect.md`) defining output rules per dimension | must-have | | specified |
| Session-start injection | Modify session-start hook to resolve persona and inject directive into conversation | must-have | | specified |
| Init persona prompt | Ask persona preference during `/adev:init` and write to global `user-config` | must-have | | specified |
| Gitignore management | Ensure `.context-index/user-config` is added to `.gitignore` during init | must-have | | specified |
| Unknown persona fallback | Warn on unrecognized persona name and fall back to `developer` | must-have | | specified |
| Per-invocation flag | Support `--persona <name>` argument in skill invocation text (e.g., `/adev:build --persona product`), parsed from slash-command arguments | must-have | | specified |

## Deferred Capabilities

| Capability | Reason | Target Phase | Depends On |
|-----------|--------|-------------|------------|
| Custom user-defined personas | Start with three built-in personas; extend once usage patterns emerge | v2 | — |
| Per-skill persona overrides | v1 uses a single persona for all skills; per-skill granularity adds complexity without proven need | v2 | — |
| Model tier override in user-config | Natural fit for `user-config` but separate concern; deserves its own charter | v2 | User config file format |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `resolvePersona(options)` | function | Resolves persona name from hierarchy: `options.flag` → local config → global config → `'developer'` fallback. Returns `{ name, source }`. |
| `loadPersonaDirective(name)` | function | Reads `templates/personas/<name>.md` and returns the directive content. Warns and falls back to `developer` if not found. |
| `parseUserConfig(filePath)` | function | Parses a flat key-value `user-config` file (`key=value` lines, bash-parseable), returns structured config object. |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| Session-start hook pipeline | Hooks | Injects persona directive into conversation context at session start |
| `/adev:init` wizard flow | Setup | Adds persona selection step during interactive init |
| Plugin root resolution | CLI | Resolves paths to global and template directories |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Performance | Persona resolution adds < 50ms to session start — simple file reads, no network calls |
| Backward compatibility | Projects without `user-config` behave exactly as today (`developer` fallback) |
| Extensibility | New persona added by dropping a single template file in `templates/personas/` — no code changes required |
| Testability | Resolution hierarchy testable with fixture configs; directive injection testable via existing hook test helpers |
