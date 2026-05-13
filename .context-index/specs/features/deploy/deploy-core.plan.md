<!-- DO NOT EDIT statuses inline — see lifecycle log deploy-core.jsonl -->
# Implementation Plan: Deploy Core

> **Methodology:** adev
> **Charter:** .context-index/specs/features/deploy/charter.md
> **Spec:** .context-index/specs/features/deploy/deploy-core.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-09)
> **Platform:** Node.js, JavaScript (ESM), node:test, npm

**Goal:** Implement the core deployment pipeline library and skill: config loading/validation, step execution (shell, manual, verify, gate, ci-trigger), milestone integration, failure/rollback flow, output redaction, and deploy summary.

**Architecture:** The deploy feature lives in two files: `lib/deploy.mjs` (companion code with all functions) and `skills/deploy/SKILL.md` (skill instructions for Claude). The library reuses `parseYaml` from `lib/profiles/yaml.mjs` for YAML parsing with no new dependencies. Step executors use `child_process.execFile` with `shell: false` for security. The executor framework uses an injectable executor pattern for testability. Milestone integration depends on `lib/milestones.mjs` which does not yet exist -- Task 9 is blocked until it ships from the milestone-lifecycle feature.

---

## File Structure

**Create:**
- `lib/deploy.mjs` -- Deploy config loader, validator, step executors, and orchestrator
- `tests/deploy.test.mjs` -- Unit tests for all deploy library functions
- `skills/deploy/SKILL.md` -- Deploy skill instructions for Claude

**Modify:**
- (none -- all new files)

**Reference (read, do not modify):**
- `lib/profiles/yaml.mjs` -- Reuse `parseYaml` for YAML parsing
- `lib/source-manifest.mjs` -- Follow this module's JSDoc and export patterns
- `tests/helpers.mjs` -- Use `createTempDir()`, `cleanupTempDir()`, `writeFixture()` for test setup
- `.context-index/samples/general-library-module-graph.md` -- Follow library module conventions
- `.context-index/samples/general-test-helpers.md` -- Follow test helper patterns

## Context Packets

### Task 1 Context
- Spec: `deploy-core.spec.md` (Behaviors 1-4, 15; AC 1-5, 17-19)
- Charter: `charter.md` (Deploy Config Schema capability, Domain Model)
- Source files: `lib/profiles/yaml.mjs` (full read -- reuse parseYaml)
- Sample: `.context-index/samples/general-library-module-graph.md`

### Task 2 Context
- Spec: `deploy-core.spec.md` (Behavior 4; AC 4, 19)
- Source files: `lib/deploy.mjs` (Task 1 output -- validateDeployConfig function)

### Task 3 Context
- Spec: `deploy-core.spec.md` (Behaviors 7-11, 16; AC 6, 16-17)
- Charter: `charter.md` (Deploy Execute capability, DeployRun entity)
- Source files: `lib/deploy.mjs` (Task 1 output)
- Sample: `.context-index/samples/general-library-module-graph.md`

### Task 4 Context
- Spec: `deploy-core.spec.md` (Behavior 7; AC 6)
- Source files: `lib/deploy.mjs` (Task 3 output -- step executor registry)

### Task 5 Context
- Spec: `deploy-core.spec.md` (Behavior 8; AC 7)
- Source files: `lib/deploy.mjs` (Task 3 output)

### Task 6 Context
- Spec: `deploy-core.spec.md` (Behavior 9; AC 8)
- Source files: `lib/deploy.mjs` (Task 3 output)

### Task 7 Context
- Spec: `deploy-core.spec.md` (Behavior 10; AC 9, 20)
- Source files: `lib/deploy.mjs` (Task 3 output)

### Task 8 Context
- Spec: `deploy-core.spec.md` (Behavior 11; AC 10, 21)
- Source files: `lib/deploy.mjs` (Task 3 output)

### Task 9 Context
- Spec: `deploy-core.spec.md` (Behaviors 5-6; AC 11-12)
- Charter: `charter.md` (Milestone Integration capability, consumed API: loadMilestones)
- Source files: `lib/milestones.mjs` (if exists -- BLOCKED if not)

### Task 10 Context
- Spec: `deploy-core.spec.md` (Behaviors 12-13; AC 13-14)
- Source files: `lib/deploy.mjs` (Tasks 3-8 output -- executor framework)

### Task 11 Context
- Spec: `deploy-core.spec.md` (all behaviors -- full spec)
- Charter: `charter.md` (full charter for skill instructions)
- Source files: `lib/deploy.mjs` (Tasks 1-10 output)
- Reference: existing skill files (e.g., `skills/build/SKILL.md` for structure)

### Task 12 Context
- Spec: `deploy-core.spec.md` (Behavior 14; AC 15)
- Source files: `lib/deploy.mjs` (executor framework, DeployRun structure)

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: Summarized skill output produces equivalent artifact quality (confidence: medium)
- **Pattern:** When a skill writes an artifact to disk (plan, review, validation report), instruct it to return only a structured summary to the conversation.
- **Anti-pattern:** Assume that shorter output means lower quality artifacts.

## Parallelization

- Group A (sequential): Task 1 -> Task 2 (Task 2 extends validateDeployConfig from Task 1)
- Group B (sequential): Task 1 -> Task 3 -> Task 4, Task 5, Task 6, Task 7, Task 8 (Task 3 builds the framework; Tasks 4-8 implement individual step executors)
- Group C (independent after Task 3): Task 10 (failure/rollback depends on executor framework)
- Group D (independent): Task 9 (milestone integration -- standalone, BLOCKED on external dep)
- Group E (independent after Tasks 1-10): Task 11 (SKILL.md -- needs all lib functions)
- Group F (independent after Task 3): Task 12 (deploy summary)

Tasks 4, 5, 6, 7, 8 can run in parallel with each other (no shared file dependencies beyond the executor framework from Task 3).
Task 12 can run in parallel with Tasks 4-8.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Deploy config schema, loader, and validator | medium | unit | -- | 2 create |
| 2 | Secret detection in validation | small | unit | Task 1 | 0 create, 2 modify |
| 3 | Step executor framework and output redaction | medium | unit | Task 1 | 0 create, 2 modify |
| 4 | Shell step executor | small | unit | Task 3 | 0 create, 2 modify |
| 5 | Manual step executor | small | unit | Task 3 | 0 create, 2 modify |
| 6 | Verify step executor | small | unit | Task 3 | 0 create, 2 modify |
| 7 | Gate step executor | medium | unit | Task 3 | 0 create, 2 modify |
| 8 | CI-trigger step executor | medium | unit | Task 3 | 0 create, 2 modify |
| 9 | Milestone integration | small | unit | -- | 0 create, 2 modify |
| 10 | Failure and rollback flow | medium | unit | Task 3 | 0 create, 2 modify |
| 11 | Deploy skill SKILL.md | medium | unit | Tasks 1-10 | 1 create |
| 12 | Deploy run summary | small | unit | Task 3 | 0 create, 2 modify |

---

### Task 1: Deploy config schema, loader, and validator [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=4
**Rationale:** Well-specified config loader with exact acceptance criteria and direct golden sample match for library module pattern; minimal blast radius.

**Charter capability:** Deploy Config Schema
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/deploy.mjs`
- Create: `tests/deploy.test.mjs`

**Tests:** `tests/deploy.test.mjs`

**Context to load:**
- `lib/profiles/yaml.mjs` (reuse parseYaml)
- `.context-index/samples/general-library-module-graph.md`

- [x] **Write failing test**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("loadDeployConfig", () => {
  it("returns a DeployConfig object from valid deploy.yaml", () => {
    // Write fixture deploy.yaml, call loadDeployConfig, assert structure
  });

  it("returns null when deploy.yaml does not exist", () => {
    // Call loadDeployConfig on empty dir, assert null
  });
});

describe("validateDeployConfig", () => {
  it("returns errors for duplicate step IDs", () => {
    // Config with duplicate step IDs, assert errors array
  });

  it("returns empty errors for valid config", () => {
    // Valid config, assert empty errors
  });

  it("warns about missing env vars without blocking", () => {
    // Config with $NPM_TOKEN ref, env var not set, assert warning not error
  });

  it("rejects YAML with anchors/aliases", () => {
    // YAML containing & or *, assert INVALID_CONFIG error
  });

  it("rejects YAML with multi-document separators", () => {
    // YAML with --- after first, assert INVALID_CONFIG error
  });

  it("rejects YAML with merge keys", () => {
    // YAML with <<:, assert INVALID_CONFIG error
  });

  it("rejects YAML with tag directives", () => {
    // YAML with !, assert INVALID_CONFIG error
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/deploy.test.mjs`
Expected: FAIL -- module `lib/deploy.mjs` not found

- [x] **Implement**

Create `lib/deploy.mjs` with:
- `import { parseYaml } from './profiles/yaml.mjs'`
- `import { readFileSync } from 'node:fs'`
- `import { join } from 'node:path'`
- `loadDeployConfig(projectRoot)`: reads `.context-index/deploy.yaml`, parses with `parseYaml`, returns `{ environments, steps, variables }` or `null` if file missing
- `validateDeployConfig(config)`: checks duplicate step IDs per environment, checks for rejected YAML constructs (anchors `&`/`*`, multi-document `---`, merge keys `<<:`, tag directives `!`) in raw source before parsing, checks env var references (`$VAR_NAME` pattern) against `process.env` and returns warnings array. Returns `{ errors: [], warnings: [] }`
- Error codes: `NO_CONFIG`, `INVALID_CONFIG`, `DUPLICATE_STEP_ID`

Design the raw-source pre-check as a separate function `checkYamlSafety(rawSource)` that scans for rejected constructs before `parseYaml` is called. This avoids relying on `parseYaml` to reject these.

- [x] **Verify test passes**

Run: `node --test tests/deploy.test.mjs`
Expected: PASS

- [x] **Commit**

Branch: `feat/deploy/deploy-core`

```bash
git add lib/deploy.mjs tests/deploy.test.mjs
git commit -m "feat(deploy): add deploy config schema, loader, and validator

Spec: .context-index/specs/features/deploy/deploy-core.spec.md
Plan-task: 1"
```

---

### Task 2: Secret detection in validation [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Spec provides exact regex patterns verbatim; extends existing validation function with mechanical pattern matching.

**Charter capability:** Deploy Config Schema
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `lib/deploy.mjs` (add secret detection to validateDeployConfig)
- Modify: `tests/deploy.test.mjs` (add secret detection tests)

**Tests:** `tests/deploy.test.mjs`

**Context to load:**
- Spec Behavior 4 (regex patterns for secret detection)

- [x] **Write failing test**

```javascript
describe("validateDeployConfig - secret detection", () => {
  it("detects high-entropy strings (32+ chars base64-like)", () => {
    // Step with command containing a 32-char base64 string
  });

  it("detects prefixed API keys", () => {
    // Step with sk_live_abc123... pattern
  });

  it("detects AWS-style keys", () => {
    // Step with AKIAIOSFODNN7EXAMPLE
  });

  it("detects generic password patterns", () => {
    // Step with password=mysecret
  });

  it("allows env var references ($VAR_NAME) without flagging", () => {
    // Step with $NPM_TOKEN, assert no INLINE_SECRET error
  });

  it("returns INLINE_SECRET error code with step ID", () => {
    // Verify error includes step ID and description
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/deploy.test.mjs`
Expected: FAIL -- secret detection not implemented

- [x] **Implement**

Add to `lib/deploy.mjs`:
- `detectInlineSecrets(stepConfig)`: applies four regex patterns from spec Behavior 4 to command strings and argument values of `shell` and `ci-trigger` steps
- Integrate into `validateDeployConfig()`: for each shell/ci-trigger step, run secret detection, add `INLINE_SECRET` errors to the errors array with step ID
- Patterns:
  - `/[A-Za-z0-9+/=_-]{32,}/` (high-entropy)
  - `/(sk|pk|api|token|key|secret|password|bearer)[_-]?[A-Za-z0-9]{16,}/i` (prefixed)
  - `/(AKIA|ASIA)[A-Z0-9]{16}/` (AWS)
  - `/(password|passwd|pwd)\s*[:=]\s*\S+/i` (generic password)

- [x] **Verify test passes**

Run: `node --test tests/deploy.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/deploy.mjs tests/deploy.test.mjs
git commit -m "feat(deploy): add regex-based inline secret detection to config validation

Spec: .context-index/specs/features/deploy/deploy-core.spec.md
Plan-task: 2"
```

---

### Task 3: Step executor framework and output redaction [specialist: none]

**Routing:** assisted-agent (score: 15/20)
**Scores:** spec=4 pattern=3 blast=5 novelty=3
**Rationale:** Executor registry + redaction + injectable executors combines multiple patterns; no golden sample for orchestrator pattern; DeployRun structure needs inference from charter.

**Charter capability:** Deploy Execute
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `lib/deploy.mjs` (add executor framework, DeployRun structure, redaction)
- Modify: `tests/deploy.test.mjs` (add executor framework tests)

**Tests:** `tests/deploy.test.mjs`

**Context to load:**
- Spec Behaviors 7-11, 16 (step types, output redaction)
- Charter Domain Model (DeployRun entity)

- [x] **Write failing test**

```javascript
describe("executeDeploy", () => {
  it("executes steps in order and records results in DeployRun", () => {
    // Config with 3 steps, mock executor, verify order and results
  });

  it("supports injectable executor for testability", () => {
    // Pass mock executor, verify it receives step configs
  });
});

describe("redactOutput", () => {
  it("replaces env var values with <REDACTED:$VAR_NAME>", () => {
    // Output containing NPM_TOKEN value, assert redacted
  });

  it("handles multiple env vars in same output", () => {
    // Output with two different env var values
  });

  it("does not redact when no env vars match", () => {
    // Output with no matching values, assert unchanged
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/deploy.test.mjs`
Expected: FAIL -- executeDeploy and redactOutput not defined

- [x] **Implement**

Add to `lib/deploy.mjs`:
- `DeployRun` structure: `{ version, environment, started, stepResults: [], status, duration }`
- `redactOutput(text, variables)`: for each variable in the deploy config's `variables` field, replaces the env var's actual value with `<REDACTED:$VAR_NAME>` in the text. Only redacts variables declared in deploy.yaml (per review note SEC-8).
- `executeDeploy(projectRoot, options)`: orchestrator function that:
  - Loads and validates the config
  - Resolves version (placeholder for Task 9)
  - Creates a `DeployRun` record
  - Iterates through steps in order, dispatching to type-specific executors
  - Applies `redactOutput` to all captured stdout/stderr before recording
  - Uses an executor registry pattern: `{ shell: executeShell, manual: executeManual, verify: executeVerify, gate: executeGate, 'ci-trigger': executeCiTrigger }`
  - Accepts an optional `executors` override for testability

- [x] **Verify test passes**

Run: `node --test tests/deploy.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/deploy.mjs tests/deploy.test.mjs
git commit -m "feat(deploy): add step executor framework with output redaction

Spec: .context-index/specs/features/deploy/deploy-core.spec.md
Plan-task: 3"
```

---

### Task 4: Shell step executor [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Fully specified execFile wrapper with clear exit code semantics; mechanical implementation with established Node.js patterns.

**Charter capability:** Deploy Execute
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Modify: `lib/deploy.mjs` (implement executeShell)
- Modify: `tests/deploy.test.mjs` (add shell executor tests)

**Tests:** `tests/deploy.test.mjs`

- [x] **Write failing test**

```javascript
describe("executeShell", () => {
  it("runs command via execFile with shell: false", () => {
    // Use echo or a simple command, verify execFile called correctly
  });

  it("captures stdout and stderr", () => {
    // Command that writes to both, verify captured
  });

  it("records exit code and duration in step result", () => {
    // Successful and failing commands, check result fields
  });

  it("returns STEP_FAILED on non-zero exit", () => {
    // Command that exits 1, verify error code
  });

  it("returns CMD_NOT_FOUND when command does not exist", () => {
    // Non-existent command, verify error code
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/deploy.test.mjs`
Expected: FAIL -- executeShell not implemented

- [x] **Implement**

Add to `lib/deploy.mjs`:
- `executeShell(step, context)`: uses `execFile` from `node:child_process` with `shell: false`, passes command as first arg and step `args` as array. Captures stdout/stderr. Records `{ status: "succeeded"|"failed", exitCode, stdout, stderr, duration }`. Uses `ENOENT` error code from execFile to detect CMD_NOT_FOUND.

- [x] **Verify test passes**

Run: `node --test tests/deploy.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/deploy.mjs tests/deploy.test.mjs
git commit -m "feat(deploy): implement shell step executor with execFile

Spec: .context-index/specs/features/deploy/deploy-core.spec.md
Plan-task: 4"
```

---

### Task 5: Manual step executor [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=4
**Rationale:** Clear behavioral spec with callback-injection pattern for user input; no interactive prompt golden sample but pattern is straightforward.

**Charter capability:** Deploy Execute
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Modify: `lib/deploy.mjs` (implement executeManual)
- Modify: `tests/deploy.test.mjs` (add manual executor tests)

**Tests:** `tests/deploy.test.mjs`

- [x] **Write failing test**

```javascript
describe("executeManual", () => {
  it("returns step instructions for display", () => {
    // Step with instructions field, verify instructions surfaced
  });

  it("records user response (done/skip/abort)", () => {
    // Mock user input, verify recorded in result
  });

  it("returns USER_ABORT when user chooses abort", () => {
    // Mock abort response, verify error code
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/deploy.test.mjs`
Expected: FAIL -- executeManual not implemented

- [x] **Implement**

Add to `lib/deploy.mjs`:
- `executeManual(step, context)`: returns the step's `instructions` field as a prompt payload. The actual user interaction (print + wait for input) is handled by the skill layer (SKILL.md), not by the library. The library function accepts a `userResponse` parameter (injected by the caller) and records it. Returns `{ status: "succeeded"|"skipped"|"aborted", response, instructions }`. On "abort", sets error code `USER_ABORT`.

- [x] **Verify test passes**

Run: `node --test tests/deploy.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/deploy.mjs tests/deploy.test.mjs
git commit -m "feat(deploy): implement manual step executor with user confirmation

Spec: .context-index/specs/features/deploy/deploy-core.spec.md
Plan-task: 5"
```

---

### Task 6: Verify step executor [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Nearly identical to shell executor with different exit code interpretation; fully mechanical implementation.

**Charter capability:** Deploy Execute
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Modify: `lib/deploy.mjs` (implement executeVerify)
- Modify: `tests/deploy.test.mjs` (add verify executor tests)

**Tests:** `tests/deploy.test.mjs`

- [x] **Write failing test**

```javascript
describe("executeVerify", () => {
  it("treats exit code 0 as pass", () => {
    // Command that exits 0, verify status succeeded
  });

  it("treats non-zero exit as VERIFY_FAILED", () => {
    // Command that exits 1, verify VERIFY_FAILED error code
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/deploy.test.mjs`
Expected: FAIL -- executeVerify not implemented

- [x] **Implement**

Add to `lib/deploy.mjs`:
- `executeVerify(step, context)`: runs the verification command via `execFile` (same as shell, with `shell: false`). Exit 0 = pass (`status: "succeeded"`), non-zero = fail (`status: "failed"`, error code `VERIFY_FAILED`). Triggers the failure flow on fail (handled by the orchestrator in `executeDeploy`).

- [x] **Verify test passes**

Run: `node --test tests/deploy.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/deploy.mjs tests/deploy.test.mjs
git commit -m "feat(deploy): implement verify step executor

Spec: .context-index/specs/features/deploy/deploy-core.spec.md
Plan-task: 6"
```

---

### Task 7: Gate step executor [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=3
**Rationale:** Spec defines precise polling semantics with defaults and minimums; polling loop requires timer injection for testability but is a known pattern.

**Charter capability:** Deploy Execute
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Modify: `lib/deploy.mjs` (implement executeGate)
- Modify: `tests/deploy.test.mjs` (add gate executor tests)

**Tests:** `tests/deploy.test.mjs`

- [x] **Write failing test**

```javascript
describe("executeGate", () => {
  it("polls until command exits 0", () => {
    // Mock executor that fails twice then succeeds, verify polling
  });

  it("uses configurable interval with minimum 5s", () => {
    // Step with interval: 3, verify clamped to 5
  });

  it("returns GATE_TIMEOUT on timeout expiry", () => {
    // Mock executor that never succeeds, timeout=1, verify GATE_TIMEOUT
  });

  it("uses default interval 10s and timeout 300s", () => {
    // Step without interval/timeout, verify defaults applied
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/deploy.test.mjs`
Expected: FAIL -- executeGate not implemented

- [x] **Implement**

Add to `lib/deploy.mjs`:
- `executeGate(step, context)`: runs `step.command` via `execFile` repeatedly. Polling loop with `interval` (default 10s, min 5s -- per-step field) and `timeout` (default 300s -- per-step field). Exit 0 = gate passes. Timeout expiry = `GATE_TIMEOUT` error. Uses `setTimeout`-based loop for testability (injectable timer for tests).

- [x] **Verify test passes**

Run: `node --test tests/deploy.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/deploy.mjs tests/deploy.test.mjs
git commit -m "feat(deploy): implement gate step executor with polling and timeout

Spec: .context-index/specs/features/deploy/deploy-core.spec.md
Plan-task: 7"
```

---

### Task 8: CI-trigger step executor [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=3
**Rationale:** Detailed spec with exit code semantics and SEC-7 sanitization guidance; two-phase dispatch+poll combines patterns but each part is well-defined.

**Charter capability:** Deploy Execute
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Modify: `lib/deploy.mjs` (implement executeCiTrigger)
- Modify: `tests/deploy.test.mjs` (add CI-trigger executor tests)

**Tests:** `tests/deploy.test.mjs`

- [x] **Write failing test**

```javascript
describe("executeCiTrigger", () => {
  it("dispatches command and captures job ID from stdout", () => {
    // Mock command that outputs job ID
  });

  it("polls poll_command until exit 0 (success)", () => {
    // Mock poll that returns exit 2 twice then 0
  });

  it("returns CI_FAILED on poll exit 1", () => {
    // Mock poll that returns exit 1 (failed)
  });

  it("uses configurable interval (min 10s) and timeout (default 1800s)", () => {
    // Verify defaults and minimum interval clamping
  });

  it("length-bounds job ID to 256 chars and strips control chars", () => {
    // Job ID with 300 chars and control chars, verify sanitized
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/deploy.test.mjs`
Expected: FAIL -- executeCiTrigger not implemented

- [x] **Implement**

Add to `lib/deploy.mjs`:
- `executeCiTrigger(step, context)`: (1) runs `step.command` via `execFile` to dispatch, captures stdout as job ID. (2) Sanitizes job ID: truncate to 256 chars, strip control characters (per review note SEC-7). (3) Polls `step.poll_command` with the job ID passed as an env var `DEPLOY_JOB_ID`. Polling with `interval` (default 30s, min 10s) and `timeout` (default 1800s). Exit codes: 0 = success, 1 = failed (`CI_FAILED`), 2 = in-progress (keep polling).

- [x] **Verify test passes**

Run: `node --test tests/deploy.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/deploy.mjs tests/deploy.test.mjs
git commit -m "feat(deploy): implement CI-trigger step executor with dispatch and polling

Spec: .context-index/specs/features/deploy/deploy-core.spec.md
Plan-task: 8"
```

---

### Task 9: Milestone integration [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=4 pattern=3 blast=5 novelty=4
**Rationale:** Clear version resolution behavior with --version override; external dependency on lib/milestones.mjs adds mild uncertainty but fallback path is well-defined.

**Charter capability:** Milestone Integration
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/deploy.mjs` (add resolveVersion function)
- Modify: `tests/deploy.test.mjs` (add milestone integration tests)

**Tests:** `tests/deploy.test.mjs`

**BLOCKED:** This task depends on `lib/milestones.mjs` which must be implemented by the milestone-lifecycle feature first. If `lib/milestones.mjs` does not exist at implementation time, skip this task and document the dependency.

- [x] **Write failing test**

```javascript
describe("resolveVersion", () => {
  it("returns version from most recent shipped milestone", () => {
    // Mock loadMilestones returning shipped milestones, verify latest used
  });

  it("returns explicit version when --version provided", () => {
    // options.version = "v1.2.3", verify bypasses milestone lookup
  });

  it("returns NO_VERSION error when no shipped milestone and no --version", () => {
    // No milestones.yaml, no --version, verify error
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/deploy.test.mjs`
Expected: FAIL -- resolveVersion not implemented

- [x] **Implement**

Add to `lib/deploy.mjs`:
- `resolveVersion(projectRoot, options)`: if `options.version` is provided, return it directly (Behavior 6). Otherwise, attempt to import `lib/milestones.mjs` and call `loadMilestones(projectRoot)`. Find the most recently shipped milestone and return its version/tag. If no shipped milestone exists, return `{ error: 'NO_VERSION', message: 'No shipped milestone found. Use --version <tag> to deploy explicitly.' }`. If `lib/milestones.mjs` does not exist, return `NO_VERSION` with a message indicating the dependency is not yet available.

- [x] **Verify test passes**

Run: `node --test tests/deploy.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/deploy.mjs tests/deploy.test.mjs
git commit -m "feat(deploy): add milestone integration for version resolution

Spec: .context-index/specs/features/deploy/deploy-core.spec.md
Plan-task: 9"
```

---

### Task 10: Failure and rollback flow [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=3
**Rationale:** Explicit fail-fast and rollback-surfacing behaviors; combines fail-fast + reverse-order rollback but each part is well-specified with clear "never auto-execute" constraint.

**Charter capability:** Failure and Rollback
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Modify: `lib/deploy.mjs` (add failure handling and rollback surfacing to executeDeploy)
- Modify: `tests/deploy.test.mjs` (add failure/rollback tests)

**Tests:** `tests/deploy.test.mjs`

- [x] **Write failing test**

```javascript
describe("executeDeploy - failure flow", () => {
  it("stops immediately on step failure", () => {
    // 3 steps, second fails, verify third never runs
  });

  it("reports succeeded and failed steps", () => {
    // Verify DeployRun has correct statuses for each step
  });

  it("surfaces rollback steps in reverse order for completed steps", () => {
    // Steps with rollback entries, verify reverse order
  });

  it("never auto-executes rollback steps", () => {
    // Verify rollback steps are returned as instructions, not executed
  });
});

describe("executeRollback", () => {
  it("executes one rollback step at a time with confirmation", () => {
    // Mock user confirmation, verify sequential execution
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/deploy.test.mjs`
Expected: FAIL -- failure flow not implemented

- [x] **Implement**

Modify `executeDeploy` in `lib/deploy.mjs`:
- On any step failure: immediately stop execution (break from step loop)
- Set `DeployRun.status` to `"failed"` with the failing step recorded
- Collect `rollback` entries from all completed steps in reverse order
- Return rollback steps as `DeployRun.rollbackSteps` (array of instructions -- never auto-executed)
- Add `executeRollback(rollbackSteps, options)`: iterates through rollback steps one at a time, each accepting a `userConfirmation` callback. Only proceeds to next step after confirmation. Returns results for each rollback step.

- [x] **Verify test passes**

Run: `node --test tests/deploy.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/deploy.mjs tests/deploy.test.mjs
git commit -m "feat(deploy): implement fail-fast behavior and rollback step surfacing

Spec: .context-index/specs/features/deploy/deploy-core.spec.md
Plan-task: 10"
```

---

### Task 11: Deploy skill SKILL.md [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=4 pattern=4 blast=5 novelty=3
**Rationale:** Existing skill files provide a direct template; spec covers all behaviors but SKILL.md authoring requires creative composition of lib functions into coherent instructions.

**Charter capability:** Deploy Execute (skill interface)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Tasks 1-10
**Files:**
- Create: `skills/deploy/SKILL.md`

**Tests:** `tests/deploy.test.mjs` (verify skill file exists -- structural check only)

- [x] **Write failing test**

```javascript
describe("deploy skill", () => {
  it("SKILL.md exists in skills/deploy/", () => {
    // Check file exists at skills/deploy/SKILL.md
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/deploy.test.mjs`
Expected: FAIL -- skills/deploy/SKILL.md does not exist

- [x] **Implement**

Create `skills/deploy/SKILL.md` with structured instructions for Claude covering:
- Announce line: "I'm using the adev:deploy skill to run a deployment pipeline."
- Arguments: `--version <tag>`, `--env <name>`, `--dry-run`
- Prerequisites: check for `.context-index/deploy.yaml`
- Workflow:
  1. Load and validate config (call `loadDeployConfig`, `validateDeployConfig`)
  2. Resolve version (milestone or `--version`)
  3. Check env var warnings
  4. Execute steps in order
  5. For manual steps: print instructions, wait for user input
  6. On failure: stop, report, surface rollback steps with user confirmation
  7. On success: print summary
- Error messages matching spec Error Cases table
- Reference to `lib/deploy.mjs` functions

- [x] **Verify test passes**

Run: `node --test tests/deploy.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add skills/deploy/SKILL.md tests/deploy.test.mjs
git commit -m "feat(deploy): author deploy skill SKILL.md with deployment orchestration instructions

Spec: .context-index/specs/features/deploy/deploy-core.spec.md
Plan-task: 11"
```

---

### Task 12: Deploy run summary [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Pure mechanical string formatting with explicit spec requirements; golden sample for library module pattern applies directly.

**Charter capability:** Deploy Execute
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Modify: `lib/deploy.mjs` (add formatDeploySummary)
- Modify: `tests/deploy.test.mjs` (add summary tests)

**Tests:** `tests/deploy.test.mjs`

- [x] **Write failing test**

```javascript
describe("formatDeploySummary", () => {
  it("includes version, environment, step results, and duration", () => {
    // Complete DeployRun, verify summary string contains all fields
  });

  it("formats succeeded steps with checkmarks", () => {
    // All steps succeeded, verify formatting
  });

  it("formats failed steps with failure details", () => {
    // One step failed, verify failure shown
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/deploy.test.mjs`
Expected: FAIL -- formatDeploySummary not defined

- [x] **Implement**

Add to `lib/deploy.mjs`:
- `formatDeploySummary(deployRun)`: generates a human-readable summary string with version, environment name, per-step results (status, duration), and total duration. Called by `executeDeploy` on successful completion (Behavior 14) and by the skill for display.

- [x] **Verify test passes**

Run: `node --test tests/deploy.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/deploy.mjs tests/deploy.test.mjs
git commit -m "feat(deploy): add deploy run summary formatting

Spec: .context-index/specs/features/deploy/deploy-core.spec.md
Plan-task: 12"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied
- No constitutional violations introduced
