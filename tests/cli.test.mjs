import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { createTempDir, cleanupTempDir, writeFixture, PLUGIN_ROOT } from "./helpers.mjs";

// Import the pure functions from the CLI module
import {
  scaffoldContextKit,
  enablePlugin,
  detectConflicts,
  disableConflictingPlugin,
} from "../cli/index.mjs";

// --- scaffoldContextKit ---

describe("scaffoldContextKit", () => {
  let tempDir;
  let origCwd;

  beforeEach(() => {
    tempDir = createTempDir();
    origCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    cleanupTempDir(tempDir);
  });

  it("creates the full directory structure", () => {
    scaffoldContextKit();

    const expectedDirs = [
      ".context-index",
      ".context-index/specs",
      ".context-index/specs/cross-cutting",
      ".context-index/specs/features",
      ".context-index/adrs",
      ".context-index/samples",
      ".context-index/orientation",
      ".context-index/specialists",
      ".context-index/hygiene",
    ];

    for (const dir of expectedDirs) {
      assert.ok(existsSync(join(tempDir, dir)), `Directory ${dir} should exist`);
    }
  });

  it("copies all templates", () => {
    scaffoldContextKit();

    const expectedFiles = [
      ".context-index/constitution.md",
      ".context-index/manifest.yaml",
      ".context-index/adrs/.template.md",
      ".context-index/specs/features/.charter-template.md",
      ".context-index/specs/features/.live-spec-template.md",
      ".context-index/specs/features/.refactoring-spec-template.md",
    ];

    for (const file of expectedFiles) {
      assert.ok(existsSync(join(tempDir, file)), `Template ${file} should exist`);
    }

    // Verify content matches the source templates
    const constitutionSrc = readFileSync(join(PLUGIN_ROOT, "templates", "constitution-template.md"), "utf8");
    const constitutionDest = readFileSync(join(tempDir, ".context-index", "constitution.md"), "utf8");
    assert.equal(constitutionDest, constitutionSrc);
  });

  it("is idempotent — second run does not overwrite files", () => {
    const firstRun = scaffoldContextKit();
    assert.ok(firstRun.length > 0, "First run should create items");

    // Modify a file so we can detect overwrites
    const constitutionPath = join(tempDir, ".context-index", "constitution.md");
    writeFileSync(constitutionPath, "# Custom content\n");

    const secondRun = scaffoldContextKit();
    assert.equal(secondRun.length, 0, "Second run should create nothing");

    // Verify file was not overwritten
    const content = readFileSync(constitutionPath, "utf8");
    assert.equal(content, "# Custom content\n");
  });

  it("updates existing .gitignore", () => {
    writeFileSync(join(tempDir, ".gitignore"), "node_modules/\n");

    scaffoldContextKit();

    const gitignore = readFileSync(join(tempDir, ".gitignore"), "utf8");
    assert.ok(gitignore.includes("node_modules/"), "Existing content should be preserved");
    assert.ok(gitignore.includes(".context-index/hygiene/"), "Hygiene entry should be added");
  });

  it("creates .gitignore if missing", () => {
    scaffoldContextKit();

    const gitignore = readFileSync(join(tempDir, ".gitignore"), "utf8");
    assert.ok(gitignore.includes(".context-index/hygiene/"), "Hygiene entry should be present");
  });
});

// --- enablePlugin ---

describe("enablePlugin", () => {
  let tempDir;
  let origCwd;
  let origHome;

  beforeEach(() => {
    tempDir = createTempDir();
    origCwd = process.cwd();
    origHome = process.env.HOME;
    // Point HOME to temp dir so user settings go there
    process.env.HOME = tempDir;
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    process.env.HOME = origHome;
    cleanupTempDir(tempDir);
  });

  it("writes user settings with plugin enabled", () => {
    const settingsPath = enablePlugin("user");
    assert.ok(existsSync(settingsPath));

    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    assert.equal(settings.enabledPlugins["adev@agentic-development"], true);
  });

  it("writes project settings with plugin enabled", () => {
    const settingsPath = enablePlugin("project");
    assert.ok(existsSync(settingsPath));
    assert.ok(settingsPath.includes(join(tempDir, ".claude", "settings.json")));

    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    assert.equal(settings.enabledPlugins["adev@agentic-development"], true);
  });

  it("merges with existing settings", () => {
    const settingsDir = join(tempDir, ".claude");
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(
      join(settingsDir, "settings.json"),
      JSON.stringify({ existingKey: "preserved", enabledPlugins: { "other-plugin": true } }, null, 2)
    );

    enablePlugin("project");

    const settings = JSON.parse(readFileSync(join(settingsDir, "settings.json"), "utf8"));
    assert.equal(settings.existingKey, "preserved");
    assert.equal(settings.enabledPlugins["other-plugin"], true);
    assert.equal(settings.enabledPlugins["adev@agentic-development"], true);
  });
});

// --- detectConflicts ---

describe("detectConflicts", () => {
  let tempDir;
  let origCwd;
  let origHome;

  beforeEach(() => {
    tempDir = createTempDir();
    origCwd = process.cwd();
    origHome = process.env.HOME;
    process.env.HOME = tempDir;
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    process.env.HOME = origHome;
    cleanupTempDir(tempDir);
  });

  it("detects superpowers conflict", () => {
    writeFixture(tempDir, ".claude/settings.json", JSON.stringify({
      enabledPlugins: { "superpowers@claude-plugins-official": true },
    }));

    const conflicts = detectConflicts();
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].key, "superpowers@claude-plugins-official");
  });

  it("ignores already-disabled superpowers at project level", () => {
    // User level has it enabled
    writeFixture(tempDir, ".claude/settings.json", JSON.stringify({
      enabledPlugins: { "superpowers@claude-plugins-official": true },
    }));
    // But also disabled at project level
    writeFixture(tempDir, ".claude/settings.json", JSON.stringify({
      enabledPlugins: { "superpowers@claude-plugins-official": false },
    }));

    const conflicts = detectConflicts();
    assert.equal(conflicts.length, 0);
  });
});

// --- disableConflictingPlugin ---

describe("disableConflictingPlugin", () => {
  let tempDir;
  let origCwd;

  beforeEach(() => {
    tempDir = createTempDir();
    origCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    cleanupTempDir(tempDir);
  });

  it("writes project settings with plugin disabled", () => {
    disableConflictingPlugin("superpowers@claude-plugins-official");

    const settingsPath = join(tempDir, ".claude", "settings.json");
    assert.ok(existsSync(settingsPath));

    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    assert.equal(settings.enabledPlugins["superpowers@claude-plugins-official"], false);
  });
});
