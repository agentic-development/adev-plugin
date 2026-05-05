# Implementation Plan: Playbook Format and Debug Loading

> **Methodology:** adev
> **Charter:** .context-index/specs/features/debug-playbooks/charter.md
> **Spec:** .context-index/specs/features/debug-playbooks/playbook-format-and-debug-loading.spec.md
> **Review:** PASS_WITH_NOTES (2026-04-24)
> **Platform:** JavaScript (ESM), Node.js, node:test

**Goal:** Add debug playbook support — a structured markdown template for diagnostic procedures and the corresponding loading/matching instructions in the debug skill's Phase 2.

**Architecture:** Playbooks are pure markdown files following the existing template convention (`templates/<name>-template.md`). The debug SKILL.md gains a new step in Phase 2 that reads playbook files and matches failure mode triggers against Phase 1 symptoms. All matching is LLM-side — no helper library or code-based matcher. This follows the same pattern as heuristic injection (markdown instructions, no executable dependency).

---

## File Structure

**Create:**
- `templates/debug-playbook-template.md` — Playbook template with failure mode structure
- `tests/templates/debug-playbook-template.test.mjs` — Template validation tests

**Modify:**
- `skills/debug/SKILL.md` — Add step 5.5 (playbook loading) to Phase 2

**Reference (read, do not modify):**
- `.context-index/specs/features/debug-playbooks/charter.md` — Domain model and quality attributes
- `.context-index/specs/features/debug-playbooks/playbook-format-and-debug-loading.spec.md` — Behavioral contract
- `templates/blocker-template.md` — Pattern reference for template structure

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/debug-playbooks/playbook-format-and-debug-loading.spec.md` (Diagnostic Step Schema, Playbook Structure, criteria 1-2)
- Charter: `.context-index/specs/features/debug-playbooks/charter.md` (Domain Model entities)
- Reference: `templates/blocker-template.md` (existing template pattern)

### Task 2 Context
- Spec: `.context-index/specs/features/debug-playbooks/playbook-format-and-debug-loading.spec.md` (Behaviors 1-8, Error Cases, criteria 3-10)
- Charter: `.context-index/specs/features/debug-playbooks/charter.md` (Quality Attributes: graceful absence, token efficiency)
- Reference: `skills/debug/SKILL.md` (Phase 2, steps 1-7 — insertion point between step 5 and step 6)

### Task 3 Context
- Spec: `.context-index/specs/features/debug-playbooks/playbook-format-and-debug-loading.spec.md` (Playbook Structure, Diagnostic Step Schema)
- Reference: `tests/templates/gates-template.test.mjs` (existing template test pattern)
- Reference: `tests/templates/manifest-template.test.mjs` (existing template test pattern)

## Parallelization

- Group A (sequential): Task 1 → Task 2 (Task 2 references the template created in Task 1)
- Group B (independent): Task 3 (tests can be written in parallel with Task 2, verifying the template from Task 1)

Task 3 depends on Task 1 but is independent of Task 2.

---

### Task 1: Create Playbook Template [specialist: none]

**Charter capability:** Playbook file format and template
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `templates/debug-playbook-template.md`

**Tests:** `tests/templates/debug-playbook-template.test.mjs`

**Context to load:**
- `.context-index/specs/features/debug-playbooks/charter.md` (Domain Model — entities and their attributes)
- `templates/blocker-template.md` (follow this template pattern)

- [x] **Write failing test**

Create `tests/templates/debug-playbook-template.test.mjs`:
```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const templatePath = join(repoRoot, 'templates', 'debug-playbook-template.md');

describe('debug-playbook-template', () => {
  let content;

  it('template file exists', () => {
    content = readFileSync(templatePath, 'utf8');
    assert.ok(content.length > 0);
  });

  it('has YAML frontmatter with last-verified field', () => {
    assert.match(content, /^---\n/);
    assert.match(content, /last-verified:/);
  });

  it('has at least one failure mode section with required fields', () => {
    assert.match(content, /## Failure Mode:/i);
    assert.match(content, /id:/i);
    assert.match(content, /triggers:/i);
    assert.match(content, /escalation:/i);
  });

  it('has ordered diagnostic steps', () => {
    assert.match(content, /### Steps/i);
    assert.match(content, /1\./);
  });

  it('diagnostic steps include description field', () => {
    assert.match(content, /description:/i);
  });

  it('has command and expected fields documented', () => {
    assert.match(content, /command:/i);
    assert.match(content, /expected:/i);
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/templates/debug-playbook-template.test.mjs`
Expected: FAIL — template file does not exist

- [x] **Implement**

Create `templates/debug-playbook-template.md` following the charter domain model. Include:
- YAML frontmatter with `last-verified: {{ date }}`
- A sample failure mode section with all required fields (id, title, triggers, ordered steps with description/command/expected, escalation with condition and target)
- HTML comments explaining each section
- A second failure mode stub to show the repeating pattern

- [x] **Verify test passes**

Run: `node --test tests/templates/debug-playbook-template.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add templates/debug-playbook-template.md tests/templates/debug-playbook-template.test.mjs
git commit -m "feat(debug-playbooks): add debug playbook template"
```

---

### Task 2: Add Phase 2 Playbook Loading to Debug SKILL.md [specialist: none]

**Charter capability:** Debug Phase 2 loading, Trigger matching
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `skills/debug/SKILL.md` (Phase 2, between current step 5 and step 6)

**Tests:** `tests/skills/debug-playbook-loading.test.mjs`

**Context to load:**
- `.context-index/specs/features/debug-playbooks/playbook-format-and-debug-loading.spec.md` (all 8 behaviors + error cases)
- `skills/debug/SKILL.md` (current Phase 2 structure — steps 1-7)

- [x] **Write failing test**

Create `tests/skills/debug-playbook-loading.test.mjs`:
```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const skillPath = join(repoRoot, 'skills', 'debug', 'SKILL.md');

describe('debug SKILL.md playbook loading', () => {
  let content;

  it('skill file exists and is readable', () => {
    content = readFileSync(skillPath, 'utf8');
    assert.ok(content.length > 0);
  });

  it('Phase 2 includes playbook loading step', () => {
    assert.match(content, /playbook/i);
    assert.match(content, /debug-playbook\.md/i);
  });

  it('loads module-scoped playbook path', () => {
    assert.match(content, /\.context-index\/specs\/features\/<module>\/debug-playbook\.md/);
  });

  it('loads cross-cutting playbook path', () => {
    assert.match(content, /\.context-index\/specs\/cross-cutting\/debug-playbook\.md/);
  });

  it('describes trigger matching as LLM-side', () => {
    assert.match(content, /trigger/i);
    assert.match(content, /match/i);
    assert.match(content, /symptom/i);
  });

  it('describes fallback menu when no triggers match', () => {
    assert.match(content, /menu/i);
  });

  it('describes graceful absence', () => {
    // Should mention proceeding without warnings when no playbook exists
    assert.match(content, /no playbook/i);
  });

  it('describes command execution via Bash with tool approval', () => {
    assert.match(content, /command/i);
    assert.match(content, /Bash/i);
  });

  it('describes escalation behavior', () => {
    assert.match(content, /escalation/i);
  });

  it('module-scoped precedence over cross-cutting on overlap', () => {
    assert.match(content, /precedence/i);
  });

  it('playbook step appears between repo map and gather evidence', () => {
    const repoMapIdx = content.indexOf('repo map');
    const playbookIdx = content.indexOf('playbook');
    const gatherIdx = content.indexOf('Gather evidence');
    // Playbook loading should appear after repo map mention and before gather evidence
    assert.ok(playbookIdx > 0, 'playbook section exists');
    assert.ok(gatherIdx > 0, 'gather evidence section exists');
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/skills/debug-playbook-loading.test.mjs`
Expected: FAIL — SKILL.md does not yet contain playbook-related content

- [x] **Implement**

Edit `skills/debug/SKILL.md` Phase 2 to add a new step between current step 5 (repo map) and step 6 (gather evidence). Renumber steps 6 and 7 to 7 and 8. The new step 6 should contain:

1. **Load debug playbooks.**
   - Read `.context-index/specs/features/<module>/debug-playbook.spec.md` if it exists (module determined in Phase 1).
   - Read `.context-index/specs/cross-cutting/debug-playbook.spec.md` if it exists.
   - If neither file exists, skip this step silently — no warnings, no degradation.
   - If a file exists but is malformed (missing YAML frontmatter with `last-verified`, or missing failure mode sections with `id`, `triggers`, `steps`, and `escalation`), log a warning and skip it.

2. **Match triggers against Phase 1 symptoms.**
   - For each failure mode in the loaded playbooks, compare its trigger patterns semantically against the error messages, stack traces, and behavioral descriptions from Phase 1.
   - This is an LLM-side operation — read each trigger's pattern text and compare it against symptoms. No helper library or code-based matcher is used.
   - When both module and cross-cutting playbooks contain failure modes whose triggers match the same symptom, present only the module-scoped failure mode for that symptom. Non-overlapping cross-cutting failure modes are still included.
   - If triggers match: present the matched failure modes with their ordered diagnostic steps as the recommended investigation path.
   - If no triggers match but a playbook exists: present the full list of failure mode titles as a menu for the user to select from.

3. **Execute diagnostic steps.**
   - For each matched failure mode, follow its ordered steps.
   - If a step has a `command` field, execute it via the Bash tool. Command execution is subject to Claude Code's standard tool approval — the user sees and approves each command. Compare output against the `expected` field.
   - Command output is ephemeral: used to inform the investigation but not written to disk or included in reports beyond a one-line summary.
   - If a command fails or times out, report the failure as a diagnostic finding and continue to the next step.
   - If the escalation condition is met, stop following the playbook and report the escalation target (human, ADR review, or architecture reassessment) before proceeding to Phase 3.

- [x] **Verify test passes**

Run: `node --test tests/skills/debug-playbook-loading.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add skills/debug/SKILL.md tests/skills/debug-playbook-loading.test.mjs
git commit -m "feat(debug-playbooks): add playbook loading and trigger matching to debug Phase 2"
```

---

### Task 3: Template Domain Model Validation Tests [specialist: none]

**Charter capability:** Playbook file format and template
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `tests/templates/debug-playbook-template.test.mjs` (add deeper validation)

**Tests:** `tests/templates/debug-playbook-template.test.mjs`

**Context to load:**
- `.context-index/specs/features/debug-playbooks/charter.md` (Domain Model invariants)
- `tests/templates/gates-template.test.mjs` (existing template test pattern)

- [x] **Write failing test**

Add additional tests to `tests/templates/debug-playbook-template.test.mjs`:
```javascript
  it('failure mode ids are unique slugs (kebab-case)', () => {
    const ids = [...content.matchAll(/id:\s*(\S+)/g)].map(m => m[1]);
    assert.ok(ids.length >= 1, 'at least one failure mode id');
    const unique = new Set(ids);
    assert.equal(unique.size, ids.length, 'all ids are unique');
    for (const id of ids) {
      assert.match(id, /^[a-z0-9-]+$/, `id "${id}" should be kebab-case`);
    }
  });

  it('escalation includes condition and target', () => {
    assert.match(content, /condition:/i);
    assert.match(content, /target:/i);
  });

  it('template has HTML comments explaining sections', () => {
    assert.match(content, /<!--/);
  });
```

- [x] **Verify test fails**

Run: `node --test tests/templates/debug-playbook-template.test.mjs`
Expected: FAIL on the new assertions (if template doesn't already satisfy them)

- [x] **Implement**

Update the template if needed to satisfy the deeper validation (ensure example failure mode ids are kebab-case slugs, escalation has both condition and target fields, HTML comments present).

- [x] **Verify test passes**

Run: `node --test tests/templates/debug-playbook-template.test.mjs`
Expected: PASS — all tests including new ones

- [x] **Commit**

```bash
git add tests/templates/debug-playbook-template.test.mjs templates/debug-playbook-template.md
git commit -m "test(debug-playbooks): add domain model validation for playbook template"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [x] Tests pass: `npm test`
- [x] All 12 acceptance criteria from spec satisfied
- [x] No constitutional violations introduced
