import { test } from "node:test";
import assert from "node:assert/strict";
import { GithubAdapter } from "../../../lib/issues/github-adapter.mjs";
import { replayExec } from "./replay-transport.mjs";
import { createTempDir } from "../../helpers.mjs";
import { board } from "./fixtures/board.mjs"; // 250 items, 2 epics, nested sub-issues, one cross-repo item, one draft, one PR
import { GITHUB_ERROR_CODES } from "../../../lib/issues/github/errors.mjs";
import { PREFLIGHT_QUERY, PROJECT_ITEMS_QUERY, SUB_ISSUES_PAGE_QUERY, BLOCKED_BY_PAGE_QUERY } from "../../../lib/issues/github/queries.mjs";
import { DEFAULT_CLAIM_TTL_MINUTES } from "../../../lib/issues/interface.mjs";

const manifest = { tasks: { backend: "github", github: { project: "https://github.com/orgs/acme/projects/7", repo: "acme/board" } } };
const adapter = (fx) => { const exec = replayExec(fx); return { a: new GithubAdapter(createTempDir(), manifest, { exec }), exec }; };

test("list: ceil(250/100) item pages, drafts and PRs ignored, epics separated", async () => {
  const { a, exec } = adapter(board.full);
  const issues = await a.list({});
  assert.equal(exec.calls.filter((c) => c.query.startsWith("query ProjectItems")).length, 3);
  assert.ok(issues.every((i) => /^gh-/.test(i.id)));
  assert.equal((await a.listEpics()).length, 2);
});

test("walkTree: transitive sub-issues on the project, sorted; a cycle throws", async () => {
  const { a } = adapter(board.full);
  assert.deepEqual((await a.walkTree("gh-1")).map((i) => i.id), ["gh-2", "gh-3", "gh-4"]);
  const { a: cyclic } = adapter(board.cycle);
  await assert.rejects(cyclic.walkTree("gh-1"), { code: "GITHUB_SUBISSUE_CYCLE" });
});

test("old IDs resolve through legacy_id; ambiguity refused; unknown → null", async () => {
  const { a } = adapter(board.migrated);
  assert.equal((await a.get("issue-7k3f9a")).id, "gh-41");
  await assert.rejects(a.get("epic-2"), { code: "GITHUB_AMBIGUOUS_LEGACY_ID" });
  assert.equal(await a.get("issue-zzzzzz"), null);
  assert.equal(await a.get("gh-99999"), null);
});

// ---------------------------------------------------------------------------
// Added cases (thorough depth): BEH-9, BEH-10, BEH-11, BEH-34, plus the
// BEH-39 / BEH-12 "name every offending item, no partial result" rule on read.
// ---------------------------------------------------------------------------

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => `gh-${from + i}`);
const ids = (items) => items.map((i) => i.id);
const sortedIds = (items) => ids(items).sort();
// An ID is named when it is not part of a longer ID: `gh-2` must not match inside
// `gh-20` or `gh-acme.api.2`, while a sentence-ending `.` after it is allowed.
const names = (id) => new RegExp(`(?<![\\w.-])${id.replace(/\./g, "\\.")}(?![\\w-]|\\.\\w)`);

// Home #2-#247 minus epic #5, plus the cross-repo acme/api#7.
const FULL_ISSUE_IDS = [...range(2, 4), ...range(6, 247), "gh-acme.api.7"].sort();

function rejectsNaming(code, ...offenders) {
  return (err) => {
    assert.equal(err.code, code);
    for (const id of offenders) assert.match(err.message, names(id), `message names ${id}`);
    return true;
  };
}

test("constructor: validates tasks.github synchronously and makes no request", () => {
  const exec = replayExec(board.full);
  const a = new GithubAdapter(createTempDir(), manifest, { exec });
  assert.equal(a.name, "github");
  assert.equal(exec.calls.length, 0);

  const bad = { tasks: { backend: "github", github: { project: "https://gitlab.com/acme/projects/7", repo: "acme/board" } } };
  assert.throws(() => new GithubAdapter(createTempDir(), bad, { exec }), { code: "GITHUB_INVALID_CONFIG", key: "project" });
  assert.equal(exec.calls.length, 0);
});

test("constructor: claimTtlMinutes comes from tasks.claim_ttl_minutes, else the shared default", () => {
  assert.equal(adapter(board.full).a.claimTtlMinutes, DEFAULT_CLAIM_TTL_MINUTES);
  const withTtl = { tasks: { ...manifest.tasks, claim_ttl_minutes: 90 } };
  assert.equal(new GithubAdapter(createTempDir(), withTtl, { exec: replayExec(board.full) }).claimTtlMinutes, 90);
});

test("error codes: the read path's codes are registered", () => {
  assert.equal(GITHUB_ERROR_CODES.GITHUB_SUBISSUE_CYCLE, "GITHUB_SUBISSUE_CYCLE");
  assert.equal(GITHUB_ERROR_CODES.GITHUB_AMBIGUOUS_LEGACY_ID, "GITHUB_AMBIGUOUS_LEGACY_ID");
});

test("queries: items and continuation documents are named operations paging 100 with $after", () => {
  assert.match(PROJECT_ITEMS_QUERY, /^query ProjectItems\b/);
  assert.match(PROJECT_ITEMS_QUERY, /\$projectId: ID!/);
  assert.match(PROJECT_ITEMS_QUERY, /\$after: String\b/);
  assert.match(PROJECT_ITEMS_QUERY, /items\(\s*first:\s*100\s*,\s*after:\s*\$after\s*\)/);
  for (const [doc, connection] of [[SUB_ISSUES_PAGE_QUERY, "subIssues"], [BLOCKED_BY_PAGE_QUERY, "blockedBy"]]) {
    assert.match(doc, /^query [A-Za-z_][A-Za-z0-9_]*\(/);
    assert.match(doc, /\$issueId: ID!/);
    assert.match(doc, /\$after: String\b/);
    assert.match(doc, new RegExp(`${connection}\\(\\s*first:\\s*100\\s*,\\s*after:\\s*\\$after\\s*\\)`));
  }
  assert.notEqual(SUB_ISSUES_PAGE_QUERY, BLOCKED_BY_PAGE_QUERY);
});

test("list: returns exactly the 246 non-epic issues; the PR and draft never surface", async () => {
  const { a } = adapter(board.full);
  const issues = await a.list({});
  assert.deepEqual(sortedIds(issues), FULL_ISSUE_IDS);
  assert.equal(await a.get("gh-300"), null);
  assert.ok(!JSON.stringify(issues).includes("adev-fixture: draft"));
});

test("list: decoded issues expose no project-item or content node IDs", async () => {
  const { a } = adapter(board.full);
  const text = JSON.stringify([...(await a.list({})), ...(await a.listEpics())]);
  assert.doesNotMatch(text, /PVTI_fixture|I_fixture/);
});

test("list: filters use the json adapter's semantics over decoded items", async () => {
  const { a } = adapter(board.full);
  assert.deepEqual(sortedIds(await a.list({ status: "closed" })), ["gh-20", "gh-21"]);
  assert.deepEqual(sortedIds(await a.list({ status: "in_progress" })), ["gh-30", "gh-31"]);
  assert.deepEqual(sortedIds(await a.list({ status: "deferred" })), ["gh-40"]);
  assert.deepEqual(sortedIds(await a.list({ type: "bug" })), ["gh-50", "gh-51"]);
  assert.deepEqual(sortedIds(await a.list({ planRef: "plans/alpha.md" })), ["gh-60"]);
  assert.deepEqual(sortedIds(await a.list({ status: "deferred", type: "bug" })), []);
});

test("list: epicId returns the epic's direct children, accepting the forms get() accepts", async () => {
  const { a } = adapter(board.full);
  for (const input of ["gh-5", "#5", "5", "acme/board#5", "https://github.com/acme/board/issues/5"]) {
    assert.deepEqual(sortedIds(await a.list({ epicId: input })), ["gh-6", "gh-acme.api.7"], input);
  }
  assert.deepEqual(sortedIds(await a.list({ epicId: "gh-1" })), ["gh-2", "gh-4"]);
  assert.deepEqual(sortedIds(await a.list({ epicId: "gh-5", status: "closed" })), []);
  assert.deepEqual(await a.list({ epicId: "gh-99999" }), []);
});

test("list: epicId resolves an old epic ID through legacy_id", async () => {
  const { a } = adapter(board.migratedEpic);
  assert.deepEqual(sortedIds(await a.list({ epicId: "epic-9" })), ["gh-2", "gh-3"]);
});

test("old IDs never match Legacy ID text the legacy_id predicate refuses", async () => {
  const { a } = adapter(board.migratedUntrimmed);
  assert.equal(await a.get("issue-9q"), null);
  await assert.rejects(a.get(" issue-9q "), { code: "GITHUB_INVALID_ID" });
  assert.equal((await a.get("issue-7k3f9a")).id, "gh-41");
});

test("listEpics: Epic membership only, with status and milestone filters", async () => {
  const { a } = adapter(board.full);
  const epics = await a.listEpics();
  assert.deepEqual(sortedIds(epics), ["gh-1", "gh-5"]);
  assert.ok(epics.every((e) => e.type === "epic"));
  assert.deepEqual(ids(await a.listEpics({ status: "in_progress" })), ["gh-5"]);
  assert.deepEqual(ids(await a.listEpics({ milestone: "v1" })), ["gh-1"]);
  assert.deepEqual(ids(await a.listEpics({ milestone: "v9" })), []);
});

test("read: one preflight and one paged item read serve every later read on the adapter", async () => {
  const { a, exec } = adapter(board.full);
  await a.list({});
  await a.listEpics();
  await a.get("gh-8");
  await a.walkTree("gh-1");
  assert.equal(exec.calls.filter((c) => c.query === PREFLIGHT_QUERY).length, 1);
  assert.equal(exec.calls.filter((c) => c.query === PROJECT_ITEMS_QUERY).length, 3);
  assert.deepEqual(exec.calls.filter((c) => c.query === PROJECT_ITEMS_QUERY).map((c) => c.variables), [
    { projectId: "PVT_fixture" },
    { projectId: "PVT_fixture", after: "items-1" },
    { projectId: "PVT_fixture", after: "items-2" },
  ]);
  assert.equal(exec.calls[0].query, PREFLIGHT_QUERY);
});

test("read: connections are continued only for the items whose first page is short", async () => {
  const { a, exec } = adapter(board.full);
  await a.list({});
  const blocked = exec.calls.filter((c) => c.query === BLOCKED_BY_PAGE_QUERY);
  assert.deepEqual(blocked.map((c) => c.variables), [{ issueId: "I_fixture_8", after: "bb-I_fixture_8-1" }]);
  // Sub-issue continuation is optional (parent links already carry every on-project
  // child) but, when sent, may target only gh-1, the one item whose page is short.
  const sub = exec.calls.filter((c) => c.query === SUB_ISSUES_PAGE_QUERY);
  assert.deepEqual(sub.map((c) => c.variables).filter((v) => v.issueId !== "I_fixture_1"), []);
  const known = new Set([PREFLIGHT_QUERY, PROJECT_ITEMS_QUERY, BLOCKED_BY_PAGE_QUERY, SUB_ISSUES_PAGE_QUERY]);
  assert.deepEqual(exec.calls.filter((c) => !known.has(c.query)).map((c) => c.operation), []);
});

test("read: a continued blocked-by connection yields every dependency in order", async () => {
  const { a } = adapter(board.full);
  assert.deepEqual((await a.get("gh-8")).dependencies, ["gh-9", "gh-10", "gh-11"]);
  assert.deepEqual((await a.get("gh-9")).dependencies, []);
});

test("read: a separate adapter performs its own read", async () => {
  const first = adapter(board.full);
  await first.a.list({});
  const second = adapter(board.full);
  await second.a.list({});
  assert.equal(second.exec.calls.filter((c) => c.query === PROJECT_ITEMS_QUERY).length, 3);
});

test("pagination: a repeated cursor throws GITHUB_PAGINATION_INVALID with no partial result", async () => {
  for (const call of [(a) => a.list({}), (a) => a.listEpics(), (a) => a.walkTree("gh-1"), (a) => a.get("gh-1")]) {
    const { a } = adapter(board.repeatedCursor);
    await assert.rejects(call(a), { code: "GITHUB_PAGINATION_INVALID" });
  }
});

test("pagination: more pages than ceil(totalCount/100) + 1 throws GITHUB_PAGINATION_INVALID", async () => {
  const { a, exec } = adapter(board.overBound);
  await assert.rejects(a.list({}), { code: "GITHUB_PAGINATION_INVALID" });
  assert.equal(exec.calls.filter((c) => c.query === PROJECT_ITEMS_QUERY).length, 3);
});

test("preflight runs before every public read and its failure stops the read", async () => {
  for (const call of [(a) => a.list({}), (a) => a.listEpics(), (a) => a.walkTree("gh-1"), (a) => a.get("gh-1")]) {
    const { a, exec } = adapter(board.projectMissing);
    await assert.rejects(call(a), { code: "GITHUB_PROJECT_NOT_FOUND" });
    assert.deepEqual(exec.calls.map((c) => c.query), [PREFLIGHT_QUERY]);
  }
});

test("walkTree: nested children, a cross-repo child, off-project sub-issues excluded, leaves empty", async () => {
  const { a } = adapter(board.full);
  assert.deepEqual(ids(await a.walkTree("gh-5")), ["gh-6", "gh-acme.api.7"]);
  assert.deepEqual(ids(await a.walkTree("gh-2")), ["gh-3"]);
  assert.deepEqual(ids(await a.walkTree("gh-4")), []);
  assert.equal(await a.get("gh-900"), null);
  const tree = await a.walkTree("gh-1");
  assert.deepEqual(tree.map((i) => [i.id, i.parent_id]), [["gh-2", "gh-1"], ["gh-3", "gh-2"], ["gh-4", "gh-1"]]);
});

test("walkTree: accepts display forms and URLs of the parent", async () => {
  const { a } = adapter(board.full);
  for (const input of ["#1", "1", "acme/board#1", "https://github.com/acme/board/issues/1"]) {
    assert.deepEqual(ids(await a.walkTree(input)), ["gh-2", "gh-3", "gh-4"], input);
  }
});

test("walkTree: the cycle error carries no partial result and names the revisited item", async () => {
  const { a } = adapter(board.cycle);
  await assert.rejects(a.walkTree("gh-2"), (err) => {
    assert.equal(err.code, "GITHUB_SUBISSUE_CYCLE");
    // gh-2 -> gh-3 -> gh-1 -> gh-2: the walk from gh-2 revisits gh-2 itself.
    assert.equal(err.id, "gh-2");
    assert.match(err.message, names("gh-2"));
    return true;
  });
});

test("get: canonical, display and URL inputs all return the canonical item", async () => {
  const { a } = adapter(board.full);
  for (const input of ["gh-41", "#41", "41", "acme/board#41", "https://github.com/acme/board/issues/41"]) {
    assert.equal((await a.get(input)).id, "gh-41", input);
  }
  const cross = await a.get("acme/api#7");
  assert.equal(cross.id, "gh-acme.api.7");
  assert.equal(cross.parent_id, "gh-5");
  assert.equal((await a.get("https://github.com/acme/api/issues/7")).id, "gh-acme.api.7");
  assert.equal((await a.get("gh-7")).id, "gh-7");
  assert.equal((await a.get("gh-7")).parent_id, null);
});

test("get: a non-github URL or an unparseable input throws GITHUB_INVALID_ID", async () => {
  const { a } = adapter(board.full);
  await assert.rejects(a.get("https://gitlab.com/acme/board/issues/41"), { code: "GITHUB_INVALID_ID" });
  await assert.rejects(a.get("https://github.com/acme/board/pull/300"), { code: "GITHUB_INVALID_ID" });
});

test("get: legacy flat, beads and tiered IDs resolve to the item and keep legacy_id", async () => {
  const { a } = adapter(board.migrated);
  for (const [legacy, id] of [["issue-7k3f9a", "gh-41"], ["bd-a1b2c3", "gh-44"], ["e1.f2", "gh-45"]]) {
    const issue = await a.get(legacy);
    assert.equal(issue.id, id, legacy);
    assert.equal(issue.legacy_id, legacy, legacy);
  }
  assert.equal((await a.get("gh-46")).legacy_id, undefined);
  assert.equal(await a.get("e9.f9"), null);
  assert.equal(await a.get("bd-zzzzzz"), null);
});

test("get: an ambiguous legacy ID names every matching item", async () => {
  const { a } = adapter(board.migrated);
  await assert.rejects(a.get("epic-2"), rejectsNaming("GITHUB_AMBIGUOUS_LEGACY_ID", "gh-42", "gh-43"));
});

test("unmapped status: list and walkTree name every offending ID; get names its ID and option", async () => {
  const { a } = adapter(board.unmapped);
  await assert.rejects(a.list({}), rejectsNaming("GITHUB_UNMAPPED_STATUS", "gh-2", "gh-4"));
  await assert.rejects(a.walkTree("gh-1"), rejectsNaming("GITHUB_UNMAPPED_STATUS", "gh-2", "gh-4"));
  await assert.rejects(a.get("gh-4"), (err) => {
    rejectsNaming("GITHUB_UNMAPPED_STATUS", "gh-4")(err);
    assert.match(err.message, /Parked/);
    return true;
  });
});

test("invalid field value: list and walkTree name every offending item; get names its ID and field", async () => {
  const { a } = adapter(board.invalidFields);
  await assert.rejects(a.list({}), rejectsNaming("GITHUB_INVALID_FIELD_VALUE", "gh-2", "gh-3"));
  await assert.rejects(a.walkTree("gh-1"), rejectsNaming("GITHUB_INVALID_FIELD_VALUE", "gh-2", "gh-3"));
  await assert.rejects(a.get("gh-3"), (err) => {
    rejectsNaming("GITHUB_INVALID_FIELD_VALUE", "gh-3")(err);
    assert.match(err.message, /spec_ref/);
    return true;
  });
});

test("type_source auto: an owner with issue types but no typed items still ignores type labels", async () => {
  const { a, exec } = adapter(board.typedOwnerUntypedItems);
  assert.deepEqual(ids(await a.listEpics()), []);
  assert.equal((await a.get("gh-1")).type, "task");
  assert.equal((await a.get("gh-2")).type, "task");
  const known = new Set([PREFLIGHT_QUERY, PROJECT_ITEMS_QUERY]);
  assert.deepEqual(exec.calls.filter((c) => !known.has(c.query)).map((c) => c.operation), []);
});

test("type_source auto: an owner without issue types decodes type and Epic membership from labels", async () => {
  const { a } = adapter(board.untypedOwner);
  assert.deepEqual(ids(await a.listEpics()), ["gh-1"]);
  assert.equal((await a.get("gh-2")).type, "bug");
  assert.deepEqual(ids(await a.walkTree("gh-1")), ["gh-2"]);
});

test("type_source auto: a board mixing owners decodes each item by its own owner's mode", async () => {
  const { a } = adapter(board.mixedOwners);
  assert.deepEqual(sortedIds(await a.listEpics()), ["gh-2", "gh-beta.tools.3"]);
  assert.equal((await a.get("gh-1")).type, "task");
  assert.equal((await a.get("acme/api#8")).type, "task");
  assert.equal((await a.get("beta/tools#4")).type, "bug");
  assert.equal((await a.get("beta/tools#5")).type, "task");
});

test("queries: the items page reads each repository's issue-type availability and the labels totalCount", () => {
  assert.match(PROJECT_ITEMS_QUERY, /repository\s*\{\s*name\s+owner\s*\{\s*login\s*\}\s*issueTypes\(\s*first:\s*1\s*\)\s*\{\s*totalCount\s*\}/);
  assert.match(PROJECT_ITEMS_QUERY, /labels\(\s*first:\s*100\s*\)\s*\{\s*totalCount\b/);
});

test("labels: more labels than the embedded page throws GITHUB_PAGINATION_INVALID naming the item", async () => {
  for (const call of [(a) => a.list({}), (a) => a.listEpics(), (a) => a.walkTree("gh-1"), (a) => a.get("gh-1")]) {
    const { a } = adapter(board.truncatedLabels);
    await assert.rejects(call(a), rejectsNaming("GITHUB_PAGINATION_INVALID", "gh-2"));
  }
});

for (const [name, fx, query, sent] of [
  ["blocked-by repeated cursor", "blockedByRepeatedCursor", BLOCKED_BY_PAGE_QUERY, 1],
  ["blocked-by page bound", "blockedByOverBound", BLOCKED_BY_PAGE_QUERY, 2],
  ["sub-issue repeated cursor", "subIssuesRepeatedCursor", SUB_ISSUES_PAGE_QUERY, 1],
  ["sub-issue page bound", "subIssuesOverBound", SUB_ISSUES_PAGE_QUERY, 2],
]) {
  test(`continuation: a ${name} throws GITHUB_PAGINATION_INVALID with no partial result`, async () => {
    for (const call of [(a) => a.list({}), (a) => a.listEpics(), (a) => a.walkTree("gh-1"), (a) => a.get("gh-9")]) {
      const { a, exec } = adapter(board[fx]);
      await assert.rejects(call(a), { code: "GITHUB_PAGINATION_INVALID" });
      assert.equal(exec.calls.filter((c) => c.query === query).length, sent);
    }
  });
}
