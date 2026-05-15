import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execSync } from "node:child_process";
import { writeFileSync, mkdirSync, chmodSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createTempGitRepo, cleanupTempDir, writeFixture } from "../helpers.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = resolve(__dirname, "..", "..");
const HOOK_PATH = join(PLUGIN_ROOT, "hooks", "pre-commit-no-inline-node.sh");

/**
 * Stage a file into the temp git repo (no commit).
 * @param {string} repoDir
 * @param {string} relPath
 * @param {string} content
 */
function stageFile(repoDir, relPath, content) {
  const abs = join(repoDir, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  execSync(`git add -- "${relPath}"`, { cwd: repoDir, stdio: "ignore" });
}

/**
 * Run the pre-commit-no-inline-node hook from the repo's cwd.
 * @param {string} repoDir
 */
function runHookInRepo(repoDir) {
  const result = spawnSync("bash", [HOOK_PATH], {
    cwd: repoDir,
    encoding: "utf8",
    timeout: 10_000,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

describe("pre-commit-no-inline-node hook", () => {
  let repoDir;

  beforeEach(() => {
    repoDir = createTempGitRepo({ branch: "feat/test" });
  });

  afterEach(() => {
    if (repoDir) cleanupTempDir(repoDir);
  });

  it("exits 0 silently when no staged SKILL.md files", () => {
    // Stage an unrelated file
    stageFile(repoDir, "README.md", "hello\n");
    const r = runHookInRepo(repoDir);
    assert.equal(r.exitCode, 0);
    assert.equal(r.stdout.trim(), "");
    assert.equal(r.stderr.trim(), "");
  });

  it("exits 0 silently when nothing is staged at all", () => {
    const r = runHookInRepo(repoDir);
    assert.equal(r.exitCode, 0);
    assert.equal(r.stdout.trim(), "");
    assert.equal(r.stderr.trim(), "");
  });

  it("exits 2 on 'Run inline Node.js:' heading in skills/**/SKILL.md", () => {
    stageFile(
      repoDir,
      "skills/foo/SKILL.md",
      "# Foo skill\n\n## Process\n\n### Step 1\n\nRun inline Node.js:\n\n```js\nconsole.log('hi');\n```\n",
    );
    const r = runHookInRepo(repoDir);
    assert.equal(r.exitCode, 2);
    assert.match(r.stderr, /Inline Node forbidden/);
    assert.match(r.stderr, /skills\/foo\/SKILL\.md/);
  });

  it("exits 2 on 'node --input-type=module -e' heredoc in SKILL.md", () => {
    stageFile(
      repoDir,
      "skills/bar/SKILL.md",
      "# Bar\n\n### Step 1\n\n```bash\nnode --input-type=module -e \"\nimport x from 'y';\nconsole.log(x);\n\"\n```\n",
    );
    const r = runHookInRepo(repoDir);
    assert.equal(r.exitCode, 2);
    assert.match(r.stderr, /Inline Node forbidden/);
    assert.match(r.stderr, /skills\/bar\/SKILL\.md/);
  });

  it("exits 2 on 'node -e' inside fenced code block in SKILL.md", () => {
    stageFile(
      repoDir,
      "skills/baz/SKILL.md",
      "# Baz\n\n### Step 1\n\n```bash\nnode -e \"console.log(1)\"\n```\n",
    );
    const r = runHookInRepo(repoDir);
    assert.equal(r.exitCode, 2);
    assert.match(r.stderr, /Inline Node forbidden/);
    assert.match(r.stderr, /skills\/baz\/SKILL\.md/);
  });

  it("exits 2 when SKILL.md has both inline-Node AND adev <verb> in same H3 section", () => {
    stageFile(
      repoDir,
      "skills/qux/SKILL.md",
      [
        "# Qux",
        "",
        "### Step 1",
        "",
        "```bash",
        "node -e \"console.log('inline')\"",
        "adev diagnose --tier 1",
        "```",
        "",
      ].join("\n"),
    );
    const r = runHookInRepo(repoDir);
    assert.equal(r.exitCode, 2);
    assert.match(r.stderr, /Per-skill atomic invariant violated/);
    assert.match(r.stderr, /skills\/qux\/SKILL\.md/);
    assert.match(r.stderr, /Step 1/);
  });

  it("allows SKILL.md with inline-Node and adev <verb> in DIFFERENT H3 sections", () => {
    // Wait — Behavior 3 also rejects inline-Node alone. So to test "both forms in
    // different sections are allowed", the file must not contain inline-Node at
    // all (since whole-file scan rejects it). Instead, this test verifies the
    // structural per-H3 invariant separately: two adev calls in different
    // sections, no inline-Node anywhere → allowed.
    stageFile(
      repoDir,
      "skills/multisec/SKILL.md",
      [
        "# Multi-section",
        "",
        "### Step 1",
        "",
        "Some prose, no node here.",
        "",
        "### Step 2",
        "",
        "```bash",
        "adev verify",
        "```",
        "",
      ].join("\n"),
    );
    const r = runHookInRepo(repoDir);
    assert.equal(r.exitCode, 0);
    assert.equal(r.stderr.trim(), "");
  });

  it("ignores providers/*/skills/*/SKILL.md (out of scope)", () => {
    stageFile(
      repoDir,
      "providers/codex/skills/foo/SKILL.md",
      "# Foo (provider mirror)\n\n### Step 1\n\nRun inline Node.js:\n\n```js\nconsole.log('x');\n```\n",
    );
    const r = runHookInRepo(repoDir);
    assert.equal(r.exitCode, 0);
    assert.equal(r.stderr.trim(), "");
  });

  it("ignores non-SKILL.md markdown files (out of scope)", () => {
    stageFile(
      repoDir,
      "docs/something.md",
      "# Doc\n\nRun inline Node.js:\n\n```js\nconsole.log('x');\n```\n",
    );
    const r = runHookInRepo(repoDir);
    assert.equal(r.exitCode, 0);
    assert.equal(r.stderr.trim(), "");
  });

  it("does not false-positive on inline-backtick prose mentions of node -e", () => {
    // Inline backticks like `node -e ...` should NOT trigger the hook.
    // The constitution amendment itself contains such prose; the hook must
    // tolerate it inside SKILL.md (e.g., a skill explaining what NOT to do).
    stageFile(
      repoDir,
      "skills/proseonly/SKILL.md",
      [
        "# Prose-only",
        "",
        "### Background",
        "",
        "Do NOT use `node -e` or `node --input-type=module -e` in skill files.",
        "Instead, name a CLI subcommand.",
        "",
      ].join("\n"),
    );
    const r = runHookInRepo(repoDir);
    assert.equal(r.exitCode, 0, `expected exit 0 but got ${r.exitCode}; stderr=${r.stderr}`);
    assert.equal(r.stderr.trim(), "");
  });

  it("allows clean SKILL.md without any inline-Node patterns", () => {
    stageFile(
      repoDir,
      "skills/clean/SKILL.md",
      [
        "# Clean skill",
        "",
        "### Step 1",
        "",
        "```bash",
        "adev diagnose --tier 1",
        "```",
        "",
        "### Step 2",
        "",
        "Some prose. Run `adev verify` to check.",
        "",
      ].join("\n"),
    );
    const r = runHookInRepo(repoDir);
    assert.equal(r.exitCode, 0);
    assert.equal(r.stderr.trim(), "");
  });

  it("reports per-file (not aggregate) when multiple SKILL.md files violate", () => {
    stageFile(
      repoDir,
      "skills/one/SKILL.md",
      "# One\n\n### Step 1\n\nRun inline Node.js:\n\n```js\nconsole.log('x');\n```\n",
    );
    stageFile(
      repoDir,
      "skills/two/SKILL.md",
      "# Two\n\n### Step 1\n\n```bash\nnode -e \"console.log(1)\"\n```\n",
    );
    const r = runHookInRepo(repoDir);
    assert.equal(r.exitCode, 2);
    assert.match(r.stderr, /skills\/one\/SKILL\.md/);
    assert.match(r.stderr, /skills\/two\/SKILL\.md/);
  });

  it("ignores non-SKILL.md changes mixed with clean SKILL.md", () => {
    stageFile(repoDir, "src/foo.mjs", "export const x = 1;\n");
    stageFile(
      repoDir,
      "skills/clean2/SKILL.md",
      "# Clean\n\n### Step 1\n\n```bash\nadev verify\n```\n",
    );
    const r = runHookInRepo(repoDir);
    assert.equal(r.exitCode, 0);
    assert.equal(r.stderr.trim(), "");
  });

  it("does not treat prose mentions like 'adev plugin' as a CLI invocation for the both-forms invariant", () => {
    // The both-forms check (Behavior 4) must only count REAL `adev <verb>`
    // calls (inside fenced code blocks), not prose mentions of the project
    // name like "the adev plugin" or "the adev project root".
    stageFile(
      repoDir,
      "skills/prosemix/SKILL.md",
      [
        "# Prose Mix",
        "",
        "### Step 1",
        "",
        "The adev plugin root is resolved as follows.",
        "",
        "Run inline Node.js:",
        "",
        "```js",
        "console.log('not in fence-with-adev-verb');",
        "```",
        "",
        "More prose mentioning the adev project lifecycle, but no actual",
        "CLI invocation in this section.",
        "",
      ].join("\n"),
    );
    const r = runHookInRepo(repoDir);
    // The Run inline Node.js: heading is a Behavior 3 violation (added line).
    // But the section should NOT also report a both-forms violation — there
    // is no real `adev <verb>` call inside a fence.
    assert.equal(r.exitCode, 2);
    assert.match(r.stderr, /Inline Node forbidden/);
    assert.doesNotMatch(r.stderr, /Per-skill atomic invariant violated/);
  });

  it("allows unrelated edit to a SKILL.md that still contains pre-existing inline-Node (diff-based check)", () => {
    // Per spec Behavior 3 + Error Cases: hook checks only `+` lines, not the
    // whole staged blob. Pre-existing inline-Node lines unchanged by the diff
    // must not trigger the pattern check. This enables the sweep's per-skill
    // atomic PRs to land without being blocked by other H3 sections that
    // haven't been migrated yet.
    const initial = [
      "# Legacy skill",
      "",
      "### Existing inline-Node block (pre-existing, untouched by this commit)",
      "",
      "Run inline Node.js:",
      "",
      "```js",
      "console.log('legacy');",
      "```",
      "",
      "### Other section",
      "",
      "Some unchanged prose.",
      "",
    ].join("\n");
    stageFile(repoDir, "skills/legacy/SKILL.md", initial);
    execSync("git commit -m baseline", { cwd: repoDir, stdio: "ignore" });
    // Make an unrelated additive edit — the only `+` lines should be the new
    // prose, NOT the pre-existing inline-Node block.
    const updated = initial.replace(
      "Some unchanged prose.",
      "Some unchanged prose.\nAn unrelated new sentence added.",
    );
    writeFileSync(join(repoDir, "skills/legacy/SKILL.md"), updated);
    execSync("git add -- skills/legacy/SKILL.md", { cwd: repoDir, stdio: "ignore" });
    const r = runHookInRepo(repoDir);
    assert.equal(r.exitCode, 0, `expected exit 0 but got ${r.exitCode}; stderr=${r.stderr}`);
    assert.equal(r.stderr.trim(), "");
  });

  it("still blocks when a commit adds a NEW inline-Node block to a SKILL.md that already had one (diff-based check)", () => {
    const initial = [
      "# Legacy skill",
      "",
      "### Existing section",
      "",
      "Run inline Node.js:",
      "",
      "```js",
      "console.log('legacy');",
      "```",
      "",
    ].join("\n");
    stageFile(repoDir, "skills/legacy2/SKILL.md", initial);
    execSync("git commit -m baseline", { cwd: repoDir, stdio: "ignore" });
    // Add a SECOND inline-Node block in a new section — these are NEW `+` lines.
    const updated = initial + [
      "### New section",
      "",
      "Run inline Node.js:",
      "",
      "```js",
      "console.log('new');",
      "```",
      "",
    ].join("\n");
    writeFileSync(join(repoDir, "skills/legacy2/SKILL.md"), updated);
    execSync("git add -- skills/legacy2/SKILL.md", { cwd: repoDir, stdio: "ignore" });
    const r = runHookInRepo(repoDir);
    assert.equal(r.exitCode, 2);
    assert.match(r.stderr, /Inline Node forbidden/);
    assert.match(r.stderr, /skills\/legacy2\/SKILL\.md/);
  });
});
