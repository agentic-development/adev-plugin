# `lib/providers/copilot/` — adapter helpers and convention notes

This directory hosts the pure helpers consumed by `providers/copilot/adapter.mjs`:

| Module | Responsibility |
|---|---|
| `skill-validator.mjs` | NFC + regex + frontmatter checks; returns Copilot-conformant directory names. |
| `symlink-scanner.mjs` | Pre-copy recursive symlink rejection (defense-in-depth alongside `cpSync({ dereference: false })`). |
| `hook-config-rewriter.mjs` | Rewrites both absolute `pluginRoot/hooks/*.sh` and `${CLAUDE_PLUGIN_ROOT}/hooks/*.sh` substrings to `./scripts/<name>.sh`. |

## Argument convention: `opts.projectRoot` + `opts.user` (not `opts.scope`)

The Copilot adapter's `install` / `uninstall` / `status` functions take `{ projectRoot, dryRun?, user?, force? }` — **not** the `{ scope: "user" | "project" }` shape used by every other peer adapter (`ClaudeCodeAdapter`, `OpenCodeAdapter`, `CodexAdapter`). This is principled, not accidental, and future adapters should follow whichever convention fits their substrate:

- **Peer adapters are user-scoped by design.** Claude Code installs to `~/.claude/plugins/cache/…`, OpenCode to `~/.config/opencode/plugins/…`, Codex to `~/.codex/…`. The plugin home lives outside any consuming project, so `scope: "user" | "project"` makes sense — the toggle picks between user-home and the in-project mirror.

- **Copilot has no plugin home.** GitHub Copilot's customization surface is `.github/skills/`, `.github/hooks/`, and the various `.github/*.md` instruction files — all repo-local by design. There is no user-home location that Copilot reads from canonically. We expose `projectRoot` because the install target IS the project root, and `user: true` as an opt-in mirror to `~/.copilot/` for operators who want personal-scope coverage across all repos (a convenience, not a Copilot-mandated surface).

A `scope: "project"` value on a Copilot adapter would be redundant (the project IS the only first-class target), and `scope: "user"` would lie about Copilot's runtime model. Taking `projectRoot` + `user` explicitly avoids both confusions.

## Operator-facing implication

The CLI surface — `adev install --target copilot [--user] [--dry-run]` — reflects this divergence directly: the `--target` flag picks the adapter, and `--user` opts into the mirror. Peer adapters surface `scope` via the interactive provider-selection prompts (`Install for all projects (user) or this project only (project)?`). The Copilot path is non-interactive by design.

## When extending

If you add a sixth peer adapter, choose the convention based on the substrate, not on consistency with the others. Document the choice here when it diverges.
