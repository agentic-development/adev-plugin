import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { JsonAdapter, MAX_CAS_RETRIES } from "../../lib/issues/json-adapter.mjs";
import { cleanupTempDir, createTempDir, writeFixture } from "../helpers.mjs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

test("_write(data, expectedSeq) throws STALE_BOARD_WRITE_RETRY when disk seq advanced", () => {
  const root = createTempDir();
  try {
    writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
    writeFixture(
      root,
      ".context-index/tasks/tasks.json",
      JSON.stringify({ version: 2, seq: 0, epics: [], issues: [] }),
    );
    const adapter = new JsonAdapter(root);
    const { board, seq } = adapter._readWithSeq();
    assert.equal(seq, 0);

    // Simulate concurrent writer bumping disk to seq 1 between our read and write
    writeFileSync(
      join(root, ".context-index/tasks/tasks.json"),
      JSON.stringify({ version: 2, seq: 1, epics: [], issues: [] }) + "\n",
    );

    assert.throws(
      () => adapter._write(board, 0),
      (err) => err.code === "STALE_BOARD_WRITE_RETRY",
    );
  } finally {
    cleanupTempDir(root);
  }
});

test("_write(data, expectedSeq) stamps seq = expectedSeq + 1 on success", () => {
  const root = createTempDir();
  try {
    writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
    writeFixture(
      root,
      ".context-index/tasks/tasks.json",
      JSON.stringify({ version: 2, seq: 0, epics: [], issues: [] }),
    );
    const adapter = new JsonAdapter(root);
    adapter._write({ version: 2, epics: [], issues: [] }, 0);
    const after = JSON.parse(readFileSync(join(root, ".context-index/tasks/tasks.json"), "utf8"));
    assert.equal(after.seq, 1);
  } finally {
    cleanupTempDir(root);
  }
});

test("_write preserves seq through the reconstructor (cross-spec amendment)", () => {
  const root = createTempDir();
  try {
    writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
    writeFixture(
      root,
      ".context-index/tasks/tasks.json",
      JSON.stringify({ version: 2, seq: 5, epics: [], issues: [] }),
    );
    const adapter = new JsonAdapter(root);
    // Multiple successful writes: each must bump seq monotonically
    adapter._write({ version: 2, epics: [], issues: [] }, 5);
    let after = JSON.parse(readFileSync(join(root, ".context-index/tasks/tasks.json"), "utf8"));
    assert.equal(after.seq, 6);

    adapter._write({ version: 2, epics: [], issues: [] }, 6);
    after = JSON.parse(readFileSync(join(root, ".context-index/tasks/tasks.json"), "utf8"));
    assert.equal(after.seq, 7);
  } finally {
    cleanupTempDir(root);
  }
});

test("_write(data, null) bypasses CAS — used for init path", () => {
  const root = createTempDir();
  try {
    writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
    const adapter = new JsonAdapter(root);
    // No tasks.json yet; init-style write must succeed without expectedSeq check
    adapter._write({ version: 2, epics: [], issues: [] }, null);
    const after = JSON.parse(readFileSync(join(root, ".context-index/tasks/tasks.json"), "utf8"));
    assert.equal(after.seq, 0);
  } finally {
    cleanupTempDir(root);
  }
});

// ─── merged from tests/issues/json-adapter-cas-concurrency.test.mjs ──────────────────────────────────────────────
{
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const CHILD_PATH = join(__dirname, "_cas-concurrency-child.mjs");
  const N = 10;

  function runChild(projectRoot, idx) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [CHILD_PATH, projectRoot, String(idx)]);
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => {
        out += d.toString();
      });
      child.stderr.on("data", (d) => {
        err += d.toString();
      });
      child.on("error", reject);
      child.on("exit", () => {
        try {
          resolve(JSON.parse(out));
        } catch (e) {
          reject(new Error(`child ${idx} produced unparseable stdout: "${out}" stderr: "${err}"`));
        }
      });
    });
  }

  test(`N=${N} concurrent mutators: every outcome observable, no silent loss, no orphan temp files`, async () => {
    const root = createTempDir();
    try {
      writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
      // Seed an empty board so children don't race on init().
      await new JsonAdapter(root).init();

      // Spawn N children in parallel.
      const results = await Promise.all(
        Array.from({ length: N }, (_, i) => runChild(root, i)),
      );

      // Every result is either "committed" or "stale" — no other outcome.
      const committed = results.filter((r) => r.status === "committed");
      const stale = results.filter((r) => r.status === "stale");
      assert.equal(
        committed.length + stale.length,
        N,
        `expected every outcome to be committed or stale; got ${JSON.stringify(results)}`,
      );
      for (const r of stale) {
        assert.equal(r.code, "STALE_BOARD_WRITE", `stale outcome must carry STALE_BOARD_WRITE code`);
      }

      // Read the final board.
      const board = JSON.parse(readFileSync(join(root, ".context-index/tasks/tasks.json"), "utf8"));

      // CONTRACTUAL GUARANTEE (Behavior 8): no mutation silently lost.
      // Every committed result must appear on the board.
      const committedTitles = new Set(committed.map((r) => r.title));
      const boardTitles = new Set(board.issues.map((i) => i.title));
      for (const t of committedTitles) {
        assert.ok(boardTitles.has(t), `committed title "${t}" missing from final board`);
      }

      // Board size equals committed count.
      assert.equal(
        board.issues.length,
        committed.length,
        `silent loss: ${committed.length} mutations committed but board has ${board.issues.length}`,
      );

      // seq tracks committed mutations (started at 0 from init()).
      assert.equal(
        board.seq,
        committed.length,
        `seq drift: expected seq=${committed.length}, got ${board.seq}`,
      );

      // No orphan .tmp files remain.
      const dirFiles = readdirSync(join(root, ".context-index/tasks"));
      const orphans = dirFiles.filter((f) => f.endsWith(".tmp"));
      assert.deepEqual(orphans, [], `orphan temp files left behind: ${orphans.join(", ")}`);
    } finally {
      cleanupTempDir(root);
    }
  });
}

// ─── merged from tests/issues/json-adapter-cas-exhaustion.test.mjs ──────────────────────────────────────────────
{
  test("STALE_BOARD_WRITE thrown after MAX_CAS_RETRIES exhausted", async () => {
    const root = createTempDir();
    try {
      writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
      await new JsonAdapter(root).init();

      const adapter = new JsonAdapter(root);

      // Force every CAS attempt to lose: after each _readWithSeq, bump disk
      // seq behind the adapter's back. Every retry sees a fresh snapshot but
      // by the time it tries to commit, disk has already advanced again.
      const orig = adapter._readWithSeq.bind(adapter);
      adapter._readWithSeq = function () {
        const result = orig();
        const board = JSON.parse(
          readFileSync(join(root, ".context-index/tasks/tasks.json"), "utf8"),
        );
        writeFileSync(
          join(root, ".context-index/tasks/tasks.json"),
          JSON.stringify({ ...board, seq: board.seq + 1 }) + "\n",
        );
        return result;
      };

      await assert.rejects(
        () => adapter.create({ title: "Doomed", type: "task" }),
        (err) => {
          assert.equal(err.code, "STALE_BOARD_WRITE", `expected STALE_BOARD_WRITE, got ${err.code}`);
          // Message must include op name + retry count (integers only)
          assert.match(err.message, /create/, "message should include op name");
          assert.match(
            err.message,
            new RegExp(`${MAX_CAS_RETRIES} retries`),
            "message should include retry count",
          );
          // Message MUST NOT include filesystem paths or document contents
          assert.ok(!err.message.includes("/tasks.json"), "message must not leak filesystem paths");
          assert.ok(!err.message.includes("Doomed"), "message must not leak document contents");
          return true;
        },
      );
    } finally {
      cleanupTempDir(root);
    }
  });

  test("STALE_BOARD_WRITE message references the failing op name correctly", async () => {
    const root = createTempDir();
    try {
      writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
      await new JsonAdapter(root).init();
      const adapter = new JsonAdapter(root);
      const created = await adapter.create({ title: "Target", type: "task" });

      // Same exhaustion pattern, but on update()
      const orig = adapter._readWithSeq.bind(adapter);
      adapter._readWithSeq = function () {
        const result = orig();
        const board = JSON.parse(
          readFileSync(join(root, ".context-index/tasks/tasks.json"), "utf8"),
        );
        writeFileSync(
          join(root, ".context-index/tasks/tasks.json"),
          JSON.stringify({ ...board, seq: board.seq + 1 }) + "\n",
        );
        return result;
      };

      await assert.rejects(
        () => adapter.update(created.id, { status: "in_progress" }),
        (err) => {
          assert.equal(err.code, "STALE_BOARD_WRITE");
          assert.match(err.message, /update/, "message should name the update op");
          return true;
        },
      );
    } finally {
      cleanupTempDir(root);
    }
  });
}

// ─── merged from tests/issues/json-adapter-cas-hostile-seed.test.mjs ──────────────────────────────────────────────
{
  const invalidSeqs = [
    { name: "negative integer", value: -1 },
    { name: "non-integer", value: 1.5 },
    { name: "string", value: "42" },
    { name: "NaN", value: Number.NaN },
    { name: "above MAX_SAFE_INTEGER", value: Number.MAX_SAFE_INTEGER + 1 },
  ];

  for (const { name, value } of invalidSeqs) {
    test(`INVALID_BOARD_SEQ rejects ${name} (${String(value)})`, async () => {
      const root = createTempDir();
      try {
        writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
        writeFixture(
          root,
          ".context-index/tasks/tasks.json",
          JSON.stringify({ version: 2, seq: value, epics: [], issues: [] }),
        );
        const adapter = new JsonAdapter(root);
        await assert.rejects(
          () => adapter.list(),
          (err) => {
            assert.equal(err.code, "INVALID_BOARD_SEQ");
            // Error message MUST NOT echo the offending value (SEC-1 sanitization)
            assert.ok(
              !String(err.message).includes(String(value)),
              `error message leaked the offending value: ${err.message}`,
            );
            return true;
          },
        );
      } finally {
        cleanupTempDir(root);
      }
    });
  }

  test("valid seq (integer 0..MAX_SAFE_INTEGER) is accepted", async () => {
    const root = createTempDir();
    try {
      writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
      writeFixture(
        root,
        ".context-index/tasks/tasks.json",
        JSON.stringify({ version: 2, seq: 42, epics: [], issues: [] }),
      );
      const adapter = new JsonAdapter(root);
      const issues = await adapter.list();
      assert.deepEqual(issues, []);
    } finally {
      cleanupTempDir(root);
    }
  });
}

// ─── merged from tests/issues/json-adapter-cas-legacy.test.mjs ──────────────────────────────────────────────
{
  test("Legacy tasks.json (no seq field) upgrades transparently on first write", async () => {
    const root = createTempDir();
    try {
      writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
      // Pre-CAS document — no seq field
      writeFixture(
        root,
        ".context-index/tasks/tasks.json",
        JSON.stringify({ version: 2, epics: [], issues: [] }),
      );

      const adapter = new JsonAdapter(root);
      await adapter.create({ title: "First post-upgrade issue", type: "task" });

      const after = JSON.parse(readFileSync(join(root, ".context-index/tasks/tasks.json"), "utf8"));
      assert.equal(after.seq, 1, "first CAS write should stamp seq=1");
      assert.equal(after.issues.length, 1);
      assert.equal(after.issues[0].title, "First post-upgrade issue");
    } finally {
      cleanupTempDir(root);
    }
  });

  test("Legacy tasks.json read-only operations work without seq field", async () => {
    const root = createTempDir();
    try {
      writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
      writeFixture(
        root,
        ".context-index/tasks/tasks.json",
        JSON.stringify({
          version: 2,
          epics: [{ id: "epic-1", title: "E", status: "open" }],
          issues: [{ id: "issue-1", title: "I", status: "open", type: "task", priority: 2 }],
        }),
      );
      const adapter = new JsonAdapter(root);
      const issues = await adapter.list();
      const epics = await adapter.listEpics();
      assert.equal(issues.length, 1);
      assert.equal(epics.length, 1);
    } finally {
      cleanupTempDir(root);
    }
  });
}

// ─── merged from tests/issues/json-adapter-cas-retry.test.mjs ──────────────────────────────────────────────
{
  test("MAX_CAS_RETRIES is exported and defaults to 3", () => {
    assert.equal(MAX_CAS_RETRIES, 3);
  });

  test("adapter.casMaxRetries defaults to MAX_CAS_RETRIES when manifest knob absent", () => {
    const root = createTempDir();
    try {
      writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
      const adapter = new JsonAdapter(root);
      assert.equal(adapter.casMaxRetries, MAX_CAS_RETRIES);
    } finally {
      cleanupTempDir(root);
    }
  });

  test("manifest tasks.cas_max_retries overrides MAX_CAS_RETRIES default", () => {
    const root = createTempDir();
    try {
      writeFixture(
        root,
        ".context-index/manifest.yaml",
        "tasks:\n  backend: json\n  cas_max_retries: 5\n",
      );
      const adapter = new JsonAdapter(root);
      assert.equal(adapter.casMaxRetries, 5);
    } finally {
      cleanupTempDir(root);
    }
  });

  test("create() retries on stale snapshot and lands on retry", async () => {
    const root = createTempDir();
    try {
      writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
      await new JsonAdapter(root).init();

      const adapter = new JsonAdapter(root);

      // Inject a single-shot stale-write: monkey-patch _readWithSeq to bump
      // disk seq AFTER returning the captured snapshot on the FIRST call,
      // then return real disk state thereafter.
      let firstCall = true;
      const origRead = adapter._readWithSeq.bind(adapter);
      adapter._readWithSeq = function () {
        const result = origRead();
        if (firstCall) {
          firstCall = false;
          // Forge a concurrent write that bumps disk past our captured seq
          writeFileSync(
            join(root, ".context-index/tasks/tasks.json"),
            JSON.stringify({
              version: 2,
              seq: result.seq + 1,
              epics: [],
              issues: [],
            }) + "\n",
          );
        }
        return result;
      };

      const issue = await adapter.create({ title: "Test", type: "task" });
      // Subject is the CAS retry, not the id scheme (issue-613 made flat ids random).
      assert.match(issue.id, /^issue-[a-z0-9]{6}$/);

      const after = JSON.parse(readFileSync(join(root, ".context-index/tasks/tasks.json"), "utf8"));
      assert.equal(after.issues.length, 1);
      assert.equal(after.issues[0].title, "Test");
      // initial seq 0 → injected bump to 1 → retry stamps 2
      assert.equal(after.seq, 2);
    } finally {
      cleanupTempDir(root);
    }
  });

  test("update() retries on stale snapshot and lands on retry", async () => {
    const root = createTempDir();
    try {
      writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
      const adapter = new JsonAdapter(root);
      await adapter.init();
      const created = await adapter.create({ title: "Original", type: "task" });

      // Wrap _readWithSeq to inject one stale-write cycle
      let injected = false;
      const orig = adapter._readWithSeq.bind(adapter);
      adapter._readWithSeq = function () {
        const result = orig();
        if (!injected) {
          injected = true;
          const board = JSON.parse(
            readFileSync(join(root, ".context-index/tasks/tasks.json"), "utf8"),
          );
          writeFileSync(
            join(root, ".context-index/tasks/tasks.json"),
            JSON.stringify({ ...board, seq: board.seq + 1 }) + "\n",
          );
        }
        return result;
      };

      const updated = await adapter.update(created.id, { status: "in_progress" });
      assert.equal(updated.status, "in_progress");
    } finally {
      cleanupTempDir(root);
    }
  });
}
