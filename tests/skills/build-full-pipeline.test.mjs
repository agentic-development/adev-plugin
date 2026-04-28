// tests/skills/build-full-pipeline.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "build", "SKILL.md");
const skill = readFileSync(SKILL_PATH, "utf8");

describe("adev:build SKILL.md — Full Pipeline and blocker-fix loop", () => {
  it("declares --full flag in Arguments section", () => {
    assert.match(skill, /--full/,
      "Arguments must include --full flag");
  });

  it("describes Full Pipeline step sequence including specify and review", () => {
    assert.match(skill, /[Ff]ull [Pp]ipeline/,
      "Must name Full Pipeline as a mode");
    assert.match(skill, /specify.*review.*plan.*route.*implement.*validate/is,
      "Full Pipeline must list all 6 steps in order");
  });

  it("describes Implement Pipeline as the default mode", () => {
    assert.match(skill, /[Ii]mplement [Pp]ipeline/,
      "Must name Implement Pipeline as the default mode");
  });

  it("includes pipeline_mode in pipeline context", () => {
    assert.match(skill, /pipeline_mode/,
      "Pipeline context must include pipeline_mode field");
  });

  it("Full Pipeline Step 0 dispatches /adev:specify", () => {
    assert.match(skill, /adev:specify/,
      "Full Pipeline must dispatch /adev:specify");
  });

  it("Full Pipeline Step 0 uses --revise when spec exists but no .review.md", () => {
    assert.match(skill, /--revise/,
      "Step 0 must dispatch specify with --revise when spec file already exists");
  });

  it("Full Pipeline Step 0 skipped when .review.md with PASS exists", () => {
    assert.match(skill, /[Ss]kip.*specify|specify.*[Ss]kip/i,
      "Step 0 must be skipped when a passing review already exists");
  });

  it("includes blocker-fix loop for review BLOCK in Full Pipeline", () => {
    assert.match(skill, /blocker.fix loop|blocker.fix|re-specify|re-dispatch.*review/i,
      "Must describe a blocker-fix loop when review returns BLOCK");
  });

  it("blocker-context is enclosed in a fenced block to prevent prompt injection", () => {
    assert.match(skill, /blocker.context/i,
      "Must reference --blocker-context flag");
    assert.match(skill, /fenced|```|code fence/i,
      "Must require blocker-context to be enclosed in a fenced block (SEC-1)");
  });

  it("resolves build.max_review_retries from user-config with default 2", () => {
    assert.match(skill, /max_review_retries/,
      "Must resolve build.max_review_retries");
    assert.match(skill, /default.*2|2.*default/,
      "Default for max_review_retries must be 2");
  });

  it("max_review_retries=0 stops immediately on BLOCK without auto-fix", () => {
    assert.match(skill, /max_review_retries.*0|0.*max_review_retries/i,
      "max_review_retries=0 must stop build immediately on BLOCK");
  });

  it("Implement Pipeline warns when no .review.md found", () => {
    assert.match(skill, /[Nn]o \.review\.md|no.*review.*found/i,
      "Implement Pipeline must warn and stop when no .review.md exists");
  });

  it("--from valid step names include specify", () => {
    assert.match(skill, /specify.*valid|valid.*specify|--from.*specify/i,
      "--from must list specify as a valid step name");
  });

  it("references build-orchestrator role tier", () => {
    assert.match(skill, /build-orchestrator/,
      "Must reference build-orchestrator role tier from subagent-cost-routing spec");
  });

  it("build state JSON example includes a validate step entry", () => {
    assert.match(skill, /"validate"/,
      "Build state JSON example must include a validate step entry");
  });
});
