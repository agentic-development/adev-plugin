# Implementation Plan: /adev:issues Lib-Directive Extraction

> **Methodology:** adev
> **Charter:** .context-index/specs/features/cli-driver-surface/charter.md
> **Spec:** .context-index/specs/features/cli-driver-surface/issues-skill-lib-directive-extraction.spec.md
> **Review:** PASS_WITH_NOTES (2026-08-19) — spec revision 2 already absorbed SA-1, SA-2 and CON-1
> **Platform:** Node.js (pure ESM, `.mjs`), zero runtime dependencies, `node:test` runner

**Goal:** Give every executable step of `skills/issues/SKILL.md` a real `adev issues <sub>` verb, so no agent is ever left improvising a raw `br` call that dies with `SYNC_CONFLICT` inside a linked worktree.

**Architecture:** Four new `lib/cli/issues-*.mjs` modules (`board`, `list`, `mutate`, `milestone`) plus two additive flags on the existing `issues-create.mjs`, all routed through the extended `lib/cli/issues.mjs` dispatcher. Every verb obtains its adapter from `getIssueManager(manifest, projectRoot)` (`lib/issues/registry.mjs`), which resolves the storage root from the git common dir — so worktree correctness is inherited, never re-implemented (INV-2, BEH-1). The skill's prose keeps describing *what* each step does; the verb becomes *how* it is done (Constitution Principle 2). `lib/milestones.mjs` and `lib/issues/*` adapters are NOT modified by this plan — the verbs are thin argv-to-adapter shims that translate thrown error codes into the 0/1/2 exit-code policy from the charter (INV-5).

**Review notes carried into the plan:**
- SA-1 → Task 5 makes the always-present `confirmFn` an explicit, test-pinned requirement. `lib/milestones.mjs:921` guards its confirm loop with `confirms.length > 0 && options.confirmFn`, so an omitted callback silently *ships*. The verb passes `() => false` without `--yes` and `() => true` with it.
- SA-2 → Task 5 covers the failed-ship-criteria, gate-timeout and confirm-rejected error rows added to the spec's Error Cases table.
- CON-1 → Task 9 regenerates the provider mirrors. The charter's "Provider mirror sync is Out of Scope" text is stale relative to `tests/sync/provider-skill-parity.test.mjs`, which fails on drift; the divergence is recorded in the spec header, and the charter row is a `/adev:brainstorm` follow-up, not a blocker here.

---

## File Structure

**Create:**
- `lib/cli/issues-board.mjs` — `adev issues board`; composes `listEpics` + `list` and prints `renderTasksMd()` output to stdout
- `lib/cli/issues-list.mjs` — `adev issues list` and `adev issues ready`; shared filter parsing, the ready/unblocked filter algorithm
- `lib/cli/issues-mutate.mjs` — `adev issues update|close|dep`; the three board writes and their guard refusals
- `lib/cli/issues-milestone.mjs` — `adev issues milestone create|list|ship|defer`
- `tests/cli/issues-board.test.mjs` — BEH-2
- `tests/cli/issues-list.test.mjs` — BEH-3
- `tests/cli/issues-mutate.test.mjs` — BEH-4, BEH-5, BEH-6
- `tests/cli/issues-milestone.test.mjs` — BEH-7 + the three new Error Cases rows
- `tests/cli/issues-worktree-storage.test.mjs` — BEH-1
- `tests/skills/issues-skill-verb-coverage.test.mjs` — BEH-9

**Modify:**
- `lib/cli/issues.mjs` — dispatch table + `help()`; four new sub-verb branches (`board`, `list`, `ready`, `update`, `close`, `dep`, `milestone`), each honouring the existing `dispatchesSubcommandHelp` opt-out
- `lib/cli/issues-create.mjs` — add `--epic <id>` and `--milestone <name>` to `OPTIONS`, `buildPayload()`, `USAGE` and `help()`
- `skills/issues/SKILL.md` — every directive site (lines 33, 49-63, 77, 85, 92-93, 99, 105, 111, 115, 134, 138, 164, 199, 236) rewritten to name a verb; the fenced JS block at 49-63 deleted; `## API reference` retained as descriptive documentation only
- `tests/cli/issues-help-routing.test.mjs` — extend the `cases` table with every new sub-verb (BEH-8)
- `tests/issues/cli-create.test.mjs` — `--epic` / `--milestone` coverage
- `docs/cli-reference.md` — document each new sub-verb under the `issues` entry (§519-588)
- `providers/*/skills/issues/SKILL.md` — regenerated, never hand-edited

**Reference (read, do not modify):**
- `lib/issues/registry.mjs` — `getIssueManager(manifest, projectRoot)`; the only sanctioned storage entry point (INV-2)
- `lib/issues/interface.mjs` — `validateIssue`, `checkCloseGuard` (throws `BLOCKED_BY_DEPENDENCIES` with `err.blockers`), `detectCycle`, `VALID_STATUSES`
- `lib/issues/render-markdown.mjs` — `renderTasksMd(board)` pure renderer; `writeTasksMd(projectRoot)` stays behind `adev status --render` (INV-6)
- `lib/milestones.mjs` — `milestoneCreate` / `milestoneList` / `milestoneShip` / `milestoneDefer`; **not modified by this plan**
- `lib/cli/issues-create.mjs` — the reference shape for a sub-verb (parseArgs, exit-code policy, `help()`)
- `lib/cli/issues-stale.mjs`, `lib/cli/issues-claim.mjs` — same
- `tests/cli/issues-help-routing.test.mjs` — the `spawnSync(CLI, ...)` test idiom used by every new suite

## Context Packets

### Task 1 Context (`issues board`)
- Spec: `issues-skill-lib-directive-extraction.spec.md` (P4, BEH-2, INV-6, Migration Step 1)
- Charter: `cli-driver-surface/charter.md` (capability: Inline-Node extraction sweep — residual gap)
- Source (full): `lib/cli/issues-create.mjs`, `lib/cli/issues.mjs`
- Source (signatures): `lib/issues/render-markdown.mjs` (`renderTasksMd`, `writeTasksMd`), `lib/issues/registry.mjs`
- Skill: `skills/issues/SKILL.md` §Board Display (lines 45-73)
- Test idiom: `tests/cli/issues-help-routing.test.mjs`

### Task 2 Context (`issues list` / `ready`)
- Spec: BEH-3, P1 (line 115 prose algorithm), Migration Step 1
- Source (signatures): `lib/issues/json-adapter.mjs::list` (filters), `lib/issues/interface.mjs::checkCloseGuard`
- Skill: `skills/issues/SKILL.md` §List (103-107), §Ready (113-115)
- Sibling: `lib/cli/issues-stale.mjs` (read-only report + `--json` shape)

### Task 3 Context (`issues update|close|dep`)
- Spec: BEH-4, BEH-5, BEH-6, INV-5, Error Cases table, Migration Step 2
- Source (full): `lib/issues/interface.mjs` §`checkCloseGuard`, §`detectCycle`, §`validateStatusTransition`
- Source (signatures): `lib/issues/json-adapter.mjs::update|updateEpic|close|addDependency|get`
- Skill: `skills/issues/SKILL.md` §Update (89-95), §Close (97-101), §Add Dependency (109-111)

### Task 4 Context (`issues create --epic --milestone`)
- Spec: Changes Catalog ADDED (last row), Migration Step 3
- Source (full): `lib/cli/issues-create.mjs`
- Source (signatures): `lib/issues/interface.mjs::validateIssue`, `validateEpic`
- Test: `tests/issues/cli-create.test.mjs`, `tests/issues/unified-create.test.mjs`
- Skill: `skills/issues/SKILL.md` §Create Issue (75-81), §Create Epic (83-87)

### Task 5 Context (`issues milestone …`)
- Spec: BEH-7 (**mechanism paragraph is load-bearing**), Error Cases rows for failed criteria / gate timeout / confirm rejected, Migration Step 4
- Source (full): `lib/milestones.mjs` §`milestoneShip` (888-1000), §`evaluateShipCriteria` (800-858), §`resolveStrategy`
- Source (signatures): `lib/milestones.mjs::milestoneCreate|milestoneList|milestoneDefer`
- Test: `tests/milestones.test.mjs`, `tests/milestones-integration.test.mjs` (injection points: `confirmFn`, `runGate`, `execGit`, `gateTimeoutMs`)
- Skill: `skills/issues/SKILL.md` §Milestone Create/List/Ship/Defer (117-247)

### Task 6 Context (sub-verb `--help`)
- Spec: BEH-8
- Source (full): `tests/cli/issues-help-routing.test.mjs`, `lib/cli/issues.mjs`
- Note: `cli/index.mjs`'s blanket `--help` short-circuit is opted out via `export const dispatchesSubcommandHelp = true`

### Task 7 Context (worktree correctness)
- Spec: BEH-1, P2, P3, INV-2
- Source (full): `lib/issues/resolve-root.mjs`, `lib/issues/registry.mjs`
- Test helpers: `tests/helpers.mjs` (`createTempDir`, `cleanupTempDir`)

### Task 8 Context (SKILL.md sweep + BEH-9 enforcement)
- Spec: BEH-9, INV-3, INV-7, P2 (the `br` prohibition)
- Source (full): `skills/issues/SKILL.md`, `hooks/pre-commit-no-inline-node.sh`
- Reference: `tests/skills-extension-coverage.test.mjs`, `tests/skills-no-inline-node.test.mjs`
- Precedent prose: `skills/plan/SKILL.md`, `skills/implement/SKILL.md`, `skills/reconcile/SKILL.md` (the `br` prohibition wording)

### Task 9 Context (docs + provider mirrors + gate sweep)
- Spec: Acceptance criteria rows 7-10, Migration Step 5, CON-1 divergence note
- Source (full): `docs/cli-reference.md` §`issues` (519-588)
- Tooling: `scripts/sync-provider-skills.mjs`, `tests/sync/provider-skill-parity.test.mjs`
- Constitution: `CLAUDE.md` §Quality Gates (`npm test`)

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: Summarized skill output produces equivalent artifact quality (confidence: medium)
- **Pattern:** When a skill writes an artifact to disk (plan, review, validation report), instruct it to return only a structured summary to the conversation. The artifact on disk will be equally complete — the summarization instruction affects echo volume, not reasoning.
- **Anti-pattern:** Assume that shorter output means lower quality artifacts.
- **Relevance here:** the new `issues board` / `list` / `ready` verbs are the chat-display path. Keep their stdout the canonical rendered board, and let the skill display it verbatim rather than re-summarizing rows.

### Heuristic: Cache reads are 71% of session cost — minimize context accumulation (confidence: medium)
- **Pattern:** Reduce what accumulates in conversation context (output echoes, artifact dumps, verbose subagent returns).
- **Relevance here:** `adev issues board --json` exists for machine consumers; the human path should not double-print both forms.

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 → Task 5 — all touch `lib/cli/issues.mjs` (dispatch table) and `skills/issues/SKILL.md`, so they serialize on those two files. This ordering also matches the spec's per-step-atomic Migration Path.
- Group B (after Group A): Task 6 → Task 8 — both depend on the full sub-verb set existing.
- Group C (independent of A's ordering, needs only Task 1): Task 7 — new test file, touches no shared source.
- Group D (last, sequential): Task 9 — regenerates mirrors from the final `skills/issues/SKILL.md`, so it must run after Task 8.

Group C can run in parallel with the tail of Group A. Groups B and D are strictly ordered after A.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | `adev issues board` + Board Display rewrite | medium | unit | — | 2 create, 2 modify |
| 2 | `adev issues list` / `ready` + List & Ready rewrite | medium | unit | Task 1 | 2 create, 2 modify |
| 3 | `adev issues update` / `close` / `dep` + rewrite | large | unit | Task 2 | 2 create, 2 modify |
| 4 | `adev issues create --epic --milestone` + rewrite | small | unit | Task 3 | 0 create, 3 modify |
| 5 | `adev issues milestone create\|list\|ship\|defer` + rewrite | large | unit | Task 4 | 2 create, 2 modify |
| 6 | Sub-verb `--help` routing coverage (BEH-8) | small | unit | Task 5 | 0 create, 6 modify (5 help-text only) |
| 7 | Worktree-correctness test (BEH-1) | medium | integration | Task 1 | 1 create, 0 modify |
| 8 | SKILL.md sweep, `br` prohibition, BEH-9 enforcement test | medium | unit | Task 5, Task 6 | 1 create, 1 modify |
| 9 | `docs/cli-reference.md`, provider mirrors, gate sweep | small | unit | Task 8 | 0 create, 2 modify |

## Strategy Summary

| Strategy | Tasks | Source |
|----------|-------|--------|
| unit | 8 | fallback |
| integration | 1 | detected (medium confidence) |

⚠ Low confidence assignments:
- Task 7: strategy=integration (detected, medium confidence) — it shells out to `git worktree add` in a temp repo. If the suite must stay inside the default `npm test` tier, keep the git calls hermetic (temp dir, `git init`, no network) and it can run as `unit`; verify before proceeding.

## Test Infrastructure Requirements

> These requirements must be satisfied before integration/infrastructure tests can run.
> Tasks without these prerequisites will produce setup errors, not test failures.
> **Never record actual credential values in plan output or spec files — env var names only.**

### External Systems

| System | Required By | Strategy |
|--------|-------------|----------|
| `git` binary (local, no network) | Task 7 | integration |
| `br` binary (beads backend) | Task 5 (ship/defer round-trip only if run against the beads adapter) | unit |

### Credentials / Environment Variables

None. Every new verb is local-filesystem only.

### Pre-Provisioned State

- [ ] `git` on `PATH` with `git worktree` support (present in CI and dev images already)
- [ ] Task 5 and Task 7 must construct their own temp project via `tests/helpers.mjs::createTempDir`; neither may touch the repo's real `.beads/` or `.context-index/milestones.json`

### CI Configuration

These tests run inside the default suite:
```bash
npm test
```

> Task 7 must degrade gracefully if `git worktree` is unavailable — but per the project's standing rule it must FAIL, not silently skip, when the prerequisite is missing in CI.

### Unresolved Requirements

| Task | Issue | Action Required |
|------|-------|-----------------|
| — | — | — |

None outstanding. The spec declares no `infra_requirements:` field and auto-detection resolved every task.

---

## Tasks

> Per the spec's Migration Path, Tasks 1-5 are **per-step atomic**: the helper, its tests and the matching `skills/issues/SKILL.md` section rewrite land in ONE commit. No commit may leave a SKILL.md section carrying both a lib directive and a verb invocation (INV-3, enforced by `hooks/pre-commit-no-inline-node.sh`).

### Task 1: `adev issues board` + Board Display rewrite [specialist: none]

**Charter capability:** Inline-Node extraction sweep (residual gap) — the last embedded JS fence in `skills/issues/SKILL.md`
**Strategy:** unit (source: fallback, confidence: high)
**Behaviors:** BEH-2 (and the read half of BEH-1)
**Files:**
- Create: `lib/cli/issues-board.mjs`
- Create: `tests/cli/issues-board.test.mjs`
- Modify: `lib/cli/issues.mjs` (dispatch table + `help()`)
- Modify: `skills/issues/SKILL.md:45-73` (§Board Display — delete the fenced JS at 49-63)

**Tests:** create `tests/cli/issues-board.test.mjs` — first suite covering BEH-2 (per-behavior granularity; no existing suite covers it)

**Context to load:** see Task 1 Context packet above.

- [ ] **Write failing test**

```javascript
// tests/cli/issues-board.test.mjs
describe("adev issues board", () => {
  it("prints markdown byte-identical to renderTasksMd over the same board", async () => {
    // temp project + json backend, seed one epic + two issues
    const r = spawnSync(process.execPath, [CLI, "issues", "board"], { cwd: tmp, encoding: "utf8" });
    const expected = renderTasksMd({ version: 1, epics, issues });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, expected.endsWith("\n") ? expected : expected + "\n");
  });

  it("writes nothing to disk (INV-6)", () => {
    // snapshot mtimes/existence of .context-index/tasks/ before and after
    assert.equal(existsSync(join(tmp, ".context-index/tasks/tasks.md")), false);
  });

  it("--json emits { version, epics, issues } unrendered", () => { /* ... */ });
  it("--milestone filters epics to that milestone", () => { /* ... */ });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/issues-board.test.mjs`
Expected: FAIL — `unknown issues subcommand: board`

- [ ] **Implement**

`lib/cli/issues-board.mjs`: `parseArgs` over `{ milestone: {type:"string"}, json: {type:"boolean"} }`; obtain the adapter via `getIssueManager(manifest, projectRoot)`; `const epics = await manager.listEpics(filters)`, `const issues = await manager.list()`; with `--json`, `console.log(JSON.stringify({ version: 1, epics, issues }, null, 2))`; otherwise `console.log(renderTasksMd({ version: 1, epics, issues }))`. Never call `writeTasksMd` (INV-6). Adapter throws → `console.error(err.code ? \`${err.code}: ${err.message}\` : err.message); return 1` (the `issues-create.mjs` idiom). Export `run` and `help`.

Register in `lib/cli/issues.mjs` following the existing `stale` branch shape (import, `--help`/`-h` → `mod.help(); return 0`, else `mod.run({ projectRoot, argv: argv.slice(1), manifest })`), and add the `board` line to `help()`.

- [ ] **Verify test passes**

Run: `node --test tests/cli/issues-board.test.mjs`
Expected: PASS

- [ ] **Rewrite the SKILL.md section (same commit)**

Replace `skills/issues/SKILL.md` §Board Display so the two fenced `javascript` blocks (lines 49-63) are gone and the step reads:

```bash
adev issues board [--milestone <name>]
```

Keep the surrounding prose (default ordering, Unassigned grouping, milestone grouping, persona adaptation) — Constitution Principle 2 requires the step to remain understandable from prose alone. Do NOT leave any `getIssueManager` / `renderTasksMd` mention in this section; those names survive only in `## API reference`.

- [ ] **Commit**

Branch (if not already created): `refactor/issues/cli-verb-extraction`

```bash
git add lib/cli/issues-board.mjs lib/cli/issues.mjs tests/cli/issues-board.test.mjs skills/issues/SKILL.md
git commit -m "refactor(issues): add adev issues board and drop the SKILL.md render fence"
```

Trailers required on every commit in this plan:
```
Spec: .context-index/specs/features/cli-driver-surface/issues-skill-lib-directive-extraction.spec.md
Plan-task: 1
```

---

### Task 2: `adev issues list` / `ready` + List & Ready rewrite [specialist: none]

**Charter capability:** Inline-Node extraction sweep (residual gap)
**Strategy:** unit (source: fallback, confidence: high)
**Behaviors:** BEH-3
**Depends on:** Task 1
**Files:**
- Create: `lib/cli/issues-list.mjs`
- Create: `tests/cli/issues-list.test.mjs`
- Modify: `lib/cli/issues.mjs`
- Modify: `skills/issues/SKILL.md:103-115` (§List, §Ready)

**Tests:** create `tests/cli/issues-list.test.mjs` — first suite covering BEH-3

- [ ] **Write failing test**

```javascript
describe("adev issues ready", () => {
  it("excludes an open issue whose dependency is still open", () => { /* exit 0, id absent */ });
  it("includes it once the blocker is closed", () => { /* id present */ });
  it("never lists a non-open issue", () => { /* in_progress / closed / deferred absent */ });
});

describe("adev issues list", () => {
  it("filters by --status, --epic and --milestone", () => { /* ... */ });
  it("sorts by priority ascending (0 first)", () => { /* ... */ });
  it("prints \"No epics found for milestone '<name>'\" when nothing matches", () => { /* ... */ });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/issues-list.test.mjs`
Expected: FAIL — `unknown issues subcommand: list`

- [ ] **Implement**

One module, two entry points: `run(sub, { projectRoot, argv, manifest })` dispatching on `"list"` / `"ready"` (mirrors the `claim` / `release` pairing already in `lib/cli/issues.mjs`). The **ready filter lives here, not in prose**: fetch `await manager.list({ status: "open" })`, build an id→status map from a full `await manager.list()`, and keep only issues whose every `dependencies[]` entry resolves to a closed issue. A dependency id that resolves to nothing is treated as non-blocking, and the verb notes it on stderr rather than failing. `--json` prints the array; the human form prints a priority-sorted table under `Actionable issues — open and unblocked.`

- [ ] **Verify test passes**

Run: `node --test tests/cli/issues-list.test.mjs`
Expected: PASS

- [ ] **Rewrite the SKILL.md sections (same commit)**

§List becomes `adev issues list [--status <s>] [--epic <id>] [--milestone <name>]`; §Ready becomes `adev issues ready`. **The prose algorithm at line 115 is deleted, not paraphrased** — its whole defect was that it asked the agent to re-derive the filter per invocation.

- [ ] **Commit**

```bash
git add lib/cli/issues-list.mjs lib/cli/issues.mjs tests/cli/issues-list.test.mjs skills/issues/SKILL.md
git commit -m "refactor(issues): add adev issues list/ready and move the ready filter into the verb"
```

---

### Task 3: `adev issues update` / `close` / `dep` + rewrite [specialist: none]

**Charter capability:** Inline-Node extraction sweep (residual gap)
**Strategy:** unit (source: fallback, confidence: high)
**Behaviors:** BEH-4, BEH-5, BEH-6
**Depends on:** Task 2
**Files:**
- Create: `lib/cli/issues-mutate.mjs`
- Create: `tests/cli/issues-mutate.test.mjs`
- Modify: `lib/cli/issues.mjs`
- Modify: `skills/issues/SKILL.md:89-111` (§Update, §Close, §Add Dependency)

**Tests:** create `tests/cli/issues-mutate.test.mjs` for BEH-4; extend the same suite for BEH-5 and BEH-6 (per-behavior granularity — the three behaviors are exercised through one verb module, so they share one suite; the first behavior creates it, the other two extend it)

- [ ] **Write failing test**

```javascript
describe("adev issues close", () => {
  it("refuses with exit 2 and names every blocker (BEH-4)", () => {
    const r = run(["issues", "close", "issue-a", "--reason", "done"]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /issue-b/);
    // and the board is unchanged
  });
  it("exits 1, not 2, on an unknown id", () => { /* `<id> not found` */ });
  it("requires --reason", () => { /* exit 1 + usage */ });
});

describe("adev issues dep", () => {
  it("refuses a cycle with exit 2 and reports it (BEH-5)", () => { /* ... */ });
  it("adds a legal dependency with exit 0", () => { /* ... */ });
});

describe("adev issues update", () => {
  it("updates an epic given an epic id and an issue given an issue id (BEH-6)", () => {
    // caller passes only the id; no --epic flag, no prefix branch at the call site
  });
  it("accepts --status and --milestone together in one call", () => { /* ... */ });
  it("directs the user to `close` when --status closed is attempted", () => { /* exit 1 */ });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/issues-mutate.test.mjs`
Expected: FAIL — `unknown issues subcommand: update`

- [ ] **Implement**

`lib/cli/issues-mutate.mjs` exports `run(sub, ctx)` for `update` / `close` / `dep` plus a shared `help()` per sub-verb.

- **`update <id>`** — resolve the item *by lookup, not by prefix*: try `await manager.get(id)`; if it is absent from the issue store, look through `await manager.listEpics()`. Dispatch to `update()` or `updateEpic()` accordingly, so BEH-6 holds even for backends that do not use an `epic-` prefix. Reject `--status closed` with the close-guard redirect (exit 1).
- **`close <id> --reason`** — call `manager.close(id, reason)`. `checkCloseGuard` throws `BLOCKED_BY_DEPENDENCIES` carrying `err.blockers`; catch **that code specifically**, print each blocker, and `return 2`. Every other thrown code prints `<CODE>: <message>` and returns 1 (INV-5).
- **`dep <id> <depends-on-id>`** — call `manager.addDependency(...)`. `detectCycle`'s thrown error is the exit-2 path; report the cycle it names.

Exit-code discipline is the load-bearing part: `2` = refused by a guard, `1` = usage error or adapter failure, `0` = success.

- [ ] **Verify test passes**

Run: `node --test tests/cli/issues-mutate.test.mjs`
Expected: PASS

- [ ] **Rewrite the SKILL.md sections (same commit)**

§Update, §Close and §Add Dependency each name their verb. **Delete the "determine if `<id>` is an issue or epic by prefix" instruction at lines 91-93** — that branch is now the verb's job (BEH-6), and leaving it in prose would re-create the directive this spec exists to remove. Keep the user-facing message shapes ("Cannot close `<id>`: blocked by …") as documentation of what the verb prints.

- [ ] **Commit**

```bash
git add lib/cli/issues-mutate.mjs lib/cli/issues.mjs tests/cli/issues-mutate.test.mjs skills/issues/SKILL.md
git commit -m "refactor(issues): add adev issues update/close/dep with guard-refusal exit codes"
```

---

### Task 4: `adev issues create --epic --milestone` + Create rewrite [specialist: none]

**Charter capability:** Inline-Node extraction sweep (residual gap)
**Strategy:** unit (source: fallback, confidence: high)
**Behaviors:** supports BEH-9 (Create Issue / Create Epic steps); no new behavior of its own
**Depends on:** Task 3
**Files:**
- Modify: `lib/cli/issues-create.mjs` (`OPTIONS`, `buildPayload`, `USAGE`, `help`)
- Modify: `tests/issues/cli-create.test.mjs`
- Modify: `skills/issues/SKILL.md:75-87` (§Create Issue, §Create Epic)

**Tests:** extend `tests/issues/cli-create.test.mjs` — the existing suite already covers `adev issues create`; per-behavior granularity resolves to *extend*, not create

- [ ] **Write failing test**

```javascript
it("--epic sets epicId on the created issue", () => { /* ... */ });
it("--milestone on --type epic carries the milestone through", () => { /* ... */ });
it("existing create behaviour is unchanged", () => { /* the pre-existing assertions, untouched (INV-1) */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/issues/cli-create.test.mjs`
Expected: FAIL — `Unknown option '--epic'`

- [ ] **Implement**

Add `epic: { type: "string" }` and `milestone: { type: "string" }` to `OPTIONS`; in `buildPayload`, set `payload.epicId` and `payload.milestone` only when the flag is present. **Do not add defaults** — `validateIssue` / `validateEpic` own them, and duplicating them creates a second place to drift (the reasoning already recorded in `buildPayload`'s docstring). Update `USAGE` and `help()`.

- [ ] **Verify test passes**

Run: `node --test tests/issues/cli-create.test.mjs`
Expected: PASS

- [ ] **Rewrite the SKILL.md sections (same commit)**

§Create Issue → `adev issues create "<title>" [--type <t>] [--priority <0-4>] [--epic <id>]`; §Create Epic → `adev issues create "<title>" --type epic [--milestone <name>]`. Drop the `create()` / `createEpic({...})` directives and the "validate the epic exists by checking if the ID starts with `epic-`" instruction.

- [ ] **Commit**

```bash
git add lib/cli/issues-create.mjs tests/issues/cli-create.test.mjs skills/issues/SKILL.md
git commit -m "feat(issues): add --epic and --milestone to adev issues create"
```

---

### Task 5: `adev issues milestone create|list|ship|defer` + rewrite [specialist: none]

**Charter capability:** Inline-Node extraction sweep (residual gap)
**Strategy:** unit (source: fallback, confidence: high)
**Behaviors:** BEH-7 + the three Error Cases rows added in spec revision 2
**Depends on:** Task 4
**Files:**
- Create: `lib/cli/issues-milestone.mjs`
- Create: `tests/cli/issues-milestone.test.mjs`
- Modify: `lib/cli/issues.mjs`
- Modify: `skills/issues/SKILL.md:117-247` (§Milestone Create, §Milestone List, §Milestone Ship, §Milestone Defer)

**Tests:** create `tests/cli/issues-milestone.test.mjs` — first suite covering BEH-7

> **`lib/milestones.mjs` is NOT modified by this task.** The verb is a shim over the existing exports.

- [ ] **Write failing test**

```javascript
describe("adev issues milestone ship", () => {
  // BEH-7 — the mechanism, not just the outcome
  it("without --yes prints the pending confirmations, exits 2, and mutates nothing", () => {
    const before = readFileSync(milestonesJson, "utf8");
    const r = run(["issues", "milestone", "ship", "v1"]);
    assert.equal(r.status, 2);
    assert.match(r.stdout + r.stderr, /CHANGELOG updated/);
    assert.equal(readFileSync(milestonesJson, "utf8"), before);
  });

  // The regression this guards: lib/milestones.mjs:921 guards its confirm loop
  // with `confirms.length > 0 && options.confirmFn`, so OMITTING confirmFn
  // silently SHIPS. Assert the callback is always supplied.
  it("always passes a confirmFn to milestoneShip — rejecting one without --yes", async () => {
    // import lib/cli/issues-milestone.mjs, stub milestoneShip, assert
    // typeof options.confirmFn === "function" in BOTH branches, and that it
    // resolves false without --yes and true with it.
  });

  it("with --yes proceeds and marks the milestone shipped", () => { /* exit 0 */ });
  it("names each failed auto-check and mutates nothing (failed ship criteria)", () => { /* exit 2, shipped:false */ });
  it("reports the timed-out gate and its budget, mutating nothing (gate timeout)", () => { /* exit 2 */ });
  it("names the rejected confirm (confirmRejected) and mutates nothing", () => { /* exit 2 */ });
});

describe("adev issues milestone create|list|defer", () => {
  it("round-trips through .context-index/milestones.json", () => { /* create → list → defer */ });
  it("create is idempotent for an existing name (no second epic)", () => { /* ... */ });
  it("defer requires --reason and refuses a shipped milestone (ALREADY_SHIPPED)", () => { /* exit 1 */ });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/issues-milestone.test.mjs`
Expected: FAIL — `unknown issues subcommand: milestone`

- [ ] **Implement**

`lib/cli/issues-milestone.mjs` exports `run({ projectRoot, argv, manifest })` with its own second-level dispatch over `create` / `list` / `ship` / `defer`, each with a `help()`.

**`ship` is the load-bearing one (BEH-7, review finding SA-1).** The verb ALWAYS supplies `confirmFn`:

```javascript
// descriptive reference — this is what the verb does internally
const confirmFn = async () => Boolean(values.yes);
const result = await milestoneShip(projectRoot, name, {
  issueManager, manifest, confirmFn,
});
```

Passing `confirmFn` in **both** branches is mandatory. Omitting it when `--yes` is absent does not refuse the ship — `lib/milestones.mjs:921` guards the loop with `confirms.length > 0 && options.confirmFn`, so a missing callback skips every manual confirmation and ships. The refusal must be an explicit `false` return.

Result translation:
- `{ shipped: false, results }` with any `passed === false` → print each failed check, `return 2`
- `{ shipped: false, confirmRejected }` → print the rejected confirm text, `return 2`
- a gate-timeout result surfaced by `evaluateShipCriteria` → print the gate id and its budget, `return 2`
- `{ shipped: true }` → print the strategy and the closed epic, `return 0`
- thrown `MILESTONE_NOT_FOUND` / `INVALID_NAME` / `BROKEN_EPIC` / `UNKNOWN_STRATEGY` → `<CODE>: <message>`, `return 1`

`create` maps `--target` / `--strategy` / repeatable `--check` / repeatable `--confirm` (declare both as `{ type: "string", multiple: true }`) onto `milestoneCreate`. `list` renders the Name / Status / Target / Epic / Progress table, or the "No milestones defined." line. `defer` requires `--reason` and refuses a shipped milestone. All four receive `issueManager` from `getIssueManager(manifest, projectRoot)`.

- [ ] **Verify test passes**

Run: `node --test tests/cli/issues-milestone.test.mjs`
Expected: PASS

- [ ] **Rewrite the SKILL.md sections (same commit)**

All four milestone sections name their verb. **Delete every `**Implementation:** Call milestoneX(...) from lib/milestones.mjs` line** (lines 138, 164, 199, 236) and the `issueManager.createEpic({...})` step at line 134. Keep the argument tables, the Behavior lists and the Error-case tables — those are documentation of what the verb does, not directives. Add to §Milestone Ship: when the verb exits 2 listing pending confirmations, ask the user in chat and re-invoke with `--yes`; never bypass by calling the lib directly.

- [ ] **Commit**

```bash
git add lib/cli/issues-milestone.mjs lib/cli/issues.mjs tests/cli/issues-milestone.test.mjs skills/issues/SKILL.md
git commit -m "refactor(issues): add adev issues milestone verbs with an always-present confirmFn"
```

---

### Task 6: Sub-verb `--help` routing coverage [specialist: none]

**Charter capability:** `adev <verb>` help / discovery
**Strategy:** unit (source: fallback, confidence: high)
**Behaviors:** BEH-8
**Depends on:** Task 5
**Files:**
- Modify: `tests/cli/issues-help-routing.test.mjs`
- Modify: `lib/cli/issues.mjs` (route `--help`/`-h` before `run` on every new branch)
- Modify: `lib/cli/issues-board.mjs`, `lib/cli/issues-list.mjs`, `lib/cli/issues-mutate.mjs`, `lib/cli/issues-milestone.mjs` (fill `help()` gaps only — no behavioral change)
- Test: `tests/cli/issues-help-routing.test.mjs`

**Tests:** extend `tests/cli/issues-help-routing.test.mjs` — the suite covering BEH-8 already exists

- [ ] **Write failing test**

Extend the existing `cases` table with one row per new sub-verb:

```javascript
["board", /^usage: adev issues board/m],
["list", /^usage: adev issues list/m],
["ready", /^usage: adev issues ready/m],
["update", /^usage: adev issues update <id>/m],
["close", /^usage: adev issues close <id>/m],
["dep", /^usage: adev issues dep <id>/m],
["milestone", /^usage: adev issues milestone <create\|list\|ship\|defer>/m],
```

Add one case for the second level: `adev issues milestone ship --help` prints ship's own usage, not the milestone subcommand list.

- [ ] **Verify test fails**

Run: `node --test tests/cli/issues-help-routing.test.mjs`
Expected: FAIL — the new rows print the parent's `Subcommands:` list, which the existing `doesNotMatch` assertion rejects

- [ ] **Implement**

Fill in any `help()` gaps and make sure each new branch in `lib/cli/issues.mjs` short-circuits `--help` / `-h` *before* calling `run`, matching the `stale` / `claim` shape. `export const dispatchesSubcommandHelp = true` is already set and must not be removed.

- [ ] **Verify test passes**

Run: `node --test tests/cli/issues-help-routing.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add tests/cli/issues-help-routing.test.mjs lib/cli/issues*.mjs
git commit -m "test(issues): pin --help routing for every new issues sub-verb"
```

---

### Task 7: Worktree-correctness test [specialist: none]

**Charter capability:** Driver substrate
**Strategy:** integration (source: detected, confidence: medium)
**Behaviors:** BEH-1
**Depends on:** Task 1
**Files:**
- Create: `tests/cli/issues-worktree-storage.test.mjs`

**Tests:** create `tests/cli/issues-worktree-storage.test.mjs` — first suite covering BEH-1

> This is the test that would have caught the P2 data-loss failure: an epic that was never created because the agent reached for `br` from a linked worktree.

- [ ] **Write failing test**

```javascript
describe("adev issues from a linked worktree (BEH-1)", () => {
  it("mutates the MAIN checkout's board, not a worktree-local one", () => {
    // 1. git init a temp repo, adev-init a .context-index with the json backend
    // 2. seed + commit the board, then `git worktree add <wt> -b side`
    // 3. run `adev issues create "from wt" --json` with cwd = <wt>
    // 4. assert the new id is visible from `adev issues board` run in the MAIN
    //    checkout, and that no board file was created under <wt>
  });

  it("reads the same board from both checkouts", () => { /* board output identical */ });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/issues-worktree-storage.test.mjs`
Expected: FAIL before the fixture is right; it must fail for the *storage-root* reason, not a setup error — assert the failure message names a worktree-local path.

- [ ] **Implement**

No production change is expected: `getIssueManager` already resolves through `resolveStorageRoot()` (P3, verified in the spec). If the test does fail on a real bug, fix it in `lib/issues/resolve-root.mjs` and note the deviation — do not weaken the assertion.

Use `tests/helpers.mjs::createTempDir` / `cleanupTempDir`. Keep every `git` call hermetic (local `git init`, no remote, no network). **The suite must FAIL, never skip, when `git worktree` is unavailable.**

- [ ] **Verify test passes**

Run: `node --test tests/cli/issues-worktree-storage.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add tests/cli/issues-worktree-storage.test.mjs
git commit -m "test(issues): assert worktree-issued board writes reach the main checkout"
```

---

### Task 8: SKILL.md sweep, `br` prohibition, BEH-9 enforcement test [specialist: none]

**Charter capability:** Inline-Node extraction sweep (residual gap) + regression hook
**Strategy:** unit (source: fallback, confidence: high)
**Behaviors:** BEH-9, INV-3, INV-7
**Depends on:** Task 5, Task 6
**Files:**
- Create: `tests/skills/issues-skill-verb-coverage.test.mjs`
- Modify: `skills/issues/SKILL.md` (§Backend Resolution at line 33, §Key Principles, §API reference framing)

**Tests:** create `tests/skills/issues-skill-verb-coverage.test.mjs` — first suite covering BEH-9

- [ ] **Write failing test**

```javascript
describe("skills/issues/SKILL.md is verb-driven (BEH-9)", () => {
  it("contains no fenced javascript block", () => {
    assert.doesNotMatch(skill, /```javascript/);
  });

  it("names no lib function outside the API reference section", () => {
    const body = skill.split(/^## API reference$/m)[0];
    for (const name of ["getIssueManager", "renderTasksMd", "createEpic", "addDependency",
                        "milestoneCreate", "milestoneList", "milestoneShip", "milestoneDefer",
                        "loadManifest"]) {
      assert.doesNotMatch(body, new RegExp(name), `${name} still appears as a directive`);
    }
  });

  it("every H3 step section names an `adev issues` invocation", () => { /* ... */ });
  it("states the raw-`br` prohibition", () => { assert.match(skill, /never .*\bbr\b/i); });
  it("retains the Load Skill Extensions block (INV-7)", () => {
    assert.match(skill, /adev skill-ext load --skill issues/);
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/issues-skill-verb-coverage.test.mjs`
Expected: FAIL — §Backend Resolution (line 33) still names `loadManifest` and `getIssueManager`

- [ ] **Implement**

Rewrite §Backend Resolution: state that the backend comes from `tasks.backend` in `.context-index/manifest.yaml`, that every `adev issues` sub-verb resolves the adapter and the storage root itself, and that the board is initialised on first write. No lib names.

Add to §Key Principles the explicit prohibition, matching the wording already used in `skills/plan`, `skills/implement` and `skills/reconcile`:

> **Never call the backend binary directly.** `br` resolves `.beads/` from the current directory, so inside a linked worktree it opens the git-tracked `issues.jsonl` with no `beads.db` beside it and fails with `SYNC_CONFLICT` — the write is silently lost. Every board operation goes through `adev issues <sub>`, which resolves the storage root from the git common dir.

Re-frame `## API reference` as *"what the verbs wrap — descriptive only; do not call these directly"*, keeping the entries as documentation. Verify `hooks/pre-commit-no-inline-node.sh` passes and that no H3 section carries both a lib directive and a verb invocation (INV-3).

- [ ] **Verify test passes**

Run: `node --test tests/skills/issues-skill-verb-coverage.test.mjs && bash hooks/pre-commit-no-inline-node.sh`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/issues/SKILL.md tests/skills/issues-skill-verb-coverage.test.mjs
git commit -m "refactor(issues): finish the SKILL.md sweep and pin verb coverage"
```

---

### Task 9: `docs/cli-reference.md`, provider mirrors, gate sweep [specialist: none]

**Charter capability:** `adev <verb>` help / discovery (documentation half)
**Strategy:** unit (source: fallback, confidence: high)
**Behaviors:** closes acceptance criteria 7-10
**Depends on:** Task 8
**Files:**
- Modify: `docs/cli-reference.md` (§`issues`, lines 519-588 — subcommand table, signatures, examples)
- Modify: `providers/*/skills/issues/SKILL.md` (regenerated, never hand-edited)
- Test: `tests/sync/provider-skill-parity.test.mjs` (existing, must pass unmodified)

**Tests:** extend `tests/sync/provider-skill-parity.test.mjs` coverage by regeneration — no new suite; the parity assertion already exists and fails on drift

> **Charter divergence (review finding CON-1, recorded in the spec header):** the charter lists provider-mirror sync under Out of Scope, but `scripts/sync-provider-skills.mjs` exists and the parity test FAILS on drift, so regeneration is mandatory to keep `npm test` green. Raise the charter capability row via `/adev:brainstorm` as a follow-up; do not block this task on it.

- [ ] **Write failing test**

Run the existing parity test after Task 8's SKILL.md rewrite:

Run: `node --test tests/sync/provider-skill-parity.test.mjs`
Expected: FAIL — mirrors are stale relative to the rewritten canonical skill

- [ ] **Implement**

1. Extend `docs/cli-reference.md` §`issues`: add `board`, `list`, `ready`, `update`, `close`, `dep`, `milestone` to the subcommand table; document each signature, its exit codes (0/1/2), and `--json`; add an example block. Call out that `adev issues board` prints to stdout while `adev status --render` writes `tasks.md` (INV-6) — the two are not interchangeable.
2. Regenerate the mirrors: `node scripts/sync-provider-skills.mjs`
3. Sweep: confirm no `getIssueManager` / `createEpic` / `milestone*` directive remains anywhere outside a descriptive API-reference section.

- [ ] **Verify test passes**

Run: `npm test` (full suite) and `bash hooks/pre-commit-no-inline-node.sh`
Expected: PASS — including `tests/sync/provider-skill-parity.test.mjs`, `tests/skills-extension-coverage.test.mjs` and `tests/skills-no-inline-node.test.mjs`

- [ ] **Commit**

```bash
git add docs/cli-reference.md providers
git commit -m "docs(issues): document the new issues sub-verbs and regenerate provider mirrors"
```

---

## Acceptance Criteria Coverage

| Spec criterion | Task(s) |
|---|---|
| All current tests pass without modification (INV-1) | 1-9 (every task re-runs the suite; Task 9 runs it in full) |
| Every one of the 16 directive sites names a verb, or is in the API-reference section | 1 (49-63), 2 (105, 115), 3 (92-93, 99, 111), 4 (77, 85), 5 (134, 138, 164, 199, 236), 8 (33) |
| The fenced JavaScript block at 49-63 is gone | 1, verified by 8 |
| Each new verb has tests for success, refusal and exit code | 1, 2, 3, 4, 5 |
| At least one test mutates the board from a linked worktree (BEH-1) | 7 |
| `adev issues <sub> --help` for every sub-verb (BEH-8) | 6 |
| `docs/cli-reference.md` documents every new sub-verb | 9 |
| Provider mirrors regenerated; parity test passes | 9 |
| `hooks/pre-commit-no-inline-node.sh` passes | 8, 9 |
| All quality gates pass (`npm test`) | 9 |
| No constitutional violations introduced | 1-9 (no new dependency; pure ESM; no executable logic left in SKILL.md) |

## Invariant Coverage

| Invariant | Where it is enforced |
|---|---|
| INV-1 — existing tests unmodified | Tasks 4 and 6 extend suites additively; no task edits an existing assertion |
| INV-2 — storage only via `getIssueManager()` | Tasks 1-5 (every verb obtains its adapter this way); Task 7 proves it end to end |
| INV-3 — no section carries both forms | Tasks 1-5 rewrite the section in the same commit as the verb; Task 8 sweeps; hook enforces |
| INV-4 — no `--plan-task` flag | No task adds one; `issues-create.mjs`'s docstring already records why |
| INV-5 — exit codes 0/1/2 | Task 3 (close-blocked, cycle), Task 5 (unconfirmed ship, failed criteria, gate timeout) |
| INV-6 — `board` never writes; `status --render` still does | Task 1 asserts no file is created; Task 9 documents the split |
| INV-7 — Load Skill Extensions block survives | Task 8 asserts it directly |

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

From `.context-index/governance/gates.yaml` (which supersedes the constitution's Quality Gates block):

| Gate | Tier | Command | Severity |
|---|---|---|---|
| `test` / `quality-gate` | fast | `npm test` | error |
| `integration-test` | integration | `npm run test:evals` | warning (`required: false` until issue-590/591/592 close) |

Additional non-gate checks this plan must satisfy:

- `bash hooks/pre-commit-no-inline-node.sh` — no inline-Node, no both-forms H3 section
- `tests/sync/provider-skill-parity.test.mjs` — mirrors match the canonical skill
- `tests/skills-extension-coverage.test.mjs` — Load Skill Extensions block present (INV-7)
- All acceptance criteria from the spec satisfied (table above)
