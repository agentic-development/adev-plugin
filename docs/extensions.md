# Extensions

Extensions are installable packages that ship adev customizations — domain profiles, governance overlays, reference samples, hooks, and standalone skills — without modifying the core plugin. This guide is the canonical author reference: what an `adev-extension.yaml` declares, what install does with each slot, and the pitfalls authors hit most often.

If you have never installed an extension, the worked example below (`extensions/example-validation-check/`) gets you from clone to a passing `validator_report` event in under five minutes.

## Quick links

- Worked reference extension: [`extensions/example-validation-check/`](../extensions/example-validation-check/README.md)
- Manifest template: [`templates/adev-extension.example.yaml`](../templates/adev-extension.example.yaml)
- Merge semantics ADR: [`.context-index/adrs/0003-configurable-review-registry.md`](../.context-index/adrs/0003-configurable-review-registry.md)
- Install implementation: [`lib/extensions/install.mjs`](../lib/extensions/install.mjs)
- Validate-time event surface: [`lib/cli/report.mjs`](../lib/cli/report.mjs)
- Governance contribution rules (writable registries, field allowlists, executable payloads): [The governance contribution contract](#the-governance-contribution-contract)

## Manifest schema

An extension is a directory containing `adev-extension.yaml` at its root plus whatever payload the manifest declares. The installer (`installExtension()` in `lib/extensions/install.mjs`) reads the manifest, validates it, then walks each `provides.*` slot.

### Top-level fields

```yaml
name: my-extension          # required, kebab-case, ≤64 chars
version: 0.1.0              # required, semver, ≤32 chars
description: One-line summary shown in `npx adev-cli extension list`.
author: your-org
requires:
  adev: ">=0.27.0"          # semver range; install aborts with INCOMPATIBLE_VERSION if unsatisfied
provides:
  governance: [...]         # see below
  skills: [...]
  hooks: [...]
  domain-profile: { ... }
  samples: [...]
```

Unknown fields under the top level are silently ignored for forward compatibility (see `extension-core.spec.md` Behavior 5).

### `provides.governance` (canonical shape)

This is the slot most authors get wrong. The canonical schema is an **array** of `{ target, entries[] }` objects:

```yaml
provides:
  governance:
    - target: validate.yaml          # one of the five writable registries — see below
      entries:
        - id: my-extension.my-check
          kind: quality-gate
          profile: read-only
          command: [bash, extensions/my-extension/bin/check.sh]
          severity: warning
          after: [validate.check-1-quality-gates]
```

A single `provides.governance` array may target multiple files — each `target` produces its own merge pass into the project's `.context-index/governance/<target>` file. Anti-patterns the installer rejects:

| Pattern | Why it fails |
|---------|--------------|
| `provides.governance: [{id: ...}]` (flat array of entries, no `target`) | The installer iterates `provides.governance` expecting `{target, entries}` objects; flat entries are silently dropped. |
| `provides.governance: {checks: [...]}` (object with `checks` wrapper) | Not the canonical shape; the install pass ignores it. |
| `command: "bash bin/check.sh"` (string, not argv) | Fails load with `QUALITY_GATE_COMMAND_SHELL` per `configurable-checks.spec.md` Behavior 6a. |
| Omitting `profile:` on a `kind: quality-gate` entry | Fails load with the explicit-acknowledgement error per Behavior 13. |
| Omitting `id:` | Fails with `GOVERNANCE_FIELD_VALUE_INVALID` (validation runs before merge). |

The other `provides.*` slots are documented inline in [`templates/adev-extension.example.yaml`](../templates/adev-extension.example.yaml). The template parses cleanly with all five slots populated; trim what you do not need.

### The governance contribution contract

A governance contribution is untrusted third-party content written into a file the project owns, so the boundary is narrow and stated exhaustively in code. The reference implementations are [`lib/extensions/governance-registry.mjs`](../lib/extensions/governance-registry.mjs) (what may be written, and where) and [`lib/extensions/exec-payload.mjs`](../lib/extensions/exec-payload.mjs) (what happens to anything executable). When this guide and those modules disagree, the modules win.

#### The five writable registries

`target:` must name one of five files, each of which has exactly one root YAML key its entries land under (`WRITABLE_REGISTRIES`):

| `target:` | Root key | Registry |
|---|---|---|
| `validate.yaml` | `checks` | Validate check registry |
| `review.yaml` | `reviewers` | Reviewer registry |
| `gates.yaml` | `gates` | Quality gates |
| `diagnostics.yaml` | `diagnostics` | Write-time diagnostic producers |
| `boundaries.yaml` | `boundaries` | Architectural boundary rules |

Note that `validate.yaml` takes `checks`, not `validators` — a `validators:` key is never read by the loader.

Anything else is refused with `UNKNOWN_GOVERNANCE_TARGET`, and two files are called out by name because they are the tempting ones: `risk-policies.yaml` and `sensitive-paths.yaml` are **never** extension-writable. Which paths count as sensitive, and which risk levels demand review, are decisions the project makes *about* the extension — never decisions the extension makes about itself.

#### Per-registry field allowlists

Each registry has an exhaustive allowlist (`FIELD_ALLOWLIST` in `lib/extensions/governance-registry.mjs`). A field outside it is refused with `GOVERNANCE_FIELD_NOT_ALLOWED` — the entry is not trimmed and installed anyway.

| Registry | Contributable fields |
|---|---|
| `validate.yaml` | `id`, `name`, `kind`, `severity`, `profile`, `context_pack`, `prompt`, `after`, `description`, `command`, `fail_fast`, `enabled`, `disabled_reason` |
| `review.yaml` | `id`, `name`, `dispatch`, `profile`, `context_pack`, `severity_cap`, `prompt`, `package`, `enabled`, `disabled_reason` |
| `gates.yaml` | `id`, `command`, `description`, `severity`, `tier`, `enabled`, `disabled_reason` |
| `diagnostics.yaml` | `id`, `runner`, `severity`, `tier`, `scope`, `enabled`, `disabled_reason` |
| `boundaries.yaml` | `id`, `severity`, `pattern`, `exclude`, `description`, `enabled`, `disabled_reason` |

Three field-level rules are worth memorising:

- `source`, `__source` and `exec_consented_at` are stamped by the installer. Supplying one is refused with `GOVERNANCE_SOURCE_FORGED`, which outranks the allowlist check so the report names the forgery rather than the weaker "field not allowed".
- `runner` is contributable to `diagnostics.yaml` only, and its value must start with `plugin:`. A `project:` runner names project-owned files under `.context-index/diagnostics/` that the extension does not ship.
- `kind` is **not** contributable to `gates.yaml`, because `gate doctor` reads it straight off the raw file to select the gate's execution contract.

Per-entry validation is `validateEntryFields(target, entry)` in `lib/extensions/governance-registry.mjs`. (Earlier releases exported a single target-blind entry validator; it was removed, because target-blindness was precisely the defect — a field legitimate in one registry is a capability grant in another.)

#### Two fields you cannot contribute, and why

- **`dispatch: triggered` is refused.** `dispatch`'s only non-degenerate form is two levels deep with array leaves (`patterns`, `keywords`, `min_score`). Allowing it would hand an untrusted extension control over which files and which keywords summon a reviewer — that is a capability grant, not a preference. Contribute `always` or `never`; a project can widen it afterwards by hand.
- **`package.args` is refused.** `lib/governance/review-config.mjs` line 418 reads `validated.args = pkg.args ?? {}` — unvalidated, arbitrary depth — and passes it straight to the reviewer. Only `package.skill` and `package.adapter` may be supplied.

#### Executable payloads and the `.context-index/extensions/<name>/` directory

An extension may contribute executables. Three rules bound them together, and none is optional.

**1. Consent.** Any `command` on an entry that will actually execute (every `gates.yaml` entry, and a `validate.yaml` entry whose `kind` is `quality-gate`), plus any reviewer `package.skill` / `package.adapter`, is an executable contribution. All of them are collected across every block of every target and surfaced *before a single byte is written*. `adev extension install <source> --allow-exec` grants consent non-interactively; an interactive install prompts and lists each command verbatim. Consent is per-install and never remembered — the payload can change between versions. A non-interactive install with no `--allow-exec` refuses with `GOVERNANCE_EXEC_NOT_CONSENTED` and writes nothing.

**2. Containment and relocation.** The installer **copies** the payload into the project-owned directory `.context-index/extensions/<name>/` and rewrites every contributed path element to point at the copy. Copied files are set mode `0o555`. Both sides of every containment check are `realpathSync`-resolved, so a symlink cannot smuggle a file out of the extension root or into a directory outside the payload tree.

The payload set is **derived, not declared**. There is no manifest slot listing payload files: `planExecPayload` walks the argv path elements of each contributed `command` plus each `package.skill` / `package.adapter` value, and that set *is* the payload. A file the manifest never references through one of those fields is never copied. At most 32 payload files per extension.

**3. Argv-only invocation, with an interpreter allowlist.** `command` must be an argv array; a shell-form string is refused. `argv[0]` must be either a path inside the extension or one of the four members of the interpreter allowlist — `bash`, `sh`, `node`, `python3` (`INTERPRETER_ALLOWLIST` in `lib/extensions/exec-payload.mjs`). Anything else is refused with `GOVERNANCE_COMMAND_ESCAPES_EXTENSION`.

#### The two emission forms

The rewritten path is emitted in one of two forms, chosen by field. This is deliberate and cannot be collapsed, because the two consumers have incompatible path contracts:

| Contributed field | Emitted as | Example |
|---|---|---|
| `command` argv elements | **absolute** | `/home/me/proj/.context-index/extensions/my-ext/bin/check.sh` |
| `package.skill`, `package.adapter` | **`.context-index/`-relative** | `extensions/<name>/reviewers/my-reviewer.md` |

A `command` is spawned with a `cwd` this layer does not control (`gate doctor` uses `cwd: projectRoot`; the quality-gate runner uses a caller-supplied `cwd`), so only an absolute path makes the install-time check a run-time guarantee. A reviewer path takes the opposite form because `resolveReviewerPath` rejects an absolute path outright with `ABS_PATH_REJECTED` and returns immediately — before the `..` guard, before the containment check, before the existence check. An absolute emission there would be permanently unloadable.

Both forms are derived from the same relative path, so `resolve(projectRoot, '.context-index', contextRelative)` equals the absolute form by construction.

#### Values are refused, never sanitized

Every contributed scalar is eventually re-serialized into YAML and re-read by this repo's own parser (`lib/profiles/yaml.mjs`), which strips quotes without unescaping and truncates a value at a bare `#`. There is no escape sequence that round-trips through it, so there is no sanitizing layer — an unsafe value is refused with `GOVERNANCE_SCALAR_UNSAFE`.

Refused anywhere in a scalar: newline, carriage return, `"`, `'`, `#`, `{`, `}`, `[`, `]`, `,`, and a colon followed by whitespace (or a trailing colon). Refused as the first character: the YAML indicators `- ? : & * ! | > % @` and backtick. Also refused: the strings that change type on reparse (`""`, digits, `true`, `false`, `null`, `~`). Argv tokens get a slightly different rule so that `--silent` and `--` survive. Scalars cap at 512 characters, argv at 32 elements, entries at 32 per target.

#### Merge behavior

- A new `id` is appended to the target file.
- A **colliding `id` is skipped, never merged.** The existing entry is left byte-identical — no field is filled in, no key is added. The install report lists it as skipped.
- The splice is a line-range text operation, not a reserialization: comments, sibling keys and formatting outside the inserted lines are preserved byte-for-byte.
- An unparseable target registry is **refused** with `GOVERNANCE_PARSE_REFUSED` and left untouched. It is never treated as empty — treating it as empty would overwrite the registry and bypass collision detection in one move.
- Every appended entry is stamped `source: extension:<name>`, and executable entries also carry `exec_consented_at`.

### `provides.skills`

Standalone skills (markdown only, no executable logic per Constitution Principle 2). Extension skill names cannot collide with bundled skill names — collision blocks the entire install with `SKILL_COLLISION`. Each entry declares `name`, optional `description`, and `source_dir` (relative to the extension root).

### `provides.hooks`

Lifecycle hooks copied into the active provider's `hooks.json` (Claude Code, Codex, OpenCode). Each entry declares `event` (e.g., `PostToolUse`, `PreToolUse`, `UserPromptSubmit`) and `command` (script path relative to the extension root). Hooks must comply with the adev hook protocol: read JSON from stdin + env vars, exit 0 (allow) or 2 (block), emit JSON to stdout.

### `provides.domain-profile`

A 7-file directory installed to `.context-index/domains/<name>/` with a generated `domain.yaml` containing `extends: <parent>` (one level deep, see Charter Invariants). `BUNDLED_DOMAIN_NAMES` (software, data-engineering, process-automation) cannot be overridden — install fails with `BUNDLED_COLLISION` if you try.

**Init-time discovery:** First-party domain extensions listed in `templates/extensions-catalog.json` are surfaced during `adev install` and `adev upgrade` via a picker prompt. Users can pick one without leaving the install flow; the picker dispatches to the same `installExtension()` pipeline this guide documents and writes a top-level `domain:` key into the user's `manifest.yaml`. See [Installation > Domain Extension Picker](installation.md#domain-extension-picker) for the end-user view. Third-party or off-catalog domain extensions remain a manual `adev extension install <source>` invocation.

### `provides.samples`

Golden samples copied into `.context-index/samples/`. Each entry can be a string (same path under both `source` and `dest`) or `{src, dest}`. Both paths are containment-checked; any escape fails with `PATH_TRAVERSAL`.

### `provides.skill_extensions`

Extensions can ship **skill augmentation files** that append instructions to specific adev skills at the project level.

```yaml
provides:
  skill_extensions:
    implement: skills/implement-extension.md
    plan: skills/plan-extension.md
```

**Key:** skill name (must match `[a-zA-Z0-9_-]+`)
**Value:** path to a `.md` file within the extension root

**Install behavior:**

At install time, `adev extension install` copies each declared file to:

```
.context-index/skill-extensions/_<ext-name>/<skill>.md
```

The `_<ext-name>/` prefix signals that the file is extension-managed. It is distinct from the project-level file at `.context-index/skill-extensions/<skill>.md`, which is **never touched** by the installer.

**Idempotency:** Re-running `adev extension install` overwrites the `_<ext-name>/` files with the latest content from the extension source.

**Consumption:** Skill extension files are read at skill invocation time by `adev skill-ext load` (see `.context-index/specs/features/cli/skill-ext-load.spec.md`). The `adev skill-ext load <skill>` verb concatenates the project-level and all extension-level files for the named skill and returns the merged instructions.

**Universal consumption:** Every adev skill calls `adev skill-ext load --skill <slug>` during its earliest context-loading step. An extension pack can ship `provides.skill_extensions: { plan: "...", validate: "...", specify: "...", ... }` for any skill name and the corresponding skill will pick it up on its next invocation. See `.context-index/specs/cross-cutting/universal-skill-extensions.spec.md` for the coverage contract.

**Constraints:**
- Skill names must match `[a-zA-Z0-9_-]+` (fails with `INVALID_SKILL_NAME`).
- Source paths must not escape the extension root (fails with `PATH_TRAVERSAL`).
- Declared source files must exist (fails with `MISSING_SKILL_EXT_FILE`).
- Source files must be `.md` (fails with `INVALID_FILE_TYPE`).

## Install-time merge semantics

`npx adev-cli extension install <source>` walks each slot and merges per the rules below. The decision and rationale live in [ADR-0003: Data-Driven Registry for Review and Validate Skills](../.context-index/adrs/0003-configurable-review-registry.md) — read the ADR if the rules below ever surprise you.

**Merge-by-id (governance):**
- Entries with a new `id` are appended to the target file.
- Entries with an `id` that already exists are **skipped entirely** — the existing entry is left byte-identical, and no field of it is filled, overwritten or added. An install therefore never downgrades a project's severity, never enables a check the project disabled, and never injects a `command` into an entry the project owns.
- Every colliding id is reported in a single dedicated section of the install report (no buried output).
- See [The governance contribution contract](#the-governance-contribution-contract) above for the writable set, the field allowlists and the executable-payload rules.

**Copy-on-first-write (domain profiles, samples):** Files are copied verbatim into `.context-index/domains/<name>/` or `.context-index/samples/`. Re-installing overwrites the destination (idempotent — see `content-installation.spec.md` Behavior 4).

**Registration (skills, hooks):** Skill content is copied to the provider's skills directory; the hook entry is appended to `hooks.json`. Both go through `lib/extensions/register.mjs`, which path-containment-checks each destination.

## Validate-time event flow

When `/adev:validate` runs on a project that has installed an extension with `provides.governance: [{target: validate.yaml, ...}]`:

1. The validate skill loads `governance/validate.yaml` via `lib/governance/validate-config.mjs`, which now includes the extension's entries.
2. Checks are topologically sorted by `after:` and the new check executes in registry order.
3. For `kind: quality-gate` entries, validate spawns the binary via `child_process.execFile(argv[0], argv.slice(1))` — argv form, never shell. The subprocess inherits the user's environment minus what the profile redacts; the profile does **not** sandbox filesystem or network access.
4. Verdict is recorded with `adev report --type validator --step validate --validator <id> --verdict <PASS|PASS_WITH_NOTES|FAIL>` — the verb defined in [`lib/cli/report.mjs`](../lib/cli/report.mjs).
5. The write-time diagnostic hook (see [`.context-index/specs/features/cli-driver-surface/write-time-diagnostic-hook.spec.md`](../.context-index/specs/features/cli-driver-surface/write-time-diagnostic-hook.spec.md)) inspects the appended event. Tier-1 diagnostics scoped to `event-impact` run synchronously; any firing rules stamp `diagnostic_warnings: [...]` directly onto the event so the audit trail records claim and check together.

The `--validator` argument MUST be a single token matching the governance entry's `id:` field — no newlines, no nested objects. The lifecycle log redaction caps notes at 200 chars; longer values are silently truncated.

## Pitfalls

Read this section before publishing your first extension.

### 1. Forgetting `profile:` on a `kind: quality-gate` check

`configurable-checks.spec.md` Behavior 13 requires every `kind: quality-gate` entry to declare its `profile` explicitly (e.g., `read-only`, `read-write`). Omitting it fails load with an explicit-acknowledgement error. There is no implicit default — the schema forces you to think about which profile your check runs under.

### 2. Using string-form `command:`

The installer accepts ONLY argv form: `command: [bash, bin/check.sh, --flag, value]`. A string like `command: "bash bin/check.sh"` triggers `QUALITY_GATE_COMMAND_SHELL` on load (`configurable-checks.spec.md` Behavior 6a) because the runtime uses `child_process.execFile` without a shell — no interpolation, no globbing, no chained commands. The argv form is the contract; learn to love it.

### 3. Omitting `requires.adev` semver

Without `requires.adev`, your extension installs against any adev version. If a future adev release breaks the contract your extension depends on (a `provides.*` slot is removed, a profile field changes), users get a runtime failure instead of a clean install-time refusal. Always pin a range: `requires: { adev: ">=0.27.0 <1.0.0" }` is the minimum hygiene.

### 4. Missing `id:` on a governance entry

Every governance entry needs a stable, non-empty **string** `id`, validated by `validateEntryFields(target, entry)` in [`lib/extensions/governance-registry.mjs`](../lib/extensions/governance-registry.mjs). The merge engine keys on `id` — without it, the entry is rejected with `GOVERNANCE_FIELD_VALUE_INVALID`. Note that `id: 42` is rejected for the same reason: the YAML parser coerces digit strings to numbers, and a numeric id would slip past a string-keyed collision check. Use the convention `<extension-name>.<check-name>` (e.g., `my-extension.no-secrets`) to avoid collisions with bundled or other-extension ids.

### 5. Threat-model: `profile:` does NOT sandbox the subprocess

This is the most important pitfall and the one most likely to bite you in production.

`profile:` scopes the adapter's **tool surface** — what the agent that authored the check can read and write through the MCP-style adapter. It is a permissions model for the agent author, not a sandbox for the child process.

When `kind: quality-gate` runs, validate spawns your binary via `child_process.execFile(argv[0], argv.slice(1))`. The child process inherits the user's full filesystem and network privileges. A `profile: read-only` declaration does not stop your binary from writing to `/tmp`, hitting the network, or reading `~/.aws/credentials`. The profile is metadata about authoring intent; OS-level isolation is your job.

Author your check binaries defensively:
- Read no stdin, argv, or env beyond what the contract demands.
- Write nowhere outside `/tmp` (and prefer not even there).
- Make no network calls unless the check's purpose requires them and is documented.
- Use `set -euo pipefail` in bash binaries and forbid `eval`, `source`, backticks, and `$(...)` command substitution to keep the surface minimum.

The reference extension's `bin/check.sh` follows all of these rules in fewer than 10 lines — copy it as a starting point.

### 6. Project paths containing `"`, `'`, `#`, `,` or a brace

adev **cannot install an extension executable payload into a project whose absolute path contains** one of the characters that is unsafe in a governance scalar: `"`, `'`, `#`, `,`, `{`, `}`, `[`, `]`, a newline, or a colon followed by whitespace. Spaces are fine, and so is every ordinary punctuation character (`-`, `_`, `.`, `@`, `+`). A project at `/Users/me/my projects/app` installs normally; one at `/Users/me/c#-experiments/app` does not.

The cause is structural rather than incidental. A rewritten `command` path is emitted **absolute**, so it embeds your `projectRoot`, and every emitted path is checked with `assertSafeScalar` before anything is written. The install fails at validation with `GOVERNANCE_SCALAR_UNSAFE` naming the offending character, and nothing is copied or spliced.

This is deliberate, not a gap waiting to be patched. The repo's YAML parser performs no unescape, so an unquoted `#` truncates the emitted value at that point and a stray quote or brace re-parses the line as different structure — that is a real injection vector, not a cosmetic one. The contract is *rejected at validation, not sanitized; there is no escaping layer to get wrong.* Adding one would mean adding the very layer that could be wrong.

**Remedy:** relocate the checkout to a path without those characters. Non-executable slots (`provides.samples`, `provides.skills`, `provides.domain-profile`, `provides.skill_extensions`) are unaffected, because no project path is emitted into a governance file for them.

### 7. Untrusted sources

Treat `npx adev-cli extension install <unknown-package>` with the same scrutiny you would treat `curl | bash`. The installer copies files, merges YAML, and registers skills — but the moment `/adev:validate` runs on your project, it spawns the extension's `bin/*` binaries with your full user privileges. There is no Docker container, no UID drop, no syscall filter. If the npm package was hijacked, that hijacker now runs code on your machine the next time validate fires.

Mitigations the framework provides:
- Manifest validation rejects unknown top-level fields and enforces the canonical `provides.*` shapes.
- Path containment blocks `../` traversal in sample sources and destinations.
- Skill name collision detection blocks an extension from masquerading as a bundled skill.

Mitigations you must provide:
- Review the extension's source tree before installing — at minimum, read `bin/`, `hooks/`, and any `skills/<name>/SKILL.md`.
- Prefer extensions from your own org or published by maintainers you trust.
- Pin to specific versions in `requires.adev` and review CHANGELOG diffs before re-installing.

## Worked example

`extensions/example-validation-check/` is the canonical reference. Its complete tree is three files (manifest + `bin/check.sh` + README) totaling under 100 lines. It demonstrates the minimum-surface contract for a `kind: quality-gate` extension:

```bash
# Install against a fresh project
npx adev-cli extension install ./extensions/example-validation-check

# Confirm the registry walk picks it up
adev validate --dry-run

# Emit the validator report manually (what /adev:validate would do)
adev report --type validator \
  --spec .context-index/specs/features/<m>/<spec>.spec.md \
  --step validate \
  --validator example-validation-check.passing \
  --verdict PASS
```

The binary at `extensions/example-validation-check/bin/check.sh` reads no environment, no argv, and no stdin. It exits 0 with one stdout line (`PASS: example-validation-check`) and emits no stderr. That minimalism is deliberate — copying the example produces a no-op check that you then extend with your project's actual logic, not an exfiltration vector you have to harden after the fact.

Read [`extensions/example-validation-check/README.md`](../extensions/example-validation-check/README.md) for the install + verify walkthrough.

## See also

- [`extensions/example-validation-check/`](../extensions/example-validation-check/README.md) — reference extension referenced throughout this guide
- [`templates/adev-extension.example.yaml`](../templates/adev-extension.example.yaml) — commented manifest template exercising all five `provides.*` slots
- [ADR-0003](../.context-index/adrs/0003-configurable-review-registry.md) — merge-by-id decision and rationale
- [`extension-core.spec.md`](../.context-index/specs/features/extensions/extension-core.spec.md) — manifest schema and install semantics
- [`content-installation.spec.md`](../.context-index/specs/features/extensions/content-installation.spec.md) — governance merge + path containment
- [`cli-and-registration.spec.md`](../.context-index/specs/features/extensions/cli-and-registration.spec.md) — `extension install` / `extension list` CLI verbs
- [`configurable-checks.spec.md`](../.context-index/specs/features/validation/configurable-checks.spec.md) — quality-gate command + profile rules
- [`write-time-diagnostic-hook.spec.md`](../.context-index/specs/features/cli-driver-surface/write-time-diagnostic-hook.spec.md) — write-time event tagging
