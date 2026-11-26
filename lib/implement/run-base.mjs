// run-base.mjs — read /adev:implement's governance inputs from the run-base commit.
//
// A `lite` task runs inline in the orchestrator and edits the working tree, so
// any governance input read from disk mid-run could be changed by the task it
// is judging. Every resolve-depth and batches call in a run therefore reads
// risk-policies.yaml, boundaries.yaml, sensitive-paths.yaml and the routing
// sidecar from one commit (`run_base`, captured by check-flags), never from
// the working tree.
//
// Commit ids reach git only as validated, separate argv elements: a full
// lowercase hex object id (which cannot start with `-`), resolved with
// `rev-parse --verify --end-of-options`, never through a shell.
//
// Zero external deps — Node built-ins + in-repo modules.

import { execFileSync } from "node:child_process";
import { isAbsolute, posix, relative, resolve as resolvePath, sep } from "node:path";
import { codedError } from "../errors.mjs";
import { parseRigorPolicies } from "../governance/rigor-mode.mjs";
import { parseRoutingSidecarText, sidecarPathFor } from "../plan-routing-sidecar.mjs";
import { boundaryCrossingFor, loadConfiguredSensitivePaths } from "../cli/test-policy.mjs";

const OBJECT_ID_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const GIT_OPTS = { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 };

const POLICIES_REL = ".context-index/governance/risk-policies.yaml";
const SENSITIVE_PATHS_REL = ".context-index/governance/sensitive-paths.yaml";
const BOUNDARIES_REL = ".context-index/governance/boundaries.yaml";

function invalidCommitId(flag, value, kinds) {
  return codedError(
    "INVALID_COMMIT_ID",
    `INVALID_COMMIT_ID: ${flag} must be a full hex object id resolving to a ${kinds.join(" or ")}; got ${JSON.stringify(value)}`,
  );
}

// Returns `value` unchanged when it is a full lowercase hex object id that
// resolves in `projectRoot` to an object whose type is one of `kinds`
// (e.g. ["commit"] for --run-base, ["commit", "tree"] for --base-sha).
// Throws INVALID_COMMIT_ID naming `flag` otherwise.
export function validateCommitId(flag, value, { projectRoot, kinds } = {}) {
  if (!Array.isArray(kinds) || kinds.length === 0 || !kinds.every((k) => typeof k === "string" && k !== "")) {
    throw codedError(
      "INVALID_COMMIT_KINDS",
      `INVALID_COMMIT_KINDS: validateCommitId needs a non-empty array of git object types; got ${JSON.stringify(kinds)}`,
    );
  }
  if (typeof value !== "string" || !OBJECT_ID_RE.test(value)) {
    throw invalidCommitId(flag, value, kinds);
  }
  let type;
  try {
    execFileSync(
      "git",
      ["rev-parse", "--verify", "--quiet", "--end-of-options", `${value}^{object}`],
      { ...GIT_OPTS, cwd: projectRoot },
    );
    type = execFileSync("git", ["cat-file", "-t", value], { ...GIT_OPTS, cwd: projectRoot }).trim();
  } catch {
    throw invalidCommitId(flag, value, kinds);
  }
  if (!kinds.includes(type)) throw invalidCommitId(flag, value, kinds);
  return value;
}

// Returns the normalized posix form of a project-relative path, refusing an
// absolute path, a leading `-` or `:`, or any `..` segment left after
// normalization. A leading `:` is git's pathspec-magic prefix (`:(icase)`,
// `:/` for the repository top), which would let a path escape literal
// matching.
export function assertRepoRelative(relPath) {
  const refuse = () =>
    codedError(
      "INVALID_PLAN_PATH",
      `INVALID_PLAN_PATH: expected a project-relative path with no '..' segment and no leading '-' or ':'; got ${JSON.stringify(relPath)}`,
    );
  const badLead = (p) => p.startsWith("-") || p.startsWith(":");
  if (typeof relPath !== "string" || relPath === "" || badLead(relPath)) throw refuse();
  if (isAbsolute(relPath) || posix.isAbsolute(relPath)) throw refuse();
  const normalized = posix.normalize(relPath.split(sep).join("/"));
  if (normalized.split("/").includes("..") || badLead(normalized) || normalized === ".") throw refuse();
  return normalized;
}

// The operator's pathspec env would otherwise reinterpret the ls-tree path:
// GIT_GLOB_PATHSPECS / GIT_ICASE_PATHSPECS make every lookup fail, and git
// refuses to combine GIT_LITERAL_PATHSPECS with any of them, so they are
// removed rather than overridden.
function literalPathspecEnv() {
  const env = { ...process.env, GIT_LITERAL_PATHSPECS: "1" };
  delete env.GIT_GLOB_PATHSPECS;
  delete env.GIT_NOGLOB_PATHSPECS;
  delete env.GIT_ICASE_PATHSPECS;
  return env;
}

const SYMLINK_MODE = "120000";

function readFailed(rel, sha, detail) {
  return codedError("RUN_BASE_READ_FAILED", `RUN_BASE_READ_FAILED: could not read ${rel} at ${sha}: ${detail}`);
}

function gitFailureDetail(err) {
  return String(err?.stderr ?? "").trim() || err?.message || String(err);
}

// Returns the text of `relPath` (relative to `projectRoot`) as committed at
// `sha`, or null when the path does not exist at that commit.
//
// Absence is decided by `git ls-tree` output (empty when the path is not in
// the tree), never by matching git's stderr, which git localizes. ls-tree
// resolves the path against its cwd and reports it relative to that cwd, so
// a project nested inside a larger repository reads its own `.context-index/`.
// Any git failure (no repository, unknown commit) and a path that is not a
// regular file at the commit (a tree, a submodule, or a symlink, whose blob is
// the link target rather than the file's content) throw RUN_BASE_READ_FAILED:
// a governance read fails closed rather than being mistaken for an absent or
// empty file. Links are never followed.
export function readAtCommit(projectRoot, sha, relPath) {
  const rel = assertRepoRelative(relPath);
  if (typeof sha !== "string" || !OBJECT_ID_RE.test(sha)) {
    throw invalidCommitId("run base", sha, ["commit"]);
  }
  let listing;
  try {
    listing = execFileSync("git", ["ls-tree", "-z", sha, "--", rel], {
      ...GIT_OPTS,
      cwd: projectRoot,
      env: literalPathspecEnv(),
    });
  } catch (err) {
    throw readFailed(rel, sha, gitFailureDetail(err));
  }
  const entry = listing
    .split("\0")
    .map((record) => {
      const tab = record.indexOf("\t");
      const [mode, type, oid] = record.slice(0, tab).split(" ");
      return { mode, type, oid, path: record.slice(tab + 1) };
    })
    .find((e) => e.path === rel);
  if (!entry) return null;
  if (entry.mode === SYMLINK_MODE) {
    throw readFailed(rel, sha, "path is a symlink at the commit; governance inputs must be regular files");
  }
  if (entry.type !== "blob") throw readFailed(rel, sha, `path is a ${entry.type}, not a file`);
  try {
    return execFileSync("git", ["cat-file", "blob", entry.oid], { ...GIT_OPTS, cwd: projectRoot });
  } catch (err) {
    throw readFailed(rel, sha, gitFailureDetail(err));
  }
}

// Callers should pass a projectRoot-relative plan path. An absolute path is
// accepted but compared textually: one reached through a symlinked prefix
// (e.g. /tmp vs /private/tmp) relativizes to a `..` path and fails closed with
// INVALID_PLAN_PATH.
function planRelFor(projectRoot, planPath) {
  const rel =
    typeof planPath === "string" && isAbsolute(planPath)
      ? relative(resolvePath(projectRoot), planPath)
      : planPath;
  return assertRepoRelative(rel);
}

// Reads implement's four governance inputs from the `runBase` commit, through
// the same parsers and degradation rules as the on-disk readers. A file absent
// at `runBase` is treated exactly like an absent file on disk. An absent
// routing sidecar yields `routingEntries: null` plus a ROUTING_SIDECAR_MISSING
// warning naming the run base, so the caller denies `lite` for every task
// instead of stopping the run.
export function loadGovernanceAtRunBase({ projectRoot, runBase, planPath }) {
  const sha = validateCommitId("--run-base", runBase, { projectRoot, kinds: ["commit"] });
  const label = (rel) => `run-base:${sha}:${rel}`;
  const warnings = [];

  const policiesText = readAtCommit(projectRoot, sha, POLICIES_REL);
  const policies = policiesText === null ? null : parseRigorPolicies(policiesText, label(POLICIES_REL));

  const sensitivePaths = loadConfiguredSensitivePaths(projectRoot, {
    text: readAtCommit(projectRoot, sha, SENSITIVE_PATHS_REL),
  });

  const boundariesText = readAtCommit(projectRoot, sha, BOUNDARIES_REL);
  const boundaryCheck = (paths) => boundaryCrossingFor(projectRoot, paths, { text: boundariesText });

  const sidecarRel = sidecarPathFor(planRelFor(projectRoot, planPath));
  const sidecarText = readAtCommit(projectRoot, sha, sidecarRel);
  let routingEntries = null;
  if (sidecarText === null) {
    warnings.push({
      code: "ROUTING_SIDECAR_MISSING",
      run_base: sha,
      message: `ROUTING_SIDECAR_MISSING: ${sidecarRel} is not committed at run_base ${sha}; no task is granted lite`,
    });
  } else {
    routingEntries = parseRoutingSidecarText(sidecarText, label(sidecarRel));
  }

  return { policies, sensitivePaths, boundaryCheck, routingEntries, warnings };
}
