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
  it("reports divergence and names the id each side is missing", async () => {
    const dir = createTempDir();
    try {
      // Both directions at once. `domain-only` is contributed by the overlay
      // and never appears in the raw file; `proj-only` is declared in the raw
      // file in string form, which `mergeGates` drops, so it never reaches a
      // consumer. The finding must name the WHOLE symmetric difference — a
      // message covering one side would leave the other silently undiagnosed.
      seedCustomDomain(dir, "fixture-domain", "domain-only");
      writeFixture(dir, GATES_REL, 'gates:\n  - id: proj-only\n    command: "npm test"\n');

      const report = await runDoctor(dir);
      const f = report.findings.find((x) => x.id === "gate-doctor/gate-set-divergence");

      assert.ok(f, `divergence must be reported; got ${JSON.stringify(ids(report))}`);
      assert.equal(f.severity, "warning");
      assert.match(
        f.message,
        /domain-only/,
        "a gate the consumers run but the raw file never mentions must be named",
      );
      assert.match(
        f.message,
        /proj-only/,
        "a gate the raw file declares but the consumers never run must be named too",
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

      // The consumer view is the domain overlay with the project file merged
      // on top, which is a strictly different set here.
      const merged = loadCheck1Gates(dir, { moduleSlug: "m" });
      assert.deepEqual(
        merged.gates.map((g) => g.id).sort(),
        ["domain-only", "test"],
        "the consumer view must include the overlay's contribution",
      );
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

describe("an uncomputable merged view", () => {
  it("reports the coded misconfiguration instead of saying nothing", async () => {
    const dir = createTempDir();
    try {
      // `software` is a bundled domain; a project directory of the same name
      // makes `loadDomainConfig` throw BUNDLED_OVERRIDE_BLOCKED. Every consumer
      // of `adev domain load-gates` hard-fails on this project, so a doctor that
      // returns a clean bill of health is diagnosing a project nobody can run.
      writeFixture(dir, ".context-index/manifest.yaml", "project:\n  domain: software\n");
      writeFixture(
        dir,
        ".context-index/domains/software/gates.yaml",
        'gates:\n  - id: shadow\n    command: ["npm", "run", "x"]\n',
      );
      writeFixture(dir, GATES_REL, 'gates:\n  - id: proj-only\n    command: ["npm", "test"]\n');

      const report = await runDoctor(dir);
      const f = report.findings.find((x) => x.id === "gate-doctor/merged-view-unavailable");

      assert.ok(f, `the failure must be reported; got ${JSON.stringify(ids(report))}`);
      assert.equal(f.severity, "warning");
      assert.match(
        f.message,
        /BUNDLED_OVERRIDE_BLOCKED/,
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

  it("rethrows an error carrying no code rather than hiding a real bug", async () => {
    const dir = createTempDir();
    try {
      // A custom domain with no gates.yaml of its own sends `loadDomainConfig`
      // into `resolveExtends`, whose `parseYaml` throws a bare YamlParseError —
      // no `code` property. Anything uncoded is, by contract, a defect rather
      // than a diagnosable project state, and a swallowed defect would disable
      // `gate-set-divergence` permanently with the whole suite still green.
      writeFixture(dir, ".context-index/manifest.yaml", "project:\n  domain: fixture-domain\n");
      writeFixture(
        dir,
        ".context-index/domains/fixture-domain/domain.yaml",
        "extends: software\n   bad: 1\n",
      );
      writeFixture(dir, GATES_REL, 'gates:\n  - id: proj-only\n    command: ["npm", "test"]\n');

      await assert.rejects(
        () => runDoctor(dir),
        (err) => err.code === undefined && err instanceof Error,
        "an uncoded error must reach the caller, not be traded for a silent null",
      );
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
