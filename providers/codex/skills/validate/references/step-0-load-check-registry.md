## Step 0: Load Check Registry

**Heuristics:** Before loading the check registry, load module-scoped heuristics for the spec's charter module via the CLI:

```bash
adev heuristics retrieve --module <charter-module> --tier summary --format text
```

Derive the module slug from the spec's `charter:` frontmatter field. Stdout is either rendered markdown blocks (one per heuristic) or the literal sentinel `__NONE__` when no heuristics match. The verb exits 0 regardless — retrieval failures degrade to `__NONE__` so heuristic injection stays non-blocking.

When heuristics are present (output is not `__NONE__`), include them in the validation context so checks can reference learned patterns and prepend: "The following heuristics are lessons learned from past work in this module. Use them as guidance, not as hard rules."

**Domain-Aware Gate Loading:** Resolve the active domain and load domain-specific gates before running checks via the CLI:

```bash
adev domain load-gates --module <module-slug> [--charter <charter-path>]
```

The verb resolves the active domain (charter frontmatter → manifest.modules[].domain → manifest.project.domain → 'software'), loads `templates/domains/<domain>/gates.yaml`, and merges `.context-index/governance/gates.yaml` on top (governance wins on `id` conflict). Stdout is a single JSON object:

```json
{ "domain": { "resolved_domain": "...", "source_level": "..." }, "gates": [...], "warnings": [...] }
```

Log any warnings from the `warnings` field. The `gates` list is the resolved gate set for Check 1. When Check 1 resolves gates, use this merged list instead of reading `governance/gates.yaml` directly — domain gates are already merged in. Gate commands continue to execute via `execFile` (no shell interpolation).

Before running any check, call `loadValidateConfig(repoRoot)` from `lib/governance/validate-config.mjs`. The loader follows the **single-source model** (per `validate-config-single-source.spec.md`):

- **Preflight (missing-file check):** If `.context-index/governance/validate.yaml` does not exist, `loadValidateConfig` throws `MISSING_VALIDATE_CONFIG` with the message: `"No governance/validate.yaml found. Run /adev:init to scaffold the validate configuration for your domain."` The skill catches this only to surface the message and stop — no checks dispatch, no report is written.
- **Standing warning — zero enabled checks (distinct from the missing-file case above).** This is
  a **different** case from the preflight above: the file **exists** but
  `loadValidateConfig(...).checks.filter(c => c.enabled !== false).length === 0` — either an empty
  `checks` array or a non-empty one where every entry is disabled. Unlike the absent-file case,
  this does **not** throw and does **not** abort. Print the standing warning as a report-header
  line, not suppressible by the normal report format:

  ```
  ⚠ No checks are configured for this project — /adev:validate will dispatch zero checks. Run
  /adev:init to configure governance/validate.yaml, or this is expected if the project
  intentionally selected none.
  ```

  Then proceed to run Check 1 and every other configured check as normal — there are none, so the
  run completes with no findings and a normal verdict. Do not conflate the two paths: an absent
  file is `MISSING_VALIDATE_CONFIG` and hard-stops with no report; an existing file with zero
  enabled checks warns and still produces a complete, passing report.
- **Direct read:** Loads `.context-index/governance/validate.yaml` directly. There is no bundled-defaults file, no overlay merge. The project file is the entire registry. It was scaffolded at `/adev:init` time from `templates/domains/<domain>/validate.yaml`.
- **Id allowlist (SEC-1):** Every entry's `id` is validated against `^[a-z0-9][a-z0-9._-]*$` BEFORE any `plugin:` URI construction. Non-conforming ids fail load with `INVALID_CHECK_ID` and the offending value is stripped to allowlist chars + truncated to 64 chars in the diagnostic.
- **Prompt URI resolution:** For each entry's `prompt` field, the loader resolves `plugin:validate/checks/<id>.md` to `<pluginRoot>/skills/validate/checks/<id>.md` with path-containment and absolute/cross-plugin guards. Project-relative paths resolve under `.context-index/`. The resolved absolute path is stored on the check object as `resolvedPromptPath`.
- **Per-kind validation:** Validates each entry's `kind` (`quality-gate` | `subagent-review` | `deterministic-check` | `observational`).
  - `quality-gate`: rejects string-form `command`; rejects any argv token containing `{{...}}`, `$VAR`, `${VAR}`, or `%VAR%` interpolation; requires an explicit `profile` (no implicit default — authors must positively acknowledge that profile permissions scope the adapter's tool surface, NOT the spawned subprocess).
  - `observational`: rejects `severity: error`.
  - `deterministic-check`: only the bundled allowed-id set (`validate.check-1.5-source-manifest`) may use this kind; other ids fail with `DETERMINISTIC_PROJECT`.
- Resolves each check's profile via `lib/profiles/` (MCP-missing fails load; required env missing fails load).
- Topologically sorts by `after` with lex-by-id tie-break; cycles fail load; unknown `after` ids emit WARN.

Abort on any loader error. Warnings surface in the report header. Check 1 (quality gates) IS a registry entry (`validate.check-1-quality-gates`, `kind: deterministic-check`, `severity: error`, `fail_fast: true`) — the entry declares the check's severity so its `validator_report` is stamped `error` rather than defaulting to `warning`. Its *gate set* is sourced from the project's MATERIALIZED `governance/gates.yaml` and nothing else, via `adev domain load-gates` above. The domain overlay is NOT merged at run time — `loadCheck1Gates` composes it only under `composeDomainOverlay`, which only `adev governance materialize --registry gates` sets. A domain gate that the project has not materialized does not run. The registry entry does not change where gates come from.

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill validate
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.
