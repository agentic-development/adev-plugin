# Implementation Plan: Workspace-Aware Strategic Planning

> **Methodology:** adev
> **Charter:** .context-index/specs/features/multi-repo-workspace/charter.md
> **Spec:** .context-index/specs/features/multi-repo-workspace/workspace-aware-vision.spec.md
> **Review:** PASS_WITH_NOTES (2026-04-16)
> **Platform:** Node.js ESM (`.mjs`), `node:test`, npm. Zero-runtime-dependency CLI plugin.

**Goal:** Make `/adev:brainstorm` Step 5b and `/adev:plan --release`/`--milestone` workspace-aware so strategic planning works at the workspace root, synthesising product identity from `workspace.name` + per-repo constitutions, writing milestones to workspace `product.md`, and hardening workspace inputs — while preserving single-repo behaviour verbatim.

**Architecture:** Five new pure helpers land in `lib/workspace.mjs` (path containment, size caps, identity sanitisation, module-name validation, workspace product path). The two SKILL.md files gain workspace-mode branches that delegate to those helpers per the spec's behavioural contract. No new external dependencies. Single-repo flow is preserved because `detectWorkspace()` returning `null` means the new branches never fire. Epic-board sync in workspace mode is unconditionally deferred to the Phase 2 Shared Issue Tracking capability (charter Simplicity attribute forbids a workspace `manifest.yaml`).

**Review PASS_WITH_NOTES warnings addressed inline:**
- **SEC-5** — Task 2 includes a dedicated `next_action` note instructing the implementer to open a follow-up issue for upstream `lib/workspace.mjs` hardening of `detectWorkspace` / `resolveWorkspaceContext`. Task 7 adds an E2E assertion that callers apply `assertPathInWorkspace` before reading sibling content.
- **SEC-6** — Task 2 documents the declaration-order cap behaviour in a code comment so operators know repo ordering in `adev-workspace.yaml` determines inclusion priority.
- **SA-1..SA-4** — Suggestions folded into helper doc comments and SKILL.md text where applicable (no separate task).

---

## File Structure

**Create:**
- `tests/lib/workspace-hardening.test.mjs` — unit tests for the five new helpers
- `tests/skills/brainstorm-workspace-bootstrap.test.mjs` — SKILL.md content assertions for workspace-mode Step 5b
- `tests/skills/plan-workspace-mode.test.mjs` — SKILL.md content assertions for plan Release/Milestone workspace-mode + advisory

**Modify:**
- `lib/workspace.mjs` — add five exports (`assertPathInWorkspace`, `readCappedText` + `MAX_CHARTER_FILES` + `MAX_CHARTER_FILE_BYTES`, `sanitizeIdentityOneLiner`, `validateModuleName`, `resolveWorkspaceProductPath`)
- `skills/brainstorm/SKILL.md` — extend Step 5b section (lines 165-241) with workspace-mode identity prompt, per-repo extraction rule, sanitisation wiring, and supersession note
- `skills/plan/SKILL.md` — update Release Mode (lines 577+) and Milestone Mode (lines 627+) with workspace-mode branches, unconditional epic-sync defer, feature-source annotation, dependency-inheritance rule, module-name validation, and repo-inside-workspace advisory

**Reference (read, do not modify):**
- `.context-index/specs/features/multi-repo-workspace/workspace-aware-vision.spec.md` — target spec (23 behaviours, 23 acceptance criteria)
- `.context-index/specs/features/multi-repo-workspace/charter.md` — charter (rev 4)
- `.context-index/specs/features/multi-repo-workspace/workspace-aware-vision.review.md` — review report (PASS_WITH_NOTES)
- `.context-index/specs/features/design/brainstorm-product-bootstrap.spec.md` — upstream contract (one-question bootstrap, Module Map append rule)
- `.context-index/specs/features/planning/multi-scope-plan.spec.md` — upstream contract (Release Mode, Milestone Mode flows)
- `lib/workspace.mjs` — existing `detectWorkspace`, `resolveWorkspaceContext`, `resolveRef` (do not modify)
- `tests/lib/workspace.test.mjs` — existing helper test patterns
- `tests/skills/brainstorm-bootstrap.test.mjs` — SKILL.md assertion pattern (regex-based)
- `tests/skills/plan-multi-scope.test.mjs` — SKILL.md assertion pattern (regex-based)

---

## Context Packets

### Task 1 Context (path containment + module-name validation)
- Spec: workspace-aware-vision.md (Behaviors 18, 21; AC14, AC17)
- Charter: multi-repo-workspace (capability "Workspace-Aware Product Bootstrap" + Quality Attribute Isolation)
- Files: `lib/workspace.mjs` (current structure), `tests/lib/workspace.test.mjs` (test pattern)

### Task 2 Context (size caps + identity sanitisation + workspace product path)
- Spec: workspace-aware-vision.md (Behaviors 7, 22; AC6, AC18, AC19, AC22)
- Review: workspace-aware-vision.review.md (SEC-5 follow-up note, SEC-6 declaration-order note)

### Task 3 Context (brainstorm Step 5b workspace-mode)
- Spec: workspace-aware-vision.md (Behaviors 4–11; AC1–AC8)
- Upstream: brainstorm-product-bootstrap.md (Step 5b single-question contract — superseded only at preface in workspace mode)
- Files: `skills/brainstorm/SKILL.md` (Step 5b at lines 165-241)

### Task 4 Context (plan Release Mode workspace-mode)
- Spec: workspace-aware-vision.md (Behaviors 12–16; AC9, AC11, AC12, AC15, AC16)
- Upstream: multi-scope-plan.md (Release Mode flow B15-16)
- Sibling: dependency-aware-planning.md (repo-ordering convention `from` depends on `to`)
- Files: `skills/plan/SKILL.md` (Release Mode at line 577+)

### Task 5 Context (plan Milestone Mode workspace-mode)
- Spec: workspace-aware-vision.md (Behaviors 17–20; AC10, AC13, AC15, AC16)
- Upstream: multi-scope-plan.md (Milestone Mode flow B17-18)
- Files: `skills/plan/SKILL.md` (Milestone Mode at line 627+)

### Task 6 Context (advisory + module-name validation wiring)
- Spec: workspace-aware-vision.md (Behaviors 21, 23; AC21)
- Files: `skills/plan/SKILL.md`, `skills/brainstorm/SKILL.md`

### Task 7 Context (end-to-end tests)
- Fixtures: `tests/fixtures/workspace-example/`, `tests/fixtures/workspace-blank/`
- Spec: workspace-aware-vision.md (all acceptance criteria)

---

## Parallelization

- Group A (sequential, all touch `lib/workspace.mjs`): Task 1 → Task 2
- Group B (sequential, all touch `skills/plan/SKILL.md`): Task 4 → Task 5 → Task 6
- Group C (independent, touches `skills/brainstorm/SKILL.md`): Task 3
- Group D (depends on A+B+C): Task 7

Group C may run in parallel with Group B. Group A must complete before B, C, D (helpers are dependencies).

---

## Task 1: Input-Hardening Helpers — Path Containment + Module-Name Validation [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Fully specified path-containment and regex validation helpers with explicit test expectations and a matching golden sample pattern.

**Charter capability:** Workspace-Aware Product Bootstrap + Workspace-Aware Release & Milestone Planning (shared input-hardening behaviours).
**Files:**
- Modify: `lib/workspace.mjs` (append two exports)
- Create: `tests/lib/workspace-hardening.test.mjs` (new file)
**Tests:** `tests/lib/workspace-hardening.test.mjs`

**Context to load:**
- Spec B18, B21, AC14, AC17
- Existing `lib/workspace.mjs` structure for export conventions

- [ ] **Write failing test**

Create `tests/lib/workspace-hardening.test.mjs`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { sep } from "path";
import {
  assertPathInWorkspace,
  validateModuleName,
} from "../../lib/workspace.mjs";

test("assertPathInWorkspace: accepts absolute path inside root", () => {
  const ws = "/ws";
  assert.equal(assertPathInWorkspace(ws, "/ws/repos/api"), `${sep}ws${sep}repos${sep}api`);
});

test("assertPathInWorkspace: accepts relative path inside root", () => {
  assert.equal(assertPathInWorkspace("/ws", "repos/api"), `${sep}ws${sep}repos${sep}api`);
});

test("assertPathInWorkspace: accepts workspace root itself", () => {
  assert.equal(assertPathInWorkspace("/ws", "."), `${sep}ws`);
});

test("assertPathInWorkspace: rejects relative escape (../)", () => {
  assert.throws(
    () => assertPathInWorkspace("/ws", "../etc"),
    /Rejected path escaping workspace root/,
  );
});

test("assertPathInWorkspace: rejects absolute path outside root", () => {
  assert.throws(
    () => assertPathInWorkspace("/ws", "/etc/passwd"),
    /Rejected path escaping workspace root/,
  );
});

test("assertPathInWorkspace: rejects sibling-directory-collision", () => {
  assert.throws(
    () => assertPathInWorkspace("/ws", "../ws-evil/api"),
    /Rejected path escaping workspace root/,
  );
});

test("validateModuleName: accepts alphanumeric + hyphen + underscore", () => {
  assert.equal(validateModuleName("task-boards"), true);
  assert.equal(validateModuleName("task_boards"), true);
  assert.equal(validateModuleName("TaskBoards123"), true);
  assert.equal(validateModuleName("a"), true);
});

test("validateModuleName: rejects empty / slashes / dots / shell chars", () => {
  assert.equal(validateModuleName(""), false);
  assert.equal(validateModuleName("task/boards"), false);
  assert.equal(validateModuleName("task.boards"), false);
  assert.equal(validateModuleName("task boards"), false);
  assert.equal(validateModuleName("task;rm"), false);
  assert.equal(validateModuleName(".."), false);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/workspace-hardening.test.mjs`
Expected: FAIL — `assertPathInWorkspace is not a function` and `validateModuleName is not a function`.

- [ ] **Implement**

Append to `lib/workspace.mjs`:

```javascript
/**
 * Verify that `input` resolves inside `workspaceRoot` and return the normalized
 * absolute path. Throws if the resolved path escapes the root.
 *
 * Implements Behavior 21 (Input Hardening) of workspace-aware-vision spec.
 * Callers must invoke this on any field derived from adev-workspace.yaml
 * (repo paths, fields interpolated into dir names) before reading files.
 *
 * @param {string} workspaceRoot - Absolute path to workspace root.
 * @param {string} input - Path to validate (absolute or relative).
 * @returns {string} Normalized absolute path contained within workspaceRoot.
 * @throws {Error} PATH_ESCAPE — input resolves outside workspaceRoot.
 */
export function assertPathInWorkspace(workspaceRoot, input) {
  const root = resolve(workspaceRoot);
  const resolved = resolve(root, input);
  if (resolved === root || resolved.startsWith(root + sep)) {
    return resolved;
  }
  const err = new Error(
    `Rejected path escaping workspace root: ${input} → ${resolved}`,
  );
  err.code = "PATH_ESCAPE";
  throw err;
}

/**
 * Validate a module-name token against [a-zA-Z0-9_-]+.
 * Used by /adev:plan --milestone feature-list parsing to reject tokens
 * containing path separators, shell metacharacters, or other hazardous chars
 * before any filesystem lookup (Behavior 18).
 *
 * @param {string} token
 * @returns {boolean}
 */
export function validateModuleName(token) {
  if (typeof token !== "string" || token.length === 0) return false;
  return /^[a-zA-Z0-9_-]+$/.test(token);
}
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/workspace-hardening.test.mjs`
Expected: PASS (8 tests).

- [ ] **Commit**

Branch (if not already created): `feat/multi-repo-workspace/workspace-aware-planning`

```bash
git add lib/workspace.mjs tests/lib/workspace-hardening.test.mjs
git commit -m "feat(multi-repo-workspace): add path-containment + module-name validation helpers

Implements Behaviors 18 and 21 of workspace-aware-vision spec.
- assertPathInWorkspace: path.resolve + containment check, throws PATH_ESCAPE
- validateModuleName: regex guard [a-zA-Z0-9_-]+

Refs: issue-65"
```

---

## Task 2: Bootstrap Helpers — Size Caps + Identity Sanitisation + Workspace Product Path [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Well-specified sanitisation and size-cap helpers following the established lib module pattern; minor novelty from ANSI stripping logic.

**Charter capability:** Workspace-Aware Product Bootstrap (helpers consumed by brainstorm Step 5b).
**Depends on:** Task 1 (same file; serial).
**Files:**
- Modify: `lib/workspace.mjs` (append three more exports + two constants)
- Modify: `tests/lib/workspace-hardening.test.mjs` (add test cases)
**Tests:** `tests/lib/workspace-hardening.test.mjs`

**Context to load:**
- Spec B7, B22, AC6, AC18, AC19, AC22
- Review SEC-5 follow-up note, SEC-6 declaration-order note

- [ ] **Write failing test**

Append to `tests/lib/workspace-hardening.test.mjs`:

```javascript
import {
  sanitizeIdentityOneLiner,
  readCappedText,
  resolveWorkspaceProductPath,
  MAX_CHARTER_FILES,
  MAX_CHARTER_FILE_BYTES,
} from "../../lib/workspace.mjs";
import { writeFileSync, mkdtempSync } from "fs";
import { join, sep as PSEP } from "path";
import { tmpdir } from "os";

test("sanitizeIdentityOneLiner: strips control chars and ANSI CSI", () => {
  const input = "\x1b[31mHello\x1b[0m \x00world\x07 and\ttab";
  const result = sanitizeIdentityOneLiner(input);
  assert.equal(result, "Hello world andtab");
});

test("sanitizeIdentityOneLiner: truncates to 200 chars with ellipsis", () => {
  const input = "a".repeat(250);
  const result = sanitizeIdentityOneLiner(input);
  assert.equal(result.length, 201); // 200 chars + ellipsis
  assert.equal(result.endsWith("…"), true);
});

test("sanitizeIdentityOneLiner: empty/undefined input returns empty string", () => {
  assert.equal(sanitizeIdentityOneLiner(""), "");
  assert.equal(sanitizeIdentityOneLiner(undefined), "");
  assert.equal(sanitizeIdentityOneLiner(null), "");
});

test("sanitizeIdentityOneLiner: preserves Unicode non-control text", () => {
  assert.equal(sanitizeIdentityOneLiner("héllo wörld"), "héllo wörld");
});

test("readCappedText: returns content under cap", () => {
  const dir = mkdtempSync(join(tmpdir(), "cap-"));
  const file = join(dir, "small.md");
  writeFileSync(file, "hello");
  const result = readCappedText(file, 1024);
  assert.equal(result.content, "hello");
  assert.equal(result.truncated, false);
});

test("readCappedText: returns null + truncated on oversize", () => {
  const dir = mkdtempSync(join(tmpdir(), "cap-"));
  const file = join(dir, "big.md");
  writeFileSync(file, "x".repeat(2048));
  const result = readCappedText(file, 1024);
  assert.equal(result.content, null);
  assert.equal(result.truncated, true);
  assert.match(result.warning, /exceeds .* cap/);
});

test("MAX_CHARTER_FILES exported as 200", () => {
  assert.equal(MAX_CHARTER_FILES, 200);
});

test("MAX_CHARTER_FILE_BYTES exported as 512 * 1024", () => {
  assert.equal(MAX_CHARTER_FILE_BYTES, 512 * 1024);
});

test("resolveWorkspaceProductPath: returns product.md path", () => {
  const expected = `${PSEP}ws${PSEP}.context-index${PSEP}specs${PSEP}product.md`;
  assert.equal(resolveWorkspaceProductPath("/ws"), expected);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/workspace-hardening.test.mjs`
Expected: FAIL — imports `sanitizeIdentityOneLiner`, `readCappedText`, `resolveWorkspaceProductPath`, `MAX_CHARTER_FILES`, `MAX_CHARTER_FILE_BYTES` all undefined.

- [ ] **Implement**

Append to `lib/workspace.mjs`:

```javascript
/**
 * Maximum number of charter files read in a single workspace-mode invocation.
 * See Behavior 22 of workspace-aware-vision spec.
 *
 * Note: truncation is declaration-order-based (workspace charters first, then
 * repos in adev-workspace.yaml declaration order). Operators should order
 * repos deliberately — declaration order determines inclusion priority when
 * the cap is exceeded.
 */
export const MAX_CHARTER_FILES = 200;

/** Maximum bytes per charter or constitution file read by workspace-mode code. */
export const MAX_CHARTER_FILE_BYTES = 512 * 1024;

/**
 * Strip control characters (0x00-0x1F, 0x7F) and ANSI CSI sequences, then
 * truncate to `maxChars` UTF-8 characters appending an ellipsis on truncation.
 * Used by brainstorm Step 5b to sanitise per-repo identity one-liners before
 * inclusion in the Vision prompt (Behavior 7 of workspace-aware-vision spec).
 *
 * @param {string | null | undefined} text
 * @param {number} maxChars - Default 200.
 * @returns {string}
 */
export function sanitizeIdentityOneLiner(text, maxChars = 200) {
  if (typeof text !== "string" || text.length === 0) return "";
  // Strip ANSI CSI sequences: ESC [ ... letter
  let cleaned = text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
  // Strip control chars 0x00-0x1F (except allowable: none — prompt context),
  // and 0x7F (DEL).
  cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, "");
  const chars = Array.from(cleaned); // split by code point for Unicode safety
  if (chars.length > maxChars) {
    return chars.slice(0, maxChars).join("") + "…";
  }
  return cleaned;
}

/**
 * Read a file with a byte-size cap. Returns `{ content, truncated, warning }`.
 * Used by workspace-mode code to read per-repo constitutions and charter
 * files without exposing the CLI to unbounded memory consumption from
 * crafted workspace contents (Behavior 22).
 *
 * @param {string} filePath
 * @param {number} maxBytes - Default MAX_CHARTER_FILE_BYTES.
 * @returns {{ content: string | null, truncated: boolean, warning?: string }}
 */
export function readCappedText(filePath, maxBytes = MAX_CHARTER_FILE_BYTES) {
  let stat;
  try {
    stat = statSync(filePath);
  } catch (err) {
    return { content: null, truncated: false, warning: err.message };
  }
  if (stat.size > maxBytes) {
    return {
      content: null,
      truncated: true,
      warning: `Skipping '${filePath}': exceeds ${maxBytes} byte cap.`,
    };
  }
  try {
    return { content: readFileSync(filePath, "utf8"), truncated: false };
  } catch (err) {
    return { content: null, truncated: false, warning: err.message };
  }
}

/**
 * Return the absolute path of the workspace's product.md file.
 * Used by brainstorm Step 5b and plan release/milestone modes to read/write
 * the workspace-level product.md consistently (spec AC22).
 *
 * @param {string} workspaceRoot
 * @returns {string}
 */
export function resolveWorkspaceProductPath(workspaceRoot) {
  return join(workspaceRoot, ".context-index", "specs", "product.md");
}
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/workspace-hardening.test.mjs`
Expected: PASS (17 tests total after adding the 9 new cases).

- [ ] **Commit**

```bash
git add lib/workspace.mjs tests/lib/workspace-hardening.test.mjs
git commit -m "feat(multi-repo-workspace): add size caps, identity sanitiser, product-path helper

Implements Behaviors 7 and 22 and AC22 of workspace-aware-vision spec.
- MAX_CHARTER_FILES=200, MAX_CHARTER_FILE_BYTES=512KB constants
- sanitizeIdentityOneLiner: strips ANSI CSI + control chars, truncates to 200
- readCappedText: byte-capped file read with { content, truncated, warning }
- resolveWorkspaceProductPath: <ws>/.context-index/specs/product.md

Follow-up (SEC-5): upstream hardening of detectWorkspace / resolveWorkspaceContext
tracked as separate workspace-foundation revision.

Refs: issue-65"
```

---

## Task 3: Brainstorm Step 5b — Workspace-Mode Identity Prompt [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=3
**Rationale:** Detailed behavioral contract with explicit prompt text and extraction rules; novelty from composing workspace branching + identity synthesis + Module Map scoping in one SKILL.md edit.

**Charter capability:** Workspace-Aware Product Bootstrap.
**Depends on:** Task 2 (sanitizeIdentityOneLiner, resolveWorkspaceProductPath).
**Files:**
- Modify: `skills/brainstorm/SKILL.md` (Step 5b section, lines 165-241)
- Create: `tests/skills/brainstorm-workspace-bootstrap.test.mjs`
**Tests:** `tests/skills/brainstorm-workspace-bootstrap.test.mjs`

**Context to load:**
- Spec Behaviors 4–11 and AC1–AC8
- `@design/brainstorm-product-bootstrap` (existing single-question contract)
- Existing `skills/brainstorm/SKILL.md` Step 5b (lines 165-241) and Workspace Root Handling (lines 30-43)
- Test pattern from `tests/skills/brainstorm-bootstrap.test.mjs`

- [ ] **Write failing test**

Create `tests/skills/brainstorm-workspace-bootstrap.test.mjs`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = resolve(__dirname, "../../skills/brainstorm/SKILL.md");
const skill = readFileSync(SKILL_PATH, "utf8");

test("brainstorm SKILL.md: Step 5b references workspace-mode branching", () => {
  assert.match(skill, /workspace mode/i);
  assert.match(skill, /detectWorkspace/);
});

test("brainstorm SKILL.md: workspace-mode project name falls back to workspace dirname", () => {
  assert.match(skill, /workspace\.name/);
  assert.match(skill, /workspace root (?:basename|dirname|directory name)/i);
});

test("brainstorm SKILL.md: workspace-mode Vision prompt augments with per-repo identity", () => {
  assert.match(skill, /coordinates <N> repos/);
  assert.match(skill, /Identity/);
});

test("brainstorm SKILL.md: identity extraction fallback rule documented", () => {
  // ## Identity section → body first sentence → "no constitution"
  assert.match(skill, /## Identity/);
  assert.match(skill, /no constitution/);
});

test("brainstorm SKILL.md: identity one-liners sanitised before display", () => {
  assert.match(skill, /sanitizeIdentityOneLiner|strip.*control char|ANSI/i);
});

test("brainstorm SKILL.md: Module Map in workspace mode is workspace-charter-only", () => {
  assert.match(skill, /workspace.charter.*only|workspace-charter rows only|workspace charters only/i);
});

test("brainstorm SKILL.md: supersession note to brainstorm-product-bootstrap B3", () => {
  assert.match(skill, /supersed/i);
  assert.match(skill, /single.question/i);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/brainstorm-workspace-bootstrap.test.mjs`
Expected: FAIL on most assertions — the SKILL.md does not yet contain the workspace-mode Step 5b instructions.

- [ ] **Implement**

Edit `skills/brainstorm/SKILL.md`. Add a new subsection inside Step 5b (between Step 5b-3 "Write product.md" and 5b-4 "Module Map Append"), titled **5b-3a: Workspace-Mode Adjustments**, with content specifying:

- When invoked at a workspace root (per Workspace Root Handling section), the globbing path for first-charter detection is `<workspaceRoot>/.context-index/specs/features/*/charter.md` and the write path is `resolveWorkspaceProductPath(workspaceRoot)` (from `lib/workspace.mjs`).
- Project name resolution: prefer `workspace.name` from `adev-workspace.yaml`; fall back to the workspace root directory basename when `workspace.name` is absent. **No workspace-level `constitution.md` is required.**
- **Augmented Vision prompt** (supersedes single-question contract from `@design/brainstorm-product-bootstrap` Behavior 3 — still ONE question, only the preface changes):

      ```
      This is the first workspace-level charter. The workspace '<name>' currently
      coordinates <N> repos:
        - <slug>: <identity one-liner>
        - ...
      What is the workspace trying to do, in one sentence? (This becomes the
      workspace product vision.)
      ```

- **Identity extraction rule** per registered repo (applied in this order, stopping at the first success):
  1. First sentence of the `## Identity` section of the repo's `.context-index/constitution.md`
  2. If no `## Identity` section exists, first sentence of the constitution body (text after frontmatter and title)
  3. If the file is absent or empty, literal `no constitution`
- **Sanitisation:** before including an identity one-liner in the prompt, call `sanitizeIdentityOneLiner(raw)` from `lib/workspace.mjs` (strips control chars `\x00-\x1F`, `\x7F`, and ANSI CSI sequences; truncates to 200 UTF-8 chars with ellipsis `…` on overflow).
- **Missing repo path:** if `detectWorkspace` flagged `missing: true` OR `assertPathInWorkspace(workspaceRoot, repoPath)` threw, skip the repo silently in the summary; other repos continue.
- **Module Map:** in workspace mode the Module Map table contains workspace-level charter rows **only** (per-repo charters are not mixed in — each repo retains its own `product.md`).
- **`--no-bootstrap`:** suppresses Step 5b at the workspace root identically to single-repo mode.

- [ ] **Verify test passes**

Run: `node --test tests/skills/brainstorm-workspace-bootstrap.test.mjs`
Expected: PASS (7 assertions).

- [ ] **Commit**

```bash
git add skills/brainstorm/SKILL.md tests/skills/brainstorm-workspace-bootstrap.test.mjs
git commit -m "feat(multi-repo-workspace): workspace-mode Step 5b in /adev:brainstorm

Implements Behaviors 4-11 and AC1-AC8 of workspace-aware-vision spec.
Step 5b in workspace mode: globbing + write paths workspace-root-scoped,
Vision prompt augmented with per-repo identity one-liners (sanitised
via sanitizeIdentityOneLiner), identity extraction falls through
## Identity → body → 'no constitution'. Module Map remains
workspace-charter-only. Single-repo behaviour unchanged.

Refs: issue-65"
```

---

## Task 4: Plan Release Mode — Workspace-Mode Branching [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=3
**Rationale:** Comprehensive spec coverage with explicit behavioral contracts; reduced pattern score (no golden sample for SKILL.md workspace branching) and novelty from non-transitive dependency inheritance + three-source edge assembly.

**Charter capability:** Workspace-Aware Release & Milestone Planning.
**Depends on:** Task 1 (`assertPathInWorkspace`, `validateModuleName`), Task 2 (`resolveWorkspaceProductPath`, `readCappedText`, cap constants).
**Files:**
- Modify: `skills/plan/SKILL.md` (Release Mode section starting around line 577)
- Create: `tests/skills/plan-workspace-mode.test.mjs`
**Tests:** `tests/skills/plan-workspace-mode.test.mjs`

**Context to load:**
- Spec Behaviors 12–16, AC9, AC11, AC12, AC15, AC16
- `@planning/multi-scope-plan` Release Mode contract
- `dependency-aware-planning.md` (`from` depends on `to` convention)

- [ ] **Write failing test**

Create `tests/skills/plan-workspace-mode.test.mjs`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = resolve(__dirname, "../../skills/plan/SKILL.md");
const skill = readFileSync(SKILL_PATH, "utf8");

test("plan SKILL.md: Release Mode branches on workspace detection", () => {
  const section = skill.slice(skill.indexOf("## Release Mode"));
  assert.match(section, /detectWorkspace/);
  assert.match(section, /workspace mode/i);
});

test("plan SKILL.md: Release Mode reads workspace product.md via resolveWorkspaceProductPath", () => {
  const section = skill.slice(skill.indexOf("## Release Mode"));
  assert.match(section, /resolveWorkspaceProductPath/);
});

test("plan SKILL.md: Release Mode feature list annotates source (workspace|repo-slug)", () => {
  const section = skill.slice(skill.indexOf("## Release Mode"));
  assert.match(section, /workspace\/<module>/);
  assert.match(section, /<repo-slug>\/<module>/);
});

test("plan SKILL.md: Release Mode documents non-transitive inheritance rule", () => {
  const section = skill.slice(skill.indexOf("## Release Mode"));
  assert.match(section, /inherit/i);
  assert.match(section, /NOT transitive|non-transitive/i);
});

test("plan SKILL.md: Release Mode reads dependency graph via resolveWorkspaceContext", () => {
  const section = skill.slice(skill.indexOf("## Release Mode"));
  assert.match(section, /resolveWorkspaceContext/);
});

test("plan SKILL.md: Release Mode unconditionally defers epic create() in workspace mode", () => {
  const section = skill.slice(skill.indexOf("## Release Mode"));
  assert.match(section, /skip.*create\(\)|unconditionally defer|unconditionally skip/i);
  assert.match(section, /Shared Issue Tracking|Phase 2/);
});

test("plan SKILL.md: Release Mode applies path containment + size caps to charter reads", () => {
  const section = skill.slice(skill.indexOf("## Release Mode"));
  assert.match(section, /assertPathInWorkspace/);
  assert.match(section, /readCappedText|MAX_CHARTER_FILES|MAX_CHARTER_FILE_BYTES/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/plan-workspace-mode.test.mjs`
Expected: FAIL — Release Mode has no workspace-mode instructions yet.

- [ ] **Implement**

Edit `skills/plan/SKILL.md`. Inside the Release Mode section (around line 577), add a subsection titled **Release Mode — Workspace-Mode Branching**, placed before the existing Release Mode Flow steps (so it is the first decision). Content:

- At Step 1 (product.md read), call `detectWorkspace(cwd)`. If non-null AND `currentRepoSlug === null`, enter workspace-mode branch below. Otherwise use the existing repo-mode flow unchanged.
- **Workspace-mode Step 1:** read `resolveWorkspaceProductPath(workspaceRoot)` for the milestone section matching `<release-name>`. If no match, prompt as in repo mode.
- **Workspace-mode Step 2 (feature list):** build the feature list by globbing:
  - Workspace-level charters: `<workspaceRoot>/.context-index/specs/features/*/charter.md`
  - Per-repo charters via `resolveWorkspaceContext(...).siblingRepos[]`: for each sibling repo, glob `<contextPath>/specs/features/*/charter.md`. Apply `assertPathInWorkspace(workspaceRoot, repo.path)` before reading; on `PATH_ESCAPE`, skip the repo with warning. Apply `readCappedText(file, MAX_CHARTER_FILE_BYTES)` per file. Stop after `MAX_CHARTER_FILES` files loaded in declaration order and warn.
  - Annotate each feature entry as `workspace/<module>` or `<repo-slug>/<module>`. **The annotation is display-only in the plan text — not persisted to work-item frontmatter** (avoids conflict with `target-repo` frontmatter convention from `workspace-charters` Behavior 2).
- **Workspace-mode Step 3 (dependency graph):** edges from three sources, read via `resolveWorkspaceContext(...).dependencyGraph` (do NOT re-parse `adev-workspace.yaml`):
  1. Each feature charter's `Dependencies` table
  2. Each feature's specs' `depends-on` frontmatter (cross-repo-aware per `cross-repo-references` spec)
  3. Workspace repo-to-repo edges
- **Inheritance rule:** a workspace edge `{ from: A, to: B }` contributes Feature-level edges from every Feature in repo A to every Feature in repo B. Additive (does not replace explicit spec-level `depends-on`). **NOT transitive** — direct edges only.
- **Workspace-mode Step 4 (topo-sort):** tie-breakers: (a) upstream repo order from the workspace dependency graph, (b) declaration order in workspace `product.md`. Cycles (including those produced by inheritance) fall back to declaration order with a warning, matching single-repo behaviour.
- **Workspace-mode Step 5 (epic creation):** skip epic-board `create()` calls **unconditionally**. Persist the release plan to workspace `product.md` only. Print:

      ```
      Release plan for '<name>' written to workspace product.md only.
      Workspace-level issue-board sync is deferred to the Shared Issue Tracking
      capability (Phase 2). See multi-repo-workspace charter Deferred Capabilities.
      ```

- [ ] **Verify test passes**

Run: `node --test tests/skills/plan-workspace-mode.test.mjs`
Expected: PASS for the 7 Release Mode assertions (later tasks will add more tests to this file).

- [ ] **Commit**

```bash
git add skills/plan/SKILL.md tests/skills/plan-workspace-mode.test.mjs
git commit -m "feat(multi-repo-workspace): workspace-mode branch in /adev:plan Release Mode

Implements Behaviors 12-16 and AC9, AC11, AC12, AC15, AC16 of
workspace-aware-vision spec. At workspace root, Release Mode reads
workspace product.md, builds feature list from workspace + repo
charters (display-only source annotation), applies non-transitive
dependency inheritance rule, and skips epic create() unconditionally
(deferred to Phase 2 Shared Issue Tracking per charter Simplicity
quality attribute).

Refs: issue-65"
```

---

## Task 5: Plan Milestone Mode — Workspace-Mode Branching [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Mirrors Task 4's pattern with simpler scope; feature name parsing and disambiguation are well-specified with explicit error codes.

**Charter capability:** Workspace-Aware Release & Milestone Planning.
**Depends on:** Task 1 (`validateModuleName`), Task 2 (`resolveWorkspaceProductPath`), Task 4 (same file).
**Files:**
- Modify: `skills/plan/SKILL.md` (Milestone Mode section around line 627)
- Modify: `tests/skills/plan-workspace-mode.test.mjs` (append Milestone Mode assertions)
**Tests:** `tests/skills/plan-workspace-mode.test.mjs`

**Context to load:**
- Spec Behaviors 17–20, AC10, AC13, AC15, AC16
- `@planning/multi-scope-plan` Milestone Mode contract

- [ ] **Write failing test**

Append to `tests/skills/plan-workspace-mode.test.mjs`:

```javascript
test("plan SKILL.md: Milestone Mode branches on workspace detection", () => {
  const section = skill.slice(
    skill.indexOf("## Milestone Mode"),
    skill.indexOf("## Epic Mode"),
  );
  assert.match(section, /detectWorkspace/);
  assert.match(section, /workspace mode/i);
});

test("plan SKILL.md: Milestone Mode reads workspace product.md", () => {
  const section = skill.slice(
    skill.indexOf("## Milestone Mode"),
    skill.indexOf("## Epic Mode"),
  );
  assert.match(section, /resolveWorkspaceProductPath/);
});

test("plan SKILL.md: Milestone Mode validates module-name tokens", () => {
  const section = skill.slice(
    skill.indexOf("## Milestone Mode"),
    skill.indexOf("## Epic Mode"),
  );
  assert.match(section, /validateModuleName/);
  assert.match(section, /INVALID_MODULE_NAME/);
});

test("plan SKILL.md: Milestone Mode prompts for ambiguous module names", () => {
  const section = skill.slice(
    skill.indexOf("## Milestone Mode"),
    skill.indexOf("## Epic Mode"),
  );
  assert.match(section, /disambiguat/i);
});

test("plan SKILL.md: Milestone Mode unconditionally defers epic create() in workspace mode", () => {
  const section = skill.slice(
    skill.indexOf("## Milestone Mode"),
    skill.indexOf("## Epic Mode"),
  );
  assert.match(section, /skip.*create\(\)|unconditionally defer|unconditionally skip/i);
  assert.match(section, /Shared Issue Tracking|Phase 2/);
});

test("plan SKILL.md: Milestone Mode never writes to registered repo product.md", () => {
  const section = skill.slice(
    skill.indexOf("## Milestone Mode"),
    skill.indexOf("## Epic Mode"),
  );
  assert.match(section, /never writes.*repo.*product\.md|isolation/i);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/plan-workspace-mode.test.mjs`
Expected: FAIL for the 6 new assertions.

- [ ] **Implement**

Edit `skills/plan/SKILL.md` Milestone Mode section. Add a subsection **Milestone Mode — Workspace-Mode Branching** before the existing Milestone Mode Flow steps, with content:

- Detect workspace via `detectWorkspace(cwd)`. If non-null AND `currentRepoSlug === null`, enter workspace-mode branch. Otherwise use repo-mode flow unchanged.
- **Workspace-mode:** read/write `resolveWorkspaceProductPath(workspaceRoot)`. If the milestone section does not exist, prompt for target date, feature list, and success criteria and write the new milestone to workspace `product.md`.
- **Feature name parsing:** accept bare `<module>` OR qualified `workspace/<module>` / `<repo-slug>/<module>`. Validate both tokens with `validateModuleName(token)`; reject invalid tokens with error `Invalid module name token: '<input>'. Module names must match [a-zA-Z0-9_-]+.` and error code `INVALID_MODULE_NAME` **before any filesystem lookup**.
- **Ambiguous bare `<module>`** (matches both a workspace charter and a repo charter): prompt the user to disambiguate. The written milestone line always records the qualified form.
- **Isolation invariant:** in workspace mode the skill **never writes to any registered repo's `product.md`**. Workspace milestones are workspace-scoped artefacts.
- **Epic creation:** skip epic-board `create()` calls **unconditionally** (same as Release Mode). Print the deferral message substituting `Milestone '<name>'` for `Release plan for '<name>'` in the first line.

- [ ] **Verify test passes**

Run: `node --test tests/skills/plan-workspace-mode.test.mjs`
Expected: PASS for all 13 assertions so far.

- [ ] **Commit**

```bash
git add skills/plan/SKILL.md tests/skills/plan-workspace-mode.test.mjs
git commit -m "feat(multi-repo-workspace): workspace-mode branch in /adev:plan Milestone Mode

Implements Behaviors 17-20 and AC10, AC13, AC15, AC16 of
workspace-aware-vision spec. At workspace root, Milestone Mode
reads/writes workspace product.md, validates module-name tokens
before filesystem lookup, prompts on ambiguous names, and skips
epic create() unconditionally. Isolation invariant preserved.

Refs: issue-65"
```

---

## Task 6: Repo-Mode-Inside-Workspace Advisory [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=4 novelty=5
**Rationale:** Mechanical text insertion in two SKILL.md files with exact advisory text specified; slightly higher blast radius from touching two modules.

**Charter capability:** Workspace-Aware Release & Milestone Planning (UX contract).
**Depends on:** Task 4, Task 5 (same file).
**Files:**
- Modify: `skills/plan/SKILL.md` (add advisory section at the top of Spec/Feature/Release/Milestone/Epic mode flows, or as a shared preamble)
- Modify: `skills/brainstorm/SKILL.md` (add advisory to Workspace Root Handling or a dedicated section)
- Modify: `tests/skills/plan-workspace-mode.test.mjs` (append advisory assertions)
- Modify: `tests/skills/brainstorm-workspace-bootstrap.test.mjs` (append advisory assertion)
**Tests:** `tests/skills/plan-workspace-mode.test.mjs`, `tests/skills/brainstorm-workspace-bootstrap.test.mjs`

**Context to load:**
- Spec Behavior 23 and AC21

- [ ] **Write failing test**

Append to `tests/skills/plan-workspace-mode.test.mjs`:

```javascript
test("plan SKILL.md: repo-mode-inside-workspace advisory emits to stdout once", () => {
  assert.match(skill, /Advisory: running repo-scoped inside workspace/);
  assert.match(skill, /stdout/i);
  assert.match(skill, /once per invocation/i);
});
```

Append to `tests/skills/brainstorm-workspace-bootstrap.test.mjs`:

```javascript
test("brainstorm SKILL.md: repo-mode-inside-workspace advisory emits to stdout once", () => {
  assert.match(skill, /Advisory: running repo-scoped inside workspace/);
  assert.match(skill, /stdout/i);
  assert.match(skill, /once per invocation/i);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/plan-workspace-mode.test.mjs tests/skills/brainstorm-workspace-bootstrap.test.mjs`
Expected: FAIL for the 2 new assertions.

- [ ] **Implement**

Edit both SKILL.md files. Add an advisory section near the workspace-handling instructions:

**Text (verbatim in both files):**

> **Repo-Mode-Inside-Workspace Advisory:** When the skill is invoked inside a registered repo (`detectWorkspace(cwd)` non-null AND `currentRepoSlug` is set), behaviour is repo-scoped (existing single-repo flow). Additionally, print this one-line advisory to **stdout** (same channel as existing skill messages — NOT stderr, logs, or hook channels), **exactly once per invocation**:
>
> ```
> (Advisory: running repo-scoped inside workspace '<name>'. For
> workspace-level planning, cd to <workspace-root> and re-run.)
> ```
>
> The advisory does not block; it does not appear when `detectWorkspace` returns `null`.

Place in `skills/brainstorm/SKILL.md` immediately after the existing "Workspace Root Handling" section (after line 43). Place in `skills/plan/SKILL.md` at the top of the mode sections (before "## Spec Mode" or equivalent) so it applies to all mode flows.

- [ ] **Verify test passes**

Run: `node --test tests/skills/plan-workspace-mode.test.mjs tests/skills/brainstorm-workspace-bootstrap.test.mjs`
Expected: PASS (all assertions in both files).

- [ ] **Commit**

```bash
git add skills/plan/SKILL.md skills/brainstorm/SKILL.md tests/skills/plan-workspace-mode.test.mjs tests/skills/brainstorm-workspace-bootstrap.test.mjs
git commit -m "feat(multi-repo-workspace): repo-mode-inside-workspace advisory

Implements Behavior 23 and AC21 of workspace-aware-vision spec.
Both /adev:brainstorm and /adev:plan print a one-line stdout advisory
exactly once per invocation when run inside a registered repo of a
detected workspace. Non-blocking; absent outside workspaces.

Refs: issue-65"
```

---

## Task 7: End-to-End Integration Tests [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=4 pattern=4 blast=5 novelty=4
**Rationale:** Integration tests using established tmpdir fixture pattern; slightly lower spec score as test expectations are distributed across prior tasks rather than a dedicated E2E spec section.

**Charter capability:** All (verification).
**Depends on:** Tasks 1–6.
**Files:**
- Modify: `tests/lib/workspace-hardening.test.mjs` (add integration scenarios using tmpdir fixture workspaces)
**Tests:** `tests/lib/workspace-hardening.test.mjs`

**Context to load:**
- All prior task acceptance criteria
- Existing fixture pattern in `tests/fixtures/workspace-example/`
- `tests/helpers.mjs` for `createTempDir` / `cleanupTempDir` / `writeFixture`

- [ ] **Write failing test**

Append to `tests/lib/workspace-hardening.test.mjs`:

```javascript
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

test("integration: workspace with path-escape repo path is rejected", async () => {
  const tmp = createTempDir();
  try {
    writeFixture(tmp, "adev-workspace.yaml", `
workspace:
  name: test-ws
repos:
  - slug: evil
    path: "../../../etc"
  - slug: ok
    path: "repos/ok"
`);
    writeFixture(tmp, "repos/ok/.context-index/constitution.md", "# Identity\nOK repo.");
    // The escape check is done at the skill level, not in detectWorkspace.
    // Assert that assertPathInWorkspace flags the escape:
    assert.throws(
      () => assertPathInWorkspace(tmp, "../../../etc"),
      /PATH_ESCAPE|escaping workspace root/i,
    );
    // Also assert: safe repo path passes
    assert.doesNotThrow(() =>
      assertPathInWorkspace(tmp, "repos/ok"),
    );
  } finally {
    cleanupTempDir(tmp);
  }
});

test("integration: sanitizeIdentityOneLiner strips real ANSI payload from constitution", () => {
  const tmp = createTempDir();
  try {
    writeFixture(
      tmp,
      "constitution.md",
      "# Identity\n\x1b[31mEvilRepo\x1b[0m does \x07malicious\x00 things.\n",
    );
    const raw = readFileSync(`${tmp}/constitution.md`, "utf8");
    const firstLineAfterHeading = raw.split("\n")[2] ?? "";
    const sanitised = sanitizeIdentityOneLiner(firstLineAfterHeading);
    // Should strip all control chars and ANSI
    assert.equal(sanitised.includes("\x1b"), false);
    assert.equal(sanitised.includes("\x00"), false);
    assert.equal(sanitised.includes("\x07"), false);
    assert.match(sanitised, /EvilRepo does malicious things/);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("integration: readCappedText skips oversized file", () => {
  const tmp = createTempDir();
  try {
    writeFixture(tmp, "big.md", "x".repeat(MAX_CHARTER_FILE_BYTES + 1));
    const result = readCappedText(`${tmp}/big.md`);
    assert.equal(result.content, null);
    assert.equal(result.truncated, true);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("integration: resolveWorkspaceProductPath resolves under workspace root", () => {
  const tmp = createTempDir();
  try {
    const p = resolveWorkspaceProductPath(tmp);
    assert.equal(p.startsWith(tmp), true);
    assert.equal(p.endsWith(".context-index/specs/product.md") || p.endsWith(".context-index\\specs\\product.md"), true);
  } finally {
    cleanupTempDir(tmp);
  }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/workspace-hardening.test.mjs`
Expected: Initially PASS on the new assertions if Tasks 1-6 are complete. If any prior task regressed, the corresponding assertion fails.

(If run before Tasks 1-6 complete, the imports themselves fail.)

- [ ] **Verify test passes**

Run full suite: `npm test`
Expected: all tests pass (including pre-existing ~978 tests).

- [ ] **Commit**

```bash
git add tests/lib/workspace-hardening.test.mjs
git commit -m "test(multi-repo-workspace): end-to-end workspace-hardening integration tests

Covers all workspace-aware-vision acceptance criteria involving:
- Path-containment rejection of escape paths (AC17)
- Identity sanitisation of ANSI + control chars (AC6)
- Size-cap truncation (AC19)
- Workspace product path resolution (AC22)

Refs: issue-65"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [ ] Tests pass: `npm test`
- [ ] All 23 acceptance criteria from the spec satisfied (mapped below)
- [ ] No new external dependencies introduced (Principle 1)
- [ ] All SKILL.md changes are markdown instructions only — no executable logic (Principle 2)
- [ ] `package.json` and `.claude-plugin/plugin.json` versions remain in sync (Principle 5 — bump both if releasing)

### Acceptance Criteria → Task Mapping

| AC | Task(s) |
|----|---------|
| AC1 — `/adev:brainstorm` at workspace root runs Step 5b against workspace `.context-index/` | 3 |
| AC2 — `/adev:brainstorm` inside repo runs Step 5b against repo `.context-index/` | 3 (preserved via existing Workspace Root Handling) |
| AC3 — `/adev:brainstorm` outside workspace unchanged | 3 |
| AC4 — Workspace mode bootstraps minimal workspace `product.md` | 3 |
| AC5 — Bootstrap Vision prompt surfaces registered repos' identities | 3 |
| AC6 — Identity one-liners stripped + truncated | 2, 3 |
| AC7 — Identity extraction falls through `## Identity` → body → `no constitution` | 3 |
| AC8 — Bootstrap proceeds with no workspace constitution/manifest | 3 |
| AC9 — `/adev:plan --release` at workspace root reads/updates workspace `product.md` | 4 |
| AC10 — `/adev:plan --milestone` at workspace root reads/updates workspace `product.md` | 5 |
| AC11 — Release mode feature list with source annotations | 4 |
| AC12 — Release mode incorporates workspace dependency graph (non-transitive inheritance) | 4 |
| AC13 — Milestone mode prompts for ambiguous feature names | 5 |
| AC14 — Module-name tokens rejected with `INVALID_MODULE_NAME` | 1, 5 |
| AC15 — Isolation: no write to repo `product.md` in workspace mode | 4, 5 |
| AC16 — Epic `create()` unconditionally skipped; no `manifest.yaml` reference | 4, 5 |
| AC17 — `PATH_ESCAPE` rejection for escaping repo paths | 1, 4, 5, 7 |
| AC18 — Workspaces > 200 charter files truncate | 2, 4 |
| AC19 — Charter files > 512 KB skipped | 2, 4, 7 |
| AC20 — Missing workspace `.context-index/` advisory (preserved) | 3 (existing), 4, 5 |
| AC21 — Repo-mode-inside-workspace advisory once to stdout | 6 |
| AC22 — `resolveWorkspaceProductPath` exported from `lib/workspace.mjs` | 2 |
| AC23 — `npm test` passes | 7 + quality gate |

Every acceptance criterion maps to at least one task.
