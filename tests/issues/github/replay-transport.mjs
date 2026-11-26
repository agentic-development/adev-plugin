/**
 * Replay stand-in for `execFileSync`, injected into `createTransport({ exec })`
 * so github adapter tests serve recorded GraphQL responses and never spawn `gh`.
 *
 * Each entry is `{ query, variables, response }` or `{ query, variables, error: { code, stderr } }`,
 * keyed by `sha256(query + "\0" + stableStringify(variables))`. A request with no
 * entry throws `UNRECORDED_GITHUB_REQUEST`, which the transport passes through unmapped.
 */

import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

const OPERATION_RE = /^\s*(query|mutation)\s+([A-Za-z_][A-Za-z0-9_]*)/;

function replayError(code, message) {
  return Object.assign(new Error(message), { code });
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function keyOf(query, variables) {
  return createHash("sha256").update(`${query}\0${stableStringify(variables ?? {})}`).digest("hex");
}

// Operation names are how tests count and identify requests, so a document
// without one is refused rather than recorded under a placeholder.
function operationOf(query) {
  const match = OPERATION_RE.exec(query);
  if (!match) {
    throw replayError("REPLAY_ANONYMOUS_DOCUMENT", `Replay refuses an anonymous GraphQL document; every document must be a named operation: ${query.slice(0, 60)}`);
  }
  return match[2];
}

function outcomeOf(entry) {
  return "error" in entry ? { error: entry.error } : { response: entry.response };
}

/**
 * @param {Array<{ query: string, variables?: object, response?: object, error?: { code?: string|null, stderr?: string } }>} fixtures
 * @returns {Function & { calls: Array<{ operation: string, query: string, variables: object }> }}
 */
export function replayExec(fixtures) {
  const recorded = new Map();
  for (const entry of fixtures) {
    const operation = operationOf(entry.query);
    const key = keyOf(entry.query, entry.variables);
    const outcome = outcomeOf(entry);
    const prior = recorded.get(key);
    if (prior && !isDeepStrictEqual(prior, outcome)) {
      throw replayError("REPLAY_AMBIGUOUS_FIXTURE", `Replay fixtures record two different outcomes for one ${operation} request.`);
    }
    recorded.set(key, outcome);
  }

  const calls = [];
  function exec(_cmd, _args, opts) {
    const { query, variables = {} } = JSON.parse(opts.input);
    const match = OPERATION_RE.exec(query);
    const operation = match ? match[2] : null;
    calls.push({ operation, query, variables });

    const outcome = recorded.get(keyOf(query, variables));
    if (!outcome) {
      throw replayError("UNRECORDED_GITHUB_REQUEST", `No recorded GitHub response for ${operation ?? "an anonymous document"} with variables ${stableStringify(variables)}.`);
    }
    if (outcome.error) {
      throw Object.assign(new Error(outcome.error.stderr || "gh failed"), {
        code: outcome.error.code ?? undefined,
        status: 1,
        stdout: "",
        stderr: outcome.error.stderr ?? "",
      });
    }
    return JSON.stringify(outcome.response);
  }
  exec.calls = calls;
  return exec;
}
