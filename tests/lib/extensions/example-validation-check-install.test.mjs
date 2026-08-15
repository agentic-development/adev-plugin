/**
 * Tests for the example-validation-check reference extension.
 *
 * Covers:
 *   - Manifest parses with the canonical provides.governance shape (Task 2 fixture).
 *   - Manifest template exercises all 5 provides.* slots (Task 4 fixture).
 *   - bin/check.sh shebang, executable bit, set -euo pipefail, forbidden-form grep,
 *     runtime exit code, single-line stdout, sentinel-env redaction (Task 3, SEC2-8/SEC2-10).
 *   - Install positive path against a temp project.
 *   - Install rejects string-form command at validate-load time (negative fixture).
 *   - Install report surfaces colliding ids in a dedicated section.
 *   - After install, the merged validate.yaml entry's command argv is rewritten to
 *     the absolute relocated-payload path (SEC2-11 spirit — argv form preserved,
 *     no shell interpolation).
 *   - End-to-end: install into a foreign temp project (NOT this repo), covering the
 *     exec-consent gate, payload relocation + 0555 hardening, comment preservation,
 *     the real loader round-trip, and actually running the check.
 *   - Line-count budgets: manifest ≤25, bin/check.sh ≤15, README ≤60.
 *
 * Spec: .context-index/specs/features/extensions/extension-authoring-docs.spec.md
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import {
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
  mkdirSync,
  realpathSync,
  copyFileSync,
} from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { parseYaml } from "../../../lib/profiles/yaml.mjs";
import { parseExtensionManifest } from "../../../lib/extensions/manifest-schema.mjs";
import { installExtension, readManifestStamps } from "../../../lib/extensions/install.mjs";
import { mergeGovernanceEntries } from "../../../lib/extensions/content-install.mjs";
import { loadValidateConfig } from "../../../lib/governance/validate-config.mjs";
import { runQualityGate } from "../../../lib/governance/quality-gate.mjs";
import { createTempDir, cleanupTempDir, PLUGIN_ROOT } from "../../helpers.mjs";

const EXAMPLE_DIR = join(PLUGIN_ROOT, "extensions", "example-validation-check");
const MANIFEST_PATH = join(EXAMPLE_DIR, "adev-extension.yaml");
const BIN_PATH = join(EXAMPLE_DIR, "bin", "check.sh");
const README_PATH = join(EXAMPLE_DIR, "README.md");
const TEMPLATE_PATH = join(PLUGIN_ROOT, "templates", "adev-extension.example.yaml");

// ── Task 2 fixture: manifest shape ──────────────────────────────────────

describe("example-validation-check: manifest", () => {
  it("manifest-parses with canonical provides.governance shape", () => {
    const raw = readFileSync(MANIFEST_PATH, "utf8");
    const result = parseExtensionManifest(raw);
    assert.ok(result.valid, `manifest must parse: ${result.message || ""}`);
    const m = result.manifest;
    assert.equal(m.name, "example-validation-check");
    assert.ok(Array.isArray(m.provides.governance), "provides.governance must be an array");
    assert.equal(m.provides.governance[0].target, "validate.yaml");
    assert.ok(Array.isArray(m.provides.governance[0].entries), "entries must be an array");
    const entry = m.provides.governance[0].entries[0];
    assert.equal(entry.id, "example-validation-check.passing");
    assert.equal(entry.kind, "quality-gate");
    assert.ok(Array.isArray(entry.command), "command must be argv form");
    assert.equal(entry.profile, "read-only", "profile must be explicit");
    assert.equal(entry.severity, "warning");
  });

  it("manifest-line-budget: manifest is ≤25 lines", () => {
    const raw = readFileSync(MANIFEST_PATH, "utf8");
    const lines = raw.split("\n").length;
    assert.ok(lines <= 25, `manifest is ${lines} lines, budget is 25`);
  });
});

// ── Task 4 fixture: template parses all 5 slots ─────────────────────────

describe("templates/adev-extension.example.yaml", () => {
  it("template-parses and exercises all 5 provides.* slots", () => {
    const raw = readFileSync(TEMPLATE_PATH, "utf8");
    const m = parseYaml(raw);
    assert.ok(m.provides.skills, "provides.skills slot must be present");
    assert.ok(m.provides.hooks, "provides.hooks slot must be present");
    assert.ok(m.provides.governance, "provides.governance slot must be present");
    assert.ok(m.provides["domain-profile"], "provides.domain-profile slot must be present");
    assert.ok(m.provides.samples, "provides.samples slot must be present");
  });

  it("template provides.governance uses canonical {target, entries[]} shape", () => {
    const raw = readFileSync(TEMPLATE_PATH, "utf8");
    const m = parseYaml(raw);
    assert.ok(Array.isArray(m.provides.governance), "must be array");
    assert.ok(m.provides.governance[0].target, "first entry must have target");
    assert.ok(Array.isArray(m.provides.governance[0].entries), "first entry must have entries[]");
  });
});

// ── Task 3 fixture: bin/check.sh hardening ──────────────────────────────

describe("example-validation-check: bin/check.sh hardening", () => {
  it("bin-check-shebang-and-executable", () => {
    const stat = statSync(BIN_PATH);
    assert.ok(stat.mode & 0o111, "bin/check.sh must be executable");
    const body = readFileSync(BIN_PATH, "utf8");
    assert.match(body, /^#!\/usr\/bin\/env bash/, "must begin with #!/usr/bin/env bash");
  });

  it("bin-check-safe-shell-options-and-forbidden-forms", () => {
    const body = readFileSync(BIN_PATH, "utf8");
    assert.match(body, /set -euo pipefail/, "must set -euo pipefail");
    // SEC2-8: static grep — forbid dangerous bash forms.
    // Filter comment lines before matching variable-expansion patterns (the README
    // and a security comment may reference '$VAR' inside prose; only the executable
    // body must be clean).
    const codeLines = body
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("#"))
      .join("\n");
    const forbidden = [
      { re: /\beval\b/, label: "eval" },
      { re: /\bsource\b/, label: "source" },
      { re: /`[^`]+`/, label: "backtick command substitution" },
      { re: /\$\(/, label: "$(...) command substitution" },
      { re: /\$\{?[A-Z_][A-Z0-9_]*/, label: "variable expansion ($VAR / ${VAR})" },
      { re: /\bprintenv\b/, label: "printenv" },
      { re: /(^|[^a-zA-Z])env(\s|$)/, label: "env" },
    ];
    for (const { re, label } of forbidden) {
      assert.doesNotMatch(codeLines, re, `bin/check.sh must not contain ${label}`);
    }
  });

  it("bin-check-runtime: exits 0 with single-line stdout and zero stderr", () => {
    const r = spawnSync("bash", [BIN_PATH], { encoding: "utf8" });
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}: ${r.stderr}`);
    assert.equal(r.stderr, "", "stderr must be empty");
    assert.equal(r.stdout.trim().split("\n").length, 1, "stdout must be one line");
    assert.match(r.stdout, /^PASS: example-validation-check$/m);
  });

  it("bin-check-ignores SECRET sentinel env var (SEC2-10)", () => {
    const r = spawnSync("bash", [BIN_PATH], {
      encoding: "utf8",
      env: { ...process.env, SECRET: "hunter2-sentinel-value" },
    });
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout, /hunter2-sentinel-value/, "stdout must not leak SECRET");
    assert.doesNotMatch(r.stderr, /hunter2-sentinel-value/, "stderr must not leak SECRET");
  });

  it("bin-line-budget: bin/check.sh is ≤15 lines including shebang", () => {
    const raw = readFileSync(BIN_PATH, "utf8");
    const lines = raw.split("\n").length;
    assert.ok(lines <= 15, `bin/check.sh is ${lines} lines, budget is 15`);
  });
});

// ── Task 6 fixture: README line budget ──────────────────────────────────

describe("example-validation-check: README line budget", () => {
  it("readme-line-budget: README is ≤60 lines", () => {
    const raw = readFileSync(README_PATH, "utf8");
    const lines = raw.split("\n").length;
    assert.ok(lines <= 60, `README is ${lines} lines, budget is 60`);
  });
});

// ── Install positive path ───────────────────────────────────────────────

describe("example-validation-check: install positive path", () => {
  let projectRoot;
  let stubPluginRoot;

  beforeEach(() => {
    projectRoot = createTempDir();
    mkdirSync(join(projectRoot, ".context-index"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".context-index/manifest.yaml"),
      "project:\n  name: install-test\n",
    );

    // Stub plugin root with version satisfying the manifest's requires.adev
    // (>=0.27.0). Mirrors how the real install path resolves the installed
    // version from the plugin's package.json. Avoids coupling the test to the
    // current package.json version, which lags behind the milestone field.
    stubPluginRoot = createTempDir();
    writeFileSync(
      join(stubPluginRoot, "package.json"),
      JSON.stringify({ name: "stub", version: "0.27.0" }),
    );
    mkdirSync(join(stubPluginRoot, "skills"), { recursive: true });
    // A faithful plugin root also carries the bundled profile vocabulary: the
    // install-time namespace resolver reads `<pluginRoot>/templates/governance/
    // profiles.yaml` to prove the entry's `profile` is not a name that would
    // make the loader push UNKNOWN_PROFILE.
    mkdirSync(join(stubPluginRoot, "templates", "governance"), { recursive: true });
    copyFileSync(
      join(PLUGIN_ROOT, "templates", "governance", "profiles.yaml"),
      join(stubPluginRoot, "templates", "governance", "profiles.yaml"),
    );
  });

  afterEach(() => {
    cleanupTempDir(projectRoot);
    cleanupTempDir(stubPluginRoot);
  });

  it("install-positive-path: installs and stamps manifest + validate.yaml", async () => {
    const report = await installExtension(EXAMPLE_DIR, projectRoot, {
      pluginRoot: stubPluginRoot,
      sourceUri: EXAMPLE_DIR,
      allowExec: true,
      interactive: false,
    });
    assert.equal(report.name, "example-validation-check");
    assert.equal(report.version, "0.1.0");

    // Manifest stamp recorded
    const stamps = readManifestStamps(projectRoot);
    assert.equal(stamps.length, 1);
    assert.equal(stamps[0].name, "example-validation-check");

    // validate.yaml gained the entry
    const validatePath = join(projectRoot, ".context-index/governance/validate.yaml");
    assert.ok(existsSync(validatePath), "validate.yaml must be created");
    const validate = parseYaml(readFileSync(validatePath, "utf8"));
    // The root key is `checks` — the one `lib/governance/validate-config.mjs`
    // actually reads. An `||` fallback here would paper over a root-key
    // mismatch that leaves the entry invisible to the loader (spec defect 5).
    assert.equal(validate.validators, undefined, "root key must be checks, never validators");
    const entries = validate.checks;
    assert.ok(
      entries.some((e) => e && e.id === "example-validation-check.passing"),
      `validate.yaml must contain example-validation-check.passing, got keys ${Object.keys(validate)}`,
    );
  });

  it("install-argv-form-preserved (SEC2-11): merged entry retains argv list, never a shell string", async () => {
    await installExtension(EXAMPLE_DIR, projectRoot, {
      pluginRoot: stubPluginRoot,
      sourceUri: EXAMPLE_DIR,
      allowExec: true,
      interactive: false,
    });
    const validatePath = join(projectRoot, ".context-index/governance/validate.yaml");
    const raw = readFileSync(validatePath, "utf8");
    // The serialized YAML emits the array as `[ "bash", "/abs/path/check.sh" ]`.
    // SEC2-11: command must remain an argv list, not collapsed to a shell string.
    assert.match(raw, /command:\s*\[/m, "command must be serialized as argv list");
    assert.doesNotMatch(raw, /command:\s*"[^"]*\s[^"]*"/, "command must not be a shell-form string");
  });
});

// ── Install: string-form command rejected ───────────────────────────────

describe("example-validation-check: install rejects string-form command", () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = createTempDir();
    mkdirSync(join(projectRoot, ".context-index/governance"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".context-index/manifest.yaml"),
      "project:\n  name: install-test\n",
    );
  });

  afterEach(() => {
    cleanupTempDir(projectRoot);
  });

  it("install-string-form-command-rejected: validate-load fails with QUALITY_GATE_COMMAND_SHELL", () => {
    // The install merge accepts primitive scalars including strings; the rejection
    // fires at validate-load time per configurable-checks Behavior 6a. We exercise
    // the same path that /adev:validate would: write a string-form command into
    // governance/validate.yaml then call loadValidateConfig.
    const overlayPath = join(projectRoot, ".context-index/governance/validate.yaml");
    writeFileSync(
      overlayPath,
      [
        "checks:",
        "  - id: example-validation-check.passing",
        "    kind: quality-gate",
        "    profile: read-only",
        '    command: "bash extensions/example-validation-check/bin/check.sh"',
        "    severity: warning",
        "",
      ].join("\n"),
    );
    const result = loadValidateConfig(projectRoot, { pluginRoot: PLUGIN_ROOT });
    const codes = result.errors.map((e) => e.code);
    assert.ok(
      codes.includes("QUALITY_GATE_COMMAND_SHELL"),
      `expected QUALITY_GATE_COMMAND_SHELL in errors, got ${codes.join(", ")}`,
    );
  });
});

// ── Install: collision report dedicated section (SA2-2) ─────────────────

describe("example-validation-check: install collision reporting", () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = createTempDir();
    mkdirSync(join(projectRoot, ".context-index/governance"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".context-index/manifest.yaml"),
      "project:\n  name: install-test\n",
    );
  });

  afterEach(() => {
    cleanupTempDir(projectRoot);
  });

  it("install-collision-report: pre-existing project entry untouched; collision logged as skipped", () => {
    // Seed project's validate.yaml under the root key validate-config actually
    // reads (`checks`, not `validators` — lib/governance/validate-config.mjs:110-111).
    const overlayPath = join(projectRoot, ".context-index/governance/validate.yaml");
    const src = [
      "checks:",
      "  - id: example-validation-check.passing",
      "    severity: error",
      "    enabled: false",
      "",
    ].join("\n");
    writeFileSync(overlayPath, src);

    const entries = [
      {
        id: "example-validation-check.passing",
        kind: "quality-gate",
        profile: "read-only",
        command: ["bash", "extensions/example-validation-check/bin/check.sh"],
        severity: "warning",
        after: ["validate.check-1-quality-gates"],
      },
    ];

    const report = mergeGovernanceEntries(projectRoot, "validate.yaml", entries);

    assert.deepEqual(report.mergesApplied, ["skipped: example-validation-check.passing"]);

    // The file is byte-identical: a colliding id is skipped outright. The old
    // fill-gap merge would have attached the extension's `command` to the
    // project's own entry — arbitrary code execution dressed as a merge.
    assert.equal(readFileSync(overlayPath, "utf8"), src);

    const result = parseYaml(readFileSync(overlayPath, "utf8"));
    const projectEntry = result.checks.find((e) => e.id === "example-validation-check.passing");
    assert.equal(projectEntry.severity, "error", "project severity must win");
    assert.equal(projectEntry.enabled, false, "project enabled must win");
    assert.equal(projectEntry.kind, undefined, "no extension field may be filled in");
    assert.equal(projectEntry.command, undefined, "no command may reach an existing entry");
  });

  it("install-collision-multiple-ids: all colliding ids appear in mergesApplied report", () => {
    const overlayPath = join(projectRoot, ".context-index/governance/validate.yaml");
    writeFileSync(
      overlayPath,
      [
        "checks:",
        "  - id: example-validation-check.passing",
        "    severity: error",
        "  - id: example-validation-check.secondary",
        "    severity: warning",
        "",
      ].join("\n"),
    );

    // A quality-gate check requires a command: a commandless one is rejected by
    // lib/governance/validate-config.mjs:429-443 rather than executed, so it is
    // refused at contribution time.
    const cmd = ["bash", "extensions/example-validation-check/bin/check.sh"];
    const entries = [
      { id: "example-validation-check.passing", kind: "quality-gate", profile: "read-only", command: cmd },
      { id: "example-validation-check.secondary", kind: "quality-gate", profile: "read-only", command: cmd },
      { id: "example-validation-check.new", kind: "quality-gate", profile: "read-only", command: cmd },
    ];

    const report = mergeGovernanceEntries(projectRoot, "validate.yaml", entries);

    assert.deepEqual(report.mergesApplied, [
      "skipped: example-validation-check.passing",
      "skipped: example-validation-check.secondary",
      "appended: example-validation-check.new",
    ]);

    const result = parseYaml(readFileSync(overlayPath, "utf8"));
    assert.deepEqual(
      result.checks.map((c) => c.id),
      [
        "example-validation-check.passing",
        "example-validation-check.secondary",
        "example-validation-check.new",
      ],
    );
    // Neither colliding entry gained the extension's command.
    assert.equal(result.checks[0].command, undefined);
    assert.equal(result.checks[1].command, undefined);
    assert.deepEqual(result.checks[2].command, cmd);
  });
});

// ── End-to-end: install into a foreign temp project, then RUN the check ──
//
// Deliberately NOT this repo. The reference extension's `command` used to name
// `extensions/example-validation-check/bin/check.sh` — a project-root-relative
// path that only resolves inside adev-plugin itself. Installing into this repo
// made that broken path look correct (review blocker SEC-3). Installing into a
// temp project is what catches it: the payload is relocated under the project's
// own `.context-index/extensions/<name>/` and the argv element is rewritten to
// that absolute path, so the check is runnable by any consumer.

describe("example-validation-check: end-to-end install into a foreign project", () => {
  let projectRoot;
  let stubPluginRoot;
  let seededSource;

  // 4 header comments + 7 in-block comments + 9 trailer comments = 20.
  const SEEDED_HEADER = [
    "# ─────────────────────────────────────────────────────────────",
    "# Project-authored governance registry.",
    "# Comments here must survive an extension install byte-for-byte.",
    "# ─────────────────────────────────────────────────────────────",
  ];
  const SEEDED_TRAILER = [
    "# ── Notes ────────────────────────────────────────────────────",
    "# 1. Extension-contributed entries are appended, never merged in.",
    "# 2. A colliding id is skipped outright.",
    "# 3. Executable payloads require explicit operator consent.",
    "# 4. Payloads are relocated under .context-index/extensions/.",
    "# 5. Relocated payloads are chmod 0555 (read + execute, no write).",
    "# 6. argv form is preserved; a shell string is refused.",
    "# 7. The root key is `checks`, never `validators`.",
    "# ─────────────────────────────────────────────────────────────",
  ];

  beforeEach(() => {
    projectRoot = realpathSync(createTempDir());
    mkdirSync(join(projectRoot, ".context-index/governance"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".context-index/manifest.yaml"),
      "project:\n  name: foreign-consumer\n",
    );

    const body = [];
    for (let i = 1; i <= 7; i += 1) {
      body.push(`  # seeded check ${i} — authored by the project, not by any extension`);
      body.push(`  - id: seeded.check-${i}`);
      body.push("    kind: quality-gate");
      body.push("    profile: read-only");
      body.push(`    command: [echo, seeded-${i}]`);
    }
    seededSource = [...SEEDED_HEADER, "checks:", ...body, ...SEEDED_TRAILER, ""].join("\n");
    writeFileSync(join(projectRoot, ".context-index/governance/validate.yaml"), seededSource);

    stubPluginRoot = createTempDir();
    writeFileSync(
      join(stubPluginRoot, "package.json"),
      JSON.stringify({ name: "stub", version: "0.27.0" }),
    );
    mkdirSync(join(stubPluginRoot, "skills"), { recursive: true });
    // A faithful plugin root also carries the bundled profile vocabulary: the
    // install-time namespace resolver reads `<pluginRoot>/templates/governance/
    // profiles.yaml` to prove the entry's `profile` is not a name that would
    // make the loader push UNKNOWN_PROFILE.
    mkdirSync(join(stubPluginRoot, "templates", "governance"), { recursive: true });
    copyFileSync(
      join(PLUGIN_ROOT, "templates", "governance", "profiles.yaml"),
      join(stubPluginRoot, "templates", "governance", "profiles.yaml"),
    );
  });

  afterEach(() => {
    cleanupTempDir(projectRoot);
    cleanupTempDir(stubPluginRoot);
  });

  it("e2e-foreign-project: consent gate, payload relocation, loader round-trip, real execution", async () => {
    // Sanity on the fixture itself: 20 comment lines, 7 checks, before install.
    const seededComments = seededSource.split("\n").filter((l) => l.trimStart().startsWith("#"));
    assert.equal(seededComments.length, 20, "fixture must seed exactly 20 comment lines");
    assert.equal(parseYaml(seededSource).checks.length, 7, "fixture must seed exactly 7 checks");

    // 1. Without consent the install refuses — the extension ships an executable
    //    contribution, and a non-interactive install must fail closed.
    await assert.rejects(
      () =>
        installExtension(EXAMPLE_DIR, projectRoot, {
          pluginRoot: stubPluginRoot,
          sourceUri: EXAMPLE_DIR,
          allowExec: false,
          interactive: false,
        }),
      (err) => {
        assert.equal(err.code, "GOVERNANCE_EXEC_NOT_CONSENTED");
        return true;
      },
    );
    // The refusal wrote nothing: the seeded file is still byte-identical.
    const validatePath = join(projectRoot, ".context-index/governance/validate.yaml");
    assert.equal(readFileSync(validatePath, "utf8"), seededSource, "a refused install must write nothing");

    // 2. With consent the install succeeds.
    const report = await installExtension(EXAMPLE_DIR, projectRoot, {
      pluginRoot: stubPluginRoot,
      sourceUri: EXAMPLE_DIR,
      allowExec: true,
      interactive: false,
    });
    assert.equal(report.name, "example-validation-check");
    assert.deepEqual(report.mergesApplied, ["appended: example-validation-check.passing"]);

    // 3. The registry gained exactly one entry, under `checks`, and every
    //    comment line survived byte-for-byte.
    const raw = readFileSync(validatePath, "utf8");
    const parsed = parseYaml(raw);
    assert.equal(parsed.validators, undefined, "root key must be checks, never validators");
    assert.equal(parsed.checks.length, 8, "7 seeded + 1 contributed");
    assert.deepEqual(
      parsed.checks.map((c) => c.id),
      [
        "seeded.check-1",
        "seeded.check-2",
        "seeded.check-3",
        "seeded.check-4",
        "seeded.check-5",
        "seeded.check-6",
        "seeded.check-7",
        "example-validation-check.passing",
      ],
    );
    assert.deepEqual(
      raw.split("\n").filter((l) => l.trimStart().startsWith("#")),
      seededComments,
      "all 20 comment lines must be preserved byte-for-byte",
    );

    // 4. The payload was relocated into the project and hardened to 0555.
    const payloadPath = join(
      projectRoot,
      ".context-index/extensions/example-validation-check/bin/check.sh",
    );
    assert.ok(existsSync(payloadPath), `payload must be relocated to ${payloadPath}`);
    assert.equal(statSync(payloadPath).mode & 0o777, 0o555, "relocated payload must be mode 0555");
    assert.equal(
      readFileSync(payloadPath, "utf8"),
      readFileSync(BIN_PATH, "utf8"),
      "relocated payload must be a byte-identical copy of the source script",
    );

    // 5. The installed entry's argv names that absolute path — not the
    //    extension-source-relative path the manifest declares.
    const installed = parsed.checks.find((c) => c.id === "example-validation-check.passing");
    assert.deepEqual(installed.command, ["bash", payloadPath]);
    assert.equal(installed.source, "extension:example-validation-check");

    // 6. The REAL loader accepts it — not a hand-parsed object.
    const config = loadValidateConfig(projectRoot, { pluginRoot: PLUGIN_ROOT });
    assert.deepEqual(config.errors, [], "loader must report no errors");
    const loaded = config.checks.find((c) => c.id === "example-validation-check.passing");
    assert.ok(loaded, `loader must return the installed check, got ${config.checks.map((c) => c.id).join(", ")}`);
    assert.equal(loaded.kind, "quality-gate");
    assert.equal(loaded.profile, "read-only");
    assert.deepEqual(loaded.command, ["bash", payloadPath]);

    // 7. And it actually runs. Skipped ONLY on Windows, where the bash payload
    //    has no interpreter contract; it must never skip on POSIX.
    if (process.platform === "win32") return;
    const result = await runQualityGate(loaded, {
      cwd: projectRoot,
      env: config.profiles[loaded.profile]?.env ?? {},
      redactor: { redact: (s) => s },
    });
    assert.equal(result.exitCode, 0, `expected exit 0, got ${result.exitCode}: ${result.redactedStderr}`);
    assert.equal(result.status, "PASS");
    assert.match(result.redactedStdout, /^PASS: example-validation-check$/m);
  });
});
