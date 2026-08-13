// tests/cli/diagnose-validated-without-report.test.mjs
//
// End-to-end coverage for the tier-2 `adev/validated-without-report`
// diagnostic (issue-563), driven through the real `adev diagnose` CLI.
//
// Kept in its own file rather than folded into diagnose.test.mjs: that
// file's shared temp-project helper writes a fixed tier-1-only registry,
// and the golden JSON snapshot it locks must not shift.

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

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");

const DIAGNOSTIC_ID = "adev/validated-without-report";

const REGISTRY = `diagnostics:
  - id: adev/frontmatter-present
    runner: plugin:tier1/frontmatter-present.mjs
    severity: error
    tier: 1
    scope: event-impact

  - id: ${DIAGNOSTIC_ID}
    runner: plugin:tier2/validated-without-report.mjs
    severity: error
    tier: 2
    scope: spec
`;

/**
 * Stand up a temp project wired to the real plugin-rooted runners.
 *
 * NOTE: `.context-index/diagnostics/` MUST exist even though it stays
 * empty. Without it the engine's `realProjectDiagRoot` is null → `''`,
 * `isUnder(runner, '')` is true for every absolute path, both allowlist
 * roots match, and every `plugin:` runner is rejected as a cross-root
 * deputy. (Same trap documented in tests/cli/diagnose.test.mjs.)
 */
function makeTempProject() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-diagnose-vwr-")));
  mkdirSync(join(dir, ".context-index", "governance"), { recursive: true });
  mkdirSync(join(dir, ".context-index", "specs", "features", "m"), { recursive: true });
  mkdirSync(join(dir, ".context-index", "diagnostics"), { recursive: true });
  writeFileSync(
    join(dir, ".context-index", "manifest.yaml"),
    'project:\n  name: t\n  adev_version: "0.22.0"\n',
  );
  writeFileSync(join(dir, ".context-index", "governance", "diagnostics.yaml"), REGISTRY);
  return dir;
}

function cleanup(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function writeSpec(dir, name, status, { withReport = false } = {}) {
  const rel = `.context-index/specs/features/m/${name}.spec.md`;
  writeFileSync(join(dir, rel), `---\ncharter: m\nstatus: ${status}\n---\n# ${name}\n`);
  if (withReport) {
    writeFileSync(
      join(dir, `.context-index/specs/features/m/${name}.validate.md`),
      "---\nverdict: PASS\n---\n# validation\n",
    );
  }
  return rel;
}

function runDiagnose(dir, args) {
  return spawnSync("node", [CLI, "diagnose", ...args], {
    encoding: "utf8",
    cwd: dir,
    timeout: 15000,
  });
}

test("adev diagnose --spec surfaces validated-without-report in --json output", () => {
  const dir = makeTempProject();
  try {
    const rel = writeSpec(dir, "lonely", "validated");
    const r = runDiagnose(dir, ["--spec", rel, "--json"]);
    assert.strictEqual(r.status, 2, `expected exit 2 (error fired); stderr: ${r.stderr}`);

    const out = JSON.parse(r.stdout);
    const hit = out.fired.find((f) => f.id === DIAGNOSTIC_ID);
    assert.ok(hit, `expected ${DIAGNOSTIC_ID} in fired; got ${JSON.stringify(out.fired)}`);
    assert.strictEqual(hit.severity, "error");
    assert.strictEqual(hit.spec, rel);
    assert.ok(
      hit.message.includes("lonely.spec.md") && hit.message.includes("lonely.validate.md"),
      `message must name both artifacts; got: ${hit.message}`,
    );
    assert.ok(
      hit.runner_path.endsWith("tier2/validated-without-report.mjs"),
      `runner_path must point at the tier-2 producer; got: ${hit.runner_path}`,
    );
    assert.ok(
      !hit.message.includes("<external-path-redacted>"),
      `remedy must survive engine redaction; got: ${hit.message}`,
    );
    assert.strictEqual(out.summary.by_severity.error, 1);
    assert.strictEqual(out.summary.exit_code, 2);
    assert.deepStrictEqual(out.errors, [], "no registry-level errors expected");
  } finally {
    cleanup(dir);
  }
});

test("adev diagnose stays clean when the validation report exists", () => {
  const dir = makeTempProject();
  try {
    const rel = writeSpec(dir, "proven", "validated", { withReport: true });
    const r = runDiagnose(dir, ["--spec", rel, "--json"]);
    assert.strictEqual(r.status, 0, `expected exit 0; stdout: ${r.stdout} stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(
      out.fired.filter((f) => f.id === DIAGNOSTIC_ID).length,
      0,
      `must not fire when the report exists; got ${JSON.stringify(out.fired)}`,
    );
  } finally {
    cleanup(dir);
  }
});

test("adev diagnose does not fire the diagnostic for non-validated statuses", () => {
  const dir = makeTempProject();
  try {
    for (const status of ["draft", "review-passed", "implemented"]) {
      const rel = writeSpec(dir, `s-${status}`, status);
      const r = runDiagnose(dir, ["--spec", rel, "--json"]);
      assert.strictEqual(r.status, 0, `status ${status} must not fail; stdout: ${r.stdout}`);
      const out = JSON.parse(r.stdout);
      assert.strictEqual(
        out.fired.filter((f) => f.id === DIAGNOSTIC_ID).length,
        0,
        `status ${status} must not fire ${DIAGNOSTIC_ID}`,
      );
    }
  } finally {
    cleanup(dir);
  }
});

test("bare adev diagnose walks every spec and fires once per offender", () => {
  const dir = makeTempProject();
  try {
    writeSpec(dir, "a", "validated");
    writeSpec(dir, "b", "validated");
    writeSpec(dir, "c", "validated", { withReport: true });
    writeSpec(dir, "d", "implemented");

    const r = runDiagnose(dir, ["--json"]);
    assert.strictEqual(r.status, 2, `expected exit 2; stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    const hits = out.fired.filter((f) => f.id === DIAGNOSTIC_ID);
    assert.strictEqual(hits.length, 2, `expected 2 offenders; got ${JSON.stringify(hits)}`);
    const specs = hits.map((h) => h.spec).sort();
    assert.deepStrictEqual(specs, [
      ".context-index/specs/features/m/a.spec.md",
      ".context-index/specs/features/m/b.spec.md",
    ]);
  } finally {
    cleanup(dir);
  }
});

test("--tier 1 excludes the tier-2 diagnostic; --tier 2 includes it", () => {
  const dir = makeTempProject();
  try {
    const rel = writeSpec(dir, "lonely", "validated");

    const tier1 = runDiagnose(dir, ["--spec", rel, "--tier", "1", "--json"]);
    assert.strictEqual(tier1.status, 0, `tier 1 must not surface it; stdout: ${tier1.stdout}`);
    const out1 = JSON.parse(tier1.stdout);
    assert.strictEqual(out1.fired.filter((f) => f.id === DIAGNOSTIC_ID).length, 0);
    assert.ok(
      out1.skipped.some((s) => s.id === DIAGNOSTIC_ID && /tier mismatch/.test(s.reason)),
      `expected a tier-mismatch skip row; got ${JSON.stringify(out1.skipped)}`,
    );

    const tier2 = runDiagnose(dir, ["--spec", rel, "--tier", "2", "--json"]);
    assert.strictEqual(tier2.status, 2);
    const out2 = JSON.parse(tier2.stdout);
    assert.strictEqual(out2.fired.filter((f) => f.id === DIAGNOSTIC_ID).length, 1);
  } finally {
    cleanup(dir);
  }
});

test("--only accepts the diagnostic id, proving it is registered", () => {
  const dir = makeTempProject();
  try {
    const rel = writeSpec(dir, "lonely", "validated");
    const r = runDiagnose(dir, ["--spec", rel, "--only", DIAGNOSTIC_ID, "--json"]);
    assert.ok(
      !/unknown diagnostic id/.test(r.stderr),
      `${DIAGNOSTIC_ID} must be present in governance/diagnostics.yaml; stderr: ${r.stderr}`,
    );
    assert.strictEqual(r.status, 2);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.fired.length, 1);
    assert.strictEqual(out.fired[0].id, DIAGNOSTIC_ID);
  } finally {
    cleanup(dir);
  }
});

test("human output names the diagnostic and its severity", () => {
  const dir = makeTempProject();
  try {
    const rel = writeSpec(dir, "lonely", "validated");
    const r = runDiagnose(dir, ["--spec", rel]);
    assert.strictEqual(r.status, 2);
    assert.match(r.stdout, new RegExp(DIAGNOSTIC_ID.replace("/", "\\/")));
    assert.match(r.stdout, /error/);
  } finally {
    cleanup(dir);
  }
});

// ── Registration lock: the shipped registry must carry the entry ────────────

test("the project registry registers the tier-2 diagnostic", async () => {
  const { loadRegistry } = await import("../../lib/diagnostics/index.mjs");
  const registry = await loadRegistry(PROJECT_ROOT);
  const entry = registry.entries.find((e) => e.id === DIAGNOSTIC_ID);
  assert.ok(
    entry,
    `${DIAGNOSTIC_ID} must be registered in .context-index/governance/diagnostics.yaml`,
  );
  assert.strictEqual(entry.severity, "error");
  assert.strictEqual(entry.tier, 2);
  assert.strictEqual(entry.scope, "spec");
  assert.strictEqual(entry.runner, "plugin:tier2/validated-without-report.mjs");
});
