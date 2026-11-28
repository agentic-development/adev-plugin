/**
 * GitHub-only cases recorded against the live fixture board, beside the shared
 * contract cases of contract-cases.mjs. They cover what only the github backend
 * has (sub-issue trees, epics as typed issues, the claim settle window and TTL
 * takeover between two agents, migration from a json board, setup on a project
 * GitHub has just created), so they run against no other backend.
 *
 * A case runs on a live context built by makeLiveContext(): the recorder builds it
 * on the recording `gh` spawn with real sleeps, the replay runner on the recorded
 * fixture with no-op sleeps, so both issue the same requests in the same order.
 * Every adapter a case makes shares the context's spawn, so a second agent's
 * requests land in the same fixture.
 *
 * A case that writes old IDs to the board derives them from `ctx.seed`, which the
 * recorder draws per recording and stores in the fixture: the live board keeps
 * every earlier recording's items, and two items with one Legacy ID would make
 * old-ID lookups ambiguous.
 *
 * Every title, body and note starts with `adev-fixture:`, as the fixture lint requires.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GithubAdapter } from "../../../lib/issues/github-adapter.mjs";
import { JsonAdapter } from "../../../lib/issues/json-adapter.mjs";
import { createTransport } from "../../../lib/issues/github/transport.mjs";
import { run as runMigrate } from "../../../lib/cli/issues-migrate.mjs";
import { run as runGithubVerb } from "../../../lib/cli/issues-github.mjs";
import { RECOMMENDED_BOARD } from "../../../lib/issues/github/setup.mjs";
import { FIXTURE_TEXT_PREFIX } from "./contract-cases.mjs";

const text = (s) => `${FIXTURE_TEXT_PREFIX} ${s}`;
const ids = (issues) => issues.map((i) => i.id);
const OWNER_A = "adev-fixture-agent-a";
const OWNER_B = "adev-fixture-agent-b";
const BRANCH = "adev-fixture/live";
const PR = "34";
const TTL_MINUTES = 240;
const MINUTE = 60_000;
const SOURCE_T0 = "2026-01-01T00:00:00.000Z";
const STATE_REL = join(".context-index", "tasks", ".migrate-state.json");

// The status options a project GitHub has just created does not carry: its Status
// field starts with Todo, In Progress and Done, and the default status_map needs these too.
const FRESH_PROJECT_MISSING_STATUS = ["Backlog", "Ready", "In Review", "Deferred"];

const FIXTURE_OWNER_QUERY = `query FixtureOwner($login: String!) {
  organization(login: $login) { id }
}
`;

// Not linked to the repository: adev never reads the link, and linking needs a
// repository permission the fixture token does not carry.
const FIXTURE_CREATE_PROJECT = `mutation FixtureCreateProject($ownerId: ID!, $title: String!) {
  createProjectV2(input: { ownerId: $ownerId, title: $title }) {
    projectV2 { id number url }
  }
}
`;

const FIXTURE_DELETE_PROJECT = `mutation FixtureDeleteProject($projectId: ID!) {
  deleteProjectV2(input: { projectId: $projectId }) { projectV2 { id } }
}
`;

const FIXTURE_STATUS_FIELD = `query FixtureStatusField($projectId: ID!) {
  node(id: $projectId) {
    ... on ProjectV2 { field(name: "Status") { ... on ProjectV2SingleSelectField { id } } }
  }
}
`;

// What the operator does by hand after setup on a new project. Setting the options
// replaces the field's whole option list, which is safe only while no item carries
// a Status value, so it runs only on a scratch project before anything is on it.
const FIXTURE_SET_STATUS_OPTIONS = `mutation FixtureSetStatusOptions($fieldId: ID!, $options: [ProjectV2SingleSelectFieldOptionInput!]) {
  updateProjectV2Field(input: { fieldId: $fieldId, singleSelectOptions: $options }) {
    projectV2Field { ... on ProjectV2SingleSelectField { options { name } } }
  }
}
`;

/**
 * The context a live case runs on.
 *
 * @param {{ exec: Function, env?: object, manifest: object, seed: number, now: number,
 *   sleep: (ms: number) => Promise<void> }} options - `exec` is the recording spawn or the
 *   replay stand-in; `sleep` is real while recording and a no-op on replay.
 * @returns {{ ctx: object, cleanup: () => void }}
 */
export function makeLiveContext({ exec, env = {}, manifest, seed, now, sleep }) {
  const dirs = [];
  const tempDir = () => {
    const dir = mkdtempSync(join(tmpdir(), "adev-live-fixture-"));
    dirs.push(dir);
    return dir;
  };
  const adapter = ({ now: at = now, sleep: wait = sleep, manifest: target = manifest } = {}) =>
    new GithubAdapter(tempDir(), target, { exec, env, now: () => at, sleep: wait });
  const transport = createTransport({ exec, env });
  const ctx = {
    manager: adapter(),
    adapter,
    request: (document, variables) => transport.request(document, variables),
    exec,
    env,
    manifest,
    seed,
    now,
    sleep,
    tempDir,
  };
  return { ctx, cleanup: () => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })) };
}

// A spawn that fails the `n`-th request of `operation` the way a dropped connection
// does, before it is sent, and passes every other request through.
function interruptAt(exec, operation, n) {
  let seen = 0;
  return function interrupted(cmd, args, opts) {
    const { query } = JSON.parse(opts.input);
    if (new RegExp(`^\\s*mutation\\s+${operation}\\b`).test(query) && ++seen === n) {
      throw Object.assign(new Error("adev-fixture: injected interruption"), {
        status: 1,
        stdout: "",
        stderr: "error connecting to api.github.com\ncheck your internet connection or https://githubstatus.com\n",
      });
    }
    return exec(cmd, args, opts);
  };
}

// A json board in `dir` holding one epic, a feature under it that depends on a
// task, and that task, under old IDs drawn from `seed`.
function seedJsonSource(dir, target, seed) {
  mkdirSync(join(dir, ".context-index", "tasks"), { recursive: true });
  const { project, repo } = target.tasks.github;
  writeFileSync(join(dir, ".context-index", "manifest.yaml"),
    `tasks:\n  backend: json\n  claim_ttl_minutes: ${TTL_MINUTES}\n  github:\n    project: ${project}\n    repo: ${repo}\n`);
  const epic = `e${seed}`;
  const ids = { epic, feature: `${epic}.f1`, task: `${epic}.f2` };
  const issue = (id, extra) => ({ id, status: "open", dependencies: [], notes: "", next_action: null, created: SOURCE_T0, updated: SOURCE_T0, ...extra });
  const board = {
    version: 2,
    seq: 0,
    epics: [{ id: ids.epic, title: text(`migrated epic ${seed}`), status: "open", notes: text("migrated epic body"), created: SOURCE_T0, updated: SOURCE_T0 }],
    issues: [
      issue(ids.feature, { title: text(`migrated feature ${seed}`), type: "feature", priority: 1, parent_id: ids.epic, dependencies: [ids.task], notes: text("migrated feature notes") }),
      issue(ids.task, { title: text(`migrated task ${seed}`), type: "task", priority: 2, parent_id: ids.epic }),
    ],
  };
  writeFileSync(join(dir, ".context-index", "tasks", "tasks.json"), `${JSON.stringify(board, null, 2)}\n`);
  return { ids, manifest: { tasks: { backend: "json", claim_ttl_minutes: TTL_MINUTES, github: { project, repo } } } };
}

// Run `adev issues migrate --from json --to github --yes` in `dir`, quietly.
async function migrate(ctx, dir, manifest, exec = ctx.exec) {
  const lines = [];
  const original = { error: console.error, log: console.log };
  console.error = (...a) => lines.push(a.join(" "));
  console.log = (...a) => lines.push(a.join(" "));
  try {
    const code = await runMigrate({
      projectRoot: dir,
      argv: ["--from", "json", "--to", "github", "--yes"],
      manifest,
      exec,
      isTTY: false,
      sleep: ctx.sleep,
      now: () => ctx.now,
      log: (s) => lines.push(String(s)),
    });
    return { code, output: lines.join("\n") };
  } finally {
    console.error = original.error;
    console.log = original.log;
  }
}

// Every item on the board, issues and epics, as one adapter reads it.
async function wholeBoard(m) {
  return [...(await m.listEpics()), ...(await m.list())];
}

// Run `adev issues github setup <flags> --json` against `manifest`'s project.
async function setup(ctx, manifest, ...flags) {
  const out = [];
  const err = [];
  const code = await runGithubVerb({
    argv: ["setup", ...flags, "--json"],
    manifest,
    exec: ctx.exec,
    env: ctx.env,
    isTTY: false,
    log: (s) => out.push(String(s)),
    error: (s) => err.push(String(s)),
  });
  return { code, result: out.length > 0 ? JSON.parse(out.at(-1)) : null, stderr: err.join("\n") };
}

// Run `fn` on a project created for it in the fixture org, with a github manifest
// that targets it, and delete the project afterwards whatever `fn` does. The
// issues `fn` creates stay in the repository.
async function withScratchProject(ctx, title, fn) {
  const { repo } = ctx.manifest.tasks.github;
  const [owner] = repo.split("/");
  const org = ctx.request(FIXTURE_OWNER_QUERY, { login: owner }).organization;
  const project = ctx.request(FIXTURE_CREATE_PROJECT, { ownerId: org.id, title: text(title) }).createProjectV2.projectV2;
  try {
    const manifest = { tasks: { backend: "github", claim_ttl_minutes: TTL_MINUTES, github: { project: project.url, repo } } };
    return await fn({ project, manifest });
  } finally {
    ctx.request(FIXTURE_DELETE_PROJECT, { projectId: project.id });
  }
}

// Give a scratch project the Status options adev's default status_map needs, as
// the operator does after setup.
function addStatusOptions(ctx, project) {
  const field = ctx.request(FIXTURE_STATUS_FIELD, { projectId: project.id }).node.field;
  const options = RECOMMENDED_BOARD.statusOptions.map((name) => ({ name, color: "GRAY", description: "" }));
  return ctx.request(FIXTURE_SET_STATUS_OPTIONS, { fieldId: field.id, options }).updateProjectV2Field.projectV2Field.options.map((o) => o.name);
}

// A scratch project set up the way an operator finishes it: setup --yes, then the
// missing Status options by hand, and setup --check passing.
async function withReadyProject(ctx, title, fn) {
  return withScratchProject(ctx, title, async ({ project, manifest }) => {
    const applied = await setup(ctx, manifest, "--yes");
    assert.equal(applied.code, 0, applied.stderr);
    addStatusOptions(ctx, project);
    const check = await setup(ctx, manifest, "--check");
    assert.equal(check.code, 0, check.stderr);
    return fn({ project, manifest });
  });
}

/** @type {ReadonlyArray<{ name: string, run: (ctx: object) => Promise<void> }>} */
export const GITHUB_LIVE_CASES = Object.freeze([
  {
    name: "github: walkTree returns a three-level sub-issue tree, and another agent reads the parent links at once",
    async run(ctx) {
      const m = ctx.manager;
      const parent = await m.create({ title: text("tree parent") });
      const child = await m.create({ title: text("tree child"), parent_id: parent.id });
      const grandchild = await m.create({ title: text("tree grandchild"), parent_id: child.id });
      assert.equal(child.parent_id, parent.id);
      assert.equal(grandchild.parent_id, child.id);

      assert.deepEqual(ids(await m.walkTree(parent.id)), [child.id, grandchild.id].sort());
      assert.deepEqual(ids(await m.walkTree(child.id)), [grandchild.id]);

      const other = ctx.adapter();
      assert.equal((await other.get(child.id)).parent_id, parent.id);
      assert.equal((await other.get(grandchild.id)).parent_id, child.id);
    },
  },
  {
    name: "github: closing a parent with an open sub-issue is refused with CASCADE_BLOCKED, and succeeds once it is closed",
    async run(ctx) {
      const m = ctx.manager;
      const parent = await m.create({ title: text("cascade parent") });
      const child = await m.create({ title: text("cascade child"), parent_id: parent.id });
      await assert.rejects(m.close(parent.id, text("too early")), (err) => {
        assert.equal(err.code, "CASCADE_BLOCKED");
        assert.deepEqual(err.blockers, [child.id]);
        return true;
      });
      assert.equal((await m.get(parent.id)).status, "open");

      await m.close(child.id, text("child done"));
      await m.close(parent.id, text("parent done"));
      assert.equal((await m.get(parent.id)).status, "closed");
    },
  },
  {
    name: "github: an epic is created, listed apart from issues, updated, and walks to its sub-issues",
    async run(ctx) {
      const m = ctx.manager;
      const epic = await m.createEpic({ title: text("epic"), notes: text("epic body") });
      assert.equal(epic.type, "epic");
      const member = await m.create({ title: text("epic member"), parent_id: epic.id });
      assert.equal(member.parent_id, epic.id);

      const epics = (await m.listEpics()).map((i) => i.id);
      const issues = (await m.list()).map((i) => i.id);
      assert.ok(epics.includes(epic.id), "listEpics includes the epic");
      assert.ok(!epics.includes(member.id), "listEpics excludes its member issue");
      assert.ok(issues.includes(member.id), "list includes the member issue");
      assert.ok(!issues.includes(epic.id), "list excludes the epic");

      const renamed = await m.updateEpic(epic.id, { title: text("epic renamed") });
      assert.equal(renamed.title, text("epic renamed"));
      const read = await ctx.adapter().get(epic.id);
      assert.equal(read.title, text("epic renamed"));
      assert.equal(read.type, "epic");

      assert.deepEqual(ids(await m.walkTree(epic.id)), [member.id]);
      await assert.rejects(m.updateEpic(member.id, { title: text("not an epic") }), { code: "NOT_FOUND" });
    },
  },
  {
    name: "github: a claim taken over during its settle wait reports the winner and writes no branch or pr",
    async run(ctx) {
      const created = await ctx.manager.create({ title: text("settle race") });
      let raced = false;
      const rival = ctx.adapter();
      const loser = ctx.adapter({
        sleep: async (ms) => {
          await ctx.sleep(ms);
          if (raced) return;
          raced = true;
          // Another agent that read the item before the loser's write lands its own claim.
          await rival.release(created.id, OWNER_B, { force: true });
          await rival.claim(created.id, OWNER_B);
        },
      });

      await assert.rejects(loser.claim(created.id, OWNER_A, { branch: BRANCH, pr: PR }), (err) => {
        assert.equal(err.code, "ISSUE_ALREADY_CLAIMED");
        assert.equal(err.owner, OWNER_B);
        return true;
      });
      assert.ok(raced, "the rival claimed during the settle wait");

      const read = await ctx.adapter().get(created.id);
      assert.equal(read.owner, OWNER_B);
      assert.equal(read.branch ?? null, null);
      assert.equal(read.pr ?? null, null);
    },
  },
  {
    name: "github: a claim past the lease TTL takes over and reports the previous holder",
    async run(ctx) {
      const created = await ctx.manager.create({ title: text("expired lease") });
      const first = await ctx.adapter({ now: ctx.now }).claim(created.id, OWNER_A);
      const later = ctx.now + (TTL_MINUTES + 1) * MINUTE;

      await assert.rejects(ctx.adapter({ now: ctx.now + MINUTE }).claim(created.id, OWNER_B), { code: "ISSUE_ALREADY_CLAIMED", owner: OWNER_A });

      const taken = await ctx.adapter({ now: later }).claim(created.id, OWNER_B);
      assert.equal(taken.owner, OWNER_B);
      assert.equal(taken.claimed_at, new Date(later).toISOString());
      assert.deepEqual(taken.takeover, { previous_owner: OWNER_A, previous_claimed_at: first.claimed_at, ttl_minutes: TTL_MINUTES });

      const read = await ctx.adapter().get(created.id);
      assert.equal(read.owner, OWNER_B);
      assert.equal(read.claimed_at, taken.claimed_at);
    },
  },
  {
    name: "github: migrate from json recreates the epic, sub-issues and dependency, and old IDs resolve at once",
    run: (ctx) => withReadyProject(ctx, "migration target", async ({ manifest: target }) => {
      const dir = ctx.tempDir();
      const { ids: source, manifest } = seedJsonSource(dir, target, ctx.seed);
      const { code, output } = await migrate(ctx, dir, manifest);
      assert.equal(code, 0, output);

      const m = ctx.adapter({ manifest: target });
      const epic = await m.get(source.epic);
      const feature = await m.get(source.feature);
      const task = await m.get(source.task);
      for (const [old, item] of [[source.epic, epic], [source.feature, feature], [source.task, task]]) {
        assert.ok(item, `old ID ${old} resolves`);
        assert.equal(item.legacy_id, old);
        assert.match(item.id, /^gh-\d+$/);
      }
      assert.equal(epic.type, "epic");
      assert.equal(feature.parent_id, epic.id);
      assert.equal(task.parent_id, epic.id);
      assert.deepEqual(feature.dependencies, [task.id]);
      assert.equal(feature.priority, 1);
      assert.equal(feature.notes, text("migrated feature notes"));
      assert.deepEqual(ids(await m.walkTree(epic.id)), [feature.id, task.id].sort());

      await assert.rejects(new JsonAdapter(dir).create({ title: text("after migration") }), { code: "BOARD_READ_ONLY_MIGRATED" });
    }),
  },
  {
    name: "github: a migration interrupted after its first item and re-run without its state file creates no duplicates",
    run: (ctx) => withReadyProject(ctx, "interrupted migration target", async ({ manifest: target }) => {
      const dir = ctx.tempDir();
      const { ids: source, manifest } = seedJsonSource(dir, target, ctx.seed);
      const first = await migrate(ctx, dir, manifest, interruptAt(ctx.exec, "CreateIssue", 2));
      assert.notEqual(first.code, 0, "the interrupted run fails");
      rmSync(join(dir, STATE_REL), { force: true });
      assert.equal(existsSync(join(dir, STATE_REL)), false);

      const second = await migrate(ctx, dir, manifest);
      assert.equal(second.code, 0, second.output);

      const old = Object.values(source).sort();
      const board = await wholeBoard(ctx.adapter({ manifest: target }));
      assert.deepEqual(board.map((i) => i.legacy_id).sort(), old, "each old ID is on the project exactly once, and nothing else is");
    }),
  },
  {
    name: "github: setup --yes on a project GitHub has just created adds every adev field and leaves the missing Status options to the operator",
    run: (ctx) => withScratchProject(ctx, "setup scratch", async ({ project, manifest }) => {
      const status = (report) => report.fields.find((f) => f.name === "Status");

      const before = await setup(ctx, manifest, "--check");
      assert.equal(before.code, 1, before.stderr);
      assert.equal(status(before.result).status, "ok", "a new project already has a Status field");

      const applied = await setup(ctx, manifest, "--yes");
      assert.equal(applied.code, 0, applied.stderr);
      assert.equal(applied.result.ok, true);
      assert.ok(!applied.result.created.includes("Status"), "setup never recreates Status");
      assert.ok(applied.result.created.length > 0);
      const skipped = applied.result.skipped.find((s) => s.name === "Status");
      assert.equal(skipped?.reason, "options missing");
      assert.deepEqual([...skipped.options].sort(), [...FRESH_PROJECT_MISSING_STATUS].sort());

      const after = await setup(ctx, manifest, "--check");
      assert.equal(after.code, 1, "the missing Status options still fail the check");
      for (const field of after.result.fields) assert.equal(field.status, "ok", `${field.name} is ${field.status}`);
      const missing = status(after.result).options.filter((o) => o.status === "missing").map((o) => o.name);
      assert.deepEqual(missing.sort(), [...FRESH_PROJECT_MISSING_STATUS].sort());

      const again = await setup(ctx, manifest, "--yes");
      assert.equal(again.code, 0, again.stderr);
      assert.deepEqual(again.result.created, [], "a second setup creates nothing");

      addStatusOptions(ctx, project);
      const finished = await setup(ctx, manifest, "--check");
      assert.equal(finished.code, 0, `once the operator adds the Status options the check passes: ${finished.stderr}`);
    }),
  },
]);
