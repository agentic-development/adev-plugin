// tests/governance/registry-effective-set.test.mjs
//
// THE byte-identity suite. The spec is explicit that the "materialization
// changes nothing that runs" claim must be a TEST, not an inspection: for each
// marked registry, the CANONICAL form of the effective set must be identical
// before and after `adev governance materialize`.
//
// Structured so Task 11 can extend it: `assertEffectiveSetUnchanged` takes the
// mutation to perform between the two canonicalisations, so removing a run-time
// overlay is a second call with a different mutation rather than a second copy
// of the loop.
//
// Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
// Plan-task: 9.

import { test, describe } from "node:test";
import assert from "node:assert";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { cleanupTempDir, createTempDir, writeFixture, PLUGIN_ROOT } from "../helpers.mjs";
import {
  MARKED_REGISTRY_NAMES,
  canonicalise,
  effectiveSet,
} from "../../lib/governance/materialize.mjs";
import { loadCheck1Gates, loadDoctorGates } from "../../lib/gates/gate-sets.mjs";
import { loadReviewConfig } from "../../lib/governance/review-config.mjs";

export function runCli(dir, args) {
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

/**
 * Seed a project whose three marked registries are all only PARTLY explicit —
 * gates and reviewers both draw entries from the domain overlay, which is the
 * condition materialization exists to remove.
 */
export function seedProject(dir) {
  writeFixture(
    dir,
    ".context-index/manifest.yaml",
    "project:\n  name: fixture\n  domain: software\n",
  );
  writeFixture(
    dir,
    ".context-index/governance/gates.yaml",
    [
      "# gates.yaml — fixture",
      "gates:",
      "  - id: test",
      "    name: Test Suite",
      '    command: ["npm", "test"]',
      "    severity: error",
      "    tier: fast",
      "",
      "transitions: {}",
      "",
    ].join("\n"),
  );
  writeFixture(
    dir,
    ".context-index/governance/review.yaml",
    "# review.yaml — fixture\nreviewers: []\n",
  );
  writeFixture(
    dir,
    ".context-index/governance/diagnostics.yaml",
    [
      "diagnostics:",
      "  - id: adev/event-schema-valid",
      "    runner: plugin:tier1/event-schema-valid.mjs",
      "    severity: error",
      "    tier: 1",
      "    scope: event-impact",
      "  - id: adev/status-enum-legal",
      "    runner: plugin:tier1/status-enum-legal.mjs",
      "    severity: error",
      "    tier: 1",
      "    scope: event-impact",
      "",
    ].join("\n"),
  );
  return dir;
}

/**
 * The reusable invariant. `mutate(dir)` performs whatever change is under test;
 * the canonical effective set must be identical on both sides of it.
 *
 * @param {string} dir Project root.
 * @param {(dir: string) => void|Promise<void>} mutate
 * @param {string} label Included in the assertion message.
 */
export async function assertEffectiveSetUnchanged(dir, mutate, label) {
  const before = {};
  for (const registry of MARKED_REGISTRY_NAMES) {
    before[registry] = canonicalise(await effectiveSet(dir, registry));
  }
  await mutate(dir);
  for (const registry of MARKED_REGISTRY_NAMES) {
    const after = canonicalise(await effectiveSet(dir, registry));
    assert.equal(after, before[registry], `${registry} effective set changed (${label})`);
  }
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

describe("registry effective set", () => {
  test("the marked registry names are review, diagnostics and gates", () => {
    assert.deepEqual([...MARKED_REGISTRY_NAMES].sort(), ["diagnostics", "gates", "review"]);
  });

  test(
    "effective set is byte-identical before and after materialization",
    withDir(async (dir) => {
      seedProject(dir);
      await assertEffectiveSetUnchanged(
        dir,
        (root) => {
          for (const registry of MARKED_REGISTRY_NAMES) {
            const r = runCli(root, ["governance", "materialize", "--registry", registry]);
            assert.equal(r.exitCode, 0, `${registry}: ${r.stderr}`);
          }
        },
        "materialize",
      );
    }),
  );

  test(
    "canonicalise sorts by id, sorts keys, and drops __source and materialized_at",
    () => {
      const a = canonicalise([
        { id: "b", __source: "domain", zeta: 1, alpha: 2 },
        { id: "a", materialized_at: "2026-01-01T00:00:00.000Z", source: "project" },
      ]);
      assert.equal(
        a,
        JSON.stringify([
          '{"id":"a","source":"project"}',
          '{"alpha":2,"id":"b","zeta":1}',
        ]),
      );
    },
  );

  test(
    "canonicalise keeps `source` — it is a declared field, not run-time provenance",
    () => {
      const withSource = canonicalise([{ id: "a", source: "bundled" }]);
      const without = canonicalise([{ id: "a" }]);
      assert.notEqual(withSource, without);
    },
  );

  // ── Invariant 2, Task 11 ────────────────────────────────────────────────
  //
  // Task 11 removed the run-time overlays. Invariant 2 says the effective set
  // must be UNCHANGED by that removal — which, stated as something a test can
  // check, is: once a registry is materialized, what the CONSUMERS resolve is
  // exactly what `effectiveSet` computed, and it no longer moves when the
  // overlay behind it moves.
  test(
    "after materialization the run-time set IS the effective set",
    withDir(async (dir) => {
      seedProject(dir);
      for (const registry of MARKED_REGISTRY_NAMES) {
        const r = runCli(dir, ["governance", "materialize", "--registry", registry]);
        assert.equal(r.exitCode, 0, `${registry}: ${r.stderr}`);
      }

      const gateIds = (await effectiveSet(dir, "gates")).map((g) => String(g.id)).sort();
      assert.deepEqual(
        loadCheck1Gates(dir, { moduleSlug: "m" }).gates.map((g) => String(g.id)).sort(),
        gateIds,
        "the consumer view must resolve the materialized set and nothing else",
      );
      assert.deepEqual(
        loadDoctorGates(dir).map((g) => String(g.id)).sort(),
        gateIds,
        "and the raw view must agree with it — there is nothing left to diverge",
      );

      assert.deepEqual(
        loadReviewConfig(dir).reviewers.map((r) => String(r.id)).sort(),
        (await effectiveSet(dir, "review")).map((r) => String(r.id)).sort(),
      );
    }),
  );

  test(
    "the run-time set does not move when the domain overlay behind it moves",
    withDir(async (dir) => {
      seedProject(dir);
      // A CUSTOM domain, because a bundled one cannot be overridden.
      writeFixture(dir, ".context-index/manifest.yaml", "domain: fixture-domain\n");
      writeFixture(
        dir,
        ".context-index/domains/fixture-domain/gates.yaml",
        'gates:\n  - id: adopted\n    command: ["npm", "run", "adopted"]\n',
      );
      const first = runCli(dir, ["governance", "materialize", "--registry", "gates"]);
      assert.equal(first.exitCode, 0, first.stderr);

      const before = loadCheck1Gates(dir, { moduleSlug: "m" }).gates.map((g) => g.id).sort();
      assert.ok(before.includes("adopted"), "the fixture must actually adopt a domain gate");

      writeFixture(
        dir,
        ".context-index/domains/fixture-domain/gates.yaml",
        'gates:\n  - id: adopted\n    command: ["npm", "run", "adopted"]\n' +
          '  - id: added-later\n    command: ["npm", "run", "later"]\n',
      );

      assert.deepEqual(
        loadCheck1Gates(dir, { moduleSlug: "m" }).gates.map((g) => g.id).sort(),
        before,
        "an un-adopted domain gate must not appear at run time",
      );
    }),
  );

  test(
    "a second materialize run leaves the effective set alone",
    withDir(async (dir) => {
      seedProject(dir);
      for (const registry of MARKED_REGISTRY_NAMES) {
        const r = runCli(dir, ["governance", "materialize", "--registry", registry]);
        assert.equal(r.exitCode, 0, r.stderr);
      }
      await assertEffectiveSetUnchanged(
        dir,
        (root) => {
          for (const registry of MARKED_REGISTRY_NAMES) {
            const r = runCli(root, ["governance", "materialize", "--registry", registry]);
            assert.equal(r.exitCode, 0, r.stderr);
          }
        },
        "second materialize",
      );
    }),
  );
});
