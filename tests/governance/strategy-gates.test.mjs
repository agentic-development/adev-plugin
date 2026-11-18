// A manifest test_strategies[] entry's `command` runs as a path-scoped gate
// once `adev governance materialize --registry gates` has written it into
// governance/gates.yaml. Before this, `command` and `tier` were validated and
// then never read: a project that declared `dbt test` for models/** got no
// gate at all.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";

import { cleanupTempDir, createTempDir, writeFixture, PLUGIN_ROOT } from "../helpers.mjs";
import { strategyGates } from "../../lib/test-strategies/strategy-gates.mjs";
import { mergeGates } from "../../lib/domains/merge-gates.mjs";
import { loadCheck1Gates } from "../../lib/gates/gate-sets.mjs";
import { applyPathScope } from "../../lib/gates/path-scope.mjs";
import { runGateDoctor } from "../../lib/gates/doctor.mjs";
import { parseYaml } from "../../lib/profiles/yaml.mjs";

const GATES = ".context-index/governance/gates.yaml";
const MANIFEST = ".context-index/manifest.yaml";

const STRATEGY_MANIFEST = `project:
  name: fixture
domain: software
test_strategies:
  - strategy_id: fixture
    command: ["dbt", "test"]
    tier: integration
    paths: ["models/**", "macros/**"]
  - strategy_id: unit
    paths: ["src/**"]
`;

const BASE_GATES = `gates:
  - id: test
    command: ["npm", "test"]
    tier: fast
`;

function cli(dir, args) {
  const r = spawnSync("node", [join(PLUGIN_ROOT, "cli", "index.mjs"), ...args], {
    cwd: dir,
    encoding: "utf8",
    timeout: 30_000,
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function withProject(fn, { manifest = STRATEGY_MANIFEST, gates = BASE_GATES } = {}) {
  return async () => {
    const dir = createTempDir();
    try {
      writeFixture(dir, MANIFEST, manifest);
      writeFixture(dir, GATES, gates);
      await fn(dir);
    } finally {
      cleanupTempDir(dir);
    }
  };
}

function loadGates(dir, ...flags) {
  const r = cli(dir, ["domain", "load-gates", "--module", "demo", ...flags]);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

describe("strategyGates", () => {
  const manifest = parseYaml(STRATEGY_MANIFEST);

  test("a strategy with a command becomes a path-scoped strategy-<id> row; one without does not", () => {
    const { gates, warnings } = strategyGates(manifest, []);
    assert.deepEqual(warnings, []);
    assert.equal(gates.length, 1);
    assert.deepEqual(gates[0], {
      id: "strategy-fixture",
      command: ["dbt", "test"],
      description: "Test strategy fixture from manifest test_strategies",
      tier: "integration",
      paths: ["models/**", "macros/**"],
    });
  });

  test("a strategy the project already gates, by id or by identical argv, is not added again", () => {
    assert.equal(strategyGates(manifest, [{ id: "strategy-fixture", command: ["x"] }]).gates.length, 0);
    assert.equal(strategyGates(manifest, [{ id: "dbt", command: ["dbt", "test"] }]).gates.length, 0);
  });

  test("a malformed command or tier is a warning, never an INVALID_GATE that would block materialize", () => {
    const bad = parseYaml(`test_strategies:
  - strategy_id: schema
    command: ["npm", 8080]
    paths: ["migrations/**"]
  - strategy_id: contract
    command: ["pact"]
    tier: nightly
    paths: ["contracts/**"]
`);
    const { gates, warnings } = strategyGates(bad, []);
    assert.equal(gates.length, 0);
    assert.equal(warnings.length, 2);
    assert.ok(warnings.every((w) => w.code === "STRATEGY_GATE_SKIPPED"));
  });
});

describe("gate paths", () => {
  test("mergeGates keeps a valid paths list", () => {
    const { gates } = mergeGates(null, { gates: [{ id: "g", command: ["x"], paths: ["models/**"] }] });
    assert.deepEqual(gates[0].paths, ["models/**"]);
  });

  test("malformed paths are dropped with a warning and the gate stays, unscoped", () => {
    for (const paths of [[], ["../up/**"], ["/abs/**"], "models/**", [1]]) {
      const { gates, warnings } = mergeGates(null, { gates: [{ id: "g", command: ["x"], paths }] });
      assert.equal(gates.length, 1, JSON.stringify(paths));
      assert.equal(gates[0].paths, undefined);
      assert.equal(warnings[0].code, "INVALID_GATE_PATHS");
    }
  });

  test("applyPathScope: a scoped gate applies only when a changed file matches; unscoped gates always apply", () => {
    const gates = [
      { id: "a", command: ["x"] },
      { id: "b", command: ["y"], paths: ["models/**"] },
    ];
    const hit = applyPathScope(gates, ["models/orders.sql"]);
    assert.equal(hit[0].applies, true);
    assert.equal(hit[1].applies, true);

    const miss = applyPathScope(gates, ["src/app.ts"]);
    assert.equal(miss[0].applies, true);
    assert.equal(miss[1].applies, false);
    assert.match(miss[1].skip_reason, /no changed file matches paths \(models\/\*\*\)/);

    assert.ok(applyPathScope(gates, null).every((g) => g.applies), "unknown change set runs everything");
  });
});

describe("adoption into gates.yaml", () => {
  test(
    "the consumer view never composes strategies at run time",
    withProject((dir) => {
      const { gates } = loadCheck1Gates(dir, { requireMaterialized: false });
      assert.ok(!gates.some((g) => g.id === "strategy-fixture"));
    }),
  );

  test(
    "materialize writes the strategy row with its paths and source: project, then load-gates runs it",
    withProject((dir) => {
      const first = cli(dir, ["governance", "materialize", "--registry", "gates"]);
      assert.equal(first.status, 0, first.stderr);

      const doc = parseYaml(readFileSync(join(dir, GATES), "utf8"));
      const row = doc.gates.find((g) => g.id === "strategy-fixture");
      assert.ok(row, "strategy-fixture row written");
      assert.deepEqual(row.command, ["dbt", "test"]);
      assert.equal(row.tier, "integration");
      assert.deepEqual(row.paths, ["models/**", "macros/**"]);
      assert.equal(row.source, "project");

      const before = readFileSync(join(dir, GATES), "utf8");
      const second = cli(dir, ["governance", "materialize", "--registry", "gates"]);
      assert.equal(second.status, 0, second.stderr);
      assert.equal(readFileSync(join(dir, GATES), "utf8"), before, "re-running adds nothing");

      const loaded = loadGates(dir);
      const gate = loaded.gates.find((g) => g.id === "strategy-fixture");
      assert.deepEqual(gate.paths, ["models/**", "macros/**"]);
      assert.equal(typeof gate.command_sha, "string");
    }),
  );

  test(
    "adev gate doctor reports a strategy command with no gate row, and stops once it is adopted",
    withProject(async (dir) => {
      const before = await runGateDoctor({ projectRoot: dir });
      const hit = before.findings.filter((f) => f.id === "gate-doctor/strategy-gate-not-adopted");
      assert.equal(hit.length, 1);
      assert.match(hit[0].message, /adev governance materialize --registry gates/);

      assert.equal(cli(dir, ["governance", "materialize", "--registry", "gates"]).status, 0);
      const after = await runGateDoctor({ projectRoot: dir });
      assert.ok(!after.findings.some((f) => f.id === "gate-doctor/strategy-gate-not-adopted"));
    }),
  );
});

describe("adev domain load-gates change scoping", () => {
  const SCOPED = `materialized_at: 2026-11-17T00:00:00.000Z
gates:
  - id: test
    command: ["npm", "test"]
  - id: strategy-fixture
    command: ["dbt", "test"]
    tier: integration
    paths: ["models/**"]
`;

  test(
    "--changed-files marks each gate applies:true|false; without a flag no applies field is added",
    withProject(
      (dir) => {
        const plain = loadGates(dir);
        assert.ok(plain.gates.every((g) => !("applies" in g)));

        const miss = loadGates(dir, "--changed-files", "src/a.ts");
        assert.equal(miss.gates.find((g) => g.id === "test").applies, true);
        const scoped = miss.gates.find((g) => g.id === "strategy-fixture");
        assert.equal(scoped.applies, false);
        assert.ok(scoped.skip_reason);
        assert.equal(typeof scoped.command_sha, "string", "a skipped gate keeps its row for the skip outcome");

        const hit = loadGates(dir, "--changed-files", "src/a.ts,models/orders.sql");
        assert.equal(hit.gates.find((g) => g.id === "strategy-fixture").applies, true);
      },
      { gates: SCOPED },
    ),
  );

  test(
    "--changed-since diffs the worktree, untracked files included, against the base",
    withProject(
      (dir) => {
        const git = (...a) => execFileSync("git", a, { cwd: dir, stdio: "pipe" });
        git("init", "-q", "-b", "main");
        git("-c", "user.email=t@t", "-c", "user.name=t", "add", "-A");
        git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base");
        const base = git("rev-parse", "HEAD").toString().trim();

        assert.equal(loadGates(dir, "--changed-since", base).gates.find((g) => g.id === "strategy-fixture").applies, false);
        writeFixture(dir, "models/orders.sql", "select 1\n");
        assert.equal(loadGates(dir, "--changed-since", base).gates.find((g) => g.id === "strategy-fixture").applies, true);
        assert.equal(loadGates(dir, "--changed-since", "merge-base").gates.find((g) => g.id === "strategy-fixture").applies, true);
      },
      { gates: SCOPED },
    ),
  );

  test(
    "an unreadable base warns and runs every gate rather than skipping one that was needed",
    withProject(
      (dir) => {
        const out = loadGates(dir, "--changed-since", "deadbeef");
        assert.ok(out.warnings.some((w) => w.code === "CHANGED_BASE_UNRESOLVED"));
        assert.ok(out.gates.every((g) => g.applies === true));
      },
      { gates: SCOPED },
    ),
  );

  test(
    "--changed-since and --changed-files together is a usage error",
    withProject(
      (dir) => {
        const r = cli(dir, ["domain", "load-gates", "--module", "demo", "--changed-since", "x", "--changed-files", "y"]);
        assert.notEqual(r.status, 0);
      },
      { gates: SCOPED },
    ),
  );
});

describe("skills pass the change set to load-gates", () => {
  const read = (p) => readFileSync(join(PLUGIN_ROOT, p), "utf8");

  test("validate and implement resolve gates with --changed-since and skip gates that do not apply", () => {
    for (const p of [
      "skills/validate/references/step-0-load-check-registry.md",
      "skills/validate/checks/validate.check-1-quality-gates.md",
      "skills/implement/references/integration-gate.md",
    ]) {
      assert.match(read(p), /adev domain load-gates[^\n]*--changed-since merge-base/, p);
      assert.match(read(p), /applies: (false|true\|false)/, p);
    }
    assert.match(
      read("skills/implement/references/steps/step-2-per-task-loop.md"),
      /--changed-since <captured-base>/,
    );
  });
});
