# Implementation Plan: Bundled Domain Profiles

> **Methodology:** adev
> **Charter:** .context-index/specs/features/domain-profiles/charter.md
> **Spec:** .context-index/specs/features/domain-profiles/bundled-domain-profiles.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-10)
> **Platform:** Node.js, JavaScript (ESM), npm, node:test

**Goal:** Create the three bundled domain profile directories (`software`, `data-engineering`, `process-automation`) with all 7 overlay files each, providing domain-specific lifecycle configuration that is loaded by the already-implemented resolution and overlay infrastructure.

**Architecture:** The domain resolution engine (`lib/domains/resolve.mjs`) and overlay loader (`lib/domains/overlay.mjs`) are already validated. This plan creates the static content files they load from `templates/domains/<name>/`. The software profile extracts current hardcoded defaults from the codebase into overlay files. The data-engineering and process-automation profiles author new domain-specific content. All files are pure data (markdown or YAML) with no executable logic.

---

## File Structure

**Create:**
- `templates/domains/software/charter-overlay.md`
- `templates/domains/software/spec-overlay.md`
- `templates/domains/software/reviewers.yaml`
- `templates/domains/software/gates.yaml`
- `templates/domains/software/verification.yaml`
- `templates/domains/software/gate-config.yaml`
- `templates/domains/software/test-config.yaml`
- `templates/domains/data-engineering/charter-overlay.md`
- `templates/domains/data-engineering/spec-overlay.md`
- `templates/domains/data-engineering/reviewers.yaml`
- `templates/domains/data-engineering/gates.yaml`
- `templates/domains/data-engineering/verification.yaml`
- `templates/domains/data-engineering/gate-config.yaml`
- `templates/domains/data-engineering/test-config.yaml`
- `templates/domains/process-automation/charter-overlay.md`
- `templates/domains/process-automation/spec-overlay.md`
- `templates/domains/process-automation/reviewers.yaml`
- `templates/domains/process-automation/gates.yaml`
- `templates/domains/process-automation/verification.yaml`
- `templates/domains/process-automation/gate-config.yaml`
- `templates/domains/process-automation/test-config.yaml`
- `tests/domains/bundled-profiles.test.mjs`
- `tests/domains/backward-compat.test.mjs`

**Modify:**
- `docs/project-types.md` — Document each bundled profile with overlay contents and customization examples
- `docs/getting-started.md` — Add domain profile selection section

**Reference (read, do not modify):**
- `lib/domains/overlay.mjs` — loadOverlay() reads these overlay files
- `lib/domains/constants.mjs` — OVERLAY_TYPES, OVERLAY_FILENAMES, BUNDLED_DOMAIN_NAMES
- `lib/domains/merge-gate-config.mjs` — Expected gate-config overlay shape
- `lib/domains/merge-test-config.mjs` — Expected test-config overlay shape
- `lib/domains/merge-reviewers.mjs` — Expected reviewers overlay shape
- `lib/domains/merge-gates.mjs` — Expected gates overlay shape
- `lib/domains/merge-verification.mjs` — Expected verification overlay shape
- `lib/domains/merge-template-overlay.mjs` — H2 section matching for charter/spec overlays
- `templates/review-specs/defaults.yaml` — Current reviewer defaults to extract
- `lib/test-strategies/gaming.mjs` — Current SKIP_RE patterns to extract

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/domain-profiles/bundled-domain-profiles.spec.md` (Behaviors 1-7, 22, 26)
- Charter: `.context-index/specs/features/domain-profiles/charter.md` (capability: Bundled Software Profile)
- Source files: `templates/review-specs/defaults.yaml` (current reviewer config), `lib/test-strategies/gaming.mjs` (SKIP_RE patterns), `lib/lifecycle-gate-config.mjs` (domain config interface)
- Reference: `lib/domains/merge-template-overlay.mjs` (H2 section matching for charter/spec overlays)

### Task 2 Context
- Spec: `.context-index/specs/features/domain-profiles/bundled-domain-profiles.spec.md` (Behaviors 8-14)
- Charter: `.context-index/specs/features/domain-profiles/charter.md` (capability: Bundled Data-Engineering Profile)
- Reference: `templates/domains/software/` (pattern to follow for overlay file structure)

### Task 3 Context
- Spec: `.context-index/specs/features/domain-profiles/bundled-domain-profiles.spec.md` (Behaviors 15-21)
- Charter: `.context-index/specs/features/domain-profiles/charter.md` (capability: Bundled Process-Automation Profile)
- Reference: `templates/domains/software/` and `templates/domains/data-engineering/` (pattern to follow)

### Task 4 Context
- Spec: `.context-index/specs/features/domain-profiles/bundled-domain-profiles.spec.md` (Behaviors 22, AC: all overlay files parseable)
- Source files: `lib/domains/overlay.mjs` (loadOverlay function), `lib/domains/constants.mjs` (OVERLAY_TYPES, OVERLAY_FILENAMES)
- Reference: `lib/domains/merge-*.mjs` (expected shapes for each overlay type)

### Task 5 Context
- Spec: `.context-index/specs/features/domain-profiles/bundled-domain-profiles.spec.md` (Behavior 26, AC: backward-compatibility)
- Source files: `lib/domains/merge-gate-config.mjs`, `lib/domains/merge-test-config.mjs`, `lib/domains/merge-reviewers.mjs`, `lib/domains/merge-gates.mjs`, `lib/domains/merge-verification.mjs`
- Reference: `templates/review-specs/defaults.yaml`, `lib/test-strategies/gaming.mjs`

### Task 6 Context
- Spec: `.context-index/specs/features/domain-profiles/bundled-domain-profiles.spec.md` (AC: docs/project-types.md, docs/getting-started.md)
- Source files: `docs/project-types.md`, `docs/getting-started.md`

---

## Parallelization

- Group A (sequential): Task 1 → Task 4 → Task 5 (Task 4 validates Task 1 files; Task 5 backward-compat depends on files existing)
- Group B (independent, after Task 1): Task 2 (follows software profile pattern)
- Group C (independent, after Task 1): Task 3 (follows software profile pattern)
- Group D (independent): Task 6 (documentation, no code overlap)

Tasks 2 and 3 can run in parallel after Task 1 completes. Task 6 can run at any time.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Software profile overlay files | medium | unit | — | 7 create |
| 2 | Data-engineering profile overlay files | medium | unit | Task 1 | 7 create |
| 3 | Process-automation profile overlay files | medium | unit | Task 1 | 7 create |
| 4 | Content validation tests | medium | unit | Task 1, 2, 3 | 1 create |
| 5 | Backward-compatibility tests | medium | unit | Task 1 | 1 create |
| 6 | Documentation updates | small | unit | Task 1, 2, 3 | 0 create, 2 modify |

---

### Task 1: Software Profile Overlay Files [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=4
**Rationale:** Spec defines exact values for all 7 overlay files; implementation is a straightforward extraction from existing hardcoded defaults with no boundary crossings.

**Charter capability:** Bundled Software Profile
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `templates/domains/software/charter-overlay.md`
- Create: `templates/domains/software/spec-overlay.md`
- Create: `templates/domains/software/reviewers.yaml`
- Create: `templates/domains/software/gates.yaml`
- Create: `templates/domains/software/verification.yaml`
- Create: `templates/domains/software/gate-config.yaml`
- Create: `templates/domains/software/test-config.yaml`
- Test: `tests/domains/bundled-profiles.test.mjs`

**Tests:** `tests/domains/bundled-profiles.test.mjs`

**Context to load:**
- `.context-index/specs/features/domain-profiles/bundled-domain-profiles.spec.md` (Behaviors 1-7)
- `templates/review-specs/defaults.yaml` (extract reviewer config)
- `lib/test-strategies/gaming.mjs` (extract SKIP_RE patterns)
- `lib/domains/merge-template-overlay.mjs` (understand H2 section matching for overlays)
- `lib/domains/constants.mjs` (OVERLAY_TYPES, OVERLAY_FILENAMES for validation)

- [x] **Write failing test**

Create `tests/domains/bundled-profiles.test.mjs` with tests that verify:
1. `templates/domains/software/` directory exists and contains exactly 7 files
2. Each YAML file is parseable (use `lib/profiles/yaml.mjs` parseYaml)
3. `reviewers.yaml` contains 3 reviewers with IDs: `structural-architect`, `security-reviewer`, `consistency-analyzer`
4. `reviewers.yaml` has `merge_strategy: append` and `blocker_threshold: 1`
5. `gate-config.yaml` has exactly 27 `file_exclusions` entries and 31 `bash_passthrough` entries
6. `test-config.yaml` has `permitted_tools` including `node:test`, `jest`, `vitest`, `mocha`, `pytest`, `go test`, `cargo test`
7. `test-config.yaml` has `max_test_file_size: 512000`
8. `test-config.yaml` has 7 `skip_patterns` entries
9. `verification.yaml` has `type: visual`, `tool: playwright`
10. Charter and spec overlays are non-empty markdown strings

```javascript
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PLUGIN_ROOT = join(import.meta.dirname, '..', '..');
const SW_DIR = join(PLUGIN_ROOT, 'templates', 'domains', 'software');

describe('software profile', () => {
  it('contains exactly 7 overlay files', () => {
    const files = readdirSync(SW_DIR);
    assert.equal(files.length, 7);
  });
  // ... additional assertions per spec behaviors
});
```

- [x] **Verify test fails**

Run: `npm test -- --test-name-pattern "software profile"`
Expected: FAIL — directory does not exist

- [x] **Implement**

Extract current defaults into 7 overlay files:

1. **charter-overlay.md**: H2 sections matching the charter template — Business Intent, Scope and Boundaries, Domain Model (with Entities, Relationships, Invariants subsections), Capability Map, Interface Contracts, Quality Attributes. Quality attribute suggestions: latency (p50/p95/p99), throughput, availability, error rate, test coverage.

2. **spec-overlay.md**: H2 sections matching the spec template — Behavioral Contract, Preconditions, Behaviors, Postconditions, Error Cases (with Condition / Expected Behavior / Error Code columns), Visual Expectations, Acceptance Criteria.

3. **reviewers.yaml**: Extract from `templates/review-specs/defaults.yaml` — 3 reviewers with same IDs, profiles, and config. Add `merge_strategy: append` and `blocker_threshold: 1`.

4. **gates.yaml**: Quality gate entries with commands as argv arrays. Include `npm test` gate at minimum, matching current `governance/gates.yaml` defaults if present.

5. **verification.yaml**: `type: visual`, `trigger_patterns: ["*.html", "*.jsx", "*.tsx", "*.vue", "*.svelte"]`, `tool: playwright`, `breakpoints: [375, 768, 1280]`.

6. **gate-config.yaml**: Extract the 27 file exclusion patterns (`.context-index/**`, `*.test.*`, `*.spec.*`, `node_modules/**`, etc.) and 31 bash passthrough commands (`npm test`, `npx jest`, `npx vitest`, `npm run lint`, etc.). These were previously in `lib/lifecycle-gate-config.mjs` and moved to domain profile — look at git history or the spec's verified counts.

7. **test-config.yaml**: `permitted_tools: ["node:test", "jest", "vitest", "mocha", "pytest", "go test", "cargo test"]`, `max_test_file_size: 512000`, 7 skip patterns from SKIP_RE in `lib/test-strategies/gaming.mjs`.

- [x] **Verify test passes**

Run: `npm test -- --test-name-pattern "software profile"`
Expected: PASS

- [x] **Commit**

Branch: `feat/v1-charters` (existing)

```bash
git add templates/domains/software/ tests/domains/bundled-profiles.test.mjs
git commit -m "feat(domain-profiles): add bundled software profile overlay files

Extract current framework defaults into 7 overlay files under
templates/domains/software/. The software profile is the default
domain that produces identical behavior to the pre-domain-profiles
framework.

Spec: .context-index/specs/features/domain-profiles/bundled-domain-profiles.spec.md
Plan-task: 1"
```

---

### Task 2: Data-Engineering Profile Overlay Files [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Spec provides exact domain vocabulary and config values; follows the software profile pattern established in Task 1 with domain-specific content substitution.

**Charter capability:** Bundled Data-Engineering Profile
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `templates/domains/data-engineering/charter-overlay.md`
- Create: `templates/domains/data-engineering/spec-overlay.md`
- Create: `templates/domains/data-engineering/reviewers.yaml`
- Create: `templates/domains/data-engineering/gates.yaml`
- Create: `templates/domains/data-engineering/verification.yaml`
- Create: `templates/domains/data-engineering/gate-config.yaml`
- Create: `templates/domains/data-engineering/test-config.yaml`
- Test: `tests/domains/bundled-profiles.test.mjs`

**Tests:** `tests/domains/bundled-profiles.test.mjs`

**Context to load:**
- `.context-index/specs/features/domain-profiles/bundled-domain-profiles.spec.md` (Behaviors 8-14)
- `templates/domains/software/` (follow same structure)

- [x] **Write failing test**

Add to `tests/domains/bundled-profiles.test.mjs`:
1. `templates/domains/data-engineering/` exists with exactly 7 files
2. Charter overlay contains "Data Contract", "Pipeline Stages", "Data Lineage", "Data Model"
3. Spec overlay contains "Failure Mode / Recovery Action", "Data Quality Expectations", "Output Schema"
4. Reviewer has `id: data-contract-reviewer`, `merge_strategy: append`
5. Gates has `id: data-quality`
6. Verification has `type: output`, `tool: none`
7. Gate-config includes data-specific exclusions (`*.parquet`, `*.duckdb`, `seeds/**`, `target/**`) and passthrough commands (`dbt run`, `dbt test`, `dbt build`, `python -m pytest`)
8. Test-config includes `pytest`, `dbt test` in permitted_tools, `max_test_file_size: 1048576`

- [x] **Verify test fails**

Run: `npm test -- --test-name-pattern "data-engineering profile"`
Expected: FAIL — directory does not exist

- [x] **Implement**

Author 7 overlay files for data pipeline development:

1. **charter-overlay.md**: H2 sections with data domain vocabulary — replace "Interface Contracts" with "Data Contract", replace "Domain Model" with "Data Model" (Sources, Transformations, Outputs). Add "Data Lineage" and "Pipeline Stages" sections. Quality attributes: freshness SLA, completeness (null rate), accuracy, row count stability, schema drift detection.

2. **spec-overlay.md**: Replace "HTTP Status / Error Code" with "Failure Mode / Recovery Action" in error case table. Replace "Visual Expectations" with "Data Quality Expectations". Add "Output Schema" section.

3. **reviewers.yaml**: Single reviewer `data-contract-reviewer` with prompt focused on data contracts, schema completeness, SLA definitions. `merge_strategy: append`.

4. **gates.yaml**: Gate `id: data-quality` checking schema validation and data fixture definitions.

5. **verification.yaml**: `type: output`, `trigger_patterns: ["*.parquet", "*.csv", "*.json", "*.yaml"]`, `tool: none`.

6. **gate-config.yaml**: File exclusions including `*.parquet`, `*.duckdb`, `seeds/**`, `target/**`. Bash passthrough including `dbt run`, `dbt test`, `dbt build`, `python -m pytest`.

7. **test-config.yaml**: `permitted_tools: ["pytest", "dbt test", "node:test"]`, `max_test_file_size: 1048576`, Python/dbt skip patterns.

- [x] **Verify test passes**

Run: `npm test -- --test-name-pattern "data-engineering profile"`
Expected: PASS

- [x] **Commit**

```bash
git add templates/domains/data-engineering/ tests/domains/bundled-profiles.test.mjs
git commit -m "feat(domain-profiles): add bundled data-engineering profile overlay files

Author 7 overlay files for data pipeline domain with data contracts,
pipeline stages, data quality expectations, and dbt integration.

Spec: .context-index/specs/features/domain-profiles/bundled-domain-profiles.spec.md
Plan-task: 2"
```

---

### Task 3: Process-Automation Profile Overlay Files [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Spec provides exact domain vocabulary and config values; follows the established profile pattern with workflow-domain-specific content.

**Charter capability:** Bundled Process-Automation Profile
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `templates/domains/process-automation/charter-overlay.md`
- Create: `templates/domains/process-automation/spec-overlay.md`
- Create: `templates/domains/process-automation/reviewers.yaml`
- Create: `templates/domains/process-automation/gates.yaml`
- Create: `templates/domains/process-automation/verification.yaml`
- Create: `templates/domains/process-automation/gate-config.yaml`
- Create: `templates/domains/process-automation/test-config.yaml`
- Test: `tests/domains/bundled-profiles.test.mjs`

**Tests:** `tests/domains/bundled-profiles.test.mjs`

**Context to load:**
- `.context-index/specs/features/domain-profiles/bundled-domain-profiles.spec.md` (Behaviors 15-21)
- `templates/domains/software/` and `templates/domains/data-engineering/` (follow same structure)

- [x] **Write failing test**

Add to `tests/domains/bundled-profiles.test.mjs`:
1. `templates/domains/process-automation/` exists with exactly 7 files
2. Charter overlay contains "Integration Points", "Workflow Steps", "Recovery & Compensation"
3. Spec overlay contains "Trigger / Outcome", "Integration Points", "Recovery Actions"
4. Reviewer has `id: integration-reviewer`, `merge_strategy: append`
5. Gates has `id: flow-coverage`
6. Verification has `type: flow`, `tool: none`
7. Gate-config includes automation-specific exclusions and passthrough commands
8. Test-config includes `pytest`, `node:test`, `jest` in permitted_tools, `max_test_file_size: 524288`

- [x] **Verify test fails**

Run: `npm test -- --test-name-pattern "process-automation profile"`
Expected: FAIL — directory does not exist

- [x] **Implement**

Author 7 overlay files for workflow/process automation domain:

1. **charter-overlay.md**: Replace "Interface Contracts" with "Integration Points". Use "Workflow Steps" instead of generic capabilities. Add "Recovery & Compensation" section. Quality attributes: end-to-end latency, retry success rate, dead-letter rate, RTO.

2. **spec-overlay.md**: Replace "HTTP Status / Error Code" with "Trigger / Outcome". Add "Integration Points" section for external system touchpoints. Add "Recovery Actions" section for compensation logic.

3. **reviewers.yaml**: Single reviewer `integration-reviewer` focused on integration point completeness and recovery action coverage. `merge_strategy: append`.

4. **gates.yaml**: Gate `id: flow-coverage` checking integration point tests and recovery action tests.

5. **verification.yaml**: `type: flow`, `trigger_patterns: ["*.workflow.yaml", "*.flow.json", "*.bpmn"]`, `tool: none`.

6. **gate-config.yaml**: File exclusions including `*.workflow.yaml`, `*.bpmn`, `flows/**`. Bash passthrough including `python -m pytest`, `npm test`, `npx jest`.

7. **test-config.yaml**: `permitted_tools: ["pytest", "node:test", "jest"]`, `max_test_file_size: 524288`, Python/JS skip patterns.

- [x] **Verify test passes**

Run: `npm test -- --test-name-pattern "process-automation profile"`
Expected: PASS

- [x] **Commit**

```bash
git add templates/domains/process-automation/ tests/domains/bundled-profiles.test.mjs
git commit -m "feat(domain-profiles): add bundled process-automation profile overlay files

Author 7 overlay files for workflow domain with integration points,
recovery actions, flow verification, and automation-specific gates.

Spec: .context-index/specs/features/domain-profiles/bundled-domain-profiles.spec.md
Plan-task: 3"
```

---

### Task 4: Content Validation Tests [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=4 pattern=3 blast=5 novelty=4
**Rationale:** Cross-profile validation tests follow standard test patterns; acceptance criteria are clear though some edge case assertions require inference from overlay loader behavior.

**Charter capability:** Bundled Software Profile, Bundled Data-Engineering Profile, Bundled Process-Automation Profile
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2, Task 3
**Files:**
- Create: `tests/domains/bundled-profiles.test.mjs` (extend from Tasks 1-3)
- Test: `tests/domains/bundled-profiles.test.mjs`

**Tests:** `tests/domains/bundled-profiles.test.mjs`

**Context to load:**
- `.context-index/specs/features/domain-profiles/bundled-domain-profiles.spec.md` (Behavior 22, all acceptance criteria)
- `lib/domains/overlay.mjs` (loadOverlay function)
- `lib/domains/constants.mjs` (OVERLAY_TYPES, OVERLAY_FILENAMES)
- `lib/domains/merge-*.mjs` (expected shapes)

- [x] **Write failing test**

Add cross-profile validation tests to `tests/domains/bundled-profiles.test.mjs`:
1. All 3 profiles contain exactly 7 files each (Behavior 22)
2. All YAML overlays parse without errors via loadOverlay()
3. Each merge function accepts the overlay data without throwing (integration smoke test)
4. No gate ID collisions between data-engineering and process-automation profiles
5. Data-engineering and process-automation both use `merge_strategy: append`
6. Markdown overlays are non-empty strings
7. All structured overlays return objects (not null) from loadOverlay()

- [x] **Verify test fails**

Run: `npm test -- --test-name-pattern "cross-profile"`
Expected: FAIL — validation tests fail on missing structure

- [x] **Implement**

Write comprehensive cross-profile validation tests that exercise loadOverlay() against each bundled profile for each overlay type, then pass the results through the corresponding merge function.

- [x] **Verify test passes**

Run: `npm test -- --test-name-pattern "cross-profile"`
Expected: PASS

- [x] **Commit**

```bash
git add tests/domains/bundled-profiles.test.mjs
git commit -m "test(domain-profiles): add cross-profile content validation tests

Verify all 21 overlay files parse correctly, match expected structure,
and are accepted by their merge functions without errors.

Spec: .context-index/specs/features/domain-profiles/bundled-domain-profiles.spec.md
Plan-task: 4"
```

---

### Task 5: Backward-Compatibility Tests [specialist: none]

**Routing:** assisted-agent (score: 15/20)
**Scores:** spec=4 pattern=3 blast=5 novelty=3
**Rationale:** Requires extracting and comparing pre-migration default values from multiple source files; the comparison logic combines overlay loading with merge functions in a composition not previously tested.

**Charter capability:** Bundled Software Profile
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `tests/domains/backward-compat.test.mjs`
- Test: `tests/domains/backward-compat.test.mjs`

**Tests:** `tests/domains/backward-compat.test.mjs`

**Context to load:**
- `.context-index/specs/features/domain-profiles/bundled-domain-profiles.spec.md` (Behavior 26)
- `lib/domains/merge-gate-config.mjs` (mergeGateConfig)
- `lib/domains/merge-test-config.mjs` (mergeTestConfig)
- `lib/domains/merge-reviewers.mjs` (mergeReviewers)
- `lib/domains/merge-verification.mjs` (mergeVerification)
- `lib/domains/overlay.mjs` (loadOverlay)
- `templates/review-specs/defaults.yaml` (expected reviewer output)

- [x] **Write failing test**

Create `tests/domains/backward-compat.test.mjs`:
1. Load software profile overlays via loadOverlay()
2. Pass each through its merge function
3. Verify merged reviewers match the current `templates/review-specs/defaults.yaml` reviewer list (same IDs, same profiles)
4. Verify merged gate-config produces the same file_exclusions and bash_passthrough arrays as the pre-domain-profiles defaults
5. Verify merged test-config produces `permitted_tools`, `max_test_file_size`, and `skip_patterns` matching pre-domain-profiles defaults
6. Verify merged verification config matches current visual verification defaults

- [x] **Verify test fails**

Run: `npm test -- --test-name-pattern "backward-compat"`
Expected: FAIL — comparison against expected values

- [x] **Implement**

Write backward-compatibility test suite that loads the software profile through the full overlay pipeline and compares outputs against known pre-migration values. Each test asserts exact equality on the merged output to catch any accidental behavioral drift.

- [x] **Verify test passes**

Run: `npm test -- --test-name-pattern "backward-compat"`
Expected: PASS

- [x] **Commit**

```bash
git add tests/domains/backward-compat.test.mjs
git commit -m "test(domain-profiles): add backward-compatibility test suite

Verify software profile produces identical behavior to pre-domain-profiles
framework defaults when loaded through the overlay pipeline.

Spec: .context-index/specs/features/domain-profiles/bundled-domain-profiles.spec.md
Plan-task: 5"
```

---

### Task 6: Documentation Updates [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=4 pattern=3 blast=5 novelty=5
**Rationale:** Pure documentation task with clear acceptance criteria; updates existing docs files with profile descriptions following established documentation patterns.

**Charter capability:** Bundled Software Profile, Bundled Data-Engineering Profile, Bundled Process-Automation Profile
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2, Task 3
**Files:**
- Modify: `docs/project-types.md`
- Modify: `docs/getting-started.md`
- Test: `tests/domains/bundled-profiles.test.mjs`

**Tests:** `tests/domains/bundled-profiles.test.mjs` (add test that docs mention all 3 profiles)

**Context to load:**
- `.context-index/specs/features/domain-profiles/bundled-domain-profiles.spec.md` (AC: documentation)
- `docs/project-types.md` (existing content)
- `docs/getting-started.md` (existing content)

- [x] **Write failing test**

Add documentation presence tests to `tests/domains/bundled-profiles.test.mjs`:
1. `docs/project-types.md` contains the strings "software", "data-engineering", "process-automation"
2. `docs/getting-started.md` contains a section about choosing a domain profile

- [x] **Verify test fails**

Run: `npm test -- --test-name-pattern "documentation"`
Expected: FAIL — docs do not contain domain profile content

- [x] **Implement**

1. Update `docs/project-types.md` to document each bundled profile:
   - Software profile: overlay contents, default behavior, quality attributes
   - Data-engineering profile: overlay contents, data-specific vocabulary, customization examples
   - Process-automation profile: overlay contents, workflow-specific vocabulary, customization examples
   - Customization section: how to create a custom domain with `extends: <bundled>`

2. Update `docs/getting-started.md` to add a section on choosing and configuring a domain profile:
   - How to set `domain: <name>` in manifest
   - What each domain provides
   - Link to `docs/project-types.md` for details

- [x] **Verify test passes**

Run: `npm test -- --test-name-pattern "documentation"`
Expected: PASS

- [x] **Commit**

```bash
git add docs/project-types.md docs/getting-started.md tests/domains/bundled-profiles.test.mjs
git commit -m "docs(domain-profiles): document bundled domain profiles

Add profile descriptions, overlay contents, and customization examples
to project-types.md. Add domain profile selection guide to getting-started.md.

Spec: .context-index/specs/features/domain-profiles/bundled-domain-profiles.spec.md
Plan-task: 6"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied
- All 21 overlay files are parseable by their respective loaders
- Software profile backward-compatibility tests pass
- No constitutional violations introduced
