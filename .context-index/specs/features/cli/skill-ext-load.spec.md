<!-- partial_schema: spec@1 -->

---
charter: cli
kind: behavioral
status: validated
risk_level: low
revision: 2
charter-revision: 4
created: 2026-05-25
updated: 2026-05-26
source-manifest:
  sha: "a3d8c5f"
  files:
    - .gitignore
    - cli/index.mjs
    - lib/cli/skill-ext.mjs
    - skills/implement/SKILL.md
    - templates/skill-extensions/.gitkeep
    - tests/cli/skill-ext.test.mjs
  computed-at: "2026-07-03T22:27:11.346Z"
---

# Live Spec: `adev skill-ext load` — Skill Extension Verb

## Behavioral Contract

Projects and installed domain extension packs need a way to append custom instructions to specific adev skills without modifying the plugin itself. This spec defines `adev skill-ext load --skill <name>`, a CLI verb that reads skill extension content from two layers under `.context-index/skill-extensions/` and writes the concatenated result to stdout:

- **Extension layers** (installed by `adev extension install`): `.context-index/skill-extensions/_<ext-name>/<skill>.md` — one directory per installed extension that declared `provides.skill_extensions`. Read in lexicographic order by extension name.
- **Project layer** (hand-authored): `.context-index/skill-extensions/<skill>.md` — project-specific additions appended last.

If no content is found in any layer the verb outputs the sentinel `__NONE__` and exits 0. Skills call this verb at their Load Context step and treat any non-`__NONE__` output as additional standing instructions for that skill's entire execution. The mechanism is strictly append-only: extension content cannot replace or remove skill sections.

**Cross-charter dependency:** the install-side of this feature — the `provides.skill_extensions` key in `adev-extension.yaml` and the `installSkillExtensions()` function in `lib/extensions/content-install.mjs` — is out of scope here. A companion spec is required in the `extensions` charter before the extension-layer path can be exercised end-to-end. The verb is fully functional for the project layer alone; the `_<ext-name>/` path degrades gracefully to empty when no extensions are installed.

## System Constitution Reference

- **Principle 1 — Minimize external dependencies:** `lib/cli/skill-ext.mjs` uses only `node:fs` and `node:path`. No new packages.
- **Principle 2 — Skills are primarily markdown:** Extension files are plain markdown, never executable. The verb reads and echoes them; no code runs from extension content.
- **Principle 3 — Pure ESM:** The verb module is `.mjs` with `import` syntax, registered in the `cli/index.mjs` verb map.
- **Principle 4 — Hook protocol compliance:** The verb exits 0 for all "no content" cases (`__NONE__`) so skill degradation is always non-blocking. It exits 1 only for argument or I/O errors the caller must surface.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|----------------------|
| Create `lib/cli/skill-ext.mjs` | Implement `run()` + `help()`. Reads `_*/` extension layers (sorted) then project-level file, concatenates non-empty content, outputs result or `__NONE__`. Path-containment check on skill name. | small |
| Register verb in `cli/index.mjs` | Add `['skill-ext', () => import('../lib/cli/skill-ext.mjs')]` to the verb Map. | small |
| Add `tests/cli/skill-ext.test.mjs` | Cover: project file only, extension layer only, both layers, neither, empty files, path traversal name, missing `--skill`, missing `.context-index/`. | small |
| Scaffold extension directory template | Add `.context-index/skill-extensions/.gitkeep` to `templates/context-index/` so `/adev:init` creates the directory. Add `_extensions/` to `.gitignore` (extension-managed, not hand-authored). | small |
| Update `/adev:implement` SKILL.md | Add a "Load Skill Extensions" sub-step in Step 1 (Load Context) that calls `adev skill-ext load --skill implement` and incorporates non-`__NONE__` output as additional standing instructions. | small |
| File companion spec in `extensions` charter | Spec the install-side: `provides.skill_extensions` in `adev-extension.yaml`, `installSkillExtensions()` in `content-install.mjs`, path convention `_<ext-name>/<skill>.md`. Out of scope here — tracked separately. | — |

## Preconditions

- `cli/index.mjs` verb dispatch table is available (driver substrate from `cli-driver-surface` is in place).
- The project has a `.context-index/` directory (standard adev project structure).
- `--skill <name>` is provided and `<name>` matches `[a-zA-Z0-9_-]+` (no slashes, dots, or path separators).

## Behaviors

- **When** `adev skill-ext load --skill implement` is called and only the project-level file `.context-index/skill-extensions/implement.md` exists and is non-empty, **then** its content is written to stdout and the verb exits 0.
- **When** `adev skill-ext load --skill implement` is called and only extension-layer files `.context-index/skill-extensions/_<ext>/implement.md` exist (none empty), **then** their contents are concatenated in lexicographic order by extension name and written to stdout, exiting 0.
- **When** `adev skill-ext load --skill implement` is called and both extension layers and a project-level file are present and non-empty, **then** extension-layer content (sorted) is written first, followed by a blank-line separator, followed by the project-level content, and the verb exits 0.
- **When** no files exist in any layer (no `_*/implement.md` and no `implement.md`), **then** `__NONE__` is written to stdout and the verb exits 0.
- **When** all present files are empty, **then** `__NONE__` is written to stdout and the verb exits 0.
- **When** `--skill` is omitted entirely, **then** a usage error is written to stderr and the verb exits 1.
- **When** the skill name contains path-traversal characters (e.g., `../`, `/`, `\`), **then** `INVALID_SKILL_NAME` is written to stderr and the verb exits 1 without reading any file.
- **When** `.context-index/` is not found at the resolved project root, **then** `NO_CONTEXT_INDEX` is written to stderr and the verb exits 1.
- **When** any extension-layer or project-layer file exists but cannot be read due to permissions, **then** `READ_ERROR` is written to stderr and the verb exits 1.
- **When** a skill reads non-`__NONE__` output from this verb, **then** it incorporates the content as additional standing instructions that apply to its entire execution — framed as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."*

## Postconditions

- Stdout contains either concatenated extension content or exactly the string `__NONE__`.
- No extension or project files are modified by the verb.
- No files are created or deleted by the verb.
- Exit code is 0 when output is valid content or `__NONE__`; 1 only on argument or I/O errors.

## Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `--skill` argument missing | Write usage to stderr, exit 1 | `MISSING_SKILL_ARG` |
| Skill name contains `..`, `/`, or `\` | Write error to stderr, exit 1, no file access | `INVALID_SKILL_NAME` |
| `.context-index/` not found at project root | Write error to stderr, exit 1 | `NO_CONTEXT_INDEX` |
| Any layer file present but unreadable (permissions) | Write error to stderr, exit 1 | `READ_ERROR` |
| No files in any layer | Write `__NONE__` to stdout, exit 0 | — |
| All present files are empty | Write `__NONE__` to stdout, exit 0 | — |

## Acceptance Criteria

- [ ] `adev skill-ext load --skill implement` with only a project-level file → file content on stdout, exit 0.
- [ ] `adev skill-ext load --skill implement` with only a `_web-dev/implement.md` extension layer → layer content on stdout, exit 0.
- [ ] `adev skill-ext load --skill implement` with both `_web-dev/implement.md` and project-level `implement.md` → layer content first, blank line, project content, exit 0.
- [ ] Multiple extension layers (`_aaa/`, `_zzz/`) → concatenated in lexicographic order (aaa first), exit 0.
- [ ] No files in any layer → exactly `__NONE__` on stdout, exit 0.
- [ ] All present files are empty → exactly `__NONE__` on stdout, exit 0.
- [ ] `adev skill-ext load --skill ../etc/passwd` → stderr contains `INVALID_SKILL_NAME`, exit 1, no file access.
- [ ] `adev skill-ext load` (no `--skill`) → stderr contains usage, exit 1.
- [ ] `adev skill-ext load --skill foo` when `.context-index/` does not exist → `NO_CONTEXT_INDEX`, exit 1.
- [ ] `adev skill-ext load --help` → prints help text, exit 0.
- [ ] No new `package.json` dependencies introduced.
- [ ] All existing tests continue to pass.
- [ ] `/adev:implement` SKILL.md contains an `adev skill-ext load --skill implement` call in its Load Context step with a prose instruction to incorporate non-`__NONE__` output.
- [ ] `.gitignore` includes `.context-index/skill-extensions/_*/` (extension-managed, not committed).
