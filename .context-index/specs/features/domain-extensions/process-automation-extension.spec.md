---
charter: domain-extensions
status: validated
risk_level: low
milestone:
revision: 1
charter-revision: 2
created: 2026-05-11
updated: 2026-05-11
---

# Live Spec: Process Automation Extension

<!-- Live Spec within the domain-extensions charter.
     Defines the structure and content of the process-automation extension package.
     Parent Charter: .context-index/specs/features/domain-extensions/charter.md -->

## Behavioral Contract

### Preconditions

- The `extensions/` directory exists at the repo root (created if missing)
- The existing process-automation domain profile files exist at `templates/domains/process-automation/` (source content for copying)
- The extension install pipeline is functional (`lib/extensions/install.mjs`)
- `BUNDLED_DOMAIN_NAMES` no longer contains `"process-automation"` (requires `bundled-templates-cleanup.spec.md` to be implemented first, otherwise `installExtension()` will throw `BUNDLED_COLLISION`)

### Behaviors

1. **When** `extensions/process-automation/` is created **then** it contains exactly: `adev-extension.yaml` at the root and a `domain/` subdirectory with 7 files (charter-template.md, spec-template.md, reviewers.yaml, gates.yaml, verification.yaml, gate-config.yaml, test-config.yaml).

2. **When** the `adev-extension.yaml` manifest is parsed by `parseExtensionManifest()` **then** it validates successfully with `name: "process-automation"`, a valid semver `version`, `requires.adev` specifying a compatible version range, and `provides.domain-profile` pointing to the `domain/` subdirectory with `extends: software`.

3. **When** `npx adev-cli extension install ./extensions/process-automation` is run against a project **then** the domain profile is copied to `.context-index/domains/process-automation/` with a `domain.yaml` containing `extends: software`, and an `installed_extensions` entry is stamped in `manifest.yaml`.

4. **When** `loadDomainConfig("process-automation", "reviewers", repoRoot, pluginRoot)` is called after installation **then** it returns the process-automation reviewers config (containing `integration-reviewer`), not the software default.

5. **When** a file is missing from the extension's `domain/` directory **then** `loadDomainConfig()` falls through to the software profile via the `extends: software` chain for that file type.

6. **When** the extension is installed a second time **then** the domain profile directory is overwritten idempotently — no duplicate files or manifest stamps.

7. **When** the domain profile content is compared to the existing `templates/domains/process-automation/` files **then** all 7 files are content-identical (the extension packages existing content, not new content).

### Postconditions

- `extensions/process-automation/` is a self-contained directory installable by the existing pipeline
- The `adev-extension.yaml` manifest passes schema validation
- After install, the process-automation domain resolves correctly through `loadDomainConfig()`

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Extension name collides with `BUNDLED_DOMAIN_NAMES` | Install blocked by pipeline | `BUNDLED_COLLISION` |
| `adev-extension.yaml` has invalid schema | Install blocked by pipeline | `INVALID_SCHEMA` |
| `requires.adev` range not satisfied | Install blocked by pipeline | `INCOMPATIBLE_VERSION` |

## System Constitution Reference

- **"Minimize external dependencies"** — The extension contains only markdown and YAML files. No executable code, no dependencies.
- **"Skills are primarily markdown"** — Domain templates (charter-template.md, spec-template.md) are markdown consumed by skills, consistent with this principle.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Create extension directory structure | Create `extensions/process-automation/` with `adev-extension.yaml` and `domain/` subdirectory | small |
| Write extension manifest | Author `adev-extension.yaml` with name, version, requires, and provides.domain-profile | small |
| Copy domain profile files | Move the 7 files from `templates/domains/process-automation/` to `extensions/process-automation/domain/` | small |
| Write README | Brief README explaining what the extension provides and how to install | small |
| Add install integration test | Test that installs from local path, verifies domain resolution, verifies idempotency | medium |

## Acceptance Criteria

- [ ] `extensions/process-automation/adev-extension.yaml` exists and passes `parseExtensionManifest()` validation
- [ ] `extensions/process-automation/domain/` contains all 7 domain profile files
- [ ] Domain profile files are content-identical to `templates/domains/process-automation/`
- [ ] `npx adev-cli extension install ./extensions/process-automation` succeeds
- [ ] After install, `loadDomainConfig("process-automation", ...)` returns extension content
- [ ] Re-install is idempotent (no duplicates)
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
