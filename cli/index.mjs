#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";
import { getProvider, getProviderNames } from "../lib/provider/registry.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = resolve(__dirname, "..");
const PLUGIN_VERSION = JSON.parse(
  readFileSync(join(PLUGIN_ROOT, "package.json"), "utf8")
).version;

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

function ensureDir(path) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function parseProviderFlags() {
  const providers = [];
  const argv = process.argv;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--provider" && argv[i + 1]) {
      const p = argv[i + 1];
      if (!getProviderNames().includes(p)) {
        error(`Unknown provider: ${p}`);
        error(`Available: ${getProviderNames().join(", ")}`);
        process.exit(1);
      }
      providers.push(p);
      i++;
    }
  }
  return providers;
}

async function selectProviders() {
  const explicitProviders = parseProviderFlags();
  if (explicitProviders.length > 0) {
    return explicitProviders;
  }

  console.log("  Which AI coding assistant(s) do you want to use?\n");
  console.log("    [1] Claude Code only (default)");
  console.log("    [2] OpenCode only");
  console.log("    [3] Both Claude Code and OpenCode\n");

  const answer = await ask("Enter choice (1-3) [1]: ");

  switch (answer) {
    case "2":
      return ["opencode"];
    case "3":
      return ["claude-code", "opencode"];
    default:
      return ["claude-code"];
  }
}

function scaffoldContextKit() {
  const root = join(process.cwd(), ".context-index");
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
      created.push(dir || ".context-index/");
    }
  }

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

  const gitignorePath = join(process.cwd(), ".gitignore");
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, "utf8");
    if (!content.includes(".context-index/hygiene")) {
      writeFileSync(gitignorePath, content.trimEnd() + "\n\n# adev context index\n.context-index/hygiene/\n");
      created.push(".gitignore (updated)");
    }
  } else {
    writeFileSync(gitignorePath, "# adev context index\n.context-index/hygiene/\n");
    created.push(".gitignore (created)");
  }

  return created;
}

async function handleDualSyncTargets(providerNames) {
  if (providerNames.length < 2) return;

  const manifestPath = join(process.cwd(), ".context-index", "manifest.yaml");

  if (!existsSync(manifestPath)) {
    log("Configuring sync targets for dual setup...");
    const templateContent = readFileSync(join(PLUGIN_ROOT, "templates", "manifest-template.yaml"), "utf8");
    const dualContent = templateContent.replace(
      /# Claude Code.*?# OpenCode.*?# Cursor.*?# GitHub Copilot/s,
      `# Claude Code (primary)
    - path: CLAUDE.md
      format: claude
      providers: [claude-code]

    # OpenCode (primary)
    - path: AGENTS.md
      format: agents
      providers: [opencode]

    # Cursor
    # - path: .cursorrules
    #   format: cursor
    #   providers: [cursor]

    # GitHub Copilot
    # - path: .github/copilot-instructions.md
    #   format: copilot
    #   providers: [copilot]`
    );
    writeFileSync(manifestPath, dualContent);
    success("Added both CLAUDE.md and AGENTS.md sync targets");
  } else {
    console.log("\n  Dual-setup detected.");
    console.log("  [1] Sync to both CLAUDE.md and AGENTS.md (default)");
    console.log("  [2] Sync to CLAUDE.md only");
    console.log("  [3] Sync to AGENTS.md only\n");

    const choice = await ask("Enter choice (1-3) [1]: ");
    updateManifestSyncTargets(manifestPath, choice);
  }
}

function updateManifestSyncTargets(manifestPath, choice) {
  let content = readFileSync(manifestPath, "utf8");

  const hasClaude = content.includes("path: CLAUDE.md");
  const hasAgents = content.includes("path: AGENTS.md");

  if (choice === "2" && hasAgents) {
    content = content.replace(/- path: AGENTS\.md[\s\S]*?providers: \[opencode\]\n\n?/m, "");
    writeFileSync(manifestPath, content);
    success("Removed AGENTS.md sync target");
  } else if (choice === "3" && hasClaude) {
    content = content.replace(/- path: CLAUDE\.md[\s\S]*?providers: \[claude-code\]\n\n?/m, "");
    writeFileSync(manifestPath, content);
    success("Removed CLAUDE.md sync target");
  }
}

async function cmdInit() {
  console.log();
  console.log("  adev — Agentic Development Framework");
  console.log("  ─────────────────────────────────────");
  console.log();

  const providerNames = await selectProviders();

  for (const providerName of providerNames) {
    const provider = getProvider(providerName);
    heading(`Installing for ${provider.name}`);

    const { installed, path: pluginPath } = await provider.install();
    if (installed) {
      success(`Plugin v${PLUGIN_VERSION} installed to ${pluginPath}`);
    } else {
      success(`Plugin v${PLUGIN_VERSION} already installed`);
    }

    if (providerName === "claude-code") {
      const scope = await ask("Install for all projects (user) or this project only (project)? [user/project]");
      const settingsPath = provider.enable(scope === "project" ? "project" : "user");
      success(`Plugin enabled in ${settingsPath}`);

      const conflicts = provider.detectConflicts();
      if (conflicts.length === 0) {
        success("No conflicting plugins detected");
      } else {
        for (const conflict of conflicts) {
          warn(`${conflict.name} — ${conflict.reason}`);
          const disable = await ask(`Disable ${conflict.name} for THIS project? (yes/no)`);
          if (disable === "yes" || disable === "y") {
            provider.disableConflictingPlugin(conflict.key);
            success(`${conflict.name} disabled for this project`);
          }
        }
      }
    } else {
      log("Plugin installed. Skills are available.");
      log("Add to opencode.json if not using the plugin cache:");
      console.log();
      log('  "plugin": ["@adev/opencode"]');
      console.log();
    }
  }

  const scaffoldChoice = await ask("Scaffold .context-index/ with templates? (yes/no)");
  if (scaffoldChoice === "yes" || scaffoldChoice === "y") {
    const created = scaffoldContextKit();
    for (const item of created) {
      success(item);
    }
    await handleDualSyncTargets(providerNames);
  } else {
    log("Skipped. Run /adev-init to scaffold later.");
    await handleDualSyncTargets(providerNames);
  }

  heading("Done!");
  console.log();
  log("Next steps:");
  console.log();
  if (providerNames.includes("claude-code")) {
    log("  claude");
    log("  /adev-init");
  }
  if (providerNames.includes("opencode")) {
    log("  opencode");
    log("  /adev-init");
  }
  console.log();
  log("Repository: https://github.com/agentic-development/adev-plugin");
  console.log();
}

async function cmdUninstall() {
  const providerNames = await selectProviders();

  for (const providerName of providerNames) {
    const provider = getProvider(providerName);
    heading(`Uninstalling from ${provider.name}`);
    await provider.uninstall();
    success(`Uninstalled from ${provider.name}`);
  }

  log(".context-index/ directory was NOT removed (your project context is preserved).");
  console.log();
}

function cmdHelp() {
  console.log(`
  adev — Agentic Development Framework CLI

  Usage:
    npx adev-cli init              Interactive wizard (default: Claude Code)
    npx adev-cli uninstall        Uninstall plugin(s)

  Provider Selection:
    --provider claude-code        Install for Claude Code only
    --provider opencode           Install for OpenCode only
    --provider claude-code --provider opencode  Install for both

  Examples:
    npx adev-cli init                          # Claude Code (default)
    npx adev-cli init --provider opencode      # OpenCode only
    npx adev-cli init --provider both          # Both providers
    npx adev-cli uninstall                     # Remove from selected providers

  Repository: https://github.com/agentic-development/adev-plugin
  `);
}

export {
  scaffoldContextKit,
  PLUGIN_ROOT,
  PLUGIN_VERSION,
  selectProviders,
};

// Re-export Claude Code adapter functions for backward compatibility
export const enablePlugin = getProvider("claude-code").enable;
export const detectConflicts = getProvider("claude-code").detectConflicts;
export const disableConflictingPlugin = getProvider("claude-code").disableConflictingPlugin;

const isDirectRun =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(__filename);

if (isDirectRun) {
  const command = process.argv[2] || "help";

  (async () => {
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
  })();
}
