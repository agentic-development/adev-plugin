# Live Spec: Persona Resolution and Injection

---
charter: output-personas
status: validated
risk_level: medium
milestone:
revision: 2
charter-revision: 2
created: 2026-04-21
updated: 2026-04-21
source-manifest:
  sha: "1ffe0d4"
  files:
    - cli/index.mjs
    - hooks/session-start.sh
    - lib/persona.mjs
    - skills/init/SKILL.md
    - templates/persona-override-section.md
    - templates/personas/architect.md
    - templates/personas/developer.md
    - templates/personas/product.md
    - tests/persona.test.mjs
  computed-at: "2026-04-21T13:05:58.708Z"
---

## Behavioral Contract

### Preconditions

- The plugin is installed and `session-start.sh` runs on every Claude Code session start
- `templates/personas/` directory exists with at least `developer.md`
- `user-config` files use flat `key=value` format (one pair per line, `#` comments, blank lines ignored)

### Behaviors

#### Phase 1: Session-Start Injection (config-based)

1. **When** the session-start hook runs and no `user-config` file exists (neither local nor global) **then** the persona resolves to `developer` and the `developer.md` directive is injected into the session context.

2. **When** a global `user-config` file exists at `<PLUGIN_ROOT>/user-config` with `persona=architect` **then** the persona resolves to `architect` and the `architect.md` directive is injected.

3. **When** both a global `user-config` (with `persona=architect`) and a local `.context-index/user-config` (with `persona=product`) exist **then** the local config takes precedence and the persona resolves to `product`.

4. **When** the resolved persona name does not match any filename (without `.md` extension) in `templates/personas/` **then** a warning is emitted, the persona falls back to `developer`, and the `developer.md` directive is injected. Persona names are validated against the actual directory listing — path separators (`/`, `\`, `..`) in the name cause immediate rejection and fallback.

5. **When** a persona directive is injected **then** it includes dimension-specific output rules (verbosity, code references, next actions, spec citations) but does not alter any internal processing, gates, reviews, or validation logic.

#### Phase 2: Per-Invocation Override (skill-level)

6. **When** a skill is invoked with `--persona <name>` in its argument text **then** the skill reads the matching persona directive template and applies it for that invocation, overriding the session-start persona. This is handled in the skill's SKILL.md argument parsing, not by the session-start hook — because the hook fires before any skill is invoked. The session-start directive remains the default for skills invoked without `--persona`.

7. **When** a `--persona` flag value does not match any file in `templates/personas/` **then** a warning is shown to the user and the session-start persona remains active (no override applied).

#### Setup

8. **When** `/adev:init` runs in a project with `.context-index/` **then** it prompts the user to optionally create a local `.context-index/user-config` with a persona override for this project, and adds `user-config` to the project's `.gitignore`.

9. **When** `/adev:init` runs (first run or diagnostic mode) **then** it prompts the user to select a default persona (`product`, `developer`, or `architect`) and writes the selection to the global `user-config` file at `<PLUGIN_ROOT>/user-config`. The CLI `install` command no longer handles persona configuration.

### Postconditions

- After session start, the conversation context contains exactly one persona directive block
- The `user-config` file (when written) contains valid `key=value` format parseable by bash without external tools
- The `.gitignore` includes `user-config` after `/adev:init` runs
- All skill outputs follow the persona's dimension rules (verbosity, code refs, next actions) without any change to internal processing
- Persona rules override skill output templates for user-facing chat responses. Skill output templates define the default format (Developer persona) and what to write to disk artifacts. Each skill's "Report to User" or "Output Format" section includes a persona-adaptation qualifier.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `user-config` file has invalid format (not `key=value` lines) | Warning printed, file ignored, fall back to `developer` | INVALID_CONFIG |
| `user-config` has `persona=` with empty value | Treat as absent, fall back to next level in hierarchy | EMPTY_PERSONA |
| `--persona` flag value is empty or missing argument | Warning printed, flag ignored, session-start persona remains active | INVALID_FLAG |
| Persona name contains path separators (`/`, `\`, `..`) | Rejected immediately, fall back to `developer` | PATH_TRAVERSAL |
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
| Define `user-config` file format | Document the `key=value` format, comment syntax, parsing rules. Values are everything after the first `=` on a single line; `\n` literals are not interpreted. | small |
| Create `parseUserConfig()` in `lib/persona.mjs` | Parse flat key-value file, return config object, handle errors gracefully | small |
| Create `resolvePersona()` in `lib/persona.mjs` | Implement config-based resolution: local → global → fallback. Validate persona name against directory listing in `templates/personas/` (not path construction). Reject names containing path separators. | medium |
| Create `loadPersonaDirective()` in `lib/persona.mjs` | Read persona template by validated name, handle fallback. Warnings use user-friendly messages (no full filesystem paths). | small |
| Write three persona directive templates | `product.md`, `developer.md`, `architect.md` with dimension-specific output rules and next-action guidance | medium |
| Modify `session-start.sh` to inject persona (Phase 1) | Add inline Node.js block using `require()` (CJS, consistent with existing hook patterns) to resolve persona from config files and read the directive template. Embed directive in `additionalContext` via existing `python3` JSON escaping pipeline. | medium |
| Add `--persona` override section to SKILL.md template (Phase 2) | Add a shared "Persona Override" argument section to skills that support `--persona`. The section parses the flag from arguments and loads the override directive, replacing the session-start default for that invocation. | small |
| Modify CLI install to prompt for persona | Add persona selection step to the install flow, write global `user-config` | small |
| Modify `/adev:init` for local config + gitignore | Add optional local persona override prompt, add `user-config` to `.gitignore` template | small |
| Tests for persona resolution hierarchy | Cover all hierarchy levels, fallback, path traversal rejection, unknown persona, invalid config, CJS hook integration | medium |

## Acceptance Criteria

- [ ] `resolvePersona()` returns `developer` when no config files exist
- [ ] `resolvePersona()` returns global config value when only global `user-config` exists
- [ ] `resolvePersona()` returns local config value when both global and local exist
- [ ] `resolvePersona()` rejects persona names containing path separators (`/`, `\`, `..`) and falls back to `developer`
- [ ] `resolvePersona()` validates persona name against actual directory listing in `templates/personas/`
- [ ] `resolvePersona()` warns and returns `developer` for unknown persona names
- [ ] `parseUserConfig()` correctly parses `key=value` lines, ignoring comments and blank lines
- [ ] `parseUserConfig()` takes everything after the first `=` as the value (no multiline interpretation)
- [ ] `parseUserConfig()` warns and returns empty config for malformed files
- [ ] `loadPersonaDirective()` returns the correct template content for `product`, `developer`, `architect`
- [ ] `loadPersonaDirective()` warns and falls back to `developer.md` when template is missing
- [ ] `loadPersonaDirective()` uses user-friendly warning messages (no full filesystem paths exposed)
- [ ] Session-start hook injects persona directive into `additionalContext` JSON output
- [ ] Session-start hook inline Node.js uses `require()` (CJS), consistent with existing hook patterns
- [ ] Session-start hook continues to work when no `user-config` exists (backward compatible)
- [ ] Per-invocation `--persona` flag overrides session-start persona for that skill invocation only
- [ ] Per-invocation `--persona` with unknown name shows warning and keeps session-start persona
- [ ] CLI install prompts for persona and writes valid `user-config` to `<PLUGIN_ROOT>/user-config`
- [ ] `/adev:init` offers optional local persona override and writes `.context-index/user-config`
- [ ] `/adev:init` adds `user-config` to `.gitignore`
- [ ] Persona directive templates include dimension rules for: verbosity, code references, next actions, spec citations, test results, review verdicts
- [ ] All quality gates pass (tests, lint)
- [ ] No constitutional violations introduced
