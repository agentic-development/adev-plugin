#!/usr/bin/env node

/**
 * Repomap Eval Pipeline Runner
 *
 * Orchestrates: clone → generate ground truth → run parsers → compare → report
 *
 * Usage:
 *   npm run eval              — full pipeline
 *   npm run eval:generate     — ground truth only
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { cloneRepo } from './clone.mjs';
import { generateGroundTruth } from './generate-ground-truth.mjs';
import { parseRepoMap } from './parse-repomap.mjs';
import { compareSymbols, compareEdges } from './compare.mjs';
import { generateReport } from './report.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..');
const CACHE_DIR = join(__dirname, '.cache');
const REPOS_PATH = join(__dirname, 'repos.json');
const REPOMAP_SCRIPT = join(PLUGIN_ROOT, 'lib', 'repomap', 'index.mjs');

const generateOnly = process.argv.includes('--generate-only');

// --- Read config ---
let config;
try {
  config = JSON.parse(readFileSync(REPOS_PATH, 'utf-8'));
} catch (err) {
  console.error(`Error: Cannot read ${REPOS_PATH}: ${err.message}`);
  process.exit(1);
}

if (!config.repos || config.repos.length === 0) {
  console.warn('Warning: No repos configured in repos.json');
  process.exit(0);
}

// --- Pipeline ---
console.log('Repomap Eval Pipeline');
console.log('=====================\n');

let failures = 0;
const total = config.repos.length;

for (let i = 0; i < total; i++) {
  const repo = config.repos[i];
  const shortRef = repo.gitRef.slice(0, 10);
  console.log(`[${i + 1}/${total}] ${repo.name}`);

  try {
    // Clone
    process.stdout.write(`  Cloning ${repo.name} (${shortRef})... `);
    const { path: repoPath, cached } = cloneRepo(repo, CACHE_DIR);
    console.log(cached ? 'cached' : 'done');

    // Ground truth output dir
    const outputDir = join(__dirname, repo.name);
    mkdirSync(outputDir, { recursive: true });

    // Generate ground truth
    process.stdout.write('  Generating ground truth... ');
    const gt = generateGroundTruth(repoPath, outputDir);
    console.log(`${gt.symbolCount} symbols, ${gt.edgeCount} edges`);

    if (generateOnly) {
      console.log('  (--generate-only: skipping parser comparison)\n');
      continue;
    }

    // Read ground truth
    const groundTruthSymbols = JSON.parse(
      readFileSync(join(outputDir, 'ground-truth-symbols.json'), 'utf-8')
    ).symbols;
    const groundTruthEdges = JSON.parse(
      readFileSync(join(outputDir, 'ground-truth-edges.json'), 'utf-8')
    ).edges;

    // Run tree-sitter parser
    process.stdout.write('  Running tree-sitter parser... ');
    try {
      execFileSync('node', [REPOMAP_SCRIPT, '--root', repoPath, '--mode', 'tree-sitter'], {
        stdio: 'pipe',
      });
      console.log('done');
    } catch (err) {
      console.log(`failed: ${err.message}`);
    }

    // Run regex parser
    process.stdout.write('  Running regex parser... ');
    try {
      execFileSync('node', [REPOMAP_SCRIPT, '--root', repoPath, '--mode', 'regex'], {
        stdio: 'pipe',
      });
      console.log('done');
    } catch (err) {
      console.log(`failed: ${err.message}`);
    }

    // Read parser outputs
    const hygieneDir = join(repoPath, '.context-index', 'hygiene');

    let treeSitterSymbols = [];
    let treeSitterEdges = [];
    try {
      const symbolRanks = JSON.parse(
        readFileSync(join(hygieneDir, 'symbol-ranks.json'), 'utf-8')
      );
      treeSitterSymbols = symbolRanks.symbols || [];
    } catch { /* no tree-sitter output */ }

    try {
      const depGraph = JSON.parse(
        readFileSync(join(hygieneDir, 'dependency-graph.json'), 'utf-8')
      );
      treeSitterEdges = depGraph.edges || [];
    } catch { /* no dependency graph */ }

    let regexSymbols = [];
    try {
      const repoMapContent = readFileSync(join(hygieneDir, 'repo-map.md'), 'utf-8');
      const parsed = parseRepoMap(repoMapContent);
      regexSymbols = parsed.symbols || [];
    } catch { /* no regex output */ }

    // Compare
    console.log('  Comparing...');

    const tsSymbolResult = compareSymbols(treeSitterSymbols, groundTruthSymbols);
    const tsEdgeResult = compareEdges(treeSitterEdges, groundTruthEdges);
    const rxSymbolResult = compareSymbols(regexSymbols, groundTruthSymbols);

    console.log(
      `    tree-sitter: symbols P=${tsSymbolResult.precision.toFixed(2)} R=${tsSymbolResult.recall.toFixed(2)}` +
      (tsEdgeResult ? `, edges P=${tsEdgeResult.precision.toFixed(2)} R=${tsEdgeResult.recall.toFixed(2)}` : '')
    );
    console.log(
      `    regex:       symbols P=${rxSymbolResult.precision.toFixed(2)} R=${rxSymbolResult.recall.toFixed(2)}`
    );

    // Generate report
    const treeSitterResult = { symbols: tsSymbolResult, edges: tsEdgeResult };
    const regexResult = { symbols: rxSymbolResult, edges: null };
    const report = generateReport(
      repo.name, repo.url, repo.gitRef,
      { symbolCount: gt.symbolCount, edgeCount: gt.edgeCount },
      treeSitterResult, regexResult
    );

    const reportPath = join(outputDir, 'eval-report.md');
    writeFileSync(reportPath, report, 'utf-8');
    console.log(`  Report written to tests/evals/repomap/${repo.name}/eval-report.md\n`);

  } catch (err) {
    failures++;
    console.error(`  ERROR: ${err.message}\n`);
  }
}

// Summary
console.log('Summary');
console.log('-------');
console.log(`${total} repo(s) evaluated. ${failures} failure(s).`);
