# Live Spec: Persona Resolution and Injection

---
charter: output-personas
status: review-pending
risk_level: medium
milestone:
revision: 1
charter-revision: 2
created: 2026-04-21
updated: 2026-04-21
---

## Behavioral Contract

### Preconditions

- The plugin is installed and `session-start.sh` runs on every Claude Code session start
- `templates/personas/` directory exists with at least `developer.md`
- `user-config` files use flat `key=value` format (one pair per line, `#` comments, blank lines ignored)

### Behaviors

1. **When** the session-start hook runs and no `user-config` file exists (neither local nor global) and no `--persona` flag was passed **then** the persona resolves to `developer` and the `developer.md` directive is injected into the session context.

2. **When** a global `user-config` file exists at `<PLUGIN_ROOT>/user-config` with `persona=architect` **then** the persona resolves to `architect` and the `architect.md` directive is injected.

3. **When** both a global `user-config` (with `persona=architect`) and a local `.context-index/user-config` (with `persona=product`) exist **then** the local config takes precedence and the persona resolves to `product`.

4. **When** a skill is invoked with `--persona product` in its argument text **then** the flag takes precedence over both local and global config files.

5. **When** the resolved persona name does not match any file in `templates/personas/` **then** a warning is emitted, the persona falls back to `developer`, and the `developer.md` directive is injected.

6. **When** a persona directive is injected **then** it includes dimension-specific output rules (verbosity, code references, next actions, spec citations) but does not alter any internal processing, gates, reviews, or validation logic.

7. **When** `/adev:init` runs in a project with `.context-index/` **then** it prompts the user to optionally create a local `.context-index/user-config` with a persona override for this project, and adds `user-config` to the project's `.gitignore`.

8. **When** `/adev:init` runs in a project with `.context-index/` **then** it adds `user-config` to the project's `.gitignore` file.

9. **When** the CLI install command (`npx @adev-org/adev-cli init`) runs **then** it prompts the user to select a default persona (`product`, `developer`, or `architect`) and writes the selection to the global `user-config` file at `<PLUGIN_ROOT>/user-config`.

### Postconditions

- After session start, the conversation context contains exactly one persona directive block
- The `user-config` file (when written) contains valid `key=value` format parseable by bash without external tools
- The `.gitignore` includes `user-config` after `/adev:init` runs
- All skill outputs follow the persona's dimension rules (verbosity, code refs, next actions) without any change to internal processing

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `user-config` file has invalid format (not `key=value` lines) | Warning printed, file ignored, fall back to `developer` | INVALID_CONFIG |
| `user-config` has `persona=` with empty value | Treat as absent, fall back to next level in hierarchy | EMPTY_PERSONA |
| `--persona` flag value is empty or missing argument | Warning printed, flag ignored, resolve from config files | INVALID_FLAG |
| Persona template file missing from `templates/personas/` | Warning printed, fall back to `developer.md` | MISSING_TEMPLATE |
| `templates/personas/` directory missing entirely | Warning printed, no directive injected, session proceeds without persona customization | MISSING_TEMPLATES_DIR |
| Both global and local `user-config` files are unreadable (permissions) | Warning printed, fall back to `developer` | CONFIG_UNREADABLE |

## System Constitution Reference

- **"Minimize external dependencies"** — Persona resolution uses only Node.js built-ins (`fs`, `path`) and bash builtins. The flat `key=value` config format avoids needing a YAML parser in bash.
- **"Skills are primarily markdown"** — Persona directives are markdown templates in `templates/personas/`. No executable logic required for the skill to function.
- **"Hook protocol compliance"** — The session-start hook modification continues to exit 0 and output JSON to stdout with the persona directive embedded in `additionalContext`.
- **"No hardcoded paths to `~/.claude/`"** — The global `user-config` path is resolved via `PLUGIN_ROOT`, not hardcoded.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Define `user-config` file format | Document the `key=value` format, comment syntax, parsing rules | small |
| Create `parseUserConfig()` in `lib/persona.mjs` | Parse flat key-value file, return config object, handle errors gracefully | small |
| Create `resolvePersona()` in `lib/persona.mjs` | Implement resolution hierarchy: flag -> local -> global -> fallback | medium |
| Create `loadPersonaDirective()` in `lib/persona.mjs` | Read persona template, validate existence, handle fallback | small |
| Write three persona directive templates | `product.md`, `developer.md`, `architect.md` with dimension-specific output rules and next-action guidance | medium |
| Modify `session-start.sh` to inject persona | Add persona resolution + directive injection to the existing hook pipeline | medium |
| Modify CLI install to prompt for persona | Add persona selection step to the install flow, write global `user-config` | small |
| Modify `/adev:init` for local config + gitignore | Add optional local persona override prompt, add `user-config` to `.gitignore` | small |
| Tests for persona resolution hierarchy | Cover all hierarchy levels, fallback, unknown persona, invalid config | medium |

## Acceptance Criteria

- [ ] `resolvePersona()` returns `developer` when no config files or flags exist
- [ ] `resolvePersona()` returns global config value when only global `user-config` exists
- [ ] `resolvePersona()` returns local config value when both global and local exist
- [ ] `resolvePersona()` returns flag value when `--persona` is passed, regardless of config files
- [ ] `resolvePersona()` warns and returns `developer` for unknown persona names
- [ ] `parseUserConfig()` correctly parses `key=value` lines, ignoring comments and blank lines
- [ ] `parseUserConfig()` warns and returns empty config for malformed files
- [ ] `loadPersonaDirective()` returns the correct template content for `product`, `developer`, `architect`
- [ ] `loadPersonaDirective()` warns and falls back to `developer.md` when template is missing
- [ ] Session-start hook injects persona directive into `additionalContext` JSON output
- [ ] Session-start hook continues to work when no `user-config` exists (backward compatible)
- [ ] CLI install prompts for persona and writes valid `user-config` to `<PLUGIN_ROOT>/user-config`
- [ ] `/adev:init` offers optional local persona override and writes `.context-index/user-config`
- [ ] `/adev:init` adds `user-config` to `.gitignore`
- [ ] Persona directive templates include dimension rules for: verbosity, code references, next actions, spec citations, test results, review verdicts
- [ ] All quality gates pass (tests, lint)
- [ ] No constitutional violations introduced
