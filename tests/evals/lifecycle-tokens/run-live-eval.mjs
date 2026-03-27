#!/usr/bin/env node

import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { loadScenarioRegistry } from "./registry.mjs";
import { loadProviderRegistry } from "./providers/registry.mjs";
import { runScenarioMatrix } from "./run-orchestration.mjs";
import { writeReports } from "./report.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const scenariosDir = join(__dirname, "scenarios");
const artifactsDir = join(__dirname, "reports");
const rawDir = join(artifactsDir, "raw");

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function defaultRunId(scenarioId, providerId) {
  return `${providerId}-${scenarioId}-${Date.now()}`;
}

function readTimeoutMsFromEnv() {
  const raw = process.env.ADEV_LIFECYCLE_LIVE_TIMEOUT_MS;
  if (raw === undefined) {
    return 120_000;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    fail(
      "invalid_timeout_configuration",
      "ADEV_LIFECYCLE_LIVE_TIMEOUT_MS must be a positive integer when set",
    );
  }

  return parsed;
}

function createUnavailableRun({ scenario, provider, eventsDir, makeRunId, now }) {
  return runScenarioMatrix({
    scenarios: [scenario],
    providerId: provider.provider_id,
    eventsDir,
    makeRunId: (scenarioId) => makeRunId(scenarioId, provider.provider_id),
    now,
    executePhase: async () => ({
      status: "incomplete",
      reason_code: provider.availability_reason,
    }),
  }).then((result) => result.scenarioRuns[0]);
}

function executeWorkerRun({
  provider,
  scenario,
  eventsDir,
  timeoutMs,
  maxPayloadBytes,
  makeRunId,
  now,
}) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--worker"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let payloadBytes = 0;

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) {
        settled = true;
        resolveRun({
          run_id: makeRunId(scenario.scenario_id, provider.provider_id),
          provider_id: provider.provider_id,
          model_id: null,
          scenario_id: scenario.scenario_id,
          scenario_name: scenario.scenario_name,
          status: "incomplete",
          reason_code: "provider_timeout",
          realized_phase_path: [],
          transitions: [],
          artifact_paths: [],
          event_log_path: null,
        });
      }
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      payloadBytes += chunk.byteLength;
      if (payloadBytes > maxPayloadBytes) {
        child.kill("SIGKILL");
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          resolveRun({
            run_id: makeRunId(scenario.scenario_id, provider.provider_id),
            provider_id: provider.provider_id,
            model_id: null,
            scenario_id: scenario.scenario_id,
            scenario_name: scenario.scenario_name,
            status: "failed",
            reason_code: "payload_limit_exceeded",
            realized_phase_path: [],
            transitions: [],
            artifact_paths: [],
            event_log_path: null,
          });
        }
        return;
      }
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("exit", () => {
      clearTimeout(timer);
      if (settled) {
        return;
      }
      settled = true;

      try {
        const message = JSON.parse(stdout);
        resolveRun(message.run);
      } catch {
        resolveRun({
          run_id: makeRunId(scenario.scenario_id, provider.provider_id),
          provider_id: provider.provider_id,
          model_id: null,
          scenario_id: scenario.scenario_id,
          scenario_name: scenario.scenario_name,
          status: "incomplete",
          reason_code: "worker_execution_error",
          realized_phase_path: [],
          transitions: [],
          artifact_paths: [],
          event_log_path: null,
          stderr,
        });
      }
    });

    child.stdin.end(
      JSON.stringify({
        providerModulePath: provider.worker_module_path,
        providerId: provider.provider_id,
        scenario,
        eventsDir,
        maxPayloadBytes,
        runId: makeRunId(scenario.scenario_id, provider.provider_id),
        now: now(),
      }),
    );
  });
}

export async function runLiveProviderEval({
  scenarios,
  providers,
  reportsDir,
  timeoutMs = readTimeoutMsFromEnv(),
  maxPayloadBytes = 256 * 1024,
  makeRunId = defaultRunId,
  now = () => new Date().toISOString(),
}) {
  const scenarioRuns = [];

  for (const provider of providers) {
    for (const scenario of scenarios) {
      if (!provider.is_available) {
        scenarioRuns.push(
          await createUnavailableRun({ scenario, provider, eventsDir: reportsDir, makeRunId, now }),
        );
        continue;
      }

      if (!provider.worker_module_path) {
        fail("invalid_provider_wrapper", `${provider.provider_id}: worker_module_path is required for live execution`);
      }

      scenarioRuns.push(
        await executeWorkerRun({
          provider,
          scenario,
          eventsDir: reportsDir,
          timeoutMs,
          maxPayloadBytes,
          makeRunId,
          now,
        }),
      );
    }
  }

  const reports = writeReports({
    scenarios,
    scenarioRuns,
    reportsDir,
    invocation: { mode: "live" },
  });

  return { scenarioRuns, reports };
}

async function runWorker() {
  const payload = JSON.parse(readFileSync(0, "utf8"));
  const providerModule = await import(payload.providerModulePath);
  const provider = providerModule.providerWrapper ?? providerModule.default;

  const result = await runScenarioMatrix({
    scenarios: [payload.scenario],
    providerId: payload.providerId,
    eventsDir: payload.eventsDir,
    artifactRoot: payload.eventsDir,
    makeRunId: () => payload.runId,
    now: () => payload.now,
    executePhase: async (context) => {
      const rawResult = await provider.runPhase(context);
      const serialized = Buffer.byteLength(JSON.stringify(rawResult));
      if (serialized > payload.maxPayloadBytes) {
        const error = new Error("payload_limit_exceeded");
        error.code = "payload_limit_exceeded";
        error.runStatus = "failed";
        throw error;
      }
      return rawResult;
    },
  });

  process.stdout.write(JSON.stringify({ run: result.scenarioRuns[0] }));
}

async function main() {
  const scenarios = loadScenarioRegistry(scenariosDir);
  const providers = await loadProviderRegistry();
  rmSync(rawDir, { recursive: true, force: true });
  mkdirSync(artifactsDir, { recursive: true });

  const result = await runLiveProviderEval({
    scenarios,
    providers,
    reportsDir: artifactsDir,
  });

  console.log("Lifecycle Token Live Eval");
  console.log("=========================");
  for (const run of result.scenarioRuns) {
    console.log(`${run.provider_id}/${run.scenario_id}: ${run.status}${run.reason_code ? ` (${run.reason_code})` : ""}`);
  }
  console.log(`Rollup: ${resolve(result.reports.rollupReportPath)}`);
  if (result.reports.crossProviderReportPath) {
    console.log(`Cross-provider: ${resolve(result.reports.crossProviderReportPath)}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--worker")) {
    runWorker().catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
  } else {
    main().catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
  }
}
