import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { replayExec } from "./replay-transport.mjs";
import { createTransport } from "../../../lib/issues/github/transport.mjs";

const FIXTURES = new URL("../conformance/fixtures/", import.meta.url).pathname;
const UNIT_FIXTURES = new URL("./fixtures/", import.meta.url).pathname;
// No `\b` anchors: a token directly after a JSON escape such as `\n`, or touching a
// word character, has no word boundary at its edge and would slip past them.
const TOKEN_RE = /(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/;
const ALLOWED_LOGINS = new Set(["adev-fixture-bot", "adev-fixture-human"]);
const OWNER_VALUE_RE = /"(url|resourcePath|nameWithOwner)"\s*:\s*"([^"]*)"/g;

// The login that owns a GitHub path: `/<owner>/...`, or `/orgs|users/<owner>/...`.
// URLs on other hosts name no GitHub identity and are not checked.
function ownerOf(key, value) {
  if (key === "nameWithOwner") return value.split("/")[0];
  let path = value;
  if (key === "url") {
    const m = /^https?:\/\/github\.com(\/[^?#]*)/.exec(value);
    if (!m) return null;
    path = m[1];
  }
  const segments = path.split("/").filter(Boolean);
  return (segments[0] === "orgs" || segments[0] === "users" ? segments[1] : segments[0]) ?? null;
}

// JSON fixtures get the full lint; `.mjs` unit fixtures are source text, so only the
// token check applies to them.
function lintFixture(f, text) {
  assert.doesNotMatch(text, TOKEN_RE, f);
  if (!f.endsWith(".json")) return;
  for (const [, login] of text.matchAll(/"login"\s*:\s*"([^"]+)"/g)) assert.ok(ALLOWED_LOGINS.has(login), `${f}: ${login}`);
  for (const [, key, value] of text.matchAll(OWNER_VALUE_RE)) {
    const owner = ownerOf(key, value);
    if (owner !== null) assert.ok(ALLOWED_LOGINS.has(owner), `${f}: ${key} owner ${owner}`);
  }
  for (const [, s] of text.matchAll(/"(?:title|body)"\s*:\s*"([^"]*)"/g)) assert.match(s, /^(adev-fixture:|$)/, `${f}: ${s.slice(0, 40)}`);
}

test("an unrecorded request fails instead of reaching the network", () => {
  const t = createTransport({ exec: replayExec([]) });
  assert.throws(() => t.request("query{viewer{login}}", {}), { code: "UNRECORDED_GITHUB_REQUEST" });
});

test("committed fixtures carry no tokens, no foreign logins, and only recorder-authored text", () => {
  for (const dir of [FIXTURES, UNIT_FIXTURES]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir, { recursive: true }).filter((p) => p.endsWith(".json") || p.endsWith(".mjs"))) {
      lintFixture(f, readFileSync(join(dir, f), "utf8"));
    }
  }
});

const VIEWER = "query Viewer { viewer { login } }";
const ITEMS = "query ProjectItems($project: ID!, $after: String) { node(id: $project) { ... on ProjectV2 { items(first: 100, after: $after) { totalCount pageInfo { hasNextPage endCursor } nodes { id } } } } }";
const SET_FIELDS = "mutation SetFields($input: UpdateProjectV2ItemFieldValueInput!) { updateProjectV2ItemFieldValue(input: $input) { projectV2Item { id } } }";

function itemsPage(endCursor, hasNextPage, nodes) {
  return { data: { node: { items: { totalCount: 150, pageInfo: { hasNextPage, endCursor }, nodes } } } };
}

test("a recorded request is served its recorded response through createTransport", () => {
  const exec = replayExec([
    { query: VIEWER, variables: {}, response: { data: { viewer: { login: "adev-fixture-bot" } } } },
  ]);
  const data = createTransport({ exec }).request(VIEWER, {});
  assert.deepEqual(data, { viewer: { login: "adev-fixture-bot" } });
});

test("the replay key is insensitive to variable key order at every depth", () => {
  const exec = replayExec([
    { query: SET_FIELDS, variables: { input: { projectId: "PVT_1", itemId: "PVTI_1", value: { text: "adev-fixture: x", number: 1 } } }, response: { data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: "PVTI_1" } } } } },
  ]);
  const data = createTransport({ exec }).request(SET_FIELDS, { input: { value: { number: 1, text: "adev-fixture: x" }, itemId: "PVTI_1", projectId: "PVT_1" } });
  assert.deepEqual(data, { updateProjectV2ItemFieldValue: { projectV2Item: { id: "PVTI_1" } } });
});

test("a request differing only in a variable value is unrecorded", () => {
  const exec = replayExec([
    { query: SET_FIELDS, variables: { input: { itemId: "PVTI_1" } }, response: { data: { ok: true } } },
  ]);
  const t = createTransport({ exec });
  assert.throws(() => t.request(SET_FIELDS, { input: { itemId: "PVTI_2" } }), { code: "UNRECORDED_GITHUB_REQUEST" });
});

test("array order in variables is significant to the replay key", () => {
  const exec = replayExec([
    { query: SET_FIELDS, variables: { input: { ids: ["a", "b"] } }, response: { data: { ok: true } } },
  ]);
  const t = createTransport({ exec });
  assert.throws(() => t.request(SET_FIELDS, { input: { ids: ["b", "a"] } }), { code: "UNRECORDED_GITHUB_REQUEST" });
});

test("a request whose document differs from the recording, even by whitespace, is unrecorded", () => {
  const exec = replayExec([
    { query: VIEWER, variables: {}, response: { data: { viewer: { login: "adev-fixture-bot" } } } },
  ]);
  const t = createTransport({ exec });
  assert.throws(() => t.request("query Viewer {  viewer { login } }", {}), { code: "UNRECORDED_GITHUB_REQUEST" });
});

test("a request with extra variables beyond the recording is unrecorded", () => {
  const exec = replayExec([
    { query: VIEWER, variables: {}, response: { data: { viewer: { login: "adev-fixture-bot" } } } },
  ]);
  const t = createTransport({ exec });
  assert.throws(() => t.request(VIEWER, { extra: 1 }), { code: "UNRECORDED_GITHUB_REQUEST" });
});

test("exec.calls records operation, query and variables of every request in order", () => {
  const exec = replayExec([
    { query: VIEWER, variables: {}, response: { data: { viewer: { login: "adev-fixture-bot" } } } },
    { query: SET_FIELDS, variables: { input: { itemId: "PVTI_1" } }, response: { data: { ok: true } } },
  ]);
  const t = createTransport({ exec });
  assert.deepEqual(exec.calls, []);
  t.request(SET_FIELDS, { input: { itemId: "PVTI_1" } });
  t.request(VIEWER, {});
  assert.equal(exec.calls.length, 2);
  assert.deepEqual(exec.calls, [
    { operation: "SetFields", query: SET_FIELDS, variables: { input: { itemId: "PVTI_1" } } },
    { operation: "Viewer", query: VIEWER, variables: {} },
  ]);
});

test("paginate follows recorded pages keyed by the $after cursor and counts each request", () => {
  const exec = replayExec([
    { query: ITEMS, variables: { project: "PVT_1" }, response: itemsPage("c1", true, [{ id: "PVTI_1" }]) },
    { query: ITEMS, variables: { project: "PVT_1", after: "c1" }, response: itemsPage("c2", false, [{ id: "PVTI_2" }]) },
  ]);
  const nodes = createTransport({ exec }).paginate(ITEMS, { project: "PVT_1" }, { connectionPath: ["node", "items"] });
  assert.deepEqual(nodes, [{ id: "PVTI_1" }, { id: "PVTI_2" }]);
  assert.equal(exec.calls.length, 2);
  assert.deepEqual(exec.calls.map((c) => [c.operation, c.variables]), [
    ["ProjectItems", { project: "PVT_1" }],
    ["ProjectItems", { project: "PVT_1", after: "c1" }],
  ]);
});

test("a missing page mid-pagination fails as unrecorded rather than returning a partial array", () => {
  const exec = replayExec([
    { query: ITEMS, variables: { project: "PVT_1" }, response: itemsPage("c1", true, [{ id: "PVTI_1" }]) },
  ]);
  const t = createTransport({ exec });
  assert.throws(() => t.paginate(ITEMS, { project: "PVT_1" }, { connectionPath: ["node", "items"] }), { code: "UNRECORDED_GITHUB_REQUEST" });
});

test("a recorded GraphQL error response is mapped by the transport like a live one", () => {
  const exec = replayExec([
    { query: SET_FIELDS, variables: { input: { itemId: "PVTI_1" } }, response: { errors: [{ type: "FORBIDDEN", path: ["updateProjectV2ItemFieldValue"], message: "Resource not accessible by integration" }] } },
  ]);
  const t = createTransport({ exec });
  assert.throws(() => t.request(SET_FIELDS, { input: { itemId: "PVTI_1" } }), { code: "GITHUB_PERMISSION_DENIED" });
});

test("a recorded gh failure replays as a spawn error the transport maps by its stderr", () => {
  const exec = replayExec([
    { query: VIEWER, variables: {}, error: { code: null, stderr: "HTTP 401: Bad credentials (https://api.github.com/graphql)" } },
  ]);
  const t = createTransport({ exec });
  assert.throws(() => t.request(VIEWER, {}), { code: "GITHUB_AUTH_REQUIRED" });
});

test("a recorded ENOENT failure replays as a missing gh CLI", () => {
  const exec = replayExec([
    { query: VIEWER, variables: {}, error: { code: "ENOENT", stderr: "" } },
  ]);
  const t = createTransport({ exec });
  assert.throws(() => t.request(VIEWER, {}), { code: "GITHUB_CLI_MISSING" });
});

test("a fixture recorded with an anonymous document is refused when the replay is built", () => {
  assert.throws(
    () => replayExec([{ query: "query { viewer { login } }", variables: {}, response: { data: { viewer: { login: "adev-fixture-bot" } } } }]),
    /anonymous|named/i,
  );
  assert.throws(
    () => replayExec([{ query: "{ viewer { login } }", variables: {}, response: { data: { viewer: { login: "adev-fixture-bot" } } } }]),
    /anonymous|named/i,
  );
  assert.throws(
    () => replayExec([{ query: "query { viewer { login } }", variables: {}, response: { data: { viewer: { login: "adev-fixture-bot" } } } }]),
    { code: "REPLAY_ANONYMOUS_DOCUMENT" },
  );
  assert.throws(
    () => replayExec([{ query: "{ viewer { login } }", variables: {}, response: { data: { viewer: { login: "adev-fixture-bot" } } } }]),
    { code: "REPLAY_ANONYMOUS_DOCUMENT" },
  );
});

test("two recordings with the same key but different outcomes are refused when the replay is built", () => {
  assert.throws(
    () => replayExec([
      { query: SET_FIELDS, variables: { input: { itemId: "PVTI_1", n: 1 } }, response: { data: { ok: true } } },
      { query: SET_FIELDS, variables: { input: { n: 1, itemId: "PVTI_1" } }, response: { data: { ok: false } } },
    ]),
    { code: "REPLAY_AMBIGUOUS_FIXTURE" },
  );
  assert.throws(
    () => replayExec([
      { query: VIEWER, variables: {}, response: { data: { viewer: { login: "adev-fixture-bot" } } } },
      { query: VIEWER, variables: {}, error: { code: "ENOENT", stderr: "" } },
    ]),
    { code: "REPLAY_AMBIGUOUS_FIXTURE" },
  );
});

test("a recorded sequence serves its outcomes in request order, and a request past its end is unrecorded", () => {
  const exec = replayExec([
    {
      query: VIEWER,
      variables: {},
      sequence: [
        { response: { data: { viewer: { login: "adev-fixture-bot" } } } },
        { response: { data: { viewer: { login: "adev-fixture-human" } } } },
      ],
    },
  ]);
  const t = createTransport({ exec });
  assert.deepEqual(t.request(VIEWER, {}), { viewer: { login: "adev-fixture-bot" } });
  assert.deepEqual(t.request(VIEWER, {}), { viewer: { login: "adev-fixture-human" } });
  assert.throws(() => t.request(VIEWER, {}), { code: "UNRECORDED_GITHUB_REQUEST" });
  assert.equal(exec.calls.length, 3);
});

test("an empty sequence, or a sequence and a plain recording under one key, is refused when the replay is built", () => {
  assert.throws(() => replayExec([{ query: VIEWER, variables: {}, sequence: [] }]), { code: "REPLAY_INVALID_FIXTURE" });
  assert.throws(
    () => replayExec([
      { query: VIEWER, variables: {}, sequence: [{ response: { data: { viewer: { login: "adev-fixture-bot" } } } }] },
      { query: VIEWER, variables: {}, response: { data: { viewer: { login: "adev-fixture-bot" } } } },
    ]),
    { code: "REPLAY_AMBIGUOUS_FIXTURE" },
  );
});

// Token-shaped strings are assembled at runtime so no token literal sits in the source.
test("TOKEN_RE catches every token prefix BEH-37 names and ignores short look-alikes", () => {
  const body = "A1b2C3d4E5".repeat(3);
  for (const prefix of ["ghp_", "gho_", "ghu_", "ghs_", "ghr_", "github_pat_"]) {
    assert.match(`{"x":"${prefix}${body}"}`, TOKEN_RE, prefix);
  }
  assert.doesNotMatch(`{"x":"${"ghp_"}short"}`, TOKEN_RE);
  assert.doesNotMatch(`{"x":"${"ghx_"}${body}"}`, TOKEN_RE);
});

test("TOKEN_RE catches a token right after a JSON escape or a word character", () => {
  const token = "ghp_" + "A1b2C3d4E5".repeat(3) + "F6g7H8";
  const pat = "github_pat_" + "11ABCDEFG0".repeat(2) + "xy_" + "Qw3rTy7UiO".repeat(5);
  assert.match(`{"body":"adev-fixture: line\\n${token}"}`, TOKEN_RE);
  assert.match(`{"x":"a_${token}"}`, TOKEN_RE);
  assert.match(`{"x":"a${pat}"}`, TOKEN_RE);
  assert.match(`{"x":"${token}_tail"}`, TOKEN_RE);
});

test("lintFixture rejects a token in any fixture kind, including .mjs source", () => {
  const token = "gho_" + "Z9y8X7w6V5".repeat(3) + "U4t3S2";
  assert.throws(() => lintFixture("a.json", `{"x":"\\n${token}"}`), assert.AssertionError);
  assert.throws(() => lintFixture("items.mjs", `export const t = "${token}";`), assert.AssertionError);
  assert.doesNotThrow(() => lintFixture("items.mjs", `export const login = "someone-else"; export const title = "free text";`));
});

test("lintFixture checks the owner segment of url values against the allowlist", () => {
  assert.throws(() => lintFixture("a.json", `{"url":"https://github.com/octocat/app/issues/3"}`), assert.AssertionError);
  assert.throws(() => lintFixture("a.json", `{"url":"https://github.com/orgs/octo-org/projects/1"}`), assert.AssertionError);
  assert.throws(() => lintFixture("a.json", `{"url":"https://github.com/users/octocat/projects/1"}`), assert.AssertionError);
  assert.doesNotThrow(() => lintFixture("a.json", `{"url":"https://github.com/adev-fixture-bot/board/issues/3"}`));
  assert.doesNotThrow(() => lintFixture("a.json", `{"url":"https://github.com/users/adev-fixture-human/projects/1"}`));
});

test("lintFixture checks the owner segment of resourcePath values against the allowlist", () => {
  assert.throws(() => lintFixture("a.json", `{"resourcePath":"/octocat/app/issues/3"}`), assert.AssertionError);
  assert.throws(() => lintFixture("a.json", `{"resourcePath":"/orgs/octo-org/projects/1"}`), assert.AssertionError);
  assert.doesNotThrow(() => lintFixture("a.json", `{"resourcePath":"/adev-fixture-bot/board/issues/3"}`));
  assert.doesNotThrow(() => lintFixture("a.json", `{"resourcePath":"/users/adev-fixture-bot/projects/1"}`));
});

test("lintFixture checks the owner of nameWithOwner values against the allowlist", () => {
  assert.throws(() => lintFixture("a.json", `{"nameWithOwner":"octocat/app"}`), assert.AssertionError);
  assert.doesNotThrow(() => lintFixture("a.json", `{"nameWithOwner":"adev-fixture-bot/board"}`));
});

test("lintFixture still enforces the login allowlist and recorder-authored text", () => {
  assert.throws(() => lintFixture("a.json", `{"login":"octocat"}`), assert.AssertionError);
  assert.throws(() => lintFixture("a.json", `{"title":"real issue"}`), assert.AssertionError);
  assert.doesNotThrow(() => lintFixture("a.json", `{"login":"adev-fixture-bot","title":"adev-fixture: t","body":""}`));
});
