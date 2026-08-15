[adev docs](README.md) > Advanced

# Governance Reference

Operator guide for customizing [`/adev:review-specs`](skill-reference.md) and [`/adev:validate`](skill-reference.md) via the project-local governance files. Shipped in 0.18.0.

## Prerequisites

Before reading this guide, you should be familiar with:

- [Core Concepts](concepts.md) — the four pillars and context-first approach
- [Validate & Debug workflow](validate-debug.md) — how validation and review fit into the lifecycle
- The review and validation skills: [`/adev:review-specs`](skill-reference.md), [`/adev:validate`](skill-reference.md)
- [Configuration Reference](configuration.md) — manifest.yaml structure

Understanding how [`/adev:init`](skill-reference.md) scaffolds a project is helpful but not required.

> **New projects:** [`/adev:init`](skill-reference.md) Step 7 walks you through this interactively — it scans for existing Claude/Cursor/Copilot skills to adopt as reviewers, proposes quality-gates based on your `package.json` / `pyproject.toml` / `go.mod`, migrates legacy `manifest.yaml:specialists`, and generates stub prompts. Read below if you prefer to edit the files by hand or if you want to make changes after init.
>
> **Brownfield projects that just upgraded:** run `/adev:init` again — it's idempotent and will surface adoption opportunities against files that already exist. Absent that, keep reading for the five migration recipes at the bottom.
>
> **Zero-config is fine.** Bundled defaults ship with the plugin and reproduce the pre-0.18.0 hardcoded flow byte-for-byte. Nothing below is required.

## The governance files

| File | Owner skill | What it does |
|------|-------------|--------------|
| `.context-index/governance/gates.yaml` | [`/adev:validate`](skill-reference.md) Check 1 | Tiered quality gates (fast/integration/e2e). Pre-0.18.0 behavior, unchanged. |
| `.context-index/governance/review.yaml` | [`/adev:review-specs`](skill-reference.md) | Project reviewer registry — add, disable, override, trigger. |
| `.context-index/governance/validate.yaml` | [`/adev:validate`](skill-reference.md) | Project check registry — enable/disable, add custom checks, gate on topology. |
| `.context-index/governance/boundaries.yaml` | [`/adev:plan`](skill-reference.md), [`/adev:validate`](skill-reference.md) | Architectural boundary rules — regex patterns that raise errors/warnings when violated. |
| `.context-index/governance/risk-policies.yaml` | governance enforcement | Maps spec `risk_level` (high/medium/low) to gate-escalation policy and, since the test depth policy shipped, to `test_depth`. |
| `.context-index/governance/sensitive-paths.yaml` | `adev test-policy resolve` | Optional, extend-only overlay that raises the test-depth floor for additional path patterns. |
| `.context-index/governance/diagnostics.yaml` | `adev diagnose` (write-time) | Tier-1 diagnostic producer registry tagging lifecycle events. |
| `.context-index/profiles.yaml` | cross-cutting | Execution profiles: tool permissions, env allowlist, model tier, redaction. Consumed by every reviewer and check. |

All are optional. Absent files mean "use bundled defaults."

## The gate schema in `gates.yaml`

### Fields

A gate entry carries nine fields, plus `group` on the e2e tier only:

| Field | Values | Default |
|---|---|---|
| `id` | unique string | required |
| `name` | display name | — |
| `kind` | `deterministic` \| `probabilistic` | `deterministic` |
| `tier` | `fast` \| `integration` \| `e2e` | `fast` |
| `command` | argv **list** — required for `deterministic` gates | required |
| `scope` | `project` \| `charter` | `project` |
| `required` | `true` \| `false` | `true` |
| `severity` | `error` \| `warning` | tier default (see below) |
| `triggers` | lifecycle events (`post-task`, `post-implement`, `pre-merge`) | — |
| `group` | e2e tier only: `smoke` \| `full` — smoke runs first | — |

```yaml
gates:
  - id: test
    name: Test Suite
    kind: deterministic
    tier: fast
    command: [npm, test]
    scope: project
    required: true
    severity: error
    triggers:
      - post-task
      - post-implement
```

`lib/domains/merge-gates.mjs` narrows each merged entry to `id`, `command`, `description`, `severity`, and `tier`. The remaining fields are read from the raw `gates.yaml` entry by the consumer — [`/adev:validate`](skill-reference.md) Check 1 — so `required` and `triggers` govern only where the raw entry is visible. Domain starter gates use `description` rather than `name`.

### `command` is argv-only

`command: [npm, test]`. A shell string is not a gate. A non-array `command` is dropped at load by `lib/domains/merge-gates.mjs` with:

```
INVALID_GATE: Gate '<id>' command must be an argv list (array), not a string — skipped.
```

This is a **different error code from the `validate.yaml` quality-gate runner's `QUALITY_GATE_COMMAND_SHELL`** (documented under [Quality-gate hardening](#quality-gate-hardening)). Same rule, two loaders, two codes: `INVALID_GATE` comes from the `gates.yaml` merge, `QUALITY_GATE_COMMAND_SHELL` from the `validate.yaml` check registry. To convert an existing shell-form command, see "Recipe 3 — you had a shell-form gate command" under [Migrating an existing project](#migrating-an-existing-project).

### Tiers and severity

Tiers execute in order: fast → integration → e2e. Within a tier, an `error`-severity failure stops the remaining gates in that tier and every subsequent tier (fail-fast). A `warning`-severity failure is recorded and execution continues.

Severity resolves in three steps, most specific first:

1. `required: false` forces `warning`, whatever else is set.
2. An explicit per-gate `severity` wins over the tier default.
3. Otherwise the tier default applies: `error` for `fast` and `integration`, `warning` for `e2e`. Within `e2e`, `group: smoke` defaults to `error` and `group: full` to `warning`.

This is the model both [`/adev:validate`](skill-reference.md) Check 1 and [`/adev:implement`](skill-reference.md) Step 2-post use, so the two integration-gate consumers agree on the severity of every gate.

### What a new scaffold ships

`templates/gates-template.yaml` declares `test` (fast) and `integration-test` (integration) with `command: ""` — an **unwired sentinel**, not a working command. Both tiers are therefore *declared* in every scaffold, and both are dropped at load with a named, actionable warning rather than silence:

```
INVALID_GATE: Gate '<id>' missing required command field — skipped.
```

(The empty string is deliberate. An empty array is truthy *and* an array, so it would pass both guards and reach the executor with nothing to run.)

What actually enforces on a fresh scaffold comes from the `software` domain starter (`templates/domains/software/gates.yaml`), which resolves by default when no `domain` is set:

- `quality-gate` — fast tier, `[npm, test]`, `severity: error`.
- `integration-test` — integration tier, `[npm, run, --if-present, test:integration]`, `severity: error`.

The integration gate is LIVE and error-severity, but `--if-present` makes it a verified no-op until the project defines a `test:integration` script. Note that the governance `integration-test` entry never overrides the domain one: it is dropped for the empty command before the override check runs, so no `GATE_OVERRIDE` warning is emitted.

### Graduating it

Add a `test:integration` script to `package.json` and the integration gate starts enforcing — no configuration change, no new gate. To wire the template's own `test` and `integration-test` entries, rerun [`/adev:init`](skill-reference.md), which seeds a real argv command from the detected stack, or set the commands by hand.

Templates are consumed verbatim by `cpSync()`, so these defaults reach NEW scaffolds only. Existing projects are untouched by a plugin upgrade; they must rerun `/adev:init` or edit `governance/gates.yaml` by hand.

### Verifying it

Run `adev gate doctor`. It reads the raw `gates.yaml` directly — it does not merge the domain starter — so on a fresh scaffold it sees the two unwired entries and reports:

```
gate-doctor/empty-command  warning  Gate 'test' declares no command.
gate-doctor/empty-command  warning  Gate 'integration-test' declares no command.
```

Expect exit 0 with zero error-severity findings; the doctor exits non-zero (2) only on an error-severity finding. `gate-doctor/ci-config-missing` (no CI configuration on disk) and `gate-doctor/runner-unknown` (no recognized test runner, so collection cannot be verified) are also warning-severity and are normal for a new project — not regressions.

## Test depth policy in `risk-policies.yaml`

`graduated-rigor-tiers` scales *review and validation* breadth from `risk_level` and the
routing "easy" signal (`review_mode`, `validate_mode`). Test *authoring* depth is the
analogous question and is declared in the same file, per risk level:

```yaml
# governance/risk-policies.yaml
policies:
  high:    { review_mode: full,  validate_mode: full,  test_depth: thorough }
  medium:  { review_mode: full,  validate_mode: full,  test_depth: standard }
  low:     { review_mode: quick, validate_mode: quick, test_depth: minimal }
```

**Rigor mode and test depth are independent mechanisms.** `test_depth` makes no change to
`resolveRigorMode`, its precedence, or its signature — a `quick` rigor tier paired with
`thorough` test depth is legal and expected (e.g. a low-novelty, high-risk change: light
review overhead, deep test coverage). `test_depth` feeds `adev test-policy resolve`, not the
review/validate gate machinery documented above. See
[Test Strategies — Test depth policy](test-strategies.md#test-depth-policy--a-second-independent-axis)
for the full chain, and [Configuration Reference](configuration.md#test_policy-test-depth--granularity)
for the `test_policy` manifest block that supplies the other axis (granularity).

### `sensitive-paths.yaml` — extend-only overlay

The test-depth floor raises a task's assigned depth to `thorough` when its target paths match
a sensitive-path pattern. The built-in `DEFAULT_SENSITIVE_PATHS` set (auth, crypto, secrets,
credentials, `.env*`, key/cert files, this project's own `governance/**` and
`.github/workflows/**`) always applies. `governance/sensitive-paths.yaml` is optional and can
only **extend** that set — the effective set is `DEFAULT_SENSITIVE_PATHS ∪ configured`, and
configuration can never shrink it below the built-in default:

```yaml
# governance/sensitive-paths.yaml — optional, extend-only
sensitive_paths:
  - "src/billing/**"
```

An absent or empty file resolves to the built-in set. A present-but-unparseable file, or one
containing a non-string entry, degrades to the built-in set alone and raises an
`INVALID_SENSITIVE_PATHS` advisory rather than blocking the task — halting every task over one
malformed byte would be disproportionate to an advisory control.

**The floor is advisory, not enforced.** It assigns a task's depth and records that assignment
(`floor_applied`, `floor_legs`, `floor_inputs` on the `test_depth_assigned` event, visible via
`adev test-policy explain` — see [CLI Reference](cli-reference.md#test-policy)); it does not
verify that the authored test suite actually covers what a `thorough` assignment implies. Form
your belief about what this floor guarantees accordingly: it raises intent and creates an
audit trail, it does not enforce coverage.

## Profiles — the foundation

Every reviewer and every quality-gate subprocess runs under a named execution profile. A profile declares, as data:

- Which tool categories the adapter may expose (`filesystem-read`, `search`, `agent`, `web-fetch`, `filesystem-write`, `shell`)
- Which MCP servers must be present (`{ mcp_server: playwright }`)
- Which env keys are allowed and where they come from (`env.files` + `env.allow.required` / `env.allow.optional`)
- Model tier (`fast` / `capable` / `reasoning`) and thinking budget
- Limits (max output tokens, timeout seconds)

### Bundled profiles

Ship at `templates/governance/profiles.yaml` (loaded automatically; no action needed):

| Name | Posture |
|------|---------|
| `read-only` | `filesystem-read` + `search` + `agent`. Filesystem write/execute deny. Network deny. |
| `browser-review` | Extends `read-only`; adds `{ mcp_server: playwright }` + `{ category: web-fetch }`. Network `read-only`. |
| `reviewer-fast` | Extends `read-only`. Model tier `fast`. |
| `reviewer-capable` | Extends `read-only`. Model tier `capable`. |
| `reviewer-reasoning` | Extends `read-only`. Model tier `reasoning` + thinking budget high. |
| `implementer` | Full filesystem/shell/network. **Not consumed in v1.** Reviewers referencing it fail load by design. |

### Project profile overlay

Create `.context-index/profiles.yaml` with the same top-level `profiles:` key. Matching names fully replace the bundled default; new names append.

```yaml
profiles:
  project-gate-profile:
    description: "Acknowledged posture for the e2e smoke quality-gate."
    extends: read-only
    env:
      files:
        - ".env"
        - "optional:.env.local"
        - "$workspace/.env.shared"   # workspace-root sigil; see below
      allow:
        required: ["API_TOKEN", "DATABASE_URL"]
        optional: ["DEBUG_FLAG"]
    limits:
      timeout_seconds: 120
```

Key rules (full list in `.context-index/specs/cross-cutting/execution-profiles.md`):

- `env.files` entries are either bare paths (required to exist) or `optional:`-prefixed (silent-skip on absence).
- `$workspace/<rest>` resolves via `adev-workspace.yaml` at an ancestor directory. The `$` sigil is disjoint from `multi-repo-workspace`'s `@<repo-slug>/<spec-slug>` spec-reference grammar; any `@`-prefixed env-file entry is rejected.
- `{ tool: <literal> }` requires `allow_unportable: true`; wildcards like `{ category: "*" }` are rejected.
- `allow_add` composes additively with the parent's `allow`; a `BROADEN_*` WARN fires at load whenever the child loosens posture (filesystem, network, or new tools).
- Env values under 8 characters are not redacted (a per-key WARN fires at load).

## Reviewer registry (`governance/review.yaml`)

Controls [`/adev:review-specs`](skill-reference.md). The loader reads `templates/review-specs/defaults.yaml` first, then overlays your file.

Full template with commented examples: [`templates/governance/review.example.yaml`](../templates/governance/review.example.yaml).

### Common overrides

**Disable a reviewer.** Useful when one of the three bundled reviewers produces too much noise on a legacy module.

```yaml
reviewers:
  - id: consistency-analyzer
    enabled: false
```

**Cap severity.** Keeps the reviewer active but degrades its findings.

```yaml
reviewers:
  - id: security-reviewer
    severity_cap: warning   # BLOCK -> PASS_WITH_NOTES for this reviewer
```

**Add a project-triggered reviewer.**

```yaml
reviewers:
  - id: project.billing-domain
    name: "Billing Domain Reviewer"
    dispatch:
      triggered:
        patterns: ["specs/features/billing/**/*.md"]
        keywords: ["invoice", "payment", "currency"]
        min_score: 1              # 2 pts per glob match, 1 per keyword
    prompt: "prompts/billing-reviewer.md"   # relative to .context-index/
    profile: reviewer-capable
    context_pack: base
    severity_cap: blocker
```

**Wrap an external skill (package mode).** The runner launches the skill; an adapter subagent extracts findings.

```yaml
reviewers:
  - id: project.packaged-linter
    dispatch: always
    package:
      skill: "skills/my-linter/SKILL.md"
      args:
        spec: "<target>"            # substituted with the target spec path
      # adapter defaults to plugin:review-specs/adapters/generic.md
    profile: reviewer-capable
```

### Context packs

Named, reusable bundles of files appended to reviewer prompts. Shared across `review.yaml` and `validate.yaml` (the skill merges both).

```yaml
context_packs:
  base:
    include:
      - ".context-index/specs/features/billing/charter.md"
      - ".context-index/references/accounting-conventions.md"

  billing:
    extends: base
    include:
      - ".context-index/specs/features/billing/**/*.md"
```

**Hard denylist** (fails load — does NOT reach the reviewer's prompt): `.env*`, `*.pem`, `*.key`, `id_*`, `profiles.yaml`, `**/secrets/**`. Enforced at both glob-string and resolved-path layers.

### Guardrails applied at load

- Reviewer profiles must be read-only-compatible. `{ category: filesystem-write }`, `{ category: shell }`, any `{ tool: <literal> }`, non-deny filesystem write/execute, and non-`{deny, read-only}` network all fail load. `implementer` is forbidden for reviewers.
- Paths (`prompt`, `package.skill`, `package.adapter`) are sandboxed under `.context-index/` — `..` segments rejected pre-resolution; `fs.realpath` catches symlink escape.
- Cross-plugin `plugin:<other-plugin>:...` references fail load with a v2-deferral message.

## Validate check registry (`governance/validate.yaml`)

Controls [`/adev:validate`](skill-reference.md) Checks 2-12. Check 1 stays in `governance/gates.yaml` (unchanged).

Full template with commented examples: [`templates/governance/validate.example.yaml`](../templates/governance/validate.example.yaml).

### Check kinds

| Kind | Purpose | Project can register? |
|------|---------|-----------------------|
| `quality-gate` | Argv-form `execFile` subprocess (npm test, linter, typechecker). | Yes |
| `subagent-review` | LLM-driven review via a prompt + profile. | Yes |
| `deterministic-check` | Bundled library function (e.g. source-manifest verification). | **No** — bundled only |
| `observational` | Runs but never affects verdict (`severity: info` only). | Yes |

### Common overrides

**Disable a bundled check.**

```yaml
checks:
  - id: validate.check-10-platform-drift
    enabled: false
```

**Add an argv-form quality-gate.**

```yaml
checks:
  - id: project.e2e-smoke
    name: "E2E smoke"
    kind: quality-gate
    profile: read-only            # explicit — no implicit default
    command: [npm, run, e2e:smoke]
    severity: error
    fail_fast: true               # skips downstream `after:` on failure
```

**Add a subagent-review after Check 2.**

```yaml
checks:
  - id: project.billing-domain-rules
    kind: subagent-review
    profile: reviewer-capable
    prompt: "prompts/billing-checker.md"
    context_pack: base
    after: [validate.check-2-spec-compliance]
    severity: warning
```

**Add an observational metric.**

```yaml
checks:
  - id: project.adoption-metric
    kind: observational
    severity: info
```

### Quality-gate hardening

The quality-gate runner enforces:

1. **argv form only.** `command: "npm test"` (string) fails load with `QUALITY_GATE_COMMAND_SHELL`.
2. **No interpolation.** Any argv token containing `{{...}}`, `$VAR`, `${VAR}`, or `%VAR%` fails load with `QUALITY_GATE_INTERPOLATION`. Values the subprocess needs come from the profile's resolved env via the process environment, not argv substitution.
3. **Explicit profile.** Omitting `profile` fails load. Profile permissions describe the ADAPTER tool surface, not subprocess sandboxing — you must acknowledge the privilege posture.
4. **Env isolation.** The subprocess env is the profile's resolved env plus a minimal startup set (`PATH`, `HOME`, `LANG`, `LC_ALL`, `LC_CTYPE`, `TMPDIR`, `USER`, `LOGNAME`). `LD_PRELOAD`, `NODE_OPTIONS`, `PYTHONPATH`, and other invoking-shell variables do not leak.
5. **`shell: false`** and `cwd` override blocked.

### Ordering

Checks run in topological order by the `after:` field. Lex-by-id tie-break for independent checks ensures deterministic report order. Cycles fail load. Unknown `after:` targets emit a WARN and are treated as empty.

---

## Extension-contributed entries

An installed extension may append entries to five of the files above — `validate.yaml`, `review.yaml`, `gates.yaml`, `diagnostics.yaml` and `boundaries.yaml`. `risk-policies.yaml` and `sensitive-paths.yaml` are never extension-writable: they are the project's own guard boundary. The author-side contract (writable set, per-registry field allowlists, executable payloads) is in [Extensions](extensions.md#the-governance-contribution-contract); this section covers what you will see in your own files afterwards.

### Provenance stamps

Every appended entry carries `source: extension:<name>`. An entry that is also executable — a `command` on a gate or a `kind: quality-gate` check, or a reviewer `package.skill` / `package.adapter` — additionally carries `exec_consented_at`, an ISO timestamp of the install at which you granted execution consent.

```yaml
gates:
  - id: my-extension.schema-lint
    command: ["/home/me/proj/.context-index/extensions/my-extension/bin/lint.sh"]
    tier: fast
    source: extension:my-extension
    exec_consented_at: 2026-08-15T12:00:00.000Z
```

Both fields are installer-owned. An extension that supplies either one is refused at install with `GOVERNANCE_SOURCE_FORGED`, so a stamp you read in your file was written by adev, not by the extension.

**Provenance is file-level and invisible to gate consumers.** `lib/domains/merge-gates.mjs` projects exactly five fields onto each merged gate — `id`, `command`, `description`, `severity`, `tier` — and drops everything else, so nothing downstream of the merge ever observes `source` or `exec_consented_at`. That is intended rather than an oversight: the stamps exist for uninstall and audit, and both of those read the file directly.

### What an install will not do to your entries

- **A colliding `id` is skipped, never merged.** If an extension contributes an entry whose `id` already exists in your registry, the extension's entry is dropped and yours is left byte-identical — no field is overwritten, and no key is introduced onto it, absent or otherwise. The install report lists the id under skipped. An extension therefore cannot inject a `command` into a commandless gate you scaffolded.
- **An unparseable registry is refused, not replaced.** If the target file does not parse, the merge fails with `GOVERNANCE_PARSE_REFUSED` and writes nothing. It is never treated as an empty registry — doing so would overwrite your entries and bypass collision detection at the same time. The same refusal covers a duplicated root key, a root key that is not a sequence, and mixed or lone-CR line endings. Fix the file (or its line endings) and re-run the install.
- **Comments and sibling keys survive.** The merge splices the target key's block by line range rather than reserializing the file, so every byte outside the inserted lines — comments, formatting, other top-level keys — is written back unchanged.

## Migrating an existing project

Zero-config projects migrate with nothing to do — the bundled defaults reproduce the pre-0.18.0 behavior bit-for-bit.

### Recipe 1 — you have custom specialists in `manifest.yaml`

Pre-0.18.0 path:

```yaml
# manifest.yaml
specialists:
  - id: my-specialist
    trigger_patterns: ["**/payment.md"]
    trigger_keywords: ["stripe"]
    prompt: "plugin:review-specs/structural-architect-prompt.md"
    invoke: subagent
```

0.18.0 gives you two options.

**Option A — do nothing.** Specialists in `manifest.yaml` are still honored. At load, [`/adev:review-specs`](skill-reference.md) emits this advisory once per run:

> `manifest.yaml:specialists is deprecated. Move entries to governance/review.yaml:reviewers. Support will be removed in 0.19.0.`

Each specialist is converted in-memory to a `dispatch: triggered` reviewer under the `reviewer-capable` profile. Everything keeps working.

**Option B — migrate to `governance/review.yaml`.**

```yaml
# .context-index/governance/review.yaml
reviewers:
  - id: my-specialist
    dispatch:
      triggered:
        patterns: ["**/payment.md"]
        keywords: ["stripe"]
        min_score: 1
    prompt: "plugin:review-specs/structural-architect-prompt.md"
    profile: reviewer-capable
```

Then remove the `specialists:` block from `manifest.yaml`. Advisory disappears on the next run.

### Recipe 2 — you need custom env for a quality-gate

Pre-0.18.0: gates inherited the shell environment, so `DATABASE_URL=... npm run e2e` in CI would silently work.

0.18.0: the subprocess env is isolated. Declare keys in a profile.

**Before** (pre-0.18.0, manifest or gates.yaml):
```yaml
# governance/gates.yaml (pre-0.18.0 pattern)
- id: e2e
  command: "npm run e2e"
```

**After** (0.18.0):

```yaml
# .context-index/profiles.yaml
profiles:
  e2e-gate:
    extends: read-only
    env:
      files: [".env", "optional:.env.local"]
      allow:
        required: ["DATABASE_URL"]
        optional: ["DEBUG_FLAG"]

# .context-index/governance/validate.yaml
checks:
  - id: project.e2e-smoke
    kind: quality-gate
    profile: e2e-gate
    command: [npm, run, e2e:smoke]
    severity: error
```

If `DATABASE_URL` is missing from every `env.files` path, load fails with the file list cited. No more silent skips.

### Recipe 3 — you had a shell-form gate command

```yaml
# before (pre-0.18.0)
- command: "npm test && echo done"

# after (0.18.0) — argv only
command: [npm, test]
```

Compound shell operations (`&&`, `|`, redirections) are intentionally rejected. Split them into two checks with `after:`:

```yaml
checks:
  - id: project.test
    kind: quality-gate
    profile: read-only
    command: [npm, test]
    fail_fast: true

  - id: project.post-test-echo
    kind: quality-gate
    profile: read-only
    command: [echo, "done"]
    after: [project.test]
```

### Recipe 4 — reviewer that needs browser automation

Pre-0.18.0: reviewers ran with whatever the harness exposed.

0.18.0: declare the MCP explicitly so missing Playwright fails at load, not during dispatch.

```yaml
reviewers:
  - id: project.ui-reviewer
    dispatch:
      triggered:
        patterns: ["specs/features/ui/**/*.md"]
        min_score: 1
    prompt: "prompts/ui-reviewer.md"
    profile: browser-review    # ships Playwright MCP requirement + read-only net
```

### Recipe 5 — custom specialist that wrote files (pre-0.18.0)

If a specialist's prompt asked the model to touch files, that worked pre-0.18.0 because dispatch posture was implicit. In 0.18.0 reviewer profiles are clamped to read-only-compatible — `filesystem-write`, `shell`, and literal tools are rejected at load.

Your options:

1. **Move the write-path work out of review.** Reviews surface findings; the write happens in a separate [`/adev:implement`](skill-reference.md) pass or hand-rolled skill.
2. **Convert to package mode.** The runner runs the skill under a permissive profile you explicitly declare; the adapter extracts findings without needing write access. The reviewer dispatch surface stays observational.

```yaml
reviewers:
  - id: project.autofix-reviewer
    dispatch: triggered
    package:
      skill: "skills/my-autofix/SKILL.md"   # write-capable skill stays external
    profile: reviewer-capable               # reviewer clamp still read-only
```

## Verifying your migration

1. `npm test` or whatever your project uses — the registries add no runtime cost.
2. Run [`/adev:review-specs --spec <path>`](skill-reference.md) against one spec and diff the new `.review.md` against the pre-0.18.0 output. Zero-config should be byte-identical.
3. Run [`/adev:validate --spec <path>`](skill-reference.md) and confirm `Reviewers Dispatched` / `Checks` tables match your expected list. Any disabled entries appear as `SKIPPED-DISABLED`.
4. Grep the report for `BROADEN_`, `TOOL_UNPORTABLE_WARN`, or `UNKNOWN_CATEGORY` warnings — these surface intentional but noisy configurations for review.
5. If you land a quality-gate, the first run should either PASS with redacted stdout or FAIL with a spec-exact error code from the [hardening list](#quality-gate-hardening). Ambiguous messages are a bug.

## Further reading

- Cross-cutting spec: `.context-index/specs/cross-cutting/execution-profiles.md` (planned)
- Reviewer spec: [`.context-index/specs/features/review/configurable-reviewers.spec.md`](../.context-index/specs/features/review/configurable-reviewers.spec.md)
- Check spec: [`.context-index/specs/features/validation/configurable-checks.spec.md`](../.context-index/specs/features/validation/configurable-checks.spec.md)
- Eval harness (deterministic, no LLM): `tests/evals/configurable-governance/README.md`
- ADRs: [`0003-configurable-review-registry`](../.context-index/adrs/0003-configurable-review-registry.md), [`0004-execution-profiles`](../.context-index/adrs/0004-execution-profiles.md)
