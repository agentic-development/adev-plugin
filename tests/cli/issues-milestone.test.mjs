/**
 * Tests for `adev issues milestone create|list|ship|defer`.
 *
 * These four sub-verbs exist so the `/adev:issues` §Milestone Create,
 * §Milestone List, §Milestone Ship and §Milestone Defer steps stop being lib
 * directives ("Call milestoneShip(...) from lib/milestones.mjs"). An agent
 * handed a lib call has no CLI surface to reach for, and the ship path is the
 * one where that matters most.
 *
 * The load-bearing contract (BEH-7): `ship` ALWAYS supplies `confirmFn`.
 * `lib/milestones.mjs` guards its confirm loop with
 *
 *     if (confirms.length > 0 && options.confirmFn) {
 *
 * so a caller that OMITS the callback does not refuse the ship — it skips
 * every manual confirmation and ships. The refusal must be an explicit
 * `false` return from a callback that is always present. One test below
 * asserts the mechanism (the callback is passed in BOTH branches), the rest
 * assert the outcome through the real CLI.
 *
 * Exit-code discipline (INV-5):
 *   0  the operation landed
 *   1  usage error or adapter failure (MILESTONE_NOT_FOUND, ALREADY_SHIPPED, …)
 *   2  refused by a guard: a failed auto-check, a timed-out gate, or a
 *      rejected/unanswered manual confirm — nothing is mutated
 *
 * Spec: .context-index/specs/features/cli-driver-surface/issues-skill-lib-directive-extraction.spec.md
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { getIssueManager } from "../../lib/issues/registry.mjs";

const CLI = fileURLToPath(new URL("../../cli/index.mjs", import.meta.url));
const MILESTONES_URL = new URL("../../lib/milestones.mjs", import.meta.url).href;
const VERB_URL = new URL("../../lib/cli/issues-milestone.mjs", import.meta.url).href;
const MANIFEST = { tasks: { backend: "json" } };

process.env.ADEV_SILENCE_SHADOW_BOARD = "1";

function runCli(cwd, args) {
  return spawnSync(process.execPath, [CLI, "issues", "milestone", ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ADEV_SILENCE_SHADOW_BOARD: "1" },
  });
}

/** A git repo with a json-backed board — the default backend, no `br` needed. */
function makeProject(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, ".context-index"), { recursive: true });
  writeFileSync(join(root, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
  execFileSync("git", ["init", "-q", "."], { cwd: root });
  execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "t"], { cwd: root });
  execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "init"], { cwd: root });
  return root;
}

function milestonesPath(root) {
  return join(root, ".context-index", "milestones.json");
}

/**
 * Seed milestones.json directly. Deliberately NOT via `saveMilestones` — this
 * file must not pull `lib/milestones.mjs` into its own module cache, because
 * the confirmFn mechanism test intercepts that module's load.
 */
function seedMilestones(root, milestones) {
  writeFileSync(milestonesPath(root), JSON.stringify({ version: 1, milestones }, null, 2) + "\n");
}

function readMilestones(root) {
  return JSON.parse(readFileSync(milestonesPath(root), "utf8")).milestones;
}

function milestoneEntry(overrides) {
  return {
    name: "v1",
    status: "planned",
    epic_id: null,
    target_date: null,
    release: null,
    ship_criteria: [],
    ...overrides,
  };
}

/** Write `.context-index/governance/gates.yaml` into a temp project. */
function writeGates(root, yaml) {
  mkdirSync(join(root, ".context-index", "governance"), { recursive: true });
  writeFileSync(join(root, ".context-index", "governance", "gates.yaml"), yaml);
}

describe("adev issues milestone ship", () => {
  let root;
  let epicId;

  before(async () => {
    root = makeProject("adev-milestone-ship-");
    const manager = getIssueManager(MANIFEST, root);
    epicId = (await manager.createEpic({ title: "v1", milestone: "v1" })).id;
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  // BEH-7 — the mechanism, not just the outcome.
  it("without --yes prints the pending confirmations, exits 2, and mutates nothing", () => {
    seedMilestones(root, [
      milestoneEntry({ epic_id: epicId, ship_criteria: [{ confirm: "CHANGELOG updated" }] }),
    ]);
    const before = readFileSync(milestonesPath(root), "utf8");

    const r = runCli(root, ["ship", "v1"]);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stdout + r.stderr, /CHANGELOG updated/);
    assert.equal(readFileSync(milestonesPath(root), "utf8"), before);
  });

  it("names the rejected confirm and mutates nothing (confirmRejected)", () => {
    seedMilestones(root, [
      milestoneEntry({
        epic_id: epicId,
        ship_criteria: [{ confirm: "Release notes drafted" }, { confirm: "Docs published" }],
      }),
    ]);
    const before = readFileSync(milestonesPath(root), "utf8");

    const r = runCli(root, ["ship", "v1"]);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    // `confirmFn` rejects the FIRST confirm, so that is the one reported.
    assert.match(r.stdout + r.stderr, /Release notes drafted/);
    assert.match(r.stdout + r.stderr, /reject|refus|not confirmed|unconfirmed|pending/i);
    assert.equal(readFileSync(milestonesPath(root), "utf8"), before);
    assert.equal(readMilestones(root)[0].status, "planned");
  });

  it("names each failed auto-check and mutates nothing (failed ship criteria)", async () => {
    const manager = getIssueManager(MANIFEST, root);
    const failEpicId = (await manager.createEpic({ title: "v-fail", milestone: "v-fail" })).id;
    await manager.create({ title: "Still open", type: "task", epicId: failEpicId });

    seedMilestones(root, [
      milestoneEntry({
        name: "v-fail",
        epic_id: failEpicId,
        ship_criteria: [{ check: "all_issues_closed" }],
      }),
    ]);
    const before = readFileSync(milestonesPath(root), "utf8");

    const r = runCli(root, ["ship", "v-fail", "--yes"]);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stdout + r.stderr, /all_issues_closed/);
    assert.match(r.stdout + r.stderr, /still open/i);
    assert.equal(readFileSync(milestonesPath(root), "utf8"), before);
    assert.equal(readMilestones(root)[0].status, "planned");
  });

  it("reports the timed-out gate and its budget, mutating nothing (gate timeout)", () => {
    writeGates(root, [
      "gates:",
      "  - id: slow-gate",
      "    tier: fast",
      '    command: [sleep, "60"]',
      "    required: true",
      "    severity: error",
      "",
    ].join("\n"));
    seedMilestones(root, [
      milestoneEntry({
        name: "v-gate",
        epic_id: epicId,
        ship_criteria: [{ check: "gates_pass" }],
      }),
    ]);
    const before = readFileSync(milestonesPath(root), "utf8");

    const r = runCli(root, ["ship", "v-gate", "--yes", "--gate-timeout", "750"]);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stdout + r.stderr, /slow-gate/);
    assert.match(r.stdout + r.stderr, /timed out/i);
    assert.match(r.stdout + r.stderr, /750/);
    assert.equal(readFileSync(milestonesPath(root), "utf8"), before);
    assert.equal(readMilestones(root)[0].status, "planned");

    rmSync(join(root, ".context-index", "governance"), { recursive: true, force: true });
  });

  it("with --yes proceeds and marks the milestone shipped", () => {
    seedMilestones(root, [
      milestoneEntry({ epic_id: epicId, ship_criteria: [{ confirm: "CHANGELOG updated" }] }),
    ]);

    const r = runCli(root, ["ship", "v1", "--yes"]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /manual/);
    // The epic id is read from the milestone record, not from the ship result.
    assert.match(r.stdout, new RegExp(`\\b${epicId}\\b`));
    assert.equal(readMilestones(root)[0].status, "shipped");
  });

  it("exits 1 with the error code when the milestone does not exist", () => {
    seedMilestones(root, [milestoneEntry({ epic_id: epicId })]);
    const r = runCli(root, ["ship", "no-such-milestone", "--yes"]);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /MILESTONE_NOT_FOUND/);
    assert.match(r.stderr, /no-such-milestone/);
  });
});

/**
 * The regression this guards: `lib/milestones.mjs` guards its confirm loop
 * with `confirms.length > 0 && options.confirmFn`, so OMITTING confirmFn
 * silently SHIPS. The outcome tests above catch the omission in the
 * without-`--yes` branch; they CANNOT catch it in the `--yes` branch, where a
 * missing callback and a callback returning true are observationally
 * identical. So assert the call site directly.
 *
 * `milestoneShip` is intercepted with `module.registerHooks()` — an in-process
 * loader hook that swaps the module source for a stub. No production seam:
 * `lib/milestones.mjs` and `lib/cli/issues-milestone.mjs` are both untouched
 * by this test, and the stub re-exports the real module (loaded under a
 * distinct `?real=1` URL) so every other binding the verb imports is genuine.
 */
describe("adev issues milestone ship — confirmFn call site", () => {
  let root;
  let hooks;

  const STUB_SOURCE = `
export * from ${JSON.stringify(MILESTONES_URL + "?real=1")};
export async function milestoneShip(projectRoot, name, options = {}) {
  const record = {
    name,
    confirmType: typeof options.confirmFn,
    hasIssueManager: Boolean(options.issueManager),
    confirmResolved: undefined,
  };
  (globalThis.__adevShipCalls ||= []).push(record);
  if (typeof options.confirmFn === "function") {
    record.confirmResolved = await options.confirmFn("CHANGELOG updated");
  }
  if (record.confirmResolved === false) {
    return {
      shipped: false,
      results: [{ confirm: "CHANGELOG updated", passed: null }],
      confirmRejected: "CHANGELOG updated",
    };
  }
  return { shipped: true, strategy: "manual", results: [] };
}
`;

  before(async () => {
    root = makeProject("adev-milestone-confirmfn-");
    const manager = getIssueManager(MANIFEST, root);
    const epicId = (await manager.createEpic({ title: "v1", milestone: "v1" })).id;
    seedMilestones(root, [
      milestoneEntry({ epic_id: epicId, ship_criteria: [{ confirm: "CHANGELOG updated" }] }),
    ]);
    globalThis.__adevShipCalls = [];
    hooks = registerHooks({
      load(url, context, nextLoad) {
        if (url !== MILESTONES_URL) return nextLoad(url, context);
        return { format: "module", shortCircuit: true, source: STUB_SOURCE };
      },
    });
  });

  after(() => {
    if (hooks) hooks.deregister();
    delete globalThis.__adevShipCalls;
    rmSync(root, { recursive: true, force: true });
  });

  it("always passes a confirmFn to milestoneShip — rejecting one without --yes", async () => {
    const mod = await import(VERB_URL);

    const refused = await mod.run({ projectRoot: root, argv: ["ship", "v1"], manifest: MANIFEST });
    assert.equal(globalThis.__adevShipCalls.length, 1);
    const withoutYes = globalThis.__adevShipCalls[0];
    assert.equal(withoutYes.confirmType, "function");
    assert.equal(withoutYes.confirmResolved, false);
    assert.equal(withoutYes.hasIssueManager, true);
    assert.equal(refused, 2);

    const shipped = await mod.run({
      projectRoot: root,
      argv: ["ship", "v1", "--yes"],
      manifest: MANIFEST,
    });
    assert.equal(globalThis.__adevShipCalls.length, 2);
    const withYes = globalThis.__adevShipCalls[1];
    assert.equal(withYes.confirmType, "function");
    assert.equal(withYes.confirmResolved, true);
    assert.equal(withYes.hasIssueManager, true);
    assert.equal(shipped, 0);
  });
});

describe("adev issues milestone create|list|defer", () => {
  let root;

  before(() => {
    root = makeProject("adev-milestone-crud-");
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("round-trips through .context-index/milestones.json", async () => {
    const created = runCli(root, [
      "create", "v1",
      "--target", "2026-12-31",
      "--strategy", "tag-only",
      "--check", "all_issues_closed",
      "--confirm", "CHANGELOG updated",
    ]);
    assert.equal(created.status, 0, created.stdout + created.stderr);

    const [entry] = readMilestones(root);
    assert.equal(entry.name, "v1");
    assert.equal(entry.status, "planned");
    assert.equal(entry.target_date, "2026-12-31");
    assert.deepEqual(entry.release, { strategy: "tag-only" });
    assert.deepEqual(entry.ship_criteria, [
      { check: "all_issues_closed" },
      { confirm: "CHANGELOG updated" },
    ]);
    assert.equal(typeof entry.epic_id, "string");

    // The epic is real and carries the milestone.
    const manager = getIssueManager(MANIFEST, root);
    const epics = await manager.listEpics();
    const epic = epics.find((e) => e.id === entry.epic_id);
    assert.ok(epic, `epic ${entry.epic_id} should exist on the board`);
    assert.equal(epic.milestone, "v1");

    const listed = runCli(root, ["list"]);
    assert.equal(listed.status, 0, listed.stdout + listed.stderr);
    assert.match(listed.stdout, /^\| Name \| Status \| Target Date \| Epic \| Progress \|$/m);
    assert.ok(
      listed.stdout.includes(`| v1 | planned | 2026-12-31 | ${entry.epic_id} | 0/0 open |`),
      listed.stdout,
    );

    const deferred = runCli(root, ["defer", "v1", "--reason", "slipped to Q3"]);
    assert.equal(deferred.status, 0, deferred.stdout + deferred.stderr);
    const [after] = readMilestones(root);
    assert.equal(after.status, "deferred");
    assert.equal(after.defer_reason, "slipped to Q3");
  });

  it("create is idempotent for an existing name (no second epic)", async () => {
    const first = runCli(root, ["create", "v2", "--target", "2027-01-31"]);
    assert.equal(first.status, 0, first.stdout + first.stderr);
    const firstEntry = readMilestones(root).find((m) => m.name === "v2");
    assert.equal(typeof firstEntry.epic_id, "string");

    const manager = getIssueManager(MANIFEST, root);
    const epicsBefore = (await manager.listEpics()).length;

    const second = runCli(root, ["create", "v2", "--target", "2027-02-28"]);
    assert.equal(second.status, 0, second.stdout + second.stderr);

    const entries = readMilestones(root).filter((m) => m.name === "v2");
    assert.equal(entries.length, 1);
    assert.equal(entries[0].epic_id, firstEntry.epic_id);
    assert.equal(entries[0].target_date, "2027-02-28");
    assert.equal((await manager.listEpics()).length, epicsBefore);
  });

  it("defer requires --reason and refuses a shipped milestone (ALREADY_SHIPPED)", () => {
    const noReason = runCli(root, ["defer", "v2"]);
    assert.equal(noReason.status, 1, noReason.stdout + noReason.stderr);
    assert.match(noReason.stderr, /^usage: adev issues milestone defer <name>/m);
    assert.equal(readMilestones(root).find((m) => m.name === "v2").status, "planned");

    const milestones = readMilestones(root);
    milestones.push(milestoneEntry({ name: "v0.9.0", status: "shipped" }));
    seedMilestones(root, milestones);

    const onShipped = runCli(root, ["defer", "v0.9.0", "--reason", "changed our mind"]);
    assert.equal(onShipped.status, 1, onShipped.stdout + onShipped.stderr);
    assert.match(onShipped.stderr, /ALREADY_SHIPPED/);
    assert.equal(readMilestones(root).find((m) => m.name === "v0.9.0").status, "shipped");
  });

  it("prints the empty-board line when no milestones are defined", () => {
    const empty = makeProject("adev-milestone-empty-");
    try {
      const r = runCli(empty, ["list"]);
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /^No milestones defined\./m);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("adev issues milestone help", () => {
  let root;

  before(() => {
    root = makeProject("adev-milestone-help-");
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("prints the milestone subcommand list for a bare --help", () => {
    const r = runCli(root, ["--help"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^usage: adev issues milestone <create\|list\|ship\|defer>/m);
  });

  it("routes --help to each second-level sub-verb's own usage", () => {
    const cases = [
      ["create", /^usage: adev issues milestone create <name>/m],
      ["list", /^usage: adev issues milestone list/m],
      ["ship", /^usage: adev issues milestone ship <name>/m],
      ["defer", /^usage: adev issues milestone defer <name>/m],
    ];
    for (const [sub, pattern] of cases) {
      const r = runCli(root, [sub, "--help"]);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, pattern);
      // The tell for a swallowed sub-verb help: the milestone subcommand list.
      assert.doesNotMatch(r.stdout, /^usage: adev issues milestone <create\|list\|ship\|defer>/m);
    }
  });
});
