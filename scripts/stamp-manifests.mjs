#!/usr/bin/env node

/**
 * Retroactive source manifest stamper.
 *
 * Finds specs with .plan.md files that lack source-manifest in frontmatter.
 * Extracts file lists from plans, verifies files exist, computes manifests,
 * and stamps them into spec frontmatter.
 *
 * Usage:
 *   node scripts/stamp-manifests.mjs              # dry run (default)
 *   node scripts/stamp-manifests.mjs --apply      # actually stamp
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { computeManifest } from "../lib/source-manifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SPECS_DIR = join(ROOT, ".context-index/specs/features");

const apply = process.argv.includes("--apply");

function findPlans(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findPlans(full));
    } else if (entry.name.endsWith(".plan.md")) {
      results.push(full);
    }
  }
  return results;
}

function specForPlan(planPath) {
  // plan: foo.plan.md → spec: foo.md
  const specPath = planPath.replace(".plan.md", ".md");
  return existsSync(specPath) ? specPath : null;
}

function hasManifest(specPath) {
  const content = readFileSync(specPath, "utf-8");
  return content.includes("source-manifest:");
}

function extractFilesFromPlan(planPath) {
  const content = readFileSync(planPath, "utf-8");
  const files = new Set();

  // Match file paths in various plan formats:
  // - lib/foo.mjs
  // - tests/foo.test.mjs
  // Files: lib/foo.mjs, tests/bar.test.mjs
  // Create: lib/foo.mjs
  // Modify: lib/foo.mjs
  const patterns = [
    /(?:^|\s)(?:Files?|Create|Modify|Test):\s*(.+)/gm,
    /[-*]\s+`?([a-zA-Z][\w./:-]*\.\w{1,10})`?/gm,
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const segment = match[1];
      // Split comma-separated file lists
      for (const part of segment.split(/[,;]\s*/)) {
        const cleaned = part.trim().replace(/^`|`$/g, "").replace(/\(.*\)$/, "").trim();
        // Filter to likely file paths (has extension, no spaces, relative)
        if (
          cleaned &&
          /\.\w{1,10}$/.test(cleaned) &&
          !cleaned.includes(" ") &&
          !cleaned.startsWith("/") &&
          !cleaned.startsWith("#") &&
          !cleaned.startsWith("http") &&
          !cleaned.includes("{{")
        ) {
          files.add(cleaned);
        }
      }
    }
  }

  return [...files].sort();
}

function stampSpec(specPath, manifest) {
  let content = readFileSync(specPath, "utf-8");

  const manifestBlock = [
    "source-manifest:",
    `  sha: "${manifest.sha}"`,
    "  files:",
    ...manifest.files.map((f) => `    - ${f}`),
    `  computed-at: "${manifest.computedAt}"`,
  ].join("\n");

  // Find the YAML frontmatter block (may not be at line 1)
  const fmMatch = content.match(/(---\n)([\s\S]*?)\n(---)/);
  if (!fmMatch) return false;

  const fmStart = content.indexOf(fmMatch[0]);
  const fmEnd = fmStart + fmMatch[0].length;
  const before = content.slice(0, fmEnd - 3); // everything before closing ---
  const after = content.slice(fmEnd - 3);       // closing --- and rest

  content = before + manifestBlock + "\n" + after;
  writeFileSync(specPath, content);
  return true;
}

// --- Main ---

console.log(apply ? "APPLYING manifest stamps\n" : "DRY RUN (use --apply to stamp)\n");

const plans = findPlans(SPECS_DIR);
let stamped = 0;
let skipped = 0;
let noFiles = 0;
let missingFiles = 0;

for (const planPath of plans) {
  const specPath = specForPlan(planPath);
  if (!specPath) continue;
  if (hasManifest(specPath)) {
    skipped++;
    continue;
  }

  const planRel = relative(ROOT, planPath);
  const specRel = relative(ROOT, specPath);
  const files = extractFilesFromPlan(planPath);

  if (files.length === 0) {
    noFiles++;
    console.log(`  SKIP ${specRel} — no files in plan`);
    continue;
  }

  // Filter to files that actually exist
  const existing = files.filter((f) => {
    const full = join(ROOT, f);
    return existsSync(full) && statSync(full).isFile();
  });
  const missing = files.filter((f) => !existing.includes(f));

  if (existing.length === 0) {
    missingFiles++;
    console.log(`  SKIP ${specRel} — none of ${files.length} plan files exist`);
    continue;
  }

  if (missing.length > 0) {
    console.log(`  WARN ${specRel} — ${missing.length}/${files.length} files missing: ${missing.join(", ")}`);
  }

  if (apply) {
    try {
      const manifest = await computeManifest(existing, ROOT);
      if (stampSpec(specPath, manifest)) {
        stamped++;
        console.log(`  STAMP ${specRel} — ${existing.length} files, sha: ${manifest.sha}`);
      }
    } catch (err) {
      console.log(`  ERROR ${specRel} — ${err.message}`);
    }
  } else {
    stamped++;
    console.log(`  WOULD STAMP ${specRel} — ${existing.length} files`);
  }
}

console.log(`\nSummary:`);
console.log(`  Already stamped: ${skipped}`);
console.log(`  ${apply ? "Stamped" : "Would stamp"}: ${stamped}`);
console.log(`  No files in plan: ${noFiles}`);
console.log(`  No existing files: ${missingFiles}`);
