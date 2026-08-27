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
  readdirSync,
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

test("heuristics retrieve honours manifest heuristics.injection_limit with no --injection-limit flag", () => {
  const dir = makeTempProject();
  // Three high-confidence entries in one scope file, header once, blocks concatenated.
  const blocks = ["h0", "h1", "h2"]
    .map((id) =>
      makeHeuristicBody({ id: `m-${id}aaa111`, title: `High ${id}`, confidence: "high" }).replace(
        /^# Heuristics \(scope: m\)\n\n/,
        "",
      ),
    )
    .join("");
  seedHeuristic(dir, "m", `# Heuristics (scope: m)\n\n${blocks}`);
  writeFileSync(
    join(dir, ".context-index", "manifest.yaml"),
    'project:\n  name: t\n  adev_version: "0.22.0"\nheuristics:\n  injection_limit: 2\n',
  );
  try {
    const r = spawnSync(
      "node",
      [CLI, "heuristics", "retrieve", "--module", "m"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0);
    const parsed = JSON.parse(r.stdout.trim());
    // highMax = ceil(2*5/8) = 2 — the manifest key caps the budget below the
    // 3 seeded entries. Before this fix the manifest key was never read and
    // this returned 3 (the hardcoded default-8 budget was never exceeded).
    assert.strictEqual(parsed.count, 2);
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

// ── Task 8: dangling-reference sweep ────────────────────────────────────────
//
// Scope is deliberately EXACTLY `docs/` and `lib/`. `.context-index/` still
// contains the strings `heuristics extract` and `--check-first-run` on
// purpose — the failure-capture charter, this spec, the superseded
// cli-driver-surface acceptance criterion, research artifacts and session
// logs all record the retired verb as history. Scanning `.context-index/`
// would fail forever and would pressure a future author to erase that record.

const SCAN_DIRS = ["docs", "lib"];
const SCAN_EXTS = new Set([".md", ".mjs", ".js"]);

/** Walk SCAN_DIRS and return every `file:line` whose text matches `pattern`. */
function grepRepo(pattern, dirs = SCAN_DIRS) {
  const hits = [];
  const walk = (abs, rel) => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const childAbs = join(abs, entry.name);
      const childRel = `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(childAbs, childRel);
        continue;
      }
      const dot = entry.name.lastIndexOf(".");
      if (dot < 0 || !SCAN_EXTS.has(entry.name.slice(dot))) continue;
      const lines = readFileSync(childAbs, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (pattern.test(line)) hits.push(`${childRel}:${i + 1}`);
      });
    }
  };
  for (const dir of dirs) walk(resolve(PROJECT_ROOT, dir), dir);
  return hits;
}

test("no reference to the removed verb remains in docs/ or lib/", () => {
  const hits = grepRepo(/heuristics extract|--check-first-run/);
  assert.deepEqual(hits, [], `dangling references: ${hits.join(", ")}`);
});

test("docs/cli-reference.md documents all four surviving heuristics subcommands", () => {
  const doc = readFileSync(resolve(PROJECT_ROOT, "docs", "cli-reference.md"), "utf8");
  const section = doc.slice(doc.indexOf("### `heuristics`"));
  const entry = section.slice(0, section.indexOf("### `domain`"));

  for (const sub of ["retrieve", "signature", "write", "migrate-keys"]) {
    assert.ok(
      entry.includes(`heuristics ${sub}`),
      `docs/cli-reference.md heuristics entry omits the '${sub}' subcommand`,
    );
  }
  for (const flag of ["--digest-only", "--signature"]) {
    assert.ok(entry.includes(flag), `heuristics entry omits the ${flag} flag`);
  }
  assert.ok(
    !/\bExtract\b/.test(entry),
    "heuristics **Purpose:** still advertises the retired Extract capability",
  );
});

test("validated-without-report.mjs names exactly two .validate.md call sites", () => {
  const src = readFileSync(
    resolve(PROJECT_ROOT, "lib", "diagnostics", "tier2", "validated-without-report.mjs"),
    "utf8",
  );
  assert.ok(
    /Two call sites derive/.test(src),
    "the SA-13 ownership note must say 'Two call sites derive', not 'Three'",
  );
  assert.ok(!/Three call sites/.test(src), "stale 'Three call sites' prose remains");
  assert.ok(
    !/lib\/cli\/heuristics\.mjs/.test(src),
    "stale lib/cli/heuristics.mjs call site remains",
  );
  const numbered = src.match(/^ \* {3}\d\. /gm) ?? [];
  assert.equal(
    numbered.length,
    2,
    `expected 2 numbered call sites in the ownership note, found ${numbered.length}`,
  );
  assert.ok(
    /^ \* {3}1\. /m.test(src) && /^ \* {3}2\. /m.test(src),
    "the surviving call sites are not renumbered 1, 2",
  );
  assert.ok(
    !/one of\s*\n \* the three\b/.test(src),
    "prose still says 'one of the three'",
  );
});

test("the superseded cli-driver-surface criterion is annotated, not deleted", () => {
  const sweepPath = resolve(
    PROJECT_ROOT,
    ".context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md",
  );
  const lines = readFileSync(sweepPath, "utf8").split("\n");

  // The criterion must still EXIST as a bullet — it is another charter's
  // record and must stay readable, only marked as falsified.
  const criterion = lines.find((l) =>
    l.startsWith("- [ ] PR 1 extracts Check 13 heuristic extraction"),
  );
  assert.ok(criterion, "the PR 1 acceptance criterion was deleted rather than annotated");
  assert.ok(
    criterion.includes("`adev heuristics extract` works"),
    "the original claim text must remain visible (struck through), not erased",
  );
  assert.ok(
    criterion.includes("failure-capture.spec.md"),
    "the superseding spec is not named on the criterion",
  );
  assert.ok(criterion.includes("~~"), "the falsified claim is not marked struck through");

  // Exactly one line changed in place: the file's line count is unchanged (±1).
  assert.ok(
    Math.abs(lines.length - 105) <= 1,
    `sweep spec line count drifted to ${lines.length}; expected 104-105 (one line edited in place)`,
  );

  // The Task Map row naming lib/cli/heuristics.mjs records what PR 1 shipped
  // ("paired test") and remains true — it is not this task's to edit.
  assert.ok(
    lines.some((l) => l.startsWith("| PR 1 — Extract Check 13")),
    "the PR 1 Task Map row was modified or removed",
  );
});
