---
status: draft
revision: 4
updated: 2026-05-16
---

# Feature Charter: Extensions

## Business Intent

Extensions provide a distribution and installation mechanism for adev customizations, enabling teams and the community to package and share domain profiles, governance overlays, test strategies, samples, hooks, and standalone skills. Today, customizing the framework requires manually creating files in `.context-index/domains/` with knowledge of the `extends` chain and governance merge semantics. Extensions encapsulate this into installable packages that the CLI merges into the project using existing infrastructure, making the framework adaptable to any domain without modifying core code.

The domain-profiles module (now validated) provides the foundation: `loadDomainConfig()` resolves config files through a custom > bundled > extends chain, and each domain profile is a directory of 7 files (2 templates + 5 YAML configs). Extensions ship domain profiles as directories that install into `.context-index/domains/` with a `domain.yaml` containing `extends: <parent>`.

## Scope and Boundaries

### In Scope

- `adev-extension.yaml` manifest schema defining extension metadata and what the extension provides
- CLI commands: `extension install`, `extension list` (reads manifest stamp)
- Source resolution: npm packages, git repos, local directories — all resolved to a local directory before install
- Content merge into `.context-index/`: governance configs (review, validate, gates), domain profiles (7-file directories with `domain.yaml`), samples
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
- Executable code SHIPPED BY extensions for runtime adev consumption (skills and templates are markdown + YAML only). Executable scripts invoked AS `provides.governance` quality-gate commands are permitted under the existing `configurable-checks.spec.md` rules — they run as child processes via `child_process.execFile`, NOT as adev plugin code. Per Constitution Principle 1 minimization, prefer bash (`bin/<name>.sh`) over `node`/`python` so the example install path requires no extra runtime.
- Modifying or replacing existing bundled skills
- Automated authoring scaffolding tooling (e.g. an `adev extension new` generator). Documentation, manifest templates, and reference example extensions that demonstrate the authoring path are IN scope — they exhibit the contract rather than auto-generating it.

### Dependencies

| Module | Direction | Why |
|--------|-----------|-----|
| CLI | Extends | New `extension install` and `extension list` commands added to cli/index.mjs |
| Governance (ADR-0003) | Consumes | Reviewer/check registry merge semantics for overlay files |
| Domain Profiles | Consumes | Extensions ship domain profiles as 7-file directories (charter-template.md, spec-template.md, reviewers.yaml, gates.yaml, verification.yaml, gate-config.yaml, test-config.yaml) installed to `.context-index/domains/` with a `domain.yaml` declaring `extends: <parent>`. `loadDomainConfig()` resolves them automatically via the custom > bundled > extends chain. |
| Manifest | Extends | New `installed_extensions` field in manifest schema |
| Hooks | Extends | Extension hooks registered in provider hooks.json |
| Provider Adapters | Consumes | Skill and hook registration is provider-specific |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Extension | An installable package of adev customizations | `name`, `version`, `description`, `author`, `requires.adev` (semver range) |
| ExtensionManifest | The `adev-extension.yaml` file declaring what the extension provides | `name`, `version`, `provides` (map of content types: domain-profile, governance, samples, skills, hooks), `requires` |
| ExtensionSource | A resolved location from which an extension is installed | `type` (npm/git/local), `uri`, `resolved_path` (local directory after resolution) |
| ExtensionStamp | A record in manifest.yaml tracking an installed extension | `name`, `version`, `installed_date`, `source_uri` |
| ContentMerge | A single merge operation applying extension content to the project | `content_type` (governance/domain-profile/sample/skill/hook), `source_path`, `target_path`, `strategy` (copy for domain profiles and samples; merge-by-id for governance YAML) |

### Relationships

- An Extension contains exactly one ExtensionManifest (`adev-extension.yaml` at root).
- An ExtensionManifest declares zero or more content entries per type (domain-profile, governance, samples, skills, hooks).
- An ExtensionSource resolves to exactly one local directory containing the ExtensionManifest.
- Installing an Extension produces one ExtensionStamp in the project manifest.
- Installing an Extension produces one or more ContentMerge operations, each targeting a specific file in `.context-index/` or the provider's hooks.json.

### Invariants

- An extension must contain a valid `adev-extension.yaml` at its root. Install fails without it.
- Extension name must be unique within `installed_extensions`. Re-installing the same name updates the existing stamp.
- Extension skills cannot share a name with any bundled skill. The CLI checks and blocks on conflict.
- Governance configs use the same merge semantics as ADR-0003: matching `id` fields are field-overridden (project wins), new `id` entries are appended.
- Domain profile installation writes a directory to `.context-index/domains/<name>/` with a `domain.yaml` containing `extends: <parent>`. The `extends` chain is one level deep (custom -> bundled only), enforced by `loadDomainConfig()`. Extensions CANNOT override bundled domain names (software, data-engineering, process-automation) — they must use unique names.
- All installed content is written to `.context-index/` or provider config — never to the extension's source directory. Install is a one-way copy/merge.
- Install is idempotent: running `extension install` twice with the same extension produces the same project state.

## Capability Map

| Capability | Description | Priority | Milestone | Status |
|------------|-------------|----------|-------|--------|
| Extension Manifest Schema | `adev-extension.yaml` format defining name, version, requires, and provides map | Must-have |  | validated |
| Source Resolution | Resolve npm package, git repo, or local directory to a local path containing `adev-extension.yaml` | Must-have |  | validated |
| Version Compatibility Check | Validate `requires.adev` semver range against installed adev version before installing | Must-have |  | validated |
| Governance Config Merge | Merge extension's reviewer, check, and gate entries into project governance files using ADR-0003 semantics | Must-have |  | validated |
| Domain Profile Installation | Install extension's domain profile directory to `.context-index/domains/<name>/` with `domain.yaml` (`extends: <parent>`). Validates name is not bundled. Profile contains up to 7 files (charter-template.md, spec-template.md, reviewers.yaml, gates.yaml, verification.yaml, gate-config.yaml, test-config.yaml) — missing files inherit from parent via `extends` chain. | Must-have |  | validated |
| Sample Installation | Copy extension's golden samples to `.context-index/samples/` | Should-have |  | validated |
| Skill Registration | Register extension's standalone skills in provider hooks.json | Should-have |  | validated |
| Hook Registration | Register extension's hooks in provider hooks.json | Should-have |  | validated |
| Conflict Detection | Block install when extension skill name collides with a bundled skill | Must-have |  | validated |
| Manifest Stamp | Write `installed_extensions` entry in manifest.yaml on successful install | Must-have |  | validated |
| Extension List Command | `extension list` reads manifest and displays installed extensions with version and date | Should-have |  | validated |
| Extension Authoring Documentation Bundle | `docs/extensions.md` author guide, `templates/adev-extension.example.yaml` manifest template, and `extensions/example-validation-check/` reference extension demonstrating the full provides.* surface (especially `provides.governance` wiring a `kind: quality-gate` check that integrates with `adev report --type validator`). Closes the post-cli-driver-surface documentation gap (issue-485). | Must-have | 0.27.0 | validated |
| Skill Extension Installation (`provides.skill_extensions`) | Extensions declare a map of skill name → source `.md` file. `adev extension install` copies each to `.context-index/skill-extensions/_<ext-name>/<skill>.md`. Read at skill invocation time by `adev skill-ext load` (cli charter). Project-level file at `skill-extensions/<skill>.md` is never touched. | Should-have | | implemented |

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
| `BUNDLED_DOMAIN_NAMES` | Domain Profiles (`lib/domains/constants.mjs`) | Set of immutable domain names (software, data-engineering, process-automation) — extensions must not use these names |
| `loadDomainConfig(domain, configType, repoRoot, pluginRoot)` | Domain Profiles (`lib/domains/domain-config.mjs`) | Automatically resolves installed extension domains via the custom > bundled > extends chain — no extension-specific loading code needed |
| `mergeReviewers(domainOverlay, governanceOverlay)` | Domain Profiles (`lib/domains/merge-reviewers.mjs`) | Merge semantics for domain + governance reviewer registry entries |
| `manifest.yaml` | Manifest | Read `installed_extensions` and adev version; write stamp after install |
| `governance/review.yaml` | Governance | Target file for reviewer config merge |
| `governance/validate.yaml` | Governance | Target file for check config merge |
| `governance/gates.yaml` | Unified Gates | Target file for gate config merge |
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
