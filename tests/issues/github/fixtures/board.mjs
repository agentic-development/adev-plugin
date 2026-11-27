/**
 * Generated unit fixtures for the GitHub board read path. Not recorded: every
 * board is built from `rawItem()` and served through `replayExec`.
 *
 * Request contract these entries pin (any other document or variable set hits
 * UNRECORDED_GITHUB_REQUEST):
 *   - AdevPreflight, once, with the ORG_VARIABLES of preflight.mjs.
 *   - PROJECT_ITEMS_QUERY with `{ projectId }` (the preflight `projectId`), then
 *     `{ projectId, after }` per further page; the response is
 *     `{ node: { items: { totalCount, pageInfo, nodes } } }`.
 *   - BLOCKED_BY_PAGE_QUERY / SUB_ISSUES_PAGE_QUERY with `{ issueId, after }`,
 *     `issueId` being the item's content (Issue) node id and `after` the
 *     embedded connection's endCursor; the response is
 *     `{ node: { blockedBy|subIssues: { totalCount, pageInfo, nodes } } }`.
 *   - ISSUE_PROJECT_ITEMS_QUERY with `{ owner: "acme", name: "board", number }` for
 *     every home-repo Issue item: how a gh-<n> ID resolves. The response is
 *     `{ repository: { issue: { projectItems: { totalCount, pageInfo, nodes } } } }`,
 *     whose one node is the item exactly as the items page carries it plus
 *     `project: { id: PROJECT_ID }`. `issueNotFound(n)` and `issueOffProject(n)`
 *     build the answers for a number with no issue and for an issue that is on
 *     another project only; buildBoard records the first for each pull request
 *     and the second for each home-repo `offProjectChildren` number.
 *   - Nothing else: `type_source: auto` must be resolved from these responses,
 *     through each Issue's `repository.issueTypes.totalCount`.
 *
 * Every Issue's content carries `parent`, a `blockedBy` connection and a
 * `subIssues` connection (`{ totalCount, pageInfo: { hasNextPage, endCursor },
 * nodes: [{ number, repository: { name, owner: { login } } }] }`), a `labels`
 * connection with `totalCount`, and `repository.issueTypes: { totalCount }`
 * (non-zero for the repos in `typedRepos`, by default acme/board and acme/api,
 * so the acme owner has issue types). Epics carry
 * both the `Epic` issue type and the `epic` label, and typed items both an
 * issue type and a matching `type:` label, so either typing mode decodes the
 * same board.
 */

import { rawItem } from "./items.mjs";
import { preflightFixture } from "./preflight.mjs";
import { PROJECT_ITEMS_QUERY, ISSUE_PROJECT_ITEMS_QUERY, SUB_ISSUES_PAGE_QUERY, BLOCKED_BY_PAGE_QUERY } from "../../../../lib/issues/github/queries.mjs";

export const PROJECT_ID = "PVT_fixture";
const PAGE_SIZE = 100;
const HOME = { owner: "acme", name: "board" };

function ref({ number, owner = HOME.owner, name = HOME.name }) {
  return { number, repository: { name, owner: { login: owner } } };
}

function keyOf({ number, owner = HOME.owner, name = HOME.name }) {
  return `${owner}/${name}#${number}`;
}

function connection(all, embedded, cursor) {
  const more = embedded < all.length;
  return {
    totalCount: all.length,
    pageInfo: { hasNextPage: more, endCursor: more ? cursor : null },
    nodes: all.slice(0, embedded),
  };
}

function continuation(query, key, issueId, all, embedded, cursor) {
  const rest = all.slice(embedded);
  return {
    query,
    variables: { issueId, after: cursor },
    response: { data: { node: { [key]: { totalCount: all.length, pageInfo: { hasNextPage: false, endCursor: null }, nodes: rest } } } },
  };
}

// An embedded first page followed by caller-chosen continuation pages (one node
// each), for pagination-violation boards. The embedded page's endCursor is the
// first continuation's `after`.
function chainedConnection(query, key, issueId, all, embedded, chain, entries) {
  chain.forEach((page, i) => {
    entries.push({
      query,
      variables: { issueId, after: page.after },
      response: {
        data: {
          node: {
            [key]: {
              totalCount: all.length,
              pageInfo: { hasNextPage: page.hasNextPage, endCursor: page.endCursor },
              nodes: all.slice(embedded + i, embedded + i + 1),
            },
          },
        },
      },
    });
  });
  return { totalCount: all.length, pageInfo: { hasNextPage: true, endCursor: chain[0].after }, nodes: all.slice(0, embedded) };
}

/**
 * One Issue item. `spec` is `rawItem()` options plus:
 *   `repo` ({ owner, name }) for a cross-repo item, `offProjectChildren` (numbers of
 *   home-repo sub-issues that are not project items), `blockedByEmbedded` /
 *   `subIssuesEmbedded` (how many nodes the items page embeds; the rest arrive
 *   through a continuation request), `blockedByChain` / `subIssuesChain` (explicit
 *   continuation pages, see chainedConnection), `labelsTotalCount` (the labels
 *   connection's totalCount, default the label count).
 */
function issueItem(spec, children, entries, typedRepos) {
  const { repo, offProjectChildren = [], blockedByEmbedded, subIssuesEmbedded, blockedByChain, subIssuesChain, labelsTotalCount, ...opts } = spec;
  const item = rawItem({ ...opts, repository: repo });
  const repoKey = `${item.content.repository.owner.login}/${item.content.repository.name}`;
  item.content.repository.issueTypes = { totalCount: typedRepos.has(repoKey) ? 5 : 0 };
  item.content.labels.totalCount = labelsTotalCount ?? item.content.labels.nodes.length;
  if (repo) {
    item.id = `PVTI_fixture_${repo.name}_${spec.number}`;
    item.content.id = `I_fixture_${repo.name}_${spec.number}`;
  }
  const issueId = item.content.id;

  const blockers = (spec.blockedBy ?? []).map(ref);
  const blockedEmbedded = blockedByEmbedded ?? blockers.length;
  item.content.blockedBy = blockedByChain
    ? chainedConnection(BLOCKED_BY_PAGE_QUERY, "blockedBy", issueId, blockers, blockedEmbedded, blockedByChain, entries)
    : connection(blockers, blockedEmbedded, `bb-${issueId}-1`);
  if (!blockedByChain && blockedEmbedded < blockers.length) {
    entries.push(continuation(BLOCKED_BY_PAGE_QUERY, "blockedBy", issueId, blockers, blockedEmbedded, `bb-${issueId}-1`));
  }

  const subs = [...children, ...offProjectChildren.map((number) => ref({ number }))];
  const subEmbedded = subIssuesEmbedded ?? subs.length;
  item.content.subIssues = subIssuesChain
    ? chainedConnection(SUB_ISSUES_PAGE_QUERY, "subIssues", issueId, subs, subEmbedded, subIssuesChain, entries)
    : connection(subs, subEmbedded, `sub-${issueId}-1`);
  if (!subIssuesChain && subEmbedded < subs.length) {
    entries.push(continuation(SUB_ISSUES_PAGE_QUERY, "subIssues", issueId, subs, subEmbedded, `sub-${issueId}-1`));
  }
  return item;
}

function draftItem(n) {
  return {
    id: `PVTI_fixture_draft_${n}`,
    type: "DRAFT_ISSUE",
    fieldValues: { nodes: [{ __typename: "ProjectV2ItemFieldSingleSelectValue", name: "Backlog", field: { name: "Status" } }] },
    content: { __typename: "DraftIssue", id: `DI_fixture_${n}`, title: `adev-fixture: draft ${n}`, body: "" },
  };
}

function pullRequestItem(number) {
  return {
    id: `PVTI_fixture_pr_${number}`,
    type: "PULL_REQUEST",
    fieldValues: { nodes: [{ __typename: "ProjectV2ItemFieldSingleSelectValue", name: "In Review", field: { name: "Status" } }] },
    content: {
      __typename: "PullRequest",
      id: `PR_fixture_${number}`,
      number,
      title: `adev-fixture: pull request ${number}`,
      body: "",
      state: "OPEN",
      url: `https://github.com/acme/board/pull/${number}`,
      repository: { name: "board", owner: { login: "acme" } },
    },
  };
}

const lookupVariables = (number) => ({ owner: HOME.owner, name: HOME.name, number });

function projectItemsPage(nodes) {
  return { totalCount: nodes.length, pageInfo: { hasNextPage: false, endCursor: null }, nodes };
}

/**
 * The direct lookup of home-repo issue `number` answered with `projectItems` nodes
 * (each an item node carrying `project: { id }`).
 */
export function issueLookup(number, nodes) {
  return {
    query: ISSUE_PROJECT_ITEMS_QUERY,
    variables: lookupVariables(number),
    response: { data: { repository: { issue: { projectItems: projectItemsPage(nodes) } } } },
  };
}

/** The direct lookup of a number that names no issue: GitHub's NOT_FOUND error at `repository.issue`. */
export function issueNotFound(number) {
  return {
    query: ISSUE_PROJECT_ITEMS_QUERY,
    variables: lookupVariables(number),
    response: {
      data: { repository: { issue: null } },
      errors: [{ type: "NOT_FOUND", path: ["repository", "issue"], message: `Could not resolve to an Issue with the number of ${number}.` }],
    },
  };
}

/** The direct lookup of an issue that exists but is an item of another project only. */
export function issueOffProject(number) {
  const item = rawItem({ number });
  item.id = `PVTI_other_${number}`;
  item.content.repository.issueTypes = { totalCount: 5 };
  item.content.labels.totalCount = item.content.labels.nodes.length;
  item.content.blockedBy = { totalCount: 0, pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] };
  item.content.subIssues = { totalCount: 0, pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] };
  return issueLookup(number, [{ ...item, project: { id: "PVT_other" } }]);
}

const isHomeIssue = (node) =>
  node.content?.__typename === "Issue" && node.content.repository.owner.login === HOME.owner && node.content.repository.name === HOME.name;

/**
 * Build the replay entries for one board.
 *
 * @param {Array<object>} specs - issue specs (see issueItem) or `{ draft: n }` / `{ pullRequest: n }`
 * @param {{ pages?: Array<{ after?: string, endCursor: string|null, hasNextPage: boolean }>, totalCount?: number,
 *          preflight?: object[], typedRepos?: string[] }} [opts]
 *   `pages` overrides the cursor chain (for pagination-violation boards); items are
 *   still split into pages of 100 and a page past the last item is empty.
 *   `typedRepos` lists the `owner/name` repos that report issue types.
 */
export function buildBoard(specs, { pages, totalCount, preflight = preflightFixture.ok, typedRepos = ["acme/board", "acme/api"] } = {}) {
  const typed = new Set(typedRepos);
  const entries = [];
  const children = new Map();
  for (const spec of specs) {
    if (!spec.parent) continue;
    const parentKey = keyOf(spec.parent);
    if (!children.has(parentKey)) children.set(parentKey, []);
    children.get(parentKey).push(ref({ number: spec.number, ...(spec.repo ?? {}) }));
  }

  const nodes = specs.map((spec) => {
    if (spec.draft !== undefined) return draftItem(spec.draft);
    if (spec.pullRequest !== undefined) return pullRequestItem(spec.pullRequest);
    return issueItem(spec, children.get(keyOf({ number: spec.number, ...(spec.repo ?? {}) })) ?? [], entries, typed);
  });

  const count = totalCount ?? nodes.length;
  const pageCount = Math.max(1, Math.ceil(nodes.length / PAGE_SIZE));
  const chain = pages ?? Array.from({ length: pageCount }, (_, i) => ({
    after: i === 0 ? undefined : `items-${i}`,
    endCursor: i === pageCount - 1 ? null : `items-${i + 1}`,
    hasNextPage: i < pageCount - 1,
  }));

  chain.forEach((page, i) => {
    const variables = page.after === undefined ? { projectId: PROJECT_ID } : { projectId: PROJECT_ID, after: page.after };
    entries.push({
      query: PROJECT_ITEMS_QUERY,
      variables,
      response: {
        data: {
          node: {
            items: {
              totalCount: count,
              pageInfo: { hasNextPage: page.hasNextPage, endCursor: page.endCursor },
              nodes: nodes.slice(i * PAGE_SIZE, (i + 1) * PAGE_SIZE),
            },
          },
        },
      },
    });
  });

  // Every number the board names resolves as GitHub would answer it: a home item
  // by its item here, an off-project sub-issue as an item of another project, and
  // a pull request's number as no issue at all.
  for (const node of nodes) {
    if (isHomeIssue(node)) entries.push(issueLookup(node.content.number, [{ ...node, project: { id: PROJECT_ID } }]));
    else if (node.content?.__typename === "PullRequest") entries.push(issueNotFound(node.content.number));
  }
  const onBoard = new Set(nodes.filter(isHomeIssue).map((n) => n.content.number));
  for (const spec of specs) {
    for (const number of spec.offProjectChildren ?? []) {
      if (!onBoard.has(number)) entries.push(issueOffProject(number));
    }
  }

  return [...preflight, ...entries];
}

const epic = (number, extra = {}) => ({ number, issueType: "Epic", labels: ["epic"], ...extra });
const task = (number, extra = {}) => ({ number, issueType: "Task", ...extra });

// 250 project items: 247 home issues (#1-#247), one cross-repo issue (acme/api#7),
// one draft and one pull request (#300). Pages: 100, 100, 50.
function fullSpecs() {
  const special = new Map([
    [1, epic(1, { status: "Ready", milestone: "v1", subIssuesEmbedded: 1 })],
    [2, task(2, { parent: { number: 1 } })],
    [3, task(3, { parent: { number: 2 } })],
    [4, task(4, { parent: { number: 1 }, offProjectChildren: [900] })],
    [5, epic(5, { status: "In Progress", milestone: "v2" })],
    [6, task(6, { parent: { number: 5 } })],
    [8, task(8, { blockedBy: [{ number: 9 }, { number: 10 }, { number: 11 }], blockedByEmbedded: 1 })],
    [20, task(20, { state: "CLOSED", status: "Done" })],
    [21, task(21, { state: "CLOSED", status: "Backlog" })],
    [30, task(30, { status: "In Progress" })],
    [31, task(31, { status: "In Review" })],
    [40, task(40, { status: "Deferred" })],
    [50, { number: 50, issueType: "Bug", labels: ["type:bug"] }],
    [51, { number: 51, issueType: "Bug", labels: ["type:bug"] }],
    [60, task(60, { fields: { planRef: "plans/alpha.md" } })],
  ]);
  const specs = [];
  for (let n = 1; n <= 247; n += 1) {
    specs.push(special.get(n) ?? task(n));
    if (n === 7) specs.push(task(7, { repo: { owner: "acme", name: "api" }, parent: { number: 5 } }));
    if (n === 120) specs.push({ pullRequest: 300 });
    if (n === 180) specs.push({ draft: 1 });
  }
  return specs;
}

export const board = Object.freeze({
  full: buildBoard(fullSpecs()),

  // gh-1 -> gh-2 -> gh-3 -> gh-1 through sub-issue parent links.
  cycle: buildBoard([
    task(1, { parent: { number: 3 } }),
    task(2, { parent: { number: 1 } }),
    task(3, { parent: { number: 2 } }),
    task(4),
  ]),

  migrated: buildBoard([
    task(41, { fields: { legacy_id: "issue-7k3f9a" } }),
    task(42, { fields: { legacy_id: "epic-2" } }),
    task(43, { fields: { legacy_id: "epic-2" } }),
    task(44, { fields: { legacy_id: "bd-a1b2c3" } }),
    task(45, { fields: { legacy_id: "e1.f2" } }),
    task(46),
  ]),

  // An epic carrying an old ID, with two direct children and one grandchild.
  migratedEpic: buildBoard([
    epic(1, { fields: { legacy_id: "epic-9" } }),
    task(2, { parent: { number: 1 } }),
    task(3, { parent: { number: 1 } }),
    task(4, { parent: { number: 2 } }),
  ]),

  // Legacy ID text with surrounding whitespace fails the legacy_id predicate.
  migratedUntrimmed: buildBoard([
    task(41, { fields: { legacy_id: "issue-7k3f9a" } }),
    task(47, { fields: { legacy_id: " issue-9q " } }),
  ]),

  // Two open issues on options missing from the default status_map.
  unmapped: buildBoard([
    task(1),
    task(2, { parent: { number: 1 }, status: "Icebox" }),
    task(3, { parent: { number: 1 } }),
    task(4, { parent: { number: 1 }, status: "Parked" }),
  ]),

  // Two items whose Project text fields fail their predicates.
  invalidFields: buildBoard([
    task(1),
    task(2, { parent: { number: 1 }, fields: { branch: "feat/x..y" } }),
    task(3, { parent: { number: 1 }, fields: { spec_ref: "../x.md" } }),
    task(4, { parent: { number: 1 } }),
  ]),

  // Page 2 answers with the cursor page 1 already returned.
  repeatedCursor: buildBoard(Array.from({ length: 200 }, (_, i) => task(i + 1)), {
    totalCount: 250,
    pages: [
      { endCursor: "items-1", hasNextPage: true },
      { after: "items-1", endCursor: "items-1", hasNextPage: true },
    ],
  }),

  // totalCount 100 bounds the read at ceil(100/100) + 1 = 2 pages; a third is served.
  overBound: buildBoard(Array.from({ length: 100 }, (_, i) => task(i + 1)), {
    totalCount: 100,
    pages: [
      { endCursor: "items-1", hasNextPage: true },
      { after: "items-1", endCursor: "items-2", hasNextPage: true },
      { after: "items-2", endCursor: null, hasNextPage: false },
    ],
  }),

  // acme has issue types, yet no item carries one: labels must not type anything.
  typedOwnerUntypedItems: buildBoard([
    { number: 1, labels: ["epic"] },
    { number: 2, labels: ["type:bug"] },
    { number: 3 },
  ]),

  // No acme repo reports issue types: labels decide type and Epic membership.
  untypedOwner: buildBoard([
    { number: 1, labels: ["epic"] },
    { number: 2, labels: ["type:bug"], parent: { number: 1 } },
    { number: 3 },
  ], { typedRepos: [] }),

  // acme has issue types (through acme/board only, so acme/api inherits them);
  // beta has none, so beta/tools#5's stray issue type is not what types it.
  // Each owner's items decode by that owner's mode.
  mixedOwners: buildBoard([
    { number: 1, labels: ["epic"] },
    { number: 2, issueType: "Epic", labels: [] },
    { number: 8, repo: { owner: "acme", name: "api" }, labels: ["type:bug"] },
    { number: 3, repo: { owner: "beta", name: "tools" }, labels: ["epic"] },
    { number: 4, repo: { owner: "beta", name: "tools" }, labels: ["type:bug"] },
    { number: 5, repo: { owner: "beta", name: "tools" }, issueType: "Epic", labels: [] },
  ], { typedRepos: ["acme/board"] }),

  // gh-2 has 101 labels but the items page embeds only the first 100.
  truncatedLabels: buildBoard([
    task(1),
    task(2, { labels: Array.from({ length: 100 }, (_, i) => `l-${i}`), labelsTotalCount: 101 }),
  ]),

  // gh-8's blocked-by continuation answers with the cursor already seen.
  blockedByRepeatedCursor: buildBoard([
    task(8, { blockedBy: [{ number: 9 }, { number: 10 }, { number: 11 }], blockedByEmbedded: 1, blockedByChain: [
      { after: "bb-8-1", endCursor: "bb-8-1", hasNextPage: true },
    ] }),
    task(9), task(10), task(11),
  ]),

  // totalCount 3 bounds gh-8's blocked-by connection at 2 pages; a third is served.
  blockedByOverBound: buildBoard([
    task(8, { blockedBy: [{ number: 9 }, { number: 10 }, { number: 11 }], blockedByEmbedded: 1, blockedByChain: [
      { after: "bb-8-1", endCursor: "bb-8-2", hasNextPage: true },
      { after: "bb-8-2", endCursor: null, hasNextPage: false },
    ] }),
    task(9), task(10), task(11),
  ]),

  // gh-1's sub-issue continuation answers with the cursor already seen.
  subIssuesRepeatedCursor: buildBoard([
    task(1, { offProjectChildren: [900, 901, 902], subIssuesEmbedded: 1, subIssuesChain: [
      { after: "sub-1-1", endCursor: "sub-1-1", hasNextPage: true },
    ] }),
  ]),

  // totalCount 3 bounds gh-1's sub-issue connection at 2 pages; a third is served.
  subIssuesOverBound: buildBoard([
    task(1, { offProjectChildren: [900, 901, 902], subIssuesEmbedded: 1, subIssuesChain: [
      { after: "sub-1-1", endCursor: "sub-1-2", hasNextPage: true },
      { after: "sub-1-2", endCursor: null, hasNextPage: false },
    ] }),
  ]),

  // Preflight fails: the project does not resolve.
  projectMissing: buildBoard([task(1)], { preflight: preflightFixture.projectMissing }),
});
