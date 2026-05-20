#!/usr/bin/env node
// Analyze Claude Code JSONL transcripts to ground persona-output verbosity research.
// Reads every *.jsonl under ~/.claude/projects/-Users-dpavancini-Development-adev-plugin/
// (or path passed as argv[2]) and emits aggregate per-persona statistics.
//
// IMPORTANT: This script never echoes user/assistant content to stdout. Statistics only.
//
// Usage:
//   node scripts/persona-jsonl-analysis.mjs [transcript-dir]

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import os from 'node:os';

const DEFAULT_DIR = path.join(os.homedir(), '.claude/projects/-Users-dpavancini-Development-adev-plugin');
const dir = process.argv[2] || DEFAULT_DIR;

const PERSONA_RE = /Output Persona:\s*(Architect|Developer|Product)/i;
const PERSONAS = ['architect', 'developer', 'product', 'unknown'];

// Verbosity detection patterns. The session-start hook injects a "Verbosity
// Overlay: <Name>" heading when the overlay is loaded; older sessions used a
// "verbosity: <name>" config-line marker. Match either form.
const VERBOSITY_RE = /(?:Verbosity Overlay:|verbosity\s*[:=])\s*(terse|normal|deep)/i;
const VERBOSITIES = ['terse', 'normal', 'deep', 'unknown'];

const FLAGS = {
  has_architectural_read: /architectural read|architectural decisions worth flagging|architectural decisions to flag/i,
  has_next_steps: /next steps|next actions/i,
  has_trade_off: /trade[- ]?off/i,
  has_review_verdict_table: /\|[^\n]*(verdict|blocker|rationale)[^\n]*\|/i,
  has_disk_artifact_path: /\.review\.md|\.plan\.md|\.validate\.md|\.spec\.md|\.context-index\/[^\s)]+\.md/i,
};
const FLAG_KEYS = Object.keys(FLAGS);

const HEADER_RE = /^#{2,4} /m;

function extractText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const b of content) {
    if (b && b.type === 'text' && typeof b.text === 'string') parts.push(b.text);
  }
  return parts.join('\n');
}

function countNonEmptyLines(text) {
  if (!text) return 0;
  let n = 0;
  for (const line of text.split('\n')) {
    if (line.trim().length) n++;
  }
  return n;
}

function countHeaders(text) {
  if (!text) return 0;
  let n = 0;
  for (const line of text.split('\n')) {
    if (/^#{2,4} /.test(line)) n++;
  }
  return n;
}

function detectPersonaFromString(s) {
  if (!s) return null;
  const m = s.match(PERSONA_RE);
  if (!m) return null;
  return m[1].toLowerCase();
}

function detectVerbosityFromString(s) {
  if (!s) return null;
  const m = s.match(VERBOSITY_RE);
  if (!m) return null;
  return m[1].toLowerCase();
}

// Generic extractor: scans the same attachment/system payloads used for persona
// detection and returns the first match found by the supplied detector fn.
function detectFromRecord(rec, detector) {
  if (rec.type === 'attachment' && rec.attachment) {
    const a = rec.attachment;
    if (typeof a.stdout === 'string') {
      const v = detector(a.stdout);
      if (v) return v;
    }
    if (Array.isArray(a.content)) {
      for (const item of a.content) {
        if (typeof item === 'string') {
          const v = detector(item);
          if (v) return v;
        }
      }
    } else if (typeof a.content === 'string') {
      const v = detector(a.content);
      if (v) return v;
    }
  }
  if (rec.type === 'system' && typeof rec.content === 'string') {
    return detector(rec.content);
  }
  return null;
}

function detectPersonaFromRecord(rec) {
  return detectFromRecord(rec, detectPersonaFromString);
}

function detectVerbosityFromRecord(rec) {
  return detectFromRecord(rec, detectVerbosityFromString);
}

async function processFile(filePath) {
  const personaCandidates = []; // first persona seen
  const verbosityCandidates = []; // first verbosity seen
  const turns = []; // collected assistant turns
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    // persona + verbosity detection: only need first hit of each
    if (personaCandidates.length === 0) {
      const p = detectPersonaFromRecord(rec);
      if (p) personaCandidates.push(p);
    }
    if (verbosityCandidates.length === 0) {
      const v = detectVerbosityFromRecord(rec);
      if (v) verbosityCandidates.push(v);
    }
    // assistant turn collection
    if (rec.type === 'assistant' && rec.message && rec.message.role === 'assistant') {
      const content = rec.message.content;
      const text = extractText(content);
      if (!text || !text.trim()) continue; // skip pure tool-call turns
      const usage = rec.message.usage || {};
      const turn = {
        output_tokens: Number(usage.output_tokens) || 0,
        cache_read: Number(usage.cache_read_input_tokens) || 0,
        text_lines: countNonEmptyLines(text),
        section_headers: countHeaders(text),
      };
      for (const k of FLAG_KEYS) turn[k] = FLAGS[k].test(text) ? 1 : 0;
      turns.push(turn);
    }
  }
  const persona = personaCandidates[0] || 'unknown';
  const verbosity = verbosityCandidates[0] || 'unknown';
  return { persona, verbosity, turns };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

function median(sorted) {
  if (!sorted.length) return 0;
  const m = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[m];
  return (sorted[m - 1] + sorted[m]) / 2;
}

function mean(arr) {
  if (!arr.length) return 0;
  let s = 0;
  for (const x of arr) s += x;
  return s / arr.length;
}

function stats(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    mean: mean(arr),
    median: median(sorted),
    p90: percentile(sorted, 0.9),
    max: sorted.length ? sorted[sorted.length - 1] : 0,
  };
}

// Wilson 95% CI for a proportion
function wilson95(k, n) {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const denom = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / denom;
  const half = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

function fmt(n, d = 1) {
  if (!Number.isFinite(n)) return 'NaN';
  return n.toFixed(d);
}

async function main() {
  if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')).map(f => path.join(dir, f));
  const fileCount = files.length;
  const perPersona = Object.fromEntries(PERSONAS.map(p => [p, { sessions: 0, turns: [] }]));
  // Nested per-persona × per-verbosity aggregation (new in this revision).
  const perPersonaVerbosity = {};
  for (const p of PERSONAS) {
    perPersonaVerbosity[p] = {};
    for (const v of VERBOSITIES) {
      perPersonaVerbosity[p][v] = { sessions: 0, turns: [] };
    }
  }
  const sessionPersonas = [];

  for (const f of files) {
    const { persona, verbosity, turns } = await processFile(f);
    sessionPersonas.push({ file: path.basename(f), persona, verbosity, turnCount: turns.length });
    perPersona[persona].sessions += 1;
    for (const t of turns) perPersona[persona].turns.push(t);
    // Two-key aggregation
    perPersonaVerbosity[persona][verbosity].sessions += 1;
    for (const t of turns) perPersonaVerbosity[persona][verbosity].turns.push(t);
  }

  // Build aggregates
  const reports = {};
  for (const p of PERSONAS) {
    const turns = perPersona[p].turns;
    const sessions = perPersona[p].sessions;
    const tokensArr = turns.map(t => t.output_tokens);
    const cacheArr = turns.map(t => t.cache_read);
    const linesArr = turns.map(t => t.text_lines);
    const headersArr = turns.map(t => t.section_headers);
    const flagCounts = Object.fromEntries(FLAG_KEYS.map(k => [k, 0]));
    for (const t of turns) for (const k of FLAG_KEYS) flagCounts[k] += t[k];
    const flagRates = {};
    for (const k of FLAG_KEYS) {
      const n = turns.length;
      const c = flagCounts[k];
      const [lo, hi] = wilson95(c, n);
      flagRates[k] = { rate: n ? c / n : 0, ci: [lo, hi], count: c, n };
    }
    reports[p] = {
      sessions,
      turn_count: turns.length,
      output_tokens: stats(tokensArr),
      cache_read: stats(cacheArr),
      text_lines: stats(linesArr),
      section_headers: stats(headersArr),
      flag_rates: flagRates,
    };
  }

  const totalAssistantTurns = PERSONAS.reduce((s, p) => s + reports[p].turn_count, 0);

  // Emit JSON to stderr for archival, markdown to stdout
  const md = [];
  md.push('# Persona JSONL Verbosity Analysis');
  md.push('');
  md.push('## Setup');
  md.push('');
  md.push(`- Transcript directory: \`${dir}\``);
  md.push(`- JSONL files scanned: **${fileCount}**`);
  md.push(`- Total assistant turns with text (tool-only turns excluded): **${totalAssistantTurns}**`);
  md.push(`- Persona detection: scanned each session's first SessionStart attachment (\`attachment.stdout\` and \`attachment.content\`) and \`system\` records for the marker \`Output Persona: (Architect|Developer|Product)\`. The first match becomes the session persona for every assistant turn in that file. Sessions with no marker bucket as \`unknown\`.`);
  md.push('');
  const sessionBreak = PERSONAS.map(p => `${p}=${perPersona[p].sessions}`).join(', ');
  md.push(`- Session-persona breakdown: ${sessionBreak}`);
  md.push('');

  md.push('## Persona Aggregates');
  md.push('');
  md.push('| Persona | Sessions | Turns | Mean Out-Tok | Mean Lines | Mean Hdrs | arch_read | next_steps | disk_path |');
  md.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const p of PERSONAS) {
    const r = reports[p];
    const ar = r.flag_rates.has_architectural_read.rate;
    const ns = r.flag_rates.has_next_steps.rate;
    const dp = r.flag_rates.has_disk_artifact_path.rate;
    md.push(`| ${p} | ${r.sessions} | ${r.turn_count} | ${fmt(r.output_tokens.mean,0)} | ${fmt(r.text_lines.mean,1)} | ${fmt(r.section_headers.mean,2)} | ${fmt(ar*100,1)}% | ${fmt(ns*100,1)}% | ${fmt(dp*100,1)}% |`);
  }
  md.push('');

  md.push('### Full per-persona distributions');
  md.push('');
  md.push('| Persona | OutTok mean / med / p90 / max | Lines mean / med / p90 | Hdrs mean / med / p90 | CacheRead mean / med / p90 |');
  md.push('|---|---|---|---|---|');
  for (const p of PERSONAS) {
    const r = reports[p];
    md.push(`| ${p} | ${fmt(r.output_tokens.mean,0)} / ${fmt(r.output_tokens.median,0)} / ${fmt(r.output_tokens.p90,0)} / ${r.output_tokens.max} | ${fmt(r.text_lines.mean,1)} / ${fmt(r.text_lines.median,1)} / ${fmt(r.text_lines.p90,0)} | ${fmt(r.section_headers.mean,2)} / ${fmt(r.section_headers.median,1)} / ${fmt(r.section_headers.p90,0)} | ${fmt(r.cache_read.mean,0)} / ${fmt(r.cache_read.median,0)} / ${fmt(r.cache_read.p90,0)} |`);
  }
  md.push('');

  md.push('### Flag rates with 95% Wilson CI');
  md.push('');
  md.push('| Persona | arch_read | next_steps | trade_off | review_verdict_table | disk_artifact_path |');
  md.push('|---|---|---|---|---|---|');
  for (const p of PERSONAS) {
    const r = reports[p];
    const row = FLAG_KEYS.map(k => {
      const fr = r.flag_rates[k];
      return `${fmt(fr.rate*100,1)}% [${fmt(fr.ci[0]*100,1)},${fmt(fr.ci[1]*100,1)}]`;
    });
    md.push(`| ${p} | ${row.join(' | ')} |`);
  }
  md.push('');

  md.push('## Cross-persona ratios (architect / developer)');
  md.push('');
  const A = reports.architect;
  const D = reports.developer;
  function ratio(a, b) { return b ? a / b : NaN; }
  md.push('| Metric | Architect | Developer | A / D ratio |');
  md.push('|---|---:|---:|---:|');
  md.push(`| Mean output tokens | ${fmt(A.output_tokens.mean,0)} | ${fmt(D.output_tokens.mean,0)} | ${fmt(ratio(A.output_tokens.mean, D.output_tokens.mean), 2)} |`);
  md.push(`| Mean text lines | ${fmt(A.text_lines.mean,1)} | ${fmt(D.text_lines.mean,1)} | ${fmt(ratio(A.text_lines.mean, D.text_lines.mean), 2)} |`);
  md.push(`| Mean section headers | ${fmt(A.section_headers.mean,2)} | ${fmt(D.section_headers.mean,2)} | ${fmt(ratio(A.section_headers.mean, D.section_headers.mean), 2)} |`);
  md.push(`| Mean cache_read tokens | ${fmt(A.cache_read.mean,0)} | ${fmt(D.cache_read.mean,0)} | ${fmt(ratio(A.cache_read.mean, D.cache_read.mean), 2)} |`);
  for (const k of FLAG_KEYS) {
    md.push(`| Flag ${k} rate | ${fmt(A.flag_rates[k].rate*100,1)}% | ${fmt(D.flag_rates[k].rate*100,1)}% | ${fmt(ratio(A.flag_rates[k].rate, D.flag_rates[k].rate), 2)} |`);
  }
  md.push('');

  // Build persona × verbosity aggregates (9 buckets + unknown rows)
  const reportsPV = {};
  for (const p of PERSONAS) {
    reportsPV[p] = {};
    for (const v of VERBOSITIES) {
      const bucketTurns = perPersonaVerbosity[p][v].turns;
      const bucketSessions = perPersonaVerbosity[p][v].sessions;
      const tokensArr = bucketTurns.map(t => t.output_tokens);
      const linesArr = bucketTurns.map(t => t.text_lines);
      const flagCounts = Object.fromEntries(FLAG_KEYS.map(k => [k, 0]));
      for (const t of bucketTurns) for (const k of FLAG_KEYS) flagCounts[k] += t[k];
      const flagRates = {};
      for (const k of FLAG_KEYS) {
        const n = bucketTurns.length;
        const c = flagCounts[k];
        flagRates[k] = { rate: n ? c / n : 0, count: c, n };
      }
      reportsPV[p][v] = {
        sessions: bucketSessions,
        turn_count: bucketTurns.length,
        output_tokens: stats(tokensArr),
        text_lines: stats(linesArr),
        flag_rates: flagRates,
      };
    }
  }

  md.push('## Persona × Verbosity Aggregates');
  md.push('');
  md.push('| Persona | Verbosity | Sessions | Turns | Mean Out-Tok | Mean Lines | next_steps% |');
  md.push('|---|---|---:|---:|---:|---:|---:|');
  for (const p of PERSONAS) {
    for (const v of VERBOSITIES) {
      const r = reportsPV[p][v];
      if (r.sessions === 0 && r.turn_count === 0) continue; // skip empty buckets
      const ns = r.flag_rates.has_next_steps.rate;
      md.push(`| ${p} | ${v} | ${r.sessions} | ${r.turn_count} | ${fmt(r.output_tokens.mean,0)} | ${fmt(r.text_lines.mean,1)} | ${fmt(ns*100,1)}% |`);
    }
  }
  md.push('');

  // Print markdown
  console.log(md.join('\n'));

  // Also emit machine-readable JSON sidecar to stderr for re-use
  const json = { dir, fileCount, totalAssistantTurns, sessions: sessionPersonas, reports, reports_persona_verbosity: reportsPV };
  process.stderr.write(JSON.stringify(json) + '\n');
}

main().catch(err => { console.error(err); process.exit(1); });
