# Implementation Plan: `using-adev` Interactive Help Surface

> **Methodology:** adev
> **Charter:** .context-index/specs/features/setup/charter.md
> **Spec:** .context-index/specs/features/setup/using-adev-help-surface.spec.md
> **Review:** PASS (2026-08-17)
> **Platform:** Node.js (ESM), JavaScript, node:test, npm — CLI tool / plugin

**Goal:** Extend `skills/using-adev/SKILL.md` so it also serves as an on-demand interactive help/Q&A surface — answering "what should I do?" and "how does X work?" questions — without adding a new skill, new code, or a new dependency.

**Architecture:** This is a prose-only change confined to `skills/using-adev/SKILL.md`: broaden the `description` frontmatter's trigger phrases, then add two Q&A-mode sections (conceptual lifecycle explanation that always defers routing to `/adev:work`; and a docs-first/skill-source-fallback lookup for skill-behavior questions) plus their failure-mode handling. Per Constitution Principle 2 ("Skills are primarily markdown"), no companion code is required or added. Verification follows the repo's established drift-guard pattern (`tests/skills/single-front-door-contract.test.mjs`): `node:test` assertions on SKILL.md prose that fail CI if the contract is silently removed, not runtime behavioral tests.

---

## File Structure

**Modify:**
- `skills/using-adev/SKILL.md` — broaden `description` frontmatter (Task 1); add "What should I do?" Q&A section (Task 2); add "How does X work?" Q&A section + failure-mode handling (Task 3)

**Create:**
- `tests/skills/using-adev-trigger-broadening.test.mjs` — drift guard for Task 1
- `tests/skills/using-adev-what-should-i-do.test.mjs` — drift guard for Task 2
- `tests/skills/using-adev-how-does-x-work.test.mjs` — drift guard for Task 3

**Reference (read, do not modify):**
- `tests/skills/single-front-door-contract.test.mjs` — established prose-drift-guard pattern to follow (read helper, structural assertions on SKILL.md content)
- `.context-index/specs/features/setup/charter.md` — Capability Map entry "Interactive onboarding & help Q&A"; Key Behaviors bullets already describe the target prose
- `docs/skill-reference.md`, `docs/cli-reference.md`, `docs/README.md` — referenced by the "How does X work?" mode's docs-first lookup order (named in the SKILL.md prose, not read/modified by this plan)

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/setup/using-adev-help-surface.spec.md` (Invocation Modes, Arguments — trigger broadening requirement)
- Charter: `.context-index/specs/features/setup/charter.md` (capability: Interactive onboarding & help Q&A)
- Source files: `skills/using-adev/SKILL.md` (full read — frontmatter block, lines 1-4)
- Sample: `tests/skills/single-front-door-contract.test.mjs` (drift-guard test pattern — read-only reference for Tasks 1-3)
- Boundary rules: none apply (`.md` prose is not matched by `governance/boundaries.yaml` content-regex rules, which target source code patterns)

### Task 2 Context
- Spec: `.context-index/specs/features/setup/using-adev-help-surface.spec.md` (Output Contract — "What should I do?" mode; Failure Modes — ambiguity row)
- Charter: `.context-index/specs/features/setup/charter.md` (Key Behaviors — "does not perform routing itself... defers to `/adev:work`")
- Source files: `skills/using-adev/SKILL.md` (full read — current "Route Through the Front Door" and "Lifecycle Gates" sections, for placement and to avoid contradicting existing routing-boundary prose)
- Cross-cutting: none — this is a `using-adev`-local behavior, not a cross-cutting concern

### Task 3 Context
- Spec: `.context-index/specs/features/setup/using-adev-help-surface.spec.md` (Output Contract — "How does X work?" mode; Failure Modes — all four rows)
- Charter: `.context-index/specs/features/setup/charter.md` (Key Behaviors — "prefers `docs/*.md`... reads the specific `skills/<name>/SKILL.md` only when the docs don't cover")
- Source files: `skills/using-adev/SKILL.md` (full read, including Task 1 + Task 2 edits already applied), `docs/README.md` (index of end-user docs referenced by name in the new prose)
- Reference: skill table already present in `skills/using-adev/SKILL.md` ("Start here" / "Lifecycle stages" tables) — the "closest matching names" fallback in Failure Modes reuses this existing table, no new list is authored

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 (all three edit the same file, `skills/using-adev/SKILL.md`, so they must run in order to avoid conflicting edits)

No task in this plan can run in parallel with another — single-file scope.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Broaden `using-adev` trigger frontmatter | small | unit | — | 1 create, 1 modify |
| 2 | Add "What should I do?" Q&A mode | small | unit | Task 1 | 1 create, 1 modify |
| 3 | Add "How does X work?" Q&A mode + failure modes | medium | unit | Task 2 | 1 create, 1 modify |

---

## Task Structure

### Task 1: Broaden `using-adev` trigger frontmatter [specialist: none]

**Charter capability:** Interactive onboarding & help Q&A
**Strategy:** unit (source: fallback, confidence: high — plain `node:test` prose assertions, no external infra, consistent with `tests/skills/single-front-door-contract.test.mjs`)
**Files:**
- Modify: `skills/using-adev/SKILL.md:3` (the `description` frontmatter field)
- Test: `tests/skills/using-adev-trigger-broadening.test.mjs`

**Tests:** `tests/skills/using-adev-trigger-broadening.test.mjs` — create (per-behavior granularity: this is the spec's first distinct testable behavior — trigger broadening — and no suite currently covers it)

**Context to load:**
- `.context-index/specs/features/setup/using-adev-help-surface.spec.md` (Invocation Modes table, Arguments section)
- `tests/skills/single-front-door-contract.test.mjs` (pattern: `readFileSync` + `assert.ok(md.includes(...))` structural guard against a `skills/<slug>/SKILL.md`)

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_MD = resolve(__dirname, "..", "..", "skills", "using-adev", "SKILL.md");

function frontmatterDescription() {
  const md = readFileSync(SKILL_MD, "utf8");
  const match = md.match(/^description:\s*"([\s\S]*?)"\s*$/m);
  assert.ok(match, "using-adev SKILL.md must have a description frontmatter field");
  return match[1];
}

test("using-adev description frontmatter triggers on 'what should I do' style questions", () => {
  const description = frontmatterDescription();
  assert.match(description, /what should I do/i);
});

test("using-adev description frontmatter triggers on 'how does X work' style questions", () => {
  const description = frontmatterDescription();
  assert.match(description, /how does .* work/i);
});

test("using-adev description frontmatter keeps the existing 'what skills are available' trigger", () => {
  const description = frontmatterDescription();
  assert.match(description, /what skills are available/i);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/using-adev-trigger-broadening.test.mjs`
Expected: FAIL — the current `description` frontmatter (line 3 of `skills/using-adev/SKILL.md`) does not contain "what should I do" or "how does X work" style phrasing, only "what skills are available", "how does adev work", "what is the adev methodology", "show me the workflow".

- [ ] **Implement**

Edit `skills/using-adev/SKILL.md` line 3 (`description:` frontmatter). Broaden the trigger-phrase list to add the two new question shapes while preserving all existing triggers, e.g.:

```yaml
description: "Gateway skill for the Agentic Development Framework. Injected at session start to establish methodology, available skills, and context routing; also answers on-demand questions during a session. Use when the user asks 'what skills are available', 'how does adev work', 'what is the adev methodology', 'show me the workflow', 'what should I do', 'what should I do next', 'which skill do I need', 'how do I start', 'how does /adev:plan work', or asks how a specific skill or command works."
```

- [ ] **Verify test passes**

Run: `node --test tests/skills/using-adev-trigger-broadening.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch: `feat/setup/using-adev-help-surface`

```bash
git add skills/using-adev/SKILL.md tests/skills/using-adev-trigger-broadening.test.mjs
git commit -m "feat(setup): broaden using-adev trigger frontmatter for help Q&A

Spec: .context-index/specs/features/setup/using-adev-help-surface.spec.md
Plan-task: 1"
```

---

### Task 2: Add "What should I do?" Q&A mode [specialist: none]

**Charter capability:** Interactive onboarding & help Q&A
**Depends on:** Task 1
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/using-adev/SKILL.md` (new section, placed after "The Single Front Door" / before "Lifecycle Gates" — the natural home next to the existing routing-boundary prose)
- Test: `tests/skills/using-adev-what-should-i-do.test.mjs`

**Tests:** `tests/skills/using-adev-what-should-i-do.test.mjs` — create (per-behavior granularity: distinct spec behavior — "What should I do?" mode — separate from Task 1's trigger behavior and Task 3's docs-lookup behavior)

**Context to load:**
- `.context-index/specs/features/setup/using-adev-help-surface.spec.md` (Output Contract — "What should I do?" mode bullets; Failure Modes — "answered with a concrete routing decision" and ambiguity rows)
- `.context-index/specs/features/setup/charter.md` (Key Behaviors: "`/adev:using-adev` does not perform routing itself... defers to `/adev:work`, consistent with `/adev:work`'s charter stating it 'does not replace `using-adev` as the educational gateway.'")
- `skills/using-adev/SKILL.md` (current "Route Through the Front Door" section — new prose must not contradict or duplicate this; it explains lifecycle stages conceptually, distinct from "you must route through a skill before doing work")

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_MD = resolve(__dirname, "..", "..", "skills", "using-adev", "SKILL.md");
const md = () => readFileSync(SKILL_MD, "utf8");

test("using-adev documents a 'What should I do?' Q&A mode", () => {
  assert.match(md(), /What should I do\?/);
});

test("'What should I do?' mode always defers the routing decision to /adev:work", () => {
  const content = md();
  const idx = content.search(/What should I do\?/);
  assert.notEqual(idx, -1);
  const section = content.slice(idx, idx + 1500);
  assert.match(section, /\/adev:work/);
  assert.match(section, /never|does not (perform|decide)/i);
});

test("'What should I do?' mode explains conceptually, not with a concrete routing decision", () => {
  const content = md();
  const idx = content.search(/What should I do\?/);
  const section = content.slice(idx, idx + 1500);
  assert.match(section, /conceptual/i);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/using-adev-what-should-i-do.test.mjs`
Expected: FAIL — `skills/using-adev/SKILL.md` has no "What should I do?" heading or section yet.

- [ ] **Implement**

Add a new `## "What should I do?" Q&A Mode` section to `skills/using-adev/SKILL.md`, placed after `## The Single Front Door` and before `## Lifecycle Gates`. Content per the spec's Output Contract:

```markdown
## "What should I do?" Q&A Mode

When a user asks an orientation or lifecycle-choice question (e.g. "what should I do next", "which skill do I need", "how do I start") outside of session-start injection, answer conceptually:

- Explain the relevant lifecycle stage(s) from the tables above — what each stage does and when it applies.
- **Never perform the routing decision yourself.** Do not tell the user "run `/adev:plan`" as a conclusion — that decision belongs to `/adev:work`.
- Always end by pointing the user to `/adev:work` for the actual routing decision.
- This is a chat-only response: no file writes, no lifecycle events.

If the question is ambiguous between this mode and "How does X work?" below, treat it as "How does X work?" only when a specific skill name or command is named in the question; otherwise treat it as this mode.
```

- [ ] **Verify test passes**

Run: `node --test tests/skills/using-adev-what-should-i-do.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/using-adev/SKILL.md tests/skills/using-adev-what-should-i-do.test.mjs
git commit -m "feat(setup): add 'what should I do' Q&A mode to using-adev

Spec: .context-index/specs/features/setup/using-adev-help-surface.spec.md
Plan-task: 2"
```

---

### Task 3: Add "How does X work?" Q&A mode + failure modes [specialist: none]

**Charter capability:** Interactive onboarding & help Q&A
**Depends on:** Task 2
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/using-adev/SKILL.md` (new section, placed immediately after the Task 2 section)
- Test: `tests/skills/using-adev-how-does-x-work.test.mjs`

**Tests:** `tests/skills/using-adev-how-does-x-work.test.mjs` — create (per-behavior granularity: distinct spec behavior — "How does X work?" mode and its four Failure Modes rows — separate from Tasks 1-2)

**Context to load:**
- `.context-index/specs/features/setup/using-adev-help-surface.spec.md` (Output Contract — "How does X work?" mode bullets; Failure Modes table, all four rows)
- `.context-index/specs/features/setup/charter.md` (Key Behaviors: "prefers `docs/*.md` as the source of truth; it reads the specific `skills/<name>/SKILL.md` only when the docs don't cover the question's level of detail")
- `skills/using-adev/SKILL.md` (existing "Start here" / "Lifecycle stages" tables — reused verbatim as the "closest matching names" list for the skill-not-found failure mode; the `docs/README.md` reference link already present in the file)

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_MD = resolve(__dirname, "..", "..", "skills", "using-adev", "SKILL.md");
const md = () => readFileSync(SKILL_MD, "utf8");

function section() {
  const content = md();
  const idx = content.search(/How does X work\?/);
  assert.notEqual(idx, -1, "using-adev must document a 'How does X work?' Q&A mode");
  return content.slice(idx, idx + 2500);
}

test("using-adev documents a 'How does X work?' Q&A mode", () => {
  assert.match(md(), /How does X work\?/);
});

test("'How does X work?' mode checks docs/*.md before falling back to SKILL.md", () => {
  const s = section();
  assert.match(s, /docs\/\*\.md|docs\/skill-reference\.md/);
  assert.match(s, /fall\s*back/i);
  assert.match(s, /skills\/<name>\/SKILL\.md|skills\/\S+\/SKILL\.md/);
});

test("'How does X work?' mode handles an unknown skill name by listing closest matches", () => {
  const s = section();
  assert.match(s, /not found/i);
  assert.match(s, /closest matching/i);
});

test("'How does X work?' mode documents the ambiguity resolution rule", () => {
  const s = section();
  assert.match(s, /ambiguous/i);
  assert.match(s, /specific skill name/i);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/using-adev-how-does-x-work.test.mjs`
Expected: FAIL — no "How does X work?" section exists yet in `skills/using-adev/SKILL.md`.

- [ ] **Implement**

Add a new `## "How does X work?" Q&A Mode` section to `skills/using-adev/SKILL.md`, immediately after the Task 2 section:

```markdown
## "How does X work?" Q&A Mode

When a user asks about a specific skill's behavior (e.g. "how does `/adev:plan` work", "what does `--refactor` do on `specify`"):

- Check `docs/*.md` first — `docs/skill-reference.md` for per-skill usage and arguments, `docs/cli-reference.md` for CLI verbs, or other files indexed at `docs/README.md`.
- Fall back to reading the actual `skills/<name>/SKILL.md` only when the docs do not cover the needed detail (e.g. exact argument behavior, ask-first prompt wording).
- This is a chat-only response: no file writes, no lifecycle events.

**Failure modes:**

- **Skill not found** — if the named skill does not exist, report that it was not found and list the closest matching names from the skill tables above ("Start here" / "Lifecycle stages").
- **Docs insufficient** — if `docs/*.md` doesn't cover the needed detail, fall back to `skills/<name>/SKILL.md` automatically; this needs no user-visible caveat.
- **Ambiguous question** — if a question could be either "What should I do?" or "How does X work?", answer as "How does X work?" only when a specific skill name is present in the question; otherwise answer as "What should I do?" (see above).
```

- [ ] **Verify test passes**

Run: `node --test tests/skills/using-adev-how-does-x-work.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/using-adev/SKILL.md tests/skills/using-adev-how-does-x-work.test.mjs
git commit -m "feat(setup): add 'how does X work' Q&A mode and failure handling to using-adev

Spec: .context-index/specs/features/setup/using-adev-help-surface.spec.md
Plan-task: 3"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

Per `.context-index/governance/gates.yaml` (fast tier):
- Tests pass: `npm test` (gate `id: test` / `id: quality-gate`, severity: error, triggers: post-task, post-implement)
- All acceptance criteria from the spec satisfied, including the negative constraints ("No new skill is added to `.claude-plugin/plugin.json` or the lifecycle order", "No new code, CLI verb, or external dependency is introduced") — verified by inspection during `/adev:validate`'s spec-compliance check, since this plan makes no changes to `.claude-plugin/plugin.json`, `cli/`, `lib/`, or `package.json`.

No lint or typecheck command is declared in the constitution's Quality Gates section or in `governance/gates.yaml` for this project — `npm test` is the sole deterministic gate at the `fast` tier. The `integration-test` gate (`npm run test:evals`) is unaffected by this plan (no eval-tier files touched).
