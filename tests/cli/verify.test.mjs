// tests/cli/verify.test.mjs
//
// Tests for `adev verify` (lib/cli/verify.mjs) — PR 7 of the inline-Node
// extraction sweep. Wraps verifySpecImplemented and verifyIssueCompleted
// (formerly embedded in skills/validate/SKILL.md line 773 and
// skills/hygiene/SKILL.md line 543) into a single CLI verb.
//
// Spec: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md
//
// Contract:
//   - Module exports `run({...})` and `help()`.
//   - Does NOT export LIFECYCLE_STEP (observational helper).
//   - Exit codes: 0 success / 1 arg-error / 1 unexpected exception.

import { test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");

function makeTempProject() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-verify-test-")));
  mkdirSync(join(dir, ".context-index", "specs", "features", "m"), {
    recursive: true,
  });
  writeFileSync(
    join(dir, ".context-index", "manifest.yaml"),
    'project:\n  name: t\n  adev_version: "0.22.0"\n',
  );
  // Init a git repo so isGitTracked() can run without erroring.
  try {
    execSync("git init -q", { cwd: dir, stdio: "ignore" });
    execSync("git config user.email a@b.c && git config user.name t", {
      cwd: dir,
      stdio: "ignore",
    });
  } catch {
    /* ignore */
  }
  return dir;
}

function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function writeFile(dir, relPath, body) {
  const abs = join(dir, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
  return relPath;
}

const SAMPLE_SPEC = `---
charter: m
status: implemented
revision: 1
---

# Live Spec: Sample

## Behavioral Contract

Sample.

## Acceptance Criteria

- [x] Item one — tests/m/feature.test.mjs
`;

const SAMPLE_PLAN = `# Plan: Sample

> Spec: .context-index/specs/features/m/sample.spec.md

## File Structure

**Create:**
- lib/feature.mjs

**Modify:**
- lib/index.mjs

### Task 1: Implement

- [x] write tests
- [x] implement
`;

// ── Driver-substrate contract ─────────────────────────────────────────────

test("lib/cli/verify.mjs exports run and help", async () => {
  const mod = await import("../../lib/cli/verify.mjs");
  assert.strictEqual(typeof mod.run, "function");
  assert.strictEqual(typeof mod.help, "function");
});

test("lib/cli/verify.mjs does NOT export LIFECYCLE_STEP (observational helper)", async () => {
  const mod = await import("../../lib/cli/verify.mjs");
  assert.strictEqual(mod.LIFECYCLE_STEP, undefined);
});

// ── Usage / argument errors ──────────────────────────────────────────────

test("adev verify with no subcommand exits 1 with usage", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "verify"], { encoding: "utf8", cwd: dir });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /usage|spec|issue/i);
  } finally {
    cleanup(dir);
  }
});

test("adev verify with unknown subcommand exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "verify", "bogus"], { encoding: "utf8", cwd: dir });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /bogus|spec|issue/i);
  } finally {
    cleanup(dir);
  }
});

test("adev verify --help exits 0 and prints both subcommands", () => {
  const r = spawnSync("node", [CLI, "verify", "--help"], { encoding: "utf8" });
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /spec/);
  assert.match(r.stdout, /issue/);
});

// ── verify spec: arg errors ──────────────────────────────────────────────

test("adev verify spec without --spec exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "verify", "spec"], { encoding: "utf8", cwd: dir });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /--spec|usage/i);
  } finally {
    cleanup(dir);
  }
});

test("adev verify spec with out-of-bounds --spec path exits 1 (containment)", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "verify", "spec", "--spec", "../../../etc/passwd"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /escapes/i);
  } finally {
    cleanup(dir);
  }
});

// ── verify spec: happy path ──────────────────────────────────────────────

test("adev verify spec with missing spec returns confidence none, exit 0", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "verify",
        "spec",
        "--spec",
        ".context-index/specs/features/m/no-such.spec.md",
      ],
      { encoding: "utf8", cwd: dir },
    );
    // verifySpecImplemented handles missing-file internally; we exit 0 with
    // confidence: "none" in the JSON output.
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.implemented, false);
    assert.strictEqual(parsed.confidence, "none");
  } finally {
    cleanup(dir);
  }
});

test("adev verify spec on an existing spec returns a JSON verdict, exit 0", () => {
  const dir = makeTempProject();
  writeFile(dir, ".context-index/specs/features/m/sample.spec.md", SAMPLE_SPEC);
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "verify",
        "spec",
        "--spec",
        ".context-index/specs/features/m/sample.spec.md",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(typeof parsed.implemented, "boolean");
    assert.ok(typeof parsed.confidence === "string");
    assert.ok(Array.isArray(parsed.evidence));
  } finally {
    cleanup(dir);
  }
});

test("adev verify spec uses --plan when supplied", () => {
  const dir = makeTempProject();
  writeFile(dir, ".context-index/specs/features/m/sample.spec.md", SAMPLE_SPEC);
  writeFile(dir, ".context-index/specs/features/m/sample.plan.md", SAMPLE_PLAN);
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "verify",
        "spec",
        "--spec",
        ".context-index/specs/features/m/sample.spec.md",
        "--plan",
        ".context-index/specs/features/m/sample.plan.md",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(typeof parsed.implemented, "boolean");
    assert.ok(Array.isArray(parsed.evidence));
  } finally {
    cleanup(dir);
  }
});

// ── verify issue: arg errors ─────────────────────────────────────────────

test("adev verify issue without --issue-json exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "verify", "issue"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /--issue-json|usage/i);
  } finally {
    cleanup(dir);
  }
});

test("adev verify issue with malformed JSON exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "verify", "issue", "--issue-json", "{not-json"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /invalid.*json|JSON/i);
  } finally {
    cleanup(dir);
  }
});

test("adev verify issue with array JSON exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "verify", "issue", "--issue-json", "[1,2,3]"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /object/i);
  } finally {
    cleanup(dir);
  }
});

// ── verify issue: happy path ─────────────────────────────────────────────

test("adev verify issue with empty issue returns LOW confidence, exit 0", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "verify", "issue", "--issue-json", "{}"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.completed, false);
    assert.strictEqual(parsed.confidence, "low");
    assert.ok(typeof parsed.reason === "string");
  } finally {
    cleanup(dir);
  }
});

test("adev verify issue with plan_ref + plan_task and all checkboxes done returns MEDIUM confidence", () => {
  const dir = makeTempProject();
  writeFile(dir, ".context-index/specs/features/m/sample.plan.md", SAMPLE_PLAN);
  try {
    const issue = JSON.stringify({
      plan_ref: ".context-index/specs/features/m/sample.plan.md",
      plan_task: 1,
    });
    const r = spawnSync(
      "node",
      [CLI, "verify", "issue", "--issue-json", issue],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.completed, true);
    assert.strictEqual(parsed.confidence, "medium");
  } finally {
    cleanup(dir);
  }
});

test("adev verify issue --note augments JSON with formatted confidence note", () => {
  const dir = makeTempProject();
  writeFile(dir, ".context-index/specs/features/m/sample.plan.md", SAMPLE_PLAN);
  try {
    const issue = JSON.stringify({
      plan_ref: ".context-index/specs/features/m/sample.plan.md",
      plan_task: 1,
    });
    const r = spawnSync(
      "node",
      [
        CLI,
        "verify",
        "issue",
        "--issue-json",
        issue,
        "--note",
        "Validated",
        "--report-path",
        "report.md",
        "--files-verified",
        "5",
        "--tests-pass",
        "true",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.completed, true);
    assert.strictEqual(parsed.confidence, "medium");
    assert.ok(typeof parsed.note === "string");
    assert.match(parsed.note, /Validated/);
    assert.match(parsed.note, /MEDIUM/);
    assert.match(parsed.note, /report\.md/);
    assert.match(parsed.note, /Files verified: 5/);
    assert.match(parsed.note, /Tests: PASS/);
  } finally {
    cleanup(dir);
  }
});

test("adev verify issue --tests-pass false produces FAIL in note", () => {
  const dir = makeTempProject();
  writeFile(dir, ".context-index/specs/features/m/sample.plan.md", SAMPLE_PLAN);
  try {
    const issue = JSON.stringify({
      plan_ref: ".context-index/specs/features/m/sample.plan.md",
      plan_task: 1,
    });
    const r = spawnSync(
      "node",
      [
        CLI,
        "verify",
        "issue",
        "--issue-json",
        issue,
        "--note",
        "Validated",
        "--tests-pass",
        "false",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.match(parsed.note, /Tests: FAIL/);
  } finally {
    cleanup(dir);
  }
});
