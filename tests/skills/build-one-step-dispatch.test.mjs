// tests/skills/build-one-step-dispatch.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "build", "SKILL.md");
const skill = readFileSync(SKILL_PATH, "utf8");

const RESUME_PATH = join(PLUGIN_ROOT, "skills", "build", "references", "resume-mode.md");
const resumeMode = readFileSync(RESUME_PATH, "utf8");

describe("adev:build SKILL.md — One-Step-Per-Invocation Dispatch", () => {
  it("declares one-step-per-invocation as a named section or principle (+1 more contract assertions)", () => {
    // declares one-step-per-invocation as a named section or principle
    assert.match(skill, /[Oo]ne.?[Ss]tep.?[Pp]er.?[Ii]nvocation|one step per turn|exactly one.*step.*per turn/i,
    "Must name One-Step-Per-Invocation as a structural concept");

    // states orchestrator executes exactly ONE step per turn
    assert.match(skill, /exactly one|exactly ONE|one step per turn/i,
    "Must state that only one step is dispatched per turn");
  });

  it("describes self-re-invocation via Skill tool after step completion", () => {
    assert.match(skill, /re-invok|re.invoke.*Skill tool|Skill tool.*resume/i,
      "Must describe re-invocation via Skill tool for continuation");
  });

  it("re-invocation uses --resume to continue from persisted state (+9 more contract assertions)", () => {
    // re-invocation uses --resume to continue from persisted state
    assert.match(skill, /re-invok.*--resume|--resume.*re-invok|invoke.*build.*--resume/i,
    "Re-invocation must use --resume flag to read state from disk");

    // each re-invocation starts with fresh context (no memory of prior turns)
    assert.match(skill, /fresh context|clean context|no memory.*prior|context.*fork/i,
    "Must state that re-invocation has a fresh/clean context");

    // pipeline position determined solely from build state file on disk
    assert.match(skill, /build.state.*source of truth|state file.*determines|read.*build.state.*before/i,
    "Pipeline position must come from build state file, not conversation context");

    // orchestrator MUST read build state before taking any action
    assert.match(skill, /read.*build.state.*before|MUST.*determine.*step.*reading|state file.*first/i,
    "Must read state file before any dispatch action");

    // final step (or stop condition) exits without re-invocation
    assert.match(skill, /does NOT re-invok|without re-invok|exit.*without.*re-invok|stop.*re-invok/i,
    "Final step must exit without re-invoking");

    // prints one-line progress report between steps
    assert.match(skill, /progress report|Step.*completed.*Next|one-line.*progress/i,
    "Must print a progress report between steps");

    // --verbose causes reasoning output but does not change one-step-per-turn
    assert.match(skill, /--verbose.*reasoning|verbose.*does not change|verbose.*one.*step/i,
    "--verbose must add reasoning output without changing dispatch model");

    // orchestrator prompt contains only dispatch-loop instructions
    assert.match(skill, /dispatch.loop|read state.*determine.*dispatch.*record|narrow task.*dispatch/i,
    "Orchestrator prompt must be limited to dispatch-loop instructions");

    // subagent prompts include pipeline context fields (spec_path, title, milestone, mode, position)
    assert.match(skill, /spec_path.*spec_title.*milestone.*pipeline_mode|PIPELINE_CONTEXT/i,
    "Subagent prompts must include pipeline context");

    // step context assembled from disk artifacts, never from prior subagent memory
    assert.match(skill, /from disk|artifact.*on disk|never.*from.*memory|not from.*prior.*subagent/i,
    "Step context must be assembled from disk artifacts");
  });

  it("subagents return structured STEP_RESULT with status, verdict, artifacts, summary, error", () => {
    assert.match(skill, /STEP_RESULT.*status.*verdict|status.*COMPLETED.*FAILED.*BLOCKED/i,
      "Subagents must return STEP_RESULT structure");
  });

  it("resumed builds assemble step context from disk, not from session memory", () => {
    assert.match(skill, /resumed.*disk|resume.*artifact|read from disk.*ensure/i,
      "Resumed builds must read context from disk");
  });
});

describe("resume-mode.md — valid step names consistency", () => {
  it("all occurrences of valid step names include specify", () => {
    const stepListMatches = resumeMode.match(/[Vv]alid step names:.*$/gm);
    for (const match of stepListMatches || []) {
      assert.match(match, /specify/,
        `All valid step name lists must include specify: "${match}"`);
    }
  });
});
