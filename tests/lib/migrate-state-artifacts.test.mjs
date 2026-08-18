import { after, before, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanupTempDir, createTempDir } from "../helpers.mjs";
import { _internal, migrateAll, migrateConstitution, migrateExecutionState, migrateLifecycleState, migrateMilestones, migrateTasks } from "../../lib/migrate-state-artifacts.mjs";
import { JsonAdapter } from "../../lib/issues/json-adapter.mjs";
import { currentState, readEvents } from "../../lib/lifecycle-state.mjs";
import { readExecutionState } from "../../lib/execution-state.mjs";
import { loadMilestones } from "../../lib/milestones.mjs";

/**
 * Per-artifact migration parity tests for lib/migrate-state-artifacts.mjs.
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/one-shot-migration-tool.spec.md
 */












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
      // Target must be worktree-local — never redirected via resolveStorageRoot()
      // to a sibling worktree's checkout. Regression guard for the 0.26.0
      // cross-worktree-write bug.
      assert.equal(result.target, join(root, ".context-index", "milestones.json"));
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

// ─── merged from tests/lib/migrate-state-artifacts.collision.test.mjs ──────────────────────────────────────────────
{
  /**
   * Collision tests — RENAME_COLLISION + LIFECYCLE_STATE_FILE_EXISTS +
   * skip-rename recovery flow.
   *
   * Spec: .context-index/specs/features/agent-reliable-state-artifacts/one-shot-migration-tool.spec.md
   */








  function makeProject() {
    const dir = createTempDir();
    mkdirSync(join(dir, ".context-index"), { recursive: true });
    writeFileSync(
      join(dir, ".context-index", "manifest.yaml"),
      'project:\n  name: "t"\n',
    );
    return dir;
  }

  describe("per-file collision", () => {
    it("matching slug.jsonl already present → idempotent skip (CON-4)", async () => {
      // Per spec CON-4: when both legacy <slug>.json and migrated <slug>.jsonl
      // exist for the same slug, treat the migrated target as authoritative
      // and skip silently. (LIFECYCLE_STATE_FILE_EXISTS is the OTHER path:
      // a stray <slug>.jsonl exists for a slug that ISN'T present in the
      // source dir as well — handled by the orphan check.)
      const root = makeProject();
      try {
        const bsDir = join(root, ".context-index", "build-state");
        const lsDir = join(root, ".context-index", "lifecycle-state");
        mkdirSync(bsDir, { recursive: true });
        writeFileSync(
          join(bsDir, "foo.json"),
          JSON.stringify({
            spec: ".context-index/specs/x/foo.spec.md",
            status: "in_progress",
            steps: [{ name: "review", status: "completed", verdict: "PASS" }],
          }),
        );
        mkdirSync(lsDir, { recursive: true });
        const existingContent = '{"event":"existing","ts":"2026-01-01T00:00:00Z"}\n';
        writeFileSync(join(lsDir, "foo.jsonl"), existingContent);

        const result = await migrateLifecycleState(root, {});
        assert.equal(result.action, "skipped");
        // Verify existing file is unchanged
        const after = readFileSync(join(lsDir, "foo.jsonl"), "utf8");
        assert.equal(after, existingContent);
      } finally {
        cleanupTempDir(root);
      }
    });

    it("BUILD_STATE_ORPHAN surfaces orphan slug", async () => {
      const root = makeProject();
      try {
        const bsDir = join(root, ".context-index", "build-state");
        const lsDir = join(root, ".context-index", "lifecycle-state");
        mkdirSync(bsDir, { recursive: true });
        mkdirSync(lsDir, { recursive: true });
        // build-state has foo, lifecycle-state has bar — orphan
        writeFileSync(
          join(bsDir, "foo.json"),
          JSON.stringify({ status: "in_progress", steps: [] }),
        );
        writeFileSync(join(lsDir, "bar.jsonl"), '{"event":"x","ts":"2026-01-01T00:00:00Z"}\n');

        await assert.rejects(
          () => migrateLifecycleState(root, {}),
          (e) => {
            assert.equal(e.code, "BUILD_STATE_ORPHAN");
            assert.equal(e.slug, "foo");
            return true;
          },
        );
      } finally {
        cleanupTempDir(root);
      }
    });
  });

  describe("skip-rename recovery flow", () => {
    it("migrateLifecycleState with skipRename writes jsonl without touching source dir", async () => {
      const root = makeProject();
      try {
        const bsDir = join(root, ".context-index", "build-state");
        mkdirSync(bsDir, { recursive: true });
        writeFileSync(
          join(bsDir, "foo.json"),
          JSON.stringify({
            status: "in_progress",
            steps: [{ name: "review", status: "completed", verdict: "PASS" }],
          }),
        );
        const result = await migrateLifecycleState(root, { skipRename: true });
        assert.equal(result.action, "migrated");
        assert.ok(existsSync(join(root, ".context-index", "lifecycle-state", "foo.jsonl")));
        // Source still exists
        assert.ok(existsSync(join(bsDir, "foo.json")));
      } finally {
        cleanupTempDir(root);
      }
    });
  });
}

// ─── merged from tests/lib/migrate-state-artifacts.constitution.test.mjs ──────────────────────────────────────────────
{
  /**
   * Constitution scoped-match tests.
   *
   * Spec: .context-index/specs/features/agent-reliable-state-artifacts/one-shot-migration-tool.spec.md
   */








  function makeProject() {
    const dir = createTempDir();
    mkdirSync(join(dir, ".context-index"), { recursive: true });
    writeFileSync(
      join(dir, ".context-index", "manifest.yaml"),
      'project:\n  name: "t"\n',
    );
    return dir;
  }

  const TARGET_ROW = "| Build state | `.context-index/build-state/` |";
  const REPLACEMENT = "| Lifecycle state | `.context-index/lifecycle-state/` |";

  describe("migrateConstitution — scoped match", () => {
    it("replaces row when present only in active Context Routing table", async () => {
      const root = makeProject();
      try {
        const constitution = `# Constitution\n\n## Context Routing\n\n| K | V |\n|---|---|\n${TARGET_ROW}\n\n## Other section\n\nNothing here.\n`;
        writeFileSync(join(root, ".context-index", "constitution.md"), constitution);
        const result = await migrateConstitution(root, {});
        assert.equal(result.action, "migrated");
        const updated = readFileSync(
          join(root, ".context-index", "constitution.md"),
          "utf8",
        );
        assert.ok(updated.includes(REPLACEMENT));
      } finally {
        cleanupTempDir(root);
      }
    });

    it("CONSTITUTION_AMBIGUOUS_MATCH when target appears twice", async () => {
      const root = makeProject();
      try {
        // Two literal-identical rows: one in active table, one in a quoted ADR section.
        const constitution = `# Constitution\n\n## Context Routing\n\n| K | V |\n${TARGET_ROW}\n\n## Historical example\n\nIn ADR-N we had:\n\n${TARGET_ROW}\n`;
        writeFileSync(join(root, ".context-index", "constitution.md"), constitution);
        await assert.rejects(
          () => migrateConstitution(root, {}),
          (e) => {
            assert.equal(e.code, "CONSTITUTION_AMBIGUOUS_MATCH");
            assert.ok(Array.isArray(e.occurrenceLines));
            assert.equal(e.occurrenceLines.length, 2);
            return true;
          },
        );
      } finally {
        cleanupTempDir(root);
      }
    });

    it("skips when target row is inside a fenced code block only", async () => {
      const root = makeProject();
      try {
        const constitution = `# Constitution\n\n## Context Routing\n\n| K | V |\n|---|---|\n| Some | other |\n\n## Example\n\n\`\`\`markdown\n${TARGET_ROW}\n\`\`\`\n`;
        writeFileSync(join(root, ".context-index", "constitution.md"), constitution);
        const result = await migrateConstitution(root, {});
        assert.equal(result.action, "skipped");
        const updated = readFileSync(
          join(root, ".context-index", "constitution.md"),
          "utf8",
        );
        // Target row remains
        assert.ok(updated.includes(TARGET_ROW));
      } finally {
        cleanupTempDir(root);
      }
    });

    it("skips with CONSTITUTION_ROW_MISSING advisory when row absent and not migrated", async () => {
      const root = makeProject();
      try {
        const constitution = `# Constitution\n\n## Context Routing\n\n| Some | other |\n`;
        writeFileSync(join(root, ".context-index", "constitution.md"), constitution);
        const result = await migrateConstitution(root, {});
        assert.equal(result.action, "skipped");
        const adv = result.advisories.find((a) => a.code === "CONSTITUTION_ROW_MISSING");
        assert.ok(adv);
      } finally {
        cleanupTempDir(root);
      }
    });
  });
}

// ─── merged from tests/lib/migrate-state-artifacts.containment.test.mjs ──────────────────────────────────────────────
{
  /**
   * Path containment, size cap, and slug allowlist tests.
   *
   * Spec: .context-index/specs/features/agent-reliable-state-artifacts/one-shot-migration-tool.spec.md
   */








  function makeProject() {
    const dir = createTempDir();
    mkdirSync(join(dir, ".context-index"), { recursive: true });
    writeFileSync(
      join(dir, ".context-index", "manifest.yaml"),
      'project:\n  name: "t"\n',
    );
    return dir;
  }

  describe("path safety — projectRoot validation", () => {
    it("rejects missing manifest.yaml", async () => {
      const dir = createTempDir();
      try {
        // Don't create manifest
        await assert.rejects(
          () => migrateAll(dir, {}),
          (e) => e.code === "INVALID_PROJECT_ROOT",
        );
      } finally {
        cleanupTempDir(dir);
      }
    });

    it("rejects non-string projectRoot", async () => {
      await assert.rejects(
        () => migrateAll(null, {}),
        (e) => e.code === "INVALID_PROJECT_ROOT",
      );
    });
  });

  describe("size caps", () => {
    it("rejects oversized tasks.md via preflight", async () => {
      const root = makeProject();
      try {
        mkdirSync(join(root, ".context-index", "tasks"), { recursive: true });
        // 11 MB
        const bigContent = "x".repeat(11 * 1024 * 1024);
        writeFileSync(join(root, ".context-index", "tasks", "tasks.md"), bigContent);
        const result = await migrateAll(root, {});
        assert.equal(result.failed, true);
        const fail = result.preflight.failures.find((f) => f.code === "LEGACY_FILE_TOO_LARGE");
        assert.ok(fail, "expected LEGACY_FILE_TOO_LARGE failure");
      } finally {
        cleanupTempDir(root);
      }
    });

    it("rejects oversized build-state slug", async () => {
      const root = makeProject();
      try {
        mkdirSync(join(root, ".context-index", "build-state"), { recursive: true });
        writeFileSync(
          join(root, ".context-index", "build-state", "big.json"),
          '{"steps":["' + "x".repeat(2 * 1024 * 1024) + '"]}',
        );
        const result = await migrateAll(root, {});
        assert.equal(result.failed, true);
        const fail = result.preflight.failures.find((f) => f.code === "LEGACY_FILE_TOO_LARGE");
        assert.ok(fail, "expected LEGACY_FILE_TOO_LARGE for build-state");
      } finally {
        cleanupTempDir(root);
      }
    });
  });

  describe("slug allowlist", () => {
    it("rejects build-state filename with traversal chars", async () => {
      const root = makeProject();
      try {
        const bsDir = join(root, ".context-index", "build-state");
        mkdirSync(bsDir, { recursive: true });
        // The OS-allowed but conceptually-bad slug: ../escape.json is rejected
        // by the filesystem itself if we tried to create it through that path,
        // but the slug allowlist guards against the FILENAME stem containing
        // any invalid characters.
        writeFileSync(join(bsDir, "BAD-Slug-WITHUPPER.json"), '{"steps":[]}');
        const result = await migrateAll(root, {});
        assert.equal(result.failed, true);
        const fail = result.preflight.failures.find((f) => f.code === "INVALID_LEGACY_SLUG");
        assert.ok(fail, "expected INVALID_LEGACY_SLUG");
      } finally {
        cleanupTempDir(root);
      }
    });
  });

  describe("tasks.db_path positive containment", () => {
    it("rejects when tasks.db_path is missing/non-existent dir", async () => {
      const root = makeProject();
      try {
        writeFileSync(
          join(root, ".context-index", "manifest.yaml"),
          'project:\n  name: "t"\ntasks:\n  db_path: "/nonexistent/path/that/does/not/exist"\n',
        );
        const result = await migrateAll(root, {});
        assert.equal(result.failed, true);
        const fail = result.preflight.failures.find((f) => f.code === "INVALID_STORAGE_PATH");
        assert.ok(fail, "expected INVALID_STORAGE_PATH");
      } finally {
        cleanupTempDir(root);
      }
    });
  });
}

// ─── merged from tests/lib/migrate-state-artifacts.idempotency.test.mjs ──────────────────────────────────────────────
{
  /**
   * Idempotency tests for migrate-state-artifacts.
   *
   * Spec: .context-index/specs/features/agent-reliable-state-artifacts/one-shot-migration-tool.spec.md
   */








  function makeProject() {
    const dir = createTempDir();
    mkdirSync(join(dir, ".context-index"), { recursive: true });
    writeFileSync(
      join(dir, ".context-index", "manifest.yaml"),
      'project:\n  name: "t"\n',
    );
    writeFileSync(
      join(dir, ".context-index", "milestones.yaml"),
      'milestones:\n  - name: "0.25.0"\n    status: planned\n',
    );
    writeFileSync(
      join(dir, ".context-index", "constitution.md"),
      "# Constitution\n\n## Context Routing\n\n| K | V |\n|---|---|\n| Build state | `.context-index/build-state/` |\n",
    );
    return dir;
  }

  describe("idempotency — three-run check", () => {
    it("first run migrates, second run skips with no I/O", async () => {
      const root = makeProject();
      try {
        const first = await migrateAll(root, {});
        assert.equal(first.failed, false);
        const milestones1 = first.results.find((r) => r.artifact === "milestones");
        assert.equal(milestones1?.action, "migrated");

        // Capture mtimes
        const targets = [
          join(root, ".context-index", "milestones.json"),
          join(root, ".context-index", "constitution.md"),
        ];
        const mtimes1 = targets.map((t) => statSync(t).mtimeMs);

        // Sleep a moment to allow detectable mtime delta
        await new Promise((r) => setTimeout(r, 50));

        const second = await migrateAll(root, {});
        assert.equal(second.failed, false);
        for (const r of second.results) {
          assert.equal(r.action, "skipped", `${r.artifact} should be skipped`);
        }
        const mtimes2 = targets.map((t) => statSync(t).mtimeMs);
        assert.deepEqual(mtimes1, mtimes2, "skip path produces no on-disk diff");
      } finally {
        cleanupTempDir(root);
      }
    });

    it("third run still skips when legacy files are removed", async () => {
      const root = makeProject();
      try {
        await migrateAll(root, {});
        // Remove the legacy files manually
        unlinkSync(join(root, ".context-index", "milestones.yaml"));
        const third = await migrateAll(root, {});
        assert.equal(third.failed, false);
        const milestones3 = third.results.find((r) => r.artifact === "milestones");
        assert.equal(milestones3?.action, "skipped");
      } finally {
        cleanupTempDir(root);
      }
    });
  });
}

// ─── merged from tests/lib/migrate-state-artifacts.redaction.test.mjs ──────────────────────────────────────────────
{
  /**
   * Parse-error advisory redaction tests.
   *
   * Spec: .context-index/specs/features/agent-reliable-state-artifacts/one-shot-migration-tool.spec.md
   */








  const SECRET = "SUPER_SECRET_API_KEY_hunter2_DO_NOT_LEAK";

  function makeProject() {
    const dir = createTempDir();
    mkdirSync(join(dir, ".context-index"), { recursive: true });
    writeFileSync(
      join(dir, ".context-index", "manifest.yaml"),
      'project:\n  name: "t"\n',
    );
    return dir;
  }

  describe("parse-error advisory redaction", () => {
    it("malformed build-state JSON does not leak raw content", async () => {
      const root = makeProject();
      try {
        const bsDir = join(root, ".context-index", "build-state");
        mkdirSync(bsDir, { recursive: true });
        // malformed JSON with a secret in it
        writeFileSync(
          join(bsDir, "foo.json"),
          `{ "api_key": "${SECRET}", not_valid_json: [`,
        );
        const result = await migrateAll(root, {});
        assert.equal(result.failed, true);

        // The secret must NOT appear in any failure advisory's context
        // (we redact via safeContext)
        const fail = result.preflight.failures.find((f) =>
          f.code === "BUILD_STATE_PARSE_ERROR" || f.code === "PARSE_ERROR" ||
          (typeof f.context === "string" && f.context.length > 0)
        );
        // The preflight returns a structured advisory; ensure raw secret is
        // not embedded in any failure record's serialized form.
        const serialized = JSON.stringify(result.preflight.failures);
        assert.ok(
          !serialized.includes(SECRET),
          `secret should NOT be present in preflight failure serialization`,
        );
      } finally {
        cleanupTempDir(root);
      }
    });

    it("malformed milestones.yaml does not leak raw content", async () => {
      const root = makeProject();
      try {
        const yamlPath = join(root, ".context-index", "milestones.yaml");
        // Broken YAML with secret
        writeFileSync(
          yamlPath,
          `password: ${SECRET}\nmilestones:\n  - name: ":bad:\n   nested:\n      [unbalanced\n`,
        );
        const result = await migrateAll(root, {});
        const serialized = JSON.stringify(result);
        assert.ok(
          !serialized.includes(SECRET),
          `secret should NOT be present in migrate result`,
        );
      } finally {
        cleanupTempDir(root);
      }
    });

    it("safeContext strips control chars and caps at 200", () => {
      const raw = "hello\x00world" + "x".repeat(500);
      const ctx = _internal.safeContext(raw);
      assert.ok(!ctx.includes("\x00"));
      assert.ok(ctx.length <= 200);
    });
  });
}
