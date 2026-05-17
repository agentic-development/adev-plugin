# example-validation-check

Reference extension demonstrating the canonical `provides.governance` wiring for a `kind: quality-gate` check. Copy this directory as a starting point when authoring your own validate-time check.

## What it does

Installs one governance entry into the project's `.context-index/governance/validate.yaml` under the `target: validate.yaml` row. The entry runs `bin/check.sh`, which exits 0 with a single stdout line. The result is a passing `validator_report` event recorded in the spec's lifecycle log — the minimum-surface end-to-end demonstration of the extension authoring contract.

## Install

```bash
npx adev-cli extension install ./extensions/example-validation-check
```

Confirms manifest stamp in `.context-index/manifest.yaml::installed_extensions` and merges the entry into `.context-index/governance/validate.yaml`.

## Verify

```bash
adev diagnose --tier 1
```

The check appears in the registry walk after `validate.check-1-quality-gates`. To emit the validator report manually (what `/adev:validate` does internally):

```bash
adev report --type validator \
  --spec <path-to-your-spec> \
  --step validate \
  --validator example-validation-check.passing \
  --verdict PASS
```

## Constraints (deliberate, threat-model)

`bin/check.sh` is intentionally austere — it reads **no environment, no argv, no stdin**, writes no files, and makes no network calls. This is a deliberate threat-model choice: copying the example produces a no-op check, not an exfiltration vector you then need to harden.

The binary:
- begins with `#!/usr/bin/env bash` (no `sh`, no `zsh` portability tax)
- enables `set -euo pipefail` (fail-fast on unset vars, errors, pipe failures)
- forbids `eval`, `source`, backticks, `$(...)` command substitution, `${VAR}` / `$VAR` expansion, and any reads of `printenv` / `env`
- exits 0 with one `stdout` line and zero `stderr`

When you extend this for your own check, keep the constraints unless your project documents a higher-privilege threat model. The framework provides path containment and manifest validation, but the subprocess inherits the user's full filesystem and network privileges — `profile: read-only` does NOT sandbox it (see `docs/extensions.md` Pitfall 5).

## Modify for your project

Copy `extensions/example-validation-check/` to your extension's repo and edit `bin/check.sh` to perform the actual validation. The manifest at `adev-extension.yaml` already declares the canonical shape: keep the `command: [bash, <path>]` argv form, the explicit `profile:`, and the `id:` field. Update `severity:` to `error` if a failure should fail the validate verdict (default here is `warning`, which downgrades a FAIL to WARN per `configurable-checks.spec.md` Behavior 13). For full schema documentation see [`docs/extensions.md`](../../docs/extensions.md).
