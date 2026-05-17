<!-- DO NOT EDIT statuses inline — see lifecycle log driver-substrate.jsonl -->
# Implementation Plan: Driver Substrate

> **Methodology:** adev
> **Charter:** .context-index/specs/features/cli-driver-surface/charter.md
> **Spec:** .context-index/specs/features/cli-driver-surface/driver-substrate.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-14)
> **Platform:** Node.js (ESM, .mjs), node:test, npm — zero new external dependencies

**Goal:** Establish the compiler-driver pattern for adev — a uniform `lib/cli/<verb>.mjs` module convention with a Map-keyed dispatch table in `cli/index.mjs`, the helper-side `requireGate(state, <step>)` discipline, and the first exemplar CLI verb `adev gate require` that proves the pattern and ships as a usable primitive.

**Architecture:** Refactor `cli/index.mjs` from a hand-wired `if/else if` cmd-name chain into a Map registry keyed by verb name → module-import factory. Each `lib/cli/<verb>.mjs` exports `run({ projectRoot, argv, manifest })` (returns Promise) and `help()` (returns or prints help text); modules bound to a lifecycle step additionally export `LIFECYCLE_STEP: string`. The dispatcher catches `GateError` → exit 2 (per hook protocol) and other exceptions → exit 1. A pattern test (`tests/cli-driver-pattern.test.mjs`) walks `lib/cli/*.mjs` and asserts the contract via source-text inspection (regex on the AST-equivalent token stream — no parser dependency). The first helper, `lib/cli/gate.mjs`, exercises the pattern by accepting `--skill <name> --spec <path>`, loading state, and calling `requireGate` as its first executable line.

---

## Blocking Prerequisite

**`cli` charter revision (rev 2 → rev 3)** must land BEFORE Task 1. The current `cli` charter (rev 2, approved 2026-04-24) declares `"Must remain a single file (cli/index.mjs)"` as an explicit constraint. Adding `lib/cli/gate.mjs` (Task 2) would violate that constraint. The revision is handled via `/adev:brainstorm --module cli` as a separate PR. This plan assumes the revision has merged before Task 1 starts.

---

## File Structure

**Create:**
- `lib/cli/gate.mjs` — First exemplar CLI helper; `adev gate require --skill <name> --spec <path>` primitive.
- `tests/cli/gate.test.mjs` — Unit tests for `gate.mjs`.
- `tests/cli/dispatcher.test.mjs` — Unit tests for `cli/index.mjs` verb registry, dispatch loop, and exit-code policy.
- `tests/cli-driver-pattern.test.mjs` — Walks `lib/cli/*.mjs`, asserts each conforms to the driver-substrate contract.
- `tests/fixtures/cli/` (directory) — Test fixtures for the pattern test (synthetic conforming + non-conforming modules used to validate the assertions).

**Modify:**
- `cli/index.mjs` — Add `VERB_REGISTRY` Map, refactor dispatch from hand-wired `cmdInstall`/`cmdUpgrade`/etc. chain to Map-keyed lookup with dynamic import, add `GateError`/exception exit-code policy, add convention-comment block. Preserve all existing commands (`install`, `upgrade`, `uninstall`, `init`, `extension`, `status`, `migrate`, `help`).
- `cli/index.mjs` — Replace `cmdHelp` to read from `VERB_REGISTRY` (no longer a hand-wired string).

**Reference (read, do not modify):**
- `lib/lifecycle-state.mjs` — Source of `requireGate`, `currentState`, `GateError`. Consumed unchanged.
- `lib/manifest.mjs` — Source of `loadManifest`, `resolveGateMode`. Consumed unchanged.
- `.context-index/specs/features/cli-driver-surface/driver-substrate.spec.md` — The spec being implemented.
- `.context-index/research/adev-vs-compiler-dispatch-patterns.md` — §2.1 (driver model), §7 (helper-side gating) — design grounding.

---

## Context Packets

### Task 1 Context

- Spec: `.context-index/specs/features/cli-driver-surface/driver-substrate.spec.md` (Behaviors 1, 5, 6, 7, 8, 9; Error Cases rows 1–7)
- Charter: `.context-index/specs/features/cli-driver-surface/charter.md` (capability: "Driver substrate" + "`cli` charter revision")
- Source files (full read): `cli/index.mjs` (lines 1–1299 — the file being refactored)
- Source files (signatures only — `grep '^export\|^function\|^async function' lib/lifecycle-state.mjs`): `lib/lifecycle-state.mjs`
- Constitution: `.context-index/constitution.md` (Principles 1, 3, 4; Anti-Patterns section — note the existing "No hardcoded paths to `~/.claude/`" rule)
- ADR (decision + rationale only): `.context-index/adrs/0007-conventional-commit-enforcement.md` (existing pre-commit hook precedent for exit-code policy)
- Heuristics: 0 entries for module `cli-driver-surface` (none yet — first plan in module)

### Task 2 Context

- Spec: same spec, Behaviors 2 (export shape), 4 (gate require primitive); Postcondition 1
- Charter: same charter (capability: "Helper-side `requireGate` discipline" + "`adev gate require` CLI verb")
- Source files (full read): `lib/lifecycle-state.mjs` (focus on `requireGate`, `currentState`, `GateError` exports — line ranges to be confirmed via grep at task time)
- Source files (full read after Task 1 lands): `cli/index.mjs` (the new verb registry — to register `gate` verb)
- Source files (signatures only): `lib/manifest.mjs`
- Research grounding: `adev-vs-compiler-dispatch-patterns.md` §7.2 (helper-side `requireGate` code example) — Task 2's `gate.mjs::run` directly mirrors this sketch.
- Heuristics: 0 entries

### Task 3 Context

- Spec: same spec, Behaviors 2 (export shape), 3 (requireGate-first for LIFECYCLE_STEP-bound); Postcondition 5
- Source files (full read): `lib/cli/gate.mjs` (newly created by Task 2 — used as the first real module the pattern test walks)
- Test scaffolding: `tests/helpers.mjs` (existing test utilities — read signatures to understand the helper surface)
- Research grounding: `adev-vs-compiler-dispatch-patterns.md` §3 (the "executable logic lives in compiled, tested, callable units" principle that the pattern test enforces)

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 (each depends on the previous)
- No parallel groups — this plan is foundational and inherently linear.

Future plans (other driver-substrate-dependent specs) can parallelize against this once Task 3 lands.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|---|---|---|---|---|
| 1 | Verb registry + dispatch + exit-code policy in `cli/index.mjs` | Medium | unit | cli charter rev 3 (external) | 1 modify, 2 create |
| 2 | `lib/cli/gate.mjs` — first exemplar helper with path containment | Medium | unit | Task 1 | 2 create, 1 modify |
| 3 | Pattern test + `LIFECYCLE_STEP` AST assertion | Medium | unit | Task 2 | 1 create, fixtures |

---

## Strategy Summary

All tasks assigned strategy `unit` (source: fallback). Constitution declares `npm test` (= `node --test tests/`) as the single quality gate; no integration, schema, or visual strategies needed.

No `## Test Infrastructure Requirements` section emitted — pure unit tests on local filesystem; no external systems.

---

## Task Structure

### Task 1: Verb registry + dispatch + exit-code policy in `cli/index.mjs` [specialist: none]

**Charter capability:** Driver substrate (`lib/cli/<verb>.mjs` + dispatch) + `adev gate require` CLI verb (dispatcher half)

**Strategy:** unit (source: fallback, confidence: high)

**Files:**
- Modify: `cli/index.mjs` — refactor dispatch table from hand-wired `cmdInstall`/`cmdStatus`/etc. chain to a Map-keyed registry. Preserve all existing commands by registering them in the new registry. Add convention-comment block (≤30 lines) above the registry documenting the contract: `run({projectRoot, argv, manifest})` returns Promise, `help()` mandatory, optional `LIFECYCLE_STEP`, exit codes 0/1/2.
- Create: `tests/cli/dispatcher.test.mjs` — exercise behaviors 1 (verb resolution), 5 (`GateError` → exit 2), 6 (other exceptions → exit 1), 7 (no verb → exit 1 + registry print), 8 (unknown verb → exit 1 + message), 9 (`adev <verb> --help` dispatches to module's `help()`).
- Create: `tests/cli-driver-pattern.test.mjs` (stub — full assertions in Task 3) — initial implementation walks `lib/cli/*.mjs` and asserts every module exports both `run` (function) and `help` (function); fails CI if any module is non-conforming. AST-grep for `requireGate` is deferred to Task 3.

**Tests:** `tests/cli/dispatcher.test.mjs`, `tests/cli-driver-pattern.test.mjs`

**Context to load:**
- `cli/index.mjs` (full file, especially lines 590–1220 — existing `cmdInstall`/`cmdUpgrade`/`cmdUninstall`/`cmdExtension`/`cmdStatus`/`cmdMigrate`/`cmdHelp`)
- `lib/lifecycle-state.mjs` (line range for `GateError` definition; signatures via grep)
- Constitution Principles 1 (zero deps — argv parsing via `node:util::parseArgs`), 3 (ESM), 4 (hook protocol)

- [ ] **Write failing tests**

```javascript
// tests/cli/dispatcher.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import { execSync, spawnSync } from 'child_process';

const CLI = 'cli/index.mjs';

test('adev with no verb prints registry and exits 1', () => {
  const r = spawnSync('node', [CLI], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout + r.stderr, /install|upgrade|uninstall|status|migrate/);
});

test('adev <unknown-verb> exits 1 with "unknown verb" message', () => {
  const r = spawnSync('node', [CLI, 'nonexistent'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr + r.stdout, /unknown verb/);
});

test('adev install dispatches to cmdInstall (smoke check via --help)', () => {
  const r = spawnSync('node', [CLI, 'install', '--help'], { encoding: 'utf8' });
  // install must continue to work post-refactor; --help should not throw
  assert.notStrictEqual(r.status, 127); // not "command not found"
});

test('GateError from a registered helper produces exit 2', { todo: 'requires gate.mjs from Task 2' });
test('non-GateError exception from helper produces exit 1', { todo: 'requires fixture helper' });
```

```javascript
// tests/cli-driver-pattern.test.mjs (stub)
import { test } from 'node:test';
import assert from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CLI_LIB_DIR = 'lib/cli';

test('every lib/cli/*.mjs exports run and help', async () => {
  let modules = [];
  try { modules = readdirSync(CLI_LIB_DIR).filter(f => f.endsWith('.mjs')); }
  catch { /* directory does not exist yet — vacuously passes */ return; }

  for (const file of modules) {
    const src = readFileSync(join(CLI_LIB_DIR, file), 'utf8');
    assert.match(src, /export\s+(?:async\s+)?function\s+run\b|export\s*\{[^}]*\brun\b/, `${file} missing run export`);
    assert.match(src, /export\s+(?:async\s+)?function\s+help\b|export\s*\{[^}]*\bhelp\b/, `${file} missing help export`);
  }
});

test('AST: LIFECYCLE_STEP-bound modules have requireGate as first executable statement', { todo: 'Task 3' });
```

- [ ] **Verify tests fail**

Run: `node --test tests/cli/dispatcher.test.mjs tests/cli-driver-pattern.test.mjs`
Expected: dispatcher tests fail (existing `cli/index.mjs` does not yet have registry/error-conversion logic); pattern test passes vacuously (no `lib/cli/*.mjs` yet).

- [ ] **Implement**

In `cli/index.mjs`:

1. Add the convention comment block above the dispatch logic:

```javascript
// ============================================================================
// CLI Verb Registry
// ----------------------------------------------------------------------------
// Each entry maps a verb name to a module-import factory that returns
// { run, help, LIFECYCLE_STEP? }. Contract:
//
//   run({ projectRoot, argv, manifest }) => Promise<void>
//   help() => void  (mandatory; prints help text to stdout)
//   LIFECYCLE_STEP?: string  (modules bound to a lifecycle step;
//                              run() must call requireGate() first)
//
// Exit codes (per hook protocol):
//   0  success
//   1  fatal error (unknown verb, missing argument, unexpected exception)
//   2  gate-blocked (GateError thrown from run())
//
// Adding a verb: create lib/cli/<verb>.mjs and add one line below.
// ============================================================================

// ⚠ NOTE: the registry sketch below shows separate _legacy-*.mjs files —
//   this is SUPERSEDED by the inline-closure approach in the next section.
//   Do not create _legacy-*.mjs files. See the inline-closure registry below.
const VERB_REGISTRY = new Map([
  ['install',   () => import('./_legacy-install.mjs')],   // wraps cmdInstall
  ['upgrade',   () => import('./_legacy-upgrade.mjs')],
  ['uninstall', () => import('./_legacy-uninstall.mjs')],
  ['init',      () => import('./_legacy-init.mjs')],
  ['extension', () => import('./_legacy-extension.mjs')],
  ['status',    () => import('./_legacy-status.mjs')],
  ['migrate',   () => import('./_legacy-migrate.mjs')],
  ['help',      () => import('./_legacy-help.mjs')],
]);
```

Use **inline adapter closures inside the registry** — no new `_legacy-*.mjs` files. The closures forward to existing functions:

```javascript
const VERB_REGISTRY = new Map([
  ['install',   () => ({ run: () => cmdInstall(),           help: () => cmdHelp('install') })],
  ['upgrade',   () => ({ run: () => cmdUpgrade(),           help: () => cmdHelp('upgrade') })],
  ['uninstall', () => ({ run: () => cmdUninstall(),         help: () => cmdHelp('uninstall') })],
  ['init',      () => ({ run: () => /* routes to install or upgrade */ cmdInstall(), help: () => cmdHelp('init') })],
  ['extension', () => ({ run: () => cmdExtension(process.argv), help: () => cmdHelp('extension') })],
  ['status',    () => ({ run: () => cmdStatus(),            help: () => cmdHelp('status') })],
  ['migrate',   () => ({ run: () => cmdMigrate(process.argv), help: () => cmdHelp('migrate') })],
  ['help',      () => ({ run: () => cmdHelp(),              help: () => cmdHelp() })],
  // ['gate', () => import('../lib/cli/gate.mjs')]  ← added in Task 2
]);
```

**Critical detail — argv forwarding:** Legacy commands like `cmdMigrate` and `cmdExtension` parse their own arguments from `process.argv` (they accept the full argv array, not just verb-args). The closures above forward `process.argv` to those functions. New-pattern helpers (like `gate.mjs` in Task 2) follow the new contract and receive `{ projectRoot, argv, manifest }` with `argv` being verb-args only. The dispatch loop branches on the factory return shape: if it has `LIFECYCLE_STEP` or accepts the new contract, pass `{ projectRoot, argv: verbArgs, manifest }`; for legacy closures (which take no args), call with no args and let them read `process.argv` themselves.

Simpler concrete rule: legacy closures wrap `() => cmdX(process.argv)` calls. The new-contract path applies only when the registry entry is a module import (e.g., `() => import('../lib/cli/gate.mjs')`).

2. Add the dispatch loop:

```javascript
function stripAnsi(s) {
  return typeof s === 'string' ? s.replace(/\x1b\[[0-9;]*m/g, '') : s;
}

async function dispatch(argv) {
  const verb = argv[2];
  if (!verb) {
    printVerbRegistry();
    process.exit(1);
  }
  const factory = VERB_REGISTRY.get(verb);
  if (!factory) {
    console.error(`unknown verb: ${stripAnsi(verb)}`);
    printVerbRegistry();
    process.exit(1);
  }
  const verbArgs = argv.slice(3);
  if (verbArgs.includes('--help')) {
    const mod = await factory();
    mod.help();
    process.exit(0);
  }
  try {
    const mod = await factory();
    // New-contract modules (lib/cli/*.mjs) accept {projectRoot, argv, manifest}.
    // Legacy adapter closures (install/upgrade/etc.) take no args and read process.argv internally.
    if (mod.run.length === 0) {
      await mod.run();
    } else {
      const manifest = loadManifest(PROJECT_ROOT);
      await mod.run({ projectRoot: PROJECT_ROOT, argv: verbArgs, manifest });
    }
    process.exit(0);
  } catch (err) {
    if (err && err.code === 'GATE_BLOCKED') {
      console.error(stripAnsi(err.message));
      process.exit(2);
    }
    console.error(stripAnsi(err.message));
    if (err.stack) console.error(stripAnsi(err.stack));
    process.exit(1);
  }
}
```

`stripAnsi` addresses SEC-2 from the spec review (sanitize verb names and error messages before stdout/stderr emission). `GateError` is detected via `err.code === 'GATE_BLOCKED'` per `lib/lifecycle-state.mjs` lines 863–873 (verified against the actual source); this is safer than `instanceof` across module-instance boundaries.

3. Replace the existing top-level dispatch (the `if/else if` chain around line ~1200) with `await dispatch(process.argv)`.

4. Re-implement `cmdHelp` (or the equivalent) to read from `VERB_REGISTRY`:

```javascript
function printVerbRegistry() {
  console.log('Usage: adev <verb> [args]');
  console.log('');
  console.log('Verbs:');
  for (const verb of VERB_REGISTRY.keys()) {
    console.log(`  ${verb}`);
  }
}
```

- [ ] **Verify tests pass**

Run: `node --test tests/cli/dispatcher.test.mjs tests/cli-driver-pattern.test.mjs`
Expected: PASS (5 dispatcher tests pass; the 2 `todo` tests remain as TODOs). `npm test` (full suite) passes.

- [ ] **Commit**

```bash
git add cli/index.mjs tests/cli/dispatcher.test.mjs tests/cli-driver-pattern.test.mjs
git commit -m "$(cat <<'EOF'
feat(cli-driver-surface): verb registry + dispatch in cli/index.mjs

Replaces the hand-wired cmd dispatch chain with a Map-keyed verb registry.
Each entry maps a verb name to a factory returning { run, help, LIFECYCLE_STEP? }.
Dispatcher converts GateError → exit 2 and other exceptions → exit 1 per
the hook protocol.

Includes:
  - tests/cli/dispatcher.test.mjs (5 behaviors + 2 TODOs)
  - tests/cli-driver-pattern.test.mjs (stub — walks lib/cli/*.mjs)
  - Convention-comment block documenting the contract

Spec: .context-index/specs/features/cli-driver-surface/driver-substrate.spec.md
Plan-task: 1

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `lib/cli/gate.mjs` — first exemplar helper with path containment [specialist: none]

**Charter capability:** Helper-side `requireGate` discipline + `adev gate require` CLI verb (helper half)

**Strategy:** unit (source: fallback, confidence: high)

**Depends on:** Task 1 (verb registry must exist)

**Files:**
- Create: `lib/cli/gate.mjs` — exports `run({ projectRoot, argv, manifest })` and `help()`. `run` parses `--skill <name>` and `--spec <path>`, applies path containment, loads `currentState(projectRoot, spec)`, calls `requireGate(state, <step-derived-from-skill>, { mode })` as the first executable line, exits 0 if pass. Note: `gate.mjs` is a query primitive — it does NOT export `LIFECYCLE_STEP` (gate is not itself a lifecycle step).
- Create: `tests/cli/gate.test.mjs` — covers Behavior 4 + Error Cases rows 3 (missing `--skill`), 4 (missing `--spec`), 5 (spec file not found), 6 (`GateError` → exit 2 via dispatcher).
- Modify: `cli/index.mjs` — add `['gate', () => import('../lib/cli/gate.mjs')]` to `VERB_REGISTRY`.

**Tests:** `tests/cli/gate.test.mjs`

**Context to load:**
- `lib/lifecycle-state.mjs` (full read — needs `requireGate`, `currentState`, `GateError` definitions and `resolveGateMode` signature)
- `lib/manifest.mjs` (signatures — `loadManifest`, `resolveGateMode`)
- Research §7.2 from `adev-vs-compiler-dispatch-patterns.md` — the canonical helper-side gate code sketch this task implements

- [ ] **Write failing tests**

```javascript
// tests/cli/gate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'child_process';
import { writeFileSync, mkdtempSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const CLI = 'cli/index.mjs';

function makeTempProject() {
  const dir = mkdtempSync(join(tmpdir(), 'adev-gate-test-'));
  mkdirSync(join(dir, '.context-index/specs/features/m'), { recursive: true });
  writeFileSync(join(dir, '.context-index/manifest.yaml'), 'project:\n  name: t\n  adev_version: "0.22.0"\n');
  return dir;
}

test('adev gate require missing --skill exits 1 with usage', () => {
  const r = spawnSync('node', [CLI, 'gate', 'require', '--spec', 'x'], { encoding: 'utf8', cwd: makeTempProject() });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr + r.stdout, /--skill|usage/i);
});

test('adev gate require missing --spec exits 1', () => {
  const r = spawnSync('node', [CLI, 'gate', 'require', '--skill', 'validate'], { encoding: 'utf8', cwd: makeTempProject() });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr + r.stdout, /--spec|usage/i);
});

test('adev gate require --spec <missing-file> exits 1 with "spec not found"', () => {
  const dir = makeTempProject();
  const r = spawnSync('node', [CLI, 'gate', 'require', '--skill', 'validate', '--spec', '.context-index/specs/features/m/does-not-exist.spec.md'], { encoding: 'utf8', cwd: dir });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /spec not found/);
});

test('adev gate require with out-of-bounds --spec path exits 1 (containment)', () => {
  const dir = makeTempProject();
  const r = spawnSync('node', [CLI, 'gate', 'require', '--skill', 'validate', '--spec', '../../../etc/passwd'], { encoding: 'utf8', cwd: dir });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /spec not found|escapes project root/);
});

test('adev gate require on spec where prior step is complete with verdict returns 0', () => {
  const dir = makeTempProject();
  // Write a spec + lifecycle log with specify completed-PASS and review completed-PASS
  const specRel = '.context-index/specs/features/m/x.spec.md';
  writeFileSync(join(dir, specRel), '---\ncharter: m\nstatus: review-passed\n---\n# x\n');
  mkdirSync(join(dir, '.context-index/lifecycle-state'), { recursive: true });
  const events = [
    JSON.stringify({ event: 'lifecycle_step', step: 'specify', status: 'completed', verdict: 'PASS', ts: '2026-05-14T00:00:00Z' }),
    JSON.stringify({ event: 'lifecycle_step', step: 'review', status: 'completed', verdict: 'PASS', ts: '2026-05-14T00:01:00Z' }),
  ].join('\n') + '\n';
  writeFileSync(join(dir, '.context-index/lifecycle-state/x.jsonl'), events);

  const r = spawnSync('node', [CLI, 'gate', 'require', '--skill', 'plan', '--spec', specRel], { encoding: 'utf8', cwd: dir });
  assert.strictEqual(r.status, 0, `expected 0, got ${r.status}: ${r.stderr}`);
});

test('adev gate require where prior step incomplete returns 2 (GateError)', () => {
  const dir = makeTempProject();
  const specRel = '.context-index/specs/features/m/y.spec.md';
  writeFileSync(join(dir, specRel), '---\ncharter: m\nstatus: draft\n---\n# y\n');
  // No lifecycle-state file → no prior step events → gate blocks

  const r = spawnSync('node', [CLI, 'gate', 'require', '--skill', 'plan', '--spec', specRel], { encoding: 'utf8', cwd: dir });
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /gate|requires|prior step/i);
});

test('lib/cli/gate.mjs exports run and help', async () => {
  const mod = await import('../../lib/cli/gate.mjs');
  assert.strictEqual(typeof mod.run, 'function');
  assert.strictEqual(typeof mod.help, 'function');
});

test('lib/cli/gate.mjs does NOT export LIFECYCLE_STEP (query primitive, not lifecycle step)', async () => {
  const mod = await import('../../lib/cli/gate.mjs');
  assert.strictEqual(mod.LIFECYCLE_STEP, undefined);
});
```

- [ ] **Verify tests fail**

Run: `node --test tests/cli/gate.test.mjs`
Expected: FAIL — `Cannot find module '../../lib/cli/gate.mjs'` (or similar) for all tests.

- [ ] **Implement**

Create `lib/cli/gate.mjs`:

```javascript
// lib/cli/gate.mjs
//
// adev gate require --skill <name> --spec <path>
//
// Query primitive: evaluates a lifecycle gate for a spec without performing
// any side-effecting work. Exit codes:
//   0  gate passes (prior step complete with PASS or PASS_WITH_NOTES verdict)
//   2  gate blocked (GateError, per hook protocol)
//   1  argument error or spec not found
//
// NOTE: gate.mjs does NOT export LIFECYCLE_STEP because it is not bound to
// a lifecycle step — it is a query over state, not a step that mutates state.

import { parseArgs } from 'node:util';
import { resolve, isAbsolute } from 'node:path';
import { existsSync } from 'node:fs';
import { currentState, requireGate, resolveGateMode } from '../lifecycle-state.mjs';

// Map skill name → lifecycle step the skill ENTERS. Used by requireGate to
// determine which prior step's verdict to check.
const SKILL_STEP_MAP = {
  brainstorm: 'brainstorm',
  specify: 'specify',
  'review-specs': 'review',
  plan: 'plan',
  implement: 'implement',
  validate: 'validate',
  retro: 'retro',
};

export async function run({ projectRoot, argv, manifest }) {
  const sub = argv[0]; // expect 'require'
  if (sub !== 'require') {
    console.error('usage: adev gate require --skill <name> --spec <path>');
    process.exit(1);
  }
  let parsed;
  try {
    parsed = parseArgs({
      args: argv.slice(1),
      options: {
        skill: { type: 'string' },
        spec: { type: 'string' },
      },
      allowPositionals: false,
    });
  } catch (e) {
    console.error('usage: adev gate require --skill <name> --spec <path>');
    process.exit(1);
  }
  const { skill, spec } = parsed.values;
  if (!skill) {
    console.error('usage: adev gate require --skill <name> --spec <path>');
    process.exit(1);
  }
  if (!spec) {
    console.error('usage: adev gate require --skill <name> --spec <path>');
    process.exit(1);
  }

  // Path containment (SEC-1 from review)
  const absSpec = isAbsolute(spec) ? spec : resolve(projectRoot, spec);
  const absRoot = resolve(projectRoot);
  if (!absSpec.startsWith(absRoot + '/') && absSpec !== absRoot) {
    console.error(`spec not found: ${spec}`);
    process.exit(1);
  }
  if (!existsSync(absSpec)) {
    console.error(`spec not found: ${spec}`);
    process.exit(1);
  }

  const step = SKILL_STEP_MAP[skill];
  if (!step) {
    console.error(`unknown skill: ${skill} (no lifecycle step mapping)`);
    process.exit(1);
  }

  // Spec Postcondition 1 says run()'s first executable statement is requireGate(state, ...).
  // We interpret "first executable statement" as "first lifecycle-domain statement after
  // argv parsing / path checks" — argv parsing is preamble, not lifecycle work. This matches
  // the canonical sketch in research/adev-vs-compiler-dispatch-patterns.md §7.2, which also
  // loads state via currentState() before calling requireGate. To honor the spec's wording
  // as literally as practical, we inline state-loading and mode-resolution into the
  // requireGate call expression — making requireGate(...) the single executable expression
  // that does the helper's domain work.
  //
  // Note: gate.mjs does NOT export LIFECYCLE_STEP (it is a query primitive, not a
  // lifecycle-bound step), so tests/cli-driver-pattern.test.mjs's AST-grep does not assert
  // the "requireGate first" rule against gate.mjs. The rule will fire for future
  // lifecycle-bound helpers extracted in the inline-node-extraction-sweep.
  requireGate(currentState(projectRoot, absSpec), step, { mode: resolveGateMode(manifest) });
  // If we reach here, gate passes.
  process.exit(0);
}

export function help() {
  console.log('Usage: adev gate require --skill <name> --spec <path>');
  console.log('');
  console.log('Evaluate a lifecycle gate without performing the skill\'s work.');
  console.log('');
  console.log('Exit codes:');
  console.log('  0  gate passes');
  console.log('  2  gate blocked (prior step incomplete or missing verdict)');
  console.log('  1  argument error or spec not found');
  console.log('');
  console.log('Skills supported:');
  for (const skill of Object.keys(SKILL_STEP_MAP)) {
    console.log(`  ${skill}`);
  }
}
```

Modify `cli/index.mjs` — add to `VERB_REGISTRY`:

```javascript
['gate', () => import('../lib/cli/gate.mjs')],
```

- [ ] **Verify tests pass**

Run: `node --test tests/cli/gate.test.mjs tests/cli/dispatcher.test.mjs tests/cli-driver-pattern.test.mjs`
Expected: PASS — all gate tests pass; pattern test now finds `lib/cli/gate.mjs` and asserts its exports correctly. Full `npm test` also passes.

- [ ] **Commit**

```bash
git add lib/cli/gate.mjs cli/index.mjs tests/cli/gate.test.mjs
git commit -m "$(cat <<'EOF'
feat(cli-driver-surface): lib/cli/gate.mjs + adev gate require primitive

First exemplar CLI helper following the driver-substrate pattern. Exposes
adev gate require --skill <name> --spec <path> as a query primitive over
lifecycle state. Implements path containment for --spec (SEC-1 from review)
and skill-to-step mapping (SA-2). Helper is NOT lifecycle-bound (does not
export LIFECYCLE_STEP) — it queries state, does not mutate.

Spec: .context-index/specs/features/cli-driver-surface/driver-substrate.spec.md
Plan-task: 2

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Pattern test + `LIFECYCLE_STEP` AST assertion [specialist: none]

**Charter capability:** Driver substrate (pattern enforcement) + Helper-side `requireGate` discipline (enforcement)

**Strategy:** unit (source: fallback, confidence: high)

**Depends on:** Task 2 (needs at least one real helper module to walk)

**Files:**
- Modify: `tests/cli-driver-pattern.test.mjs` — strengthen the stub from Task 1 to (a) AST-assert that modules exporting `LIFECYCLE_STEP` have `requireGate(` as the first executable statement inside `run`, and (b) assert that non-conforming modules fail the test.
- Create: `tests/fixtures/cli/conforming.mjs` — synthetic module that exports `run`, `help`, `LIFECYCLE_STEP: 'plan'`, and calls `requireGate` first in `run`. Used as a positive-case fixture.
- Create: `tests/fixtures/cli/non-conforming-no-gate.mjs` — synthetic module that exports `run`, `help`, `LIFECYCLE_STEP: 'plan'`, but does NOT call `requireGate` first. Used as a negative-case fixture (test asserts the pattern detector flags this).
- Create: `tests/fixtures/cli/non-conforming-no-run.mjs` — synthetic module that does NOT export `run`. Negative-case fixture.

**Tests:** `tests/cli-driver-pattern.test.mjs`

**Context to load:**
- `lib/cli/gate.mjs` (newly created — used as a real test subject for the export-shape assertion; note `gate.mjs` deliberately has no `LIFECYCLE_STEP`)
- `tests/cli-driver-pattern.test.mjs` (the Task 1 stub — strengthens it)
- Constitution Principle 1 (zero deps — pattern assertion uses regex on source text rather than a JS parser like acorn)

**AST-assertion approach (no parser dep):**

Use regex-based detection on the source text. For each `lib/cli/<verb>.mjs` that exports `LIFECYCLE_STEP`, find the `run` function body and check the first non-comment, non-empty line is a `requireGate(` call. This is approximate (a real AST parser would be more robust) but is dependency-free per Constitution Principle 1 and sufficient for the convention we're enforcing.

Specifically: locate `export async function run` or `export function run`; capture the body up to the matching `}`; strip leading whitespace and comment lines; the first remaining line must start with `requireGate(` or `await requireGate(`.

- [ ] **Write failing test**

```javascript
// tests/cli-driver-pattern.test.mjs (strengthened)
import { test } from 'node:test';
import assert from 'node:assert';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CLI_LIB_DIR = 'lib/cli';

function listCliModules(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.mjs')).map(f => ({
    file: f,
    path: join(dir, f),
    src: readFileSync(join(dir, f), 'utf8'),
  }));
}

function hasExport(src, name) {
  // export function name | export async function name | export { name, ... } | export const name
  return new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b|export\\s+(?:async\\s+)?const\\s+${name}\\b`).test(src);
}

function getLifecycleStep(src) {
  const m = src.match(/export\s+const\s+LIFECYCLE_STEP\s*=\s*['"]([^'"]+)['"]/);
  return m ? m[1] : null;
}

function firstStatementOfRun(src) {
  // Find "export [async] function run(...)" and capture the body
  const m = src.match(/export\s+(?:async\s+)?function\s+run\s*\([^)]*\)\s*\{/);
  if (!m) return null;
  const bodyStart = m.index + m[0].length;
  // Naive brace matching
  let depth = 1, i = bodyStart;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  const body = src.slice(bodyStart, i - 1);
  // Strip leading whitespace, line comments, and block comments
  const lines = body.split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (t === '' || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
    return t;
  }
  return null;
}

test('every lib/cli/*.mjs exports run and help', () => {
  for (const { file, src } of listCliModules(CLI_LIB_DIR)) {
    assert.ok(hasExport(src, 'run'), `${file} missing run export`);
    assert.ok(hasExport(src, 'help'), `${file} missing help export`);
  }
});

test('LIFECYCLE_STEP-bound modules have requireGate as first statement of run', () => {
  for (const { file, src } of listCliModules(CLI_LIB_DIR)) {
    const step = getLifecycleStep(src);
    if (!step) continue; // not lifecycle-bound; skip
    const first = firstStatementOfRun(src);
    assert.ok(
      first && /^(await\s+)?requireGate\s*\(/.test(first),
      `${file} declares LIFECYCLE_STEP='${step}' but first statement of run() is not requireGate(...) (got: ${first})`
    );
  }
});

// Fixture-driven assertions: ensure the detector works
test('pattern detector flags fixture missing run export', () => {
  const src = readFileSync('tests/fixtures/cli/non-conforming-no-run.mjs', 'utf8');
  assert.strictEqual(hasExport(src, 'run'), false);
});

test('pattern detector flags LIFECYCLE_STEP-bound fixture without requireGate-first', () => {
  const src = readFileSync('tests/fixtures/cli/non-conforming-no-gate.mjs', 'utf8');
  assert.strictEqual(getLifecycleStep(src), 'plan');
  const first = firstStatementOfRun(src);
  assert.ok(first && !/^(await\s+)?requireGate\s*\(/.test(first), 'fixture should not have requireGate first');
});

test('pattern detector accepts conforming fixture', () => {
  const src = readFileSync('tests/fixtures/cli/conforming.mjs', 'utf8');
  assert.ok(hasExport(src, 'run'));
  assert.ok(hasExport(src, 'help'));
  assert.strictEqual(getLifecycleStep(src), 'plan');
  const first = firstStatementOfRun(src);
  assert.ok(/^(await\s+)?requireGate\s*\(/.test(first));
});
```

Create fixtures:

```javascript
// tests/fixtures/cli/conforming.mjs
import { requireGate } from '../../../lib/lifecycle-state.mjs';
export const LIFECYCLE_STEP = 'plan';
export async function run({ projectRoot, argv, manifest, state, mode }) {
  requireGate(state, LIFECYCLE_STEP, { mode });
  // ... actual work
}
export function help() { console.log('fixture'); }
```

```javascript
// tests/fixtures/cli/non-conforming-no-gate.mjs
export const LIFECYCLE_STEP = 'plan';
export async function run() {
  // Declares lifecycle binding but does NOT call requireGate first.
  console.log('doing work without gating');
}
export function help() { console.log('fixture'); }
```

```javascript
// tests/fixtures/cli/non-conforming-no-run.mjs
// Deliberately missing the run export.
export function help() { console.log('fixture'); }
```

- [ ] **Verify test fails**

Run: `node --test tests/cli-driver-pattern.test.mjs`
Expected: tests pass on the real `lib/cli/gate.mjs` (export shape OK; no LIFECYCLE_STEP → AST assertion is skipped). Fixture-driven tests pass (verifying the detector works). One initial failure: the test file references fixtures that don't exist yet — once fixtures are created, all tests pass.

- [ ] **Implement**

(Fixtures + test strengthening shown above. The test file is the implementation.)

- [ ] **Verify tests pass**

Run: `node --test tests/cli-driver-pattern.test.mjs && npm test`
Expected: all tests pass; full quality gate green.

- [ ] **Commit**

```bash
git add tests/cli-driver-pattern.test.mjs tests/fixtures/cli/
git commit -m "$(cat <<'EOF'
feat(cli-driver-surface): pattern test enforces driver-substrate contract

Strengthens tests/cli-driver-pattern.test.mjs from the Task 1 stub:
  - Walks lib/cli/*.mjs and asserts every module exports run + help
  - For LIFECYCLE_STEP-bound modules, asserts requireGate(...) is the
    first executable statement of run() (regex-based source detection,
    zero parser deps per Constitution Principle 1)
  - Adds tests/fixtures/cli/ — conforming + 2 non-conforming fixtures
    that verify the detector works correctly

This is the regression-guard that downstream extraction-sweep PRs depend
on: every new lib/cli/*.mjs module must conform or CI rejects.

Spec: .context-index/specs/features/cli-driver-surface/driver-substrate.spec.md
Plan-task: 3

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Quality Gates

After all 3 tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in `.validate.md`, not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from `driver-substrate.spec.md` satisfied (11 criteria — see spec)
- No new external dependencies introduced (Constitution Principle 1)
- All files `.mjs`, ESM, no CommonJS (Constitution Principle 3)
- Exit codes 0/1/2 per hook protocol (Constitution Principle 4)
- `cli` charter is at rev 3 (single-file constraint dropped) — verified by reading `.context-index/specs/features/cli/charter.md`
