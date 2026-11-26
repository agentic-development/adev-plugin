import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  symlinkSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  existsSync,
  lstatSync,
} from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import {
  writeSentinel,
  readSentinel,
  assertWritable,
  sentinelPath,
  commitSentinel,
} from "../../lib/issues/read-only-sentinel.mjs";
import { JsonAdapter } from "../../lib/issues/json-adapter.mjs";
import { BeadsAdapter } from "../../lib/issues/beads-adapter.mjs";
import { FileAdapter } from "../../lib/issues/file-adapter.mjs";

const PROJECT = "https://github.com/orgs/acme/projects/7";
const OTHER_PROJECT = "https://github.com/orgs/acme/projects/99";
const COMMIT_SUBJECT = "chore(issues): retire beads board, migrated to GitHub";
const git = (args, cwd) =>
  execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8", stdio: "pipe" }).trim();

function jsonProject() {
  const dir = createTempDir();
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
  return dir;
}

// A main repo whose .beads/ is a linked worktree of an orphan beads-board branch,
// the topology lib/issues/board-worktree.mjs provisions.
function beadsRepo() {
  const dir = createTempDir();
  git(["init", "-q", "-b", "main"], dir);
  git(["config", "user.email", "t@t"], dir);
  git(["config", "user.name", "t"], dir);
  git(["commit", "-q", "--allow-empty", "-m", "root"], dir);
  git(["worktree", "add", "-q", "--orphan", "-b", "beads-board", ".beads"], dir);
  const beads = join(dir, ".beads");
  writeFileSync(join(beads, "issues.jsonl"), "");
  git(["add", "--", "issues.jsonl"], beads);
  git(["commit", "-q", "-m", "board"], beads);
  return dir;
}

function writeRawSentinel(dir, backend, body) {
  const p = sentinelPath(dir, backend);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, body);
  return p;
}

describe("sentinelPath", () => {
  test("json and file map to .context-index/tasks/board-read-only.json; beads to .beads/adev-read-only.json", () => {
    const root = "/abs/root";
    assert.equal(sentinelPath(root, "json"), join(root, ".context-index", "tasks", "board-read-only.json"));
    assert.equal(sentinelPath(root, "file"), join(root, ".context-index", "tasks", "board-read-only.json"));
    assert.equal(sentinelPath(root, "beads"), join(root, ".beads", "adev-read-only.json"));
  });
});

describe("writeSentinel / readSentinel", () => {
  test("content is exactly the five keys with schema 1, reason migrated, target github, the project and an ISO migrated_at", () => {
    const dir = jsonProject();
    try {
      writeSentinel(dir, "json", { project: PROJECT });
      const doc = JSON.parse(readFileSync(sentinelPath(dir, "json"), "utf8"));
      assert.deepEqual(Object.keys(doc).sort(), ["migrated_at", "project", "reason", "schema", "target"]);
      assert.equal(doc.schema, 1);
      assert.equal(doc.reason, "migrated");
      assert.equal(doc.target, "github");
      assert.equal(doc.project, PROJECT);
      assert.match(doc.migrated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
      assert.equal(new Date(doc.migrated_at).toISOString().slice(0, 19), doc.migrated_at.slice(0, 19));
      assert.deepEqual(readSentinel(dir, "json"), doc);
    } finally { cleanupTempDir(dir); }
  });

  test("creates the parent directory when absent and leaves no temp file behind (atomic temp-rename)", () => {
    const dir = createTempDir();
    try {
      writeSentinel(dir, "json", { project: PROJECT });
      assert.deepEqual(readdirSync(join(dir, ".context-index", "tasks")), ["board-read-only.json"]);
      mkdirSync(join(dir, ".beads"));
      writeFileSync(join(dir, ".beads", "issues.jsonl"), "");
      writeSentinel(dir, "beads", { project: PROJECT });
      assert.deepEqual(readdirSync(join(dir, ".beads")).sort(), ["adev-read-only.json", "issues.jsonl"]);
    } finally { cleanupTempDir(dir); }
  });

  test("never overwrites an existing sentinel: a second write leaves it byte-identical", () => {
    const dir = jsonProject();
    try {
      writeSentinel(dir, "json", { project: PROJECT });
      const before = readFileSync(sentinelPath(dir, "json"));
      writeSentinel(dir, "json", { project: OTHER_PROJECT });
      assert.deepEqual(readFileSync(sentinelPath(dir, "json")), before);
      assert.equal(readSentinel(dir, "json").project, PROJECT);
    } finally { cleanupTempDir(dir); }
  });

  test("absent sentinel reads back as null and assertWritable allows writes", async () => {
    const dir = jsonProject();
    try {
      assert.equal(readSentinel(dir, "json"), null);
      assert.equal(readSentinel(dir, "beads"), null);
      assert.equal(assertWritable(dir, "json"), undefined);
      const a = new JsonAdapter(dir);
      await a.init();
      const created = await a.create({ title: "ok" });
      assert.equal((await a.get(created.id)).title, "ok");
    } finally { cleanupTempDir(dir); }
  });

  test("a storage root given through a symlink is resolved by realpath and still contained", () => {
    const real = createTempDir();
    const linkParent = createTempDir();
    try {
      const link = join(linkParent, "root-link");
      symlinkSync(real, link);
      writeSentinel(link, "json", { project: PROJECT });
      assert.equal(JSON.parse(readFileSync(join(real, ".context-index", "tasks", "board-read-only.json"), "utf8")).project, PROJECT);
      assert.equal(readSentinel(link, "json").project, PROJECT);
    } finally { cleanupTempDir(real); cleanupTempDir(linkParent); }
  });
});

describe("fail-closed reading (BEH-33, charter rev 9)", () => {
  const valid = { schema: 1, reason: "migrated", target: "github", project: PROJECT, migrated_at: "2026-11-26T00:00:00Z" };
  const cases = [
    ["unparseable JSON", "{not json"],
    ["unknown schema", JSON.stringify({ ...valid, schema: 2 })],
    ["reason outside the closed set", JSON.stringify({ ...valid, reason: "archived" })],
    ["target outside the closed set", JSON.stringify({ ...valid, target: "jira" })],
    ["a key outside the five", JSON.stringify({ ...valid, extra: true })],
    ["a JSON array", JSON.stringify([valid])],
  ];
  for (const [label, body] of cases) {
    test(`${label}: reads back as { malformed: true } and blocks writes as unreadable`, () => {
      const dir = createTempDir();
      try {
        writeRawSentinel(dir, "json", body);
        assert.deepEqual(readSentinel(dir, "json"), { malformed: true });
        assert.throws(() => assertWritable(dir, "json"), (e) =>
          e.code === "BOARD_READ_ONLY_MIGRATED" && e.message.includes("an unreadable read-only sentinel"));
      } finally { cleanupTempDir(dir); }
    });
  }

  test("a well-formed sentinel blocks writes with a message naming the project", () => {
    const dir = createTempDir();
    try {
      writeRawSentinel(dir, "beads", JSON.stringify(valid));
      assert.deepEqual(readSentinel(dir, "beads"), valid);
      assert.throws(() => assertWritable(dir, "beads"), (e) =>
        e.code === "BOARD_READ_ONLY_MIGRATED" && e.message.includes(PROJECT));
    } finally { cleanupTempDir(dir); }
  });

  test("a malformed sentinel also blocks json adapter writes", async () => {
    const dir = jsonProject();
    try {
      const a = new JsonAdapter(dir);
      await a.init();
      writeRawSentinel(dir, "json", "{not json");
      await assert.rejects(a.create({ title: "y" }), { code: "BOARD_READ_ONLY_MIGRATED" });
    } finally { cleanupTempDir(dir); }
  });
});

describe("SENTINEL_PATH_UNSAFE (BEH-32, migration BEH-12)", () => {
  test("symlink at the sentinel path is refused on write and read, and its target is untouched", () => {
    const dir = createTempDir();
    const other = createTempDir();
    try {
      mkdirSync(join(dir, ".context-index/tasks"), { recursive: true });
      writeFileSync(join(other, "x.json"), "{}");
      symlinkSync(join(other, "x.json"), sentinelPath(dir, "json"));
      assert.throws(() => writeSentinel(dir, "json", { project: PROJECT }), { code: "SENTINEL_PATH_UNSAFE" });
      assert.throws(() => readSentinel(dir, "json"), { code: "SENTINEL_PATH_UNSAFE" });
      assert.equal(readFileSync(join(other, "x.json"), "utf8"), "{}");
    } finally { cleanupTempDir(dir); cleanupTempDir(other); }
  });

  test("a symlink at the sentinel path is refused even when it points inside the root", () => {
    const dir = createTempDir();
    try {
      mkdirSync(join(dir, ".context-index/tasks"), { recursive: true });
      const inside = join(dir, ".context-index/tasks/real.json");
      writeFileSync(inside, JSON.stringify({ schema: 1, reason: "migrated", target: "github", project: PROJECT, migrated_at: "2026-11-26T00:00:00Z" }));
      symlinkSync(inside, sentinelPath(dir, "json"));
      assert.throws(() => readSentinel(dir, "json"), { code: "SENTINEL_PATH_UNSAFE" });
      assert.throws(() => writeSentinel(dir, "json", { project: PROJECT }), { code: "SENTINEL_PATH_UNSAFE" });
    } finally { cleanupTempDir(dir); }
  });

  test("a dangling symlink at the sentinel path is refused on write and nothing is created at its target", () => {
    const dir = createTempDir();
    const other = createTempDir();
    try {
      mkdirSync(join(dir, ".beads"));
      const target = join(other, "missing.json");
      symlinkSync(target, sentinelPath(dir, "beads"));
      assert.throws(() => writeSentinel(dir, "beads", { project: PROJECT }), { code: "SENTINEL_PATH_UNSAFE" });
      assert.equal(existsSync(target), false);
      assert.equal(lstatSync(sentinelPath(dir, "beads")).isSymbolicLink(), true);
    } finally { cleanupTempDir(dir); cleanupTempDir(other); }
  });

  test(".beads resolving outside the root is refused on write and read, with nothing written outside", () => {
    const dir = createTempDir();
    const other = createTempDir();
    try {
      symlinkSync(other, join(dir, ".beads"));
      assert.throws(() => writeSentinel(dir, "beads", { project: PROJECT }), { code: "SENTINEL_PATH_UNSAFE" });
      assert.deepEqual(readdirSync(other), []);
      writeFileSync(join(other, "adev-read-only.json"), JSON.stringify({ schema: 1, reason: "migrated", target: "github", project: PROJECT, migrated_at: "2026-11-26T00:00:00Z" }));
      assert.throws(() => readSentinel(dir, "beads"), { code: "SENTINEL_PATH_UNSAFE" });
    } finally { cleanupTempDir(dir); cleanupTempDir(other); }
  });

  test(".context-index/tasks resolving outside the root is refused for a json source", () => {
    const dir = createTempDir();
    const other = createTempDir();
    try {
      mkdirSync(join(dir, ".context-index"));
      symlinkSync(other, join(dir, ".context-index", "tasks"));
      assert.throws(() => writeSentinel(dir, "json", { project: PROJECT }), { code: "SENTINEL_PATH_UNSAFE" });
      assert.deepEqual(readdirSync(other), []);
    } finally { cleanupTempDir(dir); cleanupTempDir(other); }
  });
});

describe("json adapter write guard (BEH-33)", () => {
  test("json board: sentinel blocks writes, leaves board files byte-identical, reads still work", async () => {
    const dir = jsonProject();
    try {
      const a = new JsonAdapter(dir);
      await a.init();
      const created = await a.create({ title: "x" });
      const before = readFileSync(join(dir, ".context-index/tasks/tasks.json"));
      writeSentinel(dir, "json", { project: PROJECT });
      assert.deepEqual(readFileSync(join(dir, ".context-index/tasks/tasks.json")), before);
      assert.deepEqual(Object.keys(JSON.parse(readFileSync(sentinelPath(dir, "json"), "utf8"))).sort(), ["migrated_at", "project", "reason", "schema", "target"]);
      await assert.rejects(a.create({ title: "y" }), (e) => e.code === "BOARD_READ_ONLY_MIGRATED" && /projects\/7/.test(e.message));
      const listed = await a.list({});
      assert.equal(listed.length, 1);
      assert.equal(listed[0].title, "x");
      assert.equal((await a.get(created.id)).title, "x");
    } finally { cleanupTempDir(dir); }
  });

  test("every mutating method is refused before touching storage; tasks.json stays byte-identical", async () => {
    const dir = jsonProject();
    try {
      const a = new JsonAdapter(dir);
      await a.init();
      const one = await a.create({ title: "one" });
      const two = await a.create({ title: "two" });
      const epic = await a.createEpic({ title: "epic" });
      const before = readFileSync(join(dir, ".context-index/tasks/tasks.json"));
      writeSentinel(dir, "json", { project: PROJECT });

      const attempts = {
        create: () => a.create({ title: "y" }),
        update: () => a.update(one.id, { title: "z" }),
        claim: () => a.claim(one.id, "agent-a"),
        release: () => a.release(one.id, "agent-a"),
        close: () => a.close(one.id, "done"),
        createEpic: () => a.createEpic({ title: "e2" }),
        updateEpic: () => a.updateEpic(epic.id, { title: "e3" }),
        addDependency: () => a.addDependency(one.id, two.id),
      };
      for (const [name, run] of Object.entries(attempts)) {
        await assert.rejects(run(), (e) => e.code === "BOARD_READ_ONLY_MIGRATED" && e.message.includes(PROJECT), name);
        assert.deepEqual(readFileSync(join(dir, ".context-index/tasks/tasks.json")), before, name);
      }
    } finally { cleanupTempDir(dir); }
  });

  test("the guard runs before input validation: invalid create input still reports BOARD_READ_ONLY_MIGRATED", async () => {
    const dir = jsonProject();
    try {
      const a = new JsonAdapter(dir);
      await a.init();
      writeSentinel(dir, "json", { project: PROJECT });
      await assert.rejects(a.create({}), { code: "BOARD_READ_ONLY_MIGRATED" });
    } finally { cleanupTempDir(dir); }
  });
});

describe("beads adapter write guard (BEH-33)", () => {
  // br is the external boundary: _runBr is stubbed so no real br is required,
  // and its call log proves the guard fires before any br invocation.
  function beadsAdapter(dir) {
    const calls = [];
    const adapter = new BeadsAdapter(dir, { checkBr: false, autoMigrate: false });
    adapter._runBr = (args) => {
      calls.push(args);
      if (args[0] === "list") {
        return JSON.stringify({
          issues: [
            { id: "br-1", external_ref: "issue-1", title: "seeded", status: "open", issue_type: "task", priority: 2 },
            { id: "br-2", external_ref: "epic-1", title: "seeded epic", status: "open", issue_type: "epic", priority: 2 },
          ],
        });
      }
      return "{}";
    };
    return { adapter, calls };
  }

  test("every mutating method throws BOARD_READ_ONLY_MIGRATED naming the project with zero br calls", async () => {
    const dir = createTempDir();
    try {
      mkdirSync(join(dir, ".beads"));
      writeSentinel(dir, "beads", { project: PROJECT });
      const { adapter, calls } = beadsAdapter(dir);
      const attempts = {
        create: () => adapter.create({ title: "y", type: "task", priority: 2 }),
        update: () => adapter.update("issue-1", { title: "z" }),
        claim: () => adapter.claim("issue-1", "agent-a"),
        release: () => adapter.release("issue-1", "agent-a"),
        close: () => adapter.close("issue-1", "done"),
        createEpic: () => adapter.createEpic({ title: "e2" }),
        updateEpic: () => adapter.updateEpic("epic-1", { title: "e3" }),
        addDependency: () => adapter.addDependency("issue-1", "issue-2"),
      };
      for (const [name, run] of Object.entries(attempts)) {
        await assert.rejects(run(), (e) => e.code === "BOARD_READ_ONLY_MIGRATED" && e.message.includes(PROJECT), name);
      }
      assert.deepEqual(calls, []);
    } finally { cleanupTempDir(dir); }
  });

  test("reads still work with the sentinel present", async () => {
    const dir = createTempDir();
    try {
      mkdirSync(join(dir, ".beads"));
      writeSentinel(dir, "beads", { project: PROJECT });
      const { adapter } = beadsAdapter(dir);
      const listed = await adapter.list({});
      assert.deepEqual(listed.map((i) => i.id), ["issue-1"]);
      assert.equal((await adapter.get("issue-1")).title, "seeded");
    } finally { cleanupTempDir(dir); }
  });

  test("a malformed beads sentinel blocks writes with zero br calls", async () => {
    const dir = createTempDir();
    try {
      writeRawSentinel(dir, "beads", "{not json");
      const { adapter, calls } = beadsAdapter(dir);
      await assert.rejects(adapter.create({ title: "y", type: "task", priority: 2 }), { code: "BOARD_READ_ONLY_MIGRATED" });
      assert.deepEqual(calls, []);
    } finally { cleanupTempDir(dir); }
  });

  for (const [label, seedSentinel] of [
    ["well-formed", (dir) => writeSentinel(dir, "beads", { project: PROJECT })],
    ["malformed", (dir) => writeRawSentinel(dir, "beads", "{not json")],
  ]) {
    test(`${label} sentinel: init()/list()/get() skip the legacy fold — no mutating br call, legacy files left in place`, async () => {
      const dir = createTempDir();
      try {
        mkdirSync(join(dir, ".beads"));
        mkdirSync(join(dir, ".context-index", "tasks"), { recursive: true });
        const mapPath = join(dir, ".context-index", "tasks", ".beads-map.json");
        const boardPath = join(dir, ".context-index", "tasks", "tasks.json");
        const mapBody = JSON.stringify({ "issue-1": { beadsId: "br-1", owner: "agent-a" } });
        const boardBody = JSON.stringify({ epics: [{ id: "epic-1", title: "legacy epic", status: "closed" }], issues: [] });
        writeFileSync(mapPath, mapBody);
        writeFileSync(boardPath, boardBody);
        seedSentinel(dir);

        const calls = [];
        const adapter = new BeadsAdapter(dir, { checkBr: false });
        adapter._runBr = (args) => {
          calls.push(args);
          if (args[0] === "list") {
            return JSON.stringify({ issues: [{ id: "br-1", title: "unmapped", status: "open", issue_type: "task", priority: 2 }] });
          }
          return "{}";
        };

        await adapter.init();
        const listed = await adapter.list({});
        assert.deepEqual(listed.map((i) => i.id), ["br-1"]);
        assert.equal((await adapter.get("br-1")).title, "unmapped");

        assert.deepEqual([...new Set(calls.map((c) => c[0]))], ["list"]);
        assert.equal(readFileSync(mapPath, "utf8"), mapBody);
        assert.equal(readFileSync(boardPath, "utf8"), boardBody);
        assert.deepEqual(readdirSync(join(dir, ".context-index", "tasks")).sort(), [".beads-map.json", "tasks.json"]);
      } finally { cleanupTempDir(dir); }
    });
  }
});

describe("file adapter (BEH-33, review RI-2)", () => {
  test("file adapter is unchanged: writes keep throwing BACKEND_READ_ONLY_DEPRECATED with a sentinel present", async () => {
    const dir = createTempDir();
    try {
      writeSentinel(dir, "file", { project: PROJECT });
      await assert.rejects(new FileAdapter(dir).create({ title: "y" }), { code: "BACKEND_READ_ONLY_DEPRECATED" });
    } finally { cleanupTempDir(dir); }
  });
});

describe("commitSentinel (migration BEH-8)", () => {
  test("commitSentinel: one pathspec-limited commit on beads-board, pre-staged files untouched, idempotent, never pushed", () => {
    const dir = beadsRepo();
    try {
      const beads = join(dir, ".beads");
      writeFileSync(join(beads, "staged.txt"), "s");
      git(["add", "--", "staged.txt"], beads);
      const mainHead = git(["rev-parse", "main"], dir);
      writeSentinel(dir, "beads", { project: PROJECT });
      const sentinelBytes = readFileSync(sentinelPath(dir, "beads"), "utf8");
      assert.equal(commitSentinel(dir).committed, true);
      assert.equal(git(["log", "-1", "--name-only", "--format="], beads), "adev-read-only.json");
      assert.equal(git(["log", "-1", "--format=%s"], beads), COMMIT_SUBJECT);
      assert.equal(git(["show", "HEAD:adev-read-only.json"], beads), sentinelBytes.trim());
      assert.equal(git(["diff", "--cached", "--name-only"], beads), "staged.txt");
      assert.equal(git(["rev-parse", "main"], dir), mainHead);
      assert.equal(git(["rev-list", "--count", "beads-board"], beads), "2");
      assert.equal(git(["remote"], beads), "");
      const head = git(["rev-parse", "HEAD"], beads);
      assert.deepEqual(commitSentinel(dir), { committed: false, alreadyCommitted: true });
      assert.equal(git(["rev-parse", "HEAD"], beads), head);
    } finally { cleanupTempDir(dir); }
  });

  test("commitSentinel refuses with MIGRATE_SENTINEL_COMMIT_FAILED: wrong branch, plain .beads/ (no commits / tracked on main), gitignored sentinel", () => {
    for (const setup of ["wrong-branch", "plain-dir", "plain-tracked", "ignored"]) {
      const plain = setup === "plain-dir" || setup === "plain-tracked";
      const dir = plain ? createTempDir() : beadsRepo();
      try {
        const beads = join(dir, ".beads");
        if (plain) {
          git(["init", "-q", "-b", "main"], dir);
          git(["config", "user.email", "t@t"], dir);
          git(["config", "user.name", "t"], dir);
          mkdirSync(beads);
        }
        if (setup === "plain-tracked") {
          writeFileSync(join(beads, "issues.jsonl"), "");
          git(["add", "--", ".beads/issues.jsonl"], dir);
          git(["commit", "-q", "-m", "board on main"], dir);
        }
        if (setup === "wrong-branch") git(["switch", "-q", "-c", "other"], beads);
        if (setup === "ignored") {
          writeFileSync(join(beads, ".gitignore"), "adev-read-only.json\n");
          git(["add", "--", ".gitignore"], beads);
          git(["commit", "-q", "-m", "ignore"], beads);
        }
        const headBefore = setup === "plain-dir" ? null : git(["rev-parse", "HEAD"], beads);
        writeSentinel(dir, "beads", { project: PROJECT });
        assert.throws(() => commitSentinel(dir), (e) =>
          e.code === "MIGRATE_SENTINEL_COMMIT_FAILED" &&
          e.message.includes(join(realpathSync(dir), ".beads", "adev-read-only.json")) &&
          e.message.includes("beads-board"), setup);
        if (setup === "plain-dir") assert.throws(() => git(["rev-parse", "HEAD"], dir), setup);
        else assert.equal(git(["rev-parse", "HEAD"], beads), headBefore, setup);
        assert.equal(git(["ls-files", "--", "adev-read-only.json"], beads), "", setup);
        assert.equal(existsSync(sentinelPath(dir, "beads")), true, setup);
      } finally { cleanupTempDir(dir); }
    }
  });

  test("plain .beads/ refusal names the topology and the board-migrate remedy", () => {
    const dir = createTempDir();
    try {
      git(["init", "-q", "-b", "main"], dir);
      mkdirSync(join(dir, ".beads"));
      writeSentinel(dir, "beads", { project: PROJECT });
      assert.throws(() => commitSentinel(dir), (e) =>
        e.code === "MIGRATE_SENTINEL_COMMIT_FAILED" && e.message.includes("adev issues board migrate"));
    } finally { cleanupTempDir(dir); }
  });

  test("the hand-commit hint quotes the .beads/ path so it survives spaces", () => {
    const dir = beadsRepo();
    try {
      git(["switch", "-q", "-c", "other"], join(dir, ".beads"));
      writeSentinel(dir, "beads", { project: PROJECT });
      assert.throws(() => commitSentinel(dir), (e) =>
        e.code === "MIGRATE_SENTINEL_COMMIT_FAILED" &&
        e.message.includes(`cd "${join(realpathSync(dir), ".beads")}"`) &&
        e.message.includes(`git add -- "adev-read-only.json"`));
    } finally { cleanupTempDir(dir); }
  });

  test("inherited GIT_DIR / GIT_WORK_TREE / GIT_INDEX_FILE / GIT_COMMON_DIR do not redirect the commit", () => {
    const dir = beadsRepo();
    const decoy = createTempDir();
    const saved = {};
    const keys = ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"];
    try {
      git(["init", "-q", "-b", "main"], decoy);
      const decoyGit = join(decoy, ".git");
      for (const k of keys) saved[k] = process.env[k];
      writeSentinel(dir, "beads", { project: PROJECT });
      process.env.GIT_DIR = decoyGit;
      process.env.GIT_WORK_TREE = decoy;
      process.env.GIT_INDEX_FILE = join(decoyGit, "index");
      process.env.GIT_COMMON_DIR = decoyGit;
      const result = commitSentinel(dir);
      for (const k of keys) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
      assert.equal(result.committed, true);
      assert.equal(git(["log", "-1", "--format=%s"], join(dir, ".beads")), COMMIT_SUBJECT);
      assert.throws(() => git(["rev-parse", "HEAD"], decoy));
    } finally {
      for (const k of keys) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
      cleanupTempDir(dir);
      cleanupTempDir(decoy);
    }
  });
});

describe("no sentinel behind a symlinked board directory (never-migrated board)", () => {
  test(".beads symlinked outside the root with no sentinel: readSentinel is null, assertWritable returns, list() works", async () => {
    const dir = createTempDir();
    const other = createTempDir();
    try {
      symlinkSync(other, join(dir, ".beads"));
      assert.equal(readSentinel(dir, "beads"), null);
      assert.equal(assertWritable(dir, "beads"), undefined);
      const calls = [];
      const adapter = new BeadsAdapter(dir, { checkBr: false });
      adapter._runBr = (args) => {
        calls.push(args);
        return JSON.stringify({ issues: [{ id: "br-1", external_ref: "issue-1", title: "live", status: "open", issue_type: "task", priority: 2 }] });
      };
      assert.deepEqual((await adapter.list({})).map((i) => i.id), ["issue-1"]);
      await adapter.create({ title: "new", type: "task", priority: 2 });
      assert.equal(calls.some((c) => c[0] === "create"), true);
    } finally { cleanupTempDir(dir); cleanupTempDir(other); }
  });

  test(".context-index/tasks symlinked outside the root with no sentinel: readSentinel is null and assertWritable returns", () => {
    const dir = createTempDir();
    const other = createTempDir();
    try {
      mkdirSync(join(dir, ".context-index"));
      symlinkSync(other, join(dir, ".context-index", "tasks"));
      assert.equal(readSentinel(dir, "json"), null);
      assert.equal(assertWritable(dir, "json"), undefined);
    } finally { cleanupTempDir(dir); cleanupTempDir(other); }
  });

  test("missing parent directory: readSentinel is null", () => {
    const dir = createTempDir();
    try {
      assert.equal(readSentinel(dir, "json"), null);
      assert.equal(readSentinel(dir, "beads"), null);
    } finally { cleanupTempDir(dir); }
  });
});
