import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { detectWorkspace, resolveWorkspaceContext, resolveRef } from "../../lib/workspace.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, "..", "fixtures", "workspace-example");

describe("workspace-example fixture — end-to-end", () => {
  it("detects the workspace from the workspace root", () => {
    const result = detectWorkspace(FIXTURE);
    assert.ok(result);
    assert.equal(result.config.workspace.name, "data-platform-fixture");
    assert.equal(result.currentRepoSlug, null, "at workspace root, currentRepoSlug is null");
  });

  it("registers all 3 repos", () => {
    const result = detectWorkspace(FIXTURE);
    assert.equal(result.config.repos.length, 3);
    const slugs = result.config.repos.map((r) => r.slug).sort();
    assert.deepEqual(slugs, ["airflow-dags", "data-api", "dbt-models"]);
  });

  it("parses the 2 dependencies correctly", () => {
    const result = detectWorkspace(FIXTURE);
    assert.equal(result.config.dependencies.length, 2);
    const deps = result.config.dependencies;
    assert.ok(deps.some((d) => d.from === "data-api" && d.to === "dbt-models" && d.type === "consumes"));
    assert.ok(deps.some((d) => d.from === "airflow-dags" && d.to === "dbt-models" && d.type === "orchestrates"));
  });

  it("detects workspace from inside a registered repo and resolves current repo", () => {
    const result = detectWorkspace(join(FIXTURE, "repos", "data-api", "src"));
    assert.ok(result);
    assert.equal(result.root, FIXTURE);
    assert.equal(result.currentRepoSlug, "data-api");
  });

  it("walks up from nested directory", () => {
    const result = detectWorkspace(join(FIXTURE, "repos", "airflow-dags", "dags"));
    assert.ok(result);
    assert.equal(result.currentRepoSlug, "airflow-dags");
  });

  it("assembles workspace context with 2 siblings from data-api", () => {
    const { config } = detectWorkspace(FIXTURE);
    const ctx = resolveWorkspaceContext(FIXTURE, config, "data-api");
    assert.equal(ctx.currentRepo.slug, "data-api");
    assert.equal(ctx.siblingRepos.length, 2);
    const siblingSlugs = ctx.siblingRepos.map((r) => r.slug).sort();
    assert.deepEqual(siblingSlugs, ["airflow-dags", "dbt-models"]);
  });

  it("all repos have .context-index/ (contextPath is not null)", () => {
    const { config } = detectWorkspace(FIXTURE);
    const ctx = resolveWorkspaceContext(FIXTURE, config, null);
    for (const repo of ctx.siblingRepos) {
      assert.ok(repo.contextPath, `Repo ${repo.slug} should have contextPath`);
    }
  });

  it("includes role metadata for each repo", () => {
    const { config } = detectWorkspace(FIXTURE);
    const ctx = resolveWorkspaceContext(FIXTURE, config, null);
    const dbtRepo = ctx.siblingRepos.find((r) => r.slug === "dbt-models");
    assert.equal(dbtRepo.role, "transformation");
  });

  it("resolves cross-repo reference @dbt-models/ltv-model", () => {
    const { config } = detectWorkspace(FIXTURE);
    const resolved = resolveRef(FIXTURE, config, "@dbt-models/ltv-model");
    assert.ok(resolved);
    assert.ok(resolved.endsWith("ltv-model.md"));
    // Verify the file actually contains expected content
    const content = readFileSync(resolved, "utf8");
    assert.ok(content.includes("LTV Model"));
  });

  it("returns null for reference to unknown repo", () => {
    const { config } = detectWorkspace(FIXTURE);
    assert.equal(resolveRef(FIXTURE, config, "@missing-repo/spec"), null);
  });

  it("returns null for reference to nonexistent spec", () => {
    const { config } = detectWorkspace(FIXTURE);
    assert.equal(resolveRef(FIXTURE, config, "@dbt-models/nonexistent-spec"), null);
  });

  it("dependency graph supports topological ordering (dbt-models has no dependencies)", () => {
    const { config } = detectWorkspace(FIXTURE);
    const hasIncomingDep = (slug) => config.dependencies.some((d) => d.from === slug);
    assert.ok(!hasIncomingDep("dbt-models"), "dbt-models has no outgoing 'from' deps (it's upstream)");
    assert.ok(hasIncomingDep("data-api"), "data-api has outgoing 'from' dep");
    assert.ok(hasIncomingDep("airflow-dags"), "airflow-dags has outgoing 'from' dep");
  });

  it("cross-repo specs correctly declare depends-on", () => {
    const apiSpec = readFileSync(
      join(FIXTURE, "repos", "data-api", ".context-index", "specs", "features", "customer-ltv", "ltv-endpoint.md"),
      "utf8"
    );
    assert.ok(apiSpec.includes('depends-on: ["@dbt-models/ltv-model"]'));

    const airflowSpec = readFileSync(
      join(FIXTURE, "repos", "airflow-dags", ".context-index", "specs", "features", "customer-ltv", "ltv-schedule.md"),
      "utf8"
    );
    assert.ok(airflowSpec.includes('depends-on: ["@dbt-models/ltv-model"]'));
  });
});
