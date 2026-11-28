/**
 * Synchronous validation and normalization of `manifest.tasks.github`.
 *
 * Pure: no I/O and no network, so a malformed config fails at adapter
 * construction before any `gh` process is spawned.
 *
 * @module lib/issues/github/config
 */

import { GITHUB_ERROR_CODES, githubError } from "./errors.mjs";

const PROJECT_URL = /^https:\/\/github\.com\/(orgs|users)\/[^/\s]+\/projects\/[1-9][0-9]*$/;
const REPO = /^[^/\s]+\/[^/\s]+$/;

const STATUSES = ["open", "in_progress", "deferred", "closed"];
const TYPE_SOURCES = ["auto", "issue_types", "labels"];

const DEFAULT_STATUS_MAP = {
  open: ["Backlog", "Ready"],
  in_progress: ["In Progress", "In Review"],
  deferred: ["Deferred"],
  closed: ["Done"],
};

const DEFAULT_FIELD_NAMES = {
  owner: "Owner",
  claimed_at: "Claimed At",
  next_action: "Next Action",
  spec_ref: "Spec",
  planRef: "Plan",
  branch: "Branch",
  pr: "PR",
  legacy_id: "Legacy ID",
};

// BEH-2 declares these the complete `tasks.github` key set, so a misspelled key fails loudly instead of silently taking a default.
const CONFIG_KEYS = ["project", "repo", "status_field", "status_map", "priority_field", "type_source", "fields", "claim_settle_ms"];

const DEFAULT_CLAIM_SETTLE_MS = 1500;
const MAX_CLAIM_SETTLE_MS = 10000;

function invalid(key, problem) {
  return githubError(GITHUB_ERROR_CODES.GITHUB_INVALID_CONFIG, `Invalid tasks.github.${key}: ${problem}`, { key });
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function normalizeStatusMap(raw) {
  if (raw === undefined) return Object.fromEntries(STATUSES.map((s) => [s, [...DEFAULT_STATUS_MAP[s]]]));
  if (!isPlainObject(raw)) throw invalid("status_map", "must be a mapping of adev status to option name(s)");
  for (const status of Object.keys(raw)) {
    if (!STATUSES.includes(status)) throw invalid("status_map", `unknown adev status "${status}"; expected one of ${STATUSES.join(", ")}`);
  }
  const map = {};
  const seen = new Map();
  for (const status of STATUSES) {
    if (!(status in raw)) throw invalid("status_map", `must cover every adev status (${STATUSES.join(", ")}); missing "${status}"`);
    const value = raw[status];
    const options = typeof value === "string" ? [value] : value;
    if (!Array.isArray(options) || options.length === 0 || !options.every(isNonEmptyString)) {
      throw invalid("status_map", `"${status}" must be a non-empty string or a non-empty list of non-empty strings`);
    }
    for (const option of options) {
      const prior = seen.get(option);
      if (prior !== undefined && prior !== status) {
        throw invalid("status_map", `option "${option}" is listed under both "${prior}" and "${status}"`);
      }
      seen.set(option, status);
    }
    map[status] = [...options];
  }
  return map;
}

function normalizeFieldNames(raw) {
  if (raw === undefined) return { ...DEFAULT_FIELD_NAMES };
  if (!isPlainObject(raw)) throw invalid("fields", "must be a mapping of adev field to project field name");
  const names = { ...DEFAULT_FIELD_NAMES };
  for (const [field, name] of Object.entries(raw)) {
    if (!Object.hasOwn(DEFAULT_FIELD_NAMES, field)) {
      throw invalid("fields", `unknown adev field "${field}"; expected one of ${Object.keys(DEFAULT_FIELD_NAMES).join(", ")}`);
    }
    if (!isNonEmptyString(name)) throw invalid("fields", `"${field}" must be a non-empty string`);
    names[field] = name;
  }
  // Collisions are checked on effective names, so an override that reuses another field's default also collides.
  const owners = new Map();
  for (const [field, name] of Object.entries(names)) {
    const prior = owners.get(name);
    if (prior !== undefined) throw invalid("fields", `"${prior}" and "${field}" both map to project field "${name}"`);
    owners.set(name, field);
  }
  return names;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Validate `tasks.github` and return a deep-frozen config with defaults applied.
 *
 * @param {unknown} raw - the `tasks.github` object from the manifest
 * @returns {Readonly<{
 *   project: string, repo: string, status_field: string, priority_field?: string,
 *   status_map: Record<string, string[]>, status_map_write: Record<string, string>,
 *   type_source: "auto"|"issue_types"|"labels", fieldNames: Record<string, string>,
 *   claim_settle_ms: number,
 * }>}
 * @throws {Error & { code: "GITHUB_INVALID_CONFIG", key: string }}
 */
export function normalizeGithubConfig(raw) {
  if (!isPlainObject(raw)) {
    throw githubError(GITHUB_ERROR_CODES.GITHUB_INVALID_CONFIG, "Invalid tasks.github: must be a mapping", { key: "tasks.github" });
  }

  for (const key of Object.keys(raw)) {
    if (!CONFIG_KEYS.includes(key)) throw invalid(key, `unknown key; expected one of ${CONFIG_KEYS.join(", ")}`);
  }

  const { project, repo } = raw;
  if (typeof project !== "string" || !PROJECT_URL.test(project)) {
    throw invalid("project", "must be https://github.com/orgs/<org>/projects/<n> or https://github.com/users/<user>/projects/<n>");
  }
  if (typeof repo !== "string" || !REPO.test(repo)) throw invalid("repo", "must be <owner>/<repo>");

  const statusField = raw.status_field === undefined ? "Status" : raw.status_field;
  if (!isNonEmptyString(statusField)) throw invalid("status_field", "must be a non-empty string");

  if (raw.priority_field !== undefined && !isNonEmptyString(raw.priority_field)) {
    throw invalid("priority_field", "must be a non-empty string");
  }

  const typeSource = raw.type_source === undefined ? "auto" : raw.type_source;
  if (!TYPE_SOURCES.includes(typeSource)) throw invalid("type_source", `must be one of ${TYPE_SOURCES.join(", ")}`);

  const claimSettleMs = raw.claim_settle_ms === undefined ? DEFAULT_CLAIM_SETTLE_MS : raw.claim_settle_ms;
  if (!Number.isInteger(claimSettleMs) || claimSettleMs < 0 || claimSettleMs > MAX_CLAIM_SETTLE_MS) {
    throw invalid("claim_settle_ms", `must be an integer from 0 to ${MAX_CLAIM_SETTLE_MS}`);
  }

  const statusMap = normalizeStatusMap(raw.status_map);
  const statusMapWrite = Object.fromEntries(STATUSES.map((s) => [s, statusMap[s][0]]));

  const config = {
    project,
    repo,
    status_field: statusField,
    status_map: statusMap,
    status_map_write: statusMapWrite,
    type_source: typeSource,
    fieldNames: normalizeFieldNames(raw.fields),
    claim_settle_ms: claimSettleMs,
  };
  if (raw.priority_field !== undefined) config.priority_field = raw.priority_field;
  return deepFreeze(config);
}
