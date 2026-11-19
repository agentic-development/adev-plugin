/**
 * Decide whether a review cycle may diff-scope its reviewer dispatch (BEH-8),
 * and if so produce the scoped spec text.
 *
 * This is the I/O half of diff-scoping: it reads the spec, the lifecycle log
 * (`currentState`) and the prior committed text (`git show HEAD:<path>`). The
 * text-only half lives in `diff-scope.mjs`. Shared by
 * `adev governance diff-scope` and `adev governance dispatch`, so both verbs
 * reach the same decision for the same spec.
 *
 * Diff-scoping is a cost optimization only. Every "cannot safely scope"
 * condition fails OPEN to full context, never to a partial guess.
 */

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { currentState } from "../lifecycle-state.mjs";
import {
  extractChangedSections,
  expandWithCrossReferences,
  renderScopedContent,
} from "./diff-scope.mjs";

/**
 * Strip a leading `# Title` line and `---`-delimited frontmatter block,
 * returning everything after the closing fence. Falls back to the input
 * unchanged if fewer than two `---`-only lines are found.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripFrontmatter(text) {
  const fenceMatches = [...text.matchAll(/^---\s*$/gm)];
  if (fenceMatches.length < 2) return text;
  return text.slice(fenceMatches[1].index + fenceMatches[1][0].length).replace(/^\n/, "");
}

/**
 * @param {string} absRoot   absolute project root
 * @param {string} relSpec   project-relative spec path (already validated)
 * @param {string} absSpec   absolute spec path (already validated to exist)
 * @returns {{
 *   scoped: boolean,
 *   reason: "first-review"|"git-unavailable"|"no-content-changed"|"diff-scoped",
 *   changed_anchors: string[],
 *   content: string,
 * }}
 */
export function resolveDiffScope(absRoot, relSpec, absSpec) {
  const currFullText = readFileSync(absSpec, "utf8");
  const revMatch = /^revision:\s*(\d+)\s*$/m.exec(currFullText);
  const currentRevision = revMatch ? Number(revMatch[1]) : 1;
  // Frontmatter-stripped body only: splitIntoSections' heading-range logic
  // treats a heading's range as extending to the next SAME-OR-HIGHER-level
  // heading, so the doc's own H1 title (level 1, nothing else in a spec is
  // level 1) would otherwise swallow the entire rest of the document as
  // "its" section — including every H2 the frontmatter's revision bump has
  // nothing to do with.
  const currText = stripFrontmatter(currFullText);

  const state = currentState(absRoot, relSpec);
  const byRevision = state?.steps?.review?.byRevision ?? {};
  const hasEarlierCompletedReview = Object.values(byRevision).some(
    (b) => b && typeof b.revision === "number" && b.revision < currentRevision && b.completed_at !== null,
  );
  if (!hasEarlierCompletedReview) {
    return { scoped: false, reason: "first-review", changed_anchors: [], content: "" };
  }

  // Best-effort prior text via git. Any failure (not a repo, file untracked,
  // no HEAD, spawn error) fails open to full-context dispatch.
  const gitResult = spawnSync("git", ["show", `HEAD:${relSpec}`], {
    cwd: absRoot,
    encoding: "utf8",
  });
  if (gitResult.status !== 0 || typeof gitResult.stdout !== "string") {
    return { scoped: false, reason: "git-unavailable", changed_anchors: [], content: "" };
  }
  const prevText = stripFrontmatter(gitResult.stdout);

  const changed = extractChangedSections(prevText, currText);
  if (changed.size === 0) {
    // Nothing to scope to. Handing reviewers an empty spec would review
    // nothing at all, so fall back to full context like every other
    // "cannot scope" case.
    return { scoped: false, reason: "no-content-changed", changed_anchors: [], content: "" };
  }
  const expandedAnchors = expandWithCrossReferences(currText, new Set(changed.keys()));

  return {
    scoped: true,
    reason: "diff-scoped",
    changed_anchors: [...expandedAnchors],
    content: renderScopedContent(currText, expandedAnchors),
  };
}
