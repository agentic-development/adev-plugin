/**
 * Locate and read the previous review round's report for a target spec.
 *
 * `/adev:review-specs` writes one `.review.md` per spec and overwrites it at the
 * end of every round, so at dispatch time the file on disk (if any) is the
 * PREVIOUS round's report. Handing it to the next round's reviewers is what
 * stops a finding the spec has since resolved from being re-raised from scratch.
 *
 * Only the frontmatter fields with a closed shape (`verdict`, the reviewed
 * revision, `date`) are parsed out; everything else is returned as the raw
 * body. The report's prose layout is free-form across projects and revisions,
 * so no attempt is made to parse individual findings — the reviewer reads them.
 */

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

const VERDICTS = new Set(["PASS", "PASS_WITH_NOTES", "BLOCK"]);

/**
 * The `.review.md` path for a spec, using the same `<x>.spec.md → <x>.review.md`
 * convention `adev artifact commit --kind review` writes to. A target that is
 * not a `.spec.md` has no review artifact.
 *
 * @param {string} specPath
 * @returns {string | null}
 */
export function priorReviewPathForSpec(specPath) {
  if (typeof specPath !== "string" || !specPath.endsWith(".spec.md")) return null;
  return specPath.replace(/\.spec\.md$/, ".review.md");
}

/**
 * Read the prior review for `specPath`, or `null` when there is none.
 *
 * Fails soft: a missing, unreadable, or out-of-repo path yields `null`, because
 * a review round with no prior-round context is exactly today's behavior and is
 * always safe.
 *
 * @param {string} repoRoot
 * @param {string} specPath  repo-relative (or absolute, inside `repoRoot`)
 * @returns {{
 *   path: string,
 *   verdict: "PASS"|"PASS_WITH_NOTES"|"BLOCK"|null,
 *   revision: number|null,
 *   date: string|null,
 *   body: string,
 * } | null}
 */
export function loadPriorReview(repoRoot, specPath) {
  const reviewPath = priorReviewPathForSpec(specPath);
  if (!reviewPath || !repoRoot) return null;

  const absRoot = resolve(repoRoot);
  const absReview = isAbsolute(reviewPath) ? resolve(reviewPath) : resolve(absRoot, reviewPath);
  if (!absReview.startsWith(absRoot + sep)) return null;
  if (!existsSync(absReview)) return null;

  let text;
  try {
    text = readFileSync(absReview, "utf8");
  } catch {
    return null;
  }

  const { frontmatter, body } = splitFrontmatter(text);
  const verdictRaw = field(frontmatter, "verdict");
  const revisionRaw = field(frontmatter, "last-reviewed-revision");
  const dateRaw = field(frontmatter, "date");

  return {
    path: relative(absRoot, absReview).split(sep).join("/"),
    verdict: verdictRaw && VERDICTS.has(verdictRaw) ? verdictRaw : null,
    revision: revisionRaw && /^\d+$/.test(revisionRaw) ? Number(revisionRaw) : null,
    date: dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null,
    body,
  };
}

function splitFrontmatter(text) {
  const m = /^﻿?\s*---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { frontmatter: "", body: text };
  return { frontmatter: m[1], body: text.slice(m[0].length).replace(/^(?:\r?\n)+/, "") };
}

function field(frontmatter, key) {
  const re = new RegExp(`^${key}:[ \\t]*["']?([^"'\\r\\n]*?)["']?[ \\t]*$`, "m");
  const m = re.exec(frontmatter);
  return m ? m[1] : null;
}
