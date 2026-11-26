/**
 * The GitHub board read: one paginated project-items query plus per-item
 * continuations of the blocked-by and sub-issue connections whose embedded
 * first page is short. Nothing else is requested.
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
import { PROJECT_ITEMS_QUERY, PROJECT_ITEM_QUERY, SUB_ISSUES_PAGE_QUERY, BLOCKED_BY_PAGE_QUERY } from "./queries.mjs";

const PAGE_SIZE = 100;

function paginationInvalid(where, reason) {
  return githubError(CODES.GITHUB_PAGINATION_INVALID, `Pagination of ${where} is invalid: ${reason}.`);
}

function isConnection(value) {
  return Boolean(value) && typeof value.totalCount === "number" && Boolean(value.pageInfo) && Array.isArray(value.nodes);
}

/**
 * Every node of an embedded connection, continuing it from its endCursor with
 * the same page bound and repeated-cursor rule as `transport.paginate`. The
 * embedded page counts as page 1 and its cursor as already seen.
 */
function continueConnection(transport, document, key, issueId, embedded, where) {
  if (!isConnection(embedded)) throw paginationInvalid(where, "the item has no connection with totalCount, pageInfo and nodes");
  const nodes = [...embedded.nodes];
  const seen = new Set();
  let connection = embedded;
  let pages = 1;
  while (connection.pageInfo.hasNextPage) {
    const cursor = connection.pageInfo.endCursor;
    if (typeof cursor !== "string" || cursor === "") throw paginationInvalid(where, "hasNextPage is true but endCursor is missing");
    if (seen.has(cursor)) throw paginationInvalid(where, "a cursor was repeated");
    seen.add(cursor);
    connection = transport.request(document, { issueId, after: cursor })?.node?.[key];
    pages += 1;
    if (!isConnection(connection)) throw paginationInvalid(where, "the response has no connection with totalCount, pageInfo and nodes");
    const bound = Math.ceil(connection.totalCount / PAGE_SIZE) + 1;
    if (pages > bound) throw paginationInvalid(where, `page ${pages} exceeds the bound of ${bound} for totalCount ${connection.totalCount}`);
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
  const blockedBy = continueConnection(transport, BLOCKED_BY_PAGE_QUERY, "blockedBy", content.id, content.blockedBy, `${where} blockedBy`);
  const subIssues = continueConnection(transport, SUB_ISSUES_PAGE_QUERY, "subIssues", content.id, content.subIssues, `${where} subIssues`);
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
 *                    nodeIds: { itemId: string, contentId: string } }>,
 *   drift: Array<{ id: string, kind: string, value: string }>,
 * }} entries in board order; `legacyText` is the raw Legacy ID field text, kept so an
 *   old ID still resolves to an item whose decode was refused
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
    const id = refId(raw.content, home);
    const entry = { id, nodeIds: { itemId: raw.id, contentId: raw.content.id } };
    const legacyText = rawText(raw, config.fieldNames.legacy_id);
    if (legacyText !== undefined) entry.legacyText = legacyText;
    try {
      const typeMode = typedOwners.has(ownerOf(raw.content)) ? "issue_types" : "labels";
      const decoded = decodeItem(raw, { config, home, moduleSlugs, typeMode });
      entry.issue = decoded.issue;
      for (const d of decoded.drift) drift.push({ id, ...d });
    } catch (err) {
      if (err?.code !== CODES.GITHUB_UNMAPPED_STATUS && err?.code !== CODES.GITHUB_INVALID_FIELD_VALUE) throw err;
      entry.error = err;
    }
    for (const ref of subIssues) {
      const child = refId(ref, home);
      if (!onProject.has(child)) drift.push({ id, kind: "sub-issue-off-project", value: child });
    }
    entries.push(entry);
  }
  return { entries, drift };
}

/**
 * Read and decode one project item by its node id (the read-back after a write).
 * Under `type_source: auto` the item's own repository decides the typing mode:
 * issue types are owner-wide, so any repository of the owner reports them.
 *
 * @param {{ request: Function }} transport
 * @param {object} config - normalized `tasks.github`
 * @param {{ itemId: string, moduleSlugs?: Iterable<string> }} context
 * @returns {{ id: string, issue: object, nodeIds: { itemId: string, contentId: string } }}
 * @throws {Error & { code: "GITHUB_PAGINATION_INVALID"|"GITHUB_INVALID_FIELD_VALUE"|"GITHUB_UNMAPPED_STATUS"|"GITHUB_REQUEST_FAILED" }}
 */
export function readItem(transport, config, { itemId, moduleSlugs = [] }) {
  const [owner, repo] = config.repo.split("/");
  const home = { owner, repo };
  const node = transport.request(PROJECT_ITEM_QUERY, { itemId })?.node;
  if (node?.content?.__typename !== "Issue") {
    throw githubError(CODES.GITHUB_REQUEST_FAILED, `GitHub returned no Issue for project item ${itemId}.`);
  }
  const { raw } = completeItem(transport, node, home);
  const typeMode = raw.content.repository?.issueTypes?.totalCount > 0 ? "issue_types" : "labels";
  const { issue } = decodeItem(raw, { config, home, moduleSlugs, typeMode });
  return { id: issue.id, issue, nodeIds: { itemId: raw.id, contentId: raw.content.id } };
}
