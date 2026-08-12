import { readFile } from "node:fs/promises";

const CONTEXT_FAMILY = /^(\s*[-–]\s*\d+)?\s+Context\b/;
const TASK_HEADING = /^#{2,4}\s+Task\s+(\d+)\b(.*)$/;
const PATH_TOKEN = (tok) => tok.includes("/") || /\.[A-Za-z0-9_-]+$/.test(tok);

// Fenced code blocks (``` or ~~~, three or more of either marker) can embed
// example plan text — including heading-shaped lines — that must not be
// mistaken for real TASK_HEADING/CONTEXT_FAMILY markers while scanning for
// region boundaries.
const FENCE_LINE = /^\s*(`{3,}|~{3,})/;

// A bold-labeled field line, e.g. "**Files:**", "**Tests:**", "**Context to
// load:**", optionally prefixed by a list-item bullet ("- **Files:** ...").
const FIELD_LABEL_LINE = /^\s*(?:[-*]\s+)?\*\*[^*]+\*\*/;
const FILES_LABEL_LINE = /^\s*(?:[-*]\s+)?\*\*Files:\*\*/;
const TESTS_LABEL_LINE = /^\s*(?:[-*]\s+)?\*\*Tests:\*\*/;
const SUB_BULLET_LINE = /^\s*[-*]\s+/;
const TOKEN_RE = /`[^`]+`|\S+/g;

function isTargetToken(raw) {
  const tok = raw.replace(/^`|`$/g, "").replace(/:\d+(-\d+)?$/, "");
  if (!PATH_TOKEN(tok)) return null;
  return tok.replace(/^\.\//, "");
}

function lineTokens(line) {
  return line.match(TOKEN_RE) ?? [];
}

/**
 * Extract tokens from the task-body region's **Files:** block only — the
 * label line itself (covers the inline shape, paths on the label line) plus
 * any immediately-following sub-bullet lines (covers the block shape:
 * Create:/Modify:/Test:/unlabelled sub-bullets), stopping at the first blank
 * line or the next bold-labeled field line.
 */
function extractFilesBlockTokens(regionLines) {
  const idx = regionLines.findIndex((l) => FILES_LABEL_LINE.test(l));
  if (idx === -1) return [];
  const tokens = [...lineTokens(regionLines[idx])];
  for (let i = idx + 1; i < regionLines.length; i++) {
    const line = regionLines[i];
    if (line.trim() === "") break;
    if (!SUB_BULLET_LINE.test(line) || FIELD_LABEL_LINE.test(line)) break;
    tokens.push(...lineTokens(line));
  }
  return tokens;
}

/** Extract tokens from the task-body region's single **Tests:** field line. */
function extractTestsFieldTokens(regionLines) {
  const line = regionLines.find((l) => TESTS_LABEL_LINE.test(l));
  return line ? lineTokens(line) : [];
}

export async function readTaskFiles(planPath, taskId) {
  const m = /^t(\d+)$/.exec(taskId);
  if (!m) return { targetPaths: [], available: false };
  const n = m[1];
  const text = await readFile(planPath, "utf8");
  const lines = text.split("\n");

  let regionStart = -1;
  let regionEnd = lines.length;
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE_LINE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const hm = TASK_HEADING.exec(line);
    if (!hm) continue;
    const [, num, remainder] = hm;
    const isContext = CONTEXT_FAMILY.test(remainder);
    if (isContext) continue; // context-family never opens/closes a region
    if (num === n && regionStart === -1) {
      regionStart = i + 1;
    } else if (regionStart !== -1 && num !== n) {
      regionEnd = i;
      break;
    }
  }
  if (regionStart === -1) return { targetPaths: [], available: false };

  const regionLines = lines.slice(regionStart, regionEnd);
  const tokens = [...extractFilesBlockTokens(regionLines), ...extractTestsFieldTokens(regionLines)];
  const paths = new Set();
  for (const tok of tokens) {
    const p = isTargetToken(tok);
    if (p) paths.add(p);
  }
  const targetPaths = [...paths];
  return { targetPaths, available: targetPaths.length > 0 };
}
