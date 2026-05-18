<!-- DO NOT EDIT statuses inline — see lifecycle log hook-config-generator.jsonl -->

# Implementation Plan: Hook Config Generator with Translation Table and Drift Test

> **Methodology:** adev
> **Charter:** .context-index/specs/features/cursor-provider/charter.md
> **Spec:** .context-index/specs/features/cursor-provider/hook-config-generator.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-18, rev 2)
> **Platform:** Node.js (ESM, `.mjs`), node:test, npm, no new external deps

**Goal:** Add a Node-built-ins-only build step that derives `providers/cursor/hooks.json` from canonical `hooks/hooks.json` via an inline Claude→Cursor translation table, paired with a node:test that fails CI when the committed output drifts.

**Architecture:** Two files added at the plugin root: `scripts/build-cursor-hooks.mjs` (the generator) and `tests/cursor-hooks-sync.test.mjs` (the drift gate). One line added to `package.json:scripts`. The generator is a pure function over a JSON file: read canonical, project through an exported `TRANSLATION_TABLE` constant, write atomically via temp + rename. The test imports the generator, re-runs it in memory, and `deepEqual`s the result against the committed output. No changes to `hooks/hooks.json`, hook scripts, the stdin/stdout hook protocol, or any provider adapter — this is purely a build-time projection. Sits in the Autonomous lane per the constitution and the spec's System Constitution Reference.

**Review notes carried forward (non-blocking):**
- **CON-1** (consistency-analyzer, rev 2 warning): parent charter `cursor-provider/charter.md` Domain Model still shows the rejected fan-out example for `PreToolUse/Edit → beforeReadFile + afterFileEdit`. The spec is authoritative; this plan does NOT touch the charter. Fold into the next charter revision per the reviewer's recommendation. Not a planning blocker.

---

## File Structure

**Create:**
- `scripts/build-cursor-hooks.mjs` — the generator. Reads `hooks/hooks.json`, applies `TRANSLATION_TABLE`, writes `providers/cursor/hooks.json` atomically.
- `tests/cursor-hooks-sync.test.mjs` — drift test under `node:test`. Imports the generator, re-runs in memory, asserts deepEqual + existence + parse + event coverage.
- `providers/cursor/hooks.json` — first committed output of the generator. Produced by running `npm run build:cursor-hooks` once during Task 4; tracked in git so the drift test has something to compare against.

**Modify:**
- `package.json` — add `"build:cursor-hooks": "node scripts/build-cursor-hooks.mjs"` to the `scripts` object (current keys: `test`, `eval`, `eval:generate`, `eval:skill-compression`).

**Reference (read, do not modify):**
- `hooks/hooks.json` — single source of truth for hook event registration. Generator input.
- `providers/opencode/plugin.mjs` (and `providers/codex/`, `providers/claude-code/`) — peer adapter shape; this plan does NOT touch any adapter, only mentions them to confirm `providers/cursor/` is the right home for the generated config.
- `.context-index/specs/features/cursor-provider/charter.md` — Capability Map (statuses updated in Step 7) and Domain Model (`HookEventTranslation` entity).
- `.context-index/constitution.md` — Principles 1, 3, 4 cited in the spec.

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/cursor-provider/hook-config-generator.spec.md` (Translation Table section, Per-entry defaults, Hook Intent and Semantic Invariant, Failure Modes table rows for missing/malformed canonical, unknown event, unknown matcher, non-canonical command, missing script on disk)
- Charter: `.context-index/specs/features/cursor-provider/charter.md` (capabilities: Hook config generator, Translation-table coverage assertion)
- Source files: `hooks/hooks.json` (full read — generator input; all 7 event/matcher pairs)
- Constitution: `.context-index/constitution.md` (Principles 1, 3, 4; "No CommonJS" anti-pattern)
- Heuristics: 0 entries for module `cursor-provider` (none registered for this module slug)

### Task 2 Context
- Spec: `.context-index/specs/features/cursor-provider/hook-config-generator.spec.md` (Output Contract — JSON shape, atomic write, 2-space indent, trailing newline, mode 0644; "Per-entry defaults" subsection)
- Charter: `.context-index/specs/features/cursor-provider/charter.md` (capability: Hook config generator; Quality Attribute: Drift safety)
- Source files: `hooks/hooks.json` (full read — input shape reference)
- Sample: `.context-index/samples/general-library-module-graph.md` (Node built-ins pattern for atomic file writes; signature read only)

### Task 3 Context
- Spec: `.context-index/specs/features/cursor-provider/hook-config-generator.spec.md` (Acceptance Criterion: `package.json:scripts["build:cursor-hooks"]` runs `node scripts/build-cursor-hooks.mjs`)
- Reference file: `package.json` (current `scripts` block — verify `test` glob `tests/*.test.mjs` will pick up the new test file)

### Task 4 Context
- Spec: `.context-index/specs/features/cursor-provider/hook-config-generator.spec.md` (Output Contract — `providers/cursor/hooks.json` JSON shape; Acceptance Criterion: "Running `npm run build:cursor-hooks` produces `providers/cursor/hooks.json` matching the JSON shape documented above")
- Source files: `hooks/hooks.json` (canonical input being transformed)

### Task 5 Context
- Spec: `.context-index/specs/features/cursor-provider/hook-config-generator.spec.md` (`tests/cursor-hooks-sync.test.mjs` section — all 4 assertions, both failure messages; Test failure modes table)
- Charter: `.context-index/specs/features/cursor-provider/charter.md` (capability: Hook drift test; invariant: "The committed `providers/cursor/hooks.json` MUST deep-equal the output of `build-cursor-hooks.mjs` run against the current `hooks/hooks.json`")
- Sample: `.context-index/samples/general-test-helpers.md` (test patterns under `node:test`; signature read only)
- Reference: `tests/helpers.mjs` (`createTempDir`, `cleanupTempDir` — signature only; the drift test does not need temp dirs but the helpers file is the canonical patterns reference)

### Task 6 Context
- Spec: `.context-index/specs/features/cursor-provider/hook-config-generator.spec.md` (Failure Modes — "Committed `providers/cursor/hooks.json` drifts from generator output"; Failure Messages — exact "run `npm run build:cursor-hooks` to regenerate" text)
- Source files: previously-written `scripts/build-cursor-hooks.mjs` + `tests/cursor-hooks-sync.test.mjs`

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

No `cursor-provider`-scoped heuristics are registered. (`adev heuristics retrieve --module cursor-provider --format text` returned the project's global heuristics for token measurement and skill output discipline; none apply to this implementation.) Section retained for parity with the plan template; no specific heuristic guidance to inject.

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 (Task 2 imports `TRANSLATION_TABLE` from Task 1's file)
- Group B (sequential, depends on A): Task 3 (touches `package.json` only — could be parallel with A in principle, but trivial; bundle after to keep ordering linear)
- Group C (sequential, depends on A+B): Task 4 (runs the generator from Tasks 1+2 and commits its output)
- Group D (sequential, depends on A+B+C): Task 5 → Task 6 (the test reads the committed `providers/cursor/hooks.json` written in Task 4; verifying drift detection in Task 6 requires the test from Task 5)

All tasks share the file system writes — keep them sequential. No parallelization gains here; the plan is short enough that ordering linearly is clearer than annotating false-independence.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Define TRANSLATION_TABLE and per-entry default constants | small | unit | — | 1 create, 0 modify |
| 2 | Implement build-cursor-hooks generator with atomic write | medium | unit | Task 1 | 0 create, 1 modify |
| 3 | Wire `build:cursor-hooks` npm script | small | unit | Task 2 | 0 create, 1 modify |
| 4 | Generate and commit initial providers/cursor/hooks.json | small | unit | Task 3 | 1 create, 0 modify |
| 5 | Write tests/cursor-hooks-sync.test.mjs drift test | medium | unit | Task 4 | 1 create, 0 modify |
| 6 | Verify drift detection end-to-end (intentional perturbation) | small | unit | Task 5 | 0 create, 0 modify (test-only) |

Strategy resolution: all six tasks fall under `unit` via the priority chain — spec has no `test_strategy` frontmatter; manifest has no `test_strategies` entry; auto-detection on `scripts/**.mjs` and `tests/**.test.mjs` resolves to `unit` (`node:test`); fallback would also have produced `unit`. No `Strategy Summary` or `Test Infrastructure Requirements` section emitted (all-unit plan, no `infra_requirements:` in spec frontmatter).

---

## Task Structure

### Task 1: Define TRANSLATION_TABLE and per-entry default constants [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Translation table fully enumerated in the spec with all 7 rows and timeout constants; pure data definition in a single new file with a matching ESM/test sample available.

**Charter capability:** Translation-table coverage assertion (and foundation for "Hook config generator")
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `scripts/build-cursor-hooks.mjs`
- Test: `tests/cursor-hooks-sync.test.mjs` (created in Task 5; this task lands the structural skeleton + exports the table)

**Tests:** `tests/cursor-hooks-sync.test.mjs` — Task 5 writes the full test; this task adds a small inline assertion in Task 1's TDD step that imports `TRANSLATION_TABLE` and `FAIL_CLOSED_TIMEOUT` / `ADVISORY_TIMEOUT` constants from the new generator file. That inline test gets folded into the full drift test in Task 5; for Task 1, a minimal `tests/cursor-hooks-sync.test.mjs` exists as a single `test("translation table exports", ...)` block.

**Context to load:**
- Spec Translation Table section (all 7 rows) and Per-entry defaults subsection.
- Spec Hook Intent and Semantic Invariant section (defines the fail-closed vs advisory classes).
- Constitution Principles 1, 3 (Node built-ins, ESM only).

- [ ] **Write failing test**

```javascript
// tests/cursor-hooks-sync.test.mjs (initial form — replaced in Task 5)
import { test } from "node:test";
import assert from "node:assert/strict";
import { TRANSLATION_TABLE, FAIL_CLOSED_TIMEOUT, ADVISORY_TIMEOUT } from "../scripts/build-cursor-hooks.mjs";

test("TRANSLATION_TABLE covers all 7 Claude event/matcher pairs in hooks.json", () => {
  // Expected pairs from hooks/hooks.json:
  //   SessionStart / startup|resume|clear|compact
  //   PreToolUse / Edit
  //   PreToolUse / Bash
  //   PostToolUse / Read
  //   PostToolUse / Edit
  //   PostToolUse / .*
  //   Stop / .*
  const pairs = TRANSLATION_TABLE.map(e => `${e.claudeEvent}/${e.claudeMatcher}`).sort();
  assert.deepEqual(pairs, [
    "PostToolUse/.*",
    "PostToolUse/Edit",
    "PostToolUse/Read",
    "PreToolUse/Bash",
    "PreToolUse/Edit",
    "SessionStart/startup|resume|clear|compact",
    "Stop/.*",
  ]);
});

test("fail-closed entries have correct intent and timeout constants", () => {
  assert.equal(FAIL_CLOSED_TIMEOUT, 30);
  assert.equal(ADVISORY_TIMEOUT, 60);
  const failClosed = TRANSLATION_TABLE.filter(e => e.intent === "fail-closed");
  const failClosedPairs = failClosed.map(e => `${e.claudeEvent}/${e.claudeMatcher}`).sort();
  assert.deepEqual(failClosedPairs, ["PreToolUse/Bash", "PreToolUse/Edit"]);
  // Semantic invariant: every fail-closed entry maps to a pre-action Cursor event.
  for (const e of failClosed) {
    assert.ok(
      ["preToolUse", "beforeShellExecution"].includes(e.cursorEvent),
      `fail-closed entry ${e.claudeEvent}/${e.claudeMatcher} maps to non-pre-action cursor event ${e.cursorEvent}`,
    );
  }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cursor-hooks-sync.test.mjs`
Expected: FAIL — `Cannot find module '../scripts/build-cursor-hooks.mjs'` (file does not exist yet).

- [ ] **Implement**

```javascript
// scripts/build-cursor-hooks.mjs (skeleton — main() lands in Task 2)
// Build step: derive providers/cursor/hooks.json from canonical hooks/hooks.json.
// Pure Node built-ins. Throws on unknown events, unknown matchers, and
// non-canonical hook command shapes. See
// .context-index/specs/features/cursor-provider/hook-config-generator.spec.md
// for the contract.

export const FAIL_CLOSED_TIMEOUT = 30;   // seconds — short enough to prevent UI freezes during gates
export const ADVISORY_TIMEOUT = 60;      // seconds — long enough for capture/sync

// Inline Claude → Cursor translation. Every row corresponds to one event/matcher
// pair currently registered in hooks/hooks.json. The generator throws when it
// encounters a pair not in this list (see Task 2).
export const TRANSLATION_TABLE = [
  { claudeEvent: "SessionStart", claudeMatcher: "startup|resume|clear|compact",
    cursorEvent: "sessionStart", cursorMatcher: null, intent: "advisory" },
  { claudeEvent: "PreToolUse", claudeMatcher: "Edit",
    cursorEvent: "preToolUse", cursorMatcher: "Edit", intent: "fail-closed" },
  { claudeEvent: "PreToolUse", claudeMatcher: "Bash",
    cursorEvent: "beforeShellExecution", cursorMatcher: null, intent: "fail-closed" },
  { claudeEvent: "PostToolUse", claudeMatcher: "Read",
    cursorEvent: "postToolUse", cursorMatcher: "Read", intent: "advisory" },
  { claudeEvent: "PostToolUse", claudeMatcher: "Edit",
    cursorEvent: "afterFileEdit", cursorMatcher: null, intent: "advisory" },
  { claudeEvent: "PostToolUse", claudeMatcher: ".*",
    cursorEvent: "postToolUse", cursorMatcher: null, intent: "advisory" },
  { claudeEvent: "Stop", claudeMatcher: ".*",
    cursorEvent: "stop", cursorMatcher: null, intent: "advisory" },
];
```

- [ ] **Verify test passes**

Run: `node --test tests/cursor-hooks-sync.test.mjs`
Expected: PASS — both assertions green. Spec acceptance criteria advanced: "translation table is defined inline … and covers all 7 Claude event/matcher pairs", "Every `PreToolUse` source entry maps to a Cursor event that fires **before** the corresponding tool action", "Each generated entry carries `failClosed: true` when the source hook intent is fail-closed … `timeout` is `30` for fail-closed entries, `60` for advisory entries" (foundation half — surfaced in output in Task 2).

- [ ] **Commit**

Branch (if not already created): `feat/cursor-provider/hook-config-generator`

```bash
git add scripts/build-cursor-hooks.mjs tests/cursor-hooks-sync.test.mjs
git commit -m "feat(cursor-provider): add TRANSLATION_TABLE and timeout constants for cursor hooks generator

Spec: .context-index/specs/features/cursor-provider/hook-config-generator.spec.md
Plan-task: 1"
```

---

### Task 2: Implement build-cursor-hooks generator with atomic write [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Output contract, atomic-write protocol, canonical command regex, and exact throw messages are all enumerated in the spec; single-file change in scripts/ with golden samples for module structure and node:fs patterns.

**Charter capability:** Hook config generator (primary), Translation-table coverage assertion (the throw paths)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `scripts/build-cursor-hooks.mjs` — add `buildCursorHooks()` function (in-memory transform) + `main()` driver (read canonical, write atomically, exit non-zero on throw).
- Test: `tests/cursor-hooks-sync.test.mjs` — extend with assertions for in-memory transform behaviour.

**Tests:** `tests/cursor-hooks-sync.test.mjs` — adds `buildCursorHooks(canonicalHooks, hookScriptExists)` unit tests covering: happy path shape, unknown-event throw, unknown-matcher throw, non-canonical command throw (SEC-1), missing-script-on-disk throw. The in-memory variant takes the canonical JSON and a script-existence predicate so the unit tests don't need to touch the filesystem.

**Context to load:**
- Spec Output Contract section (JSON shape, atomic write, 2-space indent, trailing newline, mode 0644).
- Spec Failure Modes table (5 throw conditions covered here; missing-canonical-file is a `main()` concern, atomic-write-failure is unwrapped from `fs.renameSync`).
- Spec Command Translation subsection (the canonical pattern `bash "${CLAUDE_PLUGIN_ROOT}/hooks/<script>.sh"` → `./hooks/<script>.sh`).

- [ ] **Write failing test**

```javascript
// Append to tests/cursor-hooks-sync.test.mjs
import { buildCursorHooks } from "../scripts/build-cursor-hooks.mjs";

const sampleCanonical = {
  hooks: {
    SessionStart: [{
      matcher: "startup|resume|clear|compact",
      hooks: [{ type: "command", command: 'bash "${CLAUDE_PLUGIN_ROOT}/hooks/session-start.sh"' }],
    }],
    PreToolUse: [{
      matcher: "Edit",
      hooks: [
        { type: "command", command: 'bash "${CLAUDE_PLUGIN_ROOT}/hooks/context-preflight.sh"' },
      ],
    }],
  },
};

const allScriptsExist = () => true;
const noScriptsExist = () => false;

test("buildCursorHooks produces canonical JSON shape with version + hooks map", () => {
  const out = buildCursorHooks(sampleCanonical, allScriptsExist);
  assert.equal(out.version, 1);
  assert.ok(out.hooks.sessionStart);
  assert.ok(out.hooks.preToolUse);
});

test("buildCursorHooks rewrites command and strips bash wrapper", () => {
  const out = buildCursorHooks(sampleCanonical, allScriptsExist);
  assert.equal(out.hooks.sessionStart[0].command, "./hooks/session-start.sh");
  assert.equal(out.hooks.preToolUse[0].command, "./hooks/context-preflight.sh");
});

test("buildCursorHooks stamps failClosed=true and timeout=30 for PreToolUse, false/60 otherwise", () => {
  const out = buildCursorHooks(sampleCanonical, allScriptsExist);
  assert.equal(out.hooks.preToolUse[0].failClosed, true);
  assert.equal(out.hooks.preToolUse[0].timeout, 30);
  assert.equal(out.hooks.preToolUse[0].matcher, "Edit");
  assert.equal(out.hooks.sessionStart[0].failClosed, false);
  assert.equal(out.hooks.sessionStart[0].timeout, 60);
});

test("buildCursorHooks throws on unknown Claude event", () => {
  const bad = { hooks: { UnknownEvent: [{ matcher: "*", hooks: [{ type: "command", command: 'bash "${CLAUDE_PLUGIN_ROOT}/hooks/x.sh"' }] }] } };
  assert.throws(
    () => buildCursorHooks(bad, allScriptsExist),
    /Unknown Claude event: UnknownEvent\. Add an entry to TRANSLATION_TABLE/,
  );
});

test("buildCursorHooks throws on unknown matcher under known event", () => {
  const bad = { hooks: { PreToolUse: [{ matcher: "Glob", hooks: [{ type: "command", command: 'bash "${CLAUDE_PLUGIN_ROOT}/hooks/x.sh"' }] }] } };
  assert.throws(
    () => buildCursorHooks(bad, allScriptsExist),
    /Unknown Claude matcher: PreToolUse\/Glob\. Add an entry to TRANSLATION_TABLE/,
  );
});

test("buildCursorHooks throws on non-canonical hook command (SEC-1)", () => {
  const bad = {
    hooks: {
      SessionStart: [{
        matcher: "startup|resume|clear|compact",
        hooks: [{ type: "command", command: "python my-hook.py" }],
      }],
    },
  };
  assert.throws(
    () => buildCursorHooks(bad, allScriptsExist),
    /Non-canonical hook command at SessionStart\/startup\|resume\|clear\|compact: python my-hook\.py\. Translation only supports the canonical bash-script form/,
  );
});

test("buildCursorHooks throws when canonical-shaped command references missing script", () => {
  assert.throws(
    () => buildCursorHooks(sampleCanonical, noScriptsExist),
    /Hook script not found: hooks\/session-start\.sh referenced from SessionStart\/startup\|resume\|clear\|compact/,
  );
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cursor-hooks-sync.test.mjs`
Expected: FAIL — `buildCursorHooks is not exported` (or `undefined is not a function`). Each new test should fail with that import-resolution error.

- [ ] **Implement**

```javascript
// Append to scripts/build-cursor-hooks.mjs
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Plugin root: parent of scripts/
const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CANONICAL_PATH = join(PLUGIN_ROOT, "hooks", "hooks.json");
const OUTPUT_PATH = join(PLUGIN_ROOT, "providers", "cursor", "hooks.json");

// Canonical command shape: bash "${CLAUDE_PLUGIN_ROOT}/hooks/<name>.sh"
// Captures the script basename for both translation and on-disk existence check.
const CANONICAL_COMMAND_RE = /^bash "\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/([^"/]+\.sh)"$/;

function lookupTranslation(claudeEvent, claudeMatcher) {
  // First check whether the event is known at all (any matcher).
  const eventKnown = TRANSLATION_TABLE.some(e => e.claudeEvent === claudeEvent);
  if (!eventKnown) {
    throw new Error(`Unknown Claude event: ${claudeEvent}. Add an entry to TRANSLATION_TABLE in scripts/build-cursor-hooks.mjs.`);
  }
  const row = TRANSLATION_TABLE.find(
    e => e.claudeEvent === claudeEvent && e.claudeMatcher === claudeMatcher,
  );
  if (!row) {
    throw new Error(`Unknown Claude matcher: ${claudeEvent}/${claudeMatcher}. Add an entry to TRANSLATION_TABLE in scripts/build-cursor-hooks.mjs.`);
  }
  return row;
}

/**
 * Pure transform: canonical hooks.json shape → Cursor hooks.json shape.
 * @param {object} canonical - parsed contents of hooks/hooks.json
 * @param {(scriptName: string) => boolean} hookScriptExists - predicate for on-disk script existence (injectable for tests)
 * @returns {object} { version: 1, hooks: { <cursorEvent>: [...] } }
 */
export function buildCursorHooks(canonical, hookScriptExists) {
  const out = { version: 1, hooks: {} };
  for (const [claudeEvent, entries] of Object.entries(canonical.hooks || {})) {
    for (const entry of entries) {
      const claudeMatcher = entry.matcher;
      const row = lookupTranslation(claudeEvent, claudeMatcher);
      for (const hook of entry.hooks || []) {
        const match = CANONICAL_COMMAND_RE.exec(hook.command);
        if (!match) {
          throw new Error(
            `Non-canonical hook command at ${claudeEvent}/${claudeMatcher}: ${hook.command}. Translation only supports the canonical bash-script form; new command shapes need explicit translation logic.`,
          );
        }
        const scriptName = match[1];
        if (!hookScriptExists(scriptName)) {
          throw new Error(`Hook script not found: hooks/${scriptName} referenced from ${claudeEvent}/${claudeMatcher}`);
        }
        const cursorEntry = {
          command: `./hooks/${scriptName}`,
          failClosed: row.intent === "fail-closed",
          timeout: row.intent === "fail-closed" ? FAIL_CLOSED_TIMEOUT : ADVISORY_TIMEOUT,
        };
        if (row.cursorMatcher) cursorEntry.matcher = row.cursorMatcher;
        out.hooks[row.cursorEvent] ||= [];
        out.hooks[row.cursorEvent].push(cursorEntry);
      }
    }
  }
  return out;
}

/**
 * Read canonical, transform, write atomically. Exit non-zero on any throw via
 * the unhandled-rejection / unhandled-exception default behaviour.
 */
function main() {
  if (!existsSync(CANONICAL_PATH)) {
    throw new Error(`Canonical hooks/hooks.json not found at ${CANONICAL_PATH}`);
  }
  const canonical = JSON.parse(readFileSync(CANONICAL_PATH, "utf8"));
  const result = buildCursorHooks(
    canonical,
    (scriptName) => existsSync(join(PLUGIN_ROOT, "hooks", scriptName)),
  );
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  // Atomic write: temp file in same directory + rename.
  const tmp = `${OUTPUT_PATH}.tmp.${process.pid}`;
  const body = JSON.stringify(result, null, 2) + "\n";
  writeFileSync(tmp, body, { mode: 0o644 });
  renameSync(tmp, OUTPUT_PATH);
}

// ESM "run only when invoked as a script" idiom.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

- [ ] **Verify test passes**

Run: `node --test tests/cursor-hooks-sync.test.mjs`
Expected: PASS — all seven new unit tests green. Spec acceptance criteria advanced: "Running `npm run build:cursor-hooks` produces … matching the JSON shape documented", "Every hook command … is rewritten to `./hooks/<script>.sh`", "Each generated entry carries `failClosed: true` when … fail-closed", "writes atomically (temp file + rename)", "throws with a clear, actionable message when it encounters an unmapped Claude event or matcher", "throws on any hook command that does not match the canonical … form (SEC-1)".

- [ ] **Commit**

```bash
git add scripts/build-cursor-hooks.mjs tests/cursor-hooks-sync.test.mjs
git commit -m "feat(cursor-provider): implement buildCursorHooks transform with atomic write

Spec: .context-index/specs/features/cursor-provider/hook-config-generator.spec.md
Plan-task: 2"
```

---

### Task 3: Wire `build:cursor-hooks` npm script [specialist: none]

**Routing:** auto-agent (score: 20/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=5
**Rationale:** Single-line addition to package.json scripts with the exact command string specified by the spec; trivial mechanical edit.

**Charter capability:** Hook config generator
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `package.json` — add `"build:cursor-hooks": "node scripts/build-cursor-hooks.mjs"` to the `scripts` object, alphabetically before `eval`.
- Test: `tests/cursor-hooks-sync.test.mjs` — add a tiny "package.json wiring" assertion.

**Tests:** `tests/cursor-hooks-sync.test.mjs` — add one test that reads `package.json` and asserts the new script entry exists with the expected command. Trivial; bundles with the broader drift test in Task 5 but exists here as the TDD anchor for the spec criterion.

**Context to load:**
- `package.json` (read; current `scripts` block).
- Spec acceptance criterion: `package.json:scripts["build:cursor-hooks"]` runs `node scripts/build-cursor-hooks.mjs`.

- [ ] **Write failing test**

```javascript
// Append to tests/cursor-hooks-sync.test.mjs
import { readFileSync as readFileSync_ } from "node:fs";
import { join as join_, dirname as dirname_ } from "node:path";
import { fileURLToPath as fileURLToPath_ } from "node:url";

test("package.json declares build:cursor-hooks script", () => {
  const root = join_(dirname_(fileURLToPath_(import.meta.url)), "..");
  const pkg = JSON.parse(readFileSync_(join_(root, "package.json"), "utf8"));
  assert.equal(pkg.scripts["build:cursor-hooks"], "node scripts/build-cursor-hooks.mjs");
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cursor-hooks-sync.test.mjs`
Expected: FAIL — `expected 'node scripts/build-cursor-hooks.mjs' deepStrictEqual undefined`.

- [ ] **Implement**

Edit `package.json` `scripts` block:

```json
"scripts": {
  "build:cursor-hooks": "node scripts/build-cursor-hooks.mjs",
  "test": "node --test tests/*.test.mjs tests/**/*.test.mjs",
  "eval": "node tests/evals/repomap/run-eval.mjs",
  "eval:generate": "node tests/evals/repomap/run-eval.mjs --generate-only",
  "eval:skill-compression": "node tests/evals/skill-compression/run-eval.mjs"
}
```

- [ ] **Verify test passes**

Run: `node --test tests/cursor-hooks-sync.test.mjs`
Expected: PASS. Spec acceptance criterion fully satisfied for this task.

- [ ] **Commit**

```bash
git add package.json tests/cursor-hooks-sync.test.mjs
git commit -m "feat(cursor-provider): wire build:cursor-hooks npm script

Spec: .context-index/specs/features/cursor-provider/hook-config-generator.spec.md
Plan-task: 3"
```

---

### Task 4: Generate and commit initial providers/cursor/hooks.json [specialist: none]

**Routing:** auto-agent (score: 20/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=5
**Rationale:** Generated artifact commit; expected JSON shape printed verbatim in the plan, single new file under providers/cursor/, no creative work required.

**Charter capability:** Hook config generator (the committed output side)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `providers/cursor/hooks.json` — produced verbatim by running `npm run build:cursor-hooks`. Hand-edit forbidden; if it needs changing, edit the generator or canonical input.

**Tests:** `tests/cursor-hooks-sync.test.mjs` — Task 5's full drift test will exercise this file. For Task 4, the validation is procedural: run the build, inspect the file, commit.

**Context to load:**
- `hooks/hooks.json` (input).
- Spec Output Contract (expected output shape).

**Note on TDD:** This task is a generated-artifact commit; there's nothing to test-first beyond "the output exists and matches the shape". The unit-test surface for this is the in-memory generator from Task 2 plus the file-on-disk surface from Task 5. The TDD checkboxes below are condensed accordingly.

- [ ] **Write failing test**

(Folded into Task 5. Skipped at this task boundary — the implementation step is a command invocation, not a code edit, so there's no module-under-test to assert against beyond what Task 2 already covers.)

- [ ] **Verify test fails**

Run: `ls providers/cursor/hooks.json`
Expected: FAIL — `No such file or directory`. Stands in for the missing-output condition; the proper drift test arrives in Task 5.

- [ ] **Implement**

```bash
npm run build:cursor-hooks
```

This produces `providers/cursor/hooks.json` matching the JSON shape in the spec. Expected output (informational; the generator is authoritative):

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      { "command": "./hooks/session-start.sh", "failClosed": false, "timeout": 60 }
    ],
    "preToolUse": [
      { "command": "./hooks/context-preflight.sh", "matcher": "Edit", "failClosed": true, "timeout": 30 },
      { "command": "./hooks/constitution-linter.sh", "matcher": "Edit", "failClosed": true, "timeout": 30 },
      { "command": "./hooks/lifecycle-gate-edit.sh", "matcher": "Edit", "failClosed": true, "timeout": 30 },
      { "command": "./hooks/context-read-tracker.sh", "matcher": "Read", "failClosed": false, "timeout": 60 }
    ],
    "beforeShellExecution": [
      { "command": "./hooks/merge-guard.sh", "failClosed": true, "timeout": 30 },
      { "command": "./hooks/lifecycle-gate-bash.sh", "failClosed": true, "timeout": 30 }
    ],
    "afterFileEdit": [
      { "command": "./hooks/sync-trigger.sh", "failClosed": false, "timeout": 60 }
    ],
    "postToolUse": [
      { "command": "./hooks/session-capture.sh", "failClosed": false, "timeout": 60 },
      { "command": "./hooks/issue-reminder.sh", "failClosed": false, "timeout": 60 },
      { "command": "./hooks/lifecycle-gate-advisory.sh", "failClosed": false, "timeout": 60 }
    ],
    "stop": [
      { "command": "./hooks/post-validate-extract-heuristics.sh", "failClosed": false, "timeout": 60 }
    ]
  }
}
```

- [ ] **Verify test passes**

Run: `ls -l providers/cursor/hooks.json && node -e "JSON.parse(require('fs').readFileSync('providers/cursor/hooks.json'))"`
Expected: file exists with mode `0644`; JSON parses without error. (Inline-node here is a one-shot validation, not a skill step; not subject to the constitution's no-inline-node rule, which targets `skills/*/SKILL.md`.)

- [ ] **Commit**

```bash
git add providers/cursor/hooks.json
git commit -m "feat(cursor-provider): commit initial providers/cursor/hooks.json

Spec: .context-index/specs/features/cursor-provider/hook-config-generator.spec.md
Plan-task: 4"
```

---

### Task 5: Write tests/cursor-hooks-sync.test.mjs drift test [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Spec enumerates all four assertions and exact failure messages; single test file in tests/ following the node:test patterns covered by the general-test-helpers golden sample.

**Charter capability:** Hook drift test (primary), Translation-table coverage assertion (the per-event coverage assertion)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `tests/cursor-hooks-sync.test.mjs` — add the four spec-required assertions on top of the unit tests from Tasks 1–3.

**Tests:** self — this task writes the test file's final form.

**Context to load:**
- Spec `tests/cursor-hooks-sync.test.mjs` section (Assertions 1–4, failure messages).
- Spec Failure Modes "Test failure modes" table.
- `providers/cursor/hooks.json` (committed by Task 4; the test compares against this file).

- [ ] **Write failing test**

Add four new tests to `tests/cursor-hooks-sync.test.mjs` (the unit tests from Tasks 1–3 stay):

```javascript
// tests/cursor-hooks-sync.test.mjs — additions
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { join as join2, dirname as dirname2 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

const PROJECT_ROOT = join2(dirname2(fileURLToPath2(import.meta.url)), "..");
const CURSOR_HOOKS = join2(PROJECT_ROOT, "providers", "cursor", "hooks.json");
const CANONICAL_HOOKS = join2(PROJECT_ROOT, "hooks", "hooks.json");

test("providers/cursor/hooks.json exists at the plugin root", () => {
  assert.ok(existsSync2(CURSOR_HOOKS), "providers/cursor/hooks.json does not exist. Run `npm run build:cursor-hooks` to create it.");
});

test("providers/cursor/hooks.json parses as valid JSON", () => {
  const raw = readFileSync2(CURSOR_HOOKS, "utf8");
  // Lets JSON.parse throw natively so the failure message includes the syntax-error location.
  JSON.parse(raw);
});

test("committed providers/cursor/hooks.json deepEquals generator output (drift gate)", () => {
  const committed = JSON.parse(readFileSync2(CURSOR_HOOKS, "utf8"));
  const canonical = JSON.parse(readFileSync2(CANONICAL_HOOKS, "utf8"));
  const fresh = buildCursorHooks(
    canonical,
    (scriptName) => existsSync2(join2(PROJECT_ROOT, "hooks", scriptName)),
  );
  assert.deepEqual(
    committed,
    fresh,
    "providers/cursor/hooks.json is out of sync with hooks/hooks.json. Run `npm run build:cursor-hooks` to regenerate.",
  );
});

test("every Claude event in hooks/hooks.json resolves to at least one entry in providers/cursor/hooks.json", () => {
  const canonical = JSON.parse(readFileSync2(CANONICAL_HOOKS, "utf8"));
  const committed = JSON.parse(readFileSync2(CURSOR_HOOKS, "utf8"));
  const claudeEvents = Object.keys(canonical.hooks || {});
  for (const claudeEvent of claudeEvents) {
    // Find every cursor event produced by any translation row whose claudeEvent matches.
    const cursorEvents = TRANSLATION_TABLE
      .filter(e => e.claudeEvent === claudeEvent)
      .map(e => e.cursorEvent);
    const hasEntry = cursorEvents.some(ce => Array.isArray(committed.hooks[ce]) && committed.hooks[ce].length > 0);
    assert.ok(hasEntry, `Claude event ${claudeEvent} did not resolve to any entry in providers/cursor/hooks.json`);
  }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cursor-hooks-sync.test.mjs`
Expected: After adding the four blocks above, they should PASS immediately (because Task 4 produced a committed file that is in-sync). The "failing first" gesture for this task is the structural one: temporarily delete or perturb `providers/cursor/hooks.json` to verify each assertion fires the right failure message, then restore. Concrete script:

```bash
mv providers/cursor/hooks.json /tmp/hooks.json.bak
node --test tests/cursor-hooks-sync.test.mjs   # assertion 1 fails with the missing-file message
mv /tmp/hooks.json.bak providers/cursor/hooks.json
```

- [ ] **Implement**

Apply the test additions above. The test file ends at this task; nothing else to write.

- [ ] **Verify test passes**

Run: `npm test`
Expected: PASS, including the new file plus the existing suite. Spec acceptance criteria satisfied: "`tests/cursor-hooks-sync.test.mjs` exists and uses only Node built-ins", "passes when `providers/cursor/hooks.json` is in sync", "runs under `npm test` and surfaces in CI on every PR" (the `tests/*.test.mjs` glob in `package.json` already matches).

- [ ] **Commit**

```bash
git add tests/cursor-hooks-sync.test.mjs
git commit -m "feat(cursor-provider): add drift test for cursor hooks generator

Spec: .context-index/specs/features/cursor-provider/hook-config-generator.spec.md
Plan-task: 5"
```

---

### Task 6: Verify drift detection end-to-end (intentional perturbation) [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Verification shell scripts and expected error messages are quoted verbatim in the spec; read-only perturb-and-restore sequence with no file artifacts.

**Charter capability:** Hook drift test (verification side)
**Strategy:** unit (source: fallback, confidence: high)
**Files:** none (read-only verification step against the artifacts committed in Tasks 1–5).

**Tests:** the existing `tests/cursor-hooks-sync.test.mjs`. This task verifies the drift gate fires the exact spec-mandated failure message under perturbation.

**Context to load:**
- Spec Failure Messages: `"providers/cursor/hooks.json is out of sync with hooks/hooks.json. Run \`npm run build:cursor-hooks\` to regenerate."`
- Spec Failure Modes table — "Committed providers/cursor/hooks.json drifts from generator output" row.

**Note on TDD:** This task is a verification + checkbox close. No code changes. The "test" is running the test suite under two perturbations and confirming the expected behaviour, then resetting.

- [ ] **Write failing test**

No new test code. Reuses `tests/cursor-hooks-sync.test.mjs` from Task 5. (TDD checkboxes preserved for structural parity; the per-task plan template requires them.)

- [ ] **Verify test fails**

Two perturbation scenarios, both expected to fail with the right message:

```bash
# Scenario A: drift — committed file diverges from generator output
node -e 'const fs=require("node:fs"); const f="providers/cursor/hooks.json"; const j=JSON.parse(fs.readFileSync(f)); j.hooks.sessionStart[0].timeout = 999; fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n");'
node --test tests/cursor-hooks-sync.test.mjs
# Expected: FAIL on "committed providers/cursor/hooks.json deepEquals generator output"
# Expected message contains: "providers/cursor/hooks.json is out of sync with hooks/hooks.json. Run `npm run build:cursor-hooks` to regenerate."
npm run build:cursor-hooks   # restore

# Scenario B: missing — committed file absent
mv providers/cursor/hooks.json /tmp/hooks.json.bak
node --test tests/cursor-hooks-sync.test.mjs
# Expected: FAIL on "providers/cursor/hooks.json exists at the plugin root"
# Expected message contains: "providers/cursor/hooks.json does not exist. Run `npm run build:cursor-hooks` to create it."
mv /tmp/hooks.json.bak providers/cursor/hooks.json
```

- [ ] **Implement**

Nothing to implement. This task is the verification gate.

- [ ] **Verify test passes**

Run: `npm test`
Expected: PASS — full suite green after both perturbations reverted. Spec acceptance criterion satisfied: "fails with the 'run `npm run build:cursor-hooks` to regenerate' message when the committed output drifts from the generator".

- [ ] **Commit**

No commit. This task produces no artifacts; it certifies the drift behaviour of Tasks 1–5. The lifecycle `plan_task` log records the completion.

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- Lint passes: (no lint command configured in `package.json` — covered by hook scripts and CI)
- Type check passes: (no type-check command; the codebase is plain ESM JavaScript)
- All acceptance criteria from spec satisfied:
  - [x] `scripts/build-cursor-hooks.mjs` exists at the plugin root and uses only Node built-ins — Task 2
  - [x] `package.json:scripts["build:cursor-hooks"]` runs `node scripts/build-cursor-hooks.mjs` — Task 3
  - [x] Translation table defined inline as exported constant, covers all 7 Claude event/matcher pairs — Task 1
  - [x] `npm run build:cursor-hooks` produces `providers/cursor/hooks.json` matching the documented JSON shape — Task 2 + Task 4
  - [x] Every canonical command rewritten to `./hooks/<script>.sh` — Task 2
  - [x] Every `PreToolUse` source entry maps to a pre-action Cursor event (semantic invariant) — Task 1 (table) + Task 2 (transform)
  - [x] `failClosed` and `timeout` per-class defaults — Task 1 (constants) + Task 2 (stamping)
  - [x] Atomic write via temp file + rename — Task 2
  - [x] Throws on unmapped Claude event/matcher — Task 2
  - [x] Throws on non-canonical hook command (SEC-1) — Task 2
  - [x] `tests/cursor-hooks-sync.test.mjs` exists, Node built-ins only — Task 5
  - [x] Passes when in sync — Task 5
  - [x] Fails with the regenerate-hint message on drift — Task 5 + Task 6
  - [x] Runs under `npm test` — Task 3 (npm-script wiring) + Task 5 (file location matches `tests/*.test.mjs` glob)
  - [x] Autonomous-lane compliance (no protocol/install-path/registration-format changes, no new deps) — entire plan; verified by `/adev:validate` constitution check

Governance gates from `.context-index/governance/gates.yaml` will be applied by `/adev:validate` at the end; this plan does not duplicate that gate inventory.
