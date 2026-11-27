/**
 * The github target of `adev issues migrate`: the read-only pre-write checks,
 * then an ordered sequential copy that writes `Legacy ID`, then replay of
 * sub-issue parents and dependencies once every item exists.
 *
 * Every string this module prints reaches stdout or stderr through
 * createGithubOutput(), which redacts it first.
 *
 * @module lib/issues/github/migrate
 */

import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, dirname, join, relative, isAbsolute, sep } from "node:path";
import { BeadsAdapter } from "../beads-adapter.mjs";
import { GithubAdapter } from "../github-adapter.mjs";
import { getIssueManager } from "../registry.mjs";
import { parseId } from "../id-utils.mjs";
import { readSentinel, writeSentinel, commitSentinel, sentinelPath } from "../read-only-sentinel.mjs";
import { checkProject, typeLabel } from "./setup.mjs";
import { ISSUE_QUERY } from "./queries.mjs";
import { ADD_SUB_ISSUE, ADD_BLOCKED_BY } from "./mutations.mjs";
import { GITHUB_ERROR_CODES as CODES, redact } from "./errors.mjs";

export const UNANCHORED_REL = join(".context-index", "tasks", ".migrate-unanchored.json");

/** The fixed GitHub spec BEH-35 policy: never read from argv, the environment or the manifest. */
export const MIGRATION_PACE = Object.freeze({ minIntervalMs: 1000, maxSingleWaitMs: 300_000, maxWaits: 5, maxTotalWaitMs: 900_000 });

const ECHO_LIMIT = 80;
const FOREIGN_ECHO_LIMIT = 10;
// C0, DEL and C1: none of them may reach a terminal from board-supplied text.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;
const HAS_CONTROL_CHAR = /[\u0000-\u001f\u007f-\u009f]/;
const CANONICAL_HOME_ID = /^gh-([1-9][0-9]*)$/;

// Keys of a source item that the github create carries; everything else (ids,
// timestamps, parent and dependency links) is either assigned by GitHub or replayed.
const ISSUE_KEYS = ["title", "notes", "priority", "type", "next_action", "spec_ref", "planRef", "branch", "pr", "affected_modules", "milestone"];
const EPIC_KEYS = ["title", "notes", "planRef", "milestone"];

/**
 * Cap a board-supplied value at 80 characters and escape every control character
 * as `\uXXXX`, so an echoed value can neither drive a terminal nor flood a line.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function echoValue(value) {
  const s = String(value ?? "");
  const capped = s.length > ECHO_LIMIT ? `${s.slice(0, ECHO_LIMIT)}…` : s;
  return capped.replace(CONTROL_CHARS, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

function redactDeep(value, secrets) {
  if (typeof value === "string") return redact(value, secrets);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, secrets));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDeep(v, secrets)]));
  }
  return value;
}

/**
 * The github path's two output sinks. Values are redacted before the report is
 * serialised: a pattern matched across serialised JSON could swallow its quotes.
 *
 * @param {{ log: (s: string) => void, env?: object }} options
 * @returns {{ stdout: (obj: object) => void, stderr: (line: string) => void }}
 */
export function createGithubOutput({ log, env = process.env }) {
  const secrets = [env?.GH_TOKEN, env?.GITHUB_TOKEN];
  return {
    stdout(obj) {
      log(JSON.stringify(redactDeep(obj, secrets)));
    },
    stderr(line) {
      console.error(redact(line, secrets));
    },
  };
}

class Stop extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const stop = (code, message) => new Stop(code, message);
const isLegacySourceId = (id) => {
  if (typeof id !== "string" || HAS_CONTROL_CHAR.test(id)) return false;
  const parsed = parseId(id);
  return parsed !== null && parsed.github !== true;
};

function pick(item, keys) {
  const out = {};
  for (const key of keys) {
    const value = item[key];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

/** Epics first, then issues, each parent before its children; otherwise board order. */
function copyOrder(epics, issues) {
  const all = [...epics.map((e) => ({ item: e, epic: true })), ...issues.map((i) => ({ item: i, epic: false }))];
  const byId = new Map(all.map((x) => [x.item.id, x]));
  const out = [];
  const placed = new Set();
  const place = (x, seen) => {
    if (placed.has(x.item.id) || seen.has(x.item.id)) return;
    seen.add(x.item.id);
    const parent = byId.get(x.item.parent_id);
    if (parent) place(parent, seen);
    placed.add(x.item.id);
    out.push(x);
  };
  for (const x of all) place(x, new Set());
  return out;
}

function createPayload({ item, epic }) {
  const data = pick(item, epic ? EPIC_KEYS : ISSUE_KEYS);
  if (epic) data.type = "epic";
  data.status = item.status === "closed" ? "open" : (item.status ?? "open");
  data.legacy_id = item.id;
  return data;
}

function containedIn(root, path) {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Read `.migrate-unanchored.json` fail-closed: a symlink or a parent outside the
 * storage root is SENTINEL_PATH_UNSAFE; unreadable content or IDs that are not
 * a non-gh source ID and a canonical home gh ID are MIGRATE_UNANCHORED_ITEM.
 */
function readUnanchored(storageRoot) {
  const path = join(storageRoot, UNANCHORED_REL);
  let st;
  try {
    st = lstatSync(path);
  } catch (err) {
    if (err?.code === "ENOENT" || err?.code === "ENOTDIR") return null;
    throw err;
  }
  if (st.isSymbolicLink()) throw stop("SENTINEL_PATH_UNSAFE", `Refusing the unanchored-issue record at ${path}: the path is a symbolic link. Nothing was written.`);
  if (!containedIn(realpathSync(storageRoot), realpathSync(dirname(path)))) {
    throw stop("SENTINEL_PATH_UNSAFE", `Refusing the unanchored-issue record at ${path}: its directory left the storage root ${storageRoot}. Nothing was written.`);
  }
  const unreadable = () => stop(
    "MIGRATE_UNANCHORED_ITEM",
    `The unanchored-issue record ${path} is unreadable, so adev cannot tell which GitHub issue it protects. ` +
      "Find that issue on GitHub and either set its Legacy ID to the source ID by hand, or close it; then delete the file and re-run. Nothing was written.",
  );
  let doc;
  try {
    doc = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw unreadable();
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) throw unreadable();
  if (!isLegacySourceId(doc.source_id) || typeof doc.target_id !== "string" || !CANONICAL_HOME_ID.test(doc.target_id)) throw unreadable();
  return { path, sourceId: doc.source_id, targetId: doc.target_id, number: Number(CANONICAL_HOME_ID.exec(doc.target_id)[1]) };
}

/**
 * Write the record by atomic temp-rename, with readUnanchored()'s containment.
 * An existing record is never replaced: it protects an issue not yet completed.
 */
function writeUnanchored(storageRoot, record) {
  const path = join(storageRoot, UNANCHORED_REL);
  const dir = dirname(path);
  const root = realpathSync(storageRoot);
  let existing = dir;
  while (!existsSync(existing) && dirname(existing) !== existing) existing = dirname(existing);
  if (!containedIn(root, realpathSync(existing))) {
    throw stop("SENTINEL_PATH_UNSAFE", `Refusing the unanchored-issue record at ${path}: its directory left the storage root ${storageRoot}.`);
  }
  mkdirSync(dir, { recursive: true });
  if (!containedIn(root, realpathSync(dir))) {
    throw stop("SENTINEL_PATH_UNSAFE", `Refusing the unanchored-issue record at ${path}: its directory left the storage root ${storageRoot}.`);
  }
  let st = null;
  try {
    st = lstatSync(path);
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
  }
  if (st?.isSymbolicLink()) throw stop("SENTINEL_PATH_UNSAFE", `Refusing the unanchored-issue record at ${path}: the path is a symbolic link.`);
  if (st) throw stop("MIGRATE_UNANCHORED_ITEM", `Refusing to replace the unanchored-issue record at ${path}: it still protects an issue that is not completed.`);
  const tmp = join(dir, `.${basename(path)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  try {
    writeFileSync(tmp, JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
    renameSync(tmp, path);
  } catch (err) {
    try { unlinkSync(tmp); } catch { /* never created or already renamed */ }
    throw err;
  }
  return path;
}

function removeUnanchored(path) {
  try { unlinkSync(path); } catch (err) { if (err?.code !== "ENOENT") throw err; }
}

function unanchoredRemedy(record) {
  return `Set Legacy ID = ${record.sourceId} on ${record.targetId} by hand, or close ${record.targetId} and delete ${UNANCHORED_REL}; then re-run. Nothing was written.`;
}

/** Verify the recorded issue: an open home-repo issue whose Legacy ID is empty or the source ID. */
function verifyUnanchored(adapter, record, entries) {
  const holder = entries.find((e) => e.id !== record.targetId && e.legacyText === record.sourceId);
  if (holder) {
    throw stop("MIGRATE_UNANCHORED_ITEM", `${record.targetId} is recorded as the unanchored issue for ${record.sourceId}, but ${holder.id} already holds Legacy ID ${record.sourceId}. Keep one of them by hand: close ${record.targetId} and delete ${UNANCHORED_REL}, or clear the Legacy ID on ${holder.id}; then re-run. Nothing was written.`);
  }
  const onBoard = entries.find((e) => e.id === record.targetId);
  if (onBoard) {
    const legacy = onBoard.legacyText ?? "";
    const open = onBoard.issue ? onBoard.issue.status !== "closed" : false;
    if (open && (legacy === "" || legacy === record.sourceId)) return { ...record, entry: onBoard, contentId: onBoard.nodeIds.contentId };
    throw stop("MIGRATE_UNANCHORED_ITEM", `${record.targetId}, recorded as the unanchored issue for ${record.sourceId}, is closed or carries another Legacy ID. ${unanchoredRemedy(record)}`);
  }
  const { owner, repo } = adapter.home;
  const issue = adapter._transport.request(ISSUE_QUERY, { owner, name: repo, number: record.number })?.repository?.issue;
  if (!issue || issue.state !== "OPEN" || typeof issue.id !== "string") {
    const why = issue ? "is closed" : "no longer exists";
    throw stop("MIGRATE_UNANCHORED_ITEM", `${record.targetId}, recorded as the unanchored issue for ${record.sourceId}, ${why}. ${unanchoredRemedy(record)}`);
  }
  return { ...record, entry: null, contentId: issue.id };
}

function checkProvenance(entries, sourceIds, source) {
  const holders = new Map();
  for (const e of entries) {
    const value = e.legacyText ?? "";
    if (value === "") continue;
    if (!holders.has(value)) holders.set(value, []);
    holders.get(value).push(e.id);
  }
  for (const [value, ids] of holders) {
    if (ids.length > 1) {
      throw stop(CODES.GITHUB_AMBIGUOUS_LEGACY_ID, `Legacy ID ${echoValue(value)} is held by more than one item on the target project (${ids.join(", ")}); keep it on one item by hand, then re-run. Nothing was written.`);
    }
  }
  const foreign = [...holders.keys()].filter((v) => !sourceIds.has(v));
  if (foreign.length > 0) {
    const named = foreign.slice(0, FOREIGN_ECHO_LIMIT).map(echoValue).join(", ");
    const more = foreign.length > FOREIGN_ECHO_LIMIT ? `, and ${foreign.length - FOREIGN_ECHO_LIMIT} more` : "";
    throw stop(
      "MIGRATE_TARGET_FOREIGN_LEGACY_ID",
      `The target project holds ${foreign.length} Legacy ID value(s) that are not IDs on this ${source} board: ${named}${more}. ` +
        "adev never merges two boards into one project: each source board must be migrated into its own project. Nothing was written.",
    );
  }
  const byLegacy = new Map();
  for (const [value, [id]] of holders) byLegacy.set(value, entries.find((e) => e.id === id));
  return byLegacy;
}

function checkSentinel(storageRoot, source, project) {
  const doc = readSentinel(storageRoot, source);
  if (doc === null) return false;
  if (!doc.malformed && doc.project === project) return true;
  const recorded = doc.malformed ? "an unreadable sentinel" : `a sentinel for ${doc.project}`;
  throw stop(
    "MIGRATE_SENTINEL_PROJECT_MISMATCH",
    `The ${source} board is already retired: it holds ${recorded}, not one for the target project ${project}. ` +
      "Only removing the sentinel by hand un-retires the board. Nothing was written.",
  );
}

function setupGate(adapter, pre) {
  const check = checkProject({ fields: Object.values(pre.fields) }, adapter.config);
  if (check.ok) return;
  const missing = check.fields
    .filter((f) => f.status !== "ok" || (f.options ?? []).some((o) => o.status !== "ok"))
    .map((f) => `${f.name} (${typeLabel(f.type)}${f.status === "ok" ? ", options missing" : `, ${f.status}`})`);
  throw stop(CODES.GITHUB_FIELD_MISSING, `The target project is not ready for a migration; fix these fields: ${missing.join(", ")}. Run \`adev issues github setup\`, then re-run. Nothing was written.`);
}

const beadsUnavailable = () => stop(
  "BEADS_NOT_AVAILABLE",
  "source backend 'beads' requires the `br` CLI on PATH to read the board. " +
    "Install from https://github.com/Dicklesworthstone/beads_rust then retry. Nothing was written.",
);

// The registry answers an unavailable `br` with a json adapter, which would copy
// tasks.json as if it were the beads board and then retire the real one.
function probeSource(storageRoot, source) {
  if (source !== "beads") return;
  try {
    new BeadsAdapter(storageRoot, { checkBr: true, autoMigrate: false });
  } catch (err) {
    if (err?.code === "BEADS_NOT_AVAILABLE") throw beadsUnavailable();
    throw stop("BEADS_PROBE_FAILED", `failed to probe br: ${err?.message ?? String(err)}`);
  }
}

async function readSourceBoard(projectRoot, manifest, source) {
  const overridden = { ...(manifest ?? {}), tasks: { ...(manifest?.tasks ?? {}), backend: source } };
  let adapter;
  try {
    adapter = getIssueManager(overridden, projectRoot);
  } catch (err) {
    throw stop("MIGRATE_SOURCE_INVALID", `failed to read ${source} source at ${projectRoot}: ${err?.message ?? String(err)}`);
  }
  if (adapter.name !== source) throw beadsUnavailable();
  try {
    return { issues: await adapter.list({}), epics: await adapter.listEpics({}) };
  } catch (err) {
    throw stop("MIGRATE_SOURCE_INVALID", `failed to read ${source} source at ${projectRoot}: ${err?.message ?? String(err)}`);
  }
}

function envelopeEntry(sourceId, err) {
  const entry = { source_id: sourceId, code: err?.code ?? "MIGRATE_WRITE_FAILED", message: err?.message ?? String(err) };
  if (err?.code === CODES.GITHUB_PARTIAL_CREATE) {
    entry.target_id = err.id;
    entry.unwritten_fields = err.unwritten;
  }
  const limited = err?.code === CODES.GITHUB_RATE_LIMITED || (err?.code === CODES.GITHUB_PARTIAL_CREATE && err.causeCode === CODES.GITHUB_RATE_LIMITED);
  if (limited) entry.reset_at = err.resetAt ?? null;
  return entry;
}

const plural = (n, noun) => `${n} ${noun}${n === 1 ? "" : "s"}`;

function writeSetLines({ source, projectName, visibility, repo, toCreate, toFinish, present, links, titles, notes, sentinelRel, sentinelPresent }) {
  let sentinel;
  if (sentinelPresent) {
    sentinel = `${sentinelRel} is present for this project and will be left unchanged` +
      (source === "beads" ? " (committed on beads-board if it is not committed yet)" : "");
  } else if (source === "beads") {
    sentinel = `will create ${sentinelRel}, retiring the beads board, and commit that one file on beads-board (never pushed); ` +
      "--yes covers that commit and the repository's commit hooks";
  } else {
    sentinel = `will create ${sentinelRel}, retiring the ${source} board; commit it on the branch that carries the board`;
  }
  return [
    `write set: adev issues migrate --from ${source} --to github`,
    `  target project: ${projectName}, visibility ${visibility.project}`,
    `  target repository: ${repo}, visibility ${visibility.repo}`,
    `  items: ${plural(toCreate, "item")} to create, ${plural(present, "item")} already migrated`,
    ...(toFinish > 0 ? [`  unanchored: ${plural(toFinish, "item")} to finish, recorded in ${UNANCHORED_REL}`] : []),
    `  links: ${plural(links, "link")} to replay`,
    `  published to GitHub: ${plural(titles, "title")}, ${plural(notes, "note")}`,
    `  sentinel: ${sentinel}`,
  ];
}

function sentinelSummary({ source, sentinelRel, projectName, wrote, commit }) {
  const what = wrote ? `wrote ${sentinelRel} recording ${projectName}` : `${sentinelRel} is pre-existing and records ${projectName}; left unchanged`;
  if (source === "beads") {
    const committed = commit?.committed ? "committed it on beads-board" : "already committed on beads-board";
    return `sentinel: ${what}; ${committed}; push it with the next board sync`;
  }
  return wrote
    ? `sentinel: ${what}; commit it on the branch that carries the board, like tasks.json`
    : `sentinel: ${what}; commit it on the branch that carries the board if it is not committed yet`;
}

/**
 * Run the github migration path. `confirm(writeSet)` decides whether the writes
 * may start: `true` proceeds, `"declined"` is an interactive refusal, anything
 * else a non-interactive run without --yes. `resume` carries the state-file
 * writer and remover; `progress` is `last_successful_index + 1` from a valid
 * state file, or null; `suggestion` is the manifest-update text printed last.
 *
 * @returns {Promise<number>} the verb's exit code
 */
export async function migrateToGithub({ projectRoot, storageRoot, manifest, source, includeClosed, dryRun, resume, progress = null, confirm, out, suggestion, exec, now, sleep }) {
  const counts = { created: { issues: 0, epics: 0 }, skipped: 0, replayed: 0 };
  const idMap = {};
  try {
    probeSource(storageRoot, source);
    let adapter;
    try {
      adapter = new GithubAdapter(storageRoot, manifest, { exec, now, sleep, pace: MIGRATION_PACE });
    } catch (err) {
      throw stop(err?.code ?? CODES.GITHUB_INVALID_CONFIG, err?.message ?? String(err));
    }
    const project = adapter.config.project;

    const pre = adapter._ensure();
    setupGate(adapter, pre);

    const sourceBoard = await readSourceBoard(projectRoot, manifest, source);
    const sourceIds = new Set([...sourceBoard.epics, ...sourceBoard.issues].map((i) => i.id));
    const inScope = (i) => includeClosed || i.status !== "closed";
    const order = copyOrder(sourceBoard.epics.filter(inScope), sourceBoard.issues.filter(inScope));

    const { entries } = adapter._readBoard();

    const recorded = readUnanchored(storageRoot);
    const unanchored = recorded ? verifyUnanchored(adapter, recorded, entries) : null;
    const unanchoredAt = unanchored ? order.findIndex((x) => x.item.id === unanchored.sourceId) : -1;
    if (unanchored && unanchoredAt < 0) {
      throw stop("MIGRATE_UNANCHORED_ITEM", `${unanchored.targetId} is recorded as the unanchored issue for ${unanchored.sourceId}, which is not in this run's scope. Re-run with the scope that created it, or ${unanchoredRemedy(unanchored).replace(/^Set/, "set")}`);
    }

    const byLegacy = checkProvenance(entries, sourceIds, source);
    for (const x of order) {
      const entry = byLegacy.get(x.item.id);
      if (entry?.error) throw stop(entry.error.code, `${entry.error.message} (${entry.id} holds Legacy ID ${x.item.id}; fix it on the board, then re-run. Nothing was written.)`);
    }
    const sentinelPresent = checkSentinel(storageRoot, source, project);

    const present = order.filter((x) => byLegacy.has(x.item.id));
    if (progress !== null) {
      out.stderr(`resuming: ${progress} of ${order.length} already migrated`);
      if (present.length !== progress) {
        out.stderr(`warning: .migrate-state.json records ${progress} of ${order.length} migrated but the target board holds ${present.length}; the target board decides what is skipped`);
      }
    }

    const inOrder = new Set(order.map((x) => x.item.id));
    // The unanchored issue already exists, so its title and notes are already
    // published; the live report still counts it as created, and so does the dry run.
    const toCreate = order.filter((x) => !byLegacy.has(x.item.id) && x.item.id !== unanchored?.sourceId);
    const wouldCreate = order.filter((x) => !byLegacy.has(x.item.id));
    const parentLinks = order.filter((x) => {
      if (!inOrder.has(x.item.parent_id)) return false;
      const child = byLegacy.get(x.item.id);
      const parent = byLegacy.get(x.item.parent_id);
      return !(child && parent && parent.subIssueIds.includes(child.id));
    }).length;
    const dependencyLinks = order.reduce((n, x) => n + (x.item.dependencies ?? []).filter((d) => {
      if (!inOrder.has(d)) return false;
      const child = byLegacy.get(x.item.id);
      const blocker = byLegacy.get(d);
      return !(child && blocker && child.blockedBy.some((b) => b.id === blocker.id));
    }).length, 0);
    const titles = toCreate.length;
    const notes = toCreate.filter((x) => typeof x.item.notes === "string" && x.item.notes !== "").length;
    const secrets = [process.env.GH_TOKEN, process.env.GITHUB_TOKEN];
    const title = echoValue(redact(pre.projectTitle ?? "", secrets));
    const projectName = title === "" ? project : `${title} (${project})`;
    const sentinelFile = sentinelPath(storageRoot, source);
    const sentinelRel = relative(storageRoot, sentinelFile).split(sep).join("/");

    if (dryRun) {
      let planned = parentLinks + dependencyLinks;
      for (const x of order) {
        const entry = byLegacy.get(x.item.id);
        const closed = x.item.status === "closed";
        const offProject = !entry && x.item.id === unanchored?.sourceId;
        const target = entry
          ? { entry, id: entry.id, contentId: entry.nodeIds.contentId }
          : { entry: offProject ? unanchored.entry : null, id: offProject ? unanchored.targetId : "", contentId: offProject ? unanchored.contentId : "" };
        planned += await adapter.completeMigrated(createPayload(x), { ...target, closed, count: true });
        if (!entry && !offProject) planned += 1;
        if (closed && entry?.issue?.status !== "closed") planned += 2;
      }
      const boardPages = Math.max(1, Math.ceil(entries.length / 100));
      out.stdout({
        source,
        target: "github",
        in_scope: { issues: order.filter((x) => !x.epic).length, epics: order.filter((x) => x.epic).length },
        already_migrated: present.length,
        would_create: { issues: wouldCreate.filter((x) => !x.epic).length, epics: wouldCreate.filter((x) => x.epic).length },
        dependencies_to_replay: order.reduce((n, x) => n + (x.item.dependencies ?? []).filter((d) => inOrder.has(d)).length, 0),
        github: {
          project,
          repository: adapter.config.repo,
          visibility: { project: pre.visibility.project, repository: pre.visibility.repo },
          would_create_ids: wouldCreate.map((x) => x.item.id),
          parent_links_to_replay: parentLinks,
          would_publish: { titles, notes },
          estimated_requests: 1 + boardPages + planned,
        },
      });
      return 0;
    }

    const linked = (x) => {
      const entry = byLegacy.get(x.item.id);
      const parent = inOrder.has(x.item.parent_id) ? byLegacy.get(x.item.parent_id) : undefined;
      if (parent && !parent.subIssueIds.includes(entry.id)) return false;
      return (x.item.dependencies ?? []).filter((d) => inOrder.has(d)).every((d) => entry.blockedBy.some((b) => b.id === byLegacy.get(d).id));
    };
    let nothingLeft = unanchored === null && present.length === order.length && order.every(linked);
    for (const x of nothingLeft ? order : []) {
      const entry = byLegacy.get(x.item.id);
      const pending = await adapter.completeMigrated(createPayload(x), { entry, id: entry.id, contentId: entry.nodeIds.contentId, check: true, closed: x.item.status === "closed" });
      const closePending = x.item.status === "closed" && entry.issue?.status !== "closed";
      if (pending.length > 0 || closePending) nothingLeft = false;
    }
    const hasWork = !(nothingLeft && sentinelPresent);
    if (hasWork) {
      const lines = writeSetLines({
        source, projectName, visibility: pre.visibility, repo: adapter.config.repo, toCreate: toCreate.length, toFinish: wouldCreate.length - toCreate.length, present: present.length,
        links: parentLinks + dependencyLinks, titles, notes, sentinelRel, sentinelPresent,
      });
      for (const line of lines) out.stderr(line);
      const answer = await confirm({ items: order.length, present: present.length, sentinelPresent });
      if (answer === "declined") {
        throw stop("MIGRATE_CONFIRMATION_REQUIRED", "The write set was not confirmed: answer y or yes to proceed, or re-run with --yes. Nothing was written.");
      }
      if (answer !== true) {
        throw stop("MIGRATE_CONFIRMATION_REQUIRED", "This run would write to GitHub and retire the source board, and it is not interactive: re-run with --yes to confirm the write set. Nothing was written.");
      }
    }

    let failed = null;
    const copyItem = async (i) => {
      const x = order[i];
      const id = x.item.id;
      const data = createPayload(x);
      const closed = x.item.status === "closed";
      try {
        const entry = byLegacy.get(id);
        let done;
        if (entry) {
          done = await adapter.completeMigrated(data, { entry, id: entry.id, contentId: entry.nodeIds.contentId, closed });
          counts.skipped += 1;
        } else if (i === unanchoredAt) {
          done = await adapter.completeMigrated(data, { entry: unanchored.entry, id: unanchored.targetId, contentId: unanchored.contentId, closed });
          counts.created[x.epic ? "epics" : "issues"] += 1;
        } else {
          done = await adapter.createMigrated(data);
          counts.created[x.epic ? "epics" : "issues"] += 1;
        }
        idMap[id] = done.id;
        if (closed && done.issue.status !== "closed") await adapter.closeMigrated(done.nodeIds);
        if (i === unanchoredAt) removeUnanchored(unanchored.path);
        return true;
      } catch (err) {
        if (err?.code === CODES.GITHUB_PARTIAL_CREATE && (err.unwritten ?? []).includes("legacy_id") && i !== unanchoredAt) {
          try {
            writeUnanchored(storageRoot, { source_id: id, target_id: err.id });
            err.unanchoredNotice = `${err.id} has no Legacy ID yet; ${UNANCHORED_REL} records it as the issue for ${id}: do not delete that file, the next run completes ${err.id} through it`;
          } catch (writeErr) {
            err.unanchoredNotice = `${err.id} has no Legacy ID yet and ${UNANCHORED_REL} could not record it (${writeErr?.code ?? "write failed"}: ${writeErr?.message ?? String(writeErr)}); set Legacy ID = ${id} on ${err.id} by hand before re-running, or the next run creates ${id} again`;
          }
        }
        failed = { id, err };
        return false;
      }
    };

    // An issue left unanchored by an earlier run is completed before anything is
    // created, so a new unanchored window can never meet an uncompleted record.
    if (unanchoredAt >= 0) await copyItem(unanchoredAt);
    for (let i = 0; i < order.length && !failed; i += 1) {
      if (i !== unanchoredAt && !(await copyItem(i))) break;
      try {
        resume.write(i);
      } catch (err) {
        failed = { id: order[i].item.id, err };
      }
    }

    let byId = null;
    if (!failed && order.length > 0) {
      try {
        adapter._invalidateBoard();
        byId = new Map(adapter._readBoard().entries.map((e) => [e.id, e]));
      } catch (err) {
        failed = { id: order[0].item.id, err };
      }
    }
    if (!failed && byId) {
      replay: for (const x of order) {
        const child = byId.get(idMap[x.item.id]);
        const parentId = idMap[x.item.parent_id];
        try {
          if (child && parentId && byId.has(parentId) && !byId.get(parentId).subIssueIds.includes(child.id)) {
            await adapter._mutate("AddSubIssue", ADD_SUB_ISSUE, { issueId: byId.get(parentId).nodeIds.contentId, subIssueId: child.nodeIds.contentId });
            counts.replayed += 1;
          }
          for (const dep of x.item.dependencies ?? []) {
            const blocker = byId.get(idMap[dep]);
            if (!child || !blocker || child.blockedBy.some((b) => b.id === blocker.id)) continue;
            await adapter._mutate("AddBlockedBy", ADD_BLOCKED_BY, { issueId: child.nodeIds.contentId, blockingIssueId: blocker.nodeIds.contentId });
            counts.replayed += 1;
          }
        } catch (err) {
          failed = { id: x.item.id, err };
          break replay;
        }
      }
    }

    const report = {
      source,
      target: "github",
      created: counts.created,
      skipped: counts.skipped,
      dependencies_replayed: counts.replayed,
    };
    if (failed) {
      out.stdout({ ...report, manifest_update_suggested: false, errors: [envelopeEntry(failed.id, failed.err)] });
      const notice = failed.err?.unanchoredNotice ? `; ${failed.err.unanchoredNotice}` : "";
      out.stderr(`MIGRATE_PARTIAL_FAILURE: ${failed.err?.code ?? "MIGRATE_WRITE_FAILED"} at ${failed.id}${notice}`);
      return 1;
    }
    let wrote = false;
    if (!sentinelPresent) {
      wrote = writeSentinel(storageRoot, source, { project }).written;
      // A file that appeared since the pre-write check must still name this project.
      if (!wrote) checkSentinel(storageRoot, source, project);
    }
    const commit = source === "beads" ? commitSentinel(storageRoot) : null;

    out.stdout({ ...report, manifest_update_suggested: true, errors: [], github: { project, sentinel_path: sentinelRel, id_map: idMap } });
    for (const x of order) out.stderr(`${echoValue(x.item.id)} → ${idMap[x.item.id]}`);
    out.stderr(sentinelSummary({ source, sentinelRel, projectName, wrote, commit }));
    if (typeof suggestion === "string") out.stderr(suggestion);
    resume.clear();
    return 0;
  } catch (err) {
    if (typeof err?.code !== "string") {
      // Rethrown past the output chokepoint, so scrub it here as the chokepoint would.
      if (err instanceof Error) {
        const secrets = [process.env.GH_TOKEN, process.env.GITHUB_TOKEN];
        err.message = redact(err.message, secrets);
        if (typeof err.stack === "string") err.stack = redact(err.stack, secrets);
      }
      throw err;
    }
    out.stderr(`${err.code}: ${err.message}`);
    return 1;
  }
}

export default { migrateToGithub, createGithubOutput, echoValue };
