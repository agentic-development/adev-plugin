import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertPathInWorkspace, validateModuleName } from "../../lib/workspace.mjs";

describe("assertPathInWorkspace", () => {
  const root = "/workspace/root";

  it("returns normalized absolute path for a path inside the workspace root", () => {
    const result = assertPathInWorkspace(root, "subdir/file.txt");
    assert.equal(result, "/workspace/root/subdir/file.txt");
  });

  it("accepts the workspace root itself", () => {
    const result = assertPathInWorkspace(root, ".");
    assert.equal(result, root);
  });

  it("accepts an absolute path inside the workspace root", () => {
    const result = assertPathInWorkspace(root, "/workspace/root/foo/bar");
    assert.equal(result, "/workspace/root/foo/bar");
  });

  it("throws with code PATH_ESCAPE for a path that escapes the root via ..", () => {
    const err = assert.throws(
      () => assertPathInWorkspace(root, "../escape"),
      (e) => {
        assert.equal(e.code, "PATH_ESCAPE");
        assert.match(e.message, /PATH_ESCAPE|Rejected path escaping workspace root/);
        assert.ok(e.message.includes("../escape"), `message should contain input, got: ${e.message}`);
        return true;
      }
    );
  });

  it("throws with code PATH_ESCAPE for an absolute path outside root", () => {
    assert.throws(
      () => assertPathInWorkspace(root, "/etc/passwd"),
      (e) => {
        assert.equal(e.code, "PATH_ESCAPE");
        return true;
      }
    );
  });

  it("error message contains both input and resolved path", () => {
    let caught;
    try {
      assertPathInWorkspace(root, "../../sneaky");
    } catch (e) {
      caught = e;
    }
    assert.ok(caught, "expected an error to be thrown");
    assert.ok(
      caught.message.includes("../../sneaky"),
      `message should contain original input, got: ${caught.message}`
    );
    // resolved path should also appear in the message
    assert.ok(
      caught.message.includes("→") || caught.message.includes("->"),
      `message should contain an arrow separator, got: ${caught.message}`
    );
  });
});

describe("validateModuleName", () => {
  it("returns true for a simple alphanumeric name", () => {
    assert.equal(validateModuleName("mymodule"), true);
  });

  it("returns true for a name with uppercase letters", () => {
    assert.equal(validateModuleName("MyModule"), true);
  });

  it("returns true for a name with digits", () => {
    assert.equal(validateModuleName("module123"), true);
  });

  it("returns true for a name with hyphens", () => {
    assert.equal(validateModuleName("my-module"), true);
  });

  it("returns true for a name with underscores", () => {
    assert.equal(validateModuleName("my_module"), true);
  });

  it("returns false for an empty string", () => {
    assert.equal(validateModuleName(""), false);
  });

  it("returns false for a name with a forward slash", () => {
    assert.equal(validateModuleName("foo/bar"), false);
  });

  it("returns false for a name with a dot", () => {
    assert.equal(validateModuleName("foo.bar"), false);
  });

  it("returns false for a name with a space", () => {
    assert.equal(validateModuleName("foo bar"), false);
  });

  it("returns false for a name with a shell special character (semicolon)", () => {
    assert.equal(validateModuleName("foo;bar"), false);
  });

  it("returns false for a name with a shell special character (ampersand)", () => {
    assert.equal(validateModuleName("foo&bar"), false);
  });

  it("returns false for a name with backtick", () => {
    assert.equal(validateModuleName("foo`bar"), false);
  });

  it("returns false for a name starting with ../", () => {
    assert.equal(validateModuleName("../escape"), false);
  });
});
