---
status: evolving
revision: 4
updated: 2026-05-19
---

# Feature Charter: CLI

## Purpose

ESM CLI binary at `cli/index.mjs` providing two surfaces: (1) **installation/management commands** (`install`, `upgrade`, `uninstall`, `init`, `extension`, `status`, `migrate`) that bootstrap and maintain the adev plugin in a project, and (2) the **lifecycle driver surface** — a Map-keyed verb dispatch table that routes `adev <verb>` to per-verb helper modules at `lib/cli/<verb>.mjs`, each following a uniform `run({ projectRoot, argv, manifest })` + `help()` + optional `LIFECYCLE_STEP` contract. The driver model (introduced in rev 3 per the `cli-driver-surface` charter) makes lifecycle helpers callable, testable, and grep-discoverable; SKILL.md prose names work via `adev <verb>` calls and helpers in `lib/cli/` do the work. All context-layer configuration (constitution, governance, persona, sync targets) remains in the `/adev:init` skill, not the CLI.

## Architecture

`cli/index.mjs` is the single binary entry point and the dispatcher. It does NOT contain per-verb implementation logic for new-pattern lifecycle helpers — those live in `lib/cli/<verb>.mjs`. Legacy installation/management commands (`cmdInstall`, `cmdUpgrade`, etc.) currently remain in `cli/index.mjs` as inline functions and are exposed through the same Map-keyed verb registry via thin adapter closures. Future revisions MAY extract those into `lib/cli/install.mjs` etc., but that migration is out of scope for rev 3; the constraint that previously required `cli/index.mjs` to be a single file is dropped.

### Verb Registry

A Map at the top of `cli/index.mjs` maps each verb name to a factory function that returns the verb's module (or an inline adapter for legacy commands):

```
['install',   () => ({ run: (_ctx) => cmdInstall(), help: () => cmdHelp('install') })],   // legacy adapter
['gate',      () => import('../lib/cli/gate.mjs')],                                       // new-pattern module
['diagnose',  () => import('../lib/cli/diagnose.mjs')],                                   // new-pattern module
...
```

Adding a new lifecycle verb is a two-line operation: create `lib/cli/<verb>.mjs` following the contract and add one line to the registry.

Legacy adapters implement the `.run` / `.help` surface but are exempt from the parameter contract below: the dispatcher always passes `{ projectRoot, argv, manifest }` to `run`, and legacy adapters discard it. New-pattern lifecycle helpers MUST honor the full contract.

### `lib/cli/<verb>.mjs` Module Contract

Each helper module exports:

- `run({ projectRoot, argv, manifest })` — async function returning a Promise. Receives the resolved project root, verb-args (slice of `process.argv` after the verb name), and parsed `manifest.yaml`.
- `help()` — function (no args) that prints the verb's help text to stdout. Mandatory.
- `LIFECYCLE_STEP?: string` — optional named export naming the lifecycle step the helper is bound to. When present, the pattern test (`tests/cli-driver-pattern.test.mjs`) AST-asserts that `requireGate(state, LIFECYCLE_STEP, ...)` is the first executable statement of `run`. Query primitives (e.g., `gate`, `diagnose`) do NOT export `LIFECYCLE_STEP`.

The dispatcher catches `GateError` (detected via `err.code === 'GATE_BLOCKED'`) from a helper's `run()` and converts it to exit code 2. Other exceptions exit with code 1. Successful runs exit 0.

## Commands

### Installation / management (legacy in-file commands)

- **`install`** — Register plugin with provider (Claude Code, OpenCode, Codex, Cursor, Copilot), scaffold minimal `.context-index/`, set up git hooks, stamp version. Exits early if adev is already installed, suggesting `upgrade` instead. The `--target <name>` flag invokes the per-target adapter directly (used by Copilot via `--target copilot [--user] [--dry-run]`), skipping interactive provider selection.
- **`upgrade`** — Detect installed version, compute upgrade delta, re-install providers, add missing scaffold files/templates, update git hooks, apply new config (provenance), stamp new version.
- **`uninstall`** — Remove plugin from selected providers.
- **`init`** — Backward-compat alias that routes to `install` or `upgrade` based on project state.
- **`extension`** — Install / list / uninstall content extensions (domain packs, etc.).
- **`status`** — Print installed adev version + verbosity summary; subcommand `status --render` invokes the markdown-rendering layer.
- **`migrate`** — One-shot tool to migrate legacy state artifacts (markdown tables, YAML) to the JSON / JSONL substrate per the `agent-reliable-state-artifacts` charter.
- **`help`** (also `--help`, `-h`) — Print verb registry and usage. In rev 3 dispatch model, `adev help` and `adev <verb> --help` both route through the verb registry; `<verb> --help` invokes the verb's `help()` function.

### Lifecycle driver surface (new pattern in `lib/cli/`)

- **`gate require --skill <name> --spec <path>`** — Helper-side gate primitive. Loads lifecycle state for `<spec>`, evaluates whether the lifecycle step entered by `<skill>` is allowed (prior step complete with PASS or PASS_WITH_NOTES verdict). Exit 0 (pass), 2 (gate blocked), 1 (argument error). Per `cli-driver-surface/driver-substrate.spec.md`.
- **`diagnose [--spec <p>] [--tier 1|2|3] [--json] [--only <ids>]`** — Runs the diagnostic registry, reports firing diagnostics. Exit 0 if clean, 2 if any error-severity diagnostic fires. Per `cli-driver-surface/adev-diagnose-cli.spec.md`.
- **Future verbs** — `heuristics extract`, `report --type validator|step`, `schema check`, `trailer check`, and others from the `cli-driver-surface/inline-node-extraction-sweep` master spec. Each follows the same `lib/cli/<verb>.mjs` contract; charter Capability Map updates as each lands.

## Key Responsibilities

- **Installation / scaffolding** — copy plugin files to provider cache; make hook scripts executable; scaffold `.context-index/` from templates (verbatim `cpSync()`); detect and offer to disable conflicting plugins (Superpowers); manage version stamping; compute and apply upgrade deltas.
- **Verb dispatch** — resolve `process.argv[2]` against the verb registry; route to the appropriate helper or legacy command; handle `--help`, unknown verbs, no-verb invocations; convert exceptions to exit codes per the hook protocol.
- **Pattern enforcement (via tests)** — `tests/cli-driver-pattern.test.mjs` walks `lib/cli/*.mjs` and asserts each module conforms to the contract (exports `run` + `help`; if `LIFECYCLE_STEP` is exported, `requireGate(...)` is first in `run`).

## Exported Functions

- `scaffoldContextKit()` — creates `.context-index/` from templates.
- `setupGitHooks()` — installs git hooks with conflict detection and chaining.
- `enablePlugin()` — copies plugin to cache, sets permissions (Claude Code adapter).
- `detectConflicts()` — checks for conflicting plugins in settings.
- `disableConflictingPlugin()` — updates project settings to disable a plugin.
- (Implicit) The verb registry — extended by adding entries; not directly exported but discoverable by reading the top of `cli/index.mjs`.

## Constraints

- **Single binary entry point.** `cli/index.mjs` remains the unique CLI binary (one bin entry in `package.json`). The single-*file* constraint is dropped (rev 3); per-verb logic for new lifecycle verbs lives in `lib/cli/<verb>.mjs`. Legacy commands MAY remain in `cli/index.mjs` for now; future extraction is permitted but not required.
- **Zero external dependencies.** Node.js built-ins only. Argv parsing uses `node:util::parseArgs` or hand-rolled. Justify any new dependency in an ADR.
- **Pure ESM.** All files `.mjs`, `"type": "module"`, no CommonJS.
- **Interactive prompts use `readline`.** No third-party prompt library.
- **Exit codes (per Constitution Principle 4):** `0` success, `1` fatal error (unknown verb, missing argument, unexpected exception), `2` gate-blocked (helper threw `GateError`).
- **Stderr sanitization.** Verb names and error messages routed to stderr by the dispatcher (unknown-verb errors, exception handlers) are stripped of non-printable / ANSI escape sequences before output. Prevents control-char injection from malicious argv corrupting hook-consumer parsers. Scoped to dispatcher stderr only — intentional ANSI on stdout (e.g., `adev diagnose` severity coloring) is unaffected. Per `driver-substrate.spec.md` SEC-2.
- **Context-layer configuration belongs in `/adev:init`, not in CLI commands.** Constitution, governance, persona, and sync targets are scaffolded but never edited by `cli/index.mjs`.
- **Backwards compatibility on legacy verbs.** `install`, `upgrade`, `uninstall`, `init`, `extension`, `status`, `migrate` continue to work post-refactor. The verb registry must include each as either a legacy adapter closure or a future `lib/cli/<verb>.mjs` module — no verb is silently removed.

## Key Files

- `cli/index.mjs` — single binary entry point, verb registry, dispatcher, legacy in-file commands.
- `lib/cli/<verb>.mjs` — per-verb helper modules (driver surface). One file per lifecycle verb. Created as the `cli-driver-surface` extraction sweep proceeds.
- `tests/cli.test.mjs` — legacy CLI tests (install/upgrade/uninstall/scaffold).
- `tests/cli/<verb>.test.mjs` — per-verb tests for new-pattern helpers (e.g., `tests/cli/gate.test.mjs`).
- `tests/cli-driver-pattern.test.mjs` — pattern test enforcing the `lib/cli/<verb>.mjs` contract.
- `tests/fixtures/cli/` — synthetic fixture modules used by the pattern test.
