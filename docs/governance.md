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

## The four governance files

| File | Owner skill | What it does |
|------|-------------|--------------|
| `.context-index/governance/gates.yaml` | [`/adev:validate`](skill-reference.md) Check 1 | Tiered quality gates (fast/integration/e2e). Pre-0.18.0 behavior, unchanged. |
| `.context-index/governance/review.yaml` | [`/adev:review-specs`](skill-reference.md) | Project reviewer registry — add, disable, override, trigger. |
| `.context-index/governance/validate.yaml` | [`/adev:validate`](skill-reference.md) Checks 2-12 | Project check registry — enable/disable, add custom checks, gate on topology. |
| `.context-index/profiles.yaml` | cross-cutting | Execution profiles: tool permissions, env allowlist, model tier, redaction. Consumed by every reviewer and check. |

All four are optional. Absent files mean "use bundled defaults."

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
