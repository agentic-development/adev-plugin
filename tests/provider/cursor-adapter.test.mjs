import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
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

    // Read the published skill's whole tree, not just SKILL.md: init's step
    // prose lives in references/ companions under progressive disclosure. This
    // also pins that the adapter publishes those companions at all -- a
    // SKILL.md-only copy would ship a skill whose pointers resolve to nothing.
    const publishedDir = join(homeDir, ".cursor", "skills", "adev-init");
    const collect = (dir) =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? collect(join(dir, e.name))
          : e.name.endsWith(".md")
            ? [readFileSync(join(dir, e.name), "utf8")]
            : [],
      );
    const body = collect(publishedDir).join("\n");

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

describe("CursorAdapter.uninstall", () => {
  let originalEnv;
  let homeDir;

  beforeEach(() => {
    originalEnv = { ...process.env };
    homeDir = mkdtempSync(join(tmpdir(), "cursor-uninstall-"));
    process.env.HOME = homeDir;
    delete process.env.USERPROFILE;
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(homeDir, { recursive: true, force: true });
  });

  it("removes the plugin cache dir and all ~/.cursor/skills/adev-*/ dirs", async () => {
    await CursorAdapter.install({ scope: "user" });
    await CursorAdapter.uninstall({ scope: "user" });

    const cacheDir = join(homeDir, ".cursor", "plugins", "local", "adev");
    assert.equal(existsSync(cacheDir), false, "plugin cache dir must be removed");

    const skillsDir = join(homeDir, ".cursor", "skills");
    if (existsSync(skillsDir)) {
      const remaining = readdirSync(skillsDir).filter((n) => n.startsWith("adev-"));
      assert.deepEqual(remaining, [], "no adev-* skill dirs may remain");
    }
  });

  it("is idempotent: uninstall when ~/.cursor/ does not exist is a no-op", async () => {
    // Do not call install first. Just uninstall against an empty homeDir.
    await assert.doesNotReject(() => CursorAdapter.uninstall({ scope: "user" }));
  });

  it("install after uninstall produces the same state as a first install", async () => {
    await CursorAdapter.install({ scope: "user" });
    await CursorAdapter.uninstall({ scope: "user" });
    const result = await CursorAdapter.install({ scope: "user" });
    assert.equal(result.installed, true);
  });
});

describe("CursorAdapter.detect", () => {
  let originalEnv;
  let homeDir;

  beforeEach(() => {
    originalEnv = { ...process.env };
    homeDir = mkdtempSync(join(tmpdir(), "cursor-detect-"));
    process.env.HOME = homeDir;
    delete process.env.USERPROFILE;
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(homeDir, { recursive: true, force: true });
  });

  it("returns true when CURSOR=true env is set", () => {
    process.env.CURSOR = "true";
    assert.equal(CursorAdapter.detect(), true);
  });

  it("returns true when ~/.cursor/ exists", () => {
    delete process.env.CURSOR;
    mkdirSync(join(homeDir, ".cursor"), { recursive: true });
    assert.equal(CursorAdapter.detect(), true);
  });

  it("returns false when neither env nor dir is present", () => {
    delete process.env.CURSOR;
    // homeDir is fresh per beforeEach; ~/.cursor/ does not exist.
    assert.equal(CursorAdapter.detect(), false);
  });
});

describe("CursorAdapter.detectConflicts", () => {
  let originalEnv;
  let homeDir;

  beforeEach(() => {
    originalEnv = { ...process.env };
    homeDir = mkdtempSync(join(tmpdir(), "cursor-conflicts-"));
    process.env.HOME = homeDir;
    delete process.env.USERPROFILE;
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(homeDir, { recursive: true, force: true });
  });

  it("returns Superpowers conflict when present in ~/.cursor/config.json:plugins", () => {
    const cursorDir = join(homeDir, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    writeFileSync(
      join(cursorDir, "config.json"),
      JSON.stringify({ plugins: { superpowers: { enabled: true } } })
    );
    const conflicts = CursorAdapter.detectConflicts();
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].name, "superpowers");
    assert.ok(conflicts[0].reason, "conflict reason must be present");
  });

  it("returns [] when no config.json exists", () => {
    assert.deepEqual(CursorAdapter.detectConflicts(), []);
  });

  it("returns [] when config.json has no plugins section", () => {
    const cursorDir = join(homeDir, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    writeFileSync(join(cursorDir, "config.json"), JSON.stringify({ otherKey: "val" }));
    assert.deepEqual(CursorAdapter.detectConflicts(), []);
  });
});

describe("CursorAdapter.disableConflictingPlugin", () => {
  let originalEnv;
  let homeDir;

  beforeEach(() => {
    originalEnv = { ...process.env };
    homeDir = mkdtempSync(join(tmpdir(), "cursor-disable-"));
    process.env.HOME = homeDir;
    delete process.env.USERPROFILE;
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(homeDir, { recursive: true, force: true });
  });

  it("removes the named plugin from ~/.cursor/config.json and returns true", () => {
    const cursorDir = join(homeDir, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    const configPath = join(cursorDir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({ plugins: { superpowers: { enabled: true }, keep: { enabled: true } } })
    );
    const result = CursorAdapter.disableConflictingPlugin("superpowers");
    assert.equal(result, true);
    const after = JSON.parse(readFileSync(configPath, "utf8"));
    assert.equal(after.plugins.superpowers, undefined);
    assert.ok(after.plugins.keep, "other plugins must be preserved");
  });

  it("returns false when the plugin is not present", () => {
    const cursorDir = join(homeDir, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    writeFileSync(join(cursorDir, "config.json"), JSON.stringify({ plugins: {} }));
    assert.equal(CursorAdapter.disableConflictingPlugin("superpowers"), false);
  });

  it("returns false when no config.json exists", () => {
    assert.equal(CursorAdapter.disableConflictingPlugin("superpowers"), false);
  });
});

describe("CursorAdapter (CLI dispatch loadability)", () => {
  it("is importable via the same path the CLI uses", async () => {
    const mod = await import("../../providers/cursor/adapter.mjs");
    assert.ok(mod.CursorAdapter);
    assert.equal(mod.CursorAdapter.name, "cursor");
  });

  it("is registered in lib/provider/registry.mjs (Task 6 scope: loadability only)", async () => {
    const registry = await import("../../lib/provider/registry.mjs");
    assert.ok(
      registry.getProviderNames().includes("cursor"),
      "registry.getProviderNames() must include 'cursor'"
    );
    const provider = registry.getProvider("cursor");
    assert.equal(provider.name, "cursor");
  });
});

describe("CursorAdapter (source constraints — Acceptance Criterion line 10)", () => {
  it("uses fs.cpSync (not execSync of cp -r) and avoids ~/.claude/ paths", () => {
    const src = readFileSync(
      join(import.meta.dirname, "../../providers/cursor/adapter.mjs"),
      "utf8"
    );
    assert.match(src, /\bcpSync\b/, "must use fs.cpSync");
    assert.doesNotMatch(
      src,
      /execSync\s*\(\s*["'`]cp\s+-r/,
      "must not shell to cp -r"
    );
    assert.doesNotMatch(src, /~\/\.claude\//, "must not hardcode ~/.claude/ paths");
    assert.doesNotMatch(src, /\.claude["'`]/, "must not reference .claude config dir");
  });
});
