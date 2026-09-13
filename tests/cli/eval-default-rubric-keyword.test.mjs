// tests/cli/eval-default-rubric-keyword.test.mjs
//
// BEH-11: `--rubric default` is a KEYWORD naming the plugin's shipped
// skills/eval/references/default-rubric.yaml, not a path. It resolves against the plugin
// root — derived from `getPluginRoot()` in lib/profiles/index.mjs, which reads
// its own `__dirname` — and is never containment-checked against the project
// root. Every other --rubric value stays a path, contained per BEH-9.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PLUGIN_ROOT, createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

const ENTRYPOINT = join(PLUGIN_ROOT, "cli", "index.mjs");

/**
 * Spawn the CLI entrypoint on `adev eval score`, capturing a non-zero exit
 * instead of throwing. Same shape as tests/cli/eval-score.test.mjs's runVerb;
 * the absolute entrypoint lets `cwd` name a project root that is not the
 * plugin root, which is what makes the keyword branch observable.
 *
 * @param {string} entrypoint - absolute path to the cli/index.mjs to spawn;
 *   a temp plugin copy's entrypoint makes getPluginRoot() name that copy.
 * @param {string[]} args
 * @param {object} [opts] - execFileSync options; `cwd` sets the project root.
 * @returns {{code: number, stdout: string, stderr: string}}
 */
const runVerbFrom = (entrypoint, args, opts = {}) => {
  try {
    const stdout = execFileSync(process.execPath, [entrypoint, "eval", "score", ...args],
      { encoding: "utf8", ...opts });
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    return { code: err.status, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
};

const runVerb = (args, opts = {}) => runVerbFrom(ENTRYPOINT, args, opts);

const VERDICTS_REL = "verdicts.json";
const VERDICTS_SOURCE = readFileSync(
  join(PLUGIN_ROOT, "tests", "fixtures", "evals", "verdicts", "default-rubric-complete.json"),
  "utf8",
);

/**
 * Create a project root that is NOT the plugin root, carrying a verdict set
 * whose ids match every id the SHIPPED default rubric declares (so a
 * successful score cannot be confused with SCORE_MISSING_VERDICT).
 *
 * @returns {string} absolute path to the temp project root
 */
function makeProjectRoot() {
  const dir = createTempDir();
  writeFixture(dir, VERDICTS_REL, VERDICTS_SOURCE);
  return dir;
}

/**
 * Copy the minimum plugin tree the CLI entrypoint needs to boot into `dest`:
 * cli/, lib/, providers/ (imported by lib/provider/registry.mjs at load),
 * .claude-plugin/ (read by providers/claude-code/adapter.mjs at load), and
 * package.json. Deliberately omits skills/, so `getPluginRoot()` resolved
 * from this copy names a tree with no shipped rubric unless a test puts one
 * there itself.
 *
 * @param {string} dest - absolute path of the temp plugin copy
 */
function copyPluginRuntime(dest) {
  for (const entry of ["cli", "lib", "providers", ".claude-plugin"]) {
    cpSync(join(PLUGIN_ROOT, entry), join(dest, entry), { recursive: true });
  }
  cpSync(join(PLUGIN_ROOT, "package.json"), join(dest, "package.json"));
}

test("--rubric default resolves the shipped rubric from a project root that is not the plugin root", () => {
  const projectRoot = makeProjectRoot();
  try {
    const { code, stdout, stderr } = runVerb(
      ["--rubric", "default", "--input", VERDICTS_REL, "--json"],
      { cwd: projectRoot },
    );
    assert.equal(code, 0, `expected a successful score, got exit ${code}: ${stderr}`);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.verdicts.length, 11,
      "the shipped rubric declares six required_elements and five quality_dimensions");
    assert.ok(parsed.verdicts.some((v) => v.id === "no_debug_residue"),
      "an id unique to the shipped rubric proves the shipped file was the one loaded");
  } finally {
    cleanupTempDir(projectRoot);
  }
});

test("a project root outside the plugin root does not make the default keyword unsafe", () => {
  const projectRoot = makeProjectRoot();
  try {
    const { code, stderr } = runVerb(
      ["--rubric", "default", "--input", VERDICTS_REL],
      { cwd: projectRoot },
    );
    assert.doesNotMatch(stderr, /UNSAFE_SCORE_PATH/,
      "`default` is a keyword naming a known location, never a path to contain");
    assert.equal(code, 0, `expected a successful score, got exit ${code}: ${stderr}`);
  } finally {
    cleanupTempDir(projectRoot);
  }
});

test("a non-default --rubric value is still contained against the project root", () => {
  const projectRoot = makeProjectRoot();
  try {
    const { code, stderr } = runVerb(
      ["--rubric", "../../etc/passwd", "--input", VERDICTS_REL],
      { cwd: projectRoot },
    );
    assert.notEqual(code, 0);
    assert.match(stderr, /UNSAFE_SCORE_PATH/, "BEH-9 containment is unchanged for every path value");
    assert.match(stderr, /\.\.\/\.\.\/etc\/passwd/, "the offending path is reported verbatim");
  } finally {
    cleanupTempDir(projectRoot);
  }
});

test("the verb module reads no environment variable at all", () => {
  const source = readFileSync(join(PLUGIN_ROOT, "lib", "cli", "eval.mjs"), "utf8");
  assert.doesNotMatch(
    source,
    /process\.env/,
    "BEH-11 forbids deriving the plugin root from a caller-settable environment variable " +
    "such as CLAUDE_PLUGIN_ROOT. This is asserted over the whole file, not one code path, " +
    "so a later refactor cannot add a second env-reading branch beside the __dirname-derived one.",
  );
});

test("SCORE_DEFAULT_RUBRIC_MISSING fires when the shipped rubric file is absent", () => {
  // A plugin copy carrying cli/ and lib/ but deliberately NOT
  // skills/eval/references/default-rubric.yaml. Spawning ITS entrypoint makes
  // getPluginRoot() — which derives from its own module's location on
  // disk — name a tree where the shipped rubric does not exist.
  const pluginCopy = createTempDir();
  const projectRoot = makeProjectRoot();
  try {
    copyPluginRuntime(pluginCopy);

    const { code, stderr } = runVerbFrom(
      join(pluginCopy, "cli", "index.mjs"),
      ["--rubric", "default", "--input", VERDICTS_REL],
      { cwd: projectRoot },
    );
    assert.notEqual(code, 0);
    assert.match(stderr, /SCORE_DEFAULT_RUBRIC_MISSING/);
    assert.match(stderr, /default-rubric\.yaml/, "the message names the path it looked for");
  } finally {
    cleanupTempDir(pluginCopy);
    cleanupTempDir(projectRoot);
  }
});

test("SCORE_DEFAULT_RUBRIC_MISSING also fires when the shipped rubric exists but cannot be read", () => {
  // The spec's Error Cases row names "absent OR UNREADABLE" as one input
  // carrying one code. Here the shipped rubric IS present in the plugin copy
  // and only the read can fail, so this case cannot pass via the absent path.
  const pluginCopy = createTempDir();
  const projectRoot = makeProjectRoot();
  const shipped = join(pluginCopy, "skills", "eval", "references", "default-rubric.yaml");
  try {
    copyPluginRuntime(pluginCopy);
    mkdirSync(join(pluginCopy, "skills", "eval", "references"), { recursive: true });
    cpSync(join(PLUGIN_ROOT, "skills", "eval", "references", "default-rubric.yaml"), shipped);
    chmodSync(shipped, 0o000);

    const { code, stderr } = runVerbFrom(
      join(pluginCopy, "cli", "index.mjs"),
      ["--rubric", "default", "--input", VERDICTS_REL],
      { cwd: projectRoot },
    );
    assert.notEqual(code, 0);
    assert.match(stderr, /SCORE_DEFAULT_RUBRIC_MISSING/);
    assert.match(stderr, /default-rubric\.yaml/, "the message names the resolved plugin path");
  } finally {
    // Restore the mode BEFORE cleanup — rmSync cannot remove a 0o000 file.
    chmodSync(shipped, 0o644);
    cleanupTempDir(pluginCopy);
    cleanupTempDir(projectRoot);
  }
});
