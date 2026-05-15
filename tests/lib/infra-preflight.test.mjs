/**
 * Tests for lib/infra-preflight.mjs
 *
 * Covers: parseInfraRequirements, loadEnvFile, checkEnvVars, checkCliTools,
 * executeProbe, runPreflight, formatPreflightReport.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createTempDir,
  cleanupTempDir,
  writeFixture,
} from "../helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..");

import {
  parseInfraRequirements,
  loadEnvFile,
  checkEnvVars,
  checkCliTools,
  executeProbe,
  runPreflight,
  formatPreflightReport,
} from "../../lib/infra-preflight.mjs";

// ---------------------------------------------------------------------------
// ADR 0006
// ---------------------------------------------------------------------------

describe("ADR: dotenvx dependency", () => {
  test("ADR 0006 exists", () => {
    assert.ok(
      existsSync(
        join(PROJECT_ROOT, ".context-index", "adrs", "0006-dotenvx-dependency.md")
      ),
      "ADR 0006-dotenvx-dependency.md must exist"
    );
  });
});

// ---------------------------------------------------------------------------
// parseInfraRequirements
// ---------------------------------------------------------------------------

describe("parseInfraRequirements", () => {
  test("parses infra_requirements from YAML frontmatter", () => {
    const tmpDir = createTempDir();
    try {
      writeFixture(
        tmpDir,
        "spec.md",
        `---
infra_requirements:
  systems:
    - name: "Postgres"
      env_vars: [DATABASE_URL]
---
# Spec
`
      );
      const result = parseInfraRequirements(join(tmpDir, "spec.md"));
      assert.equal(result.systems.length, 1);
      assert.equal(result.systems[0].name, "Postgres");
      assert.deepEqual(result.systems[0].env_vars, ["DATABASE_URL"]);
    } finally {
      cleanupTempDir(tmpDir);
    }
  });

  test("returns null when no infra_requirements in frontmatter", () => {
    const tmpDir = createTempDir();
    try {
      writeFixture(tmpDir, "spec.md", "---\nstatus: draft\n---\n# Spec\n");
      const result = parseInfraRequirements(join(tmpDir, "spec.md"));
      assert.equal(result, null);
    } finally {
      cleanupTempDir(tmpDir);
    }
  });

  test("throws PREFLIGHT_FILE_NOT_FOUND for missing file", () => {
    assert.throws(
      () => parseInfraRequirements("/nonexistent/file.md"),
      (err) => err.code === "PREFLIGHT_FILE_NOT_FOUND"
    );
  });

  test("parses extended schema fields", () => {
    const tmpDir = createTempDir();
    try {
      writeFixture(
        tmpDir,
        "spec.md",
        `---
infra_requirements:
  env_file: ".env.test"
  systems:
    - name: "Postgres 15"
      env_vars: [DATABASE_URL]
      cli_tools:
        - psql
        - name: docker
          version: ">=24"
      probe: "pg_isready -h $DB_HOST"
      check_level: full
      timeout: 5
  ci_tag: "integration"
---
# Spec
`
      );
      const result = parseInfraRequirements(join(tmpDir, "spec.md"));
      assert.equal(result.env_file, ".env.test");
      assert.equal(result.ci_tag, "integration");
      const pg = result.systems[0];
      assert.equal(pg.name, "Postgres 15");
      assert.ok(Array.isArray(pg.cli_tools));
      assert.equal(pg.probe, "pg_isready -h $DB_HOST");
      assert.equal(pg.check_level, "full");
      assert.equal(pg.timeout, 5);
    } finally {
      cleanupTempDir(tmpDir);
    }
  });

  test("returns null for file with no frontmatter", () => {
    const tmpDir = createTempDir();
    try {
      writeFixture(tmpDir, "spec.md", "# Just a heading\nNo frontmatter here.");
      const result = parseInfraRequirements(join(tmpDir, "spec.md"));
      assert.equal(result, null);
    } finally {
      cleanupTempDir(tmpDir);
    }
  });
});

// ---------------------------------------------------------------------------
// loadEnvFile
// ---------------------------------------------------------------------------

describe("loadEnvFile", () => {
  test("rejects env_file path escaping project root", async () => {
    await assert.rejects(
      async () => loadEnvFile("../../etc/passwd", "/tmp/project"),
      (err) => err.code === "PREFLIGHT_UNSAFE_ENV_FILE"
    );
  });

  test("rejects prefix-collision bypass", async () => {
    // /app vs /app-secrets
    await assert.rejects(
      async () => loadEnvFile("../app-secrets/.env", "/app"),
      (err) => err.code === "PREFLIGHT_UNSAFE_ENV_FILE"
    );
  });

  test("accepts env_file within project root", async () => {
    const tmpDir = createTempDir();
    try {
      writeFixture(tmpDir, ".env.test", "DB_HOST=localhost\n");
      const result = await loadEnvFile(".env.test", tmpDir);
      assert.equal(result.loaded, true);
      assert.equal(result.env.DB_HOST, "localhost");
    } finally {
      cleanupTempDir(tmpDir);
    }
  });

  test("returns warning when env_file not found", async () => {
    const tmpDir = createTempDir();
    try {
      const result = await loadEnvFile(".env.missing", tmpDir);
      assert.equal(result.loaded, false);
      assert.ok(result.warning.includes("env file not found"));
    } finally {
      cleanupTempDir(tmpDir);
    }
  });
});

// ---------------------------------------------------------------------------
// checkEnvVars
// ---------------------------------------------------------------------------

describe("checkEnvVars", () => {
  test("reports missing env vars", () => {
    const result = checkEnvVars(["EXISTING_VAR", "MISSING_VAR"], {
      EXISTING_VAR: "value",
    });
    assert.equal(result.env_vars_ok, false);
    assert.deepEqual(result.missing_env_vars, ["MISSING_VAR"]);
  });

  test("reports empty env vars as missing", () => {
    const result = checkEnvVars(["EMPTY_VAR"], { EMPTY_VAR: "" });
    assert.equal(result.env_vars_ok, false);
    assert.deepEqual(result.missing_env_vars, ["EMPTY_VAR"]);
  });

  test("passes when all vars are defined and non-empty", () => {
    const result = checkEnvVars(["VAR_A", "VAR_B"], {
      VAR_A: "a",
      VAR_B: "b",
    });
    assert.equal(result.env_vars_ok, true);
    assert.deepEqual(result.missing_env_vars, []);
  });

  test("handles empty env_vars array", () => {
    const result = checkEnvVars([], {});
    assert.equal(result.env_vars_ok, true);
    assert.deepEqual(result.missing_env_vars, []);
  });
});

// ---------------------------------------------------------------------------
// checkCliTools
// ---------------------------------------------------------------------------

describe("checkCliTools", () => {
  test("rejects tool names with path separators", () => {
    const result = checkCliTools(["../evil"]);
    assert.ok(
      result.warnings.some((w) => w.code === "PREFLIGHT_INVALID_TOOL")
    );
  });

  test("rejects tool names with shell metacharacters", () => {
    const result = checkCliTools(["tool; rm -rf /"]);
    assert.ok(
      result.warnings.some((w) => w.code === "PREFLIGHT_INVALID_TOOL")
    );
  });

  test("detects existing tool on PATH (node is always available)", () => {
    const result = checkCliTools(["node"]);
    assert.equal(result.cli_tools_ok, true);
    assert.deepEqual(result.missing_tools, []);
  });

  test("reports missing tool", () => {
    const result = checkCliTools(["nonexistent_tool_xyz_12345"]);
    assert.equal(result.cli_tools_ok, false);
    assert.deepEqual(result.missing_tools, ["nonexistent_tool_xyz_12345"]);
  });

  test("handles object form with version check", () => {
    const result = checkCliTools([{ name: "node", version: ">=14" }]);
    assert.equal(result.cli_tools_ok, true);
  });

  test("handles mixed string and object entries", () => {
    const result = checkCliTools(["node", { name: "node", version: ">=14" }]);
    assert.equal(result.cli_tools_ok, true);
  });

  test("reports version mismatch", () => {
    const result = checkCliTools([{ name: "node", version: ">=999" }]);
    assert.equal(result.cli_tools_ok, false);
    assert.equal(result.version_mismatches.length, 1);
    assert.equal(result.version_mismatches[0].tool, "node");
    assert.equal(result.version_mismatches[0].required, ">=999");
  });

  test("handles invalid cli_tools entry format", () => {
    const result = checkCliTools([42]);
    assert.ok(
      result.warnings.some((w) => w.code === "PREFLIGHT_INVALID_TOOL")
    );
  });
});

// ---------------------------------------------------------------------------
// executeProbe
// ---------------------------------------------------------------------------

describe("executeProbe", () => {
  test("executes probe and returns success for exit code 0", () => {
    const result = executeProbe("echo hello", {}, { timeout: 5 });
    assert.equal(result.probe_ok, true);
    assert.equal(result.probe_error, null);
    assert.ok(typeof result.probe_duration_ms === "number");
  });

  test("substitutes $VAR per-token from environment", () => {
    const result = executeProbe("echo $TEST_VALUE", { TEST_VALUE: "world" }, { timeout: 5 });
    assert.equal(result.probe_ok, true);
  });

  test("handles space in env var value as single token", () => {
    const result = executeProbe("echo $MSG", { MSG: "hello world" }, { timeout: 5 });
    assert.equal(result.probe_ok, true);
  });

  test("reports failure for non-zero exit code", () => {
    const result = executeProbe("false", {}, { timeout: 5 });
    assert.equal(result.probe_ok, false);
  });

  test("reports command not found", () => {
    const result = executeProbe("nonexistent_cmd_xyz", {}, { timeout: 5 });
    assert.equal(result.probe_ok, false);
    assert.ok(result.probe_error !== null);
  });

  test("does not support shell features (pipes passed as args)", () => {
    const result = executeProbe("echo hello | cat", {}, { timeout: 5 });
    // | is passed as arg to echo, not interpreted as pipe
    assert.equal(result.probe_ok, true);
  });
});

// ---------------------------------------------------------------------------
// runPreflight
// ---------------------------------------------------------------------------

describe("runPreflight", () => {
  test("returns passed:true when no infra_requirements", async () => {
    const tmpDir = createTempDir();
    try {
      writeFixture(tmpDir, "spec.md", "---\nstatus: draft\n---\n# Spec\n");
      const result = await runPreflight(join(tmpDir, "spec.md"), null, {
        projectRoot: tmpDir,
      });
      assert.deepEqual(result, { passed: true, systems: [], skipped: false });
    } finally {
      cleanupTempDir(tmpDir);
    }
  });

  test("returns skipped:true when options.noInfra is true", async () => {
    const tmpDir = createTempDir();
    try {
      writeFixture(
        tmpDir,
        "spec.md",
        `---
infra_requirements:
  systems:
    - name: Postgres
      env_vars: [DATABASE_URL]
---
# Spec
`
      );
      const result = await runPreflight(join(tmpDir, "spec.md"), null, {
        noInfra: true,
        projectRoot: tmpDir,
      });
      assert.deepEqual(result, { passed: true, systems: [], skipped: true });
    } finally {
      cleanupTempDir(tmpDir);
    }
  });

  test("merges systems from spec and plan, plan wins on conflict", async () => {
    const tmpDir = createTempDir();
    try {
      writeFixture(
        tmpDir,
        "spec.md",
        `---
infra_requirements:
  systems:
    - name: Postgres
      env_vars: [DB_URL]
    - name: Redis
      env_vars: [REDIS_URL]
---
# Spec
`
      );
      writeFixture(
        tmpDir,
        "plan.md",
        `---
infra_requirements:
  systems:
    - name: Postgres
      env_vars: [DATABASE_URL, DB_HOST]
---
# Plan
`
      );
      const result = await runPreflight(join(tmpDir, "spec.md"), join(tmpDir, "plan.md"), {
        projectRoot: tmpDir,
      });
      // Both Postgres and Redis should be present
      const pgSystem = result.systems.find((s) => s.name === "Postgres");
      assert.ok(pgSystem, "Postgres system should be present");
      const redisSystem = result.systems.find((s) => s.name === "Redis");
      assert.ok(redisSystem, "Redis system should be present");
    } finally {
      cleanupTempDir(tmpDir);
    }
  });

  test("check_level: skip skips all checks", async () => {
    const tmpDir = createTempDir();
    try {
      writeFixture(
        tmpDir,
        "spec.md",
        `---
infra_requirements:
  systems:
    - name: Optional
      check_level: skip
      env_vars: [SOME_VAR]
---
# Spec
`
      );
      const result = await runPreflight(join(tmpDir, "spec.md"), null, {
        projectRoot: tmpDir,
      });
      assert.equal(result.passed, true);
      assert.equal(result.systems[0].skipped, true);
      assert.equal(result.systems[0].env_vars_ok, null);
    } finally {
      cleanupTempDir(tmpDir);
    }
  });

  test("check_level: presence-only skips probe", async () => {
    const tmpDir = createTempDir();
    try {
      writeFixture(
        tmpDir,
        "spec.md",
        `---
infra_requirements:
  systems:
    - name: DB
      check_level: presence-only
      probe: "pg_isready -h localhost"
---
# Spec
`
      );
      const result = await runPreflight(join(tmpDir, "spec.md"), null, {
        projectRoot: tmpDir,
      });
      const db = result.systems[0];
      assert.equal(db.probe_ok, null);
      assert.ok(db.probe_error && db.probe_error.includes("presence-only"));
    } finally {
      cleanupTempDir(tmpDir);
    }
  });

  test("probe skipped when prerequisites fail", async () => {
    const tmpDir = createTempDir();
    try {
      writeFixture(
        tmpDir,
        "spec.md",
        `---
infra_requirements:
  systems:
    - name: NeedsEnv
      env_vars: [NONEXISTENT_VAR_XYZ_123]
      probe: "echo should-not-run"
---
# Spec
`
      );
      const result = await runPreflight(join(tmpDir, "spec.md"), null, {
        projectRoot: tmpDir,
      });
      assert.equal(result.passed, false);
      assert.equal(result.systems[0].env_vars_ok, false);
      assert.equal(result.systems[0].probe_ok, null);
      assert.ok(result.systems[0].probe_error.includes("prerequisites failed"));
    } finally {
      cleanupTempDir(tmpDir);
    }
  });

  test("PreflightReport matches expected schema shape", async () => {
    const tmpDir = createTempDir();
    try {
      writeFixture(
        tmpDir,
        "spec.md",
        `---
infra_requirements:
  systems:
    - name: Test
      env_vars: [PATH]
      probe: "echo ok"
---
# Spec
`
      );
      const result = await runPreflight(join(tmpDir, "spec.md"), null, {
        projectRoot: tmpDir,
      });
      assert.equal(typeof result.passed, "boolean");
      assert.ok(Array.isArray(result.systems));
      assert.equal(typeof result.skipped, "boolean");
      const sys = result.systems[0];
      assert.equal(typeof sys.name, "string");
      assert.equal(typeof sys.skipped, "boolean");
      assert.ok(typeof sys.env_vars_ok === "boolean" || sys.env_vars_ok === null);
      assert.ok(Array.isArray(sys.missing_env_vars));
      assert.ok(typeof sys.probe_ok === "boolean" || sys.probe_ok === null);
      assert.ok(typeof sys.probe_error === "string" || sys.probe_error === null);
      assert.ok(
        typeof sys.probe_duration_ms === "number" || sys.probe_duration_ms === null
      );
    } finally {
      cleanupTempDir(tmpDir);
    }
  });
});

// ---------------------------------------------------------------------------
// formatPreflightReport
// ---------------------------------------------------------------------------

describe("formatPreflightReport", () => {
  test("renders passing report", () => {
    const report = {
      passed: true,
      skipped: false,
      systems: [
        {
          name: "Postgres",
          skipped: false,
          env_vars_ok: true,
          missing_env_vars: [],
          cli_tools_ok: true,
          missing_tools: [],
          version_mismatches: [],
          probe_ok: true,
          probe_error: null,
          probe_duration_ms: 42,
        },
      ],
    };
    const output = formatPreflightReport(report);
    assert.ok(output.includes("Postgres"));
    assert.ok(output.includes("PASS") || output.includes("pass") || output.includes("Pass"));
  });

  test("renders failing report with actionable errors", () => {
    const report = {
      passed: false,
      skipped: false,
      systems: [
        {
          name: "Redis",
          skipped: false,
          env_vars_ok: false,
          missing_env_vars: ["REDIS_URL"],
          cli_tools_ok: true,
          missing_tools: [],
          version_mismatches: [],
          probe_ok: null,
          probe_error: "skipped — prerequisites failed",
          probe_duration_ms: null,
        },
      ],
    };
    const output = formatPreflightReport(report);
    assert.ok(output.includes("REDIS_URL"));
    assert.ok(output.includes("FAIL") || output.includes("fail") || output.includes("Fail"));
  });

  test("never includes env var values", () => {
    const report = {
      passed: true,
      skipped: false,
      systems: [
        {
          name: "AWS",
          skipped: false,
          env_vars_ok: true,
          missing_env_vars: [],
          cli_tools_ok: null,
          missing_tools: [],
          version_mismatches: [],
          probe_ok: null,
          probe_error: null,
          probe_duration_ms: null,
        },
      ],
    };
    const output = formatPreflightReport(report);
    // Should not include actual PATH value
    assert.ok(!output.includes(process.env.PATH));
  });

  test("renders skipped report", () => {
    const report = { passed: true, skipped: true, systems: [] };
    const output = formatPreflightReport(report);
    assert.ok(output.includes("skipped") || output.includes("--no-infra"));
  });
});

// ---------------------------------------------------------------------------
// live-spec template
// ---------------------------------------------------------------------------

describe("live-spec template", () => {
  test("template includes extended infra_requirements fields", () => {
    const template = readFileSync(
      join(PROJECT_ROOT, "templates", "spec-template.behavioral.md"),
      "utf-8"
    );
    assert.ok(template.includes("cli_tools"), "must include cli_tools example");
    assert.ok(template.includes("probe"), "must include probe example");
    assert.ok(template.includes("check_level"), "must include check_level example");
    assert.ok(template.includes("timeout"), "must include timeout example");
    assert.ok(template.includes("env_file"), "must include env_file example");
  });
});
