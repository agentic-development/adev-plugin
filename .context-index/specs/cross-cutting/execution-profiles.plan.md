# Implementation Plan: Execution Profiles

> **Methodology:** adev
> **Spec:** .context-index/specs/cross-cutting/execution-profiles.spec.md
> **Review:** PASS_WITH_NOTES (2026-04-19)
> **Platform:** JavaScript (ESM), Node.js, npm, node:test

**Goal:** Build a zero-dep cross-cutting primitive (`lib/profiles/`) that resolves named execution profiles (tool permissions, env vars, model tier, redaction) for subagent dispatch, consumable by review/validate in a follow-up spec.

**Architecture:** Pure-data loader that merges bundled defaults with project overrides, resolves `extends` chains, validates schema, and hands off to a harness-specific adapter. Redaction is a single pipeline stage wrapping all captured bytes. Env resolution is consumer-repo-local with `$workspace/` opt-in. Zero new dependencies.

---

## File Structure

**Create:**
- `lib/profiles/index.mjs` — public API (`loadProfiles`, `resolveProfile`, `getEffectivePosture`)
- `lib/profiles/yaml.mjs` — minimal YAML parser covering the profile schema (maps, lists, flow objects)
- `lib/profiles/schema.mjs` — schema validation (categories, env shape, tool entries, wildcards rejected)
- `lib/profiles/extends.mjs` — extends-chain resolution (cycle guard, depth limit, allow vs allow_add semantics, broadening WARN)
- `lib/profiles/env.mjs` — dotenv parse, bare vs `optional:` handling, `$workspace/` resolution, allowlist filtering
- `lib/profiles/redaction.mjs` — redaction pipeline + stream buffering + shared-value disambiguation + min-length gate
- `lib/profiles/tool-categories.mjs` — seed category registry loader + validation
- `lib/profiles/adapters/claude-code.mjs` — Claude Code adapter (6 categories + audited channels export)
- `lib/profiles/adapters/opencode.mjs` — OpenCode adapter (4 categories + unsupported list)
- `templates/governance/profiles.yaml` — bundled default profiles (6 profiles)
- `templates/governance/tool-categories.yaml` — seed category registry
- `tests/profiles/schema.test.mjs`
- `tests/profiles/extends.test.mjs`
- `tests/profiles/env.test.mjs`
- `tests/profiles/redaction.test.mjs`
- `tests/profiles/adapters.test.mjs`
- `tests/profiles/index.test.mjs` (loader + integration)

**Modify:**
- `package.json` + `.claude-plugin/plugin.json` — version bump to 0.18.0 (parity invariant)

**Reference (read, do not modify):**
- `.context-index/specs/cross-cutting/execution-profiles.spec.md` — the contract
- `lib/workspace.mjs` — for `detectWorkspace` pattern + simple YAML parse style
- `lib/source-manifest.mjs` — for ESM style, JSDoc conventions

---

## Task Ordering

Order: data foundation → pure logic → env/workspace integration → adapter layer → public API → tests-as-we-go.

### Task 1: Bundled YAML + YAML parser
- Create `templates/governance/profiles.yaml` (6 profiles).
- Create `templates/governance/tool-categories.yaml` (6 seed categories).
- Create `lib/profiles/yaml.mjs` — parser supporting: nested maps, top-level list under a key, inline flow objects (`{ key: value, key: value }`), lists of strings, quoted strings, comments.
- Tests: `tests/profiles/yaml.test.mjs` (or fold into schema tests).

### Task 2: Schema validation
- `lib/profiles/schema.mjs` exports `validateProfile(name, raw)` and `validateAll(profiles)`.
- Enforce: tool entries are `{category}` / `{mcp_server}` / `{tool, allow_unportable: true}` only; reject wildcards; reject `allow` + `allow_add` mix; required fields present.
- Tests: `tests/profiles/schema.test.mjs`.

### Task 3: Extends chain resolution
- `lib/profiles/extends.mjs` exports `resolveEffective(name, profiles)`.
- Cycle detection; depth limit 16; union for `allow_add`; replace for `allow`; per-field overrides for `filesystem`, `network`, `model`, `limits`; `env.files` child-replaces; `env.allow` unions with `required`-wins.
- Emit broadening WARNs via returned `warnings` array.
- Tests: `tests/profiles/extends.test.mjs`.

### Task 4: Env resolution
- `lib/profiles/env.mjs` exports `resolveEnv(profile, { consumerRepoRoot, workspaceRoot })`.
- Parse each `env.files` entry: `optional:` prefix → silent-skip-on-absent; bare → require-exist-or-fail.
- Parse `$workspace/<rest>` → workspace root; reject `@` prefix; reject absolute.
- Dotenv parse (comment-safe, quoted-value-safe).
- Enforce allowlist; record contributing file per key; return `{ env, contributing, warnings }`.
- Tests: `tests/profiles/env.test.mjs`.

### Task 5: Redaction pipeline
- `lib/profiles/redaction.mjs` exports `createRedactor(redactionSet)`.
- Redactor has `redact(buffer)` (exact-substring + min 8 chars + shared-value disambiguation) and `createStream()` (lookback buffer sized to longest value).
- Tests: `tests/profiles/redaction.test.mjs`.

### Task 6: Tool category registry
- `lib/profiles/tool-categories.mjs` exports `loadCategories(repoRoot)` reading `templates/governance/tool-categories.yaml` from plugin root + `.context-index/tool-categories.yaml` overlay (optional).
- Validates entries against seed + documents unknown categories with WARN.

### Task 7: Claude Code adapter
- `lib/profiles/adapters/claude-code.mjs` exports `prepareForDispatch(effectiveProfile, { redactor, env, mcpAvailable })`, `IMPLEMENTED`, `UNSUPPORTED`, `AUDITED_CHANNELS`, `capabilities`.
- Maps categories → Claude Code tool names per spec's "Tool Categories Seed (v1)" table.

### Task 8: OpenCode adapter
- `lib/profiles/adapters/opencode.mjs` — 4 implemented, 2 unsupported.

### Task 9: Public API
- `lib/profiles/index.mjs` exports `loadProfiles`, `resolveProfile`, `getEffectivePosture`.
- Wires schema + extends + env + redaction + adapter.

### Task 10: Integration tests
- `tests/profiles/index.test.mjs` — end-to-end: bundled defaults load, project overlay wins, MCP missing fails, required-env missing fails, redaction round-trip.

### Task 11: Version bump + commit
- Bump `package.json` and `.claude-plugin/plugin.json` to 0.18.0 (parity).
- Commit; run `npm test`; push.

---

## Acceptance Criteria Mapping

| AC | Task |
|----|------|
| Bundled defaults load with no warnings | 1, 9 |
| Project profile replaces bundled default + info note | 9 |
| `extends` cycle fails load | 3 |
| `allow`/`allow_add` union, replace, and mix rules | 3 |
| MCP missing → load fail | 9 |
| Unknown category → WARN | 6, 2 |
| Required env missing → load fail | 4 |
| Optional env silently absent | 4 |
| Allowlist-absent key never in resolved env | 4 |
| `$workspace/` resolves via workspace root; absent workspace fails | 4 |
| `@<prefix>/` rejected with grammar-disjoint message | 4 |
| Spec-location-wins env resolution | 4, 9 |
| Workspace profiles.yaml ignored with note | 9 |
| Env values not in prompt text | 7 (adapter design), 10 (assertion) |
| Tool stdout redacted | 5, 7, 10 |
| Pipeline covers all audited channels | 5, 7 (adapter contract) |
| 8-char minimum length WARN | 5, 4 |
| Streaming lookback redacts cross-chunk | 5 |
| Bypass classes documented (spec-level; non-executable AC) | N/A — spec documents |
| Bare vs `optional:` behavior | 4 |
| Contributing file per key | 4 |
| `{category: "*"}` rejected | 2 |
| `{tool}` without `allow_unportable` fails | 2 |
| `allow_add` broadening WARN | 3 |
| Claude Code implements 6, OpenCode implements 4 | 7, 8 |

---

## Quality Gates

- [ ] `npm test` passes
- [ ] No new external dependencies
- [ ] Version bumped in `package.json` + `.claude-plugin/plugin.json` (parity)
