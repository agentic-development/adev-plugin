/**
 * Regression tests for the silently-dropped issue body (issue-484).
 *
 * `validateIssue` returns a FIXED WHITELIST object, so any key missing from
 * that return literal is dropped rather than rejected. `description` and `body`
 * — the two names a caller reaches for when supplying an issue's prose — were
 * both missing from it, so `create({ title, body })` reported success and
 * persisted an empty `notes`. No error, no warning, text gone.
 *
 * The fix treats those two names as ALIASES of the canonical `notes` field
 * rather than as new fields: `notes` is already the issue body on every backend
 * (the beads adapter writes it as `br --description` and reads `description`
 * back into `notes`), so the alias resolves at the shared `validateIssue`
 * boundary and both adapters inherit it.
 *
 * These tests go through the real write path (`create()` → `get()` on a FRESH
 * adapter) rather than asserting on `validateIssue`'s return value alone: an
 * in-memory echo would pass even if nothing reached disk, which is the exact
 * failure mode under test.
 *
 * Covers:
 *   - body / description survive create → get → list
 *   - notes keeps working unchanged (no regression on the canonical name)
 *   - empty and absent aliases do not manufacture a conflict
 *   - two aliases disagreeing fail LOUDLY (CONFLICTING_NOTES_FIELDS)
 *   - a canonical `notes` beside an alias does NOT throw — see the
 *     migration-replay test at the bottom for why that case has to stay
 *     permissive
 *   - non-string alias rejected with INVALID_NOTES
 *   - update() folds an alias into notes instead of leaving a stray key
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { validateIssue, NOTES_ALIASES } from "../../lib/issues/interface.mjs";
import { JsonAdapter } from "../../lib/issues/json-adapter.mjs";

function makeProject() {
  const dir = mkdtempSync(join(tmpdir(), "issue-body-alias-test-"));
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
  return dir;
}

// ---------------------------------------------------------------------------
// validateIssue
// ---------------------------------------------------------------------------

describe("validateIssue — issue body aliases", () => {
  it("exposes description and body as the declared aliases", () => {
    assert.deepEqual([...NOTES_ALIASES], ["description", "body"]);
  });

  for (const alias of NOTES_ALIASES) {
    it(`maps ${alias} onto notes`, () => {
      const issue = validateIssue({ title: "T", [alias]: "the prose the user typed" });
      assert.equal(issue.notes, "the prose the user typed");
    });

    it(`does not leak ${alias} as a separate field`, () => {
      const issue = validateIssue({ title: "T", [alias]: "text" });
      assert.equal(
        Object.prototype.hasOwnProperty.call(issue, alias),
        false,
        `${alias} should resolve into notes, not become a fifth column`,
      );
    });

    it(`rejects a non-string ${alias} with INVALID_NOTES`, () => {
      assert.throws(
        () => validateIssue({ title: "T", [alias]: 42 }),
        (err) => err.code === "INVALID_NOTES",
      );
    });

    it(`treats an empty ${alias} as absent`, () => {
      const issue = validateIssue({ title: "T", notes: "kept", [alias]: "" });
      assert.equal(issue.notes, "kept");
    });
  }

  it("keeps notes working unchanged (+1 more contract assertions)", () => {
    // keeps notes working unchanged
    assert.equal(validateIssue({ title: "T", notes: "canonical" }).notes, "canonical");

    // defaults notes to empty string when no prose is supplied
    assert.equal(validateIssue({ title: "T" }).notes, "");
  });

  it("prefers notes when an alias carries identical text", () => {
    const issue = validateIssue({ title: "T", notes: "same", description: "same", body: "same" });
    assert.equal(issue.notes, "same");
  });

  it("rejects two aliases carrying different text", () => {
    assert.throws(
      () => validateIssue({ title: "T", description: "one", body: "two" }),
      (err) => err.code === "CONFLICTING_NOTES_FIELDS",
    );
  });

  it("names the conflicting fields in the error message", () => {
    assert.throws(
      () => validateIssue({ title: "T", description: "one", body: "two" }),
      /description and body/,
    );
  });

  it("lets a canonical notes win over a disagreeing alias without throwing", () => {
    // Must NOT throw: pre-fix boards can carry a stray alias key beside
    // `notes`, and `adev issues migrate` replays those records through
    // create(). See the migration-replay test below.
    const issue = validateIssue({ title: "T", notes: "canonical", body: "stray" });
    assert.equal(issue.notes, "canonical");
  });
});

// ---------------------------------------------------------------------------
// JsonAdapter — the silent-loss regression itself
// ---------------------------------------------------------------------------

describe("JsonAdapter — issue body survives create()", () => {
  let dir, adapter;

  before(async () => {
    dir = makeProject();
    adapter = new JsonAdapter(dir);
    await adapter.init();
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  for (const alias of NOTES_ALIASES) {
    it(`persists a ${alias} through create(), get(), and list()`, async () => {
      const prose = `body supplied as ${alias} — must not vanish`;
      const created = await adapter.create({ title: `create with ${alias}`, [alias]: prose });

      assert.equal(
        created.notes,
        prose,
        `create() dropped ${alias} — check the validateIssue alias resolution`,
      );

      // A fresh adapter forces a real disk read rather than an in-memory echo.
      const reader = new JsonAdapter(dir);
      const fetched = await reader.get(created.id);
      assert.ok(fetched, "issue should be readable back from disk");
      assert.equal(fetched.notes, prose, `get() lost the ${alias} text`);

      const listed = (await reader.list({})).find((i) => i.id === created.id);
      assert.ok(listed, "issue should appear in list()");
      assert.equal(listed.notes, prose, `list() lost the ${alias} text`);
    });
  }

  it("rejects two conflicting aliases at create() without mutating the board", async () => {
    const countBefore = (await adapter.list({})).length;
    await assert.rejects(
      () => adapter.create({ title: "conflicting", body: "one", description: "two" }),
      (err) => err.code === "CONFLICTING_NOTES_FIELDS",
    );
    const countAfter = (await new JsonAdapter(dir).list({})).length;
    assert.equal(countAfter, countBefore, "a rejected create must not land an issue");
  });

  for (const alias of NOTES_ALIASES) {
    it(`update({ ${alias} }) edits notes instead of leaving a stray key`, async () => {
      const created = await adapter.create({ title: `update via ${alias}`, notes: "original" });
      await adapter.update(created.id, { [alias]: "revised" });

      const fetched = await new JsonAdapter(dir).get(created.id);
      assert.equal(fetched.notes, "revised", `update() ignored ${alias}`);
      assert.equal(
        Object.prototype.hasOwnProperty.call(fetched, alias),
        false,
        `${alias} persisted as a stray key beside notes`,
      );
    });
  }

  it("replays a legacy record carrying a stray alias key (migration path)", async () => {
    // `adev issues migrate` feeds raw board records back through create()
    // (projectIssueForCreate strips only dependencies/created/updated). Boards
    // written before this fix can hold `description` beside `notes`, so that
    // pair must migrate rather than abort with CONFLICTING_NOTES_FIELDS.
    const legacyRecord = {
      id: "issue-legacy",
      title: "Legacy record",
      status: "open",
      priority: 2,
      type: "task",
      notes: "real body",
      description: "stray key from a pre-fix update()",
      next_action: null,
    };

    const target = makeProject();
    try {
      const targetAdapter = new JsonAdapter(target);
      await targetAdapter.init();
      const { dependencies, created, updated, ...payload } = legacyRecord;
      const migrated = await targetAdapter.create(payload);
      assert.equal(migrated.notes, "real body");
      assert.equal(Object.prototype.hasOwnProperty.call(migrated, "description"), false);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });
});
