// tests/cli/cost-summary.test.mjs
//
// CLI tests for `adev cost summary` (Task 3 of cost-ticker plan).
// Covers Behaviors 1, 5, 6, 7, 11, 12 and the full Error Cases table.
// Task 6 (read-only contract) test is appended at the bottom of this file.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

const CLI = new URL("../../cli/index.mjs", import.meta.url).pathname;

function runCli(args, cwd, env = {}) {
  const r = spawnSync("node", [CLI, "cost", "summary", ...args], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  return { code: r.status ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function setupRoot() {
  const root = mkdtempSync(join(tmpdir(), "cost-cli-"));
  mkdirSync(join(root, ".context-index"), { recursive: true });
  writeFileSync(join(root, ".context-index", "manifest.yaml"), "project:\n  name: test\n");
  mkdirSync(join(root, "specs"), { recursive: true });
  writeFileSync(join(root, "specs/x.spec.md"), "# spec");
  return root;
}

describe("adev cost summary — CLI surface", () => {
  it("exits 1 with CONFLICTING_FILTERS when both --spec and --epic are passed", () => {
    const root = setupRoot();
    const r = runCli(["--spec", "specs/x.spec.md", "--epic", "epic-1"], root);
    assert.equal(r.code, 1);
    assert.match(r.stderr + r.stdout, /mutually exclusive|CONFLICTING_FILTERS/);
  });

  it("exits 1 with INVALID_FORMAT for unknown format", () => {
    const root = setupRoot();
    const r = runCli(["--spec", "specs/x.spec.md", "--format", "xml"], root);
    assert.equal(r.code, 1);
    assert.match(r.stderr + r.stdout, /text.*json|INVALID_FORMAT/);
  });

  it("exits 1 with INVALID_SINCE when --since is not parseable", () => {
    const root = setupRoot();
    const r = runCli(["--spec", "specs/x.spec.md", "--since", "not-a-date"], root);
    assert.equal(r.code, 1);
    assert.match(r.stderr + r.stdout, /INVALID_SINCE|not a valid ISO/);
  });

  it("exits 1 with INVALID_SPEC_PATH when spec file does not exist", () => {
    const root = setupRoot();
    const r = runCli(["--spec", "specs/missing.spec.md"], root);
    assert.equal(r.code, 1);
    assert.match(r.stderr + r.stdout, /spec not found|INVALID_SPEC_PATH/);
  });

  it("exits 1 with INVALID_SPEC_PATH when spec path escapes project root", () => {
    const root = setupRoot();
    const r = runCli(["--spec", "../../etc/passwd"], root);
    assert.equal(r.code, 1);
    assert.match(r.stderr + r.stdout, /outside project root|INVALID_SPEC_PATH/);
  });

  it("routes output to stderr with [cost] prefix when ADEV_BUILD_TICKER=1 (Behavior 7)", () => {
    const root = setupRoot();
    const r = runCli(["--spec", "specs/x.spec.md"], root, { ADEV_BUILD_TICKER: "1" });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /^\[cost\] /);
  });

  it("emits no-data text when JSONL is missing (Behavior 5)", () => {
    const root = setupRoot();
    const r = runCli(["--spec", "specs/x.spec.md"], root);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /no usage data yet/);
  });

  it("--quiet suppresses output and exits 0 even with no data", () => {
    const root = setupRoot();
    const r = runCli(["--spec", "specs/x.spec.md", "--quiet"], root);
    assert.equal(r.code, 0);
    assert.equal(r.stdout, "");
  });

  it("--format json emits a JSON object with the Behavior-3 schema", () => {
    const root = setupRoot();
    // Populate JSONL with one matching entry so totals != null.
    writeFileSync(
      join(root, ".context-index", ".session-tracking.jsonl"),
      JSON.stringify({
        spec_ref: "specs/x.spec.md",
        model: "claude-sonnet-4-6",
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_read_tokens: 0,
          cache_creation_tokens: 0,
          cost_usd: 0.001,
        },
        timestamp: "2026-05-22T10:00:00Z",
      }) + "\n",
    );
    const r = runCli(["--spec", "specs/x.spec.md", "--format", "json"], root);
    assert.equal(r.code, 0);
    const out = JSON.parse(r.stdout);
    assert.ok(typeof out.spec === "string");
    assert.ok(out.totals !== undefined);
    assert.ok(Array.isArray(out.checkpoints));
    assert.ok(Array.isArray(out.model_breakdown));
  });

  it("emits stderr note for skipped lines in text format (Behavior 13)", () => {
    const root = setupRoot();
    writeFileSync(
      join(root, ".context-index", ".session-tracking.jsonl"),
      ["not-json", JSON.stringify({ spec_ref: "specs/x.spec.md", usage: { cost_usd: 0.001 } })].join("\n") + "\n",
    );
    const r = runCli(["--spec", "specs/x.spec.md"], root);
    assert.equal(r.code, 0);
    assert.match(r.stderr, /skipped 1 malformed/);
  });

  it("emits [cost warn] on stderr when build.cost_warn_usd is exceeded (Behavior 11)", () => {
    const root = setupRoot();
    writeFileSync(
      join(root, ".context-index", "manifest.yaml"),
      "project:\n  name: test\nbuild:\n  cost_warn_usd: 0.005\n",
    );
    writeFileSync(
      join(root, ".context-index", ".session-tracking.jsonl"),
      JSON.stringify({
        spec_ref: "specs/x.spec.md",
        usage: { cost_usd: 0.01 },
        timestamp: "2026-05-22T10:00:00Z",
      }) + "\n",
    );
    const r = runCli(["--spec", "specs/x.spec.md"], root);
    assert.equal(r.code, 0);
    assert.match(r.stderr, /\[cost warn\] spec cost \$0\.01.* threshold \$0\.005/);
  });

  it("suppresses [cost warn] when build.cost_warn_usd is invalid (negative)", () => {
    const root = setupRoot();
    writeFileSync(
      join(root, ".context-index", "manifest.yaml"),
      "project:\n  name: test\nbuild:\n  cost_warn_usd: -1\n",
    );
    writeFileSync(
      join(root, ".context-index", ".session-tracking.jsonl"),
      JSON.stringify({
        spec_ref: "specs/x.spec.md",
        usage: { cost_usd: 0.01 },
      }) + "\n",
    );
    const r = runCli(["--spec", "specs/x.spec.md"], root);
    assert.equal(r.code, 0);
    assert.match(r.stderr, /build\.cost_warn_usd is invalid/);
    assert.doesNotMatch(r.stderr, /\[cost warn\] spec cost/);
  });

  it("--help prints usage and exits 0", () => {
    const root = setupRoot();
    const r = spawnSync("node", [CLI, "cost", "--help"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /cost summary|Usage/);
  });
});

// ---------------------------------------------------------------------------
// Task 6: Read-only contract integration test
// ---------------------------------------------------------------------------

function snapshotDir(dir) {
  const entries = [];
  function walk(d, rel = "") {
    for (const name of readdirSync(d).sort()) {
      const abs = join(d, name);
      const r = rel ? rel + "/" + name : name;
      const st = statSync(abs);
      if (st.isDirectory()) walk(abs, r);
      else {
        const content = readFileSync(abs);
        entries.push(`${r}|${st.size}|${createHash("sha256").update(content).digest("hex")}`);
      }
    }
  }
  walk(dir);
  return entries.join("\n");
}

describe("adev cost summary — read-only contract (Task 6)", () => {
  it("does not mutate .context-index/ on any invocation path", () => {
    const root = setupRoot();
    // Populate with a fixture JSONL so the verb has work to do.
    writeFileSync(
      join(root, ".context-index", ".session-tracking.jsonl"),
      JSON.stringify({
        spec_ref: "specs/x.spec.md",
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_read_tokens: 0,
          cache_creation_tokens: 0,
          cost_usd: 0.001,
        },
        timestamp: "2026-05-22T10:00:00Z",
      }) + "\n",
    );
    const before = snapshotDir(join(root, ".context-index"));
    runCli(["--spec", "specs/x.spec.md", "--include-checkpoints", "--format", "json"], root);
    const after = snapshotDir(join(root, ".context-index"));
    assert.equal(
      before,
      after,
      ".context-index/ was mutated by a read-only verb invocation",
    );
  });

  it("does not mutate .context-index/ when JSONL is missing", () => {
    const root = setupRoot();
    const before = snapshotDir(join(root, ".context-index"));
    runCli(["--spec", "specs/x.spec.md"], root);
    const after = snapshotDir(join(root, ".context-index"));
    assert.equal(before, after);
  });
});
