---
charter: cursor-provider
kind: behavioral
status: implemented
risk_level: medium
milestone:
revision: 2
charter-revision: 3
created: 2026-05-18
updated: 2026-05-18
source-manifest:
  sha: "c8c4d2f"
  files:
    - cli/index.mjs
    - providers/cursor/adapter.mjs
    - tests/provider/cursor-adapter.test.mjs
  computed-at: "2026-07-03T22:27:11.424Z"
---

# Behavioral Spec: CursorAdapter with Skill Name Sanitization

<!-- Spec B from the cursor-provider charter's 5-spec grouping.
     Covers two tightly-coupled capabilities (the adapter shape and the
     skill-name sanitization it performs at install time).
     Depends on Spec A (provides .cursor-plugin/plugin.json) and Spec C
     (provides providers/cursor/hooks.json) — both are already in place
     on this branch via the merge base.
     Parent Charter: .context-index/specs/features/cursor-provider/charter.md -->

## Behavioral Contract

The CursorAdapter is the fourth peer in `providers/` (alongside `claude-code`, `opencode`, `codex`). It exports a `CursorAdapter` object with the same shape as `OpenCodeAdapter` and the same install/uninstall/detect surface.

- **When** the CLI invokes `CursorAdapter.install({ scope: "user" })` **then** the adapter creates `~/.cursor/plugins/local/adev/` (if absent), copies the plugin tree into it (excluding `.git`, `node_modules`, `.DS_Store`), and publishes sanitized skill directories under `~/.cursor/skills/` per Cursor docs.
- **When** the adapter copies the plugin tree **then** it includes the artifacts produced by Spec A (`.cursor-plugin/plugin.json`) and Spec C (`providers/cursor/hooks.json`) so Cursor recognizes the plugin and applies its hooks on next session.
- **When** the adapter publishes a skill whose source-tree directory is `skills/<name>/` and SKILL.md frontmatter declares `name: adev:<name>` **then** a new directory `~/.cursor/skills/adev-<name>/` is created containing a copy of SKILL.md with frontmatter `name: adev-<name>` (colon sanitized to hyphen). Other skill assets (templates, helper scripts) are copied verbatim into the same directory. The source tree under `skills/` is never modified — the sanitization runs at publish time only.
- **Rationale (intentionally not symlinked):** Cursor requires the skill directory name to match the sanitized `name:` field. Because the source directory is `skills/<name>/` (unsanitized) and the target is `~/.cursor/skills/adev-<name>/` (sanitized), the dirname diverges and a symlink cannot satisfy Cursor's directory-name invariant. The adapter MUST publish a copy, not a symlink.
- **When** the adapter is invoked with `CursorAdapter.install({ scope: "user" })` a second time **then** the install is idempotent: existing cache dir → return `{ installed: false, path: cacheDir }` without re-copying or re-publishing.
- **When** the adapter is invoked with `CursorAdapter.uninstall()` **then** the plugin cache directory and all sanitized skill directories under `~/.cursor/skills/adev-*/` are removed; other directories under `~/.cursor/` are otherwise untouched.
- **When** `CursorAdapter.detect()` is called **then** it returns `true` if `process.env.CURSOR === "true"` or `~/.cursor/` exists; `false` otherwise.
- **When** `CursorAdapter.detectConflicts()` is called **then** it returns an array of `{ name, reason }` for any conflicting plugins found in `~/.cursor/config.json:plugins`. v1 carries the same Superpowers conflict guard as the OpenCode adapter.

## Preconditions

- Plugin tree has `.cursor-plugin/plugin.json` (Spec A) and `providers/cursor/hooks.json` (Spec C). Both exist on the merge base for this branch.
- Node `>= 18` (per `package.json:engines`).
- HOME env var resolvable; `~/.cursor/` may or may not exist before install.

## Postconditions

- `~/.cursor/plugins/local/adev/` contains a complete plugin tree copy after a successful install.
- `~/.cursor/skills/adev-<name>/` exists as a regenerated directory (not a symlink) for every skill in `skills/` with a SKILL.md. The directory contains a sanitized SKILL.md and verbatim copies of all sibling files.
- Every sanitized skill's SKILL.md frontmatter `name:` field is `adev-<name>` (no colons), and the parent directory name matches per Cursor's docs.
- Uninstall reverses both the plugin copy and the published skill directories; running install again from the post-uninstall state is functionally equivalent to a first install.

## Error Cases

| Condition | Adapter Behavior | Status |
|---|---|---|
| HOME env unset on POSIX | Fall back to `process.env.USERPROFILE`; if both unset, throw `Error("HOME or USERPROFILE must be set to resolve Cursor plugin path")` | n/a (throw) |
| Skill source `SKILL.md` has no `name:` frontmatter | Skip that skill silently (preserves opencode adapter behavior); do not throw | n/a |
| Skill source `name:` is already in `adev-<x>` form | Pass through unchanged (sanitization is idempotent) | n/a |
| Skill publish fails on a single skill (e.g., read-only FS, sibling-file copy error) | Catch and continue; record the failed skill in install report; do not abort the other publishes | n/a (logged best-effort) |
| Existing cache dir at `~/.cursor/plugins/local/adev/` | Return `{ installed: false, path: cacheDir }` without overwriting | n/a |
| `~/.cursor/` does not exist on uninstall | No-op silently — uninstall is idempotent | n/a |

## Constitution Reference

- **Principle 1: Minimize external dependencies** — adapter uses only Node built-ins. Prefer `fs.cpSync` (Node 16.7+) for recursive copy over shelling to `cp -r` (the OpenCode adapter still uses `child_process` for historical reasons; the new CursorAdapter does not need that legacy). No new external dependencies.
- **Principle 2: Skills are primarily markdown** — sanitization scope is strictly the SKILL.md YAML frontmatter (the block delimited by leading `---` lines). The frontmatter parser MUST NOT touch the body of SKILL.md; only the `name:` field within the frontmatter is rewritten. Any colon appearing in the body (code examples, prose) is preserved verbatim.
- **Principle 3: Pure ESM** — adapter is `.mjs` with ESM `import` syntax.
- **Anti-pattern "No hardcoded paths to `~/.claude/`"** — adapter introduces `getCursorHome()` returning `~/.cursor/plugins/local/adev` and `getCursorSkillsDir()` returning `~/.cursor/skills`. No claude-path references.
- **Architecture Boundary: Autonomous lane** — does NOT change the hook protocol, CLI install path structure, or plugin registration format. Adds a fourth provider behind the existing provider-adapter contract. Sits in the Autonomous lane.

## Actionable Task Map (preliminary)

| # | Task | Notes |
|---|---|---|
| 1 | `providers/cursor/adapter.mjs` skeleton | Constants (`PLUGIN_ROOT`, `PLUGIN_VERSION`, `getCursorHome`, `getCursorSkillsDir`, `getPluginCacheDir`); exports `CursorAdapter` with `name`, `pluginRoot`, `version`, `getAgentFile()` |
| 2 | `install()` — copy plugin tree | Idempotency check, `ensureDir`, `fs.cpSync` with filter excluding `.git`/`node_modules`/`.DS_Store`; skill publish call |
| 3 | `publishSkillsFromCache()` with sanitization | For each skill dir with SKILL.md: parse the YAML frontmatter (strictly between leading `---` lines), rewrite `name: adev:<x>` → `name: adev-<x>` in the frontmatter only, write the sanitized SKILL.md plus verbatim copies of sibling files into `~/.cursor/skills/adev-<x>/`. Pure copy operations — no symlinks (the source dirname `<x>` and target dirname `adev-<x>` differ, so a symlink cannot satisfy Cursor's directory-name invariant). |
| 4 | `uninstall()` — remove plugin + published skills | Iterate `~/.cursor/skills/adev-*/` and remove each; remove the plugin cache dir. Idempotent — missing dirs are no-ops. |
| 5 | `detect()` and `detectConflicts()` / `disableConflictingPlugin()` | Read `~/.cursor/config.json`; v1 Superpowers guard |
| 6 | Register CursorAdapter in CLI dispatch | Add to `cli/index.mjs` provider selection (existing pattern); deferred to Spec D for the full `--provider cursor` plumbing — Spec B just makes the adapter loadable |
| 7 | Tests — `tests/provider/cursor-adapter.test.mjs` | Mirror `tests/provider/claude-code-adapter.test.mjs` shape: install, uninstall, idempotency, sanitization (`adev:init` → `adev-init`), `.cursor-plugin/plugin.json` present in cache, `providers/cursor/hooks.json` present in cache, conflict detection |

## Acceptance Criteria

- [ ] `providers/cursor/adapter.mjs` exists and exports `CursorAdapter` with `name`, `pluginRoot`, `version`, `getAgentFile()`, `install()`, `uninstall()`, `detect()`, `detectConflicts()`, `disableConflictingPlugin()`
- [ ] `CursorAdapter.install({ scope: "user" })` creates `~/.cursor/plugins/local/adev/` with a complete plugin tree, including `.cursor-plugin/plugin.json` (Spec A) and `providers/cursor/hooks.json` (Spec C)
- [ ] Every linked skill at `~/.cursor/skills/adev-<name>/` has SKILL.md frontmatter `name: adev-<name>` (no colons)
- [ ] Re-running `install()` is idempotent: no duplicate writes, returns `{ installed: false }` on second call
- [ ] `CursorAdapter.uninstall()` removes the plugin dir and all sanitized skill directories under `~/.cursor/skills/adev-*/`; running install again after uninstall produces the same state as a first install
- [ ] `CursorAdapter.detect()` returns `true` on `CURSOR=true` env OR existing `~/.cursor/` directory; `false` otherwise
- [ ] `CursorAdapter.detectConflicts()` returns the Superpowers conflict when `~/.cursor/config.json:plugins` contains it
- [ ] Sanitization scope is the SKILL.md YAML frontmatter only — colons in the SKILL.md body are preserved verbatim
- [ ] `tests/provider/cursor-adapter.test.mjs` covers install, uninstall, idempotency, sanitization (frontmatter-only scope verified), manifest+hooks presence, conflict detection
- [ ] No hardcoded paths to `~/.claude/`; no new external dependencies; pure ESM; uses `fs.cpSync` rather than shelling out to `cp -r`
- [ ] `npm test` passes with the new tests
- [ ] Charter Capability Map: rows for `CursorAdapter install/uninstall/status` and `Skill name sanitization` flip from `—` to `validated` after this spec lands
