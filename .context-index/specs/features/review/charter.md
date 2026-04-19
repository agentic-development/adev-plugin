---
status: draft
revision: 1
updated: 2026-04-19
---

# Feature Charter: Review

## Business Intent

Architecture review is the gate between specification and planning. This module owns the tooling that runs parallel specialist subagents over Live Specs, consolidates their findings into a single verdict, and updates spec status to block or unblock planning. It exists as a distinct module (parallel to `validation`) because its subject matter — reviewing proposed designs before code is written — is mechanically and temporally different from post-implementation validation.

## Scope and Boundaries

### In Scope

- The `/adev:review-specs` skill and its bundled reviewer prompts (structural architect, security reviewer, consistency analyzer).
- The reviewer registry contract (`governance/review.yaml:reviewers[]`) and reusable context packs.
- Reviewer dispatch logic: `always`, `triggered` (pattern/keyword match), `never`.
- Verdict consolidation (PASS, PASS_WITH_NOTES, BLOCK) across all dispatched reviewers.
- Production of the `.review.md` gate artifact that `/adev:plan` consumes.
- Spec status transitions `review-pending` → `review-passed` | `review-blocked` on review completion.
- Prompt resolution via the `plugin:<skill>/<file>` URI scheme for bundled defaults and project-relative paths for overrides.

### Out of Scope

- Post-implementation validation (owned by `validation` charter).
- Quality gate execution (owned by `unified-gates` charter via `governance/gates.yaml`).
- Spec authoring and revision (owned by `spec-lifecycle` charter).
- Plan generation (owned by `planning` charter).
- Task management and issue tracking (owned by `task-management` charter).

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| spec-lifecycle | internal module | Provides the spec files this module reviews; consumes the review's status update. |
| unified-gates | internal module | Shared governance-config precedent; `governance/gates.yaml` pattern informs `governance/review.yaml`. |
| validation | internal module | Sibling capability with symmetric configuration shape (checks registry mirrors reviewer registry). |
| platform-context.yaml | shared config | Provides `model_tiers` used by reviewer dispatch. |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Reviewer | A subagent that evaluates a spec from one perspective. | `id`, `prompt`, `tier`, `dispatch`, `context_pack`, `severity_cap` |
| ContextPack | A named, reusable bundle of files injected into a reviewer's prompt. | `name`, `extends`, `include` (labeled paths/globs) |
| Finding | One issue raised by one reviewer about one spec. | `reviewer_id`, `severity` (blocker/warning/suggestion), `message`, `location` |
| ReviewReport | Consolidated output of all reviewers for one spec. | `verdict`, `findings[]`, `last-reviewed-revision`, `file-sha` |
| ReviewConfig | Project-level customization loaded from `governance/review.yaml`. | `reviewers[]`, `context_packs`, `verdict_rules` |

### Relationships

- One spec → one ReviewReport → many Findings from many Reviewers.
- One Reviewer references one ContextPack; multiple Reviewers can share a pack.
- ReviewConfig merges bundled defaults (`plugin:review-specs/defaults.yaml`) with project overrides.

### Invariants

- A reviewer's `severity_cap` clamps its emitted severity (e.g. `severity_cap: warning` demotes any `blocker` finding to `warning`).
- Verdict is derived purely from consolidated findings; it is never set directly.
- A spec cannot transition to `review-passed` except via this module's skill.
- Bundled defaults must preserve current behavior: in the absence of `governance/review.yaml`, `/adev:review-specs` produces identical output to today's hardcoded flow.

## Capability Map

| Capability | Description | Priority | Phase | Status |
|-----------|-------------|----------|-------|--------|
| Configurable reviewer registry | Project-level `governance/review.yaml` controls which reviewers run, their prompts, tiers, dispatch, and severity caps. | must-have | v1 | draft |
| Bundled defaults preservation | Plugin ships `plugin:review-specs/defaults.yaml` encoding today's three-reviewer flow; projects with no governance file see no change. | must-have | v1 | draft |
| Context pack rendering | Named, reusable file bundles with `extends` resolve to concrete file contents at dispatch time. | must-have | v1 | draft |
| Specialists migration | Deprecate `manifest.yaml:specialists` with a one-minor-version advisory; surface the new registry as the replacement. | should-have | v1 | draft |
| Prompt URI scheme | `plugin:<skill>/<file>` resolves to bundled skill files; project-relative paths override. | must-have | v1 | draft |

## Deferred Capabilities

| Capability | Reason | Target Phase | Depends On |
|-----------|--------|-------------|------------|
| Reviewer reordering | Today's reviewers run in parallel; ordering affects only report rendering. Deferred until user demand emerges. | v2 | — |
| Conditional verdict rules | Project-custom verdict math (e.g. "3 warnings = BLOCK"). Defaults from v1 will expose `blocker_threshold`; custom expressions deferred. | v2 | — |
| Reviewer composition / chaining | A reviewer whose input is another reviewer's findings. Out of scope for registry-level config. | post-launch | — |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `/adev:review-specs` | skill | User-invoked entry point; reads `governance/review.yaml` (or defaults) and dispatches reviewers. |
| `.review.md` files | artifact | Gate artifact consumed by `/adev:plan`; contains verdict and findings. |
| `lib/governance/review-config.mjs` | library | `loadReviewConfig(repoRoot)` returns merged config (defaults + project overrides). |
| `lib/governance/context-pack.mjs` | library | `renderPack(pack, {spec, module})` returns injected string. |
| `plugin:review-specs/defaults.yaml` | bundled config | Encodes the three default reviewers and their context packs. |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| Live Spec files + frontmatter | spec-lifecycle | Specs under review; status field is updated on completion. |
| `platform-context.yaml:model_tiers` | shared config | Tier-to-model mapping for reviewer dispatch. |
| `lib/workspace.mjs:resolveRef` | multi-repo-workspace | Cross-repo `depends-on` resolution during review. |
| Charter, constitution, ADRs, cross-cutting specs | spec-lifecycle | Loaded into context packs for reviewers. |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Performance | Reviewer dispatch is parallel; a review of one spec with three default reviewers completes in ≤ the slowest reviewer's latency plus config-load overhead (target: config load < 50 ms). |
| Determinism | Same spec + same config + same reviewer models → same dispatched prompts (findings may vary by model non-determinism, not by framework). |
| Backward compatibility | Projects without `governance/review.yaml` see identical behavior to the current hardcoded flow. Projects with `manifest.yaml:specialists` continue to work for one minor version with advisory. |
| Observability | Each reviewer's tier, prompt source (`plugin:` vs project path), and dispatch decision is reported in the review output. |
| Security | Reviewer prompts from project-relative paths are read-only; no eval, no shell expansion. `plugin:` URIs resolve only within the plugin's `skills/` tree. |
