[adev docs](README.md) > Providers > Copilot

# Smoke-install verification: GitHub Copilot adapter

This procedure verifies that `CopilotAdapter` materializes a working customization surface in a consuming project's `.github/` tree and that Copilot's runtime picks it up. It is a manual checklist — the automated test suite (`tests/copilot-adapter*.test.mjs`) covers the same behaviors against synthetic fixtures; this document covers the live integration.

## Prerequisites

- Node.js 20+ available on `PATH`.
- A git working tree at `<projectRoot>` you don't mind mutating (a freshly-cloned fixture or a scratch repo).
- The GitHub Copilot CLI installed: `npm install -g @github/copilot` (see [Copilot CLI install reference](https://docs.github.com/en/copilot/github-copilot-in-the-cli)).

## Steps

1. **Install the adapter into the fixture.**

   ```bash
   cd <projectRoot>
   # If running from a local adev-plugin checkout:
   node /path/to/adev-plugin/cli/index.mjs install --target copilot
   # Or via npx once published:
   npx @adev-org/adev-cli install --target copilot
   ```

   Confirm the success line: `Copilot adapter v<version> installed at <projectRoot>/.github`.

2. **Inspect the materialized surface.**

   ```bash
   ls .github/
   #   skills/  hooks/  .adev-copilot-install.json
   ls .github/skills/         # one dir per adev skill
   cat .github/hooks/hooks.json | head
   ls -l .github/hooks/scripts/  # executable .sh files
   ```

   Verify:
   - `.github/skills/` is populated (one subdir per adev skill, each containing `SKILL.md`).
   - `.github/hooks/hooks.json` exists. Grep for `${CLAUDE_PLUGIN_ROOT}` and absolute paths — there must be zero hits. Every script reference should be `./scripts/<name>.sh`.
   - `.github/hooks/scripts/*.sh` exist and have the executable bit set.
   - `.github/.adev-copilot-install.json` exists with `schemaVersion: 1` and lists the actual `skills`, `hookConfig`, and `hookScripts` arrays emitted in this run.

3. **Launch Copilot CLI inside the fixture.**

   ```bash
   copilot
   ```

   In the Copilot session:
   - Type `/skills` — at least one adev skill (e.g., `adev:init`, `adev:plan`) should appear in the list.
   - Type `/context` and confirm Copilot auto-discovers `AGENTS.md` (repo root) and `.github/copilot-instructions.md` (if present from `/adev:sync`).
   - For VS Code's Copilot Chat surface (not the CLI), `AGENTS.md` auto-load requires `chat.useAgentsMdFile` to be enabled in user/workspace settings.

4. **Run `status` to verify the documented shape.**

   ```bash
   node /path/to/adev-plugin/cli/index.mjs status --target copilot
   ```

   The output is a JSON object with `installed: true`, the actual `skillCount`, `hookConfigPresent: true`, and `syncOutputPresent.repoInstructions: true` if `/adev:sync` has run. The `agentsMd.autoLoadHint` field carries the literal advisory string about `chat.useAgentsMdFile`.

5. **Clean up.**

   ```bash
   node /path/to/adev-plugin/cli/index.mjs uninstall --target copilot
   ```

   Verify:
   - `.github/.adev-copilot-install.json` is gone.
   - `.github/skills/` is gone.
   - `.github/hooks/hooks.json` and `.github/hooks/scripts/*.sh` are gone.
   - `.github/copilot-instructions.md` (if it existed) is **preserved** — that file is owned by `/adev:sync`, not by the adapter.

## What this verifies

The canonical Behavior §9 checklist from `copilot-adapter.spec.md`:

- (a) `.github/skills/` is materialized.
- (b) `.github/hooks/hooks.json` is materialized with relative script paths only.
- (c) `.github/hooks/scripts/*.sh` are materialized and executable.
- (d) The Copilot CLI loads at least one adev skill from `.github/skills/`.
- (e) Copilot auto-discovers `AGENTS.md` and `.github/copilot-instructions.md`.

If any step above fails, re-run with `--dry-run` to see what would have been written, and check `.context-index/specs/features/copilot-provider/copilot-adapter.spec.md` Error Cases for the matching diagnostic.
