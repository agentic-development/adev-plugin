/**
 * Tests for `adev init prompt implement-rigor` (BEH-12).
 *
 * A spawned child's piped stdin is never a TTY, so interactive cases run the
 * child with a preload that sets `process.stdin.isTTY = true`. Everything else
 * is real: answers arrive on a genuine pipe and go through `cli/index.mjs`
 * dispatch and the readline async iterator. The one exception is an answer
 * that itself contains a newline, which a pipe would split into two lines; it
 * is fed through the verb's `__scriptedInput` seam in a child process instead.
 *
 * Every child is spawned with a 10 s timeout, and `finish()` fails the test
 * when that timeout killed it, so a prompt that never returns cannot hang the
 * suite.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

import { createTempDir, cleanupTempDir, writeFixture, PLUGIN_ROOT } from "../helpers.mjs";

const POLICIES_REL = ".context-index/governance/risk-policies.yaml";
const CLI = join(PLUGIN_ROOT, "cli", "index.mjs");
const VERB = join(PLUGIN_ROOT, "lib", "cli", "init-prompt-implement-rigor.mjs");
const CHILD_TIMEOUT_MS = 10_000;

const ORIGINAL_TEXT = [
  "# risk-policies.yaml — fixture",
  "policies:",
  "  high:",
  "    require_review: true",
  "    review_mode: full",
  "    validate_mode: full",
  "    implement_mode: quick",
  "    test_depth: thorough",
  "  medium:",
  "    require_review: true",
  "    review_mode: full",
  "    validate_mode: full",
  "    implement_mode: quick   # medium baseline",
  "    test_depth: standard",
  "  low:",
  "    require_review: true",
  "    review_mode: quick",
  "    validate_mode: quick",
  "    implement_mode: quick",
  "    test_depth: minimal",
  "",
].join("\n");

const ORIGINAL = {
  high: { review_mode: "full", implement_mode: "quick" },
  medium: { review_mode: "full", implement_mode: "quick" },
  low: { review_mode: "quick", implement_mode: "quick" },
};

const NO_IMPLEMENT_MODE_TEXT = ORIGINAL_TEXT.split("\n")
  .filter((l) => !/implement_mode:/.test(l))
  .join("\n");

function fixture(t, { preset, policies = ORIGINAL_TEXT } = {}) {
  const root = createTempDir();
  t.after(() => cleanupTempDir(root));
  const manifest = ["project:", "  name: fixture"];
  if (preset) manifest.push(`risk_tier: ${preset}`);
  writeFixture(root, ".context-index/manifest.yaml", `${manifest.join("\n")}\n`);
  if (policies !== null) writeFixture(root, POLICIES_REL, policies);
  writeFixture(root, "tty-shim.mjs", "process.stdin.isTTY = true;\n");
  return root;
}

function finish(r) {
  assert.notEqual(r.signal, "SIGTERM", `verb hung until the timeout: ${r.stdout}${r.stderr}`);
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

// `answers` → scripted seam (one array element per answer, newlines intact);
// `stdin` → real pipe through cli/index.mjs dispatch.
function run(root, argv, { tty = false, answers, stdin = "" } = {}) {
  if (answers !== undefined) {
    const script = [
      `process.stdin.isTTY = ${tty ? "true" : "false"};`,
      `const mod = await import(${JSON.stringify(pathToFileURL(VERB).href)});`,
      `await mod.run({ projectRoot: ${JSON.stringify(root)}, argv: ${JSON.stringify(argv)}, manifest: null, __scriptedInput: ${JSON.stringify(answers)} });`,
    ].join("\n");
    return finish(
      spawnSync(process.execPath, ["--input-type=module", "-e", script], {
        cwd: root, input: "", encoding: "utf8", timeout: CHILD_TIMEOUT_MS,
      }),
    );
  }
  const preload = tty ? ["--import", pathToFileURL(join(root, "tty-shim.mjs")).href] : [];
  return finish(
    spawnSync(process.execPath, [...preload, CLI, "init", "prompt", "implement-rigor", ...argv], {
      cwd: root, input: stdin, encoding: "utf8", timeout: CHILD_TIMEOUT_MS,
    }),
  );
}

function policiesText(root) {
  return readFileSync(join(root, POLICIES_REL), "utf8");
}

// Reads `<level>.<key>` scalars from the fixture shape, independent of the verb.
function parsePolicies(root) {
  const out = {};
  let level = null;
  for (const line of policiesText(root).split("\n")) {
    const header = line.match(/^ {2}(high|medium|low):\s*$/);
    if (header) {
      level = header[1];
      out[level] = {};
      continue;
    }
    const kv = line.match(/^ {4}([a-z_]+):\s*([^#\s]+)/);
    if (kv && level) out[level][kv[1]] = kv[2];
  }
  return out;
}

function withImplementMode(text, byLevel) {
  let level = null;
  return text
    .split("\n")
    .map((line) => {
      const header = line.match(/^ {2}(high|medium|low):\s*$/);
      if (header) level = header[1];
      if (level && byLevel[level] && /^ {4}implement_mode:/.test(line)) {
        return line.replace(/implement_mode: \S+/, `implement_mode: ${byLevel[level]}`);
      }
      return line;
    })
    .join("\n");
}

function countPrompts(stdout) {
  return stdout.split("Choose implement rigor").length - 1;
}

test("typed exact-case choice writes the enum constant to medium and low only", (t) => {
  const root = fixture(t, { preset: "standard" });
  const r = run(root, [], { tty: true, stdin: "quick\n" });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(countPrompts(r.stdout), 1);
  assert.match(r.stdout, /Wrote: implement_mode: quick \(medium, low\)/);
  const p = parsePolicies(root);
  assert.equal(p.medium.implement_mode, "quick");
  assert.equal(p.low.implement_mode, "quick");
  assert.equal(p.high.implement_mode, "quick");
  assert.equal(p.medium.review_mode, ORIGINAL.medium.review_mode);
  assert.equal(p.low.review_mode, ORIGINAL.low.review_mode);
  assert.equal(policiesText(root), ORIGINAL_TEXT, "a same-value write must leave every byte unchanged");
});

test("a typed lite after a refused Lite and a blank line is written to medium and low, high untouched", (t) => {
  const root = fixture(t, { preset: "standard" });
  const r = run(root, [], { tty: true, stdin: "Lite\n\nlite\n" });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(countPrompts(r.stdout), 3);
  assert.equal(
    policiesText(root),
    withImplementMode(ORIGINAL_TEXT, { medium: "lite", low: "lite" }),
    "only the medium and low implement_mode values change; comments and other keys survive",
  );
});

test('Lite, blank, and "lite\\nhigh: full" are refused and re-prompted', (t) => {
  const root = fixture(t, { preset: "standard" });
  const r = run(root, [], { tty: true, answers: ["Lite", "", "lite\nhigh: full"] });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /INVALID_IMPLEMENT_RIGOR/);
  assert.equal(countPrompts(r.stdout), 3);
  assert.equal(policiesText(root), ORIGINAL_TEXT);
});

test("three invalid answers / closed input / exhausted answers → exit 1, nothing written", async (t) => {
  await t.test("three invalid answers stop the prompt before a fourth valid one is read", () => {
    const root = fixture(t, { preset: "standard" });
    const r = run(root, [], { tty: true, stdin: "Quick\nFULL\nnope\nfull\n" });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /INVALID_IMPLEMENT_RIGOR/);
    assert.equal(countPrompts(r.stdout), 3);
    assert.equal(policiesText(root), ORIGINAL_TEXT);
  });

  await t.test("input closed before any answer", () => {
    const root = fixture(t, { preset: "standard" });
    const r = run(root, [], { tty: true, stdin: "" });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /INVALID_IMPLEMENT_RIGOR/);
    assert.equal(policiesText(root), ORIGINAL_TEXT);
  });

  await t.test("scripted answers run out after one invalid answer", () => {
    const root = fixture(t, { preset: "standard" });
    const r = run(root, [], { tty: true, answers: ["Lite"] });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /INVALID_IMPLEMENT_RIGOR/);
    assert.equal(countPrompts(r.stdout), 2);
    assert.equal(policiesText(root), ORIGINAL_TEXT);
  });
});

test("--mode bogus → INVALID_IMPLEMENT_RIGOR, no prompt shown", async (t) => {
  for (const argv of [["--mode", "bogus"], ["--mode", "Quick"], ["--mode", "lite\nhigh: full"], ["--mode"]]) {
    await t.test(JSON.stringify(argv), () => {
      const root = fixture(t, { preset: "standard" });
      const r = run(root, argv, { tty: true });
      assert.equal(r.code, 1);
      assert.match(r.stderr, /INVALID_IMPLEMENT_RIGOR/);
      assert.equal(countPrompts(r.stdout), 0);
      assert.equal(policiesText(root), ORIGINAL_TEXT);
    });
  }
});

test("choosing lite prints the warning first; choosing full also writes high", async (t) => {
  await t.test("--mode lite warns before the write", () => {
    const root = fixture(t, { preset: "standard" });
    const r = run(root, ["--mode", "lite"]);
    assert.equal(r.code, 0, r.stderr);
    const warnIdx = r.stdout.indexOf("[lite warning]");
    const wroteIdx = r.stdout.indexOf("Wrote:");
    assert.ok(warnIdx > -1, `expected the lite warning: ${r.stdout}`);
    assert.ok(wroteIdx > warnIdx, "the warning must print before the write line");
    assert.match(r.stdout, /per-task review is skipped for route-eligible tasks/);
    assert.match(r.stdout, /deferred to \/adev:validate/);
    assert.equal(countPrompts(r.stdout), 0);
    assert.equal(policiesText(root), withImplementMode(ORIGINAL_TEXT, { medium: "lite", low: "lite" }));
  });

  await t.test("typed full writes high, medium and low", () => {
    const root = fixture(t, { preset: "standard" });
    const r = run(root, [], { tty: true, stdin: "full\n" });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout.indexOf("[lite warning]"), -1);
    assert.equal(
      policiesText(root),
      withImplementMode(ORIGINAL_TEXT, { high: "full", medium: "full", low: "full" }),
    );
  });

  await t.test("--mode quick on a strict project leaves high at full", () => {
    const root = fixture(t, {
      preset: "strict",
      policies: withImplementMode(ORIGINAL_TEXT, { high: "full", medium: "full", low: "full" }),
    });
    const r = run(root, ["--mode", "quick"]);
    assert.equal(r.code, 0, r.stderr);
    const p = parsePolicies(root);
    assert.deepEqual(
      [p.high.implement_mode, p.medium.implement_mode, p.low.implement_mode],
      ["full", "quick", "quick"],
    );
  });
});

test("non-interactive: existing value kept; preset defaults strict→full, standard→quick, prototype→quick; prints --mode lite hint", async (t) => {
  await t.test("an existing implement_mode is never overwritten", () => {
    const seeded = withImplementMode(ORIGINAL_TEXT, { medium: "full", low: "lite" });
    const root = fixture(t, { preset: "strict", policies: seeded });
    const r = run(root, []);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(countPrompts(r.stdout), 0);
    assert.equal(policiesText(root), seeded);
    assert.match(r.stdout, /--mode lite/);
  });

  const cases = [
    { name: "strict", preset: "strict", argv: [], expected: { high: "full", medium: "full", low: "full" } },
    { name: "standard", preset: "standard", argv: [], expected: { high: undefined, medium: "quick", low: "quick" } },
    { name: "prototype", preset: "prototype", argv: [], expected: { high: undefined, medium: "quick", low: "quick" } },
    { name: "no risk_tier falls back to standard", preset: undefined, argv: [], expected: { high: undefined, medium: "quick", low: "quick" } },
    { name: "--preset outranks the manifest risk_tier", preset: "standard", argv: ["--preset", "strict"], expected: { high: "full", medium: "full", low: "full" } },
  ];
  for (const c of cases) {
    await t.test(c.name, () => {
      const root = fixture(t, { preset: c.preset, policies: NO_IMPLEMENT_MODE_TEXT });
      const r = run(root, c.argv);
      assert.equal(r.code, 0, r.stderr);
      assert.equal(countPrompts(r.stdout), 0);
      assert.match(r.stdout, /lite is available through --mode lite/);
      const p = parsePolicies(root);
      assert.deepEqual(
        { high: p.high.implement_mode, medium: p.medium.implement_mode, low: p.low.implement_mode },
        c.expected,
      );
      assert.equal(p.medium.review_mode, ORIGINAL.medium.review_mode);
      assert.equal(p.high.test_depth, "thorough");
    });
  }

  await t.test("a missing risk-policies.yaml is not created for a quick default", () => {
    const root = fixture(t, { preset: "prototype", policies: null });
    const r = run(root, []);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(existsSync(join(root, POLICIES_REL)), false);
    assert.match(r.stdout, /lite is available through --mode lite/);
  });

  await t.test("a missing risk-policies.yaml is created for the strict full default", () => {
    const root = fixture(t, { preset: "strict", policies: null });
    const r = run(root, []);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(
      policiesText(root),
      "policies:\n  high:\n    implement_mode: full\n  medium:\n    implement_mode: full\n  low:\n    implement_mode: full\n",
    );
  });

  await t.test("per level: medium kept, missing low filled", () => {
    const seeded = "policies:\n  medium:\n    implement_mode: lite\n  low:\n    review_mode: full\n";
    const root = fixture(t, { preset: "standard", policies: seeded });
    const r = run(root, []);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /Wrote: implement_mode: quick \(low\)/);
    assert.equal(
      policiesText(root),
      "policies:\n  medium:\n    implement_mode: lite\n  low:\n    implement_mode: quick\n    review_mode: full\n",
    );
  });

  await t.test("--preset bogus is refused and nothing is written", () => {
    const root = fixture(t, { preset: "standard", policies: NO_IMPLEMENT_MODE_TEXT });
    const r = run(root, ["--preset", "bogus"]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /--preset/);
    assert.equal(policiesText(root), NO_IMPLEMENT_MODE_TEXT);
  });
});

test("an explicit or typed choice creates a missing risk-policies.yaml", async (t) => {
  const cases = [
    { name: "--mode lite", argv: ["--mode", "lite"], opts: {}, mode: "lite" },
    { name: "typed lite", argv: [], opts: { tty: true, stdin: "lite\n" }, mode: "lite" },
    { name: "--mode quick", argv: ["--mode", "quick"], opts: {}, mode: "quick" },
  ];
  for (const c of cases) {
    await t.test(c.name, () => {
      const root = fixture(t, { preset: "standard", policies: null });
      const r = run(root, c.argv, c.opts);
      assert.equal(r.code, 0, r.stderr);
      assert.match(r.stdout, new RegExp(`Wrote: implement_mode: ${c.mode} \\(medium, low\\)`));
      assert.equal(
        policiesText(root),
        `policies:\n  medium:\n    implement_mode: ${c.mode}\n  low:\n    implement_mode: ${c.mode}\n`,
      );
    });
  }
});

test("--mode full replacing an illegal high: lite says so", (t) => {
  const seeded = "policies:\n  high:\n    implement_mode: lite\n  medium:\n    implement_mode: quick\n";
  const root = fixture(t, { preset: "standard", policies: seeded });
  const r = run(root, ["--mode", "full"]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Replaced illegal high\.implement_mode: lite with full/);
  assert.equal(
    policiesText(root),
    "policies:\n  high:\n    implement_mode: full\n  medium:\n    implement_mode: full\n  low:\n    implement_mode: full\n",
  );
});

test("an interactive lite choice prints the warning before the write", (t) => {
  const root = fixture(t, { preset: "standard" });
  const r = run(root, [], { tty: true, stdin: "lite\n" });
  assert.equal(r.code, 0, r.stderr);
  const promptIdx = r.stdout.indexOf("Choose implement rigor");
  const warnIdx = r.stdout.indexOf("[lite warning]");
  const wroteIdx = r.stdout.indexOf("Wrote: implement_mode: lite (medium, low)");
  assert.ok(promptIdx > -1 && warnIdx > promptIdx, `warning must follow the prompt: ${r.stdout}`);
  assert.ok(wroteIdx > warnIdx, "the warning must print before the write line");
  assert.equal(policiesText(root), withImplementMode(ORIGINAL_TEXT, { medium: "lite", low: "lite" }));
});

test("a layout the splice cannot edit faithfully is refused and left byte-identical", async (t) => {
  const layouts = {
    "flow-style level": "policies:\n  high: { implement_mode: quick }\n  medium: { review_mode: full, implement_mode: quick }\n  low:\n    implement_mode: quick\n",
    "flow-style policies": "policies: {}\n",
    "unparseable YAML": "defaults: &d\n  implement_mode: full\npolicies:\n  medium:\n    <<: *d\n",
  };
  for (const [name, text] of Object.entries(layouts)) {
    await t.test(name, () => {
      const root = fixture(t, { preset: "standard", policies: text });
      const r = run(root, ["--mode", "full"]);
      assert.equal(r.code, 1);
      assert.match(r.stderr, /INVALID_IMPLEMENT_RIGOR/);
      assert.match(r.stderr, /nothing was written/);
      assert.equal(policiesText(root), text);
    });
  }
});

test("splice output: empty value with a comment, line endings and the trailing newline", async (t) => {
  const cases = [
    {
      name: "empty value keeps a space before its comment",
      before: "policies:\n  medium:\n    implement_mode:   # empty\n    review_mode: full\n  low:\n    implement_mode: quick\n",
      after: "policies:\n  medium:\n    implement_mode: lite # empty\n    review_mode: full\n  low:\n    implement_mode: lite\n",
      mode: "lite",
    },
    {
      name: "a file without policies gains a block and keeps its trailing newline",
      before: "version: 1\n",
      after: "version: 1\npolicies:\n  medium:\n    implement_mode: quick\n  low:\n    implement_mode: quick\n",
      mode: "quick",
    },
    {
      name: "CRLF line endings are kept",
      before: "policies:\r\n  medium:\r\n    implement_mode: full\r\n  low:\r\n    implement_mode: full\r\n",
      after: "policies:\r\n  medium:\r\n    implement_mode: quick\r\n  low:\r\n    implement_mode: quick\r\n",
      mode: "quick",
    },
    {
      name: "a file without a final newline gains none",
      before: "policies:\n  medium:\n    implement_mode: full\n  low:\n    implement_mode: full",
      after: "policies:\n  medium:\n    implement_mode: quick\n  low:\n    implement_mode: quick",
      mode: "quick",
    },
  ];
  for (const c of cases) {
    await t.test(c.name, () => {
      const root = fixture(t, { preset: "standard", policies: c.before });
      const r = run(root, ["--mode", c.mode]);
      assert.equal(r.code, 0, r.stderr);
      assert.equal(policiesText(root), c.after);
    });
  }
});

test("unknown flags, --flag=value forms and repeated flags are refused", async (t) => {
  for (const argv of [["--mode=lite"], ["--preset=strict"], ["--bogus"], ["quick"], ["--mode", "quick", "--mode", "lite"]]) {
    await t.test(JSON.stringify(argv), () => {
      const root = fixture(t, { preset: "standard" });
      const r = run(root, argv, { tty: true });
      assert.equal(r.code, 1);
      assert.match(r.stderr, /INVALID_IMPLEMENT_RIGOR/);
      assert.equal(countPrompts(r.stdout), 0);
      assert.equal(policiesText(root), ORIGINAL_TEXT);
    });
  }
});

test("reachable through cli/index.mjs dispatch", (t) => {
  const root = fixture(t, { preset: "standard", policies: NO_IMPLEMENT_MODE_TEXT });
  const r = spawnSync(process.execPath, [CLI, "init", "prompt", "implement-rigor", "--mode", "quick"], {
    cwd: root, encoding: "utf8", timeout: CHILD_TIMEOUT_MS,
  });
  assert.notEqual(r.signal, "SIGTERM");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Wrote: implement_mode: quick/);
  const p = parsePolicies(root);
  assert.equal(p.medium.implement_mode, "quick");
  assert.equal(p.low.implement_mode, "quick");
  assert.equal(p.high.implement_mode, undefined);
});
