# Implementation Plan: Plan Infrastructure Requirements

> **Methodology:** adev
> **Charter:** .context-index/specs/features/test-strategies/charter.md
> **Spec:** .context-index/specs/features/test-strategies/plan-infra-requirements.md
> **Review:** PASS_WITH_NOTES (2026-04-27)
> **Platform:** JavaScript (ESM), Node.js, node:test, npm

**Goal:** Add explicit infrastructure requirements surfacing to the plan and specify skills so that implementation cycles stop defaulting to mock tests and instead surface the accounts, credentials, and pre-provisioned state needed for real tests.

**Architecture:** All changes are markdown instruction edits to SKILL.md files and one template addition. Per the constitution ("Skills are primarily markdown"), no new lib code is required — the plan and specify skills follow the new instructions and emit/collect the infra requirements inline. Tests use static content-presence assertions, following the same pattern as `specify-feature-binding.test.mjs` and `plan-heuristic-injection.test.mjs`.

---

## File Structure

**Create:**
- `tests/templates/live-spec-template.test.mjs` — Assert `infra_requirements:` field exists in template
- `tests/skills/specify-infra-prompt.test.mjs` — Assert specify SKILL.md contains the infra prompt (Step 4.5)
- `tests/skills/plan-infra-requirements.test.mjs` — Assert plan SKILL.md contains infra section emission, format, PLAN_INFRA_UNKNOWN advisory, and reviewer-prompt check

**Modify:**
- `templates/live-spec-template.md` — Add `infra_requirements:` commented block to frontmatter
- `skills/specify/SKILL.md` — Add Step 4.5 (Infrastructure Requirements Prompt) between Step 4 and Step 5
- `skills/plan/SKILL.md` — Extend Strategy Assignment section with infra section emission rules, format definition, derivation logic, non-blocking advisory, and strategy summary update
- `skills/plan/plan-reviewer-prompt.md` — Add infrastructure requirements completeness check to Spec Mode Checks table

**Reference (read, do not modify):**
- `.context-index/specs/features/test-strategies/plan-infra-requirements.md` — Source of truth for all behaviors
- `tests/skills/specify-feature-binding.test.mjs` — Follow this test pattern for specify SKILL.md tests
- `tests/skills/plan-heuristic-injection.test.mjs` — Follow this test pattern for plan SKILL.md tests
- `tests/templates/gates-template.test.mjs` — Follow this test pattern for template tests

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/test-strategies/plan-infra-requirements.md` (Behavior 6: spec-level infra declaration)
- Charter: `.context-index/specs/features/test-strategies/charter.md` (capability: Plan Infrastructure Requirements)
- Reference: `tests/templates/gates-template.test.mjs` (test pattern to follow)
- Reference: `templates/live-spec-template.md` (file to modify)

### Task 2 Context
- Spec: `.context-index/specs/features/test-strategies/plan-infra-requirements.md` (Behavior 5: specify phase integration)
- Charter: `.context-index/specs/features/test-strategies/charter.md` (capability: Plan Infrastructure Requirements)
- Reference: `tests/skills/specify-feature-binding.test.mjs` (test pattern to follow)
- Reference: `skills/specify/SKILL.md` (file to modify — Step 4 / Step 5 boundary)

### Task 3 Context
- Spec: `.context-index/specs/features/test-strategies/plan-infra-requirements.md` (Behaviors 1, 2, 3, 4, 7)
- Charter: `.context-index/specs/features/test-strategies/charter.md` (capability: Plan Infrastructure Requirements)
- Reference: `tests/skills/plan-heuristic-injection.test.mjs` (test pattern to follow)
- Reference: `skills/plan/SKILL.md` (file to modify — Strategy Assignment section)
- Cross-cutting: `.context-index/specs/features/test-strategies/plan-integration.md` (Behavior 4 being amended by Behavior 7)

### Task 4 Context
- Spec: `.context-index/specs/features/test-strategies/plan-infra-requirements.md` (acceptance criterion: plan-reviewer-prompt update)
- Reference: `skills/plan/plan-reviewer-prompt.md` (file to modify — Spec Mode Checks table)

---

## Parallelization

- Group A (independent): Task 1 — `templates/live-spec-template.md`
- Group B (independent): Task 2 — `skills/specify/SKILL.md`
- Group C (sequential): Task 3 → Task 4 — share `tests/skills/plan-infra-requirements.test.mjs` (Task 4 extends it)

Groups A, B, and C are independent of each other. Within Group C, Task 3 must complete before Task 4.
Recommended single-agent order: 1 → 2 → 3 → 4.

---

## Strategy Summary

| Strategy | Tasks | Source |
|----------|-------|--------|
| unit | 4 | fallback |

All tasks touch `skills/` and `templates/` paths — no strategy detection heuristics trigger. All tasks default to `unit` (no external infrastructure needed to test static file content).

---

### Task 1: Add `infra_requirements:` to Live Spec Template [specialist: none]

**Charter capability:** Plan Infrastructure Requirements
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `templates/live-spec-template.md`
- Create: `tests/templates/live-spec-template.test.mjs`

**Tests:** `tests/templates/live-spec-template.test.mjs`

**Context to load:**
- `templates/live-spec-template.md` (current frontmatter structure)
- `tests/templates/gates-template.test.mjs` (test pattern)
- `.context-index/specs/features/test-strategies/plan-infra-requirements.md` Behavior 6 (frontmatter schema)

- [x] **Write failing test**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(__dirname, "..", "..", "templates", "live-spec-template.md");

describe("live-spec-template.md — infra_requirements field", () => {
  const content = readFileSync(TEMPLATE, "utf8");

  it("frontmatter contains infra_requirements field (commented)", () => {
    assert.ok(
      content.includes("infra_requirements"),
      "Template must include infra_requirements field or comment"
    );
  });

  it("frontmatter comment explains infra_requirements is for external systems", () => {
    assert.ok(
      content.includes("infra_requirements") &&
        (content.includes("external") || content.includes("systems") || content.includes("infra")),
      "infra_requirements comment must reference external systems"
    );
  });

  it("template includes security note: env var names only, no actual values", () => {
    assert.ok(
      content.includes("infra_requirements") &&
        (content.includes("names only") || content.includes("no actual values") || content.includes("MUST NOT")),
      "Template must include security note about env var names only"
    );
  });
});
```

- [x] **Verify test fails**

```bash
node --test tests/templates/live-spec-template.test.mjs
```

Expected: FAIL — `Template must include infra_requirements field or comment`

- [x] **Implement**

In `templates/live-spec-template.md`, after the `updated:` field in the frontmatter block, add:

```yaml
# infra_requirements:   # Optional. Declare when this capability touches external systems.
#   systems:
#     - name: "AWS S3"
#       env_vars: [AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION]
#       notes: "Dedicated test account. Scope IAM to specific actions/ARNs."
#   ci_tag: "integration"
# Security: env var NAMES only — never record actual credential values here.
```

- [x] **Verify test passes**

```bash
node --test tests/templates/live-spec-template.test.mjs
```

Expected: PASS

- [x] **Commit**

Branch: `feat/test-strategies/plan-infra-requirements`

```bash
git add templates/live-spec-template.md tests/templates/live-spec-template.test.mjs
git commit -m "feat(test-strategies): add infra_requirements field to live spec template"
```

---

### Task 2: Add Infrastructure Requirements Prompt to specify SKILL.md [specialist: none]

**Charter capability:** Plan Infrastructure Requirements (Behavior 5: Specify phase integration)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/specify/SKILL.md`
- Create: `tests/skills/specify-infra-prompt.test.mjs`

**Tests:** `tests/skills/specify-infra-prompt.test.mjs`

**Context to load:**
- `skills/specify/SKILL.md` (Step 4 and Step 5 boundaries — where Step 4.5 inserts)
- `tests/skills/specify-feature-binding.test.mjs` (test pattern)
- `.context-index/specs/features/test-strategies/plan-infra-requirements.md` Behavior 5 (prompt questions and frontmatter write)

- [x] **Write failing test**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "specify", "SKILL.md");

describe("adev:specify SKILL.md — Infrastructure Requirements Prompt (Behavior 5)", () => {
  it("SKILL.md exists", () => {
    assert.ok(existsSync(SKILL_PATH));
  });

  it("contains Step 4.5 for infrastructure requirements collection", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      c.includes("Step 4.5") || c.includes("Infrastructure Requirements"),
      "Must include Step 4.5 or an Infrastructure Requirements heading"
    );
  });

  it("asks whether capability interacts with external systems", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      c.includes("external system") || c.includes("external systems"),
      "Must ask about external systems"
    );
  });

  it("prompts for env var names only — not actual values", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      c.includes("names only") || c.includes("env var name") || c.includes("MUST NOT") || c.includes("never record actual"),
      "Must instruct: env var names only, never actual credential values"
    );
  });

  it("writes infra_requirements: into spec frontmatter", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      c.includes("infra_requirements"),
      "Must write infra_requirements: field into frontmatter"
    );
  });

  it("supports infra_requirements: unknown when author skips", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      c.includes("infra_requirements: unknown") || c.includes("unknown"),
      "Must support infra_requirements: unknown fallback"
    );
  });

  it("Step 4.5 is placed after Step 4 (Interactive Spec Authoring) and before Step 5 (Write the Spec)", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    const step4Idx = c.indexOf("### Step 4: Interactive Spec Authoring");
    const step45Idx = c.indexOf("Step 4.5");
    const step5Idx = c.indexOf("### Step 5: Write the Spec");
    assert.ok(step4Idx !== -1, "Step 4 must exist");
    assert.ok(step45Idx !== -1, "Step 4.5 must exist");
    assert.ok(step5Idx !== -1, "Step 5 must exist");
    assert.ok(step4Idx < step45Idx, "Step 4.5 must appear after Step 4");
    assert.ok(step45Idx < step5Idx, "Step 4.5 must appear before Step 5");
  });
});
```

- [x] **Verify test fails**

```bash
node --test tests/skills/specify-infra-prompt.test.mjs
```

Expected: FAIL — `Must include Step 4.5 or an Infrastructure Requirements heading`

- [x] **Implement**

In `skills/specify/SKILL.md`, after the `### Step 4: Interactive Spec Authoring` section (specifically after the **Acceptance Criteria** subsection, before `### Step 5: Write the Spec`), insert:

```markdown
### Step 4.5: Infrastructure Requirements Prompt

Before writing the spec, check whether this capability touches any external systems. Ask:

```
→ Does this capability interact with any external systems (cloud APIs, databases, message queues, third-party HTTP services)?
  Examples: AWS S3, Postgres, Stripe API, SQS, Redis, BigQuery
```

**If yes:**
```
→ Which external systems? (list each, e.g. "AWS S3", "Postgres 15")
→ What env vars are needed to connect? (names only — never record actual values)
→ Is any state pre-provisioned (bucket, DB, queue) or created/destroyed by test setup?
→ What IAM / permission scope is needed? (least privilege — avoid wildcards like s3:*)
→ Should these tests be excluded from the default test run? (recommended: yes → ci_tag: integration)
```

Write the answers into the spec frontmatter as `infra_requirements:`:

```yaml
infra_requirements:
  systems:
    - name: "AWS S3"
      env_vars: [AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION]
      notes: "Dedicated test account. IAM scoped to specific actions/ARNs."
  ci_tag: "integration"
```

**Security invariant:** `infra_requirements:` MUST contain only env var NAMES and human-readable guidance. Never record actual credential values, tokens, or connection strings with embedded passwords.

**If the author skips or is unsure:** write `infra_requirements: unknown` and add a comment: `# Fill in before /adev:plan — plan will warn if missing`.

**If the capability has no external systems:** proceed to Step 5 without writing the field.
```

- [x] **Verify test passes**

```bash
node --test tests/skills/specify-infra-prompt.test.mjs
```

Expected: PASS

- [x] **Commit**

```bash
git add skills/specify/SKILL.md tests/skills/specify-infra-prompt.test.mjs
git commit -m "feat(test-strategies): add infra requirements prompt to specify Step 4.5"
```

---

### Task 3: Add Infrastructure Section Emission to plan SKILL.md [specialist: none]

**Charter capability:** Plan Infrastructure Requirements (Behaviors 1, 2, 3, 4, 7)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/plan/SKILL.md`
- Create: `tests/skills/plan-infra-requirements.test.mjs`

**Tests:** `tests/skills/plan-infra-requirements.test.mjs`

**Context to load:**
- `skills/plan/SKILL.md` (Strategy Assignment section — insertion target)
- `tests/skills/plan-heuristic-injection.test.mjs` (test pattern)
- `.context-index/specs/features/test-strategies/plan-infra-requirements.md` (Behaviors 1-4, 7 — full spec)
- `.context-index/specs/features/test-strategies/plan-integration.md` (Behavior 4 — the amendment target for strategy summary)

- [x] **Write failing test**

```javascript
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("plan SKILL.md — infrastructure requirements section (Behaviors 1-4, 7)", () => {
  it("describes ## Test Infrastructure Requirements section emission", async () => {
    const c = await readFile("skills/plan/SKILL.md", "utf8");
    assert.ok(
      c.includes("Test Infrastructure Requirements"),
      "Must reference the ## Test Infrastructure Requirements section"
    );
  });

  it("triggers section on infra_requirements: frontmatter presence OR non-unit strategy", async () => {
    const c = await readFile("skills/plan/SKILL.md", "utf8");
    assert.ok(
      c.includes("infra_requirements") && (c.includes("non-unit") || c.includes("unit strategy")),
      "Trigger must be based on frontmatter presence OR non-unit strategy"
    );
  });

  it("documents PLAN_INFRA_UNKNOWN advisory", async () => {
    const c = await readFile("skills/plan/SKILL.md", "utf8");
    assert.ok(
      c.includes("PLAN_INFRA_UNKNOWN"),
      "Must document PLAN_INFRA_UNKNOWN advisory code"
    );
  });

  it("section is non-blocking — plan completes even when infra unresolved", async () => {
    const c = await readFile("skills/plan/SKILL.md", "utf8");
    assert.ok(
      c.includes("PLAN_INFRA_UNKNOWN") &&
        (c.includes("non-blocking") || c.includes("does not block") || c.includes("Unresolved Requirements")),
      "Must document non-blocking behavior for unresolved infra"
    );
  });

  it("strategy summary includes infrastructure column (amends plan-integration Behavior 4)", async () => {
    const c = await readFile("skills/plan/SKILL.md", "utf8");
    assert.ok(
      c.includes("infrastructure") && c.includes("Strategy Summary"),
      "Strategy Summary must include infrastructure column"
    );
  });

  it("section format specifies External Systems, Credentials, Pre-Provisioned State, CI Configuration", async () => {
    const c = await readFile("skills/plan/SKILL.md", "utf8");
    assert.ok(c.includes("External Systems"), "Must include External Systems subsection");
    assert.ok(c.includes("Credentials") || c.includes("Environment Variables"), "Must include Credentials subsection");
    assert.ok(c.includes("Pre-Provisioned State") || c.includes("Pre-provisioned"), "Must include Pre-Provisioned State subsection");
    assert.ok(c.includes("CI Configuration") || c.includes("ci_tag"), "Must include CI Configuration guidance");
  });

  it("documents the security invariant: no actual credential values in plan output", async () => {
    const c = await readFile("skills/plan/SKILL.md", "utf8");
    assert.ok(
      c.includes("env var") && (c.includes("names only") || c.includes("MUST NOT") || c.includes("no actual")),
      "Must document security invariant: env var names only"
    );
  });

  it("documents low-confidence auto-detection advisory", async () => {
    const c = await readFile("skills/plan/SKILL.md", "utf8");
    assert.ok(
      c.includes("low confidence") || c.includes("low-confidence") || c.includes("confidence"),
      "Must document low-confidence auto-detection advisory"
    );
    assert.ok(
      c.includes("advisory") || c.includes("review and confirm") || c.includes("⚠"),
      "Must indicate advisory/warning is emitted for low-confidence detection"
    );
  });

  it("documents that spec frontmatter infra_requirements: takes precedence over auto-detection", async () => {
    const c = await readFile("skills/plan/SKILL.md", "utf8");
    assert.ok(
      c.includes("infra_requirements") && (
        c.includes("authoritative") ||
        c.includes("takes precedence") ||
        c.includes("skip auto-detection") ||
        c.includes("skip step 3")
      ),
      "Must document that spec frontmatter is authoritative over auto-detection"
    );
  });
});
```

- [x] **Verify test fails**

```bash
node --test tests/skills/plan-infra-requirements.test.mjs
```

Expected: FAIL — `Must reference the ## Test Infrastructure Requirements section`

- [x] **Implement**

In `skills/plan/SKILL.md`, locate the `### Strategy Assignment` section. After the Strategy Summary example (ending with `Omit this section entirely when all tasks resolve to unit`), insert a new `### Infrastructure Requirements Section` block:

```markdown
### Infrastructure Requirements Section

After the Strategy Summary (or in its place when no non-unit strategies exist), check whether the plan needs a `## Test Infrastructure Requirements` section.

**Emission trigger (either condition):**
- The spec frontmatter contains `infra_requirements:` (regardless of strategy), OR
- One or more tasks are assigned a non-unit strategy

When all tasks are `unit` AND the spec has no `infra_requirements:` field, skip this section entirely (backward compatible — no noise for pure unit-test tasks).

**Derivation:**
For each non-unit task (or for all tasks when `infra_requirements:` is in spec frontmatter):
1. Read `infra_requirements:` from spec frontmatter — **if present, use as authoritative source and skip auto-detection**
2. Otherwise, auto-detect from task file paths using file-globbing heuristics (e.g., files under `src/adapters/aws/` → AWS likely needed). No import scanning or content parsing.
3. Deduplicate requirements across tasks, grouped by external system.

When auto-detection confidence is `low`, prepend an advisory: "⚠ Infrastructure requirements auto-detected with low confidence — review and confirm before proceeding."

When `infra_requirements: unknown` is in spec frontmatter, emit `PLAN_INFRA_UNKNOWN` for all tasks in the spec.

**Section format:**

~~~markdown
## Test Infrastructure Requirements

> These requirements must be satisfied before integration/infrastructure tests can run.
> Tasks without these prerequisites will produce setup errors, not test failures.
> **Never record actual credential values in plan output or spec files — env var names only.**

### External Systems

| System | Required By | Strategy |
|--------|-------------|----------|
| AWS S3 | Task 1.2, Task 1.4 | integration |
| Postgres 15 | Task 2.1, Task 2.3 | schema, integration |

### Credentials / Environment Variables

| Variable | Required For | Where to Get It |
|----------|-------------|-----------------|
| `AWS_ACCESS_KEY_ID` | AWS S3 | AWS IAM console — dedicated test account |
| `DATABASE_URL` | Postgres | Provision test DB — inject as CI secret (contains password) |

### Pre-Provisioned State

- [ ] AWS test account with IAM permissions scoped to specific actions and test resource ARNs
- [ ] Postgres 15 instance accessible from test runner

### CI Configuration

These tests are excluded from the default `npm test` run. To execute:
```bash
npm run test:integration
# or: node --test --test-name-pattern "integration"
```

> **Local runs:** Create `.env.test` with credential values. `.env.test` MUST be listed in `.gitignore`.
> In CI, inject credentials as secrets — never hardcode them in workflow files.

### Unresolved Requirements

| Task | Issue | Action Required |
|------|-------|-----------------|
| Task 3.1 | `PLAN_INFRA_UNKNOWN` — external system not identifiable | Declare `infra_requirements:` in spec frontmatter |
~~~

**Non-blocking:** Plan does NOT block when infra requirements are unresolved. It completes the task list and surfaces unresolved items in the `### Unresolved Requirements` table for human review before running `/adev:implement`.

**Strategy Summary update (amends plan-integration Behavior 4):** When this section is emitted, extend the Strategy Distribution summary to include an "infrastructure" column:

~~~
Strategy Distribution:
  unit        ·  8 tasks   (source: fallback)      — no external infra needed
  integration ·  4 tasks   (source: detected/high)  — requires: AWS S3, SQS, Postgres
  schema      ·  2 tasks   (source: detected/high)  — requires: Postgres
  visual      ·  1 task    (source: spec-declared)  — requires: Storybook server (from infra_requirements:)
~~~
```

- [x] **Verify test passes**

```bash
node --test tests/skills/plan-infra-requirements.test.mjs
```

Expected: PASS

- [x] **Commit**

```bash
git add skills/plan/SKILL.md tests/skills/plan-infra-requirements.test.mjs
git commit -m "feat(test-strategies): add infra requirements section emission to plan SKILL.md"
```

---

### Task 4: Add Infrastructure Completeness Check to plan-reviewer-prompt.md [specialist: none]

**Charter capability:** Plan Infrastructure Requirements
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/plan/plan-reviewer-prompt.md`
- Test: `tests/skills/plan-infra-requirements.test.mjs` (extend with one additional assertion)

**Tests:** `tests/skills/plan-infra-requirements.test.mjs`

**Context to load:**
- `skills/plan/plan-reviewer-prompt.md` (current Spec Mode Checks table — insertion target)
- `.context-index/specs/features/test-strategies/plan-infra-requirements.md` (acceptance criterion: plan-reviewer-prompt updated)

**Depends on:** Task 3 (test file already created)

- [x] **Write failing test**

Extend `tests/skills/plan-infra-requirements.test.mjs` with:

```javascript
it("plan-reviewer-prompt.md includes infrastructure requirements completeness check", async () => {
  const c = await readFile("skills/plan/plan-reviewer-prompt.md", "utf8");
  assert.ok(
    c.includes("Infrastructure") || c.includes("infra"),
    "plan-reviewer-prompt must include an infrastructure requirements check"
  );
  assert.ok(
    c.includes("infra_requirements") || c.includes("Test Infrastructure Requirements"),
    "Must reference the infra_requirements field or Test Infrastructure Requirements section"
  );
});
```

- [x] **Verify test fails**

```bash
node --test tests/skills/plan-infra-requirements.test.mjs
```

Expected: FAIL on the new infra reviewer check assertion

- [x] **Implement**

In `skills/plan/plan-reviewer-prompt.md`, in the **Spec Mode Checks** table, add a new row:

```markdown
| **Infrastructure Requirements** | If the plan includes non-unit strategies or the spec has `infra_requirements:`, verify the plan contains a `## Test Infrastructure Requirements` section. If the section is missing but should be present, flag as an issue. If present, verify it lists external systems with owning tasks, env var names (not values), CI run command, and an Unresolved Requirements table if any tasks are `PLAN_INFRA_UNKNOWN`. |
```

- [x] **Verify test passes**

```bash
node --test tests/skills/plan-infra-requirements.test.mjs
```

Expected: PASS (all assertions)

- [x] **Commit**

```bash
git add skills/plan/plan-reviewer-prompt.md
git commit -m "feat(test-strategies): add infra requirements check to plan reviewer prompt"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [x] Tests pass: `npm test`
- [x] All acceptance criteria from spec satisfied:
  - [x] `/adev:specify` prompts for infrastructure requirements (Step 4.5 added)
  - [x] Specify prompt explicitly instructs: env var names only, never actual credential values
  - [x] Spec frontmatter `infra_requirements: unknown` triggers `PLAN_INFRA_UNKNOWN` advisory
  - [x] Plan emits `## Test Infrastructure Requirements` section when spec has `infra_requirements:` OR any non-unit strategy
  - [x] No infrastructure section emitted when all tasks are `unit` AND no `infra_requirements:` in spec (backward compatible)
  - [x] Strategy summary includes "infrastructure" column for non-unit strategies
  - [x] Plan does not block on unresolved infra requirements
  - [x] plan-reviewer-prompt checks infra completeness
- [x] No constitutional violations introduced
