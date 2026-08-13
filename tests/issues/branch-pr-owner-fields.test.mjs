/**
 * Field-threading tests for `branch` / `pr` / `owner` / `claimed_at`.
 *
 * These four fields have to be threaded through every layer that reshapes an
 * issue, and the failure mode is SILENT: `validateIssue` returns a fixed
 * whitelist object, so a field missing from that return literal is dropped
 * rather than rejected. `create()` reports success and the board persists
 * nothing.
 *
 * The tests below therefore go through the real write path
 * (`create()` → `get()` → `list()`), not through `claim()`, which writes the
 * fields into the board object directly and would pass even with the
 * whitelist unthreaded.
 *
 * Covers:
 *   - validateIssue: defaults, string round-trip, per-field error codes
 *   - JsonAdapter: create → get → list round-trip, and update()
 *   - markdown: 18-column canonical row renders and parses back — every
 *     field asserted, because the real risk of widening 14→18 is
 *     created/updated silently shifting column index
 *
 * The narrow legacy-row regressions live in
 * `tests/lib/issues/markdown-parser.test.mjs` — that file is the designated
 * home for column-variant fixtures (see
 * `tests/architectural-legacy-format-fixtures.test.mjs`).
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { validateIssue, REF_FIELDS } from "../../lib/issues/interface.mjs";
import { JsonAdapter } from "../../lib/issues/json-adapter.mjs";
import { parseTasksMd } from "../../lib/issues/markdown-parser.mjs";
import { renderTasksMd } from "../../lib/issues/render-markdown.mjs";

function makeProject() {
  const dir = mkdtempSync(join(tmpdir(), "issue-ref-fields-test-"));
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
  return dir;
}

// ---------------------------------------------------------------------------
// validateIssue
// ---------------------------------------------------------------------------

describe("validateIssue — branch / pr / owner / claimed_at", () => {
  it("exposes the four ref fields in canonical column order", () => {
    assert.deepEqual([...REF_FIELDS], ["branch", "pr", "owner", "claimed_at"]);
  });

  it("defaults all four to undefined when not provided", () => {
    const issue = validateIssue({ title: "Bare issue" });
    for (const field of REF_FIELDS) {
      assert.equal(issue[field], undefined, `${field} should default to undefined`);
    }
  });

  it("preserves all four when provided as strings", () => {
    const issue = validateIssue({
      title: "Fully bound issue",
      branch: "feat/claim-fields",
      pr: "https://github.com/org/repo/pull/42",
      owner: "agent-a",
      claimed_at: "2026-08-12T10:00:00.000Z",
    });
    assert.equal(issue.branch, "feat/claim-fields");
    assert.equal(issue.pr, "https://github.com/org/repo/pull/42");
    assert.equal(issue.owner, "agent-a");
    assert.equal(issue.claimed_at, "2026-08-12T10:00:00.000Z");
  });

  it("rejects non-string values with a per-field error code", () => {
    const cases = [
      ["branch", 42, "INVALID_BRANCH"],
      ["pr", 42, "INVALID_PR"],
      ["owner", { name: "x" }, "INVALID_OWNER"],
      ["claimed_at", 1755000000000, "INVALID_CLAIMED_AT"],
    ];
    for (const [field, value, code] of cases) {
      assert.throws(
        () => validateIssue({ title: "Bad field", [field]: value }),
        (err) => {
          assert.equal(err.code, code, `${field} should raise ${code}`);
          return true;
        },
        `${field} = ${JSON.stringify(value)} should throw`,
      );
    }
  });

  it("treats empty strings as absent", () => {
    const issue = validateIssue({ title: "Empties", branch: "", pr: "", owner: "" });
    assert.equal(issue.branch, undefined);
    assert.equal(issue.pr, undefined);
    assert.equal(issue.owner, undefined);
  });
});

// ---------------------------------------------------------------------------
// JsonAdapter — the silent-drop regression
// ---------------------------------------------------------------------------

describe("JsonAdapter — ref fields survive create → get → list", () => {
  let dir, adapter;

  before(async () => {
    dir = makeProject();
    adapter = new JsonAdapter(dir);
    await adapter.init();
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("persists all four fields through create(), get(), and list()", async () => {
    const payload = {
      title: "Bound to a branch and PR",
      branch: "feat/issue-board-claim",
      pr: "#609",
      owner: "agent-a",
      claimed_at: "2026-08-12T09:30:00.000Z",
    };
    const created = await adapter.create(payload);

    for (const field of REF_FIELDS) {
      assert.equal(
        created[field],
        payload[field],
        `create() returned a dropped ${field} — check the validateIssue whitelist`,
      );
    }

    // A fresh adapter forces a real disk read rather than an in-memory echo.
    const reader = new JsonAdapter(dir);
    const fetched = await reader.get(created.id);
    assert.ok(fetched, "issue should be readable back from disk");
    for (const field of REF_FIELDS) {
      assert.equal(fetched[field], payload[field], `get() lost ${field}`);
    }

    const listed = (await reader.list({})).find((i) => i.id === created.id);
    assert.ok(listed, "issue should appear in list()");
    for (const field of REF_FIELDS) {
      assert.equal(listed[field], payload[field], `list() lost ${field}`);
    }
  });

  it("leaves the fields undefined when create() omits them", async () => {
    const created = await adapter.create({ title: "Unbound issue" });
    const fetched = await adapter.get(created.id);
    for (const field of REF_FIELDS) {
      assert.equal(fetched[field], undefined, `${field} should be absent`);
    }
  });

  it("update() can set and clear branch / pr", async () => {
    const created = await adapter.create({ title: "Rebindable" });
    const bound = await adapter.update(created.id, { branch: "fix/x", pr: "#7" });
    assert.equal(bound.branch, "fix/x");
    assert.equal(bound.pr, "#7");

    const persisted = await new JsonAdapter(dir).get(created.id);
    assert.equal(persisted.branch, "fix/x");
    assert.equal(persisted.pr, "#7");

    const cleared = await adapter.update(created.id, { branch: undefined, pr: undefined });
    assert.equal(cleared.branch, undefined);
    assert.equal(cleared.pr, undefined);
  });

  it("does NOT treat the ref fields as a board-granularity violation", async () => {
    // planTask is rejected because it is sub-issue granularity; these four
    // are 1:1 with the issue and must not be swept up by the same guard.
    const created = await adapter.create({
      title: "Granularity boundary",
      branch: "feat/y",
      owner: "agent-b",
    });
    assert.equal(created.branch, "feat/y");
    await assert.rejects(
      () => adapter.create({ title: "Still rejected", planTask: 3 }),
      (err) => err.code === "BOARD_GRANULARITY_VIOLATION",
    );
  });
});

// ---------------------------------------------------------------------------
// Markdown — 18-column canonical row
// ---------------------------------------------------------------------------

const FULL_ISSUE = {
  id: "issue-42",
  title: "Widened row",
  status: "in_progress",
  priority: 1,
  type: "feature",
  epicId: "epic-1",
  planRef: "plans/x.md",
  planTask: undefined,
  spec_ref: "specs/features/x.spec.md",
  dependencies: ["issue-7", "issue-8"],
  notes: "some notes",
  next_action: "run /adev:implement",
  branch: "feat/widened-row",
  pr: "https://github.com/org/repo/pull/42",
  owner: "agent-a",
  claimed_at: "2026-08-12T09:30:00.000Z",
  created: "2026-08-01T00:00:00.000Z",
  updated: "2026-08-12T09:30:00.000Z",
};

describe("markdown — 18-column canonical issue row", () => {
  it("renders a header and body with 18 columns", () => {
    const md = renderTasksMd({ version: 2, epics: [], issues: [FULL_ISSUE] });
    const row = md.split("\n").find((l) => l.startsWith("| issue-42 |"));
    assert.ok(row, "rendered row should be present");
    const cellCount = row.split("|").slice(1, -1).length;
    assert.equal(cellCount, 18, `expected 18 cells, got ${cellCount}`);

    // NB: the epic table also starts with "| ID |" — select on a column that
    // only the issue header has.
    const headerRow = md.split("\n").find((l) => l.startsWith("| ID |") && l.includes("Priority"));
    assert.equal(headerRow.split("|").slice(1, -1).length, 18, "header width must match rows");
    for (const label of ["Branch", "PR", "Owner", "Claimed-At"]) {
      assert.ok(headerRow.includes(label), `header should name the ${label} column`);
    }
  });

  it("round-trips EVERY field — not just the new ones", () => {
    // The failure this guards against: a new column shifting created/updated
    // out from under the parser. Asserting only branch/pr/owner would miss it.
    const md = renderTasksMd({ version: 2, epics: [], issues: [FULL_ISSUE] });
    const parsed = parseTasksMd(md).issues.find((i) => i.id === "issue-42");
    assert.ok(parsed, "issue should parse back out");

    for (const [field, want] of Object.entries(FULL_ISSUE)) {
      if (field === "dependencies") {
        assert.deepEqual(parsed.dependencies, want, "dependencies differ");
        continue;
      }
      assert.equal(parsed[field], want, `field ${field} differs after round-trip`);
    }
  });

  it("escapes markdown-structural characters in branch / pr / owner", () => {
    // A literal `|` in ANY free-text cell already breaks this format's
    // round-trip (parseRow splits on raw `|`, so `notes: "a|b"` corrupts the
    // row today, before this change). That limitation is pre-existing and out
    // of scope here; the fields below cover every OTHER structural character
    // the renderer escapes.
    const hostile = {
      ...FULL_ISSUE,
      branch: "feat/a_b*c",
      pr: "#1 [see] (here)",
      owner: "agent`x`",
    };
    const md = renderTasksMd({ version: 2, epics: [], issues: [hostile] });
    const rows = md.split("\n").filter((l) => l.startsWith("| issue-42 |"));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].split("|").slice(1, -1).length, 18, "row width must survive escaping");
    assert.ok(rows[0].includes("\\_"), "underscore should be escaped in the rendered cell");

    const parsed = parseTasksMd(md).issues.find((i) => i.id === "issue-42");
    assert.equal(parsed.branch, "feat/a_b*c");
    assert.equal(parsed.pr, "#1 [see] (here)");
    assert.equal(parsed.owner, "agent`x`");
    assert.equal(parsed.created, hostile.created, "created must not shift");
    assert.equal(parsed.updated, hostile.updated, "updated must not shift");
  });
});
