/**
 * Tests for lib/issues/markdown-parser.mjs (SA-3).
 *
 * Exercises the column-tolerance branches (12 / 13 / 14 cols for issues,
 * 6 / 7 cols for epics), legacy planRef+planTask issues, orphan issues,
 * epics with plan_ref, and malformed/empty inputs.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseTasksMd } from "../../../lib/issues/markdown-parser.mjs";

function mkBoard(epics, issues, opts = {}) {
  const epicHeader =
    opts.epicCols === 6
      ? `| ID | Title | Status | Plan-Ref | Created | Updated |
|----|-------|--------|----------|---------|---------|`
      : `| ID | Title | Status | Plan-Ref | Milestone | Created | Updated |
|----|-------|--------|----------|-----------|---------|---------|`;

  const issueHeader =
    opts.issueCols === 12
      ? `| ID | Title | Status | Priority | Type | Epic | Plan-Ref | Plan-Task | Deps | Notes | Created | Updated |
|----|-------|--------|----------|------|------|----------|-----------|------|-------|---------|---------|`
      : opts.issueCols === 13
      ? `| ID | Title | Status | Priority | Type | Epic | Plan-Ref | Plan-Task | Deps | Notes | Next-Action | Created | Updated |
|----|-------|--------|----------|------|------|----------|-----------|------|-------|-------------|---------|---------|`
      : `| ID | Title | Status | Priority | Type | Epic | Plan-Ref | Plan-Task | Spec-Ref | Deps | Notes | Next-Action | Created | Updated |
|----|-------|--------|----------|------|------|----------|-----------|----------|------|-------|-------------|---------|---------|`;

  return `# Issue Board

## Epics

${epicHeader}
${epics.join("\n")}

## Issues

${issueHeader}
${issues.join("\n")}
`;
}

describe("parseTasksMd", () => {
  it("returns an empty board with version 2 on empty input", () => {
    const board = parseTasksMd("");
    assert.equal(board.version, 2);
    assert.deepEqual(board.epics, []);
    assert.deepEqual(board.issues, []);
  });

  it("returns an empty board on non-string input", () => {
    const board = parseTasksMd(undefined);
    assert.equal(board.version, 2);
    assert.deepEqual(board.epics, []);
    assert.deepEqual(board.issues, []);
  });

  describe("legacy-read regression (markdown adapter sunset)", () => {
    // Sunset: delete this block (and the column-variant fixtures) in the same
    // PR that removes tasks.backend: "file" from lib/issues/registry.mjs. See
    // .context-index/specs/features/agent-reliable-state-artifacts/charter.md
    // line 59 — markdown `backend: file` removal has a one-release-cycle
    // deprecation window (next minor version after charter agent-reliable-
    // state-artifacts lands).

    it("parses a canonical 14-column issue row", () => {
      const md = mkBoard(
        [],
        [
          "| issue-1 | Fix login | open | 2 | bug | epic-1 | plans/p.md | 3 | specs/s.md | issue-9 | a note | next | 2026-01-01 | 2026-01-02 |",
        ]
      );
      const { issues } = parseTasksMd(md);
      assert.equal(issues.length, 1);
      const i = issues[0];
      assert.equal(i.id, "issue-1");
      assert.equal(i.title, "Fix login");
      assert.equal(i.status, "open");
      assert.equal(i.priority, 2);
      assert.equal(i.type, "bug");
      assert.equal(i.epicId, "epic-1");
      assert.equal(i.planRef, "plans/p.md");
      assert.equal(i.planTask, 3);
      assert.equal(i.spec_ref, "specs/s.md");
      assert.deepEqual(i.dependencies, ["issue-9"]);
      assert.equal(i.notes, "a note");
      assert.equal(i.next_action, "next");
    });

    it("parses a legacy 13-column issue row (no spec_ref)", () => {
      const md = mkBoard(
        [],
        [
          "| issue-2 | Old | open | 2 | task | epic-1 | plans/p.md | 1 | issue-9 | notes | nx | 2026-01-01 | 2026-01-02 |",
        ],
        { issueCols: 13 }
      );
      const { issues } = parseTasksMd(md);
      assert.equal(issues.length, 1);
      assert.equal(issues[0].spec_ref, undefined);
      assert.equal(issues[0].next_action, "nx");
      assert.equal(issues[0].planTask, 1);
    });

    it("parses a legacy 12-column issue row (no spec_ref, no next_action)", () => {
      const md = mkBoard(
        [],
        [
          "| issue-3 | Very old | open | 2 | task | epic-1 | plans/p.md | 1 | issue-9 | notes | 2026-01-01 | 2026-01-02 |",
        ],
        { issueCols: 12 }
      );
      const { issues } = parseTasksMd(md);
      assert.equal(issues.length, 1);
      assert.equal(issues[0].next_action, null);
      assert.equal(issues[0].planTask, 1);
      assert.equal(issues[0].planRef, "plans/p.md");
    });
  });

  it("preserves a legacy planRef+planTask pair on read (CON-3 read tolerance)", () => {
    const md = mkBoard(
      [],
      [
        "| issue-4 | Legacy | open | 2 | task |  | plans/legacy.md | 5 |  |  |  |  | 2026-01-01 | 2026-01-02 |",
      ]
    );
    const { issues } = parseTasksMd(md);
    assert.equal(issues[0].planRef, "plans/legacy.md");
    assert.equal(issues[0].planTask, 5);
  });

  it("parses an orphan issue (no epicId)", () => {
    const md = mkBoard(
      [],
      [
        "| issue-5 | Orphan | open | 2 | task |  |  |  |  |  |  |  | 2026-01-01 | 2026-01-02 |",
      ]
    );
    const { issues } = parseTasksMd(md);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].epicId, undefined);
    assert.equal(issues[0].planRef, undefined);
    assert.equal(issues[0].planTask, undefined);
  });

  it("parses a canonical 7-column epic row with plan_ref + milestone", () => {
    const md = mkBoard(
      ["| epic-1 | Auth | open | plans/auth.md | 0.26.0 | 2026-01-01 | 2026-01-02 |"],
      []
    );
    const { epics } = parseTasksMd(md);
    assert.equal(epics.length, 1);
    assert.equal(epics[0].id, "epic-1");
    assert.equal(epics[0].planRef, "plans/auth.md");
    assert.equal(epics[0].milestone, "0.26.0");
  });

  it("parses a 6-column legacy epic row (no milestone)", () => {
    const md = mkBoard(
      ["| epic-2 | Old | open | plans/old.md | 2026-01-01 | 2026-01-02 |"],
      [],
      { epicCols: 6 }
    );
    const { epics } = parseTasksMd(md);
    assert.equal(epics.length, 1);
    assert.equal(epics[0].milestone, undefined);
    assert.equal(epics[0].planRef, "plans/old.md");
  });

  it("ignores comments, blank lines, and markdown headers between sections", () => {
    const md = `# Issue Board

## Epics

| ID | Title | Status | Plan-Ref | Milestone | Created | Updated |
|----|-------|--------|----------|-----------|---------|---------|
| epic-1 | E | open |  |  | 2026-01-01 | 2026-01-02 |

<!-- comment -->

## Issues

| ID | Title | Status | Priority | Type | Epic | Plan-Ref | Plan-Task | Spec-Ref | Deps | Notes | Next-Action | Created | Updated |
|----|-------|--------|----------|------|------|----------|-----------|----------|------|-------|-------------|---------|---------|
| issue-1 | I | open | 2 | task |  |  |  |  |  |  |  | 2026-01-01 | 2026-01-02 |
`;
    const { epics, issues } = parseTasksMd(md);
    assert.equal(epics.length, 1);
    assert.equal(issues.length, 1);
  });

  it("skips malformed rows that lack the minimum column count", () => {
    const md = `# Issue Board

## Epics

| ID | Title | Status | Plan-Ref | Milestone | Created | Updated |
|----|-------|--------|----------|-----------|---------|---------|
| epic-1 | only-three | open |
| epic-2 | OK | open |  |  | 2026-01-01 | 2026-01-02 |

## Issues

| ID | Title | Status | Priority | Type | Epic | Plan-Ref | Plan-Task | Spec-Ref | Deps | Notes | Next-Action | Created | Updated |
|----|-------|--------|----------|------|------|----------|-----------|----------|------|-------|-------------|---------|---------|
| issue-1 | broken | open |
| issue-2 | OK | open | 2 | task |  |  |  |  |  |  |  | 2026-01-01 | 2026-01-02 |
`;
    const { epics, issues } = parseTasksMd(md);
    assert.equal(epics.length, 1);
    assert.equal(epics[0].id, "epic-2");
    assert.equal(issues.length, 1);
    assert.equal(issues[0].id, "issue-2");
  });

  it("parses many rows preserving order", () => {
    const rows = [];
    for (let i = 1; i <= 5; i++) {
      rows.push(`| issue-${i} | T${i} | open | 2 | task |  |  |  |  |  |  |  | 2026-01-01 | 2026-01-02 |`);
    }
    const md = mkBoard([], rows);
    const { issues } = parseTasksMd(md);
    assert.equal(issues.length, 5);
    assert.equal(issues[0].id, "issue-1");
    assert.equal(issues[4].id, "issue-5");
  });
});
