# Implementation Plan: Plan-Routing Sidecar (`.routing.md`)

> **Methodology:** adev
> **Charter:** .context-index/specs/features/agent-reliable-state-artifacts/charter.md
> **Spec:** .context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md
> **Review:** PASS (2026-05-19)
> **Platform:** Node.js (ESM), npm, node:test

**Goal:** Stop `/adev:route` from mutating plan markdown by persisting routing decisions to a sibling `<plan-stem>.routing.md` sidecar, and tighten the plan-immutability detector to catch the mutate-then-single-add-commit pattern that today's `--diff-filter=M` history check misses.

**Architecture:** Introduce `lib/plan-routing-sidecar.mjs` as a thin reader/writer pair using the established temp-then-rename atomic-write pattern (mirroring `lib/build-state.mjs`). Wire two new CLI verbs (`adev route emit-sidecar`, `adev implement read-routing`) so the `/adev:route` and `/adev:implement` SKILL.md files remain markdown-only per the cli-driver-surface charter. Extend `lib/plan-immutability.mjs` with a working-tree inspection branch independent of git history. Amend `plan-task-events.spec.md` CON-8 to enumerate the four permitted sidecar peers per ADR-0012, then flip ADR-0012 from Proposed to Accepted.

---

## File Structure

**Create:**
- `lib/plan-routing-sidecar.mjs` — Atomic writer/reader pair: `writeRoutingSidecar(planPath, entries)` and `readRoutingSidecar(planPath)`. Temp-then-rename, schema validation, deterministic markdown emission keyed by `task_id`.
- `tests/lib/plan-routing-sidecar.test.mjs` — Unit tests for write/read roundtrip, atomic-rename semantics, schema validation, `SIDECAR_WRITE_FAILED` error path, `ROUTING_ENTRY_MISSING` lookup miss.
- `tests/fixtures/plan-immutability/clean-plan/` — Fixture: plan body with no inline `**Routing:**` blocks and no sibling sidecar. Detector expected to pass.
- `tests/fixtures/plan-immutability/mutate-then-single-add/` — Fixture: plan body with inline `**Routing:**` blocks committed as a single add, no sibling `.routing.md`. Detector expected to flag `PLAN_MUTATED_WITHOUT_SIDECAR`.
- `tests/fixtures/plan-immutability/sidecar-present-plus-inline/` — Fixture: plan body with inline `**Routing:**` blocks AND a sibling `.routing.md`. Detector expected to tolerate the inline blocks (legacy migration noise) but still apply the per-task M-commit check.

**Modify:**
- `cli/index.mjs` — Register two new subcommands: `route emit-sidecar` (writer) and `implement read-routing` (reader). Wire each to the new lib helpers; surface all four documented error codes (`SIDECAR_WRITE_FAILED`, `ROUTING_SIDECAR_MISSING`, `ROUTING_ENTRY_MISSING`, `ROUTING_AGENT_INVALID`) on stderr with non-zero exits.
- `skills/route/SKILL.md` — Replace Step 4 plan-mutation directive with sidecar-emit directive naming `adev route emit-sidecar`. Tighten the Red Flag section to forbid any inline `**Routing:**` block in the plan body. Add an integration note that `/adev:implement` reads routing from the sidecar.
- `skills/implement/SKILL.md` — Replace the inline-routing-parsing step with a sidecar-read step naming `adev implement read-routing`. Document the four routing-error codes and the "do not silently fall back to inline parsing" rule.
- `lib/plan-immutability.mjs` — Add a working-tree inspection branch: when scanning a plan, grep for inline `**Routing:**` / `**Scores:**` / `**Rationale:**` blocks; if any are present AND no sibling `<plan-stem>.routing.md` exists, emit `PLAN_MUTATED_WITHOUT_SIDECAR`. When a sidecar is present, tolerate the inline blocks but keep the existing per-task M-commit history check.
- `tests/skills/plan-task-immutability.test.mjs` — Cover the three new fixtures: clean (pass), mutate-then-single-add (flag), sidecar-present-plus-inline (tolerate inline, flag only on M-commit history).
- `.context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md` — Amend invariant CON-8 to explicitly enumerate the four permitted sidecar peers (`.review.md`, `.validate.md`, `.routing.md`, `.blockers.md`); cross-reference ADR-0012; bump `revision`.
- `.context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md` — Flip `status` from Proposed to Accepted; add a footnote citing this spec's path and the three satisfied acceptance criteria (`/adev:route` fix, CON-8 enumeration, detector enhancement).

**Reference (read, do not modify):**
- `lib/build-state.mjs` — Atomic-write exemplar; mirror its temp-then-rename + lock-coordination pattern.
- `lib/lifecycle-state.mjs` — Reader pattern for per-spec sibling artifacts; reference shape for the projection-style sidecar reader.
- `.context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md` — Sidecar naming convention, closed-enum of four peers, acceptance criteria for Accepted status.
- `.context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md` — CON-8 prose and surrounding invariants context.

## Context Packets

### Task 1 Context (sidecar lib)
- Spec: `.context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md` (Behaviors 1-3, Postconditions, Error Cases: `SIDECAR_WRITE_FAILED`, `ROUTING_ENTRY_MISSING`)
- Charter: `.context-index/specs/features/agent-reliable-state-artifacts/charter.md` (Capability: "Plan-adjacent sidecar pattern", "`/adev:route` plan-mutation fix")
- Source files: `lib/build-state.mjs` (atomic-write pattern, full read), `lib/plan-immutability.mjs` (export signatures only — `grep ^export`)
- ADR: `.context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md` (Decision + Rationale sections only)
- Heuristics: 3 entries for module `agent-reliable-state-artifacts` (IDs: session-jsonl-token-measurement, cache-reads-context-cost, summarized-skill-output-quality)

### Task 2 Context (`adev route emit-sidecar` verb)
- Spec: `.context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md` (Behavior 1, Error Cases: `SIDECAR_WRITE_FAILED`)
- Source files: `cli/index.mjs` (verb-dispatch pattern, signatures only via `grep '^  case'`), `lib/plan-routing-sidecar.mjs` (from Task 1)
- Sample: existing CLI verb implementations in `cli/index.mjs` for `partial inspect`, `report --type step` as patterns

### Task 3 Context (`adev implement read-routing` verb)
- Spec: `.context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md` (Behaviors 4-5, Error Cases: `ROUTING_SIDECAR_MISSING`, `ROUTING_ENTRY_MISSING`, `ROUTING_AGENT_INVALID`)
- Source files: `cli/index.mjs` (verb-dispatch pattern), `lib/plan-routing-sidecar.mjs` (reader from Task 1)
- Charter: `.context-index/specs/features/agent-reliable-state-artifacts/charter.md` (Capability: "`/adev:route` plan-mutation fix")

### Task 4 Context (detector enhancement)
- Spec: `.context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md` (Behaviors 6-7, Error Cases: `PLAN_MUTATED_WITHOUT_SIDECAR`)
- Source files: `lib/plan-immutability.mjs` (full read — primary edit target), `tests/skills/plan-task-immutability.test.mjs` (test structure via `grep '^describe\|^it\|^test'`)
- Charter: `.context-index/specs/features/agent-reliable-state-artifacts/charter.md` (Capability: "Plan-immutability detector enhancement")
- ADR: `.context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md` (Detector responsibilities section)

### Task 5 Context (`/adev:route` SKILL.md rewrite)
- Spec: `.context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md` (Behavior 1, Error Cases: skill-level guard row)
- Source files: `skills/route/SKILL.md` (full read — primary edit target)
- Constitution: `.context-index/constitution.md` (Anti-Patterns to Avoid — no inline-Node in SKILL.md; cli-driver-surface boundary)

### Task 6 Context (`/adev:implement` SKILL.md update)
- Spec: `.context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md` (Behaviors 4-5)
- Source files: `skills/implement/SKILL.md` (full read — primary edit target)
- Constitution: `.context-index/constitution.md` (cli-driver-surface boundary; descriptive-reference-only rule for fenced JavaScript)

### Task 7 Context (CON-8 amendment)
- Spec: `.context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md` (Behavior 8)
- Source files: `.context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md` (full read — primary edit target; locate CON-8)
- ADR: `.context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md` (Closed enum of peers; cross-reference target)

### Task 8 Context (ADR-0012 transition)
- Spec: `.context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md` (System Constitution Reference — ADR-0012 acceptance gate)
- Source files: `.context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md` (full read — primary edit target; locate status frontmatter and "Acceptance criteria for Accepted status")
- Charter: `.context-index/specs/features/agent-reliable-state-artifacts/charter.md` (rev-7 additions for transition rationale)

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption or cost of adev skills, parse real session JSONL files from ~/.claude/projects/ (message.usage fields: input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens). Dispatch paired A/B subagents and compare their JSONL data for controlled experiments.
- **Anti-pattern:** Estimate tokens using bytes/4 or hardcoded assumptions about thinking budgets and cache hit rates. These overstate savings by 2-2.5x vs real measurements.
- **Evidence:** 1 observations

### Heuristic: Cache reads are 71% of session cost — minimize context accumulation (confidence: medium)
- **Pattern:** When optimizing token cost, focus on reducing what accumulates in conversation context (output echoes, artifact dumps, verbose subagent returns). Every output token persists as a cache read on all subsequent turns, creating multiplicative amplification.
- **Anti-pattern:** Focus on reducing input token counts (SKILL.md sizes, context packets). Input is <1% of cost; cache reads at 0.1x pricing dominate due to volume (98% of all tokens processed).
- **Evidence:** 1 observations

### Heuristic: Summarized skill output produces equivalent artifact quality (confidence: medium)
- **Pattern:** When a skill writes an artifact to disk (plan, review, validation report), instruct it to return only a structured summary to the conversation. The artifact on disk will be equally complete — the summarization instruction affects echo volume, not reasoning.
- **Anti-pattern:** Assume that shorter output means lower quality artifacts. The model reasons the same way regardless of how much it echoes back. A/B eval showed 12/12 rubric parity with 36% cost savings.
- **Evidence:** 1 observations

## Parallelization

- Group A (sequential — shared `lib/plan-routing-sidecar.mjs`): Task 1 → Task 2 → Task 3
- Group B (independent — `lib/plan-immutability.mjs` + its tests): Task 4
- Group C (independent — SKILL.md files): Task 5, Task 6 (touch different files; can run in parallel with each other)
- Group D (independent — docs): Task 7 (CON-8 amendment), Task 8 (ADR-0012 transition). Task 8 SHOULD run last because it is the closing transition; Task 7 has no ordering constraint.

Group B can run in parallel with Group A. Groups C and D should run after Groups A and B so the SKILL.md references and ADR claims describe shipped code.

## Task Summary

| #  | Title                                                  | Complexity | Strategy | Depends On       | Files                  |
|----|--------------------------------------------------------|------------|----------|------------------|------------------------|
| t1 | Sidecar schema + writer/reader lib                     | small      | unit     | —                | 2 create, 0 modify     |
| t2 | `adev route emit-sidecar` CLI verb                     | small      | unit     | t1               | 0 create, 1 modify     |
| t3 | `adev implement read-routing` CLI verb                 | small      | unit     | t1               | 0 create, 1 modify     |
| t4 | Plan-immutability detector enhancement + fixtures      | medium     | unit     | —                | 3 create, 2 modify     |
| t5 | `/adev:route` SKILL.md Step 4 rewrite                  | small      | unit     | t2               | 0 create, 1 modify     |
| t6 | `/adev:implement` SKILL.md routing-reader update       | small      | unit     | t3               | 0 create, 1 modify     |
| t7 | `plan-task-events.spec.md` CON-8 amendment             | small      | unit     | —                | 0 create, 1 modify     |
| t8 | ADR-0012 transition Proposed → Accepted                | small      | unit     | t1, t4, t7       | 0 create, 1 modify     |

## Strategy Summary

| Strategy | Tasks | Source   |
|----------|-------|----------|
| unit     | 8     | fallback |

## Task Structure

### Task t1: Sidecar schema + writer/reader lib [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Well-specified contract with explicit error codes; mirrors the existing `lib/build-state.mjs` atomic-write exemplar within a single new file pair.

**Charter capability:** Plan-adjacent sidecar pattern *(rev 7)* — closed enum of four peers; `routing` peer's writer/reader live here.
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/plan-routing-sidecar.mjs`
- Create: `tests/lib/plan-routing-sidecar.test.mjs`
- Test: `tests/lib/plan-routing-sidecar.test.mjs`

**Tests:** `tests/lib/plan-routing-sidecar.test.mjs` — write/read roundtrip, atomic-rename failure path, schema validation on read, missing-entry lookup.

**Context to load:**
- `lib/build-state.mjs` (atomic-write exemplar — temp-then-rename pattern)
- `.context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md` (Decision + Rationale)
- Spec Behaviors 1-3 and Error Cases (`SIDECAR_WRITE_FAILED`, `ROUTING_ENTRY_MISSING`)

- [ ] **Write failing test**

Create `tests/lib/plan-routing-sidecar.test.mjs` exercising the contract:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  writeRoutingSidecar,
  readRoutingSidecar,
} from '../../lib/plan-routing-sidecar.mjs';

test('writeRoutingSidecar then readRoutingSidecar roundtrip', () => {
  const dir = mkdtempSync(join(tmpdir(), 'routing-'));
  const planPath = join(dir, 'foo.plan.md');
  writeFileSync(planPath, '# Plan\n');
  const entries = [
    { task_id: 't1', selected_agent: 'auto-agent',
      scores: { spec_completeness: 0.9, pattern_coverage: 0.8, blast_radius: 0.2, novelty: 0.3 },
      rationale: 'high-conf path' },
  ];
  writeRoutingSidecar(planPath, entries);
  const sidecarPath = planPath.replace(/\.plan\.md$/, '.routing.md');
  assert.ok(existsSync(sidecarPath));
  const round = readRoutingSidecar(planPath);
  assert.deepEqual(round, entries);
  rmSync(dir, { recursive: true });
});

test('readRoutingSidecar throws ROUTING_ENTRY_MISSING on missing task_id', () => {
  // implementation detail: reader exposes a helper that resolves a task_id;
  // here we assert the lib surfaces a typed error.
});

test('writeRoutingSidecar atomically renames; partial temp left on failure', () => {
  // simulate rename failure path; assert no committed sidecar; assert temp left for inspection
});
```

- [ ] **Verify test fails**

Run: `npm test -- tests/lib/plan-routing-sidecar.test.mjs`
Expected: FAIL — `Cannot find module '../../lib/plan-routing-sidecar.mjs'` (or equivalent ERR_MODULE_NOT_FOUND).

- [ ] **Implement**

Create `lib/plan-routing-sidecar.mjs`:

```javascript
import { writeFileSync, readFileSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

export function writeRoutingSidecar(planPath, entries) {
  const sidecarPath = sidecarPathFor(planPath);
  const tmpPath = `${sidecarPath}.${randomBytes(6).toString('hex')}.tmp`;
  const body = renderSidecar(entries);
  writeFileSync(tmpPath, body);
  try {
    renameSync(tmpPath, sidecarPath);
  } catch (err) {
    const e = new Error(`SIDECAR_WRITE_FAILED: ${err.message}`);
    e.code = 'SIDECAR_WRITE_FAILED';
    e.tmpPath = tmpPath;
    throw e;
  }
}

export function readRoutingSidecar(planPath) { /* parse + validate */ }
export function lookupRoutingEntry(planPath, taskId) { /* surface ROUTING_ENTRY_MISSING / ROUTING_SIDECAR_MISSING */ }

function sidecarPathFor(planPath) {
  return planPath.replace(/\.plan\.md$/, '.routing.md');
}

function renderSidecar(entries) { /* deterministic markdown render keyed by task_id */ }
```

- [ ] **Verify test passes**

Run: `npm test -- tests/lib/plan-routing-sidecar.test.mjs`
Expected: PASS — all roundtrip / failure-path / missing-entry tests green.

- [ ] **Commit**

Branch (if not already created): `feat/agent-reliable-state-artifacts/plan-routing-sidecar`

```bash
git add lib/plan-routing-sidecar.mjs tests/lib/plan-routing-sidecar.test.mjs
git commit -m "feat(lib): add plan-routing sidecar writer/reader

Spec: .context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md
Plan-task: t1"
```

---

### Task t2: `adev route emit-sidecar` CLI verb [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=4 novelty=5
**Rationale:** Mechanical CLI verb wiring on top of the t1 lib; follows the established `cli/index.mjs` verb-dispatch pattern with explicit error-code surface.

**Charter capability:** `/adev:route` plan-mutation fix *(rev 7)* — CLI verb surface that `/adev:route` SKILL.md will name in Step 4.
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `cli/index.mjs` (add `route` verb dispatch with `emit-sidecar` subverb)
- Test: extend `tests/lib/plan-routing-sidecar.test.mjs` with a verb-invocation test, OR create `tests/cli/route-emit-sidecar.test.mjs`

**Tests:** `tests/cli/route-emit-sidecar.test.mjs` — CLI verb spawns, accepts a JSON stdin payload of entries, writes the sidecar, exits 0 on success and non-zero with `SIDECAR_WRITE_FAILED` on failure.

**Depends on:** Task t1

**Context to load:**
- `cli/index.mjs` (existing verb-dispatch pattern — read full)
- `lib/plan-routing-sidecar.mjs` (from Task t1)

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('adev route emit-sidecar writes <plan-stem>.routing.md', () => {
  const dir = mkdtempSync(join(tmpdir(), 'route-cli-'));
  const planPath = join(dir, 'x.plan.md');
  writeFileSync(planPath, '# Plan\n');
  const entries = JSON.stringify([{ task_id: 't1', selected_agent: 'auto-agent',
    scores: { spec_completeness: 0.9, pattern_coverage: 0.8, blast_radius: 0.2, novelty: 0.3 },
    rationale: 'ok' }]);
  const res = spawnSync('node', ['cli/index.mjs', 'route', 'emit-sidecar', '--plan', planPath],
    { input: entries, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.ok(existsSync(planPath.replace(/\.plan\.md$/, '.routing.md')));
});
```

- [ ] **Verify test fails**

Run: `npm test -- tests/cli/route-emit-sidecar.test.mjs`
Expected: FAIL — `unknown verb: route` from `cli/index.mjs`.

- [ ] **Implement**

Add a `route` verb dispatch in `cli/index.mjs` with an `emit-sidecar` subverb that parses `--plan <path>`, reads entries JSON from stdin, calls `writeRoutingSidecar`, and surfaces typed errors as `code: stderr message` with non-zero exit codes.

- [ ] **Verify test passes**

Run: `npm test -- tests/cli/route-emit-sidecar.test.mjs`
Expected: PASS.

- [ ] **Commit**

```bash
git add cli/index.mjs tests/cli/route-emit-sidecar.test.mjs
git commit -m "feat(cli): add 'adev route emit-sidecar' verb

Spec: .context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md
Plan-task: t2"
```

---

### Task t3: `adev implement read-routing` CLI verb [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=4 novelty=5
**Rationale:** Symmetric CLI reader verb; spec enumerates all four error codes and the dispatch contract — pure pattern application of the t1 reader.

**Charter capability:** `/adev:route` plan-mutation fix *(rev 7)* — reader surface that `/adev:implement` SKILL.md will name.
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `cli/index.mjs` (add `implement` verb dispatch with `read-routing` subverb)
- Test: `tests/cli/implement-read-routing.test.mjs`

**Tests:** `tests/cli/implement-read-routing.test.mjs` — CLI returns the entry for a requested `task_id` on stdout; emits `ROUTING_SIDECAR_MISSING` / `ROUTING_ENTRY_MISSING` / `ROUTING_AGENT_INVALID` on the appropriate failure shapes.

**Depends on:** Task t1

**Context to load:**
- `cli/index.mjs` (existing dispatch pattern)
- `lib/plan-routing-sidecar.mjs` (reader from Task t1)
- Spec Behaviors 4-5 and Error Cases

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('adev implement read-routing returns entry for task_id', () => {
  const dir = mkdtempSync(join(tmpdir(), 'imp-cli-'));
  const planPath = join(dir, 'x.plan.md');
  writeFileSync(planPath, '# Plan\n');
  // arrange: write a sidecar containing t1
  // act:
  const res = spawnSync('node', ['cli/index.mjs', 'implement', 'read-routing',
    '--plan', planPath, '--task-id', 't1'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  const out = JSON.parse(res.stdout);
  assert.equal(out.selected_agent, 'auto-agent');
});

test('adev implement read-routing emits ROUTING_SIDECAR_MISSING when sidecar absent', () => {
  // assert non-zero exit; stderr contains 'ROUTING_SIDECAR_MISSING'
});
```

- [ ] **Verify test fails**

Run: `npm test -- tests/cli/implement-read-routing.test.mjs`
Expected: FAIL — unknown verb.

- [ ] **Implement**

Add the `implement` verb dispatch with a `read-routing` subverb that parses `--plan <path> --task-id <id>`, calls the sidecar reader, prints the matched entry as JSON on stdout, and surfaces the four documented error codes on stderr.

- [ ] **Verify test passes**

Run: `npm test -- tests/cli/implement-read-routing.test.mjs`
Expected: PASS.

- [ ] **Commit**

```bash
git add cli/index.mjs tests/cli/implement-read-routing.test.mjs
git commit -m "feat(cli): add 'adev implement read-routing' verb

Spec: .context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md
Plan-task: t3"
```

---

### Task t4: Plan-immutability detector enhancement + fixtures [specialist: none]

**Routing:** assisted-agent (score: 13/20)
**Scores:** spec=4 pattern=3 blast=3 novelty=3
**Rationale:** Detector must compose a new working-tree branch with the existing per-task M-commit history check across three new git-fixture types; medium complexity warrants a mid-point review after fixtures and tests are written.

**Charter capability:** Plan-immutability detector enhancement *(rev 7)* — extend `lib/plan-immutability.mjs` to catch the mutate-then-single-add-commit pattern.
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/fixtures/plan-immutability/clean-plan/<plan>.plan.md`
- Create: `tests/fixtures/plan-immutability/mutate-then-single-add/<plan>.plan.md` (with inline `**Routing:**` blocks; no sibling sidecar)
- Create: `tests/fixtures/plan-immutability/sidecar-present-plus-inline/` (plan body with inline blocks AND sibling `.routing.md`)
- Modify: `lib/plan-immutability.mjs` (add working-tree inspection branch)
- Modify: `tests/skills/plan-task-immutability.test.mjs` (cover the three new fixtures)
- Test: `tests/skills/plan-task-immutability.test.mjs`

**Tests:** `tests/skills/plan-task-immutability.test.mjs` — clean fixture passes; mutate-then-single-add fixture flags `PLAN_MUTATED_WITHOUT_SIDECAR`; sidecar-present-plus-inline tolerates inline blocks but applies the per-task M-commit check.

**Context to load:**
- `lib/plan-immutability.mjs` (full read — primary edit target)
- `tests/skills/plan-task-immutability.test.mjs` (test structure)
- Spec Behaviors 6-7 and Error Cases (`PLAN_MUTATED_WITHOUT_SIDECAR`)
- `.context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md` (closed-enum peers; detector responsibilities)

- [ ] **Write failing test**

Add three test cases to `tests/skills/plan-task-immutability.test.mjs`:

```javascript
test('clean plan with no inline Routing blocks and no sidecar passes detector', () => {
  // arrange fixture; assert no violations reported
});

test('mutate-then-single-add plan with inline Routing and no sidecar flags PLAN_MUTATED_WITHOUT_SIDECAR', () => {
  // arrange fixture; assert violations array includes the code
});

test('plan with sibling .routing.md tolerates inline Routing blocks (legacy noise)', () => {
  // arrange fixture; assert no PLAN_MUTATED_WITHOUT_SIDECAR; per-task M-commit check still runs
});
```

- [ ] **Verify test fails**

Run: `npm test -- tests/skills/plan-task-immutability.test.mjs`
Expected: FAIL — the second case fails because today's detector relies on `--diff-filter=M` history alone and misses single-add commits.

- [ ] **Implement**

In `lib/plan-immutability.mjs`, add a working-tree branch:

```javascript
function checkPlanForInlineRoutingWithoutSidecar(planPath) {
  const body = readFileSync(planPath, 'utf8');
  const hasInline = /\*\*Routing:\*\*|\*\*Scores:\*\*|\*\*Rationale:\*\*/.test(body);
  if (!hasInline) return null;
  const sidecarPath = planPath.replace(/\.plan\.md$/, '.routing.md');
  if (existsSync(sidecarPath)) return null;  // tolerated as legacy noise
  return { code: 'PLAN_MUTATED_WITHOUT_SIDECAR', planPath };
}
```

Integrate the check into the existing detector entrypoint so it runs *in addition to* the per-task M-commit history check, not in place of it.

- [ ] **Verify test passes**

Run: `npm test -- tests/skills/plan-task-immutability.test.mjs`
Expected: PASS — all three cases green.

- [ ] **Commit**

```bash
git add lib/plan-immutability.mjs tests/skills/plan-task-immutability.test.mjs tests/fixtures/plan-immutability/
git commit -m "feat(lib): detect inline Routing blocks without sidecar regardless of git history

Spec: .context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md
Plan-task: t4"
```

---

### Task t5: `/adev:route` SKILL.md Step 4 rewrite [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=4 pattern=4 blast=5 novelty=4
**Rationale:** Single-file SKILL.md edit guarded by the no-inline-node pre-commit hook; spec dictates the exact step semantics and Red Flag tightening.

**Charter capability:** `/adev:route` plan-mutation fix *(rev 7)* — replace plan-mutation directive with sidecar-emit directive.
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/route/SKILL.md`
- Test: rely on `tests/skills/plan-task-immutability.test.mjs` (from Task t4) and any existing `tests/skills/route.test.mjs`; add coverage if missing

**Tests:** `tests/skills/route.test.mjs` — assert SKILL.md Step 4 references `adev route emit-sidecar` and does NOT contain plan-mutation directives. The repository's `no-inline-node` pre-commit hook also enforces the cli-driver-surface boundary.

**Depends on:** Task t2

**Context to load:**
- `skills/route/SKILL.md` (full read)
- Constitution Anti-Patterns (cli-driver-surface; no inline-Node in SKILL.md)
- Spec Behavior 1

- [ ] **Write failing test**

Add to `tests/skills/route.test.mjs` (create if absent):

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('/adev:route Step 4 references adev route emit-sidecar and does not mutate plan', () => {
  const md = readFileSync('skills/route/SKILL.md', 'utf8');
  assert.match(md, /adev route emit-sidecar/);
  // The skill must not instruct the agent to inject Routing/Scores/Rationale into the plan body.
  // Negative match — careful: prose may legitimately mention these blocks when describing legacy behavior.
  // Instead, assert presence of a Red Flag clause and absence of "append to <plan>.plan.md" directive.
  assert.match(md, /Red Flag/i);
  assert.doesNotMatch(md, /append.*to the plan body/i);
});
```

- [ ] **Verify test fails**

Run: `npm test -- tests/skills/route.test.mjs`
Expected: FAIL — SKILL.md Step 4 still names the legacy plan-mutation flow.

- [ ] **Implement**

Edit `skills/route/SKILL.md`:
- Rewrite Step 4 to name `adev route emit-sidecar --plan <plan-path>` and pass entries via stdin JSON.
- Add an integration note: "`/adev:implement` reads routing via `adev implement read-routing` — it MUST NOT read inline `**Routing:**` blocks from the plan body."
- Tighten the Red Flag section: any inline `**Routing:**` / `**Scores:**` / `**Rationale:**` block in the plan body is a violation; the detector will surface it as `PLAN_MUTATED_WITHOUT_SIDECAR`.

- [ ] **Verify test passes**

Run: `npm test -- tests/skills/route.test.mjs`
Expected: PASS.

- [ ] **Commit**

```bash
git add skills/route/SKILL.md tests/skills/route.test.mjs
git commit -m "feat(skills): rewrite /adev:route Step 4 to emit sidecar instead of mutating plan

Spec: .context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md
Plan-task: t5"
```

---

### Task t6: `/adev:implement` SKILL.md routing-reader update [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=4 pattern=4 blast=5 novelty=4
**Rationale:** Single-file SKILL.md replacement of inline-parsing prose with a CLI-verb call; spec enumerates all four error codes and the no-fallback rule.

**Charter capability:** `/adev:route` plan-mutation fix *(rev 7)* — replace inline parsing with sidecar read.
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/implement/SKILL.md`
- Test: extend or create `tests/skills/implement.test.mjs`

**Tests:** `tests/skills/implement.test.mjs` — assert SKILL.md references `adev implement read-routing`, documents the four routing error codes, and does NOT contain an inline-Routing-parsing directive.

**Depends on:** Task t3

**Context to load:**
- `skills/implement/SKILL.md` (full read)
- Constitution cli-driver-surface boundary
- Spec Behaviors 4-5 and Error Cases (`ROUTING_SIDECAR_MISSING`, `ROUTING_ENTRY_MISSING`, `ROUTING_AGENT_INVALID`)

- [ ] **Write failing test**

```javascript
test('/adev:implement reads routing from sidecar via adev implement read-routing', () => {
  const md = readFileSync('skills/implement/SKILL.md', 'utf8');
  assert.match(md, /adev implement read-routing/);
  assert.match(md, /ROUTING_SIDECAR_MISSING/);
  assert.match(md, /ROUTING_ENTRY_MISSING/);
  assert.match(md, /ROUTING_AGENT_INVALID/);
  assert.doesNotMatch(md, /parse.*\*\*Routing:\*\*.*from the plan body/i);
});
```

- [ ] **Verify test fails**

Run: `npm test -- tests/skills/implement.test.mjs`
Expected: FAIL — SKILL.md still parses inline blocks.

- [ ] **Implement**

Edit `skills/implement/SKILL.md`:
- Replace the inline-routing-parsing step with: "Resolve the routing for each task by invoking `adev implement read-routing --plan <plan-path> --task-id <id>`. Parse the JSON on stdout. Do NOT read `**Routing:**` blocks from the plan body."
- Document the four error codes and the action required for each.
- Note: if `ROUTING_SIDECAR_MISSING` fires, instruct the user to run `/adev:route` against the plan.

- [ ] **Verify test passes**

Run: `npm test -- tests/skills/implement.test.mjs`
Expected: PASS.

- [ ] **Commit**

```bash
git add skills/implement/SKILL.md tests/skills/implement.test.mjs
git commit -m "feat(skills): /adev:implement reads routing from sidecar instead of plan body

Spec: .context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md
Plan-task: t6"
```

---

### Task t7: `plan-task-events.spec.md` CON-8 amendment [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Single-spec text edit with exact strings dictated by ADR-0012 and the test assertions; mechanical and low-blast.

**Charter capability:** CON-8 enumerated peers *(rev 7)* — amend invariant CON-8 to enumerate four permitted sidecar peers; cross-reference ADR-0012.
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `.context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md`
- Test: assert the spec body lists all four peer names and cites ADR-0012

**Tests:** `tests/specs/plan-task-events-con8.test.mjs` (new) — read the spec file; assert CON-8 contains the literal strings `.review.md`, `.validate.md`, `.routing.md`, `.blockers.md`, and references `ADR-0012`.

**Context to load:**
- `.context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md` (full read — locate CON-8)
- `.context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md` (closed-enum source)
- Spec Behavior 8

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('plan-task-events.spec.md CON-8 enumerates the four permitted sidecar peers', () => {
  const md = readFileSync(
    '.context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md',
    'utf8',
  );
  // Locate CON-8 block (defensive: case-insensitive)
  const con8 = md.match(/CON-8[\s\S]{0,2000}/i)?.[0] ?? '';
  for (const peer of ['.review.md', '.validate.md', '.routing.md', '.blockers.md']) {
    assert.match(con8, new RegExp(peer.replace(/\./g, '\\.')), `CON-8 missing peer ${peer}`);
  }
  assert.match(con8, /ADR-0012/);
});
```

- [ ] **Verify test fails**

Run: `npm test -- tests/specs/plan-task-events-con8.test.mjs`
Expected: FAIL — current CON-8 prose does not enumerate the four peers explicitly.

- [ ] **Implement**

Edit `.context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md`:
- Bump `revision` in frontmatter.
- Amend CON-8 to enumerate the four permitted sidecar peers (`.review.md`, `.validate.md`, `.routing.md`, `.blockers.md`).
- Cross-reference ADR-0012 (`Adding a fifth peer requires an ADR amendment per ADR-0012.`).

- [ ] **Verify test passes**

Run: `npm test -- tests/specs/plan-task-events-con8.test.mjs`
Expected: PASS.

- [ ] **Commit**

```bash
git add .context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md \
        tests/specs/plan-task-events-con8.test.mjs
git commit -m "docs(specs): amend CON-8 to enumerate four permitted sidecar peers

Spec: .context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md
Plan-task: t7"
```

---

### Task t8: ADR-0012 transition Proposed → Accepted [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Mechanical ADR frontmatter flip plus footnote citing the spec; the three gates are satisfied by prior tasks, leaving no creative work.

**Charter capability:** Plan-adjacent sidecar pattern *(rev 7)* — flip ADR-0012 once the three acceptance gates are satisfied by Tasks t1-t7.
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `.context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md`
- Test: assert ADR frontmatter `status: Accepted` and a footnote citing this spec

**Tests:** `tests/adrs/0012-status.test.mjs` (new) — parse ADR frontmatter; assert `status === 'Accepted'` and the body contains the spec path.

**Depends on:** Task t1, Task t4, Task t7 (the three ADR acceptance gates land in those tasks)

**Context to load:**
- `.context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md` (full read — locate status frontmatter and Consequences section)
- Spec's "System Constitution Reference — ADR-0012 acceptance gate" bullet

- [ ] **Write failing test**

```javascript
test('ADR-0012 is Accepted and cites the plan-routing-sidecar spec', () => {
  const md = readFileSync('.context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md', 'utf8');
  assert.match(md, /^status:\s*Accepted\s*$/m);
  assert.match(md, /plan-routing-sidecar\.spec\.md/);
});
```

- [ ] **Verify test fails**

Run: `npm test -- tests/adrs/0012-status.test.mjs`
Expected: FAIL — status is still `Proposed`.

- [ ] **Implement**

Edit `.context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md`:
- Flip frontmatter `status` from `Proposed` to `Accepted`.
- Add a footnote (or "Acceptance Outcome" section) citing `.context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md` and listing the three satisfied criteria:
  1. `/adev:route` no longer mutates plans (Task t5).
  2. CON-8 enumerates the four peers (Task t7).
  3. Detector catches the mutate-then-single-add-commit pattern (Task t4).

- [ ] **Verify test passes**

Run: `npm test -- tests/adrs/0012-status.test.mjs`
Expected: PASS.

- [ ] **Commit**

```bash
git add .context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md tests/adrs/0012-status.test.mjs
git commit -m "docs(adrs): flip ADR-0012 to Accepted following plan-routing-sidecar landing

Spec: .context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md
Plan-task: t8"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied:
  - `/adev:route` Step 4 writes `<plan-stem>.routing.md` and leaves the plan file byte-identical (verified by hash comparison in Task t1 + Task t5).
  - `<plan-stem>.routing.md` contains one entry per task with `task_id`, `selected_agent`, `scores` (4 dimensions), `rationale` (Task t1 schema).
  - `/adev:implement` dispatches the subagent named in the sidecar; missing sidecar / missing entry / invalid agent all fail with the documented error codes (Task t3 + Task t6).
  - `plan-task-events.spec.md` CON-8 enumerates the four permitted sidecar peers; ADR-0012 cross-reference is present (Task t7).
  - `lib/plan-immutability.mjs` flags `PLAN_MUTATED_WITHOUT_SIDECAR` for plans with inline `**Routing:**` blocks and no sibling `.routing.md`, independent of `--diff-filter=M` history (Task t4).
  - `tests/skills/plan-task-immutability.test.mjs` (and the three new fixtures) pass against clean plans, mutate-then-single-add fixtures, and sidecar-present fixtures (Task t4).
  - ADR-0012 status flips from Proposed to Accepted once the three gates land (Task t8).
- No constitutional violations introduced (the `.githooks/pre-commit-no-inline-node` chain enforces the cli-driver-surface boundary on every commit touching `skills/**/SKILL.md`).
