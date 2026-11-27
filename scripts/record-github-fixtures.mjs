#!/usr/bin/env node
/**
 * Manual recorder for the GitHub conformance fixtures. A maintainer runs it by
 * hand against a throwaway Projects v2 board; CI and agents never do. It runs
 * every shared contract case (tests/issues/conformance/contract-cases.mjs)
 * against a live GithubAdapter whose `exec` wraps the real `gh` spawn and logs
 * each request with its outcome, then writes one replay fixture per passing case.
 *
 * Safety contract:
 * - `--project` and `--repo` are required and both must be owned by the
 *   fixture organization, so a real organisation's board is refused
 *   before any request is sent; GH_TOKEN must be set, so the maintainer's own
 *   `gh` login is never used by accident.
 * - Every mutation whose `title` or `body` variable is non-empty must start with
 *   `adev-fixture:`; one that does not is refused before it reaches GitHub. The
 *   text is checked, not rewritten, because a replayed request must carry the
 *   exact variables that were recorded.
 * - Files are written only beneath tests/issues/conformance/fixtures/, with
 *   containment decided on real paths: the fixtures directory must resolve to
 *   exactly <real repo root>/tests/issues/conformance/fixtures, and each file must
 *   resolve strictly inside it. A file name with a path separator is refused. A
 *   case that fails deletes its fixture from any earlier run, so the directory
 *   never mixes fixtures recorded in two runs.
 * - Every string written is redacted of token patterns and of the literal
 *   GH_TOKEN / GITHUB_TOKEN values; a case whose request needed redaction is not
 *   written, since its replay could never match. A fixture that would fail the
 *   fixture lint (tokens, foreign logins, unprefixed titles or bodies) is not
 *   written either.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { GithubAdapter } from "../lib/issues/github-adapter.mjs";
import { redact } from "../lib/issues/github/errors.mjs";
import { isContained, lenientRealpath } from "../lib/path-safety.mjs";
import { CASES, FIXTURE_TEXT_PREFIX } from "../tests/issues/conformance/contract-cases.mjs";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const FIXTURES_REL = join("tests", "issues", "conformance", "fixtures");
// The board and repo must belong to a fixture-only organization, so a fine-grained
// token scoped to that organization is the only credential the recorder ever needs.
// The maintainer's login is accepted only as the authenticated actor (viewer, issue
// author) that recorded responses carry, never as the owner of what is touched.
export const FIXTURE_OWNERS = Object.freeze(["adev-fixtures"]);
export const FIXTURE_LOGINS = Object.freeze([...FIXTURE_OWNERS, "dpavancini"]);
// Claims stamp claimed_at from the adapter clock, and that stamp travels as a request
// variable, so the replaying runner must use this same instant; it is written into each fixture.
export const RECORDING_NOW_ISO = "2026-01-15T12:00:00.000Z";

const TOKEN_RE = /(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/;
const OWNER_VALUE_RE = /"(url|resourcePath|nameWithOwner)"\s*:\s*"([^"]*)"/g;
const PROJECT_URL = /^https:\/\/github\.com\/(?:orgs|users)\/([^/\s]+)\/projects\/[1-9][0-9]*$/;
const REPO = /^([^/\s]+)\/[^/\s]+$/;

export const USAGE = `Usage: GH_TOKEN=<fixture-org token> node scripts/record-github-fixtures.mjs --project <url> --repo <owner/repo>

Records the shared IssueManager contract cases against a live, throwaway GitHub
Projects v2 board and writes one replay fixture per passing case beneath
${FIXTURES_REL}/.

Required:
  --project <url>      https://github.com/(orgs|users)/<owner>/projects/<n>
  --repo <owner/repo>  the board's home repository

Both must be owned by the fixture organization (${FIXTURE_OWNERS.join(", ")}). The board must
already pass \`adev issues github setup --check\`, its title and every milestone
title must start with "${FIXTURE_TEXT_PREFIX}", and it must hold nothing but
recorder-created items. Created issues are left on the board.

Before committing any fixture, run the fixture lint and commit only if it passes:
  node --test tests/issues/github/fixture-lint.test.mjs
`;

function recorderError(code, message) {
  return Object.assign(new Error(message), { code });
}

/**
 * Parse and check the recorder's argv. Refuses (throws RECORDER_USAGE) unless both
 * `--project` and `--repo` are given and owned by the fixture organization.
 *
 * @param {string[]} argv
 * @returns {{ help: true } | { help: false, project: string, repo: string }}
 */
export function parseRecorderArgs(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: { project: { type: "string" }, repo: { type: "string" }, help: { type: "boolean", short: "h" } },
      strict: true,
      allowPositionals: false,
    }));
  } catch (err) {
    throw recorderError("RECORDER_USAGE", err.message);
  }
  if (values.help) return { help: true };
  const { project, repo } = values;
  if (!project || !repo) throw recorderError("RECORDER_USAGE", "Both --project and --repo are required; nothing was recorded.");
  const projectOwner = PROJECT_URL.exec(project)?.[1];
  if (!projectOwner) throw recorderError("RECORDER_USAGE", "--project must be https://github.com/(orgs|users)/<owner>/projects/<n>.");
  const repoOwner = REPO.exec(repo)?.[1];
  if (!repoOwner) throw recorderError("RECORDER_USAGE", "--repo must be <owner>/<repo>.");
  for (const [flag, owner] of [["--project", projectOwner], ["--repo", repoOwner]]) {
    if (!FIXTURE_OWNERS.includes(owner)) {
      throw recorderError("RECORDER_USAGE", `${flag} is owned by "${owner}", which is not the fixture organization (${FIXTURE_OWNERS.join(", ")}); refusing to touch it.`);
    }
  }
  return { help: false, project, repo };
}

/** The fixture file name for a case: its name as a lowercase hyphenated slug. */
export function fixtureFileName(caseName) {
  const slug = String(caseName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (slug === "") throw recorderError("RECORDER_INVALID_CASE", "A case name yields an empty fixture file name.");
  return `${slug}.json`;
}

/**
 * The real path a case's fixture is written to. Containment is decided on real
 * paths only: the fixtures directory must resolve to exactly
 * `<real repo root>/<FIXTURES_REL>` (no symlinked component on the way down), and
 * the file must resolve strictly inside it. Missing components are resolved
 * leniently, since neither the directory nor the file need exist yet. The real path
 * is returned so that what is checked is what is written. Refuses
 * (RECORDER_PATH_ESCAPE) a name that is empty, `.`, `..`, or carries a `/` or `\`.
 *
 * @param {string} repoRoot
 * @param {string} fileName
 * @returns {string}
 */
export function fixturePath(repoRoot, fileName) {
  const name = String(fileName);
  if (name === "" || name === "." || name === ".." || /[/\\\0]/.test(name)) {
    throw recorderError("RECORDER_PATH_ESCAPE", `Refusing to write ${fileName}: it is not beneath ${FIXTURES_REL}.`);
  }
  const expected = join(lenientRealpath(repoRoot), FIXTURES_REL);
  const realFixtures = lenientRealpath(join(resolve(repoRoot), FIXTURES_REL));
  const realFile = lenientRealpath(join(realFixtures, name));
  if (realFixtures !== expected || realFile === realFixtures || !isContained(realFile, realFixtures)) {
    throw recorderError("RECORDER_PATH_ESCAPE", `Refusing to write ${fileName}: a symlink takes it outside ${FIXTURES_REL}.`);
  }
  return realFile;
}

function* textVariables(value, path = []) {
  if (Array.isArray(value)) {
    for (const [i, v] of value.entries()) yield* textVariables(v, [...path, i]);
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if ((k === "title" || k === "body") && typeof v === "string") yield { path: [...path, k].join("."), value: v };
      else yield* textVariables(v, [...path, k]);
    }
  }
}

/**
 * Refuse (RECORDER_UNMARKED_TEXT) a mutation carrying a non-empty `title` or `body`
 * variable that does not start with the fixture prefix. Queries write nothing.
 */
export function assertFixtureText(query, variables) {
  if (!/^\s*mutation\b/.test(query)) return;
  for (const { path, value } of textVariables(variables)) {
    if (value !== "" && !value.startsWith(FIXTURE_TEXT_PREFIX)) {
      throw recorderError("RECORDER_UNMARKED_TEXT", `Refusing to send a mutation whose ${path} does not start with "${FIXTURE_TEXT_PREFIX}"; nothing was sent.`);
    }
  }
}

function parseJsonObject(text) {
  try {
    const value = JSON.parse(text);
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

// `gh api graphql` exits non-zero on GraphQL errors but still prints the body; replaying
// that body as a response maps through the transport exactly as the live failure did.
function failureOutcome(err) {
  const body = parseJsonObject(String(err?.stdout ?? ""));
  if (body && Array.isArray(body.errors) && body.errors.length > 0) return { response: body };
  return { error: { code: typeof err?.code === "string" ? err.code : null, stderr: String(err?.stderr ?? "") } };
}

/**
 * Wrap an `execFileSync`-compatible spawn so every request and its outcome is
 * appended to `log`, in order. The wrapped spawn is called unchanged, except that a
 * mutation refused by assertFixtureText never reaches it; that refusal, and a
 * response that cannot be replayed (not a JSON object), are noted in `problems`.
 *
 * @param {Function} realExec
 * @param {Array<object>} log
 * @param {string[]} problems
 * @returns {Function}
 */
export function recordingExec(realExec, log, problems) {
  return function exec(cmd, args, opts) {
    const { query, variables = {} } = JSON.parse(opts.input);
    try {
      assertFixtureText(query, variables);
    } catch (err) {
      // The transport would re-map this refusal to a generic gh failure, so it is also reported here.
      problems.push(err.message);
      throw err;
    }
    let stdout;
    try {
      stdout = realExec(cmd, args, opts);
    } catch (err) {
      log.push({ query, variables, outcome: failureOutcome(err) });
      throw err;
    }
    const response = parseJsonObject(String(stdout ?? ""));
    if (response === null) problems.push("gh returned a response that is not a JSON object");
    else log.push({ query, variables, outcome: { response } });
    return stdout;
  };
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Fold a request log into replayExec entries, in first-request order. A request
 * repeated with one outcome is a plain entry; one whose outcome changed between
 * repeats is a `sequence` holding every outcome in order.
 */
export function toReplayEntries(log) {
  const groups = new Map();
  for (const { query, variables, outcome } of log) {
    const key = `${query}\0${stableStringify(variables)}`;
    if (!groups.has(key)) groups.set(key, { query, variables, outcomes: [] });
    groups.get(key).outcomes.push(outcome);
  }
  return [...groups.values()].map(({ query, variables, outcomes }) => {
    const first = stableStringify(outcomes[0]);
    return outcomes.every((o) => stableStringify(o) === first)
      ? { query, variables, ...outcomes[0] }
      : { query, variables, sequence: outcomes };
  });
}

/** Redact every string in `value`, keys included, of token patterns and literal secrets. */
export function redactDeep(value, secrets = []) {
  if (typeof value === "string") return redact(value, secrets);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, secrets));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [redact(k, secrets), redactDeep(v, secrets)]));
  }
  return value;
}

function loginOwner(key, value) {
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

/**
 * The fixture-lint expectations, applied to serialized fixture text before it is
 * written. Returns one message per violation; messages name the offending key or
 * login, never a token.
 */
export function lintRecording(text) {
  const problems = [];
  if (TOKEN_RE.test(text)) problems.push("a token-shaped string remains after redaction");
  for (const [, login] of text.matchAll(/"login"\s*:\s*"([^"]+)"/g)) {
    if (!FIXTURE_LOGINS.includes(login)) problems.push(`login "${login}" is not a fixture account`);
  }
  for (const [, key, value] of text.matchAll(OWNER_VALUE_RE)) {
    const owner = loginOwner(key, value);
    if (owner !== null && !FIXTURE_OWNERS.includes(owner)) problems.push(`${key} is owned by "${owner}", not the fixture organization`);
  }
  for (const [, s] of text.matchAll(/"(?:title|body)"\s*:\s*"([^"]*)"/g)) {
    if (s !== "" && !s.startsWith(FIXTURE_TEXT_PREFIX)) problems.push(`a title or body does not start with "${FIXTURE_TEXT_PREFIX}"`);
  }
  return [...new Set(problems)];
}

/**
 * Build the serialized fixture for one case, or report why it must not be written.
 *
 * @returns {{ text: string } | { problems: string[] }}
 */
export function buildFixture({ caseName, manifest, now, log }, secrets = []) {
  const requests = toReplayEntries(log);
  const redacted = redactDeep(requests, secrets);
  const leaked = requests.some((r, i) => stableStringify([r.query, r.variables]) !== stableStringify([redacted[i].query, redacted[i].variables]));
  if (leaked) return { problems: ["a request carried a token-shaped value or a literal secret; its replay could never match"] };
  const doc = redactDeep({ case: caseName, recorded_with: { manifest, now }, requests: redacted }, secrets);
  const text = `${JSON.stringify(doc, null, 2)}\n`;
  const problems = lintRecording(text);
  return problems.length > 0 ? { problems } : { text };
}

function recordingManifest({ project, repo }) {
  return { tasks: { backend: "github", claim_ttl_minutes: 240, github: { project, repo } } };
}

/**
 * Delete the fixture a case left from an earlier run, so a failed case can never
 * leave a stale fixture beside ones recorded now. The path goes through fixturePath(),
 * so nothing outside the fixtures directory is touched.
 *
 * @param {string} repoRoot
 * @param {string} fileName
 * @returns {boolean} whether a stale fixture was removed
 */
export function removeStaleFixture(repoRoot, fileName) {
  const file = fixturePath(repoRoot, fileName);
  if (!existsSync(file)) return false;
  rmSync(file, { force: true });
  return true;
}

/** The first fixture file name two cases share, or null when every name is distinct. */
export function duplicateFixtureName(cases) {
  const names = cases.map((c) => fixtureFileName(c.name));
  return names.find((n, i) => names.indexOf(n) !== i) ?? null;
}

async function recordCase({ name, run }, manifest, secrets, { spawn, env }) {
  const log = [];
  const problems = [];
  const storage = mkdtempSync(join(tmpdir(), "adev-fixture-"));
  try {
    const manager = new GithubAdapter(storage, manifest, {
      exec: recordingExec(spawn, log, problems),
      env,
      now: () => Date.parse(RECORDING_NOW_ISO),
    });
    await run(manager);
  } catch (err) {
    return { problems: [...problems, `case failed live: ${redact(err?.code ?? "", secrets)} ${redact(err?.message ?? String(err), secrets)}`.trim()] };
  } finally {
    rmSync(storage, { recursive: true, force: true });
  }
  if (problems.length > 0) return { problems };
  return buildFixture({ caseName: name, manifest, now: RECORDING_NOW_ISO, log }, secrets);
}

/**
 * @param {string[]} argv
 * @param {NodeJS.ProcessEnv} env - the environment `gh` runs with and the secrets redacted
 * @param {{ spawn?: Function, cases?: ReadonlyArray<{ name: string, run: Function }>, repoRoot?: string }} [options]
 *   test seams; the CLI uses the real `execFileSync`, the shared CASES and this repo.
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv, env, { spawn = execFileSync, cases = CASES, repoRoot = REPO_ROOT } = {}) {
  let args;
  try {
    args = parseRecorderArgs(argv);
  } catch (err) {
    console.error(`${err.message}\n\n${USAGE}`);
    return 1;
  }
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  if (!env.GH_TOKEN) {
    console.error(`GH_TOKEN is not set; record with a fine-grained token scoped to the fixture organization, never your own gh login.\n\n${USAGE}`);
    return 1;
  }

  const duplicate = duplicateFixtureName(cases);
  if (duplicate) {
    console.error(`Two contract cases share the fixture file ${duplicate}; rename one. Nothing was recorded.`);
    return 1;
  }

  const names = cases.map((c) => fixtureFileName(c.name));
  const paths = names.map((n) => fixturePath(repoRoot, n));
  mkdirSync(dirname(paths[0]), { recursive: true });
  const manifest = recordingManifest(args);
  const secrets = [env.GH_TOKEN, env.GITHUB_TOKEN];
  let failed = 0;

  for (const [i, testCase] of cases.entries()) {
    const result = await recordCase(testCase, manifest, secrets, { spawn, env });
    if (result.problems) {
      failed += 1;
      const stale = removeStaleFixture(repoRoot, names[i]);
      console.error(`NOT WRITTEN  ${testCase.name}\n  ${result.problems.join("\n  ")}`);
      if (stale) console.error(`  removed the earlier ${join(FIXTURES_REL, names[i])} so fixtures from two runs are never mixed`);
      continue;
    }
    writeFileSync(fixturePath(repoRoot, names[i]), result.text);
    console.log(`recorded     ${join(FIXTURES_REL, names[i])}`);
  }

  console.log(`\n${cases.length - failed} of ${cases.length} cases recorded.`);
  console.log("Run `node --test tests/issues/github/fixture-lint.test.mjs` and commit the fixtures only if it passes.");
  return failed === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2), process.env);
}
