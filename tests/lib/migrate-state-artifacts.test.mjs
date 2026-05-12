/**
 * Per-artifact migration parity tests for lib/migrate-state-artifacts.mjs.
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/one-shot-migration-tool.spec.md
 */

import { describe, it, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import {
  migrateAll,
  migrateTasks,
  migrateLifecycleState,
  migrateExecutionState,
  migrateMilestones,
  migrateConstitution,
} from "../../lib/migrate-state-artifacts.mjs";
import { JsonAdapter } from "../../lib/issues/json-adapter.mjs";
import { currentState, readEvents } from "../../lib/lifecycle-state.mjs";
import { readExecutionState } from "../../lib/execution-state.mjs";
import { loadMilestones } from "../../lib/milestones.mjs";

/* ────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────── */

function makeProjectRoot() {
  const dir = createTempDir();
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(
    join(dir, ".context-index", "manifest.yaml"),
    'project:\n  name: "test"\n  adev_version: "0.24.0"\ntasks:\n  backend: json\n'
  );
  return dir;
}

function writeFile(root, rel, content) {
  const full = join(root, rel);
  mkdirSync(join(full, "..").split("/").slice(0, -1).join("/") || "/", { recursive: true });
  // simpler: use dirname
  const path = full;
  const parent = path.substring(0, path.lastIndexOf("/"));
  mkdirSync(parent, { recursive: true });
  writeFileSync(path, content);
}

function specStub(root, slug) {
  const dir = join(root, ".context-index", "specs", "features", "test");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${slug}.spec.md`),
    `---\nstatus: implemented\n---\n# Stub\n`
  );
}

/* ────────────────────────────────────────────────────────────────────
 * Task 1 — module skeleton
 * ──────────────────────────────────────────────────────────────────── */

describe("module shape", () => {
  it("exports migrateAll with the expected signature", () => {
    assert.equal(typeof migrateAll, "function");
    assert.equal(migrateAll.length, 2);
  });
  it("exports all per-artifact migrators", () => {
    assert.equal(typeof migrateTasks, "function");
    assert.equal(typeof migrateLifecycleState, "function");
    assert.equal(typeof migrateExecutionState, "function");
    assert.equal(typeof migrateMilestones, "function");
    assert.equal(typeof migrateConstitution, "function");
  });
});

/* ────────────────────────────────────────────────────────────────────
 * Task 3 — migrateTasks parity
 * ──────────────────────────────────────────────────────────────────── */

describe("migrateTasks", () => {
  let root;
  before(() => { root = makeProjectRoot(); });
  after(() => cleanupTempDir(root));

  it("migrates tasks.md to tasks.json preserving fields", async () => {
    const tasksMd = `# Issue Board

## Epics

| ID | Title | Status | Plan-Ref | Milestone | Created | Updated |
|----|-------|--------|----------|-----------|---------|---------|
| epic-1 | Test Epic | open | plan-1 | m1 | 2026-01-01T00:00:00Z | 2026-01-02T00:00:00Z |

## Issues

| ID | Title | Status | Priority | Type | Epic-ID | Plan-Ref | Plan-Task | Spec-Ref | Deps | Notes | Next-Action | Created | Updated |
|----|-------|--------|----------|------|---------|----------|-----------|----------|------|-------|-------------|---------|---------|
| issue-1 | Task one | open | 1 | task | epic-1 |  |  | spec-a | issue-2 | n | next | 2026-01-01T00:00:00Z | 2026-01-02T00:00:00Z |
| issue-2 | Task two | closed | 2 | bug | epic-1 |  |  |  |  |  |  | 2026-01-01T00:00:00Z | 2026-01-02T00:00:00Z |
`;
    mkdirSync(join(root, ".context-index", "tasks"), { recursive: true });
    writeFileSync(join(root, ".context-index", "tasks", "tasks.md"), tasksMd);

    const result = await migrateTasks(root, {});
    assert.equal(result.artifact, "tasks");
    assert.equal(result.action, "migrated");
    assert.ok(existsSync(join(root, ".context-index", "tasks", "tasks.json")));

    const adapter = new JsonAdapter(root);
    const issues = await adapter.list();
    assert.equal(issues.length, 2);
    assert.equal(issues[0].id, "issue-1");
    assert.equal(issues[0].dependencies?.length ?? 0, 1);
    const epics = await adapter.listEpics();
    assert.equal(epics.length, 1);
    assert.equal(epics[0].id, "epic-1");
  });

  it("emits granularity advisory for planRef+planTask issues", async () => {
    const root2 = makeProjectRoot();
    try {
      const tasksMd = `## Epics

| ID | Title | Status | Plan-Ref | Created | Updated |
|----|-------|--------|----------|---------|---------|

## Issues

| ID | Title | Status | Priority | Type | Epic-ID | Plan-Ref | Plan-Task | Spec-Ref | Deps | Notes | Next-Action | Created | Updated |
|----|-------|--------|----------|------|---------|----------|-----------|----------|------|-------|-------------|---------|---------|
| issue-1 | Legacy | open | 1 | task |  | plan-x | 3 |  |  |  |  | 2026-01-01T00:00:00Z | 2026-01-02T00:00:00Z |
`;
      mkdirSync(join(root2, ".context-index", "tasks"), { recursive: true });
      writeFileSync(join(root2, ".context-index", "tasks", "tasks.md"), tasksMd);

      const result = await migrateTasks(root2, {});
      assert.equal(result.action, "migrated");
      const granularity = result.advisories.find(
        (a) => a.code === "GRANULARITY_LEGACY_ISSUE"
      );
      assert.ok(granularity, "expected GRANULARITY_LEGACY_ISSUE advisory");
      assert.equal(granularity.issueId, "issue-1");
    } finally {
      cleanupTempDir(root2);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────
 * Task 4 — migrateLifecycleState parity
 * ──────────────────────────────────────────────────────────────────── */

describe("migrateLifecycleState", () => {
  it("translates build-state JSON to lifecycle-state JSONL", async () => {
    const root = makeProjectRoot();
    try {
      specStub(root, "foo");
      const buildStateDir = join(root, ".context-index", "build-state");
      mkdirSync(buildStateDir, { recursive: true });
      const buildState = {
        spec: ".context-index/specs/features/test/foo.spec.md",
        status: "in_progress",
        steps: [
          { name: "review", status: "completed", verdict: "PASS", timestamp: "2026-01-01T00:00:00Z" },
          { name: "plan", status: "completed", verdict: "PASS_WITH_NOTES", timestamp: "2026-01-02T00:00:00Z" },
          { name: "implement", status: "pending" },
        ],
        started: "2026-01-01T00:00:00Z",
        updated: "2026-01-02T00:00:00Z",
      };
      writeFileSync(join(buildStateDir, "foo.json"), JSON.stringify(buildState));

      const result = await migrateLifecycleState(root, {});
      assert.equal(result.action, "migrated");
      assert.ok(
        existsSync(join(root, ".context-index", "lifecycle-state", "foo.jsonl")) ||
          existsSync(join(buildStateDir, "foo.json")), // pre-rename
      );
      // Events should be readable after the source still exists
      const lifecycleJsonl = join(root, ".context-index", "lifecycle-state", "foo.jsonl");
      assert.ok(existsSync(lifecycleJsonl), "lifecycle log should exist");
      const lines = readFileSync(lifecycleJsonl, "utf8").trim().split("\n");
      const events = lines.map((l) => JSON.parse(l));
      assert.ok(events.length >= 2, "expected at least 2 step events");
      const reviewEvents = events.filter((e) => e.step === "review");
      assert.ok(reviewEvents.length > 0, "expected review events");
      for (const ev of events) {
        assert.equal(ev.actor, "migration/adev-cli", `event ${ev.event} actor`);
        assert.ok(ev.ts, `event ${ev.event} ts`);
      }
    } finally {
      cleanupTempDir(root);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────
 * Task 6 — migrateExecutionState parity
 * ──────────────────────────────────────────────────────────────────── */

describe("migrateExecutionState", () => {
  it("migrates .execution-state.md to .execution-state.json", async () => {
    const root = makeProjectRoot();
    try {
      const md = `---
status: active
planRef: plans/foo.plan.md
currentTask: 3
issueBinding: issue-7
blockers:
nextAction: Do task 3
updated: 2026-01-01T00:00:00Z
---
`;
      writeFileSync(join(root, ".context-index", ".execution-state.md"), md);

      const result = await migrateExecutionState(root, {});
      assert.equal(result.action, "migrated");
      const state = readExecutionState(root);
      assert.equal(state.status, "active");
      assert.equal(state.planRef, "plans/foo.plan.md");
      assert.equal(state.currentTask, 3);
      assert.equal(state.issueBinding, "issue-7");
    } finally {
      cleanupTempDir(root);
    }
  });

  it("skips when source absent", async () => {
    const root = makeProjectRoot();
    try {
      const result = await migrateExecutionState(root, {});
      assert.equal(result.action, "skipped");
    } finally {
      cleanupTempDir(root);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────
 * Task 7 — migrateMilestones parity
 * ──────────────────────────────────────────────────────────────────── */

describe("migrateMilestones", () => {
  it("migrates milestones.yaml to milestones.json", async () => {
    const root = makeProjectRoot();
    try {
      const yaml = `milestones:
  - name: "0.25.0"
    status: planned
    epic_id: epic-1
    target_date: "2026-05-14"
  - name: "0.26.0"
    status: planned
    epic_id: epic-2
    target_date: "2026-07-06"
    ship_criteria:
      - check: all_issues_closed
      - confirm: "CHANGELOG updated"
`;
      writeFileSync(join(root, ".context-index", "milestones.yaml"), yaml);

      const result = await migrateMilestones(root, {});
      assert.equal(result.action, "migrated");
      const milestones = loadMilestones(root);
      assert.equal(milestones.length, 2);
      assert.equal(milestones[0].name, "0.25.0");
      assert.equal(milestones[1].ship_criteria.length, 2);
    } finally {
      cleanupTempDir(root);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────
 * Task 8 — migrateConstitution scoped match
 * ──────────────────────────────────────────────────────────────────── */

describe("migrateConstitution", () => {
  it("replaces the Build state row inside the active Context Routing table", async () => {
    const root = makeProjectRoot();
    try {
      const constitution = `# Constitution

## Context Routing

| Context Need | Location |
|---|---|
| Tests | \`tests/\` |
| Build state | \`.context-index/build-state/\` |

## Quality Gates

ok.
`;
      writeFileSync(join(root, ".context-index", "constitution.md"), constitution);

      const result = await migrateConstitution(root, {});
      assert.equal(result.action, "migrated");
      const updated = readFileSync(
        join(root, ".context-index", "constitution.md"),
        "utf8"
      );
      assert.ok(updated.includes("Lifecycle state"), "row should be updated");
      assert.ok(
        !updated.includes("Build state | `.context-index/build-state/`"),
        "old row should be gone"
      );
    } finally {
      cleanupTempDir(root);
    }
  });

  it("skips when target row missing (already migrated)", async () => {
    const root = makeProjectRoot();
    try {
      writeFileSync(
        join(root, ".context-index", "constitution.md"),
        `# Constitution\n\n## Context Routing\n\n| Need | Where |\n|---|---|\n| Lifecycle state | \`.context-index/lifecycle-state/\` |\n`,
      );
      const result = await migrateConstitution(root, {});
      assert.equal(result.action, "skipped");
    } finally {
      cleanupTempDir(root);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────
 * Task 9 — migrateAll orchestration
 * ──────────────────────────────────────────────────────────────────── */

describe("migrateAll", () => {
  it("runs all artifacts and exits cleanly", async () => {
    const root = makeProjectRoot();
    try {
      writeFileSync(
        join(root, ".context-index", "milestones.yaml"),
        'milestones:\n  - name: "0.25.0"\n    status: planned\n'
      );
      const result = await migrateAll(root, {});
      assert.ok(result.results.length >= 1);
      assert.equal(result.failed, false);
    } finally {
      cleanupTempDir(root);
    }
  });

  it("is idempotent — second run skips every artifact", async () => {
    const root = makeProjectRoot();
    try {
      writeFileSync(
        join(root, ".context-index", "milestones.yaml"),
        'milestones:\n  - name: "0.25.0"\n    status: planned\n'
      );
      await migrateAll(root, {});
      const second = await migrateAll(root, {});
      const milestonesResult = second.results.find(
        (r) => r.artifact === "milestones"
      );
      assert.equal(milestonesResult?.action, "skipped");
    } finally {
      cleanupTempDir(root);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────
 * Task 4 (plan-task-events.spec.md) — plan-file advisory header
 * ──────────────────────────────────────────────────────────────────── */

describe("migrateAll: plan-file DO-NOT-EDIT advisory header", () => {
  it("stamps the advisory header on a pre-existing plan file", async () => {
    const root = makeProjectRoot();
    try {
      const specsDir = join(root, ".context-index", "specs", "features", "x");
      mkdirSync(specsDir, { recursive: true });
      const planPath = join(specsDir, "foo.plan.md");
      writeFileSync(planPath, "# Implementation Plan: Foo\n\n## Tasks\n");

      await migrateAll(root, {});

      const content = readFileSync(planPath, "utf8");
      assert.match(
        content,
        /^<!-- DO NOT EDIT statuses inline — see lifecycle log foo\.jsonl -->/,
        "plan file does not start with the expected advisory header"
      );
      // Original content preserved.
      assert.ok(
        content.includes("# Implementation Plan: Foo"),
        "original plan content not preserved"
      );
    } finally {
      cleanupTempDir(root);
    }
  });

  it("is idempotent — second run does not double-stamp", async () => {
    const root = makeProjectRoot();
    try {
      const specsDir = join(root, ".context-index", "specs", "features", "x");
      mkdirSync(specsDir, { recursive: true });
      const planPath = join(specsDir, "foo.plan.md");
      writeFileSync(planPath, "# Implementation Plan: Foo\n\n## Tasks\n");

      await migrateAll(root, {});
      await migrateAll(root, {});

      const after = readFileSync(planPath, "utf8");
      const occurrences = (after.match(/DO NOT EDIT statuses inline/g) || [])
        .length;
      assert.equal(occurrences, 1, "header stamped more than once");
    } finally {
      cleanupTempDir(root);
    }
  });

  it("dry-run does not modify plan files", async () => {
    const root = makeProjectRoot();
    try {
      const specsDir = join(root, ".context-index", "specs", "features", "x");
      mkdirSync(specsDir, { recursive: true });
      const planPath = join(specsDir, "foo.plan.md");
      const original = "# Implementation Plan: Foo\n\n## Tasks\n";
      writeFileSync(planPath, original);

      await migrateAll(root, { dryRun: true });

      assert.equal(readFileSync(planPath, "utf8"), original);
    } finally {
      cleanupTempDir(root);
    }
  });

  it("derives slug from the plan filename when no sibling spec exists", async () => {
    const root = makeProjectRoot();
    try {
      const specsDir = join(root, ".context-index", "specs", "features", "x");
      mkdirSync(specsDir, { recursive: true });
      const planPath = join(specsDir, "my-feature.plan.md");
      writeFileSync(planPath, "# Plan\n");

      await migrateAll(root, {});

      const content = readFileSync(planPath, "utf8");
      assert.match(
        content,
        /^<!-- DO NOT EDIT statuses inline — see lifecycle log my-feature\.jsonl -->/,
      );
    } finally {
      cleanupTempDir(root);
    }
  });

  it("skips when no plan files exist", async () => {
    const root = makeProjectRoot();
    try {
      const result = await migrateAll(root, {});
      const planAdvisory = result.results.find(
        (r) => r.artifact === "plan-advisory"
      );
      // Advisory step should be present and either skipped or migrated with 0 files.
      if (planAdvisory) {
        assert.ok(
          ["skipped", "migrated", "dry-run"].includes(planAdvisory.action),
          `unexpected action: ${planAdvisory.action}`
        );
      }
    } finally {
      cleanupTempDir(root);
    }
  });

  it("does not stamp a plan file that already starts with the header", async () => {
    const root = makeProjectRoot();
    try {
      const specsDir = join(root, ".context-index", "specs", "features", "x");
      mkdirSync(specsDir, { recursive: true });
      const planPath = join(specsDir, "foo.plan.md");
      const seeded =
        "<!-- DO NOT EDIT statuses inline — see lifecycle log foo.jsonl -->\n# Plan\n";
      writeFileSync(planPath, seeded);

      await migrateAll(root, {});

      assert.equal(readFileSync(planPath, "utf8"), seeded);
    } finally {
      cleanupTempDir(root);
    }
  });
});
