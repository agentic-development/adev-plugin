import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeGithubConfig } from "../../../lib/issues/github/config.mjs";
import { GITHUB_ERROR_CODES } from "../../../lib/issues/github/errors.mjs";

const base = { project: "https://github.com/orgs/acme/projects/7", repo: "acme/board" };

test("defaults: Status field, recommended status_map, auto type_source, 1500ms settle", () => {
  const c = normalizeGithubConfig(base);
  assert.equal(c.status_field, "Status");
  assert.deepEqual(c.status_map.open, ["Backlog", "Ready"]);
  assert.equal(c.status_map_write.open, "Backlog");
  assert.equal(c.type_source, "auto");
  assert.equal(c.claim_settle_ms, 1500);
});

for (const [name, patch] of [
  ["bad project url", { project: "https://github.com/acme/board" }],
  ["bad repo", { repo: "acme" }],
  ["incomplete status_map", { status_map: { open: "Backlog" } }],
  ["option under two statuses", { status_map: { open: "X", in_progress: "X", deferred: "D", closed: "C" } }],
  ["bad type_source", { type_source: "magic" }],
  ["fields collision", { fields: { owner: "Who", next_action: "Who" } }],
  ["unknown fields key", { fields: { nope: "X" } }],
  ["claim_settle_ms out of range", { claim_settle_ms: 10001 }],
]) {
  test(`GITHUB_INVALID_CONFIG: ${name}`, () => {
    assert.throws(() => normalizeGithubConfig({ ...base, ...patch }), { code: "GITHUB_INVALID_CONFIG" });
  });
}

test("GITHUB_ERROR_CODES registers GITHUB_INVALID_CONFIG", () => {
  assert.equal(GITHUB_ERROR_CODES.GITHUB_INVALID_CONFIG, "GITHUB_INVALID_CONFIG");
});

for (const [name, patch, keyPattern] of [
  ["unknown top-level key", { board_url: "x" }, /board_url/],
  ["misspelled top-level key", { claim_setle_ms: 1500 }, /claim_setle_ms/],
  ["unknown status_map key", { status_map: { open: "O", in_progress: "P", deferred: "D", closed: "C", blocked: "B" } }, /status_map.*blocked|blocked.*status_map/],
]) {
  test(`GITHUB_INVALID_CONFIG rejects keys outside the complete set: ${name}`, () => {
    assert.throws(() => normalizeGithubConfig({ ...base, ...patch }), { code: "GITHUB_INVALID_CONFIG", message: keyPattern });
  });
}

const DEFAULT_FIELD_NAMES = {
  owner: "Owner",
  claimed_at: "Claimed At",
  next_action: "Next Action",
  spec_ref: "Spec",
  planRef: "Plan",
  branch: "Branch",
  pr: "PR",
  legacy_id: "Legacy ID",
};

test("defaults: full recommended status_map read and write sides", () => {
  const c = normalizeGithubConfig(base);
  assert.deepEqual(c.status_map, {
    open: ["Backlog", "Ready"],
    in_progress: ["In Progress", "In Review"],
    deferred: ["Deferred"],
    closed: ["Done"],
  });
  assert.deepEqual(c.status_map_write, {
    open: "Backlog",
    in_progress: "In Progress",
    deferred: "Deferred",
    closed: "Done",
  });
});

test("defaults: fieldNames maps every adev field to its default project field name", () => {
  const c = normalizeGithubConfig(base);
  assert.deepEqual(c.fieldNames, DEFAULT_FIELD_NAMES);
});

test("preserves project and repo verbatim", () => {
  const c = normalizeGithubConfig(base);
  assert.equal(c.project, "https://github.com/orgs/acme/projects/7");
  assert.equal(c.repo, "acme/board");
});

test("accepts a user-owned Projects v2 URL", () => {
  const c = normalizeGithubConfig({ ...base, project: "https://github.com/users/octocat/projects/12" });
  assert.equal(c.project, "https://github.com/users/octocat/projects/12");
});

test("returned config is frozen, including nested maps", () => {
  const c = normalizeGithubConfig(base);
  assert.equal(Object.isFrozen(c), true);
  assert.equal(Object.isFrozen(c.status_map), true);
  assert.equal(Object.isFrozen(c.status_map.open), true);
  assert.equal(Object.isFrozen(c.status_map_write), true);
  assert.equal(Object.isFrozen(c.fieldNames), true);
});

test("does not mutate the raw input", () => {
  const raw = {
    ...base,
    status_map: { open: "Todo", in_progress: ["Doing"], deferred: "Later", closed: "Done" },
    fields: { owner: "Assignee" },
  };
  const snapshot = structuredClone(raw);
  normalizeGithubConfig(raw);
  assert.deepEqual(raw, snapshot);
});

test("status_map: string value reads as a one-entry list and is the write option", () => {
  const c = normalizeGithubConfig({
    ...base,
    status_map: { open: "Todo", in_progress: "Doing", deferred: "Later", closed: "Shipped" },
  });
  assert.deepEqual(c.status_map, {
    open: ["Todo"],
    in_progress: ["Doing"],
    deferred: ["Later"],
    closed: ["Shipped"],
  });
  assert.deepEqual(c.status_map_write, {
    open: "Todo",
    in_progress: "Doing",
    deferred: "Later",
    closed: "Shipped",
  });
});

test("status_map: list value reads every entry and writes the first", () => {
  const c = normalizeGithubConfig({
    ...base,
    status_map: { open: ["Triage", "Todo"], in_progress: ["Doing", "Review"], deferred: ["Later"], closed: ["Shipped", "Won't do"] },
  });
  assert.deepEqual(c.status_map.closed, ["Shipped", "Won't do"]);
  assert.equal(c.status_map_write.closed, "Shipped");
  assert.equal(c.status_map_write.open, "Triage");
});

test("custom status_field, priority_field, type_source and claim_settle_ms are kept", () => {
  const c = normalizeGithubConfig({
    ...base,
    status_field: "Stage",
    priority_field: "Urgency",
    type_source: "labels",
    claim_settle_ms: 250,
  });
  assert.equal(c.status_field, "Stage");
  assert.equal(c.priority_field, "Urgency");
  assert.equal(c.type_source, "labels");
  assert.equal(c.claim_settle_ms, 250);
});

test("type_source accepts issue_types", () => {
  assert.equal(normalizeGithubConfig({ ...base, type_source: "issue_types" }).type_source, "issue_types");
});

test("claim_settle_ms boundaries 0 and 10000 are accepted", () => {
  assert.equal(normalizeGithubConfig({ ...base, claim_settle_ms: 0 }).claim_settle_ms, 0);
  assert.equal(normalizeGithubConfig({ ...base, claim_settle_ms: 10000 }).claim_settle_ms, 10000);
});

test("fields override replaces only the named adev field", () => {
  const c = normalizeGithubConfig({ ...base, fields: { owner: "Assignee", planRef: "Plan File" } });
  assert.deepEqual(c.fieldNames, { ...DEFAULT_FIELD_NAMES, owner: "Assignee", planRef: "Plan File" });
});

for (const [name, raw, keyPattern] of [
  ["missing config object", undefined, /tasks\.github/],
  ["null config object", null, /tasks\.github/],
  ["missing project", { repo: "acme/board" }, /project/],
  ["missing repo", { project: base.project }, /repo/],
  ["project over http", { ...base, project: "http://github.com/orgs/acme/projects/7" }, /project/],
  ["project on another host", { ...base, project: "https://gitlab.com/orgs/acme/projects/7" }, /project/],
  ["project number not numeric", { ...base, project: "https://github.com/orgs/acme/projects/seven" }, /project/],
  ["project with trailing path", { ...base, project: "https://github.com/orgs/acme/projects/7/views/1" }, /project/],
  ["project not a string", { ...base, project: 7 }, /project/],
  ["repo with three segments", { ...base, repo: "acme/board/extra" }, /repo/],
  ["repo with empty owner", { ...base, repo: "/board" }, /repo/],
  ["repo not a string", { ...base, repo: ["acme", "board"] }, /repo/],
  ["empty status_field", { ...base, status_field: "" }, /status_field/],
  ["non-string status_field", { ...base, status_field: 3 }, /status_field/],
  ["empty priority_field", { ...base, priority_field: "" }, /priority_field/],
  ["non-string priority_field", { ...base, priority_field: true }, /priority_field/],
  ["status_map empty list value", { ...base, status_map: { open: [], in_progress: "P", deferred: "D", closed: "C" } }, /status_map/],
  ["status_map empty string value", { ...base, status_map: { open: "", in_progress: "P", deferred: "D", closed: "C" } }, /status_map/],
  ["status_map non-string entry", { ...base, status_map: { open: ["O", 1], in_progress: "P", deferred: "D", closed: "C" } }, /status_map/],
  ["status_map option repeated across lists", { ...base, status_map: { open: ["O", "Shared"], in_progress: "P", deferred: "D", closed: ["C", "Shared"] } }, /status_map/],
  ["status_map not an object", { ...base, status_map: "Backlog" }, /status_map/],
  ["type_source wrong case", { ...base, type_source: "Labels" }, /type_source/],
  ["fields collision with another field's default name", { ...base, fields: { owner: "Branch" } }, /fields/],
  ["fields empty name", { ...base, fields: { owner: "" } }, /fields/],
  ["fields non-string name", { ...base, fields: { owner: 5 } }, /fields/],
  ["fields not an object", { ...base, fields: "Owner" }, /fields/],
  ["claim_settle_ms negative", { ...base, claim_settle_ms: -1 }, /claim_settle_ms/],
  ["claim_settle_ms fractional", { ...base, claim_settle_ms: 1.5 }, /claim_settle_ms/],
  ["claim_settle_ms numeric string", { ...base, claim_settle_ms: "1500" }, /claim_settle_ms/],
]) {
  test(`GITHUB_INVALID_CONFIG names the key: ${name}`, () => {
    assert.throws(() => normalizeGithubConfig(raw), { code: "GITHUB_INVALID_CONFIG", message: keyPattern });
  });
}

for (const [patch, keyPattern] of [
  [{ project: "https://github.com/acme/board" }, /project/],
  [{ repo: "acme" }, /repo/],
  [{ status_map: { open: "Backlog" } }, /status_map/],
  [{ status_map: { open: "X", in_progress: "X", deferred: "D", closed: "C" } }, /status_map/],
  [{ type_source: "magic" }, /type_source/],
  [{ fields: { owner: "Who", next_action: "Who" } }, /fields/],
  [{ fields: { nope: "X" } }, /fields/],
  [{ claim_settle_ms: 10001 }, /claim_settle_ms/],
]) {
  test(`plan case names the offending key: ${Object.keys(patch)[0]} ${JSON.stringify(Object.values(patch)[0])}`, () => {
    assert.throws(() => normalizeGithubConfig({ ...base, ...patch }), { code: "GITHUB_INVALID_CONFIG", message: keyPattern });
  });
}
