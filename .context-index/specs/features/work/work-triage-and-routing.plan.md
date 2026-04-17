# Implementation Plan: Work Triage and Routing

> **Methodology:** adev
> **Charter:** .context-index/specs/features/work/charter.md
> **Spec:** .context-index/specs/features/work/work-triage-and-routing.md
> **Review:** PASS_WITH_NOTES (2026-03-29)
> **Platform:** none (CLI plugin), javascript (ESM), node:test

**Goal:** Create the `/adev:work` skill — a pre-lifecycle triage entry point that classifies incoming work and routes to the correct `/adev:*` skill.

**Architecture:** This is a pure markdown skill following the same pattern as all existing skills (`skills/<name>/SKILL.md` + `providers/codex/skills/<name>/SKILL.md` + `agents/openai.yaml`). No companion code needed. The skill instructs Claude to use Glob/Grep/Read for state detection and LLM judgment for classification. Registration requires updating `manifest.yaml` and the `using-adev` gateway skill.

---

## File Structure

**Create:**
- `skills/work/SKILL.md` — Main skill file (Claude Code provider)
- `providers/codex/skills/work/SKILL.md` — Codex provider copy
- `providers/codex/skills/work/agents/openai.yaml` — OpenAI agent metadata

**Modify:**
- `.context-index/manifest.yaml` — Add `adev:work` module entry
- `skills/using-adev/SKILL.md` — Add `/adev:work` to skill table
- `providers/codex/skills/using-adev/SKILL.md` — Add `/adev:work` to Codex copy of skill table

**Reference (read, do not modify):**
- `.context-index/specs/features/work/work-triage-and-routing.md` — Behavioral contract
- `.context-index/specs/features/work/charter.md` — Charter scope
- `skills/route/SKILL.md` — Existing skill pattern reference
- `skills/status/SKILL.md` — Similar read-only-then-act pattern reference

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/work/work-triage-and-routing.md` (all behaviors)
- Charter: `.context-index/specs/features/work/charter.md` (all capabilities)
- Pattern: `skills/route/SKILL.md` (frontmatter format, section structure)
- Pattern: `skills/status/SKILL.md` (state scanning pattern)

### Task 2 Context
- Spec: `.context-index/specs/features/work/work-triage-and-routing.md` (acceptance criteria 8-9)
- Pattern: `providers/codex/skills/debug/agents/openai.yaml` (openai.yaml format)
- Pattern: `providers/codex/skills/debug/SKILL.md` (codex copy pattern)

### Task 3 Context
- Spec: `.context-index/specs/features/work/work-triage-and-routing.md` (acceptance criteria 8)
- File: `.context-index/manifest.yaml` (modules section)

### Task 4 Context
- Spec: `.context-index/specs/features/work/work-triage-and-routing.md` (acceptance criteria 9)
- File: `skills/using-adev/SKILL.md` (skill table)
- File: `providers/codex/skills/using-adev/SKILL.md` (codex copy)

## Parallelization

- Group A (sequential): Task 1 → Task 2 (Task 2 copies Task 1's output)
- Group B (gate-blocked): Task 3 (requires human approval — do not auto-dispatch)
- Group C (independent): Task 4 (no file overlap with A or B)

Groups B and C can run in parallel with each other and after Task 1 completes.

---

### Task 1: Create SKILL.md [specialist: none]

**Charter capability:** Work Classification, Project State Scan, Route Proposal, Confirmation Flow, Skill Invocation, Init Gate, Resume Detection
**Files:**
- Create: `skills/work/SKILL.md`

**Context to load:**
- `.context-index/specs/features/work/work-triage-and-routing.md` (full behavioral contract)
- `skills/route/SKILL.md` (frontmatter and structure pattern)

- [ ] **Write failing test**

The existing packaging test at `tests/skills/codex-packaging.test.mjs` will fail once the Codex copy is expected. For the Claude Code provider, we verify the skill file exists:

```bash
node -e "
import { existsSync } from 'fs';
import assert from 'assert';
assert.ok(existsSync('skills/work/SKILL.md'), 'SKILL.md should exist');
console.log('PASS');
" 2>&1 || echo "FAIL — file does not exist yet"
```

- [ ] **Verify test fails**

Run: `node -e "import{existsSync}from'fs';import assert from'assert';assert.ok(existsSync('skills/work/SKILL.md'));" 2>&1`
Expected: FAIL — file does not exist

- [ ] **Implement**

Create `skills/work/SKILL.md` with:

1. **Frontmatter:** `name: adev:work`, `description:` matching the charter's business intent
2. **Title:** `# Work Triage and Routing`
3. **Announcement:** "I'm using the adev:work skill to triage your work and route to the right skill."
4. **Arguments:** optional free-text description of work
5. **Prerequisites section:** Check for `.context-index/` — if missing, redirect to `/adev:init` and stop (Behavior 1)
6. **Step 1: Project State Scan** — instructions to run parallel Glob/Grep:
   - Glob `.context-index/specs/features/*/*.plan.md`, grep for `- [ ]` to find incomplete plans
   - Glob `.context-index/specs/features/**/*.md` (excluding charter.md, *.review.md, *.plan.md), check for specs without sibling `.review.md`
   - Glob `.context-index/sessions/*.md`, read 3 most recent by date prefix
   - If in-progress work found, surface it and ask: "Want to resume one of these, or start something new?" (Behavior 3)
   - If nothing found, proceed to classification (Behavior 4)
7. **Step 2: Classify Work** — the full work type classification table from Behavior 5:
   - 9 work types with slugs, signal keywords, and target skills
   - If no description provided, ask classifying question (Behavior 6)
   - If high confidence, propose route directly (Behavior 7)
   - If ambiguous, ask clarifying question with options (Behavior 8)
8. **Step 3: State-Aware Refinement** — override logic:
   - If user says "work on X" and incomplete plan exists for X → route to `/adev:implement` (Behavior 12)
   - If user says "plan X" but specs not reviewed → warn and suggest `/adev:review-specs` (Behavior 13)
9. **Step 4: Route Proposal** — present route with reasoning (Behavior 9):
   - Show target skill, reason, and context to pre-load
   - Wait for confirmation (Behavior 10)
   - If rejected, ask for preference and re-propose (Behavior 11)
10. **Step 5: Invoke Skill** — invoke the target `/adev:*` skill with context arguments
11. **Error Cases section** — table matching spec's error cases (malformed files → visible warning)

- [ ] **Verify test passes**

Run: `node -e "import{existsSync}from'fs';import assert from'assert';assert.ok(existsSync('skills/work/SKILL.md'));" 2>&1`
Expected: PASS

- [ ] **Commit**

Branch: `feat/adev:work/work-triage-and-routing`

```bash
git add skills/work/SKILL.md
git commit -m "feat(adev:work): add work triage and routing skill"
```

---

### Task 2: Create Codex Provider Copy and OpenAI Metadata [specialist: none]

**Charter capability:** (registration/packaging)
**Depends on:** Task 1
**Files:**
- Create: `providers/codex/skills/work/SKILL.md`
- Create: `providers/codex/skills/work/agents/openai.yaml`

- [ ] **Write failing test**

Create the directory without the required files to trigger the codex packaging test:

```bash
mkdir -p providers/codex/skills/work/agents
```

The existing test at `tests/skills/codex-packaging.test.mjs` dynamically discovers all skills in `providers/codex/skills/`. With the directory present but files missing, the test will fail.

- [ ] **Verify test fails**

Run: `npm test`
Expected: FAIL — `adev:work should include SKILL.md` and `adev:work should include agents/openai.yaml`

- [ ] **Implement**

1. Copy `skills/work/SKILL.md` to `providers/codex/skills/work/SKILL.md`
2. Create `providers/codex/skills/work/agents/openai.yaml`:

```yaml
interface:
  display_name: "adev Start"
  short_description: "Triage work and route to the right skill"
  default_prompt: "Use $adev:work to classify my work and route to the correct adev skill."
```

- [ ] **Verify test passes**

Run: `npm test`
Expected: PASS — codex packaging test finds both files for adev:work

- [ ] **Commit**

```bash
git add providers/codex/skills/work/SKILL.md providers/codex/skills/work/agents/openai.yaml
git commit -m "feat(adev:work): add codex provider packaging"
```

---

### Task 3: Register in Manifest [specialist: none] [REQUIRES HUMAN APPROVAL]

**Charter capability:** (registration)
**Files:**
- Modify: `.context-index/manifest.yaml`

> **Gate:** This task adds a new skill to the lifecycle order. Per the constitution's Architecture Boundaries, this requires human approval. `/adev:implement` must pause and confirm with the user before executing this task.

- [ ] **Write failing test**

```bash
grep -q "adev:work" .context-index/manifest.yaml && echo "PASS" || echo "FAIL — adev:work not in manifest"
```

- [ ] **Verify test fails**

Run: `grep -q "adev:work" .context-index/manifest.yaml && echo "PASS" || echo "FAIL"`
Expected: FAIL

- [ ] **Implement**

Add a new module entry to `manifest.yaml` in the `modules` section. Place it before the `design` module (since it's pre-lifecycle):

```yaml
  - slug: triage
    name: Triage
    paths:
      - skills/work/
```

- [ ] **Verify test passes**

Run: `grep -q "adev:work" .context-index/manifest.yaml && echo "PASS" || echo "FAIL"`
Expected: PASS

- [ ] **Commit**

```bash
git add .context-index/manifest.yaml
git commit -m "feat(adev:work): register triage module in manifest"
```

---

### Task 4: Register in using-adev Gateway [specialist: none]

**Charter capability:** (registration)
**Files:**
- Modify: `skills/using-adev/SKILL.md`
- Modify: `providers/codex/skills/using-adev/SKILL.md`

- [ ] **Write failing test**

```bash
grep -q "adev:work" skills/using-adev/SKILL.md && echo "PASS" || echo "FAIL — adev:work not in using-adev"
```

- [ ] **Verify test fails**

Run: `grep -q "adev:work" skills/using-adev/SKILL.md && echo "PASS" || echo "FAIL"`
Expected: FAIL

- [ ] **Implement**

Add `/adev:work` as the first entry in the Available Skills table in both `skills/using-adev/SKILL.md` and `providers/codex/skills/using-adev/SKILL.md`:

```markdown
| `/adev:work` | Triage | Classify incoming work and route to the right skill |
```

Place it before `/adev:init` since it's the universal entry point.

- [ ] **Verify test passes**

Run: `grep -q "adev:work" skills/using-adev/SKILL.md && echo "PASS" || echo "FAIL"`
Expected: PASS

Also verify: `npm test`
Expected: All tests pass

- [ ] **Commit**

```bash
git add skills/using-adev/SKILL.md providers/codex/skills/using-adev/SKILL.md
git commit -m "feat(adev:work): register in using-adev gateway skill"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied:
  - [ ] `skills/work/SKILL.md` exists with all triage, classification, and routing instructions
  - [ ] Init gate for missing `.context-index/`
  - [ ] Parallel Glob/Grep state scan instructions
  - [ ] 9 work type classification table
  - [ ] Route proposal with confirmation flow
  - [ ] Ambiguous case handling with clarifying questions
  - [ ] State-aware routing refinement
  - [ ] Registered in `manifest.yaml`
  - [ ] Listed in `using-adev` gateway skill table (both `skills/` and `providers/codex/skills/` copies)
  - [ ] No constitutional violations
