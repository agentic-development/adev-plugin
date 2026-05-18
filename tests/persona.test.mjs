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
