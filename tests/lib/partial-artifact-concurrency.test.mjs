/**
 * Concurrency tests for lib/partial-artifact.mjs lock-acquire.
 *
 * Covers Task 4 (tryAcquireLock + validateLockPayload + steal-on-stale)
 * from incremental-artifact-writes.plan.md. Closes SA-10 (stolen→discarded
 * contract), SA-11 (precedence rule), SEC-7 (lock-payload schema validation).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";

import {
  partialPath,
  lockPath,
  tryAcquireLock,
  validateLockPayload,
} from "../../lib/partial-artifact.mjs";

// ---------------------------------------------------------------------------
// validateLockPayload
// ---------------------------------------------------------------------------

test("validateLockPayload accepts a well-formed payload", () => {
  const ts = new Date(Date.now() - 1000).toISOString();
  const result = validateLockPayload({ pid: 12345, started_at: ts });
  assert.equal(result.pid, 12345);
  assert.equal(result.started_at, ts);
});

test("validateLockPayload accepts a JSON-string payload", () => {
  const ts = new Date(Date.now() - 1000).toISOString();
  const result = validateLockPayload(JSON.stringify({ pid: 42, started_at: ts }));
  assert.equal(result.pid, 42);
  assert.equal(result.started_at, ts);
});

test("validateLockPayload rejects malformed pids", () => {
  const ts = new Date().toISOString();
  assert.throws(() => validateLockPayload({ pid: 0, started_at: ts }));
  assert.throws(() => validateLockPayload({ pid: -1, started_at: ts }));
  assert.throws(() => validateLockPayload({ pid: "42", started_at: ts }));
  assert.throws(() => validateLockPayload({ pid: 1.5, started_at: ts }));
  // Above 2^22 (~4.2M) — broader than any sane real PID
  assert.throws(() => validateLockPayload({ pid: 2 ** 23, started_at: ts }));
});

test("validateLockPayload rejects malformed timestamps", () => {
  assert.throws(() => validateLockPayload({ pid: 42 }));
  assert.throws(() => validateLockPayload({ pid: 42, started_at: "" }));
  assert.throws(() =>
    validateLockPayload({ pid: 42, started_at: "not-an-iso-date" })
  );
  // Future timestamp rejected (writer cannot have started after now)
  const future = new Date(Date.now() + 60_000).toISOString();
  assert.throws(() => validateLockPayload({ pid: 42, started_at: future }));
});

test("validateLockPayload rejects non-object input", () => {
  assert.throws(() => validateLockPayload(null));
  assert.throws(() => validateLockPayload(""));
  assert.throws(() => validateLockPayload("not json"));
  assert.throws(() => validateLockPayload(42));
});

// ---------------------------------------------------------------------------
// tryAcquireLock — happy path
// ---------------------------------------------------------------------------

test("tryAcquireLock succeeds on clean state", () => {
  const dir = createTempDir();
  try {
    const finalP = join(dir, "artifact.spec.md");
    const result = tryAcquireLock(finalP);
    assert.equal(result.acquired, true);
    assert.ok(existsSync(lockPath(finalP)), "lock file created");
    const lock = JSON.parse(readFileSync(lockPath(finalP), "utf8"));
    assert.equal(lock.pid, process.pid);
    assert.ok(typeof lock.started_at === "string");
    // started_at must be a valid ISO date
    assert.ok(!Number.isNaN(Date.parse(lock.started_at)));
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// tryAcquireLock — contention with live owner
// ---------------------------------------------------------------------------

test("tryAcquireLock returns PARTIAL_ARTIFACT_LOCKED when owner is alive", () => {
  const dir = createTempDir();
  try {
    const finalP = join(dir, "artifact.spec.md");
    // Pre-create a lock owned by ourselves (process.pid is definitely alive).
    writeFileSync(
      lockPath(finalP),
      JSON.stringify({
        pid: process.pid,
        started_at: new Date().toISOString(),
      })
    );

    const result = tryAcquireLock(finalP, { retries: 0 });
    assert.equal(result.acquired, false);
    assert.equal(result.code, "PARTIAL_ARTIFACT_LOCKED");
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// tryAcquireLock — stale dead-owner steal (stolen → discarded contract)
// ---------------------------------------------------------------------------

test("tryAcquireLock steals when owner is dead AND lock is older than threshold", () => {
  const dir = createTempDir();
  try {
    const finalP = join(dir, "artifact.spec.md");
    const partial = partialPath(finalP);

    // Place an existing partial and a stale lock pointing to an
    // almost-certainly-dead PID. Use pid 999999 — unlikely on any
    // dev machine to be alive.
    writeFileSync(partial, "old partial content\n");
    writeFileSync(
      lockPath(finalP),
      JSON.stringify({
        pid: 999999,
        started_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      })
    );

    const events = [];
    const result = tryAcquireLock(finalP, {
      retries: 0,
      stale_seconds: 30,
      onRecovery: (evt) => events.push(evt),
    });
    assert.equal(result.acquired, true, "stole the stale lock");
    // Per spec stolen→discarded contract: BOTH partial AND lock are removed,
    // then a fresh lock is acquired.
    assert.equal(existsSync(partial), false, "partial unlinked on steal");
    assert.ok(existsSync(lockPath(finalP)), "new lock created");
    const lock = JSON.parse(readFileSync(lockPath(finalP), "utf8"));
    assert.equal(lock.pid, process.pid, "new lock owned by current process");

    // Recovery telemetry: caller can record the steal as a
    // partial_recovery event with action=stolen.
    assert.equal(events.length, 1);
    assert.equal(events[0].action, "stolen");
    assert.equal(events[0].artifact_path, finalP);
  } finally {
    cleanupTempDir(dir);
  }
});

test("tryAcquireLock returns LOCKED for dead-owner within stale window", () => {
  const dir = createTempDir();
  try {
    const finalP = join(dir, "artifact.spec.md");
    writeFileSync(
      lockPath(finalP),
      JSON.stringify({
        pid: 999999,
        // 5 seconds ago — well within a 30s stale window
        started_at: new Date(Date.now() - 5_000).toISOString(),
      })
    );

    const result = tryAcquireLock(finalP, {
      retries: 0,
      stale_seconds: 30,
    });
    // Per Behavior 6: dead pid + young → retry-with-backoff; with
    // retries=0 budget, returns LOCKED immediately.
    assert.equal(result.acquired, false);
    assert.equal(result.code, "PARTIAL_ARTIFACT_LOCKED");
  } finally {
    cleanupTempDir(dir);
  }
});

test("tryAcquireLock steals when lock payload is malformed (orphan-steal path)", () => {
  // Per Task 4 spec: failed validation → orphan-steal path; DO NOT invoke
  // process.kill on a garbage pid. Treat the lock as stolen.
  const dir = createTempDir();
  try {
    const finalP = join(dir, "artifact.spec.md");
    writeFileSync(partialPath(finalP), "old\n");
    writeFileSync(lockPath(finalP), "this is not json");

    const events = [];
    const result = tryAcquireLock(finalP, {
      retries: 0,
      stale_seconds: 30,
      onRecovery: (evt) => events.push(evt),
    });
    assert.equal(result.acquired, true);
    assert.equal(existsSync(partialPath(finalP)), false);
    assert.equal(events.length, 1);
    assert.equal(events[0].action, "stolen");
  } finally {
    cleanupTempDir(dir);
  }
});

test("tryAcquireLock with clock injection respects stale threshold precisely", () => {
  const dir = createTempDir();
  try {
    const finalP = join(dir, "artifact.spec.md");
    const startedTs = "2026-01-01T00:00:00.000Z";
    writeFileSync(
      lockPath(finalP),
      JSON.stringify({ pid: 999999, started_at: startedTs })
    );

    // Clock injected at exactly stale_seconds=30 boundary — must be > to
    // be considered stale per Behavior 6 wording "now - started_at > threshold"
    const nowAtBoundary = "2026-01-01T00:00:30.000Z";
    const justOver = "2026-01-01T00:00:30.001Z";

    // At-boundary: NOT stale (spec uses strict ">").
    const r1 = tryAcquireLock(finalP, {
      retries: 0,
      stale_seconds: 30,
      now: () => new Date(nowAtBoundary),
    });
    assert.equal(r1.acquired, false, "at-boundary is not stale");

    // Just-over: stale; steal.
    const r2 = tryAcquireLock(finalP, {
      retries: 0,
      stale_seconds: 30,
      now: () => new Date(justOver),
    });
    assert.equal(r2.acquired, true, "just-over boundary steals");
  } finally {
    cleanupTempDir(dir);
  }
});

test("tryAcquireLock respects retry budget for dead-owner-within-window", () => {
  const dir = createTempDir();
  try {
    const finalP = join(dir, "artifact.spec.md");
    writeFileSync(
      lockPath(finalP),
      JSON.stringify({
        pid: 999999,
        started_at: new Date(Date.now() - 5_000).toISOString(),
      })
    );

    let backoffCallCount = 0;
    const result = tryAcquireLock(finalP, {
      retries: 3,
      stale_seconds: 30,
      backoff_ms: 1, // keep the test fast
      sleep: () => {
        backoffCallCount += 1;
      },
    });
    assert.equal(result.acquired, false);
    assert.equal(result.code, "PARTIAL_ARTIFACT_LOCKED");
    // backoff sleeps between retries: with retries=3, expect 3 sleeps
    // before final LOCKED return.
    assert.equal(backoffCallCount, 3);
  } finally {
    cleanupTempDir(dir);
  }
});
