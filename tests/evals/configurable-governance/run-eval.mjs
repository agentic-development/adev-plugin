#!/usr/bin/env node

/**
 * Configurable Governance Eval Runner
 *
 * Scores captured skill output in outputs/<variant>/<scenario>/output.md
 * against rubrics in rubrics/*.yaml. Only runs the deterministic layer
 * (required_elements regex match). Quality dimensions need an LLM judge.
 *
 * The deterministic proof that the code works lives in
 * configurable-governance.test.mjs — run `node --test tests/evals/configurable-governance/configurable-governance.test.mjs`
 * for that.
 *
 * Usage:
 *   node tests/evals/configurable-governance/run-eval.mjs
 *   node tests/evals/configurable-governance/run-eval.mjs --variant baseline
 *   node tests/evals/configurable-governance/run-eval.mjs --scenario scenario-a-review-install
 *   node tests/evals/configurable-governance/run-eval.mjs --no-report
 */

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUBRICS_DIR = join(__dirname, "rubrics");
const OUTPUTS_DIR = join(__dirname, "outputs");

const args = process.argv.slice(2);
const filterVariant = args.includes("--variant") ? args[args.indexOf("--variant") + 1] : null;
const filterScenario = args.includes("--scenario") ? args[args.indexOf("--scenario") + 1] : null;
const writeReport = !args.includes("--no-report");

function readYaml(filePath) {
  const text = readFileSync(filePath, "utf-8");
  const lines = text.split("\n");
  const result = {};
  let currentKey = null;
  let currentList = null;
  let currentObj = null;

  for (const line of lines) {
    if (line.startsWith("#")) continue;
    const topMatch = line.match(/^(\w[\w_]+):\s*(.*)/);
    if (topMatch && !line.startsWith("  ")) {
      currentKey = topMatch[1];
      const val = topMatch[2].trim();
      if (val === "") {
        result[currentKey] = [];
        currentList = result[currentKey];
        currentObj = null;
      } else {
        result[currentKey] = parseScalar(val);
        currentList = null;
        currentObj = null;
      }
      continue;
    }
    const listItemMatch = line.match(/^  - (.*)/);
    if (listItemMatch && currentList !== null) {
      const val = listItemMatch[1].trim();
      if (val.includes(":")) {
        currentObj = {};
        currentList.push(currentObj);
        const [k, v] = val.split(/:\s+(.*)/, 2);
        currentObj[k.trim()] = parseScalar(v || "");
      } else {
        currentList.push(parseScalar(val));
        currentObj = null;
      }
      continue;
    }
    const objPropMatch = line.match(/^    (\w[\w_]+):\s*(.*)/);
    if (objPropMatch && currentObj !== null) {
      const [, k, v] = objPropMatch;
      currentObj[k.trim()] = parseScalar(v.trim());
    }
  }
  return result;
}

function parseScalar(val) {
  if (val === "true") return true;
  if (val === "false") return false;
  const num = Number(val);
  if (!Number.isNaN(num) && val !== "") return num;
  if (val.startsWith('"') && val.endsWith('"')) {
    return val.slice(1, -1).replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (val.startsWith("'") && val.endsWith("'")) {
    return val.slice(1, -1).replace(/''/g, "'");
  }
  return val;
}

function scoreRequiredElements(output, elements) {
  const results = [];
  for (const el of elements) {
    try {
      const re = new RegExp(el.match_pattern, "im");
      const passed = re.test(output);
      results.push({ id: el.id, description: el.description, passed });
    } catch (err) {
      results.push({ id: el.id, description: el.description, passed: false, error: err.message });
    }
  }
  return results;
}

function computeScore(elementResults, scoring) {
  const passed = elementResults.filter((r) => r.passed).length;
  const total = elementResults.length;
  const maxElementScore = scoring.required_element_weight ?? 50;
  const elementScore = total > 0 ? (passed / total) * maxElementScore : 0;
  return {
    elementScore: Math.round(elementScore * 10) / 10,
    passed,
    total,
    maxElementScore,
  };
}

function formatReport(results) {
  const lines = [];
  lines.push("# Configurable Governance Eval Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("> Deterministic layer only (regex-match of required_elements).");
  lines.push("> Quality dimensions require an LLM judge.");
  lines.push("> The real integration proof lives in configurable-governance.test.mjs.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Variant | Scenario | Elements | Element Score | Max | Status |");
  lines.push("|---------|----------|----------|---------------|-----|--------|");
  for (const r of results) {
    const status = r.output_missing
      ? "no output"
      : r.score.passed === r.score.total
      ? "all pass"
      : "partial";
    const elementScore = r.output_missing ? "-" : r.score.elementScore;
    const passed = r.output_missing ? "-" : `${r.score.passed}/${r.score.total}`;
    lines.push(`| ${r.variant} | ${r.scenario} | ${passed} | ${elementScore} | ${r.score?.maxElementScore ?? "-"} | ${status} |`);
  }
  lines.push("");
  lines.push("## Details");
  for (const r of results) {
    lines.push("");
    lines.push(`### ${r.variant} / ${r.scenario}`);
    lines.push("");
    if (r.output_missing) {
      lines.push(`> No output captured. Run the skill scenario and save output to \`outputs/${r.variant}/${r.scenario}/output.md\`.`);
      continue;
    }
    lines.push("**Required Elements:**");
    lines.push("");
    lines.push("| ID | Description | Result |");
    lines.push("|----|-------------|--------|");
    for (const el of r.elements) {
      const icon = el.passed ? "PASS" : "FAIL";
      lines.push(`| \`${el.id}\` | ${el.description} | ${icon} |`);
    }
    if (r.quality_dimensions?.length > 0) {
      lines.push("");
      lines.push("**Quality Dimensions (LLM scoring needed):**");
      lines.push("");
      lines.push("| ID | Description | Weight | Score |");
      lines.push("|----|-------------|--------|-------|");
      for (const dim of r.quality_dimensions) {
        lines.push(`| \`${dim.id}\` | ${dim.description} | ${dim.weight} | - |`);
      }
    }
  }
  return lines.join("\n");
}

console.log("Configurable Governance Eval");
console.log("============================\n");

let variants = [];
if (existsSync(OUTPUTS_DIR)) {
  variants = readdirSync(OUTPUTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((v) => !filterVariant || v === filterVariant);
}
if (variants.length === 0) {
  variants = filterVariant ? [filterVariant] : ["baseline"];
}

const rubricFiles = readdirSync(RUBRICS_DIR).filter((f) => f.endsWith(".yaml"));
const results = [];

for (const variant of variants) {
  for (const rubricFile of rubricFiles) {
    const scenario = basename(rubricFile, ".yaml");
    if (filterScenario && scenario !== filterScenario) continue;
    const rubric = readYaml(join(RUBRICS_DIR, rubricFile));
    const outputPath = join(OUTPUTS_DIR, variant, scenario, "output.md");
    const outputMissing = !existsSync(outputPath);
    if (outputMissing) {
      console.log(`  [${variant}/${scenario}] no output \u2014 run skill and save to outputs/${variant}/${scenario}/output.md`);
      results.push({
        variant,
        scenario,
        output_missing: true,
        quality_dimensions: rubric.quality_dimensions || [],
        score: {
          elementScore: 0,
          passed: 0,
          total: rubric.required_elements?.length ?? 0,
          maxElementScore: rubric.scoring?.required_element_weight ?? 50,
        },
      });
      continue;
    }
    const output = readFileSync(outputPath, "utf-8");
    const elementResults = scoreRequiredElements(output, rubric.required_elements || []);
    const score = computeScore(elementResults, rubric.scoring || {});
    console.log(`  [${variant}/${scenario}] ${score.passed}/${score.total} elements \u2014 ${score.elementScore}/${score.maxElementScore} pts`);
    results.push({
      variant,
      scenario,
      output_missing: false,
      elements: elementResults,
      quality_dimensions: rubric.quality_dimensions || [],
      score,
    });
  }
}

console.log("");
if (writeReport) {
  const report = formatReport(results);
  mkdirSync(OUTPUTS_DIR, { recursive: true });
  writeFileSync(join(OUTPUTS_DIR, "eval-report.md"), report, "utf-8");
  console.log("Report written to tests/evals/configurable-governance/outputs/eval-report.md");
}

const missing = results.filter((r) => r.output_missing).length;
if (missing > 0) {
  console.log(`\n${missing} output(s) missing. Run the skill scenarios against the fixture and capture stdout.`);
  console.log("Fixture: tests/evals/configurable-governance/fixture/ (run setup-fixture.sh if not created).");
}
