import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { accessSync, constants, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { GithubAdapter } from "../../../lib/issues/github-adapter.mjs";
import { replayExec } from "./replay-transport.mjs";
import { writes } from "./fixtures/writes.mjs";
import * as mutations from "../../../lib/issues/github/mutations.mjs";
import {
  STATUS_FIELD_ID,
  STATUS_OPTION_IDS,
  TEXT_FIELD_IDS,
  PRIORITY_FIELD_ID,
  PRIORITY_OPTION_IDS,
  LABEL_IDS,
  UPDATE_REJECTION,
  CLOSE_REJECTION,
  LINK_REJECTION,
} from "./fixtures/writes.mjs";
import { createTempDir, cleanupTempDir } from "../../helpers.mjs";
const manifest = { tasks: { backend: "github", github: { project: "https://github.com/orgs/acme/projects/7", repo: "acme/board" } } };
const make = (fx) => { const exec = replayExec(fx); return { a: new GithubAdapter("/tmp/unused", manifest, { exec }), exec }; };

test("update follows the shared transition rules; adev never reopens", async () => {
  const { a } = make(writes.closedItem);
  await assert.rejects(a.update("gh-5", { next_action: "x" }), { code: "ISSUE_CLOSED" });
  const { a: b } = make(writes.openItem);
  await assert.rejects(b.update("gh-6", { status: "closed" }), { code: "USE_CLOSE_METHOD" });
});

test("update writes only changed fields in one aliased request", async () => {
  const { a, exec } = make(writes.openItemUpdate);
  await a.update("gh-6", { next_action: "Run /adev:implement", priority: 1 });
  assert.equal(exec.calls.filter((c) => c.operation === "SetFields").length, 1);
});

test("close guards, then Status → Done, close COMPLETED, reason as comment", async () => {
  await assert.rejects(make(writes.blockedItem).a.close("gh-7", "r"), { code: "BLOCKED_BY_DEPENDENCIES" });
  await assert.rejects(make(writes.parentWithOpenChild).a.close("gh-1", "r"), { code: "CASCADE_BLOCKED" });
  const { a, exec } = make(writes.closeOk);
  await a.close("gh-8", "done in #12");
  assert.deepEqual(exec.calls.map((c) => c.operation).slice(-3), ["SetFields", "CloseIssue", "AddComment"]);
});

test("planTask on update is refused", async () => {
  await assert.rejects(make(writes.openItem).a.update("gh-6", { planTask: 2 }), { code: "BOARD_GRANULARITY_VIOLATION" });
});

test("legacy IDs on update and close: unknown → NOT_FOUND, ambiguous → GITHUB_AMBIGUOUS_LEGACY_ID", async () => {
  for (const call of [(a, id) => a.update(id, { next_action: "x" }), (a, id) => a.close(id, "r")]) {
    await assert.rejects(call(make(writes.migratedBoard).a, "issue-zzzzzz"), { code: "NOT_FOUND" });
    await assert.rejects(call(make(writes.migratedBoard).a, "epic-2"), { code: "GITHUB_AMBIGUOUS_LEGACY_ID" });
  }
});

test("addDependency is idempotent", async () => {
  const { a, exec } = make(writes.dependencyExists);
  await a.addDependency("gh-9", "gh-10");
  assert.equal(exec.calls.filter((c) => c.operation === "AddBlockedBy").length, 0);
});

// ---------------------------------------------------------------------------
// Added cases (thorough depth): BEH-15, BEH-16, BEH-17, BEH-18, BEH-19, BEH-23,
// BEH-39, BEH-40, and the CLI entry points `adev issues update|close|dep`.
// ---------------------------------------------------------------------------

const withModules = { ...manifest, modules: [{ slug: "lib" }, { slug: "docs" }] };
const makeWith = (fx, m) => { const exec = replayExec(fx); return { a: new GithubAdapter("/tmp/unused", m, { exec }), exec }; };

const isMutation = (c) => /^\s*mutation\b/.test(c.query);
const mutationOps = (exec) => exec.calls.filter(isMutation).map((c) => c.operation);
const countOf = (exec, op) => exec.calls.filter((c) => c.operation === op).length;
function callOf(exec, op) {
  const found = exec.calls.filter((c) => c.operation === op);
  assert.equal(found.length, 1, `exactly one ${op} request`);
  return found[0];
}

test("mutations: CLOSE_ISSUE, ADD_COMMENT and CLEAR_FIELD are named mutations that never touch assignees or remove labels", () => {
  const expected = { CLOSE_ISSUE: "CloseIssue", ADD_COMMENT: "AddComment", CLEAR_FIELD: "ClearField" };
  for (const [name, operation] of Object.entries(expected)) {
    assert.equal(typeof mutations[name], "string", name);
    assert.match(mutations[name], new RegExp(`^\\s*mutation ${operation}\\(`), name);
    assert.doesNotMatch(mutations[name], /assignee/i, name);
    assert.doesNotMatch(mutations[name], /removeLabels/i, name);
  }
  assert.match(mutations.CLOSE_ISSUE, /\bcloseIssue\(input: \{[^}]*\bissueId: \$issueId\b[^}]*\bstateReason: COMPLETED\b/);
  assert.match(mutations.ADD_COMMENT, /\baddComment\(input: \{[^}]*\bsubjectId: \$subjectId\b[^}]*\bbody: \$body\b/);
  assert.match(mutations.CLEAR_FIELD, /\bclearProjectV2ItemFieldValue\(input: \{[^}]*\bprojectId: \$projectId\b[^}]*\bitemId: \$itemId\b[^}]*\bfieldId: \$fieldId\b/);
});

// --- update -----------------------------------------------------------------

test("update: a refused transition sends no mutation, and a closed item refuses even status: closed with ISSUE_CLOSED", async () => {
  const closed = make(writes.closedItem);
  await assert.rejects(closed.a.update("gh-5", { next_action: "x" }), { code: "ISSUE_CLOSED" });
  await assert.rejects(closed.a.update("gh-5", { status: "closed" }), { code: "ISSUE_CLOSED" });
  await assert.rejects(closed.a.update("gh-5", { status: "open" }), { code: "ISSUE_CLOSED" });
  assert.deepEqual(mutationOps(closed.exec), []);

  const open = make(writes.openItem);
  await assert.rejects(open.a.update("gh-6", { status: "closed" }), { code: "USE_CLOSE_METHOD" });
  assert.deepEqual(mutationOps(open.exec), []);
});

test("update: changed priority and next_action travel as two slots of one SetFields request, then the item is read back", async () => {
  const { a, exec } = make(writes.openItemUpdate);
  const item = await a.update("gh-6", { next_action: "Run /adev:implement", priority: 1 });
  assert.deepEqual(mutationOps(exec), ["SetFields"]);
  assert.deepEqual(callOf(exec, "SetFields").variables, {
    projectId: "PVT_fixture",
    itemId: "PVTI_fixture_6",
    f0Field: PRIORITY_FIELD_ID,
    f0Value: PRIORITY_OPTION_IDS[1],
    f1Field: TEXT_FIELD_IDS.next_action,
    f1Value: "Run /adev:implement",
  });
  assert.equal(exec.calls.at(-1).operation, "ProjectItem");
  assert.equal(item.id, "gh-6");
  assert.equal(item.priority, 1);
  assert.equal(item.next_action, "Run /adev:implement");
});

test("update: a status change writes the status_map write option as the only slot", async () => {
  const { a, exec } = make(writes.updateStatus);
  const item = await a.update("gh-6", { status: "in_progress" });
  assert.deepEqual(mutationOps(exec), ["SetFields"]);
  assert.deepEqual(callOf(exec, "SetFields").variables, { projectId: "PVT_fixture", itemId: "PVTI_fixture_6", f0Field: STATUS_FIELD_ID, f0Value: STATUS_OPTION_IDS["In Progress"] });
  assert.equal(item.status, "in_progress");
});

test("update: an unchanged value sends no mutation and no read-back, and returns the item as read", async () => {
  const { a, exec } = make(writes.updateClear);
  const item = await a.update("gh-6", { next_action: "Run /adev:plan" });
  assert.deepEqual(mutationOps(exec), []);
  assert.equal(countOf(exec, "ProjectItem"), 0);
  assert.equal(item.id, "gh-6");
  assert.equal(item.next_action, "Run /adev:plan");
  assert.equal(item.branch, "feat/a");
});

test("update: an empty next_action clears the Project field as a clear slot of one SetFields request", async () => {
  const { a, exec } = make(writes.updateClear);
  const item = await a.update("gh-6", { next_action: "" });
  assert.deepEqual(mutationOps(exec), ["SetFields"]);
  const call = callOf(exec, "SetFields");
  assert.equal(call.query, mutations.setFieldsDocument(["clear"]));
  assert.deepEqual(call.variables, { projectId: "PVT_fixture", itemId: "PVTI_fixture_6", f0Field: TEXT_FIELD_IDS.next_action });
  assert.equal(item.next_action, undefined);
  assert.equal(item.branch, "feat/a");
});

test("update: a cleared and a changed text field travel in one SetFields request, in config order", async () => {
  const { a, exec } = make(writes.updateClearAndSet);
  const item = await a.update("gh-6", { next_action: "", branch: "feat/b" });
  assert.deepEqual(mutationOps(exec), ["SetFields"]);
  const call = callOf(exec, "SetFields");
  assert.equal(call.query, mutations.setFieldsDocument(["clear", "text"]));
  assert.deepEqual(call.variables, {
    projectId: "PVT_fixture",
    itemId: "PVTI_fixture_6",
    f0Field: TEXT_FIELD_IDS.next_action,
    f1Field: TEXT_FIELD_IDS.branch,
    f1Value: "feat/b",
  });
  assert.equal(item.next_action, undefined);
  assert.equal(item.branch, "feat/b");
});

test("setFieldsDocument: a clear slot clears its field in the aliased request, declares no value, and is memoized", () => {
  const doc = mutations.setFieldsDocument(["text", "clear"]);
  assert.equal(doc, mutations.setFieldsDocument(["text", "clear"]));
  assert.match(doc, /^mutation SetFields\(/);
  assert.match(doc, /\bf0: updateProjectV2ItemFieldValue\(input: \{ projectId: \$projectId, itemId: \$itemId, fieldId: \$f0Field, value: \{ text: \$f0Value \} \}\)/);
  assert.match(doc, /\bf1: clearProjectV2ItemFieldValue\(input: \{ projectId: \$projectId, itemId: \$itemId, fieldId: \$f1Field \}\)/);
  assert.match(doc, /\$f1Field: ID!/);
  assert.doesNotMatch(doc, /\$f1Value/);
  assert.throws(() => mutations.setFieldsDocument(["clear", "erase"]), TypeError);
});

test("update: affected_modules adds only the module: labels the item lacks, and nothing when it has them all", async () => {
  const { a, exec } = makeWith(writes.updateModules, withModules);
  const fresh = await a.update("gh-6", { affected_modules: ["lib", "docs"] });
  assert.deepEqual(mutationOps(exec), ["AddLabels"]);
  assert.deepEqual(callOf(exec, "AddLabels").variables, { labelableId: "I_fixture_6", labelIds: [LABEL_IDS["module:lib"], LABEL_IDS["module:docs"]] });
  assert.deepEqual(fresh.affected_modules, ["lib", "docs"]);

  const partly = makeWith(writes.updateModules, withModules);
  const grown = await partly.a.update("gh-11", { affected_modules: ["lib", "docs"] });
  assert.deepEqual(callOf(partly.exec, "AddLabels").variables, { labelableId: "I_fixture_11", labelIds: [LABEL_IDS["module:docs"]] });
  assert.deepEqual(grown.affected_modules, ["lib", "docs"]);

  const same = makeWith(writes.updateModules, withModules);
  await same.a.update("gh-11", { affected_modules: ["lib"] });
  assert.deepEqual(mutationOps(same.exec), []);
});

const INVALID_UPDATES = [
  ["branch", "feat..x"],
  ["next_action", "line one\nline two"],
  ["pr", "not-a-pr"],
  ["spec_ref", "../outside.spec.md"],
  ["planRef", "/abs/plan.md"],
  ["priority", 7],
  ["affected_modules", ["has space"]],
];
for (const [field, value] of INVALID_UPDATES) {
  test(`update refuses an invalid ${field} with GITHUB_INVALID_FIELD_VALUE before any request`, async () => {
    const { a, exec } = make(writes.openItem);
    await assert.rejects(a.update("gh-6", { [field]: value }), { code: "GITHUB_INVALID_FIELD_VALUE", field });
    assert.equal(exec.calls.length, 0);
  });
}

for (const field of ["owner", "claimed_at"]) {
  test(`update refuses ${field} with VALIDATION before any request: only claim() writes a claim`, async () => {
    const value = field === "owner" ? "adev-fixtures" : "2026-11-26T08:00:00Z";
    const { a, exec } = make(writes.openItem);
    await assert.rejects(a.update("gh-6", { [field]: value }), { code: "VALIDATION", field });
    assert.equal(exec.calls.length, 0);
  });
}

test("update refuses planTask before any request", async () => {
  const { a, exec } = make(writes.openItem);
  await assert.rejects(a.update("gh-6", { next_action: "Run /adev:plan", planTask: 2 }), { code: "BOARD_GRANULARITY_VIOLATION" });
  assert.equal(exec.calls.length, 0);
});

test("update: an ID not on the project throws NOT_FOUND and writes nothing", async () => {
  const { a, exec } = make(writes.openItem);
  await assert.rejects(a.update("gh-999", { next_action: "x" }), { code: "NOT_FOUND" });
  assert.deepEqual(mutationOps(exec), []);
});

test("update: an old ID writes the item whose legacy_id it is", async () => {
  const { a, exec } = make(writes.migratedBoard);
  const item = await a.update("issue-7k3f9a", { next_action: "Run /adev:implement" });
  assert.deepEqual(mutationOps(exec), ["SetFields"]);
  assert.equal(callOf(exec, "SetFields").variables.itemId, "PVTI_fixture_41");
  assert.equal(item.id, "gh-41");
  assert.equal(item.legacy_id, "issue-7k3f9a");
});

test("update: GitHub rejecting the write throws GITHUB_WRITE_FAILED with GitHub's reason and drops the cached board", async () => {
  const { a, exec } = make(writes.updateRejected);
  await a.list();
  await assert.rejects(a.update("gh-6", { next_action: "Run /adev:plan" }),
    (e) => e.code === "GITHUB_WRITE_FAILED" && e.message.includes(UPDATE_REJECTION));
  const before = countOf(exec, "ProjectItems");
  await a.list();
  assert.equal(countOf(exec, "ProjectItems"), before + 1);
});

test("update: a rate limit without a reset time surfaces as GITHUB_RATE_LIMITED with resetAt null", async () => {
  const { a } = make(writes.updateRateLimited);
  await assert.rejects(a.update("gh-6", { next_action: "Run /adev:plan" }), (e) => e.code === "GITHUB_RATE_LIMITED" && e.resetAt === null);
});

test("update: no request carries a title or body unless the caller changed them", async () => {
  const { a, exec } = make(writes.openItemUpdate);
  await a.update("gh-6", { next_action: "Run /adev:implement", priority: 1 });
  assert.ok(exec.calls.every((c) => !("title" in c.variables) && !("body" in c.variables)));
});

// --- close ------------------------------------------------------------------

test("close: the dependency guard names only the open blockers and writes nothing", async () => {
  const { a, exec } = make(writes.blockedItem);
  await assert.rejects(a.close("gh-7", "r"), (e) => e.code === "BLOCKED_BY_DEPENDENCIES" && JSON.stringify(e.blockers) === JSON.stringify(["gh-20"]));
  assert.deepEqual(mutationOps(exec), []);
});

test("close: the cascade guard applies to every github ID, names only the open sub-issues, and writes nothing", async () => {
  const { a, exec } = make(writes.parentWithOpenChild);
  await assert.rejects(a.close("gh-1", "r"), (e) => e.code === "CASCADE_BLOCKED" && JSON.stringify(e.blockers) === JSON.stringify(["gh-2"]));
  await assert.rejects(a.close("gh-30", "r"), (e) => e.code === "CASCADE_BLOCKED" && JSON.stringify(e.blockers) === JSON.stringify(["gh-31"]));
  assert.deepEqual(mutationOps(exec), []);
});

test("close: a sub-issue whose decode is refused refuses the close with its own error, naming it, and writes nothing", async () => {
  const { a, exec } = make(writes.closeChildUndecodable);
  await assert.rejects(a.close("gh-50", "r"), (e) => e.code === "GITHUB_UNMAPPED_STATUS" && e.id === "gh-51" && e.message.includes("gh-51"));
  await assert.rejects(a.close("gh-52", "r"), (e) => e.code === "GITHUB_INVALID_FIELD_VALUE" && e.id === "gh-53" && e.message.includes("gh-53"));
  assert.deepEqual(mutationOps(exec), []);
});

test("close: an open blocker off the project refuses with BLOCKED_BY_DEPENDENCIES and writes nothing", async () => {
  const { a, exec } = make(writes.blockedOffProject);
  await assert.rejects(a.close("gh-60", "r"), (e) => e.code === "BLOCKED_BY_DEPENDENCIES" && JSON.stringify(e.blockers) === JSON.stringify(["gh-90"]));
  assert.deepEqual(mutationOps(exec), []);
});

test("close: a blocker off the project whose state is unknown refuses the close (fail closed)", async () => {
  const { a, exec } = make(writes.blockedOffProject);
  await assert.rejects(a.close("gh-62", "r"), (e) => e.code === "BLOCKED_BY_DEPENDENCIES" && JSON.stringify(e.blockers) === JSON.stringify(["gh-92"]));
  assert.deepEqual(mutationOps(exec), []);
});

test("close: a closed blocker off the project does not block", async () => {
  const { a, exec } = make(writes.blockedOffProject);
  await a.close("gh-61", "");
  assert.deepEqual(mutationOps(exec), ["SetFields", "CloseIssue"]);
  assert.deepEqual(callOf(exec, "CloseIssue").variables, { issueId: "I_fixture_61" });
});

test("queries: every issue reference selects the issue state", async () => {
  const queries = await import("../../../lib/issues/github/queries.mjs");
  for (const name of ["PROJECT_ITEMS_QUERY", "PROJECT_ITEM_QUERY", "BLOCKED_BY_PAGE_QUERY", "SUB_ISSUES_PAGE_QUERY"]) {
    const refs = [...queries[name].matchAll(/(?:parent|nodes) \{ number ([^{}]*)repository \{/g)];
    assert.ok(refs.length > 0, name);
    for (const [, between] of refs) assert.match(between, /\bstate\b/, name);
  }
});

test("close: the cascade guard is transitive: an open grandchild under a closed child blocks", async () => {
  const { a, exec } = make(writes.cascadeGrandchild);
  await assert.rejects(a.close("gh-70", "r"), (e) => e.code === "CASCADE_BLOCKED" && JSON.stringify(e.blockers) === JSON.stringify(["gh-72"]));
  await assert.rejects(a.close("gh-73", "r"), (e) => e.code === "GITHUB_UNMAPPED_STATUS" && e.id === "gh-75");
  assert.deepEqual(mutationOps(exec), []);
});

test("close: a sub-issue cycle ends the cascade walk instead of looping", async () => {
  const { a, exec } = make(writes.cascadeCycle);
  await a.close("gh-80", "");
  assert.deepEqual(mutationOps(exec), ["SetFields", "CloseIssue"]);
});

test("close: Done status slot, CloseIssue, then the reason verbatim as a comment, and nothing after it", async () => {
  const { a, exec } = make(writes.closeOk);
  await a.close("gh-8", "done in #12");
  assert.deepEqual(mutationOps(exec), ["SetFields", "CloseIssue", "AddComment"]);
  assert.deepEqual(callOf(exec, "SetFields").variables, { projectId: "PVT_fixture", itemId: "PVTI_fixture_8", f0Field: STATUS_FIELD_ID, f0Value: STATUS_OPTION_IDS.Done });
  assert.deepEqual(callOf(exec, "CloseIssue").variables, { issueId: "I_fixture_8" });
  assert.deepEqual(callOf(exec, "AddComment").variables, { subjectId: "I_fixture_8", body: "done in #12" });
  assert.equal(exec.calls.at(-1).operation, "AddComment");
});

test("close: an empty or absent reason posts no comment", async () => {
  for (const reason of ["", undefined]) {
    const { a, exec } = make(writes.closeOk);
    await a.close("gh-8", reason);
    assert.deepEqual(mutationOps(exec), ["SetFields", "CloseIssue"], String(reason));
  }
});

test("close: GitHub rejecting CloseIssue throws GITHUB_WRITE_FAILED with GitHub's reason and posts no comment", async () => {
  const { a, exec } = make(writes.closeRejected);
  await assert.rejects(a.close("gh-8", "done in #12"), (e) => e.code === "GITHUB_WRITE_FAILED" && e.message.includes(CLOSE_REJECTION));
  assert.deepEqual(mutationOps(exec), ["SetFields", "CloseIssue"]);
});

test("close: an old ID closes the item whose legacy_id it is", async () => {
  const { a, exec } = make(writes.migratedBoard);
  await a.close("issue-7k3f9a", "");
  assert.deepEqual(mutationOps(exec), ["SetFields", "CloseIssue"]);
  assert.deepEqual(callOf(exec, "CloseIssue").variables, { issueId: "I_fixture_41" });
});

test("close: an ID not on the project throws NOT_FOUND and writes nothing", async () => {
  const { a, exec } = make(writes.closeOk);
  await assert.rejects(a.close("gh-999", "r"), { code: "NOT_FOUND" });
  assert.deepEqual(mutationOps(exec), []);
});

// --- addDependency ----------------------------------------------------------

test("addDependency adds one blocked-by link between the two issues' content ids and nothing else", async () => {
  const { a, exec } = make(writes.dependencyExists);
  await a.addDependency("gh-9", "gh-11");
  assert.deepEqual(mutationOps(exec), ["AddBlockedBy"]);
  assert.deepEqual(callOf(exec, "AddBlockedBy").variables, { issueId: "I_fixture_9", blockingIssueId: "I_fixture_11" });
  assert.equal(exec.calls.at(-1).operation, "AddBlockedBy");
});

test("addDependency: an existing link named in display form is still a no-op", async () => {
  const { a, exec } = make(writes.dependencyExists);
  await a.addDependency("#9", "#10");
  assert.deepEqual(mutationOps(exec), []);
});

test("addDependency: either ID not on the project throws NOT_FOUND and writes nothing", async () => {
  const { a, exec } = make(writes.dependencyExists);
  await assert.rejects(a.addDependency("gh-404", "gh-10"), { code: "NOT_FOUND" });
  await assert.rejects(a.addDependency("gh-9", "gh-404"), { code: "NOT_FOUND" });
  assert.deepEqual(mutationOps(exec), []);
});

test("addDependency: a link GitHub rejects surfaces as GITHUB_WRITE_FAILED with GitHub's reason", async () => {
  const { a } = make(writes.dependencyRejected);
  await assert.rejects(a.addDependency("gh-9", "gh-10"), (e) => e.code === "GITHUB_WRITE_FAILED" && e.message.includes(LINK_REJECTION));
});

// --- every write ------------------------------------------------------------

test("update, close and addDependency each drop the cached board", async () => {
  const writesOf = [
    [writes.openItemUpdate, (a) => a.update("gh-6", { next_action: "Run /adev:implement", priority: 1 })],
    [writes.closeOk, (a) => a.close("gh-8", "done in #12")],
    [writes.dependencyExists, (a) => a.addDependency("gh-9", "gh-11")],
  ];
  for (const [fx, write] of writesOf) {
    const { a, exec } = make(fx);
    await a.list();
    await write(a);
    const before = countOf(exec, "ProjectItems");
    await a.list();
    assert.equal(countOf(exec, "ProjectItems"), before + 1);
  }
});

test("update, close and addDependency send only closed-set documents, carry every value as a variable, and never touch assignees", async () => {
  const constantsSet = new Set(Object.values(mutations).filter((v) => typeof v === "string"));
  const runs = [
    [writes.openItemUpdate, manifest, (a) => a.update("gh-6", { next_action: "Run /adev:implement", priority: 1 })],
    [writes.updateClear, manifest, (a) => a.update("gh-6", { next_action: "" })],
    [writes.updateClearAndSet, manifest, (a) => a.update("gh-6", { next_action: "", branch: "feat/b" })],
    [writes.updateModules, withModules, (a) => a.update("gh-6", { affected_modules: ["lib", "docs"] })],
    [writes.closeOk, manifest, (a) => a.close("gh-8", "done in #12")],
    [writes.dependencyExists, manifest, (a) => a.addDependency("gh-9", "gh-11")],
  ];
  for (const [fx, m, write] of runs) {
    const { a, exec } = makeWith(fx, m);
    await write(a);
    for (const c of exec.calls) assert.doesNotMatch(c.query, /assignee/i);
    for (const c of exec.calls.filter(isMutation)) {
      const kinds = [...c.query.matchAll(/\bf\d+: (?:clearProjectV2ItemFieldValue\(|updateProjectV2ItemFieldValue\(input: \{[^\n]*?value: \{ (\w+): )/g)]
        .map(([, key]) => (key === undefined ? "clear" : ({ singleSelectOptionId: "single_select", text: "text", number: "number" })[key]));
      assert.ok(constantsSet.has(c.query) || (kinds.length > 0 && c.query === mutations.setFieldsDocument(kinds)), `${c.operation} sent a document outside the closed set`);
      for (const value of Object.values(c.variables).flat()) {
        if (typeof value === "string" && value.length > 0) assert.ok(!c.query.includes(value), `${c.operation} document carries the value ${JSON.stringify(value)}`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// CLI: `adev issues update` / `close` / `dep` on the github backend. The CLI
// builds its own adapter, so `gh` itself is replaced: a fake `gh` on a PATH
// from which every directory holding a real `gh` is removed, serving the same
// replay fixtures. No token reaches the child.
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
    ops() {
      const file = join(bin, "calls.jsonl");
      if (!existsSync(file)) return [];
      return readFileSync(file, "utf8").trim().split("\n").map((line) => JSON.parse(line)).filter(isMutation).map((c) => c.operation);
    },
  };
}

function withProject(fixtures, fn) {
  const p = fakeGhProject(fixtures);
  try {
    fn(p);
  } finally {
    cleanupTempDir(p.root);
  }
}

test("adev issues close: a closure guard exits 2 naming the open blocker, with no mutation", () => {
  withProject(writes.blockedItem, (p) => {
    const r = p.run("close", ["gh-7", "--reason", "r"]);
    assert.equal(r.status, 2, r.out);
    assert.match(r.out, /^ {2}blocked by: gh-20$/m);
    assert.deepEqual(p.ops(), []);
  });
  withProject(writes.parentWithOpenChild, (p) => {
    const r = p.run("close", ["gh-1", "--reason", "r"]);
    assert.equal(r.status, 2, r.out);
    assert.match(r.out, /^ {2}blocked by: gh-2$/m);
    assert.deepEqual(p.ops(), []);
  });
});

test("adev issues close: closes through Done, CloseIssue and the reason comment, and exits 0", () => {
  withProject(writes.closeOk, (p) => {
    const r = p.run("close", ["gh-8", "--reason", "done in #12"]);
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /^Closed gh-8: done in #12$/m);
    assert.deepEqual(p.ops(), ["SetFields", "CloseIssue", "AddComment"]);
  });
});

test("adev issues update: writes the changed fields in one SetFields request and exits 0", () => {
  withProject(writes.openItemUpdate, (p) => {
    const r = p.run("update", ["gh-6", "--next-action", "Run /adev:implement", "--priority", "1"]);
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /^Updated gh-6: /m);
    assert.deepEqual(p.ops(), ["SetFields"]);
  });
});

test("adev issues update: a closed item exits 1 with ISSUE_CLOSED and no mutation", () => {
  withProject(writes.closedItem, (p) => {
    const r = p.run("update", ["gh-5", "--next-action", "x"]);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /ISSUE_CLOSED/);
    assert.deepEqual(p.ops(), []);
  });
});

test("adev issues dep: adds a missing link, and an existing link is a no-op; both exit 0", () => {
  withProject(writes.dependencyExists, (p) => {
    const added = p.run("dep", ["gh-9", "gh-11"]);
    assert.equal(added.status, 0, added.out);
    assert.match(added.out, /^gh-9 now depends on gh-11$/m);
    assert.deepEqual(p.ops(), ["AddBlockedBy"]);
  });
  withProject(writes.dependencyExists, (p) => {
    const again = p.run("dep", ["gh-9", "gh-10"]);
    assert.equal(again.status, 0, again.out);
    assert.deepEqual(p.ops(), []);
  });
});

test("adev issues dep: a link GitHub rejects exits 1 with GITHUB_WRITE_FAILED and GitHub's reason", () => {
  withProject(writes.dependencyRejected, (p) => {
    const r = p.run("dep", ["gh-9", "gh-10"]);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /GITHUB_WRITE_FAILED/);
    assert.ok(r.out.includes(LINK_REJECTION), r.out);
  });
});

// ---------------------------------------------------------------------------
// Title and body edits, label replacement, close()'s result, dependency
// cycles, and updateEpic's epic fields.
// ---------------------------------------------------------------------------

test("mutations: UPDATE_ISSUE and REMOVE_LABELS are named mutations carrying every value as a variable", () => {
  assert.match(mutations.UPDATE_ISSUE, /^\s*mutation UpdateIssue\(/);
  assert.match(mutations.UPDATE_ISSUE, /\bupdateIssue\(input: \{ id: \$issueId, title: \$title, body: \$body \}\)/);
  assert.match(mutations.REMOVE_LABELS, /^\s*mutation RemoveLabels\(/);
  assert.match(mutations.REMOVE_LABELS, /\bremoveLabelsFromLabelable\(input: \{ labelableId: \$labelableId, labelIds: \$labelIds \}\)/);
  for (const doc of [mutations.UPDATE_ISSUE, mutations.REMOVE_LABELS]) assert.doesNotMatch(doc, /assignee/i);
});

test("update: a changed title or notes is one UpdateIssue request carrying only that value", async () => {
  const { a, exec } = make(writes.updateIssueText);
  const renamed = await a.update("gh-6", { title: "adev-fixture: renamed" });
  assert.deepEqual(mutationOps(exec), ["UpdateIssue"]);
  assert.deepEqual(callOf(exec, "UpdateIssue").variables, { issueId: "I_fixture_6", title: "adev-fixture: renamed" });
  assert.equal(renamed.title, "adev-fixture: renamed");

  const body = make(writes.updateIssueText);
  const edited = await body.a.update("gh-13", { description: "adev-fixture: new body" });
  assert.deepEqual(callOf(body.exec, "UpdateIssue").variables, { issueId: "I_fixture_13", body: "adev-fixture: new body" });
  assert.equal(edited.notes, "adev-fixture: new body");

  const same = make(writes.updateIssueText);
  await same.a.update("gh-6", { title: "adev-fixture: item 6", notes: "" });
  assert.deepEqual(mutationOps(same.exec), []);
});

test("update refuses an empty title, a non-string notes, an unknown status and an unsupported field before any request", async () => {
  const cases = [
    [{ title: "  " }, "MISSING_REQUIRED_FIELD"],
    [{ notes: 7 }, "INVALID_NOTES"],
    [{ status: "bogus" }, "VALIDATION"],
    [{ type: "bug" }, "VALIDATION"],
    [{ milestone: "v1" }, "VALIDATION"],
    [{ dependencies: ["gh-7"] }, "VALIDATION"],
  ];
  for (const [changes, code] of cases) {
    const { a, exec } = make(writes.openItem);
    await assert.rejects(a.update("gh-6", changes), { code }, JSON.stringify(changes));
    assert.equal(exec.calls.length, 0, JSON.stringify(changes));
  }
});

test("update: affected_modules replaces the module: labels and never touches labels outside adev's families", async () => {
  const swap = makeWith(writes.updateModulesReplace, withModules);
  const swapped = await swap.a.update("gh-11", { affected_modules: ["docs"] });
  assert.deepEqual(mutationOps(swap.exec), ["AddLabels", "RemoveLabels"]);
  assert.deepEqual(callOf(swap.exec, "AddLabels").variables, { labelableId: "I_fixture_11", labelIds: [LABEL_IDS["module:docs"]] });
  assert.deepEqual(callOf(swap.exec, "RemoveLabels").variables, { labelableId: "I_fixture_11", labelIds: [LABEL_IDS["module:lib"]] });
  assert.deepEqual(swapped.affected_modules, ["docs"]);

  const empty = makeWith(writes.updateModulesReplace, withModules);
  const cleared = await empty.a.update("gh-12", { affected_modules: [] });
  assert.deepEqual(mutationOps(empty.exec), ["RemoveLabels"]);
  assert.deepEqual(callOf(empty.exec, "RemoveLabels").variables, { labelableId: "I_fixture_12", labelIds: [LABEL_IDS["module:lib"], LABEL_IDS["module:docs"]] });
  assert.deepEqual(cleared.affected_modules, []);
});

test("update: label-fallback priority replaces the priority: label and keeps every other label", async () => {
  const relabel = make(writes.updatePriorityLabel);
  const item = await relabel.a.update("gh-14", { priority: 1 });
  assert.deepEqual(mutationOps(relabel.exec), ["AddLabels", "RemoveLabels"]);
  assert.deepEqual(callOf(relabel.exec, "AddLabels").variables, { labelableId: "I_fixture_14", labelIds: [LABEL_IDS["priority:1"]] });
  assert.deepEqual(callOf(relabel.exec, "RemoveLabels").variables, { labelableId: "I_fixture_14", labelIds: [LABEL_IDS["priority:3"]] });
  assert.equal(item.priority, 1);

  const unlabelled = make(writes.updatePriorityLabel);
  const raised = await unlabelled.a.update("gh-15", { priority: 0 });
  assert.deepEqual(mutationOps(unlabelled.exec), ["AddLabels"]);
  assert.deepEqual(callOf(unlabelled.exec, "AddLabels").variables, { labelableId: "I_fixture_15", labelIds: [LABEL_IDS["priority:0"]] });
  assert.equal(raised.priority, 0);
});

test("close returns the item as it was before the close, now closed, without reading it back", async () => {
  const { a, exec } = make(writes.closeOk);
  const closed = await a.close("gh-8", "done in #12");
  assert.equal(closed.id, "gh-8");
  assert.equal(closed.status, "closed");
  assert.equal(closed.title, "adev-fixture: item 8");
  assert.deepEqual(closed.dependencies, ["gh-21"]);
  assert.equal(countOf(exec, "ProjectItem"), 0);
});

test("addDependency refuses a self-link or a cycle with CIRCULAR_DEPENDENCY before any write", async () => {
  const { a, exec } = make(writes.dependencyExists);
  await assert.rejects(a.addDependency("gh-10", "gh-9"), { code: "CIRCULAR_DEPENDENCY" });
  await assert.rejects(a.addDependency("gh-9", "gh-9"), { code: "CIRCULAR_DEPENDENCY" });
  assert.deepEqual(mutationOps(exec), []);
});

test("updateEpic writes a changed status and title, through the shared transition rules", async () => {
  const status = make(writes.epicUpdate);
  const deferred = await status.a.updateEpic("gh-1", { status: "deferred" });
  assert.deepEqual(mutationOps(status.exec), ["SetFields"]);
  assert.deepEqual(callOf(status.exec, "SetFields").variables, { projectId: "PVT_fixture", itemId: "PVTI_fixture_1", f0Field: STATUS_FIELD_ID, f0Value: STATUS_OPTION_IDS.Deferred });
  assert.equal(deferred.status, "deferred");

  const title = make(writes.epicUpdate);
  const renamed = await title.a.updateEpic("gh-16", { title: "adev-fixture: renamed epic" });
  assert.deepEqual(callOf(title.exec, "UpdateIssue").variables, { issueId: "I_fixture_16", title: "adev-fixture: renamed epic" });
  assert.equal(renamed.title, "adev-fixture: renamed epic");

  const refused = make(writes.epicUpdate);
  await assert.rejects(refused.a.updateEpic("gh-4", { status: "open" }), { code: "ISSUE_CLOSED" });
  await assert.rejects(refused.a.updateEpic("gh-1", { status: "closed" }), { code: "USE_CLOSE_METHOD" });
  assert.deepEqual(mutationOps(refused.exec), []);
});

test("updateEpic refuses claim fields and planTask before any request", async () => {
  for (const [changes, code] of [[{ owner: "adev-fixtures" }, "VALIDATION"], [{ claimed_at: "2026-11-26T08:00:00Z" }, "VALIDATION"], [{ planTask: 1 }, "BOARD_GRANULARITY_VIOLATION"]]) {
    const { a, exec } = make(writes.epicUpdate);
    await assert.rejects(a.updateEpic("gh-1", changes), { code }, JSON.stringify(changes));
    assert.equal(exec.calls.length, 0);
  }
});
