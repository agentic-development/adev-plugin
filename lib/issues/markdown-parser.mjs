/**
 * Shared markdown-table parser for the issue board.
 *
 * Extracted from FileAdapter._read() (SA-3) so that:
 *   - FileAdapter._read() delegates here, and
 *   - JsonAdapter's legacy-read fallback consumes the same parser without
 *     reaching into FileAdapter.
 *
 * Pure function: input is the raw markdown string, output is the parsed
 * `{ version, epics, issues }` shape. No I/O.
 *
 * Tolerates three historical issue-row column layouts (12/13/14) and two
 * epic-row column layouts (6/7). Schema evolution rule: when in doubt,
 * widest-format wins; unknown columns past the canonical layout are ignored.
 *
 * Output `version` is fixed at `2` — readers tolerate the absence of an
 * explicit version line in markdown by defaulting to the current writer
 * version. (Writers always emit `version: 2` on JSON output; markdown has
 * no in-file version line.)
 */

const MARKDOWN_VERSION = 2;

/**
 * Reverse the markdown structural escape applied by
 * `lib/issues/render-markdown.mjs::escapeField` (rule 4) plus the legacy
 * pipe-only escape that pre-existed in `tasks.md`.
 *
 * The renderer escapes: `\ ` ` | * _ [ ] ( ) #` and HTML entities `&amp;
 * &lt; &gt; &quot; &#39;`. We reverse them in the order opposite to the
 * renderer — markdown chars first, then HTML entities, then backslash —
 * so doubly-escaped sequences resolve correctly.
 */
function unescapeCell(val) {
  let s = val
    // Markdown structural unescape — order chosen to avoid re-interpreting
    // a backslash that escapes another backslash. We use a single-pass
    // regex with a switch.
    .replace(/\\([`|*_\[\]()#])/g, "$1")
    // Block-quote leading anchor (`\>` at the start of a cell only — the
    // renderer applies this when the value started with `>`).
    .replace(/^\\>/, ">");
  // HTML-entity unescape — reverse the HTML escape pass.
  s = s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
  // Final backslash unescape (any `\\` → `\`). Must be last so it doesn't
  // re-interpret the escape sequences above.
  s = s.replace(/\\\\/g, "\\");
  return s.trim();
}

function parseRow(line) {
  return line.split("|").slice(1, -1).map(unescapeCell);
}

function parseEpicRow(cells) {
  // 7-column format (with Milestone):
  //   0:id, 1:title, 2:status, 3:planRef, 4:milestone, 5:created, 6:updated
  if (cells.length >= 7) {
    return {
      id: cells[0],
      title: cells[1],
      status: cells[2],
      planRef: cells[3] || undefined,
      milestone: cells[4] || undefined,
      created: cells[5],
      updated: cells[6],
    };
  }
  // Backward compat: 6-column format without Milestone
  return {
    id: cells[0],
    title: cells[1],
    status: cells[2],
    planRef: cells[3] || undefined,
    milestone: undefined,
    created: cells[4],
    updated: cells[5],
  };
}

function parseIssueRow(cells) {
  // 14-col (canonical): id, title, status, priority, type, epicId, planRef,
  //   planTask, spec_ref, deps, notes, next_action, created, updated
  if (cells.length >= 14) {
    return {
      id: cells[0],
      title: cells[1],
      status: cells[2],
      priority: parseInt(cells[3], 10),
      type: cells[4],
      epicId: cells[5] || undefined,
      planRef: cells[6] || undefined,
      planTask: cells[7] ? parseInt(cells[7], 10) : undefined,
      spec_ref: cells[8] || undefined,
      dependencies: cells[9] ? cells[9].split(",").filter(Boolean) : [],
      notes: cells[10] || "",
      next_action: cells[11] || null,
      created: cells[12],
      updated: cells[13],
    };
  }

  // 13-col: no spec_ref
  if (cells.length >= 13) {
    return {
      id: cells[0],
      title: cells[1],
      status: cells[2],
      priority: parseInt(cells[3], 10),
      type: cells[4],
      epicId: cells[5] || undefined,
      planRef: cells[6] || undefined,
      planTask: cells[7] ? parseInt(cells[7], 10) : undefined,
      spec_ref: undefined,
      dependencies: cells[8] ? cells[8].split(",").filter(Boolean) : [],
      notes: cells[9] || "",
      next_action: cells[10] || null,
      created: cells[11],
      updated: cells[12],
    };
  }

  // 12-col legacy: no next_action, no spec_ref
  return {
    id: cells[0],
    title: cells[1],
    status: cells[2],
    priority: parseInt(cells[3], 10),
    type: cells[4],
    epicId: cells[5] || undefined,
    planRef: cells[6] || undefined,
    planTask: cells[7] ? parseInt(cells[7], 10) : undefined,
    spec_ref: undefined,
    dependencies: cells[8] ? cells[8].split(",").filter(Boolean) : [],
    notes: cells[9] || "",
    next_action: null,
    created: cells[10],
    updated: cells[11],
  };
}

/**
 * Parse a `tasks.md` board document into the canonical shape.
 *
 * @param {string} contents - Raw markdown text.
 * @returns {{ version: number, epics: object[], issues: object[] }}
 */
export function parseTasksMd(contents) {
  if (typeof contents !== "string") {
    // Be permissive on empty/missing input: empty board.
    return { version: MARKDOWN_VERSION, epics: [], issues: [] };
  }

  const lines = contents.split("\n");
  const epics = [];
  const issues = [];
  let section = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "## Epics") { section = "epics"; continue; }
    if (trimmed === "## Issues") { section = "issues"; continue; }
    // Skip header separators and column labels
    if (trimmed.startsWith("|-") || trimmed.startsWith("| ID")) continue;
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    if (section === "epics" && trimmed.startsWith("|")) {
      const cells = parseRow(trimmed);
      if (cells.length >= 6 && cells[0]) {
        epics.push(parseEpicRow(cells));
      }
    }

    if (section === "issues" && trimmed.startsWith("|")) {
      const cells = parseRow(trimmed);
      if (cells.length >= 12 && cells[0]) {
        issues.push(parseIssueRow(cells));
      }
    }
  }

  return { version: MARKDOWN_VERSION, epics, issues };
}

export default { parseTasksMd };
