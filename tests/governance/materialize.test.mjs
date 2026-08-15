// tests/governance/materialize.test.mjs
//
// Contract tests for `adev governance materialize` — the producer half of the
// explicit-registry work: it computes a registry's EFFECTIVE set through the
// existing merge machinery, writes the entries that were only implicit into the
// project's own governance file, and stamps a write-once `materialized_at`
// marker at the top level.
//
// Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
// Plan-task: 9. DDR-1 (the marked set and its two exemptions), DDR-7 (sibling
// keys and comments survive), DDR-15 / SEC-7 (symlink containment).

import { test, describe } from "node:test";
import assert from "node:assert";
import { readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { cleanupTempDir, createTempDir, writeFixture, PLUGIN_ROOT } from "../helpers.mjs";
import {
  MARKED_REGISTRIES,
  readMarker,
  stampMarker,
} from "../../lib/governance/registry-marker.mjs";

const GATES = ".context-index/governance/gates.yaml";
const REVIEW = ".context-index/governance/review.yaml";
const DIAGNOSTICS = ".context-index/governance/diagnostics.yaml";

/** Run the real CLI against `dir` as the project root. */
function runCli(dir, args) {
  const result = spawnSync("node", [join(PLUGIN_ROOT, "cli", "index.mjs"), ...args], {
    cwd: dir,
    encoding: "utf8",
    timeout: 30_000,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

const DEFAULT_GATES = `# gates.yaml — fixture
gates:
  - id: test
    name: Test Suite
    command: ["npm", "test"]
    severity: error
    tier: fast

# Lifecycle transition requirements
transitions:
  implement-to-validate:
    required_gates: ["test"]
    approver_role: maintainer

# trailing comment that must survive
`;

const DEFAULT_REVIEW = `# review.yaml — fixture
reviewers: []

# trailing comment that must survive
`;

const DEFAULT_DIAGNOSTICS = `# diagnostics.yaml — fixture
diagnostics:
  - id: adev/event-schema-valid
    runner: plugin:tier1/event-schema-valid.mjs
    severity: error
    tier: 1
    scope: event-impact
`;

/** A project root with a manifest and the three marked registries seeded. */
function seedProject(dir, overrides = {}) {
  writeFixture(
    dir,
    ".context-index/manifest.yaml",
    "project:\n  name: fixture\n  domain: software\n",
  );
  writeFixture(dir, GATES, overrides.gates ?? DEFAULT_GATES);
  writeFixture(dir, REVIEW, overrides.review ?? DEFAULT_REVIEW);
  writeFixture(dir, DIAGNOSTICS, overrides.diagnostics ?? DEFAULT_DIAGNOSTICS);
  return dir;
}

function withDir(fn) {
  return async () => {
    const dir = createTempDir();
    try {
      await fn(dir);
    } finally {
      cleanupTempDir(dir);
    }
  };
}

describe("registry-marker", () => {
  test("the marked set is exactly the three DDR-1 registries", () => {
    assert.deepEqual([...MARKED_REGISTRIES].sort(), [
      "diagnostics.yaml",
      "gates.yaml",
      "review.yaml",
    ]);
    assert.equal(MARKED_REGISTRIES.has("validate.yaml"), false);
    assert.equal(MARKED_REGISTRIES.has("boundaries.yaml"), false);
  });

  test(
    "readMarker returns null when the only materialized_at is an ENTRY field",
    withDir(async (dir) => {
      writeFixture(
        dir,
        GATES,
        [
          "gates:",
          "  - id: test",
          '    command: ["npm", "test"]',
          "    materialized_at: 2020-01-01T00:00:00.000Z",
          "",
        ].join("\n"),
      );
      assert.equal(readMarker(join(dir, GATES)), null);
    }),
  );

  test(
    "readMarker returns the ISO string for a top-level marker",
    withDir(async (dir) => {
      writeFixture(dir, GATES, "gates: []\nmaterialized_at: 2026-08-15T00:00:00.000Z\n");
      assert.equal(readMarker(join(dir, GATES)), "2026-08-15T00:00:00.000Z");
    }),
  );

  test(
    "readMarker returns null for an absent file",
    withDir(async (dir) => {
      assert.equal(readMarker(join(dir, "nope.yaml")), null);
    }),
  );

  test("stampMarker is write-once — a marked text is returned unchanged (===)", () => {
    const once = stampMarker("gates: []\n", "2026-08-15T00:00:00.000Z");
    assert.match(once, /^materialized_at: 2026-08-15T00:00:00\.000Z$/m);
    const twice = stampMarker(once, "2099-01-01T00:00:00.000Z");
    assert.equal(twice, once);
  });
});

describe("adev governance materialize", () => {
  test(
    "materialize is write-once and idempotent",
    withDir(async (dir) => {
      seedProject(dir);
      const first = runCli(dir, ["governance", "materialize", "--registry", "gates"]);
      assert.equal(first.exitCode, 0, first.stderr);
      const afterOne = readFileSync(join(dir, GATES), "utf8");
      const stampOne = readMarker(join(dir, GATES));
      assert.match(String(stampOne), /^\d{4}-\d{2}-\d{2}T/);

      const second = runCli(dir, ["governance", "materialize", "--registry", "gates"]);
      assert.equal(second.exitCode, 0, second.stderr);
      const afterTwo = readFileSync(join(dir, GATES), "utf8");

      assert.equal(afterTwo, afterOne, "second run must be byte-identical");
      assert.equal(readMarker(join(dir, GATES)), stampOne, "the stamp must be preserved verbatim");
    }),
  );

  test(
    "materialize makes the domain-contributed gates explicit",
    withDir(async (dir) => {
      seedProject(dir);
      const r = runCli(dir, ["governance", "materialize", "--registry", "gates"]);
      assert.equal(r.exitCode, 0, r.stderr);
      const text = readFileSync(join(dir, GATES), "utf8");
      assert.match(text, /- id: quality-gate/);
      assert.match(text, /- id: integration-test/);
      assert.match(text, /source: domain:software/);
    }),
  );

  test(
    "materialize preserves a populated transitions block byte-for-byte",
    withDir(async (dir) => {
      seedProject(dir);
      const before = readFileSync(join(dir, GATES), "utf8");
      const block = before.slice(before.indexOf("transitions:"), before.indexOf("# trailing"));
      assert.match(block, /approver_role: maintainer/);

      const r = runCli(dir, ["governance", "materialize", "--registry", "gates"]);
      assert.equal(r.exitCode, 0, r.stderr);

      const after = readFileSync(join(dir, GATES), "utf8");
      assert.ok(after.includes(block), "the transitions block must survive verbatim");
      assert.ok(
        after.includes("# trailing comment that must survive"),
        "the trailing comment must survive",
      );
      assert.ok(after.includes("# gates.yaml — fixture"), "the header comment must survive");
    }),
  );

  test(
    "materialize refuses rather than dropping an effective entry",
    withDir(async (dir) => {
      // A shell-form command is dropped by mergeGates, so the on-disk
      // `quality-gate` row does NOT reproduce the effective gate — and rule 3
      // forbids rewriting an entry already on disk. Refuse, naming it.
      seedProject(dir, {
        gates: 'gates:\n  - id: quality-gate\n    command: "npm test"\n',
      });
      const r = runCli(dir, ["governance", "materialize", "--registry", "gates"]);
      assert.equal(r.exitCode, 1);
      assert.match(r.stderr, /MATERIALIZE_WOULD_DROP/);
      assert.match(r.stderr, /quality-gate/);
    }),
  );

  test(
    "a symlinked registry outside the project is refused",
    withDir(async (dir) => {
      const outside = createTempDir();
      try {
        seedProject(dir);
        const target = join(outside, "elsewhere.yaml");
        writeFileSync(target, "gates: []\n");
        const link = join(dir, GATES);
        rmSync(link);
        symlinkSync(target, link);

        const r = runCli(dir, ["governance", "materialize", "--registry", "gates"]);
        assert.equal(r.exitCode, 1);
        assert.match(r.stderr, /containment/i);
        assert.equal(readFileSync(target, "utf8"), "gates: []\n");
      } finally {
        cleanupTempDir(outside);
      }
    }),
  );

  test(
    "--dry-run writes nothing and prints a diff",
    withDir(async (dir) => {
      seedProject(dir);
      const path = join(dir, GATES);
      const before = readFileSync(path, "utf8");
      const mtimeBefore = statSync(path).mtimeMs;

      const r = runCli(dir, ["governance", "materialize", "--registry", "gates", "--dry-run"]);
      assert.equal(r.exitCode, 0, r.stderr);
      assert.match(r.stdout, /^\+.*quality-gate/m);

      assert.equal(readFileSync(path, "utf8"), before, "--dry-run must not write");
      assert.equal(statSync(path).mtimeMs, mtimeBefore, "--dry-run must not touch mtime");
    }),
  );

  test(
    "--json emits the documented envelope",
    withDir(async (dir) => {
      seedProject(dir);
      const r = runCli(dir, ["governance", "materialize", "--registry", "gates", "--json"]);
      assert.equal(r.exitCode, 0, r.stderr);
      const env = JSON.parse(r.stdout);
      assert.equal(env.registry, "gates");
      assert.equal(env.path, GATES);
      assert.equal(env.root_key, "gates");
      assert.equal(env.dry_run, false);
      assert.equal(env.changed, true);
      assert.equal(env.marker_written, true);
      assert.deepEqual(env.already_explicit, ["test"]);
      assert.deepEqual(env.newly_written, ["quality-gate", "integration-test"]);
      assert.match(env.materialized_at, /^\d{4}-\d{2}-\d{2}T/);
    }),
  );

  test(
    "an unknown --registry name exits 1 naming the valid set",
    withDir(async (dir) => {
      seedProject(dir);
      const r = runCli(dir, ["governance", "materialize", "--registry", "bogus"]);
      assert.equal(r.exitCode, 1);
      assert.match(r.stderr, /review/);
      assert.match(r.stderr, /diagnostics/);
      assert.match(r.stderr, /gates/);
    }),
  );

  for (const exempt of ["validate", "boundaries"]) {
    test(
      `materializing the exempt registry '${exempt}' is refused, naming the exemption`,
      withDir(async (dir) => {
        seedProject(dir);
        writeFixture(dir, `.context-index/governance/${exempt}.yaml`, `${exempt}: []\n`);
        const r = runCli(dir, ["governance", "materialize", "--registry", exempt]);
        assert.equal(r.exitCode, 1);
        assert.match(r.stderr, /exempt/i);
        assert.match(r.stderr, new RegExp(exempt));
        assert.equal(readMarker(join(dir, `.context-index/governance/${exempt}.yaml`)), null);
      }),
    );
  }

  test(
    "review materialization writes the bundled reviewers and keeps sibling text",
    withDir(async (dir) => {
      seedProject(dir);
      const r = runCli(dir, ["governance", "materialize", "--registry", "review"]);
      assert.equal(r.exitCode, 0, r.stderr);
      const text = readFileSync(join(dir, REVIEW), "utf8");
      assert.match(text, /- id: structural-architect/);
      assert.match(text, /- id: security-reviewer/);
      assert.match(text, /- id: consistency-analyzer/);
      assert.ok(text.includes("# trailing comment that must survive"));
      assert.match(String(readMarker(join(dir, REVIEW))), /^\d{4}-\d{2}-\d{2}T/);
    }),
  );

  test(
    "diagnostics materialization adds no entry but does stamp the marker",
    withDir(async (dir) => {
      seedProject(dir);
      const before = readFileSync(join(dir, DIAGNOSTICS), "utf8");
      const r = runCli(dir, ["governance", "materialize", "--registry", "diagnostics"]);
      assert.equal(r.exitCode, 0, r.stderr);
      const after = readFileSync(join(dir, DIAGNOSTICS), "utf8");
      assert.ok(after.startsWith(before), "no entry may be inserted");
      assert.match(String(readMarker(join(dir, DIAGNOSTICS))), /^\d{4}-\d{2}-\d{2}T/);
    }),
  );
});
