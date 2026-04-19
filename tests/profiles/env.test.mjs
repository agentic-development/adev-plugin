import { test, describe, afterEach } from "node:test";
import { strict as assert } from "node:assert";

import { resolveEnv, parseDotenv } from "../../lib/profiles/env.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

const tempDirs = [];
function tmp() {
  const d = createTempDir();
  tempDirs.push(d);
  return d;
}
afterEach(() => {
  while (tempDirs.length) cleanupTempDir(tempDirs.pop());
});

function hasCode(issues, code) {
  return issues.some((i) => i.code === code);
}

const minimal = (env) => ({
  permissions: { tools: { allow: [{ category: "filesystem-read" }] } },
  env,
});

describe("profiles/env parseDotenv", () => {
  test("parses KEY=value, quotes, comments", () => {
    const parsed = parseDotenv([
      "# comment",
      "",
      "KEY_A=value-a",
      'KEY_B="quoted value"',
      "KEY_C='single'",
      "KEY_D=bare # trailing",
    ].join("\n"));
    assert.equal(parsed.KEY_A, "value-a");
    assert.equal(parsed.KEY_B, "quoted value");
    assert.equal(parsed.KEY_C, "single");
    assert.equal(parsed.KEY_D, "bare");
  });

  test("throws on missing '='", () => {
    assert.throws(() => parseDotenv("BAD_LINE"));
  });
});

describe("profiles/env resolveEnv", () => {
  test("bare path missing fails load; optional: prefix silent-skips", () => {
    const root = tmp();
    const profile = minimal({
      files: [".env.missing"],
      allow: { required: [], optional: ["KEY_A"] },
    });
    const r1 = resolveEnv(profile, { profileName: "test", consumerRepoRoot: root });
    assert.ok(hasCode(r1.errors, "ENV_FILE_MISSING"));

    const r2 = resolveEnv(minimal({
      files: ["optional:.env.missing"],
      allow: { required: [], optional: ["KEY_A"] },
    }), { profileName: "test", consumerRepoRoot: root });
    assert.equal(r2.errors.length, 0);
  });

  test("allowlist filters .env keys; required missing fails", () => {
    const root = tmp();
    writeFixture(root, ".env", "KEY_A=value-aaaa\nKEY_B=value-bbbb\nSECRET=leaked-value\n");
    const profile = minimal({
      files: [".env"],
      allow: { required: ["KEY_A"], optional: ["KEY_B"] },
    });
    const r = resolveEnv(profile, { profileName: "test", consumerRepoRoot: root });
    assert.equal(r.errors.length, 0);
    assert.deepEqual(Object.keys(r.env).sort(), ["KEY_A", "KEY_B"]);
    assert.equal(r.env.SECRET, undefined);
    assert.equal(r.contributing.KEY_A, `${root}/.env`);

    const r2 = resolveEnv(minimal({
      files: ["optional:.env.nope"],
      allow: { required: ["KEY_A"], optional: [] },
    }), { profileName: "test", consumerRepoRoot: root });
    assert.ok(hasCode(r2.errors, "ENV_REQUIRED_MISSING"));
  });

  test("first-wins across multiple files", () => {
    const root = tmp();
    writeFixture(root, ".env.a", "KEY_A=from-a-yes\n");
    writeFixture(root, ".env.b", "KEY_A=from-b\n");
    const r = resolveEnv(minimal({
      files: [".env.a", ".env.b"],
      allow: { required: ["KEY_A"], optional: [] },
    }), { profileName: "test", consumerRepoRoot: root });
    assert.equal(r.env.KEY_A, "from-a-yes");
  });

  test("$workspace/ requires workspaceRoot", () => {
    const root = tmp();
    const profile = minimal({
      files: ["$workspace/.env.shared"],
      allow: { required: [], optional: ["KEY_A"] },
    });
    const r = resolveEnv(profile, { profileName: "test", consumerRepoRoot: root });
    assert.ok(hasCode(r.errors, "ENV_FILE_PATH"));
    assert.match(r.errors[0].message, /no adev-workspace\.yaml/);
  });

  test("$workspace/ resolves against workspaceRoot", () => {
    const ws = tmp();
    const root = tmp();
    writeFixture(ws, ".env.shared", "SHARED_KEY=hello-world\n");
    const profile = minimal({
      files: ["$workspace/.env.shared"],
      allow: { required: ["SHARED_KEY"], optional: [] },
    });
    const r = resolveEnv(profile, { profileName: "test", consumerRepoRoot: root, workspaceRoot: ws });
    assert.equal(r.errors.length, 0);
    assert.equal(r.env.SHARED_KEY, "hello-world");
  });

  test("rejects any @-prefixed entry with grammar-disjoint message", () => {
    const profile = minimal({
      files: ["@workspace/.env"],
      allow: { required: [], optional: ["KEY_A"] },
    });
    const r = resolveEnv(profile, { profileName: "test", consumerRepoRoot: tmp(), workspaceRoot: tmp() });
    assert.ok(hasCode(r.errors, "ENV_FILE_PATH"));
    assert.match(r.errors[0].message, /do not use the '@' prefix/);
  });

  test("rejects absolute paths", () => {
    const profile = minimal({
      files: ["/etc/passwd"],
      allow: { required: [], optional: ["KEY_A"] },
    });
    const r = resolveEnv(profile, { profileName: "test", consumerRepoRoot: tmp() });
    assert.ok(hasCode(r.errors, "ENV_FILE_PATH"));
    assert.match(r.errors[0].message, /must be relative/);
  });

  test("8-char minimum WARN for under-length values", () => {
    const root = tmp();
    writeFixture(root, ".env", "SHORT=abc\n");
    const r = resolveEnv(minimal({
      files: [".env"],
      allow: { required: ["SHORT"], optional: [] },
    }), { profileName: "test", consumerRepoRoot: root });
    assert.equal(r.errors.length, 0);
    assert.ok(hasCode(r.warnings, "ENV_REDACTION_MIN_LENGTH"));
  });
});
