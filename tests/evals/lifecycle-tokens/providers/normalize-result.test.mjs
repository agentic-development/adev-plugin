import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { normalizePhaseExecutionResult } from "./normalize-result.mjs";

const scenario = {
  scenario_id: "happy-path",
};

const phase = {
  id: "review-specs",
  name: "Review Specs",
  skill_name: "adev-review-specs",
};

describe("normalizePhaseExecutionResult", () => {
  it("normalizes provider-native aliases into canonical events and run metadata", () => {
    const artifactRoot = mkdtempSync(join(tmpdir(), "normalize-live-"));
    try {
      const normalized = normalizePhaseExecutionResult({
        providerId: "codex",
        scenario,
        phase,
        runId: "run-1",
        attempt: 1,
        timestamp: "2026-03-26T00:00:00.000Z",
        eventIndexStart: 4,
        artifactRoot,
        result: {
          status: "passed",
          trigger_type: "on_fanout_complete",
          model_id: "gpt-5.4",
          fixture_profile_id: "sample-project-small",
          fixture_complexity: "small",
          reason_code: "completed",
          artifact_paths: ["artifacts/review.json"],
          token_usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
          subagents: [
            {
              actorRole: "security",
              status: "passed",
              tokenUsage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 },
            },
          ],
        },
      });

      assert.equal(normalized.events.length, 2);
      assert.equal(normalized.events[0].actor_type, "phase");
      assert.equal(normalized.events[0].event_index, 4);
      assert.equal(normalized.events[0].provider_id, "codex");
      assert.equal(normalized.events[0].model_id, "gpt-5.4");
      assert.deepEqual(normalized.events[0].artifact_paths, ["artifacts/review.json"]);
      assert.equal(normalized.events[1].actor_type, "subagent");
      assert.equal(normalized.events[1].parent_phase_event_id, "review-specs-attempt-1");
      assert.equal(normalized.events[1].subagent_role, "security");
      assert.deepEqual(normalized.runMetadata, {
        provider_id: "codex",
        model_id: "gpt-5.4",
        fixture_profile_id: "sample-project-small",
        fixture_complexity: "small",
        artifact_paths: ["artifacts/review.json"],
        reason_code: "completed",
      });
    } finally {
      rmSync(artifactRoot, { recursive: true, force: true });
    }
  });

  it("rejects unsafe artifact paths", () => {
    const artifactRoot = mkdtempSync(join(tmpdir(), "normalize-live-"));
    try {
      assert.throws(
        () =>
          normalizePhaseExecutionResult({
            providerId: "claude-code",
            scenario,
            phase,
            runId: "run-2",
            attempt: 1,
            timestamp: "2026-03-26T00:00:00.000Z",
            eventIndexStart: 0,
            artifactRoot,
            result: {
              status: "passed",
              artifact_paths: ["../escape.txt"],
            },
          }),
        /unsafe_artifact_path/,
      );
    } finally {
      rmSync(artifactRoot, { recursive: true, force: true });
    }
  });

  it("rejects invalid phase mappings", () => {
    const artifactRoot = mkdtempSync(join(tmpdir(), "normalize-live-"));
    try {
      assert.throws(
        () =>
          normalizePhaseExecutionResult({
            providerId: "opencode",
            scenario,
            phase,
            runId: "run-3",
            attempt: 1,
            timestamp: "2026-03-26T00:00:00.000Z",
            eventIndexStart: 0,
            artifactRoot,
            result: {
              status: "passed",
              phase_id: "implement",
            },
          }),
        /invalid_phase_mapping/,
      );
    } finally {
      rmSync(artifactRoot, { recursive: true, force: true });
    }
  });
});
