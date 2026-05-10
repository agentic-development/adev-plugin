#!/usr/bin/env node
/**
 * Sync skill SKILL.md files from the main skills/ directory to provider directories.
 *
 * The main skills/ directory is the source of truth. Provider copies get the
 * same content with a provider-specific suffix appended to the YAML description field.
 *
 * Usage:
 *   node scripts/sync-provider-skills.mjs              # sync all skills to all providers
 *   node scripts/sync-provider-skills.mjs --dry-run    # show what would change
 *   node scripts/sync-provider-skills.mjs --provider opencode  # sync only one provider
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PROVIDER_DESCRIPTION_SUFFIX = {
  opencode: " In OpenCode, invoke with skill({ name: '<SKILL_NAME>' })",
  codex: " In Codex, invoke with $<SKILL_NAME>",
};

// Skills that are intentionally excluded from certain providers (e.g., they
// depend on Claude Code-specific features like hooks or plugin infra).
const PROVIDER_EXCLUDES = {
  opencode: [],
  codex: [],
};

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const providerFlag = args.includes("--provider") ? args[args.indexOf("--provider") + 1] : null;

function getMainSkills() {
  const skillsDir = join(ROOT, "skills");
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("adev-"))
    .map((d) => d.name)
    .filter((name) => existsSync(join(skillsDir, name, "SKILL.md")));
}

function transformDescription(content, provider, skillName) {
  const suffix = PROVIDER_DESCRIPTION_SUFFIX[provider];
  if (!suffix) return content;

  const qualifiedName = `adev:${skillName}`;
  const suffixText = suffix.replace("<SKILL_NAME>", qualifiedName);

  // Replace the description line in YAML frontmatter
  return content.replace(
    /^(description:\s*")(.*?)(")\s*$/m,
    (match, prefix, desc, quote) => {
      // Remove any existing provider suffix before appending new one
      const cleaned = desc
        .replace(/\s*In OpenCode, invoke with.*$/, "")
        .replace(/\s*In Codex, invoke with.*$/, "");
      return `${prefix}${cleaned}${suffixText}${quote}`;
    }
  );
}

function syncFile(srcPath, destPath, transform) {
  const content = readFileSync(srcPath, "utf8");
  const transformed = transform ? transform(content) : content;

  if (existsSync(destPath)) {
    const existing = readFileSync(destPath, "utf8");
    if (existing === transformed) return "up-to-date";
  }

  if (!dryRun) {
    mkdirSync(dirname(destPath), { recursive: true });
    writeFileSync(destPath, transformed);
  }

  return existsSync(destPath) ? "updated" : "created";
}

function syncSkillToProvider(skillName, provider) {
  const mainDir = join(ROOT, "skills", skillName);
  const providerDir = join(ROOT, "providers", provider, "skills", skillName);
  const fileResults = [];

  // Sync SKILL.md with description transform
  const skillStatus = syncFile(
    join(mainDir, "SKILL.md"),
    join(providerDir, "SKILL.md"),
    (content) => transformDescription(content, provider, skillName)
  );
  fileResults.push({ file: "SKILL.md", status: skillStatus });

  // Sync companion .md files (mode files, reviewer prompts, etc.) — verbatim copy
  const companions = readdirSync(mainDir)
    .filter((f) => f.endsWith(".md") && f !== "SKILL.md");
  for (const companion of companions) {
    const status = syncFile(join(mainDir, companion), join(providerDir, companion));
    fileResults.push({ file: companion, status });
  }

  // Codex requires agents/openai.yaml for each skill
  if (provider === "codex") {
    const agentYamlPath = join(providerDir, "agents", "openai.yaml");
    if (!existsSync(agentYamlPath)) {
      const displayName = `adev ${skillName.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}`;
      const yaml = [
        "interface:",
        `  display_name: "${displayName}"`,
        `  short_description: "Run adev:${skillName}"`,
        `  default_prompt: "Use $adev:${skillName} to run this skill."`,
        "",
      ].join("\n");
      if (!dryRun) {
        mkdirSync(dirname(agentYamlPath), { recursive: true });
        writeFileSync(agentYamlPath, yaml);
      }
      fileResults.push({ file: "agents/openai.yaml", status: "created" });
    } else {
      fileResults.push({ file: "agents/openai.yaml", status: "up-to-date" });
    }
  }

  return fileResults.map((r) => ({
    status: r.status,
    skillName,
    provider,
    file: r.file,
  }));
}

// Main
const providers = providerFlag ? [providerFlag] : Object.keys(PROVIDER_DESCRIPTION_SUFFIX);
const skills = getMainSkills();
const results = [];

for (const provider of providers) {
  const excludes = PROVIDER_EXCLUDES[provider] || [];
  for (const skill of skills) {
    if (excludes.includes(skill)) continue;
    results.push(...syncSkillToProvider(skill, provider));
  }
}

const updated = results.filter((r) => r.status === "updated");
const created = results.filter((r) => r.status === "created");
const upToDate = results.filter((r) => r.status === "up-to-date");

console.log(`${dryRun ? "[DRY RUN] " : ""}Provider skill sync complete:`);
console.log(`  ${updated.length} updated, ${created.length} created, ${upToDate.length} up-to-date`);

if (updated.length || created.length) {
  console.log("\nChanges:");
  for (const r of [...updated, ...created]) {
    console.log(`  ${r.status}: providers/${r.provider}/skills/${r.skillName}/${r.file}`);
  }
}
