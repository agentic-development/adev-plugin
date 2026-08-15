// tests/cli/domain.test.mjs
//
// Tests for `adev domain` (lib/cli/domain.mjs) — Task 6 of the inline-Node
// extraction sweep (PR 6: Extract domain-aware gate / reviewer / test-config /
// verification loading from skills/{validate,review-specs,implement}/SKILL.md).
//
// Spec: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md
// Plan: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.plan.md (Task 6)
// Source SKILL.md behaviors:
//   skills/validate/SKILL.md      "Domain-Aware Gate Loading"      → load-gates
//   skills/review-specs/SKILL.md  "Domain-Aware Reviewer Loading"  → load-reviewers
//   skills/implement/SKILL.md     "Domain-Aware Test Config"       → load-test-config
//   skills/implement/SKILL.md     "Domain-Aware Verification Config" → load-verification
//
// Multi-mode helper per spec Behavior 9 — CLI-verb naming is canonical and
// shared. A single `adev domain <subcommand>` verb dispatches to the four
// domain config types, returning JSON `{ domain, config|gates|reviewers, warnings }`.
//
// Contract (driver-substrate.spec.md):
//   - Module exports `run({ projectRoot, argv, manifest })` and `help()`.
//   - Does NOT export LIFECYCLE_STEP — domain config loading is observational
//     metadata inside lifecycle steps; it is not a step entry/exit. The
//     cli-driver pattern test will NOT assert requireGate-first.
//   - Exit codes:
//       0  success (config emitted to stdout as JSON)
//       1  argument error, containment violation, or domain config error
//
// CLI surface:
//   adev domain load-gates         --module <slug> [--charter <path>] [--governance <path>]
//   adev domain load-reviewers     --module <slug> [--charter <path>] [--governance <path>]
//   adev domain load-test-config   --module <slug> [--charter <path>]
//   adev domain load-verification  --module <slug> [--charter <path>] [--mcp-server <name>...]
//   adev domain --help

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

import { stampMarker } from "../../lib/governance/registry-marker.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");

function makeTempProject({ withManifest = true, withCharter = false } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-domain-test-")));
  mkdirSync(join(dir, ".context-index", "specs", "features", "m"), {
    recursive: true,
  });
  mkdirSync(join(dir, ".context-index", "governance"), { recursive: true });
  if (withManifest) {
    writeFileSync(
      join(dir, ".context-index", "manifest.yaml"),
      [
        "project:",
        '  name: t',
        '  adev_version: "0.22.0"',
        "modules:",
        "  - slug: m",
        "    name: M",
        "    paths:",
        "      - src/",
        "",
      ].join("\n"),
    );
  }
  return dir;
}

function writeCharter(dir, moduleSlug, frontmatter) {
  const path = join(
    dir,
    ".context-index",
    "specs",
    "features",
    moduleSlug,
    "charter.md",
  );
  const fmLines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`);
  const body = [
    "---",
    ...fmLines,
    "---",
    `# Charter: ${moduleSlug}`,
    "",
  ].join("\n");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  return path;
}

function writeGovernanceGates(dir, gates) {
  const lines = ["gates:"];
  for (const g of gates) {
    lines.push(`  - id: ${g.id}`);
    lines.push(`    command:`);
    for (const tok of g.command) {
      lines.push(`      - ${JSON.stringify(tok)}`);
    }
    if (g.tier) lines.push(`    tier: ${g.tier}`);
    if (g.severity) lines.push(`    severity: ${g.severity}`);
  }
  // Fixture maintenance (Task 10): gates.yaml is a MARKED registry and
  // `adev domain load-gates` now fails closed without a `materialized_at`
  // marker. Seeded already-materialized — these tests assert on the merge
  // result, not on materialization.
  writeFileSync(
    join(dir, ".context-index", "governance", "gates.yaml"),
    stampMarker(lines.join("\n") + "\n", "2026-08-15T00:00:00Z"),
  );
}

function writeGovernanceReview(dir, reviewers) {
  const lines = ["reviewers:"];
  for (const r of reviewers) {
    lines.push(`  - id: ${r.id}`);
    if (r.name) lines.push(`    name: ${JSON.stringify(r.name)}`);
    if (r.dispatch) lines.push(`    dispatch: ${r.dispatch}`);
  }
  // Same fixture maintenance for review.yaml, the other MARKED registry this
  // verb reads.
  writeFileSync(
    join(dir, ".context-index", "governance", "review.yaml"),
    stampMarker(lines.join("\n") + "\n", "2026-08-15T00:00:00Z"),
  );
}

function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// ── Driver-substrate contract ─────────────────────────────────────────────

test("lib/cli/domain.mjs exports run and help", async () => {
  const mod = await import("../../lib/cli/domain.mjs");
  assert.strictEqual(typeof mod.run, "function");
  assert.strictEqual(typeof mod.help, "function");
});

test("lib/cli/domain.mjs does NOT export LIFECYCLE_STEP (observational helper)", async () => {
  const mod = await import("../../lib/cli/domain.mjs");
  assert.strictEqual(mod.LIFECYCLE_STEP, undefined);
});

// ── Usage / argument errors ──────────────────────────────────────────────

test("adev domain with no subcommand exits 1 with usage", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "domain"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(
      r.stderr + r.stdout,
      /usage|load-gates|load-reviewers|load-test-config|load-verification/i,
    );
  } finally {
    cleanup(dir);
  }
});

test("adev domain with unknown subcommand exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "domain", "bogus"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /usage|bogus/i);
  } finally {
    cleanup(dir);
  }
});

test("adev domain --help exits 0 and prints usage with all subcommands", () => {
  const r = spawnSync("node", [CLI, "domain", "--help"], {
    encoding: "utf8",
  });
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /load-gates/);
  assert.match(r.stdout, /load-reviewers/);
  assert.match(r.stdout, /load-test-config/);
  assert.match(r.stdout, /load-verification/);
});

// ── Charter containment ───────────────────────────────────────────────────

test("adev domain load-gates with out-of-bounds --charter path exits 1 (containment)", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "domain",
        "load-gates",
        "--module",
        "m",
        "--charter",
        "../../../etc/passwd",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /escapes|charter|not found/i);
  } finally {
    cleanup(dir);
  }
});

// ── load-gates: default domain (no module/charter declares one) ──────────

test("adev domain load-gates emits JSON with bundled software gates when no domain declared", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "domain", "load-gates", "--module", "m"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.domain.resolved_domain, "software");
    assert.strictEqual(out.domain.source_level, "default");
    // Bundled software/gates.yaml has one gate: quality-gate
    assert.ok(Array.isArray(out.gates));
    const ids = out.gates.map((g) => g.id);
    assert.ok(ids.includes("quality-gate"), `expected quality-gate in: ${ids.join(", ")}`);
  } finally {
    cleanup(dir);
  }
});

// ── load-gates: merge governance ──────────────────────────────────────────

test("adev domain load-gates merges governance/gates.yaml on top of domain gates (governance wins on id conflict)", () => {
  const dir = makeTempProject();
  try {
    // Governance overrides the bundled quality-gate id with a different command.
    writeGovernanceGates(dir, [
      { id: "quality-gate", command: ["npm", "run", "lint"], tier: "fast", severity: "error" },
      { id: "custom-gate", command: ["./bin/custom"], tier: "integration" },
    ]);

    const r = spawnSync(
      "node",
      [CLI, "domain", "load-gates", "--module", "m"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    const out = JSON.parse(r.stdout);

    const gateById = Object.fromEntries(out.gates.map((g) => [g.id, g]));
    assert.ok(gateById["quality-gate"], "expected quality-gate in merged set");
    assert.deepStrictEqual(gateById["quality-gate"].command, ["npm", "run", "lint"]);
    assert.strictEqual(gateById["quality-gate"].__source, "governance");
    assert.ok(gateById["custom-gate"], "expected custom-gate in merged set");

    // mergeGates emits GATE_OVERRIDE warning when governance overrides domain.
    const codes = (out.warnings ?? []).map((w) => w.code);
    assert.ok(codes.includes("GATE_OVERRIDE"), `expected GATE_OVERRIDE in warnings: ${codes.join(", ")}`);
  } finally {
    cleanup(dir);
  }
});

// ── load-gates: charter-level domain ─────────────────────────────────────

test("adev domain load-gates resolves domain from charter frontmatter when present", () => {
  const dir = makeTempProject();
  try {
    // Software is the only bundled domain — assert source_level reflects
    // charter-level resolution rather than default fallback.
    writeCharter(dir, "m", { domain: "software" });
    const r = spawnSync(
      "node",
      [
        CLI,
        "domain",
        "load-gates",
        "--module",
        "m",
        "--charter",
        ".context-index/specs/features/m/charter.md",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.domain.resolved_domain, "software");
    assert.strictEqual(out.domain.source_level, "charter");
  } finally {
    cleanup(dir);
  }
});

// ── load-gates: invalid domain name ──────────────────────────────────────

test("adev domain load-gates fails with invalid charter domain name", () => {
  const dir = makeTempProject();
  try {
    writeCharter(dir, "m", { domain: "Bad/Name" });
    const r = spawnSync(
      "node",
      [
        CLI,
        "domain",
        "load-gates",
        "--module",
        "m",
        "--charter",
        ".context-index/specs/features/m/charter.md",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /INVALID_DOMAIN_NAME|invalid domain/i);
  } finally {
    cleanup(dir);
  }
});

// ── load-reviewers ────────────────────────────────────────────────────────

test("adev domain load-reviewers emits JSON with bundled software reviewers", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "domain", "load-reviewers", "--module", "m"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.domain.resolved_domain, "software");
    assert.ok(Array.isArray(out.reviewers));
    const ids = out.reviewers.map((r) => r.id);
    assert.ok(ids.includes("structural-architect"), `got: ${ids.join(", ")}`);
    assert.ok(ids.includes("security-reviewer"));
    assert.ok(ids.includes("consistency-analyzer"));
  } finally {
    cleanup(dir);
  }
});

test("adev domain load-reviewers merges governance/review.yaml on top of domain reviewers", () => {
  const dir = makeTempProject();
  try {
    writeGovernanceReview(dir, [
      { id: "structural-architect", name: "Project-Specific Architect", dispatch: "always" },
      { id: "custom-reviewer", name: "Custom", dispatch: "triggered" },
    ]);
    const r = spawnSync(
      "node",
      [CLI, "domain", "load-reviewers", "--module", "m"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    const out = JSON.parse(r.stdout);
    const byId = Object.fromEntries(out.reviewers.map((r) => [r.id, r]));
    assert.strictEqual(byId["structural-architect"].name, "Project-Specific Architect");
    assert.strictEqual(byId["structural-architect"].__source, "governance");
    assert.ok(byId["custom-reviewer"]);
  } finally {
    cleanup(dir);
  }
});

// ── load-test-config ──────────────────────────────────────────────────────

test("adev domain load-test-config emits JSON with permitted_tools and skip_patterns from software defaults", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "domain", "load-test-config", "--module", "m"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.domain.resolved_domain, "software");
    assert.ok(Array.isArray(out.config.permitted_tools));
    assert.ok(out.config.permitted_tools.includes("node:test"));
    assert.ok(out.config.permitted_tools.includes("jest"));
    assert.ok(Array.isArray(out.config.skip_patterns));
    assert.ok(out.config.skip_patterns.length > 0);
    assert.strictEqual(typeof out.config.max_test_file_size, "number");
  } finally {
    cleanup(dir);
  }
});

// ── load-verification ─────────────────────────────────────────────────────

test("adev domain load-verification emits JSON for the bundled software verification overlay (no MCP servers)", () => {
  const dir = makeTempProject();
  try {
    // No --mcp-server flag means activeServers is empty; software/verification.yaml
    // declares tool: playwright, which fails MCP validation and returns null config.
    const r = spawnSync(
      "node",
      [CLI, "domain", "load-verification", "--module", "m"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.domain.resolved_domain, "software");
    // config is null because activeServers does not include "playwright".
    assert.strictEqual(out.config, null);
    const codes = (out.warnings ?? []).map((w) => w.code);
    assert.ok(
      codes.includes("TOOL_UNAVAILABLE"),
      `expected TOOL_UNAVAILABLE in warnings: ${codes.join(", ")}`,
    );
  } finally {
    cleanup(dir);
  }
});

test("adev domain load-verification with --mcp-server playwright produces a valid config object", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "domain",
        "load-verification",
        "--module",
        "m",
        "--mcp-server",
        "playwright",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.config.type, "visual");
    assert.strictEqual(out.config.tool, "playwright");
    assert.ok(Array.isArray(out.config.trigger_patterns));
    assert.ok(out.config.trigger_patterns.includes("*.tsx"));
  } finally {
    cleanup(dir);
  }
});

// ── Missing manifest is tolerated (no modules → uses default domain) ──────

test("adev domain load-gates works when manifest.yaml is absent (default domain)", () => {
  const dir = makeTempProject({ withManifest: false });
  try {
    const r = spawnSync(
      "node",
      [CLI, "domain", "load-gates", "--module", "m"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.domain.resolved_domain, "software");
    assert.strictEqual(out.domain.source_level, "default");
  } finally {
    cleanup(dir);
  }
});

// ── --module is required ──────────────────────────────────────────────────

test("adev domain load-gates without --module exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "domain", "load-gates"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /--module|usage/i);
  } finally {
    cleanup(dir);
  }
});

// ── PR 8-9: `resolve` subcommand ─────────────────────────────────────────

test("domain resolve without --module exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "domain", "resolve"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--module|usage/i);
  } finally {
    cleanup(dir);
  }
});

test("domain resolve returns JSON with resolved_domain (manifest module default)", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "domain", "resolve", "--module", "m"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0);
    const parsed = JSON.parse(r.stdout.trim());
    assert.ok(parsed.domain);
    assert.strictEqual(typeof parsed.domain.resolved_domain, "string");
    // No gates/reviewers/config/warnings in resolve mode — domain-only.
    assert.strictEqual(parsed.gates, undefined);
    assert.strictEqual(parsed.reviewers, undefined);
  } finally {
    cleanup(dir);
  }
});

test("domain resolve with charter frontmatter overrides manifest domain", () => {
  const dir = makeTempProject();
  writeCharter(dir, "m", { domain: "data-engineering" });
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "domain",
        "resolve",
        "--module",
        "m",
        "--charter",
        ".context-index/specs/features/m/charter.md",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0);
    const parsed = JSON.parse(r.stdout.trim());
    assert.strictEqual(parsed.domain.resolved_domain, "data-engineering");
  } finally {
    cleanup(dir);
  }
});
