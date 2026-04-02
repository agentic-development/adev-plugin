/**
 * Tests for lib/fs-utils.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { ensureDir, readJson, writeJson } from "../../lib/fs-utils.mjs";

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), "fs-utils-test-"));
}

describe("ensureDir", () => {
  let tmp;
  before(() => { tmp = makeTempDir(); });
  after(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("creates a nested directory that does not exist", () => {
    const dir = join(tmp, "a", "b", "c");
    assert.ok(!existsSync(dir));
    ensureDir(dir);
    assert.ok(existsSync(dir));
  });

  it("is idempotent on an existing directory", () => {
    const dir = join(tmp, "a", "b", "c");
    ensureDir(dir);
    assert.ok(existsSync(dir));
  });
});

describe("readJson", () => {
  let tmp;
  before(() => { tmp = makeTempDir(); });
  after(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("reads and parses a valid JSON file", () => {
    const file = join(tmp, "valid.json");
    writeJson(file, { hello: "world" });
    const result = readJson(file);
    assert.deepStrictEqual(result, { hello: "world" });
  });

  it("returns null for a missing file", () => {
    const result = readJson(join(tmp, "nonexistent.json"));
    assert.strictEqual(result, null);
  });

  it("returns null for malformed JSON", () => {
    const file = join(tmp, "bad.json");
    writeFileSync(file, "not json {{{");
    const result = readJson(file);
    assert.strictEqual(result, null);
  });
});

describe("writeJson", () => {
  let tmp;
  before(() => { tmp = makeTempDir(); });
  after(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("writes pretty-printed JSON with trailing newline", () => {
    const file = join(tmp, "out.json");
    writeJson(file, { key: "value" });
    const raw = readFileSync(file, "utf8");
    assert.ok(raw.endsWith("\n"));
    assert.deepStrictEqual(JSON.parse(raw), { key: "value" });
    assert.ok(raw.includes("  "), "should be pretty-printed with 2-space indent");
  });
});
