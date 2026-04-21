import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";

let parseUserConfig, resolvePersona, loadPersonaDirective;

async function loadModule() {
  const mod = await import("../lib/persona.mjs");
  parseUserConfig = mod.parseUserConfig;
  resolvePersona = mod.resolvePersona;
  loadPersonaDirective = mod.loadPersonaDirective;
}

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
