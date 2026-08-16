/**
 * Task 2 — the gate doctor and the gate CONSUMERS must be looking at the same
 * set of gates.
 *
 * Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
 *
 * The defect, reproduced from the repo's own files at planning time:
 *
 *   .context-index/governance/gates.yaml declared `command: "npm test"` — a
 *   YAML string. `lib/domains/merge-gates.mjs::validateGate` requires an argv
 *   list and DROPS anything else with an INVALID_GATE warning, so
 *   `adev domain load-gates` returned a gate set with no `test` in it. Meanwhile
 *   `lib/gates/doctor.mjs::loadGates` reads the raw file and happily analysed
 *   `test`, pronouncing healthy a gate no consumer would ever run.
 *
 * One file, two consumers, two answers. These tests pin the two findings that
 * make that visible, and pin the shipped governance file's argv form so the
 * reproduction cannot come back.
 *
 * Fixtures are seeded the way production resolves them — a manifest, a custom
 * domain directory under .context-index/domains/, and a governance gates.yaml —
 * because the whole point is that the doctor walks the SAME path the consumers
 * walk. No injection option is used; `runGateDoctor` takes none.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { runGateDoctor } from "../../lib/gates/doctor.mjs";
import { loadCheck1Gates, loadDoctorGates } from "../../lib/gates/gate-sets.mjs";
import { mergeGates } from "../../lib/domains/merge-gates.mjs";
import { parseYaml } from "../../lib/profiles/yaml.mjs";
import { stampMarker } from "../../lib/governance/registry-marker.mjs";
import { PLUGIN_ROOT, createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

const GATES_REL = ".context-index/governance/gates.yaml";

/**
 * Run the doctor statically against a fixture project, with the reentrancy
 * guard cleared so the suite behaves the same whether or not it is itself
 * running inside a gate.
 *
 * @param {string} dir Project root.
 */
function runDoctor(dir) {
  const env = { ...process.env };
  delete env.ADEV_GATE_DOCTOR;
  return runGateDoctor({ projectRoot: dir, gatesPath: GATES_REL, env });
}

/** All finding ids emitted by a report. */
function ids(report) {
  return report.findings.map((f) => f.id);
}

/**
 * Seed a CUSTOM domain that contributes one gate, plus the manifest that
 * selects it. `software` is a bundled domain and cannot be overridden
 * (`BUNDLED_OVERRIDE_BLOCKED`), so a custom domain is the only honest way to
 * put a domain-only gate in front of `loadDomainConfig`.
 *
 * @param {string} dir Project root.
 * @param {string} domain Custom domain name.
 * @param {string} gateId The gate the domain contributes.
 */
function seedCustomDomain(dir, domain, gateId) {
  writeFixture(dir, ".context-index/manifest.yaml", `project:\n  domain: ${domain}\n`);
  writeFixture(
    dir,
    `.context-index/domains/${domain}/gates.yaml`,
    `gates:\n  - id: ${gateId}\n    command: ["npm", "run", "x"]\n    tier: fast\n`,
  );
}

describe("gate-set divergence between the raw file and the merged consumer view", () => {
  it("names a dropped gate and no longer credits the domain overlay", async () => {
    const dir = createTempDir();
    try {
      // Fixture maintenance (Task 11), and an INVERSION of the assertion that
      // used to sit here. Before Task 11 this test asserted BOTH directions:
      // `domain-only` was contributed by the overlay and never appeared in the
      // raw file, and `proj-only` is declared in string form, which `mergeGates`
      // drops. The first direction asserted the OLD contract — that a domain
      // overlay contributes at run time — so it is inverted rather than
      // deleted. The drop direction is unchanged and still the one that
      // produced the original defect.
      seedCustomDomain(dir, "fixture-domain", "domain-only");
      writeFixture(dir, GATES_REL, 'gates:\n  - id: proj-only\n    command: "npm test"\n');

      const report = await runDoctor(dir);
      const f = report.findings.find((x) => x.id === "gate-doctor/gate-set-divergence");

      assert.ok(f, `divergence must be reported; got ${JSON.stringify(ids(report))}`);
      assert.equal(f.severity, "warning");
      assert.match(
        f.message,
        /proj-only/,
        "a gate the raw file declares but the consumers never run must be named",
      );
      assert.equal(
        /domain-only/.test(f.message),
        false,
        "the domain overlay no longer contributes at run time, so it cannot be a divergence",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("names a raw gate the consumers drop", async () => {
    const dir = createTempDir();
    try {
      // No domain overlay contributions of its own, so the only asymmetry is
      // the dropped string-form gate.
      seedCustomDomain(dir, "fixture-domain", "shared");
      writeFixture(
        dir,
        GATES_REL,
        'gates:\n  - id: shared\n    command: ["npm", "run", "x"]\n' +
          '  - id: dropped\n    command: "npm test"\n',
      );

      const report = await runDoctor(dir);
      const f = report.findings.find((x) => x.id === "gate-doctor/gate-set-divergence");

      assert.ok(f, `divergence must be reported; got ${JSON.stringify(ids(report))}`);
      assert.match(
        f.message,
        /dropped/,
        "a gate declared in gates.yaml that no consumer runs must be named",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("does not diagnose a malformed-manifest project against the default domain", async () => {
    const dir = createTempDir();
    try {
      // The manifest exists, declares a NON-default domain, and does not parse.
      // Treating that as "no manifest" resolves DEFAULT_DOMAIN (software) and
      // produces a confidently wrong divergence naming the software starter's
      // gates — gates this project never runs. "Uncomputable" is the only
      // honest answer.
      writeFixture(dir, ".context-index/manifest.yaml", "project:\n  domain: research\n   bad: 1\n");
      writeFixture(dir, GATES_REL, 'gates:\n  - id: proj-only\n    command: ["npm", "test"]\n');

      const report = await runDoctor(dir);

      assert.equal(
        ids(report).includes("gate-doctor/gate-set-divergence"),
        false,
        `a domain that could not be resolved must not be guessed; got ${JSON.stringify(ids(report))}`,
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("stays silent when both views agree", async () => {
    const dir = createTempDir();
    try {
      seedCustomDomain(dir, "fixture-domain", "agreed");
      writeFixture(dir, GATES_REL, 'gates:\n  - id: agreed\n    command: ["npm", "run", "x"]\n');

      const report = await runDoctor(dir);

      assert.equal(
        ids(report).includes("gate-doctor/gate-set-divergence"),
        false,
        `identical gate sets must not be reported as divergent; got ${JSON.stringify(ids(report))}`,
      );
    } finally {
      cleanupTempDir(dir);
    }
  });
});

// ── The two gate-set loaders, as named seams ────────────────────────────────

describe("the two gate-set loaders", () => {
  it("are separately addressable and each returns its own view", () => {
    const dir = createTempDir();
    try {
      seedCustomDomain(dir, "fixture-domain", "domain-only");
      // Fixture maintenance (Task 10): only the CONSUMER view guards the
      // marker, and this test drives it directly. The doctor tests above pass
      // a pre-read governance document and stay deliberately unguarded — that
      // asymmetry is the point, so nothing here is weakened.
      writeFixture(
        dir,
        GATES_REL,
        stampMarker('gates:\n  - id: test\n    command: ["npm", "test"]\n', "2026-08-15T00:00:00Z"),
      );

      assert.equal(typeof loadDoctorGates, "function");
      assert.equal(typeof loadCheck1Gates, "function");

      // The doctor view is the raw file and nothing else.
      const raw = loadDoctorGates(dir);
      assert.deepEqual(
        raw.map((g) => g.id).sort(),
        ["test"],
        "the raw view must be gates.yaml verbatim — no overlay contributions",
      );

      // Fixture maintenance (Task 11) — an INVERSION. This asserted the OLD
      // contract, that the consumer view carries the overlay's contribution.
      // The two views now agree on membership; what still distinguishes them is
      // that the consumer view is RESOLVED (tier defaulted, `command_sha`
      // stamped, unrunnable rows dropped) while the doctor view is verbatim.
      const merged = loadCheck1Gates(dir, { moduleSlug: "m" });
      assert.deepEqual(
        merged.gates.map((g) => g.id).sort(),
        ["test"],
        "the consumer view must NOT include the overlay's contribution",
      );
      assert.equal(merged.gates[0].tier, "fast", "the consumer view resolves the tier default");
      assert.equal(typeof merged.gates[0].command_sha, "string");
      assert.equal(raw[0].tier, undefined, "the raw view resolves nothing");
      assert.equal(merged.domain.resolved_domain, "fixture-domain");
      assert.ok(Array.isArray(merged.warnings));
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("agrees with the CLI verb `domain load-gates` on the merged id set", () => {
    const dir = createTempDir();
    try {
      // If `loadCheck1Gates` and `adev domain load-gates` can disagree, the
      // duplication this task removed has grown back: the doctor would be
      // diagnosing a merged set no consumer of the CLI verb ever reads.
      seedCustomDomain(dir, "fixture-domain", "domain-only");
      writeFixture(
        dir,
        GATES_REL,
        stampMarker(
          'gates:\n  - id: test\n    command: ["npm", "test"]\n' +
            '  - id: dropped\n    command: "npm run x"\n',
          "2026-08-15T00:00:00Z",
        ),
      );

      const cli = spawnSync(
        process.execPath,
        [join(PLUGIN_ROOT, "cli", "index.mjs"), "domain", "load-gates", "--module", "m"],
        { cwd: dir, encoding: "utf8", timeout: 30_000 },
      );
      assert.equal(cli.status, 0, `CLI failed: ${cli.stderr}`);
      const fromCli = JSON.parse(cli.stdout);

      const fromLib = loadCheck1Gates(dir, { moduleSlug: "m" });

      assert.deepEqual(
        fromLib.gates.map((g) => g.id).sort(),
        fromCli.gates.map((g) => g.id).sort(),
        "the library seam and the CLI verb must resolve one and the same merged gate set",
      );
      assert.deepEqual(fromLib.domain, fromCli.domain);
      assert.deepEqual(fromLib.warnings, fromCli.warnings);
      assert.equal(
        fromCli.gates.some((g) => g.id === "dropped"),
        false,
        "the fixture must actually exercise a drop, or the comparison proves nothing",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });
});

// ── The equality Task 11 makes true ─────────────────────────────────────────

describe("the doctor's gate set equals the set Check 1 executes", () => {
  it("agrees on a materialized project with no domain of its own", () => {
    const dir = createTempDir();
    try {
      // Task 11: the effective set is the materialized project file and
      // nothing else. No manifest here, so the project resolves the DEFAULT
      // domain — whose bundled overlay used to contribute `quality-gate` and
      // `integration-test` to the consumer view and to no other view.
      writeFixture(
        dir,
        GATES_REL,
        stampMarker('gates:\n  - id: test\n    command: ["npm", "test"]\n', "2026-01-01T00:00:00Z"),
      );

      const doctorIds = loadDoctorGates(dir).map((g) => g.id).sort();
      const check1Ids = loadCheck1Gates(dir, { moduleSlug: "m" }).gates.map((g) => g.id).sort();

      assert.deepEqual(check1Ids, doctorIds);
      assert.deepEqual(doctorIds, ["test"]);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("agrees even when a domain overlay is sitting right there", () => {
    const dir = createTempDir();
    try {
      // The case that failed before Task 11: a custom domain contributing a
      // gate that has no row in the project's own file. Reading the file must
      // now tell you exactly what runs.
      seedCustomDomain(dir, "fixture-domain", "domain-only");
      writeFixture(
        dir,
        GATES_REL,
        stampMarker('gates:\n  - id: test\n    command: ["npm", "test"]\n', "2026-01-01T00:00:00Z"),
      );

      const doctorIds = loadDoctorGates(dir).map((g) => g.id).sort();
      const merged = loadCheck1Gates(dir, { moduleSlug: "m" });

      assert.deepEqual(merged.gates.map((g) => g.id).sort(), doctorIds);
      assert.equal(
        merged.gates.some((g) => g.id === "domain-only"),
        false,
        "a domain overlay must not contribute at run time — adoption is via `adev governance materialize`",
      );
      assert.equal(merged.domain.resolved_domain, "fixture-domain");
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("still stamps provenance on every gate it returns", () => {
    const dir = createTempDir();
    try {
      writeFixture(
        dir,
        GATES_REL,
        stampMarker('gates:\n  - id: test\n    command: ["npm", "test"]\n', "2026-01-01T00:00:00Z"),
      );
      const { gates } = loadCheck1Gates(dir, { moduleSlug: "m" });
      assert.ok(gates.length > 0);
      for (const gate of gates) {
        assert.equal(typeof gate.__source, "string", `gate '${gate.id}' lost its provenance`);
      }
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("still fails closed on an unmarked gates.yaml", () => {
    const dir = createTempDir();
    try {
      writeFixture(dir, GATES_REL, 'gates:\n  - id: test\n    command: ["npm", "test"]\n');
      assert.throws(
        () => loadCheck1Gates(dir, { moduleSlug: "m" }),
        (err) => err.code === "REGISTRY_NOT_MATERIALIZED",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });
});

describe("an uncomputable merged view", () => {
  it("reports the coded misconfiguration instead of saying nothing", async () => {
    const dir = createTempDir();
    try {
      // Fixture maintenance (Task 11). This fixture used to shadow the bundled
      // `software` domain so that `loadDomainConfig` threw
      // BUNDLED_OVERRIDE_BLOCKED; the consumer view no longer reads a domain
      // overlay, so that code is unreachable from here. The BEHAVIOUR under
      // test is unchanged and the assertion is not weakened — a CODED failure
      // to compute the consumer view must be reported rather than swallowed —
      // so the fixture is re-pointed at a coded failure that is still reachable:
      // an illegal domain name, which `resolveDomain` refuses with
      // INVALID_DOMAIN_NAME. Every consumer of `adev domain load-gates`
      // hard-fails on this project, so a doctor that returns a clean bill of
      // health is diagnosing a project nobody can run.
      writeFixture(dir, ".context-index/manifest.yaml", 'project:\n  domain: "../evil"\n');
      writeFixture(dir, GATES_REL, 'gates:\n  - id: proj-only\n    command: ["npm", "test"]\n');

      const report = await runDoctor(dir);
      const f = report.findings.find((x) => x.id === "gate-doctor/merged-view-unavailable");

      assert.ok(f, `the failure must be reported; got ${JSON.stringify(ids(report))}`);
      assert.equal(f.severity, "warning");
      assert.match(
        f.message,
        /INVALID_DOMAIN_NAME/,
        "the caught error code is the actionable part and must be named",
      );
      assert.equal(
        ids(report).includes("gate-doctor/gate-set-divergence"),
        false,
        "a view that could not be computed cannot also be reported as divergent",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("is unmoved by a domain overlay that does not even parse", async () => {
    const dir = createTempDir();
    try {
      // Fixture maintenance (Task 11) — an INVERSION. This fixture used to
      // assert that an UNCODED throw out of `loadDomainConfig`'s `resolveExtends`
      // reached the caller rather than being traded for a silent null. That
      // asserted the OLD contract: that the consumer view reads the domain
      // overlay at all. It no longer does, so the same fixture must now be a
      // non-event — which is itself the strongest statement of the new
      // contract. `mergedGateIds` still rethrows anything uncoded (doctor.mjs);
      // no project state reaches that branch any more.
      writeFixture(dir, ".context-index/manifest.yaml", "project:\n  domain: fixture-domain\n");
      writeFixture(
        dir,
        ".context-index/domains/fixture-domain/domain.yaml",
        "extends: software\n   bad: 1\n",
      );
      writeFixture(dir, GATES_REL, 'gates:\n  - id: proj-only\n    command: ["npm", "test"]\n');

      const report = await runDoctor(dir);

      assert.equal(
        ids(report).includes("gate-doctor/merged-view-unavailable"),
        false,
        `an unread overlay cannot make the consumer view unavailable; got ${JSON.stringify(ids(report))}`,
      );
      assert.equal(ids(report).includes("gate-doctor/gate-set-divergence"), false);
    } finally {
      cleanupTempDir(dir);
    }
  });
});

describe("shell-form gate commands", () => {
  it("flags a shell-form command its consumers drop", async () => {
    const dir = createTempDir();
    try {
      writeFixture(dir, GATES_REL, 'gates:\n  - id: test\n    command: "npm test"\n');

      const report = await runDoctor(dir);
      const f = report.findings.find((x) => x.id === "gate-doctor/shell-form-command");

      assert.ok(f, `shell-form must be reported; got ${JSON.stringify(ids(report))}`);
      assert.equal(f.severity, "error");
      assert.equal(f.gate, "test");
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("does not fire on an argv-list command", async () => {
    const dir = createTempDir();
    try {
      writeFixture(dir, GATES_REL, 'gates:\n  - id: test\n    command: ["npm", "test"]\n');

      const report = await runDoctor(dir);

      assert.equal(
        ids(report).includes("gate-doctor/shell-form-command"),
        false,
        "the argv form is the correct form and must never be flagged",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("does not fire on a gate that declares no command at all", async () => {
    const dir = createTempDir();
    try {
      writeFixture(dir, GATES_REL, 'gates:\n  - id: test\n    command: ""\n');

      const report = await runDoctor(dir);
      const idList = ids(report);

      assert.equal(
        idList.includes("gate-doctor/shell-form-command"),
        false,
        "an unwired sentinel is empty-command, not shell-form — one gate, one diagnosis",
      );
      assert.ok(idList.includes("gate-doctor/empty-command"));
    } finally {
      cleanupTempDir(dir);
    }
  });
});

// ── The shipped file the reproduction came from ─────────────────────────────

describe("this repo's own governance gates.yaml", () => {
  it("declares every command in argv form, so no consumer drops it", () => {
    const doc = parseYaml(readFileSync(join(PLUGIN_ROOT, GATES_REL), "utf8"));
    assert.ok(Array.isArray(doc.gates) && doc.gates.length > 0, "the file must declare live gates");

    for (const gate of doc.gates) {
      assert.ok(
        Array.isArray(gate.command),
        `gate '${gate.id}' must declare command as an argv list, not a ${typeof gate.command}`,
      );
    }
  });

  it("survives mergeGates against the software starter with no INVALID_GATE warning", () => {
    const governance = parseYaml(readFileSync(join(PLUGIN_ROOT, GATES_REL), "utf8"));
    const domain = parseYaml(
      readFileSync(join(PLUGIN_ROOT, "templates/domains/software/gates.yaml"), "utf8"),
    );

    const { gates, warnings } = mergeGates(domain, governance);

    assert.deepEqual(
      warnings.filter((w) => w.code === "INVALID_GATE"),
      [],
      "no shipped gate may be silently dropped by the merge",
    );
    const test = gates.find((g) => g.id === "test");
    assert.ok(test, "the 'test' gate must reach the merged set every consumer reads");
    assert.deepEqual(test.command, ["npm", "test"]);
  });
});
