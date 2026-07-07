---
charter: cursor-provider
kind: skill
status: implemented
risk_level: low
milestone:
revision: 2
charter-revision: 3
created: 2026-05-18
updated: 2026-05-18
source-manifest:
  sha: "20e668c"
  files:
    - package.json
    - providers/cursor/hooks.json
    - scripts/build-cursor-hooks.mjs
    - tests/cursor-hooks-sync.test.mjs
  computed-at: "2026-07-03T22:27:11.425Z"
---

# Skill Spec: Hook Config Generator with Translation Table and Drift Test

<!-- Spec C from the cursor-provider charter's 5-spec grouping.
     Covers three tightly-coupled capabilities sharing one subsystem:
     a build-step generator, its translation-table coverage assertion,
     and the drift test that pins the generator's output.
     Parent Charter: .context-index/specs/features/cursor-provider/charter.md -->

## Invocation Modes

A single new `npm run` surface plus a node:test suite:

1. **`npm run build:cursor-hooks`** — runs `node scripts/build-cursor-hooks.mjs` with no arguments. Reads canonical `hooks/hooks.json` from the project root, generates the Cursor-shaped output in memory, and writes it atomically to `providers/cursor/hooks.json`. Exit 0 on success; exit non-zero on any throw (including translation-table coverage failures).

2. **`node --test tests/cursor-hooks-sync.test.mjs`** (runs under `npm test`) — pattern test that re-runs the generator in memory and asserts the committed `providers/cursor/hooks.json` matches the freshly-generated output.

Both invocations are non-interactive; no flags, no prompts.

## Arguments

| Argument | Required | Description |
|---|---|---|
| *(none for the generator)* | — | `scripts/build-cursor-hooks.mjs` takes no CLI arguments. Input is the canonical `hooks/hooks.json`; output is `providers/cursor/hooks.json`. Atomic write via temp file + rename. |
| *(none for the test)* | — | `tests/cursor-hooks-sync.test.mjs` takes no CLI arguments; runs under the standard `node:test` runner. |

## Output Contract

### `scripts/build-cursor-hooks.mjs`

**Files written:**
- `providers/cursor/hooks.json` — atomically replaced on every successful run. Same `mode` as the canonical (`0644`). Pretty-printed with 2-space indent, trailing newline.

**JSON shape produced:**

```json
{
  "version": 1,
  "hooks": {
    "<cursorEvent>": [
      { "command": "./hooks/<script>.sh", "matcher": "<cursorMatcher>", "failClosed": <bool>, "timeout": <number> }
    ]
  }
}
```

### Hook Intent and Semantic Invariant

Cursor's hook lifecycle distinguishes pre-execution events (which can deny with exit 2) from post-execution events (which cannot meaningfully deny — the action already happened). adev's hooks split into two intent classes:

- **fail-closed gates** — hooks that prevent disallowed actions by exiting 2. Today these are all `PreToolUse` hooks in `hooks/hooks.json`:
  - `context-preflight.sh`, `constitution-linter.sh`, `lifecycle-gate-edit.sh` (under `PreToolUse/Edit`)
  - `merge-guard.sh`, `lifecycle-gate-bash.sh` (under `PreToolUse/Bash`)
- **advisory / observational** — hooks that log, capture, or trigger side effects but do not deny. Today these are all `PostToolUse` and `Stop` hooks: `context-read-tracker.sh`, `sync-trigger.sh`, `session-capture.sh`, `issue-reminder.sh`, `post-validate-extract-heuristics.sh`.

**Semantic invariant:** every fail-closed Claude hook MUST map to a Cursor event that fires **before** the corresponding tool action. Routing a fail-closed hook through a post-action Cursor event (e.g., `afterFileEdit`) silently drops its deny semantics and is a violation of Constitution Principle 4.

### Translation table (committed inline in the generator)

| Claude event | Claude matcher | Cursor event | Cursor matcher | Hook intent | Notes |
|---|---|---|---|---|---|
| `SessionStart` | `startup\|resume\|clear\|compact` | `sessionStart` | (none) | observational | Cursor fires on session start; collapse start-mode distinction |
| `PreToolUse` | `Edit` | `preToolUse` | `Edit` | **fail-closed** | Cursor's generic `preToolUse` with a matcher fires before edits and supports exit-2 deny. Direct mapping that preserves fail-closed semantics. |
| `PreToolUse` | `Bash` | `beforeShellExecution` | (none) | **fail-closed** | Direct mapping; both fire pre-execution |
| `PostToolUse` | `Read` | `postToolUse` | `Read` | observational | `postToolUse` with matcher; advisory only |
| `PostToolUse` | `Edit` | `afterFileEdit` | (none) | observational | Direct mapping |
| `PostToolUse` | `.*` | `postToolUse` | (none) | observational | Catchall |
| `Stop` | `.*` | `stop` | (none) | observational | Direct mapping |

**Earlier design rejected.** A previous draft (rev 1) mapped `PreToolUse/Edit` to `beforeReadFile` + `afterFileEdit` (a fan-out). That mapping routed `lifecycle-gate-edit.sh`, `constitution-linter.sh`, and `context-preflight.sh` partly through Cursor's post-write event, where exit-2 deny is meaningless. Rejected as a Principle 4 violation. The rev 2 mapping uses Cursor's generic `preToolUse` with a `matcher: "Edit"` so the fail-closed gate fires pre-edit on Cursor exactly as it does on Claude Code.

**Per-entry defaults.** Each generated Cursor entry carries:
- `failClosed`: `true` if the source hook is in the fail-closed intent class (per the table above), else `false`. Cursor's hook runner respects `failClosed: true` by treating non-zero exits as deny; entries without the flag default to `failClosed: false` and any non-zero exit becomes advisory.
- `timeout`: `30` seconds for fail-closed hooks (short enough to prevent UI freezes during gates), `60` seconds for advisory hooks (long enough for capture/sync). Sourced from the generator as constants alongside the translation table.

**Command translation:** every hook command of the form `bash "${CLAUDE_PLUGIN_ROOT}/hooks/<script>.sh"` is rewritten to `./hooks/<script>.sh` (Cursor uses relative paths from the plugin root and supports direct shell execution). The `bash ` wrapper is stripped because Cursor's hook runner invokes the command directly. **The generator throws on any hook command that does NOT match this canonical pattern** (see Failure Modes) — silently accepting unknown command shapes would let new bash invocations bypass the translation review.

**Lifecycle event:** none. The generator does not emit lifecycle events — it's a pure file transform.

### `tests/cursor-hooks-sync.test.mjs`

**Files written:** none.

**Assertions:**
1. `providers/cursor/hooks.json` exists at the plugin root
2. `providers/cursor/hooks.json` parses as valid JSON
3. Re-running the generator in-memory produces output that `deepEqual`s the committed `providers/cursor/hooks.json` (structural equality, not byte equality — whitespace differences allowed)
4. Every event present in `hooks/hooks.json` resolves to at least one entry in the committed `providers/cursor/hooks.json`

**Failure messages:**
- On deepEqual mismatch: `"providers/cursor/hooks.json is out of sync with hooks/hooks.json. Run \`npm run build:cursor-hooks\` to regenerate."`
- On missing committed file: `"providers/cursor/hooks.json does not exist. Run \`npm run build:cursor-hooks\` to create it."`

## Failure Modes

| Condition | Generator Behavior | User Recovery |
|---|---|---|
| `hooks/hooks.json` missing | Throw `Error("Canonical hooks/hooks.json not found at <path>")`; exit non-zero | Verify the file exists at the plugin root; this is a build environment problem |
| `hooks/hooks.json` is not valid JSON | Let `JSON.parse` throw with its native message; exit non-zero | Fix the syntax error in the canonical file |
| Claude event in `hooks/hooks.json` has no translation table entry | Throw `Error("Unknown Claude event: <eventName>. Add an entry to TRANSLATION_TABLE in scripts/build-cursor-hooks.mjs.")`; exit non-zero | Edit the translation table in the generator to map the new event |
| Claude matcher under a known event has no translation entry | Throw `Error("Unknown Claude matcher: <event>/<matcher>. Add an entry to TRANSLATION_TABLE in scripts/build-cursor-hooks.mjs.")`; exit non-zero | Edit the translation table to map the new matcher |
| Hook command does NOT match canonical `bash "${CLAUDE_PLUGIN_ROOT}/hooks/<script>.sh"` pattern | Throw `Error("Non-canonical hook command at <event>/<matcher>: <command>. Translation only supports the canonical bash-script form; new command shapes need explicit translation logic.")`; exit non-zero | Either restructure the hook to use the canonical form OR extend the generator with a new translation case (review required) |
| Hook command is canonical-shaped but references a script that does not exist on disk | Throw `Error("Hook script not found: hooks/<script>.sh referenced from <event>/<matcher>")`; exit non-zero | Fix the broken reference in `hooks/hooks.json` |
| `providers/cursor/` directory does not exist | Create it via `mkdirSync({ recursive: true })`; do NOT throw | Build proceeds |
| Atomic write fails (filesystem full, permissions, etc.) | Let the `rename` throw natively; exit non-zero. The temp file may be left behind but never partially overwrites the target | Fix the underlying filesystem issue and re-run |

**Test failure modes** (these are not generator failures — they're CI signals):

| Condition | Test Behavior |
|---|---|
| Committed `providers/cursor/hooks.json` drifts from generator output | Fail with the "run `npm run build:cursor-hooks` to regenerate" message |
| Generator throws (any of the above) | Test fails and surfaces the generator's throw message verbatim |

## System Constitution Reference

- **Principle 1: Minimize external dependencies** — `scripts/build-cursor-hooks.mjs` uses only Node built-ins: `node:fs`, `node:path`. The test uses `node:test`, `node:assert/strict`, and the generator import. No new dependencies.
- **Principle 3: Pure ESM** — both files are `.mjs` with ESM `import` syntax, matching every other `.mjs` file in `scripts/` and `tests/`.
- **Principle 4: Hook protocol compliance** — The generator does NOT change the canonical `hooks/hooks.json` shape or the hook scripts themselves. It only translates the *registration* into Cursor's event model. The stdin/stdout exit-code protocol (`0` allow, `2` deny) is unchanged across providers per Cursor docs.
- **Architecture Boundary: Autonomous lane** — Spec C does NOT change the hook stdin/stdout JSON contract, does NOT change the CLI installation path structure, does NOT change the plugin registration format, and does NOT add external dependencies. It introduces a new build-time generator that derives provider-specific config from a canonical source — this is the explicit recommendation in the cursor-provider charter (Quality Attributes: Drift safety, Translation completeness). Sits in the Autonomous lane.

## Acceptance Criteria

- [ ] `scripts/build-cursor-hooks.mjs` exists at the plugin root and uses only Node built-ins
- [ ] `package.json:scripts["build:cursor-hooks"]` runs `node scripts/build-cursor-hooks.mjs`
- [ ] The translation table is defined inline in the generator as an exported constant (so the test can import and inspect it if needed) and covers all 7 Claude event/matcher pairs currently present in `hooks/hooks.json`
- [ ] Running `npm run build:cursor-hooks` produces `providers/cursor/hooks.json` matching the JSON shape documented above
- [ ] Every hook command of the form `bash "${CLAUDE_PLUGIN_ROOT}/hooks/<script>.sh"` is rewritten to `./hooks/<script>.sh` in the output
- [ ] Every `PreToolUse` source entry maps to a Cursor event that fires **before** the corresponding tool action (`preToolUse` or `beforeShellExecution`) — never to a post-action event. This is the fail-closed semantic invariant.
- [ ] Each generated entry carries `failClosed: true` when the source hook intent is fail-closed (PreToolUse), `failClosed: false` otherwise. `timeout` is `30` for fail-closed entries, `60` for advisory entries.
- [ ] The generator writes atomically (temp file + rename) — interrupted writes never leave a partial `providers/cursor/hooks.json`
- [ ] The generator throws with a clear, actionable message when it encounters an unmapped Claude event or matcher
- [ ] The generator throws on any hook command that does not match the canonical `bash "${CLAUDE_PLUGIN_ROOT}/hooks/<script>.sh"` form (SEC-1)
- [ ] `tests/cursor-hooks-sync.test.mjs` exists and uses only Node built-ins
- [ ] `tests/cursor-hooks-sync.test.mjs` passes when `providers/cursor/hooks.json` is in sync
- [ ] `tests/cursor-hooks-sync.test.mjs` fails with the "run `npm run build:cursor-hooks` to regenerate" message when the committed output drifts from the generator
- [ ] `tests/cursor-hooks-sync.test.mjs` runs under `npm test` and surfaces in CI on every PR
- [ ] No constitutional violations introduced; sits in the Autonomous lane (no protocol/install-path/registration-format changes; no external dependencies)
