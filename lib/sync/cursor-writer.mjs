/**
 * Cursor sync-target writer — pure helper companion to skills/sync/SKILL.md.
 *
 * Spec: .context-index/specs/features/cursor-provider/sync-target-output.spec.md
 *
 * Constitution Principle 2 ("Skills are primarily markdown — companion code is
 * allowed but must not be required for the skill to function") — this module
 * exists so the markdown-described writer behaviour is independently testable
 * under `npm test`. /adev:sync the SKILL remains the authoritative contract;
 * this code is the executable reproduction of that contract.
 *
 * Public surface:
 *   - writeCursorSyncOutput({ projectRoot, targetPath, ... }) — atomic writer
 *   - composeCursorContent({ description, body, learnedLessons, userAdditions })
 *   - countBodyWords(content) — token count between frontmatter and User Additions
 *   - CURSOR_BODY_OVERSIZE — error token; thrown when body > 200 words
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";

export const CURSOR_BODY_OVERSIZE = "CURSOR_BODY_OVERSIZE";
const BODY_WORD_LIMIT = 200;
const USER_ADDITIONS_MARKER = "# User Additions";
const LEARNED_LESSONS_HEADING = "## Learned Lessons";

/**
 * Resolve the `description` value per the spec's derivation order.
 *   1. First H2 of constitution (heading text without `##`).
 *   2. Fallback: constitution Identity sentence (the first non-empty line after `## Identity`).
 *   3. Hard fallback: manifest project.name.
 *
 * @param {object} args
 * @param {string} [args.constitutionText]
 * @param {string} [args.manifestText]
 * @returns {string} A trimmed, single-line description (<= 200 chars).
 */
export function deriveDescription({ constitutionText = "", manifestText = "" }) {
  // Order 1: first H2 of constitution
  const h2Match = constitutionText.match(/^##\s+(.+?)\s*$/m);
  if (h2Match) {
    return clampDescription(h2Match[1]);
  }
  // Order 2: Identity sentence
  const idMatch = constitutionText.match(/^##\s*Identity\s*\n+([^\n]+)/m);
  if (idMatch) {
    return clampDescription(idMatch[1]);
  }
  // Order 3: manifest project.name
  const nameMatch = manifestText.match(/^\s*name:\s*(.+?)\s*$/m);
  if (nameMatch) {
    return clampDescription(nameMatch[1]);
  }
  return clampDescription("adev project");
}

function clampDescription(s) {
  const cleaned = s.replace(/[\r\n]+/g, " ").trim();
  return cleaned.length > 200 ? cleaned.slice(0, 200).trimEnd() : cleaned;
}

/**
 * Extract the project identity sentence (line 8 in the canonical template —
 * the first non-empty line after `## Identity`).
 *
 * @param {string} constitutionText
 * @returns {string}
 */
export function deriveIdentitySentence(constitutionText = "") {
  const m = constitutionText.match(/^##\s*Identity\s*\n+([^\n]+)/m);
  return m ? m[1].trim() : "adev project";
}

/**
 * Default 5-line pointer body matching the spec's body-composition algorithm.
 *
 * @param {string} identitySentence
 * @returns {string}
 */
export function defaultPointerBody(identitySentence) {
  return [
    identitySentence,
    "",
    "Non-negotiable principles, coding standards, and architecture boundaries live in `.context-index/constitution.md` — see that file for the source of truth.",
    "",
    "Companion projections: `CLAUDE.md` (Claude Code), `AGENTS.md` (OpenCode/Codex).",
  ].join("\n");
}

/**
 * Count whitespace-delimited tokens between the frontmatter close `---` and
 * the `# User Additions` marker (or EOF). Blank lines, the `## Learned Lessons`
 * heading, and the `# User Additions` heading itself are excluded.
 *
 * @param {string} content - Full file content (frontmatter + body + ...).
 * @returns {number}
 */
export function countBodyWords(content) {
  // Locate the closing --- of frontmatter.
  if (!content.startsWith("---\n")) {
    // No frontmatter — count everything up to the marker.
    return countBodyText(content);
  }
  const fmEnd = content.indexOf("\n---\n", 4);
  if (fmEnd < 0) return 0;
  const afterFm = content.slice(fmEnd + 5); // skip "\n---\n"
  return countBodyText(afterFm);
}

function countBodyText(s) {
  const markerIdx = s.indexOf("\n" + USER_ADDITIONS_MARKER);
  const bodyPart = markerIdx >= 0 ? s.slice(0, markerIdx) : s;
  // Strip the Learned Lessons heading line (if present) from the count.
  const lines = bodyPart
    .split("\n")
    .filter((l) => l.trim().length > 0 && l.trim() !== LEARNED_LESSONS_HEADING);
  const tokens = lines.join(" ").split(/\s+/).filter((t) => t.length > 0);
  return tokens.length;
}

/**
 * Compose the full file content for `.cursor/rules/adev.mdc`. Throws
 * `CURSOR_BODY_OVERSIZE` when the body exceeds 200 words.
 *
 * @param {object} args
 * @param {string} args.description
 * @param {string} args.body - Pointer body (without surrounding markers).
 * @param {string} [args.learnedLessons] - Full block including the `## Learned Lessons` heading.
 * @param {string} [args.userAdditions] - Content below the `# User Additions` marker (excludes the marker line itself).
 * @returns {string}
 */
export function composeCursorContent({ description, body, learnedLessons, userAdditions }) {
  const desc = clampDescription(description ?? "adev project");
  const frontmatter = `---\ndescription: ${desc}\nalwaysApply: true\n---\n`;
  const parts = [frontmatter, "\n", body.trimEnd(), "\n"];
  if (learnedLessons && learnedLessons.trim().length > 0) {
    parts.push("\n", learnedLessons.trim(), "\n");
  }
  parts.push("\n", USER_ADDITIONS_MARKER, "\n");
  if (userAdditions !== undefined && userAdditions !== null) {
    // userAdditions is the raw content below the marker; do not strip it.
    parts.push(userAdditions);
  }
  const content = parts.join("");

  // Word-count gate.
  const wc = countBodyWords(content);
  if (wc > BODY_WORD_LIMIT) {
    const err = new Error(`${CURSOR_BODY_OVERSIZE}: body word count ${wc} exceeds ${BODY_WORD_LIMIT}`);
    err.code = CURSOR_BODY_OVERSIZE;
    err.actualWordCount = wc;
    throw err;
  }
  return content;
}

/**
 * Extract the User Additions content (everything below the marker line) from
 * an existing file. Returns null when the marker is absent.
 *
 * @param {string} existing
 * @returns {string|null}
 */
export function extractUserAdditions(existing) {
  const marker = "\n" + USER_ADDITIONS_MARKER + "\n";
  const idx = existing.indexOf(marker);
  if (idx < 0) return null;
  // Everything strictly below the marker line.
  let below = existing.slice(idx + marker.length);
  // Strip a stale `## Learned Lessons` block that the legacy EOF-placement
  // writer may have parked here — re-sync moves it back above the marker.
  const stale = below.indexOf("\n" + LEARNED_LESSONS_HEADING);
  if (stale >= 0) {
    // Cut from the heading to the next `##` heading or EOF.
    const afterHeading = below.slice(stale + 1);
    const next = afterHeading.search(/\n##\s/);
    const removeUpTo = next >= 0 ? stale + 1 + next + 1 : below.length;
    below = below.slice(0, stale) + below.slice(removeUpTo);
  }
  return below;
}

/**
 * Atomic writer for `.cursor/rules/adev.mdc`. Implements the full pointer-projection
 * contract from the spec: read constitution + manifest, compose, preserve User
 * Additions, place Learned Lessons immediately before the marker, write atomically
 * via `.tmp` + rename.
 *
 * @param {object} args
 * @param {string} args.projectRoot - Absolute project root (the dir holding `.context-index/`).
 * @param {string} args.targetPath - Absolute path to write to.
 * @param {string} [args.heuristics] - Pre-rendered Learned Lessons block (heading + entries) or empty.
 * @param {boolean} [args.dryRun] - When true, return the proposed content without writing.
 * @param {string} [args.bodyOverride] - Used by tests to force an oversized body.
 * @returns {{ content: string, wrote: boolean, path: string }}
 */
export function writeCursorSyncOutput({
  projectRoot,
  targetPath,
  heuristics,
  dryRun = false,
  bodyOverride,
}) {
  // 1. Read constitution + manifest for description + body derivation.
  const conPath = projectRoot + "/.context-index/constitution.md";
  const manPath = projectRoot + "/.context-index/manifest.yaml";
  const constitutionText = existsSync(conPath) ? readFileSync(conPath, "utf8") : "";
  const manifestText = existsSync(manPath) ? readFileSync(manPath, "utf8") : "";

  // 2. Compose body (or use the test override).
  const description = deriveDescription({ constitutionText, manifestText });
  const identity = deriveIdentitySentence(constitutionText);
  const body = bodyOverride !== undefined ? bodyOverride : defaultPointerBody(identity);

  // 3. Read existing target for User Additions preservation (if present).
  const existing = existsSync(targetPath) ? readFileSync(targetPath, "utf8") : null;
  const userAdditions = existing !== null ? extractUserAdditions(existing) : null;

  // 4. Compose final content (throws CURSOR_BODY_OVERSIZE on oversize).
  const content = composeCursorContent({
    description,
    body,
    learnedLessons: heuristics,
    userAdditions,
  });

  if (dryRun) {
    return { content, wrote: false, path: targetPath };
  }

  // 5. Atomic write — only target the two paths under the writer's ownership.
  const tmp = targetPath + ".tmp";
  mkdirSync(dirname(targetPath), { recursive: true });
  try {
    writeFileSync(tmp, content);
    renameSync(tmp, targetPath);
  } catch (err) {
    // Clean up the .tmp if it exists.
    if (existsSync(tmp)) {
      try {
        unlinkSync(tmp);
      } catch {
        /* swallow — primary error wins */
      }
    }
    throw err;
  }

  return { content, wrote: true, path: targetPath };
}
