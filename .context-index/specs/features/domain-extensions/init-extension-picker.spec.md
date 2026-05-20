# Live Spec: Init-Time Domain Extension Picker

<!-- Live Spec within the domain-extensions charter.
     Surfaces installed domain extensions to the user during `adev init` and
     `adev upgrade`, closing the discoverability gap reported in issue-530.
     Parent Charter: .context-index/specs/features/domain-extensions/charter.md
     Capability: "Init-Time Domain Extension Picker" (Capability Map, v2). -->

---
charter: domain-extensions
kind: behavioral
status: review-pending
risk_level: low
milestone: v2
revision: 1
charter-revision: 3
created: 2026-05-20
updated: 2026-05-20
tracker-ref: issue-530
---

## Behavioral Contract

### Preconditions

- `cli/index.mjs` is the entry point for both `init` and `upgrade` flows.
- The extension install pipeline (`lib/extensions/install.mjs::installExtension`) is functional and tested.
- The extension manifest schema (`lib/extensions/manifest-schema.mjs`) accepts `provides.domain-profile` with `extends: software`.
- At least one first-party domain extension exists in the monorepo (currently `extensions/data-engineering/`, `extensions/process-automation/`).
- `manifest.yaml` exists or is being created by `init` in this same flow.

### Behaviors

1. **When** the user runs `adev init` on a project that has no installed domain extensions stamped in `manifest.yaml`, **then** `init` presents a single picker prompt listing the first-party catalog: `software (bundled, default)`, plus one entry per installable extension discovered via the catalog source (initially `data-engineering` and `process-automation`), plus an explicit `skip` option.

2. **When** the user selects a non-`software` entry from the picker, **then** `init` invokes `installExtension(<resolved-path>, projectRoot, opts)` against the entry's resolved source and, on success, writes `domain: <name>` into the project's `manifest.yaml`.

3. **When** the user selects `software` or `skip`, **then** `init` writes `domain: software` into `manifest.yaml` and does not invoke `installExtension()`. The two choices are semantically equivalent at this layer; the picker offers both so the UX expresses user intent.

4. **When** the user runs `adev upgrade` and the project's `manifest.yaml` contains no `installed_extensions` entry of kind `domain-profile`, **then** `upgrade` presents the same picker as `init` (same catalog, same options).

5. **When** the user runs `adev init` or `adev upgrade` on a project that already has a `domain-profile` extension installed (a matching `installed_extensions` stamp in `manifest.yaml`), **then** the picker step is skipped and the install-summary line prints `Domain: <installed-name>` to confirm the existing state.

6. **When** the picker step completes (whether installed, skipped, or already-installed), **then** the install-completion banner names the active domain (e.g., `Domain extension: data-engineering` or `Domain: software`).

7. **When** `installExtension()` fails during a picker-driven install (network error, bundled-collision, manifest-validation error, source-not-found), **then** `init` surfaces the failure with its specific error code, does not write any `domain:` value to `manifest.yaml`, and does not leave a half-installed `.context-index/domains/<name>/` directory.

8. **When** `skills/init/SKILL.md` is rendered to the user (the doc-surface for the init wizard), **then** it contains a section that walks the user through the picker prompt, the catalog options, and the consequences of each choice (including how to skip and re-run later via `adev extension install <source>`).

### Postconditions

- `manifest.yaml` carries an explicit `domain:` field (either `software` or the selected extension's name) after init completes.
- If a non-software extension was selected, `.context-index/domains/<name>/` exists with the extension's content and a stamped `installed_extensions[].kind == "domain-profile"` entry in `manifest.yaml`.
- The chosen domain is reported in the install-completion banner.
- No partial state exists on failure paths (atomic install via existing pipeline).
- Re-running `init` is a no-op for the picker step when a domain extension is already installed.

### Error Cases

| Condition | Expected Behavior | Code |
|-----------|-------------------|------|
| Catalog source not found (e.g., `extensions/data-engineering/` missing) | Hide the entry from the picker; do not error | `CATALOG_ENTRY_MISSING` (logged, advisory) |
| `installExtension()` throws `BUNDLED_COLLISION` | Surface error code, do not write `domain:`, prompt re-pick | `BUNDLED_COLLISION` |
| `installExtension()` throws on malformed `adev-extension.yaml` | Surface error code, do not write `domain:`, prompt re-pick | `MANIFEST_VALIDATION_FAILED` |
| Network failure on git-URL source | Surface error, do not write `domain:`, prompt re-pick | `EXTENSION_SOURCE_UNREACHABLE` |
| User cancels (Ctrl+C) at picker | Exit init cleanly; no partial manifest write | `USER_ABORTED` |
| `manifest.yaml` write fails after successful install | Roll back the install directory; surface error | `MANIFEST_WRITE_FAILED` |
| Catalog file (if externalized) malformed | Fall back to the in-source catalog default; log advisory | `CATALOG_PARSE_FAILED` |

## Constitution Reference

- **Principle 1 (Minimize external dependencies):** This spec adds no new dependencies. The picker calls the existing `installExtension()` pipeline and the existing manifest-stamping flow. The catalog itself is a static data structure (`templates/extensions-catalog.json` or an in-source constant); no runtime fetching, no new install machinery.
- **Principle 3 (Pure ESM):** All changes land in `cli/index.mjs` (ESM) and the existing ESM lib modules. No new CommonJS, no new file types.
- **Charter invariant — "Content-only extensions, no executable code":** Unchanged. The catalog references the same `extensions/<name>/` directories that already exist; no new executable surface is introduced inside extension packages.
- **Coding standard — "CLI logic in `cli/index.mjs`":** Honored. The picker is wired into `cmdInit()` and `cmdUpgrade()` directly; no new CLI verb is added.

## Module Impact Map

| Module | Impact | Changes Required |
|--------|--------|-----------------|
| `cli/index.mjs` | High | Add picker prompt + dispatch logic in `cmdInit()` and `cmdUpgrade()`. Update install-completion banner. Remove the manual-batching note that this spec partially supersedes is out of scope here. |
| `templates/extensions-catalog.json` (new) | High | Declare the first-party catalog as static JSON; loaded by `cli/index.mjs` at picker time. |
| `lib/extensions/install.mjs` | None | Consumed unchanged. The picker calls `installExtension()` with the same signature it already exposes. |
| `lib/extensions/manifest-schema.mjs` | None | Consumed unchanged. |
| `manifest.yaml` (project artifact) | Medium | Spec mandates that picker outcomes write `domain: <name>` to user manifests. The shape of that key is already supported by `loadManifest()`. |
| `skills/init/SKILL.md` | Medium | Add picker walkthrough section. |
| `templates/manifest-template.yaml` | Low | Should expose the `domain:` key (commented placeholder) so users see it after init even when the picker was skipped. |
| Bundled `software` domain | None | Stays as the default and the bundled fallback. |

## Integration Points

1. **Picker ↔ `installExtension()`** — picker resolves the user's choice to a source path, calls `installExtension(path, projectRoot, opts)`. Same signature as today's CLI verb.
2. **Picker ↔ `manifest.yaml`** — picker writes the `domain:` key via existing manifest-write helpers; no new YAML emitter.
3. **`init` ↔ `upgrade`** — both call into the same picker helper (shared implementation, single source of truth for the catalog and prompt).
4. **`init` ↔ `skills/init/SKILL.md`** — the SKILL doc documents the same prompt the CLI presents; the two must stay in lockstep.

## Actionable Task Map

| Task | Description | Complexity |
|------|-------------|------------|
| Define first-party catalog | Add `templates/extensions-catalog.json` listing `software`, `data-engineering`, `process-automation` with display label, description, and resolved-source path. | S |
| Picker helper | Extract `runDomainExtensionPicker()` into a small helper in `lib/cli/` (or inline in `cli/index.mjs`) that loads the catalog, presents the prompt, and returns `{ choice, sourcePath \| null }`. | M |
| Wire into `cmdInit()` | Call the picker after the providers step, before context-index scaffold. Skip if an existing `domain-profile` extension is stamped. | M |
| Wire into `cmdUpgrade()` | Same picker, same skip condition. | S |
| Dispatch to `installExtension()` | On non-`software` choice, install and stamp; on failure, do not write `domain:`. | S (reuse) |
| Write `domain:` into manifest | Patch `manifest.yaml` with the chosen domain (idempotent). | S |
| Update completion banner | Print `Domain: <name>` (or `Domain extension: <name>`) in the install summary. | S |
| Update `skills/init/SKILL.md` | Add picker walkthrough section. | S |
| Integration test | `tests/cli/init-extension-picker.test.mjs` exercising each catalog path + error paths. | M |
| Charter revision bump | Update `domain-extensions/charter.md` to add this capability to the Capability Map and remove the matching out-of-scope line. Revision 2 → 3. | S |

## Acceptance Criteria

- `npx @adev-org/adev-cli init` on a fresh project presents the domain extension picker exactly once.
- Selecting `data-engineering` populates `.context-index/domains/data-engineering/` and writes `domain: data-engineering` to `manifest.yaml`.
- Selecting `process-automation` populates `.context-index/domains/process-automation/` and writes `domain: process-automation`.
- Selecting `software` or `skip` writes `domain: software` and does not invoke `installExtension()`.
- Re-running `init` on a project that already has a domain-profile extension installed skips the picker silently.
- `npx @adev-org/adev-cli upgrade` on a project without a domain-profile extension offers the same picker.
- The install-completion banner names the active domain.
- All existing extension-install tests continue to pass.
- New integration test `tests/cli/init-extension-picker.test.mjs` covers: each picker option (3 success paths + skip), at least one error path (`BUNDLED_COLLISION` or `EXTENSION_SOURCE_UNREACHABLE`), idempotency (re-run is a no-op), and `upgrade` parity with `init`.
- `skills/init/SKILL.md` documents the picker prompt and options.
- All quality gates pass (`npm test`).
- No constitutional violations.
- Charter revision bumped to 3 with this capability listed; the out-of-scope line for "Auto-install during `adev init`" is removed.
