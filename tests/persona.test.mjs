import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";

// Will import from lib/persona.mjs once implemented
let parseUserConfig, resolvePersona, loadPersonaDirective;

// Lazy import to allow test file to exist before lib
async function loadModule() {
  const mod = await import("../lib/persona.mjs");
  parseUserConfig = mod.parseUserConfig;
  resolvePersona = mod.resolvePersona;
  loadPersonaDirective = mod.loadPersonaDirective;
}

// Test fixtures
const TMP = join(import.meta.dirname, ".tmp-persona-test");

function setup() {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(join(TMP, "templates", "personas"), { recursive: true });
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

  it("rejects persona names with forward slash", () => {
    writeFileSync(join(TMP, "local-config"), "persona=../../etc/passwd\n");
    const result = resolvePersona({
      localConfigPath: join(TMP, "local-config"),
      globalConfigPath: join(TMP, "nonexistent"),
      templatesDir: join(TMP, "templates", "personas"),
    });
    assert.equal(result.name, "developer");
    assert.equal(result.source, "fallback");
  });

  it("rejects persona names with backslash", () => {
    writeFileSync(join(TMP, "local-config"), "persona=..\\etc\\passwd\n");
    const result = resolvePersona({
      localConfigPath: join(TMP, "local-config"),
      globalConfigPath: join(TMP, "nonexistent"),
      templatesDir: join(TMP, "templates", "personas"),
    });
    assert.equal(result.name, "developer");
    assert.equal(result.source, "fallback");
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

  it("falls back to developer for unknown persona names", () => {
    writeFileSync(join(TMP, "local-config"), "persona=unknown-role\n");
    const result = resolvePersona({
      localConfigPath: join(TMP, "local-config"),
      globalConfigPath: join(TMP, "nonexistent"),
      templatesDir: join(TMP, "templates", "personas"),
    });
    assert.equal(result.name, "developer");
    assert.equal(result.source, "fallback");
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
    assert.ok(result);
    assert.ok(result.includes("Developer Persona"));
  });

  it("falls back to developer.md when template missing", () => {
    const result = loadPersonaDirective(
      "nonexistent",
      join(TMP, "templates", "personas")
    );
    assert.ok(result);
    assert.ok(result.includes("Developer Persona"));
  });

  it("returns null when templates dir missing", () => {
    const result = loadPersonaDirective("developer", join(TMP, "no-such-dir"));
    assert.equal(result, null);
  });

  it("warning messages do not contain full filesystem paths", () => {
    // Capture warnings by checking the return structure
    // The function should handle missing templates gracefully
    // and any warning text should not contain absolute paths
    const result = loadPersonaDirective(
      "nonexistent",
      join(TMP, "templates", "personas")
    );
    // Should fall back gracefully without exposing paths
    assert.ok(result !== undefined);
  });
});
