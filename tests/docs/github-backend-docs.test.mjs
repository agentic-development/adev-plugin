import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT, createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";
import { SUPPORTED_BACKENDS } from "../../lib/issues/registry.mjs";
import { normalizeGithubConfig } from "../../lib/issues/github/config.mjs";
import { sentinelPath } from "../../lib/issues/read-only-sentinel.mjs";
import { FileAdapter } from "../../lib/issues/file-adapter.mjs";
import { GithubAdapter } from "../../lib/issues/github-adapter.mjs";
import { ALLOWED_LOGINS, FIXTURES_REL } from "../../scripts/record-github-fixtures.mjs";
import { FIXTURE_TEXT_PREFIX } from "../issues/conformance/contract-cases.mjs";

const read = (rel) => readFileSync(join(PLUGIN_ROOT, rel), "utf8");

const GITHUB_SPEC = ".context-index/specs/features/task-management/github-board-backend.spec.md";
const MIGRATE_SPEC = ".context-index/specs/features/task-management/backend-migration-rev-3-github-target.spec.md";

// Codes the migration amendment, the transport, the setup verb and the replay helper
// raise that the GitHub spec's own Error Cases table does not carry. Docs-only
// additions, not a spec amendment.
const EXTRA_CODES = [
  // GitHub spec, also in its rev 6 Error Cases table (listed so a stale table cannot drop them)
  "GITHUB_SUBISSUE_CYCLE", "SENTINEL_PATH_UNSAFE", "MIGRATE_SENTINEL_COMMIT_FAILED", "MIGRATE_UNANCHORED_ITEM",
  "GITHUB_AMBIGUOUS_LEGACY_ID", "MIGRATE_CONFIRMATION_REQUIRED",
  // backend-migration-rev-3-github-target.spec.md (Error Cases delta)
  "MIGRATE_RESUME_MISMATCH", "MIGRATE_RESUME_INVALID", "MIGRATE_TARGET_FOREIGN_LEGACY_ID",
  "MIGRATE_SENTINEL_PROJECT_MISMATCH", "MIGRATE_PARTIAL_FAILURE", "MIGRATE_UNKNOWN_BACKEND",
  // Still raised for `--from github`: github as a migration source is not supported.
  "MIGRATE_GITHUB_UNAVAILABLE",
  // The github migration's errors[] fallback for an error that carries no code.
  "MIGRATE_WRITE_FAILED",
  // Base migrate verb codes, reachable on a `--to github` run before dispatch or while reading the source.
  "MIGRATE_ARG_PARSE", "MIGRATE_MISSING_TARGET", "MIGRATE_TARGET_READONLY", "MIGRATE_NOOP",
  "MIGRATE_SOURCE_INVALID", "BEADS_NOT_AVAILABLE", "BEADS_PROBE_FAILED",
  // `adev issues github setup`: an interactive write set answered with anything but yes.
  // Absent from the GitHub spec's Error Cases table.
  "SETUP_CANCELLED",
  // Shared IssueManager refusals the github adapter raises from operator input
  // (`--id` on create, an empty `--title`, a dependency cycle).
  "VALIDATION", "MISSING_REQUIRED_FIELD", "CIRCULAR_DEPENDENCY",
  // transport (Task 4)
  "GITHUB_REQUEST_FAILED", "GITHUB_TRANSPORT_INTERNAL",
];

// Codes raised only by the replay helper and the fixture recorder: they never reach an
// operator running adev, so they are documented under "Test fixtures", not as runtime errors.
const TEST_FIXTURE_CODES = [
  "REPLAY_ANONYMOUS_DOCUMENT", "REPLAY_AMBIGUOUS_FIXTURE", "REPLAY_INVALID_FIXTURE", "UNRECORDED_GITHUB_REQUEST",
  "RECORDER_USAGE", "RECORDER_INVALID_CASE", "RECORDER_PATH_ESCAPE", "RECORDER_UNMARKED_TEXT",
];

// Quoted UPPER_SNAKE literals the source sweep finds that are not adev error codes.
const NOT_ERROR_CODES = {
  GH_PROMPT_DISABLED: "environment variable the transport sets for every gh spawn",
  GIT_DIR: "inherited git environment override the sentinel commit strips",
  GIT_WORK_TREE: "inherited git environment override the sentinel commit strips",
  GIT_INDEX_FILE: "inherited git environment override the sentinel commit strips",
  GIT_COMMON_DIR: "inherited git environment override the sentinel commit strips",
  SINGLE_SELECT: "GitHub ProjectV2 field dataType, compared against GraphQL responses",
  EAI_AGAIN: "Node DNS errno the transport maps to GITHUB_UNREACHABLE",
  INSUFFICIENT_SCOPES: "GitHub GraphQL error type the transport maps to GITHUB_SCOPE_MISSING",
  RATE_LIMITED: "GitHub GraphQL error type the transport maps to GITHUB_RATE_LIMITED",
};

// Programmer-error codes no operator can trigger through a CLI verb.
const INTERNAL_CODES = {
  INVALID_NOTES: "notes must be a string; every CLI verb passes argv text, so only a library caller can pass a non-string",
  MISSING_OWNER: "`adev issues claim` / `release` refuse an empty owner before the adapter is called",
  INVALID_OWNER: "normalizeOwner() raises it only for a non-string owner; `--owner` and ADEV_ISSUE_OWNER are always strings",
  INVALID_BACKEND: "sentinel path lookup for a backend with no sentinel; callers pass only json, beads or file",
  INVALID_SENTINEL_PROJECT: "writeSentinel without a project URL; the migration always passes the preflighted tasks.github.project",
};

const SCANNED_SOURCES = [
  ...readdirSync(join(PLUGIN_ROOT, "lib/issues/github")).filter((f) => f.endsWith(".mjs")).map((f) => `lib/issues/github/${f}`),
  "lib/issues/github-adapter.mjs",
  "lib/issues/read-only-sentinel.mjs",
  "lib/cli/issues-github.mjs",
  "lib/cli/issues-migrate.mjs",
  "scripts/record-github-fixtures.mjs",
  "tests/issues/github/replay-transport.mjs",
];

// A quoted UPPER_SNAKE literal ("CODE") or a quoted message prefix ("CODE: ..."), plus
// single-word codes at a raise site: an error constructor's first argument, or `code: "X"` /
// `.code = "X"`. CODES.X references resolve to GITHUB_ERROR_CODES literals, caught by the first.
const LITERAL_RE = /["'`]([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)(?=["'`]|: )/g;
const RAISE_RE = /\b(?:codedError|githubError|mkErr|stop|fail|recorderError)\(\s*["'`]([A-Z][A-Z0-9_]*)["'`]|\bcode\s*[:=]\s*["'`]([A-Z][A-Z0-9_]*)["'`]/g;

function scanSourceCodes() {
  const found = new Map();
  for (const rel of SCANNED_SOURCES) {
    const text = read(rel);
    for (const re of [LITERAL_RE, RAISE_RE]) {
      for (const m of text.matchAll(re)) {
        const code = m[1] ?? m[2];
        if (!found.has(code)) found.set(code, new Set());
        found.get(code).add(rel);
      }
    }
  }
  return found;
}

function section(doc, headingRe) {
  const lines = doc.split("\n");
  const start = lines.findIndex((l) => headingRe.test(l));
  if (start === -1) return null;
  const level = /^#+/.exec(lines[start])[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const h = /^(#+) /.exec(lines[i]);
    if (h && h[1].length <= level) { end = i; break; }
  }
  return lines.slice(start, end).join("\n");
}

function tableRows(text) {
  return text.split("\n")
    .filter((l) => /^\|/.test(l.trim()) && !/^\|[\s|:-]+\|$/.test(l.trim()))
    .map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
}

function specErrorCodes() {
  const rows = tableRows(section(read(GITHUB_SPEC), /^## Error Cases/)).slice(1);
  return rows.map((cells) => [...(cells[2] ?? "").matchAll(/`([A-Z][A-Z0-9_]+)`/g)].map((m) => m[1]));
}

function amendmentErrorCodes() {
  const rows = tableRows(section(read(MIGRATE_SPEC), /^### Error Cases \(delta\)/)).slice(1);
  return rows.map((cells) => /^`([A-Z][A-Z0-9_]+)`/.exec(cells[1] ?? "")?.[1]).filter(Boolean);
}

function beh2Keys() {
  const beh2 = read(GITHUB_SPEC).split("\n").find((l) => l.startsWith("- **BEH-2**"));
  return [...beh2.matchAll(/(?:if: |; )(?:a )?`([a-z_]+)`/g)].map((m) => m[1]);
}

function codeConfigKeys() {
  const valid = { project: "https://github.com/orgs/o/projects/1", repo: "o/r" };
  try {
    normalizeGithubConfig({ ...valid, not_a_key: true });
  } catch (err) {
    return /expected one of (.+)$/.exec(err.message)[1].split(", ");
  }
  throw new Error("normalizeGithubConfig accepted an unknown key");
}

function cli(args, cwd) {
  const env = { ...process.env };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  const r = spawnSync("node", [join(PLUGIN_ROOT, "cli", "index.mjs"), ...args], { cwd, env, encoding: "utf8", timeout: 30_000 });
  return { exitCode: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function troubleshooting() {
  const doc = read("docs/troubleshooting.md");
  const fixtures = section(doc, /^## Test fixtures\s*$/);
  const operator = fixtures === null ? doc : doc.replace(fixtures, "");
  return { doc, fixtures, operator };
}

function codeRows(text, code) {
  return tableRows(text).filter((cells) => cells[0] === `\`${code}\``);
}

function operatorCodes() {
  const codes = new Set([...specErrorCodes().flat(), ...amendmentErrorCodes(), ...EXTRA_CODES]);
  for (const code of scanSourceCodes().keys()) {
    if (!(code in NOT_ERROR_CODES) && !(code in INTERNAL_CODES) && !TEST_FIXTURE_CODES.includes(code)) codes.add(code);
  }
  return [...codes].sort();
}

// ---------------------------------------------------------------------------
// The predicates the coverage claim rests on
// ---------------------------------------------------------------------------

test("every row of the GitHub spec's Error Cases table yields exactly one code", () => {
  const rows = specErrorCodes();
  assert.ok(rows.length >= 30, `parsed only ${rows.length} rows`);
  for (const [i, codes] of rows.entries()) assert.equal(codes.length, 1, `Error Cases row ${i + 1} yields ${JSON.stringify(codes)}`);
  assert.ok(rows.flat().includes("GITHUB_INVALID_CONFIG"));
  assert.ok(rows.flat().includes("BOARD_READ_ONLY_MIGRATED"));
});

test("BEH-2's key list is exactly the key set the config validator accepts", () => {
  assert.deepEqual([...beh2Keys()].sort(), [...codeConfigKeys()].sort());
});

test("the migration amendment's Error Cases delta yields its codes", () => {
  const codes = amendmentErrorCodes();
  for (const code of ["MIGRATE_UNKNOWN_BACKEND", "MIGRATE_GITHUB_UNAVAILABLE", "MIGRATE_CONFIRMATION_REQUIRED", "MIGRATE_PARTIAL_FAILURE"]) {
    assert.ok(codes.includes(code), `${code} not parsed from the amendment table`);
  }
});

test("every code literal in the github sources is declared: spec tables, EXTRA_CODES, test-fixture codes or an allowlist", () => {
  const declared = new Set([
    ...specErrorCodes().flat(), ...amendmentErrorCodes(), ...EXTRA_CODES, ...TEST_FIXTURE_CODES,
    ...Object.keys(NOT_ERROR_CODES), ...Object.keys(INTERNAL_CODES),
  ]);
  const undeclared = [...scanSourceCodes()].filter(([code]) => !declared.has(code)).map(([code, files]) => `${code} (${[...files].join(", ")})`);
  assert.deepEqual(undeclared, [], "add each to EXTRA_CODES (and troubleshooting.md), TEST_FIXTURE_CODES, or an allowlist with a reason");
});

test("every allowlisted and test-fixture code still occurs in the scanned sources", () => {
  const found = scanSourceCodes();
  const stale = [...Object.keys(NOT_ERROR_CODES), ...Object.keys(INTERNAL_CODES), ...TEST_FIXTURE_CODES].filter((c) => !found.has(c));
  assert.deepEqual(stale, []);
});

test("no allowlisted code is also declared operator-facing", () => {
  const overlap = [...Object.keys(NOT_ERROR_CODES), ...Object.keys(INTERNAL_CODES)].filter((c) => EXTRA_CODES.includes(c) || TEST_FIXTURE_CODES.includes(c) || specErrorCodes().flat().includes(c));
  assert.deepEqual(overlap, []);
});

// ---------------------------------------------------------------------------
// docs/troubleshooting.md
// ---------------------------------------------------------------------------

test("troubleshooting.md has one table row with a meaning and a remedy for every operator-facing code, outside Test fixtures", () => {
  const { operator } = troubleshooting();
  const missing = [];
  for (const code of operatorCodes()) {
    const rows = codeRows(operator, code);
    if (rows.length !== 1) { missing.push(`${code} (${rows.length} rows)`); continue; }
    const rest = rows[0].slice(1);
    const remedy = rest[rest.length - 1] ?? "";
    if (rest.length < 2 || rest.some((c) => c === "") || remedy.split(/\s+/).length < 3) missing.push(`${code} (no meaning/remedy cells)`);
  }
  assert.deepEqual(missing, []);
});

test("test-fixture codes are documented only under a Test fixtures heading marked non-runtime", () => {
  const { fixtures, operator } = troubleshooting();
  assert.notEqual(fixtures, null, "docs/troubleshooting.md has no `## Test fixtures` section");
  assert.match(fixtures, /\bnon-runtime\b|\bnot runtime errors\b|\bnever (?:raised|emitted) at runtime\b/i);
  const missing = TEST_FIXTURE_CODES.filter((code) => codeRows(fixtures, code).length !== 1);
  assert.deepEqual(missing, []);
  const leaked = TEST_FIXTURE_CODES.filter((code) => operator.includes(code));
  assert.deepEqual(leaked, [], "test-fixture codes must not appear among runtime errors");
});

test("troubleshooting.md documents the unanchored-item record and the two MIGRATE_UNANCHORED_ITEM remedies", () => {
  const { operator } = troubleshooting();
  assert.match(operator, /\.context-index\/tasks\/\.migrate-unanchored\.json/);
  // The path itself contains dots, so the window is bounded by length rather than by sentence.
  assert.match(operator, /(?:never|do not|don't) delete [^\n]{0,80}\.migrate-unanchored\.json/i);
  const row = codeRows(operator, "MIGRATE_UNANCHORED_ITEM")[0]?.join(" | ") ?? "";
  assert.match(row, /`Legacy ID`/, "remedy 1: set Legacy ID by hand");
  assert.match(row, /close[^|]*delete[^|]*\.migrate-unanchored\.json/i, "remedy 2: close the issue and delete the record");
});

test("troubleshooting.md documents the sanctioned BOARD_READ_ONLY_MIGRATED unlock", () => {
  const { operator } = troubleshooting();
  const root = "/r";
  for (const backend of ["json", "beads"]) {
    const rel = sentinelPath(root, backend).slice(root.length + 1);
    assert.ok(operator.includes(rel), `sentinel path ${rel} not named`);
  }
  assert.match(operator, /abandon/i, "delete the sentinel only after confirming the migration is abandoned");
  assert.match(operator, /malformed sentinel[^.\n]*(?:still )?blocks|malformed[^.\n]*sentinel[^.\n]*still/i);
  assert.match(operator, /commit[^.\n]*delet[^.\n]*`beads-board`|delet[^.\n]*commit[^.\n]*`beads-board`/i);
});

test("troubleshooting.md says MIGRATE_GITHUB_UNAVAILABLE means github is not supported as a migration source", () => {
  const row = codeRows(troubleshooting().operator, "MIGRATE_GITHUB_UNAVAILABLE")[0]?.join(" | ") ?? "";
  assert.match(row, /source/i);
  assert.match(row, /not supported/i);
});

// ---------------------------------------------------------------------------
// docs/configuration.md
// ---------------------------------------------------------------------------

test("configuration.md documents every tasks.github key with its default", () => {
  const doc = read("docs/configuration.md");
  const block = section(doc, /^#{3,5} .*`tasks\.github`/);
  assert.notEqual(block, null, "no heading naming `tasks.github`");
  const rows = Object.fromEntries(tableRows(block).map((cells) => [cells[0], cells.join(" | ")]));
  const missing = beh2Keys().filter((k) => !rows[`\`${k}\``]);
  assert.deepEqual(missing, []);

  const defaults = normalizeGithubConfig({ project: "https://github.com/orgs/o/projects/1", repo: "o/r" });
  assert.match(rows["`project`"], /required/i);
  assert.match(rows["`repo`"], /required/i);
  // A configured priority_field must be a number field (preflight and setup require NUMBER); P0–P4 applies only to the unset default.
  assert.match(rows["`priority_field`"], /\*\*number\*\*|number field/i);
  assert.match(rows["`priority_field`"], /GITHUB_FIELD_MISSING/);
  assert.match(rows["`priority_field`"], /When unset[^|]*`Priority`[^|]*`P0`–`P4`/);
  assert.ok(rows["`status_field`"].includes(defaults.status_field));
  assert.ok(rows["`type_source`"].includes(defaults.type_source));
  for (const v of ["auto", "issue_types", "labels"]) assert.ok(rows["`type_source`"].includes(`\`${v}\``), `type_source value ${v}`);
  assert.ok(rows["`claim_settle_ms`"].includes(String(defaults.claim_settle_ms)));
  assert.match(rows["`claim_settle_ms`"], /0[^|]*10000/);
  for (const [status, options] of Object.entries(defaults.status_map)) {
    assert.ok(block.includes(status), `status_map default names ${status}`);
    for (const option of options) assert.ok(block.includes(option), `status_map default option ${option}`);
  }
  for (const name of Object.values(defaults.fieldNames)) assert.ok(block.includes(name), `fields default name ${name}`);
});

test("configuration.md's tasks.backend row lists every SUPPORTED_BACKENDS value", () => {
  const row = tableRows(read("docs/configuration.md")).find((cells) => cells[0] === "`backend`");
  for (const b of SUPPORTED_BACKENDS) assert.ok(row.join("|").includes(`\`${b}\``), `backend ${b}`);
});

// ---------------------------------------------------------------------------
// docs/cli-reference.md
// ---------------------------------------------------------------------------

function migrateSection() {
  return section(read("docs/cli-reference.md"), /^#{3,4} `(?:adev )?issues migrate`/);
}

test("cli-reference documents `issues migrate --yes` with the verb's own help text", () => {
  const dir = createTempDir();
  try {
    const help = cli(["issues", "migrate", "--help"], dir);
    assert.equal(help.exitCode, 0);
    const yes = /^\s*--yes\s+(.+)$/m.exec(help.stdout)?.[1];
    assert.equal(yes, "Confirm a github migration's write set without prompting.");
    const doc = migrateSection();
    assert.notEqual(doc, null, "no `issues migrate` heading in docs/cli-reference.md");
    assert.ok(doc.includes("--yes"));
    assert.ok(doc.includes(yes), "the --yes description differs from `adev issues migrate --help`");
  } finally {
    cleanupTempDir(dir);
  }
});

test("cli-reference documents MIGRATE_UNKNOWN_BACKEND with the SUPPORTED_BACKENDS list the verb prints", () => {
  const dir = createTempDir();
  try {
    const r = cli(["issues", "migrate", "--to", "not-a-backend"], dir);
    assert.equal(r.exitCode, 1);
    const listed = /Supported: (.+)$/m.exec(r.stderr)?.[1];
    assert.equal(listed, SUPPORTED_BACKENDS.join(", "));
    assert.ok(SUPPORTED_BACKENDS.includes("github"));
    const doc = migrateSection() ?? "";
    assert.ok(doc.includes("MIGRATE_UNKNOWN_BACKEND"));
    assert.ok(doc.includes(listed), `the documented list is not "${listed}"`);
  } finally {
    cleanupTempDir(dir);
  }
});

test("cli-reference documents the github MIGRATE_PARTIAL_FAILURE errors[] entry shape, optional keys included", () => {
  const doc = migrateSection() ?? "";
  assert.ok(doc.includes("MIGRATE_PARTIAL_FAILURE"));
  assert.match(doc, /\{ ?source_id, code, message ?\}/);
  const optional = [...read("lib/issues/github/migrate.mjs").matchAll(/\bentry\.([a-z_]+)\s*=/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(optional)].sort(), ["reset_at", "target_id", "unwritten_fields"]);
  for (const key of optional) assert.ok(doc.includes(`\`${key}\``), `optional errors[] key ${key}`);
});

test("only the file backend lacks claim/release, so only it yields CLAIM_UNSUPPORTED_BACKEND", () => {
  assert.equal(typeof GithubAdapter.prototype.claim, "function");
  assert.equal(typeof GithubAdapter.prototype.release, "function");
  assert.equal(typeof FileAdapter.prototype.claim, "undefined");
  const dir = createTempDir();
  try {
    writeFixture(dir, ".context-index/manifest.yaml", "tasks:\n  backend: file\n");
    const r = cli(["issues", "claim", "issue-1", "--owner", "a"], dir);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /^CLAIM_UNSUPPORTED_BACKEND: the "file" backend/m);
  } finally {
    cleanupTempDir(dir);
  }
});

test("cli-reference never says github lacks claim, and ties CLAIM_UNSUPPORTED_BACKEND to the file backend", () => {
  const doc = read("docs/cli-reference.md");
  const matrix = section(doc, /^#### Backend capability matrix/);
  const [header, ...rows] = tableRows(matrix);
  const gh = header.indexOf("`github`");
  const file = header.findIndex((c) => c.startsWith("`file`"));
  assert.notEqual(gh, -1, "capability matrix has no `github` column");
  const claimRow = rows.find((cells) => cells[0] === "`claim` / `release`");
  assert.doesNotMatch(claimRow[gh], /CLAIM_UNSUPPORTED_BACKEND|❌/);
  assert.match(claimRow[gh], /re-read/i);
  assert.match(claimRow[gh], /claim_settle_ms/);
  assert.match(claimRow[file], /CLAIM_UNSUPPORTED_BACKEND/);

  const loose = doc.split("\n")
    .filter((l) => l.includes("CLAIM_UNSUPPORTED_BACKEND") && !l.trim().startsWith("| `claim` / `release`"))
    .filter((l) => !/`file`|\bfile backend\b/.test(l));
  assert.deepEqual(loose, [], "each CLAIM_UNSUPPORTED_BACKEND mention must name the file backend");
  // "not atomic" is a true statement about the github claim (write-and-re-read), so only "unsupported" is refused.
  assert.doesNotMatch(doc, /github[^.\n]*(?:no|not|un)[- ]?support[^.\n]*claim|claim[^.\n]*not supported[^.\n]*github/i);
});

// ---------------------------------------------------------------------------
// docs/concepts.md
// ---------------------------------------------------------------------------

test("concepts.md documents the github backend differences, claim window and trust model", () => {
  const doc = read("docs/concepts.md");
  for (const b of SUPPORTED_BACKENDS) assert.ok(doc.includes(`\`${b}\``), `backend comparison names ${b}`);
  assert.match(doc, /claim_settle_ms/);
  assert.match(doc, /claim window/i);
  assert.match(doc, /rollback[- ]by[- ]abstention/i);
  assert.match(doc, /`claimed_at`[^.\n]*overwrit|overwrit[^.\n]*`claimed_at`/i, "a loser's claimed_at overwrite (CON-4)");
  assert.match(doc, /strict lock/i);
  assert.match(doc, /project write/i);
  assert.match(doc, /triage/i);
  assert.match(doc, /title and body/i);
  assert.match(doc, /ADR[- ]0016/);
  assert.match(doc, /system of record/i);
  assert.match(doc, /`Legacy ID`[^.\n]*first/i);
  assert.match(doc, /residual window/i);
});

// ---------------------------------------------------------------------------
// Fixture recording (contributors)
// ---------------------------------------------------------------------------

test("the Test fixtures section documents the recorder's setup, derived from the recorder itself", () => {
  const { fixtures } = troubleshooting();
  assert.notEqual(fixtures, null);
  for (const login of ALLOWED_LOGINS) assert.ok(fixtures.includes(`\`${login}\``), `allowlisted owner ${login}`);
  assert.match(fixtures, /`GH_TOKEN`/);
  assert.match(fixtures, /fixture account/i);
  assert.match(fixtures, /never[^.\n]*own `?gh`? login/i);
  assert.match(fixtures, /`repo`[^.\n]*`project`[^.\n]*scopes? only|only[^.\n]*`repo`[^.\n]*`project`[^.\n]*scopes?/i);
  assert.doesNotMatch(fixtures, /gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/, "no token value");
  assert.ok(fixtures.includes(`\`${FIXTURE_TEXT_PREFIX}\``), "title prefix");
  assert.ok(fixtures.includes(FIXTURES_REL.split("\\").join("/")), "fixture output directory");

  const setup = fixtures.indexOf("adev issues github setup --yes");
  const check = fixtures.indexOf("adev issues github setup --check");
  const record = fixtures.indexOf("node scripts/record-github-fixtures.mjs --project");
  const lint = fixtures.indexOf("node --test tests/issues/github/fixture-lint.test.mjs");
  assert.ok(setup !== -1 && check !== -1 && record !== -1 && lint !== -1, `setup=${setup} check=${check} record=${record} lint=${lint}`);
  assert.ok(setup < check && check < record && record < lint, "order: setup --yes, setup --check, record, lint");
});

test("docs/README.md routes maintainers to the fixture-recording section", () => {
  const maintainers = section(read("docs/README.md"), /^## Maintainers/);
  assert.match(maintainers, /\(troubleshooting\.md#test-fixtures\)/);
});
