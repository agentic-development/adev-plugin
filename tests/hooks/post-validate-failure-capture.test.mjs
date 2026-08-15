/**
 * Validate failure capture — the validate Stop hook.
 *
 * Spec: .context-index/specs/features/heuristics/failure-capture.spec.md
 *
 * Task 3 scope: the heuristic title prefix is derived from the validate
 * outcome (`prefixFor(verdict.overall)`) instead of being interpolated inline
 * at the title site. PASS output must stay byte-identical to the previous
 * hardcoded form, and every non-PASS verdict must still return early without
 * writing — Task 4 changes that, and these tests pin the current behavior so
 * its RED phase is real.
 *
 * Hook protocol (constitution principle 4): stdout is the protocol channel,
 * warnings go to stderr, and the process always exits 0.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PLUGIN_ROOT, createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

const HOOK = join(PLUGIN_ROOT, "hooks", "post-validate-extract-heuristics.mjs");

const SPEC_REL = ".context-index/specs/features/validation/validate-config-single-source.spec.md";
const REPORT_REL = ".context-index/specs/features/validation/validate-config-single-source.validate.md";
const SPEC_TITLE = "Validate config single source";

let roots = [];

beforeEach(() => {
  roots = [];
});

afterEach(() => {
  for (const r of roots) cleanupTempDir(r);
});

/**
 * Build a temp project root containing the spec fixture. The root is
 * registered for cleanup immediately, so a throw inside `writeFixture` cannot
 * leak the directory.
 */
function newProject() {
  const root = createTempDir();
  roots.push(root);
  writeFixture(root, SPEC_REL, `---\ncharter: validation\n---\n\n# Live Spec: ${SPEC_TITLE}\n`);
  return root;
}

/**
 * Drive the Stop hook with verdict metadata on stdin.
 *
 * Mirrors tests/hooks/post-validate-heuristic-id.test.mjs. `checks` is
 * included in the payload only when supplied, so a caller that does not care
 * about per-check detail gets exactly the metadata the hook has always seen.
 */
function runHookWith({
  projectRoot,
  specPath = SPEC_REL,
  overall = "PASS",
  specTitle = SPEC_TITLE,
  checks,
  env = {},
} = {}) {
  const verdictMetadata = {
    overall,
    spec_path: specPath,
    charter: "validation",
    spec_title: specTitle,
    report_path: REPORT_REL,
  };
  if (checks !== undefined) verdictMetadata.checks = checks;

  const result = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: "adev:validate", tool_result: { verdict_metadata: verdictMetadata } }),
    encoding: "utf8",
    cwd: projectRoot,
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
      CLAUDE_PROJECT_ROOT: projectRoot,
      ...env,
    },
    timeout: 20_000,
  });

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function storePath(projectRoot, scope = "validation") {
  return join(projectRoot, ".context-index", "memory", "heuristics", `${scope}.md`);
}

/** Read the stored titles out of a scope file, in on-disk order. */
function storedTitles(projectRoot, scope = "validation") {
  const file = storePath(projectRoot, scope);
  const raw = existsSync(file) ? readFileSync(file, "utf8") : "";
  return [...raw.matchAll(/^title:[ \t]*(.*)$/gm)].map((m) => m[1]);
}

// ── The PASS prefix is derived from the outcome ──────────────────────────

describe("validate Stop hook — the title prefix is derived from the outcome", () => {
  it("the PASS title prefix is derived from verdict.overall, not hardcoded", () => {
    const root = newProject();
    const r = runHookWith({ projectRoot: root, overall: "PASS" });
    assert.equal(r.exitCode, 0, r.stderr);

    const titles = storedTitles(root);
    assert.equal(titles.length, 1, `expected one entry, got ${JSON.stringify(titles)} — ${r.stderr}`);
    assert.match(titles[0], /^First-run PASS: /);
  });

  it("the prefix derivation is a function of the outcome", () => {
    const src = readFileSync(HOOK, "utf8");
    assert.ok(
      !/`First-run PASS: \$\{/.test(src),
      "the prefix must not be interpolated inline at the title site",
    );
    assert.match(src, /function prefixFor\s*\(/);
  });

  it("prefixFor('PASS') output is byte-identical to the previous hardcoded form", () => {
    const root = newProject();
    const r = runHookWith({ projectRoot: root, overall: "PASS" });
    assert.equal(r.exitCode, 0, r.stderr);

    assert.deepEqual(storedTitles(root), [`First-run PASS: ${SPEC_TITLE}`]);
  });

  it("the 120-char cap truncation semantics are unchanged for a long spec title", () => {
    const root = newProject();
    // "First-run PASS: " is 16 chars; 150 X's overflows the 120-char cap, so
    // cap() keeps the first 117 chars and appends "...".
    const r = runHookWith({ projectRoot: root, overall: "PASS", specTitle: "X".repeat(150) });
    assert.equal(r.exitCode, 0, r.stderr);

    const expected = `First-run PASS: ${"X".repeat(101)}...`;
    assert.equal(expected.length, 120, "the expectation itself must sit exactly at the cap");
    assert.deepEqual(storedTitles(root), [expected]);
  });
});

// ── Non-PASS verdicts still return early (Task 4 changes this) ───────────

describe("validate Stop hook — non-PASS verdicts write nothing (pre-Task-4 behavior)", () => {
  it("a FAIL verdict writes no entry and exits 0", () => {
    const root = newProject();
    const r = runHookWith({ projectRoot: root, overall: "FAIL" });

    assert.equal(r.exitCode, 0, "capture is non-blocking — the hook still exits 0");
    assert.equal(existsSync(storePath(root)), false, "no entry may be written on FAIL");
    assert.equal(r.stdout, "", "stdout is the hook protocol channel");
  });

  it("an outcome that is neither PASS nor FAIL writes no entry and exits 0", () => {
    const root = newProject();
    const r = runHookWith({ projectRoot: root, overall: "BLOCK" });

    assert.equal(r.exitCode, 0);
    assert.equal(existsSync(storePath(root)), false, "no entry may be written on BLOCK");
    assert.equal(r.stdout, "");
  });
});

// ── Hook protocol invariants across every path exercised ─────────────────

describe("validate Stop hook — protocol invariants", () => {
  it("exits 0 with empty stdout on the PASS path", () => {
    const root = newProject();
    const r = runHookWith({ projectRoot: root, overall: "PASS" });
    assert.equal(r.exitCode, 0, r.stderr);
    assert.equal(r.stdout, "");
  });

  it("exits 0 with empty stdout on the long-title PASS path", () => {
    const root = newProject();
    const r = runHookWith({ projectRoot: root, overall: "PASS", specTitle: "X".repeat(150) });
    assert.equal(r.exitCode, 0, r.stderr);
    assert.equal(r.stdout, "");
  });
});
