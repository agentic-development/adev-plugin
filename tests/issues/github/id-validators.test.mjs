import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../../helpers.mjs";
import { validateIssueId } from "../../../lib/retro/issue-id-validation.mjs";
import { parseId } from "../../../lib/issues/id-utils.mjs";
import { writeExecutionState } from "../../../lib/execution-state.mjs";
import { runCapture } from "../../../lib/session-capture.mjs";

test("canonical gh IDs pass; display forms are rejected", () => {
  assert.equal(validateIssueId("gh-12").ok, true);
  assert.equal(validateIssueId("gh-org2.my_repo.v2.3").ok, true);
  assert.equal(validateIssueId("gh-" + "a".repeat(39) + "." + "b".repeat(100) + ".1234567").ok, true);
  for (const bad of ["#12", "acme/board#12", "gh-12 ", "GH-12"]) assert.equal(validateIssueId(bad).ok, false);
  assert.equal(validateIssueId("issue-7").ok, true);
});

// 3 ("gh-") + 39 + 1 + 109 + 1 + 7 = 160
const GH_160 = "gh-" + "a".repeat(39) + "." + "b".repeat(109) + ".1234567";
const GH_161 = "gh-" + "a".repeat(39) + "." + "b".repeat(110) + ".1234567";

test("retro validator: accepted gh ID is returned unchanged and parseId reports github", () => {
  assert.equal(GH_160.length, 160);
  for (const id of ["gh-12", "gh-org2.my_repo.v2.3", "gh-acme.board.js.7", GH_160]) {
    assert.deepEqual(validateIssueId(id), { ok: true, normalized: id, reason: null });
    assert.equal(parseId(id).github, true);
  }
});

test("retro validator: gh ID over 160 characters is rejected on charset", () => {
  assert.equal(GH_161.length, 161);
  assert.deepEqual(validateIssueId(GH_161), { ok: false, normalized: null, reason: "charset" });
});

test("retro validator: display forms with '#', '/', whitespace, uppercase or a URL are rejected on charset", () => {
  for (const bad of [
    "#12",
    "acme/board#12",
    "gh-acme/board.12",
    "gh-12 ",
    " gh-12",
    "GH-12",
    "gh-Acme.board.12",
    "gh-12#",
    "https://github.com/acme/board/issues/12",
  ]) {
    assert.deepEqual(validateIssueId(bad), { ok: false, normalized: null, reason: "charset" }, bad);
  }
});

test("retro validator: charset-clean gh- strings that are not canonical IDs are unrecognized", () => {
  for (const bad of ["gh-", "gh-abc", "gh-my_org.repo.1", "gh-acme.board.", "gh-acme..12"]) {
    assert.deepEqual(validateIssueId(bad), { ok: false, normalized: null, reason: "unrecognized" }, bad);
  }
});

test("retro validator: non-gh IDs keep the 64-character, no-underscore rule", () => {
  const legacy64 = "bd-" + "a".repeat(61);
  assert.equal(legacy64.length, 64);
  assert.deepEqual(validateIssueId(legacy64), { ok: true, normalized: legacy64, reason: null });
  const legacy65 = "bd-" + "a".repeat(62);
  assert.deepEqual(validateIssueId(legacy65), { ok: false, normalized: null, reason: "charset" });
  assert.deepEqual(validateIssueId("issue_7"), { ok: false, normalized: null, reason: "charset" });
});

// ── session-capture: exercised through runCapture's session-end path ────────

async function captureWithBinding({ issueBinding, board }) {
  const savedHome = process.env.HOME;
  const home = createTempDir();
  const project = createTempDir();
  try {
    process.env.HOME = home;
    mkdirSync(join(project, ".context-index"), { recursive: true });
    writeFileSync(join(project, ".context-index", "manifest.yaml"), "project:\n  name: t\ntasks:\n  backend: file\n");
    if (board !== undefined) {
      mkdirSync(join(project, ".context-index", "tasks"), { recursive: true });
      writeFileSync(join(project, ".context-index", "tasks", "tasks.md"), board);
    }
    writeExecutionState(project, {
      status: "active",
      planRef: ".context-index/specs/features/x/y.plan.md",
      currentTask: 1,
      issueBinding,
    });

    const sessionId = "sess-gh-ids-001";
    const transcriptsRoot = join(home, ".claude", "projects", realpathSync(project).replace(/[/.]/g, "-"));
    mkdirSync(transcriptsRoot, { recursive: true });
    const transcriptPath = join(transcriptsRoot, `${sessionId}.jsonl`);
    writeFileSync(
      transcriptPath,
      [
        { role: "user", message: { content: "hello" } },
        { role: "assistant", message: { content: "hi there" } },
      ].map((l) => JSON.stringify(l)).join("\n") + "\n",
    );

    const diags = [];
    const result = await runCapture({
      event: "session-end",
      payload: { session_id: sessionId, transcript_path: transcriptPath, cwd: project },
      projectRoot: project,
      emit: (code, opts = {}) => diags.push(`${code} ${opts.subject ?? ""}`.trim()),
    });
    assert.equal(result.ok, true);
    assert.equal(result.kind, "session-end");
    const content = readFileSync(result.written, "utf8");
    const frontmatter = content.match(/^---\n([\s\S]*?)\n---/)[1];
    return { frontmatter, diags };
  } finally {
    process.env.HOME = savedHome;
    cleanupTempDir(project);
    cleanupTempDir(home);
  }
}

test("session-capture: canonical gh IDs are written to session frontmatter", async () => {
  for (const id of ["gh-12", "gh-org2.my_repo.v2.3", GH_160]) {
    const { frontmatter, diags } = await captureWithBinding({ issueBinding: id });
    assert.match(frontmatter, new RegExp(`^issue: ${id.replace(/\./g, "\\.")}$`, "m"), id);
    assert.deepEqual(diags, [], id);
  }
});

test("session-capture: gh ID over 160 characters and display forms are omitted with an issue-id diagnostic", async () => {
  for (const bad of [GH_161, "#12", "acme/board#12", "GH-12", "gh-my_org.repo.1"]) {
    const { frontmatter, diags } = await captureWithBinding({ issueBinding: bad });
    assert.doesNotMatch(frontmatter, /^issue:/m, bad);
    assert.doesNotMatch(frontmatter, /[#/]/, bad);
    assert.deepEqual(diags, ["validation-error issue-id"], bad);
  }
});

test("session-capture: a canonical cross-repo gh epic ID from the board is written", async () => {
  const { frontmatter, diags } = await captureWithBinding({
    issueBinding: "gh-12",
    board: "# Tasks\n\n### gh-12\n\nepicId: gh-acme.my_repo.3\n",
  });
  assert.match(frontmatter, /^issue: gh-12$/m);
  assert.match(frontmatter, /^epic: gh-acme\.my_repo\.3$/m);
  assert.deepEqual(diags, []);
});

test("session-capture: a display-form epic ID is omitted with an epic-id diagnostic", async () => {
  const { frontmatter, diags } = await captureWithBinding({
    issueBinding: "gh-12",
    board: "# Tasks\n\n### gh-12\n\nepicId: acme/board#3\n",
  });
  assert.match(frontmatter, /^issue: gh-12$/m);
  assert.doesNotMatch(frontmatter, /^epic:/m);
  assert.deepEqual(diags, ["validation-error epic-id"]);
});
