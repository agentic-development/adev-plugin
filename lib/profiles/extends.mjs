/**
 * Resolve `extends` chains into effective profiles.
 *
 * Contract: .context-index/specs/cross-cutting/execution-profiles.md Behaviors 8, 9, 10, 14a, 14b.
 *
 * Merge rules:
 *   - permissions.tools.allow: parent ∪ child.allow_add OR child.allow replaces parent
 *   - permissions.filesystem, permissions.network: child wins per field
 *   - model, limits: child wins per field
 *   - env.files: child's list replaces parent's (no concatenation)
 *   - env.allow.required, env.allow.optional: unions; required-wins on collision
 *
 * A broadening in child relative to parent posture (allow_add introducing a new
 * tool/category, or fs/network loosening) emits a WARN — surfaced at load, not
 * an adapter-level advisory.
 */

const DEPTH_LIMIT = 16;
const POSTURE_STRENGTH = { deny: 0, "read-only": 1, allow: 2 };

/**
 * Resolve a profile's effective shape by walking the extends chain from root → child.
 * @param {string} name
 * @param {Record<string, any>} profiles  // validated raw profiles keyed by name
 * @returns {{ effective: any, warnings: {code: string, message: string}[], errors: {code: string, message: string}[] }}
 */
export function resolveEffective(name, profiles) {
  const errors = [];
  const warnings = [];
  const chain = [];
  let seen = new Set();
  let cur = name;
  while (cur !== undefined) {
    if (seen.has(cur)) {
      errors.push({
        code: "CYCLE",
        message: `Profile cycle detected: ${[...chain, cur].join(" → ")}.`,
      });
      return { effective: null, warnings, errors };
    }
    if (chain.length >= DEPTH_LIMIT) {
      errors.push({
        code: "DEPTH",
        message: `Profile '${name}': extends chain too deep (>${DEPTH_LIMIT}).`,
      });
      return { effective: null, warnings, errors };
    }
    seen.add(cur);
    const entry = profiles[cur];
    if (!entry) {
      errors.push({
        code: "UNKNOWN_PARENT",
        message: `Profile '${chain[chain.length - 1] ?? name}': extends unknown profile '${cur}'.`,
      });
      return { effective: null, warnings, errors };
    }
    chain.push(cur);
    cur = entry.extends;
  }

  // Walk root → leaf so later layers override.
  chain.reverse();
  let effective = empty();
  let parentEffective = empty();
  for (const link of chain) {
    parentEffective = cloneDeep(effective);
    const layer = profiles[link];
    effective = applyLayer(link, effective, layer, warnings);
    detectBroadening(link, parentEffective, effective, warnings);
  }
  return { effective, warnings, errors };
}

function empty() {
  return {
    description: undefined,
    permissions: {
      tools: { allow: [] },
      filesystem: { write: "deny", execute: "deny" },
      network: "deny",
    },
    model: {},
    limits: {},
    env: { files: [], allow: { required: [], optional: [] } },
  };
}

function applyLayer(linkName, base, layer, warnings) {
  const out = cloneDeep(base);

  if (layer.description !== undefined) out.description = layer.description;

  // Tools
  const t = layer.permissions?.tools;
  if (t) {
    if (Array.isArray(t.allow)) {
      out.permissions.tools.allow = t.allow.map(cloneDeep);
    }
    if (Array.isArray(t.allow_add)) {
      const existing = out.permissions.tools.allow;
      for (const entry of t.allow_add) {
        if (!findToolEntry(existing, entry)) existing.push(cloneDeep(entry));
      }
    }
  }

  // Filesystem / network
  const fs = layer.permissions?.filesystem;
  if (fs) {
    if (fs.write !== undefined) out.permissions.filesystem.write = fs.write;
    if (fs.execute !== undefined) out.permissions.filesystem.execute = fs.execute;
  }
  if (layer.permissions?.network !== undefined) {
    out.permissions.network = layer.permissions.network;
  }

  // Model / limits: child wins per field
  if (layer.model) {
    for (const [k, v] of Object.entries(layer.model)) out.model[k] = v;
  }
  if (layer.limits) {
    for (const [k, v] of Object.entries(layer.limits)) out.limits[k] = v;
  }

  // Env
  if (layer.env) {
    if (Array.isArray(layer.env.files)) {
      out.env.files = [...layer.env.files]; // replace, not concat
    }
    const la = layer.env.allow;
    if (la) {
      const req = new Set(out.env.allow.required);
      const opt = new Set(out.env.allow.optional);
      for (const k of la.required ?? []) {
        req.add(k);
        opt.delete(k);
      }
      for (const k of la.optional ?? []) {
        if (!req.has(k)) opt.add(k);
      }
      out.env.allow.required = [...req];
      out.env.allow.optional = [...opt];
    }
  }
  return out;
}

function detectBroadening(linkName, parent, child, warnings) {
  // Tool additions
  const parentTools = parent.permissions.tools.allow;
  const childTools = child.permissions.tools.allow;
  for (const entry of childTools) {
    if (!findToolEntry(parentTools, entry)) {
      // only warn if parentTools was non-empty (i.e. this link extends something)
      if (parentTools.length > 0) {
        warnings.push({
          code: "BROADEN_TOOL",
          message: `Profile '${linkName}': allow_add broadens posture by adding ${describeEntry(entry)}.`,
        });
      }
    }
  }
  // Filesystem / network broadening
  const posture = (v) => POSTURE_STRENGTH[v] ?? 0;
  if (parent.permissions.filesystem.write !== child.permissions.filesystem.write &&
      posture(child.permissions.filesystem.write) > posture(parent.permissions.filesystem.write)) {
    if (parent.permissions.tools.allow.length > 0) {
      warnings.push({
        code: "BROADEN_FS_WRITE",
        message: `Profile '${linkName}': filesystem.write broadened '${parent.permissions.filesystem.write}' → '${child.permissions.filesystem.write}'.`,
      });
    }
  }
  if (parent.permissions.filesystem.execute !== child.permissions.filesystem.execute &&
      posture(child.permissions.filesystem.execute) > posture(parent.permissions.filesystem.execute)) {
    if (parent.permissions.tools.allow.length > 0) {
      warnings.push({
        code: "BROADEN_FS_EXEC",
        message: `Profile '${linkName}': filesystem.execute broadened '${parent.permissions.filesystem.execute}' → '${child.permissions.filesystem.execute}'.`,
      });
    }
  }
  if (posture(child.permissions.network) > posture(parent.permissions.network)) {
    if (parent.permissions.tools.allow.length > 0) {
      warnings.push({
        code: "BROADEN_NETWORK",
        message: `Profile '${linkName}': network broadened '${parent.permissions.network}' → '${child.permissions.network}'.`,
      });
    }
  }
}

function findToolEntry(list, entry) {
  return list.find((x) => toolEntriesEqual(x, entry));
}

function toolEntriesEqual(a, b) {
  if (!a || !b) return false;
  if (a.category !== undefined && a.category === b.category) return true;
  if (a.mcp_server !== undefined && a.mcp_server === b.mcp_server) return true;
  if (a.tool !== undefined && a.tool === b.tool) return true;
  return false;
}

function describeEntry(entry) {
  if (entry.category !== undefined) return `category '${entry.category}'`;
  if (entry.mcp_server !== undefined) return `mcp_server '${entry.mcp_server}'`;
  if (entry.tool !== undefined) return `tool '${entry.tool}'`;
  return JSON.stringify(entry);
}

function cloneDeep(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(cloneDeep);
  const out = {};
  for (const [k, val] of Object.entries(v)) out[k] = cloneDeep(val);
  return out;
}
