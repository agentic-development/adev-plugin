---
status: draft
revision: 1
updated: 2026-05-06
---

# Feature Charter: Extensions

## Business Intent

Extensions provide a distribution and installation mechanism for adev customizations, enabling teams and the community to package and share domain-specific templates, reviewers, test strategies, samples, hooks, governance overlays, domain profiles, and standalone skills. Today, customizing the framework requires manually creating files in `.context-index/` with knowledge of governance merge semantics. Extensions encapsulate this into installable packages that the CLI merges into the project using existing infrastructure, making the framework adaptable to any domain without modifying core code.

## Scope and Boundaries

### In Scope

- `adev-extension.yaml` manifest schema defining extension metadata and what the extension provides
- CLI commands: `extension install`, `extension list` (reads manifest stamp)
- Source resolution: npm packages, git repos, local directories — all resolved to a local directory before install
- Content merge into `.context-index/`: governance overlays (review, validate, gates), domain profiles, templates, samples
- Skill registration: new standalone skills added to provider hooks.json
- Hook registration: new hooks added to provider hooks.json
- Version compatibility check: `requires.adev` field validated against installed adev version
- Conflict detection: block install if extension provides a skill with the same name as a bundled skill
- Manifest stamp: `installed_extensions` array in manifest.yaml tracking name, version, install date
- Idempotent re-install: running install again updates files and manifest stamp

### Out of Scope

- `extension remove` command (manual file removal via git for 1.0)
- Extension dependencies on other extensions (each extension is self-contained)
- Automatic updates or version polling
- Extension marketplace or discovery service
- Runtime loading — extensions are consumed at install time only
- Executable code in extensions (content is markdown, YAML, and bash only)
- Modifying or replacing existing bundled skills
- Extension authoring tooling (scaffolding a new extension)

### Dependencies

| Module | Direction | Why |
|--------|-----------|-----|
| CLI | Extends | New `extension install` and `extension list` commands added to cli/index.mjs |
| Governance (ADR-0003) | Consumes | Reviewer/check registry merge semantics for overlay files |
| Domain Profiles | Consumes | Extensions ship domain profiles as overlay directories |
| Manifest | Extends | New `installed_extensions` field in manifest schema |
| Hooks | Extends | Extension hooks registered in provider hooks.json |
| Provider Adapters | Consumes | Skill and hook registration is provider-specific |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Extension | An installable package of adev customizations | `name`, `version`, `description`, `author`, `requires.adev` (semver range) |
| ExtensionManifest | The `adev-extension.yaml` file declaring what the extension provides | `name`, `version`, `provides` (map of content types to file lists), `requires` |
| ExtensionSource | A resolved location from which an extension is installed | `type` (npm/git/local), `uri`, `resolved_path` (local directory after resolution) |
| ExtensionStamp | A record in manifest.yaml tracking an installed extension | `name`, `version`, `installed_date`, `source_uri` |
| ContentMerge | A single merge operation applying extension content to the project | `content_type` (governance/domain/template/sample/skill/hook), `source_path`, `target_path`, `strategy` (copy/merge) |

### Relationships

- An Extension contains exactly one ExtensionManifest (`adev-extension.yaml` at root).
- An ExtensionManifest declares zero or more content entries per type (reviewers, templates, strategies, samples, hooks, skills, domain profiles, governance overlays).
- An ExtensionSource resolves to exactly one local directory containing the ExtensionManifest.
- Installing an Extension produces one ExtensionStamp in the project manifest.
- Installing an Extension produces one or more ContentMerge operations, each targeting a specific file in `.context-index/` or the provider's hooks.json.

### Invariants

- An extension must contain a valid `adev-extension.yaml` at its root. Install fails without it.
- Extension name must be unique within `installed_extensions`. Re-installing the same name updates the existing stamp.
- Extension skills cannot share a name with any bundled skill. The CLI checks and blocks on conflict.
- Governance overlays use the same merge semantics as ADR-0003: matching `id` fields are field-overridden (project wins), new `id` entries are appended.
- All installed content is written to `.context-index/` or provider config — never to the extension's source directory. Install is a one-way copy/merge.
- Install is idempotent: running `extension install` twice with the same extension produces the same project state.

## Capability Map

| Capability | Description | Priority | Phase | Status |
|------------|-------------|----------|-------|--------|
| Extension Manifest Schema | `adev-extension.yaml` format defining name, version, requires, and provides map | Must-have | v1 | — |
| Source Resolution | Resolve npm package, git repo, or local directory to a local path containing `adev-extension.yaml` | Must-have | v1 | — |
| Version Compatibility Check | Validate `requires.adev` semver range against installed adev version before installing | Must-have | v1 | — |
| Governance Overlay Merge | Merge extension's reviewer, check, and gate entries into project governance files using ADR-0003 semantics | Must-have | v1 | — |
| Domain Profile Installation | Copy extension's domain profile directories to `.context-index/domains/` | Must-have | v1 | — |
| Template Installation | Copy extension's charter/spec template overlays to `.context-index/` | Must-have | v1 | — |
| Sample Installation | Copy extension's golden samples to `.context-index/samples/` | Should-have | v1 | — |
| Skill Registration | Register extension's standalone skills in provider hooks.json | Should-have | v1 | — |
| Hook Registration | Register extension's hooks in provider hooks.json | Should-have | v1 | — |
| Conflict Detection | Block install when extension skill name collides with a bundled skill | Must-have | v1 | — |
| Manifest Stamp | Write `installed_extensions` entry in manifest.yaml on successful install | Must-have | v1 | — |
| Extension List Command | `extension list` reads manifest and displays installed extensions with version and date | Should-have | v1 | — |

## Interface Contracts

### Exposed

| Name | Type | Description |
|------|------|-------------|
| `resolveExtensionSource(uri)` | function | Takes an npm package name, git URL, or local path. Returns a resolved local directory path. Fetches/clones as needed. |
| `installExtension(resolvedPath, projectRoot)` | function | Reads `adev-extension.yaml`, validates version compatibility, runs all content merge operations, writes manifest stamp. Returns install report (files written, merges applied, conflicts detected). |
| `listExtensions(manifest)` | function | Returns array of ExtensionStamp entries from manifest's `installed_extensions`. |
| `npx adev-cli extension install <source>` | CLI command | User-facing install command. Resolves source, installs, reports results. |
| `npx adev-cli extension list` | CLI command | User-facing list command. Displays installed extensions. |

### Consumed

| Name | Source Module | Description |
|------|--------------|-------------|
| `mergeReviewers(bundled, overlay, warnings)` | Governance (ADR-0003) | Merge semantics for reviewer registry entries |
| `manifest.yaml` | Manifest | Read `installed_extensions` and adev version; write stamp after install |
| `governance/review.yaml` | Governance | Target file for reviewer overlay merge |
| `governance/validate.yaml` | Governance | Target file for check overlay merge |
| `governance/gates.yaml` | Unified Gates | Target file for gate overlay merge |
| Provider hooks.json | Provider Adapters | Target for skill and hook registration |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Idempotency | Running `extension install` twice with the same extension produces the same project state. No duplicate files, no duplicate governance entries, no duplicate manifest stamps. |
| Safety | Install never deletes existing project files. Governance merges follow project-wins semantics. Skill name conflicts block the install rather than overwriting. |
| Transparency | Install reports every file written and every merge applied, so the user can review changes before committing. |
| Offline Resilience | Local directory sources work fully offline. npm/git sources require network only for the initial fetch — once resolved, install is local. |
| Backward Compatibility | Projects without extensions behave identically to today. The `installed_extensions` field is optional in manifest. |
| Testability | `resolveExtensionSource()` and `installExtension()` are pure functions operating on file paths. Testable with fixture directories and temp manifests using existing test helpers. |
