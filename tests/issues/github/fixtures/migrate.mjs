/**
 * Generated unit fixtures for `adev issues migrate --to github` from a json
 * source board. Not recorded: every entry is served through `replayExec`, so a
 * migration that sends any other document or variable set hits
 * UNRECORDED_GITHUB_REQUEST.
 *
 * Source board (seedJsonBoard), in copy order (epics first, then issues):
 *   0. e1            epic                      -> gh-101
 *   1. e1.f1         feature, priority 1, parent e1, depends on issue-7k3f9a -> gh-102
 *   2. issue-7k3f9a  task, priority 2          -> gh-103
 *   -  issue-c0ffee  task, priority 3, closed: in scope only with --include-closed -> gh-104
 *
 * Target: project acme/projects/7, home repo acme/board, `type_source: labels`,
 * a project with every adev text field (Legacy ID included) and the recommended
 * `Priority` single-select (P0-P4), so the `setup --check` gate passes.
 *
 * Request contract these entries pin:
 *   - AdevPreflight with ORG_VARIABLES (any number of times).
 *   - PROJECT_ITEMS_QUERY `{ projectId }`, recorded as a `sequence`: the first
 *     read is the board as the run finds it; up to AFTER_READS further reads see
 *     the board once every item exists (no link replayed yet). A sixth read fails.
 *   - REPO_LABELS_QUERY `{ owner, name }`: labels epic, type:feature, type:task.
 *   - Per created item, in this order: CREATE_ISSUE `{ repositoryId, title, body }`
 *     (body = notes); ADD_TO_PROJECT `{ projectId, contentId }`; ONE SetFields
 *     request whose slot 0 is Legacy ID = the source ID, then status (the
 *     status_map write option: Backlog, or Done for a closed item), then
 *     Priority; ADD_LABELS with the item's type label; the PROJECT_ITEM_QUERY
 *     read-back. No parent or dependency is sent with a create.
 *   - A closed item (--include-closed) is created open like any other, then
 *     closed as close() closes: the status slot alone (Done) in one SetFields
 *     request, then CLOSE_ISSUE `{ issueId }`; no ADD_COMMENT is recorded. The
 *     board reads after the creates show it open, so close()'s guards pass.
 *   - After every item exists: ADD_SUB_ISSUE `{ issueId: I_fixture_101,
 *     subIssueId: I_fixture_102 }` and ADD_BLOCKED_BY `{ issueId: I_fixture_102,
 *     blockingIssueId: I_fixture_103 }`, each only when the board lacks it.
 *   - Finishing an item found by legacy_id whose create stopped after the
 *     SetFields request: only the writes it lacks (here ADD_LABELS type:feature).
 *   - Completing the issue recorded in `.migrate-unanchored.json`:
 *     ISSUE_QUERY `{ owner: "acme", name: "board", number }` ->
 *     `{ repository: { issue: { id, number, state } | null } }` verifies it; then
 *     ADD_TO_PROJECT, the same single SetFields request (Legacy ID first),
 *     ADD_LABELS and the read-back, exactly as a create minus CREATE_ISSUE.
 *   - Rate limits (rateLimited, rateLimitedCreate): the limited request is a
 *     `sequence` of RATE_LIMITED answers, each resetting `CLOCK_BASE + ms`, then
 *     (when it recovers) the recorded success; the identical request is re-issued.
 *
 * Beads source (seedBeadsBoard): a temp repo whose `.beads/` is a linked
 * worktree on an orphan `beads-board` branch. The board itself is served by a
 * `br` stub that prints BEADS_LIST for `br list`: one task, issue-7k3f9a -> gh-103.
 */

import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { buildBoard, PROJECT_ID } from "./board.mjs";
import { preflightEntry, okResponse, fieldNodes, preflightFixture } from "./preflight.mjs";
import { setFieldsRequest, slot, done, rejected, itemNode, REPOSITORY_ID, PRIORITY_FIELD_ID, PRIORITY_OPTION_IDS } from "./writes.mjs";
import { PROJECT_ITEMS_QUERY, PROJECT_ITEM_QUERY, REPO_LABELS_QUERY, ISSUE_QUERY } from "../../../../lib/issues/github/queries.mjs";
import { CREATE_ISSUE, ADD_TO_PROJECT, ADD_SUB_ISSUE, ADD_BLOCKED_BY, ADD_LABELS, CLOSE_ISSUE } from "../../../../lib/issues/github/mutations.mjs";

export const PROJECT = "https://github.com/orgs/acme/projects/7";
export const OTHER_PROJECT = "https://github.com/orgs/other/projects/1";
export const ENV_TOKEN = "fixture-token-12345";
const AFTER_READS = 4;

export const TITLES = Object.freeze({
  e1: "adev-fixture: epic one",
  f1: "adev-fixture: feature one",
  t: "adev-fixture: loose task",
  closed: "adev-fixture: closed task",
});
const NOTES = "adev-fixture: feature notes";

export const LABEL_IDS = Object.freeze({ epic: "LA_epic", "type:feature": "LA_type_feature", "type:task": "LA_type_task" });

const TEXT_NAMES_WITHOUT_LEGACY = ["Owner", "Claimed At", "Next Action", "Spec", "Plan", "Branch", "PR"];
const PRIORITY = {
  id: PRIORITY_FIELD_ID,
  name: "Priority",
  dataType: "SINGLE_SELECT",
  options: PRIORITY_OPTION_IDS.map((id, n) => ({ id, name: `P${n}` })),
};
const PREFLIGHT = [preflightEntry(okResponse({ fields: fieldNodes({ extra: [PRIORITY] }) }))];
const PREFLIGHT_WITHOUT_LEGACY = [preflightEntry(okResponse({ fields: fieldNodes({ textNames: TEXT_NAMES_WITHOUT_LEGACY, extra: [PRIORITY] }) }))];

const T0 = "2026-11-01T00:00:00.000Z";

/**
 * Write `.context-index/manifest.yaml` and a json board under `dir`; return the
 * parsed manifest that `run()` is given.
 * @param {string} dir
 */
export async function seedJsonBoard(dir) {
  mkdirSync(join(dir, ".context-index", "tasks"), { recursive: true });
  writeFileSync(
    join(dir, ".context-index", "manifest.yaml"),
    `project:\n  name: adev-fixture\ntasks:\n  backend: json\n  github:\n    project: ${PROJECT}\n    repo: acme/board\n    type_source: labels\n`,
  );
  const issue = (id, extra) => ({ id, status: "open", dependencies: [], notes: "", next_action: null, created: T0, updated: T0, ...extra });
  const board = {
    version: 2,
    seq: 0,
    epics: [{ id: "e1", title: TITLES.e1, status: "open", notes: "", created: T0, updated: T0 }],
    issues: [
      issue("e1.f1", { title: TITLES.f1, type: "feature", priority: 1, parent_id: "e1", dependencies: ["issue-7k3f9a"], notes: NOTES }),
      issue("issue-7k3f9a", { title: TITLES.t, type: "task", priority: 2 }),
      issue("issue-c0ffee", { title: TITLES.closed, type: "task", priority: 3, status: "closed" }),
    ],
  };
  writeFileSync(join(dir, ".context-index", "tasks", "tasks.json"), JSON.stringify(board, null, 2) + "\n");
  return {
    project: { name: "adev-fixture" },
    tasks: { backend: "json", github: { project: PROJECT, repo: "acme/board", type_source: "labels" } },
  };
}

// Board item specs (board.mjs / rawItem options), as the target holds each item once complete.
const withFields = (base, extra = {}) => ({ ...base, ...extra, fields: { ...base.fields, ...(extra.fields ?? {}) } });
export const onBoard = Object.freeze({
  e1: (extra) => withFields({ number: 101, title: TITLES.e1, labels: ["epic"], fields: { legacy_id: "e1" } }, extra),
  f1: (extra) => withFields({ number: 102, title: TITLES.f1, body: NOTES, labels: ["type:feature"], fields: { legacy_id: "e1.f1", priority: 1 } }, extra),
  t: (extra) => withFields({ number: 103, title: TITLES.t, labels: ["type:task"], fields: { legacy_id: "issue-7k3f9a", priority: 2 } }, extra),
  closed: (extra) => withFields({ number: 104, title: TITLES.closed, labels: ["type:task"], state: "CLOSED", status: "Done", fields: { legacy_id: "issue-c0ffee", priority: 3 } }, extra),
});

function boardRead(specs) {
  return { response: buildBoard(specs, { preflight: [] }).find((e) => e.query === PROJECT_ITEMS_QUERY && !("after" in e.variables)).response };
}

/** Preflight, the label lookup, and the board read as a sequence: `before`, then `after` for every later read. */
function target(before, after = before, { preflight = PREFLIGHT } = {}) {
  const first = boardRead(before);
  const later = boardRead(after);
  return [
    ...preflight,
    { query: PROJECT_ITEMS_QUERY, variables: { projectId: PROJECT_ID }, sequence: [first, ...Array.from({ length: AFTER_READS }, () => later)] },
    {
      query: REPO_LABELS_QUERY,
      variables: { owner: "acme", name: "board" },
      response: {
        data: {
          repository: {
            labels: {
              totalCount: Object.keys(LABEL_IDS).length,
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: Object.entries(LABEL_IDS).map(([name, id]) => ({ id, name })),
            },
          },
        },
      },
    },
  ];
}

const legacy = (id) => slot.text("legacy_id", id);
const contentId = (n) => `I_fixture_${n}`;
const itemId = (n) => `PVTI_fixture_${n}`;

// What each source item's create sends, and the board spec its read-back returns.
const CREATES = Object.freeze({
  e1: { number: 101, title: TITLES.e1, slots: [legacy("e1"), slot.status()], labels: ["epic"], readBack: onBoard.e1() },
  f1: { number: 102, title: TITLES.f1, body: NOTES, slots: [legacy("e1.f1"), slot.status(), slot.priority(1)], labels: ["type:feature"], readBack: onBoard.f1() },
  t: { number: 103, title: TITLES.t, slots: [legacy("issue-7k3f9a"), slot.status(), slot.priority(2)], labels: ["type:task"], readBack: onBoard.t() },
  closed: { number: 104, title: TITLES.closed, slots: [legacy("issue-c0ffee"), slot.status(), slot.priority(3)], labels: ["type:task"], close: true, readBack: onBoard.closed({ state: "OPEN", status: "Backlog" }) },
});

const addToProject = (n) => ({ query: ADD_TO_PROJECT, variables: { projectId: PROJECT_ID, contentId: contentId(n) }, response: { data: { addProjectV2ItemById: { item: { id: itemId(n) } } } } });
const setFields = (n, slots) => ({ ...setFieldsRequest(itemId(n), slots), response: { data: Object.fromEntries(slots.map((_, i) => [`f${i}`, { clientMutationId: null }])) } });
const addLabels = (n, labels) => ({ query: ADD_LABELS, variables: { labelableId: contentId(n), labelIds: labels.map((l) => LABEL_IDS[l]) }, response: done("addLabelsToLabelable") });
const readBack = (spec) => ({ query: PROJECT_ITEM_QUERY, variables: { itemId: itemId(spec.number) }, response: { data: { node: itemNode(spec) } } });
const issueLookup = (n, issue) => ({ query: ISSUE_QUERY, variables: { owner: "acme", name: "board", number: n }, response: { data: { repository: { issue } } } });

/**
 * The requests of one create. `failAt` turns that step into a rejection (or, with
 * `failError`, a failed `gh` spawn) and drops every later step.
 */
function create(c, { failAt, failError } = {}) {
  const steps = [
    ["CreateIssue", "createIssue", { query: CREATE_ISSUE, variables: { repositoryId: REPOSITORY_ID, title: c.title, body: c.body ?? "" } },
      { data: { createIssue: { issue: { id: contentId(c.number), number: c.number } } } }],
    ["AddToProject", "addProjectV2ItemById", addToProject(c.number), addToProject(c.number).response],
    ["SetFields", "f0", setFieldsRequest(itemId(c.number), c.slots), setFields(c.number, c.slots).response],
    ["AddLabels", "addLabelsToLabelable", addLabels(c.number, c.labels), done("addLabelsToLabelable")],
  ];
  const entries = [];
  for (const [operation, path, request, response] of steps) {
    const { query, variables } = request;
    if (operation === failAt) {
      entries.push(failError ? { query, variables, error: failError } : { query, variables, response: rejected(path, "adev-fixture: GitHub rejected this write.") });
      return entries;
    }
    entries.push({ query, variables, response });
  }
  entries.push(readBack(c.readBack));
  if (c.close) entries.push(setFields(c.number, [slot.status("Done")]), { query: CLOSE_ISSUE, variables: { issueId: contentId(c.number) }, response: done("closeIssue") });
  return entries;
}

const PARENT_LINK = { query: ADD_SUB_ISSUE, variables: { issueId: contentId(101), subIssueId: contentId(102) }, response: done("addSubIssue") };
const DEP_LINK = { query: ADD_BLOCKED_BY, variables: { issueId: contentId(102), blockingIssueId: contentId(103) }, response: done("addBlockedBy") };
const ALL = () => [onBoard.e1(), onBoard.f1(), onBoard.t()];

// Assembled at runtime so no token-shaped literal sits in this source file.
const GHP_TOKEN = ["gh", "p_", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"].join("");
const PAT_TOKEN = ["github", "_pat_", "11ABCDEFG0123456789_abcdefghijklmnopqrstuv"].join("");
export const SECRET_STDERR = `adev-fixture: proxy refused the request token=${ENV_TOKEN} ${GHP_TOKEN} ${PAT_TOKEN} Authorization: bearer abc.def`;

const foreign = (number, legacyId) => ({ number, title: `adev-fixture: item ${number}`, fields: { legacy_id: legacyId } });
export const MANY_FOREIGN = Object.freeze(Array.from({ length: 12 }, (_, i) => `issue-fx${String(i + 1).padStart(2, "0")}`));
export const RESET_AT = "2026-11-26T09:00:00.000Z";
const RATE_LIMITED = { response: { data: null, errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded for user.", extensions: { resetAt: RESET_AT } }] } };

/** `entries` with the board read's reads after the first replaced by `later`. */
function laterBoardReads(entries, later) {
  return entries.map((e) => (e.query === PROJECT_ITEMS_QUERY && e.sequence ? { ...e, sequence: [e.sequence[0], ...later] } : e));
}

export const UNSAFE_FOREIGN = `\u001b[31m${"z".repeat(150)}`;

const FRESH = [...target([], ALL()), ...create(CREATES.e1), ...create(CREATES.f1), ...create(CREATES.t), PARENT_LINK, DEP_LINK];

/** The injected clock's start; every fixture reset time is an offset from it. */
export const CLOCK_BASE = Date.parse("2026-11-26T08:00:00.000Z");
export const resetIso = (ms) => new Date(CLOCK_BASE + ms).toISOString();

function rateLimitedOutcome(resetInMs) {
  const error = { type: "RATE_LIMITED", message: "API rate limit exceeded for user." };
  if (resetInMs !== null) error.extensions = { resetAt: resetIso(resetInMs) };
  return { response: { data: null, errors: [error] } };
}

const isCreateOf = (title) => (e) => e.query === CREATE_ISSUE && e.variables?.title === title;
const isAddToProjectOf = (n) => (e) => e.query === ADD_TO_PROJECT && e.variables?.contentId === contentId(n);

function limitedEntry(entries, match, resetsInMs, recovers) {
  return entries.map((e) => {
    if (!match(e)) return e;
    const outcomes = resetsInMs.map(rateLimitedOutcome);
    return { query: e.query, variables: e.variables, sequence: recovers ? [...outcomes, { response: e.response }] : outcomes };
  });
}

/** FRESH, with e1's AddToProject (after its issue exists) rate limited once, resetting `resetInMs` after CLOCK_BASE. */
export function rateLimited(resetInMs) {
  return limitedEntry(FRESH, isAddToProjectOf(101), [resetInMs], true);
}

/**
 * FRESH, with e1's CreateIssue (the run's first mutation) answered by one
 * RATE_LIMITED per entry of `resetsInMs` (null: no reset time), then the recorded
 * success when `recovers`.
 */
export function rateLimitedCreate(resetsInMs, { recovers = false } = {}) {
  return limitedEntry(FRESH, isCreateOf(TITLES.e1), resetsInMs, recovers);
}

function withPreflight(entries, response) {
  return entries.map((e) => (e.query === PREFLIGHT[0].query ? { ...e, response } : e));
}

/** FRESH against a public home repository and a private project. */
const PUBLIC_REPO = okResponse({ fields: fieldNodes({ extra: [PRIORITY] }), repoVisibility: "PUBLIC" });

/** FRESH against a project whose title is `title`. */
export function projectTitled(title) {
  const response = okResponse({ fields: fieldNodes({ extra: [PRIORITY] }) });
  response.data.organization.projectV2.title = title;
  return withPreflight(FRESH, response);
}

/** `br list -s all --json` for the beads source board. */
export const BEADS_LIST = JSON.stringify({
  issues: [{ id: "bd-1", external_ref: "issue-7k3f9a", title: TITLES.t, status: "open", priority: 2, issue_type: "task", description: "", dependency_count: 0 }],
});

const git = (args, cwd) => execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8", stdio: "pipe" }).trim();

/**
 * A git repo on `main` holding a beads manifest, whose `.beads/` is a linked
 * worktree on an orphan `beads-board` branch with one commit; return the parsed
 * manifest that `run()` is given.
 * @param {string} dir
 */
export function seedBeadsBoard(dir) {
  git(["init", "-q", "-b", "main"], dir);
  git(["config", "user.email", "fixture@example.invalid"], dir);
  git(["config", "user.name", "adev-fixture"], dir);
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(
    join(dir, ".context-index", "manifest.yaml"),
    `project:\n  name: adev-fixture\ntasks:\n  backend: beads\n  github:\n    project: ${PROJECT}\n    repo: acme/board\n    type_source: labels\n`,
  );
  git(["add", "--", ".context-index/manifest.yaml"], dir);
  git(["commit", "-q", "-m", "root"], dir);
  git(["worktree", "add", "-q", "--orphan", "-b", "beads-board", ".beads"], dir);
  const beads = join(dir, ".beads");
  writeFileSync(join(beads, "issues.jsonl"), "");
  git(["add", "--", "issues.jsonl"], beads);
  git(["commit", "-q", "-m", "board"], beads);
  return {
    project: { name: "adev-fixture" },
    tasks: { backend: "beads", github: { project: PROJECT, repo: "acme/board", type_source: "labels" } },
  };
}

export const migrateFx = Object.freeze({
  freshPublicRepo: withPreflight(FRESH, PUBLIC_REPO),

  beadsFresh: [...target([], [onBoard.t()]), ...create(CREATES.t)],
  beadsAllPresent: [...target([onBoard.t()])],

  fresh: FRESH,

  failsAtItem2: [...target([], [onBoard.e1()]), ...create(CREATES.e1), ...create(CREATES.f1, { failAt: "CreateIssue" })],

  resumeFromItem2: [...target([onBoard.e1()], ALL()), ...create(CREATES.f1), ...create(CREATES.t), PARENT_LINK, DEP_LINK],

  // e1.f1 stops at AddLabels, after the SetFields request that carries Legacy ID.
  partialCreateAtItem2: [...target([], [onBoard.e1(), onBoard.f1({ labels: [] })]), ...create(CREATES.e1), ...create(CREATES.f1, { failAt: "AddLabels" })],

  // The re-run after partialCreateAtItem2: e1.f1 is found by legacy_id and only its type label is written.
  finishPartialAtItem2: [
    ...target([onBoard.e1(), onBoard.f1({ labels: [] })], ALL()),
    addLabels(102, ["type:feature"]),
    readBack(onBoard.f1()),
    ...create(CREATES.t),
    PARENT_LINK,
    DEP_LINK,
  ],

  // e1.f1's issue (gh-102) exists but AddToProject failed: Legacy ID was never written.
  unanchoredAtItem2: [...target([], [onBoard.e1()]), ...create(CREATES.e1), ...create(CREATES.f1, { failAt: "AddToProject" })],

  completeUnanchored: [
    ...target([onBoard.e1()], ALL()),
    issueLookup(102, { id: contentId(102), number: 102, state: "OPEN" }),
    addToProject(102),
    setFields(102, CREATES.f1.slots),
    addLabels(102, ["type:feature"]),
    readBack(onBoard.f1()),
    ...create(CREATES.t),
    PARENT_LINK,
    DEP_LINK,
  ],

  // The record names issue-7k3f9a (gh-103, off the project); e1.f1, earlier in copy order, is not created yet
  // and stops in AddToProject once gh-103 is complete.
  unanchoredLaterItem: [
    ...target([onBoard.e1()], [onBoard.e1(), onBoard.t()]),
    issueLookup(103, { id: contentId(103), number: 103, state: "OPEN" }),
    addToProject(103),
    setFields(103, CREATES.t.slots),
    addLabels(103, ["type:task"]),
    readBack(onBoard.t()),
    ...create(CREATES.f1, { failAt: "AddToProject" }),
  ],

  // Completing the recorded gh-103 fails in AddToProject: nothing may be created after it.
  unanchoredCompletionFails: [
    ...target([onBoard.e1()]),
    issueLookup(103, { id: contentId(103), number: 103, state: "OPEN" }),
    { query: ADD_TO_PROJECT, variables: { projectId: PROJECT_ID, contentId: contentId(103) }, response: rejected("addProjectV2ItemById", "adev-fixture: item could not be added") },
    ...create(CREATES.f1),
  ],

  // The record names gh-102 for e1.f1, but gh-110 already holds Legacy ID e1.f1.
  unanchoredSourceHeldElsewhere: [
    ...target([onBoard.e1(), onBoard.f1({ number: 110 })]),
    issueLookup(102, { id: contentId(102), number: 102, state: "OPEN" }),
  ],

  // The record names issue-c0ffee (gh-104), which is closed on the source: out of scope without --include-closed.
  unanchoredOutOfScope: [...target([onBoard.e1()]), issueLookup(104, { id: contentId(104), number: 104, state: "OPEN" })],

  // e1 holds Legacy ID e1 but sits on a status option no adev status maps.
  inScopeUndecodable: [...target([onBoard.e1({ status: "Weird" })])],

  // Every item is created, then the board re-read before the link replay is rate limited.
  replayReadRateLimited: laterBoardReads(FRESH, [RATE_LIMITED]),

  // Every in-scope item, the closed one included, already migrated and linked.
  closedAllPresent: [...target([onBoard.e1(), onBoard.f1({ parent: { number: 101 }, blockedBy: [{ number: 103 }] }), onBoard.t(), onBoard.closed()])],

  unanchoredClosed: [...target([onBoard.e1()]), issueLookup(102, { id: contentId(102), number: 102, state: "CLOSED" })],
  unanchoredGone: [...target([onBoard.e1()]), issueLookup(102, null)],

  foreignLegacyId: [...target([onBoard.e1(), foreign(201, "issue-zzzz99")])],
  manyForeignLegacyIds: [...target([onBoard.e1(), ...MANY_FOREIGN.map((id, i) => foreign(201 + i, id))])],
  unsafeForeignLegacyId: [...target([onBoard.e1(), foreign(201, UNSAFE_FOREIGN)])],
  duplicateLegacyId: [...target([onBoard.e1(), onBoard.e1({ number: 105 })])],

  // issue-c0ffee is closed on the source, so out of scope without --include-closed, but still a source ID.
  outOfScopeLegacyId: [...target([onBoard.closed()], [onBoard.closed(), ...ALL()]), ...create(CREATES.e1), ...create(CREATES.f1), ...create(CREATES.t), PARENT_LINK, DEP_LINK],

  // gh-150 was made directly on GitHub: no Legacy ID.
  emptyLegacyId: [
    ...target([{ number: 150, title: "adev-fixture: made on GitHub" }], [{ number: 150, title: "adev-fixture: made on GitHub" }, ...ALL()]),
    ...create(CREATES.e1), ...create(CREATES.f1), ...create(CREATES.t), PARENT_LINK, DEP_LINK,
  ],

  allPresent: [...target([onBoard.e1(), onBoard.f1({ parent: { number: 101 }, blockedBy: [{ number: 103 }] }), onBoard.t()])],

  // Every item and link present, but e1.f1 stopped before its type label: one write is left.
  partialAllLinked: [
    ...target([onBoard.e1(), onBoard.f1({ labels: [], parent: { number: 101 }, blockedBy: [{ number: 103 }] }), onBoard.t()]),
    addLabels(102, ["type:feature"]),
    readBack(onBoard.f1({ parent: { number: 101 }, blockedBy: [{ number: 103 }] })),
  ],

  dependencyMissing: [...target([onBoard.e1(), onBoard.f1({ parent: { number: 101 } }), onBoard.t()]), DEP_LINK],

  replayFails: [
    ...target([], ALL()),
    ...create(CREATES.e1), ...create(CREATES.f1), ...create(CREATES.t),
    { query: PARENT_LINK.query, variables: PARENT_LINK.variables, response: rejected("addSubIssue", "adev-fixture: sub-issue could not be added") },
    DEP_LINK,
  ],

  includeClosed: [
    ...target([], [...ALL(), onBoard.closed({ state: "OPEN", status: "Backlog" })]),
    ...create(CREATES.e1), ...create(CREATES.f1), ...create(CREATES.t), ...create(CREATES.closed),
    PARENT_LINK, DEP_LINK,
  ],

  secretInError: [...target([], []), ...create(CREATES.e1, { failAt: "CreateIssue", failError: { code: null, stderr: SECRET_STDERR } })],

  authRequired: preflightFixture.authRequired,

  // Passes the preflight (which does not require Legacy ID) but not the setup --check gate.
  legacyFieldMissing: [...target([], [], { preflight: PREFLIGHT_WITHOUT_LEGACY })],
});

