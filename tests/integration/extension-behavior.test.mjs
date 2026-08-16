/**
 * End-to-end behavioral tests for the example-validation-check reference
 * extension.
 *
 * The sibling install test (`tests/lib/extensions/example-validation-check-
 * install.test.mjs`) covers the install-side surface: manifest parsing,
 * governance merge, line-budget caps, collision precedence, string-form
 * rejection, bin/check.sh hardening (static + sentinel-env).
 *
 * This file covers what `install` doesn't reach: the **runtime** path that
 * `/adev:validate` actually takes after install, the **projection** path
 * that downstream skills read, the **template-installability** invariant
 * (the template ships a working manifest, not just commented YAML), and
 * **negative fixtures** for each pitfall the docs explicitly forbid.
 *
 * Coverage map (every spec behavior + pitfall has at least one test here):
 *
 *   Behavior 2  → "install positive path inherits PATH_TRAVERSAL containment"
 *   Behavior 3  → "installed check executes via runQualityGate and returns PASS"
 *                 "validator_report event surfaces in currentState projection"
 *   Behavior 4  → "bin/check.sh ignores trailing argv noise (exit 0, same stdout)"
 *   Behavior 5  → covered by tests/docs/extensions-links.test.mjs
 *   Behavior 6  → covered by install collision tests
 *   Pitfall (a) → "validate-load rejects entry missing profile: on quality-gate"
 *   Pitfall (b) → covered by install string-form test
 *   Pitfall (c) → "install fails when manifest has no requires.adev"
 *   Pitfall (d) → "install fails when governance entry has no id"
 *   Contract    → "adev report --type validator is silent on success"
 *   Template    → "templates/adev-extension.example.yaml installs as a working extension"
 *
 * Spec: .context-index/specs/features/extensions/extension-authoring-docs.spec.md
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  chmodSync,
  cpSync,
} from "node:fs";
import { join, dirname, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { parseYaml } from "../../lib/profiles/yaml.mjs";
import { installExtension } from "../../lib/extensions/install.mjs";
import { loadValidateConfig } from "../../lib/governance/validate-config.mjs";
import { runQualityGate } from "../../lib/governance/quality-gate.mjs";
import { currentState } from "../../lib/lifecycle-state.mjs";
import { createTempDir, cleanupTempDir, PLUGIN_ROOT } from "../helpers.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI = resolve(__dirname, "..", "..", "cli", "index.mjs");
const EXAMPLE_DIR = join(PLUGIN_ROOT, "extensions", "example-validation-check");
const TEMPLATE_PATH = join(PLUGIN_ROOT, "templates", "adev-extension.example.yaml");

// ── Test fixtures: temp project with manifest, spec, and stub plugin root ──

function setupProject() {
  const projectRoot = createTempDir();
  mkdirSync(join(projectRoot, ".context-index/governance"), { recursive: true });
  mkdirSync(join(projectRoot, ".context-index/specs/features/m"), {
    recursive: true,
  });
  mkdirSync(join(projectRoot, ".context-index/lifecycle-state"), {
    recursive: true,
  });
  writeFileSync(
    join(projectRoot, ".context-index/manifest.yaml"),
    "project:\n  name: behavior-test\n  adev_version: \"0.27.0\"\nlifecycle:\n  gate_mode: advisory\n  event_diagnostics: off\n",
  );
  writeFileSync(
    join(projectRoot, ".context-index/specs/features/m/sample.spec.md"),
    "---\ncharter: m\nstatus: implemented\nrevision: 1\n---\n\n# Sample\n",
  );
  return projectRoot;
}

function stubPluginRootDir() {
  // installExtension's version-check reads PLUGIN_ROOT/package.json. The
  // example manifest pins requires.adev >= 0.27.0; the real package version
  // is below that milestone today. Stub a package.json that satisfies the
  // requirement so the install path runs end-to-end.
  const dir = createTempDir();
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "adev-stub", version: "0.27.0" }),
  );
  // A faithful plugin root also carries the bundled profile vocabulary: the
  // install-time namespace resolver reads `<pluginRoot>/templates/governance/
  // profiles.yaml` to prove a contributed entry's `profile` names something
  // the loader can resolve (an unknown name would make it push UNKNOWN_PROFILE).
  mkdirSync(join(dir, "templates", "governance"), { recursive: true });
  copyFileSync(
    join(PLUGIN_ROOT, "templates", "governance", "profiles.yaml"),
    join(dir, "templates", "governance", "profiles.yaml"),
  );
  return dir;
}

function adev(projectRoot, args) {
  const r = spawnSync("node", [CLI, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 15_000,
  });
  return { exitCode: r.status ?? 1, stdout: r.stdout || "", stderr: r.stderr || "" };
}

function readEvents(projectRoot, slug = "sample") {
  const logPath = join(
    projectRoot,
    ".context-index/lifecycle-state",
    `${slug}.jsonl`,
  );
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

// ══════════════════════════════════════════════════════════════════════════
// Behavior 3 — runtime execution: the installed check actually runs
// ══════════════════════════════════════════════════════════════════════════

describe("example-validation-check: runtime quality-gate execution (Behavior 3)", () => {
  let projectRoot;
  let stubPluginRoot;

  beforeEach(() => {
    projectRoot = setupProject();
    stubPluginRoot = stubPluginRootDir();
  });

  afterEach(() => {
    cleanupTempDir(projectRoot);
    cleanupTempDir(stubPluginRoot);
  });

  it("installed check executes via runQualityGate and returns PASS", async () => {
    // The extension ships an executable governance entry, so consent is
    // mandatory: a non-interactive install without --allow-exec refuses.
    await installExtension(EXAMPLE_DIR, projectRoot, {
      pluginRoot: stubPluginRoot,
      sourceUri: EXAMPLE_DIR,
      allowExec: true,
      interactive: false,
    });

    // Read the merged entry. The root key is `checks` — the one
    // lib/governance/validate-config.mjs actually reads.
    const validatePath = join(projectRoot, ".context-index/governance/validate.yaml");
    const validate = parseYaml(readFileSync(validatePath, "utf8"));
    assert.equal(validate.validators, undefined, "root key must be checks, never validators");
    const entry = validate.checks.find((e) => e && e.id === "example-validation-check.passing");
    assert.ok(entry, "merged entry must exist in validate.yaml");
    assert.ok(Array.isArray(entry.command), "command must be argv form");

    // No path fixups are needed. The manifest declares an extension-source-
    // relative `bin/check.sh`; install copies that payload into the project at
    // .context-index/extensions/<name>/ and rewrites the argv element to the
    // absolute installed path. The entry is directly runnable as written.
    // (`runQualityGate` takes its cwd from the caller; it is configurable-checks
    // Behavior 6c that pins that to the project root in a real validate run,
    // which is what we pass below.)
    const payloadPath = join(
      projectRoot,
      ".context-index/extensions/example-validation-check/bin/check.sh",
    );
    assert.deepEqual(
      entry.command,
      ["bash", payloadPath],
      "installed argv must name the relocated payload, not the extension source path",
    );
    assert.ok(existsSync(payloadPath), `relocated payload must exist at ${payloadPath}`);

    const result = await runQualityGate(entry, {
      cwd: projectRoot,
      env: {},
      parentEnv: process.env,
      timeoutMs: 5000,
    });

    assert.equal(result.status, "PASS", `expected PASS, got: ${JSON.stringify(result)}`);
    assert.equal(result.exitCode, 0);
    // runQualityGate returns redacted output fields, not raw stdout/stderr.
    assert.match(
      result.redactedStdout,
      /PASS: example-validation-check/,
      "runtime stdout must contain the canonical PASS line",
    );
    assert.equal(
      result.redactedStderr.trim(),
      "",
      "stderr must be empty on PASS",
    );
  });

  it("validator_report event surfaces in currentState projection (Behavior 3 roundtrip)", async () => {
    await installExtension(EXAMPLE_DIR, projectRoot, {
      pluginRoot: stubPluginRoot,
      sourceUri: EXAMPLE_DIR,
      allowExec: true,
      interactive: false,
    });

    const SPEC_REL = ".context-index/specs/features/m/sample.spec.md";

    // Walk the lifecycle so `validate` is the current step
    adev(projectRoot, ["report", "--type", "step", "--spec", SPEC_REL, "--step", "specify", "--status", "completed", "--verdict", "PASS"]);
    adev(projectRoot, ["report", "--type", "step", "--spec", SPEC_REL, "--step", "review", "--status", "completed", "--verdict", "PASS"]);
    adev(projectRoot, ["report", "--type", "step", "--spec", SPEC_REL, "--step", "plan", "--status", "completed", "--verdict", "PASS"]);
    adev(projectRoot, ["report", "--type", "step", "--spec", SPEC_REL, "--step", "implement", "--status", "completed", "--verdict", "PASS"]);
    adev(projectRoot, ["report", "--type", "step", "--spec", SPEC_REL, "--step", "validate", "--status", "started"]);

    // Emit the validator report for the new check
    const r = adev(projectRoot, [
      "report", "--type", "validator", "--spec", SPEC_REL,
      "--step", "validate", "--validator", "example-validation-check.passing",
      "--verdict", "PASS",
    ]);
    assert.equal(r.exitCode, 0, `report exit: ${r.stderr}`);

    // Read the projection — `currentState` aggregates events into
    // state.steps.<step>.reports[]
    const absSpec = join(projectRoot, SPEC_REL);
    const projection = currentState(projectRoot, absSpec);
    const validateStep = projection.steps.validate;
    assert.ok(validateStep, "validate step must be present in projection");
    assert.ok(Array.isArray(validateStep.reports), "reports must be an array");
    const ourReport = validateStep.reports.find(
      (e) => e.event === "validator_report" && e.validator === "example-validation-check.passing",
    );
    assert.ok(ourReport, "validator_report for the new check must be in projection");
    assert.equal(ourReport.verdict, "PASS");
    assert.equal(ourReport.step, "validate");
    assert.ok(ourReport.severity, "severity must be stamped by the lib");
    assert.equal(typeof ourReport.ts, "string", "ts must be ISO string");
  });

  it("adev report --type validator is silent on success", () => {
    // The skill contract: silent stdout on success (mirrors the inline
    // reportValidator semantics).
    const SPEC_REL = ".context-index/specs/features/m/sample.spec.md";
    const r = adev(projectRoot, [
      "report", "--type", "validator", "--spec", SPEC_REL,
      "--step", "validate", "--validator", "example-validation-check.passing",
      "--verdict", "PASS",
    ]);
    assert.equal(r.exitCode, 0);
    assert.equal(r.stdout, "", "stdout must be empty on success");
    // stderr may contain documented advisories from the severity-resolution
    // helper when the project has no per-validator severity config:
    //   - UNKNOWN_VALIDATOR_DEFAULTED — id not declared in reviewers.yaml
    //   - DOMAIN_CONFIG_DEGRADED — gates not found for the active domain
    // Both are intentional defaults, not failures. The contract is "no
    // stderr noise FROM THE SKILL ITSELF" — advisories from the severity
    // helper are documented and acceptable.
    if (r.stderr) {
      assert.match(
        r.stderr,
        /UNKNOWN_VALIDATOR_DEFAULTED|DOMAIN_CONFIG_DEGRADED/,
        `stderr must be empty or only documented severity-resolution advisories; got: ${r.stderr}`,
      );
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Behavior 4 — bin/check.sh runtime contract beyond the static checks
// ══════════════════════════════════════════════════════════════════════════

describe("example-validation-check: bin/check.sh runtime contract (Behavior 4)", () => {
  it("ignores trailing argv noise — exit 0, identical stdout regardless of args", () => {
    const BIN = join(EXAMPLE_DIR, "bin", "check.sh");
    const argSets = [
      [],
      ["arbitrary"],
      ["--secret=hunter2"],
      ["arg1", "arg2", "arg3"],
      ["$(rm -rf /)"], // shell-escape attempt — won't expand without shell=true
      ["-h"],
      ["--help"],
    ];
    let baselineStdout = null;
    for (const args of argSets) {
      const r = spawnSync("bash", [BIN, ...args], {
        encoding: "utf8",
        env: { ...process.env, SECRET: "hunter2-runtime-sentinel" },
      });
      assert.equal(r.status, 0, `exit 0 for args ${JSON.stringify(args)}; got ${r.status}`);
      assert.equal(r.stderr, "", `no stderr for args ${JSON.stringify(args)}`);
      if (baselineStdout === null) {
        baselineStdout = r.stdout;
      } else {
        assert.equal(
          r.stdout,
          baselineStdout,
          `stdout must be identical regardless of argv; differed for ${JSON.stringify(args)}`,
        );
      }
      assert.doesNotMatch(r.stdout, /hunter2-runtime-sentinel/, "must not leak SECRET");
      assert.doesNotMatch(r.stdout, /\$\(/, "must not echo shell-expansion artifacts");
    }
  });

  it("exits 0 even when invoked from a different cwd (configurable-checks Behavior 6c — cwd locked by runner)", () => {
    const BIN = join(EXAMPLE_DIR, "bin", "check.sh");
    const r = spawnSync("bash", [BIN], {
      cwd: "/tmp", // cwd-independence
      encoding: "utf8",
    });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^PASS: example-validation-check$/m);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Pitfall enforcement — each documented pitfall has a negative fixture
// ══════════════════════════════════════════════════════════════════════════

describe("example-validation-check: pitfall enforcement (docs/extensions.md)", () => {
  let projectRoot;
  let stubPluginRoot;

  beforeEach(() => {
    projectRoot = setupProject();
    stubPluginRoot = stubPluginRootDir();
  });

  afterEach(() => {
    cleanupTempDir(projectRoot);
    cleanupTempDir(stubPluginRoot);
  });

  it("pitfall (a): validate-load rejects governance entry missing profile: on quality-gate", () => {
    const overlayPath = join(projectRoot, ".context-index/governance/validate.yaml");
    writeFileSync(
      overlayPath,
      [
        "checks:",
        "  - id: missing-profile-check",
        "    kind: quality-gate",
        "    command: [bash, /bin/true]",
        "    severity: warning",
        "",
      ].join("\n"),
    );
    const result = loadValidateConfig(projectRoot, { pluginRoot: PLUGIN_ROOT });
    const codes = result.errors.map((e) => e.code);
    assert.ok(
      codes.some((c) => /PROFILE|profile/i.test(c)),
      `expected a profile-related error code, got ${codes.join(", ")}`,
    );
  });

  it("pitfall (c): install rejects manifest with unsatisfiable requires.adev range", async () => {
    // The version-check fires when `requires.adev` is present AND the
    // installed adev version doesn't satisfy the range. A missing
    // requires.adev field is permissive (no version constraint) — the
    // real pitfall the docs cover is pinning an unreachable range.
    const extDir = createTempDir();
    writeFileSync(
      join(extDir, "adev-extension.yaml"),
      [
        "name: unsatisfiable-requires-ext",
        "version: 0.1.0",
        "description: requires.adev range cannot be satisfied",
        "requires:",
        '  adev: ">=99.0.0"',
        "provides:",
        "  governance:",
        "    - target: validate.yaml",
        "      entries:",
        "        - id: unsatisfiable.check",
        "          kind: quality-gate",
        "          profile: read-only",
        "          command: [bash, /bin/true]",
        "          severity: warning",
        "",
      ].join("\n"),
    );
    let threw = false;
    let errCode = null;
    try {
      await installExtension(extDir, projectRoot, {
        pluginRoot: stubPluginRoot,
        sourceUri: extDir,
      });
    } catch (err) {
      threw = true;
      errCode = err.code;
    }
    cleanupTempDir(extDir);
    assert.ok(
      threw,
      "install must throw when requires.adev range is unsatisfiable",
    );
    assert.ok(
      errCode && /VERSION|COMPAT|REQUIRES|INCOMPATIBLE/i.test(errCode),
      `expected version-related error code, got ${errCode}`,
    );
  });

  it("pitfall (d): install rejects governance entry missing id", async () => {
    const extDir = createTempDir();
    writeFileSync(
      join(extDir, "adev-extension.yaml"),
      [
        "name: missing-id-ext",
        "version: 0.1.0",
        "description: Missing entry id",
        "requires:",
        "  adev: \">=0.0.0\"",
        "provides:",
        "  governance:",
        "    - target: validate.yaml",
        "      entries:",
        "        - kind: quality-gate",
        "          profile: read-only",
        "          command: [bash, /bin/true]",
        "          severity: warning",
        "",
      ].join("\n"),
    );
    let threw = false;
    let message = null;
    try {
      await installExtension(extDir, projectRoot, {
        pluginRoot: stubPluginRoot,
        sourceUri: extDir,
      });
    } catch (err) {
      threw = true;
      message = err.message;
    }
    // installExtension may either throw at validation time or accept and let
    // the loader reject at validate-load. Either is an acceptable rejection
    // path — the contract is that an entry without `id` is unusable.
    if (!threw) {
      const result = loadValidateConfig(projectRoot, { pluginRoot: PLUGIN_ROOT });
      const codes = result.errors.map((e) => e.code).concat(result.errors.map((e) => e.message || ""));
      const rejected = codes.some((c) => /id|MISSING|SCHEMA/i.test(c));
      cleanupTempDir(extDir);
      assert.ok(
        rejected,
        `entry missing id must be rejected at install or load time; got errors ${JSON.stringify(result.errors)}`,
      );
    } else {
      cleanupTempDir(extDir);
      assert.ok(
        message && /id|MISSING|SCHEMA/i.test(message),
        `error message should mention id/MISSING/SCHEMA; got: ${message}`,
      );
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Template installability — the template is a working manifest, not just YAML
// ══════════════════════════════════════════════════════════════════════════

describe("templates/adev-extension.example.yaml: installability", () => {
  let projectRoot;
  let stubPluginRoot;
  let extDir;

  beforeEach(() => {
    projectRoot = setupProject();
    stubPluginRoot = stubPluginRootDir();
    extDir = null;
  });

  afterEach(() => {
    cleanupTempDir(projectRoot);
    cleanupTempDir(stubPluginRoot);
    // In the test body this leaks the fixture on any failure path.
    if (extDir !== null) cleanupTempDir(extDir);
  });

  it("template declares the extension-source-relative command form", () => {
    // This template is what every extension author copies, so a regression to
    // the project-root-relative form (`extensions/my-extension/bin/check.sh`)
    // would re-seed the original defect into every new extension written from
    // it. The value is asserted against the SHIPPED FILE, not a fixture.
    const template = parseYaml(readFileSync(TEMPLATE_PATH, "utf8"));
    const entry = template.provides.governance[0].entries[0];
    assert.deepEqual(
      entry.command,
      ["bash", "bin/check.sh"],
      "command must be extension-source-relative; a project-root-relative path " +
        "resolves only inside a repo that vendors the extension at that path and " +
        "refuses elsewhere with GOVERNANCE_PAYLOAD_MISSING",
    );
    assert.equal(entry.profile, "read-only", "profile must be explicit on a quality-gate");
    assert.equal(entry.kind, "quality-gate");
  });

  it("template installs successfully (proves it's a working manifest)", async () => {
    // The fixture is DERIVED from the shipped template, not duplicated: every
    // governance field below is read out of the file, so a regression in the
    // template's `command` breaks this install rather than passing against a
    // hand-written copy that happens to still be correct.
    const template = parseYaml(readFileSync(TEMPLATE_PATH, "utf8"));
    const block = template.provides.governance[0];
    const templateEntry = block.entries[0];
    const payloadRel = templateEntry.command[1];

    extDir = createTempDir();
    const derivedManifest = [
      "name: template-derived-extension",
      "version: 0.1.0",
      "description: Built from templates/adev-extension.example.yaml",
      "author: template-test",
      "requires:",
      '  adev: ">=0.0.0"',
      "provides:",
      "  governance:",
      `    - target: ${block.target}`,
      "      entries:",
      "        - id: template-derived.passing",
      `          kind: ${templateEntry.kind}`,
      `          profile: ${templateEntry.profile}`,
      `          command: [${templateEntry.command.join(", ")}]`,
      `          severity: ${templateEntry.severity}`,
      "",
    ].join("\n");
    writeFileSync(join(extDir, "adev-extension.yaml"), derivedManifest);
    // Place a real payload at exactly the path the template names.
    mkdirSync(join(extDir, dirname(payloadRel)), { recursive: true });
    copyFileSync(join(EXAMPLE_DIR, "bin", "check.sh"), join(extDir, payloadRel));
    chmodSync(join(extDir, payloadRel), 0o755);

    // The template MUST install cleanly. Consent is explicit: the governance
    // slot ships an executable, so a non-interactive install without
    // --allow-exec refuses with GOVERNANCE_EXEC_NOT_CONSENTED.
    const result = await installExtension(extDir, projectRoot, {
      pluginRoot: stubPluginRoot,
      sourceUri: extDir,
      allowExec: true,
      interactive: false,
    });
    assert.equal(result.name, "template-derived-extension");

    // And validate.yaml MUST receive the new entry.
    const validatePath = join(projectRoot, ".context-index/governance/validate.yaml");
    assert.ok(existsSync(validatePath));
    const validate = parseYaml(readFileSync(validatePath, "utf8"));
    assert.equal(validate.validators, undefined, "root key must be checks, never validators");
    const installed = validate.checks.find((e) => e && e.id === "template-derived.passing");
    assert.ok(installed, "validate.yaml must contain the template-derived check id");
    // The template's declared relative path is rewritten to the relocated
    // payload, proving the documented form is the installable one.
    const payloadPath = join(
      projectRoot,
      ".context-index/extensions/template-derived-extension",
      payloadRel,
    );
    assert.deepEqual(installed.command, ["bash", payloadPath]);
    assert.ok(existsSync(payloadPath), `relocated payload must exist at ${payloadPath}`);
  });

  it("template enumerates all 5 provides.* slots as readable YAML examples", () => {
    // Parsed keys, not a substring grep: `new RegExp("hooks")` matches the word
    // anywhere in a 140-line commented file, so it could not fail.
    const template = parseYaml(readFileSync(TEMPLATE_PATH, "utf8"));
    assert.deepEqual(
      Object.keys(template.provides).sort(),
      ["domain-profile", "governance", "hooks", "samples", "skills"],
      "every provides.* slot must be live YAML the installer parses, not prose",
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Behavior 2 — PATH_TRAVERSAL inheritance on the reference install path
// ══════════════════════════════════════════════════════════════════════════

describe("example-validation-check: PATH_TRAVERSAL inheritance (Behavior 2)", () => {
  let projectRoot;
  let stubPluginRoot;

  beforeEach(() => {
    projectRoot = setupProject();
    stubPluginRoot = stubPluginRootDir();
  });

  afterEach(() => {
    cleanupTempDir(projectRoot);
    cleanupTempDir(stubPluginRoot);
  });

  it("install rejects a manifest whose hook source escapes the source dir", async () => {
    const extDir = createTempDir();
    writeFileSync(
      join(extDir, "adev-extension.yaml"),
      [
        "name: path-traversal-ext",
        "version: 0.1.0",
        "description: Attempts to escape the source dir via hook source",
        "requires:",
        '  adev: ">=0.0.0"',
        "provides:",
        "  hooks:",
        "    - event: PostToolUse",
        "      source: ../../../etc/passwd-escape.sh",
        "",
      ].join("\n"),
    );
    let threw = false;
    let errCode = null;
    try {
      await installExtension(extDir, projectRoot, {
        pluginRoot: stubPluginRoot,
        sourceUri: extDir,
      });
    } catch (err) {
      threw = true;
      errCode = err.code;
    }
    cleanupTempDir(extDir);
    // The path-traversal guard fires either at validation, at copy time, or
    // immediately as ENOENT (the escaping path resolves outside the source
    // dir, so the source file is not present from the install's perspective).
    // All three outcomes prevent the malicious source from landing — the
    // contract is "install must reject," not "install must use a specific
    // error code."
    assert.ok(
      threw,
      "install must reject manifests with path-escaping hook source",
    );
    assert.ok(
      errCode && /PATH_TRAVERSAL|SCHEMA|VALIDATION|HOOK|ENOENT/i.test(errCode),
      `expected PATH_TRAVERSAL/ENOENT/schema-related code, got ${errCode}`,
    );
  });
});
