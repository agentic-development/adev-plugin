import { test } from "node:test";
import assert from "node:assert/strict";
import { createTransport } from "../../../lib/issues/github/transport.mjs";
import { normalizeGithubConfig } from "../../../lib/issues/github/config.mjs";
import { createPreflight } from "../../../lib/issues/github/preflight.mjs";
import { GITHUB_ERROR_CODES } from "../../../lib/issues/github/errors.mjs";
import { PREFLIGHT_QUERY } from "../../../lib/issues/github/queries.mjs";
import { captureThrow as caught } from "../../helpers.mjs";
import { replayExec } from "./replay-transport.mjs";
import { preflightFixture, okResponse, fieldNodes, preflightEntry } from "./fixtures/preflight.mjs";

const config = normalizeGithubConfig({ project: "https://github.com/orgs/acme/projects/7", repo: "acme/board" });

test("one network probe per process; result cached", () => {
  const exec = replayExec(preflightFixture.ok);
  const p = createPreflight({ transport: createTransport({ exec }), config });
  p.ensure(); p.ensure();
  assert.equal(exec.calls.length, 1);
  assert.deepEqual(p.visibility(), { repo: "private", project: "private" });
  assert.ok(exec.calls.every((c) => !/viewer\s*\{[^}]*login/.test(c.query)), "preflight never reads the gh login");
});

for (const [variant, code] of [
  ["projectMissing", "GITHUB_PROJECT_NOT_FOUND"], ["repoMissing", "GITHUB_REPO_NOT_FOUND"],
  ["statusFieldMissing", "GITHUB_FIELD_MISSING"], ["ownerFieldWrongType", "GITHUB_FIELD_MISSING"],
  ["statusOptionMissing", "GITHUB_STATUS_OPTION_MISSING"],
]) {
  test(`preflight ${variant} → ${code}, message ends with a remedy`, () => {
    const p = createPreflight({ transport: createTransport({ exec: replayExec(preflightFixture[variant]) }), config });
    assert.throws(() => p.ensure(), (e) => e.code === code && /adev issues github setup/.test(e.message));
  });
}

const SECRET = "adev-fixture-literal-secret-0123456789";
const REMEDY_AT_END = /adev issues github setup`?\.?$/;

function preflightFor(entries, cfg = config, env = {}) {
  const exec = replayExec(entries);
  const p = createPreflight({ transport: createTransport({ exec, env }), config: cfg });
  return { exec, p };
}

test("constructing a preflight makes no request; the probe runs on first ensure()", () => {
  const { exec, p } = preflightFor(preflightFixture.ok);
  assert.equal(exec.calls.length, 0);
  p.ensure();
  assert.equal(exec.calls.length, 1);
});

test("the probe is one PREFLIGHT_QUERY request, a named operation, with config-derived variables only", () => {
  const { exec, p } = preflightFor(preflightFixture.ok);
  p.ensure();
  assert.equal(exec.calls.length, 1);
  assert.equal(exec.calls[0].query, PREFLIGHT_QUERY);
  assert.match(PREFLIGHT_QUERY, /^\s*query\s+[A-Za-z_][A-Za-z0-9_]*/);
  assert.deepEqual(exec.calls[0].variables, { projectOwner: "acme", projectNumber: 7, isOrg: true, repoOwner: "acme", repoName: "board" });
});

test("PREFLIGHT_QUERY carries no config values and reads no viewer identity", () => {
  for (const literal of ["acme", "board", "Status", "Owner"]) {
    assert.doesNotMatch(PREFLIGHT_QUERY, new RegExp(`\\b${literal}\\b`), `document interpolates ${literal}`);
  }
  assert.doesNotMatch(PREFLIGHT_QUERY, /\bviewer\b/);
});

test("a users/ project URL resolves through the user owner with isOrg false", () => {
  const userConfig = normalizeGithubConfig({ project: "https://github.com/users/octo/projects/3", repo: "octo/notes" });
  const { exec, p } = preflightFor(preflightFixture.userProject, userConfig);
  p.ensure();
  assert.equal(exec.calls.length, 1);
  assert.deepEqual(exec.calls[0].variables, { projectOwner: "octo", projectNumber: 3, isOrg: false, repoOwner: "octo", repoName: "notes" });
  assert.deepEqual(p.visibility(), { repo: "private", project: "private" });
});

for (const [variant, expected] of [
  ["publicBoth", { repo: "public", project: "public" }],
  ["publicRepoPrivateProject", { repo: "public", project: "private" }],
  ["internalRepo", { repo: "private", project: "private" }],
]) {
  test(`visibility() records ${variant} as ${JSON.stringify(expected)}`, () => {
    const { p } = preflightFor(preflightFixture[variant]);
    p.ensure();
    assert.deepEqual(p.visibility(), expected);
  });
}

test("a failed preflight is cached: the second ensure() rethrows the same error without a second request", () => {
  const { exec, p } = preflightFor(preflightFixture.statusOptionMissing);
  const first = caught(() => p.ensure());
  const second = caught(() => p.ensure());
  assert.equal(first.code, "GITHUB_STATUS_OPTION_MISSING");
  assert.equal(second, first);
  assert.equal(exec.calls.length, 1);
});

for (const [variant, code, names] of [
  ["projectMissing", "GITHUB_PROJECT_NOT_FOUND", "https://github.com/orgs/acme/projects/7"],
  ["ownerMissing", "GITHUB_PROJECT_NOT_FOUND", "https://github.com/orgs/acme/projects/7"],
  ["projectNotFoundError", "GITHUB_PROJECT_NOT_FOUND", "https://github.com/orgs/acme/projects/7"],
  ["ownerNotFoundError", "GITHUB_PROJECT_NOT_FOUND", "https://github.com/orgs/acme/projects/7"],
  ["repoMissing", "GITHUB_REPO_NOT_FOUND", "acme/board"],
  ["repoNotFoundError", "GITHUB_REPO_NOT_FOUND", "acme/board"],
]) {
  test(`${variant} → ${code} naming ${names}, remedy last`, () => {
    const { exec, p } = preflightFor(preflightFixture[variant]);
    const err = caught(() => p.ensure());
    assert.equal(err.code, code);
    assert.ok(err.message.includes(names), err.message);
    assert.match(err.message, REMEDY_AT_END);
    assert.equal(exec.calls.length, 1);
  });
}

test("the spec-named not-found codes are exported in GITHUB_ERROR_CODES", () => {
  for (const code of ["GITHUB_PROJECT_NOT_FOUND", "GITHUB_REPO_NOT_FOUND", "GITHUB_FIELD_MISSING", "GITHUB_STATUS_OPTION_MISSING"]) {
    assert.equal(GITHUB_ERROR_CODES[code], code);
  }
});

test("an unrelated GraphQL error is not relabelled as not-found", () => {
  const { p } = preflightFor(preflightFixture.unrelatedGraphqlError);
  assert.throws(() => p.ensure(), { code: "GITHUB_REQUEST_FAILED" });
});

for (const [variant, field, type] of [
  ["statusFieldMissing", "Status", /single.?select/i],
  ["statusFieldWrongType", "Status", /single.?select/i],
  ["ownerFieldWrongType", "Owner", /\btext\b/i],
  ["claimedAtFieldMissing", "Claimed At", /\btext\b/i],
]) {
  test(`${variant} → GITHUB_FIELD_MISSING naming "${field}" and its expected type, remedy last`, () => {
    const { p } = preflightFor(preflightFixture[variant]);
    const err = caught(() => p.ensure());
    assert.equal(err.code, "GITHUB_FIELD_MISSING");
    assert.ok(err.message.includes(field), err.message);
    assert.match(err.message, type);
    assert.match(err.message, REMEDY_AT_END);
  });
}

for (const [variant, option] of [["statusOptionMissing", "Deferred"], ["readOptionMissing", "In Review"]]) {
  test(`${variant} → GITHUB_STATUS_OPTION_MISSING naming "${option}", remedy last`, () => {
    const { p } = preflightFor(preflightFixture[variant]);
    const err = caught(() => p.ensure());
    assert.equal(err.code, "GITHUB_STATUS_OPTION_MISSING");
    assert.ok(err.message.includes(option), err.message);
    assert.match(err.message, REMEDY_AT_END);
  });
}

test("field names come from the config: a renamed status field and owner override are honoured", () => {
  const custom = normalizeGithubConfig({
    project: "https://github.com/orgs/acme/projects/7",
    repo: "acme/board",
    status_field: "Stage",
    status_map: { open: "Todo", in_progress: "Doing", deferred: "Later", closed: "Shipped" },
    fields: { owner: "Claimed By" },
  });
  const stage = { id: "PVTSSF_stage", name: "Stage", dataType: "SINGLE_SELECT", options: ["Todo", "Doing", "Later", "Shipped"].map((name, i) => ({ id: `s${i}`, name })) };
  const textNames = ["Claimed By", "Claimed At", "Next Action", "Spec", "Plan", "Branch", "PR", "Legacy ID"];
  const { p } = preflightFor([preflightEntry(okResponse({ fields: fieldNodes({ status: stage, textNames }) }))], custom);
  p.ensure();
  assert.deepEqual(p.visibility(), { repo: "private", project: "private" });

  const { p: missing } = preflightFor([preflightEntry(okResponse())], custom);
  const err = caught(() => missing.ensure());
  assert.equal(err.code, "GITHUB_FIELD_MISSING");
  assert.ok(err.message.includes("Stage"), err.message);
});

test("a configured priority_field must exist as a number field", () => {
  const withPriority = normalizeGithubConfig({ project: "https://github.com/orgs/acme/projects/7", repo: "acme/board", priority_field: "Weight" });
  const { p: absent } = preflightFor(preflightFixture.ok, withPriority);
  const err = caught(() => absent.ensure());
  assert.equal(err.code, "GITHUB_FIELD_MISSING");
  assert.ok(err.message.includes("Weight"), err.message);
  assert.match(err.message, /number/i);
  assert.match(err.message, REMEDY_AT_END);

  const weight = { id: "PVTF_weight", name: "Weight", dataType: "NUMBER" };
  const { p: present } = preflightFor([preflightEntry(okResponse({ fields: fieldNodes({ extra: [weight] }) }))], withPriority);
  present.ensure();
  assert.deepEqual(present.visibility(), { repo: "private", project: "private" });
});

for (const [variant, code, remedyAtEnd] of [
  ["cliMissing", "GITHUB_CLI_MISSING", /Install it from https:\/\/cli\.github\.com and retry\.$/],
  ["authRequired", "GITHUB_AUTH_REQUIRED", /Run `gh auth login` or set GH_TOKEN\.$/],
  ["scopesMissing", "GITHUB_SCOPE_MISSING", /Remedy: run `gh auth refresh -s project`\.$/],
]) {
  test(`transport failure ${variant} surfaces from ensure() as ${code}, cached, remedy last`, () => {
    const { exec, p } = preflightFor(preflightFixture[variant]);
    const first = caught(() => p.ensure());
    assert.equal(first.code, code);
    assert.match(first.message, remedyAtEnd);
    assert.equal(caught(() => p.ensure()), first);
    assert.equal(exec.calls.length, 1);
  });
}

test("the token never reaches a request or a mapped not-found message", () => {
  const leaky = [preflightEntry({
    data: { organization: { projectV2: null }, repository: { id: "R_fixture", nameWithOwner: "acme/board", visibility: "PRIVATE" } },
    errors: [{ type: "NOT_FOUND", path: ["organization", "projectV2"], message: `Could not resolve ProjectV2 7 (${SECRET})` }],
  })];
  const { exec, p } = preflightFor(leaky, config, { GH_TOKEN: SECRET });
  const err = caught(() => p.ensure());
  assert.equal(err.code, "GITHUB_PROJECT_NOT_FOUND");
  assert.ok(!err.message.includes(SECRET), "token leaked into message");
  assert.ok(!JSON.stringify(err).includes(SECRET), "token leaked into error fields");
  assert.ok(exec.calls.every((c) => !JSON.stringify(c).includes(SECRET)), "token leaked into a request");
});

test("visibility() before a successful ensure() does not report a value", () => {
  const { p } = preflightFor(preflightFixture.repoMissing);
  assert.throws(() => p.visibility(), { code: "GITHUB_REPO_NOT_FOUND" });
});
