---
status: approved
revision: 4
updated: 2026-05-10
---

# Feature Charter: Domain Profiles

## Business Intent

Domain Profiles make the Agentic Development Framework domain-agnostic by introducing a configurable domain layer that controls how charters, specs, reviewers, quality gates, and implementation verification behave. Today the framework assumes software development — HTTP error codes in spec templates, REST-centric interface contracts, browser-based visual verification. Domain Profiles replace these hardcoded assumptions with a resolution chain that adapts the entire lifecycle to the project's actual domain, whether that's software, data engineering, process automation, or a custom domain defined by the user or shipped via an extension.

## Scope and Boundaries

### In Scope

- Domain resolution protocol (`resolveDomain()`) with 4-level precedence: charter > module > project > default (`software`)
- Domain overlay file structure (`domains/<domain>/`) for templates, reviewers, gates, and verification config
- Three bundled domain profiles: `software`, `data-engineering`, `process-automation`
- Charter template overlay system — domain-specific section names and vocabulary
- Spec template overlay system — domain-specific error case columns, expectations sections
- Domain-aware reviewer dispatch — each domain provides reviewer overlay data that feeds into the review module's existing dispatch logic (ADR-0003 owns dispatch; domain profiles supply configuration)
- Domain-aware quality gates — gate commands keyed by domain
- Domain-aware verification in implement — verification approach per domain (visual/output/flow)
- Custom domain support — users create their own `domains/<name>/` directory
- Extension compatibility — extensions can ship domain profiles as overlay directories

### Out of Scope

- Domain-specific constitution variants (constitution stays project-wide and domain-neutral)
- Domain-specific heuristic scoping (heuristics remain module-scoped, not domain-scoped)
- Domain detection/inference from codebase (user declares domain explicitly)
- Migration tooling for existing projects (adding `domain` to manifest is manual)
- Domain-specific specialist routing in implement (specialists remain keyword/pattern-triggered)

### Dependencies

| Module | Direction | Why |
|--------|-----------|-----|
| Governance (ADR-0003) | Consumes | Reviewer registry merge semantics for domain overlays |
| Execution Profiles (ADR-0004) | Consumes | Profile references in domain reviewer sets |
| Extensions | Consumed by | Extensions ship domain profiles as part of their package |
| Brainstorm | Consumed by | Loads charter template overlay for active domain |
| Specify | Consumed by | Loads spec template overlay for active domain |
| Review-Specs | Consumed by | Loads domain-specific reviewer set |
| Implement | Consumed by | Loads domain-specific verification config; implement skill's Step 2e interface must accept external verification config (currently hardcoded) |
| Validate | Consumed by | Runs domain-specific gate commands |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| DomainProfile | A named configuration bundle that adapts the lifecycle to a development domain | `name`, `description`, `source` (bundled/user/extension) |
| TemplateOverlay | Markdown file that replaces or renames sections in a base template | `type` (charter/spec), `domain`, `sections[]` |
| ReviewerSet | List of reviewer entries to use for a domain, merged into review.yaml | `domain`, `reviewers[]`, `merge_strategy` (replace/append) |
| GateSet | Quality gate entries for a domain, merged by `id` into the base gate registry | `domain`, `gates[]` (each entry: `id`, `command`, `description`) |
| VerificationConfig | Domain-specific verification approach for the implement skill | `domain`, `type` (visual/output/flow), `trigger_patterns[]` (file globs that activate verification), `tool` (mcp server name or `none` — e.g., `playwright` for visual, `none` for output comparison via assertions) |
| GateHookConfig | Lifecycle gate hook config: file exclusion patterns and bash passthrough commands | `domain`, `file_exclusions[]`, `bash_passthrough[]` |
| TestConfig | Test framework config: permitted tools, gaming detection thresholds, skip patterns | `domain`, `permitted_tools[]`, `max_test_file_size`, `skip_patterns[]` |
| DomainResolution | The resolved domain string for a given charter/module context | `resolved_domain`, `source_level` (charter/module/project/default) |

### Relationships

- A DomainProfile contains exactly one TemplateOverlay (charter), one TemplateOverlay (spec), one ReviewerSet, one GateSet, one VerificationConfig, one GateHookConfig, and one TestConfig — 7 files total. All are optional — missing files in custom domains fall back to the parent via `extends`.
- A charter references zero or one DomainProfile via its `domain` frontmatter field.
- A module references zero or one DomainProfile via its `domain` field in manifest.
- A project references zero or one DomainProfile via `project.domain` in manifest.
- A custom domain can extend exactly one bundled domain via `extends` in `domain.yaml`.
- Extensions can provide one or more DomainProfiles in their package.

### Invariants

- Domain resolution is deterministic: given the same manifest and charter, `resolveDomain()` always returns the same string.
- `"software"` is the default domain. When no domain is declared at any level, `resolveDomain()` returns `"software"`. The `software` profile is a real bundled profile (`templates/domains/software/`) containing all current framework defaults extracted into config files. It is not special-cased — it follows the same resolution path as any other domain.
- Bundled domain profiles (`software`, `data-engineering`, `process-automation`) are immutable. Users cannot create `.context-index/domains/<bundled-name>/` to override them directly. To customize, users create a new domain with `extends: <bundled-name>` in `.context-index/domains/<custom-name>/domain.yaml`.
- Domain values must match the pattern `/^[a-z0-9][a-z0-9-]*$/` (lowercase alphanumeric and hyphens). Values containing path separators, dot-sequences, or other characters are rejected by `resolveDomain()` to prevent path traversal.
- An overlay file either exists completely or not at all — no partial overlays within a single file. Custom domains may provide only a subset of overlay files; missing files are inherited from the parent via `extends`.
- The `extends` chain is exactly one level deep: a custom domain can extend a bundled domain, but a bundled domain cannot extend another domain.
- Domain resolution runs exactly once per skill invocation, at the start, and the result is passed downstream as a concrete value.
- Overlay merge never mutates the base template — it produces a new in-memory result.
- Config merge order: domain profile (resolved via extends) -> governance overlay (governance wins on conflict).

## Capability Map

| Capability | Description | Priority | Phase | Status |
|------------|-------------|----------|-------|--------|
| Domain Resolution Function | `resolveDomain()` — 4-level precedence chain returning a domain string | Must-have | v1 | specified |
| Overlay File Structure | `domains/<domain>/` directory convention with 7 overlay types (charter-overlay, spec-overlay, reviewers, gates, verification, gate-config, test-config) | Must-have | v1 | specified |
| Charter Template Overlay | Domain-specific section names and vocabulary merged into base charter template | Must-have | v1 | specified |
| Spec Template Overlay | Domain-specific error case columns, expectations section replacement | Must-have | v1 | specified |
| Domain-Aware Reviewer Dispatch | Review-specs loads domain-specific reviewer set from overlay | Must-have | v1 | specified |
| Domain-Aware Quality Gates | Validate runs domain-specific gate commands | Should-have | v1 | specified |
| Domain-Aware Verification | Implement loads domain-specific verification config (visual/output/flow) | Should-have | v1 | specified |
| Domain-Aware Lifecycle Gates | Hooks load domain-specific file exclusions and bash passthrough commands | Must-have | v1 | specified |
| Domain-Aware Test Config | Write-test/implement load domain-specific permitted tools and gaming thresholds | Must-have | v1 | specified |
| Bundled Software Profile | Default profile extracting all current hardcoded framework defaults into config files | Must-have | v1 | specified |
| Bundled Data-Engineering Profile | Overlay set for data pipelines: data contracts, fixture strategies, output verification | Should-have | v1 | specified |
| Bundled Process-Automation Profile | Overlay set for workflows: integration points, recovery actions, flow verification | Nice-to-have | v1 | specified |
| Custom Domain Support | Users create `domains/<name>/` with `extends: <parent>` for clone-based customization | Should-have | v1 | specified |

## Interface Contracts

### Exposed

| Name | Type | Description |
|------|------|-------------|
| `resolveDomain(manifest, charterFrontmatter, moduleSlug)` | function | Returns `{ resolved_domain, source_level }`. Single entry point for all skills. Pure function operating on pre-parsed inputs. |
| `loadOverlay(domain, overlayType, repoRoot, pluginRoot)` | function | Reads and returns parsed overlay for a given domain and type, following the `extends` chain for custom domains. `repoRoot` locates `.context-index/domains/`; `pluginRoot` locates `templates/domains/`. For markdown overlays (charter/spec): returns a string. For structured overlays (reviewers/gates/verification/gate-config/test-config): returns a parsed object. Returns `null` if no overlay file exists. |
| `domains/<domain>/` | directory convention | Well-known path where domain profiles are stored. Bundled profiles live in the plugin's `templates/domains/`. Custom profiles live in `.context-index/domains/` with a `domain.yaml` containing `extends: <parent>`. |

### Consumed

| Name | Source Module | Description |
|------|--------------|-------------|
| `manifest.yaml` project.domain | Manifest | Project-level domain declaration |
| `manifest.yaml` modules[].domain | Manifest | Module-level domain override |
| Charter frontmatter `domain` | Charter | Charter-level domain override |
| `governance/review.yaml` | Governance (ADR-0003) | Reviewer registry that domain reviewer overlays merge into |
| `governance/gates.yaml` | Unified Gates | Gate definitions that domain gate overlays merge into |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Backward Compatibility | Projects without a `domain` field behave identically to today. No existing workflow breaks. |
| Performance | Domain resolution adds at most 2 file reads (manifest + charter frontmatter) per skill invocation. Overlay loading adds at most 7 file reads (one per overlay type). No measurable latency impact. |
| Simplicity | A user declares `domain: data-engineering` in manifest and gets adapted templates, reviewers, and gates without further configuration. Zero-config for bundled domains. |
| Extensibility | New domains require only a directory with overlay files. No code changes, no registry updates, no CLI commands. Extensions ship domains as directories. |
| Testability | `resolveDomain()` is a pure function — deterministic output from inputs, no side effects. Overlay loading is file-based — testable with fixture directories. |
