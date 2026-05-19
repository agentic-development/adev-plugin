# Live Spec: Copilot Hook Config Generator

<!-- Live Spec within the copilot-provider charter.
     Parent Charter: .context-index/specs/features/copilot-provider/charter.md -->

---
charter: copilot-provider
kind: behavioral
status: review-pending
risk_level: medium
milestone: v1
revision: 2
charter-revision: 2
created: 2026-05-19
updated: 2026-05-19
---

## Behavioral Contract

The Copilot Hook Config Generator is a build-step that reads the canonical `hooks/hooks.json` (the single source of truth for adev's hook configuration) and emits `providers/copilot/hooks.json` in GitHub Copilot's documented hook-config shape. Drift between the committed output and the generator's current output is rejected by a pattern test under `npm test`. The generator and its supporting mapping tables are pure functions over file paths — no network, no environment side effects.

### Preconditions

- `hooks/hooks.json` exists, is valid JSON, and conforms to adev's canonical hook-config shape (Claude Code event vocabulary, PascalCase stdin protocol).
- `lib/providers/copilot/event-table.mjs` exports a translation entry for every Claude Code event referenced in `hooks/hooks.json`.
- `lib/providers/copilot/tool-names.mjs` exports a mapping entry for every Claude Code tool name referenced in any matcher regex inside `hooks/hooks.json`.
- Node.js runtime is available (no external dependencies required).

### Per-Field Source Mapping

Every emitted Copilot hook entry's fields source their value from exactly one of three places:

| Output field | Source | Notes |
|---|---|---|
| `type` | hardcoded-default | Always `"command"` in v1 |
| `bash` | canonical (`hooks/hooks.json` entry's command/script reference) | Path resolved unchanged from canonical |
| `cwd` | hardcoded-default | Always `"."` in v1; no per-entry override |
| `env` | canonical (carried forward verbatim; omitted when absent) | Copied as-is from canonical entry |
| `timeoutSec` | canonical → translation-table default → hardcoded-default `30` | Translation-table entry may declare a per-event default that overrides the hardcoded `30` |
| `matcher` | rewrite of canonical matcher via tool-name mapping | See Behaviors §2 for tokenization rules |

### Behaviors

1. **When** `npm run build:copilot-hooks` runs against the canonical `hooks/hooks.json`, **then** the generator writes `providers/copilot/hooks.json` with top-level `version: 1` and a `hooks` object keyed by Copilot event names (camelCase: `preToolUse`, `postToolUse`, `sessionStart`, `sessionEnd`, `agentStop`, `subagentStart`, `subagentStop`, `userPromptSubmitted`, `postToolUseFailure`, `preCompact`).
2. **When** a Claude Code event entry is translated, **then** the emitted Copilot entry is assembled per the Per-Field Source Mapping table above. The `matcher` rewrite tokenizes the input regex on `\b` (word boundaries), applies tool-name substitutions longest-match-first (so `MultiEdit` is rewritten before `Edit`), and rejects any matcher string longer than 1024 bytes with `MATCHER_TOO_LARGE: <claudeEvent>`.
3. **When** a Claude Code event in `hooks/hooks.json` has no entry in `lib/providers/copilot/event-table.mjs`, **then** the generator entrypoint writes `UNKNOWN_EVENT: <claudeEvent>` to stderr and calls `process.exit(1)` without writing `providers/copilot/hooks.json`.
4. **When** a matcher regex references a Claude Code tool name with no entry in `lib/providers/copilot/tool-names.mjs`, **then** the generator entrypoint writes `UNMAPPED_TOOL_NAME: <claudeToolName>` to stderr and calls `process.exit(1)` without writing `providers/copilot/hooks.json`.
5. **When** a translation-table entry has `cloudAgentSafe: false` (currently: `Notification` and any future Claude Code event that maps to a Cloud-Agent-unsupported Copilot event), **then** the generator drops the entry entirely — it emits no corresponding entry in `providers/copilot/hooks.json`. The output therefore contains no `notification`, `permissionRequest`, or `errorOccurred` keys, and no `powershell` key on any entry. Cloud-Agent runtime concerns beyond emitted output (e.g., scripts returning `permissionDecision: "ask"`) are out of scope and live in `hooks/*.sh`.
6. **When** the generator emits the output file, **then** the output is deterministic — repeated runs against unchanged inputs produce byte-identical files (sorted keys at every object level, trailing newline, two-space indent).
7. **When** the generator runs, **then** it resolves the output path as `path.resolve(projectRoot, 'providers/copilot/hooks.json')` and asserts the resolved path starts with `projectRoot + path.sep` before writing. The output path is hardcoded; no CLI flag or environment variable overrides it.
8. **When** `tests/copilot-hooks-sync.test.mjs` runs under `npm test`, **then** it re-runs the generator in-memory against the current `hooks/hooks.json` and asserts `deepStrictEqual` against the committed `providers/copilot/hooks.json`. The test (a) lets generator exceptions propagate unmodified — no permissive try/catch around the in-memory call, (b) fails with a distinct error if `hooks/hooks.json` is missing, (c) on content mismatch fails with the hint `run npm run build:copilot-hooks`.
9. **When** a contributor adds a new Claude Code event to `hooks/hooks.json` without updating `lib/providers/copilot/event-table.mjs`, **then** the drift test surfaces the generator's `UNKNOWN_EVENT` throw unmodified, failing before merge.

### Postconditions

- `providers/copilot/hooks.json` exists, is valid JSON, conforms to Copilot's documented hook-config schema, and uses only events the Cloud Agent supports.
- The resolved output path equals `<projectRoot>/providers/copilot/hooks.json` exactly; no file outside this path is written by the generator.
- Hook scripts under `hooks/*.sh` are untouched — the PascalCase stdin shape is preserved through the generator unchanged.
- The drift test's in-memory generator run produces output byte-identical to the committed file.

### Error Cases

| Condition | Expected Behavior | Exit Code |
|-----------|-------------------|-----------|
| `hooks/hooks.json` missing | Write `MISSING_CANONICAL: <absolute-path>` to stderr; no output written | 1 |
| `hooks/hooks.json` not valid JSON | Write the parser's error message with repo-relative file path prefix to stderr; no output written | 1 |
| Unknown Claude Code event in canonical | Write `UNKNOWN_EVENT: <claudeEvent>` to stderr; no output written | 1 |
| Unmapped Claude Code tool name in matcher | Write `UNMAPPED_TOOL_NAME: <claudeToolName>` to stderr; no output written | 1 |
| Matcher regex exceeds 1024 bytes | Write `MATCHER_TOO_LARGE: <claudeEvent>` to stderr; no output written | 1 |
| Translation table contains a duplicate Claude-Code-event key | Validator runs on first generator invocation (eager-import the table at entrypoint, validate via `Set`-based duplicate check), writes `DUPLICATE_EVENT_MAPPING: <claudeEvent>` to stderr, exits | 1 |
| Resolved output path escapes `projectRoot` | Write `OUTPUT_PATH_ESCAPE: <resolved-path>` to stderr; no output written | 1 |
| Output write fails (permissions, disk full) | Propagate the IO error with repo-relative target path; no partial file left behind | 1 |
| Committed `providers/copilot/hooks.json` drifts from generator output | Drift test fails under `npm test` with hint `run npm run build:copilot-hooks`; CI rejects merge | (test failure) |

Error message convention: all paths in stderr output are repo-relative (computed via `path.relative(projectRoot, p)`), except `MISSING_CANONICAL` which uses the absolute resolved path to aid debugging.

Throw-vs-exit semantics: error conditions are signalled by throwing `Error` instances whose `message` is the documented error string (e.g., `UNKNOWN_EVENT: PreToolUse`). The generator entrypoint (`scripts/build-copilot-hooks.mjs` `main()` function) wraps the body in a try/catch that writes `err.message` to stderr and calls `process.exit(1)`. Library modules (`lib/providers/copilot/*.mjs`) throw freely; only the entrypoint converts throws into exits.

### Translation-Table Authoring Rule

`lib/providers/copilot/event-table.mjs` MUST export the translation table as an `Array<{ claudeEvent, copilotEvent, cloudAgentSafe, defaultTimeoutSec? }>` (or equivalent `Map<string, ...>`), NOT a plain object literal. JS object literals silently discard duplicate keys; an array or `Map` allows the module-load-time `Set`-based duplicate check to surface authoring errors. The table's validator runs on first import (eager-import at the entrypoint, before reading `hooks/hooks.json`), so duplicates abort the generator before any output is attempted.

## System Constitution Reference

- **Principle 1:** "Minimize external dependencies — prefer Node.js built-ins." — Applies because the generator, mapping tables, and drift test are implemented using `node:fs`, `node:path`, and `node:test` only. No new package.json dependencies are added.
- **Principle 3:** "Pure ESM — all `.mjs` files, no CommonJS." — Applies to every new module: `scripts/build-copilot-hooks.mjs`, `lib/providers/copilot/event-table.mjs`, `lib/providers/copilot/tool-names.mjs`, `tests/copilot-hooks-sync.test.mjs`.
- **Principle 4:** "Hook protocol compliance — hooks read JSON from stdin + env vars, exit 0 (allow) or 2 (block)." — Applies because the generator emits Copilot config that uses Copilot CLI's PascalCase stdin shape (explicitly "VS Code compatible"), which is byte-identical to Claude Code's hook protocol. Existing `hooks/*.sh` scripts work unmodified; the protocol contract is preserved. Note: the `0/2` exit convention governs hook scripts at runtime; the build-step generator itself is a CLI and follows the CLI convention (exit `1` on fatal error).
- **Quality Gate (constitution):** "`npm test` must pass before any implementation is considered complete." — Applies because the drift test is a `npm test` gate and the only line of defense against silent drift between the canonical hooks and the Copilot-provider-committed output.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Create event translation table | Author `lib/providers/copilot/event-table.mjs` exporting an `Array<{ claudeEvent, copilotEvent, cloudAgentSafe, defaultTimeoutSec? }>` with mappings: `PreToolUse→preToolUse (safe)`, `PostToolUse→postToolUse (safe)`, `SessionStart→sessionStart (safe)`, `SessionEnd→sessionEnd (safe)`, `Stop→agentStop (safe)`, `SubagentStart→subagentStart (safe)`, `SubagentStop→subagentStop (safe)`, `UserPromptSubmit→userPromptSubmitted (safe)`, `PostToolUseFailure→postToolUseFailure (safe)`, `PreCompact→preCompact (safe)`, `Notification→notification (cloudAgentSafe: false → dropped)`. Module exports the array plus a `validate()` helper that runs a `Set`-based duplicate check and throws `DUPLICATE_EVENT_MAPPING` on collision. | medium |
| Create tool-name mapping table | Author `lib/providers/copilot/tool-names.mjs` exporting Claude Code → Copilot tool-name pairs: `Bash→bash`, `Write→create`, `Edit→edit`, `MultiEdit→edit`, `Read→view`, `Glob→glob`, `Grep→grep`, `WebFetch→web_fetch`, `Task→task`, `AskUser→ask_user`. Use array-of-tuples authoring to expose duplicates. | small |
| Implement matcher rewrite helper | Pure function `rewriteMatcher(claudeRegex: string, toolMap)`: tokenize on `\b`, apply substitutions longest-source-name-first (so `MultiEdit` precedes `Edit`), throw `MATCHER_TOO_LARGE` if `claudeRegex.length > 1024`, throw `UNMAPPED_TOOL_NAME` on any unmapped tool token. Returns the rewritten matcher string. Unit-tested for the `MultiEdit`/`Edit` overlap. | small |
| Implement generator core | Author `scripts/build-copilot-hooks.mjs`: resolve project root, eager-import `event-table.mjs` (triggering duplicate validation), read canonical, drop entries whose translation has `cloudAgentSafe: false`, transform each remaining event entry per the Per-Field Source Mapping table, rewrite each matcher, sort keys deterministically, resolve and assert the output path stays inside `projectRoot`, write `providers/copilot/hooks.json`. Wrap `main()` in a try/catch that writes `err.message` to stderr and calls `process.exit(1)`. | medium |
| Wire npm script | Add `"build:copilot-hooks": "node scripts/build-copilot-hooks.mjs"` to `package.json`'s `scripts` block. | small |
| Run generator and commit output | Execute `npm run build:copilot-hooks`, commit the produced `providers/copilot/hooks.json`. | small |
| Author drift test | Create `tests/copilot-hooks-sync.test.mjs` using `node:test` and `tests/helpers.mjs`. Re-run generator in-memory (no try/catch around the call — exceptions propagate unmodified), assert canonical existence before comparison, `assert.deepStrictEqual` against committed file, on content mismatch surface hint `run npm run build:copilot-hooks`. | medium |
| Author coverage-assertion tests | Fixture-driven unit tests: synthesize a `hooks.json` with (a) an unknown Claude Code event, (b) an unmapped tool name, (c) a `MultiEdit` matcher token (verify it does NOT match `Edit` substring), (d) intentionally drifted committed output (verify drift-test failure + hint message). Assert each documented error code. | small |
| Add Cloud-Agent-safe assertion | Unit test that loads the committed `providers/copilot/hooks.json` and asserts the absence of `notification`, `permissionRequest`, `errorOccurred`, and `powershell` keys. | small |

## Acceptance Criteria

- [ ] `lib/providers/copilot/event-table.mjs` exists, exports an `Array<...>` (not a plain object), and exports a `validate()` helper that throws `DUPLICATE_EVENT_MAPPING` when invoked over a table with duplicate `claudeEvent` keys.
- [ ] Every Claude Code event referenced in `hooks/hooks.json` has a matching entry in the translation table.
- [ ] `lib/providers/copilot/tool-names.mjs` exists, is array-authored, and contains an entry for every Claude Code tool name referenced in any matcher in `hooks/hooks.json` (including `MultiEdit`).
- [ ] `scripts/build-copilot-hooks.mjs` exists, uses only Node.js built-ins, and is pure ESM. Its `main()` is wrapped in a try/catch that writes `err.message` to stderr and calls `process.exit(1)`.
- [ ] `npm run build:copilot-hooks` produces `providers/copilot/hooks.json` and is byte-deterministic on repeat runs (sorted keys, two-space indent, trailing newline).
- [ ] The matcher rewrite helper rejects matcher strings longer than 1024 bytes with `MATCHER_TOO_LARGE`.
- [ ] The matcher rewrite helper applies substitutions longest-name-first; a synthetic `MultiEdit` matcher remains `edit` (Copilot vocabulary) and is NOT corrupted by a partial `Edit` match.
- [ ] The committed `providers/copilot/hooks.json` deep-equals the generator's current output.
- [ ] `tests/copilot-hooks-sync.test.mjs` exists and passes under `npm test`. The test asserts canonical-existence-before-comparison, lets generator exceptions propagate unmodified, and on synthetic content drift fails with the hint message `run npm run build:copilot-hooks`.
- [ ] Unit tests cover every documented error path: `UNKNOWN_EVENT`, `UNMAPPED_TOOL_NAME`, `MATCHER_TOO_LARGE`, `DUPLICATE_EVENT_MAPPING`, `OUTPUT_PATH_ESCAPE`, drift detection.
- [ ] The committed Copilot config contains zero entries for any translation-table entry with `cloudAgentSafe: false` — verified by the Cloud-Agent-safe assertion test scanning for `notification`, `permissionRequest`, `errorOccurred`, and `powershell` keys.
- [ ] Output schema validates against GitHub Copilot's documented hook-config shape (`version`, `hooks` object, per-entry `type`/`bash`/`cwd`/`matcher`/`timeoutSec`).
- [ ] No new entries added to `package.json` `dependencies` or `devDependencies`.
- [ ] All quality gates pass (`npm test`).
- [ ] No constitutional violations introduced.
