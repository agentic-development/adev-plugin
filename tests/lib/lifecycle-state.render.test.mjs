/**
 * Tests for the markdown-rendering-layer enhancements to
 * `lib/lifecycle-state.mjs`:
 *
 *   - Task 5: `renderMarkdown(state)` full body
 *   - Task 6: `listLifecycleStates(projectRoot)` — lex sort, missing-dir empty
 *   - Task 8: slug allowlist warning (SKIPPED_INVALID_SLUG), oversized log skip
 *             (OVERSIZED_LOG_SKIPPED)
 *   - Task 14: per-event-variant renderMarkdown projection coverage
 *   - Task 18: architectural — renderMarkdown source contains no
 *             `domain-config` import
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

import {
  renderMarkdown,
  listLifecycleStates,
  currentState,
  appendEvent,
  ensureLifecycleState,
} from "../../lib/lifecycle-state.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

function seedProject(tmp) {
  writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: lc-render-test\n");
  return tmp;
}

function specPath(slug) {
  return `.context-index/specs/.synthetic/${slug}.spec.md`;
}

describe("renderMarkdown — Task 5 (full body)", () => {
  let tmp;
  beforeEach(() => {
    tmp = seedProject(createTempDir());
  });
  afterEach(() => cleanupTempDir(tmp));

  it("renders a minimal empty projection with H1 + DO NOT EDIT header", () => {
    const empty = currentState(tmp, specPath("empty"));
    const md = renderMarkdown(empty);
    assert.ok(md.includes("DO NOT EDIT"), "must contain generated header");
    assert.ok(md.includes("# Lifecycle:"), "must contain H1 heading");
    assert.ok(md.includes(specPath("empty")), "H1 must include spec path");
  });

  it("renders metadata table with status, currentStep, currentTask, startedAt, updatedAt", () => {
    const slug = "metatest";
    ensureLifecycleState(tmp, specPath(slug));
    appendEvent(tmp, specPath(slug), {
      ts: "2026-05-01T10:00:00Z",
      event: "lifecycle_step",
      step: "specify",
      status: "started",
      spec: `specs/${slug}.spec.md`,
      actor: "system",
    });
    const state = currentState(tmp, specPath(slug));
    const md = renderMarkdown(state);
    assert.ok(md.includes("specify"), "must list current step");
    assert.ok(md.includes("in_progress"), "must surface status");
    assert.ok(md.includes("2026-05-01"), "must include updatedAt timestamp");
  });

  it("renders ## Steps with one H3 per touched step", () => {
    const slug = "steps";
    ensureLifecycleState(tmp, specPath(slug));
    appendEvent(tmp, specPath(slug), {
      ts: "2026-05-01T10:00:00Z",
      event: "lifecycle_step",
      step: "specify",
      status: "started",
      actor: "system",
    });
    appendEvent(tmp, specPath(slug), {
      ts: "2026-05-01T10:05:00Z",
      event: "step_completed",
      step: "specify",
      verdict: "PASS",
      actor: "system",
    });
    appendEvent(tmp, specPath(slug), {
      ts: "2026-05-01T10:10:00Z",
      event: "lifecycle_step",
      step: "review",
      status: "started",
      actor: "system",
    });
    const state = currentState(tmp, specPath(slug));
    const md = renderMarkdown(state);
    assert.ok(md.includes("## Steps"), "must include Steps section");
    assert.ok(md.includes("### specify"), "must include H3 for specify");
    assert.ok(md.includes("### review"), "must include H3 for review");
    assert.ok(md.includes("PASS"), "must surface verdicts");
  });

  it("renders ## Plan Tasks section when plan_task events exist", () => {
    const slug = "plantasks";
    ensureLifecycleState(tmp, specPath(slug));
    appendEvent(tmp, specPath(slug), {
      ts: "2026-05-01T10:00:00Z",
      event: "plan_task",
      plan: "plans/p.md",
      task_id: "task-1",
      status: "in_progress",
      actor: "agent",
    });
    const state = currentState(tmp, specPath(slug));
    const md = renderMarkdown(state);
    assert.ok(md.includes("## Plan Tasks"), "must include Plan Tasks section");
    assert.ok(md.includes("task-1"), "must list task_id");
  });

  it("renders ## Interventions section when debug_intervention exists", () => {
    const slug = "intvtest";
    ensureLifecycleState(tmp, specPath(slug));
    appendEvent(tmp, specPath(slug), {
      ts: "2026-05-01T10:00:00Z",
      event: "debug_intervention",
      note: "fixed bug",
      actor: "agent",
    });
    const state = currentState(tmp, specPath(slug));
    const md = renderMarkdown(state);
    assert.ok(md.includes("## Interventions"), "must include Interventions section");
    assert.ok(md.includes("fixed bug"), "must list intervention note");
  });

  it("does NOT render ## Unknown Events section when unknownEvents is empty", () => {
    const slug = "noUnknown";
    ensureLifecycleState(tmp, specPath(slug));
    appendEvent(tmp, specPath(slug), {
      ts: "2026-05-01T10:00:00Z",
      event: "lifecycle_step",
      step: "specify",
      status: "started",
      actor: "system",
    });
    const state = currentState(tmp, specPath(slug));
    const md = renderMarkdown(state);
    assert.ok(!md.includes("## Unknown Events"));
  });

  it("renders ## Unknown Events when unknownEvents is non-empty", () => {
    const slug = "haveUnknown";
    ensureLifecycleState(tmp, specPath(slug));
    appendEvent(tmp, specPath(slug), {
      ts: "2026-05-01T10:00:00Z",
      event: "future_event_v3",
      payload: { kind: "experimental" },
      actor: "agent",
    });
    const state = currentState(tmp, specPath(slug));
    const md = renderMarkdown(state);
    assert.ok(md.includes("## Unknown Events"), "must include Unknown Events section");
  });

  it("includes a trailing regeneration-timestamp footer", () => {
    const slug = "footer";
    const state = currentState(tmp, specPath(slug));
    const md = renderMarkdown(state);
    // Footer line: `<!-- regenerated from <slug>.jsonl on <ts> -->`
    assert.ok(/regenerated from .*\.jsonl on/.test(md), "must include footer with regen timestamp");
  });

  it("escapes attacker-controlled free text in notes/error/reason fields", () => {
    const slug = "xss";
    ensureLifecycleState(tmp, specPath(slug));
    appendEvent(tmp, specPath(slug), {
      ts: "2026-05-01T10:00:00Z",
      event: "reviewer_report",
      step: "review",
      reviewer: "security",
      verdict: "FAIL",
      severity: "error",
      notes: "<script>alert('xss')</script>",
      actor: "agent",
    });
    const state = currentState(tmp, specPath(slug));
    const md = renderMarkdown(state);
    assert.ok(
      md.includes("&lt;script&gt;"),
      "notes must be HTML-escaped before interpolation",
    );
    assert.ok(
      !md.includes("<script>alert"),
      "raw <script> must not appear in rendered output",
    );
  });
});

describe("listLifecycleStates — Task 6 + Task 8", () => {
  let tmp;
  beforeEach(() => {
    tmp = seedProject(createTempDir());
  });
  afterEach(() => cleanupTempDir(tmp));

  it("returns [] when lifecycle-state directory does not exist", () => {
    const res = listLifecycleStates(tmp);
    assert.deepEqual(res, []);
  });

  it("returns one record per `<slug>.jsonl` sorted lexicographically by slug", () => {
    // Seed three files in non-alpha order.
    for (const slug of ["zeta", "alpha", "middle"]) {
      ensureLifecycleState(tmp, specPath(slug));
      appendEvent(tmp, specPath(slug), {
        ts: "2026-05-01T10:00:00Z",
        event: "lifecycle_step",
        step: "specify",
        status: "started",
        actor: "system",
      });
    }
    const res = listLifecycleStates(tmp);
    assert.equal(res.length, 3);
    assert.deepEqual(
      res.map((r) => r.slug),
      ["alpha", "middle", "zeta"],
    );
  });

  it("skips files whose stems fail [a-z0-9._-]+ with SKIPPED_INVALID_SLUG warning", () => {
    // Direct write to bypass slug validation in ensureLifecycleState.
    const dir = join(tmp, ".context-index", "lifecycle-state");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "valid.jsonl"), '{"event":"lifecycle_step","step":"specify","status":"started","ts":"2026-05-01T10:00:00Z"}\n');
    writeFileSync(join(dir, "INVALID.jsonl"), '{}\n'); // uppercase fails allowlist
    writeFileSync(join(dir, "bad spaces.jsonl"), '{}\n');

    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(" "));
    try {
      const res = listLifecycleStates(tmp);
      assert.equal(res.length, 1, "only the valid slug should be returned");
      assert.equal(res[0].slug, "valid");
      assert.ok(
        warnings.some((w) => w.includes("SKIPPED_INVALID_SLUG")),
        `expected SKIPPED_INVALID_SLUG warning, got: ${JSON.stringify(warnings)}`,
      );
    } finally {
      console.warn = origWarn;
    }
  });

  it("skips files exceeding 50 MB with OVERSIZED_LOG_SKIPPED warning", async () => {
    const { truncateSync } = await import("node:fs");
    const dir = join(tmp, ".context-index", "lifecycle-state");
    mkdirSync(dir, { recursive: true });

    // Small sibling that should still render.
    const small = join(dir, "small.jsonl");
    writeFileSync(small, '{"event":"lifecycle_step","step":"specify","status":"started","ts":"2026-05-01T10:00:00Z"}\n');

    // Oversized file — use sparse-file truncation to reach > 50 MB without
    // actually allocating that many bytes (POSIX sparse-file support).
    const big = join(dir, "huge.jsonl");
    writeFileSync(big, '{"event":"lifecycle_step","step":"specify","status":"started","ts":"2026-05-01T10:00:00Z"}\n');
    truncateSync(big, 60 * 1024 * 1024); // 60 MB

    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(" "));
    try {
      const res = listLifecycleStates(tmp);
      const slugs = res.map((r) => r.slug).sort();
      assert.ok(slugs.includes("small"), "small sibling must still render");
      assert.ok(
        !slugs.includes("huge"),
        "huge log must be skipped, not surfaced as a record",
      );
      assert.ok(
        warnings.some((w) => w.includes("OVERSIZED_LOG_SKIPPED")),
        `expected OVERSIZED_LOG_SKIPPED warning, got: ${JSON.stringify(warnings)}`,
      );
    } finally {
      console.warn = origWarn;
    }
  });
});

// Task 18 — architectural (no domain-config import in renderMarkdown body)
describe("architectural — Task 18", () => {
  it("renderMarkdown body does not call/import domain-config (only comments may mention it)", () => {
    const src = readFileSync(
      join(import.meta.dirname ?? ".", "../../lib/lifecycle-state.mjs"),
      "utf8",
    );
    // Find the start of `export function renderMarkdown(` and assert the
    // function body up to the next top-level `export function` contains no
    // executable reference to domain-config (loadDomainConfig calls or
    // dynamic imports). Comments mentioning the word are fine because they
    // document the invariant.
    const start = src.indexOf("export function renderMarkdown");
    assert.ok(start >= 0, "renderMarkdown must exist");
    const nextExport = src.indexOf("\nexport function ", start + 30);
    const body = nextExport >= 0 ? src.slice(start, nextExport) : src.slice(start);

    // Strip comments: line comments (//) and block comments (/* … */).
    const stripped = body
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((l) => {
        const idx = l.indexOf("//");
        return idx >= 0 ? l.slice(0, idx) : l;
      })
      .join("\n");

    assert.ok(
      !stripped.includes("loadDomainConfig("),
      "renderMarkdown must not call loadDomainConfig (severity is pre-stamped on events)",
    );
    assert.ok(
      !/import\s*\(.*domain-config/.test(stripped),
      "renderMarkdown must not dynamic-import domain-config",
    );
  });
});
