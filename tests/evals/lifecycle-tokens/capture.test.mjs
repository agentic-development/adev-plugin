import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { normalizeTokenEvent, writeRawEventLog } from "./capture.mjs";

describe("normalizeTokenEvent", () => {
  it("normalizes a main-phase event with known token usage", () => {
    const event = normalizeTokenEvent({
      runId: "run-1",
      providerId: "codex",
      modelId: "gpt-5.4",
      scenarioId: "happy-path",
      eventId: "specify-attempt-1",
      eventIndex: 0,
      phaseId: "specify",
      phaseName: "Specify",
      skillName: "adev-specify",
      attempt: 1,
      actorType: "phase",
      status: "passed",
      triggerType: "on_success",
      reasonCode: null,
      artifactPaths: ["artifacts/specify.json"],
      timestamp: "2026-03-25T12:00:00.000Z",
      tokenUsage: {
        input_tokens: 120,
        output_tokens: 80,
        total_tokens: 200,
      },
    });

    assert.deepEqual(event, {
      run_id: "run-1",
      provider_id: "codex",
      model_id: "gpt-5.4",
      scenario_id: "happy-path",
      event_id: "specify-attempt-1",
      event_index: 0,
      actor_type: "phase",
      phase_id: "specify",
      phase_name: "Specify",
      skill_name: "adev-specify",
      attempt: 1,
      status: "passed",
      trigger_type: "on_success",
      reason_code: null,
      artifact_paths: ["artifacts/specify.json"],
      timestamp: "2026-03-25T12:00:00.000Z",
      subagent_role: null,
      parent_phase_event_id: null,
      input_tokens: 120,
      input_tokens_availability: "known",
      output_tokens: 80,
      output_tokens_availability: "known",
      total_tokens: 200,
      total_tokens_availability: "known",
    });
  });

  it("normalizes partial subagent payloads with explicit unknown markers", () => {
    const event = normalizeTokenEvent({
      runId: "run-2",
      scenarioId: "subagent-heavy-review",
      eventId: "review-attempt-2-subagent-1",
      eventIndex: 3,
      phaseId: "review",
      phaseName: "Review",
      skillName: "adev-review-specs",
      attempt: 2,
      actorType: "subagent",
      parentPhaseEventId: "review-attempt-2",
      subagentRole: "security",
      status: "passed",
      timestamp: "2026-03-25T12:05:00.000Z",
      tokenUsage: {
        input_tokens: 90,
      },
    });

    assert.equal(event.input_tokens, 90);
    assert.equal(event.input_tokens_availability, "known");
    assert.equal(event.output_tokens, null);
    assert.equal(event.output_tokens_availability, "unknown");
    assert.equal(event.total_tokens, null);
    assert.equal(event.total_tokens_availability, "unknown");
    assert.equal(event.parent_phase_event_id, "review-attempt-2");
    assert.equal(event.subagent_role, "security");
  });

  it("rejects inconsistent token totals", () => {
    assert.throws(
      () =>
        normalizeTokenEvent({
          runId: "run-3",
          scenarioId: "happy-path",
          eventId: "validate-attempt-1",
          eventIndex: 5,
          phaseId: "validate",
          phaseName: "Validate",
          skillName: "adev-validate",
          attempt: 1,
          actorType: "phase",
          status: "passed",
          timestamp: "2026-03-25T12:10:00.000Z",
          tokenUsage: {
            input_tokens: 10,
            output_tokens: 5,
            total_tokens: 20,
          },
        }),
      /invalid_token_payload/,
    );
  });

  it("requires parent phase event ids for subagent events", () => {
    assert.throws(
      () =>
        normalizeTokenEvent({
          runId: "run-4",
          scenarioId: "review-fails-once",
          eventId: "review-attempt-1-subagent-1",
          eventIndex: 2,
          phaseId: "review",
          phaseName: "Review",
          skillName: "adev-review-specs",
          attempt: 1,
          actorType: "subagent",
          status: "failed",
          timestamp: "2026-03-25T12:15:00.000Z",
          tokenUsage: {
            input_tokens: 10,
            output_tokens: 10,
            total_tokens: 20,
          },
        }),
      /parentPhaseEventId is required/,
    );
  });
});

describe("writeRawEventLog", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "lifecycle-capture-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes one jsonl file per scenario run", () => {
    const event = normalizeTokenEvent({
      runId: "run-5",
      scenarioId: "happy-path",
      eventId: "brainstorm-attempt-1",
      eventIndex: 0,
      phaseId: "brainstorm",
      phaseName: "Brainstorm",
      skillName: "adev-brainstorm",
      attempt: 1,
      actorType: "phase",
      status: "passed",
      timestamp: "2026-03-25T12:20:00.000Z",
      tokenUsage: {
        input_tokens: 50,
        output_tokens: 25,
        total_tokens: 75,
      },
    });

    const outputPath = writeRawEventLog({
      outputDir: tempDir,
      scenarioId: "happy-path",
      runId: "run-5",
      events: [event],
    });

    const lines = readFileSync(outputPath, "utf8").trim().split("\n");
    assert.equal(lines.length, 1);
    assert.deepEqual(JSON.parse(lines[0]), event);
    assert.match(outputPath, /happy-path--run-5\.jsonl$/);
  });
});
