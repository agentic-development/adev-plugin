/**
 * Pure helpers of scripts/record-github-fixtures.mjs. Importing the script does not
 * run it, and every spawn here is a fake: no case touches `gh`, a token, or the network.
 */

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../../helpers.mjs";
import { createTransport } from "../../../lib/issues/github/transport.mjs";
import { replayExec } from "../github/replay-transport.mjs";
import {
  FIXTURES_REL,
  assertFixtureText,
  buildFixture,
  duplicateFixtureName,
  fixtureFileName,
  fixturePath,
  main,
  parseRecorderArgs,
  recordingExec,
  removeStaleFixture,
  toReplayEntries,
} from "../../../scripts/record-github-fixtures.mjs";

const PROJECT = "https://github.com/users/adev-fixture-bot/projects/3";
const REPO = "adev-fixture-bot/board";
const VIEWER = "query Viewer { viewer { login } }";
const CREATE = "mutation CreateIssue($repositoryId: ID!, $title: String!, $body: String!) { createIssue(input: { repositoryId: $repositoryId, title: $title, body: $body }) { issue { id } } }";
// Token-shaped strings are assembled at runtime so no token literal sits in the source.
const TOKEN = "ghp_" + "A1b2C3d4E5".repeat(3) + "F6g7H8";

const dirs = [];
after(() => dirs.forEach(cleanupTempDir));
function tempDir() {
  const dir = createTempDir();
  dirs.push(dir);
  return dir;
}

// A fake spawn answering from a list of outcomes in order, counting its calls.
function fakeSpawn(outcomes) {
  const spawn = (_cmd, _args, _opts) => {
    const next = outcomes[spawn.calls++];
    if (next.throws) throw Object.assign(new Error("gh failed"), next.throws);
    return JSON.stringify(next.response);
  };
  spawn.calls = 0;
  return spawn;
}

test("the recorder refuses to run without both --project and --repo", () => {
  assert.throws(() => parseRecorderArgs([]), { code: "RECORDER_USAGE" });
  assert.throws(() => parseRecorderArgs(["--project", PROJECT]), { code: "RECORDER_USAGE" });
  assert.throws(() => parseRecorderArgs(["--repo", REPO]), { code: "RECORDER_USAGE" });
  assert.throws(() => parseRecorderArgs(["--project", "", "--repo", REPO]), { code: "RECORDER_USAGE" });
  assert.deepEqual(parseRecorderArgs(["--project", PROJECT, "--repo", REPO]), { help: false, project: PROJECT, repo: REPO });
  assert.deepEqual(parseRecorderArgs(["--help"]), { help: true });
});

test("the recorder refuses a project or repo owned by anyone but a fixture account, and unknown flags", () => {
  assert.throws(() => parseRecorderArgs(["--project", "https://github.com/orgs/acme/projects/7", "--repo", REPO]), { code: "RECORDER_USAGE", message: /"acme"/ });
  assert.throws(() => parseRecorderArgs(["--project", PROJECT, "--repo", "acme/board"]), { code: "RECORDER_USAGE", message: /"acme"/ });
  assert.throws(() => parseRecorderArgs(["--project", "https://example.com/x", "--repo", REPO]), { code: "RECORDER_USAGE" });
  assert.throws(() => parseRecorderArgs(["--project", PROJECT, "--repo", "no-slash"]), { code: "RECORDER_USAGE" });
  assert.throws(() => parseRecorderArgs(["--project", PROJECT, "--repo", REPO, "--out", "/tmp"]), { code: "RECORDER_USAGE" });
});

test("fixture file names are hyphenated slugs of the case name", () => {
  assert.equal(fixtureFileName("claim refuses a closed issue with ISSUE_CLOSED"), "claim-refuses-a-closed-issue-with-issue-closed.json");
  assert.equal(fixtureFileName("../../etc/passwd"), "etc-passwd.json");
  assert.throws(() => fixtureFileName("///"), { code: "RECORDER_INVALID_CASE" });
});

test("fixturePath stays beneath the fixtures directory and refuses every escape", () => {
  const root = tempDir();
  assert.equal(fixturePath(root, "a-case.json"), join(realpathSync(root), FIXTURES_REL, "a-case.json"));
  for (const name of ["../a.json", "../../../../a.json", "/etc/a.json", "", "."]) {
    assert.throws(() => fixturePath(root, name), { code: "RECORDER_PATH_ESCAPE" }, name);
  }
});

test("fixturePath refuses a fixtures directory that is a symlink out of the repo", () => {
  const root = tempDir();
  const outside = tempDir();
  mkdirSync(join(root, "tests", "issues", "conformance"), { recursive: true });
  symlinkSync(outside, join(root, FIXTURES_REL));
  assert.throws(() => fixturePath(root, "a-case.json"), { code: "RECORDER_PATH_ESCAPE" });
});

test("a mutation with an unprefixed title or body is refused; empty text and queries pass", () => {
  assert.throws(() => assertFixtureText(CREATE, { title: "real issue", body: "" }), { code: "RECORDER_UNMARKED_TEXT" });
  assert.throws(() => assertFixtureText(CREATE, { title: "adev-fixture: t", body: "real body" }), { code: "RECORDER_UNMARKED_TEXT" });
  assert.throws(() => assertFixtureText(CREATE, { input: { nested: [{ body: "real" }] } }), { code: "RECORDER_UNMARKED_TEXT" });
  assert.equal(assertFixtureText(CREATE, { title: "adev-fixture: t", body: "" }), undefined);
  assert.equal(assertFixtureText(VIEWER, { title: "anything" }), undefined);
});

test("the recording exec never sends a refused mutation and reports the refusal", () => {
  const spawn = fakeSpawn([]);
  const log = [];
  const problems = [];
  const transport = createTransport({ exec: recordingExec(spawn, log, problems), env: {} });
  assert.throws(() => transport.request(CREATE, { repositoryId: "R_1", title: "real issue", body: "" }));
  assert.equal(spawn.calls, 0);
  assert.deepEqual(log, []);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /title does not start with "adev-fixture:"/);
});

test("a recorded session replays through replayExec: repeats with a changed outcome become a sequence", () => {
  const first = { data: { viewer: { login: "adev-fixture-bot" } } };
  const second = { data: { viewer: { login: "adev-fixture-human" } } };
  const created = { data: { createIssue: { issue: { id: "I_1" } } } };
  const spawn = fakeSpawn([{ response: first }, { response: created }, { response: second }, { response: created }]);
  const log = [];
  const live = createTransport({ exec: recordingExec(spawn, log, []), env: {} });
  const vars = { repositoryId: "R_1", title: "adev-fixture: t", body: "" };
  const liveResults = [live.request(VIEWER, {}), live.request(CREATE, vars), live.request(VIEWER, {}), live.request(CREATE, vars)];

  const entries = toReplayEntries(log);
  assert.deepEqual(entries, [
    { query: VIEWER, variables: {}, sequence: [{ response: first }, { response: second }] },
    { query: CREATE, variables: vars, response: created },
  ]);

  const replay = createTransport({ exec: replayExec(entries) });
  const replayed = [replay.request(VIEWER, {}), replay.request(CREATE, vars), replay.request(VIEWER, {}), replay.request(CREATE, vars)];
  assert.deepEqual(replayed, liveResults);
  assert.throws(() => replay.request(VIEWER, {}), { code: "UNRECORDED_GITHUB_REQUEST" });
});

test("a gh failure is recorded as its GraphQL body when it has one, else as code and stderr", () => {
  const graphqlBody = { errors: [{ type: "FORBIDDEN", path: ["createIssue"], message: "Resource not accessible by integration" }] };
  const spawn = fakeSpawn([
    { throws: { status: 1, stdout: JSON.stringify(graphqlBody), stderr: "" } },
    { throws: { code: "ENOENT", stdout: "", stderr: "" } },
  ]);
  const log = [];
  const live = createTransport({ exec: recordingExec(spawn, log, []), env: {} });
  const vars = { repositoryId: "R_1", title: "adev-fixture: t", body: "" };
  assert.throws(() => live.request(CREATE, vars), { code: "GITHUB_PERMISSION_DENIED" });
  assert.throws(() => live.request(VIEWER, {}), { code: "GITHUB_CLI_MISSING" });
  assert.deepEqual(log.map((r) => r.outcome), [{ response: graphqlBody }, { error: { code: "ENOENT", stderr: "" } }]);

  const replay = createTransport({ exec: replayExec(toReplayEntries(log)) });
  assert.throws(() => replay.request(CREATE, vars), { code: "GITHUB_PERMISSION_DENIED" });
  assert.throws(() => replay.request(VIEWER, {}), { code: "GITHUB_CLI_MISSING" });
});

const manifest = { tasks: { backend: "github", github: { project: PROJECT, repo: REPO } } };
const now = "2026-01-15T12:00:00.000Z";

test("buildFixture redacts tokens and literal secrets from responses before they are written", () => {
  const secret = "s3cr3t-literal-value";
  const log = [{ query: VIEWER, variables: {}, outcome: { response: { data: { viewer: { login: "adev-fixture-bot" }, note: `x ${TOKEN} y ${secret}` } } } }];
  const { text, problems } = buildFixture({ caseName: "a case", manifest, now, log }, [secret]);
  assert.equal(problems, undefined);
  assert.equal(text.includes(TOKEN), false);
  assert.equal(text.includes(secret), false);
  assert.deepEqual(JSON.parse(text).requests[0].response.data.note, "x [REDACTED] y [REDACTED]");
  assert.deepEqual(JSON.parse(text).recorded_with, { manifest, now });
});

test("buildFixture refuses a case whose request carried a secret, since its replay could never match", () => {
  const log = [{ query: CREATE, variables: { title: `adev-fixture: ${TOKEN}`, body: "" }, outcome: { response: { data: {} } } }];
  const result = buildFixture({ caseName: "a case", manifest, now, log });
  assert.equal(result.text, undefined);
  assert.match(result.problems[0], /replay could never match/);
});

test("buildFixture refuses a fixture that would fail the fixture lint", () => {
  const foreign = [{ query: VIEWER, variables: {}, outcome: { response: { data: { viewer: { login: "octocat" } } } } }];
  assert.deepEqual(buildFixture({ caseName: "c", manifest, now, log: foreign }).problems, ['login "octocat" is not a fixture account']);

  const unprefixed = [{ query: VIEWER, variables: {}, outcome: { response: { data: { node: { title: "Real board" } } } } }];
  assert.deepEqual(buildFixture({ caseName: "c", manifest, now, log: unprefixed }).problems, ['a title or body does not start with "adev-fixture:"']);

  const foreignUrl = [{ query: VIEWER, variables: {}, outcome: { response: { data: { node: { url: "https://github.com/acme/app/issues/1" } } } } }];
  assert.deepEqual(buildFixture({ caseName: "c", manifest, now, log: foreignUrl }).problems, ['url is owned by "acme", not a fixture account']);
});

// main() is driven through its seams only: a spawn that fails the test if reached, the
// cases under test, and a temp repo root, so nothing touches gh, a token, or this repo.
// A refused spawn would surface only as a failed case (exit 1), so each call is also counted
// and every test asserts the count is still zero after main returns.
let spawnCalls = 0;
function forbiddenSpawn() {
  spawnCalls += 1;
  assert.fail("main reached the spawn");
}
test.beforeEach(() => { spawnCalls = 0; });
test.afterEach(() => assert.equal(spawnCalls, 0, "main reached the spawn"));
const ARGS = ["--project", PROJECT, "--repo", REPO];
const FAKE_ENV = { GH_TOKEN: "fake-injected-token-value" };
const unreachedCase = (name) => ({ name, run: async () => assert.fail(`case ${name} ran`) });

test("main returns 1 without GH_TOKEN in the injected env, before any spawn", async (t) => {
  const err = t.mock.method(console, "error", () => {});
  const code = await main(ARGS, {}, { spawn: forbiddenSpawn, cases: [unreachedCase("a")], repoRoot: tempDir() });
  assert.equal(code, 1);
  assert.match(err.mock.calls[0].arguments[0], /GH_TOKEN is not set/);
});

test("main refuses a missing --project or --repo before any spawn", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const argv of [[], ["--project", PROJECT], ["--repo", REPO]]) {
    const code = await main(argv, FAKE_ENV, { spawn: forbiddenSpawn, cases: [unreachedCase("a")], repoRoot: tempDir() });
    assert.equal(code, 1, argv.join(" "));
  }
});

test("main refuses cases whose names share a fixture file, before any spawn or write", async (t) => {
  const err = t.mock.method(console, "error", () => {});
  const root = tempDir();
  const cases = [unreachedCase("Claim works"), unreachedCase("claim  works!")];
  assert.equal(duplicateFixtureName(cases), "claim-works.json");
  assert.equal(duplicateFixtureName([unreachedCase("a"), unreachedCase("b")]), null);
  assert.equal(await main(ARGS, FAKE_ENV, { spawn: forbiddenSpawn, cases, repoRoot: root }), 1);
  assert.match(err.mock.calls[0].arguments[0], /share the fixture file claim-works\.json/);
  assert.equal(existsSync(join(root, FIXTURES_REL)), false);
});

test("main runs gh with the injected env, not process.env", async (t) => {
  t.mock.method(console, "log", () => {});
  const root = tempDir();
  const seen = [];
  const spawn = (_cmd, _args, opts) => {
    seen.push(opts.env);
    return JSON.stringify({ data: { viewer: { login: "adev-fixture-bot" } } });
  };
  const cases = [{ name: "viewer", run: async (manager) => manager._transport.request(VIEWER, {}) }];
  assert.equal(await main(ARGS, FAKE_ENV, { spawn, cases, repoRoot: root }), 0);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].GH_TOKEN, FAKE_ENV.GH_TOKEN);
  assert.equal(seen[0].GH_PROMPT_DISABLED, "1");
  const text = readFileSync(join(root, FIXTURES_REL, "viewer.json"), "utf8");
  assert.equal(text.includes(FAKE_ENV.GH_TOKEN), false);
});

test("a case that fails deletes its fixture from an earlier run and leaves other fixtures alone", async (t) => {
  const err = t.mock.method(console, "error", () => {});
  t.mock.method(console, "log", () => {});
  const root = tempDir();
  mkdirSync(join(root, FIXTURES_REL), { recursive: true });
  writeFileSync(join(root, FIXTURES_REL, "broken-case.json"), "{}\n");
  writeFileSync(join(root, FIXTURES_REL, "unrelated.json"), "{}\n");
  const cases = [{ name: "broken case", run: async () => { throw Object.assign(new Error("boom"), { code: "X" }); } }];
  assert.equal(await main(ARGS, FAKE_ENV, { spawn: forbiddenSpawn, cases, repoRoot: root }), 1);
  assert.equal(existsSync(join(root, FIXTURES_REL, "broken-case.json")), false);
  assert.equal(existsSync(join(root, FIXTURES_REL, "unrelated.json")), true);
  assert.ok(err.mock.calls.some((c) => /removed the earlier/.test(c.arguments[0])));
});

test("removeStaleFixture deletes only a contained fixture and reports whether one existed", () => {
  const root = tempDir();
  mkdirSync(join(root, FIXTURES_REL), { recursive: true });
  writeFileSync(join(root, FIXTURES_REL, "a-case.json"), "{}\n");
  assert.equal(removeStaleFixture(root, "a-case.json"), true);
  assert.equal(existsSync(join(root, FIXTURES_REL, "a-case.json")), false);
  assert.equal(removeStaleFixture(root, "a-case.json"), false);
  assert.throws(() => removeStaleFixture(root, "../a.json"), { code: "RECORDER_PATH_ESCAPE" });
});
