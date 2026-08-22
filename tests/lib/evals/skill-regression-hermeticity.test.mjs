/**
 * Hermeticity guard for the committed skill-regression fixture.
 *
 * The fixture is a mini-project at `tests/evals/skill-regression/`. It is test
 * DATA for an opt-in eval bucket (`npm run test:evals`), but THIS file lives
 * under `tests/lib/**`, which `scripts/run-tests.mjs` puts in the DEFAULT
 * bucket. That asymmetry is deliberate: the guard runs on every `npm test`
 * even though the fixture it guards does not.
 *
 * One `test()` per property. The numbers (1, 2, 3, 4, 8) are the Hermeticity
 * Rules row numbers from the spec — keep them stable so a reader can map a
 * test to a spec row without a translation table. Properties 5, 6, 7, 9 are
 * owned by later tasks and are deliberately ABSENT rather than stubbed: a
 * stubbed property reads as covered.
 *
 * Extension contract for later tasks: add helpers at the top, add a `test()`
 * per new property, keep zero cross-test state.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { PLUGIN_ROOT } from "../../helpers.mjs";
import { parseYaml } from "../../../lib/profiles/yaml.mjs";
import { globToRegExp } from "../../../lib/hygiene/test-debt.mjs";

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
