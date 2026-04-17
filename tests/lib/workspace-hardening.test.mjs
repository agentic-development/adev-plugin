import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  assertPathInWorkspace,
  validateModuleName,
  sanitizeIdentityOneLiner,
  readCappedText,
  resolveWorkspaceProductPath,
  MAX_CHARTER_FILES,
  MAX_CHARTER_FILE_BYTES,
} from "../../lib/workspace.mjs";

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

describe("MAX_CHARTER_FILES", () => {
  it("equals 200", () => {
    assert.equal(MAX_CHARTER_FILES, 200);
  });
});

describe("MAX_CHARTER_FILE_BYTES", () => {
  it("equals 512 * 1024", () => {
    assert.equal(MAX_CHARTER_FILE_BYTES, 512 * 1024);
  });
});

describe("sanitizeIdentityOneLiner", () => {
  it("returns empty string for non-string input", () => {
    assert.equal(sanitizeIdentityOneLiner(42), "");
    assert.equal(sanitizeIdentityOneLiner(null), "");
    assert.equal(sanitizeIdentityOneLiner(undefined), "");
    assert.equal(sanitizeIdentityOneLiner([]), "");
  });

  it("returns empty string for an empty string", () => {
    assert.equal(sanitizeIdentityOneLiner(""), "");
  });

  it("strips ANSI CSI sequences", () => {
    const input = "\x1b[31mhello\x1b[0m";
    assert.equal(sanitizeIdentityOneLiner(input), "hello");
  });

  it("strips control characters", () => {
    const input = "hello\x00\x01\x1F\x7Fworld";
    assert.equal(sanitizeIdentityOneLiner(input), "helloworld");
  });

  it("strips both ANSI CSI and control chars", () => {
    const input = "\x1b[1;32mfoo\x00bar\x1b[?25l";
    assert.equal(sanitizeIdentityOneLiner(input), "foobar");
  });

  it("truncates to 200 chars with ellipsis when over maxChars", () => {
    const longStr = "a".repeat(250);
    const result = sanitizeIdentityOneLiner(longStr);
    assert.equal(result.length, 201); // 200 chars + ellipsis (1 code point)
    assert.ok(result.endsWith("…"), "should end with ellipsis");
    assert.equal(result.slice(0, 200), "a".repeat(200));
  });

  it("does not truncate when exactly at maxChars", () => {
    const str = "b".repeat(200);
    assert.equal(sanitizeIdentityOneLiner(str), str);
  });

  it("respects custom maxChars", () => {
    const result = sanitizeIdentityOneLiner("hello world", 5);
    assert.equal(result, "hello…");
  });

  it("handles Unicode characters correctly (splits by code point)", () => {
    // emoji are multi-byte but single code points
    const emoji = "😀".repeat(10);
    const result = sanitizeIdentityOneLiner(emoji, 5);
    assert.equal(result, "😀".repeat(5) + "…");
  });

  it("returns clean string unchanged when within limit", () => {
    assert.equal(sanitizeIdentityOneLiner("Hello, world!"), "Hello, world!");
  });
});

describe("readCappedText", () => {
  let tmpDir;

  it("setup: creates temp dir", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "adev-test-"));
    assert.ok(tmpDir);
  });

  it("returns warning with null content for a non-existent file", () => {
    const result = readCappedText("/this/path/does/not/exist.txt");
    assert.equal(result.content, null);
    assert.equal(result.truncated, false);
    assert.ok(typeof result.warning === "string" && result.warning.length > 0);
  });

  it("returns content for a small file", () => {
    const filePath = join(tmpDir, "small.txt");
    writeFileSync(filePath, "Hello, workspace!");
    const result = readCappedText(filePath);
    assert.equal(result.content, "Hello, workspace!");
    assert.equal(result.truncated, false);
    assert.equal(result.warning, undefined);
  });

  it("returns truncated=true and null content when file exceeds maxBytes", () => {
    const filePath = join(tmpDir, "big.txt");
    // Write a file that is exactly maxBytes + 1
    const maxBytes = 10;
    writeFileSync(filePath, "x".repeat(maxBytes + 1));
    const result = readCappedText(filePath, maxBytes);
    assert.equal(result.content, null);
    assert.equal(result.truncated, true);
    assert.ok(result.warning.includes("exceeds"));
    assert.ok(result.warning.includes(filePath));
    assert.ok(result.warning.includes(String(maxBytes)));
  });

  it("returns content when file size equals maxBytes exactly", () => {
    const filePath = join(tmpDir, "exact.txt");
    const maxBytes = 10;
    writeFileSync(filePath, "y".repeat(maxBytes));
    const result = readCappedText(filePath, maxBytes);
    assert.equal(result.content, "y".repeat(maxBytes));
    assert.equal(result.truncated, false);
  });

  it("uses MAX_CHARTER_FILE_BYTES as default maxBytes", () => {
    const filePath = join(tmpDir, "default-cap.txt");
    writeFileSync(filePath, "tiny content");
    const result = readCappedText(filePath);
    assert.equal(result.content, "tiny content");
    assert.equal(result.truncated, false);
  });

  it("cleanup: removes temp dir", () => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe("resolveWorkspaceProductPath", () => {
  it("returns <workspaceRoot>/.context-index/specs/product.md", () => {
    const result = resolveWorkspaceProductPath("/my/workspace");
    assert.equal(result, "/my/workspace/.context-index/specs/product.md");
  });

  it("handles trailing slash in workspaceRoot", () => {
    const result = resolveWorkspaceProductPath("/my/workspace/");
    // join normalizes trailing slashes
    assert.equal(result, "/my/workspace/.context-index/specs/product.md");
  });

  it("works with a relative-looking root passed as string", () => {
    const result = resolveWorkspaceProductPath("projects/myapp");
    assert.equal(result, "projects/myapp/.context-index/specs/product.md");
  });
});

describe("integration: workspace-hardening", () => {
  it("rejects path-escape repo path", () => {
    const tmp = createTempDir();
    try {
      assert.throws(
        () => assertPathInWorkspace(tmp, "../../../etc"),
        (e) => {
          assert.equal(e.code, "PATH_ESCAPE");
          return true;
        }
      );
      // safe path passes
      assert.doesNotThrow(() => assertPathInWorkspace(tmp, "repos/ok"));
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("sanitises ANSI + control chars from constitution identity", () => {
    const tmp = createTempDir();
    try {
      writeFixture(
        tmp,
        "constitution.md",
        "# Identity\n\x1b[31mEvilRepo\x1b[0m does \x07malicious\x00 things.\n"
      );
      const raw = readFileSync(`${tmp}/constitution.md`, "utf8");
      const identityLine = raw.split("\n").find(l => l.includes("EvilRepo")) || "";
      const sanitised = sanitizeIdentityOneLiner(identityLine);
      assert.equal(sanitised.includes("\x1b"), false);
      assert.equal(sanitised.includes("\x00"), false);
      assert.equal(sanitised.includes("\x07"), false);
      assert.match(sanitised, /EvilRepo does malicious things/);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("readCappedText skips oversized file", () => {
    const tmp = createTempDir();
    try {
      writeFixture(tmp, "big.md", "x".repeat(MAX_CHARTER_FILE_BYTES + 1));
      const result = readCappedText(`${tmp}/big.md`);
      assert.equal(result.content, null);
      assert.equal(result.truncated, true);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("resolveWorkspaceProductPath resolves under workspace root", () => {
    const tmp = createTempDir();
    try {
      const p = resolveWorkspaceProductPath(tmp);
      assert.equal(p.startsWith(tmp), true);
      assert.ok(
        p.endsWith(".context-index/specs/product.md") ||
        p.endsWith(".context-index\\specs\\product.md")
      );
    } finally {
      cleanupTempDir(tmp);
    }
  });
});
