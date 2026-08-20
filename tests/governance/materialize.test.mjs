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
import {
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { cleanupTempDir, createTempDir, writeFixture, PLUGIN_ROOT } from "../helpers.mjs";
import {
  MARKED_REGISTRIES,
  readMarker,
  stampMarker,
} from "../../lib/governance/registry-marker.mjs";
import { deriveSource, effectiveSet } from "../../lib/governance/materialize.mjs";

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
    "project:\n  name: fixture\ndomain: software\n",
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
    "review materialization writes a domain reviewer's prompt_text verbatim (adev-plugin-xg1f.4)",
    withDir(async (dir) => {
      // Regression for the real end-to-end path a domain extension install
      // takes: `installDomainProfile()` copies `domain/reviewers.yaml` into
      // `.context-index/domains/<name>/reviewers.yaml`, and `adev governance
      // materialize --registry review` is the ONE sanctioned adoption step
      // (lib/governance/materialize.mjs header) that writes it into the
      // project's own file. That write goes through
      // `lib/extensions/governance-splice.mjs::emitEntry`, which re-checks
      // every scalar with `assertSafeScalar` — so `prompt_text` had to be
      // added to `FIELD_ALLOWLIST` (or the field is silently dropped by
      // `projectEntry`'s allowlist filter) AND the prose has to survive that
      // scalar-safety pass on its own merits. Comma-bearing prose does not:
      // `assertSafeScalar` refuses a literal `,` in any scalar, which is why
      // both first-party domain extensions' prompts were rewritten comma-free
      // rather than left as-is under the new field name.
      seedProject(dir);
      writeFixture(
        dir,
        ".context-index/domains/acme/reviewers.yaml",
        [
          "merge_strategy: append",
          "",
          "reviewers:",
          "  - id: acme-data-reviewer",
          '    name: "Acme Data Reviewer"',
          "    dispatch: always",
          '    prompt_text: "Review data contracts for schema completeness and SLA definitions."',
          "    profile: reviewer-capable",
          "    context_pack: base",
          "    severity_cap: blocker",
          "",
        ].join("\n"),
      );
      writeFixture(
        dir,
        ".context-index/manifest.yaml",
        "project:\n  name: fixture\ndomain: acme\n",
      );
      const r = runCli(dir, ["governance", "materialize", "--registry", "review"]);
      assert.equal(r.exitCode, 0, r.stderr);
      const text = readFileSync(join(dir, REVIEW), "utf8");
      assert.match(text, /- id: acme-data-reviewer/);
      assert.match(
        text,
        /prompt_text: Review data contracts for schema completeness and SLA definitions\./,
      );
      assert.match(text, /source: domain:acme/);
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

// ── The marker may not vouch for rows that never loaded ──────────────────────
//
// Review Stage 1, Important #1. A loader that DROPS a row still returns an
// entries array, and materializing off that array stamps "the entries above are
// the complete effective set" over rows nothing ever read. That is the exact
// failure the marker exists to prevent, so the load has to be complete before
// the stamp is earned.

/** A diagnostics registry whose two runners cannot be resolved (containment). */
const UNLOADABLE_DIAGNOSTICS = `# diagnostics.yaml — fixture
diagnostics:
  - id: adev/ghost-one
    runner: plugin:tier1/does-not-exist.mjs
    severity: error
    tier: 1
    scope: event-impact
  - id: adev/ghost-two
    runner: plugin:tier1/also-missing.mjs
    severity: error
    tier: 1
    scope: event-impact
`;

describe("materialize refuses to stamp an incomplete load", () => {
  test(
    "a diagnostics registry whose runners fail containment is refused, not stamped",
    withDir(async (dir) => {
      seedProject(dir, { diagnostics: UNLOADABLE_DIAGNOSTICS });
      const before = readFileSync(join(dir, DIAGNOSTICS), "utf8");

      const r = runCli(dir, ["governance", "materialize", "--registry", "diagnostics"]);
      assert.equal(r.exitCode, 1, r.stdout);
      assert.match(r.stderr, /MATERIALIZE_LOAD_INCOMPLETE/);
      assert.match(r.stderr, /adev\/ghost-one/);
      assert.match(r.stderr, /adev\/ghost-two/);

      assert.equal(readFileSync(join(dir, DIAGNOSTICS), "utf8"), before, "nothing may be written");
      assert.equal(readMarker(join(dir, DIAGNOSTICS)), null, "the marker may not be stamped");
    }),
  );

  test(
    "--dry-run reports the same refusal",
    withDir(async (dir) => {
      seedProject(dir, { diagnostics: UNLOADABLE_DIAGNOSTICS });
      const r = runCli(dir, [
        "governance", "materialize", "--registry", "diagnostics", "--dry-run",
      ]);
      assert.equal(r.exitCode, 1, r.stdout);
      assert.match(r.stderr, /MATERIALIZE_LOAD_INCOMPLETE/);
      assert.match(r.stderr, /adev\/ghost-one/);
      assert.equal(readMarker(join(dir, DIAGNOSTICS)), null);
    }),
  );

  test(
    "a project-only gate the merge dropped is refused, not blessed",
    withDir(async (dir) => {
      // `mergeGates` drops a shell-form command with an INVALID_GATE warning.
      // The id collides with nothing in the domain overlay, so the pre-existing
      // MATERIALIZE_WOULD_DROP check cannot see it: the id is simply absent from
      // the effective set. Without the load-completeness check the row would be
      // stamped as part of "the complete effective set" while running nowhere.
      seedProject(dir, {
        gates: 'gates:\n  - id: project-only\n    command: "npm run lint"\n',
      });
      const r = runCli(dir, ["governance", "materialize", "--registry", "gates"]);
      assert.equal(r.exitCode, 1, r.stdout);
      assert.match(r.stderr, /MATERIALIZE_LOAD_INCOMPLETE/);
      assert.match(r.stderr, /project-only/);
      assert.equal(readMarker(join(dir, GATES)), null);
    }),
  );

  test(
    "a WARNING-severity loader diagnostic is surfaced but does NOT block",
    withDir(async (dir) => {
      // A governance gate that overrides a domain gate emits GATE_OVERRIDE. No
      // row was lost, so the marker's claim stays true and the run proceeds —
      // the warning is reported on the envelope instead.
      seedProject(dir, {
        gates: 'gates:\n  - id: quality-gate\n    command: ["npm", "test"]\n',
      });
      const r = runCli(dir, ["governance", "materialize", "--registry", "gates", "--json"]);
      assert.equal(r.exitCode, 0, r.stderr);
      const env = JSON.parse(r.stdout);
      assert.ok(Array.isArray(env.warnings), "the envelope must carry the loader warnings");
      assert.deepEqual(env.warnings.map((w) => w.code), ["GATE_OVERRIDE"]);
      assert.match(String(readMarker(join(dir, GATES))), /^\d{4}-\d{2}-\d{2}T/);
    }),
  );
});

// ── DDR-4: the on-disk `source` vocabulary ───────────────────────────────────

describe("deriveSource implements the DDR-4 mapping", () => {
  test("every runtime provenance value the spec maps is mapped (+1 more contract assertions)", () => {
    // every runtime provenance value the spec maps is mapped
    assert.equal(deriveSource({ id: "a", __source: "bundled" }, "review", "software"), "bundled");
    assert.equal(deriveSource({ id: "a", __source: "project" }, "review", "software"), "project");
    assert.equal(deriveSource({ id: "a", __source: "governance" }, "review", "software"), "project");
    assert.equal(
    deriveSource({ id: "a", __source: "project-override" }, "review", "software"),
    "project",
    );
    assert.equal(
    deriveSource({ id: "a", __source: "manifest-specialist" }, "review", "software"),
    "project",
    );
    assert.equal(deriveSource({ id: "a", __source: "domain" }, "review", "acme"), "domain:acme");

    // diagnostics provenance comes from the runner prefix
    assert.equal(deriveSource({ id: "a", runner: "plugin:x.mjs" }, "diagnostics", null), "bundled");
    assert.equal(deriveSource({ id: "a", runner: "project:x.mjs" }, "diagnostics", null), "project");
  });

  test("a genuinely unknown provenance value still throws", () => {
    assert.throws(
      () => deriveSource({ id: "a", __source: "from-mars" }, "gates", "software"),
      (err) => err.code === "MATERIALIZE_SOURCE_UNMAPPED" && /from-mars/.test(err.message),
    );
  });


});

// ── `source` is origin-at-materialization, not current contributor ───────────

describe("the `source` field records provenance AT MATERIALIZATION TIME", () => {
  test(
    "a materialized row keeps its original domain slug after the domain changes",
    withDir(async (dir) => {
      seedProject(dir);
      // A custom domain (bundled `software` may not be overridden) contributing
      // one gate of its own.
      writeFixture(
        dir,
        ".context-index/domains/acme/gates.yaml",
        [
          "gates:",
          "  - id: acme-gate",
          '    description: "Acme house rule"',
          '    command: ["npm", "run", "acme"]',
          "    severity: error",
          "    tier: fast",
          "",
        ].join("\n"),
      );
      writeFixture(
        dir,
        ".context-index/manifest.yaml",
        "project:\n  name: fixture\ndomain: acme\n",
      );

      const first = runCli(dir, ["governance", "materialize", "--registry", "gates"]);
      assert.equal(first.exitCode, 0, first.stderr);
      assert.match(readFileSync(join(dir, GATES), "utf8"), /source: domain:acme/);

      // The project moves to another domain. Rule 3 never rewrites an on-disk
      // row, so `acme-gate`'s `source` cannot follow: it now reads as a domain
      // that no longer contributes anything. This is the CONTRACT, not a bug —
      // hygiene Pass 19 (Task 17) is the channel that surfaces the divergence.
      writeFixture(
        dir,
        ".context-index/manifest.yaml",
        "project:\n  name: fixture\ndomain: software\n",
      );
      const second = runCli(dir, ["governance", "materialize", "--registry", "gates"]);
      assert.equal(second.exitCode, 0, second.stderr);

      const text = readFileSync(join(dir, GATES), "utf8");
      assert.match(text, /source: domain:acme/, "the stale slug is preserved verbatim");
      assert.match(text, /- id: quality-gate/, "the new domain's gates are appended beside it");

      // And the live resolution agrees: `acme-gate` now physically lives in the
      // project's own file, so the merge labels it `governance` — yet `source`
      // still reads the domain it came from when it was materialized.
      const effective = await effectiveSet(dir, "gates");
      const acme = effective.find((g) => g.id === "acme-gate");
      assert.equal(acme.__source, "governance", "the CURRENT contributor is the project file");
      assert.equal(acme.source, "domain:acme", "`source` is origin-at-materialization");
    }),
  );
});

// ── Stage-2 review fixes (Task 9 CHANGES_REQUIRED) ──────────────────────────

describe("materialize — durability and honesty of the stamp", () => {
  test(
    "the registry write is atomic: no temp file survives and the content is whole",
    withDir(async (dir) => {
      seedProject(dir);
      const r = runCli(dir, ["governance", "materialize", "--registry", "gates"]);
      assert.equal(r.exitCode, 0, r.stderr);

      const govDir = join(dir, ".context-index", "governance");
      const stray = readdirSync(govDir).filter((f) => /\.tmp$/.test(f));
      assert.deepEqual(stray, [], `temp files left behind: ${stray.join(", ")}`);

      const text = readFileSync(join(dir, GATES), "utf8");
      assert.match(text, /- id: quality-gate/);
      assert.match(text, /^materialized_at: /m);
      assert.ok(text.endsWith("\n"), "the written file must not be truncated mid-line");
    }),
  );

  test(
    "a second real run rewrites nothing — the file's mtime is untouched",
    withDir(async (dir) => {
      seedProject(dir);
      assert.equal(runCli(dir, ["governance", "materialize", "--registry", "gates"]).exitCode, 0);
      const path = join(dir, GATES);
      const before = readFileSync(path, "utf8");
      const mtimeBefore = statSync(path).mtimeMs;

      const second = runCli(dir, ["governance", "materialize", "--registry", "gates"]);
      assert.equal(second.exitCode, 0, second.stderr);
      assert.equal(readFileSync(path, "utf8"), before, "a no-op run must not change the bytes");
      assert.equal(statSync(path).mtimeMs, mtimeBefore, "a no-op run must not touch the mtime");
    }),
  );

  test(
    "a corrupt marker reports materialized_at: null, exactly as readMarker sees it",
    withDir(async (dir) => {
      seedProject(dir, {
        gates: 'gates:\n  - id: test\n    command: ["npm", "test"]\n\nmaterialized_at: not-an-instant\n',
      });
      const r = runCli(dir, ["governance", "materialize", "--registry", "gates", "--json"]);
      assert.equal(r.exitCode, 0, r.stderr);
      const env = JSON.parse(r.stdout);
      assert.equal(
        env.materialized_at,
        null,
        "--json must not report a marker that readMarker calls null",
      );
      assert.equal(readMarker(join(dir, GATES)), null, "readMarker is the single reader");
      assert.equal(
        env.marker_written,
        false,
        "the write-once key was already present, so this run stamped nothing",
      );
    }),
  );
});

describe("materialize — manifest.yaml:specialists still dispatch (review Important #2)", () => {
  const SPECIALIST_MANIFEST = [
    "project:",
    "  name: fixture",
    "  domain: software",
    "specialists:",
    "  - id: db-expert",
    "    name: Database Expert",
    "    prompt: specialists/db.md",
    "",
  ].join("\n");

  test(
    "review materialization REFUSES while manifest.yaml declares specialists",
    withDir(async (dir) => {
      seedProject(dir);
      writeFixture(dir, ".context-index/manifest.yaml", SPECIALIST_MANIFEST);

      const before = readFileSync(join(dir, REVIEW), "utf8");
      const r = runCli(dir, ["governance", "materialize", "--registry", "review"]);
      assert.equal(r.exitCode, 1, r.stdout);
      assert.match(r.stderr, /MATERIALIZE_SPECIALISTS_DECLARED/);
      assert.match(r.stderr, /db-expert/, "the refusal must name the offending entries");
      assert.match(r.stderr, /reviewers/, "the refusal must name the remedy");
      assert.equal(readFileSync(join(dir, REVIEW), "utf8"), before, "nothing may be written");
    }),
  );

  test(
    "--dry-run refuses identically — the check is pre-write",
    withDir(async (dir) => {
      seedProject(dir);
      writeFixture(dir, ".context-index/manifest.yaml", SPECIALIST_MANIFEST);
      const r = runCli(dir, ["governance", "materialize", "--registry", "review", "--dry-run"]);
      assert.equal(r.exitCode, 1, r.stdout);
      assert.match(r.stderr, /MATERIALIZE_SPECIALISTS_DECLARED/);
    }),
  );

  test(
    "effectiveSet('review') refuses too, so no consumer sees the narrower set",
    withDir(async (dir) => {
      seedProject(dir);
      writeFixture(dir, ".context-index/manifest.yaml", SPECIALIST_MANIFEST);
      await assert.rejects(
        () => effectiveSet(dir, "review"),
        (err) => err.code === "MATERIALIZE_SPECIALISTS_DECLARED",
      );
    }),
  );

  test(
    "an EMPTY specialists list is not a declaration — review materializes normally",
    withDir(async (dir) => {
      seedProject(dir);
      writeFixture(
        dir,
        ".context-index/manifest.yaml",
        "project:\n  name: fixture\ndomain: software\nspecialists: []\n",
      );
      const r = runCli(dir, ["governance", "materialize", "--registry", "review"]);
      assert.equal(r.exitCode, 0, r.stderr);
    }),
  );

  test(
    "gates and diagnostics are unaffected — specialists only contribute reviewers",
    withDir(async (dir) => {
      seedProject(dir);
      writeFixture(dir, ".context-index/manifest.yaml", SPECIALIST_MANIFEST);
      for (const registry of ["gates", "diagnostics"]) {
        const r = runCli(dir, ["governance", "materialize", "--registry", registry]);
        assert.equal(r.exitCode, 0, `${registry}: ${r.stderr}`);
      }
    }),
  );
});
