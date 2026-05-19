# Live Spec: Copilot Hook Config Generator

<!-- Live Spec within the copilot-provider charter.
     Parent Charter: .context-index/specs/features/copilot-provider/charter.md -->

---
charter: copilot-provider
kind: behavioral
status: review-passed
risk_level: medium
milestone: v1
revision: 1
charter-revision: 2
created: 2026-05-19
updated: 2026-05-19
---

## Behavioral Contract

The Copilot Hook Config Generator is a build-step that reads the canonical `hooks/hooks.json` (the single source of truth for adev's hook configuration) and emits `providers/copilot/hooks.json` in GitHub Copilot's documented hook-config shape. Drift between the committed output and the generator's current output is rejected by a pattern test under `npm test`. The generator and its supporting mapping tables are pure functions over file paths — no network, no environment side effects.

### Preconditions

- `hooks/hooks.json` exists, is valid JSON, and conforms to adev's canonical hook-config shape (Claude Code event vocabulary, PascalCase stdin protocol).
- `lib/providers/copilot/event-table.mjs` exports a translation entry for every Claude event referenced in `hooks/hooks.json`.
- `lib/providers/copilot/tool-names.mjs` exports a mapping entry for every Claude tool name referenced in any matcher regex inside `hooks/hooks.json`.
- Node.js runtime is available (no external dependencies required).

### Behaviors

1. **When** `npm run build:copilot-hooks` runs against the canonical `hooks/hooks.json`, **then** the generator writes `providers/copilot/hooks.json` with top-level `version: 1` and a `hooks` object keyed by Copilot event names (camelCase: `preToolUse`, `postToolUse`, `sessionStart`, `sessionEnd`, `agentStop`, `subagentStart`, `subagentStop`, `userPromptSubmitted`, `postToolUseFailure`, `preCompact`, `errorOccurred`).
2. **When** a Claude event entry is translated, **then** the emitted Copilot entry includes `type: "command"`, `bash: <script-path-from-canonical>`, optional `env`, `cwd: "."`, `timeoutSec` (carried forward from the canonical or defaulted to `30`), and a `matcher` regex rewritten so that every Claude tool name token is replaced via `lib/providers/copilot/tool-names.mjs` (e.g., `Bash` → `bash`, `Write|Edit` → `create|edit`, `Read` → `view`, `WebFetch` → `web_fetch`).
3. **When** a Claude event in `hooks/hooks.json` has no entry in `lib/providers/copilot/event-table.mjs`, **then** the generator throws `UNKNOWN_EVENT: <claudeEvent>` to stderr and exits with code `1` without writing `providers/copilot/hooks.json`.
4. **When** a matcher regex references a Claude tool name with no entry in `lib/providers/copilot/tool-names.mjs`, **then** the generator throws `UNMAPPED_TOOL_NAME: <claudeToolName>` to stderr and exits with code `1` without writing `providers/copilot/hooks.json`.
5. **When** the generator emits hook entries, **then** it MUST NOT emit `notification` or `permissionRequest` events and MUST NOT emit a `powershell` key on any entry, preserving Cloud-Agent compatibility for the emitted config.
6. **When** the generator emits the output file, **then** the output is deterministic — repeated runs against unchanged inputs produce byte-identical files (sorted keys at every object level, trailing newline, two-space indent).
7. **When** `tests/copilot-hooks-sync.test.mjs` runs under `npm test`, **then** it re-runs the generator in-memory against the current `hooks/hooks.json` and asserts `deepEqual` against the committed `providers/copilot/hooks.json`; on mismatch the test fails with a hint message `run npm run build:copilot-hooks`.
8. **When** a contributor adds a new Claude event to `hooks/hooks.json` without updating `lib/providers/copilot/event-table.mjs`, **then** the drift test fails before merge because the generator's coverage-assertion throw surfaces as a thrown error inside the test runner.

### Postconditions

- `providers/copilot/hooks.json` exists, is valid JSON, conforms to Copilot's documented hook-config schema, and uses only events the Cloud Agent supports.
- No file outside `providers/copilot/hooks.json` is written by the generator.
- Hook scripts under `hooks/*.sh` are untouched — the PascalCase stdin shape is preserved through the generator unchanged.
- The drift test's in-memory generator run produces output byte-identical to the committed file.

### Error Cases

| Condition | Expected Behavior | Exit Code |
|-----------|-------------------|-----------|
| `hooks/hooks.json` missing | Throw `MISSING_CANONICAL: <abs-path>` to stderr; no output written | 1 |
| `hooks/hooks.json` not valid JSON | Propagate the parser's error message with file path prefix; no output written | 1 |
| Unknown Claude event in canonical | Throw `UNKNOWN_EVENT: <claudeEvent>`; no output written | 1 |
| Unmapped Claude tool name in matcher | Throw `UNMAPPED_TOOL_NAME: <claudeToolName>`; no output written | 1 |
| Translation table contains a duplicate Claude-event key | Throw `DUPLICATE_EVENT_MAPPING: <claudeEvent>` at module load time | 1 |
| Output write fails (permissions, disk full) | Propagate the IO error with target path; no partial file left behind | 1 |
| Committed `providers/copilot/hooks.json` drifts from generator output | Drift test fails under `npm test` with hint `run npm run build:copilot-hooks`; CI rejects merge | (test failure) |

## System Constitution Reference

- **Principle 1:** "Minimize external dependencies — prefer Node.js built-ins." — Applies because the generator, mapping tables, and drift test are implemented using `node:fs`, `node:path`, and `node:test` only. No new package.json dependencies are added.
- **Principle 3:** "Pure ESM — all `.mjs` files, no CommonJS." — Applies to every new module: `scripts/build-copilot-hooks.mjs`, `lib/providers/copilot/event-table.mjs`, `lib/providers/copilot/tool-names.mjs`, `tests/copilot-hooks-sync.test.mjs`.
- **Principle 4:** "Hook protocol compliance — hooks read JSON from stdin + env vars, exit 0 (allow) or 2 (block)." — Applies because the generator emits Copilot config that uses Copilot CLI's PascalCase stdin shape (explicitly "VS Code compatible"), which is byte-identical to Claude Code's hook protocol. Existing `hooks/*.sh` scripts work unmodified; the protocol contract is preserved.
- **Quality Gate (constitution):** "`npm test` must pass before any implementation is considered complete." — Applies because the drift test is a `npm test` gate and the only line of defense against silent drift between the canonical hooks and the Copilot-provider-committed output.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Create event translation table | Author `lib/providers/copilot/event-table.mjs` exporting Claude→Copilot event mappings (PreToolUse→preToolUse, PostToolUse→postToolUse, SessionStart→sessionStart, SessionEnd→sessionEnd, Stop→agentStop, SubagentStart→subagentStart, SubagentStop→subagentStop, UserPromptSubmit→userPromptSubmitted, PostToolUseFailure→postToolUseFailure, PreCompact→preCompact, Notification→errorOccurred-or-skip per Cloud-Agent rule). Include `cloudAgentSafe` flag per entry; skip non-safe events. | medium |
| Create tool-name mapping table | Author `lib/providers/copilot/tool-names.mjs` exporting Claude→Copilot tool-name pairs: `Bash→bash`, `Write→create`, `Edit→edit`, `MultiEdit→edit`, `Read→view`, `Glob→glob`, `Grep→grep`, `WebFetch→web_fetch`, `Task→task`, `AskUser→ask_user`. | small |
| Implement matcher rewrite helper | Pure function that takes a Claude matcher regex string and the tool-name mapping, returns the Copilot-vocabulary equivalent. Throws `UNMAPPED_TOOL_NAME` on any unmapped token. | small |
| Implement generator core | Author `scripts/build-copilot-hooks.mjs`: read canonical, validate against translation table, transform each event entry, rewrite each matcher, drop Cloud-Agent-unsafe events, sort keys deterministically, write `providers/copilot/hooks.json`. | medium |
| Wire npm script | Add `"build:copilot-hooks": "node scripts/build-copilot-hooks.mjs"` to `package.json` (or the existing scripts block). | small |
| Run generator and commit output | Execute `npm run build:copilot-hooks`, commit the produced `providers/copilot/hooks.json`. | small |
| Author drift test | Create `tests/copilot-hooks-sync.test.mjs` using `node:test` and `tests/helpers.mjs`. Re-run generator in-memory, `assert.deepStrictEqual` against committed file, on mismatch surface hint `run npm run build:copilot-hooks`. | medium |
| Add coverage-assertion tests | Unit tests that synthesize a hooks.json with an unknown Claude event and an unmapped tool name, assert the generator throws the documented error codes. | small |
| Add Cloud-Agent-safe assertion | Unit test that scans the committed `providers/copilot/hooks.json` for `notification`/`permissionRequest`/`powershell` keys and fails if any are present. | small |

## Acceptance Criteria

- [ ] `lib/providers/copilot/event-table.mjs` exists and exports a translation entry for every Claude event referenced in `hooks/hooks.json`.
- [ ] `lib/providers/copilot/tool-names.mjs` exists and exports a mapping entry for every Claude tool name referenced in any matcher in `hooks/hooks.json`.
- [ ] `scripts/build-copilot-hooks.mjs` exists, uses only Node.js built-ins, and is pure ESM.
- [ ] `npm run build:copilot-hooks` produces `providers/copilot/hooks.json` and is byte-deterministic on repeat runs.
- [ ] The committed `providers/copilot/hooks.json` deep-equals the generator's current output.
- [ ] `tests/copilot-hooks-sync.test.mjs` exists and passes under `npm test`; on synthetic drift it fails with the hint message.
- [ ] Unit tests cover both error paths: synthetic unknown Claude event → `UNKNOWN_EVENT`; synthetic unmapped tool name → `UNMAPPED_TOOL_NAME`.
- [ ] The committed Copilot config contains no `notification`, `permissionRequest`, or `powershell` keys.
- [ ] Output schema validates against GitHub Copilot's documented hook-config shape (`version`, `hooks` object, per-entry `type`/`bash`/`cwd`/`matcher`/`timeoutSec`).
- [ ] No new entries added to `package.json` `dependencies` or `devDependencies`.
- [ ] All quality gates pass (`npm test`).
- [ ] No constitutional violations introduced.
