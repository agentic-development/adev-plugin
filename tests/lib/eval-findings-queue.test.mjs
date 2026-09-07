// tests/lib/eval-findings-queue.test.mjs
//
// Spec: n/a — adev-plugin-tierb-findings-queue-bsb9 (no dedicated spec yet;
// this is the queue mechanism the issue's "suggested fix" option 1 asks for)

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, existsSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveQueuePath,
  listFindings,
  appendFinding,
  removeFinding,
} from "../../lib/eval-findings-queue.mjs";

function makeRoot() {
  return mkdtempSync(join(tmpdir(), "eval-findings-queue-"));
}

test("listFindings returns [] when the queue file does not exist", () => {
  const root = makeRoot();
  try {
    assert.deepEqual(listFindings(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("appendFinding requires a non-empty title", () => {
  const root = makeRoot();
  try {
    assert.throws(
      () => appendFinding(root, { title: "", description: "x" }),
      (err) => err.code === "EVAL_FINDING_INVALID",
    );
    assert.throws(
      () => appendFinding(root, { description: "x" }),
      (err) => err.code === "EVAL_FINDING_INVALID",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("appendFinding requires a non-empty description", () => {
  const root = makeRoot();
  try {
    assert.throws(
      () => appendFinding(root, { title: "x", description: "" }),
      (err) => err.code === "EVAL_FINDING_INVALID",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("appendFinding writes a record with a minted id and queued_at, then listFindings reads it back", () => {
  const root = makeRoot();
  try {
    const record = appendFinding(root, { title: "Real defect", description: "Found live during a Tier B pass" });
    assert.match(record.id, /^[0-9a-f]{8}$/);
    assert.match(record.queued_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(record.title, "Real defect");
    assert.equal(record.description, "Found live during a Tier B pass");

    const findings = listFindings(root);
    assert.equal(findings.length, 1);
    assert.deepEqual(findings[0], record);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("appendFinding carries optional severity, module and source fields when given", () => {
  const root = makeRoot();
  try {
    const record = appendFinding(root, {
      title: "Real defect",
      description: "details",
      severity: "high",
      module: "cli",
      source: "tier-b-2026-09-07-01.md",
    });
    assert.equal(record.severity, "high");
    assert.equal(record.module, "cli");
    assert.equal(record.source, "tier-b-2026-09-07-01.md");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("appendFinding omits optional fields entirely when not given (not written as null/undefined)", () => {
  const root = makeRoot();
  try {
    const record = appendFinding(root, { title: "x", description: "y" });
    assert.ok(!("severity" in record));
    assert.ok(!("module" in record));
    assert.ok(!("source" in record));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("multiple findings append in order and each round-trips independently", () => {
  const root = makeRoot();
  try {
    const a = appendFinding(root, { title: "First", description: "a" });
    const b = appendFinding(root, { title: "Second", description: "b" });
    const findings = listFindings(root);
    assert.deepEqual(findings.map((f) => f.id), [a.id, b.id]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("removeFinding drains a matching entry and returns true", () => {
  const root = makeRoot();
  try {
    const a = appendFinding(root, { title: "First", description: "a" });
    const b = appendFinding(root, { title: "Second", description: "b" });
    const removed = removeFinding(root, a.id);
    assert.equal(removed, true);
    const findings = listFindings(root);
    assert.deepEqual(findings.map((f) => f.id), [b.id]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("removeFinding returns false for an unknown id and leaves the queue untouched", () => {
  const root = makeRoot();
  try {
    const a = appendFinding(root, { title: "First", description: "a" });
    const removed = removeFinding(root, "does-not-exist");
    assert.equal(removed, false);
    assert.deepEqual(listFindings(root).map((f) => f.id), [a.id]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("removeFinding on a queue's last entry leaves listFindings returning []", () => {
  const root = makeRoot();
  try {
    const a = appendFinding(root, { title: "Only one", description: "a" });
    removeFinding(root, a.id);
    assert.deepEqual(listFindings(root), []);
    assert.ok(existsSync(resolveQueuePath(root)), "the file itself is left in place, just emptied");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a corrupted line is skipped with a warning, not thrown, and does not block reading the rest", () => {
  const root = makeRoot();
  try {
    const a = appendFinding(root, { title: "Good one", description: "a" });
    const queuePath = resolveQueuePath(root);
    appendFileSync(queuePath, "not valid json\n");
    const findings = listFindings(root);
    assert.deepEqual(findings.map((f) => f.id), [a.id]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
