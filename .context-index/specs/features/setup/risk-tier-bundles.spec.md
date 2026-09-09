---
partial_schema: spec@1
charter: setup
status: implemented
risk_level: low
milestone:
mode: extract
extracted-from:
  - lib/risk-tiers/constants.mjs
  - lib/risk-tiers/resolve.mjs
  - lib/risk-tiers/tier-config.mjs
  - lib/risk-tiers/merge-review-overlay.mjs
  - lib/risk-tiers/merge-validate-overlay.mjs
  - lib/risk-tiers/overlay-helpers.mjs
  - templates/risk-tiers/prototype/risk-policies.yaml
  - templates/risk-tiers/prototype/review-overlay.yaml
  - templates/risk-tiers/prototype/validate-overlay.yaml
  - templates/risk-tiers/strict/risk-policies.yaml
  - templates/risk-tiers/strict/review-overlay.yaml
  - templates/risk-tiers/strict/validate-overlay.yaml
  - templates/manifest-template.yaml
  - skills/init/SKILL.md
  - docs/governance.md
  - docs/configuration.md
kind: behavioral
revision: 1
charter-revision: 4
created: 2026-09-07
updated: 2026-09-09
charter-extension: true
source-manifest:
  sha: "5c3d167"
  files:
    - docs/configuration.md
    - docs/governance.md
    - lib/risk-tiers/constants.mjs
    - lib/risk-tiers/merge-review-overlay.mjs
    - lib/risk-tiers/merge-validate-overlay.mjs
    - lib/risk-tiers/overlay-helpers.mjs
    - lib/risk-tiers/resolve.mjs
    - lib/risk-tiers/tier-config.mjs
    - skills/init/SKILL.md
    - templates/manifest-template.yaml
    - templates/risk-tiers/prototype/review-overlay.yaml
    - templates/risk-tiers/prototype/risk-policies.yaml
    - templates/risk-tiers/prototype/validate-overlay.yaml
    - templates/risk-tiers/strict/review-overlay.yaml
    - templates/risk-tiers/strict/risk-policies.yaml
    - templates/risk-tiers/strict/validate-overlay.yaml
    - tests/risk-tiers/merge-review-overlay.test.mjs
    - tests/risk-tiers/merge-validate-overlay.test.mjs
    - tests/risk-tiers/resolve.test.mjs
    - tests/risk-tiers/tier-config.test.mjs
    - tests/risk-tiers/tier-overlay-referential-integrity.test.mjs
  computed-at: "2026-09-09T17:21:50.457Z"
---

<!-- Live Spec within the setup charter.
     Adds a new capability not currently enumerated in setup/charter.md.
     The charter's next revision should add a Capability Map row for "Risk Tier Bundles".
     Parent Charter: .context-index/specs/features/setup/charter.md -->

# Live Spec: Risk Tier Bundles

<!-- Extracted from existing code. Describes current behavior as of 2026-09-07. -->

## Behavioral Contract

`/adev:init` Step 7 (Governance Policies) seeds a project's `risk-policies.yaml` and the domain-selected `review.yaml`/`validate.yaml` bundle. This spec documents the **risk tier** axis added on top of that: a project-level, orthogonal-to-domain characterization (`prototype` / `standard` / `strict`) implemented in `lib/risk-tiers/` and wired into Steps 7.0/7c.0/7d.0 of `skills/init/SKILL.md`. Filed against adev-plugin-i2vl (closed). `standard` reproduces the framework's pre-existing behavior exactly; `prototype` and `strict` apply a bundled overlay on top of the resolved domain's reviewer/check defaults.

## System Constitution Reference

- **Principle:** "Minimize external dependencies" — Applies because `lib/risk-tiers/*.mjs` uses only Node built-ins (`node:fs`, `node:path`) plus the project's existing `lib/profiles/yaml.mjs` and `lib/path-safety.mjs`. ✓ Compliant — no new `package.json` dependency.
- **Principle:** "Pure ESM" — Applies because all six new `lib/risk-tiers/*.mjs` files use `export`/`import` exclusively. ✓ Compliant.
- **Principle:** "Skills are primarily markdown" — Applies because the new Step 7.0/7c.0/7d.0 prose in `skills/init/SKILL.md` names lib functions (`loadRiskTierConfig(...)`, `applyReviewTierOverlay(...)`, `applyValidateTierOverlay(...)`) descriptively, the same way the pre-existing Step 7d.0 already names `loadDomainConfig(...)` — no inline-Node execution block was introduced. ✓ Compliant, verified by `hooks/pre-commit-no-inline-node.sh` passing clean on the diff.
- **Principle:** "No hardcoded paths to `~/.claude/`" — Applies because `loadRiskTierConfig(tier, configType, pluginRoot)` takes `pluginRoot` as a parameter, mirroring `loadDomainConfig`'s signature, rather than hardcoding a home-directory path. ✓ Compliant.
- **Constitution requirement:** "Updating specs/ADRs when code changes affect their assumptions" — this extraction spec is that required update for adev-plugin-i2vl's implementation, authored retroactively because the original session implemented the code without first running `/adev:specify`.

## Coverage Gaps

- No `.context-index/risk-tiers/<tier>/` custom-override directory or `extends` chain (unlike `lib/domains/domain-config.mjs`) — bundled-tiers-only in this revision, by design, not oversight.
- No re-adoption/apply path exists for changing `risk_tier` on a project whose `governance/review.yaml`/`validate.yaml` are already materialized — deferred to `adev governance adopt` (adev-plugin-j7pq.5.2, still open at time of writing). Changing the manifest key on such a project has no effect on the already-written files.
- The `strict` tier's `project.strict-compliance` check ships with a TODO-framed stub prompt (`.context-index/prompts/strict-compliance-check.md`) — nothing detects or warns that the stub is still boilerplate at `/adev:validate` time; the check will run against generic text until an operator edits it.
- The 40 tests in `tests/risk-tiers/` cover the pure lib functions (`resolveRiskTier`, `loadRiskTierConfig`, `applyReviewTierOverlay`, `applyValidateTierOverlay`) and bundled-template content/referential-integrity. None of them exercise `/adev:init` Step 7.0's interactive prompt itself — the skill-prose-driven wizard flow has no automated end-to-end coverage.
- Provider mirrors (`providers/codex/skills/init/SKILL.md`, `providers/opencode/skills/init/SKILL.md`) were regenerated via `scripts/sync-provider-skills.mjs` rather than hand-reviewed for this specific content; `tests/sync/provider-skill-parity.test.mjs` only enforces that they stay byte-in-sync with the canonical file, not that the generated prose reads correctly for those providers' conventions.

## Acceptance Criteria

- [x] `lib/risk-tiers/{constants,resolve,tier-config,merge-review-overlay,merge-validate-overlay,overlay-helpers}.mjs` exist, are pure ESM, and use only Node built-ins plus existing in-repo helpers.
- [x] `templates/risk-tiers/{prototype,strict}/{risk-policies,review-overlay,validate-overlay}.yaml` exist and parse as valid YAML.
- [x] `templates/manifest-template.yaml` carries a commented `risk_tier: standard` placeholder alongside the existing `domain: software` placeholder.
- [x] `skills/init/SKILL.md` Step 7.0 (tier prompt), Step 7c.0 (review overlay + write-gate), Step 7d.0 (validate overlay), the Step 7 summary, and the Diagnostic Mode health-check line all document the tier flow.
- [x] Provider mirrors are byte-in-sync with the canonical skill file — enforced by `tests/sync/provider-skill-parity.test.mjs`.
- [x] Every overlay id in the bundled `prototype`/`strict` tiers resolves against the bundled `software` domain's `reviewers.yaml`/`validate.yaml` with zero `RISK_TIER_OVERLAY_UNKNOWN_ID` warnings — enforced by `tests/risk-tiers/tier-overlay-referential-integrity.test.mjs`.
- [x] `tests/risk-tiers/*.test.mjs` (40 tests) and the full `npm test` suite pass with zero failures.
- [ ] A re-adoption/apply path exists for changing `risk_tier` on an already-materialized project (deferred — see Coverage Gaps).
- [ ] A custom/extends override mechanism exists for risk tiers, matching `lib/domains/`'s (deferred — see Coverage Gaps).

## Preconditions

- `.context-index/manifest.yaml` exists and parses as YAML before `resolveRiskTier(manifest)` is called (a `null` manifest is tolerated and resolves to the default).
- `pluginRoot` passed to `loadRiskTierConfig` resolves (via `safeRealpath`) to a real, readable directory containing a `templates/` subdirectory.
- For Step 7c.0/7d.0 to apply an overlay meaningfully, the resolved domain's `reviewers.yaml`/`validate.yaml` must already be loaded (`loadDomainConfig`) as the base list the overlay is layered onto.

## Behaviors

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** `resolveRiskTier(manifest)` is called and `manifest.risk_tier` is `undefined` or `null` (including a `null` manifest) **then** it returns `{ resolved_tier: 'standard', source: 'default' }` without validation.
- **BEH-2** — **When** `resolveRiskTier(manifest)` is called and `manifest.risk_tier` is one of `prototype` / `standard` / `strict` **then** it returns `{ resolved_tier: <value>, source: 'manifest' }`.
- **BEH-3** — **When** `resolveRiskTier(manifest)` is called and `manifest.risk_tier` is a non-string, or a string outside the closed set **then** it throws an `Error` with `code: 'INVALID_RISK_TIER'` naming the offending value and the valid set.
- **BEH-4** — **When** `loadRiskTierConfig('standard', 'risk-policies', pluginRoot)` is called **then** it reads and parses `<pluginRoot>/templates/risk-policies-template.yaml` — the pre-existing fixed path, unchanged since before tier selection existed — rather than any path under `templates/risk-tiers/`.
- **BEH-5** — **When** `loadRiskTierConfig('standard', 'review-overlay', pluginRoot)` or `loadRiskTierConfig('standard', 'validate-overlay', pluginRoot)` is called **then** it returns `null` — the `standard` tier ships no overlay files, since an unmodified bundled default IS the standard tier.
- **BEH-6** — **When** `loadRiskTierConfig('prototype' | 'strict', <risk-policies | review-overlay | validate-overlay>, pluginRoot)` is called **then** it reads `<pluginRoot>/templates/risk-tiers/<tier>/<configType-mapped-filename>.yaml`, returning `null` only if that specific file does not exist on disk.
- **BEH-7** — **When** `loadRiskTierConfig` is called with a `tier` argument that fails `RISK_TIER_NAME_PATTERN` or is absent from `RISK_TIER_NAMES` **then** it throws before any path construction, with `code: 'INVALID_RISK_TIER_ARG'`, mirroring `lib/domains/domain-config.mjs`'s `INVALID_DOMAIN_ARG` guard; a `configType` outside `RISK_TIER_CONFIG_TYPES` instead returns `null` (not an error).
- **BEH-8** — **When** a `loadRiskTierConfig` file read resolves to a path outside its expected root directory **then** it throws `code: 'PATH_ESCAPE'`; when the file exceeds 512 KB, `code: 'RISK_TIER_CONFIG_TOO_LARGE'`; when the file is malformed YAML, `code: 'RISK_TIER_CONFIG_PARSE_ERROR'` naming the file's relative path.
- **BEH-9** — **When** `applyReviewTierOverlay(reviewers, overlay)` is called with `overlay` `null` or non-object **then** it returns `{ reviewers: <input, unmodified>, warnings: [] }`; otherwise it returns a **new** array where only the ids named in `overlay.enable` / `overlay.disable` / `overlay.severity_caps` have their `enabled` / `severity_cap` fields set, and every other entry is carried through unchanged — never a partial list, so an overlay touching two ids never drops the rest.
- **BEH-10** — **When** `applyReviewTierOverlay`'s overlay names an id absent from the input `reviewers` list (in `enable`, `disable`, or `severity_caps`) **then** that entry is skipped and a `{ code: 'RISK_TIER_OVERLAY_UNKNOWN_ID' }` warning is appended to the result's `warnings` array, without throwing.
- **BEH-11** — **When** `applyValidateTierOverlay(validateConfig, overlay)` is called **then** it applies the same null-passthrough and full-list-preservation semantics as BEH-9 to `validateConfig.checks` (via `overlay.severity_overrides` in place of `severity_caps`), and additionally appends each `overlay.extra_checks` entry whose `id` is not already present among the checks.
- **BEH-12** — **When** `applyValidateTierOverlay`'s `extra_checks` entry is missing an `id` **then** it is skipped with a `RISK_TIER_OVERLAY_INVALID_EXTRA_CHECK` warning; **when** its `id` collides with an existing check **then** it is skipped with a `RISK_TIER_OVERLAY_DUPLICATE_ID` warning; neither case throws.
- **BEH-13** — **When** `/adev:init` Step 7.0 runs (governance opted in) and the operator selects `prototype` **then** Step 7a seeds `governance/risk-policies.yaml` from `templates/risk-tiers/prototype/risk-policies.yaml` (every level: `require_hitl_approval: false`, `review_mode`/`validate_mode`/`implement_mode: quick`, `test_depth: minimal`, `require_review: true` unchanged), Step 7c.0's overlay (softening `referent-integrity`/`wiring-reviewer`/`consistency-analyzer`/`boundary-reviewer`/`termination-reviewer` to `severity_cap: warning`) alone satisfies Step 7c.5's zero-config-preservation write gate, and Step 7d.0's overlay disables `validate.check-11-visual-verification` and downgrades `validate.check-2-spec-compliance`/`validate.check-4-constitution` to `severity: warning`.
- **BEH-14** — **When** the operator selects `strict` **then** Step 7a seeds `risk-policies.yaml` with `require_hitl_approval: true`, `review_mode`/`validate_mode`/`implement_mode: full`, `test_depth: thorough` at every level; Step 7c.0's overlay re-enables `structural-architect` and `security-reviewer` (disabled by default in the bundled `software` domain per `reviewer-panel-retarget.spec.md`); Step 7d.0's overlay escalates `validate.check-1.5-source-manifest`, `validate.check-9-transition-gates`, and `validate.check-14-gate-executability` to `severity: error` and appends the `project.strict-compliance` check, scaffolding its stub prompt at `.context-index/prompts/strict-compliance-check.md` if absent.
- **BEH-15** — **When** the operator selects `standard`, or the tier prompt goes unanswered **then** Steps 7a/7c.0/7d.0 behave exactly as the framework did before this feature existed: `loadRiskTierConfig` returns `null` for both overlay types, so tier selection alone triggers no `review.yaml`/`validate.yaml` write.
- **BEH-16** — **When** `/adev:init` Diagnostic Mode runs on a project whose `manifest.yaml` has no `risk_tier` key **then** the `Governance` health-check line appends `(risk tier: standard)` via `resolveRiskTier`'s default path, with no fix-it prompt and no file rewrite — a missing key is a valid unconfigured-but-default state, not a defect.

## Postconditions

- A project's `manifest.yaml`, once written by Step 7.0, carries at most one `risk_tier` value, always a member of `{prototype, standard, strict}`.
- A `governance/review.yaml` or `governance/validate.yaml` written with a tier overlay applied carries every entry the resolved domain's bundle would have produced on its own — `applyReviewTierOverlay`/`applyValidateTierOverlay` never return a list shorter than their input plus any `extra_checks`.
- `templates/risk-policies-template.yaml` (the `standard` tier's content) and its consumers outside this feature are untouched — `git diff` on that file across this change is empty.

## Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `manifest.risk_tier` is a non-string, or a string outside `{prototype, standard, strict}` | `resolveRiskTier` throws before returning | `INVALID_RISK_TIER` |
| `loadRiskTierConfig` called with a `tier` argument outside the closed set / failing the name pattern | Throws before any path construction | `INVALID_RISK_TIER_ARG` |
| `loadRiskTierConfig` called with a `configType` outside `RISK_TIER_CONFIG_TYPES` | Returns `null` — not an error | — |
| Resolved tier config file exceeds 512 KB | Throws | `RISK_TIER_CONFIG_TOO_LARGE` |
| Resolved tier config file is malformed YAML | Throws, naming the offending file's relative path | `RISK_TIER_CONFIG_PARSE_ERROR` |
| Resolved tier config path escapes its expected root directory | Throws | `PATH_ESCAPE` |
| Overlay (`enable` / `disable` / `severity_caps` / `severity_overrides`) names an id absent from the base list it is applied to | Entry skipped, `warnings` array gets an entry, no throw | `RISK_TIER_OVERLAY_UNKNOWN_ID` |
| Overlay `extra_checks` entry missing `id` | Entry skipped, warning appended | `RISK_TIER_OVERLAY_INVALID_EXTRA_CHECK` |
| Overlay `extra_checks` entry's `id` collides with an existing check | Entry skipped, warning appended | `RISK_TIER_OVERLAY_DUPLICATE_ID` |
| ⚠ UNHANDLED — A project's `manifest.yaml` carries `risk_tier: strict` (or `prototype`) but `governance/review.yaml`/`validate.yaml` were never (re-)materialized against that tier's overlay (e.g., a hand-edited manifest key, or Step 7.0 run after those files already existed) | Diagnostic Mode's `Governance` line reports `(risk tier: strict)` from `resolveRiskTier` alone — it does not check whether the materialized files actually reflect that tier's overlay | — |
