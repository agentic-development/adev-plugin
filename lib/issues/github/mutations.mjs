/**
 * GraphQL mutation documents sent by the GitHub board backend's write path.
 *
 * Every document is a named operation and every caller-supplied value travels
 * as a variable, never interpolated into the text. No document reads or writes
 * assignees. ADD_LABELS and REMOVE_LABELS take label ids only; the adapter
 * passes ids of its own label families (type:, priority:, epic, module:) alone.
 *
 * @module lib/issues/github/mutations
 */

export const CREATE_ISSUE = `mutation CreateIssue($repositoryId: ID!, $title: String!, $body: String!) {
  createIssue(input: { repositoryId: $repositoryId, title: $title, body: $body }) {
    issue { id number }
  }
}
`;

export const ADD_TO_PROJECT = `mutation AddToProject($projectId: ID!, $contentId: ID!) {
  addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
    item { id }
  }
}
`;

export const ADD_SUB_ISSUE = `mutation AddSubIssue($issueId: ID!, $subIssueId: ID!) {
  addSubIssue(input: { issueId: $issueId, subIssueId: $subIssueId }) { clientMutationId }
}
`;

export const ADD_BLOCKED_BY = `mutation AddBlockedBy($issueId: ID!, $blockingIssueId: ID!) {
  addBlockedBy(input: { issueId: $issueId, blockingIssueId: $blockingIssueId }) { clientMutationId }
}
`;

export const ADD_LABELS = `mutation AddLabels($labelableId: ID!, $labelIds: [ID!]!) {
  addLabelsToLabelable(input: { labelableId: $labelableId, labelIds: $labelIds }) { clientMutationId }
}
`;

export const SET_ISSUE_TYPE = `mutation SetIssueType($issueId: ID!, $issueTypeId: ID!) {
  updateIssueIssueType(input: { issueId: $issueId, issueTypeId: $issueTypeId }) { clientMutationId }
}
`;

export const SET_MILESTONE = `mutation SetMilestone($issueId: ID!, $milestoneId: ID!) {
  updateIssue(input: { id: $issueId, milestoneId: $milestoneId }) { clientMutationId }
}
`;

export const REMOVE_LABELS = `mutation RemoveLabels($labelableId: ID!, $labelIds: [ID!]!) {
  removeLabelsFromLabelable(input: { labelableId: $labelableId, labelIds: $labelIds }) { clientMutationId }
}
`;

// Title and body are nullable variables: one omitted from the request is absent from
// the input, so GitHub leaves that value as it is.
export const UPDATE_ISSUE = `mutation UpdateIssue($issueId: ID!, $title: String, $body: String) {
  updateIssue(input: { id: $issueId, title: $title, body: $body }) { clientMutationId }
}
`;

// The state reason is fixed in the document: adev closes an issue only as completed.
export const CLOSE_ISSUE = `mutation CloseIssue($issueId: ID!) {
  closeIssue(input: { issueId: $issueId, stateReason: COMPLETED }) { clientMutationId }
}
`;

export const ADD_COMMENT = `mutation AddComment($subjectId: ID!, $body: String!) {
  addComment(input: { subjectId: $subjectId, body: $body }) { clientMutationId }
}
`;

export const CLEAR_FIELD = `mutation ClearField($projectId: ID!, $itemId: ID!, $fieldId: ID!) {
  clearProjectV2ItemFieldValue(input: { projectId: $projectId, itemId: $itemId, fieldId: $fieldId }) { clientMutationId }
}
`;

// Per slot kind: the GraphQL type of `$f<i>Value` and the ProjectV2FieldValue key it fills.
// A `clear` slot has neither: it clears `$f<i>Field` and declares no value variable.
// A null-prototype map, so an inherited name such as "toString" is not a kind.
const SLOT_KINDS = Object.freeze(Object.assign(Object.create(null), {
  single_select: Object.freeze({ type: "String!", key: "singleSelectOptionId" }),
  text: Object.freeze({ type: "String!", key: "text" }),
  number: Object.freeze({ type: "Float!", key: "number" }),
  clear: Object.freeze({}),
}));

// Upper bound on aliased slots per request; it must stay at or above the fields one item write
// can carry (status, priority and the text fields), so it bounds input rather than shaping it.
const MAX_SLOTS = 10;

const documents = new Map();

/**
 * The aliased `SetFields` document writing one Project field value per slot:
 * alias `f<i>` sets field `$f<i>Field` to `$f<i>Value` on `$itemId`, or, for a
 * `clear` slot, clears `$f<i>Field` (variables `f<i>Field` only).
 *
 * The document space is closed: the text is a function of the kind tuple
 * alone, each kind drawn from a fixed four-value enum and at most MAX_SLOTS
 * long, so no field id, option id or value can ever reach a document. Each
 * tuple's document is built once and the same string is returned thereafter.
 *
 * @param {Array<"single_select"|"text"|"number"|"clear">} kinds - one per slot, in slot order
 * @returns {string}
 * @throws {TypeError} for a non-array, an empty or over-long list, or any kind outside the enum
 */
export function setFieldsDocument(kinds) {
  if (!Array.isArray(kinds) || kinds.length === 0) throw new TypeError("setFieldsDocument: at least one slot kind is required");
  if (kinds.length > MAX_SLOTS) throw new TypeError(`setFieldsDocument: at most ${MAX_SLOTS} slots are allowed`);
  for (const kind of kinds) {
    if (typeof kind !== "string" || !Object.hasOwn(SLOT_KINDS, kind)) {
      throw new TypeError(`setFieldsDocument: unknown slot kind ${typeof kind === "string" ? JSON.stringify(kind) : typeof kind}`);
    }
  }
  const key = kinds.join(",");
  let document = documents.get(key);
  if (document === undefined) {
    const declarations = ["$projectId: ID!", "$itemId: ID!"];
    const writes = [];
    kinds.forEach((kind, i) => {
      if (kind === "clear") {
        declarations.push(`$f${i}Field: ID!`);
        writes.push(`  f${i}: clearProjectV2ItemFieldValue(input: { projectId: $projectId, itemId: $itemId, fieldId: $f${i}Field }) { clientMutationId }`);
        return;
      }
      const slot = SLOT_KINDS[kind];
      declarations.push(`$f${i}Field: ID!`, `$f${i}Value: ${slot.type}`);
      writes.push(`  f${i}: updateProjectV2ItemFieldValue(input: { projectId: $projectId, itemId: $itemId, fieldId: $f${i}Field, value: { ${slot.key}: $f${i}Value } }) { clientMutationId }`);
    });
    document = `mutation SetFields(${declarations.join(", ")}) {\n${writes.join("\n")}\n}\n`;
    documents.set(key, document);
  }
  return document;
}

/** One text field write: variables `{ projectId, itemId, f0Field, f0Value }`. */
export const SET_TEXT_FIELD = setFieldsDocument(["text"]);

/** One single-select field write: variables `{ projectId, itemId, f0Field, f0Value }` (an option id). */
export const SET_SINGLE_SELECT = setFieldsDocument(["single_select"]);
