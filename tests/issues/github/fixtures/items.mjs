/**
 * Hand-written unit fixture: one Projects v2 item node in the shape the board
 * read query requests. Not recorded.
 *
 * Node shape (the contract the items query must reproduce):
 *   { id, type: "ISSUE",
 *     fieldValues: { nodes: [
 *       { __typename: "ProjectV2ItemFieldTextValue", text, field: { name } }
 *       { __typename: "ProjectV2ItemFieldSingleSelectValue", name, field: { name } }
 *       { __typename: "ProjectV2ItemFieldNumberValue", number, field: { name } } ] },
 *     content: { __typename: "Issue", id, number, title, body, state, url,
 *       createdAt, updatedAt, repository: { name, owner: { login } },
 *       issueType: { name } | null, labels: { nodes: [{ name }] },
 *       milestone: { title } | null,
 *       parent: { number, repository: { name, owner: { login } } } | null,
 *       blockedBy: { nodes: [{ number, repository: { name, owner: { login } } }] } } }
 */

// Default project field names for the adev text fields (config.fieldNames defaults).
const TEXT_FIELD_NAMES = Object.freeze({
  owner: "Owner",
  claimed_at: "Claimed At",
  next_action: "Next Action",
  spec_ref: "Spec",
  planRef: "Plan",
  branch: "Branch",
  pr: "PR",
  legacy_id: "Legacy ID",
});

const HOME = Object.freeze({ owner: "acme", name: "board" });

function repository({ owner, name } = HOME) {
  return { name, owner: { login: owner } };
}

function issueRef({ number, owner = HOME.owner, name = HOME.name }) {
  return { number, repository: repository({ owner, name }) };
}

function textValue(fieldName, text) {
  return { __typename: "ProjectV2ItemFieldTextValue", text, field: { name: fieldName } };
}

function selectValue(fieldName, name) {
  return { __typename: "ProjectV2ItemFieldSingleSelectValue", name, field: { name: fieldName } };
}

function numberValue(fieldName, number) {
  return { __typename: "ProjectV2ItemFieldNumberValue", number, field: { name: fieldName } };
}

/**
 * Build one project-item node.
 *
 * @param {object} [o]
 * @param {number} [o.number=12]
 * @param {{ owner: string, name: string }} [o.repository] - defaults to the home repo acme/board
 * @param {string} [o.title]
 * @param {string} [o.body]
 * @param {"OPEN"|"CLOSED"} [o.state="OPEN"]
 * @param {string|null} [o.status="Backlog"] - option on the `statusField` single-select; null omits it
 * @param {string} [o.statusField="Status"]
 * @param {object} [o.fields] - adev-keyed values. Text fields go to their default project field
 *   name; `type` becomes the issue type name; `priority` becomes the `Priority` single-select
 *   option (`P<n>` for a number, verbatim for a string); `milestone` becomes the milestone title.
 * @param {Record<string, string|{option: string}|{number: number}>} [o.projectFields] - raw values
 *   keyed by project field name: a string is a text value, `{option}` a single-select, `{number}` a number.
 * @param {string[]} [o.labels]
 * @param {string|null} [o.issueType]
 * @param {string|null} [o.milestone]
 * @param {{ number: number, owner?: string, name?: string }|null} [o.parent]
 * @param {Array<{ number: number, owner?: string, name?: string }>} [o.blockedBy]
 */
export function rawItem(o = {}) {
  const number = o.number ?? 12;
  const fields = { ...(o.fields ?? {}) };
  let issueType = o.issueType ?? null;
  let milestone = o.milestone ?? null;
  const values = [];

  if (o.status !== null) values.push(selectValue(o.statusField ?? "Status", o.status ?? "Backlog"));

  for (const [field, value] of Object.entries(fields)) {
    if (field === "type") issueType = value;
    else if (field === "milestone") milestone = value;
    else if (field === "priority") values.push(selectValue("Priority", typeof value === "number" ? `P${value}` : value));
    else if (Object.hasOwn(TEXT_FIELD_NAMES, field)) values.push(textValue(TEXT_FIELD_NAMES[field], value));
    else throw new Error(`rawItem: unknown adev field ${field}`);
  }

  for (const [name, value] of Object.entries(o.projectFields ?? {})) {
    if (typeof value === "string") values.push(textValue(name, value));
    else if (value && "option" in value) values.push(selectValue(name, value.option));
    else if (value && "number" in value) values.push(numberValue(name, value.number));
    else throw new Error(`rawItem: bad projectFields value for ${name}`);
  }

  const repo = o.repository ?? HOME;
  return {
    id: `PVTI_fixture_${number}`,
    type: "ISSUE",
    fieldValues: { nodes: values },
    content: {
      __typename: "Issue",
      id: `I_fixture_${number}`,
      number,
      title: o.title ?? `adev-fixture: item ${number}`,
      body: o.body ?? "",
      state: o.state ?? "OPEN",
      url: `https://github.com/${repo.owner}/${repo.name}/issues/${number}`,
      createdAt: o.createdAt ?? "2026-11-01T09:00:00Z",
      updatedAt: o.updatedAt ?? "2026-11-02T10:30:00Z",
      repository: repository(repo),
      issueType: issueType === null ? null : { name: issueType },
      labels: { nodes: (o.labels ?? []).map((name) => ({ name })) },
      milestone: milestone === null ? null : { title: milestone },
      parent: o.parent ? issueRef(o.parent) : null,
      blockedBy: { nodes: (o.blockedBy ?? []).map(issueRef) },
    },
  };
}
