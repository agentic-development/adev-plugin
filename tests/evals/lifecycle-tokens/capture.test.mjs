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
      scenarioId: "happy-path",
      phaseId: "specify",
      phaseName: "Specify",
      skillName: "adev-specify",
      attempt: 1,
      actorType: "main",
      actorId: "phase-specify-attempt-1",
      status: "passed",
      timestamp: "2026-03-25T12:00:00.000Z",
      tokenUsage: {
        input_tokens: 120,
        output_tokens: 80,
        total_tokens: 200,
      },
    });

    assert.deepEqual(event, {
      run_id: "run-1",
      scenario_id: "happy-path",
      phase_id: "specify",
      phase_name: "Specify",
      skill_name: "adev-specify",
      attempt: 1,
      actor_type: "main",
      actor_id: "phase-specify-attempt-1",
      actor_role: null,
      parent_phase_id: null,
      status: "passed",
      timestamp: "2026-03-25T12:00:00.000Z",
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
      phaseId: "review",
      phaseName: "Review",
      skillName: "adev-review-specs",
      attempt: 2,
      actorType: "subagent",
      actorId: "reviewer-security",
      actorRole: "security",
      parentPhaseId: "review",
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
    assert.equal(event.parent_phase_id, "review");
    assert.equal(event.actor_role, "security");
  });

  it("rejects inconsistent token totals", () => {
    assert.throws(
      () =>
        normalizeTokenEvent({
          runId: "run-3",
          scenarioId: "happy-path",
          phaseId: "validate",
          phaseName: "Validate",
          skillName: "adev-validate",
          attempt: 1,
          actorType: "main",
          actorId: "phase-validate-attempt-1",
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

  it("requires parent phase ids for subagent events", () => {
    assert.throws(
      () =>
        normalizeTokenEvent({
          runId: "run-4",
          scenarioId: "review-fails-once",
          phaseId: "review",
          phaseName: "Review",
          skillName: "adev-review-specs",
          attempt: 1,
          actorType: "subagent",
          actorId: "reviewer-1",
          status: "failed",
          timestamp: "2026-03-25T12:15:00.000Z",
          tokenUsage: {
            input_tokens: 10,
            output_tokens: 10,
            total_tokens: 20,
          },
        }),
      /missing_parent_phase_id/,
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
      phaseId: "brainstorm",
      phaseName: "Brainstorm",
      skillName: "adev-brainstorm",
      attempt: 1,
      actorType: "main",
      actorId: "phase-brainstorm-attempt-1",
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
