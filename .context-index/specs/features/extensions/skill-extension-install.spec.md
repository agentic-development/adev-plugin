<!-- partial_schema: spec@1 -->

---
charter: extensions
kind: behavioral
status: validated
risk_level: low
revision: 1
charter-revision: 4
created: 2026-05-25
updated: 2026-05-26
source-manifest:
  sha: "eb3728c"
  files:
    - docs/extensions.md
    - lib/extensions/content-install.mjs
    - lib/extensions/install.mjs
    - templates/adev-extension.example.yaml
    - tests/extensions/skill-extension-install.test.mjs
  computed-at: "2026-05-26T00:52:25.468Z"
---

# Live Spec: `provides.skill_extensions` — Domain Extension Skill Injection

## Behavioral Contract

Installed domain extension packs can ship skill extension files that append instructions to specific adev skills. This spec defines the install-side of the skill extension mechanism: the `provides.skill_extensions` key in `adev-extension.yaml`, how `adev extension install` copies those files into the project, and the path convention that `adev skill-ext load` (defined in `cli/skill-ext-load.spec.md`) reads at skill invocation time.

At install time, `adev extension install` reads each entry in `provides.skill_extensions` (a map of skill name → source file path within the extension), validates names, and copies the files to `.context-index/skill-extensions/_<ext-name>/<skill>.md`. The `_` prefix and namespaced directory signal that these files are extension-managed — not hand-authored by the project. The project-level file `.context-index/skill-extensions/<skill>.md` is unaffected. On re-install the extension files are overwritten (idempotent).

**Dependency:** `cli/skill-ext-load.spec.md` defines how these installed files are consumed at skill invocation time. That spec is a prerequisite for this one to be exercised end-to-end.

## System Constitution Reference

- **Principle 1 — Minimize external dependencies:** `installSkillExtensions()` uses only `node:fs` and `node:path`. No new packages.
- **Principle 2 — Skills are primarily markdown:** Extension files must be `.md`. The installer validates the extension and rejects non-markdown content.
- **Principle 3 — Pure ESM:** New function added to the existing `lib/extensions/content-install.mjs` module.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|----------------------|
| Add `provides.skill_extensions` to manifest schema | Update `lib/extensions/manifest-schema.mjs` to recognize and pass through a `provides.skill_extensions` map (skill name → source path). Skill names validated against `[a-zA-Z0-9_-]+`. Source paths validated for containment within extension root. | small |
| Add `installSkillExtensions()` to `content-install.mjs` | Reads `provides.skill_extensions`, validates each entry, copies source file to `.context-index/skill-extensions/_<ext-name>/<skill>.md`. Creates `_<ext-name>/` directory. Overwrites on re-install. | small |
| Wire into `install.mjs` orchestrator | Call `installSkillExtensions()` in the install sequence after other content types. Add result to install report. | small |
| Add `tests/extensions/skill-extension-install.test.mjs` | Cover: single skill extension, multiple skills, re-install overwrite, path traversal in source path, invalid skill name, missing source file. | small |
| Update `templates/adev-extension.example.yaml` | Add a commented-out `provides.skill_extensions` example showing the skill name → source path format. | small |
| Update `docs/extensions.md` authoring guide | Document `provides.skill_extensions` syntax, the `_<ext-name>/` path convention, and how it interacts with project-level `skill-extensions/<skill>.md`. | small |

## Preconditions

- The extension manifest (`adev-extension.yaml`) is valid and passes schema validation.
- `provides.skill_extensions` is present and is a map (skill name → relative source path within the extension).
- Each skill name matches `[a-zA-Z0-9_-]+`.
- Each source path resolves within the extension root directory (no path traversal).
- `.context-index/skill-extensions/` exists or can be created.

## Behaviors

- **When** `installExtension()` processes an extension with `provides.skill_extensions: { implement: "skills/implement.md" }` **then** the file is copied to `.context-index/skill-extensions/_<ext-name>/implement.md` and the install report lists it as a file written.
- **When** `provides.skill_extensions` maps multiple skill names **then** each is copied to its respective `_<ext-name>/<skill>.md` path; all are listed in the install report.
- **When** `installExtension()` is called again for an already-installed extension **then** the `_<ext-name>/` files are overwritten with the new content (idempotent).
- **When** a skill name in `provides.skill_extensions` contains path-traversal characters or fails `[a-zA-Z0-9_-]+` **then** installation fails with `INVALID_SKILL_NAME` before any files are written.
- **When** a source path in `provides.skill_extensions` resolves outside the extension root **then** installation fails with `PATH_TRAVERSAL` before any files are written.
- **When** a declared source file does not exist within the extension **then** installation fails with `MISSING_SKILL_EXT_FILE`.
- **When** `provides.skill_extensions` is absent or empty **then** the installer skips this step silently; no `_<ext-name>/` directory is created.
- **When** the project-level file `.context-index/skill-extensions/<skill>.md` already exists **then** it is never touched by `installSkillExtensions()` — the project layer is always preserved.

## Postconditions

- Each declared skill extension file exists at `.context-index/skill-extensions/_<ext-name>/<skill>.md`.
- The project-level file `.context-index/skill-extensions/<skill>.md` is unchanged.
- The install report includes each file written under `filesWritten`.
- The `installed_extensions` stamp in `manifest.yaml` records the extension (handled by the existing install orchestrator).

## Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Skill name fails `[a-zA-Z0-9_-]+` | Fail install before any writes | `INVALID_SKILL_NAME` |
| Source path escapes extension root | Fail install before any writes | `PATH_TRAVERSAL` |
| Declared source file missing from extension | Fail install before any writes | `MISSING_SKILL_EXT_FILE` |
| `_<ext-name>/` directory cannot be created | Fail install, report I/O error | `INSTALL_IO_ERROR` |

## Acceptance Criteria

- [ ] Installing an extension with `provides.skill_extensions: { implement: "skills/implement.md" }` creates `.context-index/skill-extensions/_<ext-name>/implement.md` with the correct content.
- [ ] Multiple skill entries each produce their respective `_<ext-name>/<skill>.md` files.
- [ ] Re-installing the same extension overwrites the `_<ext-name>/` files (idempotent).
- [ ] Project-level `.context-index/skill-extensions/implement.md` is untouched by installation.
- [ ] A skill name with `/` in it → `INVALID_SKILL_NAME`, no files written.
- [ ] A source path of `../../etc/passwd` → `PATH_TRAVERSAL`, no files written.
- [ ] A declared source file that doesn't exist in the extension → `MISSING_SKILL_EXT_FILE`, no files written.
- [ ] `provides.skill_extensions` absent → install completes normally, no `_<ext-name>/` directory created.
- [ ] `adev-extension.example.yaml` template includes a commented `provides.skill_extensions` example.
- [ ] `docs/extensions.md` documents the `provides.skill_extensions` key and the `_<ext-name>/` path convention.
- [ ] All existing extension tests continue to pass.
- [ ] No new `package.json` dependencies introduced.
