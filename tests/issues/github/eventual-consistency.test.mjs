/**
 * GitHub's Projects v2 items listing is eventually consistent: an item added or
 * changed seconds ago can be missing from it, or carry its old field values. These
 * cases serve a listing that lags on purpose (it never shows the new item or the
 * new values) and pin the two rules that keep the adapter correct anyway:
 *   - a gh-<n> ID resolves through a direct read of that issue's project item
 *     (IssueProjectItems), never through the listing;
 *   - an item this adapter instance wrote overrides the listing's row for it in
 *     every list() of the same instance.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { GithubAdapter } from "../../../lib/issues/github-adapter.mjs";
import { CREATE_ISSUE, ADD_TO_PROJECT, ADD_BLOCKED_BY } from "../../../lib/issues/github/mutations.mjs";
import { ISSUE_PROJECT_ITEMS_QUERY, PROJECT_ITEM_QUERY, PROJECT_ITEMS_QUERY } from "../../../lib/issues/github/queries.mjs";
import { replayExec } from "./replay-transport.mjs";
import { board, buildBoard, issueLookup, issueNotFound, issueOffProject, PROJECT_ID } from "./fixtures/board.mjs";
import { REPOSITORY_ID, setFieldsRequest, itemNode, slot, task, done, rejected } from "./fixtures/writes.mjs";
import { createTempDir } from "../../helpers.mjs";

const NOW_ISO = "2026-11-26T10:00:00.000Z";
const manifest = {
  tasks: { backend: "github", claim_ttl_minutes: 240, github: { project: "https://github.com/orgs/acme/projects/7", repo: "acme/board", claim_settle_ms: 0 } },
};

function make(fixtures) {
  const exec = replayExec(fixtures);
  const a = new GithubAdapter(createTempDir(), manifest, { exec, now: () => Date.parse(NOW_ISO), sleep: async () => {} });
  return { a, exec };
}

const count = (exec, operation) => exec.calls.filter((c) => c.operation === operation).length;
const lookups = (exec) => exec.calls.filter((c) => c.query === ISSUE_PROJECT_ITEMS_QUERY).map((c) => c.variables.number);
const ok = (n) => ({ data: Object.fromEntries(Array.from({ length: n }, (_, i) => [`f${i}`, { clientMutationId: null }])) });
const onProject = (spec, projectId = PROJECT_ID) => ({ ...itemNode(spec), project: { id: projectId } });

// The new issue: #300, never shown by the (lagging) listing of gh-1 and gh-2.
const N = 300;
const ITEM = `PVTI_fixture_${N}`;
const CONTENT = `I_fixture_${N}`;
const TITLE = "adev-fixture: just created";
const NEXT = "Run /adev:implement";
const fresh = { number: N, title: TITLE };
const noted = { ...fresh, fields: { next_action: NEXT } };
const claimed = { ...fresh, fields: { next_action: NEXT, owner: "agent-b", claimed_at: NOW_ISO } };
const LISTING = [task(1), task(2)];

const createEntries = [
  { query: CREATE_ISSUE, variables: { repositoryId: REPOSITORY_ID, title: TITLE, body: "" }, response: { data: { createIssue: { issue: { id: CONTENT, number: N } } } } },
  { query: ADD_TO_PROJECT, variables: { projectId: PROJECT_ID, contentId: CONTENT }, response: { data: { addProjectV2ItemById: { item: { id: ITEM } } } } },
  { ...setFieldsRequest(ITEM, [slot.status()]), response: ok(1) },
];

/** The n-th request of `query` with these variables sees the n-th spec. */
function sequenceOf(entry, responses) {
  return { query: entry.query, variables: entry.variables, sequence: responses.map((response) => ({ response })) };
}
const itemReads = (...specs) => sequenceOf({ query: PROJECT_ITEM_QUERY, variables: { itemId: ITEM } }, specs.map((spec) => ({ data: { node: itemNode(spec) } })));
const lookupsOf300 = (...specs) => sequenceOf(issueLookup(N, []), specs.map((spec) => issueLookup(N, [onProject(spec)]).response));

test("create, then get, update, claim and addDependency on the new ID all succeed while the listing omits it", async () => {
  const { a, exec } = make([
    ...buildBoard(LISTING),
    ...createEntries,
    itemReads(fresh, noted, noted, claimed, claimed),
    lookupsOf300(fresh, fresh, noted, claimed),
    { ...setFieldsRequest(ITEM, [slot.text("next_action", NEXT)]), response: ok(1) },
    { ...setFieldsRequest(ITEM, [slot.text("claimed_at", NOW_ISO), slot.text("owner", "agent-b")]), response: ok(2) },
    { query: ADD_BLOCKED_BY, variables: { issueId: CONTENT, blockingIssueId: "I_fixture_2" }, response: done("addBlockedBy") },
  ]);

  const created = await a.create({ title: TITLE });
  assert.equal(created.id, "gh-300");
  assert.equal((await a.get("gh-300")).title, TITLE);
  assert.equal((await a.update("gh-300", { next_action: NEXT })).next_action, NEXT);
  assert.equal((await a.claim("gh-300", "agent-b")).owner, "agent-b");
  await a.addDependency("gh-300", "gh-2");

  assert.deepEqual(lookups(exec), [300, 300, 300, 300, 2]);
  assert.equal(count(exec, "AddBlockedBy"), 1);

  // The listing still omits #300; this instance's own writes fill it in.
  const listed = (await a.list()).find((i) => i.id === "gh-300");
  assert.equal(listed.next_action, NEXT);
  assert.equal(listed.owner, "agent-b");
  assert.deepEqual(listed.dependencies, ["gh-2"]);
  assert.deepEqual((await a.list({ status: "open" })).map((i) => i.id).sort(), ["gh-1", "gh-2", "gh-300"]);
});

test("list() after a create includes the new item without re-reading the listing", async () => {
  const { a, exec } = make([...buildBoard(LISTING), ...createEntries, itemReads(fresh)]);
  assert.deepEqual((await a.list()).map((i) => i.id), ["gh-1", "gh-2"]);
  await a.create({ title: TITLE });
  assert.deepEqual((await a.list()).map((i) => i.id).sort(), ["gh-1", "gh-2", "gh-300"]);
  assert.equal(count(exec, "ProjectItems"), 1);
});

test("a later listing that still omits or shows stale an item this instance wrote does not drop or regress it", async () => {
  const stale = task(2, { fields: { next_action: "old" } });
  const updated = task(2, { fields: { next_action: NEXT } });
  const { a, exec } = make([
    ...buildBoard([task(1), stale]),
    ...createEntries,
    itemReads(fresh),
    { query: PROJECT_ITEM_QUERY, variables: { itemId: "PVTI_fixture_2" }, response: { data: { node: itemNode(updated) } } },
    { ...setFieldsRequest("PVTI_fixture_2", [slot.text("next_action", NEXT)]), response: ok(1) },
  ]);
  await a.create({ title: TITLE });
  await a.update("gh-2", { next_action: NEXT });

  const listed = await a.list();
  assert.equal(count(exec, "ProjectItems"), 1);
  assert.deepEqual(listed.map((i) => i.id).sort(), ["gh-1", "gh-2", "gh-300"]);
  assert.equal(listed.find((i) => i.id === "gh-2").next_action, NEXT);
});

test("a write GitHub rejects drops the instance's earlier read-back of that item: the listing decides again", async () => {
  const stale = task(2, { fields: { next_action: "old" } });
  const { a } = make([
    ...buildBoard([task(1), stale]),
    { query: PROJECT_ITEM_QUERY, variables: { itemId: "PVTI_fixture_2" }, response: { data: { node: itemNode(task(2, { fields: { next_action: NEXT } })) } } },
    { ...setFieldsRequest("PVTI_fixture_2", [slot.text("next_action", NEXT)]), response: ok(1) },
    { ...setFieldsRequest("PVTI_fixture_2", [slot.text("next_action", "Run /adev:validate")]), response: rejected("f0", "adev-fixture: rejected") },
  ]);
  await a.update("gh-2", { next_action: NEXT });
  assert.equal((await a.list()).find((i) => i.id === "gh-2").next_action, NEXT);
  await assert.rejects(a.update("gh-2", { next_action: "Run /adev:validate" }), { code: "GITHUB_WRITE_FAILED" });
  assert.equal((await a.list()).find((i) => i.id === "gh-2").next_action, "old");
});

test("another process's list() can lag a create, while its get() and claim() see the new item at once", async () => {
  const { a } = make([
    ...buildBoard(LISTING),
    issueLookup(N, [onProject(fresh)]),
    itemReads(fresh, claimed, claimed),
    { ...setFieldsRequest(ITEM, [slot.text("claimed_at", NOW_ISO), slot.text("owner", "agent-b")]), response: ok(2) },
  ]);
  assert.equal((await a.get("gh-300")).id, "gh-300");
  assert.equal((await a.claim("#300", "agent-b")).owner, "agent-b");

  const { a: other } = make([...buildBoard(LISTING), issueLookup(N, [onProject(fresh)])]);
  assert.deepEqual((await other.list()).map((i) => i.id), ["gh-1", "gh-2"]);
  assert.equal((await other.get("gh-300")).id, "gh-300");
});

test("an issue that exists but is on another project only is NOT_FOUND to every method", async () => {
  const { a, exec } = make([...buildBoard(LISTING), issueOffProject(404)]);
  assert.equal(await a.get("gh-404"), null);
  await assert.rejects(a.update("gh-404", { next_action: NEXT }), { code: "NOT_FOUND" });
  await assert.rejects(a.close("gh-404", "r"), { code: "NOT_FOUND" });
  await assert.rejects(a.claim("gh-404", "agent-b"), { code: "NOT_FOUND" });
  await assert.rejects(a.release("gh-404", "agent-b"), { code: "NOT_FOUND" });
  await assert.rejects(a.addDependency("gh-1", "gh-404"), { code: "NOT_FOUND" });
  await assert.rejects(a.create({ title: TITLE, parent_id: "gh-404" }), { code: "PARENT_NOT_FOUND" });
  assert.deepEqual(await a.walkTree("gh-404"), []);
  assert.ok(exec.calls.every((c) => !c.query.startsWith("mutation")));
});

test("a number that names no issue is NOT_FOUND: GitHub's NOT_FOUND error on the lookup becomes null", async () => {
  const { a, exec } = make([...buildBoard(LISTING), issueNotFound(405)]);
  assert.equal(await a.get("gh-405"), null);
  await assert.rejects(a.update("gh-405", { next_action: NEXT }), { code: "NOT_FOUND" });
  await assert.rejects(a.claim("gh-405", "agent-b"), { code: "NOT_FOUND" });
  await assert.rejects(a.addDependency("gh-405", "gh-1"), { code: "NOT_FOUND" });
  await assert.rejects(a.create({ title: TITLE, dependencies: ["gh-405"] }), { code: "NOT_FOUND" });
  assert.ok(exec.calls.every((c) => !c.query.startsWith("mutation")));
});

test("any other GitHub error on the lookup is thrown, never read as not found", async () => {
  const forbidden = {
    query: ISSUE_PROJECT_ITEMS_QUERY,
    variables: { owner: "acme", name: "board", number: 406 },
    response: { data: { repository: { issue: null } }, errors: [{ type: "FORBIDDEN", path: ["repository", "issue"], message: "adev-fixture: no access" }] },
  };
  const { a } = make([...buildBoard(LISTING), forbidden]);
  await assert.rejects(a.get("gh-406"), { code: "GITHUB_PERMISSION_DENIED" });
});

test("an issue on several projects resolves to its item on the configured project", async () => {
  const other = { ...onProject(fresh, "PVT_other"), id: "PVTI_other_300" };
  const { a } = make([...buildBoard(LISTING), issueLookup(N, [other, onProject(noted)])]);
  const issue = await a.get("gh-300");
  assert.equal(issue.next_action, NEXT);
});

test("the project-items connection of the lookup pages with the BEH-10 bound and repeated-cursor rule", async () => {
  const variables = { owner: "acme", name: "board", number: N };
  const pageOf = (nodes, { totalCount = 2, hasNextPage = false, endCursor = null } = {}) => ({
    data: { repository: { issue: { projectItems: { totalCount, pageInfo: { hasNextPage, endCursor }, nodes } } } },
  });
  const other = { ...onProject(fresh, "PVT_other"), id: "PVTI_other_300" };

  const paged = make([
    ...buildBoard(LISTING),
    { query: ISSUE_PROJECT_ITEMS_QUERY, variables, response: pageOf([other], { hasNextPage: true, endCursor: "pi-1" }) },
    { query: ISSUE_PROJECT_ITEMS_QUERY, variables: { ...variables, after: "pi-1" }, response: pageOf([onProject(noted)]) },
  ]);
  assert.equal((await paged.a.get("gh-300")).next_action, NEXT);
  assert.deepEqual(paged.exec.calls.filter((c) => c.query === ISSUE_PROJECT_ITEMS_QUERY).map((c) => c.variables.after), [undefined, "pi-1"]);

  const repeated = make([
    ...buildBoard(LISTING),
    { query: ISSUE_PROJECT_ITEMS_QUERY, variables, response: pageOf([other], { totalCount: 300, hasNextPage: true, endCursor: "pi-1" }) },
    { query: ISSUE_PROJECT_ITEMS_QUERY, variables: { ...variables, after: "pi-1" }, response: pageOf([], { totalCount: 300, hasNextPage: true, endCursor: "pi-1" }) },
  ]);
  await assert.rejects(repeated.a.get("gh-300"), { code: "GITHUB_PAGINATION_INVALID" });

  // totalCount 1 bounds the connection at ceil(1/100) + 1 = 2 pages; a third is served.
  const overBound = make([
    ...buildBoard(LISTING),
    { query: ISSUE_PROJECT_ITEMS_QUERY, variables, response: pageOf([], { totalCount: 1, hasNextPage: true, endCursor: "pi-1" }) },
    { query: ISSUE_PROJECT_ITEMS_QUERY, variables: { ...variables, after: "pi-1" }, response: pageOf([], { totalCount: 1, hasNextPage: true, endCursor: "pi-2" }) },
    { query: ISSUE_PROJECT_ITEMS_QUERY, variables: { ...variables, after: "pi-2" }, response: pageOf([onProject(noted)], { totalCount: 1 }) },
  ]);
  await assert.rejects(overBound.a.get("gh-300"), { code: "GITHUB_PAGINATION_INVALID" });
});

test("a directly read item decodes exactly as the listing decodes it", async () => {
  const { a } = make(board.full);
  const listed = new Map([...(await a.list()), ...(await a.listEpics())].map((i) => [i.id, i]));
  for (const id of ["gh-1", "gh-2", "gh-5", "gh-8", "gh-20", "gh-21", "gh-30", "gh-40", "gh-50", "gh-60"]) {
    assert.deepEqual(await a.get(id), listed.get(id), id);
  }
});

test("old IDs still resolve through the listing's Legacy ID text, with no direct lookup", async () => {
  const { a, exec } = make(board.migrated);
  assert.equal((await a.get("issue-7k3f9a")).id, "gh-41");
  assert.equal((await a.get("bd-a1b2c3")).id, "gh-44");
  await assert.rejects(a.get("epic-2"), { code: "GITHUB_AMBIGUOUS_LEGACY_ID" });
  assert.equal(await a.get("issue-zzzzzz"), null);
  assert.deepEqual(lookups(exec), []);
  assert.equal(count(exec, "ProjectItems"), 1);
  assert.ok(exec.calls.some((c) => c.query === PROJECT_ITEMS_QUERY));
});
