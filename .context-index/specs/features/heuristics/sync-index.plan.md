# Implementation Plan: Sync Index

> **Methodology:** adev
> **Charter:** .context-index/specs/features/heuristics/charter.md
> **Spec:** .context-index/specs/features/heuristics/sync-index.md
> **Review:** PASS_WITH_NOTES (2026-04-23)
> **Platform:** Node.js, JavaScript ESM, node:test

**Goal:** Extend `/adev:sync` to append a `## Learned Lessons` section to all sync targets containing a compact index of high-confidence heuristics.

**Architecture:** Changes are in `skills/sync/SKILL.md` — adding instructions for the sync skill to read heuristics via `retrieveHeuristics` with `tier: 'index'` and render a section. The new section follows the same generation pattern as `## Context Index` and `## Task Management`. Section placement is immediately before `# User Additions`.

---

## File Structure

**Modify:**
- `skills/sync/SKILL.md` — Add `## Learned Lessons` generation instructions

**Create:**
- `tests/skills/sync-heuristic-index.test.mjs` — Tests for section generation

**Reference (read, do not modify):**
- `lib/heuristics.mjs` — `retrieveHeuristics` and `renderHeuristic` APIs

## Context Packets

### Task 1 Context
- Spec: `sync-index.md` (all criteria)
- Charter: `charter.md` (capability: Sync Index)
- Reference: `skills/sync/SKILL.md` (existing sync flow)

## Parallelization

- Sequential: Task 1 only

---

### Task 1: Add Learned Lessons Section to Sync SKILL.md [specialist: none]

**Charter capability:** Sync Index
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/sync/SKILL.md`
- Test: `tests/skills/sync-heuristic-index.test.mjs`

**Tests:** `tests/skills/sync-heuristic-index.test.mjs`

- [ ] **Write failing test**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const skillContent = readFileSync(
  new URL("../../skills/sync/SKILL.md", import.meta.url), "utf8"
);

describe("sync SKILL.md Learned Lessons instructions", () => {
  it("references retrieveHeuristics", () => {
    assert.ok(skillContent.includes("retrieveHeuristics"));
  });
  it("specifies ## Learned Lessons heading", () => {
    assert.ok(skillContent.includes("## Learned Lessons"));
  });
  it("specifies placement before User Additions", () => {
    assert.ok(skillContent.includes("User Additions"));
  });
  it("specifies high-confidence filtering", () => {
    assert.ok(skillContent.includes("high"));
  });
  it("specifies _global sorts last", () => {
    assert.ok(skillContent.includes("_global"));
  });
  it("specifies non-blocking on failure", () => {
    assert.ok(skillContent.includes("proceed without") || skillContent.includes("non-blocking"));
  });
  it("specifies section replacement on re-sync", () => {
    assert.ok(skillContent.includes("replace") || skillContent.includes("replacement"));
  });
  it("specifies 80-character truncation", () => {
    assert.ok(skillContent.includes("80"));
  });
  it("handles cursor and copilot formats", () => {
    assert.ok(skillContent.includes("cursor") || skillContent.includes("cursorrules"));
  });
});
```

- [ ] **Verify test fails** — Run: `node --test tests/skills/sync-heuristic-index.test.mjs`

- [ ] **Implement**

Add to `skills/sync/SKILL.md` after the Task Management section, before "Preserve User Additions":

```markdown
## Learned Lessons (conditional)

After generating all other sections and before preserving User Additions:

1. Read heuristics via inline Node.js:
   ```javascript
   const { retrieveHeuristics, renderHeuristic } = await import('<ADEV_ROOT>/lib/heuristics.mjs');
   const entries = await retrieveHeuristics(projectRoot, null, { tier: 'index' });
   ```
   Filter to `confidence: 'high'` entries only.

2. If no high-confidence entries, skip this section entirely. If a previous
   `## Learned Lessons` section exists in the target, remove it.

3. If entries exist, group by scope alphabetically. `_global` sorts last.
   Render each entry using the index tier format:
   `- <title> (<scope>) — <pattern truncated to 80 chars>`

4. Section placement per format:
   - Claude (CLAUDE.md): immediately before `# User Additions`, after all
     other generated sections including `## Task Management`
   - OpenCode (AGENTS.md): immediately before `# User Additions` or at end
   - Cursor/Copilot: appended at end of synced content

5. On re-sync: detect existing `## Learned Lessons` heading. Replace from
   heading to next `##` heading or EOF. Write fresh section in its place.

6. Non-blocking: if `retrieveHeuristics` throws, log warning and proceed
   without the section. Sync must never fail due to heuristics.
```

- [ ] **Verify test passes** — Run: `node --test tests/skills/sync-heuristic-index.test.mjs`

- [ ] **Commit:** `feat(sync): add Learned Lessons section with heuristic index`

---

## Quality Gates

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied
