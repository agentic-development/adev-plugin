---
charter: domain-extensions
kind: behavioral
status: validated
risk_level: low
milestone:
revision: 2
charter-revision: 4
created: 2026-05-20
updated: 2026-05-20
tracker-ref: issue-530
source-manifest:
  sha: "da43889"
  files:
    - cli/index.mjs
    - lib/cli/domain-extension-picker.mjs
    - lib/extensions/picker-errors.mjs
    - skills/init/SKILL.md
    - templates/extensions-catalog.json
    - templates/manifest-template.yaml
    - tests/cli/init-extension-picker.test.mjs
    - tests/lib/cli/domain-extension-picker.test.mjs
    - tests/skills/init-picker-doc.test.mjs
  computed-at: "2026-05-20T17:34:35.328Z"
drift_detected: true
---

# Live Spec: Init-Time Domain Extension Picker

<!-- Live Spec within the domain-extensions charter.
     Surfaces installed domain extensions to the user during `adev init` and
     `adev upgrade`, closing the discoverability gap reported in issue-530.
     Parent Charter: .context-index/specs/features/domain-extensions/charter.md
     Capability: "Init-Time Domain Extension Picker" (Capability Map, v2). -->

## Behavioral Contract

### Preconditions

- `cli/index.mjs` is the entry point for both `init` and `upgrade` flows.
- The extension install pipeline (`lib/extensions/install.mjs::installExtension`) is functional and tested.
- The extension manifest schema (`lib/extensions/manifest-schema.mjs`) accepts `provides.domain-profile` with `extends: software`.
- At least one first-party domain extension exists in the monorepo (currently `extensions/data-engineering/`, `extensions/process-automation/`).
- `manifest.yaml` exists or is being created by `init` in this same flow.
- **v1 catalog scope:** catalog entries in v1 MUST resolve to local paths under the plugin root. Network sources (git URL, npm) are deferred until a separate spec adds catalog signing / integrity verification. (Addresses SEC-3.)
- **Workspace-mode constraint:** the picker writes only to the **current repo's** `manifest.yaml` and `.context-index/domains/`. It never writes to a sibling repo's context-index. When `init` or `upgrade` runs at the workspace root (no current repo slug from `detectWorkspace()`), the picker is skipped silently. When running inside a registered repo, write paths pass `assertPathInWorkspace()` (per ADR-0005, Workspace Isolation Invariant). (Addresses SA-2.)

### Behaviors

1. **When** the user runs `adev init` on a project that has no installed domain extensions stamped in `manifest.yaml`, **then** `init` loads the bundled first-party catalog from `templates/extensions-catalog.json` (shipped with the plugin) and presents a single picker prompt: `software (bundled, default)`, plus one entry per catalog row whose resolved source path exists on disk under the plugin root (initially `data-engineering` and `process-automation`), plus an explicit `skip` option.

2. **When** the user selects a non-`software` entry from the picker, **then** `init` invokes `installExtension(<resolved-path>, projectRoot, opts)` against the entry's resolved source and, on success, writes `domain: <name>` into the project's `manifest.yaml`.

3. **When** the user selects `software` or `skip`, **then** `init` writes `domain: software` into `manifest.yaml` and does not invoke `installExtension()`. The two choices are semantically equivalent at this layer; the picker offers both so the UX expresses user intent.

4. **When** the user runs `adev upgrade` and the project's `manifest.yaml` contains no `installed_extensions` entry of kind `domain-profile`, **then** `upgrade` presents the same picker as `init` (same catalog, same options).

5. **When** the user runs `adev init` or `adev upgrade` on a project that already has a `domain-profile` extension installed (a matching `installed_extensions` stamp in `manifest.yaml`), **then** the picker step is skipped, the existing top-level `domain:` value in `manifest.yaml` is preserved unchanged (no write), and the install-summary line prints `Domain: <installed-name>` to confirm the existing state.

6. **When** the picker step completes (whether the extension was installed in this run, skipped, or already-installed), **then** the install-completion banner prints exactly `Domain: <name>` (single canonical format, no variant). The same banner string appears in both `init` and `upgrade` flows and in `skills/init/SKILL.md`.

7. **When** `installExtension()` fails during a picker-driven install (network error, bundled-collision, manifest-validation error, source-not-found), **then** `init` surfaces the failure with its specific error code, passes any source URI through `stripCredentials()` (per `lib/extensions/install.mjs::writeManifestStamp` precedent) before printing, does not write any `domain:` value to `manifest.yaml`, and does not leave a half-installed `.context-index/domains/<name>/` directory. Error messages and the install banner MUST NOT contain raw credentials.

8. **When** `skills/init/SKILL.md` is rendered to the user (the doc-surface for the init wizard), **then** it contains a section that walks the user through the picker prompt, the catalog options, and the consequences of each choice (including how to skip and re-run later via `adev extension install <source>`).

### Postconditions

- `manifest.yaml` carries an explicit `domain:` field (either `software` or the selected extension's name) after init completes.
- If a non-software extension was selected, `.context-index/domains/<name>/` exists with the extension's content and a stamped `installed_extensions[].kind == "domain-profile"` entry in `manifest.yaml`.
- The chosen domain is reported in the install-completion banner.
- No partial state exists on failure paths (atomic install via existing pipeline).
- Re-running `init` is a no-op for the picker step when a domain extension is already installed.

### Error Cases

**Code-naming convention:** codes already defined by the install pipeline (`lib/extensions/install.mjs`, `lib/extensions/resolve-source.mjs`) are reused verbatim — the picker layer does not invent parallel codes for conditions the pipeline already surfaces. Codes new to the picker layer are defined in a new `lib/cli/picker-errors.mjs` module and follow the `PICKER_*` prefix.

| Condition | Expected Behavior | Code | Source |
|-----------|-------------------|------|--------|
| Catalog source not found (e.g., `extensions/data-engineering/` missing) | Hide the entry from the picker; do not error | `PICKER_CATALOG_ENTRY_MISSING` (logged, advisory) | picker (new) |
| `installExtension()` throws `BUNDLED_COLLISION` | Surface error code, do not write `domain:`, prompt re-pick. **Note:** unreachable for the v1 first-party catalog because `BUNDLED_DOMAIN_NAMES` contains only `"software"` after the Bundled Templates Cleanup; retained for forward-compatibility with future catalog entries and third-party sources. (Addresses CON-2.) | `BUNDLED_COLLISION` | pipeline (reused) |
| `installExtension()` throws on malformed `adev-extension.yaml` | Surface error code, do not write `domain:`, prompt re-pick | `INVALID_SCHEMA` | pipeline (reused) |
| Source resolution fails (path missing, git clone fails, network unreachable) | Surface error, do not write `domain:`, prompt re-pick | `SOURCE_RESOLUTION` | pipeline (reused) |
| User cancels (Ctrl+C) at picker | Exit init cleanly; no partial manifest write | `PICKER_USER_ABORTED` | picker (new) |
| `manifest.yaml` write fails after successful install | Roll back the install directory; surface error | `PICKER_MANIFEST_WRITE_FAILED` | picker (new) |
| Bundled catalog file (`templates/extensions-catalog.json`) missing or malformed | Surface error, abort the picker step, fall through to `software` default with a one-line note; do not crash init | `PICKER_CATALOG_PARSE_FAILED` | picker (new) |

## Catalog Contract

The first-party catalog is a static JSON file shipped with the plugin at `templates/extensions-catalog.json`. There is one canonical source; no in-source constant fallback.

**Schema (v1):**

```json
{
  "version": 1,
  "entries": [
    {
      "name": "data-engineering",
      "label": "Data Engineering",
      "description": "Pipelines, ETL, dbt, data quality workflows",
      "path": "extensions/data-engineering"
    }
  ]
}
```

**Validation rules (enforced at picker load time, per SEC-1):**

- `name` MUST match `^[a-z][a-z0-9-]*$` (same regex `parseExtensionManifest()` enforces).
- `path` MUST be relative; resolved via `path.resolve(pluginRoot, entry.path)` and the resolved path MUST start with the plugin-root prefix (no traversal escape). Mirrors the existing path-traversal guard in `lib/extensions/resolve-source.mjs::resolveGit`.
- `label` and `description` are plain strings (no embedded URLs in v1; URL fields are deferred with the network-source spec).
- Entries failing validation are dropped from the picker with a `PICKER_CATALOG_ENTRY_MISSING`-style advisory log; they do not abort init.

**Stamp-trust note (per SEC-4):** the project's existing `installed_extensions` stamp in `manifest.yaml` is treated as authoritative by the picker — no re-verification of installed content is performed during the picker's skip-on-existing check. This is consistent with the local-CLI threat model (the user owns their `manifest.yaml`).

## System Constitution Reference

- **Principle 1 (Minimize external dependencies):** This spec adds no new runtime dependencies. The picker calls the existing `installExtension()` pipeline and the existing manifest-stamping flow. The catalog is a static JSON file (`templates/extensions-catalog.json`); no runtime fetching, no new install machinery.
- **Principle 3 (Pure ESM):** All changes land in `cli/index.mjs` (ESM) and a new `lib/cli/domain-extension-picker.mjs` (ESM). No new CommonJS, no new file types.
- **Charter invariant — "Content-only extensions, no executable code":** Unchanged. The catalog references the same `extensions/<name>/` directories that already exist; no new executable surface is introduced inside extension packages.
- **Coding standard — "CLI logic in `cli/index.mjs`, helpers in `lib/cli/`":** Honored. The picker dispatch is wired into `cmdInit()` and `cmdUpgrade()`; the picker helper body lives in `lib/cli/domain-extension-picker.mjs` (consistent with the `cli-driver-surface` charter convention).
- **ADR-0005 (Workspace Isolation Invariant):** Honored. See the Workspace-mode constraint in Preconditions: write paths pass `assertPathInWorkspace()`; the picker is skipped silently at the workspace root.

## Module Impact Map

| Module | Impact | Changes Required |
|--------|--------|-----------------|
| `cli/index.mjs` | High | Add picker dispatch in `cmdInit()` and `cmdUpgrade()`. Print the `Domain: <name>` completion banner. |
| `lib/cli/domain-extension-picker.mjs` (new) | High | New helper module owning the picker prompt, catalog load + validation, and dispatch to `installExtension()`. Returns `{ choice, sourcePath \| null }`. |
| `lib/cli/picker-errors.mjs` (new) | Medium | Declare the new `PICKER_*` error codes used by the picker layer. |
| `templates/extensions-catalog.json` (new) | High | Canonical first-party catalog. Loaded by the picker helper at runtime. |
| `lib/extensions/install.mjs` | None | Consumed unchanged. The picker calls `installExtension()` with the same signature it already exposes. |
| `lib/extensions/manifest-schema.mjs` | None | Consumed unchanged. |
| `manifest.yaml` (project artifact) | Medium | Spec mandates that picker outcomes write a top-level `domain: <name>` key to the user's manifest. The shape is already supported by `loadManifest()`; see charter Domain Model note (next revision). |
| `skills/init/SKILL.md` | Medium | Add a picker-walkthrough section using the canonical `Domain: <name>` wording. |
| `templates/manifest-template.yaml` | Low | Expose the `domain:` key (commented placeholder) so users see it after init even when the picker was skipped. |
| Bundled `software` domain | None | Stays as the default and the bundled fallback. |

## Integration Points

1. **Picker ↔ `installExtension()`** — picker resolves the user's choice to a source path, calls `installExtension(path, projectRoot, opts)`. Same signature as today's CLI verb.
2. **Picker ↔ `manifest.yaml`** — picker writes the `domain:` key via existing manifest-write helpers; no new YAML emitter.
3. **`init` ↔ `upgrade`** — both call into the same picker helper (shared implementation, single source of truth for the catalog and prompt).
4. **`init` ↔ `skills/init/SKILL.md`** — the SKILL doc documents the same prompt the CLI presents; the two must stay in lockstep.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|----------------------|
| Define first-party catalog | Add `templates/extensions-catalog.json` listing `software`, `data-engineering`, `process-automation` with display label, description, and resolved-source path. Schema per the Catalog Contract section. | small |
| Picker helper | Implement `lib/cli/domain-extension-picker.mjs`: loads `templates/extensions-catalog.json`, validates entries per the Catalog Contract rules, presents the prompt, returns `{ choice, sourcePath \| null }`. | medium |
| Picker error codes | Implement `lib/cli/picker-errors.mjs` declaring the `PICKER_*` codes (CATALOG_ENTRY_MISSING, USER_ABORTED, MANIFEST_WRITE_FAILED, CATALOG_PARSE_FAILED). | small |
| Wire into `cmdInit()` | Call the picker after the providers step, before context-index scaffold. Skip if an existing `domain-profile` extension is stamped. | medium |
| Wire into `cmdUpgrade()` | Same picker, same skip condition. | small |
| Dispatch to `installExtension()` | On non-`software` choice, install and stamp; on failure, pass URIs through `stripCredentials()`, do not write `domain:`. | small (reuse) |
| Write `domain:` into manifest | Patch `manifest.yaml` with the chosen domain (idempotent). | small |
| Workspace-mode guard | In the picker helper, call `assertPathInWorkspace()` before writes; skip silently when invoked at the workspace root. | small |
| Update completion banner | Print exactly `Domain: <name>` (single canonical format) in the install summary. | small |
| Update `skills/init/SKILL.md` | Add picker-walkthrough section using `Domain: <name>` wording. | small |
| Integration test | `tests/cli/init-extension-picker.test.mjs` exercising each catalog path + error paths + workspace skip. | medium |
| Charter Domain Model note | Add a one-line note to the `domain-extensions` charter (next revision) documenting the top-level `domain:` key in project manifests. | small |

## Acceptance Criteria

- [ ] `npx @adev-org/adev-cli init` on a fresh project presents the domain extension picker exactly once.
- [ ] Selecting `data-engineering` populates `.context-index/domains/data-engineering/` and writes `domain: data-engineering` to `manifest.yaml`.
- [ ] Selecting `process-automation` populates `.context-index/domains/process-automation/` and writes `domain: process-automation`.
- [ ] Selecting `software` or `skip` writes `domain: software` and does not invoke `installExtension()`.
- [ ] Re-running `init` on a project that already has a domain-profile extension installed skips the picker silently and preserves the existing top-level `domain:` value.
- [ ] `npx @adev-org/adev-cli upgrade` on a project without a domain-profile extension offers the same picker.
- [ ] The install-completion banner prints exactly `Domain: <name>` (canonical wording) in both `init` and `upgrade`.
- [ ] Catalog entries whose resolved source path does not exist on disk are dropped from the picker with a `PICKER_CATALOG_ENTRY_MISSING` advisory and do not abort init.
- [ ] Catalog entries failing schema validation (name regex, traversal-escaped path) are dropped with an advisory and do not abort init.
- [ ] Error rendering in the picker passes any source URI through `stripCredentials()`; no raw credentials appear in error output or the completion banner.
- [ ] When invoked at the workspace root (no current repo slug), the picker is skipped silently; when invoked inside a registered repo, writes pass `assertPathInWorkspace()`.
- [ ] All existing extension-install tests continue to pass.
- [ ] New integration test `tests/cli/init-extension-picker.test.mjs` covers: each picker option (3 success paths + skip), at least one error path (`SOURCE_RESOLUTION` or `INVALID_SCHEMA`), the catalog-validation drop path, idempotency (re-run is a no-op), workspace-root skip, and `upgrade` parity with `init`.
- [ ] `skills/init/SKILL.md` documents the picker prompt and options using the canonical `Domain: <name>` wording.
- [ ] All quality gates pass (`npm test`).
- [ ] No constitutional violations.
- [ ] Charter revision 3 includes this capability in the Capability Map; the out-of-scope line for "Auto-install during `adev init`" is removed.
