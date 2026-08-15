/**
 * End-to-end test: install the example extension, then emit a validator_report
 * event via the `adev report --type validator` CLI verb, and assert the event
 * lands in the spec's lifecycle log with the correct validator id binding.
 *
 * This exercises the full extension authoring -> install -> validate event
 * flow described by Behavior 3 of extension-authoring-docs.spec.md:
 *
 *   When `/adev:validate` runs on a project that has installed
 *   `example-validation-check`, then the new check appears in the registry
 *   walk and its verdict is recorded via `adev report --type validator
 *   --step validate --validator example-validation-check.passing
 *   --verdict PASS` in the spec's lifecycle log.
 *
 * We exercise the registry-walk surface by loading `governance/validate.yaml`
 * via `loadValidateConfig` after install (proves the new check appears in the
 * topologically-sorted check list under the configured profile), and the
 * event-emission surface by spawning `node cli/index.mjs report`.
 *
 * Spec: .context-index/specs/features/extensions/extension-authoring-docs.spec.md
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync, execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  realpathSync,
  copyFileSync,
} from "node:fs";
import { join } from "node:path";

import { installExtension } from "../../lib/extensions/install.mjs";
import { loadValidateConfig } from "../../lib/governance/validate-config.mjs";
import { createTempDir, cleanupTempDir, PLUGIN_ROOT } from "../helpers.mjs";

const CLI = join(PLUGIN_ROOT, "cli", "index.mjs");
const EXAMPLE_DIR = join(PLUGIN_ROOT, "extensions", "example-validation-check");
const SPEC_REL = ".context-index/specs/features/m/stub.spec.md";

const STUB_SPEC = `---
charter: m
status: implemented
risk_level: low
revision: 1
charter-revision: 1
created: 2026-05-16
updated: 2026-05-16
---

# Live Spec: Stub for extension validate-flow test

## Behavioral Contract

Stub spec used by the extension validate-flow integration test.

## Acceptance Criteria

- [x] none
`;

function setupProject() {
  const dir = realpathSync(createTempDir());
  mkdirSync(join(dir, ".context-index/specs/features/m"), { recursive: true });
  mkdirSync(join(dir, ".context-index/lifecycle-state"), { recursive: true });
  writeFileSync(
    join(dir, ".context-index/manifest.yaml"),
    [
      "project:",
      "  name: ext-validate-flow",
      '  adev_version: "0.22.0"',
      "modules:",
      "  - slug: m",
      "    name: Stub Module",
      "lifecycle:",
      "  gate_mode: advisory",
      "",
    ].join("\n"),
  );
  writeFileSync(join(dir, SPEC_REL), STUB_SPEC);

  // Git init so any downstream lifecycle bookkeeping that touches git works.
  execSync("git init -q -b main", { cwd: dir, stdio: "ignore" });
  execSync("git config user.email a@b.c", { cwd: dir, stdio: "ignore" });
  execSync("git config user.name test", { cwd: dir, stdio: "ignore" });
  execSync("git config commit.gpgsign false", { cwd: dir, stdio: "ignore" });
  execSync("git add -A && git commit -q -m initial", { cwd: dir, stdio: "ignore" });

  return dir;
}

function setupStubPluginRoot() {
  // Stub plugin root with version satisfying the manifest's requires.adev
  // (>=0.27.0). Production install resolves this from the plugin's own
  // package.json. We stub here so the test does not depend on the current
  // package version (which lags behind the milestone field).
  const dir = createTempDir();
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "stub", version: "0.27.0" }),
  );
  mkdirSync(join(dir, "skills"), { recursive: true });
  // The install-time namespace resolver reads the bundled profile vocabulary
  // from `<pluginRoot>/templates/governance/profiles.yaml` to prove the
  // contributed entry's `profile` is a name the loader can resolve.
  mkdirSync(join(dir, "templates", "governance"), { recursive: true });
  copyFileSync(
    join(PLUGIN_ROOT, "templates", "governance", "profiles.yaml"),
    join(dir, "templates", "governance", "profiles.yaml"),
  );
  return dir;
}

function adev(projectDir, args) {
  const r = spawnSync("node", [CLI, ...args], {
    cwd: projectDir,
    encoding: "utf8",
    timeout: 15_000,
  });
  return {
    exitCode: r.status ?? 1,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
  };
}

function readEvents(projectDir) {
  const slug = "stub";
  const logPath = join(projectDir, ".context-index/lifecycle-state", `${slug}.jsonl`);
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe("extension-validate-flow: end-to-end install + validator_report event", () => {
  let projectDir;
  let stubPluginRoot;

  beforeEach(() => {
    projectDir = setupProject();
    stubPluginRoot = setupStubPluginRoot();
  });

  afterEach(() => {
    cleanupTempDir(projectDir);
    cleanupTempDir(stubPluginRoot);
  });

  it("install + validate-load + validator_report event flow", async () => {
    // ── Step 1: install the example extension ──────────────────────────
    const installReport = await installExtension(EXAMPLE_DIR, projectDir, {
      pluginRoot: stubPluginRoot,
      sourceUri: EXAMPLE_DIR,
      allowExec: true,
      interactive: false,
    });
    assert.equal(installReport.name, "example-validation-check");

    // ── Step 2: validate.yaml gained the entry ─────────────────────────
    const validatePath = join(projectDir, ".context-index/governance/validate.yaml");
    assert.ok(existsSync(validatePath), "validate.yaml must exist after install");
    const validateRaw = readFileSync(validatePath, "utf8");
    assert.match(
      validateRaw,
      /example-validation-check\.passing/,
      "validate.yaml must contain the new check id",
    );

    // ── Step 3: the validate-config loader walks the registry and the new
    //          check appears in the sorted check list under its profile.
    //
    // The installer now writes the overlay under `checks:` — the root key
    // `lib/governance/validate-config.mjs:110-111` actually reads. The old
    // `inferRootKey` emitted `validators:`, which no loader has ever read, so
    // the entry was silently inert on disk and this test could only assert the
    // install-side surface. There is nothing left to fold in: the loader
    // surfaces the check directly.
    const validateYaml = readFileSync(validatePath, "utf8");
    assert.match(validateYaml, /^checks:/m, "installer emits the 'checks:' root key for validate.yaml");
    assert.doesNotMatch(validateYaml, /validators:/m, "'validators:' is read by no loader");

    const loadResult = loadValidateConfig(projectDir, { pluginRoot: PLUGIN_ROOT });
    assert.ok(Array.isArray(loadResult.checks), "loadValidateConfig returns checks array");
    assert.ok(Array.isArray(loadResult.errors), "loadValidateConfig returns errors array");
    const newCheck = loadResult.checks.find((c) => c.id === "example-validation-check.passing");
    assert.ok(newCheck, `loader must surface the installed check, got ${loadResult.checks.map((c) => c.id).join(", ")}`);
    assert.equal(newCheck.kind, "quality-gate");
    assert.equal(newCheck.profile, "read-only");
    const hasError = loadResult.errors.some((e) => /example-validation-check/.test(e.message || ""));
    assert.equal(hasError, false, `no errors for new check, got ${JSON.stringify(loadResult.errors)}`);

    // ── Step 4: emit a validator_report event citing the new check ─────
    const r = adev(projectDir, [
      "report",
      "--type", "validator",
      "--spec", SPEC_REL,
      "--step", "validate",
      "--validator", "example-validation-check.passing",
      "--verdict", "PASS",
    ]);
    assert.equal(r.exitCode, 0, `report exit code: ${r.stderr}`);

    // ── Step 5: confirm the event landed in the spec's lifecycle log ───
    const events = readEvents(projectDir);
    const validatorEvents = events.filter((e) => e.event === "validator_report");
    assert.equal(validatorEvents.length, 1, "exactly one validator_report event");
    assert.equal(
      validatorEvents[0].validator,
      "example-validation-check.passing",
      "validator id matches the governance entry id",
    );
    assert.equal(validatorEvents[0].verdict, "PASS");
    assert.equal(validatorEvents[0].step, "validate");
  });

  it("validator id is a single token (no newlines, no nested-object form)", async () => {
    await installExtension(EXAMPLE_DIR, projectDir, {
      pluginRoot: stubPluginRoot,
      sourceUri: EXAMPLE_DIR,
      allowExec: true,
      interactive: false,
    });

    // Behavior 3: --validator MUST be a single token. The CLI parseArgs
    // surface accepts the string; the report library then writes it
    // verbatim. We verify the canonical id round-trips cleanly with no
    // embedded newlines or whitespace mangling.
    const r = adev(projectDir, [
      "report",
      "--type", "validator",
      "--spec", SPEC_REL,
      "--step", "validate",
      "--validator", "example-validation-check.passing",
      "--verdict", "PASS",
    ]);
    assert.equal(r.exitCode, 0, `report exit: ${r.stderr}`);

    const events = readEvents(projectDir);
    const v = events.find((e) => e.event === "validator_report");
    assert.ok(v, "validator_report event must exist");
    assert.equal(typeof v.validator, "string", "validator must be a string");
    assert.doesNotMatch(v.validator, /\n/, "validator must not contain newlines");
    assert.ok(v.validator.length <= 200, "validator must be ≤200 chars per lifecycle-event-log redaction cap");
  });
});
