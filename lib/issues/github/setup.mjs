/**
 * Verification and planning for `adev issues github setup`.
 *
 * Pure: every function takes the project's field nodes (and, for drift, a
 * `readBoard` result) and returns a report or a plan; no request is sent here.
 * The plan only ever creates whole fields. It never deletes, renames or retypes a
 * field, never touches an existing field's option set, and never writes an item.
 *
 * @module lib/issues/github/setup
 */

import { GITHUB_ERROR_CODES as CODES } from "./errors.mjs";

export const SETUP_CONFIRMATION_REQUIRED = "SETUP_CONFIRMATION_REQUIRED";
export const SETUP_CANCELLED = "SETUP_CANCELLED";

const STATUSES = ["open", "in_progress", "deferred", "closed"];
const DEFAULT_PRIORITY_FIELD = "Priority";

/** The recommended default board: options in creation order, and views that are documented, never created. */
export const RECOMMENDED_BOARD = Object.freeze({
  statusOptions: Object.freeze(["Backlog", "Ready", "In Progress", "In Review", "Deferred", "Done"]),
  priorityOptions: Object.freeze(["P0", "P1", "P2", "P3", "P4"]),
  views: Object.freeze([
    Object.freeze({ name: "Board", layout: "board", description: "grouped by Status, sorted by Priority" }),
    Object.freeze({ name: "Ready queue", layout: "table", description: "filtered to Status Ready, sorted by Priority; shows Owner, Spec, Next Action" }),
    Object.freeze({ name: "Claims", layout: "table", description: "filtered to items with an Owner; shows Owner, Claimed At, Branch, PR" }),
  ]),
});

/**
 * Every field the board needs, by adev key. `legacy_id` is required here although
 * the preflight does not require it: migration gates on it through `setup --check`.
 */
export const REQUIRED_FIELDS = Object.freeze([
  Object.freeze({ key: "status", dataType: "SINGLE_SELECT" }),
  Object.freeze({ key: "priority", dataType: "SINGLE_SELECT" }),
  ...["owner", "claimed_at", "next_action", "spec_ref", "planRef", "branch", "pr", "legacy_id"].map((key) => Object.freeze({ key, dataType: "TEXT" })),
]);

export const TYPE_LABELS = Object.freeze({ SINGLE_SELECT: "single-select", TEXT: "text", NUMBER: "number" });
export const typeLabel = (dataType) => TYPE_LABELS[dataType] ?? String(dataType).toLowerCase();

const BOARD_DRIFT_KINDS = { "sub-issue-off-project": "subissue-not-on-project" };

/**
 * The required fields resolved against the config: project field names, expected
 * types and required options. A configured `priority_field` is a number field,
 * as the preflight requires; the default Priority field is the single-select of
 * the recommended board, and an existing number field of that name also decodes.
 *
 * @param {object} config - from normalizeGithubConfig
 * @returns {Array<{ name: string, dataType: string, accepts: string[], options?: string[] }>}
 */
export function requiredFields(config) {
  return REQUIRED_FIELDS.map(({ key, dataType }) => {
    if (key === "status") {
      const options = STATUSES.flatMap((s) => config.status_map[s]);
      return { name: config.status_field, dataType, accepts: [dataType], options };
    }
    if (key === "priority") {
      if (config.priority_field !== undefined) return { name: config.priority_field, dataType: "NUMBER", accepts: ["NUMBER"] };
      return { name: DEFAULT_PRIORITY_FIELD, dataType, accepts: [dataType, "NUMBER"], options: [...RECOMMENDED_BOARD.priorityOptions] };
    }
    return { name: config.fieldNames[key], dataType, accepts: [dataType] };
  });
}

function checkFields(nodes, config) {
  const byName = new Map((nodes ?? []).filter((n) => n && typeof n.name === "string").map((n) => [n.name, n]));
  return requiredFields(config).map((want) => {
    const actual = byName.get(want.name);
    const report = { name: want.name, type: want.dataType };
    if (!actual) {
      report.status = "missing";
      if (want.options) report.options = want.options.map((name) => ({ name, status: "missing" }));
      return report;
    }
    if (!want.accepts.includes(actual.dataType)) {
      report.status = "wrong type";
      report.actualType = actual.dataType;
      return report;
    }
    report.status = "ok";
    if (want.options && actual.dataType === "SINGLE_SELECT") {
      const present = new Set((actual.options ?? []).map((o) => o?.name));
      report.options = want.options.map((name) => ({ name, status: present.has(name) ? "ok" : "missing" }));
    }
    return report;
  });
}

function driftFrom(board) {
  if (!board) return [];
  const order = new Map(board.entries.map((e, i) => [e.id, i]));
  const drift = board.drift.map((d) => ({ id: d.id, kind: BOARD_DRIFT_KINDS[d.kind] ?? d.kind, value: d.value }));
  for (const entry of board.entries) {
    if (entry.error?.code === CODES.GITHUB_UNMAPPED_STATUS) {
      drift.push({ id: entry.id, kind: "unmapped-status", value: entry.error.option });
    } else if (entry.error?.code === CODES.GITHUB_INVALID_FIELD_VALUE) {
      drift.push({ id: entry.id, kind: "invalid-field-value", value: entry.error.field });
    } else if (entry.issue?.owner && !entry.issue.claimed_at) {
      drift.push({ id: entry.id, kind: "owner-without-claimed-at", value: entry.issue.owner });
    }
  }
  return drift
    .map((d, i) => ({ d, i }))
    .sort((a, b) => (order.get(a.d.id) ?? 0) - (order.get(b.d.id) ?? 0) || a.i - b.i)
    .map(({ d }) => d);
}

/**
 * Verify the project's fields and, given a board read, report drift. Drift never
 * affects `ok`: it is a warning.
 *
 * @param {{ fields: object[], board?: { entries: object[], drift: object[] } }} snapshot -
 *   the preflight's project field nodes and, optionally, a `readBoard` result
 * @param {object} config - from normalizeGithubConfig
 * @returns {{ ok: boolean, fields: Array<{ name: string, type: string, status: "ok"|"missing"|"wrong type",
 *   actualType?: string, options?: Array<{ name: string, status: "ok"|"missing" }> }>,
 *   drift: Array<{ id: string, kind: string, value: string }> }}
 */
export function checkProject(snapshot, config) {
  const fields = checkFields(snapshot.fields, config);
  const ok = fields.every((f) => f.status === "ok" && (f.options ?? []).every((o) => o.status === "ok"));
  return { ok, fields, drift: driftFrom(snapshot.board) };
}

/**
 * The write set for a check: every missing field is created whole, with its
 * options; everything else that is not ok becomes a manual step. Adding an option
 * to an existing single-select field is always a manual step, because GitHub can
 * only do it by replacing the field's whole option set, which can clear the value
 * of every item on a replaced option.
 *
 * @param {ReturnType<typeof checkProject>} check
 * @returns {{ create: Array<{ name: string, dataType: string, options?: string[] }>,
 *   skipped: Array<{ name: string, reason: "wrong type"|"options missing", options?: string[], manual: string }> }}
 */
export function planWrites(check) {
  const create = [];
  const skipped = [];
  for (const field of check.fields) {
    if (field.status === "missing") {
      const entry = { name: field.name, dataType: field.type };
      if (field.options) entry.options = field.options.map((o) => o.name);
      create.push(entry);
    } else if (field.status === "wrong type") {
      skipped.push({
        name: field.name,
        reason: "wrong type",
        manual: `Field "${field.name}" is a ${typeLabel(field.actualType)} field but adev requires a ${typeLabel(field.type)} field (wrong type). setup never deletes, renames or retypes a field: rename or remove it in the project settings, then rerun setup.`,
      });
    } else {
      const missing = (field.options ?? []).filter((o) => o.status === "missing").map((o) => o.name);
      if (missing.length > 0) {
        skipped.push({
          name: field.name,
          reason: "options missing",
          options: missing,
          manual: `Add the option(s) ${missing.join(", ")} to the "${field.name}" field in the project settings. setup does not add them: GitHub replaces a field's whole option set to add one, which can clear item values.`,
        });
      }
    }
  }
  return { create, skipped };
}
