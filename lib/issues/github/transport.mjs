/**
 * The single channel through which the GitHub board backend talks to GitHub.
 *
 * Every request is `gh api graphql --input -` with a JSON body
 * `{ query, variables }` on stdin. Caller- and board-supplied values travel
 * only as GraphQL variables: never as argv tokens, never through `-F`/`--field`
 * (which reads `@<path>` values as local files), never interpolated into a
 * document. Preflight adds no argv of its own — a missing CLI, missing auth
 * and missing scopes are all recognised from this channel's failures.
 *
 * @module lib/issues/github/transport
 */

import { execFileSync } from "node:child_process";
import { githubError, GITHUB_ERROR_CODES as CODES, redact } from "./errors.mjs";

const FIXED_ARGV = Object.freeze(["api", "graphql", "--input", "-"]);
const TIMEOUT_MS = 30_000;
// execFileSync defaults to 1 MiB; a 100-item page carrying issue bodies can exceed it.
const MAX_BUFFER = 64 * 1024 * 1024;
const PAGE_SIZE = 100;

const AUTH_REMEDY = "Run `gh auth login` or set GH_TOKEN.";
const NETWORK_SPAWN_CODES = new Set(["ETIMEDOUT", "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH"]);
const AUTH_STDERR = /gh auth login|HTTP 401|Bad credentials|not logged in/i;
const RATE_STDERR = /rate limit/i;
const NETWORK_STDERR = /error connecting to|could not resolve host|no such host|i\/o timeout|timed out|network is unreachable|connection refused|connection reset/i;

function assertFixedArgv(args) {
  const ok = Array.isArray(args)
    && args.length === FIXED_ARGV.length
    && args.every((arg, i) => arg === FIXED_ARGV[i]);
  if (!ok) throw githubError(CODES.GITHUB_TRANSPORT_INTERNAL, "GitHub transport refused a request whose argv is not the fixed `gh api graphql --input -`.");
}

function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, value: undefined };
  }
}

function toIsoOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function operationName(document) {
  const match = /^\s*(query|mutation)\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(document);
  return match ? match[2] : "request";
}

function parseScopes(message) {
  const list = /\[([^\]]*)\]/.exec(message);
  if (!list) return [];
  return list[1].split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
}

// The remedy grants the full `repo` / `project` scopes adev needs, not the narrower
// scope GitHub names: refreshing with `read:project` alone would leave writes failing.
// Scopes outside those families are passed through so the remedy still covers them.
function remedyScopes(reported) {
  const remedy = new Set();
  for (const scope of reported) {
    if (/project/.test(scope)) remedy.add("project");
    else if (scope === "repo" || scope === "public_repo" || scope.startsWith("repo:")) remedy.add("repo");
    else remedy.add(scope);
  }
  if (remedy.size === 0) return ["repo", "project"];
  const order = (s) => (s === "repo" ? 0 : s === "project" ? 1 : 2);
  return [...remedy].sort((a, b) => order(a) - order(b));
}

function rateLimited(detail, resetAt) {
  const when = resetAt ? ` Resets at ${resetAt}.` : "";
  return githubError(CODES.GITHUB_RATE_LIMITED, `GitHub API rate limit exceeded.${when} ${detail}`.trim(), { resetAt });
}

function fromGraphqlErrors(response, document) {
  const errors = response.errors;
  const byType = (type) => errors.find((e) => e && e.type === type);

  const scope = byType("INSUFFICIENT_SCOPES");
  if (scope) {
    const scopes = parseScopes(String(scope.message ?? ""));
    const named = scopes.length > 0 ? scopes.join(", ") : "unknown";
    return githubError(
      CODES.GITHUB_SCOPE_MISSING,
      `GitHub token is missing required scope(s): ${named}. GitHub: ${scope.message ?? ""} Remedy: run \`gh auth refresh -s ${remedyScopes(scopes).join(",")}\`.`,
      { scopes },
    );
  }

  const limited = byType("RATE_LIMITED");
  if (limited) {
    const resetAt = toIsoOrNull(response.data?.rateLimit?.resetAt ?? limited.extensions?.resetAt);
    return rateLimited(`GitHub: ${limited.message ?? ""}`, resetAt);
  }

  const forbidden = byType("FORBIDDEN");
  if (forbidden) {
    const operation = Array.isArray(forbidden.path) && forbidden.path.length > 0
      ? forbidden.path.join(".")
      : operationName(document);
    return githubError(CODES.GITHUB_PERMISSION_DENIED, `GitHub denied ${operation}: ${forbidden.message ?? ""}`, { operation });
  }

  const graphqlErrors = errors.map((e) => ({ type: e?.type ?? null, path: e?.path ?? null, message: redact(e?.message ?? "") }));
  const summary = graphqlErrors.map((e) => `${e.type ?? "ERROR"}: ${e.message}`).join("; ");
  return githubError(CODES.GITHUB_REQUEST_FAILED, `GitHub GraphQL request failed: ${summary}`, { graphqlErrors });
}

function fromResponseText(text, document) {
  const parsed = parseJson(text);
  if (!parsed.ok || parsed.value === null || typeof parsed.value !== "object") {
    // Raw output is never echoed: it may be an HTML proxy page or carry credentials.
    return { error: githubError(CODES.GITHUB_REQUEST_FAILED, "gh returned a response that is not a GraphQL JSON object.") };
  }
  const response = parsed.value;
  if (Array.isArray(response.errors) && response.errors.length > 0) {
    return { error: fromGraphqlErrors(response, document) };
  }
  if (response.data === undefined || response.data === null) {
    return { error: githubError(CODES.GITHUB_REQUEST_FAILED, "GitHub returned a GraphQL response without data.") };
  }
  return { data: response.data };
}

function fromSpawnFailure(err, document) {
  if (err?.code === "ENOBUFS") {
    // Partial stdout is discarded, never echoed: it is truncated board data.
    return githubError(CODES.GITHUB_REQUEST_FAILED, `gh output exceeded the ${MAX_BUFFER / (1024 * 1024)} MiB buffer; the response was discarded.`);
  }
  if (err?.code === "ENOENT") {
    return githubError(CODES.GITHUB_CLI_MISSING, "GitHub CLI `gh` was not found on PATH. Install it from https://cli.github.com and retry.");
  }
  if (NETWORK_SPAWN_CODES.has(err?.code)) {
    return githubError(CODES.GITHUB_UNREACHABLE, `GitHub is unreachable (${err.code}). Nothing was written locally or queued.`);
  }

  // `gh api graphql` exits non-zero on GraphQL errors and still prints the JSON body on stdout.
  const stdout = String(err?.stdout ?? "");
  if (stdout.trim() !== "") {
    const parsed = parseJson(stdout);
    if (parsed.ok && parsed.value && Array.isArray(parsed.value.errors) && parsed.value.errors.length > 0) {
      return fromGraphqlErrors(parsed.value, document);
    }
  }

  const stderr = String(err?.stderr ?? "").trim();
  if (AUTH_STDERR.test(stderr)) {
    return githubError(CODES.GITHUB_AUTH_REQUIRED, `GitHub CLI is not authenticated. ${AUTH_REMEDY} gh: ${stderr}`);
  }
  if (RATE_STDERR.test(stderr)) return rateLimited(`gh: ${stderr}`, null);
  if (NETWORK_STDERR.test(stderr)) {
    return githubError(CODES.GITHUB_UNREACHABLE, `GitHub is unreachable. Nothing was written locally or queued. gh: ${stderr}`);
  }
  const status = err?.status ?? "unknown";
  return githubError(CODES.GITHUB_REQUEST_FAILED, `gh exited with status ${status}${stderr ? `: ${stderr}` : "."}`);
}

/**
 * Create the GitHub GraphQL transport.
 *
 * @param {object} [options]
 * @param {Function} [options.exec] - `execFileSync`-compatible; injected in tests.
 * @param {object} [options.env] - base environment for `gh`; `GH_PROMPT_DISABLED` is always forced to "1".
 * @returns {{ request: (document: string, variables?: object) => object,
 *             paginate: (document: string, variables: object, opts: { connectionPath: string[] }) => unknown[] }}
 */
export function createTransport({ exec = execFileSync, env = process.env } = {}) {
  const secrets = [env.GH_TOKEN, env.GITHUB_TOKEN];

  // Re-issue an error with the env's literal token values scrubbed from its message
  // and extras; the pattern-based redaction alone misses tokens of unknown format.
  function scrubbed(err) {
    const { code, ...extra } = err;
    return githubError(code, err.message, extra, { secrets });
  }

  function request(document, variables = {}) {
    const args = [...FIXED_ARGV];
    assertFixedArgv(args);
    let stdout;
    try {
      stdout = exec("gh", args, {
        input: JSON.stringify({ query: document, variables }),
        encoding: "utf8",
        shell: false,
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
        env: { ...env, GH_PROMPT_DISABLED: "1" },
      });
    } catch (err) {
      throw scrubbed(fromSpawnFailure(err, document));
    }
    const { data, error } = fromResponseText(String(stdout ?? ""), document);
    if (error) throw scrubbed(error);
    return data;
  }

  /**
   * Read every node of one connection, following `pageInfo.endCursor` through
   * the `$after` variable. The document must declare `$after` and page the
   * connection with `first: 100` (PAGE_SIZE): the page bound below assumes that
   * size, so a smaller page would trip it on a legitimate read. Each call is one connection with its own bound —
   * `ceil(totalCount / 100) + 1` pages, the +1 absorbing items added mid-read —
   * and its own cursor set, since opaque cursors legitimately coincide across
   * different connections. Any violation throws; no partial array is returned.
   */
  function paginate(document, variables, { connectionPath }) {
    const where = connectionPath.join(".");
    const invalid = (reason) => githubError(CODES.GITHUB_PAGINATION_INVALID, `Pagination of ${where} is invalid: ${reason}.`);
    const nodes = [];
    const seen = new Set();
    let after;
    let pages = 0;

    for (;;) {
      const data = request(document, after === undefined ? { ...variables } : { ...variables, after });
      pages += 1;
      const connection = connectionPath.reduce((obj, key) => (obj == null ? undefined : obj[key]), data);
      if (!connection || typeof connection.totalCount !== "number" || !connection.pageInfo || !Array.isArray(connection.nodes)) {
        throw invalid("the response has no connection with totalCount, pageInfo and nodes at that path");
      }
      const bound = Math.ceil(connection.totalCount / PAGE_SIZE) + 1;
      if (pages > bound) throw invalid(`page ${pages} exceeds the bound of ${bound} for totalCount ${connection.totalCount}`);
      nodes.push(...connection.nodes);

      if (!connection.pageInfo.hasNextPage) return nodes;
      const cursor = connection.pageInfo.endCursor;
      if (typeof cursor !== "string" || cursor === "") throw invalid("hasNextPage is true but endCursor is missing");
      if (seen.has(cursor)) throw invalid("a cursor was repeated");
      seen.add(cursor);
      after = cursor;
    }
  }

  return { request, paginate };
}
