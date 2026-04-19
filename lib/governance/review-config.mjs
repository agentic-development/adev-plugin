/**
 * Configurable reviewer registry loader.
 *
 * Contract: .context-index/specs/features/review/configurable-reviewers.md rev 3.
 *
 * Zero external deps. Consumes lib/profiles/ for posture introspection.
 */

import { readFileSync, existsSync, realpathSync } from "node:fs";
import { join, resolve, relative, sep, isAbsolute, dirname } from "node:path";

import { parseYaml } from "../profiles/yaml.mjs";
import {
  loadProfiles,
  getEffectivePosture,
  getPluginRoot,
} from "../profiles/index.mjs";
import { mergePacks } from "./context-pack.mjs";

const VALID_SEVERITY = new Set(["blocker", "warning", "suggestion"]);
const VALID_DISPATCH_STRING = new Set(["always", "triggered", "never"]);
const BUNDLED_REVIEWER_IDS = new Set([
  "structural-architect",
  "security-reviewer",
  "consistency-analyzer",
]);

/**
 * Load the merged reviewer registry for a repo.
 *
 * @param {string} repoRoot
 * @param {{ pluginRoot?: string, manifest?: any }} [opts]
 * @returns {{
 *   reviewers: any[],
 *   contextPacks: Record<string, any>,
 *   verdictRules: { blocker_threshold: number },
 *   profiles: Record<string, any>,
 *   warnings: any[],
 *   errors: any[],
 *   notes: string[],
 * }}
 */
export function loadReviewConfig(repoRoot, opts = {}) {
  const pluginRoot = opts.pluginRoot ?? getPluginRoot();
  const warnings = [];
  const errors = [];
  const notes = [];

  // Profiles first — we need posture introspection.
  const profilesResult = loadProfiles(repoRoot, { pluginRoot });
  warnings.push(...profilesResult.warnings);
  errors.push(...profilesResult.errors);
  notes.push(...profilesResult.notes);
  const profiles = profilesResult.profiles;

  // Bundled defaults.
  const bundledPath = join(pluginRoot, "templates", "review-specs", "defaults.yaml");
  if (!existsSync(bundledPath)) {
    errors.push({
      code: "REVIEW_DEFAULTS_MISSING",
      message: `Bundled review defaults not found at ${bundledPath}.`,
    });
    return emptyResult();
  }
  const bundled = loadYamlFile(bundledPath, errors);

  // Project overlay.
  const overlayPath = join(repoRoot, ".context-index", "governance", "review.yaml");
  let project = {};
  if (existsSync(overlayPath)) {
    project = loadYamlFile(overlayPath, errors);
  }

  // Merge reviewers: field-by-field for matching id, append for new ids.
  const bundledReviewers = Array.isArray(bundled.reviewers) ? bundled.reviewers : [];
  const projectReviewers = Array.isArray(project.reviewers) ? project.reviewers : [];
  const mergedReviewers = mergeReviewers(bundledReviewers, projectReviewers, warnings);

  // Manifest specialists deprecation (Behavior 39).
  if (opts.manifest && Array.isArray(opts.manifest.specialists)) {
    notes.push(
      "manifest.yaml:specialists is deprecated. Move entries to governance/review.yaml:reviewers. Support will be removed in 0.19.0."
    );
    for (const spec of opts.manifest.specialists) {
      if (!spec?.id) continue;
      if (mergedReviewers.find((r) => r.id === spec.id)) continue; // project entry takes precedence
      mergedReviewers.push({
        id: spec.id,
        name: spec.name ?? spec.id,
        dispatch: {
          triggered: {
            patterns: spec.trigger_patterns ?? [],
            keywords: spec.trigger_keywords ?? [],
            min_score: 1,
          },
        },
        prompt: spec.prompt,
        profile: "reviewer-capable",
        __source: "manifest-specialist",
      });
    }
  }

  // Validate + resolve each reviewer.
  const reviewers = [];
  for (const raw of mergedReviewers) {
    const validated = validateReviewer(raw, { repoRoot, pluginRoot }, errors);
    if (!validated) continue;
    // Posture check against profile (Behavior 11a).
    const profileName = validated.profile ?? "reviewer-capable";
    const posture = getEffectivePosture(profileName, profiles);
    if (!posture.posture) {
      errors.push(...posture.errors);
      continue;
    }
    const postureProblem = checkReadOnlyCompatible(validated.id, profileName, posture.posture);
    if (postureProblem) {
      errors.push(postureProblem);
      continue;
    }
    validated.profile = profileName;
    reviewers.push(validated);
  }

  // Context packs: merge bundled + project, exposed as-is. Renderer is owned by context-pack.mjs.
  const packsResult = mergePacks(bundled.context_packs ?? {}, project.context_packs ?? {});
  warnings.push(...packsResult.warnings);

  // Verdict rules merged field-by-field; project wins per field.
  const verdictRules = {
    blocker_threshold: 1,
    ...(bundled.verdict_rules ?? {}),
    ...(project.verdict_rules ?? {}),
  };

  return {
    reviewers,
    contextPacks: packsResult.packs,
    verdictRules,
    profiles,
    warnings,
    errors,
    notes,
  };
}

/**
 * Given a reviewer + its context, decide whether it should dispatch for a
 * given target spec.
 *
 * @param {any} reviewer
 * @param {{ targetSpecPath: string, specContent: string }} ctx
 * @returns {{ dispatch: boolean, score: number, reason: string }}
 */
export function shouldDispatch(reviewer, ctx) {
  const d = reviewer.dispatch;
  if (d === "never") return { dispatch: false, score: 0, reason: "disabled-dispatch" };
  if (d === "always") return { dispatch: true, score: Infinity, reason: "always" };
  const triggered = d && typeof d === "object" ? d.triggered ?? d : null;
  if (!triggered) return { dispatch: true, score: Infinity, reason: "default-always" };
  const patterns = triggered.patterns ?? [];
  const keywords = triggered.keywords ?? [];
  const minScore = triggered.min_score ?? 1;
  let score = 0;
  const target = ctx.targetSpecPath ?? "";
  for (const p of patterns) {
    if (globMatchPath(p, target)) {
      score += 2;
      const depth = Math.max(0, target.split("/").length - 1);
      score += depth;
    }
  }
  const content = (ctx.specContent ?? "").toLowerCase();
  for (const kw of keywords) {
    if (typeof kw === "string" && content.includes(kw.toLowerCase())) score += 1;
  }
  if (score >= minScore) {
    return { dispatch: true, score, reason: `triggered (score=${score} >= ${minScore})` };
  }
  return { dispatch: false, score, reason: `not triggered (score=${score} < ${minScore})` };
}

/**
 * Clamp a finding's severity to the reviewer's severity_cap.
 */
export function applySeverityCap(finding, reviewer) {
  const cap = reviewer.severity_cap ?? "blocker";
  const order = { suggestion: 0, warning: 1, blocker: 2 };
  const cur = order[finding.severity] ?? 2;
  const capLevel = order[cap] ?? 2;
  if (cur <= capLevel) return finding;
  return {
    ...finding,
    severity: cap,
    message: `[capped from ${finding.severity} to ${cap}] ${finding.message ?? ""}`.trim(),
  };
}

/**
 * Sanitize raw adapter output for the parse-failure fallback (Behavior 33).
 *
 * When a package-mode adapter returns text that does not parse as the findings
 * YAML block, the raw runner output MUST be sanitized before landing in the
 * committed `.review.md`:
 *   1. Redact via the profile's `redactor` (cross-cutting pipeline).
 *   2. Normalize absolute paths under `.context-index/`, the plugin root, or
 *      `$HOME` to repo-relative / `plugin:` / `~/` form.
 *   3. Truncate the visible portion to 8192 bytes with a tail marker.
 *
 * Returns `{ visible, full }`:
 *   - `visible` is safe to write into `.review.md`.
 *   - `full` is the post-redact, pre-truncate text; write only to the
 *     dispatch record, never to committed review output.
 *
 * @param {string} raw  adapter's raw output text
 * @param {{
 *   redactor: { redact: (s: string) => string },
 *   contextIndexRoot?: string,
 *   pluginRoot?: string,
 *   homeDir?: string,
 * }} ctx
 */
export function sanitizeAdapterOutput(raw, ctx) {
  const TRUNCATE_BYTES = 8192;
  const TAIL_MARKER = (n) => `\n…[truncated ${n} bytes of adapter output — see dispatch record for full text]`;
  const text = typeof raw === "string" ? raw : String(raw ?? "");
  const redacted = ctx.redactor?.redact ? ctx.redactor.redact(text) : text;
  const normalized = normalizeAbsolutePaths(redacted, ctx);
  const full = normalized;
  if (Buffer.byteLength(normalized, "utf8") <= TRUNCATE_BYTES) {
    return { visible: normalized, full };
  }
  // Byte-accurate truncation (UTF-8 safe: slice in chars then trim if needed).
  let cut = normalized.slice(0, TRUNCATE_BYTES);
  while (Buffer.byteLength(cut, "utf8") > TRUNCATE_BYTES) cut = cut.slice(0, -1);
  const droppedBytes = Buffer.byteLength(normalized, "utf8") - Buffer.byteLength(cut, "utf8");
  return { visible: cut + TAIL_MARKER(droppedBytes), full };
}

function normalizeAbsolutePaths(text, ctx) {
  let out = text;
  const replacements = [];
  if (ctx.contextIndexRoot) {
    const root = ctx.contextIndexRoot.replace(/[\\\/]+$/, "");
    replacements.push([root, ".context-index"]);
  }
  if (ctx.pluginRoot) {
    const root = ctx.pluginRoot.replace(/[\\\/]+$/, "");
    replacements.push([root, "plugin:"]);
  }
  if (ctx.homeDir) {
    const root = ctx.homeDir.replace(/[\\\/]+$/, "");
    replacements.push([root, "~"]);
  }
  // Longest prefix first so "plugin:" doesn't shadow "$HOME/adev-plugin".
  replacements.sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of replacements) {
    if (!from) continue;
    out = out.split(from).join(to);
  }
  return out;
}

/**
 * Compute the overall verdict from findings + verdict rules.
 */
export function computeVerdict(findings, verdictRules) {
  const threshold = verdictRules?.blocker_threshold ?? 1;
  let blockers = 0;
  let warnings = 0;
  for (const f of findings) {
    if (f.severity === "blocker") blockers++;
    else if (f.severity === "warning") warnings++;
  }
  if (blockers >= threshold) return "BLOCK";
  if (warnings > 0 || blockers > 0) return "PASS_WITH_NOTES";
  return "PASS";
}

// ----- internals -----

function emptyResult() {
  return {
    reviewers: [],
    contextPacks: {},
    verdictRules: { blocker_threshold: 1 },
    profiles: {},
    warnings: [],
    errors: [],
    notes: [],
  };
}

function loadYamlFile(path, errors) {
  try {
    const content = readFileSync(path, "utf8");
    return parseYaml(content) ?? {};
  } catch (e) {
    errors.push({ code: "YAML_PARSE", message: `${path}: ${e.message}` });
    return {};
  }
}

function mergeReviewers(bundled, project, warnings) {
  const byId = new Map();
  for (const r of bundled) {
    if (r?.id) byId.set(r.id, { ...r, __source: "bundled" });
  }
  for (const r of project) {
    if (!r?.id) continue;
    if (byId.has(r.id)) {
      const bundledEntry = byId.get(r.id);
      if (BUNDLED_REVIEWER_IDS.has(r.id)) {
        // Field-override audit on bundled defaults (informational).
        warnings.push({
          code: "BUNDLED_DEFAULT_OVERRIDE",
          message: `Reviewer '${r.id}' overrides bundled default. Consider documenting why in governance/review.yaml comments.`,
        });
      }
      byId.set(r.id, { ...bundledEntry, ...r, __source: "project-override" });
    } else {
      byId.set(r.id, { ...r, __source: "project" });
    }
  }
  return [...byId.values()];
}

function validateReviewer(raw, { repoRoot, pluginRoot }, errors) {
  if (!raw || typeof raw !== "object") {
    errors.push({ code: "REVIEWER_SHAPE", message: `Reviewer entry must be a map.` });
    return null;
  }
  const { id } = raw;
  if (!id || typeof id !== "string") {
    errors.push({ code: "REVIEWER_ID", message: `Reviewer entry missing 'id'.` });
    return null;
  }
  if (raw.enabled === false) {
    return null; // excluded from registry
  }

  const hasPrompt = typeof raw.prompt === "string" && raw.prompt !== "";
  const hasPackage = raw.package && typeof raw.package === "object";
  if (hasPrompt && hasPackage) {
    errors.push({
      code: "REVIEWER_MODE_CONFLICT",
      message: `Reviewer '${id}': must declare either 'prompt' or 'package', not both.`,
    });
    return null;
  }
  if (!hasPrompt && !hasPackage) {
    errors.push({
      code: "REVIEWER_MODE_MISSING",
      message: `Reviewer '${id}': must declare 'prompt' (subagent mode) or 'package' (external-skill mode).`,
    });
    return null;
  }

  const dispatch = raw.dispatch ?? "always";
  if (typeof dispatch === "string" && !VALID_DISPATCH_STRING.has(dispatch)) {
    errors.push({
      code: "REVIEWER_DISPATCH",
      message: `Reviewer '${id}': dispatch must be one of always|triggered|never (got '${dispatch}').`,
    });
    return null;
  }

  const severityCap = raw.severity_cap ?? "blocker";
  if (!VALID_SEVERITY.has(severityCap)) {
    errors.push({
      code: "REVIEWER_SEVERITY_CAP",
      message: `Reviewer '${id}': severity_cap must be blocker|warning|suggestion (got '${severityCap}').`,
    });
    return null;
  }

  const validated = {
    id,
    name: raw.name ?? id,
    dispatch,
    profile: raw.profile,
    context_pack: raw.context_pack ?? "base",
    severity_cap: severityCap,
    __source: raw.__source,
  };

  if (hasPrompt) {
    const resolved = resolveReviewerPath(id, "prompt", raw.prompt, { repoRoot, pluginRoot }, errors);
    if (!resolved) return null;
    validated.mode = "subagent";
    validated.promptPath = resolved.path;
    validated.promptDisplay = raw.prompt;
  } else {
    const pkg = raw.package;
    if (!pkg.skill) {
      errors.push({
        code: "REVIEWER_PACKAGE_SKILL",
        message: `Reviewer '${id}': package.skill is required.`,
      });
      return null;
    }
    const skillResolved = resolveReviewerPath(id, "package.skill", pkg.skill, { repoRoot, pluginRoot }, errors);
    if (!skillResolved) return null;
    const adapterSpec = pkg.adapter ?? "plugin:review-specs/adapters/generic.md";
    const adapterResolved = resolveReviewerPath(id, "package.adapter", adapterSpec, { repoRoot, pluginRoot }, errors);
    if (!adapterResolved) return null;
    validated.mode = "package";
    validated.skillPath = skillResolved.path;
    validated.skillDisplay = pkg.skill;
    validated.adapterPath = adapterResolved.path;
    validated.adapterDisplay = adapterSpec;
    validated.args = pkg.args ?? {};
  }

  return validated;
}

function resolveReviewerPath(reviewerId, field, rawPath, { repoRoot, pluginRoot }, errors) {
  if (typeof rawPath !== "string" || rawPath === "") {
    errors.push({ code: "REVIEWER_PATH", message: `Reviewer '${reviewerId}': ${field} must be a non-empty string.` });
    return null;
  }
  // Cross-plugin reference (double colon) → deferred to v2.
  if (/^plugin:[^/]*:/.test(rawPath)) {
    errors.push({
      code: "CROSS_PLUGIN_REF",
      message: `Reviewer '${reviewerId}': cross-plugin ${field} references (${rawPath}) are not supported in v1.`,
    });
    return null;
  }
  if (rawPath.startsWith("plugin:")) {
    const rest = rawPath.slice("plugin:".length);
    // Form: <skill-name>/<file>
    const pluginSkillsRoot = resolve(pluginRoot, "skills");
    const target = resolve(pluginSkillsRoot, rest);
    if (!isUnder(target, pluginSkillsRoot)) {
      errors.push({
        code: "PLUGIN_PATH_ESCAPE",
        message: `Reviewer '${reviewerId}': ${field} '${rawPath}' resolves outside plugin 'skills/' tree — rejected.`,
      });
      return null;
    }
    if (!existsSync(target)) {
      errors.push({
        code: "PLUGIN_FILE_MISSING",
        message: `Reviewer '${reviewerId}': ${field} file not found: ${target}.`,
      });
      return null;
    }
    return { path: target };
  }

  if (isAbsolute(rawPath)) {
    errors.push({
      code: "ABS_PATH_REJECTED",
      message: `Reviewer '${reviewerId}': absolute ${field} paths are not supported.`,
    });
    return null;
  }

  // Reject '..' segments pre-resolution.
  if (rawPath.split("/").some((s) => s === "..")) {
    errors.push({
      code: "PATH_DOT_DOT",
      message: `Reviewer '${reviewerId}': ${field} '${rawPath}' contains '..' — path traversal rejected.`,
    });
    return null;
  }

  const contextRoot = resolve(repoRoot, ".context-index");
  const target = resolve(contextRoot, rawPath);
  if (!isUnder(target, contextRoot)) {
    errors.push({
      code: "REPO_PATH_ESCAPE",
      message: `Reviewer '${reviewerId}': ${field} path '${rawPath}' resolves outside .context-index/ — relative paths may not traverse out of the context-index tree.`,
    });
    return null;
  }
  if (!existsSync(target)) {
    errors.push({
      code: "FILE_MISSING",
      message: `Reviewer '${reviewerId}': ${field} file not found: ${target}.`,
    });
    return null;
  }
  // Symlink escape check (realpath)
  let real;
  try {
    real = realpathSync(target);
  } catch (e) {
    errors.push({
      code: "REALPATH",
      message: `Reviewer '${reviewerId}': cannot resolve ${field} '${rawPath}': ${e.message}.`,
    });
    return null;
  }
  if (!isUnder(real, realpathSync(contextRoot))) {
    errors.push({
      code: "SYMLINK_ESCAPE",
      message: `Reviewer '${reviewerId}': ${field} '${rawPath}' resolves outside .context-index/ via symlink — rejected.`,
    });
    return null;
  }
  return { path: real };
}

function isUnder(abs, root) {
  const rel = relative(root, abs);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function checkReadOnlyCompatible(reviewerId, profileName, posture) {
  const forbiddenCategories = new Set(["filesystem-write", "shell"]);
  const offenders = [];
  for (const entry of posture.allow) {
    if (!entry || typeof entry !== "object") continue;
    if (entry.category && forbiddenCategories.has(entry.category)) {
      offenders.push(`category '${entry.category}'`);
    }
    if (entry.tool !== undefined) {
      offenders.push(`literal tool '${entry.tool}'`);
    }
  }
  if (posture.fsWrite !== "deny") offenders.push(`filesystem.write=${posture.fsWrite}`);
  if (posture.fsExecute !== "deny") offenders.push(`filesystem.execute=${posture.fsExecute}`);
  if (posture.network !== "deny" && posture.network !== "read-only") {
    offenders.push(`network=${posture.network}`);
  }
  if (offenders.length === 0) return null;
  return {
    code: "REVIEWER_PROFILE_POSTURE",
    message: `Reviewer '${reviewerId}': profile '${profileName}' is not read-only-compatible (${offenders.join(", ")}). Reviewer dispatch rejects profiles that permit 'filesystem-write', 'shell', literal tools, or non-read-only network. Use a profile that extends 'read-only' (e.g. reviewer-fast/reviewer-capable/reviewer-reasoning/browser-review).`,
  };
}

// Minimal path glob matcher for dispatch.triggered.patterns.
function globMatchPath(pattern, path) {
  // Convert glob → regex. Supports `**`, `*`, `?`.
  let re = "^";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "*" && pattern[i + 1] === "*") {
      re += ".*";
      i += 2;
      if (pattern[i] === "/") i++;
      continue;
    }
    if (c === "*") {
      re += "[^/]*";
    } else if (c === "?") {
      re += "[^/]";
    } else if ("^$.+(){}[]\\|".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
    i++;
  }
  re += "$";
  return new RegExp(re).test(path);
}
