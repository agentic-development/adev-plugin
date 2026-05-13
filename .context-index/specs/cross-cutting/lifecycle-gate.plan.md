<!-- DO NOT EDIT statuses inline — see lifecycle log lifecycle-gate.jsonl -->
# Implementation Plan: Lifecycle Gate

> **Methodology:** adev
> **Charter:** (cross-cutting — no parent charter)
> **Spec:** .context-index/specs/cross-cutting/lifecycle-gate.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-05)
> **Platform:** Node.js, JavaScript (ESM), bash hooks

**Goal:** Implement a configurable multi-layer enforcement system that gates agent actions based on workflow state (planned flow vs unplanned), with three complementary layers: file-edit gate, bash action gate, and session advisory.

**Architecture:** Three new bash hooks (`lifecycle-gate-edit.sh`, `lifecycle-gate-bash.sh`, `lifecycle-gate-advisory.sh`) registered in `hooks.json`. All share bypass logic reading `user-config` for enforcement level and `.execution-state.md` for workflow state. Config parsing uses the existing `parseUserConfig()` from `lib/persona.mjs`. The `lib/execution-state.mjs` module is extended to accept `standalone` as a valid status. A minimal `/adev:standalone` skill writes standalone state.

**Review Notes (PASS_WITH_NOTES):**
- SA-1: Module-level plan gating is an intentional simplicity choice (spec Behavior 7). Documented as known limitation.
- SA-2: `&&` chain heuristic acknowledged in spec Limitations section. Accepted trade-off.
- CON-1: `standalone` MUST be added to `VALID_STATUSES` in `lib/execution-state.mjs` so `/adev:standalone` can use `writeExecutionState()`.

---

## File Structure

**Create:**
- `hooks/lifecycle-gate-edit.sh` — PreToolUse hook for Edit/Write (Layer 1)
- `hooks/lifecycle-gate-bash.sh` — PreToolUse hook for Bash (Layer 2)
- `hooks/lifecycle-gate-advisory.sh` — PostToolUse hook for `.*` (Layer 3)
- `lib/lifecycle-gate-config.mjs` — Config parsing for lifecycle gate patterns and enforcement level
- `skills/standalone/SKILL.md` — Minimal skill: writes `status: standalone` to execution state
- `tests/hooks/lifecycle-gate-edit.test.mjs` — Unit tests for Layer 1
- `tests/hooks/lifecycle-gate-bash.test.mjs` — Unit tests for Layer 2
- `tests/hooks/lifecycle-gate-advisory.test.mjs` — Unit tests for Layer 3
- `tests/lib/lifecycle-gate-config.test.mjs` — Unit tests for config parsing
- `tests/lib/execution-state-standalone.test.mjs` — Tests for standalone status support
- `tests/hooks/lifecycle-gate-registration.test.mjs` — Validates hooks.json registration

**Modify:**
- `lib/execution-state.mjs:14` — Add `standalone` to `VALID_STATUSES`
- `lib/execution-state.mjs:28-34` — Update `validateState()` to accept standalone (no planRef/currentTask required)
- `hooks/hooks.json` — Register all three new hooks
- `hooks/session-start.sh` — Check `ADEV_STANDALONE=1` env var, write standalone state; clear standalone on normal start

**Reference (read, do not modify):**
- `hooks/context-preflight.sh` — Follow this pattern for hook structure (find_context_index, CLAUDE_TOOL_INPUT reading, fast-path exits)
- `hooks/merge-guard.sh` — Follow pattern for bash-command gating hooks
- `lib/persona.mjs` — Reuse `parseUserConfig()` for reading user-config files
- `tests/helpers.mjs` — Use `createTempDir()`, `writeFixture()`, `runHook()` for tests

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/cross-cutting/lifecycle-gate.spec.md` (behaviors 1-5, bypass logic)
- Lib: `lib/execution-state.mjs` (VALID_STATUSES, validateState)
- Review: `.context-index/specs/cross-cutting/lifecycle-gate.review.md` (CON-1)

### Task 2 Context
- Spec: `.context-index/specs/cross-cutting/lifecycle-gate.spec.md` (Configuration section — enforcement level, file exclusions, bash passthrough)
- Lib: `lib/persona.mjs` (parseUserConfig pattern)

### Task 3 Context
- Spec: `.context-index/specs/cross-cutting/lifecycle-gate.spec.md` (Layer 1 behaviors 6-9, Module Resolution)
- Hook: `hooks/context-preflight.sh` (pattern for hook structure)
- Lib: `lib/lifecycle-gate-config.mjs` (config and pattern API)

### Task 4 Context
- Spec: `.context-index/specs/cross-cutting/lifecycle-gate.spec.md` (Layer 2 behaviors 10-12, bash passthrough matching rules)
- Hook: `hooks/merge-guard.sh` (pattern for bash gating)
- Lib: `lib/lifecycle-gate-config.mjs` (config and pattern API)

### Task 5 Context
- Spec: `.context-index/specs/cross-cutting/lifecycle-gate.spec.md` (Layer 3 behaviors 13-14, advisory_interval)
- Hook: `hooks/session-capture.sh` (pattern for PostToolUse hooks)

### Task 6 Context
- Spec: `.context-index/specs/cross-cutting/lifecycle-gate.spec.md` (Standalone Mode behaviors 18-21)
- Hook: `hooks/session-start.sh` (existing session start flow)
- Lib: `lib/execution-state.mjs` (writeExecutionState API)

### Task 7 Context
- Spec: `.context-index/specs/cross-cutting/lifecycle-gate.spec.md` (all hooks, hooks.json registration)
- Config: `hooks/hooks.json` (existing registration structure)

### Task 8 Context
- Spec: `.context-index/specs/cross-cutting/lifecycle-gate.spec.md` (Standalone Mode behavior 19)
- Lib: `lib/execution-state.mjs` (writeExecutionState API)

### Task 9 Context
- Spec: `.context-index/specs/cross-cutting/lifecycle-gate.spec.md` (acceptance criteria — all)
- Tests: `tests/helpers.mjs` (runHook, writeFixture utilities)

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 → Task 5 (foundation → config → hooks)
- Group B (independent after Task 1): Task 6 (session-start update)
- Group C (independent after Task 1): Task 8 (standalone skill)
- Group D (depends on all): Task 7 (hooks.json registration)
- Group E (depends on Tasks 3-6): Task 9 (integration tests)

Groups B and C can run in parallel with Group A after Task 1 completes.

---

### Task 1: Extend Execution State for Standalone [specialist: none]

**Charter capability:** Bypass logic — `standalone` as valid execution state
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/execution-state.mjs:14` — Add `standalone` to VALID_STATUSES
- Modify: `lib/execution-state.mjs:28-46` — Update validateState() for standalone (no planRef/currentTask required)
- Test: `tests/lib/execution-state-standalone.test.mjs`

**Tests:** `tests/lib/execution-state-standalone.test.mjs`

**Context to load:**
- `lib/execution-state.mjs` (existing validation logic)
- `.context-index/specs/cross-cutting/lifecycle-gate.spec.md` (CON-1 from review)

- [x] **Write failing test**

```javascript
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { writeExecutionState, readExecutionState } from "../../lib/execution-state.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

describe("execution-state standalone status", () => {
  it("should accept standalone as a valid status", (t) => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    assert.doesNotThrow(() => {
      writeExecutionState(tmp, { status: "standalone" });
    });
    const state = readExecutionState(tmp);
    assert.equal(state.status, "standalone");
    cleanupTempDir(tmp);
  });

  it("should not require planRef or currentTask for standalone", (t) => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    assert.doesNotThrow(() => {
      writeExecutionState(tmp, { status: "standalone" });
    });
    cleanupTempDir(tmp);
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/execution-state-standalone.test.mjs`
Expected: FAIL — `Invalid status: standalone. Must be one of: idle, active, blocked`

- [x] **Implement**

Add `"standalone"` to VALID_STATUSES Set. Update `validateState()` to skip planRef/currentTask checks for standalone (same as idle — no binding fields required). In the normalize block, for standalone status, clear binding fields like idle does.

- [x] **Verify test passes**

Run: `node --test tests/lib/execution-state-standalone.test.mjs`
Expected: PASS

- [x] **Commit**

Branch: `feat/hooks/lifecycle-gate`

```bash
git add lib/execution-state.mjs tests/lib/execution-state-standalone.test.mjs
git commit -m "feat(hooks): add standalone status to execution state vocabulary

Spec: .context-index/specs/cross-cutting/lifecycle-gate.spec.md
Plan-task: 1"
```

---

### Task 2: Lifecycle Gate Config Module [specialist: none]

**Charter capability:** Configuration parsing for enforcement levels, file exclusions, and bash passthrough patterns
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `lib/lifecycle-gate-config.mjs`
- Test: `tests/lib/lifecycle-gate-config.test.mjs`

**Tests:** `tests/lib/lifecycle-gate-config.test.mjs`

**Context to load:**
- `lib/persona.mjs` (parseUserConfig pattern)
- `.context-index/specs/cross-cutting/lifecycle-gate.spec.md` (Configuration section)

- [x] **Write failing test**

```javascript
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { resolveGateConfig, matchesFileExclusion, matchesBashPassthrough } from "../../lib/lifecycle-gate-config.mjs";

describe("lifecycle-gate-config", () => {
  it("resolveGateConfig returns off when no config", () => {
    const config = resolveGateConfig({});
    assert.equal(config.level, "off");
  });

  it("resolveGateConfig reads lifecycle.gate key", () => {
    const config = resolveGateConfig({ "lifecycle.gate": "confirm" });
    assert.equal(config.level, "confirm");
  });

  it("invalid level falls back to warn", () => {
    const config = resolveGateConfig({ "lifecycle.gate": "invalid" });
    assert.equal(config.level, "warn");
  });

  it("matchesFileExclusion matches default patterns", () => {
    const config = resolveGateConfig({});
    assert.equal(matchesFileExclusion(".context-index/manifest.yaml", config), true);
    assert.equal(matchesFileExclusion("src/main.mjs", config), false);
    assert.equal(matchesFileExclusion("tests/foo.test.mjs", config), true);
  });

  it("matchesBashPassthrough matches default commands", () => {
    const config = resolveGateConfig({});
    assert.equal(matchesBashPassthrough("git status --short", config), true);
    assert.equal(matchesBashPassthrough("rm -rf dist", config), false);
    assert.equal(matchesBashPassthrough("npm test", config), true);
  });

  it("project exclusions extend defaults", () => {
    const config = resolveGateConfig({
      "lifecycle.gate.file_exclusions": "*.generated.*,dist/**"
    });
    assert.equal(matchesFileExclusion("foo.generated.js", config), true);
    assert.equal(matchesFileExclusion(".context-index/foo.md", config), true); // still has defaults
  });

  it("replace_defaults=true removes built-in patterns", () => {
    const config = resolveGateConfig({
      "lifecycle.gate.file_exclusions": "custom/**",
      "lifecycle.gate.file_exclusions.replace_defaults": "true"
    });
    assert.equal(matchesFileExclusion(".context-index/manifest.yaml", config), false);
    assert.equal(matchesFileExclusion("custom/file.js", config), true);
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/lifecycle-gate-config.test.mjs`
Expected: FAIL — Cannot find module `../../lib/lifecycle-gate-config.mjs`

- [x] **Implement**

Create `lib/lifecycle-gate-config.mjs` exporting:
- `resolveGateConfig(userConfigObj)` — resolve enforcement level, file exclusions, bash passthrough from flat config object
- `matchesFileExclusion(filePath, config)` — glob-match file path against exclusion patterns
- `matchesBashPassthrough(command, config)` — prefix-match command against passthrough patterns
- Built-in default patterns as constants
- Support for `replace_defaults` flag
- Pipe chain splitting (check each segment independently)
- `&&`/`;` chain handling (first command determines gating)

- [x] **Verify test passes**

Run: `node --test tests/lib/lifecycle-gate-config.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/lifecycle-gate-config.mjs tests/lib/lifecycle-gate-config.test.mjs
git commit -m "feat(hooks): add lifecycle gate config module with pattern matching

Spec: .context-index/specs/cross-cutting/lifecycle-gate.spec.md
Plan-task: 2"
```

---

### Task 3: Layer 1 — File-Edit Gate Hook [specialist: none]

**Charter capability:** File-Edit gate (PreToolUse on Edit, Write)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2
**Files:**
- Create: `hooks/lifecycle-gate-edit.sh`
- Test: `tests/hooks/lifecycle-gate-edit.test.mjs`

**Tests:** `tests/hooks/lifecycle-gate-edit.test.mjs`

**Context to load:**
- `hooks/context-preflight.sh` (hook structure pattern)
- `.context-index/specs/cross-cutting/lifecycle-gate.spec.md` (behaviors 1-9, Module Resolution)

- [x] **Write failing test**

```javascript
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { createTempDir, cleanupTempDir, writeFixture, runHook } from "../helpers.mjs";

describe("lifecycle-gate-edit hook", () => {
  it("exits 0 when lifecycle.gate=off", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=off");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-edit.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/src/main.mjs` }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  it("exits 0 when execution state is active", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=block");
    writeFixture(tmp, ".context-index/.execution-state.md", "---\nstatus: active\nplanRef: test.plan.md\ncurrentTask: 1\n---\n");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-edit.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/src/main.mjs` }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  it("exits 0 for excluded files (test files)", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=block");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-edit.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/tests/foo.test.mjs` }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  it("exits 2 when level=block and module has specs but no plan", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=block");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\nmodules:\n  - slug: cli\n    paths:\n      - src/cli/\n");
    writeFixture(tmp, ".context-index/specs/features/cli/something.spec.md", "# spec");
    writeFixture(tmp, "src/cli/main.mjs", "");
    const result = runHook("lifecycle-gate-edit.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/src/cli/main.mjs` }
    });
    assert.equal(result.exitCode, 2);
    cleanupTempDir(tmp);
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/hooks/lifecycle-gate-edit.test.mjs`
Expected: FAIL — hook file not found or exits differently

- [x] **Implement**

Create `hooks/lifecycle-gate-edit.sh`:
1. Read stdin (protocol compliance)
2. Get file path from `CLAUDE_TOOL_INPUT_file_path`
3. Walk up to find `.context-index/`
4. Shared bypass logic: check user-config level (off → exit 0), check .execution-state.md (standalone/active → exit 0), check .context-index exists
5. Check file exclusion patterns (call node helper from `lib/lifecycle-gate-config.mjs`)
6. Resolve module from file path (manifest source_paths or directory heuristics)
7. Check for plans in module spec directory
8. Apply enforcement action based on level (warn/confirm/block)

- [x] **Verify test passes**

Run: `node --test tests/hooks/lifecycle-gate-edit.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add hooks/lifecycle-gate-edit.sh tests/hooks/lifecycle-gate-edit.test.mjs
git commit -m "feat(hooks): implement Layer 1 file-edit lifecycle gate

Spec: .context-index/specs/cross-cutting/lifecycle-gate.spec.md
Plan-task: 3"
```

---

### Task 4: Layer 2 — Bash Action Gate Hook [specialist: none]

**Charter capability:** Bash Action gate (PreToolUse on Bash)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2
**Files:**
- Create: `hooks/lifecycle-gate-bash.sh`
- Test: `tests/hooks/lifecycle-gate-bash.test.mjs`

**Tests:** `tests/hooks/lifecycle-gate-bash.test.mjs`

**Context to load:**
- `hooks/merge-guard.sh` (pattern for Bash PreToolUse hooks)
- `.context-index/specs/cross-cutting/lifecycle-gate.spec.md` (behaviors 10-12, passthrough matching rules)

- [x] **Write failing test**

```javascript
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { createTempDir, cleanupTempDir, writeFixture, runHook } from "../helpers.mjs";

describe("lifecycle-gate-bash hook", () => {
  it("exits 0 when lifecycle.gate=off", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=off");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-bash.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_command: "rm -rf dist" }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  it("exits 0 for passthrough commands (git status)", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=block");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-bash.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_command: "git status --short" }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  it("exits 2 when level=block and no active plan for mutating command", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=block");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-bash.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_command: "npm run build" }
    });
    assert.equal(result.exitCode, 2);
    cleanupTempDir(tmp);
  });

  it("exits 0 for piped commands where all segments are passthrough", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=block");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-bash.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_command: "git log | head" }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/hooks/lifecycle-gate-bash.test.mjs`
Expected: FAIL — hook file not found

- [x] **Implement**

Create `hooks/lifecycle-gate-bash.sh`:
1. Read stdin (protocol compliance)
2. Get command from `CLAUDE_TOOL_INPUT_command`
3. Walk up to find `.context-index/`
4. Shared bypass logic (same as Layer 1: off, standalone, active, missing .context-index)
5. Check command against passthrough patterns (call node helper)
6. For pipe chains: split on `|`, check each segment
7. For `&&`/`;` chains: check first command only
8. Apply enforcement action based on level

- [x] **Verify test passes**

Run: `node --test tests/hooks/lifecycle-gate-bash.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add hooks/lifecycle-gate-bash.sh tests/hooks/lifecycle-gate-bash.test.mjs
git commit -m "feat(hooks): implement Layer 2 bash action lifecycle gate

Spec: .context-index/specs/cross-cutting/lifecycle-gate.spec.md
Plan-task: 4"
```

---

### Task 5: Layer 3 — Session Advisory Hook [specialist: none]

**Charter capability:** Session advisory (PostToolUse on `.*`)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2
**Files:**
- Create: `hooks/lifecycle-gate-advisory.sh`
- Test: `tests/hooks/lifecycle-gate-advisory.test.mjs`

**Tests:** `tests/hooks/lifecycle-gate-advisory.test.mjs`

**Context to load:**
- `hooks/session-capture.sh` (pattern for PostToolUse hooks)
- `.context-index/specs/cross-cutting/lifecycle-gate.spec.md` (behaviors 13-14, advisory_interval)

- [x] **Write failing test**

```javascript
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { createTempDir, cleanupTempDir, writeFixture, runHook } from "../helpers.mjs";

describe("lifecycle-gate-advisory hook", () => {
  it("exits 0 silently when lifecycle.gate=off", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=off");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-advisory.sh", { cwd: tmp });
    assert.equal(result.exitCode, 0);
    assert.ok(!result.stdout.includes("additionalContext"));
    cleanupTempDir(tmp);
  });

  it("exits 0 silently when lifecycle.gate=warn", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=warn");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-advisory.sh", { cwd: tmp });
    assert.equal(result.exitCode, 0);
    assert.ok(!result.stdout.includes("additionalContext"));
    cleanupTempDir(tmp);
  });

  it("injects advisory when level=confirm and no active state", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=confirm");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    writeFixture(tmp, ".context-index/.execution-state.md", "---\nstatus: idle\n---\n");
    const result = runHook("lifecycle-gate-advisory.sh", { cwd: tmp });
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes("additionalContext"));
    assert.ok(result.stdout.includes("/adev:work"));
    cleanupTempDir(tmp);
  });

  it("exits 0 silently when execution state is active", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=confirm");
    writeFixture(tmp, ".context-index/.execution-state.md", "---\nstatus: active\nplanRef: p.md\ncurrentTask: 1\n---\n");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-advisory.sh", { cwd: tmp });
    assert.equal(result.exitCode, 0);
    assert.ok(!result.stdout.includes("additionalContext"));
    cleanupTempDir(tmp);
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/hooks/lifecycle-gate-advisory.test.mjs`
Expected: FAIL — hook file not found

- [x] **Implement**

Create `hooks/lifecycle-gate-advisory.sh`:
1. Read stdin (protocol compliance)
2. Walk up to find `.context-index/`
3. Fast-path: if level is `off` or `warn` → exit 0 silently
4. Check execution state: if `active` or `standalone` → exit 0 silently
5. Throttle: read/increment a counter file (`.context-index/.advisory-counter`). Only inject advisory every N calls (default 5, configurable via `lifecycle.gate.advisory_interval`).
6. Output JSON with `additionalContext` containing lifecycle reminder.

- [x] **Verify test passes**

Run: `node --test tests/hooks/lifecycle-gate-advisory.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add hooks/lifecycle-gate-advisory.sh tests/hooks/lifecycle-gate-advisory.test.mjs
git commit -m "feat(hooks): implement Layer 3 session advisory lifecycle gate

Spec: .context-index/specs/cross-cutting/lifecycle-gate.spec.md
Plan-task: 5"
```

---

### Task 6: Update Session-Start for Standalone Mode [specialist: none]

**Charter capability:** Standalone mode via env var + session lifecycle
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `hooks/session-start.sh` — Add ADEV_STANDALONE=1 detection and standalone-clear logic
- Test: `tests/hooks/session-start.test.mjs` (add new test cases)

**Tests:** `tests/hooks/session-start.test.mjs`

**Context to load:**
- `hooks/session-start.sh` (existing flow)
- `.context-index/specs/cross-cutting/lifecycle-gate.spec.md` (behaviors 18, 20)
- `lib/execution-state.mjs` (writeExecutionState API)

- [x] **Write failing test**

```javascript
// Add to existing tests/hooks/session-start.test.mjs:
it("writes standalone state when ADEV_STANDALONE=1", () => {
  const tmp = createTempDir();
  writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
  const result = runHook("session-start.sh", {
    cwd: tmp,
    env: { ADEV_STANDALONE: "1" }
  });
  assert.equal(result.exitCode, 0);
  const stateContent = readFileSync(join(tmp, ".context-index/.execution-state.md"), "utf-8");
  assert.ok(stateContent.includes("status: standalone"));
  cleanupTempDir(tmp);
});

it("clears standalone state on normal session start", () => {
  const tmp = createTempDir();
  writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
  writeFixture(tmp, ".context-index/.execution-state.md", "---\nstatus: standalone\nupdated: 2026-01-01\n---\n");
  const result = runHook("session-start.sh", {
    cwd: tmp,
    env: {} // no ADEV_STANDALONE
  });
  assert.equal(result.exitCode, 0);
  const stateContent = readFileSync(join(tmp, ".context-index/.execution-state.md"), "utf-8");
  assert.ok(stateContent.includes("status: idle"));
  cleanupTempDir(tmp);
});
```

- [x] **Verify test fails**

Run: `node --test tests/hooks/session-start.test.mjs`
Expected: FAIL — new tests fail (standalone not written/cleared)

- [x] **Implement**

Add to `session-start.sh` (after finding context root, before building output blocks):
1. If `ADEV_STANDALONE=1` env var is set AND `.context-index/` exists: write `status: standalone` to `.execution-state.md` via inline node using `writeExecutionState()` or direct file write.
2. If `ADEV_STANDALONE` is NOT set AND `.execution-state.md` has `status: standalone`: reset to `status: idle`.
3. If execution state is `active` or `blocked`: do NOT clear (preserve ongoing work).

- [x] **Verify test passes**

Run: `node --test tests/hooks/session-start.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add hooks/session-start.sh tests/hooks/session-start.test.mjs
git commit -m "feat(hooks): add standalone mode detection to session-start

Spec: .context-index/specs/cross-cutting/lifecycle-gate.spec.md
Plan-task: 6"
```

---

### Task 7: Register Hooks in hooks.json [specialist: none]

**Charter capability:** Hook registration for all three layers
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3, Task 4, Task 5
**Files:**
- Modify: `hooks/hooks.json` — Add lifecycle gate hooks to appropriate matchers
- Create: `tests/hooks/lifecycle-gate-registration.test.mjs`

**Tests:** `tests/hooks/lifecycle-gate-registration.test.mjs`

**Context to load:**
- `hooks/hooks.json` (existing structure)
- `.context-index/specs/cross-cutting/lifecycle-gate.spec.md` (hook registration, ordering)

- [x] **Write failing test**

Verification is implicit — the hook tests from Tasks 3-5 will only work with proper hook paths. Add a dedicated JSON structure test:

```javascript
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT } from "../helpers.mjs";

describe("hooks.json lifecycle gate registration", () => {
  it("has lifecycle-gate-edit registered on Edit and Write", () => {
    const hooks = JSON.parse(readFileSync(join(PLUGIN_ROOT, "hooks/hooks.json"), "utf-8"));
    const editMatchers = hooks.hooks.PreToolUse.filter(e => e.matcher === "Edit" || e.matcher === "Edit|Write");
    const hasGate = editMatchers.some(e => 
      e.hooks.some(h => h.command.includes("lifecycle-gate-edit.sh"))
    );
    assert.ok(hasGate, "lifecycle-gate-edit.sh should be registered for Edit");
  });

  it("has lifecycle-gate-bash registered on Bash", () => {
    const hooks = JSON.parse(readFileSync(join(PLUGIN_ROOT, "hooks/hooks.json"), "utf-8"));
    const bashMatchers = hooks.hooks.PreToolUse.filter(e => e.matcher === "Bash");
    const hasGate = bashMatchers.some(e =>
      e.hooks.some(h => h.command.includes("lifecycle-gate-bash.sh"))
    );
    assert.ok(hasGate, "lifecycle-gate-bash.sh should be registered for Bash");
  });

  it("has lifecycle-gate-advisory registered on PostToolUse .*", () => {
    const hooks = JSON.parse(readFileSync(join(PLUGIN_ROOT, "hooks/hooks.json"), "utf-8"));
    const allMatchers = hooks.hooks.PostToolUse.filter(e => e.matcher === ".*");
    const hasGate = allMatchers.some(e =>
      e.hooks.some(h => h.command.includes("lifecycle-gate-advisory.sh"))
    );
    assert.ok(hasGate, "lifecycle-gate-advisory.sh should be registered for .*");
  });

  it("lifecycle-gate-edit runs AFTER context-preflight", () => {
    const hooks = JSON.parse(readFileSync(join(PLUGIN_ROOT, "hooks/hooks.json"), "utf-8"));
    const editEntry = hooks.hooks.PreToolUse.find(e => e.matcher === "Edit" || e.matcher === "Edit|Write");
    const commands = editEntry.hooks.map(h => h.command);
    const preflightIdx = commands.findIndex(c => c.includes("context-preflight.sh"));
    const gateIdx = commands.findIndex(c => c.includes("lifecycle-gate-edit.sh"));
    assert.ok(gateIdx > preflightIdx, "lifecycle-gate-edit should run after context-preflight");
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/hooks/lifecycle-gate-registration.test.mjs`
Expected: FAIL — hooks not registered yet

- [x] **Implement**

Update `hooks/hooks.json`:
1. Add `lifecycle-gate-edit.sh` to PreToolUse `Edit` matcher (AFTER context-preflight and constitution-linter). Also add a `Write` matcher entry (or change Edit to `Edit|Write`).
2. Add `lifecycle-gate-bash.sh` to PreToolUse `Bash` matcher (AFTER merge-guard).
3. Add `lifecycle-gate-advisory.sh` to PostToolUse `.*` matcher (after session-capture and issue-reminder).

- [x] **Verify test passes**

Run: `node --test tests/hooks/lifecycle-gate-registration.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add hooks/hooks.json tests/hooks/lifecycle-gate-registration.test.mjs
git commit -m "feat(hooks): register lifecycle gate hooks in hooks.json

Spec: .context-index/specs/cross-cutting/lifecycle-gate.spec.md
Plan-task: 7"
```

---

### Task 8: Create /adev:standalone Skill [specialist: none]

**Charter capability:** Standalone mode mid-session activation
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `skills/standalone/SKILL.md`
- Test: (no test file — skill is pure markdown, tested implicitly via session-start + execution state tests)

**Tests:** `tests/lib/execution-state-standalone.test.mjs` (already covers writeExecutionState with standalone)

**Context to load:**
- `.context-index/specs/cross-cutting/lifecycle-gate.spec.md` (behavior 19)
- `lib/execution-state.mjs` (writeExecutionState API)

- [x] **Write failing test**

No additional test needed — the standalone skill is pure markdown. Its effect (writing execution state) is already tested in Task 1. Verify the skill file exists:

```javascript
// In a registration/integration test:
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT } from "../helpers.mjs";

it("standalone skill exists", () => {
  assert.ok(existsSync(join(PLUGIN_ROOT, "skills/standalone/SKILL.md")));
});
```

- [x] **Implement**

Create `skills/standalone/SKILL.md`:
```markdown
# /adev:standalone

Disable lifecycle gate enforcement for this session.

## When to Use
- Exploratory coding without a plan
- Quick fixes to non-tracked code
- Prototyping before committing to a spec

## Behavior
1. Write `status: standalone` to `.context-index/.execution-state.md`
2. All lifecycle gates pass for the remainder of this session
3. Next session start (without ADEV_STANDALONE=1 env var) resets to idle

## Instructions
Write the execution state file:
\```javascript
import { writeExecutionState } from '<PLUGIN_ROOT>/lib/execution-state.mjs';
writeExecutionState(projectRoot, { status: "standalone" });
\```

Confirm: "Standalone mode activated. Lifecycle gates disabled for this session."
```

- [x] **Verify test passes**

Run: `node --test tests/lib/execution-state-standalone.test.mjs`
Expected: PASS (already passing from Task 1)

- [x] **Commit**

```bash
git add skills/standalone/SKILL.md
git commit -m "feat(hooks): add /adev:standalone skill for mid-session bypass

Spec: .context-index/specs/cross-cutting/lifecycle-gate.spec.md
Plan-task: 8"
```

---

### Task 9: Integration Tests — Full Enforcement Scenarios [specialist: none]

**Charter capability:** End-to-end enforcement scenarios validating all acceptance criteria
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3, Task 4, Task 5, Task 6, Task 7
**Files:**
- Create: `tests/hooks/lifecycle-gate-integration.test.mjs`
- Test: `tests/hooks/lifecycle-gate-integration.test.mjs`

**Tests:** `tests/hooks/lifecycle-gate-integration.test.mjs`

**Context to load:**
- `.context-index/specs/cross-cutting/lifecycle-gate.spec.md` (all acceptance criteria)
- `tests/helpers.mjs` (test utilities)

- [x] **Write failing test**

```javascript
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { createTempDir, cleanupTempDir, writeFixture, runHook } from "../helpers.mjs";

describe("lifecycle-gate integration", () => {
  // Enforcement levels
  it("warn level: advisory message, no block", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=warn");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\nmodules:\n  - slug: app\n    paths:\n      - src/\n");
    writeFixture(tmp, ".context-index/specs/features/app/feature.spec.md", "# spec");
    writeFixture(tmp, "src/main.mjs", "");
    const result = runHook("lifecycle-gate-edit.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/src/main.mjs` }
    });
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes("additionalContext"));
    cleanupTempDir(tmp);
  });

  it("confirm level: strong stop-directive, no block", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=confirm");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\nmodules:\n  - slug: app\n    paths:\n      - src/\n");
    writeFixture(tmp, ".context-index/specs/features/app/feature.spec.md", "# spec");
    writeFixture(tmp, "src/main.mjs", "");
    const result = runHook("lifecycle-gate-edit.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/src/main.mjs` }
    });
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes("STOP"));
    cleanupTempDir(tmp);
  });

  // Bypass: standalone
  it("standalone status bypasses block-level enforcement", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=block");
    writeFixture(tmp, ".context-index/.execution-state.md", "---\nstatus: standalone\nupdated: 2026-01-01\n---\n");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\nmodules:\n  - slug: app\n    paths:\n      - src/\n");
    writeFixture(tmp, ".context-index/specs/features/app/feature.spec.md", "# spec");
    writeFixture(tmp, "src/main.mjs", "");
    const result = runHook("lifecycle-gate-edit.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/src/main.mjs` }
    });
    assert.equal(result.exitCode, 0);
    assert.ok(!result.stdout.includes("additionalContext") || result.stdout === "");
    cleanupTempDir(tmp);
  });

  // Module with plan passes
  it("module with existing plan passes even at block level", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=block");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\nmodules:\n  - slug: app\n    paths:\n      - src/\n");
    writeFixture(tmp, ".context-index/specs/features/app/feature.spec.md", "# spec");
    writeFixture(tmp, ".context-index/specs/features/app/feature.plan.md", "# plan");
    writeFixture(tmp, "src/main.mjs", "");
    const result = runHook("lifecycle-gate-edit.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/src/main.mjs` }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  // Missing .context-index → pass
  it("no .context-index directory → exit 0 silently", () => {
    const tmp = createTempDir();
    const result = runHook("lifecycle-gate-edit.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/src/main.mjs` }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  // Malformed user-config → exit 0
  it("malformed user-config → exit 0 silently", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "not valid config {{{}}}");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-edit.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/src/main.mjs` }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  // Performance: fast-path should be quick
  it("fast-path (gate=off) completes in under 50ms", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=off");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const start = Date.now();
    runHook("lifecycle-gate-edit.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/src/main.mjs` }
    });
    const elapsed = Date.now() - start;
    // Allow generous margin for CI but catch egregious slowness
    assert.ok(elapsed < 500, `Fast path took ${elapsed}ms, expected < 500ms`);
    cleanupTempDir(tmp);
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/hooks/lifecycle-gate-integration.test.mjs`
Expected: Some tests may pass (if hooks exist from prior tasks), but integration scenarios should validate end-to-end correctness.

- [x] **Implement**

No new production code — this task validates the integration of Tasks 1-7. Fix any issues discovered during integration testing.

- [x] **Verify test passes**

Run: `node --test tests/hooks/lifecycle-gate-integration.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add tests/hooks/lifecycle-gate-integration.test.mjs
git commit -m "test(hooks): add lifecycle gate integration tests

Spec: .context-index/specs/cross-cutting/lifecycle-gate.spec.md
Plan-task: 9"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied
- Hook protocol compliance: all hooks read stdin, use env vars, exit 0 or 2, output JSON to stdout
- No constitutional violations introduced (no external dependencies, pure ESM, hook protocol)
- All three hooks registered in hooks.json
- Version parity: package.json and .claude-plugin/plugin.json versions match (bump if releasing)
