# ADR 0003: Data-Driven Registry for Review and Validate Skills

## Status

Proposed

> **Revised 2026-04-19**: Sandbox/tier/thinking-budget concerns originally proposed in this ADR have been promoted into a separate primitive — see ADR-0004 (Execution Profiles). This ADR now focuses solely on the reviewer/check **registry** decision; how each registered work unit *runs* is the job of execution profiles, which the registries reference by name.

## Date

2026-04-19

## Context

The `/adev:review-specs` and `/adev:validate` skills currently hardcode their work unit lists in `SKILL.md`:

- `skills/review-specs/SKILL.md` names three reviewers (Structural Architect, Security Reviewer, Consistency Analyzer), each with a bespoke context package rendered inline in the markdown. Only the *additional* "domain specialists" layer is data-driven, via `manifest.yaml:specialists`.
- `skills/validate/SKILL.md` names twelve checks in prose. Only Check 1 (Quality Gates) is data-driven, via `governance/gates.yaml`. Checks 2-12 are described in markdown.

This asymmetry has two costs:

1. **Projects cannot customize behavior** without forking the plugin. A project that wants to skip the consistency analyzer, add a domain-specific reviewer as a first-class voice (not a lower-priority specialist), cap a reviewer's severity, or disable Check 10 (Platform Drift) has no supported mechanism.
2. **Two parallel concepts do the same job.** "Core reviewers" and "domain specialists" differ only in whether they're hardcoded; reviewer identity and dispatch logic belong in the same registry.

The plugin already has a precedent for this transition: `governance/gates.yaml` replaced the hardcoded gate list in Check 1 and the deprecated `manifest.yaml:gates` section. That migration is complete and stable.

## Decision

**We will extend the `governance/` pattern to cover reviewer selection in `/adev:review-specs` and the Checks 2-12 registry in `/adev:validate`, via two new files: `governance/review.yaml` and `governance/validate.yaml`.**

Both files follow the same shape as `governance/gates.yaml`: a declarative list of work units with canonical IDs, per-entry overrides, and sensible defaults shipped with the plugin.

### Scope of change

- **Reviewer registry** (`governance/review.yaml:reviewers[]`): unifies today's "core reviewers" and "domain specialists" into a single list. Each entry has `id`, `dispatch` (`always` | `triggered` | `never`), `profile` (reference to an execution profile per ADR-0004), `context_pack`, `severity_cap`, and either `prompt` (subagent mode) or `package` (external-skill wrap mode — see configurable-reviewers spec). The three built-ins ship as defaults in `plugin:review-specs/defaults.yaml`. Prompts are referenced via a `plugin:` URI scheme.
- **Context packs** (`governance/review.yaml:context_packs`): named, reusable file bundles (with `extends`) that reviewers reference by name instead of duplicating file lists per reviewer.
- **Check registry** (`governance/validate.yaml:checks[]`): every Check 2-12 gets a canonical ID (e.g. `validate.check-2-spec-compliance`) and a `kind` (`quality-gate` | `subagent-review` | `deterministic-check` | `observational`). Check 1 remains sourced from `governance/gates.yaml` unchanged.
- **Manifest deprecation**: `manifest.yaml:specialists` is deprecated in favor of `governance/review.yaml:reviewers`. A one-minor-version migration advisory emits on read; the field is then removed.
- **Parser**: add `lib/governance/review-config.mjs` and `lib/governance/validate-config.mjs`. Stay zero-dependency per constitution; extend the existing line-based YAML parser or add a sibling parser for these shapes.
- **External-skill packaging (configurable-reviewers spec, package mode)**: a reviewer can wrap an existing skill as a black-box package — runner subagent invokes the skill verbatim under a profile, adapter subagent extracts findings. No `review-safe` opt-in; the skill stays unaware. Tool/env/MCP scoping comes from the profile (ADR-0004).

### Alternatives Considered

1. **Inline toggles in `manifest.yaml`.** Add `review_steps:` and `validation_checks:` sections to the existing manifest. Simpler migration. Rejected: gates already moved *out* of manifest into `governance/` (`skills/validate/SKILL.md:39`); doing the opposite for reviewers breaks the established pattern. Governance config is now consistently scoped under `.context-index/governance/`.

2. **Plugin hook system.** Introduce runtime hooks that project code can register to add/remove/wrap steps. Maximum flexibility. Rejected: executable plugin code conflicts with CLAUDE.md principle #2 ("Skills are primarily markdown"). Declarative YAML matches the plugin's existing philosophy and is safer for agent-authored changes.

3. **Frontmatter step toggles in SKILL.md.** Add per-step `enabled`/`disabled` metadata inside the skill file's YAML frontmatter. Rejected: SKILL.md is shipped per-plugin-version, not per-project. Project-level config must live in the project's `.context-index/`.

4. **Cross-cutting spec, no new governance files.** Document the registry shape conceptually and let each skill parse it however it likes. Rejected: produces two incompatible parsers and no shared library, defeating the purpose.

### Why This Decision

- **Consistency with `governance/gates.yaml`.** One place, one shape, one mental model for project-level skill customization.
- **Zero behavior change for existing projects.** Bundled `plugin:review-specs/defaults.yaml` and `plugin:validate/defaults.yaml` encode today's hardcoded lists verbatim. Projects without `governance/review.yaml` or `governance/validate.yaml` get the current behavior.
- **Unifies two duplicate concepts.** The core/specialist split was never principled — it was a consequence of implementation order. A single `reviewers[]` list reflects the real model.
- **Respects plugin boundaries.** The SKILL.md files still describe steps in prose; only the inputs to those steps become data. The hook protocol, CLI path structure, and plugin registration are unchanged.

## Consequences

### Positive

- Projects can disable, reorder, cap severity on, or add reviewers and checks via YAML.
- Domain specialists become first-class reviewers (no longer a second-tier concept).
- `/adev:validate` Checks 2-12 gain the same fail-fast / severity semantics already proven for Check 1.
- Removes one of the two parallel reviewer-selection paths, simplifying `skills/review-specs/SKILL.md` Steps 3-4.
- Prompt override via `plugin:<skill>/<file>` vs. project-relative paths gives projects a clean escape hatch to replace a default reviewer's prompt without forking the plugin.

### Negative

- More YAML surface area: three governance files (`gates.yaml`, `review.yaml`, `validate.yaml`) instead of one. Mitigated by `/adev:init` scaffolding all three together with commented-out examples.
- The zero-dep YAML parser grows to handle nested lists with `extends` references. Non-trivial but tractable — still smaller than a full YAML library.
- Default behavior now lives in a bundled `defaults.yaml` rather than inline in SKILL.md. Readers of the skill must open a second file to see the default reviewer list.
- Migration of `manifest.yaml:specialists` requires a deprecation window. Two active code paths during that window.

### Neutral

- Reviewer and check prompts still live as separate markdown files referenced by path; they are not inlined into YAML. This keeps prompts legible but means a custom reviewer is two files (prompt + registry entry).
- Bundled defaults are versioned with the plugin; upgrading the plugin upgrades defaults. Projects pinning behavior must either copy the defaults into `governance/review.yaml` or override the specific IDs they care about.

## Related

- `.context-index/adrs/0004-execution-profiles.md` — promoted-out primitive that the registries consume
- `.context-index/specs/cross-cutting/execution-profiles.md` — profile schema and behavior
- `.context-index/specs/features/review/configurable-reviewers.md` — reviewer registry spec (rev 2)
- `.context-index/specs/features/validation/configurable-checks.md` — check registry spec (rev 2)
- `.context-index/specs/features/unified-gates/unified-gate-system.md` — precedent for `governance/` migration
- `skills/review-specs/SKILL.md` — current hardcoded reviewer list
- `skills/validate/SKILL.md` — current Check 2-12 prose
- `templates/manifest-template.yaml` — current `specialists` section (to be deprecated)
- CLAUDE.md "Architecture Boundaries" — this ADR covers a change that would otherwise require human approval
