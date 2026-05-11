# Live Spec: Extension Core

---
charter: extensions
status: validated
risk_level: medium
milestone: v1
revision: 2
charter-revision: 2
created: 2026-05-10
updated: 2026-05-11
---

## Behavioral Contract

### Preconditions

- `.context-index/` exists with `manifest.yaml`
- For npm sources: `npm` is on PATH
- For git sources: `git` is on PATH
- `adev-cli` is installed and its version is resolvable

### Behaviors

1. **When** `resolveExtensionSource(uri)` is called **then** it first classifies the URI using these rules in order: (a) starts with `/` or `./` or `../` → `local`, (b) starts with `https://`, `http://`, `git://`, `git@`, or `ssh://` → `git`, (c) otherwise → `npm`. If the URI does not match any classification, the call fails with a `SOURCE_RESOLUTION` error listing the URI and the supported formats.

2. **When** the URI is classified as `local` **then** `resolveExtensionSource()` validates that `adev-extension.yaml` exists at the directory root and returns the absolute path as `resolved_path` with `type: "local"`.

3. **When** the URI is classified as `npm` **then** `resolveExtensionSource()` validates the URI matches the npm package name pattern (`^(@[a-z0-9-~][a-z0-9-._~]*/)?[a-z0-9-~][a-z0-9-._~]*$`), runs `npm pack` via `child_process.spawn` (argument array, no shell) to fetch the tarball, extracts it to a temporary directory, validates `adev-extension.yaml` exists, and returns the temp path as `resolved_path` with `type: "npm"`. URIs that fail the npm name pattern are rejected with `SOURCE_RESOLUTION`.

4. **When** the URI is classified as `git` **then** `resolveExtensionSource()` validates the URI matches a known git URL pattern (`^(https?|git|ssh)://` or `^git@`), runs `git clone --depth 1 --config core.hooksPath=/dev/null` via `child_process.spawn` (argument array, no shell) to a temporary directory, validates `adev-extension.yaml` exists, and returns the temp path as `resolved_path` with `type: "git"`. The `core.hooksPath=/dev/null` config prevents execution of attacker-controlled git hooks in the cloned repository.

5. **When** `adev-extension.yaml` is parsed **then** it validates that required fields `name` (non-empty string, kebab-case matching `^[a-z][a-z0-9-]*$`, maximum 64 characters, must not contain `/` or `.` sequences) and `version` (valid semver, maximum 32 characters) are present, and that optional fields (`description`, `author`, `requires`, `provides`) conform to the schema. Invalid manifests cause the install to fail with a descriptive error. Unknown fields in the manifest are silently ignored (forward compatibility).

6. **When** `requires.adev` is present in the extension manifest **then** `installExtension()` validates the semver range against the installed adev version (resolved from the plugin's own `package.json` `version` field). If the installed version does not satisfy the range, the install fails with an `INCOMPATIBLE_VERSION` error listing the required range and the installed version.

7. **When** `requires.adev` is absent from the extension manifest **then** the version check is skipped and installation proceeds.

8. **When** `installExtension()` completes successfully **then** it writes an entry to the `installed_extensions` array in `manifest.yaml` containing `name`, `version`, `installed_date` (ISO 8601), and `source_uri` (with any embedded credentials stripped per RFC 3986 userinfo removal).

9. **When** `installExtension()` is called for an extension whose `name` already exists in `installed_extensions` **then** it updates the existing entry (version, installed_date, source_uri) rather than appending a duplicate. The manifest stamp is idempotent.

10. **When** `resolveExtensionSource(uri)` is called with a local directory that does not contain `adev-extension.yaml` **then** it throws a `MISSING_MANIFEST` error with the path that was checked.

11. **When** `adev-extension.yaml` is missing the `name` field or the `version` field **then** parsing fails with an `INVALID_SCHEMA` error listing the missing required fields.

### Postconditions

- After successful install, `manifest.yaml` contains exactly one entry in `installed_extensions` for the extension name, with current version and date.
- Temporary directories created for npm/git resolution are cleaned up after install completes (success or failure).
- The extension's source directory is never modified by the install process.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| URI does not match any classification rule | Fail listing URI and supported formats | SOURCE_RESOLUTION |
| npm URI fails npm name pattern validation | Fail with the invalid name and expected pattern | SOURCE_RESOLUTION |
| git URI fails git URL pattern validation | Fail with the invalid URL and expected pattern | SOURCE_RESOLUTION |
| Local path has no `adev-extension.yaml` | Fail with path details | MISSING_MANIFEST |
| `adev-extension.yaml` missing `name` or `version` | Fail listing missing fields | INVALID_SCHEMA |
| `name` is not kebab-case, empty, or exceeds 64 chars | Fail with naming rule explanation | INVALID_SCHEMA |
| `version` is not valid semver or exceeds 32 chars | Fail with version string and expected format | INVALID_SCHEMA |
| `requires.adev` range not satisfied | Fail with required range vs installed version | INCOMPATIBLE_VERSION |
| npm pack fails (network, package not found) | Fail with npm error output | SOURCE_RESOLUTION |
| git clone fails (network, auth, repo not found) | Fail with git error output | SOURCE_RESOLUTION |

## System Constitution Reference

- **"Minimize external dependencies"** -- source resolution uses Node.js built-ins (`child_process` for npm/git commands, `fs` for local validation). No new dependencies introduced.
- **"Pure ESM"** -- all extension modules are `.mjs` with `import`/`export`.
- **"Skills are primarily markdown"** -- extensions ship markdown and YAML content, not executable code.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Extension manifest schema | Define and validate `adev-extension.yaml` schema (name, version, requires, provides) | medium |
| Local source resolver | Validate local directory contains `adev-extension.yaml`, return resolved path | small |
| npm source resolver | Run `npm pack`, extract tarball, validate manifest, return temp path | medium |
| git source resolver | Run `git clone --depth 1`, validate manifest, return temp path | medium |
| Version compatibility check | Parse `requires.adev` semver range and validate against installed version | small |
| Manifest stamp writer | Read/write `installed_extensions` array in `manifest.yaml`, idempotent upsert | medium |
| Temp directory cleanup | Ensure temp dirs from npm/git resolution are cleaned up on success and failure | small |

## Acceptance Criteria

- [ ] `resolveExtensionSource()` classifies URIs as local/npm/git using defined rules and rejects unrecognized formats
- [ ] npm and git URIs are validated against their respective patterns before subprocess execution
- [ ] All subprocess calls use `child_process.spawn` with argument arrays (no shell interpolation)
- [ ] Git clones use `--config core.hooksPath=/dev/null` to prevent attacker-controlled hook execution
- [ ] `adev-extension.yaml` schema validation rejects manifests missing `name` or `version`
- [ ] `adev-extension.yaml` schema validation rejects non-kebab-case names, names exceeding 64 chars, and invalid semver versions
- [ ] `requires.adev` semver range is checked against installed version; incompatible installs are blocked
- [ ] Manifest stamp is written to `installed_extensions` on successful install
- [ ] Re-installing the same extension name updates the existing stamp (no duplicates)
- [ ] Missing `adev-extension.yaml` in source directory produces a clear `MISSING_MANIFEST` error
- [ ] npm/git resolution failures produce clear errors with underlying tool output
- [ ] Temp directories are cleaned up after resolution completes
- [ ] All quality gates pass (tests, lint)
- [ ] No constitutional violations introduced
