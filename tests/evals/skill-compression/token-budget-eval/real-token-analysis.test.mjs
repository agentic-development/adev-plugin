/**
 * Real Token Analysis — Measures actual Claude token consumption from
 * session JSONL files (main + subagents) with cache breakdowns.
 *
 * Reads real session data from ~/.claude/projects/ to measure:
 * - Per-session total tokens (input, output, cache create, cache read)
 * - Subagent token overhead
 * - Artifact echo waste (Write turns with high output)
 * - Cache amplification from output accumulation
 * - Cross-session comparison
 *
 * Usage:
 *   node --test tests/evals/skill-compression/token-budget-eval/real-token-analysis.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";

const PROJECT_SESSIONS_DIR = join(
  homedir(),
  ".claude/projects/-Users-dpavancini-Development-adev-plugin"
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseSessionTokens(filePath) {
  const lines = readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
  const turns = [];

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === "assistant" && obj.message?.usage) {
        const u = obj.message.usage;
        const content = obj.message?.content || [];
        const tools = content
          .filter((c) => c.type === "tool_use")
          .map((c) => c.name);
        const text = content
          .filter((c) => c.type === "text")
          .map((c) => c.text?.substring(0, 120) || "")
          .join(" ");

        turns.push({
          input: u.input_tokens || 0,
          output: u.output_tokens || 0,
          cacheCreate: u.cache_creation_input_tokens || 0,
          cacheRead: u.cache_read_input_tokens || 0,
          tools,
          text,
          hasWrite: tools.includes("Write"),
          hasAgent: tools.includes("Agent"),
          timestamp: obj.timestamp,
        });
      }
    } catch {
      // Skip malformed lines
    }
  }
  return turns;
}

function aggregateTurns(turns) {
  return {
    turns: turns.length,
    input: turns.reduce((s, t) => s + t.input, 0),
    output: turns.reduce((s, t) => s + t.output, 0),
    cacheCreate: turns.reduce((s, t) => s + t.cacheCreate, 0),
    cacheRead: turns.reduce((s, t) => s + t.cacheRead, 0),
  };
}

function computeCost(stats) {
  return (
    (stats.input / 1e6) * 15 +
    (stats.output / 1e6) * 75 +
    (stats.cacheCreate / 1e6) * 18.75 +
    (stats.cacheRead / 1e6) * 1.5
  );
}

function analyzeFullSession(sessionId) {
  const mainFile = join(PROJECT_SESSIONS_DIR, `${sessionId}.jsonl`);
  if (!existsSync(mainFile)) return null;

  const mainTurns = parseSessionTokens(mainFile);
  const mainStats = aggregateTurns(mainTurns);

  // Subagents
  const subDir = join(PROJECT_SESSIONS_DIR, sessionId, "subagents");
  const subagents = [];
  if (existsSync(subDir)) {
    for (const f of readdirSync(subDir).filter((f) => f.endsWith(".jsonl"))) {
      const subTurns = parseSessionTokens(join(subDir, f));
      const subStats = aggregateTurns(subTurns);
      let description = "unknown";
      const metaFile = join(subDir, f.replace(".jsonl", ".meta.json"));
      if (existsSync(metaFile)) {
        try {
          const meta = JSON.parse(readFileSync(metaFile, "utf-8"));
          description =
            meta.description || meta.prompt?.substring(0, 60) || "unknown";
        } catch {}
      }
      subagents.push({ id: f.replace(".jsonl", ""), description, ...subStats });
    }
  }

  const subTotal = {
    turns: subagents.reduce((s, a) => s + a.turns, 0),
    input: subagents.reduce((s, a) => s + a.input, 0),
    output: subagents.reduce((s, a) => s + a.output, 0),
    cacheCreate: subagents.reduce((s, a) => s + a.cacheCreate, 0),
    cacheRead: subagents.reduce((s, a) => s + a.cacheRead, 0),
  };

  const grand = {
    turns: mainStats.turns + subTotal.turns,
    input: mainStats.input + subTotal.input,
    output: mainStats.output + subTotal.output,
    cacheCreate: mainStats.cacheCreate + subTotal.cacheCreate,
    cacheRead: mainStats.cacheRead + subTotal.cacheRead,
  };

  return { main: mainStats, mainTurns, subagents, subTotal, grand };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Real Token Analysis", () => {
  const CURRENT_SESSION = "2f030a32-ff9f-44dd-81ec-220595e6a2b7";

  it("session JSONL files exist and contain token data", () => {
    const mainFile = join(PROJECT_SESSIONS_DIR, `${CURRENT_SESSION}.jsonl`);
    assert.ok(existsSync(mainFile), "Session JSONL must exist");
    const turns = parseSessionTokens(mainFile);
    assert.ok(turns.length > 0, "Should have assistant turns with token data");
    assert.ok(
      turns[0].cacheRead !== undefined,
      "Should have cacheRead field"
    );
  });

  it("measures complete session token consumption (main + subagents)", () => {
    const session = analyzeFullSession(CURRENT_SESSION);
    assert.ok(session, "Session analysis must succeed");

    const g = session.grand;
    const total = g.input + g.output + g.cacheCreate + g.cacheRead;
    const cacheHitRate =
      (g.cacheRead / (g.input + g.cacheCreate + g.cacheRead)) * 100;
    const mainCost = computeCost(session.main);
    const subCost = computeCost(session.subTotal);

    console.log("\n  ═══════════════════════════════════════════════════════");
    console.log("  COMPLETE SESSION: " + CURRENT_SESSION.substring(0, 8));
    console.log("  ═══════════════════════════════════════════════════════");
    console.log(`  Main turns:       ${session.main.turns}`);
    console.log(`  Subagent turns:   ${session.subTotal.turns}`);
    console.log(`  Subagent count:   ${session.subagents.length}`);
    console.log("  ─────────────────────────────────────────────────────");
    console.log(`  Input (uncached):  ${g.input.toLocaleString()}`);
    console.log(`  Cache creation:    ${g.cacheCreate.toLocaleString()}`);
    console.log(`  Cache read:        ${g.cacheRead.toLocaleString()}`);
    console.log(`  Output:            ${g.output.toLocaleString()}`);
    console.log(`  TOTAL:             ${total.toLocaleString()}`);
    console.log(`  Cache hit rate:    ${cacheHitRate.toFixed(1)}%`);
    console.log("  ─────────────────────────────────────────────────────");
    console.log(`  Main cost:         $${mainCost.toFixed(2)}`);
    console.log(`  Subagent cost:     $${subCost.toFixed(2)}`);
    console.log(`  TOTAL COST:        $${(mainCost + subCost).toFixed(2)}`);

    assert.ok(total > 0, "Total tokens must be positive");
    assert.ok(cacheHitRate > 80, "Cache hit rate should be high");
  });

  it("measures artifact echo waste (Strategy 8 — real data)", () => {
    const session = analyzeFullSession(CURRENT_SESSION);
    const turns = session.mainTurns;

    // Turns with Write tool + >500 output tokens = artifact echo candidates
    const writeTurns = turns.filter((t) => t.hasWrite && t.output > 500);
    const currentOutput = writeTurns.reduce((s, t) => s + t.output, 0);
    const summarizedOutput = writeTurns.length * 500;
    const savedOutput = currentOutput - summarizedOutput;
    const savingsPercent =
      currentOutput > 0 ? Math.round((savedOutput / currentOutput) * 100) : 0;

    // Cache amplification: each output token persists for all remaining turns
    const avgRemainingTurns = Math.round(turns.length / 2);
    const cacheAmplification = savedOutput * avgRemainingTurns;
    const cacheCostSaved = (cacheAmplification / 1e6) * 1.5;

    console.log(
      "\n  Strategy 8: Artifact-to-Disk (REAL SESSION DATA)"
    );
    console.log("  ─────────────────────────────────────────────────────");
    console.log(`  Write turns with >500 output:  ${writeTurns.length}`);
    console.log(`  Current output tokens:         ${currentOutput.toLocaleString()}`);
    console.log(`  Summarized (500/turn):         ${summarizedOutput.toLocaleString()}`);
    console.log(`  Direct output savings:         ${savedOutput.toLocaleString()} (-${savingsPercent}%)`);
    console.log(`  Cache amplification savings:   ${cacheAmplification.toLocaleString()} tokens`);
    console.log(`  Cache cost saved:              $${cacheCostSaved.toFixed(2)}`);

    assert.ok(savingsPercent > 50, `Expected >50% savings, got ${savingsPercent}%`);
  });

  it("measures subagent token overhead (Strategy 9 — real data)", () => {
    const session = analyzeFullSession(CURRENT_SESSION);

    const subOutput = session.subTotal.output;
    const subCacheRead = session.subTotal.cacheRead;
    const subCacheCreate = session.subTotal.cacheCreate;
    const subCost = computeCost(session.subTotal);
    const totalCost = computeCost(session.grand);
    const subCostPercent = Math.round((subCost / totalCost) * 100);

    // If subagent outputs were summarized to 500 tokens each
    const subagentCount = session.subagents.length;
    const summarizedSubOutput = subagentCount * 500;
    const savedSubOutput = Math.max(0, subOutput - summarizedSubOutput);

    console.log(
      "\n  Strategy 9: Subagent Output Summarization (REAL DATA)"
    );
    console.log("  ─────────────────────────────────────────────────────");
    console.log(`  Subagent count:          ${subagentCount}`);
    console.log(`  Subagent total turns:    ${session.subTotal.turns}`);
    console.log(`  Subagent output tokens:  ${subOutput.toLocaleString()}`);
    console.log(`  Subagent cache reads:    ${subCacheRead.toLocaleString()}`);
    console.log(`  Subagent cache creates:  ${subCacheCreate.toLocaleString()}`);
    console.log(`  Subagent cost:           $${subCost.toFixed(2)} (${subCostPercent}% of total)`);
    console.log("  ─────────────────────────────────────────────────────");
    console.log(`  If outputs summarized:   ${summarizedSubOutput.toLocaleString()} tokens`);
    console.log(`  Output tokens saved:     ${savedSubOutput.toLocaleString()}`);

    // Top 5 most expensive subagents
    const sorted = [...session.subagents].sort(
      (a, b) =>
        a.input + a.output + a.cacheCreate + a.cacheRead -
        (b.input + b.output + b.cacheCreate + b.cacheRead)
    ).reverse();

    console.log("\n  Top 5 subagents by cost:");
    for (let i = 0; i < 5 && i < sorted.length; i++) {
      const s = sorted[i];
      const c = computeCost(s);
      console.log(
        `    ${s.description.substring(0, 40).padEnd(42)} ${s.turns} turns  $${c.toFixed(2)}`
      );
    }

    assert.ok(subagentCount > 0, "Should have subagents");
  });

  it("measures cache efficiency (Strategy 11 — real data)", () => {
    const session = analyzeFullSession(CURRENT_SESSION);
    const g = session.grand;

    const totalInputTokens = g.input + g.cacheCreate + g.cacheRead;
    const cacheHitRate = (g.cacheRead / totalInputTokens) * 100;

    // What would we pay without caching?
    const noCacheCost = ((g.input + g.cacheCreate + g.cacheRead) / 1e6) * 15 + (g.output / 1e6) * 75;
    const withCacheCost = computeCost(g);
    const cacheSavings = noCacheCost - withCacheCost;
    const cacheSavingsPercent = Math.round((cacheSavings / noCacheCost) * 100);

    console.log(
      "\n  Strategy 11: Cache Efficiency (REAL DATA)"
    );
    console.log("  ─────────────────────────────────────────────────────");
    console.log(`  Cache hit rate:            ${cacheHitRate.toFixed(1)}%`);
    console.log(`  Cache reads:               ${g.cacheRead.toLocaleString()} tokens`);
    console.log(`  Cache creations:           ${g.cacheCreate.toLocaleString()} tokens`);
    console.log(`  Uncached input:            ${g.input.toLocaleString()} tokens`);
    console.log("  ─────────────────────────────────────────────────────");
    console.log(`  Cost without caching:      $${noCacheCost.toFixed(2)}`);
    console.log(`  Cost with caching:         $${withCacheCost.toFixed(2)}`);
    console.log(`  Cache savings:             $${cacheSavings.toFixed(2)} (-${cacheSavingsPercent}%)`);

    assert.ok(cacheSavingsPercent > 50, `Expected >50% cache savings, got ${cacheSavingsPercent}%`);
  });

  it("cross-session comparison (top 5 sessions)", () => {
    const sessionFiles = readdirSync(PROJECT_SESSIONS_DIR)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => ({
        id: f.replace(".jsonl", ""),
        size: statSync(join(PROJECT_SESSIONS_DIR, f)).size,
      }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 5);

    console.log("\n  CROSS-SESSION COMPARISON (top 5 by file size)");
    console.log("  ═══════════════════════════════════════════════════════");
    console.log(
      "  Session      Turns  Subs  CacheHit%   Output     Cost"
    );
    console.log("  ─────────────────────────────────────────────────────");

    for (const sf of sessionFiles) {
      const session = analyzeFullSession(sf.id);
      if (!session) continue;

      const g = session.grand;
      const total = g.input + g.cacheCreate + g.cacheRead;
      const hitRate = total > 0 ? ((g.cacheRead / total) * 100).toFixed(1) : "0.0";
      const cost = computeCost(g);

      console.log(
        `  ${sf.id.substring(0, 8).padEnd(11)}` +
          `${String(g.turns).padStart(5)}  ` +
          `${String(session.subagents.length).padStart(4)}  ` +
          `${String(hitRate + "%").padStart(8)}  ` +
          `${String(g.output.toLocaleString()).padStart(8)}  ` +
          `$${cost.toFixed(2)}`
      );
    }

    assert.ok(sessionFiles.length > 0, "Should have sessions to compare");
  });

  it("produces combined savings estimate from real data", () => {
    const session = analyzeFullSession(CURRENT_SESSION);
    const g = session.grand;
    const totalCost = computeCost(g);
    const turns = session.mainTurns;

    // Strategy 8: Artifact echo
    const writeTurns = turns.filter((t) => t.hasWrite && t.output > 500);
    const savedOutput8 = writeTurns.reduce((s, t) => s + t.output, 0) - writeTurns.length * 500;
    const cacheAmp8 = savedOutput8 * Math.round(turns.length / 2);
    const costSaved8 = (savedOutput8 / 1e6) * 75 + (cacheAmp8 / 1e6) * 1.5;

    // Strategy 9: Subagent output summarization
    const savedOutput9 = Math.max(0, session.subTotal.output - session.subagents.length * 500);
    const costSaved9 = (savedOutput9 / 1e6) * 75;

    // Strategy 11: Already at 97%+ cache hit — alignment gains are marginal
    // But if we didn't have caching at all, cost would be much higher
    const noCacheCost = ((g.input + g.cacheCreate + g.cacheRead) / 1e6) * 15 + (g.output / 1e6) * 75;
    const cacheSavings = noCacheCost - totalCost;

    console.log("\n  ═══════════════════════════════════════════════════════");
    console.log("  COMBINED SAVINGS ESTIMATE (REAL DATA)");
    console.log("  ═══════════════════════════════════════════════════════");
    console.log(`  Current session cost:              $${totalCost.toFixed(2)}`);
    console.log(`  Current cache savings:             $${cacheSavings.toFixed(2)}`);
    console.log("  ─────────────────────────────────────────────────────");
    console.log(`  Strategy 8 (artifact-to-disk):`);
    console.log(`    Output tokens saved:             ${savedOutput8.toLocaleString()}`);
    console.log(`    Cache amplification avoided:     ${cacheAmp8.toLocaleString()}`);
    console.log(`    Cost saved:                      $${costSaved8.toFixed(2)}`);
    console.log(`  Strategy 9 (subagent summaries):`);
    console.log(`    Output tokens saved:             ${savedOutput9.toLocaleString()}`);
    console.log(`    Cost saved:                      $${costSaved9.toFixed(2)}`);
    console.log("  ─────────────────────────────────────────────────────");
    const totalSaved = costSaved8 + costSaved9;
    const savingsPercent = Math.round((totalSaved / totalCost) * 100);
    console.log(`  TOTAL SAVEABLE:                    $${totalSaved.toFixed(2)} (-${savingsPercent}% of session)`);

    assert.ok(totalSaved > 0, "Should have positive savings");
  });
});
