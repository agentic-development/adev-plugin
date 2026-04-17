# Implementation Plan: Unified Gate System

> **Methodology:** adev
> **Charter:** .context-index/specs/features/unified-gates/charter.md
> **Spec:** .context-index/specs/features/unified-gates/unified-gate-system.md
> **Review:** PASS_WITH_NOTES (2026-04-15)
> **Platform:** Node.js, JavaScript (ESM), node:test, npm

**Goal:** Make `governance/gates.yaml` the sole source of truth for all gate definitions with tiered execution (fast/integration/e2e), replacing the dual governance-vs-manifest gate system.

**Architecture:** All changes are to markdown skill files and YAML templates — no runtime code changes (per Principle 2: skills are primarily markdown). Each consuming skill (validate, implement, build, hygiene) will be updated to read exclusively from `governance/gates.yaml`, removing manifest `gates:` fallback logic. The `gates-template.yaml` template gains `tier` and `severity` fields; the `manifest-template.yaml` loses its `gates:` section. Init skill scaffolding is updated to generate `governance/gates.yaml` from the template.

---

## File Structure

**Modify:**
- `templates/gates-template.yaml` — Rewrite with unified schema (add `tier`, `severity`, `group` fields)
- `templates/manifest-template.yaml` — Remove `gates:` section and governance precedence comments
- `skills/validate/SKILL.md` — Rewrite Check 1 gate source resolution, update Checks 8-9 skip behavior, add skip summary
- `skills/implement/SKILL.md` — Update Step 2-post to read from `governance/gates.yaml`
- `skills/build/SKILL.md` — Update dry-run to read from `governance/gates.yaml`
- `skills/hygiene/SKILL.md` — Update Pass 8 to validate unified schema (tier values, severity values, gate ID uniqueness)
- `skills/init/SKILL.md` — Update governance scaffolding step, add legacy migration detection

**Test:**
- `tests/templates/gates-template.test.mjs` — New: validate unified schema structure
- `tests/templates/manifest-template.test.mjs` — Update: verify `gates:` section is absent

**Reference (read, do not modify):**
- `.context-index/specs/features/unified-gates/unified-gate-system.md` — Behavioral contract
- `.context-index/specs/features/unified-gates/charter.md` — Capability map
- `.context-index/constitution.md` — Principles and quality gates

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/unified-gates/unified-gate-system.md` (Behaviors 1-7, 27; AC: gates-template uses unified schema)
- Charter: `.context-index/specs/features/unified-gates/charter.md` (capability: Unified Gate Schema)
- Current file: `templates/gates-template.yaml`

### Task 2 Context
- Spec: `.context-index/specs/features/unified-gates/unified-gate-system.md` (Behaviors 22-23; AC: manifest-template no gates section)
- Charter: `.context-index/specs/features/unified-gates/charter.md` (capability: Manifest Gates Removal)
- Current file: `templates/manifest-template.yaml`

### Task 3 Context
- Spec: `.context-index/specs/features/unified-gates/unified-gate-system.md` (Behaviors 8-12, 18-21; AC: Check 1 splits 1a/1b/1c, skip reporting, fail-fast)
- Charter: `.context-index/specs/features/unified-gates/charter.md` (capabilities: Tiered Execution from Governance, Explicit Skip Reporting, Severity and Required Reconciliation, E2E Sub-keys)
- Current file: `skills/validate/SKILL.md` (lines 32-72 Check 1, lines 180-195 Checks 8-9)

### Task 4 Context
- Spec: `.context-index/specs/features/unified-gates/unified-gate-system.md` (Behaviors 13-15; AC: implement reads integration-tier from governance)
- Charter: `.context-index/specs/features/unified-gates/charter.md` (capability: Skill Migration)
- Current file: `skills/implement/SKILL.md` (lines 301-338 Step 2-post)

### Task 5 Context
- Spec: `.context-index/specs/features/unified-gates/unified-gate-system.md` (Behaviors 16-17; AC: build dry-run displays from governance)
- Charter: `.context-index/specs/features/unified-gates/charter.md` (capability: Skill Migration)
- Current file: `skills/build/SKILL.md` (lines 238-281 dry-run)

### Task 6 Context
- Spec: `.context-index/specs/features/unified-gates/unified-gate-system.md` (Behavior 26; AC: hygiene validates unified schema)
- Charter: `.context-index/specs/features/unified-gates/charter.md` (capability: Skill Migration)
- Current file: `skills/hygiene/SKILL.md` (lines 327-361 Pass 8)

### Task 7 Context
- Spec: `.context-index/specs/features/unified-gates/unified-gate-system.md` (Behaviors 22-23b; AC: init scaffolds governance/gates.yaml, legacy migration detection)
- Charter: `.context-index/specs/features/unified-gates/charter.md` (capabilities: Manifest Gates Removal, Backward Compatibility Path)
- Current file: `skills/init/SKILL.md` (lines 153-172 Step 7)

### Task 8 Context
- Spec: `.context-index/specs/features/unified-gates/unified-gate-system.md` (Behavior 23; AC: legacy gates detection)
- Charter: `.context-index/specs/features/unified-gates/charter.md` (capability: Backward Compatibility Path)
- Current files: `skills/validate/SKILL.md`, `skills/hygiene/SKILL.md`

### Task 9 Context
- Spec: `.context-index/specs/features/unified-gates/unified-gate-system.md` (AC: all 5 tiered-test-gates specs marked superseded)
- Already verified: all 5 specs have `status: superseded`

### Task 10 Context
- Spec: `.context-index/specs/features/unified-gates/unified-gate-system.md` (AC: all quality gates pass)
- Tests: `tests/templates/gates-template.test.mjs`, `tests/templates/manifest-template.test.mjs`

## Parallelization

- Group A (independent): Task 1 (gates-template.yaml)
- Group B (independent): Task 2 (manifest-template.yaml — different file from Task 1)
- Group C (independent): Task 3 (validate SKILL.md)
- Group D (independent): Task 4 (implement SKILL.md)
- Group E (independent): Task 5 (build SKILL.md)
- Group F (independent): Task 6 (hygiene SKILL.md)
- Group G (depends on Task 1): Task 7 (init SKILL.md — references template from Task 1)
- Group H (depends on Tasks 3, 6): Task 8 (legacy detection — additive modifications to validate and hygiene SKILL.md files already modified by Tasks 3 and 6)
- Group I (independent): Task 9 (superseded spec verification — no file overlap)
- Group J (depends on all): Task 10 (quality gates — final verification)

Groups A, B, C, D, E, F, I can all run in parallel. Group G after A. Group H after C+F. Task 10 last.

---

### Task 1: Update gates-template.yaml with Unified Schema [specialist: none]

**Charter capability:** Unified Gate Schema
**Files:**
- Modify: `templates/gates-template.yaml`
- Test: `tests/templates/gates-template.test.mjs`

**Tests:** `tests/templates/gates-template.test.mjs`

- [ ] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('gates-template.yaml', () => {
  const templatePath = join(__dirname, '..', '..', 'templates', 'gates-template.yaml');
  const content = readFileSync(templatePath, 'utf8');

  it('should contain commented examples with all unified fields', () => {
    // Verify all required fields appear in the template (as comments or values)
    const requiredFields = ['id', 'name', 'kind', 'tier', 'command', 'scope', 'required', 'severity', 'triggers'];
    for (const field of requiredFields) {
      assert.ok(content.includes(field), `Template must include field: ${field}`);
    }
  });

  it('should include tier values in examples', () => {
    assert.ok(content.includes('fast'), 'Template should show fast tier');
    assert.ok(content.includes('integration'), 'Template should show integration tier');
    assert.ok(content.includes('e2e'), 'Template should show e2e tier');
  });

  it('should include group field for e2e gates', () => {
    assert.ok(content.includes('group'), 'Template should include group field for e2e gates');
  });

  it('should include severity values in examples', () => {
    assert.ok(content.includes('error'), 'Template should show error severity');
    assert.ok(content.includes('warning'), 'Template should show warning severity');
  });

  it('should include transitions section', () => {
    assert.ok(content.includes('transitions'), 'Template should include transitions section');
    assert.ok(content.includes('required_gates'), 'Template should include required_gates');
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/templates/gates-template.test.mjs`
Expected: FAIL — missing `tier`, `severity`, `group` fields in current template

- [ ] **Implement**

Rewrite `templates/gates-template.yaml` with the unified schema. Each commented gate example must include all fields: `id`, `name`, `kind`, `tier`, `command`, `scope`, `required`, `severity`, `triggers`. Add a commented e2e gate example with `group: smoke` and `group: full`. Preserve the `transitions` section with commented examples.

Key changes from current template:
- Add `tier:` field to every gate example (defaulting to `fast`)
- Add `severity:` field with tier-specific defaults noted in comments
- Add `group:` field to e2e gate example
- Add comments explaining: tier defaults, severity defaults, `required: false` → `severity: warning` rule

- [ ] **Verify test passes**

Run: `node --test tests/templates/gates-template.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch: `feat/unified-gates/unified-gate-system`

```bash
git add templates/gates-template.yaml tests/templates/gates-template.test.mjs
git commit -m "feat(unified-gates): rewrite gates-template.yaml with unified schema"
```

---

### Task 2: Remove gates: Section from manifest-template.yaml [specialist: none]

**Charter capability:** Manifest Gates Removal
**Files:**
- Modify: `templates/manifest-template.yaml`
- Modify: `tests/templates/manifest-template.test.mjs`

**Tests:** `tests/templates/manifest-template.test.mjs`

- [ ] **Write failing test**

Add a test to the existing `tests/templates/manifest-template.test.mjs` that verifies the `gates:` section is absent:

```javascript
it('should not contain a gates: section', () => {
  // The gates: section has been moved to governance/gates.yaml
  const gatesLine = content.split('\n').find(line => /^gates:/.test(line.trim()));
  assert.equal(gatesLine, undefined, 'manifest-template should not contain a top-level gates: section');
});

it('should not reference governance precedence over manifest gates', () => {
  assert.ok(!content.includes('take precedence over the gates:'), 'Should not reference gates precedence');
});
```

- [ ] **Verify test fails**

Run: `node --test tests/templates/manifest-template.test.mjs`
Expected: FAIL — `gates:` section currently exists at line 144

- [ ] **Implement**

1. Remove the entire Quality Gates section from `templates/manifest-template.yaml` — from the `# Quality Gates` header comment block through the `gates:` key and all its entries (ending after `# build: "npm run build"`).
2. Remove the Governance (Optional) section — from the `# Governance (Optional)` header through the commented `governance:` block (ending after `#   overrides: .context-index/governance/overrides/`).
3. In their place, add a single comment pointing to `governance/gates.yaml`:
   ```yaml
   # ============================================================================
   # Quality Gates
   # Gate definitions have moved to governance/gates.yaml.
   # Run /adev:init (Step 7) to scaffold governance files.
   # ============================================================================
   ```

- [ ] **Verify test passes**

Run: `node --test tests/templates/manifest-template.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add templates/manifest-template.yaml tests/templates/manifest-template.test.mjs
git commit -m "feat(unified-gates): remove gates: section from manifest-template"
```

---

### Task 3: Update validate SKILL.md — Check 1 Tiered Execution and Skip Reporting [specialist: none]

**Charter capabilities:** Tiered Execution from Governance, Explicit Skip Reporting, Severity and Required Reconciliation, E2E Sub-keys
**Files:**
- Modify: `skills/validate/SKILL.md` (lines 32-72 Check 1, lines 180-195 Checks 8-9, report summary section)

**Tests:** `tests/skills/validate-gate-resolution.test.mjs`

- [ ] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('validate SKILL.md — unified gate system', () => {
  const skillPath = join(__dirname, '..', '..', 'skills', 'validate', 'SKILL.md');
  const content = readFileSync(skillPath, 'utf8');

  it('should NOT have manifest fallback for gate resolution', () => {
    // The old dual-source resolution must be removed
    assert.ok(!content.includes('If governance does not exist → read `manifest.yaml`'),
      'Should not have governance-to-manifest fallback');
    // The old "Tiered Gate Resolution (manifest.yaml)" section must be gone
    assert.ok(!content.includes('Tiered Gate Resolution (manifest.yaml)'),
      'Should not have manifest tiered gate resolution section');
  });

  it('should read gates exclusively from governance/gates.yaml with tiered execution', () => {
    // The new unified behavior: read governance/gates.yaml, group by tier field
    assert.ok(content.includes('governance/gates.yaml') && content.includes('group'),
      'Should read from governance/gates.yaml and group by tier');
    // Governance gates must now support tiered sub-checks (previously they were flat-only)
    assert.ok(!content.includes('Governance gates always execute as a flat Check 1'),
      'Should not describe governance gates as flat-only execution');
  });

  it('should report SKIP when governance/gates.yaml is absent', () => {
    assert.ok(content.includes('No governance/gates.yaml found'),
      'Should report SKIP with advisory when gates.yaml missing');
  });

  it('should report SKIP for Check 8 when governance directory absent', () => {
    // Must be governance/ directory absent, not just boundaries.yaml missing
    assert.ok(content.includes('No governance directory configured'),
      'Check 8 should SKIP when governance/ directory absent');
  });

  it('should report SKIP for Check 9 when no transitions', () => {
    assert.ok(content.includes('No transitions configured'),
      'Check 9 should SKIP when no transitions');
  });

  it('should include skip count in summary', () => {
    assert.ok(content.includes('skipped checks'),
      'Report summary should count skipped checks');
  });

  it('should handle required: false forcing severity: warning', () => {
    assert.ok(content.includes('required: false') && content.includes('severity: warning'),
      'Should document required:false → severity:warning rule');
  });

  it('should restrict --fix auto-fix to fast tier only', () => {
    assert.ok(content.includes('--fix') && content.includes('fast tier'),
      'Should document --fix applies only to fast tier');
    assert.ok(content.includes('Integration') && content.includes('never auto-fixed'),
      'Should document integration/e2e are never auto-fixed');
  });

  it('should skip undefined tiers with informational note', () => {
    assert.ok(content.includes('no gates configured, skipped'),
      'Should skip undefined tiers with informational note');
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/validate-gate-resolution.test.mjs`
Expected: FAIL — current SKILL.md has manifest fallback (`Tiered Gate Resolution (manifest.yaml)` section) and describes governance gates as flat-only (`Governance gates always execute as a flat Check 1`)

- [ ] **Implement**

Rewrite the Check 1 section (lines 32-72) of `skills/validate/SKILL.md`:

**Gate Source Resolution** — replace the current dual-source resolution with:
1. If `governance/gates.yaml` exists → read gates, group by `tier` (fast → integration → e2e), execute as sub-checks 1a/1b/1c
2. If `governance/gates.yaml` does not exist → SKIP with advisory: "No governance/gates.yaml found. Quality gates are not configured. Run `/adev:init` to set up gates."
3. Remove all references to `manifest.yaml gates:` as a gate source

**Tiered Execution** — rewrite using the unified schema rules:
- Gates are parsed with fields: `id`, `name`, `kind`, `tier`, `command`, `scope`, `required`, `severity`, `triggers`, `group` (e2e-only)
- Default `tier` to `fast` if omitted
- Default `kind` to `deterministic` if omitted
- Default severity: `error` for fast/integration, `warning` for e2e
- `required: false` forces `severity: warning` regardless of other settings
- `kind: probabilistic` → skip with note (no shell execution)
- Probabilistic with `command` → ignore command, emit WARN
- Group by tier, execute in order: fast → integration → e2e
- E2E `group: smoke` before `group: full`, with independent severity defaults

**Intra-tier fail-fast** — error-severity gate failure:
- Skip remaining gates in that tier with status `skip`
- Skip all subsequent tiers
- Skip Checks 2-10 (Check 11 exception preserved)

**Warning-severity failure** — record WARN, continue execution

**Update Checks 8-9:**
- Check 8 (Boundary Compliance): When the `governance/` directory itself does not exist → SKIP: "No governance directory configured." (not PASS). Note: this is distinct from `boundaries.yaml` being absent within an existing `governance/` directory — if `governance/` exists but `boundaries.yaml` is missing, that remains PASS (no rules configured). The SKIP applies only when the entire governance directory is absent.
- Check 9 (Transition Gates): When no transitions configured in `governance/gates.yaml` (or `governance/` absent) → SKIP: "No transitions configured." (not PASS)

**Add skip summary:** At end of report, include count of skipped checks with setup guidance if any were skipped due to missing configuration.

**Undefined tiers:** When TierConfig has no gates assigned to a tier (fast, integration, or e2e), that sub-check is skipped with an informational note: "`<tier>` tier — no gates configured, skipped." This is a skip, not a warning.

**`--fix` behavior:** Auto-fix applies only to the fast tier (Check 1a). If `--fix` was passed and a fast-tier gate fails, attempt auto-fix (e.g., `npx eslint --fix`). Re-run the gate. If it passes, record as PASS (auto-fixed). Integration and E2E gates are never auto-fixed.

**Misconfiguration warnings:** Empty gates list, invalid severity, invalid tier value (not fast/integration/e2e — default to fast with WARN), duplicate IDs → WARN with details.

- [ ] **Verify test passes**

Run: `node --test tests/skills/validate-gate-resolution.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/validate/SKILL.md tests/skills/validate-gate-resolution.test.mjs
git commit -m "feat(unified-gates): rewrite validate Check 1 for unified gate system"
```

---

### Task 4: Update implement SKILL.md — Step 2-post Integration Gate [specialist: none]

**Charter capability:** Skill Migration
**Files:**
- Modify: `skills/implement/SKILL.md` (lines 301-338)

**Tests:** `tests/skills/implement-integration-gate.test.mjs`

- [ ] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('implement SKILL.md — unified integration gate', () => {
  const skillPath = join(__dirname, '..', '..', 'skills', 'implement', 'SKILL.md');
  const content = readFileSync(skillPath, 'utf8');

  it('should read integration gates from governance/gates.yaml', () => {
    assert.ok(content.includes('governance/gates.yaml') && content.includes('integration'),
      'Step 2-post should reference governance/gates.yaml for integration gates');
  });

  it('should NOT read integration gates from manifest.yaml', () => {
    // Step 2-post should not reference manifest for integration gates
    const step2post = content.substring(content.indexOf('Step 2-post'));
    assert.ok(!step2post.includes('manifest.yaml') || !step2post.includes('gates.integration'),
      'Step 2-post should not read from manifest gates');
  });

  it('should skip when --task is passed', () => {
    const step2post = content.substring(content.indexOf('Step 2-post'));
    assert.ok(step2post.includes('--task') && step2post.includes('skip'),
      'Should skip integration gate on single-task re-run');
  });

  it('should skip silently when no integration-tier gates defined', () => {
    const step2post = content.substring(content.indexOf('Step 2-post'));
    assert.ok(step2post.includes('not defined') && step2post.includes('skip'),
      'Should skip silently when no integration gates');
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/implement-integration-gate.test.mjs`
Expected: FAIL — current Step 2-post reads from `manifest.yaml`

- [ ] **Implement**

Update Step 2-post (lines 313-338) in `skills/implement/SKILL.md`:

1. Change gate source: Read `governance/gates.yaml`. Filter gates where `tier: integration`. If no integration-tier gates exist, skip silently.
2. Remove: "Read `manifest.yaml` `gates:` section" and "tiered-gate-schema resolution rules" references.
3. Remove: Line 321 ("This step reads from `manifest.yaml` only. `governance/gates.yaml` does not apply...") — this is the exact opposite of the new behavior.
4. Keep: `--task <N>` skip behavior (Behavior 14), E2E exclusion note (Behavior 15-related), fail-fast semantics, severity handling, output truncation.

Also update Step 2h (lines 301-306) to remove the manifest fallback:
- Line 306: Remove "fall back to manifest quality gates (existing behavior)" — governance/gates.yaml is the sole source.

- [ ] **Verify test passes**

Run: `node --test tests/skills/implement-integration-gate.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/implement/SKILL.md tests/skills/implement-integration-gate.test.mjs
git commit -m "feat(unified-gates): update implement Step 2-post to read from governance/gates.yaml"
```

---

### Task 5: Update build SKILL.md — Dry-Run Gate Display [specialist: none]

**Charter capability:** Skill Migration
**Files:**
- Modify: `skills/build/SKILL.md` (lines 272-279 dry-run gate display)

**Tests:** `tests/skills/build-dry-run-gates.test.mjs`

- [ ] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('build SKILL.md — unified dry-run gates', () => {
  const skillPath = join(__dirname, '..', '..', 'skills', 'build', 'SKILL.md');
  const content = readFileSync(skillPath, 'utf8');

  it('should read gate display from governance/gates.yaml in dry-run', () => {
    assert.ok(content.includes('governance/gates.yaml'),
      'Dry-run should read from governance/gates.yaml');
  });

  it('should NOT read gates from manifest.yaml for display', () => {
    // The dry-run gate section should not reference manifest gates
    const dryRunSection = content.substring(content.indexOf('Gate tier summary'));
    if (dryRunSection) {
      assert.ok(!dryRunSection.includes('manifest.yaml'),
        'Dry-run gate display should not reference manifest.yaml');
    }
  });

  it('should delegate gate execution to implement and validate', () => {
    assert.ok(content.includes('delegate') || content.includes('Delegation'),
      'Build should delegate gate execution to consuming skills');
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/build-dry-run-gates.test.mjs`
Expected: FAIL — current dry-run reads from `manifest.yaml`

- [ ] **Implement**

Update the dry-run gate display section (around line 279) in `skills/build/SKILL.md`:

1. Change: "Read the `gates:` section of `manifest.yaml`" → "Read `governance/gates.yaml`"
2. Display: Show tier names and gate IDs: "Gates: fast (test, lint), integration (test), e2e (smoke)"
3. If `governance/gates.yaml` absent: "Gates: none configured"
4. Remove: References to manifest flat keys ("If `gates:` has flat keys, show 'Gates: flat (test, lint)'")
5. Keep: Display-only read, not gate resolution. No severity defaults, no tier ordering applied.

Also check the Step 4 (Implement) stop condition text — it references "integration gates fail with `severity: error` (see implement SKILL.md Step 2-post)". This reference to implement SKILL.md is correct and does not need changes since it delegates to the implement skill which will be updated in Task 4.

- [ ] **Verify test passes**

Run: `node --test tests/skills/build-dry-run-gates.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/build/SKILL.md tests/skills/build-dry-run-gates.test.mjs
git commit -m "feat(unified-gates): update build dry-run to read from governance/gates.yaml"
```

---

### Task 6: Update hygiene SKILL.md — Pass 8 Unified Schema Validation [specialist: none]

**Charter capability:** Skill Migration
**Files:**
- Modify: `skills/hygiene/SKILL.md` (lines 327-361 Pass 8)

**Tests:** `tests/skills/hygiene-pass8-unified.test.mjs`

- [ ] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('hygiene SKILL.md — Pass 8 unified schema', () => {
  const skillPath = join(__dirname, '..', '..', 'skills', 'hygiene', 'SKILL.md');
  const content = readFileSync(skillPath, 'utf8');

  it('should validate tier values (fast/integration/e2e)', () => {
    assert.ok(content.includes('tier') && content.includes('fast') && content.includes('integration') && content.includes('e2e'),
      'Pass 8 should validate tier values');
  });

  it('should validate severity values (error/warning)', () => {
    const pass8Section = content.substring(content.indexOf('Pass 8'));
    assert.ok(pass8Section.includes('severity'),
      'Pass 8 should validate severity values');
  });

  it('should check for duplicate gate IDs', () => {
    const pass8Section = content.substring(content.indexOf('Pass 8'));
    assert.ok(pass8Section.toLowerCase().includes('duplicate') || pass8Section.toLowerCase().includes('unique'),
      'Pass 8 should check for duplicate gate IDs');
  });

  it('should not reference manifest gates as fallback', () => {
    const pass8Section = content.substring(content.indexOf('Pass 8'));
    assert.ok(!pass8Section.includes('using manifest gates'),
      'Pass 8 should not reference manifest gates fallback');
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/hygiene-pass8-unified.test.mjs`
Expected: FAIL — current Pass 8 references "using manifest gates" and doesn't validate tier/severity

- [ ] **Implement**

Update Pass 8 (lines 327-361) in `skills/hygiene/SKILL.md`:

1. **Prerequisite check** — when `governance/` absent, change message from "Skipped — using manifest gates. No governance/ directory configured." to "Skipped — no governance/ directory configured. Run `/adev:init` to set up governance."
2. **Add new validation steps:**
   - Gate ID uniqueness: Flag DUPLICATE_GATE_ID if any two gates share an `id`
   - Tier value validation: Flag INVALID_TIER if `tier` is not `fast`, `integration`, or `e2e`
   - Severity value validation: Flag INVALID_SEVERITY if `severity` is not `error` or `warning`
   - Empty gates list: Flag EMPTY_GATES if `gates:` is defined but empty
3. **Keep existing steps:** YAML parsing, command validation, regex validation, charter override refs, transition gate refs, risk policy completeness.

- [ ] **Verify test passes**

Run: `node --test tests/skills/hygiene-pass8-unified.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/hygiene/SKILL.md tests/skills/hygiene-pass8-unified.test.mjs
git commit -m "feat(unified-gates): update hygiene Pass 8 for unified schema validation"
```

---

### Task 7: Update init SKILL.md — Governance Scaffolding and Legacy Migration [specialist: none]

**Charter capabilities:** Manifest Gates Removal, Backward Compatibility Path
**Depends on:** Task 1
**Files:**
- Modify: `skills/init/SKILL.md` (lines 153-172 Step 7)

**Tests:** `tests/skills/init-governance-scaffolding.test.mjs`

- [ ] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('init SKILL.md — governance scaffolding', () => {
  const skillPath = join(__dirname, '..', '..', 'skills', 'init', 'SKILL.md');
  const content = readFileSync(skillPath, 'utf8');

  it('should scaffold governance/gates.yaml from template', () => {
    assert.ok(content.includes('gates.yaml') && content.includes('template'),
      'Init should generate gates.yaml from template');
  });

  it('should detect legacy gates in manifest.yaml', () => {
    assert.ok(content.includes('Legacy gates') || content.includes('legacy gates'),
      'Init should detect legacy gates: section in manifest');
  });

  it('should offer migration path for legacy gates', () => {
    assert.ok(content.includes('governance/gates.yaml') && content.includes('migration') || content.includes('move'),
      'Init should offer to migrate legacy gates');
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/init-governance-scaffolding.test.mjs`
Expected: FAIL — current init doesn't have legacy migration detection

- [ ] **Implement**

Update Step 7 (lines 153-172) in `skills/init/SKILL.md`:

1. **Existing behavior preserved:** Create `governance/` directory, generate `gates.yaml` from template.
2. **Add legacy detection (Behavior 23b):** When running init on an existing project:
   - Check if `manifest.yaml` exists and contains a `gates:` section
   - If `gates:` exists and no `governance/gates.yaml` exists, print migration notice:
     "Legacy gates found in manifest.yaml. To adopt the unified gates system, move your gate definitions to governance/gates.yaml."
   - Offer to scaffold `governance/gates.yaml` from template
3. **Remove manifest gates generation:** Init should no longer generate a `gates:` section in manifest.yaml (the template change in Task 2 handles this for new projects).

- [ ] **Verify test passes**

Run: `node --test tests/skills/init-governance-scaffolding.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/init/SKILL.md tests/skills/init-governance-scaffolding.test.mjs
git commit -m "feat(unified-gates): update init scaffolding with legacy migration detection"
```

---

### Task 8: Add Legacy gates: Detection to validate and hygiene [specialist: none]

**Charter capability:** Backward Compatibility Path
**Depends on:** Task 3, Task 6
**Files:**
- Modify (additive): `skills/validate/SKILL.md` (add legacy detection to Check 1 — this file was already modified in Task 3; this task adds a new paragraph, do not overwrite Task 3's changes)
- Modify (additive): `skills/hygiene/SKILL.md` (add legacy detection to Pass 8 — this file was already modified in Task 6; this task adds a new validation step, do not overwrite Task 6's changes)

**Tests:** `tests/skills/legacy-gates-detection.test.mjs`

- [ ] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('legacy gates detection', () => {
  it('validate SKILL.md should detect legacy manifest gates', () => {
    const content = readFileSync(join(__dirname, '..', '..', 'skills', 'validate', 'SKILL.md'), 'utf8');
    assert.ok(content.includes('Legacy gates') && content.includes('manifest.yaml'),
      'Validate should emit migration warning for legacy manifest gates');
  });

  it('hygiene SKILL.md should detect legacy manifest gates', () => {
    const content = readFileSync(join(__dirname, '..', '..', 'skills', 'hygiene', 'SKILL.md'), 'utf8');
    assert.ok(content.includes('Legacy gates') && content.includes('manifest.yaml'),
      'Hygiene should emit migration warning for legacy manifest gates');
  });

  it('migration warning should reference governance/gates.yaml', () => {
    const validateContent = readFileSync(join(__dirname, '..', '..', 'skills', 'validate', 'SKILL.md'), 'utf8');
    const hygieneContent = readFileSync(join(__dirname, '..', '..', 'skills', 'hygiene', 'SKILL.md'), 'utf8');
    assert.ok(validateContent.includes('governance/gates.yaml'),
      'Validate migration warning should point to governance/gates.yaml');
    assert.ok(hygieneContent.includes('governance/gates.yaml'),
      'Hygiene migration warning should point to governance/gates.yaml');
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/legacy-gates-detection.test.mjs`
Expected: FAIL — current skills don't emit legacy migration warnings

- [ ] **Implement**

**In `skills/validate/SKILL.md` Check 1:**
Add after the gate source resolution section:
```
**Legacy gate detection:** If `manifest.yaml` contains a `gates:` section, emit a migration warning:
"Legacy gates: section found in manifest.yaml. This is no longer used. Move gate definitions to governance/gates.yaml."
This warning is informational and does not affect Check 1 execution.
```

**In `skills/hygiene/SKILL.md` Pass 8:**
Add as a new validation step:
```
N. **Legacy manifest gates.** Read `manifest.yaml`. If a `gates:` section exists, flag LEGACY_GATES:
"Legacy gates: section found in manifest.yaml. This is no longer used. Move gate definitions to governance/gates.yaml."
```

- [ ] **Verify test passes**

Run: `node --test tests/skills/legacy-gates-detection.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/validate/SKILL.md skills/hygiene/SKILL.md tests/skills/legacy-gates-detection.test.mjs
git commit -m "feat(unified-gates): add legacy manifest gates detection to validate and hygiene"
```

---

### Task 9: Verify Superseded Specs [specialist: none] [verification-only]

**Charter capability:** (housekeeping — spec Acceptance Criterion: all 5 tiered-test-gates specs marked superseded)
**Files:**
- Reference: `.context-index/specs/features/tiered-test-gates/*.md`
- Test: `tests/skills/superseded-specs.test.mjs`

**Tests:** `tests/skills/superseded-specs.test.mjs`

**Note:** This is a verification-only task, not a TDD task. The superseded status was already applied during the spec consolidation phase. The RED phase is vacuous because the state is already GREEN — the test codifies an existing invariant rather than driving new implementation.

- [ ] **Write test**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('tiered-test-gates specs are superseded', () => {
  const specsDir = join(__dirname, '..', '..', '.context-index', 'specs', 'features', 'tiered-test-gates');
  const specFiles = readdirSync(specsDir).filter(f => f.endsWith('.md') && f !== 'charter.md' && !f.endsWith('.review.md') && !f.endsWith('.plan.md'));

  for (const file of specFiles) {
    it(`${file} should have status: superseded`, () => {
      const content = readFileSync(join(specsDir, file), 'utf8');
      assert.ok(content.includes('status: superseded'), `${file} must be superseded`);
    });
  }

  it('should have exactly 5 superseded specs', () => {
    assert.equal(specFiles.length, 5, 'Expected 5 tiered-test-gates specs');
  });
});
```

- [ ] **Verify test passes** (this should already pass since all 5 are already superseded)

Run: `node --test tests/skills/superseded-specs.test.mjs`
Expected: PASS — already verified that all 5 specs have `status: superseded`

- [ ] **Commit**

```bash
git add tests/skills/superseded-specs.test.mjs
git commit -m "test(unified-gates): add verification for superseded tiered-test-gates specs"
```

---

### Task 10: Run Quality Gates and Final Verification [specialist: none]

**Charter capability:** (quality assurance — all AC)
**Depends on:** All previous tasks
**Files:**
- No new files

**Tests:** All test files from Tasks 1-9

- [ ] **Run full test suite**

Run: `npm test`
Expected: PASS — all tests green

- [ ] **Verify all acceptance criteria**

Review each AC from the spec against the implemented changes:
1. Unified schema in gates-template ✓ (Task 1)
2. Default tier/kind/severity rules documented in validate ✓ (Task 3)
3. Check 1 splits into 1a/1b/1c ✓ (Task 3)
4. Fail-fast semantics ✓ (Task 3)
5. Skip reporting ✓ (Task 3)
6. Implement reads from governance ✓ (Task 4)
7. Build dry-run reads from governance ✓ (Task 5)
8. Hygiene validates unified schema ✓ (Task 6)
9. Init scaffolds governance ✓ (Task 7)
10. Legacy detection ✓ (Task 8)
11. Superseded specs ✓ (Task 9)
12. Manifest template cleaned ✓ (Task 2)
13. Command output truncated to 8 KB per stream — verify present in validate SKILL.md (already exists at "truncated to the last 8 KB per stream") and implement SKILL.md (already exists at "truncated to last 8 KB per stream"). No new work needed — confirm text survived Task 3 and Task 4 rewrites.
14. Transition `required_gates` reference existing gate IDs — verify present in validate Check 9 and hygiene Pass 8 (both already validate this)

- [ ] **Commit** (if any final adjustments needed)

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [ ] Tests pass: `npm test`
- [ ] All 31 acceptance criteria from spec satisfied
- [ ] No constitutional violations introduced (Principles 1, 2, 3, 4, 5 upheld — no new deps, skills remain markdown, ESM maintained, hook protocol unchanged, version parity unaffected)
