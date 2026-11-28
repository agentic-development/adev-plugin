#!/usr/bin/env node
/**
 * Sync skill SKILL.md files from the main skills/ directory to provider directories.
 *
 * The main skills/ directory is the source of truth. Provider copies get the
 * same content with a provider-specific suffix appended to the YAML description field.
 * Each mirror gets its canonical file's executable bit. The per-file transform
 * lives in lib/sync/provider-skills.mjs, which the lite tripwire also uses to
 * recognise an exact regeneration.
 *
 * Usage:
 *   node scripts/sync-provider-skills.mjs              # sync all skills to all providers
 *   node scripts/sync-provider-skills.mjs --dry-run    # show what would change
 *   node scripts/sync-provider-skills.mjs --provider opencode  # sync only one provider
 *   node scripts/sync-provider-skills.mjs --root <dir>         # sync another checkout (tests)
 */

import { chmodSync, readFileSync, writeFileSync, readdirSync, existsSync, lstatSync, mkdirSync, statSync } from "fs";
import { join, dirname, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";
import {
  PROVIDER_DESCRIPTION_SUFFIX,
  PROVIDER_EXCLUDES,
  isMirroredSkillFile,
  isSyncedSkillName,
  mirrorFileContent,
} from "../lib/sync/provider-skills.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

function fail(message) {
  console.error(`sync-provider-skills: ${message}`);
  process.exit(1);
}

function flagValue(flag) {
  const i = args.indexOf(flag);
  if (i === -1) return null;
  const value = args[i + 1];
  if (value === undefined || value === "" || value.startsWith("--")) fail(`${flag} requires a value`);
  return value;
}

const ROOT = resolve(flagValue("--root") ?? join(__dirname, ".."));
const dryRun = args.includes("--dry-run");
const providerFlag = flagValue("--provider");
if (providerFlag !== null && !Object.hasOwn(PROVIDER_DESCRIPTION_SUFFIX, providerFlag)) {
  fail(`unknown --provider '${providerFlag}' (expected one of: ${Object.keys(PROVIDER_DESCRIPTION_SUFFIX).join(", ")})`);
}

// Destinations skipped because a path component from providers/ down is a
// symlink. Writing through one would land outside the mirror tree.
const refused = new Set();

// The first symlinked component of `destPath` below ROOT (providers/ itself
// included), as a ROOT-relative path, or null.
function symlinkOnPath(destPath) {
  const parts = relative(ROOT, destPath).split(sep);
  let current = ROOT;
  for (const part of parts) {
    current = join(current, part);
    let isLink;
    try {
      isLink = lstatSync(current).isSymbolicLink();
    } catch {
      return null;
    }
    if (isLink) return relative(ROOT, current).split(sep).join("/");
  }
  return null;
}

// Whether `destPath` may be written; records the refusal when it may not.
function writable(destPath) {
  const link = symlinkOnPath(destPath);
  if (link === null) return true;
  refused.add(link);
  return false;
}

function getMainSkills() {
  const skillsDir = join(ROOT, "skills");
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && isSyncedSkillName(d.name))
    .map((d) => d.name)
    .filter((name) => existsSync(join(skillsDir, name, "SKILL.md")));
}

const isExecutable = (mode) => (mode & 0o100) !== 0;

/**
 * Writes `destPath` from `srcPath` and gives it the source's executable bit.
 *
 * The bit is the owner-execute bit, the one git records as `100755`. The
 * mirrors are symlinked straight into user installs, so a script that loses
 * it does not run, and the lite tripwire exempts a mirror only when its git
 * mode equals its canonical file's. A mode-only difference is therefore a
 * change, reported `updated` so `--dry-run` shows it.
 */
function syncFile(srcPath, destPath, transform) {
  if (!writable(destPath)) return "refused";
  const content = readFileSync(srcPath, "utf8");
  const transformed = transform ? transform(content) : content;
  const executable = isExecutable(statSync(srcPath).mode);

  const existed = existsSync(destPath);
  const sameContent = existed && readFileSync(destPath, "utf8") === transformed;
  const sameMode = existed && isExecutable(statSync(destPath).mode) === executable;
  if (sameContent && sameMode) return "up-to-date";

  if (!dryRun) {
    mkdirSync(dirname(destPath), { recursive: true });
    if (!sameContent) writeFileSync(destPath, transformed);
    const mode = statSync(destPath).mode & 0o777;
    // +x is granted to whoever may read, as git does on checkout.
    chmodSync(destPath, executable ? mode | ((mode & 0o444) >> 2) : mode & ~0o111);
  }

  return existed ? "updated" : "created";
}

/**
 * Every companion file under a skill directory, as paths relative to it.
 *
 * Covers `references/` and `scripts/` at any depth plus any remaining flat
 * companion, and deliberately does NOT return SKILL.md (synced separately with
 * the description transform) or `agents/` (provider-owned, generated below).
 */
function listCompanions(mainDir, rel = "", out = []) {
  for (const entry of readdirSync(join(mainDir, rel), { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === "agents") continue;
      listCompanions(mainDir, childRel, out);
    } else if (childRel !== "SKILL.md" && isMirroredSkillFile(childRel)) {
      out.push(childRel);
    }
  }
  return out;
}

function syncSkillToProvider(skillName, provider) {
  const mainDir = join(ROOT, "skills", skillName);
  const providerDir = join(ROOT, "providers", provider, "skills", skillName);
  const fileResults = [];

  // Sync SKILL.md with description transform
  const skillStatus = syncFile(
    join(mainDir, "SKILL.md"),
    join(providerDir, "SKILL.md"),
    (content) => mirrorFileContent(content, provider, skillName, "SKILL.md")
  );
  fileResults.push({ file: "SKILL.md", status: skillStatus });

  // Sync companion files — verbatim copy, recursively.
  //
  // WHY RECURSIVE. This originally globbed only flat `*.md` at the skill root,
  // which matched the pre-`references/` layout. When progressive disclosure moved
  // companions into `references/` and `scripts/` subdirectories, this filter
  // silently stopped matching ANYTHING: the mirrors kept receiving regenerated
  // SKILL.md bodies full of `<ADEV_ROOT>/skills/<name>/references/...` pointers
  // while the files those pointers name were never copied. Both codex and
  // opencode symlink their mirror directory straight into user installs, so the
  // result was a skill whose sections were unreadable with no error surfaced.
  //
  // tests/sync/provider-skill-parity.test.mjs could not catch it, because it runs
  // THIS script in --dry-run and compares against its own output. A sync that
  // copies nothing reports no drift. tests/sync/provider-companion-parity.test.mjs
  // checks the property directly instead: every pointer in a mirror body resolves
  // inside that mirror tree.
  for (const companion of listCompanions(mainDir)) {
    const status = syncFile(join(mainDir, companion), join(providerDir, companion), (content) =>
      mirrorFileContent(content, provider, skillName, companion)
    );
    fileResults.push({ file: companion, status });
  }

  // Codex requires agents/openai.yaml for each skill
  if (provider === "codex") {
    const agentYamlPath = join(providerDir, "agents", "openai.yaml");
    if (!writable(agentYamlPath)) {
      fileResults.push({ file: "agents/openai.yaml", status: "refused" });
    } else if (!existsSync(agentYamlPath)) {
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

if (refused.size > 0) {
  for (const link of refused) console.error(`sync-provider-skills: refusing to write through a symlink: ${link}`);
  process.exit(1);
}
