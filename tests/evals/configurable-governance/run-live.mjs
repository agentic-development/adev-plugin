#!/usr/bin/env node
/**
 * Tier 3 — live runner for the configurable-governance eval.
 *
 * Drives /adev:review-specs against the fixture through a pluggable
 * dispatcher so the whole orchestration (registry load, posture check,
 * context-pack render, dispatch struct, severity cap, verdict
 * consolidation, report render) runs end-to-end WITHOUT requiring the
 * Claude Code harness to be present.
 *
 * Dispatcher shape (see dispatchers/stub.mjs for the canned default):
 *
 *     async function dispatch(request) {
 *         // request = { stage, reviewerId, description, prompt, env,
 *         //             redactionSet, allowedTools, modelId, ... }
 *         // subagent-mode or adapter: return { findings } or { yaml }
 *         // runner: return { stdout }
 *     }
 *
 * Output: outputs/<variant>/scenario-a-review-install/output.md
 *
 * CLI:
 *   node tests/evals/configurable-governance/run-live.mjs [opts]
 *     --scenario <id>       (default: scenario-a-review-install)
 *     --variant  <label>    (default: stub)
 *     --dispatcher <path>   (default: ./dispatchers/stub.mjs; relative to
 *                            this file or absolute)
 *     --spec <repo-rel>     (default: the fixture's invoice-generation spec)
 *     --fixture <dir>       (default: ./fixture)
 *     --ws <dir>            (optional workspace root for multi-repo scenarios)
 *     --score               run run-eval.mjs afterwards
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join, resolve, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as claudeCode from "../../../lib/profiles/adapters/claude-code.mjs";
import { loadReviewConfig, applySeverityCap, computeVerdict } from "../../../lib/governance/review-config.mjs";
import { buildReviewerDispatches, renderReviewReport } from "../../../lib/governance/dispatch-shape.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runLive(opts = {}) {
  const scenario = opts.scenario ?? "scenario-a-review-install";
  const variant = opts.variant ?? "stub";
  const dispatcherPath = opts.dispatcher ?? "./dispatchers/stub.mjs";
  const fixture = opts.fixture ?? join(__dirname, "fixture");
  const specRel = opts.spec ?? ".context-index/specs/features/billing/invoice-generation.md";

  if (!existsSync(fixture)) {
    throw new Error(`fixture not found at ${fixture}. Run setup-fixture.sh first.`);
  }
  const dispatchAbs = isAbsolute(dispatcherPath) ? dispatcherPath : resolve(__dirname, dispatcherPath);
  const mod = await import(pathToFileURL(dispatchAbs).href);
  const dispatch = mod.dispatch ?? mod.default;
  if (typeof dispatch !== "function") {
    throw new Error(`dispatcher at ${dispatchAbs} must export async function 'dispatch' (or default).`);
  }

  const cfg = loadReviewConfig(fixture);
  if (cfg.errors.length) {
    return writeErrorReport({ variant, scenario, errors: cfg.errors, variantLabel: variant });
  }

  const specPath = join(fixture, specRel);
  const targetSpecContent = existsSync(specPath) ? readFileSync(specPath, "utf8") : "";
  const findingsByReviewer = {};
  const allDispatches = [];

  for (const reviewer of cfg.reviewers) {
    const built = buildReviewerDispatches(reviewer, {
      profiles: cfg.profiles,
      contextPacks: cfg.contextPacks,
      consumerRepoRoot: fixture,
      workspaceRoot: opts.ws ?? null,
      adapter: claudeCode,
      mcpAvailable: new Set(["playwright"]),
      targetSpecPath: specRel,
      targetSpecContent,
    });
    if (built.errors.length) {
      findingsByReviewer[reviewer.id] = [
        { severity: "blocker", message: `dispatch failed: ${built.errors.map((e) => e.code).join(", ")}` },
      ];
      allDispatches.push({ stage: "subagent", reviewerId: reviewer.id, promptSource: "(dispatch error)" });
      continue;
    }
    allDispatches.push(...built.dispatches);

    // Drive each dispatch through the pluggable dispatcher.
    let reviewerFindings = [];
    if (reviewer.mode === "subagent") {
      const resp = await dispatch(built.dispatches[0]);
      reviewerFindings = resp.findings ?? [];
    } else {
      const runnerResp = await dispatch(built.dispatches[0]);
      const adapterResp = await dispatch({
        ...built.dispatches[1],
        prompt: `${built.dispatches[1].prompt}\n\n---\n## Runner output\n${runnerResp.stdout ?? ""}`,
      });
      reviewerFindings = extractFromAdapter(adapterResp);
    }
    // Apply severity cap (Behavior 36).
    findingsByReviewer[reviewer.id] = reviewerFindings.map((f) => applySeverityCap(f, reviewer));
  }

  const flat = Object.values(findingsByReviewer).flat();
  const verdict = computeVerdict(flat, cfg.verdictRules);
  const body = renderReviewReport({
    specPath: specRel,
    charterPath: ".context-index/specs/features/billing/charter.md",
    verdict,
    dispatches: allDispatches,
    findings: findingsByReviewer,
    date: new Date().toISOString().slice(0, 10),
  });
  const outDir = join(__dirname, "outputs", variant, scenario);
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "output.md");
  writeFileSync(outPath, body, "utf8");
  return { outPath, verdict, findingsByReviewer, dispatches: allDispatches };
}

function extractFromAdapter(resp) {
  if (!resp) return [];
  if (Array.isArray(resp.findings)) return resp.findings;
  if (typeof resp.yaml === "string") return parseFindingsYaml(resp.yaml);
  return [];
}

function parseFindingsYaml(yaml) {
  // Intentionally lax — matches the stub's output. Real-world LLM returns
  // are scored via the run-eval rubrics rather than strict parsing here.
  const entries = [];
  const re = /- id: "([^"]+)"\s*\n\s*severity:\s*(\S+)\s*\n\s*(?:category:\s*(\S+)\s*\n\s*)?message:\s*(.+)\s*$/gm;
  let m;
  while ((m = re.exec(yaml))) {
    entries.push({
      id: m[1],
      severity: m[2],
      category: m[3],
      message: m[4].replace(/^"|"$/g, ""),
    });
  }
  return entries;
}

function writeErrorReport({ variant, scenario, errors }) {
  const outDir = join(__dirname, "outputs", variant, scenario);
  mkdirSync(outDir, { recursive: true });
  const body = [
    `# Architecture Review: ${scenario} — LOAD ERROR`,
    "",
    `> Variant: ${variant}`,
    "",
    "## Errors",
    "",
    ...errors.map((e) => `- **${e.code}** — ${e.message}`),
  ].join("\n");
  const outPath = join(outDir, "output.md");
  writeFileSync(outPath, body, "utf8");
  return { outPath, verdict: "BLOCK", errors };
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const get = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : fallback;
  };
  runLive({
    scenario: get("--scenario"),
    variant: get("--variant"),
    dispatcher: get("--dispatcher"),
    spec: get("--spec"),
    fixture: get("--fixture"),
    ws: get("--ws"),
  }).then((r) => {
    console.log(`Wrote ${r.outPath}`);
    console.log(`Verdict: ${r.verdict}`);
    if (args.includes("--score")) {
      execSync(`node ${join(__dirname, "run-eval.mjs")} --variant ${get("--variant", "stub")} --scenario ${get("--scenario", "scenario-a-review-install")}`, {
        stdio: "inherit",
      });
    }
  }).catch((e) => {
    console.error(e.stack ?? e.message);
    process.exit(1);
  });
}
