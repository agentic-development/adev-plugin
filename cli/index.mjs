#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, chmodSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { createInterface } from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = resolve(__dirname, "..");
const PLUGIN_NAME = "adev";
const PLUGIN_VERSION = JSON.parse(
  readFileSync(join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), "utf8")
).version;

// ── Helpers ──────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`  ${msg}`);
}

function success(msg) {
  console.log(`  ✓ ${msg}`);
}

function warn(msg) {
  console.log(`  ⚠ ${msg}`);
}

function error(msg) {
  console.error(`  ✗ ${msg}`);
}

function heading(msg) {
  console.log(`\n  ${msg}\n`);
}

async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`  ${question} `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function ensureDir(path) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

// ── Plugin Installation ─────────────────────────────────────────────────

function getClaudeHome() {
  return join(process.env.HOME || process.env.USERPROFILE, ".claude");
}

function installPlugin() {
  const claudeHome = getClaudeHome();
  const cacheDir = join(claudeHome, "plugins", "cache", "agentic-development", PLUGIN_NAME, PLUGIN_VERSION);

  if (existsSync(cacheDir)) {
    log(`Plugin already installed at ${cacheDir}`);
    return { installed: false, path: cacheDir };
  }

  ensureDir(dirname(cacheDir));
  cpSync(PLUGIN_ROOT, cacheDir, {
    recursive: true,
    filter: (src) => {
      const name = src.split("/").pop();
      return name !== ".git" && name !== "node_modules" && name !== ".DS_Store";
    },
  });

  // Make hooks executable
  const hooksDir = join(cacheDir, "hooks");
  if (existsSync(hooksDir)) {
    for (const file of ["session-start.sh", "constitution-linter.sh", "sync-trigger.sh"]) {
      const hookPath = join(hooksDir, file);
      if (existsSync(hookPath)) {
        chmodSync(hookPath, 0o755);
      }
    }
  }

  return { installed: true, path: cacheDir };
}

function enablePlugin(scope = "user") {
  const claudeHome = getClaudeHome();
  let settingsPath;

  if (scope === "user") {
    settingsPath = join(claudeHome, "settings.json");
  } else {
    settingsPath = join(process.cwd(), ".claude", "settings.json");
  }

  const settings = readJson(settingsPath) || {};
  if (!settings.enabledPlugins) {
    settings.enabledPlugins = {};
  }

  settings.enabledPlugins["adev@agentic-development"] = true;
  ensureDir(dirname(settingsPath));
  writeJson(settingsPath, settings);

  return settingsPath;
}

// ── Conflict Detection ──────────────────────────────────────────────────

function detectConflicts() {
  const claudeHome = getClaudeHome();
  const userSettings = readJson(join(claudeHome, "settings.json")) || {};
  const projectSettingsPath = join(process.cwd(), ".claude", "settings.json");
  const projectSettings = readJson(projectSettingsPath) || {};

  const conflicts = [];
  const enabled = {
    ...userSettings.enabledPlugins,
    ...projectSettings.enabledPlugins,
  };

  if (enabled["superpowers@claude-plugins-official"] === true) {
    // Check if already disabled at project level
    if (projectSettings.enabledPlugins?.["superpowers@claude-plugins-official"] !== false) {
      conflicts.push({
        name: "superpowers",
        key: "superpowers@claude-plugins-official",
        reason: "Overlapping brainstorming, planning, TDD, and code review workflows",
      });
    }
  }

  return conflicts;
}

function disableConflictingPlugin(pluginKey) {
  const settingsPath = join(process.cwd(), ".claude", "settings.json");
  const settings = readJson(settingsPath) || {};
  if (!settings.enabledPlugins) {
    settings.enabledPlugins = {};
  }
  settings.enabledPlugins[pluginKey] = false;
  ensureDir(dirname(settingsPath));
  writeJson(settingsPath, settings);
}

// ── Scaffold ────────────────────────────────────────────────────────────

function scaffoldContextKit() {
  const root = join(process.cwd(), ".context-kit");
  const created = [];

  const dirs = [
    "",
    "specs",
    "specs/cross-cutting",
    "specs/features",
    "adrs",
    "samples",
    "orientation",
    "specialists",
    "hygiene",
  ];

  for (const dir of dirs) {
    const path = join(root, dir);
    if (!existsSync(path)) {
      ensureDir(path);
      created.push(dir || ".context-kit/");
    }
  }

  // Copy templates
  const templates = [
    { src: "constitution-template.md", dest: "constitution.md" },
    { src: "manifest-template.yaml", dest: "manifest.yaml" },
    { src: "adr-template.md", dest: "adrs/.template.md" },
    { src: "charter-template.md", dest: "specs/features/.charter-template.md" },
    { src: "live-spec-template.md", dest: "specs/features/.live-spec-template.md" },
    { src: "refactoring-spec-template.md", dest: "specs/features/.refactoring-spec-template.md" },
  ];

  const templatesDir = join(PLUGIN_ROOT, "templates");
  for (const { src, dest } of templates) {
    const destPath = join(root, dest);
    if (!existsSync(destPath) && existsSync(join(templatesDir, src))) {
      cpSync(join(templatesDir, src), destPath);
      created.push(dest);
    }
  }

  // Add hygiene/ to .gitignore
  const gitignorePath = join(process.cwd(), ".gitignore");
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, "utf8");
    if (!content.includes(".context-kit/hygiene")) {
      writeFileSync(gitignorePath, content.trimEnd() + "\n\n# adev context kit\n.context-kit/hygiene/\n");
      created.push(".gitignore (updated)");
    }
  } else {
    writeFileSync(gitignorePath, "# adev context kit\n.context-kit/hygiene/\n");
    created.push(".gitignore (created)");
  }

  return created;
}

// ── Commands ────────────────────────────────────────────────────────────

async function cmdInit() {
  console.log();
  console.log("  adev — Agentic Development Framework");
  console.log("  ─────────────────────────────────────");

  // Step 1: Install plugin
  heading("Step 1: Install Plugin");

  const { installed, path: pluginPath } = installPlugin();
  if (installed) {
    success(`Plugin v${PLUGIN_VERSION} installed to ${pluginPath}`);
  } else {
    success(`Plugin v${PLUGIN_VERSION} already installed`);
  }

  // Step 2: Enable in Claude Code settings
  heading("Step 2: Enable Plugin");

  const answer = await ask("Install for all projects (user) or this project only (project)? [user/project]");
  const scope = answer === "project" ? "project" : "user";
  const settingsPath = enablePlugin(scope);
  success(`Plugin enabled in ${settingsPath}`);

  // Step 3: Detect conflicts
  heading("Step 3: Check for Conflicts");

  const conflicts = detectConflicts();
  if (conflicts.length === 0) {
    success("No conflicting plugins detected");
  } else {
    for (const conflict of conflicts) {
      warn(`${conflict.name} — ${conflict.reason}`);
      const disable = await ask(`Disable ${conflict.name} for THIS project? (yes/no)`);
      if (disable === "yes" || disable === "y") {
        disableConflictingPlugin(conflict.key);
        success(`${conflict.name} disabled for this project (stays installed globally)`);
      } else {
        warn(`${conflict.name} will remain active. You may see duplicate skill suggestions.`);
      }
    }
  }

  // Step 4: Scaffold .context-kit/
  heading("Step 4: Scaffold .context-kit/");

  if (existsSync(join(process.cwd(), ".context-kit"))) {
    log(".context-kit/ already exists, skipping scaffold");
  } else {
    const scaffold = await ask("Create .context-kit/ directory with templates? (yes/no)");
    if (scaffold === "yes" || scaffold === "y") {
      const created = scaffoldContextKit();
      for (const item of created) {
        success(item);
      }
    } else {
      log("Skipped. Run /adev-init inside Claude Code to scaffold later.");
    }
  }

  // Done
  heading("Done!");
  log("Start a new Claude Code session to load the plugin:");
  console.log();
  log("  claude");
  console.log();
  log("Then run the interactive setup wizard:");
  console.log();
  log("  /adev-init");
  console.log();
  log("This will generate your constitution, detect your tech stack,");
  log("create orientation docs, and sync everything to CLAUDE.md.");
  console.log();
}

async function cmdUninstall() {
  heading("Uninstalling adev plugin");

  const claudeHome = getClaudeHome();

  // Remove from user settings
  const userSettingsPath = join(claudeHome, "settings.json");
  const userSettings = readJson(userSettingsPath);
  if (userSettings?.enabledPlugins?.["adev@agentic-development"] !== undefined) {
    delete userSettings.enabledPlugins["adev@agentic-development"];
    writeJson(userSettingsPath, userSettings);
    success("Removed from user settings");
  }

  // Remove from project settings
  const projectSettingsPath = join(process.cwd(), ".claude", "settings.json");
  const projectSettings = readJson(projectSettingsPath);
  if (projectSettings?.enabledPlugins?.["adev@agentic-development"] !== undefined) {
    delete projectSettings.enabledPlugins["adev@agentic-development"];
    // Re-enable superpowers if it was disabled
    if (projectSettings.enabledPlugins["superpowers@claude-plugins-official"] === false) {
      delete projectSettings.enabledPlugins["superpowers@claude-plugins-official"];
      success("Re-enabled Superpowers for this project");
    }
    writeJson(projectSettingsPath, projectSettings);
    success("Removed from project settings");
  }

  // Remove cached plugin
  const cacheDir = join(claudeHome, "plugins", "cache", "agentic-development");
  if (existsSync(cacheDir)) {
    execSync(`rm -rf "${cacheDir}"`);
    success("Removed cached plugin files");
  }

  log(".context-kit/ directory was NOT removed (your project context is preserved).");
  console.log();
}

function cmdHelp() {
  console.log(`
  adev — Agentic Development Framework CLI

  Usage:
    npx adev-cli init        Install plugin + scaffold .context-kit/
    npx adev-cli uninstall   Remove plugin from Claude Code settings
    npx adev-cli help        Show this help

  After init, start Claude Code and run /adev-init for the
  interactive setup wizard.

  Repository: https://github.com/agentic-development/adev-plugin
  `);
}

// ── Main ────────────────────────────────────────────────────────────────

const command = process.argv[2] || "help";

switch (command) {
  case "init":
    await cmdInit();
    break;
  case "uninstall":
    await cmdUninstall();
    break;
  case "help":
  case "--help":
  case "-h":
    cmdHelp();
    break;
  default:
    error(`Unknown command: ${command}`);
    cmdHelp();
    process.exit(1);
}
