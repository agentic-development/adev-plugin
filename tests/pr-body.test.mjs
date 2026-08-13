// tests/pr-body.test.mjs
//
// Walking-skeleton tests for `adev pr body` — the five-slot PR review brief.
//
// Contract under test:
//   * exactly one marker pair on stdout (Invariant 1)
//   * every slot renders; a slot with no data renders an explicit gap line
//     naming what was missing (Invariant 2)
//   * read-only: nothing under .context-index/ is created, modified, or
//     deleted (Invariant 8)
//   * diagnostics on stderr, brief on stdout (Invariant 9)
//   * the only three conditions in brief generation that change the exit code
//     are NOT_A_GIT_REPO, INVALID_BASE_REF, NO_MERGE_BASE (a usage error —
//     missing/unknown subverb, unparseable flag — also exits non-zero, but
//     that is outside brief generation)
//
// Spec: .context-index/specs/features/pr-review-brief/pr-body-composition.spec.md
// Plan-task: 1

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fstatSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import {
  PLUGIN_ROOT,
  createTempDir,
  createTempGitRepo,
  cleanupTempDir,
  writeFixture,
} from "./helpers.mjs";
import {
  run,
  composeBrief,
  resolvePrContext,
  SLOT_REGISTRY,
  OPEN_MARKER,
  CLOSE_MARKER,
  MAX_BRIEF_BYTES,
  MAX_INPUT_BYTES,
  encodeValue,
  tableRow,
  slot,
  containSpecPath,
  checkInputBounds,
  readSpecArtifact,
  parseCommitTrailers,
  buildTaskUniverse,
} from "../lib/cli/pr.mjs";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** The five section titles, in the spec's fixed order. */
const SLOT_TITLES = [
  "Size advisory",
  "Attention map",
  "Reading order",
  "Traceability",
  "Verification",
];

const SPEC_REL = ".context-index/specs/features/demo/demo.spec.md";

function git(dir, args) {
  return execFileSync("git", args, { cwd: dir, stdio: "pipe", encoding: "utf8" });
}

/**
 * A git repo with commits carrying Spec:/Plan-task: trailers AND a populated
 * .context-index/ (spec, plan, routing sidecar, lifecycle JSONL). The seeded
 * .context-index is what gives the Invariant 8 read-only snapshot something
 * real to compare.
 */
function seededRepo() {
  const dir = createTempGitRepo({ branch: "feat/demo" });

  writeFixture(dir, SPEC_REL, "# demo spec\n\nBehavior: the demo does a thing.\n");
  writeFixture(
    dir,
    ".context-index/specs/features/demo/demo.plan.md",
    "# demo plan\n\n### Task 1: alpha\n\n### Task 2: beta\n",
  );
  writeFixture(
    dir,
    ".context-index/specs/features/demo/demo.routing.json",
    JSON.stringify({ entries: [{ task: 1, tier: "auto-agent" }, { task: 2, tier: "assisted-agent" }] }, null, 2) + "\n",
  );
  writeFixture(
    dir,
    ".context-index/lifecycle-state/events.jsonl",
    JSON.stringify({ event: "validate", spec: "demo", outcome: "PASS" }) + "\n",
  );

  writeFixture(dir, "src/alpha.mjs", "export const alpha = 1;\n");
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-m", `feat(demo): add alpha\n\nSpec: ${SPEC_REL}\nPlan-task: 1`]);

  writeFixture(dir, "src/beta.mjs", "export const beta = 2;\nexport const gamma = 3;\n");
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-m", `feat(demo): add beta\n\nSpec: ${SPEC_REL}\nPlan-task: 2`]);

  return dir;
}

/** A git repo with commits but NO .context-index/ and NO manifest.yaml. */
function bareRepo() {
  const dir = createTempGitRepo({ branch: "work" });
  writeFixture(dir, "src/only.mjs", "export const only = 1;\n");
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-m", "chore: add only"]);
  return dir;
}

/** A repo whose HEAD is an orphan commit — no merge base with `main` exists. */
function orphanRepo() {
  const dir = createTempGitRepo();
  git(dir, ["checkout", "--orphan", "detached-history"]);
  git(dir, ["rm", "-rf", "--cached", "."]);
  writeFixture(dir, "unrelated.md", "unrelated\n");
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-m", "chore: orphan root"]);
  return dir;
}

/** Invoke the verb in-process, capturing the two output channels separately. */
async function invoke(projectRoot, argv, manifest = null) {
  const out = [];
  const err = [];
  const code = await run({
    projectRoot,
    argv,
    manifest,
    out: (s) => out.push(s),
    err: (s) => err.push(s),
  });
  return { code, stdout: out.join(""), stderr: err.join("") };
}

/** relpath -> sha256(content) for every file under .context-index/. */
function snapshotContextIndex(root) {
  const snap = new Map();
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else snap.set(p.slice(root.length), createHash("sha256").update(readFileSync(p)).digest("hex"));
    }
  };
  walk(join(root, ".context-index"));
  return [...snap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

// ---------------------------------------------------------------------------
// Invariant 1 — exactly one marker pair
// ---------------------------------------------------------------------------

test("emits exactly one marker pair", async () => {
  const dir = seededRepo();
  try {
    const { code, stdout } = await invoke(dir, ["body", "--base", "main"]);
    assert.equal(code, 0);
    assert.equal(countOccurrences(stdout, OPEN_MARKER), 1, "exactly one opening marker");
    assert.equal(countOccurrences(stdout, CLOSE_MARKER), 1, "exactly one closing marker");
    assert.ok(
      stdout.indexOf(OPEN_MARKER) < stdout.indexOf(CLOSE_MARKER),
      "the opening marker must precede the closing marker",
    );
  } finally {
    cleanupTempDir(dir);
  }
});

test("a marker literal arriving through untrusted input cannot forge a marker pair", async () => {
  // Invariant 1 is universally quantified — "whatever any input contains".
  // `--head` is untrusted text that reaches stdout through the degradation
  // cause, so it is the live injection vector for the marker contract.
  const dir = seededRepo();
  try {
    for (const injected of [OPEN_MARKER, CLOSE_MARKER, `${OPEN_MARKER}${CLOSE_MARKER}`]) {
      const { code, stdout } = await invoke(dir, ["body", "--base", "main", "--head", injected]);
      assert.equal(code, 0, "an unresolvable --head degrades rather than changing the exit code");
      assert.equal(
        countOccurrences(stdout, OPEN_MARKER),
        1,
        `injected ${JSON.stringify(injected)} forged an opening marker`,
      );
      assert.equal(
        countOccurrences(stdout, CLOSE_MARKER),
        1,
        `injected ${JSON.stringify(injected)} forged a closing marker`,
      );
      assert.ok(
        stdout.indexOf(OPEN_MARKER) < stdout.indexOf(CLOSE_MARKER),
        "the surviving pair is still correctly ordered",
      );
    }

    // Neutralizing must not re-create the literal by rejoining the halves it
    // split apart.
    const nested = `<!-- adev:${OPEN_MARKER}pr-brief -->`;
    const { stdout: nestedOut } = await invoke(dir, ["body", "--base", "main", "--head", nested]);
    assert.equal(countOccurrences(nestedOut, OPEN_MARKER), 1, "nested injection forged an opening marker");
    assert.equal(countOccurrences(nestedOut, CLOSE_MARKER), 1, "nested injection forged a closing marker");

    // The untrusted value is neutralized, not censored — a reviewer must still
    // be able to see what was passed.
    const { stdout: visible } = await invoke(dir, ["body", "--base", "main", "--head", OPEN_MARKER]);
    assert.ok(visible.includes("adev:pr-brief --&gt;"), "the injected value is still shown, just inert");
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Invariant 2 — no silent absence
// ---------------------------------------------------------------------------

test("empty range renders all five slots with gap lines", async () => {
  const dir = seededRepo();
  try {
    const head = git(dir, ["rev-parse", "HEAD"]).trim();
    const { code, stdout } = await invoke(dir, ["body", "--base", head]);
    assert.equal(code, 0, "an empty range is not an error");
    for (const title of SLOT_TITLES) {
      assert.ok(stdout.includes(`### ${title}`), `section heading missing: ${title}`);
    }
    assert.equal(
      countOccurrences(stdout, "_UNKNOWN —"),
      SLOT_TITLES.length,
      "every one of the five slots renders a gap line when the range is empty",
    );
    assert.ok(
      stdout.includes("contains no commits"),
      "the gap line must name the empty range as the cause",
    );
  } finally {
    cleanupTempDir(dir);
  }
});

test("slots appear in the spec's fixed order", async () => {
  const dir = seededRepo();
  try {
    const { code, stdout } = await invoke(dir, ["body", "--base", "main"]);
    assert.equal(code, 0);
    const positions = SLOT_TITLES.map((t) => {
      const i = stdout.indexOf(`### ${t}`);
      assert.notEqual(i, -1, `section heading missing: ${t}`);
      return i;
    });
    for (let i = 1; i < positions.length; i++) {
      assert.ok(
        positions[i - 1] < positions[i],
        `"${SLOT_TITLES[i - 1]}" must precede "${SLOT_TITLES[i]}"`,
      );
    }
  } finally {
    cleanupTempDir(dir);
  }
});

test("bareRepo(): absent .context-index and manifest yield all gap lines, exit 0", async () => {
  const dir = bareRepo();
  try {
    const { code, stdout, stderr } = await invoke(dir, ["body", "--base", "main"]);
    assert.equal(code, 0, `expected exit 0, stderr was: ${stderr}`);
    for (const title of SLOT_TITLES) {
      assert.ok(stdout.includes(`### ${title}`), `section heading missing: ${title}`);
    }
    assert.equal(
      countOccurrences(stdout, "_UNKNOWN —"),
      SLOT_TITLES.length,
      "all five slots degrade to gap lines when .context-index/ is absent",
    );
    assert.equal(countOccurrences(stdout, OPEN_MARKER), 1);
    assert.equal(countOccurrences(stdout, CLOSE_MARKER), 1);
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Invariant 9 — channel separation
// ---------------------------------------------------------------------------

test("diagnostics go to stderr, not stdout", async () => {
  const dir = seededRepo();
  try {
    // In-process: an error case puts everything on stderr and nothing on stdout.
    const bad = await invoke(dir, ["body", "--base", "no/such/ref"]);
    assert.equal(bad.stdout, "", "no partial brief on stdout");
    assert.ok(bad.stderr.length > 0, "the diagnostic goes to stderr");

    // Out of process: the real CLI keeps the channels separate too.
    const ok = spawnSync("node", [join(PLUGIN_ROOT, "cli", "index.mjs"), "pr", "body", "--base", "main"], {
      cwd: dir,
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(ok.status, 0, `cli exited ${ok.status}; stderr: ${ok.stderr}`);
    assert.ok(ok.stdout.startsWith(OPEN_MARKER), "stdout carries the brief and nothing else");
    assert.ok(ok.stdout.trimEnd().endsWith(CLOSE_MARKER), "stdout ends at the closing marker");
    assert.equal(ok.stderr, "", "a clean run writes nothing to stderr");

    const failed = spawnSync("node", [join(PLUGIN_ROOT, "cli", "index.mjs"), "pr", "body", "--base", "no/such/ref"], {
      cwd: dir,
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.notEqual(failed.status, 0);
    assert.equal(failed.stdout, "", "no partial brief on stdout");
    assert.ok(failed.stderr.includes("INVALID_BASE_REF"));
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Invariant 8 — read-only
// ---------------------------------------------------------------------------

test("seededRepo(): creates, modifies, and deletes no file under .context-index", async () => {
  const dir = seededRepo();
  try {
    const before = snapshotContextIndex(dir);
    assert.ok(before.length >= 4, "the fixture must seed a non-empty .context-index/");

    const { code } = await invoke(dir, ["body", "--base", "main"]);
    assert.equal(code, 0);

    const after = snapshotContextIndex(dir);
    assert.deepEqual(after, before, "no file under .context-index/ may be created, modified, or deleted");
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Error cases — the only three conditions that change the exit code
// ---------------------------------------------------------------------------

test("NOT_A_GIT_REPO names the working directory, emits no partial brief", async () => {
  const dir = createTempDir();
  try {
    const { code, stdout, stderr } = await invoke(dir, ["body"]);
    assert.notEqual(code, 0);
    assert.equal(stdout, "", "no partial brief");
    assert.ok(stderr.includes("NOT_A_GIT_REPO"), "the diagnostic names the error code");
    assert.ok(stderr.includes(dir), "the diagnostic names the working directory");
  } finally {
    cleanupTempDir(dir);
  }
});

test("INVALID_BASE_REF names the unresolvable ref", async () => {
  const dir = seededRepo();
  try {
    const { code, stdout, stderr } = await invoke(dir, ["body", "--base", "no/such/ref"]);
    assert.notEqual(code, 0);
    assert.equal(stdout, "", "no partial brief");
    assert.ok(stderr.includes("INVALID_BASE_REF"));
    assert.ok(stderr.includes("no/such/ref"), "the diagnostic names the unresolvable ref");
  } finally {
    cleanupTempDir(dir);
  }
});

test("INVALID_BASE_REF: an empty --base is an explicit base that does not resolve", async () => {
  const dir = seededRepo();
  try {
    const { code, stdout, stderr } = await invoke(dir, ["body", "--base", ""]);
    assert.notEqual(code, 0, "an empty --base must not fall through to the merge-base default");
    assert.equal(stdout, "", "no partial brief");
    assert.ok(stderr.includes("INVALID_BASE_REF"));
  } finally {
    cleanupTempDir(dir);
  }
});

test("NO_MERGE_BASE suggests an explicit --base", async () => {
  const dir = orphanRepo();
  try {
    const { code, stdout, stderr } = await invoke(dir, ["body"]);
    assert.notEqual(code, 0);
    assert.equal(stdout, "", "no partial brief");
    assert.ok(stderr.includes("NO_MERGE_BASE"));
    assert.ok(stderr.includes("--base"), "the diagnostic suggests passing an explicit --base");
  } finally {
    cleanupTempDir(dir);
  }
});

test("NO_MERGE_BASE blames the unresolvable head when that is what actually failed", async () => {
  const dir = seededRepo();
  try {
    const { code, stdout, stderr } = await invoke(dir, ["body", "--head", "no/such/ref"]);
    assert.notEqual(code, 0);
    assert.equal(stdout, "", "no partial brief");
    assert.ok(stderr.includes("NO_MERGE_BASE"), "the exit-code condition is unchanged");
    assert.ok(stderr.includes("no/such/ref"), "the diagnostic names the unresolvable head ref");
    assert.ok(
      stderr.includes("does not resolve"),
      "the diagnostic names the real cause, not a missing merge base",
    );
    assert.ok(stderr.includes("--base"), "the diagnostic still suggests an explicit --base");
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// The registry seam — renderer contract and the assembly-owned ceiling
// ---------------------------------------------------------------------------

test("every slot renderer returns { body, bytes } and emits no marker", () => {
  const dir = seededRepo();
  try {
    const resolved = resolvePrContext({ projectRoot: dir, base: "main", head: "HEAD", manifest: null });
    assert.equal(resolved.ok, true, `context resolution failed: ${resolved.message}`);

    assert.equal(SLOT_REGISTRY.length, 5, "the registry declares all five slots");
    assert.deepEqual(SLOT_REGISTRY.map((s) => s.title), SLOT_TITLES);

    for (const entry of SLOT_REGISTRY) {
      const out = entry.render(resolved.context);
      assert.equal(typeof out.body, "string", `${entry.title}: body must be a string`);
      assert.ok(Number.isInteger(out.bytes), `${entry.title}: bytes must be an integer`);
      assert.equal(
        out.bytes,
        Buffer.byteLength(out.body, "utf8"),
        `${entry.title}: bytes must be the body's own utf8 size`,
      );
      assert.ok(!out.body.includes(OPEN_MARKER), `${entry.title}: a renderer emits no opening marker`);
      assert.ok(!out.body.includes(CLOSE_MARKER), `${entry.title}: a renderer emits no closing marker`);
      assert.ok(out.body.includes(`### ${entry.title}`), `${entry.title}: the renderer owns its heading`);
    }
  } finally {
    cleanupTempDir(dir);
  }
});

test("a renderer over-contributing is truncated by assembly, naming the section", () => {
  const dir = seededRepo();
  try {
    const resolved = resolvePrContext({ projectRoot: dir, base: "main", head: "HEAD", manifest: null });
    assert.equal(resolved.ok, true);

    const oversizedBody = "### Oversized\n\n" + "x".repeat(MAX_BRIEF_BYTES + 5000) + "\n";
    const registry = [
      {
        id: "oversized",
        title: "Oversized",
        render: () => ({ body: oversizedBody, bytes: Buffer.byteLength(oversizedBody, "utf8") }),
      },
    ];

    const brief = composeBrief(resolved.context, registry);

    assert.equal(countOccurrences(brief, OPEN_MARKER), 1);
    assert.equal(countOccurrences(brief, CLOSE_MARKER), 1);
    assert.ok(brief.indexOf(OPEN_MARKER) < brief.indexOf(CLOSE_MARKER));
    assert.ok(brief.includes("### Oversized"), "truncation preserves the section heading");
    assert.ok(
      brief.includes("_TRUNCATED — the Oversized section"),
      "the overflow renders as a named degradation naming the truncated section",
    );
    assert.ok(
      Buffer.byteLength(brief, "utf8") < Buffer.byteLength(oversizedBody, "utf8"),
      "the emitted brief is smaller than the over-contributing body",
    );
    // Tight bound: subtract exactly the scaffolding assembly adds (the marker
    // pair and the truncation notices) and hold what remains — the slot bodies
    // themselves — to the ceiling. A loose slack here is what let a
    // false-notice bug hide.
    const noticeLines = brief.split("\n").filter((l) => l.startsWith("_TRUNCATED —"));
    assert.equal(noticeLines.length, 1, "exactly one section was truncated");
    const scaffolding =
      Buffer.byteLength(OPEN_MARKER, "utf8") +
      Buffer.byteLength(CLOSE_MARKER, "utf8") +
      noticeLines.reduce((n, l) => n + Buffer.byteLength(l, "utf8"), 0);
    assert.ok(
      Buffer.byteLength(brief, "utf8") - scaffolding <= MAX_BRIEF_BYTES + 16,
      "assembly holds the slot bodies themselves to the ceiling",
    );
  } finally {
    cleanupTempDir(dir);
  }
});

test("assembly emits no truncation notice for a section it did not shorten", () => {
  // A degradation line is a factual claim inside an artifact reviewers are
  // meant to trust. `truncateSlotBody` always keeps the heading line, so a
  // heading-only body comes back byte-identical — it must not be reported as
  // cut.
  const dir = seededRepo();
  try {
    const resolved = resolvePrContext({ projectRoot: dir, base: "main", head: "HEAD", manifest: null });
    assert.equal(resolved.ok, true);

    const bigBody = "### Big\n\n" + "x".repeat(5000) + "\n";
    const smallBody = "### Small\n";
    const registry = [
      { id: "big", title: "Big", render: () => ({ body: bigBody, bytes: Buffer.byteLength(bigBody, "utf8") }) },
      { id: "small", title: "Small", render: () => ({ body: smallBody, bytes: Buffer.byteLength(smallBody, "utf8") }) },
    ];

    // A ceiling below the combined heading floor: both sections are visited,
    // but only Big can actually shrink.
    const brief = composeBrief(resolved.context, registry, 5);

    assert.ok(brief.includes("_TRUNCATED — the Big section"), "the section that was cut is named");
    assert.ok(
      !brief.includes("_TRUNCATED — the Small section"),
      "a section that was not shortened must get no truncation notice",
    );
    assert.equal(countOccurrences(brief, "_TRUNCATED —"), 1, "exactly one truncation notice");
    assert.ok(brief.includes("### Small"), "the untouched section survives intact");
    assert.equal(countOccurrences(brief, OPEN_MARKER), 1);
    assert.equal(countOccurrences(brief, CLOSE_MARKER), 1);
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Task 2 — safety substrate: encoder (T4), containment (T5), input bounds (T8)
// ---------------------------------------------------------------------------

/**
 * Every character that must not survive encoding. `&`, `#`, `;` and the digits
 * are part of the entities the encoder emits, so the check below removes those
 * entities first and then requires that NOTHING in this list remains — which
 * is strictly stronger than checking the raw output, because it also forbids a
 * bare `&` or a stray `;` that no entity accounts for.
 */
const RAW_DANGEROUS = [
  "&",
  "|", "<", ">", "[", "]", "(", ")", "!", "'", '"', "`", "$", "\\", ";",
  "*", "_", "{", "}", "~", "#", "?", "\n", "\r", "\t", "\x7f", "\u2028", "\u2029",
];

function assertEncodedIsInert(encoded, label) {
  const stripped = encoded.replace(/&(?:amp|lt|gt|quot|#\d+);/g, "");
  for (const ch of RAW_DANGEROUS) {
    assert.ok(
      !stripped.includes(ch),
      `${label}: ${JSON.stringify(ch)} survived encoding — ${JSON.stringify(encoded)}`,
    );
  }
}

/**
 * An `fs` façade that records the path of every call, delegating to the real
 * `node:fs`. `overrides(base)` may replace individual members; the replacement
 * still goes through `base` when it wants the real behavior (and so is still
 * recorded).
 */
function recordingFs(overrides = () => ({})) {
  const calls = [];
  const base = {
    realpathSync: (p) => {
      calls.push({ name: "realpathSync", path: p });
      return realpathSync(p);
    },
    statSync: (p) => {
      calls.push({ name: "statSync", path: p });
      return statSync(p);
    },
    openSync: (p, flags) => {
      calls.push({ name: "openSync", path: p });
      return openSync(p, flags);
    },
    fstatSync: (fd) => {
      calls.push({ name: "fstatSync", path: null });
      return fstatSync(fd);
    },
    readFileSync: (target, enc) => {
      calls.push({ name: "readFileSync", path: typeof target === "string" ? target : null });
      return readFileSync(target, enc);
    },
    closeSync: (fd) => {
      calls.push({ name: "closeSync", path: null });
      return closeSync(fd);
    },
  };
  const fs = { ...base, ...overrides(base) };
  return {
    fs,
    calls,
    /** Every path that reached any recorded filesystem call. */
    paths: () => calls.filter((c) => c.path !== null).map((c) => c.path),
    /** Every path that reached a call that inspects or touches file contents. */
    accessPaths: () =>
      calls
        .filter((c) => c.path !== null && ["openSync", "readFileSync", "statSync"].includes(c.name))
        .map((c) => c.path),
    names: () => calls.map((c) => c.name),
  };
}

// --- T4: the encoder's exact character set and transformation order ---

test("T4: pipe cannot break table structure", () => {
  // A pipe encoded in isolation proves nothing about tables; the guarantee is
  // that a cell carrying a pipe still occupies exactly one column.
  const row = tableRow(["a|b|c", "safe"]);
  assert.equal(row.split("|").length - 1, 3, `a two-cell row must have exactly 3 pipes: ${row}`);
  assert.ok(row.includes("&#124;"), "the injected pipe survives as a visible entity");
  assert.ok(!row.includes("a|b"), "the raw pipe is gone");
  assertEncodedIsInert(encodeValue("a|b|c"), "pipe");
});

test("T4: newline and CR cannot inject a line break", () => {
  for (const injected of ["a\nb", "a\r\nb", "a\rb", "a\u2028b", "a\u2029b"]) {
    const encoded = encodeValue(injected);
    assert.equal(encoded.split("\n").length, 1, `${JSON.stringify(injected)} produced a newline`);
    assert.equal(encoded.split("\r").length, 1, `${JSON.stringify(injected)} produced a CR`);
    assert.ok(encoded.startsWith("a") && encoded.endsWith("b"), "the surrounding text survives");
  }
  // A row whose cell carries a newline still occupies one line.
  const row = tableRow(["### forged\nheading", "x"]);
  assert.equal(row.split("\n").length, 1, `a table cell must not span lines: ${JSON.stringify(row)}`);
});

test("T4: bracket-paren cannot form a markdown link", () => {
  const encoded = encodeValue("[click me](https://evil.example/steal)");
  assert.ok(!encoded.includes("["), "no opening bracket survives");
  assert.ok(!encoded.includes("]("), "no link syntax survives");
  assert.ok(encoded.includes("click me"), "the text stays visible to a reviewer");
  assertEncodedIsInert(encoded, "link");
});

test("T4: bang-bracket cannot form an image", () => {
  const encoded = encodeValue("![alt](https://evil.example/tracker.png)");
  assert.ok(!encoded.includes("!["), "no image syntax survives");
  assert.ok(!encoded.includes("!"), "the bang itself is encoded");
  assert.ok(encoded.includes("alt"), "the text stays visible to a reviewer");
  assertEncodedIsInert(encoded, "image");
});

test("T4: '<!--' and '-->' cannot form an HTML comment delimiter", () => {
  for (const injected of ["<!--", "-->", "<!-- hidden -->", OPEN_MARKER, CLOSE_MARKER]) {
    const encoded = encodeValue(injected);
    assert.ok(!encoded.includes("<!--"), `${injected}: an opening comment delimiter survived`);
    assert.ok(!encoded.includes("-->"), `${injected}: a closing comment delimiter survived`);
    assert.ok(!encoded.includes("<"), `${injected}: a raw '<' survived`);
    assert.ok(!encoded.includes(">"), `${injected}: a raw '>' survived`);
  }
  // Escaping must not rejoin the halves it split apart.
  assert.ok(!encodeValue(`<!-- adev:${OPEN_MARKER}pr-brief -->`).includes(OPEN_MARKER));
});

test("T4: shell metacharacters are never interpreted", () => {
  // Part 1 — the encoder leaves no shell metacharacter raw.
  const metas = "`$(id)` ; rm -rf / & echo $HOME | tee ~/x > /dev/null && ${IFS}\\'\"";
  assertEncodedIsInert(encodeValue(metas), "shell metacharacters");

  // Part 2 — structurally, a value never reaches a shell at all: refs go to git
  // as argv. A metacharacter payload must not execute even end to end.
  const dir = seededRepo();
  try {
    const payload = "$(touch pwned); touch pwned2; `touch pwned3`";
    const resolved = resolvePrContext({ projectRoot: dir, base: "main", head: payload });
    assert.equal(resolved.ok, true, "an unresolvable head degrades, it does not fail");
    for (const artifact of ["pwned", "pwned2", "pwned3"]) {
      assert.equal(existsSync(join(dir, artifact)), false, `${artifact} was created — a shell ran`);
    }
    // Part 3 — the payload reaches the brief through the degradation cause,
    // and reaches it inert. (The whole line cannot go through
    // assertEncodedIsInert: the `_UNKNOWN —` scaffolding around the value is
    // trusted template text, not an encoded value.)
    const brief = composeBrief(resolved.context);
    const rendered = brief.split("\n").filter((l) => l.includes("touch")).join("\n");
    assert.ok(rendered.includes("touch pwned"), "the payload is shown to the reviewer, not censored");
    const strippedLine = rendered.replace(/&(?:amp|lt|gt|quot|#\d+);/g, "");
    for (const meta of ["$", "(", ")", "`", ";"]) {
      assert.ok(!strippedLine.includes(meta), `a raw ${JSON.stringify(meta)} survived into the brief`);
    }
    assertEncodedIsInert(encodeValue(payload), "shell payload");
  } finally {
    cleanupTempDir(dir);
  }
});

test("T4: the encoder's exact character table", () => {
  // The positive direction of T4. `assertEncodedIsInert` says only that
  // nothing dangerous survives; it strips the entity alphabet before looking,
  // so it cannot say WHICH entity was emitted. This test pins "the exact
  // character set the encoder applies": this character produces this exact
  // replacement, and nothing else is touched.
  //
  // It is also what discriminates a single-pass map from a sequential chain of
  // replacements. A chain rewrites the `;` and `#` inside an entity an earlier
  // rule just inserted: with `&` replaced first, `|` comes out as
  // `&&#35;124&&#35;59;` instead of `&#124;`. (Concatenation-stability does
  // NOT discriminate them — see the composition test below.)
  const EXPECTED = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
    "`": "&#96;",
    "|": "&#124;",
    "[": "&#91;",
    "]": "&#93;",
    "(": "&#40;",
    ")": "&#41;",
    "!": "&#33;",
    "$": "&#36;",
    "\\": "&#92;",
    ";": "&#59;",
    "*": "&#42;",
    "_": "&#95;",
    "{": "&#123;",
    "}": "&#125;",
    "~": "&#126;",
    "#": "&#35;",
    "?": "&#63;",
  };
  assert.equal(Object.keys(EXPECTED).length, 22, "the table has exactly 22 entries");

  for (const [ch, entity] of Object.entries(EXPECTED)) {
    assert.equal(encodeValue(ch), entity, `${JSON.stringify(ch)} must encode to exactly ${entity}`);
    assert.equal(
      encodeValue(`a${ch}b`),
      `a${entity}b`,
      `${JSON.stringify(ch)} must encode to ${entity} in context too`,
    );
  }

  // Control characters, DEL and the two Unicode line separators collapse to a
  // SINGLE SPACE — not to nothing, and not to an entity. Dropping them instead
  // would silently weld two lines of text into one token, which is a different
  // transformation from the documented one.
  const collapsed = [];
  for (let i = 0; i <= 0x1f; i++) collapsed.push(String.fromCharCode(i));
  for (const code of [0x7f, 0x2028, 0x2029]) collapsed.push(String.fromCharCode(code));
  for (const ch of collapsed) {
    assert.equal(
      encodeValue(ch),
      " ",
      `U+${ch.codePointAt(0).toString(16).padStart(4, "0")} must collapse to a single space`,
    );
    assert.equal(encodeValue(`a${ch}b`), "a b", "the collapsed character leaves exactly one space behind");
  }

  // Exact in the other direction too: nothing outside the table is touched, so
  // adding a character to the encoder has to come through this test first.
  for (let i = 0x20; i <= 0x7e; i++) {
    const ch = String.fromCharCode(i);
    if (Object.prototype.hasOwnProperty.call(EXPECTED, ch)) continue;
    assert.equal(encodeValue(ch), ch, `printable ${JSON.stringify(ch)} must pass through unchanged`);
  }
  assert.equal(encodeValue("a-b.c/d:e+f=g,h"), "a-b.c/d:e+f=g,h", "ordinary path and prose punctuation survives");
  assert.equal(encodeValue("héllo — 😀"), "héllo — 😀", "non-ASCII, including astral, passes through intact");
});

test("T4: transformation order is stable under composed inputs", () => {
  // A regression guard on concatenation behaviour, NOT a proof of
  // order-freedom: a chained implementation is a homomorphism too (each pass
  // is a single-character global replace, and single-character replacements
  // cannot match across a concatenation boundary), so this loop alone cannot
  // tell a map from a chain. What discriminates them is the exact character
  // table asserted above. This is kept because an encoder that ever grew a
  // multi-character rule — real lookahead — would break here and nowhere else.
  const parts = ["&", "&amp;", "<!--", "-->", "|", "[x](y)", "!", "`$(id)`", "\n", "\\", "'\"", "#*_~{}?;"];
  for (const a of parts) {
    for (const b of parts) {
      assert.equal(
        encodeValue(a + b),
        encodeValue(a) + encodeValue(b),
        `encoding is not stable under composition: ${JSON.stringify(a)} + ${JSON.stringify(b)}`,
      );
    }
  }
  const composed = parts.join("");
  assert.equal(encodeValue(composed), parts.map(encodeValue).join(""));
  assertEncodedIsInert(encodeValue(composed), "composed adversarial input");
});

test("a rationale containing '<!-- /adev:pr-brief -->' still yields one marker pair", () => {
  // Invariant 1 holds whatever any input contains. `rationale` is the value the
  // spec singles out as subject to Invariant 5 without exception.
  const dir = seededRepo();
  try {
    const resolved = resolvePrContext({ projectRoot: dir, base: "main", head: "HEAD" });
    assert.equal(resolved.ok, true);

    for (const rationale of [CLOSE_MARKER, OPEN_MARKER, `${CLOSE_MARKER}${OPEN_MARKER}`]) {
      const rowBody = `### Traceability\n\n${tableRow(["task", rationale])}\n`;
      const registry = [
        { id: "attention-map", title: "Attention map", render: () => slot("Attention map", rationale) },
        {
          id: "traceability",
          title: "Traceability",
          render: () => ({ body: rowBody, bytes: Buffer.byteLength(rowBody, "utf8") }),
        },
      ];
      const brief = composeBrief(resolved.context, registry);
      assert.equal(countOccurrences(brief, OPEN_MARKER), 1, `rationale ${rationale}: forged an opening marker`);
      assert.equal(countOccurrences(brief, CLOSE_MARKER), 1, `rationale ${rationale}: forged a closing marker`);
      assert.ok(brief.indexOf(OPEN_MARKER) < brief.indexOf(CLOSE_MARKER), "the surviving pair is ordered");
    }
  } finally {
    cleanupTempDir(dir);
  }
});

// --- T5: containment, asserted by INSTRUMENTING THE CALL, not by output ---

test("T5: a trailer-derived path outside .context-index/specs/ never reaches a filesystem call", () => {
  const dir = seededRepo();
  try {
    const escapes = [
      "/etc/passwd",
      ".context-index/specs/../../../../../../../../etc/passwd",
      "../outside.spec.md",
      ".context-index/lifecycle-state/events.jsonl",
      "src/alpha.mjs",
      "spec\u0000.md",
      "",
    ];
    for (const escape of escapes) {
      const rec = recordingFs();
      const result = readSpecArtifact(dir, escape, { fs: rec.fs });
      assert.equal(result.ok, false, `${JSON.stringify(escape)} was accepted`);
      assert.ok(result.reason && result.reason.length > 0, "the refusal names a cause");
      assert.deepEqual(
        rec.paths(),
        [],
        `${JSON.stringify(escape)} reached a filesystem call: ${JSON.stringify(rec.calls)}`,
      );
    }

    // The same rejection through the guard alone, with no read attempted.
    const rec = recordingFs();
    const guarded = containSpecPath(dir, "/etc/passwd", { fs: rec.fs });
    assert.equal(guarded.ok, false);
    assert.deepEqual(rec.paths(), [], "the guard refuses lexically, before any call");

    // Lexically inside the root but absent from disk — the branch a `Spec:`
    // trailer pointing at a since-deleted spec lands on. It is an Invariant 4
    // degradation with its own named cause, not a throw and not an escape.
    const gone = recordingFs();
    const missing = readSpecArtifact(dir, ".context-index/specs/features/demo/gone.spec.md", { fs: gone.fs });
    assert.equal(missing.ok, false);
    assert.match(missing.reason, /does not exist/);
    assert.ok(!gone.names().includes("openSync"), "a missing spec is never opened");
    assert.ok(!gone.names().includes("readFileSync"), "a missing spec is never read");
  } finally {
    cleanupTempDir(dir);
  }
});

test("T5: a COMMITTED SYMLINK pointing outside the root is refused", () => {
  const dir = seededRepo();
  const outsideDir = createTempDir();
  try {
    const secretPath = join(outsideDir, "secret.spec.md");
    writeFileSync(secretPath, "# secret\n");
    const linkRel = ".context-index/specs/features/demo/escape.spec.md";
    symlinkSync(secretPath, join(dir, linkRel));
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-m", "chore: commit an escaping symlink"]);
    assert.equal(
      execFileSync("git", ["ls-files", "-s", linkRel], { cwd: dir, encoding: "utf8" }).startsWith("120000"),
      true,
      "the fixture must be a committed symlink",
    );

    const rec = recordingFs();
    const result = readSpecArtifact(dir, linkRel, { fs: rec.fs });
    assert.equal(result.ok, false, "a symlink escaping the root must be refused");
    assert.ok(/outside|escape/i.test(result.reason), `the refusal names the escape: ${result.reason}`);

    const realSecret = realpathSync(secretPath);
    for (const p of rec.accessPaths()) {
      assert.notEqual(p, realSecret, "the symlink target reached a filesystem access");
      assert.notEqual(p, secretPath, "the symlink target reached a filesystem access");
    }
    assert.ok(!rec.names().includes("openSync"), "nothing was opened");
    assert.ok(!rec.names().includes("readFileSync"), "nothing was read");
  } finally {
    cleanupTempDir(dir);
    cleanupTempDir(outsideDir);
  }
});

test("T5: containment is re-asserted at open time", () => {
  const dir = seededRepo();
  try {
    // Sanity: the same path reads cleanly when nothing swaps underneath it.
    const clean = recordingFs();
    const ok = readSpecArtifact(dir, SPEC_REL, { fs: clean.fs });
    assert.equal(ok.ok, true, `a contained spec must read: ${ok.reason}`);
    assert.ok(ok.content.includes("demo spec"), "the seeded content is returned verbatim");
    assert.ok(clean.names().includes("readFileSync"), "the clean case actually reads");

    // Now make the path stop resolving inside the root *after* the pre-open
    // check has passed. Only a re-assertion at open time can catch this.
    let hits = 0;
    const rec = recordingFs((base) => ({
      realpathSync: (p) => {
        const real = base.realpathSync(p);
        if (String(p).endsWith("demo.spec.md")) {
          hits += 1;
          if (hits >= 2) return "/etc/passwd";
        }
        return real;
      },
    }));
    const result = readSpecArtifact(dir, SPEC_REL, { fs: rec.fs });
    assert.ok(hits >= 2, "containment must be resolved again after the file is opened");
    assert.equal(result.ok, false, "a path that stops being contained at open time must be refused");
    assert.ok(result.reason && result.reason.length > 0, "the refusal names a cause");
    assert.ok(rec.names().includes("openSync"), "the re-assertion happens at open time, not instead of it");
    assert.ok(!rec.names().includes("readFileSync"), "no content was read after the re-assertion failed");
    assert.ok(rec.names().includes("closeSync"), "the descriptor is closed on refusal");
  } finally {
    cleanupTempDir(dir);
  }
});

test("T5: the descriptor is bound to the contained name, not just re-resolved by name", () => {
  // The swap -> open -> swap-back race. Re-resolving the NAME after the open
  // proves nothing about what the DESCRIPTOR points at: the name can resolve
  // inside the root the whole time while the fd refers to a file outside it.
  // Asserting that realpathSync was called twice cannot distinguish the two,
  // which is why this case is asserted on the returned content instead.
  const dir = seededRepo();
  const outsideDir = createTempDir();
  try {
    const secretPath = join(outsideDir, "secret.txt");
    writeFileSync(secretPath, "SECRET CONTENT\n");

    const rec = recordingFs((base) => ({
      // The name keeps resolving inside the root; only the descriptor is swapped.
      openSync: (p, flags) => {
        if (String(p).endsWith("demo.spec.md")) {
          return base.openSync(secretPath, flags);
        }
        return base.openSync(p, flags);
      },
    }));

    const result = readSpecArtifact(dir, SPEC_REL, { fs: rec.fs });

    assert.equal(result.ok, false, "a descriptor pointing outside the root must be refused");
    assert.ok(/replaced|outside/i.test(result.reason), `the refusal names the cause: ${result.reason}`);
    assert.ok(
      !JSON.stringify(result).includes("SECRET"),
      `the out-of-root file's content escaped: ${JSON.stringify(result)}`,
    );
    assert.ok(rec.names().includes("closeSync"), "the substituted descriptor is still closed");
  } finally {
    cleanupTempDir(dir);
    cleanupTempDir(outsideDir);
  }
});

test("T5: a refused path degrades to UNKNOWN with a named cause, exit 0", async () => {
  const dir = seededRepo();
  try {
    const resolved = resolvePrContext({ projectRoot: dir, base: "main", head: "HEAD" });
    assert.equal(resolved.ok, true);

    let refusal;
    const registry = [
      {
        id: "traceability",
        title: "Traceability",
        render: (context) => {
          refusal = readSpecArtifact(context.repoRoot, "../../../../etc/passwd");
          return slot("Traceability", refusal.reason);
        },
      },
    ];
    const brief = composeBrief(resolved.context, registry);

    assert.equal(refusal.ok, false, "the refusal is a return value, not a throw");
    assert.ok(brief.includes("### Traceability"), "the section still renders");
    assert.ok(brief.includes("_UNKNOWN — traceability unavailable:"), "the row degrades to UNKNOWN");
    assert.ok(brief.includes("etc"), "the named cause identifies the refused path");
    assert.equal(countOccurrences(brief, OPEN_MARKER), 1);
    assert.equal(countOccurrences(brief, CLOSE_MARKER), 1);

    const { code } = await invoke(dir, ["body", "--base", "main"]);
    assert.equal(code, 0, "a containment refusal leaves the exit code unchanged");
  } finally {
    cleanupTempDir(dir);
  }
});

// --- T8: the numeric input bounds, and that exceeding each degrades ---

test("T8: file size ceiling — exceeding it degrades, does not throw", () => {
  const dir = seededRepo();
  try {
    assert.ok(Number.isInteger(MAX_INPUT_BYTES) && MAX_INPUT_BYTES > 0, "the ceiling is a named constant");

    // Injected small ceiling — the mechanism, with a cheap fixture.
    const rec = recordingFs();
    let result;
    assert.doesNotThrow(() => {
      result = readSpecArtifact(dir, SPEC_REL, { fs: rec.fs, maxBytes: 4 });
    }, "exceeding the ceiling degrades rather than throwing");
    assert.equal(result.ok, false);
    assert.ok(/ceiling|bytes/i.test(result.reason), `the refusal names the bound: ${result.reason}`);
    assert.ok(!rec.names().includes("readFileSync"), "an oversized file is never read");

    // At the boundary: exactly maxBytes is accepted, one byte more is not.
    const exactRel = ".context-index/specs/features/demo/exact.spec.md";
    writeFixture(dir, exactRel, "abcdefgh");
    assert.equal(readSpecArtifact(dir, exactRel, { maxBytes: 8 }).ok, true, "exactly the ceiling is accepted");
    assert.equal(readSpecArtifact(dir, exactRel, { maxBytes: 7 }).ok, false, "one byte over is refused");

    // The real constant, with a real oversized fixture.
    const bigRel = ".context-index/specs/features/demo/big.spec.md";
    writeFixture(dir, bigRel, "x".repeat(MAX_INPUT_BYTES + 1));
    const big = readSpecArtifact(dir, bigRel);
    assert.equal(big.ok, false, `${MAX_INPUT_BYTES + 1} bytes must exceed MAX_INPUT_BYTES`);

    // The bounds predicate on its own, with no filesystem involved.
    assert.equal(checkInputBounds({ isFile: () => true, size: 10 }, { maxBytes: 10 }).ok, true);
    assert.equal(checkInputBounds({ isFile: () => true, size: 11 }, { maxBytes: 10 }).ok, false);
    assert.equal(checkInputBounds({ isFile: () => false, size: 0 }, { maxBytes: 10 }).ok, false);
  } finally {
    cleanupTempDir(dir);
  }
});

test("T8: non-regular file (fifo/device) is refused before reading", () => {
  const dir = seededRepo();
  try {
    // A fifo is the sharp case: opening one for read BLOCKS until a writer
    // appears, so the regular-file check must precede the open, not follow it.
    const fifoRel = ".context-index/specs/features/demo/pipe.spec.md";
    execFileSync("mkfifo", [join(dir, fifoRel)]);
    assert.equal(statSync(join(dir, fifoRel)).isFIFO(), true, "the fixture must be a fifo");

    const rec = recordingFs();
    const result = readSpecArtifact(dir, fifoRel, { fs: rec.fs });
    assert.equal(result.ok, false, "a non-regular file must be refused");
    assert.ok(/regular file/i.test(result.reason), `the refusal names the cause: ${result.reason}`);
    assert.ok(rec.names().includes("statSync"), "the refusal came from an inspection, as expected");
    assert.ok(!rec.names().includes("openSync"), "the fifo was never opened");
    assert.ok(!rec.names().includes("readFileSync"), "the fifo was never read");

    // A directory inside the root is likewise not a readable input.
    const dirResult = readSpecArtifact(dir, ".context-index/specs/features/demo");
    assert.equal(dirResult.ok, false, "a directory is not a regular file");
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Task 3 — trailers, the task universe, and the Traceability slot
//
// The partition invariant is the spine of this block: every commit in the
// range appears in exactly one traceability row or in the untraced bucket.
// It is asserted as ARITHMETIC, and the right-hand side of that arithmetic is
// `git rev-list --count` — an independent source. Comparing against
// `context.commits.length` would be circular: a phantom record injected into
// `git log` output inflates both sides and the test still passes.
// ---------------------------------------------------------------------------

const SPEC_A = ".context-index/specs/features/demo/alpha.spec.md";
const SPEC_B = ".context-index/specs/features/demo/beta.spec.md";
const SPEC_C = ".context-index/specs/features/demo/carol.spec.md";

const TRACE_HEADER = ["Spec", "Tasks", "Commits", "Additions", "Deletions"];
const UNTRACED_LABEL = "untraced — no Spec: trailer";

/**
 * A repo whose BASE (`main`) already carries the spec artifacts, so the range
 * `main..HEAD` contains exactly the commits seeded afterwards and each row's
 * diff stat is exactly the source lines those commits added.
 */
function specRepo(specRelPaths) {
  const dir = createTempGitRepo();
  for (const rel of specRelPaths) writeFixture(dir, rel, `# ${rel}\n`);
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-m", "chore: seed specs"]);
  git(dir, ["checkout", "-b", "feat/trace"]);
  return dir;
}

/** One commit adding `lines` lines to `file`, carrying `trailers` verbatim. */
function commitWith(dir, file, lines, trailers, subject) {
  writeFixture(dir, file, "x\n".repeat(lines));
  git(dir, ["add", "-A"]);
  const head = subject || `feat: ${file}`;
  const message = trailers.length > 0 ? `${head}\n\n${trailers.join("\n")}\n` : `${head}\n`;
  git(dir, ["commit", "-m", message]);
}

/**
 * Three specs, five commits: A twice, B once, C once, and one commit with no
 * trailers at all. Row counts 2 + 1 + 1 and an untraced bucket of 1 sum to 5.
 */
function traceabilityRepo() {
  const dir = specRepo([SPEC_A, SPEC_B, SPEC_C]);
  commitWith(dir, "src/one.mjs", 1, [`Spec: ${SPEC_A}`, "Plan-task: 1"]);
  commitWith(dir, "src/two.mjs", 2, [`Spec: ${SPEC_A}`, "Plan-task: 2"]);
  commitWith(dir, "src/three.mjs", 3, [`Spec: ${SPEC_B}`, "Plan-task: 1"]);
  commitWith(dir, "src/four.mjs", 4, []);
  commitWith(dir, "src/five.mjs", 5, [`Spec: ${SPEC_C}`, "Plan-task: 7"]);
  return dir;
}

/** The number of commits in `main..HEAD`, from a source other than `git log`. */
function rangeCommitCount(dir) {
  return Number(git(dir, ["rev-list", "--count", "main..HEAD"]).trim());
}

/** The section body for `title`, from the opening heading to the next one. */
function sectionOf(brief, title) {
  const start = brief.indexOf(`### ${title}`);
  assert.notEqual(start, -1, `section missing: ${title}`);
  const rest = brief.slice(start + 1);
  const nextRel = rest.indexOf("\n### ");
  if (nextRel !== -1) return brief.slice(start, start + 1 + nextRel);
  const close = brief.indexOf(CLOSE_MARKER, start);
  return brief.slice(start, close === -1 ? brief.length : close);
}

/** Every markdown table row in a section as trimmed cells; the rule is dropped. */
function tableRowsOf(section) {
  return section
    .split("\n")
    .filter((l) => l.startsWith("|") && !/^\|[\s-]+\|/.test(l))
    .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
}

/** The traceability table of a full brief, header row included. */
async function traceabilityRows(dir) {
  const { code, stdout } = await invoke(dir, ["body", "--base", "main"]);
  assert.equal(code, 0, "a populated traceability section does not change the exit code");
  return { stdout, section: sectionOf(stdout, "Traceability"), rows: tableRowsOf(sectionOf(stdout, "Traceability")) };
}

test("one traceability row per Spec: trailer, aggregating count, task coverage, diff stat", async () => {
  const dir = traceabilityRepo();
  try {
    const { rows } = await traceabilityRows(dir);
    assert.deepEqual(rows[0], TRACE_HEADER, "the traceability column set is fixed");
    assert.deepEqual(
      rows.slice(1),
      [
        [encodeValue(SPEC_A), "1, 2", "2", "3", "0"],
        [encodeValue(SPEC_B), "1", "1", "3", "0"],
        [encodeValue(SPEC_C), "7", "1", "5", "0"],
        [UNTRACED_LABEL, "—", "1", "4", "0"],
      ],
      "one row per referenced spec, aggregating commit count, task coverage and diff stat",
    );
  } finally {
    cleanupTempDir(dir);
  }
});

test("commits with no Spec: trailer collect into a labelled untraced bucket", async () => {
  const dir = traceabilityRepo();
  try {
    const { rows } = await traceabilityRows(dir);
    const untraced = rows.filter((r) => r[0] === UNTRACED_LABEL);
    assert.equal(untraced.length, 1, "exactly one untraced bucket, explicitly labelled");
    assert.deepEqual(untraced[0], [UNTRACED_LABEL, "—", "1", "4", "0"]);
    assert.equal(
      rows[rows.length - 1][0],
      UNTRACED_LABEL,
      "the untraced bucket sorts last, after every spec row",
    );
  } finally {
    cleanupTempDir(dir);
  }
});

test("the section is annotated as a gap when the untraced bucket is non-empty", async () => {
  const dir = traceabilityRepo();
  const clean = specRepo([SPEC_A]);
  try {
    const { section } = await traceabilityRows(dir);
    assert.ok(section.includes("_GAP —"), `the section is annotated as a gap: ${section}`);
    assert.ok(
      section.includes("1 of 5 commits"),
      `the annotation names how many commits are untraced: ${section}`,
    );
    assert.ok(section.includes("no Spec: trailer"), "the annotation names what was missing");

    // The counterpart: nothing untraced, no gap annotation.
    commitWith(clean, "src/only.mjs", 1, [`Spec: ${SPEC_A}`, "Plan-task: 1"]);
    const fully = await traceabilityRows(clean);
    assert.ok(
      !fully.section.includes("_GAP —"),
      `a fully traced range is not annotated as a gap: ${fully.section}`,
    );
    assert.deepEqual(
      fully.rows.slice(1),
      [[encodeValue(SPEC_A), "1", "1", "1", "0"], [UNTRACED_LABEL, "—", "0", "0", "0"]],
      "the untraced bucket is still rendered explicitly, at zero",
    );
  } finally {
    cleanupTempDir(dir);
    cleanupTempDir(clean);
  }
});

test("row commit counts plus the untraced bucket sum to the range commit count", async () => {
  const dir = traceabilityRepo();
  try {
    const { rows } = await traceabilityRows(dir);
    const data = rows.slice(1);
    assert.ok(data.length >= 2, "the fixture must produce spec rows and an untraced bucket");

    const summed = data.reduce((n, r) => n + Number(r[2]), 0);
    // The right-hand side comes from `rev-list`, NOT from `context.commits`:
    // an injected phantom record would inflate both sides of a circular check.
    assert.equal(rangeCommitCount(dir), 5, "the fixture seeds exactly five commits");
    assert.equal(
      summed,
      rangeCommitCount(dir),
      `every commit must appear in exactly one row or the untraced bucket: ${JSON.stringify(data)}`,
    );
  } finally {
    cleanupTempDir(dir);
  }
});

test("a commit carrying two Spec: trailers still appears exactly once in total", async () => {
  const dir = specRepo([SPEC_A, SPEC_B]);
  try {
    commitWith(dir, "src/one.mjs", 1, [`Spec: ${SPEC_A}`, `Spec: ${SPEC_B}`, "Plan-task: 1"]);
    commitWith(dir, "src/two.mjs", 2, [`Spec: ${SPEC_A}`, "Plan-task: 2"]);

    const { rows } = await traceabilityRows(dir);
    const data = rows.slice(1);

    // Both trailers still produce a row — the reference is not lost...
    const specs = data.map((r) => r[0]);
    assert.ok(specs.includes(encodeValue(SPEC_A)), "the first Spec: trailer has a row");
    assert.ok(specs.includes(encodeValue(SPEC_B)), "the second Spec: trailer has a row");

    // ...but the commit is COUNTED once, so the partition still holds.
    assert.equal(rangeCommitCount(dir), 2);
    assert.equal(
      data.reduce((n, r) => n + Number(r[2]), 0),
      2,
      `a dual-trailer commit was double-counted: ${JSON.stringify(data)}`,
    );
    assert.deepEqual(
      data,
      [
        [encodeValue(SPEC_A), "1, 2", "2", "3", "0"],
        [encodeValue(SPEC_B), "1", "0", "0", "0"],
        [UNTRACED_LABEL, "—", "0", "0", "0"],
      ],
      "the commit is attributed to exactly one row; the secondary row keeps its task coverage",
    );
  } finally {
    cleanupTempDir(dir);
  }
});

test("task universe pairs (spec_path, task_id) from the SAME commit", () => {
  const dir = specRepo([SPEC_A, SPEC_B]);
  try {
    commitWith(dir, "src/one.mjs", 1, [`Spec: ${SPEC_A}`, "Plan-task: 1"]);
    commitWith(dir, "src/two.mjs", 2, [`Spec: ${SPEC_A}`, "Plan-task: 1"]);
    commitWith(dir, "src/three.mjs", 3, [`Spec: ${SPEC_B}`, "Plan-task: 2"]);

    const resolved = resolvePrContext({ projectRoot: dir, base: "main", head: "HEAD" });
    assert.equal(resolved.ok, true, `context resolution failed: ${resolved.message}`);

    const universe = buildTaskUniverse(resolved.context);
    assert.deepEqual(
      universe.tasks.map((t) => [t.specPath, t.taskId]),
      [[SPEC_A, "1"], [SPEC_B, "2"]],
      "a task is the (spec, task) pair drawn from ONE commit — never a cross-commit pairing",
    );
    const pairs = universe.tasks.map((t) => `${t.specPath}#${t.taskId}`);
    assert.ok(!pairs.includes(`${SPEC_A}#2`), "task 2 never appeared on a commit naming spec A");
    assert.ok(!pairs.includes(`${SPEC_B}#1`), "task 1 never appeared on a commit naming spec B");

    // The trailer parser itself, on the same contract.
    assert.deepEqual(
      parseCommitTrailers(`feat: x\n\nSpec: ${SPEC_A}\nPlan-task: 4\n`),
      { specPaths: [SPEC_A], taskIds: ["4"] },
    );
    assert.deepEqual(
      parseCommitTrailers("feat: x\n\nno trailers here\n"),
      { specPaths: [], taskIds: [] },
    );
  } finally {
    cleanupTempDir(dir);
  }
});

test("a task's file set is the union of paths its commits touch", () => {
  const dir = specRepo([SPEC_A, SPEC_B]);
  try {
    commitWith(dir, "src/one.mjs", 1, [`Spec: ${SPEC_A}`, "Plan-task: 1"]);
    commitWith(dir, "src/two.mjs", 2, [`Spec: ${SPEC_A}`, "Plan-task: 1"]);
    commitWith(dir, "src/three.mjs", 3, [`Spec: ${SPEC_B}`, "Plan-task: 2"]);

    const resolved = resolvePrContext({ projectRoot: dir, base: "main", head: "HEAD" });
    assert.equal(resolved.ok, true);

    const universe = buildTaskUniverse(resolved.context);
    const byKey = new Map(universe.tasks.map((t) => [`${t.specPath}#${t.taskId}`, t]));

    assert.deepEqual(
      byKey.get(`${SPEC_A}#1`).files,
      ["src/one.mjs", "src/two.mjs"],
      "one task spanning two commits owns the union of their paths",
    );
    assert.deepEqual(byKey.get(`${SPEC_B}#2`).files, ["src/three.mjs"]);
    assert.equal(byKey.get(`${SPEC_A}#1`).shas.length, 2, "both commits are recorded on the task");
  } finally {
    cleanupTempDir(dir);
  }
});

test("a spec path containing a pipe cannot break the traceability table", async () => {
  const pipeSpec = ".context-index/specs/features/demo/we|rd.spec.md";
  const dir = specRepo([pipeSpec]);
  try {
    commitWith(dir, "src/one.mjs", 1, [`Spec: ${pipeSpec}`, "Plan-task: 1"]);

    const { section, rows } = await traceabilityRows(dir);
    // Keyed on the entity, which only the pipe-bearing row can contain.
    const row = rows.slice(1).find((r) => r[0].includes("&#124;"));
    assert.ok(row, `the pipe-bearing spec still has a row: ${section}`);
    assert.equal(row.length, 5, "the row still occupies exactly five columns");
    assert.equal(row[0], encodeValue(pipeSpec), "the value reaches the cell through the encoder");
    assert.ok(row[0].includes("&#124;"), "the pipe survives as a visible entity");

    const line = section.split("\n").find((l) => l.includes("&#124;"));
    assert.equal(line.split("|").length - 1, 6, `a five-cell row has exactly six pipes: ${line}`);
    assert.ok(!section.includes("we|rd"), "no raw pipe survives into the table");
    assertEncodedIsInert(row[0], "pipe-bearing spec path");
  } finally {
    cleanupTempDir(dir);
  }
});

test("a commit message containing raw record/field separators injects no phantom commit", async () => {
  // `git log` machine output must use a delimiter the payload cannot contain.
  // A message carrying \x1e/\x1f plus a well-formed forty-hex sha is exactly
  // the shape that forges a record boundary — and a forged record makes the
  // partition arithmetic lie.
  const dir = specRepo([SPEC_A, SPEC_B]);
  try {
    const forged = `\x1e${"0".repeat(40)}\x1fphantom subject\x1fphantom body\n\nSpec: ${SPEC_B}\nPlan-task: 9`;
    commitWith(dir, "src/one.mjs", 1, [`Spec: ${SPEC_A}`, "Plan-task: 1"], `feat: sneaky${forged}`);

    const resolved = resolvePrContext({ projectRoot: dir, base: "main", head: "HEAD" });
    assert.equal(resolved.ok, true);

    const expectedShas = git(dir, ["rev-list", "main..HEAD"]).trim().split("\n");
    assert.equal(expectedShas.length, 1, "the fixture seeds exactly one commit");
    assert.deepEqual(
      resolved.context.commits.map((c) => c.sha),
      expectedShas,
      "the parsed commit list must be exactly the range's commits — no phantom record",
    );
    assert.ok(
      resolved.context.commits[0].body.includes("phantom body"),
      "the injected separators are payload, so the body survives them intact",
    );

    const { rows } = await traceabilityRows(dir);
    const data = rows.slice(1);
    assert.equal(
      data.reduce((n, r) => n + Number(r[2]), 0),
      rangeCommitCount(dir),
      `the forged record broke the partition arithmetic: ${JSON.stringify(data)}`,
    );
    assert.equal(rangeCommitCount(dir), 1);
  } finally {
    cleanupTempDir(dir);
  }
});

test("traceability rows are totally ordered: commit count desc, then spec path", async () => {
  // Invariant 7. The primary key can tie (B and C both have one commit), so a
  // further key breaks it — the spec path, which is unique per row and
  // therefore cannot tie.
  const dir = traceabilityRepo();
  try {
    const first = await traceabilityRows(dir);
    assert.deepEqual(
      first.rows.slice(1).map((r) => r[0]),
      [encodeValue(SPEC_A), encodeValue(SPEC_B), encodeValue(SPEC_C), UNTRACED_LABEL],
      "two commits sort before one; the one-commit rows tie-break on spec path ascending",
    );

    const second = await traceabilityRows(dir);
    assert.equal(second.section, first.section, "the same inputs render byte-identical output");
  } finally {
    cleanupTempDir(dir);
  }
});
