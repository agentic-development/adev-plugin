/**
 * Hand-written unit fixtures for the GitHub board preflight probe. Not recorded:
 * each response is the smallest GraphQL payload that exercises one preflight
 * outcome. Entries are keyed by replayExec on the exact PREFLIGHT_QUERY text and
 * the variables preflight derives from the config, so a preflight that sends any
 * other document or variable set hits UNRECORDED_GITHUB_REQUEST.
 */

import { PREFLIGHT_QUERY } from "../../../../lib/issues/github/queries.mjs";

// Variables for project https://github.com/orgs/acme/projects/7, repo acme/board.
export const ORG_VARIABLES = Object.freeze({ projectOwner: "acme", projectNumber: 7, isOrg: true, repoOwner: "acme", repoName: "board" });
// Variables for project https://github.com/users/octo/projects/3, repo octo/notes.
export const USER_VARIABLES = Object.freeze({ projectOwner: "octo", projectNumber: 3, isOrg: false, repoOwner: "octo", repoName: "notes" });

const DEFAULT_STATUS_OPTIONS = ["Backlog", "Ready", "In Progress", "In Review", "Deferred", "Done"];
const DEFAULT_TEXT_FIELDS = ["Owner", "Claimed At", "Next Action", "Spec", "Plan", "Branch", "PR", "Legacy ID"];

function textField(name, i) {
  return { id: `PVTF_text_${i}`, name, dataType: "TEXT" };
}

function statusField(name = "Status", options = DEFAULT_STATUS_OPTIONS) {
  return { id: "PVTSSF_status", name, dataType: "SINGLE_SELECT", options: options.map((o, i) => ({ id: `opt_${i}`, name: o })) };
}

/**
 * The project's field nodes, as `fields(first: 100)` returns them.
 * @param {{ status?: object|null, textNames?: string[], extra?: object[] }} [opts]
 */
export function fieldNodes({ status = statusField(), textNames = DEFAULT_TEXT_FIELDS, extra = [] } = {}) {
  const nodes = [{ id: "PVTF_title", name: "Title", dataType: "TITLE" }];
  if (status) nodes.push(status);
  nodes.push(...textNames.map(textField), ...extra);
  return nodes;
}

function project(fields, { isPublic = false } = {}) {
  return { id: "PVT_fixture", title: "adev-fixture: board", public: isPublic, fields: { totalCount: fields.length, nodes: fields } };
}

function repository(visibility = "PRIVATE") {
  return { id: "R_fixture", nameWithOwner: "acme/board", visibility };
}

/**
 * One replay entry for the preflight probe.
 * @param {object} response - full GraphQL response object `{ data?, errors? }`
 * @param {object} [variables]
 */
export function preflightEntry(response, variables = ORG_VARIABLES) {
  return { query: PREFLIGHT_QUERY, variables: { ...variables }, response };
}

/** A successful org-project response with the given project fields and visibility. */
export function okResponse({ fields = fieldNodes(), repoVisibility = "PRIVATE", projectPublic = false, ownerKey = "organization" } = {}) {
  return { data: { [ownerKey]: { projectV2: project(fields, { isPublic: projectPublic }) }, repository: repository(repoVisibility) } };
}

const notFound = (path, message) => ({ type: "NOT_FOUND", path, locations: [{ line: 1, column: 1 }], message });

export const preflightFixture = Object.freeze({
  ok: [preflightEntry(okResponse())],

  // Null data without GraphQL errors.
  projectMissing: [preflightEntry({ data: { organization: { projectV2: null }, repository: repository() } })],
  ownerMissing: [preflightEntry({ data: { organization: null, repository: repository() } })],
  repoMissing: [preflightEntry({ data: { organization: { projectV2: project(fieldNodes()) }, repository: null } })],

  // GitHub's usual shape: a NOT_FOUND GraphQL error for the path plus null data there.
  projectNotFoundError: [preflightEntry({
    data: { organization: { projectV2: null }, repository: repository() },
    errors: [notFound(["organization", "projectV2"], "Could not resolve to a ProjectV2 with the number 7.")],
  })],
  ownerNotFoundError: [preflightEntry({
    data: { organization: null, repository: repository() },
    errors: [notFound(["organization"], "Could not resolve to an Organization with the login of 'acme'.")],
  })],
  repoNotFoundError: [preflightEntry({
    data: { organization: { projectV2: project(fieldNodes()) }, repository: null },
    errors: [notFound(["repository"], "Could not resolve to a Repository with the name 'acme/board'.")],
  })],
  unrelatedGraphqlError: [preflightEntry({
    data: null,
    errors: [{ type: "INTERNAL", path: null, message: "adev-fixture: something went wrong" }],
  })],

  statusFieldMissing: [preflightEntry(okResponse({ fields: fieldNodes({ status: null }) }))],
  statusFieldWrongType: [preflightEntry(okResponse({ fields: fieldNodes({ status: { id: "PVTF_status", name: "Status", dataType: "TEXT" } }) }))],
  ownerFieldWrongType: [preflightEntry(okResponse({
    fields: fieldNodes({
      textNames: DEFAULT_TEXT_FIELDS.filter((n) => n !== "Owner"),
      extra: [{ id: "PVTSSF_owner", name: "Owner", dataType: "SINGLE_SELECT", options: [{ id: "o1", name: "adev-fixtures" }] }],
    }),
  }))],
  claimedAtFieldMissing: [preflightEntry(okResponse({ fields: fieldNodes({ textNames: DEFAULT_TEXT_FIELDS.filter((n) => n !== "Claimed At") }) }))],
  statusOptionMissing: [preflightEntry(okResponse({ fields: fieldNodes({ status: statusField("Status", DEFAULT_STATUS_OPTIONS.filter((o) => o !== "Deferred")) }) }))],
  // "In Review" is a read-only (non-first) entry of the default in_progress mapping.
  readOptionMissing: [preflightEntry(okResponse({ fields: fieldNodes({ status: statusField("Status", DEFAULT_STATUS_OPTIONS.filter((o) => o !== "In Review")) }) }))],

  publicBoth: [preflightEntry(okResponse({ repoVisibility: "PUBLIC", projectPublic: true }))],
  publicRepoPrivateProject: [preflightEntry(okResponse({ repoVisibility: "PUBLIC", projectPublic: false }))],
  internalRepo: [preflightEntry(okResponse({ repoVisibility: "INTERNAL", projectPublic: false }))],

  userProject: [preflightEntry(okResponse({ ownerKey: "user" }), USER_VARIABLES)],

  scopesMissing: [preflightEntry({
    errors: [{ type: "INSUFFICIENT_SCOPES", message: "Your token has not been granted the required scopes to execute this query. The 'projectV2' field requires one of the following scopes: ['read:project'], but your token has only been granted the: ['repo'] scopes." }],
  })],
  cliMissing: [{ query: PREFLIGHT_QUERY, variables: { ...ORG_VARIABLES }, error: { code: "ENOENT", stderr: "" } }],
  authRequired: [{ query: PREFLIGHT_QUERY, variables: { ...ORG_VARIABLES }, error: { code: null, stderr: "To get started with GitHub CLI, please run:  gh auth login" } }],
});
