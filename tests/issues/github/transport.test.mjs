import { test } from "node:test";
import assert from "node:assert/strict";
import { createTransport } from "../../../lib/issues/github/transport.mjs";
import { githubError, GITHUB_ERROR_CODES, redact } from "../../../lib/issues/github/errors.mjs";
import { captureThrow } from "../../helpers.mjs";

function recordingExec(response) {
  const calls = [];
  const exec = (cmd, args, opts) => { calls.push({ cmd, args, opts }); return JSON.stringify(response); };
  return { exec, calls };
}

test("every request uses the one fixed argv and carries values only as variables on stdin", () => {
  const { exec, calls } = recordingExec({ data: { ok: true } });
  const t = createTransport({ exec });
  const hostile = "@/etc/passwd $(id) `x` \n } mutation { x }";
  t.request("query Q($v: String!) { echo(v: $v) }", { v: hostile });
  assert.equal(calls[0].cmd, "gh");
  assert.deepEqual(calls[0].args, ["api", "graphql", "--input", "-"]);
  assert.equal(calls[0].opts.shell, false);
  assert.equal(calls[0].opts.env.GH_PROMPT_DISABLED, "1");
  assert.deepEqual(JSON.parse(calls[0].opts.input).variables, { v: hostile });
  assert.ok(!calls[0].args.some((a) => a.includes(hostile)));
});

test("error mapping: ENOENT, auth, INSUFFICIENT_SCOPES, rate limit, timeout", () => {
  const throwing = (err) => () => { throw err; };
  const enoent = Object.assign(new Error("spawn gh ENOENT"), { code: "ENOENT" });
  assert.throws(() => createTransport({ exec: throwing(enoent) }).request("query{a}", {}), { code: "GITHUB_CLI_MISSING" });
  const auth = Object.assign(new Error("x"), { status: 4, stderr: "To get started with GitHub CLI, please run:  gh auth login" });
  assert.throws(() => createTransport({ exec: throwing(auth) }).request("query{a}", {}), { code: "GITHUB_AUTH_REQUIRED" });
  const scopes = { errors: [{ type: "INSUFFICIENT_SCOPES", message: "requires one of ['read:project']" }] };
  assert.throws(() => createTransport({ exec: () => JSON.stringify(scopes) }).request("query{a}", {}), { code: "GITHUB_SCOPE_MISSING" });
  const limited = { errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }] };
  assert.throws(() => createTransport({ exec: () => JSON.stringify(limited) }).request("query{a}", {}), { code: "GITHUB_RATE_LIMITED" });
  const timeout = Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" });
  assert.throws(() => createTransport({ exec: throwing(timeout) }).request("query{a}", {}), { code: "GITHUB_UNREACHABLE" });
});

test("pagination is bounded per connection: repeated cursor and page overrun both throw", () => {
  const pages = [
    { data: { node: { items: { totalCount: 150, pageInfo: { hasNextPage: true, endCursor: "c1" }, nodes: [1] } } } },
    { data: { node: { items: { totalCount: 150, pageInfo: { hasNextPage: true, endCursor: "c1" }, nodes: [2] } } } },
  ];
  let i = 0;
  const t = createTransport({ exec: () => JSON.stringify(pages[i++]) });
  assert.throws(() => t.paginate("query($after:String){x}", {}, { connectionPath: ["node", "items"] }), { code: "GITHUB_PAGINATION_INVALID" });
});

// Fake tokens are assembled at runtime so no token-shaped literal sits in the source.
const FAKE_CLASSIC = "ghp_" + "A1b2C3d4E5".repeat(3) + "F6g7H8";
const FAKE_OAUTH = "gho_" + "Z9y8X7w6V5".repeat(3) + "U4t3S2";
const FAKE_FINE_GRAINED = "github_pat_" + "11ABCDEFG0".repeat(2) + "xy_" + "Qw3rTy7UiO".repeat(5) + "pAsDfGhJk";

function connectionPage(totalCount, endCursor, hasNextPage, nodes) {
  return { data: { node: { items: { totalCount, pageInfo: { hasNextPage, endCursor }, nodes } } } };
}

function scriptedExec(responses) {
  const calls = [];
  let i = 0;
  const exec = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    const next = responses[i++];
    if (next === undefined) throw new Error(`scriptedExec ran past its ${responses.length} scripted responses`);
    return JSON.stringify(next);
  };
  return { exec, calls };
}

test("request writes exactly { query, variables } to stdin with utf8, a 30s timeout and the document verbatim", () => {
  const { exec, calls } = recordingExec({ data: { ok: true } });
  const document = "query Q($id: ID!) { node(id: $id) { id } }";
  createTransport({ exec }).request(document, { id: "PVTI_x" });
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].opts.input), { query: document, variables: { id: "PVTI_x" } });
  assert.equal(calls[0].opts.encoding, "utf8");
  assert.equal(calls[0].opts.timeout, 30_000);
});

test("request returns the response's data object", () => {
  const { exec } = recordingExec({ data: { viewer: { login: "octo" } } });
  assert.deepEqual(createTransport({ exec }).request("query{viewer{login}}", {}), { viewer: { login: "octo" } });
});

test("the injected env is passed through and GH_PROMPT_DISABLED is forced to 1 over a caller value", () => {
  const { exec, calls } = recordingExec({ data: {} });
  createTransport({ exec, env: { PATH: "/opt/bin", GH_PROMPT_DISABLED: "0" } }).request("query{a}", {});
  assert.deepEqual(calls[0].opts.env, { PATH: "/opt/bin", GH_PROMPT_DISABLED: "1" });
});

test("flag-shaped, file-reference, unicode and GraphQL-syntax values never reach argv and survive stdin byte-for-byte", () => {
  const { exec, calls } = recordingExec({ data: {} });
  const t = createTransport({ exec });
  const values = {
    field: "-F", long: "--field=@/etc/shadow", at: "@./secret.txt", nul: "a\u0000b",
    unicode: "café \u{1F680} ‮evil", fragment: "fragment F on X { y } ...F", nested: { list: ["$(rm -rf /)", "`id`"] },
  };
  t.request("mutation M($a: String) { a(v: $a) }", values);
  t.request("query Q($b: String) { b(v: $b) }", { b: values.long });
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.cmd, "gh");
    assert.deepEqual(call.args, ["api", "graphql", "--input", "-"]);
    assert.equal(call.opts.shell, false);
  }
  assert.deepEqual(JSON.parse(calls[0].opts.input).variables, values);
  assert.deepEqual(JSON.parse(calls[1].opts.input).variables, { b: "--field=@/etc/shadow" });
});

test("GITHUB_CLI_MISSING names the gh install page as its remedy", () => {
  const enoent = Object.assign(new Error("spawn gh ENOENT"), { code: "ENOENT" });
  const err = captureThrow(() => createTransport({ exec: () => { throw enoent; } }).request("query{a}", {}));
  assert.equal(err.code, "GITHUB_CLI_MISSING");
  assert.match(err.message, /https:\/\/cli\.github\.com/);
});

test("GITHUB_AUTH_REQUIRED for gh's login prompt and for an HTTP 401, with the gh auth login / GH_TOKEN remedy", () => {
  const prompt = Object.assign(new Error("x"), { status: 4, stderr: "To get started with GitHub CLI, please run:  gh auth login" });
  const badCreds = Object.assign(new Error("x"), { status: 1, stderr: "HTTP 401: Bad credentials (https://api.github.com/graphql)" });
  for (const failure of [prompt, badCreds]) {
    const err = captureThrow(() => createTransport({ exec: () => { throw failure; } }).request("query{a}", {}));
    assert.equal(err.code, "GITHUB_AUTH_REQUIRED");
    assert.match(err.message, /gh auth login/);
    assert.match(err.message, /GH_TOKEN/);
  }
});

test("GITHUB_SCOPE_MISSING names the scope GitHub reports and the gh auth refresh remedy", () => {
  const scopes = { errors: [{ type: "INSUFFICIENT_SCOPES", message: "Your token has not been granted the required scopes. The 'projectV2' field requires one of the following scopes: ['read:project']" }] };
  const err = captureThrow(() => createTransport({ exec: () => JSON.stringify(scopes) }).request("query{a}", {}));
  assert.equal(err.code, "GITHUB_SCOPE_MISSING");
  assert.match(err.message, /read:project/);
  assert.ok(err.message.includes("Remedy: run `gh auth refresh -s project`."), err.message);
  assert.deepEqual(err.scopes, ["read:project"]);
});

test("GITHUB_SCOPE_MISSING remedy names the spec scopes repo / project that cover what GitHub reports", () => {
  const scopeError = (message) => captureThrow(() => createTransport({ exec: () => JSON.stringify({ errors: [{ type: "INSUFFICIENT_SCOPES", message }] }) }).request("query{a}", {}));
  const repoOnly = scopeError("requires one of the following scopes: ['repo']");
  assert.ok(repoOnly.message.includes("Remedy: run `gh auth refresh -s repo`."), repoOnly.message);
  assert.deepEqual(repoOnly.scopes, ["repo"]);
  const both = scopeError("requires the following scopes: ['public_repo', 'read:project']");
  assert.ok(both.message.includes("Remedy: run `gh auth refresh -s repo,project`."), both.message);
  assert.deepEqual(both.scopes, ["public_repo", "read:project"]);
});

test("a secondary rate limit reported by gh on stderr maps to GITHUB_RATE_LIMITED", () => {
  const secondary = Object.assign(new Error("x"), { status: 1, stderr: "gh: You have exceeded a secondary rate limit. Please wait a few minutes before you try again. (HTTP 403)" });
  assert.throws(() => createTransport({ exec: () => { throw secondary; } }).request("query{a}", {}), { code: "GITHUB_RATE_LIMITED" });
});

test("a network failure reported by gh on stderr maps to GITHUB_UNREACHABLE", () => {
  const offline = Object.assign(new Error("x"), { status: 1, stderr: "error connecting to api.github.com\ncheck your internet connection or https://githubstatus.com" });
  assert.throws(() => createTransport({ exec: () => { throw offline; } }).request("query{a}", {}), { code: "GITHUB_UNREACHABLE" });
});

test("GITHUB_RATE_LIMITED carries resetAt as an ISO string when the response reports the reset time", () => {
  const limited = {
    data: { rateLimit: { remaining: 0, resetAt: "2026-11-26T12:34:56Z" } },
    errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded for user ID 1." }],
  };
  const err = captureThrow(() => createTransport({ exec: () => JSON.stringify(limited) }).request("query{a}", {}));
  assert.equal(err.code, "GITHUB_RATE_LIMITED");
  assert.equal(err.resetAt, "2026-11-26T12:34:56.000Z");
  assert.match(err.message, /2026-11-26T12:34:56\.000Z/);
});

test("GITHUB_RATE_LIMITED carries resetAt null when the response does not report a reset time", () => {
  const limited = { errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }] };
  const graphqlErr = captureThrow(() => createTransport({ exec: () => JSON.stringify(limited) }).request("query{a}", {}));
  assert.equal(graphqlErr.code, "GITHUB_RATE_LIMITED");
  assert.equal(graphqlErr.resetAt, null);
  const secondary = Object.assign(new Error("x"), { status: 1, stderr: "gh: You have exceeded a secondary rate limit. (HTTP 403)" });
  const stderrErr = captureThrow(() => createTransport({ exec: () => { throw secondary; } }).request("query{a}", {}));
  assert.equal(stderrErr.code, "GITHUB_RATE_LIMITED");
  assert.equal(stderrErr.resetAt, null);
});

test("GraphQL FORBIDDEN maps to GITHUB_PERMISSION_DENIED naming the operation and GitHub's message, token redacted", () => {
  const forbidden = {
    data: { addProjectV2ItemById: null },
    errors: [{ type: "FORBIDDEN", path: ["addProjectV2ItemById"], message: `Resource not accessible by personal access token ${FAKE_CLASSIC}` }],
  };
  const err = captureThrow(() => createTransport({ exec: () => JSON.stringify(forbidden) })
    .request("mutation AddItem($p: ID!, $c: ID!) { addProjectV2ItemById(input: { projectId: $p, contentId: $c }) { item { id } } }", { p: "PVT_1", c: "I_1" }));
  assert.equal(err.code, "GITHUB_PERMISSION_DENIED");
  assert.match(err.message, /addProjectV2ItemById/);
  assert.match(err.message, /Resource not accessible by personal access token/);
  assert.ok(!err.message.includes(FAKE_CLASSIC));
});

test("a non-JSON gh response throws without echoing a token from the raw output", () => {
  const raw = `<html>proxy error for ${FAKE_CLASSIC}</html>`;
  assert.throws(
    () => createTransport({ exec: () => raw }).request("query{a}", {}),
    (err) => err instanceof Error && err.code === "GITHUB_REQUEST_FAILED" && !err.message.includes(FAKE_CLASSIC),
  );
});

test("gh is spawned with a 64 MiB maxBuffer so a 100-item page with bodies fits", () => {
  const { exec, calls } = recordingExec({ data: {} });
  createTransport({ exec }).request("query{a}", {});
  assert.equal(calls[0].opts.maxBuffer, 64 * 1024 * 1024);
});

test("ENOBUFS maps to GITHUB_REQUEST_FAILED with a clear buffer message and no echoed output", () => {
  const overflow = Object.assign(new Error("spawnSync gh ENOBUFS"), { code: "ENOBUFS", status: null, stdout: `{"data":{"t":"${FAKE_CLASSIC}"`, stderr: "" });
  const err = captureThrow(() => createTransport({ exec: () => { throw overflow; } }).request("query{a}", {}));
  assert.equal(err.code, "GITHUB_REQUEST_FAILED");
  assert.match(err.message, /64 MiB/);
  assert.doesNotMatch(err.message, /status null/);
  assert.ok(!err.message.includes(FAKE_CLASSIC));
});

function ghGraphqlFailure(body, stderr) {
  return () => { throw Object.assign(new Error("Command failed: gh api graphql --input -"), { status: 1, stdout: JSON.stringify(body), stderr }); };
}

test("non-zero gh exit with INSUFFICIENT_SCOPES JSON on stdout maps to GITHUB_SCOPE_MISSING with scopes, redacted", () => {
  const body = { errors: [{ type: "INSUFFICIENT_SCOPES", message: `token ${FAKE_CLASSIC} requires one of the following scopes: ['read:project']` }] };
  const err = captureThrow(() => createTransport({ exec: ghGraphqlFailure(body, "gh: Your token has not been granted the required scopes") }).request("query{a}", {}));
  assert.equal(err.code, "GITHUB_SCOPE_MISSING");
  assert.deepEqual(err.scopes, ["read:project"]);
  assert.ok(err.message.includes("Remedy: run `gh auth refresh -s project`."), err.message);
  assert.ok(!err.message.includes(FAKE_CLASSIC));
});

test("non-zero gh exit with RATE_LIMITED JSON on stdout maps to GITHUB_RATE_LIMITED with resetAt, redacted", () => {
  const body = { data: { rateLimit: { remaining: 0, resetAt: "2026-11-26T13:00:00Z" } }, errors: [{ type: "RATE_LIMITED", message: `limit hit for ${FAKE_OAUTH}` }] };
  const err = captureThrow(() => createTransport({ exec: ghGraphqlFailure(body, "gh: API rate limit exceeded") }).request("query{a}", {}));
  assert.equal(err.code, "GITHUB_RATE_LIMITED");
  assert.equal(err.resetAt, "2026-11-26T13:00:00.000Z");
  assert.ok(!err.message.includes(FAKE_OAUTH));
});

test("non-zero gh exit with FORBIDDEN JSON on stdout maps to GITHUB_PERMISSION_DENIED naming the operation, redacted", () => {
  const body = { errors: [{ type: "FORBIDDEN", path: ["updateProjectV2ItemFieldValue"], message: `Resource not accessible by integration ${FAKE_FINE_GRAINED}` }] };
  const err = captureThrow(() => createTransport({ exec: ghGraphqlFailure(body, "gh: Resource not accessible by integration") }).request("mutation SetField{x}", {}));
  assert.equal(err.code, "GITHUB_PERMISSION_DENIED");
  assert.equal(err.operation, "updateProjectV2ItemFieldValue");
  assert.match(err.message, /updateProjectV2ItemFieldValue: Resource not accessible by integration/);
  assert.ok(!err.message.includes(FAKE_FINE_GRAINED));
});

// 40 hex characters: shaped like a legacy token but not one; no gh-prefix pattern matches it.
const FAKE_ENV_TOKEN = "0123456789abcdef".repeat(2) + "01234567";

test("the literal GH_TOKEN and GITHUB_TOKEN values from the transport env are scrubbed from thrown messages", () => {
  const leak = Object.assign(new Error("x"), { status: 4, stderr: `token ${FAKE_ENV_TOKEN} invalid; run gh auth login` });
  const authErr = captureThrow(() => createTransport({ exec: () => { throw leak; }, env: { GH_TOKEN: FAKE_ENV_TOKEN } }).request("query{a}", {}));
  assert.equal(authErr.code, "GITHUB_AUTH_REQUIRED");
  assert.ok(!authErr.message.includes(FAKE_ENV_TOKEN));

  const forbidden = { errors: [{ type: "FORBIDDEN", path: [`op_${FAKE_ENV_TOKEN}`], message: `denied for ${FAKE_ENV_TOKEN}` }] };
  const permErr = captureThrow(() => createTransport({ exec: () => JSON.stringify(forbidden), env: { GITHUB_TOKEN: FAKE_ENV_TOKEN } }).request("query{a}", {}));
  assert.equal(permErr.code, "GITHUB_PERMISSION_DENIED");
  assert.ok(!permErr.message.includes(FAKE_ENV_TOKEN));
  assert.ok(!permErr.operation.includes(FAKE_ENV_TOKEN));
});

test("redact scrubs caller-supplied literal secrets alongside the token patterns", () => {
  assert.equal(redact(`a ${FAKE_ENV_TOKEN} b`, [FAKE_ENV_TOKEN]).includes(FAKE_ENV_TOKEN), false);
  assert.match(redact(`a ${FAKE_ENV_TOKEN} b`, [FAKE_ENV_TOKEN]), /^a .+ b$/);
  assert.equal(redact(`a ${FAKE_ENV_TOKEN} b`), `a ${FAKE_ENV_TOKEN} b`);
});

test("tokens in gh stderr and in GraphQL error messages are redacted from thrown messages", () => {
  const authLeak = Object.assign(new Error("x"), { status: 4, stderr: `token ${FAKE_CLASSIC} rejected; run gh auth login` });
  const authErr = captureThrow(() => createTransport({ exec: () => { throw authLeak; } }).request("query{a}", {}));
  assert.equal(authErr.code, "GITHUB_AUTH_REQUIRED");
  assert.ok(!authErr.message.includes(FAKE_CLASSIC));

  const scopeLeak = { errors: [{ type: "INSUFFICIENT_SCOPES", message: `token ${FAKE_FINE_GRAINED} requires one of ['project']` }] };
  const scopeErr = captureThrow(() => createTransport({ exec: () => JSON.stringify(scopeLeak) }).request("query{a}", {}));
  assert.equal(scopeErr.code, "GITHUB_SCOPE_MISSING");
  assert.ok(!scopeErr.message.includes(FAKE_FINE_GRAINED));
  assert.match(scopeErr.message, /project/);
});

test("redact strips every gh token family and github_pat tokens, keeping the surrounding text", () => {
  const families = ["ghp_", "gho_", "ghu_", "ghs_", "ghr_"].map((p) => p + "Zz09Yy18Xx".repeat(3) + "Ww27Vv");
  for (const token of families) {
    const out = redact(`before ${token} after`);
    assert.ok(!out.includes(token), `${token.slice(0, 4)} token survived redaction`);
    assert.match(out, /^before /);
    assert.match(out, / after$/);
  }
  const pat = redact(`Authorization: ${FAKE_FINE_GRAINED}`);
  assert.ok(!pat.includes(FAKE_FINE_GRAINED));
  assert.match(pat, /^Authorization: /);
  assert.equal(redact("no secrets here: ghp_short gh_not_a_token"), "no secrets here: ghp_short gh_not_a_token");
});

test("githubError builds an Error carrying the code, a redacted message and the extra fields", () => {
  const err = githubError("GITHUB_RATE_LIMITED", `limited for ${FAKE_OAUTH}`, { resetAt: "2026-11-26T12:00:00Z" });
  assert.ok(err instanceof Error);
  assert.equal(err.code, "GITHUB_RATE_LIMITED");
  assert.ok(!err.message.includes(FAKE_OAUTH));
  assert.match(err.message, /^limited for /);
  assert.equal(err.resetAt, "2026-11-26T12:00:00Z");
});

test("githubError redacts string-valued extras, including strings inside arrays", () => {
  const err = githubError("GITHUB_PERMISSION_DENIED", "denied", { operation: `op ${FAKE_CLASSIC}`, scopes: ["project", `x ${FAKE_OAUTH}`], count: 2 });
  assert.ok(!err.operation.includes(FAKE_CLASSIC));
  assert.match(err.operation, /^op /);
  assert.equal(err.scopes[0], "project");
  assert.ok(!err.scopes[1].includes(FAKE_OAUTH));
  assert.equal(err.count, 2);
});

test("GITHUB_ERROR_CODES lists every code the transport raises", () => {
  const codes = Object.values(GITHUB_ERROR_CODES);
  for (const code of ["GITHUB_CLI_MISSING", "GITHUB_AUTH_REQUIRED", "GITHUB_SCOPE_MISSING", "GITHUB_PERMISSION_DENIED", "GITHUB_RATE_LIMITED", "GITHUB_UNREACHABLE", "GITHUB_PAGINATION_INVALID"]) {
    assert.ok(codes.includes(code), `${code} missing from GITHUB_ERROR_CODES`);
  }
});

test("paginate follows endCursor, preserves caller variables and returns every node in page order", () => {
  const { exec, calls } = scriptedExec([
    connectionPage(250, "c1", true, ["a", "b"]),
    connectionPage(250, "c2", true, ["c"]),
    connectionPage(250, "c3", false, ["d", "e"]),
  ]);
  const nodes = createTransport({ exec }).paginate("query($p:ID!,$after:String){x}", { p: "PVT_1" }, { connectionPath: ["node", "items"] });
  assert.deepEqual(nodes, ["a", "b", "c", "d", "e"]);
  assert.equal(calls.length, 3);
  const vars = calls.map((c) => JSON.parse(c.opts.input).variables);
  assert.equal(vars[0].p, "PVT_1");
  assert.deepEqual(vars[1], { p: "PVT_1", after: "c1" });
  assert.deepEqual(vars[2], { p: "PVT_1", after: "c2" });
  for (const call of calls) assert.deepEqual(call.args, ["api", "graphql", "--input", "-"]);
});

test("paginate accepts exactly ceil(totalCount / 100) + 1 pages", () => {
  const { exec, calls } = scriptedExec([
    connectionPage(150, "c1", true, [1]),
    connectionPage(150, "c2", true, [2]),
    connectionPage(150, "c3", false, [3]),
  ]);
  const nodes = createTransport({ exec }).paginate("query($after:String){x}", {}, { connectionPath: ["node", "items"] });
  assert.deepEqual(nodes, [1, 2, 3]);
  assert.equal(calls.length, 3);
});

test("paginate throws GITHUB_PAGINATION_INVALID once the page count passes ceil(totalCount / 100) + 1", () => {
  const { exec, calls } = scriptedExec([
    connectionPage(150, "c1", true, [1]),
    connectionPage(150, "c2", true, [2]),
    connectionPage(150, "c3", true, [3]),
    connectionPage(150, "c4", true, [4]),
    connectionPage(150, "c5", false, [5]),
  ]);
  assert.throws(
    () => createTransport({ exec }).paginate("query($after:String){x}", {}, { connectionPath: ["node", "items"] }),
    { code: "GITHUB_PAGINATION_INVALID" },
  );
  assert.equal(calls.length, 4);
});

test("paginate over an empty connection issues one request and returns an empty array", () => {
  const { exec, calls } = scriptedExec([connectionPage(0, null, false, [])]);
  assert.deepEqual(createTransport({ exec }).paginate("query($after:String){x}", {}, { connectionPath: ["node", "items"] }), []);
  assert.equal(calls.length, 1);
});

test("paginate detects a cursor repeated after an intervening page", () => {
  const { exec } = scriptedExec([
    connectionPage(1000, "c1", true, [1]),
    connectionPage(1000, "c2", true, [2]),
    connectionPage(1000, "c1", true, [3]),
    connectionPage(1000, "c3", false, [4]),
  ]);
  assert.throws(
    () => createTransport({ exec }).paginate("query($after:String){x}", {}, { connectionPath: ["node", "items"] }),
    { code: "GITHUB_PAGINATION_INVALID" },
  );
});

test("each paginate call bounds its connection by its own totalCount and its own cursor set", () => {
  const subIssues = (totalCount, endCursor, hasNextPage, nodes) =>
    ({ data: { node: { subIssues: { totalCount, pageInfo: { hasNextPage, endCursor }, nodes } } } });
  const { exec } = scriptedExec([
    connectionPage(1000, "c1", true, ["i1"]),
    connectionPage(1000, "c2", false, ["i2"]),
    subIssues(5, "c1", true, ["s1"]),
    subIssues(5, "c2", false, ["s2"]),
    subIssues(5, "d1", true, ["t1"]),
    subIssues(5, "d2", true, ["t2"]),
    subIssues(5, "d3", true, ["t3"]),
    subIssues(5, "d4", false, ["t4"]),
  ]);
  const t = createTransport({ exec });
  assert.deepEqual(t.paginate("query($after:String){x}", {}, { connectionPath: ["node", "items"] }), ["i1", "i2"]);
  assert.deepEqual(t.paginate("query($id:ID!,$after:String){x}", { id: "I_1" }, { connectionPath: ["node", "subIssues"] }), ["s1", "s2"]);
  assert.throws(
    () => t.paginate("query($id:ID!,$after:String){x}", { id: "I_2" }, { connectionPath: ["node", "subIssues"] }),
    { code: "GITHUB_PAGINATION_INVALID" },
  );
});

test("a rate limit on a later page fails the whole paginate with GITHUB_RATE_LIMITED", () => {
  const { exec } = scriptedExec([
    connectionPage(250, "c1", true, [1]),
    { errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }] },
  ]);
  assert.throws(
    () => createTransport({ exec }).paginate("query($after:String){x}", {}, { connectionPath: ["node", "items"] }),
    { code: "GITHUB_RATE_LIMITED" },
  );
});

test("an exec error coded UNRECORDED_GITHUB_REQUEST reaches the caller unchanged; other codes are still mapped", () => {
  const unrecorded = Object.assign(new Error("no recorded response for Viewer"), { code: "UNRECORDED_GITHUB_REQUEST" });
  const thrown = captureThrow(() => createTransport({ exec: () => { throw unrecorded; } }).request("query Viewer { viewer { login } }", {}));
  assert.equal(thrown, unrecorded);
  const other = Object.assign(new Error("boom"), { code: "SOMETHING_ELSE" });
  assert.throws(() => createTransport({ exec: () => { throw other; } }).request("query Viewer { viewer { login } }", {}), { code: "GITHUB_REQUEST_FAILED" });
});
