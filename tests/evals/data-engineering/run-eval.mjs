#!/usr/bin/env node

/**
 * Data Engineering Eval Runner
 *
 * Scores skill output files in outputs/<variant>/<skill>/output.md against rubrics.
 * Only runs the deterministic layer (required_elements pattern matching).
 * Quality dimensions require an LLM judge and must be scored separately.
 *
 * Usage:
 *   node tests/evals/data-engineering/run-eval.mjs
 *   node tests/evals/data-engineering/run-eval.mjs --variant baseline
 *   node tests/evals/data-engineering/run-eval.mjs --skill data-brainstorm
 */

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const RUBRICS_DIR = join(__dirname, 'rubrics');
const OUTPUTS_DIR = join(__dirname, 'outputs');

const args = process.argv.slice(2);
const filterVariant = args.includes('--variant') ? args[args.indexOf('--variant') + 1] : null;
const filterSkill = args.includes('--skill') ? args[args.indexOf('--skill') + 1] : null;
const writeReport = !args.includes('--no-report');

// --- Helpers ---

function readYaml(filePath) {
  const text = readFileSync(filePath, 'utf-8');
  const lines = text.split('\n');
  const result = {};
  let currentKey = null;
  let currentList = null;
  let currentObj = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#')) continue;

    const topMatch = line.match(/^(\w[\w_]+):\s*(.*)/);
    if (topMatch && !line.startsWith('  ')) {
      currentKey = topMatch[1];
      const val = topMatch[2].trim();
      if (val === '') {
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
      if (val.includes(':')) {
        currentObj = {};
        currentList.push(currentObj);
        const [k, v] = val.split(/:\s+(.*)/, 2);
        currentObj[k.trim()] = parseScalar(v || '');
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
      continue;
    }
  }

  return result;
}

function parseScalar(val) {
  if (val === 'true') return true;
  if (val === 'false') return false;
  const num = Number(val);
  if (!isNaN(num) && val !== '') return num;
  if (val.startsWith('"') && val.endsWith('"')) {
    return val.slice(1, -1).replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
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
      const re = new RegExp(el.match_pattern, 'im');
      const passed = re.test(output);
      results.push({ id: el.id, description: el.description, passed });
    } catch (err) {
      results.push({ id: el.id, description: el.description, passed: false, error: err.message });
    }
  }
  return results;
}

function computeScore(elementResults, scoring) {
  const passed = elementResults.filter(r => r.passed).length;
  const total = elementResults.length;
  const elementScore = total > 0 ? (passed / total) * (scoring.required_element_weight ?? 50) : 0;
  return {
    elementScore: Math.round(elementScore * 10) / 10,
    passed,
    total,
    maxElementScore: scoring.required_element_weight ?? 50,
  };
}

function formatReport(results) {
  const lines = [];
  lines.push('# Data Engineering Eval Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('> **Note:** Only the deterministic layer (required elements) is scored here.');
  lines.push('> Quality dimensions require an LLM judge and are scored separately.');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Variant | Skill | Elements Passed | Element Score | Max | Status |');
  lines.push('|---------|-------|-----------------|---------------|-----|--------|');

  for (const r of results) {
    const status = r.output_missing ? 'no output' : r.score.passed === r.score.total ? 'all pass' : 'partial';
    const elementScore = r.output_missing ? '-' : r.score.elementScore;
    const passed = r.output_missing ? '-' : `${r.score.passed}/${r.score.total}`;
    lines.push(`| ${r.variant} | ${r.skill} | ${passed} | ${elementScore} | ${r.score?.maxElementScore ?? '-'} | ${status} |`);
  }

  lines.push('');
  lines.push('## Details');

  for (const r of results) {
    lines.push('');
    lines.push(`### ${r.variant} / ${r.skill}`);
    lines.push('');

    if (r.output_missing) {
      lines.push('> Output file not found. Run the scenario with this variant and save output to:');
      lines.push(`> \`outputs/${r.variant}/${r.skill}/output.md\``);
      continue;
    }

    lines.push('**Required Elements:**');
    lines.push('');
    lines.push('| ID | Description | Result |');
    lines.push('|----|-------------|--------|');
    for (const el of r.elements) {
      const icon = el.passed ? 'PASS' : 'FAIL';
      lines.push(`| \`${el.id}\` | ${el.description} | ${icon} |`);
    }

    if (r.quality_dimensions?.length > 0) {
      lines.push('');
      lines.push('**Quality Dimensions (manual/LLM scoring needed):**');
      lines.push('');
      lines.push('| ID | Description | Weight | Score |');
      lines.push('|----|-------------|--------|-------|');
      for (const dim of r.quality_dimensions) {
        lines.push(`| \`${dim.id}\` | ${dim.description} | ${dim.weight} | - |`);
      }
    }
  }

  return lines.join('\n');
}

// --- Main ---

console.log('Data Engineering Eval');
console.log('=====================\n');

// Discover variants from outputs directory
let variants = [];
if (existsSync(OUTPUTS_DIR)) {
  variants = readdirSync(OUTPUTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(v => !filterVariant || v === filterVariant);
}

if (variants.length === 0) {
  variants = filterVariant ? [filterVariant] : ['baseline'];
}

const rubricFiles = readdirSync(RUBRICS_DIR).filter(f => f.endsWith('.yaml'));
const results = [];

for (const variant of variants) {
  for (const rubricFile of rubricFiles) {
    const skill = basename(rubricFile, '.yaml');
    if (filterSkill && skill !== filterSkill) continue;

    const rubric = readYaml(join(RUBRICS_DIR, rubricFile));

    const outputPath = join(OUTPUTS_DIR, variant, skill, 'output.md');
    const outputMissing = !existsSync(outputPath);

    if (outputMissing) {
      console.log(`  [${variant}/${skill}] No output — add to outputs/${variant}/${skill}/output.md`);
      results.push({
        variant,
        skill,
        output_missing: true,
        quality_dimensions: rubric.quality_dimensions || [],
        score: { elementScore: 0, passed: 0, total: rubric.required_elements?.length ?? 0, maxElementScore: rubric.scoring?.required_element_weight ?? 50 },
      });
      continue;
    }

    const output = readFileSync(outputPath, 'utf-8');
    const elementResults = scoreRequiredElements(output, rubric.required_elements || []);
    const score = computeScore(elementResults, rubric.scoring || {});

    console.log(`  [${variant}/${skill}] ${score.passed}/${score.total} elements — ${score.elementScore}/${score.maxElementScore} pts`);

    results.push({
      variant,
      skill,
      output_missing: false,
      elements: elementResults,
      quality_dimensions: rubric.quality_dimensions || [],
      score,
    });
  }
}

console.log('');

if (writeReport) {
  const report = formatReport(results);
  const reportPath = join(OUTPUTS_DIR, 'eval-report.md');
  mkdirSync(OUTPUTS_DIR, { recursive: true });
  writeFileSync(reportPath, report, 'utf-8');
  console.log(`Report written to tests/evals/data-engineering/outputs/eval-report.md`);
} else {
  console.log('(--no-report: skipping report write)');
}

const missing = results.filter(r => r.output_missing).length;
if (missing > 0) {
  console.log(`\n${missing} output(s) missing. Generate them by running each skill scenario.`);
}
