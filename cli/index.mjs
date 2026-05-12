#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, chmodSync, realpathSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { createInterface } from "readline";
import { getProvider, getProviderNames } from "../lib/provider/registry.mjs";
import { resolveExtensionSource } from "../lib/extensions/resolve-source.mjs";
import { installExtension, readManifestStamps } from "../lib/extensions/install.mjs";

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
  console.log("    [3] OpenAI Codex only");
  console.log("    [4] Claude Code and OpenCode");
  console.log("    [5] Claude Code and OpenAI Codex");
  console.log("    [6] All three providers\n");

  const answer = await ask("Enter choice (1-6) [1]: ");

  switch (answer) {
    case "2":
      return ["opencode"];
    case "3":
      return ["codex"];
    case "4":
      return ["claude-code", "opencode"];
    case "5":
      return ["claude-code", "codex"];
    case "6":
      return ["claude-code", "opencode", "codex"];
    default:
      return ["claude-code"];
  }
}

/**
 * Detect the project state for init routing.
 * @returns {{ mode: 'greenfield'|'brownfield-no-adev'|'brownfield-outdated'|'brownfield-current', version: string|null, hasGit: boolean, hasCode: boolean }}
 */
function detectProjectState() {
  const cwd = process.cwd();
  const contextIndex = join(cwd, ".context-index");
  const manifestPath = join(contextIndex, "manifest.yaml");
  const hasGit = existsSync(join(cwd, ".git"));
  // Heuristic: has code if package.json, Cargo.toml, go.mod, pyproject.toml, or src/ exists
  const codeMarkers = ["package.json", "Cargo.toml", "go.mod", "pyproject.toml", "requirements.txt", "Gemfile", "pom.xml"];
  const hasCode = codeMarkers.some(m => existsSync(join(cwd, m))) || existsSync(join(cwd, "src"));

  if (!existsSync(contextIndex)) {
    return { mode: hasCode ? "brownfield-no-adev" : "greenfield", version: null, hasGit, hasCode };
  }

  // Context index exists — check version
  let installedVersion = null;
  if (existsSync(manifestPath)) {
    try {
      const manifest = readFileSync(manifestPath, "utf8");
      const vm = manifest.match(/adev_version:\s*["']?([^"'\s]+)/);
      if (vm) installedVersion = vm[1];
    } catch {}
  }

  if (!installedVersion) {
    // Has context-index but no version stamp — pre-versioning install
    return { mode: "brownfield-outdated", version: null, hasGit, hasCode };
  }

  if (installedVersion === PLUGIN_VERSION) {
    return { mode: "brownfield-current", version: installedVersion, hasGit, hasCode };
  }

  return { mode: "brownfield-outdated", version: installedVersion, hasGit, hasCode };
}

/**
 * Compute what needs upgrading between installed version and current.
 * @param {string|null} fromVersion
 * @returns {{ hooks: boolean, templates: boolean, provenance: boolean, description: string[] }}
 */
function computeUpgradeDelta(fromVersion) {
  const delta = { hooks: false, templates: false, provenance: false, description: [] };

  if (!fromVersion) {
    // Pre-versioning: everything is new
    delta.hooks = true;
    delta.templates = true;
    delta.provenance = true;
    delta.description.push("Git hooks (commit-msg lifecycle enforcement, trailer injection)");
    delta.description.push("Provenance tracking (Author-type, Operator, Spec trailers)");
    delta.description.push("Charter template (Deferred Capabilities table)");
    return delta;
  }

  // Parse semver for comparison
  const [fMaj, fMin] = fromVersion.split(".").map(Number);
  const [tMaj, tMin] = PLUGIN_VERSION.split(".").map(Number);

  // commit-msg hook added in 0.13.0
  if (fMaj === 0 && fMin < 13) {
    delta.hooks = true;
    delta.provenance = true;
    delta.description.push("commit-msg hook (lifecycle enforcement for manifest-claimed files)");
    delta.description.push("Provenance config (Author-type, Operator trailers + CI gate)");
    delta.description.push("Issue/Author-type/Operator trailers in prepare-commit-msg");
  }

  // Deferred Capabilities in charter template added in 0.13.0
  if (fMaj === 0 && fMin < 13) {
    delta.templates = true;
    delta.description.push("Charter template updated (Deferred Capabilities table)");
  }

  return delta;
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
    "sessions",
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
    { src: "context-index-readme.md", dest: "README.md" },
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
  const ephemeralEntries = [
    ".context-index/hygiene/",
    ".context-index/.token-cursor.json",
    ".context-index/.reminder-counter",
    ".context-index/.session-tracking.jsonl",
    ".context-index/user-config",
  ];
  if (existsSync(gitignorePath)) {
    let content = readFileSync(gitignorePath, "utf8");
    const missing = ephemeralEntries.filter((e) => !content.includes(e));
    if (missing.length) {
      const needsHeader = !content.includes(".context-index/hygiene");
      const block = (needsHeader ? "\n# adev context index\n" : "") + missing.join("\n") + "\n";
      content = content.trimEnd() + "\n" + block;
      writeFileSync(gitignorePath, content);
      created.push(".gitignore (updated)");
    }
  } else {
    writeFileSync(gitignorePath, "# adev context index\n" + ephemeralEntries.join("\n") + "\n");
    created.push(".gitignore (created)");
  }

  return created;
}

/**
 * Detect the current git core.hooksPath setting.
 * @returns {string|null} The configured hooks path, or null if unset / not a git repo.
 */
function getExistingHooksPath() {
  try {
    const raw = execSync("git config --get core.hooksPath", {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    return raw.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Generate a wrapper hook script that chains the adev hook with an existing one.
 * The adev hook runs first; if it exits non-zero (blocking), the original is skipped.
 * @param {string} adevHookPath - Relative path to the .adev hook variant.
 * @param {string} originalHookPath - Absolute or relative path to the original hook.
 * @param {string} hookName - The hook name (for the comment).
 * @returns {string} Shell script content.
 */
function buildChainedHook(adevHookPath, originalHookPath, hookName) {
  return `#!/usr/bin/env bash
# Chained ${hookName} — runs adev hook first, then the original.
# Auto-generated by adev init. Edit with care.

set -uo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"

# Run adev hook
if [ -x "$HOOK_DIR/${adevHookPath}" ]; then
  "$HOOK_DIR/${adevHookPath}" "$@"
  ADEV_EXIT=$?
  if [ $ADEV_EXIT -ne 0 ]; then
    exit $ADEV_EXIT
  fi
fi

# Run original hook
ORIGINAL="${originalHookPath}"
if [ -x "$ORIGINAL" ]; then
  "$ORIGINAL" "$@"
  exit $?
fi

exit 0
`;
}

/**
 * Set up git hooks in .githooks/ with conflict detection.
 * If core.hooksPath already points elsewhere, offers to chain hooks.
 * @returns {Promise<string[]>} List of created/updated items.
 */
async function setupGitHooks() {
  const created = [];
  const cwd = process.cwd();
  const githooksDir = join(cwd, ".githooks");
  const hookNames = ["pre-commit", "prepare-commit-msg", "commit-msg", "post-commit"];
  const pluginHooksDir = join(PLUGIN_ROOT, ".githooks");

  // Detect existing core.hooksPath
  const existingHooksPath = getExistingHooksPath();
  const isConflict = existingHooksPath && existingHooksPath !== ".githooks" && existingHooksPath !== ".githooks/";
  let chainFromPath = null;

  if (isConflict) {
    warn(`Existing core.hooksPath detected: ${existingHooksPath}`);
    console.log();
    console.log("  adev uses .githooks/ for git hooks (commit guards, spec trailers).");
    console.log(`  This project already uses ${existingHooksPath} (e.g. husky, lefthook).\n`);
    console.log("    [1] Chain hooks — run adev hooks first, then originals from " + existingHooksPath + " (default)");
    console.log("    [2] Replace — switch to .githooks/ and discard the old hooks path");
    console.log("    [3] Skip — don't install git hooks (Claude Code hooks still active)\n");

    const choice = await ask("Enter choice (1-3) [1]: ");

    if (choice === "3") {
      log("Skipped git hooks. Claude Code merge-guard hook is still active.");
      return created;
    }

    if (choice !== "2") {
      // Default: chain
      chainFromPath = resolve(cwd, existingHooksPath);
    }
  }

  ensureDir(githooksDir);

  for (const hookName of hookNames) {
    const srcPath = join(pluginHooksDir, hookName);
    const destPath = join(githooksDir, hookName);
    if (!existsSync(srcPath)) continue;

    const srcContent = readFileSync(srcPath);

    if (chainFromPath) {
      // Chaining mode: write adev hook as .adev variant, create wrapper
      const adevVariant = `${hookName}.adev`;
      const adevPath = join(githooksDir, adevVariant);
      const originalHookPath = join(chainFromPath, hookName);

      // Write the adev hook as the .adev variant
      const needsUpdate = !existsSync(adevPath) || Buffer.compare(srcContent, readFileSync(adevPath)) !== 0;
      if (needsUpdate) {
        cpSync(srcPath, adevPath);
        chmodSync(adevPath, 0o755);
        created.push(`.githooks/${adevVariant}`);
      }

      // Create chained wrapper (or update if it's not already a chained wrapper)
      if (existsSync(originalHookPath)) {
        const wrapper = buildChainedHook(adevVariant, originalHookPath, hookName);
        writeFileSync(destPath, wrapper);
        chmodSync(destPath, 0o755);
        created.push(`.githooks/${hookName} (chained with ${existingHooksPath}/${hookName})`);
      } else if (resolve(srcPath) !== resolve(destPath)) {
        // No original hook for this name — just install the adev hook directly
        cpSync(srcPath, destPath);
        chmodSync(destPath, 0o755);
        created.push(`.githooks/${hookName}`);
      }
    } else if (existsSync(destPath)) {
      // No chaining — standard conflict handling
      const destContent = readFileSync(destPath);
      if (Buffer.compare(srcContent, destContent) === 0) continue;

      const altPath = join(githooksDir, `${hookName}.adev`);
      if (existsSync(altPath)) {
        const altContent = readFileSync(altPath);
        if (Buffer.compare(srcContent, altContent) === 0) continue;
      }
      cpSync(srcPath, altPath);
      chmodSync(altPath, 0o755);
      created.push(`.githooks/${hookName}.adev (existing hook preserved)`);
      warn(`.githooks/${hookName} already exists — wrote ${hookName}.adev instead`);
    } else if (resolve(srcPath) !== resolve(destPath)) {
      cpSync(srcPath, destPath);
      chmodSync(destPath, 0o755);
      created.push(`.githooks/${hookName}`);
    }
  }

  // Set core.hooksPath to .githooks/ (skip if already set)
  const currentHooksPath = getExistingHooksPath();
  if (currentHooksPath !== ".githooks" && currentHooksPath !== ".githooks/") {
    try {
      execSync("git config core.hooksPath .githooks", {
        cwd,
        stdio: "ignore",
      });
      created.push("git config core.hooksPath .githooks");
    } catch {
      // Not a git repo or git not available — skip silently
    }
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

/**
 * Stamp adev_version in manifest.yaml.
 */
function stampVersion() {
  const manifestPath = join(process.cwd(), ".context-index", "manifest.yaml");
  if (!existsSync(manifestPath)) return;
  let manifest = readFileSync(manifestPath, "utf8");
  const versionLine = `adev_version: "${PLUGIN_VERSION}"`;
  if (manifest.includes("adev_version:")) {
    manifest = manifest.replace(/adev_version:\s*["']?[^"'\s\n]+["']?/, versionLine);
  } else {
    const projectMatch = manifest.match(/(project:\s*\n\s+name:\s*.+\n)/);
    if (projectMatch) {
      manifest = manifest.replace(projectMatch[1], projectMatch[1] + `  ${versionLine}\n`);
    } else {
      manifest = `${versionLine}\n${manifest}`;
    }
  }
  writeFileSync(manifestPath, manifest);
  success(`Stamped adev_version: ${PLUGIN_VERSION} in manifest.yaml`);
}

/**
 * Install providers (Claude Code, OpenCode, Codex).
 * @param {string[]} providerNames
 */
async function installProviders(providerNames) {
  for (const providerName of providerNames) {
    const provider = getProvider(providerName);
    heading(`Installing for ${provider.name}`);

    if (providerName === "claude-code") {
      const { installed, path: pluginPath } = await provider.install();
      if (installed) {
        success(`Plugin v${PLUGIN_VERSION} installed to ${pluginPath}`);
      } else {
        success(`Plugin v${PLUGIN_VERSION} already installed`);
      }

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
    } else if (providerName === "opencode") {
      const { installed, path: pluginPath } = await provider.install();
      if (installed) {
        success(`Plugin v${PLUGIN_VERSION} installed to ${pluginPath}`);
      } else {
        success(`Plugin v${PLUGIN_VERSION} already installed`);
      }

      const opencodeConfigPath = join(process.env.HOME || process.env.USERPROFILE, ".config", "opencode", "opencode.json");
      const opencodeConfigDir = join(process.env.HOME || process.env.USERPROFILE, ".config", "opencode");
      let config = { plugin: [] };

      if (existsSync(opencodeConfigPath)) {
        try {
          config = JSON.parse(readFileSync(opencodeConfigPath, "utf8"));
        } catch {}
      }

      const pluginEntry = `file://${pluginPath}/providers/opencode`;
      if (!config.plugin) {
        config.plugin = [];
      }

      const alreadyAdded = config.plugin.some(p =>
        p.includes("adev") || p.includes("adev-plugin") || p === pluginEntry
      );

      if (!alreadyAdded) {
        config.plugin.push(pluginEntry);
        ensureDir(opencodeConfigDir);
        writeFileSync(opencodeConfigPath, JSON.stringify(config, null, 2) + "\n");
        success(`Registered plugin in ${opencodeConfigPath}`);
      } else {
        success("Plugin already registered in opencode.json");
      }

      log("Skills are available via ~/.config/opencode/skills/");
    } else if (providerName === "codex") {
      const scope = await ask("Install Codex skills for all projects (user) or this project only (project)? [user/project]");
      const targetScope = scope === "project" ? "project" : "user";
      const { installed, path: pluginPath } = await provider.install({ scope: targetScope });
      if (installed) {
        success(`Plugin v${PLUGIN_VERSION} installed to ${pluginPath}`);
      } else {
        success(`Plugin v${PLUGIN_VERSION} already installed`);
      }

      const skillsPath = provider.enable(targetScope);
      success(`Codex skills linked in ${skillsPath}`);
    }
  }
}

async function cmdInstall() {
  console.log();
  console.log("  adev — Agentic Development Framework");
  console.log("  ─────────────────────────────────────");
  console.log();

  // --- Detect project state ---
  const state = detectProjectState();

  if (state.mode === "brownfield-outdated" || state.mode === "brownfield-current") {
    log(`Detected: existing adev install (v${state.version || "pre-versioning"})`);
    log("Use `npx @adev-org/adev-cli@latest upgrade` to update to the latest version.");
    console.log();
    return;
  }

  if (state.mode === "greenfield") {
    log("Detected: new project (no existing code or context index)");
  } else if (state.mode === "brownfield-no-adev") {
    log("Detected: existing project without adev");
  }

  console.log();

  // --- Provider installation ---
  const providerNames = await selectProviders();
  await installProviders(providerNames);

  // --- Minimal context index scaffolding ---
  heading("Context Index");
  const scaffoldCreated = scaffoldContextKit();
  if (scaffoldCreated.length > 0) {
    for (const item of scaffoldCreated) {
      success(item);
    }
  } else {
    log("All context files present.");
  }

  // --- Stamp adev_version in manifest ---
  stampVersion();

  // --- Git hooks ---
  heading("Git Hooks");
  const hookItems = await setupGitHooks();
  if (hookItems.length > 0) {
    for (const item of hookItems) {
      success(item);
    }
  } else {
    log("Git hooks already up to date.");
  }

  // --- Summary ---
  heading(`Done! Plugin installed — adev v${PLUGIN_VERSION}.`);

  log("Next steps:");
  console.log();
  if (providerNames.includes("claude-code")) {
    log("  1. Open Claude Code:  claude");
    log("  2. Configure context: /adev:init");
    log("  3. Start working:     /adev:work");
  }
  if (providerNames.includes("opencode")) {
    log("  1. Open OpenCode:     opencode");
    log("  2. Configure context: /adev:init");
  }
  if (providerNames.includes("codex")) {
    log("  1. Open Codex:        codex");
    log("  2. Configure context: $adev:init");
  }
  console.log();
  log("/adev:init walks you through constitution, governance, and project setup.");
  console.log();
  log("Docs:       https://agentic-dev.org");
  log("Repository: https://github.com/agentic-development/adev-plugin");
  console.log();
}

async function cmdUpgrade() {
  console.log();
  console.log("  adev — Agentic Development Framework");
  console.log("  ─────────────────────────────────────");
  console.log();

  const state = detectProjectState();

  if (state.mode === "greenfield" || state.mode === "brownfield-no-adev") {
    log("No existing adev installation found.");
    log("Use `npx @adev-org/adev-cli install` for first-time setup.");
    console.log();
    return;
  }

  if (state.mode === "brownfield-current") {
    log(`adev v${state.version} is already current.`);
    log("Checking for missing components...");
    console.log();
  } else {
    const fromLabel = state.version || "pre-versioning";
    log(`Upgrading from v${fromLabel} to v${PLUGIN_VERSION}`);
    const delta = computeUpgradeDelta(state.version);
    if (delta.description.length > 0) {
      console.log();
      log("New in v" + PLUGIN_VERSION + ":");
      for (const d of delta.description) {
        log(`  + ${d}`);
      }
    }
    console.log();
    const proceed = await ask(`Proceed with upgrade? (yes/no) [yes]`);
    if (proceed === "no" || proceed === "n") {
      log("Upgrade skipped.");
      return;
    }
  }

  // --- Re-install providers ---
  heading("Providers");
  const providerNames = await selectProviders();
  await installProviders(providerNames);

  // --- Fill in missing scaffold files ---
  heading("Context Index");
  const scaffoldCreated = scaffoldContextKit();
  if (scaffoldCreated.length > 0) {
    log("Added missing files:");
    for (const item of scaffoldCreated) {
      success(item);
    }
  } else {
    log("All context files present.");
  }

  // --- Stamp adev_version ---
  stampVersion();

  // --- Provenance config ---
  const manifestPath = join(process.cwd(), ".context-index", "manifest.yaml");
  const delta = computeUpgradeDelta(state.version);
  if (delta.provenance && existsSync(manifestPath)) {
    let manifest = readFileSync(manifestPath, "utf8");
    if (!manifest.includes("provenance:")) {
      heading("Provenance Tracking");
      log("Adds Author-type + Operator trailers to every commit.");
      log("CI gate rejects commits missing trailers on PRs.");
      console.log();
      const enableProv = await ask("Enable provenance enforcement? (yes/no) [yes]");
      if (enableProv !== "no" && enableProv !== "n") {
        const provenanceBlock = [
          "",
          "# ============================================================================",
          "# Provenance Tracking",
          "# ============================================================================",
          "",
          "provenance:",
          "  require_hooks: true",
          "  required_trailers:",
          "    - Author-type",
          "    - Operator",
          "",
        ].join("\n");
        if (manifest.includes("tasks:")) {
          manifest = manifest.replace(/\ntasks:/, provenanceBlock + "tasks:");
        } else {
          manifest += provenanceBlock;
        }
        writeFileSync(manifestPath, manifest);
        success("Added provenance config to manifest.yaml");
      } else {
        log("Skipped. Add manually later under provenance: in manifest.yaml");
      }
    }
  }

  // --- Git hooks ---
  heading("Git Hooks");
  const hookItems = await setupGitHooks();
  if (hookItems.length > 0) {
    for (const item of hookItems) {
      success(item);
    }
  } else {
    log("Git hooks already up to date.");
  }

  // --- Dual sync targets ---
  await handleDualSyncTargets(providerNames);

  // --- Summary ---
  const fromLabel = state.version || "pre-versioning";
  if (state.mode === "brownfield-outdated") {
    heading(`Done! Upgraded from v${fromLabel} to v${PLUGIN_VERSION}.`);
  } else {
    heading(`Done! adev v${PLUGIN_VERSION} is up to date.`);
  }

  log("Next steps:");
  console.log();
  log("  1. Run /adev:init to review and update project configuration");
  log("  2. Run /adev:hygiene to check context health");
  log("  3. Run /adev:sync to update agent files");
  console.log();
  log("Docs:       https://agentic-dev.org");
  log("Repository: https://github.com/agentic-development/adev-plugin");
  console.log();
}

async function cmdUninstall() {
  const providerNames = await selectProviders();

  for (const providerName of providerNames) {
    const provider = getProvider(providerName);
    heading(`Uninstalling from ${provider.name}`);

    if (providerName === "codex") {
      const scope = await ask("Remove Codex skills for all projects (user) or this project only (project)? [user/project]");
      await provider.uninstall({ scope: scope === "project" ? "project" : "user" });
    } else {
      await provider.uninstall();
    }

    success(`Uninstalled from ${provider.name}`);
  }

  log(".context-index/ directory was NOT removed (your project context is preserved).");
  console.log();
}

async function cmdExtension() {
  const subcommand = process.argv[3];

  switch (subcommand) {
    case "install": {
      const source = process.argv[4];
      if (!source) {
        error("Missing source argument.");
        log("Usage: npx adev-cli extension install <source>");
        log("  <source> can be a local path, npm package, or git URL.");
        process.exit(1);
      }

      try {
        const resolved = await resolveExtensionSource(source);
        const projectRoot = process.cwd();
        const report = await installExtension(resolved.resolved_path, projectRoot, {
          pluginRoot: PLUGIN_ROOT,
          sourceUri: source,
          _tmpDir: resolved._tmpDir,
        });

        heading("Extension Installed");
        success(`${report.name} v${report.version}`);

        if (report.filesWritten.length > 0) {
          log("Files written:");
          for (const f of report.filesWritten) {
            log(`  ${f}`);
          }
        }
        if (report.mergesApplied.length > 0) {
          log("Merges applied:");
          for (const m of report.mergesApplied) {
            log(`  ${m}`);
          }
        }
      } catch (err) {
        error(err.message);
        process.exit(1);
      }
      break;
    }

    case "list": {
      const projectRoot = process.cwd();
      const manifestPath = join(projectRoot, ".context-index", "manifest.yaml");
      if (!existsSync(manifestPath)) {
        error("manifest.yaml not found. Run /adev:init first.");
        process.exit(1);
      }

      const stamps = readManifestStamps(projectRoot);
      if (stamps.length === 0) {
        log("No extensions installed.");
        return;
      }

      heading("Installed Extensions");
      // Table header
      const nameW = Math.max(4, ...stamps.map(s => s.name.length));
      const verW = Math.max(7, ...stamps.map(s => (s.version || "").length));
      const dateW = Math.max(9, ...stamps.map(s => (s.installed_date || "").slice(0, 10).length));
      const srcW = Math.max(6, ...stamps.map(s => (s.source_uri || "").length));

      const header = `${"Name".padEnd(nameW)}  ${"Version".padEnd(verW)}  ${"Installed".padEnd(dateW)}  Source`;
      const sep = `${"─".repeat(nameW)}  ${"─".repeat(verW)}  ${"─".repeat(dateW)}  ${"─".repeat(srcW)}`;
      log(header);
      log(sep);

      for (const s of stamps) {
        const date = (s.installed_date || "").slice(0, 10);
        log(`${s.name.padEnd(nameW)}  ${(s.version || "").padEnd(verW)}  ${date.padEnd(dateW)}  ${s.source_uri || ""}`);
      }
      break;
    }

    default:
      log("Usage: npx adev-cli extension <subcommand>");
      log("");
      log("Subcommands:");
      log("  install <source>   Install an extension from a local path, npm package, or git URL");
      log("  list               List installed extensions");
      if (!subcommand) {
        process.exit(1);
      }
      break;
  }
}

// ── status subcommand (markdown-rendering-layer spec) ─────────────────────

/**
 * Implement `adev status [--render] [--pipeline]`. Operator-on-demand.
 *
 * --render:   regenerate tasks.md and every <slug>.md in lifecycle-state/.
 *             Exit 1 only on INVALID_PROJECT_ROOT / INVALID_STORAGE_PATH /
 *             unrecoverable fs error. Advisory-skipped files
 *             (SKIPPED_INVALID_SLUG, OVERSIZED_LOG_SKIPPED, MALFORMED_FILE_SKIPPED)
 *             do NOT affect the exit code per SA-2.
 *
 * --pipeline: print an aggregate per-spec table to stdout.
 *
 * When both are passed, render runs first, a divider is printed, then
 * pipeline. SA-3: composite exit code is the max of the two halves.
 */
async function cmdStatus() {
  const args = process.argv.slice(3);
  const wantRender = args.includes("--render");
  const wantPipeline = args.includes("--pipeline");
  const cwd = process.cwd();

  if (!wantRender && !wantPipeline) {
    log("Usage: npx adev-cli status [--render] [--pipeline]");
    log("");
    log("  --render    Regenerate tasks.md and lifecycle <slug>.md files");
    log("  --pipeline  Print the per-spec pipeline table to stdout");
    process.exit(1);
  }

  let exit = 0;

  if (wantRender) {
    try {
      const { writeTasksMd } = await import("../lib/issues/render-markdown.mjs");
      const { listLifecycleStates, currentState, renderMarkdown } = await import(
        "../lib/lifecycle-state.mjs"
      );
      const { existsSync: exists, mkdirSync: mkd, readdirSync, writeFileSync: wfs, renameSync, unlinkSync, statSync } =
        await import("node:fs");
      const { randomBytes } = await import("node:crypto");
      const path = await import("node:path");

      // tasks.md
      try {
        await writeTasksMd(cwd);
        console.log("  ✓ tasks.md");
      } catch (err) {
        if (err && (err.code === "INVALID_PROJECT_ROOT" || err.code === "INVALID_STORAGE_PATH")) {
          console.error(`  ✗ ${err.code}: ${err.message}`);
          process.exit(1);
        }
        // Non-validation fs error → hard fail.
        console.error(`  ✗ ${err?.code ?? "FS_ERROR"}: ${err?.message ?? err}`);
        process.exit(1);
      }

      // <slug>.md per lifecycle-state/<slug>.jsonl
      const lsDir = path.join(cwd, ".context-index", "lifecycle-state");
      if (exists(lsDir)) {
        const ALLOW = /^[a-z0-9._-]+$/;
        const MAX = 50 * 1024 * 1024;
        let entries;
        try {
          entries = readdirSync(lsDir, { withFileTypes: true });
        } catch {
          entries = [];
        }
        for (const entry of entries) {
          if (!entry.isFile()) continue;
          if (!entry.name.endsWith(".jsonl")) continue;
          const slug = entry.name.slice(0, -".jsonl".length);
          if (!ALLOW.test(slug)) {
            console.log(`  ⚠ skipped: ${entry.name} (SKIPPED_INVALID_SLUG)`);
            continue;
          }
          const sourcePath = path.join(lsDir, entry.name);
          try {
            const st = statSync(sourcePath);
            if (st.size > MAX) {
              console.log(`  ⚠ skipped: ${slug} (OVERSIZED_LOG_SKIPPED)`);
              continue;
            }
          } catch {
            console.log(`  ⚠ skipped: ${slug} (STAT_FAILED)`);
            continue;
          }
          const syntheticSpec = `.context-index/specs/.synthetic/${slug}.spec.md`;
          let state;
          try {
            state = currentState(cwd, syntheticSpec);
          } catch {
            console.log(`  ⚠ skipped: ${slug} (MALFORMED_FILE_SKIPPED)`);
            continue;
          }
          let rendered;
          try {
            rendered = renderMarkdown(state);
          } catch (e) {
            console.log(`  ⚠ skipped: ${slug} (${e?.code ?? "RENDER_FAILED"})`);
            continue;
          }
          // Atomic temp-then-rename mirroring atomicWriteFile.
          const target = path.join(lsDir, `${slug}.md`);
          const tmp = target + "." + randomBytes(4).toString("hex") + ".tmp";
          try {
            mkd(lsDir, { recursive: true });
            wfs(tmp, rendered);
            try {
              renameSync(tmp, target);
            } catch (rErr) {
              try { unlinkSync(tmp); } catch { /* swallow */ }
              throw rErr;
            }
            console.log(`  ✓ ${slug}.md`);
          } catch (e) {
            console.error(`  ✗ ${slug}.md: ${e?.code ?? e}`);
            exit = Math.max(exit, 1);
          }
        }
      }
    } catch (err) {
      console.error(`  ✗ ${err?.code ?? "ERROR"}: ${err?.message ?? err}`);
      exit = Math.max(exit, 1);
    }
  }

  if (wantRender && wantPipeline) {
    console.log("");
    console.log("─".repeat(60));
    console.log("");
  }

  if (wantPipeline) {
    try {
      const { listLifecycleStates } = await import("../lib/lifecycle-state.mjs");
      const records = listLifecycleStates(cwd);
      if (records.length === 0) {
        console.log("No specs found in .context-index/lifecycle-state/");
      } else {
        // Truncate spec paths to 40 chars with ellipsis.
        const truncate = (s, n) => {
          if (!s) return "—";
          const str = String(s);
          if (str.length <= n) return str;
          return str.slice(0, n - 1) + "…";
        };
        const rows = records.map((r) => ({
          spec: truncate(r.spec, 40),
          status: String(r.status ?? "—"),
          currentStep: String(r.currentStep ?? "—"),
          updated: String(r.updated ?? "—"),
        }));
        const headers = { spec: "Spec", status: "Status", currentStep: "Current Step", updated: "Updated" };
        const widths = {
          spec: Math.max(headers.spec.length, ...rows.map((r) => r.spec.length)),
          status: Math.max(headers.status.length, ...rows.map((r) => r.status.length)),
          currentStep: Math.max(headers.currentStep.length, ...rows.map((r) => r.currentStep.length)),
          updated: Math.max(headers.updated.length, ...rows.map((r) => r.updated.length)),
        };
        const fmt = (r) =>
          `${r.spec.padEnd(widths.spec)}  ${r.status.padEnd(widths.status)}  ${r.currentStep.padEnd(widths.currentStep)}  ${r.updated.padEnd(widths.updated)}`;
        console.log(fmt(headers));
        console.log(
          `${"-".repeat(widths.spec)}  ${"-".repeat(widths.status)}  ${"-".repeat(widths.currentStep)}  ${"-".repeat(widths.updated)}`,
        );
        for (const r of rows) console.log(fmt(r));
      }
    } catch (err) {
      if (err && err.code === "INVALID_PROJECT_ROOT") {
        console.error(`  ✗ ${err.code}: ${err.message}`);
        process.exit(1);
      }
      console.error(`  ✗ ${err?.code ?? "ERROR"}: ${err?.message ?? err}`);
      exit = Math.max(exit, 1);
    }
  }

  if (exit !== 0) process.exit(exit);
}

/**
 * `adev migrate` — one-shot conversion of legacy state artifacts to the
 * charter-era shapes. Wraps `lib/migrate-state-artifacts.mjs::migrateAll`.
 *
 * Flags:
 *   --dry-run                  Print plan without writing
 *   --artifact=<name>          Scope to a single artifact
 *
 * Exit codes:
 *   0  success / no work to do / valid dry-run
 *   1  parse error / containment violation / fatal collision / unknown artifact
 */
async function cmdMigrate(argv) {
  const cwd = process.cwd();
  // Parse flags from argv[3..]
  const flags = argv.slice(3);
  let dryRun = false;
  let artifact = "all";

  for (const flag of flags) {
    if (flag === "--dry-run") {
      dryRun = true;
    } else if (flag === "--help" || flag === "-h") {
      console.log(`
  adev migrate — convert legacy state artifacts to charter-era shapes.

  Usage:
    adev migrate                           Run full migration
    adev migrate --dry-run                 Preview without writing
    adev migrate --artifact=<name>         Migrate only the named artifact

  Valid artifact names:
    tasks                          tasks.md → tasks.json
    lifecycle-state                build-state/*.json → lifecycle-state/*.jsonl
                                   (per-file translation + directory rename)
    lifecycle-state-skip-rename    Per-file translation only (recovery flow)
    execution-state                .execution-state.md → .execution-state.json
    milestones                     milestones.yaml → milestones.json
    constitution                   Update Context Routing row only
    all                            Default — run every artifact in order
      `);
      return 0;
    } else if (flag.startsWith("--artifact=")) {
      artifact = flag.slice("--artifact=".length);
    } else {
      error(`Unknown flag: ${flag}`);
      return 1;
    }
  }

  // Lazy-import the library so first-load cost is paid only on this subcommand.
  const { migrateAll } = await import("../lib/migrate-state-artifacts.mjs");

  let result;
  try {
    result = await migrateAll(cwd, { dryRun, artifact });
  } catch (e) {
    error(`${e.code ?? "ERROR"}: ${e.message}`);
    return 1;
  }

  if (result.failed) {
    console.log();
    error("Pre-flight failed:");
    for (const f of result.preflight.failures) {
      const line = `  - ${f.code}${f.artifact ? ` (${f.artifact})` : ""}${f.file ? ` — ${f.file}` : ""}`;
      console.log(line);
      if (f.size != null && f.cap != null) {
        console.log(`      size=${f.size} cap=${f.cap}`);
      }
    }
    return 1;
  }

  console.log();
  if (dryRun) {
    heading("Dry-run plan");
  } else {
    heading("Migration result");
  }
  for (const r of result.results) {
    const label = r.action === "skipped" ? "·" : r.action === "migrated" ? "✓" : "→";
    console.log(`  ${label} ${r.artifact}: ${r.action}${r.target ? ` → ${r.target}` : ""}`);
    for (const adv of r.advisories ?? []) {
      console.log(`      ${adv.code}: ${adv.message ?? ""}`);
    }
  }

  if (result.advisorySync && !dryRun) {
    console.log();
    warn(
      "Constitution Context Routing row updated. Run /adev:sync to propagate the change to CLAUDE.md.",
    );
  }

  return 0;
}

function cmdHelp() {
  console.log(`
  adev — Agentic Development Framework CLI

  Usage:
    npx @adev-org/adev-cli install           First-time plugin setup
    npx @adev-org/adev-cli upgrade           Update existing install to latest version
    npx @adev-org/adev-cli uninstall         Uninstall plugin(s)
    npx @adev-org/adev-cli extension install <source>  Install an extension
    npx @adev-org/adev-cli extension list              List installed extensions
    npx @adev-org/adev-cli migrate                     Convert legacy state artifacts (one-shot)

  Provider Selection:
    --provider claude-code        Install for Claude Code only
    --provider opencode           Install for OpenCode only
    --provider codex              Install for OpenAI Codex only
    --provider claude-code --provider opencode  Install for both
    --provider claude-code --provider codex     Install for Claude + Codex

  Examples:
    npx @adev-org/adev-cli install                          # Claude Code (default)
    npx @adev-org/adev-cli install --provider opencode      # OpenCode only
    npx @adev-org/adev-cli install --provider codex         # OpenAI Codex only
    npx @adev-org/adev-cli upgrade                          # Upgrade existing install
    npx @adev-org/adev-cli uninstall                        # Remove from selected providers

  After install, run /adev:init inside your AI coding assistant
  to configure constitution, governance, and project context.

  Repository: https://github.com/agentic-development/adev-plugin
  `);
}

export {
  scaffoldContextKit,
  setupGitHooks,
  PLUGIN_ROOT,
  PLUGIN_VERSION,
  selectProviders,
};

// Re-export Claude Code adapter functions for backward compatibility
export const enablePlugin = getProvider("claude-code").enable;
export const detectConflicts = getProvider("claude-code").detectConflicts;
export const disableConflictingPlugin = getProvider("claude-code").disableConflictingPlugin;

function resolveSymlink(p) {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

const isDirectRun = (() => {
  if (!process.argv[1]) return false;
  const argvPath = resolveSymlink(process.argv[1]);
  const filenamePath = resolve(__filename);
  return argvPath === filenamePath;
})();

if (isDirectRun) {
  const command = process.argv[2] || "help";

  (async () => {
    switch (command) {
      case "install":
        await cmdInstall();
        break;
      case "upgrade":
        await cmdUpgrade();
        break;
      case "init":
        // Backward compatibility — route to install or upgrade based on state
        warn("`init` is deprecated. Use `install` (first-time) or `upgrade` (existing).");
        console.log();
        {
          const state = detectProjectState();
          if (state.mode === "brownfield-outdated" || state.mode === "brownfield-current") {
            await cmdUpgrade();
          } else {
            await cmdInstall();
          }
        }
        break;
      case "uninstall":
        await cmdUninstall();
        break;
      case "extension":
        await cmdExtension();
        break;
      case "status":
        await cmdStatus();
        break;
      case "migrate":
        {
          const exitCode = await cmdMigrate(process.argv);
          if (exitCode !== 0) process.exit(exitCode);
        }
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
