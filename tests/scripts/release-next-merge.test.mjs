// Replays the main -> release/next propagation in a scratch repo, with the
// same merge driver and resolver the workflow configures. release-please's
// prerelease versioning only bumps the suffix of the manifest's version, so
// unless the merge moves the manifest onto main's stable release, the `next`
// channel keeps publishing X.Y.Z-next.N after X.Y.Z has shipped.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { mergeLockfile, pickNextVersion, rebaseManifest } from "../../scripts/release-next-merge.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RESOLVER = join(ROOT, "scripts", "release-next-merge.mjs");
const DRIVER = join(ROOT, "scripts", "git-merge-keep-version.sh");

describe("pickNextVersion", () => {
  const cases = [
    ["0.28.0-next.10", "0.28.0", "0.28.0", "main shipped the line's own core"],
    ["0.28.0-next.10", "0.28.1", "0.28.1", "main shipped past the line"],
    ["0.28.1-next", "0.28.0", "0.28.1-next", "line already ahead of main"],
    ["0.29.0-next.2", "0.28.1", "0.29.0-next.2", "line a minor ahead"],
    ["0.28.0", "0.28.0", "0.28.0", "already rebased, nothing shipped since"],
    ["0.28.0", "0.28.1", "0.28.1", "stable base, main moved on"],
    ["0.28.0-next.3", "0.28.0-rc.1", "0.28.0-next.3", "main never prereleases; ignore"],
    ["0.28.0-next.3", "garbage", "0.28.0-next.3", "unparseable keeps ours"],
  ];
  for (const [ours, theirs, expected, why] of cases) {
    test(`${ours} + main ${theirs} -> ${expected} (${why})`, () => {
      assert.equal(pickNextVersion(ours, theirs), expected);
    });
  }

  test("rebaseManifest reports what moved and ignores packages release/next lacks", () => {
    const { doc, rebased } = rebaseManifest({ ".": "0.28.0-next.10" }, { ".": "0.28.1", other: "1.0.0" });
    assert.deepEqual(doc, { ".": "0.28.1" });
    assert.deepEqual(rebased, [{ pkg: ".", from: "0.28.0-next.10", to: "0.28.1" }]);
  });

  test("mergeLockfile keeps main's dependencies and release/next's root version", () => {
    const ours = lockfile("0.28.0-next.10", "1.0.0");
    const theirs = lockfile("0.28.1", "2.0.0");
    const merged = JSON.parse(mergeLockfile(ours, theirs));
    assert.equal(merged.version, "0.28.0-next.10");
    assert.equal(merged.packages[""].version, "0.28.0-next.10");
    assert.equal(merged.packages["node_modules/dep"].version, "2.0.0");
  });
});

function lockfile(rootVersion, depVersion) {
  return `${JSON.stringify(
    {
      name: "pkg",
      version: rootVersion,
      lockfileVersion: 3,
      packages: { "": { name: "pkg", version: rootVersion }, "node_modules/dep": { version: depVersion } },
    },
    null,
    2,
  )}\n`;
}

function pkgJson(version) {
  return `{\n  "name": "pkg",\n  "version": "${version}",\n  "type": "module"\n}\n`;
}

function manifest(version) {
  return `{\n  ".": "${version}"\n}\n`;
}

function changelog(entries) {
  return `# Changelog\n\n${entries.map((e) => `## ${e}\n\n* change\n`).join("\n")}`;
}

function withRepo(fn) {
  return () => {
    const dir = mkdtempSync(join(tmpdir(), "release-next-merge-"));
    const g = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const write = (files) => {
      for (const [path, body] of Object.entries(files)) writeFileSync(join(dir, path), body);
    };
    const commit = (msg, files) => {
      write(files);
      g("add", "-A");
      g("commit", "-q", "-m", msg);
    };
    try {
      g("init", "-q", "-b", "main");
      g("config", "user.name", "t");
      g("config", "user.email", "t@example.invalid");
      g("config", "commit.gpgsign", "false");
      g("config", "merge.release-next-version.driver", `${DRIVER} %O %A %B`);
      commit("chore(main): release 0.28.0", {
        ".gitattributes": "package.json merge=release-next-version\n",
        "package.json": pkgJson("0.28.0"),
        "package-lock.json": lockfile("0.28.0", "1.0.0"),
        ".release-please-manifest.json": manifest("0.28.0"),
        "CHANGELOG.md": changelog(["0.28.0"]),
        "src.txt": "base\n",
      });
      g("checkout", "-q", "-b", "release/next");
      commit("chore(release/next): release 0.28.0-next.10", {
        "package.json": pkgJson("0.28.0-next.10"),
        "package-lock.json": lockfile("0.28.0-next.10", "1.0.0"),
        ".release-please-manifest.json": manifest("0.28.0-next.10"),
        "CHANGELOG.md": changelog(["0.28.0-next.10", "0.28.0"]),
      });
      g("checkout", "-q", "main");
      fn({ dir, g, commit, write });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

function propagate({ dir, g }) {
  g("checkout", "-q", "release/next");
  spawnSync("git", ["merge", "main", "--no-ff", "--no-commit"], { cwd: dir, encoding: "utf8" });
  const r = spawnSync("node", [RESOLVER], { cwd: dir, encoding: "utf8" });
  return { ...r, read: (p) => readFileSync(join(dir, p), "utf8") };
}

describe("release-next-merge.mjs during a real merge", () => {
  test(
    "after main ships a stable release, the manifest, changelog and lockfile resolve and the line moves to main's version",
    withRepo((repo) => {
      repo.commit("chore(main): release 0.28.1", {
        "package.json": pkgJson("0.28.1"),
        "package-lock.json": lockfile("0.28.1", "2.0.0"),
        ".release-please-manifest.json": manifest("0.28.1"),
        "CHANGELOG.md": changelog(["0.28.1", "0.28.0"]),
      });
      const r = propagate(repo);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /0\.28\.0-next\.10 -> 0\.28\.1/);
      assert.equal(repo.g("diff", "--name-only", "--diff-filter=U").trim(), "");
      assert.deepEqual(JSON.parse(r.read(".release-please-manifest.json")), { ".": "0.28.1" });
      assert.equal(r.read("CHANGELOG.md"), changelog(["0.28.1", "0.28.0"]));
      const lock = JSON.parse(r.read("package-lock.json"));
      assert.equal(lock.version, "0.28.0-next.10");
      assert.equal(lock.packages["node_modules/dep"].version, "2.0.0");
      assert.match(r.read("package.json"), /"version": "0\.28\.0-next\.10"/);
    }),
  );

  test(
    "with no stable release on main, a line whose core already shipped still moves (main's manifest untouched)",
    withRepo((repo) => {
      repo.commit("fix: something", { "src.txt": "changed\n" });
      const r = propagate(repo);
      assert.equal(r.status, 0, r.stderr);
      assert.deepEqual(JSON.parse(r.read(".release-please-manifest.json")), { ".": "0.28.0" });
    }),
  );

  test(
    "a conflict in any other file fails, leaving it for a human",
    withRepo((repo) => {
      repo.g("checkout", "-q", "release/next");
      repo.commit("next-only edit", { "src.txt": "next\n" });
      repo.g("checkout", "-q", "main");
      repo.commit("main edit", { "src.txt": "main\n" });
      const r = propagate(repo);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /unresolved conflict: src\.txt/);
    }),
  );

  test(
    "outside a merge it does nothing",
    withRepo(({ dir }) => {
      const r = spawnSync("node", [RESOLVER], { cwd: dir, encoding: "utf8" });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout, "");
    }),
  );
});
