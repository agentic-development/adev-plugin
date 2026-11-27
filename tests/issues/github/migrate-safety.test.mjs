import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { performance } from "node:perf_hooks";
import { PassThrough } from "node:stream";
import { run, manifestUpdateSuggestion, readStdinLine, isInteractiveTerminal } from "../../../lib/cli/issues-migrate.mjs";
import { GithubAdapter } from "../../../lib/issues/github-adapter.mjs";
import { JsonAdapter } from "../../../lib/issues/json-adapter.mjs";
import { writeSentinel, sentinelPath, assertWritable } from "../../../lib/issues/read-only-sentinel.mjs";
import { resolveStorageRoot } from "../../../lib/issues/resolve-root.mjs";
import { createTempDir, cleanupTempDir } from "../../helpers.mjs";
import { replayExec } from "./replay-transport.mjs";
import { writes } from "./fixtures/writes.mjs";
import {
  migrateFx, seedJsonBoard, seedBeadsBoard, rateLimited, rateLimitedCreate, projectTitled, resetIso,
  CLOCK_BASE, BEADS_LIST, PROJECT, ENV_TOKEN,
} from "./fixtures/migrate.mjs";

const STATE = ".context-index/tasks/.migrate-state.json";
const UNANCHORED = ".context-index/tasks/.migrate-unanchored.json";
const JSON_SENTINEL_REL = ".context-index/tasks/board-read-only.json";
const BEADS_SENTINEL_REL = ".beads/adev-read-only.json";
const ID_LINES = ["e1 → gh-101", "e1.f1 → gh-102", "issue-7k3f9a → gh-103"];
const SUGGESTION = manifestUpdateSuggestion("github");

// Any code path that ignores the injected exec would spawn `gh` from PATH, and a
// beads source is read through `br`. Stubs first on PATH record a `gh` spawn and
// fail like an unauthenticated `gh`; the `br` stub serves BEADS_LIST to `br list`
// and records any other call. The tokens are removed, so nothing reaches GitHub.
let guard;
before(() => {
  const dir = createTempDir();
  const bin = join(dir, "bin");
  const ghLog = join(dir, "gh-calls.log");
  const brLog = join(dir, "br-unexpected.log");
  const brList = join(dir, "br-list.json");
  mkdirSync(bin);
  writeFileSync(brList, BEADS_LIST);
  writeFileSync(join(bin, "gh"), `#!/bin/sh\necho "$*" >> "${ghLog}"\necho "gh auth login" >&2\nexit 4\n`);
  writeFileSync(
    join(bin, "br"),
    `#!/bin/sh\ncase " $* " in\n  " --version ") echo "br 0.2.22" ;;\n  *" list -s all --json "*) cat "${brList}" ;;\n  *) echo "$*" >> "${brLog}"; echo "adev-fixture: unexpected br call" >&2; exit 1 ;;\nesac\n`,
  );
  chmodSync(join(bin, "gh"), 0o755);
  chmodSync(join(bin, "br"), 0o755);
  guard = { dir, ghLog, brLog, path: process.env.PATH, gh: process.env.GH_TOKEN, github: process.env.GITHUB_TOKEN };
  process.env.PATH = `${bin}${delimiter}${process.env.PATH ?? ""}`;
  delete process.env.GH_TOKEN;
  delete process.env.GITHUB_TOKEN;
});
after(() => {
  process.env.PATH = guard.path;
  if (guard.gh !== undefined) process.env.GH_TOKEN = guard.gh;
  if (guard.github !== undefined) process.env.GITHUB_TOKEN = guard.github;
  const ghSpawned = existsSync(guard.ghLog);
  const brWrites = existsSync(guard.brLog) ? readFileSync(guard.brLog, "utf8") : "";
  cleanupTempDir(guard.dir);
  assert.equal(ghSpawned, false, "a migration spawned gh instead of using the injected exec");
  assert.equal(brWrites, "", "a migration made a br call other than reading the board");
});

const git = (args, cwd) => execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8", stdio: "pipe" }).trim();

/** A clock that only moves when the injected sleep is awaited. */
function makeClock() {
  const clock = { t: CLOCK_BASE, sleeps: [] };
  clock.now = () => clock.t;
  clock.sleep = async (ms) => {
    clock.sleeps.push(ms);
    clock.t += Math.max(0, ms);
  };
  return clock;
}

const isMutationDoc = (query) => query.trimStart().startsWith("mutation");

/**
 * Run the verb with every seam injected. `answers` feeds readLine (exhausted: null,
 * i.e. EOF); `wrap(exec)` may wrap the replay exec. stderr is captured from console.error.
 */
async function migrate(dir, manifest, argv, fx, { isTTY = false, answers = [], clock = makeClock(), wrap, projectRoot = dir } = {}) {
  const out = [];
  const err = [];
  const readLineAt = [];
  const mutationTimes = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const base = replayExec(fx);
  const timed = (cmd, args, opts) => {
    if (isMutationDoc(JSON.parse(opts.input).query)) mutationTimes.push(clock.t);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      return base(cmd, args, opts);
    } finally {
      inFlight -= 1;
    }
  };
  timed.calls = base.calls;
  const exec = wrap ? wrap(timed) : timed;
  const readLine = async () => {
    readLineAt.push(err.length);
    return answers.length > 0 ? answers.shift() : null;
  };
  const origErr = console.error;
  const origLog = console.log;
  console.error = (...a) => err.push(a.map(String).join(" "));
  console.log = () => {};
  try {
    const code = await run({ projectRoot, argv, manifest, exec, isTTY, readLine, sleep: clock.sleep, now: clock.now, log: (s) => out.push(s) });
    return { code, exec: base, stdout: out.join(""), stderr: err, readLineAt, clock, mutationTimes, maxInFlight: () => maxInFlight };
  } finally {
    console.error = origErr;
    console.log = origLog;
  }
}

const mutations = (exec) => exec.calls.filter((c) => isMutationDoc(c.query)).map((c) => [c.operation, c.variables]);
const ops = (exec, name) => exec.calls.filter((c) => c.operation === name);
const linesWith = (r, prefix) => r.stderr.filter((l) => l.startsWith(prefix));
const all = (r) => `${r.stdout}\n${r.stderr.join("\n")}`;
const longWaits = (r) => r.clock.sleeps.filter((ms) => ms > 1000);

const WRITE_SET = /^write set\b/;
/** The write-set block: its header line up to the prompt, a stop code, or the success summary. */
function writeSet(r) {
  const headers = r.stderr.filter((l) => WRITE_SET.test(l));
  assert.equal(headers.length, 1, `the write set is printed exactly once:\n${r.stderr.join("\n")}`);
  const at = r.stderr.findIndex((l) => WRITE_SET.test(l));
  let end = r.stderr.findIndex((l, i) => i > at && /^(Proceed\?|[A-Z][A-Z_]+:|\S+ → gh-)/.test(l));
  if (end === -1) end = r.stderr.length;
  return { at, end, text: r.stderr.slice(at, end).join("\n") };
}
const lineOf = (text, ...needles) => text.split("\n").find((l) => needles.every((n) => (n instanceof RegExp ? n.test(l) : l.includes(n))));

function snapshot(dir) {
  const files = {};
  for (const name of readdirSync(dir)) files[name] = readFileSync(join(dir, name));
  return files;
}
const tasksDir = (root) => join(root, ".context-index", "tasks");

async function withBoard(fn) {
  const dir = createTempDir();
  try {
    return await fn(dir, await seedJsonBoard(dir));
  } finally {
    cleanupTempDir(dir);
  }
}

/** A json board committed on `main` of a fresh git repo. */
async function withJsonRepo(fn) {
  const dir = createTempDir();
  try {
    git(["init", "-q", "-b", "main"], dir);
    git(["config", "user.email", "fixture@example.invalid"], dir);
    git(["config", "user.name", "adev-fixture"], dir);
    const manifest = await seedJsonBoard(dir);
    git(["add", "--", ".context-index"], dir);
    git(["commit", "-q", "-m", "board"], dir);
    return await fn(dir, manifest);
  } finally {
    cleanupTempDir(dir);
  }
}

async function withBeadsBoard(fn) {
  const dir = createTempDir();
  try {
    return await fn(dir, seedBeadsBoard(dir));
  } finally {
    cleanupTempDir(dir);
  }
}

// ---------------------------------------------------------------------------
// Dry run (GitHub spec BEH-31; amendment BEH-7)
// ---------------------------------------------------------------------------

test("--dry-run: no mutation, no local write, no commit, no prompt; the report adds the github object", async () => {
  await withJsonRepo(async (dir, manifest) => {
    const head = git(["rev-parse", "HEAD"], dir);
    const before = snapshot(tasksDir(dir));
    const r = await migrate(dir, manifest, ["--to", "github", "--dry-run"], migrateFx.freshPublicRepo, { isTTY: true, answers: ["y"] });
    assert.equal(r.code, 0, r.stderr.join("\n"));
    assert.deepEqual(mutations(r.exec), []);
    assert.deepEqual(r.readLineAt, [], "a dry run asks for no confirmation");
    assert.deepEqual(snapshot(tasksDir(dir)), before, "no state file, no sentinel, no board change");
    assert.equal(git(["rev-parse", "HEAD"], dir), head);
    assert.equal(r.stderr.some((l) => l.startsWith("resuming:")), false, "no state file, no progress line");
    const report = JSON.parse(r.stdout);
    const { estimated_requests: estimated, ...github } = report.github;
    assert.deepEqual({ ...report, github }, {
      source: "json",
      target: "github",
      in_scope: { issues: 2, epics: 1 },
      already_migrated: 0,
      would_create: { issues: 2, epics: 1 },
      dependencies_to_replay: 1,
      github: {
        project: PROJECT,
        repository: "acme/board",
        visibility: { project: "private", repository: "public" },
        would_create_ids: ["e1", "e1.f1", "issue-7k3f9a"],
        parent_links_to_replay: 1,
        would_publish: { titles: 3, notes: 1 },
      },
    });
    // estimated_requests = one preflight + one board-read page + the mutations the live run makes.
    const live = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.fresh);
    assert.equal(live.code, 0, live.stderr.join("\n"));
    assert.equal(mutations(live.exec).length, 14);
    assert.equal(estimated, 2 + mutations(live.exec).length);
  });
});

test("--dry-run with a state file: prints the resuming line, counts already_migrated by legacy_id, leaves the state file as it was", async () => {
  await withBoard(async (dir, manifest) => {
    await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.failsAtItem2);
    const state = readFileSync(join(dir, STATE));
    const r = await migrate(dir, manifest, ["--to", "github", "--dry-run"], migrateFx.resumeFromItem2);
    assert.equal(r.code, 0, r.stderr.join("\n"));
    assert.deepEqual(mutations(r.exec), []);
    assert.deepEqual(r.stderr.filter((l) => l.startsWith("resuming:")), ["resuming: 1 of 3 already migrated"]);
    assert.deepEqual(readFileSync(join(dir, STATE)), state);
    assert.equal(existsSync(join(dir, UNANCHORED)), false);
    assert.equal(existsSync(sentinelPath(dir, "json")), false);
    const report = JSON.parse(r.stdout);
    assert.equal(report.already_migrated, 1);
    assert.deepEqual(report.github.would_create_ids, ["e1.f1", "issue-7k3f9a"]);
    assert.equal(report.github.parent_links_to_replay, 1);
    assert.deepEqual(report.github.would_publish, { titles: 2, notes: 1 });
    const live = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.resumeFromItem2);
    assert.equal(live.code, 0, live.stderr.join("\n"));
    assert.equal(report.github.estimated_requests, 2 + mutations(live.exec).length);
  });
});

// ---------------------------------------------------------------------------
// Confirmation (GitHub spec BEH-41; amendment BEH-3)
// ---------------------------------------------------------------------------

test("non-interactive without --yes: exit 1, MIGRATE_CONFIRMATION_REQUIRED naming --yes, nothing written; --auto (even on a TTY) is non-interactive and never implies --yes", async () => {
  for (const [argv, isTTY] of [[["--to", "github"], false], [["--to", "github", "--auto"], false], [["--to", "github", "--auto"], true]]) {
    await withBoard(async (dir, manifest) => {
      const r = await migrate(dir, manifest, argv, migrateFx.fresh, { isTTY, answers: ["y"] });
      assert.equal(r.code, 1, argv.join(" "));
      const lines = linesWith(r, "MIGRATE_CONFIRMATION_REQUIRED");
      assert.equal(lines.length, 1, r.stderr.join("\n"));
      assert.match(lines[0], /--yes/);
      assert.deepEqual(r.readLineAt, [], `${argv.join(" ")} isTTY=${isTTY} must not prompt`);
      assert.deepEqual(mutations(r.exec), []);
      assert.equal(existsSync(join(dir, STATE)), false);
      assert.equal(existsSync(sentinelPath(dir, "json")), false);
      writeSet(r);
    });
  }
});

test("interactive: the write set once, then `Proceed? [y/N] ` on stderr and one readLine; only y/yes (trimmed, any case) proceeds", async () => {
  for (const answer of ["n", "", "no", "yes please", "yy", null]) {
    await withBoard(async (dir, manifest) => {
      const r = await migrate(dir, manifest, ["--to", "github"], migrateFx.fresh, { isTTY: true, answers: [answer] });
      assert.equal(r.code, 1, `answer ${JSON.stringify(answer)}`);
      assert.equal(linesWith(r, "MIGRATE_CONFIRMATION_REQUIRED").length, 1, r.stderr.join("\n"));
      assert.equal(r.readLineAt.length, 1);
      assert.deepEqual(mutations(r.exec), []);
      assert.equal(existsSync(join(dir, STATE)), false);
      assert.equal(existsSync(sentinelPath(dir, "json")), false);
    });
  }
  for (const answer of ["y", "Y", "yes", " YES "]) {
    await withBoard(async (dir, manifest) => {
      const r = await migrate(dir, manifest, ["--to", "github"], migrateFx.fresh, { isTTY: true, answers: [answer] });
      assert.equal(r.code, 0, `answer ${JSON.stringify(answer)}: ${r.stderr.join("\n")}`);
      assert.equal(r.readLineAt.length, 1);
      const ws = writeSet(r);
      const prompt = r.stderr.findIndex((l) => l.startsWith("Proceed? [y/N]"));
      assert.equal(r.stderr.filter((l) => l.startsWith("Proceed? [y/N]")).length, 1);
      assert.ok(ws.at < prompt, "the write set comes before the prompt");
      assert.equal(r.readLineAt[0], prompt + 1, "readLine is awaited right after the prompt");
      assert.equal(mutations(r.exec).length, 14);
    });
  }
});

test("write set (json source): project and repository with their visibility, item/link counts, titles and notes to publish, the sentinel it will create", async () => {
  await withBoard(async (dir, manifest) => {
    const r = await migrate(dir, manifest, ["--to", "github"], migrateFx.freshPublicRepo, { isTTY: true, answers: ["y"] });
    assert.equal(r.code, 0, r.stderr.join("\n"));
    const { text } = writeSet(r);
    assert.ok(lineOf(text, PROJECT, /\bprivate\b/), `project and its visibility:\n${text}`);
    assert.ok(lineOf(text, "acme/board", /\bpublic\b/), `repository and its visibility:\n${text}`);
    assert.match(text, /\b3 items? to create\b/);
    assert.match(text, /\b0 items? already migrated\b/);
    assert.match(text, /\b2 links? to replay\b/);
    assert.match(text, /\b3 titles?\b/);
    assert.match(text, /\b1 notes?\b/);
    assert.ok(lineOf(text, JSON_SENTINEL_REL), `the sentinel path:\n${text}`);
    assert.equal(/beads-board/.test(text), false, "a json source makes no commit");
  });
});

test("write set (beads source): names .beads/adev-read-only.json, the commit on beads-board, and that --yes covers that commit and its hooks", async () => {
  await withBeadsBoard(async (dir, manifest) => {
    const r = await migrate(dir, manifest, ["--to", "github"], migrateFx.beadsFresh, { isTTY: true, answers: ["y"] });
    assert.equal(r.code, 0, r.stderr.join("\n"));
    const { text } = writeSet(r);
    assert.match(text, /\b1 items? to create\b/);
    assert.match(text, /\b0 links? to replay\b/);
    assert.ok(lineOf(text, BEADS_SENTINEL_REL), `the sentinel path:\n${text}`);
    assert.ok(lineOf(text, /\bcommit/, "beads-board"), `the beads-board commit:\n${text}`);
    assert.ok(lineOf(text, "--yes", /\bcommit/), `--yes covers the commit:\n${text}`);
    assert.match(text, /\bhooks?\b/, "--yes also covers the repository's commit hooks");
  });
});

test("resume with work left and this project's sentinel on disk: the write set says it is present and unchanged; the sentinel stays byte-identical", async () => {
  await withBoard(async (dir, manifest) => {
    await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.failsAtItem2);
    writeSentinel(dir, "json", { project: PROJECT });
    const sentinel = readFileSync(sentinelPath(dir, "json"));
    const r = await migrate(dir, manifest, ["--to", "github"], migrateFx.resumeFromItem2, { isTTY: true, answers: ["y"] });
    assert.equal(r.code, 0, r.stderr.join("\n"));
    assert.ok(lineOf(writeSet(r).text, /\bpresent\b/, /\bunchanged\b/), r.stderr.join("\n"));
    assert.deepEqual(readFileSync(sentinelPath(dir, "json")), sentinel);
  });
});

test("nothing left to do, sentinel present: exit 0 with no write set, no prompt, no mutation; the sentinel stays byte-identical and the summary reports it pre-existing", async () => {
  for (const isTTY of [false, true]) {
    await withBoard(async (dir, manifest) => {
      writeSentinel(dir, "json", { project: PROJECT });
      const sentinel = readFileSync(sentinelPath(dir, "json"));
      const r = await migrate(dir, manifest, ["--to", "github"], migrateFx.allPresent, { isTTY, answers: ["n"] });
      assert.equal(r.code, 0, r.stderr.join("\n"));
      assert.deepEqual(r.readLineAt, []);
      assert.equal(r.stderr.some((l) => WRITE_SET.test(l)), false);
      assert.deepEqual(mutations(r.exec), []);
      assert.deepEqual(readFileSync(sentinelPath(dir, "json")), sentinel);
      assert.equal(r.stderr.at(-1), SUGGESTION);
      const sentinelLine = r.stderr.at(-2);
      assert.ok(sentinelLine.includes(JSON_SENTINEL_REL) && sentinelLine.includes(PROJECT) && /pre-existing/i.test(sentinelLine), sentinelLine);
    });
  }
});

test("nothing left to do, beads sentinel present but uncommitted: committed without a prompt (the file is the earlier run's consent)", async () => {
  await withBeadsBoard(async (dir, manifest) => {
    const root = resolveStorageRoot(manifest, dir);
    writeSentinel(root, "beads", { project: PROJECT });
    const sentinel = readFileSync(sentinelPath(root, "beads"));
    const beads = join(dir, ".beads");
    const count = Number(git(["rev-list", "--count", "HEAD"], beads));
    const r = await migrate(dir, manifest, ["--to", "github"], migrateFx.beadsAllPresent);
    assert.equal(r.code, 0, r.stderr.join("\n"));
    assert.deepEqual(r.readLineAt, []);
    assert.deepEqual(mutations(r.exec), []);
    assert.equal(Number(git(["rev-list", "--count", "HEAD"], beads)), count + 1);
    assert.equal(git(["show", "--name-only", "--format=", "HEAD"], beads), "adev-read-only.json");
    assert.deepEqual(readFileSync(sentinelPath(root, "beads")), sentinel);
  });
});

test("nothing left to do, sentinel absent: the write set shows zero items and links and names the sentinel; non-interactive without --yes refuses, --yes writes it", async () => {
  await withBoard(async (dir, manifest) => {
    let r = await migrate(dir, manifest, ["--to", "github"], migrateFx.allPresent);
    assert.equal(r.code, 1);
    assert.equal(linesWith(r, "MIGRATE_CONFIRMATION_REQUIRED").length, 1, r.stderr.join("\n"));
    assert.equal(existsSync(sentinelPath(dir, "json")), false);
    const { text } = writeSet(r);
    assert.match(text, /\b0 items? to create\b/);
    assert.match(text, /\b3 items? already migrated\b/);
    assert.match(text, /\b0 links? to replay\b/);
    assert.ok(lineOf(text, JSON_SENTINEL_REL), text);

    r = await migrate(dir, manifest, ["--to", "github"], migrateFx.allPresent, { isTTY: true, answers: ["n"] });
    assert.equal(r.code, 1);
    assert.equal(existsSync(sentinelPath(dir, "json")), false, "a declined interactive run writes nothing");

    r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.allPresent);
    assert.equal(r.code, 0, r.stderr.join("\n"));
    assert.deepEqual(mutations(r.exec), []);
    assert.equal(lstatSync(sentinelPath(dir, "json")).isFile(), true);
  });
});

// ---------------------------------------------------------------------------
// Progress line (amendment BEH-4)
// ---------------------------------------------------------------------------

test("progress line: an agreeing state file prints `resuming: N of M` before the write set and no warning", async () => {
  await withBoard(async (dir, manifest) => {
    await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.failsAtItem2);
    assert.equal(JSON.parse(readFileSync(join(dir, STATE), "utf8")).last_successful_index, 0);
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.resumeFromItem2);
    assert.equal(r.code, 0, r.stderr.join("\n"));
    const at = r.stderr.indexOf("resuming: 1 of 3 already migrated");
    assert.notEqual(at, -1, r.stderr.join("\n"));
    assert.ok(at < writeSet(r).at);
    assert.equal(r.stderr.some((l) => l.startsWith("warning:")), false);
  });
});

test("progress line: a state file that disagrees with the board's legacy_id count warns, then the board decides; same mutations as with no state file", async () => {
  const seqs = [];
  for (const withState of [true, false]) {
    await withBoard(async (dir, manifest) => {
      await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.partialCreateAtItem2);
      if (withState) {
        writeFileSync(join(dir, STATE), JSON.stringify({ source: "json", target: "github", last_successful_index: 0, scope_args: { includeClosed: false } }));
      } else {
        rmSync(join(dir, STATE), { force: true });
      }
      const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.finishPartialAtItem2);
      assert.equal(r.code, 0, r.stderr.join("\n"));
      if (withState) {
        const at = r.stderr.indexOf("resuming: 1 of 3 already migrated");
        assert.notEqual(at, -1, r.stderr.join("\n"));
        assert.equal(r.stderr[at + 1], "warning: .migrate-state.json records 1 of 3 migrated but the target board holds 2; the target board decides what is skipped");
        assert.ok(at + 1 < writeSet(r).at);
      } else {
        assert.equal(r.stderr.some((l) => l.startsWith("resuming:") || l.startsWith("warning:")), false);
      }
      seqs.push(mutations(r.exec));
    });
  }
  assert.deepEqual(seqs[0], seqs[1]);
});

// ---------------------------------------------------------------------------
// Pacing and rate-limit waits (GitHub spec BEH-35; amendment BEH-9)
// ---------------------------------------------------------------------------

test("pacing: consecutive mutations at least 1000 ms apart on the injected clock, one at a time, with no real waiting", async () => {
  await withBoard(async (dir, manifest) => {
    const started = performance.now();
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.fresh);
    const elapsed = performance.now() - started;
    assert.equal(r.code, 0, r.stderr.join("\n"));
    assert.equal(r.mutationTimes.length, 14);
    const gaps = r.mutationTimes.slice(1).map((t, i) => t - r.mutationTimes[i]);
    assert.deepEqual(gaps.filter((g) => g < 1000), [], `mutation gaps: ${gaps.join(", ")}`);
    assert.equal(r.maxInFlight(), 1);
    assert.ok(r.clock.sleeps.length > 0, "the spacing waits go through the injected sleep");
    assert.ok(elapsed < 1000, `real time ${elapsed} ms`);
  });
});

test("pacing: a rate limit on AddToProject mid-item is waited out and the identical request re-issued; the item completes", async () => {
  await withBoard(async (dir, manifest) => {
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], rateLimited(120_000));
    assert.equal(r.code, 0, r.stderr.join("\n"));
    const adds = ops(r.exec, "AddToProject").filter((c) => c.variables.contentId === "I_fixture_101");
    assert.equal(adds.length, 2);
    assert.deepEqual(adds[1].variables, adds[0].variables);
    assert.equal(longWaits(r).length, 1);
    const report = JSON.parse(r.stdout);
    assert.deepEqual(report.errors, []);
    assert.equal(report.github.id_map.e1, "gh-101");
    assert.equal(all(r).includes("GITHUB_PARTIAL_CREATE"), false);
    assert.ok(r.clock.t >= CLOCK_BASE + 120_000, "the clock reached the reset time");
  });
});

test("an adapter built without pace (every non-migration caller) throws GITHUB_RATE_LIMITED on the first limit and never sleeps", async () => {
  const clock = makeClock();
  const exec = replayExec(writes.createRateLimited);
  const manifest = { tasks: { backend: "github", github: { project: PROJECT, repo: "acme/board" } } };
  const adapter = new GithubAdapter("/tmp/unused", manifest, { exec, now: clock.now, sleep: clock.sleep });
  await assert.rejects(adapter.create({ title: "adev-fixture: limited" }), { code: "GITHUB_RATE_LIMITED" });
  assert.equal(ops(exec, "CreateIssue").length, 1);
  assert.deepEqual(clock.sleeps, []);
});

test("rate-limit bounds: a reset at most 5 minutes away is waited; 15 minutes of cumulative waiting is still within bounds", async () => {
  for (const resets of [[300_000], [300_000, 600_000, 900_000]]) {
    await withBoard(async (dir, manifest) => {
      const r = await migrate(dir, manifest, ["--to", "github", "--yes"], rateLimitedCreate(resets, { recovers: true }));
      assert.equal(r.code, 0, `${resets}: ${r.stderr.join("\n")}`);
      assert.equal(ops(r.exec, "CreateIssue").filter((c) => c.variables.title.endsWith("epic one")).length, resets.length + 1);
      assert.equal(longWaits(r).length, resets.length);
      assert.ok(r.clock.t >= CLOCK_BASE + resets.at(-1));
    });
  }
});

/** The BEH-5 envelope for a rate-limit stop at e1. */
function assertRateLimitStop(r, resetAt) {
  assert.equal(r.code, 1, r.stderr.join("\n"));
  const report = JSON.parse(r.stdout);
  assert.equal(report.manifest_update_suggested, false);
  assert.equal(report.errors.length, 1);
  const [entry] = report.errors;
  assert.deepEqual(Object.keys(entry).sort(), ["code", "message", "reset_at", "source_id"]);
  assert.equal(entry.source_id, "e1");
  assert.equal(entry.code, "GITHUB_RATE_LIMITED");
  assert.equal(typeof entry.message, "string");
  assert.equal(entry.reset_at, resetAt);
  assert.equal(linesWith(r, "MIGRATE_PARTIAL_FAILURE:").length, 1);
}

test("rate-limit bounds: the 6th wait stops the run with the envelope, under --auto too", async () => {
  const resets = [60_000, 120_000, 180_000, 240_000, 300_000, 360_000];
  for (const argv of [["--to", "github", "--yes"], ["--to", "github", "--yes", "--auto"]]) {
    await withBoard(async (dir, manifest) => {
      const r = await migrate(dir, manifest, argv, rateLimitedCreate(resets));
      assertRateLimitStop(r, resetIso(360_000));
      assert.equal(ops(r.exec, "CreateIssue").length, 6);
      assert.equal(longWaits(r).length, 5);
      assert.equal(existsSync(sentinelPath(dir, "json")), false);
    });
  }
});

test("rate-limit bounds: cumulative waiting past 15 minutes stops the run", async () => {
  await withBoard(async (dir, manifest) => {
    const r = await migrate(dir, manifest, ["--to", "github", "--yes", "--auto"], rateLimitedCreate([240_000, 480_000, 720_000, 960_000]));
    assertRateLimitStop(r, resetIso(960_000));
    assert.equal(ops(r.exec, "CreateIssue").length, 4);
    assert.equal(longWaits(r).length, 3);
  });
});

test("rate-limit bounds: a reset more than 5 minutes away, or none at all, stops at once without waiting", async () => {
  for (const [reset, resetAt] of [[301_001, resetIso(301_001)], [null, null]]) {
    await withBoard(async (dir, manifest) => {
      const r = await migrate(dir, manifest, ["--to", "github", "--yes"], rateLimitedCreate([reset]));
      assertRateLimitStop(r, resetAt);
      assert.equal(ops(r.exec, "CreateIssue").length, 1);
      assert.deepEqual(longWaits(r), []);
    });
  }
});

test("rate-limit bounds: a stop after the issue exists is GITHUB_PARTIAL_CREATE and the entry carries reset_at", async () => {
  await withBoard(async (dir, manifest) => {
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], rateLimited(400_000));
    assert.equal(r.code, 1, r.stderr.join("\n"));
    const [entry] = JSON.parse(r.stdout).errors;
    assert.equal(entry.code, "GITHUB_PARTIAL_CREATE");
    assert.equal(entry.source_id, "e1");
    assert.equal(entry.target_id, "gh-101");
    assert.equal(entry.reset_at, resetIso(400_000));
    assert.deepEqual(longWaits(r), []);
  });
});

// ---------------------------------------------------------------------------
// Success (GitHub spec BEH-32, BEH-33; amendment BEH-8)
// ---------------------------------------------------------------------------

test("success, json source: five-key sentinel, board files untouched, report with sentinel_path and id_map, summary then suggestion last, no commit, state removed", async () => {
  await withJsonRepo(async (dir, manifest) => {
    const head = git(["rev-parse", "HEAD"], dir);
    const before = snapshot(tasksDir(dir));
    const manifestBytes = readFileSync(join(dir, ".context-index", "manifest.yaml"));
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.fresh);
    assert.equal(r.code, 0, r.stderr.join("\n"));

    const doc = JSON.parse(readFileSync(sentinelPath(dir, "json"), "utf8"));
    assert.deepEqual(Object.keys(doc).sort(), ["migrated_at", "project", "reason", "schema", "target"]);
    assert.deepEqual({ ...doc, migrated_at: undefined }, { schema: 1, reason: "migrated", target: "github", project: PROJECT, migrated_at: undefined });
    const afterFiles = snapshot(tasksDir(dir));
    for (const [name, bytes] of Object.entries(before)) assert.deepEqual(afterFiles[name], bytes, name);
    assert.deepEqual(Object.keys(afterFiles).sort(), [...Object.keys(before), "board-read-only.json"].sort(), "the state file is gone");
    assert.deepEqual(readFileSync(join(dir, ".context-index", "manifest.yaml")), manifestBytes);

    const report = JSON.parse(r.stdout);
    assert.deepEqual(report.errors, []);
    assert.equal(report.manifest_update_suggested, true);
    assert.deepEqual(report.github, {
      project: PROJECT,
      sentinel_path: JSON_SENTINEL_REL,
      id_map: { e1: "gh-101", "e1.f1": "gh-102", "issue-7k3f9a": "gh-103" },
    });

    assert.deepEqual(r.stderr.slice(-5, -2), ID_LINES);
    const sentinelLine = r.stderr.at(-2);
    assert.ok(sentinelLine.includes(JSON_SENTINEL_REL) && /\bcommit\b/.test(sentinelLine) && sentinelLine.includes("branch that carries the board"), sentinelLine);
    assert.equal(r.stderr.at(-1), SUGGESTION);
    assert.equal(git(["rev-parse", "HEAD"], dir), head, "a json source makes no commit");
  });
});

test("success never writes manifest.yaml, with or without --auto", async () => {
  await withBoard(async (dir, manifest) => {
    const manifestBytes = readFileSync(join(dir, ".context-index", "manifest.yaml"));
    const r = await migrate(dir, manifest, ["--to", "github", "--yes", "--auto"], migrateFx.fresh);
    assert.equal(r.code, 0, r.stderr.join("\n"));
    assert.equal(existsSync(sentinelPath(dir, "json")), true);
    assert.deepEqual(readFileSync(join(dir, ".context-index", "manifest.yaml")), manifestBytes);
    assert.equal(r.stderr.at(-1), SUGGESTION);
  });
});

test("success from a linked worktree: the sentinel lands in the main checkout's storage root", async () => {
  await withJsonRepo(async (dir, manifest) => {
    git(["worktree", "add", "-q", "wt"], dir);
    const wt = join(dir, "wt");
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.fresh, { projectRoot: wt });
    assert.equal(r.code, 0, r.stderr.join("\n"));
    assert.equal(lstatSync(sentinelPath(dir, "json")).isFile(), true);
    assert.equal(existsSync(sentinelPath(wt, "json")), false);
  });
});

test("success, beads source: the sentinel committed alone on beads-board, staged work untouched, no push, main untouched", async () => {
  await withBeadsBoard(async (dir, manifest) => {
    const beads = join(dir, ".beads");
    git(["update-ref", "refs/remotes/origin/beads-board", "HEAD"], beads);
    writeFileSync(join(beads, "staged.txt"), "adev-fixture: staged\n");
    git(["add", "--", "staged.txt"], beads);
    const count = Number(git(["rev-list", "--count", "HEAD"], beads));
    const mainHead = git(["rev-parse", "main"], dir);
    const remote = git(["rev-parse", "refs/remotes/origin/beads-board"], beads);

    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.beadsFresh);
    assert.equal(r.code, 0, r.stderr.join("\n"));
    const root = resolveStorageRoot(manifest, dir);
    const doc = JSON.parse(readFileSync(sentinelPath(root, "beads"), "utf8"));
    assert.equal(doc.project, PROJECT);
    assert.equal(Number(git(["rev-list", "--count", "HEAD"], beads)), count + 1);
    assert.equal(git(["show", "--name-only", "--format=", "HEAD"], beads), "adev-read-only.json");
    assert.equal(git(["diff", "--cached", "--name-only"], beads), "staged.txt");
    assert.equal(git(["rev-parse", "refs/remotes/origin/beads-board"], beads), remote);
    assert.equal(git(["rev-parse", "main"], dir), mainHead);

    const report = JSON.parse(r.stdout);
    assert.equal(report.github.sentinel_path, BEADS_SENTINEL_REL);
    assert.deepEqual(report.github.id_map, { "issue-7k3f9a": "gh-103" });
    assert.deepEqual(r.stderr.slice(-3, -2), ["issue-7k3f9a → gh-103"]);
    const sentinelLine = r.stderr.at(-2);
    assert.ok(
      sentinelLine.includes(BEADS_SENTINEL_REL) && /\bcommitted\b/.test(sentinelLine) && sentinelLine.includes("beads-board") && /\bpush\b/.test(sentinelLine) && /board sync/.test(sentinelLine),
      sentinelLine,
    );
    assert.equal(r.stderr.at(-1), SUGGESTION);
  });
});

test("beads source without a runnable br: exit 1 with BEADS_NOT_AVAILABLE before any GitHub call; no state file, no sentinel, no commit on beads-board", async () => {
  await withBeadsBoard(async (dir, manifest) => {
    const beads = join(dir, ".beads");
    const head = git(["rev-parse", "HEAD"], beads);
    const missing = join(dir, "no-br-bin");
    const brCalls = join(dir, "missing-br-calls.log");
    mkdirSync(missing);
    // Exit 127 is what a shell reports for a command that is not installed.
    writeFileSync(join(missing, "br"), `#!/bin/sh\necho "$*" >> "${brCalls}"\necho "br: command not found" >&2\nexit 127\n`);
    chmodSync(join(missing, "br"), 0o755);
    const path = process.env.PATH;
    process.env.PATH = `${missing}${delimiter}${path}`;
    let r;
    try {
      r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.beadsFresh);
    } finally {
      process.env.PATH = path;
    }
    assert.equal(r.code, 1, r.stderr.join("\n"));
    const stops = linesWith(r, "BEADS_NOT_AVAILABLE: ");
    assert.equal(stops.length, 1, r.stderr.join("\n"));
    assert.match(stops[0], /`br`/);
    assert.equal(r.exec.calls.length, 0, "no GitHub request before the source is confirmed readable");
    assert.equal(r.stdout, "");
    assert.equal(readFileSync(brCalls, "utf8"), "--version\n");
    const root = resolveStorageRoot(manifest, dir);
    assert.equal(existsSync(join(dir, STATE)), false);
    assert.equal(existsSync(sentinelPath(root, "beads")), false);
    assert.equal(git(["rev-parse", "HEAD"], beads), head);
    assert.equal(git(["status", "--porcelain"], beads), "");
  });
});

test("beads commit failure: MIGRATE_SENTINEL_COMMIT_FAILED naming the absolute path and beads-board, no success report, state kept; a re-run commits without --yes", async () => {
  await withBeadsBoard(async (dir, manifest) => {
    const beads = join(dir, ".beads");
    git(["switch", "-q", "-c", "other"], beads);
    let r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.beadsFresh);
    assert.equal(r.code, 1);
    const lines = linesWith(r, "MIGRATE_SENTINEL_COMMIT_FAILED");
    assert.equal(lines.length, 1, r.stderr.join("\n"));
    assert.match(lines[0], /\/\S*\.beads\/adev-read-only\.json/);
    assert.match(lines[0], /beads-board/);
    assert.equal(r.stdout, "", "no success report and no envelope");
    const root = resolveStorageRoot(manifest, dir);
    assert.equal(lstatSync(sentinelPath(root, "beads")).isFile(), true, "the sentinel is kept, uncommitted");
    assert.equal(existsSync(join(dir, STATE)), true);
    assert.equal(r.stderr.includes(SUGGESTION), false);

    git(["switch", "-q", "beads-board"], beads);
    const count = Number(git(["rev-list", "--count", "HEAD"], beads));
    r = await migrate(dir, manifest, ["--to", "github"], migrateFx.beadsAllPresent);
    assert.equal(r.code, 0, r.stderr.join("\n"));
    assert.deepEqual(r.readLineAt, []);
    assert.equal(Number(git(["rev-list", "--count", "HEAD"], beads)), count + 1);
    assert.equal(git(["show", "--name-only", "--format=", "HEAD"], beads), "adev-read-only.json");
    assert.equal(existsSync(join(dir, STATE)), false);
  });
});

test("sentinel write failure after the copy: exit 1, no success report, items and state kept; a re-run needs confirmation before writing it", async () => {
  await withBoard(async (dir, manifest) => {
    const path = sentinelPath(dir, "json");
    // A non-empty directory at the sentinel path makes renameSync fail whatever the user.
    const wrap = (exec) => {
      const wrapped = (cmd, args, opts) => {
        const result = exec(cmd, args, opts);
        if (JSON.parse(opts.input).query.includes("addBlockedBy")) {
          mkdirSync(join(path, "occupied"), { recursive: true });
          writeFileSync(join(path, "occupied", "x"), "x");
        }
        return result;
      };
      wrapped.calls = exec.calls;
      return wrapped;
    };
    let r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.fresh, { wrap });
    assert.equal(r.code, 1, r.stderr.join("\n"));
    assert.equal(mutations(r.exec).length, 14, "every item and link was written");
    assert.equal(r.stdout, "", "no success report and no envelope");
    assert.equal(r.stderr.filter((l) => /^(SENTINEL_PATH_UNSAFE|E[A-Z]+):/.test(l)).length, 1, r.stderr.join("\n"));
    assert.equal(r.stderr.includes(SUGGESTION), false);
    assert.equal(existsSync(join(dir, STATE)), true);

    rmSync(path, { recursive: true, force: true });
    r = await migrate(dir, manifest, ["--to", "github"], migrateFx.allPresent);
    assert.equal(r.code, 1);
    assert.equal(linesWith(r, "MIGRATE_CONFIRMATION_REQUIRED").length, 1, r.stderr.join("\n"));
    assert.equal(existsSync(path), false);
    r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.allPresent);
    assert.equal(r.code, 0, r.stderr.join("\n"));
    assert.equal(lstatSync(path).isFile(), true);
  });
});

test("the guard after migration: the json adapter refuses writes naming the project but still lists; the beads storage root is not writable", async () => {
  await withBoard(async (dir, manifest) => {
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.fresh);
    assert.equal(r.code, 0, r.stderr.join("\n"));
    const adapter = new JsonAdapter(dir);
    await assert.rejects(adapter.create({ title: "adev-fixture: after migration", type: "task" }), (e) => e.code === "BOARD_READ_ONLY_MIGRATED" && e.message.includes(PROJECT));
    assert.deepEqual((await adapter.list({})).map((i) => i.id).sort(), ["e1.f1", "issue-7k3f9a", "issue-c0ffee"]);
  });
  await withBeadsBoard(async (dir, manifest) => {
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.beadsFresh);
    assert.equal(r.code, 0, r.stderr.join("\n"));
    assert.throws(() => assertWritable(resolveStorageRoot(manifest, dir), "beads"), { code: "BOARD_READ_ONLY_MIGRATED" });
  });
});

// ---------------------------------------------------------------------------
// Redaction on non-error lines (amendment BEH-6; migration review WR-8)
// ---------------------------------------------------------------------------

test("redaction: a project title carrying GH_TOKEN and a ghp_ token prints [REDACTED] in the write set and the success summary, never the secret", async () => {
  // Assembled at runtime so no token-shaped literal sits in this source file.
  const ghp = ["gh", "p_", "Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2"].join("");
  process.env.GH_TOKEN = ENV_TOKEN;
  try {
    await withBoard(async (dir, manifest) => {
      const r = await migrate(dir, manifest, ["--to", "github", "--yes"], projectTitled(`adev-fixture: board ${ENV_TOKEN} ${ghp}`));
      assert.equal(r.code, 0, r.stderr.join("\n"));
      const ws = writeSet(r);
      assert.ok(ws.text.includes("[REDACTED]"), ws.text);
      assert.ok(r.stderr.slice(ws.end).join("\n").includes("[REDACTED]"), r.stderr.slice(ws.end).join("\n"));
      for (const secret of [ENV_TOKEN, "ghp_"]) assert.equal(all(r).includes(secret), false, secret);
    });
  } finally {
    delete process.env.GH_TOKEN;
  }
});

// ---------------------------------------------------------------------------
// The production consent path (amendment BEH-3, BEH-10)
// ---------------------------------------------------------------------------

/** readStdinLine(stream), failing instead of hanging when it never settles. */
function readWithin(stream) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("readStdinLine never settled")), 1000); });
  return Promise.race([readStdinLine(stream), timeout]).finally(() => clearTimeout(timer));
}

function assertSettled(stream) {
  for (const event of ["data", "end", "error"]) assert.equal(stream.listenerCount(event), 0, `${event} listener left behind`);
  assert.equal(stream.isPaused(), true, "the stream is paused once the answer is read");
}

test("readStdinLine: one line without its line ending, across chunks, CRLF stripped; then the stream is left paused with no listeners", async () => {
  for (const [chunks, expected] of [[["yes\n"], "yes"], [["y\r\n"], "y"], [["Y", "ES\nrest"], "YES"], [["\n"], ""]]) {
    const stream = new PassThrough();
    const answer = readWithin(stream);
    for (const chunk of chunks) stream.write(chunk);
    assert.equal(await answer, expected, JSON.stringify(chunks));
    assertSettled(stream);
  }
});

test("readStdinLine: no complete line is no consent: EOF with no input, text without a newline, an already-ended stream, a stream error all resolve null", async () => {
  let stream = new PassThrough();
  let answer = readWithin(stream);
  stream.end();
  assert.equal(await answer, null);
  assertSettled(stream);

  stream = new PassThrough();
  answer = readWithin(stream);
  stream.write("y");
  stream.end();
  assert.equal(await answer, null, "a partial line then EOF");
  assertSettled(stream);

  stream = new PassThrough();
  stream.end();
  stream.resume();
  await new Promise((resolve) => stream.once("end", resolve));
  assert.equal(stream.readableEnded, true);
  assert.equal(await readWithin(stream), null, "an already-ended stream");

  stream = new PassThrough();
  answer = readWithin(stream);
  stream.destroy(new Error("adev-fixture: stdin failed"));
  assert.equal(await answer, null, "a stream error");
  for (const event of ["data", "end", "error"]) assert.equal(stream.listenerCount(event), 0);
});

test("interactive needs both stdin and stderr to be terminals: the prompt goes to stderr", () => {
  assert.equal(isInteractiveTerminal({ stdin: { isTTY: true }, stderr: { isTTY: true } }), true);
  assert.equal(isInteractiveTerminal({ stdin: { isTTY: true }, stderr: { isTTY: false } }), false);
  assert.equal(isInteractiveTerminal({ stdin: { isTTY: false }, stderr: { isTTY: true } }), false);
  assert.equal(isInteractiveTerminal({ stdin: {}, stderr: {} }), false);
});

// ---------------------------------------------------------------------------
// The unanchored item in the write set and the dry run (GitHub spec BEH-31, BEH-41)
// ---------------------------------------------------------------------------

test("an item recorded in .migrate-unanchored.json is disclosed as one to finish, and the dry run counts it as the live run reports it", async () => {
  await withBoard(async (dir, manifest) => {
    await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.unanchoredAtItem2);
    const dry = await migrate(dir, manifest, ["--to", "github", "--dry-run"], migrateFx.completeUnanchored);
    assert.equal(dry.code, 0, dry.stderr.join("\n"));
    const dryReport = JSON.parse(dry.stdout);
    assert.deepEqual(dryReport.would_create, { issues: 2, epics: 0 });
    assert.deepEqual(dryReport.github.would_create_ids, ["e1.f1", "issue-7k3f9a"]);

    const live = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.completeUnanchored);
    assert.equal(live.code, 0, live.stderr.join("\n"));
    assert.deepEqual(JSON.parse(live.stdout).created, dryReport.would_create);
    const { text } = writeSet(live);
    assert.match(text, /\b1 item to finish\b/);
    assert.match(text, /\b1 item to create\b/);
  });
});

// ---------------------------------------------------------------------------
// Spacing on a clock whose sleeps land early (GitHub spec BEH-35)
// ---------------------------------------------------------------------------

test("pacing: a sleep that wakes early is followed by one more, so mutations stay at least 1000 ms apart", async () => {
  await withBoard(async (dir, manifest) => {
    const clock = makeClock();
    clock.sleep = async (ms) => {
      clock.sleeps.push(ms);
      clock.t += ms > 1 ? ms - 1 : Math.max(0, ms);
    };
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.fresh, { clock });
    assert.equal(r.code, 0, r.stderr.join("\n"));
    const gaps = r.mutationTimes.slice(1).map((t, i) => t - r.mutationTimes[i]);
    assert.deepEqual(gaps.filter((g) => g < 1000), [], `mutation gaps: ${gaps.join(", ")}`);
    assert.ok(r.clock.sleeps.length <= 2 * (r.mutationTimes.length - 1), "at most one extra sleep per mutation");
  });
});
