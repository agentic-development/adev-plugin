<!-- partial_schema: plan@1 -->

# Implementation Plan: Risk Tier Bundles

> **Methodology:** adev
> **Charter:** .context-index/specs/features/setup/charter.md
> **Spec:** .context-index/specs/features/setup/risk-tier-bundles.spec.md
> **Review:** PASS_WITH_NOTES (2026-09-07)
> **Platform:** CLI tool / plugin, JavaScript (ESM), Node.js, npm

**Goal:** Add a project-level risk tier axis (`prototype`/`standard`/`regulated`), orthogonal to domain, that `/adev:init` Step 7 uses to seed a correspondingly different `risk-policies.yaml` and `review.yaml`/`validate.yaml` overlay.

**Architecture:** `lib/risk-tiers/` mirrors `lib/domains/`'s pure-function shape (resolve → load config → merge overlay), but scoped down: no custom-override directory, no extends chain, and only two non-default tiers ship bundles (`standard` reuses the pre-existing fixed template path). `skills/init/SKILL.md` Steps 7.0/7c.0/7d.0 wire the new axis into the existing governance-scaffolding flow without touching its zero-config-preservation or single-source-scaffold invariants.

**Retroactive plan note:** The code below was implemented and tested in a prior session, before this spec/plan pass existed — it is on disk, untracked by git (`git status` shows `lib/risk-tiers/`, `templates/risk-tiers/`, `tests/risk-tiers/` as untracked, and `skills/init/SKILL.md` as modified), and **has never been committed**. Each task's TDD steps below describe *verifying* the existing test/implementation pair rather than authoring from scratch, but the **Commit** step in each task is real and has not run yet — this plan produces this feature's actual first commits.

---

## File Structure

**Create (untracked, on disk, uncommitted):**
- `lib/risk-tiers/constants.mjs` — tier names, overlay config types/filenames, legacy standard-tier path
- `lib/risk-tiers/resolve.mjs` — `resolveRiskTier(manifest)`
- `lib/risk-tiers/tier-config.mjs` — `loadRiskTierConfig(tier, configType, pluginRoot)`
- `lib/risk-tiers/merge-review-overlay.mjs` — `applyReviewTierOverlay(reviewers, overlay)`
- `lib/risk-tiers/merge-validate-overlay.mjs` — `applyValidateTierOverlay(validateConfig, overlay)`
- `templates/risk-tiers/prototype/{risk-policies,review-overlay,validate-overlay}.yaml`
- `templates/risk-tiers/regulated/{risk-policies,review-overlay,validate-overlay}.yaml`
- `tests/risk-tiers/resolve.test.mjs`
- `tests/risk-tiers/tier-config.test.mjs`
- `tests/risk-tiers/merge-review-overlay.test.mjs`
- `tests/risk-tiers/merge-validate-overlay.test.mjs`
- `tests/risk-tiers/tier-overlay-referential-integrity.test.mjs`

**Modify:**
- `skills/init/SKILL.md` — Step 7.0 (tier prompt), Step 7a (tier-resolved risk-policies copy), Step 7c.0 (review overlay + write-gate), Step 7d.0 (validate overlay), Step 7 summary, Diagnostic Mode health-check line
- `templates/manifest-template.yaml` — commented `risk_tier: standard` placeholder alongside `domain: software`
- `docs/governance.md` — "Project risk tier" subsection
- `docs/configuration.md` — "Risk Tier" section

**Reference (read, do not modify):**
- `lib/domains/domain-config.mjs`, `lib/domains/merge-reviewers.mjs` — the precedent this module mirrors
- `templates/domains/software/{reviewers.yaml,validate.yaml}` — the base list/checks the bundled tier overlays are verified against

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/setup/risk-tier-bundles.spec.md` (BEH-1, BEH-2, BEH-3)
- Reference: `lib/domains/resolve.mjs` (the `resolveDomain()` precedent — same pure-function shape, no charter/module precedence here)

### Task 2 Context
- Spec: risk-tier-bundles.spec.md (BEH-4, BEH-5, BEH-6, BEH-7, BEH-8)
- Reference: `lib/domains/domain-config.mjs` (`loadDomainConfig()` — path resolution, size guard, path-containment precedent), `lib/path-safety.mjs` (`safeRealpath`), `lib/profiles/yaml.mjs` (`parseYaml`, `YamlParseError`)
- Legacy path this task must NOT touch: `templates/risk-policies-template.yaml` (standard tier's content, unchanged)

### Task 3 Context
- Spec: risk-tier-bundles.spec.md (BEH-9, BEH-10, BEH-11, BEH-12)
- Reference: `lib/domains/merge-reviewers.mjs` (the pure-merge-function precedent)
- Referential-integrity target: `templates/domains/software/reviewers.yaml`, `templates/domains/software/validate.yaml` (the base lists the bundled `prototype`/`regulated` overlays must resolve against with zero `RISK_TIER_OVERLAY_UNKNOWN_ID` warnings)

### Task 4 Context
- Spec: risk-tier-bundles.spec.md (BEH-13, BEH-14, BEH-15, BEH-16)
- `skills/init/SKILL.md` Step 7 (existing governance-scaffolding flow, Steps 7a/7c/7d) — the exact insertion points
- `.context-index/specs/features/reviewer-domain-fit/reviewer-panel-retarget.spec.md` — why `structural-architect`/`security-reviewer` are disabled by default (BEH-14's `regulated` overlay re-enables them)
- `docs/governance.md`, `docs/configuration.md` — existing structure the new sections slot into

## Parallelization

- Group A (sequential): Task 1 → Task 2 (Task 2's `loadRiskTierConfig` is exercised via the same `lib/risk-tiers/` module Task 1 establishes, and Task 4's skill prose names both)
- Group B (independent of A once A lands): Task 3 (merge functions only depend on `lib/domains/merge-reviewers.mjs`'s pattern, not on Task 1/2's code)
- Task 4 depends on Tasks 1-3 (the skill prose names all five lib functions and the bundled templates)
- Task 5 depends on Tasks 1-4 (bookkeeping commit runs last, after the feature's real commits exist)

Practically: given all five lib files, six templates, and five test files already exist and pass, this ordering governs commit sequencing, not authoring order.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Risk tier constants + resolution | small | unit | — | 3 create |
| 2 | Risk tier config loader + bundled templates | medium | unit | Task 1 | 8 create |
| 3 | Review/validate overlay merge functions | medium | unit | — | 3 create |
| 4 | `/adev:init` skill wiring + docs | medium | unit | Task 1, 2, 3 | 4 modify, 2 regenerate |
| 5 | Context-index lifecycle bookkeeping | small | n/a | Task 1, 2, 3, 4 | 5 create/modify |

## Strategy Summary

Omitted — four of five tasks resolve to `unit` (fallback, high confidence); Task 5 is `n/a` (lifecycle-artifact bookkeeping, not code). No non-unit code strategy detected from file paths (`lib/risk-tiers/**`, `templates/risk-tiers/**`, `tests/risk-tiers/**` are all plain unit-test surfaces).

---

## Task Structure

### Task 1: Risk tier constants + resolution [specialist: none]

**Charter capability:** Risk Tier Bundles
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/risk-tiers/constants.mjs`
- Create: `lib/risk-tiers/resolve.mjs`
- Test: `tests/risk-tiers/resolve.test.mjs`

**Tests:** `tests/risk-tiers/resolve.test.mjs` (granularity: per-behavior, source: manifest `test_policy.granularity`) — covers BEH-1, BEH-2, BEH-3. File already exists; this task **verifies** it, not "create."

**Context to load:**
- `lib/domains/resolve.mjs` — the `resolveDomain()` precedent this mirrors (same return shape `{ resolved_X, source }`)
- `lib/domains/constants.mjs` — constants-module shape precedent

- [x] **Write failing test** (already written — `tests/risk-tiers/resolve.test.mjs` exists on disk)

```javascript
// tests/risk-tiers/resolve.test.mjs (excerpt)
it('throws INVALID_RISK_TIER for an unrecognized value', () => {
  assert.throws(() => resolveRiskTier({ risk_tier: 'super-strict' }), (err) => err.code === 'INVALID_RISK_TIER');
});
```

- [x] **Verify test fails** — N/A for this retroactive pass (implementation already exists alongside the test; there is no isolated pre-implementation moment to observe a red state). Verified instead by temporarily reverting `resolve.mjs` to confirm the suite fails without it — see Task 1 commit message for the one-line confirmation.

- [x] **Implement** (already written — `lib/risk-tiers/constants.mjs`, `lib/risk-tiers/resolve.mjs` exist on disk)

- [x] **Verify test passes**

Run: `node --test tests/risk-tiers/resolve.test.mjs`
Expected: PASS (7/7 tests — 6 authored + 1 added during Task 1's code-quality review, cq-2: explicit `standard` tier now asserts `source: 'manifest'`)

- [ ] **Commit**

Branch (if not already created): `feat/setup/risk-tier-resolution`

```bash
git add lib/risk-tiers/constants.mjs lib/risk-tiers/resolve.mjs tests/risk-tiers/resolve.test.mjs
git commit -m "feat(setup): add risk tier resolution (resolveRiskTier)

Spec: .context-index/specs/features/setup/risk-tier-bundles.spec.md
Plan-task: 1"
```

### Task 2: Risk tier config loader + bundled templates [specialist: none]

**Charter capability:** Risk Tier Bundles
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `lib/risk-tiers/tier-config.mjs`
- Create: `templates/risk-tiers/prototype/risk-policies.yaml`
- Create: `templates/risk-tiers/prototype/review-overlay.yaml`
- Create: `templates/risk-tiers/prototype/validate-overlay.yaml`
- Create: `templates/risk-tiers/regulated/risk-policies.yaml`
- Create: `templates/risk-tiers/regulated/review-overlay.yaml`
- Create: `templates/risk-tiers/regulated/validate-overlay.yaml`
- Test: `tests/risk-tiers/tier-config.test.mjs`

**Tests:** `tests/risk-tiers/tier-config.test.mjs` (per-behavior) — covers BEH-4, BEH-5, BEH-6, BEH-7, BEH-8. File already exists; this task verifies it.

**Context to load:**
- `lib/domains/domain-config.mjs` — `loadDomainConfig()`'s path-resolution and size-guard (`MAX_DOMAIN_CONFIG_SIZE`) pattern, mirrored here at `MAX_RISK_TIER_CONFIG_SIZE`
- `lib/path-safety.mjs` — `isContained()`, the shared containment primitive this module's `assertPathContained()` wraps (during code-quality review, cq-1, the initial hand-rolled containment check was replaced with a call to this shared helper instead of re-deriving it)
- `templates/risk-policies-template.yaml` — the legacy fixed path `standard` resolves to (read-only reference; this task must not modify it — Postcondition: "`git diff` on that file across this change is empty")

- [x] **Write failing test** (already written — `tests/risk-tiers/tier-config.test.mjs` exists on disk, 10 tests originally; 3 more added during code-quality review, cq-2, for the previously-untested `RISK_TIER_CONFIG_PARSE_ERROR`/`RISK_TIER_CONFIG_TOO_LARGE`/empty-file paths — 13 total)
- [x] **Verify test fails** — N/A, same retroactive caveat as Task 1.
- [x] **Implement** (already written — `lib/risk-tiers/tier-config.mjs` + the six `templates/risk-tiers/{prototype,regulated}/*.yaml` files exist on disk)
- [x] **Verify test passes**

Run: `node --test tests/risk-tiers/tier-config.test.mjs`
Expected: PASS (13/13 tests)

- [ ] **Commit**

Branch: `feat/setup/risk-tier-bundles` (single feature branch used for all five tasks — created at the start of `/adev:implement`)

```bash
git add lib/risk-tiers/tier-config.mjs templates/risk-tiers/ tests/risk-tiers/tier-config.test.mjs
git commit -m "feat(setup): add risk tier config loader and bundled prototype/regulated templates

Spec: .context-index/specs/features/setup/risk-tier-bundles.spec.md
Plan-task: 2"
```

### Task 3: Review/validate overlay merge functions [specialist: none]

**Charter capability:** Risk Tier Bundles
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/risk-tiers/merge-review-overlay.mjs`
- Create: `lib/risk-tiers/merge-validate-overlay.mjs`
- Create: `lib/risk-tiers/overlay-helpers.mjs` (extracted during code-quality review, cq-1: the enable/disable/severity-field loops were duplicated near-verbatim across the two merge functions — `applyIdListField`/`applyIdValueMap` factor out the shared id-lookup-and-set shape)
- Test: `tests/risk-tiers/merge-review-overlay.test.mjs`
- Test: `tests/risk-tiers/merge-validate-overlay.test.mjs`
- Test: `tests/risk-tiers/tier-overlay-referential-integrity.test.mjs`

**Tests:** `tests/risk-tiers/merge-review-overlay.test.mjs`, `tests/risk-tiers/merge-validate-overlay.test.mjs`, `tests/risk-tiers/tier-overlay-referential-integrity.test.mjs` (per-behavior) — covers BEH-9, BEH-10, BEH-11, BEH-12, plus the Postcondition guarantee (every bundled overlay id resolves against the real `software` domain bundle with zero `RISK_TIER_OVERLAY_UNKNOWN_ID` warnings). Files already existed for the merge functions themselves; `overlay-helpers.mjs` and one additional test (two colliding `extra_checks` entries) were added during this task's code-quality review.

**Context to load:**
- `lib/domains/merge-reviewers.mjs` — pure-merge-function precedent (never mutates inputs, returns new objects, warnings array instead of throwing on unknown ids)
- `templates/domains/software/reviewers.yaml`, `templates/domains/software/validate.yaml` — the base lists the referential-integrity test loads via `loadDomainConfig('software', ...)`

- [x] **Write failing test** (already written — three test files exist on disk, 19 tests originally; 1 more added during code-quality review, cq-1's minor note, for two colliding `extra_checks` entries — 20 total)
- [x] **Verify test fails** — N/A, same retroactive caveat.
- [x] **Implement** (already written — `lib/risk-tiers/merge-review-overlay.mjs`, `lib/risk-tiers/merge-validate-overlay.mjs` exist on disk; `lib/risk-tiers/overlay-helpers.mjs` added during code-quality review to remove duplicated enable/disable/severity-field logic, cq-1)
- [x] **Verify test passes**

Run: `node --test tests/risk-tiers/merge-review-overlay.test.mjs tests/risk-tiers/merge-validate-overlay.test.mjs tests/risk-tiers/tier-overlay-referential-integrity.test.mjs`
Expected: PASS (20/20 tests)

- [ ] **Commit**

Branch: `feat/setup/risk-tier-bundles` (the single feature branch)

```bash
git add lib/risk-tiers/merge-review-overlay.mjs lib/risk-tiers/merge-validate-overlay.mjs lib/risk-tiers/overlay-helpers.mjs tests/risk-tiers/merge-review-overlay.test.mjs tests/risk-tiers/merge-validate-overlay.test.mjs tests/risk-tiers/tier-overlay-referential-integrity.test.mjs
git commit -m "feat(setup): add risk tier review/validate overlay merge functions

Spec: .context-index/specs/features/setup/risk-tier-bundles.spec.md
Plan-task: 3"
```

### Task 4: `/adev:init` skill wiring + docs [specialist: none]

**Charter capability:** Risk Tier Bundles
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2, Task 3
**Files:**
- Modify: `skills/init/SKILL.md` (Step 7.0, Step 7a, Step 7c.0, Step 7c.5, Step 7d.0, Step 7 summary, Diagnostic Mode health-check line)
- Modify: `templates/manifest-template.yaml` (commented `risk_tier: standard` placeholder)
- Modify: `docs/governance.md` ("Project risk tier" subsection)
- Modify: `docs/configuration.md` ("Risk Tier" section)
- Regenerate: `providers/codex/skills/init/SKILL.md`, `providers/opencode/skills/init/SKILL.md` (via `scripts/sync-provider-skills.mjs`, not hand-edited)

**Tests:** none — this is skill-prose and documentation content; per the spec's own "Coverage Gaps" section, no automated harness exercises `/adev:init` Step 7.0's interactive prompt. Verification for this task is: (a) `hooks/pre-commit-no-inline-node.sh` passes clean on the `skills/init/SKILL.md` diff, (b) `tests/sync/provider-skill-parity.test.mjs` passes after regenerating the provider mirrors, (c) the full `npm test` suite still passes (nothing else regresses).

**Context to load:**
- `.context-index/specs/features/reviewer-domain-fit/reviewer-panel-retarget.spec.md` — why `structural-architect`/`security-reviewer` are off by default (the fact BEH-14's `regulated` overlay reverses)
- `.context-index/specs/features/validation/validate-config-single-source.spec.md` — the single-source scaffold model Step 7d.0's existing domain-starter copy already follows, which the validate-overlay application layers on top of without replacing

- [x] **Write failing test** — N/A (no test surface for skill prose; see **Tests** above)
- [x] **Verify test fails** — N/A
- [x] **Implement** (already written — `skills/init/SKILL.md`, `templates/manifest-template.yaml`, `docs/governance.md`, `docs/configuration.md` modified on disk; provider mirrors already regenerated via `scripts/sync-provider-skills.mjs`)
- [x] **Verify test passes**

Run: `bash hooks/pre-commit-no-inline-node.sh skills/init/SKILL.md && node --test tests/sync/provider-skill-parity.test.mjs && npm test`
Expected: hook exits 0, provider-parity test passes, full suite reports 0 failures (7761 pass, 2 pre-existing todo unrelated to this feature, per the last full run in this session)

- [ ] **Commit**

Branch: continue on the feature branch from Tasks 1-3

```bash
git add skills/init/SKILL.md templates/manifest-template.yaml docs/governance.md docs/configuration.md providers/codex/skills/init/SKILL.md providers/opencode/skills/init/SKILL.md
git commit -m "feat(setup): wire risk tier selection into /adev:init Step 7

Spec: .context-index/specs/features/setup/risk-tier-bundles.spec.md
Plan-task: 4"
```

### Task 5: Context-index lifecycle bookkeeping [specialist: none]

**Charter capability:** Risk Tier Bundles
**Strategy:** n/a — this task commits lifecycle-tracking artifacts, not source or tests; no test strategy applies.
**Depends on:** Task 1, Task 2, Task 3, Task 4
**Files:**
- Create: `.context-index/specs/features/setup/risk-tier-bundles.spec.md`, `.plan.md`, `.review.md`
- Create: `.context-index/lifecycle-state/risk-tier-bundles.jsonl` (the lifecycle event log this whole specify→review→plan pass appended to)
- Modify: `.context-index/specs/features/setup/charter.md` (Capability Map row, revision bump)

**Tests:** none — these are lifecycle-tracking artifacts (spec/plan/review markdown, charter, JSONL event log), not executable code. Verification is `/adev:hygiene`'s spec-to-commit traceability check picking these up cleanly on a later run.

**Context to load:**
- `.gitignore`'s `.context-index/lifecycle-state/*.json` pattern — matches build-state `.json` files only, NOT `.jsonl` event logs, by design (the managed-gitignore-block spec's canonical path list comments this explicitly: "build-state JSON (jsonl events ARE committed)"). The lifecycle JSONL log is the audit trail and belongs in git.

- [x] **Write failing test** — N/A, no test surface for markdown lifecycle artifacts.
- [x] **Verify test fails** — N/A
- [x] **Implement** (already written — spec/plan/review/charter files exist on disk, per the surrounding `/adev:specify` → `/adev:review-specs` → `/adev:plan` passes; the JSONL log accumulated as those steps ran)
- [x] **Verify test passes** — N/A; confirm via `git status` that `.context-index/lifecycle-state/risk-tier-bundles.jsonl` IS staged (it is NOT gitignored — see Context to load above) alongside the spec/plan/review/charter markdown.

- [ ] **Commit**

Branch: continue on the feature branch from Tasks 1-4

```bash
git add .context-index/specs/features/setup/risk-tier-bundles.spec.md .context-index/specs/features/setup/risk-tier-bundles.plan.md .context-index/specs/features/setup/risk-tier-bundles.review.md .context-index/specs/features/setup/charter.md .context-index/lifecycle-state/risk-tier-bundles.jsonl
git commit -m "docs(setup): add spec/plan/review lifecycle artifacts for risk tier bundles

Spec: .context-index/specs/features/setup/risk-tier-bundles.spec.md
Plan-task: 5"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from the spec satisfied (see spec's Acceptance Criteria — 7 checked, 2 explicitly deferred and tracked as Coverage Gaps, not silently dropped)

`governance/gates.yaml` exists for this project; its `test` gate (`npm test`) is the live gate this plan's Quality Gates section defers to.
