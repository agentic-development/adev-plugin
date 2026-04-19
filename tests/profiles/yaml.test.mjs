import { test, describe } from "node:test";
import { strict as assert } from "node:assert";

import { parseYaml, YamlParseError } from "../../lib/profiles/yaml.mjs";

describe("profiles/yaml", () => {
  test("parses a nested map", () => {
    const doc = parseYaml(`
a:
  b: 1
  c:
    d: hello
`);
    assert.deepEqual(doc, { a: { b: 1, c: { d: "hello" } } });
  });

  test("parses a list of flow maps", () => {
    const doc = parseYaml(`
items:
  - { category: filesystem-read }
  - { mcp_server: playwright }
  - { tool: Bash, allow_unportable: true }
`);
    assert.deepEqual(doc.items, [
      { category: "filesystem-read" },
      { mcp_server: "playwright" },
      { tool: "Bash", allow_unportable: true },
    ]);
  });

  test("parses bundled profiles shape", () => {
    const doc = parseYaml(`
profiles:
  read-only:
    description: Observer.
    permissions:
      tools:
        allow:
          - { category: filesystem-read }
          - { category: search }
      filesystem: { write: deny, execute: deny }
      network: deny
  browser-review:
    extends: read-only
    permissions:
      tools:
        allow_add:
          - { mcp_server: playwright }
      network: read-only
`);
    assert.equal(doc.profiles["read-only"].description, "Observer.");
    assert.equal(doc.profiles["read-only"].permissions.tools.allow[1].category, "search");
    assert.equal(doc.profiles["read-only"].permissions.filesystem.write, "deny");
    assert.equal(doc.profiles["read-only"].permissions.network, "deny");
    assert.equal(doc.profiles["browser-review"].extends, "read-only");
    assert.equal(doc.profiles["browser-review"].permissions.tools.allow_add[0].mcp_server, "playwright");
    assert.equal(doc.profiles["browser-review"].permissions.network, "read-only");
  });

  test("ignores comments and blank lines", () => {
    const doc = parseYaml(`
# top-level comment
a: 1

# another
b:
  # nested
  c: 2
`);
    assert.deepEqual(doc, { a: 1, b: { c: 2 } });
  });

  test("preserves '#' inside quoted strings", () => {
    const doc = parseYaml(`a: "hello # not a comment"`);
    assert.equal(doc.a, "hello # not a comment");
  });

  test("throws YamlParseError with line number on malformed input", () => {
    assert.throws(
      () => parseYaml(`a\n- b`),
      (err) => err instanceof YamlParseError && err.line === 1
    );
  });
});
