// lib/parallel/groups.mjs
//
// Parse the `## Parallelization` section of a plan into independent groups, and
// compute a deterministic merge-back order. Consumed by /adev:implement --parallel
// (worktree-parallelization/parallel-implement.spec.md). Pure — Node built-ins only.
//
// The group-line grammar (documented in skills/plan/SKILL.md) is strict —
// "- Group <id> (independent|sequential): Task <n>[ → Task <n>]..." — but the
// prose around and after it is not, e.g.:
//   - Group A (independent): Task 1 — foo
//   - Group C (sequential): Task 4 → Task 5 (shared files)
// so the parser is tolerant of surrounding prose while strict on the grammar
// itself: it returns `{ groups, malformed, warnings }` and never throws,
// letting the caller serial-fallback on `malformed: true` (empty section, or
// any group line whose "(independent|sequential)" marker didn't match) or an
// absent section.

const SECTION_RE = /^##\s+Parallelization\s*$/im;
// "- Group A (independent): Task 1 → Task 2 ..." — capture id, independence, tail.
const GROUP_LINE_RE = /^\s*[-*]\s*Group\s+([A-Za-z0-9]+)\s*\((independent|sequential)\)\s*:\s*(.*)$/i;
// A bulleted line that starts the "Group <id>" grammar regardless of what
// follows — used only to detect a line whose author clearly intended
// GROUP_LINE_RE but got the "(independent|sequential)" marker wrong, so it
// can be surfaced as a warning instead of vanishing with no signal.
const GROUP_INTENT_RE = /^\s*[-*]\s*Group\s+([A-Za-z0-9]+)\b/i;
// A task reference must start with a digit — this is what excludes prose
// words ("task in this chain" -> "in") — and stops at the first non-id
// character, so sentence punctuation ("Task 6.") is never folded into the id.
const TASK_RE = /\bTask\s+(\d+(?:\.\d+)*[A-Za-z]?)\b/gi;

/**
 * @param {string} planContent
 * @returns {{ groups: Array<{id:string, members:string[], independent:boolean}>, malformed: boolean, warnings: string[] }}
 */
export function parseParallelizationSection(planContent) {
  if (typeof planContent !== "string" || planContent.length === 0) {
    return { groups: [], malformed: false, warnings: [] };
  }
  const secMatch = planContent.match(SECTION_RE);
  if (!secMatch) return { groups: [], malformed: false, warnings: [] };

  // Body = from after the heading to the next H2 (or EOF).
  const start = secMatch.index + secMatch[0].length;
  const rest = planContent.slice(start);
  const nextH2 = rest.match(/^##\s+/m);
  const body = nextH2 ? rest.slice(0, nextH2.index) : rest;

  const groups = [];
  const warnings = [];
  for (const line of body.split("\n")) {
    const m = line.match(GROUP_LINE_RE);
    if (!m) {
      const intent = line.match(GROUP_INTENT_RE);
      if (intent) {
        warnings.push(
          `Group ${intent[1]}: expected "(independent|sequential)" after the group id, ` +
            `got a line the parser could not match — group dropped: ${line.trim()}`,
        );
      }
      continue;
    }
    const [, id, kind, tail] = m;
    const members = [];
    let t;
    TASK_RE.lastIndex = 0;
    while ((t = TASK_RE.exec(tail)) !== null) members.push(t[1]);
    groups.push({ id, members, independent: kind.toLowerCase() === "independent" });
  }

  // A section that exists but yields no structured group lines, or that
  // dropped at least one malformed group line, is malformed — the caller
  // should serial-fallback rather than silently run a partial or empty plan.
  const malformed = groups.length === 0 || warnings.length > 0;
  return { groups, malformed, warnings };
}

/**
 * Deterministic merge-back order: dependency order first (a group merges after
 * everything it depends on), ties broken lexicographically by id. Cycle-safe
 * (a cycle degrades to lexicographic for the involved nodes).
 *
 * @param {Array<{id:string}>} groups
 * @param {Record<string,string[]>} [deps]  groupId → ids it depends on
 * @returns {string[]} ordered group ids
 */
export function computeMergeOrder(groups, deps = {}) {
  const ids = groups.map((g) => g.id);
  const depOf = (id) => (deps[id] || []).filter((d) => ids.includes(d));
  const ordered = [];
  const placed = new Set();
  // Kahn-ish: repeatedly place the lexicographically-smallest id whose deps are
  // all already placed. If none qualify (cycle), place the smallest remaining.
  const remaining = [...ids].sort();
  while (remaining.length) {
    let idx = remaining.findIndex((id) => depOf(id).every((d) => placed.has(d)));
    if (idx === -1) idx = 0; // cycle fallback: take smallest remaining
    const [id] = remaining.splice(idx, 1);
    ordered.push(id);
    placed.add(id);
  }
  return ordered;
}
