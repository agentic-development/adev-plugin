# Live Spec: Domain Resolution & Overlay Structure

<!-- Live Spec within the domain-profiles charter.
     This defines the foundational resolution engine and file conventions for domain profiles.
     Parent Charter: .context-index/specs/features/domain-profiles/charter.md -->

---
charter: domain-profiles
status: review-passed
risk_level: medium
milestone: v1
revision: 3
charter-revision: 3
created: 2026-05-07
updated: 2026-05-08
---

## Behavioral Contract

This spec defines three things: the `resolveDomain(manifest, charterFrontmatter, moduleSlug, pluginRoot)` function that determines which domain is active for a given context, the `loadOverlay(domain, overlayType, repoRoot, pluginRoot)` function that reads overlay files from a resolved domain directory, and the directory conventions that govern where domain profiles live.

### Function Signatures

```
resolveDomain(manifest, charterFrontmatter, moduleSlug, pluginRoot)
  → { resolved_domain: string, source_level: "charter" | "module" | "project" | "default" }

loadOverlay(domain, overlayType, repoRoot, pluginRoot)
  → string | object | null
```

The `pluginRoot` parameter is required by `loadOverlay()` to locate bundled profiles and by `resolveDomain()` for future extensibility. `repoRoot` is the repository root where `.context-index/` resides. Both roots are injected by callers — the functions do not resolve them internally. This keeps both functions pure and testable with fixture directories.

### Manifest Schema Extension

This feature requires `manifest.yaml` to support two optional fields:
- `project.domain` (string) — project-level domain declaration
- `modules[].domain` (string) — per-module domain override

Both fields are optional. Existing manifests without these fields behave identically to today (backward compatibility). Manifest parsing must accept and preserve these fields without validation errors.

### Overlay Type-to-Filename Mapping

| Overlay Type Constant | Filename | Return Type |
|----------------------|----------|-------------|
| `"charter-overlay"` | `charter-overlay.md` | `string` |
| `"spec-overlay"` | `spec-overlay.md` | `string` |
| `"reviewers"` | `reviewers.yaml` | `object` |
| `"gates"` | `gates.yaml` | `object` |
| `"verification"` | `verification.yaml` | `object` |

### Schema Responsibility Boundary

`loadOverlay()` is responsible for file resolution, reading, and parsing (YAML syntax validation for structured types). It is NOT responsible for validating the semantic schema of parsed objects (e.g., whether `reviewers.yaml` contains a `merge_strategy` field). Schema validation is the responsibility of each consuming skill's merge function (see `domain-aware-skill-integration.spec.md`). This separation keeps `loadOverlay()` generic and decoupled from skill-specific overlay schemas.

- **Parse-time errors** (malformed YAML syntax) → `OVERLAY_PARSE_ERROR` thrown by `loadOverlay()`
- **Merge-time errors** (valid YAML but missing/invalid fields for the skill's expectations) → `OVERLAY_MERGE_WARN` emitted by the consuming skill

### Preconditions

- `manifest.yaml` exists and is parseable (for project-level and module-level domain fields)
- Charter frontmatter is parseable when a charter is in scope
- The plugin root is resolvable (for locating bundled domain profiles)

### Behaviors

1. **When** `resolveDomain()` is called with charter frontmatter containing `domain: X` **then** it validates `X` against the domain name pattern `/^[a-z0-9][a-z0-9-]*$/` (see Behavior 12) and returns `X` with `source_level: "charter"`, regardless of module or project domain settings.

2. **When** `resolveDomain()` is called without a charter-level domain but with `manifest.yaml` containing `modules[slug].domain: X` for the given module slug **then** it validates and returns `X` with `source_level: "module"`.

3. **When** `resolveDomain()` is called without charter-level or module-level domain but with `manifest.yaml` containing `project.domain: X` **then** it validates and returns `X` with `source_level: "project"`.

4. **When** `resolveDomain()` is called with no domain declared at any level **then** it returns `"software"` with `source_level: "default"`.

5. **When** `resolveDomain()` is called with `domain: software` declared explicitly **then** it behaves identically to no declaration — base templates are used as-is and no `domains/software/` overlay directory is consulted. `"software"` is a reserved domain name: it represents the framework's base behavior. Users must not create a `domains/software/` overlay directory; `loadOverlay()` will never be called with `domain: "software"`.

6. **When** `loadOverlay()` is called with a domain and overlay type **then** it first validates the overlay type against the closed set of known constants (see Overlay Type-to-Filename Mapping). If the type is not in the set, it returns `null` immediately — no filesystem path is constructed or accessed. For valid types, it maps the type to its filename, resolves `repoRoot` and `pluginRoot` to their real paths via `fs.realpathSync()`, constructs candidate paths (`.context-index/domains/<domain>/<filename>` under repoRoot, `templates/domains/<domain>/<filename>` under pluginRoot), and verifies each resolved candidate path starts with its respective resolved root before reading. The first valid path found wins.

7. **When** `loadOverlay()` is called and the overlay file exists at the project-local path **then** the bundled path is not read, even if it also exists.

8. **When** `loadOverlay()` is called for a domain or overlay type with no matching file at either path **then** it returns `null`.

9. **When** `loadOverlay()` reads a markdown overlay (`charter-overlay` or `spec-overlay` type) **then** it returns the file contents as a string.

10. **When** `loadOverlay()` reads a structured overlay (`reviewers`, `gates`, or `verification` type) **then** it parses the YAML and returns the parsed object. No semantic schema validation is performed — that is the consuming skill's responsibility.

11. **When** a user creates a `.context-index/domains/<name>/` directory with overlay files **then** those overlays are discovered by `loadOverlay()` without any code changes, registry updates, or CLI commands.

12. **When** `resolveDomain()` resolves a domain value from any level (charter, module, or project) **then** it validates the value against the pattern `/^[a-z0-9][a-z0-9-]*$/` (lowercase alphanumeric and hyphens, must start with a letter or digit). Values containing path separators (`/`, `\`), dot-sequences (`..`), or characters outside the pattern are rejected with error code `INVALID_DOMAIN_NAME`. This prevents path traversal when the domain string is interpolated into filesystem paths by `loadOverlay()`.

13. **When** `loadOverlay()` is called and the overlay file size exceeds 512 KB **then** it throws with error code `OVERLAY_TOO_LARGE` identifying the project-relative file path and size. The size check uses `fs.stat()` on the resolved real path (after symlink resolution), and the read immediately follows the stat within the same synchronous call chain to minimize TOCTOU risk. This prevents memory exhaustion from adversarially large YAML files.

### Postconditions

- `resolveDomain()` returns a deterministic result: given the same manifest, charter frontmatter, and module slug, it always returns the same domain string and source level.
- Domain resolution runs exactly once per skill invocation — the result is passed downstream as a concrete value.
- `loadOverlay()` never mutates any file — it is a pure read operation.
- All domain values returned by `resolveDomain()` are safe for filesystem path interpolation (validated against `/^[a-z0-9][a-z0-9-]*$/`).

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `manifest.yaml` is missing or unparseable | Return `"software"` with `source_level: "default"` (graceful fallback) | — |
| Charter frontmatter has `domain:` with empty value | Treat as no charter-level domain; continue to module/project/default | — |
| Module slug does not match any entry in `manifest.yaml` modules list | Skip module-level resolution; continue to project/default | — |
| Domain value contains path separators, `..`, or invalid characters | Throw with descriptive message citing the invalid value and source level | INVALID_DOMAIN_NAME |
| `loadOverlay()` called with unknown overlay type | Return `null` immediately — no filesystem path is constructed | — |
| Resolved file path escapes its root directory (repoRoot or pluginRoot) | Throw with the offending path (project-relative) and root | PATH_ESCAPE |
| Overlay file exists but is empty | Return empty string (markdown) or empty object (structured) | — |
| Overlay file exists but is malformed YAML (structured type) | Throw with project-relative file path and line number only — raw parser error content is not included to prevent leaking file contents | OVERLAY_PARSE_ERROR |
| Overlay file exceeds 512 KB | Throw with project-relative file path and size | OVERLAY_TOO_LARGE |
| Domain directory exists but contains no overlay files for the requested type | Return `null` for that type (partial overlays are valid per charter invariant at the directory level, but each individual file is all-or-nothing) | — |

## System Constitution Reference

- **"Minimize external dependencies"** — `resolveDomain()` and `loadOverlay()` use only `fs` and `path` from Node.js built-ins. The YAML parsing for structured overlays reuses the existing line-based parser pattern.
- **"Skills are primarily markdown"** — Domain profiles are overlay files (markdown and YAML), not executable code. The resolution functions are companion code that skills call but don't require.
- **"Pure ESM"** — `lib/domains/resolve.mjs` and `lib/domains/overlay.mjs` follow ESM conventions.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Implement `resolveDomain()` | Pure function: read charter frontmatter → module manifest → project manifest → default. Validate domain name pattern. Return `{ resolved_domain, source_level }` | small |
| Implement `loadOverlay()` | File reader with two-level path precedence, type-to-filename mapping, size guard. Return string for markdown, parsed object for structured types, null for missing | small |
| Define overlay type constants | Enumerate valid overlay types and filename mappings: `charter-overlay` → `charter-overlay.md`, etc. | small |
| Add domain name validation | Validate domain values against `/^[a-z0-9][a-z0-9-]*$/` with INVALID_DOMAIN_NAME error | small |
| Add manifest schema support | Extend manifest parsing to recognize `project.domain` and `modules[].domain` fields | small |
| Write unit tests | Test all 4 resolution levels, precedence, fallback, two-level overlay loading, null returns, parse errors, domain name validation, size guard | medium |

## Acceptance Criteria

- [ ] `resolveDomain()` correctly resolves all 4 precedence levels (charter > module > project > default)
- [ ] `resolveDomain()` is deterministic — same inputs always produce same output
- [ ] `resolveDomain()` validates domain values against `/^[a-z0-9][a-z0-9-]*$/` and rejects invalid values with INVALID_DOMAIN_NAME
- [ ] Domain values containing path separators or `..` are rejected (path traversal prevention)
- [ ] `domain: software` behaves identically to no domain declaration
- [ ] `loadOverlay()` validates overlay type against the closed constant set before constructing any filesystem path
- [ ] `loadOverlay()` resolves `repoRoot` and `pluginRoot` to real paths and asserts candidate paths stay within their root (PATH_ESCAPE on violation)
- [ ] `loadOverlay()` maps overlay type constants to filenames per the type-to-filename table
- [ ] `loadOverlay()` checks project-local path before bundled path
- [ ] `loadOverlay()` returns `null` when no overlay file exists
- [ ] `loadOverlay()` returns string for markdown overlays, parsed object for structured overlays
- [ ] `loadOverlay()` rejects overlay files exceeding 512 KB with OVERLAY_TOO_LARGE; size check uses `fs.stat` on the resolved real path
- [ ] `loadOverlay()` performs YAML syntax validation only — semantic schema validation is deferred to consuming skills
- [ ] `OVERLAY_PARSE_ERROR` messages include only project-relative file path and line number, not raw parser output
- [ ] Error messages use project-relative file paths, not absolute paths
- [ ] Custom domain directories are discovered without code changes
- [ ] Resolution adds at most 2 file reads per invocation (calls made by `resolveDomain()` itself to manifest.yaml; charter frontmatter is a pre-parsed input parameter)
- [ ] Each `loadOverlay()` call adds at most 2 file reads (project-local then bundled, short-circuiting on first hit). A skill loading all 5 overlay types makes at most 10 file reads total across 5 `loadOverlay()` calls
- [ ] Projects without any `domain` field behave identically to today (backward compatibility)
- [ ] All quality gates pass (tests, lint)
- [ ] No constitutional violations introduced
