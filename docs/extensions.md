# Extensions

Extensions are installable packages that ship adev customizations — domain profiles, governance overlays, reference samples, hooks, and standalone skills — without modifying the core plugin. This guide is the canonical author reference: what an `adev-extension.yaml` declares, what install does with each slot, and the pitfalls authors hit most often.

If you have never installed an extension, the worked example below (`extensions/example-validation-check/`) gets you from clone to a passing `validator_report` event in under five minutes.

## Quick links

- Worked reference extension: [`extensions/example-validation-check/`](../extensions/example-validation-check/README.md)
- Manifest template: [`templates/adev-extension.example.yaml`](../templates/adev-extension.example.yaml)
- Merge semantics ADR: [`.context-index/adrs/0003-configurable-review-registry.md`](../.context-index/adrs/0003-configurable-review-registry.md)
- Install implementation: [`lib/extensions/install.mjs`](../lib/extensions/install.mjs)
- Validate-time event surface: [`lib/cli/report.mjs`](../lib/cli/report.mjs)

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
    - target: validate.yaml          # one of: review.yaml, validate.yaml, gates.yaml
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
| Omitting `id:` | Fails with `GOVERNANCE_SCHEMA` (validation runs before merge). |

The other `provides.*` slots are documented inline in [`templates/adev-extension.example.yaml`](../templates/adev-extension.example.yaml). The template parses cleanly with all five slots populated; trim what you do not need.

### `provides.skills`

Standalone skills (markdown only, no executable logic per Constitution Principle 2). Extension skill names cannot collide with bundled skill names — collision blocks the entire install with `SKILL_COLLISION`. Each entry declares `name`, optional `description`, and `source_dir` (relative to the extension root).

### `provides.hooks`

Lifecycle hooks copied into the active provider's `hooks.json` (Claude Code, Codex, OpenCode). Each entry declares `event` (e.g., `PostToolUse`, `PreToolUse`, `UserPromptSubmit`) and `command` (script path relative to the extension root). Hooks must comply with the adev hook protocol: read JSON from stdin + env vars, exit 0 (allow) or 2 (block), emit JSON to stdout.

### `provides.domain-profile`

A 7-file directory installed to `.context-index/domains/<name>/` with a generated `domain.yaml` containing `extends: <parent>` (one level deep, see Charter Invariants). `BUNDLED_DOMAIN_NAMES` (software, data-engineering, process-automation) cannot be overridden — install fails with `BUNDLED_COLLISION` if you try.

**Init-time discovery:** First-party domain extensions listed in `templates/extensions-catalog.json` are surfaced during `adev install` and `adev upgrade` via a picker prompt. Users can pick one without leaving the install flow; the picker dispatches to the same `installExtension()` pipeline this guide documents and writes a top-level `domain:` key into the user's `manifest.yaml`. See [Installation > Domain Extension Picker](installation.md#domain-extension-picker) for the end-user view. Third-party or off-catalog domain extensions remain a manual `adev extension install <source>` invocation.

### `provides.samples`

Golden samples copied into `.context-index/samples/`. Each entry can be a string (same path under both `source` and `dest`) or `{src, dest}`. Both paths are containment-checked; any escape fails with `PATH_TRAVERSAL`.

## Install-time merge semantics

`npx adev-cli extension install <source>` walks each slot and merges per the rules below. The decision and rationale live in [ADR-0003: Data-Driven Registry for Review and Validate Skills](../.context-index/adrs/0003-configurable-review-registry.md) — read the ADR if the rules below ever surprise you.

**Merge-by-id (governance):**
- Entries with a new `id` are appended to the target file.
- Entries with an `id` that already exists: project values win on every field, extension values only fill fields the project left unset.
- `severity`, `enabled`, and `after` are non-overridable from the extension side — installing an extension never downgrades a project's severity from `error` to `warning`, never silently enables a check the project disabled, and never re-orders a project's `after` list.
- Every colliding id is reported in a single dedicated section of the install report (no buried output).

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

Every governance entry needs a stable `id` (max 128 chars, validated by `validateGovernanceEntry`). The merge engine keys on `id` — without it, the entry is rejected with `GOVERNANCE_SCHEMA`. Use the convention `<extension-name>.<check-name>` (e.g., `my-extension.no-secrets`) to avoid collisions with bundled or other-extension ids.

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

### 6. Untrusted sources

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
