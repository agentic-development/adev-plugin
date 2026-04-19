/**
 * Tool category registry loader.
 *
 * Loads seed categories from the bundled
 * `templates/governance/tool-categories.yaml` plus an optional project overlay
 * at `.context-index/tool-categories.yaml`.
 *
 * Returns the merged set and the per-category description. The loader does
 * not know about adapter mappings — that is adapter-owned (Behaviors 11-12).
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { parseYaml, YamlParseError } from "./yaml.mjs";

/**
 * @param {string} pluginRoot
 * @param {string} [repoRoot]
 * @returns {{ categories: Map<string, {name: string, description?: string, invariants?: string[]}>, warnings: {code:string,message:string}[], errors: {code:string,message:string}[] }}
 */
export function loadCategories(pluginRoot, repoRoot) {
  const warnings = [];
  const errors = [];
  const categories = new Map();

  const bundledPath = join(pluginRoot, "templates", "governance", "tool-categories.yaml");
  if (!existsSync(bundledPath)) {
    errors.push({
      code: "TOOL_CATEGORIES_MISSING",
      message: `Bundled tool-categories.yaml not found at ${bundledPath}.`,
    });
    return { categories, warnings, errors };
  }
  const bundled = loadOne(bundledPath, errors);
  for (const cat of bundled) categories.set(cat.name, cat);

  if (repoRoot) {
    const overlayPath = join(repoRoot, ".context-index", "tool-categories.yaml");
    if (existsSync(overlayPath)) {
      const overlay = loadOne(overlayPath, errors);
      for (const cat of overlay) categories.set(cat.name, cat);
    }
  }

  return { categories, warnings, errors };
}

function loadOne(path, errors) {
  let content;
  try {
    content = readFileSync(path, "utf8");
  } catch (e) {
    errors.push({ code: "TOOL_CATEGORIES_READ", message: `${path}: ${e.message}` });
    return [];
  }
  let doc;
  try {
    doc = parseYaml(content);
  } catch (e) {
    if (e instanceof YamlParseError) {
      errors.push({ code: "TOOL_CATEGORIES_YAML", message: `${path}: ${e.message}` });
    } else {
      errors.push({ code: "TOOL_CATEGORIES_YAML", message: `${path}: ${e.message}` });
    }
    return [];
  }
  const list = Array.isArray(doc?.categories) ? doc.categories : [];
  return list.filter((c) => c && typeof c.name === "string");
}
