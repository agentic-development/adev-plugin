import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PLUGIN_ROOT, createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";
import { writeBlockers, sidecarPathForSpec } from "../../lib/blockers-writer.mjs";

const CLI = join(PLUGIN_ROOT, "cli", "index.mjs");
const SPEC = ".context-index/specs/cross-cutting/s.spec.md";
const SPEC_TEXT = [
  "---", "revision: 3", "status: review-pending", "---", "# S", "",
  "## Alpha", "a", "", "## Beta", "b", "",
].join("\n");
const ID1 = "r:t:00000001";
const ID2 = "r:t:00000002";

function seed({ sidecar = true } = {}) {
  const root = createTempDir();
  writeFixture(root, SPEC, SPEC_TEXT);
  if (sidecar) {
    writeBlockers(root, SPEC, [
      {
        blocker_id: ID1, section_anchor: "alpha", reviewer: "r", finding_class: "decision",
        prose: "Which store should hold state?",
        question: "Which store should hold state?",
        options: [{ label: "File", implications: "simple" }, { label: "DB", implications: "heavier" }],
      },
      {
        blocker_id: ID2, section_anchor: "beta", reviewer: "r", finding_class: "decision",
        prose: "Pick a name. More text.",
      },
    ], { revision: 3 });
  }
  return root;
}

function cli(root, args) {
  return spawnSync(process.execPath, [CLI, "decisions", ...args], { cwd: root, encoding: "utf8" });
}

test("pending --json prints {spec, pending, answered, decided, ask_round, advisories}, exit 0", () => {
  const root = seed();
  try {
    const r = cli(root, ["pending", "--spec", SPEC, "--json"]);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(Object.keys(out).sort(), ["advisories", "answered", "ask_round", "decided", "pending", "spec"]);
    assert.equal(out.spec, SPEC);
    assert.deepEqual(out.pending.map((p) => p.blocker_id), [ID1, ID2]);
    assert.equal(out.pending[0].question, "Which store should hold state?");
    assert.deepEqual(out.pending[0].options, [
      { label: "File", implications: "simple" },
      { label: "DB", implications: "heavier" },
    ]);
    assert.deepEqual(out.ask_round, { limit: 16, asked: 2, overflow: 0 });
  } finally { cleanupTempDir(root); }
});

test("pending without --json prints one line per item, option lines, and ask_round summary", () => {
  const root = seed();
  try {
    const r = cli(root, ["pending", "--spec", SPEC]);
    assert.equal(r.status, 0, r.stderr);
    const lines = r.stdout.split("\n");
    assert.ok(lines[0].startsWith(`${ID1} [`));
    assert.ok(lines[0].endsWith("Which store should hold state?"));
    assert.equal(lines[1], "  - File: simple");
    assert.equal(lines[2], "  - DB: heavier");
    assert.ok(lines[3].startsWith(`${ID2} [`));
    assert.match(r.stdout, /ask round: 2 asked, 0 overflow \(limit 16\)/);
  } finally { cleanupTempDir(root); }
});

test("pending on a spec with no sidecar -> pending [], exit 0", () => {
  const root = seed({ sidecar: false });
  try {
    const r = cli(root, ["pending", "--spec", SPEC, "--json"]);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout).pending, []);
  } finally { cleanupTempDir(root); }
});

test("record --answers inline JSON writes and exits 0; --json prints {recorded, advisories}", () => {
  const root = seed();
  try {
    const answers = JSON.stringify([{ blocker_ids: [ID1], choice: "File", note: "keep it simple" }]);
    const r = cli(root, ["record", "--spec", SPEC, "--answers", answers, "--json"]);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), { recorded: [ID1], advisories: [] });
    assert.ok(readFileSync(join(root, sidecarPathForSpec(SPEC)), "utf8").includes("File"));
    const p = JSON.parse(cli(root, ["pending", "--spec", SPEC, "--json"]).stdout);
    assert.deepEqual(p.pending.map((x) => x.blocker_id), [ID2]);
    assert.deepEqual(p.answered.map((x) => x.blocker_id), [ID1]);
  } finally { cleanupTempDir(root); }
});

test("record --answers @file works and prints a confirmation naming the ids", () => {
  const root = seed();
  try {
    writeFixture(root, "tmp/answers.json", JSON.stringify([{ blocker_ids: [ID1, ID2], choice: "Same" }]));
    const r = cli(root, ["record", "--spec", SPEC, "--answers", "@tmp/answers.json"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /recorded 2 decision\(s\): r:t:00000001, r:t:00000002/);
  } finally { cleanupTempDir(root); }
});

test("each fatal code exits 1 with '<CODE>: <message>' on stderr and nothing written", () => {
  const root = seed();
  const sidecar = join(root, sidecarPathForSpec(SPEC));
  const before = readFileSync(sidecar, "utf8");
  const ans = (a) => JSON.stringify(a);
  const cases = [
    ["INVALID_SPEC_PATH", ["pending", "--spec", "docs/x.spec.md"]],
    ["INVALID_DECISION_ANSWERS", ["record", "--spec", SPEC, "--answers", "not json"]],
    ["UNKNOWN_DECISION_BLOCKER", ["record", "--spec", SPEC, "--answers", ans([{ blocker_ids: ["r:t:99999999"], choice: "A" }])]],
    ["UNSAFE_DECISION_TEXT", ["record", "--spec", SPEC, "--answers", ans([{ blocker_ids: [ID1], choice: "x".repeat(5000) }])]],
  ];
  try {
    for (const [code, args] of cases) {
      const r = cli(root, args);
      assert.equal(r.status, 1, code);
      assert.ok(r.stderr.startsWith(`${code}: `), `${code}: ${r.stderr}`);
      assert.equal(r.stdout, "");
    }
    const noSidecar = seed({ sidecar: false });
    try {
      const r = cli(noSidecar, ["record", "--spec", SPEC, "--answers", ans([{ blocker_ids: [ID1], choice: "A" }])]);
      assert.equal(r.status, 1);
      assert.ok(r.stderr.startsWith("NO_REVIEW_SIDECARS: "), r.stderr);
    } finally { cleanupTempDir(noSidecar); }
    assert.equal(readFileSync(sidecar, "utf8"), before);
  } finally { cleanupTempDir(root); }
});

test("missing --spec / missing --answers / unknown subcommand -> usage on stderr, exit 1", () => {
  const root = seed();
  try {
    for (const args of [["pending"], ["record", "--spec", SPEC], ["record", "--answers", "[]"], ["bogus"], []]) {
      const r = cli(root, args);
      assert.equal(r.status, 1, args.join(" "));
      assert.match(r.stderr, /usage: adev decisions/);
    }
  } finally { cleanupTempDir(root); }
});

test("decisions --help lists both subcommands", () => {
  const root = seed();
  try {
    const r = cli(root, ["--help"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /adev decisions pending --spec/);
    assert.match(r.stdout, /adev decisions record --spec/);
  } finally { cleanupTempDir(root); }
});
