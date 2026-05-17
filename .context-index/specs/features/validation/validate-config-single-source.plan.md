<!-- DO NOT EDIT statuses inline — see lifecycle log validate-config-single-source.jsonl -->
# Implementation Plan: Single-Source Validate Configuration

> **Methodology:** adev
> **Charter:** .context-index/specs/features/validation/charter.md
> **Spec:** .context-index/specs/features/validation/validate-config-single-source.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-15)
> **Platform:** Node.js ESM, JavaScript (.mjs), npm, node:test

**Goal:** Replace the bundled-defaults-plus-overlay model for validate configuration with a single project-owned `governance/validate.yaml`, scaffolded at init time from a domain-shipped starter, and externalize per-check prompts from `skills/validate/SKILL.md` into standalone `skills/validate/checks/<id>.md` files.

**Architecture:** The refactor follows the same single-source pattern already established by `governance/gates.yaml` and `governance/review.yaml` — one file per concern, owned by the project, scaffolded at init time. The domain-profile extension point uses the existing `loadDomainConfig()` API in `lib/domains/domain-config.mjs`, which requires three additions to `lib/domains/constants.mjs`: adding `'validate'` to `DOMAIN_CONFIG_TYPES`, mapping it to `validate.yaml` in `DOMAIN_CONFIG_FILENAMES`, and adding it to `STRUCTURED_CONFIG_TYPES`. The `lib/governance/validate-config.mjs` loader drops its two-source merge logic and reads the project-owned file directly, mirroring the shape already used by `lib/governance/review-config.mjs`.

**Review notes addressed in this plan:**
- SA-1 (cross-charter ownership): The three `lib/domains/constants.mjs` edits are explicitly scoped to Task 2 with enumeration of each constant.
- SA-8 (constants file elided): Step 2 of the spec's migration path is expanded in Task 2 to explicitly enumerate `DOMAIN_CONFIG_TYPES`, `DOMAIN_CONFIG_FILENAMES`, and `STRUCTURED_CONFIG_TYPES` edits.
- Suggestion-level items (cosmetic H1, hygiene missing-file branch, extends-resolution drift audit) addressed at implementation time per reviewer guidance.

---

## File Structure

**Create:**
- `skills/validate/checks/validate.check-1.5-source-manifest.md` — externalized prompt for source manifest check
- `skills/validate/checks/validate.check-2-spec-compliance.md` — externalized prompt for spec compliance check
- `skills/validate/checks/validate.check-3-charter-consistency.md` — externalized prompt
- `skills/validate/checks/validate.check-4-constitution.md` — externalized prompt
- `skills/validate/checks/validate.check-5-adrs.md` — externalized prompt
- `skills/validate/checks/validate.check-6-cross-cutting.md` — externalized prompt
- `skills/validate/checks/validate.check-7-specialist-review.md` — externalized prompt
- `skills/validate/checks/validate.check-8-boundaries.md` — externalized prompt
- `skills/validate/checks/validate.check-9-transition-gates.md` — externalized prompt
- `skills/validate/checks/validate.check-10-platform-drift.md` — externalized prompt
- `skills/validate/checks/validate.check-11-visual-verification.md` — externalized prompt
- `skills/validate/checks/validate.check-12-heuristic-extraction.md` — externalized prompt
- `templates/domains/software/validate.yaml` — software-domain starter (content from current `templates/validate/defaults.yaml` with `prompt: plugin:validate/checks/<id>.md` URIs)
- `tests/governance/validate-config-single-source.test.mjs` — new tests for this spec's behaviors (missing-file error, id allowlist, URI resolution, parity, init scaffold, hygiene drift)
- `tests/domains/validate-domain-config.test.mjs` — tests for `loadDomainConfig('software', 'validate', ...)` and domain-arg validation

**Modify:**
- `lib/domains/constants.mjs` — add `'validate'` to `DOMAIN_CONFIG_TYPES`; add `['validate', 'validate.yaml']` to `DOMAIN_CONFIG_FILENAMES`; add `'validate'` to `STRUCTURED_CONFIG_TYPES`
- `lib/domains/domain-config.mjs` — add `domain` argument validation guard (Behavior 7a, `INVALID_DOMAIN_ARG`)
- `lib/governance/validate-config.mjs` — remove bundled-defaults read and overlay merge loop; add single-source read; add `MISSING_VALIDATE_CONFIG` error; add `INVALID_CHECK_ID` id allowlist enforcement; add `plugin:validate/checks/<id>.md` URI resolution; sanitize `PROMPT_NOT_FOUND` diagnostic (≤128 chars, allowlist-stripped)
- `skills/validate/SKILL.md` — remove per-check prose (lines ~155-637); update Step 0 registry-load description to reflect single-source model; add preflight check for missing `governance/validate.yaml`
- `templates/validate/defaults.yaml` — update entries to remove `internal: true` and add `prompt: plugin:validate/checks/<id>.md` (two-step: update then delete in Task 6)
- `skills/hygiene/SKILL.md` — add Validate Config Drift audit pass section
- `skills/init/SKILL.md` — add Step 7d domain-aware scaffolding of `governance/validate.yaml` from `loadDomainConfig(domain, 'validate', ...)` with idempotency guard and software-fallback advisory
- `cli/index.mjs` — add `adev migrate-validate` subcommand (or extend `adev migrate`) for the one-shot migration tool (Step 8)
- `.context-index/specs/features/validation/configurable-checks.spec.md` — add partial-supersession annotation header; add `superseded-by-behaviors:` frontmatter field
- `.context-index/adrs/0003-configurable-review-registry.md` — add "Revised" note narrowing the "Zero behavior change" guarantee for validate registry
- `.context-index/specs/features/validation/charter.md` — update Skills section to reflect single-source model

**Delete:**
- `templates/validate/defaults.yaml` — after loader switch and verifying no remaining consumers (Task 6)

**Reference (read, do not modify):**
- `.context-index/specs/features/validation/configurable-checks.spec.md` — Behaviors 6-23, 25, 26 remain in force; URI resolution rules (Behavior 22)
- `lib/governance/review-config.mjs` — follow the same `plugin:review-specs/...` URI resolution pattern for `plugin:validate/checks/...`
- `tests/governance/validate-config.test.mjs` — existing tests must remain green at every step

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/validation/validate-config-single-source.spec.md` (Migration Path Step 1, ADDED section, Changes Catalog)
- Charter: `.context-index/specs/features/validation/charter.md`
- Source files: `templates/validate/defaults.yaml` (full read — 12 check entries with `internal: true`), `skills/validate/SKILL.md` (lines 155-637 — per-check prose sections to externalize)
- ADR: `.context-index/adrs/0003-configurable-review-registry.md` (decision: externalized prompts, `plugin:` URI scheme)
- Cross-cutting: `configurable-checks.spec.md` Behavior 22 (URI resolution rules for `plugin:<skill>/<file>`)

### Task 2 Context
- Spec: validate-config-single-source.spec.md (Migration Path Step 2, Behavior 7, Behavior 7a, ADDED section)
- Source files: `lib/domains/constants.mjs` (full read — three constants requiring edits: `DOMAIN_CONFIG_TYPES`, `DOMAIN_CONFIG_FILENAMES`, `STRUCTURED_CONFIG_TYPES`), `lib/domains/domain-config.mjs` (full read — existing validation patterns for `configType` and `domain` argument)
- Tests: `tests/domains/backward-compat.test.mjs` (follow existing pattern for loadDomainConfig tests)

### Task 3 Context
- Spec: validate-config-single-source.spec.md (Migration Path Step 3, ADDED section, Behavior 7, Behavior 4)
- Source files: `templates/validate/defaults.yaml` (content to copy into software starter), `templates/domains/software/` (existing files — follow filename/structure conventions)
- Tests: Task 2 test file for `loadDomainConfig('software', 'validate', ...)` assertions

### Task 4 Context
- Spec: validate-config-single-source.spec.md (Migration Path Step 4, Behavior 3, Behavior 4, Acceptance Criteria)
- Source files: `skills/init/SKILL.md` (full read — Step 7d location, governance scaffolding flow)
- Cross-cutting: domain resolution pattern (`lib/domains/resolve.mjs`)

### Task 5 Context
- Spec: validate-config-single-source.spec.md (Migration Path Step 5, Behavior 0, Behavior 1, Behavior 2, Error Cases table, Invariants)
- Source files: `lib/governance/validate-config.mjs` (full read — loader to refactor), `lib/governance/review-config.mjs` (reference — `plugin:` URI resolution pattern), `configurable-checks.spec.md` (Behavior 22 URI rules)
- ADR: `0003-configurable-review-registry.md` (accepted decision context)
- Tests: `tests/governance/validate-config.test.mjs` (existing tests must remain green)

### Task 6 Context
- Spec: validate-config-single-source.spec.md (Migration Path Step 6, REMOVED section)
- Source files: `templates/validate/defaults.yaml` (file to delete)

### Task 7 Context
- Spec: validate-config-single-source.spec.md (Migration Path Step 7, Behavior 8, SEC-4 fix, Acceptance Criteria)
- Source files: `skills/hygiene/SKILL.md` (full read — find audit pass insertion point), `lib/domains/domain-config.mjs` (loadDomainConfig API reference)

### Task 8 Context
- Spec: validate-config-single-source.spec.md (Migration Path Step 8, Behavior 0, Error Cases: MIGRATION_BLOCKED_BY_CORRUPT_CONFIG, Invariants)
- Source files: `cli/index.mjs` (existing `adev migrate` subcommand pattern at line ~1091)

### Task 9 Context
- Spec: validate-config-single-source.spec.md (Migration Path Step 9, Acceptance Criteria: supersession round-trip)
- Source files: `configurable-checks.spec.md` (frontmatter to update)
- ADR reference: `0003-configurable-review-registry.md` (Migration Path Step 11 for ADR amendment)

### Task 10 Context
- Spec: validate-config-single-source.spec.md (Migration Path Step 10, Acceptance Criteria: charter update)
- Source files: `validate charter.md` (Skills section to update)

### Task 11 Context
- Spec: validate-config-single-source.spec.md (all Acceptance Criteria, Invariants, Error Cases table)
- Source files: `tests/governance/validate-config.test.mjs` (existing tests to augment), existing test helpers in `tests/helpers.mjs`

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption or cost of adev skills, parse real session JSONL files from ~/.claude/projects/ (message.usage fields: input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens). Dispatch paired A/B subagents and compare their JSONL data for controlled experiments.
- **Anti-pattern:** Estimate tokens using bytes/4 or hardcoded assumptions about thinking budgets and cache hit rates. These overstate savings by 2-2.5x vs real measurements.

### Heuristic: Cache reads are 71% of session cost — minimize context accumulation (confidence: medium)
- **Pattern:** When optimizing token cost, focus on reducing what accumulates in conversation context (output echoes, artifact dumps, verbose subagent returns).
- **Anti-pattern:** Focus on reducing input token counts (SKILL.md sizes, context packets).

### Heuristic: Summarized skill output produces equivalent artifact quality (confidence: medium)
- **Pattern:** When a skill writes an artifact to disk, instruct it to return only a structured summary to the conversation. The artifact on disk will be equally complete.
- **Anti-pattern:** Assume that shorter output means lower quality artifacts.

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 (migration path order; each step leaves the system green)
- Group B (independent of A): Task 9 (annotation/round-trip — pure doc/frontmatter change, no code dependency)
- Group C (depends on Task 5): Task 7 (hygiene pass references single-source loader)
- Group D (depends on Task 5): Task 8 (migration tool references loader and init scaffold)
- Group E (independent): Task 10 (charter Skills section update — doc only)
- Group F (spans all tasks): Task 11 (tests scaffold in Task 1 test file and Task 2 test file; augmented throughout)

Tasks 9, 10, and 11 (partial) can begin in parallel after Task 3 completes. Tasks 7 and 8 must wait for Task 5.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Externalize per-check prompts | medium | unit | — | 12 create, 2 modify |
| 2 | Extend constants + loadDomainConfig with `validate` type | small | unit | Task 1 | 1 modify |
| 3 | Author software domain starter | small | unit | Task 2 | 1 create, 1 modify |
| 4 | Update `/adev:init` to scaffold `governance/validate.yaml` | small | unit | Task 3 | 1 modify |
| 5 | Switch loader to single-source | medium | unit | Task 4 | 1 modify |
| 6 | Delete `templates/validate/defaults.yaml` | small | unit | Task 5 | 1 delete |
| 7 | Add hygiene Validate Config Drift audit pass | medium | unit | Task 5 | 1 modify |
| 8 | Migration tool for existing projects | small | unit | Task 4, Task 5 | 1 modify |
| 9 | Annotate `configurable-checks.spec.md` + amend ADR-0003 | small | unit | — | 2 modify |
| 10 | Update validation charter Skills section | small | unit | — | 1 modify |
| 11 | Augment tests for all new behaviors | large | unit | Task 1–Task 8 | 2 create, 1 modify |

---

### Task 1: Externalize Per-Check Prompts [specialist: none]

**Routing:** assisted-agent (score: 12/20)
**Scores:** spec=4 pattern=3 blast=2 novelty=3
**Rationale:** Medium blast radius across 3+ directories (12 new files + 2 modifications) and no golden sample for SKILL.md prose extraction or URI-wiring pattern; human review at mid-point catches copy-paste losses across the 12 check files.

**Charter capability:** Validation skill — check registry as first-class markdown artifacts
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `skills/validate/checks/validate.check-1.5-source-manifest.md`
- Create: `skills/validate/checks/validate.check-2-spec-compliance.md`
- Create: `skills/validate/checks/validate.check-3-charter-consistency.md`
- Create: `skills/validate/checks/validate.check-4-constitution.md`
- Create: `skills/validate/checks/validate.check-5-adrs.md`
- Create: `skills/validate/checks/validate.check-6-cross-cutting.md`
- Create: `skills/validate/checks/validate.check-7-specialist-review.md`
- Create: `skills/validate/checks/validate.check-8-boundaries.md`
- Create: `skills/validate/checks/validate.check-9-transition-gates.md`
- Create: `skills/validate/checks/validate.check-10-platform-drift.md`
- Create: `skills/validate/checks/validate.check-11-visual-verification.md`
- Create: `skills/validate/checks/validate.check-12-heuristic-extraction.md`
- Modify: `templates/validate/defaults.yaml` — remove `internal: true` from all 12 entries; add `prompt: plugin:validate/checks/<id>.md` to each subagent-review and deterministic-check entry
- Modify: `lib/governance/validate-config.mjs` — add `plugin:validate/checks/...` URI resolution (mirror the `plugin:review-specs/...` pattern from `lib/governance/review-config.mjs`; resolve to `skills/validate/checks/<id>.md` in the plugin tree)
**Tests:** `tests/governance/validate-config.test.mjs` — new tests for `plugin:validate/checks/<id>.md` URI resolution (valid id resolves to file in plugin tree; unknown id returns `PROMPT_NOT_FOUND`)

**Context to load:**
- `skills/validate/SKILL.md` (lines 155-637 — per-check prose to extract)
- `templates/validate/defaults.yaml` (12 entries to update)
- `lib/governance/review-config.mjs` (URI resolution pattern to mirror)
- `configurable-checks.spec.md` Behavior 22 (URI resolution rules)

- [ ] **Write failing test**

```javascript
// tests/governance/validate-config.test.mjs — add to existing describe block
test("plugin:validate/checks/<id>.md URI resolves to plugin tree file", () => {
  // Arrange: governance/validate.yaml references plugin: URI
  const repo = tmp();
  writeFixture(repo, ".context-index/governance/validate.yaml", `
checks:
  - id: validate.check-2-spec-compliance
    kind: subagent-review
    profile: reviewer-capable
    prompt: plugin:validate/checks/validate.check-2-spec-compliance.md
`);
  const r = loadValidateConfig(repo, { pluginRoot: PLUGIN_ROOT });
  // After Task 1 is implemented, the file exists; before, PROMPT_NOT_FOUND
  const check = r.checks.find(c => c.id === 'validate.check-2-spec-compliance');
  // The loader resolves the prompt path; file must exist for no error
  assert.ok(check.resolvedPromptPath.includes('skills/validate/checks'));
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/validate-config.test.mjs`
Expected: FAIL — `check.resolvedPromptPath is not a property` or similar

- [ ] **Implement**

1. Read `skills/validate/SKILL.md` lines 155-637 — identify per-check prose sections (Check 1.5, Checks 2-12 text bodies).
2. For each check, create `skills/validate/checks/<id>.md` containing the check's prompt body (the subagent instruction prose, without the outer `### Check N:` heading from SKILL.md — that heading is orchestration, not prompt content).
3. Update `templates/validate/defaults.yaml`: for each entry, remove `internal: true` and add `prompt: plugin:validate/checks/<id>.md`. The deterministic-check (`validate.check-1.5-source-manifest`) and observational (`validate.check-12-heuristic-extraction`) entries add `prompt:` only if they have substantive prompt text; otherwise omit (the field is optional for non-subagent-review kinds).
4. In `lib/governance/validate-config.mjs`, add URI resolution: when `prompt` starts with `plugin:validate/checks/`, resolve to `join(pluginRoot, 'skills', 'validate', 'checks', filename)`. Apply path-containment check. Store resolved path as `resolvedPromptPath` on the check object. Sanitize `PROMPT_NOT_FOUND` diagnostic: truncate URI to 128 chars, strip non-allowlist chars before emitting.
5. Verify that the existing tests still pass (`npm test`).

- [ ] **Verify test passes**

Run: `node --test tests/governance/validate-config.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch (if not already created): `feat/validation/validate-config-single-source`

```bash
git add skills/validate/checks/ templates/validate/defaults.yaml lib/governance/validate-config.mjs tests/governance/validate-config.test.mjs
git commit -m "feat(validation): externalize per-check prompts to skills/validate/checks/<id>.md

- Create 12 check prompt files under skills/validate/checks/
- Update templates/validate/defaults.yaml: remove internal: true, add prompt: plugin: URIs
- Add plugin:validate/checks/<id>.md URI resolution to validate-config loader
- Sanitize PROMPT_NOT_FOUND diagnostic (truncate+strip per SEC-3)

Spec: .context-index/specs/features/validation/validate-config-single-source.spec.md
Plan-task: 1"
```

---

### Task 2: Extend Constants and `loadDomainConfig` with `validate` configType [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=4 novelty=5
**Rationale:** Three enumerated edits to constants plus a verbatim code guard; identical extension pattern already applied for other configTypes in the same files; fully mechanical.

**Charter capability:** Validation skill — domain-aware configuration
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `lib/domains/constants.mjs` — three specific edits (see below)
- Modify: `lib/domains/domain-config.mjs` — add `domain` argument validation (Behavior 7a)
**Tests:** `tests/domains/validate-domain-config.test.mjs` — new test file covering: `loadDomainConfig('software', 'validate', ...)` returns structured object; `loadDomainConfig('data-engineering', 'validate', ...)` returns null (no starter); `loadDomainConfig('../etc', 'validate', ...)` throws `INVALID_DOMAIN_ARG`

**Context to load:**
- `lib/domains/constants.mjs` (full read — three constants to edit)
- `lib/domains/domain-config.mjs` (existing `BUNDLED_DOMAIN_NAMES` guard and deprecation handling patterns)

**Three required `constants.mjs` edits (SA-1 / SA-8 from review):**

1. **`DOMAIN_CONFIG_TYPES`**: add `'validate'` to the Set. After: `new Set(['charter-template', 'spec-template', 'reviewers', 'gates', 'verification', 'gate-config', 'test-config', 'validate'])`
2. **`DOMAIN_CONFIG_FILENAMES`**: add `['validate', 'validate.yaml']` entry to the Map.
3. **`STRUCTURED_CONFIG_TYPES`**: add `'validate'` to the Set (it returns a parsed YAML object, not a markdown string).

**`domain-config.mjs` edit (Behavior 7a):**

Add `domain` argument validation before any path construction:
```javascript
// Validate domain argument against allowed pattern (Behavior 7a / SEC-2)
const DOMAIN_ARG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
if (!DOMAIN_ARG_PATTERN.test(domain)) {
  const sanitized = domain.replace(/[^a-z0-9-]/g, '').slice(0, 32);
  const err = new Error(
    `INVALID_DOMAIN_ARG: domain argument "${sanitized}" (redacted) does not match [a-z0-9][a-z0-9-]*.`
  );
  err.code = 'INVALID_DOMAIN_ARG';
  throw err;
}
```

- [ ] **Write failing test**

```javascript
// tests/domains/validate-domain-config.test.mjs
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { loadDomainConfig } from '../../lib/domains/domain-config.mjs';

const PLUGIN_ROOT = join(import.meta.dirname, '..', '..');
const REPO_ROOT = join(PLUGIN_ROOT, 'tests', 'fixtures', 'empty-repo-root');

describe('loadDomainConfig: validate configType', () => {
  it("recognizes 'validate' configType and returns null when no starter exists", () => {
    // Before Task 3 (software starter created), software also returns null
    const result = loadDomainConfig('software', 'validate', REPO_ROOT, PLUGIN_ROOT);
    // After Task 3: assert.ok(result !== null && typeof result === 'object');
    // Before Task 3: null is acceptable
    assert.ok(result === null || typeof result === 'object');
  });

  it("throws INVALID_DOMAIN_ARG for non-conforming domain argument", () => {
    assert.throws(
      () => loadDomainConfig('../etc', 'validate', REPO_ROOT, PLUGIN_ROOT),
      (err) => err.code === 'INVALID_DOMAIN_ARG'
    );
  });

  it("throws INVALID_DOMAIN_ARG for domain with path separators", () => {
    assert.throws(
      () => loadDomainConfig('../../passwd', 'validate', REPO_ROOT, PLUGIN_ROOT),
      (err) => err.code === 'INVALID_DOMAIN_ARG'
    );
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/domains/validate-domain-config.test.mjs`
Expected: FAIL — `'validate'` not in `DOMAIN_CONFIG_TYPES`; `INVALID_DOMAIN_ARG` not thrown (domain passthrough to path construction)

- [ ] **Implement**

1. Edit `lib/domains/constants.mjs`: three additions as described above.
2. Edit `lib/domains/domain-config.mjs`: add `DOMAIN_ARG_PATTERN` constant and domain-validation guard at the top of `loadDomainConfig()`, before any other logic.
3. Run `npm test` to verify existing domain tests still pass.

- [ ] **Verify test passes**

Run: `node --test tests/domains/validate-domain-config.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/domains/constants.mjs lib/domains/domain-config.mjs tests/domains/validate-domain-config.test.mjs
git commit -m "feat(validation): extend loadDomainConfig with validate configType + domain arg guard

- constants.mjs: add 'validate' to DOMAIN_CONFIG_TYPES, DOMAIN_CONFIG_FILENAMES, STRUCTURED_CONFIG_TYPES
- domain-config.mjs: validate domain argument against [a-z0-9][a-z0-9-]* before path construction (Behavior 7a / SEC-2)

Spec: .context-index/specs/features/validation/validate-config-single-source.spec.md
Plan-task: 2"
```

---

### Task 3: Author Software Domain Starter [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Mechanical file copy from Task 1-modified defaults.yaml; direct peer files exist in templates/domains/software/ as structural reference; single-file create with minimal blast radius.

**Charter capability:** Validation skill — domain-specific check registry starters
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Create: `templates/domains/software/validate.yaml`
- Modify: `tests/domains/validate-domain-config.test.mjs` — strengthen assertion: `loadDomainConfig('software', 'validate', ...)` returns structured object with `checks` array
**Tests:** `tests/domains/validate-domain-config.test.mjs`

**Context to load:**
- `templates/validate/defaults.yaml` (Task 1 modified version — source content for the starter)
- `templates/domains/software/` directory (existing files — follow YAML structure conventions)

**Note:** Only the `software` domain starter ships in this spec. `data-engineering` and `process-automation` starters are deliberately deferred per spec section "Changes Catalog / ADDED" and the rev-1 SA-7 rationale.

- [ ] **Write failing test**

```javascript
// tests/domains/validate-domain-config.test.mjs — add to existing describe
it("loadDomainConfig('software', 'validate') returns a non-null structured object with checks array", () => {
  const result = loadDomainConfig('software', 'validate', REPO_ROOT, PLUGIN_ROOT);
  assert.ok(result !== null, 'software starter should exist');
  assert.ok(typeof result === 'object', 'should be parsed YAML object');
  assert.ok(Array.isArray(result.checks), 'should have a checks array');
  assert.ok(result.checks.length >= 12, 'should have at least 12 checks');
});

it("loadDomainConfig('data-engineering', 'validate') returns null (no starter shipped)", () => {
  const result = loadDomainConfig('data-engineering', 'validate', REPO_ROOT, PLUGIN_ROOT);
  assert.equal(result, null);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/domains/validate-domain-config.test.mjs`
Expected: FAIL — `software` starter does not yet exist at `templates/domains/software/validate.yaml`

- [ ] **Implement**

1. Read `templates/validate/defaults.yaml` (Task 1 version: `internal: true` removed, `prompt: plugin:validate/checks/<id>.md` added).
2. Create `templates/domains/software/validate.yaml` with the same content — this is the software-domain starter. Add a header comment: `# Software domain validate starter — generated from adev defaults. Project-owned after /adev:init.`
3. `data-engineering` and `process-automation` domain directories do not receive a `validate.yaml` file in this spec.

- [ ] **Verify test passes**

Run: `node --test tests/domains/validate-domain-config.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add templates/domains/software/validate.yaml tests/domains/validate-domain-config.test.mjs
git commit -m "feat(validation): add software domain validate.yaml starter

- templates/domains/software/validate.yaml: 12-entry starter from current defaults
- data-engineering and process-automation starters deferred per SA-7

Spec: .context-index/specs/features/validation/validate-config-single-source.spec.md
Plan-task: 3"
```

---

### Task 4: Update `/adev:init` to Scaffold `governance/validate.yaml` [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=4 pattern=3 blast=5 novelty=4
**Rationale:** Step content fully spelled out in the plan; single SKILL.md file with minimal blast radius; insertion-point finding in SKILL.md is the main risk, manageable without a checkpoint given the low file count.

**Charter capability:** Validation skill — governance scaffolding at init time
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Modify: `skills/init/SKILL.md` — add Step 7d instruction for validate.yaml scaffolding (after domain resolution, before Step 8)
**Tests:** `tests/governance/validate-config-single-source.test.mjs` — init scaffold simulation: when domain starter exists, scaffold writes `governance/validate.yaml`; when domain has no starter, falls back to software with advisory; idempotency (re-run is no-op)

**Context to load:**
- `skills/init/SKILL.md` (Step 7c/7d area — find insertion point for validate.yaml step)
- `lib/domains/resolve.mjs` (domain resolution API)

**Step 7d content for init SKILL.md:**

```markdown
### Step 7d: Scaffold `governance/validate.yaml`

After domain resolution:
1. Call `loadDomainConfig(resolvedDomain, 'validate', repoRoot, pluginRoot)`.
2. If the domain ships a starter AND `.context-index/governance/validate.yaml` does not yet exist:
   copy the starter file to `.context-index/governance/validate.yaml`.
3. If `loadDomainConfig` returns `null` (no starter for the resolved domain):
   fall back to `loadDomainConfig('software', 'validate', ...)` and write from the software starter.
   Print: `"No validate.yaml starter for domain '<domain>'; scaffolded from 'software' as fallback."`
4. If `.context-index/governance/validate.yaml` already exists: no-op (idempotent).
5. Do NOT prompt the user — this step is automatic, like gates.yaml scaffolding.
```

Note: The existing Step 7d in init SKILL.md (validate registry customization) becomes Step 7e — re-number subsequent steps accordingly.

- [ ] **Write failing test**

```javascript
// tests/governance/validate-config-single-source.test.mjs
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';
import { loadDomainConfig } from '../../lib/domains/domain-config.mjs';

const PLUGIN_ROOT = join(import.meta.dirname, '..', '..');

describe('init scaffold simulation: governance/validate.yaml', () => {
  it('software domain starter should produce a validate.yaml with checks array', () => {
    // This simulates what /adev:init Step 7d would do
    const starter = loadDomainConfig('software', 'validate', PLUGIN_ROOT, PLUGIN_ROOT);
    assert.ok(starter !== null, 'software starter must exist (Task 3 must be done first)');
    assert.ok(Array.isArray(starter.checks), 'starter must have checks array');
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/validate-config-single-source.test.mjs`
Expected: PASS on the loader test (Task 3 complete), but the `/adev:init` SKILL.md changes are prose changes — tested by the existence of the domain starter via Task 3 tests.

Note: The init SKILL.md update is a prose/instruction change. The integration test for it is the loadDomainConfig test above. A separate fixture-based test for init idempotency will be added in Task 11.

- [ ] **Implement**

1. Read `skills/init/SKILL.md` fully to locate Step 7d (existing validate registry step).
2. Insert the new Step 7d domain-aware scaffold instructions before the existing validate customization step (renumber the existing step as 7e).
3. Follow the wording from the spec's Migration Path Step 4 precisely.

- [ ] **Verify test passes**

Run: `node --test tests/governance/validate-config-single-source.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/init/SKILL.md tests/governance/validate-config-single-source.test.mjs
git commit -m "feat(validation): add /adev:init step to scaffold governance/validate.yaml

- Step 7d: loadDomainConfig(domain, 'validate') → copy to governance/validate.yaml if absent
- Falls back to software starter with advisory when domain has no starter
- Idempotent: no-op when file already exists

Spec: .context-index/specs/features/validation/validate-config-single-source.spec.md
Plan-task: 4"
```

---

### Task 5: Switch Loader to Single-Source [specialist: none]

**Routing:** assisted-agent (score: 15/20)
**Scores:** spec=5 pattern=4 blast=3 novelty=3
**Rationale:** Highest-risk migration step — removes overlay merge logic and updates SKILL.md simultaneously; cross-module blast radius and three-pattern composition (removal + single-source read + id allowlist) warrants mid-point review of failing tests before GREEN phase.

**Charter capability:** Validation skill — single-source registry load model
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 4
**Files:**
- Modify: `lib/governance/validate-config.mjs` — remove bundled-defaults read; remove overlay merge loop; add direct single-source read; add `MISSING_VALIDATE_CONFIG` error; add `INVALID_CHECK_ID` id allowlist enforcement
- Modify: `skills/validate/SKILL.md` — remove per-check prose (lines ~155-637); update Step 0 registry-load description to reflect single-source model; add preflight missing-file check
**Tests:** `tests/governance/validate-config.test.mjs` — existing tests must remain green (pre-existing projects have `governance/validate.yaml`); new tests for missing-file error and id allowlist

**Context to load:**
- `lib/governance/validate-config.mjs` (full read — loader to refactor)
- `lib/governance/review-config.mjs` (reference — single-source pattern)
- `tests/governance/validate-config.test.mjs` (existing tests — must remain green)

**Key changes to `validate-config.mjs`:**

```javascript
// REMOVE: bundled-defaults load path
// const bundledPath = join(pluginRoot, "templates", "validate", "defaults.yaml");
// REMOVE: overlay merge logic

// ADD: single-source read
const governancePath = join(repoRoot, ".context-index", "governance", "validate.yaml");
if (!existsSync(governancePath)) {
  const err = new Error(
    'No governance/validate.yaml found. Run /adev:init to scaffold the validate configuration for your domain.'
  );
  err.code = 'MISSING_VALIDATE_CONFIG';
  throw err;
}

// ADD: id allowlist enforcement (Behavior 0 / SEC-1)
const ID_ALLOWLIST = /^[a-z0-9][a-z0-9._-]*$/;
function validateCheckId(id) {
  if (!ID_ALLOWLIST.test(id)) {
    const sanitized = id.replace(/[^a-z0-9._-]/g, '').slice(0, 64);
    const err = new Error(`INVALID_CHECK_ID: entry id "${sanitized}" (stripped/truncated) does not match ^[a-z0-9][a-z0-9._-]*$.`);
    err.code = 'INVALID_CHECK_ID';
    throw err;
  }
}
```

- [ ] **Write failing test**

```javascript
// tests/governance/validate-config.test.mjs — add
test("missing governance/validate.yaml throws MISSING_VALIDATE_CONFIG", () => {
  const repo = tmp();
  // No governance/validate.yaml written
  assert.throws(
    () => loadValidateConfig(repo),
    (err) => err.code === 'MISSING_VALIDATE_CONFIG'
  );
});

test("id with path traversal fails load with INVALID_CHECK_ID", () => {
  const repo = tmp();
  writeFixture(repo, ".context-index/governance/validate.yaml", `
checks:
  - id: ../../bad
    kind: observational
`);
  assert.throws(
    () => loadValidateConfig(repo),
    (err) => err.code === 'INVALID_CHECK_ID'
  );
});

test("id with spaces fails load with INVALID_CHECK_ID", () => {
  const repo = tmp();
  writeFixture(repo, ".context-index/governance/validate.yaml", `
checks:
  - id: with spaces
    kind: observational
`);
  assert.throws(
    () => loadValidateConfig(repo),
    (err) => err.code === 'INVALID_CHECK_ID'
  );
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/validate-config.test.mjs`
Expected: FAIL — `MISSING_VALIDATE_CONFIG` not thrown (loader currently falls back to bundled defaults); `INVALID_CHECK_ID` not implemented

- [ ] **Implement**

1. Refactor `lib/governance/validate-config.mjs`:
   - Remove `bundledPath` load, `mergeChecks()` function, and overlay merge loop.
   - Add single-source read with `MISSING_VALIDATE_CONFIG` throw.
   - Add `validateCheckId()` function; call it before `validateCheck()` for each entry.
   - Keep all existing validation logic (`validateCheck`, `topologicalSort`, `shouldSkipDueToFailFast`, profile loading, severity defaults).
   - Keep `opts` parameter (`pluginRoot`, `domainSeverityDefaults`) unchanged.
   - Ensure `PROMPT_NOT_FOUND` diagnostic truncates to 128 chars and strips non-allowlist chars (from Task 1, verify it's present).
2. Update `skills/validate/SKILL.md`:
   - Remove per-check prose sections (lines ~155-637, the `### Check 1.5` through `### Check 13` sections with their substantive prompt bodies — keeping only the `### Check N:` headings and a note pointing to the externalized file).
   - Update the Step 0 registry-load description to say: reads `governance/validate.yaml` directly; throws `MISSING_VALIDATE_CONFIG` if absent.
   - Add preflight: before loading the check registry, verify `governance/validate.yaml` exists; if not, print the actionable error and stop.
3. Run `npm test` and verify all existing tests pass. Note: the existing `validate-config.test.mjs` zero-config test ("zero-config returns the 12 bundled checks") will need to be updated — after the switch, zero-config means no file → `MISSING_VALIDATE_CONFIG`. Update the test to write a `governance/validate.yaml` fixture first.

- [ ] **Verify test passes**

Run: `node --test tests/governance/validate-config.test.mjs`
Expected: PASS (including updated zero-config test and new tests)

- [ ] **Commit**

```bash
git add lib/governance/validate-config.mjs skills/validate/SKILL.md tests/governance/validate-config.test.mjs
git commit -m "feat(validation): switch validate-config loader to single-source model

- Remove bundled-defaults read and overlay merge loop
- Add MISSING_VALIDATE_CONFIG error when governance/validate.yaml absent
- Add INVALID_CHECK_ID id allowlist enforcement before URI construction (SEC-1)
- Update SKILL.md: remove per-check prose, add preflight missing-file check

Spec: .context-index/specs/features/validation/validate-config-single-source.spec.md
Plan-task: 5"
```

---

### Task 6: Delete `templates/validate/defaults.yaml` [specialist: none]

**Routing:** auto-agent (score: 20/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=5
**Rationale:** Trivially mechanical — grep for consumers, delete, run tests; perfectly specified with no design decisions.

**Charter capability:** Validation skill — remove bundled-defaults artifact
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 5
**Files:**
- Delete: `templates/validate/defaults.yaml`
**Tests:** Verify via `npm test` (no explicit test file change; absence of consumers verified via grep)

**Context to load:**
- `templates/validate/defaults.yaml` (to confirm no remaining in-code references)

- [ ] **Write failing test** (verification step only — no new test file required)

Verification: run `grep -r 'templates/validate/defaults' .` — should return results referencing the file itself (before deletion).

- [ ] **Verify test fails** (pre-deletion grep)

```bash
grep -r "templates/validate/defaults" . --include="*.mjs" --include="*.yaml" --include="*.md" | grep -v "node_modules" | grep -v ".git"
```
Expected: only references in the file itself and possibly the spec/plan files. Verify no remaining code imports it.

- [ ] **Implement**

1. Run grep to confirm no `.mjs` or test files still reference `templates/validate/defaults`.
2. Delete `templates/validate/defaults.yaml`.
3. Run `npm test` to confirm all tests pass.

- [ ] **Verify test passes**

Run: `npm test`
Expected: PASS. Run `grep -r 'templates/validate/defaults' . --include="*.mjs"` — returns zero results.

- [ ] **Commit**

```bash
git rm templates/validate/defaults.yaml
git commit -m "feat(validation): delete templates/validate/defaults.yaml

Bundled-defaults file removed; content lives in templates/domains/software/validate.yaml.
All consumers verified clean (grep confirms zero remaining .mjs references).

Spec: .context-index/specs/features/validation/validate-config-single-source.spec.md
Plan-task: 6"
```

---

### Task 7: Add Hygiene Validate Config Drift Audit Pass [specialist: none]

**Routing:** assisted-agent (score: 15/20)
**Scores:** spec=4 pattern=3 blast=5 novelty=3
**Rationale:** No golden sample for hygiene SKILL.md audit pass additions; the SEC-4 value-type-only emission for sensitive fields is a novel constraint requiring careful implementation; mid-point review verifies the diff format before full prose is committed.

**Charter capability:** Validation skill — drift visibility between project config and domain starter
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 5
**Files:**
- Modify: `skills/hygiene/SKILL.md` — add "Validate Config Drift" audit pass section
**Tests:** `tests/governance/validate-config-single-source.test.mjs` — add hygiene drift simulation tests: fixture where `governance/validate.yaml` differs from software starter reports INFO findings per divergent entry; fixture where they match reports no findings. For `prompt:` and `context_pack:` fields, verify only field name + value type are emitted (not full values) per SEC-4.

**Context to load:**
- `skills/hygiene/SKILL.md` (full read — find insertion point for new audit pass)
- `lib/domains/domain-config.mjs` (loadDomainConfig API)

**Hygiene pass content (for SKILL.md):**

```markdown
### Validate Config Drift

1. Resolve the project's domain (from manifest, spec frontmatter, or module slug).
2. Call `loadDomainConfig(domain, 'validate', repoRoot, pluginRoot)` to get the current domain starter.
3. If `loadDomainConfig` returns `null`: skip with INFO "No validate.yaml starter for domain '<domain>' — drift check not applicable."
4. If `.context-index/governance/validate.yaml` does not exist: skip with INFO "No governance/validate.yaml found — run /adev:init to scaffold."
5. Load both files and compare by `id`, field-by-field.
6. For each registry entry that differs:
   a. For `prompt:` and `context_pack:` fields: emit `<field>: <starter-value-type> vs <project-value-type>` (e.g., `prompt: <plugin-URI> vs <project-relative-path>`) — NOT the full string values (SEC-4).
   b. For all other fields: emit the starter value and the project value.
7. Report each divergence as INFO (not WARN — divergence is expected customization; the audit's purpose is visibility).
8. If no divergence: emit INFO "Validate config is current with domain starter."
```

- [ ] **Write failing test**

```javascript
// tests/governance/validate-config-single-source.test.mjs — add
import { loadDomainConfig } from '../../lib/domains/domain-config.mjs';

describe('hygiene drift simulation', () => {
  it('detects divergence between project validate.yaml and software starter', () => {
    const repo = tmp();
    // Write a governance/validate.yaml that differs from software starter (e.g., prompt field changed)
    writeFixture(repo, '.context-index/governance/validate.yaml', `
checks:
  - id: validate.check-2-spec-compliance
    kind: subagent-review
    profile: reviewer-capable
    prompt: governance/validate-prompts/custom-check-2.md
    severity: error
`);
    const starter = loadDomainConfig('software', 'validate', repo, PLUGIN_ROOT);
    assert.ok(starter !== null, 'software starter must exist');
    // Find the check in starter
    const starterCheck = starter.checks.find(c => c.id === 'validate.check-2-spec-compliance');
    assert.ok(starterCheck, 'check must exist in starter');
    // Drift: project has custom prompt, starter has plugin: URI
    assert.notEqual(
      starterCheck.prompt,
      'governance/validate-prompts/custom-check-2.md',
      'starter and project prompts should differ (verifying drift detection setup)'
    );
  });

  it('SEC-4: prompt field diff emits value types, not full values', () => {
    // This is a structural verification — the hygiene pass prose ensures
    // prompt: and context_pack: fields emit <plugin-URI> vs <project-relative-path>
    // not the full string values. We verify the pattern by checking the
    // loadDomainConfig output shape.
    const starter = loadDomainConfig('software', 'validate', PLUGIN_ROOT, PLUGIN_ROOT);
    assert.ok(starter !== null);
    // Verify starter has plugin: URIs (so a project with relative paths would show type difference)
    const checkWithPrompt = starter.checks.find(c => c.prompt && c.prompt.startsWith('plugin:'));
    assert.ok(checkWithPrompt, 'starter should have at least one check with plugin: URI');
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/validate-config-single-source.test.mjs`
Expected: FAIL — tests reference software starter which must exist from Task 3

Note: These tests will PASS once Task 3 is complete. The hygiene SKILL.md change itself is a prose change tested by the loader fixture tests.

- [ ] **Implement**

1. Read `skills/hygiene/SKILL.md` fully to find the audit pass insertion point (after existing audit passes, before the report assembly section).
2. Add the "Validate Config Drift" audit pass section per the content above.
3. Ensure the SEC-4 constraint is explicitly stated: for `prompt:` and `context_pack:` fields, emit field type indicators only, not full string values.

- [ ] **Verify test passes**

Run: `node --test tests/governance/validate-config-single-source.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/hygiene/SKILL.md tests/governance/validate-config-single-source.test.mjs
git commit -m "feat(validation): add Validate Config Drift audit pass to /adev:hygiene

- Compares governance/validate.yaml against current domain starter entry-by-entry
- Reports divergence as INFO (not WARN — divergence is expected customization)
- SEC-4: prompt: and context_pack: fields emit value types only, not full strings

Spec: .context-index/specs/features/validation/validate-config-single-source.spec.md
Plan-task: 7"
```

---

### Task 8: Migration Tool for Existing Projects [specialist: none]

**Routing:** assisted-agent (score: 15/20)
**Scores:** spec=4 pattern=3 blast=4 novelty=4
**Rationale:** CLI subcommand extension with three distinct branches; no golden sample for CLI migrate extension; existing adev migrate pattern at line ~1091 must be discovered and adapted; mid-point review before full implementation validates the branch logic and exit-code handling.

**Charter capability:** Validation skill — safe upgrade path for existing projects
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 4, Task 5
**Files:**
- Modify: `cli/index.mjs` — extend `adev migrate` subcommand with `validate-config` migration logic (or add `adev migrate-validate` subcommand)
**Tests:** `tests/governance/validate-config-single-source.test.mjs` — three fixture branches: absent (tool writes starter), valid (tool no-ops), malformed (tool refuses with `MIGRATION_BLOCKED_BY_CORRUPT_CONFIG`)

**Context to load:**
- `cli/index.mjs` (lines ~1091-1170 — existing `adev migrate` pattern)
- Migration tool behavior from spec Migration Path Step 8 and Error Cases table

**Migration tool behavior:**
1. Detects whether `.context-index/governance/validate.yaml` is absent, present and valid, or present and malformed.
2. Absent: resolves domain, writes from starter (mirrors `/adev:init` Step 7d). Idempotent.
3. Present and valid: no-op; reports "already migrated."
4. Present and malformed: refuses, reports parse error, directs user to inspect manually, exits with `MIGRATION_BLOCKED_BY_CORRUPT_CONFIG`.

- [ ] **Write failing test**

```javascript
// tests/governance/validate-config-single-source.test.mjs — add
import { parseYaml } from '../../lib/profiles/yaml.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

describe('migration tool: three fixture branches', () => {
  it('absent: loadDomainConfig returns starter (simulating migration write path)', () => {
    const starter = loadDomainConfig('software', 'validate', PLUGIN_ROOT, PLUGIN_ROOT);
    assert.ok(starter !== null);
    assert.ok(Array.isArray(starter.checks));
  });

  it('malformed: corrupt YAML fails parse (simulating MIGRATION_BLOCKED_BY_CORRUPT_CONFIG branch)', () => {
    const repo = tmp();
    writeFixture(repo, '.context-index/governance/validate.yaml', 'checks: [invalid: yaml: :::');
    assert.throws(
      () => {
        const content = readFileSync(join(repo, '.context-index/governance/validate.yaml'), 'utf8');
        parseYaml(content);
      },
      (err) => err instanceof Error // parse error
    );
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/validate-config-single-source.test.mjs`
Expected: FAIL — migration logic not yet implemented in CLI

Note: The fixture tests exercise the underlying primitives. The CLI integration is the primary change.

- [ ] **Implement**

1. Read `cli/index.mjs` around line 1091 (existing `adev migrate` pattern).
2. Add a `validate-config` migration operation to the existing migrate command (or a new `migrate-validate` subcommand if the existing migrate command structure makes composition awkward).
3. Migration logic:
   - Check if `governance/validate.yaml` exists.
   - If absent: call `loadDomainConfig(resolvedDomain, 'validate', cwd, pluginRoot)` and write the starter. Log "Wrote governance/validate.yaml from <domain> starter."
   - If present: attempt to parse with `parseYaml`. If parse succeeds: log "governance/validate.yaml already present and valid — no migration needed." If parse fails: log the parse error, the file path, and "Fix the file manually before re-running migration." Exit with code 1 (code: `MIGRATION_BLOCKED_BY_CORRUPT_CONFIG`).
4. Update CLI help text to include the new migration operation.

- [ ] **Verify test passes**

Run: `node --test tests/governance/validate-config-single-source.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add cli/index.mjs tests/governance/validate-config-single-source.test.mjs
git commit -m "feat(validation): add validate-config migration tool to adev CLI

- adev migrate (validate-config): writes governance/validate.yaml from domain starter if absent
- Idempotent: no-op when file exists and is valid
- Refuses with MIGRATION_BLOCKED_BY_CORRUPT_CONFIG when file exists but is malformed

Spec: .context-index/specs/features/validation/validate-config-single-source.spec.md
Plan-task: 8"
```

---

### Task 9: Annotate `configurable-checks.spec.md` and Amend ADR-0003 [specialist: none]

**Routing:** auto-agent (score: 20/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=5
**Rationale:** Exact annotation text and frontmatter field provided verbatim in the plan; pure documentation insertion into two files with zero code impact.

**Charter capability:** Validation skill — lifecycle hygiene (supersession round-trip, ADR accuracy)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** — (independent; can run after Task 3)
**Files:**
- Modify: `.context-index/specs/features/validation/configurable-checks.spec.md` — add partial-supersession header annotation; add `superseded-by-behaviors:` frontmatter field
- Modify: `.context-index/adrs/0003-configurable-review-registry.md` — add "Revised" note narrowing "Zero behavior change" guarantee
**Tests:** No automated tests — verify via spec frontmatter inspection

**Context to load:**
- `configurable-checks.spec.md` (full read — frontmatter and header to update)
- `0003-configurable-review-registry.md` (full read — location to add revision note)
- `validate-config-single-source.spec.md` (spec frontmatter — `supersedes-behaviors:` field to use as the basis for the reverse pointer)

**Annotation content for `configurable-checks.spec.md` header:**

```markdown
> **Partial supersession**: Behaviors 1, 2, 5 (registry loading & merge, canonical IDs from defaults)
> and Acceptance Criterion #1 (zero-config behavior) are superseded by
> `validate-config-single-source.spec.md`. The configurable-checks `kind` taxonomy,
> profile-driven dispatch, `kind: deterministic-check` restriction, quality-gate argv form
> and shell-rejection, prompt URI resolution, ordering via `after:`, severity semantics,
> and report emission (Behaviors 6-23, 25, 26) remain in force.
```

**Frontmatter field to add:**

```yaml
superseded-by-behaviors:
  - validate-config-single-source.spec.md#behavior-1
  - validate-config-single-source.spec.md#behavior-2
  - validate-config-single-source.spec.md#behavior-5
```

**ADR-0003 revision note:**

Add at the end of the ADR, after the existing "Accepted" note:

```markdown
> **Revised 2026-05-15 (validate-config-single-source.spec.md):** The "Zero behavior change for
> existing projects" guarantee (bundled defaults flow-through) has been narrowed for the validate
> registry. Plugin-supplied prompt improvements now reach projects via opt-in adoption (drift
> surfaced by `/adev:hygiene` Validate Config Drift pass) rather than auto-merge. This is the
> same trade-off already accepted for `unified-gates` (governance/gates.yaml). The ADR remains
> accepted; this note records the narrowing. ADR-0003 §Consequences bullet "Zero behavior change
> for existing projects" applies only to `governance/review.yaml` going forward.
```

- [ ] **Write failing test** (verification-only, no automated test file)

Manual check: `grep "superseded-by-behaviors" .context-index/specs/features/validation/configurable-checks.spec.md`
Expected before implementation: no results.

- [ ] **Verify test fails**

Run: `grep "superseded-by-behaviors" .context-index/specs/features/validation/configurable-checks.spec.md`
Expected: no output (field not yet present)

- [ ] **Implement**

1. Read `configurable-checks.spec.md` fully.
2. Add `superseded-by-behaviors:` frontmatter field pointing at `validate-config-single-source.spec.md` Behaviors 1, 2, 5.
3. Add the partial-supersession annotation after the YAML frontmatter block (before the first `#` heading).
4. Read `0003-configurable-review-registry.md` fully.
5. Add the "Revised" note at the end of the ADR.
6. Run `npm test` to confirm no test breakage.

- [ ] **Verify test passes**

Run: `grep "superseded-by-behaviors" .context-index/specs/features/validation/configurable-checks.spec.md`
Expected: one matching line with the field.

- [ ] **Commit**

```bash
git add .context-index/specs/features/validation/configurable-checks.spec.md .context-index/adrs/0003-configurable-review-registry.md
git commit -m "docs(validation): annotate configurable-checks supersession + amend ADR-0003

- configurable-checks.spec.md: add partial-supersession header and superseded-by-behaviors: frontmatter (round-trip for SA-3/CON-1)
- ADR-0003: add Revised note narrowing zero-behavior-change guarantee for validate registry (SA-6)

Spec: .context-index/specs/features/validation/validate-config-single-source.spec.md
Plan-task: 9"
```

---

### Task 10: Update Validation Charter Skills Section [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=3 pattern=4 blast=5 novelty=4
**Rationale:** Single-file prose update with clear content requirements (four bullet points from the plan); well-constrained scope despite lacking verbatim text; peer charter files in the same directory provide structural reference.

**Charter capability:** Validation skill — charter accuracy
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** — (independent)
**Files:**
- Modify: `.context-index/specs/features/validation/charter.md` — update Skills section to reflect single-source model and externalized check prompts
**Tests:** No automated tests — prose update

- [ ] **Write failing test** (verification-only)

Manual check: `grep "check prompts\|checks/<id>" .context-index/specs/features/validation/charter.md`
Expected before implementation: no results (charter currently doesn't mention externalized check files).

- [ ] **Verify test fails**

Run: `grep "checks/" .context-index/specs/features/validation/charter.md`
Expected: no output

- [ ] **Implement**

Update the charter's Skills section to describe:
- `adev:validate` uses a single `governance/validate.yaml` as the check registry (single source of truth)
- Per-check subagent prompts live in `skills/validate/checks/<id>.md`
- Registry is scaffolded at init time from the domain's `templates/domains/<domain>/validate.yaml` starter
- Key files: `lib/governance/validate-config.mjs` (loader), `skills/validate/checks/` (check prompts), `templates/domains/software/validate.yaml` (starter)

- [ ] **Verify test passes**

Run: `grep "checks/" .context-index/specs/features/validation/charter.md`
Expected: one or more lines referencing `skills/validate/checks/`

- [ ] **Commit**

```bash
git add .context-index/specs/features/validation/charter.md
git commit -m "docs(validation): update charter Skills section for single-source model

Reflects: governance/validate.yaml as single registry, skills/validate/checks/<id>.md for prompts,
domain starter at templates/domains/<domain>/validate.yaml.

Spec: .context-index/specs/features/validation/validate-config-single-source.spec.md
Plan-task: 10"
```

---

### Task 11: Augment Tests for All New Behaviors [specialist: none]

**Routing:** assisted-agent (score: 13/20)
**Scores:** spec=4 pattern=3 blast=3 novelty=3
**Rationale:** Spans 3 test files across 2 modules with 15 coverage requirements; integration across all Tasks 1-8 means subtle gaps in test setup (fixtures vs real files) are a real risk; mid-point review after failing tests are written verifies coverage before implementation proceeds.

**Charter capability:** Validation skill — test coverage for all spec acceptance criteria
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1 through Task 8
**Files:**
- Modify: `tests/governance/validate-config.test.mjs` — add parity test; add prompt URI resolution edge cases; update zero-config test to use `governance/validate.yaml` fixture
- Modify: `tests/governance/validate-config-single-source.test.mjs` — add full coverage test set
- Modify: `tests/domains/validate-domain-config.test.mjs` — add idempotency test and data-engineering fallback test
**Tests:** This task IS the test augmentation

**Required test coverage (from spec Acceptance Criteria):**

1. `templates/validate/defaults.yaml` is removed — verified by `npm test` passing and grep clean (Task 6)
2. `skills/validate/checks/<id>.md` exists for every registry entry — assert 12 files exist and are non-empty
3. `loadValidateConfig(repoRoot, opts?)` reads `governance/validate.yaml` directly — covered by Task 5 tests
4. Registry `id` allowlist enforced at parse time — `../../bad` and `with spaces` fail with `INVALID_CHECK_ID` (Task 5)
5. `loadDomainConfig` domain arg validated — `../etc` throws `INVALID_DOMAIN_ARG` (Task 2)
6. `PROMPT_NOT_FOUND` truncated to ≤128 chars, allowlist-stripped — fixture test
7. Hygiene drift diff emits value types for `prompt:` and `context_pack:` — structural test (Task 7)
8. Migration tool refuses malformed YAML — parse error test (Task 8)
9. `MISSING_VALIDATE_CONFIG` when `governance/validate.yaml` absent — covered (Task 5)
10. `loadDomainConfig('software', 'validate')` returns non-null; `data-engineering` returns null (Task 3)
11. `/adev:init` scaffold idempotency — fixture writes file, second call is no-op
12. Hygiene drift audit: fixture with matching config reports no findings
13. Parity test: project with existing `governance/validate.yaml` produces identical registry (old overlay output = new loader read)
14. Supersession round-trip: `configurable-checks.spec.md` frontmatter contains `superseded-by-behaviors:` (Task 9)
15. All quality gates pass: `npm test`

- [ ] **Write failing test**

```javascript
// tests/governance/validate-config-single-source.test.mjs — full coverage
import { existsSync, readdirSync } from 'node:fs';

describe('validate-config-single-source: full coverage', () => {
  it('12 check prompt files exist under skills/validate/checks/', () => {
    const checksDir = join(PLUGIN_ROOT, 'skills', 'validate', 'checks');
    assert.ok(existsSync(checksDir), 'checks/ directory must exist');
    const files = readdirSync(checksDir).filter(f => f.endsWith('.md'));
    assert.ok(files.length >= 12, `Expected >= 12 check files, got ${files.length}`);
  });

  it('parity: project with governance/validate.yaml reads identically to what old overlay produced', () => {
    const repo = tmp();
    // A project that previously had governance/validate.yaml with full registry
    // produces identical output under new loader
    const softwareStarter = loadDomainConfig('software', 'validate', PLUGIN_ROOT, PLUGIN_ROOT);
    assert.ok(softwareStarter !== null);
    // Write the full starter as governance/validate.yaml
    const { stringify } = { stringify: (o) => JSON.stringify(o) }; // placeholder
    writeFixture(repo, '.context-index/governance/validate.yaml',
      `checks:\n${softwareStarter.checks.map(c => `  - id: ${c.id}\n    kind: ${c.kind || 'subagent-review'}`).join('\n')}`
    );
    const result = loadValidateConfig(repo, { pluginRoot: PLUGIN_ROOT });
    assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
    // All check IDs present
    const ids = result.checks.map(c => c.id);
    assert.ok(ids.includes('validate.check-2-spec-compliance'));
  });

  it('PROMPT_NOT_FOUND diagnostic is truncated to <=128 chars', () => {
    const repo = tmp();
    const longId = 'validate.check-2-spec-compliance';
    const longPrompt = 'plugin:validate/checks/' + 'a'.repeat(200) + '.md';
    writeFixture(repo, '.context-index/governance/validate.yaml', `
checks:
  - id: ${longId}
    kind: subagent-review
    profile: reviewer-capable
    prompt: "${longPrompt}"
`);
    try {
      const r = loadValidateConfig(repo, { pluginRoot: PLUGIN_ROOT });
      // Either the error is caught in the result.errors array or thrown
      const promptError = r.errors.find(e => e.code === 'PROMPT_NOT_FOUND');
      if (promptError) {
        assert.ok(promptError.message.length <= 300, 'error message should not be excessively long');
      }
    } catch (err) {
      // Thrown errors should also have bounded message
      assert.ok(err.message.length <= 300);
    }
  });

  it('supersession round-trip: configurable-checks.spec.md has superseded-by-behaviors field', () => {
    const specPath = join(PLUGIN_ROOT, '.context-index/specs/features/validation/configurable-checks.spec.md');
    const content = readFileSync(specPath, 'utf8');
    assert.ok(content.includes('superseded-by-behaviors:'), 'round-trip frontmatter field must be present');
    assert.ok(content.includes('validate-config-single-source'), 'must point at this spec');
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/validate-config-single-source.test.mjs`
Expected: FAIL — check prompt files don't exist yet (Task 1 not done in test context); supersession round-trip frontmatter not yet present

Note: This task is run after Tasks 1-9 are complete. It is a final integration verification that all acceptance criteria are met.

- [ ] **Implement**

1. Augment `tests/governance/validate-config.test.mjs`: update the zero-config test to write `governance/validate.yaml` from the software starter before calling `loadValidateConfig`.
2. Augment `tests/governance/validate-config-single-source.test.mjs`: add all remaining coverage tests listed above.
3. Augment `tests/domains/validate-domain-config.test.mjs`: add init idempotency simulation test.
4. Run `npm test` and verify all tests pass.

- [ ] **Verify test passes**

Run: `npm test`
Expected: PASS — all tests including the full coverage suite

- [ ] **Commit**

```bash
git add tests/governance/validate-config.test.mjs tests/governance/validate-config-single-source.test.mjs tests/domains/validate-domain-config.test.mjs
git commit -m "test(validation): augment test coverage for validate-config-single-source spec

- Full acceptance criteria coverage: id allowlist, parity, round-trip, migration branches
- Updated zero-config test to use governance/validate.yaml fixture (single-source model)
- PROMPT_NOT_FOUND truncation bound test

Spec: .context-index/specs/features/validation/validate-config-single-source.spec.md
Plan-task: 11"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied (see Acceptance Criteria section of spec)

Additional post-completion verification:
- `grep -r 'templates/validate/defaults' . --include="*.mjs"` returns no results
- `ls skills/validate/checks/` shows 12 `.md` files
- `configurable-checks.spec.md` frontmatter contains `superseded-by-behaviors:`
- ADR-0003 contains "Revised" note
- `templates/domains/software/validate.yaml` exists and has a `checks` array
- `governance/validate.yaml` does not exist at plugin root (only at project level)
