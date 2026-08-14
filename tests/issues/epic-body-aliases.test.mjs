/**
 * Regression tests for the silently-dropped EPIC body (issue-80m9s2).
 *
 * Sibling of issue-484, in the same file and with the same root cause:
 * `validateEpic` ends in a FIXED WHITELIST return literal, and `notes` was
 * missing from it entirely — not even the whitelisted-and-defaulted treatment
 * `validateIssue` gave it. Both adapters treat `notes` as the epic body (the
 * beads adapter writes it as `br create --description` and reads
 * `item.description` back into `notes` in `_toEpic`), so every epic created
 * through `createEpic()` reported success and persisted no prose. Confirmed
 * live: all 11 topic epics minted with merge-safe ids landed in beads with a
 * zero-length description.
 *
 * The fix reuses `resolveNotes` — the helper issue-484 introduced — so
 * `description`/`body` are aliases of `notes` for epics on the same terms as
 * for issues, including the ASYMMETRIC conflict rule. Epics need that asymmetry
 * for the same reason issues did: `updateEpic()` runs no validator, so a board
 * can carry a stray alias key beside `notes`, and `adev issues migrate` replays
 * raw epic records through `createEpic()` (`projectEpicForCreate` strips only
 * `created`/`updated`). See the migration-replay test at the bottom.
 *
 * The adapter tests read back through a FRESH adapter (a real disk read, not an
 * in-memory echo of the argument). The absence of exactly that assertion is
 * what let this defect and issue-484 both survive.
 *
 * Note: `JsonAdapter.get()` searches the `issues` array only, so epics are read
 * back via `listEpics()`.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { validateEpic, NOTES_ALIASES } from "../../lib/issues/interface.mjs";
import { JsonAdapter } from "../../lib/issues/json-adapter.mjs";

function makeProject() {
  const dir = mkdtempSync(join(tmpdir(), "epic-body-alias-test-"));
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
  return dir;
}

// ---------------------------------------------------------------------------
// validateEpic
// ---------------------------------------------------------------------------

describe("validateEpic — epic body", () => {
  it("keeps a canonical notes value instead of dropping it", () => {
    // The defect itself: `notes` was absent from the return literal.
    const epic = validateEpic({ title: "Topic epic", notes: "what this epic collects" });
    assert.equal(epic.notes, "what this epic collects");
  });

  it("defaults notes to an empty string when no prose is supplied", () => {
    // "" rather than undefined, so a created epic matches one read back through
    // BeadsAdapter._toEpic (`item.description || ""`).
    assert.equal(validateEpic({ title: "T" }).notes, "");
  });

  for (const alias of NOTES_ALIASES) {
    it(`maps ${alias} onto notes`, () => {
      const epic = validateEpic({ title: "T", [alias]: "the prose the user typed" });
      assert.equal(epic.notes, "the prose the user typed");
    });

    it(`does not leak ${alias} as a separate epic field`, () => {
      const epic = validateEpic({ title: "T", [alias]: "text" });
      assert.equal(
        Object.prototype.hasOwnProperty.call(epic, alias),
        false,
        `${alias} should resolve into notes, not become a new epic column`,
      );
    });

    it(`rejects a non-string ${alias} with INVALID_NOTES`, () => {
      assert.throws(
        () => validateEpic({ title: "T", [alias]: 42 }),
        (err) => err.code === "INVALID_NOTES",
      );
    });

    it(`treats an empty ${alias} as absent`, () => {
      const epic = validateEpic({ title: "T", notes: "kept", [alias]: "" });
      assert.equal(epic.notes, "kept");
    });
  }

  it("rejects two aliases carrying different text", () => {
    assert.throws(
      () => validateEpic({ title: "T", description: "one", body: "two" }),
      (err) => err.code === "CONFLICTING_NOTES_FIELDS",
    );
  });

  it("lets a canonical notes win over a disagreeing alias without throwing", () => {
    // Must NOT throw — see the migration-replay test below.
    const epic = validateEpic({ title: "T", notes: "canonical", body: "stray" });
    assert.equal(epic.notes, "canonical");
  });

  it("resolves the body without disturbing the other epic fields", () => {
    const epic = validateEpic({
      title: "  Release v1  ",
      notes: "scope of the release",
      planRef: "plans/release.md",
      milestone: "v1",
      status: "in_progress",
    });
    assert.equal(epic.title, "Release v1");
    assert.equal(epic.notes, "scope of the release");
    assert.equal(epic.planRef, "plans/release.md");
    assert.equal(epic.milestone, "v1");
    assert.equal(epic.status, "in_progress");
  });
});

// ---------------------------------------------------------------------------
// JsonAdapter — the silent-loss regression itself, through a real disk write
// ---------------------------------------------------------------------------

describe("JsonAdapter — epic body survives createEpic()", () => {
  let dir, adapter;

  before(async () => {
    dir = makeProject();
    adapter = new JsonAdapter(dir);
    await adapter.init();
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  async function readBack(id) {
    // A fresh adapter forces a real disk read rather than an in-memory echo.
    const epics = await new JsonAdapter(dir).listEpics({});
    return epics.find((e) => e.id === id);
  }

  it("persists notes through createEpic() and reads it back from disk", async () => {
    const prose = "Collects every issue about the skill and CLI surface.";
    const created = await adapter.createEpic({ title: "Topic epic", notes: prose });

    assert.equal(
      created.notes,
      prose,
      "createEpic() dropped notes — check the validateEpic return literal",
    );

    const fetched = await readBack(created.id);
    assert.ok(fetched, "epic should be readable back from disk");
    assert.equal(fetched.notes, prose, "listEpics() lost the epic body");
  });

  for (const alias of NOTES_ALIASES) {
    it(`persists a ${alias} through createEpic() and reads it back from disk`, async () => {
      const prose = `epic body supplied as ${alias} — must not vanish`;
      const created = await adapter.createEpic({ title: `epic with ${alias}`, [alias]: prose });

      assert.equal(created.notes, prose, `createEpic() dropped ${alias}`);

      const fetched = await readBack(created.id);
      assert.ok(fetched, "epic should be readable back from disk");
      assert.equal(fetched.notes, prose, `listEpics() lost the ${alias} text`);
      assert.equal(
        Object.prototype.hasOwnProperty.call(fetched, alias),
        false,
        `${alias} persisted as a stray key beside notes`,
      );
    });
  }

  it("stores an empty body as \"\" for an epic created without prose", async () => {
    const created = await adapter.createEpic({ title: "bodyless epic" });
    assert.equal(created.notes, "");
    const fetched = await readBack(created.id);
    assert.equal(fetched.notes, "");
  });

  it("rejects two conflicting aliases at createEpic() without mutating the board", async () => {
    const countBefore = (await adapter.listEpics({})).length;
    await assert.rejects(
      () => adapter.createEpic({ title: "conflicting", body: "one", description: "two" }),
      (err) => err.code === "CONFLICTING_NOTES_FIELDS",
    );
    const countAfter = (await new JsonAdapter(dir).listEpics({})).length;
    assert.equal(countAfter, countBefore, "a rejected createEpic must not land an epic");
  });

  it("updateEpic({ notes }) edits the body and it survives a disk read", async () => {
    const created = await adapter.createEpic({ title: "evolving epic", notes: "original" });
    await adapter.updateEpic(created.id, { notes: "revised" });
    const fetched = await readBack(created.id);
    assert.equal(fetched.notes, "revised");
  });

  it("replays a legacy epic record carrying a stray alias key (migration path)", async () => {
    // `adev issues migrate` feeds raw board epics back through createEpic()
    // (projectEpicForCreate strips only created/updated), and `updateEpic()`
    // merges its change set with no validator — so a board can hold
    // `description` beside `notes`. That pair must migrate rather than abort
    // the run with MIGRATE_PARTIAL_FAILURE.
    const legacyEpic = {
      id: "epic-legacy",
      title: "Legacy epic",
      status: "open",
      notes: "real body",
      description: "stray key from a pre-fix updateEpic()",
      milestone: "v1",
    };

    const target = makeProject();
    try {
      const targetAdapter = new JsonAdapter(target);
      await targetAdapter.init();
      const { created, updated, ...payload } = legacyEpic;
      const migrated = await targetAdapter.createEpic(payload);
      assert.equal(migrated.notes, "real body");
      assert.equal(
        Object.prototype.hasOwnProperty.call(migrated, "description"),
        false,
        "the stray alias key must not be carried onto the migrated epic",
      );
      // Id is deliberately not asserted: JsonAdapter.createEpic mints a fresh
      // merge-safe id inside its CAS block regardless of what was supplied.
      const onDisk = (await new JsonAdapter(target).listEpics({})).find(
        (e) => e.title === "Legacy epic",
      );
      assert.equal(onDisk.notes, "real body");
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });
});
