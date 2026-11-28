/**
 * The github adapter against the recorded GitHub traffic: every shared contract
 * case and every github-only live case replays the fixture the recorder wrote for
 * it, through a replay transport injected in place of `execFileSync`. A request
 * the fixture does not hold fails the case, and so does a case with no fixture,
 * so this file needs no network and no token, and never spawns `gh`.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { GithubAdapter } from "../../../lib/issues/github-adapter.mjs";
import { createTempDir, cleanupTempDir } from "../../helpers.mjs";
import { replayExec } from "../github/replay-transport.mjs";
import { FIXTURES_REL, REPO_ROOT, RECORDING_NOW_ISO, fixtureFileName } from "../../../scripts/record-github-fixtures.mjs";
import { contractCases } from "./contract-cases.mjs";
import { GITHUB_LIVE_CASES, makeLiveContext } from "./github-live-cases.mjs";

const noSleep = async () => {};
const dirs = [];

// A code path that ignored the injected exec would spawn `gh` from PATH. A stub
// first on PATH records such a spawn and fails like an unauthenticated `gh`, and
// the tokens are removed, so no request can reach GitHub from this file.
let guard;
before(() => {
  const dir = createTempDir();
  const bin = join(dir, "bin");
  const log = join(dir, "gh-calls.log");
  mkdirSync(bin);
  writeFileSync(join(bin, "gh"), `#!/bin/sh\necho "$*" >> "${log}"\necho "gh auth login" >&2\nexit 4\n`);
  chmodSync(join(bin, "gh"), 0o755);
  guard = { dir, log, path: process.env.PATH, gh: process.env.GH_TOKEN, github: process.env.GITHUB_TOKEN };
  process.env.PATH = `${bin}${delimiter}${process.env.PATH ?? ""}`;
  delete process.env.GH_TOKEN;
  delete process.env.GITHUB_TOKEN;
});
after(() => {
  process.env.PATH = guard.path;
  if (guard.gh !== undefined) process.env.GH_TOKEN = guard.gh;
  if (guard.github !== undefined) process.env.GITHUB_TOKEN = guard.github;
  const spawned = existsSync(guard.log);
  cleanupTempDir(guard.dir);
  dirs.forEach(cleanupTempDir);
  assert.equal(spawned, false, "a replayed case spawned gh instead of using the injected exec");
});

function loadFixture(caseName) {
  const file = join(REPO_ROOT, FIXTURES_REL, fixtureFileName(caseName));
  assert.ok(existsSync(file), `No fixture is recorded for "${caseName}" (${join(FIXTURES_REL, fixtureFileName(caseName))}); record it with scripts/record-github-fixtures.mjs.`);
  const fixture = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(fixture.case, caseName, "the fixture names its case");
  assert.equal(fixture.recorded_with.now, RECORDING_NOW_ISO);
  return fixture;
}

contractCases((caseName) => {
  const fixture = loadFixture(caseName);
  const storage = createTempDir();
  dirs.push(storage);
  return new GithubAdapter(storage, fixture.recorded_with.manifest, {
    exec: replayExec(fixture.requests),
    env: {},
    now: () => Date.parse(fixture.recorded_with.now),
    sleep: noSleep,
  });
});

for (const { name, run } of GITHUB_LIVE_CASES) {
  test(name, async () => {
    const fixture = loadFixture(name);
    assert.equal(Number.isInteger(fixture.recorded_with.seed), true, "a live case's fixture records its seed");
    const { ctx, cleanup } = makeLiveContext({
      exec: replayExec(fixture.requests),
      env: {},
      manifest: fixture.recorded_with.manifest,
      seed: fixture.recorded_with.seed,
      now: Date.parse(fixture.recorded_with.now),
      sleep: noSleep,
    });
    try {
      await run(ctx);
    } finally {
      cleanup();
    }
  });
}
