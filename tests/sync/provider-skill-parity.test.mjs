// Parity guard for the provider skill mirrors.
//
// The canonical skills/ directory is the single source of truth; the Codex
// and OpenCode mirrors under providers/<name>/skills/ are generated from it
// by scripts/sync-provider-skills.mjs (canonical content + a provider-specific
// description suffix). Companions can live at any depth under a skill
// directory (references/, scripts/, checks/, adapters/, etc.).
//
// This suite walks the canonical tree and each mirror tree independently and
// compares them directly — it does NOT invoke sync-provider-skills.mjs. A
// test built on the script's own --dry-run output can only ever confirm "the
// mirrors match what the script would produce"; it cannot detect a defect IN
// the script itself (e.g. a companion-discovery glob that stops matching
// once files move into a subdirectory), because a script that silently
// copies nothing reports zero drift with maximum confidence. Comparing
// against the canonical filesystem directly closes that gap.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILLS_DIR = join(PLUGIN_ROOT, "skills");
const PROVIDERS_DIR = join(PLUGIN_ROOT, "providers");
const PROVIDERS = ["codex", "opencode"];

function listMarkdownFiles(rootDir, relDir = "") {
  const entries = readdirSync(join(rootDir, relDir), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relPath = relDir ? join(relDir, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...listMarkdownFiles(rootDir, relPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(relPath);
    }
  }
  return files;
}

function canonicalSkillNames() {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("adev-"))
    .map((d) => d.name)
    .filter((name) => existsSync(join(SKILLS_DIR, name, "SKILL.md")));
}

// The description line is the one line the sync script is allowed to change
// (it appends a provider-specific invocation suffix); every other line, and
// every companion file, must be byte-identical to canonical.
function stripDescriptionLine(content) {
  return content.replace(/^description:\s*".*?"\s*$/m, "description: <redacted>");
}

for (const skillName of canonicalSkillNames()) {
  const canonicalDir = join(SKILLS_DIR, skillName);
  const canonicalFiles = listMarkdownFiles(canonicalDir);

  for (const provider of PROVIDERS) {
    const mirrorDir = join(PROVIDERS_DIR, provider, "skills", skillName);
    if (!existsSync(mirrorDir)) continue; // skill intentionally excluded for this provider

    test(`${provider} mirror of ${skillName} has every canonical file`, () => {
      const missing = canonicalFiles.filter(
        (relPath) => !existsSync(join(mirrorDir, relPath)),
      );
      assert.deepEqual(
        missing,
        [],
        `providers/${provider}/skills/${skillName} is missing: ${missing.join(", ")}. ` +
          `Run \`node scripts/sync-provider-skills.mjs\` and commit the result.`,
      );
    });

    test(`${provider} mirror of ${skillName} content matches canonical`, () => {
      for (const relPath of canonicalFiles) {
        const mirrorPath = join(mirrorDir, relPath);
        if (!existsSync(mirrorPath)) continue; // reported by the coverage test above

        const canonicalContent = readFileSync(join(canonicalDir, relPath), "utf8");
        const mirrorContent = readFileSync(mirrorPath, "utf8");

        if (relPath === "SKILL.md") {
          assert.equal(
            stripDescriptionLine(mirrorContent),
            stripDescriptionLine(canonicalContent),
            `providers/${provider}/skills/${skillName}/SKILL.md has drifted from canonical outside the description line`,
          );
        } else {
          assert.equal(
            mirrorContent,
            canonicalContent,
            `providers/${provider}/skills/${skillName}/${relPath} has drifted from canonical`,
          );
        }
      }
    });
  }
}

test("provider mirrors carry no extra companion files absent from canonical", () => {
  const extras = [];
  for (const skillName of canonicalSkillNames()) {
    const canonicalFiles = new Set(listMarkdownFiles(join(SKILLS_DIR, skillName)));
    for (const provider of PROVIDERS) {
      const mirrorDir = join(PROVIDERS_DIR, provider, "skills", skillName);
      if (!existsSync(mirrorDir)) continue;
      for (const relPath of listMarkdownFiles(mirrorDir)) {
        if (!canonicalFiles.has(relPath)) {
          extras.push(join("providers", provider, "skills", skillName, relPath));
        }
      }
    }
  }
  assert.deepEqual(extras, []);
});

// Every skill-relative markdown pointer a mirror body names (e.g.
// `skills/validate/checks/validate.check-8-boundaries.md` or
// `plugin:validate/checks/<id>.md` with a concrete id substituted) must
// resolve to a real file inside that same mirror's own tree, not merely in
// canonical — this is the direction that actually broke when companions
// moved into checks/references/ and the flat glob stopped seeing them.
test("pointers inside provider mirror bodies resolve inside that mirror", () => {
  const unresolved = [];
  for (const skillName of canonicalSkillNames()) {
    const pointerPattern = new RegExp(
      `(?:plugin:|skills/)${skillName}/([\\w./-]+\\.md)`,
      "g",
    );
    for (const provider of PROVIDERS) {
      const mirrorDir = join(PROVIDERS_DIR, provider, "skills", skillName);
      if (!existsSync(mirrorDir)) continue;
      for (const relPath of listMarkdownFiles(mirrorDir)) {
        const content = readFileSync(join(mirrorDir, relPath), "utf8");
        for (const match of content.matchAll(pointerPattern)) {
          const pointedPath = match[1];
          if (pointedPath.includes("<")) continue; // templated id, not a concrete path
          if (!existsSync(join(mirrorDir, pointedPath))) {
            unresolved.push(
              `providers/${provider}/skills/${skillName}/${relPath} -> ${pointedPath}`,
            );
          }
        }
      }
    }
  }
  assert.deepEqual(unresolved, []);
});
