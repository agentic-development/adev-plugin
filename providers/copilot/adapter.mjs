/**
 * CopilotAdapter — adev's fifth peer provider adapter (GitHub Copilot).
 *
 * Unlike Claude Code / OpenCode / Codex / Cursor, Copilot has no plugin home.
 * The customization surface is the consuming project's .github/ tree,
 * materialized at install time. An opt-in `--user` flag mirrors a subset
 * under ~/.copilot/.
 *
 * Behavior is governed by:
 *   .context-index/specs/features/copilot-provider/copilot-adapter.spec.md
 * (currently rev 3).
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  cpSync,
  chmodSync,
  mkdirSync,
  readdirSync,
  rmSync,
  lstatSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

import { validateSkillNames } from '../../lib/providers/copilot/skill-validator.mjs';
import { scanForSymlinks } from '../../lib/providers/copilot/symlink-scanner.mjs';
import { rewriteHookConfigForCopilot } from '../../lib/providers/copilot/hook-config-rewriter.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = resolve(__dirname, '..', '..');
const PLUGIN_VERSION = JSON.parse(
  readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8'),
).version;
const SCHEMA_VERSION = 1;

const AGENTS_MD_AUTOLOAD_HINT =
  'VS Code Copilot (when chat.useAgentsMdFile is enabled) and Copilot CLI auto-load AGENTS.md at the repo root.';

const NAME_REGEX = /^[a-z0-9-]{1,64}$/;
const HOOK_PATH_REGEX = /^hooks\/(scripts\/)?[a-z0-9_.-]+(\.sh|\.json)$/;

// ---------- helpers ----------

export function getCopilotHome() {
  return process.env.COPILOT_HOME || join(homedir(), '.copilot');
}

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function isGitRepo(projectRoot) {
  return existsSync(join(projectRoot, '.git'));
}

/**
 * Assert that `target` resolves to a path under `root` (root + sep prefix).
 * @throws {Error} INSTALL_PATH_ESCAPE if `target` escapes `root`.
 */
function assertContained(root, target) {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(resolvedRoot + sep)) {
    throw new Error(`INSTALL_PATH_ESCAPE: ${resolvedTarget}`);
  }
}

/**
 * Build the dry-run / install plan: validated skills + rewritten hook config +
 * script file list. Used by both dryRun and live install code paths so the two
 * remain in lock-step.
 *
 * @param {object} opts
 * @param {string} opts.projectRoot
 * @param {boolean} opts.user
 * @returns {{ skills: string[], hookConfig: object, scriptFiles: string[], wouldWrite: string[] }}
 */
function buildPlan({ projectRoot, user }) {
  const pluginSkillsDir = join(PLUGIN_ROOT, 'skills');
  const pluginHooksDir = join(PLUGIN_ROOT, 'hooks');
  const hookConfigSrc = join(PLUGIN_ROOT, 'providers', 'copilot', 'hooks.json');

  if (!existsSync(hookConfigSrc)) {
    throw new Error(`MISSING_HOOK_CONFIG: ${hookConfigSrc}`);
  }

  const skills = validateSkillNames(pluginSkillsDir);

  // Symlink scan every validated skill source dir.
  for (const skill of skills) {
    scanForSymlinks(join(pluginSkillsDir, skill));
  }

  const rawConfig = JSON.parse(readFileSync(hookConfigSrc, 'utf8'));
  const { rewrittenConfig, scriptFiles } = rewriteHookConfigForCopilot(rawConfig, PLUGIN_ROOT);

  // Compute would-write paths (repo + optional user).
  const wouldWrite = [];
  if (user) {
    const userHome = getCopilotHome();
    for (const s of skills) wouldWrite.push(join(userHome, 'skills', s));
    wouldWrite.push(join(userHome, 'hooks', 'hooks.json'));
    for (const f of scriptFiles) wouldWrite.push(join(userHome, 'hooks', 'scripts', f));
  }
  for (const s of skills) wouldWrite.push(join(projectRoot, '.github', 'skills', s));
  wouldWrite.push(join(projectRoot, '.github', 'hooks', 'hooks.json'));
  for (const f of scriptFiles) wouldWrite.push(join(projectRoot, '.github', 'hooks', 'scripts', f));
  wouldWrite.push(join(projectRoot, '.github', '.adev-copilot-install.json'));

  return { skills, hookConfig: rewrittenConfig, scriptFiles, wouldWrite };
}

/**
 * Materialize the install plan against a destination root (.github/ or
 * ~/.copilot/). Writes skills, hook config, and hook scripts. Does NOT
 * write the state record — that is the caller's responsibility (must be last).
 *
 * @param {object} args
 * @param {string} args.destRoot - The base dir (.github/ or ~/.copilot/).
 * @param {string} args.containmentRoot - The root we assert all writes stay under.
 * @param {string[]} args.skills - Validated skill dirnames.
 * @param {object} args.hookConfig - The rewritten hook config.
 * @param {string[]} args.scriptFiles - Basenames of scripts to copy.
 */
function materializeLeg({ destRoot, containmentRoot, skills, hookConfig, scriptFiles }) {
  const pluginSkillsDir = join(PLUGIN_ROOT, 'skills');
  const pluginHooksDir = join(PLUGIN_ROOT, 'hooks');

  // Directory skeleton.
  const skillsDest = join(destRoot, 'skills');
  const hooksDest = join(destRoot, 'hooks');
  const scriptsDest = join(hooksDest, 'scripts');
  for (const d of [destRoot, skillsDest, hooksDest, scriptsDest]) {
    assertContained(containmentRoot, d);
    ensureDir(d);
  }

  // Copy skills.
  for (const skill of skills) {
    const src = join(pluginSkillsDir, skill);
    const dst = join(skillsDest, skill);
    assertContained(containmentRoot, dst);
    cpSync(src, dst, {
      recursive: true,
      dereference: false,
      verbatimSymlinks: false,
      errorOnExist: false,
      force: true,
    });
  }

  // Copy hook scripts and chmod exec.
  for (const script of scriptFiles) {
    const src = join(pluginHooksDir, script);
    const dst = join(scriptsDest, script);
    assertContained(containmentRoot, dst);
    cpSync(src, dst, { dereference: false, verbatimSymlinks: false, force: true });
    chmodSync(dst, 0o755);
  }

  // Write rewritten hook config.
  const hookConfigDest = join(hooksDest, 'hooks.json');
  assertContained(containmentRoot, hookConfigDest);
  writeFileSync(hookConfigDest, JSON.stringify(hookConfig, null, 2) + '\n');
}

// ---------- public API ----------

export const CopilotAdapter = {
  name: 'copilot',
  pluginRoot: PLUGIN_ROOT,
  version: PLUGIN_VERSION,

  /**
   * @returns {boolean}
   */
  detect() {
    if (process.env.COPILOT === 'true') return true;
    if (existsSync(join(process.cwd(), '.github', 'copilot-instructions.md'))) return true;
    try {
      if (existsSync(getCopilotHome())) return true;
    } catch {
      /* ignore */
    }
    return false;
  },

  /**
   * @param {{ projectRoot: string, dryRun?: boolean, user?: boolean }} opts
   */
  install(opts = {}) {
    const { projectRoot, dryRun = false, user = false } = opts;
    if (!projectRoot) throw new Error('install: projectRoot is required');
    if (!isGitRepo(projectRoot)) {
      throw new Error(`NOT_A_GIT_REPO: ${projectRoot}`);
    }

    const plan = buildPlan({ projectRoot, user });

    if (dryRun) {
      return {
        installed: false,
        dryRun: true,
        wouldWrite: plan.wouldWrite,
        skipped: [],
        errors: [],
        version: PLUGIN_VERSION,
        location: join(projectRoot, '.github'),
        userSeeded: !!user,
      };
    }

    // User-scope writes happen FIRST (per spec §2). State record (last) is
    // only written for the repo leg — user-scope has no state record.
    let userSeeded = false;
    if (user) {
      const userHome = getCopilotHome();
      materializeLeg({
        destRoot: userHome,
        containmentRoot: userHome,
        skills: plan.skills,
        hookConfig: plan.hookConfig,
        scriptFiles: plan.scriptFiles,
      });
      userSeeded = true;
    }

    // Repo-scope leg.
    const githubRoot = join(projectRoot, '.github');
    materializeLeg({
      destRoot: githubRoot,
      containmentRoot: projectRoot,
      skills: plan.skills,
      hookConfig: plan.hookConfig,
      scriptFiles: plan.scriptFiles,
    });

    // State record — written LAST so partial-failure leaves no committed record.
    // Note: hookConfig filename matches the sibling spec for symmetry (CON-9).
    const stateRecord = {
      schemaVersion: SCHEMA_VERSION,
      pluginVersion: PLUGIN_VERSION,
      installedAt: new Date().toISOString(),
      user: !!user,
      skills: plan.skills,
      hookConfig: 'hooks/hooks.json',
      hookScripts: plan.scriptFiles.map((s) => `hooks/scripts/${s}`),
    };
    const stateRecordPath = join(githubRoot, '.adev-copilot-install.json');
    assertContained(projectRoot, stateRecordPath);
    writeFileSync(stateRecordPath, JSON.stringify(stateRecord, null, 2) + '\n');

    return {
      installed: true,
      version: PLUGIN_VERSION,
      location: githubRoot,
      userSeeded,
    };
  },

  /**
   * @param {{ projectRoot: string, force?: boolean }} opts
   */
  uninstall(opts = {}) {
    const { projectRoot, force = false } = opts;
    if (!projectRoot) throw new Error('uninstall: projectRoot is required');

    const stateRecordPath = join(projectRoot, '.github', '.adev-copilot-install.json');
    if (!existsSync(stateRecordPath)) {
      return { removed: false, residual: ['NO_STATE_RECORD'] };
    }

    let state;
    try {
      state = JSON.parse(readFileSync(stateRecordPath, 'utf8'));
    } catch (err) {
      const msg = `STATE_RECORD_TAMPERED: ${stateRecordPath}: ${err.message}`;
      throw new Error(msg);
    }

    // Schema-version gate.
    if (state.schemaVersion !== SCHEMA_VERSION) {
      if (!force) {
        throw new Error(`STATE_RECORD_VERSION_INCOMPATIBLE: ${state.schemaVersion}`);
      }
      process.stderr.write(`WARN: STATE_RECORD_VERSION_INCOMPATIBLE (proceeding with --force): ${state.schemaVersion}\n`);
    }

    // Plugin-version mismatch is warning-only.
    if (state.pluginVersion && state.pluginVersion !== PLUGIN_VERSION) {
      process.stderr.write(`WARN: pluginVersion mismatch in state record: ${state.pluginVersion} (current ${PLUGIN_VERSION})\n`);
    }

    const githubRoot = join(projectRoot, '.github');
    const skillsRoot = join(githubRoot, 'skills');
    const hooksRoot = join(githubRoot, 'hooks');
    const residual = [];

    // Skills entries.
    for (const skill of Array.isArray(state.skills) ? state.skills : []) {
      if (typeof skill !== 'string' || !NAME_REGEX.test(skill)) {
        residual.push(`SUSPICIOUS_STATE_ENTRY: ${skill}`);
        continue;
      }
      const target = resolve(skillsRoot, skill);
      // Containment check: must start with skillsRoot + sep.
      if (target !== skillsRoot && !target.startsWith(skillsRoot + sep)) {
        residual.push(`SUSPICIOUS_STATE_ENTRY: ${skill}`);
        continue;
      }
      // Symlink check on the resolved target (defense-in-depth — SEC-9).
      try {
        if (existsSync(target) && lstatSync(target).isSymbolicLink()) {
          residual.push(`SUSPICIOUS_STATE_ENTRY: symlink at ${skill}`);
          continue;
        }
      } catch {
        /* ignore stat errors — rmSync below handles missing */
      }
      rmSync(target, { recursive: true, force: true });
    }

    // Hook config + hook scripts.
    const hookEntries = [];
    if (typeof state.hookConfig === 'string') hookEntries.push(state.hookConfig);
    if (Array.isArray(state.hookScripts)) hookEntries.push(...state.hookScripts);
    for (const entry of hookEntries) {
      if (typeof entry !== 'string' || !HOOK_PATH_REGEX.test(entry)) {
        residual.push(`SUSPICIOUS_STATE_ENTRY: ${entry}`);
        continue;
      }
      const target = resolve(githubRoot, entry);
      if (!target.startsWith(hooksRoot + sep)) {
        residual.push(`SUSPICIOUS_STATE_ENTRY: ${entry}`);
        continue;
      }
      try {
        if (existsSync(target) && lstatSync(target).isSymbolicLink()) {
          residual.push(`SUSPICIOUS_STATE_ENTRY: symlink at ${entry}`);
          continue;
        }
      } catch {
        /* ignore */
      }
      rmSync(target, { recursive: true, force: true });
    }

    // Best-effort: remove now-empty .github/skills/ and .github/hooks/scripts/, .github/hooks/.
    for (const d of [join(hooksRoot, 'scripts'), hooksRoot, skillsRoot]) {
      try {
        if (existsSync(d) && readdirSync(d).length === 0) rmSync(d, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }

    // Finally, remove the state record itself.
    rmSync(stateRecordPath, { force: true });

    return { removed: true, residual };
  },

  /**
   * @param {{ projectRoot: string }} opts
   */
  status(opts = {}) {
    const { projectRoot } = opts;
    if (!projectRoot) throw new Error('status: projectRoot is required');

    const githubRoot = join(projectRoot, '.github');
    const stateRecordPath = join(githubRoot, '.adev-copilot-install.json');
    const hookConfigPath = join(githubRoot, 'hooks', 'hooks.json');
    const repoInstructionsPath = join(githubRoot, 'copilot-instructions.md');
    const moduleInstructionsDir = join(githubRoot, 'instructions');
    const agentsMdPath = join(projectRoot, 'AGENTS.md');

    let installed = false;
    let version = null;
    let userSeeded = false;
    let skillCount = 0;

    if (existsSync(stateRecordPath)) {
      try {
        const state = JSON.parse(readFileSync(stateRecordPath, 'utf8'));
        installed = true;
        version = state.pluginVersion || null;
        userSeeded = !!state.user;
        skillCount = Array.isArray(state.skills) ? state.skills.length : 0;
      } catch {
        installed = false;
      }
    }

    return {
      installed,
      version,
      location: githubRoot,
      userSeeded,
      skillCount,
      hookConfigPresent: existsSync(hookConfigPath),
      syncOutputPresent: {
        repoInstructions: existsSync(repoInstructionsPath),
        moduleInstructions: existsSync(moduleInstructionsDir),
      },
      agentsMd: {
        exists: existsSync(agentsMdPath),
        autoLoadHint: AGENTS_MD_AUTOLOAD_HINT,
      },
    };
  },

  // Re-export helpers per spec's required surface.
  validateSkillNames,
  getCopilotHome,
};
