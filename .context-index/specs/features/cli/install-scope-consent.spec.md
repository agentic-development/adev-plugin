<!-- partial_schema: spec@1 -->

---
charter: cli
kind: behavioral
status: draft
risk_level: high
revision: 2
charter-revision: 4
created: 2026-08-14
updated: 2026-08-14
source-manifest:
  files:
    - cli/index.mjs
    - providers/claude-code/adapter.mjs
    - tests/cli-install-scope.test.mjs
drift_detected: true
---

# Live Spec: Install Scope Consent

## Behavioral Contract

`adev install` asks the user whether to install for all projects (`user`) or only the current one (`project`). Today that prompt is cosmetic for the `project` answer: the plugin has already been enabled machine-wide before the question is asked, and nothing revokes it afterward.

This spec defines the contract the installer must honor: **no scope-bearing write happens before the scope answer is collected, and the answer is honored end to end.**

Risk level is `high` because the defect writes to files outside the project (`~/.claude/settings.json`, `~/.claude/plugins/installed_plugins.json`) and the fix changes install ordering for every user.

### Current behavior (verified 2026-08-14 against `cli/index.mjs`)

The `claude-code` branch of `installProviders()` (`cli/index.mjs:606-615`):

1. `await provider.install()` — called with **no opts**. `providers/claude-code/adapter.mjs:53` defaults `scope = "user"` and line 85 calls `this.enable(scope)`, writing `enabledPlugins["adev@agentic-development"] = true` into `~/.claude/settings.json`.
2. Only then does line 613 ask `"Install for all projects (user) or this project only (project)?"`.
3. Line 614 calls `provider.enable("project")`, which writes `<cwd>/.claude/settings.json` — but nothing removes the user-scope entry from step 1.

The `codex` branch (`cli/index.mjs:668-678`) already has the correct shape: it asks first, then passes `provider.install({ scope: targetScope })`. **The in-repo precedent is the target design**, not a new invention.

The `cursor` branch (`cli/index.mjs:680`) hardcodes `scope: "user"` with no prompt at all.

## Acceptance Criteria

1. **When** the user runs `adev install` and selects the `claude-code` provider, **then** the scope prompt is presented **before** any call to `provider.install()`, and the collected answer is passed as `provider.install({ scope })`.

2. **When** the user answers `project`, **then** `~/.claude/settings.json` gains no `enabledPlugins` entry for `adev@agentic-development` — verified by asserting the file is byte-identical to its pre-install content (or still absent).

3. **When** the user answers `project`, **then** `<cwd>/.claude/settings.json` contains the `enabledPlugins` entry.

4. **When** the user answers `user`, **then** behavior is unchanged from today: `~/.claude/settings.json` carries the entry.

5. **When** either answer is given, **then** `~/.claude/plugins/installed_plugins.json` records the scope the user actually chose. `updateRegistry()` currently hardcodes `scope: existing?.scope || "user"` (`adapter.mjs:99-117`) and must instead receive and persist the chosen scope.

6. **When** a user who previously installed at `user` scope re-runs `adev install` and answers `project`, **then** the pre-existing user-scope entry is **removed**. (Operator decision, 2026-08-14. "Warn and leave it" was the other candidate and was rejected: it leaves the machine in exactly the state the operator declined.) Removal is surgical — only adev's own key is deleted, and other plugins' entries are untouched.

7. **When** `adev install --target cursor` runs, **then** the hardcoded `scope: "user"` is either replaced by the same prompt or documented in the charter as intentional. This spec does not mandate which; it mandates that the choice stops being implicit.

8. Both the install and upgrade paths are covered by tests that assert on the *filesystem outcome* (which settings file gained the entry), not on the return value of `enable()`.

## Explicitly Out of Scope

- **`extraKnownMarketplaces`** (`adapter.mjs:138-172`) also writes user-level state. Whether a `project`-scoped install may still write it is a real question, but a marketplace registration is not a per-project enablement and conflating the two would widen this spec past the consent defect. Decide it separately; if the fix touches that code path, say so explicitly in the PR.

- ~~**The domain-extension picker**~~ — **RESOLVED, no longer out of scope.** This was deferred when the spec was written, on the reasoning that lifecycle placement is a different blast radius. A prompt audit of the whole install path then found two more prompts writing context-layer configuration (the sync-target chooser and provenance enforcement), which made the three a single boundary problem rather than one stray call. All three moved to `/adev:init` together. The general rule now lives in `installer-consent-boundary.spec.md` AC-4/AC-5; this spec keeps only the scope-consent behavior.

- **Git-hook chaining** (`adev-plugin-sewt`) shares the "installer acts without consent" theme but touches `setupGitHooks()` and the generated wrapper, with no overlap in the files above. Both are now governed by the shared contract in `installer-consent-boundary.spec.md`, which states the rule this spec is one instance of.

## Verification

Tests live in `tests/cli-install-scope.test.mjs` and must run against a temp `HOME` so a test run cannot touch the developer's real `~/.claude/`. The existing helpers in `tests/helpers.mjs` (`createTempDir`, `cleanupTempDir`) provide the directory isolation.

The seam is `getClaudeHome()` at `providers/claude-code/adapter.mjs:31`, which resolves `join(process.env.HOME || process.env.USERPROFILE, ".claude")`. There is **no** dedicated env override, so tests must set `process.env.HOME` to a temp dir and restore it afterward. If the fix finds that too blunt, introducing an explicit override (e.g. `ADEV_CLAUDE_HOME`) is acceptable and in scope — but a test that runs against the real `$HOME` is not, since AC-2 asserts on the absence of a write to the developer's own settings file.

A test that asserts only "no error thrown" does not satisfy AC-2: the criterion is about a file that must **not** change, so the assertion must read that file.
