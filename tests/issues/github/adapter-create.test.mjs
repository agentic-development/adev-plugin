import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { accessSync, constants, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { GithubAdapter } from "../../../lib/issues/github-adapter.mjs";
import { GITHUB_ERROR_CODES } from "../../../lib/issues/github/errors.mjs";
import * as mutations from "../../../lib/issues/github/mutations.mjs";
import { replayExec } from "./replay-transport.mjs";
import { writes, LABEL_IDS, ISSUE_TYPE_IDS, STATUS_OPTION_IDS, TEXT_FIELD_IDS, INJECTION, NUMBER_PRIORITY_FIELD_ID, RATE_RESET_AT } from "./fixtures/writes.mjs";
import { createTempDir, cleanupTempDir } from "../../helpers.mjs";

// Every adapter's storage root is created here and removed when the file's tests finish.
const tempDirs = [];
function tempDir() {
  const dir = createTempDir();
  tempDirs.push(dir);
  return dir;
}
after(() => {
  for (const dir of tempDirs) cleanupTempDir(dir);
});

const manifest = { tasks: { backend: "github", github: { project: "https://github.com/orgs/acme/projects/7", repo: "acme/board" } } };

// Preflight and the parent/dependency lookup are reads; the write sequence is the mutations.
const isMutation = (c) => /^\s*mutation\b/.test(c.query);
const mutationOps = (exec) => exec.calls.filter(isMutation).map((c) => c.operation);
const countOf = (exec, op) => exec.calls.filter((c) => c.operation === op).length;
function callOf(exec, op) {
  const found = exec.calls.filter((c) => c.operation === op);
  assert.equal(found.length, 1, `exactly one ${op} request`);
  return found[0];
}

test("create writes the recorded sequence and returns the read-back item", async () => {
  const exec = replayExec(writes.createWithParent);
  const a = new GithubAdapter("/tmp/unused", manifest, { exec });
  const item = await a.create({ title: "adev-fixture: t", notes: "@/etc/passwd", parent_id: "gh-1", spec_ref: "x.spec.md", affected_modules: ["lib"] });
  assert.equal(item.id, "gh-300");
  assert.deepEqual(mutationOps(exec), ["CreateIssue", "AddToProject", "SetFields", "AddSubIssue", "AddLabels"]);
  assert.equal(exec.calls.at(-1).operation, "ProjectItem");
  assert.equal(callOf(exec, "CreateIssue").variables.body, "@/etc/passwd");
  assert.ok(exec.calls.every((c) => !/assignee/i.test(c.query)));
});

test("unresolvable parent or dependency is refused before any issue is created", async () => {
  const exec = replayExec(writes.boardWithoutParent);
  const a = new GithubAdapter(tempDir(), manifest, { exec });
  await assert.rejects(a.create({ title: "adev-fixture: t", parent_id: "gh-404" }), { code: "PARENT_NOT_FOUND" });
  await assert.rejects(a.create({ title: "adev-fixture: t", dependencies: ["gh-405"] }), { code: "NOT_FOUND" });
  assert.equal(exec.calls.filter((c) => c.operation === "CreateIssue").length, 0);
});

test("type_source branches and Epic milestone", async () => {
  const viaTypes = replayExec(writes.createTypedIssueTypes);
  await new GithubAdapter(tempDir(), { tasks: { ...manifest.tasks, github: { ...manifest.tasks.github, type_source: "issue_types" } } }, { exec: viaTypes }).create({ title: "adev-fixture: b", type: "bug" });
  assert.ok(viaTypes.calls.some((c) => c.operation === "SetIssueType"));
  const viaLabels = replayExec(writes.createTypedLabels);
  await new GithubAdapter(tempDir(), { tasks: { ...manifest.tasks, github: { ...manifest.tasks.github, type_source: "labels" } } }, { exec: viaLabels }).create({ title: "adev-fixture: b", type: "bug" });
  assert.ok(viaLabels.calls.some((c) => c.operation === "AddLabels" && c.variables.labelIds.includes(LABEL_IDS["type:bug"])));
  const epic = replayExec(writes.createEpicWithMilestone);
  await new GithubAdapter(tempDir(), manifest, { exec: epic }).createEpic({ title: "adev-fixture: e", milestone: "v1" });
  assert.ok(epic.calls.some((c) => c.operation === "SetMilestone"));
});

test("planTask is refused; partial create keeps the issue and reports unwritten fields", async () => {
  const a = new GithubAdapter("/tmp/unused", manifest, { exec: replayExec(writes.partial) });
  await assert.rejects(a.create({ title: "t", planRef: "p.md", planTask: 3 }), { code: "BOARD_GRANULARITY_VIOLATION" });
  await assert.rejects(a.create({ title: "adev-fixture: t", next_action: "Run /adev:plan" }),
    (e) => e.code === "GITHUB_PARTIAL_CREATE" && e.id === "gh-301" && e.unwritten.includes("next_action"));
});

// ---------------------------------------------------------------------------
// Added cases (thorough depth): BEH-13, BEH-14, BEH-15, BEH-19, BEH-40, RI-1.
// ---------------------------------------------------------------------------

const withGithub = (github, extra = {}) => ({ ...extra, tasks: { ...manifest.tasks, github: { ...manifest.tasks.github, ...github } } });
const withModules = { ...manifest, modules: [{ slug: "lib" }, { slug: "docs" }] };
const READ_BACK_AT = "2026-11-26T08:00:00Z";
const LABEL_NAMES = new Map(Object.entries(LABEL_IDS).map(([name, id]) => [id, name]));
const ADEV_LABEL = /^(?:type:.+|priority:[0-4]|epic|module:.+)$/;

function adapter(fx, m = manifest) {
  const exec = replayExec(fx);
  return { a: new GithubAdapter(tempDir(), m, { exec }), exec };
}

test("error codes: the write path's codes are registered", () => {
  assert.equal(GITHUB_ERROR_CODES.GITHUB_PARTIAL_CREATE, "GITHUB_PARTIAL_CREATE");
  assert.equal(GITHUB_ERROR_CODES.GITHUB_WRITE_FAILED, "GITHUB_WRITE_FAILED");
});

test("mutations: every document is a named mutation that never touches assignees", () => {
  const documents = ["CREATE_ISSUE", "ADD_TO_PROJECT", "ADD_SUB_ISSUE", "ADD_BLOCKED_BY", "ADD_LABELS", "SET_ISSUE_TYPE", "SET_MILESTONE"];
  for (const name of documents) {
    assert.equal(typeof mutations[name], "string", name);
    assert.match(mutations[name], /^\s*mutation [A-Za-z_][A-Za-z0-9_]*\b/, name);
    assert.doesNotMatch(mutations[name], /assignee/i, name);
    assert.doesNotMatch(mutations[name], /removeLabels/i, name);
  }
});

test("mutations: setFieldsDocument depends only on the slot kinds and aliases one write per slot", () => {
  const doc = mutations.setFieldsDocument(["single_select", "text", "text"]);
  assert.equal(doc, mutations.setFieldsDocument(["single_select", "text", "text"]));
  assert.notEqual(doc, mutations.setFieldsDocument(["single_select", "text"]));
  assert.match(doc, /^\s*mutation SetFields\(/);
  for (const v of ["$projectId", "$itemId", "$f0Field", "$f0Value", "$f1Field", "$f1Value", "$f2Field", "$f2Value"]) assert.ok(doc.includes(v), v);
  assert.ok(!doc.includes("$f3Field"));
  assert.equal(doc.match(/\bf\d+\s*:\s*updateProjectV2ItemFieldValue\b/g).length, 3);
  assert.doesNotMatch(doc, /assignee/i);
});

test("create: every BEH-13 field is written once, in one SetFields request, and the item is read back", async () => {
  const { a, exec } = adapter(writes.createFull, withModules);
  const item = await a.create({
    title: "adev-fixture: full",
    notes: "adev-fixture: body",
    status: "deferred",
    priority: 1,
    type: "feature",
    next_action: "Write the RED tests",
    spec_ref: "specs/a.spec.md",
    planRef: "plans/a.md",
    branch: "feat/a",
    pr: "#12",
    parent_id: "gh-1",
    dependencies: ["gh-2", "#3"],
    affected_modules: ["lib", "docs"],
  });
  assert.deepEqual(mutationOps(exec), ["CreateIssue", "AddToProject", "SetFields", "AddSubIssue", "AddBlockedBy", "AddBlockedBy", "AddLabels", "SetIssueType"]);
  assert.equal(exec.calls.findIndex(isMutation), exec.calls.findIndex((c) => c.operation === "CreateIssue"));
  assert.equal(exec.calls.at(-1).operation, "ProjectItem");
  assert.deepEqual(callOf(exec, "AddLabels").variables.labelIds, [LABEL_IDS["module:lib"], LABEL_IDS["module:docs"]]);
  assert.equal(callOf(exec, "SetIssueType").variables.issueTypeId, ISSUE_TYPE_IDS.feature);

  assert.equal(item.id, "gh-320");
  assert.equal(item.title, "adev-fixture: full");
  assert.equal(item.notes, "adev-fixture: body");
  assert.equal(item.status, "deferred");
  assert.equal(item.priority, 1);
  assert.equal(item.type, "feature");
  assert.equal(item.next_action, "Write the RED tests");
  assert.equal(item.spec_ref, "specs/a.spec.md");
  assert.equal(item.planRef, "plans/a.md");
  assert.equal(item.branch, "feat/a");
  assert.equal(item.pr, "#12");
  assert.equal(item.parent_id, "gh-1");
  assert.deepEqual(item.dependencies, ["gh-2", "gh-3"]);
  assert.deepEqual(item.affected_modules, ["lib", "docs"]);
  assert.equal(item.created, READ_BACK_AT);
});

test("create: status defaults to open and is written as the status_map write option", async () => {
  const { a, exec } = adapter(writes.createPlain);
  const item = await a.create({ title: "adev-fixture: plain" });
  assert.deepEqual(mutationOps(exec), ["CreateIssue", "AddToProject", "SetFields"]);
  assert.equal(callOf(exec, "SetFields").variables.f0Value, STATUS_OPTION_IDS.Backlog);
  assert.equal(callOf(exec, "CreateIssue").variables.body, "");
  assert.equal(item.id, "gh-304");
  assert.equal(item.status, "open");
});

test("create: a custom status_map writes its first open option", async () => {
  const m = withGithub({ status_map: { open: ["Ready", "Backlog"], in_progress: ["In Progress", "In Review"], deferred: ["Deferred"], closed: ["Done"] } });
  const { a, exec } = adapter(writes.createCustomStatusMap, m);
  const item = await a.create({ title: "adev-fixture: s" });
  assert.equal(callOf(exec, "SetFields").variables.f0Value, STATUS_OPTION_IDS.Ready);
  assert.equal(item.status, "open");
});

test("create: without a Priority field, priority is written as a priority: label", async () => {
  const { a, exec } = adapter(writes.createPriorityFallback);
  const item = await a.create({ title: "adev-fixture: p", priority: 1 });
  assert.deepEqual(mutationOps(exec), ["CreateIssue", "AddToProject", "SetFields", "AddLabels"]);
  assert.deepEqual(callOf(exec, "AddLabels").variables.labelIds, [LABEL_IDS["priority:1"]]);
  assert.equal(Object.keys(callOf(exec, "SetFields").variables).filter((k) => /^f\d+Field$/.test(k)).length, 1);
  assert.equal(item.priority, 1);
});

test("create: label typing writes type:<t> and no issue type; issue typing writes the issue type and no type: label", async () => {
  const labels = adapter(writes.createTypedLabels, withGithub({ type_source: "labels" }));
  const viaLabels = await labels.a.create({ title: "adev-fixture: b", type: "bug" });
  assert.deepEqual(mutationOps(labels.exec), ["CreateIssue", "AddToProject", "SetFields", "AddLabels"]);
  assert.equal(viaLabels.type, "bug");

  const types = adapter(writes.createTypedIssueTypes, withGithub({ type_source: "issue_types" }));
  const viaTypes = await types.a.create({ title: "adev-fixture: b", type: "bug" });
  assert.deepEqual(mutationOps(types.exec), ["CreateIssue", "AddToProject", "SetFields", "SetIssueType"]);
  assert.equal(callOf(types.exec, "SetIssueType").variables.issueTypeId, ISSUE_TYPE_IDS.bug);
  assert.equal(viaTypes.id, "gh-310");
  assert.equal(viaTypes.type, "bug");
});

test("createEpic: issue typing sets the Epic type and the milestone, and returns the read-back epic", async () => {
  const { a, exec } = adapter(writes.createEpicWithMilestone);
  const epic = await a.createEpic({ title: "adev-fixture: e", milestone: "v1" });
  assert.deepEqual(mutationOps(exec), ["CreateIssue", "AddToProject", "SetFields", "SetIssueType", "SetMilestone"]);
  assert.equal(callOf(exec, "SetIssueType").variables.issueTypeId, ISSUE_TYPE_IDS.epic);
  assert.equal(epic.id, "gh-302");
  assert.equal(epic.type, "epic");
  assert.equal(epic.milestone, "v1");
});

test("createEpic: an owner without issue types gets the epic label and no issue type", async () => {
  const { a, exec } = adapter(writes.createEpicLabels);
  const epic = await a.createEpic({ title: "adev-fixture: le", planRef: "plans/p.md" });
  assert.deepEqual(mutationOps(exec), ["CreateIssue", "AddToProject", "SetFields", "AddLabels"]);
  assert.deepEqual(callOf(exec, "AddLabels").variables.labelIds, [LABEL_IDS.epic]);
  assert.equal(epic.id, "gh-324");
  assert.equal(epic.type, "epic");
  assert.equal(epic.planRef, "plans/p.md");
});

test("create: caller values travel byte-for-byte as variables and never appear in a document", async () => {
  const { a, exec } = adapter(writes.createInjection);
  const item = await a.create({ title: INJECTION.title, notes: INJECTION.notes, next_action: INJECTION.next_action });
  const create = callOf(exec, "CreateIssue");
  assert.equal(create.variables.title, INJECTION.title);
  assert.equal(create.variables.body, INJECTION.notes);
  assert.equal(callOf(exec, "SetFields").variables.f1Value, INJECTION.next_action);
  for (const c of exec.calls) {
    for (const value of Object.values(INJECTION)) assert.ok(!c.query.includes(value), `${c.operation} document carries a caller value`);
    assert.ok(!c.query.includes("/etc/"), c.operation);
  }
  assert.equal(item.title, INJECTION.title);
  assert.equal(item.notes, INJECTION.notes);
});

test("create: only CreateIssue carries title or body, and every added label is in an adev-owned family", async () => {
  const cases = [
    [writes.createFull, withModules, { title: "adev-fixture: full", notes: "adev-fixture: body", status: "deferred", priority: 1, type: "feature", next_action: "Write the RED tests", spec_ref: "specs/a.spec.md", planRef: "plans/a.md", branch: "feat/a", pr: "#12", parent_id: "gh-1", dependencies: ["gh-2", "#3"], affected_modules: ["lib", "docs"] }],
    [writes.createTypedLabels, withGithub({ type_source: "labels" }), { title: "adev-fixture: b", type: "bug" }],
    [writes.createPriorityFallback, manifest, { title: "adev-fixture: p", priority: 1 }],
  ];
  for (const [fx, m, payload] of cases) {
    const { a, exec } = adapter(fx, m);
    await a.create(payload);
    assert.deepEqual(exec.calls.filter((c) => "title" in c.variables || "body" in c.variables).map((c) => c.operation), ["CreateIssue"]);
    const added = exec.calls.filter((c) => c.operation === "AddLabels").flatMap((c) => c.variables.labelIds);
    assert.ok(added.length > 0);
    for (const id of added) assert.match(LABEL_NAMES.get(id), ADEV_LABEL);
    assert.ok(exec.calls.every((c) => !/assignee|removeLabels/i.test(c.query)));
  }
});

for (const [name, payload, field] of [
  ["a multi-line next_action", { next_action: "line one\nline two" }, "next_action"],
  ["a next_action with a leading YAML indicator", { next_action: "# heading" }, "next_action"],
  ["a spec_ref escaping the repository", { spec_ref: "../escape.spec.md" }, "spec_ref"],
  ["an absolute planRef", { planRef: "/abs/plan.md" }, "planRef"],
  ["a branch git refuses", { branch: "feat/x..y" }, "branch"],
  ["a pr that is not a number or pull URL", { pr: "pull twelve" }, "pr"],
  ["a type that is not a slug", { type: "Bug Fix" }, "type"],
  ["duplicate affected_modules", { affected_modules: ["lib", "lib"] }, "affected_modules"],
]) {
  test(`create refuses ${name} before any request is sent`, async () => {
    const { a, exec } = adapter([]);
    await assert.rejects(a.create({ title: "adev-fixture: v", ...payload }), { code: "GITHUB_INVALID_FIELD_VALUE", field });
    assert.equal(exec.calls.length, 0);
  });
}

test("createEpic refuses a multi-line milestone before any request is sent", async () => {
  const { a, exec } = adapter([]);
  await assert.rejects(a.createEpic({ title: "adev-fixture: e", milestone: "v1\nv2" }), { code: "GITHUB_INVALID_FIELD_VALUE", field: "milestone" });
  assert.equal(exec.calls.length, 0);
});

test("create refuses a missing title and planTask before any request is sent", async () => {
  const { a, exec } = adapter([]);
  await assert.rejects(a.create({ notes: "adev-fixture: no title" }), { code: "MISSING_REQUIRED_FIELD" });
  await assert.rejects(a.create({ title: "adev-fixture: t", planTask: 3 }), { code: "BOARD_GRANULARITY_VIOLATION" });
  assert.equal(exec.calls.length, 0);
});

test("create refuses a parent that is not a GitHub issue reference without creating anything", async () => {
  const { a, exec } = adapter(writes.boardWithoutParent);
  await assert.rejects(a.create({ title: "adev-fixture: t", parent_id: "https://gitlab.com/acme/board/issues/1" }), { code: "GITHUB_INVALID_ID" });
  assert.deepEqual(mutationOps(exec), []);
});

test("create: GitHub rejecting CreateIssue throws GITHUB_WRITE_FAILED with GitHub's reason; nothing else is sent", async () => {
  const { a, exec } = adapter(writes.createRejected);
  await assert.rejects(a.create({ title: "adev-fixture: rejected" }), (e) => {
    assert.equal(e.code, "GITHUB_WRITE_FAILED");
    assert.match(e.message, /Title is too long/);
    return true;
  });
  assert.deepEqual(mutationOps(exec), ["CreateIssue"]);
});

test("create: a rate limit on CreateIssue surfaces as GITHUB_RATE_LIMITED", async () => {
  const { a, exec } = adapter(writes.createRateLimited);
  await assert.rejects(a.create({ title: "adev-fixture: limited" }), { code: "GITHUB_RATE_LIMITED" });
  assert.deepEqual(mutationOps(exec), ["CreateIssue"]);
});

test("partial create: stops at the failed step, never deletes or closes, and names exactly the unwritten fields", async () => {
  const { a, exec } = adapter(writes.partial);
  await assert.rejects(a.create({ title: "adev-fixture: t", next_action: "Run /adev:plan" }), (e) => {
    assert.equal(e.code, "GITHUB_PARTIAL_CREATE");
    assert.equal(e.id, "gh-301");
    assert.deepEqual([...e.unwritten].sort(), ["next_action", "status"]);
    assert.match(e.message, /gh-301/);
    return true;
  });
  assert.deepEqual(mutationOps(exec), ["CreateIssue", "AddToProject", "SetFields"]);
  assert.equal(exec.calls.at(-1).operation, "SetFields");
  assert.ok(exec.calls.every((c) => !/delete|close/i.test(c.operation ?? "")));
});

test("partial create: a failed AddToProject reports the project membership and every project field unwritten", async () => {
  const { a, exec } = adapter(writes.partialAtProject);
  await assert.rejects(a.create({ title: "adev-fixture: np", next_action: "Run /adev:plan", spec_ref: "x.spec.md" }), (e) => {
    assert.equal(e.code, "GITHUB_PARTIAL_CREATE");
    assert.equal(e.id, "gh-332");
    // The issue is off the project, so board reads cannot find it: being added comes first.
    assert.deepEqual(e.unwritten, ["project", "status", "next_action", "spec_ref"]);
    assert.match(e.message, /add gh-332 to the project/i);
    assert.ok(e.message.includes("https://github.com/orgs/acme/projects/7"), e.message);
    return true;
  });
  assert.deepEqual(mutationOps(exec), ["CreateIssue", "AddToProject"]);
});

test("partial create: a failed AddLabels reports only affected_modules unwritten", async () => {
  const { a, exec } = adapter(writes.partialAtLabels, withModules);
  await assert.rejects(a.create({ title: "adev-fixture: nl", parent_id: "gh-1", spec_ref: "x.spec.md", affected_modules: ["lib"] }), (e) => {
    assert.equal(e.code, "GITHUB_PARTIAL_CREATE");
    assert.equal(e.id, "gh-333");
    assert.deepEqual(e.unwritten, ["affected_modules"]);
    return true;
  });
  assert.deepEqual(mutationOps(exec), ["CreateIssue", "AddToProject", "SetFields", "AddSubIssue", "AddLabels"]);
});

test("partial createEpic: a failed milestone write raises GITHUB_PARTIAL_CREATE naming milestone", async () => {
  const { a } = adapter(writes.epicPartial);
  await assert.rejects(a.createEpic({ title: "adev-fixture: e", milestone: "v1" }), (e) => {
    assert.equal(e.code, "GITHUB_PARTIAL_CREATE");
    assert.equal(e.id, "gh-303");
    assert.deepEqual(e.unwritten, ["milestone"]);
    return true;
  });
});

test("create and partial create both invalidate the cached board", async () => {
  const ok = adapter(writes.createPlain);
  await ok.a.list();
  await ok.a.create({ title: "adev-fixture: plain" });
  const afterCreate = countOf(ok.exec, "ProjectItems");
  await ok.a.list();
  assert.equal(countOf(ok.exec, "ProjectItems"), afterCreate + 1);

  const partial = adapter(writes.partial);
  await partial.a.list();
  await assert.rejects(partial.a.create({ title: "adev-fixture: t", next_action: "Run /adev:plan" }), { code: "GITHUB_PARTIAL_CREATE" });
  const afterPartial = countOf(partial.exec, "ProjectItems");
  await partial.a.list();
  assert.equal(countOf(partial.exec, "ProjectItems"), afterPartial + 1);
});

test("updateEpic writes only the changed milestone and returns the read-back epic", async () => {
  const { a, exec } = adapter(writes.updateEpic);
  const epic = await a.updateEpic("gh-1", { milestone: "v2" });
  assert.deepEqual(mutationOps(exec), ["SetMilestone"]);
  assert.equal(exec.calls.at(-1).operation, "ProjectItem");
  assert.ok(exec.calls.every((c) => !("title" in c.variables) && !("body" in c.variables)));
  assert.equal(epic.id, "gh-1");
  assert.equal(epic.milestone, "v2");
});

test("updateEpic writes a changed planRef as one text slot and no status", async () => {
  const { a, exec } = adapter(writes.updateEpic);
  const epic = await a.updateEpic("#1", { planRef: "plans/q.md" });
  assert.deepEqual(mutationOps(exec), ["SetFields"]);
  assert.deepEqual(callOf(exec, "SetFields").variables, { projectId: "PVT_fixture", itemId: "PVTI_fixture_1", f0Field: TEXT_FIELD_IDS.planRef, f0Value: "plans/q.md" });
  assert.equal(epic.planRef, "plans/q.md");
});

test("updateEpic refuses an item that is not an epic on the project, and an invalid milestone before any request", async () => {
  const { a, exec } = adapter(writes.updateEpic);
  await assert.rejects(a.updateEpic("gh-2", { milestone: "v2" }), { code: "NOT_FOUND" });
  await assert.rejects(a.updateEpic("gh-999", { milestone: "v2" }), { code: "NOT_FOUND" });
  assert.deepEqual(mutationOps(exec), []);

  const fresh = adapter(writes.updateEpic);
  await assert.rejects(fresh.a.updateEpic("gh-1", { milestone: "v2\nv3" }), { code: "GITHUB_INVALID_FIELD_VALUE", field: "milestone" });
  assert.equal(fresh.exec.calls.length, 0);
});

for (const field of ["id", "tier_prefix"]) {
  test(`create refuses ${field} with VALIDATION naming the field before any request`, async () => {
    const { a, exec } = adapter(writes.createPlain);
    await assert.rejects(a.create({ title: "adev-fixture: plain", [field]: "x-1" }), (e) => {
      assert.equal(e.code, "VALIDATION");
      assert.equal(e.field, field);
      assert.ok(e.message.includes(field), e.message);
      return true;
    });
    assert.equal(exec.calls.length, 0);
  });
}

test("createEpic refuses a key it does not write with VALIDATION naming the key before any request", async () => {
  const { a, exec } = adapter(writes.createEpicWithMilestone);
  for (const key of ["type", "parent_id", "spec_ref", "id"]) {
    await assert.rejects(a.createEpic({ title: "adev-fixture: e", milestone: "v1", [key]: "x" }), (e) => {
      assert.equal(e.code, "VALIDATION");
      assert.equal(e.field, key);
      assert.ok(e.message.includes(key), e.message);
      return true;
    });
  }
  assert.equal(exec.calls.length, 0);
});

// A label, issue type or milestone the repo lacks is refused before the issue
// exists; adev never creates one.
for (const [name, m, call, missing] of [
  ["a module: label", manifest, (a) => a.create({ title: "adev-fixture: plain", affected_modules: ["nope"] }), "module:nope"],
  ["a type: label", withGithub({ type_source: "labels" }), (a) => a.create({ title: "adev-fixture: plain", type: "chore" }), "type:chore"],
  ["an issue type", withGithub({ type_source: "issue_types" }), (a) => a.create({ title: "adev-fixture: plain", type: "chore" }), "chore"],
  ["a milestone", manifest, (a) => a.createEpic({ title: "adev-fixture: plain", milestone: "v9" }), "v9"],
]) {
  test(`create refuses ${name} missing on GitHub with GITHUB_WRITE_FAILED and writes nothing`, async () => {
    const { a, exec } = adapter(writes.createPlain, m);
    await assert.rejects(call(a), (e) => {
      assert.equal(e.code, "GITHUB_WRITE_FAILED");
      assert.ok(e.message.includes(JSON.stringify(missing)), e.message);
      assert.match(e.message, /`adev issues github setup`\.$/);
      return true;
    });
    assert.deepEqual(mutationOps(exec), []);
  });
}

test("partial create: a rejected mutation carries causeCode GITHUB_WRITE_FAILED", async () => {
  const { a } = adapter(writes.partial);
  await assert.rejects(a.create({ title: "adev-fixture: t", next_action: "Run /adev:plan" }), (e) => {
    assert.equal(e.code, "GITHUB_PARTIAL_CREATE");
    assert.equal(e.causeCode, "GITHUB_WRITE_FAILED");
    assert.ok(!Object.hasOwn(e, "cause"), "the cause code must not shadow Error.cause");
    return true;
  });
});

test("partial create: a rate limit after the issue exists is a partial create carrying the cause and resetAt", async () => {
  const { a, exec } = adapter(writes.partialRateLimited);
  await assert.rejects(a.create({ title: "adev-fixture: rl", next_action: "Run /adev:plan" }), (e) => {
    assert.equal(e.code, "GITHUB_PARTIAL_CREATE");
    assert.equal(e.id, "gh-305");
    assert.equal(e.causeCode, "GITHUB_RATE_LIMITED");
    assert.equal(e.resetAt, RATE_RESET_AT);
    assert.deepEqual([...e.unwritten].sort(), ["next_action", "status"]);
    return true;
  });
  assert.deepEqual(mutationOps(exec), ["CreateIssue", "AddToProject", "SetFields"]);
});

test("partial create: an unreachable GitHub after the issue exists is a partial create carrying the cause", async () => {
  const { a } = adapter(writes.partialUnreachable);
  await assert.rejects(a.create({ title: "adev-fixture: net" }), (e) => {
    assert.equal(e.code, "GITHUB_PARTIAL_CREATE");
    assert.equal(e.id, "gh-306");
    assert.equal(e.causeCode, "GITHUB_UNREACHABLE");
    assert.deepEqual(e.unwritten, ["project", "status"]);
    return true;
  });
});

test("create: an unreachable GitHub on CreateIssue keeps GITHUB_UNREACHABLE", async () => {
  const { a, exec } = adapter(writes.createUnreachable);
  await assert.rejects(a.create({ title: "adev-fixture: net" }), { code: "GITHUB_UNREACHABLE" });
  assert.deepEqual(mutationOps(exec), ["CreateIssue"]);
});

test("create: a numeric priority_field is written as a number slot, not a label", async () => {
  const { a, exec } = adapter(writes.createNumericPriority, withGithub({ priority_field: "Effort Rank" }));
  const item = await a.create({ title: "adev-fixture: n", priority: 3 });
  assert.deepEqual(mutationOps(exec), ["CreateIssue", "AddToProject", "SetFields"]);
  const set = callOf(exec, "SetFields");
  assert.equal(set.variables.f1Field, NUMBER_PRIORITY_FIELD_ID);
  assert.equal(set.variables.f1Value, 3);
  assert.match(set.query, /\$f1Value: Float!/);
  assert.equal(item.priority, 3);
});

const SETUP_REMEDY = "then run `adev issues github setup`.";

test("create: a Priority single-select without the P<n> option is refused before CreateIssue, setup remedy last", async () => {
  const { a, exec } = adapter(writes.createPriorityOptionMissing);
  await assert.rejects(a.create({ title: "adev-fixture: p3", priority: 3 }), (e) => {
    assert.equal(e.code, "GITHUB_WRITE_FAILED");
    assert.match(e.message, /"P3"/);
    assert.ok(e.message.endsWith(SETUP_REMEDY), e.message);
    return true;
  });
  assert.deepEqual(mutationOps(exec), []);
});

for (const field of ["owner", "claimed_at"]) {
  test(`create and createEpic refuse ${field} before any request: only claim() writes a claim`, async () => {
    const { a, exec } = adapter([]);
    const value = field === "owner" ? "adev-fixture-agent" : "2026-11-26T08:00:00Z";
    await assert.rejects(a.create({ title: "adev-fixture: c", [field]: value }), (e) => {
      assert.equal(e.code, "VALIDATION");
      assert.equal(e.field, field);
      assert.match(e.message, new RegExp(`\\b${field}\\b`));
      return true;
    });
    await assert.rejects(a.createEpic({ title: "adev-fixture: e", [field]: value }), { code: "VALIDATION", field });
    assert.equal(exec.calls.length, 0);
  });
}

test("create: a configured priority_field that is not on the project is refused with GITHUB_FIELD_MISSING, setup remedy last", async () => {
  const { a, exec } = adapter(writes.createPlain, withGithub({ priority_field: "Effort Rank" }));
  await assert.rejects(a.create({ title: "adev-fixture: n", priority: 3 }), (e) => {
    assert.equal(e.code, "GITHUB_FIELD_MISSING");
    assert.equal(e.field, "Effort Rank");
    assert.ok(e.message.endsWith(SETUP_REMEDY), e.message);
    return true;
  });
  assert.deepEqual(mutationOps(exec), []);
});

test("create: the write path itself never falls back to a priority: label when the configured priority_field is absent", async () => {
  const { a, exec } = adapter(writes.createNumericPriority, withGithub({ priority_field: "Effort Rank" }));
  const pre = a._ensure();
  const { "Effort Rank": _dropped, ...fields } = pre.fields;
  a._preflight = { ensure: () => ({ ...pre, fields }) };
  await assert.rejects(a.create({ title: "adev-fixture: n", priority: 3 }), (e) => {
    assert.equal(e.code, "GITHUB_FIELD_MISSING");
    assert.equal(e.field, "Effort Rank");
    assert.ok(e.message.endsWith(SETUP_REMEDY), e.message);
    return true;
  });
  assert.equal(countOf(exec, "CreateIssue"), 0);
  assert.equal(countOf(exec, "AddLabels"), 0);
});

test("mutations: setFieldsDocument accepts only the fixed slot-kind enum and a bounded slot count", () => {
  const bad = [["toString"], ["__proto__"], ["constructor"], ["hasOwnProperty"], ["TEXT"], ["text "], [1], [null], [undefined], [{}], ["text", INJECTION.title]];
  for (const kinds of bad) assert.throws(() => mutations.setFieldsDocument(kinds), TypeError, JSON.stringify(kinds));
  for (const notList of [undefined, null, "text", { 0: "text", length: 1 }, []]) {
    assert.throws(() => mutations.setFieldsDocument(notList), TypeError);
  }
  assert.throws(() => mutations.setFieldsDocument(Array(64).fill("text")), TypeError);
});

test("mutations: setFieldsDocument output is memoized per kind tuple, and the single-slot constants are its documents", () => {
  const kinds = ["single_select", "number", "text"];
  const doc = mutations.setFieldsDocument(kinds);
  kinds[2] = "single_select";
  assert.equal(mutations.setFieldsDocument(["single_select", "number", "text"]), doc);
  assert.notEqual(mutations.setFieldsDocument(kinds), doc);
  assert.equal(typeof mutations.SET_TEXT_FIELD, "string");
  assert.equal(typeof mutations.SET_SINGLE_SELECT, "string");
  assert.equal(mutations.setFieldsDocument(["text"]), mutations.SET_TEXT_FIELD);
  assert.equal(mutations.setFieldsDocument(["single_select"]), mutations.SET_SINGLE_SELECT);
  for (const name of ["SET_TEXT_FIELD", "SET_SINGLE_SELECT"]) {
    assert.match(mutations[name], /^\s*mutation SetFields\(/, name);
    assert.equal(mutations[name].match(/\bf\d+\s*:\s*updateProjectV2ItemFieldValue\b/g).length, 1, name);
  }
  assert.match(mutations.SET_TEXT_FIELD, /\$f0Value: String!/);
  assert.match(mutations.SET_SINGLE_SELECT, /singleSelectOptionId: \$f0Value/);
});

test("mutations: no caller or board value ever appears in a sent document; every value is a variable", async () => {
  const constants = new Set(Object.values(mutations).filter((v) => typeof v === "string"));
  const cases = [
    [writes.createFull, withModules, { title: "adev-fixture: full", notes: "adev-fixture: body", status: "deferred", priority: 1, type: "feature", next_action: "Write the RED tests", spec_ref: "specs/a.spec.md", planRef: "plans/a.md", branch: "feat/a", pr: "#12", parent_id: "gh-1", dependencies: ["gh-2", "#3"], affected_modules: ["lib", "docs"] }],
    [writes.createInjection, manifest, { title: INJECTION.title, notes: INJECTION.notes, next_action: INJECTION.next_action }],
    [writes.createNumericPriority, withGithub({ priority_field: "Effort Rank" }), { title: "adev-fixture: n", priority: 3 }],
  ];
  for (const [fx, m, payload] of cases) {
    const { a, exec } = adapter(fx, m);
    await a.create(payload);
    for (const c of exec.calls.filter(isMutation)) {
      const kinds = [...c.query.matchAll(/value: \{ (\w+): \$f\d+Value \}/g)].map(([, key]) => ({ singleSelectOptionId: "single_select", text: "text", number: "number" })[key]);
      assert.ok(constants.has(c.query) || c.query === mutations.setFieldsDocument(kinds), `${c.operation} sent a document outside the closed set`);
      for (const value of Object.values(c.variables).flat()) {
        if (typeof value === "string" && value.length > 0) assert.ok(!c.query.includes(value), `${c.operation} document carries the value ${JSON.stringify(value)}`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// CLI: `adev issues create` / `adev issues epic` on GITHUB_PARTIAL_CREATE (RI-1).
// The CLI builds its own adapter, so `gh` itself is replaced: a fake `gh` on a
// PATH from which every directory holding a real `gh` is removed, serving the
// same replay fixtures. No token reaches the child.
// ---------------------------------------------------------------------------

const CLI = fileURLToPath(new URL("../../../cli/index.mjs", import.meta.url));
const REPLAY_URL = new URL("./replay-transport.mjs", import.meta.url).href;

function holdsGh(dir) {
  try {
    accessSync(join(dir, "gh"), constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function fakeGhProject(fixtures) {
  const root = createTempDir();
  const project = join(root, "project");
  const bin = join(root, "bin");
  mkdirSync(join(project, ".context-index"), { recursive: true });
  mkdirSync(bin);
  writeFileSync(join(project, ".context-index", "manifest.yaml"), [
    "tasks:",
    "  backend: github",
    "  github:",
    "    project: https://github.com/orgs/acme/projects/7",
    "    repo: acme/board",
    "",
  ].join("\n"));
  for (const args of [["init", "-q", "."], ["config", "user.email", "t@example.com"], ["config", "user.name", "t"], ["commit", "-q", "--allow-empty", "-m", "init"]]) {
    execFileSync("git", args, { cwd: project });
  }

  writeFileSync(join(bin, "fixtures.json"), JSON.stringify(fixtures));
  writeFileSync(join(bin, "gh-replay.mjs"), [
    'import { readFileSync, appendFileSync } from "node:fs";',
    `import { replayExec } from ${JSON.stringify(REPLAY_URL)};`,
    'const here = (f) => new URL(f, import.meta.url);',
    'const exec = replayExec(JSON.parse(readFileSync(here("fixtures.json"), "utf8")));',
    'const input = readFileSync(0, "utf8");',
    "let out;",
    "try { out = exec(\"gh\", process.argv.slice(2), { input }); } catch (err) { process.stderr.write(String(err.message)); process.exitCode = 1; }",
    'appendFileSync(here("calls.jsonl"), JSON.stringify({ args: process.argv.slice(2), ...exec.calls[0] }) + "\\n");',
    "if (out !== undefined) process.stdout.write(out);",
    "",
  ].join("\n"));
  writeFileSync(join(bin, "gh"), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(join(bin, "gh-replay.mjs"))} "$@"\n`, { mode: 0o755 });

  const pathDirs = [bin, ...(process.env.PATH ?? "").split(delimiter).filter((d) => d !== "" && !holdsGh(d))];
  const env = { ...process.env, PATH: pathDirs.join(delimiter), ADEV_SILENCE_SHADOW_BOARD: "1", ADEV_SILENCE_DEFAULT_BACKEND_ADVISORY: "1" };
  for (const key of ["GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN", "GITHUB_ENTERPRISE_TOKEN", "GH_HOST"]) delete env[key];

  return {
    root,
    run(verb, args) {
      const r = spawnSync(process.execPath, [CLI, "issues", verb, ...args], { cwd: project, env, encoding: "utf8", timeout: 60_000 });
      return { status: r.status, out: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
    },
    calls() {
      const file = join(bin, "calls.jsonl");
      if (!existsSync(file)) return [];
      return readFileSync(file, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    },
  };
}

function unwrittenLine(out) {
  const line = out.split("\n").find((l) => /unwritten/i.test(l));
  assert.equal(typeof line, "string", `no line names the unwritten fields:\n${out}`);
  return line;
}

test("adev issues create: GITHUB_PARTIAL_CREATE prints the ID and the unwritten fields and exits 1", () => {
  const p = fakeGhProject(writes.partial);
  try {
    const r = p.run("create", ["adev-fixture: t", "--next-action", "Run /adev:plan"]);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /GITHUB_PARTIAL_CREATE/);
    assert.match(r.out, /\bgh-301\b/);
    const line = unwrittenLine(r.out);
    assert.match(line, /\bnext_action\b/);
    assert.match(line, /\bstatus\b/);
    const ops = p.calls().map((c) => c.operation);
    assert.equal(ops.filter((op) => op === "CreateIssue").length, 1);
    assert.ok(ops.every((op) => !/delete|close/i.test(op ?? "")));
    assert.ok(p.calls().every((c) => JSON.stringify(c.args) === JSON.stringify(["api", "graphql", "--input", "-"])));
  } finally {
    cleanupTempDir(p.root);
  }
});

test("adev issues epic: GITHUB_PARTIAL_CREATE prints the ID and the unwritten fields and exits 1", () => {
  const p = fakeGhProject(writes.epicPartial);
  try {
    const r = p.run("epic", ["adev-fixture: e", "--milestone", "v1"]);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /GITHUB_PARTIAL_CREATE/);
    assert.match(r.out, /\bgh-303\b/);
    assert.match(unwrittenLine(r.out), /\bmilestone\b/);
    assert.equal(p.calls().filter((c) => c.operation === "CreateIssue").length, 1);
  } finally {
    cleanupTempDir(p.root);
  }
});

test("adev issues create: a partial create off the project says to add the canonical ID to the project", () => {
  const p = fakeGhProject(writes.partialAtProject);
  try {
    const r = p.run("create", ["adev-fixture: np", "--next-action", "Run /adev:plan", "--spec-ref", "x.spec.md"]);
    assert.equal(r.status, 1, r.out);
    assert.match(unwrittenLine(r.out), /^ {2}unwritten: project, status, next_action, spec_ref$/);
    assert.match(r.out, /^ {2}not on the project: add gh-332 to https:\/\/github\.com\/orgs\/acme\/projects\/7 before finishing it$/m);
  } finally {
    cleanupTempDir(p.root);
  }
});

test("adev issues epic: a partial create that reached the project prints no add-to-project advice", () => {
  const p = fakeGhProject(writes.epicPartial);
  try {
    const r = p.run("epic", ["adev-fixture: e", "--milestone", "v1"]);
    assert.equal(r.status, 1, r.out);
    assert.doesNotMatch(r.out, /not on the project/);
  } finally {
    cleanupTempDir(p.root);
  }
});

test("adev issues create and epic report the created gh ID and exit 0 on a complete create", () => {
  const issue = fakeGhProject(writes.createPlain);
  try {
    const r = issue.run("create", ["adev-fixture: plain"]);
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /^Created task gh-304: adev-fixture: plain$/m);
  } finally {
    cleanupTempDir(issue.root);
  }

  const epic = fakeGhProject(writes.createEpicWithMilestone);
  try {
    const r = epic.run("epic", ["adev-fixture: e", "--milestone", "v1"]);
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /^Created epic gh-302: adev-fixture: e$/m);
    assert.match(r.out, /^ {2}milestone: v1$/m);
  } finally {
    cleanupTempDir(epic.root);
  }
});
