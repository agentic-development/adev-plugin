import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { CursorAdapter, sanitizeSkillName } from "../../providers/cursor/adapter.mjs";

describe("CursorAdapter (shape)", () => {
  it("exports the expected adapter contract", () => {
    assert.equal(CursorAdapter.name, "cursor");
    assert.equal(typeof CursorAdapter.install, "function");
    assert.equal(typeof CursorAdapter.uninstall, "function");
    assert.equal(typeof CursorAdapter.detect, "function");
    assert.equal(typeof CursorAdapter.detectConflicts, "function");
    assert.equal(typeof CursorAdapter.disableConflictingPlugin, "function");
    assert.equal(typeof CursorAdapter.getAgentFile, "function");
    assert.ok(CursorAdapter.pluginRoot, "pluginRoot should be set");
    assert.ok(CursorAdapter.version, "version should be set");
  });
});

describe("CursorAdapter.install", () => {
  let originalEnv;
  let homeDir;

  beforeEach(() => {
    originalEnv = { ...process.env };
    homeDir = mkdtempSync(join(tmpdir(), "cursor-home-"));
    process.env.HOME = homeDir;
    delete process.env.USERPROFILE;
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(homeDir, { recursive: true, force: true });
  });

  it("copies the plugin tree into ~/.cursor/plugins/local/adev/ with Spec A and Spec C artifacts present", async () => {
    const result = await CursorAdapter.install({ scope: "user" });
    const cacheDir = join(homeDir, ".cursor", "plugins", "local", "adev");

    assert.equal(result.installed, true);
    assert.equal(result.path, cacheDir);
    assert.ok(
      existsSync(join(cacheDir, ".cursor-plugin", "plugin.json")),
      "Spec A manifest must be present"
    );
    assert.ok(
      existsSync(join(cacheDir, "providers", "cursor", "hooks.json")),
      "Spec C hooks must be present"
    );
    assert.ok(!existsSync(join(cacheDir, ".git")), ".git must be excluded");
    assert.ok(!existsSync(join(cacheDir, "node_modules")), "node_modules must be excluded");
  });

  it("is idempotent: second install returns {installed: false}", async () => {
    await CursorAdapter.install({ scope: "user" });
    const result = await CursorAdapter.install({ scope: "user" });
    assert.equal(result.installed, false);
  });
});

describe("CursorAdapter.install — skill sanitization (end-to-end via real source skills)", () => {
  let originalEnv;
  let homeDir;

  beforeEach(() => {
    originalEnv = { ...process.env };
    homeDir = mkdtempSync(join(tmpdir(), "cursor-sanitize-"));
    process.env.HOME = homeDir;
    delete process.env.USERPROFILE;
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(homeDir, { recursive: true, force: true });
  });

  it("publishes ~/.cursor/skills/adev-<name>/ with frontmatter colon sanitized to hyphen", async () => {
    await CursorAdapter.install({ scope: "user" });

    const skillsDir = join(homeDir, ".cursor", "skills");
    const publishedInit = join(skillsDir, "adev-init", "SKILL.md");

    assert.ok(existsSync(publishedInit), "adev-init/SKILL.md must exist");

    const body = readFileSync(publishedInit, "utf8");
    assert.match(body, /^name: adev-init$/m, "frontmatter name must be sanitized");
    assert.doesNotMatch(body, /^name: adev:init$/m, "no colon-form name in published file");
  });

  it("preserves colons in SKILL.md body (frontmatter-only sanitization scope)", async () => {
    // skills/init/SKILL.md is known to contain `/adev:` references in its
    // body (e.g., "run /adev:review-specs", "/adev:plan and /adev:implement").
    // Those colons must be preserved verbatim per Constitution Principle 2.
    await CursorAdapter.install({ scope: "user" });

    const publishedInit = join(homeDir, ".cursor", "skills", "adev-init", "SKILL.md");
    const body = readFileSync(publishedInit, "utf8");

    assert.match(
      body,
      /\/adev:review-specs/,
      "body reference '/adev:review-specs' must be preserved"
    );
    assert.match(
      body,
      /\/adev:plan/,
      "body reference '/adev:plan' must be preserved"
    );
    assert.match(
      body,
      /\/adev:implement/,
      "body reference '/adev:implement' must be preserved"
    );
  });
});

describe("sanitizeSkillName (pure helper)", () => {
  it("rewrites name: adev:<x> to name: adev-<x> within frontmatter only", () => {
    const input = "---\nname: adev:init\ndescription: \"hello\"\n---\n\nBody mentions adev:foo.\n";
    const { content, sanitizedName } = sanitizeSkillName(input);
    assert.equal(sanitizedName, "adev-init");
    assert.match(content, /^name: adev-init$/m);
    // Body line must be preserved verbatim (colon stays).
    assert.match(content, /Body mentions adev:foo\./);
  });

  it("returns null name and unchanged content when no frontmatter is present", () => {
    const input = "# Heading\n\nname: adev:thing in body but no frontmatter.\n";
    const { content, sanitizedName } = sanitizeSkillName(input);
    assert.equal(sanitizedName, null);
    assert.equal(content, input);
  });

  it("returns null name when frontmatter has no name field", () => {
    const input = "---\ndescription: just description\n---\n\nBody.\n";
    const { content, sanitizedName } = sanitizeSkillName(input);
    assert.equal(sanitizedName, null);
    assert.equal(content, input);
  });

  it("passes through already-sanitized name: adev-<x> unchanged (idempotent)", () => {
    const input = "---\nname: adev-foo\ndescription: \"x\"\n---\n\nBody.\n";
    const { content, sanitizedName } = sanitizeSkillName(input);
    assert.equal(sanitizedName, "adev-foo");
    assert.equal(content, input, "content must be unchanged when name is already sanitized");
  });

  it("ignores name: lines outside the frontmatter block", () => {
    const input = "---\nname: adev:keeper\n---\n\nname: adev:body-shouldnt-match\n";
    const { content, sanitizedName } = sanitizeSkillName(input);
    assert.equal(sanitizedName, "adev-keeper");
    // Body line should NOT be sanitized: still has `adev:body-shouldnt-match`.
    assert.match(content, /name: adev:body-shouldnt-match/);
  });

  it("handles \\r\\n line endings", () => {
    const input = "---\r\nname: adev:winz\r\n---\r\n\r\nBody.\r\n";
    const { sanitizedName } = sanitizeSkillName(input);
    assert.equal(sanitizedName, "adev-winz");
  });
});
