---
charter: cursor-provider
kind: skill
status: validated
risk_level: medium
milestone:
revision: 1
charter-revision: 3
created: 2026-05-19
updated: 2026-05-19
source-manifest:
  sha: "181f1f4"
  files:
    - .context-index/specs/features/cli/charter.md
    - cli/index.mjs
    - tests/cli.test.mjs
  computed-at: "2026-05-19T12:33:18.188Z"
drift_detected: true
---

# Skill Spec: CLI install integration

<!-- Spec D from the cursor-provider charter's 5-spec grouping.
     Wires the already-loadable CursorAdapter (Spec B) into the `adev install`
     CLI dispatch and updates the cli charter's install verb description to
     name Cursor in the provider list. Covers two capabilities from the
     Capability Map: "CLI install integration" and "CLI charter revision".
     Parent Charter: .context-index/specs/features/cursor-provider/charter.md
     Sibling specs (already implemented on this branch):
       - hook-config-generator.spec.md (Spec A)
       - cursor-adapter.spec.md         (Spec B)
       - plugin-manifest-and-parity.spec.md (Spec C) -->

## Invocation Modes

`adev install` is a top-level legacy CLI verb (`cli/index.mjs::cmdInstall`). Two invocation paths exist today and both must learn about Cursor:

1. **Interactive menu** — when no `--provider <name>` flag is passed, `cmdInstall` prints a numbered provider menu and reads a number from stdin (`selectProvidersInteractive` at `cli/index.mjs:80-104`). The menu currently offers 6 options across the three legacy providers. After this spec, the menu MUST include Cursor as a standalone option, and the "all providers" entry expands to cover all four.
2. **Flag-driven** — when one or more `--provider <name>` flags are passed (`parseProviderArgs` at `cli/index.mjs:55-72`), names are validated against `getProviderNames()` from `lib/provider/registry.mjs`. `cursor` already appears in that registry from Spec B, so the validator accepts `--provider cursor` today. The dispatch in `installProviders()` is where integration is currently incomplete: the loop's `if/else if` chain has no `cursor` branch and silently no-ops on a Cursor name.

Charter prose phrases this as "`adev install` accepts `cursor` as a target". The implementation flag is `--provider <name>`; "target" is charter-level vocabulary for the value passed to that flag.

## Arguments

| Argument | Required | Description |
|---|---|---|
| `--provider <name>` | No | One of `claude-code`, `opencode`, `codex`, `cursor`. Repeatable. When omitted, the interactive menu is shown. Validated against `getProviderNames()`; unknown names exit with a non-zero status and an `Unknown provider:` error. Strict-on-write: the validator already rejects unknown names; this spec does not change that contract. |

No new flags are introduced. This spec activates an existing flag value (`cursor`) that the registry already exposes.

## Output Contract

When `adev install --provider cursor` runs (or the user selects Cursor through the interactive menu), `installProviders()` MUST:

1. Resolve the adapter via `getProvider("cursor")` (already returns `CursorAdapter` per `lib/provider/registry.mjs`).
2. Print the heading `Installing for ${provider.name}` (existing pattern; `provider.name` comes from the adapter).
3. Call `CursorAdapter.install({ scope: "user" })` per the Spec B contract. The adapter copies the plugin tree into `~/.cursor/plugins/local/adev/` and publishes sanitized skills into `~/.cursor/skills/adev-*/`. The CLI reports `Plugin v${PLUGIN_VERSION} installed to ${path}` on first install, or `Plugin v${PLUGIN_VERSION} already installed` when the adapter returns `{ installed: false }` (idempotency).
4. Run `provider.detectConflicts()` and interactively prompt to disable each conflicting plugin, mirroring the `claude-code` branch in `installProviders()`. The Cursor adapter's Superpowers guard is the v1 conflict source.

The interactive menu MUST surface Cursor explicitly. Each menu entry continues to map to a `string[]` of provider names returned from `selectProvidersInteractive`. The "all providers" entry returns `["claude-code", "opencode", "codex", "cursor"]`.

The cli charter MUST be bumped from `revision: 3` to `revision: 4`. The `install` command description under `## Commands` (currently `Register plugin with provider (Claude Code, OpenCode, Codex), …`) MUST replace the parenthetical with `(Claude Code, OpenCode, Codex, Cursor)`. The JSDoc header comment `* Install providers (Claude Code, OpenCode, Codex).` above `installProviders()` in `cli/index.mjs` MUST be updated in lockstep.

Charter capability map rows `CLI install integration` and `CLI charter revision` flip from `—` to `validated` after `/adev:validate` passes.

## Failure Modes

| Condition | Skill Behavior | User Recovery |
|---|---|---|
| User passes `--provider cursor` on a system without `~/.cursor/` and without `CURSOR=true` | Install proceeds; `CursorAdapter.install` creates `~/.cursor/plugins/local/adev/` as needed (no detection gating on install). | n/a — install is intended to work pre-Cursor too; opening Cursor later picks up the local plugin. |
| User passes `--provider cursor` and answers `no` to the conflict-disable prompt | Conflict left in place; install completes with a `warn` message. | Re-run after disabling conflict manually, or accept the warning. |
| `CursorAdapter.install` throws (e.g., HOME and USERPROFILE both unset) | Error surfaces with the adapter's thrown message; the dispatcher's enclosing `try/catch` in `cmdInstall` produces a non-zero exit. | Set HOME (or USERPROFILE on Windows) and retry. |
| User selects the menu's "all providers" option but Cursor install fails mid-run | Earlier providers remain installed; the loop exits at the failing provider with a non-zero status. | Re-run with `--provider cursor` after addressing the cause. |
| User passes `--provider cursor` twice (`--provider cursor --provider cursor`) | The second pass is idempotent per Spec B; `installed: false` is reported, no double-write. | n/a — idempotent by design. |
| User passes `--provider unknown` (any unknown name) | Existing `parseProviderArgs` validator exits with `Unknown provider:`; unchanged by this spec. | Re-run with a valid `--provider` name. |

## System Constitution Reference

- **Principle 2: Skills are primarily markdown** — applies inversely. `cmdInstall` is a legacy CLI command, not a `/adev:*` skill, so this spec does not author SKILL.md changes. The work is a code branch + a charter description revision.
- **Architecture Boundary — "Adding new skills to the lifecycle order" (Requires Human Approval)** — does NOT apply. This spec adds a provider branch behind an existing dispatcher, not a new lifecycle skill. Sits in the **Autonomous lane** per the constitution's Boundaries section.
- **Architecture Boundary — "Changing the CLI installation path structure" (Requires Human Approval)** — does NOT apply. The Cursor install path (`~/.cursor/plugins/local/adev`) is owned by `CursorAdapter` (Spec B) and is parallel to the existing claude-code/opencode/codex install paths. No restructuring.
- **Anti-pattern "No hardcoded paths to `~/.claude/`"** — applies. The `cursor` branch MUST resolve Cursor paths via `CursorAdapter`'s `getCursorHome()` / `getCursorSkillsDir()` helpers (already implemented in Spec B). No direct `~/.cursor/` string literals are introduced in `cli/index.mjs`.
- **Principle 1: Minimize external dependencies** — applies. No new dependencies; uses existing `ask`/`success`/`warn` helpers and the already-imported `getProvider`.

## Actionable Task Map (preliminary)

| # | Task | Notes |
|---|---|---|
| 1 | Add `cursor` branch to `installProviders()` in `cli/index.mjs` | Mirror the `claude-code` branch shape: `install({ scope: "user" })`, `detectConflicts()`, interactive disable prompt. Reuse `success` / `warn` / `ask` / `heading` helpers. |
| 2 | Extend `selectProvidersInteractive()` menu | Add a standalone Cursor entry; ensure the "all providers" entry returns the four-element list. Renumber entries as needed; keep prior numeric mappings stable for users who pasted defaults from docs. |
| 3 | Update `installProviders()` JSDoc comment | `* Install providers (Claude Code, OpenCode, Codex).` → `* Install providers (Claude Code, OpenCode, Codex, Cursor).` |
| 4 | Bump cli charter to rev 4 | Update frontmatter `revision: 3 → 4` and `updated:` to landing date; rewrite the `install` command description in `## Commands` to name Cursor. |
| 5 | Tests — `tests/cli.test.mjs` | Add coverage for `--provider cursor` flag path: registry resolution, adapter `install` call via a stubbed HOME, idempotency on a second run, conflict-detect prompt code path. Existing tests for the three legacy providers must continue to pass. |
| 6 | Flip Capability Map rows | After `/adev:validate` passes, charter rows `CLI install integration` and `CLI charter revision` move from `—` to `validated`. |

## Acceptance Criteria

- [ ] `cli/index.mjs::installProviders` contains a `cursor` branch that calls `CursorAdapter.install({ scope: "user" })`, prints the standard `Plugin v… installed` / `already installed` message, and runs the conflict-detection prompt loop using the existing helpers.
- [ ] `cli/index.mjs::selectProvidersInteractive` menu offers a standalone Cursor entry and the "all providers" entry returns `["claude-code", "opencode", "codex", "cursor"]`.
- [ ] `cli/index.mjs::installProviders` JSDoc comment names all four providers.
- [ ] `.context-index/specs/features/cli/charter.md` is on `revision: 4` with `updated:` set to the spec landing date; the `install` command description names Cursor in the provider list.
- [ ] `tests/cli.test.mjs` (or a new sibling file) covers `--provider cursor` end-to-end: registry lookup, adapter `install` call against a temp HOME, idempotency on a second run, and the conflict-detect prompt path.
- [ ] `npm test` passes.
- [ ] No new external dependencies; ESM only; no hardcoded `~/.cursor/` literals introduced in `cli/index.mjs` (paths come from `CursorAdapter`).
- [ ] Charter Capability Map rows for `CLI install integration` and `CLI charter revision` flip from `—` to `validated` after `/adev:validate` passes.
