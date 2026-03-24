import { existsSync, readFileSync, readdirSync, lstatSync, symlinkSync, mkdirSync, unlinkSync, readlinkSync, writeFileSync } from "fs";
import { join } from "path";

export class CodexAdapter {
  name = "OpenAI Codex";

  async install() {
    const pluginRoot = join(import.meta.dirname, "..", "..");
    const codexSkillsDir = join(process.env.HOME || process.env.USERPROFILE, ".agents", "skills");
    const pluginCodexSkillsDir = join(pluginRoot, "providers", "codex", "skills");
    
    let installed = false;
    const skillDirs = existsSync(pluginCodexSkillsDir) 
      ? readdirSync(pluginCodexSkillsDir) 
      : [];
    
    if (skillDirs.length > 0) {
      installed = true;
    }
    
    return { installed, path: "~/.agents/" };
  }

  enable() {
    const pluginRoot = join(import.meta.dirname, "..", "..");
    const codexSkillsDir = join(process.env.HOME || process.env.USERPROFILE, ".agents", "skills");
    
    this.#linkSkills(pluginRoot, codexSkillsDir);
    
    return "~/.agents/skills/";
  }

  #linkSkills(pluginRoot, targetDir) {
    const pluginCodexSkillsDir = join(pluginRoot, "providers", "codex", "skills");
    
    if (!existsSync(pluginCodexSkillsDir)) {
      return;
    }
    
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }
    
    try {
      const skillDirs = readdirSync(pluginCodexSkillsDir);
      
      for (const skillName of skillDirs) {
        const sourceSkillPath = join(pluginCodexSkillsDir, skillName);
        const targetSkillPath = join(targetDir, skillName);
        const sourceSkillyml = join(sourceSkillPath, "SKILL.md");
        
        if (!lstatSync(sourceSkillPath).isDirectory() || !existsSync(sourceSkillyml)) {
          continue;
        }
        
        try {
          if (existsSync(targetSkillPath)) {
            const existingSkillyml = join(targetSkillPath, "SKILL.md");
            if (existsSync(existingSkillyml)) {
              try {
                const existingTarget = readlinkSync(existingSkillyml);
                if (existingTarget === sourceSkillyml) {
                  continue;
                }
                unlinkSync(existingSkillyml);
              } catch {
                unlinkSync(existingSkillyml);
              }
            }
          } else {
            mkdirSync(targetSkillPath, { recursive: true });
          }
          
          symlinkSync(sourceSkillyml, join(targetSkillPath, "SKILL.md"));
        } catch {}
      }
    } catch {}
  }

  async uninstall() {
    const codexSkillsDir = join(process.env.HOME || process.env.USERPROFILE, ".agents", "skills");
    
    if (existsSync(codexSkillsDir)) {
      try {
        const skillDirs = readdirSync(codexSkillsDir);
        for (const skillName of skillDirs) {
          const skillPath = join(codexSkillsDir, skillName);
          const skillyml = join(skillPath, "SKILL.md");
          if (existsSync(skillyml)) {
            try {
              const target = readlinkSync(skillyml);
              if (target.includes("adev-plugin")) {
                unlinkSync(skillyml);
              }
            } catch {}
          }
        }
      } catch {}
    }
  }

  detectConflicts() {
    return [];
  }

  disableConflictingPlugin() {}
}
