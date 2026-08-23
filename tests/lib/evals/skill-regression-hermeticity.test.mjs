/**
 * Hermeticity guard for the committed skill-regression fixture.
 *
 * The fixture is a mini-project at `tests/evals/skill-regression/`. It is test
 * DATA for an opt-in eval bucket (`npm run test:evals`), but THIS file lives
 * under `tests/lib/**`, which `scripts/run-tests.mjs` puts in the DEFAULT
 * bucket. That asymmetry is deliberate: the guard runs on every `npm test`
 * even though the fixture it guards does not.
 *
 * Numbered tests carry the spec's Hermeticity Rules row numbers — keep them
 * stable so a reader can map a test to a spec row without a translation table.
 *
 *   present: 1, 2, 3, 4 (Task 1), 5, 7 (Task 2), 6, 9 (Task 3),
 *            10, 11 (Task 8)
 *   pending: none — all eleven Hermeticity Rules rows are covered.
 *
 * The convention held while rows were outstanding: a pending property was
 * deliberately ABSENT rather than stubbed, because a stubbed property reads as
 * covered. Keep that rule if the spec ever grows a twelfth row.
 *
 * Not every test is a numbered property. Task 2 added five unnumbered ones
 * covering the config layer — banned governance keys, banned governance files,
 * `prompt:` shape and loader-resolved containment, the materialization marker,
 * and minimum enabled checks. They are acceptance criteria that constrain the
 * same tree without occupying a Hermeticity Rules row.
 *
 * Extension contract for later tasks: open a banner-documented helper block
 * immediately before the tests that use it (Task 2's begins partway down the
 * file), add tests below it, and keep zero cross-test state. Do not grow the
 * shared header block — helpers that only one task's tests need belong beside
 * those tests.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  PLUGIN_ROOT,
  cleanupTempDir,
  createTempDir,
  createTempGitRepo,
  writeFixture,
} from "../../helpers.mjs";
import { parseYaml } from "../../../lib/profiles/yaml.mjs";
import { resolveStorageRoot } from "../../../lib/issues/resolve-root.mjs";
import { resolveMainRoot } from "../../../lib/worktree.mjs";
import { globToRegExp } from "../../../lib/hygiene/test-debt.mjs";
import { isContained, lenientRealpath } from "../../../lib/path-safety.mjs";
import { loadDeployConfig } from "../../../lib/deploy.mjs";
import { loadValidateConfig } from "../../../lib/governance/validate-config.mjs";
import { loadReviewConfig } from "../../../lib/governance/review-config.mjs";
import { MARKED_REGISTRIES, readMarker } from "../../../lib/governance/registry-marker.mjs";
import { CHARTER_KINDS, SPEC_KINDS } from "../../../lib/kinds.mjs";
import { run } from "../../../lib/repomap/index.mjs";

/** Repo-relative POSIX path of the fixture root — the string form globs match against. */
const FIXTURE_REL = "tests/evals/skill-regression";
/** Absolute path to the fixture root. */
const FIXTURE = join(PLUGIN_ROOT, "tests/evals/skill-regression");
/** Absolute path to the fixture's inner mini-project. */
const PROJECT = join(FIXTURE, "project");

/**
 * Every entry under the fixture, depth-first, WITHOUT following symlinks.
 *
 * Recursion is gated on `dirent.isDirectory()`, which is false for a symlink
 * to a directory — so a planted symlink is reported once, as an entry, and is
 * never traversed. A missing fixture yields `[]` rather than throwing; the
 * properties that need a non-empty tree assert that for themselves.
 *
 * @param {string} dir Absolute directory to walk.
 * @param {Array<{rel: string, name: string, dirent: import("node:fs").Dirent}>} [out]
 * @returns {Array<{rel: string, name: string, dirent: import("node:fs").Dirent}>}
 *   `rel` is POSIX-style and relative to the fixture root.
 */
function walkFixture(dir = FIXTURE, out = []) {
  if (!existsSync(dir)) return out;
  for (const dirent of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, dirent.name);
    out.push({ rel: relative(FIXTURE, abs).split(sep).join("/"), name: dirent.name, dirent });
    if (dirent.isDirectory()) walkFixture(abs, out);
  }
  return out;
}

/**
 * True when `absPath` exists as ANY kind of entry, including a broken symlink.
 *
 * `existsSync` follows the link and reports a dangling one as absent, which
 * would let a forbidden path be reintroduced as a broken link and still pass.
 *
 * @param {string} absPath
 * @returns {boolean}
 */
function pathPresent(absPath) {
  try {
    lstatSync(absPath);
    return true;
  } catch {
    return false;
  }
}

test("hermeticity property 1 — no entry under the fixture is a symlink", () => {
  const entries = walkFixture();
  // Non-vacuity anchor: an absent fixture walks to zero entries, and "none of
  // zero entries is a symlink" is true for the wrong reason.
  assert.ok(
    entries.length > 0,
    `expected ${FIXTURE_REL}/ to contain at least one entry; walked ${entries.length}`,
  );
  const symlinks = entries.filter((e) => e.dirent.isSymbolicLink()).map((e) => e.rel);
  assert.deepEqual(symlinks, [], `symlinks are not hermetic; found under ${FIXTURE_REL}/`);
});

test("hermeticity property 2 — no git submodule is declared inside the fixture", () => {
  const gitmodules = join(PLUGIN_ROOT, ".gitmodules");
  if (!existsSync(gitmodules)) return; // no submodules at all: a pass.

  const paths = readFileSync(gitmodules, "utf8")
    .split("\n")
    .map((line) => /^\s*path\s*=\s*(.+?)\s*$/.exec(line))
    .filter(Boolean)
    .map((m) => m[1]);

  // Non-vacuity anchor for the PARSE: this repo does declare submodules today,
  // so an extraction that silently stopped working would surface here rather
  // than passing as "no submodule matched".
  assert.ok(paths.length > 0, ".gitmodules exists but no `path =` value parsed out of it");

  const inside = paths.filter((p) => p === FIXTURE_REL || p.startsWith(`${FIXTURE_REL}/`));
  assert.deepEqual(inside, [], `a submodule inside ${FIXTURE_REL}/ makes the fixture non-hermetic`);
});

test("hermeticity property 3 — no container runtime under the fixture", () => {
  // Non-vacuity anchor: "no Dockerfile" is trivially true when nothing exists.
  // Require the walk to have seen something first, so this property can only
  // pass by inspecting a real tree.
  const entries = walkFixture();
  assert.ok(entries.length > 0, `expected ${FIXTURE_REL}/ to contain at least one entry; walked 0`);
  const forbidden = new Set(["Dockerfile", "docker-compose.yml", "compose.yaml"]);
  const found = entries
    .filter((e) => forbidden.has(e.name))
    .map((e) => e.rel);
  assert.deepEqual(found, [], `container runtime files under ${FIXTURE_REL}/`);
});

test("hermeticity property 4 — no install ever runs inside the fixture", () => {
  // (a) The root package.json must not enrol the fixture as a workspace, which
  // would make `npm install` at the repo root reach into it.
  const rootPkg = JSON.parse(readFileSync(join(PLUGIN_ROOT, "package.json"), "utf8"));
  const workspaces = Array.isArray(rootPkg.workspaces)
    ? rootPkg.workspaces
    : Array.isArray(rootPkg.workspaces?.packages)
      ? rootPkg.workspaces.packages
      : [];
  const enrolling = workspaces.filter((glob) => {
    // npm accepts a trailing slash on a workspace entry; the anchored regex does not.
    const re = globToRegExp(String(glob).replace(/\/+$/, ""));
    return re.test(FIXTURE_REL) || re.test(`${FIXTURE_REL}/project`);
  });
  assert.deepEqual(enrolling, [], `root package.json workspaces must not select ${FIXTURE_REL}/`);

  // (b) The fixture's own package.json is declarative only. Parsing it is the
  // non-vacuity anchor: an absent or malformed manifest fails here rather than
  // letting the "no scripts" assertion pass over nothing.
  const projectPkg = JSON.parse(readFileSync(join(PROJECT, "package.json"), "utf8"));
  // Exactly two, and the number is load-bearing rather than arbitrary: they are
  // the `unused-dependency` class's negative-twin PAIR — one imported by
  // src/index.mjs (the known-clean twin), one imported by nothing (the planted
  // violation). Changing this count means changing that pair; update the
  // catalog entry with it.
  assert.equal(
    Object.keys(projectPkg.dependencies ?? {}).length,
    2,
    "the fixture declares exactly two dependencies — the unused-dependency PV/KC pair",
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(projectPkg, "scripts"),
    false,
    "a `scripts` key is an install/run door; the fixture manifest must not carry one",
  );
});

test("hermeticity property 8 — no agent-runtime surface and no dynamic-import exec doors", () => {
  // Non-vacuity anchor: every assertion below is a negative, so all of them are
  // satisfied by an absent fixture. Require the project root to exist first.
  assert.ok(pathPresent(PROJECT), `expected ${FIXTURE_REL}/project/ to exist`);

  // Agent-runtime surface: paths this repo's tooling reads as CONFIG. A fixture
  // carrying them would have the harness pick up fixture-authored agent
  // behaviour as if it were the repo's own.
  const runtimeSurface = [
    ".claude",
    ".mcp.json",
    ".context-index/skill-extensions",
    ".context-index/profiles.yaml",
    ".context-index/tool-categories.yaml",
    ".context-index/domains",
    ".context-index/extensions",
    // Banned one level DEEPER than `governance/`: DEFAULT_BOUNDARIES_PATH points
    // at governance/boundaries.yaml, so banning the directory would close
    // nothing (Task 2 ships validate.yaml and review.yaml there on purpose).
    ".context-index/governance/boundaries.yaml",
    "adev-workspace.yaml",
    "workspace.yaml",
    ".workspace",
  ];

  // EXEC DOORS, not runtime surfaces — these two are here for a DIFFERENT
  // reason and must not be "tidied" into the list above. They are the paths
  // from which THIS repository dynamically imports fixture-authored module
  // code: `project/lib/` is what `resolveVersion` reaches for via
  // `join(projectRoot, 'lib', …)`, and `project/.context-index/diagnostics/`
  // is loaded as executable diagnostic modules. Either one turns committed
  // fixture data into code that runs inside our own test process.
  const execDoors = ["lib", ".context-index/diagnostics"];

  const present = [...runtimeSurface, ...execDoors].filter((rel) => pathPresent(join(PROJECT, rel)));
  assert.deepEqual(present, [], `forbidden paths under ${FIXTURE_REL}/project/`);
});

test("the fixture's planted CommonJS is out of every content-matched boundary rule's scope", () => {
  // Task 4 plants a CommonJS `legacy-loader.js` on purpose — it is the thing
  // the eval's subject skill has to notice. This asserts the governance rules
  // already scope `tests/evals/**` away BEFORE that file lands, so it cannot
  // arrive as a surprise boundary finding.
  const boundariesPath = join(PLUGIN_ROOT, ".context-index/governance/boundaries.yaml");
  const doc = parseYaml(readFileSync(boundariesPath, "utf8"));
  const rules = (doc?.boundaries ?? []).filter((r) => r && r.enabled !== false);
  assert.ok(rules.length > 0, "boundaries.yaml declared no enabled rules to check");

  const plantedContent = ["const fs = require('fs');", "module.exports = { load };"].join("\n");
  const plantedPath = `${FIXTURE_REL}/project/legacy-loader.js`;

  // The executable predicate, stated in full: for each enabled rule whose
  // `pattern` matches the planted CONTENT, at least one `exclude` glob must
  // select the planted PATH. `globToRegExp` is the same compiler
  // `lib/governance/boundaries.mjs::isExcluded` uses, imported rather than
  // re-implemented, so this asserts the real matcher's answer.
  const matched = rules.filter((r) => new RegExp(r.pattern, r.flags ?? "").test(plantedContent));
  assert.ok(
    matched.length > 0,
    "no boundary rule matches the planted CommonJS — this check would be vacuous; " +
      "if `no-commonjs` was retired, retire this assertion with it",
  );

  const unscoped = matched
    .filter((r) => !(r.exclude ?? []).some((glob) => globToRegExp(glob).test(plantedPath)))
    .map((r) => r.id);
  assert.deepEqual(
    unscoped,
    [],
    `these rules would flag ${plantedPath}; add an exclude before Task 4 lands the file`,
  );
});

// ---------------------------------------------------------------------------
// Task 2 additions: the fixture's `.context-index/` config layer.
//
// Helpers below are shared by properties 5 and 7 and by the four config-layer
// assertions that ship with them. Same extension contract as above: helpers
// first, one `test()` per property, zero cross-test state.
// ---------------------------------------------------------------------------

/** Absolute path to the fixture project's governance directory. */
const GOVERNANCE = join(PROJECT, ".context-index", "governance");

/**
 * Parse a YAML file with the repository's own reader — the same one every
 * loader uses, so a shape this parser cannot express fails here rather than
 * at consumption time. A missing file throws (ENOENT).
 *
 * @param {string} absPath
 * @returns {any}
 */
function readYaml(absPath) {
  return parseYaml(readFileSync(absPath, "utf8"));
}

/**
 * Every string leaf of a parsed YAML value, with its dotted key path.
 *
 * Array indices appear as `[i]` segments so a caller can tell
 * `lifecycle.partial_roots[0]` from `lifecycle.partial_roots`.
 *
 * @param {any} node
 * @param {string} [prefix]
 * @param {Array<{keyPath: string, key: string, value: string}>} [out]
 * @returns {Array<{keyPath: string, key: string, value: string}>}
 */
function walkStrings(node, prefix = "", out = []) {
  if (typeof node === "string") {
    const last = prefix.split(".").pop() ?? prefix;
    out.push({ keyPath: prefix, key: last.replace(/\[\d+\]$/, ""), value: node });
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((item, i) => walkStrings(item, `${prefix}[${i}]`, out));
    return out;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      walkStrings(v, prefix === "" ? k : `${prefix}.${k}`, out);
    }
  }
  return out;
}

/**
 * Every key name that appears anywhere in a parsed YAML value, with its
 * dotted key path — the map-key side of {@link walkStrings}, which only sees
 * leaves. A banned key whose value is a map (`package: {skill: x}`) is
 * invisible to a leaf walk, so the key walk is what catches it.
 *
 * @param {any} node
 * @param {string} [prefix]
 * @param {Array<{keyPath: string, key: string}>} [out]
 * @returns {Array<{keyPath: string, key: string}>}
 */
function walkKeys(node, prefix = "", out = []) {
  if (Array.isArray(node)) {
    node.forEach((item, i) => walkKeys(item, `${prefix}[${i}]`, out));
    return out;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      const keyPath = prefix === "" ? k : `${prefix}.${k}`;
      out.push({ keyPath, key: k });
      walkKeys(v, keyPath, out);
    }
  }
  return out;
}

/** Every `*.yaml` file directly under the fixture's `governance/`, absolute. */
function governanceFiles() {
  if (!existsSync(GOVERNANCE)) return [];
  return readdirSync(GOVERNANCE, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".yaml"))
    .map((d) => join(GOVERNANCE, d.name));
}

/**
 * Does this string value denote a filesystem path?
 *
 * Derived, never enumerated: property 7 must not depend on a hardcoded list
 * of manifest key names, because the failure it guards against is precisely a
 * NEW path-valued key nobody added to such a list. A value counts when it
 * carries no whitespace and either contains a `/` or ends in a short file
 * extension. Dotted version numbers (`0.28.0`) are excluded explicitly — they
 * satisfy the extension shape without denoting anything on disk.
 *
 * @param {string} v
 * @returns {boolean}
 */
function looksLikePath(v) {
  if (v === "") return false;
  if (/^\d+(\.\d+)*$/.test(v)) return false;
  // A separator makes it a path regardless of whitespace: "../../My Notes/x.md"
  // is exactly the escape this walk exists to catch, and an earlier revision
  // disqualified it on the space before ever testing for the slash.
  if (v.includes("/")) return true;
  // Bare traversal with no separator still escapes when resolved.
  if (/^\.\.?$/.test(v)) return true;
  // Otherwise a lone token only counts as a path when it carries an extension,
  // and only when it has no whitespace — prose like "see foo.md for details"
  // is not a declaration.
  if (/\s/.test(v)) return false;
  return /\.[A-Za-z0-9]{1,6}$/.test(v);
}

test("hermeticity property 5 — every deploy step is `type: manual` and none carries a rollback", () => {
  const config = loadDeployConfig(PROJECT);

  // Non-vacuity: a missing deploy.yaml loads as `null`, and "every step of no
  // steps is manual" is true for the wrong reason. The step floor is the same
  // anchor one level down — a one-step file makes a `--dry-run` transcript not
  // worth scoring.
  assert.ok(config, `expected ${FIXTURE_REL}/project/.context-index/deploy.yaml to load`);
  assert.equal(
    config._loadError,
    undefined,
    `deploy.yaml failed to load: ${JSON.stringify(config.errors)}`,
  );
  assert.ok(
    config.steps.length >= 3,
    `expected at least 3 deploy steps for a scoreable --dry-run transcript; got ${config.steps.length}`,
  );

  // Asserted on the PARSED `type` of each step, not on the absence of the
  // string "shell" in the file: a comment mentioning shell must not fail, and
  // a `type: gate` must. `lib/deploy.mjs` spawns `step.command` for `shell`
  // (:308), `verify` (:392), `gate` (:444 — a polling loop) and `ci-trigger`.
  // `manual` is the only type whose executor runs nothing.
  const nonManual = config.steps
    .filter((s) => s?.type !== "manual")
    .map((s) => `${s?.id ?? "<no id>"}: ${JSON.stringify(s?.type)}`);
  assert.deepEqual(
    nonManual,
    [],
    "every fixture deploy step must be `type: manual` — every other type executes a command",
  );

  // A SEPARATE assertion, deliberately: a `rollback:` body is a second command
  // surface the step-type check cannot reach. `executeRun` collects
  // `stepConfig.rollback` from completed steps (:657) whatever their type, so
  // a `manual` step with a rollback still ships fixture-authored instructions
  // into the rollback path.
  const withRollback = config.steps
    .filter((s) => s && Object.prototype.hasOwnProperty.call(s, "rollback"))
    .map((s) => s.id ?? "<no id>");
  assert.deepEqual(withRollback, [], "no fixture deploy step may carry a `rollback:` body");
});

test("hermeticity property 7 — every path the fixture manifest declares stays inside fixture_root", () => {
  const manifest = readYaml(join(PROJECT, ".context-index", "manifest.yaml"));
  const allStrings = walkStrings(manifest);

  // Derived enumeration, not a hardcoded key list — see `looksLikePath`.
  const declared = allStrings.filter((e) => looksLikePath(e.value));

  // Non-vacuity: an empty enumeration satisfies every containment claim below.
  assert.ok(
    declared.length > 0,
    "the fixture manifest declares no path-valued key — property 7 would pass vacuously",
  );

  // `lifecycle.partial_roots` specifically: its values WIDEN a containment
  // allowlist (incremental-artifact-writes) rather than merely naming a path,
  // so a walk that finds every other key but misses this one is not the walk
  // this property needs.
  assert.ok(
    declared.some((e) => e.keyPath.startsWith("lifecycle.partial_roots")),
    "the fixture manifest must declare lifecycle.partial_roots — the containment-allowlist widener",
  );

  // This runs against the COMMITTED tree, where `tasks.db_path` is
  // deliberately absent (Task 8's board-containment property covers the
  // resolver's output instead). Finding one here means the fixture was
  // authored wrong, not that the resolver drifted.
  assert.deepEqual(
    allStrings.filter((e) => e.keyPath === "tasks.db_path").map((e) => e.value),
    [],
    "`tasks.db_path` must be absent from the committed fixture manifest",
  );

  // Escape is decided BEFORE existence: `lenientRealpath` resolves a path
  // whose tail does not exist rather than throwing, so a declared-but-absent
  // path is still judged on where it WOULD land.
  const fixtureRootReal = lenientRealpath(PROJECT);
  const escaping = declared
    // The spec's row prescribes resolveContained's lexical pre-check before this
    // realpathed check. It is omitted deliberately: the pre-check exists to
    // decide escape ahead of filesystem access when a symlink could redirect
    // the resolved path, and property 1 already bans every symlink under the
    // fixture — so here the two decide identically. If the symlink ban is ever
    // relaxed, reinstate resolveContained (exported from lib/path-safety.mjs).
    .filter((e) => !isContained(lenientRealpath(resolve(PROJECT, e.value)), fixtureRootReal))
    .map((e) => `${e.keyPath} = ${e.value}`);
  assert.deepEqual(escaping, [], "fixture manifest paths must resolve inside fixture_root");
});

test("the fixture's governance is command-free — five banned keys", () => {
  const files = governanceFiles();
  // Non-vacuity: every assertion below is a negative. Two files are the whole
  // governance surface Task 2 ships.
  assert.equal(
    files.map((f) => relative(GOVERNANCE, f)).sort().join(","),
    "review.yaml,validate.yaml",
    `expected exactly review.yaml and validate.yaml under ${FIXTURE_REL}/project/.context-index/governance/`,
  );

  // `command:`, `poll_command:` and `runner:` reach execution directly.
  // `package:` and `prompt_text:` are banned for a DIFFERENT reason, and that
  // difference is why this is a key-level ban rather than a loader-level one:
  // `review-config.mjs` ADMITS both as legitimate reviewer forms, so an
  // assertion on the loader's admitted set cannot reject either. `package:`
  // resolves a `package.skill`/`package.adapter` pair the orchestrator
  // dispatches as an external skill; `prompt_text:` carries fixture-authored
  // reviewer prose inline with no path resolution and no existence check.
  // `runner:` is the one a `command`/`poll_command` field-pair ban misses:
  // `lib/diagnostics/index.mjs` resolves `runner: project:<rel>` and
  // `await import`s it in-process, with no `--allow-exec` in the way.
  const banned = new Set(["command", "poll_command", "runner", "package", "prompt_text"]);
  const found = [];
  for (const file of files) {
    for (const { keyPath, key } of walkKeys(readYaml(file))) {
      if (banned.has(key)) {
        found.push(`${relative(GOVERNANCE, file)}:${keyPath} (banned key \`${key}\`)`);
      }
    }
  }
  assert.deepEqual(
    found,
    [],
    "fixture governance must declare no key that reaches execution or carries inline prose",
  );
});

test("three governance files must not exist, and the fixture constitution declares no quality gates", () => {
  const forbidden = ["gates.yaml", "diagnostics.yaml", "boundaries.yaml"].filter((name) =>
    pathPresent(join(GOVERNANCE, name)),
  );
  assert.deepEqual(
    forbidden,
    [],
    `these files under ${FIXTURE_REL}/project/.context-index/governance/ each open a command surface`,
  );

  // The door one over from the `gates.yaml` ban: /adev:eval falls back to the
  // constitution's Quality Gates block when governance/gates.yaml is absent
  // (skills/eval/SKILL.md:75), so banning the file alone closes nothing.
  const constitution = readFileSync(join(PROJECT, ".context-index", "constitution.md"), "utf8");
  assert.ok(constitution.trim().length > 0, "the fixture constitution must not be empty");
  assert.equal(
    /^#{1,6}\s+Quality Gates\s*$/m.test(constitution),
    false,
    "the fixture constitution must carry no Quality Gates heading — /adev:eval would run its commands",
  );
  // The heading regex alone is too narrow: /adev:eval's fallback is agent-driven
  // prose, so a block titled `## Commands`, `## Quality Gate`, or a bold
  // **Quality Gates** feeds an agent commands while evading the pattern above.
  // What actually matters is that there is no command text to lift, and the
  // fixture constitution carries no fenced block at all — a stronger anchor
  // than enumerating the titles a heading might use.
  assert.equal(
    constitution.includes("```"),
    false,
    "the fixture constitution must carry no fenced code block — any of them reads as a runnable command to an agent falling back from a missing gates.yaml",
  );
});

test("every governance `prompt:` is a plugin URI whose loader-resolved path sits under <pluginRoot>/skills/", () => {
  // Raw declarations, read from the files themselves.
  const declared = [];
  for (const file of governanceFiles()) {
    for (const { key, value } of walkStrings(readYaml(file))) {
      if (key === "prompt") declared.push({ file: relative(GOVERNANCE, file), value });
    }
  }
  assert.ok(
    declared.length > 0,
    "no `prompt:` value found under the fixture's governance/ — nothing to check",
  );

  const badShape = declared
    .filter((d) => !/^plugin:[a-z-]+\//.test(d.value))
    .map((d) => `${d.file}: ${d.value}`);
  assert.deepEqual(badShape, [], "every fixture `prompt:` must be a `plugin:<skill>/…` URI");

  // The shape check alone is not the property: `plugin:no-such-skill/x.md`
  // matches the regex and resolves nowhere. What matters is the path the
  // LOADER produced — `resolvePromptUri` is module-private and returns `null`
  // on PROMPT_NOT_FOUND / PROMPT_PATH_ESCAPE / PROMPT_CROSS_PLUGIN, dropping
  // the entry, so an unresolvable URI shows up here as a declaration with no
  // resolved counterpart. Containment is asserted against
  // `<pluginRoot>/skills/` specifically: "outside the fixture copy" is also
  // true of `/etc/anything`.
  // Keyed by `<file>:<uri>`, not by the URI alone. If both configs ever declare
  // the same prompt URI and only one loader resolves it, a URI-keyed map lets
  // the hit mask the miss — and a dropped entry reading as resolved is the
  // exact failure this assertion exists to catch.
  const resolvedByUri = new Map();
  for (const check of loadValidateConfig(PROJECT, { pluginRoot: PLUGIN_ROOT }).checks) {
    if (check.prompt && check.resolvedPromptPath) {
      resolvedByUri.set(`validate.yaml:${check.prompt}`, check.resolvedPromptPath);
    }
  }
  for (const reviewer of loadReviewConfig(PROJECT, { pluginRoot: PLUGIN_ROOT }).reviewers) {
    if (reviewer.promptDisplay && reviewer.promptPath) {
      resolvedByUri.set(`review.yaml:${reviewer.promptDisplay}`, reviewer.promptPath);
    }
  }

  const skillsRoot = lenientRealpath(join(PLUGIN_ROOT, "skills"));
  const problems = [];
  for (const d of declared) {
    const resolved = resolvedByUri.get(`${d.file}:${d.value}`);
    if (!resolved) {
      problems.push(`${d.file}: ${d.value} — the loader resolved no path for it (entry dropped)`);
      continue;
    }
    if (!isContained(lenientRealpath(resolved), skillsRoot)) {
      problems.push(`${d.file}: ${d.value} — resolved to ${resolved}, outside ${skillsRoot}`);
    }
  }
  assert.deepEqual(
    problems,
    [],
    "every fixture `prompt:` must resolve to a real file under the plugin's skills/",
  );
});

test("the materialization marker sits on review.yaml and on nothing else", () => {
  // Both halves, because asserting only the present half would pass on a
  // fixture that marked everything. `MARKED_REGISTRIES` is
  // {review.yaml, diagnostics.yaml, gates.yaml}; `assertMaterialized` throws
  // MARKER_INPUT_INVALID when pointed at an exempt registry, so a marker on
  // validate.yaml is not merely redundant — it asserts a state no loader on
  // that path will ever read.
  assert.equal(MARKED_REGISTRIES.has("review.yaml"), true, "review.yaml is a marked registry");
  assert.equal(MARKED_REGISTRIES.has("validate.yaml"), false, "validate.yaml is EXEMPT from marking");

  assert.notEqual(
    readMarker(join(GOVERNANCE, "review.yaml")),
    null,
    "review.yaml must carry a top-level ISO-8601 `materialized_at` — without it loadReviewConfig fails closed",
  );

  // Read the TEXT for the absent half rather than `readMarker`, which reports
  // a corrupt value as `null` and would call a malformed marker "absent".
  const validateText = readFileSync(join(GOVERNANCE, "validate.yaml"), "utf8");
  assert.equal(
    /^materialized_at:/m.test(validateText),
    false,
    "validate.yaml is an exempt registry and must carry no `materialized_at` marker",
  );
});

test("the fixture's minimum enabled checks and reviewers, read through the loaders", () => {
  // Asserted on the ADMITTED sets, never on a raw YAML read: a raw read
  // satisfies "enabled" while the loader admits nothing. The likeliest drift
  // is PROMPT_NOT_FOUND — a check prompt renamed under `<pluginRoot>/skills/`
  // reads as enabled in the file and produces no admitted check.
  const validate = loadValidateConfig(PROJECT, { pluginRoot: PLUGIN_ROOT });
  assert.deepEqual(
    validate.errors,
    [],
    "loadValidateConfig must report no errors against the fixture — a dropped check must surface, not vanish",
  );
  const enabledChecks = validate.checks.filter((c) => c.enabled !== false).map((c) => c.id).sort();
  for (const required of ["validate.check-2-spec-compliance", "validate.check-4-constitution"]) {
    assert.ok(
      enabledChecks.includes(required),
      `the fixture must admit '${required}'; admitted: ${enabledChecks.join(", ") || "<none>"}`,
    );
  }

  // Command-FREE is the constraint; check-FREE would silently unscore the
  // validate, review-specs and build rubrics and make the `esm-violation` pair
  // unassertable. This pair of assertions is what tells the two apart.
  const review = loadReviewConfig(PROJECT, { pluginRoot: PLUGIN_ROOT });
  assert.deepEqual(review.errors, [], "loadReviewConfig must report no errors against the fixture");
  const enabledReviewers = review.reviewers.filter((r) => r.enabled !== false).map((r) => r.id).sort();
  // `structural-architect` is the reviewer that produces a
  // `charter-scope-escape` finding: its prompt asks "Does this spec respect
  // its charter's scope?" (structural-architect-prompt.md, Module Boundaries).
  assert.ok(
    enabledReviewers.includes("structural-architect"),
    `the fixture must admit the charter-scope reviewer; admitted: ${enabledReviewers.join(", ") || "<none>"}`,
  );

  // The fixture declares NO disabled entry. This is the anchor the `prompt:`
  // property leans on: it requires a loader-resolved path for EVERY declared
  // prompt, which only holds while no entry is switched off.
  assert.deepEqual(validate.disabled.map((c) => c.id), [], "the fixture declares no disabled validate check");
  assert.deepEqual(review.disabled.map((r) => r.id), [], "the fixture declares no disabled reviewer");
});

// ---------------------------------------------------------------------------
// Task 3 additions: the fixture's markdown corpus — the lifecycle artifacts.
//
// Properties 6 and 9 are the two hermeticity rules decided by CONTENT rather
// than by tree shape, which is why they land with the corpus rather than with
// Task 1's scaffolding: before there were specs, plans, a charter and a
// product brief to read, both properties would have iterated an empty set.
//
// Helpers below are shared by properties 6 and 9 and by the `kind:` assertion
// that ships with them. Same extension contract as above: helpers first, one
// `test()` per property, zero cross-test state.
// ---------------------------------------------------------------------------

/** Absolute path to the fixture project's lifecycle-artifact library. */
const SPECS = join(PROJECT, ".context-index", "specs");

/**
 * Every `.md` file under `dir`, depth-first, as absolute paths.
 *
 * Symlinks are never followed — recursion is gated on `dirent.isDirectory()`,
 * which property 1 already keeps false for every entry under the fixture. A
 * missing directory yields `[]`; each caller asserts non-emptiness itself.
 *
 * @param {string} dir
 * @param {string[]} [out]
 * @returns {string[]} Absolute paths, in walk order.
 */
function markdownUnder(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const dirent of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, dirent.name);
    if (dirent.isDirectory()) markdownUnder(abs, out);
    else if (dirent.isFile() && dirent.name.endsWith(".md")) out.push(abs);
  }
  return out;
}

/** POSIX-style path of `abs` relative to the fixture project root. */
function projectRel(abs) {
  return relative(PROJECT, abs).split(sep).join("/");
}

/**
 * The YAML frontmatter block of a markdown document, or `null` when absent.
 *
 * Deliberately the SAME leading-fence regex `lib/infra-preflight.mjs`
 * (`parseInfraRequirements`) uses, so property 6 decides "is there
 * frontmatter here" exactly the way the consumer it guards against decides
 * it. A file this regex reads as frontmatter-less is a file the preflight
 * would also skip.
 *
 * @param {string} text Full file contents.
 * @returns {string|null} The block body, without its `---` fences.
 */
function frontmatterBlock(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : null;
}

/**
 * Which lifecycle-artifact kind a project-relative markdown path denotes.
 *
 * Classification is by PATH, matching how the ADR-0009 taxonomy disambiguates
 * layers ("the file path provides layer disambiguation"). Used only for
 * property 6's coverage floor — a file that classifies as `null` is still
 * scanned for the banned key.
 *
 * @param {string} rel POSIX path relative to `project/`.
 * @returns {"charter"|"spec"|"plan"|"product"|null}
 */
function artifactKind(rel) {
  if (rel === ".context-index/specs/product.md") return "product";
  if (rel.endsWith("/charter.md")) return "charter";
  if (rel.endsWith(".spec.md")) return "spec";
  if (rel.endsWith(".plan.md")) return "plan";
  return null;
}

/**
 * Markdown with fenced blocks and inline code spans blanked out.
 *
 * Newlines are preserved so a reported line number still points at the right
 * line. Blanking matters in both directions: Claude Code does not resolve an
 * `@`-looking token inside code as an import (so scanning raw text would fire
 * on `@anthropic-ai/foo` in a snippet), and the fixture's golden sample
 * embeds annotated JSDoc — `@param`, `@returns` — that must not read as one.
 *
 * @param {string} text
 * @returns {string}
 */
function blankCode(text) {
  const blank = (s) => s.replace(/[^\n]/g, " ");
  return text.replace(/^```[\s\S]*?^```/gm, blank).replace(/`[^`\n]*`/g, blank);
}

/**
 * Claude Code `@`-import references in a markdown document.
 *
 * The construct is a bare `@` followed by a path, at a word boundary. The
 * three alternatives are the three shapes that actually resolve to a file: an
 * explicitly relative/absolute/home path (`@./x`, `@../x`, `@/x`, `@~/x`), any
 * token carrying a `/` (`@docs/notes.md`), and a bare sibling document named
 * by extension (`@notes.md`). A slash-free, extension-free token — `@param`,
 * `@returns`, `@adev:eval` — is not an import and is not matched.
 *
 * @param {string} text Raw file contents; code is blanked internally.
 * @returns {Array<{spec: string, line: number}>}
 */
function atImports(text) {
  const re =
    /(?:^|[\s(\[>|])@((?:\.{1,2}\/|~\/|\/)[^\s`)\]|]+|[A-Za-z0-9_.-]+\/[^\s`)\]|]*|[A-Za-z0-9_-]+\.(?:md|markdown|mdx|txt))/g;
  const scanned = blankCode(text);
  const found = [];
  for (const m of scanned.matchAll(re)) {
    // m.index points at the consumed leading delimiter, which is the newline
    // itself when the import starts a line — offsetting to the `@` keeps the
    // reported line honest. Diagnostic only; it never changes pass/fail.
    const at = m.index + m[0].indexOf("@");
    found.push({ spec: m[1], line: scanned.slice(0, at).split("\n").length });
  }
  return found;
}

/** How far Claude Code resolves a chain of `@`-imports. */
const MAX_IMPORT_HOPS = 5;

/**
 * Follow every `@`-import reachable from the markdown under `projectRoot`.
 *
 * Parameterised by root rather than closed over `PROJECT` because Task 8's
 * durable falsification artifact runs this exact walk against a TEMP COPY with
 * an `@`-import planted in it. Duplicating the walk there would falsify a copy
 * of the logic instead of the logic property 9 relies on.
 *
 * Every hit is an escape: the fixture's own corpus is required to carry none,
 * so there is no in-scope destination to allow. A dangling target simply
 * imports nothing further.
 *
 * @param {string} projectRoot Absolute path to the fixture project (or a copy).
 * @returns {{ escapes: string[], seeds: number, visited: number }}
 *   `escapes` names the CHAIN, so a failure reports the route out of the tree.
 */
function atImportEscapes(projectRoot) {
  const rel = (abs) => relative(projectRoot, abs).split(sep).join("/");
  const files = markdownUnder(projectRoot);
  const seen = new Set();
  const escapes = [];
  let frontier = files.map((f) => ({ abs: f, chain: [rel(f)] }));
  for (let hop = 0; hop < MAX_IMPORT_HOPS && frontier.length > 0; hop += 1) {
    const next = [];
    for (const { abs, chain } of frontier) {
      if (seen.has(abs)) continue;
      seen.add(abs);
      let text;
      try {
        if (!lstatSync(abs).isFile()) continue;
        text = readFileSync(abs, "utf8");
      } catch {
        continue; // a dangling import target imports nothing further
      }
      for (const hit of atImports(text)) {
        const target = hit.spec.startsWith("~/") ? null : resolve(dirname(abs), hit.spec);
        const where = chain.length === 1 ? `${chain[0]}:${hit.line}` : chain.join(" → ");
        escapes.push(`${where} → @${hit.spec} (hop ${hop + 1})`);
        if (target) next.push({ abs: target, chain: [...chain, `@${hit.spec}`] });
      }
    }
    frontier = next;
  }
  return { escapes, seeds: files.length, visited: seen.size };
}

test("hermeticity property 6 — no markdown under the fixture declares infra_requirements", () => {
  const files = markdownUnder(PROJECT);

  // Non-vacuity, first half: "no file carries the key" is true of no files.
  assert.ok(
    files.length > 0,
    `expected markdown under ${FIXTURE_REL}/project/ to scan; found ${files.length}`,
  );

  // Non-vacuity, second half, and the stronger one: the four artifact kinds
  // the preflight is actually pointed at. `adev preflight run --spec <path>
  // [--plan <path>]` runs early in implement, validate, debug, eval, write-test
  // and recover, and /adev:work reads the charter and product brief on the way
  // in. A scan that walked only `docs/` would satisfy the count floor above
  // while reading none of the files that matter.
  const kinds = new Set(files.map((f) => artifactKind(projectRel(f))).filter(Boolean));
  const missing = ["charter", "spec", "plan", "product"].filter((k) => !kinds.has(k));
  assert.deepEqual(
    missing,
    [],
    `property 6 must scan each lifecycle-artifact kind; none found for: ${missing.join(", ")}`,
  );

  // The ban is on the KEY, in frontmatter, in whichever YAML form. The block
  // form (`infra_requirements:` alone on its line) is the only one
  // `parseInfraRequirements` parses today, so matching only that would let an
  // inline `infra_requirements: [postgres]` sit in the tree until the parser
  // grew a flow-sequence branch and silently armed it.
  const declaring = [];
  for (const file of files) {
    const fm = frontmatterBlock(readFileSync(file, "utf8"));
    if (fm && /^infra_requirements\s*:/m.test(fm)) declaring.push(projectRel(file));
  }
  assert.deepEqual(
    declaring,
    [],
    "an `infra_requirements:` block reaches `executeProbe`, which runs its `probe:` string " +
      "through execFileSync with no consent gate — ban the field, not the specs",
  );
});

test("hermeticity property 9 — the required instruction files exist and no markdown carries an `@`-import", () => {
  // The four are REQUIRED, not banned: they are an accepted crossing, recorded
  // rather than closed. Asserting their presence is what stops the content ban
  // below from being satisfied by deleting the corpus.
  const required = [
    "CLAUDE.md",
    "AGENTS.md",
    ".context-index/memory/heuristics/orders.md",
    ".context-index/samples",
  ];
  const absent = required.filter((rel) => !pathPresent(join(PROJECT, rel)));
  assert.deepEqual(
    absent,
    [],
    `these instruction surfaces are required under ${FIXTURE_REL}/project/`,
  );
  assert.ok(
    markdownUnder(join(PROJECT, ".context-index", "samples")).length > 0,
    "`.context-index/samples/` must hold at least one golden sample, not just exist",
  );

  // ONE assertion, not two, and the reason is worth stating: a flat "no
  // `@`-import in any `.md` under project/" scan is a STRICT SUBSET of the
  // walk below, because the walk seeds from exactly that file set and reports
  // every hop-1 hit the flat scan would. Shipping both would leave one of them
  // permanently unreachable by any perturbation — dead weight that reads as
  // coverage. The walk is the one kept because it strictly dominates: it
  // resolves each import and keeps following, to five hops (the documented
  // depth of Claude Code's import resolution), so it also sees the hops a flat
  // markdown scan structurally cannot — a target that is not `.md`
  // (`@docs/notes.txt`) and a target that is not under `project/` at all. It
  // also reports the CHAIN, so a failure names the route out of the fixture
  // rather than one line.
  const { escapes, seeds, visited } = atImportEscapes(PROJECT);
  assert.ok(
    seeds > 0,
    `expected markdown under ${FIXTURE_REL}/project/ to seed the walk; found ${seeds}`,
  );
  // The walk must have READ something for its silence to mean anything.
  assert.ok(visited > 0, "the import walk visited no file — a silent pass over nothing");
  assert.deepEqual(
    escapes,
    [],
    "no markdown under the fixture, and nothing within " +
      `${MAX_IMPORT_HOPS} hops of it, may carry an \`@\`-import — \`@../../../CLAUDE.md\` ` +
      "feeds this repository's own constitution to a driven skill",
  );
});

test("every lifecycle artifact under the fixture's specs/ carries a `kind:` (ADR-0009 §1)", () => {
  const files = markdownUnder(SPECS);
  assert.ok(
    files.length > 0,
    `expected lifecycle artifacts under ${FIXTURE_REL}/project/.context-index/specs/; found none`,
  );

  // Per file, never a spot check: the failure this guards is one artifact
  // authored without the discriminator, which an "at least one has it"
  // assertion reads as covered.
  const missing = [];
  const illegal = [];
  for (const file of files) {
    const rel = projectRel(file);
    const fm = frontmatterBlock(readFileSync(file, "utf8"));
    const m = fm && fm.match(/^kind:[ \t]*(\S+)[ \t]*$/m);
    if (!m) {
      missing.push(rel);
      continue;
    }
    // Legality is asserted only where ADR-0009's closed enumerations apply.
    // `*.plan.md` and `product.md` are neither of the two layers the ADR
    // enumerates, so they carry a `kind:` without being bound to those values.
    const kind = artifactKind(rel);
    const enumeration = kind === "charter" ? CHARTER_KINDS : kind === "spec" ? SPEC_KINDS : null;
    if (enumeration && !enumeration.includes(m[1])) {
      illegal.push(`${rel}: kind: ${m[1]} (legal: ${enumeration.join(", ")})`);
    }
  }
  assert.deepEqual(missing, [], "every artifact under specs/ must declare an explicit `kind:`");
  assert.deepEqual(
    illegal,
    [],
    "a charter or spec `kind:` must be a member of its closed enumeration",
  );
});

// ---------------------------------------------------------------------------
// Task 4 additions: the dirty slice and the ten anchorable violation classes.
//
// Three obligations land here, and they are separate tests on purpose.
//
//   1. SLICE PARITY, three ways. The `shipping-rates` (dirty) and
//      `create-order` (clean) slices must carry the same file KINDS, the same
//      section HEADINGS, and the same TASK COUNT. The spec permits exactly
//      three differences between them — the planted anchors, the two pinned
//      `status:` values, and the two lifecycle chains — and nothing else. Two
//      slices with matching filenames but divergent heading structure would let
//      a rubric score the SHAPE difference instead of the planted defect, which
//      is the confound the negative twin exists to remove. Three dimensions,
//      three assertions: a single folded "the slices match" check could pass on
//      two of the three and still read as covered.
//
//   2. TEN ANCHORABLE CLASSES. Each Seed Content class cites a file and an
//      anchor, and the anchor must occur EXACTLY once — zero means the plant
//      was never made or has moved, more than one means the catalog points at
//      an ambiguous site (the spec's `CATALOG_ANCHOR_NOT_UNIQUE`, here as its
//      fixture-side precondition).
//
//   3. NOT DISARMED. A class is a PLANTED violation only while the CLEAN side
//      does not already satisfy it. That precondition lapsed twice during
//      authoring — a charter row that charted the escaping capability, a board
//      entry that supplied the "missing" binding — and both times review, not a
//      test, caught it. The third test makes each precondition standing, so a
//      later edit that disarms a plant goes red instead of scoring green over
//      nothing.
//
// Helpers below are shared by those three tests only. Same extension contract
// as above: helpers first, one `test()` per obligation, zero cross-test state.
// ---------------------------------------------------------------------------

/** Absolute path to the fixture project's lifecycle-state directory. */
const LIFECYCLE = join(PROJECT, ".context-index", "lifecycle-state");

/** Absolute path to the `orders` charter's artifact directory. */
const ORDERS_SPECS = join(SPECS, "features", "orders");

/**
 * The two slices, declared rather than discovered.
 *
 * Discovery by directory cannot work: `src/orders/` holds the clean slice's
 * module AND two of the dirty slice's plants (`legacy-loader.js`,
 * `orphaned-helper.mjs`), so no path prefix partitions the tree. What IS
 * slug-partitioned is the artifact library and the lifecycle log, and those two
 * directories are SCANNED rather than listed — which is what lets a file added
 * to one slice alone surface as a kind the other slice does not carry.
 */
const SLICES = [
  {
    name: "create-order",
    slug: "create-order",
    spec: ".context-index/specs/features/orders/create-order.spec.md",
    plan: ".context-index/specs/features/orders/create-order.plan.md",
    modules: ["src/orders/create-order.mjs"],
  },
  {
    name: "shipping-rates",
    slug: "shipping-rates",
    spec: ".context-index/specs/features/orders/shipping-rates.spec.md",
    plan: ".context-index/specs/features/orders/shipping-rates.plan.md",
    modules: ["src/shipping/rates.mjs"],
  },
];

/**
 * The Seed Content catalog, one entry per violation class.
 *
 * `path` is project-relative; `anchor` is the literal text that must occur in
 * it exactly once. Anchors are single-line by construction — a phrase that
 * wraps across a line break is not findable by substring and would report as a
 * missing plant the moment a paragraph reflowed.
 */
const CLASSES = [
  {
    id: "spec-code-drift",
    path: ".context-index/specs/features/orders/shipping-rates.spec.md",
    anchor: "rounded half up to the nearest whole cent",
  },
  {
    id: "stale-spec-frontmatter",
    path: ".context-index/specs/features/orders/shipping-rates.spec.md",
    anchor: "updated: 2026-08-03",
  },
  {
    id: "orphan-source-file",
    path: "src/orders/orphaned-helper.mjs",
    anchor: "export function orphanedTotalCents",
  },
  {
    id: "dead-export",
    path: "src/shipping/rates.mjs",
    anchor: "export function formatLegacyTotal",
  },
  { id: "unused-dependency", path: "package.json", anchor: '"ajv":' },
  { id: "esm-violation", path: "src/orders/legacy-loader.js", anchor: 'require("node:fs")' },
  {
    id: "charter-scope-escape",
    path: ".context-index/specs/features/orders/shipping-rates.spec.md",
    anchor: "Calculate a shipping rate",
  },
  {
    id: "undocumented-public-api",
    path: "src/shipping/rates.mjs",
    anchor: "export function calculateRate",
  },
  {
    id: "missing-issue-binding",
    path: ".context-index/tasks/tasks.json",
    anchor: '"id": "epic-2"',
  },
  {
    id: "plan-task-without-test",
    path: ".context-index/specs/features/orders/shipping-rates.plan.md",
    anchor: "### Task 2: Apply the weight-band rounding rule",
  },
];

/**
 * Read a project-relative fixture file as UTF-8.
 *
 * @param {string} rel POSIX path relative to `project/`.
 * @returns {string}
 */
function readProject(rel) {
  return readFileSync(join(PROJECT, ...rel.split("/")), "utf8");
}

/**
 * Count non-overlapping occurrences of a LITERAL substring.
 *
 * Literal, never a `RegExp`: several anchors carry regex metacharacters
 * (`"ajv":`, `require("node:fs")`), and compiling them would silently change
 * what is being counted.
 *
 * @param {string} haystack
 * @param {string} needle
 * @returns {number}
 */
function occurrences(haystack, needle) {
  let count = 0;
  for (
    let at = haystack.indexOf(needle);
    at !== -1;
    at = haystack.indexOf(needle, at + needle.length)
  ) {
    count += 1;
  }
  return count;
}

/**
 * The artifact kind a slice-member basename denotes.
 *
 * An unrecognised basename resolves to a distinguishable `unclassified:<name>`
 * token rather than to `null`, so a file added to one slice alone FAILS the
 * kind-set comparison instead of vanishing from it.
 *
 * @param {string} basename
 * @returns {string}
 */
function memberKind(basename) {
  if (basename.endsWith(".spec.md")) return "spec";
  if (basename.endsWith(".plan.md")) return "plan";
  if (basename.endsWith(".jsonl")) return "lifecycle-log";
  if (basename.endsWith(".mjs") || basename.endsWith(".js")) return "source-module";
  return `unclassified:${basename}`;
}

/**
 * The sorted set of artifact kinds one slice carries.
 *
 * Scanned for the two slug-partitioned directories; the source modules come
 * from the descriptor because `src/` is not slug-partitioned (see `SLICES`).
 * Each declared module must exist — a descriptor naming a file that is gone
 * would otherwise quietly drop `source-module` from BOTH sides and still
 * compare equal, which is why absence maps to a `missing:` token.
 *
 * @param {{slug: string, modules: string[]}} slice
 * @returns {string[]} Sorted, de-duplicated kind tokens.
 */
function sliceKinds(slice) {
  const kinds = new Set();
  for (const dir of [ORDERS_SPECS, LIFECYCLE]) {
    if (!existsSync(dir)) continue;
    for (const dirent of readdirSync(dir, { withFileTypes: true })) {
      if (dirent.isFile() && dirent.name.startsWith(`${slice.slug}.`)) {
        kinds.add(memberKind(dirent.name));
      }
    }
  }
  for (const rel of slice.modules) {
    kinds.add(pathPresent(join(PROJECT, ...rel.split("/"))) ? memberKind(rel) : `missing:${rel}`);
  }
  return [...kinds].sort();
}

/**
 * The `##` / `###` heading sequence of a markdown document, in document order.
 *
 * Fenced code and inline spans are blanked first (`blankCode`), so a `###`
 * inside a sample block is not read as structure. Task headings are normalised
 * to `### Task <n>`: the two slices implement different capabilities, so their
 * task TITLES must differ — it is the task STRUCTURE that has to match, and
 * comparing raw titles would make parity unachievable rather than strict.
 *
 * @param {string} text
 * @returns {string[]}
 */
function headingOutline(text) {
  return blankCode(text)
    .split("\n")
    .map((line) => /^(#{2,3})\s+(.+?)\s*$/.exec(line))
    .filter(Boolean)
    .map((m) => `${m[1]} ${m[2].replace(/^Task\s+(\d+):.*$/, "Task $1")}`);
}

/**
 * The `### Task <n>: <title>` headings of a plan, in document order.
 *
 * @param {string} text
 * @returns {string[]}
 */
function planTaskHeadings(text) {
  return blankCode(text)
    .split("\n")
    .filter((line) => /^###\s+Task\s+\d+:/.test(line));
}

/**
 * The body of one `### Task <n>:` section, up to the next heading or `---`.
 *
 * @param {string} text
 * @param {number} taskNumber
 * @returns {string|null} `null` when the plan declares no such task.
 */
function planTaskSection(text, taskNumber) {
  const lines = blankCode(text).split("\n");
  const start = lines.findIndex((line) => new RegExp(`^###\\s+Task\\s+${taskNumber}:`).test(line));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,3}\s/.test(line) || /^---\s*$/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

/**
 * Every non-markdown source file under `src/` and `tests/`, project-relative.
 *
 * Used by the disarm checks that must prove a symbol or module is referenced
 * NOWHERE: an absence claim is only as wide as the set it searched, so this
 * walks both trees in full rather than checking the two files an author
 * happens to remember.
 *
 * @returns {string[]}
 */
function fixtureSources() {
  const out = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const dirent of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, dirent.name);
      if (dirent.isDirectory()) walk(abs);
      else if (dirent.isFile() && /\.(mjs|js|json)$/.test(dirent.name)) out.push(projectRel(abs));
    }
  };
  walk(join(PROJECT, "src"));
  walk(join(PROJECT, "tests"));
  return out;
}

test("the two slices carry the same file kinds, the same headings, and the same task count", () => {
  const [clean, dirty] = SLICES;

  // Non-vacuity: both slices must resolve to real files first. Two empty kind
  // sets compare equal, and two absent documents both outline to `[]`.
  const cleanKinds = sliceKinds(clean);
  const dirtyKinds = sliceKinds(dirty);
  assert.ok(
    cleanKinds.length >= 4 && dirtyKinds.length >= 4,
    "each slice must carry at least spec, plan, lifecycle-log and source-module; " +
      `${clean.name}=${cleanKinds.join(",")} ${dirty.name}=${dirtyKinds.join(",")}`,
  );

  // Dimension 1 — file kinds.
  assert.deepEqual(
    dirtyKinds,
    cleanKinds,
    `slice file-kind parity: ${dirty.name} and ${clean.name} must carry the same artifact ` +
      "kinds. A kind present on one side only lets a rubric score the shape difference " +
      "instead of the planted defect",
  );
  assert.deepEqual(
    cleanKinds.filter((k) => k.startsWith("unclassified:") || k.startsWith("missing:")),
    [],
    "every slice member must classify to a known artifact kind and exist",
  );

  // Dimension 2 — task count. Checked BEFORE the heading outline, and the
  // order is load-bearing rather than stylistic: a plan's task headings are
  // PART of its outline, so a deleted task trips heading parity too. Running
  // the outline first would mask the task-count assertion behind it — it could
  // never be the assertion that reports a dropped task, and no perturbation
  // could reach it. Renaming a non-task heading leaves the count intact and
  // still reaches the outline check below, so neither dimension shadows the
  // other once they are in this order.
  const cleanTasks = planTaskHeadings(readProject(clean.plan));
  const dirtyTasks = planTaskHeadings(readProject(dirty.plan));
  assert.ok(cleanTasks.length > 0, `${clean.plan} declares no \`### Task <n>:\` headings`);
  assert.equal(
    dirtyTasks.length,
    cleanTasks.length,
    `slice task-count parity: ${dirty.plan} declares ${dirtyTasks.length} tasks and ` +
      `${clean.plan} declares ${cleanTasks.length}`,
  );

  // Dimension 3 — section headings, spec against spec and plan against plan.
  for (const doc of ["spec", "plan"]) {
    const cleanOutline = headingOutline(readProject(clean[doc]));
    const dirtyOutline = headingOutline(readProject(dirty[doc]));
    assert.ok(
      cleanOutline.length > 0,
      `${clean[doc]} produced no \`##\`/\`###\` outline to compare against`,
    );
    assert.deepEqual(
      dirtyOutline,
      cleanOutline,
      `slice heading parity (${doc}): ${dirty[doc]} must carry the same section structure as ` +
        `${clean[doc]}, task titles excepted`,
    );
  }
});

test("each of the ten catalog classes cites a file that exists and an anchor occurring exactly once", () => {
  // The count is asserted, never assumed: the Seed Content table is ten pairs,
  // and a class dropped in a later edit would otherwise shrink this test's
  // coverage without changing its verdict.
  assert.equal(CLASSES.length, 10, "Seed Content declares exactly ten violation classes");
  assert.equal(
    new Set(CLASSES.map((c) => c.id)).size,
    10,
    "every class id must be distinct — a repeated id silently drops a class",
  );

  const missingFile = [];
  const badCount = [];
  for (const { id, path, anchor } of CLASSES) {
    if (!pathPresent(join(PROJECT, ...path.split("/")))) {
      missingFile.push(`${id} → ${path}`);
      continue;
    }
    const count = occurrences(readProject(path), anchor);
    if (count !== 1) {
      badCount.push(`${id} → ${path}: anchor "${anchor}" occurs ${count}× (want exactly 1)`);
    }
  }

  assert.deepEqual(missingFile, [], "every catalog class must cite a file that exists");
  assert.deepEqual(
    badCount,
    [],
    "every catalog anchor must occur exactly once in its file — zero means the plant moved or " +
      "was never made, more than one means the citation is ambiguous",
  );
});

test("no planted violation is disarmed by the clean side already satisfying it", () => {
  const specText = readProject(".context-index/specs/features/orders/shipping-rates.spec.md");
  const planText = readProject(".context-index/specs/features/orders/shipping-rates.plan.md");
  const ratesText = readProject("src/shipping/rates.mjs");
  const charterText = readProject(".context-index/specs/features/orders/charter.md");
  const apiText = readProject("docs/api.md");
  const indexText = readProject("src/index.mjs");
  const board = JSON.parse(readProject(".context-index/tasks/tasks.json"));
  const sources = fixtureSources();
  assert.ok(sources.length > 0, "the source walk found no files — every absence check below would be vacuous");

  const disarmed = [];
  const record = (id, holds, why) => {
    if (!holds) disarmed.push(`${id}: ${why}`);
  };

  // 1 — spec-code-drift: the rule the spec states must be ABSENT from the code.
  record(
    "spec-code-drift",
    !ratesText.includes("rounded half up to the nearest whole cent"),
    "src/shipping/rates.mjs implements the rounding rule the spec is supposed to drift from",
  );

  // 2 — stale-spec-frontmatter: the dirty spec's `updated:` must trail its
  // module's recorded change date by more than the fortnight staleness window;
  // the clean twin's must POSTDATE its own slice's last implementation event.
  const specUpdated = Date.parse(/^updated:\s*(\S+)/m.exec(specText)?.[1] ?? "");
  const ratesChanged = Date.parse(/last changed (\d{4}-\d{2}-\d{2})/.exec(ratesText)?.[1] ?? "");
  record(
    "stale-spec-frontmatter",
    Number.isFinite(specUpdated) &&
      Number.isFinite(ratesChanged) &&
      ratesChanged - specUpdated > 14 * 86_400_000,
    "shipping-rates.spec.md `updated:` is not more than 14 days behind rates.mjs",
  );
  const cleanSpecText = readProject(".context-index/specs/features/orders/create-order.spec.md");
  const cleanUpdated = Date.parse(/^updated:\s*(\S+)/m.exec(cleanSpecText)?.[1] ?? "");
  const lastDone = readProject(".context-index/lifecycle-state/create-order.jsonl")
    .split("\n")
    .filter((line) => line.includes('"status":"done"'))
    .map((line) => Date.parse(JSON.parse(line).ts))
    .pop();
  record(
    "stale-spec-frontmatter (twin)",
    Number.isFinite(cleanUpdated) && Number.isFinite(lastDone) && cleanUpdated > lastDone,
    "create-order.spec.md `updated:` does not postdate its own last implementation event",
  );

  // 3 — orphan-source-file: nothing may name the orphan; the twin must be
  // imported by the entry point.
  const namesOrphan = sources.filter(
    (rel) => rel !== "src/orders/orphaned-helper.mjs" && readProject(rel).includes("orphaned-helper"),
  );
  record("orphan-source-file", namesOrphan.length === 0, `named by ${namesOrphan.join(", ")}`);
  record(
    "orphan-source-file (twin)",
    indexText.includes("./shipping/rates.mjs"),
    "src/index.mjs does not import src/shipping/rates.mjs",
  );

  // 4 — dead-export: the symbol may appear in its own module and nowhere else.
  const namesDead = sources.filter(
    (rel) => rel !== "src/shipping/rates.mjs" && readProject(rel).includes("formatLegacyTotal"),
  );
  record("dead-export", namesDead.length === 0, `referenced by ${namesDead.join(", ")}`);

  // 5 — unused-dependency: `ajv` declared and imported by nothing; `nanoid`
  // declared and imported. Only binding lines are searched, so the prose in
  // `src/index.mjs` naming `ajv` as the plant does not read as a use of it.
  const deps = Object.keys(JSON.parse(readProject("package.json")).dependencies ?? {});
  const importersOf = (name) =>
    sources.filter((rel) =>
      readProject(rel)
        .split("\n")
        .filter((line) => /^\s*(import|const|let|var)\b/.test(line))
        .some((line) => new RegExp(`["']${name}["']`).test(line)),
    );
  record(
    "unused-dependency",
    deps.includes("ajv") && importersOf("ajv").length === 0,
    "`ajv` is either undeclared or actually imported",
  );
  record(
    "unused-dependency (twin)",
    deps.includes("nanoid") && importersOf("nanoid").length > 0,
    "`nanoid` is declared but imported by nothing, so both dependencies are unused",
  );

  // 6 — esm-violation: the clean twin must stay pure ESM, or the two modules
  // no longer contrast.
  const cleanModule = readProject("src/orders/create-order.mjs");
  record(
    "esm-violation (twin)",
    !cleanModule.includes("require(") && !cleanModule.includes("module.exports"),
    "src/orders/create-order.mjs is no longer pure ESM",
  );

  // 7 — charter-scope-escape: the escaping capability must be absent from the
  // charter's Capability Map, and the clean spec's capability present in it.
  const mapStart = charterText.indexOf("## Capability Map");
  assert.ok(mapStart >= 0, "orders/charter.md has no ## Capability Map heading to check");
  const afterMap = charterText.slice(mapStart + "## Capability Map".length);
  const nextH2 = afterMap.search(/^## /m);
  const capabilityMap = nextH2 === -1 ? afterMap : afterMap.slice(0, nextH2);
  record(
    "charter-scope-escape",
    charterText.includes("## Capability Map") &&
      !capabilityMap.includes("shipping-rates.spec.md") &&
      !capabilityMap.includes("Calculate a shipping rate"),
    "orders/charter.md charts the shipping-rate capability, so the spec no longer escapes it",
  );
  record(
    "charter-scope-escape (twin)",
    capabilityMap.includes("create-order.spec.md"),
    "orders/charter.md does not chart the create-order capability",
  );

  // 8 — undocumented-public-api: exported from the entry point, absent from the
  // API reference; the twin is exported AND documented.
  record(
    "undocumented-public-api",
    // Must match the RE-EXPORT, not the import: `includes` alone is satisfied by
    // the import line, so dropping calculateRate from `export { ... }` would
    // disarm the plant while this stayed green.
    /^export\s*\{[^}]*\bcalculateRate\b/m.test(indexText) &&
      !apiText.includes("calculateRate"),
    "docs/api.md documents calculateRate, or src/index.mjs no longer exports it",
  );
  record(
    "undocumented-public-api (twin)",
    apiText.includes("createOrder"),
    "docs/api.md no longer documents createOrder",
  );

  // 9 — missing-issue-binding: no Feature work item may reference the dirty
  // spec, and exactly the clean spec must have one.
  const featureIssues = (board.issues ?? []).filter((issue) => issue.type === "feature");
  record(
    "missing-issue-binding",
    !featureIssues.some((i) => String(i.spec_ref ?? "").includes("shipping-rates.spec.md")),
    "a Feature work item binds shipping-rates.spec.md, so the binding is no longer missing",
  );
  record(
    "missing-issue-binding (twin)",
    featureIssues.some((i) => String(i.spec_ref ?? "").includes("create-order.spec.md")),
    "no Feature work item binds create-order.spec.md, so the twin proves nothing",
  );

  // 10 — plan-task-without-test: the named task declares no red-phase step, and
  // every task in the clean plan does.
  const dirtyTask = planTaskSection(planText, 2);
  record(
    "plan-task-without-test",
    dirtyTask !== null && !dirtyTask.includes("Write failing test"),
    "shipping-rates.plan.md Task 2 declares a TDD test expectation after all",
  );
  const cleanPlan = readProject(".context-index/specs/features/orders/create-order.plan.md");
  const cleanTaskNumbers = planTaskHeadings(cleanPlan).map((h) => Number(/Task\s+(\d+):/.exec(h)[1]));
  record(
    "plan-task-without-test (twin)",
    cleanTaskNumbers.length > 0 &&
      cleanTaskNumbers.every((n) =>
        (planTaskSection(cleanPlan, n) ?? "").includes("Write failing test"),
      ),
    "a task in create-order.plan.md declares no TDD test expectation, so the twin is not clean",
  );

  assert.deepEqual(
    disarmed,
    [],
    "a planted violation whose precondition no longer holds is not planted — it scores green " +
      "while measuring nothing",
  );
});

// ---------------------------------------------------------------------------
// Task 6 additions: the fixture README's two operator-facing authoring rules.
//
// Both rules govern how a RUN is prepared, and neither has a runtime host: no
// v1 scenario driver ships, so there is nothing to observe invoking
// `/adev:deploy` or writing a run copy's manifest. What IS checkable today is
// that the fixture's README records each rule — the same checkable-proxy
// pattern the spec prescribes. A pin on the prose is not the property; it is
// the only half of the property that exists before a driver does.
//
// The pins are literal because a rule that survives a reword is not pinned.
// The README states that these sentences are test-pinned, so an editor who
// rewords one is told, by the file itself, that they are changing a test.
//
// No helpers: both tests read one file. Same extension contract as above.
// ---------------------------------------------------------------------------

/** Absolute path to the fixture README — the artifact both rules live in. */
const README = join(FIXTURE, "README.md");

/** The `--dry-run` obligation, verbatim. */
const README_DRY_RUN =
  "Any run of `/adev:deploy` against this fixture passes `--dry-run`.";

/**
 * The disposition for the failure branch the obligation leaves open, verbatim.
 *
 * Separate from the obligation above because the two fail for different
 * reasons: dropping the mode leaves a driver waiting on a human, dropping the
 * disposition leaves an unattended driver with no stated answer for what to do
 * when it is already waiting.
 */
const README_UNANSWERED_MANUAL_STEP =
  "An unanswered manual step is treated as `abort` and reported, never waited on.";

/** The run-copy `tasks.db_path` rule, verbatim — rule AND reason in one sentence. */
const README_DB_PATH_RULE =
  "Whoever prepares a run copy writes `tasks.db_path` as an absolute path inside that copy, because `resolveStorageRoot` returns the value verbatim (`lib/issues/resolve-root.mjs:30`) rather than resolving it against the manifest's directory, so a relative value resolves against the caller's `process.cwd()` — this repository's real board for a driver run from this checkout, letting `/adev:issues` create, claim or close live issues.";

test("the README records the `/adev:deploy --dry-run` obligation and its abort disposition", () => {
  assert.ok(existsSync(README), `expected ${FIXTURE_REL}/README.md to exist`);
  const readme = readFileSync(README, "utf8");

  // Property 5's step-type ban constrains what a step IS. It says nothing
  // about the MODE the pipeline is invoked in, which is the half this pins.
  assert.ok(
    readme.includes(README_DRY_RUN),
    "the README no longer states the --dry-run obligation verbatim — a reword here is a test change",
  );
  assert.ok(
    readme.includes(README_UNANSWERED_MANUAL_STEP),
    "the README no longer states the unanswered-manual-step disposition verbatim — a reword here is a test change",
  );
});

test("the README records the run-copy `tasks.db_path` rule, and the committed manifest declares none", () => {
  assert.ok(existsSync(README), `expected ${FIXTURE_REL}/README.md to exist`);
  const readme = readFileSync(README, "utf8");

  // The rule governs COPIES. It states its reason as well as itself, because a
  // bare "use an absolute path" reads as style and gets simplified back.
  assert.ok(
    readme.includes(README_DB_PATH_RULE),
    "the README no longer states the tasks.db_path run-copy rule verbatim — a reword here is a test change",
  );

  // A different failure entirely: the rule above can be stated perfectly while
  // the COMMITTED manifest carries a `tasks.db_path`, at which point a driver
  // run from this checkout resolves storage to a path this repository declared
  // rather than to one the run copy owns. Property 7 walks the manifest for
  // containment; this reads the key directly, so a change to that walk cannot
  // take this assertion with it.
  const manifestText = readFileSync(join(PROJECT, ".context-index", "manifest.yaml"), "utf8");
  assert.ok(manifestText.includes("tasks:"), "no `tasks:` block — the absence below would be vacuous");
  assert.equal(
    /^\s*db_path\s*:/m.test(manifestText),
    false,
    "`tasks.db_path` must be absent from the committed fixture manifest — the rule governs run copies, not this tree",
  );
});

// ---------------------------------------------------------------------------
// Task 8 additions: the two properties that only a RUN COPY can decide, plus
// the file's two durable falsification artifacts.
//
// Properties 10 and 11 are rules about what a RUN does, not about what the
// committed tree contains, so neither can be decided by reading
// `tests/evals/skill-regression/` in place. Both work against a per-scenario
// copy: one copy per test, never shared, cleaned in a `finally` so a failing
// assertion cannot leave a tree behind that the NEXT run's property 11 then
// reports as a write escape.
//
// The copy is made with `createTempGitRepo()` on purpose. That gives it its own
// git root, which is what makes property 10's non-vacuity check meaningful:
// without a `tasks.db_path`, `resolveStorageRoot` falls through to
// `git rev-parse --git-common-dir` and lands INSIDE the copy anyway, so a bare
// containment assertion would pass on the FALLBACK and prove nothing about the
// field.
//
// Same extension contract as above: helpers first, one `test()` per property,
// zero cross-test state.
// ---------------------------------------------------------------------------

/** Where a run copy's issue board belongs, relative to the copied project root. */
const RUN_COPY_BOARD_REL = join(".context-index", "tasks");

/**
 * Make a fresh run copy of the fixture and write its `tasks.db_path`.
 *
 * ONE copy per scenario — never shared. The copy is a git repo of its own
 * (`createTempGitRepo`), which is what lets property 10 tell a containment
 * decided by the declared field from one decided by the resolver's git
 * fallback.
 *
 * Writing the field is the step the committed tree deliberately omits and a
 * scenario driver must perform, per the fixture README's run-copy rule. It is
 * written TEXTUALLY, into the existing `tasks:` block, so the copy stays a
 * byte-for-byte copy everywhere else.
 *
 * @param {object} [opts]
 * @param {string} [opts.dbPath] Value to declare. Defaults to an ABSOLUTE path
 *   inside the copy — the only correct form, since `resolveStorageRoot`
 *   returns it verbatim. Pass a relative value to model the rejecting case.
 * @returns {{ runRoot: string, projectRoot: string, manifestPath: string, manifest: any }}
 */
function copyFixtureForRun({ dbPath } = {}) {
  const runRoot = createTempGitRepo();
  cpSync(FIXTURE, runRoot, { recursive: true });
  const projectRoot = join(runRoot, "project");
  const manifestPath = join(projectRoot, ".context-index", "manifest.yaml");

  const value = dbPath ?? join(projectRoot, RUN_COPY_BOARD_REL);
  const original = readFileSync(manifestPath, "utf8");
  const patched = original.replace(/^tasks:$/m, `tasks:\n  db_path: ${value}`);
  // A silent no-op replace would hand every caller a manifest with no field,
  // and property 10's non-vacuity check would then compare two fallbacks.
  if (patched === original) {
    throw new Error(`no top-level \`tasks:\` block to patch in ${manifestPath}`);
  }
  writeFileSync(manifestPath, patched);

  const manifest = parseYaml(readFileSync(manifestPath, "utf8"));
  if (manifest?.tasks?.db_path !== value) {
    throw new Error(`the patched manifest did not parse back a tasks.db_path of ${value}`);
  }
  return { runRoot, projectRoot, manifestPath, manifest };
}

/**
 * Every working-tree root this repository owns, main repo first.
 *
 * Anchored at `resolveMainRoot(cwd)` rather than run from `cwd` directly: a
 * `git worktree list` taken from inside some OTHER repository (a temp copy, for
 * instance) answers about that repository and returns a root set that is
 * non-empty, self-consistent, and completely wrong. The main repo is the only
 * vantage point from which the list is the whole list.
 *
 * @param {string} [cwd]
 * @returns {string[]} Absolute paths, as git prints them.
 */
function worktreeRoots(cwd = PLUGIN_ROOT) {
  const out = execFileSync(
    "git",
    ["-C", resolveMainRoot(cwd), "worktree", "list", "--porcelain"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return out
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length).trim());
}

/**
 * The root set is real, not merely non-empty.
 *
 * A comparison over zero roots is equal for the wrong reason, and so is one
 * over a single root that is not ours — property 11's whole claim is about
 * THIS repository's trees.
 *
 * @param {string[]} roots
 */
function assertRootSetIsReal(roots) {
  assert.ok(roots.length > 0, "`git worktree list` enumerated no root — property 11 would be vacuous");
  const here = lenientRealpath(PLUGIN_ROOT);
  assert.ok(
    roots.some((r) => lenientRealpath(r) === here),
    `the enumerated roots must include the worktree this test runs in (${PLUGIN_ROOT}); got: ${roots.join(", ")}`,
  );
}

/**
 * A comparable snapshot of each root's working tree.
 *
 * `--ignored=traditional --untracked-files=all` is what makes a write into a
 * gitignored directory visible; plain `--porcelain` would report nothing for
 * exactly the paths a stray run copy or cache is most likely to land in. The
 * HEAD is captured alongside because a commit changes no status line.
 *
 * @param {string[]} roots
 * @returns {Record<string, string>} Keyed by REALPATHED root.
 */
function captureRepoState(roots) {
  const state = {};
  for (const root of roots) {
    const head = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
    const status = execFileSync(
      "git",
      ["-C", root, "status", "--porcelain", "--ignored=traditional", "--untracked-files=all"],
      { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
    );
    state[lenientRealpath(root)] = `HEAD ${head}\n${status}`;
  }
  return state;
}

/**
 * Which roots changed between two captures, and how.
 *
 * Reports the differing LINES rather than a bare "not equal", so a failure
 * names the file that escaped instead of leaving a reader to diff two
 * multi-thousand-line strings by eye.
 *
 * @param {Record<string, string>} before
 * @param {Record<string, string>} after
 * @returns {string[]} One entry per changed root; empty when nothing moved.
 */
function diffRepoState(before, after) {
  const diffs = [];
  for (const root of Object.keys(before)) {
    if (before[root] === after[root]) continue;
    const beforeLines = new Set(before[root].split("\n"));
    const afterLines = new Set(after[root].split("\n"));
    const added = [...afterLines].filter((l) => l && !beforeLines.has(l));
    const removed = [...beforeLines].filter((l) => l && !afterLines.has(l));
    diffs.push(`${root}: appeared ${JSON.stringify(added)}, vanished ${JSON.stringify(removed)}`);
  }
  return diffs;
}

/**
 * The test files `scripts/run-tests.mjs` would select, as repo-relative paths.
 *
 * Runs the real runner rather than importing `discoverTests`: the bucket claim
 * is about what `npm test` and `npm run test:evals` actually execute, and the
 * argv parsing that maps `--evals` onto a bucket lives in the entry block, not
 * in the exported function.
 *
 * @param {string[]} args Extra flags, e.g. `["--evals"]`.
 * @returns {string[]}
 */
function runTestsList(args) {
  const out = execFileSync(
    "node",
    [join(PLUGIN_ROOT, "scripts", "run-tests.mjs"), ...args, "--list"],
    { cwd: PLUGIN_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

test("hermeticity property 10 — the run copy's board resolves inside the copy, by the field and not by the fallback", () => {
  const run = copyFixtureForRun();
  try {
    // (a) The field is what a driver must write, and it must be ABSOLUTE.
    // `resolveStorageRoot` returns `manifest.tasks.db_path` verbatim
    // (`lib/issues/resolve-root.mjs:30`) rather than resolving it against the
    // manifest's directory, so a relative value is a value resolved against the
    // CALLER's cwd. The rejecting case below is the other half of this.
    const declared = run.manifest.tasks.db_path;
    assert.equal(typeof declared, "string", "the run copy's manifest must declare tasks.db_path");
    assert.equal(isAbsolute(declared), true, `tasks.db_path must be absolute; got ${declared}`);

    // Realpathed on both sides: the macOS temp base is symlinked
    // (`/var` -> `/private/var`), which a raw prefix check fails.
    const copyReal = lenientRealpath(run.runRoot);
    const withField = resolveStorageRoot(run.manifest, run.projectRoot);
    assert.equal(withField, declared, "resolveStorageRoot must return the declared value verbatim");
    assert.equal(
      isContained(lenientRealpath(withField), copyReal),
      true,
      `the resolved board root ${withField} must sit inside the run copy ${run.runRoot}`,
    );

    // (b) Non-vacuity. Without the field the resolver falls back to the copy's
    // own git root, which is ALSO inside the copy — so (a) alone is satisfied by
    // a manifest that declares nothing. The two resolutions must differ, or the
    // rule was never tested.
    const withoutField = resolveStorageRoot(
      { ...run.manifest, tasks: { ...run.manifest.tasks, db_path: undefined } },
      run.projectRoot,
    );
    assert.equal(
      isContained(lenientRealpath(withoutField), copyReal),
      true,
      "sanity: the git fallback also lands inside the copy — this is why (a) alone is not enough",
    );
    assert.notEqual(
      lenientRealpath(withField),
      lenientRealpath(withoutField),
      "the with-field and without-field resolutions are equal, so containment was decided by the " +
        "git fallback and the `tasks.db_path` rule is untested",
    );
  } finally {
    cleanupTempDir(run.runRoot);
  }
});

test("hermeticity property 10 (rejecting) — a relative `tasks.db_path` resolves into THIS repository", () => {
  // A separate copy, per the one-copy-per-scenario rule.
  const run = copyFixtureForRun({ dbPath: ".context-index/tasks" });
  try {
    const declared = run.manifest.tasks.db_path;
    assert.equal(isAbsolute(declared), false, "this scenario requires a RELATIVE declared value");

    // Verbatim return means the value reaches the caller unresolved, and the
    // caller's cwd decides where it lands. A driver run from this checkout has
    // cwd here, so that is the cwd this case models.
    const resolvedByCaller = resolve(
      PLUGIN_ROOT,
      resolveStorageRoot(run.manifest, run.projectRoot),
    );
    assert.equal(
      isContained(lenientRealpath(resolvedByCaller), lenientRealpath(run.runRoot)),
      false,
      "a relative tasks.db_path must NOT be accepted as contained in the run copy",
    );
    // Naming this repository is the point: "not in the copy" is also true of
    // /etc/anything and would not show that the failure mode is a LIVE board.
    assert.equal(
      isContained(lenientRealpath(resolvedByCaller), lenientRealpath(PLUGIN_ROOT)),
      true,
      `a relative tasks.db_path resolves against the caller's cwd — it lands at ${resolvedByCaller}, ` +
        "this repository's own board, where /adev:issues can create, claim or close live issues",
    );
  } finally {
    cleanupTempDir(run.runRoot);
  }
});

test("hermeticity property 11 — copying and loading the fixture writes nothing to any worktree root", () => {
  const roots = worktreeRoots();
  assertRootSetIsReal(roots);

  const before = captureRepoState(roots);
  let run = null;
  try {
    // The work a scenario driver does before it dispatches anything: make the
    // copy, write the board path, and load every config layer through this
    // repository's own loaders.
    run = copyFixtureForRun();
    loadDeployConfig(run.projectRoot);
    loadValidateConfig(run.projectRoot, { pluginRoot: PLUGIN_ROOT });
    loadReviewConfig(run.projectRoot, { pluginRoot: PLUGIN_ROOT });
    resolveStorageRoot(run.manifest, run.projectRoot);
  } finally {
    if (run) cleanupTempDir(run.runRoot);
  }
  const after = captureRepoState(roots);

  assert.deepEqual(
    diffRepoState(before, after),
    [],
    "the copy-and-load wrote into a repository worktree",
  );
});

test("the run copy's manifest declares no `workspace` key", () => {
  // Standalone, not inferred from property 7's path walk: that walk reports
  // path-VALUED leaves and says nothing about key presence, so `workspace: ../..`
  // would be caught there while `workspace: {root: x}` would not be seen at all.
  //
  // The spec phrases this against the FIXTURE manifest; asserting it on the copy
  // is equivalent, because the copy is a byte copy, and it is where the rule
  // bites — a driver reads the copy. Task 2 authored this absence with no
  // falsification of its own; this test's perturbation is its only proof.
  const run = copyFixtureForRun();
  try {
    assert.equal(
      Object.prototype.hasOwnProperty.call(run.manifest, "workspace"),
      false,
      "a `workspace:` key makes the copy resolve state against a parent root outside itself",
    );
    const nested = walkKeys(run.manifest)
      .filter((e) => e.key === "workspace")
      .map((e) => e.keyPath);
    assert.deepEqual(nested, [], "no `workspace` key may appear at any depth of the copy's manifest");
  } finally {
    cleanupTempDir(run.runRoot);
  }
});

test("the run copy's manifest declares `tasks.backend: json`", () => {
  // Asserted on the PARSED value, deliberately: the failure this guards is a
  // copy that names the `beads` backend, and discovering that by watching
  // `execFileSync("br", …)` be attempted means the run has already reached out
  // of the copy, to a binary and a board the fixture does not own. Same
  // provenance as the `workspace` assertion above — Task 2 authored the value,
  // this test's perturbation is its only proof.
  const run = copyFixtureForRun();
  try {
    assert.equal(
      run.manifest?.tasks?.backend,
      "json",
      "the copy's board must be a plain JSON file inside the copy",
    );
  } finally {
    cleanupTempDir(run.runRoot);
  }
});

test("the default test bucket lists both skill-regression guards and no fixture file", () => {
  const listed = runTestsList([]);
  assert.ok(listed.length > 0, "`run-tests.mjs --list` selected nothing — every claim below is vacuous");

  // Half one: the fixture tree is DATA. `tests/evals/**` is the opt-in bucket,
  // so nothing under it may appear in a default `npm test`.
  const fixtureFiles = listed.filter((f) => f.startsWith(`${FIXTURE_REL}/`));
  assert.deepEqual(fixtureFiles, [], "no file under the fixture may run in the default bucket");

  // Half two, and the reason half one is not enough: moving the GUARDS under
  // `tests/evals/` would satisfy half one perfectly while stopping the
  // hermeticity checks from running on `npm test` at all.
  for (const guard of [
    "tests/lib/evals/skill-regression-hermeticity.test.mjs",
    "tests/lib/evals/skill-regression-catalog.test.mjs",
  ]) {
    assert.ok(listed.includes(guard), `${guard} must run in the DEFAULT bucket; it was not listed`);
  }
});

test("the opt-in eval bucket does not list the fixture project's own suite", () => {
  const suiteRel = `${FIXTURE_REL}/project/tests/create-order.test.mjs`;
  // Non-vacuity: the absence below is trivially true of a file that is not on
  // disk, and this one is exactly the kind a later task might relocate.
  assert.ok(
    pathPresent(join(PLUGIN_ROOT, suiteRel)),
    `${suiteRel} must exist for this check to mean anything`,
  );

  const listed = runTestsList(["--evals"]);
  assert.ok(listed.length > 0, "`run-tests.mjs --evals --list` selected nothing");

  // A DIFFERENT mechanism from the default-bucket check above: this one is
  // `isNestedProjectFile` seeing `project/package.json` and classifying
  // `project/tests/` as a nested project's own suite. The `tests/evals/` path
  // rule cannot fire here — `--evals` selects that bucket on purpose — so losing
  // this exclusion starts EXECUTING fixture code inside our runner.
  assert.equal(
    listed.includes(suiteRel),
    false,
    "the fixture project's own suite is test DATA; `--evals` must not execute it",
  );
});

test("createTempGitRepo is callable with no arguments", () => {
  // The shape property 11's capture depends on: every run copy in this file is
  // made by calling it bare. A signature that grew a required parameter would
  // otherwise surface as a confusing failure inside an unrelated property.
  assert.equal(
    createTempGitRepo.length,
    0,
    "createTempGitRepo must declare no required parameter — every caller here invokes it bare",
  );

  const dir = createTempGitRepo();
  try {
    assert.equal(pathPresent(join(dir, ".git")), true, "createTempGitRepo() must produce a git root");
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Durable falsification artifacts.
//
// Both encode a perturbation that would otherwise be a one-time manual check.
// They ship as tests because the properties they falsify are NEGATIVES, and a
// negative nobody has watched go red is a comparison nobody has shown can fail.
// ---------------------------------------------------------------------------

test("falsification artifact — property 11's equality goes RED for a write inside the window", () => {
  const roots = worktreeRoots();
  assertRootSetIsReal(roots);

  // A single gitignored FILE (`*.log`, .gitignore:3), not a directory: nothing
  // has to be created to hold it and nothing pre-existing can be removed with
  // it, so the cleanup below cannot take anything else down with the probe.
  const probe = join(PLUGIN_ROOT, ".hermeticity-probe.log");
  assert.equal(pathPresent(probe), false, `${probe} must not already exist`);

  const before = captureRepoState(roots);
  try {
    writeFileSync(probe, "hermeticity falsification probe\n");
    const observed = diffRepoState(before, captureRepoState(roots));
    assert.notDeepEqual(
      observed,
      [],
      "a file written into this repository did NOT change the captured state — property 11 " +
        "cannot go red, and its silence means nothing",
    );
    // It must go red at THIS worktree, not merely somewhere: a diff produced by
    // a concurrent write in another worktree would satisfy the assertion above.
    assert.ok(
      observed.some((d) => d.startsWith(`${lenientRealpath(PLUGIN_ROOT)}:`)),
      `the probe write must be observed at ${PLUGIN_ROOT}; observed at: ${observed.join(", ")}`,
    );
  } finally {
    rmSync(probe, { force: true });
  }

  assert.deepEqual(
    diffRepoState(before, captureRepoState(roots)),
    [],
    "removing the probe must restore the captured state",
  );
});

test("falsification artifact — property 9's walk rejects a copy whose CLAUDE.md carries an `@`-import", () => {
  const run = copyFixtureForRun();
  try {
    // Clean first: the copy is a byte copy of a tree property 9 passes on, so a
    // walk reporting an escape here would be reporting its own bug.
    assert.deepEqual(
      atImportEscapes(run.projectRoot).escapes,
      [],
      "the untouched copy must pass property 9's walk",
    );

    const claudeMd = join(run.projectRoot, "CLAUDE.md");
    writeFileSync(claudeMd, `${readFileSync(claudeMd, "utf8")}\n@../../../CLAUDE.md\n`);

    const { escapes } = atImportEscapes(run.projectRoot);
    assert.notDeepEqual(
      escapes,
      [],
      "an `@`-import added to the copy's CLAUDE.md did not fail property 9's walk",
    );
    assert.ok(
      escapes.some((e) => e.includes("@../../../CLAUDE.md")),
      `the walk must name the planted import; reported: ${escapes.join(" | ")}`,
    );
  } finally {
    cleanupTempDir(run.runRoot);
  }
});

// ---------------------------------------------------------------------------
// Task 9 — isolation from THIS repository's own tooling.
//
// The fixture is a project tree inside a project tree, so this repo's own
// walkers would otherwise treat its deliberately-planted defects as real
// source. Two properties pin that they do not:
//
//   * `/adev:repomap` (and therefore `/adev:codehealth`, which only consumes
//     repomap output) excludes the fixture — asserted in BOTH directions,
//     declaration and effect.
//   * `/adev:hygiene`'s `source_roots` never reaches into `tests/`.
//
// The effect half runs the real `run()` over a SYNTHETIC root, never over this
// repository: a real run writes `.context-index/hygiene/repo-map.md`, which
// would turn property 11's write-escape equality red in this same suite. The
// synthetic root's exclude list is DERIVED from the real manifest rather than
// hardcoded — otherwise deleting the line from the real manifest would leave
// the effect half passing against a pattern the test supplied itself, which is
// a guard that tests the test.
//
// Same extension contract as above: helpers first, one `test()` per property,
// zero cross-test state.
// ---------------------------------------------------------------------------

/** The glob the root manifest must carry, and the precedent it is spliced beside. */
const FIXTURE_REPOMAP_GLOB = `${FIXTURE_REL}/**`;
const REPOMAP_GLOB_PRECEDENT = "tests/evals/adev-api-eval/dist/**";

/** The exact `hygiene.source_roots` set — `tests/` is absent, verified not assumed. */
const EXPECTED_SOURCE_ROOTS = ["cli/", "hooks/", "lib/", "providers/", "skills/", "templates/"];

/** Absolute path to THIS repository's manifest — the one both halves read. */
const ROOT_MANIFEST = join(PLUGIN_ROOT, ".context-index", "manifest.yaml");

/**
 * This repository's own manifest, parsed.
 *
 * @returns {{ text: string, manifest: any }}
 */
function readRootManifest() {
  const text = readFileSync(ROOT_MANIFEST, "utf8");
  return { text, manifest: parseYaml(text) };
}

/**
 * A synthetic project root carrying the REAL manifest's `repomap.exclude`.
 *
 * Two source files, deliberately: one at an INCLUDED path and one under the
 * fixture's repo-relative path. `run()` has an explicit `sourceFiles.length
 * === 0` branch (`lib/repomap/index.mjs:300`) that writes a symbol-free map —
 * so a root holding only the excluded file would satisfy "the fixture's
 * symbols are absent" because nothing at all was indexed. The included file is
 * what makes the absence mean something.
 *
 * @returns {{ root: string, includedSymbol: string, excludedSymbol: string,
 *   includedRel: string, excludedRel: string, exclude: string[] }}
 */
function buildSyntheticRepomapRoot() {
  const root = createTempDir();
  const exclude = readRootManifest().manifest?.repomap?.exclude;
  assert.ok(
    Array.isArray(exclude) && exclude.length > 0,
    "the real manifest must yield a non-empty repomap.exclude to derive from",
  );

  const excludeLines = exclude.map((pattern) => `    - "${pattern}"`).join("\n");
  writeFixture(root, ".context-index/manifest.yaml", `repomap:\n  exclude:\n${excludeLines}\n`);

  const includedRel = "lib/synthetic-included.mjs";
  const excludedRel = `${FIXTURE_REL}/project/lib/synthetic-excluded.mjs`;
  writeFixture(root, includedRel, "export function syntheticIncludedSymbol() {\n  return 1;\n}\n");
  writeFixture(root, excludedRel, "export function syntheticExcludedSymbol() {\n  return 2;\n}\n");

  return {
    root,
    exclude,
    includedRel,
    excludedRel,
    includedSymbol: "syntheticIncludedSymbol",
    excludedSymbol: "syntheticExcludedSymbol",
  };
}

test("the fixture glob is declared in the root manifest's repomap.exclude, spliced into the existing list", () => {
  const { text, manifest } = readRootManifest();
  const exclude = manifest?.repomap?.exclude;

  assert.ok(Array.isArray(exclude), "the root manifest must declare repomap.exclude as a list");
  assert.ok(
    exclude.includes(FIXTURE_REPOMAP_GLOB),
    `repomap.exclude must contain ${FIXTURE_REPOMAP_GLOB}; got: ${JSON.stringify(exclude)}`,
  );
  // Spliced, not appended as a second block: the precedent entry is still in
  // the SAME list, and the manifest declares exactly one top-level `repomap:`.
  assert.ok(
    exclude.includes(REPOMAP_GLOB_PRECEDENT),
    `the ${REPOMAP_GLOB_PRECEDENT} precedent must remain in the same list; got: ${JSON.stringify(exclude)}`,
  );
  const repomapKeys = text.split("\n").filter((line) => /^repomap:\s*$/.test(line));
  assert.equal(
    repomapKeys.length,
    1,
    "the manifest must declare exactly one top-level `repomap:` block — a second block is a standalone splice",
  );
});

test("the declared exclusion actually excludes — an included sibling is indexed and the fixture path is not", async () => {
  const synthetic = buildSyntheticRepomapRoot();
  try {
    // The mode argument is a STRING. `run(root, {...})` falls through to the
    // `else` branch and probes for tree-sitter, which on a machine that has it
    // installed silently runs a different parser and writes different files.
    await run(synthetic.root, "regex");

    const mapPath = join(synthetic.root, ".context-index", "hygiene", "repo-map.md");
    assert.ok(existsSync(mapPath), `repomap wrote no map at ${mapPath}`);
    const map = readFileSync(mapPath, "utf8");

    // Present half — the root was not empty, so the absence below is real.
    assert.ok(
      map.includes(synthetic.includedSymbol),
      `the included file's symbol must appear in the map; got:\n${map}`,
    );
    assert.ok(
      map.includes(synthetic.includedRel),
      `the included file's path must appear in the map; got:\n${map}`,
    );

    // Absent half — the exclusion, derived from the real manifest, took effect.
    assert.ok(
      !map.includes(synthetic.excludedSymbol),
      `the fixture path's symbol must be excluded from the map; got:\n${map}`,
    );
    assert.ok(
      !map.includes(FIXTURE_REL),
      `no path under ${FIXTURE_REL} may appear in the map; got:\n${map}`,
    );
  } finally {
    cleanupTempDir(synthetic.root);
  }
});

test("hygiene.source_roots is exactly the six source directories and never reaches into tests/", () => {
  const { manifest } = readRootManifest();
  const roots = manifest?.hygiene?.source_roots;

  assert.ok(Array.isArray(roots), "the root manifest must declare hygiene.source_roots as a list");
  assert.deepEqual(
    [...roots].sort(),
    [...EXPECTED_SOURCE_ROOTS].sort(),
    `hygiene.source_roots must be exactly ${JSON.stringify(EXPECTED_SOURCE_ROOTS)}; got: ${JSON.stringify(roots)}`,
  );
  assert.ok(
    !roots.some((entry) => entry.split("/")[0] === "tests"),
    `hygiene.source_roots must not reach into tests/; got: ${JSON.stringify(roots)}`,
  );
});
