---
charter: domain-profiles
status: validated
risk_level: medium
milestone:
revision: 6
charter-revision: 5
created: 2026-05-07
updated: 2026-05-10
source-manifest:
  sha: "f6a29b0"
  files:
    - docs/configuration.md
    - docs/skill-reference.md
    - lib/domains/constants.mjs
    - lib/domains/resolve.mjs
    - tests/lib/domains/constants.test.mjs
    - tests/lib/domains/resolve.test.mjs
  computed-at: "2026-05-11T16:09:28.530Z"
drift_detected: true
---

# Live Spec: Domain Resolution & Overlay Structure

<!-- Live Spec within the domain-profiles charter.
     This defines the foundational resolution engine and file conventions for domain profiles.
     Parent Charter: .context-index/specs/features/domain-profiles/charter.md -->

## Behavioral Contract

This spec defines three things: the `resolveDomain(manifest, charterFrontmatter, moduleSlug)` function that determines which domain is active for a given context, the `loadDomainConfig(domain, overlayType, repoRoot, pluginRoot)` function that reads overlay files from a resolved domain directory, and the directory conventions that govern where domain profiles live.

All functions are implemented as deterministic, testable companion code in `lib/domains/`. Skills invoke these functions programmatically — not via markdown instructions.

### Companion Code Requirement

All domain resolution and overlay loading logic MUST be implemented as executable JavaScript modules (`lib/domains/resolve.mjs`, `lib/domains/domain-config.mjs`), not as markdown skill instructions. Skills call these modules directly. This ensures:
- Deterministic behavior across all skills (no interpretation variance)
- Testable with unit tests and fixture directories
- Single source of truth for resolution precedence and overlay loading

### Function Signatures

```
resolveDomain(manifest, charterFrontmatter, moduleSlug)
  -> { resolved_domain: string, source_level: "charter" | "module" | "project" | "default" }

loadDomainConfig(domain, overlayType, repoRoot, pluginRoot)
  -> string | object | null
```

`manifest` is a pre-parsed object (the caller reads manifest.yaml). `charterFrontmatter` is a pre-parsed object or `null`. `moduleSlug` is a string or `null`. `repoRoot` is the repository root where `.context-index/` resides. `pluginRoot` is the plugin installation root where `templates/` resides. Both roots are injected by callers — the functions do not resolve them internally. This keeps both functions pure and testable with fixture directories.

### Manifest Schema Extension

This feature requires `manifest.yaml` to support two optional fields:
- `project.domain` (string) — project-level domain declaration
- `modules[].domain` (string) — per-module domain override

Both fields are optional. Existing manifests without these fields behave identically to today (backward compatibility). Manifest parsing must accept and preserve these fields without validation errors.

### Overlay Type-to-Filename Mapping

| Overlay Type Constant | Filename | Return Type |
|----------------------|----------|-------------|
| `"charter-template"` | `charter-template.md` | `string` |
| `"spec-template"` | `spec-template.md` | `string` |
| `"reviewers"` | `reviewers.yaml` | `object` |
| `"gates"` | `gates.yaml` | `object` |
| `"verification"` | `verification.yaml` | `object` |
| `"gate-config"` | `gate-config.yaml` | `object` |
| `"test-config"` | `test-config.yaml` | `object` |

**Deprecated type names:** The old type names `"charter-overlay"` and `"spec-overlay"` are recognized by `loadDomainConfig()` but emit a deprecation warning (`DOMAIN_CONFIG_TYPE_DEPRECATED`) and return `null`. Use `"charter-template"` and `"spec-template"` instead.

### Schema Responsibility Boundary

`loadDomainConfig()` is responsible for file resolution, reading, and parsing (YAML syntax validation for structured types). It is NOT responsible for validating the semantic schema of parsed objects (e.g., whether `reviewers.yaml` contains a `merge_strategy` field). Schema validation is the responsibility of each consuming skill's merge function (see `domain-aware-skill-integration.spec.md`). This separation keeps `loadDomainConfig()` generic and decoupled from skill-specific overlay schemas.

- **Parse-time errors** (malformed YAML syntax) -> `DOMAIN_CONFIG_PARSE_ERROR` thrown by `loadDomainConfig()`
- **Merge-time errors** (valid YAML but missing/invalid fields for the skill's expectations) -> `DOMAIN_CONFIG_MERGE_WARN` emitted by the consuming skill

### Custom Domains and the `extends` Model

Bundled domain profiles (`software`, `data-engineering`, `process-automation`) are **immutable** — they live in the plugin's `templates/domains/` directory and are never modified by the framework or the user.

Users CANNOT create `.context-index/domains/<bundled-name>/` to override a bundled profile directly. If a user creates a directory matching a bundled domain name, `loadDomainConfig()` rejects it with `BUNDLED_OVERRIDE_BLOCKED`.

To customize a domain, users create a **new domain** that `extends` a bundled profile:

```yaml
# .context-index/domains/my-project/domain.yaml
extends: software
```

The custom domain directory contains only the files the user wants to override. Missing files are inherited from the parent profile via the `extends` chain.

To reset all customizations: change `domain: my-project` back to `domain: software` in the manifest. The bundled profile is always pristine.

### `loadDomainConfig()` Resolution with `extends`

When `loadDomainConfig()` is called for a domain:

1. Check if the domain has a directory at `.context-index/domains/<domain>/`
2. If yes, check for a `domain.yaml` in that directory. Parse the `extends` field (if present).
3. For the requested overlay type, resolve in this order (first found wins):
   a. `.context-index/domains/<domain>/<file>` (custom override)
   b. `<pluginRoot>/templates/domains/<domain>/<file>` (bundled — only for bundled domains)
   c. If `extends` is set: `<pluginRoot>/templates/domains/<extends>/<file>` (parent fallback)
4. If none found, return `null`.

The `extends` chain is exactly one level deep (no recursive inheritance). A custom domain can extend a bundled domain; a bundled domain cannot extend another domain.

### Config Merge Order

When multiple layers provide the same overlay type, they merge in this order (later wins):

1. **Domain profile** — resolved via `loadDomainConfig()` (custom override -> bundled -> parent via `extends`)
2. **Project governance overrides** — `<repoRoot>/.context-index/governance/<file>` (project policy layer)

`loadDomainConfig()` handles layer 1 (returning the resolved domain file following the `extends` chain). Layer 2 (governance merge) is the responsibility of each consuming skill's merge function — governance files are a separate overlay that skills apply after loading the domain profile.

### Preconditions

- `manifest.yaml` exists and is parseable (for project-level and module-level domain fields)
- Charter frontmatter is parseable when a charter is in scope
- The plugin root is resolvable (for locating bundled domain profiles)

### Behaviors

1. **When** `resolveDomain()` is called with charter frontmatter containing `domain: X` **then** it validates `X` against the domain name pattern `/^[a-z0-9][a-z0-9-]*$/` (see Behavior 11) and returns `X` with `source_level: "charter"`, regardless of module or project domain settings.

2. **When** `resolveDomain()` is called without a charter-level domain but with `manifest.yaml` containing `modules[slug].domain: X` for the given module slug **then** it validates and returns `X` with `source_level: "module"`.

3. **When** `resolveDomain()` is called without charter-level or module-level domain but with `manifest.yaml` containing `project.domain: X` **then** it validates and returns `X` with `source_level: "project"`.

4. **When** `resolveDomain()` is called with no domain declared at any level **then** it returns `"software"` with `source_level: "default"`.

5. **When** `resolveDomain()` returns `"software"` (whether by default or explicitly declared) **then** `loadDomainConfig()` reads from the `software` profile directory like any other domain. The `software` profile is a real, bundled profile containing all current framework defaults extracted into config files. There is no special-case behavior for `"software"` — it follows the same resolution path as any other domain.

6. **When** `loadDomainConfig()` is called with a domain and overlay type **then** it first validates the overlay type against the closed set of known constants (see Overlay Type-to-Filename Mapping). If the type is not in the set, it returns `null` immediately — no filesystem path is constructed or accessed. For valid types, it maps the type to its filename, resolves `repoRoot` and `pluginRoot` to their real paths via `fs.realpathSync()`, and follows the resolution order defined in "loadDomainConfig() Resolution with extends" above. Each resolved candidate path is verified to start with its respective resolved root before reading. The first valid path found wins.

7. **When** `loadDomainConfig()` is called for a custom domain (defined in `.context-index/domains/<domain>/`) that has an `extends` field in its `domain.yaml` **then** for any overlay type not found in the custom domain's directory, `loadDomainConfig()` falls back to the parent profile in `<pluginRoot>/templates/domains/<extends>/`. The `extends` chain is exactly one level deep — no recursive inheritance.

8. **When** `loadDomainConfig()` is called for a domain or overlay type with no matching file at any resolution level (custom, bundled, parent) **then** it returns `null`.

9. **When** `loadDomainConfig()` detects a `.context-index/domains/<name>/` directory where `<name>` matches a bundled domain name (`software`, `data-engineering`, `process-automation`) **then** it throws with error code `BUNDLED_OVERRIDE_BLOCKED` and the message: `"Cannot override bundled domain '<name>'. Create a custom domain with 'extends: <name>' instead."` This check runs before any file reads.

10. **When** `loadDomainConfig()` reads a markdown template (`charter-template` or `spec-template` type) **then** it returns the file contents as a string.

11. **When** `loadDomainConfig()` reads a structured overlay (`reviewers`, `gates`, `verification`, `gate-config`, or `test-config` type) **then** it parses the YAML and returns the parsed object. No semantic schema validation is performed — that is the consuming skill's responsibility.

12. **When** `resolveDomain()` resolves a domain value from any level (charter, module, or project) **then** it validates the value against the pattern `/^[a-z0-9][a-z0-9-]*$/` (lowercase alphanumeric and hyphens, must start with a letter or digit). Values containing path separators (`/`, `\`), dot-sequences (`..`), or characters outside the pattern are rejected with error code `INVALID_DOMAIN_NAME`. This prevents path traversal when the domain string is interpolated into filesystem paths by `loadDomainConfig()`.

13. **When** `loadDomainConfig()` is called and the overlay file size exceeds 512 KB **then** it throws with error code `DOMAIN_CONFIG_TOO_LARGE` identifying the project-relative file path and size. The size check uses `fs.stat()` on the resolved real path (after symlink resolution), and the read immediately follows the stat within the same synchronous call chain to minimize TOCTOU risk.

14. **When** a user creates a `.context-index/domains/<name>/` directory (where `<name>` is NOT a bundled domain name) with a `domain.yaml` containing `extends: <parent>` **then** those overlays are discovered by `loadDomainConfig()` without any code changes, registry updates, or CLI commands. The `domain.yaml` file is the only required file in a custom domain directory.

15. **When** a consuming skill needs the fully merged config for an overlay type **then** it calls `loadDomainConfig()` to get the domain-level config (resolved via extends chain), then reads the corresponding governance file (if any), and merges them using its own merge function. The skill never reads hardcoded defaults from code — all defaults come from the domain profile files.

### Postconditions

- `resolveDomain()` returns a deterministic result: given the same manifest, charter frontmatter, and module slug, it always returns the same domain string and source level.
- Domain resolution runs exactly once per skill invocation — the result is passed downstream as a concrete value.
- `loadDomainConfig()` never mutates any file — it is a pure read operation.
- All domain values returned by `resolveDomain()` are safe for filesystem path interpolation (validated against `/^[a-z0-9][a-z0-9-]*$/`).
- No skill contains hardcoded defaults for any configurable behavior — all defaults are read from the resolved domain profile.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `manifest.yaml` is missing or unparseable | Return `"software"` with `source_level: "default"` (graceful fallback) | — |
| Charter frontmatter has `domain:` with empty value | Treat as no charter-level domain; continue to module/project/default | — |
| Module slug does not match any entry in `manifest.yaml` modules list | Skip module-level resolution; continue to project/default | — |
| Domain value contains path separators, `..`, or invalid characters | Throw with descriptive message citing the invalid value and source level | INVALID_DOMAIN_NAME |
| `loadDomainConfig()` called with unknown overlay type | Return `null` immediately — no filesystem path is constructed | — |
| Resolved file path escapes its root directory (repoRoot or pluginRoot) | Throw with the offending path (project-relative) and root | PATH_ESCAPE |
| Overlay file exists but is empty | Return empty string (markdown) or empty object (structured) | — |
| Overlay file exists but is malformed YAML (structured type) | Throw with project-relative file path and line number (when available) — raw parser error content is not included to prevent leaking file contents | DOMAIN_CONFIG_PARSE_ERROR |
| Overlay file exceeds 512 KB | Throw with project-relative file path and size | DOMAIN_CONFIG_TOO_LARGE |
| Domain directory exists but contains no overlay files for the requested type | Follow extends chain to parent; return `null` only if parent also lacks the file | — |
| Bundled domain profile directory missing for resolved domain | Return `null` for all overlay types; skills log a warning and use empty defaults | DOMAIN_NOT_FOUND |
| `.context-index/domains/<name>/` matches a bundled domain name | Throw before any file reads | BUNDLED_OVERRIDE_BLOCKED |
| Custom domain `domain.yaml` has `extends` pointing to a non-existent domain | Throw with the missing parent name | EXTENDS_NOT_FOUND |
| Custom domain `domain.yaml` has `extends` pointing to another custom domain (recursive) | Throw — extends chain is limited to one level (custom -> bundled only) | EXTENDS_DEPTH_EXCEEDED |
| Custom domain directory lacks `domain.yaml` | Treat as a domain with no parent (no extends fallback); overlay files in the directory are used directly | — |

## System Constitution Reference

- **"Minimize external dependencies"** — `resolveDomain()` and `loadDomainConfig()` use only `fs` and `path` from Node.js built-ins. The YAML parsing for structured overlays reuses the existing line-based parser pattern.
- **"Skills are primarily markdown"** — Domain profiles are overlay files (markdown and YAML), not executable code. The resolution functions are companion code that skills call.
- **"Pure ESM"** — `lib/domains/resolve.mjs` and `lib/domains/domain-config.mjs` follow ESM conventions.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Implement `resolveDomain()` in `lib/domains/resolve.mjs` | Pure function: read charter frontmatter -> module manifest -> project manifest -> default. Validate domain name pattern. Return `{ resolved_domain, source_level }` | small |
| Implement `loadDomainConfig()` in `lib/domains/domain-config.mjs` | File reader with two-level path precedence, type-to-filename mapping, size guard. Return string for markdown, parsed object for structured types, null for missing | small |
| Define overlay type constants in `lib/domains/constants.mjs` | Enumerate valid overlay types, filename mappings, bundled domain names, and config merge order | small |
| Add domain name validation | Validate domain values against `/^[a-z0-9][a-z0-9-]*$/` with INVALID_DOMAIN_NAME error | small |
| Implement `extends` resolution in `loadDomainConfig()` | Read `domain.yaml` from custom domain dir, parse `extends` field, fall back to parent for missing files. Enforce one-level depth limit. | medium |
| Implement bundled override guard | Check `.context-index/domains/` for directories matching bundled names, throw `BUNDLED_OVERRIDE_BLOCKED` | small |
| Add manifest schema support | Extend manifest parsing to recognize `project.domain` and `modules[].domain` fields | small |
| Implement `loadDomainConfig()` helper in `lib/domains/config.mjs` | Convenience function that calls `resolveDomain()` + `loadDomainConfig()` for a given type, then merges with governance file. Returns fully resolved config object. Deterministic script, not markdown. | medium |
| Write unit tests | Test all 4 resolution levels, precedence, fallback, two-level overlay loading, null returns, parse errors, domain name validation, size guard, extends chain, bundled override guard | medium |
| Update `docs/configuration.md` | Document domain profiles: resolution precedence, extends model, overlay types, customization workflow (clone + override), reset instructions | medium |

## Acceptance Criteria

- [ ] `resolveDomain()` is implemented as executable code in `lib/domains/resolve.mjs` (not markdown instructions)
- [ ] `loadDomainConfig()` is implemented as executable code in `lib/domains/domain-config.mjs` (not markdown instructions)
- [ ] `resolveDomain()` correctly resolves all 4 precedence levels (charter > module > project > default)
- [ ] `resolveDomain()` is deterministic — same inputs always produce same output
- [ ] `resolveDomain()` validates domain values against `/^[a-z0-9][a-z0-9-]*$/` and rejects invalid values with INVALID_DOMAIN_NAME
- [ ] Domain values containing path separators or `..` are rejected (path traversal prevention)
- [ ] `domain: software` is a real profile — `loadDomainConfig("software", ...)` reads from `templates/domains/software/`
- [ ] No special-case code path exists for `"software"` — same resolution as any other domain
- [ ] `loadDomainConfig()` validates overlay type against the closed constant set before constructing any filesystem path
- [ ] `loadDomainConfig()` resolves `repoRoot` and `pluginRoot` to real paths via `fs.realpathSync()` and asserts candidate paths stay within their root (PATH_ESCAPE on violation)
- [ ] `loadDomainConfig()` maps overlay type constants to filenames per the type-to-filename table (including `gate-config` and `test-config`)
- [ ] `loadDomainConfig()` follows extends chain: custom override -> bundled -> parent (via extends)
- [ ] `loadDomainConfig()` returns `null` when no overlay file exists at any resolution level
- [ ] `.context-index/domains/<bundled-name>/` is rejected with `BUNDLED_OVERRIDE_BLOCKED`
- [ ] Custom domains with `extends: <parent>` inherit missing overlay files from the parent
- [ ] `extends` chain is limited to one level (custom -> bundled only); recursive extends throws `EXTENDS_DEPTH_EXCEEDED`
- [ ] `extends` pointing to non-existent domain throws `EXTENDS_NOT_FOUND`
- [ ] Custom domain without `domain.yaml` works (no extends fallback, files used directly)
- [ ] `loadDomainConfig()` returns string for markdown overlays, parsed object for structured overlays
- [ ] `loadDomainConfig()` rejects overlay files exceeding 512 KB with DOMAIN_CONFIG_TOO_LARGE; size check uses `fs.stat` on the resolved real path
- [ ] `loadDomainConfig()` performs YAML syntax validation only — semantic schema validation is deferred to consuming skills
- [ ] `DOMAIN_CONFIG_PARSE_ERROR` messages include only project-relative file path and line number (when available), not raw parser output
- [ ] Error messages use project-relative file paths, not absolute paths
- [ ] Custom domain directories are discovered without code changes
- [ ] Config merge order is: domain profile (resolved via extends chain) -> governance overlay
- [ ] Each `loadDomainConfig()` call adds at most 2 file reads (project-local then bundled, short-circuiting on first hit)
- [ ] Projects without any `domain` field resolve to `"software"` and get the bundled software profile defaults
- [ ] `docs/configuration.md` is updated with domain profiles documentation: resolution precedence, `extends` model, customization workflow, reset instructions, overlay type reference
- [ ] `docs/skill-reference.md` is updated for all affected skills noting domain-aware behavior
- [ ] All quality gates pass (tests, lint)
- [ ] No constitutional violations introduced
