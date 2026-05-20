---
status: approved
revision: 3
updated: 2026-05-20
---

# Feature Charter: Domain Extensions

## Business Intent

Domain extension packages distribute domain-specific configuration (templates, reviewers, gates, verification, test config) as installable content packages. Each extension adapts the adev lifecycle to a specific development domain by providing tailored defaults that override the bundled software profile. Extensions are content-only packages consumed by the existing install pipeline — no executable code.

## Scope and Boundaries

### In Scope

- `extensions/<name>/` monorepo subdirectories with `adev-extension.yaml`, `domain/` (7 files), and `README.md`
- First-party domain extensions declare `extends: software` to inherit base defaults and only override domain-specific files
- Integration tests in the main repo validating install + resolution for each extension
- Installable via local path (`./extensions/data-engineering`) and git URL with subdirectory fragment (`repo#extensions/data-engineering`)

### Out of Scope

- Modifying the install pipeline orchestration (`lib/extensions/install.mjs`) — already implemented
- Modifying `loadDomainConfig()` or domain resolution logic — already works
- Software profile extraction (stays bundled in `templates/domains/software/`)
- Governance overlays, samples, skills, or hooks in these extensions (domain profiles only for now)
- Extension authoring tooling or scaffolding commands
- npm publishing (future — structure supports it but no `package.json` required for v1)

### Dependencies

| Module | Direction | Why |
|--------|-----------|-----|
| Extensions (install pipeline) | Consumes | `extension install` installs the domain profile |
| Domain Profiles | Consumes | `loadDomainConfig()` resolves installed profiles via extends chain |
| Templates | References | Software profile in `templates/domains/software/` is the base |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| DomainExtension | An installable content package providing a domain profile | `name`, `version`, `description`, `extends` (parent domain) |
| ExtensionManifest | `adev-extension.yaml` declaring the extension's provides map | `name`, `version`, `requires.adev`, `provides.domain-profile` |
| DomainProfileFiles | The 7 config files adapting the lifecycle to a domain | charter-template, spec-template, reviewers, gates, verification, gate-config, test-config |

### Relationships

- A DomainExtension contains exactly one ExtensionManifest and one set of DomainProfileFiles
- A DomainExtension declares `extends: <parent>` linking it to a base profile (software for first-party)

### Invariants

- Extension name must match `^[a-z][a-z0-9-]*$` (enforced by install pipeline)
- Extension name must not collide with `BUNDLED_DOMAIN_NAMES` (enforced by install pipeline)
- Each extension provides a complete or partial set of the 7 domain profile files — missing files inherit from the `extends` parent

## Capability Map

| Capability | Description | Priority | Phase | Status |
|------------|-------------|----------|-------|--------|
| Data Engineering Extension | Extension package with domain profile tailored for data pipelines, ETL, dbt, and data quality workflows | Must-have | v1 | validated |
| Process Automation Extension | Extension package with domain profile tailored for workflow automation, RPA, and event-driven processes | Must-have | v1 | validated |
| Bundled Templates Cleanup | Remove extracted domains from `templates/domains/`, update `BUNDLED_DOMAIN_NAMES` constant to software only | Must-have | v1 | implemented |
| Git Subdirectory Fragment Support | Enhance `resolve-source.mjs` to parse `repo#path` fragments, cloning the repo and resolving into the subdirectory | Must-have | v1 | implemented |
| End-to-End Install Verification | Integration tests proving each extension installs and resolves correctly through `loadDomainConfig()` | Must-have | v1 | — |
| Init-Time Domain Extension Picker | Catalog-driven prompt in `adev init` and `adev upgrade` that surfaces first-party domain extensions, reusing the existing `installExtension()` pipeline and writing `domain:` to `manifest.yaml` | Must-have | v2 | review-passed |

## Deferred Capabilities

| Capability | Reason | Target Phase | Depends On |
|------------|--------|--------------|------------|
| npm publishing | Local path install sufficient for v1 | v2 | — |
| Git URL branch/tag support | Specify branch or tag in git URL fragment | v2 | — |
| Additional domain profiles | Community or first-party (e.g., mobile, ML/AI) | v2 | — |

## Interface Contracts

### Exposed

| Interface | Type | Description |
|-----------|------|-------------|
| `extensions/data-engineering/` | extension | Installable via local path or git URL with subdirectory fragment |
| `extensions/process-automation/` | extension | Installable via local path or git URL with subdirectory fragment |

### Consumed

| Interface | Source Module | Description |
|-----------|--------------|-------------|
| `installExtension()` | Extensions (`lib/extensions/install.mjs`) | Orchestrates install pipeline |
| `loadDomainConfig()` | Domain Profiles (`lib/domains/domain-config.mjs`) | Resolves installed domain through extends chain |
| `BUNDLED_DOMAIN_NAMES` | Domain Profiles (`lib/domains/constants.mjs`) | Collision guard — updated to contain only `software` after cleanup |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Content-only | Extensions contain no executable code — only markdown templates and YAML configs |
| Installability | Each extension installs successfully via `extension install` from local path |
| Resolution | After install, `loadDomainConfig(<name>, ...)` returns the extension's config files |
| Inheritance | Files not overridden by the extension fall through to the `extends` parent (software) |
