import { after, test } from "node:test";
import assert from "node:assert/strict";
import { GithubAdapter } from "../../../lib/issues/github-adapter.mjs";
import { createTransport } from "../../../lib/issues/github/transport.mjs";
import { PROJECT_ITEMS_QUERY, SUB_ISSUES_PAGE_QUERY, BLOCKED_BY_PAGE_QUERY } from "../../../lib/issues/github/queries.mjs";
import { replayExec } from "./replay-transport.mjs";
import { board, buildBoard } from "./fixtures/board.mjs";
import { createTempDir, cleanupTempDir } from "../../helpers.mjs";

const manifest = { tasks: { backend: "github", github: { project: "https://github.com/orgs/acme/projects/7", repo: "acme/board" } } };
const dirs = [];
after(() => dirs.forEach(cleanupTempDir));

function adapterFor(entries) {
  const exec = replayExec(entries);
  const dir = createTempDir();
  dirs.push(dir);
  return { a: new GithubAdapter(dir, manifest, { exec }), exec };
}

const task = (number, extra = {}) => ({ number, issueType: "Task", ...extra });
const tasks = (count) => Array.from({ length: count }, (_, i) => task(i + 1));
const callsOf = (exec, query) => exec.calls.filter((c) => c.query === query);
const entriesOf = (entries, query) => entries.filter((e) => e.query === query);
const firstPageBound = (totalCount) => Math.ceil(totalCount / 100) + 1;

// Fresh, never-repeated cursors; the last page ends the connection, so a read
// that never trips its bound completes rather than running out of recordings.
function freshChain(count, prefix, { firstAfter } = {}) {
  return Array.from({ length: count }, (_, i) => ({
    after: i === 0 ? firstAfter : `${prefix}-${i}`,
    endCursor: i === count - 1 ? null : `${prefix}-${i + 1}`,
    hasNextPage: i < count - 1,
  }));
}

// Item pages whose totalCount starts at `firstTotal` and grows by 100 on every
// response, recorded two pages past the page the first-page bound must stop at.
function growingItemsBoard(firstTotal) {
  const stopPage = firstPageBound(firstTotal) + 1;
  const entries = buildBoard(tasks(Math.min(firstTotal, 3)), { pages: freshChain(stopPage + 2, "grow") });
  entriesOf(entries, PROJECT_ITEMS_QUERY).forEach((e, i) => { e.response.data.node.items.totalCount = firstTotal + 100 * i; });
  return { entries, stopPage };
}

function firstItemsPage(entries) {
  return entriesOf(entries, PROJECT_ITEMS_QUERY)[0].response.data.node.items;
}

// One item whose `key` connection embeds a first page reporting `embeddedTotal`
// and is continued by `chainLength` fresh-cursor pages reporting `continuationTotal(i)`.
function continuedBoard(key, embeddedTotal, chainLength, continuationTotal) {
  const prefix = `${key}-c`;
  const chain = freshChain(chainLength + 1, prefix).slice(1);
  const specs = key === "subIssues"
    ? [task(1, { offProjectChildren: [900, 901, 902], subIssuesEmbedded: 1, subIssuesChain: chain })]
    : [task(1, { blockedBy: [{ number: 9 }, { number: 10 }, { number: 11 }], blockedByEmbedded: 1, blockedByChain: chain }), task(9), task(10), task(11)];
  const entries = buildBoard(specs);
  const query = key === "subIssues" ? SUB_ISSUES_PAGE_QUERY : BLOCKED_BY_PAGE_QUERY;
  firstItemsPage(entries).nodes[0].content[key].totalCount = embeddedTotal;
  entriesOf(entries, query).forEach((e, i) => { e.response.data.node[key].totalCount = continuationTotal(i); });
  return { entries, query };
}

// A growing continuation: page 1 is the embedded page, continuation page i is page i + 2.
function growingContinuationBoard(key, embeddedTotal) {
  const stopPage = firstPageBound(embeddedTotal) + 1;
  const { entries, query } = continuedBoard(key, embeddedTotal, stopPage + 1, (i) => embeddedTotal + 100 * (i + 1));
  return { entries, query, stopPage };
}

const INVALID_TOTAL_COUNTS = [["the string \"250\"", "250"], ["-1", -1], ["1.5", 1.5], ["null", null], ["2^53, past MAX_SAFE_INTEGER", 2 ** 53]];

for (const firstTotal of [0, 100, 101, 250]) {
  test(`item pages: totalCount ${firstTotal} growing by 100 per response with fresh cursors throws at page ceil(${firstTotal}/100) + 2`, async () => {
    const { entries, stopPage } = growingItemsBoard(firstTotal);
    const { a, exec } = adapterFor(entries);
    await assert.rejects(a.list({}), { code: "GITHUB_PAGINATION_INVALID" });
    assert.equal(callsOf(exec, PROJECT_ITEMS_QUERY).length, stopPage);
  });
}

test("item pages: a totalCount that falls after the first page keeps the first page's bound", async () => {
  const entries = buildBoard(tasks(250), { pages: freshChain(4, "items") });
  entriesOf(entries, PROJECT_ITEMS_QUERY).forEach((e, i) => { if (i > 0) e.response.data.node.items.totalCount = 100; });
  const { a, exec } = adapterFor(entries);
  assert.equal((await a.list({})).length, 250);
  assert.equal(callsOf(exec, PROJECT_ITEMS_QUERY).length, 4);
});

test("item pages: a normal 250-item read issues exactly 3 item-page requests", async () => {
  const { a, exec } = adapterFor(board.full);
  await a.list({});
  assert.equal(callsOf(exec, PROJECT_ITEMS_QUERY).length, 3);
});

test("item pages: a first-page totalCount of exactly MAX_SAFE_INTEGER is accepted", async () => {
  const entries = buildBoard(tasks(3));
  firstItemsPage(entries).totalCount = Number.MAX_SAFE_INTEGER;
  const { a } = adapterFor(entries);
  assert.deepEqual((await a.list({})).map((i) => i.id).sort(), ["gh-1", "gh-2", "gh-3"]);
});

for (const [label, value] of INVALID_TOTAL_COUNTS) {
  for (const pageCount of [1, 2]) {
    test(`item pages: a first page with totalCount ${label} throws on that page (${pageCount} page(s) recorded)`, async () => {
      const entries = buildBoard(tasks(3), { pages: freshChain(pageCount, "items") });
      firstItemsPage(entries).totalCount = value;
      const { a, exec } = adapterFor(entries);
      await assert.rejects(a.list({}), { code: "GITHUB_PAGINATION_INVALID" });
      assert.equal(callsOf(exec, PROJECT_ITEMS_QUERY).length, 1);
    });
  }
}

test("item pages: a first-page totalCount that JSON decodes to Infinity throws on that page", () => {
  const page = '{"data":{"node":{"items":{"totalCount":1e400,"pageInfo":{"hasNextPage":false,"endCursor":null},"nodes":[1]}}}}';
  let requests = 0;
  const exec = () => { requests += 1; return page; };
  assert.throws(
    () => createTransport({ exec, env: {} }).paginate("query Items($after:String){x}", {}, { connectionPath: ["node", "items"] }),
    { code: "GITHUB_PAGINATION_INVALID" },
  );
  assert.equal(requests, 1);
});

for (const [key, totals] of [["subIssues", [0, 3, 100, 101]], ["blockedBy", [3, 101]]]) {
  for (const embeddedTotal of totals) {
    test(`${key} continuation: embedded totalCount ${embeddedTotal} with continuation pages growing by 100 throws at page ceil(${embeddedTotal}/100) + 2`, async () => {
      const { entries, query, stopPage } = growingContinuationBoard(key, embeddedTotal);
      const { a, exec } = adapterFor(entries);
      await assert.rejects(a.list({}), { code: "GITHUB_PAGINATION_INVALID" });
      assert.equal(callsOf(exec, query).length, stopPage - 1);
    });
  }

  for (const [label, value] of INVALID_TOTAL_COUNTS) {
    test(`${key} continuation: an embedded first page with totalCount ${label} throws before any continuation request`, async () => {
      const { entries, query } = continuedBoard(key, value, 1, () => 3);
      const { a, exec } = adapterFor(entries);
      await assert.rejects(a.list({}), { code: "GITHUB_PAGINATION_INVALID" });
      assert.equal(callsOf(exec, query).length, 0);
    });
  }
}

test("continuation pages never count toward the item-page bound", async () => {
  const { entries } = continuedBoard("subIssues", 250, 3, () => 250);
  firstItemsPage(entries).totalCount = 100;
  const { a, exec } = adapterFor(entries);
  assert.deepEqual((await a.list({})).map((i) => i.id), ["gh-1"]);
  assert.equal(callsOf(exec, PROJECT_ITEMS_QUERY).length, 1);
  assert.equal(callsOf(exec, SUB_ISSUES_PAGE_QUERY).length, 3);
});
