/**
 * issue-564 — end-to-end coverage of `specs-touched` in the post-commit
 * capture, exercised against a real temp git repo and the real hook script.
 *
 * Companion unit coverage of the derivation itself lives in
 * `tests/lib/session-summary-specs-touched.test.mjs`.
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "child_process";
import { readdirSync, readFileSync, existsSync, writeFileSync, symlinkSync } from "fs";
import { join } from "path";
import { createTempGitRepo, cleanupTempDir, writeFixture, runGitHook, PLUGIN_ROOT } from "../helpers.mjs";
import { readSummary } from "../../lib/session-summary.mjs";

const SPEC_A = ".context-index/specs/features/alpha/one.spec.md";
const SPEC_B = ".context-index/specs/features/beta/two.spec.md";

describe("post-commit git hook — specs-touched derivation (issue-564)", () => {
  let gitDir;

  afterEach(() => {
    if (gitDir) cleanupTempDir(gitDir);
    gitDir = undefined;
  });

  // Same wiring as tests/hooks/post-commit-self-skip.test.mjs: the hook's node
  // block resolves `./lib/session-summary.mjs` relative to cwd, so symlink the
  // plugin's lib/ in and keep it (plus the post-commit-mode manifest and the
  // scratch commit-message file) out of `git add -A`, which would otherwise put
  // them in `git diff-tree HEAD` output.
  function setupHookEnv(dir) {
    symlinkSync(join(PLUGIN_ROOT, "lib"), join(dir, "lib"), "dir");
    writeFileSync(
      join(dir, ".git", "info", "exclude"),
      ["lib", ".context-index/manifest.yaml", ".commit-msg", ""].join("\n"),
    );
    writeFixture(
      dir,
      ".context-index/manifest.yaml",
      [
        "project:",
        "  name: test",
        "integrations:",
        "  session_capture:",
        "    capture: post-commit",
        "    gitignored: false",
        "",
      ].join("\n"),
    );
  }

  /**
   * Stage `files`, then commit with a message built from `subject` and the
   * given `Spec:` trailer values (one trailer line each, verbatim).
   * The message file is written AFTER staging so it never enters the commit.
   */
  function commitWithTrailers(dir, files, subject, specTrailers = []) {
    for (const [relPath, content] of Object.entries(files)) {
      writeFixture(dir, relPath, content);
    }
    execSync("git add -A", { cwd: dir, stdio: "ignore" });

    const lines = [subject, ""];
    for (const value of specTrailers) lines.push(`Spec: ${value}`);
    const messageFile = join(dir, ".commit-msg");
    writeFileSync(messageFile, lines.join("\n") + "\n");
    execSync(`git commit -F "${messageFile}"`, { cwd: dir, stdio: "ignore" });
  }

  function captureFiles(dir) {
    const sessionsDir = join(dir, ".context-index", "sessions");
    if (!existsSync(sessionsDir)) return [];
    return readdirSync(sessionsDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => join(sessionsDir, f));
  }

  /** The single capture written by this run, as { raw, frontmatterLine, specsTouched }. */
  async function readCapture(dir) {
    const files = captureFiles(dir);
    assert.equal(files.length, 1, "exactly one capture file should be written");
    const raw = readFileSync(files[0], "utf8");
    const line = raw.split("\n").find((l) => l.startsWith("specs-touched:"));
    assert.ok(line !== undefined, "capture must carry a specs-touched key");
    const parsed = await readSummary(files[0]);
    return { raw, frontmatterLine: line, specsTouched: parsed.metadata.specsTouched };
  }

  /** Assert the YAML frontmatter fence opens and closes exactly once. */
  function assertFrontmatterTerminates(raw) {
    const lines = raw.split("\n");
    assert.equal(lines[0], "---", "frontmatter must open on line 1");
    const closeIdx = lines.indexOf("---", 1);
    assert.ok(closeIdx > 0, "frontmatter block must terminate with a closing ---");
    for (const line of lines.slice(1, closeIdx)) {
      assert.match(line, /^[a-z][a-z0-9-]*:/, `frontmatter line must be a key: ${JSON.stringify(line)}`);
    }
  }

  // ── Defect 1: derivation gap ──────────────────────────────────────────────

  it("populates specs-touched from a changed spec file with NO Spec: trailer", async () => {
    gitDir = createTempGitRepo({ branch: "feat/test" });
    setupHookEnv(gitDir);
    commitWithTrailers(
      gitDir,
      { [SPEC_A]: "# One\n", "src/index.mjs": "export const a = 1;\n" },
      "feat(alpha): add the one spec",
      [], // deliberately no trailer — this is the 85%-empty case
    );

    const { exitCode } = runGitHook("post-commit", { cwd: gitDir });
    assert.equal(exitCode, 0);

    const { specsTouched } = await readCapture(gitDir);
    assert.deepEqual(specsTouched, [SPEC_A]);
  });

  it("unions a Spec: trailer with the changed spec path without duplicating it", async () => {
    gitDir = createTempGitRepo({ branch: "feat/test" });
    setupHookEnv(gitDir);
    commitWithTrailers(
      gitDir,
      { [SPEC_A]: "# One\n", [SPEC_B]: "# Two\n" },
      "feat(alpha): two specs",
      [SPEC_A], // trailer duplicates one of the changed paths
    );

    const { exitCode } = runGitHook("post-commit", { cwd: gitDir });
    assert.equal(exitCode, 0);

    const { specsTouched } = await readCapture(gitDir);
    assert.deepEqual(specsTouched, [SPEC_A, SPEC_B], "union, de-duplicated");
  });

  it("still records a spec DELETED by the commit", async () => {
    gitDir = createTempGitRepo({ branch: "feat/test" });
    setupHookEnv(gitDir);
    commitWithTrailers(gitDir, { [SPEC_A]: "# One\n" }, "feat(alpha): add spec", []);
    runGitHook("post-commit", { cwd: gitDir });

    // Wipe the captures from the setup commit so readCapture sees only the
    // capture under test.
    for (const f of captureFiles(gitDir)) execSync(`rm "${f}"`, { cwd: gitDir });

    execSync(`git rm -q "${SPEC_A}"`, { cwd: gitDir, stdio: "ignore" });
    execSync('git commit -q -m "chore(alpha): drop the spec"', { cwd: gitDir, stdio: "ignore" });

    const { exitCode } = runGitHook("post-commit", { cwd: gitDir });
    assert.equal(exitCode, 0);

    const { specsTouched } = await readCapture(gitDir);
    assert.deepEqual(specsTouched, [SPEC_A], "a deleted spec was still touched");
  });

  // ── Defect 2: count integrity ─────────────────────────────────────────────

  it("a Spec: trailer containing a comma cannot fabricate a second entry", async () => {
    gitDir = createTempGitRepo({ branch: "feat/test" });
    setupHookEnv(gitDir);
    // Two trailers: one legitimate, one whose single value contains a comma.
    // Pre-fix the hook joined trailers with `,` and re-split on `,`, turning
    // these TWO trailers into THREE entries. Exactly one is valid.
    commitWithTrailers(
      gitDir,
      { "src/index.mjs": "export const a = 1;\n" },
      "feat(core): comma trailer",
      [`${SPEC_B},${SPEC_B}`, SPEC_A],
    );

    const { exitCode } = runGitHook("post-commit", { cwd: gitDir });
    assert.equal(exitCode, 0);

    const { specsTouched } = await readCapture(gitDir);
    assert.equal(specsTouched.length, 1, "one valid trailer in → exactly one entry out");
    assert.deepEqual(specsTouched, [SPEC_A]);
  });

  it("preserves the entry count for multiple distinct Spec: trailers", async () => {
    gitDir = createTempGitRepo({ branch: "feat/test" });
    setupHookEnv(gitDir);
    commitWithTrailers(
      gitDir,
      { "src/index.mjs": "export const a = 1;\n" },
      "feat(core): two trailers",
      [SPEC_A, SPEC_B],
    );

    const { exitCode } = runGitHook("post-commit", { cwd: gitDir });
    assert.equal(exitCode, 0);

    const { specsTouched } = await readCapture(gitDir);
    assert.deepEqual(specsTouched, [SPEC_A, SPEC_B]);
  });

  it("a folded (multi-line) Spec: trailer stays one candidate", async () => {
    gitDir = createTempGitRepo({ branch: "feat/test" });
    setupHookEnv(gitDir);
    for (const [relPath, content] of Object.entries({ "src/index.mjs": "export const a = 1;\n" })) {
      writeFixture(gitDir, relPath, content);
    }
    execSync("git add -A", { cwd: gitDir, stdio: "ignore" });
    // A continuation line (leading whitespace) folds into the previous trailer.
    writeFileSync(
      join(gitDir, ".commit-msg"),
      ["feat(core): folded trailer", "", `Spec: ${SPEC_B}`, "  continued", ""].join("\n"),
    );
    execSync('git commit -F ".commit-msg"', { cwd: gitDir, stdio: "ignore" });

    const { exitCode } = runGitHook("post-commit", { cwd: gitDir });
    assert.equal(exitCode, 0);

    const { specsTouched, raw } = await readCapture(gitDir);
    assertFrontmatterTerminates(raw);
    assert.deepEqual(specsTouched, [], "the folded value is one malformed candidate, not two entries");
  });

  // ── Defect 2/3 interaction: YAML-hostile trailer values ───────────────────

  it("a Spec: trailer containing ] and \" yields well-formed, terminated frontmatter", async () => {
    gitDir = createTempGitRepo({ branch: "feat/test" });
    setupHookEnv(gitDir);
    const hostile = `${SPEC_B}", "injected.spec.md] evil: true`;
    commitWithTrailers(
      gitDir,
      { [SPEC_A]: "# One\n" },
      "feat(alpha): hostile trailer",
      [hostile],
    );

    const { exitCode } = runGitHook("post-commit", { cwd: gitDir });
    assert.equal(exitCode, 0);

    const { raw, frontmatterLine, specsTouched } = await readCapture(gitDir);
    assertFrontmatterTerminates(raw);
    // Containment drops the hostile candidate entirely; the legitimately
    // changed spec still lands.
    assert.deepEqual(specsTouched, [SPEC_A]);
    assert.ok(
      !frontmatterLine.includes("evil: true"),
      "no attacker-authored key may appear on the specs-touched line",
    );
    assert.ok(
      !raw.split("\n").some((l) => l.startsWith("evil:")),
      "no attacker-authored key may be injected into the frontmatter block",
    );
  });

  // ── Defect 3: containment ─────────────────────────────────────────────────

  const hostilePaths = [
    ["absolute", "/etc/passwd.spec.md"],
    ["parent traversal", "../../elsewhere/.context-index/specs/x.spec.md"],
    ["embedded traversal", ".context-index/specs/../../.git/hooks/evil.spec.md"],
    ["neither .. nor leading / (deny-list bypass)", ".git/hooks/x"],
    ["non-.spec.md under the specs root", ".context-index/specs/features/alpha/one.plan.md"],
    ["prefix-colliding sibling dir", ".context-index/specs-archive/old.spec.md"],
  ];

  for (const [label, hostile] of hostilePaths) {
    it(`drops a ${label} Spec: trailer and still exits 0`, async () => {
      gitDir = createTempGitRepo({ branch: "feat/test" });
      setupHookEnv(gitDir);
      commitWithTrailers(
        gitDir,
        { "src/index.mjs": "export const a = 1;\n" },
        "feat(core): hostile path",
        [hostile],
      );

      const { exitCode } = runGitHook("post-commit", { cwd: gitDir });
      assert.equal(exitCode, 0, "a capture failure must never fail someone's commit");

      const { raw, frontmatterLine, specsTouched } = await readCapture(gitDir);
      assertFrontmatterTerminates(raw);
      assert.deepEqual(specsTouched, [], `${label} must not reach specs-touched`);
      assert.equal(frontmatterLine, "specs-touched: []");
    });
  }

  it("drops a non-.spec.md CHANGED path under the specs root", async () => {
    gitDir = createTempGitRepo({ branch: "feat/test" });
    setupHookEnv(gitDir);
    commitWithTrailers(
      gitDir,
      {
        ".context-index/specs/features/alpha/one.plan.md": "# plan\n",
        ".context-index/specs/features/alpha/one.routing.json": "{}\n",
      },
      "chore(alpha): plan artifacts only",
      [],
    );

    const { exitCode } = runGitHook("post-commit", { cwd: gitDir });
    assert.equal(exitCode, 0);

    const { specsTouched } = await readCapture(gitDir);
    assert.deepEqual(specsTouched, []);
  });

  // ── The empty case is correct, not an anomaly ─────────────────────────────

  it("yields an empty specs-touched with no warning when nothing spec-related is touched", async () => {
    gitDir = createTempGitRepo({ branch: "feat/test" });
    setupHookEnv(gitDir);
    commitWithTrailers(
      gitDir,
      { "src/index.mjs": "export const a = 1;\n", "README.md": "# hi\n" },
      "chore(core): no specs here",
      [],
    );

    const { exitCode, stderr, stdout } = runGitHook("post-commit", { cwd: gitDir });
    assert.equal(exitCode, 0);
    assert.equal(stderr.trim(), "", "an empty specs-touched must produce no diagnostic");
    assert.equal(stdout.trim(), "");

    const { frontmatterLine, specsTouched, raw } = await readCapture(gitDir);
    assertFrontmatterTerminates(raw);
    assert.deepEqual(specsTouched, []);
    assert.equal(frontmatterLine, "specs-touched: []");
  });
});
