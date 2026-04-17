import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";

// Will import after creating the module
let detectWorkspace, resolveWorkspaceContext, resolveRef;

// Create a unique temp dir for each test run
function createTempDir() {
  const dir = join(tmpdir(), `workspace-test-${randomBytes(4).toString("hex")}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeYaml(dir, filename, content) {
  writeFileSync(join(dir, filename), content, "utf8");
}

describe("workspace detection", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = createTempDir();
    const mod = await import("../../lib/workspace.mjs");
    detectWorkspace = mod.detectWorkspace;
    resolveWorkspaceContext = mod.resolveWorkspaceContext;
    resolveRef = mod.resolveRef;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns null when no adev-workspace.yaml exists", () => {
    const result = detectWorkspace(tempDir);
    assert.equal(result, null);
  });

  it("detects adev-workspace.yaml in current directory", () => {
    writeYaml(tempDir, "adev-workspace.yaml", `
workspace:
  name: test-platform
repos:
  - slug: repo-a
    path: ./repos/repo-a
`);
    const result = detectWorkspace(tempDir);
    assert.ok(result);
    assert.equal(result.config.workspace.name, "test-platform");
    assert.equal(result.root, tempDir);
  });

  it("walks up to find adev-workspace.yaml", () => {
    writeYaml(tempDir, "adev-workspace.yaml", `
workspace:
  name: test-platform
repos:
  - slug: repo-a
    path: ./repos/repo-a
`);
    const childDir = join(tempDir, "repos", "repo-a", "src");
    mkdirSync(childDir, { recursive: true });
    const result = detectWorkspace(childDir);
    assert.ok(result);
    assert.equal(result.root, tempDir);
  });

  it("resolves currentRepoSlug when startPath is inside a registered repo", () => {
    const repoDir = join(tempDir, "repos", "repo-a");
    mkdirSync(repoDir, { recursive: true });
    writeYaml(tempDir, "adev-workspace.yaml", `
workspace:
  name: test-platform
repos:
  - slug: repo-a
    path: ./repos/repo-a
`);
    const result = detectWorkspace(join(repoDir, "src"));
    assert.equal(result.currentRepoSlug, "repo-a");
  });

  it("sets currentRepoSlug to null at workspace root", () => {
    writeYaml(tempDir, "adev-workspace.yaml", `
workspace:
  name: test-platform
repos:
  - slug: repo-a
    path: ./repos/repo-a
`);
    const result = detectWorkspace(tempDir);
    assert.equal(result.currentRepoSlug, null);
  });

  it("throws on malformed YAML", () => {
    writeYaml(tempDir, "adev-workspace.yaml", "{ invalid yaml: [");
    assert.throws(() => detectWorkspace(tempDir), /Failed to parse adev-workspace.yaml/);
  });

  it("throws when workspace.name is missing", () => {
    writeYaml(tempDir, "adev-workspace.yaml", `
workspace: {}
repos: []
`);
    assert.throws(() => detectWorkspace(tempDir), /missing required field 'workspace.name'/);
  });

  it("throws when repos is missing", () => {
    writeYaml(tempDir, "adev-workspace.yaml", `
workspace:
  name: test
`);
    assert.throws(() => detectWorkspace(tempDir), /missing required field 'repos'/);
  });

  it("throws on duplicate repo slugs", () => {
    writeYaml(tempDir, "adev-workspace.yaml", `
workspace:
  name: test
repos:
  - slug: repo-a
    path: ./a
  - slug: repo-a
    path: ./b
`);
    assert.throws(() => detectWorkspace(tempDir), /Duplicate repo slug 'repo-a'/);
  });

  it("throws when dependency references unknown repo", () => {
    writeYaml(tempDir, "adev-workspace.yaml", `
workspace:
  name: test
repos:
  - slug: repo-a
    path: ./a
dependencies:
  - from: repo-a
    to: repo-x
    type: consumes
`);
    assert.throws(() => detectWorkspace(tempDir), /Dependency references unknown repo 'repo-x'/);
  });

  it("warns but does not throw for missing repo paths", () => {
    writeYaml(tempDir, "adev-workspace.yaml", `
workspace:
  name: test
repos:
  - slug: repo-a
    path: ./nonexistent
`);
    const result = detectWorkspace(tempDir);
    assert.ok(result);
    assert.ok(result.config.warnings.length > 0);
    assert.ok(result.config.warnings[0].includes("does not exist"));
    assert.equal(result.config.repos[0].missing, true);
  });

  it("handles empty dependencies", () => {
    writeYaml(tempDir, "adev-workspace.yaml", `
workspace:
  name: test
repos:
  - slug: repo-a
    path: ./a
dependencies: []
`);
    const result = detectWorkspace(tempDir);
    assert.ok(result);
    assert.deepEqual(result.config.dependencies, []);
  });

  it("handles absent dependencies", () => {
    writeYaml(tempDir, "adev-workspace.yaml", `
workspace:
  name: test
repos:
  - slug: repo-a
    path: ./a
`);
    const result = detectWorkspace(tempDir);
    assert.ok(result);
    assert.deepEqual(result.config.dependencies, []);
  });

  it("resolves relative repo paths against workspace root", () => {
    const repoDir = join(tempDir, "repos", "my-repo");
    mkdirSync(repoDir, { recursive: true });
    writeYaml(tempDir, "adev-workspace.yaml", `
workspace:
  name: test
repos:
  - slug: my-repo
    path: ./repos/my-repo
`);
    const result = detectWorkspace(tempDir);
    assert.ok(!result.config.repos[0].missing);
  });
});

describe("context resolution", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = createTempDir();
    const mod = await import("../../lib/workspace.mjs");
    resolveWorkspaceContext = mod.resolveWorkspaceContext;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns correct WorkspaceContext shape", () => {
    const repoA = join(tempDir, "repo-a");
    const repoB = join(tempDir, "repo-b");
    mkdirSync(join(repoA, ".context-index"), { recursive: true });
    mkdirSync(join(repoB, ".context-index"), { recursive: true });

    const config = {
      workspace: { name: "test" },
      repos: [
        { slug: "repo-a", path: "./repo-a" },
        { slug: "repo-b", path: "./repo-b" },
      ],
      dependencies: [{ from: "repo-a", to: "repo-b", type: "consumes" }],
      warnings: [],
    };

    const ctx = resolveWorkspaceContext(tempDir, config, "repo-a");
    assert.equal(ctx.workspaceName, "test");
    assert.equal(ctx.workspaceRoot, tempDir);
    assert.equal(ctx.currentRepo.slug, "repo-a");
    assert.equal(ctx.siblingRepos.length, 1);
    assert.equal(ctx.siblingRepos[0].slug, "repo-b");
    assert.ok(ctx.dependencyGraph);
  });

  it("sets currentRepo to null when currentRepoSlug is null", () => {
    const config = {
      workspace: { name: "test" },
      repos: [{ slug: "repo-a", path: "./repo-a" }],
      dependencies: [],
      warnings: [],
    };
    mkdirSync(join(tempDir, "repo-a", ".context-index"), { recursive: true });

    const ctx = resolveWorkspaceContext(tempDir, config, null);
    assert.equal(ctx.currentRepo, null);
    assert.equal(ctx.siblingRepos.length, 1);
  });

  it("throws for unknown currentRepoSlug", () => {
    const config = {
      workspace: { name: "test" },
      repos: [{ slug: "repo-a", path: "./repo-a" }],
      dependencies: [],
      warnings: [],
    };

    assert.throws(
      () => resolveWorkspaceContext(tempDir, config, "unknown"),
      /Repo 'unknown' not found in workspace/
    );
  });

  it("sets contextPath to null for repos without .context-index/", () => {
    const repoA = join(tempDir, "repo-a");
    mkdirSync(repoA, { recursive: true }); // no .context-index/

    const config = {
      workspace: { name: "test" },
      repos: [{ slug: "repo-a", path: "./repo-a" }],
      dependencies: [],
      warnings: [],
    };

    const ctx = resolveWorkspaceContext(tempDir, config, null);
    assert.equal(ctx.siblingRepos[0].contextPath, null);
    assert.ok(ctx.warnings.some(w => w.includes("no .context-index/")));
  });
});

describe("cross-repo reference resolution", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = createTempDir();
    const mod = await import("../../lib/workspace.mjs");
    resolveRef = mod.resolveRef;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("resolves @repo-slug/spec-slug to absolute path", () => {
    const specDir = join(tempDir, "repo-a", ".context-index", "specs", "features", "auth");
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(specDir, "login.md"), "# Login Spec", "utf8");

    const config = {
      workspace: { name: "test" },
      repos: [{ slug: "repo-a", path: "./repo-a" }],
      dependencies: [],
      warnings: [],
    };

    const result = resolveRef(tempDir, config, "@repo-a/login");
    assert.ok(result);
    assert.ok(result.endsWith("login.md"));
  });

  it("returns null for non-cross-repo references", () => {
    const config = {
      workspace: { name: "test" },
      repos: [],
      dependencies: [],
      warnings: [],
    };
    assert.equal(resolveRef(tempDir, config, "local-spec"), null);
  });

  it("returns null for unknown repo slug", () => {
    const config = {
      workspace: { name: "test" },
      repos: [{ slug: "repo-a", path: "./repo-a" }],
      dependencies: [],
      warnings: [],
    };
    assert.equal(resolveRef(tempDir, config, "@unknown/spec"), null);
  });

  it("returns null when spec file not found", () => {
    mkdirSync(join(tempDir, "repo-a", ".context-index", "specs", "features"), { recursive: true });
    const config = {
      workspace: { name: "test" },
      repos: [{ slug: "repo-a", path: "./repo-a" }],
      dependencies: [],
      warnings: [],
    };
    assert.equal(resolveRef(tempDir, config, "@repo-a/nonexistent"), null);
  });
});
