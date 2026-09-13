## Step 3: Load Reviewer Registry

**The dispatching set.** Run this FIRST — its output is the reviewer set you dispatch:

```bash
adev governance reviewers --json
```

The envelope is `{ reviewers, model_tiers, disabled, context_packs, verdict_rules, warnings, errors, notes }`.

Each reviewer entry carries a resolved `model_tier` and `model`, mapped from its
profile's tier through `.context-index/platform-context.yaml:model_tiers`. Step 4
passes that `model` to the dispatch. A `null` model means the project configures no
tier for that reviewer, and the dispatch inherits the session model. Abort on any `errors` entry; surface `warnings` and `notes` in the report header. This verb wraps `loadReviewConfig` (`lib/governance/review-config.mjs`), which reads the project's MATERIALIZED `.context-index/governance/review.yaml` and **nothing else**, and fails closed with `REGISTRY_NOT_MATERIALIZED` when the file exists without its marker.

**Comparison view (optional).** To see what the active domain WOULD contribute, so the report can name reviewers the project has not adopted:

```bash
adev domain load-reviewers --module <module-slug> [--charter <charter-path>]
```

The verb resolves the active domain (charter frontmatter → manifest.modules[].domain → manifest.project.domain → 'software'), loads `templates/domains/<domain>/reviewers.yaml`, and merges `.context-index/governance/review.yaml` on top (governance wins on `id` conflict). Stdout is a single JSON object:

```json
{ "domain": { "resolved_domain": "...", "source_level": "..." }, "reviewers": [...], "warnings": [...] }
```

Log any warnings from the `warnings` field.

`adev domain load-reviewers` is a COMPARISON VIEW ONLY. It merges the domain overlay over the project file, and none of that merge dispatches: the set that runs is the one `adev governance reviewers` printed above. Neither the bundled defaults nor the domain overlay contributes at run time: a domain's reviewers are adopted once, by `adev governance materialize --registry review`, which writes them into the project's own file and stamps its write-once marker. The `adev domain load-reviewers` output above is therefore a comparison view — reviewers it lists that the project file does not declare are NOT dispatched, and hygiene Pass 19 is where that divergence is reported. The loader:

- Fails closed (`REGISTRY_NOT_MATERIALIZED`) when `review.yaml` exists without its `materialized_at` marker; a project with no `review.yaml` at all runs no reviewers.
- Reads `templates/review-specs/defaults.yaml` for `context_packs` and `verdict_rules` only, with the project's values winning field-by-field.
- Resolves each reviewer's execution profile via `lib/profiles/` and **rejects any reviewer whose profile is not read-only-compatible** (no `filesystem-write`/`shell` categories, no literal tools, fs write/execute must be `deny`, network must be `deny` or `read-only`). A reviewer referencing `implementer` fails load.
- Validates `prompt` / `package.skill` / `package.adapter` paths: `plugin:<skill>/<file>` scheme resolves inside the plugin `skills/` tree; relative paths resolve under `.context-index/` with traversal guard (`..` rejected, `fs.realpath` used for symlink escape); absolute paths rejected; cross-plugin (`plugin:<other>:...`) deferred to v2.
- Migrates `manifest.yaml:specialists` in-memory to `dispatch: triggered` reviewer entries and emits a deprecation note (scheduled for removal in 0.19.0).

If `adev governance reviewers` reported any `errors`, abort with the error list. Warnings are surfaced in the report header.
