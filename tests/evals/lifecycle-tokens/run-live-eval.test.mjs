import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadScenarioRegistry } from "./registry.mjs";
import { runLiveProviderEval } from "./run-live-eval.mjs";

const SCENARIOS_DIR = new URL("./scenarios/", import.meta.url);
const hasRealCodexEnv =
  process.env.ADEV_RUN_REAL_CODEX_TESTS === "true" &&
  typeof process.env.ADEV_LIFECYCLE_PROVIDER_CODEX_RUNNER === "string" &&
  process.env.ADEV_LIFECYCLE_PROVIDER_CODEX_RUNNER.length > 0 &&
  (process.env.CODEX === "true" || process.env.OPENAI_CODEX === "true");

function createProviderModule(tempDir, fileName, source) {
  const filePath = join(tempDir, fileName);
  writeFileSync(filePath, source, "utf8");
  return new URL(`file://${filePath}`).href;
}

describe("runLiveProviderEval", () => {
  let tempDir;
  let reportsDir;
  let scenarios;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "lifecycle-live-"));
    reportsDir = join(tempDir, "reports");
    scenarios = loadScenarioRegistry(SCENARIOS_DIR);
  });

  afterEach(() => {
    delete process.env.CODEX;
    delete process.env.ADEV_LIFECYCLE_PROVIDER_CODEX_RUNNER;
    delete process.env.ADEV_LIFECYCLE_PROVIDER_CODEX_BIN;
    delete process.env.ADEV_LIFECYCLE_PROVIDER_CODEX_ARGS;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("runs available providers in isolation and keeps unavailable or malformed providers from aborting the matrix", async () => {
    const okModule = createProviderModule(
      tempDir,
      "provider-ok.mjs",
      [
        "export const providerWrapper = {",
        '  provider_id: "codex",',
        "  supports_tokens: true,",
        "  supports_model_id: true,",
        "  supports_subagents: true,",
        "  is_available: true,",
        "  availability_reason: null,",
        `  worker_module_path: ${JSON.stringify(new URL(`file://${join(tempDir, "provider-ok.mjs")}`).href)},`,
        "  async runPhase({ scenario, phase, fixtureProfileId }) {",
        '    if (scenario.scenario_id === "subagent-heavy-review" && phase.id === "review-specs") {',
        '      return { status: "passed", triggerType: "on_fanout_complete", model_id: "gpt-5.4", fixture_profile_id: fixtureProfileId, fixture_complexity: "medium", tokenUsage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 }, subagentRuns: [{ actorRole: "security", status: "passed", tokenUsage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 } }] };',
        "    }",
        '    return { status: "passed", model_id: "gpt-5.4", fixture_profile_id: fixtureProfileId, fixture_complexity: "medium", tokenUsage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } };',
        "  }",
        "};",
        "export default providerWrapper;",
      ].join("\n"),
    );

    const malformedModule = createProviderModule(
      tempDir,
      "provider-malformed.mjs",
      [
        "export const providerWrapper = {",
        '  provider_id: "opencode",',
        "  supports_tokens: true,",
        "  supports_model_id: true,",
        "  supports_subagents: true,",
        "  is_available: true,",
        "  availability_reason: null,",
        `  worker_module_path: ${JSON.stringify(new URL(`file://${join(tempDir, "provider-malformed.mjs")}`).href)},`,
        "  async runPhase() {",
        '    return { status: "passed", phase_id: "wrong-phase" };',
        "  }",
        "};",
        "export default providerWrapper;",
      ].join("\n"),
    );

    const timeoutModule = createProviderModule(
      tempDir,
      "provider-timeout.mjs",
      [
        "export const providerWrapper = {",
        '  provider_id: "claude-code",',
        "  supports_tokens: true,",
        "  supports_model_id: true,",
        "  supports_subagents: true,",
        "  is_available: true,",
        "  availability_reason: null,",
        `  worker_module_path: ${JSON.stringify(new URL(`file://${join(tempDir, "provider-timeout.mjs")}`).href)},`,
        "  async runPhase() {",
        "    await new Promise((resolve) => setTimeout(resolve, 250));",
        '    return { status: "passed", tokenUsage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };',
        "  }",
        "};",
        "export default providerWrapper;",
      ].join("\n"),
    );

    const result = await runLiveProviderEval({
      scenarios: scenarios.filter((scenario) => scenario.scenario_id !== "review-fails-once"),
      providers: [
        {
          provider_id: "claude-code",
          supports_tokens: true,
          supports_model_id: true,
          supports_subagents: true,
          is_available: true,
          availability_reason: null,
          worker_module_path: timeoutModule,
          async runPhase() {},
        },
        {
          provider_id: "codex",
          supports_tokens: true,
          supports_model_id: true,
          supports_subagents: true,
          is_available: true,
          availability_reason: null,
          worker_module_path: okModule,
          async runPhase() {},
        },
        {
          provider_id: "opencode",
          supports_tokens: true,
          supports_model_id: true,
          supports_subagents: true,
          is_available: true,
          availability_reason: null,
          worker_module_path: malformedModule,
          async runPhase() {},
        },
      ],
      reportsDir,
      timeoutMs: 400,
      maxPayloadBytes: 8_192,
      makeRunId: (scenarioId, providerId) => `${providerId}-${scenarioId}-live-1`,
      now: () => "2026-03-26T00:00:00.000Z",
      fixtureProfileId: "sample-project-medium",
    });

    assert.deepEqual(
      result.scenarioRuns.map((run) => [run.provider_id, run.scenario_id, run.status, run.reason_code]),
      [
        ["claude-code", "happy-path", "incomplete", "provider_timeout"],
        ["claude-code", "subagent-heavy-review", "incomplete", "provider_timeout"],
        ["codex", "happy-path", "passed", null],
        ["codex", "subagent-heavy-review", "passed", null],
        ["opencode", "happy-path", "failed", "invalid_phase_mapping"],
        ["opencode", "subagent-heavy-review", "failed", "invalid_phase_mapping"],
      ],
    );
    assert.ok(
      result.scenarioRuns
        .filter((run) => run.provider_id === "codex")
        .every((run) => run.fixture_profile_id === "sample-project-medium" && run.fixture_complexity === "medium"),
    );

    assert.equal(readFileSync(result.reports.crossProviderReportPath, "utf8").includes("Cross-Provider Rollup"), true);
    assert.equal(readFileSync(result.reports.crossProviderReportPath, "utf8").includes("Fixture Profile: sample-project-medium"), true);
    assert.equal(readFileSync(result.reports.rollupReportPath, "utf8").includes("Phase Rankings"), true);
  });

  it("keeps explicit unavailable providers as incomplete runs and exposes the package scripts", async () => {
    const packageJson = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8"));
    assert.equal(packageJson.scripts["eval:lifecycle-tokens"], "node tests/evals/lifecycle-tokens/run-eval.mjs");
    assert.equal(packageJson.scripts["eval:lifecycle-tokens:live"], "node tests/evals/lifecycle-tokens/run-live-eval.mjs");

    const result = await runLiveProviderEval({
      scenarios: scenarios.filter((scenario) => scenario.scenario_id === "happy-path"),
      providers: [
        {
          provider_id: "claude-code",
          supports_tokens: true,
          supports_model_id: true,
          supports_subagents: true,
          is_available: false,
          availability_reason: "provider_not_installed",
          async runPhase() {},
        },
      ],
      reportsDir,
      makeRunId: (scenarioId, providerId) => `${providerId}-${scenarioId}-live-1`,
      now: () => "2026-03-26T00:00:00.000Z",
    });

    assert.deepEqual(
      result.scenarioRuns.map((run) => [run.provider_id, run.status, run.reason_code]),
      [["claude-code", "incomplete", "provider_not_installed"]],
    );
  });

  it(
    "can run the real codex wrapper with the actual codex CLI when explicitly enabled",
    { skip: !hasRealCodexEnv },
    async () => {
    const { providerWrapper } = await import(new URL(`./providers/codex.mjs?live=${Date.now()}`, import.meta.url));

    const result = await runLiveProviderEval({
      scenarios: scenarios.filter((scenario) =>
        ["happy-path", "subagent-heavy-review"].includes(scenario.scenario_id),
      ),
      providers: [providerWrapper],
      reportsDir,
      timeoutMs: 30_000,
      maxPayloadBytes: 64 * 1024,
      makeRunId: (scenarioId, providerId) => `${providerId}-${scenarioId}-live-2`,
      now: () => "2026-03-26T00:00:00.000Z",
    });

      assert.equal(result.scenarioRuns.length, 2);
      assert.ok(result.scenarioRuns.every((run) => run.provider_id === "codex"));
      assert.ok(result.scenarioRuns.every((run) => ["passed", "failed", "incomplete"].includes(run.status)));
      assert.ok(result.scenarioRuns.every((run) => typeof run.event_log_path === "string"));
    },
  );
});
