<!-- DO NOT EDIT statuses inline — see lifecycle log persona-resolution-and-injection.jsonl -->
# Implementation Plan: Persona Resolution and Injection

> **Methodology:** adev
> **Charter:** .context-index/specs/features/output-personas/charter.md
> **Spec:** .context-index/specs/features/output-personas/persona-resolution-and-injection.spec.md
> **Review:** PASS_WITH_NOTES (2026-04-21)
> **Platform:** Node.js, JavaScript (ESM .mjs), npm, node:test

**Goal:** Add a presentation layer that resolves a user persona from a layered config hierarchy and injects it at session start, adapting all skill outputs without changing internal processing.

**Architecture:** The feature has two phases. Phase 1 adds persona resolution (`lib/persona.mjs`) and injects the resolved directive via the existing `session-start.sh` hook using an inline CJS Node.js block (consistent with existing hook patterns). Phase 2 adds per-invocation `--persona` override as a shared argument section in SKILL.md files. Config uses a flat `key=value` format parseable by both bash and Node.js without external dependencies.

---

## File Structure

**Create:**
- `lib/persona.mjs` — parseUserConfig(), resolvePersona(), loadPersonaDirective()
- `templates/personas/product.md` — Product persona directive template
- `templates/personas/developer.md` — Developer persona directive template
- `templates/personas/architect.md` — Architect persona directive template
- `tests/persona.test.mjs` — Tests for persona resolution hierarchy

**Modify:**
- `hooks/session-start.sh` — Add persona resolution + directive injection block
- `cli/index.mjs` — Add persona prompt during CLI install
- `skills/init/SKILL.md` — Add local persona config + gitignore step

**Reference (read, do not modify):**
- `.context-index/constitution.md` — Verify no hardcoded paths, pure ESM, no external deps
- `hooks/session-start.sh` — Follow existing inline Node.js patterns (CJS `require()`)
- `cli/index.mjs` — Follow existing `ask()` pattern for interactive prompts

## Context Packets

### Task 1 Context
- Spec: `persona-resolution-and-injection.md` (behaviors 1-4, error cases)
- Charter: `charter.md` (interface contracts: parseUserConfig, resolvePersona, loadPersonaDirective)
- Constitution: `constitution.md` (pure ESM, no external deps, no hardcoded paths)

### Task 2 Context
- Spec: `persona-resolution-and-injection.md` (behavior 5, dimension table from charter)
- Charter: `charter.md` (quality attributes: extensibility)

### Task 3 Context
- Spec: `persona-resolution-and-injection.md` (behaviors 1-5)
- Existing code: `hooks/session-start.sh` (inline Node.js CJS pattern)
- Constitution: `constitution.md` (hook protocol compliance)

### Task 4 Context
- Spec: `persona-resolution-and-injection.md` (behavior 9)
- Existing code: `cli/index.mjs` (ask() pattern, gitignore handling)

### Task 5 Context
- Spec: `persona-resolution-and-injection.md` (behavior 8)
- Existing code: `skills/init/SKILL.md` (gitignore section)

### Task 6 Context
- Spec: `persona-resolution-and-injection.md` (behaviors 6-7)
- Charter: `charter.md` (per-invocation flag capability)

## Parallelization

- Group A (sequential): Task 1 → Task 3 (Task 3 depends on lib from Task 1)
- Group B (independent): Task 2 (no file overlap with Group A)
- Group C (sequential, after Task 1): Task 4 (CLI uses lib for config writing)
- Group D (independent): Task 5 (SKILL.md edit, no code dependency)
- Group E (independent, after Task 2): Task 6 (SKILL.md template, needs persona templates from Task 2)

Groups A and B can run in parallel. Groups C, D, E can run after their dependencies.

---

### Task 1: Persona Resolution Library [specialist: none]

**Charter capability:** Persona resolution, User config file format, Unknown persona fallback
**Files:**
- Create: `lib/persona.mjs`
- Create: `tests/persona.test.mjs`

**Tests:** `tests/persona.test.mjs`

- [ ] **Write failing tests**

```javascript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

// Test parseUserConfig
describe('parseUserConfig', () => {
  it('parses key=value lines', () => {
    // persona=architect
    // returns { persona: 'architect' }
  });

  it('ignores comments and blank lines', () => {
    // # comment
    //
    // persona=developer
  });

  it('takes everything after first = as value', () => {
    // key=value=with=equals
    // returns { key: 'value=with=equals' }
  });

  it('returns empty object for malformed files', () => {
    // no equals signs at all
  });

  it('returns empty object for nonexistent file', () => {
    // path does not exist
  });
});

// Test resolvePersona
describe('resolvePersona', () => {
  it('returns developer when no config files exist', () => {});
  it('returns global config value when only global exists', () => {});
  it('returns local config value when both exist', () => {});
  it('rejects persona names with path separators', () => {});
  it('rejects persona names with ..', () => {});
  it('falls back to developer for unknown persona names', () => {});
  it('treats empty persona value as absent', () => {});
});

// Test loadPersonaDirective
describe('loadPersonaDirective', () => {
  it('returns template content for valid persona', () => {});
  it('falls back to developer.md when template missing', () => {});
  it('returns null when templates dir missing', () => {});
  it('warning messages do not contain full filesystem paths', () => {
    // Capture warnings emitted by resolvePersona/loadPersonaDirective
    // Verify no absolute paths (starting with /) appear in warning text
  });
});
```

- [ ] **Verify tests fail**

Run: `node --test tests/persona.test.mjs`
Expected: FAIL — module `lib/persona.mjs` not found

- [ ] **Implement**

Create `lib/persona.mjs` with three exported functions:

```javascript
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';

export function parseUserConfig(filePath) {
  // Read file, split lines, parse key=value, ignore # comments and blank lines
  // Value is everything after the first =
  // Return {} on error or missing file
}

export function resolvePersona({ localConfigPath, globalConfigPath, templatesDir }) {
  // 1. Parse local config if exists
  // 2. Parse global config if exists
  // 3. Local persona > global persona > 'developer'
  // 4. Validate: reject path separators (/, \, ..)
  // 5. Validate: check against readdirSync(templatesDir) filenames
  // 6. Return { name, source } — source is 'local', 'global', or 'fallback'
}

export function loadPersonaDirective(name, templatesDir) {
  // Read templates/personas/<name>.md
  // If missing, warn and fall back to developer.md
  // If templates dir missing, return null
}
```

- [ ] **Verify tests pass**

Run: `node --test tests/persona.test.mjs`
Expected: PASS

- [ ] **Run full quality gates**

Run: `npm test`
Expected: PASS — no regressions

- [ ] **Commit**

```bash
git add lib/persona.mjs tests/persona.test.mjs
git commit -m "feat(output-personas): add persona resolution library"
```

---

### Task 2: Persona Directive Templates [specialist: none]

**Charter capability:** Persona directive templates
**Files:**
- Create: `templates/personas/product.md`
- Create: `templates/personas/developer.md`
- Create: `templates/personas/architect.md`

**Tests:** `tests/persona.test.mjs` — loadPersonaDirective tests from Task 1 will validate template loading

- [ ] **Write the three persona templates**

Each template defines output rules across these dimensions:

| Dimension | product | developer | architect |
|-----------|---------|-----------|-----------|
| Skill step summaries | What was done + why | + how it was done | + trade-off reasoning |
| Review verdicts | Pass/fail only | + issue list | + full reviewer rationale |
| Test results | "All tests pass" | + test names/counts | + coverage, failure details |
| Plan output | Capability list | + task breakdown | + routing scores, context packets |
| Code references | None | File paths | File paths + line numbers + diffs |
| Spec/ADR citations | None | Links when relevant | Always shown |
| Error/debug output | Plain language summary | + error messages | + stack traces, root cause chain |
| Next actions | Non-technical actions (review, approve, discuss) | Technical actions (run commands, review code) | Technical + architectural actions (review ADRs, assess trade-offs) |

Each template is a markdown file with a structured directive that Claude follows when generating output.

- [ ] **Verify templates load correctly**

Run: `node --test tests/persona.test.mjs`
Expected: PASS — loadPersonaDirective tests now find real template files

- [ ] **Commit**

```bash
git add templates/personas/
git commit -m "feat(output-personas): add product, developer, architect persona templates"
```

---

### Task 3: Session-Start Hook Integration [specialist: none]

**Charter capability:** Session-start injection
**Depends on:** Task 1, Task 2
**Files:**
- Modify: `hooks/session-start.sh`
- Modify: `tests/persona.test.mjs` (add hook integration test)

**Tests:** `tests/persona.test.mjs`

- [ ] **Write failing test**

```javascript
describe('session-start hook persona injection', () => {
  it('injects persona directive into additionalContext', () => {
    // Use runHook() from tests/helpers.mjs to execute session-start.sh
    // Verify JSON output contains persona directive in additionalContext
  });

  it('works with no user-config files (backward compatible)', () => {
    // Run hook without any user-config
    // Verify default developer directive is injected
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/persona.test.mjs`
Expected: FAIL — hook does not yet include persona block

- [ ] **Implement**

Add a persona resolution block to `session-start.sh` after the existing resume block and before the update check block. Use inline CJS Node.js (matching the existing pattern):

```bash
# Resolve persona and load directive
PERSONA_BLOCK=""
PERSONA_BLOCK=$(ADEV_PLUGIN_ROOT="$PLUGIN_ROOT" ADEV_CONTEXT_ROOT="${CONTEXT_ROOT:-}" node -e '
  const fs = require("fs");
  const path = require("path");

  try {
    const pluginRoot = process.env.ADEV_PLUGIN_ROOT || ".";
    const contextRoot = process.env.ADEV_CONTEXT_ROOT || process.cwd();
    const templatesDir = path.join(pluginRoot, "templates", "personas");

    // Parse user-config files (local > global > fallback)
    function parseConfig(filePath) {
      try {
        const lines = fs.readFileSync(filePath, "utf-8").split("\n");
        const config = {};
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const idx = trimmed.indexOf("=");
          if (idx === -1) continue;
          config[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
        }
        return config;
      } catch { return {}; }
    }

    const localConfig = parseConfig(path.join(contextRoot, ".context-index", "user-config"));
    const globalConfig = parseConfig(path.join(pluginRoot, "user-config"));

    let persona = localConfig.persona || globalConfig.persona || "developer";

    // Validate: reject path separators
    if (/[\/\\]|\.\./.test(persona)) persona = "developer";

    // Validate: check against actual templates
    if (!fs.existsSync(templatesDir)) process.exit(0);
    const available = fs.readdirSync(templatesDir)
      .filter(f => f.endsWith(".md"))
      .map(f => f.slice(0, -3));
    if (!available.includes(persona)) persona = "developer";

    // Load directive
    const directivePath = path.join(templatesDir, persona + ".md");
    if (!fs.existsSync(directivePath)) process.exit(0);
    const directive = fs.readFileSync(directivePath, "utf-8");
    console.log(directive);
  } catch { process.exit(0); }
' 2>/dev/null || true)
```

Then refactor the COMBINED assembly block to use an array-join pattern instead of extending the if/elif chain (which would require 8 branches for 3 variables). Collect all non-empty blocks into an array and join with newlines:

```bash
# Combine all blocks
BLOCKS=("$SKILL_CONTENT")
[ -n "$PERSONA_BLOCK" ] && BLOCKS+=("$PERSONA_BLOCK")
[ -n "$RESUME_BLOCK" ] && BLOCKS+=("$RESUME_BLOCK")
[ -n "$UPDATE_BLOCK" ] && BLOCKS+=("$UPDATE_BLOCK")

# Join with double newline
COMBINED=""
for block in "${BLOCKS[@]}"; do
  if [ -n "$COMBINED" ]; then
    COMBINED="${COMBINED}

${block}"
  else
    COMBINED="$block"
  fi
done
```

This replaces the existing 4-branch if/elif/else block (lines 168-183 of session-start.sh).

- [ ] **Verify test passes**

Run: `node --test tests/persona.test.mjs`
Expected: PASS

- [ ] **Run full quality gates**

Run: `npm test`
Expected: PASS

- [ ] **Commit**

```bash
git add hooks/session-start.sh tests/persona.test.mjs
git commit -m "feat(output-personas): inject persona directive at session start"
```

---

### Task 4: CLI Install Persona Prompt [specialist: none]

**Charter capability:** Init persona prompt (global)
**Depends on:** Task 1
**Files:**
- Modify: `cli/index.mjs`

**Tests:** `tests/persona.test.mjs` — add test for user-config file writing

- [ ] **Write failing test**

```javascript
describe('CLI persona config writing', () => {
  it('writes valid user-config with persona=<value>', () => {
    // Write a user-config file using the same format CLI would use
    // Parse it back with parseUserConfig()
    // Verify persona value is correct
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/persona.test.mjs`
Expected: FAIL

- [ ] **Implement**

In `cli/index.mjs`, after existing plugin installation steps and before the final summary, add a persona prompt:

```javascript
// Persona selection
heading("Persona Configuration");
log("Choose a default output persona:");
log("  1. product   — simplified summaries for PMs and designers");
log("  2. developer — balanced view with architecture and code details (default)");
log("  3. architect — full technical detail with trade-offs and review rationale");
const personaChoice = await ask("Select persona [1/2/3]:");
const personaMap = { '1': 'product', '2': 'developer', '3': 'architect' };
const selectedPersona = personaMap[personaChoice] || 'developer';
writeFileSync(join(PLUGIN_ROOT, 'user-config'), `# adev user config\npersona=${selectedPersona}\n`);
success(`Default persona set to: ${selectedPersona}`);
```

- [ ] **Verify test passes**

Run: `node --test tests/persona.test.mjs`
Expected: PASS

- [ ] **Run full quality gates**

Run: `npm test`
Expected: PASS

- [ ] **Commit**

```bash
git add cli/index.mjs tests/persona.test.mjs
git commit -m "feat(output-personas): add persona prompt to CLI install"
```

---

### Task 5: Init Skill — Local Config + Gitignore [specialist: none]

**Charter capability:** Init persona prompt (local), Gitignore management
**Files:**
- Modify: `skills/init/SKILL.md`
- Modify: `cli/index.mjs` (gitignore handling — add `user-config` entry)

**Tests:** `tests/persona.test.mjs`

- [ ] **Write failing test**

```javascript
describe('gitignore includes user-config', () => {
  it('CLI gitignore handler adds user-config entry', () => {
    // Verify the gitignore content includes user-config
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/persona.test.mjs`
Expected: FAIL

- [ ] **Implement**

1. In `cli/index.mjs`, update the gitignore handling section to include `.context-index/user-config`:

```javascript
// In the gitignore section, add user-config alongside existing entries
if (!content.includes("user-config")) {
  content = content.trimEnd() + "\n.context-index/user-config\n";
}
```

2. In `skills/init/SKILL.md`, add a section after the existing gitignore step:

```markdown
### Persona Configuration (optional)

Ask the user if they want to set a local persona override for this project:

> Would you like to set a project-specific output persona? (product/developer/architect/skip)
> This creates `.context-index/user-config` with your persona preference for this project.

If the user selects a persona, write `.context-index/user-config`:
```
# Project-specific adev user config
persona=<selected>
```

If the user skips, do not create the file.

Ensure `.context-index/user-config` is in `.gitignore`.
```

- [ ] **Verify test passes**

Run: `node --test tests/persona.test.mjs`
Expected: PASS

- [ ] **Run full quality gates**

Run: `npm test`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/init/SKILL.md cli/index.mjs tests/persona.test.mjs
git commit -m "feat(output-personas): add local persona config and gitignore to init"
```

---

### Task 6: Per-Invocation --persona Override [specialist: none]

**Charter capability:** Per-invocation flag
**Depends on:** Task 2
**Files:**
- Create: `templates/persona-override-section.md` — shared argument section for SKILL.md files

**Tests:** `tests/persona.test.mjs` — validation tests from Task 1 already cover name validation

- [ ] **Write the shared persona override section**

Create `templates/persona-override-section.md` — a reusable markdown block that any SKILL.md can include in its Arguments section:

```markdown
## Persona Override

| Argument | Required | Description |
|----------|----------|-------------|
| `--persona <name>` | No | Override the session-start persona for this invocation only. Valid values: `product`, `developer`, `architect`. |

If `--persona` is provided:
1. Validate the name against available templates in `templates/personas/`.
2. If valid, read the matching persona directive and apply its output rules for this invocation.
3. If invalid, show a warning and keep the session-start persona active.

This does not change internal processing, gates, reviews, or validation logic — only the presentation of outputs.
```

- [ ] **Verify the template is well-formed**

Read the file back and verify it parses as valid markdown with the expected sections.

**Note:** Acceptance criteria 16 (`--persona` flag overrides session persona) and 17 (unknown name shows warning) are behavioral contracts enforced by the SKILL.md instructional content, not by executable code. They are covered by this template's instructions, not by automated tests.

- [ ] **Commit**

```bash
git add templates/persona-override-section.md
git commit -m "feat(output-personas): add shared --persona override section for skills"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied
- No constitutional violations introduced (no external deps, pure ESM in lib/, CJS only in hook inline scripts, no hardcoded `~/.claude/` paths)
- Version bumped in both `package.json` and `.claude-plugin/plugin.json` (must stay in sync per constitution)
