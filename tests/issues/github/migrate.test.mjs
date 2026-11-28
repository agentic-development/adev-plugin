import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { run, parseArgs, help } from "../../../lib/cli/issues-migrate.mjs";
import { SUPPORTED_BACKENDS } from "../../../lib/issues/registry.mjs";
import { redact } from "../../../lib/issues/github/errors.mjs";
import { ISSUE_QUERY } from "../../../lib/issues/github/queries.mjs";
import { echoValue, createGithubOutput, migrateToGithub } from "../../../lib/issues/github/migrate.mjs";
import { writeSentinel, sentinelPath } from "../../../lib/issues/read-only-sentinel.mjs";
import { PLUGIN_ROOT, createTempDir, cleanupTempDir } from "../../helpers.mjs";
import { replayExec } from "./replay-transport.mjs";
import { TEXT_FIELD_IDS } from "./fixtures/writes.mjs";
import { migrateFx, seedJsonBoard, PROJECT, OTHER_PROJECT, ENV_TOKEN, TITLES, MANY_FOREIGN, RESET_AT } from "./fixtures/migrate.mjs";

const STATE = ".context-index/tasks/.migrate-state.json";
const UNANCHORED = ".context-index/tasks/.migrate-unanchored.json";
const noWait = { sleep: async () => {}, now: () => 0 };

// Any code path that ignores the injected exec would spawn `gh` from PATH. A stub
// first on PATH records such a spawn and fails like an unauthenticated `gh`, and
// the tokens are removed, so no request can reach GitHub from this file.
let ghGuard;
before(() => {
  const dir = createTempDir();
  const bin = join(dir, "bin");
  const log = join(dir, "gh-calls.log");
  mkdirSync(bin);
  writeFileSync(join(bin, "gh"), `#!/bin/sh\necho "$*" >> "${log}"\necho "gh auth login" >&2\nexit 4\n`);
  chmodSync(join(bin, "gh"), 0o755);
  ghGuard = { dir, log, path: process.env.PATH, gh: process.env.GH_TOKEN, github: process.env.GITHUB_TOKEN };
  process.env.PATH = `${bin}${delimiter}${process.env.PATH ?? ""}`;
  delete process.env.GH_TOKEN;
  delete process.env.GITHUB_TOKEN;
});
after(() => {
  process.env.PATH = ghGuard.path;
  if (ghGuard.gh !== undefined) process.env.GH_TOKEN = ghGuard.gh;
  if (ghGuard.github !== undefined) process.env.GITHUB_TOKEN = ghGuard.github;
  const spawned = existsSync(ghGuard.log);
  cleanupTempDir(ghGuard.dir);
  assert.equal(spawned, false, "a migration spawned gh instead of using the injected exec");
});

async function migrate(dir, manifest, argv, fx, extra = {}) {
  const out = [];
  const err = [];
  const consoleOut = [];
  const exec = replayExec(fx);
  const origErr = console.error;
  const origLog = console.log;
  console.error = (...a) => err.push(a.map(String).join(" "));
  console.log = (...a) => consoleOut.push(a.map(String).join(" "));
  try {
    const code = await run({ projectRoot: dir, argv, manifest, exec, isTTY: false, log: (s) => out.push(s), ...noWait, ...extra });
    return { code, exec, stdout: out.join(""), stderr: err, consoleOut };
  } finally {
    console.error = origErr;
    console.log = origLog;
  }
}

const isMutation = (c) => c.query.trimStart().startsWith("mutation");
const mutations = (exec) => exec.calls.filter(isMutation).map((c) => [c.operation, c.variables]);
const ops = (exec, name) => exec.calls.filter((c) => c.operation === name);
const legacyFirstValues = (exec) => ops(exec, "SetFields").filter((c) => c.variables.f0Field === TEXT_FIELD_IDS.legacy_id).map((c) => c.variables.f0Value);
const readState = (dir) => JSON.parse(readFileSync(join(dir, STATE), "utf8"));
const lineWith = (r, code) => r.stderr.filter((l) => l.startsWith(code));

async function withBoard(fn) {
  const dir = createTempDir();
  try {
    const manifest = await seedJsonBoard(dir);
    return await fn(dir, manifest);
  } finally {
    cleanupTempDir(dir);
  }
}

// ---------------------------------------------------------------------------
// Copy, legacy_id, replay (GitHub spec BEH-29; amendment BEH-1, BEH-10)
// ---------------------------------------------------------------------------

test("json → github through the real verb: parents first, Legacy ID first on every item, replay after every create, seams reach the adapter", async () => {
  await withBoard(async (dir, manifest) => {
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.fresh);
    assert.equal(r.code, 0, r.stderr.join("\n"));
    assert.equal(r.exec.calls[0].operation, "AdevPreflight");
    assert.deepEqual(ops(r.exec, "CreateIssue").map((c) => c.variables.title), [TITLES.e1, TITLES.f1, TITLES.t]);
    const names = r.exec.calls.map((c) => c.operation);
    assert.ok(names.lastIndexOf("CreateIssue") < names.indexOf("AddSubIssue"));
    assert.ok(names.lastIndexOf("CreateIssue") < names.indexOf("AddBlockedBy"));
    assert.deepEqual(legacyFirstValues(r.exec), ["e1", "e1.f1", "issue-7k3f9a"]);
    assert.equal(ops(r.exec, "AddSubIssue").length, 1);
    assert.equal(ops(r.exec, "AddBlockedBy").length, 1);
    const report = JSON.parse(r.stdout);
    assert.equal(report.source, "json");
    assert.equal(report.target, "github");
    assert.deepEqual(report.errors, []);
    assert.equal(report.manifest_update_suggested, true);
    assert.deepEqual(report.created, { issues: 2, epics: 1 });
    assert.equal(report.skipped, 0);
    assert.equal(report.github.project, PROJECT);
    assert.deepEqual(report.github.id_map, { e1: "gh-101", "e1.f1": "gh-102", "issue-7k3f9a": "gh-103" });
    assert.deepEqual(r.consoleOut, [], "the github path writes stdout only through the log seam");
    assert.equal(existsSync(join(dir, STATE)), false, "success removes the state file");
  });
});

test("--include-closed: a closed item is created, then closed with the Done option and no close comment", async () => {
  await withBoard(async (dir, manifest) => {
    const r = await migrate(dir, manifest, ["--to", "github", "--include-closed", "--yes"], migrateFx.includeClosed);
    assert.equal(r.code, 0, r.stderr.join("\n"));
    assert.deepEqual(ops(r.exec, "CreateIssue").map((c) => c.variables.title), [TITLES.e1, TITLES.f1, TITLES.t, TITLES.closed]);
    assert.deepEqual(ops(r.exec, "CloseIssue").map((c) => c.variables), [{ issueId: "I_fixture_104" }]);
    assert.equal(ops(r.exec, "AddComment").length, 0);
    const names = r.exec.calls.map((c) => c.operation);
    assert.ok(names.lastIndexOf("CreateIssue") < names.indexOf("CloseIssue"));
    assert.equal(JSON.parse(r.stdout).github.id_map["issue-c0ffee"], "gh-104");
  });
});

test("nothing left to do: every item and link already on the board → no mutation, id_map from legacy_id", async () => {
  await withBoard(async (dir, manifest) => {
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.allPresent);
    assert.equal(r.code, 0, r.stderr.join("\n"));
    assert.deepEqual(mutations(r.exec), []);
    const report = JSON.parse(r.stdout);
    assert.deepEqual(report.created, { issues: 0, epics: 0 });
    assert.equal(report.skipped, 3);
    assert.deepEqual(report.github.id_map, { e1: "gh-101", "e1.f1": "gh-102", "issue-7k3f9a": "gh-103" });
  });
});

test("confirmation is skipped only when the run makes no write: a partial item found by legacy_id still needs --yes", async () => {
  await withBoard(async (dir, manifest) => {
    writeSentinel(dir, "json", { project: PROJECT });
    let r = await migrate(dir, manifest, ["--to", "github"], migrateFx.allPresent);
    assert.equal(r.code, 0, r.stderr.join("\n"));
    assert.deepEqual(mutations(r.exec), []);
    r = await migrate(dir, manifest, ["--to", "github"], migrateFx.partialAllLinked);
    assert.equal(r.code, 1);
    assert.equal(lineWith(r, "MIGRATE_CONFIRMATION_REQUIRED").length, 1, r.stderr.join("\n"));
    assert.deepEqual(mutations(r.exec), []);
    assert.equal(existsSync(join(dir, STATE)), false);
    r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.partialAllLinked);
    assert.equal(r.code, 0, r.stderr.join("\n"));
    assert.deepEqual(mutations(r.exec), [["AddLabels", { labelableId: "I_fixture_102", labelIds: ["LA_type_feature"] }]]);
  });
});

test("replay skips a link already present: only the missing dependency is written", async () => {
  await withBoard(async (dir, manifest) => {
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.dependencyMissing);
    assert.equal(r.code, 0, r.stderr.join("\n"));
    assert.deepEqual(mutations(r.exec), [["AddBlockedBy", { issueId: "I_fixture_102", blockingIssueId: "I_fixture_103" }]]);
  });
});

// ---------------------------------------------------------------------------
// Resume (GitHub spec BEH-30; amendment BEH-4)
// ---------------------------------------------------------------------------

test("re-run after interruption: with or without .migrate-state.json, the identical mutation sequence and no duplicate", async () => {
  const seqs = [];
  for (const dropState of [false, true]) {
    await withBoard(async (dir, manifest) => {
      await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.failsAtItem2);
      assert.equal(existsSync(join(dir, STATE)), true);
      if (dropState) rmSync(join(dir, STATE), { force: true });
      const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.resumeFromItem2);
      assert.equal(r.code, 0, r.stderr.join("\n"));
      assert.deepEqual(ops(r.exec, "CreateIssue").map((c) => c.variables.title), [TITLES.f1, TITLES.t]);
      assert.deepEqual(JSON.parse(r.stdout).github.id_map, { e1: "gh-101", "e1.f1": "gh-102", "issue-7k3f9a": "gh-103" });
      seqs.push(mutations(r.exec));
    });
  }
  assert.deepEqual(seqs[0], seqs[1]);
});

test("partial create after the Legacy ID write: envelope carries target_id and unwritten_fields; a re-run without the state file finishes that item", async () => {
  await withBoard(async (dir, manifest) => {
    const p = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.partialCreateAtItem2);
    assert.equal(p.code, 1);
    const e = JSON.parse(p.stdout).errors[0];
    assert.equal(e.code, "GITHUB_PARTIAL_CREATE");
    assert.equal(e.source_id, "e1.f1");
    assert.equal(e.target_id, "gh-102");
    assert.deepEqual(e.unwritten_fields, ["type"]);
    assert.equal(existsSync(join(dir, UNANCHORED)), false);
    rmSync(join(dir, STATE), { force: true });
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.finishPartialAtItem2);
    assert.equal(r.code, 0, r.stderr.join("\n"));
    assert.deepEqual(ops(r.exec, "CreateIssue").map((c) => c.variables.title), [TITLES.t]);
    assert.deepEqual(ops(r.exec, "AddLabels")[0].variables, { labelableId: "I_fixture_102", labelIds: ["LA_type_feature"] });
    assert.equal(JSON.parse(r.stdout).github.id_map["e1.f1"], "gh-102");
  });
});

// ---------------------------------------------------------------------------
// Abort envelope (amendment BEH-5)
// ---------------------------------------------------------------------------

test("abort envelope: per-item failure → exit 1, Live-Run shape with { source_id, code, message }, one MIGRATE_PARTIAL_FAILURE line, state at the last item done", async () => {
  await withBoard(async (dir, manifest) => {
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.failsAtItem2);
    assert.equal(r.code, 1);
    const report = JSON.parse(r.stdout);
    assert.equal("code" in report, false);
    assert.equal(report.source, "json");
    assert.equal(report.target, "github");
    assert.equal(report.manifest_update_suggested, false);
    assert.equal(report.errors.length, 1);
    assert.deepEqual(Object.keys(report.errors[0]).sort(), ["code", "message", "source_id"]);
    assert.equal(report.errors[0].code, "GITHUB_WRITE_FAILED");
    assert.equal(report.errors[0].source_id, "e1.f1");
    assert.match(report.errors[0].message, /adev-fixture: GitHub rejected this write/);
    const lines = lineWith(r, "MIGRATE_PARTIAL_FAILURE:");
    assert.equal(lines.length, 1);
    assert.ok(lines[0].includes("GITHUB_WRITE_FAILED") && lines[0].includes("e1.f1"), lines[0]);
    assert.deepEqual(readState(dir), { source: "json", target: "github", last_successful_index: 0, scope_args: { includeClosed: false } });
  });
});

test("a replay-phase failure stops with the envelope and leaves last_successful_index at M−1", async () => {
  await withBoard(async (dir, manifest) => {
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.replayFails);
    assert.equal(r.code, 1);
    const report = JSON.parse(r.stdout);
    assert.equal(report.manifest_update_suggested, false);
    assert.equal(report.errors.length, 1);
    assert.equal(report.errors[0].code, "GITHUB_WRITE_FAILED");
    assert.equal(report.errors[0].source_id, "e1.f1");
    assert.equal(lineWith(r, "MIGRATE_PARTIAL_FAILURE:").length, 1);
    assert.equal(readState(dir).last_successful_index, 2);
  });
});

// ---------------------------------------------------------------------------
// Pre-write ordering (amendment BEH-2, BEH-4, BEH-5 steps 1–3)
// ---------------------------------------------------------------------------

test("source/target refusals: github→github is MIGRATE_NOOP, a github source is MIGRATE_GITHUB_UNAVAILABLE, neither touches GitHub", async () => {
  await withBoard(async (dir, manifest) => {
    let r = await migrate(dir, manifest, ["--from", "github", "--to", "github"], migrateFx.fresh);
    assert.equal(r.code, 1);
    assert.equal(lineWith(r, "MIGRATE_NOOP").length, 1);
    assert.equal(lineWith(r, "MIGRATE_GITHUB_UNAVAILABLE").length, 0);
    assert.equal(r.exec.calls.length, 0);
    r = await migrate(dir, manifest, ["--from", "github", "--to", "json"], migrateFx.fresh);
    assert.equal(r.code, 1);
    assert.equal(lineWith(r, "MIGRATE_GITHUB_UNAVAILABLE").length, 1);
    assert.equal(r.exec.calls.length, 0);
    r = await migrate(dir, manifest, ["--to", "nope"], migrateFx.fresh);
    assert.equal(r.code, 1);
    const unknown = lineWith(r, "MIGRATE_UNKNOWN_BACKEND");
    assert.equal(unknown.length, 1);
    for (const b of SUPPORTED_BACKENDS) assert.ok(unknown[0].includes(b), `${b} missing from: ${unknown[0]}`);
    assert.ok(SUPPORTED_BACKENDS.includes("github"));
  });
});

test("resume-argument checks run before preflight, on live runs and --dry-run, and leave the state file as it was", async () => {
  const cases = [
    [JSON.stringify({ source: "json", target: "github", last_successful_index: 0, scope_args: { includeClosed: true } }), "MIGRATE_RESUME_MISMATCH"],
    [JSON.stringify({ source: "beads", target: "github", last_successful_index: 0, scope_args: { includeClosed: false } }), "MIGRATE_RESUME_MISMATCH"],
    [JSON.stringify({ source: "json", target: "github", last_successful_index: 0, scope_args: {} }), "MIGRATE_RESUME_INVALID"],
    [JSON.stringify({ source: "json", target: "github", last_successful_index: 0, scope_args: { includeClosed: "no" } }), "MIGRATE_RESUME_INVALID"],
    ["{not json", "MIGRATE_RESUME_INVALID"],
  ];
  for (const [state, code] of cases) {
    for (const argv of [["--to", "github", "--yes"], ["--to", "github", "--dry-run"]]) {
      await withBoard(async (dir, manifest) => {
        writeFileSync(join(dir, STATE), state);
        const r = await migrate(dir, manifest, argv, migrateFx.fresh);
        assert.equal(r.code, 1, `${state} ${argv.join(" ")}`);
        assert.equal(lineWith(r, code).length, 1, `${state} ${argv.join(" ")}: ${r.stderr.join("\n")}`);
        assert.equal(r.exec.calls.length, 0, "no request before the resume checks pass");
        assert.equal(r.stdout, "");
        assert.equal(readFileSync(join(dir, STATE), "utf8"), state);
      });
    }
  }
});

test("a github scope mismatch names both values and both remedies", async () => {
  await withBoard(async (dir, manifest) => {
    writeFileSync(join(dir, STATE), JSON.stringify({ source: "json", target: "github", last_successful_index: 0, scope_args: { includeClosed: true } }));
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.fresh);
    const [line] = lineWith(r, "MIGRATE_RESUME_MISMATCH");
    assert.match(line, /true/);
    assert.match(line, /false/);
    assert.match(line, /--include-closed/);
    assert.match(line, /delete/i);
  });
});

test("preflight and setup --check failures: the GITHUB_* code on stderr, no envelope, no state file, no mutation", async () => {
  for (const [fx, code] of [[migrateFx.authRequired, "GITHUB_AUTH_REQUIRED"], [migrateFx.legacyFieldMissing, "GITHUB_FIELD_MISSING"]]) {
    await withBoard(async (dir, manifest) => {
      const r = await migrate(dir, manifest, ["--to", "github", "--yes"], fx);
      assert.equal(r.code, 1);
      const lines = lineWith(r, code);
      assert.equal(lines.length, 1, r.stderr.join("\n"));
      if (code === "GITHUB_FIELD_MISSING") assert.ok(lines[0].includes("Legacy ID"), lines[0]);
      assert.equal(r.stdout, "");
      assert.equal(lineWith(r, "MIGRATE_PARTIAL_FAILURE").length, 0);
      assert.deepEqual(mutations(r.exec), []);
      assert.equal(existsSync(join(dir, STATE)), false);
    });
  }
});

test("confirmation seam: a non-interactive run without --yes exits 1 with MIGRATE_CONFIRMATION_REQUIRED and writes nothing", async () => {
  await withBoard(async (dir, manifest) => {
    const r = await migrate(dir, manifest, ["--to", "github"], migrateFx.fresh);
    assert.equal(r.code, 1);
    const lines = lineWith(r, "MIGRATE_CONFIRMATION_REQUIRED");
    assert.equal(lines.length, 1, r.stderr.join("\n"));
    assert.match(lines[0], /--yes/);
    assert.deepEqual(mutations(r.exec), []);
    assert.equal(existsSync(join(dir, STATE)), false);
    assert.equal(existsSync(sentinelPath(dir, "json")), false);
  });
});

test("--dry-run --to github issues no mutation and writes no state file or sentinel", async () => {
  await withBoard(async (dir, manifest) => {
    const r = await migrate(dir, manifest, ["--to", "github", "--dry-run"], migrateFx.fresh);
    assert.equal(r.exec.calls[0]?.operation, "AdevPreflight", "a dry run still runs the read-only pre-write checks");
    assert.ok(ops(r.exec, "ProjectItems").length > 0, "a dry run reads the target board");
    assert.deepEqual(mutations(r.exec), []);
    assert.equal(existsSync(join(dir, STATE)), false);
    assert.equal(existsSync(sentinelPath(dir, "json")), false);
    assert.equal(existsSync(join(dir, UNANCHORED)), false);
  });
});

test("--yes is a value-less boolean flag listed by help() and never recorded in scope_args", async () => {
  assert.equal(parseArgs(["--to", "github", "--yes"]).yes, true);
  assert.equal(parseArgs(["--to", "github"]).yes, false);
  assert.throws(() => parseArgs(["--to", "github", "--yes", "true"]), { code: "MIGRATE_ARG_PARSE" });
  const lines = [];
  const origLog = console.log;
  console.log = (...a) => lines.push(a.map(String).join(" "));
  try { help(); } finally { console.log = origLog; }
  assert.ok(lines.some((l) => l.includes("--yes") && l.includes("Confirm a github migration's write set without prompting.")), lines.join("\n"));
  await withBoard(async (dir, manifest) => {
    await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.failsAtItem2);
    assert.deepEqual(readState(dir).scope_args, { includeClosed: false });
  });
});

// ---------------------------------------------------------------------------
// legacy_id provenance (amendment BEH-11) and echo safety (M-BD-5)
// ---------------------------------------------------------------------------

test("legacy_id provenance: foreign and duplicate values refused before any write, live and --dry-run", async () => {
  for (const [fx, code, named] of [
    [migrateFx.foreignLegacyId, "MIGRATE_TARGET_FOREIGN_LEGACY_ID", ["issue-zzzz99"]],
    [migrateFx.duplicateLegacyId, "GITHUB_AMBIGUOUS_LEGACY_ID", ["gh-101", "gh-105"]],
  ]) {
    for (const extraArg of [[], ["--dry-run"]]) {
      await withBoard(async (dir, manifest) => {
        const r = await migrate(dir, manifest, ["--to", "github", "--yes", ...extraArg], fx);
        assert.equal(r.code, 1);
        const lines = lineWith(r, code);
        assert.equal(lines.length, 1, r.stderr.join("\n"));
        for (const s of named) assert.ok(lines[0].includes(s), `${s} not named in: ${lines[0]}`);
        if (code === "MIGRATE_TARGET_FOREIGN_LEGACY_ID") assert.match(lines[0], /its own project/i);
        assert.equal(r.stdout, "");
        assert.deepEqual(mutations(r.exec), []);
        assert.equal(existsSync(join(dir, STATE)), false);
        assert.equal(existsSync(sentinelPath(dir, "json")), false);
      });
    }
  }
});

test("foreign values: the message names at most 10 of them and the total", async () => {
  await withBoard(async (dir, manifest) => {
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.manyForeignLegacyIds);
    assert.equal(r.code, 1);
    const [line] = lineWith(r, "MIGRATE_TARGET_FOREIGN_LEGACY_ID");
    assert.equal(MANY_FOREIGN.filter((v) => line.includes(v)).length, 10, line);
    assert.match(line, /\b12\b/);
    assert.deepEqual(mutations(r.exec), []);
  });
});

test("a foreign value that is not an adev ID is echoed escaped and capped, never raw", async () => {
  await withBoard(async (dir, manifest) => {
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.unsafeForeignLegacyId);
    assert.equal(r.code, 1);
    const all = r.stderr.join("\n") + r.stdout;
    assert.equal(lineWith(r, "MIGRATE_TARGET_FOREIGN_LEGACY_ID").length, 1, r.stderr.join("\n"));
    assert.equal(all.includes("\u001b"), false, "raw ESC reached the output");
    assert.ok(all.includes("\\u001b"), "the escaped form is shown");
    assert.equal(all.includes("z".repeat(81)), false, "the echoed value is capped at 80 characters");
    assert.deepEqual(mutations(r.exec), []);
  });
});

test("out-of-scope and empty legacy_id values pass provenance and the run completes", async () => {
  for (const fx of [migrateFx.outOfScopeLegacyId, migrateFx.emptyLegacyId]) {
    await withBoard(async (dir, manifest) => {
      const r = await migrate(dir, manifest, ["--to", "github", "--yes"], fx);
      assert.equal(r.code, 0, r.stderr.join("\n"));
      assert.deepEqual(JSON.parse(r.stdout).github.id_map, { e1: "gh-101", "e1.f1": "gh-102", "issue-7k3f9a": "gh-103" });
      for (const [, variables] of mutations(r.exec)) {
        const touched = JSON.stringify(variables);
        assert.equal(/_fixture_(104|150)\b/.test(touched), false, `a mutation touched a pre-existing item: ${touched}`);
      }
    });
  }
});

test("echoValue escapes every C0/C1 control character and caps at 80 characters", () => {
  assert.equal(echoValue("a\u001b[31mb\nc"), "a\\u001b[31mb\\u000ac");
  assert.equal(echoValue("x\u0000y\u009bz\u0085"), "x\\u0000y\\u009bz\\u0085");
  assert.equal(echoValue("issue-7k3f9a"), "issue-7k3f9a");
  const long = echoValue("x".repeat(200));
  assert.ok(long.length <= 81, `${long.length}`);
  assert.ok(long.startsWith("x".repeat(80)));
});

// ---------------------------------------------------------------------------
// Existing sentinel (amendment BEH-12)
// ---------------------------------------------------------------------------

test("existing sentinel for another project or unreadable → MIGRATE_SENTINEL_PROJECT_MISMATCH, byte-identical, no mutation", async () => {
  for (const body of [null, "{not json", JSON.stringify({ schema: 9, reason: "migrated", target: "github", project: PROJECT, migrated_at: "2026-11-01T00:00:00.000Z" })]) {
    await withBoard(async (dir, manifest) => {
      if (body === null) writeSentinel(dir, "json", { project: OTHER_PROJECT });
      else writeFileSync(sentinelPath(dir, "json"), body);
      const before = readFileSync(sentinelPath(dir, "json"));
      const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.fresh);
      assert.equal(r.code, 1);
      const lines = lineWith(r, "MIGRATE_SENTINEL_PROJECT_MISMATCH");
      assert.equal(lines.length, 1, r.stderr.join("\n"));
      assert.ok(lines[0].includes(PROJECT), lines[0]);
      if (body === null) assert.ok(lines[0].includes(OTHER_PROJECT), lines[0]);
      else assert.match(lines[0], /unreadable/i);
      assert.deepEqual(mutations(r.exec), []);
      assert.equal(existsSync(join(dir, STATE)), false);
      assert.deepEqual(readFileSync(sentinelPath(dir, "json")), before);
    });
  }
});

test("existing sentinel naming this project passes the check and stays byte-identical", async () => {
  await withBoard(async (dir, manifest) => {
    writeSentinel(dir, "json", { project: PROJECT });
    const before = readFileSync(sentinelPath(dir, "json"));
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.fresh);
    assert.equal(r.code, 0, r.stderr.join("\n"));
    assert.equal(ops(r.exec, "CreateIssue").length, 3);
    assert.deepEqual(readFileSync(sentinelPath(dir, "json")), before);
  });
});

test("a symlink at the sentinel path → SENTINEL_PATH_UNSAFE before any write", async () => {
  await withBoard(async (dir, manifest) => {
    const outside = join(dir, "outside.json");
    writeFileSync(outside, "{}");
    symlinkSync(outside, sentinelPath(dir, "json"));
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.fresh);
    assert.equal(r.code, 1);
    assert.equal(lineWith(r, "SENTINEL_PATH_UNSAFE").length, 1, r.stderr.join("\n"));
    assert.deepEqual(mutations(r.exec), []);
    assert.equal(readFileSync(outside, "utf8"), "{}");
  });
});

// ---------------------------------------------------------------------------
// Redaction and the stderr chokepoint (amendment BEH-6, BEH-10; WR-8)
// ---------------------------------------------------------------------------

test("redaction: no secret reaches stdout or stderr", async () => {
  process.env.GH_TOKEN = ENV_TOKEN;
  try {
    await withBoard(async (dir, manifest) => {
      const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.secretInError);
      assert.equal(r.code, 1);
      assert.equal(JSON.parse(r.stdout).errors[0].source_id, "e1");
      const all = r.stdout + r.stderr.join("\n");
      for (const s of [ENV_TOKEN, "ghp_", "github_pat_", "abc.def"]) assert.equal(all.includes(s), false, s);
      assert.ok(all.includes("[REDACTED]"));
    });
  } finally {
    delete process.env.GH_TOKEN;
  }
  assert.equal(redact("Authorization: token s3cr3t-value"), "Authorization: token [REDACTED]");
  assert.equal(redact("authorization:Bearer abc.def rest"), "authorization:Bearer [REDACTED] rest");
  assert.equal(redact("AUTHORIZATION: bearer x1 and Authorization: token y2"), "AUTHORIZATION: bearer [REDACTED] and Authorization: token [REDACTED]");
  assert.equal(redact("authorization is required"), "authorization is required");
});

test("createGithubOutput redacts both sinks: stdout as one JSON string through log, stderr through console.error", () => {
  const secret = "literal-secret-value";
  const logged = [];
  const errs = [];
  const origErr = console.error;
  console.error = (...a) => errs.push(a.map(String).join(" "));
  try {
    const out = createGithubOutput({ log: (s) => logged.push(s), env: { GH_TOKEN: secret } });
    out.stdout({ errors: [{ message: `bad ${secret} Authorization: bearer q.w` }] });
    out.stderr(`MIGRATE_PARTIAL_FAILURE: ${secret}`);
  } finally {
    console.error = origErr;
  }
  assert.equal(logged.length, 1);
  assert.equal(typeof logged[0], "string");
  assert.deepEqual(JSON.parse(logged[0]), { errors: [{ message: "bad [REDACTED] Authorization: bearer [REDACTED]" }] });
  assert.deepEqual(errs, ["MIGRATE_PARTIAL_FAILURE: [REDACTED]"]);
});

test("single stderr chokepoint and no configurable seams (WR-8, BEH-10)", () => {
  const src = readFileSync(join(PLUGIN_ROOT, "lib/issues/github/migrate.mjs"), "utf8");
  assert.equal(src.match(/console\.error\(/g)?.length, 1);
  assert.equal(src.match(/console\.log\(/g), null);
  for (const f of ["lib/cli/issues-migrate.mjs", "lib/issues/github/migrate.mjs"]) {
    assert.doesNotMatch(readFileSync(join(PLUGIN_ROOT, f), "utf8"), /process\.env\.[A-Z_]*(EXEC|TTY|SLEEP|READLINE|LOG|NOW)/);
  }
});

// ---------------------------------------------------------------------------
// Unanchored window (GitHub spec BEH-14, BEH-30)
// ---------------------------------------------------------------------------

test("unanchored window: recorded, completed exactly, then removed", async () => {
  await withBoard(async (dir, manifest) => {
    let r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.unanchoredAtItem2);
    assert.equal(r.code, 1);
    const e = JSON.parse(r.stdout).errors[0];
    assert.equal(e.code, "GITHUB_PARTIAL_CREATE");
    assert.equal(e.target_id, "gh-102");
    assert.ok(e.unwritten_fields.includes("legacy_id") && e.unwritten_fields.includes("project"), JSON.stringify(e.unwritten_fields));
    assert.deepEqual(JSON.parse(readFileSync(join(dir, UNANCHORED), "utf8")), { source_id: "e1.f1", target_id: "gh-102" });
    assert.equal(lineWith(r, "MIGRATE_PARTIAL_FAILURE:").length, 1);
    assert.ok(r.stderr.some((l) => l.includes("gh-102") && /do not delete/i.test(l)), r.stderr.join("\n"));

    r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.completeUnanchored);
    assert.equal(r.code, 0, r.stderr.join("\n"));
    assert.deepEqual(ops(r.exec, "CreateIssue").map((c) => c.variables.title), [TITLES.t]);
    assert.deepEqual(ops(r.exec, "AddToProject")[0].variables, { projectId: "PVT_fixture", contentId: "I_fixture_102" });
    const first = ops(r.exec, "SetFields")[0].variables;
    assert.equal(first.itemId, "PVTI_fixture_102");
    assert.equal(first.f0Field, TEXT_FIELD_IDS.legacy_id);
    assert.equal(first.f0Value, "e1.f1");
    assert.deepEqual(JSON.parse(r.stdout).github.id_map, { e1: "gh-101", "e1.f1": "gh-102", "issue-7k3f9a": "gh-103" });
    assert.equal(existsSync(join(dir, UNANCHORED)), false);
  });
});

test("unanchored window: a recorded issue that is closed or gone → MIGRATE_UNANCHORED_ITEM on every re-run, before any mutation", async () => {
  for (const fx of [migrateFx.unanchoredClosed, migrateFx.unanchoredGone]) {
    await withBoard(async (dir, manifest) => {
      await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.unanchoredAtItem2);
      const record = readFileSync(join(dir, UNANCHORED));
      for (let i = 0; i < 2; i += 1) {
        const r = await migrate(dir, manifest, ["--to", "github", "--yes"], fx);
        assert.equal(r.code, 1);
        const lines = lineWith(r, "MIGRATE_UNANCHORED_ITEM");
        assert.equal(lines.length, 1, r.stderr.join("\n"));
        assert.ok(lines[0].includes("e1.f1") && lines[0].includes("gh-102"), lines[0]);
        assert.match(lines[0], /Legacy ID/);
        assert.equal(r.stdout, "");
        assert.deepEqual(mutations(r.exec), []);
        assert.deepEqual(readFileSync(join(dir, UNANCHORED)), record);
      }
    });
  }
});

test("unanchored window: --dry-run reads the record and neither writes nor removes it", async () => {
  await withBoard(async (dir, manifest) => {
    await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.unanchoredAtItem2);
    const record = readFileSync(join(dir, UNANCHORED));
    const state = readFileSync(join(dir, STATE));
    const r = await migrate(dir, manifest, ["--to", "github", "--dry-run"], migrateFx.completeUnanchored);
    assert.deepEqual(mutations(r.exec), []);
    assert.ok(r.exec.calls.some((c) => c.query === ISSUE_QUERY && c.variables.number === 102), "the recorded issue is read");
    assert.deepEqual(readFileSync(join(dir, UNANCHORED)), record);
    assert.deepEqual(readFileSync(join(dir, STATE)), state);
  });
});

test("unanchored record is fail-closed: a symlink, unparseable content or invalid IDs refuse before any write and are never echoed raw", async () => {
  const bodies = [
    "{not json",
    JSON.stringify({ source_id: "gh-5", target_id: "gh-102" }),
    JSON.stringify({ source_id: "e1.f1", target_id: "issue-7k3f9a" }),
    JSON.stringify({ source_id: "e1.f1\u001b[2J", target_id: "gh-102" }),
  ];
  for (const body of [...bodies, { symlink: JSON.stringify({ source_id: "e1.f1", target_id: "gh-102" }) }]) {
    await withBoard(async (dir, manifest) => {
      const path = join(dir, UNANCHORED);
      let outside = null;
      if (typeof body === "string") writeFileSync(path, body);
      else {
        outside = join(dir, "outside.json");
        writeFileSync(outside, body.symlink);
        symlinkSync(outside, path);
      }
      const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.completeUnanchored);
      assert.equal(r.code, 1, `${JSON.stringify(body)}: ${r.stderr.join("\n")}`);
      assert.ok(ops(r.exec, "ProjectItems").length > 0, "the record is read after the target-board read");
      assert.deepEqual(mutations(r.exec), []);
      assert.equal(r.stdout, "");
      assert.equal((r.stderr.join("\n")).includes("\u001b"), false);
      assert.ok(existsSync(path));
      if (outside) assert.equal(readFileSync(outside, "utf8"), body.symlink);
    });
  }
});

test("a re-run with a closed item already migrated and closed makes no write and needs no --yes", async () => {
  await withBoard(async (dir, manifest) => {
    writeSentinel(dir, "json", { project: PROJECT });
    const r = await migrate(dir, manifest, ["--to", "github", "--include-closed"], migrateFx.closedAllPresent);
    assert.equal(r.code, 0, r.stderr.join("\n"));
    assert.deepEqual(mutations(r.exec), []);
    assert.equal(JSON.parse(r.stdout).github.id_map["issue-c0ffee"], "gh-104");
  });
});

test("unanchored window: an existing record is completed before any create, so a second window never overwrites it", async () => {
  await withBoard(async (dir, manifest) => {
    writeFileSync(join(dir, UNANCHORED), JSON.stringify({ source_id: "issue-7k3f9a", target_id: "gh-103" }));
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.unanchoredLaterItem);
    assert.equal(r.code, 1);
    const names = r.exec.calls.filter(isMutation).map((c) => c.operation);
    assert.deepEqual(names, ["AddToProject", "SetFields", "AddLabels", "CreateIssue", "AddToProject"]);
    assert.equal(ops(r.exec, "SetFields")[0].variables.f0Value, "issue-7k3f9a");
    assert.deepEqual(JSON.parse(readFileSync(join(dir, UNANCHORED), "utf8")), { source_id: "e1.f1", target_id: "gh-102" });
    assert.equal(JSON.parse(r.stdout).errors[0].target_id, "gh-102");
  });
});

test("unanchored window: when completing the recorded issue fails, nothing is created and the record stays", async () => {
  await withBoard(async (dir, manifest) => {
    const body = JSON.stringify({ source_id: "issue-7k3f9a", target_id: "gh-103" });
    writeFileSync(join(dir, UNANCHORED), body);
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.unanchoredCompletionFails);
    assert.equal(r.code, 1);
    assert.equal(ops(r.exec, "CreateIssue").length, 0);
    const e = JSON.parse(r.stdout).errors[0];
    assert.equal(e.source_id, "issue-7k3f9a");
    assert.equal(e.target_id, "gh-103");
    assert.equal(lineWith(r, "MIGRATE_PARTIAL_FAILURE:").length, 1);
    assert.equal(readFileSync(join(dir, UNANCHORED), "utf8"), body);
  });
});

test("unanchored window: another item already holding the source ID's Legacy ID → MIGRATE_UNANCHORED_ITEM naming both", async () => {
  await withBoard(async (dir, manifest) => {
    const body = JSON.stringify({ source_id: "e1.f1", target_id: "gh-102" });
    writeFileSync(join(dir, UNANCHORED), body);
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.unanchoredSourceHeldElsewhere);
    assert.equal(r.code, 1);
    const [line] = lineWith(r, "MIGRATE_UNANCHORED_ITEM");
    assert.ok(line && line.includes("gh-102") && line.includes("gh-110") && line.includes("e1.f1"), r.stderr.join("\n"));
    assert.deepEqual(mutations(r.exec), []);
    assert.equal(readFileSync(join(dir, UNANCHORED), "utf8"), body);
  });
});

test("unanchored window: a record that cannot be written (tasks dir outside the storage root) still yields the envelope naming the orphan", async () => {
  const outside = createTempDir();
  try {
    await withBoard(async (dir, manifest) => {
      const tasks = join(dir, ".context-index", "tasks");
      renameSync(tasks, join(outside, "tasks"));
      symlinkSync(join(outside, "tasks"), tasks);
      const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.unanchoredAtItem2);
      assert.equal(r.code, 1);
      assert.equal(JSON.parse(r.stdout).errors[0].target_id, "gh-102");
      const lines = lineWith(r, "MIGRATE_PARTIAL_FAILURE:");
      assert.equal(lines.length, 1);
      assert.ok(lines[0].includes("gh-102") && lines[0].includes("SENTINEL_PATH_UNSAFE"), lines[0]);
      assert.equal(existsSync(join(outside, "tasks", ".migrate-unanchored.json")), false);
    });
  } finally {
    cleanupTempDir(outside);
  }
});

test("a rate limit on the board re-read before link replay stops with the envelope and reset_at", async () => {
  await withBoard(async (dir, manifest) => {
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.replayReadRateLimited);
    assert.equal(r.code, 1);
    const report = JSON.parse(r.stdout);
    assert.equal(report.manifest_update_suggested, false);
    assert.equal(report.errors.length, 1);
    assert.equal(report.errors[0].code, "GITHUB_RATE_LIMITED");
    assert.equal(report.errors[0].source_id, "e1");
    assert.equal(report.errors[0].reset_at, RESET_AT);
    assert.equal(lineWith(r, "MIGRATE_PARTIAL_FAILURE:").length, 1);
    assert.equal(readState(dir).last_successful_index, 2);
  });
});

test("a state-file write failure after an item is written stops with the envelope naming that item (supplement: the fs failure is injected through migrateToGithub's resume seam)", async () => {
  await withBoard(async (dir, manifest) => {
    const exec = replayExec(migrateFx.fresh);
    const logged = [];
    const errs = [];
    const fsError = Object.assign(new Error("adev-fixture: no space left on device"), { code: "ENOSPC" });
    const code = await migrateToGithub({
      projectRoot: dir,
      storageRoot: dir,
      manifest,
      source: "json",
      includeClosed: false,
      dryRun: false,
      confirm: async () => true,
      resume: { write: () => { throw fsError; }, clear: () => {} },
      out: { stdout: (o) => logged.push(o), stderr: (l) => errs.push(l) },
      exec,
      ...noWait,
    });
    assert.equal(code, 1);
    assert.equal(logged.length, 1);
    assert.deepEqual(logged[0].errors.map((e) => [e.source_id, e.code]), [["e1", "ENOSPC"]]);
    assert.equal(errs.filter((l) => l.startsWith("MIGRATE_PARTIAL_FAILURE: ENOSPC at e1")).length, 1);
    assert.equal(ops(exec, "CreateIssue").length, 1, "the run stops after the item whose state write failed");
  });
});

test("closing migrated closed items reads the board no more often than a run without them", async () => {
  const reads = [];
  for (const [argv, fx] of [[["--to", "github", "--yes"], migrateFx.fresh], [["--to", "github", "--include-closed", "--yes"], migrateFx.includeClosed]]) {
    await withBoard(async (dir, manifest) => {
      const r = await migrate(dir, manifest, argv, fx);
      assert.equal(r.code, 0, r.stderr.join("\n"));
      reads.push(ops(r.exec, "ProjectItems").length);
      if (fx === migrateFx.includeClosed) {
        const closing = r.exec.calls.filter(isMutation).filter((c) => c.variables.itemId === "PVTI_fixture_104" || c.variables.issueId === "I_fixture_104");
        // The create's own SetFields, then the close: the Done status option alone, then CloseIssue.
        assert.deepEqual(closing.map((c) => c.operation), ["SetFields", "SetFields", "CloseIssue"]);
        assert.equal(closing[0].variables.f0Field, TEXT_FIELD_IDS.legacy_id);
        assert.deepEqual(closing[1].variables, { projectId: "PVT_fixture", itemId: "PVTI_fixture_104", f0Field: "PVTSSF_status", f0Value: "opt_5" });
        assert.deepEqual(closing[2].variables, { issueId: "I_fixture_104" });
      }
    });
  }
  assert.equal(reads[1], reads[0]);
});

test("an unanchored record for a source item outside this run's scope is refused before any write", async () => {
  await withBoard(async (dir, manifest) => {
    const body = JSON.stringify({ source_id: "issue-c0ffee", target_id: "gh-104" });
    writeFileSync(join(dir, UNANCHORED), body);
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.unanchoredOutOfScope);
    assert.equal(r.code, 1);
    const [line] = lineWith(r, "MIGRATE_UNANCHORED_ITEM");
    assert.ok(line && line.includes("issue-c0ffee") && line.includes("gh-104") && /scope/.test(line), r.stderr.join("\n"));
    assert.deepEqual(mutations(r.exec), []);
    assert.equal(readFileSync(join(dir, UNANCHORED), "utf8"), body);
  });
});

test("an in-scope target item whose decode failed is refused up front with its own code, never treated as partial", async () => {
  await withBoard(async (dir, manifest) => {
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.inScopeUndecodable);
    assert.equal(r.code, 1);
    const lines = lineWith(r, "GITHUB_UNMAPPED_STATUS");
    assert.equal(lines.length, 1, r.stderr.join("\n"));
    assert.ok(lines[0].includes("gh-101"), lines[0]);
    assert.equal(r.stdout, "");
    assert.deepEqual(mutations(r.exec), []);
    assert.equal(existsSync(join(dir, STATE)), false);
  });
});
