# Live Spec: Configurable Reviewer Registry

---
charter: review
status: draft
risk_level: medium
revision: 1
charter-revision: 1
created: 2026-04-19
updated: 2026-04-19
depends-on:
  - .context-index/adrs/0003-configurable-review-registry.md
---

## Behavioral Contract

### Preconditions

- `.context-index/` exists with `manifest.yaml`, `constitution.md`, and (optionally) governance files.
- `plugin:review-specs/defaults.yaml` is shipped with the plugin and encodes the three default reviewers (structural architect, security reviewer, consistency analyzer) plus their context packs.
- `manifest.yaml:specialists` may or may not be populated; `governance/review.yaml` may or may not exist.

### Behaviors

#### Registry Loading and Merge

1. **When** `/adev:review-specs` runs **then** it calls `loadReviewConfig(repoRoot)` from `lib/governance/review-config.mjs` before Step 3. The function reads bundled defaults from `plugin:review-specs/defaults.yaml` first, then overlays any project-level `governance/review.yaml`. Project entries merge by `id`: a project entry with a matching `id` overrides the default entry field-by-field; a project entry with a new `id` is appended.

2. **When** `governance/review.yaml` does not exist **then** the merged config equals the bundled defaults and behavior is identical to today's hardcoded flow. No warning is emitted. This is the zero-config case.

3. **When** `governance/review.yaml` exists but is empty or missing the `reviewers:` key **then** the bundled defaults apply unchanged and an informational note is emitted: `"governance/review.yaml found but no reviewers declared — using bundled defaults."`

4. **When** `governance/review.yaml` exists and contains a `reviewers:` list **then** each entry is validated. Required fields: `id`, `prompt`, `tier`, `dispatch`. Optional fields: `context_pack` (default: `base`), `severity_cap` (default: `blocker`), `think_directive` (default: unset), `enabled` (default: `true`).

5. **When** a reviewer entry has `enabled: false` **then** it is excluded from dispatch regardless of whether it is a default or project-defined reviewer. This is the mechanism for disabling a default reviewer (e.g. turning off the consistency analyzer on a small project).

#### Schema Validation

6. **When** a reviewer entry is missing a required field **then** load fails with a specific error: `"Reviewer '<id>': missing required field '<field>'"`. The skill exits non-zero before any dispatch.

7. **When** a reviewer entry has `tier` not in `{fast, capable, reasoning}` **then** load emits WARN: `"Reviewer '<id>': unknown tier '<value>' — defaulting to 'capable'"` and continues with `capable`.

8. **When** a reviewer entry has `dispatch` not in `{always, triggered, never}` (or a triggered object) **then** load fails with error.

9. **When** a reviewer entry has `severity_cap` not in `{blocker, warning, suggestion}` **then** load emits WARN: `"Reviewer '<id>': unknown severity_cap '<value>' — defaulting to 'blocker'"` and continues with `blocker`.

10. **When** two reviewer entries share the same `id` **after** merge **then** the later entry wins; WARN is emitted: `"Duplicate reviewer id '<id>' — second definition ignored."`

#### Prompt Resolution

11. **When** a reviewer's `prompt` field begins with `plugin:<skill-name>/<file>` **then** the resolver maps it to `<plugin-root>/skills/<skill-name>/<file>` and reads the file. If the path escapes the plugin `skills/` tree (e.g. via `..`), load fails with security error: `"Reviewer '<id>': prompt path '<path>' escapes plugin skills directory."`

12. **When** a reviewer's `prompt` field is a relative path (no scheme) **then** it is resolved relative to `<repo-root>/.context-index/`. If the file does not exist, load fails with error.

13. **When** a reviewer's `prompt` field is an absolute path **then** load fails with error: `"Reviewer '<id>': absolute prompt paths are not supported — use 'plugin:' scheme or a .context-index-relative path."`

#### Context Pack Rendering

14. **When** a reviewer is dispatched **then** its `context_pack` name is resolved against `governance/review.yaml:context_packs` (merged with bundled defaults). Unknown pack names fail with error: `"Reviewer '<id>': unknown context_pack '<name>'."`

15. **When** a context pack has an `extends` key **then** the parent pack is resolved recursively and its `include` entries are concatenated with the child's. Circular `extends` chains fail with error: `"Context pack cycle detected: <a> -> <b> -> <a>"`.

16. **When** a context pack includes a labeled path like `charter: .context-index/specs/features/<module>/charter.md` **then** the `<module>` placeholder is substituted from the target spec's charter frontmatter. Missing substitutions emit WARN and skip that include.

17. **When** a context pack `include` entry is a glob **then** all matching files are concatenated, each prefixed with its filename, into a single labeled section. Empty glob results produce a labeled section with body `"<no matches>"` rather than omitting the section.

#### Dispatch Selection

18. **When** a reviewer has `dispatch: always` **then** it is dispatched for every spec under review.

19. **When** a reviewer has `dispatch: triggered` (an object with `patterns`, `keywords`, `min_score`) **then** the existing scoring logic from `skills/review-specs/SKILL.md:86` applies: 2 points per matching glob pattern (+1 per path segment beyond root), 1 point per matching keyword. The reviewer dispatches iff score ≥ `min_score` (default: 1).

20. **When** a reviewer has `dispatch: never` **then** it is excluded from dispatch. This is distinct from `enabled: false` only in semantic intent (`never` is a routing decision; `enabled: false` is a config toggle).

#### Subagent Invocation

21. **When** a reviewer is dispatched **then** it is launched via the Agent tool (subagent_type: `general-purpose`) with:
    - `description`: `"<reviewer.name> review of <spec-slug>"`
    - `prompt`: `[<think_directive>\n\n]<prompt-file contents>\n\n---\n<rendered context pack>`
    - Model: resolved from `reviewer.tier` against `platform-context.yaml:model_tiers`, falling back to `.context-index/specs/cross-cutting/model-routing.md` defaults if unset.

22. **When** multiple reviewers are dispatched for the same spec **then** they run in parallel (single message, multiple Agent tool calls). Findings from all reviewers are collected before consolidation.

#### Severity Cap

23. **When** a reviewer returns findings **then** each finding's `severity` is clamped to `reviewer.severity_cap`. Examples: a `blocker` from a reviewer with `severity_cap: warning` is demoted to `warning`; a `suggestion` from a reviewer with `severity_cap: blocker` is unchanged.

24. **When** clamping demotes a severity **then** the finding's message is prefixed with `"[capped from <original> to <capped>]"` so reviewers can see the effective severity.

#### Verdict Consolidation

25. **When** all reviewers have returned **then** the verdict is computed from the (post-cap) findings: PASS (zero warnings/blockers), PASS_WITH_NOTES (≥1 warning, zero blockers), BLOCK (≥1 blocker). This is unchanged from today except that inputs are now post-cap.

26. **When** `verdict_rules.blocker_threshold` is set in `governance/review.yaml` **then** BLOCK requires ≥ `blocker_threshold` blockers (default: 1). This is the v1 parameterization; richer custom expressions are deferred.

#### Manifest Specialists Deprecation

27. **When** `manifest.yaml:specialists` is present at load time **then** a one-time deprecation advisory emits: `"manifest.yaml:specialists is deprecated. Move these entries to governance/review.yaml:reviewers. Support will be removed in 0.19.0."` Each specialist is converted in-memory to a reviewer entry with `dispatch: triggered` (using the specialist's `triggers`) and merged into the registry. Project-defined reviewers in `governance/review.yaml` with the same `id` take precedence.

28. **When** a project has both `manifest.yaml:specialists` and `governance/review.yaml` **then** the advisory still emits. The merged result is: defaults, then manifest specialists (converted), then governance reviewers (highest precedence).

### Postconditions

- The review report `.review.md` lists every dispatched reviewer (by id and name), each with verdict and findings.
- For each reviewer, the report records the prompt source (`plugin:review-specs/structural-architect-prompt.md` or a project-relative path) so readers can trace which prompt produced which findings.
- Severity-capped findings are flagged inline.
- Spec status is updated exactly as today (`review-pending` → `review-passed` | `review-blocked`).

### Error Cases

| Condition | Expected Behavior |
|-----------|-------------------|
| `governance/review.yaml` is malformed YAML | Load fails with error citing the parse error and line number. Skill exits non-zero before dispatch. |
| Referenced prompt file does not exist | Load fails with error: `"Reviewer '<id>': prompt file not found: <path>"`. |
| Referenced context pack name is not defined | Load fails with error: `"Reviewer '<id>': unknown context_pack '<name>'."` |
| Reviewer subagent crashes or returns empty | Reviewer is recorded in report with verdict UNKNOWN and a warning; overall verdict proceeds from remaining reviewers. |
| All reviewers are disabled (empty dispatch list) | Skill emits error: `"No reviewers enabled for this spec — check governance/review.yaml."` Exit non-zero. |

## System Constitution Reference

- **Principle #1 (Minimize external dependencies):** The YAML parser extension stays zero-dep; `lib/governance/review-config.mjs` uses only Node built-ins. Applies because the parser is the main new code.
- **Principle #2 (Skills are primarily markdown):** SKILL.md continues to describe steps in prose; only reviewer *selection* becomes data. Applies because this ADR deliberately avoids turning skills into executable code.
- **Principle #3 (Pure ESM):** All new code under `lib/governance/` is `.mjs`.
- Architecture Boundary: "Changing the plugin registration format" requires human approval. This spec does not change `.claude-plugin/plugin.json`; it extends only the `governance/` contract, which is project-owned. ADR-0003 documents the decision.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Extract `plugin:review-specs/defaults.yaml` | Encode today's three default reviewers and their context packs as YAML. Include all the inline context sections currently in SKILL.md:119-180. | medium |
| Implement `lib/governance/review-config.mjs` | Parse, validate, merge defaults + project config. Exposes `loadReviewConfig(repoRoot)`. | medium |
| Implement `lib/governance/context-pack.mjs` | Resolve `extends` chains, render pack to a string given a target spec. Exposes `renderPack(pack, {spec, module})`. | medium |
| Extend YAML parser | Support the new shapes (nested lists, labeled `include` entries, `extends`). Either generalize `parseManifestYaml` in `lib/repomap/index.mjs` or add a sibling. | medium |
| Rewrite `skills/review-specs/SKILL.md` Steps 3-4 | Replace hardcoded reviewer dispatch with a single config-driven dispatcher. Preserve Steps 1-2 and 5-8 verbatim. | medium |
| `manifest.yaml:specialists` deprecation | Advisory emission; in-memory conversion to reviewer entries; documentation update in `templates/manifest-template.yaml`. | small |
| `/adev:init` scaffolding | Write a commented-out `governance/review.yaml` template alongside existing governance scaffolds. | small |
| Tests | `tests/governance/review-config.test.mjs` covers load/merge/validate; `tests/governance/context-pack.test.mjs` covers rendering; integration test proves zero-config behavior equals pre-change behavior. | large |

## Acceptance Criteria

- [ ] `loadReviewConfig(repoRoot)` returns bundled defaults identical to current hardcoded flow when no `governance/review.yaml` exists.
- [ ] A project `governance/review.yaml` that disables the consistency analyzer via `enabled: false` causes `/adev:review-specs` to run with only structural + security reviewers, and the consistency reviewer is absent from the `.review.md` report.
- [ ] A project-defined reviewer with `dispatch: triggered` and project-defined `patterns`/`keywords` dispatches exactly when its score ≥ `min_score`; the review report lists it alongside defaults.
- [ ] A reviewer with `severity_cap: warning` whose subagent emits a `blocker` finding produces a `warning` finding in the report, prefixed with `[capped from blocker to warning]`.
- [ ] Prompt paths using the `plugin:` scheme resolve inside `<plugin-root>/skills/`; paths that escape via `..` are rejected with a security error.
- [ ] `manifest.yaml:specialists` still works during the deprecation window; an advisory is emitted exactly once per skill invocation.
- [ ] Malformed YAML fails load with a line-cited error and exits non-zero before dispatch.
- [ ] Integration test: running `/adev:review-specs --spec <fixture>` with and without `governance/review.yaml` produces byte-identical `.review.md` when the governance file declares only the three defaults with no overrides.
- [ ] All quality gates pass (tests, lint, typecheck).
- [ ] No constitutional violations introduced.
