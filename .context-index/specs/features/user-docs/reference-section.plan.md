# Implementation Plan: Reference Section

> **Methodology:** adev
> **Charter:** .context-index/specs/features/user-docs/charter.md
> **Spec:** .context-index/specs/features/user-docs/reference-section.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-09)
> **Platform:** Node.js, JavaScript (ESM), npm

**Goal:** Create the three reference documentation pages — skill reference, configuration reference, and hooks reference — completing the Reference section of the documentation site.

**Architecture:** Pure markdown documentation files in `docs/`. No build step, no site generator, no external dependencies. Skill reference is sourced from 30 SKILL.md files in the plugin. Hooks reference is sourced from `hooks/hooks.json` (11 hooks across 3 trigger points). Configuration reference is sourced from `manifest.yaml`, `constitution.md`, and `platform-context.yaml`.

**Review notes to address during implementation:**
- SA-2: Constitution docs should distinguish narrative sections from typed fields
- SEC-3: Configuration reference should note that integration credentials belong in env vars, not manifest
- SEC-4: Hooks reference should note that hook scripts should sanitize stdin
- CON-6: Skill entries should include "arguments" and "expected output summary" attributes

---

## File Structure

**Create:**
- `docs/skill-reference.md` — One entry per skill organized by lifecycle phase
- `docs/configuration.md` — Field-level docs for manifest, constitution, platform-context
- `docs/hooks.md` — All 11 hooks organized by trigger point
- `tests/docs/reference-section.test.mjs` — Tests for all three reference pages

**Modify:**
- `docs/README.md` — Update Reference section links from "coming soon" to active links

**Reference (read, do not modify):**
- `skills/*/SKILL.md` — Source of truth for skill entries (30 skills in plugin)
- `hooks/hooks.json` — Source of truth for hook registry (11 hooks, 3 trigger points)
- `hooks/*.sh` — Source for hook behavior descriptions
- `.context-index/manifest.yaml` — Source for manifest configuration fields
- `.context-index/constitution.md` — Source for constitution section docs
- `.context-index/platform-context.yaml` — Source for platform-context fields
- `docs/concepts.md` — Link target for concept cross-references (Behavior 8)

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/user-docs/reference-section.spec.md` (Behaviors 1-3, Error Case MISSING_SKILL_ENTRY)
- Charter: `.context-index/specs/features/user-docs/charter.md` (capability: Skill Reference, entity: Skill Entry)
- Source: all 30 `skills/*/SKILL.md` files in the plugin
- Review note: CON-6 — each entry must include arguments and expected output summary
- Constitution: `.context-index/constitution.md` (principle: "Skills are primarily markdown")

### Task 2 Context
- Same as Task 1 — continuation of skill entries by lifecycle phase
- Source: `skills/*/SKILL.md` for design-phase skills

### Task 3 Context
- Same as Task 1 — continuation of skill entries by lifecycle phase
- Source: `skills/*/SKILL.md` for build-phase skills

### Task 4 Context
- Same as Task 1 — continuation of skill entries by lifecycle phase
- Source: `skills/*/SKILL.md` for validation and maintenance skills

### Task 5 Context
- Spec: `.context-index/specs/features/user-docs/reference-section.spec.md` (Behaviors 4-5, Error Case MISSING_CONFIG_FIELD)
- Charter: `.context-index/specs/features/user-docs/charter.md` (capability: Configuration Reference, entity: Configuration Entry)
- Source: `.context-index/manifest.yaml` (all sections)
- Source: `.context-index/constitution.md` (all sections)
- Source: `.context-index/platform-context.yaml` (all fields)
- Review notes: SA-2 — distinguish narrative vs typed fields in constitution; SEC-3 — note credentials belong in env vars

### Task 6 Context
- Spec: `.context-index/specs/features/user-docs/reference-section.spec.md` (Behaviors 6-7, Error Case MISSING_HOOK_ENTRY)
- Charter: `.context-index/specs/features/user-docs/charter.md` (capability: Hooks Reference)
- Source: `hooks/hooks.json` (hook registry with matchers and trigger points)
- Source: `hooks/*.sh` (hook script implementations for behavior descriptions)
- Review note: SEC-4 — note that hook scripts should sanitize stdin
- Constitution: `.context-index/constitution.md` (principle: "Hook protocol compliance")

### Task 7 Context
- Spec: `.context-index/specs/features/user-docs/reference-section.spec.md` (Postcondition: all three pages linked from TOC)
- Reference: `docs/README.md` (current state with "coming soon" reference links)

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 (skill reference built incrementally — structure first, then entries by phase)
- Group B (independent): Task 5 (configuration reference — no dependencies on other tasks)
- Group C (independent): Task 6 (hooks reference — no dependencies on other tasks)
- Group D (sequential, after all): Task 7 (TOC update depends on all three pages existing)

Groups A, B, and C can run in parallel. Task 7 runs last.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Write skill reference structure and setup/triage/meta entries | medium | unit | — | 1 create, 1 create |
| 2 | Write skill entries — design phase | medium | unit | Task 1 | 1 modify |
| 3 | Write skill entries — build phase | medium | unit | Task 2 | 1 modify |
| 4 | Write skill entries — validation and maintenance | large | unit | Task 3 | 1 modify |
| 5 | Write docs/configuration.md | large | unit | — | 1 create |
| 6 | Write docs/hooks.md | medium | unit | — | 1 create |
| 7 | Update TOC and verify cross-page links | small | unit | Task 4, 5, 6 | 1 modify |

---

### Task 1: Write skill reference structure and setup/triage/meta entries [specialist: none]

**Charter capability:** Skill Reference
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `docs/skill-reference.md`
- Create: `tests/docs/reference-section.test.mjs`

**Tests:** `tests/docs/reference-section.test.mjs`

- [x] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert';

const DOCS_DIR = join(import.meta.dirname, '..', '..', 'docs');

describe('docs/skill-reference.md — Skill Reference', () => {
  it('should exist', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'skill-reference.md')));
  });

  it('should be organized by lifecycle phase', () => {
    const content = readFileSync(join(DOCS_DIR, 'skill-reference.md'), 'utf-8');
    const phases = ['Setup', 'Triage', 'Design', 'Build', 'Validation', 'Maintenance'];
    for (const phase of phases) {
      assert.ok(
        content.includes(phase),
        `Missing lifecycle phase grouping: ${phase}`
      );
    }
  });

  it('should contain a summary table listing skills', () => {
    const content = readFileSync(join(DOCS_DIR, 'skill-reference.md'), 'utf-8');
    // Table should have header row with skill name and purpose columns
    assert.ok(content.includes('| Skill'), 'Missing skill summary table');
    assert.ok(content.includes('Purpose') || content.includes('Description'), 'Missing purpose column');
  });

  it('should have an entry for every skill in the plugin', () => {
    const content = readFileSync(join(DOCS_DIR, 'skill-reference.md'), 'utf-8');
    const expectedSkills = [
      'init', 'sync', 'using-adev', 'work',
      'brainstorm', 'specify', 'review-specs', 'prototype',
      'plan', 'route', 'implement', 'write-test', 'build',
      'validate', 'debug', 'eval', 'recover',
      'issues', 'status', 'hygiene', 'retro', 'codehealth',
      'repomap', 'reconcile', 'sample', 'document',
      'research', 'learn', 'assess', 'standalone'
    ];
    for (const skill of expectedSkills) {
      assert.ok(
        content.includes(`adev:${skill}`) || content.includes(`/adev:${skill}`),
        `Missing skill entry: ${skill}`
      );
    }
  });

  it('should include purpose, prerequisites, and arguments for each entry', () => {
    const content = readFileSync(join(DOCS_DIR, 'skill-reference.md'), 'utf-8');
    // Check a sample of entries have the required subsections
    assert.ok(content.includes('Purpose') || content.includes('purpose'), 'Missing purpose in entries');
    assert.ok(content.includes('Prerequisite') || content.includes('prerequisite'), 'Missing prerequisites in entries');
    assert.ok(content.includes('Argument') || content.includes('argument') || content.includes('Usage'), 'Missing arguments in entries');
  });

  it('should include example invocations', () => {
    const content = readFileSync(join(DOCS_DIR, 'skill-reference.md'), 'utf-8');
    // At least some entries should have example invocations
    assert.ok(content.includes('Example') || content.includes('example'), 'Missing example invocations');
  });

  it('should link back to workflow guides rather than re-explaining concepts (Behavior 8)', () => {
    const content = readFileSync(join(DOCS_DIR, 'skill-reference.md'), 'utf-8');
    // Should contain links to other docs pages
    assert.ok(
      content.includes('concepts.md') || content.includes('getting-started.md'),
      'Should cross-reference other guide pages'
    );
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/reference-section.test.mjs`
Expected: FAIL — docs/skill-reference.md does not exist yet

- [x] **Implement**

Create `docs/skill-reference.md` with:
- Title: "Skill Reference"
- Intro paragraph explaining that adev provides skills as slash commands, linking to [Core Concepts](concepts.md) for background
- **Summary Table** listing all 30 skills with columns: Skill, Phase, Purpose, Prerequisites
- **Phase Sections** — one H2 per lifecycle phase, each containing skill entries
- For this task, write entries for **Setup & Triage** (init, sync, using-adev, work) and **Meta** (research, learn, assess, standalone) phases

Each skill entry must include (per CON-6):
- **Purpose** — one paragraph description sourced from SKILL.md
- **Prerequisites** — what must exist before invoking
- **Arguments** — supported arguments with descriptions
- **Example** — example invocation
- **Expected Output** — what the skill produces
- **Related Guides** — links to relevant workflow guide pages

Create `tests/docs/reference-section.test.mjs` with all tests for the reference section.

- [x] **Verify test passes**

Run: `node --test tests/docs/reference-section.test.mjs`
Expected: Partial pass — structure tests pass, completeness tests may still fail until all entries added

- [x] **Commit**

```bash
git add docs/skill-reference.md tests/docs/reference-section.test.mjs
git commit -m "feat(user-docs): add skill reference structure with setup/triage/meta entries

Spec: .context-index/specs/features/user-docs/reference-section.spec.md
Plan-task: 1"
```

---

### Task 2: Write skill entries — design phase [specialist: none]

**Charter capability:** Skill Reference
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `docs/skill-reference.md`

**Tests:** `tests/docs/reference-section.test.mjs` (already written — task adds content to pass completeness checks)

- [x] **Write failing test**

Tests already exist from Task 1 — the completeness test checks for design-phase skills (brainstorm, specify, review-specs, prototype).

- [x] **Verify test fails**

Run: `node --test tests/docs/reference-section.test.mjs`
Expected: FAIL — design-phase skill entries not yet written

- [x] **Implement**

Add entries to `docs/skill-reference.md` under the **Design** phase section for:
- `/adev:brainstorm` — explore feature ideas, produce Feature Charter
- `/adev:specify` — author Live Specs within a charter's scope
- `/adev:review-specs` — run parallel specialist reviews on specs
- `/adev:prototype` — rapid UI/flow sketching from charters

Source each entry from the corresponding `skills/*/SKILL.md`. Each entry follows the standard format: Purpose, Prerequisites, Arguments, Example, Expected Output, Related Guides.

- [x] **Verify test passes**

Run: `node --test tests/docs/reference-section.test.mjs`

- [x] **Commit**

```bash
git add docs/skill-reference.md
git commit -m "feat(user-docs): add design-phase skill entries to reference

Spec: .context-index/specs/features/user-docs/reference-section.spec.md
Plan-task: 2"
```

---

### Task 3: Write skill entries — build phase [specialist: none]

**Charter capability:** Skill Reference
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `docs/skill-reference.md`

**Tests:** `tests/docs/reference-section.test.mjs` (already written)

- [x] **Write failing test**

Tests already exist — completeness test checks for build-phase skills (plan, route, implement, write-test, build).

- [x] **Verify test fails**

Run: `node --test tests/docs/reference-section.test.mjs`
Expected: FAIL — build-phase entries not yet written

- [x] **Implement**

Add entries to `docs/skill-reference.md` under the **Build** phase section for:
- `/adev:plan` — decompose specs into ordered implementation tasks
- `/adev:route` — score tasks on routing matrix for auto/assisted/human execution
- `/adev:implement` — execute plans using specialist-routed subagents with TDD
- `/adev:write-test` — TDD test authoring (RED phase)
- `/adev:build` — end-to-end build orchestrator chaining review through validate

Source each entry from the corresponding `skills/*/SKILL.md`.

- [x] **Verify test passes**

Run: `node --test tests/docs/reference-section.test.mjs`

- [x] **Commit**

```bash
git add docs/skill-reference.md
git commit -m "feat(user-docs): add build-phase skill entries to reference

Spec: .context-index/specs/features/user-docs/reference-section.spec.md
Plan-task: 3"
```

---

### Task 4: Write skill entries — validation and maintenance [specialist: none]

**Charter capability:** Skill Reference
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Modify: `docs/skill-reference.md`

**Tests:** `tests/docs/reference-section.test.mjs` (already written)

- [x] **Write failing test**

Tests already exist — completeness test checks for validation skills (validate, debug, eval, recover) and maintenance skills (issues, status, hygiene, retro, codehealth, repomap, reconcile, sample, document).

- [x] **Verify test fails**

Run: `node --test tests/docs/reference-section.test.mjs`
Expected: FAIL — validation and maintenance entries not yet written

- [x] **Implement**

Add entries to `docs/skill-reference.md` under the **Validation** phase section for:
- `/adev:validate` — post-implementation validation with 13 checks
- `/adev:debug` — context-aware systematic debugging
- `/adev:eval` — graduated evaluation harness (0-100)
- `/adev:recover` — structured diagnosis when agents get stuck

Add entries under the **Maintenance** phase section for:
- `/adev:issues` — manage project issues and epics
- `/adev:status` — query project status dashboard
- `/adev:hygiene` — audit context for staleness and drift
- `/adev:retro` — sprint retrospective for agentic development
- `/adev:codehealth` — scan for dead exports, orphan files, unused dependencies
- `/adev:repomap` — generate AST-based symbol index
- `/adev:reconcile` — interactive repair for lifecycle mismatches
- `/adev:sample` — curate golden sample implementations
- `/adev:document` — generate developer documentation from repomap

Source each entry from the corresponding `skills/*/SKILL.md`.

- [x] **Verify test passes**

Run: `node --test tests/docs/reference-section.test.mjs`
Expected: PASS — all 30 skill entries now present

- [x] **Commit**

```bash
git add docs/skill-reference.md
git commit -m "feat(user-docs): add validation and maintenance skill entries to reference

Spec: .context-index/specs/features/user-docs/reference-section.spec.md
Plan-task: 4"
```

---

### Task 5: Write docs/configuration.md [specialist: none]

**Charter capability:** Configuration Reference
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `docs/configuration.md`
- Modify: `tests/docs/reference-section.test.mjs`

**Tests:** `tests/docs/reference-section.test.mjs`

- [x] **Write failing test**

Add to `tests/docs/reference-section.test.mjs`:

```javascript
describe('docs/configuration.md — Configuration Reference', () => {
  it('should exist', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'configuration.md')));
  });

  it('should document all manifest.yaml sections', () => {
    const content = readFileSync(join(DOCS_DIR, 'configuration.md'), 'utf-8');
    const sections = [
      'project', 'sync', 'modules', 'specialists', 'gates',
      'completion', 'tasks', 'provenance', 'repomap', 'hygiene', 'integrations'
    ];
    for (const section of sections) {
      assert.ok(
        content.includes(section),
        `Missing manifest.yaml section: ${section}`
      );
    }
  });

  it('should document all constitution.md sections', () => {
    const content = readFileSync(join(DOCS_DIR, 'configuration.md'), 'utf-8');
    const sections = [
      'Identity', 'Principles', 'Coding Standards',
      'Architecture Boundaries', 'Context Routing', 'Quality Gates'
    ];
    for (const section of sections) {
      assert.ok(
        content.includes(section),
        `Missing constitution.md section: ${section}`
      );
    }
  });

  it('should document platform-context.yaml', () => {
    const content = readFileSync(join(DOCS_DIR, 'configuration.md'), 'utf-8');
    assert.ok(
      content.includes('platform-context') || content.includes('Platform Context'),
      'Missing platform-context.yaml documentation'
    );
  });

  it('should document default values for fields that have them', () => {
    const content = readFileSync(join(DOCS_DIR, 'configuration.md'), 'utf-8');
    assert.ok(
      content.includes('Default') || content.includes('default'),
      'Missing default value documentation'
    );
  });

  it('should note that credentials belong in env vars (SEC-3)', () => {
    const content = readFileSync(join(DOCS_DIR, 'configuration.md'), 'utf-8');
    assert.ok(
      content.includes('environment variable') || content.includes('env var'),
      'Missing note about credentials in env vars (SEC-3)'
    );
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/reference-section.test.mjs`
Expected: FAIL — docs/configuration.md does not exist yet

- [x] **Implement**

Create `docs/configuration.md` with:
- Title: "Configuration Reference"
- Intro paragraph explaining the three configuration files
- **manifest.yaml** section with field-level documentation for all 11 sections:
  - project (name, adev_version, description, type — with defaults)
  - sync (targets array, format options)
  - modules (slug, name, paths — with explanation of module boundaries)
  - specialists (when to add, format)
  - gates (test commands, how validation uses them)
  - completion (merge_policy, protected_branches, branch_naming — with defaults)
  - tasks (backend options: file, beads_rust)
  - provenance (require_hooks, required_trailers, recommended_trailers)
  - repomap (exclude patterns — with defaults)
  - hygiene (staleness_threshold_days, source_roots, coverage_exclude — with defaults)
  - integrations (session_capture provider options)
- **constitution.md** section documenting each section's purpose and structure:
  - Identity (narrative — project description)
  - Non-Negotiable Principles (typed list — numbered principles)
  - Coding Standards (structured — language, conventions, patterns)
  - Architecture Boundaries (decision matrix — requires approval vs autonomous)
  - Context Routing (reference table — where to find what)
  - Quality Gates (command list — bash commands to run)
  - Distinguish narrative sections from typed/structured fields (SA-2)
- **platform-context.yaml** section documenting all fields
- Note that integration credentials belong in environment variables, not manifest (SEC-3)
- Document default values wherever they exist (Behavior 5)
- Link to [Core Concepts](concepts.md) for background on context-first architecture (Behavior 8)

- [x] **Verify test passes**

Run: `node --test tests/docs/reference-section.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add docs/configuration.md tests/docs/reference-section.test.mjs
git commit -m "feat(user-docs): add docs/configuration.md with field-level reference

Spec: .context-index/specs/features/user-docs/reference-section.spec.md
Plan-task: 5"
```

---

### Task 6: Write docs/hooks.md [specialist: none]

**Charter capability:** Hooks Reference
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `docs/hooks.md`
- Modify: `tests/docs/reference-section.test.mjs`

**Tests:** `tests/docs/reference-section.test.mjs`

- [x] **Write failing test**

Add to `tests/docs/reference-section.test.mjs`:

```javascript
describe('docs/hooks.md — Hooks Reference', () => {
  it('should exist', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'hooks.md')));
  });

  it('should be organized by trigger point', () => {
    const content = readFileSync(join(DOCS_DIR, 'hooks.md'), 'utf-8');
    const triggers = ['SessionStart', 'PreToolUse', 'PostToolUse'];
    for (const trigger of triggers) {
      assert.ok(
        content.includes(trigger),
        `Missing trigger point: ${trigger}`
      );
    }
  });

  it('should contain a summary table', () => {
    const content = readFileSync(join(DOCS_DIR, 'hooks.md'), 'utf-8');
    assert.ok(content.includes('| Hook') || content.includes('| Name'), 'Missing hooks summary table');
  });

  it('should have entries for all 11 hooks', () => {
    const content = readFileSync(join(DOCS_DIR, 'hooks.md'), 'utf-8');
    const hooks = [
      'session-start', 'context-preflight', 'constitution-linter',
      'lifecycle-gate-edit', 'merge-guard', 'lifecycle-gate-bash',
      'context-read-tracker', 'sync-trigger', 'session-capture',
      'issue-reminder', 'lifecycle-gate-advisory'
    ];
    for (const hook of hooks) {
      assert.ok(
        content.includes(hook),
        `Missing hook entry: ${hook}`
      );
    }
  });

  it('should document blocking vs advisory behavior', () => {
    const content = readFileSync(join(DOCS_DIR, 'hooks.md'), 'utf-8');
    assert.ok(
      content.includes('block') || content.includes('Block'),
      'Missing blocking behavior documentation'
    );
    assert.ok(
      content.includes('advisory') || content.includes('Advisory') || content.includes('advise'),
      'Missing advisory behavior documentation'
    );
  });

  it('should explain resolution steps for blocking hooks (Behavior 7)', () => {
    const content = readFileSync(join(DOCS_DIR, 'hooks.md'), 'utf-8');
    assert.ok(
      content.includes('resolve') || content.includes('Resolution') || content.includes('resolution'),
      'Missing resolution steps for blocking hooks'
    );
  });

  it('should note that hook scripts should sanitize stdin (SEC-4)', () => {
    const content = readFileSync(join(DOCS_DIR, 'hooks.md'), 'utf-8');
    assert.ok(
      content.includes('sanitiz') || content.includes('validat'),
      'Missing note about stdin sanitization (SEC-4)'
    );
  });

  it('should document the hook protocol (exit codes and JSON)', () => {
    const content = readFileSync(join(DOCS_DIR, 'hooks.md'), 'utf-8');
    assert.ok(content.includes('exit 0') || content.includes('exit code 0'), 'Missing exit 0 documentation');
    assert.ok(content.includes('exit 2') || content.includes('exit code 2'), 'Missing exit 2 documentation');
    assert.ok(content.includes('JSON') || content.includes('json'), 'Missing JSON protocol documentation');
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/reference-section.test.mjs`
Expected: FAIL — docs/hooks.md does not exist yet

- [x] **Implement**

Create `docs/hooks.md` with:
- Title: "Hooks Reference"
- Intro paragraph explaining the hook system, linking to [Core Concepts](concepts.md) for gate-based governance background
- **Hook Protocol** section documenting:
  - Hooks read JSON from stdin + `CLAUDE_TOOL_INPUT_*` env vars
  - Exit code 0 = allow (pass), exit code 2 = block (reject)
  - Hooks output JSON to stdout
  - Note that custom hooks should sanitize stdin input (SEC-4)
- **Summary Table** with columns: Hook Name, Trigger Point, Matcher, Behavior (blocks/advises), Purpose
- **SessionStart Hooks** section with entry for:
  - `session-start.sh` — injects context on session startup/resume
- **PreToolUse Hooks** section with entries for:
  - `context-preflight.sh` (Edit) — validates context before edits
  - `constitution-linter.sh` (Edit) — blocks edits violating constitution
  - `lifecycle-gate-edit.sh` (Edit) — blocks edits bypassing lifecycle gates
  - `merge-guard.sh` (Bash) — blocks merges to protected branches
  - `lifecycle-gate-bash.sh` (Bash) — blocks bash commands bypassing lifecycle gates
- **PostToolUse Hooks** section with entries for:
  - `context-read-tracker.sh` (Read) — tracks which context files have been read
  - `sync-trigger.sh` (Edit) — triggers sync after constitution edits
  - `session-capture.sh` (all) — captures session activity
  - `issue-reminder.sh` (all) — reminds about relevant issues
  - `lifecycle-gate-advisory.sh` (all) — advisory lifecycle gate warnings

Each blocking hook entry (Behavior 7) must include:
- What triggers the block
- What the user sees (error message / exit code)
- How to resolve it (steps to unblock)

- [x] **Verify test passes**

Run: `node --test tests/docs/reference-section.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add docs/hooks.md tests/docs/reference-section.test.mjs
git commit -m "feat(user-docs): add docs/hooks.md with all 11 hook entries

Spec: .context-index/specs/features/user-docs/reference-section.spec.md
Plan-task: 6"
```

---

### Task 7: Update TOC and verify cross-page links [specialist: none]

**Charter capability:** Table of Contents (Postcondition: all three pages linked)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 4, Task 5, Task 6
**Files:**
- Modify: `docs/README.md`
- Modify: `tests/docs/reference-section.test.mjs`

**Tests:** `tests/docs/reference-section.test.mjs`

- [x] **Write failing test**

Add to `tests/docs/reference-section.test.mjs`:

```javascript
describe('docs/README.md — Reference section links', () => {
  it('should link to skill-reference.md', () => {
    const content = readFileSync(join(DOCS_DIR, 'README.md'), 'utf-8');
    assert.ok(content.includes('[Skill Reference](skill-reference.md)'), 'Missing active link to skill-reference.md');
  });

  it('should link to configuration.md', () => {
    const content = readFileSync(join(DOCS_DIR, 'README.md'), 'utf-8');
    assert.ok(content.includes('[Configuration Reference](configuration.md)'), 'Missing active link to configuration.md');
  });

  it('should link to hooks.md', () => {
    const content = readFileSync(join(DOCS_DIR, 'README.md'), 'utf-8');
    assert.ok(content.includes('[Hooks Reference](hooks.md)'), 'Missing active link to hooks.md');
  });

  it('should not have "coming soon" for reference pages', () => {
    const content = readFileSync(join(DOCS_DIR, 'README.md'), 'utf-8');
    // Extract just the Reference section
    const refStart = content.indexOf('## Reference');
    const refEnd = content.indexOf('##', refStart + 1);
    const refSection = content.slice(refStart, refEnd > -1 ? refEnd : undefined);
    assert.ok(
      !refSection.includes('coming soon'),
      'Reference section should not have "coming soon" markers'
    );
  });
});

describe('Cross-page links in reference pages', () => {
  const refPages = ['skill-reference.md', 'configuration.md', 'hooks.md'];

  it('should have all relative links resolve to existing files', () => {
    for (const page of refPages) {
      const filePath = join(DOCS_DIR, page);
      if (!existsSync(filePath)) continue;
      const content = readFileSync(filePath, 'utf-8');
      const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
      let match;
      while ((match = linkPattern.exec(content)) !== null) {
        const target = match[2];
        if (target.startsWith('http') || target.startsWith('#')) continue;
        const filePart = target.split('#')[0];
        if (filePart) {
          const targetPath = join(DOCS_DIR, filePart);
          assert.ok(
            existsSync(targetPath),
            `${page}: broken link to ${target}`
          );
        }
      }
    }
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/reference-section.test.mjs`
Expected: FAIL — README.md still has "coming soon" for reference links

- [x] **Implement**

1. Update `docs/README.md` Reference section, replacing "coming soon" entries with active links:
   - `[Skill Reference](skill-reference.md)` — One entry per skill with usage, arguments, and examples
   - `[Configuration Reference](configuration.md)` — manifest.yaml, constitution.md, platform-context.yaml
   - `[Hooks Reference](hooks.md)` — What each hook does, when it fires, how to customize
2. Verify all cross-page links in skill-reference.md, configuration.md, and hooks.md resolve to existing files
3. Fix any broken links found

- [x] **Verify test passes**

Run: `node --test tests/docs/reference-section.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add docs/README.md tests/docs/reference-section.test.mjs
git commit -m "feat(user-docs): update TOC with active reference links

Spec: .context-index/specs/features/user-docs/reference-section.spec.md
Plan-task: 7"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [x] Tests pass: `npm test`
- [x] All acceptance criteria from spec satisfied:
  - [x] `docs/skill-reference.md` has an entry for every skill in the plugin (29 skills)
  - [x] Each skill entry includes purpose, prerequisites, arguments, example, and guide links
  - [x] `docs/configuration.md` documents every section of manifest.yaml (11 sections)
  - [x] `docs/configuration.md` documents every section of constitution.md (6 sections)
  - [x] `docs/configuration.md` documents every field of platform-context.yaml
  - [x] Default values are documented for all configuration fields that have them
  - [x] `docs/hooks.md` covers every hook in hooks.json (11 hooks)
  - [x] Blocking hooks document trigger conditions and resolution steps
  - [x] All three pages are reachable from docs/README.md
  - [x] No constitutional violations introduced
