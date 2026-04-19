/**
 * Schema validation for execution profiles.
 *
 * Enforces the contract in
 * .context-index/specs/cross-cutting/execution-profiles.md Behaviors 5, 6, 7, 14.
 *
 * Returns structured errors/warnings. The loader owns lifting these to thrown
 * errors or WARN-channel emissions as appropriate.
 */

const VALID_FS_SETTINGS = new Set(["allow", "deny"]);
const VALID_NETWORK_SETTINGS = new Set(["allow", "read-only", "deny"]);
const VALID_TIERS = new Set(["fast", "capable", "reasoning"]);
const VALID_THINKING = new Set(["low", "medium", "high"]);
const KNOWN_TOP_LEVEL = new Set([
  "description",
  "extends",
  "permissions",
  "model",
  "limits",
  "env",
]);

/**
 * @typedef {{ code: string, message: string }} ProfileIssue
 * @typedef {{ errors: ProfileIssue[], warnings: ProfileIssue[] }} ValidateResult
 */

/**
 * Validate one profile entry against the schema.
 * @param {string} name
 * @param {any} raw
 * @returns {ValidateResult}
 */
export function validateProfile(name, raw) {
  /** @type {ProfileIssue[]} */ const errors = [];
  /** @type {ProfileIssue[]} */ const warnings = [];
  const err = (code, message) => errors.push({ code, message });
  const warn = (code, message) => warnings.push({ code, message });

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    err("SHAPE", `Profile '${name}' must be a map.`);
    return { errors, warnings };
  }

  for (const key of Object.keys(raw)) {
    if (!KNOWN_TOP_LEVEL.has(key)) {
      warn("UNKNOWN_FIELD", `Profile '${name}': unknown field '${key}' — ignored.`);
    }
  }

  if (raw.extends !== undefined && typeof raw.extends !== "string") {
    err("EXTENDS_TYPE", `Profile '${name}': 'extends' must be a string name.`);
  }

  const tools = raw.permissions?.tools;
  const hasExtends = typeof raw.extends === "string";
  if (tools !== undefined) {
    if (typeof tools !== "object" || Array.isArray(tools)) {
      err("TOOLS_TYPE", `Profile '${name}': permissions.tools must be a map.`);
    } else {
      const hasAllow = Array.isArray(tools.allow);
      const hasAllowAdd = Array.isArray(tools.allow_add);
      if (hasAllow && hasAllowAdd) {
        err(
          "ALLOW_MIX",
          `Profile '${name}': permissions.tools may not set both 'allow' and 'allow_add' on the same profile.`
        );
      }
      if (!hasExtends && hasAllowAdd && !hasAllow) {
        err(
          "ALLOW_ADD_NO_EXTENDS",
          `Profile '${name}': 'allow_add' requires 'extends' — it is additive to a parent's allow list.`
        );
      }
      for (const list of [tools.allow, tools.allow_add]) {
        if (!Array.isArray(list)) continue;
        for (const entry of list) {
          validateToolEntry(name, entry, err);
        }
      }
    }
  } else if (!hasExtends) {
    err(
      "MISSING_ALLOW",
      `Profile '${name}': missing required field 'permissions.tools.allow' (no 'extends' to inherit from).`
    );
  }

  const fs = raw.permissions?.filesystem;
  if (fs !== undefined) {
    if (typeof fs !== "object" || Array.isArray(fs)) {
      err("FS_TYPE", `Profile '${name}': permissions.filesystem must be a map.`);
    } else {
      for (const k of ["write", "execute"]) {
        if (fs[k] !== undefined && !VALID_FS_SETTINGS.has(fs[k])) {
          err(
            "FS_VALUE",
            `Profile '${name}': permissions.filesystem.${k} must be 'allow' or 'deny' (got '${fs[k]}').`
          );
        }
      }
    }
  }

  const net = raw.permissions?.network;
  if (net !== undefined && !VALID_NETWORK_SETTINGS.has(net)) {
    err(
      "NET_VALUE",
      `Profile '${name}': permissions.network must be 'allow', 'read-only', or 'deny' (got '${net}').`
    );
  }

  const model = raw.model;
  if (model !== undefined) {
    if (typeof model !== "object" || Array.isArray(model)) {
      err("MODEL_TYPE", `Profile '${name}': model must be a map.`);
    } else {
      if (model.tier !== undefined && !VALID_TIERS.has(model.tier)) {
        err(
          "MODEL_TIER",
          `Profile '${name}': model.tier must be one of fast|capable|reasoning (got '${model.tier}').`
        );
      }
      if (
        model.thinking_budget !== undefined &&
        !VALID_THINKING.has(model.thinking_budget)
      ) {
        err(
          "MODEL_THINKING",
          `Profile '${name}': model.thinking_budget must be low|medium|high.`
        );
      }
    }
  }

  const env = raw.env;
  if (env !== undefined) {
    if (typeof env !== "object" || Array.isArray(env)) {
      err("ENV_TYPE", `Profile '${name}': env must be a map.`);
    } else {
      if (env.files !== undefined && !Array.isArray(env.files)) {
        err("ENV_FILES_TYPE", `Profile '${name}': env.files must be a list.`);
      }
      if (env.allow !== undefined) {
        if (typeof env.allow !== "object" || Array.isArray(env.allow)) {
          err("ENV_ALLOW_TYPE", `Profile '${name}': env.allow must be a map.`);
        } else {
          const required = env.allow.required ?? [];
          const optional = env.allow.optional ?? [];
          if (!Array.isArray(required) || !Array.isArray(optional)) {
            err(
              "ENV_ALLOW_LIST",
              `Profile '${name}': env.allow.required and env.allow.optional must be lists.`
            );
          } else {
            const r = new Set(required);
            for (const k of optional) {
              if (r.has(k)) {
                err(
                  "ENV_ALLOW_DUP",
                  `Profile '${name}': env key '${k}' listed in both required and optional.`
                );
              }
            }
          }
        }
      }
    }
  }

  return { errors, warnings };
}

function validateToolEntry(profileName, entry, err) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    err(
      "TOOL_SHAPE",
      `Profile '${profileName}': tool entry must be a map with exactly one of category|mcp_server|tool (got ${JSON.stringify(entry)}).`
    );
    return;
  }
  const keys = new Set(Object.keys(entry));
  const variants = ["category", "mcp_server", "tool"].filter((k) => keys.has(k));
  if (variants.length === 0) {
    err(
      "TOOL_SHAPE",
      `Profile '${profileName}': tool entry requires one of category|mcp_server|tool.`
    );
    return;
  }
  if (variants.length > 1) {
    err(
      "TOOL_SHAPE",
      `Profile '${profileName}': tool entry may declare only one of category|mcp_server|tool (got ${variants.join("+")}).`
    );
    return;
  }
  const variant = variants[0];
  if (variant === "category") {
    if (typeof entry.category !== "string") {
      err(
        "TOOL_CATEGORY_TYPE",
        `Profile '${profileName}': tool entry 'category' must be a string.`
      );
      return;
    }
    if (entry.category === "*" || entry.category.includes("*")) {
      err(
        "TOOL_WILDCARD",
        `Profile '${profileName}': wildcard category '${entry.category}' is rejected. Enumerate required categories explicitly.`
      );
    }
  } else if (variant === "mcp_server") {
    if (typeof entry.mcp_server !== "string" || entry.mcp_server === "") {
      err(
        "TOOL_MCP_TYPE",
        `Profile '${profileName}': tool entry 'mcp_server' must be a non-empty string.`
      );
    }
  } else if (variant === "tool") {
    if (typeof entry.tool !== "string" || entry.tool === "") {
      err(
        "TOOL_LITERAL_TYPE",
        `Profile '${profileName}': tool entry 'tool' must be a non-empty string.`
      );
    }
    if (entry.allow_unportable !== true) {
      err(
        "TOOL_UNPORTABLE",
        `Profile '${profileName}': tool entry '${entry.tool}' requires 'allow_unportable: true'. Literal tool entries bypass category portability; opt in explicitly.`
      );
    }
  }
}

/**
 * Validate every profile in a merged set.
 * @param {Record<string, any>} profiles
 * @returns {{ errors: ProfileIssue[], warnings: ProfileIssue[] }}
 */
export function validateAll(profiles) {
  const errors = [];
  const warnings = [];
  for (const [name, raw] of Object.entries(profiles || {})) {
    const r = validateProfile(name, raw);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  }
  return { errors, warnings };
}
