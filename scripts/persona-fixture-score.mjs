#!/usr/bin/env node
// Structural A/B scoring for persona templates against fixture prompt classes.
// Feeds research artifact .context-index/research/persona-output-depth-and-verbosity.md (issue-515).
// NOT a production test — research instrument. Re-runnable.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const DIMENSIONS = [
  "Verbosity",
  "Code References",
  "Review Verdicts",
  "Test Results",
  "Plan Output",
  "Spec/ADR Citations",
  "Error/Debug Output",
  "Next Actions",
];

const FIXTURE_PROMPTS = [
  {
    id: "routine-edit",
    description: "Edit a single function in lib/persona.mjs to rename a parameter",
    activates: ["Verbosity", "Code References", "Next Actions"],
  },
  {
    id: "bug-fix",
    description: "Debug a failing hook test (PreToolUse merge-guard)",
    activates: ["Verbosity", "Code References", "Test Results", "Error/Debug Output", "Next Actions"],
  },
  {
    id: "architectural-decision",
    description: "Choose between two implementations for a depth dial in lib/persona.mjs",
    activates: DIMENSIONS, // all dimensions activate
  },
  {
    id: "validation-report",
    description: "Run /adev:validate after implementing a spec",
    activates: ["Verbosity", "Review Verdicts", "Test Results", "Spec/ADR Citations", "Next Actions"],
  },
  {
    id: "status-query",
    description: "User asks 'what's the status of issue-515'",
    activates: ["Verbosity", "Next Actions"],
  },
];

function parseTemplate(text) {
  const sections = {};
  const lines = text.split("\n");
  let current = null;
  for (const line of lines) {
    const m = line.match(/^### (.+)$/);
    if (m) {
      current = m[1].trim();
      sections[current] = { bullets: 0, directiveWords: 0, lines: 0 };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("- ")) sections[current].bullets += 1;
    if (line.trim()) sections[current].lines += 1;
    const words = (line.toLowerCase().match(/\b(always|must|include|show|reference|cite|do not|never)\b/g) || []).length;
    sections[current].directiveWords += words;
  }
  return sections;
}

function loadTemplateFile(name) {
  const path = join(ROOT, "templates", "personas", `${name}.md`);
  if (!existsSync(path)) throw new Error(`Missing template: ${path}`);
  return parseTemplate(readFileSync(path, "utf8"));
}

// Candidate Architect-trimmed template inlined as a *string* for structural comparison.
// This is the proposed Option A — promotes mandates from MUST to MAY-when-asked, trims
// 3-bullet sections down to 2 where Developer also uses 2. Option E adds an explicit
// anti-redundancy rule (separate dimension, not counted as bullets).
const CANDIDATE_ARCHITECT_TRIMMED = `# Output Persona: Architect (candidate trimmed — option A)

You are presenting to a **senior architect**. Provide technical detail when it informs a decision; otherwise stay concise. Defer deep trade-off analysis until the user asks.

## Output Rules

### Verbosity
- Explain **what was done** and the key decisions made
- Include trade-off reasoning when the user is making an architectural choice

### Code References
- Include file paths with line numbers
- Show diffs and code snippets for architectural changes

### Review Verdicts
- Show verdict with key findings
- Defer reviewer rationale unless the user asks "why"

### Test Results
- Show test names, counts, and failures
- Defer coverage details unless the user asks

### Plan Output
- Show task breakdown with routing scores
- Defer context packet details unless the user asks

### Spec/ADR Citations
- Cite specs and ADRs when they constrain the current decision
- Defer charter-scope and constitution citations to disk artifacts

### Error/Debug Output
- Show error messages with root cause
- Defer stack traces and ADR cross-references unless the user asks

### Next Actions
- Suggest the single most likely next action
- Multiple alternatives only when the user is at a real branch point

### Anti-Redundancy (option E)
- If a disk artifact captures the detail, summarize in 1-3 sentences and link
- Do not recapitulate the contents of .review.md / .plan.md / .validate.md / .spec.md
`;

const personas = {
  architect: loadTemplateFile("architect"),
  developer: loadTemplateFile("developer"),
  product: loadTemplateFile("product"),
  "architect-trimmed": parseTemplate(CANDIDATE_ARCHITECT_TRIMMED),
};

function score(personaSections, activatedDims) {
  let bullets = 0;
  let directiveWords = 0;
  let dimensionsCovered = 0;
  for (const dim of activatedDims) {
    const sec = personaSections[dim];
    if (!sec) continue;
    bullets += sec.bullets;
    directiveWords += sec.directiveWords;
    dimensionsCovered += 1;
  }
  return { bullets, directiveWords, dimensionsCovered };
}

function fmt(n) {
  return String(n).padStart(4);
}

const rows = [];
for (const fix of FIXTURE_PROMPTS) {
  const row = { fixture: fix.id, activated: fix.activates.length };
  for (const [name, sections] of Object.entries(personas)) {
    row[name] = score(sections, fix.activates);
  }
  rows.push(row);
}

console.log("# Persona fixture A/B — structural scoring");
console.log("");
console.log("Bullets / directive-words per fixture, per persona.");
console.log("");
console.log("| fixture                  | dims | architect (cur) | developer | product   | architect-trimmed | reduction (cur→trim) |");
console.log("|--------------------------|------|-----------------|-----------|-----------|-------------------|----------------------|");
let curTotal = 0;
let trimTotal = 0;
for (const row of rows) {
  const c = row["architect"];
  const d = row["developer"];
  const p = row["product"];
  const t = row["architect-trimmed"];
  curTotal += c.bullets;
  trimTotal += t.bullets;
  const reduction = c.bullets > 0 ? Math.round(((c.bullets - t.bullets) / c.bullets) * 100) : 0;
  console.log(
    `| ${row.fixture.padEnd(24)} | ${fmt(row.activated)} | ${fmt(c.bullets)}b / ${fmt(c.directiveWords)}d  | ${fmt(d.bullets)}b / ${fmt(d.directiveWords)}d | ${fmt(p.bullets)}b / ${fmt(p.directiveWords)}d | ${fmt(t.bullets)}b / ${fmt(t.directiveWords)}d    | ${reduction}%                  |`
  );
}
console.log("");
console.log(`Total bullets across fixtures: architect ${curTotal} → architect-trimmed ${trimTotal} (${Math.round(((curTotal - trimTotal) / curTotal) * 100)}% reduction).`);

console.log("");
console.log("## Per-dimension bullets, all personas");
console.log("");
console.log("| dimension              | architect | developer | product | trimmed |");
console.log("|------------------------|-----------|-----------|---------|---------|");
for (const dim of DIMENSIONS) {
  const a = personas.architect[dim]?.bullets ?? 0;
  const d = personas.developer[dim]?.bullets ?? 0;
  const p = personas.product[dim]?.bullets ?? 0;
  const t = personas["architect-trimmed"][dim]?.bullets ?? 0;
  console.log(`| ${dim.padEnd(22)} | ${fmt(a)}      | ${fmt(d)}      | ${fmt(p)}    | ${fmt(t)}    |`);
}

// Directive-word totals across all dimensions
console.log("");
console.log("## Directive-word totals (always | must | include | show | reference | cite | do not | never)");
console.log("");
for (const [name, sections] of Object.entries(personas)) {
  let total = 0;
  for (const dim of DIMENSIONS) total += sections[dim]?.directiveWords ?? 0;
  console.log(`- ${name}: ${total}`);
}
