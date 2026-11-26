/**
 * Read-only sentinel for a board retired by `adev issues migrate --to github`.
 *
 * The document format is owned by the `agent-reliable-state-artifacts` charter
 * ("Read-only board sentinel document schema"): a separate file in the source
 * board's storage root holding exactly five keys. It is never folded into an
 * existing board file, so creating it never read-modify-writes board state.
 *
 * Uses only Node.js built-ins.
 *
 * @module lib/issues/read-only-sentinel
 */

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { isContained, lenientRealpath, safeRealpath } from "../path-safety.mjs";

const REL_PATHS = {
  json: [".context-index", "tasks", "board-read-only.json"],
  file: [".context-index", "tasks", "board-read-only.json"],
  beads: [".beads", "adev-read-only.json"],
};

const SENTINEL_KEYS = ["migrated_at", "project", "reason", "schema", "target"];
const BOARD_BRANCH = "beads-board";
const COMMIT_SUBJECT = "chore(issues): retire beads board, migrated to GitHub";
// An inherited repository override (e.g. from a git hook) would point every
// git call at a different repository than the `.beads/` checkout.
const GIT_ENV_OVERRIDES = ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"];

function mkErr(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function relPathFor(backend) {
  const rel = REL_PATHS[backend];
  if (!rel) throw mkErr("INVALID_BACKEND", `No read-only sentinel is defined for backend "${backend}".`);
  return rel;
}

/**
 * Lexical sentinel path for a backend, relative to the given storage root.
 *
 * @param {string} storageRoot
 * @param {"json"|"file"|"beads"} backend
 * @returns {string}
 */
export function sentinelPath(storageRoot, backend) {
  return join(storageRoot, ...relPathFor(backend));
}

function locate(storageRoot, backend) {
  const rel = relPathFor(backend);
  const root = lenientRealpath(resolve(storageRoot));
  return { root, path: join(root, ...rel) };
}

function lstatOrNull(path) {
  try {
    return lstatSync(path);
  } catch (err) {
    if (err.code === "ENOENT" || err.code === "ENOTDIR") return null;
    throw err;
  }
}

/**
 * The parent directory is resolved leniently because it may not exist yet: a
 * sentinel is contained when its (would-be) parent's realpath is inside the
 * root, which is what catches a `.beads` symlink leaving the root.
 */
function assertParentContained(root, path) {
  const realParent = lenientRealpath(dirname(path));
  if (!isContained(realParent, root)) {
    throw mkErr(
      "SENTINEL_PATH_UNSAFE",
      `Refusing the read-only sentinel at ${path}: its directory resolves to ${realParent}, outside the storage root ${root}.`,
    );
  }
}

function assertNotSymlink(path, st) {
  if (st && st.isSymbolicLink()) {
    throw mkErr("SENTINEL_PATH_UNSAFE", `Refusing the read-only sentinel at ${path}: the path is a symbolic link.`);
  }
}

/**
 * Strict resolution for creating or committing a sentinel: the parent must be
 * contained whether or not a sentinel exists yet, and a symlink at the
 * sentinel path is refused outright, even one pointing inside the root.
 */
function resolveForWrite(storageRoot, backend) {
  const { root, path } = locate(storageRoot, backend);
  assertParentContained(root, path);
  assertNotSymlink(path, lstatOrNull(path));
  return { root, path };
}

function isValidSentinel(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return false;
  const keys = Object.keys(doc).sort();
  if (keys.length !== SENTINEL_KEYS.length || keys.some((k, i) => k !== SENTINEL_KEYS[i])) return false;
  return (
    doc.schema === 1 &&
    doc.reason === "migrated" &&
    doc.target === "github" &&
    typeof doc.project === "string" &&
    doc.project.length > 0 &&
    typeof doc.migrated_at === "string" &&
    doc.migrated_at.length > 0
  );
}

/**
 * Create the sentinel by temp-file + rename in the same directory.
 *
 * An existing sentinel is left byte-identical: the caller has already decided
 * what an existing sentinel means (it must name the same project), and this
 * writer never replaces one.
 *
 * @param {string} storageRoot
 * @param {"json"|"file"|"beads"} backend
 * @param {{ project: string }} opts
 * @returns {{ written: boolean, path: string }}
 * @throws {Error} code `SENTINEL_PATH_UNSAFE`
 */
export function writeSentinel(storageRoot, backend, { project } = {}) {
  if (typeof project !== "string" || project.length === 0) {
    throw mkErr("INVALID_SENTINEL_PROJECT", "writeSentinel requires a non-empty project URL.");
  }
  const { root, path } = resolveForWrite(storageRoot, backend);
  if (existsSync(path)) return { written: false, path };

  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  if (!isContained(realpathSync(dir), root)) {
    throw mkErr("SENTINEL_PATH_UNSAFE", `Refusing the read-only sentinel at ${path}: its directory left the storage root ${root}.`);
  }

  const doc = { schema: 1, reason: "migrated", target: "github", project, migrated_at: new Date().toISOString() };
  const tmp = join(dir, `.${basename(path)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  try {
    writeFileSync(tmp, JSON.stringify(doc, null, 2) + "\n", { flag: "wx" });
    renameSync(tmp, path);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      // The temp file was never created or was already renamed.
    }
    throw err;
  }
  return { written: true, path };
}

/**
 * Read the sentinel, fail-closed.
 *
 * Nothing at the lexical sentinel path (including a missing parent) is simply
 * "no sentinel", even when `.beads` or `.context-index/tasks` is a symlink
 * leaving the root: a never-migrated board may legitimately route its storage
 * through such a link. Only something actually present is checked for
 * containment and refused when it is a symlink or sits outside the root.
 *
 * @param {string} storageRoot
 * @param {"json"|"file"|"beads"} backend
 * @returns {null | { malformed: true } | { schema: 1, reason: "migrated", target: "github", project: string, migrated_at: string }}
 * @throws {Error} code `SENTINEL_PATH_UNSAFE`
 */
export function readSentinel(storageRoot, backend) {
  const { root, path } = locate(storageRoot, backend);
  const st = lstatOrNull(path);
  if (st === null) return null;
  assertNotSymlink(path, st);
  assertParentContained(root, path);
  let doc;
  try {
    doc = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { malformed: true };
  }
  return isValidSentinel(doc) ? doc : { malformed: true };
}

/**
 * Throw `BOARD_READ_ONLY_MIGRATED` when the storage root holds any sentinel,
 * well-formed or not. Adapters call this before touching board storage.
 *
 * @param {string} storageRoot
 * @param {"json"|"file"|"beads"} backend
 * @throws {Error} code `BOARD_READ_ONLY_MIGRATED` or `SENTINEL_PATH_UNSAFE`
 */
export function assertWritable(storageRoot, backend) {
  const sentinel = readSentinel(storageRoot, backend);
  if (sentinel === null) return;
  const path = sentinelPath(lenientRealpath(resolve(storageRoot)), backend);
  if (sentinel.malformed) {
    throw mkErr(
      "BOARD_READ_ONLY_MIGRATED",
      `This board is read-only: its storage root holds an unreadable read-only sentinel (${path}). ` +
        "Writes are refused until an operator inspects it; only removing the sentinel by hand un-retires the board.",
    );
  }
  throw mkErr(
    "BOARD_READ_ONLY_MIGRATED",
    `This board was migrated to GitHub (${sentinel.project}) and is read-only. ` +
      `Make changes on the GitHub board; the read-only sentinel is ${path}.`,
  );
}

/**
 * Commit the beads sentinel, and only that file, on the `beads-board` checkout.
 * Never pushes, never passes `--no-verify`, never commits on any other branch.
 *
 * @param {string} storageRoot
 * @returns {{ committed: boolean, alreadyCommitted: boolean }}
 * @throws {Error} code `MIGRATE_SENTINEL_COMMIT_FAILED` or `SENTINEL_PATH_UNSAFE`
 */
export function commitSentinel(storageRoot) {
  const { path } = resolveForWrite(storageRoot, "beads");
  const beadsDir = dirname(path);
  const name = basename(path);
  const env = { ...process.env };
  for (const key of GIT_ENV_OVERRIDES) delete env[key];
  const git = (args) => execFileSync("git", args, { cwd: beadsDir, encoding: "utf8", stdio: "pipe", env }).trim();
  const succeeds = (args) => {
    try {
      git(args);
      return true;
    } catch {
      return false;
    }
  };
  const byHand =
    `(cd "${beadsDir}" && git add -- "${name}" && git commit -m "${COMMIT_SUBJECT}" -- "${name}")`;
  const fail = (topology, remedy) =>
    mkErr(
      "MIGRATE_SENTINEL_COMMIT_FAILED",
      `Could not commit the read-only sentinel ${path} on branch ${BOARD_BRANCH}: ${topology}. ${remedy}`,
    );
  const gitDetail = (err) => String(err.stderr || "").trim() || String(err.stdout || "").trim() || err.message;

  if (!existsSync(path)) {
    throw fail("the sentinel file does not exist", "Write the sentinel before committing it.");
  }

  let toplevel;
  try {
    toplevel = git(["rev-parse", "--show-toplevel"]);
  } catch (err) {
    throw fail(
      `.beads/ is not inside a git checkout (${gitDetail(err)})`,
      `Run \`adev issues board migrate\` to provision the ${BOARD_BRANCH} worktree, or commit that one file by hand on the branch that carries the board.`,
    );
  }
  if (safeRealpath(toplevel) !== safeRealpath(beadsDir)) {
    throw fail(
      `.beads/ is not a linked worktree (git reports its checkout as ${toplevel}, so the board is still tracked on that checkout's branch)`,
      `Run \`adev issues board migrate\` to move the board onto ${BOARD_BRANCH}, or commit that one file by hand on the branch that carries the board.`,
    );
  }

  let branch;
  try {
    branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  } catch (err) {
    throw fail(`git error reading the .beads/ branch (${gitDetail(err)})`, `Commit that one file by hand on ${BOARD_BRANCH}: ${byHand}`);
  }
  if (branch !== BOARD_BRANCH) {
    throw fail(
      `.beads/ is checked out on branch "${branch}", not ${BOARD_BRANCH}`,
      `Switch .beads/ back to ${BOARD_BRANCH} and re-run, or commit that one file by hand there: ${byHand}`,
    );
  }

  // Tracking is checked directly: `git status --porcelain` is also empty for a
  // gitignored, untracked file, which would misreport it as committed.
  if (succeeds(["ls-files", "--error-unmatch", "--", name]) && succeeds(["diff", "--quiet", "HEAD", "--", name])) {
    return { committed: false, alreadyCommitted: true };
  }

  try {
    git(["add", "--", name]);
  } catch (err) {
    const ignored = succeeds(["check-ignore", "-q", "--", name]);
    throw fail(
      ignored ? `the sentinel path is gitignored on ${BOARD_BRANCH}` : `git add failed (${gitDetail(err)})`,
      `Commit that one file by hand on ${BOARD_BRANCH}${ignored ? " after removing the ignore rule" : ""}: ${byHand}`,
    );
  }

  try {
    git(["commit", "-m", COMMIT_SUBJECT, "--", name]);
  } catch (err) {
    throw fail(`git commit failed (${gitDetail(err)})`, `Commit that one file by hand on ${BOARD_BRANCH}: ${byHand}`);
  }
  return { committed: true, alreadyCommitted: false };
}
