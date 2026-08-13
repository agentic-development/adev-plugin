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
import { readdirSync, readFileSync } from "node:fs";
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

    for (const slot of SLOT_REGISTRY) {
      const out = slot.render(resolved.context);
      assert.equal(typeof out.body, "string", `${slot.title}: body must be a string`);
      assert.ok(Number.isInteger(out.bytes), `${slot.title}: bytes must be an integer`);
      assert.equal(
        out.bytes,
        Buffer.byteLength(out.body, "utf8"),
        `${slot.title}: bytes must be the body's own utf8 size`,
      );
      assert.ok(!out.body.includes(OPEN_MARKER), `${slot.title}: a renderer emits no opening marker`);
      assert.ok(!out.body.includes(CLOSE_MARKER), `${slot.title}: a renderer emits no closing marker`);
      assert.ok(out.body.includes(`### ${slot.title}`), `${slot.title}: the renderer owns its heading`);
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
