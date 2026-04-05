/**
 * beads_rust (br) CLI adapter for issue management.
 *
 * Wraps the `br` CLI using execFileSync with array arguments
 * (never string interpolation) to prevent shell injection.
 *
 * Epic operations are delegated to a FileAdapter instance since
 * beads_rust has no epic concept (hybrid approach per SA-5).
 *
 * Uses only Node.js built-ins: child_process, fs, path.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { FileAdapter } from "./file-adapter.mjs";
import { validateIssue, detectCycle } from "./interface.mjs";

export class BeadsAdapter {
  /**
   * @param {string} projectRoot
   * @param {object} [opts]
   * @param {boolean} [opts.checkBr=true] - Check if br is on PATH
   */
  constructor(projectRoot, opts = {}) {
    this.name = "beads";
    this.projectRoot = projectRoot;
    this.dbPath = join(projectRoot, ".beads");
    this.mapPath = join(projectRoot, ".context-index", "tasks", ".beads-map.json");

    // Delegate epic operations to file adapter (shares same storage root)
    this._fileAdapter = new FileAdapter(projectRoot);

    if (opts.checkBr !== false) {
      this._detectBr();
    }
  }

  _detectBr() {
    try {
      execFileSync("which", ["br"], { encoding: "utf8", stdio: "pipe" });
    } catch {
      const err = new Error(
        "beads_rust (br) is not available. Install from: https://github.com/Dicklesworthstone/beads_rust"
      );
      err.code = "BEADS_NOT_AVAILABLE";
      throw err;
    }
  }

  _runBr(args) {
    try {
      const fullArgs = ["--db", this.dbPath, ...args];
      const result = execFileSync("br", fullArgs, {
        encoding: "utf8",
        cwd: this.projectRoot,
        stdio: "pipe",
      });
      return result;
    } catch (err) {
      const error = new Error(`br command failed: ${err.stderr || err.message}`);
      error.code = "BEADS_COMMAND_FAILED";
      throw error;
    }
  }

  _readMap() {
    if (!existsSync(this.mapPath)) return {};
    try {
      return JSON.parse(readFileSync(this.mapPath, "utf8"));
    } catch {
      return {};
    }
  }

  _writeMap(map) {
    const dir = dirname(this.mapPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.mapPath, JSON.stringify(map, null, 2));
  }

  _getBeadsId(issueId) {
    const map = this._readMap();
    const entry = map[issueId];
    if (!entry) {
      const err = new Error(`No beads mapping for issue: ${issueId}`);
      err.code = "NOT_FOUND";
      throw err;
    }
    // Support both old format (plain string) and new format (object with beadsId)
    return typeof entry === "string" ? entry : entry.beadsId;
  }

  async init() {
    await this._fileAdapter.init();
  }

  async create(issueData) {
    const issue = validateIssue(issueData);

    const args = ["create", issue.title, "--type", issue.type, "--priority", String(issue.priority), "--json"];
    const output = this._runBr(args);
    const parsed = JSON.parse(output);

    const beadsId = parsed.id || parsed.issue_id;
    const map = this._readMap();
    const nextId = `issue-${Object.keys(map).filter(k => k.startsWith("issue-")).length + 1}`;

    issue.id = nextId;
    map[nextId] = { beadsId, epicId: issue.epicId, planRef: issue.planRef, planTask: issue.planTask };
    this._writeMap(map);

    return issue;
  }

  async update(id, changes) {
    const beadsId = this._getBeadsId(id);
    const args = ["update", beadsId];

    if (changes.status) args.push("--status", changes.status);
    args.push("--json");

    this._runBr(args);

    // Return updated issue shape
    return { id, ...changes, updated: new Date().toISOString() };
  }

  async close(id, reason) {
    const beadsId = this._getBeadsId(id);
    this._runBr(["close", beadsId, "--reason", reason]);
    return { id, status: "closed", notes: `Closed: ${reason}`, updated: new Date().toISOString() };
  }

  async list(filters = {}) {
    const output = this._runBr(["list", "--json"]);
    let items;
    try {
      const parsed = JSON.parse(output);
      // br list --json wraps results in { issues: [...] }
      items = Array.isArray(parsed) ? parsed : (parsed.issues || []);
    } catch {
      return [];
    }

    const map = this._readMap();
    const reverseMap = {};
    const metaMap = {};
    for (const [internalId, entry] of Object.entries(map)) {
      const beadsId = typeof entry === "string" ? entry : entry.beadsId;
      reverseMap[beadsId] = internalId;
      metaMap[internalId] = typeof entry === "string" ? {} : entry;
    }

    let result = items.map((item) => {
      const internalId = reverseMap[item.id] || item.id;
      const meta = metaMap[internalId] || {};
      return {
        id: internalId,
        title: item.title,
        status: item.status,
        priority: item.priority ?? 2,
        type: item.issue_type || item.type || "task",
        epicId: meta.epicId || undefined,
        planRef: meta.planRef || undefined,
        planTask: meta.planTask || undefined,
        dependencies: item.dependencies || [],
        notes: item.description || "",
        created: item.created_at || new Date().toISOString(),
        updated: item.updated_at || new Date().toISOString(),
      };
    });

    if (filters.status) result = result.filter((i) => i.status === filters.status);
    if (filters.type) result = result.filter((i) => i.type === filters.type);
    if (filters.epicId) result = result.filter((i) => i.epicId === filters.epicId);
    if (filters.planRef) result = result.filter((i) => i.planRef === filters.planRef);

    return result;
  }

  async get(id) {
    const all = await this.list({});
    return all.find((i) => i.id === id) || null;
  }

  // Epic operations delegated to file adapter (hybrid approach)
  async listEpics(filters = {}) {
    return this._fileAdapter.listEpics(filters);
  }

  async createEpic(epicData) {
    return this._fileAdapter.createEpic(epicData);
  }

  async updateEpic(id, changes) {
    return this._fileAdapter.updateEpic(id, changes);
  }

  async addDependency(issueId, dependsOnId) {
    const beadsId1 = this._getBeadsId(issueId);
    const beadsId2 = this._getBeadsId(dependsOnId);
    this._runBr(["dep", "add", beadsId1, beadsId2]);
  }
}

export default BeadsAdapter;
