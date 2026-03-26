import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createProviderRegistry } from "./registry.mjs";

describe("createProviderRegistry", () => {
  it("loads providers in deterministic order and preserves explicit unavailability", async () => {
    const providers = await createProviderRegistry({
      loaders: {
        "claude-code": async () => ({
          providerWrapper: {
            provider_id: "claude-code",
            supports_tokens: true,
            supports_model_id: true,
            supports_subagents: true,
            is_available: false,
            availability_reason: "provider_not_installed",
            async runPhase() {
              return { status: "incomplete" };
            },
          },
        }),
        codex: async () => ({
          providerWrapper: {
            provider_id: "codex",
            supports_tokens: true,
            supports_model_id: true,
            supports_subagents: true,
            is_available: true,
            availability_reason: null,
            async runPhase() {
              return { status: "passed" };
            },
          },
        }),
        opencode: async () => ({
          providerWrapper: {
            provider_id: "opencode",
            supports_tokens: true,
            supports_model_id: true,
            supports_subagents: false,
            is_available: true,
            availability_reason: null,
            async runPhase() {
              return { status: "passed" };
            },
          },
        }),
      },
    });

    assert.deepEqual(
      providers.map((provider) => provider.provider_id),
      ["claude-code", "codex", "opencode"],
    );
    assert.equal(providers[0].is_available, false);
    assert.equal(providers[0].availability_reason, "provider_not_installed");
  });

  it("fails on invalid wrapper contracts", async () => {
    await assert.rejects(
      () =>
        createProviderRegistry({
          loaders: {
            "claude-code": async () => ({
              providerWrapper: {
                provider_id: "claude-code",
                supports_tokens: true,
                supports_model_id: true,
                supports_subagents: true,
                is_available: true,
                availability_reason: null,
              },
            }),
            codex: async () => ({
              providerWrapper: {
                provider_id: "codex",
                supports_tokens: true,
                supports_model_id: true,
                supports_subagents: true,
                is_available: true,
                availability_reason: null,
                async runPhase() {
                  return { status: "passed" };
                },
              },
            }),
            opencode: async () => ({
              providerWrapper: {
                provider_id: "opencode",
                supports_tokens: true,
                supports_model_id: true,
                supports_subagents: true,
                is_available: true,
                availability_reason: null,
                async runPhase() {
                  return { status: "passed" };
                },
              },
            }),
          },
        }),
      /runPhase must be a function/,
    );
  });

  it("fails when a provider loader throws unexpectedly", async () => {
    await assert.rejects(
      () =>
        createProviderRegistry({
          loaders: {
            "claude-code": async () => {
              throw new Error("boom");
            },
            codex: async () => ({
              providerWrapper: {
                provider_id: "codex",
                supports_tokens: true,
                supports_model_id: true,
                supports_subagents: true,
                is_available: true,
                availability_reason: null,
                async runPhase() {
                  return { status: "passed" };
                },
              },
            }),
            opencode: async () => ({
              providerWrapper: {
                provider_id: "opencode",
                supports_tokens: true,
                supports_model_id: true,
                supports_subagents: true,
                is_available: true,
                availability_reason: null,
                async runPhase() {
                  return { status: "passed" };
                },
              },
            }),
          },
        }),
      /provider_load_error/,
    );
  });
});
