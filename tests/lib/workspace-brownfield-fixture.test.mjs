import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { detectWorkspace } from "../../lib/workspace.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BROWNFIELD = join(__dirname, "..", "fixtures", "workspace-brownfield");

describe("workspace-brownfield fixture — existing repos, no adev", () => {
  it("has no adev-workspace.yaml at the root", () => {
    assert.ok(!existsSync(join(BROWNFIELD, "adev-workspace.yaml")));
  });

  it("has no .context-index/ in any repo", () => {
    for (const repo of ["dbt-models", "data-api", "airflow-dags"]) {
      assert.ok(
        !existsSync(join(BROWNFIELD, "repos", repo, ".context-index")),
        `${repo} should not have .context-index/`
      );
    }
  });

  it("has existing source code in each repo", () => {
    assert.ok(existsSync(join(BROWNFIELD, "repos", "dbt-models", "models", "customer_ltv.sql")));
    assert.ok(existsSync(join(BROWNFIELD, "repos", "data-api", "src", "routes", "ltv.js")));
    assert.ok(existsSync(join(BROWNFIELD, "repos", "airflow-dags", "dags", "customer_ltv_dag.py")));
  });

  it("detectWorkspace returns null at the root", () => {
    assert.equal(detectWorkspace(BROWNFIELD), null);
  });

  it("detectWorkspace returns null from inside a repo", () => {
    assert.equal(detectWorkspace(join(BROWNFIELD, "repos", "dbt-models")), null);
    assert.equal(detectWorkspace(join(BROWNFIELD, "repos", "data-api", "src")), null);
  });

  it("detectWorkspace does not throw even with code but no adev", () => {
    assert.doesNotThrow(() => detectWorkspace(BROWNFIELD));
    assert.doesNotThrow(() => detectWorkspace(join(BROWNFIELD, "repos", "airflow-dags", "dags")));
  });
});
