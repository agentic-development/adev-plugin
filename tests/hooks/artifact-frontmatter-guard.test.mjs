import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createTempDir, cleanupTempDir, writeFixture, runHook } from "../helpers.mjs";

const HOOK = "artifact-frontmatter-guard.sh";

describe("artifact-frontmatter-guard hook", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("allows tool calls with no file_path", () => {
    const { exitCode } = runHook(HOOK, { env: {} });
    assert.equal(exitCode, 0);
  });

  it("is unaffected by a non-matching file suffix", () => {
    const { exitCode } = runHook(HOOK, {
      env: {
        CLAUDE_TOOL_INPUT_file_path: `${tempDir}/.context-index/specs/x/foo.spec.md`,
        CLAUDE_TOOL_INPUT_content: "# Heading before frontmatter\n\n---\nkey: value\n---\n",
      },
    });
    assert.equal(exitCode, 0);
  });

  it("does not fire on a `.tmp` path (the tmp+commit staging file)", () => {
    const { exitCode } = runHook(HOOK, {
      env: {
        CLAUDE_TOOL_INPUT_file_path: `${tempDir}/.context-index/specs/x/foo.review.md.tmp`,
        CLAUDE_TOOL_INPUT_content: "# Heading before frontmatter\n\n---\nkey: value\n---\n",
      },
    });
    assert.equal(exitCode, 0);
  });

  it("blocks a Write to `.review.md` with a heading before the frontmatter", () => {
    const { exitCode, stderr } = runHook(HOOK, {
      env: {
        CLAUDE_TOOL_INPUT_file_path: `${tempDir}/.context-index/specs/x/foo.review.md`,
        CLAUDE_TOOL_INPUT_content:
          "# Architecture Review: foo\n\n---\nstatus: review-passed\n---\n\nBody.\n",
      },
    });
    assert.equal(exitCode, 2);
    assert.match(stderr, /BLOCKED/);
    assert.match(stderr, /frontmatter/);
  });

  it("blocks a Write to `.validate.md` with a heading before the frontmatter", () => {
    const { exitCode, stderr } = runHook(HOOK, {
      env: {
        CLAUDE_TOOL_INPUT_file_path: `${tempDir}/.context-index/specs/x/foo.validate.md`,
        CLAUDE_TOOL_INPUT_content: "# Validation Report\n\n---\nstatus: pass\n---\n\nBody.\n",
      },
    });
    assert.equal(exitCode, 2);
    assert.match(stderr, /BLOCKED/);
  });

  it("allows a Write to `.review.md` with frontmatter first", () => {
    const { exitCode } = runHook(HOOK, {
      env: {
        CLAUDE_TOOL_INPUT_file_path: `${tempDir}/.context-index/specs/x/foo.review.md`,
        CLAUDE_TOOL_INPUT_content:
          "---\nstatus: review-passed\nfile-sha: <PENDING>\n---\n\n# Architecture Review: foo\n\nBody.\n",
      },
    });
    assert.equal(exitCode, 0);
  });

  it("allows a Write to `.validate.md` with frontmatter first", () => {
    const { exitCode } = runHook(HOOK, {
      env: {
        CLAUDE_TOOL_INPUT_file_path: `${tempDir}/.context-index/specs/x/foo.validate.md`,
        CLAUDE_TOOL_INPUT_content: "---\nstatus: pass\n---\n\n# Validation Report\n\nBody.\n",
      },
    });
    assert.equal(exitCode, 0);
  });

  it("allows leading blank lines before the `---` delimiter (matches artifact.mjs/frontmatter-present tolerance)", () => {
    const { exitCode } = runHook(HOOK, {
      env: {
        CLAUDE_TOOL_INPUT_file_path: `${tempDir}/.context-index/specs/x/foo.review.md`,
        CLAUDE_TOOL_INPUT_content: "\n\n---\nstatus: review-passed\n---\n\n# Heading\n",
      },
    });
    assert.equal(exitCode, 0);
  });

  it("allows an Edit that stamps file-sha deep inside an already-conformant file without disturbing frontmatter position (Step 6c case)", () => {
    const target = `${tempDir}/.context-index/specs/x/foo.review.md`;
    writeFixture(
      tempDir,
      ".context-index/specs/x/foo.review.md",
      "---\nstatus: review-passed\nfile-sha: <PENDING>\n---\n\n# Architecture Review: foo\n\nBody.\n",
    );
    const { exitCode } = runHook(HOOK, {
      env: {
        CLAUDE_TOOL_INPUT_file_path: target,
        CLAUDE_TOOL_INPUT_old_string: "file-sha: <PENDING>",
        CLAUDE_TOOL_INPUT_new_string: "file-sha: abc123deadbeef",
      },
    });
    assert.equal(exitCode, 0);
  });

  it("blocks an Edit that would strip the frontmatter block, leaving a heading-first shape", () => {
    const target = `${tempDir}/.context-index/specs/x/foo.review.md`;
    writeFixture(
      tempDir,
      ".context-index/specs/x/foo.review.md",
      "---\nstatus: review-passed\n---\n# Architecture Review: foo\n\nBody.\n",
    );
    const { exitCode, stderr } = runHook(HOOK, {
      env: {
        CLAUDE_TOOL_INPUT_file_path: target,
        CLAUDE_TOOL_INPUT_old_string: "---\nstatus: review-passed\n---\n",
        CLAUDE_TOOL_INPUT_new_string: "",
      },
    });
    assert.equal(exitCode, 2);
    assert.match(stderr, /BLOCKED/);
  });

  it("blocks an Edit that inserts a heading above the existing frontmatter", () => {
    const target = `${tempDir}/.context-index/specs/x/foo.validate.md`;
    writeFixture(
      tempDir,
      ".context-index/specs/x/foo.validate.md",
      "---\nstatus: pass\n---\n\n# Validation Report\n",
    );
    const { exitCode } = runHook(HOOK, {
      env: {
        CLAUDE_TOOL_INPUT_file_path: target,
        CLAUDE_TOOL_INPUT_old_string: "---\nstatus: pass\n---\n",
        CLAUDE_TOOL_INPUT_new_string: "# Injected Heading\n---\nstatus: pass\n---\n",
      },
    });
    assert.equal(exitCode, 2);
  });

  it("allows an Edit whose old_string does not match the current on-disk content (cannot determine result; Edit tool itself will reject it)", () => {
    const target = `${tempDir}/.context-index/specs/x/foo.review.md`;
    writeFixture(
      tempDir,
      ".context-index/specs/x/foo.review.md",
      "---\nstatus: review-passed\n---\n\n# Architecture Review: foo\n",
    );
    const { exitCode } = runHook(HOOK, {
      env: {
        CLAUDE_TOOL_INPUT_file_path: target,
        CLAUDE_TOOL_INPUT_old_string: "this text is not present anywhere in the file",
        CLAUDE_TOOL_INPUT_new_string: "replacement",
      },
    });
    assert.equal(exitCode, 0);
  });

  it("allows an Edit targeting a `.review.md` that does not yet exist on disk (cannot determine result)", () => {
    const target = `${tempDir}/.context-index/specs/x/nonexistent.review.md`;
    const { exitCode } = runHook(HOOK, {
      env: {
        CLAUDE_TOOL_INPUT_file_path: target,
        CLAUDE_TOOL_INPUT_old_string: "anything",
        CLAUDE_TOOL_INPUT_new_string: "anything else",
      },
    });
    assert.equal(exitCode, 0);
  });

  it("matches via stdin JSON when env vars are not set (settings.json mode)", () => {
    const target = `${tempDir}/.context-index/specs/x/foo.validate.md`;
    const payload = JSON.stringify({
      tool_input: {
        file_path: target,
        content: "# Heading first\n\n---\nstatus: pass\n---\n",
      },
    });
    const { exitCode } = runHook(HOOK, { stdin: payload });
    assert.equal(exitCode, 2);
  });
});
