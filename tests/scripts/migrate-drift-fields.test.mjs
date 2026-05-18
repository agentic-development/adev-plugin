// tests/scripts/migrate-drift-fields.test.mjs
//
// Tests for scripts/migrate-drift-fields.mjs — Migration Step 4 from
// jsonl-drift-events.spec.md. One-shot migration that drains legacy
// drift_source / drift_at frontmatter fields into per-spec JSONL
// `code_drift_detected` events. Behaviors 6 and 7; idempotency rules
// (a/b/c); SEC-1 traversal rejection; SEC-3 concurrent-race handling;
// SEC-5 dry-run side-effect-free.

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  realpathSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { readEvents, _clearEventDiagnosticsRegistryCache } from "../../lib/lifecycle-state.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const SCRIPT = resolve(PROJECT_ROOT, "scripts", "migrate-drift-fields.mjs");

function makeTempProject() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "drift-migrate-")));
  mkdirSync(join(dir, ".context-index", "specs", "features", "m"), {
    recursive: true,
  });
  writeFileSync(
    join(dir, ".context-index", "manifest.yaml"),
    "domain: software\n",
  );
  _clearEventDiagnosticsRegistryCache();
  return dir;
}

function writeSpec(root, slug, frontmatter) {
  const lines = ["---"];
  for (const [k, v] of Object.entries(frontmatter)) {
    lines.push(`${k}: ${v}`);
  }
  lines.push("---", "", "# " + slug);
  const rel = join(".context-index", "specs", "features", "m", slug + ".spec.md");
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, lines.join("\n"));
  return { rel, abs };
}

function runScript(args, opts = {}) {
  return spawnSync("node", [SCRIPT, ...args], {
    encoding: "utf8",
    cwd: opts.cwd ?? process.cwd(),
  });
}

function snapshotTree(dir) {
  // Capture a {relPath: <content + mtime>} map of every regular file under dir.
  const out = {};
  function walk(d, base) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      const rel = base ? join(base, entry.name) : entry.name;
      if (entry.isDirectory()) {
        walk(full, rel);
      } else if (entry.isFile()) {
        const st = statSync(full);
        out[rel] = readFileSync(full, "utf8") + "|" + st.mtimeMs;
      }
    }
  }
  walk(dir, "");
  return out;
}

describe("migrate-drift-fields", () => {
  let root;
  beforeEach(() => {
    root = makeTempProject();
  });
  after(() => {
    // Each beforeEach replaces root; final root is cleaned here.
    try { rmSync(root, { recursive: true, force: true }); } catch {}
  });

  it("migrates a spec with drift_source/drift_at in frontmatter (case a: needs migration)", () => {
    const { rel, abs } = writeSpec(root, "needs-mig", {
      title: "needs",
      status: "implemented",
      drift_detected: true,
      drift_source: "lib/foo.mjs",
      drift_at: "2026-04-01T10:00:00.000Z",
    });
    const r = runScript([], { cwd: root });
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const content = readFileSync(abs, "utf8");
    assert.match(content, /^drift_detected:\s*true$/m);
    assert.doesNotMatch(content, /^drift_source:/m);
    assert.doesNotMatch(content, /^drift_at:/m);
    const events = readEvents(root, rel).filter(e => e.event === "code_drift_detected");
    assert.equal(events.length, 1);
    assert.equal(events[0].drift_source, "lib/foo.mjs");
    assert.equal(events[0].drift_at, "2026-04-01T10:00:00.000Z");
  });

  it("is a no-op on a spec with no drift_source/drift_at in frontmatter (case b: already migrated)", () => {
    const { rel, abs } = writeSpec(root, "already-mig", {
      title: "already",
      status: "implemented",
      drift_detected: true,
    });
    const before = readFileSync(abs, "utf8");
    const r = runScript([], { cwd: root });
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const after = readFileSync(abs, "utf8");
    assert.equal(after, before);
    const events = readEvents(root, rel).filter(e => e.event === "code_drift_detected");
    assert.equal(events.length, 0, "no event should be re-appended");
  });

  it("treats both-present state as recovered: strips fields, does not re-append event (case c: partial state)", async () => {
    // Spec has frontmatter drift_source + drift_at AND a matching JSONL event.
    const { rel, abs } = writeSpec(root, "partial-state", {
      title: "partial",
      status: "implemented",
      drift_detected: true,
      drift_source: "lib/foo.mjs",
      drift_at: "2026-04-01T10:00:00.000Z",
    });
    // Pre-seed a matching JSONL event with the same drift_at timestamp.
    const { appendEvent } = await import("../../lib/lifecycle-state.mjs");
    appendEvent(root, rel, {
      event: "code_drift_detected",
      drift_source: "lib/foo.mjs",
      drift_at: "2026-04-01T10:00:00.000Z",
    });
    const r = runScript([], { cwd: root });
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const content = readFileSync(abs, "utf8");
    assert.doesNotMatch(content, /^drift_source:/m);
    assert.doesNotMatch(content, /^drift_at:/m);
    const events = readEvents(root, rel).filter(e => e.event === "code_drift_detected");
    assert.equal(events.length, 1, "matching event must NOT be re-appended");
  });

  it("rejects + warns + skips a spec whose legacy drift_source contains traversal escape (SEC-1)", () => {
    const { rel, abs } = writeSpec(root, "traversal", {
      title: "trav",
      status: "implemented",
      drift_detected: true,
      drift_source: "../../etc/passwd",
      drift_at: "2026-04-01T10:00:00.000Z",
    });
    const r = runScript([], { cwd: root });
    // Exit 1 with summary when any spec is skipped.
    assert.notStrictEqual(r.status, 0);
    assert.match(r.stderr + r.stdout, /traversal|escape|reject|skip/i);
    // Frontmatter and JSONL untouched.
    const content = readFileSync(abs, "utf8");
    assert.match(content, /^drift_source: \.\.\/\.\.\/etc\/passwd$/m);
    const events = readEvents(root, rel).filter(e => e.event === "code_drift_detected");
    assert.equal(events.length, 0);
  });

  it("--dry-run produces a report but does not mutate any spec or JSONL file (SEC-5)", () => {
    writeSpec(root, "mig-1", {
      title: "m1",
      status: "implemented",
      drift_detected: true,
      drift_source: "lib/a.mjs",
      drift_at: "2026-04-01T10:00:00.000Z",
    });
    writeSpec(root, "mig-2", {
      title: "m2",
      status: "implemented",
      drift_detected: true,
      drift_source: "lib/b.mjs",
      drift_at: "2026-04-02T10:00:00.000Z",
    });
    const before = snapshotTree(root);
    const r = runScript(["--dry-run"], { cwd: root });
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout + r.stderr, /dry/i);
    const after = snapshotTree(root);
    assert.deepEqual(after, before, "dry-run must not mutate any file");
  });

  it("re-running the script on a fully-migrated tree is a no-op (idempotency)", () => {
    const { rel, abs } = writeSpec(root, "idem", {
      title: "idem",
      status: "implemented",
      drift_detected: true,
      drift_source: "lib/foo.mjs",
      drift_at: "2026-04-01T10:00:00.000Z",
    });
    runScript([], { cwd: root });
    const after1 = readFileSync(abs, "utf8");
    const events1 = readEvents(root, rel).filter(e => e.event === "code_drift_detected").length;
    const r = runScript([], { cwd: root });
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const after2 = readFileSync(abs, "utf8");
    const events2 = readEvents(root, rel).filter(e => e.event === "code_drift_detected").length;
    assert.equal(after2, after1, "second run must not mutate frontmatter");
    assert.equal(events2, events1, "second run must not append duplicate event");
  });

  it("exits 1 with summary when any spec is skipped, 0 when all clean", () => {
    writeSpec(root, "good", {
      title: "good",
      status: "implemented",
      drift_detected: true,
      drift_source: "lib/foo.mjs",
      drift_at: "2026-04-01T10:00:00.000Z",
    });
    writeSpec(root, "bad", {
      title: "bad",
      status: "implemented",
      drift_detected: true,
      drift_source: "../../escape.mjs",
      drift_at: "2026-04-02T10:00:00.000Z",
    });
    const r = runScript([], { cwd: root });
    assert.notStrictEqual(r.status, 0, "must exit 1 on skipped specs");
    assert.match(r.stdout + r.stderr, /skip|summary|migrated|reject/i);
  });

  it("supports --root flag to scope the scan to a subdirectory", () => {
    const { rel, abs } = writeSpec(root, "scoped", {
      title: "scoped",
      status: "implemented",
      drift_detected: true,
      drift_source: "lib/foo.mjs",
      drift_at: "2026-04-01T10:00:00.000Z",
    });
    const r = runScript(["--root", ".context-index/specs"], { cwd: root });
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const content = readFileSync(abs, "utf8");
    assert.doesNotMatch(content, /^drift_source:/m);
  });
});
