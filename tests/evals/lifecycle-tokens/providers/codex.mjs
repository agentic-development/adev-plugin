import { CodexAdapter } from "../../../../providers/codex/adapter.mjs";

const adapter = new CodexAdapter();
const configuredRunner = process.env.ADEV_LIFECYCLE_PROVIDER_CODEX_RUNNER;

async function invokeConfiguredRunner(context) {
  const module = await import(configuredRunner);
  if (typeof module.runPhase !== "function") {
    throw new Error("invalid_runner_module: expected runPhase export");
  }
  return module.runPhase(context);
}

export const providerWrapper = {
  provider_id: "codex",
  supports_tokens: true,
  supports_model_id: true,
  supports_subagents: true,
  is_available: Boolean(configuredRunner && adapter.detect()),
  availability_reason: configuredRunner
    ? (adapter.detect() ? null : "provider_not_installed")
    : "provider_runner_not_configured",
  worker_module_path: import.meta.url,
  async runPhase(context) {
    if (!configuredRunner || !adapter.detect()) {
      return {
        status: "incomplete",
        reason_code: configuredRunner ? "provider_not_installed" : "provider_runner_not_configured",
      };
    }
    return invokeConfiguredRunner(context);
  },
};

export default providerWrapper;
