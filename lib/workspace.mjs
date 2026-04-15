import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, resolve, dirname, relative, sep } from "path";
import { execFileSync } from "child_process";

/**
 * Walk up from startPath looking for adev-workspace.yaml.
 * Returns { root, config, currentRepoSlug } or null if not found.
 */
export function detectWorkspace(startPath) {
  let dir = resolve(startPath);
  const root = dirname(dir);

  while (true) {
    const candidate = join(dir, "adev-workspace.yaml");
    if (existsSync(candidate)) {
      const config = parseWorkspaceFile(candidate, dir);
      const currentRepoSlug = resolveCurrentRepo(dir, config, startPath);
      return { root: dir, config, currentRepoSlug };
    }
    const parent = dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }

  return null;
}

/**
 * Assemble a read-only WorkspaceContext.
 */
export function resolveWorkspaceContext(workspaceRoot, config, currentRepoSlug) {
  if (currentRepoSlug !== null) {
    const found = config.repos.find((r) => r.slug === currentRepoSlug);
    if (!found) {
      throw new Error(`Repo '${currentRepoSlug}' not found in workspace.`);
    }
  }

  const warnings = [];
  const repoContexts = config.repos
    .filter((r) => !r.missing)
    .map((r) => {
      const repoPath = resolve(workspaceRoot, r.path);
      const contextPath = join(repoPath, ".context-index");
      const hasContext = existsSync(contextPath);
      if (!hasContext) {
        warnings.push(
          `Repo '${r.slug}' has no .context-index/ — context unavailable.`
        );
      }
      return {
        slug: r.slug,
        path: repoPath,
        role: r.role || null,
        contextPath: hasContext ? contextPath : null,
      };
    });

  const currentRepo = currentRepoSlug
    ? repoContexts.find((r) => r.slug === currentRepoSlug) || null
    : null;

  const siblingRepos = currentRepoSlug
    ? repoContexts.filter((r) => r.slug !== currentRepoSlug)
    : repoContexts;

  return {
    workspaceName: config.workspace.name,
    workspaceRoot,
    currentRepo,
    siblingRepos,
    dependencyGraph: config.dependencies,
    warnings,
  };
}

/**
 * Resolve a cross-repo reference like @repo-slug/spec-slug to an absolute path.
 * Returns the absolute path or null if not found.
 */
export function resolveRef(workspaceRoot, config, ref) {
  if (!ref || !ref.startsWith("@")) return null;

  const slashIdx = ref.indexOf("/");
  if (slashIdx === -1) return null;

  const repoSlug = ref.substring(1, slashIdx);
  const specSlug = ref.substring(slashIdx + 1);

  const repo = config.repos.find((r) => r.slug === repoSlug);
  if (!repo) return null;

  const repoPath = resolve(workspaceRoot, repo.path);
  const specsDir = join(repoPath, ".context-index", "specs", "features");

  if (!existsSync(specsDir)) return null;

  // Recursive search for spec-slug.md
  return findSpec(specsDir, `${specSlug}.md`);
}

// --- Internal helpers ---

function parseWorkspaceFile(filePath, workspaceRoot) {
  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (err) {
    throw new Error(`Failed to parse adev-workspace.yaml: ${err.message}`);
  }

  let parsed;
  try {
    parsed = parseSimpleYaml(raw);
  } catch (err) {
    throw new Error(`Failed to parse adev-workspace.yaml: ${err.message}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(
      "Invalid adev-workspace.yaml: missing required field 'workspace.name'"
    );
  }

  if (!parsed.workspace || !parsed.workspace.name) {
    throw new Error(
      "Invalid adev-workspace.yaml: missing required field 'workspace.name'"
    );
  }

  if (!parsed._reposSeen) {
    throw new Error(
      "Invalid adev-workspace.yaml: missing required field 'repos'"
    );
  }

  const warnings = [];
  const slugs = new Set();

  for (const repo of parsed.repos) {
    if (!repo.slug) {
      throw new Error(
        "Invalid adev-workspace.yaml: missing required field 'slug' on repo entry"
      );
    }
    if (!repo.path) {
      throw new Error(
        "Invalid adev-workspace.yaml: missing required field 'path' on repo entry"
      );
    }
    if (slugs.has(repo.slug)) {
      throw new Error(`Duplicate repo slug '${repo.slug}' in adev-workspace.yaml`);
    }
    slugs.add(repo.slug);

    // Check if repo path exists
    const resolvedPath = resolve(workspaceRoot, repo.path);
    if (!existsSync(resolvedPath)) {
      warnings.push(`Repo '${repo.slug}' path '${repo.path}' does not exist`);
      repo.missing = true;
    }
  }

  // Validate dependencies
  const dependencies = parsed.dependencies || [];
  for (const dep of dependencies) {
    if (!slugs.has(dep.from)) {
      throw new Error(
        `Dependency references unknown repo '${dep.from}'`
      );
    }
    if (!slugs.has(dep.to)) {
      throw new Error(
        `Dependency references unknown repo '${dep.to}'`
      );
    }
  }

  return {
    workspace: parsed.workspace,
    repos: parsed.repos,
    dependencies,
    warnings,
  };
}

function resolveCurrentRepo(workspaceRoot, config, startPath) {
  const absStart = resolve(startPath);

  for (const repo of config.repos) {
    const repoAbsPath = resolve(workspaceRoot, repo.path);
    const rel = relative(repoAbsPath, absStart);
    // startPath is inside this repo if relative path doesn't start with ..
    if (!rel.startsWith("..") && !rel.startsWith(sep)) {
      return repo.slug;
    }
  }

  return null;
}

/**
 * Minimal YAML parser for adev-workspace.yaml.
 * Handles the known schema: workspace.name, repos[], dependencies[].
 * Uses Node.js built-in JSON via a simple line-by-line parser.
 */
function parseSimpleYaml(content) {
  const lines = content.split("\n");
  const result = { workspace: {}, repos: [], dependencies: [] };
  let reposSeen = false;

  let section = null; // "workspace" | "repos" | "dependencies"
  let currentRepo = null;
  let currentDep = null;

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Top-level keys
    if (/^workspace:/.test(trimmed)) {
      if (currentRepo) { result.repos.push(currentRepo); currentRepo = null; }
      if (currentDep) { result.dependencies.push(currentDep); currentDep = null; }
      section = "workspace";
      // Handle inline empty: `workspace: {}`
      if (/\{\}/.test(trimmed)) section = null;
      continue;
    }
    if (/^repos:/.test(trimmed)) {
      if (currentRepo) { result.repos.push(currentRepo); currentRepo = null; }
      if (currentDep) { result.dependencies.push(currentDep); currentDep = null; }
      reposSeen = true;
      section = "repos";
      // Handle inline empty: `repos: []`
      if (/\[\]/.test(trimmed)) section = null;
      continue;
    }
    if (/^dependencies:/.test(trimmed)) {
      if (currentRepo) { result.repos.push(currentRepo); currentRepo = null; }
      if (currentDep) { result.dependencies.push(currentDep); currentDep = null; }
      section = "dependencies";
      if (/\[\]/.test(trimmed)) {
        result.dependencies = [];
        section = null;
      }
      continue;
    }
    if (/^\S/.test(trimmed)) {
      if (currentRepo) { result.repos.push(currentRepo); currentRepo = null; }
      if (currentDep) { result.dependencies.push(currentDep); currentDep = null; }
      section = null;
      continue;
    }

    if (section === "workspace") {
      const m = trimmed.match(/^\s+name:\s*["']?([^"'\n]+?)["']?\s*$/);
      if (m) result.workspace.name = m[1].trim();
    }

    if (section === "repos") {
      const slugStart = trimmed.match(/^\s+-\s+slug:\s*["']?([^"'\s]+)["']?/);
      if (slugStart) {
        if (currentRepo) result.repos.push(currentRepo);
        currentRepo = { slug: slugStart[1] };
        continue;
      }
      if (currentRepo) {
        const pathM = trimmed.match(/^\s+path:\s*["']?([^"'\n]+?)["']?\s*$/);
        if (pathM) currentRepo.path = pathM[1].trim();
        const roleM = trimmed.match(/^\s+role:\s*["']?([^"'\n]+?)["']?\s*$/);
        if (roleM) currentRepo.role = roleM[1].trim();
      }
    }

    if (section === "dependencies") {
      const fromStart = trimmed.match(/^\s+-\s+from:\s*["']?([^"'\s]+)["']?/);
      if (fromStart) {
        if (currentDep) result.dependencies.push(currentDep);
        currentDep = { from: fromStart[1] };
        continue;
      }
      if (currentDep) {
        const toM = trimmed.match(/^\s+to:\s*["']?([^"'\s]+)["']?\s*$/);
        if (toM) currentDep.to = toM[1].trim();
        const typeM = trimmed.match(/^\s+type:\s*["']?([^"'\n]+?)["']?\s*$/);
        if (typeM) currentDep.type = typeM[1].trim();
      }
    }
  }

  // Flush last items
  if (currentRepo) result.repos.push(currentRepo);
  if (currentDep) result.dependencies.push(currentDep);

  // Detect malformed YAML: if we got no recognized structure at all
  // and the content has non-comment, non-empty lines, it's likely malformed
  const hasContent = lines.some(
    (l) => l.trim() && !l.trim().startsWith("#")
  );
  const hasAnyKey = result.workspace.name || reposSeen;
  if (hasContent && !hasAnyKey) {
    throw new Error("unrecognized structure");
  }

  result._reposSeen = reposSeen;
  return result;
}

function findSpec(dir, filename) {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = findSpec(fullPath, filename);
        if (found) return found;
      } else if (entry.name === filename) {
        return fullPath;
      }
    }
  } catch {
    // Directory not readable
  }
  return null;
}
