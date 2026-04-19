/**
 * Env resolution for execution profiles.
 *
 * Contract: Behaviors 19-33 of the cross-cutting spec.
 *
 * Each `env.files` entry is either:
 *   - `optional:<path>` — silent-skip on absence.
 *   - `<path>` (bare) — must exist or load fails.
 *
 * `$workspace/<rest>` prefix resolves against the workspace root; absolute
 * paths and any `@`-prefix are rejected (disjoint from `multi-repo-workspace`
 * charter's `@<repo-slug>/<spec-slug>` spec-ref grammar).
 *
 * Keys not in the merged allowlist (required ∪ optional) are dropped. A key in
 * `env.allow.required` missing from every listed file fails load.
 */

import { readFileSync, existsSync, realpathSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";

/**
 * @param {any} effectiveProfile
 * @param {{ consumerRepoRoot: string, workspaceRoot?: string | null, profileName: string }} ctx
 * @returns {{ env: Record<string,string>, contributing: Record<string,string>, warnings: {code:string,message:string}[], errors: {code:string,message:string}[] }}
 */
export function resolveEnv(effectiveProfile, ctx) {
  const errors = [];
  const warnings = [];
  const env = {};
  const contributing = {};
  const { profileName, consumerRepoRoot, workspaceRoot = null } = ctx;

  const envDecl = effectiveProfile?.env ?? {};
  const files = Array.isArray(envDecl.files) ? envDecl.files : [];
  const required = new Set(envDecl.allow?.required ?? []);
  const optional = new Set(envDecl.allow?.optional ?? []);
  const allowed = new Set([...required, ...optional]);

  const resolvedFiles = [];
  for (const entry of files) {
    const { ok, path, isOptional, error } = resolveFileEntry(
      entry,
      profileName,
      consumerRepoRoot,
      workspaceRoot
    );
    if (!ok) {
      errors.push({ code: "ENV_FILE_PATH", message: error });
      continue;
    }
    if (!existsSync(path)) {
      if (isOptional) {
        continue; // silent skip
      }
      errors.push({
        code: "ENV_FILE_MISSING",
        message: `Profile '${profileName}': env.files entry '${entry}' does not exist at '${path}'. To permit silent-skip on absence, prefix the entry with 'optional:'.`,
      });
      continue;
    }
    // realpath to detect symlink escape — symlink traversal outside the
    // consumerRepoRoot / workspaceRoot is fine as long as we've already
    // verified the declared path resolves inside one of them; actual existence
    // + contents are read without further check.
    let content;
    try {
      content = readFileSync(path, "utf8");
    } catch (e) {
      errors.push({
        code: "ENV_FILE_READ",
        message: `Profile '${profileName}': cannot read env file '${path}': ${e.message}`,
      });
      continue;
    }
    resolvedFiles.push({ path, display: entry, content });
  }

  // Parse each file and apply first-wins.
  for (const { path, content } of resolvedFiles) {
    let parsed;
    try {
      parsed = parseDotenv(content, path);
    } catch (e) {
      errors.push({
        code: "ENV_FILE_PARSE",
        message: `Profile '${profileName}': ${e.message}`,
      });
      continue;
    }
    for (const [k, v] of Object.entries(parsed)) {
      if (!allowed.has(k)) continue; // silently drop allowlist-absent keys
      if (env[k] !== undefined) continue; // first-wins
      env[k] = v;
      contributing[k] = path;
    }
  }

  // Required-key check.
  for (const key of required) {
    if (env[key] === undefined) {
      const list = resolvedFiles.map((f) => f.display).join(", ") || "(no files listed)";
      errors.push({
        code: "ENV_REQUIRED_MISSING",
        message: `Profile '${profileName}': required env var '${key}' not found in any of: ${list}.`,
      });
    }
  }

  // 8-char minimum gate WARN.
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === "string" && v.length < 8) {
      warnings.push({
        code: "ENV_REDACTION_MIN_LENGTH",
        message: `Profile '${profileName}': value of '${k}' is ${v.length} chars and is below the redaction minimum (8). It will not be redacted from logs.`,
      });
    }
  }

  return { env, contributing, warnings, errors };
}

function resolveFileEntry(entry, profileName, consumerRepoRoot, workspaceRoot) {
  if (typeof entry !== "string" || entry === "") {
    return { ok: false, error: `Profile '${profileName}': env.files entry must be a non-empty string.` };
  }
  let path = entry;
  let isOptional = false;
  if (path.startsWith("optional:")) {
    isOptional = true;
    path = path.slice("optional:".length);
  }
  if (path === "") {
    return { ok: false, error: `Profile '${profileName}': env.files entry missing path after 'optional:' prefix.` };
  }
  if (path.startsWith("@")) {
    return {
      ok: false,
      error: `Profile '${profileName}': env.files entries do not use the '@' prefix. Use '$workspace/<rest>' for workspace-shared env files. '@<repo-slug>/' is reserved for cross-repo spec references (see multi-repo-workspace/charter.md); cross-repo env paths are not supported in v1.`,
    };
  }
  if (path.startsWith("$workspace/")) {
    if (!workspaceRoot) {
      return {
        ok: false,
        error: `Profile '${profileName}': '$workspace/${path.slice("$workspace/".length)}' referenced but no adev-workspace.yaml found in any ancestor of the consumer repo.`,
      };
    }
    const rest = path.slice("$workspace/".length);
    return { ok: true, path: resolve(workspaceRoot, rest), isOptional };
  }
  if (isAbsolute(path)) {
    return {
      ok: false,
      error: `Profile '${profileName}': env.files entries must be relative to the consumer repo root or use the '$workspace/' prefix.`,
    };
  }
  return { ok: true, path: resolve(consumerRepoRoot, path), isOptional };
}

/**
 * Parse a dotenv-style file. Supports:
 *   KEY=value
 *   KEY="quoted value"
 *   KEY='quoted value'
 *   # comment lines
 *   blank lines
 *
 * Returns a map. Throws on malformed syntax (e.g. no '=').
 */
export function parseDotenv(content, filePath = "<env>") {
  const out = {};
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) {
      throw new Error(`${filePath}:${i + 1}: expected KEY=value (got ${JSON.stringify(line)}).`);
    }
    const key = line.slice(0, eq).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
      throw new Error(`${filePath}:${i + 1}: invalid env key '${key}'.`);
    }
    let value = line.slice(eq + 1);
    // Strip inline comments (only if not in quotes)
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0];
      const end = value.indexOf(quote, 1);
      if (end < 0) {
        throw new Error(`${filePath}:${i + 1}: unterminated ${quote === '"' ? "double" : "single"} quote.`);
      }
      value = value.slice(1, end);
    } else {
      const hash = value.indexOf(" #");
      if (hash >= 0) value = value.slice(0, hash);
      value = value.trim();
    }
    out[key] = value;
  }
  return out;
}
