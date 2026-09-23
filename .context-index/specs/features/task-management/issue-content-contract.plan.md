<!-- partial_schema: plan@1 -->

# Implementation Plan: Issue Content Contract

> **Methodology:** adev
> **Charter:** .context-index/specs/features/task-management/charter.md
> **Spec:** .context-index/specs/features/task-management/issue-content-contract.spec.md
> **Review:** PASS (2026-08-22)
> **Platform:** none (CLI/plugin), JavaScript (ESM), Node.js, npm, node:test

**Goal:** Surface the Issue data model's existing `notes`, `spec_ref`, and `next_action` fields through `/adev:issues create`'s documented interface, and give `/adev:plan`'s plan-level epic a real `notes` summary — without changing the schema or adding blocking validation.

**Architecture:** All six behaviors are SKILL.md prose changes plus one `lib/issues/interface.mjs`-adjacent behavior (BEH-4's soft warning is skill-level, not a library change — `validateIssue` itself is untouched per the spec's Postconditions). `--spec-ref` and `--next-action` are already-implemented `adev issues create` CLI flags (confirmed live via `adev issues create --help` during `/adev:specify`); the gap is entirely in `skills/issues/SKILL.md` never documenting them. BEH-6 reuses the existing `skills/plan/epic-mode.md` Convention Table by reference, per the spec's Constitution Reference, rather than duplicating branching logic inline. BEH-5 edits the plan-level `createEpic({...})` call at `skills/plan/SKILL.md:828` — left as the existing JS-reference call form (not migrated to the `adev issues epic` CLI verb) because that verb has no `--notes` flag today; migrating the call style is out of this spec's scope.

---

## File Structure

**Create:**
- `tests/skills/issue-content-contract-template.test.mjs` — BEH-1, BEH-2
- `tests/skills/issue-content-contract-spec-ref.test.mjs` — BEH-3
- `tests/skills/issue-content-contract-empty-notes-warning.test.mjs` — BEH-4
- `tests/skills/issue-content-contract-next-action-default.test.mjs` — BEH-6
- `tests/skills/issue-content-contract-epic-notes.test.mjs` — BEH-5

**Modify:**
- `skills/issues/SKILL.md:75-82` — "Create Issue" section (BEH-1, BEH-2, BEH-3, BEH-4, BEH-6)
- `skills/plan/SKILL.md:828` — Step 7 plan-level epic creation call (BEH-5)

**Reference (read, do not modify):**
- `skills/plan/epic-mode.md` — the `next_action` Convention Table BEH-6 reuses by reference
- `lib/issues/interface.mjs` — `validateIssue`, `NOTES_ALIASES`, `resolveNotes` (confirms no schema change; Postconditions invariant)
- `.context-index/specs/features/task-management/issue-content-contract.spec.md` — source spec

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/task-management/issue-content-contract.spec.md` (BEH-1, BEH-2)
- Charter: `.context-index/specs/features/task-management/charter.md` (charter-extension: Issue Content Contract)
- Source files: `skills/issues/SKILL.md` (full read, "Create Issue" section at lines 75-82)
- Sample pattern: `tests/skills/claim-preflight.test.mjs` — architectural test pattern (readFileSync + section-scoped assertions) to follow

### Task 2 Context
- Spec: `.context-index/specs/features/task-management/issue-content-contract.spec.md` (BEH-4, Error Cases row 3)
- Source files: `skills/issues/SKILL.md` (Create Issue section, post-Task-1 state)
- Depends on Task 1's edit landing first (same section)

### Task 3 Context
- Spec: `.context-index/specs/features/task-management/issue-content-contract.spec.md` (BEH-3, Error Cases row 1)
- Source files: `skills/issues/SKILL.md` (Create Issue section)
- CLI verb reference: `adev issues create --help` output — `--spec-ref <path>` already implemented

### Task 4 Context
- Spec: `.context-index/specs/features/task-management/issue-content-contract.spec.md` (BEH-6, Error Cases row 5)
- Source files: `skills/issues/SKILL.md` (Create Issue section), `skills/plan/epic-mode.md` (Convention Table, read-only)
- CLI verb reference: `adev issues create --help` output — `--next-action <text>` already implemented

### Task 5 Context
- Spec: `.context-index/specs/features/task-management/issue-content-contract.spec.md` (BEH-5, Postconditions row 3)
- Source files: `skills/plan/SKILL.md:815-835` (Step 7, "Issue creation (optional, board-granularity only)")
- Constraint: `feature-mode.md`'s `"Charter: <module>"` / `release-mode.md`'s `"Release: <name>"` notes-tag convention must remain byte-identical — this task touches only the standard-mode epic at line 828

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 (all edit `skills/issues/SKILL.md`'s "Create Issue" section)
- Group B (independent): Task 5 (edits `skills/plan/SKILL.md`, no file overlap with Group A)

Group B can run in parallel with Group A.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Content-template prompt for feature/bug creation | medium | unit | — | 1 create, 1 modify |
| 2 | Empty-notes soft warning | small | unit | Task 1 | 1 create, 1 modify |
| 3 | `--spec-ref` pass-through | small | unit | Task 2 | 1 create, 1 modify |
| 4 | Default `next_action` lookup | medium | unit | Task 3 | 1 create, 1 modify |
| 5 | Plan-level epic `notes` summary | small | unit | — | 1 create, 1 modify |

## Strategy Summary

All 5 tasks resolve to `unit` (source: fallback — no `test_strategy` in spec frontmatter, no matching `manifest.yaml` glob for `skills/**/SKILL.md`, no non-unit auto-detection signal in `lib/test-strategies/detection.mjs` for skill-prose paths). Granularity is `per-behavior` (source: manifest, `test_policy.granularity: per-behavior` in `.context-index/manifest.yaml`) — omitted from this table per the backward-compatible rule since every task is `unit`.

---

### Task 1: Content-template prompt for feature/bug creation [specialist: none]

**Charter capability:** Issue Content Contract (charter-extension — not yet a Capability Map row; backfill during this plan's execution per the review's CON-1 suggestion)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/skills/issue-content-contract-template.test.mjs`
- Modify: `skills/issues/SKILL.md:75-82` (Create Issue section)

**Tests:** `tests/skills/issue-content-contract-template.test.mjs` — new suite (BEH-1, BEH-2)

**Context to load:**
- `.context-index/specs/features/task-management/issue-content-contract.spec.md` (BEH-1, BEH-2)
- `tests/skills/claim-preflight.test.mjs` (pattern to follow)

- [ ] **Write failing test**

```javascript
// tests/skills/issue-content-contract-template.test.mjs
//
// Spec: .context-index/specs/features/task-management/issue-content-contract.spec.md
//       BEH-1, BEH-2

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const SKILL = "skills/issues/SKILL.md";
const read = (p) => readFileSync(p, "utf8");

function createIssueSection(md) {
  const start = md.indexOf("### Create Issue");
  assert.notEqual(start, -1, "no Create Issue section found");
  const rest = md.slice(start);
  const end = rest.indexOf("\n### ", 1);
  return end === -1 ? rest : rest.slice(0, end);
}

test("BEH-1: Create Issue section documents the content-template prompt for feature/bug", () => {
  const section = createIssueSection(read(SKILL));
  assert.match(section, /--type (feature\|bug|bug\|feature)/);
  assert.match(section, /Problem\s*\/\s*Intent/i);
  assert.match(section, /Acceptance Criteria/i);
  assert.match(section, /Out of Scope/i);
});

test("BEH-2: Create Issue section exempts --type task from the full template", () => {
  const section = createIssueSection(read(SKILL));
  assert.match(section, /task/i);
  assert.match(section, /one-line|one line/i);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/issue-content-contract-template.test.mjs`
Expected: FAIL — the Create Issue section does not yet mention "Problem / Intent", "Acceptance Criteria", or "Out of Scope".

- [ ] **Implement**

Edit `skills/issues/SKILL.md`'s `### Create Issue` section (lines 75-82) to add, after the existing "Call `create()`..." paragraph:

```markdown
**Content template (BEH-1, BEH-2):** When `--type bug` or `--type feature` is given and no `--notes`/`--body`/`--description` was supplied, prompt the author before creating the issue:

> This is a `<bug|feature>` issue — give it a short body:
> **Problem / Intent:** what's wrong, or what capability is missing, and why it matters
> **Acceptance Criteria:** concrete, checkable outcomes
> **Out of Scope:** what this issue deliberately does not cover

Assemble the three answers into a single `notes` string (the existing `description`/`body` → `notes` alias resolution in `lib/issues/interface.mjs::resolveNotes` handles it unchanged — no new field). When `--type task` (the default) is given, skip this prompt — accept a one-line `--notes` value as-is, since Tasks are typically short and already scoped by a parent Feature's spec.
```

- [ ] **Verify test passes**

Run: `node --test tests/skills/issue-content-contract-template.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch: `feat/task-management/issue-content-contract`

```bash
git add skills/issues/SKILL.md tests/skills/issue-content-contract-template.test.mjs
git commit -m "feat(task-management): prompt for content template on feature/bug issue creation

Spec: .context-index/specs/features/task-management/issue-content-contract.spec.md
Plan-task: 1"
```

---

### Task 2: Empty-notes soft warning [specialist: none]

**Charter capability:** Issue Content Contract
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `tests/skills/issue-content-contract-empty-notes-warning.test.mjs`
- Modify: `skills/issues/SKILL.md` (Create Issue section, post-Task-1 state)

**Tests:** `tests/skills/issue-content-contract-empty-notes-warning.test.mjs` — new suite (BEH-4)

**Context to load:**
- `.context-index/specs/features/task-management/issue-content-contract.spec.md` (BEH-4, Error Cases row 3)

- [ ] **Write failing test**

```javascript
// tests/skills/issue-content-contract-empty-notes-warning.test.mjs
//
// Spec: .context-index/specs/features/task-management/issue-content-contract.spec.md
//       BEH-4

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const SKILL = "skills/issues/SKILL.md";
const read = (p) => readFileSync(p, "utf8");

test("BEH-4: Create Issue section documents the empty-body soft warning, never a block", () => {
  const md = read(SKILL);
  const start = md.indexOf("### Create Issue");
  const rest = md.slice(start);
  const end = rest.indexOf("\n### ", 1);
  const section = end === -1 ? rest : rest.slice(0, end);

  assert.match(section, /was created without a body/i);
  assert.match(section, /adev:issues update.*--notes/);
  // Must document creation succeeding, not being blocked.
  assert.doesNotMatch(section, /block(s|ed)? creation/i);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/issue-content-contract-empty-notes-warning.test.mjs`
Expected: FAIL — no warning text present yet.

- [ ] **Implement**

Append to the "Content template" paragraph added in Task 1:

```markdown
**Empty-body warning (BEH-4):** If the author skips or cancels the prompt above for a `feature`/`bug` issue, still create the issue (creation is never blocked — `validateIssue` is unchanged) and report an additional line after the normal "Created ..." confirmation:

> Issue `<id>` was created without a body. Consider `/adev:issues update <id> --notes "..."` before work starts.
```

- [ ] **Verify test passes**

Run: `node --test tests/skills/issue-content-contract-empty-notes-warning.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/issues/SKILL.md tests/skills/issue-content-contract-empty-notes-warning.test.mjs
git commit -m "feat(task-management): warn (not block) on empty-body feature/bug issue creation

Spec: .context-index/specs/features/task-management/issue-content-contract.spec.md
Plan-task: 2"
```

---

### Task 3: `--spec-ref` pass-through [specialist: none]

**Charter capability:** Issue Content Contract
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Create: `tests/skills/issue-content-contract-spec-ref.test.mjs`
- Modify: `skills/issues/SKILL.md` (Create Issue section, post-Task-2 state)

**Tests:** `tests/skills/issue-content-contract-spec-ref.test.mjs` — new suite (BEH-3)

**Context to load:**
- `.context-index/specs/features/task-management/issue-content-contract.spec.md` (BEH-3, Error Cases row 1)
- `adev issues create --help` output — confirms `--spec-ref <path>` is already implemented

- [ ] **Write failing test**

```javascript
// tests/skills/issue-content-contract-spec-ref.test.mjs
//
// Spec: .context-index/specs/features/task-management/issue-content-contract.spec.md
//       BEH-3

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const SKILL = "skills/issues/SKILL.md";
const read = (p) => readFileSync(p, "utf8");

test("BEH-3: Create Issue section documents --spec-ref pass-through", () => {
  const md = read(SKILL);
  const start = md.indexOf("### Create Issue");
  const rest = md.slice(start);
  const end = rest.indexOf("\n### ", 1);
  const section = end === -1 ? rest : rest.slice(0, end);

  assert.match(section, /--spec-ref/);
  assert.match(section, /spec_ref/);
});

test("Arguments block lists --spec-ref for create", () => {
  const md = read(SKILL);
  const argsStart = md.indexOf("## Arguments");
  const argsEnd = md.indexOf("\n## ", argsStart + 1);
  const args = md.slice(argsStart, argsEnd === -1 ? undefined : argsEnd);
  assert.match(args, /create.*--spec-ref/s);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/issue-content-contract-spec-ref.test.mjs`
Expected: FAIL — `--spec-ref` not yet mentioned anywhere in the skill.

- [ ] **Implement**

1. Update the `## Arguments` line for `create` (line 14) to add `[--spec-ref <path>]`:
   ```markdown
   - `create "<title>" [--type bug|feature|task] [--epic <epic-id>] [--priority 0-4] [--spec-ref <path>] [--next-action <text>]`: create an issue
   ```
2. Add to the Create Issue section:
   ```markdown
   **Traceability (BEH-3):** When `--spec-ref <path>` is provided, or a `spec_ref` can be inferred from the active lifecycle context (e.g. invoked via `/adev:work` immediately after `/adev:specify`), pass it through to `create()` — the field already exists on the `Issue` model (`lib/issues/interface.mjs`). `spec_ref` is a descriptive string, not filesystem-validated.
   ```

- [ ] **Verify test passes**

Run: `node --test tests/skills/issue-content-contract-spec-ref.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/issues/SKILL.md tests/skills/issue-content-contract-spec-ref.test.mjs
git commit -m "feat(task-management): document --spec-ref pass-through on issue create

Spec: .context-index/specs/features/task-management/issue-content-contract.spec.md
Plan-task: 3"
```

---

### Task 4: Default `next_action` lookup [specialist: none]

**Charter capability:** Issue Content Contract
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Create: `tests/skills/issue-content-contract-next-action-default.test.mjs`
- Modify: `skills/issues/SKILL.md` (Create Issue section, post-Task-3 state)

**Tests:** `tests/skills/issue-content-contract-next-action-default.test.mjs` — new suite (BEH-6)

**Context to load:**
- `.context-index/specs/features/task-management/issue-content-contract.spec.md` (BEH-6, Error Cases row 5)
- `skills/plan/epic-mode.md` (Convention Table — read-only, cited by reference)

- [ ] **Write failing test**

```javascript
// tests/skills/issue-content-contract-next-action-default.test.mjs
//
// Spec: .context-index/specs/features/task-management/issue-content-contract.spec.md
//       BEH-6

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const ISSUES_SKILL = "skills/issues/SKILL.md";
const EPIC_MODE = "skills/plan/epic-mode.md";
const read = (p) => readFileSync(p, "utf8");

test("BEH-6: Create Issue section references the epic-mode Convention Table by name, not by re-deriving it", () => {
  const md = read(ISSUES_SKILL);
  const start = md.indexOf("### Create Issue");
  const rest = md.slice(start);
  const end = rest.indexOf("\n### ", 1);
  const section = end === -1 ? rest : rest.slice(0, end);

  assert.match(section, /next_action Convention Table/i);
  assert.match(section, /epic-mode\.md/);
  // Must not duplicate the table's branching logic as an inline script —
  // constitution anti-pattern boundary.
  assert.doesNotMatch(section, /node\s+-e|node\s+--input-type=module\s+-e/);
});

test("Convention Table still exists in epic-mode.md for the reference to resolve", () => {
  const md = read(EPIC_MODE);
  assert.match(md, /next_action Convention Table/i);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/issue-content-contract-next-action-default.test.mjs`
Expected: FAIL (first assertion) — Create Issue section doesn't mention the Convention Table yet.

- [ ] **Implement**

Add to the Create Issue section:

```markdown
**Default `next_action` (BEH-6):** If `--next-action <text>` is not supplied for a newly created `feature` or `task` issue, look up a default from the `next_action` Convention Table in `skills/plan/epic-mode.md`, keyed on `type` and known state (e.g. a `feature` with no `spec_ref` yet gets `"Run /adev:specify --module <module> to author this Feature"`). Substitute real values for any `<token>` in the looked-up string. If no row matches, leave `next_action: null` — this is not an error. An explicit `--next-action` value is always stored verbatim and is never overridden by this lookup.
```

Also update the `## Arguments` create line (already touched in Task 3) — no further change needed there, `--next-action` was already added in Task 3's argument-line edit.

- [ ] **Verify test passes**

Run: `node --test tests/skills/issue-content-contract-next-action-default.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/issues/SKILL.md tests/skills/issue-content-contract-next-action-default.test.mjs
git commit -m "feat(task-management): default next_action from the epic-mode Convention Table

Spec: .context-index/specs/features/task-management/issue-content-contract.spec.md
Plan-task: 4"
```

---

### Task 5: Plan-level epic `notes` summary [specialist: none]

**Charter capability:** Issue Content Contract
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/skills/issue-content-contract-epic-notes.test.mjs`
- Modify: `skills/plan/SKILL.md:828`

**Tests:** `tests/skills/issue-content-contract-epic-notes.test.mjs` — new suite (BEH-5)

**Context to load:**
- `.context-index/specs/features/task-management/issue-content-contract.spec.md` (BEH-5, Postconditions row 3)
- `skills/plan/SKILL.md:815-835` (Step 7 "Issue creation" subsection)

- [ ] **Write failing test**

```javascript
// tests/skills/issue-content-contract-epic-notes.test.mjs
//
// Spec: .context-index/specs/features/task-management/issue-content-contract.spec.md
//       BEH-5

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const PLAN_SKILL = "skills/plan/SKILL.md";
const FEATURE_MODE = "skills/plan/feature-mode.md";
const RELEASE_MODE = "skills/plan/release-mode.md";
const read = (p) => readFileSync(p, "utf8");

function issueCreationSubsection(md) {
  const start = md.indexOf("Issue creation (optional, board-granularity only)");
  assert.notEqual(start, -1, "Issue creation subsection not found");
  const rest = md.slice(start);
  const end = rest.indexOf("\nIf `tasks.backend` is not configured");
  return end === -1 ? rest : rest.slice(0, end);
}

test("BEH-5: standard-mode createEpic() call passes a notes summary, not title+planRef only", () => {
  const section = issueCreationSubsection(read(PLAN_SKILL));
  assert.match(section, /createEpic\(\{\s*title:.*notes:/s);
});

test("Postconditions: feature-mode's Charter: <module> notes tag is unchanged", () => {
  assert.match(read(FEATURE_MODE), /notes: "Charter: <module>"/);
});

test("Postconditions: release-mode's Release: <name> notes tag is unchanged", () => {
  assert.match(read(RELEASE_MODE), /notes: "Release: <release-name>"/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/issue-content-contract-epic-notes.test.mjs`
Expected: FAIL on the first assertion — the standard-mode `createEpic({...})` call at line 828 has no `notes:` key yet. The other two assertions PASS immediately (they pin the unchanged Postconditions invariant, not new behavior).

- [ ] **Implement**

Edit `skills/plan/SKILL.md:828`:

```markdown
1. Create an epic for the plan: call `createEpic({ title: "<plan title>", planRef: "<plan-file-path>", notes: "<one-line summary drawn from the plan document's Goal line>" })` from `lib/issues/registry.mjs` (use `getIssueManager(manifest)` to get the active adapter). The `notes` value is a plain one-line summary — do not reuse the `"Charter: <module>"` / `"Release: <name>"` tag convention from feature-mode / release-mode; those are lookup tags for `/adev:specify` Step 5.6-3 and are unrelated to this plan-level epic.
```

- [ ] **Verify test passes**

Run: `node --test tests/skills/issue-content-contract-epic-notes.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/plan/SKILL.md tests/skills/issue-content-contract-epic-notes.test.mjs
git commit -m "feat(task-management): give plan-level epics a real notes summary

Spec: .context-index/specs/features/task-management/issue-content-contract.spec.md
Plan-task: 5"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

Per `.context-index/governance/gates.yaml`:

- `test` (fast, required, error): `npm test`
- `integration-test` (integration, not required — warning only until issue-590/591/592 close): `npm run test:evals`
- All acceptance criteria from the spec satisfied (see spec's Acceptance Criteria section — 9 items)

`lint` and `typecheck` gates are commented-out templates in `gates.yaml` with no `command:` — not enforced.
