#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, chmodSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
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
  if (existsSync(gitignorePath)) {
    let content = readFileSync(gitignorePath, "utf8");
    if (!content.includes(".context-index/hygiene")) {
      content = content.trimEnd() + "\n\n# adev context index\n.context-index/hygiene/\n.context-index/.token-cursor.json\n";
      writeFileSync(gitignorePath, content);
      created.push(".gitignore (updated)");
    } else if (!content.includes(".token-cursor.json")) {
      writeFileSync(gitignorePath, content.trimEnd() + "\n.context-index/.token-cursor.json\n");
      created.push(".gitignore (updated)");
    }
  } else {
    writeFileSync(gitignorePath, "# adev context index\n.context-index/hygiene/\n.context-index/.token-cursor.json\n");
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
      } else {
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
    } else {
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

async function cmdInit() {
  console.log();
  console.log("  adev — Agentic Development Framework");
  console.log("  ─────────────────────────────────────");
  console.log();

  // --- Detect project state ---
  const state = detectProjectState();

  if (state.mode === "greenfield") {
    log("Detected: new project (no existing code or context index)");
  } else if (state.mode === "brownfield-no-adev") {
    log("Detected: existing project without adev");
    log("  Code found but no .context-index/ — will scaffold context alongside existing code.");
  } else if (state.mode === "brownfield-outdated") {
    const fromLabel = state.version || "pre-versioning";
    log(`Detected: existing adev install (v${fromLabel}) — upgrade available`);
    const delta = computeUpgradeDelta(state.version);
    if (delta.description.length > 0) {
      log("  New in v" + PLUGIN_VERSION + ":");
      for (const d of delta.description) {
        log(`    + ${d}`);
      }
    }
    console.log();
    const proceed = await ask(`Upgrade from v${fromLabel} to v${PLUGIN_VERSION}? (yes/no) [yes]`);
    if (proceed === "no" || proceed === "n") {
      log("Upgrade skipped.");
      return;
    }
  } else if (state.mode === "brownfield-current") {
    log(`Detected: adev v${state.version} (current) — checking for missing components`);
  }

  console.log();

  // --- Provider installation ---
  const providerNames = await selectProviders();

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

  // --- Context index scaffolding ---
  heading("Context Index");
  let scaffoldCreated = [];

  if (state.mode === "greenfield" || state.mode === "brownfield-no-adev") {
    if (state.mode === "brownfield-no-adev") {
      log("Scaffolding .context-index/ alongside existing codebase.");
      log("Existing files will not be modified — only new context files are created.");
      console.log();
    }
    const scaffoldChoice = await ask("Create .context-index/ with templates? (yes/no) [yes]");
    if (scaffoldChoice === "no" || scaffoldChoice === "n") {
      log("Skipped. Run /adev:init to scaffold later.");
    } else {
      scaffoldCreated = scaffoldContextKit();
      for (const item of scaffoldCreated) {
        success(item);
      }
      await handleDualSyncTargets(providerNames);
    }
  } else {
    // brownfield-outdated or brownfield-current: fill in missing files
    scaffoldCreated = scaffoldContextKit();
    if (scaffoldCreated.length > 0) {
      log("Added missing files:");
      for (const item of scaffoldCreated) {
        success(item);
      }
    } else {
      log("All context files present.");
    }
    await handleDualSyncTargets(providerNames);
  }

  // --- Stamp adev_version in manifest ---
  const manifestPath = join(process.cwd(), ".context-index", "manifest.yaml");
  if (existsSync(manifestPath)) {
    let manifest = readFileSync(manifestPath, "utf8");
    const versionLine = `adev_version: "${PLUGIN_VERSION}"`;
    if (manifest.includes("adev_version:")) {
      manifest = manifest.replace(/adev_version:\s*["']?[^"'\s\n]+["']?/, versionLine);
    } else {
      // Insert after project.name or at top of project section
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

  // --- Provenance config (for upgrades) ---
  if (state.mode === "brownfield-outdated") {
    const delta = computeUpgradeDelta(state.version);
    if (delta.provenance && existsSync(manifestPath)) {
      let manifest = readFileSync(manifestPath, "utf8");
      if (!manifest.includes("provenance:")) {
        heading("Provenance Tracking (new in v0.13.0)");
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
          // Insert before tasks section or at end
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

  // --- Persona Configuration ---
  heading("Persona Configuration");
  log("Choose a default output persona:");
  log("  1. product   — simplified summaries for PMs and designers");
  log("  2. developer — balanced view with architecture and code details (default)");
  log("  3. architect — full technical detail with trade-offs and review rationale");
  console.log();
  const personaChoice = await ask("Select persona [1/2/3]:");
  const personaMap = { "1": "product", "2": "developer", "3": "architect" };
  const selectedPersona = personaMap[personaChoice] || "developer";
  writeFileSync(join(PLUGIN_ROOT, "user-config"), `# adev user config\npersona=${selectedPersona}\n`);
  success(`Default persona set to: ${selectedPersona}`);

  // --- Summary ---
  heading(`Done! Your project is set up with adev v${PLUGIN_VERSION}.`);

  if (state.mode === "brownfield-outdated") {
    const fromLabel = state.version || "pre-versioning";
    log(`Upgraded from v${fromLabel} to v${PLUGIN_VERSION}`);
    console.log();
  }

  log("Next steps:");
  console.log();
  if (state.mode === "brownfield-no-adev") {
    log("  1. Run /adev:brainstorm to charter existing modules");
    log("  2. Run /adev:specify --extract to reverse-engineer specs from code");
    log("  3. Run /adev:hygiene to audit context coverage");
  } else if (state.mode === "greenfield") {
    if (providerNames.includes("claude-code")) {
      log("  1. Open Claude Code:  claude");
      log("  2. Configure context: /adev:init");
      log("  3. Start working:    /adev:work");
    }
    if (providerNames.includes("opencode")) {
      log("  1. Open OpenCode:    opencode");
      log("  2. Configure context: /adev:init");
    }
    if (providerNames.includes("codex")) {
      log("  1. Open Codex:       codex");
      log("  2. Configure context: $adev:init");
    }
  } else {
    log("  1. Run /adev:hygiene to check context health");
    log("  2. Run /adev:status --all for project dashboard");
    log("  3. Run /adev:work to begin work");
  }
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

function cmdHelp() {
  console.log(`
  adev — Agentic Development Framework CLI

  Usage:
    npx @adev-org/adev-cli init              Interactive wizard (default: Claude Code)
    npx @adev-org/adev-cli uninstall        Uninstall plugin(s)

  Provider Selection:
    --provider claude-code        Install for Claude Code only
    --provider opencode           Install for OpenCode only
    --provider codex            Install for OpenAI Codex only
    --provider claude-code --provider opencode  Install for both
    --provider claude-code --provider codex     Install for Claude + Codex

  Examples:
    npx @adev-org/adev-cli init                          # Claude Code (default)
    npx @adev-org/adev-cli init --provider opencode      # OpenCode only
    npx @adev-org/adev-cli init --provider codex       # OpenAI Codex only
    npx @adev-org/adev-cli init --provider both          # Both providers
    npx @adev-org/adev-cli uninstall                     # Remove from selected providers

  Repository: https://github.com/agentic-development/adev:plugin
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
    return execSync("readlink -f '" + p.replace(/'/g, "'\\''") + "'", { encoding: "utf8", cwd: "/" }).trim();
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
