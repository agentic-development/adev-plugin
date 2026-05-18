import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "node:os";

let parseUserConfig, resolvePersona, loadPersonaDirective, loadVerbosityOverlay;

async function loadModule() {
  const mod = await import("../lib/persona.mjs");
  parseUserConfig = mod.parseUserConfig;
  resolvePersona = mod.resolvePersona;
  loadPersonaDirective = mod.loadPersonaDirective;
  loadVerbosityOverlay = mod.loadVerbosityOverlay;
}

// Use OS tmpdir (not under tests/) to avoid cleanup races with adapter tests
// that copy the tests/ tree.
const TMP = join(tmpdir(), `adev-persona-test-${process.pid}`);

function setup() {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(join(TMP, "templates", "personas"), { recursive: true });
  mkdirSync(join(TMP, "templates", "verbosity"), { recursive: true });
  writeFileSync(
    join(TMP, "templates", "personas", "developer.md"),
    "# Developer Persona\nBalanced output."
  );
  writeFileSync(
    join(TMP, "templates", "personas", "product.md"),
    "# Product Persona\nSimplified output."
  );
  writeFileSync(
    join(TMP, "templates", "personas", "architect.md"),
    "# Architect Persona\nFull detail output."
  );
  writeFileSync(
    join(TMP, "templates", "verbosity", "terse.md"),
    "# Verbosity: Terse\nAnti-Redundancy clause."
  );
  writeFileSync(
    join(TMP, "templates", "verbosity", "normal.md"),
    "# Verbosity: Normal\nAnti-Redundancy clause."
  );
  writeFileSync(
    join(TMP, "templates", "verbosity", "deep.md"),
    "# Verbosity: Deep\nAnti-Redundancy clause."
  );
}

function cleanup() {
  rmSync(TMP, { recursive: true, force: true });
}

describe("parseUserConfig", () => {
  beforeEach(async () => {
    await loadModule();
    setup();
  });
  afterEach(cleanup);

  it("parses key=value lines", () => {
    const file = join(TMP, "config");
    writeFileSync(file, "persona=architect\n");
    const result = parseUserConfig(file);
    assert.equal(result.persona, "architect");
  });

  it("ignores comments and blank lines", () => {
    const file = join(TMP, "config");
    writeFileSync(file, "# comment\n\npersona=developer\n");
    const result = parseUserConfig(file);
    assert.equal(result.persona, "developer");
  });

  it("takes everything after first = as value", () => {
    const file = join(TMP, "config");
    writeFileSync(file, "key=value=with=equals\n");
    const result = parseUserConfig(file);
    assert.equal(result.key, "value=with=equals");
  });

  it("returns empty object for malformed files", () => {
    const file = join(TMP, "config");
    writeFileSync(file, "no equals here\njust lines\n");
    const result = parseUserConfig(file);
    assert.deepEqual(result, {});
  });

  it("returns empty object for nonexistent file", () => {
    const result = parseUserConfig(join(TMP, "nonexistent"));
    assert.deepEqual(result, {});
  });

  it("does not interpret \\n literals in values", () => {
    const file = join(TMP, "config");
    writeFileSync(file, "persona=dev\\ntest\n");
    const result = parseUserConfig(file);
    assert.equal(result.persona, "dev\\ntest");
  });
});

describe("resolvePersona", () => {
  beforeEach(async () => {
    await loadModule();
    setup();
  });
  afterEach(cleanup);

  it("returns developer when no config files exist", () => {
    const result = resolvePersona({
      localConfigPath: join(TMP, "nonexistent-local"),
      globalConfigPath: join(TMP, "nonexistent-global"),
      templatesDir: join(TMP, "templates", "personas"),
    });
    assert.equal(result.name, "developer");
    assert.equal(result.source, "fallback");
    assert.equal(result.warnings.length, 0);
  });

  it("returns global config value when only global exists", () => {
    writeFileSync(join(TMP, "global-config"), "persona=architect\n");
    const result = resolvePersona({
      localConfigPath: join(TMP, "nonexistent-local"),
      globalConfigPath: join(TMP, "global-config"),
      templatesDir: join(TMP, "templates", "personas"),
    });
    assert.equal(result.name, "architect");
    assert.equal(result.source, "global");
  });

  it("returns local config value when both exist", () => {
    writeFileSync(join(TMP, "global-config"), "persona=architect\n");
    writeFileSync(join(TMP, "local-config"), "persona=product\n");
    const result = resolvePersona({
      localConfigPath: join(TMP, "local-config"),
      globalConfigPath: join(TMP, "global-config"),
      templatesDir: join(TMP, "templates", "personas"),
    });
    assert.equal(result.name, "product");
    assert.equal(result.source, "local");
  });

  it("rejects persona names with forward slash and warns", () => {
    writeFileSync(join(TMP, "local-config"), "persona=../../etc/passwd\n");
    const result = resolvePersona({
      localConfigPath: join(TMP, "local-config"),
      globalConfigPath: join(TMP, "nonexistent"),
      templatesDir: join(TMP, "templates", "personas"),
    });
    assert.equal(result.name, "developer");
    assert.equal(result.source, "fallback");
    assert.ok(result.warnings.length > 0);
    assert.ok(result.warnings[0].includes("path separators"));
  });

  it("rejects persona names with backslash and warns", () => {
    writeFileSync(join(TMP, "local-config"), "persona=..\\etc\\passwd\n");
    const result = resolvePersona({
      localConfigPath: join(TMP, "local-config"),
      globalConfigPath: join(TMP, "nonexistent"),
      templatesDir: join(TMP, "templates", "personas"),
    });
    assert.equal(result.name, "developer");
    assert.equal(result.source, "fallback");
    assert.ok(result.warnings.length > 0);
  });

  it("rejects persona names with ..", () => {
    writeFileSync(join(TMP, "local-config"), "persona=..developer\n");
    const result = resolvePersona({
      localConfigPath: join(TMP, "local-config"),
      globalConfigPath: join(TMP, "nonexistent"),
      templatesDir: join(TMP, "templates", "personas"),
    });
    assert.equal(result.name, "developer");
    assert.equal(result.source, "fallback");
  });

  it("falls back to developer for unknown persona names and warns", () => {
    writeFileSync(join(TMP, "local-config"), "persona=unknown-role\n");
    const result = resolvePersona({
      localConfigPath: join(TMP, "local-config"),
      globalConfigPath: join(TMP, "nonexistent"),
      templatesDir: join(TMP, "templates", "personas"),
    });
    assert.equal(result.name, "developer");
    assert.equal(result.source, "fallback");
    assert.ok(result.warnings.length > 0);
    assert.ok(result.warnings[0].includes("Unknown persona"));
    assert.ok(result.warnings[0].includes("unknown-role"));
  });

  it("treats empty persona value as absent", () => {
    writeFileSync(join(TMP, "local-config"), "persona=\n");
    writeFileSync(join(TMP, "global-config"), "persona=architect\n");
    const result = resolvePersona({
      localConfigPath: join(TMP, "local-config"),
      globalConfigPath: join(TMP, "global-config"),
      templatesDir: join(TMP, "templates", "personas"),
    });
    assert.equal(result.name, "architect");
    assert.equal(result.source, "global");
  });
});

describe("loadPersonaDirective", () => {
  beforeEach(async () => {
    await loadModule();
    setup();
  });
  afterEach(cleanup);

  it("returns template content for valid persona", () => {
    const result = loadPersonaDirective(
      "developer",
      join(TMP, "templates", "personas")
    );
    assert.ok(result.content);
    assert.ok(result.content.includes("Developer Persona"));
    assert.equal(result.warnings.length, 0);
  });

  it("falls back to developer.md when template missing and warns", () => {
    const result = loadPersonaDirective(
      "nonexistent",
      join(TMP, "templates", "personas")
    );
    assert.ok(result.content);
    assert.ok(result.content.includes("Developer Persona"));
    assert.ok(result.warnings.length > 0);
    assert.ok(result.warnings[0].includes("not found"));
  });

  it("returns null when templates dir missing and warns", () => {
    const result = loadPersonaDirective("developer", join(TMP, "no-such-dir"));
    assert.equal(result.content, null);
    assert.ok(result.warnings.length > 0);
  });

  it("warning messages do not contain full filesystem paths", () => {
    const result = loadPersonaDirective(
      "nonexistent",
      join(TMP, "templates", "personas")
    );
    for (const w of result.warnings) {
      // Warnings should not contain absolute paths (starting with /)
      assert.ok(!w.startsWith("/"), `Warning contains absolute path: ${w}`);
      assert.ok(
        !w.includes(TMP),
        `Warning contains temp dir path: ${w}`
      );
    }
  });
});

// ============================================================================
// Task 4: Verbosity axis — loadVerbosityOverlay, parseUserConfig.verbosity,
//   resolvePersona additive return shape, per-persona defaults
// ============================================================================

describe("loadVerbosityOverlay", () => {
  beforeEach(async () => {
    await loadModule();
    setup();
  });
  afterEach(cleanup);

  it("returns overlay content for valid name 'terse'", () => {
    const result = loadVerbosityOverlay(
      "terse",
      join(TMP, "templates", "verbosity")
    );
    assert.ok(result.content);
    assert.ok(result.content.includes("Anti-Redundancy"));
    assert.equal(result.warnings.length, 0);
  });

  it("returns overlay content for valid name 'normal'", () => {
    const result = loadVerbosityOverlay(
      "normal",
      join(TMP, "templates", "verbosity")
    );
    assert.ok(result.content);
    assert.ok(result.content.includes("Anti-Redundancy"));
  });

  it("returns overlay content for valid name 'deep'", () => {
    const result = loadVerbosityOverlay(
      "deep",
      join(TMP, "templates", "verbosity")
    );
    assert.ok(result.content);
    assert.ok(result.content.includes("Anti-Redundancy"));
  });

  it("rejects names with forward slash before path construction and warns", () => {
    const result = loadVerbosityOverlay(
      "../etc/passwd",
      join(TMP, "templates", "verbosity")
    );
    assert.equal(result.content, null);
    assert.ok(result.warnings.length > 0);
    assert.ok(/invalid|reject|traversal|path separator/i.test(result.warnings[0]));
  });

  it("rejects names with backslash before path construction and warns", () => {
    const result = loadVerbosityOverlay(
      "..\\etc\\passwd",
      join(TMP, "templates", "verbosity")
    );
    assert.equal(result.content, null);
    assert.ok(result.warnings.length > 0);
  });

  it("rejects names containing .. before path construction and warns", () => {
    const result = loadVerbosityOverlay(
      "..terse",
      join(TMP, "templates", "verbosity")
    );
    assert.equal(result.content, null);
    assert.ok(result.warnings.length > 0);
  });

  it("rejects values outside the closed enumeration {terse,normal,deep} and warns", () => {
    const result = loadVerbosityOverlay(
      "loud",
      join(TMP, "templates", "verbosity")
    );
    assert.equal(result.content, null);
    assert.ok(result.warnings.length > 0);
    assert.ok(/terse|normal|deep/.test(result.warnings[0]));
  });

  it("falls back to normal.md when a valid name's file is missing", () => {
    rmSync(join(TMP, "templates", "verbosity", "deep.md"));
    const result = loadVerbosityOverlay(
      "deep",
      join(TMP, "templates", "verbosity")
    );
    assert.ok(result.content);
    assert.ok(result.content.includes("Verbosity: Normal"));
    assert.ok(result.warnings.length > 0);
    assert.ok(/missing|not found|fallback/i.test(result.warnings[0]));
  });

  it("returns empty string when both target and normal.md are missing", () => {
    rmSync(join(TMP, "templates", "verbosity", "deep.md"));
    rmSync(join(TMP, "templates", "verbosity", "normal.md"));
    const result = loadVerbosityOverlay(
      "deep",
      join(TMP, "templates", "verbosity")
    );
    assert.equal(result.content, "");
    assert.ok(result.warnings.length > 0);
  });

  it("returns empty string when verbosity dir is missing entirely", () => {
    const result = loadVerbosityOverlay(
      "terse",
      join(TMP, "no-such-verbosity-dir")
    );
    assert.equal(result.content, "");
    assert.ok(result.warnings.length > 0);
  });

  it("warning messages do not contain absolute filesystem paths", () => {
    const result = loadVerbosityOverlay(
      "nonexistent-valid-not",
      join(TMP, "templates", "verbosity")
    );
    for (const w of result.warnings) {
      assert.ok(!w.startsWith("/"), `Warning contains absolute path: ${w}`);
      assert.ok(!w.includes(TMP), `Warning contains temp dir path: ${w}`);
    }
  });
});

describe("parseUserConfig — verbosity key", () => {
  beforeEach(async () => {
    await loadModule();
    setup();
  });
  afterEach(cleanup);

  it("parses verbosity= line with a valid enum value", () => {
    const file = join(TMP, "config");
    writeFileSync(file, "persona=architect\nverbosity=terse\n");
    const result = parseUserConfig(file);
    assert.equal(result.verbosity, "terse");
  });

  it("rejects verbosity value containing path traversal (..) and discards it", () => {
    const file = join(TMP, "config");
    writeFileSync(file, "verbosity=../etc/passwd\n");
    const result = parseUserConfig(file);
    assert.equal(result.verbosity, undefined);
  });

  it("rejects verbosity value with forward slash and discards it", () => {
    const file = join(TMP, "config");
    writeFileSync(file, "verbosity=etc/passwd\n");
    const result = parseUserConfig(file);
    assert.equal(result.verbosity, undefined);
  });

  it("rejects verbosity value with backslash and discards it", () => {
    const file = join(TMP, "config");
    writeFileSync(file, "verbosity=etc\\\\passwd\n");
    const result = parseUserConfig(file);
    assert.equal(result.verbosity, undefined);
  });

  it("rejects verbosity value outside enum and discards it", () => {
    const file = join(TMP, "config");
    writeFileSync(file, "verbosity=loud\n");
    const result = parseUserConfig(file);
    assert.equal(result.verbosity, undefined);
  });
});

describe("resolvePersona — verbosity additive shape", () => {
  beforeEach(async () => {
    await loadModule();
    setup();
  });
  afterEach(cleanup);

  it("returns { name, source, verbosity, verbositySource } additively", () => {
    const result = resolvePersona({
      localConfigPath: join(TMP, "nonexistent-local"),
      globalConfigPath: join(TMP, "nonexistent-global"),
      templatesDir: join(TMP, "templates", "personas"),
      verbosityDir: join(TMP, "templates", "verbosity"),
    });
    assert.ok("name" in result);
    assert.ok("source" in result);
    assert.ok("verbosity" in result);
    assert.ok("verbositySource" in result);
  });

  it("returns existing { name, source } unchanged when verbosityDir is omitted (back-compat)", () => {
    const result = resolvePersona({
      localConfigPath: join(TMP, "nonexistent-local"),
      globalConfigPath: join(TMP, "nonexistent-global"),
      templatesDir: join(TMP, "templates", "personas"),
    });
    assert.equal(result.name, "developer");
    assert.equal(result.source, "fallback");
  });

  it("applies per-persona default architect → normal", () => {
    writeFileSync(join(TMP, "local-config"), "persona=architect\n");
    const result = resolvePersona({
      localConfigPath: join(TMP, "local-config"),
      globalConfigPath: join(TMP, "nonexistent"),
      templatesDir: join(TMP, "templates", "personas"),
      verbosityDir: join(TMP, "templates", "verbosity"),
    });
    assert.equal(result.verbosity, "normal");
    assert.equal(result.verbositySource, "default");
  });

  it("applies per-persona default developer → normal", () => {
    writeFileSync(join(TMP, "local-config"), "persona=developer\n");
    const result = resolvePersona({
      localConfigPath: join(TMP, "local-config"),
      globalConfigPath: join(TMP, "nonexistent"),
      templatesDir: join(TMP, "templates", "personas"),
      verbosityDir: join(TMP, "templates", "verbosity"),
    });
    assert.equal(result.verbosity, "normal");
    assert.equal(result.verbositySource, "default");
  });

  it("applies per-persona default product → terse", () => {
    writeFileSync(join(TMP, "local-config"), "persona=product\n");
    const result = resolvePersona({
      localConfigPath: join(TMP, "local-config"),
      globalConfigPath: join(TMP, "nonexistent"),
      templatesDir: join(TMP, "templates", "personas"),
      verbosityDir: join(TMP, "templates", "verbosity"),
    });
    assert.equal(result.verbosity, "terse");
    assert.equal(result.verbositySource, "default");
  });

  it("resolves verbosity from local config (highest layer)", () => {
    writeFileSync(join(TMP, "local-config"), "persona=architect\nverbosity=deep\n");
    writeFileSync(join(TMP, "global-config"), "verbosity=terse\n");
    const result = resolvePersona({
      localConfigPath: join(TMP, "local-config"),
      globalConfigPath: join(TMP, "global-config"),
      templatesDir: join(TMP, "templates", "personas"),
      verbosityDir: join(TMP, "templates", "verbosity"),
    });
    assert.equal(result.verbosity, "deep");
    assert.equal(result.verbositySource, "local");
  });

  it("resolves verbosity from global config when local absent", () => {
    writeFileSync(join(TMP, "global-config"), "persona=architect\nverbosity=terse\n");
    const result = resolvePersona({
      localConfigPath: join(TMP, "nonexistent-local"),
      globalConfigPath: join(TMP, "global-config"),
      templatesDir: join(TMP, "templates", "personas"),
      verbosityDir: join(TMP, "templates", "verbosity"),
    });
    assert.equal(result.verbosity, "terse");
    assert.equal(result.verbositySource, "global");
  });

  it("re-validates verbosity at resolve time and falls back to per-persona default on invalid", () => {
    // Bypass parseUserConfig validation by passing the value through verbosityFlag
    // (or simulate the case where invalid value somehow reaches resolvePersona).
    // In practice parseUserConfig discards it; verify the per-persona default applies.
    writeFileSync(join(TMP, "local-config"), "persona=architect\nverbosity=loud\n");
    const result = resolvePersona({
      localConfigPath: join(TMP, "local-config"),
      globalConfigPath: join(TMP, "nonexistent"),
      templatesDir: join(TMP, "templates", "personas"),
      verbosityDir: join(TMP, "templates", "verbosity"),
    });
    assert.equal(result.verbosity, "normal"); // per-persona default for architect
    assert.equal(result.verbositySource, "default");
  });

  it("accepts verbosityFlag override (highest precedence)", () => {
    writeFileSync(join(TMP, "local-config"), "persona=architect\nverbosity=terse\n");
    const result = resolvePersona({
      localConfigPath: join(TMP, "local-config"),
      globalConfigPath: join(TMP, "nonexistent"),
      templatesDir: join(TMP, "templates", "personas"),
      verbosityDir: join(TMP, "templates", "verbosity"),
      verbosityFlag: "deep",
    });
    assert.equal(result.verbosity, "deep");
    assert.equal(result.verbositySource, "flag");
  });

  it("rejects verbosityFlag with path traversal and falls back to default", () => {
    writeFileSync(join(TMP, "local-config"), "persona=architect\n");
    const result = resolvePersona({
      localConfigPath: join(TMP, "local-config"),
      globalConfigPath: join(TMP, "nonexistent"),
      templatesDir: join(TMP, "templates", "personas"),
      verbosityDir: join(TMP, "templates", "verbosity"),
      verbosityFlag: "../etc/passwd",
    });
    assert.equal(result.verbosity, "normal");
    assert.equal(result.verbositySource, "default");
    assert.ok(result.warnings.length > 0);
  });
});

// ============================================================================
// Task 7: 9-combo matrix, calibration invariants, Next-Actions invariant,
//   anti-redundancy invariants, no-hard-word-cap grep
// ============================================================================

import { readFileSync as _readFileSync, readdirSync as _readdirSync, existsSync as _existsSync } from "fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname_persona = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname_persona, "..");
const PERSONAS_DIR = join(PROJECT_ROOT, "templates", "personas");
const VERBOSITY_DIR = join(PROJECT_ROOT, "templates", "verbosity");
const FIXTURES_DIR = join(PROJECT_ROOT, "tests", "fixtures", "persona-output");
const PERSONA_LIST = ["architect", "developer", "product"];
const VERBOSITY_LIST = ["terse", "normal", "deep"];

describe("9-combo fixture matrix", () => {
  beforeEach(async () => {
    await loadModule();
  });

  for (const persona of PERSONA_LIST) {
    for (const verbosity of VERBOSITY_LIST) {
      it(`${persona}-${verbosity}: lib composition matches golden fixture byte-for-byte`, () => {
        const pd = loadPersonaDirective(persona, PERSONAS_DIR);
        const vo = loadVerbosityOverlay(verbosity, VERBOSITY_DIR);
        const composed = pd.content + "\n\n" + vo.content;
        const fixturePath = join(FIXTURES_DIR, `${persona}-${verbosity}.expected.md`);
        assert.ok(
          _existsSync(fixturePath),
          `Fixture missing: ${persona}-${verbosity}.expected.md`
        );
        const expected = _readFileSync(fixturePath, "utf-8");
        assert.equal(composed, expected);
      });
    }
  }

  // Next-Actions invariant across all 9 combos
  for (const persona of PERSONA_LIST) {
    for (const verbosity of VERBOSITY_LIST) {
      it(`${persona}-${verbosity}: fixture contains Next Actions dimension`, () => {
        const fixturePath = join(FIXTURES_DIR, `${persona}-${verbosity}.expected.md`);
        const content = _readFileSync(fixturePath, "utf-8");
        assert.ok(
          /Next Actions/.test(content),
          `Next Actions invariant violated for ${persona}-${verbosity}`
        );
      });
    }
  }

  // Anti-redundancy presence invariant across all 9 fixtures
  for (const persona of PERSONA_LIST) {
    for (const verbosity of VERBOSITY_LIST) {
      it(`${persona}-${verbosity}: fixture contains Anti-Redundancy paragraph`, () => {
        const fixturePath = join(FIXTURES_DIR, `${persona}-${verbosity}.expected.md`);
        const content = _readFileSync(fixturePath, "utf-8");
        assert.ok(
          /Anti-Redundancy/.test(content),
          `Anti-Redundancy invariant violated for ${persona}-${verbosity}`
        );
      });
    }
  }
});

describe("Architect template calibration", () => {
  it("per-dimension bullet sum lands in [19, 22]", () => {
    const content = _readFileSync(join(PERSONAS_DIR, "architect.md"), "utf-8");
    // Only count bullets that belong to a Dimension-level (### header) section
    // up to the Next-Actions / Anti-Redundancy boundary. The Anti-Redundancy
    // section uses paragraph form (no - bullets) so it contributes 0 regardless.
    const lines = content.split("\n");
    let currentDim = null;
    const perDim = {};
    for (const line of lines) {
      const m = line.match(/^### (.+)$/);
      if (m) {
        currentDim = m[1].trim();
        perDim[currentDim] = 0;
        continue;
      }
      if (currentDim && line.startsWith("- ")) {
        perDim[currentDim] += 1;
      }
    }
    const total = Object.values(perDim).reduce((a, b) => a + b, 0);
    assert.ok(
      total >= 19 && total <= 22,
      `Per-dimension bullet sum out of [19, 22]: ${total} (breakdown: ${JSON.stringify(perDim)})`
    );
  });

  it("Next Actions section retains 3 bullets (invariant)", () => {
    const content = _readFileSync(join(PERSONAS_DIR, "architect.md"), "utf-8");
    const lines = content.split("\n");
    let inNextActions = false;
    let bulletCount = 0;
    for (const line of lines) {
      const m = line.match(/^### (.+)$/);
      if (m) {
        inNextActions = m[1].trim() === "Next Actions";
        continue;
      }
      if (inNextActions && line.startsWith("- ")) bulletCount += 1;
    }
    assert.equal(bulletCount, 3, "Next Actions must keep 3 bullets (invariant)");
  });

  it("fixture-weighted total from persona-fixture-score.mjs lands in [58, 62]", () => {
    const result = spawnSync(
      "node",
      [join(PROJECT_ROOT, "scripts", "persona-fixture-score.mjs")],
      { encoding: "utf-8" }
    );
    assert.equal(result.status, 0, `script failed: ${result.stderr}`);
    const m = result.stdout.match(/Total bullets across fixtures:\s*architect\s*(\d+)/);
    assert.ok(m, "could not parse 'Total bullets across fixtures' for architect");
    const total = parseInt(m[1], 10);
    assert.ok(
      total >= 58 && total <= 62,
      `Fixture-weighted total out of [58, 62]: ${total}`
    );
  });
});

describe("Anti-redundancy invariants", () => {
  // 6 source templates: 3 personas + 3 verbosity overlays
  const ALL_TEMPLATES = [
    ...PERSONA_LIST.map((p) => join(PERSONAS_DIR, `${p}.md`)),
    ...VERBOSITY_LIST.map((v) => join(VERBOSITY_DIR, `${v}.md`)),
  ];

  for (const templatePath of ALL_TEMPLATES) {
    const label = templatePath.split("/").slice(-2).join("/");
    it(`${label}: contains anti-redundancy paragraph mentioning disk artifacts`, () => {
      const content = _readFileSync(templatePath, "utf-8");
      assert.ok(
        /\.review\.md|\.plan\.md|\.validate\.md|\.spec\.md|\.context-index\//.test(content),
        `${label}: missing disk-artifact reference in anti-redundancy paragraph`
      );
    });

    it(`${label}: anti-redundancy paragraph explicitly excludes Next Actions`, () => {
      const content = _readFileSync(templatePath, "utf-8");
      // The exclusion clause must mention "Next Actions" and "Exception" (or "except")
      assert.ok(
        /(Exception|except).*Next Actions|Next Actions.*(Exception|except)/is.test(content),
        `${label}: anti-redundancy paragraph missing Next-Actions exclusion`
      );
    });
  }
});

describe("No hard word caps", () => {
  it("no template uses literal '<N> words' or '<N>-word' patterns", () => {
    const ALL_TEMPLATES = [
      ..._readdirSync(PERSONAS_DIR).map((f) => join(PERSONAS_DIR, f)),
      ..._readdirSync(VERBOSITY_DIR).map((f) => join(VERBOSITY_DIR, f)),
    ].filter((f) => f.endsWith(".md"));
    const offenders = [];
    for (const t of ALL_TEMPLATES) {
      const content = _readFileSync(t, "utf-8");
      if (/\b\d+\s+words\b|\b\d+-word\b/i.test(content)) {
        offenders.push(t);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `Templates contain hard word caps (Anthropic April-2026 postmortem rule): ${offenders.join(", ")}`
    );
  });
});
