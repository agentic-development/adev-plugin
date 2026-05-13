/**
 * Schema-version test surface for lib/issues/json-adapter.mjs.
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/test-migration.spec.md
 * Sibling spec: .context-index/specs/features/agent-reliable-state-artifacts/json-issue-board-adapter.spec.md
 *
 * Coverage:
 *   - version: 2 happy path (Behaviors row 2 / AC #2)
 *   - version: 3 forward-compat: unknown fields on epics/issues survive a
 *     round-trip; top-level unknown keys are DROPPED on write
 *     (Behaviors row 3 / AC #3 / SA-3 / CON-1 contract gap)
 *   - version: 1, version: 0 rejection with UNSUPPORTED_BOARD_VERSION
 *     (Behaviors row 4 / Error Cases row 1 / AC #2)
 *   - non-numeric version: canonical fixed-string fallback (no raw-value
 *     interpolation — SEC-4 / SA-2 / Error Cases row 2)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  JsonAdapter,
  UNSUPPORTED_VERSION_FALLBACK,
} from "../../../lib/issues/json-adapter.mjs";

/**
 * Create a temp project root with a pre-seeded `tasks.json` of the given
 * content and a minimal manifest. Cleans up after the test.
 */
function setupBoard(t, boardContent) {
  const storageRoot = mkdtempSync(join(tmpdir(), "json-adapter-schema-version-"));
  t.after(() => rmSync(storageRoot, { recursive: true, force: true }));
  mkdirSync(join(storageRoot, ".context-index", "tasks"), { recursive: true });
  writeFileSync(
    join(storageRoot, ".context-index", "tasks", "tasks.json"),
    JSON.stringify(boardContent, null, 2),
  );
  writeFileSync(
    join(storageRoot, ".context-index", "manifest.yaml"),
    "tasks:\n  backend: json\n",
  );
  return { adapter: new JsonAdapter(storageRoot), storageRoot };
}

describe("JsonAdapter — schema version", () => {
  it("reads version: 2 happy path", async (t) => {
    const { adapter } = setupBoard(t, { version: 2, epics: [], issues: [] });
    assert.deepEqual(await adapter.listEpics(), []);
    assert.deepEqual(await adapter.list(), []);
  });

  it("reads version: 3 forward-compat: preserves unknown fields on epics and issues; DROPS unknown top-level keys on write", async (t) => {
    // SA-3 / CON-1: cover unknown fields on epics, issues, AND top-level.
    // Behavior verified against lib/issues/json-adapter.mjs:_write:
    // _write reconstructs { version: 2, epics, issues } only — top-level
    // unknown keys are dropped. This is a CON-1 contract gap recorded as a
    // follow-up against json-issue-board-adapter.spec.md.
    const original = {
      version: 3,
      epics: [
        { id: "epic-1", title: "E", status: "open", futureField: "epicX" },
      ],
      issues: [
        {
          id: "issue-1",
          title: "I",
          status: "open",
          priority: 2,
          type: "task",
          futureField: "issueX",
        },
      ],
      futureTopLevel: { schema: "v3-metadata" },
    };
    const { adapter, storageRoot } = setupBoard(t, original);

    const epics = await adapter.listEpics();
    const issues = await adapter.list();
    assert.equal(epics[0].futureField, "epicX", "unknown epic field read");
    assert.equal(issues[0].futureField, "issueX", "unknown issue field read");

    await adapter.update("issue-1", { title: "I2" });
    const reread = JSON.parse(
      readFileSync(
        join(storageRoot, ".context-index", "tasks", "tasks.json"),
        "utf8",
      ),
    );
    assert.equal(reread.version, 2, "writers always emit version: 2");
    assert.equal(
      reread.epics[0].futureField,
      "epicX",
      "unknown epic field preserved on round-trip",
    );
    assert.equal(
      reread.issues[0].futureField,
      "issueX",
      "unknown issue field preserved on round-trip",
    );
    // SA-3: assert the deterministic dropped-on-write behavior. Documented
    // contract gap (CON-1): top-level unknown keys are NOT preserved.
    assert.equal(
      reread.futureTopLevel,
      undefined,
      "top-level unknown keys are dropped on write (documented contract gap)",
    );
  });

  it("rejects version: 1 with UNSUPPORTED_BOARD_VERSION", async (t) => {
    const { adapter } = setupBoard(t, { version: 1, epics: [], issues: [] });
    await assert.rejects(
      () => adapter.list(),
      (err) => err.code === "UNSUPPORTED_BOARD_VERSION",
    );
  });

  it("rejects version: 0 with UNSUPPORTED_BOARD_VERSION", async (t) => {
    const { adapter } = setupBoard(t, { version: 0, epics: [], issues: [] });
    await assert.rejects(
      () => adapter.list(),
      (err) => err.code === "UNSUPPORTED_BOARD_VERSION",
    );
  });

  it("rejects non-numeric version using the canonical fixed-string fallback (SA-2 / SEC-4)", async (t) => {
    const { adapter } = setupBoard(t, {
      version: "v2",
      epics: [],
      issues: [],
    });
    await assert.rejects(
      () => adapter.list(),
      (err) => {
        assert.equal(err.code, "UNSUPPORTED_BOARD_VERSION");
        assert.equal(
          err.message,
          UNSUPPORTED_VERSION_FALLBACK,
          "fallback constant is used verbatim",
        );
        assert.ok(
          !err.message.includes("v2"),
          "raw value must not be interpolated (SEC-4)",
        );
        return true;
      },
    );
  });
});
