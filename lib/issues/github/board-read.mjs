/**
 * The GitHub board read: one paginated project-items query plus per-item
 * continuations of the blocked-by and sub-issue connections whose embedded
 * first page is short. Nothing else is requested. Beside it, the two single-item
 * reads: one project item by node id (a write's read-back) and one home-repo
 * issue by number (how a gh-<n> ID resolves), both decoding to the same entry
 * shape as a board-read item.
 *
 * Items are decoded only after every page has arrived, so each item's decode
 * outcome (an Issue or the error refusing it) is recorded rather than thrown;
 * callers decide whether one refused item fails their whole operation.
 *
 * @module lib/issues/github/board-read
 */

import { encodeGithubId } from "../id-utils.mjs";
import { decodeItem } from "./decode.mjs";
import { GITHUB_ERROR_CODES as CODES, githubError } from "./errors.mjs";
import { firstPageBound } from "./transport.mjs";
import {
  PROJECT_ITEMS_QUERY,
  PROJECT_ITEM_QUERY,
  ISSUE_PROJECT_ITEMS_QUERY,
  SUB_ISSUES_PAGE_QUERY,
  BLOCKED_BY_PAGE_QUERY,
} from "./queries.mjs";

function paginationInvalid(where, reason) {
  return githubError(CODES.GITHUB_PAGINATION_INVALID, `Pagination of ${where} is invalid: ${reason}.`);
}

function isConnection(value) {
  return Boolean(value) && typeof value.totalCount === "number" && Boolean(value.pageInfo) && Array.isArray(value.nodes);
}

/**
 * Every node of an embedded connection, continuing it from its endCursor with
 * the same page bound and repeated-cursor rule as `transport.paginate`. The
 * embedded page counts as page 1 and its totalCount fixes the bound for the
 * whole connection, so a continuation page cannot raise it. `nextPage(cursor)`
 * requests the page after `cursor` and returns its connection.
 */
function continueConnection(embedded, where, nextPage) {
  if (!isConnection(embedded)) throw paginationInvalid(where, "the item has no connection with totalCount, pageInfo and nodes");
  const bound = firstPageBound(embedded.totalCount, (reason) => paginationInvalid(where, reason));
  const nodes = [...embedded.nodes];
  const seen = new Set();
  let connection = embedded;
  let pages = 1;
  while (connection.pageInfo.hasNextPage) {
    const cursor = connection.pageInfo.endCursor;
    if (typeof cursor !== "string" || cursor === "") throw paginationInvalid(where, "hasNextPage is true but endCursor is missing");
    if (seen.has(cursor)) throw paginationInvalid(where, "a cursor was repeated");
    seen.add(cursor);
    connection = nextPage(cursor);
    pages += 1;
    if (!isConnection(connection)) throw paginationInvalid(where, "the response has no connection with totalCount, pageInfo and nodes");
    if (pages > bound) throw paginationInvalid(where, `page ${pages} exceeds the bound of ${bound} fixed by the first page`);
    nodes.push(...connection.nodes);
  }
  return nodes;
}

// Labels are read from the items page only; a page shorter than totalCount would
// silently drop the labels that carry type, module and priority.
function checkLabelsComplete(content, id) {
  const labels = content.labels;
  if (labels === null || labels === undefined) return;
  if (typeof labels.totalCount !== "number" || !Array.isArray(labels.nodes)) {
    throw paginationInvalid(`item ${id} labels`, "the item has no labels connection with totalCount and nodes");
  }
  if (labels.totalCount > labels.nodes.length) {
    throw paginationInvalid(`item ${id} labels`, `${labels.totalCount} labels exceed the ${labels.nodes.length} read in one page`);
  }
}

function ownerOf(content) {
  return String(content?.repository?.owner?.login ?? "").toLowerCase();
}

function refId(ref, home) {
  return encodeGithubId({ owner: ref?.repository?.owner?.login, repo: ref?.repository?.name, number: ref?.number }, home);
}

function rawText(raw, fieldName) {
  const node = (raw.fieldValues?.nodes ?? []).find((n) => n?.field?.name === fieldName);
  return node?.__typename === "ProjectV2ItemFieldTextValue" && typeof node.text === "string" ? node.text : undefined;
}

// The item with its blocked-by connection read to the end, plus its every sub-issue ref.
function completeItem(transport, raw, home) {
  const { content } = raw;
  checkLabelsComplete(content, refId(content, home));
  const where = `item ${content.id}`;
  const page = (document, key) => (after) => transport.request(document, { issueId: content.id, after })?.node?.[key];
  const blockedBy = continueConnection(content.blockedBy, `${where} blockedBy`, page(BLOCKED_BY_PAGE_QUERY, "blockedBy"));
  const subIssues = continueConnection(content.subIssues, `${where} subIssues`, page(SUB_ISSUES_PAGE_QUERY, "subIssues"));
  return { raw: { ...raw, content: { ...content, blockedBy: { nodes: blockedBy } } }, subIssues };
}

/**
 * Read and decode the whole board.
 *
 * @param {{ request: Function, paginate: Function }} transport
 * @param {object} config - normalized `tasks.github`
 * @param {{ projectId: string, moduleSlugs?: Iterable<string> }} context - projectId from preflight
 * @returns {{
 *   entries: Array<{ id: string, issue?: object, error?: Error, legacyText?: string,
 *                    labels: string[], nodeIds: { itemId: string, contentId: string },
 *                    subIssueIds: string[], blockedBy: Array<{ id: string, state: string|null }> }>,
 *   drift: Array<{ id: string, kind: string, value: string }>,
 * }} entries in board order; `legacyText` is the raw Legacy ID field text, kept so an
 *   old ID still resolves to an item whose decode was refused; `labels` are the raw
 *   label names, so a write can replace an adev-family label the decoded item hides;
 *   `subIssueIds` and `blockedBy` come from the raw connections, so they are known
 *   even for an item whose decode was refused, and `blockedBy[].state` is the
 *   referenced issue's GitHub state (null when GitHub reported none)
 * @throws {Error & { code: "GITHUB_PAGINATION_INVALID" }} and any transport error; no partial result
 */
export function readBoard(transport, config, { projectId, moduleSlugs = [] }) {
  const [owner, repo] = config.repo.split("/");
  const home = { owner, repo };
  const rawItems = transport
    .paginate(PROJECT_ITEMS_QUERY, { projectId }, { connectionPath: ["node", "items"] })
    .filter((raw) => raw?.content?.__typename === "Issue");

  const completed = rawItems.map((raw) => completeItem(transport, raw, home));

  // type_source "auto": an owner has issue types when any of its repositories on the
  // board reports them, whether or not any item carries one; per-item typing would let
  // a label set type or Epic membership on an untyped item of a typed owner.
  const typedOwners = new Set(
    completed.filter(({ raw }) => raw.content.repository?.issueTypes?.totalCount > 0).map(({ raw }) => ownerOf(raw.content)),
  );
  const onProject = new Set(completed.map(({ raw }) => refId(raw.content, home)));

  const entries = [];
  const drift = [];
  for (const { raw, subIssues } of completed) {
    const typeMode = typedOwners.has(ownerOf(raw.content)) ? "issue_types" : "labels";
    const { entry, drift: itemDrift } = toEntry(raw, subIssues, { config, home, moduleSlugs, typeMode });
    drift.push(...itemDrift);
    for (const child of entry.subIssueIds) {
      if (!onProject.has(child)) drift.push({ id: entry.id, kind: "sub-issue-off-project", value: child });
    }
    entries.push(entry);
  }
  return { entries, drift };
}

/**
 * The board entry of one completed raw item, with the drift its decode reported.
 * A refused decode is recorded as `entry.error`, never thrown, so one bad item
 * cannot hide which others are bad; any other decode failure is thrown.
 */
function toEntry(raw, subIssues, { config, home, moduleSlugs, typeMode }) {
  const id = refId(raw.content, home);
  const labels = (raw.content.labels?.nodes ?? []).map((l) => l?.name).filter((n) => typeof n === "string");
  const entry = {
    id,
    labels,
    nodeIds: { itemId: raw.id, contentId: raw.content.id },
    subIssueIds: subIssues.map((ref) => refId(ref, home)),
    blockedBy: raw.content.blockedBy.nodes.map((ref) => ({ id: refId(ref, home), state: typeof ref?.state === "string" ? ref.state : null })),
  };
  const legacyText = rawText(raw, config.fieldNames.legacy_id);
  if (legacyText !== undefined) entry.legacyText = legacyText;
  const drift = [];
  try {
    const decoded = decodeItem(raw, { config, home, moduleSlugs, typeMode });
    entry.issue = decoded.issue;
    for (const d of decoded.drift) drift.push({ id, ...d });
  } catch (err) {
    if (err?.code !== CODES.GITHUB_UNMAPPED_STATUS && err?.code !== CODES.GITHUB_INVALID_FIELD_VALUE) throw err;
    entry.error = err;
  }
  return { entry, drift };
}

// A single-item read has no board to resolve `type_source: auto` across, so the
// item's own repository decides: issue types are owner-wide, so any repository of
// the owner reports them.
function ownTypeMode(raw) {
  return raw.content.repository?.issueTypes?.totalCount > 0 ? "issue_types" : "labels";
}

/**
 * Read and decode one project item by its node id (the read-back after a write).
 *
 * @param {{ request: Function }} transport
 * @param {object} config - normalized `tasks.github`
 * @param {{ itemId: string, moduleSlugs?: Iterable<string> }} context
 * @returns {object} the item's entry, in readBoard's entry shape, with `issue` always set
 * @throws {Error & { code: "GITHUB_PAGINATION_INVALID"|"GITHUB_INVALID_FIELD_VALUE"|"GITHUB_UNMAPPED_STATUS"|"GITHUB_REQUEST_FAILED" }}
 */
export function readItem(transport, config, { itemId, moduleSlugs = [] }) {
  const [owner, repo] = config.repo.split("/");
  const home = { owner, repo };
  const node = transport.request(PROJECT_ITEM_QUERY, { itemId })?.node;
  if (node?.content?.__typename !== "Issue") {
    throw githubError(CODES.GITHUB_REQUEST_FAILED, `GitHub returned no Issue for project item ${itemId}.`);
  }
  const { raw, subIssues } = completeItem(transport, node, home);
  const { entry } = toEntry(raw, subIssues, { config, home, moduleSlugs, typeMode: ownTypeMode(raw) });
  if (entry.error) throw entry.error;
  return entry;
}

// GitHub answers `issue(number:)` for a number that names no issue (none, or a
// pull request) with a NOT_FOUND error at that path rather than a bare null.
function isIssueNotFound(err) {
  const errors = err?.code === CODES.GITHUB_REQUEST_FAILED ? err.graphqlErrors : null;
  return Array.isArray(errors) && errors.length > 0 &&
    errors.every((e) => e?.type === "NOT_FOUND" && Array.isArray(e.path) && e.path[0] === "repository" && e.path[1] === "issue");
}

/**
 * Resolve home-repo issue `number` to its entry on project `projectId` by a direct
 * read of the issue and its project items, never through the items listing, which
 * can omit or show stale an item written seconds ago. A refused decode is recorded
 * as `entry.error`, exactly as readBoard records it.
 *
 * @param {{ request: Function }} transport
 * @param {object} config - normalized `tasks.github`
 * @param {{ projectId: string, number: number, moduleSlugs?: Iterable<string> }} context
 * @returns {object|null} the entry, in readBoard's entry shape; null when no issue
 *   has that number or the issue has no item on this project
 * @throws {Error & { code: "GITHUB_PAGINATION_INVALID"|"GITHUB_REQUEST_FAILED" }} and any transport error
 */
export function readIssueEntry(transport, config, { projectId, number, moduleSlugs = [] }) {
  const [owner, repo] = config.repo.split("/");
  const home = { owner, repo };
  const variables = { owner, name: repo, number };
  let issue;
  try {
    issue = transport.request(ISSUE_PROJECT_ITEMS_QUERY, variables)?.repository?.issue;
  } catch (err) {
    if (isIssueNotFound(err)) return null;
    throw err;
  }
  if (!issue) return null;
  const items = continueConnection(issue.projectItems, `issue ${owner}/${repo}#${number} projectItems`,
    (after) => transport.request(ISSUE_PROJECT_ITEMS_QUERY, { ...variables, after })?.repository?.issue?.projectItems);
  const node = items.find((n) => n?.project?.id === projectId);
  if (node?.content?.__typename !== "Issue") return null;
  const { raw, subIssues } = completeItem(transport, node, home);
  return toEntry(raw, subIssues, { config, home, moduleSlugs, typeMode: ownTypeMode(raw) }).entry;
}
