import { existsSync, lstatSync, readdirSync, readlinkSync, rmSync, symlinkSync, unlinkSync } from "fs";
import { join } from "path";
import { ensureDir } from "../../lib/fs-utils.mjs";

function getPluginRoot() {
  return join(import.meta.dirname, "..", "..");
}

function getHomeDir() {
  return process.env.HOME || process.env.USERPROFILE || process.cwd();
}

function getSourceSkillsDir(pluginRoot = getPluginRoot()) {
  return join(pluginRoot, "providers", "codex", "skills");
}

function getTargetSkillsDir(scope = "user") {
  if (scope === "project") {
    return join(process.cwd(), ".agents", "skills");
  }
  return join(getHomeDir(), ".agents", "skills");
}

function getDisplayPath(scope = "user") {
  return scope === "project" ? ".agents/skills/" : "~/.agents/skills/";
}

function listSkillNames(sourceSkillsDir) {
  if (!existsSync(sourceSkillsDir)) {
    return [];
  }

  return readdirSync(sourceSkillsDir).filter((skillName) => {
    const skillDir = join(sourceSkillsDir, skillName);
    return lstatSync(skillDir).isDirectory() && existsSync(join(skillDir, "SKILL.md"));
  });
}

function isManagedTarget(targetPath, sourceSkillPath) {
  if (!existsSync(targetPath)) {
    return false;
  }

  const stat = lstatSync(targetPath);
  if (stat.isSymbolicLink()) {
    try {
      return readlinkSync(targetPath) === sourceSkillPath;
    } catch {
      return false;
    }
  }

  if (!stat.isDirectory()) {
    return false;
  }

  const skillMdPath = join(targetPath, "SKILL.md");
  if (!existsSync(skillMdPath)) {
    return false;
  }

  try {
    return lstatSync(skillMdPath).isSymbolicLink() && readlinkSync(skillMdPath) === join(sourceSkillPath, "SKILL.md");
  } catch {
    return false;
  }
}

function isOldManagedLayout(targetPath, sourceSkillPath) {
  if (!existsSync(targetPath) || !lstatSync(targetPath).isDirectory()) {
    return false;
  }

  const skillMdPath = join(targetPath, "SKILL.md");
  if (!existsSync(skillMdPath)) {
    return false;
  }

  try {
    return lstatSync(skillMdPath).isSymbolicLink() && readlinkSync(skillMdPath) === join(sourceSkillPath, "SKILL.md");
  } catch {
    return false;
  }
}

export class CodexAdapter {
  name = "OpenAI Codex";

  detect() {
    return process.env.CODEX === "true" || process.env.OPENAI_CODEX === "true" || existsSync(".agents");
  }

  getAgentFile() {
    return "AGENTS.md";
  }

  async install(opts = {}) {
    const scope = opts.scope || "user";
    const pluginRoot = getPluginRoot();
    const sourceSkillsDir = getSourceSkillsDir(pluginRoot);
    const targetSkillsDir = getTargetSkillsDir(scope);
    const skillNames = listSkillNames(sourceSkillsDir);

    if (skillNames.length === 0) {
      return { installed: false, path: getDisplayPath(scope) };
    }

    const alreadyInstalled = skillNames.every((skillName) => {
      const sourceSkillPath = join(sourceSkillsDir, skillName);
      const targetSkillPath = join(targetSkillsDir, skillName);
      return isManagedTarget(targetSkillPath, sourceSkillPath);
    });

    if (alreadyInstalled) {
      return { installed: false, path: getDisplayPath(scope) };
    }

    this.enable(scope);
    return { installed: true, path: getDisplayPath(scope) };
  }

  enable(scope = "user") {
    const pluginRoot = getPluginRoot();
    const targetSkillsDir = getTargetSkillsDir(scope);

    this.#linkSkills(pluginRoot, targetSkillsDir);
    return getDisplayPath(scope);
  }

  #linkSkills(pluginRoot, targetDir) {
    const sourceSkillsDir = getSourceSkillsDir(pluginRoot);
    const skillNames = listSkillNames(sourceSkillsDir);

    if (skillNames.length === 0) {
      return;
    }

    ensureDir(targetDir);

    for (const skillName of skillNames) {
      const sourceSkillPath = join(sourceSkillsDir, skillName);
      const targetSkillPath = join(targetDir, skillName);

      if (isManagedTarget(targetSkillPath, sourceSkillPath)) {
        continue;
      }

      if (existsSync(targetSkillPath)) {
        if (isOldManagedLayout(targetSkillPath, sourceSkillPath)) {
          rmSync(targetSkillPath, { recursive: true, force: true });
        } else {
          continue;
        }
      }

      try {
        symlinkSync(sourceSkillPath, targetSkillPath, process.platform === "win32" ? "junction" : "dir");
      } catch {}
    }
  }

  async uninstall(opts = {}) {
    const scope = opts.scope || "user";
    const pluginRoot = getPluginRoot();
    const sourceSkillsDir = getSourceSkillsDir(pluginRoot);
    const targetSkillsDir = getTargetSkillsDir(scope);
    const skillNames = listSkillNames(sourceSkillsDir);

    if (!existsSync(targetSkillsDir)) {
      return;
    }

    for (const skillName of skillNames) {
      const sourceSkillPath = join(sourceSkillsDir, skillName);
      const targetSkillPath = join(targetSkillsDir, skillName);

      if (!existsSync(targetSkillPath)) {
        continue;
      }

      if (lstatSync(targetSkillPath).isSymbolicLink()) {
        try {
          if (readlinkSync(targetSkillPath) === sourceSkillPath) {
            unlinkSync(targetSkillPath);
          }
        } catch {}
        continue;
      }

      if (isOldManagedLayout(targetSkillPath, sourceSkillPath)) {
        rmSync(targetSkillPath, { recursive: true, force: true });
      }
    }
  }

  detectConflicts() {
    return [];
  }

  disableConflictingPlugin() {}
}
