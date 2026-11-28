/**
 * Decoding of one Projects v2 item node into an adev `Issue`.
 *
 * Every field is read from maintainer-controlled storage only (Project fields,
 * labels, issue type, milestone, sub-issue and blocked-by links); the issue
 * title and body feed `title` / `notes` and nothing else, so text an outside
 * contributor writes into a body can never set a decoded field. Each decoded
 * value is checked by its predicate and either returned unchanged or refused
 * with `GITHUB_INVALID_FIELD_VALUE` — never trimmed, escaped, or repaired.
 *
 * Labels and issue types are triage-writable, Project fields need project
 * write access; neither is trusted beyond its predicate. A reserved safety tag
 * counts only when its `module:` label is present, so removing one can only
 * make an item less eligible (eligibility is fail-closed on absence).
 *
 * @module lib/issues/github/decode
 */

import { encodeGithubId, parseId } from "../id-utils.mjs";
import { RESERVED_SAFETY_TAGS } from "../eligibility.mjs";
import { normalizeOwner } from "../interface.mjs";
import { GITHUB_ERROR_CODES as CODES, githubError } from "./errors.mjs";

const DEFAULT_PRIORITY_FIELD = "Priority";
const DEFAULT_PRIORITY = 2;
const DEFAULT_TYPE = "task";

const TEXT_FIELDS = ["owner", "claimed_at", "next_action", "spec_ref", "planRef", "branch", "pr", "legacy_id"];

// C0, DEL, C1, and the Unicode line/paragraph separators: anything that can
// break a value out of a single line of frontmatter or terminal output.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

// A leading YAML indicator would change how a frontmatter splice parses the value.
const YAML_LEADING_INDICATOR = /^(?:[-?:](?: |$)|[#&*!|>'"%@`])/;

const ISO_8601 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|([+-])(\d{2}):(\d{2}))$/;

const BRANCH_FORBIDDEN = /[\s~^:?*[\\]|\.\.|@\{|\/\/|^-|^\/|\/$|\.$|\.lock$|\.lock\/|(?:^|\/)\./;

const PR_URL = /^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+\/pull\/[1-9][0-9]*$/;
const PR_NUMBER = /^#?[1-9][0-9]*$/;

const TYPE_SLUG = /^[a-z][a-z0-9-]{0,39}$/;
const PRIORITY_OPTION = /^P([0-4])$/;
const PRIORITY_LABEL = /^priority:(.*)$/s;
const PRIORITY_LABEL_VALUE = /^[0-4]$/;
const MODULE_LABEL = /^module:(.*)$/s;
const TYPE_LABEL = /^type:(.*)$/s;
const EPIC_LABEL = "epic";

const MAX_NEXT_ACTION = 500;
const MAX_MILESTONE = 255;

function isString(value) {
  return typeof value === "string";
}

function isOneLine(value) {
  return isString(value) && !CONTROL_CHARS.test(value);
}

function isIsoTimestamp(value) {
  if (!isString(value)) return false;
  const m = ISO_8601.exec(value);
  if (!m) return false;
  const [, y, mo, d, h, mi, s, sign, oh, om] = m.map((part, i) => (i === 7 ? part : Number(part)));
  if (mo < 1 || mo > 12 || h > 23 || mi > 59 || s > 59) return false;
  if (sign !== undefined && (oh > 23 || om > 59)) return false;
  const day = new Date(Date.UTC(y, mo - 1, d));
  return day.getUTCFullYear() === y && day.getUTCMonth() === mo - 1 && day.getUTCDate() === d;
}

function isRepoRelativePath(value) {
  return isOneLine(value) && value !== "" && !value.startsWith("/") && !value.split("/").includes("..");
}

/**
 * Per-field predicates. Each takes a decoded value and returns `true` when it
 * is acceptable exactly as given. Callers on the write path apply the same
 * predicates before sending a value.
 */
export const FIELD_PREDICATES = Object.freeze({
  owner(value) {
    if (!isOneLine(value)) return false;
    try {
      return normalizeOwner(value) === value;
    } catch {
      return false;
    }
  },
  claimed_at: isIsoTimestamp,
  next_action(value) {
    return isOneLine(value) && value.length <= MAX_NEXT_ACTION && !YAML_LEADING_INDICATOR.test(value);
  },
  spec_ref: isRepoRelativePath,
  planRef: isRepoRelativePath,
  branch(value) {
    return isString(value) && value !== "" && value !== "@" && !CONTROL_CHARS.test(value) && !BRANCH_FORBIDDEN.test(value);
  },
  pr(value) {
    if (typeof value === "number") return Number.isSafeInteger(value) && value > 0;
    return isString(value) && (PR_NUMBER.test(value) || PR_URL.test(value));
  },
  legacy_id(value) {
    if (!isString(value)) return false;
    const parsed = parseId(value);
    return parsed !== null && parsed.github !== true;
  },
  type(value) {
    return isString(value) && TYPE_SLUG.test(value);
  },
  priority(value) {
    return Number.isInteger(value) && value >= 0 && value <= 4;
  },
  milestone(value) {
    return isOneLine(value) && value !== "" && value.length <= MAX_MILESTONE;
  },
  affected_modules(value) {
    return Array.isArray(value) && new Set(value).size === value.length
      && value.every((slug) => isString(slug) && slug !== "" && !/\s/.test(slug) && !CONTROL_CHARS.test(slug));
  },
});

function invalidField(id, field) {
  return githubError(CODES.GITHUB_INVALID_FIELD_VALUE, `GitHub item ${id} has an invalid ${field} value; fix it on the board (it is never repaired on read).`, { id, field });
}

function accept(id, field, value) {
  if (!FIELD_PREDICATES[field](value)) throw invalidField(id, field);
  return value;
}

/**
 * Map an issue's state and status option to an adev status. Issue state wins
 * in both directions: a closed issue is `closed` whatever its option, and an
 * option mapped to `closed` on an open issue reads as `open` and is reported
 * as drift.
 *
 * @param {"OPEN"|"CLOSED"} issueState
 * @param {string|null|undefined} option - the `status_field` single-select option name
 * @param {{ status_map: Record<string, string[]> }} config - normalized `tasks.github`
 * @returns {{ status: string } | { status: "open", drift: "closed-mapped-open" }}
 * @throws {Error & { code: "GITHUB_UNMAPPED_STATUS", option: string }}
 */
export function decodeStatus(issueState, option, config) {
  if (issueState === "CLOSED") return { status: "closed" };
  if (issueState !== "OPEN") {
    throw githubError(CODES.GITHUB_INVALID_FIELD_VALUE, "GitHub issue state is neither OPEN nor CLOSED.", { field: "status" });
  }
  if (option === null || option === undefined) return { status: "open" };
  for (const [status, options] of Object.entries(config.status_map)) {
    if (!options.includes(option)) continue;
    if (status === "closed") return { status: "open", drift: "closed-mapped-open" };
    return { status };
  }
  throw githubError(CODES.GITHUB_UNMAPPED_STATUS, `Status option ${JSON.stringify(option)} is not listed in tasks.github.status_map; add it there or move the item to a mapped option.`, { option });
}

function fieldValuesByName(rawItem) {
  const byName = new Map();
  for (const node of rawItem?.fieldValues?.nodes ?? []) {
    const name = node?.field?.name;
    if (isString(name) && !byName.has(name)) byName.set(name, node);
  }
  return byName;
}

function labelNames(content) {
  return (content?.labels?.nodes ?? []).map((l) => l?.name).filter(isString);
}

function refId(ref, home) {
  return encodeGithubId({ owner: ref?.repository?.owner?.login, repo: ref?.repository?.name, number: ref?.number }, home);
}

function decodePriority(id, byName, labels, config) {
  const node = byName.get(config.priority_field ?? DEFAULT_PRIORITY_FIELD);
  if (node) {
    if (node.__typename === "ProjectV2ItemFieldSingleSelectValue") {
      const m = isString(node.name) ? PRIORITY_OPTION.exec(node.name) : null;
      if (!m) throw invalidField(id, "priority");
      return accept(id, "priority", Number(m[1]));
    }
    if (node.__typename === "ProjectV2ItemFieldNumberValue") return accept(id, "priority", node.number);
    throw invalidField(id, "priority");
  }
  // `priority:` labels are a fallback read only when the field is empty, so a stale label never blocks an item whose field is set.
  const fromLabels = new Set();
  for (const label of labels) {
    const m = PRIORITY_LABEL.exec(label);
    if (!m) continue;
    if (!PRIORITY_LABEL_VALUE.test(m[1])) throw invalidField(id, "priority");
    fromLabels.add(Number(m[1]));
  }
  if (fromLabels.size > 1) throw invalidField(id, "priority");
  if (fromLabels.size === 1) return [...fromLabels][0];
  return DEFAULT_PRIORITY;
}

const TYPE_MODES = ["issue_types", "labels"];

/**
 * The typing mode for one owner. A fixed `type_source` decides it; `auto` is
 * resolved by the caller once per owner (issue types when the owner has them,
 * else labels), never guessed per item, so an item without an issue type on a
 * typed owner cannot have its type or Epic membership set by a label.
 */
function resolveTypeMode(config, typeMode) {
  if (config.type_source !== "auto") return config.type_source;
  if (TYPE_MODES.includes(typeMode)) return typeMode;
  throw new TypeError(`decodeItem: tasks.github.type_source is "auto" but ctx.typeMode is ${JSON.stringify(typeMode)}; resolve it per owner to one of ${TYPE_MODES.join(", ")} before decoding.`);
}

function decodeType(id, content, labels, mode) {
  const fromLabels = () => {
    const names = new Set();
    let epic = false;
    for (const label of labels) {
      const m = TYPE_LABEL.exec(label);
      if (m) names.add(accept(id, "type", m[1].toLowerCase()));
      else if (label === EPIC_LABEL) epic = true;
    }
    if (names.size > 1) throw invalidField(id, "type");
    // Epic membership is carried as type "epic" (as an `Epic` issue type is), so the `epic` label outranks any one `type:` label.
    if (epic) return "epic";
    return names.size === 1 ? [...names][0] : undefined;
  };
  const issueType = content?.issueType?.name;
  const fromIssueType = () => (isString(issueType) ? accept(id, "type", issueType.toLowerCase()) : undefined);

  if (mode === "labels") return fromLabels() ?? DEFAULT_TYPE;
  return fromIssueType() ?? DEFAULT_TYPE;
}

function decodeModules(labels, moduleSlugs) {
  const modules = [];
  const drift = [];
  for (const label of labels) {
    const m = MODULE_LABEL.exec(label);
    if (!m) continue;
    const slug = m[1];
    if (moduleSlugs.has(slug) || RESERVED_SAFETY_TAGS.includes(slug)) {
      if (!modules.includes(slug)) modules.push(slug);
    } else {
      drift.push({ kind: "unknown-module-label", value: slug });
    }
  }
  return { modules, drift };
}

/**
 * Decode one project-item node (an Issue on the project) into an adev Issue.
 *
 * @param {object} rawItem - a ProjectV2Item node as requested by the items query
 * @param {{
 *   config: object,
 *   home: { owner: string, repo: string },
 *   moduleSlugs: Iterable<string>,
 *   typeMode?: "issue_types"|"labels",
 * }} ctx - normalized `tasks.github` config, home repo, manifest `modules[].slug`s,
 *   and `typeMode`: the typing mode resolved once for the item's owner. Required
 *   when `config.type_source` is `"auto"` (`"issue_types"` when the owner has
 *   issue types, else `"labels"`); ignored when `type_source` fixes the mode.
 *   Only under `"labels"` do `type:` and `epic` labels decide the type.
 * @returns {{ issue: object, drift: Array<{ kind: string, value: string }> }}
 * @throws {Error & { code: "GITHUB_INVALID_FIELD_VALUE"|"GITHUB_UNMAPPED_STATUS", id: string }}
 * @throws {TypeError} when `type_source` is `"auto"` and `ctx.typeMode` is not a resolved mode
 */
export function decodeItem(rawItem, ctx) {
  const { config, home } = ctx;
  const typeMode = resolveTypeMode(config, ctx.typeMode);
  const moduleSlugs = new Set(ctx.moduleSlugs ?? []);
  const content = rawItem?.content;
  const id = refId(content, home);
  const byName = fieldValuesByName(rawItem);
  const labels = labelNames(content);
  const drift = [];

  const statusNode = byName.get(config.status_field);
  const option = statusNode?.__typename === "ProjectV2ItemFieldSingleSelectValue" ? statusNode.name : null;
  if (statusNode && option === null) throw invalidField(id, "status");
  let status;
  try {
    status = decodeStatus(content?.state, option, config);
  } catch (err) {
    if (err?.code === CODES.GITHUB_UNMAPPED_STATUS) {
      throw githubError(CODES.GITHUB_UNMAPPED_STATUS, `GitHub item ${id}: ${err.message}`, { id, option });
    }
    if (err?.code === CODES.GITHUB_INVALID_FIELD_VALUE) throw invalidField(id, "status");
    throw err;
  }
  if (status.drift) drift.push({ kind: status.drift, value: option });

  const issue = {
    id,
    title: content?.title,
    notes: content?.body,
    status: status.status,
    priority: decodePriority(id, byName, labels, config),
    type: decodeType(id, content, labels, typeMode),
    parent_id: content?.parent ? refId(content.parent, home) : null,
    dependencies: (content?.blockedBy?.nodes ?? []).map((ref) => refId(ref, home)),
  };

  for (const field of TEXT_FIELDS) {
    const node = byName.get(config.fieldNames[field]);
    if (!node) continue;
    if (node.__typename !== "ProjectV2ItemFieldTextValue") throw invalidField(id, field);
    issue[field] = accept(id, field, node.text);
  }

  const { modules, drift: moduleDrift } = decodeModules(labels, moduleSlugs);
  issue.affected_modules = accept(id, "affected_modules", modules);
  drift.push(...moduleDrift);

  const milestone = content?.milestone?.title;
  if (milestone !== undefined && milestone !== null) issue.milestone = accept(id, "milestone", milestone);

  issue.created = content?.createdAt;
  issue.updated = content?.updatedAt;

  return { issue, drift };
}
