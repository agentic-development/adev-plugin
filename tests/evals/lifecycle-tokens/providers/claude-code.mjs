import { ClaudeCodeAdapter } from "../../../../providers/claude-code/adapter.mjs";

const configuredRunner = process.env.ADEV_LIFECYCLE_PROVIDER_CLAUDE_CODE_RUNNER;

async function invokeConfiguredRunner(context) {
  const module = await import(configuredRunner);
  if (typeof module.runPhase !== "function") {
    throw new Error("invalid_runner_module: expected runPhase export");
  }
  return module.runPhase(context);
}

export const providerWrapper = {
  provider_id: "claude-code",
  supports_tokens: true,
  supports_model_id: true,
  supports_subagents: true,
  is_available: Boolean(configuredRunner && ClaudeCodeAdapter.detect()),
  availability_reason: configuredRunner
    ? (ClaudeCodeAdapter.detect() ? null : "provider_not_installed")
    : "provider_runner_not_configured",
  worker_module_path: import.meta.url,
  async runPhase(context) {
    if (!configuredRunner || !ClaudeCodeAdapter.detect()) {
      return {
        status: "incomplete",
        reason_code: configuredRunner ? "provider_not_installed" : "provider_runner_not_configured",
      };
    }
    return invokeConfiguredRunner(context);
  },
};

export default providerWrapper;
