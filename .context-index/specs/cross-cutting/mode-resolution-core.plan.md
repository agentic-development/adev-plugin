<!-- partial_schema: plan@1 -->

# Implementation Plan: Implementation Mode — Resolution Core

> **Methodology:** adev
> **Charter:** .context-index/specs/cross-cutting/implementation-mode/charter.md
> **Spec:** .context-index/specs/cross-cutting/mode-resolution-core.spec.md
> **Review:** PASS_WITH_NOTES (2026-09-10)
> **Platform:** Node.js (ESM), JavaScript, `node:test`, zero external deps

**Goal:** Build the foundational `implementation_mode` mechanism — the `manifest.yaml` key, the canonical `lib/implementation-modes/` resolver, the `adev implementation-mode resolve` CLI verb, and the `/adev:init` prompt that writes the setting — so every later implementation-mode spec (dispatch behavior, routing, observability) has one source of truth to read from.

**Architecture:** Mirrors the existing `lib/risk-tiers/` pattern exactly: a closed-enum `constants.mjs` plus a pure, side-effect-free `resolve.mjs` that takes a pre-parsed manifest and returns a config object (`lib/risk-tiers/resolve.mjs` is the cited precedent). The CLI verb (`lib/cli/implementation-mode.mjs`) is a thin JSON-printing wrapper, following the `lib/cli/domain.mjs` / `lib/cli/test-policy.mjs` driver-substrate contract (exports `run`/`help`, no `LIFECYCLE_STEP`). The `/adev:init` write path reuses `lib/cli/init-prompt-session-capture.mjs`'s `writeSessionCaptureBlock()` splice-preserving approach (per boundary-reviewer BD-2 / consistency-analyzer CON-2) rather than a full YAML reparse-and-reserialize, and is wired into the existing `adev init prompt <sub-verb>` dispatch branch in `cli/index.mjs` (alongside `session-capture` and `ensure-gitignore`) so `skills/init/SKILL.md` names a CLI verb per the cli-driver-surface charter instead of inlining prompt logic. The new `/adev:init` step is inserted as a lettered sub-step (`Step 8b`) following the `Step 8a: Session Capture preferences` precedent — this does not change the fixed `/11` step-count denominator used throughout the file, since lettered sub-steps are additions under an existing numbered step, not new top-level steps.

Terminology note (CON-1): every artifact this plan produces — code, tests, `/adev:init` prose, docs — uses the spec's normative BEH-6 term, **"sensitive-path-floor-bypass warning"**, consistently. The spec's own Task Map/Module-Impact-Map cells still say "sensitive-path floor warning" (CON-1, an open non-blocking spec-text finding); this plan does not edit the spec, only conforms every new artifact to the authoritative BEH-6 name.

---

## File Structure

**Create:**
- `lib/implementation-modes/constants.mjs` — the 3 modes' config objects (`tdd`, `test-required`, `agent-default`), closed-set validation constant, default mode constant. Follows `lib/risk-tiers/constants.mjs` shape.
- `lib/implementation-modes/resolve.mjs` — `resolveImplementationMode(manifest, explicitMode)`: explicit-mode / stored-manifest-value / `tdd`-default resolution chain; throws `UNKNOWN_IMPLEMENTATION_MODE` (bad name) or `MANIFEST_PARSE_ERROR` (re-coded from `loadManifest()`'s uncoded `YamlParseError`).
- `lib/cli/implementation-mode.mjs` — `adev implementation-mode resolve [--mode <name>]` verb; prints the resolver's JSON output; exports `run`/`help`.
- `lib/cli/init-prompt-implementation-mode.mjs` — `adev init prompt implementation-mode` verb; drives the BEH-5/BEH-6 interactive prompt (readline-based, mirroring `init-prompt-session-capture.mjs`'s `promptText()` helper) and the splice-preserving manifest write; exports `run`/`help`.
- `tests/implementation-modes/resolve.test.mjs` — BEH-1..BEH-4 unit coverage + `UNKNOWN_IMPLEMENTATION_MODE`/`MANIFEST_PARSE_ERROR` error-case coverage. Mirrors `tests/risk-tiers/resolve.test.mjs`.
- `tests/cli/implementation-mode.test.mjs` — spawns `adev implementation-mode resolve` and asserts stdout JSON + exit codes. Mirrors `tests/cli/domain.test.mjs` / `tests/cli/test-policy.test.mjs`.
- `tests/cli/init-prompt-implementation-mode.test.mjs` — scripted-input (golden-transcript-style) coverage of BEH-5 (agent-default listed first, no silent accept-on-enter) and BEH-6 (bypass warning shown before write), plus the splice-write assertions (idempotent, preserves unrelated keys). Mirrors `tests/cli/init-prompt-session-capture.test.mjs`'s scripted-readline harness.
- `tests/integration/implementation-mode-round-trip.test.mjs` — the write-then-read round trip required by Acceptance Criteria: runs the prompt module against a temp manifest with scripted `agent-default` input, then calls the resolver against that same manifest and asserts the written value round-trips. Satisfies the spec's explicit "integration test rather than a fixture-only unit test" requirement.

**Modify:**
- `cli/index.mjs:2009` (`VERB_REGISTRY`) — add `["implementation-mode", () => import("../lib/cli/implementation-mode.mjs")]` alongside the `test-policy`/`domain` entries.
- `cli/index.mjs` (`init` verb's sub-verb dispatch, ~line 2013-2027) — add an `if (sub === "prompt" && process.argv[4] === "implementation-mode")` branch importing `lib/cli/init-prompt-implementation-mode.mjs`, matching the existing `session-capture` / `ensure-gitignore` branches.
- `skills/init/SKILL.md` — insert `### Step 8b: Implementation mode preference` immediately after `### Step 8a: Session Capture preferences` (before `Step 9/11: Sync Targets`), naming `adev init prompt implementation-mode`.
- `templates/manifest-template.yaml:129` (near the "Test Policy" block) — document the new `implementation_mode` top-level key: the 3 valid values, the `tdd` default, and a one-line pointer to this spec.

**Reference (read, do not modify):**
- `lib/risk-tiers/constants.mjs`, `lib/risk-tiers/resolve.mjs` — canonical pattern for constants + resolver shape and docstring style.
- `lib/manifest.mjs:40-56` — `loadManifest()`, the exported entry point the resolver wraps; `parseYaml(raw)` at line 56 has no surrounding try/catch (uncoded `YamlParseError`), confirmed by referent-integrity review.
- `lib/gates/gate-sets.mjs:175-186` — private `readManifest()`'s `MANIFEST_PARSE_ERROR` coding pattern (string reused for vocabulary consistency only; not imported).
- `lib/cli/init-prompt-session-capture.mjs:100-206` — `writeSessionCaptureBlock()` splice-preserving write pattern and `promptText()` readline helper; the direct precedent for both the new prompt module's write mechanism and its interactive-input mechanism.
- `lib/cli/domain.mjs`, `lib/cli/test-policy.mjs` — CLI verb driver-substrate shape (`run`/`help` exports, no `LIFECYCLE_STEP`, JSON-on-stdout contract).
- `cli/index.mjs:2009-2089` (`VERB_REGISTRY`) and `:2013-2027` (`init` sub-verb dispatch) — exact insertion points.
- `skills/init/SKILL.md:702-751` (Step 8, Step 8a) — the sub-step precedent and prose style to match for Step 8b.
- `tests/risk-tiers/resolve.test.mjs`, `tests/cli/domain.test.mjs`, `tests/cli/init-prompt-session-capture.test.mjs` — test-shape precedents for the three new suites.
- `tests/lib/lifecycle-state-event-diagnostics.test.mjs:129-136` — the template-documents-a-manifest-key test precedent (WR-3's cited mirror).
- `tests/cli-driver-pattern.test.mjs` — the driver-substrate contract every new `lib/cli/*.mjs` file must satisfy (`run`/`help` exports).

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/cross-cutting/mode-resolution-core.spec.md` (Task Map row "Define mode constants"; BEH-4; Acceptance Criteria rows 1-3)
- Charter: `.context-index/specs/cross-cutting/implementation-mode/charter.md` (Interface Contracts: `lib/implementation-modes/constants.mjs`)
- Source files: `lib/risk-tiers/constants.mjs` (full read — pattern to follow)
- Boundary rules: `.context-index/governance/boundaries.yaml` (`no-commonjs`, `no-inline-node-in-skills` — neither applies to a plain `.mjs` constants module, noted for completeness)

### Task 2 Context
- Spec: criteria "resolve --mode X" rows, "no --mode + no stored value", "no --mode + stored value", "bogus mode", "malformed manifest.yaml"; Behaviors BEH-1, BEH-2, BEH-3, BEH-4; Error Cases table
- Charter: Interface Contracts (`lib/implementation-modes/constants.mjs` referenced by the resolver)
- Source files: `lib/risk-tiers/resolve.mjs` (full read — pattern), `lib/manifest.mjs:40-56` (full read — `loadManifest()` signature and uncoded-error behavior), `lib/gates/gate-sets.mjs:170-186` (signature only — `readManifest()`'s `MANIFEST_PARSE_ERROR` coding, prior art not a dependency)
- Review notes: consistency-analyzer's revision-3 confirmation that `MANIFEST_PARSE_ERROR` is the *resolver's own* re-coding of `loadManifest()`'s uncoded error, not a reuse of `readManifest()`

### Task 3 Context
- Spec: BEH-1/BEH-2/BEH-3 (verb must expose all 3 paths); Error Cases table (exit 1 / exit 2 semantics)
- Charter: Interface Contracts (`adev implementation-mode resolve`)
- Source files: `lib/cli/domain.mjs:1-90` (signatures + module header — driver shape), `lib/cli/test-policy.mjs` (export signatures only), `cli/index.mjs:2058,2085` (VERB_REGISTRY entry pattern)
- Boundary rules: none applicable (no subprocess, no path containment beyond existing `loadManifest()`)

### Task 4 Context
- Spec: BEH-5, BEH-6; Task Map row "Update `/adev:init`"; Module Impact Map `setup` row (sensitive-path-floor-bypass warning requirement)
- Charter: "Guardrail integrity" quality attribute (bypass must be surfaced at selection time); Out of Scope section (the bypass itself is accepted, not fixed, here)
- Wiring note (WR-2): the prompt's option list/ordering MUST be generated from `lib/implementation-modes/constants.mjs`, not a separately authored literal list
- Write mechanism note (BD-2/CON-2): the manifest write MUST reuse the splice-preserving approach, not a full reparse/rewrite
- Source files: `lib/cli/init-prompt-session-capture.mjs` (full read — `promptText()`, `writeSessionCaptureBlock()`, `run()` argv/readline shape), `lib/implementation-modes/constants.mjs` (full read, produced by Task 1)

### Task 5 Context
- Spec: Acceptance Criteria "write-then-read round trip ... verified by an integration test rather than a fixture-only unit test"
- Source files: `lib/implementation-modes/resolve.mjs` (produced by Task 2), `lib/cli/init-prompt-implementation-mode.mjs` (produced by Task 4), `tests/helpers.mjs` (full read — `createTempDir()`, `cleanupTempDir()`, `writeFixture()`)

### Task 6 Context
- Spec: BEH-5, BEH-6; Module Impact Map `setup` row
- Source files: `skills/init/SKILL.md:702-751` (full read — Step 8/Step 8a prose to match), `skills/init/SKILL.md:211-229` (Step 7.0 — the other precedent for a project-wide enum prompt with a "Diagnostic Mode" re-run behavior)
- Cross-cutting: none beyond the parent charter (deferred `using-adev` obligations are explicitly out of this spec's scope — see spec's Module Impact Map)

### Task 7 Context
- Spec: Task Map row "Update `templates/manifest-template.yaml`"; WR-3 finding (missing test coverage)
- Source files: `templates/manifest-template.yaml:125-145` (full read — Test Policy block, insertion point), `tests/lib/lifecycle-state-event-diagnostics.test.mjs:127-136` (full read — the cited test-shape precedent), `tests/templates/manifest-template.test.mjs` (full read — existing suite to extend)

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: A universal coverage claim must ship with the predicate that checks it (confidence: medium)
- **Pattern:** When closing a coverage gap in a spec or acceptance criterion, state the executable check alongside the claim — the exact command or match, and the paths it runs over.
- **Anti-pattern:** Answer a repeatedly-missed surface by widening the assertion to an unbounded universal that cannot be discharged.
- **Evidence:** 1 observation

### Heuristic: Summarized skill output produces equivalent artifact quality (confidence: medium)
- **Pattern:** When a skill writes an artifact to disk, instruct it to return only a structured summary to the conversation — the artifact on disk is equally complete.
- **Anti-pattern:** Assume shorter conversational echo means lower-quality artifacts.
- **Evidence:** 1 observation

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 (resolver chain: constants feed the resolver, the resolver feeds the CLI verb)
- Group B (sequential, shares Task 1's output but touches disjoint files thereafter): Task 1 → Task 4 → Task 6 (prompt module, then the `/adev:init` sub-verb wiring and SKILL.md step)
- Group C (independent): Task 7 (template documentation — no code dependency on any other task)
- Task 5 depends on the tail of both Group A (Task 3) and Group B (Task 4) — it exercises the real CLI verb and the real prompt module together.

Group C can run fully in parallel with Groups A/B. Within Groups A and B, tasks are sequential (each modifies or extends files the next task reads).

**Shared-file caveat:** Task 3 and Task 4 both modify `cli/index.mjs` (Task 3 adds the `VERB_REGISTRY` entry; Task 4 adds the `init` sub-verb dispatch branch) and neither depends on the other. If Groups A and B are dispatched to separate parallel agents, sequence Task 3 and Task 4 relative to each other (or merge their `cli/index.mjs` edits by hand) to avoid a merge conflict on that file — `/adev:implement` should not run them concurrently even though the Parallelization grouping above otherwise allows it.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Define mode constants | small | unit | — | 1 create, 0 modify |
| 2 | Write resolver | small | unit | Task 1 | 1 create, 0 modify |
| 3 | Wire `implementation-mode resolve` CLI verb | small | unit | Task 2 | 1 create, 1 modify |
| 4 | `/adev:init` prompt module (BEH-5/BEH-6 + splice write) | medium | unit | Task 1 | 1 create, 1 modify |
| 5 | Write-then-read round-trip integration test | small | integration | Task 3, Task 4 | 1 create, 0 modify |
| 6 | `skills/init/SKILL.md` Step 8b | small | unit | Task 4 | 0 create, 1 modify |
| 7 | `templates/manifest-template.yaml` documentation + test | small | unit | — | 0 create, 1 modify (+ extend 1 existing test file) |

---

### Task 1: Define mode constants [specialist: none]

**Charter capability:** `lib/implementation-modes/constants.mjs` (Interface Contracts — canonical mode definitions)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/implementation-modes/constants.mjs`
- Test: `tests/implementation-modes/resolve.test.mjs`

**Tests:** `tests/implementation-modes/resolve.test.mjs` — create. Covers BEH-4 (result always contains exactly `dispatch_red`, `ordering_enforced`, `coverage_check`, never partial) at the constants level: every entry in the exported config map has exactly those 3 keys.

**Context to load:**
- `lib/risk-tiers/constants.mjs` (pattern to follow — `RISK_TIER_NAMES`, `DEFAULT_RISK_TIER`, `RISK_TIER_NAME_PATTERN` shape)

- [ ] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { IMPLEMENTATION_MODE_NAMES, DEFAULT_IMPLEMENTATION_MODE, IMPLEMENTATION_MODE_CONFIGS } from '../../lib/implementation-modes/constants.mjs';

describe('implementation-mode constants', () => {
  it('declares exactly the 3 modes from the charter', () => {
    assert.deepStrictEqual([...IMPLEMENTATION_MODE_NAMES].sort(), ['agent-default', 'test-required', 'tdd']);
  });

  it('defaults to tdd for full backward compatibility', () => {
    assert.equal(DEFAULT_IMPLEMENTATION_MODE, 'tdd');
  });

  it('every mode config has exactly {dispatch_red, ordering_enforced, coverage_check}', () => {
    for (const name of IMPLEMENTATION_MODE_NAMES) {
      const cfg = IMPLEMENTATION_MODE_CONFIGS.get(name);
      assert.deepStrictEqual(Object.keys(cfg).sort(), ['coverage_check', 'dispatch_red', 'ordering_enforced']);
    }
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/implementation-modes/resolve.test.mjs`
Expected: FAIL — `Cannot find module '../../lib/implementation-modes/constants.mjs'`

- [ ] **Implement**

Follow `lib/risk-tiers/constants.mjs`'s doc-comment style. `tdd`: `{dispatch_red: true, ordering_enforced: true, coverage_check: "pre-hoc"}`. `test-required`: `{dispatch_red: false, ordering_enforced: false, coverage_check: "post-hoc"}`. `agent-default`: `{dispatch_red: false, ordering_enforced: false, coverage_check: "none"}`. Export `IMPLEMENTATION_MODE_NAMES` (a `Set`), `DEFAULT_IMPLEMENTATION_MODE` (`'tdd'`), `IMPLEMENTATION_MODE_CONFIGS` (a `Map` name → config object).

- [ ] **Verify test passes**

Run: `node --test tests/implementation-modes/resolve.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch: `feat/implementation-mode/mode-resolution-core`

```bash
git add lib/implementation-modes/constants.mjs tests/implementation-modes/resolve.test.mjs
git commit -m "$(cat <<'EOF'
feat(lib): add implementation-mode constants

Spec: .context-index/specs/cross-cutting/mode-resolution-core.spec.md
Plan-task: 1
EOF
)"
```

---

### Task 2: Write resolver [specialist: none]

**Depends on:** Task 1
**Charter capability:** `lib/implementation-modes/resolve.mjs` (Interface Contracts — canonical config resolver)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/implementation-modes/resolve.mjs`
- Test: `tests/implementation-modes/resolve.test.mjs` (extend)

**Tests:** `tests/implementation-modes/resolve.test.mjs` — extend (from Task 1). Covers BEH-1, BEH-2, BEH-3, plus the `UNKNOWN_IMPLEMENTATION_MODE` and `MANIFEST_PARSE_ERROR` error cases.

**Context to load:**
- `lib/risk-tiers/resolve.mjs` (pattern — validate-then-return shape, `err.code` convention)
- `lib/manifest.mjs:40-56` (`loadManifest()` — exported, no try/catch around `parseYaml()`)
- `lib/gates/gate-sets.mjs:170-186` (prior-art string only — do not import)

- [ ] **Write failing test**

```javascript
it('BEH-1: explicit --mode resolves directly, ignoring manifest.yaml', () => {
  const result = resolveImplementationMode({ implementation_mode: 'agent-default' }, 'tdd');
  assert.equal(result.mode, 'tdd');
  assert.equal(result.source, 'explicit');
});

it('BEH-2: no explicit mode, no stored value -> tdd default', () => {
  const result = resolveImplementationMode({}, undefined);
  assert.equal(result.mode, 'tdd');
  assert.equal(result.source, 'default');
});

it('BEH-3: no explicit mode, stored value -> resolves stored value', () => {
  const result = resolveImplementationMode({ implementation_mode: 'test-required' }, undefined);
  assert.equal(result.mode, 'test-required');
  assert.equal(result.source, 'manifest');
});

it('throws UNKNOWN_IMPLEMENTATION_MODE for a bad explicit mode, listing the 3 options', () => {
  assert.throws(
    () => resolveImplementationMode({}, 'bogus'),
    (err) => err.code === 'UNKNOWN_IMPLEMENTATION_MODE' && /tdd/.test(err.message) && /test-required/.test(err.message) && /agent-default/.test(err.message)
  );
});

it('re-codes a malformed manifest.yaml as MANIFEST_PARSE_ERROR naming the file', () => {
  assert.throws(
    () => resolveImplementationModeFromProjectRoot(malformedProjectRoot),
    (err) => err.code === 'MANIFEST_PARSE_ERROR' && /manifest\.yaml/.test(err.message)
  );
});
```

- [ ] **Verify test fails**

Run: `node --test tests/implementation-modes/resolve.test.mjs`
Expected: FAIL — `Cannot find module '../../lib/implementation-modes/resolve.mjs'`

- [ ] **Implement**

`resolveImplementationMode(manifest, explicitMode)` — pure function over a pre-parsed manifest (mirrors `resolveRiskTier`'s signature). BEH-1: if `explicitMode` is given, validate and return `{mode, config, source: 'explicit'}` without touching `manifest.implementation_mode`. BEH-2/BEH-3: else read `manifest?.implementation_mode`; absent → `{mode: DEFAULT_IMPLEMENTATION_MODE, config, source: 'default'}`; present → validate and return `{..., source: 'manifest'}`. Validation against `IMPLEMENTATION_MODE_NAMES` throws `err.code = 'UNKNOWN_IMPLEMENTATION_MODE'` with a message listing all 3 valid options (per Error Cases table — no side effects on this path). Add a second exported function, `resolveImplementationModeFromProjectRoot(projectRoot, explicitMode)`, that wraps the `loadManifest(projectRoot)` call in its own try/catch — this resolver's own coding decision, not a reused throw — catching the uncoded `YamlParseError` `loadManifest()` throws and re-throwing it coded `err.code = 'MANIFEST_PARSE_ERROR'` naming the offending `manifest.yaml` path, then delegates to `resolveImplementationMode`. This split keeps `resolveImplementationMode` pure (matches the `resolveRiskTier` precedent's "no file I/O" contract) while giving the CLI verb (Task 3) a single call that owns both manifest loading and resolution.

- [ ] **Verify test passes**

Run: `node --test tests/implementation-modes/resolve.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/implementation-modes/resolve.mjs tests/implementation-modes/resolve.test.mjs
git commit -m "$(cat <<'EOF'
feat(lib): add implementation-mode resolver

Spec: .context-index/specs/cross-cutting/mode-resolution-core.spec.md
Plan-task: 2
EOF
)"
```

---

### Task 3: Wire `implementation-mode resolve` CLI verb [specialist: none]

**Depends on:** Task 2
**Charter capability:** `adev implementation-mode resolve` (Interface Contracts)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/cli/implementation-mode.mjs`
- Modify: `cli/index.mjs:2009` (add `VERB_REGISTRY` entry)
- Test: `tests/cli/implementation-mode.test.mjs`

**Tests:** `tests/cli/implementation-mode.test.mjs` — create.

**Context to load:**
- `lib/cli/domain.mjs` (driver shape: `run({projectRoot, argv, manifest})`, `help()`, plugin-root resolution via `fileURLToPath`)
- `lib/cli/test-policy.mjs` (a second same-shape precedent)
- `tests/cli/domain.test.mjs` (spawn-and-assert-stdout test shape)
- `tests/cli-driver-pattern.test.mjs` (the `run`/`help` export contract this file must satisfy)

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('adev implementation-mode resolve --mode tdd prints the tdd config', () => {
  const out = JSON.parse(execFileSync('node', [CLI_PATH, 'implementation-mode', 'resolve', '--mode', 'tdd']).toString());
  assert.equal(out.mode, 'tdd');
  assert.deepStrictEqual(Object.keys(out.config).sort(), ['coverage_check', 'dispatch_red', 'ordering_enforced']);
});

test('adev implementation-mode resolve --mode bogus exits 1 with UNKNOWN_IMPLEMENTATION_MODE', () => {
  assert.throws(() => execFileSync('node', [CLI_PATH, 'implementation-mode', 'resolve', '--mode', 'bogus'], { stdio: 'pipe' }),
    (err) => err.status === 1 && /UNKNOWN_IMPLEMENTATION_MODE/.test(err.stderr.toString()));
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/implementation-mode.test.mjs`
Expected: FAIL — unknown verb `implementation-mode`

- [ ] **Implement**

`lib/cli/implementation-mode.mjs` exports `run({projectRoot, argv})`: parses `--mode <name>` via `node:util`'s `parseArgs`; calls `resolveImplementationModeFromProjectRoot(projectRoot, mode)`; prints `JSON.stringify({mode, config, source})` to stdout; catches `UNKNOWN_IMPLEMENTATION_MODE` → `console.error(err.message); process.exit(1)`; catches `MANIFEST_PARSE_ERROR` → `console.error(err.message); process.exit(2)`. Exports `help()` printing the usage line. Wire into `cli/index.mjs`'s `VERB_REGISTRY`: `["implementation-mode", () => import("../lib/cli/implementation-mode.mjs")]`, alongside the existing `test-policy`/`domain` entries (~line 2085).

- [ ] **Verify test passes**

Run: `node --test tests/cli/implementation-mode.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/implementation-mode.mjs cli/index.mjs tests/cli/implementation-mode.test.mjs
git commit -m "$(cat <<'EOF'
feat(cli): wire implementation-mode resolve verb

Spec: .context-index/specs/cross-cutting/mode-resolution-core.spec.md
Plan-task: 3
EOF
)"
```

---

### Task 4: `/adev:init` prompt module (BEH-5/BEH-6 + splice write) [specialist: none]

**Depends on:** Task 1
**Charter capability:** New `/adev:init` question (Affected Modules: `setup`); Guardrail integrity quality attribute (bypass surfaced at selection time)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/cli/init-prompt-implementation-mode.mjs`
- Modify: `cli/index.mjs` (`init` verb's sub-verb dispatch, ~line 2013-2027 — add the `implementation-mode` branch)
- Test: `tests/cli/init-prompt-implementation-mode.test.mjs`

**Tests:** `tests/cli/init-prompt-implementation-mode.test.mjs` — create. Covers BEH-5 (agent-default listed first for a project with no existing value, empty input rejected — no silent accept-on-enter) and BEH-6 (the sensitive-path-floor-bypass warning is displayed before the `agent-default` value is written), via a scripted-input harness that feeds canned readline answers and captures stdout, mirroring `tests/cli/init-prompt-session-capture.mjs`'s approach. Also covers the splice-write contract: byte-identical on rerun with the same value, unrelated manifest keys untouched.

**Context to load:**
- `lib/cli/init-prompt-session-capture.mjs` (full pattern: `promptText()`, `writeSessionCaptureBlock()`, `run({projectRoot, argv, manifest})` shape)
- `lib/implementation-modes/constants.mjs` (from Task 1 — the menu's option source, per WR-2)

- [ ] **Write failing test**

```javascript
test('BEH-5: agent-default is listed first when no stored implementation_mode exists', async () => {
  const { stdout } = await runPromptWithScriptedInput(freshManifestPath, ['agent-default']);
  const menuOrder = extractMenuOrder(stdout); // parses the printed option list
  assert.equal(menuOrder[0], 'agent-default');
});

test('BEH-5: empty input is rejected, not silently accepted as a default', async () => {
  const { stdout } = await runPromptWithScriptedInput(freshManifestPath, ['', 'tdd']);
  assert.match(stdout, /you must (choose|type)/i);
});

test('BEH-6: the sensitive-path-floor-bypass warning is shown before agent-default is written', async () => {
  const { stdout, manifestAfter } = await runPromptWithScriptedInput(freshManifestPath, ['agent-default']);
  const warningIdx = stdout.indexOf('sensitive-path-floor-bypass warning');
  const writeIdx = stdout.indexOf('implementation_mode: agent-default');
  assert.ok(warningIdx >= 0 && warningIdx < writeIdx);
  assert.match(manifestAfter, /implementation_mode:\s*agent-default/);
});

test('splice write is idempotent and preserves unrelated keys', async () => {
  const before = readFileSync(manifestWithUnrelatedKeys, 'utf8');
  await runPromptWithScriptedInput(manifestWithUnrelatedKeys, ['tdd']);
  const after1 = readFileSync(manifestWithUnrelatedKeys, 'utf8');
  await runPromptWithScriptedInput(manifestWithUnrelatedKeys, ['tdd']);
  const after2 = readFileSync(manifestWithUnrelatedKeys, 'utf8');
  assert.equal(after1, after2); // idempotent
  assert.ok(after1.includes('risk_tier:')); // unrelated key preserved
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/init-prompt-implementation-mode.test.mjs`
Expected: FAIL — `Cannot find module '../../lib/cli/init-prompt-implementation-mode.mjs'`

- [ ] **Implement**

Build the option menu from `IMPLEMENTATION_MODE_NAMES` / `IMPLEMENTATION_MODE_CONFIGS` (Task 1) — `agent-default` sorted first, `tdd` and `test-required` following in a stable order — satisfying WR-2 by construction rather than a separately authored literal list. Loop on `promptText()` (ported from `init-prompt-session-capture.mjs`) rejecting empty/unrecognized input with a "you must type a choice" message and re-prompting — no default is silently accepted. When the selected value is `agent-default`, print the sensitive-path-floor-bypass warning (naming `governance/sensitive-paths.yaml` and the auth/crypto/secrets/CI floor it bypasses) *before* performing the write. Write `implementation_mode: <value>` as a top-level manifest key via a splice function analogous to `writeSessionCaptureBlock()` — locate an existing `implementation_mode:` line and replace only it, or append the key as a new top-level line near `risk_tier:` if `risk_tier:` exists, or at end-of-file otherwise; never a full YAML reparse/reserialize (BD-2/CON-2). Export `run({projectRoot, argv, manifest, __scriptedInput})` and `help()`. `__scriptedInput`, when present, is an array of canned answers consumed in order instead of live `readline` input — this is the module's one piece of test-support surface, defined here (not left for a later task to guess at), and it is what both this task's own BEH-5/BEH-6 tests and Task 5's integration test drive the prompt with. When `__scriptedInput` is absent, `run()` opens a real `readline` interface exactly as `init-prompt-session-capture.mjs` does. Add the dispatch branch in `cli/index.mjs`'s `init` verb (mirroring the `session-capture`/`ensure-gitignore` `if (sub === ...)` branches at ~line 2013-2027): `if (sub === "prompt" && process.argv[4] === "implementation-mode") { const mod = await import("../lib/cli/init-prompt-implementation-mode.mjs"); ... }`.

- [ ] **Verify test passes**

Run: `node --test tests/cli/init-prompt-implementation-mode.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/init-prompt-implementation-mode.mjs cli/index.mjs tests/cli/init-prompt-implementation-mode.test.mjs
git commit -m "$(cat <<'EOF'
feat(setup): add implementation-mode init prompt

Spec: .context-index/specs/cross-cutting/mode-resolution-core.spec.md
Plan-task: 4
EOF
)"
```

---

### Task 5: Write-then-read round-trip integration test [specialist: none]

**Depends on:** Task 3, Task 4
**Charter capability:** Auditability / Single source of truth quality attributes — the write path and read path must agree
**Strategy:** integration (source: spec-declared, confidence: high) — the spec's own Acceptance Criteria explicitly requires this round trip be "verified by an integration test rather than a fixture-only unit test"; the strategy label reflects that requirement rather than the fallback default. No external infra is needed — `node:test` plus a temp directory is sufficient (no infra_requirements entry).
**Files:**
- Create: `tests/integration/implementation-mode-round-trip.test.mjs`

**Tests:** `tests/integration/implementation-mode-round-trip.test.mjs` — create. This is the acceptance criterion's explicit "integration test rather than a fixture-only unit test": it drives the real prompt module (Task 4) against a real temp `manifest.yaml`, then calls the real resolver (Task 2, via the Task 3 CLI verb or the underlying function directly) against that same file — no fixture manifest is hand-authored with the value pre-set.

**Context to load:**
- `lib/cli/init-prompt-implementation-mode.mjs` (Task 4's `run()`)
- `lib/implementation-modes/resolve.mjs` (Task 2's `resolveImplementationModeFromProjectRoot()`)
- `tests/helpers.mjs` (`createTempDir()`, `cleanupTempDir()`, `writeFixture()`)

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';
import { resolveImplementationModeFromProjectRoot } from '../../lib/implementation-modes/resolve.mjs';

test('write-then-read round trip: /adev:init writes test-required, resolve reads it back', async (t) => {
  const dir = createTempDir();
  t.after(() => cleanupTempDir(dir));
  writeFixture(dir, '.context-index/manifest.yaml', 'project:\n  name: "fixture"\n');

  const { run } = await import('../../lib/cli/init-prompt-implementation-mode.mjs');
  await run({ projectRoot: dir, argv: [], manifest: null, __scriptedInput: ['test-required'] });

  const result = resolveImplementationModeFromProjectRoot(dir, undefined);
  assert.equal(result.mode, 'test-required');
  assert.equal(result.source, 'manifest');
});
```

- [ ] **Verify test fails**

Run: `node --test tests/integration/implementation-mode-round-trip.test.mjs`
Expected: FAIL — module not found if Task 4 has not yet been implemented in this run (this task always executes after Task 4 per its `Depends on` line)

- [ ] **Implement**

No new production code: Task 4 already defines `run({..., __scriptedInput})` as its public test-support surface. Wire this test through the two already-built modules exactly as shown in the failing-test snippet above — pass `__scriptedInput: ['test-required']` to Task 4's `run()`, then call Task 2's `resolveImplementationModeFromProjectRoot()` against the same temp project root.

- [ ] **Verify test passes**

Run: `node --test tests/integration/implementation-mode-round-trip.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add tests/integration/implementation-mode-round-trip.test.mjs lib/cli/init-prompt-implementation-mode.mjs
git commit -m "$(cat <<'EOF'
test(setup): add implementation-mode write-then-read round trip

Spec: .context-index/specs/cross-cutting/mode-resolution-core.spec.md
Plan-task: 5
EOF
)"
```

---

### Task 6: `skills/init/SKILL.md` Step 8b [specialist: none]

**Depends on:** Task 4
**Charter capability:** New `/adev:init` question, independent of the risk-tier prompt (charter Scope); Discoverability quality attribute
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/init/SKILL.md` (insert `### Step 8b: Implementation mode preference` after `### Step 8a: Session Capture preferences`, line ~751, before `Step 9/11: Sync Targets`)
- Test: `tests/skills/init-implementation-mode-prompt.test.mjs`

**Tests:** `tests/skills/init-implementation-mode-prompt.test.mjs` — create. A static text-assertion suite over the SKILL.md prose (mirrors `tests/skills/init-risk-tier-overlay-baseline.test.mjs`'s approach): asserts the new step names `adev init prompt implementation-mode` (per the cli-driver-surface anti-pattern — no inlined prompt logic in the skill body), asserts the prose states `agent-default` is listed first and that empty input is rejected, and asserts the prose names the sensitive-path-floor-bypass warning by its BEH-6 term.

**Context to load:**
- `skills/init/SKILL.md:702-751` (Step 8 / Step 8a — structure and prose style to match)
- `skills/init/SKILL.md:211-229` (Step 7.0 — the "Diagnostic Mode" precedent: an existing stored value resolves silently on re-run, no prompt, no rewrite)

- [ ] **Write failing test**

```javascript
test('Step 8b names the adev init prompt implementation-mode verb, not inline logic', () => {
  assert.match(content, /### Step 8b: Implementation mode/);
  assert.match(content, /adev init prompt implementation-mode/);
});

test('Step 8b states agent-default is listed first and empty input is rejected', () => {
  const section = extractSection(content, '### Step 8b', '### Step 9') ?? extractSection(content, '### Step 8b', 'Step 9/11');
  assert.match(section, /agent-default.*first/is);
  assert.match(section, /no (silent|default).*empty|empty.*(rejected|not accepted)/is);
});

test('Step 8b names the sensitive-path-floor-bypass warning by its BEH-6 term', () => {
  const section = extractSection(content, '### Step 8b', '### Step 9') ?? extractSection(content, '### Step 8b', 'Step 9/11');
  assert.match(section, /sensitive-path-floor-bypass warning/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/init-implementation-mode-prompt.test.mjs`
Expected: FAIL — `### Step 8b` not found

- [ ] **Implement**

Insert `### Step 8b: Implementation mode preference` after Step 8a's closing line (~751) and before `Step 9/11: Sync Targets` (~754), following Step 8a's shape: a fenced `Step 8b/11: Implementation Mode` display block listing the 3 modes with `agent-default` first and the sensitive-path-floor-bypass warning inline on that option, then a paragraph naming `adev init prompt implementation-mode` as the verb that drives the step (owns the menu ordering, the no-silent-accept validation, and the splice write), and a "Diagnostic Mode" paragraph mirroring Step 7.0's: an existing project with an already-stored `implementation_mode` value resolves it silently on re-run (via `adev implementation-mode resolve`) with no re-prompt — the BEH-5 ordering rule applies only to a project's first pass through this step. Close with a `Spec:` pointer to `.context-index/specs/cross-cutting/mode-resolution-core.spec.md`.

- [ ] **Verify test passes**

Run: `node --test tests/skills/init-implementation-mode-prompt.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/init/SKILL.md tests/skills/init-implementation-mode-prompt.test.mjs
git commit -m "$(cat <<'EOF'
docs(setup): add implementation mode step to /adev:init

Spec: .context-index/specs/cross-cutting/mode-resolution-core.spec.md
Plan-task: 6
EOF
)"
```

---

### Task 7: `templates/manifest-template.yaml` documentation + test [specialist: none]

**Charter capability:** New section in `templates/manifest-template.yaml` near the Test Policy block (Task Map, Affected Modules `setup` row)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `templates/manifest-template.yaml` (near line 129, the "Test Policy" block)
- Test: `tests/templates/manifest-template.test.mjs` (extend)

**Tests:** `tests/templates/manifest-template.test.mjs` — extend. Addresses WR-3 (no acceptance criterion/test previously asserted the template documents the key), mirroring `tests/lib/lifecycle-state-event-diagnostics.test.mjs:129`'s "manifest-template documents X" pattern.

**Context to load:**
- `templates/manifest-template.yaml:125-145` (Test Policy block — insertion point and comment style)
- `tests/lib/lifecycle-state-event-diagnostics.test.mjs:127-136` (cited test-shape precedent)
- `cli/index.mjs:342` (confirms this template is copied to `manifest.yaml` at scaffold time — the real consumer WR-3 verified)

- [ ] **Write failing test**

```javascript
test('manifest-template.yaml documents implementation_mode (WR-3)', () => {
  const raw = readFileSync(join(PLUGIN_ROOT, 'templates', 'manifest-template.yaml'), 'utf8');
  assert.match(raw, /implementation_mode/);
  assert.match(raw, /tdd/);
  assert.match(raw, /test-required/);
  assert.match(raw, /agent-default/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/templates/manifest-template.test.mjs`
Expected: FAIL — no `implementation_mode` mention in the template

- [ ] **Implement**

Add a commented documentation block near the existing "Test Policy" section (line ~129) naming `implementation_mode` (`tdd` / `test-required` / `agent-default`), stating the `tdd` default, and pointing to this spec — following the existing commented-block style used for `test_policy` (lines 129-137). Do not add a live `implementation_mode:` key to the template itself (the key is written by `/adev:init`'s Step 8b prompt, not scaffolded with a literal default the way `test_policy:` is) — document it as a comment describing the setting, consistent with how the template documents `lifecycle.event_diagnostics` in the WR-3-cited precedent.

- [ ] **Verify test passes**

Run: `node --test tests/templates/manifest-template.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add templates/manifest-template.yaml tests/templates/manifest-template.test.mjs
git commit -m "$(cat <<'EOF'
docs(setup): document implementation_mode in manifest template

Spec: .context-index/specs/cross-cutting/mode-resolution-core.spec.md
Plan-task: 7
EOF
)"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from `.context-index/specs/cross-cutting/mode-resolution-core.spec.md` satisfied
- No constitutional violations (Principle 1 — zero new dependencies; Principle 3 — pure ESM; Anti-Pattern — no inline Node in `skills/init/SKILL.md`, verified by the existing `tests/skills-no-inline-node.test.mjs` sweep and `.githooks/pre-commit-no-inline-node`)
- Every new `lib/cli/*.mjs` file satisfies the driver-substrate contract (`tests/cli-driver-pattern.test.mjs`: exports `run` and `help`)
- Deferred, non-blocking follow-ups noted by review (not gated here): WR-1 (dispatch-behavior consumer wiring — owned by a future, not-yet-filed spec), BD-1 (the persisted `agent-default` bypass grant — self-acknowledged trade-off, deferred to the future `using-adev`-scoped spec per the charter's own scope split)
