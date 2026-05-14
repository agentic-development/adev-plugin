<!-- DO NOT EDIT statuses inline — see lifecycle log milestone-ship.jsonl -->
# Implementation Plan: Strategy-Based Release Execution + CRUD Release Schema

> **Methodology:** adev
> **Charter:** .context-index/specs/features/milestone-lifecycle/charter.md
> **Specs:**
>   - .context-index/specs/features/milestone-lifecycle/milestone-ship.spec.md (rev 2)
>   - .context-index/specs/features/milestone-lifecycle/milestone-crud.spec.md (rev 3)
> **Review:** PASS_WITH_NOTES (2026-05-11)
> **Platform:** Node.js, JavaScript (ESM), npm, node:test

**Goal:** Refactor `milestoneShip` from hardcoded tag/release to a strategy-based dispatch model (`manual`, `tag-only`, `release-please`), and extend `milestoneCreate`/I/O to support the `release: { strategy: ... }` schema.

**Architecture:** The strategy model is a simple switch on `milestone.release.strategy` inside `milestoneShip`. No new files — all changes go into `lib/milestones.mjs` and `tests/milestones.test.mjs`. The `release-please` strategy writes to an existing project config file (`release-please-config.json`) via `JSON.parse`/`JSON.stringify` — no external dependency. Backward compatible: existing `release: null` milestones default to `manual` strategy.

---

## File Structure

**Modify:**
- `lib/milestones.mjs` — Add `resolveStrategy`, refactor `milestoneShip` to dispatch per strategy, extend `saveMilestones`/`loadMilestones` for `release` object, add `--strategy` support to `milestoneCreate`
- `tests/milestones.test.mjs` — Add strategy tests, release schema I/O tests, update existing ship tests
- `skills/issues/SKILL.md:179-183` — Update `milestone ship` and `milestone create` documentation

**Reference (read, do not modify):**
- `.context-index/adrs/0008-release-please-automation.md` — release-please config structure
- `release-please-config.json` — understand `packages["."]` shape for the `release-please` strategy

## Context Packets

### Task 1 Context
- Spec: milestone-crud.spec.md (Release Field Schema section, behaviors 4a/4b)
- Spec: milestone-ship.spec.md (Release Strategy Model section)
- Source: `lib/milestones.mjs:56-123` (loadMilestones, saveMilestones)
- Test: `tests/milestones.test.mjs:24-75` (existing I/O tests)

### Task 2 Context
- Spec: milestone-ship.spec.md (Implementation Notes — resolveStrategy helper)
- Charter: invariants on release.strategy values

### Task 3 Context
- Spec: milestone-crud.spec.md (behaviors 4a, 4b, UNKNOWN_STRATEGY error)
- Source: `lib/milestones.mjs:148-208` (milestoneCreate)
- Test: `tests/milestones.test.mjs:126-188` (existing create tests)

### Task 4 Context
- Spec: milestone-ship.spec.md (behaviors 8, 19 — manual strategy)
- Source: `lib/milestones.mjs:410-488` (milestoneShip)
- Test: `tests/milestones.test.mjs:443-582` (existing ship tests)

### Task 5 Context
- Spec: milestone-ship.spec.md (behaviors 9-12, 17 — tag-only strategy)
- Source: `lib/milestones.mjs:410-488` (milestoneShip — current tag/release logic)

### Task 6 Context
- Spec: milestone-ship.spec.md (behaviors 13-16, 18 — release-please strategy)
- ADR: `.context-index/adrs/0008-release-please-automation.md`
- Reference: `release-please-config.json` (packages structure)

### Task 7 Context
- Spec: milestone-ship.spec.md (SKILL.md documentation)
- Spec: milestone-crud.spec.md (--strategy flag documentation)
- Source: `skills/issues/SKILL.md:179-183` (current milestone ship docs)

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 (schema foundation)
- Group B (sequential, depends on A): Task 4 → Task 5 → Task 6 (strategy implementations)
- Group C (independent, after B): Task 7 (documentation)

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Release schema in I/O | small | unit | — | 0 create, 2 modify |
| 2 | `resolveStrategy` helper | small | unit | Task 1 | 0 create, 2 modify |
| 3 | `--strategy` flag in `milestoneCreate` | small | unit | Task 2 | 0 create, 2 modify |
| 4 | Strategy dispatch + `manual` strategy | medium | unit | Task 3 | 0 create, 2 modify |
| 5 | `tag-only` strategy | small | unit | Task 4 | 0 create, 2 modify |
| 6 | `release-please` strategy | medium | unit | Task 4 | 0 create, 2 modify |
| 7 | SKILL.md documentation | small | — | Task 6 | 0 create, 1 modify |

---

### Task 1: Release schema in saveMilestones/loadMilestones [specialist: none]

**Charter capability:** Milestone Create (release field schema)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/milestones.mjs:56-123` (loadMilestones, saveMilestones)
- Test: `tests/milestones.test.mjs`

**Tests:** `tests/milestones.test.mjs`

- [x] **Write failing test**

```javascript
describe("release field I/O", () => {
  let dir;
  before(() => { dir = mkdtempSync(join(tmpdir(), "milestone-release-io-")); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("round-trips release object through save/load", () => {
    const ms = [{ name: "v1", status: "planned", epic_id: null, target_date: null,
                  release: { strategy: "tag-only" }, ship_criteria: [] }];
    saveMilestones(dir, ms);
    const loaded = loadMilestones(dir);
    assert.deepStrictEqual(loaded[0].release, { strategy: "tag-only" });
  });

  it("preserves release: null through save/load", () => {
    const ms = [{ name: "v2", status: "planned", epic_id: null, target_date: null,
                  release: null, ship_criteria: [] }];
    saveMilestones(dir, ms);
    const loaded = loadMilestones(dir);
    assert.equal(loaded[0].release, null);
  });

  it("loads legacy milestones without release field as null", () => {
    mkdirSync(join(dir, ".context-index"), { recursive: true });
    writeFileSync(join(dir, ".context-index", "milestones.yaml"),
      "milestones:\n  - name: legacy\n    status: planned\n    epic_id: null\n    target_date: null\n    ship_criteria: []\n");
    const loaded = loadMilestones(dir);
    assert.equal(loaded[0].release, null);
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/milestones.test.mjs`
Expected: FAIL — release field not round-tripped correctly

- [x] **Implement**

Update `saveMilestones` to serialize `release` as nested YAML when it's an object:

```javascript
// In saveMilestones, replace the release line:
if (ms.release && typeof ms.release === "object") {
  lines.push("    release:");
  if (ms.release.strategy) {
    lines.push(`      strategy: ${ms.release.strategy}`);
  }
} else {
  lines.push(`    release: ${ms.release ?? "null"}`);
}
```

`loadMilestones` already reads `m.release ?? null` which will pick up the parsed object from `parseYaml`.

- [x] **Verify test passes**

Run: `node --test tests/milestones.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/milestones.mjs tests/milestones.test.mjs
git commit -m "feat(milestone-lifecycle): serialize release strategy object in milestones I/O

Spec: .context-index/specs/features/milestone-lifecycle/milestone-crud.spec.md
Plan-task: 1"
```

---

### Task 2: `resolveStrategy` helper [specialist: none]

**Charter capability:** Milestone Ship (strategy resolution)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `lib/milestones.mjs`
- Test: `tests/milestones.test.mjs`

**Tests:** `tests/milestones.test.mjs`

- [x] **Write failing test**

```javascript
// Add import of resolveStrategy at top of test file

describe("resolveStrategy", () => {
  it("returns 'manual' for null release", () => {
    assert.equal(resolveStrategy({ release: null }), "manual");
  });

  it("returns 'manual' for undefined release", () => {
    assert.equal(resolveStrategy({}), "manual");
  });

  it("returns 'manual' for release without strategy", () => {
    assert.equal(resolveStrategy({ release: {} }), "manual");
  });

  it("returns configured strategy for valid values", () => {
    assert.equal(resolveStrategy({ release: { strategy: "tag-only" } }), "tag-only");
    assert.equal(resolveStrategy({ release: { strategy: "release-please" } }), "release-please");
    assert.equal(resolveStrategy({ release: { strategy: "manual" } }), "manual");
  });

  it("throws UNKNOWN_STRATEGY for unrecognized values", () => {
    assert.throws(
      () => resolveStrategy({ release: { strategy: "custom" } }),
      (err) => err.code === "UNKNOWN_STRATEGY"
    );
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/milestones.test.mjs`
Expected: FAIL — `resolveStrategy` is not defined

- [x] **Implement**

```javascript
const VALID_STRATEGIES = new Set(["manual", "tag-only", "release-please"]);

export function resolveStrategy(milestone) {
  const release = milestone?.release;
  if (!release || !release.strategy) return "manual";
  if (!VALID_STRATEGIES.has(release.strategy)) {
    const err = new Error(
      `Unknown release strategy '${release.strategy}'. Expected: manual, tag-only, release-please`
    );
    err.code = "UNKNOWN_STRATEGY";
    throw err;
  }
  return release.strategy;
}
```

- [x] **Verify test passes**

Run: `node --test tests/milestones.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/milestones.mjs tests/milestones.test.mjs
git commit -m "feat(milestone-lifecycle): add resolveStrategy helper for release strategy dispatch

Spec: .context-index/specs/features/milestone-lifecycle/milestone-ship.spec.md
Plan-task: 2"
```

---

### Task 3: `--strategy` flag in `milestoneCreate` [specialist: none]

**Charter capability:** Milestone Create (behaviors 4a, 4b)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `lib/milestones.mjs:148-208` (milestoneCreate)
- Test: `tests/milestones.test.mjs`

**Tests:** `tests/milestones.test.mjs`

- [x] **Write failing test**

```javascript
describe("milestoneCreate with --strategy", () => {
  let dir;
  before(() => { dir = mkdtempSync(join(tmpdir(), "milestone-strategy-create-")); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("sets release.strategy when strategy option provided", async () => {
    const result = await milestoneCreate(dir, "v1", { strategy: "tag-only" });
    assert.deepStrictEqual(result.release, { strategy: "tag-only" });
    const loaded = loadMilestones(dir);
    assert.deepStrictEqual(loaded[0].release, { strategy: "tag-only" });
  });

  it("leaves release as null when no strategy option", async () => {
    const result = await milestoneCreate(dir, "v2", {});
    assert.equal(result.release, null);
  });

  it("rejects unknown strategy with UNKNOWN_STRATEGY", async () => {
    await assert.rejects(
      () => milestoneCreate(dir, "v3", { strategy: "unknown" }),
      { code: "UNKNOWN_STRATEGY" }
    );
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/milestones.test.mjs`
Expected: FAIL — `milestoneCreate` does not handle `strategy` option

- [x] **Implement**

In `milestoneCreate`, after name/date validation:

```javascript
let release = null;
if (options.strategy) {
  resolveStrategy({ release: { strategy: options.strategy } }); // throws UNKNOWN_STRATEGY if invalid
  release = { strategy: options.strategy };
}
```

Set `release` on the new entry object and on idempotent update path (when strategy is provided).

- [x] **Verify test passes**

Run: `node --test tests/milestones.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/milestones.mjs tests/milestones.test.mjs
git commit -m "feat(milestone-lifecycle): add --strategy flag to milestoneCreate

Spec: .context-index/specs/features/milestone-lifecycle/milestone-crud.spec.md
Plan-task: 3"
```

---

### Task 4: Strategy dispatch + `manual` strategy in `milestoneShip` [specialist: none]

**Charter capability:** Milestone Ship (behaviors 5-8, 19)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Modify: `lib/milestones.mjs:410-488` (milestoneShip)
- Test: `tests/milestones.test.mjs`

**Tests:** `tests/milestones.test.mjs`

- [x] **Write failing test**

```javascript
describe("milestoneShip strategy: manual", () => {
  let dir;
  before(() => { dir = mkdtempSync(join(tmpdir(), "milestone-ship-manual-")); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("ships with manual strategy (no git ops)", async () => {
    saveMilestones(dir, [{
      name: "v1.0.0", status: "planned", epic_id: "epic-1",
      target_date: null, release: { strategy: "manual" }, ship_criteria: [],
    }]);
    const closedEpics = [];
    const mockManager = {
      listEpics: async () => [{ id: "epic-1" }],
      list: async () => [],
      close: async (id, reason) => { closedEpics.push({ id, reason }); },
    };
    const result = await milestoneShip(dir, "v1.0.0", {
      issueManager: mockManager,
      manifest: {},
      execGit: () => { throw new Error("should not be called for manual"); },
    });
    assert.equal(result.shipped, true);
    assert.equal(result.strategy, "manual");
    assert.equal(closedEpics[0].id, "epic-1");
    assert.equal(findMilestone(dir, "v1.0.0").status, "shipped");
  });

  it("defaults to manual when release is null", async () => {
    saveMilestones(dir, [{
      name: "v2.0.0", status: "planned", epic_id: "epic-2",
      target_date: null, release: null, ship_criteria: [],
    }]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-2" }],
      list: async () => [],
      close: async () => {},
    };
    const result = await milestoneShip(dir, "v2.0.0", {
      issueManager: mockManager, manifest: {},
    });
    assert.equal(result.shipped, true);
    assert.equal(result.strategy, "manual");
  });

  it("throws UNKNOWN_STRATEGY for bad strategy", async () => {
    saveMilestones(dir, [{
      name: "v3.0.0", status: "planned", epic_id: "epic-3",
      target_date: null, release: { strategy: "bad" }, ship_criteria: [],
    }]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-3" }],
      list: async () => [],
    };
    await assert.rejects(
      () => milestoneShip(dir, "v3.0.0", { issueManager: mockManager, manifest: {} }),
      { code: "UNKNOWN_STRATEGY" }
    );
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/milestones.test.mjs`
Expected: FAIL — `milestoneShip` doesn't return `strategy` field

- [x] **Implement**

Refactor `milestoneShip`:
1. After criteria evaluation and confirms, call `resolveStrategy(milestone)`.
2. Add strategy switch. `"manual"` path: update status to shipped, close epic, return `{ shipped: true, strategy: "manual", results }`.
3. Move existing tag/release logic into a block that only runs for `"tag-only"` (Task 5 will wire this).
4. **Update existing ship tests:** Tests that relied on `release: null` triggering tagging now need `release: { strategy: "tag-only" }` on their fixture milestones, since null now resolves to `manual` (no tags). Specifically update tests at lines 448-582 that set `execGit`.

- [x] **Verify test passes**

Run: `node --test tests/milestones.test.mjs`
Expected: PASS (all existing + new tests)

- [x] **Commit**

```bash
git add lib/milestones.mjs tests/milestones.test.mjs
git commit -m "feat(milestone-lifecycle): add strategy dispatch and manual strategy to milestoneShip

Spec: .context-index/specs/features/milestone-lifecycle/milestone-ship.spec.md
Plan-task: 4"
```

---

### Task 5: `tag-only` strategy [specialist: none]

**Charter capability:** Milestone Ship (behaviors 9-12, 17)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 4
**Files:**
- Modify: `lib/milestones.mjs` (milestoneShip tag-only branch)
- Test: `tests/milestones.test.mjs`

**Tests:** `tests/milestones.test.mjs`

- [x] **Write failing test**

```javascript
describe("milestoneShip strategy: tag-only", () => {
  let dir;
  before(() => { dir = mkdtempSync(join(tmpdir(), "milestone-ship-tag-only-")); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("creates git tag for semver names", async () => {
    saveMilestones(dir, [{
      name: "1.0.0", status: "planned", epic_id: "epic-1",
      target_date: null, release: { strategy: "tag-only" }, ship_criteria: [],
    }]);
    let tagCreated = null;
    const mockManager = {
      listEpics: async () => [{ id: "epic-1" }],
      list: async () => [], close: async () => {},
    };
    const result = await milestoneShip(dir, "1.0.0", {
      issueManager: mockManager, manifest: {},
      execGit: (args) => { tagCreated = args[1]; },
    });
    assert.equal(result.shipped, true);
    assert.equal(result.strategy, "tag-only");
    assert.equal(result.tag, "v1.0.0");
    assert.equal(tagCreated, "v1.0.0");
  });

  it("skips tag for non-semver names", async () => {
    saveMilestones(dir, [{
      name: "beta-1", status: "planned", epic_id: "epic-2",
      target_date: null, release: { strategy: "tag-only" }, ship_criteria: [],
    }]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-2" }],
      list: async () => [], close: async () => {},
    };
    const result = await milestoneShip(dir, "beta-1", {
      issueManager: mockManager, manifest: {},
    });
    assert.equal(result.shipped, true);
    assert.equal(result.tag, null);
  });

  it("blocks when tag already exists", async () => {
    saveMilestones(dir, [{
      name: "v3.0.0", status: "planned", epic_id: "epic-3",
      target_date: null, release: { strategy: "tag-only" }, ship_criteria: [],
    }]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-3" }],
      list: async () => [], close: async () => {},
    };
    const result = await milestoneShip(dir, "v3.0.0", {
      issueManager: mockManager, manifest: {},
      execGit: () => {
        const e = new Error("tag exists");
        e.stderr = Buffer.from("fatal: tag 'v3.0.0' already exists");
        throw e;
      },
    });
    assert.equal(result.shipped, false);
    assert.equal(result.error, "TAG_EXISTS");
  });

  it("calls execGh for GitHub release when available", async () => {
    saveMilestones(dir, [{
      name: "4.0.0", status: "planned", epic_id: "epic-4",
      target_date: null, release: { strategy: "tag-only" }, ship_criteria: [],
    }]);
    let ghArgs = null;
    const mockManager = {
      listEpics: async () => [{ id: "epic-4" }],
      list: async () => [], close: async () => {},
    };
    await milestoneShip(dir, "4.0.0", {
      issueManager: mockManager, manifest: {},
      execGit: () => {},
      execGh: (args) => { ghArgs = args; },
    });
    assert.ok(ghArgs.includes("release"));
    assert.ok(ghArgs.includes("v4.0.0"));
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/milestones.test.mjs`
Expected: FAIL — tag-only tests don't pass because the existing tag logic was moved to `tag-only` case in Task 4 but the strategy return value isn't set yet

- [x] **Implement**

Wire the existing tag/release logic into the `"tag-only"` case of the strategy switch. This is mostly moving existing code — the logic for semver detection, v-prefix, `execGit`, `execGh`, and TAG_EXISTS is already implemented. Just add `strategy: "tag-only"` to the return object and ensure execution order: (1) tag, (2) status, (3) epic.

- [x] **Verify test passes**

Run: `node --test tests/milestones.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/milestones.mjs tests/milestones.test.mjs
git commit -m "feat(milestone-lifecycle): implement tag-only release strategy

Spec: .context-index/specs/features/milestone-lifecycle/milestone-ship.spec.md
Plan-task: 5"
```

---

### Task 6: `release-please` strategy [specialist: none]

**Charter capability:** Milestone Ship (behaviors 13-16, 18)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 4
**Files:**
- Modify: `lib/milestones.mjs` (milestoneShip release-please branch)
- Test: `tests/milestones.test.mjs`

**Tests:** `tests/milestones.test.mjs`

- [x] **Write failing test**

```javascript
describe("milestoneShip strategy: release-please", () => {
  let dir;
  before(() => { dir = mkdtempSync(join(tmpdir(), "milestone-ship-rp-")); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("writes release-as to config for semver names", async () => {
    const config = { packages: { ".": { "release-type": "node", "package-name": "test" } } };
    writeFileSync(join(dir, "release-please-config.json"), JSON.stringify(config, null, 2));
    saveMilestones(dir, [{
      name: "1.0.0", status: "planned", epic_id: "epic-1",
      target_date: null, release: { strategy: "release-please" }, ship_criteria: [],
    }]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-1" }],
      list: async () => [], close: async () => {},
    };
    const result = await milestoneShip(dir, "1.0.0", {
      issueManager: mockManager, manifest: {},
      execGh: () => "[]",
    });
    assert.equal(result.shipped, true);
    assert.equal(result.strategy, "release-please");
    const updated = JSON.parse(readFileSync(join(dir, "release-please-config.json"), "utf8"));
    assert.equal(updated.packages["."]["release-as"], "1.0.0");
  });

  it("strips v prefix from version in release-as", async () => {
    const config = { packages: { ".": { "release-type": "node" } } };
    writeFileSync(join(dir, "release-please-config.json"), JSON.stringify(config, null, 2));
    saveMilestones(dir, [{
      name: "v2.0.0", status: "planned", epic_id: "epic-2",
      target_date: null, release: { strategy: "release-please" }, ship_criteria: [],
    }]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-2" }],
      list: async () => [], close: async () => {},
    };
    await milestoneShip(dir, "v2.0.0", {
      issueManager: mockManager, manifest: {},
      execGh: () => "[]",
    });
    const updated = JSON.parse(readFileSync(join(dir, "release-please-config.json"), "utf8"));
    assert.equal(updated.packages["."]["release-as"], "2.0.0");
  });

  it("falls back to manual when config file missing", async () => {
    const noConfigDir = mkdtempSync(join(tmpdir(), "milestone-no-rp-"));
    saveMilestones(noConfigDir, [{
      name: "3.0.0", status: "planned", epic_id: "epic-3",
      target_date: null, release: { strategy: "release-please" }, ship_criteria: [],
    }]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-3" }],
      list: async () => [], close: async () => {},
    };
    const result = await milestoneShip(noConfigDir, "3.0.0", {
      issueManager: mockManager, manifest: {},
    });
    assert.equal(result.shipped, true);
    assert.equal(result.strategy, "manual");
    rmSync(noConfigDir, { recursive: true, force: true });
  });

  it("throws RELEASE_CONFIG_INVALID for malformed JSON", async () => {
    const badDir = mkdtempSync(join(tmpdir(), "milestone-bad-rp-"));
    writeFileSync(join(badDir, "release-please-config.json"), "not json{{{");
    saveMilestones(badDir, [{
      name: "4.0.0", status: "planned", epic_id: "epic-4",
      target_date: null, release: { strategy: "release-please" }, ship_criteria: [],
    }]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-4" }],
      list: async () => [],
    };
    await assert.rejects(
      () => milestoneShip(badDir, "4.0.0", { issueManager: mockManager, manifest: {} }),
      (err) => err.code === "RELEASE_CONFIG_INVALID"
    );
    rmSync(badDir, { recursive: true, force: true });
  });

  it("skips config write for non-semver names", async () => {
    const config = { packages: { ".": { "release-type": "node" } } };
    writeFileSync(join(dir, "release-please-config.json"), JSON.stringify(config, null, 2));
    saveMilestones(dir, [{
      name: "alpha-1", status: "planned", epic_id: "epic-5",
      target_date: null, release: { strategy: "release-please" }, ship_criteria: [],
    }]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-5" }],
      list: async () => [], close: async () => {},
    };
    const result = await milestoneShip(dir, "alpha-1", {
      issueManager: mockManager, manifest: {},
    });
    assert.equal(result.shipped, true);
    const updated = JSON.parse(readFileSync(join(dir, "release-please-config.json"), "utf8"));
    assert.equal(updated.packages["."]["release-as"], undefined);
  });

  it("does NOT create git tags", async () => {
    const config = { packages: { ".": { "release-type": "node" } } };
    writeFileSync(join(dir, "release-please-config.json"), JSON.stringify(config, null, 2));
    saveMilestones(dir, [{
      name: "5.0.0", status: "planned", epic_id: "epic-6",
      target_date: null, release: { strategy: "release-please" }, ship_criteria: [],
    }]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-6" }],
      list: async () => [], close: async () => {},
    };
    const result = await milestoneShip(dir, "5.0.0", {
      issueManager: mockManager, manifest: {},
      execGit: () => { throw new Error("should not create tags"); },
      execGh: () => "[]",
    });
    assert.equal(result.shipped, true);
    assert.equal(result.strategy, "release-please");
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/milestones.test.mjs`
Expected: FAIL — no release-please branch in strategy switch

- [x] **Implement**

Add the `"release-please"` case to the strategy switch in `milestoneShip`:

1. Read `release-please-config.json` from `projectRoot`. If missing → fall back to manual, return `{ shipped: true, strategy: "manual" }`.
2. If milestone name matches semver:
   - `JSON.parse` the config. If malformed → throw `RELEASE_CONFIG_INVALID`.
   - Find `packages["."]` (the canonical package entry per ADR-0008).
   - Set `"release-as"` to name with v-prefix stripped.
   - `JSON.stringify` with 2-space indent and write back.
3. Update milestone status to shipped.
4. Close epic.
5. If `execGh` provided, try PR detection via `gh pr list --head release-please--branches--main --json number,title,url --limit 1`. Graceful on failure.
6. Return `{ shipped: true, strategy: "release-please", results }`.

- [x] **Verify test passes**

Run: `node --test tests/milestones.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/milestones.mjs tests/milestones.test.mjs
git commit -m "feat(milestone-lifecycle): implement release-please strategy

Spec: .context-index/specs/features/milestone-lifecycle/milestone-ship.spec.md
Plan-task: 6"
```

---

### Task 7: SKILL.md documentation [specialist: none]

**Charter capability:** Milestone Ship, Milestone Create (documentation)
**Strategy:** — (documentation only, no test)
**Depends on:** Task 6
**Files:**
- Modify: `skills/issues/SKILL.md`

**Tests:** — (no test for documentation)

- [x] **Update milestone create docs**

Add `--strategy` flag documentation to the `### Milestone Create` section:

```markdown
`milestone create <name> [--target <date>] [--strategy <manual|tag-only|release-please>]`

Options:
- `--target <YYYY-MM-DD>` — set a target date
- `--strategy <value>` — set the release strategy (default: `manual`). Options: `manual` (no git ops at ship time), `tag-only` (git tag + optional GH release), `release-please` (writes release-as to config)
```

- [x] **Update milestone ship docs**

Replace the current `### Milestone Ship` section (lines 179-183) with:

```markdown
### Milestone Ship

`milestone ship <name>`

Evaluate ship criteria, execute the configured release strategy, update status to `shipped`, and close the linked epic.

**Release strategies:**
- `manual` (default) — No git operations. Prints guidance for manual tag/publish.
- `tag-only` — Creates git tag (`v<name>` for semver). Optionally creates GitHub release draft via `gh` CLI.
- `release-please` — Writes `release-as` to `release-please-config.json`. Detects and prints open Release PR URL. Does not create tags.

Set the strategy with `milestone create --strategy <value>` or edit `milestones.yaml` directly.
```

- [x] **Commit**

```bash
git add skills/issues/SKILL.md
git commit -m "docs(milestone-lifecycle): update SKILL.md for strategy-based ship and --strategy flag

Spec: .context-index/specs/features/milestone-lifecycle/milestone-ship.spec.md
Plan-task: 7"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from both specs satisfied
- No constitutional violations
