---
charter: cli
kind: behavioral
status: draft
risk_level: high
revision: 2
charter-revision: 4
created: 2026-08-14
updated: 2026-08-14
affects:
  - setup
  - hooks
source-manifest:
  files:
    - cli/index.mjs
    - providers/claude-code/adapter.mjs
    - docs/hooks.md
    - skills/init/SKILL.md
    - tests/cli-hook-chaining.test.mjs
    - tests/cli-install-scope.test.mjs
---

<!-- partial_schema: spec@1 -->

# Live Spec: Installer Consent Boundary

## Behavioral Contract

`adev install` and `adev upgrade` change a developer's machine: they write
provider settings, replace tracked git hooks, and (previously) wrote project
configuration into `manifest.yaml`. This spec states what the installer is
permitted to do without asking, what it must ask first, and what it must never
silently decide.

It exists because three separate defects turned out to be the same failure:
**the installer acted, or failed, without the operator being able to tell.**

- `adev-plugin-5j6n` — the install-scope prompt was answered *after* the plugin
  had already been enabled machine-wide, so choosing "project" changed nothing
  and said nothing.
- `adev-plugin-sewt` — the chained git-hook wrapper exited `0` when a hook was
  missing or non-executable, so a disabled guard was indistinguishable from a
  passing one.
- The prompt audit under `5j6n` — three interactive prompts wrote context-layer
  configuration from the CLI, which the charter reserves for `/adev:init`.

Risk level is `high`: this behavior writes outside the project root
(`~/.claude/settings.json`, `~/.claude/plugins/installed_plugins.json`) and
rewrites tracked files in `.githooks/`.

## Acceptance Criteria

### Consent ordering

1. **When** the installer needs a decision that determines where it writes,
   **then** it collects that decision **before** performing any write governed
   by it. Asking after the fact is a defect even when the answer is later
   honored, because the earlier write is not undone.

2. **When** a scope-bearing prompt is answered `project`, **then**
   `~/.claude/settings.json` carries no
   `enabledPlugins["adev@agentic-development"]` key: a pre-existing entry is
   **removed**, not left in place with a warning. (Operator decision,
   2026-08-14. The alternative — warn and leave — was rejected because it
   leaves the machine in the state the operator declined.)

   **Scoped to that one key, deliberately (SA-2.)** Rev 1 said "no machine-wide
   state records the plugin as enabled", which its own carve-outs contradicted
   three paragraphs later and which no test could implement. A project-scoped
   install legitimately writes two other machine-wide things:

   | Written | Why it is not an enablement |
   |---|---|
   | `~/.claude/plugins/installed_plugins.json` | Records *that* and *where* the plugin is installed, plus the scope chosen (AC-3). Removing it would break uninstall. |
   | `extraKnownMarketplaces` in `~/.claude/settings.json` | How Claude Code *resolves* the plugin at all. Resolution is not enablement. |

   Stating these affirmatively is the point: the consent claim is exactly
   "adev is not enabled for your other projects", and nothing broader.

3. **When** any scope is chosen, **then** `installed_plugins.json` records the
   scope actually chosen rather than a hardcoded default.

### The CLI / init boundary

4. **When** any `adev install` / `adev upgrade` code path would **write**
   context-layer configuration — the constitution, governance, persona, sync
   targets, `domain:`, or `provenance:` — **then** it does not belong in the
   CLI. The charter states: *"All context-layer configuration (constitution,
   governance, persona, sync targets) remains in the `/adev:init` skill, not
   the CLI."*

   **This is a write rule, not a prompt rule.** Rev 1 keyed it on the presence
   of an interactive prompt, which left silent writes of the same configuration
   fully permitted — and the shipped code exercised that gap twice. A rule that
   cannot adjudicate the code it governs is not a rule. (SA-1.)

   Three prompts violated this and were moved to `/adev:init` (the **skill**,
   not the `adev init` CLI alias — see the note below): the domain-extension
   picker (install **and** upgrade), the sync-target chooser (upgrade), and
   provenance enforcement (upgrade).

   **Sanctioned exceptions**, both narrow and both write without asking because
   asking would be worse:

   - **First-scaffold defaults.** `handleDualSyncTargets()` writes sync targets
     when *no* `manifest.yaml` exists yet. Scaffolding a default is not
     choosing between existing values; there is nothing to overwrite and no
     decision to take from the operator. Once a manifest exists, the CLI
     reports and defers (AC-5).
   - **Repair of a value the loader rejects.** `migrateLegacyGateCommands()`
     rewrites a shell-string `command:` in `governance/gates.yaml`. This is
     permitted because the value is not a preference the project chose — it is
     one `merge-gates.mjs` discards at load, so the gate never runs and the
     project reports zero gates while looking like it passed. Specified in
     `unified-gates/tiered-gates-default.spec.md` behavior 11, which records
     the reversal of that spec's own template-purity non-goal.

   Any future exception must be written into this list with its reasoning. An
   unlisted write is a violation regardless of whether it prompts.

   **Terminology (CON-4):** `/adev:init` in this spec always means the **skill**.
   `adev init` is a live backward-compat CLI verb that routes to install or
   upgrade; routing a prompt "to `adev init`" would satisfy nothing.

5. **When** an upgrade makes a new project-configuration capability available,
   **then** the CLI **reports** it and names the skill that configures it. It
   does not prompt and does not write. Reporting is not a consent question.

6. **When** the installer legitimately needs an answer — which providers, which
   install scope, whether to disable a conflicting plugin, how to handle a
   foreign `core.hooksPath`, whether to proceed with an upgrade — **then**
   prompting is correct. These concern the installation itself, not the
   project's configuration.

### Hook chaining must fail closed

7. **When** the chained wrapper cannot execute a hook — the file is absent, or
   present but not executable — **then** it exits **non-zero** with a
   diagnostic naming the path and the remedy. It MUST NOT `exit 0`.

   A hook that cannot run is not a hook that passed. `[ -x ]` used as the sole
   guard conflates three states — absent, present-but-not-executable, and
   runnable — and maps all three to "skip". The executable bit does not survive
   archive/restore, zip, some CI checkouts, or Windows/WSL, so this state is
   reached in practice: it was observed in this repo on 2026-08-14 with all four
   `.adev` files at mode `-rw-r--r--`.

   What silently stops enforcing in that state: protected-branch blocking,
   conventional-commit validation, provenance trailer injection, and the
   inline-Node policy check. ADR-0007 treats hooks as the local enforcement
   layer with CI as the backstop; failing open removes the local layer with no
   signal that it is gone.

8. **When** an operator wants the permissive behavior anyway, **then**
   `ADEV_HOOK_CHAIN_ALLOW_MISSING=1` downgrades the failure to a warning on
   stderr. The escape hatch is explicit and announced; it is never the default.

9. **When** the wrapper resolves the chained original hook, **then** the path is
   relative to the repository, never an absolute path from the installing
   machine. `.githooks/` is tracked, so the wrapper is committed and read on
   other people's clones, where an absolute path does not exist — and (before
   AC-7) that turned into their original hooks silently not running.

   The anchor is the wrapper's own directory (`.githooks/..`), **not**
   `git rev-parse --show-toplevel`, which can answer for a different repository
   under a linked worktree or an unexpected `--git-dir`.

   The install-time computation and the runtime resolution MUST share a base.
   They do by construction: `githooksDir = join(cwd, ".githooks")` and the path
   is computed as `relative(cwd, originalHookPath)`, while the wrapper resolves
   `REPO_ROOT` as its own directory's parent. State the invariant, not a
   prohibition on `process.cwd()` — an earlier draft of this AC forbade it,
   which would have failed correct code. (SA-3, corrected per SA-11.)

12. **When** `core.hooksPath` contains anything outside `[A-Za-z0-9._/-]`, or
    resolves outside the repository root, **then** the installer REFUSES to
    chain, names the offending value and the reason, and offers only replace or
    skip. It never generates a wrapper from that value.

    `core.hooksPath` is the one input to this feature that crosses a trust
    boundary. It is read with `git config --get` and written into a file that is
    `chmod 755`, tracked, and executed by git on every commit. `$(…)` and
    backticks expand **inside double quotes**, so interpolating the raw value
    made it code:

    ```
    ORIGINAL="$REPO_ROOT/$(touch /tmp/pwned)/h/pre-commit"
    ```

    Reproduced end to end before the fix: an ordinary `git commit` executed the
    payload. The fail-closed guard of AC-7 does **not** contain it — expansion
    happens while computing the variable, before any `-e`/`-x` test.

    Precondition is prior config-write access (an npm `postinstall`, a bootstrap
    script), **not** a hostile clone: `.git/config` is never tracked and never
    transferred by clone, which was verified rather than assumed. The escalation
    is that the victim then *commits* the poisoned wrapper, so it runs on every
    teammate's machine — a persistence and lateral-movement primitive.
    CWE-78 / CWE-94.

13. **When** any externally-sourced value is written into a generated hook,
    **then** it is emitted as a **single-quoted** bash literal (`'` escaped as
    `'\''`), where `$` and backticks are inert. Values adev controls, such as
    `$REPO_ROOT`, are concatenated outside the literal so they still expand.

    The AC-12 allowlist is the control; this quoting is the containment. Both,
    because a future caller may reach `buildChainedHook` by a path that skips
    the validation. (SEC-1.)

14. **When** the original hook path lies outside the repository root
    **lexically**, **then** chaining is refused. "Relative" is not "contained":
    `relative()` happily yields `../../husky/pre-commit`, which resolves to a
    directory the installer does not own on a teammate's machine or a CI runner,
    and the wrapper would execute whatever is there. AC-7's fail-closed rule
    makes this *more* reachable, not less — a missing path now hard-fails, but
    an existing attacker-writable one still runs. CWE-22. (SEC-2.)

    **Known gap — containment is lexical, not physical (SEC-11).** The check
    uses `resolve()`/`relative()`, which are pure string operations. A tracked
    in-repo **symlink** (`.husky → ../shared-hooks`) is carried by `git clone`,
    passes this check, and the wrapper executes code outside the repository —
    demonstrated by execution during re-review. Closing it requires
    `realpathSync` on both the candidate and the repo root (the latter for the
    macOS `/var` vs `/private/var` case) plus a re-check once the concrete
    `originalHookPath` is known. Tracked separately; this AC states what is
    enforced today, not what is intended.

15. **When** the settings file **itself** is a symlink, **then** the installer
    refuses to write, naming the path and its target, and exits rather than
    following it.

    `.claude/settings.json` is routinely tracked in git, and git tracks
    symlinks. The canonical flow is "clone a repo, then run
    `npx @adev-org/adev-cli install`" — the clone is attacker-controlled and the
    write happens before the operator has made any trust decision, so a plain
    `writeFileSync` overwrites whatever the link points at, anywhere the user
    can write. CWE-59. (SEC-3.)

    Refusing beats replacing: a symlinked settings file may be a deliberate
    dotfile-manager setup, and silently clobbering it would be its own defect.
    Note that `sameFile()`'s `realpathSync` does **not** cover this — it is an
    identity check for the two-scopes-one-file case, not a safety check, and
    does nothing about a link pointing at a third location.

    **Known gap — leaf only (SEC-10).** `lstatSync` inspects the final path
    component, so a symlinked **parent** (`.claude → ~/.ssh`, or
    `.claude → ~/.claude`) is still followed; re-review demonstrated both, the
    second silently leaking a project-scope enable into the user file and
    defeating AC-2. Closing it requires resolving the parent chain and
    requiring the settings path to land under the intended root — the pattern
    already exists at `lib/issues/resolve-root.mjs`. Tracked separately; the
    CWE-59 claim above is therefore partial.

### Destructive rewrites are announced

10. **When** chaining is selected and it will overwrite tracked files in
    `.githooks/`, **then** the installer lists the files it is about to rewrite
    before doing so. In one observed case this produced a 639-line deletion diff
    across four hooks, which reads as repository corruption to anyone who did
    not know it was expected.

11. **When** chaining writes `<name>.adev` bodies, **then** those files are
    gitignored and the committed wrapper is tracked. The bodies are regenerated
    from the plugin's own `hooks/` on every install, so a committed copy would
    silently diverge from the installed plugin version. (Recorded in
    `managed-gitignore-block.spec.md`; restated here because it is what makes
    AC-7's "missing on a fresh clone" case normal rather than exceptional.)

## Verification

Tests assert on **filesystem outcomes** — which settings file gained or must not
gain an entry — rather than on return values, and run the generated wrapper
through a real `bash`, because the contract is about emitted shell rather than
JS control flow.

`tests/cli-install-scope.test.mjs` redirects `HOME` to a temp directory: a test
asserting "the user's settings file was not written" must not be able to touch
the real one. Two hazards found while implementing this, both kept as
regression tests:

- **Write ordering.** The marketplace registration in `enable()` rewrites the
  user settings file from an object captured earlier, so a revoke performed
  before it is silently undone. The revoke must run last and re-read from disk.
- **Path identity.** `HOME` and `cwd` can be the same directory, making the two
  scope paths one file — where revoking deletes the entry just written. String
  comparison does not detect this: on macOS `$TMPDIR` is `/var/…` while
  `process.cwd()` reports `/private/var/…`, so the paths differ as strings while
  naming the same file. Compare resolved paths.

## Explicitly Out of Scope

- **`extraKnownMarketplaces`** (`providers/claude-code/adapter.mjs`) writes
  user-level state even for a project-scoped install. A marketplace
  registration is how Claude Code resolves the plugin at all, not a per-project
  enablement, so AC-2 does not revoke it. Whether that is the right call is a
  real question, deferred deliberately rather than settled here.

- **The cursor provider's hardcoded `scope: "user"`** (no prompt at all). It
  should either take the same prompt or be documented as intentional; this spec
  requires only that the choice stop being implicit.

- **Gate-command migration on upgrade** — a different class of installer write
  (repairing a value the loader rejects, rather than acting without consent).
  Specified in `unified-gates/tiered-gates-default.spec.md` behavior 11.
