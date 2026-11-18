#!/usr/bin/env node
// Finishes an in-progress `git merge origin/main` on release/next (run with
// `--no-commit`, before the commit). It does two things the merge driver in
// git-merge-keep-version.sh cannot:
//
// 1. Rebases release/next's prerelease line onto main's stable release.
//    release-please's `prerelease` versioning only ever bumps the suffix of the
//    version in `.release-please-manifest.json`, so a line based on 0.28.0
//    keeps producing 0.28.0-next.N after 0.28.0 has shipped — a version semver
//    sorts *below* the stable one. When main's manifest holds a stable version
//    at or above the line's base, this writes main's version instead; from a
//    stable base release-please starts a fresh line (0.27.8 -> 0.27.9-next).
//
// 2. Resolves the files every stable release on main conflicts on: the
//    manifest (above), CHANGELOG.md (main's copy is canonical; release-please
//    prepends the next prerelease entry) and package-lock.json (main's lockfile
//    with release/next's own root version kept, as the driver does for
//    package.json — the driver's whole-file "version" rewrite would clobber
//    every dependency's version here, so it cannot be reused).
//
// Any other conflicted path is left alone and fails the run, so a genuine
// conflict still needs a human. Exit 0 = ready to commit, 1 = unresolved.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const MANIFEST = ".release-please-manifest.json";
const CHANGELOG = "CHANGELOG.md";
const LOCKFILE = "package-lock.json";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/;

function parse(version) {
  const m = SEMVER.exec(version ?? "");
  if (!m) return null;
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ?? null };
}

function compareCore(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/**
 * The version release/next's manifest should carry after merging main.
 * Main's version wins only when it is a stable release that has caught up
 * with (or passed) the core of release/next's line; anything unparseable
 * keeps release/next's value.
 */
export function pickNextVersion(ours, theirs) {
  const o = parse(ours);
  const t = parse(theirs);
  if (!o || !t || t.pre) return ours;
  const cmp = compareCore(t.core, o.core);
  if (cmp > 0) return theirs;
  if (cmp === 0 && o.pre) return theirs;
  return ours;
}

export function rebaseManifest(oursDoc, theirsDoc) {
  const out = { ...oursDoc };
  const rebased = [];
  for (const [pkg, theirs] of Object.entries(theirsDoc)) {
    if (!(pkg in oursDoc)) continue;
    const picked = pickNextVersion(oursDoc[pkg], theirs);
    if (picked !== oursDoc[pkg]) rebased.push({ pkg, from: oursDoc[pkg], to: picked });
    out[pkg] = picked;
  }
  return { doc: out, rebased };
}

export function mergeLockfile(oursText, theirsText) {
  const ours = JSON.parse(oursText);
  const theirs = JSON.parse(theirsText);
  if ("version" in ours) theirs.version = ours.version;
  if (theirs.packages?.[""] && ours.packages?.[""] && "version" in ours.packages[""]) {
    theirs.packages[""].version = ours.packages[""].version;
  }
  return `${JSON.stringify(theirs, null, 2)}\n`;
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function hasRef(cwd, ref) {
  try {
    git(cwd, ["rev-parse", "-q", "--verify", ref]);
    return true;
  } catch {
    return false;
  }
}

export function run(cwd = process.cwd()) {
  if (!hasRef(cwd, "MERGE_HEAD")) {
    return { ok: true, resolved: [], rebased: [], unresolved: [], note: "no merge in progress" };
  }

  const conflicted = git(cwd, ["diff", "--name-only", "--diff-filter=U"])
    .split("\n")
    .filter(Boolean);
  const resolved = [];
  const unresolved = [];

  for (const path of conflicted) {
    if (path === MANIFEST) continue;
    if (path === CHANGELOG) {
      git(cwd, ["checkout", "--theirs", "--", CHANGELOG]);
    } else if (path === LOCKFILE) {
      const merged = mergeLockfile(git(cwd, ["show", `:2:${LOCKFILE}`]), git(cwd, ["show", `:3:${LOCKFILE}`]));
      writeFileSync(join(cwd, LOCKFILE), merged);
    } else {
      unresolved.push(path);
      continue;
    }
    git(cwd, ["add", "--", path]);
    resolved.push(path);
  }

  let rebased = [];
  if (hasRef(cwd, `HEAD:${MANIFEST}`) && hasRef(cwd, `MERGE_HEAD:${MANIFEST}`)) {
    const ours = JSON.parse(git(cwd, ["show", `HEAD:${MANIFEST}`]));
    const theirs = JSON.parse(git(cwd, ["show", `MERGE_HEAD:${MANIFEST}`]));
    const result = rebaseManifest(ours, theirs);
    rebased = result.rebased;
    writeFileSync(join(cwd, MANIFEST), `${JSON.stringify(result.doc, null, 2)}\n`);
    git(cwd, ["add", "--", MANIFEST]);
    if (conflicted.includes(MANIFEST)) resolved.push(MANIFEST);
  } else if (conflicted.includes(MANIFEST)) {
    unresolved.push(MANIFEST);
  }

  return { ok: unresolved.length === 0, resolved, rebased, unresolved };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = run();
  for (const path of result.resolved) console.log(`resolved: ${path}`);
  for (const r of result.rebased) {
    console.log(`rebased prerelease line (${r.pkg}): ${r.from} -> ${r.to}`);
  }
  for (const path of result.unresolved) console.error(`unresolved conflict: ${path}`);
  process.exit(result.ok ? 0 : 1);
}
