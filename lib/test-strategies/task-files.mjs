import { readFile } from "node:fs/promises";

const CONTEXT_FAMILY = /^(\s*[-–]\s*\d+)?\s+Context\b/;
const TASK_HEADING = /^#{2,4}\s+Task\s+(\d+)\b(.*)$/;
const PATH_TOKEN = (tok) => tok.includes("/") || /\.[A-Za-z0-9_-]+$/.test(tok);

function isTargetToken(raw) {
  const tok = raw.replace(/^`|`$/g, "").replace(/:\d+(-\d+)?$/, "");
  if (!PATH_TOKEN(tok)) return null;
  return tok.replace(/^\.\//, "");
}

export async function readTaskFiles(planPath, taskId) {
  const m = /^t(\d+)$/.exec(taskId);
  if (!m) return { targetPaths: [], available: false };
  const n = m[1];
  const text = await readFile(planPath, "utf8");
  const lines = text.split("\n");

  let regionStart = -1;
  let regionEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const hm = TASK_HEADING.exec(lines[i]);
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

  const region = lines.slice(regionStart, regionEnd).join("\n");
  const tokens = region.match(/`[^`]+`|\S+/g) ?? [];
  const paths = new Set();
  for (const tok of tokens) {
    const p = isTargetToken(tok);
    if (p) paths.add(p);
  }
  const targetPaths = [...paths];
  return { targetPaths, available: targetPaths.length > 0 };
}
