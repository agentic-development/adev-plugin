import { test, after } from "node:test";
import assert from "node:assert/strict";
import { GithubAdapter } from "../../../lib/issues/github-adapter.mjs";
import { setFieldsDocument } from "../../../lib/issues/github/mutations.mjs";
import { replayExec } from "./replay-transport.mjs";
import {
  writes,
  STATUS_FIELD_ID,
  STATUS_OPTION_IDS,
  PRIORITY_FIELD_ID,
  PRIORITY_OPTION_IDS,
  TEXT_FIELD_IDS,
} from "./fixtures/writes.mjs";
import { createTempDir, cleanupTempDir } from "../../helpers.mjs";

const tempDirs = [];
function adapter(fx, m = manifest) {
  const dir = createTempDir();
  tempDirs.push(dir);
  const exec = replayExec(fx);
  return { a: new GithubAdapter(dir, m, { exec }), exec };
}
after(() => {
  for (const dir of tempDirs) cleanupTempDir(dir);
});

const manifest = { tasks: { backend: "github", github: { project: "https://github.com/orgs/acme/projects/7", repo: "acme/board" } } };
const withModules = { ...manifest, modules: [{ slug: "lib" }, { slug: "docs" }] };

const LEGACY_ID = "issue-7k3f9a";

const isMutation = (c) => /^\s*mutation\b/.test(c.query);
const mutationOps = (exec) => exec.calls.filter(isMutation).map((c) => c.operation);
function setFieldsCalls(exec) {
  return exec.calls.filter((c) => c.operation === "SetFields");
}
// The SetFields request's slots as [fieldId, value] in alias order f0, f1, ...
function slotsOf(call) {
  const out = [];
  for (let i = 0; `f${i}Field` in call.variables; i += 1) out.push([call.variables[`f${i}Field`], call.variables[`f${i}Value`]]);
  return out;
}
// The field each top-level aliased mutation of the request writes, in document order.
function aliasOrder(call) {
  return [...call.query.matchAll(/^\s*(f\d+)\s*:\s*\w+\(input: \{[^}]*fieldId: \$(f\d+)Field/gm)].map((m) => [m[1], m[2]]);
}

// Settles a create without letting a rejection hide the request order assertions.
async function settle(promise) {
  try {
    return { item: await promise, error: null };
  } catch (error) {
    return { item: null, error };
  }
}

test("create with legacy_id: CreateIssue, AddToProject, then a SetFields request whose first aliased mutation sets Legacy ID", async () => {
  const { a, exec } = adapter(writes.createLegacyFirst);
  const { item, error } = await settle(a.create({ title: "adev-fixture: migrated", legacy_id: LEGACY_ID }));

  const sets = setFieldsCalls(exec);
  assert.equal(sets.length, 1, "exactly one SetFields request");
  assert.deepEqual(slotsOf(sets[0])[0], [TEXT_FIELD_IDS.legacy_id, LEGACY_ID], "slot f0 of the first field-write request is Legacy ID");
  assert.deepEqual(aliasOrder(sets[0])[0], ["f0", "f0"], "f0 is the document's first top-level mutation");
  assert.equal(sets[0].query, setFieldsDocument(["text", "single_select"]));
  assert.deepEqual(slotsOf(sets[0]), [
    [TEXT_FIELD_IDS.legacy_id, LEGACY_ID],
    [STATUS_FIELD_ID, STATUS_OPTION_IDS.Backlog],
  ]);

  assert.equal(error, null, `create rejected: ${error?.code} ${error?.message}`);
  assert.deepEqual(mutationOps(exec), ["CreateIssue", "AddToProject", "SetFields"]);
  const ops = exec.calls.map((c) => c.operation);
  assert.equal(ops.indexOf("SetFields"), ops.indexOf("AddToProject") + 1, "SetFields immediately follows AddToProject");
  assert.equal(item.id, "gh-340");
  assert.equal(item.legacy_id, LEGACY_ID);
});

test("create with legacy_id among status, priority and every other text field: Legacy ID first, the rest in today's order", async () => {
  const { a, exec } = adapter(writes.createLegacyFull);
  const { item, error } = await settle(a.create({
    title: "adev-fixture: migrated full",
    status: "deferred",
    priority: 1,
    next_action: "Write the RED tests",
    spec_ref: "specs/a.spec.md",
    planRef: "plans/a.md",
    branch: "feat/a",
    pr: "#12",
    legacy_id: LEGACY_ID,
  }));

  const sets = setFieldsCalls(exec);
  assert.equal(sets.length, 1, "exactly one SetFields request");
  assert.deepEqual(slotsOf(sets[0]), [
    [TEXT_FIELD_IDS.legacy_id, LEGACY_ID],
    [STATUS_FIELD_ID, STATUS_OPTION_IDS.Deferred],
    [PRIORITY_FIELD_ID, PRIORITY_OPTION_IDS[1]],
    [TEXT_FIELD_IDS.next_action, "Write the RED tests"],
    [TEXT_FIELD_IDS.spec_ref, "specs/a.spec.md"],
    [TEXT_FIELD_IDS.planRef, "plans/a.md"],
    [TEXT_FIELD_IDS.branch, "feat/a"],
    [TEXT_FIELD_IDS.pr, "#12"],
  ]);
  assert.equal(sets[0].query, setFieldsDocument(["text", "single_select", "single_select", "text", "text", "text", "text", "text"]));
  assert.deepEqual(aliasOrder(sets[0]).map(([alias]) => alias), ["f0", "f1", "f2", "f3", "f4", "f5", "f6", "f7"]);

  assert.equal(error, null, `create rejected: ${error?.code} ${error?.message}`);
  assert.deepEqual(mutationOps(exec), ["CreateIssue", "AddToProject", "SetFields"]);
  assert.equal(item.id, "gh-341");
  assert.equal(item.legacy_id, LEGACY_ID);
  assert.equal(item.next_action, "Write the RED tests");
});

test("create without legacy_id: the SetFields order is unchanged (status, priority, then text fields)", async () => {
  const { a, exec } = adapter(writes.createFull, withModules);
  await a.create({
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
  const sets = setFieldsCalls(exec);
  assert.equal(sets.length, 1);
  assert.deepEqual(slotsOf(sets[0]), [
    [STATUS_FIELD_ID, STATUS_OPTION_IDS.Deferred],
    [PRIORITY_FIELD_ID, PRIORITY_OPTION_IDS[1]],
    [TEXT_FIELD_IDS.next_action, "Write the RED tests"],
    [TEXT_FIELD_IDS.spec_ref, "specs/a.spec.md"],
    [TEXT_FIELD_IDS.planRef, "plans/a.md"],
    [TEXT_FIELD_IDS.branch, "feat/a"],
    [TEXT_FIELD_IDS.pr, "#12"],
  ]);
  assert.equal(sets[0].query, setFieldsDocument(["single_select", "single_select", "text", "text", "text", "text", "text"]));
});

test("create without legacy_id and with no other field: the request is the status slot alone", async () => {
  const { a, exec } = adapter(writes.createPlain);
  const item = await a.create({ title: "adev-fixture: plain" });
  assert.equal(item.id, "gh-304");
  const sets = setFieldsCalls(exec);
  assert.equal(sets.length, 1);
  assert.deepEqual(slotsOf(sets[0]), [[STATUS_FIELD_ID, STATUS_OPTION_IDS.Backlog]]);
  assert.equal(sets[0].query, setFieldsDocument(["single_select"]));
});

test("a rejected legacy-first SetFields request throws GITHUB_PARTIAL_CREATE with legacy_id first in unwritten", async () => {
  const { a, exec } = adapter(writes.partialLegacyAtSetFields);
  const { error } = await settle(a.create({ title: "adev-fixture: migrated", next_action: "Run /adev:plan", legacy_id: LEGACY_ID }));

  const sets = setFieldsCalls(exec);
  assert.equal(sets.length, 1, "exactly one SetFields request");
  assert.deepEqual(slotsOf(sets[0])[0], [TEXT_FIELD_IDS.legacy_id, LEGACY_ID], "the rejected request led with Legacy ID");

  assert.notEqual(error, null, "create must reject");
  assert.equal(error.code, "GITHUB_PARTIAL_CREATE");
  assert.equal(error.id, "gh-342");
  assert.equal(error.causeCode, "GITHUB_WRITE_FAILED", "the cause is GitHub rejecting the recorded legacy-first request");
  assert.deepEqual(error.unwritten, ["legacy_id", "status", "next_action"]);
  assert.deepEqual(mutationOps(exec), ["CreateIssue", "AddToProject", "SetFields"]);
  assert.equal(exec.calls.filter((c) => c.operation === "ProjectItem").length, 0, "no read-back after the failed step");
});

test("a failure in AddSubIssue, after the Legacy ID write, throws GITHUB_PARTIAL_CREATE without legacy_id in unwritten", async () => {
  const { a, exec } = adapter(writes.partialLegacyAtSubIssue, withModules);
  const { error } = await settle(a.create({
    title: "adev-fixture: migrated",
    spec_ref: "x.spec.md",
    parent_id: "gh-1",
    affected_modules: ["lib"],
    legacy_id: LEGACY_ID,
  }));

  assert.notEqual(error, null, "create must reject");
  assert.equal(error.code, "GITHUB_PARTIAL_CREATE");
  assert.equal(error.id, "gh-343");
  assert.equal(error.causeCode, "GITHUB_WRITE_FAILED", "the cause is GitHub rejecting AddSubIssue, not an earlier unrecorded request");
  assert.deepEqual(error.unwritten, ["parent_id", "affected_modules"]);
  assert.ok(!error.unwritten.includes("legacy_id"), "Legacy ID was written before the failure");
  assert.deepEqual(mutationOps(exec), ["CreateIssue", "AddToProject", "SetFields", "AddSubIssue"]);
  assert.deepEqual(slotsOf(setFieldsCalls(exec)[0])[0], [TEXT_FIELD_IDS.legacy_id, LEGACY_ID]);
});

test("residual window: a failed AddToProject lists project, then legacy_id, then the other fields as unwritten", async () => {
  const { a, exec } = adapter(writes.partialLegacyAtProject);
  const { error } = await settle(a.create({ title: "adev-fixture: migrated", next_action: "Run /adev:plan", legacy_id: LEGACY_ID }));

  assert.notEqual(error, null, "create must reject");
  assert.equal(error.code, "GITHUB_PARTIAL_CREATE");
  assert.equal(error.id, "gh-344");
  assert.equal(error.causeCode, "GITHUB_WRITE_FAILED");
  assert.deepEqual(error.unwritten, ["project", "legacy_id", "status", "next_action"]);
  assert.deepEqual(mutationOps(exec), ["CreateIssue", "AddToProject"]);
});

test("an invalid legacy_id is refused before any request is sent", async () => {
  for (const bad of ["gh-5", "", "not an id"]) {
    const { a, exec } = adapter(writes.createLegacyFirst);
    await assert.rejects(a.create({ title: "adev-fixture: migrated", legacy_id: bad }), (e) => {
      assert.equal(e.code, "GITHUB_INVALID_FIELD_VALUE", `legacy_id ${JSON.stringify(bad)}`);
      assert.equal(e.field, "legacy_id");
      return true;
    });
    assert.equal(exec.calls.length, 0, `no request for legacy_id ${JSON.stringify(bad)}`);
  }
});
