/**
 * Generated unit fixtures for the GitHub board write path (create, createEpic,
 * updateEpic, update, close, addDependency). Not recorded: every entry is served
 * through `replayExec`, so a write that sends any other document or variable set
 * hits UNRECORDED_GITHUB_REQUEST.
 *
 * Request contract these entries pin, for project acme/projects/7 and home repo
 * acme/board (preflight: projectId PVT_fixture, repositoryId R_fixture, the
 * field and option ids of preflight.mjs):
 *
 *   Reads (each fixture records all of them, so a write may skip the ones it
 *   does not need; none of them is a mutation):
 *   - AdevPreflight and PROJECT_ITEMS_QUERY exactly as board.mjs records them;
 *     parent_id and dependencies resolve through this board read.
 *   - REPO_LABELS_QUERY, REPO_ISSUE_TYPES_QUERY, REPO_MILESTONES_QUERY with
 *     `{ owner: "acme", name: "board" }`; each answers
 *     `{ repository: { labels|issueTypes|milestones: { totalCount, pageInfo, nodes } } }`
 *     with nodes `{ id, name }` (milestones: `{ id, title }`). Label, issue type
 *     and milestone ids come only from these lookups. Under `type_source: auto`
 *     the home repo has issue types when REPO_ISSUE_TYPES_QUERY returns any.
 *   - PROJECT_ITEM_QUERY with `{ itemId }` (the project item id): the read-back
 *     after the writes, answering `{ node: <item node> }` in the PROJECT_ITEMS_QUERY
 *     node shape. A whole-board re-read cannot serve it: its request key equals
 *     the pre-write board read's, so it would replay the board without the new item.
 *
 *   Mutations, in this order, each sent only when it has something to write:
 *   - CREATE_ISSUE `{ repositoryId, title, body }`, body = notes ("" when absent)
 *     -> `{ createIssue: { issue: { id, number } } }`
 *   - ADD_TO_PROJECT `{ projectId, contentId }` -> `{ addProjectV2ItemById: { item: { id } } }`
 *   - setFieldsDocument(kinds) `{ projectId, itemId, f<i>Field, f<i>Value }`: one
 *     aliased request; slot i is kinds[i] ("single_select" value = option id,
 *     "text" value = the text, "number" value = the number). Slot order: status
 *     (create always writes it, default open -> the status_map write option),
 *     priority (only when given: the `Priority` single-select option, or the
 *     number field `priority_field` names),
 *     then the text fields in config order next_action, spec_ref, planRef,
 *     branch, pr, legacy_id (create never writes owner or claimed_at: only
 *     claim() does).
 *   - ADD_SUB_ISSUE `{ issueId: <parent content id>, subIssueId }`
 *   - ADD_BLOCKED_BY `{ issueId, blockingIssueId }`, one request per dependency, in order
 *   - ADD_LABELS `{ labelableId, labelIds }`, one request; ids in the order
 *     epic | type:<t> (label typing only), priority:<n> (fallback only: no
 *     Priority single-select), then module:<slug> in affected_modules order
 *   - SET_ISSUE_TYPE `{ issueId, issueTypeId }` (issue typing only, when a type is given or for an epic)
 *   - SET_MILESTONE `{ issueId, milestoneId }`
 *   Every mutation other than the first two answers `{ <alias or root field>: { clientMutationId: null } }`.
 *
 * `failAt` turns one step into a GraphQL error (or, with `failError`, a failed
 * `gh` spawn) and drops every later step, read-back included, so a write that
 * carries on past a failure hits UNRECORDED_GITHUB_REQUEST.
 *
 * update / close / addDependency entries (`boardFixture`) record the preflight,
 * the board read and the repo lookups as above, then:
 *   - update(id, changes): every value is checked by its BEH-39 predicate before
 *     any request. Only changed fields are written, in this order:
 *     setFieldsDocument(kinds) as above (slots: status = the status_map write
 *     option, priority, then the changed text fields in config order, a field
 *     changed to "" as a "clear" slot carrying only `f<i>Field`; never owner
 *     or claimed_at); UPDATE_ISSUE `{ issueId, title?, body? }`
 *     carrying only a changed title and/or notes; ADD_LABELS with only the adev-family
 *     labels the item does not already carry (priority:<n> in label fallback, then
 *     `module:<slug>` in affected_modules order); REMOVE_LABELS `{ labelableId, labelIds }`
 *     with the adev-family labels the change replaces (the item's other priority:
 *     labels, then the module: labels of decoded affected_modules no longer wanted),
 *     never a label outside those families. Then the PROJECT_ITEM_QUERY read-back,
 *     which update() returns. Nothing changed: no mutation and no read-back.
 *     updateEpic(id, changes) writes title, notes, status, planRef and milestone the
 *     same way, with SET_MILESTONE last.
 *   - close(id, reason): guards from the board read (every issue reference
 *     carries `state`: the referenced board item's, or `refStates` for one off the
 *     project; an off-project reference without `refStates` carries none), then the status slot alone
 *     (setFieldsDocument(["single_select"]), the status_map write option for
 *     `closed`), CLOSE_ISSUE `{ issueId }` (its document fixes stateReason
 *     COMPLETED), and ADD_COMMENT `{ subjectId: <content id>, body: reason }` only
 *     when reason is non-empty. Nothing is requested after the last of these.
 *   - addDependency(issueId, dependsOnId): ADD_BLOCKED_BY `{ issueId, blockingIssueId }`
 *     (content ids) unless the board read already shows the link; nothing after it.
 *   CLOSE_ISSUE answers `{ closeIssue: { clientMutationId: null } }`, ADD_COMMENT
 *   `{ addComment: ... }`, UPDATE_ISSUE `{ updateIssue: ... }`, REMOVE_LABELS `{ removeLabelsFromLabelable: ... }`.
 */

import { buildBoard, PROJECT_ID } from "./board.mjs";
import { preflightEntry, okResponse, fieldNodes, preflightFixture } from "./preflight.mjs";
import {
  PROJECT_ITEMS_QUERY,
  PROJECT_ITEM_QUERY,
  BLOCKED_BY_PAGE_QUERY,
  SUB_ISSUES_PAGE_QUERY,
  REPO_LABELS_QUERY,
  REPO_ISSUE_TYPES_QUERY,
  REPO_MILESTONES_QUERY,
} from "../../../../lib/issues/github/queries.mjs";
import {
  CREATE_ISSUE,
  ADD_TO_PROJECT,
  setFieldsDocument,
  ADD_SUB_ISSUE,
  ADD_BLOCKED_BY,
  ADD_LABELS,
  SET_ISSUE_TYPE,
  SET_MILESTONE,
  CLOSE_ISSUE,
  ADD_COMMENT,
  UPDATE_ISSUE,
  REMOVE_LABELS,
} from "../../../../lib/issues/github/mutations.mjs";

export const REPOSITORY_ID = "R_fixture";
export const STATUS_FIELD_ID = "PVTSSF_status";
// Ids preflight.mjs gives the default status options and text fields.
export const STATUS_OPTION_IDS = Object.freeze({ Backlog: "opt_0", Ready: "opt_1", "In Progress": "opt_2", "In Review": "opt_3", Deferred: "opt_4", Done: "opt_5" });
export const TEXT_FIELD_IDS = Object.freeze({
  owner: "PVTF_text_0",
  claimed_at: "PVTF_text_1",
  next_action: "PVTF_text_2",
  spec_ref: "PVTF_text_3",
  planRef: "PVTF_text_4",
  branch: "PVTF_text_5",
  pr: "PVTF_text_6",
  legacy_id: "PVTF_text_7",
});
export const PRIORITY_FIELD_ID = "PVTSSF_priority";
export const PRIORITY_OPTION_IDS = Object.freeze(["prio_0", "prio_1", "prio_2", "prio_3", "prio_4"]);

export const LABEL_IDS = Object.freeze({
  epic: "LA_epic",
  "type:bug": "LA_type_bug",
  "type:feature": "LA_type_feature",
  "priority:0": "LA_priority_0",
  "priority:1": "LA_priority_1",
  "priority:2": "LA_priority_2",
  "priority:3": "LA_priority_3",
  "priority:4": "LA_priority_4",
  "module:lib": "LA_module_lib",
  "module:docs": "LA_module_docs",
  "good first issue": "LA_good_first_issue",
  wontfix: "LA_wontfix",
});
export const ISSUE_TYPE_IDS = Object.freeze({ task: "IT_task", bug: "IT_bug", feature: "IT_feature", epic: "IT_epic" });
const ISSUE_TYPE_NAMES = { task: "Task", bug: "Bug", feature: "Feature", epic: "Epic" };
export const MILESTONE_IDS = Object.freeze({ v1: "MI_v1", v2: "MI_v2" });

const REPO_VARIABLES = Object.freeze({ owner: "acme", name: "board" });

export const NUMBER_PRIORITY_FIELD_ID = "PVTF_prio_number";
export const RATE_RESET_AT = "2026-11-26T09:00:00.000Z";

/** A preflight whose project has a number field `Effort Rank`, for `priority_field: Effort Rank`. */
const numberPriorityPreflight = [preflightEntry(okResponse({
  fields: fieldNodes({ extra: [{ id: NUMBER_PRIORITY_FIELD_ID, name: "Effort Rank", dataType: "NUMBER" }] }),
}))];

/** A preflight whose project also has a `Priority` single-select with options P0-P4. */
const priorityPreflight = [preflightEntry(okResponse({
  fields: fieldNodes({
    extra: [{
      id: PRIORITY_FIELD_ID,
      name: "Priority",
      dataType: "SINGLE_SELECT",
      options: PRIORITY_OPTION_IDS.map((id, n) => ({ id, name: `P${n}` })),
    }],
  }),
}))];

/** A preflight whose `Priority` single-select lacks the `P3` option. */
const priorityWithoutP3Preflight = [preflightEntry(okResponse({
  fields: fieldNodes({
    extra: [{
      id: PRIORITY_FIELD_ID,
      name: "Priority",
      dataType: "SINGLE_SELECT",
      options: PRIORITY_OPTION_IDS.map((id, n) => ({ id, name: `P${n}` })).filter((o) => o.name !== "P3"),
    }],
  }),
}))];

function page(nodes) {
  return { totalCount: nodes.length, pageInfo: { hasNextPage: false, endCursor: null }, nodes };
}

function lookups({ typed = true } = {}) {
  const types = typed ? Object.entries(ISSUE_TYPE_IDS).map(([k, id]) => ({ id, name: ISSUE_TYPE_NAMES[k] })) : [];
  return [
    {
      query: REPO_LABELS_QUERY,
      variables: { ...REPO_VARIABLES },
      response: { data: { repository: { labels: page(Object.entries(LABEL_IDS).map(([name, id]) => ({ id, name }))) } } },
    },
    { query: REPO_ISSUE_TYPES_QUERY, variables: { ...REPO_VARIABLES }, response: { data: { repository: { issueTypes: page(types) } } } },
    {
      query: REPO_MILESTONES_QUERY,
      variables: { ...REPO_VARIABLES },
      response: { data: { repository: { milestones: page(Object.entries(MILESTONE_IDS).map(([title, id]) => ({ id, title }))) } } },
    },
  ];
}

// Slots of the aliased SetFields request: [kind, fieldId, value].
export const slot = Object.freeze({
  status: (option = "Backlog") => ["single_select", STATUS_FIELD_ID, STATUS_OPTION_IDS[option]],
  priority: (n) => ["single_select", PRIORITY_FIELD_ID, PRIORITY_OPTION_IDS[n]],
  text: (field, value) => ["text", TEXT_FIELD_IDS[field], value],
  // A cleared text field: the slot carries only its field id, no value variable.
  clear: (field) => ["clear", TEXT_FIELD_IDS[field]],
});

export function setFieldsRequest(itemId, slots) {
  const variables = { projectId: PROJECT_ID, itemId };
  slots.forEach(([kind, fieldId, value], i) => {
    variables[`f${i}Field`] = fieldId;
    if (kind !== "clear") variables[`f${i}Value`] = value;
  });
  return { query: setFieldsDocument(slots.map(([kind]) => kind)), variables };
}

export const done = (field) => ({ data: { [field]: { clientMutationId: null } } });

export function rejected(path, message) {
  return { data: null, errors: [{ type: "UNPROCESSABLE", path: [path], locations: [{ line: 2, column: 3 }], message }] };
}

/** One item node in the PROJECT_ITEMS_QUERY shape, built exactly as board.mjs builds board items. */
export function itemNode(spec, typedRepos) {
  const entry = buildBoard([spec], { preflight: [], typedRepos }).find((e) => e.query === PROJECT_ITEMS_QUERY);
  return entry.response.data.node.items.nodes[0];
}

/**
 * The write steps of one create, plus its read-back.
 *
 * @param {object} w
 * @param {number} w.number - the new issue's number; content id I_fixture_<n>, item id PVTI_fixture_<n>
 * @param {string} w.title
 * @param {string} [w.body=""]
 * @param {Array} [w.slots] - SetFields slots, see `slot`
 * @param {number} [w.parent] - parent issue number (home repo)
 * @param {number[]} [w.blockedBy]
 * @param {string[]} [w.labels] - label names, in request order
 * @param {string} [w.issueType] - key of ISSUE_TYPE_IDS
 * @param {string} [w.milestone] - key of MILESTONE_IDS
 * @param {string} [w.failAt] - operation name whose request GitHub rejects
 * @param {object} [w.failResponse] - the rejecting response (default an UNPROCESSABLE error)
 * @param {{ code?: string|null, stderr?: string }} [w.failError] - a failed spawn instead of a response
 * @param {object} w.readBack - board.mjs item spec for the read-back
 * @param {string[]} [w.typedRepos]
 */
function createSteps(w) {
  const contentId = `I_fixture_${w.number}`;
  const itemId = `PVTI_fixture_${w.number}`;
  const steps = [
    ["CreateIssue", "createIssue", { query: CREATE_ISSUE, variables: { repositoryId: REPOSITORY_ID, title: w.title, body: w.body ?? "" } },
      { data: { createIssue: { issue: { id: contentId, number: w.number } } } }],
    ["AddToProject", "addProjectV2ItemById", { query: ADD_TO_PROJECT, variables: { projectId: PROJECT_ID, contentId } },
      { data: { addProjectV2ItemById: { item: { id: itemId } } } }],
  ];
  if (w.slots?.length) {
    const response = { data: Object.fromEntries(w.slots.map((_, i) => [`f${i}`, { clientMutationId: null }])) };
    steps.push(["SetFields", "f0", setFieldsRequest(itemId, w.slots), response]);
  }
  if (w.parent !== undefined) {
    steps.push(["AddSubIssue", "addSubIssue", { query: ADD_SUB_ISSUE, variables: { issueId: `I_fixture_${w.parent}`, subIssueId: contentId } }, done("addSubIssue")]);
  }
  for (const n of w.blockedBy ?? []) {
    steps.push(["AddBlockedBy", "addBlockedBy", { query: ADD_BLOCKED_BY, variables: { issueId: contentId, blockingIssueId: `I_fixture_${n}` } }, done("addBlockedBy")]);
  }
  if (w.labels?.length) {
    steps.push(["AddLabels", "addLabelsToLabelable", { query: ADD_LABELS, variables: { labelableId: contentId, labelIds: w.labels.map((l) => LABEL_IDS[l]) } }, done("addLabelsToLabelable")]);
  }
  if (w.issueType) {
    steps.push(["SetIssueType", "updateIssueIssueType", { query: SET_ISSUE_TYPE, variables: { issueId: contentId, issueTypeId: ISSUE_TYPE_IDS[w.issueType] } }, done("updateIssueIssueType")]);
  }
  if (w.milestone) {
    steps.push(["SetMilestone", "updateIssue", { query: SET_MILESTONE, variables: { issueId: contentId, milestoneId: MILESTONE_IDS[w.milestone] } }, done("updateIssue")]);
  }

  const entries = [];
  for (const [operation, path, request, response] of steps) {
    if (operation === w.failAt) {
      entries.push(w.failError
        ? { ...request, error: w.failError }
        : { ...request, response: w.failResponse ?? rejected(path, "adev-fixture: GitHub rejected this write.") });
      return entries;
    }
    entries.push({ ...request, response });
  }
  if (w.failAt) throw new Error(`createSteps: no ${w.failAt} step to fail`);
  entries.push({ query: PROJECT_ITEM_QUERY, variables: { itemId }, response: { data: { node: itemNode({ number: w.number, ...w.readBack }, w.typedRepos) } } });
  return entries;
}

const epic = (number, extra = {}) => ({ number, issueType: "Epic", labels: ["epic"], ...extra });
export const task = (number, extra = {}) => ({ number, issueType: "Task", ...extra });

// gh-1 is an epic; gh-2 and gh-3 are tasks. Every create fixture carries this board.
const BOARD = [epic(1, { milestone: "v1" }), task(2), task(3)];
const READ_BACK_AT = "2026-11-26T08:00:00Z";

function fixture({ preflight = preflightFixture.ok, typedRepos, typed = true, board = BOARD } = {}, ...writes) {
  return [...buildBoard(board, { preflight, typedRepos }), ...lookups({ typed }), ...writes.flatMap((w) => createSteps({ typedRepos, ...w }))];
}

const itemIdOf = (n) => `PVTI_fixture_${n}`;
const contentIdOf = (n) => `I_fixture_${n}`;
export const CLOSED = Object.freeze({ state: "CLOSED", status: "Done" });

const refKey = (ref) => `${ref.repository.owner.login}/${ref.repository.name}#${ref.number}`;

/**
 * Give every issue reference of a built board the `state` GitHub reports for it:
 * `refStates[<home-repo number>]` when given, else the state of the item it names
 * on the board. A reference to an issue off the project with no `refStates` entry
 * carries no state, as a response GitHub truncated or redacted would.
 */
function withRefStates(entries, refStates) {
  const states = new Map(Object.entries(refStates).map(([n, state]) => [`acme/board#${n}`, state]));
  const pages = [];
  for (const e of entries) {
    if (e.query === PROJECT_ITEMS_QUERY) {
      for (const node of e.response.data.node.items.nodes) {
        if (node.content?.__typename !== "Issue") continue;
        if (!states.has(refKey(node.content))) states.set(refKey(node.content), node.content.state);
        pages.push(node.content.blockedBy.nodes, node.content.subIssues.nodes);
        if (node.content.parent) pages.push([node.content.parent]);
      }
    } else if (e.query === BLOCKED_BY_PAGE_QUERY || e.query === SUB_ISSUES_PAGE_QUERY) {
      const connection = e.response.data.node.blockedBy ?? e.response.data.node.subIssues;
      pages.push(connection.nodes);
    }
  }
  for (const ref of pages.flat()) {
    const state = states.get(refKey(ref));
    if (state !== undefined) ref.state = state;
  }
  return entries;
}

function boardFixture(board, { preflight = preflightFixture.ok, refStates = {} } = {}, ...entries) {
  return [...withRefStates(buildBoard(board, { preflight }), refStates), ...lookups(), ...entries];
}

const setFieldsEntry = (n, slots) => ({
  ...setFieldsRequest(itemIdOf(n), slots),
  response: { data: Object.fromEntries(slots.map((_, i) => [`f${i}`, { clientMutationId: null }])) },
});
const closeIssueEntry = (n) => ({ query: CLOSE_ISSUE, variables: { issueId: contentIdOf(n) }, response: done("closeIssue") });
const addCommentEntry = (n, body) => ({ query: ADD_COMMENT, variables: { subjectId: contentIdOf(n), body }, response: done("addComment") });
const addBlockedByEntry = (n, blocker) => ({
  query: ADD_BLOCKED_BY,
  variables: { issueId: contentIdOf(n), blockingIssueId: contentIdOf(blocker) },
  response: done("addBlockedBy"),
});
const addLabelsEntry = (n, labels) => ({
  query: ADD_LABELS,
  variables: { labelableId: contentIdOf(n), labelIds: labels.map((l) => LABEL_IDS[l]) },
  response: done("addLabelsToLabelable"),
});
const removeLabelsEntry = (n, labels) => ({
  query: REMOVE_LABELS,
  variables: { labelableId: contentIdOf(n), labelIds: labels.map((l) => LABEL_IDS[l]) },
  response: done("removeLabelsFromLabelable"),
});
const updateIssueEntry = (n, values) => ({ query: UPDATE_ISSUE, variables: { issueId: contentIdOf(n), ...values }, response: done("updateIssue") });
const readBackEntry = (spec) => ({ query: PROJECT_ITEM_QUERY, variables: { itemId: itemIdOf(spec.number) }, response: { data: { node: itemNode(spec) } } });
const rejecting = ({ query, variables }, response) => ({ query, variables, response });

export const UPDATE_REJECTION = "adev-fixture: Field value could not be written";
export const CLOSE_REJECTION = "adev-fixture: Issue could not be closed";
export const LINK_REJECTION = "adev-fixture: Issue may not block itself";

export const INJECTION = Object.freeze({
  title: "adev-fixture: \"} mutation Drop { deleteIssue(input: {}) } #",
  notes: "adev-fixture: @/etc/passwd $(touch /tmp/adev-pwn) `id` ; | & > <\n{ query }",
  next_action: "$(touch /tmp/adev-pwn) {query} @/etc/shadow",
});

export const writes = Object.freeze({
  createWithParent: fixture({}, {
    number: 300,
    title: "adev-fixture: t",
    body: "@/etc/passwd",
    slots: [slot.status(), slot.text("spec_ref", "x.spec.md")],
    parent: 1,
    labels: ["module:lib"],
    readBack: { title: "adev-fixture: t", body: "@/etc/passwd", issueType: null, fields: { spec_ref: "x.spec.md" }, labels: ["module:lib"], parent: { number: 1 }, createdAt: READ_BACK_AT, updatedAt: READ_BACK_AT },
  }),

  // Neither gh-404 nor gh-405 is on the project.
  boardWithoutParent: fixture({ board: [task(1), task(2)] }),

  createTypedIssueTypes: fixture({}, {
    number: 310,
    title: "adev-fixture: b",
    slots: [slot.status()],
    issueType: "bug",
    readBack: { title: "adev-fixture: b", issueType: "Bug" },
  }),

  createTypedLabels: fixture({}, {
    number: 311,
    title: "adev-fixture: b",
    slots: [slot.status()],
    labels: ["type:bug"],
    readBack: { title: "adev-fixture: b", issueType: null, labels: ["type:bug"] },
  }),

  createEpicWithMilestone: fixture({}, {
    number: 302,
    title: "adev-fixture: e",
    slots: [slot.status()],
    issueType: "epic",
    milestone: "v1",
    readBack: { title: "adev-fixture: e", issueType: "Epic", milestone: "v1" },
  }),

  // SetFields is rejected after the issue exists and is on the project.
  partial: fixture({}, {
    number: 301,
    title: "adev-fixture: t",
    slots: [slot.status(), slot.text("next_action", "Run /adev:plan")],
    failAt: "SetFields",
    readBack: {},
  }),

  // Every BEH-13 field at once, on a project with a Priority single-select.
  createFull: fixture({ preflight: priorityPreflight }, {
    number: 320,
    title: "adev-fixture: full",
    body: "adev-fixture: body",
    slots: [
      slot.status("Deferred"),
      slot.priority(1),
      slot.text("next_action", "Write the RED tests"),
      slot.text("spec_ref", "specs/a.spec.md"),
      slot.text("planRef", "plans/a.md"),
      slot.text("branch", "feat/a"),
      slot.text("pr", "#12"),
    ],
    parent: 1,
    blockedBy: [2, 3],
    labels: ["module:lib", "module:docs"],
    issueType: "feature",
    readBack: {
      title: "adev-fixture: full",
      body: "adev-fixture: body",
      status: "Deferred",
      issueType: "Feature",
      projectFields: { Priority: { option: "P1" } },
      fields: { next_action: "Write the RED tests", spec_ref: "specs/a.spec.md", planRef: "plans/a.md", branch: "feat/a", pr: "#12" },
      labels: ["module:lib", "module:docs"],
      parent: { number: 1 },
      blockedBy: [{ number: 2 }, { number: 3 }],
      createdAt: READ_BACK_AT,
      updatedAt: READ_BACK_AT,
    },
  }),

  // No Priority single-select and no priority_field: priority falls back to a label.
  createPriorityFallback: fixture({}, {
    number: 321,
    title: "adev-fixture: p",
    slots: [slot.status()],
    labels: ["priority:1"],
    readBack: { title: "adev-fixture: p", issueType: null, labels: ["priority:1"] },
  }),

  // status_map open: [Ready, Backlog] writes Ready, its first entry.
  createCustomStatusMap: fixture({}, {
    number: 322,
    title: "adev-fixture: s",
    slots: [slot.status("Ready")],
    readBack: { title: "adev-fixture: s", issueType: null, status: "Ready" },
  }),

  createInjection: fixture({}, {
    number: 323,
    title: INJECTION.title,
    body: INJECTION.notes,
    slots: [slot.status(), slot.text("next_action", INJECTION.next_action)],
    readBack: { title: INJECTION.title, body: INJECTION.notes, issueType: null, fields: { next_action: INJECTION.next_action } },
  }),

  // Owner without issue types: an epic is typed by the `epic` label.
  createEpicLabels: fixture({ typedRepos: [], typed: false }, {
    number: 324,
    title: "adev-fixture: le",
    slots: [slot.status(), slot.text("planRef", "plans/p.md")],
    labels: ["epic"],
    readBack: { title: "adev-fixture: le", issueType: null, labels: ["epic"], fields: { planRef: "plans/p.md" } },
  }),

  // GitHub rejects the CreateIssue request itself: no issue exists.
  createRejected: fixture({}, {
    number: 330,
    title: "adev-fixture: rejected",
    failAt: "CreateIssue",
    failResponse: rejected("createIssue", "adev-fixture: Title is too long"),
    readBack: {},
  }),

  createRateLimited: fixture({}, {
    number: 331,
    title: "adev-fixture: limited",
    failAt: "CreateIssue",
    failResponse: { data: null, errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded for user." }] },
    readBack: {},
  }),

  partialAtProject: fixture({}, {
    number: 332,
    title: "adev-fixture: np",
    slots: [slot.status(), slot.text("next_action", "Run /adev:plan"), slot.text("spec_ref", "x.spec.md")],
    failAt: "AddToProject",
    readBack: {},
  }),

  partialAtLabels: fixture({}, {
    number: 333,
    title: "adev-fixture: nl",
    slots: [slot.status(), slot.text("spec_ref", "x.spec.md")],
    parent: 1,
    labels: ["module:lib"],
    failAt: "AddLabels",
    readBack: {},
  }),

  // The milestone write is rejected after the epic exists and is typed.
  epicPartial: fixture({}, {
    number: 303,
    title: "adev-fixture: e",
    slots: [slot.status()],
    issueType: "epic",
    milestone: "v1",
    failAt: "SetMilestone",
    readBack: {},
  }),

  // SetFields is rate limited after the issue exists and is on the project.
  partialRateLimited: fixture({}, {
    number: 305,
    title: "adev-fixture: rl",
    slots: [slot.status(), slot.text("next_action", "Run /adev:plan")],
    failAt: "SetFields",
    failResponse: { data: null, errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded for user.", extensions: { resetAt: RATE_RESET_AT } }] },
    readBack: {},
  }),

  // The network drops on AddToProject, after the issue exists.
  partialUnreachable: fixture({}, {
    number: 306,
    title: "adev-fixture: net",
    slots: [slot.status()],
    failAt: "AddToProject",
    failError: { code: "ECONNRESET", stderr: "" },
    readBack: {},
  }),

  // The network drops on CreateIssue: no issue exists.
  createUnreachable: fixture({}, {
    number: 334,
    title: "adev-fixture: net",
    failAt: "CreateIssue",
    failError: { code: "ECONNRESET", stderr: "" },
    readBack: {},
  }),

  // priority_field names a number field: priority is written as a number slot.
  createNumericPriority: fixture({ preflight: numberPriorityPreflight }, {
    number: 325,
    title: "adev-fixture: n",
    slots: [slot.status(), ["number", NUMBER_PRIORITY_FIELD_ID, 3]],
    readBack: { title: "adev-fixture: n", issueType: null, projectFields: { "Effort Rank": { number: 3 } } },
  }),

  // The Priority single-select has no P3: a create at priority 3 is refused before CreateIssue.
  createPriorityOptionMissing: fixture({ preflight: priorityWithoutP3Preflight }),

  createPlain: fixture({}, {
    number: 304,
    title: "adev-fixture: plain",
    slots: [slot.status()],
    readBack: { title: "adev-fixture: plain", issueType: null },
  }),

  // updateEpic on gh-1 (milestone v1): a milestone change and a planRef change.
  // Both read back the same item, which carries both changes.
  updateEpic: [
    ...buildBoard(BOARD),
    ...lookups(),
    { query: SET_MILESTONE, variables: { issueId: "I_fixture_1", milestoneId: MILESTONE_IDS.v2 }, response: done("updateIssue") },
    { ...setFieldsRequest("PVTI_fixture_1", [slot.text("planRef", "plans/q.md")]), response: { data: { f0: { clientMutationId: null } } } },
    {
      query: PROJECT_ITEM_QUERY,
      variables: { itemId: "PVTI_fixture_1" },
      response: { data: { node: itemNode(epic(1, { milestone: "v2", fields: { planRef: "plans/q.md" }, updatedAt: READ_BACK_AT })) } },
    },
  ],

  // ---------------------------------------------------------------------------
  // update / close / addDependency
  // ---------------------------------------------------------------------------

  closedItem: boardFixture([task(5, CLOSED)]),

  openItem: boardFixture([task(6)]),

  // gh-6 gets priority 1 (the Priority single-select) and a next_action in one SetFields request.
  openItemUpdate: boardFixture([task(6)], { preflight: priorityPreflight },
    setFieldsEntry(6, [slot.priority(1), slot.text("next_action", "Run /adev:implement")]),
    readBackEntry(task(6, { fields: { priority: 1, next_action: "Run /adev:implement" }, updatedAt: READ_BACK_AT })),
  ),

  updateStatus: boardFixture([task(6)], {},
    setFieldsEntry(6, [slot.status("In Progress")]),
    readBackEntry(task(6, { status: "In Progress", updatedAt: READ_BACK_AT })),
  ),

  // gh-6 carries a next_action and a branch; clearing next_action keeps the branch.
  updateClear: boardFixture([task(6, { fields: { next_action: "Run /adev:plan", branch: "feat/a" } })], {},
    setFieldsEntry(6, [slot.clear("next_action")]),
    readBackEntry(task(6, { fields: { branch: "feat/a" }, updatedAt: READ_BACK_AT })),
  ),

  // gh-6 clears next_action and moves branch in one SetFields request, in config order.
  updateClearAndSet: boardFixture([task(6, { fields: { next_action: "Run /adev:plan", branch: "feat/a" } })], {},
    setFieldsEntry(6, [slot.clear("next_action"), slot.text("branch", "feat/b")]),
    readBackEntry(task(6, { fields: { branch: "feat/b" }, updatedAt: READ_BACK_AT })),
  ),

  // gh-6 has no module label; gh-11 already carries module:lib.
  updateModules: boardFixture([task(6), task(11, { labels: ["module:lib"] })], {},
    addLabelsEntry(6, ["module:lib", "module:docs"]),
    readBackEntry(task(6, { labels: ["module:lib", "module:docs"], updatedAt: READ_BACK_AT })),
    addLabelsEntry(11, ["module:docs"]),
    readBackEntry(task(11, { labels: ["module:lib", "module:docs"], updatedAt: READ_BACK_AT })),
  ),

  updateRejected: boardFixture([task(6)], {},
    rejecting(setFieldsEntry(6, [slot.text("next_action", "Run /adev:plan")]), rejected("f0", UPDATE_REJECTION)),
  ),

  // A rate limit that reports no reset time.
  updateRateLimited: boardFixture([task(6)], {},
    rejecting(setFieldsEntry(6, [slot.text("next_action", "Run /adev:plan")]), { data: null, errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded for user." }] }),
  ),

  // gh-7 is blocked by open gh-20 and closed gh-21.
  blockedItem: boardFixture([task(7, { blockedBy: [{ number: 20 }, { number: 21 }] }), task(20), task(21, CLOSED)]),

  // Epic gh-1 has open gh-2 and closed gh-3; task gh-30 has open gh-31.
  parentWithOpenChild: boardFixture([
    epic(1),
    task(2, { parent: { number: 1 } }),
    task(3, { parent: { number: 1 }, ...CLOSED }),
    task(30),
    task(31, { parent: { number: 30 } }),
  ]),

  // gh-8: its only blocker gh-21 and its only on-project sub-issue gh-22 are closed; sub-issue #98 is off the project.
  closeOk: boardFixture([task(8, { blockedBy: [{ number: 21 }], offProjectChildren: [98] }), task(21, CLOSED), task(22, { parent: { number: 8 }, ...CLOSED })], {},
    setFieldsEntry(8, [slot.status("Done")]),
    closeIssueEntry(8),
    addCommentEntry(8, "done in #12"),
  ),

  // gh-50's sub-issue gh-51 sits in an unmapped column; gh-52's sub-issue gh-53 has a
  // branch BEH-39 refuses. Neither sub-issue decodes.
  closeChildUndecodable: boardFixture([
    task(50),
    task(51, { parent: { number: 50 }, status: "Triage" }),
    task(52),
    task(53, { parent: { number: 52 }, fields: { branch: "@" } }),
  ]),

  // Off-project blockers: gh-60's #90 is open, gh-61's #91 is closed, gh-62's #92 reports no state.
  blockedOffProject: boardFixture([
    task(60, { blockedBy: [{ number: 90 }] }),
    task(61, { blockedBy: [{ number: 91 }] }),
    task(62, { blockedBy: [{ number: 92 }] }),
  ], { refStates: { 90: "OPEN", 91: "CLOSED" } },
    setFieldsEntry(61, [slot.status("Done")]),
    closeIssueEntry(61),
  ),

  // gh-70 > closed gh-71 > open gh-72; gh-73 > closed gh-74 > gh-75 in an unmapped column.
  cascadeGrandchild: boardFixture([
    task(70),
    task(71, { parent: { number: 70 }, ...CLOSED }),
    task(72, { parent: { number: 71 } }),
    task(73),
    task(74, { parent: { number: 73 }, ...CLOSED }),
    task(75, { parent: { number: 74 }, status: "Triage" }),
  ]),

  // gh-80 and closed gh-81 are each other's sub-issue.
  cascadeCycle: boardFixture([task(80, { parent: { number: 81 } }), task(81, { parent: { number: 80 }, ...CLOSED })], {},
    setFieldsEntry(80, [slot.status("Done")]),
    closeIssueEntry(80),
  ),

  closeRejected: boardFixture([task(8)], {},
    setFieldsEntry(8, [slot.status("Done")]),
    rejecting(closeIssueEntry(8), rejected("closeIssue", CLOSE_REJECTION)),
  ),

  // The legacy IDs of board.mjs's `migrated` board; gh-41 (issue-7k3f9a) can be updated and closed.
  migratedBoard: boardFixture([
    task(41, { fields: { legacy_id: "issue-7k3f9a" } }),
    task(42, { fields: { legacy_id: "epic-2" } }),
    task(43, { fields: { legacy_id: "epic-2" } }),
  ], {},
    setFieldsEntry(41, [slot.text("next_action", "Run /adev:implement")]),
    readBackEntry(task(41, { fields: { legacy_id: "issue-7k3f9a", next_action: "Run /adev:implement" }, updatedAt: READ_BACK_AT })),
    setFieldsEntry(41, [slot.status("Done")]),
    closeIssueEntry(41),
  ),

  // gh-9 is already blocked by gh-10; linking it to gh-11 is recorded.
  dependencyExists: boardFixture([task(9, { blockedBy: [{ number: 10 }] }), task(10), task(11)], {},
    addBlockedByEntry(9, 11),
  ),

  // gh-6 gets a new title; gh-13 a new body.
  updateIssueText: boardFixture([task(6), task(13)], {},
    updateIssueEntry(6, { title: "adev-fixture: renamed" }),
    readBackEntry(task(6, { title: "adev-fixture: renamed", updatedAt: READ_BACK_AT })),
    updateIssueEntry(13, { body: "adev-fixture: new body" }),
    readBackEntry(task(13, { body: "adev-fixture: new body", updatedAt: READ_BACK_AT })),
  ),

  // gh-11 swaps module:lib for module:docs; gh-12 drops both. Their other labels stay.
  updateModulesReplace: boardFixture([task(11, { labels: ["module:lib", "good first issue"] }), task(12, { labels: ["module:lib", "module:docs", "wontfix"] })], {},
    addLabelsEntry(11, ["module:docs"]),
    removeLabelsEntry(11, ["module:lib"]),
    readBackEntry(task(11, { labels: ["good first issue", "module:docs"], updatedAt: READ_BACK_AT })),
    removeLabelsEntry(12, ["module:lib", "module:docs"]),
    readBackEntry(task(12, { labels: ["wontfix"], updatedAt: READ_BACK_AT })),
  ),

  // No Priority field: gh-14 moves from priority:3 to priority:1; gh-15 has no priority label.
  updatePriorityLabel: boardFixture([task(14, { labels: ["priority:3", "good first issue"] }), task(15)], {},
    addLabelsEntry(14, ["priority:1"]),
    removeLabelsEntry(14, ["priority:3"]),
    readBackEntry(task(14, { labels: ["good first issue", "priority:1"], updatedAt: READ_BACK_AT })),
    addLabelsEntry(15, ["priority:0"]),
    readBackEntry(task(15, { labels: ["priority:0"], updatedAt: READ_BACK_AT })),
  ),

  // Epic gh-1 is deferred; epic gh-16 is renamed; epic gh-4 is closed.
  epicUpdate: boardFixture([epic(1), epic(16), epic(4, CLOSED)], {},
    setFieldsEntry(1, [slot.status("Deferred")]),
    readBackEntry(epic(1, { status: "Deferred", updatedAt: READ_BACK_AT })),
    updateIssueEntry(16, { title: "adev-fixture: renamed epic" }),
    readBackEntry(epic(16, { title: "adev-fixture: renamed epic", updatedAt: READ_BACK_AT })),
  ),

  dependencyRejected: boardFixture([task(9), task(10)], {},
    rejecting(addBlockedByEntry(9, 10), rejected("addBlockedBy", LINK_REJECTION)),
  ),
});
