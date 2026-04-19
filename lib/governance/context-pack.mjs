/**
 * Context-pack resolver.
 *
 * Shared between configurable-reviewers and configurable-checks specs.
 *
 * A pack is a named bundle of file globs (with an optional `extends` chain)
 * that is rendered into a single concatenated string for inclusion in a
 * subagent prompt.
 *
 * Contract (reviewer spec Behaviors 20-22, validate spec Behavior 23):
 *   - Pack name resolution: bundled defaults first; project `governance/*.yaml`
 *     entries layer on top (same name → full replacement).
 *   - `extends`: recursive; cycles fail load.
 *   - Glob includes: matched files concatenated, each prefixed with
 *     "=== <filename> ===\n". Empty globs emit `<no matches>`.
 *   - Denylist: `.env*`, `*.pem`, `*.key`, `id_*`, `profiles.yaml`,
 *     `**` + `/secrets/**` — matching globs fail load (not WARN).
 *   - Traversal guard: every concrete path must remain under repoRoot after
 *     `path.resolve` + `fs.realpath`. `..` segments in globs are rejected.
 *
 * Zero external deps; simple glob implementation (``*``, ``**``, ``?``).
 */

import {
  readFileSync,
  readdirSync,
  existsSync,
  realpathSync,
  statSync,
} from "node:fs";
import { resolve, join, relative, dirname, sep, basename } from "node:path";

const DENYLIST_PATTERNS = [
  /(^|\/)\.env($|[^/])/,         // .env, .env*, .env.local, .envrc, .env/xxx
  /\.pem($|[^/])/,
  /\.key($|[^/])/,
  /(^|\/)id_[^/]*/,              // id_rsa, id_rsa*, id_ed25519*, ...
  /(^|\/)profiles\.yaml$/,
  /(^|\/)secrets(\/|$)/,
];

/**
 * @param {Record<string, any>} bundledPacks  from templates/*.yaml
 * @param {Record<string, any>} projectPacks  from governance/*.yaml
 * @returns {{ packs: Record<string, any>, warnings: any[], errors: any[] }}
 */
export function mergePacks(bundledPacks, projectPacks) {
  const warnings = [];
  const errors = [];
  const packs = { ...(bundledPacks || {}) };
  for (const [name, entry] of Object.entries(projectPacks || {})) {
    if (packs[name]) {
      warnings.push({
        code: "CONTEXT_PACK_OVERRIDE",
        message: `Context pack '${name}' overrides bundled default.`,
      });
    }
    packs[name] = entry;
  }
  return { packs, warnings, errors };
}

/**
 * Resolve a pack's effective include list by walking extends.
 * Returns the expanded include list (flattened, in order).
 */
export function resolveExtends(packName, packs) {
  const errors = [];
  const seen = new Set();
  const chain = [];
  let cur = packName;
  while (cur !== undefined) {
    if (seen.has(cur)) {
      errors.push({
        code: "CONTEXT_PACK_CYCLE",
        message: `Context pack cycle detected: ${[...chain, cur].join(" → ")}.`,
      });
      return { includes: [], errors };
    }
    if (!packs[cur]) {
      errors.push({
        code: "UNKNOWN_CONTEXT_PACK",
        message: `Unknown context pack '${cur}'${chain.length ? ` (referenced via ${chain.join(" → ")})` : ""}.`,
      });
      return { includes: [], errors };
    }
    seen.add(cur);
    chain.push(cur);
    cur = packs[cur].extends;
  }
  // Walk root → child so child includes come last.
  chain.reverse();
  const includes = [];
  for (const link of chain) {
    const list = packs[link].include ?? [];
    for (const inc of list) includes.push(inc);
  }
  return { includes, errors };
}

/**
 * Render a pack to a single string.
 *
 * @param {string} packName
 * @param {Record<string, any>} packs
 * @param {{ repoRoot: string, targetSpecPath?: string }} ctx
 * @returns {{ rendered: string, files: string[], warnings: any[], errors: any[] }}
 */
export function renderPack(packName, packs, ctx) {
  const { repoRoot } = ctx;
  const warnings = [];
  const errors = [];
  const sections = [];
  const files = [];

  const resolved = resolveExtends(packName, packs);
  errors.push(...resolved.errors);
  if (resolved.errors.length) {
    return { rendered: "", files: [], warnings, errors };
  }

  for (const entry of resolved.includes) {
    const { glob, title } = normalizeInclude(entry);
    if (containsDotDot(glob)) {
      errors.push({
        code: "CONTEXT_PACK_TRAVERSAL",
        message: `Context pack '${packName}': glob '${glob}' contains '..' — path traversal is rejected.`,
      });
      continue;
    }
    if (isDenied(glob)) {
      errors.push({
        code: "CONTEXT_PACK_DENYLIST",
        message: `Context pack '${packName}': glob '${glob}' matches denylisted pattern (secrets/keys). Remove this include.`,
      });
      continue;
    }
    const matched = expandGlob(glob, repoRoot);
    // Filter matched files through denylist + traversal guard
    const safe = [];
    for (const abs of matched) {
      let realPath;
      try {
        realPath = realpathSync(abs);
      } catch {
        continue; // vanished between readdir and realpath
      }
      if (!isUnderRoot(realPath, repoRoot)) {
        errors.push({
          code: "CONTEXT_PACK_ESCAPE",
          message: `Context pack '${packName}': resolved path '${abs}' escapes repo root via symlink — rejected.`,
        });
        continue;
      }
      const relPath = relative(repoRoot, realPath);
      if (isDeniedPath(relPath)) {
        errors.push({
          code: "CONTEXT_PACK_DENYLIST_MATCH",
          message: `Context pack '${packName}': matched file '${relPath}' is on the denylist.`,
        });
        continue;
      }
      safe.push({ abs: realPath, rel: relPath });
    }

    if (safe.length === 0) {
      sections.push(`=== ${title ?? glob} ===\n<no matches>\n`);
      continue;
    }

    for (const { abs, rel } of safe) {
      let content;
      try {
        content = readFileSync(abs, "utf8");
      } catch (e) {
        warnings.push({
          code: "CONTEXT_PACK_READ",
          message: `Context pack '${packName}': could not read '${rel}': ${e.message}`,
        });
        continue;
      }
      sections.push(`=== ${rel} ===\n${content.endsWith("\n") ? content : content + "\n"}`);
      files.push(rel);
    }
  }

  return { rendered: sections.join("\n"), files, warnings, errors };
}

function normalizeInclude(entry) {
  if (typeof entry === "string") return { glob: entry, title: null };
  if (entry && typeof entry === "object") {
    return {
      glob: entry.glob ?? entry.path ?? "",
      title: entry.title ?? null,
    };
  }
  return { glob: "", title: null };
}

function containsDotDot(glob) {
  return glob.split("/").some((seg) => seg === ".." || seg === "./..");
}

function isDenied(glob) {
  return DENYLIST_PATTERNS.some((re) => re.test(glob));
}

function isDeniedPath(path) {
  return DENYLIST_PATTERNS.some((re) => re.test(path));
}

function isUnderRoot(abs, root) {
  const resolvedRoot = realpathSync(root);
  const rel = relative(resolvedRoot, abs);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !rel.startsWith("..");
}

/**
 * Expand a glob (supporting `*`, `**`, `?`) relative to rootDir.
 * Returns absolute paths of matching files (not directories).
 */
export function expandGlob(glob, rootDir) {
  const segments = glob.split("/").filter(Boolean);
  if (segments.length === 0) return [];
  return walk(rootDir, segments, 0);
}

function walk(currentDir, segments, index) {
  if (index === segments.length) {
    try {
      const st = statSync(currentDir);
      return st.isFile() ? [currentDir] : [];
    } catch {
      return [];
    }
  }
  const seg = segments[index];
  let entries;
  try {
    entries = readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  if (seg === "**") {
    // Match zero+ segments
    out.push(...walk(currentDir, segments, index + 1));
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env") continue;
      const next = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        out.push(...walk(next, segments, index)); // stay on **
      }
    }
    return out;
  }
  const matcher = globToRegex(seg);
  for (const entry of entries) {
    if (!matcher.test(entry.name)) continue;
    const next = join(currentDir, entry.name);
    if (index === segments.length - 1) {
      // final segment
      if (entry.isFile()) out.push(next);
    } else if (entry.isDirectory()) {
      out.push(...walk(next, segments, index + 1));
    }
  }
  return out;
}

function globToRegex(seg) {
  let re = "";
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else if ("^$.+(){}[]\\|".includes(c)) re += "\\" + c;
    else re += c;
  }
  return new RegExp("^" + re + "$");
}
