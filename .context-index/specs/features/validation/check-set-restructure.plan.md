# Implementation Plan: Validate Check Set Restructure

> **Methodology:** adev
> **Charter:** .context-index/specs/features/validation/charter.md
> **Spec:** .context-index/specs/features/validation/check-set-restructure.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-15)
> **Platform:** Node.js ESM, JavaScript, node:test

**Goal:** Restructure `/adev:validate`'s check set by removing redundant/noisy checks, migrating them to their correct homes (hygiene, reconcile, review-specs), and tightening remaining checks — reducing dispatch cost and eliminating noise while preserving code-time signal.

**Architecture:** All registry edits target `.context-index/governance/validate.yaml` and `skills/validate/checks/<id>.md` files (post-`validate-config-single-source` state — `templates/validate/defaults.yaml` is gone). The domain starter `templates/domains/software/validate.yaml` is the bundle from which projects scaffold; it is also edited to reflect the post-restructure registry. Destination skills (`skills/hygiene/SKILL.md`, `skills/reconcile/SKILL.md`, `skills/review-specs/`) receive the migrated logic as additive prose edits before source entries are removed. The post-validate heuristic hook uses the existing hook registration pattern in `hooks/hooks.json`.

**PASS_WITH_NOTES notes from review to address:**
- SA-7: Behavior 11 disambiguates two distinct check-12 IDs — plan tasks explicitly note `check-12-lifecycle-reconciliation` vs `check-12-heuristic-extraction` in each task title/description.
- SA-8: Sibling `validate-config-single-source.spec.md` is now validated (precondition holds); registry edits target `governance/validate.yaml`.
- SA-9: `reportPlanTask` AC scope is plan-task events only; other Check 12 sub-slices route to their authoritative channels (reconcile, hooks).
- SEC-2/3/4: Hook failure audit trail noted in Task 4; no-prior-commit diff fallback noted in Task 8 AC; RESURRECTED_CHECK_ID message minimization addressed in Task 2.
- CON-3/4: `source-manifest.files` empty-list edge case and implementation files source explicitly addressed in Task 8.

---

## File Structure

**Create:**
- `hooks/post-validate-extract-heuristics.sh` — Post-validate hook that runs heuristic extraction (migrated from Check 12/13)
- `hooks/post-validate-extract-heuristics.mjs` — ESM helper for the post-validate hook logic
- `tests/governance/validate-check-set-restructure.test.mjs` — Registry trim regression tests
- `tests/skills/hygiene-platform-drift-pass.test.mjs` — Hygiene Audit Pass 20 (Platform Drift) tests
- `tests/skills/reconcile-lifecycle-sync.test.mjs` — Reconcile lifecycle-sync section tests
- `tests/skills/check-11-trigger-guard.test.mjs` — Check 11 trigger semantics tests
- `tests/skills/check-2-scope-expansion.test.mjs` — Check 2 scope-expansion sub-finding tests
- `tests/skills/check-4-evidence-contract.test.mjs` — Check 4 evidence citation tests
- `tests/skills/post-validate-hook.test.mjs` — Post-validate hook tests (input scoping, non-blocking)

**Modify:**
- `templates/domains/software/validate.yaml` — Remove check-3, 5, 6, 7, 10, 11-as-registry, 12-lifecycle-reconciliation, 12-heuristic-extraction entries; retain 1.5, 2, 4, optionally 8, 9
- `.context-index/governance/validate.yaml` (project-level override) — Remove check-10 and check-11 disabled entries (they no longer exist in starter)
- `skills/validate/checks/validate.check-2-spec-compliance.md` — Add scope-expansion sub-finding logic + `source-manifest.files` empty-list edge case
- `skills/validate/checks/validate.check-4-constitution.md` — Tighten authoring contract: require file:line evidence
- `skills/validate/checks/validate.check-11-visual-verification.md` — Revise trigger: SKIP when no UI files match AND Playwright absent
- `skills/validate/SKILL.md` — Remove per-check prose for dropped checks; update report template; add migration-orientation footer; update description frontmatter check count
- `skills/hygiene/SKILL.md` — Add Audit Pass 20: Platform Drift (formerly Check 10; note existing Pass 19 is Validate Config Drift)
- `skills/reconcile/SKILL.md` — Add lifecycle-sync section with `--fix` as default mode (migrated from Check 12-lifecycle-reconciliation)
- `skills/review-specs/structural-architect-prompt.md` — Add ADR-compliance scope item (formerly Check 5)
- `skills/review-specs/consistency-analyzer-prompt.md` — Add cross-cutting-spec-compliance scope item (formerly Check 6)
- `lib/governance/validate-config.mjs` — Add REMOVED_CHECK_IDS set and RESURRECTED handling (Behavior 11)
- `hooks/hooks.json` — Register post-validate hook on Stop event
- `.context-index/specs/features/validation/charter.md` — Re-sync Skills section to reflect post-restructure check count

**Reference (read, do not modify):**
- `.context-index/specs/features/validation/configurable-checks.spec.md` — Check registry behavior contract
- `.context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md` — Plan-task channel invariant (relevant to reconcile lifecycle-sync AC)
- `lib/governance/validate-config.mjs` — Existing registry loader patterns
- `tests/governance/validate-config.test.mjs` — Existing test patterns to follow

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/validation/check-set-restructure.spec.md` (Migration Path Step 1, Behavior 8)
- Charter: `.context-index/specs/features/validation/charter.md` (capability: Validation skill reduces dispatch cost)
- Source files: `skills/hygiene/SKILL.md` (full read — existing Audit Pass structure at lines 893-1025)
- Note: Existing Pass 19 is "Validate Config Drift" — new Platform Drift pass is Pass 20

### Task 2 Context
- Spec: `.context-index/specs/features/validation/check-set-restructure.spec.md` (Migration Step 1 — reconcile destination)
- Charter: `.context-index/specs/features/validation/charter.md`
- Source files: `skills/reconcile/SKILL.md` (full read — existing --batch/--dry-run flag patterns)
- Cross-reference: `.context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md` (reportPlanTask channel for --fix mode)

### Task 3 Context
- Spec: `.context-index/specs/features/validation/check-set-restructure.spec.md` (Migration Step 1 — review-specs destination, Behavior 10)
- Source files: `skills/review-specs/structural-architect-prompt.md` (full read), `skills/review-specs/consistency-analyzer-prompt.md` (full read)
- Charter: `.context-index/specs/features/validation/charter.md`

### Task 4 Context
- Spec: `.context-index/specs/features/validation/check-set-restructure.spec.md` (ADDED section — post-validate hook, SEC-1 fix)
- Source files: `hooks/session-capture.sh` (reference pattern for hook structure), `hooks/hooks.json` (registration format)
- SEC-2 note: Hook failure must log WARN to console without affecting validate verdict; audit trail must be non-blocking

### Task 5 Context
- Spec: `.context-index/specs/features/validation/check-set-restructure.spec.md` (Migration Steps 2 + 3 — drop check-12-lifecycle-reconciliation and check-10)
- Source files: `templates/domains/software/validate.yaml` (full read — current 12-entry registry)
- Registry target: `.context-index/governance/validate.yaml` (post-sibling state)
- Note: Two distinct check-12 IDs — `check-12-lifecycle-reconciliation` (this task) and `check-12-heuristic-extraction` (Task 10)

### Task 6 Context
- Spec: `.context-index/specs/features/validation/check-set-restructure.spec.md` (Migration Step 4 — Check 11 trigger)
- Source files: `skills/validate/checks/validate.check-11-visual-verification.md` (full read)
- Behavior 5 + 6: SKIP when no UI files AND no Playwright; BLOCK preserved when UI files match AND no Playwright

### Task 7 Context
- Spec: `.context-index/specs/features/validation/check-set-restructure.spec.md` (Migration Step 5 — Check 3 drop + Check 2 scope-expansion)
- Source files: `skills/validate/checks/validate.check-2-spec-compliance.md` (full read)
- SA-2 fix: scope pinned to `source-manifest.files` frontmatter; empty-list edge case (CON-3)
- SEC-3: no-prior-commit diff fallback when no plan exists

### Task 8 Context
- Spec: `.context-index/specs/features/validation/check-set-restructure.spec.md` (Migration Step 6 — drop Checks 5, 6, 7)
- Source files: `templates/domains/software/validate.yaml` (sections for check-5, 6, 7)
- After Task 3 lands review-specs coverage (dependency)

### Task 9 Context
- Spec: `.context-index/specs/features/validation/check-set-restructure.spec.md` (Migration Step 7 — tighten Check 4)
- Source files: `skills/validate/checks/validate.check-4-constitution.md` (full read)
- Behavior 4 + error code UNCITED_FINDING

### Task 10 Context
- Spec: `.context-index/specs/features/validation/check-set-restructure.spec.md` (Migration Step 8 — drop check-12-heuristic-extraction)
- Note: Disambiguated from Task 5's `check-12-lifecycle-reconciliation` — this is the `check-12-heuristic-extraction` (observational) entry
- Source files: `templates/domains/software/validate.yaml` (check-12-heuristic-extraction entry)

### Task 11 Context
- Spec: `.context-index/specs/features/validation/check-set-restructure.spec.md` (Migration Step 9 — report template)
- Source files: `skills/validate/SKILL.md` (lines 640-770 — report template and check summary section)
- Migration-orientation footer content from spec Migration Path

### Task 12 Context
- Spec: `.context-index/specs/features/validation/check-set-restructure.spec.md` (Behavior 11 — REMOVED_CHECK_ID / RESURRECTED_CHECK_ID)
- Source files: `lib/governance/validate-config.mjs` (full read — loadValidateConfig patterns)
- SEC-4: RESURRECTED_CHECK_ID message must minimize verbosity (show check ID, not full entry content)

### Task 13 Context
- Spec: `.context-index/specs/features/validation/check-set-restructure.spec.md` (Migration Step 10)
- Source files: `.context-index/specs/features/validation/charter.md` (Skills section)
- Post-restructure check inventory: 1.5, 2, 4, optionally 8, 9; Check 1 from gates.yaml

### Task 14 Context
- Spec: `.context-index/specs/features/validation/check-set-restructure.spec.md` (Migration Step 11 — measurement)
- Source files: `lib/session-file-reader.mjs`, `lib/token-cursor.mjs` (token measurement patterns)
- Per validation-module heuristic on token measurement: use JSONL-based parsing, not approximations

---

## Parallelization

- **Group A (sequential):** Task 1 → Task 5 (hygiene destination before check-10 drop requires Pass 20 to exist; check-12 drop depends on Task 2 reconcile destination)
- **Group B (sequential):** Task 2 → Task 5 (reconcile destination before check-12-lifecycle-reconciliation drop)
- **Group C (sequential):** Task 3 → Task 8 (review-specs destination before Checks 5, 6, 7 drop)
- **Group D (independent):** Task 4 (post-validate hook — independent of registry changes)
- **Group E (sequential):** Task 6 → Task 7 → Task 8 (Check 11 trigger guard; Check 3 drop + Check 2 scope-expansion; then Checks 5/6/7 drop which also depends on Task 3)
- **Group F (independent):** Task 9 (Check 4 tightening — standalone prompt edit)
- **Group G (independent):** Task 10 (check-12-heuristic-extraction drop after Task 4 hook exists)
- **Group H (sequential):** Task 11 → Task 13 (report template + charter after all check drops)
- **Group I (independent):** Task 12 (validate-config REMOVED/RESURRECTED handling — lib change, independent)
- **Group J (sequential):** All tasks → Task 14 (measurement runs after all restructuring is complete)

Tasks 4, 9, 12 can run in parallel with the A/B/C/E chain. Task 14 must run last.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Land Hygiene Audit Pass 20: Platform Drift | small | unit | — | 0 create, 1 modify |
| 2 | Land Reconcile Lifecycle-Sync Section | medium | unit | — | 0 create, 1 modify |
| 3 | Land Review-Specs ADR + Cross-Cutting Coverage | small | unit | — | 0 create, 2 modify |
| 4 | Land Post-Validate Heuristic-Extraction Hook | medium | unit | — | 3 create, 1 modify |
| 5 | Drop Check 12-lifecycle-reconciliation + Check 10 from Registry | small | unit | Task 1, Task 2 | 0 create, 3 modify |
| 6 | Guard Check 11 Trigger Semantics | small | unit | — | 0 create, 1 modify |
| 7 | Add Check 2 Scope-Expansion Sub-Finding + Drop Check 3 | medium | unit | — | 0 create, 2 modify |
| 8 | Drop Checks 5, 6, 7 from Registry | small | unit | Task 3, Task 7 | 0 create, 2 modify |
| 9 | Tighten Check 4 Authoring Contract | small | unit | — | 0 create, 1 modify |
| 10 | Drop Check 12-heuristic-extraction from Registry | small | unit | Task 4 | 0 create, 2 modify |
| 11 | Update Validate Report Template | small | unit | Task 5, Task 8, Task 10 | 0 create, 1 modify |
| 12 | Add REMOVED_CHECK_ID / RESURRECTED_CHECK_ID to Loader | medium | unit | — | 0 create, 2 modify |
| 13 | Sync Validation Charter Skills Section | small | unit | Task 11 | 0 create, 1 modify |
| 14 | Token-Cost Measurement | small | unit | All tasks | 0 create, 0 modify |

---

### Task 1: Land Hygiene Audit Pass 20: Platform Drift [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=4 pattern=4 blast=5 novelty=4
**Rationale:** Well-specified audit-pass addition with direct structural precedent in existing hygiene passes 1-19; single-file modification with minimal blast radius.

**Charter capability:** Validation skill reduces dispatch cost by relocating platform-drift check to its proper home in `/adev:hygiene`
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/hygiene/SKILL.md` — add Audit Pass 20: Platform Drift section
- Test: `tests/skills/hygiene-platform-drift-pass.test.mjs`

**Tests:** `tests/skills/hygiene-platform-drift-pass.test.mjs`

**Context to load:**
- `skills/hygiene/SKILL.md` lines 893-1025 (Audit Pass 19 for structure reference)
- `skills/validate/checks/validate.check-10-platform-drift.md` (logic to replicate)

- [ ] **Write failing test**

```javascript
// tests/skills/hygiene-platform-drift-pass.test.mjs
import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

describe('Hygiene Audit Pass 20: Platform Drift', () => {
  test('SKILL.md contains Audit Pass 20 section', () => {
    const skill = readFileSync('./skills/hygiene/SKILL.md', 'utf8');
    assert.ok(skill.includes('Audit Pass 20'), 'Missing Audit Pass 20');
    assert.ok(skill.includes('Platform Drift'), 'Missing Platform Drift title');
  });

  test('Pass 20 compares platform-context.yaml against package.json', () => {
    const skill = readFileSync('./skills/hygiene/SKILL.md', 'utf8');
    const idx = skill.indexOf('Audit Pass 20');
    const section = skill.slice(idx, idx + 2000);
    assert.ok(section.includes('platform-context.yaml'), 'Missing platform-context.yaml ref');
    assert.ok(section.includes('package.json'), 'Missing package.json ref');
  });

  test('Pass 20 SKIPs when platform-context.yaml does not exist', () => {
    const skill = readFileSync('./skills/hygiene/SKILL.md', 'utf8');
    const idx = skill.indexOf('Audit Pass 20');
    const section = skill.slice(idx, idx + 2000);
    assert.ok(section.includes('SKIP'), 'Must document SKIP case');
  });

  test('description frontmatter updated to nineteen or twenty audit passes', () => {
    const skill = readFileSync('./skills/hygiene/SKILL.md', 'utf8');
    // After adding Pass 20, description should mention 19 or 20 passes (was eighteen)
    assert.ok(!skill.startsWith('---\nname: adev:hygiene\ndescription: "Audit all context for staleness, drift, and coverage gaps. Runs eighteen audit passes'), 
      'Description still says eighteen — must be updated');
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/hygiene-platform-drift-pass.test.mjs`
Expected: FAIL — "Missing Audit Pass 20" and "description still says eighteen"

- [ ] **Implement**

Edit `skills/hygiene/SKILL.md`:
1. After the `## Audit Pass 19: Validate Config Drift` section, add:

```markdown
## Audit Pass 20: Platform Drift

**Goal:** Compare `.context-index/platform-context.yaml` tech stack declarations against `package.json` dependencies. Catches cases where the declared stack no longer matches what is installed. Migrated from `/adev:validate` Check 10 (removed in `check-set-restructure.spec.md`).

**If `platform-context.yaml` does not exist:** SKIP with INFO "No platform-context.yaml found — platform drift check not applicable."
**If `package.json` does not exist:** SKIP with INFO "No package.json found — not a Node.js project, platform drift check not applicable."

**Mapping rules:** (same as former Check 10)

For each field in `platform-context.yaml`, check the corresponding package in `package.json`:

| platform-context field | Expected package(s) |
|----------------------|---------------------|
| `framework` | Framework package present (`next`, `nuxt`, `astro`, `svelte`, etc.) |
| `version` | Framework package version satisfies declared version |
| `language` | If `typescript`, `typescript` in devDependencies |
| `orm` | ORM package present (`prisma`, `drizzle-orm`, `typeorm`, etc.) |
| `auth` | Auth package present (`@clerk/nextjs`, `next-auth`, etc.) |
| `database` | DB driver or client present if applicable |
| `testing` | Test framework present |

**Unknown fields or values:** Log as INFO (not a failure) — mapping is best-effort.
**Version check:** Only for `framework` + `version`. Uses semver-compatible prefix matching. Major version mismatch → WARN.

Record per field: PASS (matches), WARN (mismatch), INFO (could not verify), or SKIP (field not declared).

**Output format:**
```
## Platform Drift

- PASS: All declared platform-context fields confirmed in package.json

— or —

- WARN: N field mismatches detected

| Field | Declared | Installed | Status |
|-------|----------|-----------|--------|
| framework | nextjs | (not found) | WARN |
```
```

2. Update the `description` frontmatter from "eighteen audit passes" to "nineteen audit passes" (Pass 19 was Validate Config Drift, Pass 20 is Platform Drift, but the description at the top says "Runs eighteen" — update to reflect the current count post-addition of Pass 20; the body text at line 8 also says "Eighteen audit passes" — update to "Twenty audit passes").

- [ ] **Verify test passes**

Run: `node --test tests/skills/hygiene-platform-drift-pass.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch: `feat/validation/check-set-restructure`

```bash
git add skills/hygiene/SKILL.md tests/skills/hygiene-platform-drift-pass.test.mjs
git commit -m "feat(validation): add hygiene Audit Pass 20 Platform Drift (migrated from validate check-10)

Spec: .context-index/specs/features/validation/check-set-restructure.spec.md
Plan-task: 1"
```

---

### Task 2: Land Reconcile Lifecycle-Sync Section [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=4 pattern=4 blast=5 novelty=3
**Rationale:** Spec provides full AC including --fix default behavior and reportPlanTask channel contract; adding a detection section to an existing SKILL.md is well-precedented, though the cross-spec reportPlanTask constraint introduces a minor compositional dimension.

**Charter capability:** Validation skill reduces dispatch cost; lifecycle reconciliation moves to its proper home
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/reconcile/SKILL.md` — add lifecycle-sync section, add `--fix` as default flag
- Test: `tests/skills/reconcile-lifecycle-sync.test.mjs`

**Tests:** `tests/skills/reconcile-lifecycle-sync.test.mjs`

**Context to load:**
- `skills/reconcile/SKILL.md` (full read — existing detection check structure)
- `skills/validate/SKILL.md` lines 433-555 (Check 12 lifecycle reconciliation logic to migrate)
- `.context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md` (reportPlanTask channel — AC SA-6)

- [ ] **Write failing test**

```javascript
// tests/skills/reconcile-lifecycle-sync.test.mjs
import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

describe('Reconcile lifecycle-sync section', () => {
  test('SKILL.md includes --fix flag documentation', () => {
    const skill = readFileSync('./skills/reconcile/SKILL.md', 'utf8');
    assert.ok(skill.includes('--fix'), 'Missing --fix flag');
    assert.ok(skill.includes('--no-fix'), 'Missing --no-fix flag');
  });

  test('--fix is described as default mode', () => {
    const skill = readFileSync('./skills/reconcile/SKILL.md', 'utf8');
    assert.ok(
      skill.match(/--fix.*default|default.*--fix/i),
      '--fix should be described as default'
    );
  });

  test('lifecycle-sync section present', () => {
    const skill = readFileSync('./skills/reconcile/SKILL.md', 'utf8');
    assert.ok(
      skill.includes('lifecycle') && skill.includes('sync'),
      'Missing lifecycle-sync section'
    );
  });

  test('--fix mode uses reportPlanTask for plan-task state (not markdown checkboxes)', () => {
    const skill = readFileSync('./skills/reconcile/SKILL.md', 'utf8');
    assert.ok(skill.includes('reportPlanTask'), 'Must reference reportPlanTask for plan-task reconciliation');
    assert.ok(!skill.includes('- [x]'), 'Must not write markdown checkboxes directly');
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/reconcile-lifecycle-sync.test.mjs`
Expected: FAIL — "--fix not found" and "lifecycle-sync section missing"

- [ ] **Implement**

Edit `skills/reconcile/SKILL.md`:

1. Add `--fix` and `--no-fix` to the Arguments section:
```markdown
- `--fix`: apply all fixes automatically without confirmation prompts (default behavior)
- `--no-fix`: report-only mode — show findings without applying any fixes
```

2. Add a detection check `1g. Lifecycle Sync` section in the Detection Scan:
```markdown
#### 1g. Lifecycle Sync

Detect spec-status, charter-capability, and epic-status drift relative to the lifecycle event log. This is the equivalent of former `/adev:validate` Check 12, now running in its proper home at reconcile-time rather than per-spec validate-time.

**What to check:**
- Spec `status` frontmatter vs lifecycle log `currentStep` — flag mismatches (e.g., spec says `implemented` but log shows no `implement` completed event)
- Charter capability `Status` column vs lifecycle log per-spec state — flag capabilities listed as `planned` or `in-progress` when all contributing specs are validated
- Epic `status` on issue board vs child issue states — already covered by 1a (Stale Epics)

**Fix offered (--fix mode, default):** Update spec frontmatter `status` field to match lifecycle log. Update charter capability Status. Emit a `reportPlanTask` event via `lib/lifecycle-state.mjs` when reconciling plan-task state — do NOT write `- [x]` to plan markdown files.

**Fix offered (--no-fix mode):** Print WARN for each mismatch with the correct value.

**Structural equivalence:** Output from this check carries the same fields as a Check 12 WARN body from historic `.validate.md` reports (path, severity, message, evidence) so users can map between old and new output without information loss.
```

3. Update the Process section preamble to document `--fix` as default:
```markdown
**Default mode:** `--fix` (applies fixes automatically). Pass `--no-fix` for a report-only run.
```

- [ ] **Verify test passes**

Run: `node --test tests/skills/reconcile-lifecycle-sync.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/reconcile/SKILL.md tests/skills/reconcile-lifecycle-sync.test.mjs
git commit -m "feat(validation): add reconcile lifecycle-sync section with --fix as default mode

Spec: .context-index/specs/features/validation/check-set-restructure.spec.md
Plan-task: 2"
```

---

### Task 3: Land Review-Specs ADR + Cross-Cutting Coverage [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=4 pattern=4 blast=5 novelty=5
**Rationale:** Plan provides exact additive scope text to insert into two existing review-specs prompt files; pure text append with no design decisions required.

**Charter capability:** Validation skill reduces dispatch cost; ADR and cross-cutting checks move to review-specs
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/review-specs/structural-architect-prompt.md` — add ADR-compliance scope item
- Modify: `skills/review-specs/consistency-analyzer-prompt.md` — add cross-cutting-spec-compliance scope item
- Test: `tests/skills/review-specs-cross-repo.test.mjs` (extend existing) or new file

**Tests:** `tests/skills/review-specs-adr-cross-cutting.test.mjs`

**Context to load:**
- `skills/review-specs/structural-architect-prompt.md` (full read)
- `skills/review-specs/consistency-analyzer-prompt.md` (full read)
- `skills/validate/checks/validate.check-5-adrs.md` (ADR compliance logic to mirror)
- `skills/validate/checks/validate.check-6-cross-cutting.md` (cross-cutting logic to mirror)

- [ ] **Write failing test**

```javascript
// tests/skills/review-specs-adr-cross-cutting.test.mjs
import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

describe('Review-specs ADR and cross-cutting coverage', () => {
  test('structural-architect prompt includes ADR compliance scope', () => {
    const prompt = readFileSync('./skills/review-specs/structural-architect-prompt.md', 'utf8');
    assert.ok(prompt.includes('ADR') || prompt.includes('Architecture Decision'), 
      'Structural architect must cover ADR compliance');
  });

  test('consistency-analyzer prompt includes cross-cutting spec compliance scope', () => {
    const prompt = readFileSync('./skills/review-specs/consistency-analyzer-prompt.md', 'utf8');
    assert.ok(prompt.includes('cross-cutting') || prompt.includes('cross-cutting-spec'),
      'Consistency analyzer must cover cross-cutting spec compliance');
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/review-specs-adr-cross-cutting.test.mjs`
Expected: FAIL — "Structural architect must cover ADR compliance" (currently no ADR scope item)

- [ ] **Implement**

1. Edit `skills/review-specs/structural-architect-prompt.md`, add to "Your Review Scope":
```markdown
6. **ADR Compliance:** Does this spec respect existing Architecture Decision Records? If the spec introduces a pattern that conflicts with an ADR decision, flag it as a blocker. If the spec implicitly supersedes an ADR, flag it as a warning — the ADR should be updated. Reference ADR files from `.context-index/adrs/`.
```

2. Edit `skills/review-specs/consistency-analyzer-prompt.md`, add to "Your Review Scope":
```markdown
7. **Cross-Cutting Spec Compliance:** Does this spec respect contracts defined in cross-cutting specs (`.context-index/specs/cross-cutting/`)? Flag mismatches in naming, protocol, or behavioral contract between this spec and any cross-cutting spec it touches or depends on.
```

- [ ] **Verify test passes**

Run: `node --test tests/skills/review-specs-adr-cross-cutting.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/review-specs/structural-architect-prompt.md skills/review-specs/consistency-analyzer-prompt.md tests/skills/review-specs-adr-cross-cutting.test.mjs
git commit -m "feat(validation): add ADR and cross-cutting coverage to review-specs reviewers

Spec: .context-index/specs/features/validation/check-set-restructure.spec.md
Plan-task: 3"
```

---

### Task 4: Land Post-Validate Heuristic-Extraction Hook [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=4 pattern=4 blast=4 novelty=4
**Rationale:** Golden samples for bash hook and ESM helper patterns exist; plan provides near-complete implementation code; input scoping and non-blocking constraints are fully specified.

**Charter capability:** Validation skill reduces dispatch cost; heuristic extraction moves to post-validate hook
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `hooks/post-validate-extract-heuristics.sh` — Hook entry point (bash, reads stdin JSON + env vars)
- Create: `hooks/post-validate-extract-heuristics.mjs` — ESM helper for extraction logic
- Create: `tests/skills/post-validate-hook.test.mjs` — Hook tests
- Modify: `hooks/hooks.json` — Register on Stop event

**Tests:** `tests/skills/post-validate-hook.test.mjs`

**Context to load:**
- `hooks/session-capture.sh` (reference pattern for hook structure)
- `hooks/hooks.json` (registration format for new hook)
- `skills/validate/checks/validate.check-12-heuristic-extraction.md` (logic to migrate)
- Spec SEC-1 fix: hook receives only verdict metadata (IDs, outcomes, timing, counts) — NOT subprocess stdout/stderr

- [ ] **Write failing test**

```javascript
// tests/skills/post-validate-hook.test.mjs
import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';

describe('Post-validate heuristic-extraction hook', () => {
  test('hook script file exists', () => {
    assert.ok(existsSync('./hooks/post-validate-extract-heuristics.sh'), 
      'Missing post-validate-extract-heuristics.sh');
  });

  test('hook helper mjs file exists', () => {
    assert.ok(existsSync('./hooks/post-validate-extract-heuristics.mjs'),
      'Missing post-validate-extract-heuristics.mjs');
  });

  test('hooks.json registers the post-validate hook', () => {
    const hooks = JSON.parse(readFileSync('./hooks/hooks.json', 'utf8'));
    const allHooks = JSON.stringify(hooks);
    assert.ok(allHooks.includes('post-validate-extract-heuristics'),
      'hooks.json must register post-validate hook');
  });

  test('hook script exits 0 on failure (non-blocking)', () => {
    const script = readFileSync('./hooks/post-validate-extract-heuristics.sh', 'utf8');
    // Hook must not use exit 2 (which would block) 
    assert.ok(!script.includes('exit 2'), 'Hook must not use exit 2 (blocking exit)');
    // Should exit 0 always
    assert.ok(script.includes('exit 0'), 'Hook must exit 0 to be non-blocking');
  });

  test('hook input scoping: mjs helper does not read subprocess stdout/stderr', () => {
    const helper = readFileSync('./hooks/post-validate-extract-heuristics.mjs', 'utf8');
    // Helper must not re-emit or process raw command output (SEC-1)
    // It only processes structured verdict metadata
    assert.ok(helper.includes('task_id') || helper.includes('verdict') || helper.includes('outcome'),
      'Helper must reference structured verdict metadata fields');
    assert.ok(!helper.includes('stdout') && !helper.includes('stderr'),
      'Helper must not read subprocess stdout/stderr (SEC-1 input scoping)');
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/post-validate-hook.test.mjs`
Expected: FAIL — "Missing post-validate-extract-heuristics.sh"

- [ ] **Implement**

1. Create `hooks/post-validate-extract-heuristics.sh`:
```bash
#!/usr/bin/env bash
# adev Stop hook: Post-Validate Heuristic Extraction
# Runs after /adev:validate completes (Stop event).
# Extracts success heuristics from verdict metadata — non-blocking.
# Input scoping (SEC-1): receives only structured verdict metadata
# (check IDs, outcomes, timing, counts) — NOT subprocess stdout/stderr.
# Exits 0 always. Outputs '{}' to stdout (hook protocol).

set -uo pipefail

STDIN_JSON=$(cat)

node --input-type=module "${CLAUDE_PLUGIN_ROOT}/hooks/post-validate-extract-heuristics.mjs" \
  <<< "$STDIN_JSON" 2>/dev/null || true

echo '{}'
exit 0
```

2. Create `hooks/post-validate-extract-heuristics.mjs`:
```javascript
/**
 * Post-validate heuristic extraction helper.
 * Input: structured validate verdict metadata from stdin JSON.
 * Input scoping (SEC-1): only processes per-check IDs, outcomes, timing, counts.
 * Does NOT read or re-emit quality-gate subprocess stdout/stderr.
 * Failure audit: any error writes to console.warn (not stdout) and exits 0.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let input = '';
process.stdin.on('data', c => { input += c; });
process.stdin.on('end', async () => {
  try {
    const data = JSON.parse(input || '{}');
    // Only process validate tool_use events with verdict metadata
    const toolName = data?.tool_name ?? '';
    if (toolName !== 'validate' && !toolName.includes('validate')) {
      process.exit(0);
    }
    
    // Structured verdict metadata only — check IDs, outcomes, timing, counts
    const verdictMeta = data?.tool_result?.verdict_metadata ?? null;
    if (!verdictMeta) {
      process.exit(0);
    }
    
    // Skip if not a first-run PASS (non-blocking signal)
    if (verdictMeta.overall !== 'PASS') {
      process.exit(0);
    }
    
    // Resolve plugin root and import heuristics lib
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
    if (!pluginRoot) {
      process.exit(0);
    }
    
    const { writeHeuristic } = await import(resolve(pluginRoot, 'lib/heuristics.mjs'));
    // Extraction logic follows Check 12/13 derivation rules (title, id, scope)
    // Uses only verdictMeta fields (check IDs, outcomes, counts) — no raw output
    const specPath = verdictMeta.spec_path ?? null;
    if (!specPath) process.exit(0);
    
    // Derive project root
    const projectRoot = process.env.CLAUDE_PROJECT_ROOT ?? process.cwd();
    
    const { writeHeuristicFromVerdictMeta } = await import(resolve(pluginRoot, 'lib/heuristics.mjs'))
      .catch(() => ({ writeHeuristicFromVerdictMeta: null }));
    
    // Best-effort; any failure is non-blocking
    if (writeHeuristicFromVerdictMeta) {
      await writeHeuristicFromVerdictMeta(projectRoot, verdictMeta).catch(e => {
        console.warn(`[post-validate-hook] Heuristic extraction failed (non-blocking): ${e.message}`);
      });
    }
  } catch (e) {
    // SEC-2: failure audit trail — log to console.warn, not stdout (hook output channel)
    console.warn(`[post-validate-hook] Error (non-blocking): ${e.message}`);
  }
  process.exit(0);
});
```

3. Edit `hooks/hooks.json` to add the Stop hook:
```json
"Stop": [
  {
    "matcher": ".*",
    "hooks": [
      {
        "type": "command",
        "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/post-validate-extract-heuristics.sh\""
      }
    ]
  }
]
```

- [ ] **Verify test passes**

Run: `node --test tests/skills/post-validate-hook.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add hooks/post-validate-extract-heuristics.sh hooks/post-validate-extract-heuristics.mjs hooks/hooks.json tests/skills/post-validate-hook.test.mjs
git commit -m "feat(validation): add post-validate heuristic-extraction hook (migrated from check-12-heuristic-extraction)

Spec: .context-index/specs/features/validation/check-set-restructure.spec.md
Plan-task: 4"
```

---

### Task 5: Drop Check 12-lifecycle-reconciliation + Check 10 from Registry [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=5 blast=4 novelty=5
**Rationale:** Pure deletion task with explicit test assertions on what IDs must be absent; zero design decisions, maximum spec clarity.

**Depends on:** Task 1, Task 2

**Charter capability:** Validation registry trimmed to code-time signal only
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `templates/domains/software/validate.yaml` — Remove check-10 and check-12-lifecycle-reconciliation entries
- Modify: `.context-index/governance/validate.yaml` — Remove check-10 and check-11 disabled entries (those checks no longer exist in starter)
- Modify: `skills/validate/SKILL.md` — Remove Check 10 and Check 12 (lifecycle-reconciliation) prose sections
- Test: `tests/governance/validate-check-set-restructure.test.mjs`

**Tests:** `tests/governance/validate-check-set-restructure.test.mjs`

**Context to load:**
- `templates/domains/software/validate.yaml` (full read — current 12-entry registry)
- `tests/governance/validate-config.test.mjs` (follow existing test patterns)

**Note on disambiguating check-12 IDs:** This task removes `validate.check-12-lifecycle-reconciliation` (the subagent-review entry). The `validate.check-12-heuristic-extraction` (observational) entry is removed in Task 10 after Task 4's hook lands.

- [ ] **Write failing test**

```javascript
// tests/governance/validate-check-set-restructure.test.mjs
import { test, describe, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadValidateConfig } from '../../lib/governance/validate-config.mjs';
import { createTempDir, cleanupTempDir, writeFixture, PLUGIN_ROOT } from '../helpers.mjs';

const tempDirs = [];
function tmp() { const d = createTempDir(); tempDirs.push(d); return d; }
afterEach(() => { while (tempDirs.length) cleanupTempDir(tempDirs.pop()); });

describe('Validate check set restructure — registry trim', () => {
  test('software starter no longer contains check-12-lifecycle-reconciliation', () => {
    const starter = readFileSync(
      join(PLUGIN_ROOT, 'templates/domains/software/validate.yaml'), 'utf8'
    );
    assert.ok(!starter.includes('check-12-lifecycle-reconciliation'),
      'Starter must not contain removed check-12-lifecycle-reconciliation');
  });

  test('software starter no longer contains check-10-platform-drift', () => {
    const starter = readFileSync(
      join(PLUGIN_ROOT, 'templates/domains/software/validate.yaml'), 'utf8'
    );
    assert.ok(!starter.includes('check-10-platform-drift'),
      'Starter must not contain removed check-10-platform-drift');
  });

  test('loadValidateConfig with post-restructure starter returns only surviving checks', () => {
    const repo = tmp();
    const starterPath = join(PLUGIN_ROOT, 'templates/domains/software/validate.yaml');
    writeFixture(repo, '.context-index/governance/validate.yaml', readFileSync(starterPath, 'utf8'));
    const r = loadValidateConfig(repo);
    assert.equal(r.errors.length, 0);
    const ids = r.checks.map(c => c.id);
    assert.ok(!ids.includes('validate.check-10-platform-drift'), 'check-10 must be gone');
    assert.ok(!ids.includes('validate.check-12-lifecycle-reconciliation'), 'check-12-lifecycle must be gone');
    assert.ok(ids.includes('validate.check-1.5-source-manifest'), 'check-1.5 must survive');
    assert.ok(ids.includes('validate.check-2-spec-compliance'), 'check-2 must survive');
    assert.ok(ids.includes('validate.check-4-constitution'), 'check-4 must survive');
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/validate-check-set-restructure.test.mjs`
Expected: FAIL — "Starter must not contain removed check-12-lifecycle-reconciliation"

- [ ] **Implement**

1. Edit `templates/domains/software/validate.yaml`: Remove the `check-10-platform-drift` and `check-12-lifecycle-reconciliation` entries entirely.

2. Edit `.context-index/governance/validate.yaml` (project override): Remove the `check-10-platform-drift` and `check-11-visual-verification` disabled entries (those IDs no longer exist in the starter — disabling a nonexistent entry will trigger `RESURRECTED_CHECK_ID` once Task 12 lands; remove them proactively).

3. Edit `skills/validate/SKILL.md`: Remove the `### Check 10: Platform Drift` section (lines ~365-391) and the `### Check 12: Lifecycle Reconciliation` section (lines ~433-555). Update the check count in the description frontmatter.

- [ ] **Verify test passes**

Run: `node --test tests/governance/validate-check-set-restructure.test.mjs`
Expected: PASS

Also run existing validate-config tests to verify no regression:
`node --test tests/governance/validate-config.test.mjs`

- [ ] **Commit**

```bash
git add templates/domains/software/validate.yaml .context-index/governance/validate.yaml skills/validate/SKILL.md tests/governance/validate-check-set-restructure.test.mjs
git commit -m "refactor(validation): drop check-12-lifecycle-reconciliation and check-10-platform-drift from registry

Spec: .context-index/specs/features/validation/check-set-restructure.spec.md
Plan-task: 5"
```

---

### Task 6: Guard Check 11 Trigger Semantics [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=5 blast=4 novelty=5
**Rationale:** Exact 4-case trigger guard text is provided in the plan; behaviors 5 and 6 are unambiguous; direct copy-in to an existing check prompt file with a well-established pattern.

**Charter capability:** Validation runs on non-UI specs without Playwright blocking
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/validate/checks/validate.check-11-visual-verification.md` — Revise trigger: SKIP when no UI files match AND Playwright absent; BLOCK preserved when UI files match AND Playwright absent
- Test: `tests/skills/check-11-trigger-guard.test.mjs`

**Tests:** `tests/skills/check-11-trigger-guard.test.mjs`

**Context to load:**
- `skills/validate/checks/validate.check-11-visual-verification.md` (full read)
- Spec Behaviors 5 and 6

- [ ] **Write failing test**

```javascript
// tests/skills/check-11-trigger-guard.test.mjs
import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

describe('Check 11 trigger guard semantics', () => {
  test('check-11 prompt documents SKIP when no UI files AND Playwright absent', () => {
    const prompt = readFileSync('./skills/validate/checks/validate.check-11-visual-verification.md', 'utf8');
    assert.ok(
      prompt.includes('SKIP') && (prompt.includes('no UI files') || prompt.includes('no ui')),
      'Must document SKIP case for no UI files without Playwright'
    );
  });

  test('check-11 prompt preserves BLOCK when UI files match AND Playwright absent', () => {
    const prompt = readFileSync('./skills/validate/checks/validate.check-11-visual-verification.md', 'utf8');
    assert.ok(
      prompt.includes('BLOCK') || prompt.includes('block'),
      'Must preserve BLOCK case for UI files without Playwright'
    );
  });

  test('SKILL.md Check 11 section also reflects new trigger semantics', () => {
    const skill = readFileSync('./skills/validate/SKILL.md', 'utf8');
    const idx = skill.indexOf('Check 11');
    assert.ok(idx !== -1, 'SKILL.md must have Check 11 section');
    const section = skill.slice(idx, idx + 2000);
    // SKIP (not BLOCK) when no UI files + no Playwright
    assert.ok(
      section.includes('SKIP') || section.includes('no UI'),
      'SKILL.md Check 11 section must reflect SKIP semantics'
    );
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/check-11-trigger-guard.test.mjs`
Expected: FAIL — check-11 prompt currently says BLOCK not SKIP for no-UI-files case

- [ ] **Implement**

Edit `skills/validate/checks/validate.check-11-visual-verification.md`:

Add a trigger guard at the top of the prompt, before the visual verification instructions:

```markdown
## Trigger Guard

**Before running visual verification, check whether this spec's implementation diff contains UI file patterns:**

UI file patterns: `*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss`, `*.html`, files under `components/`, `pages/`, `views/`, or `public/`.

**Case A — No UI files in implementation diff AND Playwright MCP unavailable:**
Return SKIP with note: "No UI files in implementation diff — visual verification not applicable."
Do NOT return BLOCK.

**Case B — UI files present in implementation diff AND Playwright MCP unavailable:**
Return BLOCK with the existing actionable error message (preserved from current behavior):
"Visual verification required but Playwright MCP is unavailable. Install the Playwright MCP or re-run validate after configuring Playwright."

**Case C — UI files present AND Playwright MCP available:**
Proceed with visual verification as documented below.

**Case D — No UI files AND Playwright MCP available:**
Return SKIP (Playwright available but nothing to verify for this spec).
```

Also update `skills/validate/SKILL.md` to note the revised trigger in the Check 11 inline description (around line 140 where it references Check 11).

- [ ] **Verify test passes**

Run: `node --test tests/skills/check-11-trigger-guard.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/validate/checks/validate.check-11-visual-verification.md skills/validate/SKILL.md tests/skills/check-11-trigger-guard.test.mjs
git commit -m "feat(validation): guard check-11 trigger — SKIP (not BLOCK) when no UI files and Playwright absent

Spec: .context-index/specs/features/validation/check-set-restructure.spec.md
Plan-task: 6"
```

---

### Task 7: Add Check 2 Scope-Expansion Sub-Finding + Drop Check 3 [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=4 pattern=4 blast=4 novelty=4
**Rationale:** Scope-expansion logic is well-specified with SA-2 contract and CON-3 edge case; plan provides exact markdown text and the git-diff fallback path is documented; 2-path algorithm is a minor variation on existing check prompt patterns.

**Charter capability:** Check 2 carries explicit scope-expansion detection; charter-consistency covered transitively
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/validate/checks/validate.check-2-spec-compliance.md` — Add scope-expansion sub-finding
- Modify: `templates/domains/software/validate.yaml` — Remove check-3 entry
- Test: `tests/skills/check-2-scope-expansion.test.mjs`

**Tests:** `tests/skills/check-2-scope-expansion.test.mjs`

**Context to load:**
- `skills/validate/checks/validate.check-2-spec-compliance.md` (full read)
- Spec Behavior 3 + SA-2 fix (scope pinned to `source-manifest.files`)
- CON-3: empty `source-manifest.files` list edge case
- SEC-3: no-prior-commit diff fallback (when no plan exists, use diff against last validated commit)

- [ ] **Write failing test**

```javascript
// tests/skills/check-2-scope-expansion.test.mjs
import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT } from '../helpers.mjs';

describe('Check 2 scope-expansion sub-finding', () => {
  test('check-2 prompt includes scope-expansion detection language', () => {
    const prompt = readFileSync('./skills/validate/checks/validate.check-2-spec-compliance.md', 'utf8');
    assert.ok(
      prompt.includes('scope expansion') || prompt.includes('scope-expansion'),
      'Check 2 must document scope-expansion sub-finding'
    );
  });

  test('scope is pinned to source-manifest.files (not a new frontmatter field)', () => {
    const prompt = readFileSync('./skills/validate/checks/validate.check-2-spec-compliance.md', 'utf8');
    assert.ok(prompt.includes('source-manifest.files'), 'Must pin scope to source-manifest.files');
    // Must not introduce a new frontmatter field
    assert.ok(!prompt.includes('scope-files:') && !prompt.includes('declared-files:'),
      'Must not introduce new frontmatter field for scope');
  });

  test('empty source-manifest.files list produces INFO note not scope-expansion finding', () => {
    const prompt = readFileSync('./skills/validate/checks/validate.check-2-spec-compliance.md', 'utf8');
    // Empty list or absent field should produce INFO note
    assert.ok(
      prompt.includes('scope verification unavailable') || prompt.includes('no source-manifest'),
      'Must handle missing/empty source-manifest.files with INFO note'
    );
  });

  test('software starter no longer contains check-3-charter-consistency', () => {
    const starter = readFileSync(
      join(PLUGIN_ROOT, 'templates/domains/software/validate.yaml'), 'utf8'
    );
    assert.ok(!starter.includes('check-3-charter-consistency'),
      'Starter must not contain removed check-3');
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/check-2-scope-expansion.test.mjs`
Expected: FAIL — "Check 2 must document scope-expansion sub-finding"

- [ ] **Implement**

1. Edit `skills/validate/checks/validate.check-2-spec-compliance.md`, add after existing compliance checks:

```markdown
## Scope Expansion Sub-Finding

After verifying spec behavioral compliance, check whether the implementation has added files outside the spec's declared scope.

**Declared scope:** Read the `source-manifest.files` array from the spec's YAML frontmatter. This is the authoritative declared scope. No new frontmatter field is introduced.

**When `source-manifest.files` is present and non-empty:**
1. Identify implementation files from the plan's task file lists, or — when no plan is available — from the diff against the spec's last validated commit (use `git diff <last-validated-hash>..HEAD -- <project-source-paths>` as fallback; SEC-3).
2. For each implementation file path, check whether it falls under a directory implied by any entry in `source-manifest.files`.
3. If ANY implementation file is outside the declared scope: emit **scope expansion detected** sub-finding:
   - List the offending file(s)
   - Cite the `source-manifest.files` entries that define the scope boundary
   - Recommended action: "Update spec source-manifest to include this path, or revert the out-of-scope change."
4. Severity: warning (does not fail Check 2 by itself; raises aggregate verdict to PASS_WITH_NOTES).

**When `source-manifest.files` is absent or empty (CON-3 edge case):**
Emit an INFO note: "scope verification unavailable — spec has no source-manifest.files" and do not emit a scope-expansion finding. Verdict unaffected.
```

2. Edit `templates/domains/software/validate.yaml`: Remove the `validate.check-3-charter-consistency` entry.

- [ ] **Verify test passes**

Run: `node --test tests/skills/check-2-scope-expansion.test.mjs`
Expected: PASS

Run regression: `node --test tests/governance/validate-check-set-restructure.test.mjs`
Expected: PASS (also verify check-3 is gone)

- [ ] **Commit**

```bash
git add skills/validate/checks/validate.check-2-spec-compliance.md templates/domains/software/validate.yaml tests/skills/check-2-scope-expansion.test.mjs
git commit -m "feat(validation): add check-2 scope-expansion sub-finding; drop check-3-charter-consistency

Spec: .context-index/specs/features/validation/check-set-restructure.spec.md
Plan-task: 7"
```

---

### Task 8: Drop Checks 5, 6, 7 from Registry [specialist: none]

**Routing:** auto-agent (score: 20/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=5
**Rationale:** Pure deletion of three YAML entries and their corresponding SKILL.md prose sections; maximum spec clarity and zero novelty.

**Depends on:** Task 3, Task 7

**Charter capability:** Validation registry trimmed to code-time signal only
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `templates/domains/software/validate.yaml` — Remove check-5, check-6, check-7 entries
- Modify: `skills/validate/SKILL.md` — Remove Check 5, 6, 7 prose sections
- Test: `tests/governance/validate-check-set-restructure.test.mjs` (extend)

**Tests:** `tests/governance/validate-check-set-restructure.test.mjs`

**Context to load:**
- `templates/domains/software/validate.yaml` (current state after Task 5 and 7 edits)

- [ ] **Write failing test**

Extend `tests/governance/validate-check-set-restructure.test.mjs` with:
```javascript
test('software starter no longer contains check-5, check-6, check-7', () => {
  const starter = readFileSync(
    join(PLUGIN_ROOT, 'templates/domains/software/validate.yaml'), 'utf8'
  );
  assert.ok(!starter.includes('check-5-adrs'), 'Starter must not contain check-5');
  assert.ok(!starter.includes('check-6-cross-cutting'), 'Starter must not contain check-6');
  assert.ok(!starter.includes('check-7-specialist-review'), 'Starter must not contain check-7');
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/validate-check-set-restructure.test.mjs`
Expected: FAIL — new assertions about check-5/6/7

- [ ] **Implement**

1. Edit `templates/domains/software/validate.yaml`: Remove the `validate.check-5-adrs`, `validate.check-6-cross-cutting`, and `validate.check-7-specialist-review` entries.

2. Edit `skills/validate/SKILL.md`: Remove the prose sections for Check 5 (ADR Compliance), Check 6 (Cross-Cutting Spec Compliance), and Check 7 (Specialist Review). Update the description frontmatter and check count.

- [ ] **Verify test passes**

Run: `node --test tests/governance/validate-check-set-restructure.test.mjs`
Expected: PASS

Run: `npm test` to verify no regressions.

- [ ] **Commit**

```bash
git add templates/domains/software/validate.yaml skills/validate/SKILL.md tests/governance/validate-check-set-restructure.test.mjs
git commit -m "refactor(validation): drop checks 5, 6, 7 from registry (now covered by review-specs)

Spec: .context-index/specs/features/validation/check-set-restructure.spec.md
Plan-task: 8"
```

---

### Task 9: Tighten Check 4 Authoring Contract [specialist: none]

**Routing:** auto-agent (score: 20/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=5
**Rationale:** Plan provides the exact Evidence Contract text block to prepend; single-file change to a check prompt with no design decisions required.

**Charter capability:** Check 4 evidence citation tightened to prevent rubber-stamp PASSes
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/validate/checks/validate.check-4-constitution.md` — Require file:line evidence for all findings
- Test: `tests/skills/check-4-evidence-contract.test.mjs`

**Tests:** `tests/skills/check-4-evidence-contract.test.mjs`

**Context to load:**
- `skills/validate/checks/validate.check-4-constitution.md` (full read)
- Spec Behavior 4 + error code UNCITED_FINDING

- [ ] **Write failing test**

```javascript
// tests/skills/check-4-evidence-contract.test.mjs
import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

describe('Check 4 authoring contract — evidence citations', () => {
  test('check-4 prompt requires file:line evidence for all findings', () => {
    const prompt = readFileSync('./skills/validate/checks/validate.check-4-constitution.md', 'utf8');
    assert.ok(
      prompt.includes('file:line') || prompt.includes('file:'),
      'Check 4 must require file:line evidence'
    );
  });

  test('check-4 documents UNCITED_FINDING rejection', () => {
    const prompt = readFileSync('./skills/validate/checks/validate.check-4-constitution.md', 'utf8');
    assert.ok(
      prompt.includes('UNCITED_FINDING') || prompt.includes('evidence'),
      'Check 4 must document evidence requirement and UNCITED_FINDING rejection'
    );
  });

  test('check-4 rejects findings without evidence as FAIL', () => {
    const prompt = readFileSync('./skills/validate/checks/validate.check-4-constitution.md', 'utf8');
    assert.ok(
      prompt.includes('FAIL') && (prompt.includes('without evidence') || prompt.includes('no evidence')),
      'Check 4 must report FAIL for findings without evidence'
    );
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/check-4-evidence-contract.test.mjs`
Expected: FAIL — current check-4 prompt doesn't enforce evidence citations

- [ ] **Implement**

Edit `skills/validate/checks/validate.check-4-constitution.md`, add at the top under the check description:

```markdown
## Evidence Contract

Every finding (PASS or FAIL) from this check **must** cite at least one of the following as evidence:
- `file:line` reference (e.g., `lib/governance/validate-config.mjs:47`)
- A `grep` result showing the relevant pattern in the codebase
- A specific code block reference with file path

**Findings without evidence are rejected by this authoring contract and reported as FAIL** with error code `UNCITED_FINDING`.

Before finalizing your assessment, verify: Does each finding cite at least one file:line reference or grep result? If not, add the evidence or report the finding as UNCITED_FINDING.

A PASS verdict at 100% rate is statistically suspicious for a codebase of any size. If your PASS findings have no evidence, treat them as UNCITED_FINDING — rubber-stamp PASSes are a check failure.
```

- [ ] **Verify test passes**

Run: `node --test tests/skills/check-4-evidence-contract.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/validate/checks/validate.check-4-constitution.md tests/skills/check-4-evidence-contract.test.mjs
git commit -m "feat(validation): tighten check-4 authoring contract — require file:line evidence, reject UNCITED_FINDING

Spec: .context-index/specs/features/validation/check-set-restructure.spec.md
Plan-task: 9"
```

---

### Task 10: Drop Check 12-heuristic-extraction from Registry [specialist: none]

**Routing:** auto-agent (score: 20/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=5
**Rationale:** Same pure-deletion pattern as Tasks 5 and 8; single YAML entry and corresponding SKILL.md section removed with explicit test assertions.

**Depends on:** Task 4

**Charter capability:** Heuristic extraction delivered via post-validate hook; registry entry removed
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `templates/domains/software/validate.yaml` — Remove check-12-heuristic-extraction entry
- Modify: `skills/validate/SKILL.md` — Remove Check 13 heuristic extraction prose section

**Tests:** `tests/governance/validate-check-set-restructure.test.mjs` (extend)

**Note on disambiguating check-12 IDs:** This task removes `validate.check-12-heuristic-extraction` (the observational entry, labeled "Check 13" in SKILL.md prose). The `validate.check-12-lifecycle-reconciliation` was removed in Task 5.

- [ ] **Write failing test**

Extend `tests/governance/validate-check-set-restructure.test.mjs`:
```javascript
test('software starter no longer contains check-12-heuristic-extraction', () => {
  const starter = readFileSync(
    join(PLUGIN_ROOT, 'templates/domains/software/validate.yaml'), 'utf8'
  );
  assert.ok(!starter.includes('check-12-heuristic-extraction'),
    'Starter must not contain removed check-12-heuristic-extraction');
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/validate-check-set-restructure.test.mjs`
Expected: FAIL — new assertion

- [ ] **Implement**

1. Edit `templates/domains/software/validate.yaml`: Remove the `validate.check-12-heuristic-extraction` entry.

2. Edit `skills/validate/SKILL.md`: Remove the `### Check 13: Success Heuristic Extraction` section (lines ~511-640). Update check count in description and report template.

- [ ] **Verify test passes**

Run: `node --test tests/governance/validate-check-set-restructure.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add templates/domains/software/validate.yaml skills/validate/SKILL.md tests/governance/validate-check-set-restructure.test.mjs
git commit -m "refactor(validation): drop check-12-heuristic-extraction from registry (now runs via post-validate hook)

Spec: .context-index/specs/features/validation/check-set-restructure.spec.md
Plan-task: 10"
```

---

### Task 11: Update Validate Report Template [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=4 pattern=4 blast=5 novelty=5
**Rationale:** Migration-orientation footer content is verbatim in the plan; only inference needed is the exact placement within the SKILL.md report template structure.

**Depends on:** Task 5, Task 8, Task 10

**Charter capability:** Validate report accurately reflects post-restructure check inventory
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/validate/SKILL.md` — Update report header/summary template; add migration-orientation footer

**Tests:** `tests/governance/validate-check-set-restructure.test.mjs` (extend)

- [ ] **Write failing test**

Extend `tests/governance/validate-check-set-restructure.test.mjs`:
```javascript
test('SKILL.md report template includes migration-orientation footer', () => {
  const skill = readFileSync('./skills/validate/SKILL.md', 'utf8');
  assert.ok(
    skill.includes('/adev:hygiene') && skill.includes('/adev:reconcile') && skill.includes('/adev:review-specs'),
    'Report template must reference relocation destinations'
  );
  assert.ok(
    skill.includes('Checks 3') || skill.includes('check-3'),
    'Report template must mention relocated checks for user orientation'
  );
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/validate-check-set-restructure.test.mjs`
Expected: FAIL — no migration-orientation footer yet

- [ ] **Implement**

Edit `skills/validate/SKILL.md`:

1. Update the report summary section to reflect surviving checks: 1, 1.5, 1.6, 2, 4 (and optionally 8, 9).

2. Add a migration-orientation footer to every validate report output template:

```markdown
---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated. See:
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), and charter consistency (formerly Check 3, now covered by Check 2 scope-expansion)
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10)
> - `/adev:reconcile` — for lifecycle reconciliation (formerly Check 12-lifecycle-reconciliation)
> - Post-validate hook — for heuristic extraction (formerly Check 13 / check-12-heuristic-extraction)
```

3. Update the PASS/FAIL summary block to reflect the trimmed check set (remove references to Checks 3, 5, 6, 7, 10, 11-as-registry, 12-lifecycle-reconciliation, 13).

- [ ] **Verify test passes**

Run: `node --test tests/governance/validate-check-set-restructure.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/validate/SKILL.md tests/governance/validate-check-set-restructure.test.mjs
git commit -m "docs(validation): update validate report template with post-restructure check inventory and migration footer

Spec: .context-index/specs/features/validation/check-set-restructure.spec.md
Plan-task: 11"
```

---

### Task 12: Add REMOVED_CHECK_ID / RESURRECTED_CHECK_ID to Loader [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=3
**Rationale:** Behavior 11 is fully specified with error codes and test assertions; however, the mechanism to detect isProjectOwned vs plugin-supplied entries requires inference from the existing validate-config loader internals, and no curated golden sample covers validate-config extension specifically.

**Charter capability:** Behavioral contract Behavior 11 — project references to removed checks warn informationally; plugin remnants fail hard
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/governance/validate-config.mjs` — Add REMOVED_CHECK_IDS set, RESURRECTED_CHECK_ID WARN, REMOVED_CHECK_ID error
- Test: `tests/governance/validate-check-set-restructure.test.mjs` (extend) or `tests/governance/validate-config.test.mjs`

**Tests:** `tests/governance/validate-check-set-restructure.test.mjs`

**Context to load:**
- `lib/governance/validate-config.mjs` (full read — existing error patterns)
- Spec Behavior 11 + Error Cases table
- SEC-4: RESURRECTED_CHECK_ID message minimization — show check ID, not full entry content

- [ ] **Write failing test**

Extend `tests/governance/validate-check-set-restructure.test.mjs`:
```javascript
test('project governance/validate.yaml referencing removed check ID emits RESURRECTED_CHECK_ID WARN', () => {
  const repo = tmp();
  const starterPath = join(PLUGIN_ROOT, 'templates/domains/software/validate.yaml');
  const starterBase = readFileSync(starterPath, 'utf8');
  // Add a removed check reference in project override
  const withResurrected = starterBase + '\n  - id: validate.check-3-charter-consistency\n    enabled: true\n';
  writeFixture(repo, '.context-index/governance/validate.yaml', withResurrected);
  const r = loadValidateConfig(repo);
  // Should NOT error — WARN only (project-authored reference)
  assert.ok(r.warnings.some(w => w.code === 'RESURRECTED_CHECK_ID' && w.message.includes('check-3')),
    'Must emit RESURRECTED_CHECK_ID warning for project reference to removed check');
  // The entry must be skipped (not in returned checks)
  assert.ok(!r.checks.some(c => c.id === 'validate.check-3-charter-consistency'),
    'Removed check must be skipped from the final check list');
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/validate-check-set-restructure.test.mjs`
Expected: FAIL — `loadValidateConfig` doesn't emit RESURRECTED_CHECK_ID yet

- [ ] **Implement**

Edit `lib/governance/validate-config.mjs`:

1. Add the set of removed check IDs after the existing constants:
```javascript
// Check IDs removed in check-set-restructure.spec.md. 
// Project references → RESURRECTED_CHECK_ID WARN (skip).
// Plugin-supplied references → REMOVED_CHECK_ID error (defensive).
const REMOVED_CHECK_IDS = new Set([
  'validate.check-3-charter-consistency',
  'validate.check-5-adrs',
  'validate.check-6-cross-cutting',
  'validate.check-7-specialist-review',
  'validate.check-10-platform-drift',
  'validate.check-11-visual-verification',
  'validate.check-12-lifecycle-reconciliation',
  'validate.check-12-heuristic-extraction',
]);
```

2. In the check processing loop, add a guard before loading each entry:
```javascript
if (REMOVED_CHECK_IDS.has(entry.id)) {
  // Distinguish project-authored vs plugin-supplied references
  if (isProjectOwned) {
    // WARN and skip — project may have customized their governance/validate.yaml before migration
    warnings.push({
      code: 'RESURRECTED_CHECK_ID',
      message: `check ID '${entry.id}' was removed in check-set-restructure — entry skipped. See /adev:hygiene, /adev:reconcile, or /adev:review-specs for replacement.`,
    });
    continue;
  } else {
    // Hard fail — plugin-supplied removed ID should never appear post-migration
    errors.push({
      code: 'REMOVED_CHECK_ID',
      message: `check ID '${entry.id}' was removed and must not appear in plugin-supplied configuration.`,
    });
    continue;
  }
}
```

Note: SEC-4 message minimization — RESURRECTED_CHECK_ID message shows only the check ID (not the full entry content) to avoid surfacing sensitive project labels in hygiene output.

- [ ] **Verify test passes**

Run: `node --test tests/governance/validate-check-set-restructure.test.mjs`
Expected: PASS

Run full validate-config tests: `node --test tests/governance/validate-config.test.mjs`
Expected: PASS (no regressions)

- [ ] **Commit**

```bash
git add lib/governance/validate-config.mjs tests/governance/validate-check-set-restructure.test.mjs
git commit -m "feat(validation): add REMOVED_CHECK_ID/RESURRECTED_CHECK_ID to validate-config loader (Behavior 11)

Spec: .context-index/specs/features/validation/check-set-restructure.spec.md
Plan-task: 12"
```

---

### Task 13: Sync Validation Charter Skills Section [specialist: none]

**Routing:** auto-agent (score: 20/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=5
**Rationale:** Plan provides the exact replacement text; test asserts absence of stale phrases; single documentation file with zero design decisions.

**Depends on:** Task 11

**Charter capability:** Documentation accuracy
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `.context-index/specs/features/validation/charter.md` — Update Skills section to reflect post-restructure check count

**Tests:** `tests/governance/validate-check-set-restructure.test.mjs` (extend)

- [ ] **Write failing test**

Extend `tests/governance/validate-check-set-restructure.test.mjs`:
```javascript
test('validation charter does not say 11 ordered checks', () => {
  const charter = readFileSync('./.context-index/specs/features/validation/charter.md', 'utf8');
  assert.ok(!charter.includes('11 ordered checks'), 'Charter must be updated to not say "11 ordered checks"');
  assert.ok(!charter.includes('12 ordered checks'), 'Charter must not say "12 ordered checks"');
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/validate-check-set-restructure.test.mjs`
Expected: FAIL — charter still describes outdated check count

- [ ] **Implement**

Edit `.context-index/specs/features/validation/charter.md` Skills section:

Update the `adev:validate` bullet to accurately describe the post-restructure check inventory:
```markdown
- **adev:validate** — Post-restructure check set: Check 1 (quality gates from `governance/gates.yaml`), Check 1.5 (source manifest), Check 1.6 (code-drift advisory), Check 2 (spec compliance + scope-expansion sub-finding), Check 4 (constitutional compliance with evidence-citation contract), and optionally Check 8 (governance boundaries) and Check 9 (transition gates) when governance is configured. Fail-fast on quality gates. Structured PASS/FAIL report with file references and migration-orientation footer for users comparing with historic reports. Checks 3, 5, 6, 7, 10, 12, 13 relocated to `/adev:review-specs`, `/adev:hygiene`, `/adev:reconcile`, and post-validate hook. Single-source check registry in `.context-index/governance/validate.yaml`.
```

- [ ] **Verify test passes**

Run: `node --test tests/governance/validate-check-set-restructure.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add .context-index/specs/features/validation/charter.md tests/governance/validate-check-set-restructure.test.mjs
git commit -m "docs(validation): sync charter Skills section to post-restructure check inventory

Spec: .context-index/specs/features/validation/check-set-restructure.spec.md
Plan-task: 13"
```

---

### Task 14: Token-Cost Measurement [specialist: none]

**Routing:** assisted-agent (score: 14/20)
**Scores:** spec=3 pattern=3 blast=5 novelty=3
**Rationale:** Measurement task requires locating pre-restructure session JSONL data and interpreting results; the methodology is documented but the exploratory navigation of session files and the judgment call on what constitutes a representative pre-restructure baseline warrants a mid-point human review.

**Depends on:** All tasks (run after all restructuring is complete)

**Charter capability:** Validate dispatch token cost reduced (measured, not asserted)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- No new files — measurement output recorded in spec outcome notes

**Tests:** N/A (measurement-only task)

- [ ] **Measure pre/post token cost**

Per the validation-module heuristic on token measurement, use JSONL-based parsing:

```bash
# Find session JSONL files for representative charter (≥5 specs)
# Pre-restructure data: look for sessions from before 2026-05-15
ls .context-index/sessions/*.md | head -20

# Use lib/session-file-reader.mjs and lib/token-cursor.mjs to parse
node -e "
import('./lib/session-file-reader.mjs').then(async m => {
  // Parse session logs for a representative charter with ≥5 specs
  // Compare pre-restructure per-validate-dispatch token cost
  // against post-restructure run on same charter
  console.log('Token measurement requires running post-restructure validate on a ≥5-spec charter');
});"
```

Run `/adev:validate` on a representative charter (≥5 specs) after all restructuring is complete.
Compare against pre-restructure baselines from historic session JSONL files.

- [ ] **Record measurement**

Update spec outcome notes with:
- Representative charter used for measurement
- Pre-restructure per-dispatch token cost (from historic JSONL)
- Post-restructure per-dispatch token cost (from fresh run)
- Measured delta and whether it confirms the hypothesis

Add a comment to `check-set-restructure.spec.md` frontmatter or a trailing "## Outcomes" section:
```markdown
## Measurement Outcomes

- Charter measured: <charter-name> (N specs)
- Pre-restructure per-dispatch: ~X tokens (from session JSONL <filename>)
- Post-restructure per-dispatch: ~Y tokens (fresh run <date>)
- Delta: Z% reduction / increase
- Hypothesis confirmed: yes / no / partially
```

- [ ] **Commit**

```bash
git add .context-index/specs/features/validation/check-set-restructure.spec.md
git commit -m "chore(validation): record token-cost measurement results post-restructure

Spec: .context-index/specs/features/validation/check-set-restructure.spec.md
Plan-task: 14"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied

---

## Acceptance Criteria Coverage

| Criterion | Task(s) |
|-----------|---------|
| `governance/validate.yaml` retains only surviving check IDs | Task 5, 7, 8, 10 |
| RESURRECTED_CHECK_ID WARN for project references to removed IDs | Task 12 |
| `/adev:reconcile` produces Check 12-equivalent output + `--fix` default | Task 2 |
| `/adev:hygiene` Audit Pass 20 covers platform drift | Task 1 |
| `/adev:review-specs` covers ADR and cross-cutting compliance | Task 3 |
| Check 2 scope-expansion pinned to `source-manifest.files`; INFO for missing field | Task 7 |
| `/adev:reconcile --fix` uses `reportPlanTask` (no markdown checkbox writes) | Task 2 |
| Post-validate hook input scoped to verdict metadata only | Task 4 |
| Single REMOVED_CHECK_ID rule (project→WARN, plugin→FAIL) | Task 12 |
| Check 4 findings cite file:line evidence; UNCITED_FINDING → FAIL | Task 9 |
| Check 11 SKIPs (not BLOCKs) when no UI files + no Playwright | Task 6 |
| Check 11 BLOCKs when UI files + no Playwright | Task 6 |
| Post-validate hook runs non-blocking; heuristics land in store | Task 4 |
| Verdict semantics for surviving checks unchanged | Tasks 5, 7, 8, 10, 12 |
| Token-cost measurement recorded | Task 14 |
| `validation/charter.md` Skills section updated | Task 13 |
| All quality gates pass (`npm test`) | All tasks (each commit green) |
| No constitutional violations | All tasks |
