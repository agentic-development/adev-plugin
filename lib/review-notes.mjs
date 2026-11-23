/**
 * Read the open `warning` findings of a spec's latest architecture review so
 * `/adev:plan` can carry them into the plan instead of the operator re-running
 * review to clear them.
 *
 * `.review.md` bodies are reviewer-authored prose with no fixed finding
 * grammar, so extraction is a best-effort line scanner over the shapes the
 * reviewer prompts and the corpus actually produce:
 *
 *   ### SA-1 — warning — <section>              (heading, fields below)
 *   ### SA-2 — <title>   + `- **Severity:** warning` / `- **Location:** …`
 *   - **SEC-1** (warning, section: `x`): <text>
 *   - **CON-3 — warning** — *<section>* — <text>
 *   - [warning] SA-1: <text>
 *   **CON-1** — Severity: warning               (fields below)
 *   | SA-1 | warning | <section> | <text> |
 *   - WARNING: <text>                            (no ID)
 *
 * A finding is dropped when it is struck through (`~~`) or marked resolved,
 * when its severity is not `warning`, or when it sits inside a fenced code
 * block. The first open-warning occurrence of an ID wins, so a summary table
 * repeating a finding does not duplicate it, while a prior round's resolved
 * finding that reused the ID does not hide the current one.
 *
 * The verdict comes from the lifecycle log, never from `.review.md`: the log
 * is the gate's source of truth and the rendered report is only a view.
 *
 * @module lib/review-notes
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

import { currentState } from "./lifecycle-state.mjs";

const SUMMARY_MAX = 160;

// Tokens shaped like finding IDs that are references to other things.
const NON_FINDING_PREFIXES = new Set([
  "AC", "ADR", "BEH", "CWE", "ISO", "OWASP", "RFC", "SHA", "UTF",
]);

const SEVERITY_RE = /\b(blocker|warning|suggestion)s?\b/i;
const HEAD_PREFIX_RE =
  /^\s*(?:[-*+]\s+|\d+[.)]\s+|#{2,6}\s+)?((?:~~|\*\*|__|\[[A-Za-z]+\]\s*|\*\*ID:?\*\*:?\s*|ID:\s*)*)\s*/;
const UNNUMBERED_WARNING_RE = /^\s*[-*+]\s+(~~)?\**\[?WARNING\]?\**:?\**:?\s+(.+)$/;
const RESOLVED_UPPER_RE = /\bRESOLVED\b/;
const RESOLVED_MARK_RE = /~~|\*\*resolved\b|\(resolved\b|[—→:]\s*resolved\b|^\s*resolved\b/i;
const ANCHOR_WORD_RE = /^(?:preconditions|postconditions|error-cases|interface|behaviors|acceptance-criteria|integration-points)$/;
const FIELD_RE = /^\s*(?:[-*+]\s+)?\**([A-Za-z][A-Za-z _-]{0,24}?)\**\s*:\s*\**\s*(.*)$/;
const SUMMARY_LABELS = new Set(["finding", "this spec", "issue", "problem", "description", "summary"]);
const SECTION_LABELS = new Set(["location", "section", "section_anchor", "section anchor", "anchor"]);

function clean(text) {
  return String(text)
    .replace(/\*\*|__/g, "")
    .replace(/^\*+|\*+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[—–:\-\s]+/, "")
    .trim();
}

function oneLine(text) {
  const t = clean(text);
  if (t.length <= SUMMARY_MAX) return t;
  const cut = t.slice(0, SUMMARY_MAX - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 80 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function stripSummaryLabel(text) {
  const m = text.match(/^\**([A-Za-z][A-Za-z ]{0,20}?)\**\s*:\**\s+(.*)$/);
  if (m && SUMMARY_LABELS.has(m[1].trim().toLowerCase())) return m[2];
  return text;
}

function isResolved(text) {
  return RESOLVED_UPPER_RE.test(text) || RESOLVED_MARK_RE.test(text);
}

function isKebabCategory(text) {
  return /^`?[a-z]+(?:-[a-z]+)*`?$/.test(text.trim());
}

function reviewerFromHeading(text) {
  const t = clean(text);
  const paren = t.match(/\(([a-z0-9][a-z0-9-]*)\)\s*$/);
  return paren ? paren[1] : t;
}

/**
 * Match a finding head line. Returns null when the line does not open a
 * finding.
 */
function matchHead(line) {
  if (/^\s*\|/.test(line)) return matchTableRow(line);
  const prefix = line.match(HEAD_PREFIX_RE);
  const afterPrefix = line.slice(prefix[0].length);
  const id = afterPrefix.match(/^(?:Finding\s+)?\[?([A-Z][A-Z0-9]{0,7})-(\d{1,4})\b\]?/);
  if (!id || NON_FINDING_PREFIXES.has(id[1])) return null;
  const decorations = prefix[1] ?? "";
  const bracketSeverity = decorations.match(/\[([A-Za-z]+)\]/);
  return {
    id: `${id[1]}-${id[2]}`,
    heading: /^\s*#{2,6}\s/.test(line),
    struck: decorations.includes("~~"),
    rest: afterPrefix.slice(id[0].length),
    presetSeverity: bracketSeverity ? bracketSeverity[1].toLowerCase() : null,
    table: false,
  };
}

function matchTableRow(line) {
  const cells = line.split("|").slice(1, -1).map((c) => c.trim());
  if (cells.length < 3) return null;
  const id = cells[0].match(/^`?([A-Z][A-Z0-9]{0,7})-(\d{1,4})\b`?(.*)$/);
  if (!id || NON_FINDING_PREFIXES.has(id[1])) return null;
  const sevIdx = cells.findIndex((c, i) => i > 0 && /^`?(blocker|warning|suggestion)`?$/i.test(c));
  if (sevIdx < 0) return null;
  const tail = cells.slice(sevIdx + 1);
  const status = tail.findIndex((c) => /^\**(?:resolved|addressed|fixed|preserved|open|carried)\b/i.test(c));
  const resolved = status >= 0 && /^\**(?:resolved|addressed|fixed)\b/i.test(tail[status]);
  const content = tail.filter((_, i) => i !== status);
  const title = clean(id[3]);
  return {
    id: `${id[1]}-${id[2]}`,
    table: true,
    severity: cells[sevIdx].replace(/`/g, "").toLowerCase(),
    section: content.length > 1 ? clean(content[0]) || null : null,
    summary: title || (content.length > 0 ? content[content.length - 1] : ""),
    struck: line.includes("~~") || resolved,
  };
}

/**
 * Split a head line's remainder into severity, section and inline summary.
 */
function parseHeadRest(head) {
  let rest = head.rest.replace(/^\s*\*\*/, "");
  let severity = head.presetSeverity;
  const bracket = rest.match(/^\s*\[(blocker|warning|suggestion)\]\s*/i);
  if (bracket) {
    severity = severity ?? bracket[1].toLowerCase();
    rest = rest.slice(bracket[0].length);
  }
  let section = null;
  let summary = "";

  const sectionField = rest.match(/\bsection(?:_anchor)?:\s*`?([^`),]+)`?/i)
    ?? rest.match(/\banchor\s+`([^`]+)`/i);
  if (sectionField) section = clean(sectionField[1]);

  const paren = rest.match(/^\s*\(([^)]*)\)\s*(?:\*\*)?\s*:?\s*(?:\*\*)?\s*/);
  if (paren) {
    if (!section) {
      const anchors = [...paren[1].matchAll(/`([a-z][a-z0-9-]*)`/g)].map((m) => m[1])
        .filter((tok) => /\d/.test(tok) || ANCHOR_WORD_RE.test(tok));
      if (anchors.length > 0) section = anchors[anchors.length - 1];
    }
    const sev = paren[1].match(SEVERITY_RE);
    if (sev && !severity) severity = sev[1].toLowerCase();
    if (severity) {
      summary = rest.slice(paren[0].length).replace(/^[—–-]\s+/, "");
      return { severity, section, summary };
    }
    rest = rest.slice(paren[0].length).replace(/^[—–\s-]+/, " ");
  }

  const colon = rest.match(/^\s*(?:\*\*)?\s*:\s*(?:\*\*)?\s*/);
  if (colon && !head.heading) {
    return { severity, section, summary: rest.slice(colon[0].length) };
  }

  const piped = /\s\|\s/.test(rest);
  const segments = rest.split(/\s+[—–|·]\s+/).map((s) => s.trim()).filter((s) => clean(s) !== "");
  const sevIdx = segments.findIndex((s) =>
    /^\**`?\s*(?:severity:\s*)?`?(blocker|warning|suggestion)\b/i.test(s.replace(/^\*+/, "")));
  if (sevIdx < 0) return { severity, section, summary: segments.join(" — ") };

  if (!severity) severity = segments[sevIdx].match(SEVERITY_RE)[1].toLowerCase();
  const sevTail = segments[sevIdx].match(/^[^:]*?\b(?:blocker|warning|suggestion)\b`?\**\s*:\s*(.+)$/i);
  const after = segments.slice(sevIdx + 1).filter((s) => !/^category:/i.test(s) && !/^anchor\s/i.test(s));

  let sectionIdx = after.findIndex((s) => /^\*[^*].*\*$/.test(s) || /^(?:location|section):/i.test(s));
  if (sectionIdx < 0 && (head.heading || piped) && after.length > 0 && !isKebabCategory(after[0])) sectionIdx = 0;
  if (!section && sectionIdx >= 0) section = clean(after[sectionIdx].replace(/^(?:location|section):\s*/i, "")) || null;

  const remaining = after.filter((s, i) => i !== sectionIdx && !isKebabCategory(s));
  summary = [sevTail ? sevTail[1] : "", ...remaining].filter(Boolean).join(" — ");
  return { severity, section, summary };
}

/**
 * Join the wrapped continuation lines of a single-line list finding, stopping
 * at a blank line or the next list item / field.
 */
function withContinuation(text, blockLines) {
  const parts = [text];
  for (const raw of blockLines) {
    if (raw.trim() === "" || /^\s*(?:[-*+]\s|\d+[.)]\s|>|\||#)/.test(raw) || FIELD_RE.test(raw.trim()) && /^\s*\*\*/.test(raw)) break;
    parts.push(raw.trim());
  }
  return parts.join(" ");
}

/**
 * Collect field values (Severity, Location, Finding, …) from a finding's body.
 */
function readFields(blockLines) {
  const fields = { severity: null, section: null, summary: null, firstLine: null, resolved: false };
  for (let i = 0; i < blockLines.length; i++) {
    const raw = blockLines[i];
    const line = raw.trim();
    if (line === "") continue;
    if (/^\**(?:Resolved|Resolution|Status)\**\s*:\s*\**\s*(?:resolved|fixed|addressed)?/i.test(line)
      && /resolved|fixed|addressed/i.test(line)) {
      fields.resolved = true;
    }
    const f = line.match(FIELD_RE);
    if (f) {
      const label = f[1].trim().toLowerCase();
      const value = f[2];
      if (label === "severity" && !fields.severity) {
        const sev = value.match(SEVERITY_RE);
        if (sev) fields.severity = sev[1].toLowerCase();
        continue;
      }
      if (SECTION_LABELS.has(label) && !fields.section) {
        fields.section = clean(value.replace(/`/g, "")) || null;
        continue;
      }
      if (SUMMARY_LABELS.has(label) && !fields.summary) {
        fields.summary = value;
        continue;
      }
      if (label === "recommendation" || label === "id") continue;
    }
    if (!fields.firstLine) {
      fields.firstLine = withContinuation(stripSummaryLabel(line.replace(/^[-*+]\s+/, "")), blockLines.slice(i + 1));
    }
  }
  return fields;
}

/**
 * Extract the open `warning` findings from a `.review.md` body.
 *
 * @param {string} markdown
 * @returns {Array<{id: string|null, reviewer: string|null, section: string|null, summary: string}>}
 */
export function extractReviewWarnings(markdown) {
  if (typeof markdown !== "string" || markdown === "") return [];
  const lines = markdown.split(/\r?\n/);

  let inFence = false;
  let inFrontmatter = false;
  let reviewer = null;
  const heads = [];
  const boundaries = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && line.trim() === "---") { inFrontmatter = true; boundaries.add(i); continue; }
    if (inFrontmatter) { if (line.trim() === "---") inFrontmatter = false; boundaries.add(i); continue; }
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; boundaries.add(i); continue; }
    if (inFence) { boundaries.add(i); continue; }

    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) { reviewer = reviewerFromHeading(h2[1]); boundaries.add(i); continue; }

    const unnumbered = line.match(UNNUMBERED_WARNING_RE);
    if (unnumbered) {
      heads.push({ index: i, reviewer, head: { id: null, unnumbered: true, struck: Boolean(unnumbered[1]), text: unnumbered[2] } });
      continue;
    }
    const head = matchHead(line);
    if (head) { heads.push({ index: i, reviewer, head }); continue; }
    if (/^#{1,6}\s/.test(line) || /^\s*---\s*$/.test(line)) boundaries.add(i);
  }

  const headIndexes = new Set(heads.map((h) => h.index));
  const seen = new Set();
  const out = [];

  for (const { index, reviewer: who, head } of heads) {
    const block = [];
    for (let j = index + 1; j < lines.length; j++) {
      if (headIndexes.has(j) || boundaries.has(j)) break;
      block.push(lines[j]);
    }

    if (head.unnumbered) {
      if (head.struck || isResolved(head.text)) continue;
      out.push({ id: null, reviewer: who, section: null, summary: oneLine(head.text) });
      continue;
    }

    if (seen.has(head.id)) continue;

    let severity;
    let section;
    let summary;
    let resolved = head.struck;
    if (head.table) {
      ({ severity, section, summary } = head);
      resolved = resolved || isResolved(summary);
    } else {
      const parsed = parseHeadRest(head);
      const fields = head.heading || !parsed.severity || clean(parsed.summary) === ""
        ? readFields(block)
        : { severity: null, section: null, summary: null, firstLine: null, resolved: false };
      severity = parsed.severity ?? fields.severity;
      section = head.heading ? (fields.section ?? parsed.section) : (parsed.section ?? fields.section);
      const inline = clean(parsed.summary) === "" ? "" : withContinuation(parsed.summary, block);
      summary = inline || fields.summary || fields.firstLine || "";
      resolved = resolved || fields.resolved || isResolved(head.rest);
    }

    if (severity !== "warning" || resolved) continue;
    seen.add(head.id);
    out.push({ id: head.id, reviewer: who, section: section ? oneLine(section) : null, summary: oneLine(summary) });
  }

  return out;
}

function reviewPathFor(absSpec) {
  const stem = basename(absSpec).replace(/\.spec\.md$/, "").replace(/\.md$/, "");
  return join(dirname(absSpec), `${stem}.review.md`);
}

function storedFileSha(reviewText) {
  const m = reviewText.match(/^\s*(?:>\s*)?(?:\*\*)?file-sha:?(?:\*\*)?:?\s*`?([0-9a-fA-F<>A-Z_]+)`?\s*$/m);
  return m ? m[1] : null;
}

/**
 * Summarize a spec's latest review for carry-forward and re-review advice.
 *
 * `warnings` is empty when the lifecycle verdict is PASS (a PASS review has no
 * warnings by definition, so anything the scanner found there is history).
 * `unchangedSinceReview` is null when the report has no sha256 `file-sha`.
 *
 * @param {string} projectRoot
 * @param {string} specPath - project-relative or absolute
 * @returns {{
 *   spec: string,
 *   review: string|null,
 *   verdict: string|null,
 *   unchangedSinceReview: boolean|null,
 *   warnings: Array<{id: string|null, reviewer: string|null, section: string|null, summary: string}>,
 * }}
 */
export function readReviewNotes(projectRoot, specPath) {
  const absRoot = resolve(projectRoot);
  const absSpec = resolve(absRoot, specPath);
  const relSpec = relative(absRoot, absSpec);

  let verdict = null;
  try {
    const step = currentState(absRoot, relSpec).steps?.review;
    if (step && (step.status === "completed" || step.status === "failed") && typeof step.verdict === "string") {
      verdict = step.verdict;
    }
  } catch {
    verdict = null;
  }

  const absReview = reviewPathFor(absSpec);
  if (!existsSync(absReview)) {
    return { spec: relSpec, review: null, verdict, unchangedSinceReview: null, warnings: [] };
  }
  const reviewText = readFileSync(absReview, "utf8");

  let unchangedSinceReview = null;
  const stored = storedFileSha(reviewText);
  if (stored && /^[0-9a-f]{64}$/i.test(stored) && existsSync(absSpec)) {
    const current = createHash("sha256").update(readFileSync(absSpec)).digest("hex");
    unchangedSinceReview = current === stored.toLowerCase();
  }

  const warnings = verdict === "PASS" ? [] : extractReviewWarnings(reviewText);
  return { spec: relSpec, review: relative(absRoot, absReview), verdict, unchangedSinceReview, warnings };
}

export default { extractReviewWarnings, readReviewNotes };
