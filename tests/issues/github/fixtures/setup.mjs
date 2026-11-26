/**
 * Hand-written unit fixtures for `adev issues github setup`. Not recorded: each
 * project is the smallest preflight + board payload that exercises one setup
 * outcome, served through `replayExec`.
 *
 * Request contract these entries pin (any other document or variable set hits
 * UNRECORDED_GITHUB_REQUEST):
 *   - AdevPreflight (PREFLIGHT_QUERY) with the ORG_VARIABLES of preflight.mjs:
 *     the project's fields with their types and single-select options.
 *   - ProjectItems (PROJECT_ITEMS_QUERY) with `{ projectId: "PVT_fixture" }`, plus
 *     the per-item continuations of board.mjs, for the drift report.
 *   - CreateField (CREATE_FIELD from lib/issues/github/mutations.mjs), one request
 *     per missing field, with variables
 *       text:          { projectId, name, dataType: "TEXT" }
 *       single-select: { projectId, name, dataType: "SINGLE_SELECT",
 *                        singleSelectOptions: [{ name, color: "GRAY", description: "" }, ...] }
 *     the options listed in recommended-board order. No other mutation is recorded:
 *     GitHub can only add an option to an existing single-select field by
 *     replacing its whole option set, which can clear item values, so setup
 *     never sends one.
 */

import { CREATE_FIELD } from "../../../../lib/issues/github/mutations.mjs";
import { buildBoard, PROJECT_ID } from "./board.mjs";
import { okResponse, preflightEntry, preflightFixture } from "./preflight.mjs";

export const STATUS_OPTIONS = Object.freeze(["Backlog", "Ready", "In Progress", "In Review", "Deferred", "Done"]);
export const PRIORITY_OPTIONS = Object.freeze(["P0", "P1", "P2", "P3", "P4"]);
export const TEXT_FIELDS = Object.freeze(["Owner", "Claimed At", "Next Action", "Spec", "Plan", "Branch", "PR", "Legacy ID"]);

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "_");

function selectField(name, options) {
  return { id: `PVTSSF_${slug(name)}`, name, dataType: "SINGLE_SELECT", options: options.map((o, i) => ({ id: `${slug(name)}_opt_${i}`, name: o })) };
}

function textField(name) {
  return { id: `PVTF_${slug(name)}`, name, dataType: "TEXT" };
}

/**
 * The project's field nodes. `null` for status/priority omits that field.
 * @param {{ status?: string[]|null, priority?: string[]|null, text?: string[], extra?: object[] }} [opts]
 */
function projectFields({ status = STATUS_OPTIONS, priority = PRIORITY_OPTIONS, text = TEXT_FIELDS, extra = [] } = {}) {
  const nodes = [{ id: "PVTF_title", name: "Title", dataType: "TITLE" }];
  if (status) nodes.push(selectField("Status", status));
  if (priority) nodes.push(selectField("Priority", priority));
  nodes.push(...text.map(textField), ...extra);
  return nodes;
}

function project(fieldOpts, specs = []) {
  return buildBoard(specs, { preflight: [preflightEntry(okResponse({ fields: projectFields(fieldOpts) }))] });
}

function createVariables(name, options, dataType = options ? "SINGLE_SELECT" : "TEXT") {
  const variables = { projectId: PROJECT_ID, name, dataType };
  if (options) variables.singleSelectOptions = options.map((o) => ({ name: o, color: "GRAY", description: "" }));
  return variables;
}

function createdField(name, options, dataType = options ? "SINGLE_SELECT" : "TEXT") {
  const field = { id: `PVTF_new_${slug(name)}`, name, dataType };
  if (options) field.options = options.map((o, i) => ({ id: `new_${slug(name)}_opt_${i}`, name: o }));
  return field;
}

/** One successful CreateField entry; `options` makes it a single-select field, `dataType` overrides the type. */
export function createFieldEntry(name, options, dataType) {
  return {
    query: CREATE_FIELD,
    variables: createVariables(name, options, dataType),
    response: { data: { createProjectV2Field: { projectV2Field: createdField(name, options, dataType) } } },
  };
}

function rejectedCreate(name, options, error) {
  return { query: CREATE_FIELD, variables: createVariables(name, options), response: { data: null, errors: [error] } };
}

// Every CreateField of the recommended board, with `overrides` replacing the entry for a field name.
function recommendedCreates({ textNames = TEXT_FIELDS, overrides = {} } = {}) {
  const specs = [["Status", STATUS_OPTIONS], ["Priority", PRIORITY_OPTIONS], ...textNames.map((n) => [n, undefined])];
  return specs.map(([name, options]) => (overrides[name] ? overrides[name](name, options) : createFieldEntry(name, options)));
}

const EMPTY_FIELDS = { status: null, priority: null, text: [] };

const task = (number, extra = {}) => ({ number, issueType: "Task", ...extra });

// One item per BEH-26 drift category (gh-2 .. gh-7), plus controls that must not
// be reported: a clean item, a properly claimed item, closed items in a
// closed-mapped and an unmapped column, a known module and a reserved safety tag.
const DRIFT_SPECS = [
  task(1),
  task(2, { status: "Done" }),
  task(3, { status: "Icebox" }),
  task(4, { offProjectChildren: [900] }),
  task(5, { fields: { owner: "adev-fixture-bot" } }),
  task(6, { fields: { branch: "feat/x..y" } }),
  task(7, { labels: ["module:nope"] }),
  task(8, { fields: { owner: "adev-fixture-bot", claimed_at: "2026-11-20T10:00:00Z" } }),
  task(9, { state: "CLOSED", status: "Done" }),
  task(10, { labels: ["module:billing"] }),
  task(11, { labels: ["module:review-gate"] }),
  task(12, { state: "CLOSED", status: "Icebox" }),
];

const emptyProject = project(EMPTY_FIELDS);

// Responses a stand-in `gh` serves by operation name in the CLI subprocess tests.
export const STUB_RESPONSES = Object.freeze({
  emptyProject: Object.freeze({
    AdevPreflight: okResponse({ fields: projectFields(EMPTY_FIELDS) }),
    ProjectItems: { data: { node: { items: { totalCount: 0, pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } } },
  }),
});

export const setupFx = Object.freeze({
  // Only the built-in Title field; no items.
  emptyProject,
  emptyProjectCreate: [...emptyProject, ...recommendedCreates()],

  // GitHub rejects the Owner field with a non-specific GraphQL error.
  emptyProjectCreateRejected: [...emptyProject, ...recommendedCreates({
    overrides: { Owner: (name, options) => rejectedCreate(name, options, { type: "UNPROCESSABLE", path: ["createProjectV2Field"], message: "adev-fixture: field could not be created" }) },
  })],

  // The token may read the project but not change it.
  emptyProjectCreateForbidden: [...emptyProject, ...recommendedCreates({
    overrides: { Owner: (name, options) => rejectedCreate(name, options, { type: "FORBIDDEN", path: ["createProjectV2Field"], message: "adev-fixture: Resource not accessible by integration" }) },
  })],

  // tasks.github.fields maps owner to "Agent Owner".
  emptyProjectCreateRenamedOwner: [...emptyProject, ...recommendedCreates({ textNames: TEXT_FIELDS.map((n) => (n === "Owner" ? "Agent Owner" : n)) })],

  // tasks.github.priority_field is "Rank": a number field replaces the Priority single-select.
  emptyProjectCreateNumberPriority: [...emptyProject, ...recommendedCreates({
    overrides: { Priority: () => createFieldEntry("Rank", undefined, "NUMBER") },
  })],

  // Every recommended field, but Priority is a number field (no options).
  numberPriority: project({ priority: null, extra: [{ id: "PVTF_priority", name: "Priority", dataType: "NUMBER" }] }),

  // Every recommended field and option, a board with no drift.
  complete: project({}, [task(1), task(2, { state: "CLOSED", status: "Done" })]),

  // Every recommended field and option (Status also carries "Icebox"), one item per drift category.
  completeWithDrift: project({ status: [...STATUS_OPTIONS, "Icebox"] }, DRIFT_SPECS),

  // Status lacks Ready / In Review / Deferred, Priority lacks P3 / P4, Branch and Legacy ID are absent.
  partialOptions: [
    ...project({ status: ["Backlog", "In Progress", "Done"], priority: ["P0", "P1", "P2"], text: TEXT_FIELDS.filter((n) => n !== "Branch" && n !== "Legacy ID") }),
    createFieldEntry("Branch"),
    createFieldEntry("Legacy ID"),
  ],

  // Owner exists as a single-select field instead of text.
  ownerWrongType: project({
    text: TEXT_FIELDS.filter((n) => n !== "Owner"),
    extra: [{ id: "PVTSSF_owner", name: "Owner", dataType: "SINGLE_SELECT", options: [{ id: "o1", name: "adev-fixture-bot" }] }],
  }),

  // Status lacks "Deferred"; every field present.
  statusOptionMissing: project({ status: STATUS_OPTIONS.filter((o) => o !== "Deferred") }),

  // Every field except Legacy ID, which migration gates on through `setup --check`.
  legacyIdMissing: project({ text: TEXT_FIELDS.filter((n) => n !== "Legacy ID") }),

  // Preflight failures (BEH-28): the probe's own failure fixtures.
  projectNotFound: preflightFixture.projectNotFoundError,
  ownerNotFound: preflightFixture.ownerNotFoundError,
  projectMissing: preflightFixture.projectMissing,
  repoNotFound: preflightFixture.repoNotFoundError,
  scopesMissing: preflightFixture.scopesMissing,
  authRequired: preflightFixture.authRequired,
  cliMissing: preflightFixture.cliMissing,
  permissionDenied: [preflightEntry({
    data: { organization: { projectV2: null }, repository: { id: "R_fixture", nameWithOwner: "acme/board", visibility: "PRIVATE" } },
    errors: [{ type: "FORBIDDEN", path: ["organization", "projectV2"], message: "adev-fixture: Resource not accessible by integration" }],
  })],
});
