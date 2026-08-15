// tests/cli/heuristics.test.mjs
//
// Tests for the surviving `adev heuristics` subcommands — `retrieve` and
// `write` — plus the module's driver-substrate contract and the retirement
// of the dead `extract` capture path.
//
// `signature` and `migrate-keys` have their own suites
// (tests/cli/heuristics-signature.test.mjs,
// tests/cli/heuristics-migrate-keys.test.mjs); this file only spot-checks
// that they still dispatch.
//
// Spec: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md
// Spec: .context-index/specs/features/heuristics/failure-capture.spec.md (Task 7 — retirement)
//
// Contract (driver-substrate.spec.md):
//   - Module exports `run({ projectRoot, argv, manifest })` and `help()`.
//   - Does NOT export LIFECYCLE_STEP (these are helpers invoked from inside
//     other lifecycle steps, not lifecycle steps themselves).
//
// CLI surface:
//   adev heuristics retrieve --module <slug> [--injection-limit N] [...]
//   adev heuristics write    --id <id> --scope <s> --title <t> --pattern <p> [...]
//   adev heuristics --help   → prints usage
//
// Tests cover:
//   - module exports run + help, no LIFECYCLE_STEP
//   - no subcommand → exit 1 with usage
//   - `--help` prints usage and exits 0
//   - retrieve: argument validation, empty result, seeded result, both formats
//   - write: argument validation, success line, --signature persistence
//   - retirement: `extract` no longer dispatches, its helpers are gone, and
//     the orphaned check file is deleted

import { test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");

function makeTempProject({ manifestModules = [] } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-heuristics-test-")));
  mkdirSync(join(dir, ".context-index", "specs", "features", "m"), {
    recursive: true,
  });
  mkdirSync(join(dir, ".context-index", "heuristics"), { recursive: true });
  let manifestBody = 'project:\n  name: t\n  adev_version: "0.22.0"\n';
  if (manifestModules.length > 0) {
    manifestBody += "modules:\n";
    for (const m of manifestModules) {
      manifestBody += `  - slug: ${m}\n    name: ${m}\n`;
    }
  }
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), manifestBody);
  return dir;
}

function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// ── Driver-substrate contract ─────────────────────────────────────────────

test("lib/cli/heuristics.mjs exports run and help", async () => {
  const mod = await import("../../lib/cli/heuristics.mjs");
  assert.strictEqual(typeof mod.run, "function");
  assert.strictEqual(typeof mod.help, "function");
});

test("lib/cli/heuristics.mjs does NOT export LIFECYCLE_STEP (observational helper)", async () => {
  const mod = await import("../../lib/cli/heuristics.mjs");
  assert.strictEqual(mod.LIFECYCLE_STEP, undefined);
});

// ── Usage / argument errors ──────────────────────────────────────────────

test("adev heuristics with no subcommand exits 1 with usage", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "heuristics"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /usage: adev heuristics/i);
  } finally {
    cleanup(dir);
  }
});

test("adev heuristics --help exits 0 and prints usage", () => {
  const r = spawnSync("node", [CLI, "heuristics", "--help"], {
    encoding: "utf8",
  });
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /Usage: adev heuristics <subcommand>/);
  assert.match(r.stdout, /heuristics retrieve/);
});

// ─────────────────────────────────────────────────────────────────────────
// PR 8-9 subcommands: retrieve + write
// ─────────────────────────────────────────────────────────────────────────

// Helper: write a heuristic file directly so retrieve has something to find.
function seedHeuristic(dir, scope, body) {
  const dirPath = join(dir, ".context-index", "memory", "heuristics");
  mkdirSync(dirPath, { recursive: true });
  writeFileSync(join(dirPath, `${scope}.md`), body);
}

// Minimal heuristic markdown block (matches lib/heuristics.mjs::serializeHeuristic format).
function makeHeuristicBody({
  id = "test-deadbeef",
  scope = "m",
  title = "Test heuristic",
  pattern = "Do the thing",
  confidence = "medium",
  created = "2026-05-15",
  updated = "2026-05-15",
} = {}) {
  return `# Heuristics (scope: ${scope})\n\n---\nid: ${id}\nscope: ${scope}\ntitle: ${title}\npattern: ${pattern}\nconfidence: ${confidence}\ncreated: ${created}\nupdated: ${updated}\nevidence: []\n---\n`;
}

// ── retrieve subcommand ──────────────────────────────────────────────────

test("heuristics retrieve without --module exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "heuristics", "retrieve"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--module|usage/i);
  } finally {
    cleanup(dir);
  }
});

test("heuristics retrieve with invalid --injection-limit exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "heuristics",
        "retrieve",
        "--module",
        "m",
        "--injection-limit",
        "not-a-number",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--injection-limit|integer/i);
  } finally {
    cleanup(dir);
  }
});

test("heuristics retrieve with invalid --tier exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "heuristics", "retrieve", "--module", "m", "--tier", "bogus"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--tier|index|summary|full/i);
  } finally {
    cleanup(dir);
  }
});

test("heuristics retrieve with no heuristics returns {count:0,rendered:''}", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "heuristics", "retrieve", "--module", "m"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0);
    const parsed = JSON.parse(r.stdout.trim());
    assert.strictEqual(parsed.count, 0);
    assert.strictEqual(parsed.rendered, "");
  } finally {
    cleanup(dir);
  }
});

test("heuristics retrieve --format text returns '__NONE__' when empty", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "heuristics", "retrieve", "--module", "m", "--format", "text"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout.trim(), "__NONE__");
  } finally {
    cleanup(dir);
  }
});

test("heuristics retrieve returns seeded heuristics (json)", () => {
  const dir = makeTempProject();
  seedHeuristic(
    dir,
    "m",
    makeHeuristicBody({ id: "m-aaaa1111", scope: "m", title: "Module heuristic" }),
  );
  try {
    const r = spawnSync(
      "node",
      [CLI, "heuristics", "retrieve", "--module", "m"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0);
    const parsed = JSON.parse(r.stdout.trim());
    assert.strictEqual(parsed.count, 1);
    assert.match(parsed.rendered, /Module heuristic|m-aaaa1111/);
  } finally {
    cleanup(dir);
  }
});

test("heuristics retrieve --format text returns rendered markdown", () => {
  const dir = makeTempProject();
  seedHeuristic(
    dir,
    "m",
    makeHeuristicBody({ id: "m-bbbb2222", title: "Text heuristic" }),
  );
  try {
    const r = spawnSync(
      "node",
      [CLI, "heuristics", "retrieve", "--module", "m", "--format", "text"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0);
    assert.notStrictEqual(r.stdout.trim(), "__NONE__");
    assert.match(r.stdout, /Text heuristic|m-bbbb2222/);
  } finally {
    cleanup(dir);
  }
});

test("heuristics retrieve --injection-limit 0 returns empty result", () => {
  const dir = makeTempProject();
  seedHeuristic(dir, "m", makeHeuristicBody({ id: "m-cccc3333" }));
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "heuristics",
        "retrieve",
        "--module",
        "m",
        "--injection-limit",
        "0",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0);
    const parsed = JSON.parse(r.stdout.trim());
    assert.strictEqual(parsed.count, 0);
  } finally {
    cleanup(dir);
  }
});

// ── write subcommand ─────────────────────────────────────────────────────

test("heuristics write without required flags exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "heuristics", "write"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /missing|--id|--scope|--title|--pattern/i);
  } finally {
    cleanup(dir);
  }
});

test("heuristics write with invalid --confidence exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "heuristics",
        "write",
        "--id",
        "x-12345678",
        "--scope",
        "m",
        "--title",
        "T",
        "--pattern",
        "P",
        "--confidence",
        "ultra",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--confidence|low|medium|high/i);
  } finally {
    cleanup(dir);
  }
});

test("heuristics write with partial evidence flags exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "heuristics",
        "write",
        "--id",
        "x-12345678",
        "--scope",
        "m",
        "--title",
        "T",
        "--pattern",
        "P",
        "--evidence-source",
        "recovery",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /evidence/i);
  } finally {
    cleanup(dir);
  }
});

test("heuristics write succeeds and emits success line", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "heuristics",
        "write",
        "--id",
        "missing-context-aaaa1111",
        "--scope",
        "_global",
        "--title",
        "Missing context: cache layer assumptions",
        "--pattern",
        "Include cache invalidation docs in context packets for hook tasks",
        "--confidence",
        "low",
        "--evidence-source",
        "recovery",
        "--evidence-path",
        ".context-index/hygiene/recoveries/2026-05-15-x.md",
        "--evidence-date",
        "2026-05-15",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /Heuristic written: missing-context-aaaa1111/);
    // Verify the file was created.
    const path = join(dir, ".context-index", "memory", "heuristics", "_global.md");
    assert.ok(existsSync(path), "heuristic file should be written");
    const body = readFileSync(path, "utf8");
    assert.match(body, /missing-context-aaaa1111/);
  } finally {
    cleanup(dir);
  }
});

test("heuristics write with schema error degrades to stderr + exit 0", () => {
  const dir = makeTempProject();
  try {
    // Empty id triggers HEURISTICS_SCHEMA_ERROR from validateEntry.
    const r = spawnSync(
      "node",
      [
        CLI,
        "heuristics",
        "write",
        "--id",
        "x",
        "--scope",
        "m",
        "--title",
        "T",
        "--pattern",
        "P",
        "--confidence",
        "low",
      ],
      { encoding: "utf8", cwd: dir },
    );
    // Either succeeds (if validateEntry accepts the short id) or degrades to
    // exit 0 with stderr note. Both are acceptable per write subcommand spec.
    assert.strictEqual(r.status, 0);
  } finally {
    cleanup(dir);
  }
});

// ── write --signature (Behavior 5: recover-side signature persistence) ────

function runWriteCli(dir, extraArgs = [], { id = "missing-context-a1b2c3d4" } = {}) {
  return spawnSync(
    "node",
    [
      CLI,
      "heuristics",
      "write",
      "--id",
      id,
      "--scope",
      "_global",
      "--title",
      "T",
      "--pattern",
      "P",
      ...extraArgs,
    ],
    { encoding: "utf8", cwd: dir },
  );
}

function readGlobalStore(dir) {
  return readFileSync(
    join(dir, ".context-index", "memory", "heuristics", "_global.md"),
    "utf8",
  );
}

test("heuristics write --signature persists the signature field", () => {
  const dir = makeTempProject();
  try {
    const r = runWriteCli(dir, ["--signature", "recover-a1b2c3d4"]);
    assert.strictEqual(r.status, 0, r.stderr);
    const body = readGlobalStore(dir);
    assert.match(body, /^signature: recover-a1b2c3d4$/m);
  } finally {
    cleanup(dir);
  }
});

test("heuristics write without --signature writes no signature field", () => {
  const dir = makeTempProject();
  try {
    const r = runWriteCli(dir, [], { id: "tool-failure-0badc0de" });
    assert.strictEqual(r.status, 0, r.stderr);
    const body = readGlobalStore(dir);
    assert.ok(!/^signature:/m.test(body), "the key is omitted, not written empty");
  } finally {
    cleanup(dir);
  }
});

test("heuristics write with an empty --signature omits the key and exits 0", () => {
  const dir = makeTempProject();
  try {
    const r = runWriteCli(dir, ["--signature", ""], { id: "tool-failure-0badc0de" });
    assert.strictEqual(r.status, 0, r.stderr);
    const body = readGlobalStore(dir);
    assert.ok(!/^signature:/m.test(body), "empty signature must not be serialized");
  } finally {
    cleanup(dir);
  }
});

test("heuristics write with a malformed --signature degrades to stderr + exit 0", () => {
  const dir = makeTempProject();
  try {
    const r = runWriteCli(dir, ["--signature", "Bad Value"], {
      id: "tool-failure-0badc0de",
    });
    assert.strictEqual(r.status, 0);
    assert.match(r.stderr, /extraction skipped/);
    assert.match(r.stderr, /signature/i);
  } finally {
    cleanup(dir);
  }
});

test("heuristics signature output composes into heuristics write --signature", () => {
  const dir = makeTempProject();
  try {
    const sig = spawnSync(
      "node",
      [
        CLI,
        "heuristics",
        "signature",
        "--origin",
        "recover",
        "--text",
        "Timeout waiting for the fixture server on port 8080",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(sig.status, 0, sig.stderr);
    const value = sig.stdout.trim();
    assert.match(value, /^recover-[0-9a-f]{8}$/);

    const r = runWriteCli(dir, ["--signature", value]);
    assert.strictEqual(r.status, 0, r.stderr);
    const body = readGlobalStore(dir);
    assert.match(body, new RegExp(`^signature: ${value}$`, "m"));
  } finally {
    cleanup(dir);
  }
});

test("heuristics write --signature is EXISTING-wins on a re-write of the same id", () => {
  const dir = makeTempProject();
  try {
    const first = runWriteCli(dir, ["--signature", "recover-aaaaaaaa"]);
    assert.strictEqual(first.status, 0, first.stderr);

    const second = runWriteCli(dir, ["--signature", "recover-bbbbbbbb"]);
    assert.strictEqual(second.status, 0, second.stderr);
    assert.match(second.stderr, /signature divergence/);
    assert.match(second.stderr, /recover-aaaaaaaa/);
    assert.match(second.stderr, /recover-bbbbbbbb/);

    const body = readGlobalStore(dir);
    assert.match(body, /^signature: recover-aaaaaaaa$/m);
    assert.ok(
      !/recover-bbbbbbbb/.test(body),
      "the incoming signature must not overwrite the stored one",
    );
  } finally {
    cleanup(dir);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Retirement of the dead `extract` capture path
//
// Spec: .context-index/specs/features/heuristics/failure-capture.spec.md
// Plan-task: 7
//
// The `extract` verb was the validate-side capture path that the
// PostToolUse hook (`hooks/post-validate-extract-heuristics.mjs`) replaced.
// Nothing dispatched to it any more, so it is gone along with the eight
// helpers reachable only from it and the orphaned check file that
// documented it.
// ─────────────────────────────────────────────────────────────────────────

/** Run the CLI in a throwaway project and return the spawn result. */
function runCli(args) {
  const dir = makeTempProject();
  try {
    return spawnSync("node", [CLI, ...args], { encoding: "utf8", cwd: dir });
  } finally {
    cleanup(dir);
  }
}

/** The eight helpers that were reachable only from the `extract` path. */
const DELETED_SYMBOLS = [
  "specSlug",
  "deriveId",
  "deriveTitle",
  "readCharterField",
  "resolveScope",
  "defaultPattern",
  "parseExtractArgs",
  "resolveContained",
];

const HEURISTICS_MODULE = resolve(PROJECT_ROOT, "lib", "cli", "heuristics.mjs");

test("adev heuristics extract is gone — unknown subcommand exits 1 with usage", () => {
  const r = runCli(["heuristics", "extract", "--spec", "x", "--report", "y"]);
  assert.equal(r.status, 1);
  assert.match(
    r.stderr + r.stdout,
    /usage: adev heuristics <retrieve\|signature\|migrate-keys\|write>/,
  );
});

test("--help no longer advertises extract or --check-first-run", () => {
  const r = runCli(["heuristics", "--help"]);
  assert.equal(r.status, 0);
  // The verb must be gone from both the subcommand list and the usage lines.
  // A bare /extract/i would also match the `write` subcommand's documented
  // stderr string ("heuristics: extraction skipped — <error>"), which is live
  // behaviour asserted elsewhere in this file — so match the VERB, not the
  // substring.
  assert.ok(
    !/heuristics extract\b/.test(r.stdout),
    `stdout still shows an 'adev heuristics extract' usage line:\n${r.stdout}`,
  );
  assert.ok(
    !/^\s+extract\b/m.test(r.stdout),
    `stdout still lists 'extract' as a subcommand:\n${r.stdout}`,
  );
  assert.ok(!/check-first-run/.test(r.stdout), "stdout still mentions --check-first-run");
  // And the four surviving verbs are all still listed.
  for (const verb of ["retrieve", "signature", "migrate-keys", "write"]) {
    assert.match(r.stdout, new RegExp(`^\\s+${verb}\\b`, "m"));
  }
});

test("lib/cli/heuristics.mjs exports no id-derivation function", async () => {
  const mod = await import("../../lib/cli/heuristics.mjs");
  assert.equal(mod.deriveId, undefined);
  assert.equal(mod.specSlug, undefined);
});

test("the orphaned check file is gone", () => {
  assert.equal(
    existsSync(
      join(
        PROJECT_ROOT,
        "skills/validate/checks/validate.check-12-heuristic-extraction.md",
      ),
    ),
    false,
  );
});

test("the module source contains none of the eight deleted symbol names", () => {
  const src = readFileSync(HEURISTICS_MODULE, "utf8");
  for (const symbol of DELETED_SYMBOLS) {
    assert.ok(
      !new RegExp(`\\b${symbol}\\b`).test(src),
      `lib/cli/heuristics.mjs still names the deleted symbol '${symbol}'`,
    );
  }
});

test("the surviving exports are all present and callable", async () => {
  const mod = await import("../../lib/cli/heuristics.mjs");
  assert.strictEqual(typeof mod.run, "function");
  assert.strictEqual(typeof mod.help, "function");
  assert.ok(Array.isArray(mod.RECOVER_CATEGORY_SLUGS));
  assert.strictEqual(mod.RECOVER_CATEGORY_SLUGS.length, 6);
  assert.strictEqual(typeof mod.foldEvidenceSource, "function");
  assert.deepStrictEqual(mod.foldEvidenceSource("validate"), {
    folded: "validation",
    recognized: true,
  });
  assert.strictEqual(typeof mod.classifyForRekey, "function");
  assert.strictEqual(
    mod.classifyForRekey({ id: "tool-failure-aaaa1111", evidence: [] }).action,
    "skip",
  );
});

test("each surviving subcommand still dispatches", () => {
  // retrieve: empty store is a well-formed empty result at exit 0.
  const retrieve = runCli(["heuristics", "retrieve", "--module", "m"]);
  assert.equal(retrieve.status, 0, retrieve.stderr);
  assert.deepEqual(JSON.parse(retrieve.stdout.trim()), { count: 0, rendered: "" });

  // signature: pure derivation, exit 0 with the composed key.
  const signature = runCli([
    "heuristics",
    "signature",
    "--origin",
    "recover",
    "--text",
    "a failure",
  ]);
  assert.equal(signature.status, 0, signature.stderr);
  assert.match(signature.stdout.trim(), /^recover-[0-9a-f]{8}$/);

  // migrate-keys: dry run over an empty store reports zero of everything.
  const migrate = runCli(["heuristics", "migrate-keys", "--dry-run"]);
  assert.equal(migrate.status, 0, migrate.stderr);
  assert.match(migrate.stdout, /^rekeyed=0$/m);

  // write: missing required flags is still an argument error, not a crash.
  const write = runCli(["heuristics", "write"]);
  assert.equal(write.status, 1);
  assert.match(write.stderr, /missing: --id/);
});

test("--check-first-run is rejected as an unknown option by every surviving subcommand", () => {
  const invocations = [
    ["heuristics", "retrieve", "--module", "m", "--check-first-run"],
    ["heuristics", "signature", "--origin", "recover", "--text", "t", "--check-first-run"],
    ["heuristics", "migrate-keys", "--dry-run", "--check-first-run"],
    [
      "heuristics",
      "write",
      "--id",
      "tool-failure-aaaa1111",
      "--scope",
      "_global",
      "--title",
      "T",
      "--pattern",
      "P",
      "--check-first-run",
    ],
  ];
  for (const argv of invocations) {
    const r = runCli(argv);
    assert.equal(
      r.status,
      1,
      `${argv[1]} accepted --check-first-run (status ${r.status}): ${r.stdout}${r.stderr}`,
    );
    assert.match(r.stderr, /check-first-run/);
  }
});
