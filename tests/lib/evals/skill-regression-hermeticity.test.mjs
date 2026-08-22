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
 *   present: 1, 2, 3, 4 (Task 1) and 5, 7 (Task 2)
 *   pending: 6, 9 (Task 3), 10, 11 (Task 8)
 *
 * A pending property is deliberately ABSENT rather than stubbed: a stubbed
 * property reads as covered.
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
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import { PLUGIN_ROOT } from "../../helpers.mjs";
import { parseYaml } from "../../../lib/profiles/yaml.mjs";
import { globToRegExp } from "../../../lib/hygiene/test-debt.mjs";
import { isContained, lenientRealpath } from "../../../lib/path-safety.mjs";
import { loadDeployConfig } from "../../../lib/deploy.mjs";
import { loadValidateConfig } from "../../../lib/governance/validate-config.mjs";
import { loadReviewConfig } from "../../../lib/governance/review-config.mjs";
import { MARKED_REGISTRIES, readMarker } from "../../../lib/governance/registry-marker.mjs";

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
