import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { PassThrough } from "node:stream";
import { PLUGIN_ROOT, createTempDir, cleanupTempDir } from "../../helpers.mjs";
import { isInteractive, promptConfirm, run } from "../../../lib/cli/issues-github.mjs";
import { replayExec } from "./replay-transport.mjs";
import { setupFx, STUB_RESPONSES } from "./fixtures/setup.mjs";

const manifest = { tasks: { backend: "github", github: { project: "https://github.com/orgs/acme/projects/7", repo: "acme/board" } } };
const runWith = (fx, argv, opts = {}) => run({ projectRoot: "/tmp/unused", argv, manifest, exec: replayExec(fx), isTTY: false, ...opts });

test("--check and --dry-run never mutate", async () => {
  for (const argv of [["setup", "--check"], ["setup", "--dry-run"]]) {
    const exec = replayExec(setupFx.emptyProject);
    await run({ projectRoot: "/tmp/unused", argv, manifest, exec, isTTY: false });
    assert.equal(exec.calls.filter((c) => c.query.trimStart().startsWith("mutation")).length, 0, argv.join(" "));
  }
});

test("--check reports every drift category and exits 0 when fields are complete", async () => {
  const out = [];
  const code = await runWith(setupFx.completeWithDrift, ["setup", "--check", "--json"], { log: (s) => out.push(s) });
  assert.equal(code, 0);
  const kinds = new Set(JSON.parse(out.join("")).drift.map((d) => d.kind));
  for (const k of ["closed-mapped-open", "unmapped-status", "subissue-not-on-project", "owner-without-claimed-at", "invalid-field-value", "unknown-module-label"]) assert.ok(kinds.has(k), k);
});

test("non-interactive without --yes refuses before any write; --yes creates exactly the recommended board", async () => {
  assert.equal(await runWith(setupFx.emptyProject, ["setup"]), 1);
  const exec = replayExec(setupFx.emptyProjectCreate);
  await run({ projectRoot: "/tmp/unused", argv: ["setup", "--yes"], manifest, exec, isTTY: false });
  assert.deepEqual(exec.calls.filter((c) => c.operation === "CreateField").map((c) => c.variables.name).sort(),
    ["Branch", "Claimed At", "Legacy ID", "Next Action", "Owner", "PR", "Plan", "Priority", "Spec", "Status"].sort());
});

test("existing options: only missing ones added; nothing deleted, renamed, or cleared", async () => {
  const exec = replayExec(setupFx.partialOptions);
  await run({ projectRoot: "/tmp/unused", argv: ["setup", "--yes"], manifest, exec, isTTY: false });
  assert.ok(exec.calls.every((c) => !/delete|archive|clearProjectV2ItemFieldValue/i.test(c.query)));
});

// ---------------------------------------------------------------------------
// Thorough cases beyond the plan's four (BEH-26, BEH-27, BEH-28).
// ---------------------------------------------------------------------------

// Safety net: an implementation that ignored the injected `exec` and spawned the
// real `gh` would find no `gh` on PATH and no token, so it could never reach GitHub.
const ORIGINAL_PATH = process.env.PATH ?? "";
const NO_GH_DIR = createTempDir();
process.env.PATH = NO_GH_DIR;
delete process.env.GH_TOKEN;
delete process.env.GITHUB_TOKEN;

const CLI = join(PLUGIN_ROOT, "cli", "index.mjs");
const RECOMMENDED_FIELDS = ["Branch", "Claimed At", "Legacy ID", "Next Action", "Owner", "PR", "Plan", "Priority", "Spec", "Status"];
const STATUS_OPTIONS = ["Backlog", "Ready", "In Progress", "In Review", "Deferred", "Done"];
const PRIORITY_OPTIONS = ["P0", "P1", "P2", "P3", "P4"];
const TEXT_FIELDS = ["Owner", "Claimed At", "Next Action", "Spec", "Plan", "Branch", "PR", "Legacy ID"];
const modulesManifest = { ...manifest, modules: [{ slug: "billing" }] };

const isMutation = (c) => c.query.trimStart().startsWith("mutation");
const mutations = (exec) => exec.calls.filter(isMutation);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (s) => new RegExp(`(^|[^A-Za-z0-9])${escapeRe(s)}($|[^A-Za-z0-9])`);
const idFirstLine = (id) => new RegExp(`^\\s*(?:[-*]\\s+)?${escapeRe(id)}(?![0-9])`);

function capture() {
  const lines = [];
  const push = (s) => lines.push(String(s));
  return { lines, log: push, error: push, text: () => lines.join("\n") };
}

function lineWith(text, ...needles) {
  return text.split("\n").find((l) => needles.every((n) => (n instanceof RegExp ? n.test(l) : word(n).test(l))));
}

// A replay exec that also records, in one timeline with the output sinks, when each
// mutation was sent — so "printed before any write" is checked by order, not content alone.
function timed(fx) {
  const events = [];
  const replay = replayExec(fx);
  const exec = Object.assign((cmd, args, opts) => {
    const { query } = JSON.parse(opts.input);
    if (query.trimStart().startsWith("mutation")) events.push({ mutation: true });
    return replay(cmd, args, opts);
  }, { calls: replay.calls });
  const sink = (s) => events.push({ log: String(s) });
  return { exec, events, log: sink, error: sink };
}

const firstMutation = (events) => events.findIndex((e) => e.mutation);
const loggedBefore = (events, index) => events.slice(0, index === -1 ? events.length : index).filter((e) => "log" in e).map((e) => e.log).join("\n");

// --- --check: field report (BEH-26) -----------------------------------------

test("--check --json on a complete project: every required field and option is ok, ok is true, exit 0", async () => {
  const out = capture();
  const code = await runWith(setupFx.complete, ["setup", "--check", "--json"], out);
  assert.equal(code, 0);
  const report = JSON.parse(out.lines.join(""));
  assert.equal(report.ok, true);
  for (const name of RECOMMENDED_FIELDS) {
    const field = report.fields.find((f) => f.name === name);
    assert.ok(field, `field ${name} reported`);
    assert.equal(field.status, "ok", name);
  }
  const status = report.fields.find((f) => f.name === "Status");
  assert.deepEqual(status.options.map((o) => [o.name, o.status]), STATUS_OPTIONS.map((o) => [o, "ok"]));
  const priority = report.fields.find((f) => f.name === "Priority");
  assert.deepEqual(priority.options.map((o) => [o.name, o.status]), PRIORITY_OPTIONS.map((o) => [o, "ok"]));
  assert.deepEqual(report.drift, []);
});

test("--check on an empty project reports every field missing and exits 1", async () => {
  const out = capture();
  const code = await runWith(setupFx.emptyProject, ["setup", "--check", "--json"], out);
  assert.equal(code, 1);
  const report = JSON.parse(out.lines.join(""));
  assert.equal(report.ok, false);
  for (const name of RECOMMENDED_FIELDS) assert.equal(report.fields.find((f) => f.name === name)?.status, "missing", name);
});

test("--check human output prints one ok/missing line per field and per option", async () => {
  const complete = capture();
  assert.equal(await runWith(setupFx.complete, ["setup", "--check"], complete), 0);
  for (const name of [...RECOMMENDED_FIELDS, ...STATUS_OPTIONS, ...PRIORITY_OPTIONS]) {
    assert.ok(lineWith(complete.text(), name, /\bok\b/), `${name} ok line`);
  }
  const empty = capture();
  assert.equal(await runWith(setupFx.emptyProject, ["setup", "--check"], empty), 1);
  for (const name of RECOMMENDED_FIELDS) assert.ok(lineWith(empty.text(), name, /\bmissing\b/), `${name} missing line`);
});

test("--check reports a field of the wrong type as `wrong type` and exits 1", async () => {
  const json = capture();
  assert.equal(await runWith(setupFx.ownerWrongType, ["setup", "--check", "--json"], json), 1);
  const report = JSON.parse(json.lines.join(""));
  assert.equal(report.ok, false);
  assert.equal(report.fields.find((f) => f.name === "Owner").status, "wrong type");
  assert.equal(report.fields.find((f) => f.name === "Claimed At").status, "ok");
  const human = capture();
  assert.equal(await runWith(setupFx.ownerWrongType, ["setup", "--check"], human), 1);
  assert.ok(lineWith(human.text(), "Owner", /wrong type/), "Owner wrong type line");
});

test("--check reports a missing status option and exits 1; the other options stay ok", async () => {
  const out = capture();
  assert.equal(await runWith(setupFx.statusOptionMissing, ["setup", "--check", "--json"], out), 1);
  const report = JSON.parse(out.lines.join(""));
  assert.equal(report.ok, false);
  const options = Object.fromEntries(report.fields.find((f) => f.name === "Status").options.map((o) => [o.name, o.status]));
  assert.deepEqual(options, { Backlog: "ok", Ready: "ok", "In Progress": "ok", "In Review": "ok", Deferred: "missing", Done: "ok" });
});

test("--check requires Legacy ID: a project without it exits 1 naming the field missing", async () => {
  const out = capture();
  assert.equal(await runWith(setupFx.legacyIdMissing, ["setup", "--check", "--json"], out), 1);
  const report = JSON.parse(out.lines.join(""));
  assert.equal(report.fields.find((f) => f.name === "Legacy ID").status, "missing");
  assert.equal(report.fields.find((f) => f.name === "Owner").status, "ok");
});

// --- --check: drift (BEH-26, WR-2) ------------------------------------------

const checkDrift = (argv, out) => run({ projectRoot: "/tmp/unused", argv, manifest: modulesManifest, exec: replayExec(setupFx.completeWithDrift), isTTY: false, ...out });

test("--check drift: exactly one entry per seeded category, on the seeded item, none on the controls", async () => {
  const out = capture();
  const code = await checkDrift(["setup", "--check", "--json"], out);
  assert.equal(code, 0, "drift alone is a warning");
  const report = JSON.parse(out.lines.join(""));
  assert.equal(report.ok, true);
  assert.deepEqual(report.drift.map((d) => `${d.id}:${d.kind}`).sort(), [
    "gh-2:closed-mapped-open",
    "gh-3:unmapped-status",
    "gh-4:subissue-not-on-project",
    "gh-5:owner-without-claimed-at",
    "gh-6:invalid-field-value",
    "gh-7:unknown-module-label",
  ]);
  const offProject = report.drift.find((d) => d.kind === "subissue-not-on-project");
  assert.match(JSON.stringify(offProject), /gh-900/, "names the off-project sub-issue");
  const unknownModule = report.drift.find((d) => d.kind === "unknown-module-label");
  assert.match(JSON.stringify(unknownModule), /nope/, "names the unknown slug");
});

for (const [kind, id] of [
  ["closed-mapped-open", "gh-2"],
  ["unmapped-status", "gh-3"],
  ["subissue-not-on-project", "gh-4"],
  ["owner-without-claimed-at", "gh-5"],
  ["invalid-field-value", "gh-6"],
  ["unknown-module-label", "gh-7"],
]) {
  test(`--check drift category ${kind} is reported for ${id} in --json and as an ID-first human line`, async () => {
    const json = capture();
    await checkDrift(["setup", "--check", "--json"], json);
    const entries = JSON.parse(json.lines.join("")).drift.filter((d) => d.kind === kind);
    assert.deepEqual(entries.map((d) => d.id), [id]);

    const human = capture();
    assert.equal(await checkDrift(["setup", "--check"], human), 0);
    assert.ok(human.text().split("\n").some((l) => idFirstLine(id).test(l)), `a drift line starts with ${id}`);
  });
}

test("--check drift ignores clean, claimed, closed, known-module and reserved-tag items", async () => {
  const human = capture();
  assert.equal(await checkDrift(["setup", "--check"], human), 0);
  assert.ok(human.text().split("\n").some((l) => idFirstLine("gh-2").test(l)), "the drift section is printed");
  for (const id of ["gh-1", "gh-8", "gh-9", "gh-10", "gh-11", "gh-12"]) {
    assert.ok(!human.text().split("\n").some((l) => idFirstLine(id).test(l)), `no drift line for ${id}`);
  }
});

test("--check drift: without manifest modules, a module: label of any slug but a reserved tag is unknown", async () => {
  const out = capture();
  await runWith(setupFx.completeWithDrift, ["setup", "--check", "--json"], out);
  const unknown = JSON.parse(out.lines.join("")).drift.filter((d) => d.kind === "unknown-module-label").map((d) => d.id).sort();
  assert.deepEqual(unknown, ["gh-10", "gh-7"]);
});

// --- write set, confirmation, --yes (BEH-27) --------------------------------

test("SETUP_CONFIRMATION_REQUIRED: non-interactive without --yes exits 1, names the code, sends no mutation", async () => {
  const out = capture();
  const exec = replayExec(setupFx.emptyProjectCreate);
  const code = await run({ projectRoot: "/tmp/unused", argv: ["setup"], manifest, exec, isTTY: false, ...out });
  assert.equal(code, 1);
  assert.match(out.text(), /SETUP_CONFIRMATION_REQUIRED/);
  assert.equal(mutations(exec).length, 0);
});

test("--auto does not imply --yes", async () => {
  const out = capture();
  const exec = replayExec(setupFx.emptyProjectCreate);
  assert.equal(await run({ projectRoot: "/tmp/unused", argv: ["setup", "--auto"], manifest, exec, isTTY: false, ...out }), 1);
  assert.match(out.text(), /SETUP_CONFIRMATION_REQUIRED/);
  assert.equal(mutations(exec).length, 0);
});

test("--yes is never read from configuration", async () => {
  const configured = { tasks: { ...manifest.tasks, yes: true, auto_confirm: true }, yes: true };
  const out = capture();
  const exec = replayExec(setupFx.emptyProjectCreate);
  assert.equal(await run({ projectRoot: "/tmp/unused", argv: ["setup"], manifest: configured, exec, isTTY: false, ...out }), 1);
  assert.match(out.text(), /SETUP_CONFIRMATION_REQUIRED/);
  assert.equal(mutations(exec).length, 0);
});

test("--yes is never carried over from a prior run, and setup writes no local state", async () => {
  const root = createTempDir();
  try {
    const first = replayExec(setupFx.emptyProjectCreate);
    assert.equal(await run({ projectRoot: root, argv: ["setup", "--yes"], manifest, exec: first, isTTY: false, ...capture() }), 0);
    assert.equal(mutations(first).length, 10);

    const out = capture();
    const second = replayExec(setupFx.emptyProjectCreate);
    assert.equal(await run({ projectRoot: root, argv: ["setup"], manifest, exec: second, isTTY: false, ...out }), 1);
    assert.match(out.text(), /SETUP_CONFIRMATION_REQUIRED/);
    assert.equal(mutations(second).length, 0);
    assert.deepEqual(readdirSync(root), []);
  } finally {
    cleanupTempDir(root);
  }
});

test("--yes on an empty project creates exactly the recommended board, with the recommended options, and exits 0", async () => {
  const exec = replayExec(setupFx.emptyProjectCreate);
  const code = await run({ projectRoot: "/tmp/unused", argv: ["setup", "--yes"], manifest, exec, isTTY: false, ...capture() });
  assert.equal(code, 0);
  assert.deepEqual(mutations(exec).map((c) => c.operation), Array(10).fill("CreateField"), "no view, option-replace or other mutation");
  const byName = Object.fromEntries(exec.calls.filter((c) => c.operation === "CreateField").map((c) => [c.variables.name, c.variables]));
  assert.equal(byName.Status.dataType, "SINGLE_SELECT");
  assert.deepEqual(byName.Status.singleSelectOptions.map((o) => o.name), STATUS_OPTIONS);
  assert.equal(byName.Priority.dataType, "SINGLE_SELECT");
  assert.deepEqual(byName.Priority.singleSelectOptions.map((o) => o.name), PRIORITY_OPTIONS);
  for (const name of TEXT_FIELDS) assert.equal(byName[name].dataType, "TEXT", name);
});

test("the complete write set is printed before the first write", async () => {
  const t = timed(setupFx.emptyProjectCreate);
  assert.equal(await run({ projectRoot: "/tmp/unused", argv: ["setup", "--yes"], manifest, exec: t.exec, isTTY: false, log: t.log, error: t.error }), 0);
  const index = firstMutation(t.events);
  assert.ok(index > 0, "a mutation was sent after some output");
  const before = loggedBefore(t.events, index);
  for (const name of [...RECOMMENDED_FIELDS, ...STATUS_OPTIONS, ...PRIORITY_OPTIONS]) assert.match(before, word(name), `${name} listed before any write`);
});

test("--dry-run prints the write set, exits 0, and sends no mutation even with --yes", async () => {
  for (const argv of [["setup", "--dry-run"], ["setup", "--dry-run", "--yes"]]) {
    const out = capture();
    const exec = replayExec(setupFx.emptyProjectCreate);
    assert.equal(await run({ projectRoot: "/tmp/unused", argv, manifest, exec, isTTY: false, ...out }), 0, argv.join(" "));
    assert.equal(mutations(exec).length, 0, argv.join(" "));
    for (const name of [...RECOMMENDED_FIELDS, ...STATUS_OPTIONS, ...PRIORITY_OPTIONS]) assert.match(out.text(), word(name), `${argv.join(" ")}: ${name}`);
  }
});

test("--dry-run --json emits the write set as one JSON object", async () => {
  const out = capture();
  const exec = replayExec(setupFx.emptyProject);
  assert.equal(await run({ projectRoot: "/tmp/unused", argv: ["setup", "--dry-run", "--json"], manifest, exec, isTTY: false, ...out }), 0);
  const text = JSON.stringify(JSON.parse(out.lines.join("")));
  for (const name of [...RECOMMENDED_FIELDS, ...STATUS_OPTIONS, ...PRIORITY_OPTIONS]) assert.match(text, word(name), name);
  assert.equal(mutations(exec).length, 0);
});

test("--check sends no mutation even with --yes, on a project where every create would succeed", async () => {
  const exec = replayExec(setupFx.emptyProjectCreate);
  assert.equal(await run({ projectRoot: "/tmp/unused", argv: ["setup", "--check", "--yes"], manifest, exec, isTTY: false, ...capture() }), 1);
  assert.equal(mutations(exec).length, 0);
});

test("interactive: the write set is printed, then confirmation is asked once, then the board is created", async () => {
  const t = timed(setupFx.emptyProjectCreate);
  const prompts = [];
  const confirm = async (message) => {
    prompts.push(message);
    t.events.push({ confirm: true });
    return true;
  };
  const code = await run({ projectRoot: "/tmp/unused", argv: ["setup"], manifest, exec: t.exec, isTTY: true, confirm, log: t.log, error: t.error });
  assert.equal(code, 0);
  assert.equal(prompts.length, 1);
  const confirmAt = t.events.findIndex((e) => e.confirm);
  assert.ok(confirmAt < firstMutation(t.events), "confirmation precedes the first write");
  const before = loggedBefore(t.events, confirmAt);
  for (const name of RECOMMENDED_FIELDS) assert.match(before, word(name), `${name} listed before the prompt`);
  assert.deepEqual(t.exec.calls.filter((c) => c.operation === "CreateField").map((c) => c.variables.name).sort(), [...RECOMMENDED_FIELDS].sort());
});

test("interactive: a declined confirmation sends no mutation", async () => {
  const exec = replayExec(setupFx.emptyProjectCreate);
  let asked = 0;
  await run({ projectRoot: "/tmp/unused", argv: ["setup"], manifest, exec, isTTY: true, confirm: async () => { asked += 1; return false; }, ...capture() });
  assert.equal(asked, 1);
  assert.equal(mutations(exec).length, 0);
});

test("interactive: --yes, --check and --dry-run never prompt", async () => {
  for (const argv of [["setup", "--yes"], ["setup", "--check"], ["setup", "--dry-run"]]) {
    let asked = 0;
    const code = await run({ projectRoot: "/tmp/unused", argv, manifest, exec: replayExec(setupFx.emptyProjectCreate), isTTY: true, confirm: async () => { asked += 1; return true; }, ...capture() });
    assert.equal(asked, 0, argv.join(" "));
    assert.equal(code, argv.includes("--check") ? 1 : 0, argv.join(" "));
  }
});

test("a complete project has nothing to write: setup without --yes needs no confirmation and exits 0", async () => {
  const out = capture();
  const exec = replayExec(setupFx.complete);
  assert.equal(await run({ projectRoot: "/tmp/unused", argv: ["setup"], manifest, exec, isTTY: false, ...out }), 0);
  assert.doesNotMatch(out.text(), /SETUP_CONFIRMATION_REQUIRED/);
  assert.equal(mutations(exec).length, 0);
});

test("configured field names are what setup creates", async () => {
  const renamed = { tasks: { ...manifest.tasks, github: { ...manifest.tasks.github, fields: { owner: "Agent Owner" } } } };
  const exec = replayExec(setupFx.emptyProjectCreateRenamedOwner);
  assert.equal(await run({ projectRoot: "/tmp/unused", argv: ["setup", "--yes"], manifest: renamed, exec, isTTY: false, ...capture() }), 0);
  const names = exec.calls.filter((c) => c.operation === "CreateField").map((c) => c.variables.name).sort();
  assert.deepEqual(names, RECOMMENDED_FIELDS.map((n) => (n === "Owner" ? "Agent Owner" : n)).sort());
});

// --- priority_field (number Priority) ----------------------------------------

test("a configured priority_field is created as a number field in place of the Priority single-select", async () => {
  const numbered = { tasks: { ...manifest.tasks, github: { ...manifest.tasks.github, priority_field: "Rank" } } };
  const exec = replayExec(setupFx.emptyProjectCreateNumberPriority);
  assert.equal(await run({ projectRoot: "/tmp/unused", argv: ["setup", "--yes"], manifest: numbered, exec, isTTY: false, ...capture() }), 0);
  const creates = exec.calls.filter((c) => c.operation === "CreateField");
  assert.deepEqual(creates.map((c) => c.variables.name).sort(), RECOMMENDED_FIELDS.map((n) => (n === "Priority" ? "Rank" : n)).sort());
  const rank = creates.find((c) => c.variables.name === "Rank").variables;
  assert.equal(rank.dataType, "NUMBER");
  assert.equal(rank.singleSelectOptions, undefined);
});

test("an existing number Priority field is counted ok without the recommended options", async () => {
  const out = capture();
  assert.equal(await runWith(setupFx.numberPriority, ["setup", "--check", "--json"], out), 0);
  const report = JSON.parse(out.lines.join(""));
  assert.equal(report.ok, true);
  const priority = report.fields.find((f) => f.name === "Priority");
  assert.equal(priority.status, "ok");
  assert.equal(priority.options, undefined);
  const exec = replayExec(setupFx.numberPriority);
  assert.equal(await run({ projectRoot: "/tmp/unused", argv: ["setup", "--yes"], manifest, exec, isTTY: false, ...capture() }), 0);
  assert.equal(mutations(exec).length, 0);
});

// --- --json apply mode ---------------------------------------------------------

function split() {
  const stdout = [];
  const stderr = [];
  return { stdout, stderr, log: (s) => stdout.push(String(s)), error: (s) => stderr.push(String(s)) };
}

test("--yes --json: stdout carries only the result object; progress goes to stderr", async () => {
  const out = split();
  const exec = replayExec(setupFx.emptyProjectCreate);
  assert.equal(await run({ projectRoot: "/tmp/unused", argv: ["setup", "--yes", "--json"], manifest, exec, isTTY: false, ...out }), 0);
  assert.equal(out.stdout.length, 1);
  assert.deepEqual(JSON.parse(out.stdout[0]), {
    ok: true,
    created: ["Status", "Priority", "Owner", "Claimed At", "Next Action", "Spec", "Plan", "Branch", "PR", "Legacy ID"],
    skipped: [],
  });
  assert.match(out.stderr.join("\n"), /created field Legacy ID/);
});

test("--json interactive: the confirmation is asked and stdout still carries only the result object", async () => {
  const out = split();
  let asked = 0;
  const exec = replayExec(setupFx.emptyProjectCreate);
  const code = await run({ projectRoot: "/tmp/unused", argv: ["setup", "--json"], manifest, exec, isTTY: true, confirm: async () => { asked += 1; return true; }, ...out });
  assert.equal(code, 0);
  assert.equal(asked, 1);
  assert.equal(out.stdout.length, 1);
  assert.equal(JSON.parse(out.stdout[0]).ok, true);
});

test("--yes --json: a failed write prints { ok: false, code, created } on stdout and the message on stderr", async () => {
  for (const [fixture, code] of [["emptyProjectCreateRejected", "GITHUB_WRITE_FAILED"], ["emptyProjectCreateForbidden", "GITHUB_PERMISSION_DENIED"]]) {
    const out = split();
    const exec = replayExec(setupFx[fixture]);
    assert.equal(await run({ projectRoot: "/tmp/unused", argv: ["setup", "--yes", "--json"], manifest, exec, isTTY: false, ...out }), 1, fixture);
    assert.equal(out.stdout.length, 1, fixture);
    assert.deepEqual(JSON.parse(out.stdout[0]), { ok: false, code, created: ["Status", "Priority"] }, fixture);
    assert.match(out.stderr.join("\n"), new RegExp(`^${code}: `, "m"), fixture);
  }
});

test("--json without --yes, non-interactive: SETUP_CONFIRMATION_REQUIRED is the stdout result object", async () => {
  const out = split();
  const exec = replayExec(setupFx.emptyProjectCreate);
  assert.equal(await run({ projectRoot: "/tmp/unused", argv: ["setup", "--json"], manifest, exec, isTTY: false, ...out }), 1);
  assert.deepEqual(out.stdout.map((s) => JSON.parse(s)), [{ ok: false, code: "SETUP_CONFIRMATION_REQUIRED", created: [] }]);
  assert.match(out.stderr.join("\n"), /SETUP_CONFIRMATION_REQUIRED: /);
  assert.equal(mutations(exec).length, 0);
});

test("interactivity is decided by stdin and stderr, so piping stdout from a terminal still prompts", () => {
  assert.equal(isInteractive({ stdin: { isTTY: true }, stdout: { isTTY: false }, stderr: { isTTY: true } }), true);
  assert.equal(isInteractive({ stdin: { isTTY: true }, stdout: { isTTY: true }, stderr: { isTTY: false } }), false);
  assert.equal(isInteractive({ stdin: { isTTY: false }, stdout: { isTTY: true }, stderr: { isTTY: true } }), false);
});

test("the confirmation prompt is written to stderr, never stdout", async () => {
  const written = { stdout: "", stderr: "" };
  const originals = { stdout: process.stdout.write, stderr: process.stderr.write };
  for (const name of ["stdout", "stderr"]) {
    process[name].write = function (chunk, ...rest) {
      if (String(chunk).includes("ADEV-PROMPT")) {
        written[name] += String(chunk);
        return true;
      }
      return originals[name].call(this, chunk, ...rest);
    };
  }
  const input = new PassThrough();
  try {
    const answer = promptConfirm("ADEV-PROMPT? ", { input });
    input.write("y\n");
    assert.equal(await answer, true);
  } finally {
    process.stdout.write = originals.stdout;
    process.stderr.write = originals.stderr;
  }
  assert.equal(written.stdout, "");
  assert.equal(written.stderr, "ADEV-PROMPT? ");
});

// --- never delete / rename / clear; skip-and-print-manual-step (BEH-27) ------

test("existing option sets: only the missing fields are created; option additions are skipped with a manual step", async () => {
  const out = capture();
  const exec = replayExec(setupFx.partialOptions);
  await run({ projectRoot: "/tmp/unused", argv: ["setup", "--yes"], manifest, exec, isTTY: false, ...out });
  assert.deepEqual(mutations(exec).map((c) => `${c.operation}:${c.variables.name}`).sort(), ["CreateField:Branch", "CreateField:Legacy ID"]);
  assert.match(out.text(), /manual/i, "prints the manual step");
  for (const option of ["Ready", "In Review", "Deferred", "P3", "P4"]) assert.match(out.text(), word(option), option);
});

test("a field of the wrong type is left alone and reported as a manual step", async () => {
  const out = capture();
  const exec = replayExec(setupFx.ownerWrongType);
  await run({ projectRoot: "/tmp/unused", argv: ["setup", "--yes"], manifest, exec, isTTY: false, ...out });
  assert.equal(mutations(exec).length, 0);
  assert.ok(out.lines.includes('  Owner: Field "Owner" is a single-select field but adev requires a text field (wrong type). setup never deletes, renames or retypes a field: rename or remove it in the project settings, then rerun setup.'), out.text());
  assert.ok(out.lines.includes("Manual steps (not applied by setup):"));
});

// --- failures (BEH-28 and write failures) -----------------------------------

for (const [fixture, code] of [
  ["projectNotFound", "GITHUB_PROJECT_NOT_FOUND"],
  ["ownerNotFound", "GITHUB_PROJECT_NOT_FOUND"],
  ["projectMissing", "GITHUB_PROJECT_NOT_FOUND"],
  ["repoNotFound", "GITHUB_REPO_NOT_FOUND"],
  ["scopesMissing", "GITHUB_SCOPE_MISSING"],
  ["authRequired", "GITHUB_AUTH_REQUIRED"],
  ["cliMissing", "GITHUB_CLI_MISSING"],
  ["permissionDenied", "GITHUB_PERMISSION_DENIED"],
]) {
  test(`preflight failure ${code} (${fixture}) propagates its code, exits 1 and writes nothing`, async () => {
    for (const argv of [["setup", "--yes"], ["setup", "--check"], ["setup", "--dry-run"]]) {
      const out = capture();
      const exec = replayExec(setupFx[fixture]);
      const exit = await run({ projectRoot: "/tmp/unused", argv, manifest, exec, isTTY: false, ...out });
      assert.equal(exit, 1, argv.join(" "));
      assert.match(out.text(), new RegExp(code), argv.join(" "));
      assert.equal(mutations(exec).length, 0, argv.join(" "));
    }
  });
}

test("a rejected CreateField surfaces as GITHUB_WRITE_FAILED and exits 1", async () => {
  const out = capture();
  const exec = replayExec(setupFx.emptyProjectCreateRejected);
  assert.equal(await run({ projectRoot: "/tmp/unused", argv: ["setup", "--yes"], manifest, exec, isTTY: false, ...out }), 1);
  assert.match(out.text(), /GITHUB_WRITE_FAILED/);
  assert.doesNotMatch(out.text(), /GITHUB_REQUEST_FAILED/);
});

test("a failed CreateField stops the run: nothing after the rejected Owner is sent, and the fields already created are named", async () => {
  for (const fixture of ["emptyProjectCreateRejected", "emptyProjectCreateForbidden"]) {
    const out = capture();
    const exec = replayExec(setupFx[fixture]);
    assert.equal(await run({ projectRoot: "/tmp/unused", argv: ["setup", "--yes"], manifest, exec, isTTY: false, ...out }), 1, fixture);
    assert.deepEqual(mutations(exec).map((c) => c.variables.name), ["Status", "Priority", "Owner"], fixture);
    assert.ok(out.lines.includes("Already created before the failure: Status, Priority. Rerun setup to create the rest."), fixture);
  }
});

test("a forbidden CreateField surfaces as GITHUB_PERMISSION_DENIED and exits 1", async () => {
  const out = capture();
  const exec = replayExec(setupFx.emptyProjectCreateForbidden);
  assert.equal(await run({ projectRoot: "/tmp/unused", argv: ["setup", "--yes"], manifest, exec, isTTY: false, ...out }), 1);
  assert.match(out.text(), /GITHUB_PERMISSION_DENIED/);
});

test("invalid tasks.github fails with GITHUB_INVALID_CONFIG before any request", async () => {
  const bad = { tasks: { backend: "github", github: { project: "https://github.com/acme/projects/7", repo: "acme/board" } } };
  const out = capture();
  const exec = replayExec([]);
  assert.equal(await run({ projectRoot: "/tmp/unused", argv: ["setup", "--check"], manifest: bad, exec, isTTY: false, ...out }), 1);
  assert.match(out.text(), /GITHUB_INVALID_CONFIG/);
  assert.equal(exec.calls.length, 0);
});

test("an unknown flag or sub-verb exits 1 before any request; --help exits 0 without one", async () => {
  for (const argv of [["setup", "--bogus"], ["nope"], []]) {
    const exec = replayExec([]);
    assert.equal(await run({ projectRoot: "/tmp/unused", argv, manifest, exec, isTTY: false, ...capture() }), 1, JSON.stringify(argv));
    assert.equal(exec.calls.length, 0, JSON.stringify(argv));
  }
  const exec = replayExec([]);
  assert.equal(await run({ projectRoot: "/tmp/unused", argv: ["setup", "--help"], manifest, exec, isTTY: false, ...capture() }), 0);
  assert.equal(exec.calls.length, 0);
});

// --- reachable through `adev issues github setup` (BEH-26) ------------------

const MANIFEST_YAML = "project:\n  name: test\ntasks:\n  backend: github\n  github:\n    project: https://github.com/orgs/acme/projects/7\n    repo: acme/board\n";

// A stand-in `gh` first on PATH: it logs every request's argv and operation, serves
// the named responses, and refuses every mutation, so nothing can reach GitHub.
function makeProject(mode) {
  const dir = createTempDir();
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), MANIFEST_YAML);
  const bin = join(dir, "stub-bin");
  mkdirSync(bin, { recursive: true });
  const ghLog = join(dir, "gh-calls.log");
  const unauthenticated = mode === "unauthenticated";
  const responses = unauthenticated ? {} : STUB_RESPONSES[mode];
  const stub = join(bin, "gh-stub.mjs");
  writeFileSync(stub, `import { appendFileSync, readFileSync } from "node:fs";
const log = ${JSON.stringify(ghLog)};
const responses = ${JSON.stringify(responses)};
function main() {
  appendFileSync(log, "argv " + process.argv.slice(2).join(" ") + "\\n");
  if (${JSON.stringify(unauthenticated)}) { process.stderr.write("gh auth login\\n"); return 4; }
  const { query } = JSON.parse(readFileSync(0, "utf8"));
  const m = /^\\s*(query|mutation)\\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(query) ?? [];
  appendFileSync(log, (m[1] ?? "anonymous") + " " + (m[2] ?? "") + "\\n");
  if (m[1] !== "query" || !responses[m[2]]) { process.stderr.write("adev-fixture: stub refuses " + (m[2] ?? "request") + "\\n"); return 1; }
  process.stdout.write(JSON.stringify(responses[m[2]]));
  return 0;
}
process.exitCode = main();
`);
  writeFileSync(join(bin, "gh"), `#!/bin/sh\nexec "${process.execPath}" "${stub}" "$@"\n`);
  chmodSync(join(bin, "gh"), 0o755);
  return { dir, bin, ghLog };
}

function adev(project, args) {
  const env = { ...process.env, PATH: `${project.bin}${delimiter}${ORIGINAL_PATH}`, ADEV_SILENCE_DEFAULT_BACKEND_ADVISORY: "1" };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: project.dir, env, encoding: "utf8", timeout: 20000 });
  return { exitCode: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", ghLog: existsSync(project.ghLog) ? readFileSync(project.ghLog, "utf8") : "" };
}

test("`adev issues --help` lists the github sub-verb", () => {
  const project = makeProject("emptyProject");
  try {
    const r = adev(project, ["issues", "--help"]);
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /^\s+github\b/m);
  } finally {
    cleanupTempDir(project.dir);
  }
});

test("`adev issues github setup --help` documents --check, --dry-run, --yes and --json without spawning gh", () => {
  const project = makeProject("emptyProject");
  try {
    const r = adev(project, ["issues", "github", "setup", "--help"]);
    assert.equal(r.exitCode, 0, r.stderr);
    for (const flag of ["--check", "--dry-run", "--yes", "--json"]) assert.match(r.stdout, new RegExp(escapeRe(flag)), flag);
    assert.equal(r.ghLog, "");
  } finally {
    cleanupTempDir(project.dir);
  }
});

test("`adev issues github setup` non-interactive without --yes exits 1 with SETUP_CONFIRMATION_REQUIRED and no mutation", () => {
  for (const extra of [[], ["--auto"]]) {
    const project = makeProject("emptyProject");
    try {
      const r = adev(project, ["issues", "github", "setup", ...extra]);
      assert.equal(r.exitCode, 1, extra.join(" "));
      assert.match(r.stdout + r.stderr, /SETUP_CONFIRMATION_REQUIRED/, extra.join(" "));
      assert.match(r.ghLog, /^query AdevPreflight$/m, "the project was read through gh");
      assert.match(r.ghLog, /^argv api graphql --input -$/m, "the one fixed argv");
      assert.doesNotMatch(r.ghLog, /^mutation /m);
      assert.equal(readFileSync(join(project.dir, ".context-index", "manifest.yaml"), "utf8"), MANIFEST_YAML);
    } finally {
      cleanupTempDir(project.dir);
    }
  }
});

test("`adev issues github setup --dry-run` exits 0 and prints the write set with no mutation", () => {
  const project = makeProject("emptyProject");
  try {
    const r = adev(project, ["issues", "github", "setup", "--dry-run"]);
    assert.equal(r.exitCode, 0, r.stderr);
    for (const name of RECOMMENDED_FIELDS) assert.match(r.stdout, word(name), name);
    assert.doesNotMatch(r.ghLog, /^mutation /m);
  } finally {
    cleanupTempDir(project.dir);
  }
});

test("`adev issues github setup --check` propagates GITHUB_AUTH_REQUIRED and exits 1", () => {
  const project = makeProject("unauthenticated");
  try {
    const r = adev(project, ["issues", "github", "setup", "--check"]);
    assert.equal(r.exitCode, 1);
    assert.match(r.stdout + r.stderr, /GITHUB_AUTH_REQUIRED/);
    assert.match(r.ghLog, /^argv api graphql --input -$/m, "gh was asked through the one fixed argv");
    assert.doesNotMatch(r.ghLog, /^mutation /m);
  } finally {
    cleanupTempDir(project.dir);
  }
});

test.after(() => cleanupTempDir(NO_GH_DIR));
