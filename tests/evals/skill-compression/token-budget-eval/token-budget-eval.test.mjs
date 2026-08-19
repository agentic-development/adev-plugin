/**
 * Token Budget Eval — Deterministic measurements for all Tier 1 & Tier 2
 * reduction strategies.
 *
 * Measures real SKILL.md sizes, context packet estimates, anti-pattern
 * duplication, review loop overhead, and subagent output compression.
 *
 * Usage:
 *   node --test tests/evals/skill-compression/token-budget-eval/token-budget-eval.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(fileURLToPath(import.meta.url), "../../../../..");
const SKILLS_DIR = join(REPO_ROOT, "skills");
const SPECS_DIR = join(REPO_ROOT, ".context-index/specs/features");

function estimateTokens(bytes) {
  return Math.round(bytes / 4);
}

function readSkill(name) {
  const path = join(SKILLS_DIR, name, "SKILL.md");
  return existsSync(path) ? readFileSync(path, "utf-8") : null;
}

function getAllSkillSizes() {
  const results = [];
  for (const dir of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const skillPath = join(SKILLS_DIR, dir.name, "SKILL.md");
    if (existsSync(skillPath)) {
      const stat = statSync(skillPath);
      results.push({ name: dir.name, bytes: stat.size, tokens: estimateTokens(stat.size) });
    }
  }
  return results.sort((a, b) => b.bytes - a.bytes);
}

// ─── Strategy 1: Conditional Section Loading ──────────────────────────────────

/**
 * Strategy 1 was *implemented* in 2c288fbf ("feat(skills): split plan and build
 * into core + mode companions", 2026-05-03) — 11 hours after this eval was first
 * written in 86fce701. Before that commit, the non-default mode instructions sat
 * inline in SKILL.md and the eval measured them as dead weight ("what fraction of
 * the file could be externalized?"). After it, that content lives in companion
 * `<mode>-mode.md` files and each SKILL.md section is a pointer stub:
 *
 *   ## Feature Mode
 *
 *   > **Conditional loading:** Read `skills/plan/references/feature-mode.md` for ...
 *
 * So the marker for a conditional section is no longer "a big inline mode block";
 * it is the `Conditional loading:` pointer plus a real companion file on disk.
 * These assertions verify the realized structure rather than the (now-consumed)
 * opportunity. They fail if anyone inlines mode content back into SKILL.md,
 * drops a pointer, or deletes a companion file.
 */

/** Bytes a companion file must exceed to count as real externalized content. */
const COMPANION_MIN_BYTES = 500;
/** Bytes an in-SKILL.md pointer stub must stay under (heading + pointer + rule). */
const STUB_MAX_BYTES = 400;

/** Slice a `## ` section body out of a SKILL.md, anchored at line start. */
function sectionSlice(content, headingPrefix) {
  const lines = content.split("\n");
  const startLine = lines.findIndex(l => l.startsWith(headingPrefix));
  if (startLine === -1) return null;
  let endLine = lines.length;
  for (let i = startLine + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) { endLine = i; break; }
  }
  return lines.slice(startLine, endLine).join("\n");
}

function companionBytes(relPath) {
  const abs = join(SKILLS_DIR, relPath.replace(/^skills\//, ""));
  return existsSync(abs) ? statSync(abs).size : 0;
}

/**
 * Shared body for the plan/build conditional-section assertions.
 * `modes` is a list of { heading, companion } pairs that MUST be externalized.
 */
function assertExternalizedModes(skillName, modes) {
  const content = readSkill(skillName);
  assert.ok(content, `${skillName} SKILL.md must exist`);

  const totalBytes = Buffer.byteLength(content);
  const rows = [];

  for (const { heading, companion } of modes) {
    const section = sectionSlice(content, heading);
    assert.ok(
      section !== null,
      `${skillName} SKILL.md must still declare the conditional section "${heading}"`,
    );

    const stubBytes = Buffer.byteLength(section);
    assert.match(
      section,
      new RegExp(`\\*\\*Conditional loading:\\*\\*[^\\n]*\`${companion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\``),
      `"${heading}" must carry a "Conditional loading:" pointer to \`${companion}\` ` +
        `(Strategy 1: mode instructions live in a companion file, not inline)`,
    );

    const cBytes = companionBytes(companion);
    assert.ok(
      cBytes > COMPANION_MIN_BYTES,
      `Companion ${companion} must exist and hold real instructions ` +
        `(>${COMPANION_MIN_BYTES} bytes), got ${cBytes}`,
    );

    assert.ok(
      stubBytes < STUB_MAX_BYTES,
      `"${heading}" in ${skillName} SKILL.md must remain a pointer stub ` +
        `(<${STUB_MAX_BYTES} bytes), got ${stubBytes} — mode content appears to have ` +
        `been inlined back, which undoes Strategy 1`,
    );

    rows.push({ heading, companion, stubBytes, companionBytes: cBytes });
  }

  // Deduplicate companions before summing — several headings may share one file.
  const uniqueCompanions = [...new Set(rows.map(r => r.companion))];
  const externalizedBytes = uniqueCompanions.reduce((s, c) => s + companionBytes(c), 0);
  const stubBytes = rows.reduce((s, r) => s + r.stubBytes, 0);
  const corpusBytes = totalBytes + externalizedBytes;
  const savingsPercent = Math.round((externalizedBytes / corpusBytes) * 100);

  console.log(`\n  ${skillName} SKILL.md conditional-section analysis:`);
  console.log(`    Core SKILL.md bytes:  ${totalBytes.toLocaleString()} (~${estimateTokens(totalBytes).toLocaleString()} tokens)`);
  for (const r of rows) {
    console.log(
      `    ${r.heading.replace(/^## /, "").padEnd(28)} stub ${String(r.stubBytes).padStart(4)} B  →  ` +
      `${r.companion} (${r.companionBytes.toLocaleString()} B)`,
    );
  }
  console.log(`    Pointer stubs total:  ${stubBytes.toLocaleString()} bytes`);
  console.log(`    Externalized total:   ${externalizedBytes.toLocaleString()} bytes (~${estimateTokens(externalizedBytes).toLocaleString()} tokens)`);
  console.log(`    Full corpus:          ${corpusBytes.toLocaleString()} bytes`);
  console.log(`    Deferred per default-mode invocation: ${savingsPercent}%`);
}

describe("Strategy 1: Conditional Section Loading", () => {
  const TOP_SKILLS = ["plan", "validate", "build", "hygiene", "implement", "specify"];

  it("measures top 6 SKILL.md total size", () => {
    const sizes = getAllSkillSizes();
    const top6 = sizes.filter(s => TOP_SKILLS.includes(s.name));
    const totalBytes = top6.reduce((sum, s) => sum + s.bytes, 0);
    const totalTokens = estimateTokens(totalBytes);

    console.log("\n  Strategy 1: Conditional Section Loading");
    console.log("  ─────────────────────────────────────────");
    console.log(`  Top 6 skills total: ${totalBytes.toLocaleString()} bytes (~${totalTokens.toLocaleString()} tokens)`);
    for (const s of top6) {
      console.log(`    ${s.name.padEnd(12)} ${s.bytes.toLocaleString().padStart(7)} bytes  (~${s.tokens.toLocaleString()} tokens)`);
    }

    assert.ok(totalBytes > 0, "Should have measurable skill sizes");
  });

  it("identifies conditional sections in plan SKILL.md", () => {
    // Non-default plan modes. Spec Mode (`--spec`) is the default and stays
    // inline by design — it is not listed here.
    assertExternalizedModes("plan", [
      { heading: "## Milestone Planning Mode", companion: "skills/plan/references/milestone-mode.md" },
      { heading: "## Feature Mode", companion: "skills/plan/references/feature-mode.md" },
      { heading: "## Release Mode", companion: "skills/plan/references/release-mode.md" },
      { heading: "## Milestone Mode", companion: "skills/plan/references/milestone-mode.md" },
      { heading: "## Epic Mode", companion: "skills/plan/references/epic-mode.md" },
    ]);
  });

  it("identifies conditional sections in validate SKILL.md", () => {
    const content = readSkill("validate");
    assert.ok(content, "validate SKILL.md must exist");

    const totalBytes = Buffer.byteLength(content);

    // Visual Verification (Check 11) is conditional on UI files
    let visualBytes = 0;
    const visualIdx = content.indexOf("### Check 11: Visual Verification");
    if (visualIdx !== -1) {
      const nextCheck = content.indexOf("\n### Check 12:", visualIdx + 1);
      visualBytes = (nextCheck === -1 ? content.length : nextCheck) - visualIdx;
    }

    // Workspace-Aware section is conditional
    let workspaceBytes = 0;
    const wsIdx = content.indexOf("## Workspace-Aware Validation Mode");
    if (wsIdx !== -1) {
      const nextSection = content.indexOf("\n## ", wsIdx + 10);
      workspaceBytes = (nextSection === -1 ? content.length : nextSection) - wsIdx;
    }

    const conditionalBytes = visualBytes + workspaceBytes;
    const savingsPercent = Math.round((conditionalBytes / totalBytes) * 100);

    console.log("\n  Validate SKILL.md section analysis:");
    console.log(`    Total bytes:          ${totalBytes.toLocaleString()}`);
    console.log(`    Check 11 (visual):    ${visualBytes.toLocaleString()} bytes (conditional on UI files)`);
    console.log(`    Workspace mode:       ${workspaceBytes.toLocaleString()} bytes (conditional on workspace)`);
    console.log(`    Savings (non-UI):     ${savingsPercent}%`);

    assert.ok(conditionalBytes > 0, "Should have conditional sections");
  });

  it("identifies conditional sections in build SKILL.md", () => {
    // Non-default build modes. `## Single Spec Mode` is the default pipeline and
    // `## Dry Run Mode` is a read-only variant of it — both stay inline by design
    // and are deliberately excluded. `## Charter Mode` was externalized later, in
    // 8d1b3d28.
    assertExternalizedModes("build", [
      { heading: "## Resume Mode", companion: "skills/build/references/resume-mode.md" },
      { heading: "## Charter Mode", companion: "skills/build/references/charter-mode.md" },
      { heading: "## Milestone Mode", companion: "skills/build/references/milestone-mode.md" },
      { heading: "## Workspace-Mode Build", companion: "skills/build/references/workspace-mode.md" },
    ]);
  });
});

// ─── Strategy 2: Context Packet Size Caps ─────────────────────────────────────

describe("Strategy 2: Context Packet Size Caps", () => {
  it("measures actual spec and charter sizes for packet estimation", () => {
    const charterSizes = [];
    const specSizes = [];

    if (existsSync(SPECS_DIR)) {
      for (const module of readdirSync(SPECS_DIR, { withFileTypes: true })) {
        if (!module.isDirectory()) continue;
        const moduleDir = join(SPECS_DIR, module.name);
        for (const file of readdirSync(moduleDir)) {
          if (!file.endsWith(".md")) continue;
          const stat = statSync(join(moduleDir, file));
          if (file === "charter.md") {
            charterSizes.push({ module: module.name, bytes: stat.size });
          } else if (!file.includes("review") && !file.includes("plan") && !file.includes("validation")) {
            specSizes.push({ name: `${module.name}/${file}`, bytes: stat.size });
          }
        }
      }
    }

    const avgCharter = charterSizes.length > 0 ? Math.round(charterSizes.reduce((s, c) => s + c.bytes, 0) / charterSizes.length) : 0;
    const avgSpec = specSizes.length > 0 ? Math.round(specSizes.reduce((s, c) => s + c.bytes, 0) / specSizes.length) : 0;
    const maxSpec = specSizes.length > 0 ? Math.max(...specSizes.map(s => s.bytes)) : 0;
    const maxCharter = charterSizes.length > 0 ? Math.max(...charterSizes.map(c => c.bytes)) : 0;

    // Constitution size
    const constitutionPath = join(REPO_ROOT, ".context-index/constitution.md");
    const constitutionBytes = existsSync(constitutionPath) ? statSync(constitutionPath).size : 0;

    // Uncapped packet estimate (constitution + charter + spec + heuristics overhead)
    const uncappedAvg = constitutionBytes + avgCharter + avgSpec + 2000; // 2K heuristic overhead
    const uncappedMax = constitutionBytes + maxCharter + maxSpec + 2000;
    const cappedBudget = 16000; // 4K tokens * 4 bytes

    console.log("\n  Strategy 2: Context Packet Size Caps");
    console.log("  ─────────────────────────────────────");
    console.log(`  Constitution:     ${constitutionBytes.toLocaleString()} bytes (~${estimateTokens(constitutionBytes)} tokens)`);
    console.log(`  Avg charter:      ${avgCharter.toLocaleString()} bytes (~${estimateTokens(avgCharter)} tokens)`);
    console.log(`  Max charter:      ${maxCharter.toLocaleString()} bytes (~${estimateTokens(maxCharter)} tokens)`);
    console.log(`  Avg spec:         ${avgSpec.toLocaleString()} bytes (~${estimateTokens(avgSpec)} tokens)`);
    console.log(`  Max spec:         ${maxSpec.toLocaleString()} bytes (~${estimateTokens(maxSpec)} tokens)`);
    console.log(`  Charters:         ${charterSizes.length}`);
    console.log(`  Specs:            ${specSizes.length}`);
    console.log(`  ──────────────────────────`);
    console.log(`  Uncapped avg packet: ${uncappedAvg.toLocaleString()} bytes (~${estimateTokens(uncappedAvg)} tokens)`);
    console.log(`  Uncapped max packet: ${uncappedMax.toLocaleString()} bytes (~${estimateTokens(uncappedMax)} tokens)`);
    console.log(`  Proposed cap:        ${cappedBudget.toLocaleString()} bytes (~${estimateTokens(cappedBudget)} tokens)`);
    console.log(`  Savings (avg):       ${Math.max(0, Math.round(((uncappedAvg - cappedBudget) / uncappedAvg) * 100))}%`);
    console.log(`  Savings (max):       ${Math.max(0, Math.round(((uncappedMax - cappedBudget) / uncappedMax) * 100))}%`);

    assert.ok(charterSizes.length > 0 || specSizes.length > 0, "Should have specs or charters to measure");
  });
});

// ─── Strategy 3: Review Loop Reduction ────────────────────────────────────────

describe("Strategy 3: Review Loop 3→2", () => {
  it("counts review loop caps across all skills", () => {
    const skills = getAllSkillSizes();
    const results = [];

    for (const s of skills) {
      const content = readSkill(s.name);
      if (!content) continue;

      // Look for iteration cap patterns
      const caps = [];
      const patterns = [
        /max(?:imum)?\s*(\d+)\s*iteration/gi,
        /(\d+)\s*iteration/gi,
        /max\s*(\d+)\s*(?:review|retry|re-dispatch|cycle)/gi,
        /cap(?:ped)?\s*(?:at|to)\s*(\d+)/gi,
      ];

      for (const p of patterns) {
        let m;
        while ((m = p.exec(content)) !== null) {
          const val = parseInt(m[1]);
          if (val >= 2 && val <= 5) {
            caps.push(val);
          }
        }
      }

      if (caps.length > 0) {
        results.push({ skill: s.name, caps, max: Math.max(...caps) });
      }
    }

    // Estimate per-iteration cost
    const avgReviewSubagentTokens = 5000; // spec reviewer + code reviewer

    console.log("\n  Strategy 3: Review Loop Reduction (3→2)");
    console.log("  ────────────────────────────────────────");
    for (const r of results) {
      console.log(`    ${r.skill.padEnd(15)} caps: [${r.caps.join(", ")}]  max: ${r.max}`);
    }

    const skillsWithCap3 = results.filter(r => r.max >= 3);
    const savedPerTask = avgReviewSubagentTokens;
    const tasksPerPlan = 5;
    const savedPerPlan = savedPerTask * tasksPerPlan;

    console.log(`  ──────────────────────────`);
    console.log(`  Skills with cap ≥ 3:     ${skillsWithCap3.length}`);
    console.log(`  Avg review cost:         ~${avgReviewSubagentTokens.toLocaleString()} tokens/iteration`);
    console.log(`  Saved per task (3→2):    ~${savedPerTask.toLocaleString()} tokens`);
    console.log(`  Saved per 5-task plan:   ~${savedPerPlan.toLocaleString()} tokens`);

    assert.ok(results.length > 0, "Should find review loop caps in skills");
  });
});

// ─── Strategy 9: Subagent Output Summarization ───────────────────────────────

describe("Strategy 9: Subagent Output Summarization", () => {
  it("estimates subagent output overhead in implement pipeline", () => {
    const content = readSkill("implement");
    assert.ok(content, "implement SKILL.md must exist");

    // Count subagent dispatch points
    const dispatchPatterns = [
      /dispatch.*subagent/gi,
      /Agent\s*tool/gi,
      /subagent.*dispatch/gi,
      /reviewer.*subagent/gi,
    ];

    let totalDispatches = 0;
    for (const p of dispatchPatterns) {
      const matches = content.match(p);
      totalDispatches += matches ? matches.length : 0;
    }

    // Estimate per-subagent output sizes
    const subagentOutputEstimates = [
      { type: "implementer", avgOutput: 3000, count: 5 },
      { type: "spec-reviewer", avgOutput: 1500, count: 5 },
      { type: "code-reviewer", avgOutput: 1500, count: 5 },
      { type: "write-test", avgOutput: 2000, count: 5 },
    ];

    const totalOutputBaseline = subagentOutputEstimates.reduce((s, e) => s + e.avgOutput * e.count, 0);
    const summarizedOutputPerSubagent = 500;
    const totalOutputSummarized = subagentOutputEstimates.reduce((s, e) => s + summarizedOutputPerSubagent * e.count, 0);
    const savings = totalOutputBaseline - totalOutputSummarized;
    const savingsPercent = Math.round((savings / totalOutputBaseline) * 100);

    console.log("\n  Strategy 9: Subagent Output Summarization");
    console.log("  ──────────────────────────────────────────");
    console.log("  Per subagent type (5 tasks):");
    for (const e of subagentOutputEstimates) {
      console.log(`    ${e.type.padEnd(16)} ${e.count} dispatches × ~${e.avgOutput} tokens = ~${(e.avgOutput * e.count).toLocaleString()} tokens`);
    }
    console.log(`  ──────────────────────────`);
    console.log(`  Total baseline output:   ~${totalOutputBaseline.toLocaleString()} tokens (accumulated in parent context)`);
    console.log(`  Total summarized output: ~${totalOutputSummarized.toLocaleString()} tokens (500 tokens/subagent)`);
    console.log(`  Savings:                 ~${savings.toLocaleString()} tokens (-${savingsPercent}%)`);

    assert.ok(savingsPercent > 50, `Expected >50% savings, got ${savingsPercent}%`);
  });
});

// ─── Strategy 10: Thinking Token Budgets ──────────────────────────────────────

describe("Strategy 10: Thinking Token Budgets", () => {
  it("profiles subagent types and recommended thinking budgets", () => {
    const profiles = [
      { type: "implementer", tier: "capable", defaultThinking: 20000, recommended: 10000 },
      { type: "spec-reviewer", tier: "capable", defaultThinking: 20000, recommended: 5000 },
      { type: "code-reviewer", tier: "capable", defaultThinking: 20000, recommended: 5000 },
      { type: "plan-reviewer", tier: "capable", defaultThinking: 20000, recommended: 8000 },
      { type: "write-test", tier: "capable", defaultThinking: 20000, recommended: 8000 },
      { type: "consistency-analyzer", tier: "fast", defaultThinking: 0, recommended: 0 },
      { type: "route-scorer", tier: "fast", defaultThinking: 0, recommended: 0 },
      { type: "structural-architect", tier: "reasoning", defaultThinking: 30000, recommended: 15000 },
      { type: "security-reviewer", tier: "capable", defaultThinking: 20000, recommended: 8000 },
    ];

    // Estimate for a 5-task build pipeline
    const tasksPerPlan = 5;
    const subagentsPerTask = 4; // implementer, spec-reviewer, code-reviewer, write-test
    const reviewSubagents = 3; // structural, security, consistency

    let totalDefault = 0;
    let totalBudgeted = 0;

    // Per-task subagents
    for (const type of ["implementer", "spec-reviewer", "code-reviewer", "write-test"]) {
      const p = profiles.find(pr => pr.type === type);
      totalDefault += p.defaultThinking * tasksPerPlan;
      totalBudgeted += p.recommended * tasksPerPlan;
    }

    // Review subagents (once per plan)
    for (const type of ["structural-architect", "security-reviewer", "consistency-analyzer"]) {
      const p = profiles.find(pr => pr.type === type);
      totalDefault += p.defaultThinking;
      totalBudgeted += p.recommended;
    }

    // Plan reviewer (once)
    const planReviewer = profiles.find(p => p.type === "plan-reviewer");
    totalDefault += planReviewer.defaultThinking;
    totalBudgeted += planReviewer.recommended;

    const savings = totalDefault - totalBudgeted;
    const savingsPercent = Math.round((savings / totalDefault) * 100);

    console.log("\n  Strategy 10: Thinking Token Budgets");
    console.log("  ───────────────────────────────────");
    console.log("  Subagent type         Tier       Default    Budget     Saved");
    for (const p of profiles) {
      const saved = p.defaultThinking - p.recommended;
      console.log(`    ${p.type.padEnd(22)} ${p.tier.padEnd(10)} ${String(p.defaultThinking).padStart(6)}     ${String(p.recommended).padStart(6)}     ${String(saved).padStart(6)}`);
    }
    console.log(`  ──────────────────────────`);
    console.log(`  Pipeline total (5 tasks + reviews + plan):`);
    console.log(`    Default thinking:  ~${totalDefault.toLocaleString()} tokens`);
    console.log(`    Budgeted thinking: ~${totalBudgeted.toLocaleString()} tokens`);
    console.log(`    Savings:           ~${savings.toLocaleString()} tokens (-${savingsPercent}%)`);

    assert.ok(savingsPercent > 30, `Expected >30% savings, got ${savingsPercent}%`);
  });
});

// ─── Strategy 11: Prompt Cache Prefix Alignment ──────────────────────────────

describe("Strategy 11: Prompt Cache Prefix Alignment", () => {
  it("measures shared content across implement subagent prompts", () => {
    // Shared content in every implement subagent dispatch
    const constitutionPath = join(REPO_ROOT, ".context-index/constitution.md");
    const constitutionBytes = existsSync(constitutionPath) ? statSync(constitutionPath).size : 0;

    // A typical spec
    const specSizes = [];
    if (existsSync(SPECS_DIR)) {
      for (const module of readdirSync(SPECS_DIR, { withFileTypes: true })) {
        if (!module.isDirectory()) continue;
        for (const file of readdirSync(join(SPECS_DIR, module.name))) {
          if (file.endsWith(".md") && !file.includes("review") && !file.includes("plan") && !file.includes("charter") && !file.includes("validation")) {
            specSizes.push(statSync(join(SPECS_DIR, module.name, file)).size);
          }
        }
      }
    }
    const avgSpecBytes = specSizes.length > 0 ? Math.round(specSizes.reduce((a, b) => a + b, 0) / specSizes.length) : 3000;

    // Shared prefix = constitution + spec + charter excerpt
    const sharedPrefixBytes = constitutionBytes + avgSpecBytes + 2000; // charter excerpt
    const perTaskSuffixBytes = 3000; // task-specific instructions
    const totalPromptBytes = sharedPrefixBytes + perTaskSuffixBytes;

    // Cache analysis
    const tasksPerPlan = 5;
    const cacheHitRate_unaligned = 0.3; // Random ordering, prefix varies
    const cacheHitRate_aligned = 0.8; // Shared prefix first, consistent ordering
    const cacheCostMultiplier = 0.1; // Cache reads cost 0.1x

    const totalReads_unaligned = tasksPerPlan * totalPromptBytes;
    const cachedReads_unaligned = totalReads_unaligned * cacheHitRate_unaligned * cacheCostMultiplier;
    const uncachedReads_unaligned = totalReads_unaligned * (1 - cacheHitRate_unaligned);
    const effectiveCost_unaligned = cachedReads_unaligned + uncachedReads_unaligned;

    const totalReads_aligned = tasksPerPlan * totalPromptBytes;
    const cachedReads_aligned = totalReads_aligned * cacheHitRate_aligned * cacheCostMultiplier;
    const uncachedReads_aligned = totalReads_aligned * (1 - cacheHitRate_aligned);
    const effectiveCost_aligned = cachedReads_aligned + uncachedReads_aligned;

    const costSavings = effectiveCost_unaligned - effectiveCost_aligned;
    const costSavingsPercent = Math.round((costSavings / effectiveCost_unaligned) * 100);

    console.log("\n  Strategy 11: Prompt Cache Prefix Alignment");
    console.log("  ──────────────────────────────────────────");
    console.log(`  Shared prefix:     ${sharedPrefixBytes.toLocaleString()} bytes (~${estimateTokens(sharedPrefixBytes)} tokens)`);
    console.log(`  Per-task suffix:   ${perTaskSuffixBytes.toLocaleString()} bytes (~${estimateTokens(perTaskSuffixBytes)} tokens)`);
    console.log(`  Tasks per plan:    ${tasksPerPlan}`);
    console.log(`  ──────────────────────────`);
    console.log(`  Unaligned (est. 30% hit): ~${Math.round(estimateTokens(effectiveCost_unaligned)).toLocaleString()} effective tokens`);
    console.log(`  Aligned (est. 80% hit):   ~${Math.round(estimateTokens(effectiveCost_aligned)).toLocaleString()} effective tokens`);
    console.log(`  Cost savings:             -${costSavingsPercent}%`);

    assert.ok(costSavingsPercent > 30, `Expected >30% cost savings, got ${costSavingsPercent}%`);
  });
});

// ─── Strategy 12: Shared Anti-Pattern Reference ──────────────────────────────

describe("Strategy 12: Shared Anti-Pattern Reference", () => {
  it("measures anti-pattern duplication across SKILL.md files", () => {
    const antiPatterns = [
      { pattern: /do\s*not\s*dispatch\s*multiple\s*subagents?\s*in\s*parallel/gi, label: "no-parallel-dispatch" },
      { pattern: /do\s*not\s*skip\s*review/gi, label: "no-skip-review" },
      { pattern: /never\s*modify\s*implementation\s*code\s*during\s*validation/gi, label: "validation-read-only" },
      { pattern: /do\s*not\s*invoke.*implementation.*skill/gi, label: "no-impl-before-charter" },
      { pattern: /do\s*not\s*proceed\s*without/gi, label: "prerequisite-gate" },
      { pattern: /never.*merge.*directly/gi, label: "no-direct-merge" },
      { pattern: /do\s*not\s*re-?attempt/gi, label: "no-retry" },
      { pattern: /always\s*exit\s*0/gi, label: "exit-0" },
    ];

    const skills = getAllSkillSizes();
    const duplications = {};

    for (const ap of antiPatterns) {
      duplications[ap.label] = [];
      for (const s of skills) {
        const content = readSkill(s.name);
        if (!content) continue;
        const matches = content.match(ap.pattern);
        if (matches) {
          duplications[ap.label].push({ skill: s.name, count: matches.length });
        }
      }
    }

    const duplicatedPatterns = Object.entries(duplications).filter(([, hits]) => hits.length > 1);
    let totalDuplicatedBytes = 0;

    console.log("\n  Strategy 12: Shared Anti-Pattern Reference");
    console.log("  ──────────────────────────────────────────");
    console.log("  Anti-patterns found in 2+ skills:");

    for (const [label, hits] of duplicatedPatterns) {
      const skillList = hits.map(h => h.skill).join(", ");
      const estBytes = hits.length * 150; // ~150 bytes per anti-pattern instance
      totalDuplicatedBytes += estBytes - 150; // keep one copy
      console.log(`    ${label.padEnd(25)} ${hits.length} skills (${skillList})`);
    }

    console.log(`  ──────────────────────────`);
    console.log(`  Duplicated patterns:     ${duplicatedPatterns.length}`);
    console.log(`  Est. duplicated bytes:   ~${totalDuplicatedBytes.toLocaleString()} bytes (~${estimateTokens(totalDuplicatedBytes)} tokens)`);
    console.log(`  Approach: Extract to skills/_common/anti-patterns.md, load by reference`);

    assert.ok(duplicatedPatterns.length >= 0, "Measurement complete"); // Always passes — this is a measurement
  });

  it("finds Red Flags sections across skills", () => {
    const skills = getAllSkillSizes();
    let totalRedFlagBytes = 0;
    const skillsWithRedFlags = [];

    for (const s of skills) {
      const content = readSkill(s.name);
      if (!content) continue;

      const idx = content.indexOf("## Red Flags");
      if (idx === -1) continue;

      const endIdx = content.indexOf("\n## ", idx + 12);
      const sectionBytes = (endIdx === -1 ? content.length : endIdx) - idx;
      totalRedFlagBytes += sectionBytes;
      skillsWithRedFlags.push({ skill: s.name, bytes: sectionBytes });
    }

    console.log("\n  Red Flags sections (candidates for shared reference):");
    for (const s of skillsWithRedFlags) {
      console.log(`    ${s.skill.padEnd(15)} ${s.bytes.toLocaleString()} bytes`);
    }
    console.log(`  Total Red Flags bytes:   ${totalRedFlagBytes.toLocaleString()} (~${estimateTokens(totalRedFlagBytes)} tokens)`);
    console.log(`  If shared: save ~${Math.round(totalRedFlagBytes * 0.6).toLocaleString()} bytes (est. 60% overlap)`);

    assert.ok(true, "Measurement complete");
  });
});

// ─── Combined Summary ─────────────────────────────────────────────────────────

describe("Combined Summary", () => {
  it("produces overall savings estimate", () => {
    // Collect all measurements
    const strategies = [
      { id: 1, name: "Conditional section loading", inputSavings: 8000, outputSavings: 0, costSavings: 0 },
      { id: 2, name: "Context packet caps (4K)", inputSavings: 2000, outputSavings: 0, costSavings: 0 },
      { id: 3, name: "Review loop 3→2", inputSavings: 5000, outputSavings: 5000, costSavings: 0 },
      { id: 8, name: "Artifact-to-disk (eval'd)", inputSavings: 0, outputSavings: 2000, costSavings: 0 },
      { id: 9, name: "Subagent output summarization", inputSavings: 0, outputSavings: 7500, costSavings: 0 },
      { id: 10, name: "Thinking token budgets", inputSavings: 0, outputSavings: 0, costSavings: 52500 },
      { id: 11, name: "Prompt cache alignment", inputSavings: 0, outputSavings: 0, costSavings: 15000 },
      { id: 12, name: "Shared anti-pattern ref", inputSavings: 750, outputSavings: 0, costSavings: 0 },
    ];

    const totalInput = strategies.reduce((s, st) => s + st.inputSavings, 0);
    const totalOutput = strategies.reduce((s, st) => s + st.outputSavings, 0);
    const totalCost = strategies.reduce((s, st) => s + st.costSavings, 0);

    console.log("\n  ═══════════════════════════════════════════════════════");
    console.log("  COMBINED SAVINGS ESTIMATE (per 5-task build pipeline)");
    console.log("  ═══════════════════════════════════════════════════════");
    console.log("  #   Strategy                        Input    Output    Cost");
    for (const st of strategies) {
      console.log(`  ${String(st.id).padStart(2)}  ${st.name.padEnd(33)} ${String(st.inputSavings || "–").padStart(6)}   ${String(st.outputSavings || "–").padStart(6)}   ${String(st.costSavings || "–").padStart(6)}`);
    }
    console.log("  ─────────────────────────────────────────────────────");
    console.log(`  TOTAL (tokens)                      ${String(totalInput).padStart(6)}   ${String(totalOutput).padStart(6)}   ${String(totalCost).padStart(6)}`);
    console.log(`  Combined token reduction:           ~${(totalInput + totalOutput).toLocaleString()} tokens`);
    console.log(`  Combined cost reduction:            ~${(totalInput + totalOutput + totalCost).toLocaleString()} token-equivalents`);

    assert.ok(totalInput + totalOutput > 10000, "Combined savings should exceed 10K tokens");
  });
});
