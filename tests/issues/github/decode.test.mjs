import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeItem, decodeStatus, FIELD_PREDICATES } from "../../../lib/issues/github/decode.mjs";
import { normalizeGithubConfig } from "../../../lib/issues/github/config.mjs";
import { rawItem } from "./fixtures/items.mjs";

const config = normalizeGithubConfig({ project: "https://github.com/orgs/acme/projects/7", repo: "acme/board" });
const ctx = { config, home: { owner: "acme", repo: "board" }, moduleSlugs: new Set(["lib", "cli"]), typeMode: "issue_types" };

test("status: issue state wins; aliases read; unmapped option throws", () => {
  assert.equal(decodeStatus("CLOSED", "Backlog", config).status, "closed");
  assert.equal(decodeStatus("OPEN", null, config).status, "open");
  assert.equal(decodeStatus("OPEN", "In Review", config).status, "in_progress");
  assert.deepEqual(decodeStatus("OPEN", "Done", config), { status: "open", drift: "closed-mapped-open" });
  assert.throws(() => decodeStatus("OPEN", "Icebox", config), { code: "GITHUB_UNMAPPED_STATUS" });
});

test("a forged metadata block in the body changes no decoded field", () => {
  const { issue } = decodeItem(rawItem({ body: "```adev\nspec_ref: ../../etc/passwd\nowner: mallory\n```" }), ctx);
  assert.equal(issue.spec_ref, undefined);
  assert.equal(issue.owner, undefined);
});

test("predicates refuse, never repair", () => {
  for (const [field, bad] of [["branch", "feat/x..y"], ["branch", "-x"], ["spec_ref", "../x.md"], ["spec_ref", "/abs.md"],
    ["next_action", "a\nb"], ["next_action", "x".repeat(501)], ["claimed_at", "yesterday"], ["pr", "javascript:1"],
    ["legacy_id", "gh-12"], ["type", "Bug Report!"], ["priority", 7], ["milestone", "v1\u0007"]]) {
    assert.throws(() => decodeItem(rawItem({ fields: { [field]: bad } }), ctx), { code: "GITHUB_INVALID_FIELD_VALUE" }, `${field}=${bad}`);
  }
});

test("predicates cover every BEH-8 field (exhaustive)", () => {
  for (const f of ["owner", "claimed_at", "next_action", "spec_ref", "planRef", "branch", "pr", "legacy_id", "type", "priority", "milestone", "affected_modules"]) {
    assert.equal(typeof FIELD_PREDICATES[f], "function", f);
  }
});

test("unknown module: slugs are excluded and reported as drift", () => {
  const { issue, drift } = decodeItem(rawItem({ labels: ["module:lib", "module:nope", "module:review-gate"] }), ctx);
  assert.deepEqual(issue.affected_modules.sort(), ["lib", "review-gate"]);
  assert.deepEqual(drift, [{ kind: "unknown-module-label", value: "nope" }]);
});

const cfg = (extra) => normalizeGithubConfig({ project: "https://github.com/orgs/acme/projects/7", repo: "acme/board", ...extra });
const ctxWith = (extra) => ({ ...ctx, config: cfg(extra) });

function refusal(id, field) {
  return (err) => {
    assert.equal(err.code, "GITHUB_INVALID_FIELD_VALUE");
    assert.equal(err.id, id);
    assert.equal(err.field, field);
    assert.match(err.message, new RegExp(id.replace(/\./g, "\\.")), `message names ${id}`);
    assert.match(err.message, new RegExp(field), `message names ${field}`);
    return true;
  };
}

test("status: every default alias reads as its adev status on an open issue", () => {
  for (const [option, status] of [["Backlog", "open"], ["Ready", "open"], ["In Progress", "in_progress"], ["In Review", "in_progress"], ["Deferred", "deferred"]]) {
    assert.equal(decodeStatus("OPEN", option, config).status, status, option);
    assert.equal(decodeStatus("OPEN", option, config).drift, undefined, option);
  }
});

test("status: a closed issue is closed whatever its option, even unmapped or absent", () => {
  for (const option of [null, "Backlog", "In Progress", "Deferred", "Done", "Icebox"]) {
    assert.equal(decodeStatus("CLOSED", option, config).status, "closed", String(option));
  }
});

test("status: an unmapped option error names the option", () => {
  assert.throws(() => decodeStatus("OPEN", "Icebox", config), (err) => {
    assert.equal(err.code, "GITHUB_UNMAPPED_STATUS");
    assert.match(err.message, /Icebox/);
    return true;
  });
});

test("status: every alias listed under closed reads as open + drift on an open issue", () => {
  const custom = cfg({ status_map: { open: "Todo", in_progress: "Doing", deferred: "Later", closed: ["Done", "Shipped"] } });
  assert.deepEqual(decodeStatus("OPEN", "Shipped", custom), { status: "open", drift: "closed-mapped-open" });
  assert.equal(decodeStatus("OPEN", "Doing", custom).status, "in_progress");
  assert.throws(() => decodeStatus("OPEN", "Backlog", custom), { code: "GITHUB_UNMAPPED_STATUS" });
});

test("decodeItem: unmapped status throws GITHUB_UNMAPPED_STATUS naming the ID and option", () => {
  assert.throws(() => decodeItem(rawItem({ number: 31, status: "Icebox" }), ctx), (err) => {
    assert.equal(err.code, "GITHUB_UNMAPPED_STATUS");
    assert.match(err.message, /gh-31/);
    assert.match(err.message, /Icebox/);
    return true;
  });
});

test("decodeItem: closed-mapped option on an open issue reads open and reports drift", () => {
  const { issue, drift } = decodeItem(rawItem({ status: "Done" }), ctx);
  assert.equal(issue.status, "open");
  assert.deepEqual(drift, [{ kind: "closed-mapped-open", value: "Done" }]);
});

test("decodeItem: CLOSED state reads closed; no status option reads open", () => {
  assert.equal(decodeItem(rawItem({ state: "CLOSED", status: "Icebox" }), ctx).issue.status, "closed");
  assert.equal(decodeItem(rawItem({ status: null }), ctx).issue.status, "open");
});

test("decodeItem: the status option is read from the configured status_field only", () => {
  const c = ctxWith({ status_field: "Stage" });
  const { issue } = decodeItem(rawItem({ statusField: "Stage", status: "In Progress", projectFields: { Status: { option: "Icebox" } } }), c);
  assert.equal(issue.status, "in_progress");
});

test("decodeItem: placement table — every field decodes from its source, unchanged", () => {
  const { issue, drift } = decodeItem(rawItem({
    number: 12,
    title: "adev-fixture: placement",
    body: "adev-fixture: body text",
    status: "In Progress",
    issueType: "Bug",
    labels: ["module:cli", "unrelated"],
    parent: { number: 3 },
    blockedBy: [{ number: 4 }, { number: 9, owner: "Other", name: "Lib.Core" }],
    fields: {
      priority: 1,
      owner: "alice",
      claimed_at: "2026-11-26T10:00:00Z",
      next_action: "write the RED tests",
      spec_ref: ".context-index/specs/features/task-management/github-board-backend.spec.md",
      planRef: ".context-index/specs/features/task-management/github-board-backend.plan.md",
      branch: "feat/task-management/github-board-backend",
      pr: "https://github.com/acme/board/pull/40",
      legacy_id: "issue-42",
    },
  }), ctx);
  assert.equal(issue.id, "gh-12");
  assert.equal(issue.title, "adev-fixture: placement");
  assert.equal(issue.notes, "adev-fixture: body text");
  assert.equal(issue.status, "in_progress");
  assert.equal(issue.priority, 1);
  assert.equal(issue.type, "bug");
  assert.equal(issue.parent_id, "gh-3");
  assert.deepEqual(issue.dependencies, ["gh-4", "gh-other.lib.core.9"]);
  assert.equal(issue.owner, "alice");
  assert.equal(issue.claimed_at, "2026-11-26T10:00:00Z");
  assert.equal(issue.next_action, "write the RED tests");
  assert.equal(issue.spec_ref, ".context-index/specs/features/task-management/github-board-backend.spec.md");
  assert.equal(issue.planRef, ".context-index/specs/features/task-management/github-board-backend.plan.md");
  assert.equal(issue.branch, "feat/task-management/github-board-backend");
  assert.equal(issue.pr, "https://github.com/acme/board/pull/40");
  assert.equal(issue.legacy_id, "issue-42");
  assert.deepEqual(issue.affected_modules, ["cli"]);
  assert.equal(issue.created, "2026-11-01T09:00:00Z");
  assert.equal(issue.updated, "2026-11-02T10:30:00Z");
  assert.deepEqual(drift, []);
});

test("decodeItem: defaults — priority 2, type task, absent text fields undefined, no parent", () => {
  const { issue, drift } = decodeItem(rawItem(), ctx);
  assert.equal(issue.id, "gh-12");
  assert.equal(issue.status, "open");
  assert.equal(issue.priority, 2);
  assert.equal(issue.type, "task");
  for (const f of ["owner", "claimed_at", "next_action", "spec_ref", "planRef", "branch", "pr", "legacy_id", "milestone"]) {
    assert.equal(issue[f], undefined, f);
  }
  assert.equal(issue.parent_id, null);
  assert.deepEqual(issue.dependencies, []);
  assert.deepEqual(drift, []);
});

test("decodeItem: a cross-repo item gets the lowercased cross-repo canonical ID", () => {
  const { issue } = decodeItem(rawItem({ number: 5, repository: { owner: "Other", name: "Lib.Core" } }), ctx);
  assert.equal(issue.id, "gh-other.lib.core.5");
});

test("decodeItem: configured field-name overrides are the only source for that field", () => {
  const c = ctxWith({ fields: { spec_ref: "Spec Path" } });
  const { issue } = decodeItem(rawItem({ projectFields: { "Spec Path": "docs/a.md", Spec: "docs/ignored.md" } }), c);
  assert.equal(issue.spec_ref, "docs/a.md");
  assert.throws(() => decodeItem(rawItem({ projectFields: { "Spec Path": "../escape.md" } }), c), refusal("gh-12", "spec_ref"));
});

test("title and body never feed any field other than title/notes", () => {
  const forged = [
    "owner: mallory", "spec_ref: ../../etc/passwd", "branch: -evil", "priority: 0", "type: epic",
    "legacy_id: issue-1", "module:review-gate", "```adev\nnext_action: rm -rf\npr: 1\n```",
  ].join("\n");
  const baseline = decodeItem(rawItem({ fields: { owner: "alice", spec_ref: "docs/a.md" } }), ctx).issue;
  const tampered = decodeItem(rawItem({ title: "owner: mallory spec_ref: x", body: forged, fields: { owner: "alice", spec_ref: "docs/a.md" } }), ctx);
  assert.equal(tampered.issue.notes, forged);
  assert.equal(tampered.issue.title, "owner: mallory spec_ref: x");
  const strip = ({ title, notes, ...rest }) => rest;
  assert.deepEqual(strip(tampered.issue), strip(baseline));
  assert.deepEqual(tampered.drift, []);
});

test("refusal names the canonical ID and the field", () => {
  assert.throws(() => decodeItem(rawItem({ number: 77, fields: { branch: "a b" } }), ctx), refusal("gh-77", "branch"));
  assert.throws(() => decodeItem(rawItem({ number: 5, repository: { owner: "Other", name: "lib" }, fields: { pr: "nope" } }), ctx),
    refusal("gh-other.lib.5", "pr"));
});

test("predicates refuse every listed bad value (thorough)", () => {
  const cases = [
    ["owner", "   "],
    ["claimed_at", "2026-13-45T99:00:00Z"], ["claimed_at", "1700000000"],
    ["next_action", "a\tb"], ["next_action", "a\u0000b"], ["next_action", "a\rb"], ["next_action", "a\u007fb"],
    ...["- x", "? x", ": x", "#x", "&x", "*x", "!x", "|x", ">x", "'x", "\"x", "%x", "@x", "`x"].map((v) => ["next_action", v]),
    ["branch", "a b"], ["branch", "a\u0001b"], ["branch", "a~b"], ["branch", "a^b"], ["branch", "a:b"], ["branch", "a?b"],
    ["branch", "a*b"], ["branch", "a[b"], ["branch", "a\\b"], ["branch", "topic.lock"],
    ["pr", "12abc"], ["pr", "#x"], ["pr", "http://github.com/acme/board/pull/1"], ["pr", "https://evil.example/acme/board/pull/1"],
    ["pr", "https://github.com/acme/board/issues/1"], ["pr", "https://github.com/acme/board/pull/1?x=1"],
    ["spec_ref", "a/../b.md"], ["spec_ref", ".."], ["spec_ref", "a\u0000.md"], ["spec_ref", "a\nb.md"],
    ["planRef", "../p.md"], ["planRef", "/p.md"], ["planRef", "p/..\u0007.md"],
    ["legacy_id", "nonsense!"], ["legacy_id", "gh-acme.board.3"],
    ["milestone", "v1\nv2"], ["milestone", "m".repeat(256)],
    ["priority", "P5"], ["priority", "High"], ["priority", -1],
    ["type", "9lives"], ["type", "a".repeat(41)], ["type", "-bug"],
  ];
  for (const [field, bad] of cases) {
    assert.throws(() => decodeItem(rawItem({ fields: { [field]: bad } }), ctx), { code: "GITHUB_INVALID_FIELD_VALUE" }, `${field}=${JSON.stringify(bad)}`);
  }
});

test("predicates accept valid values unchanged, at their boundaries", () => {
  const accept = [
    ["next_action", "x".repeat(500)],
    ["next_action", "run tests - then fix: the #1 issue"],
    ["branch", "feat/task-8_x.y"],
    ["pr", "12"], ["pr", "#12"], ["pr", "https://github.com/acme/board/pull/12"], ["pr", "https://github.com/Other-Org/some.repo/pull/3"],
    ["spec_ref", "a/b.c/d.md"], ["planRef", ".context-index/specs/x.plan.md"],
    ["claimed_at", "2026-11-26T10:00:00.000Z"], ["claimed_at", "2026-11-26T10:00:00+02:00"],
    ["legacy_id", "issue-42"], ["legacy_id", "e1.f2.t3"],
    ["milestone", "m".repeat(255)], ["milestone", "v1.0 — launch"],
  ];
  for (const [field, good] of accept) {
    const { issue } = decodeItem(rawItem({ fields: { [field]: good } }), ctx);
    assert.equal(issue[field], good, `${field}=${JSON.stringify(good)}`);
  }
});

test("priority: P0–P4 select, number field via priority_field, priority:<n> label, else 2", () => {
  for (const n of [0, 1, 2, 3, 4]) assert.equal(decodeItem(rawItem({ fields: { priority: n } }), ctx).issue.priority, n);
  assert.equal(decodeItem(rawItem({ labels: ["priority:3"] }), ctx).issue.priority, 3);
  assert.equal(decodeItem(rawItem({ fields: { priority: 0 }, labels: ["priority:4"] }), ctx).issue.priority, 0);
  const c = ctxWith({ priority_field: "Prio" });
  assert.equal(decodeItem(rawItem({ projectFields: { Prio: { number: 1 } } }), c).issue.priority, 1);
  assert.throws(() => decodeItem(rawItem({ projectFields: { Prio: { number: 7 } } }), c), refusal("gh-12", "priority"));
  assert.throws(() => decodeItem(rawItem({ projectFields: { Prio: { number: 1.5 } } }), c), refusal("gh-12", "priority"));
  assert.throws(() => decodeItem(rawItem({ labels: ["priority:9"] }), ctx), refusal("gh-12", "priority"));
});

test("type: issue type lowercased; type: label under label typing; else task", () => {
  assert.equal(decodeItem(rawItem({ issueType: "Feature" }), ctx).issue.type, "feature");
  assert.equal(decodeItem(rawItem({ issueType: "Epic" }), ctx).issue.type, "epic");
  const issueTypes = ctxWith({ type_source: "issue_types" });
  assert.equal(decodeItem(rawItem({ issueType: "Feature" }), issueTypes).issue.type, "feature");
  const labels = ctxWith({ type_source: "labels" });
  assert.equal(decodeItem(rawItem({ labels: ["type:bug"] }), labels).issue.type, "bug");
  assert.equal(decodeItem(rawItem({ labels: ["type:Bug"] }), labels).issue.type, "bug");
  assert.equal(decodeItem(rawItem({ issueType: "Feature" }), labels).issue.type, "task");
  assert.throws(() => decodeItem(rawItem({ labels: ["type:Bug Report!"] }), labels), refusal("gh-12", "type"));
});

test("type: auto typing is resolved once per owner, never per item", () => {
  const withTypes = { ...ctx, typeMode: "issue_types" };
  assert.equal(decodeItem(rawItem({ labels: ["type:bug"] }), withTypes).issue.type, "task");
  assert.equal(decodeItem(rawItem({ labels: ["epic"] }), withTypes).issue.type, "task");
  assert.equal(decodeItem(rawItem({ issueType: "Feature", labels: ["epic", "type:bug"] }), withTypes).issue.type, "feature");

  const withoutTypes = { ...ctx, typeMode: "labels" };
  assert.equal(decodeItem(rawItem({ labels: ["type:bug"] }), withoutTypes).issue.type, "bug");
  assert.equal(decodeItem(rawItem({ labels: ["epic"] }), withoutTypes).issue.type, "epic");
  assert.equal(decodeItem(rawItem({ issueType: "Feature" }), withoutTypes).issue.type, "task");
});

test("type: auto typing without a resolved ctx.typeMode fails closed", () => {
  const { typeMode, ...unresolved } = ctx;
  assert.equal(typeMode, "issue_types");
  for (const bad of [unresolved, { ...ctx, typeMode: "auto" }, { ...ctx, typeMode: "issue-types" }]) {
    assert.throws(() => decodeItem(rawItem({ labels: ["type:bug"] }), bad), (err) => {
      assert.ok(err instanceof TypeError);
      assert.match(err.message, /typeMode/);
      return true;
    });
  }
  const fixed = { ...unresolved, config: cfg({ type_source: "labels" }) };
  assert.equal(decodeItem(rawItem({ labels: ["type:bug"] }), fixed).issue.type, "bug");
});

test("affected_modules: all four reserved safety tags count when labelled; absence never adds one", () => {
  const labels = ["module:review-gate", "module:convergence-detector", "module:retry-loop", "module:bugfix-loop"];
  const { issue, drift } = decodeItem(rawItem({ labels }), ctx);
  assert.deepEqual([...issue.affected_modules].sort(), ["bugfix-loop", "convergence-detector", "retry-loop", "review-gate"]);
  assert.deepEqual(drift, []);
  assert.deepEqual(decodeItem(rawItem({ labels: ["module:lib", "bug"] }), ctx).issue.affected_modules, ["lib"]);
});

test("affected_modules: every unknown slug is its own drift entry; the item still decodes", () => {
  const { issue, drift } = decodeItem(rawItem({ labels: ["module:nope", "module:also-nope", "module:cli"] }), ctx);
  assert.deepEqual(issue.affected_modules, ["cli"]);
  const unknown = drift.filter((d) => d.kind === "unknown-module-label").map((d) => d.value).sort();
  assert.deepEqual(unknown, ["also-nope", "nope"]);
});

test("predicates do not mutate the raw item", () => {
  const raw = rawItem({ labels: ["module:lib"], fields: { next_action: "do it", owner: "alice" } });
  const snapshot = JSON.stringify(raw);
  decodeItem(raw, ctx);
  assert.equal(JSON.stringify(raw), snapshot);
});

test("priority: a set field wins and priority: labels are not consulted", () => {
  assert.equal(decodeItem(rawItem({ fields: { priority: 1 }, labels: ["priority:9"] }), ctx).issue.priority, 1);
  assert.equal(decodeItem(rawItem({ fields: { priority: 3 }, labels: ["priority:0", "priority:4"] }), ctx).issue.priority, 3);
  const c = ctxWith({ priority_field: "Prio" });
  assert.equal(decodeItem(rawItem({ projectFields: { Prio: { number: 4 } }, labels: ["priority:x", "priority:1"] }), c).issue.priority, 4);
});

test("priority: with the field empty, conflicting or out-of-range labels are refused", () => {
  assert.throws(() => decodeItem(rawItem({ labels: ["priority:1", "priority:3"] }), ctx), refusal("gh-12", "priority"));
  assert.throws(() => decodeItem(rawItem({ labels: ["priority:"] }), ctx), refusal("gh-12", "priority"));
  assert.equal(decodeItem(rawItem({ labels: ["priority:1", "priority:1"] }), ctx).issue.priority, 1);
});

test("priority: a Priority field of the wrong node type is refused", () => {
  assert.throws(() => decodeItem(rawItem({ projectFields: { Priority: "P1" } }), ctx), refusal("gh-12", "priority"));
});

test("type: under label typing the epic label sets Epic membership and wins over a type: label", () => {
  const labels = ctxWith({ type_source: "labels" });
  assert.equal(decodeItem(rawItem({ labels: ["epic", "type:feature"] }), labels).issue.type, "epic");
  assert.equal(decodeItem(rawItem({ labels: ["type:feature", "epic"] }), labels).issue.type, "epic");
  assert.equal(decodeItem(rawItem({ labels: ["type:bug", "type:Bug"] }), labels).issue.type, "bug");
  assert.throws(() => decodeItem(rawItem({ labels: ["epic", "type:Bug Report!"] }), labels), refusal("gh-12", "type"));
});

test("type: two different type: labels are refused as ambiguous", () => {
  const labels = ctxWith({ type_source: "labels" });
  assert.throws(() => decodeItem(rawItem({ labels: ["type:bug", "type:feature"] }), labels), refusal("gh-12", "type"));
  assert.throws(() => decodeItem(rawItem({ labels: ["epic", "type:bug", "type:feature"] }), labels), refusal("gh-12", "type"));
});

test("a text field whose project value is not a text node is refused", () => {
  assert.throws(() => decodeItem(rawItem({ projectFields: { Owner: { option: "alice" } } }), ctx), refusal("gh-12", "owner"));
  assert.throws(() => decodeItem(rawItem({ projectFields: { Branch: { number: 3 } } }), ctx), refusal("gh-12", "branch"));
});

test("a status field that is not a single-select is refused", () => {
  assert.throws(() => decodeItem(rawItem({ status: null, projectFields: { Status: "In Progress" } }), ctx), refusal("gh-12", "status"));
});

test("an issue state other than OPEN or CLOSED is refused", () => {
  assert.throws(() => decodeItem(rawItem({ state: "MERGED" }), ctx), refusal("gh-12", "status"));
  const stateless = rawItem({ status: null });
  delete stateless.content.state;
  assert.throws(() => decodeItem(stateless, ctx), refusal("gh-12", "status"));
  assert.throws(() => decodeStatus("open", null, config), { code: "GITHUB_INVALID_FIELD_VALUE", field: "status" });
});

test("branch: git ref-name rules beyond the listed characters are refused", () => {
  for (const bad of ["@", "a//b", "a@{b", "feat/", "feat.", "/feat", "a.lock/b", "a/.b", ".hidden"]) {
    assert.throws(() => decodeItem(rawItem({ fields: { branch: bad } }), ctx), refusal("gh-12", "branch"), JSON.stringify(bad));
  }
  for (const good of ["a@b", "a/b.c", "v1.2"]) {
    assert.equal(decodeItem(rawItem({ fields: { branch: good } }), ctx).issue.branch, good);
  }
});

test("owner: control characters and surrounding whitespace are refused", () => {
  for (const bad of ["al\u0007ice", "alice\n", "al\u2028ice", " alice", "alice "]) {
    assert.throws(() => decodeItem(rawItem({ fields: { owner: bad } }), ctx), refusal("gh-12", "owner"), JSON.stringify(bad));
  }
});

test("affected_modules: a manifest slug containing whitespace is refused, not repaired", () => {
  const c = { ...ctx, moduleSlugs: new Set(["lib", "bad slug"]) };
  assert.throws(() => decodeItem(rawItem({ labels: ["module:bad slug"] }), c), refusal("gh-12", "affected_modules"));
});
