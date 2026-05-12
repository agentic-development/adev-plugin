# Live Spec: CLI and Registration

---
charter: extensions
status: validated
risk_level: low
milestone:
revision: 2
charter-revision: 2
created: 2026-05-10
updated: 2026-05-11
source-manifest:
  sha: "3b88ae3"
  files:
    - cli/index.mjs
    - lib/extensions/register.mjs
    - tests/cli-extension.test.mjs
    - tests/lib/extensions/register.test.mjs
  computed-at: "2026-05-11T16:09:28.533Z"
drift_detected: true
drift_source: cli/index.mjs
drift_at: 2026-05-12T03:02:09.256Z
---

## Behavioral Contract

### Preconditions

- `.context-index/` exists with `manifest.yaml`
- At least one provider is active (claude-code, codex, or opencode) with a hooks.json file or writable directory
- For `extension install`: a valid source URI is provided (local path, npm package, or git URL)

### Behaviors

1. **When** `installExtension()` encounters `provides.skills` entries (after conflict detection passes) **then** it copies each skill's `SKILL.md` to `skills/<extension-name>-<skill-name>/SKILL.md` (relative to the plugin root), verifying that the resolved destination path falls within the plugin's `skills/` directory. It then adds a skill entry to the active provider's hooks.json `skills` array with `name` (skill name), `description` (from extension manifest), and `path` pointing to the installed `SKILL.md` file location.

2. **When** `installExtension()` encounters `provides.hooks` entries **then** it copies each hook script to `hooks/<extension-name>-<hook-event>.sh` (relative to the plugin root), verifying that (a) the source path falls within the extension's resolved source directory and (b) the resolved destination path falls within the plugin's `hooks/` directory. If either path escapes its intended directory, the install fails with a `PATH_TRAVERSAL` error. It then adds a hook entry to the active provider's hooks.json `hooks` array with `event` (the hook event name) and `command` (absolute path to the installed hook script).

3. **When** a skill or hook entry with the same `name`/`event` already exists in hooks.json (from a previous install of the same extension) **then** the existing entry is updated in place rather than duplicated (idempotent registration).

4. **When** the provider's hooks.json file does not exist **then** `installExtension()` creates it with the correct base structure (`{ "hooks": {}, "skills": [] }`) before adding entries. The `hooks` field is an object keyed by event name (matching the Claude Code hooks.json format), not an array.

5. **When** multiple providers are active **then** `installExtension()` registers skills and hooks in all detected provider hooks.json files so the extension works regardless of which provider the user invokes.

6. **When** `npx adev-cli extension install <source>` is invoked **then** the CLI resolves the source via `resolveExtensionSource(uri)`, runs `installExtension(resolvedPath, projectRoot)`, and displays the install report showing files written, merges applied, and any warnings.

7. **When** `npx adev-cli extension list` is invoked **then** it reads `installed_extensions` from `manifest.yaml` and displays a table with columns: Name, Version, Installed Date, Source.

8. **When** `extension list` is invoked and `installed_extensions` is empty or absent in `manifest.yaml` **then** it displays a message indicating no extensions are installed.

9. **When** provider detection runs **then** it checks for known provider directories and config files (`.claude/`, `.codex/`, `.opencode/`) to determine which providers are active in the project.

### Postconditions

- After skill registration, the provider hooks.json contains exactly one entry per extension skill (no duplicates across re-installs).
- After hook registration, the provider hooks.json contains exactly one entry per extension hook (no duplicates across re-installs).
- `extension list` output is always consistent with the current state of `manifest.yaml`.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| No provider detected | Warn user that no provider hooks.json was found; skills and hooks will not be registered, but other content (domains, governance, samples) still installs | WARN_NO_PROVIDER |
| hooks.json does not exist | Auto-create with base structure | N/A (auto-create) |
| Invalid source URI (not local, npm, or git) | Propagated from `resolveExtensionSource()` with usage guidance | SOURCE_RESOLUTION |
| Hook or skill source/dest path escapes intended directory | Block install, list offending path | PATH_TRAVERSAL |
| `manifest.yaml` not found for `extension list` | Tell user to run `/adev:init` first | PREREQ |

## System Constitution Reference

- **"Hook protocol compliance"** -- hook entries registered in hooks.json follow the existing protocol: event name and command path. No changes to the hook stdin/stdout JSON contract.
- **"Version parity"** -- `extension list` reads version from `manifest.yaml` stamps, which are written during install from the extension's own `adev-extension.yaml` version field.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Skill registration | Add skill entries to provider hooks.json `skills` array, idempotent | medium |
| Hook registration | Add hook entries to provider hooks.json `hooks` array, idempotent | medium |
| Provider detection | Detect active providers (claude-code, codex, opencode) by checking config directories | small |
| hooks.json auto-create | Create hooks.json with base structure if it does not exist | small |
| CLI install command | Wire `extension install <source>` into cli/index.mjs, call resolve + install + display report | medium |
| CLI list command | Wire `extension list` into cli/index.mjs, read manifest stamps, format table | small |
| Multi-provider registration | Register skills/hooks in all detected provider hooks.json files | small |

## Acceptance Criteria

- [ ] Extension skill SKILL.md files are copied to `skills/<extension-name>-<skill-name>/SKILL.md`
- [ ] Extension hook scripts are copied to `hooks/<extension-name>-<hook-event>.sh`
- [ ] All copied file paths are verified to fall within their intended directories (path containment)
- [ ] Path traversal attempts in skill or hook source/dest paths fail with `PATH_TRAVERSAL`
- [ ] Extension skills are registered in provider hooks.json with name, description, and path
- [ ] Extension hooks are registered in provider hooks.json with event and command pointing to installed copy
- [ ] Re-installing the same extension updates existing entries (no duplicates in hooks.json)
- [ ] Missing hooks.json is auto-created with correct base structure
- [ ] Provider detection finds claude-code, codex, and opencode directories
- [ ] Skills and hooks are registered in all active providers
- [ ] `extension install <source>` resolves, installs, and displays the install report
- [ ] `extension list` displays a table of installed extensions from manifest.yaml
- [ ] `extension list` with no installed extensions shows an informative message
- [ ] Absent provider produces a warning but does not block non-registration content
- [ ] All quality gates pass (tests, lint)
- [ ] No constitutional violations introduced
