# Implementation Plan: Gaming Detector Gate Enforcement

> **Methodology:** adev
> **Charter:** .context-index/specs/features/test-strategies/charter.md
> **Spec:** .context-index/specs/features/test-strategies/gaming-detector-gate-enforcement.spec.md
> **Review:** PASS_WITH_NOTES (2026-08-13)
> **Platform:** Node.js (CLI/plugin, no framework), JavaScript ESM, node:test, npm

**Goal:** Wire the 8 gaming detectors already implemented in `lib/test-strategies/gaming.mjs`
into a deterministic, hard-blocking `PreToolUse` hook so an agent cannot write a new gaming
violation into a test file — closing issue-553's prose/code drift.

**Architecture:** A new pure-logic module (`lib/test-strategies/gaming-gate.mjs`) implements
test-file classification, detector dispatch (calling each pattern's `.detect()` directly, no
size cap), post-edit content reconstruction (Write passthrough / Edit substitution), and a
fingerprint-based before/after violation diff. A thin node helper
(`hooks/_gaming-gate-check.mjs`) wires that module to the hook protocol (env vars in, JSON
result out), and a bash wrapper (`hooks/gaming-gate.sh`, registered in `hooks/hooks.json`
under `PreToolUse`, matcher `Write|Edit`) exits 2 before the write lands when a new violation
is found. Mirrors the existing `PreToolUse` `Write|Edit` precedent in
`hooks/plan-body-write-guard.sh` and the env-var-passthrough convention in
`hooks/lifecycle-gate-edit.sh` / `hooks/_lifecycle-gate-check-edit.mjs`.

---

## File Structure

**Create:**
- `lib/test-strategies/gaming-gate.mjs` — path classification, detector dispatch, content reconstruction, violation diff
- `hooks/_gaming-gate-check.mjs` — node helper: reads tool-input env vars + on-disk content, calls `gaming-gate.mjs`, prints `{ blocked, violations }` JSON
- `hooks/gaming-gate.sh` — bash `PreToolUse` wrapper: parses stdin/env, calls the node helper, formats stderr message, exits 0/2
- `tests/lib/test-strategies/gaming-gate.test.mjs` — unit tests for the lib module
- `tests/hooks/gaming-gate.test.mjs` — integration tests for the hook script

**Modify:**
- `hooks/hooks.json` — register `gaming-gate.sh` under `PreToolUse`, matcher `Write|Edit`
- `skills/write-test/SKILL.md` — correct gaming-pattern prose (8 detectors, not 4; reference the hook as the deterministic floor)
- `package.json` — version bump
- `.claude-plugin/plugin.json` — version bump (parity with package.json)

**Reference (read, do not modify):**
- `lib/test-strategies/gaming.mjs` — the 8 detector implementations this plan wires up
- `lib/test-strategies/detection.mjs` — confirmed NOT reused (see spec Behavior 6 rationale)
- `hooks/plan-body-write-guard.sh` — closest existing `PreToolUse` `Write|Edit` precedent
- `hooks/lifecycle-gate-edit.sh` + `hooks/_lifecycle-gate-check-edit.mjs` — env-var-passthrough / fail-open convention precedent
- `hooks/_parse-stdin.sh` — shared stdin/env parsing helper
- `tests/helpers.mjs` — `createTempDir`, `cleanupTempDir`, `writeFixture`, `runHook` test helpers

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/test-strategies/gaming-detector-gate-enforcement.spec.md` (Behaviors 1-2, Preconditions)
- Charter: `.context-index/specs/features/test-strategies/charter.md` (capability: Gaming Detector Gate Enforcement)
- Source: `lib/test-strategies/gaming.mjs` (full read — reused pattern objects)

### Task 2 Context
- Spec (Behaviors 5-6)
- Source: `lib/test-strategies/gaming.mjs` (`SHARED_PATTERNS`, `INTEGRATION_PATTERNS`, each pattern's `.detect()` signature)
- Prior art: `lib/test-strategies/detection.mjs` (read only to confirm it is NOT the right tool here — spec Behavior 6 rationale)

### Task 3 Context
- Spec (Behavior 3)
- Prior art: `hooks/plan-body-write-guard.sh:28-34` (Write `content` vs Edit `new_string` env var convention — note the spec's own SA-7 correction: this precedent shows the *convention* for reading tool input, not full before/after reconstruction, which is new logic)

### Task 4 Context
- Spec (Behavior 7)
- Source: Tasks 1-3 output (`lib/test-strategies/gaming-gate.mjs`)

### Task 5 Context
- Spec (Behaviors 1-9, Postconditions, Error Cases)
- Prior art: `hooks/_parse-stdin.sh`, `hooks/lifecycle-gate-edit.sh` (fail-open `|| echo "pass"` convention), `hooks/plan-body-write-guard.sh` (stderr message + exit 2 convention)
- `hooks/hooks.json` (registration format)
- `tests/helpers.mjs::runHook` (test harness for hook scripts)

### Task 6 Context
- Spec revision-history comment + Actionable Task Map (skills/write-test/SKILL.md row)
- Source: `skills/write-test/SKILL.md` lines ~144-171 (existing "4 shared cross-strategy gaming patterns" prose to correct)

### Task 7 Context
- `package.json`, `.claude-plugin/plugin.json` (current version 0.27.8)
- CLAUDE.md Non-Negotiable Principle 5 (version parity)

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 → Task 5 (each builds on the prior; `gaming-gate.mjs` is authored incrementally, hook wraps the finished module)
- Group B (independent, no file overlap with Group A): Task 6 (`skills/write-test/SKILL.md`)
- Group C (independent, run last): Task 7 (version bump, trivial, no functional dependency but logically follows once the feature is complete)

Group B can run in parallel with Group A. Task 7 should run last (after Group A confirms the feature is real) but has no file-level conflict with A or B.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Path classification helpers | small | unit | — | 1 create, 1 test create |
| 2 | Detector dispatch (shared + integration) | medium | unit | Task 1 | 1 modify, 1 test modify |
| 3 | Post-edit content reconstruction | medium | unit | Task 1 | 1 modify, 1 test modify |
| 4 | Violation diff | medium | unit | Task 2, Task 3 | 1 modify, 1 test modify |
| 5 | PreToolUse hook + registration | medium | unit | Task 4 | 2 create, 1 test create, 1 modify |
| 6 | Correct write-test prose | small | unit | — | 1 modify |
| 7 | Version bump | small | unit | Task 5 | 2 modify |

---

## Task Structure

### Task 1: Path classification helpers [specialist: none]

**Charter capability:** Gaming Detector Gate Enforcement
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/test-strategies/gaming-gate.mjs`
- Test: `tests/lib/test-strategies/gaming-gate.test.mjs`

**Tests:** `tests/lib/test-strategies/gaming-gate.test.mjs`

**Context to load:**
- Spec Behaviors 1-2 and Preconditions

- [ ] **Write failing test**

```javascript
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { isTestFile, isDetectorFixtureFile, isIntegrationTestFile } from "../../../lib/test-strategies/gaming-gate.mjs";

describe("isTestFile", () => {
  it("matches files under tests/", () => {
    assert.equal(isTestFile("tests/cli/context.test.mjs"), true);
  });
  it("matches provider-mirror tests dirs", () => {
    assert.equal(isTestFile("providers/codex/tests/foo.test.mjs"), true);
  });
  it("matches .spec.mjs suffix outside tests/", () => {
    assert.equal(isTestFile("src/widget.spec.mjs"), true);
  });
  it("rejects non-test source files", () => {
    assert.equal(isTestFile("lib/test-strategies/gaming.mjs"), false);
  });
});

describe("isDetectorFixtureFile", () => {
  it("matches the three known gaming-detector fixture files", () => {
    assert.equal(isDetectorFixtureFile("tests/lib/test-strategies/gaming.test.mjs"), true);
    assert.equal(isDetectorFixtureFile("tests/lib/test-strategies/integration-gaming.test.mjs"), true);
    assert.equal(isDetectorFixtureFile("tests/test-strategies/gaming-agent-skip.test.mjs"), true);
  });
  it("does not match an unrelated test file", () => {
    assert.equal(isDetectorFixtureFile("tests/cli/context.test.mjs"), false);
  });
});

describe("isIntegrationTestFile", () => {
  it("matches a path with an integration/ segment", () => {
    assert.equal(isIntegrationTestFile("tests/integration/adapter.test.mjs"), true);
  });
  it("matches a filename containing the integration token", () => {
    assert.equal(isIntegrationTestFile("tests/lib/test-strategies/integration-gaming.test.mjs"), true);
    assert.equal(isIntegrationTestFile("tests/hooks/lifecycle-gate-integration.test.mjs"), true);
  });
  it("does not match an ordinary unit test path", () => {
    assert.equal(isIntegrationTestFile("tests/cli/context.test.mjs"), false);
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/test-strategies/gaming-gate.test.mjs`
Expected: FAIL — `Cannot find module '../../../lib/test-strategies/gaming-gate.mjs'`

- [ ] **Implement**

```javascript
/**
 * Path classification helpers for the gaming-detector PreToolUse gate.
 * @param {string} filePath
 * @returns {boolean}
 */
export function isTestFile(filePath) {
  const p = filePath.replace(/\\/g, "/");
  if (/(^|\/)tests\//.test(p)) return true;
  if (/(^|\/)providers\/[^/]+\/tests\//.test(p)) return true;
  return /\.(test|spec)\.mjs$/.test(p);
}

const FIXTURE_FILES = [
  /(^|\/)tests\/lib\/test-strategies\/gaming.*\.mjs$/,
  /(^|\/)tests\/lib\/test-strategies\/integration-gaming.*\.mjs$/,
  /(^|\/)tests\/test-strategies\/gaming-agent-skip\.test\.mjs$/,
];

export function isDetectorFixtureFile(filePath) {
  const p = filePath.replace(/\\/g, "/");
  return FIXTURE_FILES.some((re) => re.test(p));
}

export function isIntegrationTestFile(filePath) {
  const p = filePath.replace(/\\/g, "/");
  if (/(^|\/)integration\//.test(p)) return true;
  const base = p.split("/").pop() ?? "";
  return /integration/i.test(base);
}
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/test-strategies/gaming-gate.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch: `feat/test-strategies/gaming-gate-enforcement` (already checked out)

```bash
git add lib/test-strategies/gaming-gate.mjs tests/lib/test-strategies/gaming-gate.test.mjs
git commit -m "feat(test-strategies): add path classification for gaming detector gate

Spec: .context-index/specs/features/test-strategies/gaming-detector-gate-enforcement.spec.md
Plan-task: 1"
```

---

### Task 2: Detector dispatch (shared + integration) [specialist: none]

**Charter capability:** Gaming Detector Gate Enforcement
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `lib/test-strategies/gaming-gate.mjs`
- Test: `tests/lib/test-strategies/gaming-gate.test.mjs`

**Tests:** `tests/lib/test-strategies/gaming-gate.test.mjs`

**Context to load:**
- Spec Behaviors 5-6
- `lib/test-strategies/gaming.mjs` (`SHARED_PATTERNS`, `INTEGRATION_PATTERNS`)

- [ ] **Write failing test**

```javascript
import { runGamingDetectors } from "../../../lib/test-strategies/gaming-gate.mjs";

describe("runGamingDetectors", () => {
  it("runs only the 4 shared detectors for a non-integration test file", () => {
    const content = "test('x', () => { it.skip('y', () => {}); });";
    const result = runGamingDetectors(content, "tests/cli/context.test.mjs");
    assert.ok(result.violations.some((v) => v.patternId === "DISABLED_TESTS"));
    assert.ok(!result.violations.some((v) => v.patternId === "CI_BYPASS"));
  });

  it("also runs the 4 integration detectors for an integration test file", () => {
    const content = "if (process.env.CI) { return; }";
    const result = runGamingDetectors(content, "tests/integration/adapter.test.mjs");
    assert.ok(result.violations.some((v) => v.patternId === "CI_BYPASS"));
  });

  it("has no file-size exemption — a violation in a 600KB file still detects", () => {
    const padding = "// x\n".repeat(150000); // > 500KB
    const content = padding + "\nit.skip('y', () => {});\n";
    const result = runGamingDetectors(content, "tests/cli/context.test.mjs");
    assert.ok(result.violations.some((v) => v.patternId === "DISABLED_TESTS"));
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/test-strategies/gaming-gate.test.mjs`
Expected: FAIL — `runGamingDetectors is not a function` (not exported yet)

- [ ] **Implement**

```javascript
import { SHARED_PATTERNS, INTEGRATION_PATTERNS } from "./gaming.mjs";

/**
 * Runs the applicable gaming detectors directly against `.detect()` — never
 * through detectSharedGamingPatterns()'s size-capped wrapper. This gate has
 * no file-size exemption (spec Behavior 5 / SEC-1).
 * @param {string} content
 * @param {string} filePath
 * @returns {{ violations: Array<{patternId:string, prefix:string, line:number, match:string, message:string}> }}
 */
export function runGamingDetectors(content, filePath) {
  const violations = [];
  for (const pattern of SHARED_PATTERNS) {
    for (const v of pattern.detect(content)) {
      violations.push({ patternId: pattern.id, prefix: "SHARED", ...v });
    }
  }
  if (isIntegrationTestFile(filePath)) {
    for (const pattern of INTEGRATION_PATTERNS) {
      for (const v of pattern.detect(content)) {
        violations.push({ patternId: pattern.id, prefix: "INTEGRATION", ...v });
      }
    }
  }
  return { violations };
}
```

(Append below the existing `isIntegrationTestFile` export from Task 1 in the same file; add the new `import` line at the top of the file.)

- [ ] **Verify test passes**

Run: `node --test tests/lib/test-strategies/gaming-gate.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/test-strategies/gaming-gate.mjs tests/lib/test-strategies/gaming-gate.test.mjs
git commit -m "feat(test-strategies): dispatch gaming detectors without size cap

Spec: .context-index/specs/features/test-strategies/gaming-detector-gate-enforcement.spec.md
Plan-task: 2"
```

---

### Task 3: Post-edit content reconstruction [specialist: none]

**Charter capability:** Gaming Detector Gate Enforcement
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `lib/test-strategies/gaming-gate.mjs`
- Test: `tests/lib/test-strategies/gaming-gate.test.mjs`

**Tests:** `tests/lib/test-strategies/gaming-gate.test.mjs`

**Context to load:**
- Spec Behavior 3

- [ ] **Write failing test**

```javascript
import { reconstructAfterContent } from "../../../lib/test-strategies/gaming-gate.mjs";

describe("reconstructAfterContent", () => {
  it("Write: returns the tool's content field directly", () => {
    const after = reconstructAfterContent({ tool: "Write", before: "old", content: "new full content" });
    assert.equal(after, "new full content");
  });

  it("Edit: replaces the first occurrence of old_string with new_string", () => {
    const before = "a\nb\na\n";
    const after = reconstructAfterContent({ tool: "Edit", before, oldString: "a", newString: "X" });
    assert.equal(after, "X\nb\na\n");
  });

  it("Edit: returns null when old_string is not found (fail-open signal)", () => {
    const after = reconstructAfterContent({ tool: "Edit", before: "a\nb\n", oldString: "zzz", newString: "X" });
    assert.equal(after, null);
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/test-strategies/gaming-gate.test.mjs`
Expected: FAIL — `reconstructAfterContent is not a function`

- [ ] **Implement**

```javascript
/**
 * Reconstructs the file content a pending Write/Edit tool call would
 * produce, without performing the write. Returns null when reconstruction
 * is not possible (Edit's old_string not found) — callers must treat null
 * as a fail-open signal (spec Behavior 3, Error Cases table).
 * @param {{tool:string, before:string, content?:string, oldString?:string, newString?:string}} args
 * @returns {string|null}
 */
export function reconstructAfterContent({ tool, before, content, oldString, newString }) {
  if (tool === "Write") {
    return typeof content === "string" ? content : null;
  }
  if (tool === "Edit") {
    if (typeof oldString !== "string" || typeof newString !== "string") return null;
    const idx = before.indexOf(oldString);
    if (idx === -1) return null;
    return before.slice(0, idx) + newString + before.slice(idx + oldString.length);
  }
  return null;
}
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/test-strategies/gaming-gate.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/test-strategies/gaming-gate.mjs tests/lib/test-strategies/gaming-gate.test.mjs
git commit -m "feat(test-strategies): reconstruct pre-write file content for the gaming gate

Spec: .context-index/specs/features/test-strategies/gaming-detector-gate-enforcement.spec.md
Plan-task: 3"
```

---

### Task 4: Violation diff [specialist: none]

**Charter capability:** Gaming Detector Gate Enforcement
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2, Task 3
**Files:**
- Modify: `lib/test-strategies/gaming-gate.mjs`
- Test: `tests/lib/test-strategies/gaming-gate.test.mjs`

**Tests:** `tests/lib/test-strategies/gaming-gate.test.mjs`

**Context to load:**
- Spec Behavior 7

- [ ] **Write failing test**

```javascript
import { diffNewViolations } from "../../../lib/test-strategies/gaming-gate.mjs";

describe("diffNewViolations", () => {
  it("reports a violation present in after but not before as new", () => {
    const before = "test('x', () => { assert.ok(true); });";
    const after = "test('x', () => { it.skip('y', () => {}); assert.ok(true); });";
    const result = diffNewViolations(before, after, "tests/cli/context.test.mjs");
    assert.ok(result.newViolations.some((v) => v.patternId === "DISABLED_TESTS"));
  });

  it("does not report a pre-existing violation left untouched as new", () => {
    const content = "it.skip('y', () => {});";
    const result = diffNewViolations(content, content, "tests/cli/context.test.mjs");
    assert.equal(result.newViolations.length, 0);
  });

  it("is insensitive to line-number shift from an unrelated earlier edit", () => {
    const before = "it.skip('y', () => {});";
    const after = "// unrelated new comment\nit.skip('y', () => {});";
    const result = diffNewViolations(before, after, "tests/cli/context.test.mjs");
    assert.equal(result.newViolations.length, 0);
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/test-strategies/gaming-gate.test.mjs`
Expected: FAIL — `diffNewViolations is not a function`

- [ ] **Implement**

```javascript
function fingerprint(v) {
  return `${v.patternId}::${v.match.trim()}`;
}

/**
 * Compares gaming violations in `before` vs `after` and returns only the
 * violations newly introduced. Identity ignores line number (spec
 * Behavior 7 — an earlier unrelated edit shifts every subsequent line).
 * @param {string} beforeContent
 * @param {string} afterContent
 * @param {string} filePath
 * @returns {{ newViolations: Array<object>, beforeViolations: Array<object>, afterViolations: Array<object> }}
 */
export function diffNewViolations(beforeContent, afterContent, filePath) {
  const before = runGamingDetectors(beforeContent, filePath).violations;
  const after = runGamingDetectors(afterContent, filePath).violations;
  const beforeFingerprints = new Set(before.map(fingerprint));
  const newViolations = after.filter((v) => !beforeFingerprints.has(fingerprint(v)));
  return { newViolations, beforeViolations: before, afterViolations: after };
}
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/test-strategies/gaming-gate.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/test-strategies/gaming-gate.mjs tests/lib/test-strategies/gaming-gate.test.mjs
git commit -m "feat(test-strategies): diff gaming violations before/after a pending edit

Spec: .context-index/specs/features/test-strategies/gaming-detector-gate-enforcement.spec.md
Plan-task: 4"
```

---

### Task 5: PreToolUse hook + registration [specialist: none]

**Charter capability:** Gaming Detector Gate Enforcement
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 4
**Files:**
- Create: `hooks/_gaming-gate-check.mjs`
- Create: `hooks/gaming-gate.sh`
- Modify: `hooks/hooks.json`
- Test: `tests/hooks/gaming-gate.test.mjs`

**Tests:** `tests/hooks/gaming-gate.test.mjs`

**Context to load:**
- Spec Behaviors 1-9, Postconditions, Error Cases
- `hooks/_parse-stdin.sh`, `hooks/lifecycle-gate-edit.sh`, `hooks/plan-body-write-guard.sh`
- `tests/helpers.mjs::runHook`

- [ ] **Write failing test**

```javascript
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import { createTempDir, cleanupTempDir, writeFixture, runHook } from "../helpers.mjs";

describe("gaming-gate hook", () => {
  it("exits 0 for a non-test file", () => {
    const tmp = createTempDir();
    const result = runHook("gaming-gate.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/src/main.mjs`, CLAUDE_TOOL_INPUT_content: "it.skip('x', () => {});" },
      stdin: JSON.stringify({ tool_name: "Write", tool_input: { file_path: `${tmp}/src/main.mjs`, content: "it.skip('x', () => {});" } }),
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  it("blocks (exit 2) a Write that introduces a new violation, and the file is never written", () => {
    const tmp = createTempDir();
    const target = `${tmp}/tests/foo.test.mjs`;
    const result = runHook("gaming-gate.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: target, CLAUDE_TOOL_INPUT_content: "it.skip('x', () => {});" },
      stdin: JSON.stringify({ tool_name: "Write", tool_input: { file_path: target, content: "it.skip('x', () => {});" } }),
    });
    assert.equal(result.exitCode, 2);
    cleanupTempDir(tmp);
  });

  it("allows an Edit that leaves a pre-existing violation untouched", () => {
    const tmp = createTempDir();
    const target = `${tmp}/tests/foo.test.mjs`;
    writeFixture(tmp, "tests/foo.test.mjs", "it.skip('x', () => {});\n// old comment\n");
    const result = runHook("gaming-gate.sh", {
      cwd: tmp,
      env: {
        CLAUDE_TOOL_INPUT_file_path: target,
        CLAUDE_TOOL_INPUT_old_string: "// old comment",
        CLAUDE_TOOL_INPUT_new_string: "// new comment",
      },
      stdin: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: target, old_string: "// old comment", new_string: "// new comment" } }),
    });
    assert.equal(result.exitCode, 0);
    const onDisk = readFileSync(target, "utf8");
    assert.equal(onDisk, "it.skip('x', () => {});\n// old comment\n"); // untouched — hook never writes
    cleanupTempDir(tmp);
  });

  it("blocks (exit 2) an Edit that introduces a new violation, and the file is left untouched", () => {
    const tmp = createTempDir();
    const target = `${tmp}/tests/foo.test.mjs`;
    writeFixture(tmp, "tests/foo.test.mjs", "// placeholder\n");
    const result = runHook("gaming-gate.sh", {
      cwd: tmp,
      env: {
        CLAUDE_TOOL_INPUT_file_path: target,
        CLAUDE_TOOL_INPUT_old_string: "// placeholder",
        CLAUDE_TOOL_INPUT_new_string: "it.skip('x', () => {});",
      },
      stdin: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: target, old_string: "// placeholder", new_string: "it.skip('x', () => {});" } }),
    });
    assert.equal(result.exitCode, 2);
    const onDisk = readFileSync(target, "utf8");
    assert.equal(onDisk, "// placeholder\n"); // block happened before the write — file unchanged
    cleanupTempDir(tmp);
  });

  it("exits 0 for the detector's own fixture file regardless of content", () => {
    const tmp = createTempDir();
    const target = `${tmp}/tests/lib/test-strategies/gaming.test.mjs`;
    const result = runHook("gaming-gate.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: target, CLAUDE_TOOL_INPUT_content: "it.skip('fixture', () => {});" },
      stdin: JSON.stringify({ tool_name: "Write", tool_input: { file_path: target, content: "it.skip('fixture', () => {});" } }),
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  it("blocks (exit 2) even when the introduced violation is in a file just over 500KB", () => {
    const tmp = createTempDir();
    const target = `${tmp}/tests/foo.test.mjs`;
    const padding = "// x\n".repeat(150000); // > 500KB
    const result = runHook("gaming-gate.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: target, CLAUDE_TOOL_INPUT_content: padding + "\nit.skip('x', () => {});\n" },
      stdin: JSON.stringify({ tool_name: "Write", tool_input: { file_path: target, content: padding + "\nit.skip('x', () => {});\n" } }),
    });
    assert.equal(result.exitCode, 2); // no size-cap exemption (spec Behavior 5 / SEC-1)
    cleanupTempDir(tmp);
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/hooks/gaming-gate.test.mjs`
Expected: FAIL — hook script not found / non-zero unexpected exit

- [ ] **Implement**

`hooks/_gaming-gate-check.mjs` (node helper):

```javascript
#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import {
  isTestFile,
  isDetectorFixtureFile,
  reconstructAfterContent,
  diffNewViolations,
} from "../lib/test-strategies/gaming-gate.mjs";

const filePath = process.env.ADEV_FILE_PATH || "";
// ADEV_TOOL_KIND is computed in gaming-gate.sh from which CLAUDE_TOOL_INPUT_*
// fields are SET (bash `${VAR+x}` presence test, not just non-empty) — this
// repo's hook protocol exposes CLAUDE_TOOL_INPUT_* (tool_input fields) via
// env var, but never a tool-name env var (see docs/hooks.md's Hook Protocol
// section and hooks/_parse-stdin.sh — only tool_input keys are exported).
// Relying on field *shape* (old_string/new_string present => Edit; content
// present => Write) avoids inventing a nonexistent env var and avoids a
// second, possibly-empty stdin read in plugin-hook invocation mode.
const tool = process.env.ADEV_TOOL_KIND || "";
const content = process.env.ADEV_TOOL_CONTENT;
const oldString = process.env.ADEV_TOOL_OLD_STRING;
const newString = process.env.ADEV_TOOL_NEW_STRING;

function pass() {
  console.log(JSON.stringify({ blocked: false, violations: [] }));
}

try {
  if (!filePath || !isTestFile(filePath) || isDetectorFixtureFile(filePath)) {
    pass();
    process.exit(0);
  }
  const before = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  const after = reconstructAfterContent({ tool, before, content, oldString, newString });
  if (after === null) {
    pass();
    process.exit(0);
  }
  const { newViolations } = diffNewViolations(before, after, filePath);
  console.log(JSON.stringify({ blocked: newViolations.length > 0, violations: newViolations }));
} catch {
  pass();
}
```

`hooks/gaming-gate.sh` (bash wrapper, mirrors `plan-body-write-guard.sh`'s stderr+exit2 convention and `lifecycle-gate-edit.sh`'s fail-open `|| echo` convention):

```bash
#!/usr/bin/env bash
# adev PreToolUse hook: Gaming Detector Gate
# Fires on: Write, Edit (test files only)
# Blocks (exit 2) a pending Write/Edit that would introduce a new gaming
# violation not present in the file's current on-disk content.
# Exit codes: 0 = allow, 2 = block.

set -uo pipefail

source "$(dirname "$0")/_parse-stdin.sh"

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

# This repo's hook protocol never exposes a tool-name env var (only
# CLAUDE_TOOL_INPUT_* — see docs/hooks.md's Hook Protocol section). Infer
# Write vs Edit from which tool_input fields are actually SET (bash
# `${VAR+x}` presence test — distinguishes "field present, possibly empty
# string" from "field absent"), rather than depending on a nonexistent env
# var or a second, possibly-unreliable stdin read.
if [ -n "${CLAUDE_TOOL_INPUT_old_string+x}" ] || [ -n "${CLAUDE_TOOL_INPUT_new_string+x}" ]; then
  TOOL_KIND="Edit"
elif [ -n "${CLAUDE_TOOL_INPUT_content+x}" ]; then
  TOOL_KIND="Write"
else
  TOOL_KIND="unknown"
fi

RESULT=$(ADEV_FILE_PATH="${CLAUDE_TOOL_INPUT_file_path:-}" \
  ADEV_TOOL_KIND="$TOOL_KIND" \
  ADEV_TOOL_CONTENT="${CLAUDE_TOOL_INPUT_content:-}" \
  ADEV_TOOL_OLD_STRING="${CLAUDE_TOOL_INPUT_old_string:-}" \
  ADEV_TOOL_NEW_STRING="${CLAUDE_TOOL_INPUT_new_string:-}" \
  node "${PLUGIN_ROOT}/hooks/_gaming-gate-check.mjs" 2>/dev/null || echo '{"blocked":false,"violations":[]}')

BLOCKED=$(printf '%s' "$RESULT" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(s);console.log(j.blocked?"1":"0");}catch{console.log("0");}})' 2>/dev/null || echo "0")

if [ "$BLOCKED" = "1" ]; then
  echo "BLOCKED: this edit introduces a new gaming violation (see lib/test-strategies/gaming.mjs)." >&2
  printf '%s\n' "$RESULT" >&2
  exit 2
fi

exit 0
```

Register in `hooks/hooks.json` under `PreToolUse`, adding a new matcher entry for `Write|Edit`:

```json
{
  "matcher": "Write|Edit",
  "hooks": [
    { "type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/gaming-gate.sh\"" }
  ]
}
```

(Append this as a **new, separate** object in the `PreToolUse` array, after the existing `Bash` matcher entry — do not merge it into the existing `plan-body-write-guard.sh` object even though both use matcher `"Write|Edit"`. This repo's existing `hooks.json` already has two separate `PreToolUse` objects sharing the `"Edit"` matcher string — see the `context-preflight.sh`/`constitution-linter.sh`/`lifecycle-gate-edit.sh` group vs. the `plan-body-write-guard.sh` group — so a second independent object with a duplicate matcher string is the established pattern, not a new one. Do not touch the existing `Edit` or `Write|Edit` entries.)

- [ ] **Verify test passes**

Run: `node --test tests/hooks/gaming-gate.test.mjs`
Expected: PASS

Also run `node --test tests/hooks/lifecycle-gate-registration.test.mjs` (if present) to confirm the `hooks.json` schema change doesn't break existing registration validation.

- [ ] **Commit**

```bash
git add hooks/_gaming-gate-check.mjs hooks/gaming-gate.sh hooks/hooks.json tests/hooks/gaming-gate.test.mjs
git commit -m "feat(test-strategies): wire gaming detectors into a PreToolUse hard-blocking hook

Spec: .context-index/specs/features/test-strategies/gaming-detector-gate-enforcement.spec.md
Plan-task: 5"
```

---

### Task 6: Correct write-test prose [specialist: none]

**Charter capability:** Gaming Detector Gate Enforcement
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/write-test/SKILL.md`

**Tests:** N/A — markdown-only change; verified by manual re-read (this task is doc correction, not covered by a code test file, per spec Actionable Task Map).

**Context to load:**
- `skills/write-test/SKILL.md` around the "4 shared cross-strategy gaming patterns" prose

- [ ] **Edit**

In `skills/write-test/SKILL.md`, in the section that currently reads:

```
In addition to the strategy-specific `gaming_blockers`, always check the 4 shared cross-strategy gaming patterns from `lib/test-strategies/gaming.mjs`:
- `DISABLED_TESTS` — `.skip(`, `xit(`, `xdescribe(`, `.todo(`
- `EMPTY_ASSERTIONS` — test bodies with no assertion calls
- `SWALLOWED_ASSERTIONS` — `try { expect } catch {}` without rethrow
- `CONDITIONAL_ASSERTIONS` — `if (cond) { expect }` without else
```

Replace with (adding the 4 integration-specific detectors and the hook pointer):

```
In addition to the strategy-specific `gaming_blockers`, always check all 8 detectors from
`lib/test-strategies/gaming.mjs` — 4 shared cross-strategy patterns plus 4 integration-specific
patterns. **As of the Gaming Detector Gate Enforcement capability, a `PreToolUse` hook
(`hooks/gaming-gate.sh`) already re-runs these detectors on every `Write`/`Edit` of a test
file and hard-blocks a newly introduced violation before it reaches disk — this list is a
courtesy for the agent authoring tests, not the only enforcement.**

Shared (apply to every test, any strategy):
- `DISABLED_TESTS` — `.skip(`, `xit(`, `xdescribe(`, `.todo(`
- `EMPTY_ASSERTIONS` — test bodies with no assertion calls
- `SWALLOWED_ASSERTIONS` — `try { expect } catch {}` without rethrow
- `CONDITIONAL_ASSERTIONS` — `if (cond) { expect }` without else

Integration-specific (apply when the resolved strategy is `integration`):
- `BOUNDARY_MOCKING` — mocking the specific infrastructure SDK the module under test wraps
- `CI_BYPASS` — `if (process.env.CI) { ... skip/return ... }`
- `CREDENTIAL_ABSENT_PASS` — instantiating an infra SDK client with no credential guard
- `AGENT_SKIP` — `.skipIf(`, `canConnect`, `skipUnless`, or infra-conditional `skip:` options
```

- [ ] **Verify**

Re-read the edited section to confirm the markdown renders correctly and the fenced blocks are balanced. Run `npm test` (full suite) to confirm no test asserts the old "4 shared" wording verbatim (e.g. a skills-content test).

- [ ] **Commit**

```bash
git add skills/write-test/SKILL.md
git commit -m "docs(write-test): list all 8 gaming detectors, reference the enforcement hook

Spec: .context-index/specs/features/test-strategies/gaming-detector-gate-enforcement.spec.md
Plan-task: 6"
```

---

### Task 7: Version bump [specialist: none]

**Charter capability:** Gaming Detector Gate Enforcement
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 5
**Files:**
- Modify: `package.json`
- Modify: `.claude-plugin/plugin.json`

**Tests:** covered by the existing version-parity test (if present, e.g. a test asserting `package.json` and `plugin.json` versions match) — run the full suite to confirm.

**Context to load:**
- CLAUDE.md Non-Negotiable Principle 5

- [ ] **Edit**

Bump `package.json` `"version"` from `0.27.8` to `0.28.0` (new feature, minor bump). Bump `.claude-plugin/plugin.json` `"version"` to match `0.28.0`.

- [ ] **Verify**

```bash
node -e "const p=require('./package.json'); const pl=require('./.claude-plugin/plugin.json'); if (p.version !== pl.version) { console.error('MISMATCH'); process.exit(1);} console.log('OK', p.version);"
```

- [ ] **Commit**

```bash
git add package.json .claude-plugin/plugin.json
git commit -m "chore(release): bump version to 0.28.0 for gaming detector gate enforcement

Spec: .context-index/specs/features/test-strategies/gaming-detector-gate-enforcement.spec.md
Plan-task: 7"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied
- No lint/typecheck commands configured for this project (node:test only, per CLAUDE.md Quality Gates)
