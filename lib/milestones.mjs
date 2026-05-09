/**
 * Milestone YAML I/O and command logic.
 *
 * Manages milestones.yaml in .context-index/ with auto-linked epics
 * via the issue manager abstraction.
 *
 * Zero external dependencies — uses parseYaml from lib/profiles/yaml.mjs
 * for reading and simple string serialization for writing.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseYaml } from "./profiles/yaml.mjs";

const MILESTONES_PATH = ".context-index/milestones.yaml";
const NAME_REGEX = /^[a-zA-Z0-9._-]+$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate a milestone name.
 * @param {string} name
 * @throws {{ code: "MISSING_NAME" | "INVALID_NAME" }}
 */
export function validateMilestoneName(name) {
  if (!name) {
    const err = new Error("Milestone name is required.");
    err.code = "MISSING_NAME";
    throw err;
  }
  if (!NAME_REGEX.test(name)) {
    const err = new Error(`Invalid milestone name: "${name}". Must match [a-zA-Z0-9._-]+`);
    err.code = "INVALID_NAME";
    throw err;
  }
}

/**
 * Validate a target date string.
 * @param {string} dateStr
 * @throws {{ code: "INVALID_DATE" }}
 */
export function validateTargetDate(dateStr) {
  if (!DATE_REGEX.test(dateStr)) {
    const err = new Error("Invalid date format. Use YYYY-MM-DD.");
    err.code = "INVALID_DATE";
    throw err;
  }
}

/**
 * Load milestones from .context-index/milestones.yaml.
 * @param {string} projectRoot
 * @returns {Array<object>} Array of milestone objects
 */
export function loadMilestones(projectRoot) {
  const filePath = join(projectRoot, MILESTONES_PATH);
  if (!existsSync(filePath)) return [];

  let content;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    return [];
  }

  let parsed;
  try {
    parsed = parseYaml(content);
  } catch (e) {
    const err = new Error("milestones.yaml is malformed — cannot parse");
    err.code = "PARSE_ERROR";
    throw err;
  }

  if (!parsed || !Array.isArray(parsed.milestones)) return [];
  return parsed.milestones.map((m) => ({
    name: m.name ?? "",
    status: m.status ?? "planned",
    epic_id: m.epic_id ?? null,
    target_date: m.target_date ?? null,
    release: m.release ?? null,
    ship_criteria: Array.isArray(m.ship_criteria) ? m.ship_criteria : [],
  }));
}

/**
 * Serialize and save milestones to .context-index/milestones.yaml.
 * @param {string} projectRoot
 * @param {Array<object>} milestones
 */
export function saveMilestones(projectRoot, milestones) {
  const dirPath = join(projectRoot, ".context-index");
  mkdirSync(dirPath, { recursive: true });

  const lines = ["milestones:"];
  for (const ms of milestones) {
    lines.push(`  - name: ${ms.name}`);
    lines.push(`    status: ${ms.status ?? "planned"}`);
    lines.push(`    epic_id: ${ms.epic_id ?? "null"}`);
    lines.push(`    target_date: ${ms.target_date ?? "null"}`);
    lines.push(`    release: ${ms.release ?? "null"}`);
    if (Array.isArray(ms.ship_criteria) && ms.ship_criteria.length > 0) {
      lines.push("    ship_criteria:");
      for (const sc of ms.ship_criteria) {
        if (sc.check) {
          lines.push(`      - check: ${sc.check}`);
        } else if (sc.confirm) {
          lines.push(`      - confirm: "${sc.confirm}"`);
        }
      }
    } else {
      lines.push("    ship_criteria: []");
    }
  }
  lines.push("");

  writeFileSync(join(projectRoot, MILESTONES_PATH), lines.join("\n"));
}

/**
 * Find a milestone by name.
 * @param {string} projectRoot
 * @param {string} name
 * @returns {object|null}
 */
export function findMilestone(projectRoot, name) {
  const milestones = loadMilestones(projectRoot);
  return milestones.find((m) => m.name === name) ?? null;
}

/**
 * Create or update a milestone with optional epic linking.
 *
 * @param {string} projectRoot
 * @param {string} name
 * @param {object} options
 * @param {object} [options.issueManager] - Issue manager adapter (createEpic)
 * @param {string} [options.targetDate] - Target date (YYYY-MM-DD)
 * @param {string[]} [options.checks] - Ship criteria check types
 * @param {string[]} [options.confirms] - Ship criteria confirm texts
 * @returns {Promise<object>} The created or updated milestone entry
 */
export async function milestoneCreate(projectRoot, name, options = {}) {
  validateMilestoneName(name);

  if (options.targetDate) {
    validateTargetDate(options.targetDate);
  }

  const milestones = loadMilestones(projectRoot);
  const existing = milestones.find((m) => m.name === name);

  // Build ship criteria
  const shipCriteria = [];
  if (options.checks) {
    for (const check of options.checks) {
      shipCriteria.push({ check });
    }
  }
  if (options.confirms) {
    for (const confirm of options.confirms) {
      shipCriteria.push({ confirm });
    }
  }

  if (existing) {
    // Idempotent update — keep epic_id, update other fields
    if (options.targetDate) existing.target_date = options.targetDate;
    if (shipCriteria.length > 0) existing.ship_criteria = shipCriteria;
    saveMilestones(projectRoot, milestones);
    return existing;
  }

  // New milestone — attempt epic creation
  let epicId = null;
  const { issueManager } = options;

  if (issueManager) {
    try {
      const epic = await issueManager.createEpic({
        title: name,
        milestone: name,
      });
      epicId = epic.id;
    } catch {
      // EPIC_CREATE_FAILED — write milestone with epic_id: null
      epicId = null;
    }
  }

  const entry = {
    name,
    status: "planned",
    epic_id: epicId,
    target_date: options.targetDate ?? null,
    release: null,
    ship_criteria: shipCriteria,
  };

  milestones.push(entry);
  saveMilestones(projectRoot, milestones);
  return entry;
}

/**
 * List milestones with progress from linked epics.
 *
 * @param {string} projectRoot
 * @param {object} options
 * @param {object} [options.issueManager] - Issue manager adapter (list, listEpics)
 * @returns {Promise<string>} Formatted table or help message
 */
export async function milestoneList(projectRoot, options = {}) {
  const milestones = loadMilestones(projectRoot);

  if (milestones.length === 0) {
    return "No milestones defined. Run `milestone create <name>` to create one.";
  }

  const { issueManager } = options;

  // Collect epic data if issue manager available
  let epics = [];
  if (issueManager) {
    try {
      epics = await issueManager.listEpics();
    } catch {
      epics = [];
    }
  }

  const header = "| Name | Status | Target Date | Epic | Progress |";
  const sep = "|------|--------|-------------|------|----------|";
  const rows = [];

  for (const ms of milestones) {
    const targetDate = ms.target_date ?? "—";
    let epicCell = ms.epic_id ?? "—";
    let progress = "—";

    if (ms.epic_id && issueManager) {
      const epicExists = epics.some((e) => e.id === ms.epic_id);
      if (!epicExists) {
        epicCell = `${ms.epic_id} (broken)`;
        progress = "—";
      } else {
        try {
          const issues = await issueManager.list({ epicId: ms.epic_id });
          const open = issues.filter((i) => i.status !== "closed").length;
          const total = issues.length;
          progress = `${open}/${total} open`;
        } catch {
          progress = "—";
        }
      }
    }

    rows.push(`| ${ms.name} | ${ms.status} | ${targetDate} | ${epicCell} | ${progress} |`);
  }

  return [header, sep, ...rows].join("\n");
}
